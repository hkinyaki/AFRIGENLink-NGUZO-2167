import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, desc, eq, inArray } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./database";
import {
  profile,
  assets,
  contracts,
  parts,
  partOrders,
  complianceItems,
  inspections,
  borderLogs,
  cargoLoads,
  loadBids,
  invoices,
  contactMessages,
  tenders,
  bids,
  documents,
  messages,
  activityEvents,
  notifications,
  extensions,
  staffRequests,
  kybDocuments,
} from "./database/schema";
import { user as authUser } from "./database/auth-schema";
import { authMiddleware, requireAuth, requireRole } from "./middleware/auth";
import { id, manifestRef, nextUserCode } from "./lib/ids";
import { checklistFor, evaluateBreakdown, runSettlement, computeAmountToFund, CLIENT_FEE_RATE } from "./lib/engine";
import { presignPut, presignGet } from "./lib/s3";
import { computeAward } from "./lib/award";
import { isNextStage, STAGE_ACTOR, STAGE_LABEL } from "./lib/stages";
import { logEvent, logNotification, notifyMany } from "./lib/events";
import {
  corsOrigin,
  securityHeaders,
  rateLimit,
  isAllowedUpload,
} from "./lib/security";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Add N days to an ISO YYYY-MM-DD date, return ISO YYYY-MM-DD. */
function addDays(iso: string, days: number): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const isAllowlistedAdmin = (email?: string | null) =>
  !!email && ADMIN_EMAILS.includes(email.toLowerCase());

type Vars = {
  user: { id: string; email: string; name: string } | null;
  session: unknown;
  profile: typeof profile.$inferSelect | null;
};

type Prof = typeof profile.$inferSelect;

/**
 * Auto-assign a KAM (key account manager) to a supplier/parts profile using a
 * simple load-balanced round-robin (the KAM with the fewest assigned accounts).
 * No-op if there are no KAMs yet or the profile already has a manager.
 */
async function autoAssignKam(profileId: string): Promise<void> {
  const [target] = await db.select().from(profile).where(eq(profile.id, profileId)).limit(1);
  if (!target || target.managerId) return;
  const kams = await db.select().from(profile).where(eq(profile.role, "key_account"));
  if (!kams.length) return;
  // count current load per KAM
  const all = await db.select({ managerId: profile.managerId }).from(profile);
  const load = new Map<string, number>(kams.map((k) => [k.id, 0]));
  for (const r of all) if (r.managerId && load.has(r.managerId)) load.set(r.managerId, (load.get(r.managerId) ?? 0) + 1);
  const chosen = [...load.entries()].sort((a, b) => a[1] - b[1])[0][0];
  await db.update(profile).set({ managerId: chosen }).where(eq(profile.id, profileId));
  await logNotification({ recipientProfileId: chosen, subject: "New account assigned to you", body: `${target.companyName || target.fullName || "A new partner"} (${target.userCode}) has been assigned to you. Please reach out and begin onboarding.` });
}

/** Can this profile read/post on a tender? (client owner, awarded supplier, field, or admin) */
async function canAccessTender(tenderId: string, p: Prof): Promise<boolean> {
  if (p.role === "admin" || p.role === "field" || p.role === "key_account") return true;
  const [tender] = await db.select().from(tenders).where(eq(tenders.id, tenderId)).limit(1);
  if (!tender) return false;
  if (p.role === "client") return tender.clientId === p.id;
  if (p.role === "supplier") {
    const mine = await db
      .select()
      .from(contracts)
      .where(and(eq(contracts.tenderId, tenderId), eq(contracts.supplierId, p.id)))
      .limit(1);
    if (mine[0]) return true;
    // during bidding any supplier can view/message
    return tender.tenderStage === "Bidding";
  }
  return false;
}

/**
 * Advance a tender to `target` stage — strict gate. Validates the requesting
 * role is the expected actor for the CURRENT stage and that target is exactly
 * next. Writes an activity event + notifies the parties.
 */
async function advanceStage(c: import("hono").Context<{ Variables: Vars }>, target: string) {
  const tid = c.req.param("id");
  const p = c.get("profile")! as Prof;
  const [tender] = await db.select().from(tenders).where(eq(tenders.id, tid)).limit(1);
  if (!tender) return c.json({ error: "Tender not found" }, 404);

  const current = tender.tenderStage;
  if (!isNextStage(current, target)) {
    return c.json({ error: `Cannot move from "${current}" to "${target}". Steps must be completed in order.` }, 400);
  }
  const expectedActor = STAGE_ACTOR[current as keyof typeof STAGE_ACTOR];
  // admin is a superset of key_account; both satisfy an "admin" expected actor.
  const actorOk =
    expectedActor === "none" ||
    expectedActor === p.role ||
    (expectedActor === "admin" && (p.role === "admin" || p.role === "key_account"));
  if (!actorOk) {
    return c.json({ error: `This step is actioned by the ${expectedActor}, not the ${p.role}.` }, 403);
  }

  // client-only: confirm access; supplier must be an awarded party
  const access = await canAccessTender(tid, p);
  if (!access) return c.json({ error: "Forbidden" }, 403);

  await db.update(tenders).set({ tenderStage: target }).where(eq(tenders.id, tid));

  // keep per-supplier contract sub-stage roughly in sync for execution view
  if (target === "Executing") {
    await db.update(contracts).set({ contractStage: "Executing" }).where(eq(contracts.tenderId, tid));
    await db.update(tenders).set({ status: "Executing" }).where(eq(tenders.id, tid));
  }
  if (target === "AgreementsSigned") {
    await db.update(contracts).set({ contractStage: "AgreementSigned" }).where(eq(contracts.tenderId, tid));
  }
  // TT proof uploaded = real funding step. Preview funds as held-in-escrow by Nguzo.
  // Escrow balance = base contract value + 5% client fee (what the client funds).
  if (target === "TTUploaded") {
    const fundContracts = await db.select().from(contracts).where(eq(contracts.tenderId, tid));
    for (const ct of fundContracts) {
      const base = ct.contractValueTzs || ct.unitsAwarded * ct.agreedPricePerUnitTzs;
      const fund = computeAmountToFund(base);
      await db
        .update(contracts)
        .set({ totalEscrowBalanceTzs: fund.amountToFundTzs, milestoneStatus: "ActiveTransit" })
        .where(eq(contracts.id, ct.id));
    }
  }

  const label = STAGE_LABEL[target as keyof typeof STAGE_LABEL] ?? target;
  await logEvent({ tenderId: tid, actorProfileId: p.id, type: "stage.advance", summary: `${p.companyName || p.role} → ${label}.`, meta: { from: current, to: target } });

  // notify the relevant parties: client + all awarded suppliers
  const tContracts = await db.select().from(contracts).where(eq(contracts.tenderId, tid));
  const recipients = [tender.clientId, ...tContracts.map((x) => x.supplierId)];
  await notifyMany(recipients, { tenderId: tid, subject: `Job update: ${label}`, body: `"${tender.title}" advanced to: ${label}.` });

  return c.json({ ok: true, stage: target, stageLabel: label }, 200);
}

const app = new Hono<{ Variables: Vars }>()
  .use(securityHeaders)
  .use(cors({ origin: (origin) => corsOrigin(origin), credentials: true, exposeHeaders: ["set-auth-token"] }))
  .use("/api/auth/*", rateLimit({ windowMs: 60_000, max: 30, bucket: "auth" }))
  .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
  .basePath("api")
  .use(authMiddleware)
  .get("/health", (c) => c.json({ status: "ok" }, 200))

  // ---- profile / me ----
  .get("/me", requireAuth, async (c) => {
    const user = c.get("user")!;
    let p = c.get("profile");
    if (!p) {
      const allowAdmin = isAllowlistedAdmin(user.email);
      const role = allowAdmin ? "admin" : "client";
      const newP = {
        id: id("prof"),
        userId: user.id,
        role,
        userCode: await nextUserCode(role),
        companyName: user.name || "",
        fullName: user.name || "",
        // Allowlisted super-admin is born Verified + already onboarded; everyone
        // else starts at PendingOnboarding and must complete the KYC/KYB gate.
        verificationStatus: allowAdmin ? "Verified" : "PendingOnboarding",
        onboardingComplete: allowAdmin,
        physicalVerificationNotes: "",
        phone: "",
        createdAt: new Date(),
      };
      await db.insert(profile).values(newP);
      p = newP as typeof profile.$inferSelect;
    } else if (isAllowlistedAdmin(user.email) && p.role !== "admin") {
      // Bootstrap super-admin from secret env allowlist on every login.
      await db
        .update(profile)
        .set({ role: "admin", verificationStatus: "Verified", onboardingComplete: true })
        .where(eq(profile.id, p.id));
      p = { ...p, role: "admin", verificationStatus: "Verified", onboardingComplete: true };
    }
    // Backfill a User ID for any legacy row missing one.
    if (p && !p.userCode) {
      const code = await nextUserCode(p.role);
      await db.update(profile).set({ userCode: code }).where(eq(profile.id, p.id));
      p = { ...p, userCode: code };
    }
    return c.json({ user, profile: p }, 200);
  })
  .post("/me/role", requireAuth, async (c) => {
    const user = c.get("user")!;
    const body = await c.req.json<{ role: string; companyName?: string; phone?: string }>();
    // Self-service onboarding can only ever set client, supplier, or parts_supplier.
    // admin/field/key_account are internal — granted via env allowlist or in-app promotion only.
    if (!["client", "supplier", "parts_supplier"].includes(body.role)) {
      return c.json({ error: "Forbidden: that role cannot be self-assigned." }, 403);
    }
    const role = body.role;
    const existing = c.get("profile");
    if (existing) {
      // Never let an allowlisted admin or an existing admin/field downgrade via this endpoint.
      if (isAllowlistedAdmin(user.email) || existing.role === "admin" || existing.role === "field") {
        return c.json({ error: "Forbidden: staff roles are managed by an administrator." }, 403);
      }
      await db
        .update(profile)
        .set({ role, companyName: body.companyName ?? existing.companyName, phone: body.phone ?? existing.phone })
        .where(eq(profile.id, existing.id));
      if ((role === "supplier" || role === "parts_supplier") && !existing.managerId) await autoAssignKam(existing.id);
      return c.json({ ok: true }, 200);
    }
    const finalRole = isAllowlistedAdmin(user.email) ? "admin" : role;
    const isAdmin = isAllowlistedAdmin(user.email);
    const newPid = id("prof");
    await db.insert(profile).values({
      id: newPid,
      userId: user.id,
      role: finalRole,
      userCode: await nextUserCode(finalRole),
      companyName: body.companyName ?? user.name ?? "",
      fullName: user.name ?? "",
      verificationStatus: isAdmin ? "Verified" : "PendingOnboarding",
      onboardingComplete: isAdmin,
      phone: body.phone ?? "",
    });
    // Suppliers (incl. parts) get a KAM auto-assigned (round-robin) on registration.
    if (finalRole === "supplier" || finalRole === "parts_supplier") await autoAssignKam(newPid);
    return c.json({ ok: true }, 200);
  })
  // self profile update — banking (supplier), personal details + photo (field/all)
  .post("/profile", requireAuth, async (c) => {
    const p = c.get("profile")!;
    const b = await c.req.json<Partial<typeof profile.$inferInsert>>();
    const patch: Record<string, unknown> = {};
    // anyone may update their own contact + personal fields
    for (const k of ["companyName", "phone", "fullName", "photoKey"] as const) {
      if (b[k] !== undefined) patch[k] = b[k];
    }
    // supplier banking
    if (p.role === "supplier") {
      for (const k of ["bankName", "bankAccountName", "bankAccountNo", "bankSwift", "bankBranch"] as const) {
        if (b[k] !== undefined) patch[k] = b[k];
      }
    }
    if (Object.keys(patch).length) await db.update(profile).set(patch).where(eq(profile.id, p.id));
    return c.json({ ok: true }, 200);
  })

  // ============================================================
  //  ONBOARDING — forced KYC / KYB gate (blocks live work)
  // ============================================================
  // Read current onboarding state + any KYB documents already uploaded.
  .get("/onboarding", requireAuth, async (c) => {
    const p = c.get("profile")!;
    const docs = await db.select().from(kybDocuments).where(eq(kybDocuments.profileId, p.id));
    const withUrls = await Promise.all(docs.map(async (d) => ({ ...d, url: d.fileKey ? await presignGet(d.fileKey) : "" })));
    return c.json({ profile: p, kybDocuments: withUrls }, 200);
  })
  // Save / submit onboarding. Role-aware:
  //  staff (field/kam/admin) = KYC only (face + national ID + contacts)
  //  external (client/supplier/parts) = authoriser + company + KYB docs (+ assets handled separately)
  .post("/onboarding", requireAuth, async (c) => {
    const p = c.get("profile")!;
    const b = await c.req.json<{
      // KYC
      fullName?: string; phone?: string; nationalId?: string; nationalIdDocKey?: string; faceImageKey?: string;
      // external authoriser
      authoriserName?: string; authoriserTitle?: string; authoriserPhone?: string;
      address?: string;
      // company / KYB
      companyName?: string; companyRegNo?: string; companyTin?: string; companySector?: string;
      // banking (suppliers)
      bankName?: string; bankAccountName?: string; bankAccountNo?: string; bankSwift?: string; bankBranch?: string;
      // KYB documents to record (already uploaded to storage)
      documents?: { kind: string; label?: string; fileKey: string }[];
      step?: string;
      submit?: boolean;
    }>();
    const patch: Record<string, unknown> = {};
    const strFields = [
      "fullName", "phone", "nationalId", "nationalIdDocKey", "faceImageKey",
      "authoriserName", "authoriserTitle", "authoriserPhone", "address",
      "companyName", "companyRegNo", "companyTin", "companySector",
      "bankName", "bankAccountName", "bankAccountNo", "bankSwift", "bankBranch",
    ] as const;
    for (const k of strFields) if (b[k] !== undefined) patch[k] = String(b[k]).slice(0, 400);
    if (b.step) patch.onboardingStep = String(b.step).slice(0, 60);

    // record any new KYB documents
    if (Array.isArray(b.documents)) {
      for (const d of b.documents) {
        if (!d.fileKey) continue;
        await db.insert(kybDocuments).values({
          id: id("kyb"), profileId: p.id,
          kind: (d.kind || "Other").slice(0, 40), label: (d.label || "").slice(0, 120), fileKey: d.fileKey,
        });
      }
    }

    if (b.submit) {
      patch.onboardingComplete = true;
      // Clients = remote review; suppliers/parts = mandatory site visit.
      patch.verificationStatus = "Submitted";
      // notify admins + (if assigned) the KAM
      const admins = await db.select().from(profile).where(eq(profile.role, "admin"));
      const recips = admins.map((a) => a.id);
      if (p.managerId) recips.push(p.managerId);
      await notifyMany(recips, { subject: "New account ready for verification", body: `${patch.companyName || p.companyName || p.fullName || "An account"} (${p.userCode}, ${p.role}) submitted onboarding and is awaiting verification.` });
    }
    if (Object.keys(patch).length) await db.update(profile).set(patch).where(eq(profile.id, p.id));
    const updated = (await db.select().from(profile).where(eq(profile.id, p.id)).limit(1))[0];
    return c.json({ ok: true, profile: updated }, 200);
  })

  // ---- self: change password (clears forced-change flag) ----
  .post("/me/password", requireAuth, rateLimit({ windowMs: 60_000, max: 10, bucket: "pwd" }), async (c) => {
    const p = c.get("profile")!;
    const b = await c.req.json<{ currentPassword: string; newPassword: string }>();
    if (!b.newPassword || b.newPassword.length < 8) return c.json({ error: "New password must be at least 8 characters." }, 400);
    try {
      await auth.api.changePassword({
        headers: c.req.raw.headers,
        body: { currentPassword: b.currentPassword, newPassword: b.newPassword, revokeOtherSessions: true },
      });
    } catch (e) {
      return c.json({ error: "Could not change password: " + (e as Error).message }, 400);
    }
    await db.update(profile).set({ mustChangePassword: false }).where(eq(profile.id, p.id));
    return c.json({ ok: true }, 200);
  })
  // ---- self: edit profile (name / phone / photo) — used by admin & all roles ----
  .post("/me/profile", requireAuth, async (c) => {
    const p = c.get("profile")!;
    const b = await c.req.json<{ fullName?: string; companyName?: string; phone?: string; photoKey?: string }>();
    const patch: Record<string, unknown> = {};
    for (const k of ["fullName", "companyName", "phone", "photoKey"] as const) if (b[k] !== undefined) patch[k] = String(b[k]).slice(0, 300);
    if (Object.keys(patch).length) await db.update(profile).set(patch).where(eq(profile.id, p.id));
    return c.json({ ok: true }, 200);
  })

  // ============================================================
  //  ADMIN — assignment & field-station control
  // ============================================================
  .post("/admin/assign-kam/:profileId", requireAuth, requireRole("admin"), async (c) => {
    const pid = c.req.param("profileId");
    const b = await c.req.json<{ kamId: string }>();
    const [target] = await db.select().from(profile).where(eq(profile.id, pid)).limit(1);
    if (!target) return c.json({ error: "Account not found." }, 404);
    if (!["supplier", "parts_supplier", "field"].includes(target.role)) return c.json({ error: "Only suppliers, parts suppliers and field agents have a KAM." }, 400);
    const [kam] = await db.select().from(profile).where(eq(profile.id, b.kamId)).limit(1);
    if (!kam || kam.role !== "key_account") return c.json({ error: "Choose a valid Key Account Manager." }, 400);
    await db.update(profile).set({ managerId: b.kamId }).where(eq(profile.id, pid));
    await logNotification({ recipientProfileId: b.kamId, subject: "Account assigned to you", body: `${target.companyName || target.fullName} (${target.userCode}) is now assigned to you.` });
    return c.json({ ok: true }, 200);
  })
  .post("/admin/field/:profileId/station", requireAuth, requireRole("admin"), async (c) => {
    const pid = c.req.param("profileId");
    const b = await c.req.json<{ station: string }>();
    if (!["yard", "border"].includes(b.station)) return c.json({ error: "Station must be 'yard' or 'border'." }, 400);
    const [target] = await db.select().from(profile).where(eq(profile.id, pid)).limit(1);
    if (!target || target.role !== "field") return c.json({ error: "Field agent not found." }, 404);
    await db.update(profile).set({ fieldStation: b.station }).where(eq(profile.id, pid));
    await logNotification({ recipientProfileId: pid, subject: "Station assignment", body: `You are now assigned to the ${b.station === "yard" ? "Yard Audit" : "Border Liaison"} station.` });
    return c.json({ ok: true }, 200);
  })
  // List KAMs (for assignment dropdowns)
  .get("/admin/kams", requireAuth, requireRole("admin"), async (c) => {
    const rows = await db.select({ id: profile.id, fullName: profile.fullName, companyName: profile.companyName, userCode: profile.userCode }).from(profile).where(eq(profile.role, "key_account"));
    return c.json({ kams: rows }, 200);
  })

  // ============================================================
  //  KAM — strictly scoped to assigned accounts
  // ============================================================
  .get("/kam/clients", requireAuth, requireRole("key_account", "admin"), async (c) => {
    const me = c.get("profile")!;
    // admin can pass ?kamId to inspect a KAM's book; KAM only sees their own
    const kamId = me.role === "admin" ? (c.req.query("kamId") || me.id) : me.id;
    const rows = await db.select().from(profile).where(and(inArray(profile.role, ["supplier", "parts_supplier"]), eq(profile.managerId, kamId)));
    const withEmail = await Promise.all(rows.map(async (r) => {
      const [u] = await db.select().from(authUser).where(eq(authUser.id, r.userId)).limit(1);
      return { ...r, email: u?.email ?? "" };
    }));
    return c.json({ clients: withEmail }, 200);
  })

  // ============================================================
  //  FIELD — masked-contact inspections + reveal (logged)
  // ============================================================
  .get("/field/inspections", requireAuth, requireRole("field", "admin"), async (c) => {
    const me = c.get("profile")!;
    // a field agent only ever sees inspections assigned to them
    const rows = me.role === "admin"
      ? await db.select().from(inspections).orderBy(desc(inspections.createdAt))
      : await db.select().from(inspections).where(eq(inspections.assignedFieldId, me.id)).orderBy(desc(inspections.createdAt));
    // attach supplier name but MASK contact unless revealed (logged on reveal)
    const out = await Promise.all(rows.map(async (r) => {
      let supplierName = "", supplierCode = "", contactMasked = "";
      if (r.supplierId) {
        const [s] = await db.select().from(profile).where(eq(profile.id, r.supplierId)).limit(1);
        if (s) { supplierName = s.companyName || s.fullName; supplierCode = s.userCode ?? ""; contactMasked = (s.phone || "").replace(/.(?=.{2})/g, "•"); }
      }
      return { ...r, supplierName, supplierCode, contactMasked };
    }));
    return c.json({ inspections: out }, 200);
  })
  .post("/field/inspection/:id/reveal-contact", requireAuth, requireRole("field"), async (c) => {
    const iid = c.req.param("id");
    const me = c.get("profile")!;
    const [insp] = await db.select().from(inspections).where(eq(inspections.id, iid)).limit(1);
    if (!insp) return c.json({ error: "Inspection not found." }, 404);
    // only the ASSIGNED field agent may reveal, and only on an assigned inspection
    if (insp.assignedFieldId !== me.id) return c.json({ error: "Forbidden — this inspection is not assigned to you." }, 403);
    if (!insp.supplierId) return c.json({ error: "No supplier linked to this inspection." }, 400);
    const [s] = await db.select().from(profile).where(eq(profile.id, insp.supplierId)).limit(1);
    if (!s) return c.json({ error: "Supplier not found." }, 404);
    // KAM-first rule: a supplier cannot be field-inspected before a KAM owns them
    if (!s.managerId) return c.json({ error: "This supplier has no Key Account Manager yet. A KAM must own the relationship before a yard audit." }, 409);
    await logEvent({ actorProfileId: me.id, type: "contact_revealed", summary: `${me.fullName || "Field agent"} revealed contact for ${s.companyName || s.fullName} (${s.userCode}).`, meta: { supplierId: s.id, inspectionId: iid } });
    return c.json({ phone: s.phone || "", name: s.companyName || s.fullName }, 200);
  })
  // ---- public-ish: a single profile (contact card) — scoped ----
  .get("/profile/:profileId", requireAuth, async (c) => {
    const me = c.get("profile")!;
    const pid = c.req.param("profileId");
    const [row] = await db.select().from(profile).where(eq(profile.id, pid)).limit(1);
    if (!row) return c.json({ error: "Not found" }, 404);
    // admins see everything; KAM sees their assigned book; a supplier may see their own KAM
    const allowed =
      me.role === "admin" ||
      (me.role === "key_account" && row.managerId === me.id) ||
      (row.role === "key_account" && me.managerId === row.id) ||
      me.id === row.id;
    if (!allowed) return c.json({ error: "Forbidden" }, 403);
    const photoUrl = row.photoKey ? await presignGet(row.photoKey) : "";
    return c.json({ profile: { id: row.id, role: row.role, userCode: row.userCode, fullName: row.fullName, companyName: row.companyName, phone: row.phone, photoUrl, verificationStatus: row.verificationStatus } }, 200);
  })

  // ---- assets ----
  .get("/assets", requireAuth, async (c) => {
    const p = c.get("profile")!;
    const mine = c.req.query("mine");
    let rows;
    if (mine === "1" && p.role === "supplier") {
      rows = await db.select().from(assets).where(eq(assets.supplierId, p.id)).orderBy(desc(assets.createdAt));
    } else {
      rows = await db.select().from(assets).orderBy(desc(assets.createdAt));
    }
    return c.json({ assets: rows }, 200);
  })
  .post("/assets", requireAuth, requireRole("supplier"), async (c) => {
    const p = c.get("profile")!;
    const b = await c.req.json<Partial<typeof assets.$inferInsert>>();
    const row = {
      id: id("asset"),
      supplierId: p.id,
      assetType: b.assetType ?? "Excavator",
      manufacturer: b.manufacturer ?? "",
      model: b.model ?? "",
      vinChassis: b.vinChassis ?? "",
      engineSerial: b.engineSerial ?? "",
      dayRateTzs: b.dayRateTzs ?? 0,
      operationalStatus: b.operationalStatus ?? "Available",
      yardLocation: b.yardLocation ?? "",
      photos: b.photos ?? [],
    };
    await db.insert(assets).values(row);
    return c.json({ asset: row }, 200);
  })
  .post("/assets/:id/status", requireAuth, async (c) => {
    const assetId = c.req.param("id");
    const b = await c.req.json<{ operationalStatus: string }>();
    await db.update(assets).set({ operationalStatus: b.operationalStatus }).where(eq(assets.id, assetId));
    return c.json({ ok: true }, 200);
  })

  // ---- contracts ----
  .get("/contracts", requireAuth, async (c) => {
    const p = c.get("profile")!;
    let rows;
    if (p.role === "client") rows = await db.select().from(contracts).where(eq(contracts.clientId, p.id)).orderBy(desc(contracts.createdAt));
    else if (p.role === "supplier") rows = await db.select().from(contracts).where(eq(contracts.supplierId, p.id)).orderBy(desc(contracts.createdAt));
    else rows = await db.select().from(contracts).orderBy(desc(contracts.createdAt));
    return c.json({ contracts: rows }, 200);
  })
  .get("/contracts/:id", requireAuth, async (c) => {
    const cid = c.req.param("id");
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ message: "Not found" }, 404);
    const [asset] = await db.select().from(assets).where(eq(assets.id, contract.assetId)).limit(1);
    const compliance = await db.select().from(complianceItems).where(eq(complianceItems.contractId, cid));
    const orders = await db.select().from(partOrders).where(eq(partOrders.contractId, cid)).orderBy(desc(partOrders.createdAt));
    const invs = await db.select().from(invoices).where(eq(invoices.contractId, cid));
    const [supplier] = await db.select().from(profile).where(eq(profile.id, contract.supplierId)).limit(1);
    const [client] = await db.select().from(profile).where(eq(profile.id, contract.clientId)).limit(1);
    return c.json({ contract, asset, compliance, orders, invoices: invs, supplier, client }, 200);
  })
  .post("/contracts", requireAuth, requireRole("client"), async (c) => {
    const p = c.get("profile")!;
    const b = await c.req.json<{
      assetId: string;
      title?: string;
      routeClassification: "Domestic" | "CrossBorder";
      origin: string;
      destination: string;
      escrowTzs: number;
    }>();
    const [asset] = await db.select().from(assets).where(eq(assets.id, b.assetId)).limit(1);
    if (!asset) return c.json({ message: "Asset not found" }, 404);
    const cid = id("ctr");
    const route = b.routeClassification === "CrossBorder" ? "CrossBorder" : "Domestic";
    await db.insert(contracts).values({
      id: cid,
      clientId: p.id,
      supplierId: asset.supplierId,
      assetId: asset.id,
      title: b.title ?? `${asset.assetType} — ${b.origin} → ${b.destination}`,
      routeClassification: route,
      origin: b.origin,
      destination: b.destination,
      totalEscrowBalanceTzs: 0,
      emergencyCreditDeductedTzs: 0,
      milestoneStatus: "AwaitingEscrowDeposit",
    });
    // seed compliance checklist by route
    const items = checklistFor(route).map((permitType) => ({
      id: id("comp"),
      contractId: cid,
      permitType,
      verificationStatus: "Pending",
    }));
    if (items.length) await db.insert(complianceItems).values(items);
    return c.json({ contractId: cid }, 200);
  })
  // change route → reconfigure compliance checklist
  .post("/contracts/:id/route", requireAuth, async (c) => {
    const cid = c.req.param("id");
    const b = await c.req.json<{ routeClassification: "Domestic" | "CrossBorder" }>();
    const route = b.routeClassification === "CrossBorder" ? "CrossBorder" : "Domestic";
    await db.update(contracts).set({ routeClassification: route }).where(eq(contracts.id, cid));
    await db.delete(complianceItems).where(eq(complianceItems.contractId, cid));
    const items = checklistFor(route).map((permitType) => ({
      id: id("comp"),
      contractId: cid,
      permitType,
      verificationStatus: "Pending",
    }));
    if (items.length) await db.insert(complianceItems).values(items);
    return c.json({ ok: true }, 200);
  })
  // simulated escrow deposit → locks balance, moves asset Active
  .post("/contracts/:id/fund-escrow", requireAuth, requireRole("client"), async (c) => {
    const cid = c.req.param("id");
    const b = await c.req.json<{ amountTzs: number }>();
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ message: "Not found" }, 404);
    await db
      .update(contracts)
      .set({ totalEscrowBalanceTzs: b.amountTzs, milestoneStatus: "ActiveTransit" })
      .where(eq(contracts.id, cid));
    await db.update(assets).set({ operationalStatus: "Active" }).where(eq(assets.id, contract.assetId));
    return c.json({ ok: true }, 200);
  })
  // client sign-off → opens the human-approved payout chain (NO silent disburse)
  .post("/contracts/:id/sign-off", requireAuth, requireRole("client"), async (c) => {
    const cid = c.req.param("id");
    const p = c.get("profile")!;
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ message: "Not found" }, 404);
    if (contract.clientId !== p.id) return c.json({ error: "Forbidden" }, 403);
    if (contract.milestoneStatus === "FundsDisbursed") return c.json({ message: "Already disbursed" }, 400);
    if (contract.payoutStatus === "AwaitingSupplierApproval") return c.json({ message: "Payout already in progress" }, 400);

    await db
      .update(contracts)
      .set({ signedOffAt: new Date(), payoutStatus: "AwaitingSupplierApproval", milestoneStatus: "SignedOff" })
      .where(eq(contracts.id, cid));
    if (contract.assetId) await db.update(assets).set({ operationalStatus: "Available" }).where(eq(assets.id, contract.assetId));

    await logEvent({ contractId: cid, tenderId: contract.tenderId ?? "", actorProfileId: p.id, type: "contract.signoff", summary: `Client signed off "${contract.title}". Payout pending KAM processing.` });
    // notify all KAMs + admins to process the payout
    const staff = await db.select().from(profile).where(inArray(profile.role, ["key_account", "admin"]));
    await notifyMany(staff.map((s) => s.id), {
      tenderId: contract.tenderId ?? "",
      subject: "Sign-off received — process payout",
      body: `Client signed off "${contract.title}". Review the supplier bank details and upload the TT slip to release payment.`,
    });
    return c.json({ ok: true }, 200);
  })
  // KAM/Admin: view supplier bank details + payout state for a contract
  .get("/contracts/:id/payout", requireAuth, async (c) => {
    const cid = c.req.param("id");
    const p = c.get("profile")!;
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ message: "Not found" }, 404);
    // only KAM/admin/owning supplier may read
    const isStaff = p.role === "key_account" || p.role === "admin";
    const isOwner = p.role === "supplier" && contract.supplierId === p.id;
    if (!isStaff && !isOwner) return c.json({ error: "Forbidden" }, 403);
    const [supplier] = await db.select().from(profile).where(eq(profile.id, contract.supplierId)).limit(1);
    const bank = supplier
      ? {
          bankName: supplier.bankName, bankAccountName: supplier.bankAccountName,
          bankAccountNo: supplier.bankAccountNo, bankSwift: supplier.bankSwift, bankBranch: supplier.bankBranch,
          supplierName: supplier.companyName, userCode: supplier.userCode,
        }
      : null;
    const slipUrl = contract.payoutSlipKey ? await presignGet(contract.payoutSlipKey) : "";
    // settlement preview
    const baseValue = contract.contractValueTzs || contract.totalEscrowBalanceTzs;
    const preview = runSettlement(baseValue, contract.emergencyCreditDeductedTzs);
    return c.json({ contract, bank: isStaff ? bank : null, slipUrl, payoutStatus: contract.payoutStatus, preview }, 200);
  })
  // KAM/Admin: upload TT slip to supplier
  .post("/contracts/:id/payout-slip", requireAuth, requireRole("key_account", "admin"), async (c) => {
    const cid = c.req.param("id");
    const p = c.get("profile")!;
    const b = await c.req.json<{ slipKey: string }>();
    if (!b.slipKey) return c.json({ error: "slipKey required" }, 400);
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ message: "Not found" }, 404);
    if (contract.payoutStatus !== "AwaitingSupplierApproval") {
      return c.json({ error: "Contract is not awaiting payout (client must sign off first)." }, 400);
    }
    await db.update(contracts).set({ payoutSlipKey: b.slipKey }).where(eq(contracts.id, cid));
    await logEvent({ contractId: cid, tenderId: contract.tenderId ?? "", actorProfileId: p.id, type: "payout.slip", summary: `${p.companyName || "KAM"} uploaded the payout TT slip for "${contract.title}".` });
    await logNotification({ recipientProfileId: contract.supplierId, tenderId: contract.tenderId ?? "", subject: "Payment slip uploaded — please confirm", body: `Nguzo uploaded the TT slip for "${contract.title}". Open your dashboard to review and confirm receipt.` });
    return c.json({ ok: true }, 200);
  })
  // Supplier: approve the TT slip → run settlement, lock invoices/ledger
  .post("/contracts/:id/payout-approve", requireAuth, requireRole("supplier"), async (c) => {
    const cid = c.req.param("id");
    const p = c.get("profile")!;
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ message: "Not found" }, 404);
    if (contract.supplierId !== p.id) return c.json({ error: "Forbidden" }, 403);
    if (contract.payoutStatus !== "AwaitingSupplierApproval") return c.json({ error: "Nothing to approve." }, 400);
    if (!contract.payoutSlipKey) return c.json({ error: "No payment slip has been uploaded yet." }, 400);

    const baseValue = contract.contractValueTzs || contract.totalEscrowBalanceTzs;
    const s = runSettlement(baseValue, contract.emergencyCreditDeductedTzs);
    await db
      .update(contracts)
      .set({
        platformFeeTzs: s.platformFeeTzs,
        supplierPayoutTzs: s.supplierPayoutTzs,
        milestoneStatus: "FundsDisbursed",
        payoutStatus: "Approved",
      })
      .where(eq(contracts.id, cid));
    await db.insert(invoices).values([
      { id: id("inv"), contractId: cid, party: "Client", lineItems: s.clientLineItems, totalTzs: baseValue + Math.round(baseValue * 0.05) },
      { id: id("inv"), contractId: cid, party: "Supplier", lineItems: s.supplierLineItems, totalTzs: s.supplierPayoutTzs },
    ]);
    await logEvent({ contractId: cid, tenderId: contract.tenderId ?? "", actorProfileId: p.id, type: "payout.approved", summary: `${p.companyName || "Supplier"} confirmed payment received. Settlement locked.` });
    const staff = await db.select().from(profile).where(inArray(profile.role, ["key_account", "admin"]));
    await notifyMany([contract.clientId, ...staff.map((x) => x.id)], { tenderId: contract.tenderId ?? "", subject: "Payout confirmed", body: `Supplier confirmed payment for "${contract.title}". The deal is settled.` });
    return c.json({ ok: true, settlement: s }, 200);
  })

  // ---- breakdown / parts engine ----
  .get("/parts", requireAuth, async (c) => {
    const model = c.req.query("model");
    let rows = await db.select().from(parts);
    if (model) rows = rows.filter((r) => r.compatibleModel.toLowerCase().includes(model.toLowerCase()));
    return c.json({ parts: rows }, 200);
  })
  // SUPPLIER reports a breakdown + approves a spare order from the catalogue.
  // Creates a routed POS order at status "Requested" (awaiting KAM escrow-check).
  // No silent auto-dispatch — KAM is the gatekeeper.
  .post("/contracts/:id/report-breakdown", requireAuth, requireRole("supplier"), async (c) => {
    const cid = c.req.param("id");
    const p = c.get("profile")!;
    const b = await c.req.json<{ partId: string; deliverTo?: "MachineSupplier" | "FieldAgent" }>();
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ message: "Contract not found" }, 404);
    if (contract.supplierId !== p.id) return c.json({ error: "Forbidden" }, 403);
    const [part] = await db.select().from(parts).where(eq(parts.id, b.partId)).limit(1);
    if (!part) return c.json({ message: "Part not found" }, 404);
    if (part.status === "OutOfStock" || part.stockQty <= 0) return c.json({ error: "That part is out of stock." }, 400);

    if (contract.assetId) await db.update(assets).set({ operationalStatus: "Breakdown" }).where(eq(assets.id, contract.assetId));
    await db.update(contracts).set({ milestoneStatus: "BreakdownIncident" }).where(eq(contracts.id, cid));

    const order = {
      id: id("po"),
      contractId: cid,
      partId: part.id,
      status: "Requested",
      requestedByProfileId: p.id,
      partsSupplierId: part.partsSupplierId,
      deliverTo: b.deliverTo === "FieldAgent" ? "FieldAgent" : "MachineSupplier",
      retailCostTzs: part.retailCostTzs,
      totalCostTzs: part.retailCostTzs + part.logisticsHandlingFeeTzs,
      manifestRef: "",
    };
    await db.insert(partOrders).values(order);
    await logEvent({ contractId: cid, tenderId: contract.tenderId ?? "", actorProfileId: p.id, type: "parts.requested", summary: `${p.companyName || "Supplier"} requested an emergency spare: ${part.partName} (retail TZS ${part.retailCostTzs.toLocaleString()}). Awaiting KAM escrow check.` });
    const kams = await db.select().from(profile).where(inArray(profile.role, ["key_account", "admin"]));
    await notifyMany(kams.map((k) => k.id), { tenderId: contract.tenderId ?? "", subject: "Emergency spare request", body: `${p.companyName || "A supplier"} requested ${part.partName} on "${contract.title}". Check escrow and route to a parts supplier.` });
    return c.json({ ok: true, order }, 200);
  })
  // role-scoped part-orders feed
  .get("/part-orders", requireAuth, async (c) => {
    const p = c.get("profile")!;
    let rows: (typeof partOrders.$inferSelect)[];
    if (p.role === "supplier") rows = await db.select().from(partOrders).where(eq(partOrders.requestedByProfileId, p.id)).orderBy(desc(partOrders.createdAt));
    else if (p.role === "parts_supplier") rows = await db.select().from(partOrders).where(and(eq(partOrders.partsSupplierId, p.id), inArray(partOrders.status, ["SentToParts", "Dispatched", "Delivered"]))).orderBy(desc(partOrders.createdAt));
    else rows = await db.select().from(partOrders).orderBy(desc(partOrders.createdAt)); // KAM/admin see all
    // enrich with part + contract titles
    const partIds = [...new Set(rows.map((r) => r.partId))].filter(Boolean);
    const ctrIds = [...new Set(rows.map((r) => r.contractId))].filter(Boolean);
    const pr = partIds.length ? await db.select().from(parts).where(inArray(parts.id, partIds)) : [];
    const ct = ctrIds.length ? await db.select().from(contracts).where(inArray(contracts.id, ctrIds)) : [];
    const pName = new Map(pr.map((x) => [x.id, x]));
    const cInfo = new Map(ct.map((x) => [x.id, x]));
    return c.json({
      orders: rows.map((r) => {
        const ctr = cInfo.get(r.contractId);
        const escrowAvail = ctr ? ctr.totalEscrowBalanceTzs - ctr.emergencyCreditDeductedTzs : 0;
        return {
          ...r,
          part: pName.get(r.partId) ?? null,
          contractTitle: ctr?.title ?? "",
          escrowAvailableTzs: escrowAvail,
        };
      }),
    }, 200);
  })
  // KAM/Admin: escrow-check + route to parts supplier (or reject)
  .post("/part-orders/:id/route", requireAuth, requireRole("key_account", "admin"), async (c) => {
    const oid = c.req.param("id");
    const p = c.get("profile")!;
    const [order] = await db.select().from(partOrders).where(eq(partOrders.id, oid)).limit(1);
    if (!order) return c.json({ message: "Order not found" }, 404);
    if (order.status !== "Requested") return c.json({ error: "This order has already been routed." }, 400);
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, order.contractId)).limit(1);
    if (!contract) return c.json({ message: "Contract not found" }, 404);
    const [part] = await db.select().from(parts).where(eq(parts.id, order.partId)).limit(1);
    if (!part) return c.json({ message: "Part not found" }, 404);

    const result = evaluateBreakdown({
      escrowBalanceTzs: contract.totalEscrowBalanceTzs,
      emergencyCreditDeductedTzs: contract.emergencyCreditDeductedTzs,
      partRetailCostTzs: part.retailCostTzs,
      logisticsHandlingFeeTzs: part.logisticsHandlingFeeTzs,
    });
    if (!result.ok) {
      await db.update(partOrders).set({ status: "Rejected", kamId: p.id, rejectReason: result.reason }).where(eq(partOrders.id, oid));
      await logEvent({ contractId: contract.id, actorProfileId: p.id, type: "parts.rejected", summary: `Spare request rejected — ${result.reason}` });
      await logNotification({ recipientProfileId: order.requestedByProfileId, subject: "Spare request declined", body: result.reason });
      return c.json({ ok: false, reason: result.reason }, 200);
    }
    await db.update(partOrders).set({ status: "SentToParts", kamId: p.id, courier: result.courier, manifestRef: manifestRef(), totalCostTzs: result.partTotalTzs }).where(eq(partOrders.id, oid));
    await db.update(contracts).set({ emergencyCreditDeductedTzs: result.newEmergencyCreditDeductedTzs }).where(eq(contracts.id, contract.id));
    await logEvent({ contractId: contract.id, actorProfileId: p.id, type: "parts.routed", summary: `${p.companyName || "KAM"} cleared escrow + routed ${part.partName} to the parts supplier.` });
    await notifyMany([order.partsSupplierId, order.requestedByProfileId].filter(Boolean), { subject: "Spare order routed", body: `${part.partName} approved for dispatch on "${contract.title}".` });
    return c.json({ ok: true }, 200);
  })
  // Parts Supplier: dispatch (courier + waybill) → decrements stock
  .post("/part-orders/:id/dispatch", requireAuth, requireRole("parts_supplier", "admin"), async (c) => {
    const oid = c.req.param("id");
    const p = c.get("profile")!;
    const b = await c.req.json<{ courier?: string; waybillRef?: string }>();
    const [order] = await db.select().from(partOrders).where(eq(partOrders.id, oid)).limit(1);
    if (!order) return c.json({ message: "Order not found" }, 404);
    if (order.status !== "SentToParts") return c.json({ error: "Order is not ready for dispatch." }, 400);
    const [part] = await db.select().from(parts).where(eq(parts.id, order.partId)).limit(1);
    if (!part) return c.json({ message: "Part not found" }, 404);
    if (part.stockQty <= 0) return c.json({ error: "No stock to dispatch." }, 400);
    const newQty = part.stockQty - 1;
    await db.update(parts).set({ stockQty: newQty, status: newQty <= 0 ? "OutOfStock" : "Active" }).where(eq(parts.id, part.id));
    await db.update(partOrders).set({ status: "Dispatched", courier: b.courier ?? order.courier ?? "Shabiby", waybillRef: b.waybillRef ?? "" }).where(eq(partOrders.id, oid));
    await logEvent({ contractId: order.contractId, actorProfileId: p.id, type: "parts.dispatched", summary: `${part.partName} dispatched via ${b.courier ?? order.courier} (waybill ${b.waybillRef ?? "—"}).` });
    await notifyMany([order.requestedByProfileId, order.kamId].filter(Boolean), { subject: "Spare dispatched", body: `${part.partName} is on its way (${b.courier ?? order.courier}, waybill ${b.waybillRef ?? "—"}).` });
    return c.json({ ok: true }, 200);
  })
  .post("/part-orders/:id/status", requireAuth, async (c) => {
    const oid = c.req.param("id");
    const b = await c.req.json<{ status: string }>();
    await db.update(partOrders).set({ status: b.status }).where(eq(partOrders.id, oid));
    return c.json({ ok: true }, 200);
  })
  // Parts inventory CRUD (parts_supplier owns; admin oversight)
  .get("/parts/mine", requireAuth, requireRole("parts_supplier", "admin"), async (c) => {
    const p = c.get("profile")!;
    const rows = p.role === "admin"
      ? await db.select().from(parts)
      : await db.select().from(parts).where(eq(parts.partsSupplierId, p.id));
    return c.json({ parts: rows }, 200);
  })
  .post("/parts", requireAuth, requireRole("parts_supplier", "admin"), async (c) => {
    const p = c.get("profile")!;
    const b = await c.req.json<Partial<typeof parts.$inferInsert>>();
    const qty = Math.max(0, Math.floor(b.stockQty ?? 0));
    const row = {
      id: id("part"),
      partsSupplierId: p.id,
      partName: b.partName ?? "Unnamed part",
      sku: b.sku ?? "",
      compatibleModel: b.compatibleModel ?? "",
      wholesaleCostTzs: b.wholesaleCostTzs ?? 0,
      retailCostTzs: b.retailCostTzs ?? 0,
      darSupplierName: b.darSupplierName ?? "",
      darSupplierLocation: b.darSupplierLocation ?? "Vingunguti",
      logisticsHandlingFeeTzs: b.logisticsHandlingFeeTzs ?? 0,
      stockQty: qty,
      status: qty > 0 ? "Active" : "OutOfStock",
    };
    await db.insert(parts).values(row);
    return c.json({ part: row }, 200);
  })
  .patch("/parts/:id", requireAuth, requireRole("parts_supplier", "admin"), async (c) => {
    const pid = c.req.param("id");
    const p = c.get("profile")!;
    const b = await c.req.json<Partial<typeof parts.$inferInsert>>();
    const [existing] = await db.select().from(parts).where(eq(parts.id, pid)).limit(1);
    if (!existing) return c.json({ message: "Not found" }, 404);
    if (p.role !== "admin" && existing.partsSupplierId !== p.id) return c.json({ error: "Forbidden" }, 403);
    const patch: Record<string, unknown> = {};
    for (const k of ["partName", "sku", "compatibleModel", "wholesaleCostTzs", "retailCostTzs", "darSupplierName", "darSupplierLocation", "logisticsHandlingFeeTzs", "stockQty"] as const) {
      if (b[k] !== undefined) patch[k] = b[k];
    }
    if (patch.stockQty !== undefined) patch.status = (patch.stockQty as number) > 0 ? "Active" : "OutOfStock";
    await db.update(parts).set(patch).where(eq(parts.id, pid));
    return c.json({ ok: true }, 200);
  })

  // ---- compliance ----
  .post("/compliance/:id/verify", requireAuth, async (c) => {
    const ciid = c.req.param("id");
    const b = await c.req.json<{ status: string; documentUrl?: string; errorLogs?: string }>();
    await db
      .update(complianceItems)
      .set({ verificationStatus: b.status, documentUrl: b.documentUrl ?? undefined, errorLogs: b.errorLogs ?? "" })
      .where(eq(complianceItems.id, ciid));
    return c.json({ ok: true }, 200);
  })

  // ---- inspections (field) ----
  .get("/inspections", requireAuth, async (c) => {
    const rows = await db.select().from(inspections).orderBy(desc(inspections.createdAt));
    return c.json({ inspections: rows }, 200);
  })
  .post("/inspections", requireAuth, requireRole("field"), async (c) => {
    const p = c.get("profile")!;
    const b = await c.req.json<{
      assetId?: string; tenderId?: string; contractId?: string;
      mechanicalNotes: string; legitimacySignedOff: boolean; vinPhotos?: string[];
      docsChecked?: boolean; machineInspected?: boolean; submit?: boolean;
    }>();
    // Standalone yard audits (no tender) keep the old single-shot behaviour.
    // Tender-linked reports are 2-step + KAM-reviewed: submit → Submitted (NO auto-advance).
    const isTenderReport = !!b.tenderId;
    const submit = isTenderReport ? !!b.submit : true;
    const row = {
      id: id("insp"),
      assetId: b.assetId ?? "",
      tenderId: b.tenderId ?? "",
      contractId: b.contractId ?? "",
      inspectorId: p.id,
      mechanicalNotes: b.mechanicalNotes ?? "",
      legitimacySignedOff: !!b.legitimacySignedOff,
      vinPhotos: b.vinPhotos ?? [],
      docsChecked: !!b.docsChecked,
      machineInspected: !!b.machineInspected,
      reportStatus: isTenderReport ? (submit ? "Submitted" : "Draft") : "Approved",
    };
    await db.insert(inspections).values(row);
    if (b.assetId) {
      await db.update(assets).set({ auditTimestamp: new Date() }).where(eq(assets.id, b.assetId));
      if (b.legitimacySignedOff && !isTenderReport) {
        const [asset] = await db.select().from(assets).where(eq(assets.id, b.assetId)).limit(1);
        if (asset) await db.update(profile).set({ verificationStatus: "Verified" }).where(eq(profile.id, asset.supplierId));
      }
    }
    if (isTenderReport && submit) {
      await logEvent({ tenderId: b.tenderId, actorProfileId: p.id, type: "inspection.submitted", summary: `Field report submitted by ${p.fullName || p.companyName || "inspector"} for KAM review.` });
      const kams = await db.select().from(profile).where(inArray(profile.role, ["key_account", "admin"]));
      await notifyMany(kams.map((k) => k.id), { tenderId: b.tenderId, subject: "Field report awaiting review", body: `${p.fullName || "A field agent"} submitted an inspection report for review.` });
    }
    return c.json({ inspection: row }, 200);
  })
  // KAM/Admin review a submitted field report → approve advances FieldVerified, decline bounces to supplier
  .post("/inspections/:id/review", requireAuth, requireRole("key_account", "admin"), async (c) => {
    const iid = c.req.param("id");
    const p = c.get("profile")!;
    const b = await c.req.json<{ approve: boolean; declineReason?: string; hardDecline?: boolean }>();
    const [insp] = await db.select().from(inspections).where(eq(inspections.id, iid)).limit(1);
    if (!insp) return c.json({ message: "Report not found" }, 404);
    if (insp.reportStatus !== "Submitted") return c.json({ error: "This report is not awaiting review." }, 400);
    const tid = insp.tenderId;

    if (b.approve) {
      await db.update(inspections).set({ reportStatus: "Approved", reviewedBy: p.id, legitimacySignedOff: true }).where(eq(inspections.id, iid));
      if (tid) {
        const [tender] = await db.select().from(tenders).where(eq(tenders.id, tid)).limit(1);
        if (tender && tender.tenderStage === "MachineDocsUploaded") {
          await db.update(tenders).set({ tenderStage: "FieldVerified" }).where(eq(tenders.id, tid));
          await db.update(contracts).set({ contractStage: "FieldVerified" }).where(eq(contracts.tenderId, tid));
          await logEvent({ tenderId: tid, actorProfileId: p.id, type: "stage.advance", summary: `${p.companyName || "KAM"} approved the field report → Field inspection verified.`, meta: { from: "MachineDocsUploaded", to: "FieldVerified" } });
          await notifyMany([tender.clientId], { tenderId: tid, subject: "Field inspection verified", body: `"${tender.title}" passed field verification.` });
        }
      }
      return c.json({ ok: true }, 200);
    }
    // decline
    const reason = (b.declineReason ?? "").slice(0, 500) || "Report declined — please re-check and resubmit.";
    if (b.hardDecline && tid) {
      await db.update(inspections).set({ reportStatus: "Declined", reviewedBy: p.id, declineReason: reason }).where(eq(inspections.id, iid));
      await db.update(tenders).set({ status: "Cancelled" }).where(eq(tenders.id, tid));
      await logEvent({ tenderId: tid, actorProfileId: p.id, type: "tender.cancelled", summary: `${p.companyName || "KAM"} hard-declined the job: ${reason}` });
      return c.json({ ok: true, cancelled: true }, 200);
    }
    await db.update(inspections).set({ reportStatus: "Declined", reviewedBy: p.id, declineReason: reason }).where(eq(inspections.id, iid));
    if (tid) {
      // bounce the tender back so the supplier re-uploads docs, then field re-inspects
      await db.update(tenders).set({ tenderStage: "AgreementsSigned" }).where(eq(tenders.id, tid));
      await db.update(contracts).set({ contractStage: "AgreementSigned" }).where(eq(contracts.tenderId, tid));
      await logEvent({ tenderId: tid, actorProfileId: p.id, type: "inspection.declined", summary: `${p.companyName || "KAM"} declined the field report: ${reason}` });
      const tContracts = await db.select().from(contracts).where(eq(contracts.tenderId, tid));
      await notifyMany(tContracts.map((x) => x.supplierId), { tenderId: tid, subject: "Field report declined — action needed", body: `Your documents need attention: ${reason} Please re-upload and the field agent will re-inspect.` });
    }
    return c.json({ ok: true }, 200);
  })

  // ---- border logs (field/border lite) ----
  .get("/border-logs", requireAuth, async (c) => {
    const rows = await db.select().from(borderLogs).orderBy(desc(borderLogs.createdAt));
    return c.json({ logs: rows }, 200);
  })
  .post("/border-logs", requireAuth, requireRole("field"), async (c) => {
    const p = c.get("profile")!;
    const b = await c.req.json<{ osbp: string; contractId?: string; institutionalWaitMinutes: number; clearanceOverrideNote?: string }>();
    const row = {
      id: id("blog"),
      osbp: b.osbp,
      contractId: b.contractId ?? "",
      institutionalWaitMinutes: b.institutionalWaitMinutes ?? 0,
      clearanceOverrideNote: b.clearanceOverrideNote ?? "",
      loggedBy: p.id,
    };
    await db.insert(borderLogs).values(row);
    return c.json({ log: row }, 200);
  })

  // ---- cargo / tender matching ----
  .get("/cargo", requireAuth, async (c) => {
    const rows = await db.select().from(cargoLoads).orderBy(desc(cargoLoads.createdAt));
    return c.json({ loads: rows }, 200);
  })
  .post("/cargo", requireAuth, requireRole("client"), async (c) => {
    const p = c.get("profile")!;
    const b = await c.req.json<Partial<typeof cargoLoads.$inferInsert>>();
    const row = {
      id: id("load"),
      cargoOwnerId: p.id,
      cargoType: b.cargoType ?? "General",
      origin: b.origin ?? "",
      destination: b.destination ?? "",
      tonnage: b.tonnage ?? 0,
      budgetTzs: b.budgetTzs ?? 0,
      status: "Open",
    };
    await db.insert(cargoLoads).values(row);
    return c.json({ load: row }, 200);
  })
  .get("/cargo/:id/bids", requireAuth, async (c) => {
    const lid = c.req.param("id");
    const rows = await db.select().from(loadBids).where(eq(loadBids.loadId, lid)).orderBy(desc(loadBids.createdAt));
    return c.json({ bids: rows }, 200);
  })
  .post("/cargo/:id/bids", requireAuth, requireRole("supplier"), async (c) => {
    const lid = c.req.param("id");
    const p = c.get("profile")!;
    const b = await c.req.json<{ rateTzs: number; note?: string; assetId?: string }>();
    const row = {
      id: id("bid"),
      loadId: lid,
      supplierId: p.id,
      assetId: b.assetId ?? "",
      rateTzs: b.rateTzs ?? 0,
      note: b.note ?? "",
      status: "Interested",
    };
    await db.insert(loadBids).values(row);
    return c.json({ bid: row }, 200);
  })

  // ---- invoices ----
  .get("/invoices/:contractId", requireAuth, async (c) => {
    const cid = c.req.param("contractId");
    const rows = await db.select().from(invoices).where(eq(invoices.contractId, cid));
    return c.json({ invoices: rows }, 200);
  })

  // ---- admin ----
  .get("/admin/overview", requireAuth, requireRole("admin","key_account"), async (c) => {
    const allContracts = await db.select().from(contracts);
    const allAssets = await db.select().from(assets);
    const allProfiles = await db.select().from(profile);
    const allLoads = await db.select().from(cargoLoads);
    const lockedEscrow = allContracts
      .filter((x) => x.milestoneStatus !== "FundsDisbursed")
      .reduce((s, x) => s + x.totalEscrowBalanceTzs, 0);
    const platformRevenue = allContracts.reduce((s, x) => s + x.platformFeeTzs, 0);
    const breakdowns = allContracts.filter((x) => x.milestoneStatus === "BreakdownIncident").length;
    return c.json(
      {
        counts: {
          contracts: allContracts.length,
          assets: allAssets.length,
          suppliers: allProfiles.filter((p) => p.role === "supplier").length,
          clients: allProfiles.filter((p) => p.role === "client").length,
          loads: allLoads.length,
          breakdowns,
        },
        lockedEscrow,
        platformRevenue,
        contracts: allContracts,
      },
      200
    );
  })
  // Verification queue — ALL external roles awaiting review, split into two tracks:
  //  remote  = clients (document + address review only)
  //  siteVisit = suppliers + parts suppliers (mandatory physical inspection)
  .get("/admin/verification-queue", requireAuth, requireRole("admin", "key_account"), async (c) => {
    const rows = await db
      .select()
      .from(profile)
      .where(inArray(profile.role, ["client", "supplier", "parts_supplier"]));
    const withDocs = await Promise.all(
      rows.map(async (r) => {
        const docs = await db.select().from(kybDocuments).where(eq(kybDocuments.profileId, r.id));
        return { ...r, documentCount: docs.length };
      })
    );
    const remote = withDocs.filter((r) => r.role === "client");
    const siteVisit = withDocs.filter((r) => r.role === "supplier" || r.role === "parts_supplier");
    return c.json({ remote, siteVisit }, 200);
  })
  // Full profile + all KYB documents (presigned read URLs) for the review panel.
  .get("/admin/profile/:profileId", requireAuth, requireRole("admin", "key_account"), async (c) => {
    const pid = c.req.param("profileId");
    const [row] = await db.select().from(profile).where(eq(profile.id, pid)).limit(1);
    if (!row) return c.json({ error: "Not found" }, 404);
    // KAM scoping: a KAM may only inspect accounts assigned to them.
    const me = c.get("profile")!;
    if (me.role === "key_account" && row.managerId !== me.id) return c.json({ error: "Forbidden — not your assigned account." }, 403);
    const [u] = await db.select().from(authUser).where(eq(authUser.id, row.userId)).limit(1);
    const docs = await db.select().from(kybDocuments).where(eq(kybDocuments.profileId, pid));
    const withUrls = await Promise.all(docs.map(async (d) => ({ ...d, url: d.fileKey ? await presignGet(d.fileKey) : "" })));
    const faceUrl = row.faceImageKey ? await presignGet(row.faceImageKey) : "";
    const idDocUrl = row.nationalIdDocKey ? await presignGet(row.nationalIdDocKey) : "";
    const photoUrl = row.photoKey ? await presignGet(row.photoKey) : "";
    return c.json({ profile: { ...row, email: u?.email ?? "" }, documents: withUrls, faceUrl, idDocUrl, photoUrl }, 200);
  })
  .post("/admin/verify/:profileId", requireAuth, requireRole("admin"), async (c) => {
    const pid = c.req.param("profileId");
    const b = await c.req.json<{ status: string; notes?: string }>();
    // canonical states: Verified | SiteVisitScheduled | Rejected | Submitted | PendingOnboarding
    const valid = ["Verified", "SiteVisitScheduled", "Rejected", "Submitted", "PendingOnboarding"];
    if (!valid.includes(b.status)) return c.json({ error: "Invalid verification status." }, 400);
    await db
      .update(profile)
      .set({ verificationStatus: b.status, physicalVerificationNotes: b.notes ?? "" })
      .where(eq(profile.id, pid));
    const subject =
      b.status === "Verified" ? "You're verified on Nguzo" :
      b.status === "SiteVisitScheduled" ? "Site visit scheduled" :
      b.status === "Rejected" ? "Verification needs attention" : "Verification update";
    await logNotification({ recipientProfileId: pid, subject, body: b.notes || `Your account status is now: ${b.status}.` });
    return c.json({ ok: true }, 200);
  })

  // ---- admin: staff / team management ----
  .get("/admin/staff", requireAuth, requireRole("admin"), async (c) => {
    const rows = await db
      .select({
        id: profile.id,
        userId: profile.userId,
        role: profile.role,
        userCode: profile.userCode,
        companyName: profile.companyName,
        verificationStatus: profile.verificationStatus,
        email: authUser.email,
        name: authUser.name,
      })
      .from(profile)
      .leftJoin(authUser, eq(profile.userId, authUser.id))
      .orderBy(desc(profile.createdAt));
    const me = c.get("profile")!;
    return c.json(
      {
        staff: rows.map((r) => ({
          ...r,
          isSelf: r.id === me.id,
          isLocked: isAllowlistedAdmin(r.email),
        })),
      },
      200
    );
  })
  .post("/admin/staff/:profileId/role", requireAuth, requireRole("admin"), async (c) => {
    const pid = c.req.param("profileId");
    const b = await c.req.json<{ role: string }>();
    if (!["admin", "key_account", "field", "supplier", "client", "parts_supplier"].includes(b.role)) {
      return c.json({ error: "Invalid role." }, 400);
    }
    const me = c.get("profile")!;
    if (pid === me.id) {
      return c.json({ error: "You cannot change your own role." }, 403);
    }
    const target = await db
      .select({ id: profile.id, email: authUser.email, role: profile.role, userCode: profile.userCode })
      .from(profile)
      .leftJoin(authUser, eq(profile.userId, authUser.id))
      .where(eq(profile.id, pid))
      .limit(1);
    if (!target[0]) return c.json({ error: "User not found." }, 404);
    if (isAllowlistedAdmin(target[0].email) && b.role !== "admin") {
      return c.json({ error: "This account is a protected super-admin and cannot be demoted." }, 403);
    }
    const patch: { role: string; verificationStatus?: string; userCode?: string } = { role: b.role };
    if (["admin", "key_account", "field"].includes(b.role)) patch.verificationStatus = "Verified";
    // re-issue a User ID if the role prefix changes (or none yet)
    if (target[0].role !== b.role || !target[0].userCode) patch.userCode = await nextUserCode(b.role);
    await db.update(profile).set(patch).where(eq(profile.id, pid));
    return c.json({ ok: true }, 200);
  })
  // Admin: create a new internal staff user (KAM / field / admin).
  // Staff log in with an admin-set USERNAME + temp password, and are forced to
  // change the password on first login, then complete KYC onboarding.
  .post("/admin/staff/create", requireAuth, requireRole("admin"), async (c) => {
    const b = await c.req.json<{ username: string; password?: string; name: string; role: string; phone?: string; managerId?: string; fieldStation?: string }>();
    const uname = (b.username ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (!uname || !b.name?.trim()) return c.json({ error: "Username and full name are required." }, 400);
    if (uname.length < 3) return c.json({ error: "Username must be at least 3 characters." }, 400);
    // Staff are internal roles only.
    if (!["admin", "key_account", "field"].includes(b.role)) return c.json({ error: "Only Admin, Key Account Manager and Field Agent staff can be created here." }, 400);
    // username must be unique across profiles
    const dupe = await db.select().from(profile).where(eq(profile.username, uname)).limit(1);
    if (dupe.length) return c.json({ error: "That username is already taken." }, 400);
    // Synthesize an internal email for better-auth (it is email-keyed).
    const synthEmail = `${uname}@staff.nguzo.local`;
    const existing = await db.select().from(authUser).where(eq(authUser.email, synthEmail)).limit(1);
    if (existing.length) return c.json({ error: "That username is already taken." }, 400);
    const tempPassword = (b.password && b.password.length >= 8) ? b.password : `Nguzo-${Math.random().toString(36).slice(2, 8)}!`;
    let userId: string;
    try {
      const res = await auth.api.signUpEmail({ body: { email: synthEmail, password: tempPassword, name: b.name.trim() } });
      userId = (res as { user: { id: string } }).user.id;
    } catch (e) {
      return c.json({ error: "Could not create account: " + (e as Error).message }, 400);
    }
    const code = await nextUserCode(b.role);
    const pid = id("prof");
    await db.insert(profile).values({
      id: pid, userId, role: b.role, userCode: code, username: uname,
      companyName: b.name.trim(), fullName: b.name.trim(),
      phone: b.phone ?? "", agentNumber: b.role === "field" ? code.replace("NGZ-", "") : "",
      managerId: b.managerId ?? "",
      fieldStation: b.role === "field" ? (b.fieldStation === "border" ? "border" : "yard") : "",
      mustChangePassword: true,
      onboardingComplete: false,
      // Staff identity is trusted (admin-created) but KYC still required before live work.
      verificationStatus: "Submitted",
    });
    return c.json({ ok: true, profileId: pid, username: uname, tempPassword, userCode: code }, 200);
  })
  // Admin: delete a user (and their profile)
  .post("/admin/staff/:profileId/delete", requireAuth, requireRole("admin"), async (c) => {
    const pid = c.req.param("profileId");
    const me = c.get("profile")!;
    if (pid === me.id) return c.json({ error: "You cannot delete your own account." }, 403);
    const [target] = await db
      .select({ id: profile.id, userId: profile.userId, email: authUser.email })
      .from(profile)
      .leftJoin(authUser, eq(profile.userId, authUser.id))
      .where(eq(profile.id, pid))
      .limit(1);
    if (!target) return c.json({ error: "User not found." }, 404);
    if (isAllowlistedAdmin(target.email)) return c.json({ error: "Protected super-admin cannot be deleted." }, 403);
    await db.delete(profile).where(eq(profile.id, pid));
    await db.delete(authUser).where(eq(authUser.id, target.userId)); // cascades sessions/accounts
    return c.json({ ok: true }, 200);
  })
  // ---- staff requests (KAM → Admin field-agent add) ----
  .get("/staff-requests", requireAuth, async (c) => {
    const p = c.get("profile")!;
    if (!["admin", "key_account"].includes(p.role)) return c.json({ error: "Forbidden" }, 403);
    const rows = p.role === "admin"
      ? await db.select().from(staffRequests).orderBy(desc(staffRequests.createdAt))
      : await db.select().from(staffRequests).where(eq(staffRequests.requestedByProfileId, p.id)).orderBy(desc(staffRequests.createdAt));
    const reqIds = [...new Set(rows.map((r) => r.requestedByProfileId))];
    const reqs = reqIds.length ? await db.select().from(profile).where(inArray(profile.id, reqIds)) : [];
    const nameOf = new Map(reqs.map((x) => [x.id, x.companyName || x.fullName]));
    return c.json({ requests: rows.map((r) => ({ ...r, requestedByName: nameOf.get(r.requestedByProfileId) ?? "KAM" })) }, 200);
  })
  .post("/staff-requests", requireAuth, requireRole("key_account", "admin"), async (c) => {
    const p = c.get("profile")!;
    const b = await c.req.json<{ proposedName: string; proposedEmail: string; proposedPhone?: string }>();
    if (!b.proposedName?.trim() || !b.proposedEmail?.trim()) return c.json({ error: "Name and email are required." }, 400);
    const row = {
      id: id("sreq"), requestedByProfileId: p.id,
      proposedName: b.proposedName.trim(), proposedEmail: b.proposedEmail.trim().toLowerCase(),
      proposedPhone: b.proposedPhone ?? "", status: "Pending",
    };
    await db.insert(staffRequests).values(row);
    const admins = await db.select().from(profile).where(eq(profile.role, "admin"));
    await notifyMany(admins.map((a) => a.id), { subject: "Field-agent add request", body: `${p.companyName || "A KAM"} requested to add field agent ${b.proposedName} (${b.proposedEmail}).` });
    return c.json({ ok: true, request: row }, 200);
  })
  .post("/staff-requests/:id/resolve", requireAuth, requireRole("admin"), async (c) => {
    const rid = c.req.param("id");
    const b = await c.req.json<{ approve: boolean; password?: string; username?: string }>();
    const [req] = await db.select().from(staffRequests).where(eq(staffRequests.id, rid)).limit(1);
    if (!req) return c.json({ error: "Request not found." }, 404);
    if (req.status !== "Pending") return c.json({ error: "Already resolved." }, 400);
    if (!b.approve) {
      await db.update(staffRequests).set({ status: "Rejected" }).where(eq(staffRequests.id, rid));
      await logNotification({ recipientProfileId: req.requestedByProfileId, subject: "Field-agent request declined", body: `Your request to add ${req.proposedName} was declined.` });
      return c.json({ ok: true }, 200);
    }
    // approve → create the field-agent account (username login), reports to the requesting KAM
    const uname = (b.username ?? req.proposedEmail.split("@")[0] ?? "agent")
      .trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 20) || `agent${Date.now().toString(36).slice(-4)}`;
    const dupe = await db.select().from(profile).where(eq(profile.username, uname)).limit(1);
    if (dupe.length) return c.json({ error: "That username is already taken — choose another." }, 400);
    const synthEmail = `${uname}@staff.nguzo.local`;
    const existing = await db.select().from(authUser).where(eq(authUser.email, synthEmail)).limit(1);
    if (existing.length) return c.json({ error: "That username is already taken." }, 400);
    const pwd = (b.password && b.password.length >= 8) ? b.password : `Nguzo-${Math.random().toString(36).slice(2, 8)}!`;
    let userId: string;
    try {
      const res = await auth.api.signUpEmail({ body: { email: synthEmail, password: pwd, name: req.proposedName } });
      userId = (res as { user: { id: string } }).user.id;
    } catch (e) {
      return c.json({ error: "Could not create account: " + (e as Error).message }, 400);
    }
    const code = await nextUserCode("field");
    const pid = id("prof");
    await db.insert(profile).values({
      id: pid, userId, role: "field", userCode: code, username: uname,
      companyName: req.proposedName, fullName: req.proposedName, phone: req.proposedPhone,
      agentNumber: code.replace("NGZ-", ""), managerId: req.requestedByProfileId,
      fieldStation: "yard", mustChangePassword: true, onboardingComplete: false,
      verificationStatus: "Submitted",
    });
    await db.update(staffRequests).set({ status: "Approved" }).where(eq(staffRequests.id, rid));
    await logNotification({ recipientProfileId: req.requestedByProfileId, subject: "Field-agent approved", body: `${req.proposedName} (${code}) was added and reports to you. Username: ${uname}, temp password: ${pwd}` });
    return c.json({ ok: true, profileId: pid, username: uname, tempPassword: pwd, userCode: code }, 200);
  })

  // ============================================================
  //  UPLOADS — presigned PUT (client uploads directly to storage)
  // ============================================================
  .post("/uploads/presign", requireAuth, rateLimit({ windowMs: 60_000, max: 40, bucket: "upload" }), async (c) => {
    const p = c.get("profile")!;
    const b = await c.req.json<{ filename?: string; contentType?: string; scope?: string; size?: number }>();
    // Server enforces MIME allowlist + size; clients cannot smuggle executables/HTML.
    if (!isAllowedUpload(b.contentType)) {
      return c.json({ error: "Only PDF, PNG, JPEG and WebP files are allowed." }, 400);
    }
    if (typeof b.size === "number" && b.size > 15 * 1024 * 1024) {
      return c.json({ error: "File too large (max 15 MB)." }, 400);
    }
    const safe = (b.filename ?? "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const scope = (b.scope ?? "doc").replace(/[^a-z0-9_-]/gi, "");
    // Namespace by uploader so keys are non-guessable and attributable.
    const key = `uploads/${scope}/${p.id}/${id("f")}-${safe}`;
    const url = await presignPut(key, b.contentType!);
    return c.json({ url, key }, 200);
  })

  // ============================================================
  //  DOCUMENTS — metadata rows for uploaded objects
  // ============================================================
  .post("/documents", requireAuth, async (c) => {
    const p = c.get("profile")!;
    const b = await c.req.json<{
      tenderId?: string; contractId?: string; kind: string; label?: string; fileKey: string; mimeType?: string;
    }>();
    if (!b.fileKey) return c.json({ error: "fileKey required" }, 400);
    // Authorization: a tender-scoped document may only be attached by a party
    // that can access that tender (client owner / awarded supplier / field / admin / KAM).
    if (b.tenderId) {
      const ok = await canAccessTender(b.tenderId, p);
      if (!ok) return c.json({ error: "Forbidden — you are not a party to this job." }, 403);
    }
    if (b.contractId) {
      const [ct] = await db.select().from(contracts).where(eq(contracts.contractId, b.contractId)).limit(1);
      const ct2 = ct ?? (await db.select().from(contracts).where(eq(contracts.id, b.contractId)).limit(1))[0];
      if (ct2) {
        const allowed = p.role === "admin" || p.role === "key_account" || p.role === "field" || ct2.supplierId === p.id || ct2.clientId === p.id;
        if (!allowed) return c.json({ error: "Forbidden — not your contract." }, 403);
      }
    }
    const row = {
      id: id("doc"),
      ownerId: p.id,
      tenderId: b.tenderId ?? "",
      contractId: b.contractId ?? "",
      kind: b.kind ?? "Other",
      label: b.label ?? "",
      fileKey: b.fileKey,
      mimeType: b.mimeType ?? "",
    };
    await db.insert(documents).values(row);
    return c.json({ document: row }, 200);
  })
  .get("/documents", requireAuth, async (c) => {
    const tenderId = c.req.query("tenderId");
    const contractId = c.req.query("contractId");
    let rows: (typeof documents.$inferSelect)[] = [];
    if (tenderId) rows = await db.select().from(documents).where(eq(documents.tenderId, tenderId)).orderBy(desc(documents.createdAt));
    else if (contractId) rows = await db.select().from(documents).where(eq(documents.contractId, contractId)).orderBy(desc(documents.createdAt));
    const withUrls = await Promise.all(
      rows.map(async (r) => ({ ...r, url: r.fileKey ? await presignGet(r.fileKey) : "" }))
    );
    return c.json({ documents: withUrls }, 200);
  })
  .post("/documents/:id/verify", requireAuth, async (c) => {
    const p = c.get("profile")!;
    if (!["admin", "field", "key_account"].includes(p.role)) return c.json({ error: "Forbidden" }, 403);
    const did = c.req.param("id");
    const [doc] = await db.select().from(documents).where(eq(documents.id, did)).limit(1);
    if (!doc) return c.json({ error: "Document not found." }, 404);
    // Authorization: verifier must be able to access the underlying tender.
    if (doc.tenderId) {
      const ok = await canAccessTender(doc.tenderId, p);
      if (!ok) return c.json({ error: "Forbidden — not your job." }, 403);
    }
    await db.update(documents).set({ verifiedBy: p.id, verifiedAt: new Date() }).where(eq(documents.id, did));
    return c.json({ ok: true }, 200);
  })

  // ============================================================
  //  TENDERS — quantity-demand procurement (Job/Tender)
  // ============================================================
  .post("/tenders", requireAuth, requireRole("client"), async (c) => {
    const p = c.get("profile")!;
    if (p.verificationStatus !== "Verified") {
      return c.json({ error: "Your account must be verified before you can post a job. Please complete onboarding and wait for verification." }, 403);
    }
    const b = await c.req.json<{
      title?: string;
      demandType: "CargoCarrier" | "Machinery";
      carrierOrMachineType: string;
      cargoOrProjectDesc?: string;
      unitsNeeded: number;
      routeClassification?: "Domestic" | "CrossBorder";
      origin?: string;
      destination?: string;
      // timing — cargo
      needByDate?: string;
      transitDays?: number;
      // timing — machinery
      startDate?: string;
      jobDays?: number;
      estTransferDays?: number;
    }>();
    const demandType = b.demandType === "CargoCarrier" ? "CargoCarrier" : "Machinery";
    const units = Math.max(1, Math.floor(b.unitsNeeded || 1));
    const tid = id("tnd");
    const title =
      b.title?.trim() ||
      `${b.carrierOrMachineType || demandType} ×${units} — ${b.origin || "?"} → ${b.destination || "?"}`;
    // Machinery: end date auto-computed = start + (jobDays - 1) = last working day (return-to-yard day excluded)
    const jobDays = Math.max(0, Math.floor(b.jobDays || 0));
    const startDate = b.startDate ?? "";
    const endDate = demandType === "Machinery" && startDate && jobDays > 0 ? addDays(startDate, jobDays - 1) : "";
    await db.insert(tenders).values({
      id: tid,
      clientId: p.id,
      title,
      demandType,
      carrierOrMachineType: b.carrierOrMachineType ?? "",
      cargoOrProjectDesc: b.cargoOrProjectDesc ?? "",
      unitsNeeded: units,
      routeClassification: b.routeClassification === "CrossBorder" ? "CrossBorder" : "Domestic",
      origin: b.origin ?? "",
      destination: b.destination ?? "",
      needByDate: demandType === "CargoCarrier" ? (b.needByDate ?? "") : "",
      transitDays: demandType === "CargoCarrier" ? Math.max(0, Math.floor(b.transitDays || 0)) : 0,
      startDate: demandType === "Machinery" ? startDate : "",
      jobDays: demandType === "Machinery" ? jobDays : 0,
      endDate,
      estTransferDays: demandType === "Machinery" ? Math.max(0, Math.floor(b.estTransferDays || 0)) : 0,
      tenderStage: "Bidding",
      status: "Open",
    });
    await logEvent({ tenderId: tid, actorProfileId: p.id, type: "tender.created", summary: `Job posted: ${title} (${units} unit${units > 1 ? "s" : ""}).` });
    return c.json({ tenderId: tid }, 200);
  })
  .get("/tenders", requireAuth, async (c) => {
    const p = c.get("profile")!;
    let rows: (typeof tenders.$inferSelect)[];
    if (p.role === "client") {
      rows = await db.select().from(tenders).where(eq(tenders.clientId, p.id)).orderBy(desc(tenders.createdAt));
    } else if (p.role === "supplier") {
      // open tenders to bid on + tenders this supplier was awarded
      const open = await db.select().from(tenders).where(eq(tenders.status, "Open")).orderBy(desc(tenders.createdAt));
      const myContracts = await db.select().from(contracts).where(eq(contracts.supplierId, p.id));
      const awardedIds = [...new Set(myContracts.map((x) => x.tenderId).filter(Boolean) as string[])];
      const awarded = awardedIds.length
        ? await db.select().from(tenders).where(inArray(tenders.id, awardedIds))
        : [];
      const seen = new Set<string>();
      rows = [...open, ...awarded].filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
      // tag with my bid (if any)
      const myBids = await db.select().from(bids).where(eq(bids.supplierId, p.id));
      const bidByTender = new Map(myBids.map((x) => [x.tenderId, x]));
      return c.json({ tenders: rows.map((t) => ({ ...t, myBid: bidByTender.get(t.id) ?? null })) }, 200);
    } else {
      rows = await db.select().from(tenders).orderBy(desc(tenders.createdAt));
    }
    return c.json({ tenders: rows }, 200);
  })
  .get("/tenders/:id", requireAuth, async (c) => {
    const tid = c.req.param("id");
    const [tender] = await db.select().from(tenders).where(eq(tenders.id, tid)).limit(1);
    if (!tender) return c.json({ error: "Not found" }, 404);
    const tBids = await db.select().from(bids).where(eq(bids.tenderId, tid)).orderBy(bids.pricePerUnitTzs);
    const tContracts = await db.select().from(contracts).where(eq(contracts.tenderId, tid)).orderBy(desc(contracts.createdAt));
    const docRows = await db.select().from(documents).where(eq(documents.tenderId, tid)).orderBy(desc(documents.createdAt));
    const docs = await Promise.all(docRows.map(async (r) => ({ ...r, url: r.fileKey ? await presignGet(r.fileKey) : "" })));
    const timeline = await db.select().from(activityEvents).where(eq(activityEvents.tenderId, tid)).orderBy(desc(activityEvents.createdAt));
    const threadRows = await db.select().from(messages).where(eq(messages.tenderId, tid)).orderBy(messages.createdAt);
    const msgIds = [...new Set(threadRows.map((m) => m.fromProfileId))];
    const msgPs = msgIds.length ? await db.select().from(profile).where(inArray(profile.id, msgIds)) : [];
    const msgFrom = new Map(msgPs.map((x) => [x.id, { name: x.fullName || x.companyName, role: x.role, agentNumber: x.agentNumber, userCode: x.userCode }]));
    const thread = threadRows.map((m) => ({ ...m, from: msgFrom.get(m.fromProfileId) ?? { name: "User", role: "" } }));
    const insp = await db.select().from(inspections).where(eq(inspections.tenderId, tid)).orderBy(desc(inspections.createdAt));
    // enrich bids + contracts with supplier company names
    const supIds = [...new Set([...tBids.map((b) => b.supplierId), ...tContracts.map((x) => x.supplierId)])].filter(Boolean);
    const sups = supIds.length ? await db.select().from(profile).where(inArray(profile.id, supIds)) : [];
    const supName = new Map(sups.map((s) => [s.id, s.companyName]));
    const [client] = await db.select().from(profile).where(eq(profile.id, tender.clientId)).limit(1);
    return c.json(
      {
        tender,
        stageLabel: STAGE_LABEL[tender.tenderStage as keyof typeof STAGE_LABEL] ?? tender.tenderStage,
        nextActor: STAGE_ACTOR[tender.tenderStage as keyof typeof STAGE_ACTOR] ?? "none",
        client,
        bids: tBids.map((b) => ({ ...b, supplierName: supName.get(b.supplierId) ?? "Supplier" })),
        contracts: tContracts.map((x) => ({ ...x, supplierName: supName.get(x.supplierId) ?? "Supplier" })),
        documents: docs,
        timeline,
        messages: thread,
        inspections: insp,
      },
      200
    );
  })
  .post("/tenders/:id/bids", requireAuth, requireRole("supplier"), async (c) => {
    const tid = c.req.param("id");
    const p = c.get("profile")!;
    if (p.verificationStatus !== "Verified") {
      return c.json({ error: "Your account must be verified before you can bid. Please complete onboarding and wait for our site visit." }, 403);
    }
    const b = await c.req.json<{
      unitsOffered: number;
      pricePerUnitTzs?: number; // cargo: flat per-unit
      transferFeeTzs?: number; // machinery: one-off lowbed transfer per unit
      dailyRateTzs?: number; // machinery: per-unit per-day rental
      note?: string;
      availabilityNote?: string;
    }>();
    const [tender] = await db.select().from(tenders).where(eq(tenders.id, tid)).limit(1);
    if (!tender) return c.json({ error: "Tender not found" }, 404);
    if (tender.tenderStage !== "Bidding") return c.json({ error: "Bidding is closed for this job." }, 400);
    // one bid per supplier per tender — replace if exists
    const existing = await db.select().from(bids).where(and(eq(bids.tenderId, tid), eq(bids.supplierId, p.id))).limit(1);
    const units = Math.max(1, Math.floor(b.unitsOffered || 1));
    const isMachinery = tender.demandType === "Machinery";
    const transferFee = Math.max(0, Math.floor(b.transferFeeTzs || 0));
    const dailyRate = Math.max(0, Math.floor(b.dailyRateTzs || 0));
    // Machinery per-unit price DERIVED from split bid: transferFee + dailyRate * jobDays.
    // Cargo uses flat per-unit price directly.
    const price = isMachinery
      ? transferFee + dailyRate * Math.max(0, tender.jobDays || 0)
      : Math.max(0, Math.floor(b.pricePerUnitTzs || 0));
    const fields = {
      unitsOffered: units,
      pricePerUnitTzs: price,
      transferFeeTzs: isMachinery ? transferFee : 0,
      dailyRateTzs: isMachinery ? dailyRate : 0,
      note: b.note ?? "",
      availabilityNote: b.availabilityNote ?? "",
    };
    if (existing[0]) {
      await db.update(bids).set(fields).where(eq(bids.id, existing[0].id));
    } else {
      await db.insert(bids).values({ id: id("bid"), tenderId: tid, supplierId: p.id, status: "Open", ...fields });
    }
    const priceDesc = isMachinery
      ? `transfer TZS ${transferFee.toLocaleString()} + TZS ${dailyRate.toLocaleString()}/day (= TZS ${price.toLocaleString()}/unit over ${tender.jobDays} days)`
      : `TZS ${price.toLocaleString()} each`;
    await logEvent({ tenderId: tid, actorProfileId: p.id, type: "bid.placed", summary: `${p.companyName} bid ${units} unit(s) @ ${priceDesc}.` });
    await logNotification({ recipientProfileId: tender.clientId, tenderId: tid, subject: "New bid on your job", body: `${p.companyName} placed a bid on "${tender.title}".` });
    return c.json({ ok: true }, 200);
  })
  .post("/tenders/:id/confirm-award", requireAuth, requireRole("client"), async (c) => {
    const tid = c.req.param("id");
    const p = c.get("profile")!;
    const [tender] = await db.select().from(tenders).where(eq(tenders.id, tid)).limit(1);
    if (!tender) return c.json({ error: "Tender not found" }, 404);
    if (tender.clientId !== p.id) return c.json({ error: "Forbidden" }, 403);
    if (tender.tenderStage !== "Bidding") return c.json({ error: "Already awarded." }, 400);
    const tBids = await db.select().from(bids).where(eq(bids.tenderId, tid));
    if (!tBids.length) return c.json({ error: "No bids to award." }, 400);

    const award = computeAward(
      tender.unitsNeeded,
      tBids.map((b) => ({ id: b.id, supplierId: b.supplierId, unitsOffered: b.unitsOffered, pricePerUnitTzs: b.pricePerUnitTzs }))
    );
    if (!award.lines.length) return c.json({ error: "No valid bids could be awarded." }, 400);

    // mark bids
    for (const line of award.lines) {
      await db.update(bids).set({ status: "Awarded" }).where(eq(bids.id, line.bidId));
    }
    if (award.declinedBidIds.length) {
      await db.update(bids).set({ status: "Declined" }).where(inArray(bids.id, award.declinedBidIds));
    }

    // one contract per awarded supplier line, all at the flat fair price
    const flat = award.flatFairPricePerUnitTzs;
    const isMachinery = tender.demandType === "Machinery";
    const bidById = new Map(tBids.map((x) => [x.id, x]));
    const createdContracts: string[] = [];
    for (const line of award.lines) {
      const cid = id("ctr");
      createdContracts.push(cid);
      const wonBid = bidById.get(line.bidId);
      // For machinery, derive a flat-fair daily rate from the flat per-unit price so extension math is fair across suppliers.
      // flat = transferFee + dailyRate * jobDays  →  hold this supplier's own transferFee, recompute dailyRate from flat.
      const transferFee = isMachinery ? (wonBid?.transferFeeTzs ?? 0) : 0;
      const jd = Math.max(1, tender.jobDays || 1);
      const dailyRate = isMachinery ? Math.max(0, Math.round((flat - transferFee) / jd)) : 0;
      // contract base value (fee-exclusive) = units * flat fair per-unit
      const contractValueTzs = line.unitsAwarded * flat;
      const fund = computeAmountToFund(contractValueTzs);
      await db.insert(contracts).values({
        id: cid,
        tenderId: tid,
        clientId: tender.clientId,
        supplierId: line.supplierId,
        assetId: "",
        title: tender.title,
        unitsAwarded: line.unitsAwarded,
        agreedPricePerUnitTzs: flat,
        contractValueTzs,
        clientFeeTzs: fund.clientFeeTzs,
        platformFeeTzs: fund.clientFeeTzs * 2, // total 10% = client 5% + supplier 5%
        routeClassification: tender.routeClassification,
        origin: tender.origin,
        destination: tender.destination,
        startDate: tender.startDate,
        endDate: tender.endDate,
        dailyRateTzs: dailyRate,
        transferFeeTzs: transferFee,
        contractStage: "Awarded",
        milestoneStatus: "AwaitingEscrowDeposit",
      });
      // seed compliance checklist by route for this contract
      const items = checklistFor(tender.routeClassification === "CrossBorder" ? "CrossBorder" : "Domestic").map((permitType) => ({
        id: id("comp"), contractId: cid, permitType, verificationStatus: "Pending",
      }));
      if (items.length) await db.insert(complianceItems).values(items);
      await logNotification({
        recipientProfileId: line.supplierId, tenderId: tid,
        subject: "You've been awarded a job",
        body: `Your bid on "${tender.title}" was awarded ${line.unitsAwarded} unit(s) at the flat fair price TZS ${flat.toLocaleString()}/unit. Please download, sign and upload your agreement.`,
      });
    }

    await db
      .update(tenders)
      .set({ tenderStage: "AwardConfirmed", status: "Awarded", flatFairPriceTzs: flat })
      .where(eq(tenders.id, tid));
    await logEvent({
      tenderId: tid, actorProfileId: p.id, type: "tender.awarded",
      summary: `Award confirmed: ${award.lines.length} supplier(s), ${award.unitsAwarded}/${tender.unitsNeeded} units at flat fair TZS ${flat.toLocaleString()}/unit.`,
      meta: { flatFairPriceTzs: flat, lines: award.lines.length },
    });
    return c.json({ ok: true, award, contracts: createdContracts }, 200);
  })

  // ---- staged gate transitions (strict order, each writes event + notification) ----
  // helper inline guard: advance tender stage if `target` is exactly next
  .post("/tenders/:id/advance/agreements-signed", requireAuth, requireRole("supplier"), async (c) => {
    return advanceStage(c, "AgreementsSigned");
  })
  .post("/tenders/:id/advance/machine-docs", requireAuth, requireRole("supplier"), async (c) => {
    return advanceStage(c, "MachineDocsUploaded");
  })
  // FieldVerified is reached via KAM approval of a submitted field report
  // (POST /inspections/:id/review), NOT a direct advance call.
  .post("/tenders/:id/advance/field-verified", requireAuth, requireRole("key_account", "admin"), async (c) => {
    return c.json({ error: "Field verification advances when the KAM approves the submitted field report." }, 400);
  })
  .post("/tenders/:id/advance/permits-uploaded", requireAuth, requireRole("client"), async (c) => {
    return advanceStage(c, "PermitsUploaded");
  })
  // GATE LOCK: every Permit document must be verified before permits-verified.
  .post("/tenders/:id/advance/permits-verified", requireAuth, requireRole("key_account", "admin"), async (c) => {
    const tid = c.req.param("id");
    const permitDocs = await db.select().from(documents).where(and(eq(documents.tenderId, tid), eq(documents.kind, "Permit")));
    if (!permitDocs.length) return c.json({ error: "No permit documents have been uploaded." }, 400);
    if (permitDocs.some((d) => !d.verifiedBy)) {
      return c.json({ error: "Verify every permit document before releasing this step." }, 400);
    }
    return advanceStage(c, "PermitsVerified");
  })
  .post("/tenders/:id/advance/tt-uploaded", requireAuth, requireRole("client"), async (c) => {
    return advanceStage(c, "TTUploaded");
  })
  // GATE LOCK: a TTProof document must exist and be verified before tt-confirmed.
  .post("/tenders/:id/advance/tt-confirmed", requireAuth, requireRole("key_account", "admin"), async (c) => {
    const tid = c.req.param("id");
    const ttDocs = await db.select().from(documents).where(and(eq(documents.tenderId, tid), eq(documents.kind, "TTProof")));
    if (!ttDocs.length) return c.json({ error: "No payment proof has been uploaded." }, 400);
    if (ttDocs.some((d) => !d.verifiedBy)) {
      return c.json({ error: "Verify the payment proof before confirming escrow." }, 400);
    }
    return advanceStage(c, "TTConfirmed");
  })
  .post("/tenders/:id/advance/execute", requireAuth, requireRole("key_account", "admin"), async (c) => {
    return advanceStage(c, "Executing");
  })

  // ============================================================
  //  CONTRACT HIRE EXTENSIONS (machinery)
  // ============================================================
  // client requests an extension of +N days → preview extra cost (extra + 5% client fee)
  .post("/contracts/:id/extend", requireAuth, requireRole("client"), async (c) => {
    const cid = c.req.param("id");
    const p = c.get("profile")!;
    const b = await c.req.json<{ addedDays: number }>();
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ error: "Contract not found" }, 404);
    if (contract.clientId !== p.id) return c.json({ error: "Forbidden" }, 403);
    if (!contract.dailyRateTzs || !contract.endDate) {
      return c.json({ error: "This contract is not extendable (no daily rate / end date)." }, 400);
    }
    if (contract.removalRight === 1) {
      return c.json({ error: "Extension unavailable — a prior extension lapsed past its due date." }, 400);
    }
    const addedDays = Math.max(1, Math.floor(b.addedDays || 0));
    const units = Math.max(1, contract.unitsAwarded || 1);
    // extra = dailyRate * addedDays * units (no second transfer fee)
    const extraAmountTzs = contract.dailyRateTzs * addedDays * units;
    const clientFeeTzs = Math.round(extraAmountTzs * CLIENT_FEE_RATE);
    const amountToFundTzs = extraAmountTzs + clientFeeTzs;
    const newEndDate = addDays(contract.endDate, addedDays);
    const extId = id("ext");
    await db.insert(extensions).values({
      id: extId,
      contractId: cid,
      addedDays,
      newEndDate,
      extraAmountTzs,
      clientFeeTzs,
      amountToFundTzs,
      status: "PendingPayment",
      dueDate: contract.endDate, // must clear before current end date
    });
    await db.update(contracts).set({ extensionStatus: "AwaitingPayment" }).where(eq(contracts.id, cid));
    const staff = await db.select().from(profile).where(inArray(profile.role, ["key_account", "admin"]));
    await notifyMany([contract.supplierId, ...staff.map((s) => s.id)], {
      tenderId: contract.tenderId ?? "",
      subject: "Hire extension requested",
      body: `The client requested a ${addedDays}-day extension on "${contract.title}". New end date ${newEndDate} pending payment of TZS ${amountToFundTzs.toLocaleString()} (incl. 5% fee).`,
    });
    return c.json({ ok: true, extension: { id: extId, addedDays, newEndDate, extraAmountTzs, clientFeeTzs, amountToFundTzs, dueDate: contract.endDate } }, 200);
  })
  // client uploads TT proof for an extension → marks Paid, extends contract end date
  .post("/contracts/:id/extend/:extId/pay", requireAuth, requireRole("client"), async (c) => {
    const cid = c.req.param("id");
    const extId = c.req.param("extId");
    const p = c.get("profile")!;
    const b = await c.req.json<{ paymentProofUrl?: string }>();
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ error: "Contract not found" }, 404);
    if (contract.clientId !== p.id) return c.json({ error: "Forbidden" }, 403);
    const [ext] = await db.select().from(extensions).where(and(eq(extensions.id, extId), eq(extensions.contractId, cid))).limit(1);
    if (!ext) return c.json({ error: "Extension not found" }, 404);
    if (ext.status === "Paid") return c.json({ error: "Already paid." }, 400);
    if (ext.status === "Lapsed") return c.json({ error: "This extension lapsed and can no longer be paid." }, 400);

    await db.update(extensions).set({ status: "Paid", paymentProofUrl: b.paymentProofUrl ?? "" }).where(eq(extensions.id, extId));
    // extend the contract: new end date, add funded amount to escrow balance
    await db
      .update(contracts)
      .set({
        endDate: ext.newEndDate,
        extensionStatus: "Extended",
        reminderSentAt: "", // reset so the new period can trigger its own reminder
        totalEscrowBalanceTzs: contract.totalEscrowBalanceTzs + ext.amountToFundTzs,
      })
      .where(eq(contracts.id, cid));
    await logNotification({
      recipientProfileId: contract.supplierId,
      tenderId: contract.tenderId ?? "",
      subject: "Hire extension confirmed",
      body: `Extension paid. "${contract.title}" now runs through ${ext.newEndDate}.`,
    });
    return c.json({ ok: true }, 200);
  })
  .get("/contracts/:id/extensions", requireAuth, async (c) => {
    const cid = c.req.param("id");
    const rows = await db.select().from(extensions).where(eq(extensions.contractId, cid)).orderBy(desc(extensions.createdAt));
    return c.json({ extensions: rows }, 200);
  })

  // ---- per-tender messaging ----
  .get("/tenders/:id/messages", requireAuth, async (c) => {
    const tid = c.req.param("id");
    const p = c.get("profile")!;
    const allowed = await canAccessTender(tid, p);
    if (!allowed) return c.json({ error: "Forbidden" }, 403);
    const thread = await db.select().from(messages).where(eq(messages.tenderId, tid)).orderBy(messages.createdAt);
    const ids = [...new Set(thread.map((m) => m.fromProfileId))];
    const ps = ids.length ? await db.select().from(profile).where(inArray(profile.id, ids)) : [];
    const nameOf = new Map(ps.map((x) => [x.id, { name: x.fullName || x.companyName, role: x.role, agentNumber: x.agentNumber, userCode: x.userCode }]));
    return c.json({ messages: thread.map((m) => ({ ...m, from: nameOf.get(m.fromProfileId) ?? { name: "User", role: "" } })) }, 200);
  })
  .post("/tenders/:id/messages", requireAuth, async (c) => {
    const tid = c.req.param("id");
    const p = c.get("profile")!;
    const allowed = await canAccessTender(tid, p);
    if (!allowed) return c.json({ error: "Forbidden" }, 403);
    const b = await c.req.json<{ body: string }>();
    if (!b.body?.trim()) return c.json({ error: "Empty message" }, 400);
    const row = { id: id("msg"), tenderId: tid, fromProfileId: p.id, body: b.body.trim().slice(0, 4000) };
    await db.insert(messages).values(row);
    return c.json({ message: row }, 200);
  })

  // ---- timeline ----
  .get("/tenders/:id/timeline", requireAuth, async (c) => {
    const tid = c.req.param("id");
    const rows = await db.select().from(activityEvents).where(eq(activityEvents.tenderId, tid)).orderBy(desc(activityEvents.createdAt));
    return c.json({ timeline: rows }, 200);
  })

  // ============================================================
  //  ADMIN — expanded ops views
  // ============================================================
  .get("/admin/tenders", requireAuth, requireRole("admin","key_account"), async (c) => {
    const rows = await db.select().from(tenders).orderBy(desc(tenders.createdAt));
    const clientIds = [...new Set(rows.map((t) => t.clientId))];
    const cls = clientIds.length ? await db.select().from(profile).where(inArray(profile.id, clientIds)) : [];
    const nameOf = new Map(cls.map((x) => [x.id, x.companyName]));
    return c.json(
      {
        tenders: rows.map((t) => ({
          ...t,
          clientName: nameOf.get(t.clientId) ?? "Client",
          stageLabel: STAGE_LABEL[t.tenderStage as keyof typeof STAGE_LABEL] ?? t.tenderStage,
          nextActor: STAGE_ACTOR[t.tenderStage as keyof typeof STAGE_ACTOR] ?? "none",
        })),
      },
      200
    );
  })
  .get("/admin/ground-force", requireAuth, requireRole("admin","key_account"), async (c) => {
    const insp = await db.select().from(inspections).orderBy(desc(inspections.createdAt));
    const logs = await db.select().from(borderLogs).orderBy(desc(borderLogs.createdAt));
    return c.json({ inspections: insp, borderLogs: logs }, 200);
  })
  .get("/admin/notifications", requireAuth, requireRole("admin","key_account"), async (c) => {
    const rows = await db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(200);
    const ids = [...new Set(rows.map((n) => n.recipientProfileId))];
    const ps = ids.length ? await db.select().from(profile).where(inArray(profile.id, ids)) : [];
    const nameOf = new Map(ps.map((x) => [x.id, x.companyName]));
    return c.json({ notifications: rows.map((n) => ({ ...n, recipientName: nameOf.get(n.recipientProfileId) ?? "User" })) }, 200);
  })

  // ---- public contact form ----
  .post("/contact", async (c) => {
    const b = await c.req.json<{
      name?: string; company?: string; email?: string; phone?: string; role?: string; message?: string;
    }>().catch(() => ({}));
    if (!b.name?.trim() || !b.email?.trim() || !b.message?.trim()) {
      return c.json({ error: "Name, email and message are required." }, 400);
    }
    await db.insert(contactMessages).values({
      id: id("msg"),
      name: b.name.trim().slice(0, 200),
      company: (b.company ?? "").trim().slice(0, 200),
      email: b.email.trim().slice(0, 200),
      phone: (b.phone ?? "").trim().slice(0, 60),
      role: (b.role ?? "").trim().slice(0, 120),
      message: b.message.trim().slice(0, 5000),
      createdAt: new Date(),
    });
    return c.json({ ok: true }, 200);
  });

export type AppType = typeof app;

// Start the in-process daily scheduler (hire-extension reminders + overdue sweep).
// Runs in both dev (Vite hono plugin loads this module) and prod (server.ts).
import { startScheduler } from "./lib/scheduler";
startScheduler();

export default app;

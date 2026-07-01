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
  reversals,
  staffRequests,
  kybDocuments,
  supportTickets,
  chatMessages,
} from "./database/schema";
import { user as authUser, session } from "./database/auth-schema";
import { authMiddleware, requireAuth, requireRole } from "./middleware/auth";
import { id, manifestRef, nextUserCode } from "./lib/ids";
import { checklistFor, evaluateBreakdown, runSettlement, computeAmountToFund, CLIENT_FEE_RATE, computeReversal, supplierPenaltyPct, stageRank, daysToStart } from "./lib/engine";
import { presignPut, presignGet } from "./lib/s3";
import { computeAward } from "./lib/award";
import { isNextStage, STAGE_ACTOR, STAGE_LABEL } from "./lib/stages";
import { logEvent, logNotification, notifyMany, sendStaffInviteEmail } from "./lib/events";
import { verifyStepUpTotp } from "./lib/step-up";
import { hashPin, verifyPin } from "./lib/pin";
import { issuePaymentProofs, issueInvoice, issueExtensionContract, issueExtensionProofs } from "./lib/proofs";
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

/** Booked working days for a contract — inclusive of both start & end dates. */
function bookedDaysFromContract(ct: { startDate?: string | null; endDate?: string | null }): number {
  if (!ct.startDate || !ct.endDate) return 0;
  const s = new Date(ct.startDate + "T00:00:00Z").getTime();
  const e = new Date(ct.endDate + "T00:00:00Z").getTime();
  if (isNaN(s) || isNaN(e) || e < s) return 0;
  return Math.round((e - s) / 86400000) + 1; // inclusive
}

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
    // Heartbeat: stamp last-seen so KAM auto online/offline can be derived.
    if (p) {
      const now = new Date();
      await db.update(profile).set({ lastSeenAt: now }).where(eq(profile.id, p.id));
      p = { ...p, lastSeenAt: now };
    }
    // Never leak the master PIN hash to the client; expose only a boolean.
    const { masterPinHash, ...safeProfile } = p as typeof p & { masterPinHash?: string };
    return c.json(
      {
        user: {
          ...user,
          // Surface the 2FA enrollment flag so the client can force TOTP setup.
          twoFactorEnabled: (user as { twoFactorEnabled?: boolean }).twoFactorEnabled ?? false,
        },
        profile: { ...safeProfile, hasMasterPin: !!masterPinHash },
      },
      200
    );
  })
  // KAM sets manual activity override (online | offline | meeting | standby).
  .post("/me/activity", requireAuth, async (c) => {
    const p = c.get("profile")!;
    if (p.role !== "key_account" && p.role !== "admin")
      return c.json({ error: "Only managers set activity status." }, 403);
    const { status } = await c.req.json<{ status: string }>();
    if (!["online", "offline", "meeting", "standby"].includes(status))
      return c.json({ error: "Invalid status." }, 400);
    await db.update(profile).set({ kamActivityStatus: status, lastSeenAt: new Date() }).where(eq(profile.id, p.id));
    return c.json({ ok: true }, 200);
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
  // ---- owner: set / change the master PIN used to release payouts ----
  // The master PIN is the owner's second seal on money leaving the platform.
  // It lives only on the owner (allowlisted super-admin) profile.
  .post("/me/master-pin", requireAuth, requireRole("admin"), rateLimit({ windowMs: 60_000, max: 6, bucket: "pin" }), async (c) => {
    const p = c.get("profile")!;
    const user = c.get("user")!;
    if (!isAllowlistedAdmin(user.email)) return c.json({ error: "Only the platform owner can set the master PIN." }, 403);
    const b = await c.req.json<{ currentPin?: string; newPin: string }>().catch(() => ({ newPin: "" }));
    const newPin = String(b.newPin || "");
    if (!/^\d{6,12}$/.test(newPin)) return c.json({ error: "PIN must be 6–12 digits." }, 400);
    // if a PIN is already set, require the current one
    if (p.masterPinHash) {
      if (!b.currentPin || !(await verifyPin(String(b.currentPin), p.masterPinHash))) {
        return c.json({ error: "Current PIN is incorrect." }, 401);
      }
    }
    const hash = await hashPin(newPin);
    await db.update(profile).set({ masterPinHash: hash }).where(eq(profile.id, p.id));
    await logEvent({ actorProfileId: p.id, type: "master_pin.set", summary: `${p.companyName || "Owner"} ${p.masterPinHash ? "changed" : "set"} the payout master PIN.` });
    return c.json({ ok: true, hasPin: true }, 200);
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
  // My Accounts — distinct suppliers this field agent has been assigned to inspect (contact masked)
  .get("/field/my-accounts", requireAuth, requireRole("field", "admin"), async (c) => {
    const me = c.get("profile")!;
    const rows = me.role === "admin"
      ? await db.select().from(inspections).orderBy(desc(inspections.createdAt))
      : await db.select().from(inspections).where(eq(inspections.assignedFieldId, me.id)).orderBy(desc(inspections.createdAt));
    const bySupplier = new Map<string, { count: number; last: number }>();
    for (const r of rows) {
      if (!r.supplierId) continue;
      const cur = bySupplier.get(r.supplierId);
      const ts = r.createdAt instanceof Date ? r.createdAt.getTime() : Number(r.createdAt || 0);
      if (cur) { cur.count++; cur.last = Math.max(cur.last, ts); }
      else bySupplier.set(r.supplierId, { count: 1, last: ts });
    }
    const out = await Promise.all([...bySupplier.entries()].map(async ([sid, agg]) => {
      const [s] = await db.select().from(profile).where(eq(profile.id, sid)).limit(1);
      const assetRows = s ? await db.select().from(assets).where(eq(assets.supplierId, sid)) : [];
      return {
        supplierId: sid,
        name: s ? (s.companyName || s.fullName) : "—",
        userCode: s?.userCode ?? "",
        contactMasked: (s?.phone || "").replace(/.(?=.{2})/g, "•"),
        yardLocation: s?.address || "",
        verificationStatus: s?.verificationStatus ?? "",
        assetCount: assetRows.length,
        inspections: agg.count,
        lastSeen: agg.last,
      };
    }));
    out.sort((a, b) => b.lastSeen - a.lastSeen);
    return c.json({ accounts: out }, 200);
  })
  // Spare-part deliveries routed to this field agent (escrow-credit emergency parts)
  .get("/field/part-deliveries", requireAuth, requireRole("field", "admin"), async (c) => {
    const me = c.get("profile")!;
    const base = await db.select().from(partOrders).where(eq(partOrders.deliverTo, "FieldAgent")).orderBy(desc(partOrders.createdAt));
    const out = await Promise.all(base.map(async (o) => {
      const [part] = o.partId ? await db.select().from(parts).where(eq(parts.id, o.partId)).limit(1) : [];
      const [contract] = o.contractId ? await db.select().from(contracts).where(eq(contracts.id, o.contractId)).limit(1) : [];
      return { ...o, partName: part?.name ?? "Spare part", partSku: (part as any)?.sku ?? "", contractTitle: contract?.title ?? "" };
    }));
    return c.json({ deliveries: out }, 200);
  })
  // Field agent confirms a routed spare part was received on site
  .post("/field/part-deliveries/:id/received", requireAuth, requireRole("field", "admin"), async (c) => {
    const oid = c.req.param("id");
    const me = c.get("profile")!;
    const [order] = await db.select().from(partOrders).where(eq(partOrders.id, oid)).limit(1);
    if (!order) return c.json({ error: "Order not found." }, 404);
    if (order.deliverTo !== "FieldAgent") return c.json({ error: "This delivery is not routed to a field agent." }, 403);
    if (order.status !== "Dispatched") return c.json({ error: "Only dispatched parts can be marked received." }, 400);
    await db.update(partOrders).set({ status: "Delivered" }).where(eq(partOrders.id, oid));
    await logEvent({ contractId: order.contractId, actorProfileId: me.id, type: "part.delivered", summary: `${me.fullName || "Field agent"} confirmed receipt of spare part on site.` });
    return c.json({ ok: true }, 200);
  })

  // ============================================================
  //  KAM/Admin — document-view step-up (real authenticator TOTP)
  //  Before opening a sensitive document, the staff member must enter a
  //  live 6-digit code from their authenticator app. The code is verified
  //  against their enrolled TOTP secret (no simulated codes), and every
  //  access attempt is logged to Admin notifications + the audit trail.
  // ============================================================
  .post("/chat/doc-otp/verify", requireAuth, requireRole("key_account", "admin"), rateLimit({ windowMs: 60_000, max: 8, bucket: "docotp" }), async (c) => {
    const me = c.get("profile")!;
    const user = c.get("user")!;
    const { docId, code } = await c.req.json().catch(() => ({}));
    if (!docId || !code) return c.json({ error: "docId and code required" }, 400);
    const [doc] = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
    if (!doc) return c.json({ error: "Document not found." }, 404);
    const ok = await verifyStepUpTotp(user.id, String(code));
    if (!ok) {
      await logEvent({ actorProfileId: me.id, type: "doc_open_denied", summary: `${me.fullName || "Staff"} (${me.userCode}) entered an invalid authenticator code trying to open "${doc.label || doc.kind}".`, meta: { docId } });
      return c.json({ error: "Incorrect authenticator code." }, 401);
    }
    const admins = await db.select().from(profile).where(eq(profile.role, "admin"));
    await notifyMany(admins.map((a) => a.id), {
      subject: "Document opened",
      body: `${me.fullName || me.companyName || "A staff member"} (${me.userCode}) confirmed with their authenticator and opened "${doc.label || doc.kind}".`,
    });
    await logEvent({ actorProfileId: me.id, type: "doc_opened", summary: `${me.fullName || "Staff"} (${me.userCode}) opened "${doc.label || doc.kind}" after authenticator verification.`, meta: { docId } });
    return c.json({ ok: true, url: doc.url ?? null }, 200);
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
      // Enrich each asset with its job history + a live-job flag (for the supplier's read-only fleet view).
      const enriched = await Promise.all(rows.map(async (a) => {
        const ctrs = await db.select().from(contracts).where(eq(contracts.assetId, a.id)).orderBy(desc(contracts.createdAt));
        const liveStatuses = ["ActiveTransit", "BreakdownIncident"];
        const liveJobs = ctrs.filter((c2) => liveStatuses.includes(c2.milestoneStatus));
        const jobs = ctrs.map((c2) => ({ id: c2.id, title: c2.title, status: c2.milestoneStatus, destination: c2.destination, startDate: c2.startDate, endDate: c2.endDate }));
        return {
          ...a,
          jobs,
          liveJobCount: liveJobs.length,
          onLiveJob: liveJobs.length > 0,
          doubleEntry: liveJobs.length > 1, // same asset committed to >1 live job at once → red flag
        };
      }));
      return c.json({ assets: enriched }, 200);
    }
    rows = await db.select().from(assets).orderBy(desc(assets.createdAt));
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
  // STEP 1 — supplier marks the job/task complete (front gate of the payout chain)
  .post("/contracts/:id/mark-complete", requireAuth, requireRole("supplier"), async (c) => {
    const cid = c.req.param("id");
    const p = c.get("profile")!;
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ message: "Not found" }, 404);
    if (contract.supplierId !== p.id) return c.json({ error: "Forbidden" }, 403);
    if (contract.milestoneStatus === "FundsDisbursed") return c.json({ error: "Already settled." }, 400);
    if (contract.payoutStatus && contract.payoutStatus !== "None")
      return c.json({ error: "Task already marked complete." }, 400);
    const b = await c.req.json<{ remarks?: string }>().catch(() => ({}));
    await db
      .update(contracts)
      .set({ payoutStatus: "TaskComplete", taskCompletedAt: new Date(), completionRemarks: (b.remarks ?? "").slice(0, 1000) })
      .where(eq(contracts.id, cid));
    await logEvent({ contractId: cid, tenderId: contract.tenderId ?? "", actorProfileId: p.id, type: "task.complete", summary: `${p.companyName || "Supplier"} marked "${contract.title}" complete. Awaiting client sign-off.` });
    await logNotification({ recipientProfileId: contract.clientId, tenderId: contract.tenderId ?? "", subject: "Task complete — please sign off", body: `${p.companyName || "Your supplier"} marked "${contract.title}" complete. Review and sign off to release payment.` });
    return c.json({ ok: true }, 200);
  })
  // STEP 2 — client sign-off (requires supplier TaskComplete first) → hands to KAM
  .post("/contracts/:id/sign-off", requireAuth, requireRole("client"), async (c) => {
    const cid = c.req.param("id");
    const p = c.get("profile")!;
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ message: "Not found" }, 404);
    if (contract.clientId !== p.id) return c.json({ error: "Forbidden" }, 403);
    if (contract.milestoneStatus === "FundsDisbursed") return c.json({ message: "Already disbursed" }, 400);
    if (contract.payoutStatus !== "TaskComplete")
      return c.json({ error: "The supplier must mark the task complete before you can sign off." }, 400);

    await db
      .update(contracts)
      .set({ signedOffAt: new Date(), payoutStatus: "AwaitingKamSubmission", milestoneStatus: "SignedOff" })
      .where(eq(contracts.id, cid));
    if (contract.assetId) await db.update(assets).set({ operationalStatus: "Available" }).where(eq(assets.id, contract.assetId));

    await logEvent({ contractId: cid, tenderId: contract.tenderId ?? "", actorProfileId: p.id, type: "contract.signoff", summary: `Client signed off "${contract.title}". Payout pending KAM submission.` });
    // notify all KAMs + admins to process the payout
    const staff = await db.select().from(profile).where(inArray(profile.role, ["key_account", "admin"]));
    await notifyMany(staff.map((s) => s.id), {
      tenderId: contract.tenderId ?? "",
      subject: "Sign-off received — submit payout request",
      body: `Client signed off "${contract.title}". Review the supplier bank details and submit the payment request for execution.`,
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
    const proofUrl = contract.payoutProofKey ? await presignGet(contract.payoutProofKey) : "";
    // settlement preview
    const baseValue = contract.contractValueTzs || contract.totalEscrowBalanceTzs;
    const preview = runSettlement(baseValue, contract.emergencyCreditDeductedTzs);
    // does the current admin hold a master PIN (i.e. can they release)?
    const canRelease = p.role === "admin" && !!p.masterPinHash;
    return c.json({ contract, bank: isStaff ? bank : null, proofUrl, payoutStatus: contract.payoutStatus, preview, canRelease }, 200);
  })
  // STEP 3 — KAM submits the payment request for execution (NO upload) → admin queue.
  // The KAM is the maker: they confirm the sign-off and supplier bank details are
  // in order, then hand the actual bank instruction + proof to the admin (checker).
  .post("/contracts/:id/payout-slip", requireAuth, requireRole("key_account", "admin"), async (c) => {
    const cid = c.req.param("id");
    const p = c.get("profile")!;
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ message: "Not found" }, 404);
    if (contract.payoutStatus !== "AwaitingKamSubmission") {
      return c.json({ error: "Contract is not awaiting KAM submission (client must sign off first)." }, 400);
    }
    await db
      .update(contracts)
      .set({ payoutStatus: "PendingAdminApproval", kamSubmittedAt: new Date() })
      .where(eq(contracts.id, cid));
    await logEvent({ contractId: cid, tenderId: contract.tenderId ?? "", actorProfileId: p.id, type: "payout.submitted", summary: `${p.companyName || "KAM"} submitted the payment request for "${contract.title}" for admin approval.` });
    const admins = await db.select().from(profile).where(eq(profile.role, "admin"));
    await notifyMany(admins.map((a) => a.id), { tenderId: contract.tenderId ?? "", subject: "Payment request awaiting approval", body: `A payment request for "${contract.title}" is ready for you to instruct the bank transfer, upload proof, and release.` });
    return c.json({ ok: true }, 200);
  })
  // STEP 4 — admin instructs the bank transfer, uploads the TT proof, and releases.
  // Release requires a fresh authenticator code (TOTP) + the owner's master PIN.
  // Only the owner (super-admin holding a master PIN) can release funds.
  .post("/contracts/:id/approve-release", requireAuth, requireRole("admin"), async (c) => {
    const cid = c.req.param("id");
    const p = c.get("profile")!;
    const user = c.get("user")!;
    const b = await c.req.json<{ payoutProofKey?: string; totp?: string; pin?: string }>().catch(() => ({}));
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ message: "Not found" }, 404);
    if (contract.payoutStatus !== "PendingAdminApproval") return c.json({ error: "Nothing to release. The KAM must submit the payment request first." }, 400);

    // Bank-transfer proof is mandatory — every payment out is evidenced by an uploaded TT copy.
    if (!b.payoutProofKey) return c.json({ error: "Upload the bank transfer (TT) proof before releasing." }, 400);

    // Master PIN is set on the owner profile only. Verify it belongs to this admin.
    if (!p.masterPinHash) return c.json({ error: "You are not authorised to release payments. A master PIN must be set by the platform owner." }, 403);
    if (!b.pin || !(await verifyPin(String(b.pin), p.masterPinHash))) {
      await logEvent({ contractId: cid, tenderId: contract.tenderId ?? "", actorProfileId: p.id, type: "payout.denied", summary: `${p.companyName || "Admin"} entered an incorrect master PIN attempting to release "${contract.title}".` });
      return c.json({ error: "Incorrect master PIN." }, 401);
    }
    // Fresh authenticator (TOTP) step-up.
    const totpOk = await verifyStepUpTotp(user.id, String(b.totp || ""));
    if (!totpOk) {
      await logEvent({ contractId: cid, tenderId: contract.tenderId ?? "", actorProfileId: p.id, type: "payout.denied", summary: `${p.companyName || "Admin"} entered an invalid authenticator code attempting to release "${contract.title}".` });
      return c.json({ error: "Incorrect authenticator code." }, 401);
    }

    const baseValue = contract.contractValueTzs || contract.totalEscrowBalanceTzs;
    const s = runSettlement(baseValue, contract.emergencyCreditDeductedTzs);
    await db
      .update(contracts)
      .set({
        platformFeeTzs: s.platformFeeTzs,
        supplierPayoutTzs: s.supplierPayoutTzs,
        payoutProofKey: b.payoutProofKey,
        milestoneStatus: "FundsDisbursed",
        payoutStatus: "Approved",
        adminApprovedAt: new Date(),
      })
      .where(eq(contracts.id, cid));
    await db.insert(invoices).values([
      { id: id("inv"), contractId: cid, party: "Client", lineItems: s.clientLineItems, totalTzs: baseValue + Math.round(baseValue * 0.05) },
      { id: id("inv"), contractId: cid, party: "Supplier", lineItems: s.supplierLineItems, totalTzs: s.supplierPayoutTzs },
    ]);
    await logEvent({ contractId: cid, tenderId: contract.tenderId ?? "", actorProfileId: p.id, type: "payout.released", summary: `${p.companyName || "Admin"} approved and released payment for "${contract.title}". Settlement locked.` });
    const staff = await db.select().from(profile).where(eq(profile.role, "key_account"));
    await notifyMany([contract.clientId, contract.supplierId, ...staff.map((x) => x.id)], { tenderId: contract.tenderId ?? "", subject: "Payment released", body: `Payment for "${contract.title}" has been approved and released. The deal is settled.` });
    return c.json({ ok: true, settlement: s }, 200);
  })

  // ======================================================================
  //  REVERSALS — cancellation / refund / shortened (cut-off) contracts
  //  Chain: Client requests → KAM reviews → Admin approves & executes.
  //  Money SIMULATED ("funds tracked, not held"). Refund dest = bank.
  // ======================================================================

  // helper to build a ReversalInput from a contract row
  // (inlined per-route below; bookedDays derived from start/end dates)

  // CLIENT requests a reversal — returns a server-computed preview, stores Requested.
  .post("/contracts/:id/reversal/request", requireAuth, requireRole("client"), async (c) => {
    const cid = c.req.param("id");
    const p = c.get("profile")!;
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ message: "Not found" }, 404);
    if (contract.clientId !== p.id) return c.json({ error: "Forbidden" }, 403);
    if (contract.milestoneStatus === "FundsDisbursed")
      return c.json({ error: "This contract is already settled and cannot be reversed." }, 400);
    if (contract.cancelStatus === "Requested")
      return c.json({ error: "A reversal request is already in progress for this contract." }, 400);
    if (contract.cancelStatus === "Reversed")
      return c.json({ error: "This contract has already been reversed." }, 400);

    const b = await c.req.json<{ reason: "Cancel" | "Refund" | "Shorten"; actualDays?: number; note?: string }>();
    const reason = b.reason;
    if (!["Cancel", "Refund", "Shorten"].includes(reason)) return c.json({ error: "Invalid reason." }, 400);

    const stage = contract.contractStage || "Awarded";
    const bookedDays = bookedDaysFromContract(contract);
    if (reason === "Shorten" && (bookedDays <= 0 || !contract.dailyRateTzs))
      return c.json({ error: "This contract has no daily-hire term to shorten." }, 400);

    const preview = computeReversal({
      reason,
      stage,
      startDateIso: contract.startDate || new Date().toISOString().slice(0, 10),
      contractValueTzs: contract.contractValueTzs || contract.totalEscrowBalanceTzs,
      clientFeePaidTzs: contract.clientFeeTzs,
      emergencyCreditDeductedTzs: contract.emergencyCreditDeductedTzs,
      transferFeeTzs: contract.transferFeeTzs,
      dailyRateTzs: contract.dailyRateTzs,
      units: contract.unitsAwarded || 1,
      bookedDays,
      actualDays: reason === "Shorten" ? b.actualDays : undefined,
    });
    if (!preview.balanced) return c.json({ error: "Reversal failed a balance check. Admin has been notified." }, 422);

    const rid = id("rev");
    await db.insert(reversals).values({
      id: rid,
      contractId: cid,
      tenderId: contract.tenderId ?? "",
      requestedByProfileId: p.id,
      reason,
      stageAtRequest: stage,
      actualDays: reason === "Shorten" ? Math.max(0, Math.min(b.actualDays ?? bookedDays, bookedDays)) : null,
      clientNote: (b.note ?? "").slice(0, 1000),
      status: "Requested",
      lineItems: { client: preview.clientLineItems, supplier: preview.supplierLineItems, nguzo: preview.nguzoLineItems },
    });
    await db.update(contracts).set({ cancelStatus: "Requested" }).where(eq(contracts.id, cid));

    await logEvent({ contractId: cid, tenderId: contract.tenderId ?? "", actorProfileId: p.id, type: "reversal.requested", summary: `${p.companyName || "Client"} requested a ${reason.toLowerCase()} on "${contract.title}". Awaiting KAM review.` });
    const staff = await db.select().from(profile).where(inArray(profile.role, ["key_account", "admin"]));
    await notifyMany(staff.map((s) => s.id), { tenderId: contract.tenderId ?? "", subject: `Reversal requested — ${reason}`, body: `${p.companyName || "A client"} requested a ${reason.toLowerCase()} on "${contract.title}". Review the figures and forward to admin.` });
    return c.json({ ok: true, id: rid, preview }, 200);
  })

  // KAM reviews a reversal — approve-forward to admin, or reject back to client.
  .post("/reversals/:id/review", requireAuth, requireRole("key_account", "admin"), async (c) => {
    const rid = c.req.param("id");
    const p = c.get("profile")!;
    const b = await c.req.json<{ decision: "Forward" | "Reject"; note?: string }>();
    const [rev] = await db.select().from(reversals).where(eq(reversals.id, rid)).limit(1);
    if (!rev) return c.json({ message: "Not found" }, 404);
    if (rev.status !== "Requested") return c.json({ error: "This reversal is not awaiting review." }, 400);
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, rev.contractId)).limit(1);

    if (b.decision === "Reject") {
      await db.update(reversals).set({ status: "Rejected", kamReviewedBy: p.id, kamNote: (b.note ?? "").slice(0, 1000), resolvedAt: new Date() }).where(eq(reversals.id, rid));
      if (contract) await db.update(contracts).set({ cancelStatus: "None" }).where(eq(contracts.id, contract.id));
      await logEvent({ contractId: rev.contractId, tenderId: rev.tenderId, actorProfileId: p.id, type: "reversal.rejected", summary: `${p.companyName || "KAM"} declined the ${rev.reason.toLowerCase()} request${b.note ? ` — ${b.note}` : ""}.` });
      await logNotification({ recipientProfileId: rev.requestedByProfileId, tenderId: rev.tenderId, subject: "Reversal request declined", body: `Your ${rev.reason.toLowerCase()} request on "${contract?.title || "the contract"}" was declined.${b.note ? ` Reason: ${b.note}` : ""}` });
      return c.json({ ok: true }, 200);
    }

    await db.update(reversals).set({ status: "KamReviewed", kamReviewedBy: p.id, kamNote: (b.note ?? "").slice(0, 1000) }).where(eq(reversals.id, rid));
    await logEvent({ contractId: rev.contractId, tenderId: rev.tenderId, actorProfileId: p.id, type: "reversal.reviewed", summary: `${p.companyName || "KAM"} reviewed the ${rev.reason.toLowerCase()} request and forwarded it to admin.` });
    const admins = await db.select().from(profile).where(eq(profile.role, "admin"));
    await notifyMany(admins.map((a) => a.id), { tenderId: rev.tenderId, subject: "Reversal awaiting approval", body: `A ${rev.reason.toLowerCase()} on "${contract?.title || "a contract"}" was reviewed by ${p.companyName || "a KAM"} and is ready for your approval.` });
    return c.json({ ok: true }, 200);
  })

  // ADMIN approves & executes — recomputes server-side, writes ledger + money snapshot.
  .post("/reversals/:id/approve", requireAuth, requireRole("admin"), async (c) => {
    const rid = c.req.param("id");
    const p = c.get("profile")!;
    const b = await c.req.json<{ reversalSlipKey?: string }>().catch(() => ({}));
    const [rev] = await db.select().from(reversals).where(eq(reversals.id, rid)).limit(1);
    if (!rev) return c.json({ message: "Not found" }, 404);
    if (rev.status !== "KamReviewed") return c.json({ error: "A KAM must review this reversal before approval." }, 400);
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, rev.contractId)).limit(1);
    if (!contract) return c.json({ message: "Contract not found" }, 404);
    if (contract.milestoneStatus === "FundsDisbursed") return c.json({ error: "Contract already settled." }, 400);

    // RECOMPUTE server-side — never trust the stored/client figures.
    const bookedDays = bookedDaysFromContract(contract);
    const result = computeReversal({
      reason: rev.reason as "Cancel" | "Refund" | "Shorten",
      stage: rev.stageAtRequest || contract.contractStage || "Awarded",
      startDateIso: contract.startDate || new Date().toISOString().slice(0, 10),
      contractValueTzs: contract.contractValueTzs || contract.totalEscrowBalanceTzs,
      clientFeePaidTzs: contract.clientFeeTzs,
      emergencyCreditDeductedTzs: contract.emergencyCreditDeductedTzs,
      transferFeeTzs: contract.transferFeeTzs,
      dailyRateTzs: contract.dailyRateTzs,
      units: contract.unitsAwarded || 1,
      bookedDays,
      actualDays: rev.reason === "Shorten" ? rev.actualDays ?? bookedDays : undefined,
    });
    if (!result.balanced) return c.json({ error: "Reversal failed its balance invariant — refusing to execute. Resolve manually." }, 422);

    const now = new Date();
    await db.update(reversals).set({
      status: "Executed",
      adminApprovedBy: p.id,
      reversalSlipKey: (b.reversalSlipKey ?? "").slice(0, 300),
      clientRefundTzs: result.clientRefundTzs,
      nguzoFeeKeptTzs: result.nguzoFeeKeptTzs,
      nguzoFeeRefundedTzs: result.nguzoFeeRefundedTzs,
      supplierPenaltyTzs: result.supplierPenaltyTzs,
      transferFeeKeptTzs: result.transferFeeKeptTzs,
      partsDeductedTzs: result.partsDeductedTzs,
      retainedInEscrowTzs: result.retainedInEscrowTzs,
      newContractValueTzs: result.newContractValueTzs,
      lineItems: { client: result.clientLineItems, supplier: result.supplierLineItems, nguzo: result.nguzoLineItems },
      resolvedAt: now,
    }).where(eq(reversals.id, rid));

    if (rev.reason === "Shorten") {
      const actual = Math.max(0, Math.min(rev.actualDays ?? bookedDays, bookedDays));
      await db.update(contracts).set({
        cancelStatus: "Reversed",
        actualDaysWorked: actual,
        contractValueTzs: result.newContractValueTzs,
        totalEscrowBalanceTzs: result.retainedInEscrowTzs + Math.round(result.newContractValueTzs * CLIENT_FEE_RATE),
      }).where(eq(contracts.id, contract.id));
    } else {
      await db.update(contracts).set({ cancelStatus: "Reversed", status: "Cancelled", milestoneStatus: "Cancelled" }).where(eq(contracts.id, contract.id));
      if (contract.assetId) await db.update(assets).set({ operationalStatus: "Available" }).where(eq(assets.id, contract.assetId));
    }

    await logEvent({
      contractId: contract.id,
      tenderId: rev.tenderId,
      actorProfileId: p.id,
      type: "reversal.executed",
      summary: `${p.companyName || "Admin"} executed a ${rev.reason.toLowerCase()} on "${contract.title}". Client refund TZS ${result.clientRefundTzs.toLocaleString()}; supplier ${result.supplierAdjustmentTzs ? `keeps TZS ${result.supplierAdjustmentTzs.toLocaleString()}` : "no charge"}.`,
      meta: {
        reason: rev.reason,
        clientRefundTzs: result.clientRefundTzs,
        nguzoFeeKeptTzs: result.nguzoFeeKeptTzs,
        nguzoFeeRefundedTzs: result.nguzoFeeRefundedTzs,
        supplierPenaltyTzs: result.supplierPenaltyTzs,
        transferFeeKeptTzs: result.transferFeeKeptTzs,
        partsDeductedTzs: result.partsDeductedTzs,
        retainedInEscrowTzs: result.retainedInEscrowTzs,
        newContractValueTzs: result.newContractValueTzs,
      },
    });
    const staff = await db.select().from(profile).where(eq(profile.role, "key_account"));
    await notifyMany([contract.clientId, contract.supplierId, ...staff.map((x) => x.id)], {
      tenderId: rev.tenderId,
      subject: `Reversal executed — ${rev.reason}`,
      body: `The ${rev.reason.toLowerCase()} on "${contract.title}" was approved and executed. Client refund: TZS ${result.clientRefundTzs.toLocaleString()} (tracked, not held).`,
    });
    return c.json({ ok: true, result }, 200);
  })

  // READ — single contract's reversal (any party on the contract)
  .get("/contracts/:id/reversal", requireAuth, async (c) => {
    const cid = c.req.param("id");
    const p = c.get("profile")!;
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ message: "Not found" }, 404);
    const isParty = contract.clientId === p.id || contract.supplierId === p.id || p.role === "key_account" || p.role === "admin";
    if (!isParty) return c.json({ error: "Forbidden" }, 403);
    const rows = await db.select().from(reversals).where(eq(reversals.contractId, cid)).orderBy(desc(reversals.createdAt));
    const slipUrl = rows[0]?.reversalSlipKey ? await presignGet(rows[0].reversalSlipKey) : "";
    return c.json({ reversals: rows, slipUrl }, 200);
  })

  // READ — role-scoped reversal list for dashboards/queues
  .get("/reversals", requireAuth, async (c) => {
    const p = c.get("profile")!;
    const rows = await db.select().from(reversals).orderBy(desc(reversals.createdAt));
    let scoped = rows;
    if (p.role === "admin" || p.role === "key_account") {
      // staff see all (KAM queue filters client-side on status)
    } else {
      // client/supplier see only reversals touching their own contracts
      const myContracts = await db.select({ id: contracts.id }).from(contracts).where(p.role === "client" ? eq(contracts.clientId, p.id) : eq(contracts.supplierId, p.id));
      const ids = new Set(myContracts.map((x) => x.id));
      scoped = rows.filter((r) => ids.has(r.contractId));
    }
    return c.json({ reversals: scoped }, 200);
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
    const b = await c.req.json<{ partId: string; deliverTo?: "MachineSupplier" | "FieldAgent"; qty?: number; receiverName?: string; receiverDestination?: string }>();
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ message: "Contract not found" }, 404);
    if (contract.supplierId !== p.id) return c.json({ error: "Forbidden" }, 403);
    const [part] = await db.select().from(parts).where(eq(parts.id, b.partId)).limit(1);
    if (!part) return c.json({ message: "Part not found" }, 404);
    if (part.status === "OutOfStock" || part.stockQty <= 0) return c.json({ error: "That part is out of stock." }, 400);
    const qty = Math.max(1, Math.min(b.qty ?? 1, part.stockQty));

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
      qty,
      receiverName: (b.receiverName ?? "").slice(0, 120),
      receiverDestination: (b.receiverDestination ?? "").slice(0, 200),
      retailCostTzs: part.retailCostTzs,
      totalCostTzs: (part.retailCostTzs + part.logisticsHandlingFeeTzs) * qty,
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
    const orderQty = Math.max(1, order.qty || 1);
    const newQty = Math.max(0, part.stockQty - orderQty);
    await db.update(parts).set({ stockQty: newQty, status: newQty <= 0 ? "OutOfStock" : "Active" }).where(eq(parts.id, part.id));
    await db.update(partOrders).set({ status: "Dispatched", courier: b.courier ?? order.courier ?? "Shabiby", waybillRef: b.waybillRef ?? "" }).where(eq(partOrders.id, oid));
    await logEvent({ contractId: order.contractId, actorProfileId: p.id, type: "parts.dispatched", summary: `${part.partName} dispatched via ${b.courier ?? order.courier} (waybill ${b.waybillRef ?? "—"}).` });
    await notifyMany([order.requestedByProfileId, order.kamId].filter(Boolean), { subject: "Spare dispatched", body: `${part.partName} is on its way (${b.courier ?? order.courier}, waybill ${b.waybillRef ?? "—"}).` });
    return c.json({ ok: true }, 200);
  })
  // Parts Supplier: generate a simulated EFD receipt once the part is dispatched/delivered (payment cleared)
  .post("/part-orders/:id/generate-receipt", requireAuth, requireRole("parts_supplier", "admin"), async (c) => {
    const oid = c.req.param("id");
    const p = c.get("profile")!;
    const [order] = await db.select().from(partOrders).where(eq(partOrders.id, oid)).limit(1);
    if (!order) return c.json({ message: "Order not found" }, 404);
    if (!["Dispatched", "Delivered"].includes(order.status)) return c.json({ error: "EFD receipt is issued after the part is dispatched." }, 400);
    if (order.efdNumber) return c.json({ ok: true, efdNumber: order.efdNumber }, 200); // idempotent
    // Simulated EFD/TRA receipt number (format: 12 digits, like a TZ fiscal receipt)
    const efdNumber = "EFD" + Math.floor(100000000000 + Math.random() * 899999999999).toString();
    await db.update(partOrders).set({ efdNumber }).where(eq(partOrders.id, oid));
    await logEvent({ contractId: order.contractId, actorProfileId: p.id, type: "parts.receipt", summary: `EFD receipt ${efdNumber} issued for the spare order.` });
    await notifyMany([order.requestedByProfileId, order.kamId].filter(Boolean), { subject: "EFD receipt issued", body: `An EFD receipt (${efdNumber}) is available for your spare order.` });
    return c.json({ ok: true, efdNumber }, 200);
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
      frontPhotoKey?: string; backPhotoKey?: string;
    }>();
    // Tender-linked reports require both machine photos (front + back) before submission.
    if (b.tenderId && b.submit && (!b.frontPhotoKey || !b.backPhotoKey)) {
      return c.json({ error: "Both front and back machine photos are required before submitting." }, 400);
    }
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
      frontPhotoKey: b.frontPhotoKey ?? "",
      backPhotoKey: b.backPhotoKey ?? "",
      docsChecked: !!b.docsChecked,
      machineInspected: !!b.machineInspected,
      reportStatus: isTenderReport ? (submit ? "Submitted" : "Draft") : "Approved",
    };
    await db.insert(inspections).values(row);
    if (b.assetId) {
      const photoUpdate: { auditTimestamp: Date; photos?: string[] } = { auditTimestamp: new Date() };
      // Save the 2 mandatory machine photos onto the inspected asset's fleet record.
      const machinePhotos = [b.frontPhotoKey, b.backPhotoKey].filter((k): k is string => !!k);
      if (machinePhotos.length) photoUpdate.photos = machinePhotos;
      await db.update(assets).set(photoUpdate).where(eq(assets.id, b.assetId));
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
      .where(inArray(profile.role, ["client", "supplier", "parts_supplier", "key_account", "field"]));
    const withDocs = await Promise.all(
      rows.map(async (r) => {
        const docs = await db.select().from(kybDocuments).where(eq(kybDocuments.profileId, r.id));
        return { ...r, documentCount: docs.length };
      })
    );
    const remote = withDocs.filter((r) => r.role === "client");
    const siteVisit = withDocs.filter((r) => r.role === "supplier" || r.role === "parts_supplier");
    // internal staff (KAM / field) still pending KYC verification
    const staff = withDocs.filter((r) => ["key_account", "field"].includes(r.role) && r.verificationStatus !== "Verified");
    return c.json({ remote, siteVisit, staff }, 200);
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
      b.status === "Verified" ? "You're verified on AFRIGEN Link" :
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
        fullName: profile.fullName,
        phone: profile.phone,
        managerId: profile.managerId,
        fieldStation: profile.fieldStation,
        username: profile.username,
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
    // Internal staff roles only — external user roles (client/supplier/parts) are
    // FIXED at registration and can never be changed afterwards.
    if (!["admin", "key_account", "field"].includes(b.role)) {
      return c.json({ error: "Role is fixed after registration. Only internal staff roles can be reassigned." }, 400);
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
    // Cannot convert an external user (client/supplier/parts) into staff or vice-versa.
    if (["client", "supplier", "parts_supplier"].includes(target[0].role)) {
      return c.json({ error: "This is an external account. Its role is fixed at registration." }, 403);
    }
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
    const b = await c.req.json<{ username: string; password?: string; name: string; role: string; phone?: string; email?: string; managerId?: string; fieldStation?: string }>();
    const uname = (b.username ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (!uname || !b.name?.trim()) return c.json({ error: "Username and full name are required." }, 400);
    if (uname.length < 3) return c.json({ error: "Username must be at least 3 characters." }, 400);
    // A real contact email is required — the invite + login codes + notifications go there.
    const contactEmail = (b.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) return c.json({ error: "A valid contact email is required — the invite and sign-in codes are sent there." }, 400);
    // Staff are internal roles only.
    if (!["admin", "key_account", "field"].includes(b.role)) return c.json({ error: "Only Admin, Key Account Manager and Field Agent staff can be created here." }, 400);
    // username must be unique across profiles
    const dupe = await db.select().from(profile).where(eq(profile.username, uname)).limit(1);
    if (dupe.length) return c.json({ error: "That username is already taken." }, 400);
    // Synthesize an internal email for better-auth (it is email-keyed).
    const synthEmail = `${uname}@staff.afrigen.local`;
    const existing = await db.select().from(authUser).where(eq(authUser.email, synthEmail)).limit(1);
    if (existing.length) return c.json({ error: "That username is already taken." }, 400);
    const tempPassword = (b.password && b.password.length >= 8) ? b.password : `AfriLink-${Math.random().toString(36).slice(2, 8)}!`;
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
      contactEmail,
      phone: b.phone ?? "", agentNumber: b.role === "field" ? code.replace("AGL-", "") : "",
      managerId: b.managerId ?? "",
      fieldStation: b.role === "field" ? (b.fieldStation === "border" ? "border" : "yard") : "",
      mustChangePassword: true,
      onboardingComplete: false,
      // Staff identity is trusted (admin-created) but KYC still required before live work.
      verificationStatus: "Submitted",
    });
    // Email the invite (username + temp password + instructions) to the contact inbox.
    const origin = new URL(c.req.url).origin;
    const emailed = await sendStaffInviteEmail({
      to: contactEmail,
      name: b.name.trim(),
      role: b.role,
      username: uname,
      tempPassword,
      loginUrl: `${origin}/app`,
    });
    return c.json({ ok: true, profileId: pid, username: uname, tempPassword, userCode: code, emailed }, 200);
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
  // Admin: reset a user's password (forgot-password). Issues a temp password,
  // revokes their sessions, and forces a change on next login.
  .post("/admin/staff/:profileId/reset-password", requireAuth, requireRole("admin"), async (c) => {
    const pid = c.req.param("profileId");
    const me = c.get("profile")!;
    if (pid === me.id) return c.json({ error: "Use your own profile to change your password." }, 403);
    const [target] = await db
      .select({ id: profile.id, userId: profile.userId, email: authUser.email, username: profile.username, name: profile.fullName, role: profile.role, contactEmail: profile.contactEmail })
      .from(profile)
      .leftJoin(authUser, eq(profile.userId, authUser.id))
      .where(eq(profile.id, pid))
      .limit(1);
    if (!target) return c.json({ error: "User not found." }, 404);
    if (isAllowlistedAdmin(target.email)) return c.json({ error: "Protected super-admin password cannot be reset here." }, 403);
    const tempPassword = `AfriLink-${Math.random().toString(36).slice(2, 8)}!`;
    try {
      const ctx = await auth.$context;
      const hash = await ctx.password.hash(tempPassword);
      // update the credential account row (providerId = "credential")
      const accts = await ctx.internalAdapter.findAccounts(target.userId);
      const cred = accts.find((a: { providerId: string }) => a.providerId === "credential");
      if (cred) {
        await ctx.internalAdapter.updatePassword(target.userId, hash);
      } else {
        await ctx.internalAdapter.createAccount({ userId: target.userId, providerId: "credential", accountId: target.userId, password: hash });
      }
      // revoke all sessions so the old password can't be reused
      await db.delete(session).where(eq(session.userId, target.userId));
    } catch (e) {
      return c.json({ error: "Could not reset password: " + (e as Error).message }, 400);
    }
    await db.update(profile).set({ mustChangePassword: true }).where(eq(profile.id, pid));
    // Email the new temporary password to the staff member's contact inbox (if set).
    let emailed = false;
    if (target.contactEmail && target.contactEmail.includes("@") && target.username) {
      const origin = new URL(c.req.url).origin;
      emailed = await sendStaffInviteEmail({
        to: target.contactEmail,
        name: target.name || target.username,
        role: target.role,
        username: target.username,
        tempPassword,
        loginUrl: `${origin}/app`,
      });
    }
    return c.json({ ok: true, tempPassword, emailed }, 200);
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
    const synthEmail = `${uname}@staff.afrigen.local`;
    const existing = await db.select().from(authUser).where(eq(authUser.email, synthEmail)).limit(1);
    if (existing.length) return c.json({ error: "That username is already taken." }, 400);
    const pwd = (b.password && b.password.length >= 8) ? b.password : `AfriLink-${Math.random().toString(36).slice(2, 8)}!`;
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
      agentNumber: code.replace("AGL-", ""), managerId: req.requestedByProfileId,
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
    // ---- party profiles for the job card (CL / SUP / PS / KAM / FA) ----
    const partyIds = [...new Set([
      tender.clientId,
      ...tContracts.map((x) => x.supplierId),
      ...sups.map((s) => s.managerId).filter(Boolean) as string[],
      ...insp.flatMap((i) => [i.assignedFieldId || i.inspectorId, i.reviewedBy]),
    ].filter(Boolean))];
    const partyRows = partyIds.length ? await db.select().from(profile).where(inArray(profile.id, partyIds)) : [];
    const partyEmails = partyRows.length ? await db.select({ id: authUser.id, email: authUser.email }).from(authUser).where(inArray(authUser.id, partyRows.map((p) => p.userId).filter(Boolean) as string[])) : [];
    const emailOf = new Map(partyEmails.map((e) => [e.id, e.email]));
    const mk = (pid?: string, label?: string) => {
      const p = pid ? partyRows.find((x) => x.id === pid) : null;
      if (!p) return null;
      return { id: p.id, label, role: p.role, name: p.fullName || p.companyName || "—", userCode: p.userCode, contact: p.phone || p.agentNumber || emailOf.get(p.userId) || "", verificationStatus: p.verificationStatus, managerId: p.managerId };
    };
    const supParties = tContracts.map((x) => {
      const sup = sups.find((s) => s.id === x.supplierId);
      return { ...mk(x.supplierId, sup?.role === "parts_supplier" ? "Parts supplier" : "Supplier"), kam: mk(sup?.managerId, "Account manager (KAM)") };
    }).filter((x) => x.id);
    const fieldParties = [...new Map(insp.map((i) => { const m = mk(i.assignedFieldId || i.inspectorId, "Field agent"); return [m?.id, m]; }).filter(([k]) => k)).values()];
    const parties = { client: mk(tender.clientId, "Client"), suppliers: supParties, fieldAgents: fieldParties };
    return c.json(
      {
        tender,
        stageLabel: STAGE_LABEL[tender.tenderStage as keyof typeof STAGE_LABEL] ?? tender.tenderStage,
        nextActor: STAGE_ACTOR[tender.tenderStage as keyof typeof STAGE_ACTOR] ?? "none",
        client,
        parties,
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
      // Generate + persist a settlement invoice server-side so the supplier's
      // job card shows a viewable Invoice link (client-side download alone never
      // created a document row).
      try {
        await issueInvoice(cid);
      } catch (err) {
        console.warn("[confirm-award] issueInvoice failed:", (err as Error)?.message);
      }
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
  // INBOUND FUNDING (bank transfer only): the client transfers to the AFRIGEN Link
  // account shown on their bank-details PDF, then uploads the TT (bank transfer)
  // copy as proof. Every payment in is evidenced by an uploaded proof image.
  // GATE LOCK: at least one TTProof document must be uploaded before advancing.
  .post("/tenders/:id/advance/tt-uploaded", requireAuth, requireRole("client"), async (c) => {
    const tid = c.req.param("id");
    const ttDocs = await db.select().from(documents).where(and(eq(documents.tenderId, tid), eq(documents.kind, "TTProof")));
    if (!ttDocs.length) {
      return c.json({ error: "Upload your bank transfer (TT) copy before confirming payment." }, 400);
    }
    return advanceStage(c, "TTUploaded");
  })
  // Admin/KAM reviews the uploaded TT copy and confirms the funds are monitored
  // (mirrors the bank notification arriving). Generates + persists + emails payment
  // proofs to the client and each supplier, then advances.
  // GATE LOCK: every uploaded TTProof must be verified before this step.
  .post("/tenders/:id/advance/tt-confirmed", requireAuth, requireRole("key_account", "admin"), async (c) => {
    const tid = c.req.param("id");
    const ttDocs = await db.select().from(documents).where(and(eq(documents.tenderId, tid), eq(documents.kind, "TTProof")));
    if (!ttDocs.length) return c.json({ error: "No bank transfer (TT) proof has been uploaded by the client." }, 400);
    if (ttDocs.some((d) => !d.verifiedBy)) {
      return c.json({ error: "Verify the client's bank transfer (TT) proof before confirming payment." }, 400);
    }
    const res = await advanceStage(c, "TTConfirmed");
    // Only issue proofs when the advance actually succeeded (200).
    if (res.status === 200) {
      try {
        await issuePaymentProofs(tid);
      } catch (err) {
        console.warn("[tt-confirmed] issuePaymentProofs failed:", (err as Error)?.message);
      }
    }
    return res;
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
      status: "PendingSupplierAcceptance",
      supplierResponse: "Pending",
      dueDate: contract.endDate, // must clear before current end date
    });
    await db.update(contracts).set({ extensionStatus: "Requested" }).where(eq(contracts.id, cid));
    const staff = await db.select().from(profile).where(inArray(profile.role, ["key_account", "admin"]));
    await notifyMany([contract.supplierId, ...staff.map((s) => s.id)], {
      tenderId: contract.tenderId ?? "",
      subject: "Hire extension requested",
      body: `The client requested a ${addedDays}-day extension on "${contract.title}". New end date ${newEndDate}. Awaiting supplier acceptance.`,
    });
    return c.json({ ok: true, extension: { id: extId, addedDays, newEndDate, extraAmountTzs, clientFeeTzs, amountToFundTzs, dueDate: contract.endDate } }, 200);
  })
  // supplier accepts/declines the extension request. On accept, generate the
  // extension-contract PDF and move to signatures.
  .post("/contracts/:id/extend/:extId/respond", requireAuth, requireRole("supplier"), async (c) => {
    const cid = c.req.param("id");
    const extId = c.req.param("extId");
    const p = c.get("profile")!;
    const b = await c.req.json<{ accept: boolean; declineReason?: string }>();
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ error: "Contract not found" }, 404);
    if (contract.supplierId !== p.id) return c.json({ error: "Forbidden" }, 403);
    const [ext] = await db.select().from(extensions).where(and(eq(extensions.id, extId), eq(extensions.contractId, cid))).limit(1);
    if (!ext) return c.json({ error: "Extension not found" }, 404);
    if (ext.status !== "PendingSupplierAcceptance") return c.json({ error: "This extension is no longer awaiting your response." }, 400);

    if (!b.accept) {
      await db.update(extensions).set({ status: "Declined", supplierResponse: "Declined", declineReason: b.declineReason ?? "" }).where(eq(extensions.id, extId));
      await db.update(contracts).set({ extensionStatus: "None" }).where(eq(contracts.id, cid));
      await logNotification({
        recipientProfileId: contract.clientId, tenderId: contract.tenderId ?? "",
        subject: "Hire extension declined",
        body: `The supplier declined your ${ext.addedDays}-day extension on "${contract.title}".${b.declineReason ? ` Reason: ${b.declineReason}` : ""}`,
      });
      return c.json({ ok: true }, 200);
    }

    // accept → generate the extension contract, persist as a document, await signatures
    const doc = await issueExtensionContract({
      contractId: cid, extensionId: extId, addedDays: ext.addedDays, newEndDate: ext.newEndDate,
      extraAmountTzs: ext.extraAmountTzs, clientFeeTzs: ext.clientFeeTzs, amountToFundTzs: ext.amountToFundTzs, dueDate: ext.dueDate,
    });
    await db.update(extensions).set({ status: "AwaitingSignatures", supplierResponse: "Accepted", contractDocId: doc.id }).where(eq(extensions.id, extId));
    await notifyMany([contract.clientId, contract.supplierId], {
      tenderId: contract.tenderId ?? "",
      subject: "Extension accepted — please sign",
      body: `The extension contract for "${contract.title}" is ready. Both parties must e-sign (tick to agree) to proceed.`,
    });
    return c.json({ ok: true, contractDocId: doc.id }, 200);
  })
  // client OR supplier e-signs (ticks) the extension contract. When both signed,
  // move to KAM activation.
  .post("/contracts/:id/extend/:extId/sign", requireAuth, requireRole("client", "supplier"), async (c) => {
    const cid = c.req.param("id");
    const extId = c.req.param("extId");
    const p = c.get("profile")!;
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ error: "Contract not found" }, 404);
    const isClient = contract.clientId === p.id;
    const isSupplier = contract.supplierId === p.id;
    if (!isClient && !isSupplier) return c.json({ error: "Forbidden" }, 403);
    const [ext] = await db.select().from(extensions).where(and(eq(extensions.id, extId), eq(extensions.contractId, cid))).limit(1);
    if (!ext) return c.json({ error: "Extension not found" }, 404);
    if (ext.status !== "AwaitingSignatures") return c.json({ error: "This extension is not awaiting signatures." }, 400);

    const name = p.fullName || p.companyName || "Signatory";
    const now = new Date();
    const patch: Partial<typeof extensions.$inferInsert> = isClient
      ? { clientSignedName: name, clientSignedAt: now }
      : { supplierSignedName: name, supplierSignedAt: now };
    await db.update(extensions).set(patch).where(eq(extensions.id, extId));

    const clientDone = isClient ? true : !!ext.clientSignedAt;
    const supplierDone = isSupplier ? true : !!ext.supplierSignedAt;
    if (clientDone && supplierDone) {
      await db.update(extensions).set({ status: "AwaitingKamActivation" }).where(eq(extensions.id, extId));
      const staff = await db.select().from(profile).where(inArray(profile.role, ["key_account", "admin"]));
      await notifyMany(staff.map((s) => s.id), {
        tenderId: contract.tenderId ?? "",
        subject: "Extension signed — activate payment",
        body: `Both parties signed the extension on "${contract.title}". Activate the payment gateway to let the client fund it.`,
      });
    }
    return c.json({ ok: true, bothSigned: clientDone && supplierDone }, 200);
  })
  // KAM/admin activates the payment gateway for a signed extension.
  .post("/contracts/:id/extend/:extId/activate", requireAuth, requireRole("key_account", "admin"), async (c) => {
    const cid = c.req.param("id");
    const extId = c.req.param("extId");
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ error: "Contract not found" }, 404);
    const [ext] = await db.select().from(extensions).where(and(eq(extensions.id, extId), eq(extensions.contractId, cid))).limit(1);
    if (!ext) return c.json({ error: "Extension not found" }, 404);
    if (ext.status !== "AwaitingKamActivation") return c.json({ error: "This extension is not ready for activation." }, 400);
    await db.update(extensions).set({ status: "PendingPayment" }).where(eq(extensions.id, extId));
    await db.update(contracts).set({ extensionStatus: "AwaitingPayment" }).where(eq(contracts.id, cid));
    await logNotification({
      recipientProfileId: contract.clientId, tenderId: contract.tenderId ?? "",
      subject: "Extension payment open",
      body: `The payment gateway for your extension on "${contract.title}" is open. Fund TZS ${ext.amountToFundTzs.toLocaleString()} before ${ext.dueDate}.`,
    });
    return c.json({ ok: true }, 200);
  })
  // client funds the extension (back-office, no upload) → pending confirmation.
  // Admin/KAM then confirms escrow secured via the confirm-extension route.
  .post("/contracts/:id/extend/:extId/pay", requireAuth, requireRole("client"), async (c) => {
    const cid = c.req.param("id");
    const extId = c.req.param("extId");
    const p = c.get("profile")!;
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ error: "Contract not found" }, 404);
    if (contract.clientId !== p.id) return c.json({ error: "Forbidden" }, 403);
    const [ext] = await db.select().from(extensions).where(and(eq(extensions.id, extId), eq(extensions.contractId, cid))).limit(1);
    if (!ext) return c.json({ error: "Extension not found" }, 404);
    if (ext.status === "Paid") return c.json({ error: "Already funded." }, 400);
    if (ext.status === "Lapsed") return c.json({ error: "This extension lapsed and can no longer be funded." }, 400);
    if (ext.status !== "PendingPayment") return c.json({ error: "This extension is not open for payment yet." }, 400);

    await db.update(extensions).set({ status: "PaymentPendingConfirmation" }).where(eq(extensions.id, extId));
    const staff = await db.select().from(profile).where(inArray(profile.role, ["key_account", "admin"]));
    await notifyMany(staff.map((s) => s.id), {
      tenderId: contract.tenderId ?? "",
      subject: "Extension payment cleared — confirm escrow",
      body: `The client cleared the extension payment on "${contract.title}". Confirm escrow secured to extend the hire.`,
    });
    return c.json({ ok: true }, 200);
  })
  // Admin/KAM confirms the extension escrow is secured (back-office). Extends the
  // contract end date, tops up escrow, and issues extension payment proofs.
  .post("/contracts/:id/extend/:extId/confirm", requireAuth, requireRole("key_account", "admin"), async (c) => {
    const cid = c.req.param("id");
    const extId = c.req.param("extId");
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, cid)).limit(1);
    if (!contract) return c.json({ error: "Contract not found" }, 404);
    const [ext] = await db.select().from(extensions).where(and(eq(extensions.id, extId), eq(extensions.contractId, cid))).limit(1);
    if (!ext) return c.json({ error: "Extension not found" }, 404);
    if (ext.status === "Paid") return c.json({ error: "Already confirmed." }, 400);
    if (ext.status !== "PaymentPendingConfirmation" && ext.status !== "PendingPayment") {
      return c.json({ error: "This extension is not awaiting escrow confirmation." }, 400);
    }
    await db.update(extensions).set({ status: "Paid" }).where(eq(extensions.id, extId));
    await db
      .update(contracts)
      .set({
        endDate: ext.newEndDate,
        extensionStatus: "Extended",
        reminderSentAt: "",
        totalEscrowBalanceTzs: contract.totalEscrowBalanceTzs + ext.amountToFundTzs,
      })
      .where(eq(contracts.id, cid));
    try {
      await issueExtensionProofs({ contractId: cid, extensionId: extId, extraAmountTzs: ext.extraAmountTzs, clientFeeTzs: ext.clientFeeTzs, amountToFundTzs: ext.amountToFundTzs });
    } catch (err) {
      console.warn("[extend/confirm] issueExtensionProofs failed:", (err as Error)?.message);
    }
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
    // resolve field-agent + KAM identities for each record
    const pids = [...new Set([
      ...insp.flatMap((i) => [i.inspectorId, i.assignedFieldId, i.reviewedBy, i.supplierId]),
      ...logs.map((l) => l.loggedBy),
    ].filter(Boolean))];
    const ps = pids.length ? await db.select().from(profile).where(inArray(profile.id, pids)) : [];
    const idn = new Map(ps.map((x) => [x.id, { name: x.fullName || x.companyName || "—", code: x.userCode, number: x.agentNumber || x.phone || "", role: x.role }]));
    const idOf = (pid?: string) => (pid && idn.get(pid)) || null;
    return c.json({
      inspections: insp.map((i) => ({
        ...i,
        agent: idOf(i.assignedFieldId || i.inspectorId),
        kam: idOf(i.reviewedBy),
        supplier: idOf(i.supplierId),
      })),
      borderLogs: logs.map((l) => ({ ...l, agent: idOf(l.loggedBy) })),
    }, 200);
  })
  .get("/admin/notifications", requireAuth, requireRole("admin","key_account"), async (c) => {
    const rows = await db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(200);
    const ids = [...new Set(rows.map((n) => n.recipientProfileId))];
    const ps = ids.length ? await db.select().from(profile).where(inArray(profile.id, ids)) : [];
    const nameOf = new Map(ps.map((x) => [x.id, x.companyName]));
    return c.json({ notifications: rows.map((n) => ({ ...n, recipientName: nameOf.get(n.recipientProfileId) ?? "User" })) }, 200);
  })

  // ============================================================
  //  HELP-DESK — scripted bot intake → live 1:1 chat with assigned KAM
  // ============================================================
  // Get my open/active ticket (most recent) + its messages. Creates none.
  .get("/support/ticket", requireAuth, async (c) => {
    const p = c.get("profile")!;
    const [t] = await db
      .select()
      .from(supportTickets)
      .where(and(eq(supportTickets.openerProfileId, p.id), eq(supportTickets.status, "Open")))
      .orderBy(desc(supportTickets.createdAt))
      .limit(1);
    if (!t) return c.json({ ticket: null, messages: [] }, 200);
    const msgs = await db.select().from(chatMessages).where(eq(chatMessages.ticketId, t.id)).orderBy(chatMessages.createdAt);
    // resolve sender display
    const ids = [...new Set(msgs.map((m) => m.fromProfileId).filter(Boolean))];
    const ps = ids.length ? await db.select().from(profile).where(inArray(profile.id, ids)) : [];
    const nameOf = new Map(ps.map((x) => [x.id, { name: x.fullName || x.companyName || "User", role: x.role, code: x.userCode }]));
    return c.json(
      {
        ticket: t,
        messages: msgs.map((m) => ({ ...m, sender: m.fromProfileId ? nameOf.get(m.fromProfileId) : null })),
      },
      200
    );
  })
  // Open a new help-desk ticket (only CL / SUP / PS). Routes to assigned KAM or admin fallback.
  .post("/support/ticket", requireAuth, async (c) => {
    const p = c.get("profile")!;
    if (!["client", "supplier", "parts_supplier"].includes(p.role))
      return c.json({ error: "Help-desk is for clients and suppliers." }, 403);
    const b = await c.req.json<{ topic?: string; urgency?: string; detail?: string }>().catch(() => ({}));
    // route to assigned KAM, else any admin
    let kamId = p.managerId || "";
    if (!kamId) {
      const [adm] = await db.select().from(profile).where(eq(profile.role, "admin")).limit(1);
      kamId = adm?.id ?? "";
    }
    const tid = id("tkt");
    const now = new Date();
    await db.insert(supportTickets).values({
      id: tid,
      openerProfileId: p.id,
      assignedKamId: kamId,
      topic: (b.topic ?? "").slice(0, 200),
      urgency: ["Low", "Normal", "High"].includes(b.urgency ?? "") ? b.urgency! : "Normal",
      botComplete: true,
      status: "Open",
      lastMessageAt: now,
    });
    // seed the transcript: bot summary + opener's first detail message
    await db.insert(chatMessages).values({
      id: id("cmsg"),
      ticketId: tid,
      fromProfileId: "",
      kind: "bot",
      body: `Thanks — I've connected you with your account manager. Topic: ${b.topic || "General"} · Urgency: ${b.urgency || "Normal"}. Someone will reply here shortly.`,
      createdAt: now,
    });
    if (b.detail?.trim()) {
      await db.insert(chatMessages).values({
        id: id("cmsg"),
        ticketId: tid,
        fromProfileId: p.id,
        kind: "user",
        body: b.detail.trim().slice(0, 2000),
        createdAt: new Date(now.getTime() + 1),
      });
    }
    if (kamId)
      await logNotification({
        recipientProfileId: kamId,
        subject: "New help-desk message",
        body: `${p.companyName || p.fullName || "A partner"} (${p.userCode}) opened a help-desk chat — ${b.topic || "General"}.`,
      });
    return c.json({ ok: true, ticketId: tid }, 200);
  })
  // Post a message into a ticket. Opener or the assigned KAM/admin only.
  .post("/support/ticket/:tid/message", requireAuth, async (c) => {
    const p = c.get("profile")!;
    const tid = c.req.param("tid");
    const [t] = await db.select().from(supportTickets).where(eq(supportTickets.id, tid)).limit(1);
    if (!t) return c.json({ error: "Ticket not found." }, 404);
    const isOpener = t.openerProfileId === p.id;
    const isHandler = t.assignedKamId === p.id || p.role === "admin";
    if (!isOpener && !isHandler) return c.json({ error: "Not your conversation." }, 403);
    if (t.status === "Closed") return c.json({ error: "This conversation is closed." }, 409);
    const b = await c.req.json<{ body?: string }>().catch(() => ({}));
    if (!b.body?.trim()) return c.json({ error: "Empty message." }, 400);
    const now = new Date();
    await db.insert(chatMessages).values({
      id: id("cmsg"),
      ticketId: tid,
      fromProfileId: p.id,
      kind: "user",
      body: b.body.trim().slice(0, 2000),
      createdAt: now,
    });
    await db.update(supportTickets).set({ lastMessageAt: now }).where(eq(supportTickets.id, tid));
    // notify the other party
    const other = isOpener ? t.assignedKamId : t.openerProfileId;
    if (other)
      await logNotification({
        recipientProfileId: other,
        subject: "New help-desk reply",
        body: `${p.fullName || p.companyName || "Someone"} replied in your help-desk chat.`,
      });
    return c.json({ ok: true }, 200);
  })
  // Read a ticket's full transcript (opener OR assigned KAM / admin).
  .get("/support/ticket/:tid/thread", requireAuth, async (c) => {
    const p = c.get("profile")!;
    const tid = c.req.param("tid");
    const [t] = await db.select().from(supportTickets).where(eq(supportTickets.id, tid)).limit(1);
    if (!t) return c.json({ error: "Ticket not found." }, 404);
    const allowed = t.openerProfileId === p.id || t.assignedKamId === p.id || p.role === "admin";
    if (!allowed) return c.json({ error: "Not your conversation." }, 403);
    const msgs = await db.select().from(chatMessages).where(eq(chatMessages.ticketId, tid)).orderBy(chatMessages.createdAt);
    const ids = [...new Set(msgs.map((m) => m.fromProfileId).filter(Boolean))];
    const ps = ids.length ? await db.select().from(profile).where(inArray(profile.id, ids)) : [];
    const nameOf = new Map(ps.map((x) => [x.id, { name: x.fullName || x.companyName || "User", role: x.role, code: x.userCode }]));
    return c.json({ ticket: t, messages: msgs.map((m) => ({ ...m, sender: m.fromProfileId ? nameOf.get(m.fromProfileId) : null })) }, 200);
  })
  // KAM/admin: list tickets assigned to me (or all, for admin).
  .get("/support/queue", requireAuth, requireRole("key_account", "admin"), async (c) => {
    const p = c.get("profile")!;
    const rows =
      p.role === "admin"
        ? await db.select().from(supportTickets).orderBy(desc(supportTickets.lastMessageAt)).limit(200)
        : await db.select().from(supportTickets).where(eq(supportTickets.assignedKamId, p.id)).orderBy(desc(supportTickets.lastMessageAt)).limit(200);
    const ids = [...new Set(rows.map((t) => t.openerProfileId))];
    const ps = ids.length ? await db.select().from(profile).where(inArray(profile.id, ids)) : [];
    const nameOf = new Map(ps.map((x) => [x.id, { name: x.companyName || x.fullName || "User", code: x.userCode, phone: x.phone }]));
    return c.json({ tickets: rows.map((t) => ({ ...t, opener: nameOf.get(t.openerProfileId) ?? null })) }, 200);
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

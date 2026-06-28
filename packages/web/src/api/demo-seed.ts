/**
 * AFRIGEN demo seed — creates 4 demo users + realistic populated data
 * so dashboards look full for screen-capture / tutorial.
 *
 * Run: cd packages/web && bun --env-file=../../.env src/api/demo-seed.ts
 */
import { db } from "./database";
import { auth } from "./auth";
import {
  profile,
  assets,
  contracts,
  complianceItems,
  inspections,
  borderLogs,
  cargoLoads,
  loadBids,
  parts,
  partOrders,
  tenders,
  bids,
  documents,
  messages,
  activityEvents,
  notifications,
  idCounters,
  kybDocuments,
} from "./database/schema";
import { user as userTable } from "./database/auth-schema";
import { eq, inArray } from "drizzle-orm";
import { id, nextUserCode } from "./lib/ids";
import { checklistFor, computeAmountToFund } from "./lib/engine";

// date helpers for realistic timing
const today = new Date();
function isoIn(days: number): string {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function endFrom(startIso: string, jobDays: number): string {
  const d = new Date(startIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + jobDays - 1);
  return d.toISOString().slice(0, 10);
}

const DEMO = [
  { email: "client@nguzo.africa", name: "Amani Mwakalebela", role: "client", company: "Geita Gold Construction Ltd", phone: "+255 754 110 220" },
  { email: "supplier@nguzo.africa", name: "Rashid Juma", role: "supplier", company: "Tanzanite Heavy Fleet Co.", phone: "+255 765 330 440" },
  { email: "supplier2@nguzo.africa", name: "Grace Mollel", role: "supplier", company: "Kilimanjaro Plant Hire", phone: "+255 786 220 330" },
  { email: "field@nguzo.africa", name: "Neema Kileo", role: "field", company: "Nguzo Ground Force", phone: "+255 712 550 660" },
  { email: "kam@nguzo.africa", name: "Baraka Lyimo", role: "key_account", company: "Nguzo Key Accounts", phone: "+255 713 480 110" },
  { email: "parts@nguzo.africa", name: "Zawadi Spares Ltd", role: "parts_supplier", company: "Zawadi Spares (Vingunguti)", phone: "+255 714 905 220" },
  { email: "admin@nguzo.africa", name: "Operations Desk", role: "admin", company: "Nguzo HQ", phone: "+255 700 000 000" },
  // pending accounts to populate the verification queue
  { email: "newclient@nguzo.africa", name: "Joseph Mteme", role: "client", company: "Mwanza Roadworks Ltd", phone: "+255 755 121 314", pending: true },
  { email: "newsupplier@nguzo.africa", name: "Halima Said", role: "supplier", company: "Lake Zone Plant Hire", phone: "+255 766 818 282", pending: true },
];
const PASSWORD = "nguzo2026";

async function ensureUser(d: (typeof DEMO)[number]) {
  const existing = await db.select().from(userTable).where(eq(userTable.email, d.email)).limit(1);
  let userId: string;
  if (existing.length) {
    userId = existing[0].id;
  } else {
    const res = await auth.api.signUpEmail({ body: { email: d.email, password: PASSWORD, name: d.name } });
    userId = (res as any).user.id;
  }
  // profile
  const prof = await db.select().from(profile).where(eq(profile.userId, userId)).limit(1);
  const userCode = await nextUserCode(d.role);
  const pending = (d as any).pending === true;
  // Demo accounts are fully verified + onboarded so the dashboards are usable.
  // The two "pending" accounts sit Submitted to populate the verification queue.
  const base = {
    role: d.role, companyName: d.company, fullName: d.name, phone: d.phone, userCode,
    username: ["field", "key_account", "admin"].includes(d.role) ? d.email.split("@")[0] : "",
    verificationStatus: pending ? "Submitted" : "Verified",
    onboardingComplete: true, mustChangePassword: false,
    nationalId: "199" + Math.floor(100000000 + Math.random() * 800000000),
    address: pending ? "Plot 9, Nyerere Rd, Mwanza" : "",
    companyRegNo: pending ? "BRELA-2024-" + Math.floor(10000 + Math.random() * 80000) : "",
    companyTin: pending ? "139-" + Math.floor(100000 + Math.random() * 800000) : "",
    companySector: pending ? (d.role === "client" ? "Construction" : "Logistics / Transport") : "",
    authoriserName: pending ? d.name : "",
    authoriserTitle: pending ? "Director" : "",
    authoriserPhone: pending ? d.phone : "",
  };
  if (prof.length) {
    await db.update(profile).set(base).where(eq(profile.userId, userId));
    return { userId, profileId: prof[0].id };
  }
  const pid = id("prof");
  await db.insert(profile).values({ id: pid, userId, ...base });
  return { userId, profileId: pid };
}

async function main() {
  console.log("Seeding demo accounts…");
  // reset id counters so demo userCodes are clean + sequential
  await db.delete(idCounters);
  const ids: Record<string, { userId: string; profileId: string }> = {};
  for (const d of DEMO) ids[d.email] = await ensureUser(d);

  const clientId = ids["client@nguzo.africa"].profileId;
  const supplierId = ids["supplier@nguzo.africa"].profileId;
  const supplier2Id = ids["supplier2@nguzo.africa"].profileId;
  const fieldId = ids["field@nguzo.africa"].profileId;
  const kamId = ids["kam@nguzo.africa"].profileId;
  const partsId = ids["parts@nguzo.africa"].profileId;
  const adminId = ids["admin@nguzo.africa"].profileId;

  // field agent personal profile + reports to the KAM + yard station;
  // suppliers + parts supplier are assigned to the KAM and get bank details.
  await db.update(profile).set({ agentNumber: "FA-007", managerId: kamId, fieldStation: "yard" }).where(eq(profile.id, fieldId));
  await db.update(profile).set({ managerId: kamId }).where(eq(profile.id, supplierId));
  await db.update(profile).set({ managerId: kamId }).where(eq(profile.id, supplier2Id));
  await db.update(profile).set({ managerId: kamId }).where(eq(profile.id, partsId));
  await db.update(profile).set({ bankName: "CRDB Bank", bankAccountName: "Tanzanite Heavy Fleet Co.", bankAccountNo: "0152-334455-01", bankSwift: "CORUTZTZ", bankBranch: "Dar es Salaam Main" }).where(eq(profile.id, supplierId));
  await db.update(profile).set({ bankName: "NMB Bank", bankAccountName: "Kilimanjaro Plant Hire", bankAccountNo: "2010-998877-00", bankSwift: "NMIBTZTZ", bankBranch: "Arusha" }).where(eq(profile.id, supplier2Id));

  // pending accounts: assign KAM to the pending supplier + seed sample KYB docs
  const newClientId = ids["newclient@nguzo.africa"].profileId;
  const newSupplierId = ids["newsupplier@nguzo.africa"].profileId;
  await db.update(profile).set({ managerId: kamId }).where(eq(profile.id, newSupplierId));
  await db.delete(kybDocuments).where(inArray(kybDocuments.profileId, [newClientId, newSupplierId]));
  await db.insert(kybDocuments).values([
    { id: id("kyb"), profileId: newClientId, kind: "Registration", label: "certificate-of-incorporation.pdf", fileKey: "" },
    { id: id("kyb"), profileId: newClientId, kind: "TIN", label: "tin-certificate.pdf", fileKey: "" },
    { id: id("kyb"), profileId: newSupplierId, kind: "Registration", label: "company-registration.pdf", fileKey: "" },
    { id: id("kyb"), profileId: newSupplierId, kind: "Licence", label: "transport-licence.pdf", fileKey: "" },
  ]);

  // wipe prior demo data (idempotent re-seed of business records)
  await db.delete(assets).where(eq(assets.supplierId, supplierId));
  // assets
  const A: (typeof assets.$inferInsert)[] = [
    { id: id("asset"), supplierId, assetType: "Excavator", manufacturer: "Caterpillar", model: "320D", vinChassis: "CAT320D-TZ-44192", engineSerial: "C6.4-77120", dayRateTzs: 1_350_000, operationalStatus: "Active", yardLocation: "Vingunguti Yard, Dar es Salaam", auditTimestamp: new Date() },
    { id: id("asset"), supplierId, assetType: "Prime Mover", manufacturer: "Volvo", model: "FH16", vinChassis: "VOLFH16-TZ-30188", engineSerial: "D16-99021", dayRateTzs: 980_000, operationalStatus: "Available", yardLocation: "Kurasini Logistics Park", auditTimestamp: new Date() },
    { id: id("asset"), supplierId, assetType: "Tipper Truck", manufacturer: "Mercedes-Benz", model: "Actros 3340", vinChassis: "MBACT-TZ-21744", engineSerial: "OM501-44210", dayRateTzs: 720_000, operationalStatus: "Available", yardLocation: "Geita Site Camp" },
    { id: id("asset"), supplierId, assetType: "Bulldozer", manufacturer: "Caterpillar", model: "D6R", vinChassis: "CATD6R-TZ-90021", engineSerial: "C9-31177", dayRateTzs: 1_120_000, operationalStatus: "Maintenance", yardLocation: "Vingunguti Yard, Dar es Salaam" },
  ];
  await db.insert(assets).values(A);

  // CONTRACT 1 — ActiveTransit, CrossBorder, with breakdown credit (the hero contract for walkthrough)
  await db.delete(contracts).where(eq(contracts.clientId, clientId));
  const c1 = id("ctr");
  const escrow1 = 58_000_000;
  const credit1 = 5_920_000; // a turbocharger emergency was approved
  await db.insert(contracts).values({
    id: c1, clientId, supplierId, assetId: A[0].id,
    title: "Excavator Lease — Geita Mine Expansion",
    routeClassification: "CrossBorder", origin: "Dar es Salaam", destination: "Lubumbashi (via Tunduma)",
    totalEscrowBalanceTzs: escrow1, emergencyCreditDeductedTzs: credit1,
    milestoneStatus: "ActiveTransit",
  });
  await db.insert(complianceItems).values(
    checklistFor("CrossBorder").map((permitType, i) => ({
      id: id("comp"), contractId: c1, permitType,
      verificationStatus: i < 3 ? "Verified" : "Pending",
    }))
  );

  // CONTRACT 2 — AwaitingEscrowDeposit, Domestic (fresh, shows the "fund escrow" CTA)
  const c2 = id("ctr");
  await db.insert(contracts).values({
    id: c2, clientId, supplierId, assetId: A[2].id,
    title: "Tipper Fleet — Dar Ring Road Aggregate Haul",
    routeClassification: "Domestic", origin: "Dar es Salaam", destination: "Morogoro",
    totalEscrowBalanceTzs: 0, emergencyCreditDeductedTzs: 0,
    milestoneStatus: "AwaitingEscrowDeposit",
  });
  await db.insert(complianceItems).values(
    checklistFor("Domestic").map((permitType) => ({
      id: id("comp"), contractId: c2, permitType, verificationStatus: "Pending",
    }))
  );

  // CONTRACT 3 — MilestoneSignedOff (shows settled state)
  const c3 = id("ctr");
  const escrow3 = 31_500_000;
  const fee3 = Math.round(escrow3 * 0.07);
  await db.insert(contracts).values({
    id: c3, clientId, supplierId, assetId: A[1].id,
    title: "Prime Mover — Mwanza Cement Corridor",
    routeClassification: "Domestic", origin: "Dar es Salaam", destination: "Mwanza",
    totalEscrowBalanceTzs: escrow3, emergencyCreditDeductedTzs: 0,
    platformFeeTzs: fee3, supplierPayoutTzs: escrow3 - fee3,
    milestoneStatus: "MilestoneSignedOff",
  });

  // Inspections (field)
  await db.delete(inspections).where(eq(inspections.inspectorId, fieldId));
  await db.insert(inspections).values([
    { id: id("insp"), assetId: A[0].id, inspectorId: fieldId, assignedFieldId: fieldId, supplierId, mechanicalNotes: "VIN matched chassis plate. Hydraulics within tolerance. Undercarriage 78% life. Legitimacy confirmed.", legitimacySignedOff: true },
    { id: id("insp"), assetId: A[1].id, inspectorId: fieldId, assignedFieldId: fieldId, supplierId, mechanicalNotes: "Engine serial verified against logbook. Brake compressor serviced. Cleared for cross-border transit.", legitimacySignedOff: true },
  ]);

  // Border logs (field)
  await db.delete(borderLogs).where(eq(borderLogs.loggedBy, fieldId));
  await db.insert(borderLogs).values([
    { id: id("blog"), osbp: "Tunduma", contractId: c1, institutionalWaitMinutes: 240, clearanceOverrideNote: "TANSAD portal timeout at 14:20. Manually escalated to TRA desk officer. Convoy released after 4h.", loggedBy: fieldId },
    { id: id("blog"), osbp: "Namanga", contractId: "", institutionalWaitMinutes: 95, clearanceOverrideNote: "Routine TBS re-weigh. No discrepancy.", loggedBy: fieldId },
  ]);

  // Cargo loads + bids
  await db.delete(cargoLoads).where(eq(cargoLoads.cargoOwnerId, clientId));
  const load1 = id("load");
  const load2 = id("load");
  await db.insert(cargoLoads).values([
    { id: load1, cargoOwnerId: clientId, cargoType: "Sand", origin: "Kibaha", destination: "Dar es Salaam CBD", tonnage: 32, budgetTzs: 1_800_000, status: "Open" },
    { id: load2, cargoOwnerId: clientId, cargoType: "Aggregate", origin: "Mlandizi Quarry", destination: "Bagamoyo SEZ", tonnage: 28, budgetTzs: 2_400_000, status: "Matched" },
  ]);
  await db.insert(loadBids).values([
    { id: id("bid"), loadId: load1, supplierId, assetId: A[2].id, rateTzs: 1_650_000, note: "Tipper available immediately from Geita camp. Can do 2 trips/day.", status: "Interested" },
    { id: id("bid"), loadId: load2, supplierId, assetId: A[2].id, rateTzs: 2_300_000, note: "Confirmed and dispatched.", status: "Accepted" },
  ]);

  // ============================================================
  //  TENDERS — quantity-demand procurement walkthrough
  // ============================================================
  // wipe prior tender demo data for this client (idempotent re-seed)
  const priorTenders = await db.select().from(tenders).where(eq(tenders.clientId, clientId));
  for (const pt of priorTenders) {
    await db.delete(bids).where(eq(bids.tenderId, pt.id));
    await db.delete(documents).where(eq(documents.tenderId, pt.id));
    await db.delete(messages).where(eq(messages.tenderId, pt.id));
    await db.delete(activityEvents).where(eq(activityEvents.tenderId, pt.id));
    await db.delete(inspections).where(eq(inspections.tenderId, pt.id));
    await db.delete(contracts).where(eq(contracts.tenderId, pt.id));
  }
  await db.delete(tenders).where(eq(tenders.clientId, clientId));
  await db.delete(notifications).where(eq(notifications.recipientProfileId, clientId));

  // ---- TENDER 1: OPEN, taking bids (auto-fill demo: needs 5, two suppliers bid) ----
  const t1 = id("tnd");
  await db.insert(tenders).values({
    id: t1, clientId, title: "Tipper Trucks ×5 — Sand haul to Geita site",
    demandType: "CargoCarrier", carrierOrMachineType: "Tipper Truck", cargoOrProjectDesc: "600t river sand",
    unitsNeeded: 5, routeClassification: "Domestic", origin: "Dar es Salaam", destination: "Geita",
    needByDate: isoIn(12), transitDays: 2,
    tenderStage: "Bidding", status: "Open",
  });
  await db.insert(bids).values([
    { id: id("bid"), tenderId: t1, supplierId, unitsOffered: 3, pricePerUnitTzs: 720_000, note: "3 tippers ready at Geita camp.", availabilityNote: "Ready Monday", status: "Open" },
    { id: id("bid"), tenderId: t1, supplierId: supplier2Id, unitsOffered: 4, pricePerUnitTzs: 760_000, note: "4 units, can mobilise in 48h.", availabilityNote: "Mobilise in 48h", status: "Open" },
  ]);
  await db.insert(activityEvents).values([
    { id: id("evt"), tenderId: t1, actorProfileId: clientId, type: "tender.created", summary: "Job posted: Tipper Trucks ×5 — Sand haul to Geita site (5 units)." },
    { id: id("evt"), tenderId: t1, actorProfileId: supplierId, type: "bid.placed", summary: "Tanzanite Heavy Fleet Co. bid 3 unit(s) @ TZS 720,000 each." },
    { id: id("evt"), tenderId: t1, actorProfileId: supplier2Id, type: "bid.placed", summary: "Kilimanjaro Plant Hire bid 4 unit(s) @ TZS 760,000 each." },
  ]);

  // ---- TENDER 2: AWARDED, mid-gate at PermitsUploaded (admin has an action) ----
  const t2 = id("tnd");
  const flat2 = 1_300_000; // per-unit over 30 working days: transfer 400k + 30k/day
  const t2Start = isoIn(8);
  const t2JobDays = 30;
  const t2End = endFrom(t2Start, t2JobDays);
  const t2Daily = 30_000;
  const t2Transfer = 400_000;
  await db.insert(tenders).values({
    id: t2, clientId, title: "Excavators ×2 — Warehouse earthworks",
    demandType: "Machinery", carrierOrMachineType: "Excavator", cargoOrProjectDesc: "warehouse foundation earthworks",
    unitsNeeded: 2, routeClassification: "Domestic", origin: "Dar es Salaam", destination: "Kibaha",
    startDate: t2Start, jobDays: t2JobDays, endDate: t2End, estTransferDays: 1,
    flatFairPriceTzs: flat2, tenderStage: "PermitsUploaded", status: "Awarded",
  });
  const t2c1 = id("ctr");
  const t2Value = 2 * flat2;
  const t2Fund = computeAmountToFund(t2Value);
  await db.insert(contracts).values({
    id: t2c1, tenderId: t2, clientId, supplierId, assetId: "",
    title: "Excavators ×2 — Warehouse earthworks", unitsAwarded: 2, agreedPricePerUnitTzs: flat2,
    contractValueTzs: t2Value, clientFeeTzs: t2Fund.clientFeeTzs, platformFeeTzs: t2Fund.clientFeeTzs * 2,
    routeClassification: "Domestic", origin: "Dar es Salaam", destination: "Kibaha",
    startDate: t2Start, endDate: t2End, dailyRateTzs: t2Daily, transferFeeTzs: t2Transfer,
    contractStage: "FieldVerified", milestoneStatus: "AwaitingEscrowDeposit",
  });
  await db.insert(documents).values([
    { id: id("doc"), ownerId: supplierId, tenderId: t2, contractId: t2c1, kind: "SignedAgreement", label: "Signed agreement", fileKey: "", mimeType: "application/pdf" },
    { id: id("doc"), ownerId: supplierId, tenderId: t2, contractId: t2c1, kind: "MachineDoc", label: "Fleet registration + insurance", fileKey: "", mimeType: "application/pdf" },
    { id: id("doc"), ownerId: clientId, tenderId: t2, kind: "Permit", label: "TARURA heavy-load permit", fileKey: "", mimeType: "application/pdf" },
  ]);
  await db.insert(inspections).values({ id: id("insp"), tenderId: t2, contractId: t2c1, inspectorId: fieldId, mechanicalNotes: "Both excavators inspected on-site at Vingunguti yard. Serials matched, hydraulics good. Verified.", legitimacySignedOff: true });
  await db.insert(messages).values([
    { id: id("msg"), tenderId: t2, fromProfileId: clientId, body: "Need these on site by the 20th — is that workable?" },
    { id: id("msg"), tenderId: t2, fromProfileId: supplierId, body: "Yes, both units cleared inspection. Just awaiting permit verification." },
  ]);
  await db.insert(activityEvents).values([
    { id: id("evt"), tenderId: t2, actorProfileId: clientId, type: "tender.awarded", summary: "Award confirmed: 1 supplier, 2/2 units at flat fair TZS 1,300,000/unit." },
    { id: id("evt"), tenderId: t2, actorProfileId: supplierId, type: "stage.advance", summary: "Tanzanite Heavy Fleet Co. → Agreements signed." },
    { id: id("evt"), tenderId: t2, actorProfileId: supplierId, type: "stage.advance", summary: "Tanzanite Heavy Fleet Co. → Machine docs uploaded." },
    { id: id("evt"), tenderId: t2, actorProfileId: fieldId, type: "stage.advance", summary: "Nguzo Ground Force → Field inspection verified." },
    { id: id("evt"), tenderId: t2, actorProfileId: clientId, type: "stage.advance", summary: "Geita Gold Construction Ltd → Permits uploaded." },
  ]);
  await db.insert(notifications).values([
    { id: id("ntf"), recipientProfileId: supplierId, tenderId: t2, channel: "email", subject: "You've been awarded a job", body: "Your bid on \"Excavators ×2 — Warehouse earthworks\" was awarded 2 units at TZS 1,300,000/unit.", status: "Logged" },
    { id: id("ntf"), recipientProfileId: clientId, tenderId: t2, channel: "email", subject: "Job update: Permits uploaded", body: "\"Excavators ×2\" advanced to: Permits uploaded.", status: "Logged" },
  ]);

  // ---- TENDER 3: EXECUTING (escrow held, multi-supplier auto-fill) ----
  const t3 = id("tnd");
  const flat3 = 880_000;
  await db.insert(tenders).values({
    id: t3, clientId, title: "Flatbeds ×6 — Equipment relocation to Mwanza",
    demandType: "CargoCarrier", carrierOrMachineType: "Flatbed Truck", cargoOrProjectDesc: "plant & equipment relocation",
    unitsNeeded: 6, routeClassification: "Domestic", origin: "Dar es Salaam", destination: "Mwanza",
    needByDate: isoIn(5), transitDays: 3,
    flatFairPriceTzs: flat3, tenderStage: "Executing", status: "Executing",
  });
  const t3v4 = 4 * flat3, t3v2 = 2 * flat3;
  const t3f4 = computeAmountToFund(t3v4), t3f2 = computeAmountToFund(t3v2);
  await db.insert(contracts).values([
    { id: id("ctr"), tenderId: t3, clientId, supplierId, assetId: "", title: "Flatbeds ×6 — Equipment relocation to Mwanza", unitsAwarded: 4, agreedPricePerUnitTzs: flat3, contractValueTzs: t3v4, clientFeeTzs: t3f4.clientFeeTzs, platformFeeTzs: t3f4.clientFeeTzs * 2, totalEscrowBalanceTzs: t3f4.amountToFundTzs, routeClassification: "Domestic", origin: "Dar es Salaam", destination: "Mwanza", contractStage: "Executing", milestoneStatus: "ActiveTransit" },
    { id: id("ctr"), tenderId: t3, clientId, supplierId: supplier2Id, assetId: "", title: "Flatbeds ×6 — Equipment relocation to Mwanza", unitsAwarded: 2, agreedPricePerUnitTzs: flat3, contractValueTzs: t3v2, clientFeeTzs: t3f2.clientFeeTzs, platformFeeTzs: t3f2.clientFeeTzs * 2, totalEscrowBalanceTzs: t3f2.amountToFundTzs, routeClassification: "Domestic", origin: "Dar es Salaam", destination: "Mwanza", contractStage: "Executing", milestoneStatus: "ActiveTransit" },
  ]);
  await db.insert(documents).values([
    { id: id("doc"), ownerId: clientId, tenderId: t3, kind: "Permit", label: "Transit permits", fileKey: "", mimeType: "application/pdf", verifiedBy: adminId, verifiedAt: new Date() },
    { id: id("doc"), ownerId: clientId, tenderId: t3, kind: "TTProof", label: "TT payment proof", fileKey: "", mimeType: "image/png", verifiedBy: adminId, verifiedAt: new Date() },
  ]);
  await db.insert(activityEvents).values([
    { id: id("evt"), tenderId: t3, actorProfileId: clientId, type: "tender.awarded", summary: "Award confirmed: 2 suppliers, 6/6 units at flat fair TZS 880,000/unit." },
    { id: id("evt"), tenderId: t3, actorProfileId: adminId, type: "stage.advance", summary: "Nguzo HQ → Escrow confirmed." },
    { id: id("evt"), tenderId: t3, actorProfileId: adminId, type: "stage.advance", summary: "Nguzo HQ → Approved — executing." },
  ]);
  await db.insert(notifications).values([
    { id: id("ntf"), recipientProfileId: supplierId, tenderId: t3, channel: "email", subject: "Job update: Approved — executing", body: "\"Flatbeds ×6\" is approved and executing.", status: "Logged" },
    { id: id("ntf"), recipientProfileId: supplier2Id, tenderId: t3, channel: "email", subject: "Job update: Approved — executing", body: "\"Flatbeds ×6\" is approved and executing.", status: "Logged" },
  ]);

  // ---- TENDER 4: EXECUTING machinery hire near end date (extension demo) ----
  const t4 = id("tnd");
  const flat4 = 1_750_000; // transfer 550k + 40k/day over 30 days
  const t4Start = isoIn(-22); // started 22 days ago
  const t4JobDays = 30;
  const t4End = endFrom(t4Start, t4JobDays); // ~8 days from now → triggers 10-day reminder
  const t4Daily = 40_000, t4Transfer = 550_000;
  await db.insert(tenders).values({
    id: t4, clientId, title: "Motor Grader ×1 — Access road grading",
    demandType: "Machinery", carrierOrMachineType: "Motor Grader", cargoOrProjectDesc: "site access road grading & leveling",
    unitsNeeded: 1, routeClassification: "Domestic", origin: "Dar es Salaam", destination: "Morogoro",
    startDate: t4Start, jobDays: t4JobDays, endDate: t4End, estTransferDays: 1,
    flatFairPriceTzs: flat4, tenderStage: "Executing", status: "Executing",
  });
  const t4Value = flat4;
  const t4Fund = computeAmountToFund(t4Value);
  await db.insert(contracts).values({
    id: id("ctr"), tenderId: t4, clientId, supplierId: supplier2Id, assetId: "",
    title: "Motor Grader ×1 — Access road grading", unitsAwarded: 1, agreedPricePerUnitTzs: flat4,
    contractValueTzs: t4Value, clientFeeTzs: t4Fund.clientFeeTzs, platformFeeTzs: t4Fund.clientFeeTzs * 2,
    totalEscrowBalanceTzs: t4Fund.amountToFundTzs,
    routeClassification: "Domestic", origin: "Dar es Salaam", destination: "Morogoro",
    startDate: t4Start, endDate: t4End, dailyRateTzs: t4Daily, transferFeeTzs: t4Transfer,
    contractStage: "Executing", milestoneStatus: "ActiveTransit",
  });
  await db.insert(documents).values([
    { id: id("doc"), ownerId: clientId, tenderId: t4, kind: "Permit", label: "TARURA permit", fileKey: "", mimeType: "application/pdf", verifiedBy: adminId, verifiedAt: new Date() },
    { id: id("doc"), ownerId: clientId, tenderId: t4, kind: "TTProof", label: "TT payment proof", fileKey: "", mimeType: "image/png", verifiedBy: adminId, verifiedAt: new Date() },
  ]);
  await db.insert(activityEvents).values([
    { id: id("evt"), tenderId: t4, actorProfileId: clientId, type: "tender.awarded", summary: "Award confirmed: 1 supplier, 1/1 unit at flat fair TZS 1,750,000/unit." },
    { id: id("evt"), tenderId: t4, actorProfileId: adminId, type: "stage.advance", summary: "Nguzo HQ → Approved — executing." },
  ]);

  // ============================================================
  //  TENDER 5: MachineDocsUploaded — field report SUBMITTED, awaiting KAM review
  // ============================================================
  const t5 = id("tnd");
  const flat5 = 1_400_000;
  const t5Start = isoIn(10);
  const t5End = endFrom(t5Start, 20);
  await db.insert(tenders).values({
    id: t5, clientId, title: "Wheel Loader ×1 — Quarry stockpile feed",
    demandType: "Machinery", carrierOrMachineType: "Wheel Loader", cargoOrProjectDesc: "stockpile feed & loading",
    unitsNeeded: 1, routeClassification: "Domestic", origin: "Dar es Salaam", destination: "Mlandizi",
    startDate: t5Start, jobDays: 20, endDate: t5End, estTransferDays: 1,
    flatFairPriceTzs: flat5, tenderStage: "MachineDocsUploaded", status: "Awarded",
  });
  const t5c = id("ctr");
  const t5Value = flat5;
  const t5Fund = computeAmountToFund(t5Value);
  await db.insert(contracts).values({
    id: t5c, tenderId: t5, clientId, supplierId, assetId: "",
    title: "Wheel Loader ×1 — Quarry stockpile feed", unitsAwarded: 1, agreedPricePerUnitTzs: flat5,
    contractValueTzs: t5Value, clientFeeTzs: t5Fund.clientFeeTzs, platformFeeTzs: t5Fund.clientFeeTzs * 2,
    routeClassification: "Domestic", origin: "Dar es Salaam", destination: "Mlandizi",
    startDate: t5Start, endDate: t5End, dailyRateTzs: 50_000, transferFeeTzs: 400_000,
    contractStage: "MachineDocsUploaded", milestoneStatus: "AwaitingEscrowDeposit",
  });
  await db.insert(documents).values([
    { id: id("doc"), ownerId: supplierId, tenderId: t5, contractId: t5c, kind: "SignedAgreement", label: "Signed agreement", fileKey: "", mimeType: "application/pdf" },
    { id: id("doc"), ownerId: supplierId, tenderId: t5, contractId: t5c, kind: "MachineDoc", label: "Fleet registration + insurance", fileKey: "", mimeType: "application/pdf" },
  ]);
  await db.insert(inspections).values({
    id: id("insp"), tenderId: t5, contractId: t5c, inspectorId: fieldId,
    mechanicalNotes: "Wheel loader inspected at Vingunguti yard. Serial matched logbook, hydraulics good, tyres 70%. Documents in order.",
    docsChecked: true, machineInspected: true, reportStatus: "Submitted", legitimacySignedOff: false,
  });
  await db.insert(activityEvents).values([
    { id: id("evt"), tenderId: t5, actorProfileId: clientId, type: "tender.awarded", summary: "Award confirmed: 1 supplier, 1/1 unit at flat fair TZS 1,400,000/unit." },
    { id: id("evt"), tenderId: t5, actorProfileId: fieldId, type: "inspection.submitted", summary: "Field report submitted by Neema Kileo for KAM review." },
  ]);
  await db.insert(notifications).values({ id: id("ntf"), recipientProfileId: kamId, tenderId: t5, channel: "email", subject: "Field report awaiting review", body: "Neema Kileo submitted an inspection report for review.", status: "Logged" });

  // ============================================================
  //  TENDER 6: Executing + client SIGNED OFF → awaiting supplier payout approval
  // ============================================================
  const t6 = id("tnd");
  const flat6 = 920_000;
  await db.insert(tenders).values({
    id: t6, clientId, title: "Tippers ×3 — Completed haul, payout pending",
    demandType: "CargoCarrier", carrierOrMachineType: "Tipper Truck", cargoOrProjectDesc: "completed aggregate haul",
    unitsNeeded: 3, routeClassification: "Domestic", origin: "Dar es Salaam", destination: "Bagamoyo",
    needByDate: isoIn(-3), transitDays: 2,
    flatFairPriceTzs: flat6, tenderStage: "Executing", status: "Executing",
  });
  const t6c = id("ctr");
  const t6Value = 3 * flat6;
  const t6Fund = computeAmountToFund(t6Value);
  await db.insert(contracts).values({
    id: t6c, tenderId: t6, clientId, supplierId, assetId: "",
    title: "Tippers ×3 — Completed haul, payout pending", unitsAwarded: 3, agreedPricePerUnitTzs: flat6,
    contractValueTzs: t6Value, clientFeeTzs: t6Fund.clientFeeTzs, platformFeeTzs: t6Fund.clientFeeTzs * 2,
    totalEscrowBalanceTzs: t6Fund.amountToFundTzs,
    routeClassification: "Domestic", origin: "Dar es Salaam", destination: "Bagamoyo",
    contractStage: "Executing", milestoneStatus: "SignedOff",
    signedOffAt: new Date(), payoutStatus: "AwaitingSupplierApproval",
  });
  await db.insert(activityEvents).values([
    { id: id("evt"), tenderId: t6, actorProfileId: clientId, type: "tender.awarded", summary: "Award confirmed: 1 supplier, 3/3 units at flat fair TZS 920,000/unit." },
    { id: id("evt"), contractId: t6c, tenderId: t6, actorProfileId: clientId, type: "contract.signoff", summary: "Client signed off. Payout pending KAM processing." },
  ]);
  await db.insert(notifications).values({ id: id("ntf"), recipientProfileId: kamId, tenderId: t6, channel: "email", subject: "Sign-off received — process payout", body: "Client signed off \"Tippers ×3\". Review the supplier bank details and upload the TT slip.", status: "Logged" });

  // ============================================================
  //  PARTS inventory (owned by parts@) + demo spare orders across states
  // ============================================================
  await db.delete(partOrders);
  await db.delete(parts);
  const P = (partName: string, sku: string, model: string, wholesale: number, retail: number, handling: number, loc: string, stock: number) => ({
    id: id("part"), partsSupplierId: partsId, partName, sku, compatibleModel: model,
    wholesaleCostTzs: wholesale, retailCostTzs: retail, logisticsHandlingFeeTzs: handling,
    darSupplierName: "Zawadi Spares (Vingunguti)", darSupplierLocation: loc, stockQty: stock,
    status: stock > 0 ? "Active" : "OutOfStock",
  });
  const PARTS = [
    P("Turbocharger", "TRB-320D", "Caterpillar 320D", 3_800_000, 5_200_000, 320_000, "Vingunguti", 4),
    P("Hydraulic pump", "HYP-FH16", "Volvo FH16", 2_400_000, 3_300_000, 180_000, "Nyerere Rd", 3),
    P("Alternator 24V", "ALT-24-ACT", "Mercedes Actros 3340", 850_000, 1_250_000, 90_000, "Vingunguti", 6),
    P("Brake chamber set", "BRK-SET", "Tipper Truck (universal)", 420_000, 640_000, 60_000, "Vingunguti", 8),
    P("Final drive seal kit", "FDS-D6R", "Caterpillar D6R", 680_000, 980_000, 70_000, "Nyerere Rd", 5),
    P("Injector (reman)", "INJ-OM501", "Mercedes OM501", 540_000, 790_000, 50_000, "Vingunguti", 0),
  ];
  await db.insert(parts).values(PARTS);

  // demo orders: one awaiting KAM routing (Requested), one ready for parts dispatch (SentToParts)
  await db.insert(partOrders).values([
    { id: id("po"), contractId: c1, partId: PARTS[0].id, status: "Requested", requestedByProfileId: supplierId, partsSupplierId: partsId, deliverTo: "FieldAgent", retailCostTzs: PARTS[0].retailCostTzs, totalCostTzs: PARTS[0].retailCostTzs + PARTS[0].logisticsHandlingFeeTzs, manifestRef: "" },
    { id: id("po"), contractId: c1, partId: PARTS[1].id, status: "SentToParts", requestedByProfileId: supplierId, kamId, partsSupplierId: partsId, deliverTo: "MachineSupplier", retailCostTzs: PARTS[1].retailCostTzs, totalCostTzs: PARTS[1].retailCostTzs + PARTS[1].logisticsHandlingFeeTzs, courier: "Shabiby", manifestRef: "AFG-MAN-552031" },
    { id: id("po"), contractId: c1, partId: PARTS[2].id, status: "Dispatched", requestedByProfileId: supplierId, kamId, partsSupplierId: partsId, deliverTo: "MachineSupplier", retailCostTzs: PARTS[2].retailCostTzs, totalCostTzs: PARTS[2].retailCostTzs + PARTS[2].logisticsHandlingFeeTzs, courier: "Super Feo", waybillRef: "SF-90218", manifestRef: "AFG-MAN-118842" },
  ]);

  console.log("✅ Demo seed complete.");
  console.log("Logins (password: " + PASSWORD + "):");
  DEMO.forEach((d) => console.log(`  ${d.role.padEnd(13)} ${d.email}`));
}


main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

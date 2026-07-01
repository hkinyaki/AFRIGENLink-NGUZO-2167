/**
 * Raw-fetch helpers for the Job/Tender procurement flow + file uploads + PDFs.
 * (The hono RPC client is awkward with hyphenated nested paths, so the staged
 *  gate + uploads use a thin authenticated fetch wrapper here.)
 */
import { getToken } from "./auth";
import { jsPDF } from "jspdf";

async function authFetch(path: string, init?: RequestInit) {
  const token = getToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `Request failed (${res.status})`);
  return json;
}

export const TenderAPI = {
  list: () => authFetch("/api/tenders") as Promise<{ tenders: any[] }>,
  get: (id: string) => authFetch(`/api/tenders/${id}`) as Promise<any>,
  create: (body: any) => authFetch("/api/tenders", { method: "POST", body: JSON.stringify(body) }) as Promise<{ tenderId: string }>,
  bid: (
    id: string,
    body: {
      unitsOffered: number;
      pricePerUnitTzs?: number; // cargo flat per-unit
      transferFeeTzs?: number; // machinery one-off transfer per unit
      dailyRateTzs?: number; // machinery per-day rental
      note?: string;
      availabilityNote?: string;
    }
  ) => authFetch(`/api/tenders/${id}/bids`, { method: "POST", body: JSON.stringify(body) }),
  confirmAward: (id: string) => authFetch(`/api/tenders/${id}/confirm-award`, { method: "POST", body: JSON.stringify({}) }),
  advance: (id: string, step: string) => authFetch(`/api/tenders/${id}/advance/${step}`, { method: "POST", body: JSON.stringify({}) }),
  messages: (id: string) => authFetch(`/api/tenders/${id}/messages`) as Promise<{ messages: any[] }>,
  sendMessage: (id: string, body: string) => authFetch(`/api/tenders/${id}/messages`, { method: "POST", body: JSON.stringify({ body }) }),
  timeline: (id: string) => authFetch(`/api/tenders/${id}/timeline`) as Promise<{ timeline: any[] }>,
  // hire extensions (machinery)
  extend: (contractId: string, addedDays: number) =>
    authFetch(`/api/contracts/${contractId}/extend`, { method: "POST", body: JSON.stringify({ addedDays }) }) as Promise<{
      ok: boolean;
      extension: { id: string; addedDays: number; newEndDate: string; extraAmountTzs: number; clientFeeTzs: number; amountToFundTzs: number; dueDate: string };
    }>,
  // supplier accepts/declines an extension request
  extendRespond: (contractId: string, extId: string, body: { accept: boolean; declineReason?: string }) =>
    authFetch(`/api/contracts/${contractId}/extend/${extId}/respond`, { method: "POST", body: JSON.stringify(body) }),
  // client or supplier e-signs (ticks) the extension contract
  extendSign: (contractId: string, extId: string) =>
    authFetch(`/api/contracts/${contractId}/extend/${extId}/sign`, { method: "POST", body: JSON.stringify({}) }) as Promise<{ ok: boolean; bothSigned: boolean }>,
  // KAM/admin activates the payment gateway for a signed extension
  extendActivate: (contractId: string, extId: string) =>
    authFetch(`/api/contracts/${contractId}/extend/${extId}/activate`, { method: "POST", body: JSON.stringify({}) }),
  // client funds the extension (back-office, no upload)
  payExtension: (contractId: string, extId: string) =>
    authFetch(`/api/contracts/${contractId}/extend/${extId}/pay`, { method: "POST", body: JSON.stringify({}) }),
  // admin/KAM confirms extension escrow secured
  confirmExtension: (contractId: string, extId: string) =>
    authFetch(`/api/contracts/${contractId}/extend/${extId}/confirm`, { method: "POST", body: JSON.stringify({}) }),
  getExtensions: (contractId: string) =>
    authFetch(`/api/contracts/${contractId}/extensions`) as Promise<{ extensions: any[] }>,
  // payout chain — 4 gated steps: supplier mark-complete → client sign-off → KAM submit → admin release
  markComplete: (contractId: string, remarks?: string) => authFetch(`/api/contracts/${contractId}/mark-complete`, { method: "POST", body: JSON.stringify({ remarks }) }),
  signOff: (contractId: string) => authFetch(`/api/contracts/${contractId}/sign-off`, { method: "POST", body: JSON.stringify({}) }),
  getPayout: (contractId: string) => authFetch(`/api/contracts/${contractId}/payout`) as Promise<{ contract: any; bank: any; slipUrl: string; payoutStatus: string; preview: any }>,
  uploadPayoutSlip: (contractId: string, slipKey: string) => authFetch(`/api/contracts/${contractId}/payout-slip`, { method: "POST", body: JSON.stringify({ slipKey }) }),
  approveRelease: (contractId: string) => authFetch(`/api/contracts/${contractId}/approve-release`, { method: "POST", body: JSON.stringify({}) }),

  // --- reversals (cancel / refund / shorten) ---
  reversalRequest: (
    contractId: string,
    body: { reason: "Cancel" | "Refund" | "Shorten"; actualDays?: number; note?: string },
  ) =>
    authFetch(`/api/contracts/${contractId}/reversal/request`, { method: "POST", body: JSON.stringify(body) }) as Promise<{
      ok: boolean;
      id: string;
      preview: any;
    }>,
  reversalReview: (reversalId: string, body: { decision: "Forward" | "Reject"; note?: string }) =>
    authFetch(`/api/reversals/${reversalId}/review`, { method: "POST", body: JSON.stringify(body) }),
  reversalApprove: (reversalId: string, reversalSlipKey?: string) =>
    authFetch(`/api/reversals/${reversalId}/approve`, { method: "POST", body: JSON.stringify({ reversalSlipKey }) }) as Promise<{
      ok: boolean;
      result: any;
    }>,
  getReversal: (contractId: string) =>
    authFetch(`/api/contracts/${contractId}/reversal`) as Promise<{ reversals: any[]; slipUrl: string }>,
  listReversals: () => authFetch("/api/reversals") as Promise<{ reversals: any[] }>,
  // field report review (KAM)
  reviewReport: (inspectionId: string, body: { approve: boolean; declineReason?: string; hardDecline?: boolean }) =>
    authFetch(`/api/inspections/${inspectionId}/review`, { method: "POST", body: JSON.stringify(body) }),
};

export const PartsAPI = {
  // supplier searches catalogue (in-stock spares)
  search: (model?: string) => authFetch(`/api/parts${model ? `?model=${encodeURIComponent(model)}` : ""}`) as Promise<{ parts: any[] }>,
  mine: () => authFetch("/api/parts/mine") as Promise<{ parts: any[] }>,
  create: (body: any) => authFetch("/api/parts", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: any) => authFetch(`/api/parts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  orders: () => authFetch("/api/part-orders") as Promise<{ orders: any[] }>,
  reportBreakdown: (contractId: string, partId: string, opts?: { deliverTo?: string; qty?: number; receiverName?: string; receiverDestination?: string }) =>
    authFetch(`/api/contracts/${contractId}/report-breakdown`, { method: "POST", body: JSON.stringify({ partId, ...(opts ?? {}) }) }),
  route: (orderId: string) => authFetch(`/api/part-orders/${orderId}/route`, { method: "POST", body: JSON.stringify({}) }) as Promise<{ ok: boolean; reason?: string }>,
  dispatch: (orderId: string, body: { courier?: string; waybillRef?: string }) =>
    authFetch(`/api/part-orders/${orderId}/dispatch`, { method: "POST", body: JSON.stringify(body) }),
  generateReceipt: (orderId: string) =>
    authFetch(`/api/part-orders/${orderId}/generate-receipt`, { method: "POST", body: JSON.stringify({}) }) as Promise<{ ok: boolean; efdNumber: string }>,
};

export const StaffAPI = {
  list: () => authFetch("/api/admin/staff") as Promise<{ staff: any[] }>,
  setRole: (profileId: string, role: string) => authFetch(`/api/admin/staff/${profileId}/role`, { method: "POST", body: JSON.stringify({ role }) }),
  // Staff are created with an admin-set USERNAME (not email) + optional temp password.
  create: (body: { username: string; password?: string; name: string; role: string; phone?: string; managerId?: string; fieldStation?: string }) =>
    authFetch("/api/admin/staff/create", { method: "POST", body: JSON.stringify(body) }) as Promise<{ ok: boolean; profileId: string; username: string; tempPassword: string; userCode: string }>,
  remove: (profileId: string) => authFetch(`/api/admin/staff/${profileId}/delete`, { method: "POST", body: JSON.stringify({}) }),
  resetPassword: (profileId: string) =>
    authFetch(`/api/admin/staff/${profileId}/reset-password`, { method: "POST", body: JSON.stringify({}) }) as Promise<{ ok: boolean; tempPassword: string }>,
  requests: () => authFetch("/api/staff-requests") as Promise<{ requests: any[] }>,
  requestAgent: (body: { proposedName: string; proposedEmail: string; proposedPhone?: string }) =>
    authFetch("/api/staff-requests", { method: "POST", body: JSON.stringify(body) }),
  resolveRequest: (id: string, approve: boolean, opts?: { password?: string; username?: string }) =>
    authFetch(`/api/staff-requests/${id}/resolve`, { method: "POST", body: JSON.stringify({ approve, ...opts }) }) as Promise<{ ok: boolean; username?: string; tempPassword?: string; userCode?: string }>,
};

export const ProfileAPI = {
  update: (body: Record<string, unknown>) => authFetch("/api/profile", { method: "POST", body: JSON.stringify(body) }),
  // self profile (name/phone/photo) + change password
  updateSelf: (body: { fullName?: string; companyName?: string; phone?: string; photoKey?: string }) =>
    authFetch("/api/me/profile", { method: "POST", body: JSON.stringify(body) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    authFetch("/api/me/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
  get: (profileId: string) => authFetch(`/api/profile/${profileId}`) as Promise<{ profile: any }>,
};

export const SupportAPI = {
  myTicket: () => authFetch("/api/support/ticket") as Promise<{ ticket: any; messages: any[] }>,
  open: (body: { topic: string; urgency: string; detail: string }) =>
    authFetch("/api/support/ticket", { method: "POST", body: JSON.stringify(body) }) as Promise<{ ok: boolean; ticketId: string }>,
  send: (ticketId: string, body: string) =>
    authFetch(`/api/support/ticket/${ticketId}/message`, { method: "POST", body: JSON.stringify({ body }) }),
  queue: () => authFetch("/api/support/queue") as Promise<{ tickets: any[] }>,
  thread: (ticketId: string) => authFetch(`/api/support/ticket/${ticketId}/thread`) as Promise<{ ticket: any; messages: any[] }>,
};

export const OnboardingAPI = {
  get: () => authFetch("/api/onboarding") as Promise<{ profile: any; kybDocuments: any[] }>,
  save: (body: Record<string, unknown>) => authFetch("/api/onboarding", { method: "POST", body: JSON.stringify(body) }) as Promise<{ ok: boolean; profile: any }>,
};

export const AdminAPI = {
  verificationQueue: () => authFetch("/api/admin/verification-queue") as Promise<{ remote: any[]; siteVisit: any[]; staff: any[] }>,
  profile: (profileId: string) => authFetch(`/api/admin/profile/${profileId}`) as Promise<{ profile: any; documents: any[]; faceUrl: string; idDocUrl: string; photoUrl: string }>,
  verify: (profileId: string, status: string, notes?: string) =>
    authFetch(`/api/admin/verify/${profileId}`, { method: "POST", body: JSON.stringify({ status, notes }) }),
  kams: () => authFetch("/api/admin/kams") as Promise<{ kams: any[] }>,
  assignKam: (profileId: string, kamId: string) =>
    authFetch(`/api/admin/assign-kam/${profileId}`, { method: "POST", body: JSON.stringify({ kamId }) }),
  setStation: (profileId: string, station: string) =>
    authFetch(`/api/admin/field/${profileId}/station`, { method: "POST", body: JSON.stringify({ station }) }),
};

export const KamAPI = {
  clients: (kamId?: string) => authFetch(`/api/kam/clients${kamId ? `?kamId=${kamId}` : ""}`) as Promise<{ clients: any[] }>,
};

export const FieldAPI = {
  inspections: () => authFetch("/api/field/inspections") as Promise<{ inspections: any[] }>,
  revealContact: (inspectionId: string) =>
    authFetch(`/api/field/inspection/${inspectionId}/reveal-contact`, { method: "POST", body: JSON.stringify({}) }) as Promise<{ phone: string; name: string }>,
  myAccounts: () => authFetch("/api/field/my-accounts") as Promise<{ accounts: any[] }>,
  partDeliveries: () => authFetch("/api/field/part-deliveries") as Promise<{ deliveries: any[] }>,
  markPartReceived: (orderId: string) =>
    authFetch(`/api/field/part-deliveries/${orderId}/received`, { method: "POST", body: JSON.stringify({}) }) as Promise<{ ok: boolean }>,
};

export const DocAPI = {
  list: (params: { tenderId?: string; contractId?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return authFetch(`/api/documents?${q}`) as Promise<{ documents: any[] }>;
  },
  save: (body: { tenderId?: string; contractId?: string; kind: string; label?: string; fileKey: string; mimeType?: string }) =>
    authFetch("/api/documents", { method: "POST", body: JSON.stringify(body) }),
  verify: (id: string) => authFetch(`/api/documents/${id}/verify`, { method: "POST", body: JSON.stringify({}) }),
  // simulated doc-view OTP (logged to admin)
  otpIssue: (docId: string) => authFetch("/api/chat/doc-otp/issue", { method: "POST", body: JSON.stringify({ docId }) }) as Promise<{ ok: boolean; simulatedCode: string; expiresInSec: number }>,
  otpVerify: (docId: string, code: string) => authFetch("/api/chat/doc-otp/verify", { method: "POST", body: JSON.stringify({ docId, code }) }) as Promise<{ ok: boolean; url: string | null }>,
};

/** Presign → PUT directly to storage → return the object key. */
export async function uploadFile(file: File, scope = "doc"): Promise<{ key: string; mimeType: string }> {
  const { url, key } = (await authFetch("/api/uploads/presign", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", scope, size: file.size }),
  })) as { url: string; key: string };
  const put = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
  if (!put.ok) throw new Error("Upload failed");
  return { key, mimeType: file.type || "application/octet-stream" };
}

/** Upload a file to storage and return just the object key (no Document row). */
export async function uploadRaw(file: File, scope = "kyc"): Promise<string> {
  const { key } = await uploadFile(file, scope);
  return key;
}

// ---------- PDF generation ----------

const NAVY = "#141B2E";
const AMBER = "#D99A2B";

function header(doc: jsPDF, title: string) {
  doc.setFillColor(NAVY);
  doc.rect(0, 0, 210, 26, "F");
  doc.setTextColor(AMBER);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("AFRIGEN LINK", 14, 13);
  doc.setTextColor("#FFFFFF");
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Cargo & Machinery Coordination — Secured", 14, 19);
  doc.setTextColor(NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, 14, 40);
}

function fmt(n: number) {
  return `TZS ${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}

/** Contract of agreement for one awarded supplier line (download → sign → re-upload). */
export function generateAgreementPDF(opts: {
  tenderTitle: string;
  clientName: string;
  supplierName: string;
  unitsAwarded: number;
  pricePerUnitTzs: number;
  origin: string;
  destination: string;
  route: string;
  contractId: string;
  // timing / billing (machinery)
  demandType?: "CargoCarrier" | "Machinery";
  startDate?: string;
  endDate?: string;
  jobDays?: number;
  dailyRateTzs?: number;
  transferFeeTzs?: number;
  // cargo timing
  needByDate?: string;
  transitDays?: number;
}) {
  const doc = new jsPDF();
  header(doc, "Contract of Agreement");
  const isMachinery = opts.demandType === "Machinery";
  const total = opts.unitsAwarded * opts.pricePerUnitTzs;
  const clientFee = Math.round(total * 0.05);
  const totalFunds = total + clientFee;
  const supplierNet = total - Math.round(total * 0.05);
  let y = 52;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#333333");
  const line = (label: string, val: string) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(val, 78, y);
    y += 7;
  };
  line("Reference", opts.contractId);
  line("Job / Tender", opts.tenderTitle);
  line("Client", opts.clientName);
  line("Awarded supplier", opts.supplierName);
  line("Units awarded", String(opts.unitsAwarded));
  line("Lane", `${opts.origin} → ${opts.destination} (${opts.route})`);
  // Timing
  if (isMachinery) {
    line("Hire period", `${opts.startDate || "—"} → ${opts.endDate || "—"} (${opts.jobDays || 0} working days)`);
    line("Note", "End date is the last working day; the return-to-yard day is not charged.");
    if (opts.transferFeeTzs) line("Transfer fee / unit", `${fmt(opts.transferFeeTzs)} (one-off lowbed)`);
    if (opts.dailyRateTzs) line("Daily rate / unit", `${fmt(opts.dailyRateTzs)} per day`);
  } else {
    if (opts.needByDate) line("Need-by date", opts.needByDate);
    if (opts.transitDays) line("Est. transit", `${opts.transitDays} day(s)`);
  }
  line("Flat fair price / unit", fmt(opts.pricePerUnitTzs));
  line("Contract value", fmt(total));
  y += 3;
  doc.setDrawColor("#DDDDDD");
  doc.line(14, y, 196, y);
  y += 8;
  // Money summary
  doc.setFont("helvetica", "bold");
  doc.setTextColor(NAVY);
  doc.text("Settlement summary", 14, y);
  y += 7;
  const money = (label: string, val: string) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#333333");
    doc.text(label, 14, y);
    doc.text(val, 196, y, { align: "right" });
    y += 6;
  };
  money("Contract value", fmt(total));
  money("Client service fee (5%)", `+ ${fmt(clientFee)}`);
  money("Total client funds into escrow", fmt(totalFunds));
  money("Supplier net (after 5% supplier fee)", fmt(supplierNet));
  y += 4;
  doc.setDrawColor("#DDDDDD");
  doc.line(14, y, 196, y);
  y += 9;
  doc.setFontSize(9);
  doc.setTextColor("#555555");
  const terms = [
    "1. The supplier agrees to provide the awarded units at the flat fair price stated above.",
    "2. Funds are coordinated through AFRIGEN Link and tracked end-to-end (held, not disbursed, until sign-off).",
    "3. The supplier shall submit machine/fleet documents for field inspection before mobilisation.",
    "4. Permits and payment proof are verified by AFRIGEN Link before execution is authorised.",
    "5. AFRIGEN Link charges a flat 10% service fee (5% client, added on top; 5% supplier, deducted at settlement) plus any emergency-parts credit used.",
    ...(isMachinery
      ? [
          "6. Machinery hire is billed from transfer/departure through the last working day; the return-to-yard day is not charged.",
          "7. The client may extend the hire before the end date at the same daily rate (+5% client fee). An unpaid extension past the end date authorises the supplier to recover the machine.",
        ]
      : []),
  ];
  terms.forEach((t) => {
    const wrapped = doc.splitTextToSize(t, 182);
    doc.text(wrapped, 14, y);
    y += wrapped.length * 5 + 2;
  });
  y += 14;
  doc.setTextColor("#333333");
  doc.setFontSize(10);
  doc.text("Supplier signature: ______________________", 14, y);
  doc.text("Date: ____________", 140, y);
  y += 16;
  doc.text("Client signature: ______________________", 14, y);
  doc.text("Date: ____________", 140, y);
  doc.save(`AFRIGEN-Link-Agreement-${opts.contractId}.pdf`);
}

/** Settlement invoice PDF (replaces the old window.print popup). */
export function generateInvoicePDF(inv: { party: string; lineItems: { label: string; amountTzs: number }[]; totalTzs: number }, c: { title: string; origin: string; destination: string; routeClassification: string }) {
  const doc = new jsPDF();
  header(doc, `${inv.party} Settlement Invoice`);
  let y = 50;
  doc.setFontSize(10);
  doc.setTextColor("#555555");
  doc.text(`Contract: ${c.title}`, 14, y);
  y += 6;
  doc.text(`Lane: ${c.origin} → ${c.destination} · ${c.routeClassification}`, 14, y);
  y += 12;
  doc.setDrawColor("#EEEEEE");
  (inv.lineItems || []).forEach((li) => {
    doc.setTextColor("#333333");
    doc.text(li.label, 14, y);
    doc.text(`${li.amountTzs < 0 ? "-" : ""}${fmt(li.amountTzs)}`, 196, y, { align: "right" });
    doc.line(14, y + 2, 196, y + 2);
    y += 9;
  });
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Total", 14, y);
  doc.text(fmt(inv.totalTzs), 196, y, { align: "right" });
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor("#888888");
  doc.text("Simulated settlement · AFRIGEN Link service fee 10% (5% client + 5% supplier) · funds tracked, not held · figures illustrative.", 14, y);
  doc.save(`AFRIGEN-Link-Invoice-${inv.party}.pdf`);
}

/**
 * Spare-part EFD (fiscal) receipt — simulated TRA receipt issued by the parts supplier
 * once the part is dispatched (payment cleared). EFD number is simulated.
 */
export function generateEfdReceiptPDF(o: {
  efdNumber: string; partName?: string; sku?: string; qty?: number;
  retailCostTzs?: number; totalCostTzs?: number; contractTitle?: string;
  receiverName?: string; receiverDestination?: string; courier?: string; waybillRef?: string;
}) {
  const doc = new jsPDF();
  header(doc, "EFD Receipt — Spare Part");
  let y = 50;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(NAVY);
  doc.text(`EFD No. ${o.efdNumber}`, 14, y);
  y += 9;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#333333");
  const row = (k: string, v: string) => { doc.setFont("helvetica", "bold"); doc.text(k, 14, y); doc.setFont("helvetica", "normal"); doc.text(v, 78, y); y += 7; };
  row("Part", `${o.partName ?? "Spare part"}${o.sku ? ` (${o.sku})` : ""}`);
  row("Quantity", String(o.qty ?? 1));
  if (o.contractTitle) row("Contract", o.contractTitle);
  if (o.receiverName || o.receiverDestination) row("Deliver to", `${o.receiverName ?? "—"}${o.receiverDestination ? ` @ ${o.receiverDestination}` : ""}`);
  if (o.courier) row("Courier", `${o.courier}${o.waybillRef ? ` · waybill ${o.waybillRef}` : ""}`);
  y += 3;
  doc.setDrawColor("#DDDDDD");
  doc.line(14, y, 196, y);
  y += 9;
  const qty = o.qty ?? 1;
  const unit = o.retailCostTzs ?? (o.totalCostTzs ? Math.round((o.totalCostTzs) / qty) : 0);
  const total = o.totalCostTzs ?? unit * qty;
  doc.text("Unit price", 14, y); doc.text(fmt(unit), 196, y, { align: "right" }); y += 7;
  doc.text(`Quantity × ${qty}`, 14, y); doc.text(fmt(unit * qty), 196, y, { align: "right" }); y += 7;
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Total (VAT incl.)", 14, y); doc.text(fmt(total), 196, y, { align: "right" }); y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor("#888888");
  doc.text("Simulated EFD fiscal receipt for demonstration · figures illustrative · no real TRA transmission.", 14, y);
  doc.save(`AFRIGEN-Link-EFD-${o.efdNumber}.pdf`);
}

/**
 * AFRIGEN Link escrow funding bank-details sheet (PLACEHOLDER details for now).
 * Downloadable at the TT-upload stage so the client knows where to wire funds.
 */
export function generateBankPDF(opts: { contractTitle: string; amountToFundTzs?: number; reference?: string }) {
  const doc = new jsPDF();
  header(doc, "Escrow Funding — Bank Details");
  let y = 50;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#333333");
  doc.text(`Job: ${opts.contractTitle}`, 14, y);
  y += 7;
  if (opts.amountToFundTzs) {
    doc.setFont("helvetica", "bold");
    doc.text(`Amount to fund: ${fmt(opts.amountToFundTzs)}  (contract value + 5% service fee)`, 14, y);
    doc.setFont("helvetica", "normal");
    y += 9;
  }
  doc.setDrawColor("#DDDDDD");
  doc.line(14, y, 196, y);
  y += 9;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(NAVY);
  doc.text("Pay into the AFRIGEN Link coordination account", 14, y);
  y += 8;
  const row = (k: string, v: string) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#333333");
    doc.text(k, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(v, 78, y);
    y += 7;
  };
  row("Account name", "AFRIGEN Link Ltd — Coordination Trust");
  row("Bank", "[Placeholder Bank — to be confirmed]");
  row("Branch", "Dar es Salaam Main");
  row("Account no. (TZS)", "0000 0000 0000");
  row("SWIFT", "XXXXTZTZ");
  row("Reference", opts.reference || "Use your Job/Contract reference");
  y += 4;
  doc.setDrawColor("#DDDDDD");
  doc.line(14, y, 196, y);
  y += 10;
  doc.setFontSize(8.5);
  doc.setTextColor("#888888");
  const note = doc.splitTextToSize(
    "Funds are coordinated through AFRIGEN Link and tracked end-to-end. Upload your TT payment proof in the dashboard once the transfer is made; execution is authorised only after the proof is verified. Bank details shown here are placeholders pending the licensed escrow/aggregator binding.",
    182
  );
  doc.text(note, 14, y);
  doc.save(`AFRIGEN-Link-Bank-Details-${(opts.reference || "funding").replace(/[^a-z0-9]/gi, "-")}.pdf`);
}

/** Reversal advice note — cancellation / refund / shortened-hire line items. */
export function generateReversalPDF(opts: {
  reference: string;
  contractTitle: string;
  reason: string; // Cancel | Refund | Shorten
  clientName?: string;
  supplierName?: string;
  lineItems: {
    client: { label: string; amountTzs: number }[];
    supplier: { label: string; amountTzs: number }[];
    nguzo: { label: string; amountTzs: number }[];
  };
  clientRefundTzs?: number;
  status?: string;
}) {
  const doc = new jsPDF();
  header(doc, "Reversal Advice");
  let y = 50;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#333333");
  const meta = (k: string, v: string) => {
    doc.setFont("helvetica", "bold");
    doc.text(k, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(v, 78, y);
    y += 7;
  };
  meta("Reference", opts.reference);
  meta("Job / Contract", opts.contractTitle);
  meta("Type", opts.reason);
  if (opts.clientName) meta("Client", opts.clientName);
  if (opts.supplierName) meta("Supplier", opts.supplierName);
  if (opts.status) meta("Status", opts.status);
  y += 2;
  doc.setDrawColor("#DDDDDD");
  doc.line(14, y, 196, y);
  y += 9;

  const section = (title: string, items: { label: string; amountTzs: number }[]) => {
    if (!items.length) return;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(NAVY);
    doc.setFontSize(11);
    doc.text(title, 14, y);
    y += 7;
    doc.setFontSize(10);
    items.forEach((it) => {
      doc.setFont("helvetica", "normal");
      doc.setTextColor("#333333");
      doc.text(it.label, 14, y);
      const neg = it.amountTzs < 0;
      doc.setTextColor(neg ? "#a23" : "#333333");
      doc.text(`${neg ? "− " : ""}${fmt(Math.abs(it.amountTzs))}`, 196, y, { align: "right" });
      y += 6;
    });
    y += 4;
  };
  section("Client", opts.lineItems.client);
  section("Supplier", opts.lineItems.supplier);
  section("AFRIGEN Link", opts.lineItems.nguzo);

  if (typeof opts.clientRefundTzs === "number") {
    doc.setDrawColor("#DDDDDD");
    doc.line(14, y, 196, y);
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(AMBER);
    doc.setFontSize(12);
    doc.text("Net refund to client bank account", 14, y);
    doc.setTextColor(NAVY);
    doc.text(fmt(opts.clientRefundTzs), 196, y, { align: "right" });
    y += 10;
  }
  doc.setFontSize(8.5);
  doc.setTextColor("#888888");
  const note = doc.splitTextToSize(
    "Reversal figures are computed by AFRIGEN Link's settlement engine and recomputed at approval. Refunds are instructed to the client's registered bank account; funds are tracked end-to-end (not held by AFRIGEN Link). Emergency-parts already drawn are deducted before any refund. This advice is for record only pending the licensed escrow/aggregator binding.",
    182
  );
  doc.text(note, 14, y);
  doc.save(`AFRIGEN-Link-Reversal-${(opts.reference || "advice").replace(/[^a-z0-9]/gi, "-")}.pdf`);
}

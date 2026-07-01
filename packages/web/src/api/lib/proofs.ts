/**
 * Server-side PDF generation + persistence for AFRIGEN Link coordination docs.
 *
 * jsPDF runs under Bun without a DOM. Each generator returns the PDF bytes so
 * the same buffer can be BOTH uploaded to storage (→ a `documents` row with a
 * View URL) AND attached to a Resend email in one pass.
 *
 * All money stays SIMULATED — "funds tracked & monitored, not held." Fee model
 * is a flat 10% (5% added on top for the client, 5% deducted at settlement from
 * the supplier).
 */
import { jsPDF } from "jspdf";
import { and, eq } from "drizzle-orm";
import { db } from "../database";
import { contracts, tenders, documents, profile } from "../database/schema";
import { id } from "./ids";
import { uploadBuffer } from "./s3";
import { logNotification } from "./events";

const NAVY = "#141B2E";
const AMBER = "#D99A2B";

function fmt(n: number) {
  return `TZS ${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}

/** Short human reference from a contract/tender id. */
function refOf(prefix: string, rawId: string) {
  return `${prefix}-${rawId.slice(-8).toUpperCase()}`;
}

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

function pdfBytes(doc: jsPDF): Uint8Array {
  return new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
}

type Row = { k: string; v: string };
type Money = { label: string; amount: number; sign?: "+" | "-" };

function detailPdf(title: string, rows: Row[], money: Money[], notes: string[]): Uint8Array {
  const doc = new jsPDF();
  header(doc, title);
  let y = 52;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#333333");
  for (const r of rows) {
    doc.setFont("helvetica", "bold");
    doc.text(r.k, 14, y);
    doc.setFont("helvetica", "normal");
    const wrapped = doc.splitTextToSize(r.v, 118);
    doc.text(wrapped, 78, y);
    y += Math.max(7, wrapped.length * 5 + 2);
  }
  y += 2;
  doc.setDrawColor("#DDDDDD");
  doc.line(14, y, 196, y);
  y += 9;
  for (const m of money) {
    const bold = m.label.toLowerCase().includes("net") || m.label.toLowerCase().includes("total");
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(bold ? NAVY : "#333333");
    doc.text(m.label, 14, y);
    const prefix = m.sign === "-" ? "− " : m.sign === "+" ? "+ " : "";
    doc.text(`${prefix}${fmt(m.amount)}`, 196, y, { align: "right" });
    y += bold ? 8 : 6.5;
  }
  y += 4;
  doc.setDrawColor("#DDDDDD");
  doc.line(14, y, 196, y);
  y += 9;
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#888888");
  for (const n of notes) {
    const wrapped = doc.splitTextToSize(n, 182);
    doc.text(wrapped, 14, y);
    y += wrapped.length * 4.6 + 2;
  }
  return pdfBytes(doc);
}

/** Persist a generated PDF buffer as a `documents` row and return { id, key }. */
async function persistDoc(opts: {
  ownerId: string;
  tenderId?: string;
  contractId?: string;
  kind: string;
  label: string;
  bytes: Uint8Array;
  filename: string;
}) {
  const key = `docs/${opts.kind.toLowerCase()}/${opts.contractId || opts.tenderId || "x"}/${id("f")}-${opts.filename}`;
  await uploadBuffer(key, opts.bytes, "application/pdf");
  const docId = id("doc");
  await db.insert(documents).values({
    id: docId,
    ownerId: opts.ownerId,
    tenderId: opts.tenderId ?? "",
    contractId: opts.contractId ?? "",
    kind: opts.kind,
    label: opts.label,
    fileKey: key,
    mimeType: "application/pdf",
  });
  return { id: docId, key };
}

/**
 * Award-time settlement invoice for a contract — persisted so the supplier's
 * job card shows a viewable Invoice link.
 */
export async function issueInvoice(contractId: string): Promise<void> {
  const [ct] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  if (!ct) return;
  const value = ct.contractValueTzs || ct.unitsAwarded * ct.agreedPricePerUnitTzs;
  const clientFee = Math.round(value * 0.05);
  const supplierFee = Math.round(value * 0.05);
  const ref = refOf("AGL-CT", ct.id);
  const bytes = detailPdf(
    "Settlement Invoice",
    [
      { k: "Reference", v: ref },
      { k: "Contract", v: ct.title || "Coordination contract" },
      { k: "Lane", v: `${ct.origin} → ${ct.destination} (${ct.routeClassification})` },
      { k: "Units", v: String(ct.unitsAwarded) },
      { k: "Price / unit", v: fmt(ct.agreedPricePerUnitTzs) },
    ],
    [
      { label: "Contract value", amount: value },
      { label: "Client service fee (5%)", amount: clientFee, sign: "+" },
      { label: "Total client funds into escrow", amount: value + clientFee },
      { label: "Supplier net (after 5% supplier fee)", amount: value - supplierFee },
    ],
    [
      "Simulated settlement invoice · AFRIGEN Link flat 10% service fee (5% client added on top + 5% supplier deducted at settlement) · funds tracked and monitored, not held · figures illustrative.",
    ]
  );
  await persistDoc({
    ownerId: ct.clientId,
    tenderId: ct.tenderId ?? "",
    contractId: ct.id,
    kind: "Invoice",
    label: "Settlement invoice",
    bytes,
    filename: `AFRIGEN-Link-Invoice-${ref}.pdf`,
  });
}

/**
 * Back-office escrow confirmation. Called when Admin/KAM confirms the escrow is
 * secured (simulating the bank notification). Generates + persists a payment
 * proof for the client and a payout proof for each awarded supplier, and emails
 * each party its proof.
 */
export async function issuePaymentProofs(tenderId: string): Promise<void> {
  const [tender] = await db.select().from(tenders).where(eq(tenders.id, tenderId)).limit(1);
  if (!tender) return;
  const cts = await db.select().from(contracts).where(eq(contracts.tenderId, tenderId));
  if (!cts.length) return;

  // Aggregate the client's total funded across all awarded lines.
  const totalValue = cts.reduce((s, c) => s + (c.contractValueTzs || c.unitsAwarded * c.agreedPricePerUnitTzs), 0);
  const totalClientFee = Math.round(totalValue * 0.05);
  const totalFunded = totalValue + totalClientFee;
  const clientRef = refOf("AGL-PAY", tender.id);

  // Client payment proof (aggregate).
  const clientBytes = detailPdf(
    "Payment Proof — Client",
    [
      { k: "Reference", v: clientRef },
      { k: "Job / Tender", v: tender.title },
      { k: "Lane", v: `${tender.origin} → ${tender.destination} (${tender.routeClassification})` },
      { k: "Awarded suppliers", v: String(cts.length) },
      { k: "Status", v: "Escrow secured & monitored by AFRIGEN Link" },
    ],
    [
      { label: "Contract value", amount: totalValue },
      { label: "Service fee (5%)", amount: totalClientFee, sign: "+" },
      { label: "Total funded into escrow", amount: totalFunded },
    ],
    [
      "This confirms your payment has been received and is monitored in escrow by AFRIGEN Link. Funds are tracked and monitored, not held, and released to suppliers on completion sign-off, less their 5% fee. Simulated settlement · figures illustrative.",
    ]
  );
  const clientDoc = await persistDoc({
    ownerId: tender.clientId,
    tenderId: tender.id,
    kind: "PaymentProofClient",
    label: "Payment proof (client)",
    bytes: clientBytes,
    filename: `AFRIGEN-Link-PaymentProof-${clientRef}.pdf`,
  });
  await logNotification({
    recipientProfileId: tender.clientId,
    tenderId: tender.id,
    subject: "Payment confirmed — escrow secured",
    body: `Your payment for "${tender.title}" (Ref ${clientRef}) is confirmed and monitored in escrow. Total funded ${fmt(totalFunded)} (contract value + 5% fee). Your payment proof is attached and available in your dashboard.`,
    attachments: [{ filename: `AFRIGEN-Link-PaymentProof-${clientRef}.pdf`, content: clientBytes }],
  });

  // Per-supplier payout proof (net = value − 5% − any emergency credit already drawn).
  for (const ct of cts) {
    const value = ct.contractValueTzs || ct.unitsAwarded * ct.agreedPricePerUnitTzs;
    const supplierFee = Math.round(value * 0.05);
    const emergency = ct.emergencyCreditDeductedTzs || 0;
    const net = value - supplierFee - emergency;
    const sref = refOf("AGL-PAYOUT", ct.id);
    const bytes = detailPdf(
      "Payout Proof — Supplier",
      [
        { k: "Reference", v: sref },
        { k: "Contract", v: ct.title || tender.title },
        { k: "Lane", v: `${ct.origin} → ${ct.destination} (${ct.routeClassification})` },
        { k: "Units awarded", v: String(ct.unitsAwarded) },
        { k: "Status", v: "Escrow secured — payout on completion sign-off" },
      ],
      [
        { label: "Contract value", amount: value },
        { label: "Service fee (5%)", amount: supplierFee, sign: "-" },
        ...(emergency ? [{ label: "Emergency parts credit", amount: emergency, sign: "-" as const }] : []),
        { label: "Your net payout on completion", amount: net },
      ],
      [
        "The client's payment is confirmed and monitored in escrow by AFRIGEN Link. Your net payout is released on completion sign-off. Funds are tracked and monitored, not held. Simulated settlement · figures illustrative.",
      ]
    );
    await persistDoc({
      ownerId: ct.supplierId,
      tenderId: tender.id,
      contractId: ct.id,
      kind: "PayoutProofSupplier",
      label: "Payout proof (supplier)",
      bytes,
      filename: `AFRIGEN-Link-PayoutProof-${sref}.pdf`,
    });
    await logNotification({
      recipientProfileId: ct.supplierId,
      tenderId: tender.id,
      subject: "Escrow secured for your award",
      body: `The client's payment for "${ct.title || tender.title}" (Ref ${sref}) is confirmed and monitored in escrow. Your net payout ${fmt(net)} (value − 5% fee) is released on completion sign-off. Your payout proof is attached and available in your dashboard.`,
      attachments: [{ filename: `AFRIGEN-Link-PayoutProof-${sref}.pdf`, content: bytes }],
    });
  }
}

/**
 * System-generated extension contract for a machinery hire extension. Persisted
 * as a downloadable `documents` row (kind ExtensionContract) once the supplier
 * accepts; both parties then e-sign by ticking a box.
 */
export async function issueExtensionContract(opts: {
  contractId: string;
  extensionId: string;
  addedDays: number;
  newEndDate: string;
  extraAmountTzs: number;
  clientFeeTzs: number;
  amountToFundTzs: number;
  dueDate: string;
}): Promise<{ id: string }> {
  const [ct] = await db.select().from(contracts).where(eq(contracts.id, opts.contractId)).limit(1);
  if (!ct) return { id: "" };
  const [clientP] = await db.select().from(profile).where(eq(profile.id, ct.clientId)).limit(1);
  const [supplierP] = await db.select().from(profile).where(eq(profile.id, ct.supplierId)).limit(1);
  const supplierNet = opts.extraAmountTzs - Math.round(opts.extraAmountTzs * 0.05);
  const ref = refOf("AGL-EXT", opts.extensionId);
  const bytes = detailPdf(
    "Contract of Agreement — Hire Extension",
    [
      { k: "Reference", v: ref },
      { k: "Parent contract", v: refOf("AGL-CT", ct.id) },
      { k: "Machine hire", v: ct.title || "Machinery hire" },
      { k: "Client", v: clientP?.companyName || clientP?.fullName || "Client" },
      { k: "Supplier", v: supplierP?.companyName || supplierP?.fullName || "Supplier" },
      { k: "Lane", v: `${ct.origin} → ${ct.destination} (${ct.routeClassification})` },
      { k: "Additional days", v: `${opts.addedDays} working day(s)` },
      { k: "New end date", v: opts.newEndDate },
      { k: "Daily rate / unit", v: fmt(ct.dailyRateTzs) },
      { k: "Fund before", v: `${opts.dueDate} (current end date)` },
    ],
    [
      { label: "Extension value", amount: opts.extraAmountTzs },
      { label: "Client service fee (5%)", amount: opts.clientFeeTzs, sign: "+" },
      { label: "Total client funds into escrow", amount: opts.amountToFundTzs },
      { label: "Supplier net (after 5% supplier fee)", amount: supplierNet },
    ],
    [
      "1. This extension continues the parent hire at the same daily rate; no second transfer fee applies.",
      "2. AFRIGEN Link charges the same flat 10% service fee on the extension (5% client added on top + 5% supplier deducted at settlement).",
      "3. Funds must clear before the current end date. An unpaid extension past the end date authorises the supplier to recover the machine.",
      "4. Both parties confirm acceptance of this extension by e-signing (ticking to agree) in their dashboard; the ticked confirmation records each party's name and timestamp against this reference.",
      "Simulated settlement · funds tracked and monitored, not held · figures illustrative.",
    ]
  );
  const doc = await persistDoc({
    ownerId: ct.clientId,
    tenderId: ct.tenderId ?? "",
    contractId: ct.id,
    kind: "ExtensionContract",
    label: `Extension contract (+${opts.addedDays}d)`,
    bytes,
    filename: `AFRIGEN-Link-Extension-${ref}.pdf`,
  });
  return { id: doc.id };
}

/**
 * Extension payment proofs — issued when Admin/KAM confirms the extension escrow
 * is secured (back-office, no client upload). Client proof + supplier payout proof.
 */
export async function issueExtensionProofs(opts: {
  contractId: string;
  extensionId: string;
  extraAmountTzs: number;
  clientFeeTzs: number;
  amountToFundTzs: number;
}): Promise<void> {
  const [ct] = await db.select().from(contracts).where(eq(contracts.id, opts.contractId)).limit(1);
  if (!ct) return;
  const supplierFee = Math.round(opts.extraAmountTzs * 0.05);
  const net = opts.extraAmountTzs - supplierFee;
  const ref = refOf("AGL-EXT", opts.extensionId);

  const clientBytes = detailPdf(
    "Payment Proof — Extension (Client)",
    [
      { k: "Reference", v: ref },
      { k: "Machine hire", v: ct.title || "Machinery hire" },
      { k: "Lane", v: `${ct.origin} → ${ct.destination}` },
      { k: "Status", v: "Extension escrow secured & monitored" },
    ],
    [
      { label: "Extension value", amount: opts.extraAmountTzs },
      { label: "Service fee (5%)", amount: opts.clientFeeTzs, sign: "+" },
      { label: "Total funded into escrow", amount: opts.amountToFundTzs },
    ],
    ["Extension payment confirmed and monitored in escrow by AFRIGEN Link. Funds tracked and monitored, not held. Simulated settlement · figures illustrative."]
  );
  await persistDoc({
    ownerId: ct.clientId,
    tenderId: ct.tenderId ?? "",
    contractId: ct.id,
    kind: "PaymentProofClient",
    label: "Extension payment proof (client)",
    bytes: clientBytes,
    filename: `AFRIGEN-Link-Extension-Payment-${ref}.pdf`,
  });
  await logNotification({
    recipientProfileId: ct.clientId,
    tenderId: ct.tenderId ?? "",
    subject: "Extension payment confirmed",
    body: `Your hire extension for "${ct.title}" (Ref ${ref}) is confirmed and monitored in escrow. Total funded ${fmt(opts.amountToFundTzs)}. Proof attached.`,
    attachments: [{ filename: `AFRIGEN-Link-Extension-Payment-${ref}.pdf`, content: clientBytes }],
  });

  const supBytes = detailPdf(
    "Payout Proof — Extension (Supplier)",
    [
      { k: "Reference", v: ref },
      { k: "Machine hire", v: ct.title || "Machinery hire" },
      { k: "Lane", v: `${ct.origin} → ${ct.destination}` },
      { k: "Status", v: "Extension escrow secured" },
    ],
    [
      { label: "Extension value", amount: opts.extraAmountTzs },
      { label: "Service fee (5%)", amount: supplierFee, sign: "-" },
      { label: "Your net payout", amount: net },
    ],
    ["Extension escrow confirmed by AFRIGEN Link. Net payout released on completion. Funds tracked and monitored, not held. Simulated settlement · figures illustrative."]
  );
  await persistDoc({
    ownerId: ct.supplierId,
    tenderId: ct.tenderId ?? "",
    contractId: ct.id,
    kind: "PayoutProofSupplier",
    label: "Extension payout proof (supplier)",
    bytes: supBytes,
    filename: `AFRIGEN-Link-Extension-Payout-${ref}.pdf`,
  });
  await logNotification({
    recipientProfileId: ct.supplierId,
    tenderId: ct.tenderId ?? "",
    subject: "Extension escrow secured",
    body: `The client funded the hire extension for "${ct.title}" (Ref ${ref}). Your net payout ${fmt(net)} is released on completion. Proof attached.`,
    attachments: [{ filename: `AFRIGEN-Link-Extension-Payout-${ref}.pdf`, content: supBytes }],
  });
}

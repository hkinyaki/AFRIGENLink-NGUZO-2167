/**
 * AFRIGEN core business-logic engines (server-side, single source of truth).
 */

/**
 * Fee model (June 2026): 10% total take, split evenly.
 *  - CLIENT pays 5% ON TOP of contract value (funds value + 5% into escrow/TT).
 *  - SUPPLIER has 5% deducted at settlement on the base contract value.
 * Nguzo revenue per deal = 10% of contract value.
 */
export const CLIENT_FEE_RATE = 0.05;
export const SUPPLIER_FEE_RATE = 0.05;

export type AmountToFund = {
  contractValueTzs: number;
  clientFeeTzs: number;
  amountToFundTzs: number;
};

/**
 * What the CLIENT must fund into escrow/TT for a given base contract value.
 * Client fee is shown as a transparent line item ON TOP.
 */
export function computeAmountToFund(contractValueTzs: number): AmountToFund {
  const clientFeeTzs = Math.round(contractValueTzs * CLIENT_FEE_RATE);
  return {
    contractValueTzs,
    clientFeeTzs,
    amountToFundTzs: contractValueTzs + clientFeeTzs,
  };
}

/** Compliance checklist seeding based on route classification */
export function checklistFor(route: "Domestic" | "CrossBorder"): string[] {
  if (route === "Domestic") {
    return ["TARURA Heavy Load Permit", "Municipal Clearance"];
  }
  return [
    "TRA TANSAD",
    "TBS Clearance",
    "Phytosanitary Certificate",
    "Border Entry — Origin OSBP",
    "Border Entry — Destination OSBP",
  ];
}

/** Pick best Dar wholesale courier for upcountry dispatch (illustrative heuristic) */
export function pickCourier(): "Shabiby" | "Super Feo" {
  return Math.random() > 0.5 ? "Shabiby" : "Super Feo";
}

export type BreakdownInput = {
  escrowBalanceTzs: number;
  emergencyCreditDeductedTzs: number;
  partRetailCostTzs: number;
  logisticsHandlingFeeTzs: number;
};

export type BreakdownResult =
  | {
      ok: true;
      partTotalTzs: number;
      newEmergencyCreditDeductedTzs: number;
      courier: "Shabiby" | "Super Feo";
    }
  | { ok: false; reason: string };

/**
 * Escrow-collateralized parts engine.
 * Available escrow = locked balance - already deducted emergency credit.
 * Approve only if available > (retail + handling).
 */
export function evaluateBreakdown(input: BreakdownInput): BreakdownResult {
  const partTotal = input.partRetailCostTzs + input.logisticsHandlingFeeTzs;
  const available = input.escrowBalanceTzs - input.emergencyCreditDeductedTzs;
  if (available > partTotal) {
    return {
      ok: true,
      partTotalTzs: partTotal,
      newEmergencyCreditDeductedTzs: input.emergencyCreditDeductedTzs + partTotal,
      courier: pickCourier(),
    };
  }
  return {
    ok: false,
    reason: `Insufficient locked escrow to collateralize this part. Available TZS ${available.toLocaleString()} ≤ required TZS ${partTotal.toLocaleString()}.`,
  };
}

export type SettlementResult = {
  platformFeeTzs: number;
  supplierPayoutTzs: number;
  clientLineItems: { label: string; amountTzs: number }[];
  supplierLineItems: { label: string; amountTzs: number }[];
};

/* =========================================================================
 * REVERSAL ENGINE — cancellations, refunds, shortened (cut-off) contracts.
 * Money stays "tracked, not held": Nguzo only INSTRUCTS the bank to reverse
 * the split. This is a partial/zero settlement run in reverse.
 *
 * Rules (locked June 2026):
 *  - Fee tiered by stage: free full refund (incl. Nguzo fee) at/before
 *    AgreementsSigned. Once work starts, Nguzo keeps fee on work DONE only
 *    and refunds its fee on the unused/cancelled portion.
 *  - Supplier cancellation penalty = max(stage-band, days-band):
 *      stage-band: 0% ≤ AgreementsSigned, 5% ≥ FieldVerified, 10% ≥ PermitsVerified
 *      days-band:  0% > 7d before start, 10% < 3d before start
 *      transfer fee KEPT by supplier when ≥ PermitsVerified OR < 3d / mobilised
 *  - Shorten: refund dailyRate × unusedDays × units; transfer fee always kept;
 *    new value = transferFee + dailyRate × actualDays × units; fee recomputed
 *    on real value. No negative refunds.
 *  - Emergency parts already drawn are deducted from the refund FIRST.
 * ====================================================================== */

export const SUPPLIER_PENALTY_FIELD = 0.05; // from FieldVerified (fleet inspection)
export const SUPPLIER_PENALTY_PERMITS = 0.1; // from PermitsVerified / <3d / mobilised
export const SUPPLIER_PENALTY_NEARSTART = 0.1; // days-band <3d

/** Strict gate order — kept local so the engine has no cross-import side effects. */
const STAGE_ORDER = [
  "Bidding",
  "AwardConfirmed",
  "AgreementsSigned",
  "MachineDocsUploaded",
  "FieldVerified",
  "PermitsUploaded",
  "PermitsVerified",
  "TTUploaded",
  "TTConfirmed",
  "Executing",
  "Completed",
] as const;

export function stageRank(stage: string): number {
  const i = STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]);
  return i === -1 ? 0 : i;
}

/** Whole days from today (UTC) until an ISO YYYY-MM-DD start date. Negative = already started. */
export function daysToStart(startDateIso: string, todayIso?: string): number {
  if (!startDateIso) return 9999; // no start scheduled → treat as far out
  const today = todayIso ?? new Date().toISOString().slice(0, 10);
  const a = new Date(today + "T00:00:00Z").getTime();
  const b = new Date(startDateIso + "T00:00:00Z").getTime();
  if (isNaN(a) || isNaN(b)) return 9999;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export type ReversalReason = "Cancel" | "Refund" | "Shorten";

export type ReversalInput = {
  reason: ReversalReason;
  stage: string; // contract / tender stage at request time
  startDateIso: string; // operational start (machinery)
  contractValueTzs: number; // original base value (fee-exclusive)
  clientFeePaidTzs: number; // 5% already funded on top
  emergencyCreditDeductedTzs: number; // parts already drawn against escrow
  transferFeeTzs: number; // machinery mobilisation fee captured
  dailyRateTzs: number; // per-unit daily rate
  units: number;
  bookedDays: number; // originally booked working days
  actualDays?: number; // for Shorten — days actually worked
};

export type ReversalResult = {
  reason: ReversalReason;
  workDoneValueTzs: number; // value Nguzo keeps fee on
  unusedValueTzs: number; // value refunded to client (pre-fee)
  supplierPenaltyTzs: number; // paid to supplier on cancellation
  transferFeeKeptTzs: number; // supplier keeps if mobilised / shortened
  partsDeductedTzs: number; // removed from refund first
  nguzoFeeKeptTzs: number; // fee on work done only
  nguzoFeeRefundedTzs: number; // fee refunded on unused portion
  clientRefundTzs: number; // net back to client bank
  supplierAdjustmentTzs: number; // what supplier nets from this reversal
  retainedInEscrowTzs: number; // work-done value staying in escrow for normal settlement (Shorten)
  newContractValueTzs: number; // recomputed value (Shorten) or 0 (full cancel)
  balanced: boolean; // invariant check
  clientLineItems: { label: string; amountTzs: number }[];
  supplierLineItems: { label: string; amountTzs: number }[];
  nguzoLineItems: { label: string; amountTzs: number }[];
};

/** Supplier penalty % = max(stage-band, days-band). */
export function supplierPenaltyPct(stage: string, startDateIso: string, todayIso?: string): {
  pct: number;
  keepTransferFee: boolean;
} {
  const rank = stageRank(stage);
  const d = daysToStart(startDateIso, todayIso);
  let stageBand = 0;
  if (rank >= stageRank("PermitsVerified")) stageBand = SUPPLIER_PENALTY_PERMITS;
  else if (rank >= stageRank("FieldVerified")) stageBand = SUPPLIER_PENALTY_FIELD;
  // before AgreementsSigned → always 0
  if (rank < stageRank("AgreementsSigned")) stageBand = 0;

  const daysBand = d < 3 ? SUPPLIER_PENALTY_NEARSTART : 0;
  const pct = Math.max(stageBand, daysBand);
  const keepTransferFee =
    rank >= stageRank("PermitsVerified") || d < 3 || rank >= stageRank("Executing");
  return { pct, keepTransferFee: pct > 0 && keepTransferFee };
}

const r = (n: number) => Math.round(n);

/**
 * Compute a reversal. Pure + deterministic (pass todayIso in tests).
 * Invariant: clientRefund + nguzoFeeKept + supplierPenalty + transferFeeKept
 *            + partsDeducted === contractValue + clientFeePaid (amount funded).
 */
export function computeReversal(input: ReversalInput, todayIso?: string): ReversalResult {
  const {
    reason,
    stage,
    startDateIso,
    contractValueTzs,
    clientFeePaidTzs,
    emergencyCreditDeductedTzs,
    transferFeeTzs,
    dailyRateTzs,
    units,
    bookedDays,
  } = input;

  const amountFunded = contractValueTzs + clientFeePaidTzs;
  const partsDeductedTzs = Math.max(0, emergencyCreditDeductedTzs);
  const freeCancel = stageRank(stage) <= stageRank("AgreementsSigned");

  let workDoneValueTzs = 0;
  let unusedValueTzs = 0;
  let supplierPenaltyTzs = 0;
  let transferFeeKeptTzs = 0;
  let newContractValueTzs = 0;

  if (reason === "Shorten") {
    // No negative refunds: at least the days worked + transfer fee is owed.
    const actual = Math.max(0, Math.min(input.actualDays ?? bookedDays, bookedDays));
    const unusedDays = Math.max(0, bookedDays - actual);
    // value Nguzo keeps fee on = work done (transfer + days worked).
    // Transfer fee lives INSIDE workDoneValue here (not a separate supplier penalty leg),
    // so transferFeeKeptTzs stays 0 to avoid double-counting in the balance.
    newContractValueTzs = transferFeeTzs + dailyRateTzs * actual * units;
    workDoneValueTzs = newContractValueTzs;
    unusedValueTzs = dailyRateTzs * unusedDays * units; // refunded (pre-fee)
  } else {
    // Cancel / Refund
    if (freeCancel) {
      // full refund incl. fee, no penalty
      workDoneValueTzs = 0;
      unusedValueTzs = contractValueTzs;
    } else {
      const { pct, keepTransferFee } = supplierPenaltyPct(stage, startDateIso, todayIso);
      supplierPenaltyTzs = r(contractValueTzs * pct);
      transferFeeKeptTzs = keepTransferFee ? transferFeeTzs : 0;
      // Work "done" for fee purposes = the penalty + transfer kept (the part not refunded).
      workDoneValueTzs = supplierPenaltyTzs + transferFeeKeptTzs;
      unusedValueTzs = Math.max(0, contractValueTzs - workDoneValueTzs);
    }
  }

  // Nguzo refunds its full fee on the unused portion, keeps fee on work done.
  // Original fee was 5% client-side on contractValueTzs. Pro-rate it.
  const feeRate = contractValueTzs > 0 ? clientFeePaidTzs / contractValueTzs : CLIENT_FEE_RATE;
  const nguzoFeeKeptTzs = r(workDoneValueTzs * feeRate);
  const nguzoFeeRefundedTzs = Math.max(0, clientFeePaidTzs - nguzoFeeKeptTzs);

  // Net refund to client = unused base + refunded fee − parts already drawn.
  let clientRefundTzs = unusedValueTzs + nguzoFeeRefundedTzs - partsDeductedTzs;
  if (clientRefundTzs < 0) clientRefundTzs = 0; // no negative refunds

  const supplierAdjustmentTzs = supplierPenaltyTzs + transferFeeKeptTzs;

  // Retained in escrow = work-done value that is NOT a cancellation penalty.
  // On Shorten, the supplier still earns the worked portion (settled normally later),
  // so it stays in escrow. On Cancel, workDoneValue == penalty+transfer (already
  // separate legs), so retained is 0.
  const retainedInEscrowTzs = Math.max(0, workDoneValueTzs - supplierPenaltyTzs - transferFeeKeptTzs);

  // Invariant: every funded shilling is accounted for.
  // funded = clientRefund + retainedInEscrow + nguzoFeeKept + supplierPenalty
  //          + transferFeeKept + partsDeducted (+ tiny rounding residual → client refund)
  const accounted =
    clientRefundTzs + retainedInEscrowTzs + nguzoFeeKeptTzs + supplierPenaltyTzs + transferFeeKeptTzs + partsDeductedTzs;
  const residual = amountFunded - accounted;
  if (residual !== 0 && clientRefundTzs + residual >= 0) {
    clientRefundTzs += residual; // fold rounding into the client refund
  }
  const balanced =
    clientRefundTzs + retainedInEscrowTzs + nguzoFeeKeptTzs + supplierPenaltyTzs + transferFeeKeptTzs + partsDeductedTzs ===
    amountFunded;

  const clientLineItems = [
    { label: "Amount originally funded", amountTzs: amountFunded },
    { label: "Work done / non-refundable", amountTzs: -workDoneValueTzs },
    { label: "AFRIGEN Link fee kept (on work done)", amountTzs: -nguzoFeeKeptTzs },
    ...(supplierPenaltyTzs ? [{ label: "Supplier cancellation penalty", amountTzs: -supplierPenaltyTzs }] : []),
    ...(transferFeeKeptTzs ? [{ label: "Transfer / mobilisation fee kept", amountTzs: -transferFeeKeptTzs }] : []),
    ...(partsDeductedTzs ? [{ label: "Emergency parts already drawn", amountTzs: -partsDeductedTzs }] : []),
    { label: "Net refund to your bank account", amountTzs: clientRefundTzs },
  ];

  const supplierLineItems = [
    ...(supplierPenaltyTzs ? [{ label: "Cancellation penalty", amountTzs: supplierPenaltyTzs }] : []),
    ...(transferFeeKeptTzs ? [{ label: "Transfer / mobilisation fee kept", amountTzs: transferFeeKeptTzs }] : []),
    { label: "Net to supplier", amountTzs: supplierAdjustmentTzs },
  ];

  const nguzoLineItems = [
    { label: "Fee kept (on work done)", amountTzs: nguzoFeeKeptTzs },
    { label: "Fee refunded (on cancelled portion)", amountTzs: -nguzoFeeRefundedTzs },
  ];

  return {
    reason,
    workDoneValueTzs,
    unusedValueTzs,
    supplierPenaltyTzs,
    transferFeeKeptTzs,
    partsDeductedTzs,
    nguzoFeeKeptTzs,
    nguzoFeeRefundedTzs,
    clientRefundTzs,
    supplierAdjustmentTzs,
    retainedInEscrowTzs,
    newContractValueTzs,
    balanced,
    clientLineItems,
    supplierLineItems,
    nguzoLineItems,
  };
}

/**
 * Automated settlement engine (10% model = 5% client + 5% supplier).
 * Client already funded contractValue + 5% on top (clientFee).
 * Supplier fee = 5% of base contract value, deducted here.
 *   supplierPayout = contractValue - supplierFee - emergencyCreditDeducted
 *   platformFee (Nguzo revenue) = clientFee + supplierFee = 10% of contractValue
 */
export function runSettlement(
  contractValueTzs: number,
  emergencyCreditDeductedTzs: number
): SettlementResult {
  const clientFeeTzs = Math.round(contractValueTzs * CLIENT_FEE_RATE);
  const supplierFeeTzs = Math.round(contractValueTzs * SUPPLIER_FEE_RATE);
  const platformFeeTzs = clientFeeTzs + supplierFeeTzs;
  const amountFundedTzs = contractValueTzs + clientFeeTzs;
  const supplierPayoutTzs =
    contractValueTzs - supplierFeeTzs - emergencyCreditDeductedTzs;

  const clientLineItems = [
    { label: "Contract Value", amountTzs: contractValueTzs },
    { label: "AFRIGEN Link Service Fee (5%)", amountTzs: clientFeeTzs },
    { label: "Total Funded into Escrow", amountTzs: amountFundedTzs },
  ];

  const supplierLineItems = [
    { label: "Contract Value", amountTzs: contractValueTzs },
    { label: "AFRIGEN Link Service Fee (5%)", amountTzs: -supplierFeeTzs },
    { label: "Emergency Parts Credit Deducted", amountTzs: -emergencyCreditDeductedTzs },
    { label: "Final Supplier Payout", amountTzs: supplierPayoutTzs },
  ];

  return { platformFeeTzs, supplierPayoutTzs, clientLineItems, supplierLineItems };
}

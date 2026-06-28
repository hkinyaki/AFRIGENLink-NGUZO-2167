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
    { label: "Nguzo Service Fee (5%)", amountTzs: clientFeeTzs },
    { label: "Total Funded into Escrow", amountTzs: amountFundedTzs },
  ];

  const supplierLineItems = [
    { label: "Contract Value", amountTzs: contractValueTzs },
    { label: "Nguzo Service Fee (5%)", amountTzs: -supplierFeeTzs },
    { label: "Emergency Parts Credit Deducted", amountTzs: -emergencyCreditDeductedTzs },
    { label: "Final Supplier Payout", amountTzs: supplierPayoutTzs },
  ];

  return { platformFeeTzs, supplierPayoutTzs, clientLineItems, supplierLineItems };
}

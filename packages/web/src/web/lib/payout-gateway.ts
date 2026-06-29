// Thin payout-gateway adapter seam.
// PRIMARY rail = NMB Bank Open Banking split-payout (simulated here).
// BACKUP rail = Selcom. No live bank call yet — money is "tracked / Monitored, not held".
// When the real rail is bound (deferred Transactions & Approvals module), only `simulate()`
// is swapped for a signed NMB/Selcom call — the UI and payload shape stay identical.

const CLIENT_FEE_RATE = 0.05;
const SUPPLIER_FEE_RATE = 0.05;

export type PayoutLeg = {
  party: "Supplier" | "AFRIGEN" | "PartsMerchant";
  label: string;
  destination: string; // resolved from locked DB profile server-side in production
  amountTzs: number;
};

export type PayoutPayload = {
  contractId: string;
  reference: string; // idempotency key
  rail: string;
  backupRail: string;
  sourceAccount: string; // escrow / NMB holding room
  governance: { maker: string; checker: string };
  currency: "TZS";
  escrowFundedTzs: number;
  legs: PayoutLeg[];
  note: string;
};

function ref(contractId: string) {
  return `NGZ-PAYOUT-${contractId.slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}

/** Build the split-payout payload mirroring the real NMB instruction shape. */
export function buildPayoutPayload(opts: {
  contract: any;
  bank: { supplierName?: string; bankName?: string; bankAccountNo?: string } | null;
  makerName: string;
  checkerName: string;
}): PayoutPayload {
  const { contract, bank, makerName, checkerName } = opts;
  const contractValueTzs = contract.contractValueTzs || contract.totalEscrowBalanceTzs || 0;
  const emergencyCreditTzs = contract.emergencyCreditDeductedTzs || 0;
  const clientFeeTzs = Math.round(contractValueTzs * CLIENT_FEE_RATE);
  const supplierFeeTzs = Math.round(contractValueTzs * SUPPLIER_FEE_RATE);
  const nguzoRevenueTzs = clientFeeTzs + supplierFeeTzs; // 10% total take
  const supplierNetTzs = contractValueTzs - supplierFeeTzs - emergencyCreditTzs;
  const escrowFundedTzs = contractValueTzs + clientFeeTzs;

  const legs: PayoutLeg[] = [
    {
      party: "Supplier",
      label: `${bank?.supplierName || "Supplier"} — net payout (95% less parts)`,
      destination: bank ? `${bank.bankName || "Bank"} · ${bank.bankAccountNo || "••••"}` : "Supplier bank (locked profile)",
      amountTzs: supplierNetTzs,
    },
    {
      party: "AFRIGEN",
      label: "AFRIGEN Link — service revenue (10%)",
      destination: "AFRIGEN Link operating account",
      amountTzs: nguzoRevenueTzs,
    },
  ];
  // 3-way split only when an emergency parts credit was drawn
  if (emergencyCreditTzs > 0) {
    legs.push({
      party: "PartsMerchant",
      label: "Parts merchant — emergency parts settlement",
      destination: "Parts merchant account (locked profile)",
      amountTzs: emergencyCreditTzs,
    });
  }

  return {
    contractId: contract.id,
    reference: ref(contract.id),
    rail: "NMB Open Banking (simulated)",
    backupRail: "Selcom",
    sourceAccount: "AFRIGEN Link Escrow Holding Room · NMB",
    governance: { maker: makerName, checker: checkerName },
    currency: "TZS",
    escrowFundedTzs,
    legs,
    note: "Funds tracked / Monitored, not held — settlement instructed by AFRIGEN Link, executed by the licensed aggregator.",
  };
}

/** Simulated rail dispatch. Returns a fake bank acknowledgement. Swap for real NMB/Selcom later. */
export async function simulate(payload: PayoutPayload): Promise<{ ok: true; reference: string; rail: string }> {
  await new Promise((r) => setTimeout(r, 600));
  return { ok: true, reference: payload.reference, rail: payload.rail };
}

import { useMemo, useState } from "react";
import { tzs } from "../lib/format";
import { buildPayoutPayload, simulate } from "../lib/payout-gateway";
import { TenderAPI } from "../lib/tenders";
import { Button } from "./ui";

/** Admin step-4 payout gateway: simulated NMB split-payout mirror, then runs settlement. */
export function PayoutGatewayModal({
  contract, bank, makerName, checkerName, onClose, onReleased,
}: {
  contract: any;
  bank: any;
  makerName: string;
  checkerName: string;
  onClose: () => void;
  onReleased: () => void;
}) {
  const payload = useMemo(
    () => buildPayoutPayload({ contract, bank, makerName, checkerName }),
    [contract, bank, makerName, checkerName]
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ack, setAck] = useState<{ reference: string; rail: string } | null>(null);

  async function release() {
    setBusy(true); setErr("");
    try {
      const sim = await simulate(payload); // simulated rail dispatch
      await TenderAPI.approveRelease(contract.id); // real settlement (server)
      setAck({ reference: sim.reference, rail: sim.rail });
      onReleased();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Release failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-navy-600 bg-navy-800 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-display text-lg text-slate-100">Payout gateway</h3>
          <span className="rounded-md border border-navy-600 bg-navy-900 px-2 py-0.5 font-mono text-[10px] text-amber-500">{payload.rail}</span>
        </div>
        <p className="mb-4 text-xs text-slate-500">{payload.note} Backup rail: {payload.backupRail}.</p>

        {ack ? (
          <div className="space-y-3 rounded-lg border border-[#1E4A2E] bg-[#16321F] p-4 text-sm text-[#5FD699]">
            <div className="font-medium">Payment released (simulated).</div>
            <div className="font-mono text-xs text-slate-300">Ref: {ack.reference}</div>
            <div className="text-xs text-slate-400">Settlement locked and invoices generated. Rail: {ack.rail}.</div>
            <Button variant="amber" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border border-navy-600 bg-navy-900 p-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Source</div>
                <div className="text-slate-200">{payload.sourceAccount}</div>
                <div className="mt-1 tnum text-amber-500">{tzs(payload.escrowFundedTzs)} funded</div>
              </div>
              <div className="rounded-md border border-navy-600 bg-navy-900 p-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Maker–checker</div>
                <div className="text-slate-300">Maker: {payload.governance.maker}</div>
                <div className="text-slate-300">Checker: {payload.governance.checker}</div>
              </div>
            </div>

            <div className="mb-3 overflow-hidden rounded-md border border-navy-600">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-600 text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Disbursement leg</th>
                    <th className="px-3 py-2">Destination</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.legs.map((l, i) => (
                    <tr key={i} className="border-b border-navy-700 last:border-0">
                      <td className="px-3 py-2 text-slate-200">{l.label}</td>
                      <td className="px-3 py-2 text-[11px] text-slate-400">{l.destination}</td>
                      <td className="px-3 py-2 text-right tnum text-slate-100">{tzs(l.amountTzs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mb-4 flex items-center justify-between rounded-md border border-navy-600 bg-navy-900 px-3 py-2 text-xs">
              <span className="text-slate-500">Idempotency ref</span>
              <span className="font-mono text-slate-300">{payload.reference}</span>
            </div>

            {err && <p className="mb-3 text-xs text-bad">{err}</p>}
            <div className="flex gap-2">
              <Button variant="amber" disabled={busy} onClick={release}>{busy ? "Releasing…" : "Release via NMB (simulated)"}</Button>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

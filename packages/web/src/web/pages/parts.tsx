import { Route, Switch } from "wouter";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tzs } from "../lib/format";
import { shortDate } from "../lib/format";
import type { Me } from "../lib/use-me";
import { PartsAPI, generateEfdReceiptPDF } from "../lib/tenders";
import { AppShell, Icons, type NavItem } from "../components/shell";
import { ProfilePage } from "../components/profile-page";
import { HelpDesk } from "../components/help-desk";
import { Button, Card, Field, Input, SectionTitle, StatusPill, Empty, KPIStat, ManagerCard } from "../components/ui";

const nav: NavItem[] = [
  { label: "POS / Dispatch", href: "/app", icon: Icons.box },
  { label: "Inventory", href: "/app/inventory", icon: Icons.grid },
  { label: "Order History", href: "/app/history", icon: Icons.file },
  { label: "Invoices & Receipts", href: "/app/billing", icon: Icons.file },
  { label: "Ledger", href: "/app/ledger", icon: Icons.grid },
];

export default function PartsApp({ me }: { me: Me }) {
  return (
    <AppShell me={me} nav={nav}>
      <Switch>
        <Route path="/app" component={() => <POS me={me} />} />
        <Route path="/app/inventory" component={() => <Inventory />} />
        <Route path="/app/history" component={() => <History />} />
        <Route path="/app/billing" component={() => <Billing />} />
        <Route path="/app/ledger" component={() => <PartsLedger />} />
        <Route path="/app/profile" component={() => <ProfilePage me={me} />} />
      </Switch>
      <HelpDesk me={me} />
    </AppShell>
  );
}

function POS({ me }: { me: Me }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["parts-orders"], queryFn: () => PartsAPI.orders(), refetchInterval: 5000 });
  const orders = (q.data?.orders ?? []).filter((o: any) => o.status === "SentToParts");
  return (
    <div className="p-6">
      <SectionTitle sub="Orders the Key Account Manager cleared for dispatch. Enter the courier and waybill, then dispatch — stock decrements automatically.">POS / Dispatch Queue</SectionTitle>
      <ManagerCard managerId={me.profile.managerId} verificationStatus={me.profile.verificationStatus} />
      {orders.length === 0 ? <Empty>No orders ready for dispatch.</Empty> : (
        <div className="space-y-3">
          {orders.map((o: any) => <DispatchCard key={o.id} order={o} onDone={() => qc.invalidateQueries({ queryKey: ["parts-orders"] })} />)}
        </div>
      )}
    </div>
  );
}

function DispatchCard({ order, onDone }: { order: any; onDone: () => void }) {
  const [courier, setCourier] = useState(order.courier || "Shabiby");
  const [waybill, setWaybill] = useState("");
  const dispatch = useMutation({ mutationFn: () => PartsAPI.dispatch(order.id, { courier, waybillRef: waybill }), onSuccess: onDone });
  return (
    <Card className="p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium text-slate-100">{order.part?.partName ?? "Spare part"} {order.part?.sku && <span className="ml-1 text-[11px] text-slate-500">{order.part.sku}</span>}</div>
          <div className="text-xs text-slate-500">Qty {order.qty ?? 1} · {order.contractTitle} · deliver to {order.deliverTo === "FieldAgent" ? "field agent" : "machine supplier"} · {tzs(order.part?.retailCostTzs ?? order.retailCostTzs)}</div>
          {(order.receiverName || order.receiverDestination) && <div className="text-[11px] text-slate-500">Receiver: {order.receiverName || "—"}{order.receiverDestination ? ` @ ${order.receiverDestination}` : ""}</div>}
        </div>
        <StatusPill status={order.status} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Courier">
          <select className="focus-ring w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-slate-100" value={courier} onChange={(e) => setCourier(e.target.value)}>
            <option>Shabiby</option><option>Super Feo</option>
          </select>
        </Field>
        <Field label="Waybill / tracking ref"><Input value={waybill} onChange={(e) => setWaybill(e.target.value)} placeholder="e.g. SHB-44120" /></Field>
        <div className="flex items-end">
          <Button variant="amber" disabled={dispatch.isPending || !waybill.trim()} onClick={() => dispatch.mutate()}>{dispatch.isPending ? "Dispatching…" : "Dispatch"}</Button>
        </div>
      </div>
      {dispatch.error && <p className="mt-2 text-xs text-bad">{(dispatch.error as Error).message}</p>}
    </Card>
  );
}

const BLANK = { partName: "", sku: "", compatibleModel: "", wholesaleCostTzs: 0, retailCostTzs: 0, darSupplierLocation: "Vingunguti", logisticsHandlingFeeTzs: 0, stockQty: 0 };

function Inventory() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["parts-mine"], queryFn: () => PartsAPI.mine() });
  const create = useMutation({ mutationFn: (b: any) => PartsAPI.create(b), onSuccess: () => { qc.invalidateQueries({ queryKey: ["parts-mine"] }); setForm(BLANK); setShow(false); } });
  const update = useMutation({ mutationFn: ({ id, b }: { id: string; b: any }) => PartsAPI.update(id, b), onSuccess: () => qc.invalidateQueries({ queryKey: ["parts-mine"] }) });
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<any>(BLANK);
  const rows = q.data?.parts ?? [];
  const totalValue = rows.reduce((s: number, p: any) => s + p.retailCostTzs * p.stockQty, 0);
  const lowStock = rows.filter((p: any) => p.stockQty <= 2).length;

  return (
    <div className="p-6">
      <SectionTitle sub="Your spare-parts catalogue. Out-of-stock items are hidden from supplier search automatically." action={<Button variant="amber" onClick={() => setShow((s) => !s)}>{show ? "Close" : "Add part"}</Button>}>Inventory</SectionTitle>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPIStat label="SKUs" value={String(rows.length)} />
        <KPIStat label="Inventory value" value={tzs(totalValue)} accent="good" />
        <KPIStat label="Low / out of stock" value={String(lowStock)} accent={lowStock ? "amber" : undefined} />
        <KPIStat label="Units on hand" value={String(rows.reduce((s: number, p: any) => s + p.stockQty, 0))} />
      </div>
      {show && (
        <Card className="mb-5 p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Part name"><Input value={form.partName} onChange={(e) => setForm({ ...form, partName: e.target.value })} placeholder="Turbocharger" /></Field>
            <Field label="SKU"><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="TRB-320D" /></Field>
            <Field label="Compatible model"><Input value={form.compatibleModel} onChange={(e) => setForm({ ...form, compatibleModel: e.target.value })} placeholder="Caterpillar 320D" /></Field>
            <Field label="Wholesale (TZS)"><Input type="number" value={form.wholesaleCostTzs} onChange={(e) => setForm({ ...form, wholesaleCostTzs: +e.target.value })} /></Field>
            <Field label="Retail (TZS)"><Input type="number" value={form.retailCostTzs} onChange={(e) => setForm({ ...form, retailCostTzs: +e.target.value })} /></Field>
            <Field label="Handling fee (TZS)"><Input type="number" value={form.logisticsHandlingFeeTzs} onChange={(e) => setForm({ ...form, logisticsHandlingFeeTzs: +e.target.value })} /></Field>
            <Field label="Dar location">
              <select className="focus-ring w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-slate-100" value={form.darSupplierLocation} onChange={(e) => setForm({ ...form, darSupplierLocation: e.target.value })}>
                <option>Vingunguti</option><option>Nyerere Rd</option>
              </select>
            </Field>
            <Field label="Stock qty"><Input type="number" value={form.stockQty} onChange={(e) => setForm({ ...form, stockQty: +e.target.value })} /></Field>
          </div>
          <Button className="mt-3" variant="amber" disabled={create.isPending || !form.partName.trim()} onClick={() => create.mutate(form)}>{create.isPending ? "Saving…" : "Save part"}</Button>
          {create.error && <p className="mt-2 text-xs text-bad">{(create.error as Error).message}</p>}
        </Card>
      )}
      {rows.length === 0 ? <Empty>No parts in your catalogue yet.</Empty> : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-600 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Item code</th><th className="px-4 py-3">Part</th><th className="px-4 py-3">Model</th>
                <th className="px-4 py-3 text-right">Retail</th><th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p: any) => (
                <tr key={p.id} className="border-b border-navy-700">
                  <td className="px-4 py-3 font-mono text-[12px] text-amber-500">{p.sku || "—"}</td>
                  <td className="px-4 py-3 text-slate-100">{p.partName}</td>
                  <td className="px-4 py-3 text-slate-400">{p.compatibleModel}</td>
                  <td className="px-4 py-3 text-right tnum text-slate-200">{tzs(p.retailCostTzs)}</td>
                  <td className="px-4 py-3 text-right">
                    <input type="number" className="w-16 rounded border border-navy-600 bg-navy-900 px-2 py-1 text-right text-sm text-slate-100"
                      defaultValue={p.stockQty} onBlur={(e) => { const v = +e.target.value; if (v !== p.stockQty) update.mutate({ id: p.id, b: { stockQty: v } }); }} />
                  </td>
                  <td className="px-4 py-3"><StatusPill status={p.status === "OutOfStock" ? "Closed" : "Available"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function History() {
  const q = useQuery({ queryKey: ["parts-orders"], queryFn: () => PartsAPI.orders() });
  const rows = (q.data?.orders ?? []).filter((o: any) => ["Dispatched", "Delivered"].includes(o.status));
  const totalValue = rows.reduce((s: number, o: any) => s + (o.part?.retailCostTzs ?? o.retailCostTzs ?? 0), 0);
  return (
    <div className="p-6">
      <SectionTitle sub="Fulfilled spare orders.">Order History</SectionTitle>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <KPIStat label="Fulfilled orders" value={String(rows.length)} />
        <KPIStat label="Total value" value={tzs(totalValue)} accent="good" />
      </div>
      {rows.length === 0 ? <Empty>No fulfilled orders yet.</Empty> : (
        <div className="space-y-2">
          {rows.map((o: any) => (
            <Card key={o.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <div className="text-slate-100">{o.part?.partName ?? "Part"}</div>
                <div className="text-[11px] text-slate-500">{o.contractTitle} · {o.courier} · waybill {o.waybillRef || "—"}</div>
              </div>
              <StatusPill status={o.status} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Billing() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["parts-orders"], queryFn: () => PartsAPI.orders(), refetchInterval: 10000 });
  const rows = (q.data?.orders ?? []).filter((o: any) => ["Dispatched", "Delivered"].includes(o.status));
  const gen = useMutation({
    mutationFn: (orderId: string) => PartsAPI.generateReceipt(orderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parts-orders"] }),
  });
  return (
    <div className="p-6">
      <SectionTitle sub="Issue an EFD fiscal receipt once a spare is dispatched and payment has cleared. Receipts are shared with the buyer through the platform.">Invoices & Receipts</SectionTitle>
      {rows.length === 0 ? <Empty>No billable orders yet.</Empty> : (
        <div className="space-y-3">
          {rows.map((o: any) => {
            const unit = o.part?.retailCostTzs ?? o.retailCostTzs ?? 0;
            const qty = o.qty ?? 1;
            const total = o.totalCostTzs ?? unit * qty;
            return (
              <Card key={o.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-100">{o.part?.partName ?? "Spare part"} {o.part?.sku && <span className="ml-1 text-[11px] font-mono text-amber-500">{o.part.sku}</span>}</div>
                    <div className="text-[11px] text-slate-500">Qty {qty} · {tzs(total)} · {o.contractTitle || "—"}</div>
                    {(o.receiverName || o.receiverDestination) && <div className="text-[11px] text-slate-500">Receiver: {o.receiverName || "—"}{o.receiverDestination ? ` @ ${o.receiverDestination}` : ""}</div>}
                    {o.efdNumber && <div className="mt-1 text-[11px] text-good">EFD {o.efdNumber}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusPill status={o.status} />
                    {o.efdNumber ? (
                      <Button variant="ghost" onClick={() => generateEfdReceiptPDF({ efdNumber: o.efdNumber, partName: o.part?.partName, sku: o.part?.sku, qty, retailCostTzs: unit, totalCostTzs: total, contractTitle: o.contractTitle, receiverName: o.receiverName, receiverDestination: o.receiverDestination, courier: o.courier, waybillRef: o.waybillRef })}>Download receipt ↓</Button>
                    ) : (
                      <Button variant="amber" disabled={gen.isPending} onClick={() => gen.mutate(o.id)}>{gen.isPending ? "Issuing…" : "Generate EFD receipt"}</Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PartsLedger() {
  const q = useQuery({ queryKey: ["parts-orders"], queryFn: () => PartsAPI.orders(), refetchInterval: 10000 });
  const orders = q.data?.orders ?? [];
  const fulfilled = orders.filter((o: any) => ["Dispatched", "Delivered"].includes(o.status));
  const value = (o: any) => o.totalCostTzs ?? ((o.part?.retailCostTzs ?? o.retailCostTzs ?? 0) * (o.qty ?? 1));
  const earned = fulfilled.reduce((s: number, o: any) => s + value(o), 0);
  const pending = orders.filter((o: any) => o.status === "SentToParts").reduce((s: number, o: any) => s + value(o), 0);
  // newest first
  const sorted = [...orders].sort((a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return (
    <div className="p-6">
      <SectionTitle sub="Every spare order routed to you, sorted by date. Earnings are tracked through AFRIGEN Link, not held here.">Ledger</SectionTitle>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <KPIStat label="Fulfilled value" value={tzs(earned)} accent="good" />
        <KPIStat label="In dispatch queue" value={tzs(pending)} accent={pending ? "amber" : undefined} />
        <KPIStat label="Orders" value={String(orders.length)} />
      </div>
      {sorted.length === 0 ? <Empty>No orders yet.</Empty> : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-600 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Date</th><th className="px-4 py-3">Item</th><th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Value</th><th className="px-4 py-3">EFD</th><th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((o: any) => (
                <tr key={o.id} className="border-b border-navy-700">
                  <td className="px-4 py-3 text-slate-400">{shortDate(o.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-100">{o.part?.partName ?? "Part"} {o.part?.sku && <span className="text-[11px] font-mono text-slate-500">{o.part.sku}</span>}</td>
                  <td className="px-4 py-3 text-right tnum text-slate-300">{o.qty ?? 1}</td>
                  <td className="px-4 py-3 text-right tnum text-slate-200">{tzs(value(o))}</td>
                  <td className="px-4 py-3 text-[11px] text-slate-500">{o.efdNumber || "—"}</td>
                  <td className="px-4 py-3"><StatusPill status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

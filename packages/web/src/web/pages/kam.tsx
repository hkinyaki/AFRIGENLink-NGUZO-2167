import { Route, Switch, useLocation } from "wouter";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { tzs } from "../lib/format";
import type { Me } from "../lib/use-me";
import { TenderAPI, PartsAPI, StaffAPI, KamAPI, AdminAPI, uploadFile } from "../lib/tenders";
import { AppShell, Icons, type NavItem } from "../components/shell";
import { Button, Card, Field, Input, SectionTitle, StatusPill, Empty, KPIStat, StageTracker, Timeline, MessageThread, VerifiedBadge } from "../components/ui";

const nav: NavItem[] = [
  { label: "Jobs & Approvals", href: "/app", icon: Icons.file },
  { label: "My Accounts", href: "/app/accounts", icon: Icons.users },
  { label: "Payments", href: "/app/payments", icon: Icons.vault },
  { label: "Parts Routing", href: "/app/parts", icon: Icons.box },
  { label: "Field Agents", href: "/app/agents", icon: Icons.users },
];

export default function KamApp({ me }: { me: Me }) {
  return (
    <AppShell me={me} nav={nav}>
      <Switch>
        <Route path="/app" component={() => <Jobs />} />
        <Route path="/app/job/:id">{(p) => <JobDetail id={p.id} me={me} />}</Route>
        <Route path="/app/accounts" component={() => <MyAccounts />} />
        <Route path="/app/payments" component={() => <Payments me={me} />} />
        <Route path="/app/parts" component={() => <PartsRouting />} />
        <Route path="/app/agents" component={() => <Agents />} />
      </Switch>
    </AppShell>
  );
}

/** KAM's strictly-scoped book of suppliers/parts suppliers — full profile + docs. */
function MyAccounts() {
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["kam-clients"], queryFn: () => KamAPI.clients().then((r) => r.clients), refetchInterval: 10000 });
  const rows = q.data ?? [];
  return (
    <div className="p-6">
      <SectionTitle sub="The suppliers and parts suppliers assigned to you. You own these relationships — reach out, visit, and guide them through verification.">My Accounts</SectionTitle>
      {rows.length === 0 ? <Empty>No accounts assigned to you yet. New suppliers are auto-assigned as they register.</Empty> : (
        <div className="space-y-2">
          {rows.map((s: any) => (
            <Card key={s.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-medium text-slate-100">{s.companyName || s.fullName} <span className="font-mono text-[11px] text-amber-500/80">{s.userCode}</span></div>
                  <div className="text-xs text-slate-500">{s.role === "parts_supplier" ? "Parts supplier" : "Supplier"} · {s.phone || "no phone"} · {s.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <VerifiedBadge status={s.verificationStatus} />
                  <Button variant="ghost" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "Hide" : "View profile"}</Button>
                </div>
              </div>
              {open === s.id && <AccountProfile profileId={s.id} />}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountProfile({ profileId }: { profileId: string }) {
  const q = useQuery({ queryKey: ["kam-profile", profileId], queryFn: () => AdminAPI.profile(profileId) });
  const d = q.data;
  if (!d) return <div className="mt-3 text-xs text-slate-500">Loading…</div>;
  return (
    <div className="mt-4 border-t border-navy-600 pt-4">
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        {[["Address", d.profile.address], ["Reg. no.", d.profile.companyRegNo], ["TIN", d.profile.companyTin], ["Sector", d.profile.companySector], ["Authoriser", `${d.profile.authoriserName || "—"}${d.profile.authoriserTitle ? ` (${d.profile.authoriserTitle})` : ""}`], ["Authoriser phone", d.profile.authoriserPhone]].map(([k, v]) => (
          <div key={k as string} className="rounded-md border border-navy-600 bg-navy-900 px-3 py-2"><div className="text-[10px] uppercase tracking-wider text-slate-500">{k}</div><div className="text-slate-200">{(v as string) || "—"}</div></div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {d.idDocUrl && <a href={d.idDocUrl} target="_blank" rel="noreferrer" className="text-xs text-amber-500 hover:underline">↗ National ID</a>}
        {d.documents.map((doc: any) => <a key={doc.id} href={doc.url} target="_blank" rel="noreferrer" className="text-xs text-amber-500 hover:underline">↗ {doc.kind}</a>)}
        {!d.documents.length && !d.idDocUrl && <span className="text-xs text-slate-500">No documents uploaded yet.</span>}
      </div>
    </div>
  );
}

function Jobs() {
  const [, navigate] = useLocation();
  const q = useQuery({ queryKey: ["kam-tenders"], queryFn: async () => (await (await api.admin.tenders.$get()).json()).tenders as any[], refetchInterval: 5000 });
  const rows = q.data ?? [];
  const action = rows.filter((t) => ["MachineDocsUploaded", "PermitsUploaded", "TTUploaded", "TTConfirmed"].includes(t.tenderStage) && t.status !== "Cancelled");
  return (
    <div className="p-6">
      <SectionTitle sub="Review field reports, verify permits & payment, and approve execution for the accounts you manage.">Jobs & Approvals</SectionTitle>
      {action.length > 0 && (
        <div className="mb-5 rounded-md border border-amber-600 bg-amber-bg p-3 text-sm text-amber-500">
          {action.length} job{action.length > 1 ? "s" : ""} need your review.
        </div>
      )}
      {rows.length === 0 ? <Empty>No jobs yet.</Empty> : (
        <div className="space-y-3">
          {rows.map((t) => (
            <Card key={t.id} lift className="cursor-pointer p-4" >
              <div onClick={() => navigate(`/app/job/${t.id}`)}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-100">{t.title}</div>
                    <div className="text-xs text-slate-500">{t.clientName} · {t.carrierOrMachineType} · {t.unitsNeeded} unit{t.unitsNeeded > 1 ? "s" : ""}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {["MachineDocsUploaded", "PermitsUploaded", "TTUploaded", "TTConfirmed"].includes(t.tenderStage) && <span className="text-[10px] uppercase tracking-wider text-amber-400">review</span>}
                    <StatusPill status={t.status} />
                  </div>
                </div>
                <StageTracker current={t.tenderStage} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function JobDetail({ id, me }: { id: string; me: Me }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tender", id], queryFn: () => TenderAPI.get(id), refetchInterval: 4000 });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["tender", id] }); qc.invalidateQueries({ queryKey: ["kam-tenders"] }); };
  const advance = useMutation({ mutationFn: (step: string) => TenderAPI.advance(id, step), onSuccess: refresh });
  const verifyDoc = useMutation({ mutationFn: (docId: string) => import("../lib/tenders").then((m) => m.DocAPI.verify(docId)), onSuccess: refresh });
  const review = useMutation({ mutationFn: (b: { inspectionId: string; approve: boolean; declineReason?: string; hardDecline?: boolean }) => TenderAPI.reviewReport(b.inspectionId, b), onSuccess: refresh });
  const send = useMutation({ mutationFn: (body: string) => TenderAPI.sendMessage(id, body), onSuccess: refresh });
  const [declineText, setDeclineText] = useState("");

  if (q.isLoading || !q.data?.tender) return <div className="p-6 text-slate-500">Loading…</div>;
  const { tender: t, contracts, documents, timeline, messages: thread, client, inspections } = q.data;
  const stage = t.tenderStage;
  const baseValue = t.flatFairPriceTzs * t.unitsNeeded;
  const escrowAmt = baseValue + Math.round(baseValue * 0.05);
  const permitDocs = documents.filter((d: any) => d.kind === "Permit");
  const ttDocs = documents.filter((d: any) => d.kind === "TTProof");
  const pendingReport = (inspections ?? []).find((i: any) => i.reportStatus === "Submitted");

  const permitsAllVerified = permitDocs.length > 0 && permitDocs.every((d: any) => d.verifiedBy);
  const ttAllVerified = ttDocs.length > 0 && ttDocs.every((d: any) => d.verifiedBy);

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-100">{t.title}</h1>
          <p className="text-sm text-slate-500">{client?.companyName} · {t.carrierOrMachineType} · {t.unitsNeeded} unit{t.unitsNeeded > 1 ? "s" : ""} · {t.origin} → {t.destination}</p>
        </div>
        <StatusPill status={stage} />
      </div>
      <Card className="mb-5 p-4"><StageTracker current={stage} /></Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Field report review */}
          {stage === "MachineDocsUploaded" && pendingReport && (
            <Card className="border-amber-600 p-5">
              <SectionTitle sub="The field agent submitted an inspection report. Approve to advance, or decline to send the supplier back to re-upload documents.">Field report — review</SectionTitle>
              <div className="mb-3 rounded-md border border-navy-600 bg-navy-900 p-3 text-sm text-slate-300">
                <div className="mb-1 flex gap-3 text-[11px] text-slate-500">
                  <span>Docs checked: {pendingReport.docsChecked ? "✓" : "—"}</span>
                  <span>Machine inspected: {pendingReport.machineInspected ? "✓" : "—"}</span>
                </div>
                {pendingReport.mechanicalNotes || "No notes."}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="amber" disabled={review.isPending} onClick={() => review.mutate({ inspectionId: pendingReport.id, approve: true })}>Approve report</Button>
                <Input value={declineText} onChange={(e) => setDeclineText(e.target.value)} placeholder="Decline reason (sent to supplier)" className="max-w-xs" />
                <Button variant="ghost" disabled={review.isPending || !declineText.trim()} onClick={() => review.mutate({ inspectionId: pendingReport.id, approve: false, declineReason: declineText })}>Decline → re-upload</Button>
                <Button variant="danger" disabled={review.isPending || !declineText.trim()} onClick={() => review.mutate({ inspectionId: pendingReport.id, approve: false, hardDecline: true, declineReason: declineText })}>Hard decline (cancel)</Button>
              </div>
              {review.error && <p className="mt-2 text-xs text-bad">{(review.error as Error).message}</p>}
            </Card>
          )}

          {/* Permits / payment / execute actions */}
          {stage === "PermitsUploaded" && (
            <Card className="border-amber-600 p-5">
              <SectionTitle sub="Verify every permit document, then release this step.">Verify permits</SectionTitle>
              <DocList docs={permitDocs} onVerify={(d) => verifyDoc.mutate(d)} />
              <Button className="mt-3" variant="amber" disabled={!permitsAllVerified || advance.isPending} onClick={() => advance.mutate("permits-verified")}>
                {permitsAllVerified ? "Verify permits & release" : "Verify all documents first"}
              </Button>
              {advance.error && <p className="mt-2 text-xs text-bad">{(advance.error as Error).message}</p>}
            </Card>
          )}
          {stage === "TTUploaded" && (
            <Card className="border-amber-600 p-5">
              <SectionTitle sub="Verify the payment proof, then confirm the escrow funding.">Confirm payment</SectionTitle>
              <div className="mb-3 flex items-center justify-between rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
                <span className="text-slate-400">Escrow to confirm (held by Nguzo)</span>
                <span className="tnum font-display font-semibold text-amber-500">{tzs(escrowAmt)}</span>
              </div>
              <DocList docs={ttDocs} onVerify={(d) => verifyDoc.mutate(d)} />
              <Button className="mt-3" variant="amber" disabled={!ttAllVerified || advance.isPending} onClick={() => advance.mutate("tt-confirmed")}>
                {ttAllVerified ? "Confirm payment received" : "Verify payment proof first"}
              </Button>
              {advance.error && <p className="mt-2 text-xs text-bad">{(advance.error as Error).message}</p>}
            </Card>
          )}
          {stage === "TTConfirmed" && (
            <Card className="border-amber-600 p-5">
              <SectionTitle sub="Authorise the supplier and field force to begin execution.">Approve execution</SectionTitle>
              <Button variant="amber" disabled={advance.isPending} onClick={() => advance.mutate("execute")}>Approve to execute</Button>
              {advance.error && <p className="mt-2 text-xs text-bad">{(advance.error as Error).message}</p>}
            </Card>
          )}

          <Card className="p-5">
            <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">Awarded suppliers · flat fair {tzs(t.flatFairPriceTzs)}/unit</div>
            {contracts.length === 0 ? <p className="text-sm text-slate-500">Not yet awarded.</p> : (
              <div className="space-y-2">
                {contracts.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
                    <span className="text-slate-100">{c.supplierName} · {c.unitsAwarded} unit{c.unitsAwarded > 1 ? "s" : ""}</span>
                    <span className="tnum text-slate-300">{tzs(c.contractValueTzs || c.agreedPricePerUnitTzs * c.unitsAwarded)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {documents.length > 0 && (
            <Card className="p-5">
              <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">Documents</div>
              <DocList docs={documents} onVerify={(d) => verifyDoc.mutate(d)} showAll />
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">Messages</div>
            <MessageThread messages={thread} meProfileId={me.profile.id} onSend={(b) => send.mutate(b)} sending={send.isPending} />
          </Card>
          <Card className="p-5">
            <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">Activity</div>
            <Timeline events={timeline} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function DocList({ docs, onVerify, showAll }: { docs: any[]; onVerify: (id: string) => void; showAll?: boolean }) {
  if (!docs.length) return <p className="text-sm text-slate-500">No documents uploaded yet.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center justify-between">
          <span className="text-slate-300">{d.label || d.kind} {showAll && <span className="text-[11px] text-slate-500">· {d.kind}</span>}</span>
          <span className="flex items-center gap-2">
            {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-xs text-amber-500 hover:underline">View ↗</a>}
            {!d.verifiedBy ? (
              <button onClick={() => onVerify(d.id)} className="text-[11px] text-slate-400 hover:text-good">mark verified</button>
            ) : <span className="text-[11px] text-good">verified</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Payments({ me }: { me: Me }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["kam-payments"], queryFn: async () => (await (await api.contracts.$get()).json()).contracts as any[], refetchInterval: 5000 });
  const rows = (q.data ?? []).filter((c) => c.payoutStatus === "AwaitingSupplierApproval" || c.signedOffAt);
  const awaiting = rows.filter((c) => c.payoutStatus === "AwaitingSupplierApproval");
  return (
    <div className="p-6">
      <SectionTitle sub="After a client signs off, review the supplier's bank details and upload the TT payment slip. The supplier confirms receipt to lock settlement.">Payments</SectionTitle>
      {awaiting.length === 0 ? <Empty>No payouts awaiting processing.</Empty> : (
        <div className="space-y-3">
          {awaiting.map((c) => <PayoutCard key={c.id} contract={c} onDone={() => qc.invalidateQueries({ queryKey: ["kam-payments"] })} />)}
        </div>
      )}
    </div>
  );
}

function PayoutCard({ contract, onDone }: { contract: any; onDone: () => void }) {
  const q = useQuery({ queryKey: ["payout", contract.id], queryFn: () => TenderAPI.getPayout(contract.id) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const data = q.data;
  const bank = data?.bank;
  async function uploadSlip(file: File) {
    setBusy(true); setErr("");
    try {
      const { key } = await uploadFile(file, "payout-slip");
      await TenderAPI.uploadPayoutSlip(contract.id, key);
      q.refetch(); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(false); }
  }
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-medium text-slate-100">{contract.title}</div>
        <StatusPill status={data?.slipUrl ? "Pending" : "Requested"} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Supplier bank details</div>
          {bank ? (
            <dl className="space-y-1 text-slate-300">
              <Row k="Supplier" v={`${bank.supplierName} · ${bank.userCode || ""}`} />
              <Row k="Bank" v={bank.bankName || "—"} />
              <Row k="Account name" v={bank.bankAccountName || "—"} />
              <Row k="Account no." v={bank.bankAccountNo || "—"} />
              <Row k="SWIFT" v={bank.bankSwift || "—"} />
              <Row k="Branch" v={bank.bankBranch || "—"} />
            </dl>
          ) : <p className="text-slate-500">Loading…</p>}
        </div>
        <div className="rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Payout</div>
          {data?.preview && (
            <div className="mb-3 space-y-1 text-slate-300">
              <Row k="Contract value" v={tzs(data.preview ? (contract.contractValueTzs || 0) : 0)} />
              <Row k="Supplier net" v={tzs(data.preview.supplierPayoutTzs)} />
            </div>
          )}
          {data?.slipUrl ? (
            <div className="text-xs text-good">Slip uploaded — awaiting supplier confirmation. <a href={data.slipUrl} target="_blank" rel="noreferrer" className="text-amber-500 hover:underline">View ↗</a></div>
          ) : (
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-slate-500">Upload TT slip</span>
              <input type="file" accept="image/*,application/pdf" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSlip(f); }} className="text-xs text-slate-400" />
            </label>
          )}
          {err && <p className="mt-2 text-xs text-bad">{err}</p>}
        </div>
      </div>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-slate-200">{v}</dd></div>;
}

function PartsRouting() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["kam-part-orders"], queryFn: () => PartsAPI.orders(), refetchInterval: 5000 });
  const route = useMutation({ mutationFn: (orderId: string) => PartsAPI.route(orderId), onSuccess: () => qc.invalidateQueries({ queryKey: ["kam-part-orders"] }) });
  const orders = q.data?.orders ?? [];
  const requested = orders.filter((o: any) => o.status === "Requested");
  return (
    <div className="p-6">
      <SectionTitle sub="Emergency spare requests from suppliers. Check the contract's locked escrow covers the part, then route it to the parts supplier — or it's rejected.">Parts Routing</SectionTitle>
      {requested.length === 0 ? <Empty>No spare requests awaiting routing.</Empty> : (
        <div className="space-y-3">
          {requested.map((o: any) => {
            const total = (o.part?.retailCostTzs ?? o.retailCostTzs) + (o.part?.logisticsHandlingFeeTzs ?? 0);
            const ok = o.escrowAvailableTzs > total;
            return (
              <Card key={o.id} className="p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-100">{o.part?.partName ?? "Spare part"}</div>
                    <div className="text-xs text-slate-500">{o.contractTitle} · deliver to {o.deliverTo === "FieldAgent" ? "field agent" : "machine supplier"}</div>
                  </div>
                  <StatusPill status={o.status} />
                </div>
                <div className="mb-3 grid grid-cols-3 gap-2 text-sm">
                  <Mini k="Part retail" v={tzs(o.part?.retailCostTzs ?? o.retailCostTzs)} />
                  <Mini k="With handling" v={tzs(total)} />
                  <Mini k="Escrow available" v={tzs(o.escrowAvailableTzs)} accent={ok ? "good" : "bad"} />
                </div>
                <Button variant="amber" disabled={route.isPending} onClick={() => route.mutate(o.id)}>
                  {ok ? "Escrow check & route to parts" : "Run escrow check"}
                </Button>
                {route.data && !route.data.ok && <p className="mt-2 text-xs text-bad">{route.data.reason}</p>}
              </Card>
            );
          })}
        </div>
      )}
      <div className="mt-8">
        <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">All spare orders</div>
        {orders.length === 0 ? <Empty>None.</Empty> : (
          <div className="space-y-2">
            {orders.map((o: any) => (
              <Card key={o.id} className="flex items-center justify-between p-3 text-sm">
                <span className="text-slate-200">{o.part?.partName ?? "Part"} <span className="text-[11px] text-slate-500">· {o.contractTitle}</span></span>
                <StatusPill status={o.status} />
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Mini({ k, v, accent }: { k: string; v: string; accent?: "good" | "bad" }) {
  return (
    <div className="rounded-md border border-navy-600 bg-navy-900 p-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{k}</div>
      <div className={`tnum text-sm ${accent === "good" ? "text-good" : accent === "bad" ? "text-bad" : "text-slate-200"}`}>{v}</div>
    </div>
  );
}

function Agents() {
  const qc = useQueryClient();
  const reqs = useQuery({ queryKey: ["kam-staff-requests"], queryFn: () => StaffAPI.requests(), refetchInterval: 6000 });
  const create = useMutation({ mutationFn: (b: { proposedName: string; proposedEmail: string; proposedPhone?: string }) => StaffAPI.requestAgent(b), onSuccess: () => { qc.invalidateQueries({ queryKey: ["kam-staff-requests"] }); setForm({ proposedName: "", proposedEmail: "", proposedPhone: "" }); } });
  const [form, setForm] = useState({ proposedName: "", proposedEmail: "", proposedPhone: "" });
  const rows = reqs.data?.requests ?? [];
  return (
    <div className="p-6">
      <SectionTitle sub="Field agents are created by an administrator. Request a new agent and an admin will approve and provision the account.">Field Agents</SectionTitle>
      <Card className="mb-6 p-5">
        <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">Request a new field agent</div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Full name"><Input value={form.proposedName} onChange={(e) => setForm({ ...form, proposedName: e.target.value })} placeholder="e.g. John Mushi" /></Field>
          <Field label="Email"><Input value={form.proposedEmail} onChange={(e) => setForm({ ...form, proposedEmail: e.target.value })} placeholder="agent@nguzo.africa" /></Field>
          <Field label="Phone"><Input value={form.proposedPhone} onChange={(e) => setForm({ ...form, proposedPhone: e.target.value })} placeholder="+255…" /></Field>
        </div>
        <Button className="mt-3" variant="amber" disabled={create.isPending || !form.proposedName.trim() || !form.proposedEmail.trim()} onClick={() => create.mutate(form)}>
          {create.isPending ? "Sending…" : "Request agent"}
        </Button>
        {create.error && <p className="mt-2 text-xs text-bad">{(create.error as Error).message}</p>}
      </Card>
      <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">My requests</div>
      {rows.length === 0 ? <Empty>No requests yet.</Empty> : (
        <div className="space-y-2">
          {rows.map((r: any) => (
            <Card key={r.id} className="flex items-center justify-between p-3 text-sm">
              <span className="text-slate-200">{r.proposedName} <span className="text-[11px] text-slate-500">· {r.proposedEmail}</span></span>
              <StatusPill status={r.status} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

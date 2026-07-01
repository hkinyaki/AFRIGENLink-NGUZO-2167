import { Route, Switch, useLocation } from "wouter";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { tzs } from "../lib/format";
import type { Me } from "../lib/use-me";
import { TenderAPI, PartsAPI, StaffAPI, KamAPI, AdminAPI, uploadFile } from "../lib/tenders";
import { AppShell, Icons, type NavItem } from "../components/shell";
import { ProfilePage } from "../components/profile-page";
import { HelpDeskInbox } from "../components/help-desk-inbox";
import { Button, Card, Field, Input, SectionTitle, StatusPill, Empty, KPIStat, StageTracker, Timeline, MessageThread, VerifiedBadge, PaymentTracker } from "../components/ui";

const nav: NavItem[] = [
  { label: "Jobs & Approvals", href: "/app", icon: Icons.file },
  { label: "My Accounts", href: "/app/accounts", icon: Icons.users },
  { label: "Payments", href: "/app/payments", icon: Icons.vault },
  { label: "Reversals", href: "/app/reversals", icon: Icons.alert },
  { label: "Parts Routing", href: "/app/parts", icon: Icons.box },
  { label: "Field Agents", href: "/app/agents", icon: Icons.users },
  { label: "Help Desk", href: "/app/support", icon: Icons.alert },
];

export default function KamApp({ me }: { me: Me }) {
  return (
    <AppShell me={me} nav={nav}>
      <Switch>
        <Route path="/app" component={() => <Jobs />} />
        <Route path="/app/job/:id">{(p) => <JobDetail id={p.id} me={me} />}</Route>
        <Route path="/app/accounts" component={() => <MyAccounts />} />
        <Route path="/app/payments" component={() => <Payments me={me} />} />
        <Route path="/app/reversals" component={() => <Reversals />} />
        <Route path="/app/parts" component={() => <PartsRouting />} />
        <Route path="/app/agents" component={() => <Agents />} />
        <Route path="/app/profile" component={() => <ProfilePage me={me} />} />
        <Route path="/app/support" component={() => <HelpDeskInbox me={me} />} />
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

const REVIEW_STAGES = ["MachineDocsUploaded", "PermitsUploaded", "TTUploaded", "TTConfirmed"];
const STAGE_FILTERS: { v: string; label: string }[] = [
  { v: "all", label: "All stages" },
  { v: "review", label: "Needs my review" },
  { v: "Bidding", label: "Bidding" },
  { v: "AwardConfirmed", label: "Award confirmed" },
  { v: "AgreementsSigned", label: "Agreements signed" },
  { v: "MachineDocsUploaded", label: "Docs uploaded" },
  { v: "FieldVerified", label: "Field verified" },
  { v: "PermitsUploaded", label: "Permits uploaded" },
  { v: "PermitsVerified", label: "Permits verified" },
  { v: "TTUploaded", label: "Payment uploaded" },
  { v: "TTConfirmed", label: "Payment confirmed" },
  { v: "Executing", label: "Executing" },
];

function Jobs() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState("all");
  const q = useQuery({ queryKey: ["kam-tenders"], queryFn: async () => (await (await api.admin.tenders.$get()).json()).tenders as any[], refetchInterval: 5000 });
  const rows = q.data ?? [];
  const needsReview = (t: any) => REVIEW_STAGES.includes(t.tenderStage) && t.status !== "Cancelled";
  const action = rows.filter(needsReview);

  const filtered = rows.filter((t) => {
    if (filter === "all") return true;
    if (filter === "review") return needsReview(t);
    return t.tenderStage === filter;
  });
  // pin review-needed jobs to the top
  const sorted = [...filtered].sort((a, b) => Number(needsReview(b)) - Number(needsReview(a)));

  return (
    <div className="p-6">
      <SectionTitle sub="Review field reports, verify permits & payment, and approve execution for the accounts you manage.">Jobs & Approvals</SectionTitle>
      {action.length > 0 && (
        <div className="mb-5 rounded-md border border-amber-600 bg-amber-bg p-3 text-sm text-amber-500">
          {action.length} job{action.length > 1 ? "s" : ""} need your review — pinned to the top.
        </div>
      )}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-slate-500">Filter</span>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="focus-ring rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-slate-100">
          {STAGE_FILTERS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>
      </div>
      {sorted.length === 0 ? <Empty>No jobs match this filter.</Empty> : (
        <div className="space-y-3">
          {sorted.map((t) => {
            const pinned = needsReview(t);
            return (
            <Card key={t.id} lift className={`cursor-pointer p-4 ${pinned ? "border-amber-600" : ""}`} >
              <div onClick={() => navigate(`/app/job/${t.id}`)}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 font-medium text-slate-100">
                      {pinned && <span title="Pinned — awaiting your review" className="text-amber-400">📌</span>}
                      {t.title}
                    </div>
                    <div className="text-xs text-slate-500">{t.clientName} · {t.carrierOrMachineType} · {t.unitsNeeded} unit{t.unitsNeeded > 1 ? "s" : ""}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {pinned && <span className="text-[10px] uppercase tracking-wider text-amber-400">review</span>}
                    <StatusPill status={t.status} />
                  </div>
                </div>
                <StageTracker current={t.tenderStage} />
              </div>
            </Card>
            );
          })}
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
  const ttProofDocs = documents.filter((d: any) => d.kind === "TTProof");
  const ttAllVerified = ttProofDocs.length > 0 && ttProofDocs.every((d: any) => d.verifiedBy);
  const pendingReport = (inspections ?? []).find((i: any) => i.reportStatus === "Submitted");

  const permitsAllVerified = permitDocs.length > 0 && permitDocs.every((d: any) => d.verifiedBy);

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
              <SectionTitle sub="The client sent a bank transfer and uploaded the TT copy. Review the TT copy against the account, mark it verified, then confirm escrow is secured — we generate and email payment proofs to both parties, and the job advances.">Confirm escrow secured</SectionTitle>
              <div className="mb-3 flex items-center justify-between rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
                <span className="text-slate-400">Escrow to confirm (monitored by AFRIGEN Link)</span>
                <span className="tnum font-display font-semibold text-amber-500">{tzs(escrowAmt)}</span>
              </div>
              <div className="mb-3">
                <div className="mb-1.5 text-[11px] uppercase tracking-wider text-slate-500">TT transfer copy</div>
                <DocList docs={ttProofDocs} onVerify={(d) => verifyDoc.mutate(d)} />
              </div>
              <Button className="mt-1" variant="amber" disabled={advance.isPending || !ttAllVerified} onClick={() => advance.mutate("tt-confirmed")}>
                {advance.isPending ? "Working…" : "Confirm escrow secured"}
              </Button>
              {!ttAllVerified && <p className="mt-2 text-[11px] text-slate-500">Verify the TT copy above before confirming.</p>}
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

          {contracts.filter((c: any) => c.dailyRateTzs > 0).map((c: any) => (
            <KamExtensionCard key={c.id} contract={c} onDone={refresh} />
          ))}

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

/** KAM view of a machinery hire extension — activate the payment gateway once both parties sign, then confirm escrow after the client funds. */
function KamExtensionCard({ contract, onDone }: { contract: any; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const exq = useQuery({ queryKey: ["kam-extensions", contract.id], queryFn: () => TenderAPI.getExtensions(contract.id).then((r) => r.extensions), refetchInterval: 4000 });
  const exts = exq.data ?? [];
  const active = exts.find((e: any) => !["Declined", "Lapsed", "Paid"].includes(e.status));
  const refresh = () => { exq.refetch(); onDone(); };
  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setErr("");
    try { await fn(); refresh(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  if (!active) return null;
  return (
    <Card className="border-amber-600 p-5">
      <SectionTitle sub={`${contract.supplierName} · +${active.addedDays} days → ${active.newEndDate}`}>Hire extension</SectionTitle>
      <div className="mb-3 flex items-center justify-between rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
        <span className="text-slate-400">Extension to fund (incl. 5%)</span>
        <span className="tnum font-display font-semibold text-amber-500">{tzs(active.amountToFundTzs)}</span>
      </div>
      {active.status === "PendingSupplierAcceptance" && <div className="text-xs text-slate-400">Awaiting supplier acceptance.</div>}
      {active.status === "AwaitingSignatures" && (
        <div className="text-xs text-slate-400">Awaiting signatures — Client: {active.clientSignedAt ? "signed" : "pending"} · Supplier: {active.supplierSignedAt ? "signed" : "pending"}.</div>
      )}
      {active.status === "AwaitingKamActivation" && (
        <Button variant="amber" disabled={busy} onClick={() => run(() => TenderAPI.extendActivate(contract.id, active.id))}>{busy ? "Working…" : "Activate payment gateway"}</Button>
      )}
      {active.status === "PendingPayment" && <div className="text-xs text-slate-400">Payment gateway open — awaiting the client to clear the payment.</div>}
      {active.status === "PaymentPendingConfirmation" && (
        <Button variant="amber" disabled={busy} onClick={() => run(() => TenderAPI.confirmExtension(contract.id, active.id))}>{busy ? "Working…" : "Confirm escrow secured"}</Button>
      )}
      {err && <p className="mt-2 text-xs text-bad">{err}</p>}
    </Card>
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
            {d.url && <OtpDocLink doc={d} />}
            {!d.verifiedBy ? (
              <button onClick={() => onVerify(d.id)} className="text-[11px] text-slate-400 hover:text-good">mark verified</button>
            ) : <span className="text-[11px] text-good">verified</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Step-up document view. Before a sensitive document opens, the staff member
 * enters a live 6-digit code from their authenticator app. It's verified
 * server-side against their enrolled TOTP secret (no simulated codes) and every
 * access is logged to admin.
 */
function OtpDocLink({ doc }: { doc: any }) {
  const [stage, setStage] = useState<"idle" | "prompt">("idle");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const verify = useMutation({
    mutationFn: () => TenderAPI.otpVerify(doc.id, code),
    onSuccess: (r) => { if (r.url) window.open(r.url, "_blank", "noopener"); setStage("idle"); setCode(""); setErr(""); },
    onError: (e) => setErr((e as Error).message),
  });
  if (stage === "idle") {
    return <button onClick={() => { setStage("prompt"); setErr(""); }} className="text-xs text-amber-500 hover:underline">🔒 View (verify)</button>;
  }
  return (
    <span className="flex items-center gap-1" title="Enter the 6-digit code from your authenticator app">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="auth code"
        inputMode="numeric"
        autoFocus
        className="w-20 rounded border border-navy-600 bg-navy-900 px-1.5 py-0.5 font-mono text-xs text-slate-100"
      />
      <button onClick={() => verify.mutate()} disabled={verify.isPending || code.length < 6} className="text-[11px] text-good hover:underline disabled:opacity-40">{verify.isPending ? "…" : "open"}</button>
      <button onClick={() => { setStage("idle"); setCode(""); setErr(""); }} className="text-[11px] text-slate-500 hover:underline">✕</button>
      {err && <span className="text-[10px] text-bad">{err}</span>}
    </span>
  );
}

function Payments({ me }: { me: Me }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["kam-payments"], queryFn: async () => (await (await api.contracts.$get()).json()).contracts as any[], refetchInterval: 5000 });
  const awaiting = (q.data ?? []).filter((c) => c.payoutStatus === "AwaitingKamSubmission");
  return (
    <div className="p-6">
      <SectionTitle sub="After a client signs off, review the supplier's bank details and submit the payment request for execution. An admin then approves and releases it.">Payments</SectionTitle>
      {awaiting.length === 0 ? <Empty>No payouts awaiting submission.</Empty> : (
        <div className="space-y-3">
          {awaiting.map((c) => <PayoutCard key={c.id} contract={c} onDone={() => qc.invalidateQueries({ queryKey: ["kam-payments"] })} />)}
        </div>
      )}
    </div>
  );
}

function Reversals() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["kam-reversals"], queryFn: () => TenderAPI.listReversals().then((r) => r.reversals), refetchInterval: 6000 });
  const cq = useQuery({ queryKey: ["kam-contracts-rev"], queryFn: async () => (await (await api.contracts.$get()).json()).contracts as any[] });
  const contracts = cq.data ?? [];
  const rows = q.data ?? [];
  const queue = rows.filter((r) => r.status === "Requested");
  const history = rows.filter((r) => r.status !== "Requested");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["kam-reversals"] }); };
  const titleFor = (cid: string) => contracts.find((c) => c.id === cid)?.title || cid;
  return (
    <div className="p-6">
      <SectionTitle sub="Clients can ask to cancel, refund, or shorten a contract. Review the figures and forward to admin for approval — or decline with a reason.">Reversals</SectionTitle>
      {queue.length === 0 ? <Empty>No reversal requests awaiting review.</Empty> : (
        <div className="space-y-3">
          {queue.map((r) => <ReversalReviewCard key={r.id} rev={r} title={titleFor(r.contractId)} onDone={refresh} />)}
        </div>
      )}
      {history.length > 0 && (
        <div className="mt-8">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">History</div>
          <div className="space-y-2">
            {history.map((r) => (
              <Card key={r.id} className="flex items-center justify-between p-4 text-sm">
                <span className="text-slate-300">{r.reason} · {titleFor(r.contractId)}</span>
                <span className="flex items-center gap-3">
                  {r.clientRefundTzs ? <span className="text-xs text-slate-400">refund {tzs(r.clientRefundTzs)}</span> : null}
                  <StatusPill status={r.status === "Executed" ? "Verified" : r.status === "Rejected" ? "Declined" : "Pending"} />
                </span>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReversalReviewCard({ rev, title, onDone }: { rev: any; title: string; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const li = rev.lineItems || { client: [], supplier: [], nguzo: [] };
  async function act(decision: "Forward" | "Reject") {
    setBusy(true); setErr("");
    try { await TenderAPI.reversalReview(rev.id, { decision, note }); onDone(); }
    catch (e: any) { setErr(e?.message || "Failed"); } finally { setBusy(false); }
  }
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-medium text-slate-100">{rev.reason} · {title}</div>
        <StatusPill status="Requested" />
      </div>
      <p className="mb-3 text-xs text-slate-500">Stage at request: {rev.stageAtRequest || "—"}{rev.clientNote ? ` · "${rev.clientNote}"` : ""}</p>
      <div className="grid gap-4 md:grid-cols-3">
        {(["client", "supplier", "nguzo"] as const).map((k) => (
          <div key={k} className="rounded-md border border-navy-600 bg-navy-900 p-3 text-xs">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">{k}</div>
            {(li[k] ?? []).length === 0 ? <p className="text-slate-600">—</p> : (
              <ul className="space-y-1">
                {li[k].map((it: any, i: number) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="text-slate-400">{it.label}</span>
                    <span className={it.amountTzs < 0 ? "text-bad" : "text-slate-200"}>{it.amountTzs < 0 ? "− " : ""}{tzs(Math.abs(it.amountTzs))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input className="flex-1 min-w-[180px] rounded-lg border border-white/10 bg-navy-900 px-3 py-2 text-sm text-slate-200" placeholder="Note for admin / client…" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button variant="amber" disabled={busy} onClick={() => act("Forward")}>Forward to admin</Button>
        <Button variant="ghost" disabled={busy} onClick={() => act("Reject")}>Decline</Button>
      </div>
      {err && <p className="mt-2 text-xs text-bad">{err}</p>}
    </Card>
  );
}

function PayoutCard({ contract, onDone }: { contract: any; onDone: () => void }) {
  const q = useQuery({ queryKey: ["payout", contract.id], queryFn: () => TenderAPI.getPayout(contract.id) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const data = q.data;
  const bank = data?.bank;
  const submitted = data?.payoutStatus === "PendingAdminApproval" || data?.payoutStatus === "Approved";
  async function submit() {
    setBusy(true); setErr("");
    try {
      await TenderAPI.submitPayout(contract.id);
      q.refetch(); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not submit"); }
    finally { setBusy(false); }
  }
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-medium text-slate-100">{contract.title}</div>
        <StatusPill status={submitted ? "Pending" : "Requested"} />
      </div>
      <div className="mb-3"><PaymentTracker payoutStatus={contract.payoutStatus} /></div>
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
              <Row k="Contract value" v={tzs(contract.contractValueTzs || 0)} />
              <Row k="Supplier net" v={tzs(data.preview.supplierPayoutTzs)} />
            </div>
          )}
          {submitted ? (
            <div className="text-xs text-good">Payment request submitted — awaiting admin approval, bank transfer & release.</div>
          ) : (
            <div>
              <p className="mb-2 text-[11px] text-slate-500">Confirm the sign-off and bank details are correct, then submit for an admin to instruct the transfer and release.</p>
              <Button variant="amber" disabled={busy || !bank} onClick={submit}>{busy ? "Submitting…" : "Submit payment request"}</Button>
            </div>
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
          <Field label="Email"><Input value={form.proposedEmail} onChange={(e) => setForm({ ...form, proposedEmail: e.target.value })} placeholder="agent@afrigenlink.com" /></Field>
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

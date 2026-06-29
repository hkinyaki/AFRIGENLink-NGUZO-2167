import { Route, Switch, useLocation } from "wouter";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { tzs, shortDate } from "../lib/format";
import type { Me } from "../lib/use-me";
import { TenderAPI, StaffAPI, AdminAPI, generateReversalPDF } from "../lib/tenders";
import { AppShell, Icons, type NavItem } from "../components/shell";
import { Button, Card, Field, Input, SectionTitle, StatusPill, Empty, KPIStat, StageTracker, Timeline, MessageThread, VerifiedBadge, ChangePasswordForm, KycFileUpload, PaymentTracker } from "../components/ui";
import { HelpDeskInbox } from "../components/help-desk-inbox";
import { PayoutGatewayModal } from "../components/payout-gateway-modal";

const nav: NavItem[] = [
  { label: "Overview", href: "/app", icon: Icons.grid },
  { label: "Jobs", href: "/app/jobs", icon: Icons.file },
  { label: "Ground Force", href: "/app/ground", icon: Icons.map },
  { label: "Verification", href: "/app/verify", icon: Icons.shield },
  { label: "Payments", href: "/app/payments", icon: Icons.vault },
  { label: "Reversals", href: "/app/reversals", icon: Icons.alert },
  { label: "Team", href: "/app/team", icon: Icons.shield },
  { label: "Notifications", href: "/app/notifications", icon: Icons.alert },
  { label: "Help Desk", href: "/app/support", icon: Icons.alert },
  { label: "Ledger", href: "/app/ledger", icon: Icons.vault },
  { label: "My KYC", href: "/app/kyc", icon: Icons.shield },
  { label: "Profile", href: "/app/profile", icon: Icons.shield },
];

export default function AdminApp({ me }: { me: Me }) {
  return (
    <AppShell me={me} nav={nav}>
      <Switch>
        <Route path="/app" component={() => <Overview />} />
        <Route path="/app/jobs" component={() => <Jobs />} />
        <Route path="/app/job/:id">{(p) => <JobDetail id={p.id} me={me} />}</Route>
        <Route path="/app/ground" component={() => <GroundForce />} />
        <Route path="/app/verify" component={() => <Verify />} />
        <Route path="/app/payments" component={() => <Payments me={me} />} />
        <Route path="/app/reversals" component={() => <Reversals me={me} />} />
        <Route path="/app/team" component={() => <Team />} />
        <Route path="/app/notifications" component={() => <Notifications />} />
        <Route path="/app/support" component={() => <HelpDeskInbox me={me} />} />
        <Route path="/app/ledger" component={() => <Ledger />} />
        <Route path="/app/kyc" component={() => <MyKyc me={me} />} />
        <Route path="/app/profile" component={() => <MyProfile me={me} />} />
      </Switch>
    </AppShell>
  );
}

function Jobs() {
  const [, navigate] = useLocation();
  const q = useQuery({ queryKey: ["admin-tenders"], queryFn: async () => (await (await api.admin.tenders.$get()).json()).tenders as any[], refetchInterval: 5000 });
  const rows = q.data ?? [];
  const needsAdmin = rows.filter((t) => ["PermitsUploaded", "TTUploaded", "TTConfirmed"].includes(t.tenderStage));

  return (
    <div className="p-6">
      <SectionTitle sub="Every job across the corridor. Action the steps Nguzo controls — verify permits, confirm payment, approve execution.">Jobs</SectionTitle>
      {needsAdmin.length > 0 && (
        <div className="mb-5 rounded-md border border-amber-600 bg-amber-bg p-3 text-sm text-amber-500">
          {needsAdmin.length} job{needsAdmin.length > 1 ? "s" : ""} awaiting your action.
        </div>
      )}
      {rows.length === 0 ? (
        <Empty>No jobs posted yet.</Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((t) => (
            <Card key={t.id} lift className="cursor-pointer p-4">
              <div onClick={() => navigate(`/app/job/${t.id}`)}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-100">{t.title}</div>
                    <div className="text-xs text-slate-500">{t.clientName} · {t.carrierOrMachineType} · {t.unitsNeeded} unit{t.unitsNeeded > 1 ? "s" : ""}</div>
                    <div className="text-[11px] text-slate-600">
                      {t.demandType === "Machinery"
                        ? `Hire ${t.startDate || "—"} → ${t.endDate || "—"}`
                        : `Need by ${t.needByDate || "—"}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {["PermitsUploaded", "TTUploaded", "TTConfirmed"].includes(t.tenderStage) && <span className="text-[10px] uppercase tracking-wider text-amber-400">action</span>}
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

function PartyRow({ p, dim }: { p: any; dim?: boolean }) {
  return (
    <div className={`rounded-md border border-navy-700 ${dim ? "bg-transparent" : "bg-navy-900"} px-3 py-2 text-sm`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-slate-100">{p.name}</span>
        {p.userCode && <span className="shrink-0 font-mono text-[10px] text-amber-500/70">{p.userCode}</span>}
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>{p.label}</span>
        {p.contact && <span className="truncate text-slate-400">{p.contact}</span>}
      </div>
    </div>
  );
}

function JobDetail({ id, me }: { id: string; me: Me }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tender", id], queryFn: () => TenderAPI.get(id), refetchInterval: 4000 });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["tender", id] }); qc.invalidateQueries({ queryKey: ["admin-tenders"] }); };
  const advance = useMutation({ mutationFn: (step: string) => TenderAPI.advance(id, step), onSuccess: refresh });
  const verifyDoc = useMutation({ mutationFn: (docId: string) => import("../lib/tenders").then((m) => m.DocAPI.verify(docId)), onSuccess: refresh });
  const send = useMutation({ mutationFn: (body: string) => TenderAPI.sendMessage(id, body), onSuccess: refresh });

  if (q.isLoading || !q.data?.tender) return <div className="p-6 text-slate-500">Loading…</div>;
  const { tender: t, contracts, documents, timeline, messages: thread, client, parties } = q.data as any;
  const stage = t.tenderStage;
  const isMachinery = t.demandType === "Machinery";
  const baseValue = t.flatFairPriceTzs * t.unitsNeeded;
  const escrowAmt = baseValue + Math.round(baseValue * 0.05); // value + 5% client fee
  const nguzoRevenue = Math.round(baseValue * 0.1); // 10% total take
  const permitDocs = documents.filter((d: any) => d.kind === "Permit");
  const ttDoc = documents.find((d: any) => d.kind === "TTProof");

  const adminAction =
    stage === "PermitsUploaded" ? { step: "permits-verified", label: "Verify permits & release", hint: "Confirm the uploaded permits are valid." }
    : stage === "TTUploaded" ? { step: "tt-confirmed", label: "Confirm payment received", hint: "Confirm the TT proof — escrow is recorded as held by Nguzo." }
    : stage === "TTConfirmed" ? { step: "execute", label: "Approve to execute", hint: "Authorise the supplier and field force to begin execution." }
    : null;

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-100">{t.title}</h1>
          <p className="text-sm text-slate-500">{client?.companyName} · {t.carrierOrMachineType} · {t.unitsNeeded} unit{t.unitsNeeded > 1 ? "s" : ""} · {t.origin} → {t.destination}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {isMachinery
              ? `Hire ${t.startDate || "—"} → ${t.endDate || "—"}${t.jobDays ? ` (${t.jobDays} working days)` : ""}`
              : `Need by ${t.needByDate || "—"}${t.transitDays ? ` · ~${t.transitDays} day transit` : ""}`}
          </p>
        </div>
        <StatusPill status={stage} />
      </div>

      <Card className="mb-5 p-4"><StageTracker current={stage} /></Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {adminAction && (
            <Card className="border-amber-600 p-5">
              <SectionTitle sub={adminAction.hint}>Action required</SectionTitle>
              {stage === "TTUploaded" && (
                <div className="mb-3 flex items-center justify-between rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
                  <span className="text-slate-400">Escrow to confirm (held by Nguzo)</span>
                  <span className="tnum font-display font-semibold text-amber-500">{tzs(escrowAmt)}</span>
                </div>
              )}
              <Button variant="amber" disabled={advance.isPending} onClick={() => advance.mutate(adminAction.step)}>
                {advance.isPending ? "Working…" : adminAction.label}
              </Button>
              {advance.error && <p className="mt-2 text-xs text-bad">{(advance.error as Error).message}</p>}
            </Card>
          )}

          <Card className="p-5">
            <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">Awarded suppliers · flat fair {tzs(t.flatFairPriceTzs)}/unit</div>
            {contracts.length === 0 ? <p className="text-sm text-slate-500">Not yet awarded.</p> : (
              <div className="space-y-2">
                {contracts.map((c: any) => {
                  const cv = c.contractValueTzs || c.agreedPricePerUnitTzs * c.unitsAwarded;
                  const overdue = c.extensionStatus === "PaymentOverdue" || c.removalRight === 1;
                  return (
                  <div key={c.id} className="rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-100">{c.supplierName} · {c.unitsAwarded} unit{c.unitsAwarded > 1 ? "s" : ""}</span>
                      <span className="tnum text-slate-300">{tzs(cv)}</span>
                    </div>
                    {isMachinery && (c.endDate || c.extensionStatus !== "None") && (
                      <div className="mt-1 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">ends {c.endDate || "—"}{c.dailyRateTzs ? ` · ${tzs(c.dailyRateTzs)}/day` : ""}</span>
                        {overdue ? (
                          <span className="rounded bg-bad/15 px-1.5 py-0.5 text-bad">Extension overdue · removal authorised</span>
                        ) : c.extensionStatus === "Extended" ? (
                          <span className="rounded bg-good/15 px-1.5 py-0.5 text-good">Extended</span>
                        ) : c.extensionStatus === "AwaitingPayment" ? (
                          <span className="rounded bg-amber-bg px-1.5 py-0.5 text-amber-500">Extension awaiting payment</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </Card>

          {documents.length > 0 && (
            <Card className="p-5">
              <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">Documents</div>
              <ul className="space-y-2 text-sm">
                {documents.map((d: any) => (
                  <li key={d.id} className="flex items-center justify-between">
                    <span className="text-slate-300">{d.label || d.kind} <span className="text-[11px] text-slate-500">· {d.kind}</span></span>
                    <span className="flex items-center gap-2">
                      {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-xs text-amber-500 hover:underline">View ↗</a>}
                      {!d.verifiedBy && (d.kind === "Permit" || d.kind === "TTProof") && (
                        <button onClick={() => verifyDoc.mutate(d.id)} className="text-[11px] text-slate-400 hover:text-good">mark verified</button>
                      )}
                      {d.verifiedBy && <span className="text-[11px] text-good">verified</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {parties && (
            <Card className="p-5">
              <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">Parties</div>
              <div className="space-y-2">
                {parties.client && <PartyRow p={parties.client} />}
                {(parties.suppliers ?? []).map((s: any) => (
                  <div key={s.id}>
                    <PartyRow p={s} />
                    {s.kam && <div className="ml-3 border-l border-navy-700 pl-3"><PartyRow p={s.kam} dim /></div>}
                  </div>
                ))}
                {(parties.fieldAgents ?? []).map((f: any) => <PartyRow key={f.id} p={f} />)}
              </div>
            </Card>
          )}
          <Card className="p-5">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Escrow</div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">{["TTConfirmed", "Executing"].includes(stage) ? "Held by Nguzo" : "Pending payment"}</span>
              <span className="tnum font-display text-lg font-semibold text-amber-500">{tzs(escrowAmt)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-navy-700 pt-2 text-xs">
              <span className="text-slate-500">Nguzo revenue (10%)</span>
              <span className="tnum text-good">{tzs(nguzoRevenue)}</span>
            </div>
            <p className="mt-1 text-[10px] text-slate-600">Contract value {tzs(baseValue)} · client funds value + 5% · supplier nets value − 5%.</p>
          </Card>
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

function GroundForce() {
  const q = useQuery({ queryKey: ["admin-ground"], queryFn: async () => (await (await api.admin["ground-force"].$get()).json()) as any });
  const insp = q.data?.inspections ?? [];
  const logs = q.data?.borderLogs ?? [];
  return (
    <div className="p-6">
      <SectionTitle sub="Field inspections and border-liaison logs — the physical moat.">Ground Force</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Field inspections</div>
          {insp.length === 0 ? <Empty>No inspections logged.</Empty> : (
            <div className="space-y-2">
              {insp.map((i: any) => (
                <Card key={i.id} className="p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-slate-200">{i.mechanicalNotes?.slice(0, 48) || "Inspection"}</div>
                      <div className="text-xs text-slate-500">{shortDate(i.createdAt)}{i.supplier && <> · supplier <span className="text-slate-400">{i.supplier.name}</span></>}</div>
                    </div>
                    <StatusPill status={i.reportStatus === "Approved" || i.legitimacySignedOff ? "Verified" : i.reportStatus === "Declined" ? "Declined" : i.reportStatus === "Submitted" ? "Submitted" : "Pending"} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-navy-700 pt-2 text-[11px] text-slate-500">
                    {i.agent && <span>Field agent: <span className="text-slate-300">{i.agent.name}</span> <span className="font-mono text-amber-500/70">{i.agent.code || i.agent.number}</span></span>}
                    {i.kam && <span>Reviewed by KAM: <span className="text-slate-300">{i.kam.name}</span> <span className="font-mono text-amber-500/70">{i.kam.code}</span></span>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Border logs</div>
          {logs.length === 0 ? <Empty>No border logs.</Empty> : (
            <div className="space-y-2">
              {logs.map((l: any) => (
                <Card key={l.id} className="p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-100">{l.osbp}</span>
                    <span className={`tnum text-xs ${l.institutionalWaitMinutes > 120 ? "text-amber-500" : "text-slate-400"}`}>{l.institutionalWaitMinutes} min</span>
                  </div>
                  {l.clearanceOverrideNote && <div className="mt-1 text-xs text-slate-500">{l.clearanceOverrideNote}</div>}
                  {l.agent && <div className="mt-2 border-t border-navy-700 pt-2 text-[11px] text-slate-500">Border agent: <span className="text-slate-300">{l.agent.name}</span> <span className="font-mono text-amber-500/70">{l.agent.code || l.agent.number}</span></div>}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Notifications() {
  const q = useQuery({ queryKey: ["admin-notifications"], queryFn: async () => (await (await api.admin.notifications.$get()).json()).notifications as any[] });
  const rows = q.data ?? [];
  return (
    <div className="p-6">
      <SectionTitle sub="On-record notification log. Real email/SMS delivery activates later — every message is captured here.">Notifications</SectionTitle>
      {rows.length === 0 ? <Empty>No notifications logged yet.</Empty> : (
        <div className="space-y-2">
          {rows.map((n) => (
            <Card key={n.id} className="p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-100">{n.subject}</span>
                <span className="flex items-center gap-2 text-xs text-slate-500">{n.channel} · {n.recipientName} <StatusPill status={n.status === "Logged" ? "Pending" : "Approved"} /></span>
              </div>
              <div className="mt-1 text-xs text-slate-400">{n.body}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const STAFF_ROLES = [
  { v: "client", label: "Enterprise Client" },
  { v: "supplier", label: "Equipment / Fleet Supplier" },
  { v: "key_account", label: "Key Account Manager" },
  { v: "field", label: "Field Force" },
  { v: "parts_supplier", label: "Parts Supplier" },
  { v: "admin", label: "Nguzo Admin" },
];

function statusLabel(s?: string) {
  if (!s) return "Under Review";
  if (s === "Approved") return "Verified";
  return s;
}

function Team() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-staff"], queryFn: () => StaffAPI.list().then((r) => r.staff) });
  const reqs = useQuery({ queryKey: ["admin-staff-requests"], queryFn: () => StaffAPI.requests().then((r) => r.requests), refetchInterval: 6000 });
  const kams = useQuery({ queryKey: ["admin-kams"], queryFn: () => AdminAPI.kams().then((r) => r.kams) });
  const act = useMutation({ mutationFn: ({ id, role }: { id: string; role: string }) => StaffAPI.setRole(id, role), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-staff"] }) });
  const remove = useMutation({ mutationFn: (id: string) => StaffAPI.remove(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-staff"] }) });
  const assignKam = useMutation({ mutationFn: ({ id, kamId }: { id: string; kamId: string }) => AdminAPI.assignKam(id, kamId), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-staff"] }) });
  const setStation = useMutation({ mutationFn: ({ id, station }: { id: string; station: string }) => AdminAPI.setStation(id, station), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-staff"] }) });
  const reset = useMutation({
    mutationFn: (id: string) => StaffAPI.resetPassword(id),
    onSuccess: (res, id) => { const u = (q.data ?? []).find((x: any) => x.id === id); setCreds({ username: u?.username || u?.email || "—", tempPassword: res.tempPassword, userCode: u?.userCode }); },
  });
  const create = useMutation({
    mutationFn: (b: any) => StaffAPI.create(b),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["admin-staff"] }); setForm(BLANK_USER); setShow(false); setCreds(res); },
  });
  const resolve = useMutation({
    mutationFn: ({ id, approve, username }: { id: string; approve: boolean; username?: string }) => StaffAPI.resolveRequest(id, approve, username ? { username } : undefined),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["admin-staff-requests"] }); qc.invalidateQueries({ queryKey: ["admin-staff"] }); if (res?.tempPassword) setCreds(res); },
  });
  const [show, setShow] = useState(false);
  const [tab, setTab] = useState<"teams" | "clients" | "suppliers">("teams");
  const [form, setForm] = useState<any>(BLANK_USER);
  const [creds, setCreds] = useState<any>(null);
  const rows = q.data ?? [];
  const pendingReqs = (reqs.data ?? []).filter((r: any) => r.status === "Pending");
  const teamRows = rows.filter((u: any) => ["admin", "key_account", "field"].includes(u.role));
  const clientRows = rows.filter((u: any) => u.role === "client");
  const supplierRows = rows.filter((u: any) => ["supplier", "parts_supplier"].includes(u.role));
  const roleLabel = (r: string) => STAFF_ROLES.find((x) => x.v === r)?.label ?? r;
  const kamName = (id?: string) => { const k = (kams.data ?? []).find((x: any) => x.id === id); return k ? (k.fullName || k.companyName) : null; };

  return (
    <div className="p-6">
      <SectionTitle sub="Add or remove any user. Staff (Admin, KAM, Field) log in with a username you set; suppliers and clients self-register." action={<Button variant="amber" onClick={() => setShow((s) => !s)}>{show ? "Close" : "Add staff"}</Button>}>
        Team & Access
      </SectionTitle>

      {show && (
        <Card className="mb-5 p-5">
          <p className="mb-3 text-xs text-slate-400">Create an internal staff account. They sign in with the <b>username</b> below and a temporary password, then must change it and complete KYC on first login.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Full name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Username"><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} placeholder="e.g. amina.k" /></Field>
            <Field label="Temporary password"><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="min 8 chars (or auto-generated)" /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Role">
              <select className="focus-ring w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-slate-100" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {STAFF_ROLES.filter((r) => ["admin", "key_account", "field"].includes(r.v)).map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
              </select>
            </Field>
            {form.role === "field" && (
              <Field label="Station">
                <select className="focus-ring w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-slate-100" value={form.fieldStation} onChange={(e) => setForm({ ...form, fieldStation: e.target.value })}>
                  <option value="yard">Yard Audit</option>
                  <option value="border">Border Liaison</option>
                </select>
              </Field>
            )}
          </div>
          <Button className="mt-3" variant="amber" disabled={create.isPending || !form.name.trim() || !form.username.trim()} onClick={() => create.mutate(form)}>{create.isPending ? "Creating…" : "Create staff account"}</Button>
          {create.error && <p className="mt-2 text-xs text-bad">{(create.error as Error).message}</p>}
        </Card>
      )}

      {creds && (
        <Card className="mb-5 border-amber-600 p-5">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-amber-500">Credentials receipt — share securely, shown once</div>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-md border border-navy-600 bg-navy-900 px-3 py-2"><div className="text-[10px] uppercase text-slate-500">Username</div><div className="font-mono text-slate-100">{creds.username}</div></div>
            <div className="rounded-md border border-navy-600 bg-navy-900 px-3 py-2"><div className="text-[10px] uppercase text-slate-500">Temp password</div><div className="font-mono text-slate-100">{creds.tempPassword}</div></div>
            <div className="rounded-md border border-navy-600 bg-navy-900 px-3 py-2"><div className="text-[10px] uppercase text-slate-500">User ID</div><div className="font-mono text-amber-500/80">{creds.userCode}</div></div>
          </div>
          <Button className="mt-3" variant="ghost" onClick={() => setCreds(null)}>Done</Button>
        </Card>
      )}

      {pendingReqs.length > 0 && (
        <Card className="mb-5 border-amber-600 p-5">
          <div className="mb-3 text-[11px] uppercase tracking-wider text-amber-500">Field-agent requests from KAMs</div>
          <div className="space-y-2">
            {pendingReqs.map((r: any) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
                <div>
                  <div className="text-slate-100">{r.proposedName} <span className="text-[11px] text-slate-500">· {r.proposedEmail}</span></div>
                  <div className="text-[11px] text-slate-500">requested by {r.requestedByName}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="amber" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, approve: true })}>Approve & create</Button>
                  <Button variant="ghost" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, approve: false })}>Reject</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mb-4 flex gap-1 rounded-lg border border-navy-600 bg-navy-900 p-1 text-sm">
        {([["teams", `Teams (${teamRows.length})`], ["clients", `Clients (${clientRows.length})`], ["suppliers", `Suppliers (${supplierRows.length})`]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)} className={`flex-1 rounded-md px-3 py-2 transition ${tab === v ? "bg-navy-700 text-amber-400" : "text-slate-400 hover:text-slate-200"}`}>{label}</button>
        ))}
      </div>

      {tab === "teams" && (
        teamRows.length === 0 ? <Empty>No staff yet.</Empty> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-600 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">User</th><th className="px-4 py-3">User ID</th><th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Assignment</th><th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {teamRows.map((u: any) => (
                <tr key={u.id} className="border-b border-navy-700 align-top">
                  <td className="px-4 py-3 text-slate-100">
                    {u.fullName || u.companyName || u.name || "—"}
                    {u.username && <span className="ml-2 font-mono text-[10px] text-slate-500">@{u.username}</span>}
                    {u.isSelf && <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-400">you</span>}
                    {u.isLocked && <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-500">super-admin</span>}
                  </td>
                  <td className="px-4 py-3"><span className="font-mono text-[11px] text-amber-500/80">{u.userCode || "—"}</span></td>
                  <td className="px-4 py-3 text-[12px] text-slate-300">{u.phone || u.email || "—"}</td>
                  <td className="px-4 py-3">
                    {u.isSelf || u.isLocked ? (
                      <span className="text-slate-300">{roleLabel(u.role)}</span>
                    ) : (
                      <select className="rounded-md border border-navy-600 bg-navy-800 px-2 py-1.5 text-sm text-slate-100 disabled:opacity-40" value={u.role} disabled={act.isPending} onChange={(e) => act.mutate({ id: u.id, role: e.target.value })}>
                        {STAFF_ROLES.filter((r) => ["admin", "key_account", "field"].includes(r.v)).map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3"><StatusPill status={statusLabel(u.verificationStatus)} /></td>
                  <td className="px-4 py-3">
                    {u.role === "field" ? (
                      <select className="rounded-md border border-navy-600 bg-navy-800 px-2 py-1.5 text-xs text-slate-100" value={u.fieldStation || ""} onChange={(e) => e.target.value && setStation.mutate({ id: u.id, station: e.target.value })}>
                        <option value="">Set station…</option><option value="yard">Yard Audit</option><option value="border">Border Liaison</option>
                      </select>
                    ) : <span className="text-[11px] text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      {!u.isLocked && <button onClick={() => { if (confirm(`Reset password for ${u.fullName || u.companyName || u.email}? A temporary password will be issued.`)) reset.mutate(u.id); }} disabled={reset.isPending} className="text-[11px] text-amber-500 hover:underline disabled:opacity-40">reset password</button>}
                      {!u.isSelf && !u.isLocked && <button onClick={() => { if (confirm(`Remove ${u.companyName || u.email}?`)) remove.mutate(u.id); }} className="text-[11px] text-bad hover:underline">remove</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>)
      )}

      {(tab === "clients" || tab === "suppliers") && (
        (tab === "clients" ? clientRows : supplierRows).length === 0 ? <Empty>No {tab} yet.</Empty> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-600 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">User</th><th className="px-4 py-3">User ID</th><th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Contact</th><th className="px-4 py-3">Status</th>
                {tab === "suppliers" && <th className="px-4 py-3">Manager (KAM)</th>}
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(tab === "clients" ? clientRows : supplierRows).map((u: any) => (
                <tr key={u.id} className="border-b border-navy-700 align-top">
                  <td className="px-4 py-3 text-slate-100">{u.companyName || u.fullName || u.name || "—"}</td>
                  <td className="px-4 py-3"><span className="font-mono text-[11px] text-amber-500/80">{u.userCode || "—"}</span></td>
                  <td className="px-4 py-3 text-slate-300">{roleLabel(u.role)}</td>
                  <td className="px-4 py-3 text-[12px] text-slate-300">{u.phone || u.email || "—"}</td>
                  <td className="px-4 py-3"><StatusPill status={statusLabel(u.verificationStatus)} /></td>
                  {tab === "suppliers" && (
                    <td className="px-4 py-3">
                      <select className="rounded-md border border-navy-600 bg-navy-800 px-2 py-1.5 text-xs text-slate-100" value={u.managerId || ""} onChange={(e) => e.target.value && assignKam.mutate({ id: u.id, kamId: e.target.value })}>
                        <option value="">{kamName(u.managerId) ? `${kamName(u.managerId)} ✓` : "Assign KAM…"}</option>
                        {(kams.data ?? []).map((k: any) => <option key={k.id} value={k.id}>{k.fullName || k.companyName} ({k.userCode})</option>)}
                      </select>
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <button onClick={() => { if (confirm(`Reset password for ${u.companyName || u.email}?`)) reset.mutate(u.id); }} disabled={reset.isPending} className="text-[11px] text-amber-500 hover:underline disabled:opacity-40">reset password</button>
                      <button onClick={() => { if (confirm(`Remove ${u.companyName || u.email}?`)) remove.mutate(u.id); }} className="text-[11px] text-bad hover:underline">remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>)
      )}
    </div>
  );
}

const BLANK_USER = { name: "", username: "", password: "", phone: "", role: "key_account", fieldStation: "yard" };

function Overview() {
  const [, navigate] = useLocation();
  const q = useQuery({ queryKey: ["admin-overview"], queryFn: async () => (await (await api.admin.overview.$get()).json()) as any });
  if (q.isLoading || !q.data) return <div className="p-6 text-slate-500">Loading…</div>;
  const { counts, lockedEscrow, platformRevenue, contracts } = q.data;

  return (
    <div className="p-6">
      <SectionTitle sub="Live operating picture across the corridor.">Operations Overview</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KPIStat label="Locked Escrow" value={tzs(lockedEscrow)} hint="View ledger →" onClick={() => navigate("/app/ledger")} />
        <KPIStat label="Platform Revenue" value={tzs(platformRevenue)} accent="good" hint="View ledger →" onClick={() => navigate("/app/ledger")} />
        <KPIStat label="Contracts" value={String(counts.contracts)} hint="View jobs →" onClick={() => navigate("/app/jobs")} />
        <KPIStat label="Suppliers" value={String(counts.suppliers)} hint="View team →" onClick={() => navigate("/app/team")} />
        <KPIStat label="Assets" value={String(counts.assets)} hint="Ground force →" onClick={() => navigate("/app/ground")} />
        <KPIStat label="Breakdowns" value={String(counts.breakdowns)} accent={counts.breakdowns ? "amber" : undefined} hint="View jobs →" onClick={() => navigate("/app/jobs")} />
      </div>

      <div className="mt-6">
        <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">All contracts</div>
        {contracts.length === 0 ? (
          <Empty>No contracts in the system yet.</Empty>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-600 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Contract</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3 text-right">Escrow</th>
                  <th className="px-4 py-3 text-right">Fee (10%)</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c: any) => (
                  <tr key={c.id} className="border-b border-navy-700">
                    <td className="px-4 py-3 text-slate-100">{c.title}</td>
                    <td className="px-4 py-3 text-slate-400">{c.routeClassification === "CrossBorder" ? "Cross-Border" : "Domestic"}</td>
                    <td className="px-4 py-3 text-right tnum text-slate-200">{tzs(c.totalEscrowBalanceTzs)}</td>
                    <td className="px-4 py-3 text-right tnum text-slate-400">{c.platformFeeTzs ? tzs(c.platformFeeTzs) : "—"}</td>
                    <td className="px-4 py-3"><StatusPill status={c.milestoneStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}

function Verify() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"remote" | "siteVisit" | "staff">("remote");
  const [reviewing, setReviewing] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["verify-queue"], queryFn: () => AdminAPI.verificationQueue(), refetchInterval: 8000 });
  const act = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) => AdminAPI.verify(id, status, notes),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["verify-queue"] }); setReviewing(null); },
  });

  const remote = q.data?.remote ?? [];
  const siteVisit = q.data?.siteVisit ?? [];
  const staff = q.data?.staff ?? [];
  const rows = tab === "remote" ? remote : tab === "siteVisit" ? siteVisit : staff;

  return (
    <div className="p-6">
      <SectionTitle sub="Every Nguzo partner is verified before going live. Clients are reviewed remotely; suppliers require a physical site visit.">Verification Queue</SectionTitle>

      <div className="mb-5 inline-flex gap-1 rounded-lg border border-navy-600 bg-navy-800 p-1">
        {([["remote", `Remote review — Clients (${remote.length})`], ["siteVisit", `Site visit — Suppliers (${siteVisit.length})`], ["staff", `Staff on queue (${staff.length})`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k as any)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${tab === k ? "bg-navy-700 text-slate-100" : "text-slate-500 hover:text-slate-300"}`}>{label}</button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty>{tab === "remote" ? "No clients awaiting review." : tab === "siteVisit" ? "No suppliers awaiting a site visit." : "No staff awaiting KYC verification."}</Empty>
      ) : (
        <div className="space-y-2">
          {rows.map((s: any) => (
            <Card key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="flex items-center gap-2 font-medium text-slate-100">
                  {s.companyName || s.fullName || "Unnamed"}
                  <span className="font-mono text-[11px] text-amber-500/80">{s.userCode}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {s.role === "parts_supplier" ? "Parts supplier" : s.role === "key_account" ? "Key Account Manager" : s.role === "field" ? "Field agent" : s.role} · {s.phone || "no phone"} · {s.documentCount} document{s.documentCount === 1 ? "" : "s"}
                  {s.address ? ` · ${s.address}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <VerifiedBadge status={s.verificationStatus} />
                <Button variant="subtle" onClick={() => setReviewing(s.id)}>Review</Button>
                {tab === "siteVisit" && s.verificationStatus !== "SiteVisitScheduled" && (
                  <Button variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ id: s.id, status: "SiteVisitScheduled", notes: "Site visit scheduled by operations." })}>Schedule visit</Button>
                )}
                <Button variant="amber" disabled={act.isPending} onClick={() => act.mutate({ id: s.id, status: "Verified", notes: tab === "remote" ? "Verified after remote review." : "Verified after physical site visit." })}>Verify</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {reviewing && <ReviewProfileModal profileId={reviewing} onClose={() => setReviewing(null)} onVerify={(status, notes) => act.mutate({ id: reviewing, status, notes })} busy={act.isPending} />}
    </div>
  );
}

function ReviewProfileModal({ profileId, onClose, onVerify, busy }: { profileId: string; onClose: () => void; onVerify: (status: string, notes?: string) => void; busy: boolean }) {
  const q = useQuery({ queryKey: ["admin-profile", profileId], queryFn: () => AdminAPI.profile(profileId) });
  const [notes, setNotes] = useState("");
  const d = q.data;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-navy-600 bg-navy-800 p-6" onClick={(e) => e.stopPropagation()}>
        {!d ? <div className="text-slate-500">Loading profile…</div> : (
          <>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="font-display text-lg font-semibold text-slate-100">{d.profile.companyName || d.profile.fullName}</div>
                <div className="text-xs text-slate-500">{d.profile.email} · {d.profile.role} · <span className="font-mono text-amber-500/80">{d.profile.userCode}</span></div>
              </div>
              <VerifiedBadge status={d.profile.verificationStatus} />
            </div>

            <div className="grid gap-2 text-sm sm:grid-cols-2">
              {[["Phone", d.profile.phone], ["Address", d.profile.address], ["Reg. no.", d.profile.companyRegNo], ["TIN", d.profile.companyTin], ["Sector", d.profile.companySector], ["Authoriser", `${d.profile.authoriserName || "—"}${d.profile.authoriserTitle ? ` (${d.profile.authoriserTitle})` : ""}`], ["Authoriser phone", d.profile.authoriserPhone], ["National ID", d.profile.nationalId]].map(([k, v]) => (
                <div key={k as string} className="rounded-md border border-navy-600 bg-navy-900 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">{k}</div>
                  <div className="text-slate-200">{(v as string) || "—"}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              {d.faceUrl && <a href={d.faceUrl} target="_blank" rel="noreferrer" className="text-xs text-amber-500 hover:underline">↗ Face image</a>}
              {d.idDocUrl && <a href={d.idDocUrl} target="_blank" rel="noreferrer" className="text-xs text-amber-500 hover:underline">↗ National ID</a>}
              {d.documents.map((doc: any) => (
                <a key={doc.id} href={doc.url} target="_blank" rel="noreferrer" className="text-xs text-amber-500 hover:underline">↗ {doc.kind}{doc.label ? ` — ${doc.label}` : ""}</a>
              ))}
              {!d.documents.length && !d.faceUrl && !d.idDocUrl && <span className="text-xs text-slate-500">No documents uploaded.</span>}
            </div>

            <div className="mt-5">
              <Field label="Review notes (optional)"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note for the record…" /></Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Close</Button>
              <Button variant="ghost" disabled={busy} onClick={() => onVerify("Rejected", notes || "Needs attention.")}>Reject</Button>
              {(d.profile.role === "supplier" || d.profile.role === "parts_supplier") && (
                <Button variant="subtle" disabled={busy} onClick={() => onVerify("SiteVisitScheduled", notes || "Site visit scheduled.")}>Schedule visit</Button>
              )}
              <Button variant="amber" disabled={busy} onClick={() => onVerify("Verified", notes || "Verified.")}>Verify</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MyKyc({ me }: { me: Me }) {
  const [nationalId, setNationalId] = useState("");
  const [idKey, setIdKey] = useState("");
  const [faceKey, setFaceKey] = useState("");
  const [phone, setPhone] = useState(me.profile.phone || "");
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: async () => {
      const { OnboardingAPI } = await import("../lib/tenders");
      return OnboardingAPI.save({ nationalId, nationalIdDocKey: idKey, faceImageKey: faceKey, phone });
    },
    onSuccess: () => setSaved(true),
  });
  return (
    <div className="p-6 max-w-xl">
      <SectionTitle sub="Your identity record, kept for compliance. Same standard every Nguzo partner meets.">My KYC</SectionTitle>
      <Card className="space-y-3 p-5">
        <Field label="Your phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+255…" /></Field>
        <Field label="National ID number"><Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} /></Field>
        <KycFileUpload label="National ID document" scope="kyc" onUploaded={(k) => setIdKey(k)} />
        <KycFileUpload label="Your photo (face)" scope="kyc" accept="image/*" onUploaded={(k) => setFaceKey(k)} />
        <Button variant="amber" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save KYC"}</Button>
        {saved && <p className="text-xs text-good">✓ Saved.</p>}
      </Card>
    </div>
  );
}

function MyProfile({ me }: { me: Me }) {
  const [fullName, setFullName] = useState(me.profile.fullName || me.user.name || "");
  const [phone, setPhone] = useState(me.profile.phone || "");
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: async () => { const { ProfileAPI } = await import("../lib/tenders"); return ProfileAPI.updateSelf({ fullName, phone }); },
    onSuccess: () => setSaved(true),
  });
  return (
    <div className="p-6 max-w-xl space-y-6">
      <div>
        <SectionTitle sub="Your name and contact, shown across the platform.">Profile</SectionTitle>
        <Card className="space-y-3 p-5">
          <div className="text-xs text-slate-500">User ID <span className="font-mono text-amber-500/80">{me.profile.userCode}</span></div>
          <Field label="Full name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
          <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+255…" /></Field>
          <Button variant="amber" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save profile"}</Button>
          {saved && <p className="text-xs text-good">✓ Saved.</p>}
        </Card>
      </div>
      <div>
        <SectionTitle sub="Change your password.">Security</SectionTitle>
        <Card className="p-5"><ChangePasswordForm requireCurrent /></Card>
      </div>
    </div>
  );
}

/** Admin payment desk — step 4: approve & release submitted payment requests via the payout gateway. */
function Payments({ me }: { me: Me }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-payments"], queryFn: async () => (await (await api.contracts.$get()).json()).contracts as any[], refetchInterval: 5000 });
  const pending = (q.data ?? []).filter((c) => c.payoutStatus === "PendingAdminApproval");
  return (
    <div className="p-6">
      <SectionTitle sub="Payment requests your KAMs have submitted for execution. Review the split, then approve & release through the payout gateway. Funds are tracked, not held.">Payments</SectionTitle>
      {pending.length === 0 ? <Empty>No payment requests awaiting approval.</Empty> : (
        <div className="space-y-3">
          {pending.map((c) => <AdminPayoutCard key={c.id} contract={c} me={me} onDone={() => qc.invalidateQueries({ queryKey: ["admin-payments"] })} />)}
        </div>
      )}
    </div>
  );
}

function AdminPayoutCard({ contract, me, onDone }: { contract: any; me: Me; onDone: () => void }) {
  const q = useQuery({ queryKey: ["payout", contract.id], queryFn: () => TenderAPI.getPayout(contract.id) });
  const [open, setOpen] = useState(false);
  const data = q.data;
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-medium text-slate-100">{contract.title}</div>
        <StatusPill status="Pending approval" />
      </div>
      <div className="mb-3"><PaymentTracker payoutStatus={contract.payoutStatus} /></div>
      <div className="mb-3 grid gap-3 md:grid-cols-2 text-sm">
        <div className="rounded-md border border-navy-600 bg-navy-900 p-3">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">Supplier net</div>
          <div className="tnum text-good">{tzs(data?.preview?.supplierPayoutTzs ?? contract.supplierPayoutTzs ?? 0)}</div>
        </div>
        <div className="rounded-md border border-navy-600 bg-navy-900 p-3">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">TT slip</div>
          {data?.slipUrl ? <a href={data.slipUrl} target="_blank" rel="noreferrer" className="text-amber-500 hover:underline">View ↗</a> : <span className="text-slate-500">—</span>}
        </div>
      </div>
      <Button variant="amber" onClick={() => setOpen(true)} disabled={!data}>Approve &amp; release payment</Button>
      {open && data && (
        <PayoutGatewayModal
          contract={data.contract}
          bank={data.bank}
          makerName="Key Account Manager"
          checkerName={me.profile.fullName || me.user.name || "Admin"}
          onClose={() => setOpen(false)}
          onReleased={onDone}
        />
      )}
    </Card>
  );
}

function Reversals({ me }: { me: Me }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-reversals"], queryFn: () => TenderAPI.listReversals().then((r) => r.reversals), refetchInterval: 6000 });
  const cq = useQuery({ queryKey: ["admin-contracts-rev"], queryFn: async () => (await (await api.contracts.$get()).json()).contracts as any[] });
  const contracts = cq.data ?? [];
  const rows = q.data ?? [];
  const pending = rows.filter((r) => r.status === "KamReviewed");
  const history = rows.filter((r) => r.status === "Executed" || r.status === "Rejected");
  const titleFor = (cid: string) => contracts.find((c) => c.id === cid)?.title || cid;
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-reversals"] });
  return (
    <div className="p-6">
      <SectionTitle sub="Cancellation, refund & shortened-hire requests forwarded by your KAMs. Figures are recomputed at approval. Refunds are instructed to the client's bank — funds are tracked, not held.">Reversals</SectionTitle>
      {pending.length === 0 ? <Empty>No reversals awaiting approval.</Empty> : (
        <div className="space-y-3">
          {pending.map((r) => <AdminReversalCard key={r.id} rev={r} title={titleFor(r.contractId)} me={me} onDone={refresh} />)}
        </div>
      )}
      {history.length > 0 && (
        <div className="mt-8">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">History</div>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-600 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Contract</th><th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Client refund</th><th className="px-4 py-3 text-right">Supplier kept</th>
                  <th className="px-4 py-3 text-right">Nguzo fee kept</th><th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-b border-navy-700">
                    <td className="px-4 py-3 text-slate-100">{titleFor(r.contractId)}</td>
                    <td className="px-4 py-3 text-slate-300">{r.reason}</td>
                    <td className="px-4 py-3 text-right tnum text-slate-200">{r.clientRefundTzs ? tzs(r.clientRefundTzs) : "—"}</td>
                    <td className="px-4 py-3 text-right tnum text-slate-400">{(r.supplierPenaltyTzs + r.transferFeeKeptTzs) ? tzs(r.supplierPenaltyTzs + r.transferFeeKeptTzs) : "—"}</td>
                    <td className="px-4 py-3 text-right tnum text-slate-400">{r.nguzoFeeKeptTzs ? tzs(r.nguzoFeeKeptTzs) : "—"}</td>
                    <td className="px-4 py-3"><StatusPill status={r.status === "Executed" ? "Verified" : "Declined"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}

function AdminReversalCard({ rev, title, me, onDone }: { rev: any; title: string; me: Me; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const li = rev.lineItems || { client: [], supplier: [], nguzo: [] };
  const clientRefund = (li.client?.find((x: any) => /net refund/i.test(x.label)) || {}).amountTzs ?? 0;
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-medium text-slate-100">{rev.reason} · {title}</div>
        <StatusPill status="Reviewed — awaiting approval" />
      </div>
      <p className="mb-3 text-xs text-slate-500">Stage at request: {rev.stageAtRequest || "—"}{rev.kamNote ? ` · KAM: "${rev.kamNote}"` : ""}</p>
      <div className="mb-3 grid gap-3 md:grid-cols-3 text-sm">
        <div className="rounded-md border border-navy-600 bg-navy-900 p-3"><div className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">Est. client refund</div><div className="tnum text-good">{tzs(clientRefund)}</div></div>
        <div className="rounded-md border border-navy-600 bg-navy-900 p-3"><div className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">Type</div><div className="text-slate-200">{rev.reason}</div></div>
        <div className="rounded-md border border-navy-600 bg-navy-900 p-3"><div className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">Destination</div><div className="text-slate-200">Client bank (instruction)</div></div>
      </div>
      <Button variant="amber" onClick={() => setOpen(true)}>Approve &amp; execute reversal</Button>
      {open && <AdminReversalModal rev={rev} title={title} me={me} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onDone(); }} />}
    </Card>
  );
}

function AdminReversalModal({ rev, title, me, onClose, onDone }: { rev: any; title: string; me: Me; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const li = rev.lineItems || { client: [], supplier: [], nguzo: [] };
  const idemRef = `REV-${rev.id.slice(-8).toUpperCase()}`;
  async function release() {
    setBusy(true); setErr("");
    try {
      const r = await TenderAPI.reversalApprove(rev.id);
      const res = r.result;
      generateReversalPDF({
        reference: idemRef,
        contractTitle: title,
        reason: rev.reason,
        status: "Executed",
        lineItems: { client: res.clientLineItems, supplier: res.supplierLineItems, nguzo: res.nguzoLineItems },
        clientRefundTzs: res.clientRefundTzs,
      });
      onDone();
    } catch (e: any) { setErr(e?.message || "Release failed"); setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <Card className="max-h-[88vh] w-full max-w-2xl overflow-y-auto p-6" onClick={(e: any) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-slate-100">Reversal gateway</h3>
          <span className="rounded bg-amber-500/10 px-2 py-1 text-[11px] uppercase tracking-wider text-amber-500">NMB (simulated) · backup Selcom</span>
        </div>
        <p className="mb-4 text-xs text-slate-500">Maker: {rev.kamReviewedBy ? "Key Account Manager" : "—"} · Checker: {me.profile.fullName || me.user.name || "Admin"} · Idempotency ref {idemRef} · Funds tracked, not held.</p>
        <p className="mb-4 text-sm text-slate-300">{rev.reason} on <span className="font-medium text-slate-100">{title}</span></p>
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
        {err && <p className="mt-3 text-xs text-bad">{err}</p>}
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="amber" onClick={release} disabled={busy}>{busy ? "Executing…" : "Approve & execute (simulated)"}</Button>
        </div>
      </Card>
    </div>
  );
}

function Ledger() {
  const q = useQuery({ queryKey: ["admin-overview"], queryFn: async () => (await (await api.admin.overview.$get()).json()) as any });
  if (q.isLoading || !q.data) return <div className="p-6 text-slate-500">Loading…</div>;
  const { contracts, lockedEscrow, platformRevenue } = q.data;
  const disbursed = contracts.filter((c: any) => c.milestoneStatus === "FundsDisbursed");
  const totalParts = contracts.reduce((s: number, c: any) => s + c.emergencyCreditDeductedTzs, 0);

  return (
    <div className="p-6">
      <SectionTitle sub="Master settlement ledger across all contracts.">Master Ledger</SectionTitle>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPIStat label="Currently Locked" value={tzs(lockedEscrow)} />
        <KPIStat label="Platform Revenue" value={tzs(platformRevenue)} accent="good" />
        <KPIStat label="Parts Credit Extended" value={tzs(totalParts)} accent={totalParts ? "amber" : undefined} />
        <KPIStat label="Settled Contracts" value={String(disbursed.length)} />
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-600 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3">Contract</th>
              <th className="px-4 py-3 text-right">Escrow</th>
              <th className="px-4 py-3 text-right">Fee</th>
              <th className="px-4 py-3 text-right">Parts Credit</th>
              <th className="px-4 py-3 text-right">Supplier Payout</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c: any) => (
              <tr key={c.id} className="border-b border-navy-700">
                <td className="px-4 py-3 text-slate-100">{c.title}</td>
                <td className="px-4 py-3 text-right tnum text-slate-200">{tzs(c.totalEscrowBalanceTzs)}</td>
                <td className="px-4 py-3 text-right tnum text-slate-400">{c.platformFeeTzs ? tzs(c.platformFeeTzs) : "—"}</td>
                <td className={`px-4 py-3 text-right tnum ${c.emergencyCreditDeductedTzs ? "text-amber-500" : "text-slate-500"}`}>
                  {c.emergencyCreditDeductedTzs ? tzs(c.emergencyCreditDeductedTzs) : "—"}
                </td>
                <td className="px-4 py-3 text-right tnum text-good">{c.supplierPayoutTzs ? tzs(c.supplierPayoutTzs) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

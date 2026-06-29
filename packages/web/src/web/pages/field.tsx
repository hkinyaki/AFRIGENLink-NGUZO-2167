import { useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { shortDate } from "../lib/format";
import type { Me } from "../lib/use-me";
import { TenderAPI, FieldAPI } from "../lib/tenders";
import { AppShell, Icons, type NavItem } from "../components/shell";
import { Button, Card, Field, Input, Select, SectionTitle, StatusPill, Empty, StageTracker } from "../components/ui";

export default function FieldApp({ me }: { me: Me }) {
  // A field agent works ONE station. Admin sees both for oversight.
  const station = me.profile.fieldStation || "";
  const isYard = me.profile.role === "admin" || station === "yard" || station === "";
  const isBorder = me.profile.role === "admin" || station === "border";
  const nav: NavItem[] = [
    { label: "Inspections", href: "/app", icon: Icons.clip },
    { label: "My Accounts", href: "/app/accounts", icon: Icons.users },
    { label: "Spare Deliveries", href: "/app/deliveries", icon: Icons.truck },
    { label: "Job History", href: "/app/history", icon: Icons.clip },
    ...(isYard ? [{ label: "Yard Audits", href: "/app/audits", icon: Icons.truck }] : []),
    ...(isBorder ? [{ label: "Border Log", href: "/app/border", icon: Icons.map }] : []),
    { label: "My Profile", href: "/app/profile", icon: Icons.users },
  ];
  return (
    <AppShell me={me} nav={nav}>
      <Switch>
        <Route path="/app" component={() => <Inspections me={me} />} />
        <Route path="/app/accounts" component={() => <MyAccounts />} />
        <Route path="/app/deliveries" component={() => <SpareDeliveries />} />
        <Route path="/app/history" component={() => <JobHistory me={me} />} />
        <Route path="/app/inspect/:id">{(p) => <InspectJob id={p.id} me={me} />}</Route>
        {isYard && <Route path="/app/audits" component={() => <Audits />} />}
        {isBorder && <Route path="/app/border" component={() => <BorderLog />} />}
        <Route path="/app/profile" component={() => <FieldProfile me={me} />} />
      </Switch>
    </AppShell>
  );
}

/** Sender-ID badge shown on each job/report card. */
function AgentTag({ me }: { me: Me }) {
  const name = me.profile.fullName || me.profile.companyName || me.user.name;
  const num = me.profile.agentNumber || me.profile.userCode;
  return <span className="text-[11px] text-slate-500">{name}{num ? ` · ${num}` : ""}</span>;
}

function Inspections({ me }: { me: Me }) {
  const [, navigate] = useLocation();
  const q = useQuery({ queryKey: ["tenders"], queryFn: () => TenderAPI.list().then((r) => r.tenders), refetchInterval: 5000 });
  const rows = q.data ?? [];
  const toInspect = rows.filter((t: any) => t.tenderStage === "MachineDocsUploaded");
  const others = rows.filter((t: any) => t.status !== "Open" && t.tenderStage !== "MachineDocsUploaded");

  return (
    <div className="p-6">
      <SectionTitle sub="Jobs whose suppliers have uploaded fleet docs and are awaiting your on-site verification. Your report goes to the Key Account Manager for approval.">Field Inspections</SectionTitle>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-amber-500">Awaiting inspection ({toInspect.length})</span>
        <AgentTag me={me} />
      </div>
      {toInspect.length === 0 ? (
        <Empty>Nothing awaiting inspection right now.</Empty>
      ) : (
        <div className="mb-8 space-y-3">
          {toInspect.map((t: any) => (
            <Card key={t.id} lift className="cursor-pointer border-amber-600/40 p-4" >
              <div onClick={() => navigate(`/app/inspect/${t.id}`)} className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium text-slate-100">{t.title}</div>
                  <div className="text-xs text-slate-500">{t.carrierOrMachineType} · {t.unitsNeeded} unit{t.unitsNeeded > 1 ? "s" : ""} · {t.origin} → {t.destination}</div>
                  <div className="mt-0.5"><AgentTag me={me} /></div>
                </div>
                <span className="text-xs text-amber-500">Inspect →</span>
              </div>
            </Card>
          ))}
        </div>
      )}
      <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">Other jobs</div>
      {others.length === 0 ? <Empty>No other active jobs.</Empty> : (
        <div className="space-y-3">
          {others.map((t: any) => (
            <Card key={t.id} className="p-4">
              <div className="mb-2 flex items-center justify-between"><span className="font-medium text-slate-100">{t.title}</span><StatusPill status={t.status} /></div>
              <StageTracker current={t.tenderStage} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function InspectJob({ id, me }: { id: string; me: Me }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const q = useQuery({ queryKey: ["tender", id], queryFn: () => TenderAPI.get(id), refetchInterval: 5000 });
  const [notes, setNotes] = useState("");
  const [vin, setVin] = useState("");
  const [docsChecked, setDocsChecked] = useState(false);
  const [machineInspected, setMachineInspected] = useState(false);
  const [frontKey, setFrontKey] = useState("");
  const [backKey, setBackKey] = useState("");
  const [frontPreview, setFrontPreview] = useState("");
  const [backPreview, setBackPreview] = useState("");
  const [photoBusy, setPhotoBusy] = useState<"front" | "back" | "">("");

  async function uploadMachinePhoto(side: "front" | "back", file: File) {
    setPhotoBusy(side);
    try {
      const { uploadFile } = await import("../lib/tenders");
      const { key } = await uploadFile(file, "machine-photo");
      if (side === "front") { setFrontKey(key); setFrontPreview(URL.createObjectURL(file)); }
      else { setBackKey(key); setBackPreview(URL.createObjectURL(file)); }
    } finally { setPhotoBusy(""); }
  }

  const submit = useMutation({
    mutationFn: async () => {
      await api.inspections.$post({ json: { tenderId: id, mechanicalNotes: notes, vinPhotos: vin ? [vin] : [], docsChecked, machineInspected, submit: true, legitimacySignedOff: docsChecked && machineInspected, frontPhotoKey: frontKey, backPhotoKey: backKey } as any });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tender", id] }); qc.invalidateQueries({ queryKey: ["tenders"] }); navigate("/app"); },
  });

  if (q.isLoading || !q.data?.tender) return <div className="p-6 text-slate-500">Loading…</div>;
  const { tender: t, documents, inspections } = q.data;
  const machineDocs = documents.filter((d: any) => d.kind === "MachineDoc" || d.kind === "SignedAgreement");
  // latest report for this tender (most recent)
  const report = (inspections ?? [])[0];
  const submitted = report?.reportStatus === "Submitted";
  const declined = report?.reportStatus === "Declined";

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <SectionTitle sub={`${t.carrierOrMachineType} · ${t.unitsNeeded} unit(s) · ${t.origin} → ${t.destination}`}>{t.title}</SectionTitle>
      <p className="mb-4 -mt-2 pl-3.5"><AgentTag me={me} /></p>

      {submitted && (
        <Card className="mb-4 border-amber-600/40 p-4 text-sm text-amber-400">Report submitted — awaiting Key Account Manager review.</Card>
      )}
      {declined && (
        <Card className="mb-4 border-bad/40 p-4 text-sm">
          <div className="text-bad">Report declined — supplier is re-uploading documents.</div>
          {report?.declineReason && <div className="mt-1 text-slate-400">Reason: {report.declineReason}</div>}
        </Card>
      )}

      <Card className="mb-4 p-5">
        <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Supplier documents to review</div>
        {machineDocs.length === 0 ? (
          <p className="text-sm text-slate-500">No documents uploaded.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {machineDocs.map((d: any) => (
              <li key={d.id} className="flex items-center justify-between">
                <span className="text-slate-300">{d.label || d.kind} <span className="text-[11px] text-slate-500">· {d.kind}</span></span>
                {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-xs text-amber-500 hover:underline">View ↗</a>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!submitted && (
        <Card className="p-5">
          <div className="space-y-3">
            <Field label="VIN / chassis read"><Input value={vin} onChange={(e) => setVin(e.target.value)} placeholder="Capture / type VIN read" /></Field>
            <Field label="Mechanical & legal notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Hours, hydraulics, undercarriage, documents match…" className="w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-500" />
            </Field>
            <label className="flex items-center gap-3 rounded-lg border border-navy-600 bg-navy-900 p-3 text-sm">
              <input type="checkbox" checked={docsChecked} onChange={(e) => setDocsChecked(e.target.checked)} className="h-4 w-4 accent-amber-500" />
              <span className="text-slate-200">Step 1 — Fleet documents checked</span>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-navy-600 bg-navy-900 p-3 text-sm">
              <input type="checkbox" checked={machineInspected} onChange={(e) => setMachineInspected(e.target.checked)} className="h-4 w-4 accent-amber-500" />
              <span className="text-slate-200">Step 2 — Machine inspected on site</span>
            </label>
            <Field label="Machine photos — front & back are mandatory">
              <div className="grid grid-cols-2 gap-3">
                {([["front", frontKey, frontPreview], ["back", backKey, backPreview]] as const).map(([side, key, preview]) => (
                  <label key={side} className={`relative grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-lg border ${key ? "border-amber-500/60" : "border-dashed border-navy-500"} bg-navy-900 text-center text-xs`}>
                    {preview ? (
                      <img src={preview} alt={`${side} of machine`} className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <span className="px-2 text-slate-400">
                        {photoBusy === side ? "Uploading…" : <>Tap to add<br /><span className="font-semibold capitalize text-slate-200">{side} photo</span></>}
                      </span>
                    )}
                    {key && <span className="absolute right-1 top-1 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-navy-900 capitalize">{side} ✓</span>}
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMachinePhoto(side, f); }} />
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">Both photos are saved to this machine's fleet record.</p>
            </Field>
            <Button variant="amber" className="w-full" disabled={!docsChecked || !machineInspected || !frontKey || !backKey || submit.isPending} onClick={() => submit.mutate()}>
              {submit.isPending ? "Submitting…" : "Submit report to Key Account Manager"}
            </Button>
            {submit.error && <p className="text-xs text-bad">{(submit.error as Error).message}</p>}
          </div>
        </Card>
      )}
    </div>
  );
}

function MyAccounts() {
  const q = useQuery({ queryKey: ["field-accounts"], queryFn: () => FieldAPI.myAccounts(), refetchInterval: 120000 });
  const accounts = q.data?.accounts ?? [];
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <SectionTitle sub="Suppliers assigned to you for inspection. Contact numbers stay masked until you reveal them from a specific inspection.">My Accounts</SectionTitle>
      {accounts.length === 0 ? (
        <Empty>No suppliers assigned to you yet.</Empty>
      ) : (
        <div className="space-y-3">
          {accounts.map((a: any) => (
            <Card key={a.supplierId} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-100">{a.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{a.userCode}{a.yardLocation ? ` · ${a.yardLocation}` : ""}</div>
                </div>
                <StatusPill status={a.verificationStatus || "Pending"} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center text-xs">
                <div className="rounded-lg bg-navy-900 py-2"><div className="text-base font-semibold text-amber-500">{a.assetCount}</div><div className="text-slate-500">Assets</div></div>
                <div className="rounded-lg bg-navy-900 py-2"><div className="text-base font-semibold text-amber-500">{a.inspections}</div><div className="text-slate-500">Inspections</div></div>
                <div className="rounded-lg bg-navy-900 py-2"><div className="text-sm font-medium text-slate-300">{a.contactMasked || "—"}</div><div className="text-slate-500">Contact</div></div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SpareDeliveries() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["field-deliveries"], queryFn: () => FieldAPI.partDeliveries(), refetchInterval: 120000 });
  const received = useMutation({
    mutationFn: (orderId: string) => FieldAPI.markPartReceived(orderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["field-deliveries"] }),
  });
  const deliveries = q.data?.deliveries ?? [];
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <SectionTitle sub="Emergency spare parts routed to you for hand-off on site. Confirm receipt once the part arrives.">Spare Deliveries</SectionTitle>
      {deliveries.length === 0 ? (
        <Empty>No spare parts routed to you.</Empty>
      ) : (
        <div className="space-y-3">
          {deliveries.map((d: any) => (
            <Card key={d.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-100">{d.partName}{d.partSku ? <span className="ml-2 text-[11px] text-slate-500">{d.partSku}</span> : null}</div>
                  <div className="mt-0.5 text-xs text-slate-500">Qty {d.qty} · {d.contractTitle || "—"}</div>
                  {(d.courier || d.waybillRef) && <div className="mt-0.5 text-[11px] text-slate-500">{d.courier}{d.waybillRef ? ` · ${d.waybillRef}` : ""}</div>}
                </div>
                <StatusPill status={d.status} />
              </div>
              {d.status === "Dispatched" && (
                <Button variant="amber" className="mt-3 w-full" disabled={received.isPending} onClick={() => received.mutate(d.id)}>
                  {received.isPending ? "Confirming…" : "Confirm received on site"}
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function JobHistory({ me }: { me: Me }) {
  const q = useQuery({ queryKey: ["field-inspections-history"], queryFn: () => FieldAPI.inspections(), refetchInterval: 120000 });
  // Read-only past job cards: documents, machine photos and report status only — no contract/money detail.
  const rows = (q.data?.inspections ?? []).filter((r: any) => r.tenderId);
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <SectionTitle sub="A read-only record of jobs you have inspected — documents, machine photos and your report status only.">Job History</SectionTitle>
      {rows.length === 0 ? (
        <Empty>No past inspections yet.</Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((r: any) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-100">{r.supplierName || "Supplier"}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{r.supplierCode} · {shortDate(r.createdAt)}</div>
                </div>
                <StatusPill status={r.reportStatus} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className={`rounded px-2 py-1 ${r.docsChecked ? "bg-amber-500/15 text-amber-400" : "bg-navy-900 text-slate-500"}`}>Docs {r.docsChecked ? "✓" : "—"}</span>
                <span className={`rounded px-2 py-1 ${r.machineInspected ? "bg-amber-500/15 text-amber-400" : "bg-navy-900 text-slate-500"}`}>Inspected {r.machineInspected ? "✓" : "—"}</span>
                <span className={`rounded px-2 py-1 ${r.frontPhotoKey ? "bg-amber-500/15 text-amber-400" : "bg-navy-900 text-slate-500"}`}>Front photo {r.frontPhotoKey ? "✓" : "—"}</span>
                <span className={`rounded px-2 py-1 ${r.backPhotoKey ? "bg-amber-500/15 text-amber-400" : "bg-navy-900 text-slate-500"}`}>Back photo {r.backPhotoKey ? "✓" : "—"}</span>
              </div>
              {r.declineReason && <p className="mt-2 text-xs text-bad">Declined: {r.declineReason}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function FieldProfile({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(me.profile.fullName || me.profile.companyName || "");
  const [phone, setPhone] = useState(me.profile.phone || "");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { ProfileAPI } = await import("../lib/tenders");
      return ProfileAPI.update(body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
  async function uploadPhoto(file: File) {
    setPhotoBusy(true);
    try {
      const { uploadFile, ProfileAPI } = await import("../lib/tenders");
      const { key } = await uploadFile(file, "profile-photo");
      await ProfileAPI.update({ photoKey: key });
      setPhotoUrl(URL.createObjectURL(file));
      qc.invalidateQueries({ queryKey: ["me"] });
    } finally { setPhotoBusy(false); }
  }
  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <SectionTitle sub="Your personal details and photo. Your name and agent number identify you on every report and message.">My Profile</SectionTitle>
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-navy-700 text-lg font-semibold text-amber-500">
            {photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : (fullName || "A").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-100">{me.profile.userCode || "—"}</div>
            <div className="text-xs text-slate-500">Agent number: {me.profile.agentNumber || me.profile.userCode || "—"}</div>
            <label className="mt-1 block">
              <input type="file" accept="image/*" disabled={photoBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} className="text-[11px] text-slate-400" />
            </label>
          </div>
        </div>
        <div className="space-y-3">
          <Field label="Full name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
          <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Button variant="amber" disabled={save.isPending} onClick={() => save.mutate({ fullName, phone, companyName: fullName })}>
            {save.isPending ? "Saving…" : "Save profile"}
          </Button>
          {save.isSuccess && <span className="ml-2 text-xs text-good">Saved.</span>}
        </div>
      </Card>
    </div>
  );
}

/** Assigned supplier inspections with masked contact + logged reveal. */
function AssignedInspections() {
  const q = useQuery({ queryKey: ["field-inspections"], queryFn: () => FieldAPI.inspections().then((r) => r.inspections), refetchInterval: 8000 });
  const [revealed, setRevealed] = useState<Record<string, { phone: string; name: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const rows = (q.data ?? []).filter((i: any) => i.supplierId);
  if (!rows.length) return null;
  async function reveal(id: string) {
    setBusy(id); setErr("");
    try { const r = await FieldAPI.revealContact(id); setRevealed((m) => ({ ...m, [id]: r })); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not reveal"); }
    finally { setBusy(null); }
  }
  return (
    <Card className="mb-5 p-5">
      <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">Assigned suppliers — your inspections</div>
      {err && <p className="mb-2 text-xs text-bad">{err}</p>}
      <div className="space-y-2">
        {rows.map((i: any) => (
          <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
            <div>
              <div className="text-slate-100">{i.supplierName} <span className="font-mono text-[11px] text-amber-500/80">{i.supplierCode}</span></div>
              <div className="text-[11px] text-slate-500">
                Contact: {revealed[i.id] ? <span className="text-slate-200">{revealed[i.id].phone || "no phone on file"}</span> : <span className="font-mono">{i.contactMasked || "•••"}</span>}
              </div>
            </div>
            {!revealed[i.id] && (
              <Button variant="ghost" disabled={busy === i.id} onClick={() => reveal(i.id)}>{busy === i.id ? "…" : "Reveal contact"}</Button>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-600">Revealing a contact is logged. You can only see suppliers assigned to you, and only after a Key Account Manager owns the relationship.</p>
    </Card>
  );
}

function Audits() {
  const qc = useQueryClient();
  const assets = useQuery({ queryKey: ["all-assets"], queryFn: async () => (await (await api.assets.$get()).json()).assets });
  const insp = useQuery({ queryKey: ["inspections"], queryFn: async () => (await (await api.inspections.$get()).json()).inspections });
  const [assetId, setAssetId] = useState("");
  const [notes, setNotes] = useState("");
  const [vin, setVin] = useState("");
  const [legit, setLegit] = useState(false);

  const submit = useMutation({
    mutationFn: async () =>
      api.inspections.$post({ json: { assetId, mechanicalNotes: notes, legitimacySignedOff: legit, vinPhotos: vin ? [vin] : [] } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inspections"] });
      setNotes(""); setVin(""); setLegit(false); setAssetId("");
    },
  });

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <SectionTitle sub="On-site mechanical & legal verification of supplier yard assets.">Yard Audit</SectionTitle>
      <AssignedInspections />
      <Card className="p-5">
        <div className="space-y-3">
          <Field label="Asset under inspection">
            <Select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              <option value="">Select asset…</option>
              {(assets.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.assetType} · {a.manufacturer} {a.model} · {a.yardLocation}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="VIN photo reference / chassis read">
            <Input value={vin} onChange={(e) => setVin(e.target.value)} placeholder="Capture / type VIN read" />
          </Field>
          <Field label="Mechanical notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Hours, hydraulics, undercarriage, leaks…"
              className="w-full rounded border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-500"
            />
          </Field>
          <label className="flex items-center gap-3 rounded border border-navy-600 bg-navy-900 p-3 text-sm">
            <input type="checkbox" checked={legit} onChange={(e) => setLegit(e.target.checked)} className="h-4 w-4 accent-amber-500" />
            <span className="text-slate-200">Asset legitimacy verified — approve supplier</span>
          </label>
          <Button variant="amber" className="w-full" disabled={!assetId || submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? "Submitting…" : "Sign off audit"}
          </Button>
        </div>
      </Card>

      <div className="mt-6">
        <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Recent audits</div>
        {(insp.data ?? []).length === 0 ? (
          <Empty>No audits yet.</Empty>
        ) : (
          <div className="space-y-2">
            {(insp.data ?? []).slice(0, 8).map((i) => (
              <Card key={i.id} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <div className="text-slate-200">{i.mechanicalNotes?.slice(0, 40) || "Audit"}</div>
                  <div className="text-xs text-slate-500">{shortDate(i.createdAt)}</div>
                </div>
                <StatusPill status={i.legitimacySignedOff ? "Verified" : "Pending"} />
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BorderLog() {
  const qc = useQueryClient();
  const logs = useQuery({ queryKey: ["border-logs"], queryFn: async () => (await (await api["border-logs"].$get()).json()).logs });
  const [osbp, setOsbp] = useState("Tunduma");
  const [wait, setWait] = useState(0);
  const [note, setNote] = useState("");

  const submit = useMutation({
    mutationFn: async () =>
      api["border-logs"].$post({ json: { osbp, institutionalWaitMinutes: wait, clearanceOverrideNote: note } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["border-logs"] }); setWait(0); setNote(""); },
  });

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <SectionTitle sub="Log institutional wait times & clearance overrides at OSBPs.">Border Liaison Log</SectionTitle>
      <Card className="p-5">
        <div className="space-y-3">
          <Field label="One-Stop Border Post">
            <Select value={osbp} onChange={(e) => setOsbp(e.target.value)}>
              <option>Tunduma</option>
              <option>Namanga</option>
              <option>Rusumo</option>
              <option>Kabanga</option>
            </Select>
          </Field>
          <Field label="Institutional wait (minutes)">
            <Input type="number" value={wait || ""} onChange={(e) => setWait(Number(e.target.value))} placeholder="e.g. 180" />
          </Field>
          <Field label="Clearance override note">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Portal failure resolved in person, TANSAD re-validated…"
              className="w-full rounded border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-500"
            />
          </Field>
          <Button variant="amber" className="w-full" disabled={submit.isPending} onClick={() => submit.mutate()}>
            Log entry
          </Button>
        </div>
      </Card>

      <div className="mt-6 space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">Recent logs</div>
        {(logs.data ?? []).length === 0 ? (
          <Empty>No border logs yet.</Empty>
        ) : (
          (logs.data ?? []).slice(0, 10).map((l) => (
            <Card key={l.id} className="p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-100">{l.osbp}</span>
                <span className={`tnum text-xs ${l.institutionalWaitMinutes > 120 ? "text-amber-500" : "text-slate-400"}`}>
                  {l.institutionalWaitMinutes} min wait
                </span>
              </div>
              {l.clearanceOverrideNote && <div className="mt-1 text-xs text-slate-500">{l.clearanceOverrideNote}</div>}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

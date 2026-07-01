import { useState, useMemo, useEffect, Fragment } from "react";
import { Route, Switch, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { tzs } from "../lib/format";
import type { Me } from "../lib/use-me";
import { TenderAPI, PartsAPI, DocAPI, generateAgreementPDF, generateInvoicePDF } from "../lib/tenders";
import { AppShell, Icons, type NavItem } from "../components/shell";
import { HelpDesk } from "../components/help-desk";
import {
  Button, Card, Field, Input, Select, SectionTitle, StatusPill, Empty, KPIStat,
  StageTracker, Timeline, MessageThread, FileUpload, ManagerCard, PaymentTracker, contractRef,
} from "../components/ui";

const nav: NavItem[] = [
  { label: "Jobs", href: "/app", icon: Icons.grid },
  { label: "Fleet", href: "/app/fleet", icon: Icons.truck },
  { label: "Payments", href: "/app/payments", icon: Icons.vault },
  { label: "Ledger", href: "/app/ledger", icon: Icons.file },
  { label: "Report Breakdown", href: "/app/breakdown", icon: Icons.alert },
  { label: "Profile & Bank", href: "/app/profile", icon: Icons.shield },
];

export default function SupplierApp({ me }: { me: Me }) {
  const tenders = useQuery({ queryKey: ["tenders"], queryFn: () => TenderAPI.list().then((r) => r.tenders) });
  const awarded = (tenders.data ?? []).filter((t: any) => t.status !== "Open");
  const pipeline = awarded.reduce((s: number, t: any) => s + t.flatFairPriceTzs * t.unitsNeeded, 0);

  return (
    <AppShell
      me={me}
      nav={nav}
      ledgerSummary={
        <div className="text-xs text-slate-400">
          Awarded pipeline <span className="ml-1 font-display font-semibold text-good tnum">{tzs(pipeline)}</span>
        </div>
      }
    >
      <Switch>
        <Route path="/app" component={() => <Jobs me={me} />} />
        <Route path="/app/job/:id">{(p) => <JobDetail id={p.id} me={me} />}</Route>
        <Route path="/app/fleet" component={() => <Fleet />} />
        <Route path="/app/payments" component={() => <Payments />} />
        <Route path="/app/ledger" component={() => <Ledger />} />
        <Route path="/app/breakdown" component={() => <Breakdown me={me} />} />
        <Route path="/app/profile" component={() => <ProfileBank me={me} />} />
      </Switch>
      <HelpDesk me={me} />
    </AppShell>
  );
}

function Jobs({ me }: { me: Me }) {
  const [, navigate] = useLocation();
  const q = useQuery({ queryKey: ["tenders"], queryFn: () => TenderAPI.list().then((r) => r.tenders), refetchInterval: 5000 });
  const rows = q.data ?? [];
  const open = rows.filter((r: any) => r.status === "Open");
  const mine = rows.filter((r: any) => r.status !== "Open");

  return (
    <div className="p-6">
      <SectionTitle sub="Bid on open jobs. Track the ones you've been awarded through the staged gate.">Jobs</SectionTitle>
      <ManagerCard managerId={me.profile.managerId} verificationStatus={me.profile.verificationStatus} />
      {me.profile.verificationStatus !== "Verified" && (
        <div className="mb-5 rounded-md border border-amber-600 bg-amber-bg p-3 text-sm text-amber-500">
          Your account is being verified. You can browse open jobs, but you'll be able to bid once your site visit is complete and you're verified.
        </div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPIStat label="Open to bid" value={String(open.length)} />
        <KPIStat label="My awards" value={String(mine.length)} accent={mine.length ? "good" : undefined} />
        <KPIStat label="Executing" value={String(mine.filter((r: any) => r.tenderStage === "Executing").length)} />
        <KPIStat label="Bids placed" value={String(rows.filter((r: any) => r.myBid).length)} />
      </div>

      <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">Open Tenders</div>
      {open.length === 0 ? (
        <Empty>No open jobs right now.</Empty>
      ) : (
        <div className="mb-8 space-y-3">
          {open.map((r: any) => (
            <Card key={r.id} lift className="cursor-pointer p-4" >
              <div onClick={() => navigate(`/app/job/${r.id}`)} className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium text-slate-100">{r.title}</div>
                  <div className="text-xs text-slate-500">{r.carrierOrMachineType} · {r.unitsNeeded} unit{r.unitsNeeded > 1 ? "s" : ""} · {r.origin} → {r.destination}</div>
                  <div className="text-[11px] text-slate-600">
                    {r.demandType === "Machinery"
                      ? `Hire ${r.startDate || "—"} → ${r.endDate || "—"}${r.jobDays ? ` (${r.jobDays} days)` : ""}`
                      : `Need by ${r.needByDate || "—"}${r.transitDays ? ` · ~${r.transitDays}d transit` : ""}`}
                  </div>
                </div>
                {r.myBid ? <StatusPill status={r.myBid.status === "Open" ? "Interested" : r.myBid.status} /> : <span className="text-xs text-amber-500">Bid now →</span>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">My Awards</div>
      {mine.length === 0 ? (
        <Empty>No awards yet.</Empty>
      ) : (
        <div className="space-y-3">
          {mine.map((r: any) => (
            <Card key={r.id} lift className="cursor-pointer p-4">
              <div onClick={() => navigate(`/app/job/${r.id}`)}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-slate-100">{r.title}</div>
                  <StatusPill status={r.status} />
                </div>
                <StageTracker current={r.tenderStage} />
              </div>
            </Card>
          ))}
        </div>
      )}
      <p className="mt-4 text-[11px] text-slate-600">Signed in as {me.profile.companyName}.</p>
    </div>
  );
}

function JobDetail({ id, me }: { id: string; me: Me }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tender", id], queryFn: () => TenderAPI.get(id), refetchInterval: 4000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ["tender", id] });
  const [units, setUnits] = useState(1);
  const [price, setPrice] = useState(0); // cargo flat per-unit
  const [transferFee, setTransferFee] = useState(0); // machinery one-off transfer
  const [dailyRate, setDailyRate] = useState(0); // machinery per-day
  const [note, setNote] = useState("");
  const [availabilityNote, setAvailabilityNote] = useState("");

  const bid = useMutation({
    mutationFn: () =>
      TenderAPI.bid(id, {
        unitsOffered: units,
        pricePerUnitTzs: price,
        transferFeeTzs: transferFee,
        dailyRateTzs: dailyRate,
        note,
        availabilityNote,
      }),
    onSuccess: refresh,
  });
  const advance = useMutation({ mutationFn: (step: string) => TenderAPI.advance(id, step), onSuccess: refresh });
  const send = useMutation({ mutationFn: (body: string) => TenderAPI.sendMessage(id, body), onSuccess: refresh });

  if (q.isLoading || !q.data?.tender) return <div className="p-6 text-slate-500">Loading…</div>;
  const { tender: t, contracts, documents, timeline, messages: thread, client } = q.data;
  const stage = t.tenderStage;
  const isMachinery = t.demandType === "Machinery";
  const jobDays = Math.max(1, t.jobDays || 1);
  // Machinery: derived per-unit price preview = transferFee + dailyRate * jobDays
  const derivedUnitPrice = isMachinery ? transferFee + dailyRate * jobDays : price;
  const myContract = contracts.find((c: any) => c.supplierId === me.profile.id);
  const myBid = (q.data.bids || []).find((b: any) => b.supplierId === me.profile.id);
  const signedDoc = documents.find((d: any) => d.kind === "SignedAgreement");
  const machineDoc = documents.find((d: any) => d.kind === "MachineDoc");
  const operatorIdDoc = documents.find((d: any) => d.kind === "OperatorId");
  const operatorLicenceDoc = documents.find((d: any) => d.kind === "OperatorLicence");

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-100">{t.title}</h1>
          <p className="text-sm text-slate-500">{t.carrierOrMachineType} · {t.unitsNeeded} unit{t.unitsNeeded > 1 ? "s" : ""} · {t.origin} → {t.destination}{t.cargoOrProjectDesc ? ` · ${t.cargoOrProjectDesc}` : ""}</p>
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
          {/* Bidding */}
          {stage === "Bidding" && (
            <Card className="p-5">
              <SectionTitle sub="Offer partial or full quantity. We auto-fill the cheapest bids to a flat fair price.">Place your bid</SectionTitle>
              {isMachinery ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Units you can supply"><Input type="number" min={1} value={units || ""} onChange={(e) => setUnits(Math.max(1, Number(e.target.value)))} /></Field>
                    <Field label="Transfer fee / unit (TZS)"><Input type="number" value={transferFee || ""} onChange={(e) => setTransferFee(Number(e.target.value))} /></Field>
                    <Field label="Daily rate / unit (TZS)"><Input type="number" value={dailyRate || ""} onChange={(e) => setDailyRate(Number(e.target.value))} /></Field>
                  </div>
                  <div className="mt-3 rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Your per-unit total over {jobDays} working days</span>
                      <span className="tnum font-display font-semibold text-amber-500">{tzs(derivedUnitPrice)}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">= transfer {tzs(transferFee)} + {tzs(dailyRate)}/day × {jobDays} days. Rental is billed from transfer through the last working day; the return-to-yard day is not charged.</p>
                  </div>
                </>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Units you can supply"><Input type="number" min={1} value={units || ""} onChange={(e) => setUnits(Math.max(1, Number(e.target.value)))} /></Field>
                  <Field label="Price per unit (TZS)"><Input type="number" value={price || ""} onChange={(e) => setPrice(Number(e.target.value))} /></Field>
                </div>
              )}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Your availability / lead time"><Input value={availabilityNote} onChange={(e) => setAvailabilityNote(e.target.value)} placeholder={isMachinery ? "e.g. can mobilise within 3 days" : "e.g. trucks ready Mon"} /></Field>
                <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Yard, conditions…" /></Field>
              </div>
              <div className="mt-3">
                <Button variant="amber" disabled={(isMachinery ? !dailyRate : !price) || bid.isPending} onClick={() => bid.mutate()}>{myBid ? "Update bid" : "Submit bid"}</Button>
              </div>
              {myBid && (
                <p className="mt-2 text-xs text-good">
                  Your current bid: {myBid.unitsOffered} unit(s) @ {tzs(myBid.pricePerUnitTzs)} per unit
                  {myBid.transferFeeTzs ? ` (transfer ${tzs(myBid.transferFeeTzs)} + ${tzs(myBid.dailyRateTzs)}/day)` : ""} · {myBid.status}
                </p>
              )}
            </Card>
          )}

          {/* Awarded — agreement */}
          {myContract && (() => {
            const ctrValue = myContract.contractValueTzs || myContract.agreedPricePerUnitTzs * myContract.unitsAwarded;
            const supplierFee = Math.round(ctrValue * 0.05);
            const netPayout = ctrValue - supplierFee;
            return (
            <Card className="p-5">
              <SectionTitle sub={`${myContract.unitsAwarded} unit(s) at flat fair ${tzs(myContract.agreedPricePerUnitTzs)} · ${tzs(ctrValue)} value`}>Your award</SectionTitle>

              <div className="mb-4 space-y-1 rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
                <div className="flex justify-between text-slate-400"><span>Contract value</span><span className="tnum">{tzs(ctrValue)}</span></div>
                <div className="flex justify-between text-slate-400"><span>AFRIGEN Link service fee (5%)</span><span className="tnum">− {tzs(supplierFee)}</span></div>
                <div className="flex justify-between border-t border-navy-700 pt-1 font-medium text-slate-100"><span>Your net payout on completion</span><span className="tnum text-good">{tzs(netPayout)}</span></div>
              </div>

              {stage === "AwardConfirmed" && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-400">Download your contract of agreement, sign it, and upload the signed copy.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="subtle" onClick={() => generateAgreementPDF({
                      tenderTitle: t.title, clientName: client?.companyName || "Client", supplierName: me.profile.companyName,
                      unitsAwarded: myContract.unitsAwarded, pricePerUnitTzs: myContract.agreedPricePerUnitTzs,
                      origin: t.origin, destination: t.destination, route: t.routeClassification, contractId: myContract.id,
                      demandType: t.demandType, startDate: t.startDate, endDate: t.endDate, jobDays: t.jobDays,
                      dailyRateTzs: myContract.dailyRateTzs, transferFeeTzs: myContract.transferFeeTzs,
                      needByDate: t.needByDate, transitDays: t.transitDays,
                    })}>Download agreement (PDF)</Button>
                    <FileUpload label="Signed agreement" kind="SignedAgreement" tenderId={id} contractId={myContract.id} onUploaded={refresh} buttonLabel="Upload signed agreement" />
                  </div>
                  {signedDoc && (
                    <Button variant="amber" disabled={advance.isPending} onClick={() => advance.mutate("agreements-signed")}>
                      {advance.isPending ? "Submitting…" : "Confirm agreement signed"}
                    </Button>
                  )}
                </div>
              )}

              {stage === "AgreementsSigned" && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-400">Upload your machine / fleet documents plus the operator's National ID and driving licence. These feed the field inspection and the client's permit stage.</p>
                  <FileUpload label="Machine / fleet docs" kind="MachineDoc" tenderId={id} contractId={myContract.id} onUploaded={refresh} buttonLabel="Upload fleet documents" />
                  <FileUpload label="Operator / driver National ID" kind="OperatorId" tenderId={id} contractId={myContract.id} onUploaded={refresh} buttonLabel="Upload operator National ID" />
                  <FileUpload label="Driving licence" kind="OperatorLicence" tenderId={id} contractId={myContract.id} onUploaded={refresh} buttonLabel="Upload driving licence" />
                  <div className="rounded-md border border-navy-600 bg-navy-900 p-3 text-[11px] text-slate-400">
                    <div className="flex items-center justify-between"><span>Fleet documents</span><span className={machineDoc ? "text-good" : "text-slate-500"}>{machineDoc ? "✓ uploaded" : "required"}</span></div>
                    <div className="flex items-center justify-between"><span>Operator National ID</span><span className={operatorIdDoc ? "text-good" : "text-slate-500"}>{operatorIdDoc ? "✓ uploaded" : "required"}</span></div>
                    <div className="flex items-center justify-between"><span>Driving licence</span><span className={operatorLicenceDoc ? "text-good" : "text-slate-500"}>{operatorLicenceDoc ? "✓ uploaded" : "required"}</span></div>
                  </div>
                  <Button variant="amber" disabled={advance.isPending || !(machineDoc && operatorIdDoc && operatorLicenceDoc)} onClick={() => advance.mutate("machine-docs")}>
                    {advance.isPending ? "Submitting…" : machineDoc && operatorIdDoc && operatorLicenceDoc ? "Submit documents for inspection" : "Upload all three documents first"}
                  </Button>
                </div>
              )}

              {["MachineDocsUploaded", "FieldVerified", "PermitsUploaded", "PermitsVerified", "TTUploaded", "TTConfirmed", "Executing"].includes(stage) && (
                <p className="text-sm text-slate-300">Your part is done — the job is moving through inspection, permits and payment. Track progress in the activity log.</p>
              )}
            </Card>
            );
          })()}

          {myContract && myContract.dailyRateTzs > 0 && (
            <SupplierExtensions contract={myContract} me={me} onDone={refresh} />
          )}

          {documents.length > 0 && (
            <Card className="p-5">
              <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">Documents</div>
              <ul className="space-y-2 text-sm">
                {documents.map((d: any) => (
                  <li key={d.id} className="flex items-center justify-between">
                    <span className="text-slate-300">{d.label || d.kind} <span className="text-[11px] text-slate-500">· {d.kind}</span></span>
                    {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-xs text-amber-500 hover:underline">View ↗</a>}
                  </li>
                ))}
              </ul>
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

/** Supplier view of hire extensions — Accept/Decline + e-sign. */
function SupplierExtensions({ contract, me, onDone }: { contract: any; me: Me; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [declineText, setDeclineText] = useState("");
  const exq = useQuery({ queryKey: ["sup-extensions", contract.id], queryFn: () => TenderAPI.getExtensions(contract.id).then((r) => r.extensions), refetchInterval: 4000 });
  const docq = useQuery({ queryKey: ["sup-contract-docs", contract.id], queryFn: () => DocAPI.list({ contractId: contract.id }).then((r) => r.documents) });
  const exts = exq.data ?? [];
  const active = exts.find((e: any) => !["Declined", "Lapsed", "Paid"].includes(e.status));
  const refresh = () => { exq.refetch(); docq.refetch(); onDone(); };
  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setErr("");
    try { await fn(); refresh(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  if (!active) return null;
  const extDoc = active.contractDocId ? (docq.data ?? []).find((d: any) => d.id === active.contractDocId) : null;
  const net = active.extraAmountTzs - Math.round(active.extraAmountTzs * 0.05);

  return (
    <Card className="p-5">
      <SectionTitle sub="The client asked to keep your machine on site beyond its end date.">Hire extension</SectionTitle>
      <div className="rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
        <div className="mb-2 space-y-1">
          <div className="flex justify-between text-slate-400"><span>Additional days</span><span className="tnum text-slate-200">{active.addedDays} × {contract.unitsAwarded} unit{contract.unitsAwarded > 1 ? "s" : ""}</span></div>
          <div className="flex justify-between text-slate-400"><span>New end date</span><span className="tnum text-slate-200">{active.newEndDate}</span></div>
          <div className="flex justify-between border-t border-navy-700 pt-1 font-medium text-slate-100"><span>Your net payout (after 5% fee)</span><span className="tnum text-good">{tzs(net)}</span></div>
        </div>

        {active.status === "PendingSupplierAcceptance" && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button variant="amber" disabled={busy} onClick={() => run(() => TenderAPI.extendRespond(contract.id, active.id, { accept: true }))}>{busy ? "Working…" : "Accept extension"}</Button>
            </div>
            <div className="flex items-center gap-2">
              <Input value={declineText} onChange={(e) => setDeclineText(e.target.value)} placeholder="Decline reason (optional)" />
              <Button variant="ghost" disabled={busy} onClick={() => run(() => TenderAPI.extendRespond(contract.id, active.id, { accept: false, declineReason: declineText }))}>Decline</Button>
            </div>
          </div>
        )}

        {active.status === "AwaitingSignatures" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded border border-navy-700 bg-navy-800 p-2 text-xs">
              <span className="text-slate-300">Extension contract</span>
              {extDoc?.url ? <a href={extDoc.url} target="_blank" rel="noreferrer" className="text-amber-500 hover:underline">View ↗</a> : <span className="text-slate-500">generating…</span>}
            </div>
            <div className="text-[11px] text-slate-500">Client: {active.clientSignedAt ? <span className="text-good">signed</span> : "pending"} · You: {active.supplierSignedAt ? <span className="text-good">signed as {active.supplierSignedName}</span> : "not signed"}</div>
            {!active.supplierSignedAt ? (
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" className="h-4 w-4 accent-amber-500" disabled={busy} onChange={() => run(() => TenderAPI.extendSign(contract.id, active.id))} />
                I agree &amp; e-sign this extension contract
              </label>
            ) : (
              <div className="text-xs text-good">You signed — awaiting the client's signature.</div>
            )}
          </div>
        )}

        {active.status === "AwaitingKamActivation" && <div className="text-xs text-slate-400">Both parties signed — awaiting manager activation of the payment gateway.</div>}
        {(active.status === "PendingPayment" || active.status === "PaymentPendingConfirmation") && <div className="text-xs text-slate-400">Signed — awaiting the client's payment and AFRIGEN Link confirmation.</div>}
      </div>
      {err && <p className="mt-2 text-xs text-bad">{err}</p>}
    </Card>
  );
}

const ASSET_TYPES = ["Excavator", "Prime Mover", "Tipper Truck", "Bulldozer", "Cargo Truck"];

const FLEET_SORTS: Record<string, string> = {
  newest: "Newest first",
  type: "Type A–Z",
  brand: "Brand A–Z",
  yard: "Yard A–Z",
  rateHigh: "Day-rate high → low",
  rateLow: "Day-rate low → high",
  status: "Status",
};

function statusBucket(a: any): string {
  if (a.onLiveJob) return "On live job";
  if (a.operationalStatus === "Breakdown") return "Breakdown";
  if (a.operationalStatus === "Available") return "Available";
  return "Unavailable";
}

function Fleet() {
  const q = useQuery({
    queryKey: ["my-assets"],
    queryFn: async () => (await (await api.assets.$get({ query: { mine: "1" } })).json()).assets,
    refetchInterval: 120000,
  });
  const [openId, setOpenId] = useState("");
  const rows: any[] = q.data ?? [];

  // ---- controls ----
  const [search, setSearch] = useState("");
  const [fType, setFType] = useState("");
  const [fBrand, setFBrand] = useState("");
  const [fYard, setFYard] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const [groupBy, setGroupBy] = useState("");
  const [view, setView] = useState<"card" | "table">(() => {
    if (typeof localStorage === "undefined") return "card";
    return (localStorage.getItem("fleet-view") as "card" | "table") || "card";
  });
  // Default large fleets to the dense table view (once, on first load).
  const [autoViewSet, setAutoViewSet] = useState(false);
  useEffect(() => {
    if (!autoViewSet && rows.length > 20 && !localStorage.getItem("fleet-view")) {
      setView("table");
    }
    if (rows.length > 0) setAutoViewSet(true);
  }, [rows.length, autoViewSet]);
  useEffect(() => {
    if (typeof localStorage !== "undefined") localStorage.setItem("fleet-view", view);
  }, [view]);

  const distinct = (key: string) => Array.from(new Set(rows.map((r) => r[key]).filter(Boolean))).sort() as string[];
  const types = useMemo(() => distinct("assetType"), [rows]);
  const brands = useMemo(() => distinct("manufacturer"), [rows]);
  const yards = useMemo(() => distinct("yardLocation"), [rows]);

  const hasFilter = !!(search || fType || fBrand || fYard || fStatus);
  const clearFilters = () => { setSearch(""); setFType(""); setFBrand(""); setFYard(""); setFStatus(""); };

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    let out = rows.filter((a) => {
      if (fType && a.assetType !== fType) return false;
      if (fBrand && a.manufacturer !== fBrand) return false;
      if (fYard && a.yardLocation !== fYard) return false;
      if (fStatus && statusBucket(a) !== fStatus) return false;
      if (term) {
        const hay = `${a.assetType} ${a.manufacturer} ${a.model} ${a.vinChassis} ${a.yardLocation}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    const byStr = (k: string) => (x: any, y: any) => String(x[k] || "").localeCompare(String(y[k] || ""));
    out = [...out].sort((a, b) => {
      switch (sort) {
        case "type": return byStr("assetType")(a, b);
        case "brand": return byStr("manufacturer")(a, b) || byStr("model")(a, b);
        case "yard": return byStr("yardLocation")(a, b);
        case "rateHigh": return (b.dayRateTzs || 0) - (a.dayRateTzs || 0);
        case "rateLow": return (a.dayRateTzs || 0) - (b.dayRateTzs || 0);
        case "status": return statusBucket(a).localeCompare(statusBucket(b));
        default: return 0; // newest = keep server order (already desc by createdAt)
      }
    });
    return out;
  }, [rows, search, fType, fBrand, fYard, fStatus, sort]);

  // Grouping (table view only)
  const groups = useMemo(() => {
    if (!groupBy) return [{ key: "", label: "", items: visible }];
    const keyFn = (a: any) => (groupBy === "yard" ? a.yardLocation : groupBy === "type" ? a.assetType : a.manufacturer) || "Unspecified";
    const map = new Map<string, any[]>();
    visible.forEach((a) => { const k = keyFn(a); if (!map.has(k)) map.set(k, []); map.get(k)!.push(a); });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([key, items]) => ({ key, label: key, items }));
  }, [visible, groupBy]);

  return (
    <div className="p-6">
      <div className="mb-4">
        <SectionTitle
          sub="Your fleet is built and verified by AFRIGEN Link field agents during inspection — you cannot edit or remove assets here. Each machine shows its live status and job history."
          action={
            <div className="flex overflow-hidden rounded-lg border border-navy-600">
              <button
                onClick={() => setView("card")}
                className={`grid h-8 w-9 place-items-center ${view === "card" ? "bg-navy-700 text-amber-500" : "text-slate-500 hover:text-slate-300"}`}
                title="Card view"
              >{Icons.grid}</button>
              <button
                onClick={() => setView("table")}
                className={`grid h-8 w-9 place-items-center border-l border-navy-600 ${view === "table" ? "bg-navy-700 text-amber-500" : "text-slate-500 hover:text-slate-300"}`}
                title="Table view"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              </button>
            </div>
          }
        >My Fleet</SectionTitle>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPIStat label="Assets" value={String(rows.length)} />
        <KPIStat label="Available" value={String(rows.filter((r) => r.operationalStatus === "Available").length)} accent="good" />
        <KPIStat label="On live job" value={String(rows.filter((r) => r.onLiveJob).length)} />
        <KPIStat label="Breakdown" value={String(rows.filter((r) => r.operationalStatus === "Breakdown").length)} accent="amber" />
      </div>

      {rows.length === 0 ? (
        <Empty>No assets yet. Your fleet appears here once an AFRIGEN Link field agent inspects and verifies a machine.</Empty>
      ) : (
        <>
          {/* ---- controls ---- */}
          <Card className="mb-4 p-4">
            <div className="grid gap-3 md:grid-cols-6">
              <div className="md:col-span-2">
                <Input placeholder="Search brand, model, type, VIN, yard…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={fType} onChange={(e) => setFType(e.target.value)}>
                <option value="">All types</option>
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
              <Select value={fBrand} onChange={(e) => setFBrand(e.target.value)}>
                <option value="">All brands</option>
                {brands.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
              <Select value={fYard} onChange={(e) => setFYard(e.target.value)}>
                <option value="">All locations</option>
                {yards.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
              <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                <option value="">All statuses</option>
                {["Available", "On live job", "Breakdown", "Unavailable"].map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-500">
                Sort
                <Select value={sort} onChange={(e) => setSort(e.target.value)} className="!w-auto">
                  {Object.entries(FLEET_SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </label>
              {view === "table" && (
                <label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-500">
                  Group by
                  <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="!w-auto">
                    <option value="">None</option>
                    <option value="yard">Yard</option>
                    <option value="type">Type</option>
                    <option value="brand">Brand</option>
                  </Select>
                </label>
              )}
              <span className="ml-auto text-xs text-slate-500">
                Showing <span className="text-slate-300 tnum">{visible.length}</span> of <span className="tnum">{rows.length}</span> assets
              </span>
              {hasFilter && (
                <button onClick={clearFilters} className="text-xs text-amber-500 hover:underline">Clear filters</button>
              )}
            </div>
          </Card>

          {visible.length === 0 ? (
            <Empty>No assets match your filters. <button onClick={clearFilters} className="text-amber-500 hover:underline">Clear filters</button></Empty>
          ) : view === "card" ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {visible.map((a) => <FleetCard key={a.id} a={a} openId={openId} setOpenId={setOpenId} />)}
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map((g) => (
                <div key={g.key || "all"}>
                  {g.label && (
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {g.label} <span className="rounded bg-navy-700 px-1.5 py-0.5 text-slate-500 tnum">{g.items.length}</span>
                    </div>
                  )}
                  <FleetTable rows={g.items} openId={openId} setOpenId={setOpenId} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FleetCard({ a, openId, setOpenId }: { a: any; openId: string; setOpenId: (v: string) => void }) {
  const photos: string[] = a.photos ?? [];
  return (
    <Card className={`overflow-hidden p-0 ${a.doubleEntry ? "ring-1 ring-bad" : ""}`}>
      {photos.length > 0 ? (
        <div className="grid grid-cols-2 gap-px bg-navy-600">
          {photos.slice(0, 2).map((src, i) => (
            <img key={i} src={src} alt={`${a.assetType} ${i === 0 ? "front" : "back"}`} className="aspect-video w-full object-cover" />
          ))}
        </div>
      ) : (
        <div className="grid aspect-video place-items-center bg-navy-900 text-xs text-slate-600">No inspection photos yet</div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-display font-semibold text-slate-100">{a.assetType}</div>
            <div className="text-sm text-slate-400">{a.manufacturer} {a.model}</div>
          </div>
          <StatusPill status={a.operationalStatus} />
        </div>
        {a.doubleEntry && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-bad/50 bg-bad/10 px-2 py-1.5 text-[11px] text-bad">
            {Icons.alert}<span>Double-entry: committed to {a.liveJobCount} live jobs at once.</span>
          </div>
        )}
        <div className="mt-3 space-y-1 text-xs text-slate-500">
          <div>Engine: {a.engineSerial || "—"}</div>
          <div>VIN/Chassis: {a.vinChassis || "—"}</div>
          <div>Yard: {a.yardLocation || "—"}</div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-navy-600 pt-3">
          <button className="text-xs text-amber-500 hover:underline" onClick={() => setOpenId(openId === a.id ? "" : a.id)}>
            {openId === a.id ? "Hide" : "View"} jobs ({a.jobs?.length ?? 0})
          </button>
          <span className="font-display font-semibold text-slate-100 tnum">{tzs(a.dayRateTzs)}/day</span>
        </div>
        {openId === a.id && (
          <div className="mt-2 space-y-1.5 border-t border-navy-600 pt-2">
            {(a.jobs ?? []).length === 0 ? (
              <p className="text-[11px] text-slate-500">No jobs yet.</p>
            ) : (a.jobs as any[]).map((j) => (
              <div key={j.id} className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300">{j.title || "Job"}{j.destination ? ` → ${j.destination}` : ""}</span>
                <StatusPill status={j.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function FleetTable({ rows, openId, setOpenId }: { rows: any[]; openId: string; setOpenId: (v: string) => void }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-600 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2 font-medium">Machine</th>
              <th className="px-3 py-2 font-medium">Brand / Model</th>
              <th className="px-3 py-2 font-medium">VIN / Chassis</th>
              <th className="px-3 py-2 font-medium">Yard</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Day-rate</th>
              <th className="px-3 py-2 font-medium">Jobs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const photos: string[] = a.photos ?? [];
              const open = openId === a.id;
              return (
                <Fragment key={a.id}>
                  <tr className={`border-b border-navy-700/60 hover:bg-navy-800/40 ${a.doubleEntry ? "bg-bad/5" : ""}`}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {photos[0] ? (
                          <img src={photos[0]} alt="" className="h-9 w-14 shrink-0 rounded object-cover" />
                        ) : (
                          <div className="grid h-9 w-14 shrink-0 place-items-center rounded bg-navy-900 text-[9px] text-slate-600">no photo</div>
                        )}
                        <div>
                          <div className="font-medium text-slate-100">{a.assetType}</div>
                          {a.doubleEntry && <div className="flex items-center gap-1 text-[10px] text-bad">{Icons.alert}<span>double-entry ×{a.liveJobCount}</span></div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-300">{a.manufacturer} {a.model}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-400">{a.vinChassis || "—"}</td>
                    <td className="px-3 py-2 text-slate-300">{a.yardLocation || "—"}</td>
                    <td className="px-3 py-2"><StatusPill status={a.operationalStatus} /></td>
                    <td className="px-3 py-2 text-right font-display font-semibold text-slate-100 tnum">{tzs(a.dayRateTzs)}<span className="text-[10px] text-slate-500">/day</span></td>
                    <td className="px-3 py-2">
                      <button className="text-xs text-amber-500 hover:underline" onClick={() => setOpenId(open ? "" : a.id)}>
                        {open ? "Hide" : "View"} ({a.jobs?.length ?? 0})
                      </button>
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-navy-700/60 bg-navy-900/40">
                      <td colSpan={7} className="px-3 py-2">
                        {(a.jobs ?? []).length === 0 ? (
                          <p className="text-[11px] text-slate-500">No jobs yet.</p>
                        ) : (
                          <div className="space-y-1">
                            {(a.jobs as any[]).map((j) => (
                              <div key={j.id} className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-300">{j.title || "Job"}{j.destination ? ` → ${j.destination}` : ""}</span>
                                <StatusPill status={j.status} />
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Ledger() {
  const q = useQuery({ queryKey: ["contracts"], queryFn: async () => (await (await api.contracts.$get()).json()).contracts });
  const revQ = useQuery({ queryKey: ["supplier-reversals"], queryFn: () => TenderAPI.listReversals().then((r) => r.reversals), refetchInterval: 10000 });
  const [record, setRecord] = useState<any | null>(null);
  const rows = q.data ?? [];
  const reversals = (revQ.data ?? []).filter((r) => r.status === "Executed" && (r.supplierPenaltyTzs || r.transferFeeKeptTzs));
  const titleFor = (cid: string) => rows.find((c) => c.id === cid)?.title || cid;
  const paidOut = rows.filter((r) => r.milestoneStatus === "FundsDisbursed").reduce((s, r) => s + (r.supplierPayoutTzs || 0), 0);
  const creditUsed = rows.reduce((s, r) => s + (r.emergencyCreditDeductedTzs || 0), 0);
  const lockedEscrow = rows.filter((r) => r.milestoneStatus !== "FundsDisbursed").reduce((s, r) => s + (r.totalEscrowBalanceTzs || 0), 0);

  async function downloadInvoice(contractId: string, r: any) {
    const res = await (await api.invoices[":contractId"].$get({ param: { contractId } })).json();
    const inv = (res.invoices as any[]).find((i) => i.party === "Supplier");
    if (inv) generateInvoicePDF(inv, { title: r.title, origin: r.origin, destination: r.destination, routeClassification: r.routeClassification });
  }

  return (
    <div className="p-6">
      <SectionTitle sub="Your awards, escrow held, emergency parts credit used, and payouts.">Ledger</SectionTitle>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPIStat label="Locked escrow" value={tzs(lockedEscrow)} accent="amber" />
        <KPIStat label="Paid out" value={tzs(paidOut)} accent="good" />
        <KPIStat label="Parts credit used" value={tzs(creditUsed)} accent={creditUsed ? "amber" : undefined} />
        <KPIStat label="Contracts" value={String(rows.length)} />
      </div>
      {rows.length === 0 ? <Empty>No contracts yet.</Empty> : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-600 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Ref</th>
                <th className="px-4 py-3">Contract</th>
                <th className="px-4 py-3 text-right">Locked escrow</th>
                <th className="px-4 py-3 text-right">Parts credit</th>
                <th className="px-4 py-3 text-right">Net payout</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-navy-700">
                  <td className="px-4 py-3">
                    <button onClick={() => setRecord(r)} className="tnum text-xs text-amber-500 hover:underline">{contractRef(r.id)}</button>
                  </td>
                  <td className="px-4 py-3 text-slate-100">{r.title}</td>
                  <td className="px-4 py-3 text-right tnum text-slate-200">{tzs(r.totalEscrowBalanceTzs)}</td>
                  <td className={`px-4 py-3 text-right tnum ${r.emergencyCreditDeductedTzs ? "text-amber-500" : "text-slate-500"}`}>
                    {r.emergencyCreditDeductedTzs ? tzs(-r.emergencyCreditDeductedTzs) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tnum text-good">{r.milestoneStatus === "FundsDisbursed" ? tzs(r.supplierPayoutTzs) : "pending"}</td>
                  <td className="px-4 py-3"><StatusPill status={r.milestoneStatus} /></td>
                  <td className="px-4 py-3 text-right">
                    {r.milestoneStatus === "FundsDisbursed" && <button onClick={() => downloadInvoice(r.id, r)} className="text-xs text-amber-500 hover:underline">Invoice ↓</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {reversals.length > 0 && (
        <div className="mt-8">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Cancellations & shortened hires</div>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-600 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Ref</th><th className="px-4 py-3">Contract</th><th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Penalty kept</th><th className="px-4 py-3 text-right">Transfer kept</th>
                  <th className="px-4 py-3 text-right">Net to you</th>
                </tr>
              </thead>
              <tbody>
                {reversals.map((r) => (
                  <tr key={r.id} className="border-b border-navy-700">
                    <td className="px-4 py-3 tnum text-xs text-slate-400">{contractRef(r.contractId)}</td>
                    <td className="px-4 py-3 text-slate-100">{titleFor(r.contractId)}</td>
                    <td className="px-4 py-3 text-slate-300">{r.reason}</td>
                    <td className="px-4 py-3 text-right tnum text-slate-200">{r.supplierPenaltyTzs ? tzs(r.supplierPenaltyTzs) : "—"}</td>
                    <td className="px-4 py-3 text-right tnum text-slate-200">{r.transferFeeKeptTzs ? tzs(r.transferFeeKeptTzs) : "—"}</td>
                    <td className="px-4 py-3 text-right tnum text-good">{tzs((r.supplierPenaltyTzs || 0) + (r.transferFeeKeptTzs || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
      {record && <ContractRecordModal contract={record} onClose={() => setRecord(null)} onInvoice={downloadInvoice} />}
    </div>
  );
}

/** Full transaction record for one contract — details, settlement, spare orders, invoice. */
function ContractRecordModal({ contract: r, onClose, onInvoice }: { contract: any; onClose: () => void; onInvoice: (id: string, r: any) => void }) {
  const orders = useQuery({ queryKey: ["my-part-orders"], queryFn: () => PartsAPI.orders().then((res) => res.orders) });
  const partsDebt = r.emergencyCreditDeductedTzs || 0;
  const value = r.contractValueTzs || r.totalEscrowBalanceTzs || 0;
  const fee = Math.round(value * 0.05);
  const net = r.supplierPayoutTzs ?? Math.round(value * 0.95 - partsDebt);
  const myOrders = (orders.data ?? []).filter((o: any) => o.contractId === r.id);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <Card className="max-h-[88vh] w-full max-w-2xl overflow-y-auto p-6" onClick={(e: any) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold text-slate-100">{r.title}</h3>
            <div className="tnum text-[11px] uppercase tracking-wider text-amber-500">{contractRef(r.id)}</div>
          </div>
          <StatusPill status={r.milestoneStatus} />
        </div>
        <div className="mt-4 grid gap-2 rounded-md border border-navy-600 bg-navy-900 p-4 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Route</span><span className="text-slate-200">{r.origin} → {r.destination}{r.routeClassification ? ` · ${r.routeClassification}` : ""}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Locked escrow (monitored, not held)</span><span className="tnum text-slate-200">{tzs(r.totalEscrowBalanceTzs)}</span></div>
        </div>
        <div className="mt-4">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Settlement</div>
          <div className="grid gap-2 rounded-md border border-navy-600 bg-navy-900 p-4 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Contract value</span><span className="tnum text-slate-200">{tzs(value)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Service fee (5%, deducted at settlement)</span><span className="tnum text-slate-300">− {tzs(fee)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Emergency parts credit</span><span className={`tnum ${partsDebt ? "text-amber-500" : "text-slate-500"}`}>{partsDebt ? `− ${tzs(partsDebt)}` : "None"}</span></div>
            <div className="flex justify-between border-t border-navy-700 pt-2 font-medium"><span className="text-slate-300">Net payout</span><span className="tnum text-good">{tzs(net)}</span></div>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Spare orders on this contract</div>
          {myOrders.length === 0 ? <p className="text-sm text-slate-500">No spare orders on this contract.</p> : (
            <div className="space-y-2">
              {myOrders.map((o: any) => (
                <div key={o.id} className="flex items-center justify-between rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
                  <div>
                    <div className="text-slate-100">{o.part?.partName ?? "Spare part"} <span className="text-[11px] text-slate-500">×{o.qty ?? 1}</span></div>
                    <div className="text-[11px] text-slate-500">{o.deliverTo === "FieldAgent" ? "To field agent" : "To my team"}{o.waybillRef ? ` · ${o.courier} waybill ${o.waybillRef}` : ""}</div>
                  </div>
                  <StatusPill status={o.status} />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          {r.milestoneStatus === "FundsDisbursed" && <Button variant="ghost" onClick={() => onInvoice(r.id, r)}>Invoice ↓</Button>}
          <Button variant="amber" onClick={onClose}>Close</Button>
        </div>
      </Card>
    </div>
  );
}

/** Supplier payment desk: mark a finished job complete (step 1), then track the release chain. */
function Payments() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["contracts"], queryFn: async () => (await (await api.contracts.$get()).json()).contracts as any[], refetchInterval: 5000 });
  const rows = (q.data ?? []).filter((c) =>
    ["ActiveTransit", "BreakdownIncident"].includes(c.milestoneStatus) ||
    (c.payoutStatus && c.payoutStatus !== "None")
  );
  return (
    <div className="p-6">
      <SectionTitle sub="When you finish a job, mark it complete. The client signs off, your Key Account Manager submits the payment, and an admin approves the release — you can follow every step here.">Payments</SectionTitle>
      {rows.length === 0 ? <Empty>No active jobs or payments yet.</Empty> : (
        <div className="space-y-3">
          {rows.map((c) => <SupplierPayout key={c.id} contract={c} onDone={() => qc.invalidateQueries({ queryKey: ["contracts"] })} />)}
        </div>
      )}
    </div>
  );
}

function SupplierPayout({ contract, onDone }: { contract: any; onDone: () => void }) {
  const [remarks, setRemarks] = useState("");
  const complete = useMutation({ mutationFn: () => TenderAPI.markComplete(contract.id, remarks), onSuccess: onDone });
  const canComplete = (!contract.payoutStatus || contract.payoutStatus === "None") && ["ActiveTransit", "BreakdownIncident"].includes(contract.milestoneStatus);
  const value = contract.contractValueTzs || contract.totalEscrowBalanceTzs || 0;
  const partsDebt = contract.emergencyCreditDeductedTzs || 0;
  const net = contract.supplierPayoutTzs ?? Math.round(value * 0.95 - partsDebt);
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="font-medium text-slate-100">{contract.title}</div>
          <div className="tnum text-[11px] uppercase tracking-wider text-slate-500">{contractRef(contract.id)}</div>
        </div>
        <StatusPill status={contract.payoutStatus === "Approved" ? "Settled" : contract.payoutStatus === "None" || !contract.payoutStatus ? "In progress" : "Payout in progress"} />
      </div>
      <div className="mb-3 grid grid-cols-3 gap-3 rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Contract value</div>
          <div className="tnum text-slate-200">{tzs(value)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Spare-parts debt</div>
          <div className={`tnum ${partsDebt ? "text-amber-500" : "text-slate-500"}`}>{partsDebt ? `− ${tzs(partsDebt)}` : "None"}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Net payout</div>
          <div className="tnum text-good">{tzs(net)}</div>
        </div>
      </div>
      <p className="mb-3 text-[11px] text-slate-500">Net payout is your contract value less the 5% service fee deducted at settlement{partsDebt ? ", and any emergency spare-parts credit drawn against the monitored escrow" : ""}.</p>
      <div className="mb-3"><PaymentTracker payoutStatus={contract.payoutStatus} /></div>
      {canComplete ? (
        <div className="space-y-2 rounded-md border border-amber-600/40 bg-amber-bg/40 p-3">
          <Field label="Completion remarks (optional)">
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Delivered on site, handover signed." />
          </Field>
          <Button variant="amber" disabled={complete.isPending} onClick={() => complete.mutate()}>{complete.isPending ? "Submitting…" : "Mark task complete"}</Button>
          {complete.error && <p className="text-xs text-bad">{(complete.error as Error).message}</p>}
        </div>
      ) : contract.payoutStatus === "Approved" ? (
        <p className="text-sm text-good">Payment released and settled.</p>
      ) : (
        <p className="text-sm text-slate-500">Task marked complete — awaiting the client, your manager and admin to release payment.</p>
      )}
    </Card>
  );
}

/** Emergency spare request — supplier searches catalogue, sees retail, requests; routed POS chain. */
function Breakdown({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [contractId, setContractId] = useState("");
  const [query, setQuery] = useState("");
  const [selectedPartId, setSelectedPartId] = useState("");
  const [deliverTo, setDeliverTo] = useState<"MachineSupplier" | "FieldAgent">("MachineSupplier");
  const [qty, setQty] = useState(1);
  const [receiverName, setReceiverName] = useState("");
  const [receiverDestination, setReceiverDestination] = useState("");

  const contracts = useQuery({ queryKey: ["contracts"], queryFn: async () => (await (await api.contracts.$get()).json()).contracts });
  const parts = useQuery({ queryKey: ["parts-inventory"], queryFn: () => PartsAPI.search().then((r) => r.parts) });
  const orders = useQuery({ queryKey: ["my-part-orders"], queryFn: () => PartsAPI.orders().then((r) => r.orders), refetchInterval: 5000 });
  const request = useMutation({
    mutationFn: (partId: string) => PartsAPI.reportBreakdown(contractId, partId, { deliverTo, qty, receiverName, receiverDestination }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-part-orders"] }); qc.invalidateQueries({ queryKey: ["contracts"] }); setReceiverName(""); setReceiverDestination(""); setQty(1); setSelectedPartId(""); },
  });

  const activeContracts = (contracts.data ?? []).filter((c) => ["ActiveTransit", "BreakdownIncident"].includes(c.milestoneStatus));
  const selContract = activeContracts.find((c) => c.id === contractId);
  const escrowAvail = selContract ? selContract.totalEscrowBalanceTzs - selContract.emergencyCreditDeductedTzs : 0;
  const inStock = (parts.data ?? []).filter((p: any) => p.status !== "OutOfStock" && p.stockQty > 0);
  const ql = query.trim().toLowerCase();
  const filtered = ql
    ? inStock.filter((p: any) => [p.partName, p.sku, p.compatibleModel].some((v: string) => (v || "").toLowerCase().includes(ql)))
    : inStock;
  const selectedPart = inStock.find((p: any) => p.id === selectedPartId);

  return (
    <div className="p-6">
      <div className="mb-4 rounded-md border border-amber-600 bg-amber-bg p-4">
        <div className="flex items-center gap-2 text-amber-500">{Icons.alert}<span className="font-display font-semibold">Report Breakdown / Request On-Site Spare Part</span></div>
        <p className="mt-1 text-sm text-slate-400">Search a spare, see its retail price, and approve the order. Your Key Account Manager checks the locked escrow covers it, then routes it to a parts supplier for dispatch.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-amber-600/50 p-5">
          <div className="space-y-3">
            <Field label="Affected contract (active transit)">
              <Select value={contractId} onChange={(e) => setContractId(e.target.value)}>
                <option value="">Select contract…</option>
                {activeContracts.map((c) => <option key={c.id} value={c.id}>{c.title} · escrow {tzs(c.totalEscrowBalanceTzs)}</option>)}
              </Select>
            </Field>
            {selContract && (
              <div className="rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
                <div className="flex justify-between text-slate-400"><span>Escrow available for parts</span><span className="tnum text-amber-500">{tzs(escrowAvail)}</span></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Deliver to">
                <Select value={deliverTo} onChange={(e) => setDeliverTo(e.target.value as any)}>
                  <option value="MachineSupplier">My team (machine supplier)</option>
                  <option value="FieldAgent">Field agent on site</option>
                </Select>
              </Field>
              <Field label="Quantity">
                <Input type="number" min={1} value={qty || ""} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Receiver name"><Input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder="Who receives on site" /></Field>
              <Field label="Destination"><Input value={receiverDestination} onChange={(e) => setReceiverDestination(e.target.value)} placeholder="Site / yard / town" /></Field>
            </div>
            <Field label="Filter the parts catalogue (optional)"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type to narrow by name, code or model…" /></Field>
            <Field label="Select spare part from inventory">
              <Select value={selectedPartId} onChange={(e) => setSelectedPartId(e.target.value)}>
                <option value="">{filtered.length === 0 ? "No matching in-stock spares" : "Choose a spare part…"}</option>
                {filtered.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.partName} · {p.compatibleModel} · {tzs(p.retailCostTzs + p.logisticsHandlingFeeTzs)} · stock {p.stockQty}</option>
                ))}
              </Select>
            </Field>
            <p className="text-[11px] text-slate-500">Spares are drawn live from the parts suppliers' inventory. In-stock items only.</p>
            {selectedPart && (
              <div className="flex items-center justify-between rounded-md border border-amber-600/50 bg-navy-900 p-3 text-sm">
                <div>
                  <div className="text-slate-100">{selectedPart.partName} <span className="text-[11px] text-slate-500">{selectedPart.compatibleModel}{selectedPart.sku ? ` · ${selectedPart.sku}` : ""}</span></div>
                  <div className="text-[11px] text-slate-500">Retail {tzs(selectedPart.retailCostTzs)} + handling {tzs(selectedPart.logisticsHandlingFeeTzs)} = {tzs(selectedPart.retailCostTzs + selectedPart.logisticsHandlingFeeTzs)} · stock {selectedPart.stockQty}</div>
                </div>
                <Button variant="amber" disabled={!contractId || request.isPending} onClick={() => request.mutate(selectedPart.id)}>Approve order</Button>
              </div>
            )}
            {request.error && <p className="text-xs text-bad">{(request.error as Error).message}</p>}
            {request.isSuccess && <p className="text-xs text-good">Request sent to your Key Account Manager.</p>}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">My spare orders</div>
          {(orders.data ?? []).length === 0 ? <Empty>No spare orders yet.</Empty> : (
            <div className="space-y-2">
              {(orders.data ?? []).map((o: any) => (
                <div key={o.id} className="rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-100">{o.part?.partName ?? "Spare part"}</span>
                    <StatusPill status={o.status} />
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Qty {o.qty ?? 1}{o.contractTitle ? ` · ${o.contractTitle}` : ""}
                    {o.deliverTo === "FieldAgent" ? " · to field agent" : " · to my team"}
                    {o.status === "Rejected" && o.rejectReason ? ` · ${o.rejectReason}` : ""}
                    {o.waybillRef ? ` · ${o.courier} waybill ${o.waybillRef}` : ""}
                  </div>
                  {(o.receiverName || o.receiverDestination) && (
                    <div className="mt-0.5 text-[11px] text-slate-500">Deliver to {o.receiverName || "—"}{o.receiverDestination ? ` @ ${o.receiverDestination}` : ""}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function ProfileBank({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    companyName: me.profile.companyName || "",
    phone: me.profile.phone || "",
    bankName: me.profile.bankName || "",
    bankAccountName: me.profile.bankAccountName || "",
    bankAccountNo: me.profile.bankAccountNo || "",
    bankSwift: me.profile.bankSwift || "",
    bankBranch: me.profile.bankBranch || "",
  });
  const save = useMutation({
    mutationFn: async () => { const { ProfileAPI } = await import("../lib/tenders"); return ProfileAPI.update(f); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
  return (
    <div className="mx-auto max-w-2xl p-6">
      <SectionTitle sub="Your company details and the bank account AFRIGEN Link pays into on settlement. Keep this accurate — the Key Account Manager uses it at payout.">Profile & Bank Details</SectionTitle>
      <Card className="mb-4 p-5">
        <div className="mb-2 text-sm text-slate-400">User ID: <span className="font-mono text-amber-500">{me.profile.userCode || "—"}</span></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Company name"><Input value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        </div>
      </Card>
      <Card className="p-5">
        <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">Payout bank account</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bank name"><Input value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} placeholder="CRDB / NMB…" /></Field>
          <Field label="Account name"><Input value={f.bankAccountName} onChange={(e) => setF({ ...f, bankAccountName: e.target.value })} /></Field>
          <Field label="Account number"><Input value={f.bankAccountNo} onChange={(e) => setF({ ...f, bankAccountNo: e.target.value })} /></Field>
          <Field label="SWIFT"><Input value={f.bankSwift} onChange={(e) => setF({ ...f, bankSwift: e.target.value })} /></Field>
          <Field label="Branch"><Input value={f.bankBranch} onChange={(e) => setF({ ...f, bankBranch: e.target.value })} /></Field>
        </div>
        <Button className="mt-4" variant="amber" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save details"}</Button>
        {save.isSuccess && <span className="ml-2 text-xs text-good">Saved.</span>}
      </Card>
    </div>
  );
}

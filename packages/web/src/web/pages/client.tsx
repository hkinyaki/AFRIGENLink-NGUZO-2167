import { useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tzs } from "../lib/format";
import type { Me } from "../lib/use-me";
import { TenderAPI, DocAPI, generateAgreementPDF, generateInvoicePDF, generateBankPDF } from "../lib/tenders";
import { api } from "../lib/api";
import { DEMAND_TYPES, typeOptions, ROUTE_OPTIONS, type DemandType } from "../constants/asset-types";
import { AppShell, Icons, type NavItem } from "../components/shell";
import { ProfilePage } from "../components/profile-page";
import { HelpDesk } from "../components/help-desk";
import {
  Button, Card, Field, Input, Select, SectionTitle, StatusPill, Empty, KPIStat,
  StageTracker, Timeline, MessageThread, FileUpload, PaymentTracker,
} from "../components/ui";

const nav: NavItem[] = [
  { label: "My Jobs", href: "/app", icon: Icons.grid },
  { label: "Post a Job", href: "/app/new", icon: Icons.file },
  { label: "Ledger", href: "/app/ledger", icon: Icons.vault },
];

export default function ClientApp({ me }: { me: Me }) {
  const q = useQuery({ queryKey: ["tenders"], queryFn: () => TenderAPI.list().then((r) => r.tenders) });
  const rows = q.data ?? [];
  const escrowPreview = rows
    .filter((t) => ["TTUploaded", "TTConfirmed", "Executing"].includes(t.tenderStage))
    .reduce((s, t) => {
      const base = t.flatFairPriceTzs * t.unitsNeeded;
      return s + base + Math.round(base * 0.05); // value + 5% client fee
    }, 0);

  return (
    <AppShell
      me={me}
      nav={nav}
      ledgerSummary={
        <div className="text-xs text-slate-400">
          Monitored <span className="ml-1 font-display font-semibold text-amber-500 tnum">{tzs(escrowPreview)}</span>
        </div>
      }
    >
      <Switch>
        <Route path="/app" component={() => <Jobs me={me} />} />
        <Route path="/app/new" component={() => <PostJob />} />
        <Route path="/app/ledger" component={() => <Ledger />} />
        <Route path="/app/job/:id">{(p) => <JobDetail id={p.id} me={me} />}</Route>
        <Route path="/app/profile" component={() => <ProfilePage me={me} />} />
      </Switch>
      <HelpDesk me={me} />
    </AppShell>
  );
}

function Jobs({ me }: { me: Me }) {
  const [, navigate] = useLocation();
  const q = useQuery({ queryKey: ["tenders"], queryFn: () => TenderAPI.list().then((r) => r.tenders) });
  const rows = q.data ?? [];
  const open = rows.filter((r) => r.status === "Open").length;
  const executing = rows.filter((r) => r.tenderStage === "Executing").length;

  return (
    <div className="p-6">
      <SectionTitle sub="Post demand for cargo transport or machinery. Suppliers bid; we auto-fill the best." action={<Button variant="amber" onClick={() => navigate("/app/new")}>Post a Job</Button>}>
        My Jobs
      </SectionTitle>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPIStat label="Total Jobs" value={String(rows.length)} />
        <KPIStat label="Taking Bids" value={String(open)} />
        <KPIStat label="In Execution" value={String(executing)} accent={executing ? "good" : undefined} />
        <KPIStat label="Completed" value={String(rows.filter((r) => r.status === "Completed").length)} accent="good" />
      </div>

      {rows.length === 0 ? (
        <Empty>
          No jobs yet.{" "}
          <button className="text-amber-500 underline" onClick={() => navigate("/app/new")}>Post your first job</button>
        </Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} lift className="cursor-pointer p-4" >
              <div onClick={() => navigate(`/app/job/${r.id}`)}>
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-100">{r.title}</div>
                    <div className="text-xs text-slate-500">
                      {r.demandType === "CargoCarrier" ? "Cargo" : "Machinery"} · {r.carrierOrMachineType} · {r.unitsNeeded} unit{r.unitsNeeded > 1 ? "s" : ""} · {r.origin} → {r.destination}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={r.routeClassification === "CrossBorder" ? "text-xs text-amber-500" : "text-xs text-slate-500"}>
                      {r.routeClassification === "CrossBorder" ? "Cross-Border" : "Domestic"}
                    </span>
                    <StatusPill status={r.status} />
                  </div>
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

function PostJob() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [demandType, setDemandType] = useState<DemandType>("Machinery");
  const [carrierOrMachineType, setType] = useState("");
  const [desc, setDesc] = useState("");
  const [units, setUnits] = useState(1);
  const [route, setRoute] = useState<"Domestic" | "CrossBorder">("Domestic");
  const [origin, setOrigin] = useState("Dar es Salaam");
  const [destination, setDestination] = useState("");
  const [title, setTitle] = useState("");
  // timing — cargo
  const [needByDate, setNeedByDate] = useState("");
  const [transitDays, setTransitDays] = useState(0);
  // timing — machinery
  const [startDate, setStartDate] = useState("");
  const [jobDays, setJobDays] = useState(0);
  const [estTransferDays, setEstTransferDays] = useState(0);

  // Machinery end date = start + (jobDays - 1) = last working day (return-to-yard day excluded)
  const computedEnd = (() => {
    if (demandType !== "Machinery" || !startDate || jobDays < 1) return "";
    const d = new Date(startDate + "T00:00:00Z");
    if (isNaN(d.getTime())) return "";
    d.setUTCDate(d.getUTCDate() + jobDays - 1);
    return d.toISOString().slice(0, 10);
  })();

  const timingValid =
    demandType === "CargoCarrier" ? !!needByDate : !!startDate && jobDays >= 1;

  const create = useMutation({
    mutationFn: () =>
      TenderAPI.create({
        title, demandType, carrierOrMachineType, cargoOrProjectDesc: desc, unitsNeeded: units,
        routeClassification: route, origin, destination,
        needByDate, transitDays, startDate, jobDays, estTransferDays,
      }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["tenders"] });
      navigate(`/app/job/${d.tenderId}`);
    },
  });

  const opts = typeOptions(demandType);

  return (
    <div className="p-6">
      <SectionTitle sub="Tell us what you need and how many. Suppliers bid partial or full quantity.">Post a Job</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="space-y-4">
            <div>
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-slate-500">What do you need?</span>
              <div className="grid grid-cols-2 gap-2">
                {DEMAND_TYPES.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => { setDemandType(d.value); setType(""); }}
                    className={`rounded-lg border p-3 text-left transition ${demandType === d.value ? "border-amber-500 bg-amber-bg" : "border-navy-600 bg-navy-900 hover:border-navy-500"}`}
                  >
                    <div className={`text-sm font-medium ${demandType === d.value ? "text-amber-500" : "text-slate-100"}`}>{d.label}</div>
                    <div className="text-[11px] text-slate-500">{d.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={demandType === "CargoCarrier" ? "Carrier type" : "Machine type"}>
                <Select value={carrierOrMachineType} onChange={(e) => setType(e.target.value)}>
                  <option value="">Select…</option>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </Select>
              </Field>
              <Field label="Units needed">
                <Input type="number" min={1} value={units || ""} onChange={(e) => setUnits(Math.max(1, Number(e.target.value)))} />
              </Field>
            </div>

            <Field label={demandType === "CargoCarrier" ? "Cargo to transport" : "Project / use"}>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={demandType === "CargoCarrier" ? "e.g. 600t river sand, Dar → Geita site" : "e.g. earthworks for warehouse foundation"} />
            </Field>

            {/* Timing */}
            {demandType === "CargoCarrier" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Need-by date">
                  <Input type="date" value={needByDate} onChange={(e) => setNeedByDate(e.target.value)} />
                </Field>
                <Field label="Estimated transit (days)">
                  <Input type="number" min={0} value={transitDays || ""} onChange={(e) => setTransitDays(Math.max(0, Number(e.target.value)))} placeholder="e.g. 2" />
                </Field>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="On-site start date">
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </Field>
                  <Field label="Job length (working days)">
                    <Input type="number" min={1} value={jobDays || ""} onChange={(e) => setJobDays(Math.max(0, Number(e.target.value)))} placeholder="e.g. 30" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Est. transfer to site (days)">
                    <Input type="number" min={0} value={estTransferDays || ""} onChange={(e) => setEstTransferDays(Math.max(0, Number(e.target.value)))} placeholder="e.g. 1" />
                  </Field>
                  <div className="flex flex-col justify-end">
                    <span className="mb-1 block text-[11px] uppercase tracking-wider text-slate-500">End date (auto)</span>
                    <div className="rounded-md border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-amber-500 tnum">
                      {computedEnd || "—"}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">End date is the last working day. The return / transfer-to-yard day is not charged.</p>
              </div>
            )}

            <div>
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-slate-500">Transit classification</span>
              <div className="flex gap-1 rounded-md border border-navy-600 bg-navy-900 p-1">
                {ROUTE_OPTIONS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setRoute(r.value)}
                    className={`flex-1 rounded px-3 py-2 text-sm font-medium transition ${route === r.value ? (r.value === "CrossBorder" ? "bg-amber-500 text-navy-900" : "bg-navy-700 text-slate-100") : "text-slate-500 hover:text-slate-300"}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Origin"><Input value={origin} onChange={(e) => setOrigin(e.target.value)} /></Field>
              <Field label="Destination"><Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder={route === "CrossBorder" ? "e.g. Kigali, Rwanda" : "e.g. Geita"} /></Field>
            </div>
            <Field label="Job title (optional)">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Auto-generated if left blank" />
            </Field>

            <Button variant="amber" disabled={!carrierOrMachineType || !destination || !timingValid || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Posting…" : "Post job & open for bids"}
            </Button>
          </div>
        </Card>

        <Card className="h-fit p-5">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">How it works</div>
          <ol className="space-y-3 text-sm text-slate-300">
            <li><span className="text-amber-500">1.</span> Suppliers bid quantity + price per unit.</li>
            <li><span className="text-amber-500">2.</span> We auto-fill the cheapest bids until your quantity is met, then set one flat fair price all awarded suppliers agree to.</li>
            <li><span className="text-amber-500">3.</span> You confirm the award — each supplier signs their own agreement.</li>
            <li><span className="text-amber-500">4.</span> Staged gate: agreements → fleet docs → field inspection → permits → payment → execution.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}

function JobDetail({ id, me }: { id: string; me: Me }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tender", id], queryFn: () => TenderAPI.get(id), refetchInterval: 4000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ["tender", id] });

  const award = useMutation({ mutationFn: () => TenderAPI.confirmAward(id), onSuccess: refresh });
  const advance = useMutation({ mutationFn: (step: string) => TenderAPI.advance(id, step), onSuccess: refresh });
  const send = useMutation({ mutationFn: (body: string) => TenderAPI.sendMessage(id, body), onSuccess: refresh });
  const signOff = useMutation({ mutationFn: (contractId: string) => TenderAPI.signOff(contractId), onSuccess: refresh });

  if (q.isLoading || !q.data?.tender) return <div className="p-6 text-slate-500">Loading…</div>;
  const { tender: t, bids, contracts, documents, timeline, messages: thread, stageLabel } = q.data;
  const stage = t.tenderStage;
  const isMachinery = t.demandType === "Machinery";
  const baseValue = t.flatFairPriceTzs * t.unitsNeeded;
  const clientFee = Math.round(baseValue * 0.05);
  const escrowAmt = baseValue + clientFee; // what the client funds = value + 5%
  const permitDocs = documents.filter((d: any) => d.kind === "Permit");
  const ttProofDocs = documents.filter((d: any) => d.kind === "TTProof");

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-100">{t.title}</h1>
          <p className="text-sm text-slate-500">
            {t.demandType === "CargoCarrier" ? "Cargo" : "Machinery"} · {t.carrierOrMachineType} · {t.unitsNeeded} unit{t.unitsNeeded > 1 ? "s" : ""} · {t.origin} → {t.destination}
            {t.cargoOrProjectDesc ? ` · ${t.cargoOrProjectDesc}` : ""}
          </p>
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
          {/* Bids + award */}
          {stage === "Bidding" && (
            <Card className="p-5">
              <SectionTitle sub="We auto-fill cheapest bids until your quantity is met, then set one flat fair price.">Bids ({bids.length})</SectionTitle>
              {bids.length === 0 ? (
                <Empty>No bids yet. Suppliers will appear here as they respond.</Empty>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-navy-600 text-left text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="py-2">Supplier</th><th className="py-2 text-right">Units</th><th className="py-2 text-right">Price / unit</th><th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bids.map((b: any) => (
                      <tr key={b.id} className="border-b border-navy-700">
                        <td className="py-2.5 text-slate-100">{b.supplierName}</td>
                        <td className="py-2.5 text-right tnum text-slate-300">{b.unitsOffered}</td>
                        <td className="py-2.5 text-right tnum text-slate-200">{tzs(b.pricePerUnitTzs)}</td>
                        <td className="py-2.5 text-right"><StatusPill status={b.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {bids.length > 0 && (
                <div className="mt-4 flex items-center justify-between rounded-md border border-navy-600 bg-navy-900 p-3">
                  <span className="text-sm text-slate-400">Confirm the award — the system auto-fills the cheapest bids and creates one signed agreement per supplier.</span>
                  <Button variant="amber" disabled={award.isPending} onClick={() => award.mutate()}>
                    {award.isPending ? "Awarding…" : "Confirm award"}
                  </Button>
                </div>
              )}
              {award.error && <p className="mt-2 text-xs text-bad">{(award.error as Error).message}</p>}
            </Card>
          )}

          {/* Awarded contracts */}
          {stage !== "Bidding" && (
            <Card className="p-5">
              <SectionTitle sub={`Flat fair price: ${tzs(t.flatFairPriceTzs)} / unit`}>Awarded Suppliers</SectionTitle>
              <div className="space-y-2">
                {contracts.map((c: any) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
                    <div>
                      <div className="font-medium text-slate-100">{c.supplierName}</div>
                      <div className="text-xs text-slate-500">{c.unitsAwarded} unit{c.unitsAwarded > 1 ? "s" : ""} · {tzs((c.contractValueTzs || c.agreedPricePerUnitTzs * c.unitsAwarded))} value</div>
                    </div>
                    <StatusPill status={c.contractStage} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Client action: permits */}
          {stage === "FieldVerified" && (
            <Card className="border-amber-600 p-5">
              <SectionTitle sub="Field inspection cleared. Upload the transit permits to proceed.">Your step — Upload permits</SectionTitle>
              <div className="space-y-3">
                <FileUpload label="Transit permits" kind="Permit" tenderId={id} onUploaded={refresh} buttonLabel="Upload permit document" />
                {permitDocs.length > 0 && (
                  <Button variant="amber" disabled={advance.isPending} onClick={() => advance.mutate("permits-uploaded")}>
                    {advance.isPending ? "Submitting…" : "Submit permits for verification"}
                  </Button>
                )}
              </div>
            </Card>
          )}

          {/* Client action: clear payment = escrow funding (back-office, no upload) */}
          {stage === "PermitsVerified" && (
            <Card className="border-amber-600 p-5">
              <SectionTitle sub="Permits verified. Clear your payment into the AFRIGEN Link coordination account — this funds the escrow we monitor for you.">Your step — Clear payment</SectionTitle>
              <div className="mb-3">
                <Button variant="ghost" onClick={() => generateBankPDF({ contractTitle: t.title, amountToFundTzs: escrowAmt, reference: t.id })}>
                  Download AFRIGEN Link bank details (PDF)
                </Button>
              </div>
              <div className="mb-3 space-y-1.5 rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Contract value</span><span className="tnum">{tzs(baseValue)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>AFRIGEN Link service fee (5%)</span><span className="tnum">+ {tzs(clientFee)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-navy-700 pt-1.5 font-medium text-slate-100">
                  <span>Total to fund (escrow preview)</span>
                  <span className="tnum font-display font-semibold text-amber-500">{tzs(escrowAmt)}</span>
                </div>
                <p className="text-[11px] text-slate-500">Funds tracked and monitored, not held. Suppliers are paid on completion, less their own 5% fee. Once we confirm your payment, a payment proof is generated and emailed to you automatically.</p>
              </div>
              <div className="mb-3 space-y-2 rounded-md border border-navy-600 bg-navy-900 p-3">
                <p className="text-xs text-slate-300">Bank transfer only. After you send the transfer, upload a copy of the TT (bank transfer) slip so we can confirm it against the account.</p>
                <FileUpload label="TT transfer copy" kind="TTProof" tenderId={id} onUploaded={refresh} buttonLabel="Upload TT copy" />
                {ttProofDocs.length > 0 && (
                  <div className="text-[11px] text-good">{ttProofDocs.length} TT copy uploaded — you can now submit for confirmation.</div>
                )}
              </div>
              <Button variant="amber" disabled={advance.isPending || ttProofDocs.length === 0} onClick={() => advance.mutate("tt-uploaded")}>
                {advance.isPending ? "Submitting…" : "Submit payment proof for confirmation"}
              </Button>
              {ttProofDocs.length === 0 && <p className="mt-2 text-[11px] text-slate-500">Upload your TT copy to enable submission.</p>}
              {advance.error && <p className="mt-2 text-xs text-bad">{(advance.error as Error).message}</p>}
            </Card>
          )}

          {(stage === "TTUploaded" || stage === "TTConfirmed" || stage === "Executing") && (
            <Card className="p-5">
              <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Escrow</div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">{stage === "TTUploaded" ? "Payment sent — awaiting AFRIGEN Link confirmation" : "Monitored in escrow by AFRIGEN Link"}</span>
                <span className="tnum font-display text-lg font-semibold text-amber-500">{tzs(escrowAmt)}</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Funds are tracked end-to-end (includes 5% client fee) and released to suppliers on completion, less their 5% supplier fee.</p>
            </Card>
          )}

          {/* Client sign-off → step 2 of the payout chain (after supplier marks task complete) */}
          {stage === "Executing" && (
            <Card className="border-amber-600 p-5">
              <SectionTitle sub="Once the supplier marks the job complete, sign off to release payment. Your manager then submits it and an admin approves the release — funds stay tracked, not moved, until you sign off.">Sign off & release payment</SectionTitle>
              <div className="space-y-3">
                {contracts.map((c: any) => {
                  const done = c.milestoneStatus === "FundsDisbursed";
                  const canSign = c.payoutStatus === "TaskComplete";
                  const inProgress = ["AwaitingKamSubmission", "PendingAdminApproval"].includes(c.payoutStatus);
                  return (
                    <div key={c.id} className="rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-slate-100">{c.supplierName} · {c.unitsAwarded} unit{c.unitsAwarded > 1 ? "s" : ""}</div>
                          <div className="text-[11px] text-slate-500">{tzs(c.contractValueTzs || c.agreedPricePerUnitTzs * c.unitsAwarded)} value</div>
                        </div>
                        {done ? <span className="text-xs text-good">Settled</span>
                          : canSign ? <Button variant="amber" disabled={signOff.isPending} onClick={() => signOff.mutate(c.id)}>{signOff.isPending ? "Signing…" : "Sign off & approve payment"}</Button>
                          : inProgress ? <span className="text-xs text-amber-500">Payout in progress</span>
                          : <span className="text-xs text-slate-500">Waiting for supplier to mark task complete</span>}
                      </div>
                      <PaymentTracker payoutStatus={c.payoutStatus} />
                      {canSign && c.completionRemarks && <div className="mt-2 rounded border border-navy-600 bg-navy-800 p-2 text-[11px] text-slate-400">Supplier note: {c.completionRemarks}</div>}
                    </div>
                  );
                })}
              </div>
              {signOff.error && <p className="mt-2 text-xs text-bad">{(signOff.error as Error).message}</p>}
            </Card>
          )}

          {/* Machinery hire — extension panel (active execution only) */}
          {isMachinery && (stage === "TTConfirmed" || stage === "Executing") && (
            <ExtensionPanel contracts={contracts} onDone={refresh} />
          )}

          {/* Cancel / refund / shorten a hire */}
          {contracts.length > 0 && stage !== "Bidding" && (
            <ReversalPanel contracts={contracts} tender={t} isMachinery={isMachinery} onDone={refresh} />
          )}

          {/* Documents */}
          {documents.length > 0 && (
            <Card className="p-5">
              <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">Documents</div>
              <ul className="space-y-2 text-sm">
                {documents.map((d: any) => (
                  <li key={d.id} className="flex items-center justify-between">
                    <span className="text-slate-300">{d.label || d.kind} <span className="text-[11px] text-slate-500">· {d.kind}</span></span>
                    <span className="flex items-center gap-2">
                      {d.verifiedBy && <span className="text-[11px] text-good">verified</span>}
                      {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-xs text-amber-500 hover:underline">View ↗</a>}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* side: timeline + messaging */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">Status</div>
            <p className="text-sm text-slate-200">{stageLabel}</p>
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

/** Cancel / refund / shorten a contract — request, preview figures, route to KAM. */
function ReversalPanel({ contracts, tender, isMachinery, onDone }: { contracts: any[]; tender: any; isMachinery: boolean; onDone: () => void }) {
  const active = contracts.filter((c) => c.milestoneStatus !== "FundsDisbursed" && c.status !== "Cancelled");
  if (active.length === 0) return null;
  return (
    <Card className="p-5">
      <SectionTitle sub="Cancel a contract, request a refund, or end a machinery hire early. Your manager reviews the figures, then an admin approves and instructs the refund to your bank. Funds are tracked, not held.">
        Cancel / refund a contract
      </SectionTitle>
      <div className="space-y-3">
        {active.map((c) => (
          <ReversalRow key={c.id} contract={c} tender={tender} isMachinery={isMachinery} onDone={onDone} />
        ))}
      </div>
    </Card>
  );
}

function ReversalRow({ contract, tender, isMachinery, onDone }: { contract: any; tender: any; isMachinery: boolean; onDone: () => void }) {
  const [reason, setReason] = useState<"Cancel" | "Refund" | "Shorten">(isMachinery ? "Shorten" : "Cancel");
  const [actualDays, setActualDays] = useState(1);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const existing = contract.cancelStatus && contract.cancelStatus !== "None";

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const r = await TenderAPI.reversalRequest(contract.id, {
        reason,
        actualDays: reason === "Shorten" ? actualDays : undefined,
        note,
      });
      setPreview(r.preview);
      setDone(true);
      onDone();
    } catch (e: any) {
      setErr(e?.message || "Could not submit the request.");
    } finally {
      setBusy(false);
    }
  }

  if (existing && !done) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-300">{contract.title || tender.title}</span>
          <span className="text-[11px] uppercase tracking-wider text-amber-500">
            {contract.cancelStatus === "Reversed" ? "Reversed" : "Reversal in progress"}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {contract.cancelStatus === "Reversed"
            ? "This contract has been reversed. See the ledger for the settled figures."
            : "Your request is with your manager / admin for review."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-3 text-sm text-slate-300">{contract.title || tender.title}</div>
      {done && preview ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-sm">
          <p className="font-medium text-amber-400">Request submitted</p>
          <p className="mt-1 text-xs text-slate-400">
            Estimated refund to your bank:{" "}
            <span className="font-semibold text-slate-200">TZS {Number(preview.clientRefundTzs || 0).toLocaleString()}</span>{" "}
            (subject to admin approval). Your manager will review it next.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-400">
            Type
            <select
              className="mt-1 w-full rounded-lg border border-white/10 bg-navy-900 px-3 py-2 text-sm text-slate-200"
              value={reason}
              onChange={(e) => setReason(e.target.value as any)}
            >
              <option value="Cancel">Cancel the contract</option>
              <option value="Refund">Request a refund</option>
              {isMachinery && <option value="Shorten">End the hire early (shorten)</option>}
            </select>
          </label>
          {reason === "Shorten" && (
            <label className="text-xs text-slate-400">
              Days actually worked
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-white/10 bg-navy-900 px-3 py-2 text-sm text-slate-200"
                value={actualDays}
                onChange={(e) => setActualDays(Math.max(0, Number(e.target.value)))}
              />
            </label>
          )}
          <label className="text-xs text-slate-400 sm:col-span-2">
            Note (optional)
            <textarea
              className="mt-1 w-full rounded-lg border border-white/10 bg-navy-900 px-3 py-2 text-sm text-slate-200"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tell your manager why…"
            />
          </label>
          <div className="sm:col-span-2 flex items-center gap-3">
            <Button variant="amber" disabled={busy} onClick={submit}>
              {busy ? "Submitting…" : "Request reversal"}
            </Button>
            {err && <span className="text-xs text-bad">{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Machinery hire extension — full lifecycle: request → supplier accept → both e-sign → KAM activate → client fund. */
function ExtensionPanel({ contracts, onDone }: { contracts: any[]; onDone: () => void }) {
  // Each awarded supplier line is its own contract; extend per contract.
  const machineryContracts = contracts.filter((c) => c.dailyRateTzs > 0);
  if (machineryContracts.length === 0) return null;
  return (
    <Card className="p-5">
      <SectionTitle sub="Keep a machine on site beyond its end date. Same daily rate, +5% fee. The supplier accepts, both parties e-sign, then you fund it — before the current end date.">Extend a hire</SectionTitle>
      <div className="space-y-3">
        {machineryContracts.map((c) => (
          <ExtensionRow key={c.id} contract={c} onDone={onDone} />
        ))}
      </div>
    </Card>
  );
}

function ExtensionRow({ contract, onDone }: { contract: any; onDone: () => void }) {
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const exq = useQuery({ queryKey: ["extensions", contract.id], queryFn: () => TenderAPI.getExtensions(contract.id).then((r) => r.extensions), refetchInterval: 4000 });
  const docq = useQuery({ queryKey: ["contract-docs", contract.id], queryFn: () => DocAPI.list({ contractId: contract.id }).then((r) => r.documents) });
  const exts = exq.data ?? [];
  // active = the most recent extension not declined/lapsed/paid-and-done
  const active = exts.find((e: any) => !["Declined", "Lapsed", "Paid"].includes(e.status));
  const overdue = contract.extensionStatus === "PaymentOverdue" || contract.removalRight === 1;
  const refresh = () => { exq.refetch(); docq.refetch(); onDone(); };

  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setErr("");
    try { await fn(); refresh(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const extDoc = active?.contractDocId ? (docq.data ?? []).find((d: any) => d.id === active.contractDocId) : null;

  return (
    <div className="rounded-md border border-navy-600 bg-navy-900 p-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-100">{contract.supplierName}</span>
        <span className="text-xs text-slate-500">ends {contract.endDate || "—"} · {tzs(contract.dailyRateTzs)}/day/unit</span>
      </div>

      {overdue ? (
        <div className="rounded border border-bad/40 bg-bad/10 p-2 text-xs text-bad">
          Extension lapsed — payment not received by the due date. The supplier may recover the machine.
        </div>
      ) : !active ? (
        <div className="flex items-end gap-2">
          <Field label="Extra days">
            <Input type="number" min={1} value={days || ""} onChange={(e) => setDays(Math.max(1, Number(e.target.value)))} />
          </Field>
          <Button disabled={busy} onClick={() => run(() => TenderAPI.extend(contract.id, days))}>{busy ? "Requesting…" : "Request extension"}</Button>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="space-y-1">
            <div className="flex justify-between text-slate-400"><span>New end date</span><span className="tnum text-slate-200">{active.newEndDate}</span></div>
            <div className="flex justify-between text-slate-400"><span>Extra ({active.addedDays} days × {contract.unitsAwarded} unit{contract.unitsAwarded > 1 ? "s" : ""})</span><span className="tnum">{tzs(active.extraAmountTzs)}</span></div>
            <div className="flex justify-between text-slate-400"><span>Service fee (5%)</span><span className="tnum">+ {tzs(active.clientFeeTzs)}</span></div>
            <div className="flex justify-between border-t border-navy-700 pt-1 font-medium text-slate-100"><span>Total to fund</span><span className="tnum text-amber-500">{tzs(active.amountToFundTzs)}</span></div>
          </div>

          {active.status === "PendingSupplierAcceptance" && (
            <div className="rounded border border-navy-700 bg-navy-800 p-2 text-xs text-slate-400">Awaiting supplier acceptance…</div>
          )}

          {active.status === "AwaitingSignatures" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded border border-navy-700 bg-navy-800 p-2 text-xs">
                <span className="text-slate-300">Extension contract</span>
                {extDoc?.url ? <a href={extDoc.url} target="_blank" rel="noreferrer" className="text-amber-500 hover:underline">View ↗</a> : <span className="text-slate-500">generating…</span>}
              </div>
              <div className="text-[11px] text-slate-500">
                Client: {active.clientSignedAt ? <span className="text-good">signed by {active.clientSignedName}</span> : "not signed"} · Supplier: {active.supplierSignedAt ? <span className="text-good">signed</span> : "pending"}
              </div>
              {!active.clientSignedAt ? (
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" className="h-4 w-4 accent-amber-500" disabled={busy} onChange={() => run(() => TenderAPI.extendSign(contract.id, active.id))} />
                  I agree &amp; e-sign this extension contract
                </label>
              ) : (
                <div className="text-xs text-good">You signed — awaiting the supplier's signature.</div>
              )}
            </div>
          )}

          {active.status === "AwaitingKamActivation" && (
            <div className="rounded border border-navy-700 bg-navy-800 p-2 text-xs text-slate-400">Both parties signed — awaiting manager activation of the payment gateway.</div>
          )}

          {active.status === "PendingPayment" && (
            <div className="space-y-2">
              <p className="text-[11px] text-amber-500/80">Must be funded before {active.dueDate} (current end date), or the supplier may recover the machine.</p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => generateBankPDF({ contractTitle: contract.title, amountToFundTzs: active.amountToFundTzs, reference: active.id })}>Bank details (PDF)</Button>
                <Button variant="amber" disabled={busy} onClick={() => run(() => TenderAPI.payExtension(contract.id, active.id))}>{busy ? "Submitting…" : "I have cleared the payment"}</Button>
              </div>
            </div>
          )}

          {active.status === "PaymentPendingConfirmation" && (
            <div className="rounded border border-navy-700 bg-navy-800 p-2 text-xs text-slate-400">Payment sent — awaiting AFRIGEN Link confirmation.</div>
          )}
        </div>
      )}
      {err && <p className="mt-2 text-xs text-bad">{err}</p>}
    </div>
  );
}

function Ledger() {
  const q = useQuery({ queryKey: ["client-contracts"], queryFn: async () => (await (await api.contracts.$get()).json()).contracts as any[] });
  const rows = q.data ?? [];
  const totalFunded = rows.reduce((s, c) => s + (c.totalEscrowBalanceTzs || 0), 0);
  const settled = rows.filter((c) => c.milestoneStatus === "FundsDisbursed");

  async function downloadInvoice(contractId: string, c: any) {
    const r = await (await api.invoices[":contractId"].$get({ param: { contractId } })).json();
    const inv = (r.invoices as any[]).find((i) => i.party === "Client");
    if (inv) generateInvoicePDF(inv, { title: c.title, origin: c.origin, destination: c.destination, routeClassification: c.routeClassification });
  }

  return (
    <div className="p-6">
      <SectionTitle sub="Your contracts, escrow funded and settlement invoices.">Ledger</SectionTitle>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <KPIStat label="Contracts" value={String(rows.length)} />
        <KPIStat label="Total Funded" value={tzs(totalFunded)} accent="amber" />
        <KPIStat label="Settled" value={String(settled.length)} accent="good" />
      </div>
      {rows.length === 0 ? <Empty>No contracts yet.</Empty> : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-600 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Contract</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3 text-right">Funded (escrow)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-navy-700">
                  <td className="px-4 py-3 text-slate-100">{c.title}</td>
                  <td className="px-4 py-3 text-right tnum text-slate-300">{tzs(c.contractValueTzs || c.agreedPricePerUnitTzs * c.unitsAwarded)}</td>
                  <td className="px-4 py-3 text-right tnum text-slate-200">{tzs(c.totalEscrowBalanceTzs)}</td>
                  <td className="px-4 py-3"><StatusPill status={c.milestoneStatus} /></td>
                  <td className="px-4 py-3 text-right">
                    {c.milestoneStatus === "FundsDisbursed" && (
                      <button onClick={() => downloadInvoice(c.id, c)} className="text-xs text-amber-500 hover:underline">Invoice ↓</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

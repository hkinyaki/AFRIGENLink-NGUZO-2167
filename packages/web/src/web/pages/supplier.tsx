import { useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { tzs } from "../lib/format";
import type { Me } from "../lib/use-me";
import { TenderAPI, PartsAPI, generateAgreementPDF, generateInvoicePDF } from "../lib/tenders";
import { AppShell, Icons, type NavItem } from "../components/shell";
import { HelpDesk } from "../components/help-desk";
import {
  Button, Card, Field, Input, Select, SectionTitle, StatusPill, Empty, KPIStat,
  StageTracker, Timeline, MessageThread, FileUpload, ManagerCard, PaymentTracker,
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
                  <p className="text-sm text-slate-400">Upload your machine / fleet documents (registration, inspection certs, insurance) for field verification.</p>
                  <FileUpload label="Machine / fleet docs" kind="MachineDoc" tenderId={id} contractId={myContract.id} onUploaded={refresh} buttonLabel="Upload fleet documents" />
                  {machineDoc && (
                    <Button variant="amber" disabled={advance.isPending} onClick={() => advance.mutate("machine-docs")}>
                      {advance.isPending ? "Submitting…" : "Submit documents for inspection"}
                    </Button>
                  )}
                </div>
              )}

              {["MachineDocsUploaded", "FieldVerified", "PermitsUploaded", "PermitsVerified", "TTUploaded", "TTConfirmed", "Executing"].includes(stage) && (
                <p className="text-sm text-slate-300">Your part is done — the job is moving through inspection, permits and payment. Track progress in the activity log.</p>
              )}
            </Card>
            );
          })()}

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

const ASSET_TYPES = ["Excavator", "Prime Mover", "Tipper Truck", "Bulldozer", "Cargo Truck"];

function Fleet() {
  const q = useQuery({
    queryKey: ["my-assets"],
    queryFn: async () => (await (await api.assets.$get({ query: { mine: "1" } })).json()).assets,
    refetchInterval: 120000,
  });
  const [openId, setOpenId] = useState("");
  const rows = q.data ?? [];

  return (
    <div className="p-6">
      <div className="mb-4">
        <SectionTitle sub="Your fleet is built and verified by AFRIGEN Link field agents during inspection — you cannot edit or remove assets here. Each machine shows its live status and job history.">My Fleet</SectionTitle>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPIStat label="Assets" value={String(rows.length)} />
        <KPIStat label="Available" value={String(rows.filter((r: any) => r.operationalStatus === "Available").length)} accent="good" />
        <KPIStat label="On live job" value={String(rows.filter((r: any) => r.onLiveJob).length)} />
        <KPIStat label="Breakdown" value={String(rows.filter((r: any) => r.operationalStatus === "Breakdown").length)} accent="amber" />
      </div>

      {rows.length === 0 ? (
        <Empty>No assets yet. Your fleet appears here once an AFRIGEN Link field agent inspects and verifies a machine.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((a: any) => {
            const photos: string[] = a.photos ?? [];
            return (
              <Card key={a.id} className={`overflow-hidden p-0 ${a.doubleEntry ? "ring-1 ring-bad" : ""}`}>
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
          })}
        </div>
      )}
    </div>
  );
}

function Ledger() {
  const q = useQuery({ queryKey: ["contracts"], queryFn: async () => (await (await api.contracts.$get()).json()).contracts });
  const revQ = useQuery({ queryKey: ["supplier-reversals"], queryFn: () => TenderAPI.listReversals().then((r) => r.reversals), refetchInterval: 10000 });
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
                  <th className="px-4 py-3">Contract</th><th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Penalty kept</th><th className="px-4 py-3 text-right">Transfer kept</th>
                  <th className="px-4 py-3 text-right">Net to you</th>
                </tr>
              </thead>
              <tbody>
                {reversals.map((r) => (
                  <tr key={r.id} className="border-b border-navy-700">
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
  const net = contract.supplierPayoutTzs ?? Math.round((contract.contractValueTzs || contract.totalEscrowBalanceTzs || 0) * 0.95);
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-medium text-slate-100">{contract.title}</div>
        <StatusPill status={contract.payoutStatus === "Approved" ? "Settled" : contract.payoutStatus === "None" || !contract.payoutStatus ? "In progress" : "Payout in progress"} />
      </div>
      <div className="mb-3 text-sm text-slate-400">Net payout (after 5% fee): <span className="tnum text-good">{tzs(net)}</span></div>
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
  const [deliverTo, setDeliverTo] = useState<"MachineSupplier" | "FieldAgent">("MachineSupplier");
  const [qty, setQty] = useState(1);
  const [receiverName, setReceiverName] = useState("");
  const [receiverDestination, setReceiverDestination] = useState("");

  const contracts = useQuery({ queryKey: ["contracts"], queryFn: async () => (await (await api.contracts.$get()).json()).contracts });
  const parts = useQuery({ queryKey: ["parts-search", query], queryFn: () => PartsAPI.search(query).then((r) => r.parts) });
  const orders = useQuery({ queryKey: ["my-part-orders"], queryFn: () => PartsAPI.orders().then((r) => r.orders), refetchInterval: 5000 });
  const request = useMutation({
    mutationFn: (partId: string) => PartsAPI.reportBreakdown(contractId, partId, { deliverTo, qty, receiverName, receiverDestination }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-part-orders"] }); qc.invalidateQueries({ queryKey: ["contracts"] }); setReceiverName(""); setReceiverDestination(""); setQty(1); },
  });

  const activeContracts = (contracts.data ?? []).filter((c) => ["ActiveTransit", "BreakdownIncident"].includes(c.milestoneStatus));
  const selContract = activeContracts.find((c) => c.id === contractId);
  const escrowAvail = selContract ? selContract.totalEscrowBalanceTzs - selContract.emergencyCreditDeductedTzs : 0;
  const inStock = (parts.data ?? []).filter((p: any) => p.status !== "OutOfStock" && p.stockQty > 0);

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
            <Field label="Search spare part by name or code"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. turbocharger, 320D, SKU…" /></Field>
            <div className="space-y-2">
              {inStock.length === 0 ? <p className="text-sm text-slate-500">No matching in-stock spares.</p> : inStock.map((p: any) => {
                const total = p.retailCostTzs + p.logisticsHandlingFeeTzs;
                return (
                  <div key={p.id} className="flex items-center justify-between rounded-md border border-navy-600 bg-navy-900 p-3 text-sm">
                    <div>
                      <div className="text-slate-100">{p.partName} <span className="text-[11px] text-slate-500">{p.compatibleModel}</span></div>
                      <div className="text-[11px] text-slate-500">Retail {tzs(p.retailCostTzs)} + handling {tzs(p.logisticsHandlingFeeTzs)} = {tzs(total)} · stock {p.stockQty}</div>
                    </div>
                    <Button variant="amber" disabled={!contractId || request.isPending} onClick={() => request.mutate(p.id)}>Approve order</Button>
                  </div>
                );
              })}
            </div>
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

import type { ReactNode } from "react";

// ---- Reference helpers ----
/** Human-readable contract/tender reference, e.g. NGZ-CT-3F9A2 */
export function contractRef(id: string | number, prefix = "CT"): string {
  const s = String(id).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `NGZ-${prefix}-${s.slice(-5).padStart(5, "0")}`;
}

// ---- KAM activity status ----
const ACTIVITY: Record<string, { dot: string; label: string }> = {
  online: { dot: "bg-emerald-400", label: "Online" },
  offline: { dot: "bg-slate-500", label: "Offline" },
  meeting: { dot: "bg-amber-500", label: "In a meeting" },
  standby: { dot: "bg-sky-400", label: "On standby" },
};
export function ActivityDot({ status, showLabel = true }: { status?: string | null; showLabel?: boolean }) {
  const a = ACTIVITY[status ?? "offline"] ?? ACTIVITY.offline;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${a.dot}`} />
      {showLabel && <span className="text-[11px] text-slate-400">{a.label}</span>}
    </span>
  );
}

// ---- Status mapping ----
const STATUS_STYLES: Record<string, string> = {
  // good
  Available: "bg-[#16321F] text-[#5FD699] border-[#1E4A2E]",
  Verified: "bg-[#16321F] text-[#5FD699] border-[#1E4A2E]",
  Approved: "bg-[#16321F] text-[#5FD699] border-[#1E4A2E]",
  MilestoneSignedOff: "bg-[#16321F] text-[#5FD699] border-[#1E4A2E]",
  FundsDisbursed: "bg-[#16321F] text-[#5FD699] border-[#1E4A2E]",
  Delivered: "bg-[#16321F] text-[#5FD699] border-[#1E4A2E]",
  Accepted: "bg-[#16321F] text-[#5FD699] border-[#1E4A2E]",
  // neutral
  Pending: "bg-amber-bg text-amber-500 border-amber-600",
  "Under Review": "bg-amber-bg text-amber-500 border-amber-600",
  Submitted: "bg-amber-bg text-amber-500 border-amber-600",
  Active: "bg-navy-700 text-slate-100 border-navy-600",
  ActiveTransit: "bg-navy-700 text-slate-100 border-navy-600",
  AwaitingEscrowDeposit: "bg-navy-700 text-slate-300 border-navy-600",
  InTransit: "bg-navy-700 text-slate-100 border-navy-600",
  Open: "bg-navy-700 text-slate-100 border-navy-600",
  Interested: "bg-navy-700 text-slate-300 border-navy-600",
  Audited: "bg-navy-700 text-slate-300 border-navy-600",
  Requested: "bg-navy-700 text-slate-300 border-navy-600",
  Maintenance: "bg-navy-700 text-slate-300 border-navy-600",
  Matched: "bg-navy-700 text-slate-100 border-navy-600",
  // friction (amber)
  Breakdown: "bg-amber-bg text-amber-500 border-amber-600",
  BreakdownIncident: "bg-amber-bg text-amber-500 border-amber-600",
  DiscrepancyFlagged: "bg-amber-bg text-amber-500 border-amber-600",
  ApprovedForDispatch: "bg-amber-bg text-amber-500 border-amber-600",
  // bad
  Rejected: "bg-[#331816] text-[#F08982] border-[#5A2722]",
  Declined: "bg-[#331816] text-[#F08982] border-[#5A2722]",
  Closed: "bg-[#331816] text-[#F08982] border-[#5A2722]",
};

export function StatusPill({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-navy-700 text-slate-300 border-navy-600";
  const label = status.replace(/([a-z])([A-Z])/g, "$1 $2");
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium border ${style}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
}

export function Card({ children, className = "", onCanvas = false, lift = false }: { children: ReactNode; className?: string; onCanvas?: boolean; lift?: boolean }) {
  if (onCanvas) {
    return <div className={`rounded-lg border border-canvas-line bg-white ${className}`}>{children}</div>;
  }
  return (
    <div className={`surface-dark ${lift ? "surface-lift" : ""} ${className}`}>{children}</div>
  );
}

export function KPIStat({ label, value, accent, hint, icon, onClick }: { label: string; value: string; accent?: "amber" | "good"; hint?: string; icon?: ReactNode; onClick?: () => void }) {
  return (
    <div
      className={`surface-dark surface-lift p-4 ${onClick ? "cursor-pointer transition hover:ring-1 hover:ring-amber-500/40" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <div className="flex items-start justify-between">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
        {icon && <span className="text-slate-600">{icon}</span>}
      </div>
      <div
        className={`mt-1.5 font-display text-2xl font-semibold tnum ${
          accent === "amber" ? "text-amber-500" : accent === "good" ? "text-good" : "text-slate-100"
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "amber" | "ghost" | "danger" | "subtle";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const styles: Record<string, string> = {
    primary: "bg-slate-100 text-navy-900 hover:bg-white shadow-[0_8px_20px_-10px_rgba(0,0,0,.6)]",
    amber: "bg-amber-500 text-navy-900 hover:bg-amber-400 font-semibold shadow-[0_8px_22px_-10px_rgba(217,154,43,.7)]",
    ghost: "bg-transparent text-slate-300 hover:bg-navy-700 hover:text-slate-100 border border-navy-600",
    subtle: "bg-navy-700 text-slate-100 hover:bg-navy-600",
    danger: "bg-bad text-white hover:opacity-90",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`focus-ring inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition active:scale-[.98] disabled:opacity-40 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`focus-ring w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`focus-ring w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-slate-100 outline-none transition ${props.className ?? ""}`}
    />
  );
}

export function SectionTitle({ children, sub, action }: { children: ReactNode; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="h-4 w-1 rounded-full bg-amber-500" />
          <h2 className="font-display text-xl font-semibold tracking-display text-slate-100">{children}</h2>
        </div>
        {sub && <p className="mt-1 pl-3.5 text-sm text-slate-500">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-navy-600 bg-navy-800/40 p-10 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

// ============================================================
//  Procurement-flow components
// ============================================================
import { useRef, useState, useEffect } from "react";
import { TENDER_STAGE_VIEW } from "../constants/stage-view";

/** Upload a file via presign → PUT → save document row. */
export function FileUpload({
  label,
  kind,
  tenderId,
  contractId,
  scope = "doc",
  accept = "image/*,application/pdf",
  onUploaded,
  buttonLabel = "Choose file",
}: {
  label: string;
  kind: string;
  tenderId?: string;
  contractId?: string;
  scope?: string;
  accept?: string;
  onUploaded?: () => void;
  buttonLabel?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");

  async function handle(file: File) {
    setBusy(true);
    setErr("");
    setDone("");
    try {
      const { uploadFile, DocAPI } = await import("../lib/tenders");
      const { key, mimeType } = await uploadFile(file, scope);
      await DocAPI.save({ tenderId, contractId, kind, label, fileKey: key, mimeType });
      setDone(file.name);
      onUploaded?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handle(f);
          e.target.value = "";
        }}
      />
      <Button variant="subtle" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? "Uploading…" : done ? "Replace file" : buttonLabel}
      </Button>
      {done && <span className="ml-2 text-xs text-good">✓ {done}</span>}
      {err && <span className="ml-2 text-xs text-bad">{err}</span>}
    </div>
  );
}

/** Horizontal staged-gate tracker. */
export function StageTracker({ current }: { current: string }) {
  const idx = TENDER_STAGE_VIEW.findIndex((s) => s.key === current);
  return (
    <div className="flex flex-wrap gap-1.5">
      {TENDER_STAGE_VIEW.map((s, i) => {
        const state = i < idx ? "done" : i === idx ? "active" : "todo";
        return (
          <div
            key={s.key}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] ${
              state === "done"
                ? "border-[#1E4A2E] bg-[#16321F] text-[#5FD699]"
                : state === "active"
                ? "border-amber-600 bg-amber-bg text-amber-500"
                : "border-navy-600 bg-navy-800/50 text-slate-500"
            }`}
          >
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                state === "done" ? "bg-[#1E4A2E] text-[#5FD699]" : state === "active" ? "bg-amber-500 text-navy-900" : "bg-navy-600 text-slate-400"
              }`}
            >
              {state === "done" ? "✓" : i + 1}
            </span>
            {s.short}
          </div>
        );
      })}
    </div>
  );
}

/** 4-step payment activation tracker. Each step gates the next. */
const PAYMENT_STEPS = [
  { key: "TaskComplete", label: "Task complete", who: "Supplier" },
  { key: "AwaitingKamSubmission", label: "Client sign-off", who: "Client" },
  { key: "PendingAdminApproval", label: "KAM submits request", who: "KAM" },
  { key: "Approved", label: "Admin approves & releases", who: "Admin" },
] as const;

export function PaymentTracker({ payoutStatus }: { payoutStatus?: string | null }) {
  // index reached so far (a status means THAT step is done and we're on the next)
  const order = ["None", "TaskComplete", "AwaitingKamSubmission", "PendingAdminApproval", "Approved"];
  const reached = Math.max(0, order.indexOf(payoutStatus || "None"));
  return (
    <div className="flex flex-wrap gap-1.5">
      {PAYMENT_STEPS.map((s, i) => {
        const state = i < reached ? "done" : i === reached ? "active" : "todo";
        return (
          <div
            key={s.key}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] ${
              state === "done"
                ? "border-[#1E4A2E] bg-[#16321F] text-[#5FD699]"
                : state === "active"
                ? "border-amber-600 bg-amber-bg text-amber-500"
                : "border-navy-600 bg-navy-800/50 text-slate-500"
            }`}
          >
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                state === "done" ? "bg-[#1E4A2E] text-[#5FD699]" : state === "active" ? "bg-amber-500 text-navy-900" : "bg-navy-600 text-slate-400"
              }`}
            >
              {state === "done" ? "✓" : i + 1}
            </span>
            <span>{s.label}</span>
            <span className="text-[9px] uppercase tracking-wide opacity-60">{s.who}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Vertical activity timeline. */
export function Timeline({ events }: { events: { id: string; summary: string; type: string; createdAt: number | string }[] }) {
  if (!events?.length) return <Empty>No activity yet.</Empty>;
  return (
    <ol className="relative space-y-4 border-l border-navy-600 pl-5">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[1.42rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-navy-800 bg-amber-500" />
          <div className="text-sm text-slate-200">{e.summary}</div>
          <div className="text-[11px] text-slate-500">{new Date(e.createdAt).toLocaleString("en-GB")}</div>
        </li>
      ))}
    </ol>
  );
}

/** Per-tender message thread. */
export function MessageThread({
  messages,
  meProfileId,
  onSend,
  sending,
}: {
  messages: { id: string; body: string; fromProfileId: string; createdAt: number | string; from?: { name: string; role: string; agentNumber?: string; userCode?: string } }[];
  meProfileId: string;
  onSend: (body: string) => void;
  sending?: boolean;
}) {
  const [text, setText] = useState("");
  const roleLabel = (r?: string) =>
    r === "key_account" ? "Key Account" : r === "parts_supplier" ? "Parts" : r ? r.charAt(0).toUpperCase() + r.slice(1) : "";
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 max-h-72 space-y-2.5 overflow-y-auto pr-1">
        {messages.length === 0 && <p className="text-sm text-slate-500">No messages yet. Start the conversation.</p>}
        {messages.map((m) => {
          const mine = m.fromProfileId === meProfileId;
          // Sender ID is shown on EVERY message, including your own.
          const idTag = m.from?.agentNumber || m.from?.userCode;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-amber-500 text-navy-900" : "bg-navy-700 text-slate-100"}`}>
                <div className={`mb-0.5 text-[10px] uppercase tracking-wide ${mine ? "opacity-60" : "opacity-70"}`}>
                  {mine ? "You" : m.from?.name ?? "User"}
                  {m.from?.role ? ` · ${roleLabel(m.from.role)}` : ""}
                  {idTag ? ` · ${idTag}` : ""}
                </div>
                {m.body}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { onSend(text.trim()); setText(""); } }} />
        <Button variant="amber" disabled={!text.trim() || sending} onClick={() => { onSend(text.trim()); setText(""); }}>
          Send
        </Button>
      </div>
    </div>
  );
}

export function PawIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M3 13a3 3 0 1 1 5.5 1.7c-.7 1-2 1.6-2 2.8 0 .9.8 1.5 1.7 1.5h7.6c.9 0 1.7-.6 1.7-1.5 0-1.2-1.3-1.8-2-2.8A3 3 0 1 1 21 13" opacity="0" />
    </svg>
  );
}

/** Verification badge — green when Verified, amber while pending, red if rejected. */
export function VerifiedBadge({ status }: { status: string }) {
  if (status === "Verified") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#1E4A2E] bg-[#16321F] px-2.5 py-0.5 text-[11px] font-medium text-[#5FD699]">
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" /></svg>
        Verified
      </span>
    );
  }
  if (status === "Rejected") {
    return <span className="inline-flex items-center gap-1 rounded-full border border-[#5A2722] bg-[#331816] px-2.5 py-0.5 text-[11px] font-medium text-[#F08982]">Needs attention</span>;
  }
  const label = status === "SiteVisitScheduled" ? "Site visit scheduled" : status === "Submitted" ? "Under review" : "Onboarding";
  return <span className="inline-flex items-center gap-1 rounded-full border border-amber-600 bg-amber-bg px-2.5 py-0.5 text-[11px] font-medium text-amber-500">{label}</span>;
}

/** Raw single-file uploader → returns object key via callback (used for KYC/KYB). */
export function KycFileUpload({
  label, scope = "kyc", accept = "image/*,application/pdf", value, onUploaded, buttonLabel = "Upload",
}: {
  label: string; scope?: string; accept?: string; value?: string; onUploaded: (key: string, name: string) => void; buttonLabel?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  async function handle(file: File) {
    setBusy(true); setErr("");
    try {
      const { uploadRaw } = await import("../lib/tenders");
      const key = await uploadRaw(file, scope);
      setName(file.name);
      onUploaded(key, file.name);
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(false); }
  }
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = ""; }} />
      <Button variant="subtle" disabled={busy} onClick={() => ref.current?.click()}>{busy ? "Uploading…" : (value || name) ? "Replace" : buttonLabel}</Button>
      {(name || value) && <span className="ml-2 text-xs text-good">✓ {name || "uploaded"}</span>}
      {err && <span className="ml-2 text-xs text-bad">{err}</span>}
    </div>
  );
}

/** "Your AFRIGEN Link Manager" contact card — shows the assigned KAM for suppliers. */
export function ManagerCard({ managerId, verificationStatus }: { managerId?: string | null; verificationStatus?: string }) {
  const [m, setM] = useState<{ fullName?: string; companyName?: string; phone?: string; userCode?: string } | null>(null);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (!managerId) return;
    import("../lib/tenders").then(({ ProfileAPI }) => ProfileAPI.get(managerId).then((r) => setM(r.profile)).catch(() => {}).finally(() => setTried(true)));
  }, [managerId]);
  if (!managerId) {
    return (
      <div className="mb-5 rounded-lg border border-navy-600 bg-navy-800 p-4">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">Your AFRIGEN Link manager</div>
        <p className="mt-1 text-sm text-slate-400">A Key Account Manager will be assigned to you shortly. They'll reach out to guide you through verification.</p>
      </div>
    );
  }
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-600/40 bg-amber-bg/40 p-4">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-amber-500">Your AFRIGEN Link manager</div>
        <div className="mt-1 text-sm text-slate-100">{m?.fullName || m?.companyName || (tried ? "Assigned" : "Loading…")}{m?.userCode ? <span className="ml-2 font-mono text-[11px] text-slate-500">{m.userCode}</span> : null}</div>
        {m?.phone && <div className="text-xs text-slate-400">{m.phone}</div>}
      </div>
      {verificationStatus && <VerifiedBadge status={verificationStatus} />}
    </div>
  );
}

/** Change-password form — used by forced first-login + profile screens. */
export function ChangePasswordForm({ requireCurrent = true, onDone }: { requireCurrent?: boolean; onDone?: () => void }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setOk(false);
    if (next.length < 8) return setErr("New password must be at least 8 characters.");
    if (next !== confirm) return setErr("Passwords do not match.");
    setBusy(true);
    try {
      const { ProfileAPI } = await import("../lib/tenders");
      await ProfileAPI.changePassword(cur, next);
      setOk(true); setCur(""); setNext(""); setConfirm("");
      onDone?.();
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Could not change password"); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-3 max-w-sm">
      {requireCurrent && (
        <Field label="Current password"><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} required /></Field>
      )}
      <Field label="New password"><Input type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required /></Field>
      <Field label="Confirm new password"><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required /></Field>
      {err && <div className="rounded border border-bad/40 bg-[#331816] px-3 py-2 text-xs text-[#F08982]">{err}</div>}
      {ok && <div className="rounded border border-[#1E4A2E] bg-[#16321F] px-3 py-2 text-xs text-[#5FD699]">Password updated.</div>}
      <Button type="submit" variant="amber" disabled={busy}>{busy ? "Saving…" : "Change password"}</Button>
    </form>
  );
}

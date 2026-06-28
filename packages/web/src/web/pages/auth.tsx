import { useState } from "react";
import { authClient, captureToken } from "../lib/auth";
import { api } from "../lib/api";
import { Logo } from "../components/brand";
import { Button, Field, Input, Select } from "../components/ui";

const ROLES = [
  { v: "client", label: "Enterprise Client — lease equipment & move cargo" },
  { v: "supplier", label: "Equipment / Fleet Supplier — list assets, get paid securely" },
  { v: "parts_supplier", label: "Parts Supplier — supply spares, run a POS dispatch desk" },
];

export default function Auth() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("client");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Staff log in with a username; map it to the internal synth email used by auth.
  function resolveEmail(idval: string): string {
    const v = idval.trim();
    return v.includes("@") ? v : `${v.toLowerCase()}@staff.nguzo.local`;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      if (mode === "signup") {
        // External self-registration only ever creates client / supplier / parts supplier.
        const { error } = await authClient.signUp.email(
          { name: company || email.split("@")[0], email, password },
          { onSuccess: captureToken }
        );
        if (error) throw new Error(error.message || "Sign up failed");
        await api.me.role.$post({ json: { role, companyName: company, phone } });
      } else {
        const { error } = await authClient.signIn.email(
          { email: resolveEmail(email), password },
          { onSuccess: captureToken }
        );
        if (error) throw new Error(error.message || "Sign in failed");
      }
      window.location.href = "/app";
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      {/* left: brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-navy-600 bg-navy-800 p-10 md:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #8A98AE 1px, transparent 1px), linear-gradient(to bottom, #8A98AE 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <Logo size={26} />
        <div className="relative max-w-md">
          <div className="mb-3 inline-block rounded border border-amber-600 bg-amber-bg px-2 py-1 text-[11px] font-medium text-amber-500">
            CARGO &amp; MACHINERY COORDINATION — SECURED
          </div>
          <h1 className="font-display text-3xl font-bold leading-tight text-slate-100">
            You're in the right place.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            We keep your money safe, the equipment real, and a person on the ground when it matters.
            Funds tracked, not held. A flat 10% per deal — 5% from each side. Southern, Central and
            Northern corridors, Dar to Geita — one accountable ledger.
          </p>
          <a href="/" className="mt-5 inline-flex items-center gap-1.5 font-mono text-xs text-amber-500 hover:text-amber-400">
            ← Back to nguzo.africa
          </a>
        </div>
        <div className="relative flex gap-6 text-xs text-slate-500">
          <div>
            <div className="font-display text-lg font-semibold text-slate-200">10%</div>
            per deal (5%+5%)
          </div>
          <div>
            <div className="font-display text-lg font-semibold text-slate-200">100%</div>
            capital locked
          </div>
          <div>
            <div className="font-display text-lg font-semibold text-slate-200">12–18h</div>
            parts ETA
          </div>
        </div>
      </div>

      {/* right: form */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm rise">
          <div className="mb-6 md:hidden">
            <Logo size={24} />
          </div>
          <div className="mb-6 flex gap-1 rounded-lg border border-navy-600 bg-navy-800 p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                  mode === m ? "bg-navy-700 text-slate-100 shadow-[0_1px_0_rgba(255,255,255,.05)_inset]" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <>
                <Field label="Company name">
                  <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Geita Mining Ltd" required />
                </Field>
                <Field label="Account type">
                  <Select value={role} onChange={(e) => setRole(e.target.value)}>
                    {ROLES.map((r) => (
                      <option key={r.v} value={r.v}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Phone">
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+255…" />
                </Field>
              </>
            )}
            <Field label={mode === "signin" ? "Email or username" : "Email"}>
              <Input
                type={mode === "signup" ? "email" : "text"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={mode === "signin" ? "you@company.co.tz or staff username" : "you@company.co.tz"}
                required
              />
            </Field>
            {mode === "signin" && (
              <p className="-mt-1 text-[11px] text-slate-500">Staff (Field, KAM, Admin) sign in with the username your administrator gave you.</p>
            )}
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={8} />
            </Field>

            {err && <div className="rounded border border-bad/40 bg-[#331816] px-3 py-2 text-xs text-[#F08982]">{err}</div>}

            <Button type="submit" variant="amber" className="w-full" disabled={busy}>
              {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-500">
            Demo platform · simulated escrow ledger · all figures illustrative (TZS).
          </p>
        </div>
      </div>
    </div>
  );
}

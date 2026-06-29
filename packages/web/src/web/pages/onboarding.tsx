import { useEffect, useState } from "react";
import type { Me } from "../lib/use-me";
import { Logo } from "../components/brand";
import { Button, Field, Input, Select, ChangePasswordForm, KycFileUpload } from "../components/ui";
import { OnboardingAPI } from "../lib/tenders";
import { authClient } from "../lib/auth";

function Shell({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0E1424] text-slate-100">
      <div className="mx-auto max-w-2xl px-5 py-10">
        <div className="mb-8 flex items-center justify-between">
          <Logo size={24} />
          <button onClick={() => authClient.signOut().then(() => (window.location.href = "/app"))} className="text-xs text-slate-500 hover:text-slate-300">
            Sign out
          </button>
        </div>
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        {sub && <p className="mt-2 text-sm leading-relaxed text-slate-400">{sub}</p>}
        <div className="mt-7">{children}</div>
      </div>
    </div>
  );
}

/** Forced first-login password change for admin-created staff. */
export function ForcePasswordChange() {
  return (
    <Shell
      title="Set your own password"
      sub="Your account was created by an administrator with a temporary password. Choose a new one to continue — your administrator will not know it."
    >
      <ChangePasswordForm
        requireCurrent
        onDone={() => setTimeout(() => window.location.reload(), 800)}
      />
      <p className="mt-4 text-xs text-slate-500">Use the temporary password as your “current password”.</p>
    </Shell>
  );
}

const isExternal = (role: string) => ["client", "supplier", "parts_supplier"].includes(role);
const needsSiteVisit = (role: string) => ["supplier", "parts_supplier"].includes(role);

export function OnboardingWizard({ me }: { me: Me }) {
  const role = me.profile.role;
  const external = isExternal(role);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // shared KYC
  const [fullName, setFullName] = useState(me.profile.fullName || me.user.name || "");
  const [phone, setPhone] = useState(me.profile.phone || "");
  const [nationalId, setNationalId] = useState("");
  const [nationalIdDocKey, setNationalIdDocKey] = useState("");
  const [faceImageKey, setFaceImageKey] = useState("");

  // external authoriser + company
  const [authoriserName, setAuthoriserName] = useState("");
  const [authoriserTitle, setAuthoriserTitle] = useState("");
  const [authoriserPhone, setAuthoriserPhone] = useState("");
  const [address, setAddress] = useState(me.profile.address || "");
  const [companyName, setCompanyName] = useState(me.profile.companyName || "");
  const [companyRegNo, setCompanyRegNo] = useState("");
  const [companyTin, setCompanyTin] = useState("");
  const [companySector, setCompanySector] = useState("");
  const [docs, setDocs] = useState<{ kind: string; label: string; fileKey: string }[]>([]);

  // banking (suppliers)
  const [bankName, setBankName] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNo, setBankAccountNo] = useState("");

  useEffect(() => {
    OnboardingAPI.get().then((r) => {
      const p = r.profile;
      if (p.nationalId) setNationalId(p.nationalId);
      if (p.authoriserName) setAuthoriserName(p.authoriserName);
      if (p.companyRegNo) setCompanyRegNo(p.companyRegNo);
      if (p.companyTin) setCompanyTin(p.companyTin);
      if (p.companySector) setCompanySector(p.companySector);
    }).catch(() => {});
  }, []);

  // step definitions
  const steps = external
    ? ["Your details", "Company & authoriser", "Documents", "Review"]
    : ["Your identity (KYC)", "Review"];

  function addDoc(kind: string, key: string, name: string) {
    setDocs((d) => [...d.filter((x) => x.kind !== kind), { kind, label: name, fileKey: key }]);
  }

  async function submit() {
    setBusy(true); setErr("");
    try {
      await OnboardingAPI.save({
        fullName, phone, nationalId, nationalIdDocKey, faceImageKey,
        authoriserName, authoriserTitle, authoriserPhone, address,
        companyName, companyRegNo, companyTin, companySector,
        bankName, bankAccountName, bankAccountNo,
        documents: docs,
        submit: true,
      });
      window.location.reload();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not submit"); }
    finally { setBusy(false); }
  }

  const sub = external
    ? needsSiteVisit(role)
      ? "Every AFRIGEN Link partner is verified before going live. Tell us who you are and what you can supply — then we'll arrange a site visit to confirm and activate your account."
      : "Every AFRIGEN Link partner is verified before going live. Share your company details and documents — we'll review them remotely and verify you, usually within a working day."
    : "Before you take live jobs, we need to confirm your identity. This takes two minutes.";

  return (
    <Shell title="Welcome — let's get you verified" sub={sub}>
      {/* progress */}
      <div className="mb-6 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${i <= step ? "bg-amber-500 text-navy-900" : "bg-navy-700 text-slate-500"}`}>{i + 1}</div>
            <span className={`hidden text-xs sm:block ${i === step ? "text-slate-200" : "text-slate-500"}`}>{s}</span>
            {i < steps.length - 1 && <div className={`h-px flex-1 ${i < step ? "bg-amber-600" : "bg-navy-600"}`} />}
          </div>
        ))}
      </div>

      <div className="surface-dark p-5">
        {/* ---------- EXTERNAL ---------- */}
        {external && step === 0 && (
          <div className="space-y-3">
            <Field label="Your full name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
            <Field label="Your phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+255…" /></Field>
            <Field label="National ID number"><Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} /></Field>
            <KycFileUpload label="National ID document" scope="kyc" value={nationalIdDocKey} onUploaded={(k) => setNationalIdDocKey(k)} />
            <KycFileUpload label="Your photo (face)" scope="kyc" accept="image/*" value={faceImageKey} onUploaded={(k) => setFaceImageKey(k)} />
          </div>
        )}
        {external && step === 1 && (
          <div className="space-y-3">
            <Field label="Company name"><Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></Field>
            <Field label="Office location / address"><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Plot 12, Nyerere Rd, Dar es Salaam" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Company reg. no."><Input value={companyRegNo} onChange={(e) => setCompanyRegNo(e.target.value)} /></Field>
              <Field label="TIN"><Input value={companyTin} onChange={(e) => setCompanyTin(e.target.value)} /></Field>
            </div>
            <Field label="Sector">
              <Select value={companySector} onChange={(e) => setCompanySector(e.target.value)}>
                <option value="">Select…</option>
                <option>Construction</option><option>Mining</option><option>Logistics / Transport</option>
                <option>Trading</option><option>Agriculture</option><option>Spare Parts</option><option>Other</option>
              </Select>
            </Field>
            <div className="mt-4 border-t border-navy-600 pt-4">
              <p className="mb-3 text-xs text-slate-400">Responsible authoriser (the person who signs on behalf of the company):</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name"><Input value={authoriserName} onChange={(e) => setAuthoriserName(e.target.value)} /></Field>
                <Field label="Title"><Input value={authoriserTitle} onChange={(e) => setAuthoriserTitle(e.target.value)} placeholder="e.g. Director" /></Field>
              </div>
              <Field label="Authoriser phone"><Input value={authoriserPhone} onChange={(e) => setAuthoriserPhone(e.target.value)} placeholder="+255…" /></Field>
            </div>
            {needsSiteVisit(role) && (
              <div className="mt-4 border-t border-navy-600 pt-4">
                <p className="mb-3 text-xs text-slate-400">Payout bank account (where we settle your earnings):</p>
                <Field label="Bank name"><Input value={bankName} onChange={(e) => setBankName(e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Account name"><Input value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} /></Field>
                  <Field label="Account no."><Input value={bankAccountNo} onChange={(e) => setBankAccountNo(e.target.value)} /></Field>
                </div>
              </div>
            )}
          </div>
        )}
        {external && step === 2 && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400">Upload your company documents. All files are stored securely and only viewable by AFRIGEN Link staff on your verified profile.</p>
            <KycFileUpload label="Certificate of incorporation / registration" scope="kyb" onUploaded={(k, n) => addDoc("Registration", k, n)} />
            <KycFileUpload label="TIN certificate" scope="kyb" onUploaded={(k, n) => addDoc("TIN", k, n)} />
            <KycFileUpload label="Business licence" scope="kyb" onUploaded={(k, n) => addDoc("Licence", k, n)} />
            <KycFileUpload label="Other supporting document (optional)" scope="kyb" onUploaded={(k, n) => addDoc("Other", k, n)} />
            {docs.length > 0 && <div className="text-xs text-good">✓ {docs.length} document{docs.length > 1 ? "s" : ""} attached.</div>}
          </div>
        )}
        {external && step === 3 && (
          <ReviewBlock role={role} rows={[
            ["Name", fullName], ["Phone", phone], ["Company", companyName], ["Address", address],
            ["Reg. no.", companyRegNo], ["TIN", companyTin], ["Sector", companySector],
            ["Authoriser", `${authoriserName}${authoriserTitle ? ` (${authoriserTitle})` : ""}`],
            ["Documents", `${docs.length} attached`],
          ]} />
        )}

        {/* ---------- STAFF (KYC only) ---------- */}
        {!external && step === 0 && (
          <div className="space-y-3">
            <Field label="Your full name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
            <Field label="Your phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+255…" /></Field>
            <Field label="National ID number"><Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} /></Field>
            <KycFileUpload label="National ID document" scope="kyc" value={nationalIdDocKey} onUploaded={(k) => setNationalIdDocKey(k)} />
            <KycFileUpload label="Your photo (face)" scope="kyc" accept="image/*" value={faceImageKey} onUploaded={(k) => setFaceImageKey(k)} />
          </div>
        )}
        {!external && step === 1 && (
          <ReviewBlock role={role} rows={[["Name", fullName], ["Phone", phone], ["National ID", nationalId]]} />
        )}

        {err && <div className="mt-4 rounded border border-bad/40 bg-[#331816] px-3 py-2 text-xs text-[#F08982]">{err}</div>}

        <div className="mt-6 flex justify-between">
          <Button variant="ghost" disabled={step === 0 || busy} onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</Button>
          {step < steps.length - 1 ? (
            <Button variant="amber" onClick={() => setStep((s) => s + 1)}>Continue</Button>
          ) : (
            <Button variant="amber" disabled={busy} onClick={submit}>{busy ? "Submitting…" : "Submit for verification"}</Button>
          )}
        </div>
      </div>
    </Shell>
  );
}

function ReviewBlock({ role, rows }: { role: string; rows: [string, string][] }) {
  return (
    <div>
      <p className="mb-4 text-sm text-slate-300">Please confirm your details before submitting.</p>
      <div className="divide-y divide-navy-600 rounded-lg border border-navy-600">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
            <span className="text-slate-500">{k}</span>
            <span className="text-right text-slate-200">{v || "—"}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-500">
        {needsSiteVisit(role)
          ? "After you submit, our team will arrange a physical site visit to verify your business before activating your account."
          : "After you submit, our team will review your documents and activate your account, usually within a working day."}
      </p>
    </div>
  );
}

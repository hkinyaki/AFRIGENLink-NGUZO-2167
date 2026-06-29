import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, SectionTitle, Field, Input, Button, KycFileUpload, ChangePasswordForm, VerifiedBadge } from "./ui";
import { ProfileAPI } from "../lib/tenders";
import type { Me } from "../lib/use-me";

/** Shared Profile + Settings screen — used by every dashboard at /app/profile. */
export function ProfilePage({ me }: { me: Me }) {
  const qc = useQueryClient();
  const p = me.profile;
  const [fullName, setFullName] = useState(p.fullName || "");
  const [companyName, setCompanyName] = useState(p.companyName || "");
  const [phone, setPhone] = useState(p.phone || "");
  const [photoKey, setPhotoKey] = useState(p.photoKey || "");
  const [logoKey, setLogoKey] = useState(p.logoKey || "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [bank, setBank] = useState({
    bankName: p.bankName || "",
    bankAccountName: p.bankAccountName || "",
    bankAccountNo: p.bankAccountNo || "",
    bankSwift: p.bankSwift || "",
    bankBranch: p.bankBranch || "",
  });

  const isSupplier = p.role === "supplier";
  const isStaff = ["admin", "key_account", "field"].includes(p.role);

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      const body: Record<string, unknown> = { fullName, companyName, phone, photoKey, logoKey };
      if (isSupplier) Object.assign(body, bank);
      await ProfileAPI.update(body);
      await qc.invalidateQueries({ queryKey: ["me"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <SectionTitle sub="Manage your account details, identity documents and password.">My Profile</SectionTitle>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-navy-700 text-base font-semibold text-amber-500">
              {(companyName || me.user.name || "A").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-medium text-slate-100">{companyName || me.user.name}</div>
              {p.userCode && <div className="font-mono text-[11px] text-amber-500/80">{p.userCode}</div>}
            </div>
          </div>
          {p.role !== "admin" && <VerifiedBadge status={p.verificationStatus} />}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
          <Field label={isStaff ? "Display name" : "Company name"}><Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></Field>
          <Field label="Contact number"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+255…" /></Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <KycFileUpload label="Profile photo" scope="profile" value={photoKey} onUploaded={(k) => setPhotoKey(k)} buttonLabel="Upload photo" />
          {!isStaff && <KycFileUpload label="Company logo" scope="profile" value={logoKey} onUploaded={(k) => setLogoKey(k)} buttonLabel="Upload logo" />}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Button variant="amber" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save changes"}</Button>
          {saved && <span className="text-xs text-good">✓ Saved</span>}
        </div>
      </Card>

      {isSupplier && (
        <Card>
          <SectionTitle sub="Where Nguzo settles your verified payouts. Pulled from your locked profile — never editable mid-deal.">Settlement bank details</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bank name"><Input value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} /></Field>
            <Field label="Account name"><Input value={bank.bankAccountName} onChange={(e) => setBank({ ...bank, bankAccountName: e.target.value })} /></Field>
            <Field label="Account number"><Input value={bank.bankAccountNo} onChange={(e) => setBank({ ...bank, bankAccountNo: e.target.value })} /></Field>
            <Field label="Branch"><Input value={bank.bankBranch} onChange={(e) => setBank({ ...bank, bankBranch: e.target.value })} /></Field>
            <Field label="SWIFT / routing"><Input value={bank.bankSwift} onChange={(e) => setBank({ ...bank, bankSwift: e.target.value })} /></Field>
          </div>
          <div className="mt-4">
            <Button variant="amber" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save bank details"}</Button>
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle sub="Choose a strong password you don't use elsewhere.">Change password</SectionTitle>
        <ChangePasswordForm requireCurrent />
      </Card>
    </div>
  );
}

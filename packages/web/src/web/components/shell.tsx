import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Logo } from "./brand";
import { VerifiedBadge } from "./ui";
import { authClient, clearToken } from "../lib/auth";
import type { Me } from "../lib/use-me";

export type NavItem = { label: string; href: string; icon: ReactNode };

export function AppShell({
  me,
  nav,
  children,
  ledgerSummary,
}: {
  me: Me;
  nav: NavItem[];
  children: ReactNode;
  ledgerSummary?: ReactNode;
}) {
  const [loc, navigate] = useLocation();
  const [open, setOpen] = useState(false);

  const roleLabel: Record<string, string> = {
    admin: "Operations / Admin",
    key_account: "Key Account Manager",
    client: "Enterprise Client",
    supplier: "Equipment Supplier",
    field: "Field Force",
    parts_supplier: "Parts Supplier",
  };

  async function signOut() {
    await authClient.signOut();
    clearToken();
    window.location.href = "/";
  }

  const Rail = (
    <nav className="flex h-full w-60 shrink-0 flex-col border-r border-navy-600 bg-gradient-to-b from-navy-800 to-navy-900">
      <div className="flex h-14 items-center border-b border-navy-600 px-4">
        <Logo />
      </div>
      <div className="px-4 pb-1 pt-4 text-[10px] font-medium uppercase tracking-widest text-slate-500">
        {roleLabel[me.profile.role] ?? me.profile.role}
      </div>
      <div className="flex-1 space-y-1 px-2.5">
        {nav.map((n) => {
          const active = loc === n.href || (n.href !== "/app" && loc.startsWith(n.href));
          return (
            <button
              key={n.href}
              onClick={() => {
                navigate(n.href);
                setOpen(false);
              }}
              className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                active
                  ? "bg-navy-700/80 font-medium text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,.04)]"
                  : "text-slate-400 hover:bg-navy-700/50 hover:text-slate-200"
              }`}
            >
              {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-amber-500" />}
              <span className={active ? "text-amber-500" : "text-slate-500 group-hover:text-slate-300"}>{n.icon}</span>
              {n.label}
            </button>
          );
        })}
      </div>
      <div className="m-2.5 rounded-lg border border-navy-600 bg-navy-800/60 p-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy-700 text-xs font-semibold text-amber-500">
            {(me.profile.companyName || me.user.name || "A").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-slate-200">{me.profile.companyName || me.user.name}</div>
            {me.profile.userCode && (
              <div className="font-mono text-[10px] tracking-wide text-amber-500/80">{me.profile.userCode}</div>
            )}
            <button onClick={signOut} className="text-[11px] text-slate-500 transition hover:text-amber-500">
              Sign out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-navy-900">
      {/* desktop rail */}
      <div className="hidden md:block">{Rail}</div>
      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full">{Rail}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-navy-600 bg-navy-800/80 px-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button className="md:hidden text-slate-300" onClick={() => setOpen(true)} aria-label="menu">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <div className="md:hidden">
              <Logo size={20} />
            </div>
            {ledgerSummary && <div className="hidden md:block">{ledgerSummary}</div>}
          </div>
          <div className="flex items-center gap-3">
            {me.profile.role !== "admin" && <VerifiedBadge status={me.profile.verificationStatus} />}
            <div className="hidden text-right sm:block">
              <div className="text-xs font-medium text-slate-100">{me.profile.companyName || me.user.name}</div>
              <div className="text-[10px] text-slate-500">{me.user.email}</div>
            </div>
            <div className="grid h-8 w-8 place-items-center rounded-full bg-navy-700 text-xs font-semibold text-amber-500">
              {(me.profile.companyName || me.user.name || "A").slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

export const Icons = {
  grid: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
  ),
  truck: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 3h13v13H1z"/><path d="M14 8h4l3 3v5h-7"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></svg>
  ),
  file: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
  ),
  shield: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  ),
  vault: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="4"/><path d="M12 8v1M12 15v1M8 12h1M15 12h1"/></svg>
  ),
  alert: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>
  ),
  box: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8l-9-5-9 5v8l9 5z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/></svg>
  ),
  users: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/></svg>
  ),
  map: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z"/><path d="M9 3v15M15 6v15"/></svg>
  ),
  clip: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
  ),
};

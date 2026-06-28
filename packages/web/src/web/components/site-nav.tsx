import { useState } from "react";
import { Link, useLocation } from "wouter";

const MAIN = [
  { label: "How it works", href: "/how-it-works" },
  { label: "For Clients", href: "/for-clients" },
  { label: "For Owners", href: "/for-owners" },
  { label: "About", href: "/about" },
];

const MORE = [
  { label: "Security & Trust", href: "/security" },
  { label: "FAQ", href: "/faq" },
  { label: "Insights", href: "/blog" },
  { label: "Contact", href: "/contact" },
];

export function SiteNav() {
  const [loc] = useLocation();
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);

  const linkCls = (href: string) =>
    `transition hover:text-[#141B2E] ${loc === href ? "text-[#141B2E]" : "text-[#5A6473]"}`;

  return (
    <header className="sticky top-0 z-40 border-b border-[#E5E2DA] bg-[#F7F6F3]/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo-icon.png" alt="" className="h-9 w-auto" />
          <span className="font-display text-[15px] font-extrabold tracking-tight text-[#141B2E]">
            NGUZO <span className="text-amber-600">AFRICA</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm md:flex">
          {MAIN.map((m) => (
            <Link key={m.href} href={m.href} className={linkCls(m.href)}>
              {m.label}
            </Link>
          ))}
          <div className="relative" onMouseEnter={() => setMore(true)} onMouseLeave={() => setMore(false)}>
            <button className="flex items-center gap-1 text-[#5A6473] transition hover:text-[#141B2E]">
              More
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="mt-0.5">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            {more && (
              <div className="absolute right-0 top-full w-48 rounded-xl border border-[#E5E2DA] bg-white p-1.5 shadow-lg">
                {MORE.map((m) => (
                  <Link
                    key={m.href}
                    href={m.href}
                    className="block rounded-lg px-3 py-2 text-sm text-[#5A6473] transition hover:bg-[#F7F6F3] hover:text-[#141B2E]"
                  >
                    {m.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="flex items-center gap-3">
          <a href="/app" className="hidden text-sm text-[#5A6473] hover:text-[#141B2E] sm:block">
            Sign in
          </a>
          <a
            href="/app"
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-[#141B2E] hover:bg-amber-600"
          >
            Get started
          </a>
          <button
            className="md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="#141B2E" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* mobile menu */}
      {open && (
        <div className="border-t border-[#E5E2DA] bg-[#F7F6F3] px-5 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            {[...MAIN, ...MORE].map((m) => (
              <Link
                key={m.href}
                href={m.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-[#5A6473] hover:bg-white hover:text-[#141B2E]"
              >
                {m.label}
              </Link>
            ))}
            <a href="/app" className="mt-1 rounded-lg px-3 py-2.5 text-sm text-[#5A6473]">
              Sign in
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

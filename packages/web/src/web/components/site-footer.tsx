import { Link } from "wouter";

const COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Platform",
    links: [
      { label: "How it works", href: "/how-it-works" },
      { label: "Security & Trust", href: "/security" },
      { label: "Get started", href: "/app" },
    ],
  },
  {
    title: "Who it's for",
    links: [
      { label: "For Clients", href: "/for-clients" },
      { label: "For Owners", href: "/for-owners" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Insights", href: "/blog" },
      { label: "Contact", href: "/contact" },
      { label: "FAQ", href: "/faq" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "/legal/terms" },
      { label: "Privacy", href: "/legal/privacy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-navy-900 text-slate-100">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <img src="/logo-icon.png" alt="" className="h-9 w-auto" />
              <span className="font-display text-sm font-extrabold tracking-tight text-slate-100">
                NGUZO <span className="text-amber-400">AFRICA</span>
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
              Cargo &amp; machinery coordination, secured. We keep the money safe, the equipment real,
              and a person on the ground when it matters.
            </p>
            <a
              href="mailto:hello@nguzo.africa"
              className="mt-4 inline-block font-mono text-sm text-amber-400 hover:text-amber-500"
            >
              hello@nguzo.africa
            </a>
          </div>
          {COLS.map((c) => (
            <div key={c.title}>
              <div className="font-mono text-xs uppercase tracking-widest text-slate-500">{c.title}</div>
              <div className="mt-4 flex flex-col gap-2.5">
                {c.links.map((l) => (
                  <Link key={l.href} href={l.href} className="text-sm text-slate-300 hover:text-slate-100">
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-navy-600 pt-6 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
          <p className="font-mono">Dar es Salaam, Tanzania · Central &amp; Southern corridors</p>
          <p className="font-mono">© {new Date().getFullYear()} Nguzo Africa Ltd</p>
        </div>
      </div>
    </footer>
  );
}

/** Shared shell for all marketing pages. */
export function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#F7F6F3] text-[#141B2E]">{children}</div>;
}

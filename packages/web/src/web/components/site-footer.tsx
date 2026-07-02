import { Link, useLocation } from "wouter";
import { scrollToId } from "../lib/motion";

const COLS: { title: string; links: { label: string; id?: string; href?: string }[] }[] = [
  {
    title: "Platform",
    links: [
      { label: "How it works", id: "how-it-works" },
      { label: "Security & Trust", id: "security" },
      { label: "Get started", href: "/app" },
    ],
  },
  {
    title: "Who it's for",
    links: [
      { label: "For Clients", id: "for-clients" },
      { label: "For Owners", id: "for-owners" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", id: "about" },
      { label: "Insights", href: "/blog" },
      { label: "Contact", id: "contact" },
      { label: "FAQ", id: "faq" },
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
  const [loc, navigate] = useLocation();
  const onHome = loc === "/";

  function goTo(id: string) {
    if (onHome) {
      scrollToId(id);
      history.replaceState(null, "", `/#${id}`);
    } else {
      navigate(`/#${id}`);
    }
  }

  return (
    <footer className="bg-navy-900 text-slate-100">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <a
              href="/#top"
              onClick={(e) => { e.preventDefault(); goTo("top"); }}
              className="flex items-center gap-2.5"
            >
              <img src="/logo-icon.png" alt="" className="h-9 w-auto" />
              <span className="font-display text-sm font-extrabold tracking-tight text-slate-100">
                AFRIGEN <span className="text-amber-400">Link</span>
              </span>
            </a>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
              Cargo &amp; machinery coordination, secured. Funds monitored, not held — the equipment real,
              and a person on the ground when it matters.
            </p>
            <a
              href="mailto:hello@afrigenlink.com"
              className="mt-4 inline-block font-mono text-sm text-amber-400 hover:text-amber-500"
            >
              hello@afrigenlink.com
            </a>
          </div>
          {COLS.map((c) => (
            <div key={c.title}>
              <div className="font-mono text-xs uppercase tracking-widest text-slate-500">{c.title}</div>
              <div className="mt-4 flex flex-col gap-2.5">
                {c.links.map((l) =>
                  l.href ? (
                    <Link key={l.label} href={l.href} className="text-sm text-slate-300 hover:text-slate-100">
                      {l.label}
                    </Link>
                  ) : (
                    <button
                      key={l.label}
                      onClick={() => goTo(l.id!)}
                      className="text-left text-sm text-slate-300 hover:text-slate-100"
                    >
                      {l.label}
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-navy-600 pt-6 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
          <p className="font-mono">Dar es Salaam, Tanzania · Southern, Central &amp; Northern corridors</p>
          <p className="font-mono">© {new Date().getFullYear()} AFRIGEN Link — a brand of AFRIGEN Holdings Ltd</p>
        </div>
      </div>
    </footer>
  );
}

/** Shared shell for all marketing pages. */
export function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#F7F6F3] text-[#141B2E]">{children}</div>;
}

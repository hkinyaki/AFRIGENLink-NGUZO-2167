import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { scrollToId } from "../lib/motion";

/** Section links that live on the one-page home. */
const MAIN = [
  { label: "How it works", id: "how-it-works" },
  { label: "For Clients", id: "for-clients" },
  { label: "For Owners", id: "for-owners" },
  { label: "About", id: "about" },
];

/** Mix of on-page anchors and real routes. */
const MORE: { label: string; id?: string; href?: string }[] = [
  { label: "Security & Trust", id: "security" },
  { label: "FAQ", id: "faq" },
  { label: "Insights", href: "/blog" },
  { label: "Contact", id: "contact" },
];

const SPY_IDS = ["how-it-works", "for-clients", "for-owners", "about", "security", "faq", "contact"];

export function SiteNav() {
  const [loc, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [active, setActive] = useState<string>("");
  const [scrolled, setScrolled] = useState(false);

  const onHome = loc === "/";

  // toggle solid navy bar once the hero scrolls past
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // scroll-spy — highlight the section currently in view (home only)
  useEffect(() => {
    if (!onHome) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    SPY_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [onHome]);

  /** Jump to a section: on home use Lenis; elsewhere route to /#id. */
  function goTo(id: string, close = false) {
    if (close) setOpen(false);
    setMore(false);
    if (onHome) {
      scrollToId(id);
      history.replaceState(null, "", `/#${id}`);
    } else {
      navigate(`/#${id}`);
    }
  }

  // dark theme always (navy bar / light text); transparent only over the hero on home
  const solid = scrolled || !onHome;

  const linkCls = (id: string) =>
    `nav-underline transition hover:text-white ${active === id && onHome ? "nav-active text-white" : "text-slate-300"}`;

  return (
    <header className={`nav-dark sticky top-0 z-40 border-b ${solid ? "nav-scrolled" : ""}`}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <a
          href="/#top"
          onClick={(e) => { e.preventDefault(); goTo("top"); }}
          className="flex items-center gap-2.5"
        >
          <img src="/logo-icon.png" alt="" className="h-9 w-auto" />
          <span className="font-display text-[15px] font-extrabold tracking-tight text-white">
            AFRIGEN <span className="text-amber-400">Link</span>
          </span>
        </a>

        <nav className="hidden items-center gap-7 text-sm md:flex">
          {MAIN.map((m) => (
            <button key={m.id} onClick={() => goTo(m.id)} className={linkCls(m.id)}>
              {m.label}
            </button>
          ))}
          <div className="relative" onMouseEnter={() => setMore(true)} onMouseLeave={() => setMore(false)}>
            <button className="flex items-center gap-1 text-slate-300 transition hover:text-white">
              More
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="mt-0.5">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            {more && (
              <div className="absolute right-0 top-full w-48 rounded-xl border border-[#28324A] bg-[#0F1626] p-1.5 shadow-lg shadow-black/40">
                {MORE.map((m) =>
                  m.href ? (
                    <Link
                      key={m.label}
                      href={m.href}
                      onClick={() => setMore(false)}
                      className="block rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-[#1B2438] hover:text-white"
                    >
                      {m.label}
                    </Link>
                  ) : (
                    <button
                      key={m.label}
                      onClick={() => goTo(m.id!)}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-[#1B2438] hover:text-white"
                    >
                      {m.label}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </nav>

        <div className="flex items-center gap-3">
          <a href="/app" className="hidden text-sm text-slate-300 hover:text-white sm:block">
            Sign in
          </a>
          <a href="/app" className="cta-magnetic rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-[#141B2E] hover:bg-amber-400">
            Get started
          </a>
          <button className="md:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="#F7F6F3" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* mobile menu */}
      {open && (
        <div className="border-t border-[#28324A] bg-[#0F1626] px-5 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            {[...MAIN, ...MORE].map((m) =>
              m.href ? (
                <Link
                  key={m.label}
                  href={m.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-[#1B2438] hover:text-white"
                >
                  {m.label}
                </Link>
              ) : (
                <button
                  key={m.label}
                  onClick={() => goTo(m.id!, true)}
                  className="rounded-lg px-3 py-2.5 text-left text-sm text-slate-300 hover:bg-[#1B2438] hover:text-white"
                >
                  {m.label}
                </button>
              )
            )}
            <a href="/app" className="mt-1 rounded-lg px-3 py-2.5 text-sm text-slate-300">
              Sign in
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

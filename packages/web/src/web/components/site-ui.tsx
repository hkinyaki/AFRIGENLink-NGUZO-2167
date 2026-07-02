import { useEffect, useRef, useState, type ReactNode } from "react";
import { SiteNav } from "./site-nav";
import { SiteFooter, SiteLayout } from "./site-footer";

/** Fades + rises content into view on scroll. */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${seen ? "in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** Light feature card with hairline + hover lift. */
export function FeatureCard({
  title,
  body,
  icon,
  className = "",
}: {
  title: string;
  body: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card-lite card-lift p-7 ${className}`}>
      {icon && (
        <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-amber-500/12 text-amber-600">
          {icon}
        </div>
      )}
      <h3 className="font-display text-base font-bold text-[#141B2E]">{title}</h3>
      <p className="mt-2.5 text-sm leading-relaxed text-[#5A6473]">{body}</p>
    </div>
  );
}

/** Standard marketing page wrapper: nav + content + footer. */
export function Page({ children }: { children: React.ReactNode }) {
  return (
    <SiteLayout>
      <SiteNav />
      {children}
      <SiteFooter />
    </SiteLayout>
  );
}

/** Light page header band. */
export function PageHero({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-[#E5E2DA] bg-white">
      <div
        className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full opacity-[0.07]"
        style={{ background: "radial-gradient(circle, #D99A2B 0%, transparent 70%)" }}
      />
      <div className="relative mx-auto max-w-6xl px-5 py-20 md:py-28">
        <p className="eyebrow text-amber-600">{eyebrow}</p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-extrabold leading-[1.06] tracking-display text-[#141B2E] md:text-[3.4rem]">
          {title}
        </h1>
        {intro && <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#5A6473]">{intro}</p>}
        {children}
      </div>
    </section>
  );
}

/** Cinematic full-bleed image page hero — photo + navy/amber overlay + headline. */
export function PageHeroImage({
  image,
  eyebrow,
  title,
  intro,
  chip,
  children,
}: {
  image: string;
  eyebrow: string;
  title: React.ReactNode;
  intro?: string;
  chip?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative">
      <div className="relative bg-cover bg-center" style={{ backgroundImage: `url('${image}')` }}>
        {/* legibility overlays — same language as home hero */}
        <div className="absolute inset-0 bg-gradient-to-r from-navy-900/92 via-navy-900/72 to-navy-900/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-900/85 via-transparent to-navy-900/30" />
        <div className="relative mx-auto flex min-h-[56vh] max-w-6xl flex-col justify-center px-5 pt-28 pb-20 md:min-h-[60vh] md:pt-32 md:pb-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 font-mono text-xs uppercase tracking-widest text-white backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {chip ?? eyebrow}
            </div>
            <h1 className="mt-6 font-display text-4xl font-extrabold leading-[1.05] tracking-display text-white md:text-[3.4rem]">
              {title}
            </h1>
            {intro && <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-200">{intro}</p>}
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow text-amber-600">{children}</p>;
}

export function H2({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`font-display text-3xl font-bold tracking-display text-[#141B2E] md:text-4xl ${className}`}>
      {children}
    </h2>
  );
}

export function Lead({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-base leading-relaxed text-[#5A6473] ${className}`}>{children}</p>;
}

export function CTASection({
  title = "Ready when you are.",
  body = "Tell us what you need to move or rent. We'll take it from there — funds monitored, not held, every step of the way.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <section className="bg-[#F7F6F3]">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <div className="flex flex-col gap-6 rounded-[1.5rem] border border-[#E5E2DA] bg-white p-10 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-display text-2xl font-bold text-[#141B2E]">{title}</h3>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#5A6473]">{body}</p>
          </div>
          <div className="flex shrink-0 gap-3">
            <a
              href="/app"
              className="rounded-lg bg-amber-500 px-6 py-3 text-center font-semibold text-[#141B2E] hover:bg-amber-600"
            >
              Get started
            </a>
            <a
              href="/contact"
              className="rounded-lg border border-[#E5E2DA] bg-white px-6 py-3 text-center font-semibold text-[#141B2E] hover:border-[#C9CFD8]"
            >
              Talk to us
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

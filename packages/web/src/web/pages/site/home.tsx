import { Link } from "wouter";
import { Page, Reveal } from "../../components/site-ui";

function MoatCard({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="surface-dark surface-lift p-8">
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/15 font-display text-sm font-bold text-amber-400">{n}</span>
        <div className="eyebrow text-amber-400/80">Moat {n}</div>
      </div>
      <h3 className="mt-4 font-display text-lg font-bold text-slate-100">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-slate-300">{body}</p>
    </div>
  );
}

const WhoIcons: Record<string, React.ReactNode> = {
  cargo: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 4h13v11H1z"/><path d="M14 8h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>,
  machine: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 21h18"/><path d="M5 21v-6l4-2 3 3"/><rect x="13" y="9" width="6" height="4" rx="1"/><path d="M19 13v4"/></svg>,
  trucks: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="1" y="6" width="14" height="10" rx="1"/><path d="M15 9h4l2 3v4h-6"/><circle cx="5" cy="18" r="1.8"/><circle cx="18" cy="18" r="1.8"/></svg>,
  owner: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/></svg>,
};

export default function Home() {
  return (
    <Page>
      {/* HERO — full-bleed background photo */}
      <section className="relative">
        <div
          className="relative bg-cover bg-center"
          style={{ backgroundImage: "url('/hero.webp')" }}
        >
          {/* legibility overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-navy-900/90 via-navy-900/70 to-navy-900/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-navy-900/85 via-transparent to-navy-900/30" />

          <div className="relative mx-auto flex min-h-[80vh] max-w-6xl flex-col justify-center px-5 pt-24 pb-28 md:min-h-[82vh] md:pb-32">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 font-mono text-xs text-white backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Tanzania · East Africa
              </div>
              <h1 className="mt-6 font-display text-[2.7rem] font-extrabold leading-[1.03] tracking-tight text-white md:text-[4.2rem]">
                Cargo and machinery,
                <br /> <span className="text-amber-400">handled with no risk to you.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-200">
                Moving cargo or renting machinery across East Africa shouldn't keep you up at night.
                We built AFRIGEN Link so it doesn't have to.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="/app"
                  className="rounded-lg bg-amber-500 px-6 py-3 font-semibold text-[#141B2E] hover:bg-amber-600"
                >
                  Find transport or machinery
                </a>
                <a
                  href="/app"
                  className="rounded-lg border border-white/30 bg-white/5 px-6 py-3 font-semibold text-white backdrop-blur hover:bg-white/10"
                >
                  List my trucks or machinery
                </a>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
                <span className="font-mono text-xs text-amber-400">FUNDS TRACKED, NOT HELD</span>
                <span className="hidden h-3 w-px bg-white/25 md:block" />
                <span className="font-mono text-xs text-slate-300">Flat 10% · every deal</span>
                <span className="hidden h-3 w-px bg-white/25 md:block" />
                <span className="font-mono text-xs text-slate-300">On-site inspections</span>
              </div>
            </div>
          </div>
        </div>

        {/* OVERLAPPING STATS CARD — straddles the hero bottom edge */}
        <div className="relative z-10 mx-auto -mt-16 max-w-5xl px-5 md:-mt-20">
          <div className="grid overflow-hidden rounded-[1.5rem] border border-[#E5E2DA] bg-white shadow-[0_30px_70px_-30px_rgba(20,27,46,0.5)] sm:grid-cols-2 lg:grid-cols-4">
            {[
              { v: "Growing", k: "Deals coordinated", amber: true },
              { v: "Growing", k: "Trucks & machines listed", amber: true },
              { v: "100%", k: "Funds secured in escrow", amber: false },
              { v: "24h", k: "Avg. payout time, goal", amber: false },
            ].map((s, i) => (
              <div
                key={s.k}
                className={`flex flex-col justify-center px-6 py-7 ${
                  s.amber ? "bg-amber-500 text-[#141B2E]" : "bg-white text-[#141B2E]"
                } ${i < 3 ? "border-b border-[#E5E2DA] sm:border-b-0 sm:border-r" : ""}`}
              >
                <span className="font-display text-3xl font-extrabold tracking-tight tnum md:text-4xl">
                  {s.v}
                </span>
                <span
                  className={`mt-1.5 text-xs uppercase tracking-wider ${
                    s.amber ? "text-[#141B2E]/70" : "text-[#5A6473]"
                  }`}
                >
                  {s.k}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THREE CALM PROMISES */}
      <section className="mx-auto max-w-5xl px-5 py-20">
        <div className="grid gap-12 text-center md:grid-cols-3">
          {[
            ["Your money is safe", "The full amount sits secured until you confirm the job is done. Not gone — just held."],
            ["The equipment is real", "Someone physically checks the machine and the yard before anything moves."],
            ["You're never alone", "If a border stalls or a part breaks 600km out, there's a real person handling it."],
          ].map(([t, b], i) => (
            <Reveal key={t} delay={i * 90}>
              <div className="mx-auto h-px w-10 bg-amber-500" />
              <h3 className="mt-5 font-display text-lg font-bold text-[#141B2E]">{t}</h3>
              <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-[#5A6473]">{b}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section id="who" className="border-y border-[#E5E2DA] bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="max-w-2xl">
            <p className="eyebrow text-amber-600">Who it's for</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-display text-[#141B2E] md:text-4xl">
              Whichever side you're on, we've got you.
            </h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[
              ["You need cargo moved", "Sand, aggregate, general freight — a verified truck, with zero performance risk on your side.", "/for-clients", "cargo"],
              ["You need machinery", "Excavators, graders, tippers — rent real equipment with your money held safely until it's done.", "/for-clients", "machine"],
              ["You own trucks", "Win loads and tenders. Get paid, guaranteed, the moment the job is signed off.", "/for-owners", "trucks"],
              ["You own machinery", "Rent your equipment to vetted clients, fully protected from non-payment.", "/for-owners", "owner"],
            ].map(([t, b, href, ic], i) => (
              <Reveal key={t} delay={i * 70}>
                <Link href={href} className="card-lite card-lift block h-full p-7">
                  <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-amber-500/12 text-amber-600">
                    {WhoIcons[ic]}
                  </div>
                  <h3 className="font-display text-base font-bold text-[#141B2E]">{t}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-[#5A6473]">{b}</p>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ON-THE-GROUND STRIP */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div className="overflow-hidden rounded-[1.5rem] border border-[#E5E2DA] shadow-[0_24px_60px_-30px_rgba(20,27,46,0.3)]">
            <img src="/ground-inspection.webp" alt="A field inspector checking an excavator in the yard" className="h-72 w-full object-cover md:h-96" />
          </div>
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-amber-600">People, not just software</p>
            <h2 className="mt-3 font-display text-2xl font-bold text-[#141B2E] md:text-3xl">
              A real person is on the ground before your money moves.
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-[#5A6473]">
              Field inspectors check the machine and the yard. Border liaison agents stand at Tunduma,
              Namanga and the western posts to clear the bottlenecks by hand. That's the part a clone can't copy.
            </p>
            <Link href="/how-it-works" className="mt-6 inline-flex items-center gap-1.5 font-semibold text-amber-600 hover:text-amber-500">
              See how it works
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ABOUT teaser — minimal, links to /about */}
      <section id="about" className="border-b border-[#E5E2DA] bg-white">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <div className="grid gap-12 md:grid-cols-[1.1fr_0.9fr] md:items-center">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-amber-600">About AFRIGEN Link</p>
              <h2 className="mt-3 font-display text-3xl font-bold text-[#141B2E] md:text-4xl">
                Africa doesn't have a payment problem. It has a trust problem.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-[#5A6473]">
                We've watched good deals fall apart for the same few reasons, over and over. So we built
                AFRIGEN Link around fixing exactly those — not as an app that matches you and walks away, but as
                something that stays in the deal with you until it's done.
              </p>
              <Link href="/about" className="mt-6 inline-flex items-center gap-1.5 font-semibold text-amber-600 hover:text-amber-500">
                Read our story
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Link>
            </div>
            <div className="overflow-hidden rounded-[1.5rem] border border-[#E5E2DA]">
              <img src="/border-corridor.webp" alt="Trucks clearing an East African border post at dusk" className="h-64 w-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* MOATS teaser — three reasons, link to /security */}
      <section className="bg-navy-800 text-slate-100">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <div className="max-w-2xl">
            <h3 className="font-display text-2xl font-bold md:text-3xl">Why this isn't just another marketplace.</h3>
            <p className="mt-4 text-base leading-relaxed text-slate-300">
              A software clone can copy these screens. It can't copy the people on the ground.
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              ["1", "Money held, not just matched", "100% of project capital locked in escrow before work starts, auto split-settled on sign-off. Suppliers know they'll get paid; clients know their money is safe."],
              ["2", "Boots on the ground", "Field inspectors audit machines in the yard. Border liaison agents stand at the OSBPs to resolve portal failures by hand. People are the product."],
              ["3", "Escrow-as-credit", "A supplier mid-job can draw an emergency spare part against the locked escrow — shipped same-day from our Dar parts network. Credit with zero lending risk."],
            ].map(([n, t, b], i) => (
              <Reveal key={n} delay={i * 90}>
                <MoatCard n={n} title={t} body={b} />
              </Reveal>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/how-it-works" className="rounded-lg bg-amber-500 px-5 py-2.5 font-semibold text-[#141B2E] hover:bg-amber-600">
              See the full flow
            </Link>
            <Link href="/security" className="rounded-lg border border-white/15 px-5 py-2.5 font-semibold text-slate-100 hover:border-white/30">
              How we keep you safe
            </Link>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="bg-[#F7F6F3]">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="flex flex-col gap-6 rounded-[1.5rem] border border-[#E5E2DA] bg-white p-10 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-display text-2xl font-bold text-[#141B2E]">Want to talk it through first?</h3>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#5A6473]">
                That's completely fine — most people do. Funds are currently{" "}
                <span className="font-mono text-amber-600">tracked, not held</span> while we onboard a
                licensed escrow partner. A flat, transparent 10% on every deal. No owned fleet, no unsecured
                lending. Tanzania HQ, serving the Southern, Central and Northern corridors. Reach out and we'll walk
                you through it.
              </p>
              <a href="mailto:hello@afrigen.link" className="mt-4 inline-block font-mono text-sm text-amber-600 hover:text-amber-500">
                hello@afrigen.link
              </a>
            </div>
            <Link
              href="/contact"
              className="shrink-0 rounded-lg bg-amber-500 px-6 py-3 text-center font-semibold text-[#141B2E] hover:bg-amber-600"
            >
              Talk to us
            </Link>
          </div>
        </div>
      </section>
    </Page>
  );
}

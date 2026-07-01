import { useEffect, useState } from "react";
import { Page } from "../../components/site-ui";
import { useSiteMotion } from "../../lib/motion";

/* live HUD readout — cycles corridor status lines, respects reduced-motion */
const HUD_LINES = [
  "SOUTHERN · TUNDUMA → ZAMBIA · CLEAR",
  "CENTRAL · RWANDA / BURUNDI · CLEAR",
  "NORTHERN · NAMANGA → KENYA · CLEAR",
  "ESCROW · MONITORED, NOT HELD",
  "06°48′S 39°17′E · DAR ES SALAAM",
];
function HudTick() {
  const [i, setI] = useState(0);
  const [out, setOut] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = setInterval(() => {
      setOut(true);
      setTimeout(() => {
        setI((n) => (n + 1) % HUD_LINES.length);
        setOut(false);
      }, 400);
    }, 2600);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="readout hidden text-slate-400 md:inline-flex md:items-center md:gap-2">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      <span className={"hud-tick" + (out ? " hud-out" : "")}>{HUD_LINES[i]}</span>
    </span>
  );
}

/* ── icons ─────────────────────────────────────────────────────── */
const WhoIcons: Record<string, React.ReactNode> = {
  cargo: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M1 4h13v11H1z"/><path d="M14 8h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>,
  machine: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 21h18"/><path d="M5 21v-6l4-2 3 3"/><rect x="13" y="9" width="6" height="4" rx="1"/><path d="M19 13v4"/></svg>,
  trucks: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="1" y="6" width="14" height="10" rx="1"/><path d="M15 9h4l2 3v4h-6"/><circle cx="5" cy="18" r="1.8"/><circle cx="18" cy="18" r="1.8"/></svg>,
  owner: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/></svg>,
};

/* hero word split — reuses motion engine [data-anim="hero-word"] hook */
function HeroWords({ text, amber = false }: { text: string; amber?: boolean }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <span key={i} className="hero-word-mask">
          <span data-anim="hero-word" className={amber ? "text-amber-400" : ""}>{w}</span>
          {"\u00A0"}
        </span>
      ))}
    </>
  );
}

/* the three-corridor spine + nodes (fixed, left gutter) — on-concept */
function CorridorSpine() {
  return (
    <>
      <div className="corridor-spine" aria-hidden="true">
        <svg viewBox="0 0 22 1000" preserveAspectRatio="none">
          <line x1="11" y1="0" x2="11" y2="1000" stroke="#2A3654" strokeWidth="1.5" />
          <path data-spine-path d="M11 0 L11 1000" stroke="#D99A2B" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </svg>
      </div>
      <div className="corridor-node" data-node="how-it-works" style={{ top: "26vh" }} aria-hidden="true">
        <span className="node-dot" /><span className="node-label">Southern · Tunduma → Zambia</span>
      </div>
      <div className="corridor-node" data-node="about" style={{ top: "48vh" }} aria-hidden="true">
        <span className="node-dot" /><span className="node-label">Central · → Rwanda / Burundi</span>
      </div>
      <div className="corridor-node" data-node="security" style={{ top: "70vh" }} aria-hidden="true">
        <span className="node-dot" /><span className="node-label">Northern · Namanga → Kenya</span>
      </div>
    </>
  );
}

/* ── page ──────────────────────────────────────────────────────── */
export default function Home() {
  useSiteMotion();

  return (
    <Page>
      <div className="-mt-16 bg-navy-900 text-slate-200">
      <CorridorSpine />

      {/* ══ HERO — full-screen ops deck ══ */}
      <section id="top" className="deck-panel deck-grid relative flex min-h-screen flex-col">
        <div className="absolute inset-0" data-anim="kenburns">
          <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: "url('/hero.webp')" }} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-navy-900 via-navy-900/85 to-navy-900/45" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-900 via-transparent to-navy-900/60" />
        <div className="amber-glow" style={{ top: "-8rem", right: "-6rem", width: "34rem", height: "34rem" }} />

        {/* corner HUD readout */}
        <div className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-28">
          <span className="readout text-amber-400">▲ AFRIGEN LINK · OPERATIONS</span>
          <HudTick />
        </div>

        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 py-16">
          <div className="max-w-3xl">
            <div data-anim="hero-rise" className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3.5 py-1.5 readout text-amber-300 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Tanzania · East Africa
            </div>
            <h1 className="mt-6 font-display text-[2.9rem] font-extrabold leading-[1.02] tracking-tight text-white md:text-[5rem]">
              <HeroWords text="Cargo and machinery," />
              <br />
              <HeroWords text="handled with no risk to you." amber />
            </h1>
            <p data-anim="hero-rise" className="mt-7 max-w-xl text-lg leading-relaxed text-slate-200">
              Moving cargo or renting machinery across East Africa shouldn't keep you up at night.
              We built AFRIGEN Link so it doesn't have to.
            </p>
            <div data-anim="hero-rise" className="mt-9 flex flex-wrap gap-3">
              <a href="/app" className="cta-magnetic rounded-lg bg-amber-500 px-6 py-3 font-semibold text-[#141B2E] hover:bg-amber-600">
                Find transport or machinery
              </a>
              <a href="/app" className="cta-magnetic rounded-lg border border-white/25 bg-white/5 px-6 py-3 font-semibold text-white backdrop-blur hover:bg-white/10">
                List my trucks or machinery
              </a>
            </div>
          </div>
        </div>

        {/* live status readout row — replaces the old white stats card */}
        <div className="relative z-10 border-t border-navy-600/70 bg-navy-900/60 backdrop-blur">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px px-5 md:grid-cols-4">
            {[
              { v: "Growing", k: "Deals coordinated", count: null as number | null },
              { v: "Growing", k: "Trucks & machines listed", count: null as number | null },
              { v: "100", k: "Funds secured in escrow", count: 100, suffix: "%" },
              { v: "24", k: "Avg. payout time, goal", count: 24, suffix: "h" },
            ].map((s) => (
              <div key={s.k} className="flex flex-col justify-center py-6">
                {s.count != null ? (
                  <span className="font-display text-2xl font-extrabold tracking-tight tnum text-amber-400 md:text-3xl" data-count={s.count} data-suffix={s.suffix}>
                    0{s.suffix}
                  </span>
                ) : (
                  <span className="font-display text-2xl font-extrabold tracking-tight text-amber-400 md:text-3xl">{s.v}</span>
                )}
                <span className="mt-1 readout text-slate-400">{s.k}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ STATUS TICKER ══ */}
      <section className="marquee border-y border-navy-600 bg-navy-900 py-4">
        <div className="marquee-track">
          {[0, 1].map((rep) => (
            <div key={rep} className="flex items-center" aria-hidden={rep === 1}>
              {[
                "Dar es Salaam · HQ",
                "Southern · Tunduma → Zambia",
                "Central · Toward Rwanda / Burundi",
                "Northern · Namanga → Kenya",
                "Funds monitored, not held",
                "Flat 10% · every deal",
                "On-site inspections",
              ].map((t, i) => (
                <span key={i} className="flex items-center">
                  <span className="mx-6 readout text-slate-400">{t}</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ══ THREE PROMISES ══ */}
      <section className="deck-panel deck-grid py-28">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-14 md:grid-cols-3" data-reveal-group>
            {[
              ["Your money is safe", "The full amount sits secured until you confirm the job is done. Tracked and visible, released to no one early."],
              ["The equipment is real", "Someone physically checks the machine and the yard before anything moves."],
              ["You're never alone", "If a border stalls or a part breaks 600km out, there's a real person handling it."],
            ].map(([t, b]) => (
              <div key={t}>
                <span className="tick" />
                <h3 className="mt-5 font-display text-xl font-bold text-white">{t}</h3>
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-400">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS — flow console ══ */}
      <section id="how-it-works" className="deck-panel border-t border-navy-600 bg-navy-800">
        <div className="mx-auto max-w-4xl px-5 py-28">
          <div className="max-w-2xl" data-reveal>
            <p className="readout text-amber-400">How it works</p>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-display text-white md:text-4xl">
              One secured flow, from the first message to final payment.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-slate-300">
              We don't match you and walk away. We stay inside the deal — overseeing the money, checking the
              equipment, clearing the borders — until the job is done and everyone's paid.
            </p>
          </div>

          <div className="relative mt-16 flex flex-col">
            <div className="absolute left-[19px] top-3 bottom-3 w-px bg-gradient-to-b from-amber-500/70 via-navy-600 to-transparent md:left-[23px]" />
            <div data-reveal-group>
              {[
                ["01", "Post the job", "Need cargo moved or machinery rented? Post it with your route, dates and load. Own trucks or equipment? List them once and get matched to live work."],
                ["02", "Fund escrow", "The client funds the full project value into escrow. The money is locked — visible to both sides, released to nobody until the work is verified and signed off."],
                ["03", "We verify on the ground", "A field inspector physically audits the machine, the yard and the paperwork before anything moves. No photo-swap or shell-company trick survives a person standing in the yard."],
                ["04", "Route & clear", "Domestic jobs run on local municipal and TARURA heavy-load clearances. Cross-border jobs spin up TANSAD validation, destination tariffs and border-dispatch alerts — with a liaison agent at the OSBP to clear portal failures by hand."],
                ["05", "Emergency parts, covered", "Breakdown 600km upcountry? Because the capital is already locked in escrow, we approve and ship the spare part same-day from our Dar parts network. Credit, with zero lending risk to anyone."],
                ["06", "Sign off → auto-settle", "On client sign-off, escrow splits automatically: the supplier is paid, our flat 10% is taken, and itemized invoices land with both parties. No chasing, no 90-day wait."],
              ].map(([n, t, b]) => (
                <div key={n} className="relative grid grid-cols-[auto_1fr] gap-6 pb-10">
                  <div className="z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-amber-500/50 bg-navy-900 readout text-amber-400 shadow-[0_0_18px_-4px_rgba(217,154,43,.6)] md:h-12 md:w-12">
                    {n}
                  </div>
                  <div className="pt-1">
                    <h3 className="font-display text-xl font-bold text-white">{t}</h3>
                    <p className="mt-2.5 text-base leading-relaxed text-slate-300">{b}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ CORRIDOR MAP — live ops map panel (centrepiece) ══ */}
      <section className="deck-panel deck-grid relative min-h-screen">
        <div className="absolute inset-0" data-parallax>
          <img src="/section-corridor-map.webp" alt="East African trade corridors served by AFRIGEN Link" className="h-full w-full scale-110 object-cover opacity-40" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-navy-900 via-navy-900/70 to-navy-900/30" />

        {/* drawn corridor routes (Dar HQ → three corridors) */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          data-route-draw
        >
          <path className="route-line-base" d="M24,58 L40,78" />
          <path className="route-line-base" d="M24,58 L54,40" />
          <path className="route-line-base" d="M24,58 L44,24" />
          <path className="route-line" data-arms="southern" d="M24,58 L40,78" />
          <path className="route-line" data-arms="central" d="M24,58 L54,40" />
          <path className="route-line" data-arms="northern" d="M24,58 L44,24" />
          <circle className="route-pulse" r="0.9" cx="24" cy="58" />
          <circle className="route-pulse" r="0.9" cx="24" cy="58" />
          <circle className="route-pulse" r="0.9" cx="24" cy="58" />
        </svg>

        {/* pulsing map nodes */}
        <div className="map-node" data-map-node="hq" style={{ top: "58%", left: "24%" }} aria-hidden="true">
          <span className="dot" /><span className="ml readout text-amber-300">Dar es Salaam · HQ</span>
        </div>
        <div className="map-node" data-map-node="southern" style={{ top: "78%", left: "40%" }} aria-hidden="true">
          <span className="dot" /><span className="ml readout text-slate-300">Southern · Tunduma → Zambia</span>
        </div>
        <div className="map-node" data-map-node="central" style={{ top: "40%", left: "54%" }} aria-hidden="true">
          <span className="dot" /><span className="ml readout text-slate-300">Central · → Rwanda / Burundi</span>
        </div>
        <div className="map-node" data-map-node="northern" style={{ top: "24%", left: "44%" }} aria-hidden="true">
          <span className="dot" /><span className="ml readout text-slate-300">Northern · Namanga → Kenya</span>
        </div>

        <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl items-center px-5 py-28">
          <div className="max-w-lg" data-reveal>
            <p className="readout text-amber-400">Routing &amp; borders</p>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-display text-white md:text-5xl">
              We know the corridors — and the people on them.
            </h2>
            <p className="mt-6 text-base leading-relaxed text-slate-300">
              Domestic jobs run on local clearances. Cross-border loads spin up destination documentation and
              dispatch alerts — and we station a liaison agent at the OSBP to clear portal failures and stalls
              by hand. We work three corridors: the Southern (Tunduma into Zambia), the Central (toward Rwanda
              and Burundi) and the Northern (Namanga toward Kenya). Software can't argue with a stuck barrier.
              A person can.
            </p>
          </div>
        </div>
      </section>

      {/* ══ WHO IT'S FOR ══ */}
      <section id="for-clients" className="deck-panel border-t border-navy-600 bg-navy-800">
        <div className="mx-auto max-w-6xl px-5 py-28">
          <div className="max-w-2xl" data-reveal>
            <p className="readout text-amber-400">Who it's for</p>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-display text-white md:text-4xl">
              Whichever side you're on, we've got you.
            </h2>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4" data-reveal-group>
            {[
              ["You need cargo moved", "Sand, aggregate, general freight — a verified truck, with zero performance risk on your side.", "cargo"],
              ["You need machinery", "Excavators, graders, tippers — rent real equipment with your money secured in escrow until it's done.", "machine"],
              ["You own trucks", "Win loads and tenders. Get paid, guaranteed, the moment the job is signed off.", "trucks"],
              ["You own machinery", "Rent your equipment to vetted clients, fully protected from non-payment.", "owner"],
            ].map(([t, b, ic]) => (
              <div key={t} className="instr h-full p-7">
                <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-amber-500/12 text-amber-400">
                  {WhoIcons[ic]}
                </div>
                <h3 className="font-display text-base font-bold text-white">{t}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-400">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FOR CLIENTS — full-bleed split ══ */}
      <section className="deck-panel grid items-stretch lg:grid-cols-2">
        <div className="relative min-h-[22rem] overflow-hidden" data-clip>
          <img src="/section-cargo.webp" alt="Modern truck loaded with cargo at the port" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-navy-900/70 to-transparent lg:bg-gradient-to-r" />
        </div>
        <div className="bg-navy-900 px-5 py-24 md:px-14">
          <div className="mx-auto max-w-xl" data-reveal>
            <p className="readout text-amber-400">For clients</p>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-display text-white md:text-4xl">
              Your money never moves until the job is real.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-slate-300">
              Construction firms, mining operations and traders come to us for one reason: certified
              equipment and reliable transport with zero performance risk on their side. One desk for both
              sides of the job — cargo or machinery.
            </p>
          </div>
          <div className="mx-auto mt-10 grid max-w-xl gap-4 sm:grid-cols-2" data-reveal-group>
            {[
              ["The machine is verified before you pay", "A field inspector physically checks the equipment and the yard's legality. The grader you saw is the grader that shows up — or the deal doesn't proceed."],
              ["Your capital sits in escrow", "You fund the project into escrow, where it stays locked until you sign off that the work is done. No upfront deposit vanishing into the wind."],
              ["Borders handled for you", "Cross-border load? We assemble the permits and station a liaison agent at Tunduma, Namanga or the western posts to clear bottlenecks by hand when the portals fail."],
              ["A person when it breaks", "Breakdown upcountry won't strand your project. We ship the emergency part same-day against the escrow you've already funded."],
            ].map(([t, b]) => (
              <div key={t} className="instr h-full p-6">
                <h3 className="font-display text-base font-bold text-white">{t}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-400">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FOR OWNERS — full-bleed split ══ */}
      <section id="for-owners" className="deck-panel grid items-stretch lg:grid-cols-2">
        <div className="order-2 bg-navy-800 px-5 py-24 md:px-14 lg:order-1">
          <div className="mx-auto max-w-xl" data-reveal>
            <p className="readout text-amber-400">For fleet &amp; equipment owners</p>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-display text-white md:text-4xl">
              Guaranteed payment, the moment the job is signed off.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-slate-300">
              If you own trucks or machinery, your biggest risk isn't finding work — it's finding clients who
              pay. We remove that risk entirely.
            </p>
          </div>
          <div className="mx-auto mt-10 grid max-w-xl gap-4 sm:grid-cols-2" data-reveal-group>
            {[
              ["The money is already there", "Before you turn a wheel, the client's full payment is locked in escrow. You're not chasing an invoice — you're completing a funded job."],
              ["No 30-to-90-day wait", "On sign-off, escrow splits automatically and you're paid. No predatory broker holding your money, no delayed terms."],
              ["Win loads and tenders", "List your fleet or equipment once and get matched to live cargo and rental work across the corridors we serve."],
              ["Emergency parts on credit", "Mid-job breakdown? Draw a spare part against the locked escrow and keep moving. We ship same-day from Dar; it's settled at payout."],
            ].map(([t, b]) => (
              <div key={t} className="instr h-full p-6">
                <h3 className="font-display text-base font-bold text-white">{t}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-400">{b}</p>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-10 max-w-xl" data-reveal>
            <p className="readout text-amber-400">Verification cuts both ways</p>
            <h3 className="mt-3 font-display text-2xl font-bold tracking-display text-white md:text-3xl">
              Being verified is what gets you paid more, faster.
            </h3>
            <p className="mt-4 text-base leading-relaxed text-slate-300">
              When our inspector confirms your machine and yard are exactly as listed, clients trust you
              instantly — and fund escrow without hesitation. A verified badge isn't paperwork; it's the
              reason serious clients choose your fleet over an unknown one.
            </p>
          </div>
        </div>
        <div className="relative order-1 min-h-[22rem] overflow-hidden lg:order-2" data-clip>
          <img src="/section-parts.webp" alt="Flatbed transporting an excavator on the corridor" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-navy-800/70 to-transparent lg:bg-gradient-to-l" />
        </div>
      </section>

      {/* ══ ON-THE-GROUND — full-bleed image + overlay ══ */}
      <section className="deck-panel relative flex min-h-[80vh] items-end">
        <div className="absolute inset-0" data-parallax>
          <img src="/ground-inspection.webp" alt="A field inspector checking an excavator in the yard" className="h-full w-full scale-110 object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-navy-900 via-navy-900/60 to-navy-900/20" />
        <div className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-24" data-reveal>
          <p className="readout text-amber-400">People, not just software</p>
          <h2 className="mt-4 max-w-2xl font-display text-3xl font-bold text-white md:text-5xl">
            A real person is on the ground before your money moves.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-200">
            Field inspectors check the machine and the yard. Border liaison agents stand at Tunduma,
            Namanga and the western posts to clear the bottlenecks by hand. That's the part a clone can't copy.
          </p>
        </div>
      </section>

      {/* ══ ABOUT — full-bleed statement ══ */}
      <section id="about" className="deck-panel deck-grid relative">
        <div className="absolute inset-0" data-parallax>
          <img src="/border-corridor.webp" alt="Trucks clearing an East African border post at dusk" className="h-full w-full scale-110 object-cover opacity-25" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-navy-900 via-navy-900/85 to-navy-900" />
        <div className="relative z-10 mx-auto max-w-4xl px-5 py-32" data-reveal>
          <p className="readout text-amber-400">About AFRIGEN Link</p>
          <h2 className="mt-4 font-display text-3xl font-bold text-white md:text-5xl">
            Africa doesn't have a payment problem. It has a trust problem.
          </h2>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-slate-300">
            Across East Africa, the cargo and machinery moving the economy forward runs on handshakes
            between people who've never met. A client wires a deposit and hopes the excavator is real. An
            owner does the work and hopes the payment comes. The marketplaces before us tried to solve this
            with faster matching — but faster matching of strangers who still can't trust each other just
            produces faster disappointment.
          </p>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-300">
            So we built AFRIGEN Link to <span className="font-semibold text-white">stay inside the deal</span> —
            overseeing the money in escrow, putting a real inspector in the yard, standing a liaison agent at
            the border, and settling everyone fairly by rule. We don't disappear after the match. That's
            the whole company.
          </p>
        </div>
      </section>

      {/* ══ SECURITY — instrument panel ══ */}
      <section id="security" className="deck-panel border-t border-navy-600 bg-navy-800">
        <div className="mx-auto max-w-6xl px-5 py-28">
          <div className="max-w-2xl" data-reveal>
            <p className="readout text-amber-400">Security &amp; trust</p>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-display text-white md:text-4xl">Why this isn't just another marketplace.</h2>
            <p className="mt-5 text-base leading-relaxed text-slate-300">
              A software clone can copy these screens. It can't copy the people on the ground. Three things
              lock into place on every deal — one at a time.
            </p>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-3" data-pin-sequence>
            {[
              ["1", "Money watched, not just matched", "100% of project capital committed to escrow before work starts, auto split-settled on sign-off. Suppliers know they'll get paid; clients know their money is safe. We monitor and instruct while a licensed partner holds the funds — monitored, not held by us — so both sides see exactly where the money stands."],
              ["2", "Boots on the ground", "Field inspectors audit machines in the yard. Border liaison agents stand at the OSBPs to resolve portal failures by hand. People are the product."],
              ["3", "Escrow-as-credit", "A supplier mid-job can draw an emergency spare part against the locked escrow — shipped same-day from our Dar parts network. Credit with zero lending risk."],
            ].map(([n, t, b]) => (
              <div key={n} className="instr pin-step relative h-full p-8" data-pin-step>
                <span className="lock-stamp readout" aria-hidden="true">Locked</span>
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-500/15 readout text-amber-400">{n}</span>
                <h3 className="mt-5 font-display text-lg font-bold text-white">{t}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">{b}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 max-w-3xl rounded-[1.25rem] border border-navy-600 bg-navy-900/50 p-6 text-sm leading-relaxed text-slate-300">
            <span className="readout text-amber-400">Straight talk</span>
            <p className="mt-3">
              Funds are <span className="font-mono text-amber-400">monitored, not held</span> — by design.
              We ledger every shilling transparently and show both parties exactly where the money stands,
              while a licensed escrow partner holds the funds. We deliberately never take custody of your
              money: we don't own trucks or machinery, and we don't lend unsecured. Our only revenue is the
              flat 10% on a completed deal — split 5% client, 5% supplier — so our incentive is simple: the
              job has to actually get done.
            </p>
          </div>
        </div>
      </section>

      {/* ══ FAQ — warm-white reading inset inside a dark panel ══ */}
      <section id="faq" className="deck-panel bg-navy-900 py-24">
        <div className="mx-auto max-w-3xl px-5">
          <div className="inset-paper p-8 md:p-12">
            <div data-reveal className="mb-8">
              <p className="readout text-amber-600">FAQ</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-display text-[#141B2E] md:text-4xl">
                The questions everyone asks first.
              </h2>
            </div>
            <div data-reveal-group>
              {[
                ["Do you actually hold my money?", "No — and that's deliberate. Your money is monitored, not held by us. A licensed escrow partner holds the funds while we ledger every transaction transparently and show both parties exactly where the money stands. Keeping custody out of our hands is what keeps your money safeguarded and our incentives clean — we'd rather tell you that plainly than overstate our role."],
                ["What does AFRIGEN Link charge?", "A flat 10% on every completed deal — split 5% client (added on top) and 5% supplier (deducted at settlement) — the same for cargo transport and machinery rental. No hidden markups, no per-side games. We only earn it when the job is signed off."],
                ["Do you own the trucks or machinery?", "No. We're a neutral coordinator. We don't own a fleet and we don't lend money unsecured — which keeps our incentives clean. Owners list with us; clients hire through us; we keep both sides safe."],
                ["How do you verify equipment is real?", "A field inspector physically visits the yard and audits the machine, the documents and the operator before any money moves. A photo on a listing isn't enough — a person has to stand in front of it."],
                ["What happens if there's a breakdown upcountry?", "Because the project capital is already locked in escrow, we can approve and ship an emergency spare part same-day from our Dar parts network and route it upcountry by express courier. It's settled at final payout — credit with no lending risk."],
                ["When does the owner get paid?", "On client sign-off. Escrow splits automatically — the supplier payout, our 10%, and any emergency-parts credit — with itemized invoices to both parties. No 30-to-90-day wait."],
                ["Where do you operate?", "We're headquartered in Dar es Salaam, Tanzania, and serve three corridors: the Southern Corridor (via Tunduma into Zambia), the Central Corridor (toward Rwanda and Burundi), and the Northern Corridor (via Namanga toward Kenya)."],
              ].map(([q, a]) => (
                <FaqItem key={q} q={q} a={a} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ CONTACT — closing panel ══ */}
      <section id="contact" className="deck-panel deck-grid relative">
        <div className="amber-glow" style={{ bottom: "-8rem", left: "10%", width: "30rem", height: "30rem" }} />
        <div className="relative z-10 mx-auto max-w-6xl px-5 py-28">
          <div className="flex flex-col gap-6 rounded-[1.5rem] border border-navy-600 bg-navy-800 p-10 md:flex-row md:items-center md:justify-between" data-reveal>
            <div>
              <h3 className="font-display text-2xl font-bold text-white md:text-3xl">Want to talk it through first?</h3>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
                That's completely fine — most people do. Funds are{" "}
                <span className="font-mono text-amber-400">monitored, not held</span> — a licensed escrow
                partner holds the funds while we oversee every shilling. A flat, transparent 10% on every
                deal — 5% client, 5% supplier. No
                owned fleet, no unsecured lending. Tanzania HQ, serving the Southern, Central and Northern
                corridors. Reach out and we'll walk you through it.
              </p>
              <a href="mailto:hello@afrigenlink.com" className="mt-4 inline-block font-mono text-sm text-amber-400 hover:text-amber-300">
                hello@afrigenlink.com
              </a>
            </div>
            <a href="/contact" className="cta-magnetic shrink-0 rounded-lg bg-amber-500 px-6 py-3 text-center font-semibold text-[#141B2E] hover:bg-amber-600">
              Talk to us
            </a>
          </div>
        </div>
      </section>
      </div>
    </Page>
  );
}

/* ── FAQ accordion item ────────────────────────────────────────── */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`card-lite mb-3 overflow-hidden transition-colors ${open ? "border-amber-300" : ""}`}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-6 px-7 py-6 text-left">
        <span className="font-display text-lg font-bold tracking-display text-[#141B2E]">{q}</span>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={`shrink-0 text-amber-600 transition-transform duration-300 ${open ? "rotate-45" : ""}`}>
          <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      {open && <p className="px-7 pb-6 pr-12 text-base leading-relaxed text-[#5A6473]">{a}</p>}
    </div>
  );
}

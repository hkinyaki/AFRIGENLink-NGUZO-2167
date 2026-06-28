import { Page, PageHeroImage, Eyebrow, H2, Lead, CTASection, Reveal } from "../../components/site-ui";

const STEPS = [
  ["01", "Post the job", "Need cargo moved or machinery rented? Post it with your route, dates and load. Own trucks or equipment? List them once and get matched to live work."],
  ["02", "Fund escrow", "The client funds the full project value into escrow. The money is locked — visible to both sides, released to nobody until the work is verified and signed off."],
  ["03", "We verify on the ground", "A field inspector physically audits the machine, the yard and the paperwork before anything moves. No photo-swap or shell-company trick survives a person standing in the yard."],
  ["04", "Route & clear", "Domestic jobs run on local municipal and TARURA heavy-load clearances. Cross-border jobs spin up TANSAD validation, destination tariffs and border-dispatch alerts — with a liaison agent at the OSBP to clear portal failures by hand."],
  ["05", "Emergency parts, covered", "Breakdown 600km upcountry? Because the capital is already locked in escrow, we approve and ship the spare part same-day from our Dar parts network. Credit, with zero lending risk to anyone."],
  ["06", "Sign off → auto-settle", "On client sign-off, escrow splits automatically: the supplier is paid, our flat 7% is taken, and itemized invoices land with both parties. No chasing, no 90-day wait."],
];

export default function HowItWorks() {
  return (
    <Page>
      <PageHeroImage
        image="/hero-howitworks.webp"
        eyebrow="How it works"
        chip="From first message to final payment"
        title="One secured flow, from the first message to final payment."
        intro="We don't match you and walk away. We stay inside the deal — holding the money, checking the equipment, clearing the borders — until the job is done and everyone's paid."
      />

      {/* steps — connective vertical line */}
      <section className="bg-white">
        <div className="mx-auto max-w-4xl px-5 py-20">
          <div className="relative flex flex-col gap-2">
            <div className="absolute left-[19px] top-3 bottom-3 w-px bg-gradient-to-b from-amber-500/60 via-[#E5E2DA] to-transparent md:left-[23px]" />
            {STEPS.map(([n, t, b], i) => (
              <Reveal key={n} delay={i * 60}>
                <div className="relative grid grid-cols-[auto_1fr] gap-6 pb-9">
                  <div className="z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-amber-500/40 bg-white font-display text-sm font-bold text-amber-600 shadow-[0_4px_14px_-6px_rgba(217,154,43,.5)] md:h-12 md:w-12 md:text-base">
                    {n}
                  </div>
                  <div className="pt-1">
                    <h3 className="font-display text-xl font-bold text-[#141B2E]">{t}</h3>
                    <p className="mt-2.5 text-base leading-relaxed text-[#5A6473]">{b}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* routing & borders — corridor map */}
      <section className="bg-navy-800 text-slate-100">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2">
          <div>
            <p className="eyebrow text-amber-400">Routing &amp; borders</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-display md:text-4xl">
              We know the corridors — and the people on them.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-slate-300">
              Domestic jobs run on local clearances. Cross-border loads spin up destination documentation and
              dispatch alerts — and we station a liaison agent at the OSBP to clear portal failures and stalls
              by hand. We work three corridors: the Southern (Tunduma into Zambia), the Central (toward Rwanda
              and Burundi) and the Northern (Namanga toward Kenya). Software can't argue with a stuck barrier.
              A person can.
            </p>
          </div>
          <div className="overflow-hidden rounded-[1.5rem] border border-navy-600 bg-navy-900/40 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.8)]">
            <img src="/section-corridor-map.webp" alt="East African trade corridors served by Nguzo" className="w-full" />
          </div>
        </div>
      </section>

      {/* the money model */}
      <section className="bg-[#F7F6F3]">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div className="overflow-hidden rounded-[1.5rem] border border-navy-700 shadow-[0_24px_60px_-30px_rgba(20,27,46,0.4)]">
              <img src="/section-escrow.webp" alt="How escrow holds and splits your money" className="w-full" />
            </div>
            <div>
              <Eyebrow>The money</Eyebrow>
              <H2 className="mt-3">Held safe, split fairly, no surprises.</H2>
              <Lead className="mt-4">
                Your capital is locked the moment work begins and released only on sign-off. On completion it
                splits automatically — supplier payout, our flat 7%, any parts credit — with itemized invoices
                to both sides. No human quietly skims it.
              </Lead>
            </div>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              ["100% in escrow", "The full project value is secured before any work starts. The supplier knows it's there; the client knows it won't release early."],
              ["Flat 7%, every deal", "One transparent fee on every transaction — both cargo and machinery. No hidden markups, no per-side games."],
              ["Tracked, not held — for now", "We're onboarding a licensed escrow partner. Until then, funds are tracked and ledgered transparently, never quietly pooled."],
            ].map(([t, b], i) => (
              <Reveal key={t} delay={i * 80}>
                <div className="card-lite card-lift h-full p-7">
                  <h3 className="font-display text-base font-bold text-[#141B2E]">{t}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-[#5A6473]">{b}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Lead className="mt-8 max-w-2xl">
            On sign-off the math is automatic: <span className="font-mono text-amber-600">supplier payout = escrow − 7% − any emergency-parts credit</span>, with itemized invoices generated for both sides.
          </Lead>
        </div>
      </section>

      <CTASection />
    </Page>
  );
}

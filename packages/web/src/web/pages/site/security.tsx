import { Page, PageHeroImage, Eyebrow, H2, Lead, CTASection, Reveal } from "../../components/site-ui";

export default function Security() {
  return (
    <Page>
      <PageHeroImage
        image="/hero-security.webp"
        eyebrow="Security & trust"
        chip="Checked by a person, not a promise"
        title="The whole point of AFRIGEN Link is that you don't have to trust a stranger."
        intro="We replaced 'take my word for it' with money you can see, equipment a person has checked, and a settlement that runs on rules — not promises."
      />

      {/* pillars */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Eyebrow>Three things we never compromise on</Eyebrow>
          <H2 className="mt-3">Money, machines, and people.</H2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              ["Money is secured, then split by rule", "100% of project value goes into escrow before work begins, and is released only on sign-off. The split — supplier payout, our 10%, any parts credit — runs automatically. No human can quietly skim it."],
              ["Equipment is physically inspected", "A field inspector stands in the yard and verifies the machine, the documents and the operator before your money moves. Photo-swaps and shell yards don't survive a person on-site."],
              ["A liaison agent at the border", "When a portal at Tunduma, Namanga or a western post fails, software can't fix it — a person can. We station liaison agents at the OSBPs to clear stalls by hand."],
            ].map(([t, b], i) => (
              <Reveal key={t} delay={i * 80}>
                <div className="card-lite card-lift h-full p-8">
                  <h3 className="font-display text-lg font-bold tracking-display text-[#141B2E]">{t}</h3>
                  <p className="mt-3 text-base leading-relaxed text-[#5A6473]">{b}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* honest disclosure */}
      <section className="bg-navy-800 text-slate-100">
        <div className="mx-auto max-w-3xl px-5 py-20">
          <p className="font-mono text-xs uppercase tracking-widest text-amber-400">Straight talk</p>
          <h2 className="mt-3 font-display text-2xl font-bold md:text-3xl">Where we are honest with you.</h2>
          <div className="mt-8 space-y-6 text-base leading-relaxed text-slate-300">
            <p>
              Right now, funds are <span className="font-mono text-amber-400">tracked, not held</span>.
              We ledger every shilling transparently and show both parties exactly where the money stands —
              but we are still onboarding a licensed escrow partner before we hold client funds directly.
              We'd rather tell you that plainly than pretend otherwise.
            </p>
            <p>
              We don't own trucks or machinery, and we don't lend money unsecured. Our only revenue is the
              flat 10% on a completed deal — which means our incentive is simple: the job has to actually
              get done, and both sides have to be happy enough to come back.
            </p>
          </div>
        </div>
      </section>

      {/* account security */}
      <section className="bg-[#F7F6F3]">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2">
          <div>
            <Eyebrow>Your account</Eyebrow>
            <H2 className="mt-3">Verified identities on every side.</H2>
            <Lead className="mt-4">
              Clients and owners go through KYC/KYB verification before they can transact. Internal roles —
              inspectors, border agents, admins — are provisioned by us and never self-assignable. You always
              know the party on the other side of a deal is a real, verified business.
            </Lead>
          </div>
          <div className="overflow-hidden rounded-[1.5rem] border border-navy-700 shadow-[0_24px_60px_-30px_rgba(20,27,46,0.4)]">
            <img src="/section-escrow.webp" alt="Verified, rule-based settlement flow" className="w-full" />
          </div>
        </div>
      </section>

      <CTASection />
    </Page>
  );
}

import { Page, PageHeroImage, Eyebrow, H2, CTASection, Reveal } from "../../components/site-ui";

export default function ForOwners() {
  return (
    <Page>
      <PageHeroImage
        image="/hero-owners.webp"
        eyebrow="For fleet & equipment owners"
        chip="Guaranteed payment, every job"
        title="You did the work. Getting paid shouldn't be the hard part."
        intro="If you own trucks or machinery, your biggest risk isn't finding work — it's finding clients who pay. We remove that risk entirely."
      />

      {/* what you get */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Eyebrow>Why owners work with us</Eyebrow>
          <H2 className="mt-3">Guaranteed payment, the moment the job is signed off.</H2>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {[
              ["The money is already there", "Before you turn a wheel, the client's full payment is locked in escrow. You're not chasing an invoice — you're completing a funded job."],
              ["No 30-to-90-day wait", "On sign-off, escrow splits automatically and you're paid. No predatory broker holding your money, no delayed terms."],
              ["Win loads and tenders", "List your fleet or equipment once and get matched to live cargo and rental work across the corridors we serve."],
              ["Emergency parts on credit", "Mid-job breakdown? Draw a spare part against the locked escrow and keep moving. We ship same-day from Dar; it's settled at payout."],
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

      {/* verification = trust */}
      <section className="bg-[#F7F6F3]">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div>
              <Eyebrow>Verification cuts both ways</Eyebrow>
              <H2 className="mt-3">Being verified is what gets you paid more, faster.</H2>
              <p className="mt-4 text-base leading-relaxed text-[#5A6473]">
                When our inspector confirms your machine and yard are exactly as listed, clients trust you
                instantly — and fund escrow without hesitation. A verified badge isn't paperwork; it's the
                reason serious clients choose your fleet over an unknown one.
              </p>
            </div>
            <div className="overflow-hidden rounded-[1.5rem] border border-[#E5E2DA] shadow-[0_24px_60px_-30px_rgba(20,27,46,0.3)]">
              <img src="/section-parts.webp" alt="Flatbed transporting an excavator on the corridor" className="h-80 w-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      <CTASection
        title="List your fleet and start winning funded work."
        body="Get matched to live cargo and rental jobs where the money's already secured before you start."
      />
    </Page>
  );
}

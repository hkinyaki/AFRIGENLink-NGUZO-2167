import { Page, PageHeroImage, Eyebrow, H2, Lead, CTASection, Reveal } from "../../components/site-ui";

export default function About() {
  return (
    <Page>
      <PageHeroImage
        image="/hero-about.webp"
        eyebrow="About AFRIGEN Link"
        chip="Dar es Salaam · East African corridors"
        title="Africa doesn't have a payment problem. It has a trust problem."
        intro="We started AFRIGEN Link because we kept watching good deals collapse for the same three reasons — and none of them were about money being scarce."
      />

      {/* story */}
      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-5 py-20">
          <div className="space-y-6 text-lg leading-relaxed text-[#5A6473]">
            <p>
              Across East Africa, the cargo and machinery moving the economy forward runs on handshakes
              between people who've never met. A client wires a deposit and hopes the excavator is real. An
              owner does the work and hopes the payment comes. Somewhere on a corridor, a portal fails and a
              loaded truck sits for three days.
            </p>
            <p>
              The marketplaces that came before us tried to solve this by matching buyers and sellers faster.
              But faster matching of strangers who still can't trust each other just produces faster
              disappointment. The problem was never discovery. It was trust.
            </p>
            <p>
              So we built AFRIGEN Link to <span className="font-semibold text-[#141B2E]">stay inside the deal</span> —
              holding the money in escrow, putting a real inspector in the yard, standing a liaison agent at
              the border, and settling everyone fairly by rule. We don't disappear after the match. That's the
              whole company.
            </p>
          </div>
        </div>
      </section>

      {/* what we believe */}
      <section className="bg-[#F7F6F3]">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Eyebrow>What we believe</Eyebrow>
          <H2 className="mt-3">People are the product.</H2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              ["Software can be cloned. People can't.", "Anyone can copy a dashboard. Nobody can copy a trusted inspector in the yard or an agent who knows the officers at Tunduma by name."],
              ["Be honest about where we are.", "We tell you plainly: funds are tracked, not held, until our escrow licence lands. Trust starts with not overstating."],
              ["Win only when both sides win.", "We take a flat 10% on completed deals — nothing else. We don't profit unless the job is genuinely done."],
            ].map(([t, b], i) => (
              <Reveal key={t} delay={i * 80}>
                <div className="card-lite card-lift h-full p-8">
                  <h3 className="font-display text-base font-bold tracking-display text-[#141B2E]">{t}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#5A6473]">{b}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* footprint */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2">
          <div>
            <Eyebrow>Where we operate</Eyebrow>
            <H2 className="mt-3">Tanzania HQ, East African corridors.</H2>
            <Lead className="mt-4">
              We're based in Dar es Salaam and work three corridors — the Southern (via Tunduma into Zambia),
              the Central (toward Rwanda and Burundi) and the Northern (via Namanga toward Kenya) — the long
              upcountry legs and choke points where
              deals are most likely to break, and where a person on the ground matters most.
            </Lead>
          </div>
          <div className="overflow-hidden rounded-[1.5rem] border border-navy-700 shadow-[0_24px_60px_-30px_rgba(20,27,46,0.4)]">
            <img src="/section-corridor-map.webp" alt="Southern, Central and Northern corridors across East Africa" className="w-full" />
          </div>
        </div>
      </section>

      <CTASection />
    </Page>
  );
}

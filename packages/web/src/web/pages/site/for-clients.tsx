import { Page, PageHeroImage, Eyebrow, H2, CTASection, Reveal } from "../../components/site-ui";

export default function ForClients() {
  return (
    <Page>
      <PageHeroImage
        image="/hero-clients.webp"
        eyebrow="For clients"
        chip="Zero performance risk on your side"
        title="You need it moved or you need it on-site. We make sure it actually happens."
        intro="Construction firms, mining operations and traders come to us for one reason: certified equipment and reliable transport with zero performance risk on their side."
      />

      {/* what you get */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Eyebrow>What you get</Eyebrow>
          <H2 className="mt-3">Your money never moves until the job is real.</H2>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {[
              ["The machine is verified before you pay", "A field inspector physically checks the equipment and the yard's legality. The grader you saw is the grader that shows up — or the deal doesn't proceed."],
              ["Your capital sits in escrow", "You fund the project into escrow, where it stays locked until you sign off that the work is done. No upfront deposit vanishing into the wind."],
              ["Borders handled for you", "Cross-border load? We assemble the permits and station a liaison agent at Tunduma, Namanga or the western posts to clear bottlenecks by hand when the portals fail."],
              ["A person when it breaks", "Breakdown upcountry won't strand your project. We ship the emergency part same-day against the escrow you've already funded."],
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

      {/* image strip */}
      <section className="bg-[#F7F6F3]">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div className="overflow-hidden rounded-[1.5rem] border border-[#E5E2DA] shadow-[0_24px_60px_-30px_rgba(20,27,46,0.3)]">
              <img src="/section-cargo.webp" alt="Modern truck loaded with cargo at the port" className="h-80 w-full object-cover" />
            </div>
            <div>
              <Eyebrow>Cargo or machinery</Eyebrow>
              <H2 className="mt-3">One desk for both sides of the job.</H2>
              <p className="mt-4 text-base leading-relaxed text-[#5A6473]">
                Need sand, aggregate or general freight moved? We match you to a verified truck and handle
                clearing & forwarding. Need an excavator, grader or tipper on-site? We find vetted equipment
                and protect your money the whole way. You deal with us — not a dozen brokers.
              </p>
            </div>
          </div>
        </div>
      </section>

      <CTASection
        title="Tell us what you need moved or rented."
        body="Post the job and we'll match you to verified capacity — with your money held safe until it's done."
      />
    </Page>
  );
}

import { useParams, Link, Redirect } from "wouter";
import { Page, PageHero, Reveal } from "../../components/site-ui";

const TERMS: { h: string; p: string }[] = [
  { h: "1. Who we are", p: "AFRIGEN Link Ltd ('AFRIGEN Link', 'we', 'us') is a cargo and machinery coordination service headquartered in Dar es Salaam, Tanzania, operating across the Southern, Central and Northern corridors of East Africa. We connect clients who need transport or equipment with the owners who provide it, and we coordinate the deal end to end." },
  { h: "2. Our role", p: "We are a neutral coordinator. We do not own trucks or machinery, and we do not provide unsecured lending. We facilitate verification, routing, documentation and settlement between clients and owners, and charge a flat 10% service fee on completed deals (5% client, 5% supplier)." },
  { h: "3. Funds", p: "At this stage, funds are tracked, not held. We ledger every transaction transparently and display the status to both parties, but we are onboarding a licensed escrow partner before holding client funds directly. We will update these terms when that capability is live." },
  { h: "4. Verification", p: "Clients and owners must complete identity and business verification (KYC/KYB) before transacting. Equipment may be subject to physical inspection by our field agents. We may decline or suspend any account or deal that fails verification or that we reasonably believe to be fraudulent." },
  { h: "5. Settlement", p: "On client sign-off of a completed job, the supplier payout is calculated as the funded amount less our 10% fee (5% client, 5% supplier) and any emergency-parts credit drawn during the job. Itemized records are made available to both parties." },
  { h: "6. Liability", p: "We coordinate deals in good faith but do not guarantee the performance of any third-party client or owner beyond the verification and protections described on this site. Our liability is limited to the service fees received on the relevant transaction." },
  { h: "7. Changes", p: "We may update these terms as the service evolves. Material changes will be communicated to registered users. Continued use of the platform constitutes acceptance." },
];

const PRIVACY: { h: string; p: string }[] = [
  { h: "1. What we collect", p: "We collect the information you provide when you register, request verification, or contact us — including your name, business details, contact information, and details of the cargo or equipment involved in a deal." },
  { h: "2. How we use it", p: "We use your information to verify identities, coordinate and document deals, process settlements, communicate with you, and improve the service. We do not sell your personal data." },
  { h: "3. Sharing", p: "We share the information necessary to complete a deal with the counterparty (for example, an owner's verified status with a client) and with the field agents, border liaison agents and service partners involved in fulfilling a job. We may share information where required by law." },
  { h: "4. Storage & security", p: "We store data securely and restrict internal access by role. Internal roles such as inspectors, border agents and administrators are provisioned by us and never self-assignable." },
  { h: "5. Your rights", p: "You may request access to, correction of, or deletion of your personal data by contacting us at hello@afrigen.link, subject to legal and operational record-keeping requirements." },
  { h: "6. Contact", p: "Questions about privacy? Email us at hello@afrigen.link and a real person will respond." },
];

export default function Legal() {
  const { doc } = useParams();
  if (doc !== "terms" && doc !== "privacy") return <Redirect to="/legal/terms" />;
  const isPrivacy = doc === "privacy";
  const sections = isPrivacy ? PRIVACY : TERMS;

  return (
    <Page>
      <PageHero
        eyebrow="Legal"
        title={isPrivacy ? "Privacy Policy" : "Terms of Service"}
        intro={isPrivacy ? "How we collect, use and protect your information." : "The plain terms under which we coordinate your deals."}
      >
        <div className="mt-6 flex gap-3">
          <Link href="/legal/terms" className={`rounded-lg px-4 py-2 text-sm font-semibold ${!isPrivacy ? "bg-amber-500 text-[#141B2E]" : "border border-[#E5E2DA] bg-white text-[#5A6473] hover:text-[#141B2E]"}`}>Terms</Link>
          <Link href="/legal/privacy" className={`rounded-lg px-4 py-2 text-sm font-semibold ${isPrivacy ? "bg-amber-500 text-[#141B2E]" : "border border-[#E5E2DA] bg-white text-[#5A6473] hover:text-[#141B2E]"}`}>Privacy</Link>
        </div>
      </PageHero>

      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-5 py-16">
          <p className="font-mono text-xs text-[#5A6473]">Last updated 12 June 2026</p>
          <div className="mt-8 space-y-8">
            {sections.map((s, i) => (
              <Reveal key={s.h} delay={i * 40}>
                <div>
                  <h2 className="font-display text-lg font-bold tracking-display text-[#141B2E]">{s.h}</h2>
                  <p className="mt-2.5 text-base leading-relaxed text-[#5A6473]">{s.p}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </Page>
  );
}

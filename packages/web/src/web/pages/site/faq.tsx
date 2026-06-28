import { useState } from "react";
import { Page, PageHeroImage, CTASection, Reveal } from "../../components/site-ui";

const FAQS: { q: string; a: string }[] = [
  {
    q: "Do you actually hold my money?",
    a: "Right now, funds are tracked, not held — we ledger every transaction transparently and show both parties exactly where the money stands, but we're still onboarding a licensed escrow partner before we hold client funds directly. We'd rather tell you that plainly than overstate it.",
  },
  {
    q: "What does Nguzo charge?",
    a: "A flat 7% on every completed deal — the same for cargo transport and machinery rental. No hidden markups, no per-side games. We only earn it when the job is signed off.",
  },
  {
    q: "Do you own the trucks or machinery?",
    a: "No. We're a neutral coordinator. We don't own a fleet and we don't lend money unsecured — which keeps our incentives clean. Owners list with us; clients hire through us; we keep both sides safe.",
  },
  {
    q: "How do you verify equipment is real?",
    a: "A field inspector physically visits the yard and audits the machine, the documents and the operator before any money moves. A photo on a listing isn't enough — a person has to stand in front of it.",
  },
  {
    q: "What happens if there's a breakdown upcountry?",
    a: "Because the project capital is already locked in escrow, we can approve and ship an emergency spare part same-day from our Dar parts network and route it upcountry by express courier. It's settled at final payout — credit with no lending risk.",
  },
  {
    q: "How do cross-border jobs work?",
    a: "Domestic jobs run on local municipal and TARURA clearances. Cross-border jobs spin up the destination documentation and dispatch alerts, and we station a liaison agent at the OSBP (Tunduma, Namanga or the western posts) to clear portal failures and bureaucratic stalls by hand.",
  },
  {
    q: "When does the owner get paid?",
    a: "On client sign-off. Escrow splits automatically — the supplier payout, our 7%, and any emergency-parts credit — with itemized invoices to both parties. No 30-to-90-day wait.",
  },
  {
    q: "Where do you operate?",
    a: "We're headquartered in Dar es Salaam, Tanzania, and serve three corridors: the Southern Corridor (via Tunduma into Zambia), the Central Corridor (toward Rwanda and Burundi), and the Northern Corridor (via Namanga toward Kenya).",
  },
];

function Item({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`card-lite mb-3 overflow-hidden transition-colors ${open ? "border-amber-300" : ""}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-6 px-7 py-6 text-left"
      >
        <span className="font-display text-lg font-bold tracking-display text-[#141B2E]">{q}</span>
        <svg
          width="20" height="20" viewBox="0 0 20 20" fill="none"
          className={`shrink-0 text-amber-600 transition-transform duration-300 ${open ? "rotate-45" : ""}`}
        >
          <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      {open && <p className="px-7 pb-6 pr-12 text-base leading-relaxed text-[#5A6473]">{a}</p>}
    </div>
  );
}

export default function FAQ() {
  return (
    <Page>
      <PageHeroImage
        image="/hero-faq.webp"
        eyebrow="FAQ"
        chip="Straight answers, no jargon"
        title="The questions everyone asks first."
        intro="If something here doesn't cover it, talk to us — we'd rather answer plainly than leave you guessing."
      />
      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-5 py-16">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={i * 50}>
              <Item {...f} />
            </Reveal>
          ))}
        </div>
      </section>
      <CTASection title="Still have a question?" body="Send it over — a real person will get back to you." />
    </Page>
  );
}

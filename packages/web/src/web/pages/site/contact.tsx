import { useState } from "react";
import { Page, PageHeroImage } from "../../components/site-ui";

export default function Contact() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      setSent(true);
    } catch {
      setError("Something went wrong. Please email us directly at hello@afrigenlink.com.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page>
      <PageHeroImage
        image="/hero-contact.webp"
        eyebrow="Contact"
        chip="A real person, every message"
        title="Talk to a real person."
        intro="Tell us what you need to move or rent — or just ask a question. We read every message and reply ourselves."
      />

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 md:grid-cols-[1fr_1.2fr]">
          {/* left — details */}
          <div>
            <h3 className="font-display text-xl font-bold text-[#141B2E]">Reach us directly</h3>
            <div className="mt-6 space-y-5">
              <div>
                <div className="font-mono text-xs uppercase tracking-widest text-amber-600">Email</div>
                <a href="mailto:hello@afrigenlink.com" className="mt-1 block text-base text-[#141B2E] hover:text-amber-600">
                  hello@afrigenlink.com
                </a>
              </div>
              <div>
                <div className="font-mono text-xs uppercase tracking-widest text-amber-600">Headquarters</div>
                <p className="mt-1 text-base text-[#141B2E]">Dar es Salaam, Tanzania</p>
              </div>
              <div>
                <div className="font-mono text-xs uppercase tracking-widest text-amber-600">Corridors</div>
                <p className="mt-1 text-base text-[#141B2E]">Southern, Central &amp; Northern, East Africa</p>
              </div>
            </div>
            <div className="mt-8 card-lite p-6">
              <p className="text-sm leading-relaxed text-[#5A6473]">
                Funds are currently <span className="font-mono text-amber-600">tracked, not held</span> while
                we onboard a licensed escrow partner. Flat 10% on every completed deal. No owned fleet, no
                unsecured lending.
              </p>
            </div>
            <div className="mt-6 overflow-hidden rounded-[1.25rem] border border-[#E5E2DA] shadow-[0_20px_50px_-30px_rgba(20,27,46,0.4)]">
              <img src="/hero-contact.webp" alt="Talk to a real person at AFRIGEN Link" className="h-52 w-full object-cover" />
            </div>
          </div>

          {/* right — form */}
          <div className="card-lite p-8">
            {sent ? (
              <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#BD8420" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <h3 className="mt-5 font-display text-xl font-bold text-[#141B2E]">Message received.</h3>
                <p className="mt-2 max-w-sm text-sm text-[#5A6473]">
                  Thanks for reaching out — a real person will get back to you shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field name="name" label="Your name" required />
                  <Field name="company" label="Company" />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field name="email" label="Email" type="email" required />
                  <Field name="phone" label="Phone" />
                </div>
                <div>
                  <label className="font-mono text-xs uppercase tracking-widest text-[#5A6473]">I am a…</label>
                  <select name="role" className="mt-2 w-full rounded-lg border border-[#E5E2DA] bg-white px-3.5 py-2.5 text-sm text-[#141B2E] focus:border-amber-500 focus:outline-none">
                    <option>Client — I need cargo or machinery</option>
                    <option>Owner — I have trucks or machinery</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="font-mono text-xs uppercase tracking-widest text-[#5A6473]">Message</label>
                  <textarea name="message" rows={4} required className="mt-2 w-full resize-none rounded-lg border border-[#E5E2DA] bg-white px-3.5 py-2.5 text-sm text-[#141B2E] focus:border-amber-500 focus:outline-none" placeholder="What do you need to move or rent?" />
                </div>
                {error && <p className="text-sm text-bad">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-amber-500 px-6 py-3 font-semibold text-[#141B2E] hover:bg-amber-600 disabled:opacity-60"
                >
                  {loading ? "Sending…" : "Send message"}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </Page>
  );
}

function Field({ name, label, type = "text", required = false }: { name: string; label: string; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="font-mono text-xs uppercase tracking-widest text-[#5A6473]">
        {label}{required && <span className="text-amber-600"> *</span>}
      </label>
      <input
        name={name}
        type={type}
        required={required}
        className="mt-2 w-full rounded-lg border border-[#E5E2DA] bg-white px-3.5 py-2.5 text-sm text-[#141B2E] focus:border-amber-500 focus:outline-none"
      />
    </div>
  );
}

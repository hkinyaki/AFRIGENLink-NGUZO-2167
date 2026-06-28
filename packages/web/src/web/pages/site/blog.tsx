import { Link } from "wouter";
import { Page, PageHero, Reveal } from "../../components/site-ui";
import { POSTS } from "./blog-data";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function Blog() {
  const [featured, ...rest] = POSTS;
  return (
    <Page>
      <PageHero
        eyebrow="Insights"
        title="Notes on trust, logistics and getting deals done in East Africa."
        intro="The thinking behind how we work — and what we're learning on the ground."
      />

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16">
          {/* featured */}
          <Link href={`/blog/${featured.slug}`} className="group grid items-center gap-8 md:grid-cols-2">
            <div className="overflow-hidden rounded-[1.5rem] border border-[#E5E2DA]">
              <img src={featured.cover} alt="" className="h-72 w-full object-cover transition group-hover:scale-[1.03]" />
            </div>
            <div>
              <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-widest text-amber-600">
                <span>{featured.tag}</span>
                <span className="text-[#C9CFD8]">·</span>
                <span className="text-[#5A6473]">{fmtDate(featured.date)}</span>
              </div>
              <h2 className="mt-4 font-display text-2xl font-bold leading-tight text-[#141B2E] group-hover:text-amber-600 md:text-3xl">
                {featured.title}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-[#5A6473]">{featured.excerpt}</p>
              <span className="mt-4 inline-block font-mono text-xs text-[#5A6473]">{featured.readMins} min read</span>
            </div>
          </Link>

          {/* grid */}
          <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((p, i) => (
              <Reveal key={p.slug} delay={i * 80}>
              <Link href={`/blog/${p.slug}`} className="group flex flex-col">
                <div className="overflow-hidden rounded-2xl border border-[#E5E2DA] shadow-[0_12px_36px_-22px_rgba(20,27,46,0.35)]">
                  <img src={p.cover} alt="" className="h-48 w-full object-cover transition duration-500 group-hover:scale-[1.05]" />
                </div>
                <div className="mt-4 flex items-center gap-3 font-mono text-xs uppercase tracking-widest text-amber-600">
                  <span>{p.tag}</span>
                  <span className="text-[#C9CFD8]">·</span>
                  <span className="text-[#5A6473]">{fmtDate(p.date)}</span>
                </div>
                <h3 className="mt-3 font-display text-lg font-bold leading-snug text-[#141B2E] group-hover:text-amber-600">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#5A6473]">{p.excerpt}</p>
              </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </Page>
  );
}

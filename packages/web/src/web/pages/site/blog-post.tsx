import { Link, useParams } from "wouter";
import { Page, CTASection } from "../../components/site-ui";
import { getPost, POSTS } from "./blog-data";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function BlogPost() {
  const { slug } = useParams();
  const post = slug ? getPost(slug) : undefined;

  if (!post) {
    return (
      <Page>
        <section className="mx-auto max-w-3xl px-5 py-32 text-center">
          <h1 className="font-display text-3xl font-bold text-[#141B2E]">Post not found.</h1>
          <Link href="/blog" className="mt-6 inline-block font-semibold text-amber-600 hover:text-amber-500">
            ← Back to Insights
          </Link>
        </section>
      </Page>
    );
  }

  const more = POSTS.filter((p) => p.slug !== post.slug).slice(0, 2);

  return (
    <Page>
      {/* header */}
      <section className="border-b border-[#E5E2DA] bg-white">
        <div className="mx-auto max-w-3xl px-5 pt-16 pb-10">
          <Link href="/blog" className="font-mono text-xs uppercase tracking-widest text-amber-600 hover:text-amber-500">
            ← Insights
          </Link>
          <div className="mt-6 flex items-center gap-3 font-mono text-xs uppercase tracking-widest text-[#5A6473]">
            <span className="text-amber-600">{post.tag}</span>
            <span className="text-[#C9CFD8]">·</span>
            <span>{fmtDate(post.date)}</span>
            <span className="text-[#C9CFD8]">·</span>
            <span>{post.readMins} min read</span>
          </div>
          <h1 className="mt-5 font-display text-3xl font-extrabold leading-tight tracking-tight text-[#141B2E] md:text-4xl">
            {post.title}
          </h1>
        </div>
      </section>

      {/* cover */}
      <div className="mx-auto max-w-4xl px-5">
        <div className="-mt-px overflow-hidden rounded-[1.5rem] border border-[#E5E2DA]">
          <img src={post.cover} alt="" className="h-72 w-full object-cover md:h-96" />
        </div>
      </div>

      {/* body */}
      <article className="mx-auto max-w-3xl px-5 py-16">
        {post.body.map((block, i) =>
          block.h ? (
            <h2 key={i} className="mt-10 font-display text-2xl font-bold text-[#141B2E]">{block.h}</h2>
          ) : (
            <p key={i} className="mt-5 text-lg leading-relaxed text-[#5A6473]">{block.p}</p>
          ),
        )}
      </article>

      {/* more */}
      <section className="border-t border-[#E5E2DA] bg-[#F7F6F3]">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <p className="font-mono text-xs uppercase tracking-widest text-amber-600">Keep reading</p>
          <div className="mt-8 grid gap-8 md:grid-cols-2">
            {more.map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="group flex gap-5">
                <div className="h-24 w-32 shrink-0 overflow-hidden rounded-xl border border-[#E5E2DA]">
                  <img src={p.cover} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold leading-snug text-[#141B2E] group-hover:text-amber-600">{p.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#5A6473] line-clamp-2">{p.excerpt}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CTASection />
    </Page>
  );
}

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readMins: number;
  tag: string;
  cover: string;
  body: { h?: string; p?: string }[];
};

export const POSTS: BlogPost[] = [
  {
    slug: "africa-trust-problem",
    title: "Africa doesn't have a payment problem. It has a trust problem.",
    excerpt:
      "Why faster matching of strangers who can't trust each other just produces faster disappointment — and what actually fixes it.",
    date: "2026-06-02",
    readMins: 5,
    tag: "Perspective",
    cover: "/border-corridor.webp",
    body: [
      { p: "Ask anyone moving cargo or machinery across East Africa what keeps them up at night, and almost nobody says 'access to capital.' The money exists. The deals exist. What's missing is the confidence that the other side will hold up their end." },
      { h: "The same three failures, over and over" },
      { p: "A client wires a deposit and the excavator that arrives isn't the one they inspected. A fleet owner does the work and waits 90 days to be paid — or never is. A loaded truck sits at a border for three days because a portal went down and nobody was there to fix it." },
      { p: "None of these are payment problems. They're trust problems. And the marketplaces that came before us tried to solve them by matching buyers and sellers faster. But faster matching of strangers who still can't trust each other just produces faster disappointment." },
      { h: "What actually fixes it" },
      { p: "Trust isn't a feature you bolt onto a listings page. It's structural. It means the money is held until the work is verified. It means a real person stands in the yard before anything moves. It means someone is at the border when the system fails. That's the company we built — one that stays inside the deal instead of disappearing after the match." },
    ],
  },
  {
    slug: "boots-on-the-ground",
    title: "Software can be cloned. The person in the yard can't.",
    excerpt:
      "Why our field inspectors and border liaison agents are the part of AFRIGEN Link a competitor can't copy.",
    date: "2026-05-28",
    readMins: 4,
    tag: "How we work",
    cover: "/ground-inspection.webp",
    body: [
      { p: "It's easy to copy a dashboard. Screenshots, escrow flows, settlement math — all of it can be rebuilt by a competent team in a few months. What can't be copied is a trusted inspector who knows the difference between a sound undercarriage and one that's about to fail, standing in a yard outside Geita." },
      { h: "Why we put people on the ground" },
      { p: "A photo on a listing proves nothing. Before any client's money moves, a field inspector physically audits the machine, the documents and the yard's legality. Photo-swaps and shell yards simply don't survive a person showing up in person." },
      { h: "The border is where deals die" },
      { p: "When a portal at Tunduma or Namanga fails, software can't clear it — a person can. We station border liaison agents at the OSBPs precisely because the moments that break deals are bureaucratic, human and local. That's not a cost centre. That's the product." },
    ],
  },
  {
    slug: "escrow-as-credit",
    title: "How a locked escrow becomes a same-day spare part.",
    excerpt:
      "A breakdown 600km upcountry doesn't have to strand a project. Here's the mechanism behind emergency parts.",
    date: "2026-05-20",
    readMins: 4,
    tag: "How we work",
    cover: "/hero.webp",
    body: [
      { p: "A grader throws a hydraulic line halfway through a job, hundreds of kilometres from the nearest dealer. In the old way, that's days of downtime, a scramble for cash, and a client wondering if the project will ever finish." },
      { h: "The money is already there" },
      { p: "Because the full project value is locked in escrow before work begins, we already know the capital exists to cover an emergency part. The supplier requests it through the dashboard, the system confirms the locked escrow covers the part plus shipping, and we approve the purchase from our Dar parts network." },
      { h: "Same-day, settled at payout" },
      { p: "The part goes out same-day by express courier and reaches the machine upcountry within hours. The cost is reconciled automatically at final settlement — drawn from the escrow that was always there. Credit, with zero lending risk to anyone." },
    ],
  },
];

export function getPost(slug: string) {
  return POSTS.find((p) => p.slug === slug);
}

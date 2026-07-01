/**
 * "The Corridor" — the marketing site's motion engine.
 *
 * One committed idea: scrolling the page is travelling a freight corridor out
 * of Dar es Salaam. Weighted Lenis scroll gives freight-like momentum; GSAP +
 * ScrollTrigger drive the signature moments. Everything is behind a hard
 * prefers-reduced-motion guard — if a user opts out (or JS never runs), all
 * content is fully visible with native scroll and zero animation.
 */
import { useLayoutEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/** Smooth-scroll to a section by id. Falls back to native scroll if Lenis is off. */
export function scrollToId(id: string) {
  const sel = id.startsWith("#") ? id : `#${id}`;
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) return;
  if (lenis) {
    lenis.scrollTo(el, { offset: -72, duration: 1.25 });
  } else {
    const y = el.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo({ top: y, behavior: "smooth" });
  }
}

/**
 * Boot the whole engine once (call from Home). Returns nothing; cleans up on
 * unmount. Safe to run under SSR/tests (guards on window).
 */
export function useSiteMotion() {
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = prefersReducedMotion();

    // Land on the right section if arriving with a hash (redirects, cross-page nav).
    const hash = window.location.hash?.replace("#", "");
    const scrollToHash = () => {
      if (hash && hash !== "top") window.setTimeout(() => scrollToId(hash), 120);
    };

    // ── Reduced motion: no Lenis, no GSAP. Everything visible, native scroll. ──
    if (reduced) {
      scrollToHash();
      return;
    }

    // ── Weighted smooth scroll (freight momentum, not floaty) ──────────────
    lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.2,
    });
    lenis.on("scroll", ScrollTrigger.update);
    const raf = (time: number) => lenis?.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    const ctx = gsap.context(() => {
      // 1) HERO — word-by-word weighted mask-rise, amber word lands last ─────
      const words = gsap.utils.toArray<HTMLElement>('[data-anim="hero-word"]');
      if (words.length) {
        gsap.set(words, { yPercent: 115, opacity: 0, filter: "blur(6px)" });
        gsap.to(words, {
          yPercent: 0,
          opacity: 1,
          filter: "blur(0px)",
          duration: 1,
          ease: "expo.out",
          stagger: 0.09,
          delay: 0.15,
        });
      }
      // hero subhead / cta / meta cascade after the headline
      const heroRise = gsap.utils.toArray<HTMLElement>('[data-anim="hero-rise"]');
      if (heroRise.length) {
        gsap.set(heroRise, { y: 26, opacity: 0 });
        gsap.to(heroRise, {
          y: 0,
          opacity: 1,
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.12,
          delay: 0.55,
        });
      }

      // 2) KEN-BURNS + parallax on hero image ────────────────────────────────
      const kb = document.querySelector<HTMLElement>('[data-anim="kenburns"]');
      if (kb) {
        gsap.fromTo(
          kb,
          { scale: 1.12, yPercent: -3 },
          {
            scale: 1.0,
            yPercent: 6,
            ease: "none",
            scrollTrigger: {
              trigger: kb.closest("section"),
              start: "top top",
              end: "bottom top",
              scrub: 0.6,
            },
          }
        );
      }

      // generic parallax layers
      gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
        const speed = parseFloat(el.dataset.parallax || "0.15");
        gsap.fromTo(
          el,
          { yPercent: -speed * 50 },
          {
            yPercent: speed * 50,
            ease: "none",
            scrollTrigger: {
              trigger: el.closest("section") || el,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          }
        );
      });

      // 3) STATS count-up with slight overshoot ──────────────────────────────
      gsap.utils.toArray<HTMLElement>("[data-count]").forEach((el) => {
        const target = parseFloat(el.dataset.count || "0");
        const suffix = el.dataset.suffix || "";
        const obj = { v: 0 };
        ScrollTrigger.create({
          trigger: el,
          start: "top 88%",
          once: true,
          onEnter: () =>
            gsap.to(obj, {
              v: target,
              duration: 1.4,
              ease: "power2.out",
              onUpdate: () => {
                el.textContent = Math.round(obj.v) + suffix;
              },
            }),
        });
      });
      // the stats card blooms as it settles over the hero
      const statsCard = document.querySelector<HTMLElement>("[data-stats-card]");
      if (statsCard) {
        gsap.from(statsCard, {
          y: 40,
          opacity: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: { trigger: statsCard, start: "top 92%", once: true },
        });
      }

      // 4) STAGGERED, DIRECTIONAL SECTION REVEALS ─────────────────────────────
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.from(el, {
          y: 34,
          opacity: 0,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 86%", once: true },
        });
      });
      gsap.utils.toArray<HTMLElement>("[data-reveal-group]").forEach((group) => {
        const kids = Array.from(group.children) as HTMLElement[];
        gsap.from(kids, {
          y: 40,
          opacity: 0,
          duration: 0.8,
          ease: "power3.out",
          stagger: 0.1,
          scrollTrigger: { trigger: group, start: "top 82%", once: true },
        });
      });

      // 5) IMAGE CLIP-WIPE — a scanner sweep passing over cargo ───────────────
      gsap.utils.toArray<HTMLElement>("[data-clip]").forEach((el) => {
        gsap.fromTo(
          el,
          { clipPath: "inset(0 100% 0 0)" },
          {
            clipPath: "inset(0 0% 0 0)",
            duration: 1.25,
            ease: "power3.inOut",
            scrollTrigger: { trigger: el, start: "top 82%", once: true },
          }
        );
      });

      // 2b) CORRIDOR SPINE — draws with scroll; nodes ignite when passed ──────
      const spine = document.querySelector<SVGPathElement>("[data-spine-path]");
      if (spine) {
        const len = spine.getTotalLength();
        gsap.set(spine, { strokeDasharray: len, strokeDashoffset: len });
        gsap.to(spine, {
          strokeDashoffset: 0,
          ease: "none",
          scrollTrigger: {
            trigger: document.body,
            start: "top top",
            end: "bottom bottom",
            scrub: 0.5,
          },
        });
      }
      gsap.utils.toArray<HTMLElement>("[data-node]").forEach((node) => {
        const sectionId = node.dataset.node;
        const section = sectionId ? document.querySelector(`#${sectionId}`) : null;
        if (!section) return;
        ScrollTrigger.create({
          trigger: section,
          start: "top 60%",
          end: "bottom 40%",
          onToggle: (self) => node.classList.toggle("node-lit", self.isActive),
        });
      });

      // 6) PINNED MOAT SEQUENCE — trust locks in stage by stage ───────────────
      const pin = document.querySelector<HTMLElement>("[data-pin-sequence]");
      if (pin) {
        const steps = gsap.utils.toArray<HTMLElement>("[data-pin-step]", pin);
        if (steps.length) {
          gsap.set(steps, { opacity: 0.28 });
          gsap.set(steps[0], { opacity: 1 });
          steps[0].classList.add("step-lit");
          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: pin,
              start: "top top",
              end: () => "+=" + window.innerHeight * (steps.length * 0.7),
              pin: true,
              scrub: 0.6,
              anticipatePin: 1,
            },
          });
          steps.forEach((step, i) => {
            if (i === 0) return;
            tl.to(
              steps[i - 1],
              { opacity: 0.28, duration: 0.4 },
              i
            );
            tl.to(
              step,
              {
                opacity: 1,
                duration: 0.4,
                onStart: () => step.classList.add("step-lit"),
                onReverseComplete: () => step.classList.remove("step-lit"),
              },
              i
            );
          });
          // all locked — bring every step back to full brightness before release
          tl.to(steps, { opacity: 1, duration: 0.4 }, steps.length);
        }
      }

      // 7) CORRIDOR MAP ROUTES — draw amber lines Dar → each corridor ─────────
      const routeSvg = document.querySelector<SVGSVGElement>("[data-route-draw]");
      if (routeSvg) {
        const lines = gsap.utils.toArray<SVGPathElement>(".route-line", routeSvg);
        const pulses = gsap.utils.toArray<SVGCircleElement>(".route-pulse", routeSvg);
        lines.forEach((ln) => {
          const len = ln.getTotalLength();
          gsap.set(ln, { strokeDasharray: len, strokeDashoffset: len });
        });
        const rtl = gsap.timeline({
          scrollTrigger: { trigger: routeSvg, start: "top 72%", once: true },
        });
        lines.forEach((ln, i) => {
          const len = ln.getTotalLength();
          const armId = ln.getAttribute("data-arms");
          const node = armId ? document.querySelector<HTMLElement>(`[data-map-node="${armId}"]`) : null;
          rtl.to(
            ln,
            {
              strokeDashoffset: 0,
              duration: 1.1,
              ease: "power2.inOut",
              onComplete: () => node?.classList.add("node-armed"),
            },
            i * 0.55
          );
          // travelling pulse along the same line
          const pulse = pulses[i];
          if (pulse) {
            const obj = { p: 0 };
            rtl.to(
              obj,
              {
                p: 1,
                duration: 1.1,
                ease: "power2.inOut",
                onStart: () => gsap.set(pulse, { opacity: 1 }),
                onUpdate: () => {
                  const pt = ln.getPointAtLength(len * obj.p);
                  pulse.setAttribute("cx", String(pt.x));
                  pulse.setAttribute("cy", String(pt.y));
                },
                onComplete: () => gsap.to(pulse, { opacity: 0, duration: 0.4 }),
              },
              i * 0.55
            );
          }
        });
      }
    });

    // ── Magnetic CTAs (desktop pointer only) ───────────────────────────────
    const magnets = Array.from(
      document.querySelectorAll<HTMLElement>(".cta-magnetic")
    );
    const fine = window.matchMedia?.("(pointer: fine)").matches;
    const magnetHandlers: Array<() => void> = [];
    if (fine) {
      magnets.forEach((el) => {
        const onMove = (e: MouseEvent) => {
          const r = el.getBoundingClientRect();
          const mx = e.clientX - (r.left + r.width / 2);
          const my = e.clientY - (r.top + r.height / 2);
          gsap.to(el, { x: mx * 0.28, y: my * 0.4, duration: 0.4, ease: "power3.out" });
        };
        const onLeave = () =>
          gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1,0.5)" });
        el.addEventListener("mousemove", onMove);
        el.addEventListener("mouseleave", onLeave);
        magnetHandlers.push(() => {
          el.removeEventListener("mousemove", onMove);
          el.removeEventListener("mouseleave", onLeave);
        });
      });
    }

    // recalc after images/fonts settle
    const onLoad = () => ScrollTrigger.refresh();
    window.addEventListener("load", onLoad);
    const refreshT = window.setTimeout(() => {
      ScrollTrigger.refresh();
      scrollToHash();
    }, 600);

    return () => {
      window.removeEventListener("load", onLoad);
      window.clearTimeout(refreshT);
      magnetHandlers.forEach((fn) => fn());
      ctx.revert();
      gsap.ticker.remove(raf);
      lenis?.destroy();
      lenis = null;
    };
  }, []);
}

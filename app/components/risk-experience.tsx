"use client";

import { ActionArrow } from "./action-arrow";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import PulseOpening from "./pulse-opening";
import StarfieldBackground from "./starfield-background";
import styles from "./risk-experience.module.css";

const CoconutReplicaScene = dynamic(
  () =>
    import("./coconut-replica").then((module) => module.CoconutReplicaScene),
  { ssr: false },
);

const LAYERS = [
  {
    number: "01",
    title: "Signal",
    detail: "Where review begins",
    explanation: "A signal points to a question worth investigating.",
  },
  {
    number: "02",
    title: "Activity",
    detail: "What happened",
    explanation: "Read the sequence, timing, and value of account movement.",
  },
  {
    number: "03",
    title: "Links",
    detail: "What connects",
    explanation: "Trace relationships between accounts and beneficiaries.",
  },
  {
    number: "04",
    title: "Challenge",
    detail: "What weakens it",
    explanation: "Weigh facts that could change the interpretation.",
  },
  {
    number: "05",
    title: "Core",
    detail: "What supports it",
    explanation: "Keep each claim close to the records behind it.",
  },
];

export default function RiskExperience() {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const intro = useRef<HTMLDivElement>(null);
  const reveal = useRef<HTMLDivElement>(null);
  const layers = useRef<HTMLDivElement>(null);
  const closing = useRef<HTMLElement>(null);
  const wordmarkTaps = useRef<number[]>([]);
  const [mounted, setMounted] = useState(false);
  const [explode, setExplodeState] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [hoveredPart, setHoveredPart] = useState<number | null>(null);
  const [selectedPart, setSelectedPart] = useState<number | null>(null);
  const layersInteractive = explode > 0.74;
  const activePart = layersInteractive ? (hoveredPart ?? selectedPart) : null;

  const setExplode = (p: number) => {
    setExplodeState(p);
  };

  useEffect(() => {
    const node = section.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin: "700px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!layersInteractive) {
      setHoveredPart(null);
      setSelectedPart(null);
    }
  }, [layersInteractive]);

  useEffect(() => {
    let cancelled = false;
    let dispose = () => {};
    async function start() {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled || !section.current) return;
      gsap.registerPlugin(ScrollTrigger);
      const media = gsap.matchMedia();
      media.add(
        {
          reduce: "(prefers-reduced-motion: reduce)",
          motion: "(prefers-reduced-motion: no-preference)",
        },
        (context) => {
          const reduce = !!context.conditions?.reduce;
          setReduced(reduce);
          const state = { progress: 0 };
          if (reduce) {
            setExplode(1);
            gsap.set(intro.current, { autoAlpha: 0 });
            gsap.set([reveal.current, layers.current], { autoAlpha: 1 });
            if (stage.current) stage.current.dataset.phase = "open";
            return;
          }
          const timeline = gsap.timeline({
            scrollTrigger: {
              trigger: section.current,
              start: "top top",
              end: "bottom bottom",
              scrub: 0.7,
              invalidateOnRefresh: true,
              onUpdate: (self) => {
                if (stage.current)
                  stage.current.dataset.phase =
                    self.progress > 0.73
                      ? "open"
                      : self.progress > 0.1
                        ? "opening"
                        : "closed";
              },
            },
          });
          timeline.to(
            state,
            {
              progress: 1,
              duration: 0.72,
              ease: "sine.inOut",
              onUpdate: () => setExplode(state.progress),
            },
            0.1,
          );
          timeline.to(state, { progress: 1, duration: 0.18 }, 0.82);
          timeline.to(
            intro.current,
            { autoAlpha: 0, y: -28, duration: 0.15, ease: "none" },
            0.1,
          );
          timeline.fromTo(
            reveal.current,
            { autoAlpha: 0, y: 35 },
            { autoAlpha: 1, y: 0, duration: 0.2, ease: "none" },
            0.32,
          );
          timeline.fromTo(
            layers.current,
            { autoAlpha: 0, y: 12 },
            { autoAlpha: 1, y: 0, duration: 0.16, ease: "none" },
            0.68,
          );
          gsap.fromTo(
            closing.current?.querySelectorAll("[data-arrive]") ?? [],
            { autoAlpha: 0, y: 32 },
            {
              autoAlpha: 1,
              y: 0,
              stagger: 0.1,
              duration: 0.9,
              ease: "power3.out",
              scrollTrigger: {
                trigger: closing.current,
                start: "top 70%",
                toggleActions: "play none none reverse",
              },
            },
          );
          gsap.fromTo(
            closing.current?.querySelector("path") ?? {},
            { strokeDashoffset: 1 },
            {
              strokeDashoffset: 0,
              ease: "none",
              scrollTrigger: {
                trigger: closing.current,
                start: "top 95%",
                end: "top 20%",
                scrub: 0.8,
              },
            },
          );
        },
        section,
      );
      dispose = () => {
        media.revert();
      };
    }
    void start().catch((err) => {
      console.error("Artifact stage failed to start", err);
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  const jumpToArtifact = () => {
    const node = section.current;
    if (!node) return;
    setMounted(true);
    window.scrollTo({
      top: node.getBoundingClientRect().top + window.scrollY,
      behavior: reduced ? "auto" : "smooth",
    });
  };

  return (
    <main
      id="top"
      className={`${styles.experience} ${reduced ? styles.reduced : ""}`}
    >
      <StarfieldBackground />
      <header className={styles.navigation}>
        <a
          className={styles.wordmark}
          href="#top"
          aria-label="Coconut home"
          onClick={() => {
            const now = performance.now();
            wordmarkTaps.current = [
              ...wordmarkTaps.current.filter((time) => now - time < 1800),
              now,
            ];
            if (wordmarkTaps.current.length >= 3) {
              wordmarkTaps.current = [];
              window.dispatchEvent(new Event("coconut:constellation"));
            }
          }}
        >
          coconut
        </a>
        <span className={styles.navCaption}>CLARITY, LAYER BY LAYER.</span>
        <Link href="/cases" className={styles.navAction}>
          Case inbox{" "}
          <span aria-hidden="true">
            <ActionArrow />
          </span>
        </Link>
      </header>
      <PulseOpening onInspect={jumpToArtifact} />
      <section
        ref={section}
        id="coconut"
        className={styles.scrollSection}
        aria-label="Coconut risk core. Scroll to separate its layers."
      >
        <div ref={stage} className={styles.stage} data-phase="closed">
          <div className={styles.lightField} />
          <div className={styles.groundShadow} aria-hidden="true" />
          <div className={styles.canvas} aria-hidden="true">
            {mounted && (
              <Suspense fallback={null}>
                <CoconutReplicaScene
                  explode={explode}
                  highlight={activePart}
                  onPartHover={(part) => {
                    if (layersInteractive) setHoveredPart(part);
                  }}
                  bottomLabels={[]}
                  transparentBackground
                  centered
                />
              </Suspense>
            )}
          </div>
          <div ref={intro} className={styles.intro}>
            <p className={styles.ticker}>BENEATH THE SURFACE</p>
            <h2>
              Get to
              <br />
              <em>the core.</em>
            </h2>
            <p className={styles.introDescription}>
              Follow the layers behind a risk signal.
            </p>
          </div>
          <div ref={reveal} className={styles.reveal}>
            <h2>
              Five layers.
              <br />
              <em>One story.</em>
            </h2>
            <p>
              Read activity, trace links, weigh counterevidence, and check
              sources.
            </p>
          </div>
          <div ref={layers} className={styles.layerLegend}>
            {LAYERS.map((item, index) => (
              <button
                key={item.number}
                type="button"
                className={`${styles.legendItem} ${activePart === index ? styles.legendActive : ""} ${activePart !== null && activePart !== index ? styles.legendDim : ""}`}
                aria-label={`${item.title}. ${item.explanation}`}
                aria-pressed={selectedPart === index}
                onMouseEnter={() => setHoveredPart(index)}
                onMouseLeave={() =>
                  setHoveredPart((current) =>
                    current === index ? null : current,
                  )
                }
                onFocus={() => setHoveredPart(index)}
                onBlur={() =>
                  setHoveredPart((current) =>
                    current === index ? null : current,
                  )
                }
                onClick={() =>
                  setSelectedPart((current) =>
                    current === index ? null : index,
                  )
                }
              >
                <span className={styles.legendNumber} aria-hidden="true">
                  {item.number}
                </span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </button>
            ))}
            <p className={styles.layerNarrative} aria-live="polite">
              {activePart === null
                ? "Every layer brings the picture into focus."
                : LAYERS[activePart].explanation}
            </p>
          </div>
        </div>
      </section>
      <section ref={closing} className={styles.nextChapter}>
        <svg
          className={styles.closingThread}
          viewBox="0 0 1200 160"
          fill="none"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            pathLength="1"
            strokeDasharray="1"
            d="M0 100C150 100 220 15 390 55S620 170 810 80 1080 85 1200 45"
          />
          <circle cx="390" cy="55" r="3" />
          <circle cx="810" cy="80" r="3" />
        </svg>
        <span data-arrive className={styles.eyebrow}>
          FROM CURIOSITY TO UNDERSTANDING
        </span>
        <p data-arrive className={styles.closingLine}>
          A clearer view.
          <br />
          <em>A considered decision.</em>
        </p>
        <Link data-arrive href="/cases" className={styles.enterCta}>
          Explore cases{" "}
          <span aria-hidden="true">
            <ActionArrow />
          </span>
        </Link>
        <small data-arrive>
          Select a signal. Follow the evidence. Form your view.
        </small>
      </section>
      <footer className={styles.pageFooter}>
        <div>
          <span>FINANCIAL INVESTIGATION, LAYER BY LAYER.</span>
          <a href="#top">
            Back to top{" "}
            <span aria-hidden="true">
              <ActionArrow />
            </span>
          </a>
        </div>
      </footer>
    </main>
  );
}

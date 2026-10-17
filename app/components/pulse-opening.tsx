"use client";

import { ActionArrow } from "./action-arrow";
import { useEffect, useRef } from "react";
import styles from "./pulse-opening.module.css";

/** The moving threads are an illustration of the investigation, not case data. */
export default function PulseOpening({ onInspect }: { onInspect: () => void }) {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const first = useRef<HTMLDivElement>(null);
  const second = useRef<HTMLDivElement>(null);
  const third = useRef<HTMLDivElement>(null);
  const chapter = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let cancelled = false;
    let dispose = () => {};
    async function start() {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      const element = canvas.current;
      const root = section.current;
      if (cancelled || !element || !root) return;
      const context = element.getContext("2d");
      if (!context) return;
      gsap.registerPlugin(ScrollTrigger);
      const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
      let width = 0,
        height = 0,
        ratio = 1,
        frame = 0,
        visible = true;
      let pointerX = 0,
        pointerY = 0,
        targetX = 0,
        targetY = 0,
        phase = 0,
        last = 0;
      const state = { progress: 0 };
      const draw = () => {
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        const radius = Math.min(width * 0.4, height * 0.4);
        const cx = width * 0.5,
          cy = height * 0.49;
        const tilt = -0.44 + pointerY * 0.12 + Math.sin(phase * 0.3) * 0.05;
        const turn = -0.45 + state.progress * 1.55 + pointerX * 0.19;
        const spread = Math.sin(state.progress * Math.PI) * 0.75;
        const project = (x: number, y: number, z: number) => {
          const x1 = x * Math.cos(turn) + z * Math.sin(turn);
          const z1 = z * Math.cos(turn) - x * Math.sin(turn);
          const y1 = y * Math.cos(tilt) - z1 * Math.sin(tilt);
          const depth = y * Math.sin(tilt) + z1 * Math.cos(tilt);
          const perspective = 3.8 / (3.8 + depth);
          return {
            x: cx + (x1 + y1 * 0.19) * radius * perspective,
            y: cy + y1 * radius * perspective,
            depth,
          };
        };
        const glow = context.createRadialGradient(
          cx,
          cy,
          0,
          cx,
          cy,
          radius * 1.45,
        );
        glow.addColorStop(0, "rgba(174, 119, 43, .07)");
        glow.addColorStop(1, "rgba(174, 119, 43, 0)");
        context.fillStyle = glow;
        context.fillRect(0, 0, width, height);
        // Meridian threads rotate in depth, with the central line carrying a moving light.
        for (let ring = 0; ring < 19; ring++) {
          const angle = (ring / 19) * Math.PI;
          const points = [];
          for (let step = 0; step <= 112; step++) {
            const t = (step / 112) * Math.PI * 2;
            const x =
              Math.cos(t) * Math.cos(angle) + (ring - 9) * spread * 0.055;
            const y =
              Math.sin(t) * 1.06 + Math.sin(t * 2 + angle) * spread * 0.15;
            const z = Math.cos(t) * Math.sin(angle) * 0.66;
            points.push(project(x, y, z));
          }
          context.beginPath();
          points.forEach((p, i) =>
            i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y),
          );
          context.strokeStyle = `rgba(205, 170, 111, ${0.13 + Math.sin(angle) * 0.15})`;
          context.lineWidth = 0.65;
          context.stroke();
          if (ring % 4 === 0) {
            const t = phase * 0.17 + ring * 0.78;
            const p = project(
              Math.cos(t) * Math.cos(angle),
              Math.sin(t) * 1.06,
              Math.cos(t) * Math.sin(angle) * 0.66,
            );
            context.beginPath();
            context.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
            context.fillStyle = "rgba(231, 205, 158, .8)";
            context.fill();
          }
        }
        const thread = (t: number) => ({
          x: width * (0.025 + t * 0.95),
          y:
            cy +
            Math.sin(t * Math.PI * 2.2 + state.progress * 2.4) * radius * 0.44 -
            radius * 0.05,
        });
        context.beginPath();
        for (let i = 0; i <= 150; i++) {
          const p = thread(i / 150);
          if (i) context.lineTo(p.x, p.y);
          else context.moveTo(p.x, p.y);
        }
        const stroke = context.createLinearGradient(0, 0, width, 0);
        stroke.addColorStop(0, "rgba(213,168,99,0)");
        stroke.addColorStop(0.3, "rgba(213,168,99,.65)");
        stroke.addColorStop(0.65, "rgba(237,200,140,.9)");
        stroke.addColorStop(1, "rgba(213,168,99,0)");
        context.strokeStyle = stroke;
        context.lineWidth = 1.3;
        context.stroke();
        for (let i = 0; i < 3; i++) {
          const travel = motion.matches
            ? 0.3 + i * 0.22
            : (phase * 0.036 + i / 3) % 1;
          const point = thread(travel);
          const opacity = Math.sin(travel * Math.PI);
          const halo = context.createRadialGradient(
            point.x,
            point.y,
            0,
            point.x,
            point.y,
            16,
          );
          halo.addColorStop(0, `rgba(243,193,110,${0.35 * opacity})`);
          halo.addColorStop(1, "rgba(243,193,110,0)");
          context.fillStyle = halo;
          context.fillRect(point.x - 16, point.y - 16, 32, 32);
          context.beginPath();
          context.arc(point.x, point.y, 2.2, 0, Math.PI * 2);
          context.fillStyle = `rgba(250,224,171,${opacity})`;
          context.fill();
        }
      };
      const tick = (time: number) => {
        frame = 0;
        if (cancelled || !visible || document.hidden) return;
        const dt = last ? Math.min((time - last) / 1000, 0.05) : 0;
        last = time;
        if (!motion.matches) {
          phase += dt;
          pointerX += (targetX - pointerX) * 0.035;
          pointerY += (targetY - pointerY) * 0.035;
        }
        draw();
        if (!motion.matches) frame = requestAnimationFrame(tick);
      };
      const requestDraw = () => {
        if (!frame && visible && !document.hidden)
          frame = requestAnimationFrame(tick);
      };
      const resize = () => {
        width = element.clientWidth;
        height = element.clientHeight;
        ratio = Math.min(window.devicePixelRatio || 1, 2);
        element.width = Math.round(width * ratio);
        element.height = Math.round(height * ratio);
        requestDraw();
      };
      const move = (event: PointerEvent) => {
        if (event.pointerType === "touch" || motion.matches) return;
        targetX = (event.clientX / window.innerWidth - 0.5) * 2;
        targetY = (event.clientY / window.innerHeight - 0.5) * 2;
      };
      const resetPointer = () => {
        targetX = 0;
        targetY = 0;
      };
      const visibility = () => {
        last = 0;
        requestDraw();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(element);
      resize();
      const intersection = new IntersectionObserver(
        ([entry]) => {
          visible = entry.isIntersecting;
          last = 0;
          requestDraw();
        },
        { threshold: 0 },
      );
      intersection.observe(element);
      window.addEventListener("pointermove", move, { passive: true });
      window.addEventListener("pointerleave", resetPointer);
      document.addEventListener("visibilitychange", visibility);
      const media = gsap.matchMedia();
      media.add(
        {
          reduce: "(prefers-reduced-motion: reduce)",
          motion: "(prefers-reduced-motion: no-preference)",
        },
        (conditions) => {
          if (conditions.conditions?.reduce) {
            if (chapter.current)
              chapter.current.textContent = "01 / THE SIGNAL";
            gsap.set(first.current, { autoAlpha: 1, y: 0 });
            gsap.set([second.current, third.current], { autoAlpha: 0 });
            state.progress = 0;
            pointerX = 0;
            pointerY = 0;
            requestDraw();
            return;
          }
          requestDraw();
          const timeline = gsap.timeline({
            scrollTrigger: {
              trigger: root,
              start: "top top",
              end: "bottom bottom",
              scrub: 0.8,
              invalidateOnRefresh: true,
            },
          });
          timeline.to(
            state,
            {
              progress: 1,
              duration: 1,
              ease: "none",
              onUpdate: () => {
                if (chapter.current)
                  chapter.current.textContent =
                    state.progress < 0.33
                      ? "01 / THE SIGNAL"
                      : state.progress < 0.66
                        ? "02 / THE CONNECTION"
                        : "03 / THE UNDERSTANDING";
              },
            },
            0,
          );
          timeline.to(
            first.current,
            { autoAlpha: 0, y: -35, duration: 0.14, ease: "none" },
            0.2,
          );
          timeline.fromTo(
            second.current,
            { autoAlpha: 0, y: 35 },
            { autoAlpha: 1, y: 0, duration: 0.14, ease: "none" },
            0.33,
          );
          timeline.to(
            second.current,
            { autoAlpha: 0, y: -35, duration: 0.12, ease: "none" },
            0.57,
          );
          timeline.fromTo(
            third.current,
            { autoAlpha: 0, y: 35 },
            { autoAlpha: 1, y: 0, duration: 0.15, ease: "none" },
            0.69,
          );
        },
        root,
      );
      dispose = () => {
        media.revert();
        observer.disconnect();
        intersection.disconnect();
        cancelAnimationFrame(frame);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerleave", resetPointer);
        document.removeEventListener("visibilitychange", visibility);
      };
    }
    void start().catch((error) =>
      console.error("Opening stage failed to start", error),
    );
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  return (
    <section
      ref={section}
      className={styles.pulse}
      aria-label="From risk signals to understanding"
    >
      <div className={styles.stage}>
        <div className={styles.art}>
          <canvas ref={canvas} className={styles.field} aria-hidden="true" />
          <span className={styles.artCaption}>
            EVERY CONNECTION CHANGES THE PICTURE
          </span>
        </div>
        <div ref={first} className={`${styles.beat} ${styles.firstBeat}`}>
          <p className={styles.beatEyebrow}>
            FINANCIAL INVESTIGATION, LAYER BY LAYER
          </p>
          <h1 className={styles.statement}>
            <span>Every signal.</span>
            <span>
              <em>A deeper story.</em>
            </span>
          </h1>
          <p className={styles.caption}>
            Turn financial activity into an investigation you can follow.
          </p>
        </div>
        <div ref={second} className={styles.beat}>
          <p className={styles.beatEyebrow}>CONTEXT CHANGES EVERYTHING</p>
          <p className={styles.statement}>
            <span>Follow what</span>
            <span>
              <em>connects.</em>
            </span>
          </p>
          <p className={styles.caption}>
            Trace the movement. See the relationships. Consider another
            explanation.
          </p>
        </div>
        <div ref={third} className={styles.beat}>
          <p className={styles.beatEyebrow}>
            UNDERSTANDING STARTS WITH EVIDENCE
          </p>
          <p className={styles.statement}>
            <span>Clarity comes</span>
            <span>
              <em>from within.</em>
            </span>
          </p>
          <p className={styles.caption}>
            Follow each layer back to the records behind it.
          </p>
        </div>
        <div className={styles.stageFoot}>
          <span ref={chapter}>01 / THE SIGNAL</span>
          <button type="button" className={styles.skip} onClick={onInspect}>
            Discover the layers{" "}
            <span aria-hidden="true">
              <ActionArrow direction="down" />
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}

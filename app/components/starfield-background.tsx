"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./starfield-background.module.css";

type Star = {
  x: number;
  y: number;
  radius: number;
  depth: number;
  opacity: number;
  warm: boolean;
};

export default function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [discovered, setDiscovered] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let ratio = 1;
    let frame = 0;
    let offsetX = 0;
    let offsetY = 0;
    let targetX = 0;
    let targetY = 0;
    let seed = 28391;
    let revealedAt = 0;
    let letters = "";
    let lastKeyAt = 0;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const constellation = [
      [-0.43, 0.04],
      [-0.21, -0.38],
      [0.16, -0.47],
      [0.43, -0.06],
      [0.05, 0.4],
    ];
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const stars: Star[] = Array.from({ length: 145 }, () => ({
      x: random(),
      y: random(),
      radius: 0.35 + random() * 1.15,
      depth: 0.25 + random() * 0.75,
      opacity: 0.12 + random() * 0.3,
      warm: random() > 0.85,
    }));

    const draw = () => {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      for (const star of stars) {
        const travel = motion.matches ? 0 : 22 * star.depth;
        const x = (star.x * width + offsetX * travel + width) % width;
        const y = (star.y * height + offsetY * travel + height) % height;
        context.beginPath();
        context.arc(x, y, star.radius, 0, Math.PI * 2);
        context.fillStyle = star.warm
          ? `rgba(231, 180, 117, ${star.opacity})`
          : `rgba(220, 226, 220, ${star.opacity})`;
        context.fill();
      }
      if (revealedAt) {
        const elapsed = performance.now() - revealedAt;
        const opacity = motion.matches
          ? 0.65
          : Math.min(1, elapsed / 700) *
            Math.min(1, Math.max(0, (8500 - elapsed) / 1100));
        const size = Math.min(width * 0.27, 245);
        const cx = width < 600 ? width * 0.67 : width * 0.79;
        const cy = Math.min(height * 0.28, 245);
        context.save();
        context.globalAlpha = opacity;
        context.lineWidth = 0.65;
        context.strokeStyle = "rgba(231,180,117,0.55)";
        context.setLineDash([size * 3]);
        context.lineDashOffset = motion.matches
          ? 0
          : size * 3 * (1 - Math.min(1, elapsed / 1700));
        context.beginPath();
        constellation.forEach(([x, y], i) =>
          i
            ? context.lineTo(cx + x * size, cy + y * size)
            : context.moveTo(cx + x * size, cy + y * size),
        );
        context.closePath();
        context.stroke();
        context.setLineDash([]);
        for (let i = 0; i < constellation.length; i++) {
          const [x, y] = constellation[i];
          const lit = motion.matches
            ? 1
            : Math.max(0, Math.min(1, (elapsed - i * 150) / 450));
          context.globalAlpha = opacity * lit;
          const px = cx + x * size,
            py = cy + y * size;
          const halo = context.createRadialGradient(px, py, 0, px, py, 16);
          halo.addColorStop(0, "rgba(241,192,118,0.4)");
          halo.addColorStop(1, "rgba(241,192,118,0)");
          context.fillStyle = halo;
          context.fillRect(px - 16, py - 16, 32, 32);
          context.beginPath();
          context.arc(px, py, i === 2 ? 2.5 : 1.7, 0, Math.PI * 2);
          context.fillStyle = "#f2d5a3";
          context.fill();
        }
        context.restore();
      }
    };

    const animate = () => {
      frame = 0;
      offsetX += (targetX - offsetX) * 0.075;
      offsetY += (targetY - offsetY) * 0.075;
      draw();
      if (
        (!motion.matches &&
          revealedAt &&
          performance.now() - revealedAt < 8500) ||
        Math.abs(targetX - offsetX) > 0.002 ||
        Math.abs(targetY - offsetY) > 0.002
      )
        frame = requestAnimationFrame(animate);
    };
    const requestDraw = () => {
      if (!frame) frame = requestAnimationFrame(animate);
    };
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(width * ratio);
      canvas.height = Math.ceil(height * ratio);
      draw();
    };
    const move = (event: PointerEvent) => {
      if (motion.matches || event.pointerType === "touch") return;
      targetX = (event.clientX / width - 0.5) * 2;
      targetY = (event.clientY / height - 0.5) * 2;
      requestDraw();
    };
    const reset = () => {
      targetX = 0;
      targetY = 0;
      requestDraw();
    };
    const reveal = () => {
      revealedAt = performance.now();
      setDiscovered(true);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        revealedAt = 0;
        setDiscovered(false);
        requestDraw();
      }, 8500);
      requestDraw();
    };
    const key = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        target?.closest("input,textarea,select,[contenteditable=true]")
      )
        return;
      if (event.key === "Escape") {
        clearTimeout(hideTimer);
        revealedAt = 0;
        setDiscovered(false);
        requestDraw();
        return;
      }
      if (event.key.length !== 1) return;
      const now = performance.now();
      letters =
        `${now - lastKeyAt < 1500 ? letters : ""}${event.key.toLowerCase()}`.slice(
          -7,
        );
      lastKeyAt = now;
      if (letters === "coconut") {
        letters = "";
        reveal();
      }
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerleave", reset);
    motion.addEventListener("change", reset);
    window.addEventListener("keydown", key);
    window.addEventListener("coconut:constellation", reveal);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(hideTimer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerleave", reset);
      motion.removeEventListener("change", reset);
      window.removeEventListener("keydown", key);
      window.removeEventListener("coconut:constellation", reveal);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className={styles.field} aria-hidden="true" />
      <span
        className={`${styles.discovery} ${discovered ? styles.visible : ""}`}
        role="status"
      >
        {discovered ? "Five layers. Written in the stars." : ""}
      </span>
    </>
  );
}

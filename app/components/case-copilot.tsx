"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { usePathname } from "next/navigation";
import { CaseAssistant } from "./case-assistant";
import { sections } from "./case-navigation";
import { InvestigationAssistant } from "./investigation-assistant";
import { useCaseWorkspace } from "./case-workspace";
import { useDialogFocus } from "./use-dialog-focus";
import styles from "./case-copilot.module.css";

export function ThreadMark() {
  return (
    <svg viewBox="0 0 44 32" aria-hidden="true">
      <path d="M1 17C7 0 20 33 29 14S40 8 44 16" />
      <circle cx="28" cy="15" r="2" />
    </svg>
  );
}

export function CopilotTrigger({
  open,
  onClick,
  label,
  controls,
  triggerRef,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
  controls: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={triggerRef}
      type="button"
      className={`${styles.trigger} ${open ? styles.lit : ""}`}
      aria-label={label}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onClick}
    >
      <ThreadMark />
      <span>Ask Coconut</span>
    </button>
  );
}

export function CopilotPaper({
  open,
  onClose,
  suspended = false,
  panelId,
  contextLabel,
  footer,
  triggerRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  suspended?: boolean;
  panelId: string;
  contextLabel: ReactNode;
  footer: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  const [mobile, setMobile] = useState(false);
  const [visited, setVisited] = useState(false);
  const [unfurled, setUnfurled] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [position, setPosition] = useState({ top: 220, available: 620 });
  const sheet = useRef<HTMLDivElement>(null);
  const roller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const visible = open && !suspended;
  const dialog = useDialogFocus(interactive && mobile, onClose);

  useEffect(() => {
    const update = () => {
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const isMobile = window.matchMedia("(max-width: 760px)").matches;
      const top = Math.max(100, Math.min(isMobile ? 132 : 146, height - 350));
      setMobile(isMobile);
      setPosition({
        top: top + (viewport?.offsetTop ?? 0),
        available: Math.max(190, height - top - 24),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let frame = 0;
    const animations: Animation[] = [];
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    setInteractive(false);
    const animate = (expand: boolean) => {
      if (!sheet.current || !roller.current || !content.current) return;
      const height = sheet.current.getBoundingClientRect().height;
      const closed = `inset(0px 0px ${Math.max(0, height - 12)}px 0px)`;
      const opened = "inset(0px 0px 0px 0px)";
      const complete = () => {
        if (cancelled || !sheet.current || !content.current) return;
        sheet.current.style.clipPath = expand ? opened : closed;
        content.current.style.opacity = expand ? "1" : "0";
        animations.forEach((animation) => animation.cancel());
        setRolling(false);
        setInteractive(expand);
        if (!expand) setUnfurled(false);
      };
      if (reduced) {
        complete();
        return;
      }
      setRolling(true);
      const options = {
        duration: expand ? 900 : 420,
        easing: "cubic-bezier(.3,.04,.24,1)",
        fill: "both" as const,
      };
      const reveal = sheet.current.animate(
        expand
          ? [{ clipPath: closed }, { clipPath: opened }]
          : [{ clipPath: opened }, { clipPath: closed }],
        options,
      );
      const end = `translateY(${Math.max(0, height - 16)}px) scaleY(.4)`;
      const start = "translateY(0px) scaleY(1)";
      animations.push(
        reveal,
        roller.current.animate(
          expand
            ? [
                { transform: start, opacity: 1 },
                { transform: end, opacity: 0.8 },
              ]
            : [
                { transform: end, opacity: 0.8 },
                { transform: start, opacity: 1 },
              ],
          options,
        ),
        content.current.animate(
          expand
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [{ opacity: 1 }, { opacity: 0 }],
          {
            duration: expand ? 400 : 180,
            delay: expand ? 240 : 0,
            fill: "both",
          },
        ),
      );
      void reveal.finished.then(complete, () => {});
    };
    if (visible) {
      setVisited(true);
      timer = setTimeout(
        () => {
          setUnfurled(true);
          frame = requestAnimationFrame(() => animate(true));
        },
        reduced ? 0 : 300,
      );
    } else if (dialog.current?.dataset.unfurled === "true") {
      if (!suspended) triggerRef.current?.focus({ preventScroll: true });
      animate(false);
    }
    return () => {
      cancelled = true;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      animations.forEach((animation) => animation.cancel());
    };
  }, [visible, suspended, dialog, triggerRef]);

  useEffect(() => {
    if (!interactive) return;
    dialog.current
      ?.querySelector<HTMLTextAreaElement>("textarea")
      ?.focus({ preventScroll: true });
    if (mobile) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [interactive, mobile, onClose, dialog]);

  return (
    <>
      <svg
        className={`${styles.filament} ${visible ? styles.lit : ""}`}
        viewBox="0 0 52 690"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={suspended ? { display: "none" } : undefined}
      >
        <path d="M29 0C3 68 51 82 28 153S4 220 27 291 48 367 25 437 6 520 28 596 22 653 27 690" />
        <path
          className={styles.traveler}
          d="M29 0C3 68 51 82 28 153S4 220 27 291 48 367 25 437 6 520 28 596 22 653 27 690"
        />
      </svg>
      {unfurled && mobile && (
        <div className={styles.shade} onClick={onClose} aria-hidden="true" />
      )}
      <aside
        id={panelId}
        ref={dialog}
        className={`${styles.panel} ${unfurled ? styles.unfurled : ""} ${rolling ? styles.rolling : ""}`}
        data-unfurled={unfurled}
        inert={!interactive}
        aria-hidden={!interactive}
        role="dialog"
        aria-modal={mobile ? true : undefined}
        aria-labelledby={`${panelId}-title`}
        style={
          {
            "--paper-top": `${position.top}px`,
            "--available": `${position.available}px`,
          } as CSSProperties
        }
      >
        <div className={styles.roll} aria-hidden="true">
          <Image
            src="/copilot/scroll-cap.svg"
            alt=""
            width={390}
            height={48}
            unoptimized
          />
        </div>
        <div ref={roller} className={styles.motionRoller} aria-hidden="true" />
        <div ref={sheet} className={styles.sheet}>
          <div ref={content} className={styles.content}>
            <header className={styles.head}>
              <div>
                <ThreadMark />
                <h2 id={`${panelId}-title`}>Ask Coconut</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Coconut copilot"
              >
                ×
              </button>
            </header>
            <p className={styles.context}>
              <i aria-hidden="true" />
              {contextLabel}
            </p>
            {(visited || open) && children}
            <footer className={styles.footer}>
              <i aria-hidden="true" />
              {footer}
            </footer>
          </div>
        </div>
      </aside>
    </>
  );
}

export function CaseCopilot({
  open,
  onClose,
  suspended,
  triggerRef,
}: {
  open: boolean;
  onClose: () => void;
  suspended: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const pathname = usePathname();
  const { caseFile } = useCaseWorkspace();
  const section =
    sections.find((item) => pathname === `/cases/${caseFile.id}${item.path}`) ??
    sections[0];
  return (
    <CopilotPaper
      open={open}
      onClose={onClose}
      suspended={suspended}
      panelId="case-copilot-panel"
      triggerRef={triggerRef}
      contextLabel={
        <>
          {caseFile.id}
          <span>/</span>
          {section.label}
        </>
      }
      footer="Case answers link to checked records."
    >
      {section.path === "/possibilities" ? (
        <InvestigationAssistant />
      ) : (
        <CaseAssistant section={section.label} compact paper />
      )}
    </CopilotPaper>
  );
}

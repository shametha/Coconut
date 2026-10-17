"use client";

import { ActionArrow } from "./action-arrow";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { CaseData, Evidence } from "@/lib/case";
import { ScoreRing } from "./signal-thread";
import { useDialogFocus } from "./use-dialog-focus";
import { sections } from "./case-navigation";
import { CaseCopilot, CopilotTrigger } from "./case-copilot";
import styles from "./case-workspace.module.css";

type Source = "demo" | "firestore";
type SourceDetails = Omit<Evidence, "kind" | "score"> &
  Partial<Pick<Evidence, "kind" | "score">> & {
    recordFields?: { label: string; value: string }[];
    issuer?: string;
  };
type WorkspaceContext = {
  caseFile: CaseData;
  source: Source;
  openEvidence: (item: SourceDetails) => void;
  downloadManifest: () => Promise<void>;
  openCopilot: () => void;
  investigationRevision: number;
  refreshInvestigation: () => void;
  selectedHypothesis: string;
  selectHypothesis: (id: string) => void;
};

const Context = createContext<WorkspaceContext | null>(null);

export function useCaseWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("Case workspace is unavailable");
  return context;
}

function EvidenceDrawer({
  item,
  source,
  onClose,
}: {
  item: SourceDetails | null;
  source: Source;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus(item !== null, onClose);
  if (!item) return null;
  const fields = [
    ...(item.issuer ? [["Issuer", item.issuer]] : []),
    [
      item.recordFields ? "Retrieved" : "Observed",
      new Date(item.observedAt).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
      }) + " IST",
    ],
  ];
  return (
    <div
      className={styles.drawerBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        ref={dialogRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidence-title"
      >
        <div className={styles.drawerTop}>
          <span className={styles.kicker}>SOURCE DETAILS</span>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onClose}
            aria-label="Close evidence details"
          >
            ×
          </button>
        </div>
        <h2 id="evidence-title">{item.title}</h2>
        <p className={styles.muted}>{item.summary}</p>
        {item.recordFields && (
          <section aria-label="What the source record says">
            <span className={styles.kicker}>WHAT THE RECORD SAYS</span>
            <dl className={styles.sourceFields}>
              {item.recordFields.map((field) => (
                <div key={field.label}>
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        <div className={styles.sourceState}>
          <span className={styles.statusDot} />
          {source === "demo"
            ? "Record linked"
            : item.verified
              ? "Source check passed"
              : "Source check pending"}
        </div>
        <dl className={styles.sourceFields}>
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || "Unavailable"}</dd>
            </div>
          ))}
        </dl>
        <p className={styles.drawerFoot}>
          A source check confirms the record's origin and scope. Review its
          contents alongside any conflicting evidence.
        </p>
      </aside>
    </div>
  );
}

export function CaseFrame({
  caseFile,
  source,
  children,
}: {
  caseFile: CaseData;
  source: Source;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [evidence, setEvidence] = useState<SourceDetails | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [investigationRevision, setInvestigationRevision] = useState(0);
  const [selectedHypothesis, selectHypothesis] = useState<string>("customer");
  const refreshInvestigation = useCallback(
    () => setInvestigationRevision((v) => v + 1),
    [],
  );
  const navRef = useRef<HTMLElement>(null);
  const copilotTrigger = useRef<HTMLButtonElement>(null);
  const base = `/cases/${caseFile.id}`;
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const revealActive = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active || nav.scrollWidth <= nav.clientWidth) return;
      const activeLeft =
        active.getBoundingClientRect().left -
        nav.getBoundingClientRect().left +
        nav.scrollLeft;
      nav.scrollTo({
        left: activeLeft - (nav.clientWidth - active.clientWidth) / 2,
        behavior: "auto",
      });
    };
    revealActive();
    const observer = new ResizeObserver(revealActive);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [pathname]);
  const closeEvidence = useCallback(() => setEvidence(null), []);
  const openCopilot = useCallback(() => setCopilotOpen(true), []);
  const closeCopilot = useCallback(() => setCopilotOpen(false), []);
  const downloadManifest = useCallback(async () => {
    try {
      const response = await fetch(`/api/cases/${caseFile.id}/core?summary=1`);
      if (!response.ok) throw new Error("Core unavailable");
      const data = await response.text();
      const url = URL.createObjectURL(
        new Blob([data], { type: "text/markdown;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${caseFile.id.toLowerCase()}-evidence-summary.md`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setNotice(
        "The evidence summary is unavailable. Refresh the case and try again.",
      );
    }
  }, [caseFile.id, caseFile.coreId]);
  return (
    <Context.Provider
      value={{
        caseFile,
        source,
        openEvidence: setEvidence,
        downloadManifest,
        openCopilot,
        investigationRevision,
        refreshInvestigation,
        selectedHypothesis,
        selectHypothesis,
      }}
    >
      <div className={styles.workspace}>
        <a className={styles.skip} href="#investigation-content">
          Skip to investigation
        </a>
        <header className={styles.siteHeader}>
          <Link className={styles.brand} href="/" aria-label="Coconut homepage">
            coconut
          </Link>
          <span className={styles.headerCaption}>FOLLOW THE EVIDENCE</span>
          <div className={styles.headerActions}>
            <CopilotTrigger
              open={copilotOpen && !evidence}
              onClick={copilotOpen ? closeCopilot : openCopilot}
              label="Ask Coconut about this case"
              controls="case-copilot-panel"
              triggerRef={copilotTrigger}
            />
            <Link className={styles.allCases} href="/cases">
              All cases{" "}
              <span aria-hidden="true">
                <ActionArrow />
              </span>
            </Link>
          </div>
        </header>
        <div className={styles.caseLayout}>
          <aside className={styles.sidebar}>
            <div className={styles.sidebarHead}>
              <span className={styles.kicker}>INVESTIGATION</span>
              <strong>{caseFile.id}</strong>
            </div>
            <nav
              ref={navRef}
              className={styles.sectionNav}
              aria-label="Case sections"
            >
              {sections.map((section) => {
                const href = base + section.path;
                return (
                  <Link
                    key={section.label}
                    href={href}
                    aria-current={pathname === href ? "page" : undefined}
                  >
                    <span>{section.number}</span>
                    {section.label}
                    <span aria-hidden="true">
                      <ActionArrow />
                    </span>
                  </Link>
                );
              })}
            </nav>
            <div className={styles.sidebarFoot}>
              <span className={styles.statusDot} />
              <span>
                {caseFile.coreId}
                <small>EVIDENCE CORE</small>
              </span>
            </div>
          </aside>
          <div className={styles.caseMain}>
            <div className={styles.caseHeading}>
              <div>
                <span className={styles.kicker}>
                  CASE {caseFile.id} <span className={styles.separator}>/</span>{" "}
                  {caseFile.account}
                </span>
                <h1>{caseFile.title}</h1>
                <p>
                  {caseFile.customer} <span aria-hidden="true">·</span> Opened{" "}
                  {caseFile.openedAt}
                </p>
              </div>
              <div
                className={styles.score}
                aria-label={`Risk signal ${caseFile.score} out of 100`}
              >
                <ScoreRing score={caseFile.score} />
                <strong>
                  {caseFile.score}
                  <small>/100</small>
                </strong>
                <span>RISK SIGNAL</span>
              </div>
            </div>
            <main id="investigation-content" className={styles.pageContent}>
              <div key={pathname} className={styles.pageEntrance}>
                {children}
              </div>
            </main>
          </div>
        </div>
        {notice && (
          <div className={styles.notice} role="alert">
            {notice}
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss notice"
            >
              ×
            </button>
          </div>
        )}
        <CaseCopilot
          open={copilotOpen}
          triggerRef={copilotTrigger}
          onClose={closeCopilot}
          suspended={evidence !== null}
        />
        <EvidenceDrawer
          item={evidence}
          source={source}
          onClose={closeEvidence}
        />
      </div>
    </Context.Provider>
  );
}

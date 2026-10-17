"use client";

import { ActionArrow } from "./action-arrow";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import type { CaseSummary } from "@/lib/case";
import { CopilotPaper, CopilotTrigger } from "./case-copilot";
import { QuestionAssistant } from "./case-assistant";
import StarfieldBackground from "./starfield-background";
import { SignalThread, ScoreRing } from "./signal-thread";
import { useDialogFocus } from "./use-dialog-focus";
import styles from "./case-inbox.module.css";

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);

export default function CaseInbox({
  cases,
  source,
}: {
  cases: CaseSummary[];
  source: "demo" | "firestore";
}) {
  const [copilotOpen, setCopilotOpen] = useState(false);
  const copilotTrigger = useRef<HTMLButtonElement>(null);
  const closeCopilot = useCallback(() => setCopilotOpen(false), []);
  const [selected, setSelected] = useState<CaseSummary | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("risk");
  const close = useCallback(() => setSelected(null), []);
  const dialogRef = useDialogFocus(selected !== null, close);
  const search = query.trim().toLowerCase();
  const visible = cases
    .filter((item) =>
      [item.id, item.title, item.customer, item.account].some((value) =>
        value.toLowerCase().includes(search),
      ),
    )
    .sort((a, b) =>
      sort === "amount"
        ? b.amount - a.amount
        : sort === "case"
          ? a.id.localeCompare(b.id)
          : b.score - a.score,
    );
  return (
    <div className={styles.inbox}>
      <StarfieldBackground />
      <a href="#case-list" className={styles.skip}>
        Skip to cases
      </a>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Coconut homepage">
          coconut
        </Link>
        <span className={styles.headerNote}>
          <i /> THE INVESTIGATION WORKSPACE
        </span>
        <div className={styles.headerActions}>
          <CopilotTrigger
            open={copilotOpen && !selected}
            onClick={() => setCopilotOpen((open) => !open)}
            label="Ask Coconut about the case inbox"
            controls="inbox-copilot-panel"
            triggerRef={copilotTrigger}
          />
          <Link
            href="/"
            className={styles.homeLink}
            aria-label="Back to the story"
          >
            <span className={styles.homeLabel}>Back to the story</span>{" "}
            <span aria-hidden="true">
              <ActionArrow />
            </span>
          </Link>
        </div>
      </header>
      <CopilotPaper
        open={copilotOpen}
        onClose={closeCopilot}
        suspended={selected !== null}
        panelId="inbox-copilot-panel"
        triggerRef={copilotTrigger}
        contextLabel={
          <>
            Case inbox<span>/</span>All cases
          </>
        }
        footer="Answers use the connected case register."
      >
        <QuestionAssistant
          section="Inbox"
          compact
          paper
          source={source}
          onPreviewCase={(id) => {
            const item = cases.find((row) => row.id === id);
            if (item) setSelected(item);
          }}
        />
      </CopilotPaper>
      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.kicker}>01 / CASE INBOX</span>
            <h1>
              Follow the signal.
              <br />
              <em>Find the story.</em>
            </h1>
            <p>
              Look closer. Connect the evidence.
              <br />
              Make room for another explanation.
            </p>
          </div>
          <div className={styles.heroArt}>
            <SignalThread />
            <span>FROM THE SURFACE TO THE SOURCE</span>
          </div>
        </section>
        <section
          id="case-list"
          className={styles.caseSection}
          aria-labelledby="cases-heading"
        >
          <div className={styles.toolbar}>
            <h2 id="cases-heading">
              Cases <span>{String(cases.length).padStart(2, "0")}</span>
            </h2>
            <div className={styles.controls}>
              <label className={styles.search}>
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="5.5" />
                  <path d="m12 12 5 5" />
                </svg>
                <input
                  type="search"
                  aria-label="Search cases"
                  placeholder="Find a case or account"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <label className={styles.sort}>
                <span>Sort</span>
                <select
                  aria-label="Sort cases"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="risk">Highest risk</option>
                  <option value="amount">Largest amount</option>
                  <option value="case">Case number</option>
                </select>
              </label>
            </div>
          </div>
          <div className={styles.listHead} aria-hidden="true">
            <span>CASE / SIGNAL</span>
            <span>MOVEMENT</span>
            <span>RISK SIGNAL</span>
            <span />
          </div>
          <div aria-live="polite" className={styles.resultCount}>
            {query &&
              `${visible.length} ${visible.length === 1 ? "case" : "cases"} found`}
          </div>
          {visible.length === 0 ? (
            <div className={styles.empty}>
              <span aria-hidden="true">○</span>
              <h3>
                {cases.length ? "No matching signals." : "A quiet inbox."}
              </h3>
              <p>
                {cases.length
                  ? "Try a case number, account, or customer name."
                  : "Cases will appear here when they are available from your data source."}
              </p>
              {query && (
                <button type="button" onClick={() => setQuery("")}>
                  Clear search <ActionArrow />
                </button>
              )}
            </div>
          ) : (
            <div>
              {visible.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={styles.row}
                  onClick={() => setSelected(item)}
                  aria-haspopup="dialog"
                  aria-label={`Preview case ${item.id}: ${item.title}`}
                >
                  <span className={styles.caseCell}>
                    <small>
                      <span>{String(index + 1).padStart(2, "0")}</span>{" "}
                      {item.id}
                    </small>
                    <strong>{item.title}</strong>
                    <em>
                      {item.customer} <span> / </span> {item.account}
                    </em>
                  </span>
                  <span className={styles.amount}>
                    {money(item.amount, item.currency)}
                    <small>Total movement</small>
                  </span>
                  <span className={styles.risk}>
                    <ScoreRing score={item.score} />
                    <strong>
                      {item.score}
                      <small>/100</small>
                    </strong>
                  </span>
                  <span className={styles.rowArrow} aria-hidden="true">
                    <ActionArrow />
                  </span>
                </button>
              ))}
            </div>
          )}
          <p className={styles.footnote}>
            <span aria-hidden="true">↳</span> A signal opens a question.
            Evidence and human judgment determine what follows.
          </p>
        </section>
      </main>
      <footer className={styles.footer}>
        <span>COCONUT</span>
        <span>CLARITY, LAYER BY LAYER.</span>
      </footer>
      {selected && (
        <div
          className={styles.backdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <aside
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="case-preview-title"
            className={styles.preview}
          >
            <div className={styles.previewTop}>
              <span className={styles.kicker}>
                A CLOSER LOOK / {selected.id}
              </span>
              <button
                type="button"
                aria-label="Close case preview"
                onClick={close}
              >
                ×
              </button>
            </div>
            <div className={styles.previewScore}>
              <ScoreRing score={selected.score} />
              <strong>
                {selected.score}
                <small>/100</small>
              </strong>
              <span>RISK SIGNAL</span>
            </div>
            <h2 id="case-preview-title">{selected.title}</h2>
            <p className={styles.previewSummary}>{selected.summary}</p>
            <dl className={styles.previewFacts}>
              <div>
                <dt>Customer</dt>
                <dd>{selected.customer}</dd>
              </div>
              <div>
                <dt>Account</dt>
                <dd>{selected.account}</dd>
              </div>
              <div>
                <dt>Total movement</dt>
                <dd>{money(selected.amount, selected.currency)}</dd>
              </div>
              <div>
                <dt>Opened</dt>
                <dd>{selected.openedAt}</dd>
              </div>
            </dl>
            <p className={styles.previewNote}>
              A risk signal invites investigation. It does not establish
              wrongdoing.
            </p>
            <Link className={styles.openCase} href={`/cases/${selected.id}`}>
              Open investigation{" "}
              <span aria-hidden="true">
                <ActionArrow />
              </span>
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}

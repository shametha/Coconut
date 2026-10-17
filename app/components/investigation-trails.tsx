"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { InvestigationView } from "@/lib/investigation-store";
import { investigationEventTitle } from "@/lib/customer-reports";
import { useCaseWorkspace } from "./case-workspace";
import { ActionArrow } from "./action-arrow";
import { PossibilityExplorer } from "./possibility-explorer";
import { InvestigationRewind } from "./investigation-rewind";
import { InvestigationReferences } from "./investigation-references";
import styles from "./investigation-trails.module.css";

const stateLabels = {
  possible: "Still possible",
  supported: "Supported within scope",
  contradicted: "Contradicted within scope",
  conflicting: "Conflicting evidence",
};
const checkLabels = {
  passed: "Check passed",
  failed: "Check failed",
  unresolved: "Unresolved",
  conflicting: "Conflicting",
};

export function InvestigationTrails() {
  const {
    caseFile,
    investigationRevision,
    refreshInvestigation,
    selectedHypothesis: selected,
    selectHypothesis: setSelected,
  } = useCaseWorkspace();
  const [view, setView] = useState<InvestigationView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [authSelected, setAuthSelected] = useState("customer");
  const lock = useRef(false);
  const endpoint = `/api/cases/${caseFile.id}/investigation`;
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch(endpoint, { cache: "no-store", signal });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "The investigation could not be loaded.");
      setView(body);
    },
    [endpoint],
  );
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    load(controller.signal).catch((e) => {
      if (!controller.signal.aborted) setError(e.message);
    });
    return () => controller.abort();
  }, [load, investigationRevision]);
  async function act(action: string, values: Record<string, unknown> = {}) {
    if (lock.current) return;
    lock.current = true;
    setBusy(action === "retrieve" ? `retrieve:${values.documentId}` : action);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          revision: view?.state?.revision,
          ...(action === "ask" ? { hypothesisId: selected } : {}),
          ...values,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error || "The investigation could not be updated.",
        );
      setView(body);
      refreshInvestigation();
      if (action === "ask") setQuestion("");
      if (action === "plan") {
        setComposerOpen(false);
        const first = body.evaluation.space.groups.at(-1)?.branches[0];
        if (first) setSelected(first.id);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The request could not be completed.",
      );
    } finally {
      setBusy(null);
      lock.current = false;
    }
  }
  const branch = view?.evaluation.branches.find((b) => b.id === authSelected);
  const started = Boolean(view?.state);
  const latest = view?.state?.history
    .filter((h) => h.event === "source_received")
    .at(-1);
  return (
    <div className={styles.workspace}>
      <header className={styles.intro}>
        <span className={styles.eyebrow}>05 / POSSIBILITIES</span>
        <h2>
          An investigation <em>you can rewind.</em>
        </h2>
        <p>
          See how each record changes what remains possible. Select a path,
          inspect its evidence and retrace the investigation.
        </p>
      </header>
      {error && (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              load().catch((e) => setError(e.message));
            }}
          >
            Refresh source checks <ActionArrow />
          </button>
        </div>
      )}
      {!view && !error && (
        <p role="status">
          Reading case payments and the connected evidence register…
        </p>
      )}
      {view && (
        <>
          {started && (
            <InvestigationRewind
              view={view}
              busy={busy}
              onRefresh={() => {
                void load().catch((e) => setError(e.message));
              }}
              onAddUnknown={() => {
                setComposerOpen(true);
                requestAnimationFrame(() => {
                  document.getElementById("missing-information")?.focus();
                });
              }}
            />
          )}
          {!started && (
            <section className={styles.gap} aria-labelledby="authorization-gap">
              <span className={styles.gapMark} aria-hidden="true">
                ?
              </span>
              <div>
                <span className={styles.eyebrow}>THE QUESTION STILL OPEN</span>
                <h3 id="authorization-gap">
                  What could change this investigation?
                </h3>
                <p>
                  {view.evaluation.receivedPaymentCount === 0
                    ? "Approval records have not been retrieved into this investigation. The recorded payments alone do not establish their authorization."
                    : `${view.evaluation.receivedPaymentCount} of ${view.evaluation.paymentCount} payments have a retrieved approval record. Review its authority, scope and any conflicting evidence.`}
                </p>
              </div>
              <div className={styles.gapAction}>
                <button
                  type="button"
                  className={styles.action}
                  disabled={Boolean(busy)}
                  onClick={() => act("start")}
                >
                  {busy === "start"
                    ? "Opening investigation…"
                    : "Explore the possibilities"}{" "}
                  <ActionArrow />
                </button>
              </div>
            </section>
          )}
          <p className={styles.scope}>
            Authored synthetic case and sources · Conditional explanations ·
            Human review
          </p>
          {started && (
            <>
              {latest && (
                <details className={styles.sourceUpdateLog}>
                  <summary>Latest source check updates</summary>
                  <section
                    className={styles.update}
                    aria-live="polite"
                    aria-labelledby="evidence-change-title"
                  >
                    <span className={styles.eyebrow}>LATEST EVIDENCE</span>
                    <h3 id="evidence-change-title">
                      What this record changed.
                    </h3>
                    <p className={styles.secondary}>
                      {view.state!.documents.find(
                        (source) => source.document.id === latest.documentId,
                      )?.document.title ?? latest.detail}
                    </p>
                    {latest.impact && (
                      <div className={styles.impactStats}>
                        <div>
                          <strong>
                            {latest.impact.approvalCoverage.before} →{" "}
                            {latest.impact.approvalCoverage.after}
                          </strong>
                          <span>
                            of {latest.impact.approvalCoverage.total} payments
                            with approval records
                          </span>
                        </div>
                        {latest.impact.combinations && (
                          <div>
                            <strong>
                              {latest.impact.combinations.before.compatible} →{" "}
                              {latest.impact.combinations.after.compatible}
                            </strong>
                            <span>
                              source-compatible combinations of{" "}
                              {latest.impact.combinations.total}
                            </span>
                            <small>
                              {latest.impact.combinations.after.incompatible}{" "}
                              incompatible ·{" "}
                              {latest.impact.combinations.after.conflicting}{" "}
                              conflicting
                            </small>
                          </div>
                        )}
                      </div>
                    )}
                    <details
                      key={latest.id}
                      className={styles.impactDetails}
                      open={latest.changes.length <= 2}
                    >
                      <summary>
                        Review {latest.changes.length} check updates
                      </summary>
                      {latest.changes.length ? (
                        <ul>
                          {latest.changes.map((change, i) => (
                            <li key={i}>{change}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>No evaluated checks changed for this record.</p>
                      )}
                    </details>
                    <p className={styles.secondary}>
                      Changes shown at retrieval, using the unknowns then in
                      this workspace. Source consistency does not establish
                      likelihood or wrongdoing.
                    </p>
                  </section>
                </details>
              )}
              <PossibilityExplorer
                view={view}
                busy={busy}
                act={act}
                composerOpen={composerOpen}
                onComposerChange={setComposerOpen}
              />
              <details className={styles.authorizationReview}>
                <summary>
                  Review authorization checks{" "}
                  <small>
                    {view.evaluation.receivedPaymentCount}/
                    {view.evaluation.paymentCount} payments with approval
                    records
                  </small>
                </summary>
                <span className={styles.eyebrow}>
                  AUTHORIZATION · REVIEWED CHECKS
                </span>
                <div className={styles.fork} aria-hidden="true">
                  <svg viewBox="0 0 900 60" preserveAspectRatio="none">
                    <path d="M450 0V18M150 60V38Q150 18 170 18H730Q750 18 750 38V60M450 18V60" />
                  </svg>
                </div>
                <div
                  className={styles.branches}
                  role="tablist"
                  aria-label="Conditional investigation trails"
                >
                  {view.evaluation.branches.map((item, i) => (
                    <button
                      type="button"
                      role="tab"
                      tabIndex={authSelected === item.id ? 0 : -1}
                      key={item.id}
                      id={`trail-tab-${item.id}`}
                      aria-controls={`trail-panel-${item.id}`}
                      aria-selected={authSelected === item.id}
                      className={
                        authSelected === item.id ? styles.selected : ""
                      }
                      onClick={() => {
                        setAuthSelected(item.id);
                        setSelected(item.id);
                      }}
                      onKeyDown={(event) => {
                        if (
                          !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                            event.key,
                          )
                        )
                          return;
                        event.preventDefault();
                        const next =
                          event.key === "Home"
                            ? 0
                            : event.key === "End"
                              ? 2
                              : (i + (event.key === "ArrowRight" ? 1 : 2)) % 3;
                        setAuthSelected(view.evaluation.branches[next].id);
                        setSelected(view.evaluation.branches[next].id);
                        event.currentTarget.parentElement
                          ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                          [next]?.focus();
                      }}
                    >
                      <span className={styles.branchNumber}>0{i + 1}</span>
                      <strong>{item.title}</strong>
                      <small data-state={item.state}>
                        {stateLabels[item.state]}
                      </small>
                    </button>
                  ))}
                </div>
                {branch && (
                  <section
                    className={styles.trailLayout}
                    role="tabpanel"
                    id={`trail-panel-${branch.id}`}
                    aria-labelledby={`trail-tab-${branch.id}`}
                  >
                    <div className={styles.trail}>
                      <div className={styles.assumption}>
                        <span className={styles.eyebrow}>
                          ASSUME, FOR THIS TRAIL ONLY
                        </span>
                        <p>{branch.assumption}</p>
                        <small>
                          This assumption does not change the case records.
                        </small>
                      </div>
                      <ol className={styles.checks}>
                        {branch.checks.map((check, i) => (
                          <li key={check.id}>
                            <span className={styles.checkNumber}>
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <div>
                              <div className={styles.checkHeading}>
                                <h4>{check.title}</h4>
                                <span data-state={check.state}>
                                  {checkLabels[check.state]}
                                </span>
                              </div>
                              <p>{check.detail}</p>
                              {check.assumption && (
                                <small>
                                  Conditional on: {check.assumption}
                                </small>
                              )}
                              {check.references.length > 0 && (
                                <div className={styles.references}>
                                  <InvestigationReferences
                                    view={view}
                                    ids={check.references}
                                  />
                                </div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                      <div className={styles.nextStep}>
                        <span className={styles.eyebrow}>
                          CONTINUE THIS TRAIL
                        </span>
                        <p>{branch.nextStep}</p>
                      </div>
                    </div>
                    <aside
                      className={styles.evidencePlan}
                      aria-label="Next evidence to obtain"
                    >
                      <span className={styles.eyebrow}>
                        WHAT TO OBTAIN NEXT
                      </span>
                      {view.evaluation.requests.map((r, i) => (
                        <div key={r.id}>
                          <span className={styles.requestNumber}>0{i + 1}</span>
                          <h4>{r.title}</h4>
                          <p>{r.reason}</p>
                          <small>Suggested source: {r.source}</small>
                        </div>
                      ))}
                      <p className={styles.noProbability}>
                        The order reflects open checks and distinguishing
                        evidence. No likelihood percentages are assigned.
                      </p>
                    </aside>
                  </section>
                )}
                {view.evaluation.conflicts.length > 0 && (
                  <section className={styles.conflict} role="status">
                    <span className={styles.eyebrow}>THE SOURCES DISAGREE</span>
                    {view.evaluation.conflicts.map((c) => (
                      <p key={c}>{c}</p>
                    ))}
                    <strong>The disputed question stays open.</strong>
                  </section>
                )}
              </details>
              <section
                className={styles.sources}
                aria-labelledby="source-inbox-title"
              >
                <div className={styles.sectionHeading}>
                  <div>
                    <span className={styles.eyebrow}>AVAILABLE RECORDS</span>
                    <h3 id="source-inbox-title">Source inbox</h3>
                  </div>
                </div>
                <p className={styles.secondary}>
                  Retrieve a record to check its case scope and payment
                  references, then see which investigation checks change.
                </p>
                {!view.sources.length && (
                  <p>
                    No additional source documents are registered for this case.
                    Obtain records from the indicated source; the missing
                    information remains unresolved.
                  </p>
                )}
                {view.sources.map((source) => (
                  <div className={styles.sourceRow} key={source.id}>
                    <div>
                      <strong>{source.title}</strong>
                      <small>{source.issuer} · Synthetic</small>
                    </div>
                    <button
                      type="button"
                      disabled={source.received || Boolean(busy)}
                      onClick={() => act("retrieve", { documentId: source.id })}
                    >
                      {source.received
                        ? "Retrieved and checked"
                        : busy === `retrieve:${source.id}`
                          ? "Checking source…"
                          : "Retrieve and evaluate"}
                      {!source.received && <ActionArrow />}
                    </button>
                  </div>
                ))}
              </section>
              <section
                className={styles.ask}
                aria-labelledby="ask-trails-title"
              >
                <div>
                  <span className={styles.eyebrow}>ASK ABOUT THESE TRAILS</span>
                  <h3 id="ask-trails-title">Ask about this investigation</h3>
                  <p>
                    Questions use the current evaluated evidence and checked
                    conversation history.
                  </p>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    act("ask", { question });
                  }}
                >
                  <label htmlFor="trail-question">
                    Your investigation question
                  </label>
                  <textarea
                    id="trail-question"
                    maxLength={1000}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="What changes if a delegate approved the payments?"
                    disabled={Boolean(busy)}
                    rows={2}
                  />
                  <button
                    type="submit"
                    className={styles.action}
                    disabled={!question.trim() || Boolean(busy)}
                  >
                    {busy === "ask"
                      ? "Checking the investigation…"
                      : "Ask Coconut"}{" "}
                    <ActionArrow />
                  </button>
                  <small>
                    Selected trail:{" "}
                    {view.evaluation.branches.find((b) => b.id === selected)
                      ?.title ??
                      view.evaluation.space.groups
                        .flatMap((g) => g.branches)
                        .find((b) => b.id === selected)?.title ??
                      "Current investigation"}{" "}
                  </small>
                </form>
                {view
                  .state!.answers.slice()
                  .reverse()
                  .map((answer) => (
                    <article className={styles.answer} key={answer.id}>
                      <blockquote>{answer.question}</blockquote>
                      {answer.fingerprint !== view.evaluation.fingerprint && (
                        <span className={styles.stale}>
                          Earlier evidence snapshot · ask again for the current
                          investigation
                        </span>
                      )}
                      {answer.paragraphs.map((p, i) => (
                        <div key={i}>
                          <p>{p.text}</p>
                          {p.references.length > 0 && (
                            <InvestigationReferences
                              view={view}
                              ids={p.references}
                            />
                          )}
                        </div>
                      ))}
                      {answer.requests.map((id) => {
                        const r = view.evaluation.requests.find(
                          (r) => r.id === id,
                        );
                        return r ? (
                          <p key={id}>
                            <strong>Next evidence:</strong> {r.title}.{" "}
                            {r.reason}
                          </p>
                        ) : null;
                      })}
                      <small className={styles.poweredBy}>
                        Powered by Gemini
                      </small>
                    </article>
                  ))}
              </section>
              <section className={styles.history}>
                <div className={styles.sectionHeading}>
                  <h3>An investigation you can retrace.</h3>
                  <a
                    href={`${endpoint}?export=1`}
                    className={styles.textButton}
                    download
                  >
                    Download investigation summary <ActionArrow />
                  </a>
                </div>
                <p className={styles.secondary}>
                  The export contains assumptions, checked source records and
                  update history. It is an investigation plan for human review.
                </p>
                {view
                  .state!.history.slice()
                  .reverse()
                  .map((event) => (
                    <details key={event.id}>
                      <summary>
                        <time>
                          {new Date(event.at).toLocaleString("en-IN")}
                        </time>{" "}
                        {investigationEventTitle(event, view.state!)}
                      </summary>
                      {event.changes.map((change, i) => (
                        <p key={i}>{change}</p>
                      ))}
                    </details>
                  ))}
                <details>
                  <summary>Inspect retrieved source records</summary>
                  {view.state!.documents.map((source) => (
                    <div key={source.document.id}>
                      <h4>{source.document.title}</h4>
                      <InvestigationReferences
                        view={view}
                        ids={source.document.records.map((record) => record.id)}
                        buttonLabel="Inspect source"
                      />
                    </div>
                  ))}
                </details>
              </section>
            </>
          )}
          <footer className={styles.foot}>
            <p>
              Every trail remains conditional until its assumptions are
              supported by appropriately scoped evidence. Other explanations and
              conflicting records may keep the investigation open.
            </p>
            <Link href={`/cases/${caseFile.id}/core`}>
              Inspect the evidence Core <ActionArrow />
            </Link>
          </footer>
        </>
      )}
    </div>
  );
}

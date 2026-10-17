"use client";

import { ActionArrow } from "./action-arrow";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { AiCitation, AiFact, AiRun } from "@/lib/ai-contract";
import type { CopilotGuide } from "@/lib/copilot-guide";
import { citedDraft } from "@/lib/customer-reports";
import { useCaseWorkspace } from "./case-workspace";
import styles from "./case-assistant.module.css";
import workspace from "./case-workspace.module.css";

const sectionQuestions: Record<string, string[]> = {
  Inbox: [
    "Which case has the highest risk signal?",
    "Compare the cases by movement.",
    "How many cases need review?",
  ],
  Overview: [
    "What activity triggered this case?",
    "What counter-evidence should I review?",
    "Which policy applies?",
  ],
  Activity: [
    "What movement is recorded?",
    "Is the activity above the configured baseline?",
    "How soon did the device appear before the first transfer?",
  ],
  Links: [
    "Which accounts and prior cases are connected?",
    "What beneficiary connects the activity?",
    "What counter-evidence should I review?",
  ],
  Challenge: [
    "What counter-evidence should I review?",
    "Does the beneficiary relationship predate the alert?",
    "Is there a comparable prior payment?",
  ],
  Core: [
    "Which policy applies?",
    "What evidence supports the recorded activity?",
    "What information is missing?",
  ],
  Finding: [
    "What should the investigator review before deciding?",
    "What counter-evidence belongs in the finding?",
    "Which policy supports review?",
  ],
};
const nextSections = {
  inspect_activity: { path: "/activity", text: "Inspect the activity" },
  inspect_links: { path: "/links", text: "Review the connections" },
  review_counter_evidence: {
    path: "/challenge",
    text: "Review counter-evidence",
  },
  human_review: { path: "/core", text: "Review the source records" },
  none: null,
};

type InspectSource = (citation: AiCitation, text: string) => void;

function Citation({
  citation,
  text,
  onInspect,
}: {
  citation: AiCitation;
  text: string;
  onInspect?: InspectSource;
}) {
  return (
    <button
      type="button"
      className={workspace.citation}
      aria-label={`Inspect source ${citation.id}: ${citation.title}`}
      onClick={() => (onInspect ? onInspect(citation, text) : undefined)}
    >
      [{citation.id}]
    </button>
  );
}

function FactList({
  facts,
  onInspect,
}: {
  facts: AiFact[];
  onInspect?: InspectSource;
}) {
  return (
    <ul className={styles.facts}>
      {facts.map((fact) => (
        <li key={fact.id}>
          <p>
            {fact.text}{" "}
            <span className={styles.citations}>
              {fact.citations.map((citation) => (
                <Citation
                  key={`${citation.id}:${citation.sourceRecord}`}
                  citation={citation}
                  text={fact.text}
                  onInspect={onInspect}
                />
              ))}
            </span>
          </p>
        </li>
      ))}
    </ul>
  );
}

function RunReference() {
  return <small className={styles.reference}>Powered by Gemini</small>;
}

type Exchange = {
  id: number;
  question: string;
  state: "waiting" | "answered" | "failed" | "stopped";
  run?: AiRun;
  guide?: CopilotGuide;
  error?: string;
  needsFreshStart?: boolean;
};

function WaitingThread({
  label = "Checking the records for a cited answer…",
}: {
  label?: string;
}) {
  return (
    <div className={styles.waitingThread} role="status">
      <svg viewBox="0 0 150 34" aria-hidden="true">
        <path
          className={styles.waitingPath}
          d="M5 21C28 1 45 4 70 20S115 30 145 9"
        />
        <path
          className={styles.waitingTravel}
          d="M5 21C28 1 45 4 70 20S115 30 145 9"
        />
        <circle cx="5" cy="21" r="2.5" />
        <circle cx="70" cy="20" r="3" />
        <circle cx="145" cy="9" r="2.5" />
      </svg>
      <span>{label}</span>
    </div>
  );
}

export function QuestionAssistant({
  section = "Overview",
  compact = false,
  paper = false,
  onNavigate,
  caseId,
  source,
  onInspectEvidence,
  onPreviewCase,
}: {
  caseId?: string;
  source: "demo" | "firestore";
  onInspectEvidence?: InspectSource;
  onPreviewCase?: (id: string) => void;
  section?: string;
  compact?: boolean;
  paper?: boolean;
  onNavigate?: () => void;
}) {
  const inbox = !caseId;
  const inputId = useId();
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [pending, setPending] = useState(false);
  const [inspected, setInspected] = useState<{
    citation: AiCitation;
    text: string;
  } | null>(null);
  const sourceClose = useRef<HTMLButtonElement>(null);
  const sourceTrigger = useRef<HTMLElement | null>(null);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const log = useRef<HTMLDivElement>(null);
  const followReplies = useRef(true);
  useEffect(() => () => controller.current?.abort("unmounted"), []);
  useEffect(() => {
    if (followReplies.current && log.current)
      log.current.scrollTop = log.current.scrollHeight;
  }, [exchanges]);
  useEffect(() => {
    const element = log.current;
    if (!element) return;
    const resize = new ResizeObserver(() => {
      if (followReplies.current) element.scrollTop = element.scrollHeight;
    });
    resize.observe(element);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    if (inspected) {
      if (log.current) log.current.scrollTop = log.current.scrollHeight;
      sourceClose.current?.focus({ preventScroll: true });
    }
  }, [inspected]);
  const closeSource = () => {
    setInspected(null);
    sourceTrigger.current?.focus({ preventScroll: true });
  };
  const inspect: InspectSource = (citation, text) => {
    sourceTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setInspected({ citation, text });
  };
  async function ask(text: string, fresh = false) {
    const value = text.trim();
    if (controller.current || !value) return;
    const id = ++sequence.current;
    const request = new AbortController();
    controller.current = request;
    followReplies.current = true;
    setQuestion("");
    setInspected(null);
    setPending(true);
    setExchanges((previous) => [
      ...(fresh ? [] : previous),
      { id, question: value, state: "waiting" },
    ]);
    const update = (change: Partial<Exchange>) =>
      setExchanges((previous) =>
        previous.map((item) =>
          item.id === id ? { ...item, ...change } : item,
        ),
      );
    const timer = window.setTimeout(() => request.abort("timeout"), 85_000);
    try {
      const response = await fetch(
        caseId ? `/api/cases/${caseId}/ask` : "/api/cases/ask",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: value,
            previousRunIds: (fresh ? [] : exchanges)
              .filter(
                (item) =>
                  item.state === "answered" && item.run?.kind === "question",
              )
              .slice(-4)
              .map((item) => item.run!.id),
          }),
          signal: request.signal,
        },
      );
      const data = await response.json();
      if (response.status === 409) update({ needsFreshStart: true });
      if (!response.ok)
        throw new Error(data.error || "The answer is unavailable.");
      if (!data.run && !data.guide)
        throw new Error("The answer is unavailable.");
      update({ state: "answered", run: data.run, guide: data.guide });
    } catch (failure) {
      if (request.signal.reason === "unmounted") return;
      const stopped = request.signal.reason === "user-stopped";
      update({
        state: stopped ? "stopped" : "failed",
        error: stopped
          ? "Stopped waiting. The request may still finish in the background."
          : request.signal.aborted
            ? "This is taking longer than expected. Try the question again."
            : failure instanceof Error
              ? failure.message
              : "The answer is unavailable.",
      });
    } finally {
      window.clearTimeout(timer);
      if (controller.current === request) {
        controller.current = null;
        setPending(false);
      }
    }
  }
  return (
    <section
      className={`${styles.assistant} ${compact ? styles.compact : ""} ${paper ? `${styles.paper} ${styles.scrollNote}` : ""}`}
      aria-labelledby={paper ? undefined : `${inputId}-heading`}
      aria-label={
        paper
          ? inbox
            ? "Ask about the case inbox"
            : "Ask about this case"
          : undefined
      }
      onKeyDownCapture={(event) => {
        if (event.key === "Escape" && inspected) {
          event.preventDefault();
          event.stopPropagation();
          closeSource();
        }
      }}
    >
      <div className={styles.heading} hidden={compact}>
        <div>
          <span className={workspace.kicker}>CASE COPILOT / {caseId}</span>
          <h3 id={`${inputId}-heading`}>Follow your curiosity.</h3>
        </div>
        <span className={styles.aiMark}>
          <i aria-hidden="true" /> AI ASSISTED
        </span>
      </div>
      <p className={styles.intro} hidden={compact}>
        Ask about the activity, connections or another explanation. Each
        question is checked against this case’s records; answers link to their
        sources.
      </p>
      {source !== "firestore" ? (
        <p className={styles.status}>
          Connect the case database to ask case questions.
        </p>
      ) : (
        <>
          <div
            ref={log}
            className={`${styles.conversation} ${!exchanges.length ? styles.emptyConversation : ""}`}
            role="log"
            aria-label="Case questions and answers"
            aria-live="polite"
            aria-relevant="additions text"
            onScroll={() => {
              if (log.current)
                followReplies.current =
                  log.current.scrollHeight -
                    log.current.scrollTop -
                    log.current.clientHeight <
                  60;
            }}
          >
            {exchanges.length === 0 ? (
              <div className={styles.chatEmpty}>
                {!paper && (
                  <span className={styles.emptyEyebrow}>
                    {section.toUpperCase()} / START HERE
                  </span>
                )}
                <p>
                  {paper ? (
                    inbox ? (
                      "Which signal should we follow?"
                    ) : (
                      "Where should we look?"
                    )
                  ) : (
                    <>
                      What would you like
                      <br />
                      to understand?
                    </>
                  )}
                </p>
              </div>
            ) : (
              exchanges.map((item) => (
                <div className={styles.exchange} key={item.id}>
                  <div className={styles.userMessage}>
                    <span className={styles.messageLabel}>YOU</span>
                    <p>{item.question}</p>
                  </div>
                  <div className={styles.assistantMessage}>
                    <span className={styles.messageLabel}>COCONUT</span>
                    {item.state === "waiting" ? (
                      <WaitingThread
                        label={inbox ? "Reading the case register…" : undefined}
                      />
                    ) : item.guide ? (
                      <div className={styles.guide}>
                        <h3>{item.guide.title}</h3>
                        <p>{item.guide.introduction}</p>
                        <ul>
                          {item.guide.capabilities.map((capability) => (
                            <li key={capability.section}>
                              <strong>{capability.section}</strong>
                              <span>{capability.description}</span>
                            </li>
                          ))}
                        </ul>
                        <p>{item.guide.limitation}</p>
                      </div>
                    ) : item.run ? (
                      <>
                        {item.run.status === "insufficient" ? (
                          <p className={styles.missingAnswer}>
                            {item.run.message ??
                              "I can’t find that information in the checked records. Ask about the activity, links or counter-evidence, or inspect the sources in Core."}
                          </p>
                        ) : (
                          <FactList
                            facts={item.run.facts}
                            onInspect={paper ? inspect : onInspectEvidence}
                          />
                        )}
                        {inbox &&
                          onPreviewCase &&
                          [
                            ...new Set(
                              item.run.facts.flatMap((fact) =>
                                fact.citations
                                  .map((citation) => citation.caseId)
                                  .filter((id): id is string => !!id),
                              ),
                            ),
                          ].map((id) => (
                            <button
                              key={id}
                              type="button"
                              className={styles.next}
                              onClick={() => onPreviewCase(id)}
                            >
                              Preview {id} <ActionArrow />
                            </button>
                          ))}
                        {!inbox && nextSections[item.run.nextStep] && (
                          <Link
                            className={styles.next}
                            href={`/cases/${caseId}${nextSections[item.run.nextStep]!.path}`}
                            onClick={onNavigate}
                          >
                            {nextSections[item.run.nextStep]!.text}{" "}
                            <ActionArrow />
                          </Link>
                        )}
                        <RunReference />
                      </>
                    ) : (
                      <>
                        <p className={styles.error}>{item.error}</p>
                        <button
                          type="button"
                          className={styles.retryQuestion}
                          disabled={pending}
                          onClick={() =>
                            ask(item.question, item.needsFreshStart)
                          }
                        >
                          {item.needsFreshStart
                            ? "Ask as a new question"
                            : "Try this question again"}{" "}
                          <ActionArrow />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
            {inspected && (
              <section
                className={styles.sourcePreview}
                aria-label={`Source ${inspected.citation.id}`}
              >
                <header>
                  <strong>{inspected.citation.title}</strong>
                  <button
                    ref={sourceClose}
                    type="button"
                    onClick={closeSource}
                    aria-label="Close source details"
                  >
                    ×
                  </button>
                </header>
                <p>{inspected.text}</p>
                <dl>
                  {[
                    [
                      "Observed",
                      new Date(inspected.citation.observedAt).toLocaleString(
                        "en-IN",
                        { timeZone: "Asia/Kolkata" },
                      ) + " IST",
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
          <div
            className={styles.suggestions}
            hidden={paper && exchanges.length > 0}
            aria-label="Suggested case questions"
          >
            {(sectionQuestions[section] ?? sectionQuestions.Overview)
              .slice(0, paper ? 2 : 3)
              .map((text) => (
                <button
                  type="button"
                  key={text}
                  onClick={() => ask(text)}
                  disabled={pending}
                >
                  <span>
                    {paper && section === "Overview"
                      ? text === sectionQuestions.Overview[0]
                        ? "What triggered it?"
                        : "What could change it?"
                      : text}
                  </span>
                  <span aria-hidden="true">
                    <ActionArrow />
                  </span>
                </button>
              ))}
          </div>
          <form
            className={styles.composer}
            onSubmit={(event) => {
              event.preventDefault();
              void ask(question);
            }}
          >
            <label htmlFor={inputId}>Your question</label>
            <textarea
              id={inputId}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={600}
              placeholder={
                exchanges.length
                  ? "Ask another question…"
                  : inbox
                    ? "Find or compare cases…"
                    : "Ask about this case…"
              }
              rows={2}
              required
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  if (!pending) void ask(question);
                }
              }}
            />
            <div className={styles.formFoot}>
              <span>
                {question.length}/600{" "}
                <small>Enter to send · Shift + Enter for a new line</small>
              </span>
              {pending ? (
                <button
                  type="button"
                  className={styles.action}
                  onClick={() => controller.current?.abort("user-stopped")}
                >
                  Stop waiting <span aria-hidden="true">□</span>
                </button>
              ) : (
                <button
                  type="submit"
                  className={styles.action}
                  disabled={!question.trim()}
                >
                  {paper ? "Ask" : "Ask Coconut"}{" "}
                  <span aria-hidden="true">
                    <ActionArrow />
                  </span>
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </section>
  );
}

export function CaseAssistant(props: {
  section?: string;
  compact?: boolean;
  paper?: boolean;
  onNavigate?: () => void;
}) {
  const { caseFile, source, openEvidence } = useCaseWorkspace();
  return (
    <QuestionAssistant
      {...props}
      caseId={caseFile.id}
      source={source}
      onInspectEvidence={(citation, text) =>
        openEvidence({ ...citation, summary: text, verified: true })
      }
    />
  );
}

export function AiFinding() {
  const { caseFile, source, downloadManifest, openEvidence } =
    useCaseWorkspace();
  const [run, setRun] = useState<AiRun | null>(null);
  const [checking, setChecking] = useState(source === "firestore");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    if (source !== "firestore") return;
    const read = new AbortController();
    fetch(`/api/cases/${caseFile.id}/finding`, { signal: read.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Saved draft unavailable.");
        return data;
      })
      .then((data) => {
        setRun(data.run);
        setChecking(false);
      })
      .catch((failure) => {
        if (!read.signal.aborted) {
          setError(failure.message);
          setChecking(false);
        }
      });
    return () => {
      read.abort();
      controller.current?.abort();
    };
  }, [caseFile.id, source]);
  async function generate() {
    if (pending) return;
    setPending(true);
    setError("");
    controller.current = new AbortController();
    const timer = window.setTimeout(() => controller.current?.abort(), 85_000);
    try {
      const response = await fetch(`/api/cases/${caseFile.id}/finding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: controller.current.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Draft unavailable.");
      setRun(data.run);
    } catch (failure) {
      setError(
        controller.current?.signal.aborted
          ? "The request took too long. Try again to check for a saved draft."
          : failure instanceof Error
            ? failure.message
            : "Draft unavailable.",
      );
    } finally {
      window.clearTimeout(timer);
      setPending(false);
    }
  }
  function downloadDraft() {
    if (!run) return;
    const url = URL.createObjectURL(
      new Blob([citedDraft(run)], { type: "text/markdown;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${caseFile.id.toLowerCase()}-cited-draft.md`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <section className={styles.prepare}>
        <div>
          <span className={workspace.kicker}>AI ASSISTED / HUMAN REVIEW</span>
          <h3>
            {run
              ? "Your cited draft is ready for review."
              : "Bring the checked records together."}
          </h3>
          <p>
            Include the observations and counter-evidence in one note. The final
            decision remains with the investigator.
          </p>
        </div>
        <button
          type="button"
          className={styles.action}
          onClick={generate}
          disabled={pending || checking || source !== "firestore"}
        >
          {pending
            ? "Preparing draft…"
            : run
              ? "Check for updated draft"
              : "Generate draft"}
          <span aria-hidden="true">
            <ActionArrow />
          </span>
        </button>
      </section>
      <div aria-live="polite" aria-busy={pending || checking}>
        {(pending || checking) && (
          <WaitingThread
            label={
              pending
                ? "Preparing a cited draft from checked records…"
                : "Checking for a saved draft…"
            }
          />
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {source !== "firestore" && (
          <p className={styles.status}>
            Connect the case database to generate a cited draft.
          </p>
        )}
      </div>
      {run && (
        <>
          <article className={`${workspace.draft} ${styles.paper}`}>
            <div className={workspace.documentMasthead}>
              <span>coconut</span>
              <span>
                INVESTIGATION NOTE
                <br />
                {caseFile.id}
              </span>
            </div>
            <div className={workspace.draftBadge}>DRAFT / FOR HUMAN REVIEW</div>
            <h3>{caseFile.title}</h3>
            <p className={workspace.documentDeck}>
              {caseFile.customer} · {caseFile.account}
            </p>
            <p className={workspace.documentScope}>
              These observations support investigation. They do not establish
              intent or wrongdoing.
            </p>
            <h4>
              <span>01</span> What the evidence shows
            </h4>
            <FactList
              facts={run.facts.filter(
                (fact) => fact.category === "observation",
              )}
              onInspect={(citation, text) =>
                openEvidence({ ...citation, summary: text, verified: true })
              }
            />
            <h4>
              <span>02</span> What might change the interpretation
            </h4>
            <FactList
              facts={run.facts.filter((fact) => fact.category === "mitigation")}
              onInspect={(citation, text) =>
                openEvidence({ ...citation, summary: text, verified: true })
              }
            />
            {!run.facts.some((fact) => fact.category === "mitigation") && (
              <p>
                No verified counter-evidence was available when this draft was
                prepared.
              </p>
            )}
            <h4>
              <span>03</span> Investigator review
            </h4>
            <p>
              Review the cited activity, policy and counter-evidence before
              recording a disposition. No final decision has been recorded.
            </p>
            <RunReference />
            <div className={workspace.documentEnd}>
              <span>END OF DRAFT</span>
              <span>{caseFile.coreId}</span>
            </div>
          </article>
          <div className={styles.downloads}>
            <button
              type="button"
              className={workspace.sourceButton}
              onClick={downloadDraft}
            >
              Download cited draft <ActionArrow />
            </button>
            <button
              type="button"
              className={workspace.sourceButton}
              onClick={downloadManifest}
            >
              Download evidence summary <ActionArrow />
            </button>
          </div>
        </>
      )}
    </>
  );
}

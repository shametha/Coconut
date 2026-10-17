"use client";

import { useEffect, useState } from "react";
import type { InvestigationView } from "@/lib/investigation-store";
import { useCaseWorkspace } from "./case-workspace";
import { ActionArrow } from "./action-arrow";
import { InvestigationReferences } from "./investigation-references";
import styles from "./investigation-trails.module.css";

export function InvestigationAssistant() {
  const {
    caseFile,
    investigationRevision,
    refreshInvestigation,
    selectedHypothesis,
  } = useCaseWorkspace();
  const [view, setView] = useState<InvestigationView | null>(null);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/cases/${caseFile.id}/investigation`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        setView(body);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [endpoint, investigationRevision]);
  async function ask() {
    if (busy || !question.trim() || !view?.state) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ask",
          revision: view.state.revision,
          question,
          hypothesisId: selectedHypothesis,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error || "The investigation answer is unavailable.",
        );
      setView(body);
      setQuestion("");
      refreshInvestigation();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The investigation answer is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.paperAssistant}>
      <p>
        Explore the current conditional trails and the evidence needed next.
      </p>
      {error && <p role="alert">{error}</p>}
      {!view && !error && <p role="status">Reading the investigation…</p>}
      {view && !view.state && (
        <p>
          Open the investigation in Possibilities first. That creates a saved
          workspace with separate assumptions and source records.
        </p>
      )}
      {view?.state && (
        <>
          <small>
            Selected trail:{" "}
            {view.evaluation.branches.find((b) => b.id === selectedHypothesis)
              ?.title ??
              view.evaluation.space.groups
                .flatMap((g) => g.branches)
                .find((b) => b.id === selectedHypothesis)?.title}
          </small>
          {view.state.answers.slice(-3).map((answer) => (
            <article key={answer.id}>
              <blockquote>{answer.question}</blockquote>
              {answer.fingerprint !== view.evaluation.fingerprint && (
                <small>Earlier evidence snapshot</small>
              )}
              {answer.paragraphs.map((p, i) => (
                <div key={i}>
                  <p>{p.text}</p>
                  {p.references.length > 0 && (
                    <InvestigationReferences view={view} ids={p.references} />
                  )}
                </div>
              ))}
              {answer.requests.map((id) => {
                const r = view.evaluation.requests.find((r) => r.id === id);
                return r ? (
                  <p key={id}>
                    Next evidence: {r.title}. {r.reason}
                  </p>
                ) : null;
              })}
            </article>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <label htmlFor="paper-investigation-question">
              Ask about this investigation
            </label>
            <textarea
              id="paper-investigation-question"
              value={question}
              maxLength={1000}
              rows={3}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What could explain this, and what should I check next?"
              disabled={busy}
            />
            <button type="submit" disabled={busy || !question.trim()}>
              {busy ? "Checking current evidence…" : "Ask Coconut"}{" "}
              <ActionArrow />
            </button>
            <small>Powered by Gemini</small>
          </form>
        </>
      )}
    </div>
  );
}

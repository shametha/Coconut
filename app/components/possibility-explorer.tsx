"use client";
import { useState } from "react";
import type { InvestigationView } from "@/lib/investigation-store";
import { InvestigationReferences } from "./investigation-references";
import { ActionArrow } from "./action-arrow";
import styles from "./investigation-trails.module.css";
export function PossibilityExplorer({
  view,
  busy,
  act,
  composerOpen,
  onComposerChange,
}: {
  view: InvestigationView;
  busy: string | null;
  act: (action: string, values?: Record<string, unknown>) => Promise<void>;
  composerOpen: boolean;
  onComposerChange: (open: boolean) => void;
}) {
  const [question, setQuestion] = useState("");
  const space = view.evaluation.space;
  const simulation = view.state?.simulations?.at(-1);
  const stale = simulation && simulation.fingerprint !== space.fingerprint;
  return (
    <section
      className={styles.explorer}
      aria-label="Investigation questions and joint checks"
    >
      <details
        id="unknown-composer"
        className={styles.questionComposer}
        open={composerOpen || space.groups.length === 0}
        onToggle={(event) => onComposerChange(event.currentTarget.open)}
      >
        <summary>
          <span>Investigate another unknown</span>
          <small>{space.groups.length}/3 questions in this workspace</small>
        </summary>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>INVESTIGATE THE UNKNOWN</span>
            <h3 id="explorer-title">What don’t we know yet?</h3>
          </div>
          <small>AI proposes · Evidence checks · You decide</small>
        </div>
        <p>
          Describe a missing piece of information. Coconut proposes different
          explanations and an investigation trail for each. These are
          hypotheses, never additional case facts.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await act("plan", { question });
          }}
          className={styles.planForm}
        >
          <label htmlFor="missing-information">Missing information</label>
          <textarea
            id="missing-information"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            maxLength={800}
            placeholder="We don’t know who controlled the device. How would the investigation change for each possibility?"
            disabled={Boolean(busy)}
          />
          <div className={styles.sectionHeading}>
            <small>
              {space.groups.length}/3 unknowns in this workspace · Up to 125
              combinations
            </small>
            <button
              className={styles.action}
              disabled={
                Boolean(busy) || !question.trim() || space.groups.length >= 3
              }
            >
              {busy === "plan"
                ? "Developing evidence trails…"
                : "Generate conditional trails"}{" "}
              <ActionArrow />
            </button>
          </div>
        </form>
        <div className={styles.suggestions}>
          {[
            "Who controlled the device used for these payments?",
            "What was the purpose of these payments?",
            "What was the source of the funds?",
          ].map((s) => (
            <button
              key={s}
              type="button"
              disabled={Boolean(busy)}
              onClick={() => setQuestion(s)}
            >
              {s} <ActionArrow />
            </button>
          ))}
        </div>
      </details>
      {space.groups.length > 0 && (
        <>
          <details className={styles.combinationDetails}>
            <summary>
              Check combinations across unknowns{" "}
              <small>
                {space.groups.length} question
                {space.groups.length === 1 ? "" : "s"} · up to 125 combinations
              </small>
            </summary>
            <section
              className={styles.simulation}
              aria-labelledby="simulation-title"
            >
              <div className={styles.sectionHeading}>
                <div>
                  <span className={styles.eyebrow}>COMBINE THE UNKNOWNS</span>
                  <h4 id="simulation-title">Which explanations can coexist?</h4>
                </div>
                <button
                  className={styles.action}
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    act("simulate", {
                      planIds: space.groups.map((g) => g.plan.id),
                    })
                  }
                >
                  {busy === "simulate"
                    ? "Running combinations…"
                    : "Run all combinations"}{" "}
                  <ActionArrow />
                </button>
              </div>
              <p>
                Enumerate the proposed values, including the open alternative,
                and check each combination against retrieved assertions. This
                simulates source consistency; it does not predict crime, losses
                or human behavior.
              </p>
              {simulation && (
                <>
                  {stale && (
                    <p className={styles.stale}>
                      Evidence or hypotheses changed after this run. Run it
                      again for the current investigation.
                    </p>
                  )}
                  <div className={styles.simStats}>
                    <span>
                      <strong>{simulation.worlds.length}</strong>combinations
                      executed
                    </span>
                    <span>
                      <strong>{simulation.compatible}</strong>source-compatible
                    </span>
                    <span>
                      <strong>{simulation.incompatible}</strong>incompatible
                    </span>
                    <span>
                      <strong>{simulation.conflicting}</strong>conflicting
                    </span>
                  </div>
                  <div className={styles.worlds}>
                    {simulation.worlds.map((w) => (
                      <details key={w.id}>
                        <summary>
                          <span>
                            {w.assumptions.map((a) => a.title).join(" + ")}
                          </span>
                          <small>{w.state}</small>
                        </summary>
                        {w.trace.map((t) => (
                          <div key={t.field}>
                            <p>
                              <strong>
                                {space.groups.find(
                                  (group) => group.plan.field === t.field,
                                )?.plan.label ?? "Evidence check"}{" "}
                                · {t.state}
                              </strong>
                              <br />
                              {t.detail}
                            </p>
                            <InvestigationReferences
                              view={view}
                              ids={t.references}
                            />
                          </div>
                        ))}
                      </details>
                    ))}
                  </div>
                </>
              )}
            </section>
            <section className={styles.evidencePriorities}>
              <span className={styles.eyebrow}>WHAT TO OBTAIN NEXT</span>
              <h4>Find the evidence that separates the trails.</h4>
              {space.priorities.map((p) => (
                <p key={p.planId}>
                  <strong>{p.label}</strong> · {p.branchPairs} unresolved pairs
                  of proposed explanations.
                  <br />
                  {p.reason}
                </p>
              ))}
              <small>
                Pair counts describe this bounded hypothesis set. They are not
                probabilities or expected information gain.
              </small>
            </section>
          </details>
        </>
      )}
      <p className={styles.scope}>{space.boundary}</p>
    </section>
  );
}

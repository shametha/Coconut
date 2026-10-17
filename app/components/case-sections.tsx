"use client";

import { ActionArrow } from "./action-arrow";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  coreIntegrity,
  counterfactualScore,
  type ChallengeData,
  type Evidence,
} from "@/lib/case";
import { useCaseWorkspace } from "./case-workspace";
import { EvidenceOrbit, RelationshipMap, RiskTimeline } from "./case-visuals";
import { AiFinding } from "./case-assistant";
import styles from "./case-workspace.module.css";

const money = (value: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);

function Intro({
  number,
  label,
  title,
  children,
}: {
  number: string;
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <header className={styles.pageIntro}>
      <span className={styles.kicker}>
        {number} / {label.toUpperCase()}
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
    </header>
  );
}
function Next({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link className={styles.nextLink} href={href}>
      <span>
        <small>CONTINUE THE INVESTIGATION</small>
        {children}
      </span>
      <span aria-hidden="true">
        <ActionArrow />
      </span>
    </Link>
  );
}
function EvidenceButton({
  item,
  label = "Inspect source",
}: {
  item?: Evidence;
  label?: string;
}) {
  const { openEvidence } = useCaseWorkspace();
  if (!item) return null;
  return (
    <button
      className={styles.sourceButton}
      type="button"
      onClick={() => openEvidence(item)}
    >
      {label} <ActionArrow />
    </button>
  );
}

export function OverviewSection() {
  const { caseFile, openEvidence, openCopilot } = useCaseWorkspace();
  return (
    <div className={styles.stack}>
      <Intro number="01" label="Signal" title="Look beneath the signal.">
        Start with a question. Follow it through the activity, the connections,
        and the facts that might change your view.
      </Intro>
      <div className={styles.overviewGrid}>
        <section className={styles.questionPanel}>
          <span className={styles.kicker}>THE QUESTION TO RESOLVE</span>
          <h3>Is there a legitimate explanation for this movement?</h3>
          <p className={styles.muted}>{caseFile.summary}</p>
          <span className={styles.questionFoot}>
            An open question. A traceable path to an answer.
          </span>
        </section>
        <EvidenceOrbit evidence={caseFile.evidence} onOpen={openEvidence} />
      </div>
      <div className={styles.detailStrip} aria-label="Case signal summary">
        <div>
          <span>Total movement</span>
          <strong>{money(caseFile.amount, caseFile.currency)}</strong>
        </div>
        <div>
          <span>Outbound transfers</span>
          <strong>{String(caseFile.transferCount).padStart(2, "0")}</strong>
        </div>
        <div>
          <span>Activity window</span>
          <strong>
            {caseFile.windowMinutes}
            <small> min</small>
          </strong>
        </div>
      </div>
      <button
        className={styles.copilotInvite}
        type="button"
        onClick={openCopilot}
      >
        <svg viewBox="0 0 100 40" aria-hidden="true">
          <path d="M2 24C25-7 46 48 72 19S92 5 98 17" />
          <circle cx="49" cy="26" r="3" />
        </svg>
        <span>
          <small>A QUESTION OPENS ANOTHER LAYER</small>
          <strong>Ask Coconut about this case.</strong>
        </span>
        <span aria-hidden="true">
          <ActionArrow />
        </span>
      </button>
      <Next href={`/cases/${caseFile.id}/activity`}>Follow the activity</Next>
    </div>
  );
}

export function ActivitySection() {
  const { caseFile } = useCaseWorkspace();
  const transaction = caseFile.evidence.find(
    (item) => item.kind === "transaction",
  );
  const behavior = caseFile.evidence.find((item) => item.kind === "behaviour");
  const device = caseFile.evidence.find((item) => item.kind === "device");
  return (
    <div className={styles.stack}>
      <Intro
        number="02"
        label="Activity"
        title="Follow the moments that matter."
      >
        Move through the moments that shaped the score, then examine the records
        behind them.
      </Intro>
      <RiskTimeline events={caseFile.timeline} />
      <div className={styles.splitGrid}>
        <section className={styles.factCard}>
          <span className={styles.kicker}>01 / BEHAVIOR</span>
          <strong>
            {caseFile.velocityMultiplier > 0
              ? caseFile.velocityMultiplier
              : "—"}
            {caseFile.velocityMultiplier > 0 && <em>×</em>}
          </strong>
          <span className={styles.factLabel}>
            the configured 11-minute baseline
          </span>
          <p className={styles.muted}>
            Configured window movement:{" "}
            {money(caseFile.typicalWindowAmount, caseFile.currency)}.
          </p>
          <p className={styles.muted}>
            This comparison uses the configured baseline. Independently
            established account history is unavailable.
          </p>
          <EvidenceButton item={behavior} label="Inspect baseline record" />
        </section>
        <section className={styles.factCard}>
          <span className={styles.kicker}>02 / DEVICE CONTEXT</span>
          <strong>
            {caseFile.deviceLeadSeconds >= 0 ? caseFile.deviceLeadSeconds : "—"}
            {caseFile.deviceLeadSeconds >= 0 && <em>sec</em>}
          </strong>
          <span className={styles.factLabel}>before the first transfer</span>
          <EvidenceButton item={device} label="Inspect device record" />
        </section>
      </div>
      <section className={styles.recordsPanel}>
        <div className={styles.panelTitle}>
          <div>
            <span className={styles.kicker}>TRANSACTION RECORDS</span>
            <h3>The money in motion.</h3>
          </div>
          <EvidenceButton item={transaction} />
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th scope="col">Record</th>
                <th scope="col">Time · IST</th>
                <th scope="col">Beneficiary</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {caseFile.transfers.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.time}</td>
                  <td>{item.to}</td>
                  <td>{money(item.amount, caseFile.currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>
                  {caseFile.transfers.length} transfers · Total movement
                </td>
                <td>
                  {money(
                    caseFile.transfers.reduce(
                      (sum, item) => sum + item.amount,
                      0,
                    ),
                    caseFile.currency,
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <Next href={`/cases/${caseFile.id}/links`}>See what connects</Next>
    </div>
  );
}

export function LinksSection() {
  const { caseFile, openEvidence } = useCaseWorkspace();
  return (
    <div className={styles.stack}>
      <Intro number="03" label="Links" title="No signal exists alone.">
        Follow the path from this account to its beneficiary, and into the
        relationships worth examining.
      </Intro>
      <RelationshipMap caseFile={caseFile} onOpen={openEvidence} />
      <p className={styles.finePrint}>
        A connection to a prior investigation is context. It does not establish
        wrongdoing by this customer or beneficiary.
      </p>
      <Next href={`/cases/${caseFile.id}/challenge`}>
        Consider another explanation
      </Next>
    </div>
  );
}

export function ChallengeSection() {
  const { caseFile } = useCaseWorkspace();
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [error, setError] = useState(false);
  const [removeNetwork, setRemoveNetwork] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/cases/${caseFile.id}/challenge`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Challenge unavailable");
        return response.json() as Promise<ChallengeData>;
      })
      .then(setChallenge)
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [caseFile.id]);
  const finalEvent = caseFile.timeline.at(-1);
  return (
    <div className={styles.stack}>
      <Intro number="04" label="Challenge" title="Make room for doubt.">
        A stronger investigation tests its own explanation. Weigh the facts that
        could weaken the original signal.
      </Intro>
      {error ? (
        <section className={styles.panel}>
          <h3>Challenge unavailable</h3>
          <p className={styles.muted}>
            Mitigating records could not be checked. The original score remains
            unchanged.
          </p>
        </section>
      ) : !challenge ? (
        <section className={styles.loadingPanel} role="status">
          <span className={styles.statusDot} /> Reviewing mitigating evidence…
        </section>
      ) : (
        <>
          <section className={styles.reassessment}>
            <div className={styles.reassessmentHeading}>
              <span className={styles.kicker}>THE EFFECT OF CONTEXT</span>
              <p>Reassessment after the mitigating source checks.</p>
            </div>
            <div className={styles.scoreCompare}>
              <div>
                <span>ORIGINAL SIGNAL</span>
                <strong>{challenge.originalScore}</strong>
                <div className={styles.scoreBar}>
                  <i style={{ width: `${challenge.originalScore}%` }} />
                </div>
              </div>
              <span aria-hidden="true">→</span>
              <div>
                <span>AFTER CHALLENGE</span>
                <strong>{challenge.challengedScore}</strong>
                <div className={styles.scoreBar}>
                  <i style={{ width: `${challenge.challengedScore}%` }} />
                </div>
              </div>
            </div>
            <span className={styles.scoreDelta}>
              {challenge.originalScore - challenge.challengedScore} points lower{" "}
              <span>· Risk score out of 100</span>
            </span>
          </section>
          <section className={styles.recordsPanel}>
            <div className={styles.panelTitle}>
              <div>
                <span className={styles.kicker}>MITIGATING EVIDENCE</span>
                <h3>The other side of the story.</h3>
              </div>
            </div>
            {challenge.mitigating.map((item, index) => (
              <div className={styles.mitigation} key={item.id}>
                <span className={styles.mitigationNumber}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h4>{item.title}</h4>
                  <p>{item.detail}</p>
                  <small>
                    {item.verified
                      ? challenge.source === "demo"
                        ? "RECORD LINKED"
                        : "SOURCE CHECK PASSED"
                      : "SOURCE NOT VERIFIED"}
                  </small>
                </div>
                <span className={styles.adjustment}>
                  −{item.adjustment}
                  <small>POINTS</small>
                </span>
              </div>
            ))}
          </section>
          {finalEvent && (
            <section className={styles.counterfactual}>
              <div>
                <span className={styles.kicker}>A SEPARATE WHAT-IF</span>
                <h3>What if the network link were absent?</h3>
                <p className={styles.muted}>
                  Isolate this contribution to the original score. This test
                  does not change the case or the reassessment above.
                </p>
              </div>
              <div className={styles.testControl}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={removeNetwork}
                  aria-label="Exclude network signal"
                  onClick={() => setRemoveNetwork((value) => !value)}
                >
                  <span className={styles.switchTrack}>
                    <i />
                  </span>
                  {removeNetwork ? "Link excluded" : "Link included"}
                </button>
                <div aria-live="polite">
                  <strong>
                    {counterfactualScore(finalEvent, removeNetwork)}
                  </strong>
                  <span>/ 100</span>
                </div>
              </div>
            </section>
          )}
        </>
      )}
      <Next href={`/cases/${caseFile.id}/possibilities`}>
        Explore what is missing
      </Next>
    </div>
  );
}

export function CoreSection() {
  const { caseFile, source, downloadManifest } = useCaseWorkspace();
  const integrity = coreIntegrity(caseFile.evidence);
  const policy = caseFile.evidence.find((item) => item.kind === "policy");
  return (
    <div className={styles.stack}>
      <Intro number="06" label="Core" title="Nothing without a source.">
        Review the records supporting this case and when they were observed.
      </Intro>
      <section className={styles.coreLayout}>
        <div className={styles.coreSeal}>
          <span className={styles.kicker}>{caseFile.coreId}</span>
          <div>
            <strong>{String(integrity.checked).padStart(2, "0")}</strong>
            <span>/ {String(integrity.total).padStart(2, "0")}</span>
          </div>
          <p>
            {source === "demo"
              ? "Evidence references linked"
              : "Source checks passed"}
          </p>
          <span className={styles.sealLine} />
          <small>
            {integrity.verified
              ? "COMPLETE REFERENCE CHAIN"
              : "SOURCE REVIEW INCOMPLETE"}
          </small>
        </div>
        <div className={styles.manifestList}>
          {caseFile.evidence.map((item) => (
            <EvidenceRow item={item} key={item.id} />
          ))}
          <button
            type="button"
            className={styles.sourceButton}
            onClick={downloadManifest}
            disabled={!integrity.verified}
          >
            Download evidence summary <ActionArrow />
          </button>
        </div>
      </section>
      <section className={styles.policyPanel}>
        <span className={styles.policySection}>§{caseFile.policy.section}</span>
        <div>
          <span className={styles.kicker}>POLICY CONTEXT</span>
          <h3>{caseFile.policy.title}</h3>
          <blockquote className={styles.policyQuote}>
            {caseFile.policy.passage || "The source passage is unavailable."}
          </blockquote>
          <div className={styles.sourceRow}>
            <EvidenceButton item={policy} label="Inspect policy source" />
          </div>
        </div>
      </section>
      <p className={styles.finePrint}>
        Linked records support review; they do not record a final investigator
        decision.
      </p>
      <Next href={`/cases/${caseFile.id}/finding`}>
        Bring the evidence together
      </Next>
    </div>
  );
}

function EvidenceRow({ item }: { item: Evidence }) {
  const { openEvidence, source } = useCaseWorkspace();
  return (
    <button
      type="button"
      className={styles.evidenceRow}
      onClick={() => openEvidence(item)}
    >
      <span>{item.id}</span>
      <span>
        <strong>{item.title}</strong>
        <small>
          {item.kind === "behaviour" ? "Behaviour" : item.kind} evidence
        </small>
      </span>
      <em>
        {source === "demo" ? "LINKED" : item.verified ? "CHECKED" : "PENDING"}
      </em>
      <span aria-hidden="true">
        <ActionArrow />
      </span>
    </button>
  );
}

export function FindingSection() {
  return (
    <div className={styles.stack}>
      <Intro
        number="07"
        label="Finding"
        title="From evidence to understanding."
      >
        Prepare a cited draft for review. Each reference leads back to the
        record that supports it.
      </Intro>
      <AiFinding />
      <Next href="/cases">Back to the case inbox</Next>
    </div>
  );
}

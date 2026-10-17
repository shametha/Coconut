"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { InvestigationHistory } from "@/lib/investigation-history";
import type { InvestigationView } from "@/lib/investigation-store";
import { readableValue, sourceRecordFields } from "@/lib/source-presentation";
import { useCaseWorkspace } from "./case-workspace";
import { InvestigationReferences } from "./investigation-references";
import { ActionArrow } from "./action-arrow";
import styles from "./investigation-rewind.module.css";

const labels = {
  possible: "Still possible",
  supported: "Matches retrieved assertion",
  contradicted: "Does not match",
  conflicting: "Sources disagree",
};
function RecordIcon() {
  return (
    <svg viewBox="0 0 24 28" fill="none" aria-hidden="true">
      <path
        d="M4 1h11l5 5v21H4zM14 1v6h6M8 12h8M8 17h8M8 22h5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}
const compatible = (branches: { state: string }[]) =>
  branches.filter((b) => b.state === "possible" || b.state === "supported")
    .length;

export function InvestigationRewind({
  view,
  busy,
  onAddUnknown,
  onRefresh,
}: {
  view: InvestigationView;
  busy: string | null;
  onAddUnknown: () => void;
  onRefresh: () => void;
}) {
  const { selectHypothesis } = useCaseWorkspace();
  const [history, setHistory] = useState<InvestigationHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [trailOpen, setTrailOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const revision = view.state!.revision;
  const workspaceId = view.state!.id;
  const planCount = view.state!.plans?.length ?? 0;
  const latestPlanId = view.state!.plans?.at(-1)?.id;
  const priorPlanCount = useRef(planCount);
  useEffect(() => {
    if (planCount > priorPlanCount.current && eventId === null) {
      setPlanId(latestPlanId ?? null);
      setBranchId(null);
      setRecordId(null);
    }
    priorPlanCount.current = planCount;
  }, [planCount, latestPlanId, eventId]);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    fetch(`/api/cases/${view.subject.id}/investigation?history=1`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error || "Investigation history could not be read.",
          );
        if (body.workspaceId !== workspaceId || body.revision !== revision)
          throw new Error(
            "The workspace changed while its history was loading. Refresh the source checks.",
          );
        setHistory(body);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [view.subject.id, workspaceId, revision, retry]);
  const current =
    history?.workspaceId === workspaceId && history?.revision === revision;
  const frames = current ? history.frames : [];
  const selectedIndex = eventId
    ? frames.findIndex((f) => f.id === eventId)
    : frames.length - 1;
  const index = selectedIndex < 0 ? frames.length - 1 : selectedIndex;
  const frame = frames[index];
  const live = index === frames.length - 1;
  const group =
    frame?.space.groups.find((g) => g.plan.id === planId) ??
    frame?.space.groups[0];
  const branch =
    group?.branches.find((b) => b.id === branchId) ??
    group?.branches.find((b) => b.state === "supported") ??
    group?.branches[0];
  useEffect(() => {
    if (live && branch) selectHypothesis(branch.id);
  }, [live, branch?.id, selectHypothesis]);
  const visibleDocuments = useMemo(
    () =>
      view.state!.documents.filter((d) =>
        frame?.documentIds.includes(d.document.id),
      ),
    [view.state, frame],
  );
  const frameView = {
    ...view,
    state: {
      ...view.state!,
      documents: visibleDocuments,
      plans: view.state!.plans?.filter((p) => frame?.planIds.includes(p.id)),
    },
    subject: view.state!.caseSnapshot,
  };
  const relatedRecords = visibleDocuments.flatMap((source) =>
    source.document.records
      .filter(
        (record) =>
          (record.kind === "observation" &&
            record.field === group?.plan.field) ||
          branch?.checks.some((c) => c.references.includes(record.id)),
      )
      .map((record) => ({ source, record })),
  );
  const selectedRecord =
    relatedRecords.find((entry) => entry.record.id === recordId) ??
    relatedRecords[0];
  const firstGroup =
    group &&
    frames
      .find((f) => f.space.groups.some((g) => g.plan.id === group.plan.id))
      ?.space.groups.find((g) => g.plan.id === group.plan.id);
  const before = firstGroup ? compatible(firstGroup.branches) : 0;
  const after = group ? compatible(group.branches) : 0;
  const status =
    group?.observationState === "conflicting"
      ? "Conflicting source assertions"
      : group?.observationState === "recorded"
        ? "Assertion retrieved"
        : "Missing information";
  const disputed = frame?.authorization.some((b) => b.state === "conflicting");
  const canvas = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const recordPanel = useRef<HTMLElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const [edges, setEdges] = useState<
    { id: string; path: string; state: string; selected: boolean }[]
  >([]);
  const connect = useCallback(() => {
    const box = canvas.current?.getBoundingClientRect(),
      origin = root.current?.getBoundingClientRect(),
      panel = recordPanel.current?.getBoundingClientRect();
    if (
      !box ||
      !origin ||
      !group ||
      !panel ||
      window.matchMedia("(max-width: 700px)").matches
    ) {
      setEdges([]);
      return;
    }
    const sx = origin.right - box.left,
      sy = origin.top + origin.height / 2 - box.top;
    const next = group.branches.flatMap((b) => {
      const node = nodeRefs.current.get(b.id)?.getBoundingClientRect();
      if (!node) return [];
      const x = node.left - box.left,
        y = node.top + node.height / 2 - box.top,
        mid = (sx + x) / 2;
      return [
        {
          id: b.id,
          path: `M${sx},${sy} C${mid},${sy} ${mid},${y} ${x},${y}`,
          state: b.state,
          selected: b.id === branch?.id,
        },
      ];
    });
    const chosen =
      branch && nodeRefs.current.get(branch.id)?.getBoundingClientRect();
    if (chosen && selectedRecord) {
      const x = chosen.right - box.left,
        y = chosen.top + chosen.height / 2 - box.top,
        ex = panel.left - box.left,
        ey = panel.top + panel.height / 2 - box.top,
        mid = (x + ex) / 2;
      next.push({
        id: "record-connection",
        path: `M${x},${y} C${mid},${y} ${mid},${ey} ${ex},${ey}`,
        state: branch!.state,
        selected: true,
      });
    }
    setEdges(next);
  }, [group, branch, selectedRecord?.record.id]);
  useEffect(() => {
    connect();
    const observer = new ResizeObserver(connect);
    if (canvas.current) observer.observe(canvas.current);
    if (root.current) observer.observe(root.current);
    if (recordPanel.current) observer.observe(recordPanel.current);
    for (const node of nodeRefs.current.values()) observer.observe(node);
    return () => observer.disconnect();
  }, [connect]);

  function chooseBranch(id: string) {
    setBranchId(id);
    setRecordId(null);
    setTrailOpen(true);
    if (live) selectHypothesis(id);
  }
  function branchKey(
    event: KeyboardEvent<HTMLButtonElement>,
    position: number,
  ) {
    if (!group) return;
    const length = group.branches.length;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? length - 1
          : event.key === "ArrowDown" || event.key === "ArrowRight"
            ? (position + 1) % length
            : event.key === "ArrowUp" || event.key === "ArrowLeft"
              ? (position + length - 1) % length
              : null;
    if (next === null) return;
    event.preventDefault();
    chooseBranch(group.branches[next].id);
    nodeRefs.current.get(group.branches[next].id)?.focus();
  }
  function goTo(position: number) {
    const target = frames[position];
    if (!target) return;
    setEventId(position === frames.length - 1 ? null : target.id);
    setRecordId(null);
  }
  const ticks = [
    ...new Set([0, Math.min(1, frames.length - 1), index, frames.length - 1]),
  ]
    .filter((n) => n >= 0)
    .sort((a, b) => a - b);
  return (
    <section className={styles.rewind} aria-label="Replay the investigation">
      <div className={styles.toolbar}>
        <span className={styles.eyebrow}>FOLLOW THE POSSIBILITIES</span>
        <div className={styles.toolbarActions}>
          {frame && (
            <span className={styles.snapshotState} data-live={live}>
              {live ? "Live workspace" : "Earlier snapshot"} ·{" "}
              {frame.documentIds.length} records retrieved
            </span>
          )}
          <button
            type="button"
            disabled={Boolean(busy) || planCount >= 3}
            onClick={onAddUnknown}
          >
            Add an unknown <span aria-hidden="true">＋</span>
          </button>
        </div>
      </div>
      {error ? (
        <div className={styles.empty} role="alert">
          <h3>History could not be verified.</h3>
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              onRefresh();
              setRetry((r) => r + 1);
            }}
          >
            Refresh source checks <ActionArrow />
          </button>
        </div>
      ) : !frame ? (
        <div className={styles.empty} role="status">
          Reconstructing the saved evidence history…
        </div>
      ) : (
        <>
          {!live && (
            <div className={styles.historicalNotice}>
              Viewing evidence as it stood at this event. The live investigation
              is unchanged.
              <button type="button" onClick={() => goTo(frames.length - 1)}>
                Return to latest <ActionArrow />
              </button>
            </div>
          )}
          {frame.space.groups.length > 0 && (
            <div className={styles.unknownTabs} aria-label="Unknown to explore">
              {frame.space.groups.map((g) => (
                <button
                  key={g.plan.id}
                  type="button"
                  aria-pressed={g.plan.id === group?.plan.id}
                  onClick={() => {
                    setPlanId(g.plan.id);
                    setBranchId(null);
                    setRecordId(null);
                  }}
                >
                  {g.plan.label}
                  <small>{g.branches.length} explanations</small>
                </button>
              ))}
            </div>
          )}
          {group && branch ? (
            <>
              <div className={styles.canvas} ref={canvas}>
                <svg className={styles.connections} aria-hidden="true">
                  {edges.map((edge) => (
                    <g key={`${frame.id}:${branch.id}:${edge.id}:${edge.path}`}>
                      <path
                        d={edge.path}
                        data-state={edge.state}
                        data-selected={edge.selected}
                      />
                      {edge.selected && (
                        <circle r="2.5" className={styles.threadLight}>
                          <animateMotion
                            path={edge.path}
                            dur="4s"
                            keyPoints={
                              edge.id === "record-connection"
                                ? "0;0;1"
                                : "0;1;1"
                            }
                            keyTimes="0;0.5;1"
                            calcMode="linear"
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="opacity"
                            values={
                              edge.id === "record-connection"
                                ? "0;0;1;1;0"
                                : "1;1;0;0;1"
                            }
                            keyTimes="0;0.48;0.5;0.98;1"
                            dur="4s"
                            repeatCount="indefinite"
                          />
                        </circle>
                      )}
                    </g>
                  ))}
                </svg>
                <div className={styles.questionNode} ref={root}>
                  <RecordIcon />
                  <div>
                    <span className={styles.eyebrow}>THE UNKNOWN</span>
                    <h3>{group.plan.label}</h3>
                    <p>{status}</p>
                  </div>
                  <span className={styles.port} />
                </div>
                <div
                  className={styles.branchList}
                  role="tablist"
                  aria-label="Conditional explanations"
                  aria-orientation="vertical"
                >
                  {group.branches.map((b, i) => (
                    <button
                      type="button"
                      key={b.id}
                      ref={(node) => {
                        if (node) nodeRefs.current.set(b.id, node);
                        else nodeRefs.current.delete(b.id);
                      }}
                      role="tab"
                      id={`rewind-branch-${i}`}
                      aria-controls="rewind-trail"
                      tabIndex={b.id === branch.id ? 0 : -1}
                      aria-selected={b.id === branch.id}
                      data-state={b.state}
                      className={styles.branchNode}
                      onClick={() => chooseBranch(b.id)}
                      onKeyDown={(event) => branchKey(event, i)}
                    >
                      <span className={styles.port} />
                      <RecordIcon />
                      <span>
                        <strong>{b.title}</strong>
                        <small>{labels[b.state]}</small>
                      </span>
                      {b.id === branch.id && selectedRecord && (
                        <span
                          className={`${styles.port} ${styles.exitPort}`}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  ))}
                </div>
                <aside
                  className={styles.sourcePanel}
                  ref={recordPanel}
                  onAnimationEnd={connect}
                  aria-label="Evidence for the selected explanation"
                  key={`${frame.id}:${selectedRecord?.record.id ?? "missing"}`}
                >
                  {selectedRecord && (
                    <span className={styles.port} aria-hidden="true" />
                  )}
                  <div className={styles.sourceHeading}>
                    <RecordIcon />
                    <span className={styles.eyebrow}>
                      {selectedRecord
                        ? "RETRIEVED SOURCE"
                        : "EVIDENCE TO OBTAIN"}
                    </span>
                  </div>
                  {selectedRecord ? (
                    <>
                      {group.observationState === "conflicting" && (
                        <p className={styles.dispute}>
                          Conflicting assertions remain unresolved.
                        </p>
                      )}
                      {relatedRecords.length > 1 && (
                        <label className={styles.recordPicker}>
                          Source record
                          <select
                            value={selectedRecord.record.id}
                            onChange={(event) =>
                              setRecordId(event.target.value)
                            }
                          >
                            {relatedRecords.map((entry) => (
                              <option
                                key={entry.record.id}
                                value={entry.record.id}
                              >
                                {entry.source.document.title}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <h3 title={selectedRecord.source.document.title}>
                        {selectedRecord.source.document.title.split(" · ")[0]}
                      </h3>
                      <p className={styles.evidenceResult}>
                        {labels[branch.state]}
                      </p>
                      <dl>
                        {sourceRecordFields(selectedRecord.record)
                          .slice(0, 3)
                          .map((field) => (
                            <div key={field.label}>
                              <dt>{field.label}</dt>
                              <dd>
                                {field.label === "Scope" &&
                                selectedRecord.record.kind === "observation"
                                  ? `${selectedRecord.record.paymentIds.length} case payments`
                                  : field.value}
                              </dd>
                            </div>
                          ))}
                      </dl>
                      <InvestigationReferences
                        view={frameView}
                        ids={[selectedRecord.record.id]}
                        buttonLabel="Inspect source"
                      />
                      <p className={styles.sourceCaveat}>
                        An assertion to corroborate. Record integrity does not
                        establish its truth.
                      </p>
                    </>
                  ) : (
                    <>
                      <h3>A record could separate these paths.</h3>
                      <p>
                        {branch.steps[0]?.evidence ??
                          "Obtain independently scoped source records."}
                      </p>
                      <a href="#source-inbox-title">
                        Open the source inbox <ActionArrow />
                      </a>
                      <p className={styles.sourceCaveat}>
                        No matching source assertion was available at this
                        point.
                      </p>
                    </>
                  )}
                </aside>
              </div>
              <p className={styles.connectionKey}>
                Amber follows the selected trail. The labels show whether the
                evidence matches.
              </p>
              <p className={styles.authorizationNote}>
                <span aria-hidden="true">ⓘ</span>
                {disputed
                  ? "Authorization sources disagree. The disputed question stays open."
                  : "Source consistency does not establish authorization, intent or wrongdoing."}
              </p>
            </>
          ) : (
            <div className={styles.empty}>
              <span className={styles.eyebrow}>
                A QUESTION OPENS ANOTHER LAYER
              </span>
              <h3>No conditional explanations at this point.</h3>
              <p>
                {live
                  ? "Describe a missing piece of information. Generate real investigation trails, then follow how source records change them."
                  : "This is an earlier snapshot, before any unknown had proposed explanations."}
              </p>
              {live ? (
                <button type="button" onClick={onAddUnknown}>
                  Name the missing information <ActionArrow />
                </button>
              ) : (
                <button type="button" onClick={() => goTo(frames.length - 1)}>
                  Return to latest <ActionArrow />
                </button>
              )}
            </div>
          )}
          <div className={styles.timeline}>
            <div className={styles.timelineHeading}>
              <span>
                <span aria-hidden="true">≪</span> Evidence history
              </span>
              <div>
                <button
                  type="button"
                  aria-label="Previous evidence event"
                  disabled={index <= 0}
                  onClick={() => goTo(index - 1)}
                >
                  ←
                </button>
                <span>
                  {index + 1} / {frames.length}
                </span>
                <button
                  type="button"
                  aria-label="Next evidence event"
                  disabled={live}
                  onClick={() => goTo(index + 1)}
                >
                  →
                </button>
              </div>
            </div>
            <label className={styles.srOnly} htmlFor="evidence-timeline">
              Select an evidence event
            </label>
            <input
              id="evidence-timeline"
              className={styles.slider}
              type="range"
              min={0}
              max={Math.max(0, frames.length - 1)}
              step={1}
              value={index}
              disabled={frames.length < 2}
              onChange={(event) => goTo(Number(event.target.value))}
              aria-valuetext={`Event ${index + 1} of ${frames.length}: ${frame.label}. ${frame.detail}`}
              style={
                {
                  "--progress": `${frames.length > 1 ? (index / (frames.length - 1)) * 100 : 100}%`,
                } as CSSProperties
              }
            />
            <div className={styles.timelineTicks}>
              {ticks.map((position) => (
                <button
                  type="button"
                  key={frames[position].id}
                  data-selected={position === index}
                  onClick={() => goTo(position)}
                >
                  {frames[position].label}
                  <span>
                    {new Date(frames[position].at).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Kolkata",
                    })}{" "}
                    IST
                  </span>
                </button>
              ))}
            </div>
            <div className={styles.eventDetail} aria-live="polite">
              <strong>{frame.label}</strong>
              <p>{frame.detail}</p>
            </div>
          </div>
          {group && (
            <div className={styles.changeSummary}>
              <div>
                <span className={styles.eyebrow}>
                  QUESTION ADDED → SELECTED SNAPSHOT
                </span>
                <div
                  className={styles.changeCount}
                  key={`${group.plan.id}:${frame.id}`}
                >
                  <strong>
                    {before}
                    <span aria-hidden="true">→</span>
                    {after}
                  </strong>
                  <div>
                    <p>source-compatible explanations</p>
                    <small>
                      Within this proposed set.{" "}
                      {
                        group.branches.filter((b) => b.state === "conflicting")
                          .length
                      }{" "}
                      conflicting ·{" "}
                      {
                        group.branches.filter((b) => b.state === "contradicted")
                          .length
                      }{" "}
                      contradicted
                    </small>
                  </div>
                </div>
              </div>
              <p className={styles.summaryCaveat}>
                No likelihoods assigned.
                <br />
                Other explanations may remain.
              </p>
            </div>
          )}
          {branch && (
            <details
              className={styles.trailDetails}
              open={trailOpen}
              onToggle={(event) => setTrailOpen(event.currentTarget.open)}
              key={`${group!.plan.id}:${branch.id}`}
            >
              <summary>
                Follow this trail <span>{branch.title}</span>
              </summary>
              <div
                id="rewind-trail"
                role="tabpanel"
                aria-labelledby={`rewind-branch-${group!.branches.findIndex((b) => b.id === branch.id)}`}
              >
                <p className={styles.assumption}>
                  <strong>Assume for this trail only</strong>
                  {group!.plan.label}:{" "}
                  {branch.value === "__other__"
                    ? "another or mixed explanation applies"
                    : readableValue(branch.value)}
                  .
                </p>
                <p className={styles.checkResult} data-state={branch.state}>
                  {branch.checks[0].detail}
                </p>
                <ol>
                  {branch.steps.map((step, i) => (
                    <li key={i}>
                      <span>0{i + 1}</span>
                      <div>
                        <p>{step.action}</p>
                        <small>Evidence to obtain: {step.evidence}</small>
                      </div>
                    </li>
                  ))}
                </ol>
                <p className={styles.sourceCaveat}>
                  These are proposed investigation steps. They have not been
                  performed by generating this trail.
                </p>
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}

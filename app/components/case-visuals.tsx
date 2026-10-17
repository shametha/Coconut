"use client";

import { ActionArrow } from "./action-arrow";
import { useId, useState } from "react";
import type { CSSProperties } from "react";
import type { CaseData, Evidence, RiskEvent } from "@/lib/case";
import styles from "./case-workspace.module.css";

const kindName: Record<Evidence["kind"], string> = {
  transaction: "Movement",
  behaviour: "Behavior",
  device: "Device",
  network: "Network",
  policy: "Policy",
};

export function EvidenceOrbit({
  evidence,
  onOpen,
}: {
  evidence: Evidence[];
  onOpen: (item: Evidence) => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  const points = evidence.map((item, index) => {
    const angle = ((-90 + (index * 360) / evidence.length) * Math.PI) / 180;
    return { item, x: 50 + Math.cos(angle) * 35, y: 50 + Math.sin(angle) * 35 };
  });
  return (
    <div className={styles.orbitWrap}>
      <div
        className={styles.orbit}
        aria-label="Explore the evidence sources"
        onMouseLeave={() => setActive(null)}
      >
        <svg viewBox="0 0 400 400" fill="none" aria-hidden="true">
          <circle
            cx="200"
            cy="200"
            r="140"
            stroke="currentColor"
            opacity=".15"
          />
          <circle
            cx="200"
            cy="200"
            r="95"
            stroke="currentColor"
            opacity=".06"
            strokeDasharray="2 6"
          />
          {points.map(({ item, x, y }) => (
            <path
              key={item.id}
              d={`M200 200 Q${x * 4} 200 ${x * 4} ${y * 4}`}
              stroke="currentColor"
              opacity={active === item.id ? 0.8 : active ? 0.06 : 0.22}
              className={styles.orbitPath}
            />
          ))}
        </svg>
        <div className={styles.orbitCenter}>
          <small>EVIDENCE CORE</small>
          <strong>{String(evidence.length).padStart(2, "0")}</strong>
          <span>source{evidence.length === 1 ? "" : "s"}</span>
        </div>
        {points.map(({ item, x, y }) => (
          <button
            key={item.id}
            type="button"
            className={styles.orbitNode}
            style={{ left: `${x}%`, top: `${y}%` }}
            data-dim={active !== null && active !== item.id}
            onMouseEnter={() => setActive(item.id)}
            onFocus={() => setActive(item.id)}
            onBlur={() => setActive(null)}
            onClick={() => onOpen(item)}
            aria-label={`Inspect ${kindName[item.kind]} source ${item.id}`}
          >
            <span>{item.id}</span>
            <small>{kindName[item.kind]}</small>
          </button>
        ))}
      </div>
      <p className={styles.orbitCaption}>
        Choose a point. Go to its source.{" "}
        <span aria-hidden="true">
          <ActionArrow />
        </span>
      </p>
    </div>
  );
}

export function RiskTimeline({ events }: { events: RiskEvent[] }) {
  const [selected, setSelected] = useState(Math.max(0, events.length - 1));
  const id = useId();
  if (!events.length)
    return (
      <p className={styles.muted}>
        No recorded timeline is available for this case.
      </p>
    );
  const step = Math.min(selected, events.length - 1);
  const event = events[step];
  const points = events.map((item, i) => ({
    x: 50 + (i * 900) / Math.max(events.length - 1, 1),
    y: 205 - Math.max(0, Math.min(100, item.score)) * 1.8,
  }));
  const path = points
    .map((point, i) => `${i ? "L" : "M"}${point.x} ${point.y}`)
    .join(" ");
  return (
    <div className={styles.riskReplay}>
      <div className={styles.replayHeader}>
        <div>
          <span className={styles.kicker}>THE SIGNAL, OVER TIME</span>
          <h3>Every moment adds context.</h3>
        </div>
        <span className={styles.chartKey}>
          <i /> Recorded risk score
        </span>
      </div>
      <div className={styles.chart}>
        <svg viewBox="0 0 1000 240" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#d8ad70" stopOpacity=".15" />
              <stop offset="1" stopColor="#d8ad70" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 50, 100].map((value) => (
            <g key={value}>
              <path
                d={`M50 ${205 - value * 1.8}H950`}
                stroke="#b9ae8c"
                strokeOpacity=".12"
                strokeDasharray="2 7"
              />
              <text x="0" y={209 - value * 1.8} fill="#8e9080" fontSize="12">
                {value}
              </text>
            </g>
          ))}
          <path
            d={`${path} L${points.at(-1)!.x} 220 L50 220 Z`}
            fill={`url(#${id})`}
          />
          <path
            d={path}
            stroke="#d8ad70"
            strokeWidth="2"
            className={styles.drawLine}
          />
          <path
            d={`M${points[step].x} 15V220`}
            stroke="#d8ad70"
            strokeOpacity=".32"
            strokeDasharray="3 5"
          />
          {points.map((point, i) => (
            <g
              key={i}
              onClick={() => setSelected(i)}
              className={styles.chartPoint}
            >
              <circle cx={point.x} cy={point.y} r="19" fill="transparent" />
              <circle
                cx={point.x}
                cy={point.y}
                r={i === step ? 14 : 4}
                fill={i === step ? "#d8ad7020" : "#0b0c0a"}
                stroke={i === step ? "#d8ad7040" : "#b69762"}
              />
              <circle
                cx={point.x}
                cy={point.y}
                r={i === step ? 5 : 2}
                fill="#e7c68e"
              />
            </g>
          ))}
        </svg>
      </div>
      <div
        className={styles.timeline}
        style={{ "--moments": events.length } as CSSProperties}
        role="group"
        aria-label="Risk replay moments"
      >
        {events.map((point, index) => (
          <button
            key={`${point.time}-${index}`}
            type="button"
            onClick={() => setSelected(index)}
            aria-pressed={step === index}
          >
            <span>{point.time}</span>
            <small>{point.label}</small>
          </button>
        ))}
      </div>
      <div className={styles.replayState} aria-live="polite">
        <div>
          <span className={styles.kicker}>{event.time} IST</span>
          <h3>{event.label}</h3>
          <p className={styles.muted}>{event.detail}</p>
        </div>
        <div className={styles.replayScore}>
          <strong>{event.score}</strong>
          <span>/ 100</span>
        </div>
      </div>
    </div>
  );
}

export function RelationshipMap({
  caseFile,
  onOpen,
}: {
  caseFile: CaseData;
  onOpen: (item: Evidence) => void;
}) {
  const [selected, setSelected] = useState("beneficiary");
  const network = caseFile.evidence.find((item) => item.kind === "network");
  const nodes = [
    {
      key: "account",
      label: "CURRENT ACCOUNT",
      name: caseFile.account,
      detail: caseFile.customer,
      description: "The account whose outbound activity raised this signal.",
    },
    {
      key: "beneficiary",
      label: "SHARED BENEFICIARY",
      name: caseFile.primaryBeneficiary,
      detail: "Destination of the transfers",
      description: network?.summary ?? "Relationship source unavailable.",
    },
    ...caseFile.flaggedEntities.map((name) => ({
      key: name,
      label: "PREVIOUS INVESTIGATION",
      name,
      detail: "Connected through this beneficiary",
      description: `${name} appears in the relationship records for ${caseFile.primaryBeneficiary}. A previous investigation does not establish wrongdoing.`,
    })),
  ];
  const active = nodes.find((node) => node.key === selected) ?? nodes[1];
  return (
    <div className={styles.relationshipPanel}>
      <div className={styles.mapTop}>
        <span className={styles.kicker}>RELATIONSHIP MAP</span>
        <span>Select an account to look closer</span>
      </div>
      <div
        className={styles.relationshipMap}
        style={
          {
            "--connections": Math.max(1, caseFile.flaggedEntities.length),
          } as CSSProperties
        }
      >
        <svg
          viewBox="0 0 1000 400"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M170 200C330 200 300 200 500 200"
            stroke="#d8ad70"
            strokeOpacity=".6"
          />
          {caseFile.flaggedEntities.map((_, i) => (
            <path
              key={i}
              d={`M500 200 C690 200 670 ${((i + 0.5) * 400) / caseFile.flaggedEntities.length} 840 ${((i + 0.5) * 400) / caseFile.flaggedEntities.length}`}
              stroke="#d8ad70"
              strokeOpacity={
                selected === "beneficiary" ||
                selected === "account" ||
                selected === caseFile.flaggedEntities[i]
                  ? 0.6
                  : 0.15
              }
            />
          ))}
        </svg>
        {nodes.slice(0, 2).map((node) => (
          <button
            key={node.key}
            type="button"
            className={`${styles.mapNode} ${node.key === "beneficiary" ? styles.mapHub : ""}`}
            aria-pressed={selected === node.key}
            onClick={() => setSelected(node.key)}
          >
            <span>{node.label}</span>
            <i aria-hidden="true">{node.key === "beneficiary" ? "◎" : "○"}</i>
            <strong>{node.name}</strong>
            <small>{node.detail}</small>
          </button>
        ))}
        <div className={styles.mapConnections}>
          {nodes.slice(2).map((node) => (
            <button
              key={node.key}
              type="button"
              className={styles.mapNode}
              aria-pressed={selected === node.key}
              onClick={() => setSelected(node.key)}
            >
              <span>{node.label}</span>
              <i aria-hidden="true">○</i>
              <strong>{node.name}</strong>
            </button>
          ))}
          {nodes.length === 2 && (
            <p className={styles.finePrint}>No prior account links recorded.</p>
          )}
        </div>
      </div>
      <div className={styles.mapDetail} aria-live="polite">
        <div>
          <span className={styles.kicker}>{active.label}</span>
          <h3>{active.name}</h3>
          <p>{active.description}</p>
        </div>
        {network && (
          <button
            className={styles.sourceButton}
            type="button"
            onClick={() => onOpen(network)}
          >
            Inspect relationship records <ActionArrow />
          </button>
        )}
      </div>
    </div>
  );
}

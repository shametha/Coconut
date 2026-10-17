export type EvidenceKind =
  "transaction" | "behaviour" | "device" | "network" | "policy";

export function isValidCaseId(id: string) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$/.test(id);
}
export type Evidence = {
  id: string;
  kind: EvidenceKind;
  title: string;
  summary: string;
  source: string;
  sourceRecord: string;
  traceId: string;
  observedAt: string;
  verified: boolean;
  score: number;
};

export type RiskEvent = {
  time: string;
  label: string;
  detail: string;
  score: number;
  networkPoints: number;
};

export type Transfer = {
  id: string;
  amount: number;
  to: string;
  time: string;
};

export type CaseSummary = Pick<
  CaseData,
  | "id"
  | "title"
  | "customer"
  | "account"
  | "amount"
  | "currency"
  | "openedAt"
  | "score"
  | "summary"
>;

export type CaseData = {
  id: string;
  coreId: string;
  customer: string;
  account: string;
  amount: number;
  currency: string;
  /** Canonical narrative facts shared by every surface. */
  transferCount: number;
  windowMinutes: number;
  typicalWindowAmount: number;
  primaryBeneficiary: string;
  /** Seconds between first-seen device and first high-value transfer. */
  deviceLeadSeconds: number;
  /** Baseline transaction-velocity multiplier behind the behaviour score. */
  velocityMultiplier: number;
  /** Previously investigated entities sharing the primary beneficiary. */
  flaggedEntities: string[];
  transfers: Transfer[];
  policy: {
    section: string;
    title: string;
    passage: string;
    sourceRecord: string;
  };
  openedAt: string;
  title: string;
  score: number;
  model: string;
  summary: string;
  evidence: Evidence[];
  timeline: RiskEvent[];
  mitigating: { id: string; title: string; detail: string; source: string }[];
  challengedScore: number;
  analysis?: {
    engine: "firestore-records";
    traceId: string;
    elapsedSeconds: number | null;
    baselineWindowMatches: boolean;
    baselineIsConfigured: true;
  };
};

export type ChallengeData = {
  caseId: string;
  originalScore: number;
  challengedScore: number;
  source: "demo" | "firestore";
  mitigating: {
    id: string;
    title: string;
    detail: string;
    source: string;
    verified: boolean;
    adjustment: number;
    traceId?: string;
    observedAt?: string;
  }[];
};

export const caseFile: CaseData = {
  id: "PF-0042",
  coreId: "CORE-0042",
  customer: "Aster Trading Co.",
  account: "AC-1048",
  amount: 487000,
  currency: "INR",
  transferCount: 5,
  windowMinutes: 11,
  typicalWindowAmount: 14200,
  primaryBeneficiary: "B-220",
  deviceLeadSeconds: 17,
  velocityMultiplier: 12.4,
  flaggedEntities: ["AC-0217", "AC-0371"],
  transfers: [
    { id: "TX-9011", amount: 95000, to: "B-220", time: "20:01" },
    { id: "TX-9012", amount: 92000, to: "B-220", time: "20:04" },
    { id: "TX-9013", amount: 103000, to: "B-220", time: "20:06" },
    { id: "TX-9014", amount: 97000, to: "B-220", time: "20:09" },
    { id: "TX-9015", amount: 100000, to: "B-220", time: "20:12" },
  ],
  policy: {
    section: "7.3",
    title: "Rapid connected outbound activity",
    passage:
      "Review rapid outbound transfers when unusual account velocity and beneficiary links to previous investigations occur together. An alert requires human validation and does not establish wrongdoing.",
    sourceRecord: "POL-AML-7.3",
  },
  openedAt: "24 Sep 2026 · 20:12 IST",
  title: "Coordinated outbound movement",
  score: 91,
  model: "COCONUT_RULES_V1",
  summary:
    "Five transfers in 11 minutes, originating from a new device and converging on a beneficiary linked to prior investigations.",
  evidence: [
    {
      id: "C1",
      kind: "transaction",
      title: "Five outbound transfers",
      summary: "₹487,000 moved in 11 minutes across five transactions.",
      source: "firestore/transactions",
      sourceRecord: "TX-9011…TX-9015",
      traceId: "Q-TX-0042",
      observedAt: "2026-09-24T20:12:00+05:30",
      verified: true,
      score: 27,
    },
    {
      id: "C2",
      kind: "behaviour",
      title: "Velocity above baseline",
      summary: "12.4× this account’s 30-day transfer velocity.",
      source: "firestore/features",
      sourceRecord: "RF-0042",
      traceId: "Q-FEATURE-0042",
      observedAt: "2026-09-24T20:12:00+05:30",
      verified: true,
      score: 21,
    },
    {
      id: "C3",
      kind: "device",
      title: "First-seen device",
      summary:
        "The initiating device first appeared 17 seconds before the first transfer.",
      source: "firestore/devices",
      sourceRecord: "DEV-0188",
      traceId: "Q-DEVICE-0042",
      observedAt: "2026-09-24T20:00:43+05:30",
      verified: true,
      score: 17,
    },
    {
      id: "C4",
      kind: "network",
      title: "Shared beneficiary",
      summary:
        "Beneficiary B-220 connects to two previously investigated accounts.",
      source: "firestore/links",
      sourceRecord: "LINK-220-A, LINK-220-B",
      traceId: "Q-NETWORK-0042",
      observedAt: "2026-09-24T20:09:00+05:30",
      verified: true,
      score: 14,
    },
    {
      id: "C5",
      kind: "policy",
      title: "Policy trigger",
      summary:
        "Policy §7.3 calls for review of rapid, connected outbound activity.",
      source: "firestore/policies",
      sourceRecord: "POL-AML-7.3",
      traceId: "Q-POLICY-0042",
      observedAt: "2026-09-24T20:12:00+05:30",
      verified: true,
      score: 12,
    },
  ],
  timeline: [
    {
      time: "19:59",
      label: "Baseline",
      detail: "Activity consistent with prior account history.",
      score: 12,
      networkPoints: 0,
    },
    {
      time: "20:00",
      label: "New device",
      detail: "An unseen device authenticates to the account.",
      score: 26,
      networkPoints: 0,
    },
    {
      time: "20:01",
      label: "First transfer",
      detail: "First outbound payment to beneficiary B-220.",
      score: 37,
      networkPoints: 0,
    },
    {
      time: "20:05",
      label: "Velocity spike",
      detail: "Transfer rate rises above the 30-day baseline.",
      score: 61,
      networkPoints: 0,
    },
    {
      time: "20:09",
      label: "Network link",
      detail: "B-220 is connected to two prior investigations.",
      score: 79,
      networkPoints: 14,
    },
    {
      time: "20:12",
      label: "Fifth transfer",
      detail: "Total outbound value reaches ₹487,000.",
      score: 91,
      networkPoints: 14,
    },
  ],
  mitigating: [
    {
      id: "M1",
      title: "Beneficiary relationship predates alert",
      detail: "B-220 was added 19 days earlier.",
      source: "firestore/beneficiaries · BEN-220",
    },
    {
      id: "M2",
      title: "Location is familiar",
      detail: "The session location matches the customer’s recent geography.",
      source: "firestore/devices · DEV-0188 / DEV-HIST-001",
    },
    {
      id: "M3",
      title: "Prior large payment",
      detail: "One comparable transfer occurred eight months earlier.",
      source: "firestore/transactions · TX-4812",
    },
  ],
  challengedScore: 78,
};

export function coreIntegrity(evidence: readonly Evidence[]) {
  const checked = evidence.filter(
    (item) =>
      item.verified &&
      item.source &&
      item.sourceRecord &&
      item.traceId &&
      item.observedAt,
  );
  return {
    checked: checked.length,
    total: evidence.length,
    verified: checked.length === evidence.length && evidence.length > 0,
  };
}

export function counterfactualScore(event: RiskEvent, removeNetwork: boolean) {
  return removeNetwork
    ? Math.max(0, event.score - event.networkPoints)
    : event.score;
}

export const findingClaims = [
  {
    text: "Five outbound transfers totaling ₹487,000 occurred within 11 minutes.",
    citations: ["C1"],
  },
  {
    text: "The transfer velocity was 12.4× the account’s 30-day baseline.",
    citations: ["C2"],
  },
  {
    text: "A first-seen device initiated the sequence, and the beneficiary links to two prior investigations.",
    citations: ["C3", "C4"],
  },
  {
    text: "The sequence meets the review conditions in policy §7.3.",
    citations: ["C5"],
  },
] as const;

export type FindingClaim = { text: string; citations: readonly string[] };

export function findingClaimsForCase(record: CaseData): FindingClaim[] {
  const byKind = (kind: EvidenceKind) =>
    record.evidence.find((item) => item.kind === kind);
  const claims: FindingClaim[] = [];
  const transaction = byKind("transaction");
  if (transaction && record.transferCount > 0) {
    const amount = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: record.currency,
      maximumFractionDigits: 0,
    }).format(record.amount);
    claims.push({
      text: `${record.transferCount} outbound transfers totaling ${amount} occurred within ${record.windowMinutes} minutes.`,
      citations: [transaction.id],
    });
  }
  const behaviour = byKind("behaviour");
  if (behaviour && record.velocityMultiplier > 0)
    claims.push({
      text: `Transfer velocity reached ${record.velocityMultiplier}× the configured 11-minute baseline.`,
      citations: [behaviour.id],
    });
  const device = byKind("device");
  if (device && record.deviceLeadSeconds >= 0)
    claims.push({
      text: `The recorded device first appeared ${record.deviceLeadSeconds} seconds before the first transfer.`,
      citations: [device.id],
    });
  const network = byKind("network");
  if (network && record.flaggedEntities.length > 0)
    claims.push({
      text: `Beneficiary ${record.primaryBeneficiary} links to ${record.flaggedEntities.length} previously investigated account${record.flaggedEntities.length === 1 ? "" : "s"}.`,
      citations: [network.id],
    });
  const policy = byKind("policy");
  if (policy && record.policy.section)
    claims.push({
      text: `Policy §${record.policy.section} calls for review of this activity.`,
      citations: [policy.id],
    });
  return claims;
}

export function findingIsGrounded(
  evidence: readonly Evidence[],
  claims: readonly FindingClaim[] = findingClaims,
) {
  const verifiedIds = new Set(
    evidence
      .filter((item) => item.verified && item.sourceRecord && item.traceId)
      .map((item) => item.id),
  );
  return (
    claims.length > 0 &&
    claims.every((claim) => claim.citations.every((id) => verifiedIds.has(id)))
  );
}

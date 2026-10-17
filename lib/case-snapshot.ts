import type { CaseData, ChallengeData, EvidenceKind } from "./case";

export type SourceRow = Record<string, unknown>;
export type CaseSnapshot = Record<
  | "cases"
  | "evidence"
  | "events"
  | "transactions"
  | "links"
  | "mitigations"
  | "features"
  | "devices"
  | "beneficiaries"
  | "policies",
  SourceRow[]
>;
const text = (value: unknown) => (value == null ? "" : String(value));
const numeric = (value: unknown) => Number(value ?? 0);
const ids = (value: unknown) =>
  text(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
const instant = (value: unknown) => {
  const result = Date.parse(text(value));
  if (!Number.isFinite(result)) throw new Error("Invalid source timestamp");
  return result;
};
const sameIds = (a: string[], b: string[]) =>
  a.length > 0 &&
  a.length === b.length &&
  a
    .slice()
    .sort()
    .every((v, i) => v === b.slice().sort()[i]);
const tables: Record<EvidenceKind, string> = {
  transaction: "firestore/transactions",
  behaviour: "firestore/features",
  device: "firestore/devices",
  network: "firestore/links",
  policy: "firestore/policies",
};

/** Verify one fresh database statement's source records. No results are retained. */
export function caseFromSnapshot(
  id: string,
  snapshot: CaseSnapshot,
  traceId: string,
) {
  const headers = snapshot.cases.filter((r) => r.CASE_ID === id);
  if (!headers.length) return null;
  if (headers.length !== 1) throw new Error("Duplicate case header");
  for (const [name, key] of Object.entries({
    transactions: "TRANSACTION_ID",
    links: "LINK_ID",
    features: "FEATURE_ID",
    devices: "DEVICE_EVENT_ID",
    beneficiaries: "BENEFICIARY_RECORD_ID",
    policies: "POLICY_ID",
    evidence: "EVIDENCE_ID",
    mitigations: "MITIGATION_ID",
    events: "STEP",
  })) {
    const rows = snapshot[name as keyof CaseSnapshot];
    if (new Set(rows.map((r) => text(r[key]))).size !== rows.length)
      throw new Error(`Duplicate ${name} source records`);
  }
  const header = headers[0];
  const account = text(header.ACCOUNT_ID);
  const txns = snapshot.transactions
    .filter((r) => r.CASE_ID === id)
    .sort(
      (a, b) =>
        instant(a.OCCURRED_AT) - instant(b.OCCURRED_AT) ||
        text(a.TRANSACTION_ID).localeCompare(text(b.TRANSACTION_ID)),
    );
  if (!txns.length || txns.some((r) => r.ACCOUNT_ID !== account))
    throw new Error("Invalid case transfer scope");
  const totalCents = txns.reduce(
    (sum, r) => sum + Math.round(numeric(r.AMOUNT) * 100),
    0,
  );
  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents !== Math.round(numeric(header.AMOUNT) * 100)
  )
    throw new Error("Case totals do not match source transfers");
  const first = instant(txns[0].OCCURRED_AT);
  const last = instant(txns.at(-1)!.OCCURRED_AT);
  const elapsedSeconds = Math.trunc((last - first) / 1000);
  const counts = new Map<string, number>();
  txns.forEach((r) =>
    counts.set(
      text(r.BENEFICIARY_ID),
      (counts.get(text(r.BENEFICIARY_ID)) ?? 0) + 1,
    ),
  );
  const beneficiary = [...counts].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0][0];
  const links = snapshot.links.filter(
    (r) => r.CASE_ID === id && r.BENEFICIARY_ID === beneficiary,
  );
  const features = snapshot.features
    .filter((r) => r.CASE_ID === id)
    .sort(
      (a, b) =>
        instant(b.WINDOW_END) - instant(a.WINDOW_END) ||
        text(a.FEATURE_ID).localeCompare(text(b.FEATURE_ID)),
    );
  const feature = features[0];
  const baselineMatches =
    !!feature &&
    instant(feature.WINDOW_START) === first &&
    instant(feature.WINDOW_END) === last &&
    elapsedSeconds === 660;
  const baseline = numeric(feature?.BASELINE_TRANSFERS_PER_11_MIN);
  const policyRef = snapshot.evidence.find((r) => r.KIND === "policy");
  const policyIds = ids(policyRef?.SOURCE_RECORD);
  const policy = snapshot.policies.find(
    (r) => r.POLICY_ID === policyIds[0] && instant(r.EFFECTIVE_AT) <= last,
  );
  const devices = snapshot.devices.filter(
    (r) => r.CASE_ID === id && r.ACCOUNT_ID === account,
  );
  const evidence = snapshot.evidence.map((item) => {
    const kind = text(item.KIND) as EvidenceKind;
    if (!Object.hasOwn(tables, kind))
      throw new Error("Unsupported evidence kind");
    const refs = ids(item.SOURCE_RECORD);
    let verified = item.SOURCE_TABLE === tables[kind];
    if (kind === "transaction")
      verified &&= sameIds(
        refs,
        txns.map((r) => text(r.TRANSACTION_ID)),
      );
    if (kind === "behaviour")
      verified &&=
        refs.length === 1 &&
        !!feature &&
        refs[0] === feature.FEATURE_ID &&
        feature.MODEL_VERSION === header.MODEL_VERSION &&
        numeric(feature.TRANSFERS_IN_WINDOW) === txns.length &&
        numeric(feature.VELOCITY_MULTIPLE) > 0;
    if (kind === "device")
      verified &&=
        refs.length === 1 &&
        devices.some(
          (r) =>
            r.DEVICE_EVENT_ID === refs[0] && instant(r.FIRST_SEEN_AT) <= first,
        );
    if (kind === "network")
      verified &&=
        sameIds(
          refs,
          links.map((r) => text(r.LINK_ID)),
        ) && links.every((r) => !!r.PRIOR_CASE_ID);
    if (kind === "policy") verified &&= refs.length === 1 && !!policy;
    return {
      id: text(item.EVIDENCE_ID),
      kind,
      title: text(item.TITLE),
      summary: text(item.SUMMARY),
      source: text(item.SOURCE_TABLE),
      sourceRecord: text(item.SOURCE_RECORD),
      observedAt: text(item.OBSERVED_AT),
      score: numeric(item.SCORE_POINTS),
      verified,
      traceId,
    };
  });
  const mitigating = snapshot.mitigations.map((item) => {
    const [table, references = ""] = text(item.SOURCE_REF).split(" · ");
    const refs = references.split(" / ").filter(Boolean);
    let observed: SourceRow | undefined;
    let detail = text(item.DETAIL);
    if (
      item.CHECK_KIND === "beneficiary_history" &&
      table === "firestore/beneficiaries" &&
      refs.length === 1
    ) {
      observed = snapshot.beneficiaries.find(
        (r) =>
          r.BENEFICIARY_RECORD_ID === refs[0] &&
          r.ACCOUNT_ID === account &&
          r.BENEFICIARY_ID === beneficiary &&
          instant(r.ADDED_AT) < first,
      );
      detail = `The relationship with beneficiary ${beneficiary} was recorded before the first case transfer.`;
    } else if (
      item.CHECK_KIND === "familiar_location" &&
      table === "firestore/devices" &&
      refs.length === 2
    ) {
      const current = devices.find(
        (r) =>
          r.DEVICE_EVENT_ID === refs[0] && instant(r.FIRST_SEEN_AT) <= first,
      );
      if (
        current &&
        snapshot.devices.some(
          (r) =>
            r.DEVICE_EVENT_ID === refs[1] &&
            r.ACCOUNT_ID === account &&
            r.LOCATION === current.LOCATION &&
            instant(r.FIRST_SEEN_AT) < instant(current.FIRST_SEEN_AT),
        )
      )
        observed = current;
      detail =
        "The recorded session location matches an earlier device event on this account.";
    } else if (
      item.CHECK_KIND === "prior_large_payment" &&
      table === "firestore/transactions" &&
      refs.length === 1
    ) {
      observed = snapshot.transactions.find(
        (r) =>
          r.TRANSACTION_ID === refs[0] &&
          r.ACCOUNT_ID === account &&
          r.CASE_ID !== id &&
          numeric(r.AMOUNT) >= numeric(header.AMOUNT) / 2 &&
          instant(r.OCCURRED_AT) < first,
      );
      detail =
        "A prior large transfer on this account predates the current activity window.";
    }
    return {
      id: text(item.MITIGATION_ID),
      title: text(item.TITLE),
      detail: observed ? detail : text(item.DETAIL),
      source: text(item.SOURCE_REF),
      verified: !!observed,
      traceId,
      observedAt: text(
        observed?.ADDED_AT ?? observed?.FIRST_SEEN_AT ?? observed?.OCCURRED_AT,
      ),
      adjustment: Math.min(100, Math.max(0, numeric(item.ADJUSTMENT_POINTS))),
    };
  });
  const deviceRef = ids(
    snapshot.evidence.find((r) => r.KIND === "device")?.SOURCE_RECORD,
  )[0];
  const device = devices.find((r) => r.DEVICE_EVENT_ID === deviceRef);
  const score = numeric(header.RISK_SCORE);
  const challengedScore = Math.max(
    0,
    score -
      mitigating.reduce((sum, r) => sum + (r.verified ? r.adjustment : 0), 0),
  );
  const record: CaseData = {
    id,
    coreId: text(header.CORE_ID),
    customer: text(header.CUSTOMER_NAME),
    account,
    amount: numeric(header.AMOUNT),
    currency: text(header.CURRENCY),
    transferCount: txns.length,
    windowMinutes: Math.round((elapsedSeconds / 60) * 100) / 100,
    typicalWindowAmount: numeric(feature?.BASELINE_WINDOW_AMOUNT),
    primaryBeneficiary: beneficiary,
    deviceLeadSeconds: device
      ? Math.trunc((first - instant(device.FIRST_SEEN_AT)) / 1000)
      : -1,
    velocityMultiplier:
      baselineMatches && baseline > 0
        ? Math.round((txns.length / baseline) * 10) / 10
        : 0,
    flaggedEntities: [...new Set(links.map((r) => text(r.ACCOUNT_ID)))],
    transfers: txns.map((r) => ({
      id: text(r.TRANSACTION_ID),
      amount: numeric(r.AMOUNT),
      to: text(r.BENEFICIARY_ID),
      time: text(r.TIME_LABEL),
    })),
    policy: {
      section: text(policy?.SECTION),
      title: text(policy?.TITLE),
      passage: text(policy?.CONTENT),
      sourceRecord: text(policy?.POLICY_ID),
    },
    openedAt: text(header.OPENED_AT),
    title: text(header.TITLE),
    score,
    model: text(header.MODEL_VERSION),
    summary: text(header.SUMMARY),
    evidence,
    timeline: snapshot.events.map((r) => ({
      time: text(r.TIME_LABEL),
      label: text(r.LABEL),
      detail: text(r.DETAIL).replaceAll(
        "30-day baseline",
        "configured baseline",
      ),
      score: numeric(r.RISK_SCORE),
      networkPoints: numeric(r.NETWORK_POINTS),
    })),
    mitigating: mitigating.map(({ id, title, detail, source }) => ({
      id,
      title,
      detail,
      source,
    })),
    challengedScore,
    analysis: {
      engine: "firestore-records",
      traceId,
      elapsedSeconds,
      baselineWindowMatches: baselineMatches,
      baselineIsConfigured: true,
    },
  };
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: record.currency,
    maximumFractionDigits: 2,
  }).format(record.amount);
  const summaries: Record<EvidenceKind, string> = {
    transaction: `${record.transferCount} outbound transfers totaling ${amount} occurred over ${record.windowMinutes} minutes.`,
    behaviour:
      record.velocityMultiplier > 0
        ? `Transfer velocity is ${record.velocityMultiplier}× the configured 11-minute baseline. The baseline is a model input, not independently inferred account history.`
        : "The observed window cannot be compared with the configured 11-minute baseline.",
    device:
      record.deviceLeadSeconds >= 0
        ? `The cited device first appeared ${record.deviceLeadSeconds} seconds before the first transfer. Timing alone does not identify its operator.`
        : "Device timing is unavailable.",
    network: `Beneficiary ${beneficiary} connects to ${record.flaggedEntities.length} previously investigated accounts. A connection does not establish wrongdoing.`,
    policy: record.policy.passage,
  };
  record.evidence = evidence.map((item) => ({
    ...item,
    summary: item.verified ? summaries[item.kind] : item.summary,
  }));
  const challenge: ChallengeData = {
    caseId: id,
    originalScore: score,
    challengedScore,
    source: "firestore",
    mitigating,
  };
  return { case: record, source: "firestore" as const, challenge };
}

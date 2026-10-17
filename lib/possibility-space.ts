import {
  digest,
  evaluateInvestigation,
  InvestigationError,
  type InvestigationCase,
  type CheckedDocument,
  type Observation,
  type BranchState,
  type InvestigationCheck,
} from "./investigation.ts";

export const SPACE_VERSION = "conditional-space-1";
export type EvidenceField = {
  field: string;
  label: string;
  domain: string[];
  sources: string[];
};
export type ProposedOption = {
  value: string;
  title: string;
  steps: { action: string; evidence: string }[];
};
export type PossibilityPlan = {
  id: string;
  question: string;
  field: string;
  label: string;
  options: ProposedOption[];
  provider: string;
  model: string;
  traceId?: string;
  usage: unknown;
  at: string;
  inputFingerprint: string;
};
export type SimulatedWorld = {
  id: string;
  assumptions: {
    planId: string;
    field: string;
    value: string;
    title: string;
  }[];
  state: "compatible" | "incompatible" | "conflicting";
  trace: {
    field: string;
    state: string;
    detail: string;
    references: string[];
  }[];
};
export type Simulation = {
  id: string;
  at: string;
  fingerprint: string;
  planIds: string[];
  worlds: SimulatedWorld[];
  compatible: number;
  incompatible: number;
  conflicting: number;
  boundary: string;
};
const clean = (v: unknown, max = 500): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
export const fieldKey = (v: string) =>
  /^[a-z][a-z0-9_]{0,39}\.[a-z][a-z0-9_]{0,59}$/.test(v);

/** Models may propose investigative actions, never executable code or source facts. */
export function validateProposal(
  raw: unknown,
  catalog: EvidenceField[],
  customField: string,
) {
  const p = raw as { field: string; label: string; options: ProposedOption[] };
  if (
    !p ||
    !fieldKey(p.field) ||
    !clean(p.label, 140) ||
    !Array.isArray(p.options) ||
    p.options.length < 2 ||
    p.options.length > 4
  )
    throw new InvestigationError(
      "The generated possibilities did not meet the investigation contract. No substitute plan was created.",
      502,
    );
  const binding = catalog.find((f) => f.field === p.field);
  if (!binding && p.field !== customField)
    throw new InvestigationError(
      "The proposed evidence field is outside the allowed scope.",
      502,
    );
  if (new Set(p.options.map((o) => o.value)).size !== p.options.length)
    throw new InvestigationError(
      "The proposed possibilities overlap by identity.",
      502,
    );
  for (const o of p.options) {
    if (
      !clean(o.value, 100) ||
      o.value === "__other__" ||
      !clean(o.title, 160) ||
      (binding && !binding.domain.includes(o.value)) ||
      !Array.isArray(o.steps) ||
      o.steps.length < 2 ||
      o.steps.length > 4 ||
      o.steps.some((s) => !clean(s.action, 500) || !clean(s.evidence, 240))
    )
      throw new InvestigationError(
        "A proposed trail has invalid values or evidence steps.",
        502,
      );
  }
  return { field: p.field, label: p.label, options: p.options };
}

export function fieldObservations(
  subject: InvestigationCase,
  documents: CheckedDocument[],
  field: string,
) {
  const records = new Map<string, Observation>();
  for (const s of documents)
    for (const r of s.document.records)
      if (r.kind === "observation" && r.field === field) records.set(r.id, r);
  const scoped = [...records.values()].filter((r) =>
    subject.payments.every((p) => r.paymentIds.includes(p.id)),
  );
  const values = [...new Set(scoped.map((r) => r.value))];
  return {
    records: [...records.values()],
    scoped,
    values,
    state:
      values.length > 1
        ? "conflicting"
        : values.length === 1
          ? "recorded"
          : "missing",
  };
}
function optionCheck(
  subject: InvestigationCase,
  documents: CheckedDocument[],
  field: string,
  value: string,
) {
  const obs = fieldObservations(subject, documents, field);
  const refs = obs.scoped.map((r) => r.id);
  if (obs.state === "conflicting")
    return {
      state: "conflicting" as const,
      references: refs,
      detail: `Case-wide source records disagree about ${field}: ${obs.values.join(", ")}. Verify their scope and integrity; no source was silently preferred.`,
    };
  if (obs.state === "missing")
    return {
      state: "unresolved" as const,
      references: obs.records.map((r) => r.id),
      detail: obs.records.length
        ? "Only partial payment coverage is available. A case-wide assertion remains unresolved."
        : "No case-wide source record has been retrieved for this unknown. The assumption remains hypothetical.",
    };
  const matches = value === "__other__" ? false : obs.values[0] === value;
  return {
    state: matches ? ("passed" as const) : ("failed" as const),
    references: refs,
    detail: `${matches ? "Matches" : "Does not match"} the retrieved case-wide assertion (${obs.values[0]}). This checks what the source records, not the truth of a person’s intent or a finding of fraud.`,
  };
}
export function evaluatePossibilities(
  subject: InvestigationCase,
  documents: CheckedDocument[],
  plans: PossibilityPlan[] = [],
) {
  // Reuse all existing integrity, scope, duplicate-ID and fingerprint checks.
  const authorization = evaluateInvestigation(subject, documents);
  if (
    plans.length > 3 ||
    new Set(plans.map((p) => p.id)).size !== plans.length ||
    new Set(plans.map((p) => p.field)).size !== plans.length
  )
    throw new InvestigationError(
      "Use at most three distinct unknowns in one investigation.",
      409,
    );
  const fingerprint = plans.length
    ? digest({
        evidence: authorization.fingerprint,
        version: SPACE_VERSION,
        plans,
      })
    : authorization.fingerprint;
  const groups = plans.map((plan) => {
    // Persisted output is checked again; provider provenance is never a source fact.
    validateProposal(
      plan,
      [
        {
          field: plan.field,
          label: plan.label,
          domain: plan.options.map((o) => o.value),
          sources: [],
        },
      ],
      plan.field,
    );
    const obs = fieldObservations(subject, documents, plan.field);
    const options = [
      ...plan.options,
      {
        value: "__other__",
        title: "Another or mixed explanation",
        steps: [
          {
            action:
              "Keep the investigation open to explanations outside this proposed set.",
            evidence: "Additional independently scoped source records",
          },
        ],
      },
    ];
    const branches = options.map((option) => {
      const result =
        option.value === "__other__" &&
        obs.state === "recorded" &&
        !plan.options.some((o) => o.value === obs.values[0])
          ? {
              state: "unresolved" as const,
              references: obs.scoped.map((r) => r.id),
              detail:
                "The recorded value is outside the generated options. Expand the hypotheses; do not force the record into an existing explanation.",
            }
          : optionCheck(subject, documents, plan.field, option.value);
      const state: BranchState =
        option.value === "__other__" && obs.state === "missing"
          ? "possible"
          : result.state === "passed"
            ? "supported"
            : result.state === "failed"
              ? "contradicted"
              : result.state === "conflicting"
                ? "conflicting"
                : "possible";
      const id = `${plan.id}:${option.value}`;
      return {
        id,
        value: option.value,
        title: option.title,
        assumption: `${plan.label}: ${option.value === "__other__" ? "an unmodeled or mixed explanation applies" : option.value}.`,
        state,
        checks: [
          {
            id: "observation_match",
            title: "Compare the assumption with retrieved evidence",
            ...result,
          } satisfies InvestigationCheck,
        ],
        steps: option.steps,
      };
    });
    return { plan, observationState: obs.state, branches };
  });
  const priorities = groups
    .map((g) => {
      const n = g.branches.filter((b) => b.state !== "contradicted").length;
      return {
        planId: g.plan.id,
        field: g.plan.field,
        label: g.plan.label,
        branchPairs: (n * (n - 1)) / 2,
        reason:
          g.observationState === "conflicting"
            ? "Reconcile conflicting records before relying on this field."
            : g.observationState === "missing"
              ? "A complete, discriminating record could separate these pairs of proposed explanations."
              : "Check the integrity and scope of the recorded assertion; continue investigating other unknowns.",
      };
    })
    .sort(
      (a, b) => b.branchPairs - a.branchPairs || a.field.localeCompare(b.field),
    );
  const facts = groups.flatMap((g) =>
    g.branches.map((b) => ({
      id: `possibility:${b.id}`,
      hypothesis: b.id,
      text: `Conditional explanation only: ${b.assumption} Current source-match state: ${b.state}. ${b.checks[0].detail} Proposed investigation trail: ${b.steps.map((s) => `${s.action} Obtain: ${s.evidence}.`).join(" ")}`,
      references: b.checks.flatMap((c) => c.references),
    })),
  );
  return {
    fingerprint,
    groups,
    priorities,
    facts,
    boundary:
      "Generated explanations and simulated combinations are conditional, non-exhaustive investigation plans. Source agreement is not a finding of legitimacy, intent or fraud. No likelihoods are estimated.",
  };
}
export function simulatePossibilities(
  subject: InvestigationCase,
  documents: CheckedDocument[],
  plans: PossibilityPlan[],
  planIds: string[],
) {
  const evaluated = evaluatePossibilities(subject, documents, plans);
  if (
    !planIds.length ||
    planIds.length > 3 ||
    new Set(planIds).size !== planIds.length ||
    planIds.some((id) => !plans.some((p) => p.id === id))
  )
    throw new InvestigationError(
      "Choose one to three distinct generated unknowns to simulate.",
    );
  const groups = planIds.map((id) =>
    evaluated.groups.find((g) => g.plan.id === id)!,
  );
  const count = groups.reduce((n, g) => n * g.branches.length, 1);
  if (count > 125)
    throw new InvestigationError(
      "The selected possibility space exceeds 125 combinations. Narrow the unknowns before running.",
      409,
    );
  let combinations: (typeof groups)[number]["branches"][] = [[]];
  for (const g of groups)
    combinations = combinations.flatMap((row) =>
      g.branches.map((b) => [...row, b]),
    );
  const worlds: SimulatedWorld[] = combinations.map((branches, i) => ({
    id: `world-${i + 1}`,
    assumptions: branches.map((b, j) => ({
      planId: groups[j].plan.id,
      field: groups[j].plan.field,
      value: b.value,
      title: b.title,
    })),
    state: branches.some((b) => b.state === "contradicted")
      ? "incompatible"
      : branches.some((b) => b.state === "conflicting")
        ? "conflicting"
        : "compatible",
    trace: branches.map((b, j) => ({
      field: groups[j].plan.field,
      state: b.checks[0].state,
      detail: b.checks[0].detail,
      references: b.checks[0].references,
    })),
  }));
  return {
    fingerprint: evaluated.fingerprint,
    planIds,
    worlds,
    compatible: worlds.filter((w) => w.state === "compatible").length,
    incompatible: worlds.filter((w) => w.state === "incompatible").length,
    conflicting: worlds.filter((w) => w.state === "conflicting").length,
    boundary:
      "Bounded enumeration and source-consistency simulation. Compatible means not eliminated by the retrieved assertions; it is not probable, verified true or an operational recommendation. No losses or causal effects were simulated.",
  };
}
export function evaluateWorkspace(
  subject: InvestigationCase,
  documents: CheckedDocument[],
  plans: PossibilityPlan[] = [],
) {
  const auth = evaluateInvestigation(subject, documents);
  const space = evaluatePossibilities(subject, documents, plans);
  const conflicts = [
    ...auth.conflicts,
    ...space.groups
      .filter((g) => g.observationState === "conflicting")
      .map(
        (g) =>
          `${g.plan.label}: retrieved case-wide source assertions disagree.`,
      ),
  ];
  const facts = [...auth.facts, ...space.facts];
  const limits = facts.find((f) => f.id === "limits")!;
  limits.text = `${limits.text} ${space.boundary}`;
  return { ...auth, conflicts, fingerprint: space.fingerprint, facts, space };
}

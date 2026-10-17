import type { JSONSchema7 } from "ai";
import type { CaseData, ChallengeData } from "./case";

export const AI_PROMPT_VERSION = "coconut-evidence-v6";
export type AiKind = "question" | "finding";
export type AiCitation = {
  id: string;
  title: string;
  source: string;
  sourceRecord: string;
  traceId: string;
  observedAt: string;
  caseId?: string;
};
export type AiFact = {
  id: string;
  text: string;
  category: "observation" | "mitigation";
  citations: AiCitation[];
};
export type AnswerType =
  | "facts"
  | "summary"
  | "explanation"
  | "missing_data"
  | "out_of_scope"
  | "clarification";
export const answerMessages: Record<
  "missing_data" | "out_of_scope" | "clarification",
  string
> = {
  missing_data:
    "I can’t find that information in the checked records. I can help with the transfers, device timing, connections, policy and available counter-evidence. Open Core to see which sources are available.",
  out_of_scope:
    "I’m here to help you investigate financial risk cases. That question falls outside the case records. Ask me to explain this case, trace a transfer or compare the evidence for another explanation.",
  clarification:
    "I’m not sure which detail you mean. Are you asking about the transfers, the device, a connection or a policy? Name it and I’ll follow the records with you.",
};
export type AiSelection = {
  status: "supported" | "insufficient";
  fact_ids: string[];
  next_step:
    | "inspect_activity"
    | "inspect_links"
    | "review_counter_evidence"
    | "human_review"
    | "none";
};
export type AiRun = {
  id: string;
  caseId: string;
  kind: AiKind;
  question: string;
  createdAt: string;
  model: string;
  traceId: string;
  fingerprint: string;
  conversation?: { runIds: string[]; fingerprint: string };
  scope?: "case" | "inbox";
  answerType?: AnswerType;
  message?: string;
  status: "supported" | "insufficient";
  facts: AiFact[];
  nextStep: AiSelection["next_step"];
  requiresHumanReview: true;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

export function caseFacts(
  record: CaseData,
  challenge: ChallengeData,
): AiFact[] {
  if (
    !record.analysis?.traceId ||
    !["firestore-records"].includes(record.analysis.engine)
  )
    throw new Error("Verified source analysis is required for AI");
  if (
    new Set(record.evidence.map((e) => e.kind)).size !== 5 ||
    new Set(record.evidence.map((e) => e.id)).size !== record.evidence.length ||
    record.evidence.some(
      (e) =>
        !e.verified ||
        !e.traceId ||
        !e.sourceRecord ||
        !e.observedAt ||
        !Number.isFinite(e.score) ||
        e.score < 0,
    ) ||
    record.evidence.reduce((sum, e) => sum + e.score, 0) !== record.score
  )
    throw new Error("Complete evidence verification is required for AI");
  if (challenge.caseId !== record.id || challenge.source !== "firestore")
    throw new Error("Challenge context belongs to a different source or case");
  const facts: AiFact[] = [];
  const add = (
    id: string,
    text: string,
    kind: CaseData["evidence"][number]["kind"],
  ) => {
    const e = record.evidence.find((item) => item.kind === kind);
    if (e)
      facts.push({
        id,
        text,
        category: "observation",
        citations: [
          {
            id: e.id,
            title: e.title,
            source: e.source,
            sourceRecord: e.sourceRecord,
            traceId: e.traceId,
            observedAt: e.observedAt,
          },
        ],
      });
  };
  const registerCitation = {
    id: record.id,
    title: "Case register",
    source: "firestore/cases",
    sourceRecord: record.id,
    traceId: record.analysis.traceId,
    observedAt: record.evidence[0].observedAt,
  };
  facts.push({
    id: "case_context",
    text: `Case ${record.id}, “${record.title}”, concerns ${record.customer} (account ${record.account}).`,
    category: "observation",
    citations: [registerCitation],
  });
  facts.push({
    id: "risk_signal",
    text: `The case has a risk signal of ${record.score}/100 and needs review. The score does not establish fraud or wrongdoing.`,
    category: "observation",
    citations: [registerCitation],
  });
  facts.push({
    id: "signal_reasons",
    text: `The configured signal combines ${record.evidence.map((e) => `${e.score} points for ${e.title.toLowerCase()}`).join("; ")}. These are the recorded contributions to the ${record.score}/100 review signal, not proof of fraud.`,
    category: "observation",
    citations: record.evidence.map((e) => ({
      id: e.id,
      title: e.title,
      source: "firestore/evidence",
      sourceRecord: `${record.id}:${e.id}`,
      traceId: e.traceId,
      observedAt: e.observedAt,
    })),
  });
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: record.currency,
    maximumFractionDigits: 2,
  }).format(record.amount);
  if (record.transferCount > 0)
    add(
      "movement",
      `${record.transferCount} outbound transfers totaling ${amount} occurred over ${record.windowMinutes} minutes.`,
      "transaction",
    );
  if (record.velocityMultiplier > 0 && record.analysis.baselineWindowMatches)
    add(
      "velocity",
      `Transfer velocity is ${record.velocityMultiplier}× the configured 11-minute baseline. This baseline is a model input, not independently inferred account history.`,
      "behaviour",
    );
  if (!record.analysis.baselineWindowMatches)
    add(
      "baseline_window",
      `The observed ${record.windowMinutes}-minute interval does not match the configured 11-minute baseline. A velocity ratio cannot be inferred from it.`,
      "behaviour",
    );
  for (const transfer of record.transfers) {
    const proof = record.evidence.find((e) => e.kind === "transaction")!;
    facts.push({
      id: `transfer-${transfer.id}`,
      text: `${transfer.id}: ${new Intl.NumberFormat("en-IN", { style: "currency", currency: record.currency, maximumFractionDigits: 2 }).format(transfer.amount)} sent to ${transfer.to} at ${transfer.time} IST.`,
      category: "observation",
      citations: [
        {
          id: proof.id,
          title: `Transfer ${transfer.id}`,
          source: proof.source,
          sourceRecord: transfer.id,
          traceId: proof.traceId,
          observedAt: proof.observedAt,
        },
      ],
    });
  }
  if (record.transfers.length) {
    const maximum = Math.max(
      ...record.transfers.map((transfer) => transfer.amount),
    );
    const largest = record.transfers.filter(
      (transfer) => transfer.amount === maximum,
    );
    const proof = record.evidence.find((e) => e.kind === "transaction")!;
    facts.push({
      id: "largest_transfer",
      text: `${largest.length === 1 ? "The largest transfer is" : "The largest transfers are tied:"} ${largest.map((transfer) => `${transfer.id}, ${new Intl.NumberFormat("en-IN", { style: "currency", currency: record.currency, maximumFractionDigits: 2 }).format(transfer.amount)} to ${transfer.to} at ${transfer.time} IST`).join("; ")}.`,
      category: "observation",
      citations: largest.map((transfer) => ({
        id: proof.id,
        title: `Transfer ${transfer.id}`,
        source: proof.source,
        sourceRecord: transfer.id,
        traceId: proof.traceId,
        observedAt: proof.observedAt,
      })),
    });
  }
  if (record.deviceLeadSeconds >= 0)
    add(
      "device",
      `The cited device ${record.evidence.find((e) => e.kind === "device")!.sourceRecord} was first recorded ${record.deviceLeadSeconds} seconds before the first transfer. This timing alone does not establish who operated it.`,
      "device",
    );
  if (record.flaggedEntities.length)
    add(
      "links",
      `Beneficiary ${record.primaryBeneficiary} connects to ${record.flaggedEntities.length} previously investigated accounts (${record.flaggedEntities.join(", ")}). A link does not establish wrongdoing.`,
      "network",
    );
  if (record.policy.passage)
    add(
      "policy",
      `Policy §${record.policy.section}: ${record.policy.passage}`,
      "policy",
    );
  for (const m of challenge.mitigating) {
    if (!m.verified || !m.traceId || !m.observedAt) continue;
    const [source, sourceRecord = ""] = m.source.split(" · ");
    if (!sourceRecord) continue;
    facts.push({
      id: `mitigation-${m.id}`,
      text: m.detail,
      category: "mitigation",
      citations: [
        {
          id: m.id,
          title: m.title,
          source,
          sourceRecord,
          traceId: m.traceId,
          observedAt: m.observedAt,
        },
      ],
    });
  }
  return facts;
}

// Model output selects checked observations. It cannot supply display prose,
// numbers, citations, SQL, a new score, or an investigator disposition.
export function validateSelection(
  value: unknown,
  facts: readonly AiFact[],
  kind: AiKind,
): AiSelection {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid AI response");
  const data = value as Record<string, unknown>;
  const steps = [
    "inspect_activity",
    "inspect_links",
    "review_counter_evidence",
    "human_review",
    "none",
  ];
  if (
    Object.keys(data).some(
      (key) => !["status", "fact_ids", "next_step"].includes(key),
    ) ||
    typeof data.status !== "string" ||
    !["supported", "insufficient"].includes(data.status) ||
    typeof data.next_step !== "string" ||
    !steps.includes(data.next_step) ||
    !Array.isArray(data.fact_ids) ||
    data.fact_ids.length > 24
  )
    throw new Error("Invalid AI response structure");
  const ids = data.fact_ids as unknown[];
  if (
    ids.some(
      (id) => typeof id !== "string" || !facts.some((f) => f.id === id),
    ) ||
    new Set(ids).size !== ids.length
  )
    throw new Error("AI selected an unsupported or duplicate fact");
  if (
    data.status === "insufficient" &&
    (ids.length || data.next_step !== "none")
  )
    throw new Error("Unsupported answers cannot contain claims");
  if (data.status === "supported" && !ids.length)
    throw new Error("An answer requires a checked source");
  if (kind === "finding") {
    if (
      data.status !== "supported" ||
      data.next_step !== "human_review" ||
      !ids.includes("movement") ||
      !ids.includes("policy") ||
      facts.some((f) => f.category === "mitigation" && !ids.includes(f.id))
    )
      throw new Error(
        "A finding must include activity, policy and available counter-evidence for human review",
      );
  }
  return data as unknown as AiSelection;
}

export function selectionSchema(
  facts: readonly AiFact[],
  kind: AiKind = "finding",
): { type: "json"; schema: JSONSchema7 } {
  if (kind === "question")
    return {
      type: "json",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          answer_type: {
            type: "string",
            enum: [
              "facts",
              "summary",
              "explanation",
              "missing_data",
              "out_of_scope",
              "clarification",
            ],
          },
          fact_ids: {
            type: "array",
            items: { type: "string", enum: facts.map((f) => f.id) },
          },
          next_step: {
            type: "string",
            enum: [
              "inspect_activity",
              "inspect_links",
              "review_counter_evidence",
              "human_review",
              "none",
            ],
          },
        },
        required: ["answer_type", "fact_ids", "next_step"],
      },
    };
  return {
    type: "json",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: { type: "string", enum: ["supported"] },
        fact_ids: {
          type: "array",
          items: { type: "string", enum: facts.map((f) => f.id) },
        },
        next_step: {
          type: "string",
          enum: ["human_review"],
        },
      },
      required: ["status", "fact_ids", "next_step"],
    },
  };
}

/** An unsupported answer has no navigation action, regardless of the model's suggestion. */
export function validateModelSelection(
  value: unknown,
  facts: AiFact[],
  kind: AiKind,
) {
  const data =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (data && Object.hasOwn(data, "answer_type")) {
    if (
      kind !== "question" ||
      Object.keys(data).some(
        (key) => !["answer_type", "fact_ids", "next_step"].includes(key),
      )
    )
      throw new Error("Invalid AI response structure");
    if (
      ![
        "facts",
        "summary",
        "explanation",
        "missing_data",
        "out_of_scope",
        "clarification",
      ].includes(String(data.answer_type))
    )
      throw new Error("Invalid answer type");
    const insufficient = [
      "missing_data",
      "out_of_scope",
      "clarification",
    ].includes(String(data.answer_type));
    return validateSelection(
      {
        status: insufficient ? "insufficient" : "supported",
        fact_ids: data.fact_ids,
        next_step: insufficient ? "none" : data.next_step,
      },
      facts,
      kind,
    );
  }
  if (
    data?.status === "insufficient" &&
    Array.isArray(data.fact_ids) &&
    data.fact_ids.length === 0 &&
    [
      "inspect_activity",
      "inspect_links",
      "review_counter_evidence",
      "human_review",
      "none",
    ].includes(String(data.next_step))
  )
    return validateSelection({ ...data, next_step: "none" }, facts, kind);
  return validateSelection(value, facts, kind);
}

/** Complete the model's understood intent with the minimum checked context. */
export function completeQuestionSelection(
  selection: AiSelection,
  answerType: AnswerType,
  facts: readonly AiFact[],
): AiSelection {
  if (selection.status !== "supported") return selection;
  const required =
    answerType === "summary"
      ? [
          "case_context",
          "movement",
          "risk_signal",
          ...facts.filter((f) => f.category === "mitigation").map((f) => f.id),
        ]
      : answerType === "explanation" &&
          selection.fact_ids.includes("risk_signal")
        ? ["movement", "signal_reasons"]
        : [];
  const ids = [
    ...new Set([
      ...selection.fact_ids,
      ...required.filter((id) => facts.some((f) => f.id === id)),
    ]),
  ];
  return validateSelection({ ...selection, fact_ids: ids }, facts, "question");
}

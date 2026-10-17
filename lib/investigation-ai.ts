import "server-only";
import { randomUUID } from "node:crypto";
import { generateInvestigationObject } from "./investigation-provider";
import { evaluateWorkspace } from "./possibility-space";
import { InvestigationError, type InvestigationCase } from "./investigation";
import {
  saveInvestigation,
  type InvestigationAnswer,
  type InvestigationState,
} from "./investigation-store";

type Selection = {
  answer_type: "answer" | "missing_information" | "out_of_scope";
  claim_ids: string[];
  request_ids: string[];
};

export async function askInvestigation(
  subject: InvestigationCase,
  state: InvestigationState,
  secret: string,
  question: string,
  selectedHypothesis?: string,
) {
  if (!question.trim() || question.length > 1000)
    throw new InvestigationError(
      "Ask an investigation question of 1–1,000 characters.",
    );
  if (
    state.history.filter(
      (h) => h.event === "question_answered" || h.event === "question_failed",
    ).length >= 24
  )
    throw new InvestigationError(
      "This workspace has reached its 24-question limit. Existing answers and evidence remain available.",
      429,
    );
  const evaluation = evaluateWorkspace(subject, state.documents, state.plans);
  for (const run of state.simulations ?? [])
    if (run.fingerprint === evaluation.fingerprint)
      evaluation.facts.push({
        id: `simulation:${run.id}`,
        text: `Executed source-consistency simulation: ${run.worlds.length} combinations, ${run.compatible} compatible, ${run.incompatible} incompatible, ${run.conflicting} conflicting. ${run.boundary}`,
        references: [],
      });
  const schema = {
    type: "object" as const,
    properties: {
      answer_type: {
        type: "string" as const,
        enum: ["answer", "missing_information", "out_of_scope"],
      },
      claim_ids: {
        type: "array" as const,
        items: {
          type: "string" as const,
          enum: evaluation.facts.map((f) => f.id),
        },
      },
      request_ids: {
        type: "array" as const,
        items: {
          type: "string" as const,
          enum: evaluation.requests.map((r) => r.id),
        },
      },
    },
    required: ["answer_type", "claim_ids", "request_ids"],
    additionalProperties: false,
  };
  const prompt = [
    "You help a bank investigator explore a synthetic financial case with missing evidence.",
    "Select IDs from the checked current execution catalog to answer the question. You cannot create source facts or change branch outcomes.",
    "Select at most six claim IDs and at most two request IDs. Prefer only the checks that directly answer the question.",
    "For a question about one named explanation, such as borrowed funds, select only that matching possibility fact and any essential executed check. Do not list other explanations unless the user asks for a comparison or asks why the full possibility set changed. The selected hypothesis resolves short follow-ups; an explicitly named explanation in the latest question takes precedence.",
    "A hypothesis and every conditional result remain hypothetical. A recorded approval does not establish a legitimate purpose. No fraud probabilities or criminal intent may be inferred.",
    "For authorization scenarios select hypothesis:customer, hypothesis:delegate, hypothesis:unauthorized. For generated unknowns use possibility: facts matching the selected hypothesis or question. These include proposed evidence trails and actual source-match results. Never describe a proposed trail as executed action. For a branch question select that hypothesis and its executed checks.",
    "When a check already explains a branch result, classify a why/what-next question as answer, even if the next evidence request is unresolved. missing_information is for a requested fact that the current checks cannot establish.",
    "For a delegation limit question, select delegate:batch_... and relevant delegate checks; for what evidence to request, select the relevant request IDs. If asked why an answer changed, use the source_received changes and current catalog.",
    "For questions asking whether evidence proves fraud, guilt, legitimacy or customer intent, select limits and the relevant current evidence checks. The answer is a known scope limitation, not a missing_information response with no facts. Never accuse a person. For why scenarios changed, select the current relevant possibility facts and current simulation fact where available. Every in-scope response must select at least one claim or request ID.",
    "Use previous conversation only to resolve follow-up intent; current execution facts replace any earlier snapshot. Always include conflicting-evidence context if it affects the requested conclusion.",
    "When the requested fact is missing, select missing_information and only relevant unresolved checks or requests. For unrelated topics, select out_of_scope with empty arrays. Never substitute movement facts for an unrelated question.",
    JSON.stringify({
      question,
      selected_hypothesis: selectedHypothesis,
      current: evaluation,
      previous_turns: state.answers.slice(-4).map((a) => ({
        question: a.question,
        answer: a.paragraphs,
        snapshot: a.fingerprint,
      })),
      evidence_updates: state.history
        .filter((e) => e.event === "source_received")
        .slice(-4),
    }),
  ].join("\n");
  let provider = "gemini";
  let traceId: string | undefined;
  try {
    const result = await generateInvestigationObject(schema, prompt, 1024);
    const { output: selection, usage, model } = result;
    provider = result.provider;
    traceId = result.traceId;
    const picked = selection as Selection;
    if (
      !picked ||
      !["answer", "missing_information", "out_of_scope"].includes(
        picked.answer_type,
      ) ||
      !Array.isArray(picked.claim_ids) ||
      picked.claim_ids.length > 6 ||
      new Set(picked.claim_ids).size !== picked.claim_ids.length ||
      picked.claim_ids.some(
        (id) => !evaluation.facts.some((f) => f.id === id),
      ) ||
      !Array.isArray(picked.request_ids) ||
      picked.request_ids.length > 2 ||
      new Set(picked.request_ids).size !== picked.request_ids.length ||
      picked.request_ids.some(
        (id) => !evaluation.requests.some((r) => r.id === id),
      ) ||
      (picked.answer_type === "out_of_scope" &&
        (picked.claim_ids.length || picked.request_ids.length)) ||
      (picked.answer_type !== "out_of_scope" &&
        !picked.claim_ids.length &&
        !picked.request_ids.length)
    )
      throw new InvestigationError(
        "The AI response did not match the checked investigation results. No unsupported answer was saved.",
        502,
      );
    const paragraphs: InvestigationAnswer["paragraphs"] =
      picked.answer_type === "out_of_scope"
        ? [
            {
              text: "I can help with this case's possible explanations, evidence gaps and next investigation steps. Ask about one of those, or choose a trail to explore.",
              references: [],
            },
          ]
        : picked.claim_ids.map((id) => {
            const f = evaluation.facts.find((f) => f.id === id)!;
            return {
              text: f.text,
              references: f.references,
              ...(f.hypothesis ? { hypothesis: f.hypothesis } : {}),
            };
          });
    if (
      picked.answer_type === "missing_information" &&
      !(
        picked.claim_ids.length === 1 &&
        picked.claim_ids[0] === "limits" &&
        !picked.request_ids.length
      )
    )
      paragraphs.unshift({
        text: "Some parts of the investigation remain unresolved. Here is what the current checks establish and what to obtain next.",
        references: [],
      });
    if (evaluation.conflicts.length && picked.answer_type !== "out_of_scope")
      paragraphs.push({
        text: "Source records conflict. Keep the disputed evidence question open while their integrity and scope are reviewed.",
        references: state.documents.flatMap((s) =>
          s.document.records
            .filter(
              (r) =>
                r.kind === "customer_statement" || r.kind === "observation",
            )
            .map((r) => r.id),
        ),
      });
    const answer: InvestigationAnswer = {
      id: randomUUID(),
      question: question.trim(),
      paragraphs,
      requests: picked.request_ids,
      provider,
      model,
      ...(traceId ? { traceId } : {}),
      usage,
      fingerprint: evaluation.fingerprint,
      at: new Date().toISOString(),
    };
    return await saveInvestigation(
      state,
      {
        ...state,
        answers: [...state.answers, answer],
        history: [
          ...state.history,
          {
            id: randomUUID(),
            at: answer.at,
            event: "question_answered",
            detail: `Answered an investigation question using Gemini and checked execution facts.`,
            traceId,
            after: evaluation.fingerprint,
            changes: [],
          },
        ],
      },
      secret,
    );
  } catch (error) {
    // Failures are real provider attempts too. Save only safe provenance, never
    // provider error bodies or a fabricated substitute answer.
    try {
      await saveInvestigation(
        state,
        {
          ...state,
          history: [
            ...state.history,
            {
              id: randomUUID(),
              at: new Date().toISOString(),
              event: "question_failed",
              detail: `An investigation question could not be completed by Gemini. No substitute answer was generated.`,
              traceId,
              after: evaluation.fingerprint,
              changes: [],
            },
          ],
        },
        secret,
      );
    } catch {
      console.error("Investigation failure audit could not be saved");
    }
    throw error;
  }
}

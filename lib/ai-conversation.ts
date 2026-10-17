import { validateSelection, type AiFact, type AiRun } from "./ai-contract.ts";

export class ConversationError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export type ConversationTurn = {
  runId: string;
  question: string;
  answerFactIds: string[];
  status: AiRun["status"];
};
export function checkedHistoryIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 4 ||
    value.some(
      (id) =>
        typeof id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        ),
    ) ||
    new Set(value).size !== value.length
  )
    throw new ConversationError(
      "Invalid conversation references. Start a new question.",
      400,
    );
  return value;
}

/** Client supplies IDs only. Questions/answers are recovered from this case's saved audit. */
export function verifiedConversation(
  ids: string[],
  runs: AiRun[],
  caseId: string,
  fingerprint: string,
  facts: AiFact[],
): ConversationTurn[] {
  return ids.map((id) => {
    const run = runs.find(
      (r) => r?.id === id && r.caseId === caseId && r.kind === "question",
    );
    if (
      !run ||
      run.fingerprint !== fingerprint ||
      typeof run.question !== "string" ||
      run.question.length > 600 ||
      !Array.isArray(run.facts)
    )
      throw new ConversationError(
        "These earlier answers are no longer valid for this case. Start a new question.",
        409,
      );
    try {
      validateSelection(
        {
          status: run.status,
          fact_ids: run.facts.map((f) => f.id),
          next_step: run.nextStep,
        },
        facts,
        "question",
      );
    } catch {
      throw new ConversationError(
        "The earlier answer failed its source checks. Start a new question.",
        409,
      );
    }
    return {
      runId: id,
      question: run.question,
      answerFactIds: run.facts.map((f) => f.id),
      status: run.status,
    };
  });
}

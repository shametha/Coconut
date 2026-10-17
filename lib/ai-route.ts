import { NextResponse } from "next/server";
import { isAllowedAppRequest } from "./request-origin";
import { isValidCaseId } from "./case";
import {
  AiError,
  checkedQuestion,
  generateCaseAi,
  latestFinding,
} from "./case-ai";
import type { AiKind } from "./ai-contract";
import { copilotGuide } from "./copilot-guide";
import { checkedHistoryIds, ConversationError } from "./ai-conversation";

type Context = { params: Promise<{ id: string }> };
const json = (body: unknown, status = 200, retryAfter?: number) =>
  NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
    },
  });

function failure(error: unknown) {
  if (error instanceof ConversationError)
    return json({ error: error.message }, error.status);
  if (error instanceof AiError)
    return json({ error: error.message }, error.status, error.retryAfter);
  // Keep provider output, prompts and connection settings out of public errors.
  console.error("Case AI operation failed");
  return json(
    {
      error: "Case AI is unavailable. Check the data connection and try again.",
    },
    503,
  );
}

export async function caseAiPost(
  request: Request,
  context: Context,
  kind: AiKind,
) {
  const { id } = await context.params;
  if (!isValidCaseId(id)) return json({ error: "Invalid case ID" }, 400);
  if (!isAllowedAppRequest(request))
    return json(
      { error: "Use the case question panel to make this request." },
      403,
    );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return json({ error: "A JSON request is required." }, 415);
  if (Number(request.headers.get("content-length")) > 4096)
    return json({ error: "The case question is too long." }, 413);
  try {
    const text = await request.text();
    if (text.length > 4096)
      return json({ error: "The case question is too long." }, 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "Invalid request." }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return json({ error: "Invalid request." }, 400);
    const question =
      kind === "question"
        ? checkedQuestion((body as { question?: unknown }).question)
        : undefined;
    const guide = question ? copilotGuide(question) : null;
    const history = checkedHistoryIds(
      (body as { previousRunIds?: unknown }).previousRunIds,
    );
    if (guide) return json({ guide });
    const run = await generateCaseAi(id, kind, question, history);
    return json({ run });
  } catch (error) {
    return failure(error);
  }
}

export async function caseFindingGet(context: Context) {
  const { id } = await context.params;
  if (!isValidCaseId(id)) return json({ error: "Invalid case ID" }, 400);
  try {
    return json({ run: await latestFinding(id) });
  } catch (error) {
    return failure(error);
  }
}

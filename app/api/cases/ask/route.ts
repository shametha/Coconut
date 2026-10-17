import { NextResponse } from "next/server";
import { checkedHistoryIds, ConversationError } from "@/lib/ai-conversation";
import { copilotGuide } from "@/lib/copilot-guide";
import { AiError, checkedQuestion } from "@/lib/case-ai";
import { askInbox } from "@/lib/inbox-ai";
import { isAllowedAppRequest } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;
const json = (body: unknown, status = 200, retryAfter?: number) =>
  NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
    },
  });
export async function POST(request: Request) {
  if (!isAllowedAppRequest(request))
    return json({ error: "Ask from the Coconut inbox." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return json({ error: "A JSON request is required." }, 415);
  if (Number(request.headers.get("content-length")) > 4096)
    return json({ error: "The question is too long." }, 413);
  try {
    const text = await request.text();
    if (text.length > 4096)
      return json({ error: "The question is too long." }, 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "Invalid request." }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return json({ error: "Invalid request." }, 400);
    const question = checkedQuestion((body as { question?: unknown }).question);
    const ids = checkedHistoryIds(
      (body as { previousRunIds?: unknown }).previousRunIds,
    );
    const guide = copilotGuide(question, "inbox");
    if (guide) return json({ guide });
    return json({ run: await askInbox(question, ids) });
  } catch (error) {
    if (error instanceof AiError || error instanceof ConversationError)
      return json(
        { error: error.message },
        error.status,
        error instanceof AiError ? error.retryAfter : undefined,
      );
    console.error("Inbox AI operation failed");
    return json(
      {
        error:
          "I can’t reach the case register right now. Please try again shortly.",
      },
      503,
    );
  }
}

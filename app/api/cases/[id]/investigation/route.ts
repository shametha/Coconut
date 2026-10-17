import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isValidCaseId } from "@/lib/case";
import { InvestigationError } from "@/lib/investigation";
import { AiError } from "@/lib/case-ai";
import { askInvestigation } from "@/lib/investigation-ai";
import { planPossibilities } from "@/lib/investigation-planner";
import { evaluateWorkspace } from "@/lib/possibility-space";
import { investigationHistory } from "@/lib/investigation-history";
import { investigationReport } from "@/lib/customer-reports";
import { isAllowedAppRequest } from "@/lib/request-origin";
import {
  createInvestigation,
  investigationCase,
  investigationView,
  readInvestigation,
  registeredDocument,
  retrieveDocument,
  runSimulation,
  sourceListings,
  verifiedState,
} from "@/lib/investigation-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
type Context = { params: Promise<{ id: string }> };
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
const cookieName = (id: string) => `coconut_investigation_${id}`;
function failure(error: unknown) {
  if (error instanceof InvestigationError || error instanceof AiError)
    return json({ error: error.message }, error.status);
  console.error("Source-backed investigation request failed");
  return json(
    {
      error:
        "The investigation could not reach its data or AI service. No substitute evidence or answer was generated.",
    },
    503,
  );
}
async function contextData(context: Context) {
  const { id } = await context.params;
  if (!isValidCaseId(id)) throw new InvestigationError("Invalid case ID.");
  const subject = await investigationCase(id);
  const supplied = (await cookies()).get(cookieName(id))?.value ?? "";
  const secret = /^[a-f0-9]{64}$/.test(supplied) ? supplied : "";
  const state = await readInvestigation(id, secret);
  if (state) await verifiedState(subject, state);
  return { id, subject, secret, state };
}
export async function GET(request: Request, context: Context) {
  try {
    const { id, subject, state } = await contextData(context);
    if (new URL(request.url).searchParams.get("history") === "1") {
      if (!state)
        throw new InvestigationError(
          "Open the investigation before replaying its history.",
          409,
        );
      return json(investigationHistory(state));
    }
    const documentId = new URL(request.url).searchParams.get("source_document");
    if (documentId) {
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(documentId))
        throw new InvestigationError("Invalid source document ID.");
      const source = await registeredDocument(subject, documentId);
      return new NextResponse(JSON.stringify(source.document, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="${documentId}.json"`,
          "X-Content-SHA256": source.sha256,
        },
      });
    }
    const sources = await sourceListings(
      id,
      state?.documents.map((s) => s.document.id),
    );
    const view = investigationView(state, subject, sources);
    if (new URL(request.url).searchParams.get("export") === "1") {
      if (!state)
        throw new InvestigationError(
          "Open an investigation before exporting it.",
          409,
        );
      return new NextResponse(investigationReport(view), {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="${id}-conditional-investigation.md"`,
        },
      });
    }
    return json(view);
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request, context: Context) {
  if (!isAllowedAppRequest(request))
    return json(
      { error: "Use the investigation workspace to make this request." },
      403,
    );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return json({ error: "A JSON request is required." }, 415);
  try {
    if (Number(request.headers.get("content-length")) > 64000)
      throw new InvestigationError("The source document is too large.", 413);
    const text = await request.text();
    if (Buffer.byteLength(text) > 64000)
      throw new InvestigationError("The source document is too large.", 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
    } catch {
      throw new InvestigationError("Invalid JSON request.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new InvestigationError("Invalid request.");
    const {
      id,
      subject,
      secret: existingSecret,
      state: existingState,
    } = await contextData(context);
    const secret = existingSecret || randomBytes(32).toString("hex");
    let state = existingState;
    if (body.action === "start") {
      state ??= await createInvestigation(subject, secret);
    } else {
      if (!state)
        throw new InvestigationError("Open the investigation first.", 409);
      if (
        !Number.isSafeInteger(body.revision) ||
        body.revision !== state.revision
      )
        throw new InvestigationError(
          "The investigation changed. Refresh before continuing.",
          409,
        );
      if (body.action === "retrieve" || body.action === "import") {
        if (
          typeof body.documentId !== "string" ||
          !/^[A-Za-z0-9_-]{1,80}$/.test(body.documentId)
        )
          throw new InvestigationError("Choose a valid source document.");
        if (body.action === "import" && !body.document)
          throw new InvestigationError("A source document is required.");
        state = await retrieveDocument(
          subject,
          state,
          body.documentId,
          secret,
          body.action === "import" ? body.document : undefined,
        );
      } else if (body.action === "plan") {
        if (typeof body.question !== "string")
          throw new InvestigationError("Describe the missing evidence.");
        state = await planPossibilities(
          subject,
          state,
          secret,
          body.question,
          await sourceListings(id),
        );
      } else if (body.action === "simulate") {
        if (
          !Array.isArray(body.planIds) ||
          body.planIds.some((id) => typeof id !== "string")
        )
          throw new InvestigationError(
            "Choose generated unknowns to simulate.",
          );
        state = await runSimulation(
          subject,
          state,
          secret,
          body.planIds as string[],
        );
      } else if (body.action === "ask") {
        if (typeof body.question !== "string")
          throw new InvestigationError("Enter an investigation question.");
        if (
          body.hypothesisId !== undefined &&
          ![
            "customer",
            "delegate",
            "unauthorized",
            ...evaluateWorkspace(
              subject,
              state.documents,
              state.plans,
            ).space.groups.flatMap((g) => g.branches.map((b) => b.id)),
          ].includes(String(body.hypothesisId))
        )
          throw new InvestigationError("Choose a supported hypothesis.");
        state = await askInvestigation(
          subject,
          state,
          secret,
          body.question,
          body.hypothesisId as string | undefined,
        );
      } else throw new InvestigationError("Unsupported investigation action.");
    }
    const sources = await sourceListings(
      id,
      state.documents.map((s) => s.document.id),
    );
    const response = json(investigationView(state, subject, sources));
    if (!existingSecret)
      response.cookies.set(cookieName(id), secret, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: `/api/cases/${id}/investigation`,
        maxAge: 60 * 60 * 24 * 7,
      });
    return response;
  } catch (error) {
    return failure(error);
  }
}

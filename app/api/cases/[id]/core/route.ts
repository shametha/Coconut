import { NextResponse } from "next/server";
import {
  coreIntegrity,
  findingClaimsForCase,
  findingIsGrounded,
  isValidCaseId,
} from "@/lib/case";
import { loadCase } from "@/lib/case-store";
import { aiAuditReferences } from "@/lib/case-ai";
import { evidenceSummary } from "@/lib/customer-reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isValidCaseId(id))
    return NextResponse.json(
      { error: "Invalid case ID" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const result = await loadCase(id);
    if (!result)
      return NextResponse.json(
        { error: "Case not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    const integrity = coreIntegrity(result.case.evidence);
    const findingClaims = findingClaimsForCase(result.case);
    if (
      !integrity.verified ||
      !findingIsGrounded(result.case.evidence, findingClaims)
    )
      return NextResponse.json(
        { error: "Core integrity check failed" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    if (new URL(request.url).searchParams.get("summary") === "1")
      return new NextResponse(evidenceSummary(result.case), {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="${id}-evidence-summary.md"`,
        },
      });
    return NextResponse.json(
      {
        id: result.case.coreId,
        caseId: id,
        model: result.case.model,
        source: result.source,
        integrity,
        evidence: result.case.evidence,
        findingClaims,
        analysis: result.case.analysis,
        aiRuns: await aiAuditReferences(id),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Core load failed", error);
    return NextResponse.json(
      { error: "Core unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

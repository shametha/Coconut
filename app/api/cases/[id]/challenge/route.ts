import { NextResponse } from "next/server";
import { loadChallenge } from "@/lib/case-store";
import { isValidCaseId } from "@/lib/case";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isValidCaseId(id))
    return NextResponse.json(
      { error: "Invalid case ID" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const result = await loadChallenge(id);
    if (!result)
      return NextResponse.json(
        { error: "Case not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Challenge load failed", error);
    return NextResponse.json(
      { error: "Challenge unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

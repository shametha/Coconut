import { NextResponse } from "next/server";
import { listCases } from "@/lib/case-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listCases(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Case list failed", error);
    return NextResponse.json({ error: "Cases unavailable" }, { status: 503 });
  }
}

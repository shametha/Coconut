import { caseAiPost, caseFindingGet } from "@/lib/ai-route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return caseFindingGet(context);
}
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return caseAiPost(request, context, "finding");
}

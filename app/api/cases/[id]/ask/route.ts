import { caseAiPost } from "@/lib/ai-route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return caseAiPost(request, context, "question");
}

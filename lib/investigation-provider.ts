import "server-only";
import { generateText, jsonSchema, Output } from "ai";
import { createGoogle } from "@ai-sdk/google";
import { reserveGeneration } from "./ai-budget";
import { InvestigationError } from "./investigation";

export const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
export async function generateInvestigationObject(
  schema: Parameters<typeof jsonSchema>[0],
  prompt: string,
  tokens = 2400,
) {
  if (!process.env.GEMINI_API_KEY)
    throw new InvestigationError(
      "Configure the server’s Gemini API key before requesting analysis.",
      503,
    );
  const release = await reserveGeneration();
  try {
    const google = createGoogle({ apiKey: process.env.GEMINI_API_KEY });
    const result = await generateText({
      model: google(MODEL),
      prompt,
      output: Output.object({ schema: jsonSchema(schema) }),
      maxOutputTokens: Math.max(tokens, 2048),
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(60_000),
      providerOptions: {
        google: {
          thinkingConfig: { thinkingLevel: "low", includeThoughts: false },
        },
      },
    });
    if (result.finishReason !== "stop" || !result.output)
      throw new InvestigationError(
        "Gemini did not finish the structured analysis. Please retry.",
        502,
      );
    return {
      output: result.output,
      usage: JSON.parse(JSON.stringify(result.usage)) as typeof result.usage,
      traceId: result.response.id,
      provider: "gemini" as const,
      model: result.response.modelId || MODEL,
    };
  } finally {
    await release();
  }
}

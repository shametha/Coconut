import { randomUUID } from "node:crypto";
import { database } from "./firebase-admin.ts";

export class AiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfter?: number,
  ) {
    super(message);
  }
}
export function checkedQuestion(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 600)
    throw new AiError("Enter a case question of 1–600 characters.", 400);
  return value.trim().replace(/\s+/g, " ");
}
export async function reserveGeneration() {
  const ref = database().doc("service_limits/gemini");
  const lease = randomUUID();
  const cap = Number(process.env.COCONUT_HOURLY_AI_LIMIT || 24);
  if (!Number.isInteger(cap) || cap < 1 || cap > 100)
    throw new AiError(
      "Configure an hourly AI allowance between 1 and 100 requests.",
      503,
    );
  await database().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref),
      saved = snapshot.data(),
      now = Date.now();
    const attempts: number[] = (saved?.attempts ?? []).filter(
      (n: number) => now - n < 3_600_000,
    );
    if (saved?.leaseUntil > now)
      throw new AiError(
        "Another answer is being prepared. Try again shortly.",
        429,
        5,
      );
    if (attempts.length >= cap)
      throw new AiError(
        "The hourly AI allowance has been reached. Existing answers remain available.",
        429,
        Math.ceil((attempts[0] + 3_600_000 - now) / 1000),
      );
    tx.set(ref, {
      attempts: [...attempts, now],
      lease,
      leaseUntil: now + 120_000,
    });
  });
  return async () => {
    await database().runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.data()?.lease === lease)
        tx.update(ref, { leaseUntil: 0, lease: "" });
    });
  };
}

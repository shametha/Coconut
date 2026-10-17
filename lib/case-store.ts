import "server-only";
import { createHash } from "node:crypto";
import { digest } from "./investigation";
import { database, readTrace } from "./firebase-admin";
import { caseFromSnapshot, type CaseSnapshot } from "./case-snapshot";
import { isValidCaseId, type CaseSummary } from "./case";

export function dataMode(): "firestore" {
  return "firestore";
}
export async function caseSnapshot(id: string) {
  if (!isValidCaseId(id)) return null;
  const result = await database().doc(`cases/${id}`).get();
  if (!result.exists) return null;
  const stored = result.data()!;
  if (
    stored.synthetic !== true ||
    !stored.snapshot ||
    digest(stored.snapshot) !== stored.sha256
  )
    throw new Error(
      "The synthetic case register failed its content-integrity check.",
    );
  return {
    snapshot: stored.snapshot as CaseSnapshot,
    traceId: readTrace(result),
  };
}
export async function loadCase(id: string) {
  const result = await caseSnapshot(id);
  return result ? caseFromSnapshot(id, result.snapshot, result.traceId) : null;
}
export async function loadChallenge(id: string) {
  return (await loadCase(id))?.challenge ?? null;
}
export async function listCases(): Promise<{
  cases: CaseSummary[];
  source: "firestore";
  traceId: string;
}> {
  const rows = await database()
    .collection("cases")
    .orderBy("__name__")
    .limit(101)
    .get();
  if (rows.size > 100)
    throw new Error("Narrow the case register before using this prototype.");
  const cases = rows.docs.map((row) => {
    const data = row.data();
    if (data.synthetic !== true || digest(data.snapshot) !== data.sha256)
      throw new Error("Case register integrity check failed.");
    const c = data.snapshot.cases[0];
    return {
      id: String(c.CASE_ID),
      title: String(c.TITLE),
      customer: String(c.CUSTOMER_NAME),
      account: String(c.ACCOUNT_ID),
      amount: Number(c.AMOUNT),
      currency: String(c.CURRENCY),
      openedAt: String(c.OPENED_AT),
      score: Number(c.RISK_SCORE),
      summary: String(c.SUMMARY),
    };
  });
  const registryDigest = createHash("sha256")
    .update(rows.docs.map(readTrace).join("|"))
    .digest("hex");
  return {
    cases,
    source: "firestore",
    traceId: `firestore:cases@${registryDigest}`,
  };
}

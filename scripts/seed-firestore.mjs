import { readFile } from "node:fs/promises";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { caseFromSnapshot } from "../lib/case-snapshot.ts";
import { checkDocument, digest } from "../lib/investigation.ts";

const projectId = process.env.GCLOUD_PROJECT;
if (!projectId) throw new Error("Set GCLOUD_PROJECT.");
if (!process.env.FIRESTORE_EMULATOR_HOST && !process.argv.includes("--cloud"))
  throw new Error("Cloud seeding requires the explicit --cloud flag.");
initializeApp({ projectId });
const db = getFirestore();
const scenarios = JSON.parse(
  await readFile(new URL("../data/scenarios.json", import.meta.url), "utf8"),
);
const documents = JSON.parse(
  await readFile(
    new URL("../data/source-documents.json", import.meta.url),
    "utf8",
  ),
);
const upper = (row) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toUpperCase(), v]));
const batch = db.batch();
for (const sc of scenarios.cases) {
  const id = sc.case.case_id,
    account = sc.case.account_id;
  const scoped = (row) => ({ CASE_ID: id, ACCOUNT_ID: account, ...upper(row) });
  const snapshot = {
    cases: [upper(sc.case)],
    evidence: sc.evidence.map(scoped),
    events: sc.risk_events.map(scoped),
    transactions: [
      ...sc.transactions.map(scoped),
      ...sc.background_transactions.map((r) => ({
        ...scoped(r),
        CASE_ID: null,
      })),
    ].map((r) => ({ ...r, TIME_LABEL: r.OCCURRED_AT.slice(11, 16) })),
    links: sc.account_links.map(scoped),
    mitigations: sc.mitigations.map(scoped),
    features: [
      {
        ...scoped(sc.risk_features),
        MODEL_VERSION: sc.case.model_version,
        BASELINE_TRANSFERS_PER_11_MIN:
          sc.risk_features.transfers_in_window /
          sc.risk_features.velocity_multiple,
      },
    ],
    devices: sc.device_events.map(scoped),
    beneficiaries: sc.beneficiaries.map(scoped),
    policies: scenarios.policy_chunks.map(upper),
  };
  const verified = caseFromSnapshot(id, snapshot, "seed-validation");
  if (
    !verified ||
    verified.case.amount !== sc.case.amount ||
    verified.case.evidence.filter((e) => e.verified).length !==
      (sc.incomplete ? 3 : 5)
  )
    throw new Error(
      `Invalid case sources: ${id} ${JSON.stringify(verified?.case.evidence.map((e) => ({ id: e.id, verified: e.verified, source: e.source, record: e.sourceRecord })))}`,
    );
  batch.set(db.doc(`cases/${id}`), {
    synthetic: true,
    snapshot,
    sha256: digest(snapshot),
    datasetVersion: "synthetic-cases-1",
  });
  const subject = {
    id,
    account,
    currency: sc.case.currency,
    payments: sc.transactions.map((t) => ({
      id: t.transaction_id,
      amount: t.amount,
      beneficiary: t.beneficiary_id,
      occurredAt: t.occurred_at,
    })),
  };
  for (const input of documents.filter((d) => d.caseId === id)) {
    const document = checkDocument(input, subject);
    batch.set(db.doc(`cases/${id}/source_documents/${document.id}`), {
      document,
      sha256: digest(document),
    });
  }
}
await batch.commit();
console.log(
  JSON.stringify({
    projectId,
    emulator: process.env.FIRESTORE_EMULATOR_HOST ?? null,
    synthetic: true,
    cases: scenarios.cases.length,
    documents: documents.length,
  }),
);

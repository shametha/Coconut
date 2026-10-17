import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { caseSnapshot } from "./case-store";
import { database, readTrace, clean } from "./firebase-admin";
import {
  checkDocument,
  digest,
  InvestigationError,
  type CheckedDocument,
  type InvestigationCase,
  type SourceDocument,
} from "./investigation";

import {
  evaluateWorkspace,
  simulatePossibilities,
  type PossibilityPlan,
  type Simulation,
  type EvidenceField,
} from "./possibility-space";

export type InvestigationAnswer = {
  id: string;
  question: string;
  paragraphs: { text: string; references: string[]; hypothesis?: string }[];
  requests: string[];
  provider: string;
  model: string;
  traceId?: string;
  usage: unknown;
  fingerprint: string;
  at: string;
};
export type InvestigationState = {
  id: string;
  caseId: string;
  revision: number;
  createdAt: string;
  caseSnapshot: InvestigationCase;
  documents: CheckedDocument[];
  plans?: PossibilityPlan[];
  simulations?: Simulation[];
  history: {
    id: string;
    at: string;
    event:
      | "opened"
      | "source_received"
      | "question_answered"
      | "question_failed"
      | "possibilities_generated"
      | "simulation_run";
    detail: string;
    documentId?: string;
    planId?: string;
    simulationId?: string;
    traceId?: string;
    before?: string;
    after: string;
    changes: string[];
    impact?: {
      approvalCoverage: { before: number; after: number; total: number };
      combinations?: {
        total: number;
        planIds: string[];
        before: {
          compatible: number;
          incompatible: number;
          conflicting: number;
        };
        after: {
          compatible: number;
          incompatible: number;
          conflicting: number;
        };
      };
    };
  }[];
  answers: InvestigationAnswer[];
};
export type SourceListing = {
  id: string;
  title: string;
  issuer: string;
  sha256: string;
  received: boolean;
  fields: EvidenceField[];
};
const hashOwner = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");

export async function investigationCase(
  id: string,
): Promise<InvestigationCase> {
  const result = await caseSnapshot(id);
  if (!result) throw new InvestigationError("Case not found.", 404);
  const first = result.snapshot.cases[0];
  const rows = result.snapshot.transactions.filter((r) => r.CASE_ID === id);
  if (
    !rows.length ||
    rows.length > 100 ||
    rows.some((r) => r.ACCOUNT_ID !== first.ACCOUNT_ID)
  )
    throw new InvestigationError("The payment source scope is invalid.", 409);
  const subject: InvestigationCase = {
    id,
    account: String(first.ACCOUNT_ID),
    currency: String(first.CURRENCY),
    traceId: result.traceId,
    payments: rows
      .map((r) => ({
        id: String(r.TRANSACTION_ID),
        amount: Number(r.AMOUNT),
        beneficiary: String(r.BENEFICIARY_ID),
        occurredAt: String(r.OCCURRED_AT),
      }))
      .sort(
        (a, b) =>
          Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
          a.id.localeCompare(b.id),
      ),
  };
  if (
    subject.payments.reduce((n, p) => n + Math.round(p.amount * 100), 0) !==
    Math.round(Number(first.AMOUNT) * 100)
  )
    throw new InvestigationError(
      "Source payments do not match the recorded case total.",
      409,
    );
  evaluateWorkspace(subject, []);
  return subject;
}
async function sourceRows(caseId: string) {
  const result = await database()
    .collection(`cases/${caseId}/source_documents`)
    .get();
  return result.docs.map((r) => ({
    ...r.data(),
    DOCUMENT_ID: r.id,
    traceId: readTrace(r),
  })) as {
    DOCUMENT_ID: string;
    document: SourceDocument;
    sha256: string;
    traceId: string;
  }[];
}

export async function sourceListings(
  caseId: string,
  received: string[] = [],
): Promise<SourceListing[]> {
  const rows = await sourceRows(caseId);
  return rows
    .sort((a, b) => a.DOCUMENT_ID.localeCompare(b.DOCUMENT_ID))
    .map((r) => ({
      id: r.DOCUMENT_ID,
      title: r.document.title,
      issuer: r.document.issuer,
      sha256: r.sha256,
      received: received.includes(r.DOCUMENT_ID),
      fields: r.document.records
        .filter((v) => v.kind === "observation")
        .map((record) => ({
          field: record.field,
          label: record.label,
          domain: record.domain,
          sources: [r.DOCUMENT_ID],
        })),
    }));
}
const workspaceRef = (caseId: string, secret: string) =>
  database().doc(`cases/${caseId}/workspaces/${hashOwner(secret)}`);

export async function readInvestigation(
  caseId: string,
  secret: string,
): Promise<InvestigationState | null> {
  if (!/^[a-f0-9]{64}$/.test(secret)) return null;
  const row = await workspaceRef(caseId, secret).get();
  if (!row.exists) return null;
  const data = row.data()!,
    state = data.state as InvestigationState;
  if (
    state.caseId !== caseId ||
    state.revision !== data.revision ||
    digest(state) !== data.sha256
  )
    throw new InvestigationError("Workspace integrity check failed.", 409);
  return state;
}

export async function createInvestigation(
  subject: InvestigationCase,
  secret: string,
): Promise<InvestigationState> {
  const evaluation = evaluateWorkspace(subject, []);
  const createdAt = new Date().toISOString();
  const state: InvestigationState = {
    id: randomUUID(),
    caseId: subject.id,
    revision: 0,
    createdAt,
    caseSnapshot: subject,
    documents: [],
    answers: [],
    history: [
      {
        id: randomUUID(),
        at: createdAt,
        event: "opened",
        detail:
          "Opened a conditional investigation. No additional source documents have been retrieved.",
        traceId: subject.traceId,
        after: evaluation.fingerprint,
        changes: [],
      },
    ],
  };
  await workspaceRef(subject.id, secret).create({
    state: clean(state),
    revision: 0,
    sha256: digest(clean(state)),
  });
  return state;
}

export async function saveInvestigation(
  before: InvestigationState,
  state: InvestigationState,
  secret: string,
) {
  state.revision = before.revision + 1;
  if (Buffer.byteLength(JSON.stringify(state)) > 900_000)
    throw new InvestigationError(
      "This workspace has reached its saved evidence size limit. Export it before starting a new investigation.",
      409,
    );
  const ref = workspaceRef(before.caseId, secret);
  await database().runTransaction(async (tx) => {
    const row = await tx.get(ref),
      data = row.data();
    if (
      !data ||
      data.state?.id !== before.id ||
      data.revision !== before.revision ||
      data.sha256 !== digest(before)
    )
      throw new InvestigationError(
        "The investigation changed in another request. Refresh before continuing.",
        409,
      );
    tx.set(ref, {
      state: clean(state),
      revision: state.revision,
      sha256: digest(clean(state)),
    });
  });
  return state;
}

export async function retrieveDocument(
  subject: InvestigationCase,
  before: InvestigationState,
  documentId: string,
  secret: string,
  upload?: unknown,
) {
  if (before.documents.some((s) => s.document.id === documentId))
    throw new InvestigationError(
      "This source document is already in the investigation.",
      409,
    );
  const source = await registeredDocument(subject, documentId);
  if (
    upload !== undefined &&
    digest(checkDocument(upload, subject)) !== source.sha256
  )
    throw new InvestigationError(
      "Document contents do not match the trusted synthetic source registry.",
      409,
    );
  const previous = evaluateWorkspace(subject, before.documents, before.plans);
  const documents = [...before.documents, source];
  const current = evaluateWorkspace(subject, documents, before.plans);
  const changes = current.branches.flatMap((branch) => {
    const old = previous.branches.find((b) => b.id === branch.id)!;
    return branch.checks
      .filter((check) => {
        const oldCheck = old.checks.find((c) => c.id === check.id);
        return (
          !oldCheck ||
          oldCheck.state !== check.state ||
          oldCheck.detail !== check.detail
        );
      })
      .map(
        (check) =>
          `${branch.title} · ${check.title}: ${check.state}. ${check.detail}`,
      );
  });
  for (const group of current.space.groups) {
    const old = previous.space.groups.find((g) => g.plan.id === group.plan.id)!;
    for (const branch of group.branches) {
      const was = old.branches.find((b) => b.id === branch.id)!;
      if (
        was.state !== branch.state ||
        was.checks[0].detail !== branch.checks[0].detail
      )
        changes.push(
          `${group.plan.label} · ${branch.title}: ${was.state} → ${branch.state}. ${branch.checks[0].detail}`,
        );
    }
  }
  const planIds = (before.plans ?? []).map((plan) => plan.id);
  const previousRun = planIds.length
    ? simulatePossibilities(
        subject,
        before.documents,
        before.plans ?? [],
        planIds,
      )
    : null;
  const currentRun = planIds.length
    ? simulatePossibilities(subject, documents, before.plans ?? [], planIds)
    : null;
  const counts = (run: ReturnType<typeof simulatePossibilities>) => ({
    compatible: run.compatible,
    incompatible: run.incompatible,
    conflicting: run.conflicting,
  });
  const next: InvestigationState = {
    ...before,
    documents,
    history: [
      ...before.history,
      {
        id: randomUUID(),
        at: source.retrievedAt,
        event: "source_received",
        detail: `Retrieved and checked ${source.document.title} against the source registry.`,
        documentId,
        traceId: source.traceId,
        before: previous.fingerprint,
        after: current.fingerprint,
        changes,
        impact: {
          approvalCoverage: {
            before: previous.receivedPaymentCount,
            after: current.receivedPaymentCount,
            total: current.paymentCount,
          },
          ...(previousRun && currentRun
            ? {
                combinations: {
                  total: currentRun.worlds.length,
                  planIds,
                  before: counts(previousRun),
                  after: counts(currentRun),
                },
              }
            : {}),
        },
      },
    ],
  };
  return saveInvestigation(before, next, secret);
}

export async function registeredDocument(
  subject: InvestigationCase,
  documentId: string,
) {
  const rows = await sourceRows(subject.id),
    row = rows.find((r) => r.DOCUMENT_ID === documentId);
  if (!row)
    throw new InvestigationError(
      "The source document was not found in the connected register.",
      404,
    );
  const document = checkDocument(row.document, subject),
    sha256 = digest(document);
  if (document.id !== documentId || sha256 !== row.sha256)
    throw new InvestigationError(
      "Document contents do not match the trusted synthetic source registry.",
      409,
    );
  return {
    document,
    sha256,
    traceId: row.traceId,
    retrievedAt: new Date().toISOString(),
  } satisfies CheckedDocument;
}

export function investigationView(
  state: InvestigationState | null,
  subject: InvestigationCase,
  sources: SourceListing[],
) {
  const evaluation = evaluateWorkspace(
    subject,
    state?.documents ?? [],
    state?.plans,
  );
  return {
    state,
    subject,
    sources,
    evaluation,
    provider: "gemini",
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    currentAnswers: (state?.answers ?? []).filter(
      (a) => a.fingerprint === evaluation.fingerprint,
    ),
  };
}

export async function verifiedState(
  subject: InvestigationCase,
  state: InvestigationState,
) {
  if (
    digest({ ...subject, traceId: null }) !==
    digest({ ...state.caseSnapshot, traceId: null })
  )
    throw new InvestigationError(
      "The case source records have changed since this investigation opened. Start a new investigation before combining them with existing evidence.",
      409,
    );
  // Re-check previously retrieved documents against today's registry; persisted
  // audit history is not treated as a substitute for a current source read.
  if (!state.documents.length) return;
  const rows = await sourceRows(subject.id);
  for (const source of state.documents) {
    const row = rows.find((r) => r.DOCUMENT_ID === source.document.id);
    if (
      !row ||
      row.sha256 !== source.sha256 ||
      digest(checkDocument(row.document, subject)) !== source.sha256
    )
      throw new InvestigationError(
        "Previously retrieved evidence has changed or is unavailable. Review its provenance before continuing.",
        409,
      );
  }
}

export type InvestigationView = ReturnType<typeof investigationView>;

export function evidenceCatalog(sources: SourceListing[]): EvidenceField[] {
  const catalog = new Map<string, EvidenceField>();
  for (const source of sources)
    for (const field of source.fields) {
      const old = catalog.get(field.field);
      if (
        old &&
        digest([...old.domain].sort()) !== digest([...field.domain].sort())
      )
        throw new InvestigationError(
          "Source field definitions disagree. Resolve the source register before generating possibilities.",
          409,
        );
      catalog.set(field.field, {
        ...field,
        sources: [...new Set([...(old?.sources ?? []), ...field.sources])],
      });
    }
  return [...catalog.values()];
}
export async function runSimulation(
  subject: InvestigationCase,
  before: InvestigationState,
  secret: string,
  planIds: string[],
) {
  if ((before.simulations?.length ?? 0) >= 12)
    throw new InvestigationError(
      "This workspace has reached its 12 saved simulation limit.",
      429,
    );
  const run: Simulation = {
    ...simulatePossibilities(
      subject,
      before.documents,
      before.plans ?? [],
      planIds,
    ),
    id: randomUUID(),
    at: new Date().toISOString(),
  };
  return saveInvestigation(
    before,
    {
      ...before,
      simulations: [...(before.simulations ?? []), run],
      history: [
        ...before.history,
        {
          id: randomUUID(),
          at: run.at,
          event: "simulation_run",
          simulationId: run.id,
          detail: `Executed ${run.worlds.length} conditional combinations: ${run.compatible} source-compatible, ${run.incompatible} incompatible, ${run.conflicting} conflicting.`,
          after: run.fingerprint,
          changes: [],
        },
      ],
    },
    secret,
  );
}

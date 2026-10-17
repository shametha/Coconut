import { createHash } from "node:crypto";

export const REVIEW_VERSION = "authorization-review-1";
export const hypothesisIds = ["customer", "delegate", "unauthorized"] as const;
export type HypothesisId = (typeof hypothesisIds)[number];
export type CheckState = "passed" | "failed" | "unresolved" | "conflicting";
export type BranchState =
  "possible" | "supported" | "contradicted" | "conflicting";
export type Payment = {
  id: string;
  amount: number;
  beneficiary: string;
  occurredAt: string;
};
export type InvestigationCase = {
  id: string;
  account: string;
  currency: string;
  payments: Payment[];
  traceId: string;
};
type RecordBase = { id: string; account: string };
export type Approval = RecordBase & {
  kind: "approval";
  paymentId: string;
  actor: string;
  role: "customer" | "delegate";
  approvedAt: string;
  amount: number;
  beneficiary: string;
  currency: string;
};
export type Delegation = RecordBase & {
  kind: "delegation";
  actor: string;
  validFrom: string;
  validUntil: string;
  beneficiaries: string[];
  currency: string;
  perPaymentLimit: number;
  caseTotalLimit: number;
};
export type CustomerStatement = RecordBase & {
  kind: "customer_statement";
  paymentIds: string[];
  directApproval: "confirms" | "denies" | "unknown";
  delegatedAuthority: "confirms" | "denies" | "unknown";
  reportedAt: string;
};
export type Observation = RecordBase & {
  kind: "observation";
  field: string;
  label: string;
  value: string;
  domain: string[];
  paymentIds: string[];
  basis: "system_record" | "party_statement";
  recordedAt: string;
};
export type SourceRecord =
  Approval | Delegation | CustomerStatement | Observation;
export type SourceDocument = {
  id: string;
  caseId: string;
  title: string;
  issuer: string;
  synthetic: true;
  procedure: typeof REVIEW_VERSION;
  coverage: { approvalPaymentIds: string[]; complete: boolean };
  records: SourceRecord[];
};
export type CheckedDocument = {
  document: SourceDocument;
  sha256: string;
  traceId: string;
  retrievedAt: string;
};
export type InvestigationCheck = {
  id: string;
  title: string;
  state: CheckState;
  detail: string;
  references: string[];
  assumption?: string;
};
export type Branch = {
  id: HypothesisId;
  title: string;
  assumption: string;
  state: BranchState;
  checks: InvestigationCheck[];
  nextStep: string;
};
export type EvidenceRequest = {
  id: string;
  title: string;
  source: string;
  reason: string;
  helps: HypothesisId[];
};
export type Evaluation = {
  caseId: string;
  fingerprint: string;
  procedure: string;
  total: number;
  paymentCount: number;
  branches: Branch[];
  requests: EvidenceRequest[];
  conflicts: string[];
  caveats: string[];
  completeApprovals: boolean;
  receivedPaymentCount: number;
  facts: {
    id: string;
    text: string;
    references: string[];
    hypothesis?: HypothesisId;
  }[];
};
export class InvestigationError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export const digest = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
const time = (value: unknown) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
    value,
  ) &&
  Number.isFinite(Date.parse(value));
const text = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 240;
const amount = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  Number.isSafeInteger(Math.round(value * 100));
const arrayOfText = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= 100 &&
  value.every(text) &&
  new Set(value).size === value.length;

/** Validates document semantics; trust is established separately against the source registry. */
export function checkDocument(
  value: unknown,
  subject: InvestigationCase,
): SourceDocument {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InvestigationError("The source document must be an object.");
  const d = value as SourceDocument;
  if (
    !text(d.id) ||
    !text(d.title) ||
    !text(d.issuer) ||
    d.caseId !== subject.id ||
    d.synthetic !== true ||
    d.procedure !== REVIEW_VERSION ||
    !d.coverage ||
    !arrayOfText(d.coverage.approvalPaymentIds) ||
    typeof d.coverage.complete !== "boolean" ||
    !Array.isArray(d.records) ||
    d.records.length > 100
  )
    throw new InvestigationError(
      "The document does not match this case or the supported synthetic source contract.",
    );
  const payments = new Map(subject.payments.map((p) => [p.id, p]));
  if (d.coverage.approvalPaymentIds.some((id) => !payments.has(id)))
    throw new InvestigationError(
      "Source coverage includes a payment outside this case.",
    );
  const recordIds = new Set<string>();
  for (const record of d.records) {
    if (
      !record ||
      !text(record.id) ||
      recordIds.has(record.id) ||
      record.account !== subject.account
    )
      throw new InvestigationError(
        "Source record identity or account scope is invalid.",
      );
    recordIds.add(record.id);
    if (record.kind === "approval") {
      const p = payments.get(record.paymentId);
      if (
        !p ||
        !text(record.actor) ||
        !["customer", "delegate"].includes(record.role) ||
        !time(record.approvedAt) ||
        Date.parse(record.approvedAt) > Date.parse(p.occurredAt) ||
        record.currency !== subject.currency ||
        !amount(record.amount) ||
        Math.round(record.amount * 100) !== Math.round(p.amount * 100) ||
        record.beneficiary !== p.beneficiary ||
        !d.coverage.approvalPaymentIds.includes(record.paymentId)
      )
        throw new InvestigationError(
          "An approval does not match the payment amount, beneficiary, time or source coverage.",
        );
    } else if (record.kind === "delegation") {
      if (
        !text(record.actor) ||
        !time(record.validFrom) ||
        !time(record.validUntil) ||
        Date.parse(record.validFrom) > Date.parse(record.validUntil) ||
        !arrayOfText(record.beneficiaries) ||
        !record.beneficiaries.length ||
        record.currency !== subject.currency ||
        !amount(record.perPaymentLimit) ||
        !amount(record.caseTotalLimit)
      )
        throw new InvestigationError(
          "Delegation dates, limits or scope are invalid.",
        );
    } else if (record.kind === "customer_statement") {
      if (
        !arrayOfText(record.paymentIds) ||
        !record.paymentIds.length ||
        record.paymentIds.some((id) => !payments.has(id)) ||
        !["confirms", "denies", "unknown"].includes(record.directApproval) ||
        !["confirms", "denies", "unknown"].includes(
          record.delegatedAuthority,
        ) ||
        !time(record.reportedAt)
      )
        throw new InvestigationError("Customer statement scope is invalid.");
    } else if (record.kind === "observation") {
      if (
        !/^[a-z][a-z0-9_]{0,39}\.[a-z][a-z0-9_]{0,59}$/.test(record.field) ||
        !text(record.label) ||
        !text(record.value) ||
        !arrayOfText(record.domain) ||
        record.domain.length < 2 ||
        record.domain.length > 6 ||
        !record.domain.includes(record.value) ||
        record.domain.includes("__other__") ||
        !arrayOfText(record.paymentIds) ||
        !record.paymentIds.length ||
        record.paymentIds.some((id) => !payments.has(id)) ||
        !["system_record", "party_statement"].includes(record.basis) ||
        !time(record.recordedAt)
      )
        throw new InvestigationError(
          "Evidence observation field, value or payment scope is invalid.",
        );
    } else throw new InvestigationError("Unsupported source record type.");
  }
  return d;
}

export function evaluateInvestigation(
  subject: InvestigationCase,
  documents: CheckedDocument[],
): Evaluation {
  if (
    !subject.payments.length ||
    subject.payments.length > 100 ||
    new Set(subject.payments.map((p) => p.id)).size !==
      subject.payments.length ||
    subject.payments.some((p) => !amount(p.amount) || !time(p.occurredAt))
  )
    throw new InvestigationError("Verified case payments are required.", 409);
  const checked = documents.map((source) => {
    const document = checkDocument(source.document, subject);
    if (
      source.sha256 !== digest(document) ||
      !source.traceId ||
      !time(source.retrievedAt)
    )
      throw new InvestigationError("Source verification is incomplete.", 409);
    return { ...source, document };
  });
  const references = new Map<string, SourceRecord>();
  for (const { document } of checked)
    for (const record of document.records) {
      const old = references.get(record.id);
      if (old && canonical(old) !== canonical(record))
        throw new InvestigationError(
          "A source record ID has conflicting contents.",
          409,
        );
      references.set(record.id, record);
    }
  const records = [...references.values()];
  const approvals = records.filter((r): r is Approval => r.kind === "approval");
  const delegations = records.filter(
    (r): r is Delegation => r.kind === "delegation",
  );
  const statements = records.filter(
    (r): r is CustomerStatement => r.kind === "customer_statement",
  );
  const totalCents = subject.payments.reduce(
    (n, p) => n + Math.round(p.amount * 100),
    0,
  );
  if (!Number.isSafeInteger(totalCents))
    throw new InvestigationError(
      "Case amount is outside the supported range.",
      409,
    );
  const total = totalCents / 100;
  const covered = new Set(
    checked
      .filter((s) => s.document.coverage.complete)
      .flatMap((s) => s.document.coverage.approvalPaymentIds),
  );
  const completeApprovals = subject.payments.every((p) => covered.has(p.id));
  const receivedPaymentCount = subject.payments.filter((p) =>
    approvals.some((a) => a.paymentId === p.id),
  ).length;
  const customerAll = subject.payments.every((p) =>
    approvals.some((a) => a.paymentId === p.id && a.role === "customer"),
  );
  const delegateAll = subject.payments.every((p) =>
    approvals.some((a) => a.paymentId === p.id && a.role === "delegate"),
  );
  const conflicts: string[] = [];
  for (const p of subject.payments) {
    const paymentApprovals = approvals.filter((a) => a.paymentId === p.id);
    if (new Set(paymentApprovals.map((a) => `${a.role}:${a.actor}`)).size > 1)
      conflicts.push(
        `${p.id}: source records disagree about the primary approval actor.`,
      );
    if (
      paymentApprovals.some((a) => a.role === "customer") &&
      statements.some(
        (s) => s.paymentIds.includes(p.id) && s.directApproval === "denies",
      )
    )
      conflicts.push(
        `${p.id}: a customer denial conflicts with a recorded customer approval.`,
      );
  }
  const check = (
    id: string,
    title: string,
    state: CheckState,
    detail: string,
    refs: string[] = [],
    assumption?: string,
  ): InvestigationCheck => ({
    id,
    title,
    state,
    detail,
    references: [...new Set(refs)],
    ...(assumption ? { assumption } : {}),
  });
  const coverageCheck = check(
    "coverage",
    "Check approval coverage",
    completeApprovals ? "passed" : "unresolved",
    completeApprovals
      ? "Retrieved source coverage includes every case payment. This describes source coverage, not proof of customer consent."
      : `Approval records have been retrieved for ${receivedPaymentCount} of ${subject.payments.length} payments. Unretrieved records remain unknown.`,
    approvals.map((a) => a.id),
  );
  const customerChecks = [
    coverageCheck,
    check(
      "customer_actor",
      "Match the customer approval",
      conflicts.some(
        (c) => c.includes("primary approval") || c.includes("customer denial"),
      )
        ? "conflicting"
        : customerAll
          ? "passed"
          : completeApprovals && !customerAll
            ? "failed"
            : "unresolved",
      customerAll
        ? "Every payment has a matching recorded customer approval. Payment purpose and possible deception still require review."
        : "A direct customer approval for every payment has not been established.",
      approvals.filter((a) => a.role === "customer").map((a) => a.id),
      "The customer directly approved all case payments.",
    ),
  ];

  const delegateChecks: InvestigationCheck[] = [
    coverageCheck,
    check(
      "delegate_actor",
      "Identify the delegate",
      delegateAll ? "passed" : completeApprovals ? "failed" : "unresolved",
      delegateAll
        ? "Each payment has a matching delegate approval record."
        : "Delegate approval has not been established for every payment.",
      approvals.filter((a) => a.role === "delegate").map((a) => a.id),
      "A delegate approved the case payments.",
    ),
  ];
  for (const p of subject.payments) {
    const observed = approvals.filter(
      (a) => a.paymentId === p.id && a.role === "delegate",
    );
    const mandates = delegations.filter((d) =>
      observed.some((a) => a.actor === d.actor),
    );
    const pass = mandates.filter(
      (d) =>
        Date.parse(d.validFrom) <= Date.parse(p.occurredAt) &&
        Date.parse(d.validUntil) >= Date.parse(p.occurredAt) &&
        d.beneficiaries.includes(p.beneficiary) &&
        Math.round(d.perPaymentLimit * 100) >= Math.round(p.amount * 100),
    );
    delegateChecks.push(
      check(
        `mandate_${p.id}`,
        `Check authority for ${p.id}`,
        !observed.length || !mandates.length
          ? "unresolved"
          : pass.length
            ? "passed"
            : "failed",
        !observed.length
          ? "Retrieve the approval actor before matching a delegation."
          : !mandates.length
            ? "The matching delegation record has not been retrieved."
            : pass.length
              ? "A matching delegation covers this payment's time, beneficiary, currency and individual amount."
              : "The available delegation does not cover this payment's time, beneficiary or individual amount.",
        [...observed, ...mandates].map((r) => r.id),
        "The recorded delegate acted under a valid delegation.",
      ),
    );
  }
  const delegateActors = [
    ...new Set(
      approvals.filter((a) => a.role === "delegate").map((a) => a.actor),
    ),
  ];
  for (const actor of delegateActors) {
    const actorPayments = subject.payments.filter((p) =>
      approvals.some(
        (a) =>
          a.paymentId === p.id && a.role === "delegate" && a.actor === actor,
      ),
    );
    const subtotal = actorPayments.reduce(
      (n, p) => n + Math.round(p.amount * 100),
      0,
    );
    const mandates = delegations.filter(
      (d) =>
        d.actor === actor &&
        actorPayments.every(
          (p) =>
            Date.parse(d.validFrom) <= Date.parse(p.occurredAt) &&
            Date.parse(d.validUntil) >= Date.parse(p.occurredAt) &&
            d.beneficiaries.includes(p.beneficiary),
        ),
    );
    const ambiguousMandate =
      new Set(mandates.map((d) => digest({ ...d, id: undefined }))).size > 1;
    if (ambiguousMandate)
      conflicts.push(
        `Overlapping delegation records for ${actor} disagree about the applicable authority. Resolve which mandate governs before accepting a limit.`,
      );
    const limit = mandates.length
      ? Math.max(...mandates.map((d) => Math.round(d.caseTotalLimit * 100)))
      : null;
    delegateChecks.push(
      check(
        `batch_${actor}`,
        "Check the combined payment limit",
        ambiguousMandate
          ? "conflicting"
          : limit === null
            ? "unresolved"
            : subtotal <= limit
              ? "passed"
              : "failed",
        ambiguousMandate
          ? "Overlapping mandates have different terms. Verify which authority applies before accepting an amount limit."
          : limit === null
            ? "A delegation covering this actor and payment set is still required."
            : `${money(subtotal / 100, subject.currency)} in recorded approvals is ${subtotal <= limit ? "within" : "above"} the delegation's ${money(limit / 100, subject.currency)} case-batch limit. This is a synthetic internal procedure, not a regulatory threshold.`,
        mandates.map((d) => d.id),
        "The recorded delegate approved these case payments.",
      ),
    );
    if (
      mandates.length &&
      statements.some(
        (s) =>
          s.delegatedAuthority === "denies" &&
          s.paymentIds.some((id) => actorPayments.some((p) => p.id === id)),
      )
    )
      conflicts.push(
        "A customer statement disputes the delegated authority recorded in the mandate.",
      );
  }
  if (conflicts.length)
    delegateChecks.push(
      check(
        "source_conflicts",
        "Resolve disputed evidence",
        "conflicting",
        "Source records disagree. Keep the authorization question open and verify record integrity and coverage.",
        statements.map((s) => s.id),
      ),
    );
  const allDelegationPass =
    delegateAll && delegateChecks.every((c) => c.state === "passed");
  const customerBasisEstablished = customerAll && completeApprovals;
  const denialStatements = statements.filter(
    (s) => s.directApproval === "denies" || s.delegatedAuthority === "denies",
  );
  const unauthorizedChecks = [
    check(
      "absence",
      "Distinguish missing from absent",
      "unresolved",
      "An unavailable approval record does not establish unauthorized activity. Source completeness and any customer denial need independent review.",
      denialStatements.map((s) => s.id),
    ),
    check(
      "valid_authority",
      "Look for a valid authorization basis",
      conflicts.length
        ? "conflicting"
        : customerBasisEstablished || allDelegationPass
          ? "passed"
          : "unresolved",
      conflicts.length
        ? "Conflicting records prevent a reliable authorization conclusion."
        : customerBasisEstablished || allDelegationPass
          ? "A recorded authorization basis covers the case payments under the reviewed procedure. This does not establish a legitimate payment purpose."
          : "A valid authorization basis has not been established for every payment. Investigate the gap without treating it as proof of fraud.",
      approvals.map((a) => a.id),
    ),
  ];
  const stateOf = (checks: InvestigationCheck[]): BranchState =>
    checks.some((c) => c.state === "conflicting")
      ? "conflicting"
      : checks.some((c) => c.state === "failed")
        ? "contradicted"
        : checks.every((c) => c.state === "passed")
          ? "supported"
          : "possible";
  const branches: Branch[] = [
    {
      id: "customer",
      title: "Direct customer approval",
      assumption: "The customer directly approved all payments in this case.",
      state: stateOf(customerChecks),
      checks: customerChecks,
      nextStep:
        "Match transaction-bound approval records, then continue reviewing payment purpose and beneficiary. Customer approval does not clear the case.",
    },
    {
      id: "delegate",
      title: "Approval through a delegate",
      assumption:
        "A delegate approved the case payments under a valid, applicable authority.",
      state: stateOf(delegateChecks),
      checks: delegateChecks,
      nextStep:
        "Match the approval actor to the delegation and examine its dates, beneficiary scope, individual limits and combined payment limit.",
    },
    {
      id: "unauthorized",
      title: "Possible lack of authorization",
      assumption:
        "One or more payments lacked valid customer or delegated authorization.",
      state: conflicts.length
        ? "conflicting"
        : customerBasisEstablished || allDelegationPass
          ? "contradicted"
          : "possible",
      checks: unauthorizedChecks,
      nextStep:
        "Verify source coverage and customer statements, preserve relevant access records, and route disputed authorization for human review.",
    },
  ];
  const requests: EvidenceRequest[] = [];
  if (!completeApprovals || receivedPaymentCount < subject.payments.length)
    requests.push({
      id: "approval_records",
      title: "Retrieve transaction-bound approval records",
      source: "Payment approval register",
      reason:
        "This can identify the primary approval actor and distinguish direct from delegated approval. Verify completeness before interpreting an empty response.",
      helps: [...hypothesisIds],
    });
  if (
    delegateChecks.some(
      (c) => c.id.startsWith("mandate_") && c.state !== "passed",
    ) &&
    approvals.some((a) => a.role === "delegate")
  )
    requests.push({
      id: "delegation_records",
      title: "Retrieve the delegate's authority and limits",
      source: "Delegation register",
      reason:
        "Delegate identity alone does not establish permission. The mandate can resolve scope, effective dates and amount limits.",
      helps: ["delegate", "unauthorized"],
    });
  if (
    delegateChecks.some(
      (c) => c.id.startsWith("batch_") && c.state === "failed",
    )
  )
    requests.push({
      id: "authority_exception",
      title: "Check for an applicable authority exception",
      source: "Delegation register and approval exception records",
      reason:
        "The recorded approvals exceed the available combined payment limit. Determine whether a valid exception applies, and refer the unexplained excess for human review.",
      helps: ["delegate", "unauthorized"],
    });
  if (conflicts.length)
    requests.unshift({
      id: "resolve_conflict",
      title: "Reconcile the conflicting source records",
      source: "Approval register and independently verified customer contact",
      reason:
        "The records disagree; additional summary calculations cannot settle that disagreement. Check record scope, integrity and the disputed statement.",
      helps: [...hypothesisIds],
    });
  if (!requests.length)
    requests.push({
      id: "purpose_review",
      title: "Review payment purpose and beneficiary",
      source: "Supporting documents and beneficiary records",
      reason:
        "Authorization checks do not establish a legitimate payment purpose or exclude deception. Continue the wider investigation.",
      helps: [...hypothesisIds],
    });
  const caveats = [
    "All cases, documents and procedures in this workspace are synthetic.",
    "These are conditional explanations under a reviewed internal procedure. They do not establish fraud or innocence.",
    "Other explanations and mixed authorization across payments may remain; these three batch-wide hypotheses are not a complete model of reality.",
    "A source check establishes record provenance and scope, not that every assertion in the record is true.",
  ];
  const facts: Evaluation["facts"] = [
    {
      id: "movement",
      text: `${subject.payments.length} recorded payments total ${money(total, subject.currency)}. Their authorization must be evaluated separately.`,
      references: subject.payments.map((p) => p.id),
    },
  ];
  for (const branch of branches) {
    facts.push({
      id: `hypothesis:${branch.id}`,
      text: `Hypothesis only: ${branch.assumption} Current evidence state: ${branch.state}. Next: ${branch.nextStep}`,
      references: [],
      hypothesis: branch.id,
    });
    for (const c of branch.checks)
      facts.push({
        id: `${branch.id}:${c.id}`,
        text: `${c.assumption ? `If ${c.assumption.charAt(0).toLowerCase() + c.assumption.slice(1).replace(/\.$/, "")}: ` : ""}${c.detail}`,
        references: c.references,
        hypothesis: branch.id,
      });
  }
  facts.push({
    id: "limits",
    text: caveats.slice(1).join(" "),
    references: [],
  });
  return {
    caseId: subject.id,
    fingerprint: digest({
      subject: { ...subject, traceId: undefined },
      sources: checked.map((s) => s.sha256).sort(),
      procedure: REVIEW_VERSION,
    }),
    procedure: REVIEW_VERSION,
    total,
    paymentCount: subject.payments.length,
    branches,
    requests,
    conflicts: [...new Set(conflicts)],
    caveats,
    completeApprovals,
    receivedPaymentCount,
    facts,
  };
}

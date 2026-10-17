import type { CaseData } from "./case";
import type { AiRun } from "./ai-contract";
import type {
  InvestigationState,
  InvestigationView,
} from "./investigation-store";
import { readableValue, sourceRecordFields } from "./source-presentation.ts";

const date = (value: string) =>
  new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) +
  " IST";

export function investigationEventTitle(
  event: InvestigationState["history"][number],
  state: InvestigationState,
) {
  switch (event.event) {
    case "opened":
      return "Investigation opened";
    case "source_received":
      return `Source retrieved: ${state.documents.find((d) => d.document.id === event.documentId)?.document.title ?? "Case record"}`;
    case "possibilities_generated":
      return `Unknown added: ${state.plans?.find((p) => p.id === event.planId)?.label ?? "Missing information"}`;
    case "simulation_run":
      return "Combinations checked against the available evidence";
    case "question_answered":
      return "Investigation question answered";
    case "question_failed":
      return "Investigation question could not be completed";
  }
}

/** Export only reviewable case content. Storage and model diagnostics remain internal. */
export function evidenceSummary(caseFile: CaseData) {
  return [
    `# Coconut · ${caseFile.id}`,
    "Synthetic case · Evidence summary · For human review",
    `## ${caseFile.title}`,
    `${caseFile.customer} · Account ${caseFile.account}`,
    caseFile.summary,
    "## Recorded payments",
    ...caseFile.transfers.map(
      (p) =>
        `- ${p.id}: ${p.amount} ${caseFile.currency} to ${p.to} · ${p.time}`,
    ),
    "## Evidence",
    ...caseFile.evidence.flatMap((e) => [
      `### ${e.title}`,
      e.summary,
      `Observed: ${date(e.observedAt)}`,
      e.verified ? "Source check passed." : "Source review pending.",
    ]),
    `## ${caseFile.policy.title} · §${caseFile.policy.section}`,
    caseFile.policy.passage,
    "Linked evidence does not establish fraud or innocence. No final investigator decision is recorded.",
  ].join("\n\n");
}

export function citedDraft(run: AiRun) {
  return [
    `# Coconut · ${run.caseId} · Draft for review`,
    "Synthetic case · Powered by Gemini · No final investigator decision",
    `Prepared: ${date(run.createdAt)}`,
    ...run.facts.map(
      (f) =>
        `${f.text}\n\nSources: ${[...new Set(f.citations.map((c) => c.title))].join("; ")}`,
    ),
    "Review the activity, policy and available counter-evidence before recording a disposition.",
  ].join("\n\n");
}

export function investigationReport(view: InvestigationView) {
  const state = view.state;
  if (!state) throw new Error("Open the investigation before exporting it.");
  return [
    `# Coconut · ${view.subject.id} · Conditional investigation`,
    "Synthetic case · Powered by Gemini · For human review",
    "These explanations describe possibilities, not probabilities or findings of wrongdoing.",
    "## Recorded payments",
    ...view.subject.payments.map(
      (p) =>
        `- ${p.id}: ${p.amount} ${view.subject.currency} to ${p.beneficiary} · ${date(p.occurredAt)}`,
    ),
    "## Unknowns and conditional trails",
    ...view.evaluation.space.groups.flatMap((g) => [
      `### ${g.plan.label}`,
      ...g.branches.flatMap((b) => [
        `#### ${b.title}`,
        `Evidence result: ${b.state}`,
        `Assumption: ${g.plan.label}: ${b.value === "__other__" ? "another or mixed explanation applies" : readableValue(b.value)}.`,
        ...b.steps.map(
          (s, i) =>
            `${i + 1}. ${s.action}\n   Evidence to obtain: ${s.evidence}`,
        ),
        ...b.checks.map((c) => `${c.title}: ${c.state}. ${c.detail}`),
      ]),
    ]),
    "## Retrieved sources",
    ...state.documents.flatMap(({ document }) => [
      `### ${document.title}`,
      `Issuer: ${document.issuer}`,
      ...document.records.flatMap((r) =>
        sourceRecordFields(r).map((f) => `${f.label}: ${f.value}`),
      ),
    ]),
    "## Authorization review",
    ...view.evaluation.branches.flatMap((b) => [
      `### ${b.title} · ${b.state}`,
      ...b.checks.map((c) => `${c.title}: ${c.state}. ${c.detail}`),
    ]),
    "## Unresolved conflicts",
    ...view.evaluation.conflicts,
    "## Investigation history",
    ...state.history.map(
      (e) => `- ${date(e.at)} · ${investigationEventTitle(e, state)}`,
    ),
    "## Answers",
    ...state.answers.flatMap((a) => [
      `### ${a.question}`,
      ...a.paragraphs.map((p) => p.text),
      a.fingerprint === view.evaluation.fingerprint
        ? "Based on the current evidence."
        : "Earlier evidence snapshot; review against the current records.",
    ]),
    "Source consistency does not establish authorization, intent or wrongdoing. A human investigator must review the evidence and resolve conflicts.",
  ].join("\n\n");
}

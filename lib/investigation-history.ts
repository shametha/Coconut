import type { InvestigationState } from "./investigation-store";
import { investigationEventTitle } from "./customer-reports.ts";
import { InvestigationError, type CheckedDocument } from "./investigation.ts";
import {
  evaluateWorkspace,
  simulatePossibilities,
  type PossibilityPlan,
} from "./possibility-space.ts";

type Counts = {
  total: number;
  compatible: number;
  incompatible: number;
  conflicting: number;
};
export type InvestigationFrame = {
  id: string;
  at: string;
  event: "opened" | "possibilities_generated" | "source_received";
  label: string;
  detail: string;
  documentId?: string;
  planId?: string;
  documentIds: string[];
  planIds: string[];
  space: ReturnType<typeof evaluateWorkspace>["space"];
  counts: Counts | null;
  beforeCounts: Counts | null;
  authorization: { id: string; title: string; state: string }[];
  conflicts: string[];
  fingerprint: string;
};
export type InvestigationHistory = {
  workspaceId: string;
  revision: number;
  frames: InvestigationFrame[];
};

/** Recompute each snapshot in event order. Future sources and proposals are excluded. */
export function investigationHistory(
  state: InvestigationState,
): InvestigationHistory {
  const documents: CheckedDocument[] = [],
    plans: PossibilityPlan[] = [];
  const frames: InvestigationFrame[] = [];
  let previous = evaluateWorkspace(state.caseSnapshot, documents, plans);
  const counts = (): Counts | null => {
    if (!plans.length) return null;
    const run = simulatePossibilities(
      state.caseSnapshot,
      documents,
      plans,
      plans.map((p) => p.id),
    );
    return {
      total: run.worlds.length,
      compatible: run.compatible,
      incompatible: run.incompatible,
      conflicting: run.conflicting,
    };
  };
  for (const event of state.history) {
    const beforeCounts = counts();
    if (event.before && event.before !== previous.fingerprint)
      throw new InvestigationError(
        "The recorded history has an inconsistent starting snapshot.",
        409,
      );
    if (event.event === "source_received") {
      const source = state.documents.find(
        (d) => d.document.id === event.documentId,
      );
      if (!source || documents.some((d) => d.document.id === event.documentId))
        throw new InvestigationError(
          "The recorded history has a missing or repeated source.",
          409,
        );
      documents.push(source);
    }
    if (event.event === "possibilities_generated") {
      const plan = state.plans?.find((p) => p.id === event.planId);
      if (!plan || plans.some((p) => p.id === event.planId))
        throw new InvestigationError(
          "The recorded history has a missing or repeated proposal.",
          409,
        );
      plans.push(plan);
    }
    const current = evaluateWorkspace(state.caseSnapshot, documents, plans);
    if (event.after !== current.fingerprint)
      throw new InvestigationError(
        "The recorded investigation snapshot could not be reproduced.",
        409,
      );
    if (
      event.event === "opened" ||
      event.event === "source_received" ||
      event.event === "possibilities_generated"
    ) {
      frames.push({
        id: event.id,
        at: event.at,
        event: event.event,
        label:
          event.event === "opened"
            ? "Case opened"
            : event.event === "source_received"
              ? "Source retrieved"
              : "Unknown added",
        detail: investigationEventTitle(event, state),
        ...(event.documentId ? { documentId: event.documentId } : {}),
        ...(event.planId ? { planId: event.planId } : {}),
        documentIds: documents.map((d) => d.document.id),
        planIds: plans.map((p) => p.id),
        space: current.space,
        counts: counts(),
        // Comparisons are meaningful only when the same hypotheses exist on both sides.
        beforeCounts: event.event === "source_received" ? beforeCounts : null,
        authorization: current.branches.map(({ id, title, state }) => ({
          id,
          title,
          state,
        })),
        conflicts: current.conflicts,
        fingerprint: current.fingerprint,
      });
    }
    previous = current;
  }
  if (
    documents.length !== state.documents.length ||
    plans.length !== (state.plans?.length ?? 0) ||
    !frames.length
  )
    throw new InvestigationError(
      "The recorded history does not cover this workspace.",
      409,
    );
  return { workspaceId: state.id, revision: state.revision, frames };
}

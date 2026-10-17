"use client";

import type { InvestigationView } from "@/lib/investigation-store";
import { sourceRecordFields } from "@/lib/source-presentation";
import { useCaseWorkspace } from "./case-workspace";
import { ActionArrow } from "./action-arrow";
import styles from "./investigation-trails.module.css";

export function InvestigationReferences({
  view,
  ids,
  buttonLabel,
}: {
  view: InvestigationView;
  ids: string[];
  buttonLabel?: string;
}) {
  const { openEvidence } = useCaseWorkspace();
  if (!ids.length) return null;
  return (
    <span className={styles.referenceLinks}>
      {!buttonLabel && <>Records: </>}
      {ids.map((id) => {
        const source = view.state?.documents.find((d) =>
          d.document.records.some((r) => r.id === id),
        );
        const payment = view.subject.payments.find((p) => p.id === id);
        const record = source?.document.records.find((r) => r.id === id);
        if (!source && !payment)
          return <span key={id}>Source unavailable</span>;
        return (
          <button
            key={id}
            type="button"
            title={source?.document.title ?? payment?.id}
            onClick={() =>
              openEvidence({
                id,
                title: source?.document.title ?? "Recorded case payment",
                summary: source
                  ? "This source is linked to the case payments. Review its scope and any conflicting records."
                  : `${payment!.amount} ${view.subject.currency} to ${payment!.beneficiary}. Payment records establish movement, not customer authorization.`,
                source: source
                  ? "firestore/source_documents"
                  : "firestore/transactions",
                sourceRecord: source ? `${source.document.id} / ${id}` : id,
                traceId: source?.traceId ?? view.subject.traceId,
                observedAt: source?.retrievedAt ?? payment!.occurredAt,
                verified: true,
                issuer: source?.document.issuer,
                ...(record ? { recordFields: sourceRecordFields(record) } : {}),
              })
            }
          >
            {buttonLabel ?? source?.document.title ?? payment?.id}
            {buttonLabel && <ActionArrow />}
          </button>
        );
      })}
    </span>
  );
}

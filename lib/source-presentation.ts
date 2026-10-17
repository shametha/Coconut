import type { SourceRecord } from "./investigation";
export type RecordField = { label: string; value: string };
export const readableValue = (value: string) =>
  value.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
const date = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }) + " IST";
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
export function sourceRecordFields(record: SourceRecord): RecordField[] {
  if (record.kind === "observation")
    return [
      { label: "Assertion", value: readableValue(record.value) },
      {
        label: "Scope",
        value: `${record.paymentIds.length} payment${record.paymentIds.length === 1 ? "" : "s"} · ${record.paymentIds.join(", ")}`,
      },
      { label: "Basis", value: readableValue(record.basis) },
      { label: "Recorded", value: date(record.recordedAt) },
    ];
  if (record.kind === "approval")
    return [
      { label: "Payment", value: record.paymentId },
      { label: "Approval actor", value: record.actor },
      { label: "Recorded role", value: readableValue(record.role) },
      { label: "Amount", value: money(record.amount, record.currency) },
      { label: "Beneficiary", value: record.beneficiary },
      { label: "Approved", value: date(record.approvedAt) },
    ];
  if (record.kind === "delegation")
    return [
      { label: "Delegate", value: record.actor },
      {
        label: "Individual limit",
        value: money(record.perPaymentLimit, record.currency),
      },
      {
        label: "Case-batch limit",
        value: money(record.caseTotalLimit, record.currency),
      },
      { label: "Beneficiaries", value: record.beneficiaries.join(", ") },
      { label: "Valid from", value: date(record.validFrom) },
      { label: "Valid until", value: date(record.validUntil) },
    ];
  return [
    { label: "Direct approval", value: readableValue(record.directApproval) },
    {
      label: "Delegated authority",
      value: readableValue(record.delegatedAuthority),
    },
    { label: "Scope", value: record.paymentIds.join(", ") },
    { label: "Reported", value: date(record.reportedAt) },
  ];
}

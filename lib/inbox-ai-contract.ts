import type { JSONSchema7 } from "ai";
import type { CaseSummary } from "./case.ts";
import type { AiFact, AiRun } from "./ai-contract.ts";

export type InboxPlan = {
  action:
    | "list"
    | "compare"
    | "count"
    | "total"
    | "case_detail"
    | "missing_data"
    | "out_of_scope"
    | "clarification";
  case_ids: string[];
  metric: "all" | "risk" | "amount";
  minimum: number;
  maximum: number;
  sort: "risk" | "amount" | "case";
  limit: number;
  search: string;
};
export type InboxRun = AiRun & { scope: "inbox"; plan: InboxPlan };
const actions = [
  "list",
  "compare",
  "count",
  "total",
  "case_detail",
  "missing_data",
  "out_of_scope",
  "clarification",
];
const keys = [
  "action",
  "case_ids",
  "metric",
  "minimum",
  "maximum",
  "sort",
  "limit",
  "search",
];
export function validateInboxPlan(
  value: unknown,
  cases: readonly CaseSummary[],
): InboxPlan {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid inbox selection");
  const p = value as Record<string, unknown>;
  if (
    Object.keys(p).length !== keys.length ||
    Object.keys(p).some((key) => !keys.includes(key)) ||
    !actions.includes(String(p.action)) ||
    !["all", "risk", "amount"].includes(String(p.metric)) ||
    !["risk", "amount", "case"].includes(String(p.sort)) ||
    !Array.isArray(p.case_ids) ||
    p.case_ids.length > 10 ||
    p.case_ids.some(
      (id) => typeof id !== "string" || !cases.some((c) => c.id === id),
    ) ||
    new Set(p.case_ids).size !== p.case_ids.length ||
    typeof p.minimum !== "number" ||
    !Number.isFinite(p.minimum) ||
    p.minimum < 0 ||
    typeof p.maximum !== "number" ||
    !Number.isFinite(p.maximum) ||
    p.maximum < p.minimum ||
    typeof p.limit !== "number" ||
    !Number.isInteger(p.limit) ||
    p.limit < 1 ||
    p.limit > 10 ||
    typeof p.search !== "string" ||
    p.search.length > 128
  )
    throw new Error("Invalid inbox selection");
  if (p.action === "case_detail" && p.case_ids.length !== 1)
    throw new Error("A case summary needs one case");
  if (
    ["missing_data", "out_of_scope", "clarification"].includes(
      String(p.action),
    ) &&
    p.case_ids.length
  )
    throw new Error("An unsupported answer cannot select case facts");
  return p as InboxPlan;
}
export function inboxPlanSchema(cases: readonly CaseSummary[]): {
  type: "json";
  schema: JSONSchema7;
} {
  return {
    type: "json",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: actions },
        case_ids: {
          type: "array",
          items: { type: "string", enum: cases.map((c) => c.id) },
        },
        metric: { type: "string", enum: ["all", "risk", "amount"] },
        minimum: { type: "number" },
        maximum: { type: "number" },
        sort: { type: "string", enum: ["risk", "amount", "case"] },
        limit: { type: "integer" },
        search: { type: "string" },
      },
      required: keys,
    },
  };
}
export function inboxAnswer(
  plan: InboxPlan,
  cases: readonly CaseSummary[],
  traceId: string,
): { facts: AiFact[]; status: AiRun["status"]; message?: string } {
  const notices = {
    missing_data:
      "The case register doesn’t contain that detail. I can find cases and compare their recorded movement or risk signals. For device records, policy or counter-evidence, preview a case and open its investigation.",
    out_of_scope:
      "I can help you find and compare financial risk cases here. That question is outside this workspace. Try asking which case has the highest signal, or ask me to summarise a case.",
    clarification:
      "Which case or comparison do you mean? Give me a case ID, customer, account, movement amount or risk signal to work with.",
  };
  if (plan.action in notices)
    return {
      status: "insufficient",
      facts: [],
      message: notices[plan.action as keyof typeof notices],
    };
  const search = plan.search.trim().toLowerCase();
  const matches = cases.filter(
    (c) =>
      (!plan.case_ids.length || plan.case_ids.includes(c.id)) &&
      (!search ||
        [c.id, c.customer, c.account, c.title].some((v) =>
          v.toLowerCase().includes(search),
        )) &&
      (plan.metric === "all" ||
        ((plan.metric === "risk" ? c.score : c.amount) >= plan.minimum &&
          (plan.metric === "risk" ? c.score : c.amount) <= plan.maximum)),
  );
  const rows = [...matches].sort((a, b) =>
    plan.sort === "case"
      ? a.id.localeCompare(b.id)
      : (plan.sort === "risk" ? b.score - a.score : b.amount - a.amount) ||
        a.id.localeCompare(b.id),
  );
  if (!rows.length)
    return {
      status: "insufficient",
      facts: [],
      message:
        "No cases in the connected register match those criteria. Try a different case ID, customer, amount or risk range.",
    };
  const citation = (c: CaseSummary) => ({
    id: c.id,
    caseId: c.id,
    title: "Case register",
    source: "firestore/cases",
    sourceRecord: c.id,
    traceId,
    observedAt: c.openedAt,
  });
  const fact = (id: string, text: string, sources: CaseSummary[]): AiFact => ({
    id,
    text,
    category: "observation",
    citations: sources.map(citation),
  });
  const money = (n: number, currency: string) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  let facts: AiFact[];
  if (plan.action === "count")
    facts = [
      fact(
        "register-count",
        `${rows.length} ${rows.length === 1 ? "case matches" : "cases match"} this question in the connected case register.`,
        rows,
      ),
    ];
  else if (plan.action === "total") {
    const groups = new Map<string, { cents: number; rows: CaseSummary[] }>();
    for (const row of rows) {
      const group = groups.get(row.currency) ?? { cents: 0, rows: [] };
      group.cents += Math.round(row.amount * 100);
      group.rows.push(row);
      groups.set(row.currency, group);
    }
    facts = [...groups].map(([currency, group]) =>
      fact(
        `register-total-${currency}`,
        `Recorded movement across ${group.rows.length} selected ${currency} cases totals ${money(group.cents / 100, currency)}. Different currencies are kept separate.`,
        group.rows,
      ),
    );
  } else
    facts = rows
      .slice(0, plan.limit)
      .map((row) =>
        fact(
          `case-${row.id}`,
          plan.action === "case_detail"
            ? `${row.id} — ${row.title}. ${row.customer} (${row.account}). ${row.summary} The register records ${money(row.amount, row.currency)} of movement and a configured risk signal of ${row.score}/100; this is not a probability of fraud.`
            : `${row.id} · ${row.customer}: recorded movement ${money(row.amount, row.currency)}; configured risk signal ${row.score}/100.`,
          [row],
        ),
      );
  return { status: "supported", facts };
}

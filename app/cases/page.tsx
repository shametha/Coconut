import CaseInbox from "@/app/components/case-inbox";
import { listCases } from "@/lib/case-store";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Case inbox — Coconut",
  description:
    "Preview risk signals before opening a source-linked investigation.",
};

export default async function CasesPage() {
  const result = await listCases();
  return <CaseInbox cases={result.cases} source={result.source} />;
}

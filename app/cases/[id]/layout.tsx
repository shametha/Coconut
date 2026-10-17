import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { CaseFrame } from "@/app/components/case-workspace";
import { CaseLoading } from "@/app/components/case-loading";
import { loadCase } from "@/lib/case-store";
import { isValidCaseId } from "@/lib/case";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Case investigation — Coconut",
  description:
    "Examine activity, relationships, counterevidence, sources, and a draft finding.",
};

async function CheckedCase({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const result = await loadCase(id);
  if (!result) notFound();
  return (
    <CaseFrame caseFile={result.case} source={result.source}>
      {children}
    </CaseFrame>
  );
}

export default async function CaseLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isValidCaseId(id)) notFound();
  return (
    <Suspense fallback={<CaseLoading id={id} />}>
      <CheckedCase id={id}>{children}</CheckedCase>
    </Suspense>
  );
}

export type CopilotGuide = {
  title: string;
  introduction: string;
  capabilities: { section: string; description: string }[];
  limitation: string;
};

// Product guidance describes implemented features. It never substitutes case
// observations, invents citations, or consumes a model generation.
export function copilotGuide(
  question: string,
  scope: "case" | "inbox" = "case",
): CopilotGuide | null {
  const text = question
    .toLowerCase()
    .replace(/[?!.,]+$/g, "")
    .trim();
  const productQuestion = [
    /^(?:please )?(?:help|help me|hi|hello|hey)$/,
    /^what(?: all)? can (?:coconut|you|this copilot|the copilot) (?:do|help (?:me )?with)$/,
    /^what (?:is|does) coconut(?: do)?$/,
    /^what are (?:your|coconut'?s|the copilot'?s) (?:features|capabilities)$/,
    /^how (?:do|can) i use (?:coconut|this copilot|the copilot)$/,
    /^how (?:does|do) (?:coconut|this copilot|you) (?:work|answer questions)$/,
  ].some((pattern) => pattern.test(text));
  if (!productQuestion) return null;
  if (scope === "inbox")
    return {
      title: "Find a place to start.",
      introduction:
        "Ask me to find a case, compare recorded movement or risk signals, count matching cases, or explain a case’s register summary.",
      capabilities: [
        {
          section: "Find",
          description:
            "Search by case, customer or account, with amount and risk ranges.",
        },
        {
          section: "Compare",
          description:
            "Compare recorded case amounts and configured risk signals.",
        },
        {
          section: "Investigate",
          description:
            "Preview a suggested case here, then follow its checked evidence in the full workspace.",
        },
      ],
      limitation:
        "The inbox reads the case register. Detailed source questions belong to the case investigation. A score does not confirm fraud.",
    };
  return {
    title: "From a signal to a finding.",
    introduction:
      "Coconut helps you investigate a case without losing the records behind it. Ask here from any investigation section.",
    capabilities: [
      {
        section: "Activity",
        description:
          "Review transfers, the configured baseline and device timing.",
      },
      {
        section: "Links",
        description:
          "Trace beneficiaries and connections to prior investigations.",
      },
      {
        section: "Challenge",
        description: "Review facts that may support another explanation.",
      },
      {
        section: "Core",
        description:
          "Inspect cited source records, the case policy and read traces.",
      },
      {
        section: "Finding",
        description:
          "Prepare an evidence-backed draft for an investigator to review.",
      },
    ],
    limitation:
      "Case answers use checked observations. If those records cannot answer a question, Coconut says so. It cannot confirm fraud, invent missing records or submit a regulatory filing.",
  };
}

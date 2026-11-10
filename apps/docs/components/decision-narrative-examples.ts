import type { RecommendationCardData, TradeoffPanelData, DecisionMemoData, ReasoningSummaryData } from "@mcpcn/schemas";

const root = { revision: "1", state: "ready" as const, action: { id: "review", revision: "1", label: "Request report review", available: true } };
const option = { id: "option-a", revision: "1", label: "Authored option A", value: { amount: 0, enabled: false, absent: null, details: Array.from({ length: 50 }, (_, index) => ({ ordinal: index, text: index === 49 ? "COMPLETE_VALUE_END" : `Authored complete value row ${index}` })) }, confidence: 0,
  evidence: [{ id: "evidence-a", label: "Authored evidence", text: "Supplied evidence is not verified by this view.", url: "https://example.com/authored-evidence" }] };
const alternative = { id: "option-b", revision: "2", label: "Authored option B", value: ["Other complete value", 0, false, null], evidence: [] };
export const decisionNarrativeExamples = {
  "recommendation-card": { ...root, id: "recommendation-1", title: "Authored recommendation report", recommendation: { id: "recommendation-report", revision: "1", label: "Supplied recommendation", option, rationale: "Authored rationale for the supplied recommendation; no ranking is computed.", benefits: ["Reported simple setup", "Second reported benefit"], caveats: ["Reported manual review required"], alternatives: [alternative] } },
  "tradeoff-panel": { ...root, id: "tradeoffs-1", title: "Authored option tradeoffs", analysis: { id: "tradeoff-report", revision: "1", label: "Supplied tradeoffs", options: [
    { option, benefits: ["Reported simple setup"], costs: ["Reported manual review"], uncertainties: ["No live price checked"] },
    { option: alternative, benefits: [], costs: ["Reported setup work"], uncertainties: [] },
  ] } },
  "decision-memo": { ...root, id: "memo-1", title: "Authored decision memo", memo: { id: "memo-report", revision: "1", label: "Supplied decision memo", status: "decided", context: "An authored review of two supplied options.", rationale: "The supplied memo reports option A. This UI does not make or publish a decision.", options: [option, alternative], decisionOptionId: "option-a", risks: ["Reported unverified assumptions"], followUps: [{ id: "follow-up", revision: "1", label: "Review supplied sources", state: "proposed" }] } },
  "reasoning-summary": { ...root, id: "summary-1", title: "Authored user-facing rationale", summary: { id: "summary-report", revision: "1", label: "Supplied rationale summary", overview: "An authored explanation of a reported finding.", points: [{ finding: option, explanation: "The supplied finding preserves zero, false, null and complete structured values." }], limitations: ["This user-facing explanation does not expose an internal model trace.", "Supplied confidence and evidence are not verified here."] } },
} satisfies { "recommendation-card": RecommendationCardData; "tradeoff-panel": TradeoffPanelData; "decision-memo": DecisionMemoData; "reasoning-summary": ReasoningSummaryData };
export type DecisionNarrativeSlug = keyof typeof decisionNarrativeExamples;
export const decisionNarrativeNames = { "recommendation-card": "RecommendationCard", "tradeoff-panel": "TradeoffPanel", "decision-memo": "DecisionMemo", "reasoning-summary": "ReasoningSummary" } as const;
export function decisionNarrativeExampleCode(slug: DecisionNarrativeSlug) {
  return `import { ${decisionNarrativeNames[slug]} } from "@mcpcn/react";\nimport type { ${decisionNarrativeNames[slug]}Data } from "@mcpcn/schemas";\n\nconst data: ${decisionNarrativeNames[slug]}Data = ${JSON.stringify(decisionNarrativeExamples[slug], null, 2)};\n\n<${decisionNarrativeNames[slug]} {...data} onAction={intent => console.log(intent)} />`;
}

import type { RecommendationCardData, TradeoffPanelData, DecisionMemoData, ReasoningSummaryData } from "@mcpcn/schemas";

const root = { revision: "1", state: "ready" as const, action: { id: "review", revision: "1", label: "Request report review", available: true } };
const option = { id: "option-a", revision: "1", label: "Authored option A", value: { amount: 0, enabled: false, absent: null, details: { last: "Complete authored value" } }, confidence: 0,
  evidence: [{ id: "source-a", label: "Authored evidence", text: "This supplied excerpt is a claim, not verified evidence." }] };
const alternative = { id: "option-b", revision: "1", label: "Authored option B", value: ["Other supplied value", 0, false, null], evidence: [] };
export const decisionNarrativeFixtures = {
  "recommendation-card": { ...root, id: "recommendation-1", title: "Review an authored recommendation", recommendation: { id: "recommendation-report", revision: "1", label: "Supplied recommendation", option, rationale: "Authored rationale for option A.", benefits: ["Reported simple setup"], caveats: ["Reported manual review required"], alternatives: [alternative] } },
  "tradeoff-panel": { ...root, id: "tradeoffs-1", title: "Compare authored tradeoffs", analysis: { id: "tradeoff-report", revision: "1", label: "Supplied analysis", options: [
    { option, benefits: ["Reported simple setup"], costs: ["Reported manual review"], uncertainties: ["No live price checked"] },
    { option: alternative, benefits: [], costs: ["Reported setup work"], uncertainties: [] },
  ] } },
  "decision-memo": { ...root, id: "memo-1", title: "Read an authored decision memo", memo: { id: "memo-report", revision: "1", label: "Supplied memo", status: "decided", context: "Choose a supplied option after review.", rationale: "The supplied memo reports option A; this UI does not make that decision.", options: [option, alternative], decisionOptionId: "option-a", risks: ["Authored unverified assumptions"], followUps: [{ id: "follow-up", revision: "1", label: "Review supplied evidence", state: "proposed" }] } },
  "reasoning-summary": { ...root, id: "summary-1", title: "Read authored user-facing rationale", summary: { id: "summary-report", revision: "1", label: "Supplied rationale summary", overview: "An authored explanation of a reported conclusion.", points: [{ finding: option, explanation: "The supplied finding reports zero, false and null as distinct values." }], limitations: ["This is a supplied user-facing explanation, not an internal model trace."] } },
} satisfies { "recommendation-card": RecommendationCardData; "tradeoff-panel": TradeoffPanelData; "decision-memo": DecisionMemoData; "reasoning-summary": ReasoningSummaryData };

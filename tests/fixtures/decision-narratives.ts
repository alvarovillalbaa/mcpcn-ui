import type { RecommendationCardData, TradeoffPanelData, DecisionMemoData, ReasoningSummaryData } from "../../packages/schemas/src/decision-narrative-schemas.js";

const root = { revision: "one", state: "ready" as const, title: "Authored decision report", action: { id: "review", revision: "two", label: "Request authored review", available: true } };
export const narrativeOption = { id: "option-a", revision: "three", label: "Authored option <A>", value: { first: 0, second: false, third: null, fourth: { complete: "VALUE_END <script>never execute</script>" } }, confidence: 0,
  evidence: [{ id: "evidence-a", label: "Authored evidence", text: "EVIDENCE_END <script>never execute</script>", url: "https://example.com/authored-evidence" }] };
const alternative = { id: "option-b", revision: "four", label: "Authored option B", value: [0, false, null, "ALTERNATIVE_END"], evidence: [] };
export const decisionNarrativeData = {
  "recommendation-card": { ...root, id: "recommendation-1", recommendation: { id: "recommendation-report", revision: "five", label: "Supplied recommendation", option: narrativeOption, rationale: "Authored recommendation rationale", benefits: ["Benefit one", "Benefit two"], caveats: ["Caveat one"], alternatives: [alternative] } },
  "tradeoff-panel": { ...root, id: "tradeoffs-1", analysis: { id: "tradeoff-report", revision: "five", label: "Supplied tradeoff analysis", options: [{ option: narrativeOption, benefits: ["Benefit one"], costs: ["Cost one"], uncertainties: ["Uncertainty one"] }, { option: alternative, benefits: [], costs: [], uncertainties: [] }] } },
  "decision-memo": { ...root, id: "memo-1", memo: { id: "memo-report", revision: "five", label: "Supplied decision memo", status: "decided", context: "Authored complete context", rationale: "Authored complete rationale", options: [narrativeOption, alternative], decisionOptionId: "option-a", risks: ["Risk one"], followUps: [{ id: "follow-up", revision: "six", label: "Authored follow-up", state: "proposed" }] } },
  "reasoning-summary": { ...root, id: "summary-1", summary: { id: "summary-report", revision: "five", label: "Supplied user-facing rationale", overview: "Authored overview", points: [{ finding: narrativeOption, explanation: "Authored full explanation" }], limitations: ["Limitation one"] } },
} satisfies { "recommendation-card": RecommendationCardData; "tradeoff-panel": TradeoffPanelData; "decision-memo": DecisionMemoData; "reasoning-summary": ReasoningSummaryData };
export const decisionNarrativeCases = [
  { slug: "recommendation-card", name: "RecommendationCard", report: "recommendation", type: "request-recommendation", data: decisionNarrativeData["recommendation-card"] },
  { slug: "tradeoff-panel", name: "TradeoffPanel", report: "analysis", type: "request-tradeoff-review", data: decisionNarrativeData["tradeoff-panel"] },
  { slug: "decision-memo", name: "DecisionMemo", report: "memo", type: "request-decision-review", data: decisionNarrativeData["decision-memo"] },
  { slug: "reasoning-summary", name: "ReasoningSummary", report: "summary", type: "request-summary-review", data: decisionNarrativeData["reasoning-summary"] },
] as const;
export type NarrativeCase = typeof decisionNarrativeCases[number];
export const mutableNarrative = (row: NarrativeCase) => structuredClone(row.data) as unknown as Record<string, unknown>;
export const narrativeReport = (data: Record<string, unknown>) => (data.recommendation ?? data.analysis ?? data.memo ?? data.summary) as Record<string, unknown>;
export function firstNarrativeField(data: Record<string, unknown>) {
  const report = narrativeReport(data);
  return (data.recommendation ? report.option : data.analysis ? (report.options as Array<{ option: unknown }>)[0]!.option : data.memo ? (report.options as unknown[])[0] : (report.points as Array<{ finding: unknown }>)[0]!.finding) as Record<string, unknown>;
}

import type { ChoiceOption, OptionSelectorData, RankedOption, RankingListData } from "@mcpcn/schemas";

export const authoredOptionValue = { approved: false, count: 0, next: null, empty: "", items: [false, 0, null, "", { literal: "<script>never executed</script>", end: "END-OPTION-JSON" }] };
export const authoredChoiceOptions: ChoiceOption[] = [
  { id: "preferred", revision: "1", label: "Preferred option", value: authoredOptionValue, confidence: 0,
    evidence: [{ id: "option-note", label: "Authored option note", text: "Complete supplied <em>option evidence</em>. END-OPTION-EVIDENCE", url: "https://example.com/supplied-option" }] },
  { id: "alternative", revision: "1", label: "Alternative option", value: false },
  { id: "matching", revision: "1", label: "Equal value option", value: authoredOptionValue, confidence: 0.5, evidence: [] },
];
export const authoredRankedOptions: RankedOption[] = [
  { id: "nested", revision: "1", label: "Nested result", value: { flags: [false, 0, null, ""], literal: "<script>never executed</script>", end: "END-RANKING-JSON" }, rank: 7, score: 0, confidence: 0,
    evidence: [{ id: "ranking-note", label: "Authored ranking note", text: "Complete supplied <em>ranking evidence</em>. END-RANKING-EVIDENCE", url: "https://example.com/supplied-ranking" }] },
  { id: "false", revision: "1", label: "False result", value: false, rank: 2 },
  { id: "zero", revision: "1", label: "Zero result", value: 0, rank: 7, score: -12.5, scoreLabel: "Authored score", confidence: 0.5 },
  { id: "empty", revision: "1", label: "Empty result", value: "", rank: 11, score: 1 },
  { id: "null", revision: "1", label: "Null result", value: null, rank: 4, score: 1 },
];
export const authoredOptionSelector = { id: "option-selector-1", revision: "1", title: "Supplied option choices", state: "ready",
  group: { id: "group-1", revision: "1", label: "Authored supplied options", options: authoredChoiceOptions }, selectedOptionId: null } satisfies OptionSelectorData;
export const authoredRankingList = { id: "ranking-list-1", revision: "1", title: "Supplied ranked options", state: "ready",
  list: { id: "list-1", revision: "1", label: "Authored supplied ranking", entries: authoredRankedOptions }, selectedEntryId: null } satisfies RankingListData;
export const optionStateFixtures = [authoredOptionSelector,
  { id: "option-selector-1", revision: "1", title: "Supplied option choices", state: "loading" },
  { id: "option-selector-1", revision: "1", title: "Supplied option choices", state: "empty" },
  { id: "option-selector-1", revision: "1", title: "Supplied option choices", state: "error", message: "Authored option failure." },
] satisfies OptionSelectorData[];
export const rankingStateFixtures = [authoredRankingList,
  { id: "ranking-list-1", revision: "1", title: "Supplied ranked options", state: "loading" },
  { id: "ranking-list-1", revision: "1", title: "Supplied ranked options", state: "empty" },
  { id: "ranking-list-1", revision: "1", title: "Supplied ranked options", state: "error", message: "Authored ranking failure." },
  { ...authoredRankingList, list: { ...authoredRankingList.list, entries: [] } },
] satisfies RankingListData[];
export const optionRankingFixtures = { "option-selector": authoredOptionSelector, "ranking-list": authoredRankingList } as const;

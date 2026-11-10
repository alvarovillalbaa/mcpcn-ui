import { describe, expect, it } from "vitest";
import type { MCPCNPayload } from "@mcpcn/core";
import { OptionSelectorSchema, RankingListSchema, schemaBySlug } from "@mcpcn/schemas";
import { controlledData, optionRankingPreviewKey } from "./component-preview";
import { makeFixture, playgroundItems, validateFixture } from "./fixtures";
import { authoredOptionSelector, authoredRankingList, authoredChoiceOptions, authoredRankedOptions, optionStateFixtures, rankingStateFixtures } from "./option-ranking-fixtures";

const optionScope = { componentId: "option-selector-1", componentRevision: "1", groupId: "group-1", groupRevision: "1", optionId: "preferred", optionRevision: "1" };
const entryScope = { componentId: "ranking-list-1", componentRevision: "1", listId: "list-1", listRevision: "1", entryId: "nested", entryRevision: "1" };
const envelope = (data: unknown, slug = "option-selector"): MCPCNPayload<string, unknown> => ({ kind: `mcpcn/${slug}`, version: 1, data });

describe("option and ranking playground consumers", () => {
  it("OR-F01 dispatches both strict public schemas with controlled none selected", () => {
    expect(playgroundItems).toHaveLength(79);
    for (const slug of ["option-selector", "ranking-list"] as const) {
      const payload = makeFixture(slug); expect(validateFixture(payload).success).toBe(true); expect(schemaBySlug[slug].safeParse(payload.data).success).toBe(true);
    }
    const a = OptionSelectorSchema.parse(authoredOptionSelector), b = RankingListSchema.parse(authoredRankingList);
    if (a.state !== "ready" || b.state !== "ready") throw new Error("authored_ready_required");
    expect(a.selectedOptionId).toBeNull(); expect(b.selectedEntryId).toBeNull();
  });
  it("OR-F02 snapshots complete falsy nested option values and safe evidence", () => {
    const data = structuredClone(authoredOptionSelector), result = validateFixture(envelope(data)); expect(result.success).toBe(true);
    data.group.options[0]!.label = "Changed outside the owned snapshot";
    if (result.success) {
      const parsed = OptionSelectorSchema.parse(result.data.data); if (parsed.state !== "ready") throw new Error("authored_ready_required");
      expect(parsed.group.options[0]?.label).toBe("Preferred option"); expect(parsed.group.options[0]?.value).toEqual(authoredChoiceOptions[0]?.value);
      expect(parsed.group.options[0]?.evidence[0]?.url).toBe("https://example.com/supplied-option");
    }
  });
  it("OR-F03 preserves equal option values as distinct choices and zero versus absent confidence", () => {
    const parsed = OptionSelectorSchema.parse(authoredOptionSelector); if (parsed.state !== "ready") throw new Error("authored_ready_required");
    expect(parsed.group.options[0]?.value).toEqual(parsed.group.options[2]?.value); expect(new Set(parsed.group.options.map(item => item.id)).size).toBe(3);
    expect(parsed.group.options[0]?.confidence).toBe(0); expect(parsed.group.options[1]).not.toHaveProperty("confidence"); expect(parsed.group.options[1]?.value).toBe(false); expect(parsed.group.options[1]?.evidence).toEqual([]);
  });
  it("OR-F04 retains unsorted tied ranks independent scores and complete primitive values", () => {
    const parsed = RankingListSchema.parse(authoredRankingList); if (parsed.state !== "ready") throw new Error("authored_ready_required");
    expect(parsed.list.entries.map(item => item.rank)).toEqual([7, 2, 7, 11, 4]);
    expect(parsed.list.entries.map(item => item.score)).toEqual([0, undefined, -12.5, 1, 1]); expect(parsed.list.entries[1]).not.toHaveProperty("score");
    expect(parsed.list.entries.slice(1).map(item => item.value)).toEqual([false, 0, "", null]); expect(parsed.list.entries[2]?.scoreLabel).toBe("Authored score");
  });
  it("OR-F05 supports explicit states and ready empty rankings without manufacturing a selection", () => {
    for (const data of optionStateFixtures) expect(validateFixture(envelope(data)).success).toBe(true);
    for (const data of rankingStateFixtures) expect(validateFixture(envelope(data, "ranking-list")).success).toBe(true);
    expect(OptionSelectorSchema.safeParse({ ...authoredOptionSelector, group: { ...authoredOptionSelector.group, options: [] } }).success).toBe(false);
    const empty = RankingListSchema.parse({ ...authoredRankingList, list: { ...authoredRankingList.list, entries: [] } });
    if (empty.state !== "ready") throw new Error("authored_ready_required"); expect(empty.list.entries).toEqual([]); expect(empty.selectedEntryId).toBeNull();
  });
  it("OR-F06 rejects unsafe evidence duplicate identities and malformed rank or confidence", () => {
    const unsafe = structuredClone(authoredOptionSelector); unsafe.group.options[0]!.evidence![0]!.url = "javascript:alert(1)";
    expect(validateFixture(envelope(unsafe)).success).toBe(false);
    expect(validateFixture(envelope({ ...authoredOptionSelector, unsupported: true })).success).toBe(false);
    expect(validateFixture(envelope({ ...authoredOptionSelector, group: { ...authoredOptionSelector.group, options: [authoredChoiceOptions[0], authoredChoiceOptions[0]] } })).success).toBe(false);
    expect(validateFixture(envelope({ ...authoredRankingList, list: { ...authoredRankingList.list, entries: [{ ...authoredRankedOptions[0], rank: 0 }] } }, "ranking-list")).success).toBe(false);
    expect(validateFixture(envelope({ ...authoredRankingList, list: { ...authoredRankingList.list, entries: [{ ...authoredRankedOptions[0], confidence: 2 }] } }, "ranking-list")).success).toBe(false);
  });
  it("OR-F07 preserves local omission versus controlled null and rejects stale selected identities", () => {
    const { selectedOptionId: _option, ...localOption } = authoredOptionSelector, { selectedEntryId: _entry, ...localRanking } = authoredRankingList;
    expect(OptionSelectorSchema.parse(localOption)).not.toHaveProperty("selectedOptionId"); expect(RankingListSchema.parse(localRanking)).not.toHaveProperty("selectedEntryId");
    expect(controlledData("option-selector", localOption, { type: "select-option", data: optionScope })).toBeUndefined();
    expect(controlledData("ranking-list", localRanking, { type: "inspect-ranked-option", data: entryScope })).toBeUndefined();
    expect(validateFixture(envelope({ ...authoredOptionSelector, selectedOptionId: "missing" })).success).toBe(false);
    expect(validateFixture(envelope({ ...authoredRankingList, selectedEntryId: "missing" }, "ranking-list")).success).toBe(false);
  });
  it("OR-F08 echoes only current strict selection and clear identities and reparses the result", () => {
    expect(controlledData("option-selector", authoredOptionSelector, { type: "select-option", data: optionScope })).toEqual({ selectedOptionId: "preferred" });
    expect(controlledData("ranking-list", authoredRankingList, { type: "inspect-ranked-option", data: entryScope })).toEqual({ selectedEntryId: "nested" });
    const clear = { componentId: entryScope.componentId, componentRevision: "1", listId: "list-1", listRevision: "1" };
    expect(controlledData("ranking-list", authoredRankingList, { type: "clear-ranked-option", data: clear })).toEqual({ selectedEntryId: null });
    for (const key of Object.keys(optionScope) as Array<keyof typeof optionScope>) expect(controlledData("option-selector", authoredOptionSelector, { type: "select-option", data: { ...optionScope, [key]: "stale" } })).toBeUndefined();
    expect(controlledData("option-selector", authoredOptionSelector, { type: "select-option", data: { ...optionScope, value: false } })).toBeUndefined();
    expect(controlledData("ranking-list", authoredRankingList, { type: "approve", data: entryScope })).toBeUndefined();
  });
  it("OR-F09 preserves native root identity for same-root owner and member refreshes only", () => {
    const first = envelope(authoredOptionSelector), changed = envelope({ ...authoredOptionSelector, group: { ...authoredOptionSelector.group, revision: "2", options: [...authoredChoiceOptions].reverse() } });
    expect(optionRankingPreviewKey(first)).toBe(optionRankingPreviewKey(changed));
    expect(optionRankingPreviewKey(envelope({ ...authoredOptionSelector, revision: "2" }))).not.toBe(optionRankingPreviewKey(first));
    expect(optionRankingPreviewKey({ kind: "mcpcn/conflict-resolver", version: 1, data: {} })).toBeUndefined();
  });
  it("OR-F10 refuses descriptor traps without reading them and retains smaller editor bounds", () => {
    let reads = 0; const data = { ...authoredOptionSelector }; Object.defineProperty(data, "title", { enumerable: true, get() { reads++; return "Trap"; } });
    expect(validateFixture(envelope(data)).success).toBe(false); expect(reads).toBe(0);
    const request = { type: "select-option", data: { ...optionScope } }; Object.defineProperty(request.data, "optionId", { enumerable: true, get() { reads++; return "preferred"; } });
    expect(controlledData("option-selector", authoredOptionSelector, request)).toBeUndefined(); expect(reads).toBe(0);
    const larger = { ...authoredOptionSelector, group: { ...authoredOptionSelector.group, options: [{ ...authoredChoiceOptions[0], value: "x".repeat(8193) }] } };
    expect(OptionSelectorSchema.safeParse(larger).success).toBe(true); expect(validateFixture(envelope(larger)).success).toBe(false);
    const sparse = new Array<unknown>(3); sparse[0] = authoredChoiceOptions[0]; expect(validateFixture(envelope({ ...authoredOptionSelector, group: { ...authoredOptionSelector.group, options: sparse } })).success).toBe(false);
  });
});

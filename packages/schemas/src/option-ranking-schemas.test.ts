import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import * as publicSchemas from "./index.js";
import { InspectableJSONSchema } from "./execution-schemas.js";
import { FileExtractionFieldSchema, stableReviewKey } from "./file-review-schemas.js";
import { InspectionFieldSchema } from "./record-inspection-schemas.js";
import { ChoiceOptionSchema, OptionSelectorSchema, RankedOptionSchema, RankingListSchema, type ChoiceOption, type RankedOption } from "./option-ranking-schemas.js";

const common = { id: "component-1", revision: "root-1", title: "Supplied options" };
const option = (patch: Partial<ChoiceOption> = {}): ChoiceOption => ({ id: "option-1", revision: "one", label: "Option one", value: { supplied: [false, 0, null, ""] }, ...patch });
const ranked = (patch: Partial<RankedOption> = {}): RankedOption => ({ ...option(), rank: 7, ...patch });
const selector = (options: ChoiceOption[] = [option()]) => ({ ...common, state: "ready" as const, group: { id: "group-1", revision: "one", label: "Supplied choices", options } });
const ranking = (entries: RankedOption[] = [ranked()]) => ({ ...common, state: "ready" as const, list: { id: "list-1", revision: "one", label: "Supplied ranking", entries } });
const evidence = { id: "source-1", label: "Authored note", text: "Complete supplied evidence.\n", url: "https://example.test/source?q=authored#note" };
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

function fillBudget<T>(value: T, items: Array<{ value: string; evidence: Array<{ text: string }> }>, parse: (value: unknown) => unknown): T {
  let remaining = 2097152 - bytes(parse(value));
  const fill = (maximum: number) => {
    const count = Math.min(remaining, maximum * 2); remaining -= count;
    return "é".repeat(Math.floor(count / 2)) + (count % 2 ? "x" : "");
  };
  for (const item of items) item.value = fill(10000);
  for (const item of items) for (const source of item.evidence) source.text = fill(4000);
  if (remaining !== 0) throw new Error("authored_aggregate_budget_fixture_incomplete");
  return value;
}
function atOptionBudget() {
  const items = Array.from({ length: 50 }, (_, index) => ({ id: `option-${index}`, revision: "one", label: "Option", value: "",
    evidence: Array.from({ length: 20 }, (_, number) => ({ id: `source-${number}`, label: "Source", text: "" })) }));
  return fillBudget({ ...selector(items), description: "" }, items, value => OptionSelectorSchema.parse(value));
}
function atRankingBudget() {
  const items = Array.from({ length: 100 }, (_, index) => ({ id: `entry-${index}`, revision: "one", label: "Entry", value: "", rank: index + 1,
    evidence: Array.from({ length: 20 }, (_, number) => ({ id: `source-${number}`, label: "Source", text: "" })) }));
  return fillBudget({ ...ranking(items), description: "" }, items, value => RankingListSchema.parse(value));
}

describe("supplied option and ranking schemas", () => {
  it("OR-S01 directly reuses the complete inspection-field contract for choice options", () => {
    expect(ChoiceOptionSchema).toBe(InspectionFieldSchema);
    const supplied = option({ evidence: [evidence], confidence: 0 });
    expect(ChoiceOptionSchema.parse(supplied)).toEqual(InspectionFieldSchema.parse(supplied));
    expect(ChoiceOptionSchema.parse(option()).evidence).toEqual([]);
  });

  it("OR-S02 requires complete option values and preserves falsy primitives and nested data", () => {
    for (const value of [null, false, true, 0, -0, 4.5, "", " \n\t", { nested: [null, false, 0, "", { end: "<em>Complete</em>\n" }] }]) {
      expect(ChoiceOptionSchema.parse(option({ value })).value).toEqual(value);
    }
    const { value: _value, ...missing } = option();
    expect(ChoiceOptionSchema.safeParse(missing).success).toBe(false);
    expect(ChoiceOptionSchema.safeParse({ ...option(), value: undefined }).success).toBe(false);
  });

  it("OR-S03 preserves the unchanged per-value string depth and serialized-size boundaries", () => {
    let nested: unknown = null; for (let depth = 0; depth < 8; depth++) nested = [nested];
    for (const value of ["é".repeat(10000), nested]) {
      expect(InspectableJSONSchema.safeParse(value).success).toBe(true);
      expect(OptionSelectorSchema.safeParse(selector([{ ...option(), value } as ChoiceOption])).success).toBe(true);
      expect(RankedOptionSchema.safeParse({ ...ranked(), value }).success).toBe(true);
    }
    for (const value of ["x".repeat(10001), [nested], Array.from({ length: 10 }, () => "x".repeat(7000))]) {
      expect(ChoiceOptionSchema.safeParse({ ...option(), value }).success).toBe(false);
      expect(RankedOptionSchema.safeParse({ ...ranked(), value }).success).toBe(false);
    }
  });

  it("OR-S04 distinguishes absent confidence from zero and refuses coerced or nonfinite claims", () => {
    expect(Object.hasOwn(ChoiceOptionSchema.parse(option()), "confidence")).toBe(false);
    for (const confidence of [0, 0.125, 1]) expect(ChoiceOptionSchema.parse(option({ confidence })).confidence).toBe(confidence);
    for (const confidence of [NaN, Infinity, -Infinity, -0.01, 1.01, "0.5", null, false]) {
      expect(ChoiceOptionSchema.safeParse({ ...option(), confidence }).success).toBe(false);
      expect(RankedOptionSchema.safeParse({ ...ranked(), confidence }).success).toBe(false);
    }
  });

  it("OR-S05 reuses evidence defaults safe links and the twenty-source unique-identity bound", () => {
    const sources = Array.from({ length: 20 }, (_, index) => ({ ...evidence, id: `source-${index}` }));
    const expected = FileExtractionFieldSchema.parse({ id: "option-1", label: "Option", original: "Supplied", evidence: sources }).evidence;
    expect(ChoiceOptionSchema.parse(option({ evidence: sources })).evidence).toEqual(expected);
    expect(RankedOptionSchema.parse(ranked({ evidence: sources })).evidence).toEqual(expected);
    for (const supplied of [[...sources, { ...evidence, id: "extra" }], [evidence, evidence], [{ ...evidence, verified: true }]]) {
      expect(ChoiceOptionSchema.safeParse({ ...option(), evidence: supplied }).success).toBe(false);
      expect(RankedOptionSchema.safeParse({ ...ranked(), evidence: supplied }).success).toBe(false);
    }
    for (const url of ["javascript:alert(1)", "data:text/plain,x", "file:///tmp/authored", "/relative", "//example.test", "https://user:pass@example.test", "https://example.test/a b"]) {
      expect(RankedOptionSchema.safeParse(ranked({ evidence: [{ ...evidence, url }] })).success).toBe(false);
    }
  });

  it("OR-S06 bounds ready choice groups at one through fifty options", () => {
    const fifty = Array.from({ length: 50 }, (_, index) => option({ id: `option-${index}` }));
    expect(OptionSelectorSchema.safeParse(selector()).success).toBe(true);
    expect(OptionSelectorSchema.safeParse(selector(fifty)).success).toBe(true);
    for (const options of [[], [...fifty, option({ id: "extra" })]]) expect(OptionSelectorSchema.safeParse(selector(options)).success).toBe(false);
  });

  it("OR-S07 refuses duplicate option IDs even when revisions and values differ", () => {
    expect(OptionSelectorSchema.safeParse(selector([option(), option({ revision: "two", value: false })])).success).toBe(false);
    expect(OptionSelectorSchema.safeParse(selector([option(), option({ id: "other", revision: "two" })])).success).toBe(true);
  });

  it("OR-S08 permits equal option values and keeps producer order without choosing a winner", () => {
    const value = { supplied: [false, 0, null, ""] };
    const parsed = OptionSelectorSchema.parse(selector([option({ id: "second", value }), option({ id: "first", value })]));
    if (parsed.state !== "ready") throw new Error("authored_ready_required");
    expect(parsed.group.options.map(item => item.id)).toEqual(["second", "first"]);
    expect(parsed.group.options[0]?.value).toEqual(parsed.group.options[1]?.value);
    expect(Object.hasOwn(parsed, "selectedOptionId")).toBe(false);
    expect(Object.hasOwn(parsed.group, "winner")).toBe(false);
  });

  it("OR-S09 preserves omitted local selection controlled null and current option IDs", () => {
    expect(Object.hasOwn(OptionSelectorSchema.parse(selector()), "selectedOptionId")).toBe(false);
    for (const selectedOptionId of [null, "option-1"]) {
      const parsed = OptionSelectorSchema.parse({ ...selector(), selectedOptionId });
      if (parsed.state !== "ready") throw new Error("authored_ready_required");
      expect(parsed.selectedOptionId).toBe(selectedOptionId);
    }
  });

  it("OR-S10 refuses stale or malformed option selection rather than substituting a choice", () => {
    for (const selectedOptionId of ["missing", "removed", "", false, 0]) expect(OptionSelectorSchema.safeParse({ ...selector(), selectedOptionId }).success).toBe(false);
  });

  it("OR-S11 requires the complete strict group owner in the ready state", () => {
    expect(OptionSelectorSchema.safeParse({ ...common, state: "ready" }).success).toBe(false);
    for (const key of ["id", "revision", "label", "options"] as const) {
      const group: Record<string, unknown> = { ...selector().group }; delete group[key];
      expect(OptionSelectorSchema.safeParse({ ...selector(), group }).success).toBe(false);
    }
    expect(OptionSelectorSchema.safeParse({ ...selector(), group: { ...selector().group, winner: "option-1" } }).success).toBe(false);
  });

  it("OR-S12 keeps choice states explicit and forbids hidden nonready payloads or selection", () => {
    for (const state of ["loading", "empty", "error"]) {
      const supplied = { ...common, state, message: "Supplied state" };
      expect(OptionSelectorSchema.safeParse(supplied).success).toBe(true);
      expect(OptionSelectorSchema.safeParse({ ...supplied, group: selector().group }).success).toBe(false);
      expect(OptionSelectorSchema.safeParse({ ...supplied, selectedOptionId: null }).success).toBe(false);
    }
    for (const message of [undefined, "", " \n\t", "bad\u0000message"]) expect(OptionSelectorSchema.safeParse({ ...common, state: "error", message }).success).toBe(false);
  });

  it("OR-S13 applies safe120 identities to roots owners members and revisions", () => {
    expect(OptionSelectorSchema.safeParse({ ...selector(), id: "i".repeat(120), revision: "r".repeat(120) }).success).toBe(true);
    for (const value of ["", " ", " leading", "trailing ", "bad\nidentity", "bad\u007fidentity", "i".repeat(121), "__proto__", "prototype", "constructor"]) {
      expect(OptionSelectorSchema.safeParse({ ...selector(), id: value }).success).toBe(false);
      expect(OptionSelectorSchema.safeParse({ ...selector(), group: { ...selector().group, revision: value } }).success).toBe(false);
      expect(ChoiceOptionSchema.safeParse(option({ revision: value })).success).toBe(false);
      expect(RankedOptionSchema.safeParse(ranked({ id: value, revision: value })).success).toBe(false);
    }
  });

  it("OR-S14 retains bounded plain labels descriptions and messages without trimming", () => {
    const supplied = { ...selector(), title: "t".repeat(300), description: "é".repeat(4000), message: " \n" };
    expect(OptionSelectorSchema.parse(supplied).description).toBe(supplied.description);
    expect(ChoiceOptionSchema.parse(option({ label: "  Supplied label\n" })).label).toBe("  Supplied label\n");
    for (const title of ["", " \n\t", "bad\u0000title", "bad\u007ftitle", "t".repeat(301)]) expect(OptionSelectorSchema.safeParse({ ...selector(), title }).success).toBe(false);
    expect(RankingListSchema.safeParse({ ...ranking(), description: "x".repeat(4001) }).success).toBe(false);
    expect(OptionSelectorSchema.safeParse({ ...selector(), message: "bad\u000bmessage" }).success).toBe(false);
  });

  it("OR-S15 refuses option authority and private transport properties instead of stripping them", () => {
    for (const patch of [{ winner: "option-1" }, { approved: true }, { busy: true }, { onAction: "hidden" }]) expect(OptionSelectorSchema.safeParse({ ...selector(), ...patch }).success).toBe(false);
    expect(ChoiceOptionSchema.safeParse({ ...option(), recommended: true }).success).toBe(false);
    expect(ChoiceOptionSchema.safeParse(option({ evidence: [{ ...evidence, verified: true } as typeof evidence] })).success).toBe(false);
  });

  it("OR-S16 requires a supplied integer rank from one through one million", () => {
    for (const rank of [1, 7, 1000000]) expect(RankedOptionSchema.parse(ranked({ rank })).rank).toBe(rank);
    for (const rank of [undefined, 0, -1, 1000001, 1.5, NaN, Infinity, "7", null, false]) expect(RankedOptionSchema.safeParse({ ...ranked(), rank }).success).toBe(false);
  });

  it("OR-S17 preserves absent score zero negative scores and finite signed endpoints", () => {
    expect(Object.hasOwn(RankedOptionSchema.parse(ranked()), "score")).toBe(false);
    for (const score of [-1000000000000, -12.5, 0, 1000000000000]) expect(RankedOptionSchema.parse(ranked({ score })).score).toBe(score);
    for (const score of [-1000000000001, 1000000000001, NaN, Infinity, -Infinity, "0", null, false]) expect(RankedOptionSchema.safeParse({ ...ranked(), score }).success).toBe(false);
  });

  it("OR-S18 retains an optional nonblank score label without requiring or inferring a score", () => {
    expect(Object.hasOwn(RankedOptionSchema.parse(ranked()), "scoreLabel")).toBe(false);
    for (const scoreLabel of ["Supplied score", " x \n", "s".repeat(300)]) {
      const parsed = RankedOptionSchema.parse(ranked({ scoreLabel })); expect(parsed.scoreLabel).toBe(scoreLabel); expect(Object.hasOwn(parsed, "score")).toBe(false);
    }
    for (const scoreLabel of ["", " \n\t", "bad\u0000label", "s".repeat(301), 0, null]) expect(RankedOptionSchema.safeParse({ ...ranked(), scoreLabel }).success).toBe(false);
  });

  it("OR-S19 keeps ranked values confidence and evidence identical to the shared field terms", () => {
    const supplied = ranked({ value: { nested: [false, 0, null, ""] }, confidence: 0, evidence: [evidence], rank: 3, score: 0 });
    const { rank: _rank, score: _score, ...field } = supplied;
    const parsed = RankedOptionSchema.parse(supplied), expected = InspectionFieldSchema.parse(field);
    expect(parsed.value).toEqual(expected.value); expect(parsed.confidence).toBe(expected.confidence); expect(parsed.evidence).toEqual(expected.evidence);
    expect(RankedOptionSchema.parse(ranked()).evidence).toEqual([]);
    const { value: _value, ...missing } = ranked(); expect(RankedOptionSchema.safeParse(missing).success).toBe(false);
  });

  it("OR-S20 preserves array order tied ranks gaps and independent inconsistent scores", () => {
    const parsed = RankingListSchema.parse(ranking([ranked({ id: "third", rank: 7, score: -10 }), ranked({ id: "first", rank: 2, score: 0 }), ranked({ id: "tie", rank: 7, score: 0 })]));
    if (parsed.state !== "ready") throw new Error("authored_ready_required");
    expect(parsed.list.entries.map(item => [item.id, item.rank, item.score])).toEqual([["third", 7, -10], ["first", 2, 0], ["tie", 7, 0]]);
    expect(Object.hasOwn(parsed, "selectedEntryId")).toBe(false); expect(Object.hasOwn(parsed.list, "winner")).toBe(false);
  });

  it("OR-S21 accepts ready empty rankings and bounds entries at one hundred", () => {
    const hundred = Array.from({ length: 100 }, (_, index) => ranked({ id: `entry-${index}`, rank: index + 1 }));
    expect(RankingListSchema.safeParse(ranking([])).success).toBe(true); expect(RankingListSchema.safeParse(ranking(hundred)).success).toBe(true);
    expect(RankingListSchema.safeParse(ranking([...hundred, ranked({ id: "extra" })])).success).toBe(false);
  });

  it("OR-S22 refuses duplicate ranked IDs without rejecting distinct entries tied on rank or score", () => {
    expect(RankingListSchema.safeParse(ranking([ranked(), ranked({ revision: "two" })])).success).toBe(false);
    expect(RankingListSchema.safeParse(ranking([ranked({ score: 0 }), ranked({ id: "other", score: 0 })])).success).toBe(true);
  });

  it("OR-S23 requires a complete strict list owner and keeps ready empty separate from nonready", () => {
    expect(RankingListSchema.safeParse({ ...common, state: "ready" }).success).toBe(false);
    for (const key of ["id", "revision", "label", "entries"] as const) {
      const list: Record<string, unknown> = { ...ranking().list }; delete list[key];
      expect(RankingListSchema.safeParse({ ...ranking(), list }).success).toBe(false);
    }
    expect(RankingListSchema.parse(ranking([])).state).toBe("ready");
    expect(RankingListSchema.safeParse({ ...ranking(), list: { ...ranking().list, recommendedId: "option-1" } }).success).toBe(false);
  });

  it("OR-S24 preserves omitted controlled-null and current ranked selections", () => {
    expect(Object.hasOwn(RankingListSchema.parse(ranking()), "selectedEntryId")).toBe(false);
    for (const selectedEntryId of [null, "option-1"]) {
      const parsed = RankingListSchema.parse({ ...ranking(), selectedEntryId });
      if (parsed.state !== "ready") throw new Error("authored_ready_required");
      expect(parsed.selectedEntryId).toBe(selectedEntryId);
    }
    expect(RankingListSchema.safeParse({ ...ranking([]), selectedEntryId: null }).success).toBe(true);
  });

  it("OR-S25 refuses stale ranked selection including selection inside a ready empty list", () => {
    for (const selectedEntryId of ["missing", "", 0, false]) expect(RankingListSchema.safeParse({ ...ranking(), selectedEntryId }).success).toBe(false);
    expect(RankingListSchema.safeParse({ ...ranking([]), selectedEntryId: "option-1" }).success).toBe(false);
  });

  it("OR-S26 keeps ranking states explicit with no hidden list or selection", () => {
    for (const state of ["loading", "empty", "error"]) {
      const supplied = { ...common, state, message: "Supplied state" }; expect(RankingListSchema.safeParse(supplied).success).toBe(true);
      expect(RankingListSchema.safeParse({ ...supplied, list: ranking().list }).success).toBe(false);
      expect(RankingListSchema.safeParse({ ...supplied, selectedEntryId: null }).success).toBe(false);
    }
    for (const message of [undefined, "", " \n\t", "bad\u007fmessage"]) expect(RankingListSchema.safeParse({ ...common, state: "error", message }).success).toBe(false);
  });

  it("OR-S27 refuses inferred rankings recommendations and unknown ranked properties", () => {
    for (const patch of [{ verified: true }, { sorted: true }, { recommendedId: "option-1" }, { status: "complete" }]) expect(RankingListSchema.safeParse({ ...ranking(), ...patch }).success).toBe(false);
    for (const patch of [{ selected: true }, { recommendation: "winner" }, { normalizedScore: 0.5 }]) expect(RankedOptionSchema.safeParse({ ...ranked(), ...patch }).success).toBe(false);
  });

  it("OR-S28 returns owned complete nested snapshots without mutating supplied data", () => {
    const supplied = option({ value: { nested: [false, 0, null, { end: "Complete" }] }, evidence: [evidence] });
    const before = JSON.stringify(supplied), parsed = ChoiceOptionSchema.parse(supplied);
    expect(JSON.stringify(supplied)).toBe(before); expect(parsed.value).toEqual(supplied.value); expect(parsed.value).not.toBe(supplied.value);
    expect(parsed.evidence).not.toBe(supplied.evidence);
    const shared = { complete: [0, false, null] };
    expect(RankedOptionSchema.safeParse(ranked({ value: { first: shared, second: shared } })).success).toBe(true);
  });

  it("OR-S29 refuses foreign DTO prototypes and nonobject roots while retaining null-prototype JSON", () => {
    const foreign = <T extends object>(value: T): T => Object.assign(Object.create({ inherited: true }), value) as T;
    expect(OptionSelectorSchema.safeParse(foreign(selector())).success).toBe(false);
    expect(OptionSelectorSchema.safeParse({ ...selector(), group: foreign(selector().group) }).success).toBe(false);
    expect(RankedOptionSchema.safeParse(foreign(ranked())).success).toBe(false);
    for (const value of [new Date(0), new Map([["supplied", 1]]), new Set([1])]) expect(RankedOptionSchema.safeParse({ ...ranked(), value }).success).toBe(false);
    for (const value of [undefined, null, false, 0, "", []]) { expect(OptionSelectorSchema.safeParse(value).success).toBe(false); expect(RankingListSchema.safeParse(value).success).toBe(false); }
    const value = Object.assign(Object.create(null), { complete: [false, 0, null] });
    expect(RankedOptionSchema.parse(ranked({ value })).value).toEqual({ complete: [false, 0, null] });
  });

  it("OR-S30 refuses accessors across roots owners members values and evidence without reading them", () => {
    let reads = 0;
    const accessor = <T extends object>(value: T, key: string) => Object.defineProperty(value, key, { enumerable: true, get() { reads++; return "Never read"; } });
    expect(OptionSelectorSchema.safeParse(accessor(selector(), "group")).success).toBe(false);
    expect(OptionSelectorSchema.safeParse({ ...selector(), group: accessor(selector().group, "label") }).success).toBe(false);
    expect(ChoiceOptionSchema.safeParse(accessor(option(), "value")).success).toBe(false);
    expect(RankedOptionSchema.safeParse(accessor(ranked(), "rank")).success).toBe(false);
    expect(RankingListSchema.safeParse(accessor(ranking(), "list")).success).toBe(false);
    expect(RankedOptionSchema.safeParse(ranked({ value: accessor({}, "private") })).success).toBe(false);
    expect(RankedOptionSchema.safeParse(ranked({ evidence: [accessor({ ...evidence }, "text")] })).success).toBe(false);
    expect(reads).toBe(0);
  });

  it("OR-S31 refuses symbols and hidden own data instead of silently omitting them", () => {
    const hidden = Object.defineProperty({}, "hidden", { value: "No omission", enumerable: false });
    expect(OptionSelectorSchema.safeParse({ ...selector(), [Symbol("private")]: true }).success).toBe(false);
    for (const value of [hidden, { [Symbol("private")]: true }]) expect(RankedOptionSchema.safeParse(ranked({ value })).success).toBe(false);
  });

  it("OR-S32 refuses cycles sparse arrays and nonstandard array members", () => {
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(RankedOptionSchema.safeParse({ ...ranked(), value: cyclic }).success).toBe(false);
    const sparse = new Array(2); sparse[1] = option();
    expect(OptionSelectorSchema.safeParse(selector(sparse)).success).toBe(false); expect(RankingListSchema.safeParse(ranking(sparse)).success).toBe(false);
    const extra = ["Supplied"] as string[] & { extra?: string }; extra.extra = "No omission";
    for (const value of [sparse, extra, Object.setPrototypeOf(["Supplied"], null)]) expect(RankedOptionSchema.safeParse({ ...ranked(), value }).success).toBe(false);
  });

  it("OR-S33 catches descriptor failures and never invokes supplied toJSON methods", () => {
    const trapped = new Proxy({}, { ownKeys() { throw new Error("Authored descriptor failure"); } });
    expect(OptionSelectorSchema.safeParse(trapped).success).toBe(false);
    expect(RankingListSchema.safeParse(ranking([{ ...ranked(), value: trapped } as RankedOption])).success).toBe(false);
    let calls = 0; const value = { toJSON() { calls++; return "Never serialize"; } };
    expect(ChoiceOptionSchema.safeParse({ ...option(), value }).success).toBe(false); expect(RankedOptionSchema.safeParse({ ...ranked(), value }).success).toBe(false);
    expect(calls).toBe(0);
  });

  it("OR-S34 preserves unchanged JSON node bounds and refuses unsupported or unsafe values", () => {
    const value = Array.from({ length: 199 }, () => ({ a: 0, b: false, c: null, d: "" }));
    const entries = Array.from({ length: 100 }, (_, index) => ranked({ id: `entry-${index}`, value,
      evidence: Array.from({ length: 20 }, (_, number) => ({ id: `source-${number}`, label: "Source" })) }));
    expect(RankingListSchema.safeParse(ranking(entries)).success).toBe(true);
    expect(RankedOptionSchema.safeParse({ ...ranked(), value: [...value, { a: 0, b: false, c: null, d: "" }] }).success).toBe(false);
    for (const value of [undefined, NaN, Infinity, -Infinity, BigInt(1), Symbol("supplied"), () => "supplied", JSON.parse('{"__proto__":{"supplied":false}}')]) {
      expect(ChoiceOptionSchema.safeParse({ ...option(), value }).success).toBe(false);
      expect(RankedOptionSchema.safeParse({ ...ranked(), value }).success).toBe(false);
    }
  });

  it("OR-S35 admits exactly two MiB of parsed option UTF8 JSON and refuses one extra byte", () => {
    const value = atOptionBudget(); expect(bytes(OptionSelectorSchema.parse(value))).toBe(2097152);
    expect(OptionSelectorSchema.safeParse({ ...value, description: "x" }).success).toBe(false);
    expect(OptionSelectorSchema.safeParse({ ...value, description: "é" }).success).toBe(false);
  });

  it("OR-S36 admits exactly two MiB of parsed ranking UTF8 JSON and refuses one extra byte", () => {
    const value = atRankingBudget(); expect(bytes(RankingListSchema.parse(value))).toBe(2097152);
    expect(RankingListSchema.safeParse({ ...value, description: "x" }).success).toBe(false);
    expect(RankingListSchema.safeParse({ ...value, description: "é" }).success).toBe(false);
  });

  it("OR-S37 skips whole DTO serialization when an earlier nested refinement has issues", () => {
    const supplied = ranking([ranked(), ranked({ revision: "two" })]), stringify = vi.spyOn(JSON, "stringify");
    try {
      expect(RankingListSchema.safeParse(supplied).success).toBe(false);
      expect(stringify.mock.calls.some(([value]) => value !== null && typeof value === "object" && Object.hasOwn(value, "list"))).toBe(false);
    } finally { stringify.mockRestore(); }
  });

  it("OR-S38 publishes strict four-state JSON schemas and typed reported rank fields", () => {
    for (const schema of [OptionSelectorSchema, RankingListSchema]) {
      const json = z.toJSONSchema(schema) as { oneOf?: { additionalProperties?: boolean; required?: string[] }[] };
      expect(json.oneOf).toHaveLength(4);
      for (const variant of json.oneOf ?? []) { expect(variant.additionalProperties).toBe(false); expect(variant.required).toEqual(expect.arrayContaining(["id", "revision", "title", "state"])); }
    }
    const json = z.toJSONSchema(RankedOptionSchema) as { additionalProperties?: boolean; required?: string[]; properties?: Record<string, unknown> };
    expect(json.additionalProperties).toBe(false); expect(json.required).toEqual(expect.arrayContaining(["id", "revision", "label", "value", "rank", "evidence"]));
    expect(json.required).not.toContain("score"); expect(json.required).not.toContain("scoreLabel");
    expect(json.properties?.rank).toMatchObject({ type: "integer", minimum: 1, maximum: 1000000 });
    expect(json.properties?.score).toMatchObject({ type: "number", minimum: -1000000000000, maximum: 1000000000000 });
  });

  it("OR-S39 routes public schemas and payload validation to the new owners", () => {
    expect(publicSchemas.ChoiceOptionSchema).toBe(ChoiceOptionSchema); expect(publicSchemas.RankedOptionSchema).toBe(RankedOptionSchema);
    expect(publicSchemas.OptionSelectorSchema).toBe(OptionSelectorSchema); expect(publicSchemas.RankingListSchema).toBe(RankingListSchema);
    expect(publicSchemas.schemaBySlug["option-selector"]).toBe(OptionSelectorSchema); expect(publicSchemas.schemaBySlug["ranking-list"]).toBe(RankingListSchema);
    expect(publicSchemas.RecommendationCardSchema).toBe(publicSchemas.GenericComponentSchema);
    const choices = { version: 1, kind: "mcpcn/option-selector", data: selector() };
    const rankedList = { version: 1, kind: "mcpcn/ranking-list", data: ranking() };
    expect(publicSchemas.validatePayload(choices, OptionSelectorSchema).success).toBe(true);
    expect(publicSchemas.validatePayload(rankedList, RankingListSchema).success).toBe(true);
    expect(publicSchemas.validatePayload({ ...choices, data: { title: "Legacy generic", items: [] } }, OptionSelectorSchema).success).toBe(false);
    expect(publicSchemas.validatePayload({ ...rankedList, data: { title: "Legacy generic", items: [] } }, RankingListSchema).success).toBe(false);
  });

  it("OR-S40 canonicalizes object key order while preserving meaningful supplied ranking terms", () => {
    const first = RankingListSchema.parse(ranking([ranked({ value: { a: false, b: { c: 0 } }, evidence: [evidence], score: 0, scoreLabel: "Supplied" })]));
    const reordered = RankingListSchema.parse(ranking([ranked({ value: { b: { c: 0 }, a: false }, evidence: [evidence], score: 0, scoreLabel: "Supplied" })]));
    expect(stableReviewKey(first)).toBe(stableReviewKey(reordered));
    for (const patch of [{ revision: "two" }, { label: "Replacement" }, { value: false }, { confidence: 0 }, { evidence: [] }, { rank: 2 }, { score: 1 }, { scoreLabel: "Replacement" }]) {
      expect(stableReviewKey(RankingListSchema.parse(ranking([ranked({ value: { a: false, b: { c: 0 } }, evidence: [evidence], score: 0, scoreLabel: "Supplied", ...patch })])))).not.toBe(stableReviewKey(first));
    }
  });
});

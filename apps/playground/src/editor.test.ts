import { describe, expect, it } from "vitest";
import { fixtureResult, parseInput, parseResult } from "./editor.js";
import { makeFixture } from "./fixtures.js";

describe("playground invocation editor", () => {
  it("preserves tool arguments as an object instead of wrapping them", () => {
    expect(parseInput('{"recordId":"authored-42","approved":false}')).toEqual({ recordId: "authored-42", approved: false });
  });
  it("refuses malformed and non-object input before invocation", () => {
    for (const value of ["{", "null", "[]", '"value"']) expect(() => parseInput(value)).toThrow();
  });
  it("enforces the input byte limit for multibyte text", () => {
    expect(() => parseInput(JSON.stringify({ text: "😀".repeat(5000) }))).toThrow("16 KiB");
  });
  it("refuses nonfinite or deeply nested arguments and UI-only metadata", () => {
    expect(() => parseInput('{"value":1e999}')).toThrow("JSON structure");
    let nested: unknown = "authored";
    for (let depth = 0; depth < 20; depth++) nested = { value: nested };
    expect(() => parseInput(JSON.stringify({ nested }))).toThrow("JSON structure");
    expect(() => parseResult(JSON.stringify({ ...fixtureResult(makeFixture("approval-card")), _meta: { nested } }))).toThrow("JSON structure");
  });
  it("accepts a bare component envelope without inventing private metadata", () => {
    const payload = makeFixture("approval-card");
    const result = parseResult(JSON.stringify(payload));
    expect(result.structuredContent).toEqual(payload); expect(result.content).toEqual([]); expect(result._meta).toBeUndefined();
  });
  it("keeps UI-only metadata separate from the shared component envelope", () => {
    const result = fixtureResult(makeFixture("approval-card"));
    const parsed = parseResult(JSON.stringify(result));
    expect(parsed._meta).toEqual({ privateFixtureNote: "LOCAL_UI_ONLY_CANARY" });
    expect(JSON.stringify(parsed.structuredContent)).not.toContain("LOCAL_UI_ONLY_CANARY");
    expect(parsed.content).toEqual(result.content);
  });
  it("refuses invalid component data, metadata and non-text content", () => {
    const valid = fixtureResult(makeFixture("approval-card"));
    for (const value of [{ structuredContent: { kind: "mcpcn/approval-card", version: 1, data: { title: 42 } } },
      { ...valid, _meta: [] }, { ...valid, isError: "false" }, { ...valid, content: [{ type: "image", data: "authored" }] }]) {
      expect(() => parseResult(JSON.stringify(value))).toThrow();
    }
  });
  it("retains an explicit tool-error flag without converting it to success", () => {
    const result = parseResult(JSON.stringify({ ...fixtureResult(makeFixture("approval-card")), isError: true }));
    expect(result.isError).toBe(true);
  });
  it("enforces result and text-block bounds before sending", () => {
    const valid = fixtureResult(makeFixture("approval-card"));
    expect(() => parseResult(JSON.stringify({ ...valid, _meta: { text: "😀".repeat(20000) } }))).toThrow("64 KiB");
    expect(() => parseResult(JSON.stringify({ ...valid, content: Array.from({ length: 21 }, () => ({ type: "text", text: "fixture" })) }))).toThrow("twenty");
  });
});

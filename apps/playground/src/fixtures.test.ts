import { describe, expect, it } from "vitest";
import { makeFixture, playgroundItems, schemaFor, validateFixture } from "./fixtures";

describe("playground authored fixture boundary", () => {
  it("covers all 79 unique catalogue identities with honest implementation kinds", () => {
    expect(playgroundItems).toHaveLength(79);
    expect(new Set(playgroundItems.map(item => item.slug)).size).toBe(79);
    expect(["specialized", "generic-alias", "primitive", "workflow-block"].map(kind => playgroundItems.filter(item => item.kind === kind).length)).toEqual([35, 21, 12, 11]);
    for (const item of playgroundItems) {
      const fixture = makeFixture(item.slug);
      expect(fixture.kind).toBe(`mcpcn/${item.slug}`);
      expect(validateFixture(fixture)).toMatchObject({ success: true });
    }
  });
  it("returns fresh parsed snapshots without sharing fixture or caller state", () => {
    const first = makeFixture("comparison-matrix");
    const second = makeFixture("comparison-matrix");
    expect(first).toEqual(second);
    expect(first.data).not.toBe(second.data);
    const parsed = validateFixture(first);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.data).not.toBe(first.data);
  });
  it("uses owned schemas for specialized and generic entries only", () => {
    for (const item of playgroundItems) {
      const schema = schemaFor(item.slug);
      if (["document-preview", "source-list", "evidence-drawer"].includes(item.slug)) {
        const variants = (schema?.oneOf ?? schema?.anyOf) as unknown[];
        expect(variants).toHaveLength(item.slug === "document-preview" ? 5 : 4);
        for (const variant of variants) expect(variant).toMatchObject({ type: "object" });
      } else if (item.kind === "specialized" || item.kind === "generic-alias") expect(schema).toMatchObject({ type: "object" });
      else expect(schema).toBeUndefined();
    }
    expect(schemaFor("not-a-catalogue-entry")).toBeUndefined();
  });
  it("preserves edited primitive and block text instead of replacing it with example content", () => {
    const card = { kind: "mcpcn/card", version: 1, data: { title: "Edited heading", description: "Edited body" } };
    expect(validateFixture(card)).toEqual({ success: true, data: card });
    const block = makeFixture("collect-missing-data");
    const edited = { ...block, data: { ...block.data as object, values: { subject: "Edited subject", notes: "Edited notes" } } };
    expect(validateFixture(edited)).toEqual({ success: true, data: edited });
  });
  it("refuses unknown envelopes, slugs, callback props and duplicate primitive identities", () => {
    for (const value of [null, { ...makeFixture("card"), version: 2 }, { ...makeFixture("card"), kind: "mcpcn/unknown" },
      { ...makeFixture("button"), data: { label: "Click", onClick: "not a callback" } },
      { kind: "mcpcn/tabs", version: 1, data: { items: [{ value: "a", label: "A", content: "One" }, { value: "a", label: "B", content: "Two" }] } }]) expect(validateFixture(value).success).toBe(false);
  });
  it("refuses malformed specialized controlled selections and foreign block values", () => {
    expect(validateFixture({ ...makeFixture("risk-review-panel"), data: { reviewId: "r", title: "Review", risks: [], acknowledgedRiskIds: ["foreign"] } }).success).toBe(false);
    const fixture = makeFixture("table-bulk-action-review");
    expect(validateFixture({ ...fixture, data: { ...fixture.data as object, value: ["foreign"] } }).success).toBe(false);
    const form = makeFixture("collect-missing-data");
    expect(validateFixture({ ...form, data: { ...form.data as object, values: { foreign: "value" } } }).success).toBe(false);
    expect(validateFixture({ kind: "mcpcn/badge", version: 1, data: { label: "Risk", risk: ["critical"] } }).success).toBe(false);
    const review = makeFixture("review-before-action");
    expect(validateFixture({ ...review, data: { ...review.data as object, riskLevel: ["high"] } }).success).toBe(false);
    expect(validateFixture({ ...form, data: { ...form.data as object, fields: [{ name: "subject", label: "Subject", type: ["text"] }] } }).success).toBe(false);
  });
  it("refuses link-bearing preview data and non-metadata file fixture props", () => {
    expect(validateFixture({ ...makeFixture("source-evidence-panel"), data: { reviewId: "r", title: "Evidence", sources: [{ id: "s", label: "Source", url: "https://example.com" }] } }).success).toBe(false);
    const file = makeFixture("file-upload-and-extract");
    expect(validateFixture({ ...file, data: { ...file.data as object, file: { bytes: "not retained" } } }).success).toBe(false);
    expect(validateFixture({ ...file, data: { title: "File", maxFileBytes: 1048577 } }).success).toBe(false);
  });
  it("refuses cycles, getters, nonfinite numbers and oversized data before schema traversal", () => {
    let reads = 0;
    const getter = { version: 1, data: {} };
    Object.defineProperty(getter, "kind", { enumerable: true, get() { reads++; return "mcpcn/card"; } });
    expect(validateFixture(getter).success).toBe(false);
    expect(reads).toBe(0);
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    for (const data of [cycle, { title: "Card", value: Infinity }, { title: "x".repeat(8193) }]) expect(validateFixture({ kind: "mcpcn/record-inspector", version: 1, data }).success).toBe(false);
  });
});

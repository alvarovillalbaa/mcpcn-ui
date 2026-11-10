import { describe, expect, it } from "vitest";
import { schemaBySlug } from "./index.js";
import { decisionNarrativeCases, decisionNarrativeData, mutableNarrative, narrativeReport, firstNarrativeField } from "../../../tests/fixtures/decision-narratives.js";

// T2 authored bounded reports; no model, provider or live account.
describe.each(decisionNarrativeCases)("decision report schema $slug", row => {
  const schema = schemaBySlug[row.slug], clone = () => mutableNarrative(row);
  it("DN-S01 preserves the complete valid supplied report", () => {
    const parsed = schema.parse(row.data); expect(parsed).toEqual(row.data); expect(JSON.stringify(parsed)).toContain("VALUE_END");
  });
  it("DN-S02 rejects unknown root, report and action properties", () => {
    for (const target of ["root", "report", "action"]) {
      const data = clone(), object = target === "root" ? data : target === "report" ? narrativeReport(data) : data.action as Record<string, unknown>;
      object.unexpected = "do not silently strip"; expect(schema.safeParse(data).success).toBe(false);
    }
  });
  it("DN-S03 requires this report only in the ready branch", () => {
    const data = clone(); delete data[row.report]; expect(schema.safeParse(data).success).toBe(false);
    data.state = "empty"; delete data.action; expect(schema.safeParse(data).success).toBe(true);
    data[row.report] = narrativeReport(clone()); expect(schema.safeParse(data).success).toBe(false);
  });
  it("DN-S04 distinguishes loading, empty and required nonblank failure messages", () => {
    const root = { id: row.data.id, revision: "one", title: "Authored report" };
    for (const state of ["loading", "empty"] as const) expect(schema.safeParse({ ...root, state }).success).toBe(true);
    expect(schema.safeParse({ ...root, state: "error" }).success).toBe(false);
    expect(schema.safeParse({ ...root, state: "error", message: " " }).success).toBe(false);
    expect(schema.safeParse({ ...root, state: "error", message: "Authored failure" }).success).toBe(true);
  });
  it("DN-S05 rejects root and nested accessors without invoking them", () => {
    for (const nested of [false, true]) {
      const data = clone(); let reads = 0;
      Object.defineProperty(nested ? firstNarrativeField(data) : data, nested ? "value" : "title", { enumerable: true, get() { reads += 1; throw new Error("private getter"); } });
      expect(() => schema.safeParse(data)).not.toThrow(); expect(schema.safeParse(data).success).toBe(false); expect(reads).toBe(0);
    }
  });
  it("DN-S06 rejects cyclic, foreign, symbolic, hidden and sparse DTO input", () => {
    for (const mode of ["cycle", "prototype", "symbol", "hidden", "sparse"]) {
      const data = clone();
      if (mode === "cycle") firstNarrativeField(data).value = data;
      if (mode === "prototype") Object.setPrototypeOf(narrativeReport(data), { inherited: true });
      if (mode === "symbol") Object.defineProperty(data, Symbol("private"), { value: true });
      if (mode === "hidden") Object.defineProperty(data, "hidden", { value: true });
      if (mode === "sparse") firstNarrativeField(data).value = new Array(2);
      expect(schema.safeParse(data).success).toBe(false);
    }
  });
  it("DN-S07 rejects nonfinite, oversize and excessive-depth complete values", () => {
    for (const value of [NaN, Infinity, { x: "x".repeat(10001) }, Array.from({ length: 201 }, () => null)]) {
      const data = clone(); firstNarrativeField(data).value = value; expect(schema.safeParse(data).success).toBe(false);
    }
    const data = clone(); let value: unknown = null; for (let i = 0; i < 20; i++) value = { nested: value };
    firstNarrativeField(data).value = value; expect(schema.safeParse(data).success).toBe(false);
    const oversized = clone(), report = narrativeReport(oversized), field = firstNarrativeField(oversized);
    const member = (index: number) => ({ ...field, id: index ? `option-${index}` : "option-a", value: Array.from({ length: 6 }, () => "界".repeat(10000)) });
    if (row.slug === "recommendation-card") { report.option = member(0); report.alternatives = Array.from({ length: 12 }, (_, i) => member(i + 1)); }
    if (row.slug === "tradeoff-panel") report.options = Array.from({ length: 12 }, (_, i) => ({ option: member(i), benefits: [], costs: [], uncertainties: [] }));
    if (row.slug === "decision-memo") report.options = Array.from({ length: 12 }, (_, i) => member(i));
    if (row.slug === "reasoning-summary") report.points = Array.from({ length: 12 }, (_, i) => ({ finding: member(i), explanation: "Authored explanation." }));
    const result = schema.safeParse(oversized); expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(issue => issue.message.includes("complete parsed decision report"))).toBe(true);
  });
  it("DN-S08 accepts an absent action and explicit true/false availability without defaults", () => {
    const data = clone(); delete data.action; expect(schema.parse(data)).not.toHaveProperty("action");
    for (const available of [true, false]) {
      data.action = { ...row.data.action, available }; expect(schema.safeParse(data).success).toBe(true);
    }
    data.action = { ...row.data.action, available: "true" }; expect(schema.safeParse(data).success).toBe(false);
  });
  it("DN-S09 preserves zero confidence and distinguishes absent confidence", () => {
    const data = clone(); expect(firstNarrativeField(schema.parse(data) as unknown as Record<string, unknown>).confidence).toBe(0);
    delete firstNarrativeField(data).confidence;
    expect(firstNarrativeField(schema.parse(data) as unknown as Record<string, unknown>)).not.toHaveProperty("confidence");
    expect(firstNarrativeField(data).value).toEqual({ first: 0, second: false, third: null, fourth: { complete: "VALUE_END <script>never execute</script>" } });
  });
  it("DN-S10 refuses blank/control labels, invalid revisions and unsafe evidence URLs", () => {
    for (const patch of [{ title: " " }, { title: "bad\u0000text" }, { revision: "bad revision" }, { id: 7 }]) expect(schema.safeParse({ ...clone(), ...patch }).success).toBe(false);
    const data = clone(); firstNarrativeField(data).evidence = [{ id: "unsafe", label: "Unsafe link", url: "javascript:alert(1)" }];
    expect(schema.safeParse(data).success).toBe(false);
  });
});

describe("T2 distinct decision narrative relationships", () => {
  it("DN-S11 rejects duplicate alternatives", () => {
    const data = structuredClone(decisionNarrativeData["recommendation-card"]); data.recommendation.alternatives.push(data.recommendation.alternatives[0]!);
    expect(schemaBySlug["recommendation-card"].safeParse(data).success).toBe(false);
  });
  it("DN-S12 rejects the recommended option as its own alternative", () => {
    const data = mutableNarrative(decisionNarrativeCases[0]); narrativeReport(data).alternatives = [firstNarrativeField(data)];
    expect(schemaBySlug["recommendation-card"].safeParse(data).success).toBe(false);
  });
  it("DN-S13 preserves tradeoff order and accepts independent empty lists", () => {
    const data = structuredClone(decisionNarrativeData["tradeoff-panel"]); data.analysis.options.reverse();
    expect(schemaBySlug["tradeoff-panel"].parse(data)).toEqual(data);
    data.analysis.options.pop(); expect(schemaBySlug["tradeoff-panel"].safeParse(data).success).toBe(false);
  });
  it("DN-S14 rejects duplicate tradeoff option identities", () => {
    const data = structuredClone(decisionNarrativeData["tradeoff-panel"]); data.analysis.options[1] = data.analysis.options[0]!;
    expect(schemaBySlug["tradeoff-panel"].safeParse(data).success).toBe(false);
  });
  it("DN-S15 rejects stale choices, missing decided choices and chosen deferred memos", () => {
    for (const patch of [{ status: "decided", decisionOptionId: null }, { status: "deferred", decisionOptionId: "option-a" }, { status: "proposed", decisionOptionId: "stale" }]) {
      const data = mutableNarrative(decisionNarrativeCases[2]); Object.assign(narrativeReport(data), patch);
      expect(schemaBySlug["decision-memo"].safeParse(data).success).toBe(false);
    }
  });
  it("DN-S16 accepts proposed/deferred without a choice and does not infer follow-up completion", () => {
    for (const status of ["proposed", "deferred"]) {
      const data = mutableNarrative(decisionNarrativeCases[2]); Object.assign(narrativeReport(data), { status, decisionOptionId: null });
      expect(schemaBySlug["decision-memo"].parse(data)).toEqual(data);
    }
  });
  it("DN-S17 rejects duplicate findings and requires at least one explanation", () => {
    const data = mutableNarrative(decisionNarrativeCases[3]), report = narrativeReport(data), points = report.points as unknown[];
    points.push(points[0]); expect(schemaBySlug["reasoning-summary"].safeParse(data).success).toBe(false);
    report.points = []; expect(schemaBySlug["reasoning-summary"].safeParse(data).success).toBe(false);
  });
  it("DN-S18 preserves an explicitly empty limitations list", () => {
    const data = mutableNarrative(decisionNarrativeCases[3]); narrativeReport(data).limitations = [];
    expect(schemaBySlug["reasoning-summary"].parse(data)).toEqual(data);
  });
});

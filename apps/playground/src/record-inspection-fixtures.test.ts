import { describe, expect, it } from "vitest";
import { RecordInspectorSchema, FieldConfidenceListSchema, schemaBySlug } from "@mcpcn/schemas";
import { controlledData } from "./component-preview";
import { makeFixture, playgroundItems, validateFixture } from "./fixtures";
import { parseResult } from "./editor";
import { authoredInspectionFields, authoredRecordInspector, authoredFieldConfidenceList, recordInspectorStateFixtures, fieldConfidenceStateFixtures } from "./record-inspection-fixtures";

const recordScope = { componentId: "record-inspector-1", componentRevision: "1", recordId: "record-1", recordRevision: "1", fieldId: "profile", fieldRevision: "1" };
const confidenceScope = { componentId: "confidence-list-1", componentRevision: "1", fieldId: "profile", fieldRevision: "1" };
const envelope = (data: unknown, slug = "record-inspector") => ({ kind: `mcpcn/${slug}`, version: 1, data });

describe("record inspection playground consumers", () => {
  it("RI-F01 preserves all identities while dispatching the two new dedicated schemas", () => {
    expect(playgroundItems).toHaveLength(79);
    expect(playgroundItems.filter(item => item.kind === "specialized")).toHaveLength(41);
    expect(playgroundItems.filter(item => item.kind === "generic-alias")).toHaveLength(15);
    for (const slug of ["record-inspector", "field-confidence-list"] as const) {
      const fixture = makeFixture(slug);
      expect(validateFixture(fixture).success).toBe(true); expect(schemaBySlug[slug].safeParse(fixture.data).success).toBe(true);
    }
  });
  it("RI-F02 round-trips detached complete nested and falsy values inside current editor bounds", () => {
    for (const slug of ["record-inspector", "field-confidence-list"] as const) {
      const first = makeFixture(slug), second = makeFixture(slug);
      expect(first).toEqual(second); expect(first.data).not.toBe(second.data);
      expect(new TextEncoder().encode(JSON.stringify(first)).byteLength).toBeLessThan(65536);
      expect(parseResult(JSON.stringify(first)).structuredContent).toEqual(first);
      expect(JSON.stringify(first)).toContain("END-RECORD-JSON"); expect(JSON.stringify(first)).toContain("END-RECORD-EVIDENCE");
    }
    expect(authoredInspectionFields.map(field => field.value).slice(1)).toEqual([false, 0, "", null]);
  });
  it("RI-F03 supplies all four explicit states and valid ready-empty views without stale selection", () => {
    for (const [variants, schema] of [[recordInspectorStateFixtures, RecordInspectorSchema], [fieldConfidenceStateFixtures, FieldConfidenceListSchema]] as const) {
      expect(variants.map(view => view.state)).toEqual(["ready", "loading", "empty", "error", "ready"]);
      for (const view of variants) {
        const parsed = schema.parse(view);
        if (parsed.state !== "ready") { expect(Object.hasOwn(parsed, "selectedFieldId")).toBe(false); expect(Object.hasOwn(parsed, "fields")).toBe(false); expect(Object.hasOwn(parsed, "record")).toBe(false); }
      }
      const empty = schema.parse(variants[4]); expect(empty.state).toBe("ready");
      if (empty.state === "ready") expect("record" in empty ? empty.record.fields : empty.fields).toHaveLength(0);
    }
  });
  it("RI-F04 preserves supplied confidence zero and absence without inventing a threshold", () => {
    const parsed = FieldConfidenceListSchema.parse(authoredFieldConfidenceList); expect(parsed.state).toBe("ready");
    if (parsed.state !== "ready") throw new Error("Ready authored confidence fixture required");
    expect(parsed.fields.find(field => field.id === "profile")?.confidence).toBe(0);
    expect(parsed.fields.find(field => field.id === "count")?.confidence).toBe(1);
    const absent = parsed.fields.find(field => field.id === "approved");
    if (!absent) throw new Error("Authored field without confidence required");
    expect(Object.hasOwn(absent, "confidence")).toBe(false);
  });
  it("RI-F05 echoes only current controlled inspection and clear requests without private values", () => {
    expect(controlledData("record-inspector", authoredRecordInspector, { type: "inspect-record-field", data: recordScope })).toEqual({ selectedFieldId: "profile" });
    expect(controlledData("field-confidence-list", authoredFieldConfidenceList, { type: "inspect-confidence-field", data: confidenceScope })).toEqual({ selectedFieldId: "profile" });
    expect(controlledData("record-inspector", authoredRecordInspector, { type: "clear-record-field", data: { componentId: "record-inspector-1", componentRevision: "1", recordId: "record-1", recordRevision: "1" } })).toEqual({ selectedFieldId: null });
    for (const patch of [{ componentRevision: "old" }, { recordRevision: "old" }, { fieldRevision: "old" }, { fieldId: "foreign" }]) {
      expect(controlledData("record-inspector", authoredRecordInspector, { type: "inspect-record-field", data: { ...recordScope, ...patch } })).toBeUndefined();
    }
  });
  it("RI-F06 leaves absent local selection local and refuses requests against nonready views", () => {
    const { selectedFieldId: _selected, ...local } = authoredRecordInspector;
    expect(controlledData("record-inspector", local, { type: "inspect-record-field", data: recordScope })).toBeUndefined();
    for (const view of recordInspectorStateFixtures) if (view.state !== "ready") {
      expect(controlledData("record-inspector", view, { type: "inspect-record-field", data: recordScope })).toBeUndefined();
    }
    expect(RecordInspectorSchema.safeParse({ ...authoredRecordInspector, selectedFieldId: "foreign" }).success).toBe(false);
  });
  it("RI-F07 admits only schema-owned safe evidence URLs and treats JSON URL keys as inert data", () => {
    expect(validateFixture(envelope(authoredRecordInspector)).success).toBe(true);
    const data = { ...authoredFieldConfidenceList, fields: [{ id: "json", revision: "1", label: "JSON", value: { url: "plain JSON", href: false } }] };
    expect(validateFixture(envelope(data, "field-confidence-list")).success).toBe(true);
    const unsafe = { ...authoredRecordInspector, record: { ...authoredRecordInspector.record, fields: [{ ...authoredInspectionFields[0], evidence: [{ id: "unsafe", label: "Unsafe", url: "javascript:alert(1)" }] }] } };
    expect(validateFixture(envelope(unsafe)).success).toBe(false);
    expect(validateFixture(envelope({ title: "Closed alias", items: [{ url: "https://example.com" }] }, "reasoning-summary")).success).toBe(false);
  });
  it("RI-F08 refuses accessors and unsafe nested keys before invoking authored code", () => {
    let invoked = 0; const candidate = { version: 1, data: authoredRecordInspector };
    Object.defineProperty(candidate, "kind", { enumerable: true, get() { invoked++; return "mcpcn/record-inspector"; } });
    expect(validateFixture(candidate).success).toBe(false); expect(invoked).toBe(0);
    const data = { ...authoredFieldConfidenceList, fields: [{ id: "unsafe", revision: "1", label: "Unsafe", value: JSON.parse('{"__proto__":{"hidden":true}}') }] };
    expect(validateFixture(envelope(data, "field-confidence-list")).success).toBe(false);
  });
  it("RI-F09 keeps the smaller shared editor budgets distinct from complete native values", () => {
    const data = { ...authoredFieldConfidenceList, fields: [{ id: "long", revision: "1", label: "Long", value: "x".repeat(8193) }] };
    expect(FieldConfidenceListSchema.safeParse(data).success).toBe(true);
    expect(validateFixture(envelope(data, "field-confidence-list")).success).toBe(false);
    expect(() => parseResult(" ".repeat(65537))).toThrow("64 KiB");
  });
  it("RI-F10 refuses former generic payloads and UI-only fields without mutating canonical fixtures", () => {
    const before = JSON.stringify([authoredRecordInspector, authoredFieldConfidenceList]);
    for (const slug of ["record-inspector", "field-confidence-list"] as const) {
      expect(validateFixture(envelope({ title: "Generic", items: [] }, slug)).success).toBe(false);
      for (const extra of [{ busy: true }, { onAction: "callback" }, { error: "UI only" }]) {
        const fixture = makeFixture(slug); expect(validateFixture({ ...fixture, data: { ...fixture.data as object, ...extra } }).success).toBe(false);
      }
    }
    expect(JSON.stringify([authoredRecordInspector, authoredFieldConfidenceList])).toBe(before);
  });
});

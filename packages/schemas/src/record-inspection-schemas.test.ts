import { describe, expect, it } from "vitest";
import { z } from "zod";
import { InspectableJSONSchema } from "./execution-schemas.js";
import { FileExtractionFieldSchema, stableReviewKey } from "./file-review-schemas.js";
import {
  InspectionFieldSchema, RecordInspectorSchema, FieldConfidenceListSchema,
  type InspectionField,
} from "./record-inspection-schemas.js";

const common = { id: "component-1", revision: "component-revision-1", title: "Authored record inspection" };
const field = (patch: Partial<InspectionField> = {}): InspectionField => ({ id: "field-1", revision: "field-revision-1", label: "Authored field", value: null, ...patch });
const record = (fields: InspectionField[] = [field()]) => ({ ...common, state: "ready" as const, record: { id: "record-1", revision: "record-revision-1", label: "Authored record", fields } });
const list = (fields: InspectionField[] = [field()]) => ({ ...common, state: "ready" as const, fields });
const evidence = { id: "evidence-1", label: "Supplied note", text: "Complete authored evidence.\n", url: "https://example.test/source?q=authored#note" };
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

function atBudget(kind: "record" | "list") {
  const fields = Array.from({ length: 100 }, (_, index) => ({
    id: `field-${index}`, revision: "one", label: "Field", value: "",
    evidence: Array.from({ length: 20 }, (_, number) => ({ id: `evidence-${number}`, label: "Evidence", text: "" })),
  }));
  const value = { ...(kind === "record" ? record(fields) : list(fields)), description: "" };
  const schema = kind === "record" ? RecordInspectorSchema : FieldConfidenceListSchema;
  let remaining = 2097152 - bytes(schema.parse(value));
  const fill = (maximum: number) => {
    const amount = Math.min(remaining, maximum * 2); remaining -= amount;
    return "é".repeat(Math.floor(amount / 2)) + (amount % 2 ? "x" : "");
  };
  for (const item of fields) item.value = fill(10000);
  for (const item of fields) for (const source of item.evidence) source.text = fill(4000);
  if (remaining !== 0) throw new Error("authored_budget_fixture_incomplete");
  return value;
}

describe("record inspection schemas", () => {
  it("RI-S01 requires a complete field value while preserving all falsy primitives", () => {
    for (const value of [null, false, true, 0, -0, 4.5, "", " \n\t", "<script>authored()</script>"]) {
      expect(InspectionFieldSchema.parse(field({ value })).value).toEqual(value);
    }
    const { value: _value, ...missing } = field();
    expect(InspectionFieldSchema.safeParse(missing).success).toBe(false);
    expect(InspectionFieldSchema.safeParse({ ...field(), value: undefined }).success).toBe(false);
  });

  it("RI-S02 owns complete nested values without changing arrays keys or text", () => {
    const value = { nested: [null, false, 0, "", { end: "Complete <em>authored</em> text.\n" }] };
    const parsed = InspectionFieldSchema.parse(field({ value }));
    expect(parsed.value).toEqual(value); expect(parsed.value).not.toBe(value);
    if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) throw new Error("authored_object_required");
    expect(parsed.value.nested).not.toBe(value.nested);
  });

  it("RI-S03 defaults only evidence and distinguishes absent confidence from zero", () => {
    const absent = InspectionFieldSchema.parse(field());
    expect(absent.evidence).toEqual([]); expect(Object.hasOwn(absent, "confidence")).toBe(false);
    expect(InspectionFieldSchema.parse(field({ confidence: 0 })).confidence).toBe(0);
    expect(InspectionFieldSchema.parse(field({ confidence: 1 })).confidence).toBe(1);
  });

  it("RI-S04 refuses nonfinite out-of-range and coerced confidence", () => {
    for (const confidence of [NaN, Infinity, -Infinity, -0.001, 1.001, "0.5", null, false]) {
      expect(InspectionFieldSchema.safeParse({ ...field(), confidence }).success).toBe(false);
    }
    expect(InspectionFieldSchema.parse(field({ confidence: 0.125 })).confidence).toBe(0.125);
  });

  it("RI-S05 uses the existing safe120 identity and revision contract", () => {
    expect(InspectionFieldSchema.safeParse(field({ id: "i".repeat(120), revision: "r".repeat(120) })).success).toBe(true);
    for (const value of ["", " ", " field", "field ", "bad\nidentity", "bad\u007fidentity", "i".repeat(121), "__proto__", "prototype", "constructor"]) {
      expect(InspectionFieldSchema.safeParse(field({ id: value })).success).toBe(false);
      expect(InspectionFieldSchema.safeParse(field({ revision: value })).success).toBe(false);
    }
  });

  it("RI-S06 preserves visible300 labels and refuses blank hidden or oversized labels", () => {
    expect(InspectionFieldSchema.parse(field({ label: "l".repeat(300) })).label).toHaveLength(300);
    expect(InspectionFieldSchema.parse(field({ label: "  Full label\n" })).label).toBe("  Full label\n");
    for (const label of ["", " \n\t", "\u0000", "bad\u007flabel", "l".repeat(301)]) expect(InspectionFieldSchema.safeParse(field({ label })).success).toBe(false);
  });

  it("RI-S07 reuses complete strict extracted-field evidence without inferring trust", () => {
    const supplied = field({ confidence: 0.5, evidence: [evidence] });
    const old = FileExtractionFieldSchema.parse({ id: supplied.id, label: supplied.label, original: "Authored", evidence: supplied.evidence });
    expect(InspectionFieldSchema.parse(supplied).evidence).toEqual(old.evidence);
    expect(InspectionFieldSchema.safeParse(field({ evidence: [{ ...evidence, text: "é".repeat(4000) }] })).success).toBe(true);
    expect(InspectionFieldSchema.safeParse(field({ evidence: [{ ...evidence, text: "x".repeat(4001) }] })).success).toBe(false);
  });

  it("RI-S08 refuses unknown evidence properties instead of dropping verification claims", () => {
    expect(InspectionFieldSchema.safeParse({ ...field(), evidence: [{ ...evidence, verified: true }] }).success).toBe(false);
    expect(InspectionFieldSchema.safeParse({ ...field(), evidence: [{ ...evidence, confidence: 1 }] }).success).toBe(false);
  });

  it("RI-S09 bounds evidence lists at20 and requires unique current evidence identities", () => {
    const supplied = Array.from({ length: 20 }, (_, index) => ({ ...evidence, id: `evidence-${index}` }));
    expect(InspectionFieldSchema.parse(field({ evidence: supplied })).evidence).toHaveLength(20);
    expect(InspectionFieldSchema.safeParse(field({ evidence: [...supplied, { ...evidence, id: "extra" }] })).success).toBe(false);
    expect(InspectionFieldSchema.safeParse(field({ evidence: [evidence, evidence] })).success).toBe(false);
  });

  it("RI-S10 keeps evidence identity uniqueness scoped to each field", () => {
    const parsed = RecordInspectorSchema.parse(record([field({ evidence: [evidence] }), field({ id: "field-2", evidence: [evidence] })]));
    if (parsed.state !== "ready") throw new Error("authored_ready_required");
    expect(parsed.record.fields.map(item => item.evidence[0]?.id)).toEqual(["evidence-1", "evidence-1"]);
  });

  it("RI-S11 retains the existing credential-free absolute HTTP evidence URL boundary", () => {
    expect(InspectionFieldSchema.safeParse(field({ evidence: [{ ...evidence, url: "http://example.test/a%20b" }] })).success).toBe(true);
    for (const url of ["javascript:alert(1)", "data:text/plain,x", "file:///tmp/authored", "/relative", "//example.test", "https://user:pass@example.test", "https://example.test/a b", " https://example.test", "https://example.test/\n", "https://example.test/" + "x".repeat(2048)]) {
      expect(InspectionFieldSchema.safeParse(field({ evidence: [{ ...evidence, url }] })).success).toBe(false);
    }
  });

  it("RI-S12 refuses unsupported omitted or reinterpreted JSON values", () => {
    for (const value of [undefined, NaN, Infinity, BigInt(1), Symbol("authored"), () => "authored"]) {
      expect(InspectionFieldSchema.safeParse({ ...field(), value }).success).toBe(false);
    }
  });

  it("RI-S13 preserves legitimate JSON constructor and prototype property names", () => {
    const value = { constructor: { prototype: false }, prototype: [0, null, ""] };
    expect(InspectableJSONSchema.safeParse(value).success).toBe(true);
    expect(InspectionFieldSchema.parse(field({ value })).value).toEqual(value);
  });

  it("RI-S14 keeps the existing per-value string and serialization limits", () => {
    expect(InspectionFieldSchema.safeParse(field({ value: "é".repeat(10000) })).success).toBe(true);
    expect(InspectionFieldSchema.safeParse(field({ value: "x".repeat(10001) })).success).toBe(false);
    const large = Array.from({ length: 10 }, () => "x".repeat(7000));
    expect(InspectableJSONSchema.safeParse(large).success).toBe(false);
    expect(InspectionFieldSchema.safeParse(field({ value: large })).success).toBe(false);
  });

  it("RI-S15 allows all eight JSON nesting levels through the record DTO shell", () => {
    let value: unknown = null;
    for (let depth = 0; depth < 8; depth++) value = [value];
    expect(InspectableJSONSchema.safeParse(value).success).toBe(true);
    expect(RecordInspectorSchema.safeParse(record([{ ...field(), value } as InspectionField])).success).toBe(true);
    expect(InspectionFieldSchema.safeParse({ ...field(), value: [value] }).success).toBe(false);
  });

  it("RI-S16 accepts a high-node valid value in all100 fields without shrinking JSON bounds", () => {
    const value = Array.from({ length: 199 }, () => ({ a: 0, b: false, c: null, d: "" }));
    expect(InspectableJSONSchema.safeParse(value).success).toBe(true);
    const fields = Array.from({ length: 100 }, (_, index) => field({ id: `field-${index}`, value,
      evidence: Array.from({ length: 20 }, (_, number) => ({ id: `evidence-${number}`, label: "Supplied evidence" })) }));
    expect(RecordInspectorSchema.safeParse(record(fields)).success).toBe(true);
  });

  it("RI-S17 rejects nested JSON getters without invoking them", () => {
    let reads = 0;
    const value = Object.defineProperty({}, "secret", { enumerable: true, get() { reads++; return "No invocation"; } });
    expect(InspectionFieldSchema.safeParse({ ...field(), value }).success).toBe(false); expect(reads).toBe(0);
  });

  it("RI-S18 never calls toJSON on a rejected value or while measuring aggregate bytes", () => {
    let calls = 0;
    const value = { toJSON() { calls++; return "No invocation"; } };
    expect(RecordInspectorSchema.safeParse(record([{ ...field(), value } as unknown as InspectionField])).success).toBe(false); expect(calls).toBe(0);
  });

  it("RI-S19 rejects outer root accessors before Zod reads any field", () => {
    let reads = 0;
    const value = Object.defineProperty(record(), "id", { enumerable: true, get() { reads++; return common.id; } });
    expect(RecordInspectorSchema.safeParse(value).success).toBe(false); expect(reads).toBe(0);
  });

  it("RI-S20 rejects field and evidence accessors before their values can run", () => {
    let reads = 0;
    const item = Object.defineProperty(field(), "value", { enumerable: true, get() { reads++; return "No invocation"; } });
    const source = Object.defineProperty({ ...evidence }, "text", { enumerable: true, get() { reads++; return "No invocation"; } });
    expect(FieldConfidenceListSchema.safeParse(list([item])).success).toBe(false);
    expect(RecordInspectorSchema.safeParse(record([field({ evidence: [source] })])).success).toBe(false); expect(reads).toBe(0);
  });

  it("RI-S21 refuses foreign prototypes on DTO roots records fields and evidence", () => {
    const foreign = <T extends object>(value: T): T => Object.assign(Object.create({ inherited: true }), value) as T;
    expect(RecordInspectorSchema.safeParse(foreign(record())).success).toBe(false);
    expect(RecordInspectorSchema.safeParse({ ...record(), record: foreign(record().record) }).success).toBe(false);
    expect(FieldConfidenceListSchema.safeParse(list([foreign(field())])).success).toBe(false);
    expect(InspectionFieldSchema.safeParse(field({ evidence: [foreign(evidence)] })).success).toBe(false);
  });

  it("RI-S22 refuses non-JSON object instances while accepting owned null-prototype JSON", () => {
    expect(InspectionFieldSchema.safeParse({ ...field(), value: new Date(0) }).success).toBe(false);
    expect(InspectionFieldSchema.safeParse({ ...field(), value: new Map([["authored", 1]]) }).success).toBe(false);
    const value = Object.assign(Object.create(null), { supplied: [false, 0, null] });
    expect(InspectionFieldSchema.parse({ ...field(), value }).value).toEqual({ supplied: [false, 0, null] });
  });

  it("RI-S23 catches JSON and outer-DTO cycles without throwing", () => {
    const value: Record<string, unknown> = {}; value.self = value;
    expect(InspectionFieldSchema.safeParse({ ...field(), value }).success).toBe(false);
    const outer = record() as unknown as Record<string, unknown>; outer.record = outer;
    expect(RecordInspectorSchema.safeParse(outer).success).toBe(false);
  });

  it("RI-S24 refuses symbol and nonenumerable data instead of omitting it", () => {
    const hidden = Object.defineProperty({}, "hidden", { value: "Private", enumerable: false });
    expect(InspectionFieldSchema.safeParse({ ...field(), value: hidden }).success).toBe(false);
    expect(RecordInspectorSchema.safeParse({ ...record(), [Symbol("hidden")]: "Private" }).success).toBe(false);
    expect(InspectionFieldSchema.safeParse({ ...field(), value: { [Symbol("hidden")]: "Private" } }).success).toBe(false);
  });

  it("RI-S25 refuses sparse arrays and custom array properties", () => {
    const sparse = new Array(2); sparse[1] = "Last";
    const extra = ["Authored"] as string[] & { extra?: string }; extra.extra = "No omission";
    expect(InspectionFieldSchema.safeParse({ ...field(), value: sparse }).success).toBe(false);
    expect(InspectionFieldSchema.safeParse({ ...field(), value: extra }).success).toBe(false);
    expect(RecordInspectorSchema.safeParse({ ...record(), record: { ...record().record, fields: sparse } }).success).toBe(false);
  });

  it("RI-S26 catches throwing descriptor traps before parsing or byte measurement", () => {
    const value = new Proxy({}, { ownKeys() { throw new Error("Authored descriptor failure"); } });
    expect(RecordInspectorSchema.safeParse(value).success).toBe(false);
    expect(InspectionFieldSchema.safeParse({ ...field(), value }).success).toBe(false);
  });

  it("RI-S27 requires the correct ready data owner instead of defaulting missing records", () => {
    expect(RecordInspectorSchema.safeParse({ ...common, state: "ready" }).success).toBe(false);
    expect(FieldConfidenceListSchema.safeParse({ ...common, state: "ready" }).success).toBe(false);
    expect(RecordInspectorSchema.safeParse(list()).success).toBe(false);
    expect(FieldConfidenceListSchema.safeParse(record()).success).toBe(false);
  });

  it("RI-S28 preserves local absence controlled null and a current field ID distinctly", () => {
    expect(Object.hasOwn(RecordInspectorSchema.parse(record()), "selectedFieldId")).toBe(false);
    expect(Object.hasOwn(FieldConfidenceListSchema.parse(list()), "selectedFieldId")).toBe(false);
    const first = RecordInspectorSchema.parse({ ...record(), selectedFieldId: null });
    const second = FieldConfidenceListSchema.parse({ ...list(), selectedFieldId: "field-1" });
    if (first.state !== "ready" || second.state !== "ready") throw new Error("authored_ready_required");
    expect(first.selectedFieldId).toBeNull(); expect(second.selectedFieldId).toBe("field-1");
  });

  it("RI-S29 refuses unknown selections including empty ready arrays", () => {
    expect(RecordInspectorSchema.safeParse({ ...record(), selectedFieldId: "missing" }).success).toBe(false);
    expect(FieldConfidenceListSchema.safeParse({ ...list(), selectedFieldId: "missing" }).success).toBe(false);
    expect(RecordInspectorSchema.safeParse({ ...record([]), selectedFieldId: "field-1" }).success).toBe(false);
    expect(FieldConfidenceListSchema.safeParse({ ...list([]), selectedFieldId: "field-1" }).success).toBe(false);
  });

  it("RI-S30 preserves a ready empty array as data without inferring completion", () => {
    const first = RecordInspectorSchema.parse({ ...record([]), selectedFieldId: null });
    const second = FieldConfidenceListSchema.parse(list([]));
    expect(first.state).toBe("ready"); expect(second.state).toBe("ready");
    if (first.state !== "ready" || second.state !== "ready") throw new Error("authored_ready_required");
    expect(first.record.fields).toEqual([]); expect(second.fields).toEqual([]);
  });

  it("RI-S31 bounds each field list at100 and refuses duplicate field identities", () => {
    const fields = Array.from({ length: 100 }, (_, index) => field({ id: `field-${index}` }));
    expect(RecordInspectorSchema.safeParse(record(fields)).success).toBe(true);
    expect(FieldConfidenceListSchema.safeParse(list([...fields, field({ id: "extra" })])).success).toBe(false);
    expect(RecordInspectorSchema.safeParse(record([field(), field()])).success).toBe(false);
    expect(FieldConfidenceListSchema.safeParse(list([field(), field()])).success).toBe(false);
  });

  it("RI-S32 refuses data and selection in every non-ready state", () => {
    for (const state of ["loading", "empty", "error"]) {
      const root = { ...common, state, message: "Authored status" };
      expect(RecordInspectorSchema.safeParse(root).success).toBe(true); expect(FieldConfidenceListSchema.safeParse(root).success).toBe(true);
      expect(RecordInspectorSchema.safeParse({ ...root, record: record().record }).success).toBe(false);
      expect(FieldConfidenceListSchema.safeParse({ ...root, fields: [field()] }).success).toBe(false);
      expect(RecordInspectorSchema.safeParse({ ...root, selectedFieldId: null }).success).toBe(false);
      expect(FieldConfidenceListSchema.safeParse({ ...root, selectedFieldId: "field-1" }).success).toBe(false);
    }
  });

  it("RI-S33 requires a visible nonblank error message without inventing data", () => {
    for (const message of [undefined, "", " \n\t", "bad\u0000message"]) {
      expect(RecordInspectorSchema.safeParse({ ...common, state: "error", message }).success).toBe(false);
      expect(FieldConfidenceListSchema.safeParse({ ...common, state: "error", message }).success).toBe(false);
    }
    expect(RecordInspectorSchema.parse({ ...common, state: "error", message: "Complete authored failure.\n" }).message).toBe("Complete authored failure.\n");
  });

  it("RI-S34 retains bounded plain descriptions messages and visible root or record labels", () => {
    expect(RecordInspectorSchema.safeParse({ ...record(), title: "t".repeat(300), description: "é".repeat(4000), message: " \n" }).success).toBe(true);
    expect(FieldConfidenceListSchema.safeParse({ ...list(), description: "x".repeat(4001) }).success).toBe(false);
    expect(RecordInspectorSchema.safeParse({ ...record(), message: "bad\u0001message" }).success).toBe(false);
    expect(RecordInspectorSchema.safeParse({ ...record(), record: { ...record().record, label: " " } }).success).toBe(false);
    expect(FieldConfidenceListSchema.safeParse({ ...list(), title: "t".repeat(301) }).success).toBe(false);
  });

  it("RI-S35 applies safe identities to component and record scopes", () => {
    expect(RecordInspectorSchema.safeParse({ ...record(), id: "constructor" }).success).toBe(false);
    expect(FieldConfidenceListSchema.safeParse({ ...list(), revision: "r".repeat(121) }).success).toBe(false);
    expect(RecordInspectorSchema.safeParse({ ...record(), record: { ...record().record, id: "__proto__" } }).success).toBe(false);
    expect(RecordInspectorSchema.safeParse({ ...record(), record: { ...record().record, revision: " trailing " } }).success).toBe(false);
  });

  it("RI-S36 refuses foreign properties at all new strict DTO levels", () => {
    expect(RecordInspectorSchema.safeParse({ ...record(), disabled: true }).success).toBe(false);
    expect(FieldConfidenceListSchema.safeParse({ ...list(), summary: "Invented average" }).success).toBe(false);
    expect(RecordInspectorSchema.safeParse({ ...record(), record: { ...record().record, owner: "Foreign" } }).success).toBe(false);
    expect(InspectionFieldSchema.safeParse({ ...field(), verified: true }).success).toBe(false);
  });

  it("RI-S37 accepts the exact parsed2MiB UTF8 record budget and refuses one extra byte", () => {
    const value = atBudget("record"), parsed = RecordInspectorSchema.parse(value);
    expect(bytes(parsed)).toBe(2097152); expect(JSON.stringify(parsed).length).toBeLessThan(2097152);
    value.description += "x"; expect(RecordInspectorSchema.safeParse(value).success).toBe(false);
  });

  it("RI-S38 applies the same collective2MiB UTF8 budget to the confidence list", () => {
    const value = atBudget("list"), parsed = FieldConfidenceListSchema.parse(value);
    expect(bytes(parsed)).toBe(2097152); value.description += "x";
    expect(FieldConfidenceListSchema.safeParse(value).success).toBe(false);
  });

  it("RI-S39 exports four strict output states and a required complete field value", () => {
    const inspector = z.toJSONSchema(RecordInspectorSchema) as { oneOf: Array<Record<string, unknown>> };
    const confidence = z.toJSONSchema(FieldConfidenceListSchema) as { oneOf: Array<Record<string, unknown>> };
    expect(inspector.oneOf).toHaveLength(4); expect(confidence.oneOf).toHaveLength(4);
    expect(inspector.oneOf.every(branch => branch.additionalProperties === false)).toBe(true);
    expect(confidence.oneOf.every(branch => branch.additionalProperties === false)).toBe(true);
    const exported = z.toJSONSchema(InspectionFieldSchema) as { required: string[]; properties: Record<string, Record<string, unknown>> };
    expect(exported.required).toEqual(expect.arrayContaining(["id", "revision", "label", "value", "evidence"]));
    expect(exported.properties.selectedFieldId).toBeUndefined(); expect(exported.properties.confidence?.default).toBeUndefined();
  });

  it("RI-S40 canonicalizes equivalent JSON keys without discarding meaningful field changes", () => {
    const first = InspectionFieldSchema.parse(field({ value: { a: false, b: [0, null] }, confidence: 0 }));
    const equivalent = InspectionFieldSchema.parse(field({ value: { b: [0, null], a: false }, confidence: 0 }));
    expect(stableReviewKey(first)).toBe(stableReviewKey(equivalent));
    expect(stableReviewKey(first)).not.toBe(stableReviewKey(InspectionFieldSchema.parse(field({ value: { a: false, b: [null, 0] }, confidence: 0 }))));
    expect(stableReviewKey(first)).not.toBe(stableReviewKey(InspectionFieldSchema.parse(field({ value: { a: false, b: [0, null] } }))));
  });
});

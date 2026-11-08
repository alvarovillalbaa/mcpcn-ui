import { describe, expect, it } from "vitest";
import {
  MissingDataRequestSchema, MultiStepFormSchema, InlineEditFormSchema, FormProgressCardSchema, ValidatedFieldListSchema,
  WorkflowFormFieldSchema, createWorkflowFormDraft, parseWorkflowFormDraft, validateWorkflowFormDrafts, workflowFormFieldKey,
  GenericComponentSchema, RecordInspectorSchema, InspectableJSONSchema, ToolResultCardSchema, schemaBySlug, toJSONSchema,
  type WorkflowFormField, type WorkflowFormDraft,
} from "./index.js";

// This fixture builder deliberately permits malformed definitions for refusal cases.
const field = (overrides: Record<string, unknown> = {}): WorkflowFormField => ({ id: "subject", label: "Subject", type: "text", ...overrides } as WorkflowFormField);
const missing = () => ({ id: "missing", title: "Provide missing context", fields: [field({ required: true })] });
const multi = () => ({ id: "multi", title: "Review all steps", steps: [
  { id: "first", title: "First step", fields: [field({ required: true, value: "Authored" })] },
  { id: "second", title: "Second step", fields: [field({ id: "confirmed", label: "Confirmed", type: "boolean", required: true, value: false })] },
], currentStepId: "first" });
const inline = () => ({ id: "inline", title: "Correct authored fields", fields: [field({ value: "Authored" })] });
const progress = () => ({ id: "progress", title: "Review reported progress", status: "in-progress" as const, steps: [
  { id: "collect", label: "Collect", status: "complete" as const }, { id: "review", label: "Review", status: "in-progress" as const },
] });
const validated = () => ({ id: "validated", title: "Review reported fields", fields: [
  { id: "subject", label: "Subject", status: "invalid" as const, value: "Authored", message: "Requires human review.", validatable: true },
  { id: "count", label: "Count", status: "valid" as const, value: 0 },
] });
const examples = () => [
  { schema: MissingDataRequestSchema, data: missing() }, { schema: MultiStepFormSchema, data: multi() },
  { schema: InlineEditFormSchema, data: inline() }, { schema: FormProgressCardSchema, data: progress() },
  { schema: ValidatedFieldListSchema, data: validated() },
];
const edited = (input: string): WorkflowFormDraft => ({ supplied: true, input });
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
function exactPayload() {
  const value = { id: "boundary", title: "Collective byte boundary", disabled: false, submitLabel: "Save changes", cancelLabel: "Cancel",
    fields: Array.from({ length: 27 }, (_, index) => ({ id: `field-${index}`, label: `Field ${index}`, type: "json" as const, required: false, value: "" })) };
  let remaining = 262144 - bytes(value);
  for (const item of value.fields) { const count = Math.min(10000, remaining); item.value = "x".repeat(count); remaining -= count; }
  if (remaining !== 0) throw new Error("Authored payload does not fill its collective budget.");
  return value;
}

describe("dedicated form shared contracts", () => {
  it("exports five distinct named schemas with current slug bindings", () => {
    const bindings = { "missing-data-request": MissingDataRequestSchema, "multi-step-form": MultiStepFormSchema,
      "inline-edit-form": InlineEditFormSchema, "form-progress-card": FormProgressCardSchema, "validated-field-list": ValidatedFieldListSchema };
    for (const [slug, schema] of Object.entries(bindings)) { expect(schemaBySlug[slug as keyof typeof schemaBySlug]).toBe(schema); expect(schema).not.toBe(GenericComponentSchema); }
    expect(Object.keys(schemaBySlug)).toHaveLength(31);
    expect(RecordInspectorSchema).toBe(GenericComponentSchema);
    expect(ToolResultCardSchema.safeParse({ id: "old", title: "Old outcome", tool: "lookup", status: "succeeded", result: false }).success).toBe(true);
    for (const { schema } of examples()) { const json = toJSONSchema(schema); expect(json.type).toBe("object"); expect(json.additionalProperties).toBe(false); }
  });

  it("requires bounded trimmed root identities and visible titles", () => {
    for (const { schema, data } of examples()) {
      for (const id of ["", " ", " padded", "padded ", "line\nbreak", "tab\t", "nul\u0000", "del\u007f", "x".repeat(129)]) expect(schema.safeParse({ ...data, id }).success).toBe(false);
      for (const title of ["", " \n\t", "x".repeat(241)]) expect(schema.safeParse({ ...data, title }).success).toBe(false);
      const { id: _id, ...withoutId } = data; expect(schema.safeParse(withoutId).success).toBe(false);
      expect(schema.safeParse({ ...data, id: "authored-東京", title: "Review\tcurrent\nfields" }).success).toBe(true);
    }
  });

  it("bounds display text while allowing ordinary tabs and newlines", () => {
    for (const { schema, data } of examples()) {
      for (const description of ["", " ", "x".repeat(2001), "escape\u001b", "vertical\u000b", "del\u007f"]) expect(schema.safeParse({ ...data, description }).success).toBe(false);
      expect(schema.safeParse({ ...data, description: "One\nTwo\tannotation" }).success).toBe(true);
    }
    expect(WorkflowFormFieldSchema.safeParse(field({ label: "x".repeat(501) })).success).toBe(false);
    expect(InlineEditFormSchema.safeParse({ ...inline(), submitLabel: "x".repeat(121) }).success).toBe(false);
    expect(MultiStepFormSchema.safeParse({ ...multi(), nextLabel: " " }).success).toBe(false);
  });

  it("defaults disabled and rejects unknown root and runtime UI props", () => {
    for (const { schema, data } of examples()) {
      expect(schema.parse(data).disabled).toBe(false);
      expect(schema.parse({ ...data, disabled: true }).disabled).toBe(true);
      for (const extra of [{ disabled: "false" }, { busy: false }, { error: "Injected" }, { onAction: () => undefined }, { className: "extra" }, { unknown: true }]) expect(schema.safeParse({ ...data, ...extra }).success).toBe(false);
    }
  });

  it("rejects unknown nested field option progress step and validation properties", () => {
    expect(WorkflowFormFieldSchema.safeParse({ ...field(), arbitrary: true }).success).toBe(false);
    expect(WorkflowFormFieldSchema.safeParse(field({ type: "select", options: [{ value: "one", label: "One", arbitrary: true } as never] })).success).toBe(false);
    expect(MultiStepFormSchema.safeParse({ ...multi(), steps: [{ id: "first", title: "First", fields: [], arbitrary: true }] }).success).toBe(false);
    expect(FormProgressCardSchema.safeParse({ ...progress(), progress: { completed: 0, total: 1, arbitrary: true } }).success).toBe(false);
    expect(ValidatedFieldListSchema.safeParse({ ...validated(), fields: [{ ...validated().fields[0], arbitrary: true }] }).success).toBe(false);
    expect(MissingDataRequestSchema.safeParse({ ...missing(), knownFields: [{ id: "known", label: "Known", value: null, arbitrary: true }] }).success).toBe(false);
  });

  it("enforces finite collection limits and unique field identities", () => {
    const fields = Array.from({ length: 101 }, (_, index) => field({ id: `field-${index}` }));
    expect(InlineEditFormSchema.safeParse({ ...inline(), fields }).success).toBe(false);
    expect(MissingDataRequestSchema.safeParse({ ...missing(), fields }).success).toBe(false);
    expect(InlineEditFormSchema.safeParse({ ...inline(), fields: [field(), field()] }).success).toBe(false);
    expect(MissingDataRequestSchema.safeParse({ ...missing(), fields: [field(), field()] }).success).toBe(false);
    expect(FormProgressCardSchema.safeParse({ ...progress(), steps: fields.map(item => ({ id: item.id, label: item.label, status: "not-started" })) }).success).toBe(false);
    expect(ValidatedFieldListSchema.safeParse({ ...validated(), fields: fields.map(item => ({ id: item.id, label: item.label, status: "unvalidated" })) }).success).toBe(false);
  });

  it("reuses finite descriptor-safe JSON refusals without invoking nested getters", () => {
    let calls = 0;
    const getter = Object.defineProperty({}, "secret", { enumerable: true, get: () => { calls++; return "unexpected"; } });
    const cycle: { self?: unknown } = {}; cycle.self = cycle;
    for (const value of [getter, cycle, NaN, Infinity, undefined, 1n, Symbol("x"), () => undefined, new Date(0), new Map(), Array(1), { [Symbol("hidden")]: 1 }]) {
      expect(InspectableJSONSchema.safeParse(value).success).toBe(false);
      expect(InlineEditFormSchema.safeParse({ ...inline(), fields: [field({ type: "json", value: value as never })] }).success).toBe(false);
      expect(ValidatedFieldListSchema.safeParse({ ...validated(), fields: [{ id: "x", label: "X", status: "valid", value }] }).success).toBe(false);
      expect(MissingDataRequestSchema.safeParse({ ...missing(), knownFields: [{ id: "known", label: "Known", value }] }).success).toBe(false);
    }
    expect(calls).toBe(0);
  });

  it("accepts the exact collective byte boundary and refuses one additional byte", () => {
    const data = exactPayload(); expect(bytes(data)).toBe(262144);
    expect(InlineEditFormSchema.safeParse(data).success).toBe(true);
    data.fields[data.fields.length - 1]!.value += "x";
    expect(bytes(data)).toBe(262145); expect(InlineEditFormSchema.safeParse(data).success).toBe(false);
  });

  it("counts collective UTF8 bytes rather than only UTF16 characters", () => {
    const data = exactPayload(), first = data.fields[0]!;
    first.value = first.value.slice(0, -1) + "€";
    expect(JSON.stringify(data).length).toBe(262144); expect(bytes(data)).toBe(262146);
    expect(InlineEditFormSchema.safeParse(data).success).toBe(false);
  });
});

describe("typed form field definitions", () => {
  it("exports all six field kinds with typed values and kind specific constraint keys", () => {
    const json = toJSONSchema(WorkflowFormFieldSchema);
    const resolve = (value: unknown): Record<string, unknown> => {
      let current = value as Record<string, unknown>;
      for (let depth = 0; typeof current.$ref === "string" && depth < 20; depth++) {
        const segments = current.$ref.split("/"); expect(segments.shift()).toBe("#");
        let target: unknown = json;
        for (const segment of segments) target = (target as Record<string, unknown>)[segment.replace(/~1/g, "/").replace(/~0/g, "~")];
        current = target as Record<string, unknown>;
      }
      return current;
    };
    const branches = (json.oneOf ?? json.anyOf) as Record<string, unknown>[]; expect(branches).toHaveLength(6);
    const kinds = new Map(branches.map(branch => { const resolved = resolve(branch), properties = resolved.properties as Record<string, unknown>; return [resolve(properties.type).const, { branch: resolved, properties }]; }));
    expect([...kinds.keys()]).toEqual(["text", "textarea", "number", "boolean", "select", "json"]);
    for (const [kind, type] of [["text", "string"], ["textarea", "string"], ["number", "number"], ["boolean", "boolean"], ["select", "string"]]) {
      const value = resolve(kinds.get(kind)!.properties.value);
      expect((value.allOf as unknown[]).map(item => resolve(item)).some(item => item.type === type)).toBe(true);
    }
    for (const [kind, entry] of kinds) {
      expect(entry.branch.additionalProperties).toBe(false);
      expect(Object.hasOwn(entry.properties, "options")).toBe(kind === "select");
      expect(Object.hasOwn(entry.properties, "min")).toBe(kind === "number");
      expect(Object.hasOwn(entry.properties, "minLength")).toBe(kind === "text" || kind === "textarea");
    }
    expect(kinds.get("select")!.branch.required).toContain("options");
  });

  it("accepts all six basic field kinds without coercing supplied values", () => {
    const cases: WorkflowFormField[] = [field({ value: "" }), field({ type: "textarea", value: "One\nTwo" }), field({ type: "number", value: 0 }),
      field({ type: "boolean", value: false }), field({ type: "select", value: "one", options: [{ value: "one", label: "One" }] }), field({ type: "json", value: null })];
    for (const value of cases) expect(WorkflowFormFieldSchema.parse(value)).toMatchObject({ ...value, required: false });
    for (const [type, value] of [["text", 0], ["textarea", false], ["number", "0"], ["boolean", "false"], ["select", 0]] as const) expect(WorkflowFormFieldSchema.safeParse(field({ type, value, ...(type === "select" ? { options: [{ value: "one", label: "One" }] } : {}) })).success).toBe(false);
  });

  it("distinguishes absent values from explicit undefined and supplied JSON primitives", () => {
    expect(WorkflowFormFieldSchema.parse(field({ required: true }))).not.toHaveProperty("value");
    expect(WorkflowFormFieldSchema.safeParse(field({ value: undefined })).success).toBe(false);
    for (const value of [null, false, 0, "", [], {}]) expect(WorkflowFormFieldSchema.parse(field({ type: "json", value }))).toHaveProperty("value", value);
  });

  it("allows correction of existing text that violates required and local length rules", () => {
    expect(WorkflowFormFieldSchema.safeParse(field({ required: true, minLength: 3, maxLength: 4, value: "" })).success).toBe(true);
    expect(WorkflowFormFieldSchema.safeParse(field({ minLength: 2, maxLength: 3, value: "Long initial value" })).success).toBe(true);
    expect(WorkflowFormFieldSchema.safeParse(field({ value: "x".repeat(10000) })).success).toBe(true);
    expect(WorkflowFormFieldSchema.safeParse(field({ value: "x".repeat(10001) })).success).toBe(false);
    expect(WorkflowFormFieldSchema.safeParse(field({ minLength: -1 })).success).toBe(false);
    expect(WorkflowFormFieldSchema.safeParse(field({ maxLength: 10001 })).success).toBe(false);
    expect(WorkflowFormFieldSchema.safeParse(field({ minLength: 1.5 })).success).toBe(false);
    expect(WorkflowFormFieldSchema.safeParse(field({ minLength: 4, maxLength: 3 })).success).toBe(false);
  });

  it("requires finite number definitions with ordered optional numeric limits", () => {
    expect(WorkflowFormFieldSchema.safeParse(field({ type: "number", value: -10, min: 0, max: 3 })).success).toBe(true);
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(WorkflowFormFieldSchema.safeParse(field({ type: "number", value })).success).toBe(false);
      expect(WorkflowFormFieldSchema.safeParse(field({ type: "number", min: value })).success).toBe(false);
      expect(WorkflowFormFieldSchema.safeParse(field({ type: "number", max: value })).success).toBe(false);
    }
    expect(WorkflowFormFieldSchema.safeParse(field({ type: "number", min: 4, max: 3 })).success).toBe(false);
    expect(WorkflowFormFieldSchema.safeParse(field({ type: "number", min: -0.5, max: 0.5, value: 0.25 })).success).toBe(true);
  });

  it("requires actual booleans while preserving required false as a supplied baseline", () => {
    expect(WorkflowFormFieldSchema.parse(field({ type: "boolean", required: true, value: false }))).toHaveProperty("value", false);
    for (const value of [null, 0, "", "true", [], {}]) expect(WorkflowFormFieldSchema.safeParse(field({ type: "boolean", value })).success).toBe(false);
  });

  it("requires one to fifty distinct current select options with bounded values", () => {
    const options = [{ value: "one", label: "One" }, { value: "blocked", label: "Blocked", disabled: true }];
    expect(WorkflowFormFieldSchema.parse(field({ type: "select", options, value: "blocked" }))).toHaveProperty("options.0.disabled", false);
    expect(WorkflowFormFieldSchema.safeParse(field({ type: "select" })).success).toBe(false);
    expect(WorkflowFormFieldSchema.safeParse(field({ type: "select", options: [] })).success).toBe(false);
    expect(WorkflowFormFieldSchema.safeParse(field({ type: "select", options: [options[0]!, options[0]!] })).success).toBe(false);
    expect(WorkflowFormFieldSchema.safeParse(field({ type: "select", options, value: "unknown" })).success).toBe(false);
    for (const value of ["", "x".repeat(129), "line\nbreak", "del\u007f"]) expect(WorkflowFormFieldSchema.safeParse(field({ type: "select", options: [{ value, label: "One" }] })).success).toBe(false);
    const fifty = Array.from({ length: 50 }, (_, index) => ({ value: `value-${index}`, label: `Value ${index}` }));
    expect(WorkflowFormFieldSchema.safeParse(field({ type: "select", options: fifty })).success).toBe(true);
    expect(WorkflowFormFieldSchema.safeParse(field({ type: "select", options: [...fifty, { value: "extra", label: "Extra" }] })).success).toBe(false);
  });

  it("refuses options and constraint kinds on unrelated field types", () => {
    for (const type of ["text", "textarea", "number", "boolean", "json"] as const) expect(WorkflowFormFieldSchema.safeParse(field({ type, options: [{ value: "one", label: "One" }] })).success).toBe(false);
    for (const type of ["text", "textarea", "boolean", "json"] as const) expect(WorkflowFormFieldSchema.safeParse(field({ type, min: 0 })).success).toBe(false);
    for (const type of ["number", "boolean", "json"] as const) expect(WorkflowFormFieldSchema.safeParse(field({ type, maxLength: 3 })).success).toBe(false);
    expect(WorkflowFormFieldSchema.safeParse(field({ options: undefined })).success).toBe(false);
  });

  it("refuses reserved field identities without imposing them on root or step identities", () => {
    for (const id of ["__proto__", "constructor", "prototype", "", " padded", "line\nbreak", "x".repeat(129)]) expect(WorkflowFormFieldSchema.safeParse(field({ id })).success).toBe(false);
    expect(InlineEditFormSchema.safeParse({ ...inline(), id: "constructor" }).success).toBe(true);
    expect(MultiStepFormSchema.safeParse({ ...multi(), steps: [{ id: "prototype", title: "Explanation", fields: [] }], currentStepId: "prototype" }).success).toBe(true);
  });
});

describe("local form draft parsing", () => {
  it("creates compact baselines with explicit supplied primitive and negative zero state", () => {
    expect(createWorkflowFormDraft(field())).toEqual({ supplied: false, input: "" });
    expect(createWorkflowFormDraft(field({ value: "" }))).toEqual(edited(""));
    expect(createWorkflowFormDraft(field({ type: "number", value: 0 }))).toEqual(edited("0"));
    expect(createWorkflowFormDraft(field({ type: "number", value: -0 }))).toEqual(edited("-0"));
    expect(createWorkflowFormDraft(field({ type: "boolean", value: false }))).toEqual(edited("false"));
    expect(createWorkflowFormDraft(field({ type: "json", value: null }))).toEqual(edited("null"));
    expect(createWorkflowFormDraft(field({ type: "json", value: { nested: [0, false, null, ""] } }))).toEqual(edited('{"nested":[0,false,null,""]}'));
  });

  it("keys complete parsed field terms while ignoring equivalent default omissions", () => {
    const baseline = field({ value: "Authored" });
    expect(workflowFormFieldKey(baseline)).toBe(workflowFormFieldKey({ ...baseline, required: false }));
    for (const replacement of [{ label: "Changed label" }, { value: "Changed value" }, { required: true }, { minLength: 1 }, { description: "New description" }]) expect(workflowFormFieldKey(field({ ...baseline, ...replacement }))).not.toBe(workflowFormFieldKey(baseline));
    expect(workflowFormFieldKey(field())).not.toBe(workflowFormFieldKey(field({ value: "" })));
    const structured = field({ type: "json", value: { a: 1, b: { first: false, second: [0, null] } } });
    expect(workflowFormFieldKey(structured)).toBe(workflowFormFieldKey(field({ type: "json", value: { b: { second: [0, null], first: false }, a: 1 } })));
    expect(workflowFormFieldKey(structured)).not.toBe(workflowFormFieldKey(field({ type: "json", value: { a: 1, b: { first: false, second: [null, 0] } } })));
  });

  it("validates required text and current minimum and maximum lengths", () => {
    const current = field({ required: true, minLength: 2, maxLength: 4 });
    for (const input of ["", " \n\t", "x", "abcde"]) expect(parseWorkflowFormDraft(current, edited(input)).success).toBe(false);
    expect(parseWorkflowFormDraft(current, edited("ab"))).toEqual({ success: true, supplied: true, value: "ab" });
    expect(parseWorkflowFormDraft(field({ type: "textarea" }), edited("One\nTwo"))).toEqual({ success: true, supplied: true, value: "One\nTwo" });
    expect(parseWorkflowFormDraft(field(), edited("x".repeat(10001))).success).toBe(false);
  });

  it("keeps optional empty text supplied while explicit Clear makes it absent", () => {
    expect(parseWorkflowFormDraft(field({ value: "Before" }), edited(""))).toEqual({ success: true, supplied: true, value: "" });
    expect(parseWorkflowFormDraft(field({ value: "Before" }), { supplied: false, input: "" })).toEqual({ success: true, supplied: false });
    expect(parseWorkflowFormDraft(field({ required: true, value: "Before" }), { supplied: false, input: "ignored" }).success).toBe(false);
    expect(parseWorkflowFormDraft(field({ minLength: 1 }), edited("")).success).toBe(false);
  });

  it("parses finite decimal and exponent inputs without truncating fractional values", () => {
    const current = field({ type: "number", min: -2, max: 2 });
    for (const [input, value] of [["0", 0], ["1.005", 1.005], ["-.5", -0.5], ["2e-1", 0.2], [" +1.25 ", 1.25]] as const) expect(parseWorkflowFormDraft(current, edited(input))).toEqual({ success: true, supplied: true, value });
    for (const input of ["2.01", "-2.01", "1e", "NaN", "Infinity", "1e999", "0x10", "0b10", "1,5", "--1"]) expect(parseWorkflowFormDraft(current, edited(input)).success).toBe(false);
    const negativeZero = parseWorkflowFormDraft(current, edited("-0"));
    expect(negativeZero.success && negativeZero.supplied && Object.is(negativeZero.value, -0)).toBe(true);
  });

  it("treats number placeholders as absent and required zero as supplied", () => {
    expect(parseWorkflowFormDraft(field({ type: "number" }), edited(" \t"))).toEqual({ success: true, supplied: false });
    expect(parseWorkflowFormDraft(field({ type: "number", required: true }), edited("")).success).toBe(false);
    expect(parseWorkflowFormDraft(field({ type: "number", required: true }), edited("0"))).toEqual({ success: true, supplied: true, value: 0 });
  });

  it("preserves boolean No independently from its Not provided placeholder", () => {
    expect(parseWorkflowFormDraft(field({ type: "boolean", required: true }), edited("false"))).toEqual({ success: true, supplied: true, value: false });
    expect(parseWorkflowFormDraft(field({ type: "boolean" }), edited("true"))).toEqual({ success: true, supplied: true, value: true });
    expect(parseWorkflowFormDraft(field({ type: "boolean" }), edited(""))).toEqual({ success: true, supplied: false });
    for (const input of ["0", "1", "yes", "no", "False", " "]) expect(parseWorkflowFormDraft(field({ type: "boolean" }), edited(input)).success).toBe(false);
  });

  it("refuses stale and disabled select values while preserving explicit absence", () => {
    const current = field({ type: "select", options: [{ value: "one", label: "One" }, { value: "blocked", label: "Blocked", disabled: true }] });
    expect(parseWorkflowFormDraft(current, edited("one"))).toEqual({ success: true, supplied: true, value: "one" });
    expect(parseWorkflowFormDraft(current, edited(""))).toEqual({ success: true, supplied: false });
    for (const input of ["unknown", "blocked"]) expect(parseWorkflowFormDraft(current, edited(input)).success).toBe(false);
    expect(parseWorkflowFormDraft({ ...current, required: true }, edited("")).success).toBe(false);
    expect(parseWorkflowFormDraft(field({ ...current, value: "blocked" }), createWorkflowFormDraft(field({ ...current, value: "blocked" }))).success).toBe(false);
  });

  it("parses all bounded JSON primitives arrays and objects without flattening them", () => {
    for (const value of [null, false, 0, "", " ", [0, false, null, ""], { nested: { empty: "", items: [false, 0] } }]) expect(parseWorkflowFormDraft(field({ type: "json", required: true }), edited(JSON.stringify(value)))).toEqual({ success: true, supplied: true, value });
  });

  it("distinguishes JSON Clear null and empty string from malformed or unsafe source", () => {
    const current = field({ type: "json" });
    expect(parseWorkflowFormDraft(current, { supplied: false, input: "" })).toEqual({ success: true, supplied: false });
    expect(parseWorkflowFormDraft(current, edited("null"))).toEqual({ success: true, supplied: true, value: null });
    expect(parseWorkflowFormDraft(current, edited('""'))).toEqual({ success: true, supplied: true, value: "" });
    for (const input of ["", " ", "{", "undefined", "NaN", "Infinity", "1e999", '{"__proto__":{}}', JSON.stringify("x".repeat(10001)), JSON.stringify(Array(201).fill(null))]) expect(parseWorkflowFormDraft(current, edited(input)).success).toBe(false);
    let deep: unknown = null; for (let index = 0; index < 10; index++) deep = [deep];
    expect(parseWorkflowFormDraft(current, edited(JSON.stringify(deep))).success).toBe(false);
  });

  it("bounds raw JSON source before parsing including otherwise harmless whitespace", () => {
    const current = field({ type: "json" });
    expect(parseWorkflowFormDraft(current, edited(" ".repeat(65532) + "null"))).toEqual({ success: true, supplied: true, value: null });
    const refused = parseWorkflowFormDraft(current, edited(" ".repeat(65533) + "null"));
    expect(refused).toEqual({ success: false, message: "Use at most 65536 characters of JSON source." });
  });

  it("rejects invalid incoming definitions and malformed drafts without coercion", () => {
    expect(parseWorkflowFormDraft(field({ type: "number", value: "0" }), edited("0")).success).toBe(false);
    expect(parseWorkflowFormDraft(field(), { supplied: "true", input: "x" } as never).success).toBe(false);
    expect(parseWorkflowFormDraft(field(), { supplied: true, input: 0 } as never).success).toBe(false);
    expect(parseWorkflowFormDraft(field(), null as never).success).toBe(false);
  });

  it("collects current supplied values in field order and ignores removed draft entries", () => {
    const fields = [field({ id: "second", value: "Two" }), field({ id: "first", type: "number", value: 0 }), field({ id: "absent", type: "json" })];
    const result = validateWorkflowFormDrafts(fields, { removed: edited("Do not echo"), first: edited("1.005"), second: edited("") });
    expect(result.errors).toEqual([]); expect(Object.keys(result.values)).toEqual(["second", "first"]); expect(result.values).toEqual({ second: "", first: 1.005 });
    expect(result.values).not.toHaveProperty("removed"); expect(result.values).not.toHaveProperty("absent");
  });

  it("returns ordered field errors without losing valid false zero and null values", () => {
    const fields = [field({ id: "missing", required: true }), field({ id: "count", type: "number", required: true, value: 0 }),
      field({ id: "reviewed", type: "boolean", required: true, value: false }), field({ id: "details", type: "json", required: true, value: null }), field({ id: "short", minLength: 3 })];
    const result = validateWorkflowFormDrafts(fields, { short: edited("x") });
    expect(result.errors.map(error => error.fieldId)).toEqual(["missing", "short"]);
    expect(result.errors[0]?.message).toContain("Subject"); expect(result.values).toEqual({ count: 0, reviewed: false, details: null });
    expect(validateWorkflowFormDrafts([field({ id: "duplicate" }), field({ id: "duplicate" })], {}).errors[0]?.message).toContain("distinct");
  });

  it("does not serialize rejected getter-bearing definitions through draft helpers", () => {
    let calls = 0; const getter = Object.defineProperty({}, "value", { enumerable: true, get: () => { calls++; return "secret"; } });
    const current = field({ type: "json", value: getter as never });
    expect(parseWorkflowFormDraft(current, edited("null")).success).toBe(false);
    expect(() => workflowFormFieldKey(current)).toThrow(); expect(() => createWorkflowFormDraft(current)).toThrow();
    expect(validateWorkflowFormDrafts([current], {}).errors).toHaveLength(1); expect(calls).toBe(0);
  });

  it("budgets collected UTF8 values at the exact boundary with a root error on overflow", () => {
    const fields = Array.from({ length: 27 }, (_, index) => field({ id: `field-${index}` }));
    const values: Record<string, string> = Object.fromEntries(fields.map(item => [item.id, ""]));
    let remaining = 262144 - bytes(values);
    for (const item of fields) { const count = Math.min(10000, remaining); values[item.id] = "x".repeat(count); remaining -= count; }
    expect(remaining).toBe(0); const drafts = Object.fromEntries(fields.map(item => [item.id, edited(values[item.id]!)]));
    expect(validateWorkflowFormDrafts(fields, drafts).errors).toEqual([]);
    drafts[fields[fields.length - 1]!.id]!.input += "x";
    expect(validateWorkflowFormDrafts(fields, drafts).errors).toEqual([{ fieldId: "", message: "The supplied form values must fit 256 KiB of UTF-8 JSON." }]);
    drafts[fields[fields.length - 1]!.id]!.input = values[fields[fields.length - 1]!.id]!.slice(0, -1) + "€";
    expect(validateWorkflowFormDrafts(fields, drafts).errors[0]?.fieldId).toBe("");
  });
});

describe("missing data request rules", () => {
  it("defaults known context and labels and permits explicit empty requests", () => {
    expect(MissingDataRequestSchema.parse({ ...missing(), fields: [] })).toMatchObject({ fields: [], knownFields: [], submitLabel: "Provide information", cancelLabel: "Cancel", disabled: false });
  });

  it("refuses every own requested baseline value including undefined and falsy values", () => {
    for (const value of [undefined, null, false, 0, "", {}]) expect(MissingDataRequestSchema.safeParse({ ...missing(), fields: [field({ type: "json", value })] }).success).toBe(false);
    expect(MissingDataRequestSchema.safeParse(missing()).success).toBe(true);
  });

  it("requires bounded distinct known values disjoint from requested identifiers", () => {
    const known = { id: "known", label: "Known context", value: null };
    expect(MissingDataRequestSchema.parse({ ...missing(), knownFields: [known] }).knownFields[0]?.value).toBe(null);
    expect(MissingDataRequestSchema.safeParse({ ...missing(), knownFields: [known, known] }).success).toBe(false);
    expect(MissingDataRequestSchema.safeParse({ ...missing(), knownFields: [{ ...known, id: "subject" }] }).success).toBe(false);
    expect(MissingDataRequestSchema.safeParse({ ...missing(), knownFields: [{ id: "known", label: "Known" }] }).success).toBe(false);
    expect(MissingDataRequestSchema.safeParse({ ...missing(), knownFields: Array.from({ length: 101 }, (_, index) => ({ ...known, id: `known-${index}` })) }).success).toBe(false);
  });

  it("keeps known values outside values collected from requested drafts", () => {
    const data = MissingDataRequestSchema.parse({ ...missing(), knownFields: [{ id: "private-context", label: "Known", value: { private: true } }] });
    const result = validateWorkflowFormDrafts(data.fields, { subject: edited("Authored answer"), "private-context": edited("Do not echo") });
    expect(result).toEqual({ values: { subject: "Authored answer" }, errors: [] });
  });
});

describe("controlled multi step data", () => {
  it("defaults navigation labels and allows explanatory steps without fields", () => {
    const result = MultiStepFormSchema.parse({ ...multi(), steps: [{ id: "explanation", title: "Explanation", description: "Read this first.", fields: [] }], currentStepId: "explanation" });
    expect(result).toMatchObject({ nextLabel: "Next", previousLabel: "Previous", submitLabel: "Submit form", cancelLabel: "Cancel" });
    expect(result.steps[0]?.fields).toEqual([]);
  });

  it("refuses duplicate step and cross step field identities", () => {
    expect(MultiStepFormSchema.safeParse({ ...multi(), steps: [multi().steps[0], multi().steps[0]] }).success).toBe(false);
    expect(MultiStepFormSchema.safeParse({ ...multi(), steps: [{ id: "first", title: "First", fields: [field()] }, { id: "second", title: "Second", fields: [field()] }] }).success).toBe(false);
  });

  it("requires one to one hundred steps and a current controlled step", () => {
    expect(MultiStepFormSchema.safeParse({ ...multi(), steps: [] }).success).toBe(false);
    expect(MultiStepFormSchema.safeParse({ ...multi(), currentStepId: "stale" }).success).toBe(false);
    const { currentStepId: _step, ...withoutStep } = multi(); expect(MultiStepFormSchema.safeParse(withoutStep).success).toBe(false);
    const steps = Array.from({ length: 100 }, (_, index) => ({ id: `step-${index}`, title: `Step ${index}`, fields: [] }));
    expect(MultiStepFormSchema.safeParse({ ...multi(), steps, currentStepId: "step-0" }).success).toBe(true);
    expect(MultiStepFormSchema.safeParse({ ...multi(), steps: [...steps, { id: "extra", title: "Extra", fields: [] }], currentStepId: "step-0" }).success).toBe(false);
  });

  it("counts fields collectively while retaining correctable initial constraint violations", () => {
    const steps = [{ id: "first", title: "First", fields: Array.from({ length: 50 }, (_, index) => field({ id: `a-${index}` })) }, { id: "second", title: "Second", fields: Array.from({ length: 50 }, (_, index) => field({ id: `b-${index}` })) }];
    expect(MultiStepFormSchema.safeParse({ ...multi(), steps }).success).toBe(true);
    steps[1]!.fields.push(field({ id: "extra" })); expect(MultiStepFormSchema.safeParse({ ...multi(), steps }).success).toBe(false);
    expect(MultiStepFormSchema.safeParse({ ...multi(), steps: [{ id: "first", title: "First", fields: [field({ required: true, value: "" })] }] }).success).toBe(true);
  });
});

describe("inline edit baselines", () => {
  it("preserves supplied empty false zero and null baselines with normal defaults", () => {
    const result = InlineEditFormSchema.parse({ ...inline(), fields: [field({ id: "empty", value: "" }), field({ id: "zero", type: "number", value: 0 }), field({ id: "no", type: "boolean", value: false }), field({ id: "null", type: "json", value: null })] });
    expect(result.fields.map(item => item.value)).toEqual(["", 0, false, null]);
    expect(result).toMatchObject({ submitLabel: "Save changes", cancelLabel: "Cancel", disabled: false });
  });

  it("allows empty and absent baseline fields without manufacturing values", () => {
    expect(InlineEditFormSchema.parse({ ...inline(), fields: [] }).fields).toEqual([]);
    expect(InlineEditFormSchema.parse({ ...inline(), fields: [field()] }).fields[0]).not.toHaveProperty("value");
    expect(createWorkflowFormDraft(field())).toEqual({ supplied: false, input: "" });
  });
});

describe("reported form progress", () => {
  it("keeps reported status independent from zero full and unknown progress", () => {
    const unknown = FormProgressCardSchema.parse({ id: "progress", title: "Reported", status: "not-started" });
    expect(unknown.steps).toEqual([]); expect(unknown).not.toHaveProperty("progress");
    expect(FormProgressCardSchema.parse({ ...progress(), progress: { completed: 0, total: 0 } }).status).toBe("in-progress");
    expect(FormProgressCardSchema.parse({ ...progress(), progress: { completed: 3, total: 3 } }).status).toBe("in-progress");
    expect(FormProgressCardSchema.parse({ ...progress(), status: "complete", progress: { completed: 1, total: 3 } }).status).toBe("complete");
  });

  it("requires nonnegative safe progress counts bounded by total", () => {
    for (const count of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1", false]) {
      expect(FormProgressCardSchema.safeParse({ ...progress(), progress: { completed: count, total: 3 } }).success).toBe(false);
      expect(FormProgressCardSchema.safeParse({ ...progress(), progress: { completed: 0, total: count } }).success).toBe(false);
    }
    expect(FormProgressCardSchema.safeParse({ ...progress(), progress: { completed: 2, total: 1 } }).success).toBe(false);
    expect(FormProgressCardSchema.safeParse({ ...progress(), steps: [{ id: "x", label: "X", status: "blocked", progress: { completed: 1, total: 0 } }] }).success).toBe(false);
    expect(FormProgressCardSchema.safeParse({ ...progress(), progress: { completed: Number.MAX_SAFE_INTEGER, total: Number.MAX_SAFE_INTEGER } }).success).toBe(true);
  });

  it("requires distinct current progress selections and known status labels", () => {
    expect(FormProgressCardSchema.parse({ ...progress(), selectedStepId: "review" }).selectedStepId).toBe("review");
    expect(FormProgressCardSchema.safeParse({ ...progress(), selectedStepId: "stale" }).success).toBe(false);
    expect(FormProgressCardSchema.safeParse({ ...progress(), steps: [progress().steps[0], progress().steps[0]] }).success).toBe(false);
    expect(FormProgressCardSchema.safeParse({ ...progress(), steps: [{ id: "x", label: " ", status: "complete" }] }).success).toBe(false);
    expect(FormProgressCardSchema.safeParse({ ...progress(), status: "running" }).success).toBe(false);
  });

  it("requires supplied root and step status rather than inferring validation results", () => {
    const { status: _status, ...withoutStatus } = progress(); expect(FormProgressCardSchema.safeParse(withoutStatus).success).toBe(false);
    expect(FormProgressCardSchema.safeParse({ ...progress(), steps: [{ id: "x", label: "X", progress: { completed: 1, total: 1 } }] }).success).toBe(false);
    expect(FormProgressCardSchema.parse({ ...progress(), status: "blocked", steps: [] }).status).toBe("blocked");
  });
});

describe("consumer reported validated fields", () => {
  it("accepts every supplied falsy valid value and preserves complete JSON data", () => {
    for (const value of [null, false, 0, "", [], { count: 0, reviewed: false, next: null }]) expect(ValidatedFieldListSchema.parse({ ...validated(), fields: [{ id: "x", label: "X", status: "valid", value }] }).fields[0]?.value).toEqual(value);
  });

  it("requires supplied valid values and visible invalid messages", () => {
    expect(ValidatedFieldListSchema.safeParse({ ...validated(), fields: [{ id: "x", label: "X", status: "valid" }] }).success).toBe(false);
    expect(ValidatedFieldListSchema.safeParse({ ...validated(), fields: [{ id: "x", label: "X", status: "invalid", value: 0 }] }).success).toBe(false);
    for (const message of ["", " ", "x".repeat(2001), "bad\u0000"]) expect(ValidatedFieldListSchema.safeParse({ ...validated(), fields: [{ id: "x", label: "X", status: "invalid", message }] }).success).toBe(false);
    expect(ValidatedFieldListSchema.safeParse({ ...validated(), fields: [{ id: "x", label: "X", status: "invalid", message: "Not supplied yet." }] }).success).toBe(true);
  });

  it("permits validation requests only for supplied invalid or unvalidated fields", () => {
    for (const status of ["invalid", "unvalidated"] as const) for (const value of [null, false, 0, ""]) expect(ValidatedFieldListSchema.safeParse({ ...validated(), fields: [{ id: "x", label: "X", status, value, message: "Authored detail.", validatable: true }] }).success).toBe(true);
    for (const status of ["pending", "valid"] as const) expect(ValidatedFieldListSchema.safeParse({ ...validated(), fields: [{ id: "x", label: "X", status, value: null, validatable: true }] }).success).toBe(false);
    expect(ValidatedFieldListSchema.safeParse({ ...validated(), fields: [{ id: "x", label: "X", status: "unvalidated", validatable: true }] }).success).toBe(false);
    expect(ValidatedFieldListSchema.parse({ ...validated(), fields: [{ id: "x", label: "X", status: "pending" }] }).fields[0]?.validatable).toBe(false);
  });

  it("supports empty lists and only current unique controlled selections", () => {
    expect(ValidatedFieldListSchema.parse({ ...validated(), fields: [] }).fields).toEqual([]);
    expect(ValidatedFieldListSchema.parse({ ...validated(), selectedFieldId: "subject" }).selectedFieldId).toBe("subject");
    expect(ValidatedFieldListSchema.safeParse({ ...validated(), selectedFieldId: "stale" }).success).toBe(false);
    expect(ValidatedFieldListSchema.safeParse({ ...validated(), fields: [validated().fields[0], validated().fields[0]] }).success).toBe(false);
    expect(ValidatedFieldListSchema.safeParse({ ...validated(), fields: [{ id: "constructor", label: "Unsafe ID", status: "pending" }] }).success).toBe(false);
  });

  it("distinguishes pending absence from null and rejects explicit undefined", () => {
    const absent = ValidatedFieldListSchema.parse({ ...validated(), fields: [{ id: "x", label: "X", status: "pending", message: "Awaiting the consumer." }] });
    expect(absent.fields[0]).not.toHaveProperty("value");
    expect(ValidatedFieldListSchema.parse({ ...validated(), fields: [{ id: "x", label: "X", status: "pending", value: null }] }).fields[0]).toHaveProperty("value", null);
    expect(ValidatedFieldListSchema.safeParse({ ...validated(), fields: [{ id: "x", label: "X", status: "pending", value: undefined }] }).success).toBe(false);
  });
});

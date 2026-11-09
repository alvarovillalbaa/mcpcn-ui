import { describe, expect, it } from "vitest";
import { schemaBySlug } from "@mcpcn/schemas";
import { controlledData } from "./component-preview";
import { makeFixture, playgroundItems, schemaFor, validateFixture } from "./fixtures";

const slugs = ["missing-data-request", "multi-step-form", "inline-edit-form", "form-progress-card", "validated-field-list"] as const;
const data = (slug: typeof slugs[number]) => makeFixture(slug).data as Record<string, unknown>;

describe("form workflow cohort playground fixtures and controlled intent", () => {
  it("provides five strict dedicated fixtures within all 79 unchanged catalogue identities", () => {
    expect(playgroundItems).toHaveLength(79);
    expect(playgroundItems.filter(item => item.kind === "specialized")).toHaveLength(39);
    expect(playgroundItems.filter(item => item.kind === "generic-alias")).toHaveLength(17);
    for (const slug of slugs) {
      expect(playgroundItems.find(item => item.slug === slug)?.kind).toBe("specialized");
      expect(validateFixture(makeFixture(slug)).success).toBe(true);
      expect(schemaBySlug[slug].safeParse(makeFixture(slug).data).success).toBe(true);
      expect(schemaFor(slug)).toMatchObject({ type: "object", additionalProperties: false });
    }
  });
  it("detaches fixture ownership while preserving absent missing fields and typed falsy baselines", () => {
    for (const slug of slugs) {
      const first = makeFixture(slug), second = makeFixture(slug);
      expect(first).toEqual(second); expect(first.data).not.toBe(second.data);
      const parsed = validateFixture(first); expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.data).not.toBe(first.data);
    }
    const missing = data("missing-data-request").fields as Array<Record<string, unknown>>;
    expect(missing.every(field => !Object.hasOwn(field, "value"))).toBe(true);
    const fields = data("inline-edit-form").fields as Array<Record<string, unknown>>;
    expect(fields.find(field => field.id === "count")?.value).toBe(0);
    expect(fields.find(field => field.id === "reviewed")?.value).toBe(false);
    const validated = data("validated-field-list").fields as Array<Record<string, unknown>>;
    expect(validated.find(field => field.id === "payload")?.value).toBeNull();
    expect(Object.hasOwn(validated.find(field => field.id === "pending")!, "value")).toBe(false);
  });
  it("acknowledges current controlled step navigation without echoing local form drafts", () => {
    const current = data("multi-step-form"), before = structuredClone(current);
    expect(controlledData("multi-step-form", current, { type: "change-form-step", data: { id: current.id, fromStepId: "details", stepId: "review" } })).toEqual({ currentStepId: "review" });
    for (const type of ["submit-multi-step-form", "cancel-multi-step-form"]) expect(controlledData("multi-step-form", current, { type, data: { id: current.id, values: { private: "not echoed" } } })).toBeUndefined();
    expect(current).toEqual(before);
  });
  it("acknowledges current reported progress selection without inventing progress or completion", () => {
    const current = data("form-progress-card"), before = structuredClone(current);
    const patch = controlledData("form-progress-card", current, { type: "select-form-progress-step", data: { id: current.id, stepId: "submit" } });
    expect(patch).toEqual({ selectedStepId: "submit" });
    expect(validateFixture({ ...makeFixture("form-progress-card"), data: { ...current, ...patch } }).success).toBe(true);
    for (const type of ["inspect-form-progress", "inspect-form-progress-step"]) expect(controlledData("form-progress-card", current, { type, data: { id: current.id, stepId: "review", status: "in-progress" } })).toBeUndefined();
    expect(current).toEqual(before);
  });
  it("selects a current reported field while leaving inspection and validation consumer owned", () => {
    const current = data("validated-field-list"), before = structuredClone(current);
    expect(controlledData("validated-field-list", current, { type: "select-validated-field", data: { id: current.id, fieldId: "payload" } })).toEqual({ selectedFieldId: "payload" });
    for (const type of ["inspect-validated-field", "validate-field"]) expect(controlledData("validated-field-list", current, { type, data: { id: current.id, fieldId: "subject", status: "invalid" } })).toBeUndefined();
    expect(current).toEqual(before);
  });
  it("refuses foreign root member and source-step identities in controlled acknowledgements", () => {
    for (const [slug, type, key, member] of [["multi-step-form", "change-form-step", "stepId", "review"], ["form-progress-card", "select-form-progress-step", "stepId", "submit"], ["validated-field-list", "select-validated-field", "fieldId", "count"]] as const) {
      const current = data(slug);
      for (const value of [{ id: "foreign", fromStepId: "details", [key]: member }, { id: current.id, fromStepId: "details", [key]: "foreign" }, { id: current.id, fromStepId: "details", [key]: null }]) expect(controlledData(slug, current, { type, data: value })).toBeUndefined();
    }
    const current = data("multi-step-form");
    for (const fromStepId of ["review", "foreign", null, undefined]) expect(controlledData("multi-step-form", current, { type: "change-form-step", data: { id: current.id, fromStepId, stepId: "review" } })).toBeUndefined();
  });
  it("refuses generic cards malformed typed baselines impossible counts and missing invalid messages", () => {
    for (const slug of slugs) expect(validateFixture({ kind: `mcpcn/${slug}`, version: 1, data: { title: "Generic card", items: [] } }).success).toBe(false);
    const malformed = [
      ["missing-data-request", { fields: [{ id: "subject", label: "Subject", type: "text", value: "already known" }] }],
      ["multi-step-form", { currentStepId: "foreign" }],
      ["inline-edit-form", { fields: [{ id: "count", label: "Count", type: "number", value: "coerced" }] }],
      ["form-progress-card", { progress: { completed: 4, total: 3 } }],
      ["validated-field-list", { fields: [{ id: "field", label: "Field", status: "invalid", value: null }] }],
    ] as const;
    for (const [slug, patch] of malformed) expect(validateFixture({ ...makeFixture(slug), data: { ...data(slug), ...patch } }).success).toBe(false);
  });
  it("refuses UI callbacks and unsafe JSON before dispatch while retaining terminal intent ownership", () => {
    for (const slug of slugs) for (const patch of [{ busy: true }, { error: "UI prop" }, { onAction: "callback" }]) expect(validateFixture({ ...makeFixture(slug), data: { ...data(slug), ...patch } }).success).toBe(false);
    let reads = 0;
    const value = Object.defineProperty({}, "private", { enumerable: true, get() { reads++; return "unsafe"; } });
    expect(validateFixture({ ...makeFixture("validated-field-list"), data: { ...data("validated-field-list"), fields: [{ id: "field", label: "Field", status: "valid", value }] } }).success).toBe(false);
    expect(reads).toBe(0);
    for (const [slug, type] of [["missing-data-request", "submit-missing-data"], ["missing-data-request", "cancel-missing-data"], ["inline-edit-form", "commit-inline-edit"], ["inline-edit-form", "cancel-inline-edit"]] as const) {
      const current = data(slug), before = structuredClone(current);
      expect(controlledData(slug, current, { type, data: { id: current.id, values: {}, changes: [] } })).toBeUndefined(); expect(current).toEqual(before);
    }
  });
});

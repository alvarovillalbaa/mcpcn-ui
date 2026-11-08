import { z } from "zod";
import { InspectableJSONSchema, type InspectableJSON } from "./execution-schemas.js";

const identity = z.string().min(1).max(128).refine(value => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value), "Use a trimmed nonblank identity without control characters.");
const fieldIdentity = identity.refine(value => !["__proto__", "constructor", "prototype"].includes(value), "Use a field identity other than a reserved object property.");
const textControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const text = (maximum: number) => z.string().min(1).max(maximum).refine(value => Boolean(value.trim()) && !textControls.test(value), "Use nonblank plain text without unsupported control characters.");
const common = { id: identity, title: text(240), description: text(2000).optional(), disabled: z.boolean().default(false) };
const nonnegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const status = z.enum(["not-started", "in-progress", "complete", "blocked"]);
const budgetDescription = "Parsed payloads must fit 262144 UTF-8 JSON bytes collectively. Cross-field identity, type, constraint and reference rules also run during parsing.";
const jsonDescription = "Values reuse the bounded descriptor-safe JSON guard: finite, acyclic plain JSON, at most 1000 nodes, depth 8, 200 entries per container, 10000 UTF-16 units per string and 65536 serialized UTF-16 units.";

function payloadBudget(value: unknown, context: z.RefinementCtx) {
  // A rejected nested value may remain in the refinement input; never serialize it.
  if (context.issues.length > 0) return;
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength <= 262144) return;
  } catch { /* Refuse a payload that cannot be represented safely. */ }
  context.addIssue({ code: "custom", message: "The complete parsed payload must fit 256 KiB of UTF-8 JSON." });
}

function currentSelection(items: { id: string }[], selected: string | undefined, collection: string, selection: string, context: z.RefinementCtx) {
  const ids = new Set(items.map(item => item.id));
  if (ids.size !== items.length) context.addIssue({ code: "custom", path: [collection], message: "Collection identities must be unique." });
  if (selected !== undefined && !ids.has(selected)) context.addIssue({ code: "custom", path: [selection], message: "The controlled selection must identify a current entry." });
}

const option = z.object({
  value: z.string().min(1).max(128).refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Option values cannot contain control characters."),
  label: text(500),
  disabled: z.boolean().default(false),
}).strict();

const fieldBase = {
  id: fieldIdentity,
  label: text(500),
  description: text(2000).optional(),
  required: z.boolean().default(false),
};
const textField = {
  ...fieldBase,
  value: z.intersection(InspectableJSONSchema, z.string().max(10000)).optional().describe(jsonDescription),
  minLength: z.number().int().min(0).max(10000).optional(),
  maxLength: z.number().int().min(0).max(10000).optional(),
};
export const WorkflowFormFieldSchema = z.discriminatedUnion("type", [
  z.object({ ...textField, type: z.literal("text") }).strict(),
  z.object({ ...textField, type: z.literal("textarea") }).strict(),
  z.object({ ...fieldBase, type: z.literal("number"), value: z.intersection(InspectableJSONSchema, z.number().finite()).optional().describe(jsonDescription), min: z.number().finite().optional(), max: z.number().finite().optional() }).strict(),
  z.object({ ...fieldBase, type: z.literal("boolean"), value: z.intersection(InspectableJSONSchema, z.boolean()).optional().describe(jsonDescription) }).strict(),
  z.object({ ...fieldBase, type: z.literal("select"), value: z.intersection(InspectableJSONSchema, z.string().max(128)).optional().describe(jsonDescription), options: z.array(option).min(1).max(50) }).strict(),
  z.object({ ...fieldBase, type: z.literal("json"), value: InspectableJSONSchema.optional().describe(jsonDescription) }).strict(),
]).superRefine((field, context) => {
  const issue = (path: string, message: string) => context.addIssue({ code: "custom", path: [path], message });
  if (Object.hasOwn(field, "value") && field.value === undefined) issue("value", "Omit an absent value instead of supplying undefined.");
  if (field.type === "select") {
    if (new Set(field.options.map(item => item.value)).size !== field.options.length) issue("options", "Option values must be distinct.");
    if (field.value !== undefined && !field.options.some(item => item.value === field.value)) issue("value", "Select values must identify a supplied option.");
  }
  if (field.type === "number" && field.min !== undefined && field.max !== undefined && field.min > field.max) issue("max", "Maximum cannot be below minimum.");
  if ((field.type === "text" || field.type === "textarea") && field.minLength !== undefined && field.maxLength !== undefined && field.minLength > field.maxLength) issue("maxLength", "Maximum length cannot be below minimum length.");
}).describe("A strict typed field. Supplied values must match the basic type and JSON safety; existing values may violate local required/min/max/length constraints so a human can correct them. Disabled options are displayable but cannot be submitted.");
export type WorkflowFormField = z.input<typeof WorkflowFormFieldSchema>;
export type ParsedWorkflowFormField = z.output<typeof WorkflowFormFieldSchema>;
export type WorkflowFormValue = InspectableJSON;

export const MissingDataRequestSchema = z.object({
  ...common,
  fields: z.array(WorkflowFormFieldSchema).max(100),
  knownFields: z.array(z.object({ id: fieldIdentity, label: text(500), value: InspectableJSONSchema.describe(jsonDescription) }).strict()).max(100).default([]),
  submitLabel: text(120).default("Provide information"),
  cancelLabel: text(120).default("Cancel"),
}).strict().superRefine((value, context) => {
  payloadBudget(value, context);
  currentSelection(value.fields, undefined, "fields", "fields", context);
  currentSelection(value.knownFields, undefined, "knownFields", "knownFields", context);
  const ids = new Set(value.fields.map(field => field.id));
  value.fields.forEach((field, index) => {
    if (Object.hasOwn(field, "value")) context.addIssue({ code: "custom", path: ["fields", index, "value"], message: "Requested missing fields must not carry an initial value." });
  });
  value.knownFields.forEach((field, index) => {
    if (ids.has(field.id)) context.addIssue({ code: "custom", path: ["knownFields", index, "id"], message: "Known and requested fields must be disjoint." });
  });
}).describe(`${budgetDescription} Requested fields initially lack an own value; known fields are supplied bounded JSON and have distinct, disjoint identities. Empty requests are valid.`);
export type MissingDataRequestData = z.input<typeof MissingDataRequestSchema>;
export type ParsedMissingDataRequestData = z.output<typeof MissingDataRequestSchema>;

const formStep = z.object({ id: identity, title: text(240), description: text(2000).optional(), fields: z.array(WorkflowFormFieldSchema).max(100) }).strict();
export const MultiStepFormSchema = z.object({
  ...common,
  steps: z.array(formStep).min(1).max(100),
  currentStepId: identity,
  nextLabel: text(120).default("Next"),
  previousLabel: text(120).default("Previous"),
  submitLabel: text(120).default("Submit form"),
  cancelLabel: text(120).default("Cancel"),
}).strict().superRefine((value, context) => {
  payloadBudget(value, context);
  currentSelection(value.steps, value.currentStepId, "steps", "currentStepId", context);
  const fields = value.steps.flatMap(step => step.fields);
  if (fields.length > 100) context.addIssue({ code: "custom", path: ["steps"], message: "A multi-step form can contain at most 100 fields collectively." });
  if (new Set(fields.map(field => field.id)).size !== fields.length) context.addIssue({ code: "custom", path: ["steps"], message: "Field identities must be unique across every step." });
}).describe(`${budgetDescription} Step identities and all field identities are distinct; the controlled current step must exist. At most 100 total fields. Empty explanatory steps are valid.`);
export type MultiStepFormData = z.input<typeof MultiStepFormSchema>;
export type ParsedMultiStepFormData = z.output<typeof MultiStepFormSchema>;

export const InlineEditFormSchema = z.object({
  ...common,
  fields: z.array(WorkflowFormFieldSchema).max(100),
  submitLabel: text(120).default("Save changes"),
  cancelLabel: text(120).default("Cancel"),
}).strict().superRefine((value, context) => {
  payloadBudget(value, context);
  currentSelection(value.fields, undefined, "fields", "fields", context);
}).describe(`${budgetDescription} Field identities are unique. Existing typed values can violate local constraints and remain editable; an empty field list is valid.`);
export type InlineEditFormData = z.input<typeof InlineEditFormSchema>;
export type ParsedInlineEditFormData = z.output<typeof InlineEditFormSchema>;

const progress = z.object({ completed: nonnegativeInteger, total: nonnegativeInteger }).strict().superRefine((value, context) => {
  if (value.completed > value.total) context.addIssue({ code: "custom", path: ["completed"], message: "Completed progress cannot exceed total." });
});
export const FormProgressCardSchema = z.object({
  ...common,
  status,
  progress: progress.optional(),
  steps: z.array(z.object({ id: identity, label: text(500), status, progress: progress.optional() }).strict()).max(100).default([]),
  selectedStepId: identity.optional(),
}).strict().superRefine((value, context) => {
  payloadBudget(value, context);
  currentSelection(value.steps, value.selectedStepId, "steps", "selectedStepId", context);
}).describe(`${budgetDescription} Reported status is independent of supplied progress, including total zero. Missing counts remain unknown; step identities and optional controlled selection must be current.`);
export type FormProgressCardData = z.input<typeof FormProgressCardSchema>;
export type ParsedFormProgressCardData = z.output<typeof FormProgressCardSchema>;

const validatedField = z.object({
  id: fieldIdentity,
  label: text(500),
  value: InspectableJSONSchema.optional().describe(jsonDescription),
  status: z.enum(["unvalidated", "pending", "valid", "invalid"]),
  message: text(2000).optional(),
  validatable: z.boolean().default(false),
}).strict().superRefine((field, context) => {
  const supplied = Object.hasOwn(field, "value") && field.value !== undefined;
  if (Object.hasOwn(field, "value") && !supplied) context.addIssue({ code: "custom", path: ["value"], message: "Omit an absent value instead of supplying undefined." });
  if (field.status === "valid" && !supplied) context.addIssue({ code: "custom", path: ["value"], message: "Valid fields require a supplied value, including explicit null." });
  if (field.status === "invalid" && field.message === undefined) context.addIssue({ code: "custom", path: ["message"], message: "Invalid fields require a visible message." });
  if (field.validatable && (!supplied || (field.status !== "unvalidated" && field.status !== "invalid"))) context.addIssue({ code: "custom", path: ["validatable"], message: "Only supplied unvalidated or invalid fields can request validation." });
});
export const ValidatedFieldListSchema = z.object({
  ...common,
  fields: z.array(validatedField).max(100),
  selectedFieldId: fieldIdentity.optional(),
}).strict().superRefine((value, context) => {
  payloadBudget(value, context);
  currentSelection(value.fields, value.selectedFieldId, "fields", "selectedFieldId", context);
}).describe(`${budgetDescription} Valid requires a supplied value; invalid requires a message; validatable requires a supplied unvalidated/invalid value. Consumer-reported status is not a server-safety promise.`);
export type ValidatedFieldListData = z.input<typeof ValidatedFieldListSchema>;
export type ParsedValidatedFieldListData = z.output<typeof ValidatedFieldListSchema>;

export type WorkflowFormDraft = { supplied: boolean; input: string };
export type WorkflowFormDraftResult = { success: true; supplied: false } | { success: true; supplied: true; value: WorkflowFormValue } | { success: false; message: string };
export type WorkflowFormDraftErrors = { fieldId: string; message: string }[];

/** Require a valid definition before serializing its full baseline identity. */
export function workflowFormFieldKey(field: WorkflowFormField): string {
  function ordered(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(ordered);
    if (value !== null && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered((value as Record<string, unknown>)[key])]));
    return value;
  }
  return JSON.stringify(ordered(WorkflowFormFieldSchema.parse(field)))!;
}

/** Preserve absence independently from every supplied JSON primitive. */
export function createWorkflowFormDraft(field: WorkflowFormField): WorkflowFormDraft {
  const current = WorkflowFormFieldSchema.parse(field);
  if (!Object.hasOwn(current, "value")) return { supplied: false, input: "" };
  const value = current.value!;
  return { supplied: true, input: current.type === "json" ? JSON.stringify(value)! : Object.is(value, -0) ? "-0" : String(value) };
}

/** Parse only an explicitly supplied local editor value; never coerce incoming DTOs. */
export function parseWorkflowFormDraft(field: WorkflowFormField, draft: WorkflowFormDraft): WorkflowFormDraftResult {
  const definition = WorkflowFormFieldSchema.safeParse(field);
  if (!definition.success) return { success: false, message: "This field definition is invalid." };
  const current = definition.data;
  if (draft === null || typeof draft !== "object" || typeof draft.supplied !== "boolean" || typeof draft.input !== "string") return { success: false, message: "This field draft is invalid." };
  const absent = (): WorkflowFormDraftResult => current.required ? { success: false, message: `Provide a value for ${current.label}.` } : { success: true, supplied: false };
  if (!draft.supplied) return absent();
  let value: WorkflowFormValue;
  if (current.type === "text" || current.type === "textarea") {
    value = draft.input;
    if (value.length > 10000) return { success: false, message: "Use at most 10000 characters." };
    if (current.required && !value.trim()) return { success: false, message: `Provide nonblank text for ${current.label}.` };
    if (current.minLength !== undefined && value.length < current.minLength) return { success: false, message: `Use at least ${current.minLength} characters.` };
    if (current.maxLength !== undefined && value.length > current.maxLength) return { success: false, message: `Use at most ${current.maxLength} characters.` };
  } else if (current.type === "number") {
    const input = draft.input.trim();
    if (!input) return absent();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(input) || !Number.isFinite(Number(input))) return { success: false, message: "Provide a finite decimal number." };
    value = Number(input);
    if (current.min !== undefined && value < current.min) return { success: false, message: `Use a number at least ${current.min}.` };
    if (current.max !== undefined && value > current.max) return { success: false, message: `Use a number at most ${current.max}.` };
  } else if (current.type === "boolean") {
    if (draft.input === "") return absent();
    if (draft.input !== "true" && draft.input !== "false") return { success: false, message: "Choose Yes, No or Not provided." };
    value = draft.input === "true";
  } else if (current.type === "select") {
    if (draft.input === "") return absent();
    const selected = current.options!.find(item => item.value === draft.input);
    if (!selected || selected.disabled) return { success: false, message: "Choose a current enabled option." };
    value = selected.value;
  } else {
    if (draft.input.length > 65536) return { success: false, message: "Use at most 65536 characters of JSON source." };
    let parsed: unknown;
    try { parsed = JSON.parse(draft.input); }
    catch { return { success: false, message: "Provide valid JSON, or use Clear to leave it absent." }; }
    const safe = InspectableJSONSchema.safeParse(parsed);
    if (!safe.success) return { success: false, message: "Provide bounded, finite, acyclic JSON." };
    value = safe.data;
  }
  return { success: true, supplied: true, value };
}

/** Current field order owns validation/output; stale or removed draft entries are ignored. */
export function validateWorkflowFormDrafts(fields: readonly WorkflowFormField[], drafts: Record<string, WorkflowFormDraft>): { values: Record<string, WorkflowFormValue>; errors: WorkflowFormDraftErrors } {
  const values: Record<string, WorkflowFormValue> = {}, errors: WorkflowFormDraftErrors = [], seen = new Set<string>();
  for (const field of fields) {
    const definition = WorkflowFormFieldSchema.safeParse(field);
    if (!definition.success) { errors.push({ fieldId: field.id, message: "This field definition is invalid." }); continue; }
    if (seen.has(field.id)) { delete values[field.id]; errors.push({ fieldId: field.id, message: "Field identities must be distinct." }); continue; }
    seen.add(field.id);
    const result = parseWorkflowFormDraft(definition.data, Object.hasOwn(drafts, field.id) ? drafts[field.id]! : createWorkflowFormDraft(definition.data));
    if (!result.success) errors.push({ fieldId: field.id, message: result.message });
    else if (result.supplied) values[field.id] = result.value;
  }
  if (new TextEncoder().encode(JSON.stringify(values)).byteLength > 262144) errors.push({ fieldId: "", message: "The supplied form values must fit 256 KiB of UTF-8 JSON." });
  return { values, errors };
}

import { z } from "zod";
import { InspectableJSONSchema } from "./execution-schemas.js";
import { FileExtractionFieldSchema, stableReviewKey } from "./file-review-schemas.js";

const extracted = FileExtractionFieldSchema.shape;
const identity = extracted.id;
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const plain = (maximum: number) => z.string().max(maximum).refine(value => !controls.test(value), "Use plain text without unsupported control characters.");
const label = extracted.label.refine(value => !controls.test(value), "Supply visible plain text.");
const root = { id: identity, revision: identity, title: label, description: plain(4000).optional() };
const message = plain(4000).optional();
const failure = plain(4000).refine(value => Boolean(value.trim()), "Supply a nonblank failure message.");

function safeDTO(value: unknown): boolean {
  let nodes = 0;
  const ancestors = new Set<object>();
  function visit(item: unknown, depth: number): boolean {
    // A record DTO adds four levels above each unchanged depth-eight JSON value.
    // 100 fields with 1000 JSON nodes and 20 evidence objects fit below this bound.
    if (++nodes > 120000 || depth > 12) return false;
    if (item === undefined || item === null || typeof item === "boolean") return true;
    if (typeof item === "number") return Number.isFinite(item);
    if (typeof item === "string") return item.length <= 10000;
    if (typeof item !== "object" || ancestors.has(item) || Object.getOwnPropertySymbols(item).length > 0) return false;
    const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const keys = Object.keys(descriptors).filter(key => !(array && key === "length"));
    if (keys.length > 200 || (array && (descriptors.length?.value !== keys.length || keys.some((key, index) => key !== String(index))))) return false;
    ancestors.add(item);
    try {
      return keys.every(key => {
        const descriptor = descriptors[key];
        return key.length <= 256 && descriptor !== undefined && descriptor.enumerable === true
          && "value" in descriptor && visit(descriptor.value, depth + 1);
      });
    } finally { ancestors.delete(item); }
  }
  try { return visit(value, 0); } catch { return false; }
}

function dtoGuard<T>() {
  return z.unknown().superRefine((value, context) => {
    if (!safeDTO(value)) context.addIssue({ code: "custom", message: "Supply bounded plain DTOs without accessors, symbols, cycles or foreign prototypes." });
  }) as z.ZodType<T, T>;
}

function payloadBudget(value: unknown, context: z.RefinementCtx) {
  // Nested JSON may be rejected: never serialize it while any issue remains.
  if (context.issues.length) return;
  try {
    if (new TextEncoder().encode(stableReviewKey(value)).byteLength <= 2 * 1024 * 1024) return;
  } catch { /* A parsed DTO must have an unambiguous bounded JSON representation. */ }
  context.addIssue({ code: "custom", message: "The complete parsed DTO must fit 2 MiB of UTF-8 JSON." });
}

const field = z.object({
  id: identity, revision: identity, label, value: InspectableJSONSchema,
  confidence: extracted.confidence, evidence: extracted.evidence,
}).strict();
export const InspectionFieldSchema = dtoGuard<z.input<typeof field>>().pipe(field);
export type InspectionField = z.input<typeof InspectionFieldSchema>;
export type ParsedInspectionField = z.output<typeof InspectionFieldSchema>;

const fields = z.array(InspectionFieldSchema).max(100).refine(value => new Set(value.map(item => item.id)).size === value.length, "Field identities must be unique.");
const selected = identity.nullable().optional();
const record = z.object({ id: identity, revision: identity, label, fields }).strict();

const inspector = z.discriminatedUnion("state", [
  z.object({ ...root, state: z.literal("ready"), record, selectedFieldId: selected, message }).strict(),
  z.object({ ...root, state: z.literal("loading"), message }).strict(),
  z.object({ ...root, state: z.literal("empty"), message }).strict(),
  z.object({ ...root, state: z.literal("error"), message: failure }).strict(),
]).superRefine((value, context) => {
  if (value.state === "ready" && value.selectedFieldId !== undefined && value.selectedFieldId !== null
    && !value.record.fields.some(item => item.id === value.selectedFieldId)) {
    context.addIssue({ code: "custom", path: ["selectedFieldId"], message: "Select a current field in this record." });
  }
  payloadBudget(value, context);
});
export const RecordInspectorSchema = dtoGuard<z.input<typeof inspector>>().pipe(inspector)
  .describe("Strict supplied record fields, complete guarded JSON values and identity-only selection. Parsed data fits 2 MiB UTF-8 JSON. Confidence and evidence are supplied claims, not verification.");
export type RecordInspectorData = z.input<typeof RecordInspectorSchema>;
export type ParsedRecordInspectorData = z.output<typeof RecordInspectorSchema>;

const confidenceList = z.discriminatedUnion("state", [
  z.object({ ...root, state: z.literal("ready"), fields, selectedFieldId: selected, message }).strict(),
  z.object({ ...root, state: z.literal("loading"), message }).strict(),
  z.object({ ...root, state: z.literal("empty"), message }).strict(),
  z.object({ ...root, state: z.literal("error"), message: failure }).strict(),
]).superRefine((value, context) => {
  if (value.state === "ready" && value.selectedFieldId !== undefined && value.selectedFieldId !== null
    && !value.fields.some(item => item.id === value.selectedFieldId)) {
    context.addIssue({ code: "custom", path: ["selectedFieldId"], message: "Select a current confidence field." });
  }
  payloadBudget(value, context);
});
export const FieldConfidenceListSchema = dtoGuard<z.input<typeof confidenceList>>().pipe(confidenceList)
  .describe("Strict supplied field confidence and complete guarded values, with a collective 2 MiB parsed UTF-8 JSON limit. Absent confidence differs from zero; no confidence threshold or authenticity is inferred.");
export type FieldConfidenceListData = z.input<typeof FieldConfidenceListSchema>;
export type ParsedFieldConfidenceListData = z.output<typeof FieldConfidenceListSchema>;

type ComponentScope = { componentId: string; componentRevision: string };
type RecordScope = ComponentScope & { recordId: string; recordRevision: string };
type FieldScope = { fieldId: string; fieldRevision: string };
export type RecordInspectorIntent =
  | { type: "inspect-record-field"; data: RecordScope & FieldScope }
  | { type: "clear-record-field"; data: RecordScope };
export type FieldConfidenceListIntent =
  | { type: "inspect-confidence-field"; data: ComponentScope & FieldScope }
  | { type: "clear-confidence-field"; data: ComponentScope };

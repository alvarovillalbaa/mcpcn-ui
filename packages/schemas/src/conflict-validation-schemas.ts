import { z } from "zod";
import { InspectableJSONSchema } from "./execution-schemas.js";
import { FileExtractionFieldSchema, stableReviewKey } from "./file-review-schemas.js";
import { InspectionFieldSchema } from "./record-inspection-schemas.js";

const extracted = FileExtractionFieldSchema.shape;
const identity = extracted.id;
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const plain = (maximum: number) => z.string().max(maximum).refine(value => !controls.test(value), "Use plain text without unsupported control characters.");
const label = extracted.label.refine(value => !controls.test(value), "Supply visible plain text.");
const nonblank = plain(4000).refine(value => Boolean(value.trim()), "Supply a nonblank message.");
const root = { id: identity, revision: identity, title: label, description: plain(4000).optional() };
const message = plain(4000).optional();
const selection = identity.nullable().optional();

function safeDTO(value: unknown): boolean {
  let nodes = 0;
  const ancestors = new Set<object>();
  function visit(item: unknown, depth: number): boolean {
    // The report/conflict shell adds four levels above unchanged depth-eight JSON.
    // All 100 issues with 1000 context nodes and 20 evidence objects fit this bound.
    if (++nodes > 120000 || depth > 12) return false;
    if (item === undefined || item === null || typeof item === "boolean") return true;
    if (typeof item === "number") return Number.isFinite(item);
    if (typeof item === "string") return item.length <= 10000;
    if (typeof item !== "object" || ancestors.has(item) || Object.getOwnPropertySymbols(item).length > 0) return false;
    const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const keys = Object.keys(descriptors).filter(key => !(array && key === "length"));
    if (keys.length > 200 || array && (descriptors.length?.value !== keys.length || keys.some((key, index) => key !== String(index)))) return false;
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
  if (context.issues.length) return;
  try {
    if (new TextEncoder().encode(stableReviewKey(value)).byteLength <= 2 * 1024 * 1024) return;
  } catch { /* Rejected nested values must never be serialized for budget measurement. */ }
  context.addIssue({ code: "custom", message: "The complete parsed DTO must fit 2 MiB of UTF-8 JSON." });
}

const candidates = z.array(InspectionFieldSchema).min(2).max(20)
  .refine(items => new Set(items.map(item => item.id)).size === items.length, "Candidate identities must be unique.");
const conflict = z.object({ id: identity, revision: identity, label, candidates }).strict();
const resolver = z.discriminatedUnion("state", [
  z.object({ ...root, state: z.literal("ready"), conflict, selectedCandidateId: selection, message }).strict(),
  z.object({ ...root, state: z.literal("loading"), message }).strict(),
  z.object({ ...root, state: z.literal("empty"), message }).strict(),
  z.object({ ...root, state: z.literal("error"), message: nonblank }).strict(),
]).superRefine((value, context) => {
  if (value.state === "ready" && value.selectedCandidateId !== undefined && value.selectedCandidateId !== null
    && !value.conflict.candidates.some(candidate => candidate.id === value.selectedCandidateId)) {
    context.addIssue({ code: "custom", path: ["selectedCandidateId"], message: "Select a current candidate in this conflict." });
  }
  payloadBudget(value, context);
});
export const ConflictResolverSchema = dtoGuard<z.input<typeof resolver>>().pipe(resolver)
  .describe("Strict supplied conflict candidates with complete guarded JSON, optional reported confidence and evidence. Parsed data fits 2 MiB UTF-8 JSON. Selection and confirmation are identity-only requests, never a resolved state.");
export type ConflictResolverData = z.input<typeof ConflictResolverSchema>;
export type ParsedConflictResolverData = z.output<typeof ConflictResolverSchema>;

const issue = z.object({
  id: identity, revision: identity, label, severity: z.enum(["info", "warning", "error"]), message: nonblank,
  context: InspectableJSONSchema.optional(), evidence: extracted.evidence,
}).strict().superRefine((value, context) => {
  if (Object.hasOwn(value, "context") && value.context === undefined) {
    context.addIssue({ code: "custom", path: ["context"], message: "Omit absent context or supply a complete JSON value." });
  }
});
export const ValidationIssueSchema = dtoGuard<z.input<typeof issue>>().pipe(issue);
export type ValidationIssue = z.input<typeof ValidationIssueSchema>;
export type ParsedValidationIssue = z.output<typeof ValidationIssueSchema>;

const issues = z.array(ValidationIssueSchema).max(100)
  .refine(items => new Set(items.map(item => item.id)).size === items.length, "Issue identities must be unique.");
const report = z.object({ id: identity, revision: identity, label, reportedStatus: z.enum(["unknown", "pending", "valid", "invalid"]), issues }).strict();
const summary = z.discriminatedUnion("state", [
  z.object({ ...root, state: z.literal("ready"), report, selectedIssueId: selection, message }).strict(),
  z.object({ ...root, state: z.literal("loading"), message }).strict(),
  z.object({ ...root, state: z.literal("empty"), message }).strict(),
  z.object({ ...root, state: z.literal("error"), message: nonblank }).strict(),
]).superRefine((value, context) => {
  if (value.state === "ready" && value.selectedIssueId !== undefined && value.selectedIssueId !== null
    && !value.report.issues.some(item => item.id === value.selectedIssueId)) {
    context.addIssue({ code: "custom", path: ["selectedIssueId"], message: "Select a current issue in this report." });
  }
  payloadBudget(value, context);
});
export const ValidationSummarySchema = dtoGuard<z.input<typeof summary>>().pipe(summary)
  .describe("Strict supplied validation report and complete issue context/evidence, with a collective 2 MiB parsed UTF-8 JSON limit. Reported status is independent of issue count and severity; no validation, correction or authority is inferred.");
export type ValidationSummaryData = z.input<typeof ValidationSummarySchema>;
export type ParsedValidationSummaryData = z.output<typeof ValidationSummarySchema>;

type ComponentScope = { componentId: string; componentRevision: string };
type ConflictScope = ComponentScope & { conflictId: string; conflictRevision: string };
type CandidateScope = { candidateId: string; candidateRevision: string };
export type ConflictResolverIntent =
  | { type: "select-conflict-candidate"; data: ConflictScope & CandidateScope }
  | { type: "clear-conflict-candidate"; data: ConflictScope }
  | { type: "confirm-conflict-candidate"; data: ConflictScope & CandidateScope };
type ReportScope = ComponentScope & { reportId: string; reportRevision: string };
type IssueScope = { issueId: string; issueRevision: string };
export type ValidationSummaryIntent =
  | { type: "inspect-validation-issue"; data: ReportScope & IssueScope }
  | { type: "clear-validation-issue"; data: ReportScope };

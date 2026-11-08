import { z } from "zod";
import { InspectableJSONSchema } from "./execution-schemas.js";

const identity = z.string().min(1).max(128).refine(value => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value), "Use a trimmed nonblank identity without control characters.");
const textControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const text = (maximum: number) => z.string().min(1).max(maximum).refine(value => Boolean(value.trim()) && !textControls.test(value), "Use nonblank plain text without unsupported control characters.");
const common = { id: identity, title: text(240), description: text(2000).optional(), disabled: z.boolean().default(false) };
const nonnegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveInteger = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const budgetDescription = "Parsed payloads must fit 262144 UTF-8 JSON bytes collectively. Cross-field state, identity and reference rules also run during parsing.";
const jsonDescription = "The shared JSON guard additionally requires finite, acyclic plain JSON: at most 1000 nodes, depth 8, 200 entries per container, 10000 UTF-16 units per string and 65536 serialized UTF-16 units. Sparse arrays, accessors, symbols and non-plain objects are refused.";
function payloadBudget(value: unknown, context: z.RefinementCtx) {
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength <= 262144) return;
  } catch { /* Invalid JSON is also a payload refusal. */ }
  context.addIssue({ code: "custom", message: "The complete parsed payload must fit 256 KiB of UTF-8 JSON." });
}
function currentSelection(items: { id: string }[], selected: string | undefined, key: string, selectionKey: string, context: z.RefinementCtx) {
  const ids = new Set(items.map(item => item.id));
  if (ids.size !== items.length) context.addIssue({ code: "custom", path: [key], message: "Collection identities must be unique." });
  if (selected !== undefined && !ids.has(selected)) context.addIssue({ code: "custom", path: [selectionKey], message: "The controlled selection must identify a current entry." });
}

export const ToolResultCardSchema = z.object({
  ...common,
  tool: identity,
  status: z.enum(["succeeded", "failed", "partial"]),
  result: InspectableJSONSchema.optional().describe(jsonDescription),
  errorMessage: text(2000).optional(),
  resultLabel: text(500).default("Result"),
  inspectLabel: text(120).default("Inspect outcome"),
}).strict().superRefine((value, context) => {
  payloadBudget(value, context);
  if (value.status !== "failed" && value.result === undefined) context.addIssue({ code: "custom", path: ["result"], message: "Succeeded and partial outcomes require a supplied result, including explicit null." });
  if (value.status === "failed" && value.errorMessage === undefined) context.addIssue({ code: "custom", path: ["errorMessage"], message: "A failed outcome requires an error message." });
  if (value.status === "succeeded" && value.errorMessage !== undefined) context.addIssue({ code: "custom", path: ["errorMessage"], message: "Succeeded outcomes cannot carry error detail." });
}).describe(`${budgetDescription} Succeeded/partial require result; failed requires errorMessage; succeeded forbids errorMessage.`);
export type ToolResultCardData = z.input<typeof ToolResultCardSchema>;
export type ParsedToolResultCardData = z.output<typeof ToolResultCardSchema>;

export const RunningTaskCardSchema = z.object({
  ...common,
  status: z.enum(["queued", "running", "paused", "completed", "failed", "cancelled"]),
  currentStep: text(500).optional(),
  elapsedMs: nonnegativeInteger.optional(),
  errorMessage: text(2000).optional(),
  progress: z.object({ completed: nonnegativeInteger, total: positiveInteger }).strict().optional(),
  cancellable: z.boolean().default(false),
  inspectLabel: text(120).default("Inspect task"),
  cancelLabel: text(120).default("Request cancellation"),
}).strict().superRefine((value, context) => {
  payloadBudget(value, context);
  if (value.errorMessage !== undefined && value.status !== "failed") context.addIssue({ code: "custom", path: ["errorMessage"], message: "Only failed tasks may carry error detail." });
  if (value.progress) {
    if (value.progress.completed > value.progress.total) context.addIssue({ code: "custom", path: ["progress", "completed"], message: "Completed progress cannot exceed its total." });
    if (value.status === "queued" && value.progress.completed !== 0) context.addIssue({ code: "custom", path: ["progress", "completed"], message: "Queued progress must report zero completed units." });
    if (value.status === "completed" && value.progress.completed !== value.progress.total) context.addIssue({ code: "custom", path: ["progress"], message: "Completed status requires complete reported progress." });
  }
}).describe(`${budgetDescription} Progress cannot exceed total; queued progress is zero; completed status requires complete progress. A running task at 100% stays running. Cancellation is intent gated by status and cancellable.`);
export type RunningTaskCardData = z.input<typeof RunningTaskCardSchema>;
export type ParsedRunningTaskCardData = z.output<typeof RunningTaskCardSchema>;

const resultPart = z.object({
  id: identity,
  label: text(500),
  status: z.enum(["available", "failed", "pending"]),
  value: InspectableJSONSchema.optional().describe(jsonDescription),
  message: text(2000).optional(),
  attempt: z.number().int().min(1).max(1000).default(1),
  retryable: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  if (value.status === "available" && value.value === undefined) context.addIssue({ code: "custom", path: ["value"], message: "Available parts require a supplied value, including explicit null." });
  if (value.status === "failed" && value.message === undefined) context.addIssue({ code: "custom", path: ["message"], message: "Failed parts require a message." });
  if (value.status === "pending" && (Object.hasOwn(value, "value") || Object.hasOwn(value, "message"))) context.addIssue({ code: "custom", message: "Pending parts cannot carry a supplied value or message." });
  if (value.retryable && value.status !== "failed") context.addIssue({ code: "custom", path: ["retryable"], message: "Only failed parts can be retryable." });
});
export const PartialResultViewerSchema = z.object({
  ...common,
  status: z.enum(["streaming", "partial", "complete", "failed"]),
  parts: z.array(resultPart).max(100).describe("Ordered parts with unique identities and status-compatible values/messages/retry flags."),
  selectedPartId: identity.optional().describe("Optional current part identity; unavailable parts may remain selected."),
  inspectLabel: text(120).default("Inspect part"),
  retryLabel: text(120).default("Request part retry"),
}).strict().superRefine((value, context) => {
  payloadBudget(value, context);
  currentSelection(value.parts, value.selectedPartId, "parts", "selectedPartId", context);
  if (value.status === "complete" && value.parts.some(part => part.status !== "available")) context.addIssue({ code: "custom", path: ["parts"], message: "Complete results require every part to be available; empty complete results are valid." });
}).describe(`${budgetDescription} Available parts require value; failed parts require message; pending parts forbid value/message. Retryable parts must be failed. Complete overall status requires all parts available; other overall states remain explicit.`);
export type PartialResultViewerData = z.input<typeof PartialResultViewerSchema>;
export type ParsedPartialResultViewerData = z.output<typeof PartialResultViewerSchema>;

const queuedStep = z.object({
  id: identity,
  label: text(500),
  status: z.enum(["queued", "running", "succeeded", "failed", "skipped", "cancelled"]),
  message: text(2000).optional(),
  attempt: z.number().int().min(0).max(1000).default(0),
  retryable: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  if (["running", "succeeded", "failed"].includes(value.status) && value.attempt < 1) context.addIssue({ code: "custom", path: ["attempt"], message: "Running, succeeded and failed steps require an actual attempt." });
  if (value.retryable && value.status !== "failed") context.addIssue({ code: "custom", path: ["retryable"], message: "Only failed steps can be retryable." });
});
export const QueuedStepListSchema = z.object({
  ...common,
  steps: z.array(queuedStep).max(100).describe("Unique steps in consumer order. Concurrent running steps are valid; status/attempt and retry rules run during parsing."),
  selectedStepId: identity.optional().describe("Optional identity of a current step."),
  inspectLabel: text(120).default("Inspect step"),
  retryLabel: text(120).default("Request step retry"),
}).strict().superRefine((value, context) => {
  payloadBudget(value, context);
  currentSelection(value.steps, value.selectedStepId, "steps", "selectedStepId", context);
}).describe(`${budgetDescription} Running/succeeded/failed steps require attempt>=1. Retryable is allowed only for failed steps. Empty and concurrently running queues remain valid.`);
export type QueuedStepListData = z.input<typeof QueuedStepListSchema>;
export type ParsedQueuedStepListData = z.output<typeof QueuedStepListSchema>;

const eventKind = z.enum(["input", "progress", "output", "error", "note"]);
const traceEvent = z.object({
  id: identity,
  label: text(500),
  kind: eventKind,
  parentId: identity.optional(),
  elapsedMs: nonnegativeInteger.optional(),
  details: InspectableJSONSchema.optional().describe(jsonDescription),
}).strict();
export const ToolTraceViewerSchema = z.object({
  ...common,
  events: z.array(traceEvent).max(100).describe("Unique event identities in consumer order; parent references must be current, non-self and acyclic. Later-array parents are valid."),
  filterKind: z.enum(["all", "input", "progress", "output", "error", "note"]).default("all"),
  selectedEventId: identity.optional().describe("Optional current event identity; a selection hidden by the current filter remains valid."),
  inspectLabel: text(120).default("Inspect event"),
}).strict().superRefine((value, context) => {
  payloadBudget(value, context);
  currentSelection(value.events, value.selectedEventId, "events", "selectedEventId", context);
  const events = new Map(value.events.map(event => [event.id, event]));
  for (const [index, event] of value.events.entries()) {
    if (event.parentId === undefined) continue;
    if (event.parentId === event.id || !events.has(event.parentId)) {
      context.addIssue({ code: "custom", path: ["events", index, "parentId"], message: "Parents must identify another current event." });
      continue;
    }
    const seen = new Set([event.id]);
    let parent: string | undefined = event.parentId;
    while (parent !== undefined && events.has(parent)) {
      if (seen.has(parent)) { context.addIssue({ code: "custom", path: ["events", index, "parentId"], message: "Trace parent references must be acyclic." }); break; }
      seen.add(parent); parent = events.get(parent)!.parentId;
    }
  }
}).describe(`${budgetDescription} Parent references must be current, non-self and acyclic. Preserve consumer order, including later-array parents. A selected event may be hidden by the current controlled filter.`);
export type ToolTraceViewerData = z.input<typeof ToolTraceViewerSchema>;
export type ParsedToolTraceViewerData = z.output<typeof ToolTraceViewerSchema>;

import { z } from "zod";
import { InspectionFieldSchema } from "./record-inspection-schemas.js";

const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const text = (max: number) => z.string().max(max).refine(value => !controls.test(value), "Supply plain text without unsupported control characters.");
const visible = (max: number) => text(max).refine(value => Boolean(value.trim()), "Supply nonblank visible text.");
const identity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const root = { id: identity, revision: identity, title: visible(300), description: text(4000).optional() };
const report = { id: identity, revision: identity, label: visible(300) };
const action = z.object({ id: identity, revision: identity, label: visible(300), available: z.boolean() }).strict();
const notes = z.array(visible(10000)).max(20);
const unique = (rows: Array<{ id: string }>) => new Set(rows.map(row => row.id)).size === rows.length;

function plainDTO(value: unknown): boolean {
  let nodes = 0;
  const ancestors = new Set<object>();
  function visit(item: unknown, depth: number): boolean {
    if (++nodes > 120000 || depth > 14) return false;
    if (item === undefined || item === null || typeof item === "boolean") return true;
    if (typeof item === "number") return Number.isFinite(item);
    if (typeof item === "string") return item.length <= 10000;
    if (typeof item !== "object" || ancestors.has(item) || Object.getOwnPropertySymbols(item).length) return false;
    const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
    const descriptors = Object.getOwnPropertyDescriptors(item), keys = Object.keys(descriptors).filter(key => !(array && key === "length"));
    if (keys.length > 200 || array && (descriptors.length?.value !== keys.length || keys.some((key, index) => key !== String(index)))) return false;
    ancestors.add(item);
    try {
      return keys.every(key => {
        const entry = descriptors[key];
        return key.length <= 256 && entry?.enumerable === true && "value" in entry && visit(entry.value, depth + 1);
      });
    } finally { ancestors.delete(item); }
  }
  try { return visit(value, 0); } catch { return false; }
}

function guarded<Output, Input>(schema: z.ZodType<Output, Input>) {
  const guard = z.unknown().superRefine((value, context) => {
    if (!plainDTO(value)) context.addIssue({ code: "custom", message: "Supply a bounded plain DTO without accessors, symbols, cycles or foreign prototypes." });
  }) as z.ZodType<Input, Input>;
  return guard.pipe(schema).superRefine((value, context) => {
    if (context.issues.length) return;
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 2 * 1024 * 1024) {
      context.addIssue({ code: "custom", message: "The complete parsed decision report must fit 2 MiB of UTF-8 JSON." });
    }
  });
}

const pending = z.object({ ...root, state: z.literal("loading"), message: text(4000).optional() }).strict();
const empty = z.object({ ...root, state: z.literal("empty"), message: text(4000).optional() }).strict();
const failure = z.object({ ...root, state: z.literal("error"), message: visible(4000) }).strict();
const options = z.array(InspectionFieldSchema).min(1).max(12).refine(unique, "Option identities must be unique.");
const recommendation = z.object({
  ...report, option: InspectionFieldSchema, rationale: visible(10000), benefits: notes,
  caveats: notes, alternatives: z.array(InspectionFieldSchema).max(12).refine(unique, "Alternative identities must be unique."),
}).strict().refine(value => !value.alternatives.some(item => item.id === value.option.id), "The recommended option cannot also be an alternative.");
export const RecommendationCardSchema = guarded(z.discriminatedUnion("state", [
  z.object({ ...root, state: z.literal("ready"), recommendation, action: action.optional() }).strict(), pending, empty, failure,
])).describe("Supplied recommendation, complete values/evidence and rationale; explicit identity-only request, never computed recommendation or approval.");

const tradeoff = z.object({ option: InspectionFieldSchema, benefits: notes, costs: notes, uncertainties: notes }).strict();
const analysis = z.object({ ...report, options: z.array(tradeoff).min(2).max(12)
  .refine(value => unique(value.map(item => item.option)), "Tradeoff option identities must be unique.") }).strict();
export const TradeoffPanelSchema = guarded(z.discriminatedUnion("state", [
  z.object({ ...root, state: z.literal("ready"), analysis, action: action.optional() }).strict(), pending, empty, failure,
])).describe("Ordered supplied tradeoffs, complete option values/evidence and independent benefits/costs/uncertainties; no scoring, sorting or inferred choice.");

const followUp = z.object({ ...report, state: z.enum(["proposed", "in-progress", "done", "unknown"]) }).strict();
const memo = z.object({ ...report, status: z.enum(["proposed", "decided", "deferred"]), context: visible(10000), rationale: visible(10000),
  options, decisionOptionId: identity.nullable(), risks: notes, followUps: z.array(followUp).max(20).refine(unique, "Follow-up identities must be unique."),
}).strict().superRefine((value, context) => {
  if (value.decisionOptionId !== null && !value.options.some(option => option.id === value.decisionOptionId)) {
    context.addIssue({ code: "custom", path: ["decisionOptionId"], message: "The reported decision must identify a current considered option." });
  }
  if (value.status === "decided" && value.decisionOptionId === null || value.status === "deferred" && value.decisionOptionId !== null) {
    context.addIssue({ code: "custom", path: ["decisionOptionId"], message: "A decided memo needs a choice; a deferred memo must have none." });
  }
});
export const DecisionMemoSchema = guarded(z.discriminatedUnion("state", [
  z.object({ ...root, state: z.literal("ready"), memo, action: action.optional() }).strict(), pending, empty, failure,
])).describe("Consumer-reported decision, full considered options, rationale, risks and follow-up states; review does not decide, execute or publish.");

const point = z.object({ finding: InspectionFieldSchema, explanation: visible(10000) }).strict();
const summary = z.object({ ...report, overview: visible(10000), points: z.array(point).min(1).max(20)
  .refine(value => unique(value.map(item => item.finding)), "Finding identities must be unique."), limitations: notes }).strict();
export const ReasoningSummarySchema = guarded(z.discriminatedUnion("state", [
  z.object({ ...root, state: z.literal("ready"), summary, action: action.optional() }).strict(), pending, empty, failure,
])).describe("Consumer-supplied user-facing rationale, findings, evidence and limitations; not an internal model trace or evidence verification.");

export type RecommendationCardData = z.input<typeof RecommendationCardSchema>;
export type TradeoffPanelData = z.input<typeof TradeoffPanelSchema>;
export type DecisionMemoData = z.input<typeof DecisionMemoSchema>;
export type ReasoningSummaryData = z.input<typeof ReasoningSummarySchema>;
export type DecisionNarrativeData = RecommendationCardData | TradeoffPanelData | DecisionMemoData | ReasoningSummaryData;
export type ParsedDecisionNarrativeData = z.output<typeof RecommendationCardSchema> | z.output<typeof TradeoffPanelSchema> | z.output<typeof DecisionMemoSchema> | z.output<typeof ReasoningSummarySchema>;
type Scope = { componentId: string; componentRevision: string; reportId: string; reportRevision: string; actionId: string; actionRevision: string };
export type DecisionNarrativeIntent =
  | { type: "request-recommendation"; data: Scope & { optionId: string; optionRevision: string } }
  | { type: "request-tradeoff-review" | "request-decision-review" | "request-summary-review"; data: Scope };

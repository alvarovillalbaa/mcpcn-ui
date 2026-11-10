import { z } from "zod";
import { InspectableJSONSchema } from "./execution-schemas.js";
import { FileExtractionFieldSchema, stableReviewKey } from "./file-review-schemas.js";
import { InspectionFieldSchema } from "./record-inspection-schemas.js";

const extracted = FileExtractionFieldSchema.shape;
const identity = extracted.id;
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const plain = (maximum: number) => z.string().max(maximum).refine(value => !controls.test(value), "Use plain text without unsupported control characters.");
const label = extracted.label.refine(value => !controls.test(value), "Supply visible plain text.");
const nonblank = (maximum: number) => plain(maximum).refine(value => Boolean(value.trim()), "Supply nonblank plain text.");
const root = { id: identity, revision: identity, title: label, description: plain(4000).optional() };
const message = plain(4000).optional();
const selection = identity.nullable().optional();

function safeDTO(value: unknown): boolean {
  let nodes = 0;
  const ancestors = new Set<object>();
  function visit(item: unknown, depth: number): boolean {
    // A list shell adds four levels above unchanged depth-eight JSON. One hundred
    // entries with 1000 JSON nodes and 20 evidence objects fit this outer budget.
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
  } catch { /* Rejected nested values must never be serialized for measurement. */ }
  context.addIssue({ code: "custom", message: "The complete parsed DTO must fit 2 MiB of UTF-8 JSON." });
}

export const ChoiceOptionSchema = InspectionFieldSchema;
export type ChoiceOption = z.input<typeof ChoiceOptionSchema>;
export type ParsedChoiceOption = z.output<typeof ChoiceOptionSchema>;

const options = z.array(ChoiceOptionSchema).min(1).max(50)
  .refine(items => new Set(items.map(item => item.id)).size === items.length, "Option identities must be unique.");
const group = z.object({ id: identity, revision: identity, label, options }).strict();
const selector = z.discriminatedUnion("state", [
  z.object({ ...root, state: z.literal("ready"), group, selectedOptionId: selection, message }).strict(),
  z.object({ ...root, state: z.literal("loading"), message }).strict(),
  z.object({ ...root, state: z.literal("empty"), message }).strict(),
  z.object({ ...root, state: z.literal("error"), message: nonblank(4000) }).strict(),
]).superRefine((value, context) => {
  if (value.state === "ready" && value.selectedOptionId !== undefined && value.selectedOptionId !== null
    && !value.group.options.some(option => option.id === value.selectedOptionId)) {
    context.addIssue({ code: "custom", path: ["selectedOptionId"], message: "Select a current option in this group." });
  }
  payloadBudget(value, context);
});
export const OptionSelectorSchema = dtoGuard<z.input<typeof selector>>().pipe(selector)
  .describe("Strict supplied options with complete guarded values and evidence. Parsed data fits 2 MiB UTF-8 JSON. Selection requests contain identities only; no default choice or action is inferred.");
export type OptionSelectorData = z.input<typeof OptionSelectorSchema>;
export type ParsedOptionSelectorData = z.output<typeof OptionSelectorSchema>;

const ranked = z.object({
  id: identity, revision: identity, label, value: InspectableJSONSchema,
  confidence: extracted.confidence, evidence: extracted.evidence,
  rank: z.number().int().min(1).max(1000000),
  score: z.number().finite().min(-1000000000000).max(1000000000000).optional(),
  scoreLabel: nonblank(300).optional(),
}).strict();
export const RankedOptionSchema = dtoGuard<z.input<typeof ranked>>().pipe(ranked);
export type RankedOption = z.input<typeof RankedOptionSchema>;
export type ParsedRankedOption = z.output<typeof RankedOptionSchema>;

const entries = z.array(RankedOptionSchema).max(100)
  .refine(items => new Set(items.map(item => item.id)).size === items.length, "Ranked entry identities must be unique.");
const list = z.object({ id: identity, revision: identity, label, entries }).strict();
const ranking = z.discriminatedUnion("state", [
  z.object({ ...root, state: z.literal("ready"), list, selectedEntryId: selection, message }).strict(),
  z.object({ ...root, state: z.literal("loading"), message }).strict(),
  z.object({ ...root, state: z.literal("empty"), message }).strict(),
  z.object({ ...root, state: z.literal("error"), message: nonblank(4000) }).strict(),
]).superRefine((value, context) => {
  if (value.state === "ready" && value.selectedEntryId !== undefined && value.selectedEntryId !== null
    && !value.list.entries.some(entry => entry.id === value.selectedEntryId)) {
    context.addIssue({ code: "custom", path: ["selectedEntryId"], message: "Select a current entry in this supplied ranking." });
  }
  payloadBudget(value, context);
});
export const RankingListSchema = dtoGuard<z.input<typeof ranking>>().pipe(ranking)
  .describe("Strict supplied ranking entries with complete guarded values and a collective 2 MiB parsed UTF-8 JSON limit. Preserve array order, ties, reported ranks and independent scores; no sorting, ranking or recommendation is performed.");
export type RankingListData = z.input<typeof RankingListSchema>;
export type ParsedRankingListData = z.output<typeof RankingListSchema>;

type ComponentScope = { componentId: string; componentRevision: string };
type GroupScope = ComponentScope & { groupId: string; groupRevision: string };
type OptionScope = { optionId: string; optionRevision: string };
export type OptionSelectorIntent =
  | { type: "select-option"; data: GroupScope & OptionScope }
  | { type: "clear-option"; data: GroupScope };
type ListScope = ComponentScope & { listId: string; listRevision: string };
type EntryScope = { entryId: string; entryRevision: string };
export type RankingListIntent =
  | { type: "inspect-ranked-option"; data: ListScope & EntryScope }
  | { type: "clear-ranked-option"; data: ListScope };

import { z } from "zod";
import { SourceEvidencePanelSchema } from "./review-schemas.js";
import { InspectableJSONSchema } from "./execution-schemas.js";
import { stableReviewKey } from "./file-review-schemas.js";

const existingSource = SourceEvidencePanelSchema.shape.sources.element;
const identity = existingSource.shape.id;
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const plain = (maximum: number) => z.string().max(maximum).refine(value => !controls.test(value), "Use plain text without unsupported control characters.");
const visible = (maximum: number) => plain(maximum).refine(value => Boolean(value.trim()), "Supply nonblank visible text.");
const root = { id: identity, revision: identity, title: visible(240), description: plain(2000).optional() };
const message = plain(2000).optional();
const maximumPayloadBytes = 2 * 1024 * 1024;

function payloadBudget(value: unknown, context: z.RefinementCtx) {
  // A failed nested JSON guard may leave unsafe input here; never serialize it.
  if (context.issues.length) return;
  try {
    if (new TextEncoder().encode(stableReviewKey(value)).byteLength <= maximumPayloadBytes) return;
  } catch { /* Parsed data must have an unambiguous bounded JSON representation. */ }
  context.addIssue({ code: "custom", message: "The complete parsed DTO must fit 2 MiB of UTF-8 JSON." });
}

/** Supplied source metadata, not a claim that the source or its URL was verified. */
export const EvidenceSourceSchema = existingSource.extend({ revision: identity }).strict();
export type EvidenceSource = z.input<typeof EvidenceSourceSchema>;
export type EvidenceSourceInput = EvidenceSource;
export type ParsedEvidenceSource = z.output<typeof EvidenceSourceSchema>;

export const EvidenceContentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().max(65536) }).strict(),
  z.object({ type: z.literal("json"), value: InspectableJSONSchema }).strict(),
]);
export type EvidenceContent = z.input<typeof EvidenceContentSchema>;
export type ParsedEvidenceContent = z.output<typeof EvidenceContentSchema>;

export const SourceListSchema = z.discriminatedUnion("state", [
  z.object({ ...root, state: z.literal("ready"), sources: z.array(EvidenceSourceSchema).max(100),
    selectedSourceId: identity.nullable().optional(), message }).strict(),
  z.object({ ...root, state: z.literal("loading"), message }).strict(),
  z.object({ ...root, state: z.literal("empty"), message }).strict(),
  z.object({ ...root, state: z.literal("error"), message: visible(2000) }).strict(),
]).superRefine((list, context) => {
  if (list.state === "ready") {
    const ids = new Set(list.sources.map(source => source.id));
    if (ids.size !== list.sources.length) context.addIssue({ code: "custom", path: ["sources"], message: "Source identities must be unique." });
    if (list.selectedSourceId !== undefined && list.selectedSourceId !== null && !ids.has(list.selectedSourceId)) {
      context.addIssue({ code: "custom", path: ["selectedSourceId"], message: "Select a current source." });
    }
  }
  payloadBudget(list, context);
}).describe("Strict supplied source metadata and current selection. The complete parsed DTO fits 2 MiB UTF-8 JSON; sources are not fetched or verified.");
export type SourceListData = z.input<typeof SourceListSchema>;
export type ParsedSourceListData = z.output<typeof SourceListSchema>;

const drawer = { ...root, open: z.boolean().optional() };
export const EvidenceDrawerSchema = z.discriminatedUnion("state", [
  z.object({ ...drawer, state: z.literal("ready"), source: EvidenceSourceSchema, content: EvidenceContentSchema, message }).strict(),
  z.object({ ...drawer, state: z.literal("loading"), source: EvidenceSourceSchema.optional(), message }).strict(),
  z.object({ ...drawer, state: z.literal("empty"), message }).strict(),
  z.object({ ...drawer, state: z.literal("error"), source: EvidenceSourceSchema.optional(), message: visible(2000) }).strict(),
]).superRefine(payloadBudget).describe("Strict caller-supplied evidence with a collective 2 MiB parsed UTF-8 JSON budget. Optional open is an external opening request with owned dismissal; absence is preserved. No fetch, verification or persistence is implied.");
export type EvidenceDrawerData = z.input<typeof EvidenceDrawerSchema>;
export type ParsedEvidenceDrawerData = z.output<typeof EvidenceDrawerSchema>;

type ListScope = { listId: string; listRevision: string; sourceId: string; sourceRevision: string };
export type SourceListIntent =
  | { type: "select-source"; data: ListScope }
  | { type: "inspect-source"; data: ListScope };
type DrawerScope = { drawerId: string; drawerRevision: string } & (
  | { sourceId: string; sourceRevision: string }
  | { sourceId?: never; sourceRevision?: never }
);
export type EvidenceDrawerIntent =
  | { type: "open-evidence"; data: DrawerScope }
  | { type: "close-evidence"; data: DrawerScope };

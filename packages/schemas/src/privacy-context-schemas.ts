import { z } from "zod";
import { InspectableJSONSchema } from "./execution-schemas.js";

const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const text = (max: number) => z.string().max(max).refine(value => !controls.test(value), "Supply plain text without unsupported control characters.");
const visible = (max: number) => text(max).refine(value => Boolean(value.trim()), "Supply nonblank visible text.");
const identity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const root = { id: identity, revision: identity, title: visible(300), description: text(4000).optional() };
const member = { id: identity, revision: identity, label: visible(300) };
const action = z.object({ ...member, available: z.boolean() }).strict();
const unique = (rows: Array<{ id: string }>) => new Set(rows.map(row => row.id)).size === rows.length;
const pending = z.object({ ...root, state: z.literal("loading"), message: text(4000).optional() }).strict();
const empty = z.object({ ...root, state: z.literal("empty"), message: text(4000).optional() }).strict();
const failure = z.object({ ...root, state: z.literal("error"), message: visible(4000) }).strict();

// Inspect descriptors before Zod can read fields. This guard covers the enclosing
// DTO; each complete JSON value also retains InspectableJSONSchema's own bounds.
function plainDTO(value: unknown): boolean {
  let nodes = 0;
  const ancestors = new Set<object>();
  function visit(item: unknown, depth: number): boolean {
    if (++nodes > 40000 || depth > 14) return false;
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
      context.addIssue({ code: "custom", message: "The complete parsed privacy report must fit 2 MiB of UTF-8 JSON." });
    }
  });
}

const resource = z.object({ ...member, operation: z.enum(["read", "write", "delete"]),
  fields: z.array(z.object(member).strict()).max(100).refine(unique, "Field identities must be unique."),
  reportedRecordCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
}).strict();
const access = z.object({ ...member, requesterLabel: visible(300), purpose: visible(10000),
  reportedStatus: z.enum(["planned", "allowed", "denied", "unknown"]),
  resources: z.array(resource).min(1).max(20).refine(unique, "Resource identities must be unique."),
}).strict();
export const DataAccessNoticeSchema = guarded(z.discriminatedUnion("state", [
  z.object({ ...root, state: z.literal("ready"), access, action: action.optional() }).strict(), pending, empty, failure,
])).describe("Reported data access metadata and identity-only review requests. No records are read and reported access grants no permission.");

const boundaryEntry = z.discriminatedUnion("visibility", [
  z.object({ ...member, visibility: z.literal("model-visible"), value: InspectableJSONSchema }).strict(),
  z.object({ ...member, visibility: z.literal("private-ui"), value: InspectableJSONSchema }).strict(),
  z.object({ ...member, visibility: z.literal("server-only"), description: text(4000).optional() }).strict(),
]);
const boundary = z.object({ ...member, entries: z.array(boundaryEntry).min(1).max(20).refine(unique, "Boundary entry identities must be unique.") }).strict();
export const PrivacyBoundaryCardSchema = guarded(z.discriminatedUnion("state", [
  z.object({ ...root, state: z.literal("ready"), boundary, action: action.optional() }).strict(), pending, empty, failure,
])).describe("Consumer-reported model-visible/private-UI complete values and server-only metadata. Never include server-only values in the client payload; this display does not enforce isolation.");

const consentScope = z.object({ ...member, description: text(4000).optional(), required: z.boolean(), available: z.boolean() }).strict();
const request = z.object({ ...member, recipientLabel: visible(300), purpose: visible(10000),
  reportedDecision: z.enum(["not-recorded", "granted", "declined", "revoked", "unknown"]),
  scopes: z.array(consentScope).min(1).max(20).refine(unique, "Consent scope identities must be unique."),
}).strict();
export const ConsentPanelSchema = guarded(z.discriminatedUnion("state", [
  z.object({ ...root, state: z.literal("ready"), request, approveAction: action.optional(), declineAction: action.optional() }).strict(), pending, empty, failure,
])).describe("Explicit current scope selection and unchecked acknowledgement before identity-only consent intent. Reported decisions do not preselect scopes; requests do not grant or revoke access.");

const section = z.object({ ...member, value: InspectableJSONSchema }).strict();
const excluded = z.object({ ...member, reason: visible(4000) }).strict();
const preview = z.object({ ...member, recipientLabel: visible(300), purpose: visible(10000),
  sections: z.array(section).min(1).max(20).refine(unique, "Context section identities must be unique."),
  excluded: z.array(excluded).max(20).refine(unique, "Excluded item identities must be unique."),
  reportedTokenEstimate: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
}).strict().refine(value => !value.excluded.some(item => value.sections.some(section => section.id === item.id)), "Included and excluded identities must be disjoint.");
export const ModelContextPreviewSchema = guarded(z.discriminatedUnion("state", [
  z.object({ ...root, state: z.literal("ready"), preview, action: action.optional() }).strict(), pending, empty, failure,
])).describe("Complete supplied planned context, metadata-only exclusions and reported token estimate. Explicit acknowledgement emits section identities only; no automatic context update or model send.");

export type DataAccessNoticeData = z.input<typeof DataAccessNoticeSchema>;
export type PrivacyBoundaryCardData = z.input<typeof PrivacyBoundaryCardSchema>;
export type ConsentPanelData = z.input<typeof ConsentPanelSchema>;
export type ModelContextPreviewData = z.input<typeof ModelContextPreviewSchema>;
export type PrivacyContextData = DataAccessNoticeData | PrivacyBoundaryCardData | ConsentPanelData | ModelContextPreviewData;
export type ParsedPrivacyContextData = z.output<typeof DataAccessNoticeSchema> | z.output<typeof PrivacyBoundaryCardSchema> | z.output<typeof ConsentPanelSchema> | z.output<typeof ModelContextPreviewSchema>;
type Scope = { componentId: string; componentRevision: string; reportId: string; reportRevision: string; actionId: string; actionRevision: string };
export type PrivacyContextIntent =
  | { type: "request-data-access-review" | "request-privacy-review" | "decline-consent-request"; data: Scope }
  | { type: "request-consent-approval"; data: Scope & { scopes: Array<{ scopeId: string; scopeRevision: string }> } }
  | { type: "request-context-handoff"; data: Scope & { sections: Array<{ sectionId: string; sectionRevision: string }> } };

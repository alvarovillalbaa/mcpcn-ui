import { z } from "zod";

const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const text = (maximum: number) => z.string().max(maximum).refine(value => !controls.test(value), "Supply plain text without unsupported control characters.");
const visible = (maximum: number) => text(maximum).refine(value => Boolean(value.trim()), "Supply visible nonblank text.");
const identity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const timestamp = z.string().datetime({ offset: true });
const action = z.object({ id: identity, revision: identity, label: visible(300), available: z.boolean() }).strict();
const root = { id: identity, revision: identity, title: visible(300), message: visible(4000), description: text(4000).optional(), reportedAt: timestamp.optional(), action: action.optional() };
const capability = z.object({ id: identity, revision: identity, label: visible(300), reportedSupport: z.enum(["missing", "unsupported", "unknown"]) }).strict();
const scope = z.object({ id: identity, revision: identity, label: visible(300) }).strict();
const unique = (rows: Array<{ id: string }>) => new Set(rows.map(row => row.id)).size === rows.length;
const progress = z.object({ completed: z.number().int().min(0).max(1000000), total: z.number().int().min(1).max(1000000) }).strict()
  .refine(value => value.completed <= value.total, "Completed work cannot exceed the supplied total.");

/** Inspect descriptors before Zod reads a field; no accessor is invoked. */
function plainDTO(value: unknown): boolean {
  let nodes = 0;
  const ancestors = new Set<object>();
  function visit(item: unknown, depth: number): boolean {
    if (++nodes > 4096 || depth > 6) return false;
    if (item === undefined || item === null || typeof item === "boolean") return true;
    if (typeof item === "number") return Number.isFinite(item);
    if (typeof item === "string") return item.length <= 4000;
    if (typeof item !== "object" || ancestors.has(item) || Object.getOwnPropertySymbols(item).length) return false;
    const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
    const descriptors = Object.getOwnPropertyDescriptors(item), keys = Object.keys(descriptors).filter(key => !(array && key === "length"));
    if (keys.length > 64 || array && (descriptors.length?.value !== keys.length || keys.some((key, index) => key !== String(index)))) return false;
    ancestors.add(item);
    try {
      return keys.every(key => {
        const entry = descriptors[key];
        return key.length <= 128 && entry?.enumerable === true && "value" in entry && visit(entry.value, depth + 1);
      });
    } finally { ancestors.delete(item); }
  }
  try { return visit(value, 0); } catch { return false; }
}

function guarded<T extends z.ZodType>(schema: T) {
  const guard = z.unknown().superRefine((value, context) => {
    if (!plainDTO(value)) context.addIssue({ code: "custom", message: "Supply a bounded plain DTO without accessors, symbols, cycles or foreign prototypes." });
  }) as z.ZodType<z.input<T>, z.input<T>>;
  return guard.pipe(schema).superRefine((value, context) => {
    if (context.issues.length) return;
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 64 * 1024) {
      context.addIssue({ code: "custom", message: "The complete parsed host state must fit 64 KiB of UTF-8 JSON." });
    }
  });
}

export const BillingGateSchema = guarded(z.object({ ...root, state: z.literal("billing-required"), featureLabel: visible(300), currentPlan: visible(300).optional(), requiredPlan: visible(300).optional() }).strict());
export const UnsupportedHostNoticeSchema = guarded(z.object({ ...root, state: z.literal("unsupported-host"), hostLabel: visible(300), requirements: z.array(capability).min(1).max(20).refine(unique, "Capability identities must be unique.") }).strict());
export const NoDataStateSchema = guarded(z.object({ ...root, state: z.literal("empty"), collectionLabel: visible(300), reason: z.enum(["no-records", "no-matches", "not-yet-provided"]), querySummary: text(4000).optional() }).strict());
export const LoadingBridgeStateSchema = guarded(z.object({ ...root, state: z.literal("waiting"), bridgeLabel: visible(300), phase: z.enum(["connecting", "awaiting-host", "awaiting-tool-result"]), elapsedMs: z.number().int().min(0).max(31536000000).optional(), progress: progress.optional() }).strict());
export const OfflineStateSchema = guarded(z.object({ ...root, state: z.literal("offline"), serviceLabel: visible(300), unsentChanges: z.number().int().min(0).max(1000000).optional() }).strict());
export const PermissionDeniedStateSchema = guarded(z.object({ ...root, state: z.literal("denied"), resourceLabel: visible(300), requesterLabel: visible(300).optional(), scopes: z.array(scope).max(20).refine(unique, "Scope identities must be unique.") }).strict());
export const ExpiredSessionStateSchema = guarded(z.object({ ...root, state: z.literal("expired"), serviceLabel: visible(300), expiredAt: timestamp.optional() }).strict().superRefine((value, context) => {
  if (value.expiredAt && value.reportedAt && Date.parse(value.expiredAt) > Date.parse(value.reportedAt)) {
    context.addIssue({ code: "custom", path: ["expiredAt"], message: "Reported expiry cannot be later than the supplied report timestamp." });
  }
}));

export type BillingGateData = z.input<typeof BillingGateSchema>;
export type UnsupportedHostNoticeData = z.input<typeof UnsupportedHostNoticeSchema>;
export type NoDataStateData = z.input<typeof NoDataStateSchema>;
export type LoadingBridgeStateData = z.input<typeof LoadingBridgeStateSchema>;
export type OfflineStateData = z.input<typeof OfflineStateSchema>;
export type PermissionDeniedStateData = z.input<typeof PermissionDeniedStateSchema>;
export type ExpiredSessionStateData = z.input<typeof ExpiredSessionStateSchema>;
export type HostStateData = BillingGateData | UnsupportedHostNoticeData | NoDataStateData | LoadingBridgeStateData | OfflineStateData | PermissionDeniedStateData | ExpiredSessionStateData;
export type ParsedHostStateData = z.output<typeof BillingGateSchema> | z.output<typeof UnsupportedHostNoticeSchema> | z.output<typeof NoDataStateSchema> | z.output<typeof LoadingBridgeStateSchema> | z.output<typeof OfflineStateSchema> | z.output<typeof PermissionDeniedStateSchema> | z.output<typeof ExpiredSessionStateSchema>;
export type HostStateIntent = { type: "request-billing-review" | "request-compatible-host" | "request-data-refresh" | "request-bridge-recheck" | "request-reconnect" | "request-access-review" | "request-session-renewal"; data: { componentId: string; componentRevision: string; actionId: string; actionRevision: string } };

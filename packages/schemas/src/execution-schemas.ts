import { z } from "zod";

export type InspectableJSON = null | boolean | number | string | InspectableJSON[] | { [key: string]: InspectableJSON };
export type ToolArguments = { [key: string]: InspectableJSON };

const text = (maximum: number) => z.string().max(maximum).refine(value => value.trim().length > 0, "A nonempty value is required.");
const identity = text(200).refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Control characters are not allowed.");

// Refuse values JSON would omit or reinterpret, and bound recursion before serialization.
function inspectable(value: unknown, objectOnly = false): boolean {
  let count = 0;
  const ancestors = new Set<object>();
  function visit(item: unknown, depth: number): boolean {
    if (++count > 1000 || depth > 8) return false;
    if (item === null || typeof item === "boolean") return true;
    if (typeof item === "number") return Number.isFinite(item);
    if (typeof item === "string") return item.length <= 10000;
    if (typeof item !== "object" || ancestors.has(item) || Object.getOwnPropertySymbols(item).length > 0) return false;
    const array = Array.isArray(item);
    if (!array && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) return false;
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const keys = Object.keys(descriptors).filter(key => !(array && key === "length"));
    if (keys.length > 200 || (array && keys.length !== item.length)) return false;
    ancestors.add(item);
    try {
      return keys.every((key, index) => {
        const descriptor = descriptors[key];
        return key.length <= 256 && key !== "__proto__" && (!array || key === String(index)) && descriptor !== undefined
          && descriptor.enumerable === true && "value" in descriptor && visit(descriptor.value, depth + 1);
      });
    } finally { ancestors.delete(item); }
  }
  try {
    return (!objectOnly || (value !== null && typeof value === "object" && !Array.isArray(value)))
      && visit(value, 0) && JSON.stringify(value).length <= 65536;
  } catch { return false; }
}

const jsonShape: z.ZodType<InspectableJSON, InspectableJSON> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number(), z.string(), z.array(jsonShape), z.record(z.string(), jsonShape),
]));
// Run the bounded guard before recursive parsing; the JSON shape supplies owned
// parsed values and remains representable by the public JSON Schema exporter.
function guardedJSON(objectOnly: boolean) {
  return z.unknown().superRefine((value, context) => {
    if (!inspectable(value, objectOnly)) context.addIssue({ code: "custom", message: objectOnly ? "Expected a bounded JSON arguments object." : "Expected bounded, finite, acyclic JSON." });
  });
}
const jsonValue = (guardedJSON(false) as z.ZodType<InspectableJSON, InspectableJSON>).pipe(jsonShape);
const argumentsObject = (guardedJSON(true) as z.ZodType<ToolArguments, ToolArguments>).pipe(z.record(z.string(), jsonShape));

export const ToolCallCardSchema = z.object({
  id: identity,
  title: text(200).default("Tool call"),
  description: z.string().max(2000).optional(),
  tool: identity,
  arguments: argumentsObject.default({}),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  result: jsonValue.optional(),
  errorMessage: text(2000).optional(),
  disabled: z.boolean().default(false),
}).superRefine((data, context) => {
  if (data.errorMessage !== undefined && data.status !== "failed") context.addIssue({ code: "custom", path: ["errorMessage"], message: "Failure detail requires failed status." });
});
export type ToolCallCardData = z.input<typeof ToolCallCardSchema>;

export const RetryableErrorStateSchema = z.object({
  id: identity,
  title: text(200).default("Tool request failed"),
  message: text(2000),
  tool: identity,
  arguments: argumentsObject.default({}),
  retryable: z.boolean().default(false),
  attempt: z.number().int().min(1).max(1000).default(1),
  retryLabel: text(120).default("Retry tool"),
  disabled: z.boolean().default(false),
});
export type RetryableErrorStateData = z.input<typeof RetryableErrorStateSchema>;

export const AuthRequiredCardSchema = z.object({
  id: identity,
  title: text(200).default("Authentication required"),
  service: identity,
  description: z.string().max(2000).optional(),
  scopes: z.array(z.object({ id: identity, label: text(200) })).max(20).default([]),
  status: z.enum(["required", "pending", "unavailable"]).default("required"),
  actionLabel: text(120).default("Request access"),
  disabled: z.boolean().default(false),
}).superRefine((data, context) => {
  const seen = new Set<string>();
  data.scopes.forEach((scope, index) => {
    if (seen.has(scope.id)) context.addIssue({ code: "custom", path: ["scopes", index, "id"], message: "Permission identifiers must be distinct." });
    seen.add(scope.id);
  });
});
export type AuthRequiredCardData = z.input<typeof AuthRequiredCardSchema>;

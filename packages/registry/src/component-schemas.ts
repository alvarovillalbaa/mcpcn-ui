import { GenericComponentSchema, schemaBySlug, toJSONSchema } from "@mcpcn/schemas";
import { catalog } from "./catalog.js";

/** Public component-data contract, distinct from tool envelopes and host permissions. */
export function componentDataSchema(slug: string): Record<string, unknown> | undefined {
  const item = catalog.find(component => component.slug === slug);
  if (!item || item.category === "primitive") return undefined;
  const named = Object.hasOwn(schemaBySlug, slug) ? schemaBySlug[slug as keyof typeof schemaBySlug] : undefined;
  if (!named && item.specialized) throw new Error("registry_component_schema_missing");
  // Export the actual schema in its default output mode. Unsupported schema
  // conversion must throw; a permissive placeholder would misstate validation.
  return JSON.parse(JSON.stringify(toJSONSchema(named ?? GenericComponentSchema))) as Record<string, unknown>;
}

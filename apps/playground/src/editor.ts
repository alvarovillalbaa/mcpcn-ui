import type { MCPCNPayload } from "@mcpcn/core";
import { validateFixture } from "./fixtures.js";
import type { PlaygroundResult } from "./host-session.js";

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function boundedJSON(value: unknown) {
  const pending: Array<[unknown, number]> = [[value, 0]];
  let nodes = 0;
  while (pending.length) {
    const [item, depth] = pending.pop()!;
    if (++nodes > 4000 || depth > 16) return false;
    if (item === null || typeof item === "boolean") continue;
    if (typeof item === "number") { if (!Number.isFinite(item)) return false; continue; }
    if (typeof item === "string") { if (item.length > 8192) return false; continue; }
    if (!record(item) && !Array.isArray(item)) return false;
    const entries = Object.entries(item);
    if (entries.length > 100 || entries.some(([key]) => key.length > 128)) return false;
    for (const [, child] of entries) pending.push([child, depth + 1]);
  }
  return true;
}
export function fixtureResult(payload: MCPCNPayload<string, unknown>): PlaygroundResult {
  return { structuredContent: { ...payload }, content: [{ type: "text", text: "Authored MCPCN playground fixture." }],
    _meta: { privateFixtureNote: "LOCAL_UI_ONLY_CANARY" } };
}
export function parseInput(text: string): Record<string, unknown> {
  if (new TextEncoder().encode(text).length > 16384) throw new Error("Tool input exceeds the 16 KiB editor limit.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("Tool input must be valid JSON."); }
  if (!record(value)) throw new Error("Tool input must be a JSON object.");
  if (!boundedJSON(value)) throw new Error("Tool input exceeds the supported JSON structure.");
  return value;
}
export function parseResult(text: string): PlaygroundResult {
  if (new TextEncoder().encode(text).length > 65536) throw new Error("Tool result exceeds the 64 KiB editor limit.");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("Tool result must be valid JSON."); }
  if (!record(raw)) throw new Error("Tool result must be a JSON object.");
  if (!boundedJSON(raw)) throw new Error("Tool result exceeds the supported JSON structure.");
  const payload = validateFixture(Object.hasOwn(raw, "structuredContent") ? raw.structuredContent : raw);
  if (!payload.success) throw new Error(`Invalid component payload: ${payload.issues.slice(0, 3).join(", ")}`);
  if (Object.hasOwn(raw, "_meta") && !record(raw._meta)) throw new Error("UI-only metadata must be a JSON object.");
  if (Object.hasOwn(raw, "isError") && typeof raw.isError !== "boolean") throw new Error("isError must be a boolean.");
  const content = Object.hasOwn(raw, "content") ? raw.content : [];
  if (!Array.isArray(content) || content.length > 20 || content.some(block => !record(block) || block.type !== "text" || typeof block.text !== "string" || block.text.length > 4096)) {
    throw new Error("This fixture editor supports up to twenty text content blocks.");
  }
  return { structuredContent: { ...payload.data }, content: content.map(block => ({ type: "text" as const, text: (block as { text: string }).text })),
    ...(record(raw._meta) ? { _meta: raw._meta } : {}), ...(raw.isError === true ? { isError: true } : {}) };
}

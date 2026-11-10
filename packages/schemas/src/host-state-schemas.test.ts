import { describe, expect, it } from "vitest";
import { schemaBySlug, GenericComponentSchema, toJSONSchema } from "./index.js";
import { hostStateCases } from "../../../tests/fixtures/host-states.js";

describe("T2 reported host state schemas", () => {
  it.each(hostStateCases)("HS-S01 $slug preserves the exact reported DTO", row => {
    const schema = schemaBySlug[row.slug]; expect(schema).not.toBe(GenericComponentSchema);
    expect(schema.parse(row.data)).toEqual(row.data);
  });
  it.each(hostStateCases)("HS-S02 $slug refuses the old unbounded generic shape", row => {
    expect(schemaBySlug[row.slug].safeParse({ title: "Generic", status: "ready", actions: [{ label: "Do anything", value: "execute" }] }).success).toBe(false);
  });
  it.each(hostStateCases)("HS-S03 $slug refuses undeclared authority at root and action", row => {
    const schema = schemaBySlug[row.slug];
    for (const patch of [{ token: "private" }, { url: "https://example.invalid" }, { tool: "execute" }, { grant: true }]) expect(schema.safeParse({ ...row.data, ...patch }).success).toBe(false);
    expect(schema.safeParse({ ...row.data, action: { ...row.data.action, url: "https://example.invalid/pay" } }).success).toBe(false);
  });
  it.each(hostStateCases)("HS-S04 $slug exports strict actual public JSON Schema", row => {
    const schema = toJSONSchema(schemaBySlug[row.slug]); expect(schema.type).toBe("object"); expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(expect.arrayContaining(["id", "revision", "title", "message", "state"]));
    expect(JSON.stringify(schema)).toContain(row.data.state);
  });
  it("HS-S05 inspects descriptors without invoking root or nested getters", () => {
    let reads = 0;
    for (const row of hostStateCases) {
      const root = Object.defineProperty({ ...row.data }, "message", { enumerable: true, get() { reads++; return "secret"; } });
      const action = Object.defineProperty({ ...row.data.action }, "label", { enumerable: true, get() { reads++; return "secret"; } });
      expect(schemaBySlug[row.slug].safeParse(root).success).toBe(false);
      expect(schemaBySlug[row.slug].safeParse({ ...row.data, action }).success).toBe(false);
    }
    expect(reads).toBe(0);
  });
  it("HS-S06 rejects foreign prototypes, symbols, cycles and nonenumerable fields", () => {
    for (const row of hostStateCases) {
      const cycle: Record<string, unknown> = { ...row.data }; cycle.self = cycle;
      const foreign = Object.assign(Object.create({ inherited: true }), row.data);
      const hidden = Object.defineProperty({ ...row.data }, "hidden", { value: true });
      for (const value of [cycle, foreign, hidden, { ...row.data, [Symbol("hidden")]: true }]) expect(schemaBySlug[row.slug].safeParse(value).success).toBe(false);
    }
  });
  it("HS-S07 refuses invalid identity, blank labels, oversized or control text", () => {
    for (const row of hostStateCases) for (const patch of [{ id: "bad identity" }, { revision: "" }, { title: " " }, { message: "\u0000private" }, { message: "x".repeat(4001) }, { description: "x".repeat(4001) }]) expect(schemaBySlug[row.slug].safeParse({ ...row.data, ...patch }).success).toBe(false);
  });
  it("HS-S08 preserves zero versus absence without inserting defaults", () => {
    const waiting = hostStateCases[3].data, offline = hostStateCases[4].data;
    expect(schemaBySlug["loading-bridge-state"].parse(waiting).elapsedMs).toBe(0);
    const { elapsedMs: _elapsed, progress: _progress, ...noTime } = waiting;
    expect(schemaBySlug["loading-bridge-state"].parse(noTime)).not.toHaveProperty("elapsedMs");
    expect(schemaBySlug["offline-state"].parse(offline).unsentChanges).toBe(0);
    const { unsentChanges: _unsent, ...noCount } = offline;
    expect(schemaBySlug["offline-state"].parse(noCount)).not.toHaveProperty("unsentChanges");
  });
  it("HS-S09 rejects invalid or contradictory work and numeric data", () => {
    const row = hostStateCases[3].data;
    for (const progress of [{ completed: -1, total: 3 }, { completed: 4, total: 3 }, { completed: 0, total: 0 }, { completed: 0.5, total: 3 }]) expect(schemaBySlug["loading-bridge-state"].safeParse({ ...row, progress }).success).toBe(false);
    for (const elapsedMs of [NaN, Infinity, -1, 0.5]) expect(schemaBySlug["loading-bridge-state"].safeParse({ ...row, elapsedMs }).success).toBe(false);
  });
  it("HS-S10 preserves complete ordered capabilities and rejects duplicates, holes and excess", () => {
    const row = hostStateCases[1].data, schema = schemaBySlug["unsupported-host-notice"];
    expect(schema.parse(row).requirements.map(item => item.id)).toEqual(["first", "second"]);
    for (const requirements of [[], [row.requirements[0], row.requirements[0]], new Array(2), Array.from({ length: 21 }, (_, index) => ({ ...row.requirements[0], id: `id-${index}` }))]) expect(schema.safeParse({ ...row, requirements }).success).toBe(false);
  });
  it("HS-S11 requires a coherent reported expiry and valid timestamps", () => {
    const row = hostStateCases[6].data, schema = schemaBySlug["expired-session-state"];
    expect(schema.safeParse({ ...row, expiredAt: "2026-11-11T00:00:00Z" }).success).toBe(false);
    for (const expiredAt of ["yesterday", "2026-14-01T00:00:00Z", "2026-11-09"]) expect(schema.safeParse({ ...row, expiredAt }).success).toBe(false);
    expect(schema.safeParse({ ...row, expiredAt: "2026-11-10T01:00:00+01:00" }).success).toBe(true);
  });
  it("HS-S12 keeps scope lists bounded and action absence or unavailability explicit", () => {
    const row = hostStateCases[5].data;
    expect(schemaBySlug["permission-denied-state"].safeParse({ ...row, scopes: [row.scopes[0], row.scopes[0]] }).success).toBe(false);
    for (const item of hostStateCases) {
      const { action: _action, ...without } = item.data;
      expect(schemaBySlug[item.slug].parse(without)).not.toHaveProperty("action");
      expect(schemaBySlug[item.slug].parse({ ...item.data, action: { ...item.data.action, available: false } }).action?.available).toBe(false);
    }
  });
});

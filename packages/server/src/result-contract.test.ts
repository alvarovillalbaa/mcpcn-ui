// T2 authored JSON only. No provider, host, account, database or external action.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createStructuredResult, createApprovalResult, createToolProgressResult, validateToolResult } from "./index.js";

const schema = z.object({ count: z.number().int(), enabled: z.boolean(), absent: z.null() }).strict();
const data = () => ({ count: 0, enabled: false, absent: null });
const raw = (...supplied: [] | [unknown]) => ({ structuredContent: { kind: "mcpcn/authored-report", version: 1, data: supplied.length ? supplied[0] : data() }, content: [] as Array<{ type: string; text: string }> });
const invalid = { success: false, error: { code: "tool-result-invalid" } };
const check = (candidate: unknown) => validateToolResult("authored-report", schema, candidate);

describe("T2 server result contract", () => {
  it("SV-R01 preserves complete public/private JSON and zero/false/null/stateVersion0", async () => {
    const result = createStructuredResult("authored-report", data(), { stateVersion: 0, meta: { private: { marker: "PRIVATE_END" } } });
    expect(result.structuredContent).toEqual({ kind: "mcpcn/authored-report", version: 1, data: data(), stateVersion: 0 });
    expect(result._meta).toEqual({ private: { marker: "PRIVATE_END" } }); expect((await check(result)).success).toBe(true);
    expect(result.content[0]?.text).not.toContain("PRIVATE_END");
  });
  it("SV-R02 returns owned data and metadata snapshots independent of caller mutation", () => {
    const value = data(), meta = { private: { marker: "BEFORE" } }, result = createStructuredResult("authored-report", value, { meta });
    value.count = 8; meta.private.marker = "AFTER";
    expect(result.structuredContent.data.count).toBe(0); expect(result._meta).toEqual({ private: { marker: "BEFORE" } });
  });
  it("SV-R03 retains approval/progress helper component identities", () => {
    expect(createApprovalResult({ title: "Review" }).structuredContent.kind).toBe("mcpcn/approval-card");
    expect(createToolProgressResult({ title: "Progress" }).structuredContent.kind).toBe("mcpcn/tool-progress-timeline");
  });
  it("SV-R04 distinguishes empty supplied text from omitted options", () => {
    expect(createStructuredResult("authored-report", data(), { text: "" }).content).toEqual([{ type: "text", text: "" }]);
    const result = createStructuredResult("authored-report", data()); expect(result).not.toHaveProperty("_meta"); expect(result.structuredContent).not.toHaveProperty("stateVersion");
    expect(result.content).toEqual([{ type: "text", text: "Rendered authored-report for review." }]);
  });
  it("SV-R05 refuses malformed component identifiers before constructing a result", () => {
    for (const kind of ["", "Uppercase", "bad/name", "bad name", "x".repeat(129)]) expect(() => createStructuredResult(kind, data())).toThrow("mcpcn_server_payload_invalid");
  });
  it("SV-R06 refuses unknown options and invalid state versions without diagnostics", () => {
    for (const options of [{ stateVersion: -1 }, { stateVersion: 0.5 }, { stateVersion: Infinity }, { stateVersion: Number.MAX_SAFE_INTEGER + 1 }, { extra: "PRIVATE_DIAGNOSTIC" }, { text: 7 }]) {
      expect(() => createStructuredResult("authored-report", data(), options as never)).toThrow("mcpcn_server_payload_invalid");
    }
  });
  it("SV-R07 refuses undefined, nonfinite, callable and cyclic builder values", () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    for (const value of [undefined, Infinity, NaN, () => 1, 1n, cycle]) expect(() => createStructuredResult("authored-report", value)).toThrow("mcpcn_server_payload_invalid");
  });
  it("SV-R08 never invokes data or options accessors", () => {
    let reads = 0;
    for (const options of [false, true]) {
      const getter = {}; Object.defineProperty(getter, options ? "text" : "count", { enumerable: true, get() { reads++; return "PRIVATE_GETTER"; } });
      expect(() => options ? createStructuredResult("authored-report", data(), getter) : createStructuredResult("authored-report", getter)).toThrow("mcpcn_server_payload_invalid");
    }
    expect(reads).toBe(0);
  });
  it("SV-R09 returns parsed schema defaults without changing the candidate", async () => {
    const candidate = raw({}), result = await validateToolResult("authored-report", z.object({ count: z.number().default(0) }).strict(), candidate);
    expect(result).toMatchObject({ success: true, data: { structuredContent: { data: { count: 0 } } } }); expect(candidate.structuredContent.data).toEqual({});
  });
  it("SV-R10 requires the exact kind, version and safe whole state version", async () => {
    for (const patch of [{ kind: "mcpcn/other" }, { version: 2 }, { stateVersion: -1 }, { stateVersion: 0.5 }]) expect(await check({ ...raw(), structuredContent: { ...raw().structuredContent, ...patch } })).toEqual(invalid);
  });
  it("SV-R11 refuses missing and foreign envelope/result fields", async () => {
    for (const value of [{ content: [] }, { ...raw(), extra: true }, { ...raw(), structuredContent: { ...raw().structuredContent, extra: true } }, { ...raw(), structuredContent: data() }]) expect(await check(value)).toEqual(invalid);
    const missing = { structuredContent: { kind: "mcpcn/authored-report", version: 1 }, content: [] };
    for (const optional of [z.unknown(), z.object({ count: z.number() }).default({ count: 0 })]) expect(await validateToolResult("authored-report", optional, missing)).toEqual(invalid);
  });
  it("SV-R12 returns only a generic code for schema failure", async () => {
    const privateSchema = z.string().refine(() => false, "PRIVATE_SCHEMA_DIAGNOSTIC");
    const result = await validateToolResult("authored-report", privateSchema, raw("PRIVATE_INPUT"));
    expect(result).toEqual(invalid); expect(JSON.stringify(result)).not.toMatch(/PRIVATE_/);
  });
  it("SV-R13 supports asynchronous pure output refinements", async () => {
    let validations = 0;
    const asyncSchema = schema.refine(async value => { validations++; return value.count === 0; });
    expect((await validateToolResult("authored-report", asyncSchema, raw())).success).toBe(true); expect(validations).toBe(1);
  });
  it("SV-R14 sanitizes thrown asynchronous schema errors", async () => {
    const asyncSchema = schema.refine(async () => { throw new Error("PRIVATE_ASYNC_DIAGNOSTIC"); });
    expect(await validateToolResult("authored-report", asyncSchema, raw())).toEqual(invalid);
  });
  it("SV-R15 refuses malformed/nontext content and more than20blocks", async () => {
    for (const content of [[{ type: "image", data: "PRIVATE_IMAGE" }], [{ type: "text", text: 3 }], [{ type: "text", text: "Text", extra: true }], Array.from({ length: 21 }, () => ({ type: "text", text: "Text" }))]) expect(await check({ ...raw(), content })).toEqual(invalid);
  });
  it("SV-R16 preserves a deliberate explicit error and metadata without structured data", async () => {
    const error = { isError: true as const, content: [{ type: "text", text: "Authored denial" }], _meta: { "example/challenge": "Authored metadata only" } };
    expect(await check(error)).toEqual({ success: true, data: error });
  });
  it("SV-R17 refuses stale structured data or blank text on explicit errors", async () => {
    for (const value of [{ ...raw(), isError: true }, { isError: true, content: [] }, { isError: true, content: [{ type: "text", text: " " }] }]) expect(await check(value)).toEqual(invalid);
  });
  it("SV-R18 preserves an explicitly false isError marker on valid output", async () => {
    expect(await check({ ...raw(), isError: false })).toEqual({ success: true, data: { ...raw(), isError: false } });
  });
  it("SV-R19 refuses root/nested handler result getters without reads", async () => {
    let reads = 0;
    for (const nested of [false, true]) {
      const candidate = raw(), target = nested ? candidate.structuredContent : candidate;
      Object.defineProperty(target, nested ? "data" : "structuredContent", { enumerable: true, get() { reads++; return data(); } });
      expect(await check(candidate)).toEqual(invalid);
    }
    expect(reads).toBe(0);
  });
  it("SV-R20 refuses symbol and nonenumerable properties", async () => {
    for (const key of [Symbol("private"), "private"]) {
      const candidate = raw(); Object.defineProperty(candidate, key, { value: "HIDDEN" }); expect(await check(candidate)).toEqual(invalid);
    }
  });
  it("SV-R21 refuses metadata and data cycles", async () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(await check({ ...raw(), _meta: cycle })).toEqual(invalid); expect(await check(raw(cycle))).toEqual(invalid);
  });
  it("SV-R22 refuses dates, maps, classes and unsupported scalar values", async () => {
    class Foreign { count = 0; }
    for (const value of [new Date(), new Map(), new Foreign(), undefined, NaN, Infinity, 1n, () => true]) expect(await validateToolResult("authored-report", z.unknown(), raw(value))).toEqual(invalid);
  });
  it("SV-R23 refuses sparse and foreign-prototype arrays", async () => {
    const sparse = [0, 1]; delete sparse[0];
    class ForeignArray extends Array<number> {}
    for (const value of [sparse, new ForeignArray(0, 1)]) expect(await validateToolResult("authored-report", z.unknown(), raw(value))).toEqual(invalid);
  });
  it("SV-R24 refuses prototype keys without invoking them", async () => {
    for (const key of ["__proto__", "prototype", "constructor"]) {
      const value = Object.create(null); Object.defineProperty(value, key, { value: "Authored", enumerable: true });
      expect(await validateToolResult("authored-report", z.unknown(), raw(value))).toEqual(invalid);
    }
  });
  it("SV-R25 bounds depth, node count and member counts", async () => {
    let deep: unknown = 0; for (let i = 0; i < 21; i++) deep = { next: deep };
    const nodes = Array.from({ length: 200 }, () => Array.from({ length: 1000 }, () => 0));
    for (const value of [deep, nodes, Array.from({ length: 1001 }, () => 0)]) expect(await validateToolResult("authored-report", z.unknown(), raw(value))).toEqual(invalid);
  });
  it("SV-R26 accepts exact4MiB and refuses plus-one without truncation", async () => {
    const maximum = 4 * 1024 * 1024, candidate = raw(["", "", ""]), remaining = maximum - new TextEncoder().encode(JSON.stringify(candidate)).byteLength;
    const sizes = [Math.floor(remaining / 3), Math.floor(remaining / 3), remaining - 2 * Math.floor(remaining / 3)];
    candidate.structuredContent.data = sizes.map(size => "x".repeat(size));
    expect(new TextEncoder().encode(JSON.stringify(candidate)).byteLength).toBe(maximum);
    expect((await validateToolResult("authored-report", z.unknown(), candidate)).success).toBe(true);
    (candidate.structuredContent.data as string[])[2] += "x"; expect(await validateToolResult("authored-report", z.unknown(), candidate)).toEqual(invalid);
  });
  it("SV-R27 applies serialized UTF-8 string and text-content limits", async () => {
    expect(await validateToolResult("authored-report", z.unknown(), raw("界".repeat(700000)))).toEqual(invalid);
    expect(await check({ ...raw(), content: [{ type: "text", text: "x".repeat(65537) }] })).toEqual(invalid);
  });
  it("SV-R28 bounds complete metadata independently of the data schema", async () => {
    const meta = { values: Array.from({ length: 4 }, () => "x".repeat(1100000)) }; expect(await check({ ...raw(), _meta: meta })).toEqual(invalid);
  });
  it("SV-R29 accepts null-prototype records as independent JSON snapshots", async () => {
    const value = Object.assign(Object.create(null), data()); const result = await check(raw(value)); expect(result).toEqual({ success: true, data: raw(data()) });
    if (result.success && "structuredContent" in result.data) expect(Object.getPrototypeOf(result.data.structuredContent.data)).toBe(Object.prototype);
  });
  it("SV-R30 never interprets metadata declarations as automatic redaction", () => {
    const result = createStructuredResult("authored-report", { deliberatelyPublic: "AUTHORED_PUBLIC_MARKER" }, { meta: { privateOnly: ["deliberatelyPublic"] } });
    expect(result.structuredContent.data.deliberatelyPublic).toBe("AUTHORED_PUBLIC_MARKER"); expect(result.content[0]?.text).not.toContain("AUTHORED_PUBLIC_MARKER");
  });
});

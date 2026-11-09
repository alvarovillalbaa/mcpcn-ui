import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SourceEvidencePanelSchema } from "./review-schemas.js";
import { stableReviewKey } from "./file-review-schemas.js";
import {
  EvidenceContentSchema, EvidenceDrawerSchema, EvidenceSourceSchema, SourceListSchema,
  type EvidenceContent, type EvidenceSource,
} from "./source-evidence-schemas.js";

const common = { id: "root-1", revision: "root-revision-1", title: "Authored supplied evidence" };
const source = (patch: Partial<EvidenceSource> = {}): EvidenceSource => ({ id: "source-1", revision: "source-revision-1", label: "Authored source", ...patch });
const list = (sources: EvidenceSource[] = [source()]) => ({ ...common, state: "ready" as const, sources });
const drawer = (content: EvidenceContent = { type: "text", text: "Complete authored evidence." }) => ({ ...common, state: "ready" as const, source: source(), content });
const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

function listAtBudget() {
  const rows = Array.from({ length: 100 }, (_, index) => ({ id: `source-${index}`, revision: "one", label: "Source", excerpt: "x", supports: Array.from({ length: 20 }, () => "x") }));
  const value = list(rows);
  let remaining = 2097152 - byteLength(SourceListSchema.parse(value));
  const fill = (maximum: number) => {
    const extra = Math.min(remaining, maximum * 2 - 1), bytes = extra + 1;
    remaining -= extra;
    return "é".repeat(Math.floor(bytes / 2)) + (bytes % 2 ? "x" : "");
  };
  for (const row of rows) {
    row.excerpt = fill(5000);
    row.supports = row.supports.map(() => fill(500));
  }
  if (remaining !== 0) throw new Error("fixture_budget_unfilled");
  return { value, rows };
}

describe("source evidence schemas", () => {
  it("accepts supplied source metadata and defaults only its supports list", () => {
    expect(EvidenceSourceSchema.parse(source())).toEqual({ ...source(), supports: [] });
    const supplied = source({ url: "https://example.test/evidence?q=authored#section", excerpt: "  Complete excerpt.\n", supports: ["First supplied claim", "Second supplied claim"] });
    expect(EvidenceSourceSchema.parse(supplied)).toEqual(supplied);
  });

  it("requires stable trimmed bounded source identity and revision", () => {
    expect(EvidenceSourceSchema.safeParse(source({ id: "x".repeat(128), revision: "r".repeat(128) })).success).toBe(true);
    for (const value of ["", " ", " source", "source ", "bad\nidentity", "bad\u007fidentity", "x".repeat(129)]) {
      expect(EvidenceSourceSchema.safeParse(source({ id: value })).success).toBe(false);
      expect(EvidenceSourceSchema.safeParse(source({ revision: value })).success).toBe(false);
    }
    const { revision: _revision, ...missing } = source();
    expect(EvidenceSourceSchema.safeParse(missing).success).toBe(false);
  });

  it("retains the existing absolute credential-free HTTP URL boundary", () => {
    for (const url of ["https://example.test/source", "http://example.test/source"]) expect(EvidenceSourceSchema.safeParse(source({ url })).success).toBe(true);
    for (const url of ["javascript:alert(1)", "data:text/plain,authored", "file:///authored", "/relative", "//example.test/source", "https://user:pass@example.test", " https://example.test", "https://example.test/a b", "https://example.test/\n", "https://example.test/" + "x".repeat(2048)]) {
      expect(EvidenceSourceSchema.safeParse(source({ url })).success).toBe(false);
    }
  });

  it("preserves visible labels and full excerpts at their inherited limits", () => {
    expect(EvidenceSourceSchema.parse(source({ label: "l".repeat(500), excerpt: "é".repeat(5000) })).excerpt).toHaveLength(5000);
    for (const label of ["", "  ", "bad\u0000label", "x".repeat(501)]) expect(EvidenceSourceSchema.safeParse(source({ label })).success).toBe(false);
    for (const excerpt of ["", "\n\t ", "bad\u0001text", "x".repeat(5001)]) expect(EvidenceSourceSchema.safeParse(source({ excerpt })).success).toBe(false);
  });

  it("bounds nonblank supplied claims without deduplicating their text", () => {
    const supports = Array.from({ length: 20 }, () => "Same authored claim.");
    expect(EvidenceSourceSchema.parse(source({ supports })).supports).toEqual(supports);
    expect(EvidenceSourceSchema.safeParse(source({ supports: [...supports, "Extra"] })).success).toBe(false);
    for (const text of ["", " ", "bad\u007fclaim", "x".repeat(501)]) expect(EvidenceSourceSchema.safeParse(source({ supports: [text] })).success).toBe(false);
  });

  it("refuses foreign source properties instead of silently dropping them", () => {
    for (const extra of [{ verified: true }, { content: "Foreign body" }, { fetchUrl: "https://example.test" }, { onAction: () => {} }]) {
      expect(EvidenceSourceSchema.safeParse({ ...source(), ...extra }).success).toBe(false);
    }
  });

  it("preserves full text whitespace empty strings and escaped markup", () => {
    for (const text of ["", " \n\t", "<script>authored()</script> & quoted \"text\"\nLast line."]) {
      expect(EvidenceContentSchema.parse({ type: "text", text })).toEqual({ type: "text", text });
    }
  });

  it("accepts the complete text limit and refuses a larger representation", () => {
    const text = "é".repeat(65536);
    expect(EvidenceContentSchema.parse({ type: "text", text })).toEqual({ type: "text", text });
    expect(EvidenceContentSchema.safeParse({ type: "text", text: text + "x" }).success).toBe(false);
  });

  it("preserves all guarded JSON primitive values without truthiness loss", () => {
    for (const value of [null, false, true, 0, -0, 12.5, "", "Authored text"]) {
      expect(EvidenceContentSchema.parse({ type: "json", value })).toEqual({ type: "json", value });
    }
  });

  it("returns owned nested JSON data while retaining keys arrays and order", () => {
    const value = { first: [0, false, null, ""], second: { complete: "Last authored value" } };
    const parsed = EvidenceContentSchema.parse({ type: "json", value });
    expect(parsed).toEqual({ type: "json", value });
    if (parsed.type !== "json" || parsed.value === null || Array.isArray(parsed.value) || typeof parsed.value !== "object") throw new Error("fixture_object_required");
    expect(parsed.value).not.toBe(value);
    expect(parsed.value.first).not.toBe(value.first);
  });

  it("refuses cyclic JSON while accepting repeated acyclic references", () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(EvidenceContentSchema.safeParse({ type: "json", value: cycle }).success).toBe(false);
    const shared = { text: "Authored shared value" };
    expect(EvidenceContentSchema.parse({ type: "json", value: [shared, shared] })).toEqual({ type: "json", value: [shared, shared] });
  });

  it("refuses JSON omissions nonfinite values sparse arrays and exotic objects", () => {
    const symbol = { [Symbol("authored")]: "Private" }, sparse = new Array(2);
    for (const value of [undefined, NaN, Infinity, -Infinity, 1n, () => {}, new Date(0), new Map(), sparse, [undefined], { bad: undefined }, symbol, JSON.parse('{"__proto__":true}')]) {
      expect(EvidenceContentSchema.safeParse({ type: "json", value }).success).toBe(false);
    }
  });

  it("keeps the existing JSON recursion count string and byte guards unchanged", () => {
    let deep: unknown = null;
    for (let depth = 0; depth < 10; depth++) deep = [deep];
    const wide = Object.fromEntries(Array.from({ length: 201 }, (_, index) => [`key${index}`, index]));
    for (const value of [deep, wide, "x".repeat(10001), Array.from({ length: 200 }, () => "x".repeat(400))]) {
      expect(EvidenceContentSchema.safeParse({ type: "json", value }).success).toBe(false);
    }
    expect(EvidenceContentSchema.safeParse({ type: "json", value: "x".repeat(10000) }).success).toBe(true);
  });

  it("accepts only strict text and JSON content variants", () => {
    for (const content of [{ type: "html", text: "Authored" }, { type: "text", text: "Authored", value: null }, { type: "json", value: null, text: "Foreign" }, { type: "json" }, { type: "text" }]) {
      expect(EvidenceContentSchema.safeParse(content).success).toBe(false);
    }
  });

  it("parses a ready source list without fabricating controlled selection", () => {
    const parsed = SourceListSchema.parse(list());
    expect(parsed.state).toBe("ready");
    if (parsed.state !== "ready") throw new Error("fixture_ready_required");
    expect(parsed.sources[0]?.supports).toEqual([]);
    expect(Object.hasOwn(parsed, "selectedSourceId")).toBe(false);
  });

  it("allows an empty ready list and the full one-hundred-source boundary", () => {
    expect(SourceListSchema.safeParse(list([])).success).toBe(true);
    const sources = Array.from({ length: 100 }, (_, index) => source({ id: `source-${index}` }));
    expect(SourceListSchema.safeParse(list(sources)).success).toBe(true);
    expect(SourceListSchema.safeParse(list([...sources, source({ id: "extra" })])).success).toBe(false);
  });

  it("distinguishes omitted selection explicit null and a current selected source", () => {
    const omitted = SourceListSchema.parse(list()), none = SourceListSchema.parse({ ...list(), selectedSourceId: null });
    expect(Object.hasOwn(omitted, "selectedSourceId")).toBe(false);
    expect(none).toHaveProperty("selectedSourceId", null);
    expect(SourceListSchema.parse({ ...list(), selectedSourceId: "source-1" })).toHaveProperty("selectedSourceId", "source-1");
  });

  it("refuses duplicate source IDs even when their revisions differ", () => {
    expect(SourceListSchema.safeParse(list([source(), source({ revision: "new-revision" })])).success).toBe(false);
    expect(SourceListSchema.safeParse(list([source(), source({ id: "source-2", revision: "new-revision" })])).success).toBe(true);
  });

  it("refuses foreign blank or malformed selected source identities", () => {
    for (const selectedSourceId of ["foreign", "", " source-1", "source-1\n", 1, false]) {
      expect(SourceListSchema.safeParse({ ...list(), selectedSourceId }).success).toBe(false);
    }
  });

  it("forbids stale rows and selection in every nonready list state", () => {
    for (const state of ["loading", "empty", "error"] as const) {
      const value = { ...common, state, message: "Authored state detail" };
      expect(SourceListSchema.safeParse(value).success).toBe(true);
      for (const extra of [{ sources: [] }, { sources: [source()] }, { selectedSourceId: null }, { selectedSourceId: "source-1" }]) {
        expect(SourceListSchema.safeParse({ ...value, ...extra }).success).toBe(false);
      }
    }
  });

  it("requires a visible list error while keeping other messages optional and bounded", () => {
    for (const state of ["loading", "empty"] as const) expect(SourceListSchema.safeParse({ ...common, state }).success).toBe(true);
    for (const message of [undefined, "", " ", "bad\u0001message", "x".repeat(2001)]) {
      expect(SourceListSchema.safeParse({ ...common, state: "error", message }).success).toBe(false);
    }
    expect(SourceListSchema.safeParse({ ...list(), message: "x".repeat(2000) }).success).toBe(true);
    expect(SourceListSchema.safeParse({ ...list(), message: "x".repeat(2001) }).success).toBe(false);
  });

  it("enforces root identities visible titles and plain description limits", () => {
    expect(SourceListSchema.safeParse({ ...list(), id: "i".repeat(128), revision: "r".repeat(128), title: "t".repeat(240), description: "d".repeat(2000) }).success).toBe(true);
    for (const patch of [{ id: "" }, { id: "bad\nidentity" }, { revision: " " }, { revision: "r".repeat(129) }, { title: " " }, { title: "t".repeat(241) }, { description: "d".repeat(2001) }, { description: "bad\u0000description" }]) {
      expect(SourceListSchema.safeParse({ ...list(), ...patch }).success).toBe(false);
    }
  });

  it("rejects generic alias and UI callback properties in strict list data", () => {
    for (const extra of [{ items: [] }, { actions: [] }, { open: true }, { onAction: () => {} }, { busy: true }, { error: "UI only" }, { className: "UI only" }]) {
      expect(SourceListSchema.safeParse({ ...list(), ...extra }).success).toBe(false);
    }
  });

  it("requires both current descriptor and complete content for a ready drawer", () => {
    expect(EvidenceDrawerSchema.parse(drawer())).toHaveProperty("content.text", "Complete authored evidence.");
    expect(EvidenceDrawerSchema.parse(drawer({ type: "json", value: false }))).toHaveProperty("content.value", false);
    const { source: _source, ...withoutSource } = drawer();
    const { content: _content, ...withoutContent } = drawer();
    expect(EvidenceDrawerSchema.safeParse(withoutSource).success).toBe(false);
    expect(EvidenceDrawerSchema.safeParse(withoutContent).success).toBe(false);
  });

  it("preserves absent false and true external opening requests without defaults", () => {
    expect(Object.hasOwn(EvidenceDrawerSchema.parse(drawer()), "open")).toBe(false);
    expect(EvidenceDrawerSchema.parse({ ...drawer(), open: false })).toHaveProperty("open", false);
    expect(EvidenceDrawerSchema.parse({ ...drawer(), open: true })).toHaveProperty("open", true);
    expect(EvidenceDrawerSchema.parse({ ...common, state: "loading", open: true })).toHaveProperty("open", true);
  });

  it("refuses nonboolean opening requests instead of coercing presentation state", () => {
    for (const open of [null, "true", "false", 0, 1, [], {}]) expect(EvidenceDrawerSchema.safeParse({ ...drawer(), open }).success).toBe(false);
  });

  it("allows intended source metadata in loading and error but refuses stale content", () => {
    for (const state of ["loading", "error"] as const) {
      const value = { ...common, state, message: "Authored detail" };
      expect(EvidenceDrawerSchema.safeParse(value).success).toBe(true);
      expect(EvidenceDrawerSchema.safeParse({ ...value, source: source() }).success).toBe(true);
      expect(EvidenceDrawerSchema.safeParse({ ...value, source: source(), content: { type: "text", text: "Stale" } }).success).toBe(false);
    }
  });

  it("forbids source and content in an empty drawer", () => {
    expect(EvidenceDrawerSchema.safeParse({ ...common, state: "empty", open: true }).success).toBe(true);
    for (const extra of [{ source: source() }, { source: null }, { content: { type: "text", text: "Stale" } }]) {
      expect(EvidenceDrawerSchema.safeParse({ ...common, state: "empty", ...extra }).success).toBe(false);
    }
  });

  it("requires a visible drawer error and rejects oversized state messages", () => {
    for (const message of [undefined, "", "\n ", "x".repeat(2001)]) expect(EvidenceDrawerSchema.safeParse({ ...common, state: "error", message }).success).toBe(false);
    expect(EvidenceDrawerSchema.safeParse({ ...common, state: "error", message: "Supplied evidence unavailable." }).success).toBe(true);
    expect(EvidenceDrawerSchema.safeParse({ ...common, state: "loading", message: "x".repeat(2001) }).success).toBe(false);
  });

  it("keeps drawer roots strict and applies source metadata validation in all eligible states", () => {
    for (const extra of [{ sources: [source()] }, { selectedSourceId: "source-1" }, { onAction: () => {} }, { busy: true }, { verified: true }]) {
      expect(EvidenceDrawerSchema.safeParse({ ...drawer(), ...extra }).success).toBe(false);
    }
    for (const state of ["ready", "loading", "error"] as const) {
      const value = state === "ready" ? drawer() : { ...common, state, message: "Authored detail" };
      expect(EvidenceDrawerSchema.safeParse({ ...value, source: source({ url: "javascript:authored" }) }).success).toBe(false);
    }
  });

  it("accepts a complete source list exactly at the collective UTF8 budget", () => {
    const { value } = listAtBudget();
    const parsed = SourceListSchema.parse(value);
    expect(byteLength(parsed)).toBe(2097152);
    expect(SourceListSchema.safeParse(value).success).toBe(true);
  });

  it("refuses one additional UTF8 byte while every individual source field remains valid", () => {
    const { value, rows } = listAtBudget();
    const row = rows.find(item => item.supports.includes("x"));
    if (!row) throw new Error("fixture_spare_support_required");
    row.supports[row.supports.indexOf("x")] = "é";
    expect(EvidenceSourceSchema.safeParse(row).success).toBe(true);
    expect(SourceListSchema.safeParse(value).success).toBe(false);
  });

  it("does not serialize rejected JSON accessors or toJSON hooks while measuring a drawer", () => {
    let calls = 0;
    const accessor = Object.defineProperty({}, "private", { enumerable: true, get() { calls++; throw new Error("must_not_read"); } });
    const hook = { toJSON() { calls++; throw new Error("must_not_serialize"); } };
    for (const value of [accessor, hook]) expect(() => {
      expect(EvidenceDrawerSchema.safeParse({ ...drawer(), content: { type: "json", value } }).success).toBe(false);
    }).not.toThrow();
    expect(calls).toBe(0);
  });

  it("reuses canonical parsed keys without losing meaningful array or revision changes", () => {
    const left = EvidenceDrawerSchema.parse(drawer({ type: "json", value: { first: 1, second: [0, false] } }));
    const reordered = EvidenceDrawerSchema.parse(drawer({ type: "json", value: { second: [0, false], first: 1 } }));
    expect(stableReviewKey(left)).toBe(stableReviewKey(reordered));
    expect(stableReviewKey(left)).not.toBe(stableReviewKey(EvidenceDrawerSchema.parse(drawer({ type: "json", value: { first: 1, second: [false, 0] } }))));
    expect(stableReviewKey(left)).not.toBe(stableReviewKey({ ...left, source: { ...left.source, revision: "replacement" } }));
  });

  it("leaves the earlier SourceEvidencePanel source contract unchanged", () => {
    const legacy = { reviewId: "legacy-review", title: "Legacy source review", sources: [{ id: "legacy-source", label: "Legacy source", extra: "Previously stripped" }] };
    expect(SourceEvidencePanelSchema.parse(legacy)).toEqual({ reviewId: "legacy-review", title: "Legacy source review", sources: [{ id: "legacy-source", label: "Legacy source", supports: [] }] });
    expect(EvidenceSourceSchema.safeParse(legacy.sources[0]).success).toBe(false);
  });

  it("exports complete strict public state and content JSON schema branches", () => {
    const listSchema = z.toJSONSchema(SourceListSchema), drawerSchema = z.toJSONSchema(EvidenceDrawerSchema);
    for (const schema of [listSchema, drawerSchema]) {
      expect(schema.oneOf).toHaveLength(4);
      expect(schema.oneOf?.map(branch => {
        if (typeof branch !== "object" || branch === null) return undefined;
        const state = branch.properties?.state;
        return typeof state === "object" && state !== null ? state.const : undefined;
      })).toEqual(["ready", "loading", "empty", "error"]);
      expect(schema.oneOf?.every(branch => typeof branch === "object" && branch.additionalProperties === false)).toBe(true);
    }
    expect(JSON.stringify(drawerSchema)).toContain('"const":"text"');
    expect(JSON.stringify(drawerSchema)).toContain('"const":"json"');
    expect(JSON.stringify(drawerSchema)).not.toContain('"open":{"default"');
  });
});

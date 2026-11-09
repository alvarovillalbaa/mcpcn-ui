import { describe, expect, it } from "vitest";
import { schemaBySlug } from "@mcpcn/schemas";
import { controlledData, evidencePreviewKey } from "./component-preview";
import { makeFixture, playgroundItems, validateFixture } from "./fixtures";
import { parseResult } from "./editor";
import { authoredEvidenceDrawer, authoredSourceList } from "./source-evidence-fixtures";

const slugs = ["source-list", "evidence-drawer"] as const;
const intent = { type: "select-source", data: { listId: "sources-1", listRevision: "1", sourceId: "note-a", sourceRevision: "1" } };
const fixture = (data: unknown, kind = "mcpcn/source-list") => ({ kind, version: 1, data });

describe("source evidence playground ownership", () => {
  it("SE-F01 preserves 79 identities with 35 dedicated and 21 generic components", () => {
    expect(playgroundItems).toHaveLength(79);
    expect(playgroundItems.filter(item => item.kind === "specialized")).toHaveLength(41);
    expect(playgroundItems.filter(item => item.kind === "generic-alias")).toHaveLength(15);
    for (const slug of slugs) {
      expect(validateFixture(makeFixture(slug)).success).toBe(true);
      expect(schemaBySlug[slug].safeParse(makeFixture(slug).data).success).toBe(true);
    }
  });
  it("SE-F02 detaches complete compact authored representations inside existing editor bounds", () => {
    for (const slug of slugs) {
      const first = makeFixture(slug), second = makeFixture(slug);
      expect(first).toEqual(second); expect(first.data).not.toBe(second.data);
      expect(new TextEncoder().encode(JSON.stringify(first)).byteLength).toBeLessThan(65536);
      expect(parseResult(JSON.stringify(first)).structuredContent).toEqual(first);
    }
    expect(JSON.stringify(makeFixture("evidence-drawer"))).toContain("END-EVIDENCE");
    expect(Object.hasOwn(makeFixture("evidence-drawer").data as object, "open")).toBe(false);
  });
  it("SE-F03 acknowledges only exact current controlled source identities without echoing text", () => {
    const data = structuredClone(authoredSourceList), before = structuredClone(data);
    expect(controlledData("source-list", data, intent)).toEqual({ selectedSourceId: "note-a" });
    for (const wrong of [{ listId: "foreign" }, { listRevision: "old" }, { sourceId: "missing" }, { sourceRevision: "old" }]) {
      expect(controlledData("source-list", data, { ...intent, data: { ...intent.data, ...wrong } })).toBeUndefined();
    }
    expect(controlledData("source-list", data, { ...intent, type: "inspect-source" })).toBeUndefined();
    expect(data).toEqual(before);
  });
  it("SE-F04 preserves absent local selection and refuses selection in nonready states", () => {
    const { selectedSourceId: _selected, ...local } = authoredSourceList;
    expect(controlledData("source-list", local, intent)).toBeUndefined();
    for (const state of ["loading", "empty", "error"]) expect(controlledData("source-list", { id: "sources-1", revision: "1", state }, intent)).toBeUndefined();
  });
  it("SE-F05 leaves drawer request acknowledgement and dismissal consumer-owned", () => {
    for (const type of ["open-evidence", "close-evidence"]) for (const open of [undefined, false, true]) {
      expect(controlledData("evidence-drawer", { ...authoredEvidenceDrawer, ...(open === undefined ? {} : { open }) }, { type, data: { drawerId: "evidence-1", drawerRevision: "1", sourceId: "note-a", sourceRevision: "1" } })).toBeUndefined();
    }
  });
  it("SE-F06 preserves root preview keys on append and changes them only for real root replacement", () => {
    const current = makeFixture("source-list"), key = evidencePreviewKey(current);
    expect(key).toBeDefined();
    expect(evidencePreviewKey({ ...current, data: { ...authoredSourceList, sources: [...authoredSourceList.sources, { id: "c", revision: "1", label: "New", supports: [] }] } })).toBe(key);
    for (const change of [{ id: "other" }, { revision: "2" }]) expect(evidencePreviewKey({ ...current, data: { ...authoredSourceList, ...change } })).not.toBe(key);
    expect(evidencePreviewKey(makeFixture("approval-card"))).toBeUndefined();
  });
  it("SE-F07 permits strict safe evidence URLs and inert JSON URL keys only in new profiles", () => {
    expect(validateFixture(fixture(authoredSourceList)).success).toBe(true);
    expect(validateFixture(fixture({ ...authoredEvidenceDrawer, content: { type: "json", value: { url: "plain data", href: false } } }, "mcpcn/evidence-drawer")).success).toBe(true);
    expect(validateFixture(fixture({ title: "Old alias", items: [{ url: "https://example.com" }] }, "mcpcn/reasoning-summary")).success).toBe(false);
    expect(validateFixture(fixture({ ...authoredSourceList, sources: [{ ...authoredSourceList.sources[0], url: "javascript:alert(1)" }] })).success).toBe(false);
  });
  it("SE-F08 rejects getter and prototype smuggling before schema traversal without invoking code", () => {
    let invoked = 0;
    const envelope = { version: 1, data: authoredSourceList };
    Object.defineProperty(envelope, "kind", { enumerable: true, get() { invoked++; return "mcpcn/source-list"; } });
    expect(validateFixture(envelope).success).toBe(false); expect(invoked).toBe(0);
    const data = JSON.parse(JSON.stringify(authoredEvidenceDrawer));
    data.content = { type: "json", value: JSON.parse('{"__proto__":{"url":"smuggled"}}') };
    expect(validateFixture(fixture(data, "mcpcn/evidence-drawer")).success).toBe(false);
  });
  it("SE-F09 retains the smaller editor string and byte budgets without silent truncation", () => {
    const native = { ...authoredEvidenceDrawer, content: { type: "text", text: "x".repeat(8193) } };
    expect(schemaBySlug["evidence-drawer"].safeParse(native).success).toBe(true);
    expect(validateFixture(fixture(native, "mcpcn/evidence-drawer")).success).toBe(false);
    expect(() => parseResult(" ".repeat(65537))).toThrow("64 KiB");
  });
  it("SE-F10 refuses stale generic cards and UI-only properties in strict new DTO envelopes", () => {
    for (const slug of slugs) {
      expect(validateFixture(fixture({ title: "Generic", items: [] }, `mcpcn/${slug}`)).success).toBe(false);
      for (const patch of [{ busy: true }, { onAction: "callback" }, { error: "UI-only" }]) expect(validateFixture({ ...makeFixture(slug), data: { ...makeFixture(slug).data as object, ...patch } }).success).toBe(false);
    }
  });
});

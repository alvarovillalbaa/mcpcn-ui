import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceListSchema, EvidenceDrawerSchema, type SourceListData } from "@mcpcn/schemas";
import { SourceListDemo, EvidenceDrawerDemo, EvidenceDrawerStackDemo } from "./source-evidence-demos";
import { applySourceListExampleAction, sourceEvidenceExamples, sourceEvidenceExampleCode } from "./source-evidence-examples";

const select = { type: "select-source", data: { listId: "sources-1", listRevision: "1", sourceId: "note-a", sourceRevision: "1" } };

describe("source and evidence documentation consumers", () => {
  it("SE-DOC01 provides strict complete examples with explicit null selection and absent open request", () => {
    const list = SourceListSchema.parse(sourceEvidenceExamples["source-list"]), drawer = EvidenceDrawerSchema.parse(sourceEvidenceExamples["evidence-drawer"]);
    expect(list.state).toBe("ready"); if (list.state === "ready") { expect(list.selectedSourceId).toBeNull(); expect(list.sources).toHaveLength(2); }
    expect(Object.hasOwn(drawer, "open")).toBe(false); expect(drawer.state).toBe("ready");
    if (drawer.state === "ready" && drawer.content.type === "text") { expect(drawer.content.text).toContain("BEGIN-EVIDENCE"); expect(drawer.content.text.endsWith("END-EVIDENCE")).toBe(true); }
  });
  it("SE-DOC02 renders real source selection and semantic consumer controls with initial counters", () => {
    const html = renderToStaticMarkup(<SourceListDemo />);
    expect(html).toContain('aria-label="Source list demonstration"'); expect(html).toContain("Review supplied sources");
    expect(html).toContain('aria-label="Select source: Authored research note"'); expect(html).toContain("END-EXCERPT"); expect(html).toContain("END-SUPPORT");
    for (const label of ["Consumer response", "Selection ownership", "Callback enabled", "Malformed source list", "Append unrelated source", "Replace selected source", "Replace source list", "Clear controlled selection"]) expect(html).toContain(label);
    expect(html).toContain('aria-label="Source list intent count">0</output>'); expect(html).toContain('aria-label="Settled callback count">0</output>');
    expect(html).toContain('aria-label="Last source list intent">null</pre>'); expect(html).not.toContain("GenericAgentComponent");
  });
  it("SE-DOC03 renders complete closed evidence SSR with semantic lifecycle and request controls", () => {
    const html = renderToStaticMarkup(<EvidenceDrawerDemo />), native = html.match(/<dialog\b[^>]*>/)?.[0] ?? "missing";
    expect(native).not.toBe("missing"); expect(native).not.toMatch(/\sopen(?:[\s=>]|$)/); expect(html).toContain("Inspect supplied evidence");
    expect(html).toContain("BEGIN-EVIDENCE"); expect(html).toContain("END-EVIDENCE"); expect(html).toContain("&lt;script&gt;untrusted()&lt;/script&gt;");
    for (const label of ["External open request", "Drawer lifecycle", "Keep mounted", "Unmount after opening", "External busy", "Callback enabled", "Malformed evidence", "Mount evidence drawer", "Replace source descriptor", "Replace evidence content", "Replace evidence drawer", "Use text evidence", "Use JSON evidence"]) expect(html).toContain(label);
    expect(html).toContain('aria-label="Evidence intent count">0</output>'); expect(html).toContain('aria-label="Settled callback count">0</output>');
    expect(html).toContain('aria-label="Last evidence intent">null</pre>'); expect(html).not.toContain("<script>");
  });
  it("SE-DOC04 renders two independent closed native stack shells and a real removable opening control", () => {
    const html = renderToStaticMarkup(<EvidenceDrawerStackDemo />), dialogs = html.match(/<dialog\b[^>]*>/g) ?? [];
    expect(dialogs).toHaveLength(2); for (const dialog of dialogs) expect(dialog).not.toMatch(/\sopen(?:[\s=>]|$)/);
    expect(html).toContain("First stacked evidence"); expect(html).toContain("Second stacked evidence");
    for (const label of ["Remove stack invoker after opening", "Open stacked drawers", "Reset stacked drawers", "Stack opening trigger", "Stacked evidence intent count", "Last stacked evidence intent"]) expect(html).toContain(label);
    expect(html).toContain('aria-label="Stack opening trigger">Present</output>'); expect(html).toContain('aria-label="Stacked evidence intent count">0</output>');
    const labels = dialogs.map(dialog => dialog.match(/aria-labelledby="([^"]+)"/)?.[1]); expect(new Set(labels).size).toBe(2);
  });
  it("SE-DOC05 echoes only a matching current source identity without changing supplied content", () => {
    const data = sourceEvidenceExamples["source-list"], updated = applySourceListExampleAction(data, select);
    expect(updated).not.toBe(data); expect(updated.state).toBe("ready");
    if (updated.state === "ready" && data.state === "ready") { expect(updated.selectedSourceId).toBe("note-a"); expect(updated.sources).toBe(data.sources); }
    expect(SourceListSchema.safeParse(updated).success).toBe(true);
  });
  it("SE-DOC06 refuses stale root source revision unrelated and malformed event scopes", () => {
    const data = sourceEvidenceExamples["source-list"];
    for (const action of [{ ...select, data: { ...select.data, listId: "old-list" } }, { ...select, data: { ...select.data, listRevision: "old-revision" } },
      { ...select, data: { ...select.data, sourceId: "foreign-source" } }, { ...select, data: { ...select.data, sourceRevision: "old-revision" } },
      { type: "inspect-source", data: select.data }, { type: "select-source", data: null }, { type: "select-source", data: [] }]) {
      expect(applySourceListExampleAction(data, action)).toBe(data);
    }
    const empty: SourceListData = { id: "empty", revision: "1", title: "Empty sources", state: "empty" };
    expect(applySourceListExampleAction(empty, select)).toBe(empty);
  });
  it("SE-DOC07 provides a complete typed controlled selection snippet with current identity checks", () => {
    const code = sourceEvidenceExampleCode("source-list")!;
    expect(code).toContain("export function Example()"); expect(code).toContain("useState<SourceListData>"); expect(code).toContain("<SourceList {...data} onAction={handleAction}");
    expect(code).toContain("scope.listRevision !== current.revision"); expect(code).toContain("item.revision === scope.sourceRevision");
    expect(code).toContain("selectedSourceId: source.id"); expect(code).toContain("END-EXCERPT"); expect(code).toContain("END-SUPPORT");
  });
  it("SE-DOC08 provides a callback-optional local drawer example without an undismissible open flag", () => {
    const code = sourceEvidenceExampleCode("evidence-drawer")!;
    expect(code).toContain("useState<EvidenceDrawerData>"); expect(code).toContain("<EvidenceDrawer {...data} onAction={handleAction}");
    expect(code).toContain("setLast(action)"); expect(code).toContain("BEGIN-EVIDENCE"); expect(code).toContain("END-EVIDENCE");
    expect(code).not.toMatch(/"open"\s*:/); expect(code).toContain("component owns immediate dismissal"); expect(code).toContain("No fetching, tool call or persistence");
  });
  it("SE-DOC09 does not invent examples for unrelated identities or variant spellings", () => {
    for (const slug of ["source-evidence-panel", "source-list-unknown", "EvidenceDrawer", "approval-card", ""]) expect(sourceEvidenceExampleCode(slug)).toBeUndefined();
  });
  it("SE-DOC10 preserves canonical authored examples while rendering and applying local producer echoes", () => {
    const before = JSON.stringify(sourceEvidenceExamples);
    applySourceListExampleAction(sourceEvidenceExamples["source-list"], select);
    sourceEvidenceExampleCode("source-list"); sourceEvidenceExampleCode("evidence-drawer");
    renderToStaticMarkup(<><SourceListDemo /><EvidenceDrawerDemo /><EvidenceDrawerStackDemo /></>);
    expect(JSON.stringify(sourceEvidenceExamples)).toBe(before); expect(sourceEvidenceExamples["evidence-drawer"].title).toBe("Inspect supplied evidence");
  });
});

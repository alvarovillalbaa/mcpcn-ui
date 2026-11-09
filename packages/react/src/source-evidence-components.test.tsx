import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SourceListSchema, EvidenceDrawerSchema, stableReviewKey,
  type EvidenceSource, type SourceListData, type ParsedSourceListData, type EvidenceDrawerData,
} from "@mcpcn/schemas";
import {
  SourceList, EvidenceDrawer, reconcileSourceSelection, reconcileEvidencePresentation, changeEvidencePresentation,
} from "./source-evidence-components.js";

const first: EvidenceSource = { id: "source-one", revision: "source-r1", label: "First supplied source", url: "https://example.invalid/source-one",
  excerpt: "First complete supplied excerpt.\nAuthored last line.", supports: ["First supplied support", "Second supplied support"] };
const second: EvidenceSource = { id: "source-two", revision: "source-r2", label: "Second supplied source", excerpt: "Second complete excerpt.", supports: [] };
const list: SourceListData = { id: "source-list", revision: "list-r1", title: "Inspect supplied sources", state: "ready", sources: [first, second] };
const drawer: EvidenceDrawerData = { id: "evidence-drawer", revision: "drawer-r1", title: "Inspect supplied evidence", state: "ready", source: first,
  content: { type: "text", text: "Complete supplied evidence.\nAuthored final line." } };
const render = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);
const callback = () => undefined;
function parsedList(data: SourceListData = list): Extract<ParsedSourceListData, { state: "ready" }> {
  const parsed = SourceListSchema.parse(data);
  if (parsed.state !== "ready") throw new Error("Expected the authored ready list");
  return parsed;
}
const parsedDrawer = (data: EvidenceDrawerData = drawer) => EvidenceDrawerSchema.parse(data);
function selected() {
  const data = parsedList(), initial = reconcileSourceSelection(data), source = data.sources[0]!;
  return { ...initial, localId: source.id, selectedId: source.id, sourceKey: stableReviewKey(source) };
}
function button(html: string, label: string) {
  const row = [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/g)].find(match => match[1]?.includes(`aria-label="${label}"`));
  expect(row, `Expected the native button ${label}`).toBeDefined(); return row?.[1] ?? "";
}

describe("supplied source selection and evidence inspection", () => {
  it("SE-UI01 renders both named native regions while separating the four UI properties", () => {
    for (const html of [render(<SourceList {...list} className="authored-class" busy error="Authored UI error" onAction={callback} />),
      render(<EvidenceDrawer {...drawer} className="authored-class" busy error="Authored UI error" onAction={callback} />)]) {
      expect(html).toMatch(/^<section\b/); expect(html).toContain('role="region"'); expect(html).toContain("authored-class");
      expect(html).toContain("Authored UI error"); expect(html).not.toContain("is invalid");
    }
  });
  it("SE-UI02 rejects invalid DTOs before displaying stale source content or links", () => {
    const invalidList = { ...list, selectedSourceId: "foreign-source" } as SourceListData;
    const invalidDrawer = { ...drawer, unsupported: true } as EvidenceDrawerData;
    for (const html of [render(<SourceList {...invalidList} onAction={callback} />), render(<EvidenceDrawer {...invalidDrawer} onAction={callback} />)]) {
      expect(html).toContain('role="alert"'); expect(html).toContain("is invalid"); expect(html).not.toContain("example.invalid");
      expect(html).not.toContain("Complete supplied evidence"); expect(html).not.toContain("<button");
    }
  });
  it("SE-UI03 displays complete escaped source metadata and credential-free native links", () => {
    const excerpt = "x".repeat(4900) + "\n<script>supplied()</script>\nFinal source marker";
    const html = render(<SourceList {...list} sources={[{ ...first, label: "<b>Supplied label</b>", excerpt, supports: ["<em>Support one</em>", "Final support"] }]} />);
    expect(html).toContain("x".repeat(4900)); expect(html).toContain("Final source marker"); expect(html).toContain("Final support");
    expect(html).toContain("&lt;script&gt;supplied()&lt;/script&gt;"); expect(html).toContain("&lt;b&gt;Supplied label&lt;/b&gt;"); expect(html).not.toContain("<script>");
    expect(html).toContain('target="_blank"'); expect(html).toContain('rel="noopener noreferrer"'); expect(html).toMatch(/referrerpolicy="no-referrer"/i);
    expect(html).toContain('href="https://example.invalid/source-one"'); expect(html).toContain("not verified evidence");
  });
  it("SE-UI04 preserves explicit controlled null and makes callback-free controlled choices read-only", () => {
    const html = render(<SourceList {...list} selectedSourceId={null} />);
    for (const source of [first, second]) {
      expect(button(html, `Select source: ${source.label}`)).toContain('aria-pressed="false"');
      expect(button(html, `Select source: ${source.label}`)).toContain("disabled");
      expect(button(html, `Inspect source: ${source.label}`)).toContain("disabled");
    }
  });
  it("SE-UI05 allows local selection without a callback and exposes supplied controlled selection with a callback", () => {
    const local = render(<SourceList {...list} />), controlled = render(<SourceList {...list} selectedSourceId={second.id} onAction={callback} />);
    expect(button(local, `Select source: ${first.label}`)).not.toContain("disabled");
    expect(button(local, `Inspect source: ${first.label}`)).toContain("disabled");
    expect(button(controlled, `Select source: ${second.label}`)).toContain('aria-pressed="true"');
    expect(button(controlled, `Inspect source: ${second.label}`)).not.toContain("disabled");
  });
  it("SE-UI06 keeps all four reported source states explicit without stale ready content", () => {
    for (const [state, message, expected] of [["loading", "Authored loading", "Source list is loading."], ["empty", "Authored empty", "No sources were supplied."],
      ["error", "Authored source error", "Authored source error"]] as const) {
      const html = render(<SourceList id="reported" revision="one" title="Reported sources" state={state} message={message} />);
      expect(html).toContain(message); expect(html).toContain(expected); expect(html).not.toContain("Supplied sources</ul>");
      expect(html).not.toContain('aria-label="Select source:'); if (state === "error") expect(html).toContain('role="alert"');
    }
    expect(render(<SourceList {...list} sources={[]} />)).toContain("No sources were supplied.");
  });
  it("SE-UI07 renders every allowed source rather than clipping the list to an excerpt", () => {
    const sources = Array.from({ length: 100 }, (_, index) => ({ id: `source-${index}`, revision: "one", label: `Supplied source ${index}`, supports: [] }));
    const html = render(<SourceList {...list} sources={sources} />);
    expect((html.match(/aria-label="Select source:/g) ?? []).length).toBe(100); expect(html).toContain("Supplied source 99");
    expect(html).toContain('<ul class="mcpcn-source-list" aria-label="Supplied sources">');
  });
  it("SE-UI08 initializes local selection to none without inventing the first source as selected", () => {
    const state = reconcileSourceSelection(parsedList());
    expect(state.localId).toBeNull(); expect(state.selectedId).toBeNull(); expect(state.sourceKey).toBeUndefined();
  });
  it("SE-UI09 preserves the actual selected state object across unrelated appends and reorder", () => {
    const state = selected(), data = parsedList();
    const appended = parsedList({ ...list, sources: [second, { id: "unrelated", revision: "one", label: "Unrelated source" }, first] });
    expect(reconcileSourceSelection(data, state)).toBe(state); expect(reconcileSourceSelection(appended, state)).toBe(state);
  });
  it("SE-UI10 clears a local choice when its current source is removed or meaningfully replaced", () => {
    const state = selected();
    for (const sources of [[second], [{ ...first, revision: "replacement" }, second], [{ ...first, excerpt: "Replacement complete excerpt" }, second]]) {
      const next = reconcileSourceSelection(parsedList({ ...list, sources }), state);
      expect(next.localId).toBeNull(); expect(next.selectedId).toBeNull(); expect(next.sourceKey).toBeUndefined();
    }
  });
  it("SE-UI11 keeps controlled null distinct from omitted selection and honors the producer's current member", () => {
    expect(reconcileSourceSelection(parsedList({ ...list, selectedSourceId: null }), selected()).selectedId).toBeNull();
    expect(reconcileSourceSelection(parsedList({ ...list, selectedSourceId: second.id }), selected()).selectedId).toBe(second.id);
    expect(reconcileSourceSelection(parsedList(), selected()).selectedId).toBe(first.id);
  });
  it("SE-UI12 resets local source selection for either new root identity or revision", () => {
    for (const change of [{ id: "replacement-list" }, { revision: "replacement-revision" }]) {
      const next = reconcileSourceSelection(parsedList({ ...list, ...change }), selected());
      expect(next.selectedId).toBeNull(); expect(next.localId).toBeNull(); expect(next.root).not.toBe(selected().root);
    }
  });
  it("SE-UI13 keeps the complete native dialog closed in SSR even for an explicit true request", () => {
    const html = render(<EvidenceDrawer {...drawer} open />), native = html.match(/<dialog\b([^>]*)>/)?.[1] ?? "missing";
    expect(native).not.toBe("missing"); expect(native).not.toMatch(/(?:^|\s)open(?:=|\s|$)/); expect(native).not.toContain("tabindex");
    expect(native).not.toContain("aria-modal"); expect(native).toContain("aria-labelledby=");
    expect(html).toContain("Complete supplied evidence.\nAuthored final line."); expect(html).toContain('tabindex="-1"');
    expect(button(html, "Close evidence")).not.toContain("disabled"); expect(button(html, "Open evidence")).toContain('aria-expanded="false"');
  });
  it("SE-UI14 preserves all 65536 supplied text characters with escaped markup and final whitespace", () => {
    const prefix = "<script>supplied()</script>\n", suffix = "\nLast supplied line.\n", middle = "x".repeat(65536 - prefix.length - suffix.length);
    const text = prefix + middle + suffix;
    expect(text.length).toBe(65536);
    const html = render(<EvidenceDrawer {...drawer} content={{ type: "text", text }} />);
    expect(html).toContain(middle); expect(html).toContain("\nLast supplied line.\n");
    expect(html).toContain("&lt;script&gt;supplied()&lt;/script&gt;"); expect(html).not.toContain("<script>");
    expect(html).toContain('role="region" aria-label="Supplied evidence content" tabindex="0"');
  });
  it("SE-UI15 renders complete structured JSON including false zero null empty strings and deep members", () => {
    for (const value of [false, 0, null, "", { first: 0, second: false, third: null, fourth: { values: [0, false, null, ""] } }]) {
      const html = render(<EvidenceDrawer {...drawer} content={{ type: "json", value }} />);
      expect(html).toContain("<details open"); expect(html).toContain("<summary>Evidence JSON</summary>"); expect(html).not.toContain("is invalid");
      if (value !== null && typeof value === "object") { expect(html).toContain("&quot;fourth&quot;"); expect(html).toContain("&quot;values&quot;"); }
      else expect(html).toContain(JSON.stringify(value).replaceAll('"', "&quot;"));
    }
  });
  it("SE-UI16 keeps non-ready evidence states explicit without inventing content or a source", () => {
    for (const [state, message, expected] of [["loading", "Authored evidence loading", "Evidence is loading."], ["empty", "Authored evidence empty", "No evidence was supplied."],
      ["error", "Authored evidence error", "Authored evidence error"]] as const) {
      const html = render(<EvidenceDrawer id="reported" revision="one" title="Reported evidence" state={state} message={message} />);
      expect(html).toContain(message); expect(html).toContain(expected); expect(html).not.toContain("Complete supplied evidence");
      expect(html).not.toContain("First supplied source"); expect(html).not.toContain("<pre");
    }
  });
  it("SE-UI17 renders intended source metadata for loading and error without mounting stale content", () => {
    for (const state of ["loading", "error"] as const) {
      const html = render(<EvidenceDrawer id="reported" revision="one" title="Reported evidence" state={state} source={first} message="Authored report" />);
      expect(html).toContain(first.label); expect(html).toContain(first.excerpt); expect(html).not.toContain("Complete supplied evidence");
    }
  });
  it("SE-UI18 gates an externally false opening request without gating local controls or dismissal on busy", () => {
    expect(button(render(<EvidenceDrawer {...drawer} open={false} />), "Open evidence")).toContain("disabled");
    expect(button(render(<EvidenceDrawer {...drawer} open={false} onAction={callback} busy />), "Open evidence")).not.toContain("disabled");
    for (const open of [undefined, true]) {
      const html = render(<EvidenceDrawer {...drawer} open={open} busy />);
      expect(button(html, "Open evidence")).not.toContain("disabled"); expect(button(html, "Close evidence")).not.toContain("disabled");
    }
  });
  it("SE-UI19 initializes omitted and false requests closed while true requests are locally open", () => {
    expect(reconcileEvidencePresentation(parsedDrawer()).open).toBe(false);
    expect(reconcileEvidencePresentation(parsedDrawer({ ...drawer, open: false })).open).toBe(false);
    expect(reconcileEvidencePresentation(parsedDrawer({ ...drawer, open: true })).open).toBe(true);
  });
  it("SE-UI20 does not reopen a dismissed drawer for the same consumed true request", () => {
    const data = parsedDrawer({ ...drawer, open: true }), opened = reconcileEvidencePresentation(data), dismissed = changeEvidencePresentation(opened, false);
    expect(dismissed.cycle).toBe(opened.cycle + 1); expect(reconcileEvidencePresentation(data, dismissed)).toBe(dismissed);
    expect(reconcileEvidencePresentation(parsedDrawer({ ...drawer, open: true }), dismissed).open).toBe(false);
  });
  it("SE-UI21 consumes both false-to-true and newly supplied true requests after absence", () => {
    for (const open of [undefined, false]) {
      const before = reconcileEvidencePresentation(parsedDrawer({ ...drawer, open }));
      const next = reconcileEvidencePresentation(parsedDrawer({ ...drawer, open: true }), before);
      expect(next.open).toBe(true); expect(next.cycle).toBeGreaterThan(before.cycle);
    }
  });
  it("SE-UI22 forces external false closed and preserves owned local dismissal after absence returns", () => {
    const opened = reconcileEvidencePresentation(parsedDrawer({ ...drawer, open: true }));
    const closed = reconcileEvidencePresentation(parsedDrawer({ ...drawer, open: false }), opened);
    expect(closed.open).toBe(false); expect(closed.cycle).toBe(opened.cycle + 1);
    const local = reconcileEvidencePresentation(parsedDrawer(), closed);
    expect(local.open).toBe(false); expect(local.request).toBeUndefined();
  });
  it("SE-UI23 closes same-root content replacement and honors a fresh true request on root replacement", () => {
    const open = reconcileEvidencePresentation(parsedDrawer({ ...drawer, open: true }));
    const replaced = reconcileEvidencePresentation(parsedDrawer({ ...drawer, open: true, content: { type: "text", text: "Replacement evidence" } }), open);
    expect(replaced.open).toBe(false); expect(replaced.cycle).toBe(open.cycle + 1);
    expect(reconcileEvidencePresentation(parsedDrawer({ ...drawer, revision: "new-root", open: true }), replaced).open).toBe(true);
  });
  it("SE-UI24 preserves presentation for equivalent nested object key order", () => {
    const before = parsedDrawer({ ...drawer, open: true, content: { type: "json", value: { alpha: 1, nested: { first: 0, second: false } } } });
    const reordered = parsedDrawer({ ...drawer, open: true, content: { type: "json", value: { nested: { second: false, first: 0 }, alpha: 1 } } });
    const state = reconcileEvidencePresentation(before);
    expect(reconcileEvidencePresentation(reordered, state)).toBe(state);
  });
  it("SE-UI25 fences meaningful source metadata reported-state and root-term replacements", () => {
    const state = reconcileEvidencePresentation(parsedDrawer({ ...drawer, open: true }));
    const replacements: EvidenceDrawerData[] = [{ ...drawer, title: "Replacement title" }, { ...drawer, message: "Replacement report" },
      { ...drawer, source: { ...first, revision: "replacement-source" } }, { ...drawer, source: { ...first, excerpt: "Replacement excerpt" } },
      { id: drawer.id, revision: drawer.revision, title: drawer.title, state: "loading", source: first }];
    for (const replacement of replacements) {
      const next = reconcileEvidencePresentation(parsedDrawer({ ...replacement, open: true }), state);
      expect(next.open).toBe(false); expect(next.cycle).toBe(state.cycle + 1); expect(next.content).not.toBe(state.content);
    }
  });
  it("SE-UI26 keeps presentation cycles distinct when explicitly reopened and closed", () => {
    const initial = reconcileEvidencePresentation(parsedDrawer()), opened = changeEvidencePresentation(initial, true), closed = changeEvidencePresentation(opened, false);
    expect(opened.open).toBe(true); expect(closed.open).toBe(false); expect(opened.cycle).toBe(initial.cycle + 1); expect(closed.cycle).toBe(opened.cycle + 1);
    expect(reconcileEvidencePresentation(parsedDrawer(), closed)).toBe(closed);
  });
  it("SE-UI27 gives simultaneous native drawer instances distinct heading and controls bindings", () => {
    const html = render(<><EvidenceDrawer {...drawer} /><EvidenceDrawer {...drawer} id="second-drawer" title="Second evidence drawer" /></>);
    const labels = [...html.matchAll(/<dialog\b[^>]*aria-labelledby="([^"]+)"/g)].map(row => row[1]);
    const controls = [...html.matchAll(/aria-controls="([^"]+)"/g)].map(row => row[1]);
    expect(labels.length).toBe(2); expect(new Set(labels).size).toBe(2); expect(new Set(controls).size).toBe(2);
    for (const label of labels) expect(html).toContain(`id="${label}"`);
    expect(html).not.toContain('aria-hidden="true"'); expect(html).not.toContain("<iframe"); expect(html).not.toContain("<object");
  });
});

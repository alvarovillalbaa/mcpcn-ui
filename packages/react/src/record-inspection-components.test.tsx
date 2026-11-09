import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RecordInspectorSchema, FieldConfidenceListSchema, stableReviewKey,
  type InspectionField, type RecordInspectorData, type ParsedRecordInspectorData,
  type FieldConfidenceListData, type ParsedFieldConfidenceListData,
} from "@mcpcn/schemas";
import { RecordInspector, FieldConfidenceList, reconcileInspectionSelection, inspectionNotificationScope } from "./record-inspection-components.js";

const first: InspectionField = { id: "amount", revision: "field-one", label: "Supplied amount", value: { total: 0, reviewed: false, next: null, notes: ["", "Final nested value"] }, confidence: 0,
  evidence: [{ id: "line", label: "Supplied invoice line", text: "Complete authored line.\nLast evidence line.", url: "https://example.invalid/invoice" }] };
const second: InspectionField = { id: "supplier", revision: "field-two", label: "Supplied supplier", value: "Private sibling value",
  evidence: [{ id: "private-line", label: "Private sibling evidence", text: "Private sibling evidence text" }] };
const record: RecordInspectorData = { id: "record-inspector", revision: "component-one", title: "Inspect supplied record", state: "ready",
  record: { id: "record-one", revision: "record-revision-one", label: "Supplied invoice record", fields: [first, second] } };
const confidence: FieldConfidenceListData = { id: "confidence-list", revision: "component-two", title: "Inspect supplied confidence", state: "ready", fields: [first, second] };
type ReadyRecord = Extract<ParsedRecordInspectorData, { state: "ready" }>;
type ReadyConfidence = Extract<ParsedFieldConfidenceListData, { state: "ready" }>;
type Ready = ReadyRecord | ReadyConfidence;
const render = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);
const callback = () => undefined;
function parsedRecord(value: RecordInspectorData = record): ReadyRecord {
  const data = RecordInspectorSchema.parse(value); if (data.state !== "ready") throw new Error("Expected authored ready record"); return data;
}
function parsedConfidence(value: FieldConfidenceListData = confidence): ReadyConfidence {
  const data = FieldConfidenceListSchema.parse(value); if (data.state !== "ready") throw new Error("Expected authored ready confidence"); return data;
}
const fieldsOf = (data: Ready) => "record" in data ? data.record.fields : data.fields;
function withFields(data: Ready, fields: InspectionField[]): Ready {
  return "record" in data ? parsedRecord({ ...data, record: { ...data.record, fields } }) : parsedConfidence({ ...data, fields });
}
function selected(data: Ready) {
  const field = fieldsOf(data)[0]!;
  return { ...reconcileInspectionSelection(data), localId: field.id, selectedId: field.id, fieldKey: stableReviewKey(field) };
}
function button(html: string, label: string) {
  const native = [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/g)].find(match => match[1]?.includes(`aria-label="${label}"`) || match[2] === label);
  expect(native, `Expected native button ${label}`).toBeDefined(); return native?.[1] ?? "";
}

describe("record and reported field confidence inspection", () => {
  it("RI-UI01 renders both labelled native regions and separates caller-only UI properties", () => {
    for (const html of [render(<RecordInspector {...record} className="authored-inspection" busy error="Authored UI feedback" onAction={callback} />),
      render(<FieldConfidenceList {...confidence} className="authored-inspection" busy error="Authored UI feedback" onAction={callback} />)]) {
      expect(html).toMatch(/^<section\b/); expect(html).toContain('role="region"'); expect(html).toContain('aria-busy="true"');
      expect(html).toContain("authored-inspection"); expect(html).toContain("Authored UI feedback"); expect(html).not.toContain("is invalid");
    }
  });
  it("RI-UI02 refuses invalid DTOs before rendering private values evidence links or controls", () => {
    const invalidRecord = { ...record, selectedFieldId: "foreign" } as RecordInspectorData;
    const invalidConfidence = { ...confidence, tool: "unsupported" } as FieldConfidenceListData;
    for (const html of [render(<RecordInspector {...invalidRecord} />), render(<FieldConfidenceList {...invalidConfidence} />)]) {
      expect(html).toContain('role="alert"'); expect(html).toContain("is invalid"); expect(html).not.toContain("Final nested value");
      expect(html).not.toContain("example.invalid"); expect(html).not.toContain("<button");
    }
    let reads = 0;
    const accessorRecord = Object.defineProperty({ ...record }, "record", { enumerable: true, get() { reads++; return "Never read"; } });
    const accessorConfidence = Object.defineProperty({ ...confidence }, "fields", { enumerable: true, get() { reads++; return "Never read"; } });
    // Direct wrappers retain the authored descriptors rather than React copying the fixture first.
    expect(render(RecordInspector(accessorRecord))).toContain("Record inspection data is invalid");
    expect(render(FieldConfidenceList(accessorConfidence))).toContain("Field confidence data is invalid"); expect(reads).toBe(0);
  });
  it("RI-UI03 starts local inspection with no selection or full value disclosure", () => {
    for (const html of [render(<RecordInspector {...record} />), render(<FieldConfidenceList {...confidence} />)]) {
      expect(button(html, `Inspect field: ${first.label}`)).toContain('aria-pressed="false"');
      expect(button(html, `Inspect field: ${first.label}`)).not.toContain("disabled"); expect(button(html, "Clear selection")).toContain("disabled");
      expect(html).toContain("No field is selected."); expect(html).toContain("Select a field to inspect its complete value");
      expect(html).not.toContain("<pre"); expect(html).not.toContain("Private sibling value"); expect(html).not.toContain("Last evidence line.");
    }
  });
  it("RI-UI04 preserves controlled null and disables requests only when its callback is absent", () => {
    for (const html of [render(<RecordInspector {...record} selectedFieldId={null} />), render(<FieldConfidenceList {...confidence} selectedFieldId={null} />)]) {
      expect(button(html, `Inspect field: ${first.label}`)).toContain('aria-pressed="false"'); expect(button(html, `Inspect field: ${first.label}`)).toContain("disabled");
      expect(button(html, "Clear selection")).toContain("disabled"); expect(html).not.toContain("<pre");
    }
    expect(button(render(<RecordInspector {...record} selectedFieldId={null} onAction={callback} />), `Inspect field: ${first.label}`)).not.toContain("disabled");
  });
  it("RI-UI05 renders complete current controlled JSON including every falsy primitive and nested member", () => {
    for (const value of [false, 0, null, "", { first: 0, second: false, third: null, fourth: ["", { final: "Authored final member" }] }]) {
      const html = render(<FieldConfidenceList {...confidence} fields={[{ ...first, value }]} selectedFieldId={first.id} onAction={callback} />);
      expect(button(html, `Inspect field: ${first.label}`)).toContain('aria-pressed="true"'); expect(html).toContain('aria-label="Complete field JSON"');
      expect(html).toContain('role="region" aria-label="Complete value and evidence: Supplied amount" tabindex="0"');
      if (value !== null && typeof value === "object") { expect(html).toContain("&quot;fourth&quot;"); expect(html).toContain("Authored final member"); }
      else expect(html).toContain(JSON.stringify(value).replaceAll('"', "&quot;"));
    }
  });
  it("RI-UI06 keeps all supplied string and evidence characters escaped and complete", () => {
    const value = "x".repeat(9900) + "<script>supplied()</script>\nFinal value marker", text = "y".repeat(3900) + "\n<em>Evidence ending</em>";
    const html = render(<RecordInspector {...record} record={{ id: "record-one", revision: "record-revision-one", label: "<b>Supplied record</b>",
      fields: [{ ...first, label: "<b>Supplied field</b>", value, evidence: [{ id: "full", label: "Complete evidence", text, url: "https://example.invalid/full" }] }] }} selectedFieldId={first.id} />);
    expect(html).toContain("x".repeat(9900)); expect(html).toContain("Final value marker"); expect(html).toContain("y".repeat(3900));
    expect(html).toContain("&lt;script&gt;supplied()&lt;/script&gt;"); expect(html).toContain("&lt;em&gt;Evidence ending&lt;/em&gt;");
    expect(html).toContain("&lt;b&gt;Supplied record&lt;/b&gt;"); expect(html).not.toContain("<script>"); expect(html).not.toContain("<em>");
    expect(html).toContain('href="https://example.invalid/full"'); expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"'); expect(html).toMatch(/referrerpolicy="no-referrer"/i);
  });
  it("RI-UI07 exposes only the selected field's complete value and evidence", () => {
    const html = render(<RecordInspector {...record} selectedFieldId={first.id} />);
    expect(html).toContain("Supplied invoice record"); expect(html).toContain("Final nested value"); expect(html).toContain("Last evidence line.");
    expect(html).toContain(second.label); expect(html).not.toContain("Private sibling value"); expect(html).not.toContain("Private sibling evidence text");
    expect(html).not.toContain("Private sibling evidence</strong>");
  });
  it("RI-UI08 distinguishes zero reported confidence from absence with a real labelled native meter", () => {
    const html = render(<FieldConfidenceList {...confidence} />);
    expect(html).toContain("Reported confidence: 0%"); expect(html).toContain("Reported confidence: Not supplied");
    expect(html.match(/<meter\b/g)).toHaveLength(1); expect(html).toContain('min="0" max="1" value="0"');
    expect(html).toContain('aria-label="Reported confidence: Supplied amount"'); expect(html).toContain('aria-valuetext="0%"');
    expect(html).toContain("not verified accuracy or authorization");
  });
  it("RI-UI09 preserves the reported native confidence value and shows the supplied percentage", () => {
    const html = render(<FieldConfidenceList {...confidence} fields={[{ ...first, confidence: 0.375 }, { ...second, confidence: 1 }]} />);
    expect(html).toContain('value="0.375"'); expect(html).toContain("37.5%"); expect(html).toContain('value="1"'); expect(html).toContain("100%");
    expect(html).not.toContain("Average"); expect(html).not.toContain("risk");
  });
  it("RI-UI10 renders all one hundred fields with their types rather than clipping the collection", () => {
    const fields = Array.from({ length: 100 }, (_, index) => ({ id: `field-${index}`, revision: "one", label: `Supplied field ${index}`, value: index % 2 ? [] : null }));
    const html = render(<FieldConfidenceList {...confidence} fields={fields} />);
    expect([...html.matchAll(/aria-label="Inspect field:/g)]).toHaveLength(100); expect(html).toContain("Supplied field 99");
    expect(html).toContain("Field type: null"); expect(html).toContain("Field type: array");
  });
  it("RI-UI11 keeps each explicit non-ready state independent of stale record or field content", () => {
    for (const state of ["loading", "empty", "error"] as const) {
      const common = { id: "reported", revision: "one", title: "Reported inspection", state, message: `Authored ${state} message` };
      for (const html of [render(<RecordInspector {...common} />), render(<FieldConfidenceList {...common} />)]) {
        expect(html).toContain(common.message); expect(html).not.toContain("Supplied amount"); expect(html).not.toContain("<pre"); expect(html).not.toContain("<button");
        if (state === "error") expect(html).toContain('role="alert"'); else expect(html).toContain('role="status"');
      }
    }
  });
  it("RI-UI12 reports ready empty fields and a selected field with no evidence explicitly", () => {
    expect(render(<RecordInspector {...record} record={{ id: "empty", revision: "one", label: "Empty supplied record", fields: [] }} />)).toContain("No fields were supplied.");
    expect(render(<FieldConfidenceList {...confidence} fields={[]} />)).toContain("No fields were supplied.");
    const html = render(<FieldConfidenceList {...confidence} fields={[{ ...second, evidence: [] }]} selectedFieldId={second.id} />);
    expect(html).toContain("Private sibling value"); expect(html).toContain("No evidence was supplied for this field.");
  });
  it("RI-UI13 leaves local reading requests enabled during external busy and preserves supplied controlled content without callbacks", () => {
    for (const html of [render(<RecordInspector {...record} busy />), render(<FieldConfidenceList {...confidence} busy />)]) {
      expect(button(html, `Inspect field: ${first.label}`)).not.toContain("disabled"); expect(html).toContain("Working…");
    }
    const controlled = render(<RecordInspector {...record} selectedFieldId={first.id} busy />);
    expect(controlled).toContain("Final nested value"); expect(button(controlled, `Inspect field: ${first.label}`)).toContain("disabled");
  });
  it("RI-UI14 initializes local selection to null for either component", () => {
    for (const data of [parsedRecord(), parsedConfidence()]) {
      const state = reconcileInspectionSelection(data); expect(state.localId).toBeNull(); expect(state.selectedId).toBeNull(); expect(state.fieldKey).toBeUndefined();
    }
  });
  it("RI-UI15 preserves selected state identity across unrelated append and reorder", () => {
    for (const data of [parsedRecord(), parsedConfidence()]) {
      const state = selected(data), fields = fieldsOf(data);
      const next = withFields(data, [fields[1]!, { id: "appendix", revision: "one", label: "Additional field", value: true }, fields[0]!]);
      expect(reconcileInspectionSelection(data, state)).toBe(state); expect(reconcileInspectionSelection(next, state)).toBe(state);
    }
  });
  it("RI-UI16 preserves local choice when another current field changes", () => {
    for (const data of [parsedRecord(), parsedConfidence()]) {
      const state = selected(data), fields = fieldsOf(data);
      const changed = withFields(data, [fields[0]!, { ...fields[1]!, revision: "new", value: "Unrelated replacement", confidence: 1 }]);
      expect(reconcileInspectionSelection(changed, state)).toBe(state);
    }
  });
  it("RI-UI17 clears local selection for every meaningful selected field replacement", () => {
    const replacements: InspectionField[] = [{ ...first, revision: "new" }, { ...first, label: "Replacement label" }, { ...first, value: false },
      { ...first, confidence: undefined }, { ...first, evidence: [{ id: "line", label: "Replacement evidence" }] }];
    for (const data of [parsedRecord(), parsedConfidence()]) for (const field of replacements) {
      const next = reconcileInspectionSelection(withFields(data, [field, second]), selected(data));
      expect(next.localId).toBeNull(); expect(next.selectedId).toBeNull(); expect(next.fieldKey).toBeUndefined();
    }
  });
  it("RI-UI18 clears local selection when the current field is removed", () => {
    for (const data of [parsedRecord(), parsedConfidence()]) {
      const next = reconcileInspectionSelection(withFields(data, [second]), selected(data)); expect(next.selectedId).toBeNull(); expect(next.localId).toBeNull();
    }
  });
  it("RI-UI19 clears local choice for a different component identity or revision", () => {
    for (const change of [{ id: "replacement" }, { revision: "new-component-revision" }]) {
      for (const data of [parsedRecord(), parsedConfidence()]) {
        const next = reconcileInspectionSelection({ ...data, ...change }, selected(data)); expect(next.selectedId).toBeNull(); expect(next.root).not.toBe(selected(data).root);
      }
    }
  });
  it("RI-UI20 scopes record selection to record identity while preserving its relabelled metadata", () => {
    const data = parsedRecord(), state = selected(data);
    for (const change of [{ id: "replacement-record" }, { revision: "replacement-record-revision" }]) {
      expect(reconcileInspectionSelection(parsedRecord({ ...data, record: { ...data.record, ...change } }), state).selectedId).toBeNull();
    }
    expect(reconcileInspectionSelection(parsedRecord({ ...data, record: { ...data.record, label: "Updated supplied record label" } }), state)).toBe(state);
  });
  it("RI-UI21 distinguishes controlled none current selection and omitted local mode", () => {
    for (const data of [parsedRecord(), parsedConfidence()]) {
      const state = selected(data);
      expect(reconcileInspectionSelection({ ...data, selectedFieldId: null }, state).selectedId).toBeNull();
      expect(reconcileInspectionSelection({ ...data, selectedFieldId: second.id }, state).selectedId).toBe(second.id);
      expect(reconcileInspectionSelection(data, state).selectedId).toBe(first.id);
    }
  });
  it("RI-UI22 keeps current controlled selection as producer truth after a member replacement", () => {
    for (const data of [parsedRecord(), parsedConfidence()]) {
      const controlled = { ...data, selectedFieldId: first.id }, state = selected(controlled);
      const replacement = withFields(controlled, [{ ...first, revision: "new", value: { replacement: true } }, second]);
      const next = reconcileInspectionSelection(replacement, state); expect(next.selectedId).toBe(first.id); expect(next.localId).toBeNull(); expect(next.fieldKey).not.toBe(state.fieldKey);
    }
  });
  it("RI-UI23 preserves equivalent nested JSON property order across selection reconciliation", () => {
    const data = withFields(parsedRecord(), [{ ...first, value: { alpha: 1, nested: { first: 0, second: false } } }, second]);
    const next = withFields(data, [{ ...first, value: { nested: { second: false, first: 0 }, alpha: 1 } }, second]);
    const state = selected(data); expect(reconcileInspectionSelection(next, state)).toBe(state);
  });
  it("RI-UI24 keeps notification scope unchanged for unrelated append reorder and canonical JSON order", () => {
    const data = withFields(parsedConfidence(), [{ ...first, value: { alpha: 1, nested: { first: 0, second: false } } }, second]);
    const changed = withFields(data, [second, { id: "unrelated", revision: "one", label: "Unrelated field", value: false },
      { ...first, value: { nested: { second: false, first: 0 }, alpha: 1 } }]);
    expect(inspectionNotificationScope(changed, first.id, first.id, true)).toBe(inspectionNotificationScope(data, first.id, first.id, true));
  });
  it("RI-UI25 fences notification scope for current selection callback availability and component or record replacement", () => {
    const data = parsedRecord(), scope = inspectionNotificationScope(data, first.id, first.id, true);
    expect(inspectionNotificationScope(data, null, first.id, true)).not.toBe(scope);
    expect(inspectionNotificationScope(data, first.id, first.id, false)).not.toBe(scope);
    expect(inspectionNotificationScope({ ...data, selectedFieldId: first.id }, first.id, first.id, true)).not.toBe(scope);
    for (const replacement of [{ ...data, revision: "new-root" }, { ...data, record: { ...data.record, revision: "new-record" } }]) {
      expect(inspectionNotificationScope(replacement, first.id, first.id, true)).not.toBe(scope);
    }
  });
  it("RI-UI26 fences an unacknowledged requested member while preserving changes to unrelated fields", () => {
    const data = { ...parsedConfidence(), selectedFieldId: null }, scope = inspectionNotificationScope(data, null, first.id, true);
    const replacedRequest = withFields(data, [{ ...first, value: "Replacement requested value" }, second]);
    const unrelated = withFields(data, [first, { ...second, value: "Unrelated replacement" }]);
    expect(inspectionNotificationScope(replacedRequest, null, first.id, true)).not.toBe(scope);
    expect(inspectionNotificationScope(unrelated, null, first.id, true)).toBe(scope);
    expect(inspectionNotificationScope(data, null, null, true)).not.toBe(scope);
  });
});

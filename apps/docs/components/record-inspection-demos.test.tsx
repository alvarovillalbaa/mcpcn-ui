import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RecordInspector, FieldConfidenceList } from "@mcpcn/react";
import { RecordInspectorSchema, FieldConfidenceListSchema, type RecordInspectorData } from "@mcpcn/schemas";
import { RecordInspectorDemo, FieldConfidenceListDemo } from "./record-inspection-demos";
import { applyRecordInspectionExampleAction, recordInspectionExamples, recordInspectionExampleCode } from "./record-inspection-examples";

const recordIntent = { type: "inspect-record-field", data: { componentId: "record-inspector-1", componentRevision: "1", recordId: "record-1", recordRevision: "1", fieldId: "profile", fieldRevision: "1" } };
const confidenceIntent = { type: "inspect-confidence-field", data: { componentId: "confidence-list-1", componentRevision: "1", fieldId: "profile", fieldRevision: "1" } };

describe("record inspection documentation consumers", () => {
  it("RI-DOC01 supplies strict complete controlled examples with explicit none selected", () => {
    const record = RecordInspectorSchema.parse(recordInspectionExamples["record-inspector"]), confidence = FieldConfidenceListSchema.parse(recordInspectionExamples["field-confidence-list"]);
    expect(record.state).toBe("ready"); expect(confidence.state).toBe("ready");
    if (record.state === "ready" && confidence.state === "ready") {
      expect(record.selectedFieldId).toBeNull(); expect(confidence.selectedFieldId).toBeNull();
      expect(record.record.fields).toHaveLength(5); expect(confidence.fields.map(field => field.value).slice(1)).toEqual([false, 0, "", null]);
    }
  });
  it("RI-DOC02 renders a real local record inspection demo and explicit notification controls", () => {
    const html = renderToStaticMarkup(<RecordInspectorDemo />);
    expect(html).toContain('aria-label="Record inspector demonstration"'); expect(html).toContain("Inspect supplied record fields"); expect(html).toContain("Authored imported record");
    expect(html).toContain('aria-label="Inspect field: Profile"'); expect(html).toContain('aria-label="Record inspector intent count">0</output>');
    expect(html).toContain('aria-label="Settled inspection notification count">0</output>'); expect(html).toContain('aria-label="Pending inspection notifications">0</output>');
    expect(html).toContain('aria-label="Last record inspector intent">null</pre>'); expect(html).not.toContain("END-RECORD-JSON");
    for (const label of ["Notification response", "Selection ownership", "Reported state", "Callback enabled", "External busy", "Malformed inspection", "Apply last selection request", "Append unrelated field", "Reorder fields", "Replace selected field", "Remove selected field", "Replace record", "Replace inspection", "Resolve oldest notification", "Reject oldest notification"]) expect(html).toContain(label);
  });
  it("RI-DOC03 reports confidence zero and absence in the dedicated confidence demo", () => {
    const html = renderToStaticMarkup(<FieldConfidenceListDemo />), meter = html.match(/<meter\b[^>]*aria-label="Reported confidence: Profile"[^>]*>/)?.[0];
    expect(html).toContain('aria-label="Field confidence demonstration"'); expect(html).toContain("Inspect reported field confidence");
    expect(html).toContain("0%"); expect(html).toContain("Not supplied"); expect(meter).toBeDefined(); expect(meter).toContain('value="0"');
    expect(html).toContain('aria-label="Field confidence intent count">0</output>'); expect(html).toContain('aria-label="Last field confidence intent">null</pre>');
    expect(html).not.toContain("Replace record"); expect(html).not.toContain("END-RECORD-JSON");
  });
  it("RI-DOC04 renders complete escaped selected values and safe evidence through actual named components", () => {
    const record = recordInspectionExamples["record-inspector"], confidence = recordInspectionExamples["field-confidence-list"];
    if (record.state !== "ready" || confidence.state !== "ready") throw new Error("Ready authored inspections required");
    for (const html of [renderToStaticMarkup(<RecordInspector {...record} selectedFieldId="profile" />), renderToStaticMarkup(<FieldConfidenceList {...confidence} selectedFieldId="profile" />)]) {
      expect(html).toContain("Complete value and evidence: Profile"); expect(html).toContain("END-RECORD-JSON"); expect(html).toContain("END-RECORD-EVIDENCE");
      expect(html).toContain("&lt;script&gt;never executed&lt;/script&gt;"); expect(html).toContain("&lt;em&gt;kept as text&lt;/em&gt;");
      expect(html).toContain('href="https://example.com/supplied-record"'); expect(html).toContain('target="_blank"'); expect(html).toContain('rel="noopener noreferrer"'); expect(html).toMatch(/referrerpolicy="no-referrer"/i);
      expect(html).not.toContain("<script>");
    }
  });
  it("RI-DOC05 echoes only matching record and field identities while preserving supplied objects", () => {
    const before = recordInspectionExamples["record-inspector"], after = applyRecordInspectionExampleAction(before, recordIntent);
    expect(after).not.toBe(before); expect(after.state).toBe("ready");
    if (before.state === "ready" && after.state === "ready") { expect(after.selectedFieldId).toBe("profile"); expect(after.record).toBe(before.record); }
    expect(RecordInspectorSchema.safeParse(after).success).toBe(true);
  });
  it("RI-DOC06 applies scoped confidence inspection and clear while preserving supplied fields", () => {
    const current = recordInspectionExamples["field-confidence-list"], selected = applyRecordInspectionExampleAction(current, confidenceIntent);
    const cleared = applyRecordInspectionExampleAction(selected, { type: "clear-confidence-field", data: { componentId: current.id, componentRevision: current.revision } });
    expect(selected.state).toBe("ready"); expect(cleared.state).toBe("ready");
    if (selected.state === "ready" && cleared.state === "ready") { expect(selected.selectedFieldId).toBe("profile"); expect(cleared.selectedFieldId).toBeNull(); expect(cleared.fields).toBe(selected.fields); }
  });
  it("RI-DOC07 refuses stale roots records fields extra private data and unrelated intent kinds", () => {
    const current = recordInspectionExamples["record-inspector"];
    for (const patch of [{ componentId: "old" }, { componentRevision: "old" }, { recordId: "old" }, { recordRevision: "old" }, { fieldId: "foreign" }, { fieldRevision: "old" }, { value: "private" }, { confidence: 1 }]) {
      expect(applyRecordInspectionExampleAction(current, { ...recordIntent, data: { ...recordIntent.data, ...patch } })).toBe(current);
    }
    for (const action of [{ type: "save", data: recordIntent.data }, { type: "inspect-record-field", data: null }, { type: "inspect-record-field", data: [] }]) expect(applyRecordInspectionExampleAction(current, action)).toBe(current);
  });
  it("RI-DOC08 leaves local and nonready selection consumer-owned instead of manufacturing controlled state", () => {
    const ready = recordInspectionExamples["record-inspector"];
    if (ready.state !== "ready") throw new Error("Ready authored record fixture required");
    const { selectedFieldId: _selected, ...local } = ready;
    expect(applyRecordInspectionExampleAction(local, recordIntent)).toBe(local);
    const empty: RecordInspectorData = { id: ready.id, revision: ready.revision, title: ready.title, state: "empty" };
    expect(applyRecordInspectionExampleAction(empty, recordIntent)).toBe(empty);
  });
  it("RI-DOC09 publishes standalone typed snippets with current scope checks and complete authored values", () => {
    for (const [slug, name] of [["record-inspector", "RecordInspector"], ["field-confidence-list", "FieldConfidenceList"]] as const) {
      const code = recordInspectionExampleCode(slug); if (!code) throw new Error("Typed authored snippet required");
      expect(code).toContain(`import { ${name}, type ComponentAction } from "@mcpcn/react"`); expect(code).toContain(`useState<${name}Data>`);
      expect(code).toContain(`import type { ${name}Data } from "@mcpcn/schemas"`); expect(code).toContain("scope.componentRevision !== current.revision"); expect(code).toContain("item.revision === scope.fieldRevision");
      expect(code).toContain("selectedFieldId: field.id"); expect(code).toContain("END-RECORD-JSON"); expect(code).toContain("END-RECORD-EVIDENCE");
      expect(code).toContain("Omit selectedFieldId"); expect(code).not.toContain("callTool(");
    }
    expect(recordInspectionExampleCode("record-inspector")).toContain("scope.recordRevision !== current.record.revision");
  });
  it("RI-DOC10 refuses unrelated snippet identities and preserves canonical data across renders and echoes", () => {
    const before = JSON.stringify(recordInspectionExamples);
    for (const slug of ["RecordInspector", "record-inspector-unknown", "source-list", ""]) expect(recordInspectionExampleCode(slug)).toBeUndefined();
    applyRecordInspectionExampleAction(recordInspectionExamples["record-inspector"], recordIntent);
    recordInspectionExampleCode("record-inspector"); recordInspectionExampleCode("field-confidence-list");
    renderToStaticMarkup(<><RecordInspectorDemo /><FieldConfidenceListDemo /></>);
    expect(JSON.stringify(recordInspectionExamples)).toBe(before);
  });
});

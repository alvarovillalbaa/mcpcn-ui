import type { InspectionField, RecordInspectorData, FieldConfidenceListData } from "@mcpcn/schemas";

export const authoredInspectionFields = [
  {
    id: "profile", revision: "1", label: "Profile", confidence: 0,
    value: { confirmed: false, count: 0, next: null, empty: "", items: [false, 0, null, "", { literal: "<script>never executed</script>", end: "END-RECORD-JSON" }] },
    evidence: [{ id: "record-note", label: "Authored record note", text: "Complete supplied evidence <em>kept as text</em>. END-RECORD-EVIDENCE", url: "https://example.com/supplied-record" }],
  },
  { id: "approved", revision: "1", label: "Approved", value: false },
  { id: "count", revision: "1", label: "Count", value: 0, confidence: 1, evidence: [] },
  { id: "notes", revision: "1", label: "Notes", value: "", confidence: 0.5, evidence: [] },
  { id: "next", revision: "1", label: "Next step", value: null },
] satisfies InspectionField[];

export const authoredRecordInspector = {
  id: "record-inspector-1", revision: "1", title: "Supplied record inspection", state: "ready",
  record: { id: "record-1", revision: "1", label: "Authored imported record", fields: authoredInspectionFields }, selectedFieldId: null,
} satisfies RecordInspectorData;

export const authoredFieldConfidenceList = {
  id: "confidence-list-1", revision: "1", title: "Supplied field confidence", state: "ready",
  fields: authoredInspectionFields, selectedFieldId: null,
} satisfies FieldConfidenceListData;

export const recordInspectorStateFixtures = [
  authoredRecordInspector,
  { id: "record-inspector-1", revision: "1", title: "Supplied record inspection", state: "loading" },
  { id: "record-inspector-1", revision: "1", title: "Supplied record inspection", state: "empty" },
  { id: "record-inspector-1", revision: "1", title: "Supplied record inspection", state: "error", message: "Authored record inspection failure." },
  { ...authoredRecordInspector, record: { ...authoredRecordInspector.record, fields: [] } },
] satisfies RecordInspectorData[];

export const fieldConfidenceStateFixtures = [
  authoredFieldConfidenceList,
  { id: "confidence-list-1", revision: "1", title: "Supplied field confidence", state: "loading" },
  { id: "confidence-list-1", revision: "1", title: "Supplied field confidence", state: "empty" },
  { id: "confidence-list-1", revision: "1", title: "Supplied field confidence", state: "error", message: "Authored field confidence failure." },
  { ...authoredFieldConfidenceList, fields: [] },
] satisfies FieldConfidenceListData[];

export const recordInspectionFixtures = { "record-inspector": authoredRecordInspector, "field-confidence-list": authoredFieldConfidenceList } as const;

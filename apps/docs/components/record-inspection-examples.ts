import type { ComponentAction } from "@mcpcn/react";
import type { RecordInspectorData, FieldConfidenceListData } from "@mcpcn/schemas";
import { authoredRecordInspector, authoredFieldConfidenceList } from "../../playground/src/record-inspection-fixtures";

export type InspectionExampleData = RecordInspectorData | FieldConfidenceListData;
export const recordInspectionExamples: { "record-inspector": RecordInspectorData; "field-confidence-list": FieldConfidenceListData } = {
  "record-inspector": { ...authoredRecordInspector, title: "Inspect supplied record fields" },
  "field-confidence-list": { ...authoredFieldConfidenceList, title: "Inspect reported field confidence" },
};

/** Echo only current identity requests into a caller-controlled authored view. */
export function applyRecordInspectionExampleAction<T extends InspectionExampleData>(current: T, action: ComponentAction): T {
  if (current.state !== "ready" || current.selectedFieldId === undefined || !action.data || typeof action.data !== "object" || Array.isArray(action.data)) return current;
  const scope = action.data as Record<string, unknown>, record = "record" in current;
  const inspect = record ? "inspect-record-field" : "inspect-confidence-field", clear = record ? "clear-record-field" : "clear-confidence-field";
  if (action.type !== inspect && action.type !== clear) return current;
  const keys = ["componentId", "componentRevision", ...(record ? ["recordId", "recordRevision"] : []), ...(action.type === inspect ? ["fieldId", "fieldRevision"] : [])];
  if (Object.keys(scope).length !== keys.length || keys.some(key => !Object.hasOwn(scope, key))
    || scope.componentId !== current.id || scope.componentRevision !== current.revision
    || record && (scope.recordId !== current.record.id || scope.recordRevision !== current.record.revision)) return current;
  if (action.type === clear) return { ...current, selectedFieldId: null };
  const fields = record ? current.record.fields : current.fields;
  const field = fields.find(item => item.id === scope.fieldId && item.revision === scope.fieldRevision);
  return field ? { ...current, selectedFieldId: field.id } : current;
}

export function recordInspectionExampleCode(slug: string): string | undefined {
  if (slug !== "record-inspector" && slug !== "field-confidence-list") return undefined;
  const record = slug === "record-inspector", name = record ? "RecordInspector" : "FieldConfidenceList";
  return `"use client";
import { useState } from "react";
import { ${name}, type ComponentAction } from "@mcpcn/react";
import type { ${name}Data } from "@mcpcn/schemas";

export function Example() {
  const [data, setData] = useState<${name}Data>(${JSON.stringify(recordInspectionExamples[slug], null, 2)});
  const [last, setLast] = useState<ComponentAction | null>(null);
  const handleAction = (action: ComponentAction) => {
    setLast(action);
    if (!action.data || typeof action.data !== "object" || Array.isArray(action.data)) return;
    const scope = action.data as Record<string, unknown>;
    setData(current => {
      if (current.state !== "ready" || current.selectedFieldId === undefined
        || scope.componentId !== current.id || scope.componentRevision !== current.revision${record ? "\n        || scope.recordId !== current.record.id || scope.recordRevision !== current.record.revision" : ""}) return current;
      if (action.type === "${record ? "clear-record-field" : "clear-confidence-field"}") return { ...current, selectedFieldId: null };
      if (action.type !== "${record ? "inspect-record-field" : "inspect-confidence-field"}") return current;
      const field = current.${record ? "record.fields" : "fields"}.find(item => item.id === scope.fieldId && item.revision === scope.fieldRevision);
      return field ? { ...current, selectedFieldId: field.id } : current;
    });
  };
  // Omit selectedFieldId for callback-optional local inspection.
  // Supplied confidence/evidence does not verify a value or authorize an action.
  return <>
    <${name} {...data} onAction={handleAction} />
    <pre aria-label="Last inspection intent">{JSON.stringify(last, null, 2)}</pre>
  </>;
}`;
}

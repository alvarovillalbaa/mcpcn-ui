"use client";

import { useEffect, useRef, useState } from "react";
import {
  RecordInspectorSchema, FieldConfidenceListSchema, stableReviewKey,
  type RecordInspectorData, type ParsedRecordInspectorData,
  type FieldConfidenceListData, type ParsedFieldConfidenceListData, type ParsedInspectionField,
  type RecordInspectorIntent, type FieldConfidenceListIntent,
} from "@mcpcn/schemas";
import { Button, Card, InvalidPayload } from "./primitives.js";
import { Feedback } from "./component-helpers.js";
import type { ComponentAction, ComponentProps } from "./component-types.js";

type UIProps = Pick<ComponentProps<unknown>, "className" | "onAction" | "busy" | "error">;
type InspectionData = ParsedRecordInspectorData | ParsedFieldConfidenceListData;
type ReadyInspection = Extract<InspectionData, { state: "ready" }>;
type InspectionIntent = RecordInspectorIntent | FieldConfidenceListIntent;
function ownData(props: object): unknown {
  try {
    const descriptors = Object.getOwnPropertyDescriptors(props), data: object = Object.create(Object.getPrototypeOf(props));
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = Object.getOwnPropertyDescriptor(descriptors, key)?.value as PropertyDescriptor | undefined;
      if (!descriptor) return null;
      if (typeof key === "string" && (["className", "onAction", "busy", "error"].includes(key) || key === "key" && descriptor.enumerable === false)) continue;
      Object.defineProperty(data, key, descriptor);
    }
    return data;
  } catch { return null; }
}
const fieldsOf = (data: ReadyInspection) => "record" in data ? data.record.fields : data.fields;
const inspectionRoot = (data: ReadyInspection) => stableReviewKey("record" in data
  ? { kind: "record", id: data.id, revision: data.revision, recordId: data.record.id, recordRevision: data.record.revision }
  : { kind: "confidence", id: data.id, revision: data.revision });

export interface InspectionSelectionState {
  root: string; localId: string | null; selectedId: string | null; fieldKey?: string;
}

/** Only the current member participates in local replacement reconciliation. */
export function reconcileInspectionSelection(data: ReadyInspection, previous?: InspectionSelectionState): InspectionSelectionState {
  const root = inspectionRoot(data), stored = previous?.root === root ? previous : undefined, fields = fieldsOf(data);
  const oldField = fields.find(field => field.id === stored?.selectedId);
  const replaced = Boolean(stored?.selectedId && stableReviewKey(oldField ?? null) !== stored.fieldKey);
  const localId = stored && !replaced && fields.some(field => field.id === stored.localId) ? stored.localId : null;
  const selectedId = data.selectedFieldId === undefined ? localId : data.selectedFieldId;
  const selected = fields.find(field => field.id === selectedId);
  const next = { root, localId, selectedId, fieldKey: selected ? stableReviewKey(selected) : undefined };
  return stored && stored.localId === next.localId && stored.selectedId === next.selectedId && stored.fieldKey === next.fieldKey ? stored : next;
}

/** A requested member is fenced even before a controlled producer selects it. */
export function inspectionNotificationScope(data: ReadyInspection, selectedId: string | null, requestedId: string | null, available: boolean): string {
  const fields = fieldsOf(data);
  return stableReviewKey({ root: inspectionRoot(data), controlled: data.selectedFieldId !== undefined, available,
    selectedId, selected: fields.find(field => field.id === selectedId) ?? null,
    requestedId, requested: fields.find(field => field.id === requestedId) ?? null });
}

function useInspectionNotification(data: ReadyInspection, selectedId: string | null, onAction: UIProps["onAction"]) {
  const available = Boolean(onAction);
  const current = useRef({ scope: "", requestedId: null as string | null, generation: 0, pendingKey: "", mounted: true });
  const scope = inspectionNotificationScope(data, selectedId, current.current.requestedId, available);
  const [feedback, setFeedback] = useState<{ scope: string; pending: boolean; error?: string }>({ scope, pending: false });
  if (current.current.scope !== scope) current.current = { ...current.current, scope, generation: current.current.generation + 1, pendingKey: "" };
  useEffect(() => {
    current.current.mounted = true;
    return () => { current.current.mounted = false; current.current.generation += 1; current.current.pendingKey = ""; };
  }, []);
  const send = (intent: ComponentAction, nextSelectedId: string | null, requestedId: string | null) => {
    if (!onAction || !current.current.mounted) return;
    const targetScope = inspectionNotificationScope(data, nextSelectedId, requestedId, available), key = stableReviewKey(intent);
    if (current.current.scope === targetScope && current.current.pendingKey === key) return;
    const generation = current.current.generation + 1;
    current.current = { ...current.current, scope: targetScope, requestedId, generation, pendingKey: key };
    const live = () => current.current.mounted && current.current.scope === targetScope && current.current.generation === generation;
    setFeedback({ scope: targetScope, pending: false });
    try {
      const result: unknown = onAction(intent);
      if (result && typeof (result as PromiseLike<unknown>).then === "function") {
        if (live()) setFeedback({ scope: targetScope, pending: true });
        void Promise.resolve(result).then(() => {
          if (live()) { current.current.pendingKey = ""; setFeedback({ scope: targetScope, pending: false }); }
        }, () => {
          if (live()) { current.current.pendingKey = ""; setFeedback({ scope: targetScope, pending: false, error: "The action could not be completed. Try again." }); }
        });
      } else if (live()) current.current.pendingKey = "";
    } catch {
      if (live()) { current.current.pendingKey = ""; setFeedback({ scope: targetScope, pending: false, error: "The action could not be completed. Try again." }); }
    }
  };
  return { send, pending: feedback.scope === scope && feedback.pending, error: feedback.scope === scope ? feedback.error : undefined };
}

function fieldIntent(data: ReadyInspection, field?: ParsedInspectionField): InspectionIntent {
  if ("record" in data) {
    const identity = { componentId: data.id, componentRevision: data.revision, recordId: data.record.id, recordRevision: data.record.revision };
    return field ? { type: "inspect-record-field", data: { ...identity, fieldId: field.id, fieldRevision: field.revision } }
      : { type: "clear-record-field", data: identity };
  }
  const identity = { componentId: data.id, componentRevision: data.revision };
  return field ? { type: "inspect-confidence-field", data: { ...identity, fieldId: field.id, fieldRevision: field.revision } }
    : { type: "clear-confidence-field", data: identity };
}

function FieldConfidence({ field }: { field: ParsedInspectionField }) {
  return <div className="mcpcn-inspection-confidence"><span>Reported confidence: {field.confidence === undefined ? "Not supplied" : `${field.confidence * 100}%`}</span>
    {field.confidence !== undefined && <meter min={0} max={1} value={field.confidence} aria-label={`Reported confidence: ${field.label}`} aria-valuetext={`${field.confidence * 100}%`} />}</div>;
}
const valueType = (value: ParsedInspectionField["value"]) => value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

function SelectedField({ field }: { field: ParsedInspectionField }) {
  return <div className="mcpcn-inspection-content" role="region" aria-label={`Complete value and evidence: ${field.label}`} tabIndex={0}>
    <h4>{field.label}</h4><p className="mcpcn-hint">Field type: {valueType(field.value)}</p><FieldConfidence field={field} />
    <h5>Complete value</h5><pre className="mcpcn-code" aria-label="Complete field JSON">{JSON.stringify(field.value, null, 2)}</pre>
    <h5>Supplied field evidence</h5>{field.evidence.length > 0 ? <ul aria-label="Supplied field evidence" className="mcpcn-inspection-evidence">
      {field.evidence.map(evidence => <li key={evidence.id}><strong>{evidence.label}</strong>
        {evidence.text !== undefined && <p className="mcpcn-inspection-text">{evidence.text}</p>}
        {evidence.url !== undefined && <p><a href={evidence.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{evidence.url}</a></p>}
      </li>)}
    </ul> : <p>No evidence was supplied for this field.</p>}
  </div>;
}

function ReadyFields({ data, ...props }: UIProps & { data: ReadyInspection }) {
  const [stored, setStored] = useState(() => reconcileInspectionSelection(data));
  const state = reconcileInspectionSelection(data, stored);
  if (state !== stored) setStored(state);
  const fields = fieldsOf(data), selected = fields.find(field => field.id === state.selectedId);
  const notification = useInspectionNotification(data, state.selectedId, props.onAction);
  const controlled = data.selectedFieldId !== undefined, blocked = controlled && !props.onAction;
  const select = (field: ParsedInspectionField) => {
    if (blocked) return;
    if (!controlled) setStored({ ...state, localId: field.id, selectedId: field.id, fieldKey: stableReviewKey(field) });
    notification.send(fieldIntent(data, field), controlled ? state.selectedId : field.id, field.id);
  };
  return <>
    {"record" in data && <p className="mcpcn-inspection-text"><strong>Record: </strong>{data.record.label}</p>}
    <p className="mcpcn-hint">Select a field to inspect its complete value and supplied evidence.</p>
    <p className="mcpcn-hint">Confidence and evidence are supplied claims, not verified accuracy or authorization.</p>
    {fields.length === 0 ? <p role="status">No fields were supplied.</p> : <ul className="mcpcn-inspection-fields" aria-label={"record" in data ? "Record fields" : "Fields with reported confidence"}>
      {fields.map(field => <li key={field.id} className="mcpcn-inspection-field"><div className="mcpcn-inspection-summary"><strong>{field.label}</strong>
        <span className="mcpcn-hint">Field type: {valueType(field.value)}</span><FieldConfidence field={field} /></div>
        <Button type="button" data-variant="secondary" aria-label={`Inspect field: ${field.label}`} aria-pressed={state.selectedId === field.id} disabled={blocked} onClick={() => select(field)}>Inspect field</Button>
      </li>)}
    </ul>}
    <div><Button type="button" data-variant="secondary" disabled={blocked || state.selectedId === null} onClick={() => {
      if (blocked || state.selectedId === null) return;
      if (!controlled) setStored({ ...state, localId: null, selectedId: null, fieldKey: undefined });
      notification.send(fieldIntent(data), controlled ? state.selectedId : null, null);
    }}>Clear selection</Button></div>
    {selected ? <SelectedField key={selected.id} field={selected} /> : <p role="status">No field is selected.</p>}
    <Feedback busy={notification.pending} error={notification.error} />
  </>;
}

function InspectionView({ data, kind, ...props }: UIProps & { data: InspectionData; kind: "record" | "confidence" }) {
  return <Card className={["mcpcn-inspection-root", props.className].filter(Boolean).join(" ")} role="region" aria-label={data.title} aria-busy={Boolean(props.busy)}>
    <header className="mcpcn-header"><h3 className="mcpcn-title">{data.title}</h3>{data.description !== undefined && <p className="mcpcn-description">{data.description}</p>}</header>
    <div className="mcpcn-body mcpcn-stack">{data.state === "ready" ? <ReadyFields data={data} {...props} />
      : data.state === "loading" ? <p role="status">{kind === "record" ? "Record is loading." : "Field confidence is loading."}</p>
        : data.state === "empty" ? <p role="status">{kind === "record" ? "No record was supplied." : "No fields were supplied."}</p> : null}
      {data.message !== undefined && <p className="mcpcn-inspection-text" role={data.state === "error" ? "alert" : undefined}>{data.message}</p>}
      <Feedback busy={props.busy} error={props.error} />
    </div>
  </Card>;
}

export function RecordInspector(props: ComponentProps<RecordInspectorData>) {
  const parsed = RecordInspectorSchema.safeParse(ownData(props));
  if (!parsed.success) return <InvalidPayload title="Record inspection data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <InspectionView data={parsed.data} kind="record" className={props.className} busy={props.busy} error={props.error} onAction={props.onAction} />;
}

export function FieldConfidenceList(props: ComponentProps<FieldConfidenceListData>) {
  const parsed = FieldConfidenceListSchema.safeParse(ownData(props));
  if (!parsed.success) return <InvalidPayload title="Field confidence data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <InspectionView data={parsed.data} kind="confidence" className={props.className} busy={props.busy} error={props.error} onAction={props.onAction} />;
}

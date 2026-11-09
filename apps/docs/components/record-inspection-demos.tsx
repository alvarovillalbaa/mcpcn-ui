"use client";

import { useEffect, useRef, useState } from "react";
import { RecordInspector, FieldConfidenceList, type ComponentAction } from "@mcpcn/react";
import type { InspectionField, RecordInspectorData, FieldConfidenceListData } from "@mcpcn/schemas";
import { applyRecordInspectionExampleAction, recordInspectionExamples, type InspectionExampleData } from "./record-inspection-examples";

type Kind = keyof typeof recordInspectionExamples;
type ResponseMode = "immediate" | "hold";
type HeldNotification = { resolve(): void; reject(reason: Error): void };

function localExample(kind: Kind): InspectionExampleData {
  const initial = structuredClone(recordInspectionExamples[kind]);
  if (initial.state !== "ready") return initial;
  const { selectedFieldId: _selected, ...local } = initial; return local;
}
function fieldsOf(data: InspectionExampleData): InspectionField[] {
  return data.state !== "ready" ? [] : "record" in data ? data.record.fields : data.fields;
}
function withFields(data: InspectionExampleData, fields: InspectionField[]): InspectionExampleData {
  return data.state !== "ready" ? data : "record" in data ? { ...data, record: { ...data.record, fields } } : { ...data, fields };
}
function useNotificationConsumer() {
  const [mode, setMode] = useState<ResponseMode>("immediate"), [last, setLast] = useState<ComponentAction | null>(null);
  const [count, setCount] = useState(0), [settled, setSettled] = useState(0), [pending, setPending] = useState(0);
  const held = useRef<HeldNotification[]>([]);
  useEffect(() => () => { for (const job of held.current) job.resolve(); held.current = []; }, []);
  const receive = (action: ComponentAction): void | Promise<void> => {
    setLast(action); setCount(value => value + 1);
    if (mode === "immediate") { setSettled(value => value + 1); return; }
    return new Promise<void>((resolve, reject) => { held.current.push({ resolve, reject }); setPending(held.current.length); });
  };
  const settle = (rejected: boolean) => {
    const job = held.current.shift(); if (!job) return;
    setPending(held.current.length); setSettled(value => value + 1);
    if (rejected) job.reject(new Error("Authored inspection notification refusal")); else job.resolve();
  };
  return { mode, setMode, last, count, settled, pending, receive, settle };
}

function InspectionDemo({ kind }: { kind: Kind }) {
  const record = kind === "record-inspector", name = record ? "Record inspector" : "Field confidence";
  const [data, setData] = useState<InspectionExampleData>(() => localExample(kind));
  const [ownership, setOwnership] = useState("local"), [localSelection, setLocalSelection] = useState<string | null>(null);
  const [callback, setCallback] = useState(true), [busy, setBusy] = useState(false), [malformed, setMalformed] = useState(false);
  const [rootRevision, setRootRevision] = useState(1), [recordRevision, setRecordRevision] = useState(1), [fieldRevision, setFieldRevision] = useState(1);
  const feedback = useNotificationConsumer(), fields = fieldsOf(data);
  const selected = data.state === "ready" && data.selectedFieldId !== undefined ? data.selectedFieldId : localSelection;
  const selectedField = fields.find(field => field.id === selected);
  const receive = (action: ComponentAction) => {
    if (action.type === (record ? "clear-record-field" : "clear-confidence-field")) setLocalSelection(null);
    else if (action.type === (record ? "inspect-record-field" : "inspect-confidence-field") && action.data && typeof action.data === "object" && !Array.isArray(action.data)) {
      const scope = action.data as Record<string, unknown>;
      const field = fields.find(item => item.id === scope.fieldId && item.revision === scope.fieldRevision);
      if (field) setLocalSelection(field.id);
    }
    return feedback.receive(action);
  };
  const changeState = (state: string) => {
    setLocalSelection(null);
    if (state === "ready" || state === "ready-empty") {
      const fresh = ownership === "local" ? localExample(kind) : structuredClone(recordInspectionExamples[kind]);
      setData({ ...(state === "ready-empty" ? withFields(fresh, []) : fresh), id: data.id, revision: data.revision }); return;
    }
    const common = { id: data.id, revision: data.revision, title: data.title };
    if (state === "error") setData({ ...common, state: "error", message: "Authored inspection failure." });
    else if (state === "loading" || state === "empty") setData({ ...common, state });
  };
  const shownState = data.state === "ready" && fields.length === 0 ? "ready-empty" : data.state;
  return <section className="mcpcn-stack" aria-label={`${name} demonstration`}>
    <label className="mcpcn-label">Notification response<select aria-label="Notification response" value={feedback.mode} onChange={event => feedback.setMode(event.currentTarget.value as ResponseMode)}>
      <option value="immediate">Immediate</option><option value="hold">Hold until explicitly settled</option>
    </select></label>
    <label className="mcpcn-label">Selection ownership<select aria-label="Selection ownership" value={ownership} onChange={event => {
      const mode = event.currentTarget.value; setOwnership(mode); setLocalSelection(null);
      setData(current => {
        if (current.state !== "ready") return current;
        if (mode === "controlled") return { ...current, selectedFieldId: null };
        const { selectedFieldId: _selected, ...local } = current; return local;
      });
    }}><option value="local">Local</option><option value="controlled">Controlled</option></select></label>
    <label className="mcpcn-label">Reported state<select aria-label="Reported state" value={shownState} onChange={event => changeState(event.currentTarget.value)}>
      <option value="ready">Ready</option><option value="ready-empty">Ready with no fields</option><option value="loading">Loading</option><option value="empty">Empty</option><option value="error">Error</option>
    </select></label>
    <div className="filter-row">
      <label><input type="checkbox" aria-label="Callback enabled" checked={callback} onChange={event => setCallback(event.currentTarget.checked)} /> Callback enabled</label>
      <label><input type="checkbox" aria-label="External busy" checked={busy} onChange={event => setBusy(event.currentTarget.checked)} /> External busy</label>
      <label><input type="checkbox" aria-label="Malformed inspection" checked={malformed} onChange={event => setMalformed(event.currentTarget.checked)} /> Malformed inspection</label>
    </div>
    {record ? <RecordInspector {...(malformed ? { ...data, unsupported: true } as unknown as RecordInspectorData : data as RecordInspectorData)} busy={busy} onAction={callback ? receive : undefined} />
      : <FieldConfidenceList {...(malformed ? { ...data, unsupported: true } as unknown as FieldConfidenceListData : data as FieldConfidenceListData)} busy={busy} onAction={callback ? receive : undefined} />}
    <div className="filter-row">
      <button type="button" className="button secondary" disabled={ownership !== "controlled" || !feedback.last} onClick={() => {
        const action = feedback.last; if (action) setData(current => applyRecordInspectionExampleAction(current, action));
      }}>Apply last selection request</button>
      <button type="button" className="button secondary" disabled={data.state !== "ready" || fields.some(field => field.id === "appendix")} onClick={() => setData(current => withFields(current,
        [...fieldsOf(current), { id: "appendix", revision: "1", label: "Unrelated appended field", value: { note: "Complete unrelated value. END-APPENDIX" }, evidence: [] }]))}>Append unrelated field</button>
      <button type="button" className="button secondary" disabled={fields.length < 2} onClick={() => setData(current => withFields(current, [...fieldsOf(current)].reverse()))}>Reorder fields</button>
      <button type="button" className="button secondary" disabled={!selectedField} onClick={() => {
        const next = fieldRevision + 1; setFieldRevision(next);
        setData(current => withFields(current, fieldsOf(current).map(field => field.id === selected ? {
          ...field, revision: String(next), label: "Replacement field", value: { replaced: true, marker: "END-REPLACEMENT-FIELD" }, confidence: 0.25,
          evidence: [{ id: "replacement-note", label: "Replacement supplied note", text: "Complete replacement evidence." }],
        } : field)));
        setLocalSelection(null);
      }}>Replace selected field</button>
      <button type="button" className="button secondary" disabled={!selectedField} onClick={() => {
        setData(current => {
          const updated = withFields(current, fieldsOf(current).filter(field => field.id !== selected));
          return updated.state === "ready" && updated.selectedFieldId === selected ? { ...updated, selectedFieldId: null } : updated;
        }); setLocalSelection(null);
      }}>Remove selected field</button>
      {record && <button type="button" className="button secondary" disabled={data.state !== "ready"} onClick={() => {
        const next = recordRevision + 1; setRecordRevision(next); setLocalSelection(null);
        setData(current => current.state === "ready" && "record" in current ? { ...current, record: { ...current.record,
          id: `record-1-replacement-${next}`, revision: String(next), label: "Replacement supplied record" },
          ...(current.selectedFieldId === undefined ? {} : { selectedFieldId: null }) } : current);
      }}>Replace record</button>}
      <button type="button" className="button secondary" onClick={() => {
        const next = rootRevision + 1; setRootRevision(next); setRecordRevision(1); setFieldRevision(1); setLocalSelection(null);
        const fresh = ownership === "local" ? localExample(kind) : structuredClone(recordInspectionExamples[kind]);
        setData({ ...fresh, id: `${record ? "record-inspector" : "confidence-list"}-1-replacement-${next}`, revision: String(next) });
      }}>Replace inspection</button>
    </div>
    <div className="filter-row">
      <button type="button" className="button secondary" disabled={feedback.pending === 0} onClick={() => feedback.settle(false)}>Resolve oldest notification</button>
      <button type="button" className="button secondary" disabled={feedback.pending === 0} onClick={() => feedback.settle(true)}>Reject oldest notification</button>
    </div>
    <p>Intent notifications: <output aria-label={`${name} intent count`}>{feedback.count}</output> · Settled: <output aria-label="Settled inspection notification count">{feedback.settled}</output> · Pending: <output aria-label="Pending inspection notifications">{feedback.pending}</output></p>
    <pre className="code" aria-label={`Last ${record ? "record inspector" : "field confidence"} intent`}>{JSON.stringify(feedback.last, null, 2)}</pre>
    <p className="mcpcn-hint">The demo reports only supplied values and confidence. Apply requests to echo controlled selection; held notifications settle only through the explicit controls. Without a callback, local selection stays private to the component. Nothing is fetched, verified, saved or sent to a model.</p>
  </section>;
}

export function RecordInspectorDemo() { return <InspectionDemo kind="record-inspector" />; }
export function FieldConfidenceListDemo() { return <InspectionDemo kind="field-confidence-list" />; }

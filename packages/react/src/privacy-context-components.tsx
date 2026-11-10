"use client";

import { useEffect, useRef, useState } from "react";
import { DataAccessNoticeSchema, PrivacyBoundaryCardSchema, ConsentPanelSchema, ModelContextPreviewSchema,
  type DataAccessNoticeData, type PrivacyBoundaryCardData, type ConsentPanelData, type ModelContextPreviewData,
  type PrivacyContextData, type ParsedPrivacyContextData, type PrivacyContextIntent, type InspectableJSON } from "@mcpcn/schemas";
import { Badge, Button, Card, InvalidPayload } from "./primitives.js";
import { Feedback } from "./component-helpers.js";
import type { ComponentProps } from "./component-types.js";

type UIProps = Pick<ComponentProps<unknown>, "className" | "busy" | "error" | "onAction">;
type Ready = Extract<ParsedPrivacyContextData, { state: "ready" }>;
function ownData(props: object): unknown {
  try {
    const descriptors = Object.getOwnPropertyDescriptors(props), data = Object.create(Object.getPrototypeOf(props)) as object;
    for (const key of Reflect.ownKeys(descriptors)) {
      const entry = Object.getOwnPropertyDescriptor(descriptors, key)?.value as PropertyDescriptor | undefined;
      if (!entry) return null;
      if (typeof key === "string" && (["className", "busy", "error", "onAction"].includes(key) || key === "key" && !entry.enumerable)) continue;
      Object.defineProperty(data, key, entry);
    }
    return data;
  } catch { return null; }
}
function reportOf(data: Ready) {
  return "access" in data ? data.access : "boundary" in data ? data.boundary : "request" in data ? data.request : data.preview;
}
export function privacyContextIntent(data: ParsedPrivacyContextData, selected: readonly string[] = [], acknowledged = false, decision: "approve" | "decline" = "approve"): PrivacyContextIntent | undefined {
  if (data.state !== "ready") return;
  const action = "request" in data ? decision === "decline" ? data.declineAction : data.approveAction : data.action;
  if (!action?.available) return;
  const report = reportOf(data), scope = { componentId: data.id, componentRevision: data.revision,
    reportId: report.id, reportRevision: report.revision, actionId: action.id, actionRevision: action.revision };
  if ("access" in data) return { type: "request-data-access-review", data: scope };
  if ("boundary" in data) return { type: "request-privacy-review", data: scope };
  if ("request" in data) {
    if (decision === "decline") return { type: "decline-consent-request", data: scope };
    const scopes = data.request.scopes;
    if (!acknowledged || !selected.length || new Set(selected).size !== selected.length
      || selected.some(id => !scopes.some(item => item.id === id && item.available))
      || scopes.some(item => item.required && (!item.available || !selected.includes(item.id)))) return;
    return { type: "request-consent-approval", data: { ...scope, scopes: scopes.filter(item => selected.includes(item.id)).map(item => ({ scopeId: item.id, scopeRevision: item.revision })) } };
  }
  if (!acknowledged) return;
  return { type: "request-context-handoff", data: { ...scope, sections: data.preview.sections.map(item => ({ sectionId: item.id, sectionRevision: item.revision })) } };
}
function usePrivacyRequest(onAction: UIProps["onAction"], externalBusy: boolean) {
  const current = useRef({ callback: onAction, generation: 0, active: false, mounted: true });
  if (current.current.callback !== onAction) current.current = { ...current.current, callback: onAction, generation: current.current.generation + 1, active: false };
  const [feedback, setFeedback] = useState<{ generation: number; pending: boolean; error?: string }>({ generation: 0, pending: false });
  useEffect(() => {
    current.current.mounted = true;
    return () => { current.current.mounted = false; current.current.generation += 1; current.current.active = false; };
  }, []);
  const send = (intent: PrivacyContextIntent | undefined) => {
    if (!intent || !onAction || externalBusy || current.current.active || !current.current.mounted) return false;
    const generation = current.current.generation + 1;
    current.current.generation = generation; current.current.active = true;
    const live = () => current.current.mounted && current.current.generation === generation && current.current.callback === onAction;
    const settle = (failed: boolean) => {
      if (!live()) return;
      current.current.active = false;
      setFeedback({ generation, pending: false, error: failed ? "The request could not be completed. Review and try again." : undefined });
    };
    setFeedback({ generation, pending: false });
    try {
      const result: unknown = onAction(intent);
      if (result && typeof (result as PromiseLike<unknown>).then === "function") {
        if (live()) setFeedback({ generation, pending: true });
        void Promise.resolve(result).then(() => settle(false), () => settle(true));
      } else settle(false);
    } catch { settle(true); }
    return true;
  };
  const visible = feedback.generation === current.current.generation;
  return { send, busy: externalBusy || visible && feedback.pending, error: visible ? feedback.error : undefined };
}
function CompleteValue({ label, value }: { label: string; value: InspectableJSON }) {
  return <div className="mcpcn-pc-json" role="region" aria-label={`Complete JSON: ${label}`} tabIndex={0}><pre>{JSON.stringify(value, null, 2)}</pre></div>;
}
function Report({ data }: { data: Ready }) {
  if ("access" in data) return <><p>Requester: <strong>{data.access.requesterLabel}</strong></p><p className="mcpcn-pc-text">Purpose: {data.access.purpose}</p>
    <p>Reported access status: <strong>{data.access.reportedStatus}</strong></p>
    {data.access.resources.map(item => <section key={item.id} aria-label={`Reported resource: ${item.label}`}><h5>{item.label}</h5>
      <p>Reported operation: <strong>{item.operation}</strong></p><p>Reported record count: {item.reportedRecordCount === undefined ? "Not supplied" : item.reportedRecordCount}</p>
      <h6>Supplied field metadata</h6>{item.fields.length ? <ul>{item.fields.map(field => <li key={field.id}>{field.label}</li>)}</ul> : <p>No field metadata supplied.</p>}</section>)}
    <p className="mcpcn-hint">This report does not read records or grant access. The consumer must enforce authorization.</p></>;
  if ("boundary" in data) return <>{data.boundary.entries.map(item => <section key={item.id} aria-label={`Reported boundary: ${item.label}`}><h5>{item.label}</h5>
    <p>Reported visibility: <strong>{item.visibility}</strong></p>{item.visibility === "server-only" ? <><p>Server-only metadata; no value supplied to this view.</p>
      {item.description !== undefined && <p className="mcpcn-pc-text">{item.description}</p>}</> : <CompleteValue label={item.label} value={item.value} />}</section>)}
    <p className="mcpcn-hint">Visibility labels are consumer reports. They do not enforce isolation or send context. Keep server-only values out of the client payload.</p></>;
  if ("request" in data) return <><p>Recipient: <strong>{data.request.recipientLabel}</strong></p><p className="mcpcn-pc-text">Purpose: {data.request.purpose}</p>
    <p>Reported consent decision: <strong>{data.request.reportedDecision}</strong></p><p className="mcpcn-hint">Choose current scopes and acknowledge them before requesting approval. A request does not grant or revoke access.</p></>;
  return <><p>Proposed recipient: <strong>{data.preview.recipientLabel}</strong></p><p className="mcpcn-pc-text">Purpose: {data.preview.purpose}</p>
    <p>Reported token estimate: {data.preview.reportedTokenEstimate === undefined ? "Not supplied" : data.preview.reportedTokenEstimate}</p>
    <p className="mcpcn-hint">The estimate is supplied, not calculated or a billing quote.</p><h5>Complete supplied planned context</h5>
    {data.preview.sections.map(item => <section key={item.id} aria-label={`Planned context: ${item.label}`}><h6>{item.label}</h6><CompleteValue label={item.label} value={item.value} /></section>)}
    <h5>Excluded item metadata</h5>{data.preview.excluded.length ? <ul>{data.preview.excluded.map(item => <li key={item.id}><strong>{item.label}</strong><p className="mcpcn-pc-text">{item.reason}</p></li>)}</ul> : <p>No excluded item metadata supplied.</p>}
    <p className="mcpcn-hint">This preview does not send data or update model context. The consumer owns any later handoff and authorization.</p></>;
}
function PrivacyCard({ data, ui }: { data: ParsedPrivacyContextData; ui: UIProps }) {
  const request = usePrivacyRequest(ui.onAction, Boolean(ui.busy));
  const [stored, setStored] = useState({ callback: ui.onAction, selected: [] as string[], acknowledged: false });
  const draft = stored.callback === ui.onAction ? stored : { callback: ui.onAction, selected: [] as string[], acknowledged: false };
  if (stored !== draft) setStored(draft);
  const send = (decision: "approve" | "decline" = "approve") => {
    if (request.send(privacyContextIntent(data, draft.selected, draft.acknowledged, decision))) setStored({ callback: ui.onAction, selected: [], acknowledged: false });
  };
  const ready = data.state === "ready", consent = ready && "request" in data ? data : undefined, context = ready && "preview" in data;
  const mainAction = ready ? consent ? consent.approveAction : "action" in data ? data.action : undefined : undefined;
  return <Card className={["mcpcn-pc", ui.className].filter(Boolean).join(" ")} role="region" aria-label={data.title} aria-busy={request.busy}>
    <div className="mcpcn-header"><div className="mcpcn-row mcpcn-between"><h3 className="mcpcn-title">{data.title}</h3><Badge>{data.state}</Badge></div>
      {data.description !== undefined && <p className="mcpcn-description">{data.description}</p>}</div>
    <div className="mcpcn-body mcpcn-stack">{ready ? <><h4>{reportOf(data).label}</h4><Report data={data} />
      {consent && <fieldset className="mcpcn-pc-scopes" disabled={request.busy}><legend>Current requested scopes</legend>{consent.request.scopes.map(item => <label key={item.id}>
        <span className="mcpcn-row"><input type="checkbox" aria-label={`Select scope: ${item.label}`} checked={draft.selected.includes(item.id)} disabled={!item.available || request.busy}
          onChange={event => { const checked = event.currentTarget.checked; setStored(value => ({ ...value, acknowledged: false, selected: checked ? [...value.selected, item.id] : value.selected.filter(id => id !== item.id) })); }} />
          <strong>{item.label}</strong></span><span>{item.required ? "Required" : "Optional"}; {item.available ? "Available" : "Unavailable"}</span>
        {item.description !== undefined && <span className="mcpcn-pc-text">{item.description}</span>}</label>)}
        {consent.request.scopes.some(item => item.required && !item.available) && <p role="status">A required scope is unavailable. Approval cannot be requested.</p>}</fieldset>}
      {(consent || context) && <label className="mcpcn-row"><input type="checkbox" aria-label="Acknowledge current review" checked={draft.acknowledged} disabled={request.busy}
        onChange={event => { const acknowledged = event.currentTarget.checked; setStored(value => ({ ...value, acknowledged })); }} />
        {consent ? "I reviewed and agree to request approval for the selected current scopes." : "I reviewed the complete supplied context preview."}</label>}
    </> : <p role={data.state === "error" ? "alert" : "status"}>{data.message ?? (data.state === "loading" ? "Waiting for the supplied privacy report." : "No privacy report supplied.")}</p>}
      <Feedback busy={request.busy} error={ui.error ?? request.error} /></div>
    {ready && (mainAction || consent?.declineAction) && <div className="mcpcn-footer mcpcn-row">
      {mainAction && <Button type="button" disabled={!privacyContextIntent(data, draft.selected, draft.acknowledged) || request.busy || !ui.onAction} onClick={() => send()}>{mainAction.label}</Button>}
      {consent?.declineAction && <Button type="button" disabled={!consent.declineAction.available || request.busy || !ui.onAction} onClick={() => send("decline")}>{consent.declineAction.label}</Button>}
    </div>}
  </Card>;
}
type Schema = { safeParse(value: unknown): { success: true; data: ParsedPrivacyContextData } | { success: false; error: { issues: Array<{ message: string }> } } };
function renderPrivacy(props: ComponentProps<PrivacyContextData>, schema: Schema) {
  const parsed = schema.safeParse(ownData(props));
  if (!parsed.success) return <InvalidPayload title="Privacy report is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <PrivacyCard key={JSON.stringify(parsed.data)} data={parsed.data} ui={props} />;
}
export function DataAccessNotice(props: ComponentProps<DataAccessNoticeData>) { return renderPrivacy(props, DataAccessNoticeSchema); }
export function PrivacyBoundaryCard(props: ComponentProps<PrivacyBoundaryCardData>) { return renderPrivacy(props, PrivacyBoundaryCardSchema); }
export function ConsentPanel(props: ComponentProps<ConsentPanelData>) { return renderPrivacy(props, ConsentPanelSchema); }
export function ModelContextPreview(props: ComponentProps<ModelContextPreviewData>) { return renderPrivacy(props, ModelContextPreviewSchema); }

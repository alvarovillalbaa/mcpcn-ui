"use client";

import { useEffect, useRef, useState } from "react";
import {
  BillingGateSchema, UnsupportedHostNoticeSchema, NoDataStateSchema, LoadingBridgeStateSchema,
  OfflineStateSchema, PermissionDeniedStateSchema, ExpiredSessionStateSchema,
  type BillingGateData, type UnsupportedHostNoticeData, type NoDataStateData, type LoadingBridgeStateData,
  type OfflineStateData, type PermissionDeniedStateData, type ExpiredSessionStateData,
  type HostStateData, type ParsedHostStateData, type HostStateIntent,
} from "@mcpcn/schemas";
import { Badge, Button, Card, InvalidPayload } from "./primitives.js";
import { Feedback } from "./component-helpers.js";
import type { ComponentProps } from "./component-types.js";

type UIProps = Pick<ComponentProps<unknown>, "className" | "busy" | "error" | "onAction">;
const requests = {
  "billing-required": "request-billing-review", "unsupported-host": "request-compatible-host", empty: "request-data-refresh",
  waiting: "request-bridge-recheck", offline: "request-reconnect", denied: "request-access-review", expired: "request-session-renewal",
} as const;

function ownData(props: object): unknown {
  try {
    const descriptors = Object.getOwnPropertyDescriptors(props), data: object = Object.create(Object.getPrototypeOf(props));
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = Object.getOwnPropertyDescriptor(descriptors, key)?.value as PropertyDescriptor | undefined;
      if (!descriptor) return null;
      if (typeof key === "string" && (["className", "busy", "error", "onAction"].includes(key) || key === "key" && !descriptor.enumerable)) continue;
      Object.defineProperty(data, key, descriptor);
    }
    return data;
  } catch { return null; }
}

export function hostStateIntent(data: ParsedHostStateData): HostStateIntent | undefined {
  if (!data.action?.available) return undefined;
  return { type: requests[data.state], data: { componentId: data.id, componentRevision: data.revision, actionId: data.action.id, actionRevision: data.action.revision } };
}

/** A callback replacement invalidates its old settlements, even after A/B/A. */
function useHostRequest(onAction: UIProps["onAction"], externalBusy: boolean) {
  const current = useRef({ callback: onAction, generation: 0, active: false, mounted: true });
  if (current.current.callback !== onAction) current.current = { ...current.current, callback: onAction, generation: current.current.generation + 1, active: false };
  const [feedback, setFeedback] = useState<{ generation: number; pending: boolean; error?: string }>({ generation: 0, pending: false });
  useEffect(() => {
    current.current.mounted = true;
    return () => { current.current.mounted = false; current.current.generation += 1; current.current.active = false; };
  }, []);
  const send = (intent: HostStateIntent | undefined) => {
    if (!intent || !onAction || externalBusy || current.current.active || !current.current.mounted) return;
    const generation = current.current.generation + 1;
    current.current.generation = generation; current.current.active = true;
    const live = () => current.current.mounted && current.current.generation === generation && current.current.callback === onAction;
    const settle = (failed: boolean) => {
      if (!live()) return;
      current.current.active = false;
      setFeedback({ generation, pending: false, error: failed ? "The action could not be completed. Try again." : undefined });
    };
    setFeedback({ generation, pending: false });
    try {
      const result: unknown = onAction(intent);
      if (result && typeof (result as PromiseLike<unknown>).then === "function") {
        if (live()) setFeedback({ generation, pending: true });
        void Promise.resolve(result).then(() => settle(false), () => settle(true));
      } else settle(false);
    } catch { settle(true); }
  };
  const visible = feedback.generation === current.current.generation;
  return { send, busy: externalBusy || visible && feedback.pending, error: visible ? feedback.error : undefined };
}

function HostDetails({ data }: { data: ParsedHostStateData }) {
  switch (data.state) {
    case "billing-required": return <><p>Feature: <strong>{data.featureLabel}</strong></p>
      <p>Reported current plan: {data.currentPlan ?? "Not supplied"}</p><p>Reported required plan: {data.requiredPlan ?? "Not supplied"}</p>
      <p className="mcpcn-hint">A billing review request does not create a subscription, charge or purchase.</p></>;
    case "unsupported-host": return <><p>Reported host: <strong>{data.hostLabel}</strong></p><h4>Reported capability requirements</h4>
      <ul>{data.requirements.map(item => <li key={item.id}><strong>{item.label}</strong>: {item.reportedSupport}</li>)}</ul>
      <p className="mcpcn-hint">Host capabilities are supplied by the consumer; this notice does not probe or change the host.</p></>;
    case "empty": return <><p>Collection: <strong>{data.collectionLabel}</strong></p><p>Reported reason: {({ "no-records": "No records", "no-matches": "No matches", "not-yet-provided": "Data not yet provided" })[data.reason]}</p>
      {data.querySummary !== undefined && <p>Reported query: {data.querySummary}</p>}<p className="mcpcn-hint">No data fetch or empty-result inference is performed by this component.</p></>;
    case "waiting": return <><p>Bridge: <strong>{data.bridgeLabel}</strong></p><p>Reported phase: {({ connecting: "Connecting", "awaiting-host": "Awaiting host", "awaiting-tool-result": "Awaiting tool result" })[data.phase]}</p>
      <p>Reported elapsed time: {data.elapsedMs === undefined ? "Not supplied" : `${data.elapsedMs} ms`}</p>
      {data.progress ? <div><p>Reported work: {data.progress.completed} of {data.progress.total}</p><progress value={data.progress.completed} max={data.progress.total} aria-label="Reported bridge work" /></div> : <p>Reported work: Not supplied</p>}
      <p className="mcpcn-hint">Reported work does not establish bridge readiness. No timer or connection is started.</p></>;
    case "offline": return <><p>Service: <strong>{data.serviceLabel}</strong></p><p>Reported unsent changes: {data.unsentChanges === undefined ? "Not supplied" : data.unsentChanges}</p>
      <p className="mcpcn-hint">Connectivity and pending data are consumer reports. This component does not reconnect, send or discard changes.</p></>;
    case "denied": return <><p>Resource: <strong>{data.resourceLabel}</strong></p>{data.requesterLabel !== undefined && <p>Reported requester: {data.requesterLabel}</p>}
      <h4>Reported requested scopes</h4>{data.scopes.length ? <ul>{data.scopes.map(item => <li key={item.id}>{item.label}</li>)}</ul> : <p>No requested scopes were supplied.</p>}
      <p className="mcpcn-hint">Review intent grants no permission and does not change the current access decision.</p></>;
    case "expired": return <><p>Service: <strong>{data.serviceLabel}</strong></p><p>Reported expiry: {data.expiredAt ? <time dateTime={data.expiredAt}>{data.expiredAt}</time> : "Not supplied"}</p>
      <p className="mcpcn-hint">Renewal intent does not inspect, renew or clear a session, collect credentials or redirect.</p></>;
  }
}

function HostStateCard({ data, ui }: { data: ParsedHostStateData; ui: UIProps }) {
  const action = useHostRequest(ui.onAction, Boolean(ui.busy));
  return <Card className={ui.className} role="region" aria-label={data.title} aria-busy={action.busy} style={{ overflowWrap: "anywhere" }}>
    <div className="mcpcn-header"><div className="mcpcn-row mcpcn-between"><h3 className="mcpcn-title">{data.title}</h3><Badge>{data.state}</Badge></div>
      {data.description !== undefined && <p className="mcpcn-description">{data.description}</p>}</div>
    <div className="mcpcn-body mcpcn-stack"><p role="status">{data.message}</p><HostDetails data={data} />
      {data.reportedAt && <p>Reported at: <time dateTime={data.reportedAt}>{data.reportedAt}</time></p>}
      <Feedback busy={action.busy} error={ui.error ?? action.error} />
      {!data.action && <p className="mcpcn-hint">No action was supplied.</p>}</div>
    {data.action && <div className="mcpcn-footer"><Button type="button" disabled={!data.action.available || action.busy || !ui.onAction} onClick={() => action.send(hostStateIntent(data))}>{data.action.label}</Button></div>}
  </Card>;
}

type HostSchema = { safeParse(value: unknown): { success: true; data: ParsedHostStateData } | { success: false; error: { issues: Array<{ message: string }> } } };
function renderHost(props: ComponentProps<HostStateData>, schema: HostSchema) {
  const parsed = schema.safeParse(ownData(props));
  if (!parsed.success) return <InvalidPayload title="Reported host state is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <HostStateCard key={JSON.stringify(parsed.data)} data={parsed.data} ui={props} />;
}
export function BillingGate(props: ComponentProps<BillingGateData>) { return renderHost(props, BillingGateSchema); }
export function UnsupportedHostNotice(props: ComponentProps<UnsupportedHostNoticeData>) { return renderHost(props, UnsupportedHostNoticeSchema); }
export function NoDataState(props: ComponentProps<NoDataStateData>) { return renderHost(props, NoDataStateSchema); }
export function LoadingBridgeState(props: ComponentProps<LoadingBridgeStateData>) { return renderHost(props, LoadingBridgeStateSchema); }
export function OfflineState(props: ComponentProps<OfflineStateData>) { return renderHost(props, OfflineStateSchema); }
export function PermissionDeniedState(props: ComponentProps<PermissionDeniedStateData>) { return renderHost(props, PermissionDeniedStateSchema); }
export function ExpiredSessionState(props: ComponentProps<ExpiredSessionStateData>) { return renderHost(props, ExpiredSessionStateSchema); }

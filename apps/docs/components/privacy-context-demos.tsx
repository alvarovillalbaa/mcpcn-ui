"use client";

import { useCallback, useRef, useState } from "react";
import * as UI from "@mcpcn/react";
import type { DataAccessNoticeData, PrivacyBoundaryCardData, ConsentPanelData, ModelContextPreviewData, PrivacyContextData } from "@mcpcn/schemas";
import { privacyContextExamples, privacyContextNames, type PrivacyContextSlug } from "./privacy-context-examples";

type Mode = "immediate" | "hold" | "throw";
type Pending = { resolve: () => void; reject: () => void };
export function PrivacyContextDemo({ kind }: { kind: PrivacyContextSlug }) {
  const initial = privacyContextExamples[kind];
  const [data, setData] = useState<PrivacyContextData>(() => structuredClone(initial));
  const [mode, setMode] = useState<Mode>("immediate"), [callback, setCallback] = useState(true), [busy, setBusy] = useState(false), [mounted, setMounted] = useState(true), [invalid, setInvalid] = useState(false);
  const [version, setVersion] = useState(1), [count, setCount] = useState(0), [settled, setSettled] = useState(0), [pendingCount, setPendingCount] = useState(0), [last, setLast] = useState<UI.ComponentAction>();
  const pending = useRef<Pending[]>([]);
  const candidateReceiver = useCallback((intent: UI.ComponentAction) => {
    setCount(value => value + 1); setLast(intent);
    if (mode === "throw") throw new Error("Authored private exception must not appear in privacy feedback");
    if (mode !== "hold") return;
    setPendingCount(value => value + 1);
    return new Promise<void>((resolve, reject) => pending.current.push({ resolve, reject }));
  }, [mode, version]);
  // Six authored mode/version pairs preserve actual callback identity on A/B/A.
  const receivers = useRef(new Map<string, typeof candidateReceiver>());
  const receiverKey = `${mode}:${version}`;
  if (!receivers.current.has(receiverKey)) receivers.current.set(receiverKey, candidateReceiver);
  const receive = receivers.current.get(receiverKey)!;
  const settle = (failed: boolean) => {
    const oldest = pending.current.shift(); if (!oldest) return;
    setPendingCount(value => value - 1); setSettled(value => value + 1);
    if (failed) oldest.reject(); else oldest.resolve();
  };
  const state = (next: PrivacyContextData["state"]) => {
    if (next === "ready") setData(structuredClone(initial));
    else setData({ id: initial.id, revision: initial.revision, title: initial.title, state: next, message: `Authored ${next} privacy state.` });
  };
  const replace = (revision: boolean) => setData(value => {
    if (value.state !== "ready") return value;
    const next = structuredClone(value), report = "access" in next ? next.access : "boundary" in next ? next.boundary : "request" in next ? next.request : next.preview;
    if (revision) report.revision = report.revision === "1" ? "2" : "1";
    else report.label = report.label.endsWith("(changed)") ? report.label.slice(0, -10) : report.label + " (changed)";
    return next;
  });
  const shown = invalid ? { ...data, unexpectedField: "Malformed authored DTO" } : data;
  const common = { busy, onAction: callback ? receive : undefined };
  const views = {
    "data-access-notice": <UI.DataAccessNotice {...shown as DataAccessNoticeData} {...common} />,
    "privacy-boundary-card": <UI.PrivacyBoundaryCard {...shown as PrivacyBoundaryCardData} {...common} />,
    "consent-panel": <UI.ConsentPanel {...shown as ConsentPanelData} {...common} />,
    "model-context-preview": <UI.ModelContextPreview {...shown as ModelContextPreviewData} {...common} />,
  };
  const action = data.state === "ready" ? "request" in data ? data.approveAction : data.action : undefined;
  return <section aria-label={`${privacyContextNames[kind]} demonstration`} className="mcpcn-stack">
    <p>Review supplied metadata and values. Requests only update this authored demonstration.</p>
    <label>Report state <select aria-label="Privacy report state" value={data.state} onChange={event => state(event.currentTarget.value as PrivacyContextData["state"])}>
      <option value="ready">Ready</option><option value="loading">Loading</option><option value="empty">Empty</option><option value="error">Error</option></select></label>
    <label>Request response <select aria-label="Privacy request response" value={mode} onChange={event => setMode(event.currentTarget.value as Mode)}>
      <option value="immediate">Immediate</option><option value="hold">Hold until settled</option><option value="throw">Throw current request</option></select></label>
    <div className="mcpcn-row">
      <label><input type="checkbox" checked={callback} onChange={event => setCallback(event.currentTarget.checked)} />Callback enabled</label>
      <label><input type="checkbox" checked={busy} onChange={event => setBusy(event.currentTarget.checked)} />External busy</label>
      <label><input type="checkbox" checked={mounted} onChange={event => setMounted(event.currentTarget.checked)} />Mount component</label>
      <label><input type="checkbox" checked={invalid} onChange={event => setInvalid(event.currentTarget.checked)} />Malformed data</label>
      <label><input type="checkbox" disabled={data.state !== "ready" || !action} checked={Boolean(action?.available)} onChange={event => {
        const available = event.currentTarget.checked; setData(value => {
          if (value.state !== "ready") return value;
          if ("request" in value) return { ...value, approveAction: value.approveAction && { ...value.approveAction, available } };
          return { ...value, action: value.action && { ...value.action, available } };
        });
      }} />Action available</label>
      {kind === "consent-panel" && <label><input type="checkbox" aria-label="Required scope available" checked={data.state === "ready" && "request" in data && Boolean(data.request.scopes[0]?.available)} onChange={event => {
        const available = event.currentTarget.checked; setData(value => value.state === "ready" && "request" in value ? { ...value, request: { ...value.request, scopes: value.request.scopes.map((item, index) => index ? item : { ...item, available }) } } : value);
      }} />Required scope available</label>}
    </div>
    <div className="mcpcn-row">
      <button type="button" onClick={() => replace(true)}>Replace report revision</button><button type="button" onClick={() => replace(false)}>Replace supplied content</button>
      <button type="button" onClick={() => setVersion(value => value === 1 ? 2 : 1)}>Replace callback</button>
      <button type="button" onClick={() => setData(value => {
        if (value.state !== "ready") return value;
        const next = structuredClone(value);
        if ("access" in next) delete next.access.resources[0]!.reportedRecordCount;
        if ("preview" in next) delete next.preview.reportedTokenEstimate;
        return next;
      })}>Remove reported count</button>
      <button type="button" onClick={() => setData(value => {
        if (value.state !== "ready") return value;
        if ("request" in value) { const { approveAction: _approve, declineAction: _decline, ...rest } = value; return rest; }
        const { action: _action, ...rest } = value; return rest;
      })}>Remove supplied actions</button>
      <button type="button" disabled={!pendingCount} onClick={() => settle(false)}>Resolve oldest request</button>
      <button type="button" disabled={!pendingCount} onClick={() => settle(true)}>Reject oldest request</button>
    </div>
    {mounted ? views[kind] : <p role="status">The privacy report is unmounted.</p>}
    <div className="mcpcn-row"><output aria-label="Privacy intent count">{count}</output><output aria-label="Settled privacy requests">{settled}</output><output aria-label="Pending privacy requests">{pendingCount}</output></div>
    <pre className="mcpcn-code" aria-label="Last privacy intent">{last ? JSON.stringify(last, null, 2) : "No request sent."}</pre>
  </section>;
}

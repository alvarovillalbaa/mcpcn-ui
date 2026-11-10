"use client";

import { useCallback, useRef, useState } from "react";
import * as UI from "@mcpcn/react";
import { hostStateExamples, hostStateNames, type HostStateSlug } from "./host-state-examples";
import type { HostStateData, BillingGateData, UnsupportedHostNoticeData, NoDataStateData, LoadingBridgeStateData, OfflineStateData, PermissionDeniedStateData, ExpiredSessionStateData } from "@mcpcn/schemas";

type Mode = "immediate" | "hold" | "throw";
type Pending = { resolve: () => void; reject: () => void };
export function HostStateDemo({ kind }: { kind: HostStateSlug }) {
  const initial = hostStateExamples[kind];
  const [data, setData] = useState<HostStateData>(() => structuredClone(initial));
  const [mode, setMode] = useState<Mode>("immediate"), [callback, setCallback] = useState(true), [busy, setBusy] = useState(false), [mounted, setMounted] = useState(true), [invalid, setInvalid] = useState(false);
  const [callbackVersion, setCallbackVersion] = useState(1), [count, setCount] = useState(0), [settled, setSettled] = useState(0), [pendingCount, setPendingCount] = useState(0), [last, setLast] = useState<UI.ComponentAction>();
  const pending = useRef<Pending[]>([]);
  const receive = useCallback((intent: UI.ComponentAction) => {
    setCount(value => value + 1); setLast(intent);
    if (mode === "throw") throw new Error("Authored private exception must not appear in component feedback");
    if (mode !== "hold") return;
    setPendingCount(value => value + 1);
    return new Promise<void>((resolve, reject) => pending.current.push({ resolve, reject }));
  }, [mode, callbackVersion]);
  const settle = (failed: boolean) => {
    const oldest = pending.current.shift(); if (!oldest) return;
    setPendingCount(value => value - 1); setSettled(value => value + 1);
    if (failed) oldest.reject(); else oldest.resolve();
  };
  const common = { onAction: callback ? receive : undefined, busy };
  const shown = invalid ? { ...data, unexpectedField: "invalid authored DTO" } : data;
  const components = {
    "billing-gate": <UI.BillingGate {...shown as BillingGateData} {...common} />,
    "unsupported-host-notice": <UI.UnsupportedHostNotice {...shown as UnsupportedHostNoticeData} {...common} />,
    "no-data-state": <UI.NoDataState {...shown as NoDataStateData} {...common} />,
    "loading-bridge-state": <UI.LoadingBridgeState {...shown as LoadingBridgeStateData} {...common} />,
    "offline-state": <UI.OfflineState {...shown as OfflineStateData} {...common} />,
    "permission-denied-state": <UI.PermissionDeniedState {...shown as PermissionDeniedStateData} {...common} />,
    "expired-session-state": <UI.ExpiredSessionState {...shown as ExpiredSessionStateData} {...common} />,
  };
  return <section aria-label={`${hostStateNames[kind]} demonstration`} className="mcpcn-stack">
    <p>Explore the reported state and request review. Requests only update this demonstration.</p>
    <label>Request response <select aria-label="Host-state request response" value={mode} onChange={event => setMode(event.currentTarget.value as Mode)}><option value="immediate">Immediate</option><option value="hold">Hold until settled</option><option value="throw">Throw current request</option></select></label>
    <div className="mcpcn-row">
      <label><input type="checkbox" checked={callback} onChange={event => setCallback(event.currentTarget.checked)} />Callback enabled</label>
      <label><input type="checkbox" checked={busy} onChange={event => setBusy(event.currentTarget.checked)} />External busy</label>
      <label><input type="checkbox" checked={mounted} onChange={event => setMounted(event.currentTarget.checked)} />Mount component</label>
      <label><input type="checkbox" checked={invalid} onChange={event => setInvalid(event.currentTarget.checked)} />Malformed data</label>
      <label><input type="checkbox" checked={Boolean(data.action?.available)} onChange={event => setData(value => ({ ...value, action: { ...initial.action, available: event.currentTarget.checked } }))} />Action available</label>
    </div>
    <div className="mcpcn-row"><button type="button" onClick={() => setData(value => ({ ...value, revision: value.revision === "1" ? "2" : "1" }))}>Replace report revision</button>
      <button type="button" onClick={() => setCallbackVersion(value => value + 1)}>Replace callback</button>
      <button type="button" onClick={() => setData(value => { const { action: _action, ...rest } = value; return rest; })}>Remove supplied action</button>
      <button type="button" disabled={!pendingCount} onClick={() => settle(false)}>Resolve oldest request</button>
      <button type="button" disabled={!pendingCount} onClick={() => settle(true)}>Reject oldest request</button></div>
    {mounted ? components[kind] : <p role="status">The host-state component is unmounted.</p>}
    <div className="mcpcn-row"><output aria-label="Host-state intent count">{count}</output><output aria-label="Settled host-state requests">{settled}</output><output aria-label="Pending host-state requests">{pendingCount}</output></div>
    <pre className="mcpcn-code" aria-label="Last host-state intent">{last ? JSON.stringify(last, null, 2) : "No request sent."}</pre>
  </section>;
}

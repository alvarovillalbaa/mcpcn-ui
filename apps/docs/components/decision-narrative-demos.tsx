"use client";

import { useCallback, useRef, useState } from "react";
import * as UI from "@mcpcn/react";
import type { RecommendationCardData, TradeoffPanelData, DecisionMemoData, ReasoningSummaryData, DecisionNarrativeData } from "@mcpcn/schemas";
import { decisionNarrativeExamples, decisionNarrativeNames, type DecisionNarrativeSlug } from "./decision-narrative-examples";

type Mode = "immediate" | "hold" | "throw";
type Pending = { resolve: () => void; reject: () => void };
export function DecisionNarrativeDemo({ kind }: { kind: DecisionNarrativeSlug }) {
  const initial = decisionNarrativeExamples[kind];
  const [data, setData] = useState<DecisionNarrativeData>(() => structuredClone(initial));
  const [mode, setMode] = useState<Mode>("immediate"), [callback, setCallback] = useState(true), [busy, setBusy] = useState(false), [mounted, setMounted] = useState(true), [invalid, setInvalid] = useState(false);
  const [version, setVersion] = useState(1), [count, setCount] = useState(0), [settled, setSettled] = useState(0), [pendingCount, setPendingCount] = useState(0), [last, setLast] = useState<UI.ComponentAction>();
  const pending = useRef<Pending[]>([]);
  const receive = useCallback((intent: UI.ComponentAction) => {
    setCount(value => value + 1); setLast(intent);
    if (mode === "throw") throw new Error("Authored private exception must not appear in report feedback");
    if (mode !== "hold") return;
    setPendingCount(value => value + 1);
    return new Promise<void>((resolve, reject) => pending.current.push({ resolve, reject }));
  }, [mode, version]);
  const settle = (failed: boolean) => {
    const oldest = pending.current.shift(); if (!oldest) return;
    setPendingCount(value => value - 1); setSettled(value => value + 1);
    if (failed) oldest.reject(); else oldest.resolve();
  };
  const state = (next: DecisionNarrativeData["state"]) => {
    if (next === "ready") setData(structuredClone(initial));
    else setData({ id: initial.id, revision: initial.revision, title: initial.title, state: next, message: `Authored ${next} report state.` });
  };
  const replaceReport = () => setData(value => {
    if (value.state !== "ready") return value;
    const next = structuredClone(value), report = "recommendation" in next ? next.recommendation : "analysis" in next ? next.analysis : "memo" in next ? next.memo : next.summary;
    report.revision = report.revision === "1" ? "2" : "1"; return next;
  });
  const removeConfidence = () => setData(value => {
    if (value.state !== "ready") return value;
    const next = structuredClone(value), field = "recommendation" in next ? next.recommendation.option : "analysis" in next ? next.analysis.options[0]?.option : "memo" in next ? next.memo.options[0] : next.summary.points[0]?.finding;
    if (field) delete field.confidence; return next;
  });
  const shown = invalid ? { ...data, unexpectedField: "Malformed authored DTO" } : data;
  const common = { busy, onAction: callback ? receive : undefined };
  const views = {
    "recommendation-card": <UI.RecommendationCard {...shown as RecommendationCardData} {...common} />,
    "tradeoff-panel": <UI.TradeoffPanel {...shown as TradeoffPanelData} {...common} />,
    "decision-memo": <UI.DecisionMemo {...shown as DecisionMemoData} {...common} />,
    "reasoning-summary": <UI.ReasoningSummary {...shown as ReasoningSummaryData} {...common} />,
  };
  return <section aria-label={`${decisionNarrativeNames[kind]} demonstration`} className="mcpcn-stack">
    <p>Read the supplied report and request review. Requests only update this authored demonstration.</p>
    <label>Report state <select aria-label="Decision report state" value={data.state} onChange={event => state(event.currentTarget.value as DecisionNarrativeData["state"])}>
      <option value="ready">Ready</option><option value="loading">Loading</option><option value="empty">Empty</option><option value="error">Error</option></select></label>
    <label>Request response <select aria-label="Decision request response" value={mode} onChange={event => setMode(event.currentTarget.value as Mode)}>
      <option value="immediate">Immediate</option><option value="hold">Hold until settled</option><option value="throw">Throw current request</option></select></label>
    <div className="mcpcn-row">
      <label><input type="checkbox" checked={callback} onChange={event => setCallback(event.currentTarget.checked)} />Callback enabled</label>
      <label><input type="checkbox" checked={busy} onChange={event => setBusy(event.currentTarget.checked)} />External busy</label>
      <label><input type="checkbox" checked={mounted} onChange={event => setMounted(event.currentTarget.checked)} />Mount component</label>
      <label><input type="checkbox" checked={invalid} onChange={event => setInvalid(event.currentTarget.checked)} />Malformed data</label>
      <label><input type="checkbox" disabled={data.state !== "ready" || !data.action} checked={data.state === "ready" && Boolean(data.action?.available)} onChange={event => {
        const available = event.currentTarget.checked; setData(value => value.state === "ready" ? { ...value, action: { ...initial.action, available } } : value);
      }} />Action available</label>
    </div>
    <div className="mcpcn-row">
      <button type="button" onClick={replaceReport}>Replace report revision</button><button type="button" onClick={() => setVersion(value => value + 1)}>Replace callback</button>
      <button type="button" onClick={removeConfidence}>Remove supplied confidence</button>
      <button type="button" onClick={() => setData(value => { if (value.state !== "ready") return value; const { action: _action, ...rest } = value; return rest; })}>Remove supplied action</button>
      <button type="button" disabled={!pendingCount} onClick={() => settle(false)}>Resolve oldest request</button>
      <button type="button" disabled={!pendingCount} onClick={() => settle(true)}>Reject oldest request</button>
    </div>
    {mounted ? views[kind] : <p role="status">The decision report is unmounted.</p>}
    <div className="mcpcn-row"><output aria-label="Decision intent count">{count}</output><output aria-label="Settled decision requests">{settled}</output><output aria-label="Pending decision requests">{pendingCount}</output></div>
    <pre className="mcpcn-code" aria-label="Last decision intent">{last ? JSON.stringify(last, null, 2) : "No request sent."}</pre>
  </section>;
}

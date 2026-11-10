"use client";

import { useEffect, useRef, useState } from "react";
import { RecommendationCardSchema, TradeoffPanelSchema, DecisionMemoSchema, ReasoningSummarySchema,
  type RecommendationCardData, type TradeoffPanelData, type DecisionMemoData, type ReasoningSummaryData,
  type DecisionNarrativeData, type ParsedDecisionNarrativeData, type DecisionNarrativeIntent,
  type ParsedInspectionField } from "@mcpcn/schemas";
import { Badge, Button, Card, InvalidPayload } from "./primitives.js";
import { Feedback } from "./component-helpers.js";
import type { ComponentProps } from "./component-types.js";

type UIProps = Pick<ComponentProps<unknown>, "className" | "busy" | "error" | "onAction">;
type Ready = Extract<ParsedDecisionNarrativeData, { state: "ready" }>;
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
  if ("recommendation" in data) return data.recommendation;
  if ("analysis" in data) return data.analysis;
  if ("memo" in data) return data.memo;
  return data.summary;
}
export function decisionNarrativeIntent(data: ParsedDecisionNarrativeData): DecisionNarrativeIntent | undefined {
  if (data.state !== "ready" || !data.action?.available) return;
  const report = reportOf(data), scope = { componentId: data.id, componentRevision: data.revision,
    reportId: report.id, reportRevision: report.revision, actionId: data.action.id, actionRevision: data.action.revision };
  if ("recommendation" in data) return { type: "request-recommendation", data: { ...scope, optionId: data.recommendation.option.id, optionRevision: data.recommendation.option.revision } };
  return { type: "analysis" in data ? "request-tradeoff-review" : "memo" in data ? "request-decision-review" : "request-summary-review", data: scope };
}

function useNarrativeRequest(onAction: UIProps["onAction"], externalBusy: boolean) {
  const current = useRef({ callback: onAction, generation: 0, active: false, mounted: true });
  if (current.current.callback !== onAction) current.current = { ...current.current, callback: onAction, generation: current.current.generation + 1, active: false };
  const [feedback, setFeedback] = useState<{ generation: number; pending: boolean; error?: string }>({ generation: 0, pending: false });
  useEffect(() => {
    current.current.mounted = true;
    return () => { current.current.mounted = false; current.current.generation += 1; current.current.active = false; };
  }, []);
  const send = (intent: DecisionNarrativeIntent | undefined) => {
    if (!intent || !onAction || externalBusy || current.current.active || !current.current.mounted) return;
    const generation = current.current.generation + 1;
    current.current.generation = generation; current.current.active = true;
    const live = () => current.current.mounted && current.current.generation === generation && current.current.callback === onAction;
    const settle = (failed: boolean) => {
      if (!live()) return;
      current.current.active = false;
      setFeedback({ generation, pending: false, error: failed ? "The request could not be completed. Try again." : undefined });
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

function Notes({ title, values }: { title: string; values: string[] }) {
  return <section aria-label={title}><h5>{title}</h5>{values.length ? <ul>{values.map((value, index) => <li key={index} className="mcpcn-dn-text">{value}</li>)}</ul> : <p className="mcpcn-hint">None supplied.</p>}</section>;
}
function Value({ field }: { field: ParsedInspectionField }) {
  return <section className="mcpcn-dn-option" aria-label={`Complete supplied option: ${field.label}`}>
    <h4>{field.label}</h4><p>Reported confidence: {field.confidence === undefined ? "Not supplied" : `${field.confidence * 100}%`}</p>
    <div className="mcpcn-dn-json" role="region" aria-label={`Complete JSON: ${field.label}`} tabIndex={0}>
      <pre>{JSON.stringify(field.value, null, 2)}</pre></div>
    <h5>Supplied evidence</h5>{field.evidence.length ? <ul>{field.evidence.map(item => <li key={item.id}>
      <strong>{item.label}</strong>{item.text !== undefined && <p className="mcpcn-dn-text">{item.text}</p>}
      {item.url !== undefined && <a href={item.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{item.url}</a>}
    </li>)}</ul> : <p className="mcpcn-hint">No evidence supplied.</p>}
  </section>;
}
function Narrative({ data }: { data: Ready }) {
  if ("recommendation" in data) {
    const value = data.recommendation;
    return <><Value field={value.option} /><h4>Supplied rationale</h4><p className="mcpcn-dn-text">{value.rationale}</p>
      <Notes title="Reported benefits" values={value.benefits} /><Notes title="Reported caveats" values={value.caveats} />
      <h4>Supplied alternatives</h4>{value.alternatives.length ? value.alternatives.map(option => <Value key={option.id} field={option} />) : <p>No alternatives supplied.</p>}</>;
  }
  if ("analysis" in data) return <div className="mcpcn-dn-grid">{data.analysis.options.map(value => <section key={value.option.id} aria-label={`Tradeoffs: ${value.option.label}`}>
    <Value field={value.option} /><Notes title="Reported benefits" values={value.benefits} /><Notes title="Reported costs" values={value.costs} />
    <Notes title="Reported uncertainties" values={value.uncertainties} /></section>)}</div>;
  if ("memo" in data) {
    const value = data.memo, chosen = value.options.find(option => option.id === value.decisionOptionId);
    return <><p>Reported memo status: <strong>{value.status}</strong></p><p>Reported decision: <strong>{chosen?.label ?? "No choice supplied"}</strong></p>
      <h4>Supplied context</h4><p className="mcpcn-dn-text">{value.context}</p><h4>Supplied rationale</h4><p className="mcpcn-dn-text">{value.rationale}</p>
      <h4>Considered options</h4>{value.options.map(option => <Value key={option.id} field={option} />)}<Notes title="Reported risks" values={value.risks} />
      <h4>Reported follow-ups</h4>{value.followUps.length ? <ul>{value.followUps.map(item => <li key={item.id}>{item.label}: <strong>{item.state}</strong></li>)}</ul> : <p>No follow-ups supplied.</p>}</>;
  }
  const value = data.summary;
  return <><p className="mcpcn-hint">Consumer-supplied user-facing rationale. This is not an internal model trace.</p>
    <h4>Supplied overview</h4><p className="mcpcn-dn-text">{value.overview}</p>
    {value.points.map(item => <section key={item.finding.id} aria-label={`Supplied finding: ${item.finding.label}`}><Value field={item.finding} />
      <h5>Supplied explanation</h5><p className="mcpcn-dn-text">{item.explanation}</p></section>)}<Notes title="Reported limitations" values={value.limitations} /></>;
}
function NarrativeCard({ data, ui }: { data: ParsedDecisionNarrativeData; ui: UIProps }) {
  const request = useNarrativeRequest(ui.onAction, Boolean(ui.busy));
  const report = data.state === "ready" ? reportOf(data) : undefined;
  return <Card className={["mcpcn-dn", ui.className].filter(Boolean).join(" ")} role="region" aria-label={data.title} aria-busy={request.busy}>
    <div className="mcpcn-header"><div className="mcpcn-row mcpcn-between"><h3 className="mcpcn-title">{data.title}</h3><Badge>{data.state}</Badge></div>
      {data.description !== undefined && <p className="mcpcn-description">{data.description}</p>}</div>
    <div className="mcpcn-body mcpcn-stack">{data.state === "ready" ? <><h4>{report!.label}</h4><Narrative data={data} />
      <p className="mcpcn-hint">Supplied claims and evidence are not verified here. A review request does not execute an action or change the reported decision.</p></>
      : <p role={data.state === "error" ? "alert" : "status"}>{data.message ?? (data.state === "loading" ? "Waiting for the supplied report." : "No report supplied.")}</p>}
      <Feedback busy={request.busy} error={ui.error ?? request.error} /></div>
    {data.state === "ready" && data.action && <div className="mcpcn-footer"><Button type="button" disabled={!data.action.available || request.busy || !ui.onAction}
      onClick={() => request.send(decisionNarrativeIntent(data))}>{data.action.label}</Button></div>}
  </Card>;
}
type Schema = { safeParse(value: unknown): { success: true; data: ParsedDecisionNarrativeData } | { success: false; error: { issues: Array<{ message: string }> } } };
function renderNarrative(props: ComponentProps<DecisionNarrativeData>, schema: Schema) {
  const parsed = schema.safeParse(ownData(props));
  if (!parsed.success) return <InvalidPayload title="Decision report is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <NarrativeCard key={JSON.stringify(parsed.data)} data={parsed.data} ui={props} />;
}
export function RecommendationCard(props: ComponentProps<RecommendationCardData>) { return renderNarrative(props, RecommendationCardSchema); }
export function TradeoffPanel(props: ComponentProps<TradeoffPanelData>) { return renderNarrative(props, TradeoffPanelSchema); }
export function DecisionMemo(props: ComponentProps<DecisionMemoData>) { return renderNarrative(props, DecisionMemoSchema); }
export function ReasoningSummary(props: ComponentProps<ReasoningSummaryData>) { return renderNarrative(props, ReasoningSummarySchema); }

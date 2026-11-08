"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ToolResultCard, RunningTaskCard, PartialResultViewer, QueuedStepList, ToolTraceViewer, type ComponentAction } from "@mcpcn/react";
import type { ToolResultCardData, RunningTaskCardData, PartialResultViewerData, QueuedStepListData, ToolTraceViewerData } from "@mcpcn/schemas";
import { toolWorkflowExamples, type ToolWorkflowSlug } from "./tool-workflow-examples";

type Data = Record<string, unknown>;
const object = (value: unknown): value is Data => value !== null && typeof value === "object" && !Array.isArray(value);

export function toolWorkflowSelection(slug: ToolWorkflowSlug, current: Data, action: ComponentAction): Data | undefined {
  const value = action.data;
  if (!object(value) || value.id !== current.id) return undefined;
  if (slug === "partial-result-viewer" && action.type === "select-result-part" && typeof value.partId === "string" && (current as PartialResultViewerData).parts.some(part => part.id === value.partId)) return { selectedPartId: value.partId };
  if (slug === "queued-step-list" && action.type === "select-queued-step" && typeof value.stepId === "string" && (current as QueuedStepListData).steps.some(step => step.id === value.stepId)) return { selectedStepId: value.stepId };
  if (slug === "tool-trace-viewer") {
    if (action.type === "change-trace-filter" && typeof value.kind === "string" && ["all", "input", "progress", "output", "error", "note"].includes(value.kind)) return { filterKind: value.kind };
    if (action.type === "select-trace-event" && typeof value.eventId === "string" && (current as ToolTraceViewerData).events.some(event => event.id === value.eventId)) return { selectedEventId: value.eventId };
  }
  return undefined;
}

function useFeedback() {
  const [last, setLast] = useState<ComponentAction | null>(null), [count, setCount] = useState(0), [settled, setSettled] = useState(0);
  const [response, setResponse] = useState<"immediate" | "delayed" | "reject">("immediate");
  const jobs = useRef(new Set<{ timer: ReturnType<typeof setTimeout>; resolve(): void }>());
  useEffect(() => () => {
    for (const job of jobs.current) { clearTimeout(job.timer); job.resolve(); }
    jobs.current.clear();
  }, []);
  const receive = (action: ComponentAction, controlled: boolean): void | Promise<void> => {
    setLast(action); setCount(value => value + 1);
    // Controlled selections/filtering never start a timer or disable native focus.
    if (controlled || response === "immediate") return;
    return new Promise<void>((resolve, reject) => {
      const job = { timer: setTimeout(() => {
        jobs.current.delete(job); setSettled(value => value + 1);
        if (response === "reject") reject(new Error("Authored consumer rejection")); else resolve();
      }, 1500), resolve };
      jobs.current.add(job);
    });
  };
  return { receive, reset: () => { setLast(null); setCount(0); }, controls: <label className="mcpcn-label">Consumer response<select aria-label="Consumer response" value={response} onChange={event => setResponse(event.currentTarget.value as typeof response)}>
    <option value="immediate">Immediate</option><option value="delayed">Delayed</option><option value="reject">Reject</option>
  </select></label>, output: <><p className="mcpcn-hint">Authored local feedback only. No tool, queue, tracing, authorization or model runtime is started.</p><p>Tool workflow intents: <output aria-label="Tool workflow intent count">{count}</output></p><p>Settled callbacks: <output aria-label="Settled callback count">{settled}</output></p><pre className="code" aria-label="Last tool workflow intent">{JSON.stringify(last, null, 2)}</pre></> };
}

function ToolWorkflowDemo({ slug }: { slug: ToolWorkflowSlug }) {
  const [data, setData] = useState<Data>(() => structuredClone(toolWorkflowExamples[slug])), [revision, setRevision] = useState(1);
  const [updated, setUpdated] = useState(false), [selectedUpdated, setSelectedUpdated] = useState(false);
  const feedback = useFeedback();
  const receive = (action: ComponentAction) => {
    const patch = toolWorkflowSelection(slug, data, action);
    if (patch) setData(current => {
      const next = toolWorkflowSelection(slug, current, action);
      return next ? { ...current, ...next } : current;
    });
    return feedback.receive(action, patch !== undefined);
  };
  let component: ReactNode;
  switch (slug) {
    case "tool-result-card": component = <ToolResultCard {...data as ToolResultCardData} onAction={receive} />; break;
    case "running-task-card": component = <RunningTaskCard {...data as RunningTaskCardData} onAction={receive} />; break;
    case "partial-result-viewer": component = <PartialResultViewer {...data as PartialResultViewerData} onAction={receive} />; break;
    case "queued-step-list": component = <QueuedStepList {...data as QueuedStepListData} onAction={receive} />; break;
    case "tool-trace-viewer": component = <ToolTraceViewer {...data as ToolTraceViewerData} onAction={receive} />; break;
  }
  const updateLabel = slug === "running-task-card" ? "Advance task progress" : slug === "partial-result-viewer" ? "Append unrelated part" : slug === "queued-step-list" ? "Append unrelated step" : slug === "tool-trace-viewer" ? "Append unrelated event" : undefined;
  const updateReportedData = () => {
    if (updated) return;
    setData(current => {
      if (slug === "running-task-card") return { ...current, progress: { completed: 3, total: 3 }, elapsedMs: 1800 };
      if (slug === "partial-result-viewer") {
        const parts = (current as PartialResultViewerData).parts;
        return parts.some(part => part.id === "appended-part") ? current : { ...current, parts: [...parts, { id: "appended-part", label: "Additional authored part", status: "available", value: { appended: true } }] };
      }
      if (slug === "queued-step-list") {
        const steps = (current as QueuedStepListData).steps;
        return steps.some(step => step.id === "appended-step") ? current : { ...current, steps: [...steps, { id: "appended-step", label: "Additional authored step", status: "queued", attempt: 0 }] };
      }
      if (slug === "tool-trace-viewer") {
        const events = (current as ToolTraceViewerData).events;
        return events.some(event => event.id === "appended-event") ? current : { ...current, events: [...events, { id: "appended-event", label: "Additional authored event", kind: "note", details: { appended: true } }] };
      }
      return current;
    });
    setUpdated(true);
  };
  const replaceSelectedLabel = slug === "partial-result-viewer" ? "Replace selected part" : slug === "queued-step-list" ? "Replace selected step" : slug === "tool-trace-viewer" ? "Replace selected event" : undefined;
  const selected = slug === "partial-result-viewer" ? data.selectedPartId : slug === "queued-step-list" ? data.selectedStepId : data.selectedEventId;
  const replaceSelected = () => {
    if (selectedUpdated || typeof selected !== "string") return;
    setData(current => {
      if (slug === "partial-result-viewer") return { ...current, parts: (current as PartialResultViewerData).parts.map(part => part.id !== current.selectedPartId ? part : {
        ...part, attempt: (part.attempt ?? 1) + 1, value: { replacement: true },
        ...(part.status === "pending" ? { status: "available", retryable: false } : {}),
        ...(part.status === "failed" ? { message: "Replacement authored part detail." } : {}),
      }) };
      if (slug === "queued-step-list") return { ...current, steps: (current as QueuedStepListData).steps.map(step => step.id === current.selectedStepId ? { ...step, attempt: (step.attempt ?? 0) + 1, message: "Replacement authored step detail." } : step) };
      if (slug === "tool-trace-viewer") return { ...current, events: (current as ToolTraceViewerData).events.map(event => event.id === current.selectedEventId ? { ...event, label: "Replacement authored event", details: { replacement: true } } : event) };
      return current;
    });
    setSelectedUpdated(true);
  };
  return <div className="mcpcn-stack">{feedback.controls}{component}<div className="filter-row">
    {updateLabel && <button type="button" className="button secondary" disabled={updated} onClick={updateReportedData}>{updateLabel}</button>}
    {replaceSelectedLabel && <button type="button" className="button secondary" disabled={selectedUpdated || typeof selected !== "string"} onClick={replaceSelected}>{replaceSelectedLabel}</button>}
    <button type="button" className="button secondary" onClick={() => {
      setRevision(revision + 1); setUpdated(false); setSelectedUpdated(false); setData({ ...structuredClone(toolWorkflowExamples[slug]), id: `${toolWorkflowExamples[slug].id}-replacement-${revision + 1}` }); feedback.reset();
    }}>Replace operation</button></div>{feedback.output}</div>;
}

export function ToolResultCardDemo() { return <ToolWorkflowDemo slug="tool-result-card" />; }
export function RunningTaskCardDemo() { return <ToolWorkflowDemo slug="running-task-card" />; }
export function PartialResultViewerDemo() { return <ToolWorkflowDemo slug="partial-result-viewer" />; }
export function QueuedStepListDemo() { return <ToolWorkflowDemo slug="queued-step-list" />; }
export function ToolTraceViewerDemo() { return <ToolWorkflowDemo slug="tool-trace-viewer" />; }

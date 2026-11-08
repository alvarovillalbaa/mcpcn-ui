"use client";

import { useId } from "react";
import {
  ToolResultCardSchema, RunningTaskCardSchema, PartialResultViewerSchema, QueuedStepListSchema, ToolTraceViewerSchema,
  type ToolResultCardData, type RunningTaskCardData, type PartialResultViewerData, type QueuedStepListData, type ToolTraceViewerData,
  type ParsedToolResultCardData, type ParsedRunningTaskCardData, type ParsedPartialResultViewerData, type ParsedQueuedStepListData, type ParsedToolTraceViewerData,
} from "@mcpcn/schemas";
import { Badge, Button, Card, InvalidPayload, Select } from "./primitives.js";
import { Feedback, revisionKey, useComponentAction } from "./component-helpers.js";
import type { ComponentProps } from "./component-types.js";

type ActionProps = Pick<ComponentProps<unknown>, "onAction" | "busy" | "error" | "className">;
type ViewProps<T> = ActionProps & { data: T };
type Part = ParsedPartialResultViewerData["parts"][number];
type Step = ParsedQueuedStepListData["steps"][number];
type TraceEvent = ParsedToolTraceViewerData["events"][number];
function payloadOf<T extends object>({ onAction: _action, busy: _busy, error: _error, className: _className, ...payload }: ComponentProps<T>) { return payload; }
function Header({ title, description, status }: { title: string; description?: string; status?: string }) {
  return <header className="mcpcn-header"><div className="mcpcn-row mcpcn-between"><h3 className="mcpcn-title">{title}</h3>{status && <Badge>{status}</Badge>}</div>
    {description && <p className="mcpcn-description">{description}</p>}</header>;
}
function JSONDetails({ label, value }: { label: string; value: unknown }) {
  return <details><summary>{label}</summary><pre className="mcpcn-code">{JSON.stringify(value, null, 2)}</pre></details>;
}

export function ToolResultCard(props: ComponentProps<ToolResultCardData>) {
  const parsed = ToolResultCardSchema.safeParse(payloadOf(props));
  if (!parsed.success) return <InvalidPayload title="Tool result data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <ResultView key={revisionKey(parsed.data)} data={parsed.data} onAction={props.onAction} busy={props.busy} error={props.error} className={props.className} />;
}
function ResultView({ data, ...props }: ViewProps<ParsedToolResultCardData>) {
  const action = useComponentAction(props.onAction, props.busy), blocked = data.disabled || action.busy || !props.onAction;
  const incomplete = data.status !== "succeeded";
  return <Card className={props.className} role="region" aria-label={data.title} aria-busy={action.busy} style={{ overflowWrap: "anywhere" }}>
    <Header {...data} /><div className="mcpcn-body mcpcn-stack"><p>Tool: <code>{data.tool}</code></p><p className="mcpcn-hint">Outcome ID: {data.id}</p>
      <p>Reported outcome: <strong>{data.status}</strong></p>
      {data.errorMessage && <p role="alert">{data.errorMessage}</p>}
      {data.result === undefined ? <p role="status">No result was supplied.</p> : <>
        {incomplete && <p role="status">This result is incomplete.</p>}
        <JSONDetails label={incomplete ? `Incomplete ${data.resultLabel}` : data.resultLabel} value={data.result} />
      </>}
      <Feedback busy={action.busy} error={props.error ?? action.error} />
      <p className="mcpcn-hint">Inspection sends outcome identity only. It never executes a tool.</p></div>
    <footer className="mcpcn-footer"><Button type="button" disabled={blocked} onClick={() => {
      if (!blocked) action.send({ type: "inspect-result", data: { id: data.id, tool: data.tool, status: data.status } });
    }}>{data.inspectLabel}</Button></footer>
  </Card>;
}

export function RunningTaskCard(props: ComponentProps<RunningTaskCardData>) {
  const parsed = RunningTaskCardSchema.safeParse(payloadOf(props));
  if (!parsed.success) return <InvalidPayload title="Running task data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <TaskView key={revisionKey({ id: parsed.data.id, status: parsed.data.status })} data={parsed.data} onAction={props.onAction} busy={props.busy} error={props.error} className={props.className} />;
}
function TaskView({ data, ...props }: ViewProps<ParsedRunningTaskCardData>) {
  const action = useComponentAction(props.onAction, props.busy), blocked = data.disabled || action.busy || !props.onAction;
  const canCancel = data.cancellable && ["queued", "running", "paused"].includes(data.status);
  return <Card className={props.className} role="region" aria-label={data.title} aria-busy={action.busy} style={{ overflowWrap: "anywhere" }}>
    <Header {...data} /><div className="mcpcn-body mcpcn-stack"><p className="mcpcn-hint">Task ID: {data.id}</p>
      <p>Reported task status: <strong>{data.status}</strong></p>{data.currentStep && <p>Current step: {data.currentStep}</p>}
      {data.progress ? <><progress aria-label="Reported task progress" max={data.progress.total} value={data.progress.completed} style={{ width: "100%", maxWidth: 360 }} />
        <p>{data.progress.completed} of {data.progress.total} reported steps</p><p className="mcpcn-hint">Progress counts do not determine the reported status.</p></>
        : <p role="status">No progress counts were supplied.</p>}
      {data.elapsedMs !== undefined && <p>{data.elapsedMs} ms reported elapsed</p>}
      {data.status === "failed" && <p role="alert">{data.errorMessage ?? "No failure detail was supplied."}</p>}
      {!canCancel && <p className="mcpcn-hint">Cancellation is not available for this reported state.</p>}
      <Feedback busy={action.busy} error={props.error ?? action.error} /><p className="mcpcn-hint">The consumer owns task execution and cancellation. No timer runs here.</p></div>
    <footer className="mcpcn-footer mcpcn-row"><Button type="button" disabled={blocked} onClick={() => {
      if (!blocked) action.send({ type: "inspect-task", data: { id: data.id } });
    }}>{data.inspectLabel}</Button>{canCancel && <Button type="button" data-variant="secondary" disabled={blocked} onClick={() => {
      if (!blocked && canCancel) action.send({ type: "cancel-task", data: { id: data.id, status: data.status } });
    }}>{data.cancelLabel}</Button>}</footer>
  </Card>;
}

export function PartialResultViewer(props: ComponentProps<PartialResultViewerData>) {
  const parsed = PartialResultViewerSchema.safeParse(payloadOf(props));
  if (!parsed.success) return <InvalidPayload title="Partial result data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  const { parts: _parts, selectedPartId: _selection, status: _status, ...terms } = parsed.data;
  return <PartialView key={revisionKey(terms)} data={parsed.data} onAction={props.onAction} busy={props.busy} error={props.error} className={props.className} />;
}
function PartialView({ data, ...props }: ViewProps<ParsedPartialResultViewerData>) {
  const group = useId(), action = useComponentAction(props.onAction, props.busy), blocked = data.disabled || action.busy || !props.onAction;
  const selected = data.parts.find(part => part.id === data.selectedPartId), available = data.parts.filter(part => part.status === "available").length;
  return <Card className={props.className} role="region" aria-label={data.title} aria-busy={action.busy} style={{ overflowWrap: "anywhere" }}>
    <Header {...data} /><div className="mcpcn-body mcpcn-stack"><p className="mcpcn-hint">Result ID: {data.id}</p><p>Reported result status: <strong>{data.status}</strong></p>
      <p>{available} of {data.parts.length} parts available</p>{!data.parts.length ? <p role="status">No result parts were supplied.</p> :
        <fieldset className="mcpcn-stack" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><legend>Result parts</legend>
          <ol className="mcpcn-stack" style={{ margin: 0, paddingLeft: 20 }}>{data.parts.map(part => <li key={part.id}>
            <label className="mcpcn-row"><input type="radio" name={group} aria-label={`Select part: ${part.label}`} checked={part.id === data.selectedPartId} disabled={blocked} onChange={() => {
              if (!blocked) action.send({ type: "select-result-part", data: { id: data.id, partId: part.id } });
            }} />{part.label}<Badge>{part.status}</Badge><span className="mcpcn-hint">Attempt {part.attempt}</span></label>
          </li>)}</ol></fieldset>}
      <Feedback busy={action.busy} error={props.error ?? action.error} />
      {selected ? <PartDetail key={revisionKey({ id: data.id, part: selected, inspectLabel: data.inspectLabel, retryLabel: data.retryLabel, disabled: data.disabled })}
        id={data.id} part={selected} inspectLabel={data.inspectLabel} retryLabel={data.retryLabel} disabled={data.disabled} onAction={props.onAction} busy={action.busy} />
        : data.parts.length > 0 && <p role="status">Select a result part to inspect its reported state.</p>}
      <p className="mcpcn-hint">Parts stay in consumer order. Inspection and retry are identity-only requests.</p></div>
  </Card>;
}
function PartDetail({ id, part, inspectLabel, retryLabel, disabled, ...props }: ActionProps & { id: string; part: Part; inspectLabel: string; retryLabel: string; disabled: boolean }) {
  const action = useComponentAction(props.onAction, props.busy), blocked = disabled || action.busy || !props.onAction;
  return <section aria-label="Selected result part" aria-busy={action.busy} className="mcpcn-stack"><h4>{part.label}</h4>
    <p>Part ID: <code>{part.id}</code> · {part.status} · Attempt {part.attempt}</p>
    {part.status === "pending" && <p role="status">This part is pending. No value is available.</p>}
    {part.message && <p role={part.status === "failed" ? "alert" : undefined}>{part.message}</p>}
    {part.value !== undefined && <JSONDetails label={part.status === "failed" ? "Incomplete part value" : "Part value"} value={part.value} />}
    {part.status === "failed" && part.value === undefined && <p role="status">No partial value was supplied.</p>}
    <div className="mcpcn-row"><Button type="button" disabled={blocked} onClick={() => {
      if (!blocked) action.send({ type: "inspect-result-part", data: { id, partId: part.id, status: part.status, attempt: part.attempt } });
    }}>{inspectLabel}</Button>{part.status === "failed" && part.retryable && <Button type="button" data-variant="secondary" disabled={blocked} onClick={() => {
      if (!blocked && part.status === "failed" && part.retryable) action.send({ type: "retry-result-part", data: { id, partId: part.id, attempt: part.attempt } });
    }}>{retryLabel}</Button>}</div><Feedback busy={action.busy} error={action.error} />
  </section>;
}

export function QueuedStepList(props: ComponentProps<QueuedStepListData>) {
  const parsed = QueuedStepListSchema.safeParse(payloadOf(props));
  if (!parsed.success) return <InvalidPayload title="Queued step data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  const { steps: _steps, selectedStepId: _selection, ...terms } = parsed.data;
  return <QueueView key={revisionKey(terms)} data={parsed.data} onAction={props.onAction} busy={props.busy} error={props.error} className={props.className} />;
}
function QueueView({ data, ...props }: ViewProps<ParsedQueuedStepListData>) {
  const group = useId(), action = useComponentAction(props.onAction, props.busy), blocked = data.disabled || action.busy || !props.onAction;
  const selected = data.steps.find(step => step.id === data.selectedStepId);
  return <Card className={props.className} role="region" aria-label={data.title} aria-busy={action.busy} style={{ overflowWrap: "anywhere" }}>
    <Header {...data} /><div className="mcpcn-body mcpcn-stack"><p className="mcpcn-hint">Queue ID: {data.id}</p>
      {!data.steps.length ? <p role="status">No queued steps were supplied.</p> : <fieldset className="mcpcn-stack" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><legend>Queued steps</legend>
        <ol className="mcpcn-stack" style={{ margin: 0, paddingLeft: 20 }}>{data.steps.map(step => <li key={step.id}>
          <label className="mcpcn-row"><input type="radio" name={group} aria-label={`Select step: ${step.label}`} checked={step.id === data.selectedStepId} disabled={blocked} onChange={() => {
            if (!blocked) action.send({ type: "select-queued-step", data: { id: data.id, stepId: step.id } });
          }} />{step.label}<Badge>{step.status}</Badge><span className="mcpcn-hint">Attempt {step.attempt}</span></label>
        </li>)}</ol></fieldset>}
      <Feedback busy={action.busy} error={props.error ?? action.error} />
      {selected ? <StepDetail key={revisionKey({ id: data.id, step: selected, inspectLabel: data.inspectLabel, retryLabel: data.retryLabel, disabled: data.disabled })}
        id={data.id} step={selected} inspectLabel={data.inspectLabel} retryLabel={data.retryLabel} disabled={data.disabled} onAction={props.onAction} busy={action.busy} />
        : data.steps.length > 0 && <p role="status">Select a queued step to inspect its reported state.</p>}
      <p className="mcpcn-hint">Steps keep their supplied order. This view never starts, advances or retries a step.</p></div>
  </Card>;
}
function StepDetail({ id, step, inspectLabel, retryLabel, disabled, ...props }: ActionProps & { id: string; step: Step; inspectLabel: string; retryLabel: string; disabled: boolean }) {
  const action = useComponentAction(props.onAction, props.busy), blocked = disabled || action.busy || !props.onAction;
  return <section aria-label="Selected queued step" aria-busy={action.busy} className="mcpcn-stack"><h4>{step.label}</h4>
    <p>Step ID: <code>{step.id}</code> · {step.status} · Attempt {step.attempt}</p>{step.message && <p role={step.status === "failed" ? "alert" : undefined}>{step.message}</p>}
    <div className="mcpcn-row"><Button type="button" disabled={blocked} onClick={() => {
      if (!blocked) action.send({ type: "inspect-queued-step", data: { id, stepId: step.id, status: step.status, attempt: step.attempt } });
    }}>{inspectLabel}</Button>{step.status === "failed" && step.retryable && <Button type="button" data-variant="secondary" disabled={blocked} onClick={() => {
      if (!blocked && step.status === "failed" && step.retryable) action.send({ type: "retry-queued-step", data: { id, stepId: step.id, attempt: step.attempt } });
    }}>{retryLabel}</Button>}</div><Feedback busy={action.busy} error={action.error} />
  </section>;
}

export function ToolTraceViewer(props: ComponentProps<ToolTraceViewerData>) {
  const parsed = ToolTraceViewerSchema.safeParse(payloadOf(props));
  if (!parsed.success) return <InvalidPayload title="Tool trace data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  const { events: _events, selectedEventId: _selection, filterKind: _filter, ...terms } = parsed.data;
  return <TraceView key={revisionKey(terms)} data={parsed.data} onAction={props.onAction} busy={props.busy} error={props.error} className={props.className} />;
}
function TraceView({ data, ...props }: ViewProps<ParsedToolTraceViewerData>) {
  const group = useId(), action = useComponentAction(props.onAction, props.busy), blocked = data.disabled || action.busy || !props.onAction;
  const visible = data.events.filter(event => data.filterKind === "all" || event.kind === data.filterKind), selected = data.events.find(event => event.id === data.selectedEventId);
  return <Card className={props.className} role="region" aria-label={data.title} aria-busy={action.busy} style={{ overflowWrap: "anywhere" }}>
    <Header {...data} /><div className="mcpcn-body mcpcn-stack"><p className="mcpcn-hint">Trace ID: {data.id}</p>
      <label className="mcpcn-label">Event kind<Select aria-label="Trace event filter" value={data.filterKind} disabled={blocked} onChange={event => {
        const kind = event.currentTarget.value;
        if (!blocked && ["all", "input", "progress", "output", "error", "note"].includes(kind)) action.send({ type: "change-trace-filter", data: { id: data.id, kind } });
      }}>{["all", "input", "progress", "output", "error", "note"].map(kind => <option key={kind} value={kind}>{kind}</option>)}</Select></label>
      {!data.events.length ? <p role="status">No trace events were supplied.</p> : !visible.length ? <p role="status">No events match this filter.</p> :
        <fieldset className="mcpcn-stack" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><legend>Trace events</legend>
          <ol className="mcpcn-stack" style={{ margin: 0, paddingLeft: 20 }}>{visible.map(event => <li key={event.id}>
            <label className="mcpcn-row"><input type="radio" name={group} aria-label={`Select event: ${event.label}`} checked={event.id === data.selectedEventId} disabled={blocked} onChange={() => {
              if (!blocked) action.send({ type: "select-trace-event", data: { id: data.id, eventId: event.id } });
            }} />{event.label}<Badge>{event.kind}</Badge></label>
          </li>)}</ol></fieldset>}
      <Feedback busy={action.busy} error={props.error ?? action.error} />
      {selected ? <TraceDetail key={revisionKey({ id: data.id, event: selected, inspectLabel: data.inspectLabel, disabled: data.disabled })}
        id={data.id} event={selected} visible={data.filterKind === "all" || selected.kind === data.filterKind} inspectLabel={data.inspectLabel} disabled={data.disabled} onAction={props.onAction} busy={action.busy} />
        : data.events.length > 0 && <p role="status">Select a visible trace event to inspect its details.</p>}
      <p className="mcpcn-hint">Event order and elapsed time come from the consumer. Inspection never sends event details.</p></div>
  </Card>;
}
function TraceDetail({ id, event, visible, inspectLabel, disabled, ...props }: ActionProps & { id: string; event: TraceEvent; visible: boolean; inspectLabel: string; disabled: boolean }) {
  const action = useComponentAction(props.onAction, props.busy), blocked = disabled || action.busy || !props.onAction || !visible;
  return <section aria-label="Selected trace event" aria-busy={action.busy} className="mcpcn-stack"><h4>{event.label}</h4><p>Event ID: <code>{event.id}</code></p>
    {!visible ? <p role="status">The selected event is hidden by the current filter. Its details are concealed.</p> : <>
      <p>Reported event kind: <strong>{event.kind}</strong></p>{event.parentId ? <p>Parent event: <code>{event.parentId}</code></p> : <p className="mcpcn-hint">No parent event was reported.</p>}
      {event.elapsedMs !== undefined && <p>{event.elapsedMs} ms reported elapsed</p>}
      {event.details === undefined ? <p role="status">No details were supplied.</p> : <JSONDetails label="Event details" value={event.details} />}
    </>}
    <div><Button type="button" disabled={blocked} onClick={() => {
      if (!blocked) action.send({ type: "inspect-trace-event", data: { id, eventId: event.id, kind: event.kind } });
    }}>{inspectLabel}</Button></div><Feedback busy={action.busy} error={action.error} />
  </section>;
}

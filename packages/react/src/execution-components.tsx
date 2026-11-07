"use client";

import { AuthRequiredCardSchema, RetryableErrorStateSchema, ToolCallCardSchema, type AuthRequiredCardData, type RetryableErrorStateData, type ToolCallCardData } from "@mcpcn/schemas";
import type { z } from "zod";
import { Badge, Button, Card, InvalidPayload } from "./primitives.js";
import { Feedback, revisionKey, useComponentAction } from "./component-helpers.js";
import type { ComponentProps } from "./component-types.js";

type ActionProps = Pick<ComponentProps<unknown>, "className" | "onAction" | "busy" | "error">;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function JSONDetails({ title, value }: { title: string; value: unknown }) {
  return <details><summary>{title}</summary><pre className="mcpcn-code">{JSON.stringify(value, null, 2)}</pre></details>;
}

/** Inspection intent never executes the named tool or changes its reported status. */
export function ToolCallCard(props: ComponentProps<ToolCallCardData>) {
  const parsed = ToolCallCardSchema.safeParse(props);
  if (!parsed.success) return <InvalidPayload title="Tool call data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  const data = parsed.data, operation = { id: data.id, tool: data.tool, arguments: data.arguments, status: data.status, result: data.result, errorMessage: data.errorMessage };
  return <ToolCallContent key={revisionKey(operation)} data={data} className={props.className} onAction={props.onAction} busy={props.busy} error={props.error} />;
}
function ToolCallContent({ data, ...props }: ActionProps & { data: z.output<typeof ToolCallCardSchema> }) {
  const action = useComponentAction(props.onAction, props.busy);
  return <Card className={props.className}>
    <div className="mcpcn-header"><div className="mcpcn-row mcpcn-between"><h3 className="mcpcn-title">{data.title}</h3><Badge>{data.status}</Badge></div>
      {data.description && <p className="mcpcn-description">{data.description}</p>}<p>Tool: <code>{data.tool}</code></p><p className="mcpcn-hint">Call ID: {data.id}</p></div>
    <div className="mcpcn-body mcpcn-stack">
      {Object.keys(data.arguments).length === 0 && <p role="status">No arguments supplied.</p>}
      <JSONDetails title="Arguments" value={data.arguments} />
      {data.result === undefined ? <p role="status">No result supplied.</p> : <JSONDetails title="Current result" value={data.result} />}
      {data.status === "queued" && <p role="status">This tool call is queued.</p>}
      {data.status === "running" && <p role="status">The consumer reports this tool call is running.</p>}
      {data.status === "failed" && <p role="alert">{data.errorMessage ?? "The tool call failed. No failure detail was supplied."}</p>}
      <Feedback busy={action.busy} error={props.error ?? action.error} />
      <p className="mcpcn-hint">Review emits an inspection intent only. This component never runs a tool.</p>
    </div>
    <div className="mcpcn-footer"><Button type="button" disabled={data.disabled || action.busy || !props.onAction} onClick={() => {
      if (data.disabled || action.busy || !props.onAction) return;
      action.send({ type: "inspect", data: copy({ id: data.id, tool: data.tool, arguments: data.arguments, status: data.status, ...(data.result === undefined ? {} : { result: data.result }) }) });
    }}>Review tool call</Button></div>
  </Card>;
}

export function RetryableErrorState(props: ComponentProps<RetryableErrorStateData>) {
  const parsed = RetryableErrorStateSchema.safeParse(props);
  if (!parsed.success) return <InvalidPayload title="Retry state data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  const data = parsed.data, operation = { id: data.id, tool: data.tool, arguments: data.arguments, attempt: data.attempt };
  return <RetryContent key={revisionKey(operation)} data={data} className={props.className} onAction={props.onAction} busy={props.busy} error={props.error} />;
}
function RetryContent({ data, ...props }: ActionProps & { data: z.output<typeof RetryableErrorStateSchema> }) {
  const action = useComponentAction(props.onAction, props.busy);
  return <Card className={props.className}>
    <div className="mcpcn-header"><h3 className="mcpcn-title">{data.title}</h3><p>Tool: <code>{data.tool}</code></p><p className="mcpcn-hint">Request ID: {data.id} · Failed attempt: {data.attempt}</p></div>
    <div className="mcpcn-body mcpcn-stack"><p role="alert">{data.message}</p><JSONDetails title="Arguments to retry" value={data.arguments} />
      {!Object.keys(data.arguments).length && <p className="mcpcn-hint">No arguments supplied.</p>}
      {!data.retryable && <p role="status">This failure is not retryable.</p>}
      <Feedback busy={action.busy} error={props.error ?? action.error} />
      <p className="mcpcn-hint">Retry requests consumer review of this exact failed operation. No retry runs automatically.</p></div>
    {data.retryable && <div className="mcpcn-footer"><Button type="button" disabled={data.disabled || action.busy || !props.onAction} onClick={() => {
      if (!data.retryable || data.disabled || action.busy || !props.onAction) return;
      action.send({ type: "retry", data: copy({ id: data.id, tool: data.tool, arguments: data.arguments, attempt: data.attempt }) });
    }}>{data.retryLabel}</Button></div>}
  </Card>;
}

export function AuthRequiredCard(props: ComponentProps<AuthRequiredCardData>) {
  const parsed = AuthRequiredCardSchema.safeParse(props);
  if (!parsed.success) return <InvalidPayload title="Access request data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  const data = parsed.data, operation = { id: data.id, service: data.service, scopes: data.scopes.map(scope => scope.id), status: data.status };
  return <AuthContent key={revisionKey(operation)} data={data} className={props.className} onAction={props.onAction} busy={props.busy} error={props.error} />;
}
function AuthContent({ data, ...props }: ActionProps & { data: z.output<typeof AuthRequiredCardSchema> }) {
  const action = useComponentAction(props.onAction, props.busy), blocked = data.disabled || action.busy || data.status !== "required" || !props.onAction;
  return <Card className={props.className}>
    <div className="mcpcn-header"><div className="mcpcn-row mcpcn-between"><h3 className="mcpcn-title">{data.title}</h3><Badge>{data.status}</Badge></div><p>Service: <strong>{data.service}</strong></p>
      {data.description && <p className="mcpcn-description">{data.description}</p>}</div>
    <div className="mcpcn-body mcpcn-stack"><h4>Requested permissions</h4>
      {data.scopes.length ? <ul>{data.scopes.map(scope => <li key={scope.id}>{scope.label} <code>{scope.id}</code></li>)}</ul> : <p>No permissions supplied.</p>}
      {data.status === "pending" && <p role="status">The consumer reports an access request is pending.</p>}
      {data.status === "unavailable" && <p role="alert">Access cannot be requested in this state.</p>}
      <Feedback busy={action.busy} error={props.error ?? action.error} />
      <p className="mcpcn-hint">This control only sends your access-request intent to the consuming app. It does not sign in, redirect, collect credentials or grant access.</p></div>
    <div className="mcpcn-footer"><Button type="button" disabled={blocked} onClick={() => {
      if (blocked) return;
      action.send({ type: "request-auth", data: { id: data.id, service: data.service, scopes: data.scopes.map(scope => scope.id) } });
    }}>{data.actionLabel}</Button></div>
  </Card>;
}

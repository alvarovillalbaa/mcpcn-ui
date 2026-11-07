"use client";

import { useState } from "react";
import { AuthRequiredCard, RetryableErrorState, ToolCallCard, type ComponentAction } from "@mcpcn/react";

function LastAction({ label, value }: { label: string; value: ComponentAction | null }) {
  return <div><p className="mcpcn-hint">Authored local example. No host, tool, authentication service or network request is used.</p><h4>Last action</h4><pre className="mcpcn-code" aria-label={label}>{JSON.stringify(value, null, 2)}</pre></div>;
}

export function ToolCallCardDemo() {
  const [status, setStatus] = useState<"queued" | "running" | "succeeded" | "failed">("succeeded");
  const [last, setLast] = useState<ComponentAction | null>(null), [busy, setBusy] = useState(false), [reject, setReject] = useState(false);
  return <div className="mcpcn-stack">
    <label className="mcpcn-label">Tool-call example status<select aria-label="Tool-call example status" value={status} onChange={event => setStatus(event.target.value as typeof status)}>
      <option value="queued">Queued</option><option value="running">Running</option><option value="succeeded">Succeeded</option><option value="failed">Failed</option></select></label>
    <label><input type="checkbox" checked={busy} onChange={event => setBusy(event.target.checked)} /> Consumer is busy inspecting</label>
    <label><input type="checkbox" checked={reject} onChange={event => setReject(event.target.checked)} /> Reject next inspection intent</label>
    <ToolCallCard id="call-invoice-42" title="Inspect the invoice lookup" tool="lookup_invoice" arguments={{ invoiceId: "INV-42", includeLines: true }} status={status}
      result={status === "succeeded" ? { found: true, total: 29.5 } : status === "running" ? { receivedLines: 1 } : undefined}
      errorMessage={status === "failed" ? "Authored lookup failure; no live tool was called." : undefined} busy={busy} onAction={action => {
        setLast(action); if (reject) { setReject(false); return Promise.reject(new Error("Authored inspection rejection")); }
      }} />
    <LastAction label="Tool-call last action" value={last} />
  </div>;
}

export function RetryableErrorStateDemo() {
  const [last, setLast] = useState<ComponentAction | null>(null), [retryable, setRetryable] = useState(true), [busy, setBusy] = useState(false), [reject, setReject] = useState(false);
  return <div className="mcpcn-stack">
    <label><input type="checkbox" checked={retryable} onChange={event => setRetryable(event.target.checked)} /> Allow retry intent</label>
    <label><input type="checkbox" checked={busy} onChange={event => setBusy(event.target.checked)} /> Consumer is busy retrying</label>
    <label><input type="checkbox" checked={reject} onChange={event => setReject(event.target.checked)} /> Reject next retry intent</label>
    <RetryableErrorState id="retry-invoice-42" title="Invoice lookup needs review" tool="lookup_invoice" arguments={{ invoiceId: "INV-42", includeLines: true }} attempt={1}
      message="The authored request failed. Its arguments are retained for review." retryable={retryable} busy={busy} onAction={action => {
        setLast(action); if (reject) { setReject(false); return Promise.reject(new Error("Authored retry rejection")); }
      }} />
    <LastAction label="Retry last action" value={last} />
  </div>;
}

export function AuthRequiredCardDemo() {
  const [last, setLast] = useState<ComponentAction | null>(null), [status, setStatus] = useState<"required" | "pending" | "unavailable">("required"), [reject, setReject] = useState(false);
  return <div className="mcpcn-stack">
    <label className="mcpcn-label">Access example status<select aria-label="Access example status" value={status} onChange={event => setStatus(event.target.value as typeof status)}>
      <option value="required">Required</option><option value="pending">Pending</option><option value="unavailable">Unavailable</option></select></label>
    <label><input type="checkbox" checked={reject} onChange={event => setReject(event.target.checked)} /> Reject next access intent</label>
    <AuthRequiredCard id="access-invoices" title="Request invoice access" service="Authored invoice workspace" description="Review the requested scope before contacting the consuming app."
      scopes={[{ id: "invoices.read", label: "Read invoice metadata" }]} status={status} onAction={action => {
        setLast(action); if (reject) { setReject(false); return Promise.reject(new Error("Authored access rejection")); } setStatus("pending");
      }} />
    <LastAction label="Access last action" value={last} />
  </div>;
}

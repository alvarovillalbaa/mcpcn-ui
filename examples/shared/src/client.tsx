"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAgentApp } from "@mcpcn/runtime";
import { AuditTrail, Button } from "@mcpcn/react";
import { ReviewBeforeAction } from "@mcpcn/react/blocks";
import { z } from "zod";
import { METADATA_KEY, PublicRecordSchema, privateRecordSchema, toolPrefix, type RecordView, type Workflow } from "./contracts.js";

export function useReferenceWorkflow<S extends z.ZodType>(workflow: Workflow, stateSchema: S, id = "record-one") {
  const app = useAgentApp(), currentApp = useRef(app); currentApp.current = app;
  const schema = useMemo(() => privateRecordSchema(stateSchema), [stateSchema]);
  const [view, setView] = useState<RecordView<z.output<S>> | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const current = useRef(view); current.current = view;
  const live = useRef(false), request = useRef(0), pending = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; request.current++; }; }, []);
  const decode = useCallback((result: unknown) => {
    const tool = z.object({ isError: z.boolean().optional(), structuredContent: z.object({ kind: z.literal("mcpcn/reference-workflow"), version: z.literal(1), stateVersion: z.number().int(), data: PublicRecordSchema }), _meta: z.record(z.string(), z.unknown()) }).passthrough().parse(result);
    if (tool.isError) throw new Error("reference_response_invalid");
    const next = schema.parse(tool._meta[METADATA_KEY]);
    if (next.workflow !== workflow || next.id !== id || tool.structuredContent.data.workflow !== workflow || tool.structuredContent.data.id !== id
      || next.revision !== tool.structuredContent.data.revision || next.revision !== tool.structuredContent.stateVersion
      || current.current && next.revision < current.current.revision) throw new Error("reference_response_invalid");
    return next as RecordView<z.output<S>>;
  }, [schema, workflow, id]);
  useEffect(() => {
    if (!app.toolResult) return;
    request.current++; pending.current = false; setBusy(false);
    try { const next = decode(app.toolResult); current.current = next; setView(next); setError(undefined); }
    catch { setView(null); current.current = null; setError("The server returned an invalid review. Reload the record."); }
  }, [app.toolResult, decode]);
  const invoke = async (operation: "read" | "prepare" | "confirm", proposal?: unknown) => {
    if (!live.current || pending.current || !currentApp.current.capabilities.callTool) return;
    const selected = current.current;
    if (operation !== "read" && !selected || operation === "confirm" && !selected?.prepared) return;
    const args = operation === "read" ? { id } : operation === "prepare" ? { id, revision: selected!.revision, proposal }
      : { token: selected!.prepared!.token };
    const version = ++request.current; pending.current = true; setBusy(true); setError(undefined);
    try {
      const response = await currentApp.current.callTool(`${toolPrefix(workflow)}_${operation}`, args);
      if (!live.current || request.current !== version) return;
      const next = decode(response); current.current = next; setView(next);
    } catch {
      if (!live.current || request.current !== version) return;
      const next = current.current ? { ...current.current, prepared: null } : null; current.current = next; setView(next);
      setError(operation === "confirm" ? "The result could not be confirmed. Reload the record and inspect its audit before trying again." : "The request could not be completed. Reload the record before trying again.");
    } finally { if (live.current && request.current === version) { pending.current = false; setBusy(false); } }
  };
  const clearReview = () => {
    const selected = current.current; if (pending.current || !selected?.prepared) return;
    const token = selected.prepared.token, next = { ...selected, prepared: null }, version = request.current; current.current = next; setView(next);
    // Cancel only this old token. Its late response must not replace a newer review.
    void currentApp.current.callTool(`${toolPrefix(workflow)}_cancel`, { token }).then(result => {
      if (result.isError && live.current && request.current === version) setError("Review cancellation could not be confirmed. Reload and inspect the record before continuing.");
    }).catch(() => { if (live.current && request.current === version) setError("Review cancellation could not be confirmed. Reload and inspect the record before continuing."); });
  };
  return { view, busy, error, ready: app.capabilities.callTool, reload: () => invoke("read"), prepare: (proposal: unknown) => invoke("prepare", proposal), confirm: () => invoke("confirm"), clearReview };
}
export type WorkflowController<S> = { view: RecordView<S> | null; busy: boolean; error?: string; ready: boolean; reload(): Promise<void>; confirm(): Promise<void>; clearReview(): void };
export function WorkflowFrame<S>({ controller, title, children }: { controller: WorkflowController<S>; title: string; children?: ReactNode }) {
  const { view, busy, error, ready } = controller;
  return <main className="reference-app mcpcn mcpcn-stack" aria-label={title} aria-busy={busy}>
    <header className="reference-header"><div><p className="reference-eyebrow">MCPCN reference workflow</p><h1>{title}</h1></div><Button disabled={busy || !ready} onClick={() => void controller.reload()}>Reload record</Button></header>
    {error && <p role="alert" className="mcpcn-error">{error}</p>}
    {!ready && <p role="status">Connect this app through the reference workbench or an authorized MCP host.</p>}
    {ready && !view && !error && <p role="status">Loading the server record…</p>}
    {view && <><p className="reference-status" role="status" aria-label="Record revision and audit">Revision {view.revision} · {(view.state as { status?: string }).status} · {view.audit.length + view.earlierAuditEvents} saved audit events</p>{children}
      {view.prepared && <section aria-label="Prepared review"><p>Review expires at {new Date(view.prepared.expiresAt).toISOString()}. Changes apply only to this local reference workspace.</p>
        <ReviewBeforeAction reviewId={view.prepared.token} title={view.prepared.title} description={view.prepared.description} changes={view.prepared.changes}
          riskLevel={view.prepared.riskLevel} requiresExplicitConsent consentLabel="I reviewed these exact changes and want to apply them." actionLabel="Confirm reviewed change"
          busy={busy || !ready} onApprove={() => void controller.confirm()} onCancel={controller.clearReview} /></section>}
      <AuditTrail title="Saved audit trail" entries={view.audit.map(event => ({ id: String(event.sequence), label: event.summary, description: `Revision ${event.revision} · ${event.action}`, actor: event.actor, timestamp: event.at, status: "success" }))} />
      {view.earlierAuditEvents > 0 && <p>{view.earlierAuditEvents} earlier events remain in the workspace database.</p>}</>}
  </main>;
}

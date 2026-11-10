"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { useAgentApp } from "@mcpcn/runtime";
import { BlockKindSchema, BlockIdentitySchema, BlockRecordSchema, PublicBlockRecordSchema, BLOCK_METADATA_KEY, blockToolNames,
  type BlockKind, type BlockRecord, type BlockProposal, type BlockState, type BlockValues, type BlockJson } from "@mcpcn/schemas/blocks";
import { AuditTrail, Button, Card } from "./index.js";
import { ReviewBeforeAction, CollectMissingData, ExtractReviewSave, CompareOptionsApprove, MultiStepToolRun,
  ApprovalGatedToolCall, HumanCorrectsAiOutput, AgentGeneratedReportReview, FileUploadAndExtract,
  TableBulkActionReview, AdminChangeReview } from "./blocks.js";

export type BlockAppProps = { id?: string };
function identity(input: unknown): string | undefined {
  try { return z.object({ id: BlockIdentitySchema }).passthrough().safeParse(input).data?.id; } catch { return undefined; }
}
function resultIdentity(input: unknown): string | undefined {
  try { return z.object({ structuredContent: z.object({ data: z.object({ id: BlockIdentitySchema }).passthrough() }).passthrough() }).passthrough().safeParse(input).data?.structuredContent.data.id; }
  catch { return undefined; }
}
function decode(value: unknown, block: BlockKind, id: string): BlockRecord {
  const parsed = z.object({ isError: z.boolean().optional(), structuredContent: z.object({ kind: z.literal(`mcpcn/${block}`), version: z.literal(1),
    stateVersion: z.number().int().positive(), data: PublicBlockRecordSchema }).strict(), _meta: z.record(z.string(), z.unknown()) }).passthrough().parse(value);
  if (parsed.isError) throw new Error("block_response_invalid");
  const view = BlockRecordSchema.parse(parsed._meta[BLOCK_METADATA_KEY]), visible = parsed.structuredContent.data, receipt = visible.receipt;
  if (view.block !== block || visible.block !== block || view.id !== id || visible.id !== id || view.revision !== visible.revision
    || view.revision !== parsed.structuredContent.stateVersion || view.state.status !== visible.status
    || receipt && (receipt.recordId !== id || receipt.revision > view.revision || receipt.sequence !== receipt.revision - 1)) throw new Error("block_response_invalid");
  return view;
}

/** Requires an AgentAppProvider. Id may be fixed or supplied coherently by MCP tool input/result. */
export function useBlockWorkflow(block: BlockKind, explicitId?: string) {
  const app = useAgentApp(), latestApp = useRef(app); latestApp.current = app;
  const id = explicitId ?? identity(app.toolInput) ?? resultIdentity(app.toolResult);
  const configured = BlockKindSchema.safeParse(block).success && (id === undefined || BlockIdentitySchema.safeParse(id).success);
  const [stored, setStored] = useState<BlockRecord | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const [requiresReload, setRequiresReload] = useState(false), blocked = useRef(false), pending = useRef(false), epoch = useRef(0), live = useRef(false);
  const view = configured && stored?.block === block && stored.id === id ? stored : null, current = useRef(view); current.current = view;
  useEffect(() => { live.current = true; return () => { live.current = false; epoch.current++; }; }, []);
  const accept = useCallback((next: BlockRecord) => {
    const before = current.current;
    if (before && next.revision < before.revision) return false;
    if (before && next.revision === before.revision && (JSON.stringify(next.state) !== JSON.stringify(before.state)
      || JSON.stringify(next.audit) !== JSON.stringify(before.audit) || next.earlierAuditEvents !== before.earlierAuditEvents)) throw new Error("block_response_invalid");
    current.current = next; setStored(next); blocked.current = false; setRequiresReload(false); setError(undefined); return true;
  }, []);
  const refuse = useCallback((message: string) => {
    const next = current.current ? { ...current.current, prepared: null } : null; current.current = next; setStored(next);
    blocked.current = true; setRequiresReload(true); setError(message);
  }, []);
  useEffect(() => {
    epoch.current++; pending.current = false; blocked.current = false; current.current = null;
    setStored(null); setBusy(false); setRequiresReload(false); setError(undefined);
  }, [block, id, configured]);
  useEffect(() => {
    if (!app.toolResult || !configured) return;
    try {
      if (!id) throw new Error("block_identity_missing");
      const next = decode(app.toolResult, block, id);
      if (current.current && next.revision < current.current.revision) return;
      accept(next); epoch.current++; pending.current = false; setBusy(false);
    } catch { epoch.current++; pending.current = false; setBusy(false); refuse("The host returned an invalid or mismatched block record. Reload the record before continuing."); }
  }, [app.toolResult, configured, block, id, accept, refuse]);
  const invoke = async (operation: "read" | "prepare" | "confirm", proposal?: BlockProposal) => {
    if (!live.current || !configured || !id || pending.current || !latestApp.current.capabilities.callTool || operation !== "read" && blocked.current) return;
    const selected = current.current;
    if (operation !== "read" && !selected || operation === "confirm" && !selected?.prepared) return;
    const args = operation === "read" ? { id } : operation === "prepare" ? { id, revision: selected!.revision, proposal } : { token: selected!.prepared!.token };
    const generation = ++epoch.current; pending.current = true; setBusy(true); setError(undefined);
    try {
      const result = await latestApp.current.callTool(blockToolNames(block)[operation], args);
      if (!live.current || epoch.current !== generation) return;
      if (!accept(decode(result, block, id))) throw new Error("block_response_stale");
    } catch {
      if (!live.current || epoch.current !== generation) return;
      refuse(operation === "confirm" ? "The confirmation outcome is uncertain. Reload the record and inspect its saved state and audit before another attempt."
        : "The block request could not be completed. Reload the record before another attempt.");
    } finally { if (live.current && epoch.current === generation) { pending.current = false; setBusy(false); } }
  };
  const cancel = () => {
    const selected = current.current; if (pending.current || !selected?.prepared) return;
    const token = selected.prepared.token, generation = epoch.current, next = { ...selected, prepared: null }; current.current = next; setStored(next);
    // Only the old token is revoked. A late response never replaces a newer review.
    void latestApp.current.callTool(blockToolNames(block).cancel, { token }).then(result => {
      if (result.isError && live.current && epoch.current === generation) refuse("Review cancellation could not be confirmed. Reload before continuing.");
    }).catch(() => { if (live.current && epoch.current === generation) refuse("Review cancellation could not be confirmed. Reload before continuing."); });
  };
  return { view, busy, requiresReload, ready: configured && app.capabilities.callTool, canRead: configured && Boolean(id) && app.capabilities.callTool,
    error: !configured ? "This block configuration is invalid." : error,
    reload: () => invoke("read"), prepare: (proposal: BlockProposal) => invoke("prepare", proposal), confirm: () => invoke("confirm"), cancel };
}

const shown = (value: unknown) => value === undefined ? "Not supplied" : JSON.stringify(value, null, 2);
const textStyle = { whiteSpace: "pre-wrap", overflowWrap: "anywhere", overflow: "auto", maxHeight: 430, minWidth: 0 } as const;
function CompleteValue({ label, value }: { label: string; value: unknown }) {
  return <section><h3>{label}</h3><pre aria-label={label} tabIndex={0} style={textStyle}>{shown(value)}</pre></section>;
}
function CompleteText({ label, text }: { label: string; text: string }) {
  return <section><h3>{label}</h3><pre aria-label={label} tabIndex={0} style={textStyle}>{text}</pre></section>;
}
function Sources({ sources }: { sources: Array<{ id: string; label: string; url?: string; excerpt?: string }> }) {
  return <section aria-label="Supplied sources"><h3>Supplied sources</h3>{sources.length ? sources.map(source => <article key={source.id}>
    <h4>{source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a> : source.label}</h4>
    {source.excerpt !== undefined && <CompleteText label={"Complete source excerpt: " + source.label} text={source.excerpt} />}</article>) : <p>No sources supplied.</p>}</section>;
}
function Fields({ state }: { state: Extract<BlockState, { values: BlockValues }> }) {
  return <section aria-label="Current reviewed field values"><h3>Current field values</h3>{state.fields.map(field => <article key={field.name}>
    <h4>{field.label}</h4><CompleteValue label={"Current value: " + field.label} value={state.values[field.name]} />
    {field.original !== undefined && <CompleteValue label={"Original value: " + field.label} value={field.original} />}
    {field.source !== undefined && <CompleteText label={"Source: " + field.label} text={field.source} />}</article>)}</section>;
}
function FileData({ state }: { state: Extract<BlockState, { block: "file-upload-and-extract" }> }) {
  if (!state.file) return <p>No stored file.</p>;
  return <><p>{state.file.name} · {state.file.kind} · {state.file.bytes} UTF-8 bytes</p><CompleteText label="Stored file SHA256" text={state.file.sha256} />
    <CompleteText label="Complete stored file text" text={state.file.text} /><section aria-label="Stored extracted fields"><h3>Stored extracted fields</h3>
      {state.fields.map(field => <article key={field.id}><h4>{field.label}</h4><CompleteValue label={"Extracted value: " + field.label} value={field.value} />
        <p>Literal-line confidence: {field.confidence}</p><CompleteText label={"Source match: " + field.label} text={field.source} /></article>)}</section></>;
}
function Execution({ value, label = "Saved operation result" }: { value: { status: string; result: BlockJson; message: string }; label?: string }) {
  return value.status === "idle" ? null : <section aria-label={label}><p role="status">{value.status}: {value.message}</p><CompleteValue label={label} value={value.result} /></section>;
}

export function BlockApp({ block, id }: BlockAppProps & { block: BlockKind }) {
  const controller = useBlockWorkflow(block, id), view = controller.view, state = view?.state, review = view?.prepared, preview = review?.preview;
  const disabled = controller.busy || controller.requiresReload || !controller.ready;
  const [values, setValues] = useState<BlockValues>({}), [optionId, setOptionId] = useState<string | null>(null), [rowIds, setRowIds] = useState<string[]>([]), [conclusion, setConclusion] = useState("");
  const [file, setFile] = useState<File | null>(null), selectedFile = useRef<File | null>(null), [kind, setKind] = useState<"invoice" | "contract" | "resume">("invoice");
  const [fileError, setFileError] = useState<string>(), [reading, setReading] = useState(false), readingNow = useRef(false), fileEpoch = useRef(0), fileLive = useRef(false);
  const [selectedDigest, setSelectedDigest] = useState<string>();
  const scope = view ? view.block + "/" + view.id : block + "/" + (id ?? ""), revision = view ? scope + "/" + view.revision : "";
  useEffect(() => { fileLive.current = true; return () => { fileLive.current = false; fileEpoch.current++; }; }, []);
  useEffect(() => { fileEpoch.current++; selectedFile.current = null; setFile(null); readingNow.current = false; setReading(false); setSelectedDigest(undefined); setFileError(undefined); }, [scope]);
  useEffect(() => {
    if (!state) return;
    if (state.block === "collect-missing-data" || state.block === "extract-review-save" || state.block === "human-corrects-ai-output") setValues({ ...state.values });
    if (state.block === "compare-options-approve") setOptionId(state.selectedId);
    if (state.block === "table-bulk-action-review") setRowIds(state.selectedIds.filter(selected => state.rows.some(row => row.id === selected && !row.disabled)));
    if (state.block === "agent-generated-report-review") setConclusion(state.conclusion);
    if (state.block === "file-upload-and-extract" && state.file) setKind(state.file.kind);
  }, [revision]);
  const changeValues = (next: BlockValues) => { controller.cancel(); setValues(next); };
  const selectFile = (next: File | null) => {
    fileEpoch.current++; selectedFile.current = next; setFile(next); readingNow.current = false; setReading(false); setSelectedDigest(undefined); setFileError(undefined); controller.cancel();
  };
  const extractFile = async (selected: File) => {
    if (disabled || readingNow.current || selectedFile.current !== selected) return;
    const generation = ++fileEpoch.current, requestedKind = kind; readingNow.current = true; setReading(true); setFileError(undefined);
    try {
      if (selected.size > 65536 || !/\.(?:txt|md)$/i.test(selected.name)) throw new Error("file_invalid");
      const bytes = await selected.arrayBuffer(), text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(value => value.toString(16).padStart(2, "0")).join("");
      if (!fileLive.current || fileEpoch.current !== generation || selectedFile.current !== selected) return;
      setSelectedDigest(digest); await controller.prepare({ action: "extract-file", fileName: selected.name, text, kind: requestedKind });
    } catch { if (fileLive.current && fileEpoch.current === generation) setFileError("Choose a well-formed UTF-8 .txt or .md document no larger than 64 KiB."); }
    finally { if (fileLive.current && fileEpoch.current === generation) { readingNow.current = false; setReading(false); } }
  };
  const reviewProps = review ? { reviewId: review.token, title: review.terms.title, description: review.terms.description, changes: review.terms.changes,
    riskLevel: review.terms.riskLevel, requiresExplicitConsent: true, consentLabel: "I reviewed these exact changes and want to apply them.",
    actionLabel: "Confirm reviewed change", busy: disabled, onApprove: () => void controller.confirm(), onCancel: controller.cancel } : null;
  let body: ReactNode = null, specializedReview = false;
  if (state) switch (state.block) {
    case "review-before-action": case "approval-gated-tool-call": case "admin-change-review": {
      body = <><Card><section className="mcpcn-body mcpcn-stack"><h2>Planned operation</h2><p>{state.operation.name}</p>
        <CompleteValue label="Complete operation arguments" value={state.operation.arguments} />
        {state.changes.map((change, index) => <section key={index}><h3>{change.label}</h3><CompleteText label={"Before: " + change.label} text={change.before} /><CompleteText label={"After: " + change.label} text={change.after} /></section>)}
        {state.block === "admin-change-review" && <><p>{state.affectedCount} affected records.</p><CompleteText label="Rollback guidance" text={state.rollback} /></>}
        <Execution value={state.execution} /></section></Card>
        {!review && (state.status === "ready" || state.status === "failed") && <Button disabled={disabled} onClick={() => void controller.prepare({ action: "approve" })}>Prepare operation review</Button>}
        {reviewProps && (state.block === "approval-gated-tool-call" ? <ApprovalGatedToolCall {...reviewProps} toolName={state.operation.name} />
          : state.block === "admin-change-review" ? <AdminChangeReview {...reviewProps} affectedCount={state.affectedCount} rollback={state.rollback} /> : <ReviewBeforeAction {...reviewProps} />)}</>;
      specializedReview = Boolean(reviewProps); break;
    }
    case "collect-missing-data": case "extract-review-save": case "human-corrects-ai-output": {
      const shownState = preview && (preview.block === "collect-missing-data" || preview.block === "extract-review-save" || preview.block === "human-corrects-ai-output") ? preview : state;
      const props = { title: state.title, description: state.description, fields: state.fields, values, onValuesChange: changeValues,
        onSubmit: (next: BlockValues) => void controller.prepare({ action: "submit", values: next }), submitLabel: "Prepare field review", busy: disabled };
      const editable = !review && ["needs-data", "extracted", "needs-correction"].includes(state.status);
      body = <>{state.block === "collect-missing-data" ? <section><h2>Known context remains read-only</h2>{Object.entries(state.known).map(([name, value]) => <CompleteValue key={name} label={"Known: " + name} value={value} />)}</section> : <Sources sources={state.sources} />}
        {editable ? state.block === "collect-missing-data" ? <CollectMissingData {...props} /> : state.block === "extract-review-save" ? <ExtractReviewSave {...props} /> : <HumanCorrectsAiOutput {...props} /> : <Fields state={shownState} />}</>;
      break;
    }
    case "compare-options-approve": {
      const chosen = preview?.block === "compare-options-approve" ? preview.selectedId : state.selectedId;
      body = <><section><h2>Complete option values and evidence</h2>{state.options.map(option => <Card key={option.id}><section className="mcpcn-body">
        <h3>{option.label}{option.disabled ? " · unavailable" : ""}</h3><p>{option.description}</p><CompleteValue label={"Complete option value: " + option.label} value={option.value} />
        <ul>{option.evidence.map((evidence, index) => <li key={index} style={{ whiteSpace: "pre-wrap" }}>{evidence}</li>)}</ul></section></Card>)}</section>
        {chosen && <p role="status">{review ? "Prepared" : "Saved"} selection: {state.options.find(option => option.id === chosen)?.label}</p>}
        {!review && state.status === "ready" && <CompareOptionsApprove title={state.title} description={state.description} reviewId={view!.id + "/" + view!.revision}
          options={state.options} value={optionId} onValueChange={next => { controller.cancel(); setOptionId(next); }} onApprove={selected => void controller.prepare({ action: "choose", optionId: selected })}
          onCancel={() => setOptionId(null)} actionLabel="Prepare selected option review" busy={disabled} />}</>;
      break;
    }
    case "multi-step-tool-run": {
      const index = state.steps.findIndex(step => step.status !== "succeeded" && step.status !== "skipped"), eligible = state.steps[index];
      body = <><MultiStepToolRun title={state.title} description={state.description} steps={state.steps.map(step => ({ ...step, error: step.error ?? undefined }))} busy={controller.busy} />
        {state.steps.map(step => <section key={step.id}><h3>{step.label} · {step.attempts} attempts</h3>
          {step.error !== null && <p role="alert">{step.error}</p>}<CompleteValue label={"Complete step result: " + step.label} value={step.result} /></section>)}
        {!review && eligible && !state.steps.some(step => step.status === "running") && (eligible.status === "failed" || eligible.status === "queued") && <Button disabled={disabled}
          onClick={() => void controller.prepare({ action: eligible.status === "failed" ? "retry" : "run-step", stepId: eligible.id })}>{eligible.status === "failed" ? "Review retry: " : "Review next step: "}{eligible.label}</Button>}</>;
      break;
    }
    case "agent-generated-report-review": {
      const shownState = preview?.block === "agent-generated-report-review" ? preview : state;
      if (state.status === "approved") body = <><CompleteText label="Complete report summary" text={state.summary} />{state.sections.map(section => <CompleteText key={section.id} label={section.title} text={section.body} />)}
        <CompleteText label="Saved reviewed conclusion" text={state.conclusion} /><Sources sources={state.sources} /></>;
      else {
        const base = reviewProps ?? { reviewId: view!.id + "/" + view!.revision, title: state.title, description: state.description,
          changes: [{ label: "Report approval", before: "Not approved", after: "Prepare an exact reviewed conclusion" }],
          onApprove: () => void controller.prepare({ action: "review-report", conclusion }), onCancel: () => setConclusion(state.conclusion),
          actionLabel: "Prepare report review", busy: disabled };
        body = <><AgentGeneratedReportReview {...base} summary={shownState.summary} sections={shownState.sections} sources={shownState.sources}
          conclusion={review ? shownState.conclusion : conclusion} onConclusionChange={next => { controller.cancel(); setConclusion(next); }} />
          <Sources sources={shownState.sources} /></>;
        specializedReview = Boolean(reviewProps);
      }
      break;
    }
    case "file-upload-and-extract": {
      const shownState = preview?.block === "file-upload-and-extract" ? preview : state;
      const matched = file && selectedFile.current === file && state.file?.name === file.name && state.file.sha256 === selectedDigest;
      body = <>{!review && state.status !== "accepted" && <><label>Text document kind<select aria-label="Text document kind" disabled={disabled || reading} value={kind}
        onChange={event => { const selected = event.currentTarget.value; if (!["invoice", "contract", "resume"].includes(selected)) return;
          fileEpoch.current++; readingNow.current = false; setReading(false); setSelectedDigest(undefined); controller.cancel(); setKind(selected as typeof kind); }}>
        <option value="invoice">Invoice</option><option value="contract">Contract</option><option value="resume">Resume</option></select></label>
        <p>Invoice: Supplier:, Total:, Currency:. Contract: Party:, Effective date:, Term:. Resume: Name:, Email:, Experience:. Only explicit UTF-8 text extraction is supported.</p>
        <FileUploadAndExtract title={state.title} file={file} maxFileBytes={65536} accept=".txt,.md,text/plain,text/markdown" onFileChange={selectFile}
          onExtract={selected => void extractFile(selected)} onFileError={setFileError} busy={disabled || reading} error={fileError}
          extractedFor={matched && state.fields.every(field => field.value.trim().length > 0) ? file : null} extractedFields={matched ? state.fields : []} onAccept={() => void controller.prepare({ action: "accept-file" })} />
        {state.status === "extracted" && state.fields.some(field => !field.value.trim()) && <p role="alert">Required labeled lines are missing. Correct the source document and explicitly extract it again before acceptance.</p>}
        {state.status === "extracted" && !matched && <Button disabled={disabled || !state.fields.every(field => field.value.trim().length > 0)}
          onClick={() => void controller.prepare({ action: "accept-file" })}>Review acceptance of stored extraction</Button>}</>}
        <FileData state={shownState} />{state.status === "accepted" && <p role="status">This exact stored file and extraction are accepted. Start a new record to review another file.</p>}</>;
      break;
    }
    case "table-bulk-action-review": {
      const chosen = preview?.block === "table-bulk-action-review" ? preview.selectedIds : state.selectedIds;
      body = <>{!review && <TableBulkActionReview title={state.title} description={state.description} reviewId={view!.id + "/" + view!.revision} riskLevel={state.riskLevel}
        rows={state.rows} value={rowIds} onValueChange={next => { controller.cancel(); setRowIds(next); }}
        onApprove={selected => void controller.prepare({ action: "apply-rows", rowIds: selected })} onCancel={() => setRowIds([])} actionLabel="Prepare selected rows review" busy={disabled} />}
        {review && <section><h2>Exact prepared row selection</h2><ul>{state.rows.filter(row => chosen.includes(row.id)).map(row => <li key={row.id}>{row.label} · revision {row.revision}</li>)}</ul></section>}
        {state.rows.map(row => <section key={row.id}><h3>{row.label} · revision {row.revision}{row.disabled ? " · unavailable for another action" : ""}</h3>
          <Execution label={"Saved row result: " + row.label} value={row.execution} /></section>)}</>;
      break;
    }
  }
  return <main className="mcpcn mcpcn-stack" aria-label={state?.title ?? "MCP workflow block"} aria-busy={controller.busy || reading}
    style={{ padding: 16, width: "100%", minWidth: 0, boxSizing: "border-box", overflowWrap: "anywhere" }}>
    <header className="mcpcn-row mcpcn-between"><div><p className="mcpcn-hint">Persistent MCP workflow block</p><h1>{state?.title ?? "Open a workflow record"}</h1></div>
      <Button disabled={controller.busy || !controller.canRead} onClick={() => void controller.reload()}>Reload record</Button></header>
    {!controller.ready && <p role="status">Connect through the configured MCP host adapter before continuing.</p>}
    {controller.ready && !view && !controller.error && <p role="status">{controller.canRead ? "Loading the authorized block record…" : "Open this app through its read tool with a valid record identity."}</p>}
    {controller.error && <p role="alert" className="mcpcn-error">{controller.error}</p>}
    {view && <><p role="status" aria-label="Saved block revision and audit">Revision {view.revision} · {view.state.status} · {view.audit.length + view.earlierAuditEvents} saved audit events</p>
      <p style={{ whiteSpace: "pre-wrap" }}>{view.state.description}</p>{body}
      {review && <p>Review expires at {new Date(review.expiresAt).toISOString()}. Confirmation applies only the displayed server-owned terms.</p>}
      {reviewProps && !specializedReview && <ReviewBeforeAction {...reviewProps} />}
      <AuditTrail title="Saved audit trail" entries={view.audit.map(event => ({ id: String(event.sequence), label: event.summary,
        description: `Revision ${event.revision} · ${event.action}`, actor: event.actor, timestamp: event.at, status: "info" as const }))} />
      {view.earlierAuditEvents > 0 && <p>{view.earlierAuditEvents} earlier events remain in the database.</p>}</>}
  </main>;
}

export const ReviewBeforeActionApp = (props: BlockAppProps) => <BlockApp {...props} block="review-before-action" />;
export const CollectMissingDataApp = (props: BlockAppProps) => <BlockApp {...props} block="collect-missing-data" />;
export const ExtractReviewSaveApp = (props: BlockAppProps) => <BlockApp {...props} block="extract-review-save" />;
export const CompareOptionsApproveApp = (props: BlockAppProps) => <BlockApp {...props} block="compare-options-approve" />;
export const MultiStepToolRunApp = (props: BlockAppProps) => <BlockApp {...props} block="multi-step-tool-run" />;
export const ApprovalGatedToolCallApp = (props: BlockAppProps) => <BlockApp {...props} block="approval-gated-tool-call" />;
export const HumanCorrectsAiOutputApp = (props: BlockAppProps) => <BlockApp {...props} block="human-corrects-ai-output" />;
export const AgentGeneratedReportReviewApp = (props: BlockAppProps) => <BlockApp {...props} block="agent-generated-report-review" />;
export const FileUploadAndExtractApp = (props: BlockAppProps) => <BlockApp {...props} block="file-upload-and-extract" />;
export const TableBulkActionReviewApp = (props: BlockAppProps) => <BlockApp {...props} block="table-bulk-action-review" />;
export const AdminChangeReviewApp = (props: BlockAppProps) => <BlockApp {...props} block="admin-change-review" />;

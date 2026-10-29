"use client";

import { useId, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { ApprovalCard, AuditTrail, Button, Card, ToolProgressTimeline } from "./index.js";
import type { ApprovalCardData, AuditTrailData, ToolProgressTimelineData } from "@mcpcn/schemas";

export interface WorkflowStatusProps { busy?: boolean; error?: string }
export type WorkflowChange = NonNullable<ApprovalCardData["changes"]>[number];
export type WorkflowValue = string | boolean;
export type WorkflowValues = Record<string, WorkflowValue>;
export interface WorkflowField {
  name: string;
  label: string;
  type?: "text" | "email" | "number" | "textarea" | "select" | "boolean";
  required?: boolean;
  description?: string;
  source?: string;
  original?: WorkflowValue;
  options?: Array<{ value: string; label: string; disabled?: boolean }>;
}
export interface WorkflowFormProps extends WorkflowStatusProps {
  title: string;
  description?: string;
  fields: WorkflowField[];
  values: WorkflowValues;
  onValuesChange: (values: WorkflowValues) => void;
  onSubmit: (values: WorkflowValues) => void;
  submitLabel?: string;
}
export interface ReviewBeforeActionProps extends WorkflowStatusProps {
  reviewId: string;
  title: string;
  description?: string;
  changes: WorkflowChange[];
  riskLevel?: ApprovalCardData["riskLevel"];
  actionLabel?: string;
  requiresExplicitConsent?: boolean;
  consentLabel?: string;
  onApprove: () => void;
  onCancel: () => void;
  audit?: AuditTrailData;
}

function Feedback({ busy, error }: WorkflowStatusProps) {
  return <>{error && <p className="mcpcn-error" role="alert">{error}</p>}{busy && <p className="mcpcn-hint" role="status">Working…</p>}</>;
}
function Frame({ title, children, ...status }: WorkflowStatusProps & { title: string; children: ReactNode }) {
  return <section className="mcpcn mcpcn-stack" aria-label={title} aria-busy={Boolean(status.busy)}>{children}<Feedback {...status} /></section>;
}
function uniqueIds(items: Array<{ id: string }>) {
  return items.every(item => typeof item.id === "string" && Boolean(item.id.trim())) && new Set(items.map(item => item.id)).size === items.length;
}
function validFields(fields: WorkflowField[]) {
  return fields.length > 0 && uniqueIds(fields.map(field => ({ id: field.name })))
    && fields.every(field => field.type !== "select" || uniqueIds((field.options ?? []).map(option => ({ id: option.value }))));
}
function valuesFor(fields: WorkflowField[], values: WorkflowValues): WorkflowValues {
  return Object.fromEntries(fields.map(field => [field.name, values[field.name] ?? (field.type === "boolean" ? false : "")]));
}
function completeFields(fields: WorkflowField[], values: WorkflowValues) {
  return validFields(fields) && fields.every(field => {
    const value = values[field.name] ?? (field.type === "boolean" ? false : "");
    if (field.type === "boolean") return typeof value === "boolean" && (!field.required || value);
    if (typeof value !== "string" || (field.required && !value.trim())) return false;
    if (field.type === "select" && value !== "") return Boolean(field.options?.some(option => option.value === value && !option.disabled));
    return field.type !== "number" || value === "" || (/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value)));
  });
}
function ReviewGate({ canApprove = true, ...props }: ReviewBeforeActionProps & { canApprove?: boolean }) {
  // A changed revision or reviewed terms starts a fresh consent surface.
  const key = JSON.stringify([props.reviewId, props.title, props.description, props.changes, props.riskLevel, props.requiresExplicitConsent, props.consentLabel]);
  return <><fieldset disabled={!canApprove || !props.reviewId.trim()} aria-label="Review action" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><ApprovalCard key={key} title={props.title} description={props.description} changes={props.changes}
    riskLevel={props.riskLevel ?? "medium"} actionLabel={props.actionLabel ?? "Approve"}
    requiresExplicitConsent={props.requiresExplicitConsent ?? false} consentLabel={props.consentLabel}
    busy={props.busy}
    onAction={action => {
      if (props.busy) return;
      if (action.type === "approve" && canApprove && props.reviewId.trim()) props.onApprove();
      if (action.type === "cancel") props.onCancel();
    }} /></fieldset>{props.audit && <AuditTrail {...props.audit} />}</>;
}
function ControlledForm({ title, description, fields, values, onValuesChange, onSubmit, submitLabel = "Continue", busy, error }: WorkflowFormProps) {
  const id = useId(), coherent = validFields(fields);
  const change = (field: WorkflowField, value: WorkflowValue) => {
    if (!busy && coherent) onValuesChange({ ...values, [field.name]: value });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!busy && completeFields(fields, values)) onSubmit(valuesFor(fields, values));
  };
  return <Frame title={title} busy={busy} error={error}><Card><form aria-label={title} onSubmit={submit}>
    <header className="mcpcn-header"><h3 className="mcpcn-title">{title}</h3>{description && <p className="mcpcn-description">{description}</p>}</header>
    <fieldset disabled={busy || !coherent} className="mcpcn-body mcpcn-stack" style={{ border: 0, margin: 0, minWidth: 0 }}>
      <legend className="mcpcn-hint">Fields to review</legend>
      {!fields.length && <p role="status">No fields to complete.</p>}
      {fields.length > 0 && !coherent && <p role="alert">Field or choice identities are missing or repeated.</p>}
      {fields.map((field, index) => {
        const inputId = `${id}-${index}`, value = values[field.name] ?? (field.type === "boolean" ? false : "");
        return <div className="mcpcn-stack" key={`${field.name}-${index}`} style={{ gap: 5 }}>
          <label className="mcpcn-label" htmlFor={inputId}>{field.label}{field.required ? " (required)" : ""}</label>
          {field.type === "textarea" ? <textarea id={inputId} className="mcpcn-input" aria-label={field.label} required={field.required} value={typeof value === "string" ? value : ""} onChange={event => change(field, event.currentTarget.value)} />
            : field.type === "select" ? <select id={inputId} className="mcpcn-input" aria-label={field.label} required={field.required} value={typeof value === "string" ? value : ""} onChange={event => change(field, event.currentTarget.value)}><option value="">Select…</option>{field.options?.map((option, optionIndex) => <option key={`${option.value}-${optionIndex}`} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select>
              : field.type === "boolean" ? <input id={inputId} type="checkbox" aria-label={field.label} required={field.required} checked={value === true} onChange={event => change(field, event.currentTarget.checked)} />
                : <input id={inputId} className="mcpcn-input" aria-label={field.label} type={field.type ?? "text"} step={field.type === "number" ? "any" : undefined} required={field.required} value={typeof value === "string" ? value : ""} onChange={event => change(field, event.currentTarget.value)} />}
          {field.original !== undefined && <p className="mcpcn-hint">Before: {String(field.original)} → After: {String(value)}</p>}
          {field.description && <p className="mcpcn-description">{field.description}</p>}
          {field.source && <p className="mcpcn-hint">Source: {field.source}</p>}
        </div>;
      })}
    </fieldset><footer className="mcpcn-footer"><Button type="submit" disabled={busy || !completeFields(fields, values)}>{submitLabel}</Button></footer>
  </form></Card></Frame>;
}

export function ReviewBeforeAction(props: ReviewBeforeActionProps) {
  return <Frame title={props.title} busy={props.busy} error={props.error}><ReviewGate {...props} /></Frame>;
}
export function CollectMissingData(props: WorkflowFormProps) {
  return <ControlledForm {...props} submitLabel={props.submitLabel ?? "Send information"} />;
}
export function ExtractReviewSave(props: WorkflowFormProps) {
  return <ControlledForm {...props} submitLabel={props.submitLabel ?? "Save reviewed fields"} />;
}

export interface WorkflowOption {
  id: string;
  label: string;
  description?: string;
  evidence: string[];
  changes: WorkflowChange[];
  disabled?: boolean;
}
export interface CompareOptionsApproveProps extends Omit<ReviewBeforeActionProps, "changes" | "onApprove"> {
  options: WorkflowOption[];
  value: string | null;
  onValueChange: (id: string) => void;
  onApprove: (id: string) => void;
}
export function CompareOptionsApprove({ options, value, onValueChange, onApprove, ...props }: CompareOptionsApproveProps) {
  const id = useId(), coherent = uniqueIds(options);
  const selected = coherent ? options.find(option => option.id === value && !option.disabled) : undefined;
  return <Frame title={props.title} busy={props.busy} error={props.error}>
    <fieldset disabled={props.busy || !coherent} className="mcpcn-stack" style={{ border: 0, padding: 0, margin: 0 }}><legend>Compare options</legend>
      {!options.length && <p role="status">No options available.</p>}
      {!coherent && <p role="alert">Option identities are missing or repeated.</p>}
      {options.map((option, index) => <Card key={`${option.id}-${index}`}><div className="mcpcn-body mcpcn-stack">
        <label className="mcpcn-row"><input type="radio" name={id} aria-label={option.label} checked={value === option.id} disabled={option.disabled}
          onChange={event => { if (!props.busy && coherent && !option.disabled && event.currentTarget.checked) onValueChange(option.id); }} /><strong>{option.label}</strong></label>
        {option.description && <p className="mcpcn-description">{option.description}</p>}
        {option.evidence.length ? <ul aria-label={`Evidence for ${option.label}`}>{option.evidence.map((item, evidenceIndex) => <li key={evidenceIndex}>{item}</li>)}</ul> : <p className="mcpcn-hint">No evidence supplied.</p>}
        {option.changes.map((change, changeIndex) => <p className="mcpcn-hint" key={changeIndex}>{change.label}: {String(change.before ?? "—")} → {String(change.after ?? "—")}</p>)}
      </div></Card>)}
    </fieldset>
    {!selected && <p role="status">Choose an available option before approving.</p>}
    <ReviewGate {...props} reviewId={JSON.stringify([props.reviewId, selected ?? value])} changes={selected?.changes ?? []} canApprove={Boolean(selected && props.reviewId.trim())}
      description={selected ? `${selected.label}${selected.description ? ` — ${selected.description}` : ""}` : props.description}
      onApprove={() => { if (selected && !props.busy) onApprove(selected.id); }} />
  </Frame>;
}

export interface MultiStepToolRunProps extends WorkflowStatusProps {
  title: string;
  description?: string;
  steps: ToolProgressTimelineData["steps"];
  onRetry?: (stepId: string) => void;
  audit?: AuditTrailData;
}
export function MultiStepToolRun({ title, description, steps, onRetry, audit, busy, error }: MultiStepToolRunProps) {
  const coherent = uniqueIds(steps);
  return <Frame title={title} busy={busy} error={error}><ToolProgressTimeline title={title} description={description} steps={steps} />
    {!steps.length && <p role="status">No workflow steps available.</p>}
    {!coherent && <p role="alert">Step identities are missing or repeated.</p>}
    {onRetry && steps.filter(step => step.status === "failed").map((step, index) => <Button key={`${step.id}-${index}`} type="button" disabled={busy || !coherent}
      onClick={() => { if (!busy && coherent && step.status === "failed") onRetry(step.id); }}>Retry {step.label}</Button>)}
    {audit && <AuditTrail {...audit} />}
  </Frame>;
}

export interface ApprovalGatedToolCallProps extends ReviewBeforeActionProps { toolName: string }
export function ApprovalGatedToolCall({ toolName, ...props }: ApprovalGatedToolCallProps) {
  return <Frame title={props.title} busy={props.busy} error={props.error}><p className="mcpcn-hint">Tool: {toolName || "Not specified"}</p>
    {!toolName.trim() && <p role="alert">A tool must be identified before approval.</p>}
    <ReviewGate {...props} reviewId={JSON.stringify([props.reviewId, toolName])} changes={[{ label: "Tool", after: toolName }, ...props.changes]}
      requiresExplicitConsent canApprove={Boolean(toolName.trim() && props.reviewId.trim())} />
  </Frame>;
}
export function HumanCorrectsAiOutput(props: WorkflowFormProps) {
  return <ControlledForm {...props} submitLabel={props.submitLabel ?? "Confirm corrections"} />;
}

export interface WorkflowSource { id: string; label: string; url?: string }
export interface AgentGeneratedReportReviewProps extends ReviewBeforeActionProps {
  summary: string;
  sections?: Array<{ id: string; title: string; body: string }>;
  conclusion: string;
  onConclusionChange: (conclusion: string) => void;
  sources: WorkflowSource[];
}
function safeHref(value: string | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.href : null; } catch { return null; }
}
export function AgentGeneratedReportReview({ summary, sections = [], conclusion, onConclusionChange, sources, ...props }: AgentGeneratedReportReviewProps) {
  const id = useId(), coherent = uniqueIds(sources) && uniqueIds(sections);
  return <Frame title={props.title} busy={props.busy} error={props.error}><Card><div className="mcpcn-body mcpcn-stack">
    <h3 className="mcpcn-title">Report to review</h3><p style={{ whiteSpace: "pre-wrap" }}>{summary}</p>
    {sections.map((section, index) => <article key={`${section.id}-${index}`}><h4>{section.title}</h4><p style={{ whiteSpace: "pre-wrap" }}>{section.body}</p></article>)}
    <label className="mcpcn-label" htmlFor={id}>Conclusion</label><textarea id={id} className="mcpcn-input" value={conclusion} disabled={props.busy}
      onChange={event => { if (!props.busy) onConclusionChange(event.currentTarget.value); }} />
    <h4>Sources</h4>{sources.length ? <ul>{sources.map((source, index) => { const href = safeHref(source.url); return <li key={`${source.id}-${index}`}>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{source.label}</a> : <span>{source.label}{source.url ? ` — ${source.url}` : ""}</span>}</li>; })}</ul> : <p role="status">No sources supplied.</p>}
    {!coherent && <p role="alert">Report record identities are missing or repeated.</p>}
  </div></Card><ReviewGate {...props} reviewId={JSON.stringify([props.reviewId, summary, sections, sources])}
    actionLabel={props.actionLabel ?? "Approve report"} canApprove={coherent && Boolean(conclusion.trim() && props.reviewId.trim())}
    changes={[...props.changes, { label: "Conclusion", after: conclusion }]} />
  </Frame>;
}

export interface FileUploadAndExtractProps extends WorkflowStatusProps {
  title: string;
  file: File | null;
  maxFileBytes: number;
  accept?: string;
  onFileChange: (file: File | null) => void;
  onExtract: (file: File) => void;
  onFileError?: (message: string) => void;
  extractedFor?: File | null;
  extractedFields?: Array<{ id: string; label: string; value: string }>;
  onAccept?: (file: File) => void;
}
export function FileUploadAndExtract({ title, file, maxFileBytes, accept, onFileChange, onExtract, onFileError, extractedFor, extractedFields = [], onAccept, busy, error }: FileUploadAndExtractProps) {
  const id = useId();
  const [feedback, setFeedback] = useState<{ file: File | null; limit: number; message: string } | null>(null);
  const limitValid = Number.isSafeInteger(maxFileBytes) && maxFileBytes > 0;
  const validFile = Boolean(file && limitValid && Number.isSafeInteger(file.size) && file.size >= 0 && file.size <= maxFileBytes);
  const currentFeedback = feedback?.file === file && feedback.limit === maxFileBytes ? feedback.message : undefined;
  const extractedCurrent = Boolean(validFile && extractedFor === file && extractedFields.length && uniqueIds(extractedFields));
  const select = (event: ChangeEvent<HTMLInputElement>) => {
    if (busy) return;
    const selected = event.currentTarget.files?.item(0) ?? null;
    event.currentTarget.value = "";
    if (selected && (!limitValid || selected.size > maxFileBytes)) {
      const message = limitValid ? `Choose a file no larger than ${maxFileBytes} bytes.` : "The file size limit is unavailable.";
      setFeedback({ file, limit: maxFileBytes, message }); onFileError?.(message); return;
    }
    setFeedback(null); onFileChange(selected);
  };
  return <Frame title={title} busy={busy} error={error}><Card><div className="mcpcn-body mcpcn-stack"><h3 className="mcpcn-title">{title}</h3>
    <label className="mcpcn-label" htmlFor={id}>Choose a file</label><input id={id} type="file" accept={accept} disabled={busy || !limitValid} onChange={select} />
    <p className="mcpcn-hint">{limitValid ? `Maximum file size: ${maxFileBytes} bytes.` : "The file size limit is unavailable."}</p>
    {file ? <p>{file.name} · {file.size} bytes</p> : <p role="status">No file selected.</p>}
    {file && !validFile && <p role="alert">The selected file does not meet the current size limit.</p>}
    {currentFeedback && <p className="mcpcn-error" role="alert">{currentFeedback}</p>}
    <div className="mcpcn-row"><Button type="button" disabled={busy || !validFile} onClick={() => { if (!busy && validFile && file) onExtract(file); }}>Extract file</Button>
      <Button type="button" data-variant="secondary" disabled={busy || !file} onClick={() => { if (!busy) { setFeedback(null); onFileChange(null); } }}>Clear file</Button></div>
    {extractedFields.length > 0 && !extractedCurrent && <p role="status">The displayed extraction does not match the current file.</p>}
    {extractedCurrent && <><h4>Extracted fields</h4><dl>{extractedFields.map((field, index) => <div key={`${field.id}-${index}`}><dt>{field.label}</dt><dd style={{ whiteSpace: "pre-wrap" }}>{field.value}</dd></div>)}</dl>
      {onAccept && <Button type="button" disabled={busy} onClick={() => { if (!busy && extractedCurrent && file) onAccept(file); }}>Accept extracted fields</Button>}</>}
  </div></Card></Frame>;
}

export interface WorkflowRow { id: string; label: string; changes: WorkflowChange[]; disabled?: boolean }
export interface TableBulkActionReviewProps extends Omit<ReviewBeforeActionProps, "changes" | "onApprove"> {
  rows: WorkflowRow[];
  value: string[];
  onValueChange: (ids: string[]) => void;
  onApprove: (ids: string[]) => void;
}
export function TableBulkActionReview({ rows, value, onValueChange, onApprove, ...props }: TableBulkActionReviewProps) {
  const coherent = uniqueIds(rows), selectedIds = new Set(value);
  const current = coherent && selectedIds.size === value.length && value.every(id => rows.some(row => row.id === id && !row.disabled));
  const selected = current ? rows.filter(row => selectedIds.has(row.id)) : [];
  const changes = selected.flatMap(row => row.changes.map(change => ({ ...change, label: `${row.label}: ${change.label}` })));
  return <Frame title={props.title} busy={props.busy} error={props.error}><Card><div className="mcpcn-body mcpcn-stack"><h3 className="mcpcn-title">Rows to review</h3>
    <p role="status">{value.length} of {rows.length} rows selected.</p>
    {!rows.length && <p>No rows available.</p>}
    {(!coherent || !current) && <p role="alert">The selection contains unavailable or repeated records. Review it before approving.</p>}
    <fieldset disabled={props.busy || !coherent} style={{ border: 0, padding: 0, margin: 0 }}><legend>Select rows</legend>
      {rows.map((row, index) => <div className="mcpcn-stack" key={`${row.id}-${index}`}><label className="mcpcn-row"><input type="checkbox" aria-label={row.label} checked={selectedIds.has(row.id)} disabled={row.disabled}
        onChange={event => { if (!props.busy && coherent && !row.disabled) onValueChange(event.currentTarget.checked ? [...value.filter(id => id !== row.id), row.id] : value.filter(id => id !== row.id)); }} />{row.label}</label>
        {row.changes.map((change, changeIndex) => <p className="mcpcn-hint" key={changeIndex}>{change.label}: {String(change.before ?? "—")} → {String(change.after ?? "—")}</p>)}
      </div>)}
    </fieldset><Button type="button" data-variant="secondary" disabled={props.busy || !value.length} onClick={() => { if (!props.busy) onValueChange([]); }}>Clear selection</Button>
  </div></Card><ReviewGate {...props} reviewId={JSON.stringify([props.reviewId, value, selected])} changes={changes} canApprove={current && selected.length > 0 && Boolean(props.reviewId.trim())}
    description={`${selected.length} current rows will be included.`} onApprove={() => { if (!props.busy && current && selected.length) onApprove([...value]); }} />
  </Frame>;
}

export interface AdminChangeReviewProps extends ReviewBeforeActionProps { affectedCount: number; rollback: string }
export function AdminChangeReview({ affectedCount, rollback, ...props }: AdminChangeReviewProps) {
  const coherent = Number.isSafeInteger(affectedCount) && affectedCount >= 0 && Boolean(rollback.trim());
  return <Frame title={props.title} busy={props.busy} error={props.error}><p>{Number.isSafeInteger(affectedCount) && affectedCount >= 0 ? affectedCount : "Unknown"} affected.</p><p style={{ whiteSpace: "pre-wrap" }}>Rollback: {rollback || "Not supplied"}</p>
    {!coherent && <p role="alert">Supply a valid affected count and rollback guidance before approving.</p>}
    <ReviewGate {...props} requiresExplicitConsent={props.requiresExplicitConsent ?? true} canApprove={coherent}
      changes={[...props.changes, { label: "Affected records", after: affectedCount }, { label: "Rollback", after: rollback }]} />
  </Frame>;
}

"use client";

import { useState, type FormEvent } from "react";
import type { MCPCNSecurityManifest } from "@mcpcn/core";
import { ApprovalCardSchema, AuditTrailSchema, EntityReviewTableSchema, GenericComponentSchema, SchemaFormSchema, ToolProgressTimelineSchema, type ApprovalCardData, type AuditTrailData, type EntityReviewTableData, type ParsedApprovalCardData, type SchemaFormData, type ToolProgressTimelineData } from "@mcpcn/schemas";
import { Button, Card, Badge, Input, Textarea, Select, InvalidPayload } from "./primitives.js";
import { Feedback, revisionKey, useComponentAction } from "./component-helpers.js";
import type { ComponentProps } from "./component-types.js";

export type { ComponentAction, ComponentProps } from "./component-types.js";
export { Button, Card, Badge, Input, Textarea, Select, Alert, Skeleton, EmptyState, Tabs, Dialog, Tooltip, InvalidPayload } from "./primitives.js";
export { ConfirmationPanel, RiskReviewPanel, DiffViewer, SourceEvidencePanel } from "./review-components.js";
export { DynamicQuestionFlow, ExtractedFieldsReview, ComparisonMatrix, ScoreBreakdown } from "./decision-components.js";
export { ToolCallCard, RetryableErrorState, AuthRequiredCard } from "./execution-components.js";
export { ApprovalChecklist, BeforeSubmitConfirmation, DestructiveActionGuard, HumanOverridePanel, PermissionRequestCard } from "./approval-components.js";
export { ToolResultCard, RunningTaskCard, PartialResultViewer, QueuedStepList, ToolTraceViewer } from "./tool-workflow-components.js";
export { MissingDataRequest, MultiStepForm, InlineEditForm, FormProgressCard, ValidatedFieldList } from "./form-workflow-components.js";
export { DocumentPreview, FileReview } from "./file-review-components.js";
export { SourceList, EvidenceDrawer } from "./source-evidence-components.js";

export const ApprovalCardSecurity: MCPCNSecurityManifest = { modelVisible:["decision","reason"], privateOnly:["internalRecordId"], callsTools:["approvalTool"], destructive:true };
export function ApprovalCard(props: ComponentProps<ApprovalCardData>) {
  const parsed = ApprovalCardSchema.safeParse(props);
  if (!parsed.success) return <InvalidPayload title="Approval card could not be rendered" issues={parsed.error.issues.map(issue => issue.path.join(".") + ": " + issue.message)} />;
  return <ApprovalCardView key={revisionKey(parsed.data)} data={parsed.data} props={props} />;
}
function ApprovalCardView({ data, props }: { data: ParsedApprovalCardData; props: ComponentProps<ApprovalCardData> }) {
  const [consent, setConsent] = useState(false);
  const { send, busy, error } = useComponentAction(props.onAction, props.busy);
  const blocked = data.requiresExplicitConsent && !consent;
  return <Card className={props.className} aria-busy={busy}>
    <div className="mcpcn-header"><div className="mcpcn-row mcpcn-between"><h3 className="mcpcn-title">{data.title}</h3><Badge risk={data.riskLevel}>{data.riskLevel} risk</Badge></div>{data.description && <p className="mcpcn-description">{data.description}</p>}</div>
    <div className="mcpcn-body">
      {data.changes.length ? <div>{data.changes.map((change, index) => <div className="mcpcn-change" key={change.label + "-" + index}><strong>{change.label}</strong><span><span className="mcpcn-before">{String(change.before ?? "—")}</span> → <span className="mcpcn-after">{String(change.after ?? "—")}</span></span><span className="mcpcn-hint">{change.affectedCount !== undefined ? change.affectedCount + " affected" : change.confidence !== undefined ? Math.round(change.confidence * 100) + "% confidence" : ""}</span></div>)}</div> : <p className="mcpcn-description">No field-level changes were provided.</p>}
      {data.rollback && <p className="mcpcn-hint">Rollback: {data.rollback}</p>}
      {data.requiresExplicitConsent && <label className="mcpcn-row" style={{ marginTop: 14 }}><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.currentTarget.checked)} />{data.consentLabel ?? "I understand the impact of this action."}</label>}
      <Feedback busy={busy} error={props.error ?? error} />
    </div>
    <div className="mcpcn-footer mcpcn-row" style={{ justifyContent: "flex-end" }}>
      <Button type="button" data-variant="secondary" disabled={busy || !props.onAction} onClick={() => send({ type: "cancel" })}>{data.cancelLabel}</Button>
      <Button type="button" data-variant={data.riskLevel === "critical" ? "danger" : undefined} disabled={busy || blocked || !props.onAction} onClick={() => { if (!blocked) send({ type: "approve", data: { tool: data.approvalTool } }); }}>{busy ? "Working…" : data.actionLabel}</Button>
    </div>
  </Card>;
}

export function ToolProgressTimeline(props: ComponentProps<ToolProgressTimelineData>) { const parsed=ToolProgressTimelineSchema.safeParse(props); if(!parsed.success)return <InvalidPayload title="Progress data is invalid" issues={parsed.error.issues.map(i=>i.message)} />; const data=parsed.data; return <Card className={props.className}><div className="mcpcn-header"><h3 className="mcpcn-title">{data.title}</h3>{data.description&&<p className="mcpcn-description">{data.description}</p>}</div><div className="mcpcn-body mcpcn-stack">{data.steps.map(step=><div className="mcpcn-progress" key={step.id}><span className="mcpcn-progress-line"><i className="mcpcn-dot" data-status={step.status}/></span><div style={{paddingBottom:12}}><div className="mcpcn-row mcpcn-between"><strong>{step.label}</strong><Badge>{step.status}</Badge></div>{step.description&&<div className="mcpcn-description">{step.description}</div>}{step.error&&<div style={{color:"var(--mcpcn-danger)"}}>{step.error}</div>}{step.status==="failed"&&data.retryTool&&<Button style={{marginTop:8}} data-variant="secondary" onClick={()=>props.onAction?.({type:"retry",data:{stepId:step.id,tool:data.retryTool}})}>Retry step</Button>}</div></div>)}</div></Card> }

export function SchemaForm(props: ComponentProps<SchemaFormData>) {
  const parsed = SchemaFormSchema.safeParse(props);
  if (!parsed.success) return <InvalidPayload title="Form schema is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <SchemaFormView key={revisionKey(parsed.data)} data={parsed.data} props={props} />;
}
function SchemaFormView({ data, props }: { data: ReturnType<typeof SchemaFormSchema.parse>; props: ComponentProps<SchemaFormData> }) {
  const [values, setValues] = useState<Record<string, unknown>>(() => Object.fromEntries(data.fields.map(field => [field.name, field.value ?? (field.type === "boolean" ? false : "")])));
  const { send, busy, error } = useComponentAction(props.onAction, props.busy);
  const complete = data.fields.length > 0 && data.fields.every(field => {
    const value = values[field.name];
    if (field.type === "boolean") return typeof value === "boolean" && (!field.required || value);
    if (field.type === "number") return value === "" ? !field.required : typeof value === "number" && Number.isFinite(value);
    if (typeof value !== "string" || (field.required && !value.trim())) return false;
    return field.type !== "select" || value === "" || (field.options ?? []).some(option => option.value === value);
  });
  const change = (name: string, value: unknown) => { if (!busy) setValues(current => ({ ...current, [name]: value })); };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !complete || !props.onAction || !event.currentTarget.checkValidity()) return;
    const allowed = Object.fromEntries(data.fields.map(field => [field.name, values[field.name]]));
    send({ type: "submit", data: { values: allowed, tool: data.submitTool } });
  };
  return <Card className={props.className} aria-busy={busy}><form aria-label={data.title} onSubmit={submit}>
    <div className="mcpcn-header"><h3 className="mcpcn-title">{data.title}</h3>{data.description && <p className="mcpcn-description">{data.description}</p>}</div>
    <fieldset disabled={busy} className="mcpcn-body mcpcn-stack" style={{ border: 0, margin: 0, minWidth: 0 }}>
      <legend className="mcpcn-sr-only">Fields to complete</legend>
      {!data.fields.length && <p role="status">No fields to complete.</p>}
      {data.fields.map(field => <label className="mcpcn-label" key={field.name}>{field.label}
        {field.type === "textarea" ? <Textarea aria-label={field.label} required={field.required} value={String(values[field.name] ?? "")} onChange={event => change(field.name, event.currentTarget.value)} />
          : field.type === "select" ? <Select aria-label={field.label} required={field.required} value={String(values[field.name] ?? "")} onChange={event => change(field.name, event.currentTarget.value)}><option value="">Select…</option>{field.options?.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</Select>
            : field.type === "boolean" ? <input type="checkbox" required={field.required} checked={values[field.name] === true} onChange={event => change(field.name, event.currentTarget.checked)} />
              : <Input type={field.type} step={field.type === "number" ? "any" : undefined} required={field.required} value={String(values[field.name] ?? "")} onChange={event => change(field.name, field.type === "number" ? event.currentTarget.value === "" ? "" : event.currentTarget.valueAsNumber : event.currentTarget.value)} />}
        {field.description && <span className="mcpcn-hint">{field.description}</span>}
      </label>)}
      <Feedback busy={busy} error={props.error ?? error} />
    </fieldset>
    <div className="mcpcn-footer" style={{ textAlign: "right" }}><Button type="submit" disabled={busy || !complete || !props.onAction}>{busy ? "Working…" : data.submitLabel}</Button></div>
  </form></Card>;
}

export function EntityReviewTable(props: ComponentProps<EntityReviewTableData>) { const parsed=EntityReviewTableSchema.safeParse(props); if(!parsed.success)return <InvalidPayload title="Review table data is invalid" issues={parsed.error.issues.map(i=>i.message)} />; const data=parsed.data; return <Card className={props.className}><div className="mcpcn-header"><h3 className="mcpcn-title">{data.title}</h3>{data.description&&<p className="mcpcn-description">{data.description}</p>}</div><div className="mcpcn-table-wrap"><table className="mcpcn-table"><thead><tr>{data.columns.map(c=><th key={c.key}>{c.label}</th>)}<th>Confidence</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.id}>{data.columns.map(c=><td key={c.key}>{String(row.values[c.key]??"—")}</td>)}<td>{row.confidence===undefined?"—":`${Math.round(row.confidence*100)}%`}</td></tr>)}</tbody></table></div>{data.actionLabel&&<div className="mcpcn-footer" style={{textAlign:"right"}}><Button onClick={()=>props.onAction?.({type:"confirm",data:{tool:data.actionTool,ids:data.rows.map(r=>r.id)}})}>{data.actionLabel}</Button></div>}</Card> }

export function AuditTrail(props: ComponentProps<AuditTrailData>) { const parsed=AuditTrailSchema.safeParse(props); if(!parsed.success)return <InvalidPayload title="Audit trail is invalid" issues={parsed.error.issues.map(i=>i.message)} />; return <Card className={props.className}><div className="mcpcn-header"><h3 className="mcpcn-title">{parsed.data.title}</h3></div><ol className="mcpcn-body mcpcn-stack" style={{listStyle:"none",margin:0}}>{parsed.data.entries.map(e=><li key={e.id} className="mcpcn-row" style={{alignItems:"flex-start"}}><Badge>{e.status}</Badge><div><strong>{e.label}</strong>{e.description&&<div className="mcpcn-description">{e.description}</div>}<div className="mcpcn-hint">{e.actor&&`${e.actor} · `}<time dateTime={e.timestamp}>{e.timestamp}</time></div></div></li>)}</ol></Card> }


export type GenericAgentComponentProps = ComponentProps<{ title:string; description?:string; status?:string; items?:Array<Record<string,unknown>>; actions?:Array<{label:string;value:string;destructive?:boolean}>; [key:string]:unknown }>;
export function GenericAgentComponent(props: GenericAgentComponentProps) { const parsed=GenericComponentSchema.safeParse(props); if(!parsed.success)return <InvalidPayload issues={parsed.error.issues.map(i=>i.message)} />; const data=parsed.data; return <Card className={props.className}><div className="mcpcn-header"><div className="mcpcn-row mcpcn-between"><h3 className="mcpcn-title">{data.title}</h3>{data.status&&<Badge>{data.status}</Badge>}</div>{data.description&&<p className="mcpcn-description">{data.description}</p>}</div>{data.items&&<div className="mcpcn-body mcpcn-stack">{data.items.map((item,index)=><div key={index} className="mcpcn-change">{Object.entries(item).slice(0,3).map(([key,value])=><span key={key}><span className="mcpcn-hint">{key}</span><br/>{String(value)}</span>)}</div>)}</div>}{data.actions?.length?<div className="mcpcn-footer mcpcn-row" style={{justifyContent:"flex-end"}}>{data.actions.map(a=><Button key={a.value} data-variant={a.destructive?"danger":undefined} onClick={()=>props.onAction?.({type:a.value})}>{a.label}</Button>)}</div>:null}</Card> }

export const RecordInspector=GenericAgentComponent, FieldConfidenceList=GenericAgentComponent, ConflictResolver=GenericAgentComponent, ValidationSummary=GenericAgentComponent;
export const OptionSelector=GenericAgentComponent, RecommendationCard=GenericAgentComponent, TradeoffPanel=GenericAgentComponent, RankingList=GenericAgentComponent, DecisionMemo=GenericAgentComponent;
export const ReasoningSummary=GenericAgentComponent, DataAccessNotice=GenericAgentComponent, PrivacyBoundaryCard=GenericAgentComponent, ConsentPanel=GenericAgentComponent, ModelContextPreview=GenericAgentComponent;
export const BillingGate=GenericAgentComponent, UnsupportedHostNotice=GenericAgentComponent, NoDataState=GenericAgentComponent, LoadingBridgeState=GenericAgentComponent, OfflineState=GenericAgentComponent, PermissionDeniedState=GenericAgentComponent, ExpiredSessionState=GenericAgentComponent;

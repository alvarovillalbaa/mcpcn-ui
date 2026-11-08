import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MCPCNPayload } from "@mcpcn/core";
import * as UI from "@mcpcn/react";
import * as Blocks from "@mcpcn/react/blocks";
import type { ApprovalCardData, AuditTrailData, AuthRequiredCardData, ComparisonMatrixData, ConfirmationPanelData, DiffViewerData, DynamicQuestionFlowData, EntityReviewTableData, ExtractedFieldsReviewData, RetryableErrorStateData, RiskReviewPanelData, SchemaFormData, ScoreBreakdownData, SourceEvidencePanelData, ToolCallCardData, ToolProgressTimelineData } from "@mcpcn/schemas";
import { playgroundItems, validateFixture, type BlockFixtures, type PrimitiveFixtures } from "./fixtures";

type Props = { payload: MCPCNPayload<string, unknown>; onAction: (action: UI.ComponentAction) => void | Promise<void> };
type Data = Record<string, unknown>;
type Answer = string | number | boolean;
const object = (value: unknown): value is Data => value !== null && typeof value === "object" && !Array.isArray(value);

/** Only external payload revisions reset local controls; local edits keep focus. */
export function PlaygroundComponent({ payload, onAction }: Props) {
  const parsed = validateFixture(payload);
  if (!parsed.success) return <UI.InvalidPayload title="Playground payload is invalid" issues={parsed.issues} />;
  return <Preview key={JSON.stringify(parsed.data)} payload={parsed.data} onAction={onAction} />;
}

function Preview({ payload, onAction }: Props) {
  const slug = payload.kind.slice(6), item = playgroundItems.find(item => item.slug === slug)!;
  const [data, setData] = useState<Data>(() => payload.data as Data);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState<string>();
  const mounted = useRef(true), active = useRef(false), latestIntent = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const busy = pending || data.busy === true;
  const emit = (action: UI.ComponentAction, controlled = false) => {
    if (!mounted.current || active.current || data.busy === true) return;
    const intent = ++latestIntent.current;
    setError(undefined);
    if (!controlled) active.current = true;
    try {
      const result = onAction(action);
      if (result && typeof result.then === "function") {
        // Controlled typing/selection never disables its input for a microtask.
        if (!controlled) setPending(true);
        void Promise.resolve(result).catch(() => { if (mounted.current && latestIntent.current === intent) setError("The preview intent could not be delivered."); })
          .finally(() => { if (!controlled) { active.current = false; if (mounted.current) setPending(false); } });
      } else if (!controlled) active.current = false;
    } catch { if (!controlled) active.current = false; if (mounted.current && latestIntent.current === intent) setError("The preview intent could not be delivered."); }
  };
  const replace = (patch: Data) => {
    setData(current => {
      const parsed = validateFixture({ ...payload, data: { ...current, ...patch } });
      return parsed.success ? parsed.data.data as Data : current;
    });
  };
  const receive = (action: UI.ComponentAction) => {
    if (busy || active.current) return;
    const next = controlledData(slug, data, action);
    if (next) replace(next);
    emit(action, next !== undefined);
  };
  const change = (patch: Data, type: string, value: unknown) => {
    if (busy || active.current) return;
    replace(patch); emit({ type, data: value }, true);
  };
  const common = { onAction: receive, busy, error: typeof data.error === "string" ? data.error : undefined };
  let component: ReactNode;
  if (item.kind === "specialized") {
    switch (slug) {
      case "approval-card": component = <UI.ApprovalCard {...data as ApprovalCardData} {...common} />; break;
      case "tool-progress-timeline": component = <UI.ToolProgressTimeline {...data as ToolProgressTimelineData} {...common} />; break;
      case "schema-form": component = <UI.SchemaForm {...data as SchemaFormData} {...common} />; break;
      case "entity-review-table": component = <UI.EntityReviewTable {...data as EntityReviewTableData} {...common} />; break;
      case "audit-trail": component = <UI.AuditTrail {...data as AuditTrailData} {...common} />; break;
      case "confirmation-panel": component = <UI.ConfirmationPanel {...data as ConfirmationPanelData} {...common} />; break;
      case "risk-review-panel": component = <UI.RiskReviewPanel {...data as RiskReviewPanelData} {...common} />; break;
      case "diff-viewer": component = <UI.DiffViewer {...data as DiffViewerData} {...common} />; break;
      case "source-evidence-panel": component = <UI.SourceEvidencePanel {...data as SourceEvidencePanelData} {...common} />; break;
      case "dynamic-question-flow": component = <UI.DynamicQuestionFlow {...data as DynamicQuestionFlowData} {...common} />; break;
      case "extracted-fields-review": component = <UI.ExtractedFieldsReview {...data as ExtractedFieldsReviewData} {...common} />; break;
      case "comparison-matrix": component = <UI.ComparisonMatrix {...data as ComparisonMatrixData} {...common} />; break;
      case "score-breakdown": component = <UI.ScoreBreakdown {...data as ScoreBreakdownData} {...common} />; break;
      case "tool-call-card": component = <UI.ToolCallCard {...data as ToolCallCardData} {...common} />; break;
      case "retryable-error-state": component = <UI.RetryableErrorState {...data as RetryableErrorStateData} {...common} />; break;
      case "auth-required-card": component = <UI.AuthRequiredCard {...data as AuthRequiredCardData} {...common} />; break;
    }
  } else if (item.kind === "generic-alias") {
    // Resolve the named public export; its shared implementation stays explicit.
    const Alias = UI[item.name as keyof typeof UI] as typeof UI.GenericAgentComponent;
    component = <><p className="mcpcn-hint">Generic alias of GenericAgentComponent.</p><Alias {...data as UI.GenericAgentComponentProps} {...common} /></>;
  } else if (item.kind === "primitive") {
    switch (slug) {
      case "button": { const d = data as PrimitiveFixtures["button"]; component = <UI.Button disabled={d.disabled || busy} onClick={() => emit({ type: "press" })}>{d.label}</UI.Button>; break; }
      case "card": { const d = data as PrimitiveFixtures["card"]; component = <UI.Card><div className="mcpcn-body"><h3>{d.title}</h3>{d.description && <p>{d.description}</p>}</div></UI.Card>; break; }
      case "badge": { const d = data as PrimitiveFixtures["badge"]; component = <UI.Badge risk={d.risk}>{d.label}</UI.Badge>; break; }
      case "tabs": { const d = data as PrimitiveFixtures["tabs"]; component = <UI.Tabs items={d.items} value={d.value} onValueChange={value => change({ value }, "tab-change", { value })} />; break; }
      case "dialog": { const d = data as PrimitiveFixtures["dialog"]; component = <><UI.Button disabled={busy || d.open} onClick={() => change({ open: true }, "open", {})}>Open {d.title}</UI.Button><UI.Dialog open={d.open} title={d.title} onClose={() => change({ open: false }, "close", {})}>{d.body}</UI.Dialog></>; break; }
      case "input": case "textarea": {
        const d = data as PrimitiveFixtures["input"];
        component = <label className="mcpcn-label">{d.label}{slug === "input"
          ? <UI.Input aria-label={d.label} value={d.value} placeholder={d.placeholder} disabled={d.disabled || busy} maxLength={8192} onChange={event => change({ value: event.currentTarget.value }, "value-change", { value: event.currentTarget.value })} />
          : <UI.Textarea aria-label={d.label} value={d.value} placeholder={d.placeholder} disabled={d.disabled || busy} maxLength={8192} onChange={event => change({ value: event.currentTarget.value }, "value-change", { value: event.currentTarget.value })} />}</label>; break;
      }
      case "select": { const d = data as PrimitiveFixtures["select"]; component = <label className="mcpcn-label">{d.label}<UI.Select aria-label={d.label} value={d.value} disabled={d.disabled || busy} onChange={event => change({ value: event.currentTarget.value }, "value-change", { value: event.currentTarget.value })}><option value="">Select…</option>{d.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</UI.Select></label>; break; }
      case "alert": { const d = data as PrimitiveFixtures["alert"]; component = <UI.Alert title={d.title}>{d.description}</UI.Alert>; break; }
      case "tooltip": { const d = data as PrimitiveFixtures["tooltip"]; component = <UI.Tooltip label={d.label}>{d.text}</UI.Tooltip>; break; }
      case "skeleton": component = <UI.Skeleton />; break;
      case "empty-state": component = <UI.EmptyState {...data as PrimitiveFixtures["empty-state"]} />; break;
    }
  } else {
    const approve = () => emit({ type: "approve", data: { reviewId: data.reviewId } });
    const cancel = () => emit({ type: "cancel", data: { reviewId: data.reviewId } });
    const status = { busy, error: typeof data.error === "string" ? data.error : undefined };
    switch (slug) {
      case "review-before-action": component = <Blocks.ReviewBeforeAction {...data as BlockFixtures["review-before-action"]} {...status} onApprove={approve} onCancel={cancel} />; break;
      case "approval-gated-tool-call": component = <Blocks.ApprovalGatedToolCall {...data as BlockFixtures["approval-gated-tool-call"]} {...status} onApprove={approve} onCancel={cancel} />; break;
      case "admin-change-review": component = <Blocks.AdminChangeReview {...data as BlockFixtures["admin-change-review"]} {...status} onApprove={approve} onCancel={cancel} />; break;
      case "collect-missing-data": case "extract-review-save": case "human-corrects-ai-output": {
        const Form = slug === "collect-missing-data" ? Blocks.CollectMissingData : slug === "extract-review-save" ? Blocks.ExtractReviewSave : Blocks.HumanCorrectsAiOutput;
        component = <Form {...data as BlockFixtures["collect-missing-data"]} {...status} onValuesChange={values => change({ values }, "values-change", { values })} onSubmit={values => emit({ type: "submit", data: { values } })} />; break;
      }
      case "compare-options-approve": component = <Blocks.CompareOptionsApprove {...data as BlockFixtures["compare-options-approve"]} {...status} onValueChange={value => change({ value }, "selection-change", { selectedId: value })} onApprove={value => emit({ type: "approve", data: { reviewId: data.reviewId, selectedId: value } })} onCancel={cancel} />; break;
      case "multi-step-tool-run": component = <Blocks.MultiStepToolRun {...data as BlockFixtures["multi-step-tool-run"]} {...status} onRetry={stepId => emit({ type: "retry", data: { stepId } })} />; break;
      case "agent-generated-report-review": component = <Blocks.AgentGeneratedReportReview {...data as BlockFixtures["agent-generated-report-review"]} {...status} onConclusionChange={conclusion => change({ conclusion }, "conclusion-change", { conclusion })} onApprove={() => emit({ type: "approve", data: { reviewId: data.reviewId, conclusion: data.conclusion } })} onCancel={cancel} />; break;
      case "table-bulk-action-review": component = <Blocks.TableBulkActionReview {...data as BlockFixtures["table-bulk-action-review"]} {...status} onValueChange={value => change({ value }, "selection-change", { selectedIds: value })} onApprove={value => emit({ type: "approve", data: { reviewId: data.reviewId, selectedIds: value } })} onCancel={cancel} />; break;
      case "file-upload-and-extract": component = <><p className="mcpcn-hint">Local selection emits metadata only. This preview does not read, extract or upload the file.</p><Blocks.FileUploadAndExtract {...data as BlockFixtures["file-upload-and-extract"]} {...status} file={file}
        onFileChange={value => { if (!busy) { setFile(value); emit({ type: "file-change", data: { file: fileMetadata(value) } }, true); } }}
        onExtract={value => emit({ type: "extract", data: { file: fileMetadata(value) } })} onFileError={() => emit({ type: "file-refused" })} /></>; break;
    }
  }
  return <div className="mcpcn mcpcn-stack"><fieldset disabled={busy} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }} aria-busy={busy}>{component ?? <UI.InvalidPayload issues={["fixture_renderer_unavailable"]} />}</fieldset>
    {pending && <p role="status">Delivering preview intent…</p>}{error && <UI.Alert title="Preview intent failed">{error}</UI.Alert>}</div>;
}

function fileMetadata(file: File | null) {
  return file ? { name: file.name.slice(0, 240).replace(/[\u0000-\u001f\u007f]/g, ""), bytes: file.size, type: file.type.slice(0, 120) } : null;
}

function controlledData(slug: string, current: Data, action: UI.ComponentAction): Data | undefined {
  const value = action.data;
  if (!object(value)) return undefined;
  switch (slug) {
    case "risk-review-panel": {
      const d = current as RiskReviewPanelData;
      if (action.type !== "acknowledge-risk" || typeof value.riskId !== "string" || typeof value.acknowledged !== "boolean" || !d.risks.some(risk => risk.id === value.riskId)) return undefined;
      return { acknowledgedRiskIds: value.acknowledged ? [...new Set([...(d.acknowledgedRiskIds ?? []), value.riskId])] : (d.acknowledgedRiskIds ?? []).filter(id => id !== value.riskId) };
    }
    case "diff-viewer": return action.type === "select-change" && typeof value.changeId === "string" ? { selectedChangeId: value.changeId } : undefined;
    case "source-evidence-panel": return action.type === "select-source" && typeof value.sourceId === "string" ? { selectedSourceId: value.sourceId } : undefined;
    case "dynamic-question-flow": {
      const d = current as DynamicQuestionFlowData;
      if (action.type === "question-change" && typeof value.questionId === "string") return { currentQuestionId: value.questionId };
      if (action.type === "answer-change" && typeof value.questionId === "string" && ["string", "number", "boolean"].includes(typeof value.value)) return { answers: { ...d.answers, [value.questionId]: value.value as Answer } };
      return undefined;
    }
    case "extracted-fields-review": {
      const d = current as ExtractedFieldsReviewData;
      return action.type === "correction-change" && typeof value.fieldId === "string" && typeof value.value === "string"
        ? { fields: d.fields.map(field => field.id === value.fieldId ? { ...field, value: value.value as string } : field) } : undefined;
    }
    case "comparison-matrix": return action.type === "selection-change" && (value.selectedId === null || typeof value.selectedId === "string") ? { selectedId: value.selectedId } : undefined;
    case "score-breakdown": return action.type === "criterion-review" && typeof value.criterionId === "string" ? { selectedCriterionId: value.criterionId } : undefined;
    default: return undefined;
  }
}

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MCPCNPayload } from "@mcpcn/core";
import * as UI from "@mcpcn/react";
import * as Blocks from "@mcpcn/react/blocks";
import type { ApprovalCardData, ApprovalChecklistData, BeforeSubmitConfirmationData, DestructiveActionGuardData, HumanOverridePanelData, PermissionRequestCardData, AuditTrailData, AuthRequiredCardData, ComparisonMatrixData, ConfirmationPanelData, DiffViewerData, DynamicQuestionFlowData, EntityReviewTableData, ExtractedFieldsReviewData, RetryableErrorStateData, RiskReviewPanelData, SchemaFormData, ScoreBreakdownData, SourceEvidencePanelData, ToolCallCardData, ToolProgressTimelineData } from "@mcpcn/schemas";
import { playgroundItems, validateFixture, type BlockFixtures, type PrimitiveFixtures } from "./fixtures";
import type { ToolResultCardData, RunningTaskCardData, PartialResultViewerData, QueuedStepListData, ToolTraceViewerData } from "@mcpcn/schemas";
import type { MissingDataRequestData, MultiStepFormData, InlineEditFormData, FormProgressCardData, ValidatedFieldListData } from "@mcpcn/schemas";
import type { DocumentPreviewData, FileReviewData } from "@mcpcn/schemas";
import { sameReviewFile } from "@mcpcn/schemas";
import { stableReviewKey, type SourceListData, type EvidenceDrawerData } from "@mcpcn/schemas";

type Props = { payload: MCPCNPayload<string, unknown>; onAction: (action: UI.ComponentAction) => void | Promise<void> };
type Data = Record<string, unknown>;
type Answer = string | number | boolean;
const object = (value: unknown): value is Data => value !== null && typeof value === "object" && !Array.isArray(value);

/** Only external payload revisions reset local controls; local edits keep focus. */
export function PlaygroundComponent({ payload, onAction }: Props) {
  const parsed = validateFixture(payload);
  if (!parsed.success) return <UI.InvalidPayload title="Playground payload is invalid" issues={parsed.issues} />;
  const identity = evidencePreviewKey(parsed.data);
  if (identity) return <EvidencePreview key={identity} payload={parsed.data} onAction={onAction} />;
  return <Preview key={JSON.stringify(parsed.data)} payload={parsed.data} onAction={onAction} />;
}

/** Only the two evidence contracts preserve native control/presentation identity. */
export function evidencePreviewKey(payload: MCPCNPayload<string, unknown>): string | undefined {
  if (payload.kind !== "mcpcn/source-list" && payload.kind !== "mcpcn/evidence-drawer") return undefined;
  const data = payload.data as SourceListData | EvidenceDrawerData;
  return stableReviewKey({ kind: payload.kind, id: data.id, revision: data.revision });
}
function EvidencePreview({ payload, onAction }: Props) {
  const externalKey = stableReviewKey(payload.data), slug = payload.kind.slice(6);
  const [stored, setStored] = useState(() => ({ externalKey, data: payload.data as Data }));
  const current = stored.externalKey === externalKey ? stored : { externalKey, data: payload.data as Data };
  if (stored !== current) setStored(current);
  const receive = (action: UI.ComponentAction) => {
    const patch = controlledData(slug, current.data, action);
    if (patch) setStored({ externalKey, data: { ...current.data, ...patch } });
    return onAction(action);
  };
  return <div className="mcpcn mcpcn-stack">{slug === "source-list"
    ? <UI.SourceList {...current.data as SourceListData} onAction={receive} />
    : <UI.EvidenceDrawer {...current.data as EvidenceDrawerData} onAction={receive} />}</div>;
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
      case "approval-checklist": component = <UI.ApprovalChecklist {...data as ApprovalChecklistData} {...common} />; break;
      case "before-submit-confirmation": component = <UI.BeforeSubmitConfirmation {...data as BeforeSubmitConfirmationData} {...common} />; break;
      case "destructive-action-guard": component = <UI.DestructiveActionGuard {...data as DestructiveActionGuardData} {...common} />; break;
      case "human-override-panel": component = <UI.HumanOverridePanel {...data as HumanOverridePanelData} {...common} />; break;
      case "permission-request-card": component = <UI.PermissionRequestCard {...data as PermissionRequestCardData} {...common} />; break;
      case "tool-progress-timeline": component = <UI.ToolProgressTimeline {...data as ToolProgressTimelineData} {...common} />; break;
      case "tool-result-card": component = <UI.ToolResultCard {...data as ToolResultCardData} {...common} />; break;
      case "running-task-card": component = <UI.RunningTaskCard {...data as RunningTaskCardData} {...common} />; break;
      case "partial-result-viewer": component = <UI.PartialResultViewer {...data as PartialResultViewerData} {...common} />; break;
      case "queued-step-list": component = <UI.QueuedStepList {...data as QueuedStepListData} {...common} />; break;
      case "tool-trace-viewer": component = <UI.ToolTraceViewer {...data as ToolTraceViewerData} {...common} />; break;
      case "missing-data-request": component = <UI.MissingDataRequest {...data as MissingDataRequestData} {...common} />; break;
      case "multi-step-form": component = <UI.MultiStepForm {...data as MultiStepFormData} {...common} />; break;
      case "inline-edit-form": component = <UI.InlineEditForm {...data as InlineEditFormData} {...common} />; break;
      case "form-progress-card": component = <UI.FormProgressCard {...data as FormProgressCardData} {...common} />; break;
      case "validated-field-list": component = <UI.ValidatedFieldList {...data as ValidatedFieldListData} {...common} />; break;
      case "document-preview": component = <UI.DocumentPreview {...data as DocumentPreviewData} {...common} />; break;
      case "file-review": component = <UI.FileReview {...data as FileReviewData} {...common} />; break;
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

export function controlledData(slug: string, current: Data, action: UI.ComponentAction): Data | undefined {
  const value = action.data;
  if (!object(value)) return undefined;
  switch (slug) {
    case "source-list": {
      const d = current as SourceListData;
      return d.state === "ready" && d.selectedSourceId !== undefined && action.type === "select-source"
        && value.listId === d.id && value.listRevision === d.revision
        && d.sources.some(source => source.id === value.sourceId && source.revision === value.sourceRevision)
        ? { selectedSourceId: value.sourceId } : undefined;
    }
    // Opening acknowledgement is an explicit producer update, never a local echo.
    case "evidence-drawer": return undefined;
    case "document-preview": return documentViewPatch(current as DocumentPreviewData, action);
    case "file-review": {
      const data = current as FileReviewData, extraction = data.extraction;
      if (data.preview) {
        const patch = documentViewPatch(data.preview, action);
        if (patch) return { preview: { ...data.preview, ...patch } };
      }
      if (action.type !== "file-correction-change" || data.disabled || !data.file || !extraction
        || data.preview?.state !== "ready" || !sameReviewFile(data.file, data.preview.file)
        || value.reviewId !== data.id || value.fileId !== data.file.id || value.fileRevision !== data.file.revision
        || value.extractionId !== extraction.id || value.extractionRevision !== extraction.revision
        || extraction.fileId !== data.file.id || extraction.fileRevision !== data.file.revision
        || typeof value.fieldId !== "string" || typeof value.value !== "string" || value.value.length > 4000
        || !extraction.fields.some(field => field.id === value.fieldId && !field.disabled)) return undefined;
      return { extraction: { ...extraction, fields: extraction.fields.map(field => field.id === value.fieldId ? { ...field, value: value.value as string } : field) } };
    }
    case "multi-step-form": {
      const d = current as MultiStepFormData;
      return action.type === "change-form-step" && value.id === d.id && value.fromStepId === d.currentStepId
        && typeof value.stepId === "string" && d.steps.some(step => step.id === value.stepId)
        ? { currentStepId: value.stepId } : undefined;
    }
    case "form-progress-card": {
      const d = current as FormProgressCardData;
      return action.type === "select-form-progress-step" && value.id === d.id && typeof value.stepId === "string"
        && d.steps?.some(step => step.id === value.stepId) ? { selectedStepId: value.stepId } : undefined;
    }
    case "validated-field-list": {
      const d = current as ValidatedFieldListData;
      return action.type === "select-validated-field" && value.id === d.id && typeof value.fieldId === "string"
        && d.fields.some(field => field.id === value.fieldId) ? { selectedFieldId: value.fieldId } : undefined;
    }
    case "partial-result-viewer": {
      const d = current as PartialResultViewerData;
      return value.id === d.id && action.type === "select-result-part" && typeof value.partId === "string" && d.parts.some(part => part.id === value.partId)
        ? { selectedPartId: value.partId } : undefined;
    }
    case "queued-step-list": {
      const d = current as QueuedStepListData;
      return value.id === d.id && action.type === "select-queued-step" && typeof value.stepId === "string" && d.steps.some(step => step.id === value.stepId)
        ? { selectedStepId: value.stepId } : undefined;
    }
    case "tool-trace-viewer": {
      const d = current as ToolTraceViewerData;
      if (value.id !== d.id) return undefined;
      if (action.type === "change-trace-filter" && typeof value.kind === "string" && ["all", "input", "progress", "output", "error", "note"].includes(value.kind)) return { filterKind: value.kind };
      return action.type === "select-trace-event" && typeof value.eventId === "string" && d.events.some(event => event.id === value.eventId)
        ? { selectedEventId: value.eventId } : undefined;
    }
    case "approval-checklist": {
      const d = current as ApprovalChecklistData;
      if (value.reviewId !== d.reviewId || action.type !== "check-item" || typeof value.itemId !== "string" || typeof value.checked !== "boolean" || !d.items.some(item => item.id === value.itemId)) return undefined;
      return { checkedItemIds: value.checked ? [...new Set([...(d.checkedItemIds ?? []), value.itemId])] : (d.checkedItemIds ?? []).filter(id => id !== value.itemId) };
    }
    case "human-override-panel": {
      const d = current as HumanOverridePanelData;
      return value.reviewId === d.reviewId && action.type === "select-override-option" && typeof value.optionId === "string" && d.options.some(option => option.id === value.optionId)
        ? { selectedOptionId: value.optionId } : undefined;
    }
    case "permission-request-card": {
      const d = current as PermissionRequestCardData;
      if (value.reviewId !== d.reviewId || action.type !== "select-scope" || typeof value.scopeId !== "string" || typeof value.selected !== "boolean" || !d.scopes.some(scope => scope.id === value.scopeId)) return undefined;
      return { selectedScopeIds: value.selected ? [...new Set([...(d.selectedScopeIds ?? []), value.scopeId])] : (d.selectedScopeIds ?? []).filter(id => id !== value.scopeId) };
    }
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

/** View callbacks update selection only after checking the current representation. */
function documentViewPatch(data: DocumentPreviewData, action: UI.ComponentAction): Data | undefined {
  const value = action.data;
  if (!object(value) || data.state !== "ready" || value.previewId !== data.id || value.fileId !== data.file.id || value.fileRevision !== data.file.revision) return undefined;
  if (action.type === "document-page-change" && typeof value.pageId === "string" && data.content?.type === "pages" && data.content.pages.some(page => page.id === value.pageId)) return { selectedPageId: value.pageId };
  if (action.type === "document-source-change" && typeof value.sourceId === "string") {
    const source = data.sources?.find(source => source.id === value.sourceId);
    if (!source) return undefined;
    return { selectedSourceId: source.id, ...(source.pageId ? { selectedPageId: source.pageId } : {}) };
  }
  return undefined;
}

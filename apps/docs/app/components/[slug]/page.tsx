import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { catalog, componentDataSchema, findCatalogItem } from "@mcpcn/registry";
import { ApprovalDemo, AuditDemo, FormDemo, GenericDemo, ProgressDemo, ReviewDemo } from "../../../components/demos";
import { ConfirmationPanelDemo, RiskReviewPanelDemo, DiffViewerDemo, SourceEvidencePanelDemo } from "../../../components/v1-review-demos";
import { DynamicQuestionFlowDemo, ExtractedFieldsReviewDemo, ComparisonMatrixDemo, ScoreBreakdownDemo } from "../../../components/v1-decision-demos";
import { ToolCallCardDemo, RetryableErrorStateDemo, AuthRequiredCardDemo } from "../../../components/v1-execution-demos";
import { ApprovalChecklistDemo, BeforeSubmitConfirmationDemo, DestructiveActionGuardDemo, HumanOverridePanelDemo, PermissionRequestCardDemo } from "../../../components/approval-demos";
import { approvalExampleCode } from "../../../components/approval-examples";
import { ToolResultCardDemo, RunningTaskCardDemo, PartialResultViewerDemo, QueuedStepListDemo, ToolTraceViewerDemo } from "../../../components/tool-workflow-demos";
import { toolWorkflowExampleCode } from "../../../components/tool-workflow-examples";
import { MissingDataRequestDemo, MultiStepFormDemo, InlineEditFormDemo, FormProgressCardDemo, ValidatedFieldListDemo } from "../../../components/form-workflow-demos";
import { formWorkflowExampleCode } from "../../../components/form-workflow-examples";
import { DocumentPreviewDemo, FileReviewDemo } from "../../../components/file-review-demos";
import { fileReviewExampleCode } from "../../../components/file-review-examples";
import { SourceListDemo, EvidenceDrawerDemo, EvidenceDrawerStackDemo } from "../../../components/source-evidence-demos";
import { sourceEvidenceExampleCode } from "../../../components/source-evidence-examples";
import { RecordInspectorDemo, FieldConfidenceListDemo } from "../../../components/record-inspection-demos";
import { recordInspectionExampleCode } from "../../../components/record-inspection-examples";
import { ConflictResolverDemo, ValidationSummaryDemo } from "../../../components/conflict-validation-demos";
import { conflictValidationExampleCode } from "../../../components/conflict-validation-examples";
import { OptionSelectorDemo, RankingListDemo } from "../../../components/option-ranking-demos";
import { optionRankingExampleCode } from "../../../components/option-ranking-examples";
import { ComponentPreview } from "../../../components/component-preview";

export function generateStaticParams() { return catalog.map(item => ({ slug: item.slug })); }

const demos: Record<string, ReactNode> = {
  "approval-card": <ApprovalDemo />, "tool-progress-timeline": <ProgressDemo />,
  "approval-checklist": <ApprovalChecklistDemo />, "before-submit-confirmation": <BeforeSubmitConfirmationDemo />,
  "destructive-action-guard": <DestructiveActionGuardDemo />, "human-override-panel": <HumanOverridePanelDemo />,
  "permission-request-card": <PermissionRequestCardDemo />,
  "tool-result-card": <ToolResultCardDemo />, "running-task-card": <RunningTaskCardDemo />,
  "partial-result-viewer": <PartialResultViewerDemo />, "queued-step-list": <QueuedStepListDemo />, "tool-trace-viewer": <ToolTraceViewerDemo />,
  "missing-data-request": <MissingDataRequestDemo />, "multi-step-form": <MultiStepFormDemo />, "inline-edit-form": <InlineEditFormDemo />,
  "form-progress-card": <FormProgressCardDemo />, "validated-field-list": <ValidatedFieldListDemo />,
  "document-preview": <DocumentPreviewDemo />, "file-review": <FileReviewDemo />,
  "source-list": <SourceListDemo />, "evidence-drawer": <EvidenceDrawerDemo />,
  "record-inspector": <RecordInspectorDemo />, "field-confidence-list": <FieldConfidenceListDemo />,
  "conflict-resolver": <ConflictResolverDemo />, "validation-summary": <ValidationSummaryDemo />,
  "option-selector": <OptionSelectorDemo />, "ranking-list": <RankingListDemo />,
  "schema-form": <FormDemo />, "entity-review-table": <ReviewDemo />, "audit-trail": <AuditDemo />,
  "confirmation-panel": <ConfirmationPanelDemo />, "risk-review-panel": <RiskReviewPanelDemo />,
  "diff-viewer": <DiffViewerDemo />, "source-evidence-panel": <SourceEvidencePanelDemo />,
  "dynamic-question-flow": <DynamicQuestionFlowDemo />, "extracted-fields-review": <ExtractedFieldsReviewDemo />,
  "comparison-matrix": <ComparisonMatrixDemo />, "score-breakdown": <ScoreBreakdownDemo />,
  "tool-call-card": <ToolCallCardDemo />, "retryable-error-state": <RetryableErrorStateDemo />,
  "auth-required-card": <AuthRequiredCardDemo />
};
const events: Record<string, Array<[string, string]>> = {
  "approval-card": [["approve", "{ tool? }"], ["cancel", "No data"]],
  "approval-checklist": [["check-item", "{ reviewId, itemId, checked }"], ["approve-checklist", "{ reviewId, itemIds: current checked IDs }"], ["cancel", "{ reviewId }"]],
  "before-submit-confirmation": [["confirm-submit", "{ reviewId, fieldIds: all current IDs; no field values }"], ["cancel", "{ reviewId }"]],
  "destructive-action-guard": [["confirm-destructive", "{ reviewId, affectedCount }"], ["cancel", "{ reviewId }"]],
  "human-override-panel": [["select-override-option", "{ reviewId, optionId }"], ["override", "{ reviewId, optionId, reason: trimmed local reason }"], ["cancel", "{ reviewId }"]],
  "permission-request-card": [["select-scope", "{ reviewId, scopeId, selected }"], ["request-permission", "{ reviewId, scopeIds: current selected IDs }"], ["deny-permission", "{ reviewId }"]],
  "tool-progress-timeline": [["retry", "{ stepId, tool }"]],
  "tool-result-card": [["inspect-result", "{ id, tool, status; no result or error detail }"]],
  "running-task-card": [["inspect-task", "{ id }"], ["cancel-task", "{ id, status }"]],
  "partial-result-viewer": [["select-result-part", "{ id, partId }"], ["inspect-result-part", "{ id, partId, status, attempt }"], ["retry-result-part", "{ id, partId, attempt }"]],
  "queued-step-list": [["select-queued-step", "{ id, stepId }"], ["inspect-queued-step", "{ id, stepId, status, attempt }"], ["retry-queued-step", "{ id, stepId, attempt }"]],
  "tool-trace-viewer": [["change-trace-filter", "{ id, kind }"], ["select-trace-event", "{ id, eventId }"], ["inspect-trace-event", "{ id, eventId, kind }"]],
  "missing-data-request": [["submit-missing-data", "{ id, values: current requested supplied valid fields only; no known context }"], ["cancel-missing-data", "{ id }"]],
  "multi-step-form": [["change-form-step", "{ id, fromStepId, stepId; no draft values }"], ["submit-multi-step-form", "{ id, values: every current supplied valid field }"], ["cancel-multi-step-form", "{ id }"]],
  "inline-edit-form": [["commit-inline-edit", "{ id, changes: ordered { fieldId, op: set, value } or { fieldId, op: clear } }"], ["cancel-inline-edit", "{ id }"]],
  "form-progress-card": [["select-form-progress-step", "{ id, stepId }"], ["inspect-form-progress", "{ id }"], ["inspect-form-progress-step", "{ id, stepId, status }"]],
  "validated-field-list": [["select-validated-field", "{ id, fieldId }"], ["inspect-validated-field", "{ id, fieldId, status }"], ["validate-field", "{ id, fieldId; no raw value }"]],
  "document-preview": [["document-page-change", "{ previewId, fileId, fileRevision, pageId }"], ["document-source-change", "{ previewId, fileId, fileRevision, sourceId, pageId?; no content }"]],
  "file-review": [["file-correction-change", "{ reviewId, fileId, fileRevision, extractionId, extractionRevision, fieldId, value }"], ["save-file-review", "{ reviewId, fileId, fileRevision, extractionId, extractionRevision, values: current declared corrections }"], ["document-page-change / document-source-change", "Preview-scoped view identity only"]],
  "schema-form": [["submit", "{ values: current field allowlist, tool? }"]],
  "entity-review-table": [["confirm", "{ ids: current row IDs, tool? }"]],
  "audit-trail": [],
  "confirmation-panel": [["confirm", "{ reviewId, changeIds }"], ["cancel", "{ reviewId }"]],
  "risk-review-panel": [["acknowledge-risk", "{ reviewId, riskId, acknowledged }"], ["accept-risks", "{ reviewId, riskIds }"], ["cancel", "{ reviewId }"]],
  "diff-viewer": [["select-change", "{ reviewId, changeId }"]],
  "source-evidence-panel": [["select-source", "{ reviewId, sourceId }"]],
  "source-list": [["select-source", "{ listId, listRevision, sourceId, sourceRevision }"], ["inspect-source", "{ listId, listRevision, sourceId, sourceRevision }"]],
  "evidence-drawer": [["open-evidence", "{ drawerId, drawerRevision, sourceId?, sourceRevision? }"], ["close-evidence", "{ drawerId, drawerRevision, sourceId?, sourceRevision? }"]],
  "record-inspector": [["inspect-record-field", "{ componentId, componentRevision, recordId, recordRevision, fieldId, fieldRevision; no values or evidence }"], ["clear-record-field", "{ componentId, componentRevision, recordId, recordRevision }"]],
  "field-confidence-list": [["inspect-confidence-field", "{ componentId, componentRevision, fieldId, fieldRevision; no values, confidence or evidence }"], ["clear-confidence-field", "{ componentId, componentRevision }"]],
  "option-selector": [["select-option", "{ componentId, componentRevision, groupId, groupRevision, optionId, optionRevision; no values, confidence or evidence }"], ["clear-option", "{ componentId, componentRevision, groupId, groupRevision }"]],
  "ranking-list": [["inspect-ranked-option", "{ componentId, componentRevision, listId, listRevision, entryId, entryRevision; no values, ranks, scores, confidence or evidence }"], ["clear-ranked-option", "{ componentId, componentRevision, listId, listRevision }"]],
  "dynamic-question-flow": [["answer-change", "{ flowId, questionId, value }"], ["question-change", "{ flowId, questionId }"], ["submit", "{ flowId, answers: visible question allowlist }"]],
  "extracted-fields-review": [["correction-change", "{ reviewId, fieldId, value }"], ["submit", "{ reviewId, values: current field allowlist }"]],
  "comparison-matrix": [["selection-change", "{ comparisonId, selectedId }"], ["confirm", "{ comparisonId, selectedId }"]],
  "score-breakdown": [["criterion-review", "{ scoreId, criterionId }"]],
  "tool-call-card": [["inspect", "{ id, tool, arguments, status, result? }"]],
  "retryable-error-state": [["retry", "{ id, tool, arguments, attempt }"]],
  "auth-required-card": [["request-auth", "{ id, service, scopes: scope IDs }"]]
};
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function fieldType(value: unknown): string {
  const field = object(value);
  if (Array.isArray(field.enum)) return "enum";
  if (typeof field.type === "string") return field.type;
  if (Array.isArray(field.type)) return field.type.join(" | ");
  if (typeof field.$ref === "string") return "referenced value";
  if (Array.isArray(field.anyOf) || Array.isArray(field.oneOf)) return "union";
  return "structured value";
}

export default async function ComponentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params, item = findCatalogItem(slug);
  if (!item) notFound();
  const schema = componentDataSchema(slug);
  const variants = schema && Array.isArray(schema.oneOf ?? schema.anyOf) ? (schema.oneOf ?? schema.anyOf) as unknown[] : [];
  const properties = variants.length ? Object.assign({}, ...variants.map(variant => object(object(variant).properties))) as Record<string, unknown> : object(schema?.properties);
  const firstRequired = variants.length ? object(variants[0]).required : schema?.required;
  const requiredFields = variants.length && Array.isArray(firstRequired) ? firstRequired.filter(key => variants.every(variant => Array.isArray(object(variant).required) && (object(variant).required as unknown[]).includes(key))) : firstRequired;
  const required = new Set(Array.isArray(requiredFields) ? requiredFields.filter((value): value is string => typeof value === "string") : []);
  const implementation = item.category === "primitive" ? "Primitive" : item.specialized ? "Domain component" : "Shared informational alias";
  const toolWorkflowCode = toolWorkflowExampleCode(slug);
  const formWorkflowCode = formWorkflowExampleCode(slug);
  const fileReviewCode = fileReviewExampleCode(slug);
  const sourceEvidenceCode = sourceEvidenceExampleCode(slug);
  const recordInspectionCode = recordInspectionExampleCode(slug);
  const conflictValidationCode = conflictValidationExampleCode(slug);
  const optionRankingCode = optionRankingExampleCode(slug);
  const renderCode = optionRankingCode ?? conflictValidationCode ?? recordInspectionCode ?? sourceEvidenceCode ?? fileReviewCode ?? formWorkflowCode ?? toolWorkflowCode ?? approvalExampleCode(slug) ?? 'import { ' + item.name + ' } from "@mcpcn/react";\nimport { ' + item.name + 'Schema } from "@mcpcn/schemas";\n\nconst data = ' + item.name + 'Schema.parse(candidateData);\n<' + item.name + ' {...data} onAction={handleAction} />;';
  const serverCode = 'import { ' + item.name + 'Schema } from "@mcpcn/schemas";\nimport { createStructuredResult } from "@mcpcn/server";\n\nexport function reviewedResult(candidate: unknown) {\n  const data = ' + item.name + 'Schema.parse(candidate);\n  return createStructuredResult("' + item.slug + '", data);\n}';
  return <main>
    <span className="eyebrow">{item.category}</span><h1>{item.name}</h1><p className="lede">{item.description}</p>
    <div className="filter-row"><span className="pill">{implementation}</span><span className="pill">React</span>{schema && <span className="pill">Validated data</span>}</div>
    {!item.specialized && item.category !== "primitive" && <p>This name currently shares the generic informational-card implementation. Dedicated component behavior remains unfinished.</p>}
    <section className="preview-shell" aria-label={item.name + " preview"}>
      <ComponentPreview>
      {demos[slug] ?? (item.category !== "primitive" ? <GenericDemo title={item.name} /> : <p>A dedicated interactive preview for this primitive is not available yet.</p>)}
      </ComponentPreview>
    </section>
    {slug === "evidence-drawer" && <section className="preview-shell" aria-label="Native modal stacking example"><h2>Two native evidence views</h2><ComponentPreview><EvidenceDrawerStackDemo /></ComponentPreview></section>}
    <section className="section prose">
      <h2>Install</h2><pre className="code">pnpm dlx mcpcn add {item.slug}</pre>
      <p>Public npm availability is a separate release gate. The repository documentation records the currently verified source, archives and hosting profile.</p>
      {schema && <>
        <h2>Data props</h2><p>These fields come from the actual exported schema. Defaults may be omitted on input; the schema below describes validated output. Runtime checks also validate identities, conditional values and safe evidence links.</p>
        <div className="mcpcn-table-wrap"><table className="mcpcn-table"><caption>{item.name} data fields</caption><thead><tr><th>Field</th><th>Type</th><th>Input</th></tr></thead><tbody>
          {Object.entries(properties).map(([name, field]) => <tr key={name}><th scope="row"><code>{name}</code></th><td>{fieldType(field)}</td><td>{"default" in object(field) ? "Defaulted" : required.has(name) ? "Required" : "Optional"}</td></tr>)}
        </tbody></table></div>
        <h2>React integration</h2><pre className="code">{renderCode}</pre>
        {optionRankingCode && <>
          <h2>Supplied options and reported rankings</h2>
          <p>Select an option or ranked entry to read its complete escaped JSON and supplied evidence. Omitted selection is local; null or a current ID is controlled and waits for an explicit producer acknowledgement. Callback-free local reading and clearing remain available while notifications or external busy feedback are pending.</p>
          <p>Ranking rows retain their supplied order, noncontiguous or tied ranks and independent scores. A reported score or confidence of zero is distinct from Not supplied. Nothing sorts, computes a winner, verifies evidence, approves or saves a choice.</p>
          <p>Only current identities and revisions appear in selection and clear events. Values, labels, scores, ranks, confidence, evidence and URLs remain private application data. Catalogue privacy metadata does not redact structured content already sent to a model; choose model-safe results separately.</p>
          <p>Option groups contain 1–50 options and ranking lists contain 0–100 entries, with at most 20 evidence references per member and a collective 2 MiB parsed UTF-8 JSON budget. The shared playground retains its smaller 8192-unit string and 65536-byte result limits and refuses oversized input without truncation.</p>
        </>}
        {conflictValidationCode && <>
          <h2>Supplied choices and validation reports</h2>
          <p>Select a candidate or issue to read its complete escaped value, message and supplied evidence. Omitted selection is local; null or a current ID is controlled and waits for a producer acknowledgement. Callback-free local reading and clearing remain available while notifications or external busy feedback are pending.</p>
          <p>Confirm choice is a separate explicit intent. It needs a current selection and an available consumer, and it waits while externally busy or confirmation is pending. Successful settlement does not resolve, save or authorize a choice. Reported validation status remains the supplied report's claim, independent of issue severity or count.</p>
          <p>Current identities and revisions alone appear in events. Candidate values, issue contexts, messages, confidence, evidence and URLs remain private application data. Catalogue privacy metadata does not redact structured content already sent to a model. Keep model-safe output separate from the complete review data.</p>
          <p>Conflicts contain 2–20 candidates; validation reports contain 0–100 issues. Complete native DTOs fit 2 MiB parsed UTF-8 JSON and retain the existing per-value guards. The shared playground keeps its smaller 8192-unit string and 65536-byte result limits, rejecting oversized input without truncation.</p>
        </>}
        {recordInspectionCode && <>
          <h2>Inspect supplied fields</h2>
          <p>Select a current field to read its complete JSON value and supplied evidence. Null, false, zero, empty strings and nested values keep their types. Reported confidence of zero is displayed as 0%; omitted confidence is shown as Not supplied. Neither confidence nor evidence verifies accuracy or authorizes an action.</p>
          <p>Omit selectedFieldId for local inspection, including without a callback. Supplying null or a current ID makes selection controlled: acknowledge identity-only requests through new props. Busy or pending notification feedback does not prevent local reading. Replacing the current member clears local choice and fences obsolete feedback; unrelated appends preserve it.</p>
          <p>Each component accepts up to 100 fields with complete guarded JSON values, at most 20 evidence references per field and a collective 2 MiB parsed UTF-8 JSON budget. The shared playground retains its smaller 8192-unit string and 65536-byte result limits and refuses oversized input without truncation.</p>
          <p>Keep values, labels, confidence and evidence in app-only state. Inspection and clear events contain current identities/revisions only. The structured-result helper below includes its supplied data; private-field metadata does not redact values already sent to a model. Choose model-safe structured content separately from private inspection data.</p>
        </>}
        {sourceEvidenceCode && <>
          <h2>Supplied evidence</h2>
          <p>Sources, excerpts and support statements are caller-supplied claims. These components do not fetch URLs, verify sources, rank claims or persist content. Safe HTTP(S) links open only through explicit user action. Text and JSON render completely as escaped data.</p>
          <p>Native data fits 2 MiB of UTF-8 JSON, with text up to 65536 UTF-16 units and the existing guarded JSON limit of 1000 nodes/depth8. The playground keeps its smaller8192-unit string and65536-byte result limits and rejects oversized payloads without truncating them.</p>
          {slug === "source-list" ? <p>Omit selectedSourceId for local selection. Supplying an ID or null makes selection controlled: acknowledge current identity/revision intent through new props. Without a callback that controlled selection is read-only. Replacing the selected source clears local selection and fences stale feedback; unrelated appends preserve it.</p>
            : <><p>The native dialog opens after hydration through showModal. Close, Escape and a genuine backdrop click dismiss immediately, including during pending or rejected consumer notifications and external busy feedback. Notifications report presentation; they never authorize closing.</p>
              <p>Omit open for local presentation. False waits for an external true acknowledgement. A fresh true request opens once; unchanged true cannot reverse a user dismissal. Root or meaningful evidence replacement closes old content and fences old callbacks. The Open control can explicitly reopen a consumed request.</p>
              <p>The browser contains focus within the modal in its own document and restores a usable invoker. An iframe modal does not make its host document inert. Server-rendered closed dialog markup alone does not prove native modality, focus containment or assistive-technology compatibility.</p></>}
          <p>All view intents contain current identities and revisions only. Keep source labels, URLs, excerpts, supports and complete evidence in app-only state. PrivateOnly catalogue metadata does not redact content already supplied to a model; publish model context only through an explicit application decision.</p>
        </>}
        {fileReviewCode && <>
          <h2>Supplied representations</h2>
          <p>Inspect complete text, bounded JSON or up to twenty ordered pages containing text, PNG, JPEG or WebP data. The consumer owns reading, conversion, extraction and persistence. Supplied pages and reported confidence do not verify original file bytes or extraction accuracy.</p>
          <p>Only the selected raster page is mounted. Native page/source controls and fit/zoom support inspection; HTML, SVG, arbitrary image URLs and PDF embeds are not rendered. Header validation is bounded; a browser decode error remains visible beside supplied text.</p>
          <p>The native DTO budget is 2 MiB of UTF-8 JSON: text is at most 65536 UTF-16 units per page, each image at most 256 KiB decoded, images collectively at most 1 MiB, dimensions at most 4096 per side and 8 million pixels. JSON retains its existing descriptor-safe bounds. The playground editor has a smaller limit: 8192 units per string and 65536 UTF-8 bytes per result.</p>
          {slug === "file-review" && <p>File identity, revision and extraction identity must match the displayed ready preview before review and save intent become available. Corrections are caller-controlled. Review the current corrections, check the explicit confirmation, then request saving. Replacements or changed values invalidate confirmation. A rejected callback preserves current corrections; callback settlement does not mean a record was saved.</p>}
          <p>View intents carry identity only. Corrections and save intents deliberately contain reviewed private values. PrivateOnly catalogue metadata does not redact content already passed to a model. Keep private documents in app-only state and publish model context explicitly.</p>
        </>}
        <p><code>className</code> styles the surface and <code>onAction</code> receives consumer-owned intent. The new domain controls and revised approval/form surfaces expose <code>busy</code> and <code>error</code> feedback. Controlled selections and answers must be acknowledged by updating their props.</p>
        <h2>Events</h2>{events[slug]?.length ? <div className="mcpcn-table-wrap"><table className="mcpcn-table"><caption>{item.name} action payloads</caption><thead><tr><th>Action type</th><th>Data</th></tr></thead><tbody>{events[slug]!.map(([type, data]) => <tr key={type}><th scope="row"><code>{type}</code></th><td><code>{data}</code></td></tr>)}</tbody></table></div> : <p>This surface displays data and has no dedicated domain event contract.</p>}
        <h2>JSON Schema</h2><pre className="code" aria-label={item.name + " JSON Schema"}>{JSON.stringify(schema, null, 2)}</pre>
        <h2>Structured tool result</h2>{toolWorkflowCode && <p>This helper includes the supplied data in structured content. Choose model-safe input before using it: private-field metadata does not redact result values, messages or trace details already supplied to a model. Local inspection and retry callbacks send identity/status/attempt fields only.</p>}{formWorkflowCode && <p>This helper includes the supplied data in structured content; private metadata does not redact values already supplied to a model. Human-reviewed form submissions and inline commits contain their explicit current values or removals. Navigation, inspection and validation requests carry identity and reported state only. The consuming app must independently validate, authorize and persist any change; no callback implies successful saving or server validation.</p>}<pre className="code">{serverCode}</pre>
      </>}
      <h2>Security contract</h2>
      <p>Previews use authored data and consumer callbacks. Applications own authorization, persistence, tool execution and explicit model-context publication.</p>
      <p><strong>Declared model-visible fields:</strong> {item.security.modelVisible.join(", ") || "None"}</p>
      <p><strong>Private fields:</strong> {item.security.privateOnly.join(", ")}</p>
      <p><strong>Declared consumer tool intents:</strong> {item.security.callsTools.join(", ") || "None"}</p>
      <p><strong>Destructive intent:</strong> {item.security.destructive ? "Potentially; review the exact application action" : "No by default"}</p>
      <h2>Host and keyboard behavior</h2>
      <p>Host integration uses the consuming application's runtime provider. Native inputs, buttons, links and semantic tables expose the local interactions shown above. External-host compatibility and full accessibility conformance require their own acceptance evidence.</p>
      {formWorkflowCode && <p>Typed form drafts distinguish absent values from null, false, zero and empty text. Clear removes a supplied value. JSON stays in a labelled text editor; unsafe or malformed drafts cannot submit. Multi-step navigation is controlled, validates before moving forward and preserves drafts when moving back. Reported progress and validation labels are supplied facts, not inferred completion or authorization.</p>}
    </section>
  </main>;
}

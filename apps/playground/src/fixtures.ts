import type { MCPCNPayload } from "@mcpcn/core";
import { blockCatalog, catalog } from "@mcpcn/registry/catalog";
import { ApprovalCardSchema, AuditTrailSchema, GenericComponentSchema, ToolProgressTimelineSchema, schemaBySlug, toJSONSchema } from "@mcpcn/schemas";
import type { ApprovalChecklistData, BeforeSubmitConfirmationData, DestructiveActionGuardData, HumanOverridePanelData, PermissionRequestCardData } from "@mcpcn/schemas";
import type { AgentGeneratedReportReviewProps, CompareOptionsApproveProps, FileUploadAndExtractProps, MultiStepToolRunProps, ReviewBeforeActionProps, TableBulkActionReviewProps, WorkflowFormProps } from "@mcpcn/react/blocks";

export type PlaygroundItem = { slug: string; name: string; kind: "specialized" | "generic-alias" | "primitive" | "workflow-block" };
export const playgroundItems: readonly PlaygroundItem[] = [
  ...catalog.map(item => ({ slug: item.slug, name: item.name, kind: item.category === "primitive" ? "primitive" as const : item.specialized ? "specialized" as const : "generic-alias" as const })),
  ...blockCatalog.map(item => ({ slug: item.name, name: item.name.split("-").map(word => word[0]!.toUpperCase() + word.slice(1)).join(""), kind: "workflow-block" as const })),
];
const items = new Map(playgroundItems.map(item => [item.slug, item]));

export type PrimitiveFixtures = {
  button: { label: string; disabled?: boolean };
  card: { title: string; description?: string };
  badge: { label: string; risk?: "low" | "medium" | "high" | "critical" };
  tabs: { items: Array<{ value: string; label: string; content: string }>; value?: string };
  dialog: { open: boolean; title: string; body: string };
  input: { label: string; value: string; placeholder?: string; disabled?: boolean };
  textarea: { label: string; value: string; placeholder?: string; disabled?: boolean };
  select: { label: string; options: Array<{ value: string; label: string }>; value: string; disabled?: boolean };
  alert: { title: string; description?: string };
  tooltip: { label: string; text: string };
  skeleton: Record<string, never>;
  "empty-state": { title: string; description?: string };
};
type Review = Omit<ReviewBeforeActionProps, "onApprove" | "onCancel">;
type Form = Omit<WorkflowFormProps, "onValuesChange" | "onSubmit">;
export type BlockFixtures = {
  "review-before-action": Review;
  "collect-missing-data": Form;
  "extract-review-save": Form;
  "human-corrects-ai-output": Form;
  "compare-options-approve": Omit<CompareOptionsApproveProps, "onValueChange" | "onApprove" | "onCancel">;
  "multi-step-tool-run": Omit<MultiStepToolRunProps, "onRetry">;
  "approval-gated-tool-call": Review & { toolName: string };
  "agent-generated-report-review": Omit<AgentGeneratedReportReviewProps, "onConclusionChange" | "onApprove" | "onCancel">;
  "file-upload-and-extract": Pick<FileUploadAndExtractProps, "title" | "maxFileBytes" | "accept" | "busy" | "error">;
  "table-bulk-action-review": Omit<TableBulkActionReviewProps, "onValueChange" | "onApprove" | "onCancel">;
  "admin-change-review": Review & { affectedCount: number; rollback: string };
};

const change = { label: "Document status", before: "Draft", after: "Reviewed" };
const reviewTerms = { reviewId: "authored-review-1", title: "Review authored changes", requiresExplicitConsent: true, consentLabel: "I reviewed this authored example." };
const review = { ...reviewTerms, changes: [change] };
const fields = [{ name: "subject", label: "Subject", type: "text" as const, required: true }, { name: "notes", label: "Notes", type: "textarea" as const }];
const form = { title: "Complete authored fields", fields, values: { subject: "Authored example", notes: "Review before sending." } };
const steps = [{ id: "read", label: "Read authored input", status: "succeeded" as const }, { id: "review", label: "Review output", status: "failed" as const, error: "Authored retry example; no tool was called." }];
const primitiveFixtures: PrimitiveFixtures = {
  button: { label: "Send an intent" }, card: { title: "Authored card", description: "Edit this text in the payload." }, badge: { label: "Review needed", risk: "medium" },
  tabs: { items: [{ value: "summary", label: "Summary", content: "Authored summary" }, { value: "details", label: "Details", content: "Authored details" }], value: "summary" },
  dialog: { open: true, title: "Authored dialog", body: "Closing this dialog sends an intent only." },
  input: { label: "Subject", value: "Authored subject" }, textarea: { label: "Notes", value: "Authored notes" },
  select: { label: "Delivery", options: [{ value: "standard", label: "Standard" }, { value: "express", label: "Express" }], value: "standard" },
  alert: { title: "Review required", description: "This is an authored informational alert." }, tooltip: { label: "Authored help", text: "Hover or inspect this help text" },
  skeleton: {}, "empty-state": { title: "No authored records", description: "Supply records before continuing." },
};
const blockFixtures: BlockFixtures = {
  "review-before-action": review, "collect-missing-data": form, "extract-review-save": { ...form, title: "Review extracted fields" }, "human-corrects-ai-output": { ...form, title: "Correct authored output" },
  "compare-options-approve": { ...reviewTerms, options: [{ id: "standard", label: "Standard", evidence: ["Authored delivery estimate"], changes: [{ label: "Delivery", after: "Standard" }] }, { id: "express", label: "Express", evidence: ["Authored faster estimate"], changes: [{ label: "Delivery", after: "Express" }] }], value: null },
  "multi-step-tool-run": { title: "Authored tool progress", steps }, "approval-gated-tool-call": { ...review, toolName: "authored_preview_only" },
  "agent-generated-report-review": { ...review, summary: "Authored report; no model was called.", sections: [{ id: "findings", title: "Findings", body: "The authored input needs review." }], conclusion: "Review before approval.", sources: [{ id: "fixture", label: "Authored local fixture" }] },
  "file-upload-and-extract": { title: "File extraction intent", maxFileBytes: 1048576, accept: ".txt,.md" },
  "table-bulk-action-review": { ...reviewTerms, rows: [{ id: "row-a", label: "Document A", changes: [change] }, { id: "row-b", label: "Document B", changes: [change] }], value: [] },
  "admin-change-review": { ...review, affectedCount: 2, rollback: "Restore the previous authored values." },
};
const approvalFixtures = {
  "approval-checklist": { reviewId: "checklist-1", title: "Review authored checklist", description: "Review each required item. This example only emits intent.", items: [{ id: "scope", label: "Review affected records", required: true }, { id: "rollback", label: "Review rollback plan", required: true }, { id: "notes", label: "Include review notes", required: false }], checkedItemIds: [] },
  "before-submit-confirmation": { reviewId: "submission-1", title: "Review authored submission", description: "No form is sent by this preview.", fields: [{ id: "subject", label: "Subject", value: "Authored request" }, { id: "records", label: "Records", value: 2 }, { id: "notify", label: "Notify reviewers", value: false }] },
  "destructive-action-guard": { reviewId: "destructive-1", title: "Review authored destructive action", targetLabel: "Two authored draft records", summary: "The consuming app would remove these draft records.", affectedCount: 2, confirmationText: "REMOVE DRAFTS", rollback: "Restore the previous authored revision." },
  "human-override-panel": { reviewId: "override-1", title: "Review authored recommendation", recommendation: "Use the standard review route.", options: [{ id: "standard", label: "Standard review" }, { id: "manual", label: "Manual review" }, { id: "defer", label: "Defer review" }], recommendedOptionId: "standard" },
  "permission-request-card": { reviewId: "permission-1", title: "Review authored permission request", requester: "Authored review assistant", purpose: "Read the selected authored document metadata.", scopes: [{ id: "documents.read", label: "Read document metadata", required: true }, { id: "notes.read", label: "Read review notes", required: false }], selectedScopeIds: [] },
} satisfies {
  "approval-checklist": ApprovalChecklistData;
  "before-submit-confirmation": BeforeSubmitConfirmationData;
  "destructive-action-guard": DestructiveActionGuardData;
  "human-override-panel": HumanOverridePanelData;
  "permission-request-card": PermissionRequestCardData;
};
const specializedFixtures: Record<string, unknown> = {
  ...approvalFixtures,
  "approval-card": { title: "Approve authored changes", changes: [change], riskLevel: "medium", requiresExplicitConsent: true },
  "tool-progress-timeline": { title: "Authored progress", steps, retryTool: "authored_preview_only" },
  "schema-form": { title: "Authored request", fields: [{ name: "subject", label: "Subject", type: "text", required: true }, { name: "notes", label: "Notes", type: "textarea" }] },
  "entity-review-table": { title: "Authored documents", columns: [{ key: "name", label: "Document" }, { key: "state", label: "State" }], rows: [{ id: "doc-a", values: { name: "Document A", state: "Draft" }, confidence: 0.9 }], actionLabel: "Review row" },
  "audit-trail": { title: "Authored audit", entries: [{ id: "event-a", label: "Fixture prepared", actor: "Authored reviewer", timestamp: "2026-11-08T00:00:00.000Z", status: "info" }] },
  "confirmation-panel": { reviewId: "confirm-1", title: "Confirm authored changes", changes: [{ id: "status", ...change }] },
  "risk-review-panel": { reviewId: "risks-1", title: "Review authored risks", risks: [{ id: "visibility", label: "Visibility change", severity: "high", description: "Two authored records would change.", mitigation: "Review each record first." }], acknowledgedRiskIds: [], affectedCount: 2, rollback: "Restore authored values." },
  "diff-viewer": { reviewId: "diff-1", title: "Authored changes", changes: [{ id: "status", ...change }, { id: "count", label: "Count", before: 1, after: 2 }] },
  "source-evidence-panel": { reviewId: "sources-1", title: "Authored evidence", sources: [{ id: "note", label: "Authored note", excerpt: "This text was authored for the playground.", supports: ["Review before approval"] }] },
  "dynamic-question-flow": { id: "flow-1", title: "Authored questions", questions: [{ id: "goal", label: "Goal", type: "select", required: true, options: [{ id: "research", label: "Research" }, { id: "other", label: "Other" }] }, { id: "topic", label: "Topic", type: "text", required: true, when: { questionId: "goal", equals: "research" } }, { id: "reviewed", label: "I reviewed these answers", type: "boolean", required: true }], answers: {}, currentQuestionId: "goal" },
  "extracted-fields-review": { id: "extract-1", title: "Review authored extraction", fields: [{ id: "supplier", label: "Supplier", original: "Acme Labs", value: "Acme Labs", required: true, confidence: 0.97, evidence: [{ id: "line-a", label: "Authored line", text: "Supplier: Acme Labs" }] }] },
  "comparison-matrix": { id: "compare-1", title: "Compare authored options", criteria: [{ id: "cost", label: "Cost" }, { id: "days", label: "Days" }], options: [{ id: "standard", label: "Standard", values: { cost: 10, days: 3 } }, { id: "express", label: "Express", values: { cost: 20, days: 1 } }], selectedId: null },
  "score-breakdown": { id: "score-1", title: "Authored score", criteria: [{ id: "coverage", label: "Coverage", score: 8, maxScore: 10, weight: 2 }, { id: "cost", label: "Cost", score: 4, maxScore: 5, weight: 1 }], selectedCriterionId: null },
  "tool-call-card": { id: "call-1", title: "Authored tool call", tool: "lookup_authored_record", arguments: { recordId: "example-a" }, status: "succeeded", result: { found: true } },
  "retryable-error-state": { id: "retry-1", title: "Authored retry", message: "The authored request needs review.", tool: "lookup_authored_record", arguments: { recordId: "example-a" }, retryable: true, attempt: 1 },
  "auth-required-card": { id: "access-1", title: "Authored access request", service: "Authored workspace", scopes: [{ id: "records.read", label: "Read authored records" }], status: "required" },
};

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length <= 8192;
const label = (value: unknown): value is string => text(value) && value.length <= 240 && Boolean(value.trim());
const optional = (value: unknown, check: (value: unknown) => boolean) => value === undefined || check(value);
const bool = (value: unknown) => typeof value === "boolean";
const list = (value: unknown, check: (value: unknown) => boolean): value is unknown[] => Array.isArray(value) && value.length <= 100 && value.every(check);
const exact = (value: RecordValue, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const identities = (values: unknown[], key: string) => values.every(value => record(value) && label(value[key])) && new Set(values.map(value => (value as RecordValue)[key])).size === values.length;
const includesId = (values: unknown, key: string, id: unknown, available = false) => Array.isArray(values) && values.some(value => record(value) && value[key] === id && (!available || !value.disabled));
const choice = (value: unknown) => record(value) && exact(value, ["value", "label", "disabled"]) && label(value.value) && label(value.label) && optional(value.disabled, bool);
const changes = (value: unknown) => list(value, row => record(row) && exact(row, ["label", "before", "after", "confidence", "affectedCount"]) && label(row.label) && ApprovalCardSchema.safeParse({ title: "Review", changes: [row] }).success);
const statusKeys = ["busy", "error"];
const reviewKeys = ["reviewId", "title", "description", "changes", "riskLevel", "actionLabel", "requiresExplicitConsent", "consentLabel", "audit", ...statusKeys];
const status = (data: RecordValue) => optional(data.busy, bool) && optional(data.error, text);
function reviewData(data: RecordValue, withChanges = true) {
  return label(data.reviewId) && label(data.title) && optional(data.description, text)
    && (!withChanges || changes(data.changes)) && optional(data.riskLevel, value => typeof value === "string" && ["low", "medium", "high", "critical"].includes(value))
    && optional(data.actionLabel, label) && optional(data.requiresExplicitConsent, bool) && optional(data.consentLabel, label)
    && optional(data.audit, value => AuditTrailSchema.safeParse(value).success) && status(data);
}
function formData(data: RecordValue) {
  if (!label(data.title) || !optional(data.description, text) || !optional(data.submitLabel, label) || !status(data) || !record(data.values)
    || !list(data.fields, value => record(value) && exact(value, ["name", "label", "type", "required", "description", "source", "original", "options"])
      && label(value.name) && label(value.label) && optional(value.type, type => typeof type === "string" && ["text", "email", "number", "textarea", "select", "boolean"].includes(type))
      && optional(value.required, bool) && optional(value.description, text) && optional(value.source, text) && optional(value.original, original => text(original) || bool(original))
      && optional(value.options, options => list(options, choice) && identities(options, "value")))) return false;
  if (!identities(data.fields, "name")) return false;
  const fields = data.fields as Array<RecordValue>;
  return Object.entries(data.values).every(([key, value]) => {
    const field = fields.find(field => field.name === key);
    return field !== undefined && (field.type === "boolean" ? bool(value) : text(value)
      && (field.type !== "select" || value === "" || (field.options as Array<RecordValue> | undefined)?.some(option => option.value === value)));
  });
}
function primitiveData(slug: string, data: RecordValue): boolean {
  switch (slug) {
    case "button": return exact(data, ["label", "disabled"]) && label(data.label) && optional(data.disabled, bool);
    case "card": case "alert": case "empty-state": return exact(data, ["title", "description"]) && label(data.title) && optional(data.description, text);
    case "badge": return exact(data, ["label", "risk"]) && label(data.label) && optional(data.risk, risk => typeof risk === "string" && ["low", "medium", "high", "critical"].includes(risk));
    case "dialog": return exact(data, ["open", "title", "body"]) && bool(data.open) && label(data.title) && text(data.body);
    case "input": case "textarea": return exact(data, ["label", "value", "placeholder", "disabled"]) && label(data.label) && text(data.value) && optional(data.placeholder, text) && optional(data.disabled, bool);
    case "tooltip": return exact(data, ["label", "text"]) && label(data.label) && text(data.text);
    case "skeleton": return exact(data, []);
    case "tabs": return exact(data, ["items", "value"]) && list(data.items, item => record(item) && exact(item, ["value", "label", "content"]) && label(item.value) && label(item.label) && text(item.content))
      && identities(data.items, "value") && optional(data.value, value => includesId(data.items, "value", value));
    case "select": return exact(data, ["label", "options", "value", "disabled"]) && label(data.label) && optional(data.disabled, bool)
      && list(data.options, option => record(option) && exact(option, ["value", "label"]) && label(option.value) && label(option.label)) && identities(data.options, "value")
      && text(data.value) && (data.value === "" || includesId(data.options, "value", data.value));
    default: return false;
  }
}
function blockData(slug: string, data: RecordValue): boolean {
  switch (slug) {
    case "review-before-action": return exact(data, reviewKeys) && reviewData(data);
    case "approval-gated-tool-call": return exact(data, [...reviewKeys, "toolName"]) && reviewData(data) && label(data.toolName);
    case "admin-change-review": return exact(data, [...reviewKeys, "affectedCount", "rollback"]) && reviewData(data) && Number.isSafeInteger(data.affectedCount) && Number(data.affectedCount) >= 0 && label(data.rollback);
    case "collect-missing-data": case "extract-review-save": case "human-corrects-ai-output": return exact(data, ["title", "description", "fields", "values", "submitLabel", ...statusKeys]) && formData(data);
    case "multi-step-tool-run": return exact(data, ["title", "description", "steps", "audit", ...statusKeys]) && status(data)
      && ToolProgressTimelineSchema.safeParse(data).success && Array.isArray(data.steps) && identities(data.steps, "id") && optional(data.audit, value => AuditTrailSchema.safeParse(value).success);
    case "file-upload-and-extract": return exact(data, ["title", "maxFileBytes", "accept", ...statusKeys]) && label(data.title) && status(data)
      && Number.isSafeInteger(data.maxFileBytes) && Number(data.maxFileBytes) > 0 && Number(data.maxFileBytes) <= 1048576
      && optional(data.accept, value => typeof value === "string" && value.length <= 120 && /^(?:\.[a-z0-9]+)(?:,\.[a-z0-9]+)*$/i.test(value));
    case "compare-options-approve": return exact(data, [...reviewKeys.filter(key => key !== "changes"), "options", "value"]) && reviewData(data, false)
      && list(data.options, value => record(value) && exact(value, ["id", "label", "description", "evidence", "changes", "disabled"]) && label(value.id) && label(value.label)
        && optional(value.description, text) && list(value.evidence, text) && changes(value.changes) && optional(value.disabled, bool)) && identities(data.options, "id")
      && (data.value === null || includesId(data.options, "id", data.value, true));
    case "table-bulk-action-review": return exact(data, [...reviewKeys.filter(key => key !== "changes"), "rows", "value"]) && reviewData(data, false)
      && list(data.rows, value => record(value) && exact(value, ["id", "label", "changes", "disabled"]) && label(value.id) && label(value.label) && changes(value.changes) && optional(value.disabled, bool)) && identities(data.rows, "id")
      && list(data.value, label) && new Set(data.value).size === data.value.length && data.value.every(id => includesId(data.rows, "id", id, true));
    case "agent-generated-report-review": return exact(data, [...reviewKeys, "summary", "sections", "conclusion", "sources"]) && reviewData(data) && text(data.summary) && text(data.conclusion)
      && optional(data.sections, values => list(values, value => record(value) && exact(value, ["id", "title", "body"]) && label(value.id) && label(value.title) && text(value.body)) && identities(values, "id"))
      && list(data.sources, value => record(value) && exact(value, ["id", "label"]) && label(value.id) && label(value.label)) && identities(data.sources, "id");
    default: return false;
  }
}

/** Refuse non-JSON values before schema traversal; never invoke supplied getters. */
function boundedJSON(value: unknown): boolean {
  const seen = new Set<object>(); let nodes = 0, characters = 0;
  const visit = (value: unknown, depth: number): boolean => {
    if (++nodes > 4000 || depth > 16) return false;
    if (value === null || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "string") { characters += value.length; return value.length <= 8192 && characters <= 65536 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value); }
    if (typeof value !== "object" || seen.has(value)) return false;
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype) && !(Object.getPrototypeOf(value) === null && !array)) return false;
    if (Object.getOwnPropertySymbols(value).length || (array && value.length > 100)) return false;
    seen.add(value);
    const keys = Object.keys(value);
    if (keys.length > 100 || Object.getOwnPropertyNames(value).length !== keys.length + (array ? 1 : 0)
      || (array && (keys.length !== value.length || keys.some((key, index) => key !== String(index))))) return false;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (key.length > 128 || ["__proto__", "constructor", "prototype", "url", "href"].includes(key) || !descriptor || !("value" in descriptor) || !visit(descriptor.value, depth + 1)) return false;
    }
    seen.delete(value); return true;
  };
  return visit(value, 0);
}

export type FixtureValidation = { success: true; data: MCPCNPayload<string, unknown> } | { success: false; issues: string[] };
export function validateFixture(value: unknown): FixtureValidation {
  const refused = (issue: string): FixtureValidation => ({ success: false, issues: [issue] });
  try {
    if (!boundedJSON(value)) return refused("fixture_json_refused");
    if (!record(value) || !exact(value, ["kind", "version", "data", "stateVersion"]) || value.version !== 1 || typeof value.kind !== "string" || !value.kind.startsWith("mcpcn/")
      || !optional(value.stateVersion, version => Number.isSafeInteger(version) && Number(version) >= 0)) return refused("fixture_envelope_invalid");
    const slug = value.kind.slice(6), item = items.get(slug);
    if (!item || !record(value.data)) return refused("fixture_catalog_or_data_invalid");
    let data: unknown = value.data;
    if (item.kind === "specialized" || item.kind === "generic-alias") {
      const schema = schemaBySlug[slug as keyof typeof schemaBySlug] ?? GenericComponentSchema;
      const parsed = schema.safeParse(data);
      if (!parsed.success) return refused("fixture_component_data_invalid");
      data = parsed.data;
    } else if (!(item.kind === "primitive" ? primitiveData(slug, value.data) : blockData(slug, value.data))) return refused("fixture_component_data_invalid");
    // Snapshot ownership: consumers never render or mutate the editor's object.
    return { success: true, data: JSON.parse(JSON.stringify({ kind: value.kind, version: 1, data, ...(value.stateVersion === undefined ? {} : { stateVersion: value.stateVersion }) })) as MCPCNPayload<string, unknown> };
  } catch { return refused("fixture_json_refused"); }
}

export function makeFixture(slug: string): MCPCNPayload<string, unknown> {
  const item = items.get(slug);
  if (!item) throw new Error("fixture_catalog_unknown");
  const data = item.kind === "primitive" ? primitiveFixtures[slug as keyof PrimitiveFixtures] : item.kind === "workflow-block" ? blockFixtures[slug as keyof BlockFixtures]
    : item.kind === "specialized" ? specializedFixtures[slug] : { title: item.name, description: "This catalog entry currently shares GenericAgentComponent; it is not a bespoke implementation.", status: "Authored example", items: [{ label: "Record A", state: "Review needed" }], actions: [{ label: "Send intent", value: "review" }] };
  const parsed = validateFixture({ kind: `mcpcn/${slug}`, version: 1, data });
  if (!parsed.success) throw new Error("authored_fixture_invalid");
  return parsed.data;
}

export function schemaFor(slug: string): Record<string, unknown> | undefined {
  const item = items.get(slug);
  if (!item || item.kind === "primitive" || item.kind === "workflow-block") return undefined;
  return toJSONSchema(schemaBySlug[slug as keyof typeof schemaBySlug] ?? GenericComponentSchema);
}

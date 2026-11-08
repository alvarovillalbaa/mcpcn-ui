import { z } from "zod";
import type { MCPCNPayload } from "@mcpcn/core";
import { RiskLevelSchema, ChangeSchema, SchemaFieldSchema } from "./schema-common.js";
import { ConfirmationPanelSchema, RiskReviewPanelSchema, DiffViewerSchema, SourceEvidencePanelSchema } from "./review-schemas.js";
import { DynamicQuestionFlowSchema, ExtractedFieldsReviewSchema, ComparisonMatrixSchema, ScoreBreakdownSchema } from "./decision-schemas.js";
import { ToolCallCardSchema, RetryableErrorStateSchema, AuthRequiredCardSchema } from "./execution-schemas.js";
import { ApprovalChecklistSchema, BeforeSubmitConfirmationSchema, DestructiveActionGuardSchema, HumanOverridePanelSchema, PermissionRequestCardSchema } from "./approval-schemas.js";
import { ToolResultCardSchema, RunningTaskCardSchema, PartialResultViewerSchema, QueuedStepListSchema, ToolTraceViewerSchema } from "./tool-workflow-schemas.js";
import { MissingDataRequestSchema, MultiStepFormSchema, InlineEditFormSchema, FormProgressCardSchema, ValidatedFieldListSchema } from "./form-workflow-schemas.js";
import { DocumentPreviewSchema, FileReviewSchema } from "./file-review-schemas.js";
import { SourceListSchema, EvidenceDrawerSchema } from "./source-evidence-schemas.js";
export { RiskLevelSchema, ChangeSchema, SchemaFieldSchema } from "./schema-common.js";
export * from "./review-schemas.js";
export * from "./decision-schemas.js";
export * from "./execution-schemas.js";
export * from "./approval-schemas.js";
export * from "./tool-workflow-schemas.js";
export * from "./form-workflow-schemas.js";
export * from "./file-review-schemas.js";
export * from "./source-evidence-schemas.js";

export const ApprovalCardSchema = z.object({
  title: z.string().refine(value => Boolean(value.trim()), "A review needs a visible title."),
  description: z.string().optional(),
  riskLevel: RiskLevelSchema.default("medium"),
  actionLabel: z.string().default("Approve"),
  cancelLabel: z.string().default("Cancel"),
  changes: z.array(ChangeSchema).default([]),
  requiresExplicitConsent: z.boolean().default(false),
  consentLabel: z.string().optional(),
  rollback: z.string().optional(),
  approvalTool: z.string().optional()
});
export type ApprovalCardData = z.input<typeof ApprovalCardSchema>;
export type ParsedApprovalCardData = z.output<typeof ApprovalCardSchema>;

export const ToolProgressStepSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  status: z.enum(["queued", "running", "succeeded", "failed", "skipped"]),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  error: z.string().optional()
});
export const ToolProgressTimelineSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  steps: z.array(ToolProgressStepSchema),
  retryTool: z.string().optional()
});
export type ToolProgressTimelineData = z.input<typeof ToolProgressTimelineSchema>;

export const SchemaFormSchema = z.object({
  title: z.string().refine(value => Boolean(value.trim()), "A form needs a visible title."), description: z.string().optional(), fields: z.array(SchemaFieldSchema),
  submitLabel: z.string().default("Continue"), submitTool: z.string().optional()
}).superRefine((data, context) => {
  const names = new Set<string>();
  for (const [index, field] of data.fields.entries()) {
    const issue = (message: string) => context.addIssue({ code: "custom", path: ["fields", index], message });
    if (!field.name.trim() || names.has(field.name)) issue("Field names must be nonempty and distinct.");
    names.add(field.name);
    if (!field.label.trim()) issue("Fields need a visible label.");
    if (field.type === "select") {
      const values = (field.options ?? []).map(option => option.value);
      if (new Set(values).size !== values.length || values.some(value => !value.trim())) issue("Choice values must be nonempty and distinct.");
      if (field.value !== undefined && field.value !== "" && !values.includes(field.value as string)) issue("The initial selection must be an available choice.");
    }
    if (field.value === undefined) continue;
    if (field.type === "boolean") {
      if (typeof field.value !== "boolean") issue("Boolean field values must be boolean.");
    } else if (field.type === "number") {
      if (field.value !== "" && (typeof field.value !== "number" || !Number.isFinite(field.value))) issue("Number field values must be finite numbers or empty.");
    } else if (typeof field.value !== "string") issue("Text and choice field values must be strings.");
  }
});
export type SchemaFormData = z.input<typeof SchemaFormSchema>;

export const EntityReviewTableSchema = z.object({
  title: z.string(), description: z.string().optional(),
  columns: z.array(z.object({ key: z.string(), label: z.string() })),
  rows: z.array(z.object({ id: z.string(), values: z.record(z.string(), z.unknown()), confidence: z.number().optional(), selected: z.boolean().optional() })),
  actionLabel: z.string().optional(), actionTool: z.string().optional()
});
export type EntityReviewTableData = z.input<typeof EntityReviewTableSchema>;

export const AuditTrailSchema = z.object({
  title: z.string(), entries: z.array(z.object({ id: z.string(), label: z.string(), description: z.string().optional(), actor: z.string().optional(), timestamp: z.string(), status: z.enum(["info", "success", "warning", "error"]).default("info") }))
});
export type AuditTrailData = z.input<typeof AuditTrailSchema>;

export const GenericComponentSchema = z.object({
  title: z.string(), description: z.string().optional(), status: z.string().optional(),
  items: z.array(z.record(z.string(), z.unknown())).optional(), actions: z.array(z.object({ label: z.string(), value: z.string(), destructive: z.boolean().optional() })).optional()
}).passthrough();

// Every catalog surface has a named schema export. Specialized components own
// their contracts; the remaining informational aliases share the generic shape.
export const RecordInspectorSchema=GenericComponentSchema, FieldConfidenceListSchema=GenericComponentSchema,
  ConflictResolverSchema=GenericComponentSchema, ValidationSummarySchema=GenericComponentSchema,
  OptionSelectorSchema=GenericComponentSchema, RecommendationCardSchema=GenericComponentSchema,
  TradeoffPanelSchema=GenericComponentSchema,
  RankingListSchema=GenericComponentSchema, DecisionMemoSchema=GenericComponentSchema,
  ReasoningSummarySchema=GenericComponentSchema, DataAccessNoticeSchema=GenericComponentSchema,
  PrivacyBoundaryCardSchema=GenericComponentSchema, ConsentPanelSchema=GenericComponentSchema,
  ModelContextPreviewSchema=GenericComponentSchema,
  BillingGateSchema=GenericComponentSchema, UnsupportedHostNoticeSchema=GenericComponentSchema,
  NoDataStateSchema=GenericComponentSchema, LoadingBridgeStateSchema=GenericComponentSchema,
  OfflineStateSchema=GenericComponentSchema, PermissionDeniedStateSchema=GenericComponentSchema,
  ExpiredSessionStateSchema=GenericComponentSchema;

export const MCPCNPayloadSchema = z.object({
  kind: z.string().startsWith("mcpcn/"), version: z.literal(1), data: z.unknown(), stateVersion: z.number().int().optional()
});

export type ValidationResult<T> = { success: true; data: T } | { success: false; error: z.ZodError };
export function validatePayload<T>(value: unknown, schema: z.ZodType<T>): ValidationResult<MCPCNPayload<string, T>> {
  const envelope = MCPCNPayloadSchema.safeParse(value);
  if (!envelope.success) return envelope;
  const data = schema.safeParse(envelope.data.data);
  return data.success
    ? { success: true, data: { ...envelope.data, kind: envelope.data.kind as `mcpcn/${string}`, data: data.data } }
    : data;
}

export function toJSONSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema) as Record<string, unknown>;
}

export const schemaBySlug = {
  "approval-card": ApprovalCardSchema,
  "tool-progress-timeline": ToolProgressTimelineSchema,
  "schema-form": SchemaFormSchema,
  "entity-review-table": EntityReviewTableSchema,
  "audit-trail": AuditTrailSchema,
  "confirmation-panel": ConfirmationPanelSchema,
  "risk-review-panel": RiskReviewPanelSchema,
  "diff-viewer": DiffViewerSchema,
  "source-evidence-panel": SourceEvidencePanelSchema,
  "dynamic-question-flow": DynamicQuestionFlowSchema,
  "extracted-fields-review": ExtractedFieldsReviewSchema,
  "comparison-matrix": ComparisonMatrixSchema,
  "score-breakdown": ScoreBreakdownSchema,
  "tool-call-card": ToolCallCardSchema,
  "retryable-error-state": RetryableErrorStateSchema,
  "auth-required-card": AuthRequiredCardSchema,
  "approval-checklist": ApprovalChecklistSchema,
  "before-submit-confirmation": BeforeSubmitConfirmationSchema,
  "destructive-action-guard": DestructiveActionGuardSchema,
  "human-override-panel": HumanOverridePanelSchema,
  "permission-request-card": PermissionRequestCardSchema,
  "tool-result-card": ToolResultCardSchema,
  "running-task-card": RunningTaskCardSchema,
  "partial-result-viewer": PartialResultViewerSchema,
  "queued-step-list": QueuedStepListSchema,
  "tool-trace-viewer": ToolTraceViewerSchema,
  "missing-data-request": MissingDataRequestSchema,
  "multi-step-form": MultiStepFormSchema,
  "inline-edit-form": InlineEditFormSchema,
  "form-progress-card": FormProgressCardSchema,
  "validated-field-list": ValidatedFieldListSchema,
  "document-preview": DocumentPreviewSchema,
  "file-review": FileReviewSchema,
  "source-list": SourceListSchema,
  "evidence-drawer": EvidenceDrawerSchema
} as const;

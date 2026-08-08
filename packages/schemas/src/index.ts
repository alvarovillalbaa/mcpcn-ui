import { z } from "zod";
import type { MCPCNPayload } from "@mcpcn/core";

export const RiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export const ChangeSchema = z.object({
  label: z.string(),
  before: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  after: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  affectedCount: z.number().int().nonnegative().optional()
});

export const ApprovalCardSchema = z.object({
  title: z.string(),
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

export const SchemaFieldSchema = z.object({
  name: z.string(), label: z.string(), type: z.enum(["text", "textarea", "number", "email", "select", "boolean"]),
  description: z.string().optional(), required: z.boolean().default(false), value: z.unknown().optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional()
});
export const SchemaFormSchema = z.object({
  title: z.string(), description: z.string().optional(), fields: z.array(SchemaFieldSchema),
  submitLabel: z.string().default("Continue"), submitTool: z.string().optional()
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

// Every catalog surface has a named schema export. Specialized components refine
// this contract above; resilient informational surfaces share the generic shape.
export const ApprovalChecklistSchema=GenericComponentSchema, ConfirmationPanelSchema=GenericComponentSchema,
  RiskReviewPanelSchema=GenericComponentSchema, BeforeSubmitConfirmationSchema=GenericComponentSchema,
  DestructiveActionGuardSchema=GenericComponentSchema, HumanOverridePanelSchema=GenericComponentSchema,
  PermissionRequestCardSchema=GenericComponentSchema, ToolCallCardSchema=GenericComponentSchema,
  ToolResultCardSchema=GenericComponentSchema, RunningTaskCardSchema=GenericComponentSchema,
  RetryableErrorStateSchema=GenericComponentSchema, PartialResultViewerSchema=GenericComponentSchema,
  QueuedStepListSchema=GenericComponentSchema, ToolTraceViewerSchema=GenericComponentSchema,
  DiffViewerSchema=GenericComponentSchema, RecordInspectorSchema=GenericComponentSchema,
  FieldConfidenceListSchema=GenericComponentSchema, ExtractedFieldsReviewSchema=GenericComponentSchema,
  ConflictResolverSchema=GenericComponentSchema, ValidationSummarySchema=GenericComponentSchema,
  SourceEvidencePanelSchema=GenericComponentSchema, DocumentPreviewSchema=GenericComponentSchema,
  FileReviewSchema=GenericComponentSchema, DynamicQuestionFlowSchema=GenericComponentSchema,
  MissingDataRequestSchema=GenericComponentSchema, MultiStepFormSchema=GenericComponentSchema,
  InlineEditFormSchema=GenericComponentSchema, FormProgressCardSchema=GenericComponentSchema,
  ValidatedFieldListSchema=GenericComponentSchema, ComparisonMatrixSchema=GenericComponentSchema,
  OptionSelectorSchema=GenericComponentSchema, RecommendationCardSchema=GenericComponentSchema,
  TradeoffPanelSchema=GenericComponentSchema, ScoreBreakdownSchema=GenericComponentSchema,
  RankingListSchema=GenericComponentSchema, DecisionMemoSchema=GenericComponentSchema,
  ReasoningSummarySchema=GenericComponentSchema, SourceListSchema=GenericComponentSchema,
  EvidenceDrawerSchema=GenericComponentSchema, DataAccessNoticeSchema=GenericComponentSchema,
  PrivacyBoundaryCardSchema=GenericComponentSchema, ConsentPanelSchema=GenericComponentSchema,
  ModelContextPreviewSchema=GenericComponentSchema, AuthRequiredCardSchema=GenericComponentSchema,
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
  "audit-trail": AuditTrailSchema
} as const;

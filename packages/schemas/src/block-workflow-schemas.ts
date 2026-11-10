import { z } from "zod";

export const BlockKindSchema = z.enum([
  "review-before-action", "collect-missing-data", "extract-review-save", "compare-options-approve",
  "multi-step-tool-run", "approval-gated-tool-call", "human-corrects-ai-output", "agent-generated-report-review",
  "file-upload-and-extract", "table-bulk-action-review", "admin-change-review",
]);
export type BlockKind = z.infer<typeof BlockKindSchema>;
export const BlockIdentitySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/)
  .refine(value => !["constructor", "prototype", "__proto__"].includes(value));
export const BlockRevisionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1);
export type BlockJson = null | boolean | number | string | BlockJson[] | { [key: string]: BlockJson };
export const BlockJsonSchema: z.ZodType<BlockJson> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string(), z.array(BlockJsonSchema), z.record(z.string(), BlockJsonSchema),
]));
export const BlockOperationSchema = z.object({ name: BlockIdentitySchema, arguments: z.record(BlockIdentitySchema, BlockJsonSchema) }).strict()
  .refine(operation => new TextEncoder().encode(JSON.stringify(operation.arguments)).byteLength <= 16384, "Operation arguments must fit the complete 16 KiB review.");
export const BlockChangeSchema = z.object({ label: z.string().min(1).max(300), before: z.string().max(16384), after: z.string().max(16384) }).strict();
export const BlockTermsSchema = z.object({ action: BlockIdentitySchema, title: z.string().min(1).max(400), description: z.string().max(8192),
  changes: z.array(BlockChangeSchema.extend({ label: z.string().min(1).max(650), before: z.string().max(512 * 1024), after: z.string().max(512 * 1024) })).min(1).max(1100),
  riskLevel: z.enum(["low", "medium", "high", "critical"]) }).strict();
export const BlockExecutionSchema = z.object({ status: z.enum(["idle", "succeeded", "failed"]), result: BlockJsonSchema,
  message: z.string().max(4000) }).strict();
export const BlockSourceSchema = z.object({ id: BlockIdentitySchema, label: z.string().min(1).max(300), url: z.string().max(2048).optional(),
  excerpt: z.string().max(65536).optional() }).strict().superRefine((source, context) => {
  if (!source.url) return;
  try { const url = new URL(source.url); if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || /\s/.test(source.url)) throw new Error("invalid"); }
  catch { context.addIssue({ code: "custom", path: ["url"], message: "Supply a credential-free HTTP(S) source URL." }); }
});
export const BlockFieldSchema = z.object({ name: BlockIdentitySchema, label: z.string().min(1).max(300),
  type: z.enum(["text", "email", "number", "textarea", "select", "boolean"]), required: z.boolean(),
  description: z.string().max(4000).optional(), source: z.string().max(8000).optional(), original: z.union([z.string().max(4000), z.boolean()]).optional(),
  options: z.array(z.object({ value: z.string().min(1).max(300), label: z.string().min(1).max(300), disabled: z.boolean().optional() }).strict()).max(100).optional(),
}).strict().superRefine((field, context) => {
  if (field.type === "select" && (!field.options?.length || new Set(field.options.map(option => option.value)).size !== field.options.length)) {
    context.addIssue({ code: "custom", path: ["options"], message: "Supply distinct select choices." });
  }
});
export const BlockValuesSchema = z.record(BlockIdentitySchema, z.union([z.string().max(4000), z.boolean()]));
const fields = z.array(BlockFieldSchema).min(1).max(80).refine(items => new Set(items.map(item => item.name)).size === items.length, "Field identities must be distinct.");
const sources = z.array(BlockSourceSchema).max(100).refine(items => new Set(items.map(item => item.id)).size === items.length, "Source identities must be distinct.");
const common = { title: z.string().min(1).max(300), description: z.string().max(4000) };
const actionReview = { changes: z.array(BlockChangeSchema).min(1).max(80), riskLevel: BlockTermsSchema.shape.riskLevel,
  operation: BlockOperationSchema, execution: BlockExecutionSchema };

export const ReviewBeforeActionStateSchema = z.object({ ...common, block: z.literal("review-before-action"),
  status: z.enum(["ready", "completed", "failed"]), ...actionReview }).strict();
export const CollectMissingDataStateSchema = z.object({ ...common, block: z.literal("collect-missing-data"),
  status: z.enum(["needs-data", "collected"]), fields, known: BlockValuesSchema, values: BlockValuesSchema }).strict();
export const ExtractReviewSaveStateSchema = z.object({ ...common, block: z.literal("extract-review-save"),
  status: z.enum(["extracted", "saved"]), fields, values: BlockValuesSchema, sources }).strict();
const option = z.object({ id: BlockIdentitySchema, label: z.string().min(1).max(300), description: z.string().max(4000),
  evidence: z.array(z.string().min(1).max(8000)).min(1).max(50), value: BlockJsonSchema, changes: z.array(BlockChangeSchema).min(1).max(80), disabled: z.boolean() }).strict();
export const CompareOptionsApproveStateSchema = z.object({ ...common, block: z.literal("compare-options-approve"),
  status: z.enum(["ready", "selected"]), options: z.array(option).min(1).max(50).refine(items => new Set(items.map(item => item.id)).size === items.length),
  selectedId: BlockIdentitySchema.nullable() }).strict();
const step = z.object({ id: BlockIdentitySchema, label: z.string().min(1).max(300), description: z.string().max(4000),
  status: z.enum(["queued", "running", "succeeded", "failed", "skipped"]), attempts: z.number().int().min(0).max(10000),
  operation: BlockOperationSchema, result: BlockJsonSchema, error: z.string().max(4000).nullable() }).strict();
export const MultiStepToolRunStateSchema = z.object({ ...common, block: z.literal("multi-step-tool-run"),
  status: z.enum(["partial", "completed"]), steps: z.array(step).min(1).max(80).refine(items => new Set(items.map(item => item.id)).size === items.length) }).strict();
export const ApprovalGatedToolCallStateSchema = z.object({ ...common, block: z.literal("approval-gated-tool-call"),
  status: z.enum(["ready", "completed", "failed"]), ...actionReview }).strict();
export const HumanCorrectsAiOutputStateSchema = z.object({ ...common, block: z.literal("human-corrects-ai-output"),
  status: z.enum(["needs-correction", "corrected"]), fields, values: BlockValuesSchema, sources }).strict();
export const AgentGeneratedReportReviewStateSchema = z.object({ ...common, block: z.literal("agent-generated-report-review"),
  status: z.enum(["ready", "approved"]), summary: z.string().max(65536),
  sections: z.array(z.object({ id: BlockIdentitySchema, title: z.string().min(1).max(300), body: z.string().max(65536) }).strict()).max(50)
    .refine(items => new Set(items.map(item => item.id)).size === items.length),
  conclusion: z.string().max(10000), sources }).strict();
export const BlockTextDocumentKindSchema = z.enum(["invoice", "contract", "resume"]);
const extracted = z.object({ id: BlockIdentitySchema, label: z.string().min(1).max(300), original: z.string().max(4000),
  value: z.string().max(4000), source: z.string().max(8000), confidence: z.number().min(0).max(1) }).strict();
export const FileUploadAndExtractStateSchema = z.object({ ...common, block: z.literal("file-upload-and-extract"),
  status: z.enum(["empty", "extracted", "accepted"]),
  file: z.object({ name: z.string().min(1).max(200), kind: BlockTextDocumentKindSchema, text: z.string().max(65536),
    bytes: z.number().int().min(1).max(65536), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict().nullable(),
  fields: z.array(extracted).max(20).refine(items => new Set(items.map(item => item.id)).size === items.length) }).strict();
const row = z.object({ id: BlockIdentitySchema, revision: BlockRevisionSchema, label: z.string().min(1).max(300),
  changes: z.array(BlockChangeSchema).min(1).max(10), operation: BlockOperationSchema, disabled: z.boolean(), execution: BlockExecutionSchema }).strict();
export const TableBulkActionReviewStateSchema = z.object({ ...common, block: z.literal("table-bulk-action-review"),
  status: z.enum(["ready", "applied", "failed"]), rows: z.array(row).min(1).max(80).refine(items => new Set(items.map(item => item.id)).size === items.length),
  selectedIds: z.array(BlockIdentitySchema).max(80).refine(items => new Set(items).size === items.length), riskLevel: BlockTermsSchema.shape.riskLevel }).strict();
export const AdminChangeReviewStateSchema = z.object({ ...common, block: z.literal("admin-change-review"),
  status: z.enum(["ready", "completed", "failed"]), ...actionReview,
  affectedCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), rollback: z.string().min(1).max(8000) }).strict();

export const BlockStateSchema = z.discriminatedUnion("block", [ReviewBeforeActionStateSchema, CollectMissingDataStateSchema,
  ExtractReviewSaveStateSchema, CompareOptionsApproveStateSchema, MultiStepToolRunStateSchema, ApprovalGatedToolCallStateSchema,
  HumanCorrectsAiOutputStateSchema, AgentGeneratedReportReviewStateSchema, FileUploadAndExtractStateSchema,
  TableBulkActionReviewStateSchema, AdminChangeReviewStateSchema]);
export type BlockState = z.infer<typeof BlockStateSchema>;
export type BlockStateFor<K extends BlockKind> = Extract<BlockState, { block: K }>;
export type BlockField = z.infer<typeof BlockFieldSchema>;
export type BlockValues = z.infer<typeof BlockValuesSchema>;
export type BlockOperation = z.infer<typeof BlockOperationSchema>;
export type BlockTerms = z.infer<typeof BlockTermsSchema>;
export type BlockExecution = z.infer<typeof BlockExecutionSchema>;

export const BlockReceiptSchema = z.object({ sequence: BlockRevisionSchema, recordId: BlockIdentitySchema, revision: BlockRevisionSchema,
  action: BlockIdentitySchema, at: z.string().datetime() }).strict();
export const BlockAuditSchema = z.object({ ...BlockReceiptSchema.shape, actor: BlockIdentitySchema, summary: z.string().min(1).max(400) }).strict();
export const BlockTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const PublicBlockRecordSchema = z.object({ block: BlockKindSchema, id: BlockIdentitySchema, revision: BlockRevisionSchema,
  status: z.string().min(1).max(80), receipt: BlockReceiptSchema.nullable() }).strict();
export const BlockRecordSchema = z.object({ block: BlockKindSchema, id: BlockIdentitySchema, revision: BlockRevisionSchema, state: BlockStateSchema,
  audit: z.array(BlockAuditSchema).max(100), earlierAuditEvents: z.number().int().nonnegative(),
  prepared: z.object({ token: BlockTokenSchema, expiresAt: z.number().int().positive().max(8640000000000000), policyRevision: BlockIdentitySchema,
    terms: BlockTermsSchema, preview: BlockStateSchema }).strict().nullable(),
}).strict().superRefine((record, context) => {
  if (record.state.block !== record.block || record.prepared && record.prepared.preview.block !== record.block) {
    context.addIssue({ code: "custom", path: ["block"], message: "Block record and prepared state identities must agree." });
  }
  const count = record.revision - 1;
  if (record.audit.length !== Math.min(100, count) || record.earlierAuditEvents + record.audit.length !== count
    || record.audit.some((event, index) => event.recordId !== record.id || event.revision !== record.revision - record.audit.length + 1 + index || event.sequence !== event.revision - 1)) {
    context.addIssue({ code: "custom", path: ["audit"], message: "Saved audit must match this record's revision and retained event window." });
  }
});
export type BlockRecord = z.infer<typeof BlockRecordSchema>;
export type BlockReceipt = z.infer<typeof BlockReceiptSchema>;
export const BLOCK_METADATA_KEY = "mcpcn/block-workflow";

export const BlockFormProposalSchema = z.object({ action: z.literal("submit"), values: BlockValuesSchema }).strict();
export const BlockApproveProposalSchema = z.object({ action: z.literal("approve") }).strict();
export const BlockChooseProposalSchema = z.object({ action: z.literal("choose"), optionId: BlockIdentitySchema }).strict();
export const BlockRetryProposalSchema = z.object({ action: z.literal("retry"), stepId: BlockIdentitySchema }).strict();
export const BlockRunStepProposalSchema = z.object({ action: z.literal("run-step"), stepId: BlockIdentitySchema }).strict();
export const BlockReportProposalSchema = z.object({ action: z.literal("review-report"), conclusion: z.string().min(1).max(10000) }).strict();
export const BlockExtractProposalSchema = z.object({ action: z.literal("extract-file"),
  fileName: z.string().min(1).max(200).regex(/^[^/\\\u0000]+\.(?:txt|md)$/i), kind: BlockTextDocumentKindSchema,
  text: z.string().min(1).max(65536).refine(text => {
    const bytes = new TextEncoder().encode(text); return bytes.byteLength <= 65536 && new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) === text;
  }, "Supply complete well-formed UTF-8 text no larger than 64 KiB.") }).strict();
export const BlockAcceptFileProposalSchema = z.object({ action: z.literal("accept-file") }).strict();
export const BlockBulkProposalSchema = z.object({ action: z.literal("apply-rows"), rowIds: z.array(BlockIdentitySchema).min(1).max(80)
  .refine(ids => new Set(ids).size === ids.length) }).strict();
export const BlockProposalSchema = z.discriminatedUnion("action", [BlockFormProposalSchema, BlockApproveProposalSchema,
  BlockChooseProposalSchema, BlockRetryProposalSchema, BlockRunStepProposalSchema, BlockReportProposalSchema, BlockExtractProposalSchema,
  BlockAcceptFileProposalSchema, BlockBulkProposalSchema]);
export type BlockProposal = z.infer<typeof BlockProposalSchema>;
export function blockToolNames(block: BlockKind) {
  BlockKindSchema.parse(block); const prefix = `mcpcn_${block.replaceAll("-", "_")}`;
  return { read: prefix + "_read", prepare: prefix + "_prepare", confirm: prefix + "_confirm", cancel: prefix + "_cancel" } as const;
}

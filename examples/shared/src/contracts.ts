import { z } from "zod";

export const WorkflowSchema = z.enum(["hr-candidate-review", "document-extraction", "ecommerce-checkout-review", "admin-settings-change", "research-workflow"]);
export type Workflow = z.infer<typeof WorkflowSchema>;
export const IdentitySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/);
export const RevisionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1);
export const ReceiptSchema = z.object({ sequence: RevisionSchema, recordId: IdentitySchema, revision: RevisionSchema, action: z.string().min(1).max(80), at: z.string().datetime() }).strict();
export const PublicRecordSchema = z.object({ workflow: WorkflowSchema, id: IdentitySchema, revision: RevisionSchema, status: z.string().min(1).max(80), receipt: ReceiptSchema.nullable() }).strict();
export const ChangeSchema = z.object({ label: z.string().min(1).max(300), before: z.string().max(8000), after: z.string().max(8000) }).strict();
export const ReviewTermsSchema = z.object({ action: z.string().min(1).max(80), title: z.string().min(1).max(300), description: z.string().max(4000),
  changes: z.array(ChangeSchema).min(1).max(50), riskLevel: z.enum(["low", "medium", "high", "critical"]) }).strict();
export const AuditSchema = z.object({ ...ReceiptSchema.shape, actor: IdentitySchema, summary: z.string().min(1).max(300) }).strict();
export const TokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export function privateRecordSchema<S extends z.ZodType>(state: S) {
  return z.object({ workflow: WorkflowSchema, id: IdentitySchema, revision: RevisionSchema, state,
    audit: z.array(AuditSchema).max(100), earlierAuditEvents: z.number().int().nonnegative(),
    prepared: z.object({ ...ReviewTermsSchema.shape, token: TokenSchema, expiresAt: z.number().int().positive(), proposed: state }).strict().nullable(),
  }).strict();
}
export type ReviewTerms = z.infer<typeof ReviewTermsSchema>;
export type Receipt = z.infer<typeof ReceiptSchema>;
export type Prepared<S> = ReviewTerms & { token: string; expiresAt: number; proposed: S };
export type RecordView<S> = { workflow: Workflow; id: string; revision: number; state: S; audit: Array<z.infer<typeof AuditSchema>>; earlierAuditEvents: number; prepared: Prepared<S> | null };
export const METADATA_KEY = "mcpcn/reference-workflow";
export const toolPrefix = (workflow: Workflow) => workflow.replaceAll("-", "_");

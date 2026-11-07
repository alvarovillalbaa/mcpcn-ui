import { z } from "zod";
import { ChangeSchema, RiskLevelSchema } from "./schema-common.js";

const identity = z.string().min(1).max(128).refine(value => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value), "Use a nonblank stable identity without control characters.");
const text = (maximum = 500) => z.string().min(1).max(maximum).refine(value => Boolean(value.trim()) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Use nonblank plain text.");
const review = { reviewId: identity, title: text(240), description: text(2000).optional() };

export const ReviewChangeSchema = ChangeSchema.extend({ id: identity, label: text() })
  .refine(change => change.before !== undefined || change.after !== undefined, "Supply a before or after value.");
const changes = z.array(ReviewChangeSchema).max(100).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, "Change identities must be unique.");

export const ConfirmationPanelSchema = z.object({
  ...review,
  changes,
  requiresExplicitConsent: z.boolean().default(true),
  consentLabel: text().default("I reviewed these changes."),
  confirmLabel: text(120).default("Confirm"),
  cancelLabel: text(120).default("Cancel"),
});
export type ConfirmationPanelData = z.input<typeof ConfirmationPanelSchema>;

export const RiskReviewPanelSchema = z.object({
  ...review,
  risks: z.array(z.object({
    id: identity, label: text(), severity: RiskLevelSchema,
    description: text(2000).optional(), mitigation: text(2000).optional(),
  })).max(100),
  acknowledgedRiskIds: z.array(identity).max(100).default([]),
  affectedCount: z.number().int().nonnegative().optional(),
  rollback: text(2000).optional(),
  acceptLabel: text(120).default("Accept reviewed risks"),
  cancelLabel: text(120).default("Cancel"),
}).superRefine((value, context) => {
  const ids = new Set(value.risks.map(risk => risk.id));
  if (ids.size !== value.risks.length) context.addIssue({ code: "custom", path: ["risks"], message: "Risk identities must be unique." });
  if (new Set(value.acknowledgedRiskIds).size !== value.acknowledgedRiskIds.length || value.acknowledgedRiskIds.some(id => !ids.has(id))) {
    context.addIssue({ code: "custom", path: ["acknowledgedRiskIds"], message: "Acknowledgements must identify unique current risks." });
  }
});
export type RiskReviewPanelData = z.input<typeof RiskReviewPanelSchema>;

export const DiffViewerSchema = z.object({ ...review, changes, selectedChangeId: identity.optional() })
  .refine(value => value.selectedChangeId === undefined || value.changes.some(change => change.id === value.selectedChangeId), "Select a current change.");
export type DiffViewerData = z.input<typeof DiffViewerSchema>;

const evidenceUrl = z.string().min(1).max(2048).refine(value => {
  try {
    const url = new URL(value);
    return value.trim() === value && !/[\u0000-\u0020\u007f]/.test(value)
      && (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch { return false; }
}, "Use an absolute HTTP(S) evidence URL without credentials.");
export const SourceEvidencePanelSchema = z.object({
  ...review,
  sources: z.array(z.object({
    id: identity, label: text(), url: evidenceUrl.optional(),
    excerpt: text(5000).optional(), supports: z.array(text()).max(20).default([]),
  })).max(100),
  selectedSourceId: identity.optional(),
}).superRefine((value, context) => {
  const ids = new Set(value.sources.map(source => source.id));
  if (ids.size !== value.sources.length) context.addIssue({ code: "custom", path: ["sources"], message: "Source identities must be unique." });
  if (value.selectedSourceId !== undefined && !ids.has(value.selectedSourceId)) context.addIssue({ code: "custom", path: ["selectedSourceId"], message: "Select a current source." });
});
export type SourceEvidencePanelData = z.input<typeof SourceEvidencePanelSchema>;

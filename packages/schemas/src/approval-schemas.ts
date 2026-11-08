import { z } from "zod";

const identity = z.string().min(1).max(128).refine(value => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value), "Use a nonblank stable identity without control characters.");
const textControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const plainText = (maximum: number) => z.string().max(maximum).refine(value => !textControls.test(value), "Use plain text without control characters.");
const text = (maximum = 500) => z.string().min(1).max(maximum).refine(value => Boolean(value.trim()) && !textControls.test(value), "Use nonblank plain text.");
const review = { reviewId: identity, title: text(240), description: text(2000).optional(), disabled: z.boolean().default(false) };
const cancelLabel = text(120).default("Cancel");
const currentIds = (selected: string[], ids: Set<string>) => new Set(selected).size === selected.length && selected.every(id => ids.has(id));

const checklistItem = z.object({ id: identity, label: text(), description: text(2000).optional(), required: z.boolean().default(true) }).strict();
export const ApprovalChecklistSchema = z.object({
  ...review,
  items: z.array(checklistItem).min(1).max(100).describe("Unique item identities with at least one required item."),
  checkedItemIds: z.array(identity).max(100).default([]).describe("Unique current item IDs. Incomplete review is valid; approval requires all required items."),
  approveLabel: text(120).default("Approve checklist"),
  cancelLabel,
}).strict().superRefine((value, context) => {
  const ids = new Set(value.items.map(item => item.id));
  if (ids.size !== value.items.length) context.addIssue({ code: "custom", path: ["items"], message: "Checklist identities must be unique." });
  if (!value.items.some(item => item.required)) context.addIssue({ code: "custom", path: ["items"], message: "Include at least one required checklist item." });
  if (!currentIds(value.checkedItemIds, ids)) context.addIssue({ code: "custom", path: ["checkedItemIds"], message: "Checked items must identify unique current items." });
});
export type ApprovalChecklistData = z.input<typeof ApprovalChecklistSchema>;
export type ParsedApprovalChecklistData = z.output<typeof ApprovalChecklistSchema>;

const fieldValue = z.union([plainText(5000), z.number().refine(Number.isFinite, "Use a finite number."), z.boolean(), z.null()]);
export const BeforeSubmitConfirmationSchema = z.object({
  ...review,
  fields: z.array(z.object({ id: identity, label: text(), value: fieldValue }).strict()).min(1).max(100).describe("Current submitted fields with unique identities and finite primitive values."),
  submitLabel: text(120).default("Submit"),
  cancelLabel,
  consentLabel: text().default("I reviewed these fields and want to submit."),
}).strict().superRefine((value, context) => {
  if (new Set(value.fields.map(field => field.id)).size !== value.fields.length) {
    context.addIssue({ code: "custom", path: ["fields"], message: "Field identities must be unique." });
  }
});
export type BeforeSubmitConfirmationData = z.input<typeof BeforeSubmitConfirmationSchema>;
export type ParsedBeforeSubmitConfirmationData = z.output<typeof BeforeSubmitConfirmationSchema>;

export const DestructiveActionGuardSchema = z.object({
  ...review,
  targetLabel: text(),
  summary: text(2000),
  affectedCount: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  confirmationText: text(120).refine(value => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value), "Use an exact single-line confirmation phrase without leading or trailing whitespace."),
  rollback: text(2000).optional(),
  confirmLabel: text(120).default("Confirm destructive action"),
  cancelLabel,
  consentLabel: text().default("I understand this action and want to continue."),
}).strict();
export type DestructiveActionGuardData = z.input<typeof DestructiveActionGuardSchema>;
export type ParsedDestructiveActionGuardData = z.output<typeof DestructiveActionGuardSchema>;

const overrideOption = z.object({ id: identity, label: text(), description: text(2000).optional() }).strict();
export const HumanOverridePanelSchema = z.object({
  ...review,
  recommendation: text(2000),
  options: z.array(overrideOption).min(2).max(100).describe("At least two options with unique identities."),
  recommendedOptionId: identity.describe("Identity of a current option carrying the recommendation."),
  selectedOptionId: identity.optional().describe("Optional identity of a current controlled selection."),
  overrideLabel: text(120).default("Override recommendation"),
  cancelLabel,
  reasonLabel: text().default("Reason for override"),
  consentLabel: text().default("I reviewed this override and want to apply it."),
}).strict().superRefine((value, context) => {
  const ids = new Set(value.options.map(option => option.id));
  if (ids.size !== value.options.length) context.addIssue({ code: "custom", path: ["options"], message: "Override option identities must be unique." });
  if (!ids.has(value.recommendedOptionId)) context.addIssue({ code: "custom", path: ["recommendedOptionId"], message: "The recommendation must identify a current option." });
  if (value.selectedOptionId !== undefined && !ids.has(value.selectedOptionId)) context.addIssue({ code: "custom", path: ["selectedOptionId"], message: "Select a current override option." });
});
export type HumanOverridePanelData = z.input<typeof HumanOverridePanelSchema>;
export type ParsedHumanOverridePanelData = z.output<typeof HumanOverridePanelSchema>;

const permissionScope = z.object({ id: identity, label: text(), description: text(2000).optional(), required: z.boolean().default(true) }).strict();
export const PermissionRequestCardSchema = z.object({
  ...review,
  requester: text(),
  purpose: text(2000),
  scopes: z.array(permissionScope).min(1).max(100).describe("Unique scope identities with at least one required scope. This data does not grant permissions."),
  selectedScopeIds: z.array(identity).max(100).default([]).describe("Unique current scope IDs. Request readiness also requires every required scope and fresh local consent."),
  requestLabel: text(120).default("Request permission"),
  denyLabel: text(120).default("Deny permission"),
  consentLabel: text().default("I reviewed these scopes and want to request permission."),
}).strict().superRefine((value, context) => {
  const ids = new Set(value.scopes.map(scope => scope.id));
  if (ids.size !== value.scopes.length) context.addIssue({ code: "custom", path: ["scopes"], message: "Permission scope identities must be unique." });
  if (!value.scopes.some(scope => scope.required)) context.addIssue({ code: "custom", path: ["scopes"], message: "Include at least one required permission scope." });
  if (!currentIds(value.selectedScopeIds, ids)) context.addIssue({ code: "custom", path: ["selectedScopeIds"], message: "Selected scopes must identify unique current scopes." });
});
export type PermissionRequestCardData = z.input<typeof PermissionRequestCardSchema>;
export type ParsedPermissionRequestCardData = z.output<typeof PermissionRequestCardSchema>;

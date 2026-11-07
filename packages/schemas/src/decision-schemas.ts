import { z } from "zod";

const Id = z.string().min(1).max(120).refine(value => value.trim() === value
  && !/[\u0000-\u001f\u007f]/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value), "Use a nonempty, safe identifier.");
const Label = z.string().min(1).max(300).refine(value => Boolean(value.trim()), "A label is required.");
const Text = z.string().max(4000);
const Answer = z.union([Text, z.number().finite(), z.boolean()]);
const Scalar = z.union([Answer, z.null()]);
const Evidence = z.object({
  id: Id, label: Label, text: Text.optional(),
  url: z.string().max(2048).refine(value => {
    try { const url = new URL(value); return /^https?:\/\//.test(value) && !/[\u0000-\u0020\u007f]/.test(value) && ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; }
    catch { return false; }
  }, "Evidence links must use HTTP or HTTPS without credentials.").optional()
});
const EvidenceList = z.array(Evidence).max(20).default([]).refine(items => new Set(items.map(item => item.id)).size === items.length, "Evidence IDs must be unique.");
const Common = { id: Id, title: Label, description: Text.optional(), disabled: z.boolean().default(false) };
const Question = z.object({
  id: Id, label: Label, type: z.enum(["text", "textarea", "number", "email", "select", "boolean"]),
  description: Text.optional(), required: z.boolean().default(false), disabled: z.boolean().default(false),
  options: z.array(z.object({ id: Id, label: Label, disabled: z.boolean().default(false) })).max(40).optional(),
  when: z.object({ questionId: Id, equals: Answer }).optional()
}).superRefine((question, ctx) => {
  if (question.type === "select" && (!question.options?.length || new Set(question.options.map(option => option.id)).size !== question.options.length)) {
    ctx.addIssue({ code: "custom", path: ["options"], message: "Select questions need unique, nonempty choices." });
  }
  if (question.type !== "select" && question.options !== undefined) ctx.addIssue({ code: "custom", path: ["options"], message: "Only select questions accept choices." });
});

export const DynamicQuestionFlowSchema = z.object({
  ...Common, questions: z.array(Question).max(40), answers: z.record(Id, Answer).default({}),
  currentQuestionId: Id.optional(), submitLabel: Label.default("Submit answers")
}).superRefine((data, ctx) => {
  const questions = new Map(data.questions.map(question => [question.id, question]));
  if (questions.size !== data.questions.length) ctx.addIssue({ code: "custom", path: ["questions"], message: "Question IDs must be unique." });
  if (data.currentQuestionId !== undefined && !questions.has(data.currentQuestionId)) ctx.addIssue({ code: "custom", path: ["currentQuestionId"], message: "The current question must belong to this flow." });
  for (const [id, value] of Object.entries(data.answers)) {
    const question = questions.get(id);
    if (!question) { ctx.addIssue({ code: "custom", path: ["answers", id], message: "Answers must belong to this flow." }); continue; }
    const valid = question.type === "boolean" ? typeof value === "boolean"
      : question.type === "number" ? value === "" || typeof value === "number"
        : typeof value === "string" && (question.type !== "select" || value === "" || question.options?.some(option => option.id === value));
    if (!valid) ctx.addIssue({ code: "custom", path: ["answers", id], message: "The answer type or choice does not match its question." });
  }
  data.questions.forEach((question, index) => {
    if (!question.when) return;
    const parentIndex = data.questions.findIndex(parent => parent.id === question.when?.questionId);
    if (parentIndex < 0 || parentIndex >= index) ctx.addIssue({ code: "custom", path: ["questions", index, "when"], message: "A condition must reference an earlier question." });
    const parent = questions.get(question.when.questionId), expected = question.when.equals;
    if (parent && !(parent.type === "boolean" ? typeof expected === "boolean" : parent.type === "number" ? typeof expected === "number" : typeof expected === "string" && (parent.type !== "select" || parent.options?.some(option => option.id === expected)))) {
      ctx.addIssue({ code: "custom", path: ["questions", index, "when"], message: "A condition must use a valid answer for its earlier question." });
    }
  });
});
export type DynamicQuestionFlowData = z.input<typeof DynamicQuestionFlowSchema>;

export const ExtractedFieldsReviewSchema = z.object({
  ...Common, fields: z.array(z.object({
    id: Id, label: Label, original: Text, value: Text.default(""), required: z.boolean().default(false),
    disabled: z.boolean().default(false), confidence: z.number().finite().min(0).max(1).optional(), evidence: EvidenceList
  })).max(100), submitLabel: Label.default("Confirm corrections")
}).refine(data => new Set(data.fields.map(field => field.id)).size === data.fields.length, { path: ["fields"], message: "Extracted field IDs must be unique." });
export type ExtractedFieldsReviewData = z.input<typeof ExtractedFieldsReviewSchema>;

export const ComparisonMatrixSchema = z.object({
  ...Common, criteria: z.array(z.object({ id: Id, label: Label, description: Text.optional() })).max(30),
  options: z.array(z.object({
    id: Id, label: Label, description: Text.optional(), values: z.record(Id, Scalar),
    disabled: z.boolean().default(false), evidence: EvidenceList
  })).max(40), selectedId: Id.nullable().optional(), required: z.boolean().default(true), confirmLabel: Label.default("Confirm selection")
}).superRefine((data, ctx) => {
  const criteria = new Set(data.criteria.map(criterion => criterion.id));
  if (criteria.size !== data.criteria.length) ctx.addIssue({ code: "custom", path: ["criteria"], message: "Criterion IDs must be unique." });
  if (new Set(data.options.map(option => option.id)).size !== data.options.length) ctx.addIssue({ code: "custom", path: ["options"], message: "Option IDs must be unique." });
  if (data.options.length && !data.criteria.length) ctx.addIssue({ code: "custom", path: ["criteria"], message: "Options need at least one comparison criterion." });
  data.options.forEach((option, index) => {
    if (Object.keys(option.values).length !== criteria.size || Object.keys(option.values).some(id => !criteria.has(id))) ctx.addIssue({ code: "custom", path: ["options", index, "values"], message: "Each option must provide exactly the declared criteria." });
  });
  if (data.selectedId != null && !data.options.some(option => option.id === data.selectedId)) ctx.addIssue({ code: "custom", path: ["selectedId"], message: "The selection must belong to this comparison." });
});
export type ComparisonMatrixData = z.input<typeof ComparisonMatrixSchema>;

export const ScoreBreakdownSchema = z.object({
  ...Common, criteria: z.array(z.object({
    id: Id, label: Label, score: z.number().finite().min(0).max(1e6),
    maxScore: z.number().finite().positive().max(1e6), weight: z.number().finite().positive().max(1e6).default(1),
    explanation: Text.optional(), evidence: EvidenceList, disabled: z.boolean().default(false)
  }).refine(criterion => criterion.score <= criterion.maxScore, { path: ["score"], message: "A score cannot exceed its maximum." })).max(100),
  selectedCriterionId: Id.nullable().optional(), totalLabel: Label.default("Weighted total")
}).superRefine((data, ctx) => {
  if (new Set(data.criteria.map(criterion => criterion.id)).size !== data.criteria.length) ctx.addIssue({ code: "custom", path: ["criteria"], message: "Scored criterion IDs must be unique." });
  if (data.selectedCriterionId != null && !data.criteria.some(criterion => criterion.id === data.selectedCriterionId)) ctx.addIssue({ code: "custom", path: ["selectedCriterionId"], message: "The reviewed criterion must belong to this scorecard." });
  // At most 100 terms of at most 1e6 * 1e6: weighted sums stay finite and below MAX_SAFE_INTEGER.
  if (data.criteria.some(criterion => criterion.maxScore * criterion.weight === 0)) ctx.addIssue({ code: "custom", path: ["criteria"], message: "Weighted maxima must not underflow to zero." });
});
export type ScoreBreakdownData = z.input<typeof ScoreBreakdownSchema>;

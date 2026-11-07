import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ComparisonMatrixSchema, DynamicQuestionFlowSchema, ExtractedFieldsReviewSchema, ScoreBreakdownSchema } from "@mcpcn/schemas";
import { ComparisonMatrix, DynamicQuestionFlow, ExtractedFieldsReview, ScoreBreakdown } from "./decision-components.js";

const flow = { id: "flow-1", title: "Missing details", questions: [{ id: "name", label: "Your name", type: "text" as const, required: true }], answers: {} };
const extraction = { id: "review-1", title: "Review extraction", fields: [{ id: "total", label: "Total", original: "125", value: "120", required: true, confidence: 0.5, evidence: [{ id: "source", label: "Invoice line", text: "Total 120" }] }] };
const comparison = { id: "comparison-1", title: "Compare services", criteria: [{ id: "cost", label: "Cost" }], options: [{ id: "a", label: "Option A", values: { cost: 12 }, evidence: [] }, { id: "b", label: "Option B", values: { cost: 24 }, evidence: [] }] };
const scores = { id: "score-1", title: "Score details", criteria: [{ id: "fit", label: "Fit", score: 4, maxScore: 5, weight: 2 }, { id: "speed", label: "Speed", score: 2, maxScore: 5, weight: 1 }] };

describe("v1 decision schemas", () => {
  it("accepts typed conditional answers without requiring incomplete answers", () => {
    const parsed = DynamicQuestionFlowSchema.safeParse({ ...flow, questions: [{ id: "kind", label: "Kind", type: "boolean" }, { id: "count", label: "Count", type: "number", required: true, when: { questionId: "kind", equals: true } }], answers: { kind: true, count: 2 } });
    expect(parsed.success).toBe(true);
    expect(DynamicQuestionFlowSchema.safeParse(flow).success).toBe(true);
  });
  it("rejects duplicate question identities", () => {
    expect(DynamicQuestionFlowSchema.safeParse({ ...flow, questions: [flow.questions[0], flow.questions[0]] }).success).toBe(false);
  });
  it("rejects answers and current-question IDs from another payload", () => {
    expect(DynamicQuestionFlowSchema.safeParse({ ...flow, answers: { privateOldField: "kept" } }).success).toBe(false);
    expect(DynamicQuestionFlowSchema.safeParse({ ...flow, currentQuestionId: "removed" }).success).toBe(false);
  });
  it("rejects forward, missing and self-referential question conditions", () => {
    for (const questionId of ["name", "missing"]) expect(DynamicQuestionFlowSchema.safeParse({ ...flow, questions: [{ ...flow.questions[0], when: { questionId, equals: "yes" } }] }).success).toBe(false);
  });
  it("rejects wrong answer types and unknown select choices", () => {
    expect(DynamicQuestionFlowSchema.safeParse({ ...flow, answers: { name: false } }).success).toBe(false);
    expect(DynamicQuestionFlowSchema.safeParse({ ...flow, questions: [{ id: "choice", label: "Choice", type: "select", options: [{ id: "one", label: "One" }] }], answers: { choice: "unknown" } }).success).toBe(false);
  });
  it("rejects duplicate choices and mismatched conditional answer types", () => {
    expect(DynamicQuestionFlowSchema.safeParse({ ...flow, questions: [{ id: "q", label: "Q", type: "select", options: [{ id: "a", label: "A" }, { id: "a", label: "Again" }] }] }).success).toBe(false);
    expect(DynamicQuestionFlowSchema.safeParse({ ...flow, questions: [{ id: "q", label: "Q", type: "boolean" }, { id: "later", label: "Later", type: "text", when: { questionId: "q", equals: "true" } }] }).success).toBe(false);
  });
  it("rejects nonfinite, object and reserved-key answers", () => {
    expect(DynamicQuestionFlowSchema.safeParse({ ...flow, questions: [{ id: "name", label: "N", type: "number" }], answers: { name: Infinity } }).success).toBe(false);
    expect(DynamicQuestionFlowSchema.safeParse({ ...flow, answers: { name: { private: "value" } } }).success).toBe(false);
    expect(DynamicQuestionFlowSchema.safeParse({ ...flow, questions: [{ id: "constructor", label: "N", type: "text" }] }).success).toBe(false);
  });
  it("rejects duplicate extraction and evidence IDs", () => {
    expect(ExtractedFieldsReviewSchema.safeParse({ ...extraction, fields: [extraction.fields[0], extraction.fields[0]] }).success).toBe(false);
    const field = extraction.fields[0]!;
    expect(ExtractedFieldsReviewSchema.safeParse({ ...extraction, fields: [{ ...field, evidence: [field.evidence[0], field.evidence[0]] }] }).success).toBe(false);
  });
  it("accepts zero confidence but rejects out-of-range confidence and nontext corrections", () => {
    expect(ExtractedFieldsReviewSchema.safeParse({ ...extraction, fields: [{ ...extraction.fields[0], confidence: 0 }] }).success).toBe(true);
    expect(ExtractedFieldsReviewSchema.safeParse({ ...extraction, fields: [{ ...extraction.fields[0], confidence: 1.1 }] }).success).toBe(false);
    expect(ExtractedFieldsReviewSchema.safeParse({ ...extraction, fields: [{ ...extraction.fields[0], value: { raw: "private" } }] }).success).toBe(false);
  });
  it("rejects script and credential-bearing evidence links", () => {
    for (const url of ["javascript:alert(1)", "https:relative", "https://user:secret@example.com/document"]) expect(ExtractedFieldsReviewSchema.safeParse({ ...extraction, fields: [{ ...extraction.fields[0], evidence: [{ id: "e", label: "Source", url }] }] }).success).toBe(false);
  });
  it("accepts an HTTP evidence link without fetching it", () => {
    expect(ExtractedFieldsReviewSchema.safeParse({ ...extraction, fields: [{ ...extraction.fields[0], evidence: [{ id: "e", label: "Source", url: "https://example.com/document#page-2" }] }] }).success).toBe(true);
  });
  it("requires each option to bind exactly its comparison criteria", () => {
    expect(ComparisonMatrixSchema.safeParse({ ...comparison, options: [{ id: "a", label: "A", values: {} }] }).success).toBe(false);
    expect(ComparisonMatrixSchema.safeParse({ ...comparison, options: [{ id: "a", label: "A", values: { cost: 12, privateExtra: "hidden" } }] }).success).toBe(false);
  });
  it("rejects duplicate comparison options and criteria", () => {
    expect(ComparisonMatrixSchema.safeParse({ ...comparison, options: [comparison.options[0], comparison.options[0]] }).success).toBe(false);
    expect(ComparisonMatrixSchema.safeParse({ ...comparison, criteria: [comparison.criteria[0], comparison.criteria[0]] }).success).toBe(false);
  });
  it("rejects unknown selections, object cells and nonfinite comparison values", () => {
    expect(ComparisonMatrixSchema.safeParse({ ...comparison, selectedId: "old" }).success).toBe(false);
    expect(ComparisonMatrixSchema.safeParse({ ...comparison, options: [{ id: "a", label: "A", values: { cost: { raw: true } } }] }).success).toBe(false);
    expect(ComparisonMatrixSchema.safeParse({ ...comparison, options: [{ id: "a", label: "A", values: { cost: NaN } }] }).success).toBe(false);
  });
  it("rejects negative and over-maximum scores", () => {
    for (const score of [-1, 6]) expect(ScoreBreakdownSchema.safeParse({ ...scores, criteria: [{ ...scores.criteria[0], score }] }).success).toBe(false);
  });
  it("rejects nonfinite and overflow-sized score arithmetic inputs", () => {
    for (const weight of [0, Infinity, Number.MAX_VALUE]) expect(ScoreBreakdownSchema.safeParse({ ...scores, criteria: [{ ...scores.criteria[0], weight }] }).success).toBe(false);
    expect(ScoreBreakdownSchema.safeParse({ ...scores, criteria: [{ ...scores.criteria[0], maxScore: 0 }] }).success).toBe(false);
  });
  it("rejects duplicate score IDs and stale criterion selections", () => {
    expect(ScoreBreakdownSchema.safeParse({ ...scores, criteria: [scores.criteria[0], scores.criteria[0]] }).success).toBe(false);
    expect(ScoreBreakdownSchema.safeParse({ ...scores, selectedCriterionId: "removed" }).success).toBe(false);
  });
  it("rejects weighted maxima that would underflow into an unscored denominator", () => {
    expect(ScoreBreakdownSchema.safeParse({ ...scores, criteria: [{ id: "tiny", label: "Tiny", score: 0, maxScore: Number.MIN_VALUE, weight: Number.MIN_VALUE }] }).success).toBe(false);
  });
});

describe("v1 decision SSR intent surfaces", () => {
  it("renders a required boolean constraint and blocks incomplete submission", () => {
    const onAction = vi.fn(), html = renderToStaticMarkup(<DynamicQuestionFlow id="f" title="Review" questions={[{ id: "consent", label: "Reviewed", type: "boolean", required: true }]} answers={{ consent: false }} onAction={onAction} />);
    expect(html).toContain('type="checkbox"'); expect(html).toContain('required=""'); expect(html).toContain('disabled=""'); expect(onAction).not.toHaveBeenCalled();
  });
  it("hides conditional questions and safely falls back from a hidden current question", () => {
    const html = renderToStaticMarkup(<DynamicQuestionFlow id="f" title="Flow" questions={[{ id: "show", label: "Show detail", type: "boolean" }, { id: "secret", label: "Hidden old detail", type: "text", when: { questionId: "show", equals: true } }]} answers={{ show: false, secret: "old draft" }} currentQuestionId="secret" onAction={vi.fn()} />);
    expect(html).toContain("Question 1 of 1"); expect(html).not.toContain("Hidden old detail"); expect(html).not.toContain("old draft");
  });
  it("renders explicit empty question state without navigation", () => {
    const html = renderToStaticMarkup(<DynamicQuestionFlow id="empty" title="Empty flow" questions={[]} onAction={vi.fn()} />);
    expect(html).toContain("No questions are available."); expect(html).not.toContain("Next question");
  });
  it("renders flow busy and caller errors without dropping controlled answers", () => {
    const onAction = vi.fn(), html = renderToStaticMarkup(<DynamicQuestionFlow {...flow} answers={{ name: "Ada" }} busy error="Flow unavailable" onAction={onAction} />);
    expect(html).toContain('value="Ada"'); expect(html).toContain('aria-busy="true"'); expect(html).toContain('disabled=""'); expect(html).toContain("Flow unavailable"); expect(onAction).not.toHaveBeenCalled();
  });
  it("renders malformed question identity as a safe error", () => {
    const html = renderToStaticMarkup(<DynamicQuestionFlow {...flow} questions={[flow.questions[0]!, flow.questions[0]!]} onAction={vi.fn()} />);
    expect(html).toContain('role="alert"'); expect(html).toContain("Question IDs must be unique."); expect(html).not.toContain("Submit answers");
  });
  it("renders extraction corrections, zero confidence and escaped evidence", () => {
    const html = renderToStaticMarkup(<ExtractedFieldsReview {...extraction} fields={[{ ...extraction.fields[0]!, confidence: 0, evidence: [{ id: "source", label: "Line", text: "<script>authored</script>" }] }]} onAction={vi.fn()} />);
    expect(html).toContain('value="120"'); expect(html).toContain("0% confidence"); expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
  });
  it("renders extraction busy, caller error and required validation", () => {
    const onAction = vi.fn(), html = renderToStaticMarkup(<ExtractedFieldsReview {...extraction} busy error="Review unavailable" fields={[{ ...extraction.fields[0]!, value: "" }]} onAction={onAction} />);
    expect(html).toContain('aria-busy="true"'); expect(html).toContain("Review unavailable"); expect(html).toContain('required=""'); expect(html).toContain('disabled=""'); expect(onAction).not.toHaveBeenCalled();
  });
  it("renders empty extraction without enabling confirmation", () => {
    const html = renderToStaticMarkup(<ExtractedFieldsReview id="empty" title="Empty review" fields={[]} onAction={vi.fn()} />);
    expect(html).toContain("No extracted fields to review."); expect(html).toContain('disabled=""');
  });
  it("renders controlled comparison selection, cells and disabled options", () => {
    const html = renderToStaticMarkup(<ComparisonMatrix {...comparison} selectedId="a" options={[comparison.options[0]!, { ...comparison.options[1]!, disabled: true, evidence: [{ id: "source", label: "Terms", text: "Authored terms" }] }]} onAction={vi.fn()} />);
    expect(html).toContain('type="radio"'); expect(html).toContain('checked=""'); expect(html).toContain("Unavailable"); expect(html).toContain("Authored terms"); expect(html).toContain(">24</td>");
  });
  it("renders malformed and empty comparison states without active choices", () => {
    const malformed = renderToStaticMarkup(<ComparisonMatrix {...comparison} selectedId="removed" onAction={vi.fn()} />);
    expect(malformed).toContain("Comparison is invalid"); expect(malformed).not.toContain('type="radio"');
    const empty = renderToStaticMarkup(<ComparisonMatrix id="empty" title="Empty comparison" criteria={[]} options={[]} onAction={vi.fn()} />);
    expect(empty).toContain("No options to compare."); expect(empty).not.toContain("Confirm selection");
  });
  it("blocks comparison confirmation without a required selection or while busy", () => {
    const onAction = vi.fn();
    expect(renderToStaticMarkup(<ComparisonMatrix {...comparison} onAction={onAction} />)).toContain('disabled=""');
    expect(renderToStaticMarkup(<ComparisonMatrix {...comparison} selectedId="a" busy error="Try again" onAction={onAction} />)).toContain("Try again");
    expect(onAction).not.toHaveBeenCalled();
  });
  it("renders weighted criterion and total scores without choosing automatically", () => {
    const onAction = vi.fn(), html = renderToStaticMarkup(<ScoreBreakdown {...scores} onAction={onAction} />);
    expect(html).toContain("4 / 5 · Weight 2"); expect(html).toContain("Weighted total: 10 / 15 (66.67%)"); expect(html).toContain('aria-label="Fit score"'); expect(onAction).not.toHaveBeenCalled();
  });
  it("renders empty scorecards without NaN, infinity or a fabricated score", () => {
    const html = renderToStaticMarkup(<ScoreBreakdown id="empty" title="Empty score" criteria={[]} />);
    expect(html).toContain("No criteria have been scored."); expect(html).toContain("Not scored"); expect(html).not.toContain("NaN"); expect(html).not.toContain("Infinity");
  });
  it("keeps small positive scores and weights visible rather than displaying zero over zero", () => {
    const html = renderToStaticMarkup(<ScoreBreakdown id="tiny" title="Small score" criteria={[{ id: "small", label: "Small", score: 1e-8, maxScore: 1e-8 }]} />);
    expect(html).toContain("1.00e-8 / 1.00e-8 (100%)"); expect(html).not.toContain("0 / 0");
  });
  it("renders score evidence and busy/error state with no automatic action", () => {
    const onAction = vi.fn(), html = renderToStaticMarkup(<ScoreBreakdown {...scores} selectedCriterionId="fit" busy error="Score review unavailable" criteria={[{ ...scores.criteria[0]!, explanation: "Declared criterion", evidence: [{ id: "source", label: "Checklist", text: "Four covered" }] }]} onAction={onAction} />);
    expect(html).toContain("Four covered"); expect(html).toContain('aria-pressed="true"'); expect(html).toContain('disabled=""'); expect(html).toContain("Score review unavailable"); expect(onAction).not.toHaveBeenCalled();
  });
});

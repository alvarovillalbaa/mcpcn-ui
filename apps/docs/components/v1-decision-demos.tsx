"use client";

import { useState } from "react";
import { ComparisonMatrix, DynamicQuestionFlow, ExtractedFieldsReview, ScoreBreakdown } from "@mcpcn/react";
import type { ComponentAction } from "@mcpcn/react";
import type { DynamicQuestionFlowData, ExtractedFieldsReviewData, ScoreBreakdownData } from "@mcpcn/schemas";

function dataOf(action: ComponentAction): Record<string, unknown> {
  return action.data && typeof action.data === "object" && !Array.isArray(action.data) ? action.data as Record<string, unknown> : {};
}
function LastAction({ label, action }: { label: string; action: ComponentAction | null }) {
  return <pre className="mcpcn-code" aria-label={label}>{action ? JSON.stringify(action, null, 2) : "No action yet"}</pre>;
}
const questions: DynamicQuestionFlowData["questions"] = [
  { id: "goal", label: "What do you need?", type: "select", required: true, options: [{ id: "research", label: "Research" }, { id: "other", label: "Something else" }] },
  { id: "topic", label: "Research topic", type: "text", required: true, when: { questionId: "goal", equals: "research" } },
  { id: "reviewed", label: "I reviewed my answers", type: "boolean", required: true }
];
export function DynamicQuestionFlowDemo() {
  const [revision, setRevision] = useState(1), [answers, setAnswers] = useState<Record<string, string | number | boolean>>({});
  const [currentQuestionId, setCurrentQuestionId] = useState("goal"), [last, setLast] = useState<ComponentAction | null>(null);
  const onAction = (action: ComponentAction) => {
    const data = dataOf(action); setLast(action);
    if (action.type === "answer-change" && typeof data.questionId === "string" && (typeof data.value === "string" || typeof data.value === "boolean" || typeof data.value === "number" && Number.isFinite(data.value))) {
      const id = data.questionId, value = data.value; setAnswers(current => ({ ...current, [id]: value }));
    }
    if (action.type === "question-change" && typeof data.questionId === "string") setCurrentQuestionId(data.questionId);
  };
  return <div className="mcpcn mcpcn-stack">
    <DynamicQuestionFlow id={`demo-flow-${revision}`} title="Collect the missing answers" questions={questions} answers={answers} currentQuestionId={currentQuestionId} onAction={onAction} />
    <button type="button" onClick={() => { setRevision(value => value + 1); setAnswers({}); setCurrentQuestionId("goal"); setLast(null); }}>Reset question flow</button>
    <LastAction label="Last question-flow action" action={last} />
  </div>;
}

const initialFields: ExtractedFieldsReviewData["fields"] = [
  { id: "supplier", label: "Supplier", original: "Acme Labs", value: "Acme Labs", required: true, confidence: 0.97, evidence: [{ id: "heading", label: "Invoice heading", text: "Acme Labs — authored example invoice" }] },
  { id: "total", label: "Invoice total", original: "EUR 125", value: "EUR 125", required: true, confidence: 0.58, evidence: [{ id: "line-4", label: "Document line 4", text: "Total: EUR 120. Check the extraction before confirming." }] }
];
export function ExtractedFieldsReviewDemo() {
  const [revision, setRevision] = useState(1), [fields, setFields] = useState(initialFields), [last, setLast] = useState<ComponentAction | null>(null);
  const onAction = (action: ComponentAction) => {
    const data = dataOf(action); setLast(action);
    if (action.type === "correction-change" && typeof data.fieldId === "string" && typeof data.value === "string") {
      const id = data.fieldId, value = data.value; setFields(current => current.map(field => field.id === id ? { ...field, value } : field));
    }
  };
  return <div className="mcpcn mcpcn-stack">
    <ExtractedFieldsReview id={`demo-extraction-${revision}`} title="Check the extracted invoice" description="Corrections are consumer-owned intent. Nothing is saved or uploaded." fields={fields} onAction={onAction} />
    <button type="button" onClick={() => { setRevision(value => value + 1); setFields(initialFields.map(field => ({ ...field }))); setLast(null); }}>Reset extraction review</button>
    <LastAction label="Last extraction action" action={last} />
  </div>;
}

export function ComparisonMatrixDemo() {
  const [selectedId, setSelectedId] = useState<string | null>(null), [last, setLast] = useState<ComponentAction | null>(null);
  const [payload, setPayload] = useState("ready");
  const options = [
    { id: "standard", label: "Standard", values: { cost: "EUR 12", time: "5 days" }, evidence: [{ id: "standard-terms", label: "Standard service terms", text: "Authored comparison fixture: five-day service." }] },
    { id: "express", label: "Express", values: { cost: "EUR 24", time: "2 days" }, evidence: [{ id: "express-terms", label: "Express service terms", text: "Authored comparison fixture: two-day service." }] },
    { id: "same-day", label: "Same day", disabled: true, values: { cost: "EUR 40", time: "Today" }, evidence: [] }
  ];
  const onAction = (action: ComponentAction) => {
    const data = dataOf(action); setLast(action);
    if (action.type === "selection-change" && (typeof data.selectedId === "string" || data.selectedId === null)) setSelectedId(data.selectedId);
  };
  return <div className="mcpcn mcpcn-stack">
    <label>Comparison example payload<select aria-label="Comparison example payload" value={payload} onChange={event => { setPayload(event.target.value); setSelectedId(null); setLast(null); }}><option value="ready">Ready</option><option value="empty">Empty</option><option value="malformed">Malformed</option></select></label>
    <ComparisonMatrix id="demo-delivery-comparison" title="Compare delivery options" criteria={payload === "empty" ? [] : [{ id: "cost", label: "Cost" }, { id: "time", label: "Delivery time" }]} options={payload === "empty" ? [] : payload === "malformed" ? [options[0]!, options[0]!] : options} selectedId={selectedId} onAction={onAction} />
    <LastAction label="Last comparison action" action={last} />
  </div>;
}

const scoredCriteria: ScoreBreakdownData["criteria"] = [
  { id: "coverage", label: "Coverage", score: 8, maxScore: 10, weight: 2, explanation: "Eight of ten authored requirements are covered.", evidence: [{ id: "coverage-check", label: "Requirement checklist", text: "Eight covered; two still need review." }] },
  { id: "cost", label: "Cost fit", score: 4, maxScore: 5, weight: 1, explanation: "This is an illustrative score, not an automatic recommendation.", evidence: [{ id: "cost-check", label: "Budget comparison", text: "Authored example budget fit: four of five." }] }
];
export function ScoreBreakdownDemo() {
  const [selectedCriterionId, setSelectedCriterionId] = useState<string | null>(null), [last, setLast] = useState<ComponentAction | null>(null);
  const onAction = (action: ComponentAction) => {
    const data = dataOf(action); setLast(action);
    if (action.type === "criterion-review" && typeof data.criterionId === "string") setSelectedCriterionId(data.criterionId);
  };
  return <div className="mcpcn mcpcn-stack">
    <ScoreBreakdown id="demo-scorecard" title="Understand the score" criteria={scoredCriteria} selectedCriterionId={selectedCriterionId} onAction={onAction} />
    <LastAction label="Last score action" action={last} />
  </div>;
}

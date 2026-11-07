"use client";

import { useId } from "react";
import type { z } from "zod";
import { ComparisonMatrixSchema, DynamicQuestionFlowSchema, ExtractedFieldsReviewSchema, ScoreBreakdownSchema,
  type ComparisonMatrixData, type DynamicQuestionFlowData, type ExtractedFieldsReviewData, type ScoreBreakdownData } from "@mcpcn/schemas";
import { Badge, Button, Card, Input, InvalidPayload, Select, Textarea } from "./primitives.js";
import type { ComponentProps } from "./component-types.js";
import { Feedback, revisionKey, useComponentAction } from "./component-helpers.js";

type UIProps = ComponentProps<unknown>;
type Flow = z.output<typeof DynamicQuestionFlowSchema>;
type Question = Flow["questions"][number];
type Answer = string | number | boolean;
type Evidence = { id: string; label: string; text?: string; url?: string };

export type DecisionComponentAction =
  | { type: "answer-change"; data: { flowId: string; questionId: string; value: Answer } }
  | { type: "question-change"; data: { flowId: string; questionId: string } }
  | { type: "submit"; data: { flowId: string; answers: Record<string, Answer> } | { reviewId: string; values: Record<string, string> } }
  | { type: "correction-change"; data: { reviewId: string; fieldId: string; value: string } }
  | { type: "selection-change" | "confirm"; data: { comparisonId: string; selectedId: string | null } }
  | { type: "criterion-review"; data: { scoreId: string; criterionId: string } };

function EvidenceList({ items }: { items: Evidence[] }) {
  if (!items.length) return <p className="mcpcn-hint">No supporting evidence was provided.</p>;
  return <ul className="mcpcn-stack" aria-label="Supporting evidence">{items.map(item => <li key={item.id}>
    {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.label}</a> : <strong>{item.label}</strong>}
    {item.text && <p className="mcpcn-description">{item.text}</p>}
  </li>)}</ul>;
}
function visibleQuestions(data: Flow) {
  const visible: Question[] = [], ids = new Set<string>();
  for (const question of data.questions) {
    const condition = question.when;
    if (!condition || (ids.has(condition.questionId) && Object.hasOwn(data.answers, condition.questionId) && data.answers[condition.questionId] === condition.equals)) {
      visible.push(question); ids.add(question.id);
    }
  }
  return visible;
}
function complete(question: Question, value: Answer | undefined) {
  if (value === undefined || value === "") return !question.required;
  if (question.type === "boolean") return typeof value === "boolean" && (!question.required || value);
  if (question.type === "number") return typeof value === "number" && Number.isFinite(value);
  if (typeof value !== "string" || (question.required && !value.trim())) return false;
  if (question.type === "select") return Boolean(question.options?.some(option => option.id === value && !option.disabled));
  return question.type !== "email" || /^[^\s@]+@[^\s@]+$/.test(value);
}
function allowedAnswers(questions: Question[], answers: Flow["answers"]): Record<string, Answer> {
  return Object.fromEntries(questions.filter(question => Object.hasOwn(answers, question.id)).map(question => [question.id, answers[question.id]!])) as Record<string, Answer>;
}

export function DynamicQuestionFlow(props: ComponentProps<DynamicQuestionFlowData>) {
  const parsed = DynamicQuestionFlowSchema.safeParse(props);
  if (!parsed.success) return <InvalidPayload title="Question flow is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  const { answers: _answers, currentQuestionId: _current, ...terms } = parsed.data;
  return <QuestionFlowView key={revisionKey(terms)} data={parsed.data} onAction={props.onAction} busy={props.busy} error={props.error} className={props.className} />;
}
function QuestionFlowView({ data, onAction, busy, error, className }: UIProps & { data: Flow }) {
  const inputId = useId(), action = useComponentAction(onAction, busy);
  const questions = visibleQuestions(data), current = questions.find(question => question.id === data.currentQuestionId) ?? questions[0];
  const index = current ? questions.indexOf(current) : -1;
  const disabled = data.disabled || action.busy || !onAction;
  const currentComplete = current ? complete(current, data.answers[current.id]) : false;
  const allComplete = questions.length > 0 && questions.every(question => complete(question, data.answers[question.id]));
  const previous = questions[index - 1], next = questions[index + 1];
  const answer = (value: Answer) => { if (current && !disabled && !current.disabled) action.send({ type: "answer-change", data: { flowId: data.id, questionId: current.id, value } }); };
  const navigate = (question: Question | undefined) => { if (question && !disabled) action.send({ type: "question-change", data: { flowId: data.id, questionId: question.id } }); };
  const value = current ? data.answers[current.id] : undefined;
  return <Card className={className} aria-busy={action.busy}>
    <header className="mcpcn-header"><h3 className="mcpcn-title">{data.title}</h3>{data.description && <p className="mcpcn-description">{data.description}</p>}</header>
    {!current ? <div className="mcpcn-body"><p role="status">No questions are available.</p></div> : <form aria-label={data.title} onSubmit={event => {
      event.preventDefault();
      if (!disabled && allComplete && event.currentTarget.checkValidity()) action.send({ type: "submit", data: { flowId: data.id, answers: allowedAnswers(questions, data.answers) } });
    }}>
      <div className="mcpcn-body mcpcn-stack">
        <p className="mcpcn-hint" role="status">Question {index + 1} of {questions.length}</p>
        <fieldset disabled={disabled || current.disabled} className="mcpcn-fieldset">
          <legend>{current.label}{current.required ? " (required)" : ""}</legend>
          {current.description && <p id={`${inputId}-description`} className="mcpcn-description">{current.description}</p>}
          {current.type === "boolean" ? <label className="mcpcn-row"><input id={inputId} aria-label={current.label} type="checkbox" required={current.required} checked={value === true} onChange={event => answer(event.currentTarget.checked)} />{current.label}</label>
            : current.type === "select" ? <Select id={inputId} aria-label={current.label} required={current.required} value={typeof value === "string" ? value : ""} onChange={event => answer(event.currentTarget.value)}><option value="">Select…</option>{current.options?.map(option => <option key={option.id} value={option.id} disabled={option.disabled}>{option.label}</option>)}</Select>
              : current.type === "textarea" ? <Textarea id={inputId} aria-label={current.label} required={current.required} maxLength={4000} value={typeof value === "string" ? value : ""} onChange={event => answer(event.currentTarget.value)} />
                : <Input id={inputId} aria-label={current.label} type={current.type} step={current.type === "number" ? "any" : undefined} required={current.required} maxLength={4000} value={typeof value === "string" || typeof value === "number" ? value : ""} onChange={event => {
                  const input = event.currentTarget;
                  if (current.type !== "number") answer(input.value);
                  else if (input.value === "") answer("");
                  else if (Number.isFinite(input.valueAsNumber)) answer(input.valueAsNumber);
                }} />}
          {current.disabled && <p className="mcpcn-hint">This question is currently read-only.</p>}
        </fieldset>
        {!currentComplete && <p className="mcpcn-hint">Complete this required answer before continuing.</p>}
      </div>
      <footer className="mcpcn-footer mcpcn-row">
        <Button type="button" data-variant="secondary" disabled={disabled || !previous} onClick={() => navigate(previous)}>Back</Button>
        {next ? <Button type="button" disabled={disabled || !currentComplete} onClick={event => { if (event.currentTarget.form?.reportValidity()) navigate(next); }}>Next question</Button>
          : <Button type="submit" disabled={disabled || !allComplete}>{data.submitLabel}</Button>}
      </footer>
    </form>}
    <Feedback busy={action.busy} error={error ?? action.error} />
  </Card>;
}

export function ExtractedFieldsReview(props: ComponentProps<ExtractedFieldsReviewData>) {
  const parsed = ExtractedFieldsReviewSchema.safeParse(props);
  if (!parsed.success) return <InvalidPayload title="Extracted fields are invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  const terms = { ...parsed.data, fields: parsed.data.fields.map(({ value: _value, ...field }) => field) };
  return <ExtractionView key={revisionKey(terms)} data={parsed.data} onAction={props.onAction} busy={props.busy} error={props.error} className={props.className} />;
}
function ExtractionView({ data, onAction, busy, error, className }: UIProps & { data: z.output<typeof ExtractedFieldsReviewSchema> }) {
  const prefix = useId(), action = useComponentAction(onAction, busy), disabled = data.disabled || action.busy || !onAction;
  const complete = data.fields.length > 0 && data.fields.every(field => !field.required || Boolean(field.value.trim()));
  return <Card className={className} aria-busy={action.busy}>
    <form aria-label={data.title} onSubmit={event => {
      event.preventDefault();
      if (!disabled && complete && event.currentTarget.checkValidity()) action.send({ type: "submit", data: { reviewId: data.id, values: Object.fromEntries(data.fields.map(field => [field.id, field.value])) } });
    }}>
      <header className="mcpcn-header"><h3 className="mcpcn-title">{data.title}</h3>{data.description && <p className="mcpcn-description">{data.description}</p>}</header>
      <div className="mcpcn-body mcpcn-stack">
        {!data.fields.length && <p role="status">No extracted fields to review.</p>}
        {data.fields.map((field, index) => <section key={field.id} className="mcpcn-stack" aria-label={field.label}>
          <label className="mcpcn-label" htmlFor={`${prefix}-${index}`}>{field.label}{field.required ? " (required)" : ""}</label>
          <p className="mcpcn-description">Extracted: {field.original || "Not provided"}</p>
          {field.confidence !== undefined && <Badge>{Math.round(field.confidence * 100)}% confidence</Badge>}
          <Input id={`${prefix}-${index}`} aria-label={`Correct ${field.label}`} required={field.required} maxLength={4000} disabled={disabled || field.disabled} value={field.value} onChange={event => {
            if (!disabled && !field.disabled) action.send({ type: "correction-change", data: { reviewId: data.id, fieldId: field.id, value: event.currentTarget.value } });
          }} />
          <EvidenceList items={field.evidence} />
        </section>)}
      </div>
      <footer className="mcpcn-footer"><Button type="submit" disabled={disabled || !complete}>{data.submitLabel}</Button></footer>
    </form><Feedback busy={action.busy} error={error ?? action.error} />
  </Card>;
}

export function ComparisonMatrix(props: ComponentProps<ComparisonMatrixData>) {
  const parsed = ComparisonMatrixSchema.safeParse(props);
  if (!parsed.success) return <InvalidPayload title="Comparison is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  const { selectedId: _selected, ...terms } = parsed.data;
  return <ComparisonView key={revisionKey(terms)} data={parsed.data} onAction={props.onAction} busy={props.busy} error={props.error} className={props.className} />;
}
function ComparisonView({ data, onAction, busy, error, className }: UIProps & { data: z.output<typeof ComparisonMatrixSchema> }) {
  const group = useId(), action = useComponentAction(onAction, busy), disabled = data.disabled || action.busy || !onAction;
  const selected = data.options.find(option => option.id === data.selectedId);
  const valid = data.options.length > 0 && (selected ? !selected.disabled : !data.required);
  return <Card className={className} aria-busy={action.busy}>
    <header className="mcpcn-header"><h3 className="mcpcn-title">{data.title}</h3>{data.description && <p className="mcpcn-description">{data.description}</p>}</header>
    {!data.options.length ? <div className="mcpcn-body"><p role="status">No options to compare.</p></div> : <>
      <div className="mcpcn-table-wrap"><table className="mcpcn-table"><caption>{data.title}</caption>
        <thead><tr><th scope="col">Option</th>{data.criteria.map(criterion => <th scope="col" key={criterion.id}>{criterion.label}{criterion.description && <p className="mcpcn-hint">{criterion.description}</p>}</th>)}<th scope="col">Evidence</th></tr></thead>
        <tbody>{data.options.map(option => <tr key={option.id} data-selected={option.id === data.selectedId}>
          <th scope="row"><label className="mcpcn-row"><input type="radio" name={group} aria-label={`Select ${option.label}`} checked={option.id === data.selectedId} disabled={disabled || option.disabled} onChange={() => {
            if (!disabled && !option.disabled) action.send({ type: "selection-change", data: { comparisonId: data.id, selectedId: option.id } });
          }} />{option.label}</label>{option.description && <p className="mcpcn-description">{option.description}</p>}{option.disabled && <span className="mcpcn-hint">Unavailable</span>}</th>
          {data.criteria.map(criterion => <td key={criterion.id}>{option.values[criterion.id] == null ? "—" : String(option.values[criterion.id])}</td>)}
          <td><EvidenceList items={option.evidence} /></td>
        </tr>)}</tbody></table></div>
      <footer className="mcpcn-footer mcpcn-row">
        <Button type="button" data-variant="secondary" disabled={disabled || data.selectedId == null} onClick={() => { if (!disabled) action.send({ type: "selection-change", data: { comparisonId: data.id, selectedId: null } }); }}>Clear selection</Button>
        <Button type="button" disabled={disabled || !valid} onClick={() => { if (!disabled && valid) action.send({ type: "confirm", data: { comparisonId: data.id, selectedId: selected?.id ?? null } }); }}>{data.confirmLabel}</Button>
      </footer>
    </>}<Feedback busy={action.busy} error={error ?? action.error} />
  </Card>;
}

export function ScoreBreakdown(props: ComponentProps<ScoreBreakdownData>) {
  const parsed = ScoreBreakdownSchema.safeParse(props);
  if (!parsed.success) return <InvalidPayload title="Score breakdown is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  const { selectedCriterionId: _selected, ...terms } = parsed.data;
  return <ScoreView key={revisionKey(terms)} data={parsed.data} onAction={props.onAction} busy={props.busy} error={props.error} className={props.className} />;
}
function ScoreView({ data, onAction, busy, error, className }: UIProps & { data: z.output<typeof ScoreBreakdownSchema> }) {
  const action = useComponentAction(onAction, busy), disabled = data.disabled || action.busy || !onAction;
  const score = data.criteria.reduce((sum, criterion) => sum + criterion.score * criterion.weight, 0);
  const maximum = data.criteria.reduce((sum, criterion) => sum + criterion.maxScore * criterion.weight, 0);
  const format = (value: number) => value !== 0 && Math.abs(value) < 0.01 ? value.toExponential(2) : new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
  return <Card className={className} aria-busy={action.busy}>
    <header className="mcpcn-header"><h3 className="mcpcn-title">{data.title}</h3>{data.description && <p className="mcpcn-description">{data.description}</p>}</header>
    <div className="mcpcn-body mcpcn-stack">
      {!data.criteria.length ? <p role="status">No criteria have been scored.</p> : data.criteria.map(criterion => <section key={criterion.id} className="mcpcn-stack" data-selected={criterion.id === data.selectedCriterionId} aria-label={criterion.label}>
        <h4>{criterion.label}</h4><p>{format(criterion.score)} / {format(criterion.maxScore)} · Weight {format(criterion.weight)}</p>
        <progress value={criterion.score} max={criterion.maxScore} aria-label={`${criterion.label} score`} />
        {criterion.explanation && <p className="mcpcn-description">{criterion.explanation}</p>}
        <EvidenceList items={criterion.evidence} />
        {onAction && <Button type="button" data-variant="secondary" aria-pressed={criterion.id === data.selectedCriterionId} disabled={disabled || criterion.disabled} onClick={() => {
          if (!disabled && !criterion.disabled) action.send({ type: "criterion-review", data: { scoreId: data.id, criterionId: criterion.id } });
        }}>Review {criterion.label}</Button>}
      </section>)}
      <output aria-label={data.totalLabel}>{data.totalLabel}: {maximum > 0 ? `${format(score)} / ${format(maximum)} (${format(score / maximum * 100)}%)` : "Not scored"}</output>
    </div><Feedback busy={action.busy} error={error ?? action.error} />
  </Card>;
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MissingDataRequest, MultiStepForm, InlineEditForm, FormProgressCard, ValidatedFieldList, type ComponentAction } from "@mcpcn/react";
import type { MissingDataRequestData, MultiStepFormData, InlineEditFormData, FormProgressCardData, ValidatedFieldListData } from "@mcpcn/schemas";
import { formWorkflowExamples, type FormWorkflowSlug } from "./form-workflow-examples";

type Data = Record<string, unknown>;
const object = (value: unknown): value is Data => value !== null && typeof value === "object" && !Array.isArray(value);

/** Acknowledge only current navigation; terminal actions remain consumer intent. */
export function formWorkflowSelection(slug: FormWorkflowSlug, current: Data, action: ComponentAction): Data | undefined {
  const value = action.data;
  if (!object(value) || value.id !== current.id) return undefined;
  if (slug === "multi-step-form") {
    const data = current as MultiStepFormData;
    return action.type === "change-form-step" && value.fromStepId === data.currentStepId && typeof value.stepId === "string"
      && data.steps.some(step => step.id === value.stepId) ? { currentStepId: value.stepId } : undefined;
  }
  if (slug === "form-progress-card" && action.type === "select-form-progress-step" && typeof value.stepId === "string"
    && (current as FormProgressCardData).steps?.some(step => step.id === value.stepId)) return { selectedStepId: value.stepId };
  if (slug === "validated-field-list" && action.type === "select-validated-field" && typeof value.fieldId === "string"
    && (current as ValidatedFieldListData).fields.some(field => field.id === value.fieldId)) return { selectedFieldId: value.fieldId };
  return undefined;
}

function useFeedback() {
  const [last, setLast] = useState<ComponentAction | null>(null), [count, setCount] = useState(0), [settled, setSettled] = useState(0);
  const [response, setResponse] = useState<"immediate" | "delayed" | "reject">("immediate");
  const jobs = useRef(new Set<{ timer: ReturnType<typeof setTimeout>; resolve(): void }>());
  useEffect(() => () => {
    for (const job of jobs.current) { clearTimeout(job.timer); job.resolve(); }
    jobs.current.clear();
  }, []);
  const receive = (action: ComponentAction, controlled: boolean): void | Promise<void> => {
    setLast(action); setCount(value => value + 1);
    const capturedResponse = response;
    if (controlled || capturedResponse === "immediate") return;
    return new Promise<void>((resolve, reject) => {
      const job = { timer: setTimeout(() => {
        jobs.current.delete(job); setSettled(value => value + 1);
        if (capturedResponse === "reject") reject(new Error("Authored form consumer rejection")); else resolve();
      }, 1500), resolve };
      jobs.current.add(job);
    });
  };
  return {
    receive, reset: () => { setLast(null); setCount(0); },
    controls: <label className="mcpcn-label">Consumer response<select aria-label="Consumer response" value={response} onChange={event => setResponse(event.currentTarget.value as typeof response)}>
      <option value="immediate">Immediate</option><option value="delayed">Delayed</option><option value="reject">Reject</option>
    </select></label>,
    output: <><p className="mcpcn-hint">Authored local feedback only. Values remain local until the consuming app deliberately handles an intent; no tool, validator service, authorization or model runtime is started.</p>
      <p>Form workflow intents: <output aria-label="Form workflow intent count">{count}</output></p>
      <p>Settled callbacks: <output aria-label="Settled callback count">{settled}</output></p>
      <pre className="code" aria-label="Last form workflow intent">{JSON.stringify(last, null, 2)}</pre></>,
  };
}

function FormWorkflowDemo({ slug }: { slug: FormWorkflowSlug }) {
  const [data, setData] = useState<Data>(() => structuredClone(formWorkflowExamples[slug])), [revision, setRevision] = useState(1);
  const [appended, setAppended] = useState(false), [replaced, setReplaced] = useState(false), [advanced, setAdvanced] = useState(false);
  const feedback = useFeedback();
  const receive = (action: ComponentAction) => {
    const patch = formWorkflowSelection(slug, data, action);
    if (patch) setData(current => {
      const next = formWorkflowSelection(slug, current, action);
      return next ? { ...current, ...next } : current;
    });
    return feedback.receive(action, patch !== undefined);
  };
  let component: ReactNode;
  switch (slug) {
    case "missing-data-request": component = <MissingDataRequest {...data as MissingDataRequestData} onAction={receive} />; break;
    case "multi-step-form": component = <MultiStepForm {...data as MultiStepFormData} onAction={receive} />; break;
    case "inline-edit-form": component = <InlineEditForm {...data as InlineEditFormData} onAction={receive} />; break;
    case "form-progress-card": component = <FormProgressCard {...data as FormProgressCardData} onAction={receive} />; break;
    case "validated-field-list": component = <ValidatedFieldList {...data as ValidatedFieldListData} onAction={receive} />; break;
  }
  const appendLabel = slug === "missing-data-request" ? "Append known context" : slug === "form-progress-card" ? "Append unrelated step" : "Append unrelated field";
  const append = () => {
    if (appended) return;
    setData(current => {
      switch (slug) {
        case "missing-data-request": return { ...current, knownFields: [...((current as MissingDataRequestData).knownFields ?? []), { id: "appended-context", label: "Additional known context", value: { appended: true } }] };
        case "multi-step-form": return { ...current, steps: (current as MultiStepFormData).steps.map(step => step.id === "review" ? { ...step, fields: [...step.fields, { id: "appendix", label: "Additional context", type: "text", value: "Authored appendix" }] } : step) };
        case "inline-edit-form": return { ...current, fields: [...(current as InlineEditFormData).fields, { id: "appendix", label: "Additional context", type: "text", value: "Authored appendix" }] };
        case "form-progress-card": return { ...current, steps: [...((current as FormProgressCardData).steps ?? []), { id: "appended-step", label: "Additional authored step", status: "not-started" }] };
        case "validated-field-list": return { ...current, fields: [...(current as ValidatedFieldListData).fields, { id: "appended-field", label: "Additional authored field", status: "unvalidated", value: true, validatable: true }] };
      }
    });
    setAppended(true);
  };
  const replaceLabel = slug === "missing-data-request" ? "Replace requested field" : slug === "multi-step-form" ? "Replace current field" : slug === "inline-edit-form" ? "Replace edited field" : slug === "form-progress-card" ? "Replace selected step" : "Replace selected field";
  const selectedAvailable = slug === "form-progress-card" ? typeof data.selectedStepId === "string" : slug === "validated-field-list" ? typeof data.selectedFieldId === "string" : true;
  const replace = () => {
    if (replaced || !selectedAvailable) return;
    setData(current => {
      switch (slug) {
        case "missing-data-request": return { ...current, fields: (current as MissingDataRequestData).fields.map(field => field.id === "subject" ? { ...field, label: "Replacement subject", minLength: 4 } : field) };
        case "multi-step-form": return { ...current, steps: (current as MultiStepFormData).steps.map(step => step.id === current.currentStepId ? { ...step, fields: step.fields.map((field, index) => index === 0 ? { ...field, label: "Replacement current field", value: "Replacement authored value" } : field) } : step) };
        case "inline-edit-form": return { ...current, fields: (current as InlineEditFormData).fields.map(field => field.id === "subject" ? { ...field, value: "Replacement authored subject" } : field) };
        case "form-progress-card": return { ...current, steps: (current as FormProgressCardData).steps?.map(step => step.id === current.selectedStepId ? { ...step, label: "Replacement authored step", status: "blocked" } : step) };
        case "validated-field-list": return { ...current, fields: (current as ValidatedFieldListData).fields.map(field => field.id === current.selectedFieldId ? { ...field, label: "Replacement authored field", value: { replacement: true }, status: "invalid", message: "Replacement authored validation.", validatable: true } : field) };
      }
    });
    setReplaced(true);
  };
  return <div className="mcpcn-stack">{feedback.controls}{component}<div className="filter-row">
    <button type="button" className="button secondary" disabled={appended} onClick={append}>{appendLabel}</button>
    {slug === "form-progress-card" && <button type="button" className="button secondary" disabled={advanced} onClick={() => {
      if (advanced) return;
      setData(current => ({ ...current, progress: { completed: 3, total: 3 }, steps: (current as FormProgressCardData).steps?.map(step => step.id === "review" ? { ...step, progress: { completed: 1, total: 1 } } : step) })); setAdvanced(true);
    }}>Advance reported progress</button>}
    <button type="button" className="button secondary" disabled={replaced || !selectedAvailable} onClick={replace}>{replaceLabel}</button>
    <button type="button" className="button secondary" onClick={() => {
      const next = revision + 1;
      setRevision(next); setAppended(false); setReplaced(false); setAdvanced(false);
      setData({ ...structuredClone(formWorkflowExamples[slug]), id: `${formWorkflowExamples[slug].id}-replacement-${next}` }); feedback.reset();
    }}>Replace operation</button>
  </div>{feedback.output}</div>;
}

export function MissingDataRequestDemo() { return <FormWorkflowDemo slug="missing-data-request" />; }
export function MultiStepFormDemo() { return <FormWorkflowDemo slug="multi-step-form" />; }
export function InlineEditFormDemo() { return <FormWorkflowDemo slug="inline-edit-form" />; }
export function FormProgressCardDemo() { return <FormWorkflowDemo slug="form-progress-card" />; }
export function ValidatedFieldListDemo() { return <FormWorkflowDemo slug="validated-field-list" />; }

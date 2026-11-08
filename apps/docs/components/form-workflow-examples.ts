import type { MissingDataRequestData, MultiStepFormData, InlineEditFormData, FormProgressCardData, ValidatedFieldListData } from "@mcpcn/schemas";

const deliveryOptions = [{ value: "standard", label: "Standard" }, { value: "express", label: "Express" }, { value: "unavailable", label: "Unavailable", disabled: true }];
export const formWorkflowExamples = {
  "missing-data-request": {
    id: "docs-missing-1", title: "Provide the missing information", description: "Known context stays read-only. This preview does not submit anything externally.",
    fields: [{ id: "subject", label: "Subject", type: "text", required: true, minLength: 3 }, { id: "count", label: "Count", type: "number", required: true, min: 0, max: 10 }, { id: "reviewed", label: "Reviewed", type: "boolean", required: true }, { id: "details", label: "Details", type: "json" }],
    knownFields: [{ id: "document", label: "Known authored document", value: { title: "Authored record", count: 0, reviewed: false, next: null } }],
  },
  "multi-step-form": {
    id: "docs-multi-1", title: "Complete the reviewed form", currentStepId: "details",
    steps: [{ id: "details", title: "Details", fields: [{ id: "team", label: "Team", type: "text", required: true, minLength: 2, value: "Authored team" }, { id: "quantity", label: "Quantity", type: "number", required: true, min: 1, value: 2 }, { id: "delivery", label: "Delivery", type: "select", required: true, value: "standard", options: deliveryOptions }] },
      { id: "review", title: "Review", fields: [{ id: "notes", label: "Notes", type: "textarea", value: "Authored\nnotes" }, { id: "confirmed", label: "Confirmed", type: "boolean", required: true, value: false }, { id: "config", label: "Config", type: "json", required: true, value: null }] }],
  },
  "inline-edit-form": {
    id: "docs-inline-1", title: "Review and edit structured values",
    fields: [{ id: "subject", label: "Subject", type: "text", required: true, value: "Authored subject" }, { id: "count", label: "Count", type: "number", required: true, value: 0 }, { id: "reviewed", label: "Reviewed", type: "boolean", required: true, value: false }, { id: "payload", label: "Payload", type: "json", required: true, value: { records: [], next: null } }, { id: "notes", label: "Notes", type: "textarea", value: "Authored notes" }, { id: "delivery", label: "Delivery", type: "select", value: "standard", options: deliveryOptions }],
  },
  "form-progress-card": {
    id: "docs-form-progress-1", title: "Review reported form progress", status: "in-progress", progress: { completed: 2, total: 3 },
    steps: [{ id: "collect", label: "Collect details", status: "complete", progress: { completed: 2, total: 2 } }, { id: "review", label: "Review details", status: "in-progress", progress: { completed: 0, total: 1 } }, { id: "submit", label: "Submit reviewed form", status: "not-started" }], selectedStepId: "review",
  },
  "validated-field-list": {
    id: "docs-validated-1", title: "Review reported field validation",
    fields: [{ id: "subject", label: "Subject", status: "invalid", value: "Authored subject", message: "Needs authored review.", validatable: true }, { id: "count", label: "Count", status: "valid", value: 0 }, { id: "reviewed", label: "Reviewed", status: "valid", value: false }, { id: "payload", label: "Payload", status: "valid", value: null }, { id: "pending", label: "Pending detail", status: "pending" }], selectedFieldId: "subject",
  },
} satisfies {
  "missing-data-request": MissingDataRequestData;
  "multi-step-form": MultiStepFormData;
  "inline-edit-form": InlineEditFormData;
  "form-progress-card": FormProgressCardData;
  "validated-field-list": ValidatedFieldListData;
};

export type FormWorkflowSlug = keyof typeof formWorkflowExamples;
const names = { "missing-data-request": "MissingDataRequest", "multi-step-form": "MultiStepForm", "inline-edit-form": "InlineEditForm", "form-progress-card": "FormProgressCard", "validated-field-list": "ValidatedFieldList" } as const;
const handlers = {
  "multi-step-form": `    const value = action.data as { id?: string; fromStepId?: string; stepId?: string } | undefined;
    if (action.type === "change-form-step" && value?.id === data.id && value.fromStepId === data.currentStepId && typeof value.stepId === "string") {
      const { stepId } = value;
      setData(current => current.id === value.id && current.currentStepId === value.fromStepId && current.steps.some(step => step.id === stepId) ? { ...current, currentStepId: stepId } : current);
    }`,
  "form-progress-card": `    const value = action.data as { id?: string; stepId?: string } | undefined;
    if (action.type === "select-form-progress-step" && value?.id === data.id && typeof value.stepId === "string") {
      const { stepId } = value;
      setData(current => current.id === value.id && current.steps?.some(step => step.id === stepId) ? { ...current, selectedStepId: stepId } : current);
    }`,
  "validated-field-list": `    const value = action.data as { id?: string; fieldId?: string } | undefined;
    if (action.type === "select-validated-field" && value?.id === data.id && typeof value.fieldId === "string") {
      const { fieldId } = value;
      setData(current => current.id === value.id && current.fields.some(field => field.id === fieldId) ? { ...current, selectedFieldId: fieldId } : current);
    }`,
};

/** Complete consumer examples keep navigation controlled and persistence explicit. */
export function formWorkflowExampleCode(slug: string): string | undefined {
  if (!Object.hasOwn(formWorkflowExamples, slug)) return undefined;
  const key = slug as FormWorkflowSlug, name = names[key], controlled = key === "multi-step-form" || key === "form-progress-card" || key === "validated-field-list";
  return `"use client";
import { useState } from "react";
import { ${name}, type ComponentAction } from "@mcpcn/react";
import type { ${name}Data } from "@mcpcn/schemas";

export function Example() {
  const [data${controlled ? ", setData" : ""}] = useState<${name}Data>(${JSON.stringify(formWorkflowExamples[key], null, 2)});
  const [last, setLast] = useState<ComponentAction | null>(null);
  const handleAction = (action: ComponentAction) => {
    setLast(action);
${controlled ? handlers[key as keyof typeof handlers] : "    // Independently validate and persist reviewed values or changes in the consuming app."}
  };
  return <>
    <${name} {...data} onAction={handleAction} />
    <pre aria-label="Last form intent">{JSON.stringify(last, null, 2)}</pre>
  </>;
}`;
}

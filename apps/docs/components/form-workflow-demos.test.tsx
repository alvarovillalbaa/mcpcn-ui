import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { schemaBySlug } from "@mcpcn/schemas";
import { MissingDataRequestDemo, MultiStepFormDemo, InlineEditFormDemo, FormProgressCardDemo, ValidatedFieldListDemo, formWorkflowSelection } from "./form-workflow-demos";
import { formWorkflowExampleCode, formWorkflowExamples } from "./form-workflow-examples";

describe("form workflow cohort documentation previews", () => {
  it("renders real missing-field inputs with read-only known context and local consumer controls", () => {
    const html = renderToStaticMarkup(<MissingDataRequestDemo />);
    expect(html).toContain('aria-label="Provide the missing information"'); expect(html).toContain("Known authored document");
    for (const label of ["Subject", "Count", "Reviewed", "Details", "Consumer response", "Form workflow intent count", "Settled callback count", "Last form workflow intent"]) expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain("Append known context"); expect(html).toContain("Replace requested field"); expect(html).toContain("Provide information"); expect(html).not.toContain("GenericAgentComponent");
  });
  it("renders a controlled multi-step form with actual typed controls and navigation", () => {
    const html = renderToStaticMarkup(<MultiStepFormDemo />);
    expect(html).toContain('aria-label="Complete the reviewed form"');
    for (const label of ["Team", "Quantity", "Delivery", "Go to step: Review"]) expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain("Next"); expect(html).toContain("Append unrelated field"); expect(html).toContain("Replace current field"); expect(html).not.toContain("GenericAgentComponent");
  });
  it("renders typed inline editing with explicit clearing and no automatic saved state", () => {
    const html = renderToStaticMarkup(<InlineEditFormDemo />);
    expect(html).toContain('aria-label="Review and edit structured values"');
    for (const label of ["Subject", "Count", "Reviewed", "Payload", "Notes", "Delivery", "Clear Notes"]) expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain("Save changes"); expect(html).toContain("Replace edited field"); expect(html).toContain("Replace operation"); expect(html).not.toContain("GenericAgentComponent");
  });
  it("renders reported progress and current step inspection without inferring completed status", () => {
    const html = renderToStaticMarkup(<FormProgressCardDemo />);
    expect(html).toContain('aria-label="Review reported form progress"'); expect(html).toContain("in-progress");
    expect(html).toContain("Collect details"); expect(html).toContain("Review details"); expect(html).toContain("Inspect form progress"); expect(html).toContain("Inspect progress step");
    expect(html).toContain("Advance reported progress"); expect(html).toContain("Append unrelated step"); expect(html).toContain("Replace selected step"); expect(html).not.toContain("GenericAgentComponent");
  });
  it("renders reported field validation with current eligible validation and complete value disclosure", () => {
    const html = renderToStaticMarkup(<ValidatedFieldListDemo />);
    expect(html).toContain('aria-label="Review reported field validation"'); expect(html).toContain("Needs authored review.");
    expect(html).toContain("Pending detail"); expect(html).toContain("Inspect field"); expect(html).toContain("Validate field");
    expect(html).toContain("Append unrelated field"); expect(html).toContain("Replace selected field"); expect(html).not.toContain("GenericAgentComponent");
  });
  it("supplies valid complete typed consumer snippets with identity-guarded navigation and no automatic execution", () => {
    for (const slug of Object.keys(formWorkflowExamples) as Array<keyof typeof formWorkflowExamples>) {
      expect(schemaBySlug[slug].safeParse(formWorkflowExamples[slug]).success).toBe(true);
      const source = formWorkflowExampleCode(slug)!;
      expect(source).toContain("export function Example()"); expect(source).toContain("useState<"); expect(source).toContain("setLast(action)");
      expect(source).not.toContain("candidateData"); expect(source).not.toContain("callTool"); expect(source).not.toContain("requestAuth");
      if (slug === "multi-step-form" || slug === "form-progress-card" || slug === "validated-field-list") expect(source).toContain("current.id === value.id");
      if (slug === "multi-step-form") expect(source).toContain("current.currentStepId === value.fromStepId");
    }
    expect(formWorkflowExampleCode("approval-card")).toBeUndefined();
    const multi = formWorkflowExamples["multi-step-form"], progress = formWorkflowExamples["form-progress-card"], fields = formWorkflowExamples["validated-field-list"];
    expect(formWorkflowSelection("multi-step-form", multi, { type: "change-form-step", data: { id: multi.id, fromStepId: "details", stepId: "review" } })).toEqual({ currentStepId: "review" });
    expect(formWorkflowSelection("multi-step-form", multi, { type: "change-form-step", data: { id: multi.id, fromStepId: "review", stepId: "details" } })).toBeUndefined();
    expect(formWorkflowSelection("form-progress-card", progress, { type: "select-form-progress-step", data: { id: progress.id, stepId: "submit" } })).toEqual({ selectedStepId: "submit" });
    expect(formWorkflowSelection("validated-field-list", fields, { type: "select-validated-field", data: { id: fields.id, fieldId: "payload" } })).toEqual({ selectedFieldId: "payload" });
    expect(formWorkflowSelection("validated-field-list", fields, { type: "select-validated-field", data: { id: "foreign", fieldId: "payload" } })).toBeUndefined();
    expect(formWorkflowSelection("validated-field-list", fields, { type: "validate-field", data: { id: fields.id, fieldId: "subject" } })).toBeUndefined();
  });
});

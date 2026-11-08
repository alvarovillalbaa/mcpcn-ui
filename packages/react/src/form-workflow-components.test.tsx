// Authored SSR contracts. Local editing, focus and async settlement are exercised by the new browser packet.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "./component-types.js";
import type { MissingDataRequestData, MultiStepFormData, InlineEditFormData, FormProgressCardData, ValidatedFieldListData } from "@mcpcn/schemas";
import { MissingDataRequest, MultiStepForm, InlineEditForm, FormProgressCard, ValidatedFieldList, formWorkflowSubmissionFits } from "./form-workflow-components.js";
import * as publicComponents from "./index.js";

const missing: MissingDataRequestData = { id: "missing-1", title: "Provide missing authored fields", fields: [
  { id: "subject", label: "Subject", type: "text", required: true, minLength: 3 },
  { id: "count", label: "Count", type: "number", required: true, min: 0, max: 10 },
  { id: "reviewed", label: "Reviewed", type: "boolean", required: true },
  { id: "details", label: "Details", type: "json" },
], knownFields: [{ id: "known", label: "Known authored context", value: { count: 0, reviewed: false, next: null, note: "" } }] };
const multi: MultiStepFormData = { id: "multi-1", title: "Complete authored steps", currentStepId: "details", steps: [
  { id: "details", title: "Details", description: "Review authored details.", fields: [{ id: "subject", label: "Subject", type: "text", required: true, value: "Authored subject" },
    { id: "delivery", label: "Delivery", type: "select", value: "standard", options: [{ value: "standard", label: "Standard" }, { value: "disabled", label: "Unavailable", disabled: true }] }] },
  { id: "review", title: "Review", fields: [{ id: "notes", label: "Notes", type: "textarea", value: "Authored\nnotes" }, { id: "confirmed", label: "Confirmed", type: "boolean", required: true, value: false }, { id: "config", label: "Configuration", type: "json", required: true, value: null }] },
] };
const inline: InlineEditFormData = { id: "inline-1", title: "Edit authored values", fields: [
  { id: "subject", label: "Subject", type: "text", required: true, value: "Authored subject" }, { id: "count", label: "Count", type: "number", required: true, value: 0 },
  { id: "reviewed", label: "Reviewed", type: "boolean", required: true, value: false }, { id: "payload", label: "Payload", type: "json", required: true, value: { rows: [0, false, null, ""], next: null } },
  { id: "notes", label: "Notes", type: "textarea", value: "Authored\nnotes" },
] };
const progress: FormProgressCardData = { id: "progress-1", title: "Review reported form progress", status: "in-progress", progress: { completed: 2, total: 3 }, steps: [
  { id: "collect", label: "Collect", status: "complete", progress: { completed: 2, total: 2 } }, { id: "review", label: "Review", status: "in-progress", progress: { completed: 0, total: 1 } },
  { id: "submit", label: "Submit", status: "not-started" },
], selectedStepId: "review" };
const validated: ValidatedFieldListData = { id: "validated-1", title: "Review reported validation", fields: [
  { id: "subject", label: "Subject", status: "invalid", message: "Needs authored review.", value: "Authored subject", validatable: true },
  { id: "count", label: "Count", status: "valid", value: 0 }, { id: "reviewed", label: "Reviewed", status: "valid", value: false },
  { id: "payload", label: "Payload", status: "valid", value: null }, { id: "pending", label: "Pending detail", status: "pending" },
], selectedFieldId: "subject" };
type ActionProps = Pick<ComponentProps<unknown>, "onAction" | "busy" | "error" | "className">;
const callback = () => undefined;
function surfaces(props: ActionProps = {}, disabled = false) {
  return [<MissingDataRequest {...missing} {...props} disabled={disabled} />, <MultiStepForm {...multi} {...props} disabled={disabled} />,
    <InlineEditForm {...inline} {...props} disabled={disabled} />, <FormProgressCard {...progress} {...props} disabled={disabled} />,
    <ValidatedFieldList {...validated} {...props} disabled={disabled} />].map(node => renderToStaticMarkup(node));
}
function button(html: string, label: string) {
  const match = [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/g)].find(value => value[2] === label);
  expect(match, `Expected ${label}`).toBeDefined(); return match![1]!;
}
function disabledControls(html: string) {
  const controls = [...html.matchAll(/<(?:input|textarea|select|button)\b([^>]*)>/g)]; expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) expect(control[1]).toContain('disabled=""');
}

describe("dedicated form workflow components", () => {
  it("bounds the whole reviewed intent envelope as UTF8 even when its individual supplied values fit", () => {
    const values: Record<string, string> = Object.fromEntries(Array.from({ length: 26 }, (_, index) => [`field-${index}`, "x".repeat(10000)]));
    values.last = "x".repeat(262144 - Buffer.byteLength(JSON.stringify({ ...values, last: "" })));
    expect(Object.values(values).every(value => value.length <= 10000)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(values))).toBe(262144);
    expect(formWorkflowSubmissionFits(JSON.stringify({ type: "commit-inline-edit", data: { id: "authored", changes: Object.entries(values).map(([fieldId, value]) => ({ fieldId, op: "set", value })) } }))).toBe(false);
    const base = { type: "submit-missing-data", data: { id: "authored", values: { text: "" } } }, room = 262144 - Buffer.byteLength(JSON.stringify(base));
    base.data.values.text = "雪".repeat(Math.floor(room / 3)) + "x".repeat(room % 3);
    expect(Buffer.byteLength(JSON.stringify(base))).toBe(262144); expect(formWorkflowSubmissionFits(JSON.stringify(base))).toBe(true);
    base.data.values.text += "x"; expect(formWorkflowSubmissionFits(JSON.stringify(base))).toBe(false);
  });
  it("exports all five dedicated APIs without replacing other form components", () => {
    expect(publicComponents.MissingDataRequest).toBe(MissingDataRequest); expect(publicComponents.MultiStepForm).toBe(MultiStepForm);
    expect(publicComponents.InlineEditForm).toBe(InlineEditForm); expect(publicComponents.FormProgressCard).toBe(FormProgressCard);
    expect(publicComponents.ValidatedFieldList).toBe(ValidatedFieldList); expect(publicComponents.RecordInspector).toBe(publicComponents.GenericAgentComponent);
    for (const value of [MissingDataRequest, MultiStepForm, InlineEditForm, FormProgressCard, ValidatedFieldList]) expect(value).not.toBe(publicComponents.GenericAgentComponent);
    expect(publicComponents.SchemaForm).toBeTypeOf("function"); expect(publicComponents.DynamicQuestionFlow).toBeTypeOf("function");
  });
  it("renders three native forms and two reported-state regions", () => {
    const html = surfaces({ onAction: callback });
    for (const value of html.slice(0, 3)) { expect(value).toMatch(/<form\b[^>]*novalidate=""[^>]*aria-label=/i); expect(value).not.toContain('role="region"'); }
    for (const value of html.slice(3)) { expect(value).toContain('role="region"'); expect(value).not.toContain("<form"); }
  });
  it("accepts only the four UI props outside strict data parsing", () => {
    for (const html of surfaces({ onAction: callback, busy: false, error: "Authored consumer error", className: "authored-class" })) {
      expect(html).toContain("authored-class"); expect(html).toContain("Authored consumer error"); expect(html).not.toContain("is invalid");
    }
    const html = renderToStaticMarkup(<MissingDataRequest {...({ ...missing, legacy: true } as MissingDataRequestData)} onAction={callback} />);
    expect(html).toContain("Missing-data request is invalid"); expect(html).not.toContain("<form");
  });
  it("blocks consumer controls without a callback and during disabled or busy states", () => {
    for (const html of surfaces()) disabledControls(html);
    for (const html of surfaces({ onAction: callback }, true)) disabledControls(html);
    for (const html of surfaces({ onAction: callback, busy: true })) { disabledControls(html); expect(html).toContain('aria-busy="true"'); expect(html).toContain("Working…"); }
  });
  it("escapes consumer errors and does not invoke callbacks during rendering", () => {
    const onAction = vi.fn();
    for (const html of surfaces({ onAction, error: "<script>authored()</script>" })) { expect(html).toContain("&lt;script&gt;authored()&lt;/script&gt;"); expect(html).not.toContain("<script>"); }
    expect(onAction).not.toHaveBeenCalled();
  });
  it("refuses unsupported root fields visibly in every dedicated component", () => {
    const html = [<MissingDataRequest {...({ ...missing, unsupported: true } as MissingDataRequestData)} />, <MultiStepForm {...({ ...multi, unsupported: true } as MultiStepFormData)} />,
      <InlineEditForm {...({ ...inline, unsupported: true } as InlineEditFormData)} />, <FormProgressCard {...({ ...progress, unsupported: true } as FormProgressCardData)} />,
      <ValidatedFieldList {...({ ...validated, unsupported: true } as ValidatedFieldListData)} />].map(node => renderToStaticMarkup(node));
    for (const value of html) { expect(value).toContain('role="alert"'); expect(value).toContain("is invalid"); expect(value).not.toContain("<button"); }
  });
  it("asks only requested missing fields while disclosing complete read-only known context", () => {
    const html = renderToStaticMarkup(<MissingDataRequest {...missing} onAction={callback} />);
    expect(html).toContain('<section aria-label="Known context">'); expect(html).toContain("Known authored context"); expect(html).toContain("&quot;reviewed&quot;: false"); expect(html).toContain("&quot;next&quot;: null");
    expect(html).toContain('aria-label="Subject"'); expect(html).not.toContain('aria-label="Known authored context"'); expect(html).toContain("Known context stays read-only.");
  });
  it("uses finite-number controls and three-state boolean selection for requested values", () => {
    const html = renderToStaticMarkup(<MissingDataRequest {...missing} onAction={callback} />);
    expect(html).toMatch(/<input[^>]*aria-label="Count"[^>]*type="number"[^>]*step="any"[^>]*min="0"[^>]*max="10"/);
    expect(html).toMatch(/<option value=""[^>]*>Not provided<\/option>/); expect(html).toContain('<option value="true">Yes</option>'); expect(html).toContain('<option value="false">No</option>'); expect(html).not.toContain('type="checkbox"');
  });
  it("uses a bounded multiline JSON editor with explicit absence controls", () => {
    const html = renderToStaticMarkup(<MissingDataRequest {...missing} onAction={callback} />);
    expect(html).toMatch(/<textarea[^>]*aria-label="Details"[^>]*rows="6"[^>]*maxlength="65536"/i);
    expect(html).toContain('aria-label="Clear Details"'); expect(html).toContain("null and an empty JSON string are supplied values"); expect(html).not.toContain("[object Object]");
  });
  it("renders required fields and local numeric and text constraints without inventing values", () => {
    const html = renderToStaticMarkup(<MissingDataRequest {...missing} onAction={callback} />);
    expect(html).toContain("Required"); expect(html).toContain('minLength="3"'); expect(html).toContain('value=""'); expect(html).toContain('aria-label="Clear Subject"');
    expect(button(html, "Provide information")).not.toContain("disabled"); expect(button(html, "Cancel")).not.toContain("disabled");
  });
  it("makes an empty missing request explicit and disables only submission", () => {
    const html = renderToStaticMarkup(<MissingDataRequest id="empty" title="Nothing missing" fields={[]} onAction={callback} />);
    expect(html).toContain("No information is missing."); expect(button(html, "Provide information")).toContain("disabled"); expect(button(html, "Cancel")).not.toContain("disabled");
  });
  it("refuses provided requested fields overlapping context and unsafe context before showing controls", () => {
    for (const value of [{ ...missing, fields: [{ id: "field", label: "Supplied", type: "text", value: "already supplied" }] }, { ...missing, knownFields: [{ id: "subject", label: "Conflict", value: 0 }] },
      { ...missing, knownFields: [{ id: "unsafe", label: "Unsafe", value: Infinity }] }]) {
      const html = renderToStaticMarkup(<MissingDataRequest {...value as MissingDataRequestData} />); expect(html).toContain("Missing-data request is invalid"); expect(html).not.toContain("<form");
    }
  });
  it("renders ordered native step navigation and only the controlled current fields", () => {
    const html = renderToStaticMarkup(<MultiStepForm {...multi} onAction={callback} />);
    expect(html).toContain('aria-label="Form steps"'); expect(html.indexOf("Go to step: Details")).toBeLessThan(html.indexOf("Go to step: Review"));
    expect(html).toContain('aria-current="step"'); expect(html).toContain('aria-label="Subject"'); expect(html).not.toContain('aria-label="Notes"'); expect(html).toContain("Review authored details.");
    expect(button(html, "Previous")).toContain("disabled"); expect(button(html, "Next")).not.toContain("disabled"); expect(html).not.toContain(">Submit form</button>");
  });
  it("uses final submit semantics only on the last controlled step", () => {
    const html = renderToStaticMarkup(<MultiStepForm {...multi} currentStepId="review" onAction={callback} />);
    expect(button(html, "Submit form")).not.toContain("disabled"); expect(button(html, "Previous")).not.toContain("disabled"); expect(html).not.toContain(">Next</button>");
    expect(html).toContain('aria-label="Notes"'); expect(html).toContain("Authored\nnotes"); expect(html).not.toContain('aria-label="Subject"');
  });
  it("retains required false and JSON null as supplied baseline values on the review step", () => {
    const html = renderToStaticMarkup(<MultiStepForm {...multi} currentStepId="review" onAction={callback} />);
    expect(html).toContain('<option value="false" selected="">No</option>'); expect(html).toMatch(/<textarea[^>]*aria-label="Configuration"[^>]*>null<\/textarea>/);
    expect(html).toContain('aria-label="Clear Configuration"');
  });
  it("shows explanatory empty steps with real navigation", () => {
    const html = renderToStaticMarkup(<MultiStepForm id="empty-step" title="Empty explanatory step" steps={[{ id: "explain", title: "Explanation", fields: [] }, { id: "finish", title: "Finish", fields: [] }]} currentStepId="explain" onAction={callback} />);
    expect(html).toContain("This step has no fields."); expect(button(html, "Next")).not.toContain("disabled"); expect(html).toContain("Go to step: Finish");
  });
  it("preserves supplied disabled options visibly without making them enabled", () => {
    const html = renderToStaticMarkup(<MultiStepForm {...multi} onAction={callback} />);
    expect(html).toContain('<option value="disabled" disabled="">Unavailable</option>'); expect(html).toContain('<option value="standard" selected="">Standard</option>');
  });
  it("refuses duplicate cross-step field identities stale selection and zero steps", () => {
    for (const value of [{ ...multi, currentStepId: "missing" }, { ...multi, steps: [] }, { ...multi, steps: [{ id: "one", title: "One", fields: [{ id: "same", label: "One", type: "text" }] }, { id: "two", title: "Two", fields: [{ id: "same", label: "Two", type: "text" }] }], currentStepId: "one" }]) {
      const html = renderToStaticMarkup(<MultiStepForm {...value as MultiStepFormData} />); expect(html).toContain("Multi-step form is invalid"); expect(html).not.toContain("<form");
    }
  });
  it("renders editable typed values including complete nested JSON instead of string coercion", () => {
    const html = renderToStaticMarkup(<InlineEditForm {...inline} onAction={callback} />);
    expect(html).toContain('aria-label="Count"'); expect(html).toContain('value="0"'); expect(html).toContain('<option value="false" selected="">No</option>');
    expect(html).toContain("&quot;rows&quot;:[0,false,null,&quot;&quot;]"); expect(html).toContain("&quot;next&quot;:null"); expect(html).not.toContain("[object Object]");
  });
  it("disables unchanged inline saving and labels current removal controls", () => {
    const html = renderToStaticMarkup(<InlineEditForm {...inline} onAction={callback} />);
    expect(html).toContain("No changes to save."); expect(button(html, "Save changes")).toContain("disabled"); expect(button(html, "Cancel")).not.toContain("disabled");
    expect(html).toContain('aria-label="Clear Payload"'); expect(html).toContain("explicit removals only");
  });
  it("distinguishes an absent inline value from an explicitly empty text baseline", () => {
    const html = renderToStaticMarkup(<InlineEditForm id="absence" title="Absence and empty" fields={[{ id: "absent", label: "Absent", type: "text" }, { id: "empty", label: "Empty", type: "text", value: "" }]} onAction={callback} />);
    expect(html).toMatch(/<button[^>]*aria-label="Clear Absent"[^>]*disabled=""/); expect(html).not.toMatch(/<button[^>]*aria-label="Clear Empty"[^>]*disabled=""/);
    expect(html).toContain("No changes to save.");
  });
  it("keeps locally invalid typed baselines editable for correction", () => {
    const html = renderToStaticMarkup(<InlineEditForm id="correction" title="Correct these values" fields={[{ id: "text", label: "Text", type: "text", value: "", required: true, minLength: 4 }, { id: "number", label: "Number", type: "number", value: -1, min: 0 }]} onAction={callback} />);
    expect(html).not.toContain("is invalid"); expect(html).toContain('value="-1"'); expect(html).toContain('aria-label="Text"'); expect(html).toContain("No changes to save.");
  });
  it("renders empty inline fields honestly without save availability", () => {
    const html = renderToStaticMarkup(<InlineEditForm id="empty" title="Empty edit" fields={[]} onAction={callback} />);
    expect(html).toContain("No fields were supplied."); expect(button(html, "Save changes")).toContain("disabled");
  });
  it("refuses unsafe structured values wrong typed baselines and reserved field identities", () => {
    for (const field of [{ id: "bad", label: "Bad", type: "json", value: { value: NaN } }, { id: "bad", label: "Bad", type: "boolean", value: "false" }, { id: "__proto__", label: "Bad", type: "text" }]) {
      const html = renderToStaticMarkup(<InlineEditForm {...{ id: "bad", title: "Bad values", fields: [field] } as InlineEditFormData} />); expect(html).toContain("Inline edit form is invalid"); expect(html).not.toContain("<form");
    }
  });
  it("reports progress counts and state independently with accessible native progress", () => {
    const html = renderToStaticMarkup(<FormProgressCard {...progress} progress={{ completed: 3, total: 3 }} onAction={callback} />);
    expect(html).toContain("Reported form status: <strong>in-progress</strong>"); expect(html).toContain('aria-label="Reported form progress"'); expect(html).toContain('max="3" value="3"');
    expect(html).toContain("3 of 3 reported"); expect(html).toContain("Counts do not imply completion or validation."); expect(button(html, "Inspect form progress")).not.toContain("disabled");
  });
  it("represents zero totals explicitly without inventing a one-unit total", () => {
    const html = renderToStaticMarkup(<FormProgressCard id="zero" title="Zero total" status="not-started" progress={{ completed: 0, total: 0 }} />);
    expect(html).toContain("0 of 0 reported"); expect(html).toContain('aria-valuetext="0 of 0 reported"'); expect(html).not.toContain('max="1"'); expect(html).not.toContain('value="1"');
  });
  it("keeps unknown counts and an empty reported step list explicit", () => {
    const html = renderToStaticMarkup(<FormProgressCard id="unknown" title="Unknown progress" status="blocked" onAction={callback} />);
    expect(html).toContain("No progress counts were supplied."); expect(html).toContain("No form steps were supplied."); expect(html).not.toContain("<progress"); expect(html).not.toContain("Selected form progress step");
  });
  it("renders supplied progress step order and only the current selected inspection", () => {
    const html = renderToStaticMarkup(<FormProgressCard {...progress} onAction={callback} />);
    expect(html.indexOf("Select form step: Collect")).toBeLessThan(html.indexOf("Select form step: Review")); expect(html.indexOf("Select form step: Review")).toBeLessThan(html.indexOf("Select form step: Submit"));
    expect(html).toContain('<section aria-label="Selected form progress step"'); expect(html).toContain('aria-label="Selected step progress"'); expect(button(html, "Inspect progress step")).not.toContain("disabled");
  });
  it("refuses impossible counts duplicate progress steps and stale controlled selections", () => {
    for (const value of [{ ...progress, progress: { completed: 4, total: 3 } }, { ...progress, selectedStepId: "stale" }, { ...progress, steps: [progress.steps![0]!, progress.steps![0]!] }]) {
      const html = renderToStaticMarkup(<FormProgressCard {...value as FormProgressCardData} />); expect(html).toContain("Form progress data is invalid"); expect(html).not.toContain("<button");
    }
  });
  it("shows all reported field statuses messages and selected identity-only actions", () => {
    const html = renderToStaticMarkup(<ValidatedFieldList {...validated} onAction={callback} />);
    for (const text of ["Needs authored review.", "invalid", "valid", "pending", "No value was supplied.", 'aria-label="Selected validated field"']) expect(html).toContain(text);
    expect(button(html, "Inspect field")).not.toContain("disabled"); expect(button(html, "Validate field")).not.toContain("disabled"); expect(html).toContain("field identity only"); expect(html).not.toContain("<textarea");
  });
  it("discloses supplied zero false null and empty values completely without inventing absence", () => {
    for (const value of [0, false, null, "", { rows: [0, false, null, ""] }]) {
      const html = renderToStaticMarkup(<ValidatedFieldList id="falsy" title="Supplied validation value" fields={[{ id: "value", label: "Value", status: "valid", value }]} selectedFieldId="value" />);
      expect(html).toContain("<summary>Field value</summary>"); expect(html).not.toContain("No value was supplied."); expect(html).not.toContain("[object Object]"); expect(html).not.toContain("is invalid");
    }
  });
  it("offers validation only for currently eligible supplied unvalidated or invalid fields", () => {
    for (const field of [{ id: "value", label: "Value", status: "unvalidated" as const, value: false, validatable: true }, { id: "value", label: "Value", status: "invalid" as const, value: null, message: "Authored failure", validatable: true }]) {
      const html = renderToStaticMarkup(<ValidatedFieldList id="eligible" title="Eligible review" fields={[field]} selectedFieldId="value" onAction={callback} />); expect(button(html, "Validate field")).not.toContain("disabled");
    }
    for (const field of [{ id: "value", label: "Value", status: "valid" as const, value: 0 }, { id: "value", label: "Value", status: "pending" as const }, { id: "value", label: "Value", status: "unvalidated" as const, value: null }]) {
      const html = renderToStaticMarkup(<ValidatedFieldList id="ineligible" title="Reported review" fields={[field]} selectedFieldId="value" onAction={callback} />); expect(html).not.toContain(">Validate field</button>");
    }
  });
  it("keeps an empty validation list and absent controlled selection explicit", () => {
    const empty = renderToStaticMarkup(<ValidatedFieldList id="empty" title="Empty review" fields={[]} />);
    expect(empty).toContain("No validation fields were supplied."); expect(empty).not.toContain("Selected validated field");
    const unselected = renderToStaticMarkup(<ValidatedFieldList {...validated} selectedFieldId={undefined} onAction={callback} />); expect(unselected).toContain("Select a field to inspect its reported validation."); expect(unselected).not.toContain(">Inspect field</button>");
  });
  it("refuses unsupported validation claims and stale or duplicate current field identities", () => {
    for (const value of [{ ...validated, selectedFieldId: "stale" }, { ...validated, fields: [validated.fields[0]!, validated.fields[0]!] },
      { ...validated, fields: [{ id: "bad", label: "Bad", status: "valid" }] }, { ...validated, fields: [{ id: "bad", label: "Bad", status: "pending", value: 0, validatable: true }] }]) {
      const html = renderToStaticMarkup(<ValidatedFieldList {...value as ValidatedFieldListData} />); expect(html).toContain("Validated field data is invalid"); expect(html).not.toContain("<button");
    }
  });
  it("escapes field labels descriptions messages and JSON strings without executable markup", () => {
    const html = renderToStaticMarkup(<ValidatedFieldList id="escape" title="Escape review" fields={[{ id: "value", label: "<img onerror=authored()>", status: "invalid", value: { html: "<script>authored()</script>" }, message: "<b>Authored issue</b>", validatable: true }]} selectedFieldId="value" />);
    expect(html).toContain("&lt;img onerror=authored()&gt;"); expect(html).toContain("&lt;script&gt;authored()&lt;/script&gt;"); expect(html).toContain("&lt;b&gt;Authored issue&lt;/b&gt;"); expect(html).not.toContain("<img"); expect(html).not.toContain("<script>");
  });
});

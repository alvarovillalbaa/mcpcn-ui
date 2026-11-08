"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  MissingDataRequestSchema, MultiStepFormSchema, InlineEditFormSchema, FormProgressCardSchema, ValidatedFieldListSchema,
  createWorkflowFormDraft, parseWorkflowFormDraft, validateWorkflowFormDrafts, workflowFormFieldKey,
  type WorkflowFormField, type WorkflowFormDraft,
  type MissingDataRequestData, type MultiStepFormData, type InlineEditFormData, type FormProgressCardData, type ValidatedFieldListData,
  type ParsedMissingDataRequestData, type ParsedMultiStepFormData, type ParsedInlineEditFormData, type ParsedFormProgressCardData, type ParsedValidatedFieldListData,
} from "@mcpcn/schemas";
import { Badge, Button, Card, Input, InvalidPayload, Select, Textarea } from "./primitives.js";
import { Feedback, revisionKey, useComponentAction } from "./component-helpers.js";
import type { ComponentAction, ComponentProps } from "./component-types.js";

type ActionProps = Pick<ComponentProps<unknown>, "onAction" | "busy" | "error" | "className">;
type ViewProps<T> = ActionProps & { data: T };
type FieldError = { fieldId: string; message: string };
type Entry = { key: string; draft: WorkflowFormDraft; badInput: boolean };
type Term = { id: string; key: string };
type DraftState = { entries: Record<string, Entry>; terms: Term[]; scope: string; fence: number };
function payloadOf<T extends object>({ onAction: _action, busy: _busy, error: _error, className: _className, ...payload }: ComponentProps<T>) { return payload; }
function Header({ title, description, status }: { title: string; description?: string; status?: string }) {
  return <header className="mcpcn-header"><div className="mcpcn-row mcpcn-between"><h3 className="mcpcn-title">{title}</h3>{status && <Badge>{status}</Badge>}</div>
    {description && <p className="mcpcn-description">{description}</p>}</header>;
}
function JSONDetails({ label, value }: { label: string; value: unknown }) {
  return <details><summary>{label}</summary><pre className="mcpcn-code">{JSON.stringify(value, null, 2)}</pre></details>;
}
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => sameValue(value, b[index]));
  const left = Object.keys(a), right = Object.keys(b);
  return left.length === right.length && left.every(key => Object.hasOwn(b, key) && sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** Rebase only changed fields; appending data must not release an accepted action. */
function useDraftModel(fields: WorkflowFormField[], scope: string, extraTerms: Term[] = [], owners: Record<string, string> = {}) {
  const definitions = fields.map(field => ({ field, key: workflowFormFieldKey(field) }));
  const terms = [...extraTerms, ...definitions.map(({ field, key }) => ({ id: `field:${field.id}`, key: revisionKey({ definition: key, owner: owners[field.id] }) }))];
  const initial = (): DraftState => ({ scope, terms, fence: 0, entries: Object.fromEntries(definitions.map(({ field, key }) => [field.id, { key, draft: createWorkflowFormDraft(field), badInput: false }])) });
  const [stored, setStored] = useState<DraftState>(initial);
  let state = stored;
  const changed = stored.scope !== scope || revisionKey(stored.terms) !== revisionKey(terms);
  if (changed) {
    const current = new Map(terms.map(term => [term.id, term.key]));
    const oldIDs = new Set(stored.terms.map(term => term.id));
    const oldOrder = stored.terms.map(term => term.id), retainedOrder = terms.filter(term => oldIDs.has(term.id)).map(term => term.id);
    const replaced = stored.scope !== scope || stored.terms.some(term => current.get(term.id) !== term.key) || revisionKey(oldOrder) !== revisionKey(retainedOrder);
    state = { scope, terms, fence: stored.fence + (replaced ? 1 : 0), entries: Object.fromEntries(definitions.map(({ field, key }) =>
      [field.id, stored.entries[field.id]?.key === key ? stored.entries[field.id] : { key, draft: createWorkflowFormDraft(field), badInput: false }])) };
    // React rerenders this owner before committing its children; unaffected drafts survive the action boundary reset.
    setStored(state);
  }
  const drafts = Object.fromEntries(fields.map(field => [field.id, state.entries[field.id]!.draft]));
  const change = (field: WorkflowFormField, draft: WorkflowFormDraft, badInput = false) => {
    const key = workflowFormFieldKey(field);
    setStored(current => current.entries[field.id]?.key === key ? { ...current, entries: { ...current.entries, [field.id]: { key, draft, badInput } } } : current);
  };
  const reset = () => setStored(current => ({ ...current, entries: Object.fromEntries(definitions.map(({ field, key }) => [field.id, { key, draft: createWorkflowFormDraft(field), badInput: false }])) }));
  const validate = (selected = fields) => {
    const result = validateWorkflowFormDrafts(selected, drafts);
    const bad = selected.filter(field => state.entries[field.id]?.badInput);
    if (bad.length) result.errors = [...result.errors.filter(error => !bad.some(field => field.id === error.fieldId)), ...bad.map(field => ({ fieldId: field.id, message: "Enter a finite number." }))];
    return result;
  };
  const isChanged = (field: WorkflowFormField) => {
    const entry = state.entries[field.id]!, baseline = createWorkflowFormDraft(field);
    if (entry.badInput) return true;
    if (entry.draft.supplied === baseline.supplied && entry.draft.input === baseline.input) return false;
    const result = parseWorkflowFormDraft(field, entry.draft);
    if (!result.success) return true;
    const supplied = Object.hasOwn(field, "value");
    return result.supplied !== supplied || (result.supplied && !sameValue(result.value, field.value));
  };
  return { drafts, change, reset, validate, isChanged, fence: state.fence };
}
type DraftModel = ReturnType<typeof useDraftModel>;

function Fields({ fields, model, disabled, errors, prefix }: { fields: WorkflowFormField[]; model: DraftModel; disabled: boolean; errors: FieldError[]; prefix: string }) {
  return <>{fields.map(field => {
    const draft = model.drafts[field.id]!, error = errors.find(value => value.fieldId === field.id), controlID = `${prefix}-${field.id}`, hintID = `${controlID}-hint`, errorID = `${controlID}-error`;
    const attributes = { id: controlID, "aria-label": field.label, "aria-invalid": !!error, "aria-describedby": [field.description ? hintID : "", error ? errorID : ""].filter(Boolean).join(" ") || undefined,
      required: field.required, disabled };
    const edit = (input: string, supplied = true, badInput = false) => { if (!disabled) model.change(field, { input, supplied }, badInput); };
    return <div key={field.id} className="mcpcn-stack" style={{ gap: 6 }}>
      <label className="mcpcn-label" htmlFor={controlID}>{field.label}{field.required && <span className="mcpcn-hint"> Required</span>}</label>
      {field.type === "textarea" || field.type === "json" ? <Textarea {...attributes} rows={field.type === "json" ? 6 : 3}
        maxLength={field.type === "json" ? 65536 : Math.min(field.maxLength ?? 10000, 10000)} value={draft.input}
        onChange={event => edit(event.currentTarget.value)} />
        : field.type === "boolean" ? <Select {...attributes} value={draft.supplied ? draft.input : ""} onChange={event => edit(event.currentTarget.value, event.currentTarget.value !== "")}>
          <option value="">Not provided</option><option value="true">Yes</option><option value="false">No</option></Select>
          : field.type === "select" ? <Select {...attributes} value={draft.supplied ? draft.input : ""} onChange={event => edit(event.currentTarget.value, event.currentTarget.value !== "")}>
            <option value="">Not provided</option>{field.options?.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</Select>
            : <Input {...attributes} type={field.type === "number" ? "number" : "text"} step={field.type === "number" ? "any" : undefined}
              min={field.type === "number" ? field.min : undefined} max={field.type === "number" ? field.max : undefined}
              minLength={field.type === "text" ? field.minLength : undefined} maxLength={field.type === "text" ? Math.min(field.maxLength ?? 10000, 10000) : undefined}
              value={draft.input} onChange={event => edit(event.currentTarget.value, true, field.type === "number" && event.currentTarget.validity.badInput)} />}
      {field.description && <p id={hintID} className="mcpcn-hint">{field.description}</p>}
      {field.type === "json" && <p className="mcpcn-hint">Enter JSON. Clear removes the value; null and an empty JSON string are supplied values.</p>}
      {error && <p id={errorID} className="mcpcn-error">{field.label}: {error.message}</p>}
      <div><Button type="button" data-variant="secondary" aria-label={`Clear ${field.label}`} disabled={disabled || !draft.supplied}
        onClick={() => edit("", false)}>Clear</Button><span className="mcpcn-hint" style={{ marginLeft: 8 }}>{draft.supplied ? "Value supplied" : "Not provided"}</span></div>
    </div>;
  })}</>;
}
function useValidationErrors() {
  const [errors, setErrors] = useState<FieldError[]>([]), [request, setRequest] = useState(0), summary = useRef<HTMLDivElement>(null);
  useEffect(() => { if (request > 0) summary.current?.focus(); }, [request]);
  const show = (values: FieldError[]) => { setErrors(values); if (values.length) setRequest(value => value + 1); };
  return { errors, show, summary };
}
function ErrorSummary({ validation, fields, onField }: { validation: ReturnType<typeof useValidationErrors>; fields: WorkflowFormField[]; onField?: (id: string) => void }) {
  if (!validation.errors.length) return null;
  return <div ref={validation.summary} className="mcpcn-error" role="alert" aria-label="Form validation errors" tabIndex={-1}><strong>Review these fields before continuing.</strong>
    <ul>{validation.errors.map(error => <li key={error.fieldId}>{onField && error.fieldId ? <Button type="button" data-variant="secondary" onClick={() => onField(error.fieldId)}>
      {fields.find(field => field.id === error.fieldId)?.label ?? "Form"}: {error.message}</Button>
      : <span>{fields.find(field => field.id === error.fieldId)?.label ?? "Form"}: {error.message}</span>}</li>)}</ul></div>;
}
/** Byte accounting is separate from the already validated reviewed-value construction. */
export function formWorkflowSubmissionFits(serializedAction: string): boolean {
  return new TextEncoder().encode(serializedAction).byteLength <= 262144;
}
function submitWithinBudget(action: ComponentAction, show: (errors: FieldError[]) => void): boolean {
  if (formWorkflowSubmissionFits(JSON.stringify(action))) return true;
  show([{ fieldId: "", message: "The reviewed submission is larger than 256 KiB. Reduce the supplied values." }]); return false;
}

export function MissingDataRequest(props: ComponentProps<MissingDataRequestData>) {
  const parsed = MissingDataRequestSchema.safeParse(payloadOf(props));
  if (!parsed.success) return <InvalidPayload title="Missing-data request is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <MissingModel key={parsed.data.id} data={parsed.data} onAction={props.onAction} busy={props.busy} error={props.error} className={props.className} />;
}
function MissingModel({ data, ...props }: ViewProps<ParsedMissingDataRequestData>) {
  const { fields: _fields, knownFields: _known, ...scope } = data, model = useDraftModel(data.fields, revisionKey(scope));
  return <MissingView key={model.fence} data={data} model={model} {...props} />;
}
function MissingView({ data, model, ...props }: ViewProps<ParsedMissingDataRequestData> & { model: DraftModel }) {
  const prefix = useId(), action = useComponentAction(props.onAction, props.busy), validation = useValidationErrors(), blocked = data.disabled || action.busy || !props.onAction;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (blocked || !data.fields.length) return;
    const result = model.validate(); validation.show(result.errors); if (result.errors.length) return;
    const intent = { type: "submit-missing-data", data: { id: data.id, values: result.values } };
    if (submitWithinBudget(intent, validation.show)) action.send(intent);
  };
  return <Card className={props.className} style={{ overflowWrap: "anywhere" }}><form noValidate aria-label={data.title} aria-busy={action.busy} onSubmit={submit}>
    <Header {...data} /><div className="mcpcn-body mcpcn-stack">
      {!!data.knownFields.length && <section aria-label="Known context"><h4>Known context</h4>{data.knownFields.map(field => <JSONDetails key={field.id} label={field.label} value={field.value} />)}</section>}
      <ErrorSummary validation={validation} fields={data.fields} onField={id => document.getElementById(`${prefix}-${id}`)?.focus()} />
      <fieldset disabled={blocked} className="mcpcn-stack" style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}><legend>Missing information</legend>
        {!data.fields.length ? <p role="status">No information is missing.</p> : <Fields fields={data.fields} model={model} disabled={blocked} errors={validation.errors} prefix={prefix} />}</fieldset>
      <Feedback busy={action.busy} error={props.error ?? action.error} /><p className="mcpcn-hint">Only reviewed requested values are submitted. Known context stays read-only.</p>
    </div><footer className="mcpcn-footer mcpcn-row"><Button type="submit" disabled={blocked || !data.fields.length}>{data.submitLabel}</Button>
      <Button type="button" data-variant="secondary" disabled={blocked} onClick={() => { if (!blocked) action.send({ type: "cancel-missing-data", data: { id: data.id } }); }}>{data.cancelLabel}</Button></footer>
  </form></Card>;
}

export function MultiStepForm(props: ComponentProps<MultiStepFormData>) {
  const parsed = MultiStepFormSchema.safeParse(payloadOf(props));
  if (!parsed.success) return <InvalidPayload title="Multi-step form is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <MultiModel key={parsed.data.id} data={parsed.data} onAction={props.onAction} busy={props.busy} error={props.error} className={props.className} />;
}
function MultiModel({ data, ...props }: ViewProps<ParsedMultiStepFormData>) {
  const { steps: _steps, currentStepId: _current, ...scope } = data;
  const fields = data.steps.flatMap(step => step.fields), owners = Object.fromEntries(data.steps.flatMap(step => step.fields.map(field => [field.id, step.id])));
  const terms = data.steps.map(({ fields: _fields, ...step }) => ({ id: `step:${step.id}`, key: revisionKey(step) }));
  const model = useDraftModel(fields, revisionKey(scope), terms, owners);
  return <MultiView key={model.fence} data={data} fields={fields} model={model} {...props} />;
}
function MultiView({ data, fields, model, ...props }: ViewProps<ParsedMultiStepFormData> & { fields: WorkflowFormField[]; model: DraftModel }) {
  const prefix = useId(), heading = useRef<HTMLHeadingElement>(null), previous = useRef(data.currentStepId);
  const action = useComponentAction(props.onAction, props.busy), validation = useValidationErrors(), blocked = data.disabled || action.busy || !props.onAction;
  const index = data.steps.findIndex(step => step.id === data.currentStepId), step = data.steps[index]!;
  useEffect(() => { if (previous.current !== data.currentStepId) { previous.current = data.currentStepId; heading.current?.focus(); } }, [data.currentStepId]);
  const navigate = (target: number) => {
    if (blocked || target < 0 || target >= data.steps.length || target === index) return;
    if (target > index) {
      const result = model.validate(data.steps.slice(0, target).flatMap(value => value.fields)); validation.show(result.errors); if (result.errors.length) return;
    }
    action.send({ type: "change-form-step", data: { id: data.id, fromStepId: step.id, stepId: data.steps[target]!.id } });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (blocked) return;
    if (index < data.steps.length - 1) { navigate(index + 1); return; }
    const result = model.validate(); validation.show(result.errors); if (result.errors.length) return;
    const intent = { type: "submit-multi-step-form", data: { id: data.id, values: result.values } };
    if (submitWithinBudget(intent, validation.show)) action.send(intent);
  };
  return <Card className={props.className} style={{ overflowWrap: "anywhere" }}><form noValidate aria-label={data.title} aria-busy={action.busy} onSubmit={submit}>
    <Header {...data} /><div className="mcpcn-body mcpcn-stack"><nav aria-label="Form steps"><ol className="mcpcn-stack" style={{ paddingLeft: 20 }}>{data.steps.map((item, target) => <li key={item.id}>
      <Button type="button" aria-label={`Go to step: ${item.title}`} aria-current={target === index ? "step" : undefined} disabled={blocked || target === index} data-variant={target === index ? undefined : "secondary"}
        onClick={() => navigate(target)}>{target + 1}. {item.title}</Button></li>)}</ol></nav>
      <ErrorSummary validation={validation} fields={fields} onField={id => { const target = data.steps.findIndex(value => value.fields.some(field => field.id === id)); if (target === index) document.getElementById(`${prefix}-${id}`)?.focus(); else navigate(target); }} />
      <section aria-label="Current form step"><h4 ref={heading} tabIndex={-1}>{step.title}</h4>{step.description && <p className="mcpcn-description">{step.description}</p>}
        <fieldset disabled={blocked} className="mcpcn-stack" style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}><legend>{step.title} fields</legend>
          {!step.fields.length ? <p role="status">This step has no fields.</p> : <Fields fields={step.fields} model={model} disabled={blocked} errors={validation.errors} prefix={prefix} />}</fieldset></section>
      <Feedback busy={action.busy} error={props.error ?? action.error} /><p className="mcpcn-hint">Navigation is controlled by the consumer. Values are sent only after final review.</p>
    </div><footer className="mcpcn-footer mcpcn-row"><Button type="button" data-variant="secondary" disabled={blocked || index === 0} onClick={() => navigate(index - 1)}>{data.previousLabel}</Button>
      <Button type="submit" disabled={blocked}>{index === data.steps.length - 1 ? data.submitLabel : data.nextLabel}</Button>
      <Button type="button" data-variant="secondary" disabled={blocked} onClick={() => { if (!blocked) action.send({ type: "cancel-multi-step-form", data: { id: data.id } }); }}>{data.cancelLabel}</Button></footer>
  </form></Card>;
}

export function InlineEditForm(props: ComponentProps<InlineEditFormData>) {
  const parsed = InlineEditFormSchema.safeParse(payloadOf(props));
  if (!parsed.success) return <InvalidPayload title="Inline edit form is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <InlineModel key={parsed.data.id} data={parsed.data} onAction={props.onAction} busy={props.busy} error={props.error} className={props.className} />;
}
function InlineModel({ data, ...props }: ViewProps<ParsedInlineEditFormData>) {
  const { fields: _fields, ...scope } = data, model = useDraftModel(data.fields, revisionKey(scope));
  return <InlineView key={model.fence} data={data} model={model} {...props} />;
}
function InlineView({ data, model, ...props }: ViewProps<ParsedInlineEditFormData> & { model: DraftModel }) {
  const prefix = useId(), action = useComponentAction(props.onAction, props.busy), validation = useValidationErrors(), blocked = data.disabled || action.busy || !props.onAction;
  const changed = data.fields.filter(model.isChanged);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (blocked || !changed.length) return;
    const result = model.validate(); validation.show(result.errors); if (result.errors.length) return;
    const changes = changed.map(field => Object.hasOwn(result.values, field.id) ? { fieldId: field.id, op: "set" as const, value: result.values[field.id] } : { fieldId: field.id, op: "clear" as const });
    const intent = { type: "commit-inline-edit", data: { id: data.id, changes } };
    if (submitWithinBudget(intent, validation.show)) action.send(intent);
  };
  return <Card className={props.className} style={{ overflowWrap: "anywhere" }}><form noValidate aria-label={data.title} aria-busy={action.busy} onSubmit={submit}>
    <Header {...data} /><div className="mcpcn-body mcpcn-stack"><ErrorSummary validation={validation} fields={data.fields} onField={id => document.getElementById(`${prefix}-${id}`)?.focus()} />
      <fieldset disabled={blocked} className="mcpcn-stack" style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}><legend>Values to edit</legend>
        {!data.fields.length ? <p role="status">No fields were supplied.</p> : <Fields fields={data.fields} model={model} disabled={blocked} errors={validation.errors} prefix={prefix} />}</fieldset>
      {!changed.length && <p role="status">No changes to save.</p>}<Feedback busy={action.busy} error={props.error ?? action.error} />
      <p className="mcpcn-hint">Save sends changed values and explicit removals only. The consumer owns persistence.</p></div>
    <footer className="mcpcn-footer mcpcn-row"><Button type="submit" disabled={blocked || !changed.length}>{data.submitLabel}</Button>
      <Button type="button" data-variant="secondary" disabled={blocked} onClick={() => { if (!blocked) { model.reset(); validation.show([]); action.send({ type: "cancel-inline-edit", data: { id: data.id } }); } }}>{data.cancelLabel}</Button></footer>
  </form></Card>;
}

function Progress({ value, label }: { value?: { completed: number; total: number }; label: string }) {
  return value ? <><progress aria-label={label} max={value.total || undefined} value={value.total ? value.completed : undefined}
    aria-valuetext={`${value.completed} of ${value.total} reported`} style={{ width: "100%", maxWidth: 360 }} /><p>{value.completed} of {value.total} reported</p></>
    : <p role="status">No progress counts were supplied.</p>;
}
export function FormProgressCard(props: ComponentProps<FormProgressCardData>) {
  const parsed = FormProgressCardSchema.safeParse(payloadOf(props));
  if (!parsed.success) return <InvalidPayload title="Form progress data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  const { steps: _steps, selectedStepId: _selected, progress: _progress, status: _status, ...terms } = parsed.data;
  return <ProgressView key={revisionKey(terms)} data={parsed.data} onAction={props.onAction} busy={props.busy} error={props.error} className={props.className} />;
}
function ProgressView({ data, ...props }: ViewProps<ParsedFormProgressCardData>) {
  const group = useId(), action = useComponentAction(props.onAction, props.busy), blocked = data.disabled || action.busy || !props.onAction;
  const selected = data.steps.find(step => step.id === data.selectedStepId);
  return <Card className={props.className} role="region" aria-label={data.title} aria-busy={action.busy} style={{ overflowWrap: "anywhere" }}><Header {...data} />
    <div className="mcpcn-body mcpcn-stack"><p>Reported form status: <strong>{data.status}</strong></p><Progress value={data.progress} label="Reported form progress" />
      {!data.steps.length ? <p role="status">No form steps were supplied.</p> : <fieldset className="mcpcn-stack" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><legend>Reported form steps</legend>
        <ol className="mcpcn-stack" style={{ paddingLeft: 20 }}>{data.steps.map(step => <li key={step.id}><label className="mcpcn-row"><input type="radio" name={group}
          aria-label={`Select form step: ${step.label}`} checked={step.id === data.selectedStepId} disabled={blocked} onChange={() => {
            if (!blocked) action.send({ type: "select-form-progress-step", data: { id: data.id, stepId: step.id } });
          }} />{step.label}<Badge>{step.status}</Badge></label><Progress value={step.progress} label={`Reported progress: ${step.label}`} /></li>)}</ol></fieldset>}
      <Feedback busy={action.busy} error={props.error ?? action.error} />
      {selected ? <ProgressDetail key={revisionKey({ id: data.id, stepId: selected.id, label: selected.label, status: selected.status, disabled: data.disabled })}
        id={data.id} step={selected} disabled={data.disabled} onAction={props.onAction} busy={action.busy} /> : !!data.steps.length && <p role="status">Select a form step to inspect its reported state.</p>}
      <p className="mcpcn-hint">Counts do not imply completion or validation. This view never advances the form.</p></div>
    <footer className="mcpcn-footer"><Button type="button" disabled={blocked} onClick={() => { if (!blocked) action.send({ type: "inspect-form-progress", data: { id: data.id } }); }}>Inspect form progress</Button></footer>
  </Card>;
}
function ProgressDetail({ id, step, disabled, ...props }: ActionProps & { id: string; step: ParsedFormProgressCardData["steps"][number]; disabled: boolean }) {
  const action = useComponentAction(props.onAction, props.busy), blocked = disabled || action.busy || !props.onAction;
  return <section aria-label="Selected form progress step" aria-busy={action.busy} className="mcpcn-stack"><h4>{step.label}</h4><p>Reported step status: <strong>{step.status}</strong></p>
    <Progress value={step.progress} label="Selected step progress" /><div><Button type="button" disabled={blocked} onClick={() => {
      if (!blocked) action.send({ type: "inspect-form-progress-step", data: { id, stepId: step.id, status: step.status } });
    }}>Inspect progress step</Button></div><Feedback busy={action.busy} error={action.error} /></section>;
}

export function ValidatedFieldList(props: ComponentProps<ValidatedFieldListData>) {
  const parsed = ValidatedFieldListSchema.safeParse(payloadOf(props));
  if (!parsed.success) return <InvalidPayload title="Validated field data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  const { fields: _fields, selectedFieldId: _selected, ...terms } = parsed.data;
  return <ValidatedView key={revisionKey(terms)} data={parsed.data} onAction={props.onAction} busy={props.busy} error={props.error} className={props.className} />;
}
function ValidatedView({ data, ...props }: ViewProps<ParsedValidatedFieldListData>) {
  const group = useId(), action = useComponentAction(props.onAction, props.busy), blocked = data.disabled || action.busy || !props.onAction;
  const selected = data.fields.find(field => field.id === data.selectedFieldId);
  return <Card className={props.className} role="region" aria-label={data.title} aria-busy={action.busy} style={{ overflowWrap: "anywhere" }}><Header {...data} />
    <div className="mcpcn-body mcpcn-stack">{!data.fields.length ? <p role="status">No validation fields were supplied.</p> : <fieldset className="mcpcn-stack" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><legend>Reported field validation</legend>
      <ol className="mcpcn-stack" style={{ paddingLeft: 20 }}>{data.fields.map(field => <li key={field.id}><label className="mcpcn-row"><input type="radio" name={group}
        aria-label={`Select field: ${field.label}`} checked={field.id === data.selectedFieldId} disabled={blocked} onChange={() => {
          if (!blocked) action.send({ type: "select-validated-field", data: { id: data.id, fieldId: field.id } });
        }} />{field.label}<Badge>{field.status}</Badge></label>{field.message && <p>{field.message}</p>}
        {!Object.hasOwn(field, "value") && <p className="mcpcn-hint">No value was supplied.</p>}</li>)}</ol></fieldset>}
      <Feedback busy={action.busy} error={props.error ?? action.error} />
      {selected ? <ValidatedDetail key={revisionKey({ id: data.id, field: selected, disabled: data.disabled })} id={data.id} field={selected} disabled={data.disabled} onAction={props.onAction} busy={action.busy} />
        : !!data.fields.length && <p role="status">Select a field to inspect its reported validation.</p>}
      <p className="mcpcn-hint">Validation is consumer-reported, not authorization. Inspection and validation requests send field identity only.</p></div>
  </Card>;
}
function ValidatedDetail({ id, field, disabled, ...props }: ActionProps & { id: string; field: ParsedValidatedFieldListData["fields"][number]; disabled: boolean }) {
  const action = useComponentAction(props.onAction, props.busy), blocked = disabled || action.busy || !props.onAction;
  const eligible = field.validatable && (field.status === "invalid" || field.status === "unvalidated") && Object.hasOwn(field, "value");
  return <section aria-label="Selected validated field" aria-busy={action.busy} className="mcpcn-stack"><h4>{field.label}</h4><p>Reported validation: <strong>{field.status}</strong></p>
    {field.message && <p role={field.status === "invalid" ? "alert" : undefined}>{field.message}</p>}
    {Object.hasOwn(field, "value") ? <JSONDetails label="Field value" value={field.value} /> : <p role="status">No value was supplied.</p>}
    <div className="mcpcn-row"><Button type="button" disabled={blocked} onClick={() => { if (!blocked) action.send({ type: "inspect-validated-field", data: { id, fieldId: field.id, status: field.status } }); }}>Inspect field</Button>
      {eligible && <Button type="button" data-variant="secondary" disabled={blocked} onClick={() => {
        if (!blocked && eligible) action.send({ type: "validate-field", data: { id, fieldId: field.id } });
      }}>Validate field</Button>}</div><Feedback busy={action.busy} error={action.error} /></section>;
}

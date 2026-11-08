"use client";

import { useEffect, useId, useState } from "react";
import {
  ApprovalChecklistSchema, BeforeSubmitConfirmationSchema, DestructiveActionGuardSchema, HumanOverridePanelSchema, PermissionRequestCardSchema,
  type ApprovalChecklistData, type BeforeSubmitConfirmationData, type DestructiveActionGuardData, type HumanOverridePanelData, type PermissionRequestCardData,
  type ParsedApprovalChecklistData, type ParsedBeforeSubmitConfirmationData, type ParsedDestructiveActionGuardData, type ParsedHumanOverridePanelData, type ParsedPermissionRequestCardData,
} from "@mcpcn/schemas";
import { Badge, Button, Card, Input, InvalidPayload, Textarea } from "./primitives.js";
import type { ComponentProps } from "./component-types.js";
import { Feedback, revisionKey, useComponentAction } from "./component-helpers.js";

type ViewProps<T> = Pick<ComponentProps<unknown>, "onAction" | "busy" | "error" | "className"> & { data: T };
// DTOs are strict; consumer callbacks and UI status are not payload fields.
function payloadOf<T extends object>({ onAction: _action, busy: _busy, error: _error, className: _className, ...payload }: ComponentProps<T>) { return payload; }
function Header({ title, description }: { title: string; description?: string }) {
  return <header className="mcpcn-header"><h3 className="mcpcn-title">{title}</h3>{description && <p className="mcpcn-description">{description}</p>}</header>;
}
function useFreshConsent(selection = "") {
  const [consent, setConsent] = useState({ selection, checked: false });
  useEffect(() => { setConsent({ selection, checked: false }); }, [selection]);
  // Refuse stale consent during render as well as clearing it after a controlled change.
  return { checked: consent.selection === selection && consent.checked,
    change: (checked: boolean) => setConsent({ selection, checked }) };
}

export function ApprovalChecklist(props: ComponentProps<ApprovalChecklistData>) {
  const parsed = ApprovalChecklistSchema.safeParse(payloadOf(props));
  if (!parsed.success) return <InvalidPayload title="Approval checklist data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  const { checkedItemIds: _checked, ...terms } = parsed.data;
  return <ChecklistView key={revisionKey(terms)} data={parsed.data} onAction={props.onAction} busy={props.busy} error={props.error} className={props.className} />;
}
function ChecklistView({ data, ...props }: ViewProps<ParsedApprovalChecklistData>) {
  const action = useComponentAction(props.onAction, props.busy), disabled = data.disabled || action.busy || !props.onAction;
  const checked = new Set(data.checkedItemIds), itemIds = data.items.filter(item => checked.has(item.id)).map(item => item.id);
  const complete = data.items.some(item => item.required) && data.items.every(item => !item.required || checked.has(item.id));
  return <Card className={props.className} aria-busy={action.busy} style={{ overflowWrap: "anywhere" }}>
    <form aria-label={data.title} onSubmit={event => { event.preventDefault();
      if (!disabled && complete && event.currentTarget.checkValidity()) action.send({ type: "approve-checklist", data: { reviewId: data.reviewId, itemIds } });
    }}><Header {...data} />
      <div className="mcpcn-body mcpcn-stack"><p className="mcpcn-hint">Every required item must be checked. Optional items may be left unchecked.</p>
        {data.items.map(item => <div key={item.id}><label className="mcpcn-row"><input type="checkbox" checked={checked.has(item.id)} required={item.required} disabled={disabled}
          onChange={event => { if (!disabled) action.send({ type: "check-item", data: { reviewId: data.reviewId, itemId: item.id, checked: event.currentTarget.checked } }); }} />
          {item.label} ({item.required ? "required" : "optional"})</label>{item.description && <p className="mcpcn-description">{item.description}</p>}</div>)}
        {!complete && <p role="status">Complete the required checks before approving.</p>}
      </div>
      <footer className="mcpcn-footer mcpcn-row"><Button type="button" data-variant="secondary" disabled={disabled} onClick={() => { if (!disabled) action.send({ type: "cancel", data: { reviewId: data.reviewId } }); }}>{data.cancelLabel}</Button>
        <Button type="submit" disabled={disabled || !complete}>{data.approveLabel}</Button></footer>
    </form><Feedback busy={action.busy} error={props.error ?? action.error} />
  </Card>;
}

export function BeforeSubmitConfirmation(props: ComponentProps<BeforeSubmitConfirmationData>) {
  const parsed = BeforeSubmitConfirmationSchema.safeParse(payloadOf(props));
  if (!parsed.success) return <InvalidPayload title="Submission review data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <SubmitView key={revisionKey(parsed.data)} data={parsed.data} onAction={props.onAction} busy={props.busy} error={props.error} className={props.className} />;
}
function SubmitView({ data, ...props }: ViewProps<ParsedBeforeSubmitConfirmationData>) {
  const consent = useFreshConsent(), action = useComponentAction(props.onAction, props.busy), disabled = data.disabled || action.busy || !props.onAction;
  return <Card className={props.className} aria-busy={action.busy} style={{ overflowWrap: "anywhere" }}>
    <form aria-label={data.title} onSubmit={event => { event.preventDefault();
      if (!disabled && consent.checked && data.fields.length > 0 && event.currentTarget.checkValidity()) action.send({ type: "confirm-submit", data: { reviewId: data.reviewId, fieldIds: data.fields.map(field => field.id) } });
    }}><Header {...data} />
      <div className="mcpcn-body mcpcn-stack"><div className="mcpcn-table-wrap"><table className="mcpcn-table"><caption>Fields to submit</caption>
        <thead><tr><th scope="col">Field</th><th scope="col">Current value</th></tr></thead><tbody>{data.fields.map(field => <tr key={field.id}><th scope="row">{field.label}</th>
          <td style={{ whiteSpace: "pre-wrap" }}>{field.value === "" ? <span className="mcpcn-hint">Empty text</span> : field.value === null ? "None" : String(field.value)}</td></tr>)}</tbody></table></div>
        <label className="mcpcn-row"><input type="checkbox" required checked={consent.checked} disabled={disabled} onChange={event => { if (!disabled) consent.change(event.currentTarget.checked); }} />{data.consentLabel}</label>
      </div>
      <footer className="mcpcn-footer mcpcn-row"><Button type="button" data-variant="secondary" disabled={disabled} onClick={() => { if (!disabled) action.send({ type: "cancel", data: { reviewId: data.reviewId } }); }}>{data.cancelLabel}</Button>
        <Button type="submit" disabled={disabled || !consent.checked}>{data.submitLabel}</Button></footer>
    </form><Feedback busy={action.busy} error={props.error ?? action.error} />
  </Card>;
}

export function DestructiveActionGuard(props: ComponentProps<DestructiveActionGuardData>) {
  const parsed = DestructiveActionGuardSchema.safeParse(payloadOf(props));
  if (!parsed.success) return <InvalidPayload title="Destructive action data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <DestructiveView key={revisionKey(parsed.data)} data={parsed.data} onAction={props.onAction} busy={props.busy} error={props.error} className={props.className} />;
}
function DestructiveView({ data, ...props }: ViewProps<ParsedDestructiveActionGuardData>) {
  const [phrase, setPhrase] = useState("");
  const id = useId(), consent = useFreshConsent(), action = useComponentAction(props.onAction, props.busy), disabled = data.disabled || action.busy || !props.onAction;
  const complete = consent.checked && phrase === data.confirmationText && data.affectedCount > 0;
  return <Card className={props.className} aria-busy={action.busy} style={{ overflowWrap: "anywhere" }}>
    <form aria-label={data.title} onSubmit={event => { event.preventDefault();
      if (!disabled && complete && event.currentTarget.checkValidity()) action.send({ type: "confirm-destructive", data: { reviewId: data.reviewId, affectedCount: data.affectedCount } });
    }}><Header {...data} />
      <div className="mcpcn-body mcpcn-stack"><Badge risk="high">Destructive action</Badge><p>Target: <strong>{data.targetLabel}</strong></p>
        <p>{data.summary}</p><p>{data.affectedCount} affected items</p><p>{data.rollback ? `Rollback: ${data.rollback}` : "Rollback information was not supplied."}</p>
        <label className="mcpcn-label" htmlFor={id}>Type <code className="mcpcn-code">{data.confirmationText}</code> exactly to confirm.
          <Input id={id} aria-label="Confirmation phrase" autoComplete="off" required maxLength={120} value={phrase} disabled={disabled} onChange={event => { if (!disabled) setPhrase(event.currentTarget.value); }} /></label>
        <label className="mcpcn-row"><input type="checkbox" required checked={consent.checked} disabled={disabled} onChange={event => { if (!disabled) consent.change(event.currentTarget.checked); }} />{data.consentLabel}</label>
      </div>
      <footer className="mcpcn-footer mcpcn-row"><Button type="button" data-variant="secondary" disabled={disabled} onClick={() => { if (!disabled) action.send({ type: "cancel", data: { reviewId: data.reviewId } }); }}>{data.cancelLabel}</Button>
        <Button type="submit" data-variant="danger" disabled={disabled || !complete}>{data.confirmLabel}</Button></footer>
    </form><Feedback busy={action.busy} error={props.error ?? action.error} />
  </Card>;
}

export function HumanOverridePanel(props: ComponentProps<HumanOverridePanelData>) {
  const parsed = HumanOverridePanelSchema.safeParse(payloadOf(props));
  if (!parsed.success) return <InvalidPayload title="Human override data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  const { selectedOptionId: _selected, ...terms } = parsed.data;
  return <OverrideView key={revisionKey(terms)} data={parsed.data} onAction={props.onAction} busy={props.busy} error={props.error} className={props.className} />;
}
function OverrideView({ data, ...props }: ViewProps<ParsedHumanOverridePanelData>) {
  const [reason, setReason] = useState("");
  const group = useId(), consent = useFreshConsent(revisionKey(data.selectedOptionId ?? null)), action = useComponentAction(props.onAction, props.busy), disabled = data.disabled || action.busy || !props.onAction;
  const selected = data.options.find(option => option.id === data.selectedOptionId), recommended = data.options.find(option => option.id === data.recommendedOptionId)!;
  const complete = Boolean(selected && selected.id !== data.recommendedOptionId && reason.trim() && reason.length <= 2000 && consent.checked);
  return <Card className={props.className} aria-busy={action.busy} style={{ overflowWrap: "anywhere" }}>
    <form aria-label={data.title} onSubmit={event => { event.preventDefault();
      if (!disabled && complete && selected && event.currentTarget.checkValidity()) action.send({ type: "override", data: { reviewId: data.reviewId, optionId: selected.id, reason: reason.trim() } });
    }}><Header {...data} />
      <div className="mcpcn-body mcpcn-stack"><p><strong>Current recommendation: {recommended.label}</strong></p><p>{data.recommendation}</p>
        <fieldset className="mcpcn-stack" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><legend>Override option</legend>
          {data.options.map(option => <div key={option.id}><label className="mcpcn-row"><input type="radio" name={group} aria-label={`Select override: ${option.label}`} checked={option.id === data.selectedOptionId} disabled={disabled}
            onChange={() => { if (!disabled) { consent.change(false); action.send({ type: "select-override-option", data: { reviewId: data.reviewId, optionId: option.id } }); } }} />
            {option.label}{option.id === data.recommendedOptionId && <Badge>Recommended</Badge>}</label>{option.description && <p className="mcpcn-description">{option.description}</p>}</div>)}
        </fieldset>
        <label className="mcpcn-label" htmlFor={`${group}-reason`}>{data.reasonLabel}<Textarea id={`${group}-reason`} required maxLength={2000} value={reason} disabled={disabled}
          onChange={event => { if (!disabled) setReason(event.currentTarget.value); }} /></label>
        <label className="mcpcn-row"><input type="checkbox" required checked={consent.checked} disabled={disabled} onChange={event => { if (!disabled) consent.change(event.currentTarget.checked); }} />{data.consentLabel}</label>
        {(!selected || selected.id === data.recommendedOptionId) && <p role="status">Select a different option to override the recommendation.</p>}
      </div>
      <footer className="mcpcn-footer mcpcn-row"><Button type="button" data-variant="secondary" disabled={disabled} onClick={() => { if (!disabled) action.send({ type: "cancel", data: { reviewId: data.reviewId } }); }}>{data.cancelLabel}</Button>
        <Button type="submit" disabled={disabled || !complete}>{data.overrideLabel}</Button></footer>
    </form><Feedback busy={action.busy} error={props.error ?? action.error} />
  </Card>;
}

export function PermissionRequestCard(props: ComponentProps<PermissionRequestCardData>) {
  const parsed = PermissionRequestCardSchema.safeParse(payloadOf(props));
  if (!parsed.success) return <InvalidPayload title="Permission request data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  const { selectedScopeIds: _selected, ...terms } = parsed.data;
  return <PermissionView key={revisionKey(terms)} data={parsed.data} onAction={props.onAction} busy={props.busy} error={props.error} className={props.className} />;
}
function PermissionView({ data, ...props }: ViewProps<ParsedPermissionRequestCardData>) {
  const selection = revisionKey([...data.selectedScopeIds].sort()), consent = useFreshConsent(selection), action = useComponentAction(props.onAction, props.busy);
  const disabled = data.disabled || action.busy || !props.onAction, selected = new Set(data.selectedScopeIds), scopeIds = data.scopes.filter(scope => selected.has(scope.id)).map(scope => scope.id);
  const complete = scopeIds.length > 0 && data.scopes.some(scope => scope.required) && data.scopes.every(scope => !scope.required || selected.has(scope.id));
  return <Card className={props.className} aria-busy={action.busy} style={{ overflowWrap: "anywhere" }}>
    <form aria-label={data.title} onSubmit={event => { event.preventDefault();
      if (!disabled && complete && consent.checked && event.currentTarget.checkValidity()) action.send({ type: "request-permission", data: { reviewId: data.reviewId, scopeIds } });
    }}><Header {...data} />
      <div className="mcpcn-body mcpcn-stack"><p>Requester: <strong>{data.requester}</strong></p><p>{data.purpose}</p>
        <p className="mcpcn-hint">Every required scope must be selected. Optional scopes may be left unselected.</p>
        {data.scopes.map(scope => <div key={scope.id}><label className="mcpcn-row"><input type="checkbox" checked={selected.has(scope.id)} required={scope.required} disabled={disabled}
          onChange={event => { if (!disabled) { consent.change(false); action.send({ type: "select-scope", data: { reviewId: data.reviewId, scopeId: scope.id, selected: event.currentTarget.checked } }); } }} />
          {scope.label} ({scope.required ? "required" : "optional"})</label>{scope.description && <p className="mcpcn-description">{scope.description}</p>}</div>)}
        <label className="mcpcn-row"><input type="checkbox" required checked={consent.checked} disabled={disabled} onChange={event => { if (!disabled) consent.change(event.currentTarget.checked); }} />{data.consentLabel}</label>
        {!complete && <p role="status">Select the required scopes before requesting permission.</p>}
        <p className="mcpcn-hint">This sends permission-request intent only. It does not grant access or change authorization.</p>
      </div>
      <footer className="mcpcn-footer mcpcn-row"><Button type="button" data-variant="secondary" disabled={disabled} onClick={() => { if (!disabled) action.send({ type: "deny-permission", data: { reviewId: data.reviewId } }); }}>{data.denyLabel}</Button>
        <Button type="submit" disabled={disabled || !complete || !consent.checked}>{data.requestLabel}</Button></footer>
    </form><Feedback busy={action.busy} error={props.error ?? action.error} />
  </Card>;
}

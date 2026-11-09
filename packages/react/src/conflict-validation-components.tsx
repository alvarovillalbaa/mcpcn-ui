"use client";

import { useEffect, useRef, useState } from "react";
import {
  ConflictResolverSchema, ValidationSummarySchema, stableReviewKey,
  type ConflictResolverData, type ParsedConflictResolverData, type ConflictResolverIntent,
  type ValidationSummaryData, type ParsedValidationSummaryData, type ValidationSummaryIntent,
  type ParsedInspectionField, type ParsedValidationIssue,
} from "@mcpcn/schemas";
import { Button, Card, InvalidPayload } from "./primitives.js";
import { Feedback } from "./component-helpers.js";
import type { ComponentAction, ComponentProps } from "./component-types.js";

type UIProps = Pick<ComponentProps<unknown>, "className" | "busy" | "error" | "onAction">;
type ReviewData = ParsedConflictResolverData | ParsedValidationSummaryData;
type ReadyReview = Extract<ReviewData, { state: "ready" }>;
type Member = ParsedInspectionField | ParsedValidationIssue;
type Intent = ConflictResolverIntent | ValidationSummaryIntent;

function ownData(props: object): unknown {
  try {
    const descriptors = Object.getOwnPropertyDescriptors(props), data: object = Object.create(Object.getPrototypeOf(props));
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = Object.getOwnPropertyDescriptor(descriptors, key)?.value as PropertyDescriptor | undefined;
      if (!descriptor) return null;
      if (typeof key === "string" && (["className", "busy", "error", "onAction"].includes(key) || key === "key" && !descriptor.enumerable)) continue;
      Object.defineProperty(data, key, descriptor);
    }
    return data;
  } catch { return null; }
}
const membersOf = (data: ReadyReview): Member[] => "conflict" in data ? data.conflict.candidates : data.report.issues;
const controlledId = (data: ReadyReview) => "conflict" in data ? data.selectedCandidateId : data.selectedIssueId;
const rootKey = (data: ReadyReview) => stableReviewKey("conflict" in data
  ? { kind: "conflict", id: data.id, revision: data.revision, conflictId: data.conflict.id, conflictRevision: data.conflict.revision }
  : { kind: "validation", id: data.id, revision: data.revision, reportId: data.report.id, reportRevision: data.report.revision });

export interface ConflictValidationSelectionState {
  root: string; localId: string | null; selectedId: string | null; memberKey?: string;
}

/** Only the selected member participates in local replacement reconciliation. */
export function reconcileConflictValidationSelection(data: ReadyReview, previous?: ConflictValidationSelectionState): ConflictValidationSelectionState {
  const root = rootKey(data), stored = previous?.root === root ? previous : undefined, members = membersOf(data);
  const old = members.find(member => member.id === stored?.selectedId);
  const changed = Boolean(stored?.selectedId && stableReviewKey(old ?? null) !== stored.memberKey);
  const localId = stored && !changed && members.some(member => member.id === stored.localId) ? stored.localId : null;
  const selectedId = controlledId(data) === undefined ? localId : controlledId(data) ?? null;
  const member = members.find(item => item.id === selectedId);
  const next = { root, localId, selectedId, memberKey: member ? stableReviewKey(member) : undefined };
  return stored && stored.localId === next.localId && stored.selectedId === next.selectedId && stored.memberKey === next.memberKey ? stored : next;
}

export function conflictValidationNotificationScope(data: ReadyReview, selectedId: string | null, requestedId: string | null, available: boolean): string {
  const members = membersOf(data);
  return stableReviewKey({ channel: "notification", root: rootKey(data), controlled: controlledId(data) !== undefined, available,
    selectedId, selected: members.find(member => member.id === selectedId) ?? null,
    requestedId, requested: members.find(member => member.id === requestedId) ?? null });
}
export function conflictValidationConfirmationScope(data: ReadyReview, selectedId: string | null, available: boolean): string {
  return stableReviewKey({ channel: "confirmation", root: rootKey(data), controlled: controlledId(data) !== undefined, available,
    selectedId, selected: membersOf(data).find(member => member.id === selectedId) ?? null });
}

export function conflictValidationIntent(data: ReadyReview, memberId: string | null, confirmation = false): Intent | undefined {
  const base = { componentId: data.id, componentRevision: data.revision };
  const member = membersOf(data).find(item => item.id === memberId);
  if (memberId !== null && !member) return undefined;
  if ("conflict" in data) {
    const scope = { ...base, conflictId: data.conflict.id, conflictRevision: data.conflict.revision };
    return member ? { type: confirmation ? "confirm-conflict-candidate" : "select-conflict-candidate", data: { ...scope, candidateId: member.id, candidateRevision: member.revision } }
      : confirmation ? undefined : { type: "clear-conflict-candidate", data: scope };
  }
  if (confirmation) return undefined;
  const scope = { ...base, reportId: data.report.id, reportRevision: data.report.revision };
  return member ? { type: "inspect-validation-issue", data: { ...scope, issueId: member.id, issueRevision: member.revision } }
    : { type: "clear-validation-issue", data: scope };
}
export function canConfirmConflictChoice(data: ReadyReview, selectedId: string | null, available: boolean, busy: boolean, pending: boolean): boolean {
  return "conflict" in data && data.conflict.candidates.some(member => member.id === selectedId) && available && !busy && !pending;
}

function useScopedFeedback(data: ReadyReview, selectedId: string | null, onAction: UIProps["onAction"], confirmation: boolean) {
  const available = Boolean(onAction);
  const current = useRef({ scope: "", requestedId: null as string | null, generation: 0, pendingKey: "", mounted: true });
  const scopeFor = (selected: string | null, requested: string | null) => confirmation
    ? conflictValidationConfirmationScope(data, selected, available) : conflictValidationNotificationScope(data, selected, requested, available);
  const scope = scopeFor(selectedId, current.current.requestedId);
  const [feedback, setFeedback] = useState<{ scope: string; generation: number; pending: boolean; error?: string }>({ scope, generation: current.current.generation, pending: false });
  if (current.current.scope !== scope) current.current = { ...current.current, scope, generation: current.current.generation + 1, pendingKey: "" };
  useEffect(() => {
    current.current.mounted = true;
    return () => { current.current.mounted = false; current.current.generation += 1; current.current.pendingKey = ""; };
  }, []);
  const supersede = (nextSelectedId: string | null) => {
    const next = scopeFor(nextSelectedId, current.current.requestedId);
    if (next !== current.current.scope) current.current = { ...current.current, scope: next, generation: current.current.generation + 1, pendingKey: "" };
  };
  const send = (intent: ComponentAction | undefined, nextSelectedId: string | null, requestedId: string | null) => {
    if (!intent || !onAction || !current.current.mounted) return;
    const target = scopeFor(nextSelectedId, requestedId), key = stableReviewKey(intent);
    if (current.current.scope === target && current.current.pendingKey === key) return;
    const generation = current.current.generation + 1;
    current.current = { ...current.current, scope: target, requestedId, generation, pendingKey: key };
    const live = () => current.current.mounted && current.current.scope === target && current.current.generation === generation;
    setFeedback({ scope: target, generation, pending: false });
    try {
      const result: unknown = onAction(intent);
      if (result && typeof (result as PromiseLike<unknown>).then === "function") {
        if (live()) setFeedback({ scope: target, generation, pending: true });
        void Promise.resolve(result).then(() => {
          if (live()) { current.current.pendingKey = ""; setFeedback({ scope: target, generation, pending: false }); }
        }, () => {
          if (live()) { current.current.pendingKey = ""; setFeedback({ scope: target, generation, pending: false, error: "The action could not be completed. Try again." }); }
        });
      } else if (live()) current.current.pendingKey = "";
    } catch {
      if (live()) { current.current.pendingKey = ""; setFeedback({ scope: target, generation, pending: false, error: "The action could not be completed. Try again." }); }
    }
  };
  const visible = feedback.scope === scope && feedback.generation === current.current.generation;
  return { send, supersede, pending: visible && feedback.pending, error: visible ? feedback.error : undefined };
}

const valueType = (value: unknown) => value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
function Confidence({ candidate }: { candidate: ParsedInspectionField }) {
  return <div className="mcpcn-cv-confidence"><span>Reported confidence: {candidate.confidence === undefined ? "Not supplied" : `${candidate.confidence * 100}%`}</span>
    {candidate.confidence !== undefined && <meter min={0} max={1} value={candidate.confidence} aria-label={`Reported confidence: ${candidate.label}`} aria-valuetext={`${candidate.confidence * 100}%`} />}</div>;
}
function Evidence({ evidence }: { evidence: Member["evidence"] }) {
  return <><h5>Supplied evidence</h5>{evidence.length ? <ul className="mcpcn-cv-evidence" aria-label="Supplied evidence">{evidence.map(item => <li key={item.id}>
    <strong>{item.label}</strong>{item.text !== undefined && <p className="mcpcn-cv-text">{item.text}</p>}
    {item.url !== undefined && <p><a href={item.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{item.url}</a></p>}
  </li>)}</ul> : <p>No evidence was supplied.</p>}</>;
}
function SelectedMember({ member }: { member: Member }) {
  const candidate = "value" in member;
  return <div className="mcpcn-cv-content" role="region" aria-label={candidate ? `Complete candidate value and evidence: ${member.label}` : `Complete validation issue: ${member.label}`} tabIndex={0}>
    <h4>{member.label}</h4>{candidate ? <>
      <p className="mcpcn-hint">Value type: {valueType(member.value)}</p><Confidence candidate={member} />
      <h5>Complete value</h5><pre className="mcpcn-code" aria-label="Complete candidate JSON">{JSON.stringify(member.value, null, 2)}</pre>
    </> : <>
      <p>Reported severity: <strong>{member.severity}</strong></p><p className="mcpcn-cv-text">{member.message}</p>
      {Object.hasOwn(member, "context") ? <><h5>Complete context · {valueType(member.context)}</h5><pre className="mcpcn-code" aria-label="Complete issue context">{JSON.stringify(member.context, null, 2)}</pre></> : <p>No context was supplied.</p>}
    </>}<Evidence evidence={member.evidence} />
  </div>;
}
function ChannelFeedback({ pending, error, confirmation = false }: { pending: boolean; error?: string; confirmation?: boolean }) {
  return <div data-feedback-channel={confirmation ? "confirmation" : "selection"}>
    {pending && <p role="status" className="mcpcn-hint">{confirmation ? "Sending confirmation request…" : "Sending selection notification…"}</p>}
    <Feedback error={error} />
  </div>;
}
function ReadyView({ data, ...props }: UIProps & { data: ReadyReview }) {
  const [stored, setStored] = useState(() => reconcileConflictValidationSelection(data));
  const state = reconcileConflictValidationSelection(data, stored); if (state !== stored) setStored(state);
  const conflict = "conflict" in data, members = membersOf(data), selected = members.find(member => member.id === state.selectedId);
  const controlled = controlledId(data) !== undefined, blocked = controlled && !props.onAction;
  const notification = useScopedFeedback(data, state.selectedId, props.onAction, false);
  const confirmation = useScopedFeedback(data, state.selectedId, props.onAction, true);
  const select = (member: Member) => {
    if (blocked) return;
    if (!controlled) {
      confirmation.supersede(member.id);
      setStored({ ...state, localId: member.id, selectedId: member.id, memberKey: stableReviewKey(member) });
    }
    notification.send(conflictValidationIntent(data, member.id), controlled ? state.selectedId : member.id, member.id);
  };
  const clear = () => {
    if (blocked || state.selectedId === null) return;
    if (!controlled) { confirmation.supersede(null); setStored({ ...state, localId: null, selectedId: null, memberKey: undefined }); }
    notification.send(conflictValidationIntent(data, null), controlled ? state.selectedId : null, null);
  };
  const confirm = canConfirmConflictChoice(data, state.selectedId, Boolean(props.onAction), Boolean(props.busy), confirmation.pending);
  return <>
    {conflict ? <p className="mcpcn-cv-text"><strong>Conflict: </strong>{data.conflict.label}</p> : <>
      <p className="mcpcn-cv-text"><strong>Report: </strong>{data.report.label}</p><p>Reported validation: <strong>{data.report.reportedStatus}</strong></p>
      <p className="mcpcn-hint">Reported validation is independent of supplied issue count and severity.</p>
    </>}
    <p className="mcpcn-hint">{conflict ? "Select a candidate to inspect its complete value and supplied evidence." : "Select an issue to inspect its complete message, context and supplied evidence."}</p>
    <p className="mcpcn-hint">Confidence, severity and evidence are supplied claims. Authorization and server validation remain consumer responsibilities.</p>
    {!members.length ? <p role="status">No validation issues were supplied.</p> : <ul className="mcpcn-cv-members" aria-label={conflict ? "Supplied conflict candidates" : "Reported validation issues"}>
      {members.map(member => <li key={member.id} className="mcpcn-cv-member"><div className="mcpcn-cv-summary"><strong>{member.label}</strong>
        {"value" in member ? <><span className="mcpcn-hint">Value type: {valueType(member.value)}</span><Confidence candidate={member} /></> : <span>Reported severity: {member.severity}</span>}
      </div><Button type="button" data-variant="secondary" aria-label={`${conflict ? "Select candidate" : "Inspect issue"}: ${member.label}`} aria-pressed={state.selectedId === member.id} disabled={blocked} onClick={() => select(member)}>{conflict ? "Select candidate" : "Inspect issue"}</Button></li>)}
    </ul>}
    <div><Button type="button" data-variant="secondary" disabled={blocked || state.selectedId === null} onClick={clear}>Clear selection</Button></div>
    {selected ? <SelectedMember key={selected.id} member={selected} /> : <p role="status">{conflict ? "No candidate is selected." : "No validation issue is selected."}</p>}
    <ChannelFeedback pending={notification.pending} error={notification.error} />
    {conflict && <div className="mcpcn-cv-confirmation"><Button type="button" disabled={!confirm} onClick={() => {
      if (confirm) confirmation.send(conflictValidationIntent(data, state.selectedId, true), state.selectedId, state.selectedId);
    }}>Confirm choice</Button><p className="mcpcn-hint">Confirmation sends the current candidate identity for consumer review. It does not resolve or save the conflict.</p>
      <ChannelFeedback confirmation pending={confirmation.pending} error={confirmation.error} /></div>}
  </>;
}
function View({ data, kind, ...props }: UIProps & { data: ReviewData; kind: "conflict" | "validation" }) {
  return <Card className={["mcpcn-cv-root", props.className].filter(Boolean).join(" ")} role="region" aria-label={data.title} aria-busy={Boolean(props.busy)}>
    <header className="mcpcn-header"><h3 className="mcpcn-title">{data.title}</h3>{data.description !== undefined && <p className="mcpcn-description">{data.description}</p>}</header>
    <div className="mcpcn-body mcpcn-stack">{data.state === "ready" ? <ReadyView data={data} {...props} />
      : data.state === "loading" ? <p role="status">{kind === "conflict" ? "Conflict candidates are loading." : "Validation report is loading."}</p>
        : data.state === "empty" ? <p role="status">{kind === "conflict" ? "No conflict was supplied." : "No validation report was supplied."}</p> : null}
      {data.message !== undefined && <p className="mcpcn-cv-text" role={data.state === "error" ? "alert" : undefined}>{data.message}</p>}
      <Feedback busy={props.busy} error={props.error} />
    </div>
  </Card>;
}
export function ConflictResolver(props: ComponentProps<ConflictResolverData>) {
  const parsed = ConflictResolverSchema.safeParse(ownData(props));
  if (!parsed.success) return <InvalidPayload title="Conflict data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <View data={parsed.data} kind="conflict" className={props.className} busy={props.busy} error={props.error} onAction={props.onAction} />;
}
export function ValidationSummary(props: ComponentProps<ValidationSummaryData>) {
  const parsed = ValidationSummarySchema.safeParse(ownData(props));
  if (!parsed.success) return <InvalidPayload title="Validation report data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <View data={parsed.data} kind="validation" className={props.className} busy={props.busy} error={props.error} onAction={props.onAction} />;
}

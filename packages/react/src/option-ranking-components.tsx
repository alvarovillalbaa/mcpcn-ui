"use client";

import { useEffect, useRef, useState } from "react";
import {
  OptionSelectorSchema, RankingListSchema, stableReviewKey,
  type OptionSelectorData, type ParsedOptionSelectorData, type OptionSelectorIntent,
  type RankingListData, type ParsedRankingListData, type RankingListIntent,
  type ParsedChoiceOption, type ParsedRankedOption,
} from "@mcpcn/schemas";
import { Button, Card, InvalidPayload } from "./primitives.js";
import { Feedback } from "./component-helpers.js";
import type { ComponentAction, ComponentProps } from "./component-types.js";

type UIProps = Pick<ComponentProps<unknown>, "className" | "busy" | "error" | "onAction">;
type ReviewData = ParsedOptionSelectorData | ParsedRankingListData;
type ReadyReview = Extract<ReviewData, { state: "ready" }>;
type Member = ParsedChoiceOption | ParsedRankedOption;
type Intent = OptionSelectorIntent | RankingListIntent;

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
const membersOf = (data: ReadyReview): Member[] => "group" in data ? data.group.options : data.list.entries;
const controlledId = (data: ReadyReview) => "group" in data ? data.selectedOptionId : data.selectedEntryId;
const rootKey = (data: ReadyReview) => stableReviewKey("group" in data
  ? { kind: "options", id: data.id, revision: data.revision, groupId: data.group.id, groupRevision: data.group.revision }
  : { kind: "ranking", id: data.id, revision: data.revision, listId: data.list.id, listRevision: data.list.revision });

export interface OptionRankingSelectionState {
  root: string; localId: string | null; selectedId: string | null; memberKey?: string;
}

/** Unrelated members do not invalidate a current private selection. */
export function reconcileOptionRankingSelection(data: ReadyReview, previous?: OptionRankingSelectionState): OptionRankingSelectionState {
  const root = rootKey(data), stored = previous?.root === root ? previous : undefined, members = membersOf(data);
  const old = members.find(member => member.id === stored?.selectedId);
  const replaced = Boolean(stored?.selectedId && stableReviewKey(old ?? null) !== stored.memberKey);
  const localId = stored && !replaced && members.some(member => member.id === stored.localId) ? stored.localId : null;
  const selectedId = controlledId(data) === undefined ? localId : controlledId(data) ?? null;
  const member = members.find(item => item.id === selectedId);
  const next = { root, localId, selectedId, memberKey: member ? stableReviewKey(member) : undefined };
  return stored && stored.localId === next.localId && stored.selectedId === next.selectedId && stored.memberKey === next.memberKey ? stored : next;
}

/** Requested identities participate before a controlled producer acknowledges them. */
export function optionRankingNotificationScope(data: ReadyReview, selectedId: string | null, requestedId: string | null, available: boolean): string {
  const members = membersOf(data);
  return stableReviewKey({ root: rootKey(data), controlled: controlledId(data) !== undefined, available,
    selectedId, selected: members.find(member => member.id === selectedId) ?? null,
    requestedId, requested: members.find(member => member.id === requestedId) ?? null });
}

export function optionRankingIntent(data: ReadyReview, memberId: string | null): Intent | undefined {
  const base = { componentId: data.id, componentRevision: data.revision }, member = membersOf(data).find(item => item.id === memberId);
  if (memberId !== null && !member) return undefined;
  if ("group" in data) {
    const scope = { ...base, groupId: data.group.id, groupRevision: data.group.revision };
    return member ? { type: "select-option", data: { ...scope, optionId: member.id, optionRevision: member.revision } }
      : { type: "clear-option", data: scope };
  }
  const scope = { ...base, listId: data.list.id, listRevision: data.list.revision };
  return member ? { type: "inspect-ranked-option", data: { ...scope, entryId: member.id, entryRevision: member.revision } }
    : { type: "clear-ranked-option", data: scope };
}

function useOptionRankingNotification(data: ReadyReview, selectedId: string | null, onAction: UIProps["onAction"]) {
  const available = Boolean(onAction);
  const current = useRef({ scope: "", requestedId: null as string | null, generation: 0, pendingKey: "", mounted: true });
  const scope = optionRankingNotificationScope(data, selectedId, current.current.requestedId, available);
  const [feedback, setFeedback] = useState<{ scope: string; generation: number; pending: boolean; error?: string }>({ scope, generation: current.current.generation, pending: false });
  if (current.current.scope !== scope) current.current = { ...current.current, scope, generation: current.current.generation + 1, pendingKey: "" };
  useEffect(() => {
    current.current.mounted = true;
    return () => { current.current.mounted = false; current.current.generation += 1; current.current.pendingKey = ""; };
  }, []);
  const send = (intent: ComponentAction | undefined, nextSelectedId: string | null, requestedId: string | null) => {
    if (!intent || !onAction || !current.current.mounted) return;
    const target = optionRankingNotificationScope(data, nextSelectedId, requestedId, available), key = stableReviewKey(intent);
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
  return { send, pending: visible && feedback.pending, error: visible ? feedback.error : undefined };
}

const valueType = (value: Member["value"]) => value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
function Confidence({ member }: { member: Member }) {
  return <div className="mcpcn-or-confidence"><span>Reported confidence: {member.confidence === undefined ? "Not supplied" : `${member.confidence * 100}%`}</span>
    {member.confidence !== undefined && <meter min={0} max={1} value={member.confidence} aria-label={`Reported confidence: ${member.label}`} aria-valuetext={`${member.confidence * 100}%`} />}</div>;
}
function Rank({ member }: { member: ParsedRankedOption }) {
  return <div className="mcpcn-or-ranking"><span>Reported rank: {member.rank}</span>
    <span>Reported score: {member.score === undefined ? "Not supplied" : member.score}</span>
    {member.scoreLabel !== undefined && <span className="mcpcn-or-text">Score label: {member.scoreLabel}</span>}</div>;
}
function SelectedMember({ member, ranking }: { member: Member; ranking: boolean }) {
  return <div className="mcpcn-or-content" role="region" aria-label={`${ranking ? "Complete ranked option" : "Complete option"} value and evidence: ${member.label}`} tabIndex={0}>
    <h4>{member.label}</h4><p className="mcpcn-hint">Value type: {valueType(member.value)}</p>
    {"rank" in member && <Rank member={member} />}<Confidence member={member} />
    <h5>Complete value</h5><pre className="mcpcn-code" aria-label={ranking ? "Complete ranked option JSON" : "Complete option JSON"}>{JSON.stringify(member.value, null, 2)}</pre>
    <h5>Supplied evidence</h5>{member.evidence.length ? <ul className="mcpcn-or-evidence" aria-label="Supplied evidence">{member.evidence.map(evidence => <li key={evidence.id}>
      <strong>{evidence.label}</strong>{evidence.text !== undefined && <p className="mcpcn-or-text">{evidence.text}</p>}
      {evidence.url !== undefined && <p><a href={evidence.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{evidence.url}</a></p>}
    </li>)}</ul> : <p>No evidence was supplied.</p>}
  </div>;
}
function ReadyView({ data, ...props }: UIProps & { data: ReadyReview }) {
  const [stored, setStored] = useState(() => reconcileOptionRankingSelection(data));
  const state = reconcileOptionRankingSelection(data, stored); if (state !== stored) setStored(state);
  const options = "group" in data, members = membersOf(data), selected = members.find(member => member.id === state.selectedId);
  const controlled = controlledId(data) !== undefined, blocked = controlled && !props.onAction;
  const notification = useOptionRankingNotification(data, state.selectedId, props.onAction);
  const select = (member: Member) => {
    if (blocked) return;
    if (!controlled) setStored({ ...state, localId: member.id, selectedId: member.id, memberKey: stableReviewKey(member) });
    notification.send(optionRankingIntent(data, member.id), controlled ? state.selectedId : member.id, member.id);
  };
  const clear = () => {
    if (blocked || state.selectedId === null) return;
    if (!controlled) setStored({ ...state, localId: null, selectedId: null, memberKey: undefined });
    notification.send(optionRankingIntent(data, null), controlled ? state.selectedId : null, null);
  };
  return <>
    <p className="mcpcn-or-text"><strong>{options ? "Option group: " : "Ranking list: "}</strong>{"group" in data ? data.group.label : data.list.label}</p>
    <p className="mcpcn-hint">{options ? "Select an option to inspect its complete value and supplied evidence." : "Select a ranked option to inspect its complete value and supplied evidence."}</p>
    <p className="mcpcn-hint">Ranks, scores, confidence and evidence are supplied claims, not recommendations or authorization.</p>
    {!members.length ? <p role="status">No ranked options were supplied.</p> : <ul className="mcpcn-or-members" aria-label={options ? "Supplied options" : "Reported ranked options"}>
      {members.map(member => <li key={member.id} className="mcpcn-or-member"><div className="mcpcn-or-summary"><strong>{member.label}</strong>
        <span className="mcpcn-hint">Value type: {valueType(member.value)}</span>{"rank" in member && <Rank member={member} />}<Confidence member={member} />
      </div><Button type="button" data-variant="secondary" aria-label={`${options ? "Select option" : "Inspect ranked option"}: ${member.label}`} aria-pressed={state.selectedId === member.id} disabled={blocked} onClick={() => select(member)}>{options ? "Select option" : "Inspect ranked option"}</Button></li>)}
    </ul>}
    <div><Button type="button" data-variant="secondary" disabled={blocked || state.selectedId === null} onClick={clear}>Clear selection</Button></div>
    {selected ? <SelectedMember key={selected.id} member={selected} ranking={!options} /> : <p role="status">{options ? "No option is selected." : "No ranked option is selected."}</p>}
    {notification.pending && <p role="status" className="mcpcn-hint">Sending selection notification…</p>}<Feedback error={notification.error} />
  </>;
}
function View({ data, kind, ...props }: UIProps & { data: ReviewData; kind: "options" | "ranking" }) {
  return <Card className={["mcpcn-or-root", props.className].filter(Boolean).join(" ")} role="region" aria-label={data.title} aria-busy={Boolean(props.busy)}>
    <header className="mcpcn-header"><h3 className="mcpcn-title">{data.title}</h3>{data.description !== undefined && <p className="mcpcn-description">{data.description}</p>}</header>
    <div className="mcpcn-body mcpcn-stack">{data.state === "ready" ? <ReadyView data={data} {...props} />
      : data.state === "loading" ? <p role="status">{kind === "options" ? "Options are loading." : "Ranked options are loading."}</p>
        : data.state === "empty" ? <p role="status">{kind === "options" ? "No option group was supplied." : "No ranking list was supplied."}</p> : null}
      {data.message !== undefined && <p className="mcpcn-or-text" role={data.state === "error" ? "alert" : undefined}>{data.message}</p>}
      <Feedback busy={props.busy} error={props.error} />
    </div>
  </Card>;
}
export function OptionSelector(props: ComponentProps<OptionSelectorData>) {
  const parsed = OptionSelectorSchema.safeParse(ownData(props));
  if (!parsed.success) return <InvalidPayload title="Option selection data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <View data={parsed.data} kind="options" className={props.className} busy={props.busy} error={props.error} onAction={props.onAction} />;
}
export function RankingList(props: ComponentProps<RankingListData>) {
  const parsed = RankingListSchema.safeParse(ownData(props));
  if (!parsed.success) return <InvalidPayload title="Ranking data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <View data={parsed.data} kind="ranking" className={props.className} busy={props.busy} error={props.error} onAction={props.onAction} />;
}

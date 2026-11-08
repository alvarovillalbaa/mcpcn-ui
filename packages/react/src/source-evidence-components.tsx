"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import {
  SourceListSchema, EvidenceDrawerSchema, stableReviewKey,
  type SourceListData, type ParsedSourceListData, type EvidenceDrawerData, type ParsedEvidenceDrawerData,
  type ParsedEvidenceSource, type SourceListIntent, type EvidenceDrawerIntent,
} from "@mcpcn/schemas";
import { Button, Card, InvalidPayload } from "./primitives.js";
import { Feedback } from "./component-helpers.js";
import type { ComponentAction, ComponentProps } from "./component-types.js";

type UIProps = Pick<ComponentProps<unknown>, "className" | "onAction" | "busy" | "error">;
type ReadyList = Extract<ParsedSourceListData, { state: "ready" }>;
const ownData = <T extends object>({ className: _className, onAction: _onAction, busy: _busy, error: _error, ...data }: ComponentProps<T>) => data;
const rootKey = (data: { id: string; revision: string }) => stableReviewKey({ id: data.id, revision: data.revision });
const actionError = "The action could not be completed. Try again.";

export interface SourceSelectionState {
  root: string; localId: string | null; selectedId: string | null; sourceKey?: string;
}

/** Compare the current member only: an unrelated append does not reset a choice. */
export function reconcileSourceSelection(data: ReadyList, previous?: SourceSelectionState): SourceSelectionState {
  const root = rootKey(data), stored = previous?.root === root ? previous : undefined;
  const oldSource = data.sources.find(source => source.id === stored?.selectedId);
  const replaced = Boolean(stored?.selectedId && stableReviewKey(oldSource ?? null) !== stored.sourceKey);
  const localId = stored && !replaced && data.sources.some(source => source.id === stored.localId) ? stored.localId : null;
  const selectedId = data.selectedSourceId === undefined ? localId : data.selectedSourceId;
  const source = data.sources.find(item => item.id === selectedId);
  const next = { root, localId, selectedId, sourceKey: source ? stableReviewKey(source) : undefined };
  return stored && stored.localId === next.localId && stored.selectedId === next.selectedId && stored.sourceKey === next.sourceKey ? stored : next;
}

export interface EvidencePresentationState {
  root: string; content: string; request: boolean | undefined; open: boolean; cycle: number;
}

/** An external true is a consumed request, while user dismissal remains owned here. */
export function reconcileEvidencePresentation(data: ParsedEvidenceDrawerData, previous?: EvidencePresentationState): EvidencePresentationState {
  const { open: request, ...terms } = data, root = rootKey(data), content = stableReviewKey(terms);
  if (!previous || previous.root !== root) return { root, content, request, open: request === true, cycle: (previous?.cycle ?? -1) + 1 };
  const replaced = previous.content !== content, requested = request === true && previous.request !== true;
  const open = request === false ? false : requested ? true : replaced ? false : previous.open;
  const cycle = previous.cycle + (replaced || requested || previous.open !== open ? 1 : 0);
  return !replaced && previous.request === request && previous.open === open && previous.cycle === cycle
    ? previous : { root, content, request, open, cycle };
}

export function changeEvidencePresentation(state: EvidencePresentationState, open: boolean): EvidencePresentationState {
  return { ...state, open, cycle: state.cycle + 1 };
}
const presentationScope = (state: EvidencePresentationState) => stableReviewKey({ root: state.root, content: state.content, cycle: state.cycle });

/** Local notification ownership; settlement can change feedback, never presentation. */
function useEvidenceNotification(scope: string, onAction: UIProps["onAction"], failure = actionError) {
  const available = Boolean(onAction), ownedScope = `${available}:${scope}`;
  const current = useRef({ scope: ownedScope, generation: 0, pendingKey: "", mounted: true });
  const [feedback, setFeedback] = useState<{ scope: string; pending: boolean; error?: string }>({ scope: ownedScope, pending: false });
  if (current.current.scope !== ownedScope) {
    current.current = { ...current.current, scope: ownedScope, generation: current.current.generation + 1, pendingKey: "" };
  }
  useEffect(() => {
    current.current.mounted = true;
    return () => { current.current.mounted = false; current.current.generation += 1; current.current.pendingKey = ""; };
  }, []);
  const send = (intent: ComponentAction, nextScope = scope) => {
    if (!onAction || !current.current.mounted) return;
    const targetScope = `${available}:${nextScope}`, key = stableReviewKey(intent);
    if (current.current.scope === targetScope && current.current.pendingKey === key) return;
    const generation = current.current.generation + 1;
    current.current = { ...current.current, scope: targetScope, generation, pendingKey: key };
    const live = () => current.current.mounted && current.current.scope === targetScope && current.current.generation === generation;
    setFeedback({ scope: targetScope, pending: false });
    try {
      const result: unknown = onAction(intent);
      if (result && typeof (result as PromiseLike<unknown>).then === "function") {
        if (live()) setFeedback({ scope: targetScope, pending: true });
        void Promise.resolve(result).then(() => {
          if (live()) { current.current.pendingKey = ""; setFeedback({ scope: targetScope, pending: false }); }
        }, () => {
          if (live()) { current.current.pendingKey = ""; setFeedback({ scope: targetScope, pending: false, error: failure }); }
        });
      } else if (live()) current.current.pendingKey = "";
    } catch {
      if (live()) { current.current.pendingKey = ""; setFeedback({ scope: targetScope, pending: false, error: failure }); }
    }
  };
  return { send, pending: feedback.scope === ownedScope && feedback.pending, error: feedback.scope === ownedScope ? feedback.error : undefined };
}

function Header({ title, description }: { title: string; description?: string }) {
  return <header className="mcpcn-header"><h3 className="mcpcn-title">{title}</h3>{description !== undefined && <p className="mcpcn-description">{description}</p>}</header>;
}
function SourceDetails({ source }: { source: ParsedEvidenceSource }) {
  return <div className="mcpcn-source-description">
    <h4>{source.label}</h4>
    {source.url !== undefined && <p><a href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{source.url}</a></p>}
    {source.excerpt !== undefined && <p className="mcpcn-source-excerpt">{source.excerpt}</p>}
    {source.supports.length > 0 && <ul aria-label={`Supplied support: ${source.label}`}>{source.supports.map((support, index) => <li key={index}>{support}</li>)}</ul>}
  </div>;
}
function SourceRow({ data, source, selected, choose, ...props }: UIProps & {
  data: ReadyList; source: ParsedEvidenceSource; selected: boolean; choose: (source: ParsedEvidenceSource) => void;
}) {
  const action = useEvidenceNotification(stableReviewKey({ root: rootKey(data), source }), props.onAction);
  const blocked = Boolean(props.busy || action.pending), controlledWithoutCallback = data.selectedSourceId !== undefined && !props.onAction;
  const intent = (type: SourceListIntent["type"]): SourceListIntent => ({ type, data: { listId: data.id, listRevision: data.revision, sourceId: source.id, sourceRevision: source.revision } });
  return <li className="mcpcn-source-item"><SourceDetails source={source} /><div className="mcpcn-row">
    <Button type="button" data-variant="secondary" aria-label={`Select source: ${source.label}`} aria-pressed={selected} disabled={blocked || controlledWithoutCallback}
      onClick={() => { if (blocked || controlledWithoutCallback) return; choose(source); action.send(intent("select-source")); }}>Select source</Button>
    <Button type="button" data-variant="secondary" aria-label={`Inspect source: ${source.label}`} disabled={blocked || !props.onAction}
      onClick={() => action.send(intent("inspect-source"))}>Inspect source</Button>
  </div><Feedback busy={action.pending} error={action.error} /></li>;
}

export function SourceList(props: ComponentProps<SourceListData>) {
  const parsed = SourceListSchema.safeParse(ownData(props));
  if (!parsed.success) return <InvalidPayload title="Source list is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <SourceListView key={rootKey(parsed.data)} data={parsed.data} className={props.className} busy={props.busy} error={props.error} onAction={props.onAction} />;
}
function SourceListView({ data, ...props }: UIProps & { data: ParsedSourceListData }) {
  return <Card className={["mcpcn-source-root", props.className].filter(Boolean).join(" ")} role="region" aria-label={data.title} aria-busy={Boolean(props.busy)}>
    <Header {...data} /><div className="mcpcn-body mcpcn-stack">
      <p className="mcpcn-hint">Sources and support are supplied claims, not verified evidence.</p>
      {data.state === "ready" ? <ReadySources data={data} {...props} /> : data.state === "loading" ? <p role="status">Source list is loading.</p>
        : data.state === "empty" ? <p role="status">No sources were supplied.</p> : null}
      {data.message !== undefined && <p role={data.state === "error" ? "alert" : undefined}>{data.message}</p>}
      <Feedback busy={props.busy} error={props.error} />
    </div></Card>;
}
function ReadySources({ data, ...props }: UIProps & { data: ReadyList }) {
  const [stored, setStored] = useState(() => reconcileSourceSelection(data));
  const state = reconcileSourceSelection(data, stored);
  if (state !== stored) setStored(state);
  return data.sources.length === 0 ? <p role="status">No sources were supplied.</p> : <ul className="mcpcn-source-list" aria-label="Supplied sources">
    {data.sources.map(source => <SourceRow key={source.id} data={data} source={source} selected={state.selectedId === source.id} {...props}
      choose={selected => { if (data.selectedSourceId === undefined) setStored({ ...state, localId: selected.id, selectedId: selected.id, sourceKey: stableReviewKey(selected) }); }} />)}
  </ul>;
}

function restoreInvoker(invoker: HTMLElement | null, dialog: HTMLDialogElement) {
  if (!invoker?.isConnected || invoker.ownerDocument !== dialog.ownerDocument || invoker.closest("[inert],[hidden],[aria-hidden='true']")
    || "disabled" in invoker && Boolean(invoker.disabled) || invoker.getClientRects().length === 0) return;
  const style = invoker.ownerDocument.defaultView?.getComputedStyle(invoker);
  if (style?.visibility === "hidden" || style?.display === "none") return;
  try {
    const modals = [...dialog.ownerDocument.querySelectorAll("dialog:modal")];
    if (modals.some(modal => modal !== dialog && !modal.contains(invoker))) return;
    if (dialog.ownerDocument.activeElement !== invoker) invoker.focus({ preventScroll: true });
  } catch { /* Unsupported native modality cannot justify moving another scope's focus. */ }
}

export function EvidenceDrawer(props: ComponentProps<EvidenceDrawerData>) {
  const parsed = EvidenceDrawerSchema.safeParse(ownData(props));
  if (!parsed.success) return <InvalidPayload title="Evidence drawer is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <EvidenceDrawerView data={parsed.data} className={props.className} busy={props.busy} error={props.error} onAction={props.onAction} />;
}
function EvidenceDrawerView({ data, ...props }: UIProps & { data: ParsedEvidenceDrawerData }) {
  const [stored, setStored] = useState(() => reconcileEvidencePresentation(data));
  const state = reconcileEvidencePresentation(data, stored);
  if (state !== stored) setStored(state);
  const live = useRef(state); live.current = state;
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null), invoker = useRef<HTMLElement | null>(null);
  const backdrop = useRef<number | null>(null), labelId = useId(), dialogId = useId();
  const [promoted, setPromoted] = useState(false), [modalError, setModalError] = useState<{ scope: string; message: string }>();
  const scope = presentationScope(state), notification = useEvidenceNotification(scope, props.onAction, "The view request could not be reported. Try again.");
  const source = "source" in data ? data.source : undefined;
  const intent = (type: EvidenceDrawerIntent["type"]): EvidenceDrawerIntent => ({ type, data: source === undefined
    ? { drawerId: data.id, drawerRevision: data.revision }
    : { drawerId: data.id, drawerRevision: data.revision, sourceId: source.id, sourceRevision: source.revision } });
  const change = (open: boolean) => {
    const next = changeEvidencePresentation(live.current, open); live.current = next; setStored(next); return next;
  };
  const dismiss = () => {
    if (!live.current.open && !dialog.current?.open) return;
    const next = change(false); backdrop.current = null;
    if (dialog.current?.open) dialog.current.close();
    setPromoted(false);
    if (dialog.current) restoreInvoker(invoker.current, dialog.current);
    notification.send(intent("close-evidence"), presentationScope(next));
  };
  useEffect(() => {
    const node = dialog.current;
    if (!node || !state.open) { setPromoted(false); return; }
    const owner = invoker.current?.isConnected ? invoker.current : node.ownerDocument.activeElement;
    const previousFocus = owner instanceof HTMLElement ? owner : null;
    invoker.current = previousFocus;
    try {
      if (!node.isConnected || typeof node.showModal !== "function" || typeof node.close !== "function") throw new Error("modal_unavailable");
      if (!node.open) node.showModal();
      if (!node.open || !node.matches(":modal")) throw new Error("modal_not_promoted");
      setPromoted(true); setModalError(undefined); heading.current?.focus({ preventScroll: true });
    } catch {
      if (node.open && typeof node.close === "function") node.close();
      const next = changeEvidencePresentation(live.current, false); live.current = next; setStored(next); setPromoted(false);
      setModalError({ scope: next.content, message: "The evidence drawer could not open as a modal." });
    }
    return () => {
      if (node.open) node.close();
      restoreInvoker(previousFocus, node);
      invoker.current = null;
    };
  }, [state.open, state.cycle]);
  const outside = (event: PointerEvent<HTMLDialogElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
  };
  const feedback = <Feedback busy={Boolean(props.busy || notification.pending)} error={props.error ?? notification.error ?? (modalError?.scope === state.content ? modalError.message : undefined)} />;
  return <Card className={["mcpcn-evidence-root", props.className].filter(Boolean).join(" ")} role="region" aria-label={data.title} aria-busy={Boolean(props.busy || notification.pending)}>
    <Header {...data} /><div className="mcpcn-body mcpcn-stack">
      <p className="mcpcn-hint">Evidence is supplied for inspection; its contents are not independently verified.</p>
      <Button type="button" aria-label="Open evidence" aria-haspopup="dialog" aria-controls={dialogId} aria-expanded={promoted}
        disabled={data.open === false && !props.onAction} onClick={event => {
          invoker.current = event.currentTarget;
          if (data.open === false) { notification.send(intent("open-evidence")); return; }
          if (live.current.open) return;
          const next = change(true); notification.send(intent("open-evidence"), presentationScope(next));
        }}>Open evidence</Button>
      {!promoted && feedback}
    </div>
    <dialog ref={dialog} id={dialogId} className="mcpcn mcpcn-evidence-dialog" aria-labelledby={labelId} data-presentation-open={state.open}
      onCancel={event => { event.preventDefault(); dismiss(); }}
      onClose={event => { if (event.currentTarget.open || !live.current.open) return; change(false); setPromoted(false); restoreInvoker(invoker.current, event.currentTarget); }}
      onPointerDown={event => { backdrop.current = event.button === 0 && outside(event) ? event.pointerId : null; }}
      onPointerUp={event => { const close = backdrop.current === event.pointerId && outside(event); backdrop.current = null; if (close) dismiss(); }}
      onPointerCancel={() => { backdrop.current = null; }}>
      <header className="mcpcn-header mcpcn-row mcpcn-between"><h2 ref={heading} id={labelId} className="mcpcn-title" tabIndex={-1}>{data.title}</h2>
        <Button type="button" data-variant="secondary" aria-label="Close evidence" onClick={dismiss}>Close evidence</Button></header>
      <div key={state.content} className="mcpcn-evidence-content mcpcn-stack" role="region" aria-label="Supplied evidence content" tabIndex={0}>
        {data.description !== undefined && <p className="mcpcn-description">{data.description}</p>}
        {source !== undefined && <SourceDetails source={source} />}
        {data.state === "ready" ? data.content.type === "text" ? <pre className="mcpcn-evidence-text">{data.content.text}</pre>
          : <details open><summary>Evidence JSON</summary><pre className="mcpcn-code">{JSON.stringify(data.content.value, null, 2)}</pre></details>
          : data.state === "loading" ? <p role="status">Evidence is loading.</p> : data.state === "empty" ? <p role="status">No evidence was supplied.</p> : null}
        {data.message !== undefined && <p role={data.state === "error" ? "alert" : undefined}>{data.message}</p>}
        <p className="mcpcn-hint">Sources and support are supplied claims, not verified evidence.</p>{promoted && feedback}
      </div>
    </dialog>
  </Card>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { SourceList, EvidenceDrawer, type ComponentAction } from "@mcpcn/react";
import type { SourceListData, EvidenceDrawerData } from "@mcpcn/schemas";
import { applySourceListExampleAction, sourceEvidenceExamples } from "./source-evidence-examples";

type ResponseMode = "immediate" | "delayed" | "reject";
type OpenRequest = "local" | "false" | "true";
const cloneList = () => structuredClone(sourceEvidenceExamples["source-list"]);
const cloneDrawer = () => structuredClone(sourceEvidenceExamples["evidence-drawer"]);
const localList = (): SourceListData => {
  const data = cloneList();
  if (data.state !== "ready") return data;
  const { selectedSourceId: _selected, ...local } = data; return local;
};
function requested(data: EvidenceDrawerData, mode: OpenRequest): EvidenceDrawerData {
  const { open: _open, ...local } = data;
  return mode === "local" ? local : { ...local, open: mode === "true" };
}
function useDemoFeedback() {
  const [response, setResponse] = useState<ResponseMode>("immediate"), [last, setLast] = useState<ComponentAction | null>(null);
  const [count, setCount] = useState(0), [settled, setSettled] = useState(0);
  const jobs = useRef(new Set<{ timer: ReturnType<typeof setTimeout>; resolve(): void }>());
  useEffect(() => () => {
    for (const job of jobs.current) { clearTimeout(job.timer); job.resolve(); }
    jobs.current.clear();
  }, []);
  const receive = (action: ComponentAction): void | Promise<void> => {
    setLast(action); setCount(value => value + 1);
    const captured = response;
    if (captured === "immediate") { setSettled(value => value + 1); return; }
    return new Promise<void>((resolve, reject) => {
      const job = { timer: setTimeout(() => {
        jobs.current.delete(job); setSettled(value => value + 1);
        if (captured === "reject") reject(new Error("Authored notification refusal")); else resolve();
      }, 1500), resolve };
      jobs.current.add(job);
    });
  };
  return { response, setResponse, last, count, settled, receive };
}
function useLifecycleTimers() {
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => () => { for (const timer of timers.current) clearTimeout(timer); timers.current.clear(); }, []);
  return (action: () => void, milliseconds: number) => {
    const timer = setTimeout(() => { timers.current.delete(timer); action(); }, milliseconds);
    timers.current.add(timer);
  };
}
function ResponseControl({ value, change }: { value: ResponseMode; change: (value: ResponseMode) => void }) {
  return <label className="mcpcn-label">Consumer response<select aria-label="Consumer response" value={value} onChange={event => change(event.currentTarget.value as ResponseMode)}>
    <option value="immediate">Immediate</option><option value="delayed">Delayed</option><option value="reject">Reject</option>
  </select></label>;
}
function Counters({ name, feedback }: { name: "Source list" | "Evidence"; feedback: ReturnType<typeof useDemoFeedback> }) {
  return <><p>Intent notifications: <output aria-label={`${name} intent count`}>{feedback.count}</output> · Settled: <output aria-label="Settled callback count">{feedback.settled}</output></p>
    <pre className="code" aria-label={`Last ${name.toLowerCase()} intent`}>{JSON.stringify(feedback.last, null, 2)}</pre></>;
}

export function SourceListDemo() {
  const [data, setData] = useState<SourceListData>(localList), [ownership, setOwnership] = useState("local");
  const [selected, setSelected] = useState<string | null>(null), [callback, setCallback] = useState(true), [malformed, setMalformed] = useState(false);
  const [appended, setAppended] = useState(false), [rootRevision, setRootRevision] = useState(1), [sourceRevision, setSourceRevision] = useState(1);
  const feedback = useDemoFeedback();
  const receive = (action: ComponentAction) => {
    const patch = applySourceListExampleAction(data, action);
    if (patch.state === "ready" && patch !== data) {
      setSelected(patch.selectedSourceId ?? null);
      if (ownership === "controlled") setData(current => applySourceListExampleAction(current, action));
    }
    return feedback.receive(action);
  };
  return <section className="mcpcn-stack" aria-label="Source list demonstration">
    <ResponseControl value={feedback.response} change={feedback.setResponse} />
    <label className="mcpcn-label">Selection ownership<select aria-label="Selection ownership" value={ownership} onChange={event => {
      const mode = event.currentTarget.value; setOwnership(mode);
      setData(current => {
        if (current.state !== "ready") return current;
        if (mode === "controlled") return { ...current, selectedSourceId: selected };
        const { selectedSourceId: _selected, ...local } = current; return local;
      });
    }}><option value="local">Local</option><option value="controlled">Controlled</option></select></label>
    <div className="filter-row"><label><input type="checkbox" aria-label="Callback enabled" checked={callback} onChange={event => setCallback(event.currentTarget.checked)} /> Callback enabled</label>
      <label><input type="checkbox" aria-label="Malformed source list" checked={malformed} onChange={event => setMalformed(event.currentTarget.checked)} /> Malformed source list</label></div>
    <SourceList {...(malformed ? { ...data, unsupported: true } as unknown as SourceListData : data)} onAction={callback ? receive : undefined} />
    <div className="filter-row">
      <button type="button" className="button secondary" disabled={appended} onClick={() => {
        setData(current => current.state === "ready" ? { ...current, sources: [...current.sources, { id: "note-appendix", revision: "1", label: "Unrelated appended source", excerpt: "Complete unrelated excerpt. END-APPENDIX", supports: [] }] } : current);
        setAppended(true);
      }}>Append unrelated source</button>
      <button type="button" className="button secondary" disabled={selected === null || ownership === "local" && !callback} onClick={() => {
        const next = sourceRevision + 1; setSourceRevision(next);
        setData(current => current.state === "ready" ? { ...current, sources: current.sources.map(source => source.id === selected ? {
          ...source, revision: String(next), label: "Replacement supplied source", excerpt: "Replacement source excerpt. END-REPLACEMENT-SOURCE",
        } : source) } : current);
        if (ownership === "local") setSelected(null);
      }}>Replace selected source</button>
      <button type="button" className="button secondary" disabled={ownership !== "controlled"} onClick={() => {
        setSelected(null); setData(current => current.state === "ready" ? { ...current, selectedSourceId: null } : current);
      }}>Clear controlled selection</button>
      <button type="button" className="button secondary" onClick={() => {
        const next = rootRevision + 1; setRootRevision(next); setSelected(null); setAppended(false); setSourceRevision(1);
        const replacement = ownership === "local" ? localList() : cloneList();
        setData({ ...replacement, id: `sources-1-replacement-${next}`, revision: String(next) });
      }}>Replace source list</button>
    </div>
    <p className="mcpcn-hint">Selection echo and notification feedback are local. The demo does not fetch, verify or persist sources. Callback-free local selection remains private to the component.</p>
    <Counters name="Source list" feedback={feedback} />
  </section>;
}

export function EvidenceDrawerDemo() {
  const [data, setData] = useState<EvidenceDrawerData>(cloneDrawer), [request, setRequest] = useState<OpenRequest>("local");
  const [callback, setCallback] = useState(true), [busy, setBusy] = useState(false), [malformed, setMalformed] = useState(false), [mounted, setMounted] = useState(true);
  const [lifecycle, setLifecycle] = useState("keep"), [revision, setRevision] = useState(1), [sourceRevision, setSourceRevision] = useState(1);
  const feedback = useDemoFeedback(), later = useLifecycleTimers();
  const receive = (action: ComponentAction) => {
    if (action.type === "open-evidence" && lifecycle === "unmount") later(() => setMounted(false), 600);
    return feedback.receive(action);
  };
  return <section className="mcpcn-stack" aria-label="Evidence drawer demonstration">
    <ResponseControl value={feedback.response} change={feedback.setResponse} />
    <label className="mcpcn-label">External open request<select aria-label="External open request" value={request} onChange={event => {
      const mode = event.currentTarget.value as OpenRequest; setRequest(mode); setData(current => requested(current, mode));
    }}><option value="local">Local</option><option value="false">False</option><option value="true">True</option></select></label>
    <label className="mcpcn-label">Drawer lifecycle<select aria-label="Drawer lifecycle" value={lifecycle} onChange={event => setLifecycle(event.currentTarget.value)}>
      <option value="keep">Keep mounted</option><option value="unmount">Unmount after opening</option>
    </select></label>
    <div className="filter-row">
      <label><input type="checkbox" aria-label="External busy" checked={busy} onChange={event => setBusy(event.currentTarget.checked)} /> External busy</label>
      <label><input type="checkbox" aria-label="Callback enabled" checked={callback} onChange={event => setCallback(event.currentTarget.checked)} /> Callback enabled</label>
      <label><input type="checkbox" aria-label="Malformed evidence" checked={malformed} onChange={event => setMalformed(event.currentTarget.checked)} /> Malformed evidence</label>
      <label><input type="checkbox" aria-label="Mount evidence drawer" checked={mounted} onChange={event => setMounted(event.currentTarget.checked)} /> Mount evidence drawer</label>
    </div>
    {mounted ? <EvidenceDrawer {...(malformed ? { ...data, unsupported: true } as unknown as EvidenceDrawerData : data)} busy={busy} onAction={callback ? receive : undefined} /> : <p role="status">The authored evidence drawer is unmounted.</p>}
    <div className="filter-row">
      <button type="button" className="button secondary" onClick={() => {
        const next = sourceRevision + 1; setSourceRevision(next);
        setData(current => "source" in current && current.source ? { ...current, source: { ...current.source, revision: String(next), label: "Replacement supplied source", excerpt: "Replacement source excerpt. END-REPLACEMENT-SOURCE" } } : current);
      }}>Replace source descriptor</button>
      <button type="button" className="button secondary" onClick={() => setData(current => current.state === "ready" ? { ...current, content: current.content.type === "text"
        ? { type: "text", text: "Replacement complete supplied evidence.\nEND-REPLACEMENT-EVIDENCE" }
        : { type: "json", value: { replacement: true, rows: [0, false, null, ""], marker: "END-REPLACEMENT-EVIDENCE" } } } : current)}>Replace evidence content</button>
      <button type="button" className="button secondary" onClick={() => {
        const next = revision + 1; setRevision(next); setSourceRevision(1);
        setData(requested({ ...cloneDrawer(), id: `evidence-1-replacement-${next}`, revision: String(next) }, request));
      }}>Replace evidence drawer</button>
      <button type="button" className="button secondary" onClick={() => {
        const initial = cloneDrawer(); setData(current => current.state === "ready" && initial.state === "ready" ? { ...current, content: initial.content } : current);
      }}>Use text evidence</button>
      <button type="button" className="button secondary" onClick={() => setData(current => current.state === "ready" ? { ...current, content: { type: "json", value: {
        count: 0, confirmed: false, next: null, empty: "", nested: { rows: [0, false, null, ""] }, marker: "END-JSON-EVIDENCE",
      } } } : current)}>Use JSON evidence</button>
    </div>
    <p className="mcpcn-hint">Open and close notifications never authorize dismissal. Replacement and mount controls are normal page UI, inert while a native modal is open. The optional opening lifecycle unmounts after 600 ms; captured notification promises settle after 1500 ms.</p>
    <Counters name="Evidence" feedback={feedback} />
  </section>;
}

export function EvidenceDrawerStackDemo() {
  const [cycle, setCycle] = useState(0), [stage, setStage] = useState<"closed" | "first" | "both">("closed");
  const [removeInvoker, setRemoveInvoker] = useState(false), [trigger, setTrigger] = useState(true);
  const [count, setCount] = useState(0), [last, setLast] = useState<ComponentAction | null>(null), later = useLifecycleTimers();
  // Child A's native promotion effect runs before this parent's passive effect.
  useEffect(() => { if (stage === "first") setStage("both"); }, [stage]);
  const receive = (action: ComponentAction) => { setLast(action); setCount(value => value + 1); };
  const first = requested({ ...cloneDrawer(), id: "stack-first", revision: String(cycle), title: "First stacked evidence" }, stage === "closed" ? "false" : "true");
  const second = requested({ ...cloneDrawer(), id: "stack-second", revision: String(cycle), title: "Second stacked evidence" }, stage === "both" ? "true" : "false");
  return <section className="mcpcn-stack" aria-label="Evidence drawer stack demonstration">
    <h3>Two independent native evidence drawers</h3>
    <label><input type="checkbox" aria-label="Remove stack invoker after opening" checked={removeInvoker} onChange={event => setRemoveInvoker(event.currentTarget.checked)} /> Remove stack invoker after opening</label>
    <div className="filter-row">{trigger && <button type="button" className="button secondary" onClick={() => {
      setCycle(value => value + 1); setStage("first");
      if (removeInvoker) later(() => setTrigger(false), 400);
    }}>Open stacked drawers</button>}
      <button type="button" className="button secondary" onClick={() => { setStage("closed"); setTrigger(true); }}>Reset stacked drawers</button></div>
    <p>Opening trigger: <output aria-label="Stack opening trigger">{trigger ? "Present" : "Removed"}</output></p>
    <EvidenceDrawer {...first} onAction={receive} /><EvidenceDrawer {...second} onAction={receive} />
    <p>Stack notifications: <output aria-label="Stacked evidence intent count">{count}</output></p>
    <pre className="code" aria-label="Last stacked evidence intent">{JSON.stringify(last, null, 2)}</pre>
    <p className="mcpcn-hint">The browser promotes the first drawer, then the second. Close the top drawer before the first; each instance owns its dismissal and focus restoration.</p>
  </section>;
}

"use client";

import { useRef, useState } from "react";
import { OptionSelector, RankingList, type ComponentAction } from "@mcpcn/react";
import type { OptionSelectorData, RankingListData } from "@mcpcn/schemas";
import { applyOptionRankingExampleAction, optionRankingExamples, type OptionRankingExampleData } from "./option-ranking-examples";

type Kind = keyof typeof optionRankingExamples;
type ResponseMode = "immediate" | "hold" | "throw";
type Held = { resolve(): void; reject(error: Error): void };
function resetSelection(current: OptionRankingExampleData, mode: string): OptionRankingExampleData {
  if (current.state !== "ready") return current;
  if ("group" in current) {
    const { selectedOptionId: _selection, ...local } = current;
    return mode === "local" ? local : { ...local, selectedOptionId: null };
  }
  const { selectedEntryId: _selection, ...local } = current;
  return mode === "local" ? local : { ...local, selectedEntryId: null };
}
const members = (data: OptionRankingExampleData) => data.state !== "ready" ? [] : "group" in data ? data.group.options : data.list.entries;
function useDemoConsumer() {
  const [mode, setMode] = useState<ResponseMode>("immediate"), [last, setLast] = useState<ComponentAction | null>(null);
  const [counts, setCounts] = useState({ total: 0, settled: 0, pending: 0 });
  const held = useRef<Held[]>([]);
  const receive = (action: ComponentAction) => {
    const response = mode;
    setLast(action); setCounts(current => ({ ...current, total: current.total + 1 }));
    if (response === "hold") return new Promise<void>((resolve, reject) => {
      held.current.push({ resolve, reject }); setCounts(current => ({ ...current, pending: current.pending + 1 }));
    });
    setCounts(current => ({ ...current, settled: current.settled + 1 }));
    if (response === "throw") throw new Error("Authored current selection refusal");
  };
  const settle = (reject: boolean) => {
    const job = held.current.shift(); if (!job) return;
    setCounts(current => ({ ...current, pending: current.pending - 1, settled: current.settled + 1 }));
    if (reject) job.reject(new Error("Authored held selection refusal")); else job.resolve();
  };
  return { mode, setMode, last, counts, receive, settle };
}

function OptionRankingDemo({ kind }: { kind: Kind }) {
  const option = kind === "option-selector", name = option ? "Option selector" : "Ranking list";
  const [data, setData] = useState<OptionRankingExampleData>(() => resetSelection(structuredClone(optionRankingExamples[kind]), "local"));
  const [ownership, setOwnership] = useState("local"), [localSelection, setLocalSelection] = useState<string | null>(null);
  const [callback, setCallback] = useState(true), [busy, setBusy] = useState(false), [malformed, setMalformed] = useState(false), [mounted, setMounted] = useState(true);
  const [rootRevision, setRootRevision] = useState(1), [ownerRevision, setOwnerRevision] = useState(1), [memberRevision, setMemberRevision] = useState(1);
  const consumer = useDemoConsumer(), currentMembers = members(data);
  const externalSelection = data.state !== "ready" ? undefined : "group" in data ? data.selectedOptionId : data.selectedEntryId;
  const selected = externalSelection === undefined ? localSelection : externalSelection;
  const selectedMember = currentMembers.find(member => member.id === selected);
  const receive = (action: ComponentAction) => {
    // Bookkeeping follows only acknowledged current identities, never the child's private state.
    const controlled = resetSelection(data, "controlled"), next = applyOptionRankingExampleAction(controlled, action);
    if (next !== controlled && next.state === "ready") setLocalSelection("group" in next ? next.selectedOptionId ?? null : next.selectedEntryId ?? null);
    return consumer.receive(action);
  };
  const changeState = (state: string) => {
    setLocalSelection(null); setOwnerRevision(1); setMemberRevision(1);
    if (state === "ready" || state === "ready-empty") {
      const fresh = resetSelection(structuredClone(optionRankingExamples[kind]), ownership);
      const next = state === "ready-empty" && fresh.state === "ready" && "list" in fresh ? { ...fresh, list: { ...fresh.list, entries: [] } } : fresh;
      setData({ ...next, id: data.id, revision: data.revision });
    } else {
      const common = { id: data.id, revision: data.revision, title: data.title };
      if (state === "error") setData({ ...common, state: "error", message: "Authored option or ranking failure." });
      else if (state === "loading" || state === "empty") setData({ ...common, state });
    }
  };
  const editMembers = (operation: "append" | "reorder" | "replace" | "remove") => {
    const nextRevision = memberRevision + 1;
    if (operation === "replace") { setMemberRevision(nextRevision); setLocalSelection(null); }
    if (operation === "remove") setLocalSelection(null);
    setData(current => {
      if (current.state !== "ready") return current;
      if ("group" in current) {
        const rows = current.group.options;
        const options = operation === "append" ? [...rows, { id: "appendix", revision: "1", label: "Unrelated appended option", value: { note: "END-OPTION-APPENDIX" }, evidence: [] }]
          : operation === "reorder" ? [...rows].reverse() : operation === "remove" ? rows.filter(member => member.id !== selected)
            : rows.map(member => member.id === selected ? { ...member, revision: String(nextRevision), label: "Replacement option", value: { replaced: true, end: "END-OPTION-REPLACEMENT" }, confidence: 0.25, evidence: [] } : member);
        const next = { ...current, group: { ...current.group, options } };
        return operation === "remove" && current.selectedOptionId === selected ? { ...next, selectedOptionId: null } : next;
      }
      const rows = current.list.entries;
      const entries = operation === "append" ? [...rows, { id: "appendix", revision: "1", label: "Unrelated appended ranked option", value: { note: "END-RANKING-APPENDIX" }, rank: 99, score: 0, evidence: [] }]
        : operation === "reorder" ? [...rows].reverse() : operation === "remove" ? rows.filter(member => member.id !== selected)
          : rows.map(member => member.id === selected ? { ...member, revision: String(nextRevision), label: "Replacement ranked option", value: { replaced: true, end: "END-RANKING-REPLACEMENT" }, rank: 42, score: -0.25, scoreLabel: "Replacement score", confidence: 0.25, evidence: [] } : member);
      const next = { ...current, list: { ...current.list, entries } };
      return operation === "remove" && current.selectedEntryId === selected ? { ...next, selectedEntryId: null } : next;
    });
  };
  const shownState = data.state === "ready" && "list" in data && data.list.entries.length === 0 ? "ready-empty" : data.state;
  return <section className="mcpcn-stack" aria-label={`${name} demonstration`}>
    <label className="mcpcn-label">Selection notification response<select aria-label="Selection notification response" value={consumer.mode} onChange={event => consumer.setMode(event.currentTarget.value as ResponseMode)}>
      <option value="immediate">Immediate</option><option value="hold">Hold until explicitly settled</option><option value="throw">Throw current request</option>
    </select></label>
    <label className="mcpcn-label">Selection ownership<select aria-label="Selection ownership" value={ownership} onChange={event => { const mode = event.currentTarget.value; setOwnership(mode); setLocalSelection(null); setData(current => resetSelection(current, mode)); }}>
      <option value="local">Local</option><option value="controlled">Controlled</option>
    </select></label>
    <label className="mcpcn-label">Reported state<select aria-label="Reported state" value={shownState} onChange={event => changeState(event.currentTarget.value)}>
      <option value="ready">Ready</option>{!option && <option value="ready-empty">Ready with no ranked options</option>}<option value="loading">Loading</option><option value="empty">Empty</option><option value="error">Error</option>
    </select></label>
    <div className="filter-row">
      <label><input type="checkbox" aria-label="Callback enabled" checked={callback} onChange={event => { setCallback(event.currentTarget.checked); setLocalSelection(null); }} /> Callback enabled</label>
      <label><input type="checkbox" aria-label="External busy" checked={busy} onChange={event => setBusy(event.currentTarget.checked)} /> External busy</label>
      <label><input type="checkbox" aria-label="Malformed data" checked={malformed} onChange={event => { setMalformed(event.currentTarget.checked); setLocalSelection(null); }} /> Malformed data</label>
      <label><input type="checkbox" aria-label="Mount component" checked={mounted} onChange={event => { setMounted(event.currentTarget.checked); setLocalSelection(null); }} /> Mount component</label>
    </div>
    {mounted && (option ? <OptionSelector {...(malformed ? { ...data, unsupported: true } as unknown as OptionSelectorData : data as OptionSelectorData)} busy={busy} onAction={callback ? receive : undefined} />
      : <RankingList {...(malformed ? { ...data, unsupported: true } as unknown as RankingListData : data as RankingListData)} busy={busy} onAction={callback ? receive : undefined} />)}
    <div className="filter-row">
      <button type="button" className="button secondary" disabled={ownership !== "controlled" || !consumer.last} onClick={() => { const action = consumer.last; if (action) setData(current => applyOptionRankingExampleAction(current, action)); }}>Apply last selection request</button>
      <button type="button" className="button secondary" disabled={data.state !== "ready" || currentMembers.some(member => member.id === "appendix")} onClick={() => editMembers("append")}>Append unrelated member</button>
      <button type="button" className="button secondary" disabled={currentMembers.length < 2} onClick={() => editMembers("reorder")}>Reorder members</button>
      <button type="button" className="button secondary" disabled={!selectedMember} onClick={() => editMembers("replace")}>Replace selected member</button>
      <button type="button" className="button secondary" disabled={!selectedMember || option && currentMembers.length <= 1} onClick={() => editMembers("remove")}>Remove selected member</button>
      {!option && <><button type="button" className="button secondary" disabled={!selectedMember} onClick={() => {
        setLocalSelection(null);
        setData(current => current.state === "ready" && "list" in current ? { ...current, list: { ...current.list, entries: current.list.entries.map(member => member.id === selected ? { ...member, rank: member.rank === 1000000 ? 1 : member.rank + 1 } : member) } } : current);
      }}>Change selected rank</button><button type="button" className="button secondary" disabled={!selectedMember} onClick={() => {
        setLocalSelection(null);
        setData(current => current.state === "ready" && "list" in current ? { ...current, list: { ...current.list, entries: current.list.entries.map(member => member.id === selected ? { ...member, score: member.score === undefined ? 0 : member.score >= 999999999999 ? 0 : member.score + 1 } : member) } } : current);
      }}>Change selected score</button></>}
      <button type="button" className="button secondary" disabled={data.state !== "ready"} onClick={() => {
        const next = ownerRevision + 1; setOwnerRevision(next); setLocalSelection(null);
        setData(current => {
          if (current.state !== "ready") return current;
          const fresh = "group" in current ? { ...current, group: { ...current.group, id: `group-1-replacement-${next}`, revision: String(next), label: "Replacement supplied group" } }
            : { ...current, list: { ...current.list, id: `list-1-replacement-${next}`, revision: String(next), label: "Replacement supplied ranking" } };
          return resetSelection(fresh, ownership);
        });
      }}>{option ? "Replace group" : "Replace list"}</button>
      <button type="button" className="button secondary" onClick={() => {
        const next = rootRevision + 1; setRootRevision(next); setOwnerRevision(1); setMemberRevision(1); setLocalSelection(null);
        setData({ ...resetSelection(structuredClone(optionRankingExamples[kind]), ownership), id: `${kind}-1-replacement-${next}`, revision: String(next) });
      }}>Replace component</button>
    </div>
    <div className="filter-row">
      <button type="button" className="button secondary" disabled={consumer.counts.pending === 0} onClick={() => consumer.settle(false)}>Resolve oldest notification</button>
      <button type="button" className="button secondary" disabled={consumer.counts.pending === 0} onClick={() => consumer.settle(true)}>Reject oldest notification</button>
    </div>
    <p>Intent notifications: <output aria-label={`${name} intent count`}>{consumer.counts.total}</output> · Selection requests: <output aria-label="Selection notification count">{consumer.counts.total}</output> · Settled: <output aria-label="Settled selection notification count">{consumer.counts.settled}</output> · Pending: <output aria-label="Pending selection notifications">{consumer.counts.pending}</output></p>
    <pre className="code" aria-label={`Last ${option ? "option selector" : "ranking list"} intent`}>{JSON.stringify(consumer.last, null, 2)}</pre>
    <p className="mcpcn-hint">These are supplied options and reported rankings. Apply controlled selection requests explicitly. Reading or settling a notification does not approve, save, compute a ranking or authorize anything. Held requests settle only through the labelled controls. Callback-free local selection remains private to the component. Nothing is fetched or sent to a tool or model.</p>
  </section>;
}
export function OptionSelectorDemo() { return <OptionRankingDemo kind="option-selector" />; }
export function RankingListDemo() { return <OptionRankingDemo kind="ranking-list" />; }

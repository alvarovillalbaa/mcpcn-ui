"use client";

import { useRef, useState } from "react";
import { ConflictResolver, ValidationSummary, type ComponentAction } from "@mcpcn/react";
import type { ConflictResolverData, ValidationSummaryData } from "@mcpcn/schemas";
import { applyConflictValidationExampleAction, conflictValidationExamples, type ConflictValidationExampleData } from "./conflict-validation-examples";

type Kind = keyof typeof conflictValidationExamples;
type ResponseMode = "immediate" | "hold" | "throw";
type Channel = "notification" | "confirmation";
type Held = { channel: Channel; resolve(): void; reject(error: Error): void };
const localExample = (kind: Kind): ConflictValidationExampleData => {
  const value = structuredClone(conflictValidationExamples[kind]);
  if (value.state !== "ready") return value;
  if ("conflict" in value) { const { selectedCandidateId: _selection, ...local } = value; return local; }
  const { selectedIssueId: _selection, ...local } = value; return local;
};
const members = (data: ConflictValidationExampleData) => data.state !== "ready" ? [] : "conflict" in data ? data.conflict.candidates : data.report.issues;
function useDemoConsumer() {
  const [notificationMode, setNotificationMode] = useState<ResponseMode>("immediate"), [confirmationMode, setConfirmationMode] = useState<ResponseMode>("immediate");
  const [last, setLast] = useState<ComponentAction | null>(null), [lastSelection, setLastSelection] = useState<ComponentAction | null>(null);
  const [counts, setCounts] = useState({ total: 0, notifications: 0, confirmations: 0, settledNotifications: 0, settledConfirmations: 0, pendingNotifications: 0, pendingConfirmations: 0 });
  const held = useRef<Held[]>([]);
  const receive = (action: ComponentAction) => {
    const channel: Channel = action.type === "confirm-conflict-candidate" ? "confirmation" : "notification";
    const mode = channel === "confirmation" ? confirmationMode : notificationMode;
    setLast(action); if (channel === "notification") setLastSelection(action);
    setCounts(current => ({ ...current, total: current.total + 1, notifications: current.notifications + Number(channel === "notification"), confirmations: current.confirmations + Number(channel === "confirmation") }));
    if (mode === "hold") return new Promise<void>((resolve, reject) => {
      held.current.push({ channel, resolve, reject });
      setCounts(current => ({ ...current, pendingNotifications: current.pendingNotifications + Number(channel === "notification"), pendingConfirmations: current.pendingConfirmations + Number(channel === "confirmation") }));
    });
    setCounts(current => ({ ...current, settledNotifications: current.settledNotifications + Number(channel === "notification"), settledConfirmations: current.settledConfirmations + Number(channel === "confirmation") }));
    if (mode === "throw") throw new Error("Authored current request refusal");
  };
  const settle = (channel: Channel, reject: boolean) => {
    const index = held.current.findIndex(job => job.channel === channel); if (index < 0) return;
    const job = held.current.splice(index, 1)[0]; if (!job) return;
    setCounts(current => ({ ...current, pendingNotifications: current.pendingNotifications - Number(channel === "notification"), pendingConfirmations: current.pendingConfirmations - Number(channel === "confirmation"),
      settledNotifications: current.settledNotifications + Number(channel === "notification"), settledConfirmations: current.settledConfirmations + Number(channel === "confirmation") }));
    if (reject) job.reject(new Error("Authored held request refusal")); else job.resolve();
  };
  return { notificationMode, setNotificationMode, confirmationMode, setConfirmationMode, last, lastSelection, counts, receive, settle };
}

function ConflictValidationDemo({ kind }: { kind: Kind }) {
  const conflict = kind === "conflict-resolver", name = conflict ? "Conflict resolver" : "Validation summary";
  const [data, setData] = useState<ConflictValidationExampleData>(() => localExample(kind));
  const [ownership, setOwnership] = useState("local"), [localSelection, setLocalSelection] = useState<string | null>(null);
  const [callback, setCallback] = useState(true), [busy, setBusy] = useState(false), [malformed, setMalformed] = useState(false), [mounted, setMounted] = useState(true);
  const [rootRevision, setRootRevision] = useState(1), [ownerRevision, setOwnerRevision] = useState(1), [memberRevision, setMemberRevision] = useState(1);
  const consumer = useDemoConsumer(), currentMembers = members(data);
  const externalSelection = data.state !== "ready" ? undefined : "conflict" in data ? data.selectedCandidateId : data.selectedIssueId;
  const selected = externalSelection === undefined ? localSelection : externalSelection;
  const selectedMember = currentMembers.find(member => member.id === selected);
  const receive = (action: ComponentAction) => {
    if (action.type === (conflict ? "clear-conflict-candidate" : "clear-validation-issue")) setLocalSelection(null);
    else if (action.type === (conflict ? "select-conflict-candidate" : "inspect-validation-issue") && action.data && typeof action.data === "object" && !Array.isArray(action.data)) {
      const scope = action.data as Record<string, unknown>, stem = conflict ? "candidate" : "issue";
      const member = currentMembers.find(item => item.id === scope[stem + "Id"] && item.revision === scope[stem + "Revision"]);
      if (member) setLocalSelection(member.id);
    }
    return consumer.receive(action);
  };
  const resetSelection = (current: ConflictValidationExampleData, mode: string): ConflictValidationExampleData => {
    if (current.state !== "ready") return current;
    if ("conflict" in current) {
      const { selectedCandidateId: _selection, ...local } = current;
      return mode === "local" ? local : { ...local, selectedCandidateId: null };
    }
    const { selectedIssueId: _selection, ...local } = current;
    return mode === "local" ? local : { ...local, selectedIssueId: null };
  };
  const changeState = (state: string) => {
    setLocalSelection(null); setOwnerRevision(1); setMemberRevision(1);
    if (state === "ready" || state === "ready-empty") {
      const fresh = resetSelection(structuredClone(conflictValidationExamples[kind]), ownership);
      const next = state === "ready-empty" && fresh.state === "ready" && "report" in fresh ? { ...fresh, report: { ...fresh.report, issues: [] } } : fresh;
      setData({ ...next, id: data.id, revision: data.revision });
    } else {
      const common = { id: data.id, revision: data.revision, title: data.title };
      if (state === "error") setData({ ...common, state: "error", message: "Authored conflict or validation failure." });
      else if (state === "loading" || state === "empty") setData({ ...common, state });
    }
  };
  const editMembers = (operation: "append" | "reorder" | "replace" | "remove") => {
    const nextRevision = memberRevision + 1;
    if (operation === "replace") { setMemberRevision(nextRevision); setLocalSelection(null); }
    if (operation === "remove") setLocalSelection(null);
    setData(current => {
      if (current.state !== "ready") return current;
      if ("conflict" in current) {
        const rows = current.conflict.candidates;
        const candidates = operation === "append" ? [...rows, { id: "appendix", revision: "1", label: "Unrelated appended candidate", value: { note: "END-CONFLICT-APPENDIX" }, evidence: [] }]
          : operation === "reorder" ? [...rows].reverse() : operation === "remove" ? rows.filter(member => member.id !== selected)
            : rows.map(member => member.id === selected ? { ...member, revision: String(nextRevision), label: "Replacement candidate", value: { replaced: true, end: "END-CONFLICT-REPLACEMENT" }, confidence: 0.25, evidence: [] } : member);
        const next = { ...current, conflict: { ...current.conflict, candidates } };
        return operation === "remove" && current.selectedCandidateId === selected ? { ...next, selectedCandidateId: null } : next;
      }
      const rows = current.report.issues;
      const issues = operation === "append" ? [...rows, { id: "appendix", revision: "1", label: "Unrelated appended issue", severity: "info" as const, message: "An unrelated supplied issue. END-VALIDATION-APPENDIX", evidence: [] }]
        : operation === "reorder" ? [...rows].reverse() : operation === "remove" ? rows.filter(member => member.id !== selected)
          : rows.map(member => member.id === selected ? { ...member, revision: String(nextRevision), label: "Replacement issue", severity: "warning" as const, message: "Complete replacement issue message.", context: { replaced: true, end: "END-VALIDATION-REPLACEMENT" }, evidence: [] } : member);
      const next = { ...current, report: { ...current.report, issues } };
      return operation === "remove" && current.selectedIssueId === selected ? { ...next, selectedIssueId: null } : next;
    });
  };
  const shownState = data.state === "ready" && "report" in data && data.report.issues.length === 0 ? "ready-empty" : data.state;
  return <section className="mcpcn-stack" aria-label={`${name} demonstration`}>
    <label className="mcpcn-label">Selection notification response<select aria-label="Selection notification response" value={consumer.notificationMode} onChange={event => consumer.setNotificationMode(event.currentTarget.value as ResponseMode)}>
      <option value="immediate">Immediate</option><option value="hold">Hold until explicitly settled</option><option value="throw">Throw current request</option>
    </select></label>
    {conflict && <label className="mcpcn-label">Confirmation response<select aria-label="Confirmation response" value={consumer.confirmationMode} onChange={event => consumer.setConfirmationMode(event.currentTarget.value as ResponseMode)}>
      <option value="immediate">Immediate</option><option value="hold">Hold until explicitly settled</option><option value="throw">Throw current request</option>
    </select></label>}
    <label className="mcpcn-label">Selection ownership<select aria-label="Selection ownership" value={ownership} onChange={event => { const mode = event.currentTarget.value; setOwnership(mode); setLocalSelection(null); setData(current => resetSelection(current, mode)); }}>
      <option value="local">Local</option><option value="controlled">Controlled</option>
    </select></label>
    <label className="mcpcn-label">Reported state<select aria-label="Reported state" value={shownState} onChange={event => changeState(event.currentTarget.value)}>
      <option value="ready">Ready</option>{!conflict && <option value="ready-empty">Ready with no issues</option>}<option value="loading">Loading</option><option value="empty">Empty</option><option value="error">Error</option>
    </select></label>
    {!conflict && <label className="mcpcn-label">Reported validation status<select aria-label="Reported validation status" disabled={data.state !== "ready"} value={data.state === "ready" && "report" in data ? data.report.reportedStatus : ""}
      onChange={event => { const status = event.currentTarget.value as "unknown" | "pending" | "valid" | "invalid"; setData(current => current.state === "ready" && "report" in current ? { ...current, report: { ...current.report, reportedStatus: status } } : current); }}>
      <option value="" disabled>No supplied report</option><option value="unknown">Unknown</option><option value="pending">Pending</option><option value="valid">Valid</option><option value="invalid">Invalid</option>
    </select></label>}
    <div className="filter-row">
      <label><input type="checkbox" aria-label="Callback enabled" checked={callback} onChange={event => { setCallback(event.currentTarget.checked); setLocalSelection(null); }} /> Callback enabled</label>
      <label><input type="checkbox" aria-label="External busy" checked={busy} onChange={event => setBusy(event.currentTarget.checked)} /> External busy</label>
      <label><input type="checkbox" aria-label="Malformed data" checked={malformed} onChange={event => { setMalformed(event.currentTarget.checked); setLocalSelection(null); }} /> Malformed data</label>
      <label><input type="checkbox" aria-label="Mount component" checked={mounted} onChange={event => { setMounted(event.currentTarget.checked); setLocalSelection(null); }} /> Mount component</label>
    </div>
    {mounted && (conflict ? <ConflictResolver {...(malformed ? { ...data, unsupported: true } as unknown as ConflictResolverData : data as ConflictResolverData)} busy={busy} onAction={callback ? receive : undefined} />
      : <ValidationSummary {...(malformed ? { ...data, unsupported: true } as unknown as ValidationSummaryData : data as ValidationSummaryData)} busy={busy} onAction={callback ? receive : undefined} />)}
    <div className="filter-row">
      <button type="button" className="button secondary" disabled={ownership !== "controlled" || !consumer.lastSelection} onClick={() => { const action = consumer.lastSelection; if (action) setData(current => applyConflictValidationExampleAction(current, action)); }}>Apply last selection request</button>
      <button type="button" className="button secondary" disabled={data.state !== "ready" || currentMembers.some(member => member.id === "appendix")} onClick={() => editMembers("append")}>Append unrelated member</button>
      <button type="button" className="button secondary" disabled={currentMembers.length < 2} onClick={() => editMembers("reorder")}>Reorder members</button>
      <button type="button" className="button secondary" disabled={!selectedMember} onClick={() => editMembers("replace")}>Replace selected member</button>
      <button type="button" className="button secondary" disabled={!selectedMember || conflict && currentMembers.length <= 2} onClick={() => editMembers("remove")}>Remove selected member</button>
      <button type="button" className="button secondary" disabled={data.state !== "ready"} onClick={() => {
        const next = ownerRevision + 1; setOwnerRevision(next); setLocalSelection(null);
        setData(current => {
          if (current.state !== "ready") return current;
          const fresh = "conflict" in current ? { ...current, conflict: { ...current.conflict, id: `conflict-1-replacement-${next}`, revision: String(next), label: "Replacement supplied conflict" } }
            : { ...current, report: { ...current.report, id: `report-1-replacement-${next}`, revision: String(next), label: "Replacement supplied report" } };
          return resetSelection(fresh, ownership);
        });
      }}>{conflict ? "Replace conflict" : "Replace report"}</button>
      <button type="button" className="button secondary" onClick={() => {
        const next = rootRevision + 1; setRootRevision(next); setOwnerRevision(1); setMemberRevision(1); setLocalSelection(null);
        setData({ ...resetSelection(structuredClone(conflictValidationExamples[kind]), ownership), id: `${kind}-1-replacement-${next}`, revision: String(next) });
      }}>Replace component</button>
    </div>
    <div className="filter-row">
      <button type="button" className="button secondary" disabled={consumer.counts.pendingNotifications === 0} onClick={() => consumer.settle("notification", false)}>Resolve oldest notification</button>
      <button type="button" className="button secondary" disabled={consumer.counts.pendingNotifications === 0} onClick={() => consumer.settle("notification", true)}>Reject oldest notification</button>
      {conflict && <><button type="button" className="button secondary" disabled={consumer.counts.pendingConfirmations === 0} onClick={() => consumer.settle("confirmation", false)}>Resolve oldest confirmation</button>
        <button type="button" className="button secondary" disabled={consumer.counts.pendingConfirmations === 0} onClick={() => consumer.settle("confirmation", true)}>Reject oldest confirmation</button></>}
    </div>
    <p>Intent notifications: <output aria-label={`${name} intent count`}>{consumer.counts.total}</output> · Selection requests: <output aria-label="Selection notification count">{consumer.counts.notifications}</output> · Settled: <output aria-label="Settled selection notification count">{consumer.counts.settledNotifications}</output> · Pending: <output aria-label="Pending selection notifications">{consumer.counts.pendingNotifications}</output></p>
    {conflict && <p>Confirm requests: <output aria-label="Confirmation count">{consumer.counts.confirmations}</output> · Settled: <output aria-label="Settled confirmation count">{consumer.counts.settledConfirmations}</output> · Pending: <output aria-label="Pending confirmations">{consumer.counts.pendingConfirmations}</output></p>}
    <pre className="code" aria-label={`Last ${conflict ? "conflict resolver" : "validation summary"} intent`}>{JSON.stringify(consumer.last, null, 2)}</pre>
    <p className="mcpcn-hint">These are supplied choices and reported validation claims. Apply selection requests explicitly; confirmation settlement does not resolve, validate, save or authorize anything. Held requests settle only through the labelled controls. Callback-free local selection remains private to the component. Nothing is fetched or sent to a tool or model.</p>
  </section>;
}
export function ConflictResolverDemo() { return <ConflictValidationDemo kind="conflict-resolver" />; }
export function ValidationSummaryDemo() { return <ConflictValidationDemo kind="validation-summary" />; }

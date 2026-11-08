"use client";

import { useEffect, useRef, useState } from "react";
import { ApprovalChecklist, BeforeSubmitConfirmation, DestructiveActionGuard, HumanOverridePanel, PermissionRequestCard, type ComponentAction } from "@mcpcn/react";
import type { ApprovalChecklistData, BeforeSubmitConfirmationData, DestructiveActionGuardData, HumanOverridePanelData, PermissionRequestCardData } from "@mcpcn/schemas";
import { approvalExamples } from "./approval-examples";

function useFeedback() {
  const [last, setLast] = useState<ComponentAction | null>(null);
  const [count, setCount] = useState(0);
  const [settled, setSettled] = useState(0);
  const [response, setResponse] = useState<"immediate" | "delayed" | "reject">("immediate");
  const jobs = useRef(new Set<{ timer: ReturnType<typeof setTimeout>; resolve(): void }>());
  useEffect(() => () => {
    for (const job of jobs.current) { clearTimeout(job.timer); job.resolve(); }
    jobs.current.clear();
  }, []);
  const receive = (action: ComponentAction, controlled = false): void | Promise<void> => {
    setLast(action);
    setCount(value => value + 1);
    // Controlled prop updates stay synchronous so input focus is retained.
    if (controlled || response === "immediate") return;
    return new Promise<void>((resolve, reject) => {
      const job = { timer: setTimeout(() => {
        jobs.current.delete(job);
        setSettled(value => value + 1);
        if (response === "reject") reject(new Error("Authored consumer rejection")); else resolve();
      }, 1500), resolve };
      jobs.current.add(job);
    });
  };
  return { receive, reset: () => { setLast(null); setCount(0); }, controls: <label className="mcpcn-label">Consumer response<select aria-label="Consumer response" value={response} onChange={event => setResponse(event.currentTarget.value as typeof response)}>
    <option value="immediate">Immediate</option><option value="delayed">Delayed</option><option value="reject">Reject</option>
  </select></label>, output: <><p className="mcpcn-hint">Authored local feedback only. No permission, authorization, tool or model call is performed.</p><p>Approval intents: <output aria-label="Approval intent count">{count}</output></p><p>Settled callbacks: <output aria-label="Settled callback count">{settled}</output></p><pre className="code" aria-label="Last approval intent">{JSON.stringify(last, null, 2)}</pre></> };
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export function ApprovalChecklistDemo() {
  const [data, setData] = useState<ApprovalChecklistData>(approvalExamples["approval-checklist"]), [revision, setRevision] = useState(1);
  const feedback = useFeedback();
  return <div className="mcpcn-stack">{feedback.controls}<ApprovalChecklist {...data} onAction={action => {
    const value = action.data, controlled = action.type === "check-item";
    if (controlled && object(value) && value.reviewId === data.reviewId && typeof value.itemId === "string" && typeof value.checked === "boolean") {
      const { itemId, checked } = value;
      setData(current => current.items.some(item => item.id === itemId) ? { ...current, checkedItemIds: checked ? [...new Set([...(current.checkedItemIds ?? []), itemId])] : (current.checkedItemIds ?? []).filter(id => id !== itemId) } : current);
    }
    return feedback.receive(action, controlled);
  }} /><button type="button" className="button secondary" onClick={() => { setRevision(revision + 1); setData({ ...approvalExamples["approval-checklist"], reviewId: `docs-checklist-${revision + 1}` }); feedback.reset(); }}>Replace review</button>{feedback.output}</div>;
}

export function BeforeSubmitConfirmationDemo() {
  const [data, setData] = useState<BeforeSubmitConfirmationData>(approvalExamples["before-submit-confirmation"]), [revision, setRevision] = useState(1);
  const feedback = useFeedback();
  return <div className="mcpcn-stack">{feedback.controls}<BeforeSubmitConfirmation {...data} onAction={action => feedback.receive(action)} />
    <button type="button" className="button secondary" onClick={() => { setRevision(revision + 1); setData({ ...approvalExamples["before-submit-confirmation"], reviewId: `docs-submission-${revision + 1}`, fields: [{ id: "subject", label: "Subject", value: `Replacement request ${revision + 1}` }, { id: "records", label: "Records", value: revision + 2 }] }); feedback.reset(); }}>Replace review</button>{feedback.output}</div>;
}

export function DestructiveActionGuardDemo() {
  const [data, setData] = useState<DestructiveActionGuardData>(approvalExamples["destructive-action-guard"]), [revision, setRevision] = useState(1);
  const feedback = useFeedback();
  return <div className="mcpcn-stack">{feedback.controls}<DestructiveActionGuard {...data} onAction={action => feedback.receive(action)} />
    <button type="button" className="button secondary" onClick={() => { setRevision(revision + 1); setData({ ...approvalExamples["destructive-action-guard"], reviewId: `docs-destructive-${revision + 1}`, affectedCount: revision + 2, targetLabel: `${revision + 2} authored draft records` }); feedback.reset(); }}>Replace review</button>{feedback.output}</div>;
}

export function HumanOverridePanelDemo() {
  const [data, setData] = useState<HumanOverridePanelData>(approvalExamples["human-override-panel"]), [revision, setRevision] = useState(1);
  const feedback = useFeedback();
  return <div className="mcpcn-stack">{feedback.controls}<HumanOverridePanel {...data} onAction={action => {
    const value = action.data, controlled = action.type === "select-override-option";
    if (controlled && object(value) && value.reviewId === data.reviewId && typeof value.optionId === "string") {
      const { optionId } = value;
      setData(current => current.options.some(option => option.id === optionId) ? { ...current, selectedOptionId: optionId } : current);
    }
    return feedback.receive(action, controlled);
  }} /><button type="button" className="button secondary" onClick={() => { setRevision(revision + 1); setData({ ...approvalExamples["human-override-panel"], reviewId: `docs-override-${revision + 1}`, recommendation: `Use the standard route for revision ${revision + 1}.` }); feedback.reset(); }}>Replace review</button>{feedback.output}</div>;
}

export function PermissionRequestCardDemo() {
  const [data, setData] = useState<PermissionRequestCardData>(approvalExamples["permission-request-card"]), [revision, setRevision] = useState(1);
  const feedback = useFeedback();
  return <div className="mcpcn-stack">{feedback.controls}<PermissionRequestCard {...data} onAction={action => {
    const value = action.data, controlled = action.type === "select-scope";
    if (controlled && object(value) && value.reviewId === data.reviewId && typeof value.scopeId === "string" && typeof value.selected === "boolean") {
      const { scopeId, selected } = value;
      setData(current => current.scopes.some(scope => scope.id === scopeId) ? { ...current, selectedScopeIds: selected ? [...new Set([...(current.selectedScopeIds ?? []), scopeId])] : (current.selectedScopeIds ?? []).filter(id => id !== scopeId) } : current);
    }
    return feedback.receive(action, controlled);
  }} /><button type="button" className="button secondary" onClick={() => { setRevision(revision + 1); setData({ ...approvalExamples["permission-request-card"], reviewId: `docs-permission-${revision + 1}`, purpose: `Review metadata for authored request ${revision + 1}.` }); feedback.reset(); }}>Replace review</button>{feedback.output}</div>;
}

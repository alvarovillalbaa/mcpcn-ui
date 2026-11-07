"use client";
import { useState } from "react";
import { ApprovalCard, AuditTrail, EntityReviewTable, GenericAgentComponent, SchemaForm, ToolProgressTimeline, type ComponentAction } from "@mcpcn/react";
export const approvalFixture={title:"Publish pricing update?",description:"This changes prices for active EU customers.",riskLevel:"high" as const,actionLabel:"Approve & publish",changes:[{label:"Pro plan",before:"€49",after:"€59",affectedCount:1248},{label:"Effective date",before:"—",after:"Aug 15, 2026"}],requiresExplicitConsent:true,approvalTool:"approve_pricing",rollback:"Restore the previous price table within 24 hours."};
export function ApprovalDemo() {
  const [revision, setRevision] = useState(1), [busy, setBusy] = useState(false), [reject, setReject] = useState(false);
  const [last, setLast] = useState<ComponentAction | null>(null), [count, setCount] = useState(0), [settled, setSettled] = useState(0);
  return <div className="mcpcn-stack">
    <div className="mcpcn-row"><button type="button" onClick={() => setRevision(value => value + 1)}>Change review terms</button>
      <label><input type="checkbox" checked={busy} onChange={event => setBusy(event.currentTarget.checked)} />Approval is busy</label>
      <label><input type="checkbox" checked={reject} onChange={event => setReject(event.currentTarget.checked)} />Reject next approval</label></div>
    <ApprovalCard {...approvalFixture} busy={busy}
      changes={[...approvalFixture.changes.slice(0, 1).map(change => ({ ...change, after: revision === 1 ? "€59" : "€" + (59 + revision) })), approvalFixture.changes[1]!]}
      onAction={async action => {
        setLast(action); setCount(value => value + 1);
        try { await new Promise(resolve => setTimeout(resolve, 300)); if (reject) throw new Error("Authored approval refusal"); }
        finally { setSettled(value => value + 1); }
      }} />
    <p>Intent count: <output aria-label="Approval intent count">{count}</output> · Settled: <output aria-label="Approval settled count">{settled}</output></p>
    <pre className="mcpcn-code" aria-label="Approval last action">{JSON.stringify(last, null, 2)}</pre>
  </div>;
}
export function ProgressDemo(){return <ToolProgressTimeline title="Research market" description="4 sources, with step-level recovery." steps={[{id:"1",label:"Search primary sources",status:"succeeded"},{id:"2",label:"Extract claims",status:"succeeded"},{id:"3",label:"Verify market data",status:"running"},{id:"4",label:"Draft recommendation",status:"queued"}]}/>}
export function FormDemo() {
  const [replaced, setReplaced] = useState(false), [reject, setReject] = useState(false);
  const [last, setLast] = useState<ComponentAction | null>(null), [count, setCount] = useState(0), [settled, setSettled] = useState(0);
  return <div className="mcpcn-stack">
    <div className="mcpcn-row"><button type="button" onClick={() => setReplaced(value => !value)}>Replace form fields</button>
      <label><input type="checkbox" checked={reject} onChange={event => setReject(event.currentTarget.checked)} />Reject next form intent</label></div>
    <SchemaForm title="A few details are missing" description="Review the currently requested fields before sending."
      fields={replaced ? [
        { name: "ownerEmail", label: "Owner email", type: "email", required: true },
        { name: "confirmed", label: "Confirm details", type: "boolean", required: true },
        { name: "budget", label: "Budget", type: "number", required: false }
      ] : [
        { name: "travelers", label: "Travelers", type: "number", required: true, value: 2 },
        { name: "cabin", label: "Cabin", type: "select", required: true, options: [{ label: "Economy", value: "economy" }, { label: "Business", value: "business" }] },
        { name: "notes", label: "Constraints", type: "textarea", required: false }
      ]}
      submitLabel="Continue workflow" submitTool="save_reviewed_details"
      onAction={async action => {
        setLast(action); setCount(value => value + 1);
        try { await new Promise(resolve => setTimeout(resolve, 300)); if (reject) throw new Error("Authored form refusal"); }
        finally { setSettled(value => value + 1); }
      }} />
    <p>Intent count: <output aria-label="Form intent count">{count}</output> · Settled: <output aria-label="Form settled count">{settled}</output></p>
    <pre className="mcpcn-code" aria-label="Form last action">{JSON.stringify(last, null, 2)}</pre>
  </div>;
}
export function ReviewDemo(){return <EntityReviewTable title="Review extracted invoices" columns={[{key:"vendor",label:"Vendor"},{key:"total",label:"Total"},{key:"due",label:"Due"}]} rows={[{id:"1",values:{vendor:"Northstar Ltd",total:"€4,820",due:"Aug 30"},confidence:.96},{id:"2",values:{vendor:"Aperture GmbH",total:"€1,240",due:"Sep 2"},confidence:.81}]} actionLabel="Save 2 records"/>}
export function AuditDemo(){return <AuditTrail title="Action history" entries={[{id:"1",label:"Agent drafted change",actor:"Research agent",timestamp:"2026-08-08 10:30",status:"info"},{id:"2",label:"Evidence verified",actor:"MCPCN",timestamp:"2026-08-08 10:31",status:"success"},{id:"3",label:"Waiting for approval",actor:"You",timestamp:"Now",status:"warning"}]}/>}

export function GenericDemo({ title }: { title: string }) {
  const [last, setLast] = useState<ComponentAction | null>(null);
  return <div className="mcpcn-stack"><GenericAgentComponent title={title} description="Shared informational-card implementation."
    items={[{ label: "Authored example", status: "Ready" }]}
    actions={[{ label: "Record example intent", value: "example" }]} onAction={setLast} />
    <pre className="mcpcn-code" aria-label="Generic last action">{JSON.stringify(last, null, 2)}</pre></div>;
}

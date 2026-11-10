"use client";
import { useEffect, useState } from "react";
import { AgentAppProvider, OfficialMCPAdapter } from "@mcpcn/runtime";
import { Button, Card } from "@mcpcn/react";
import { WorkflowFrame, useReferenceWorkflow } from "@mcpcn/reference-workflows/client";
import { AdminStateSchema, adminSeed } from "./contracts.js";
export const fixture = adminSeed;
function SettingsReview() {
  const controller = useReferenceWorkflow("admin-settings-change", AdminStateSchema), [digest, setDigest] = useState(false), [days, setDays] = useState("30");
  const state = controller.view?.state, revision = controller.view?.revision;
  useEffect(() => { if (state) { setDigest(state.settings.weeklyDigest); setDays(String(state.settings.retentionDays)); } }, [revision]);
  return <WorkflowFrame controller={controller} title="Workspace settings review">{state && <>
    <Card><section className="reference-section"><h2>{state.workspaceName}</h2><p>These are local reference preferences. No SSO service, digest sender or file-deletion worker is connected.</p>
      <dl><dt>Weekly digest</dt><dd>{String(state.settings.weeklyDigest)}</dd><dt>Retention preference</dt><dd>{state.settings.retentionDays} days</dd><dt>Affected example members</dt><dd>{state.members.length}</dd></dl>
      <ul>{state.members.map(member => <li key={member.id}>{member.label}</li>)}</ul></section></Card>
    <form className="reference-form" aria-label="Workspace preference changes" onSubmit={event => { event.preventDefault(); void controller.prepare({ action: "change", settings: { weeklyDigest: digest, retentionDays: Number(days) } }); }}>
      <fieldset disabled={controller.busy || !controller.ready}><legend>Propose exact new settings</legend>
        <label className="reference-check"><input type="checkbox" aria-label="Weekly digest" checked={digest} onChange={event => { setDigest(event.currentTarget.checked); controller.clearReview(); }} />Weekly digest</label>
        <label>Retention preference (days)<input aria-label="Retention preference (days)" type="number" required min={1} max={365} value={days} onChange={event => { setDays(event.currentTarget.value); controller.clearReview(); }} /></label>
        <Button type="submit">Review settings change</Button></fieldset></form>
    <Card><section className="reference-section"><h2>Rollback</h2><p>A rollback restores the saved previous values only after reviewing the current revision. A concurrent change invalidates the prepared review.</p>
      {state.previous && <p>Previous values: digest {String(state.previous.weeklyDigest)}; retention {state.previous.retentionDays} days.</p>}
      <Button disabled={!state.previous || controller.busy || !controller.ready} onClick={() => void controller.prepare({ action: "rollback" })}>Review rollback</Button></section></Card>
  </>}</WorkflowFrame>;
}
export function App() { const [adapter] = useState(() => new OfficialMCPAdapter()); return <AgentAppProvider adapter={adapter}><SettingsReview /></AgentAppProvider>; }

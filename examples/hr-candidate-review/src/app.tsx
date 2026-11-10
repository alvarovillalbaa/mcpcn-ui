"use client";
import { useState } from "react";
import { AgentAppProvider, OfficialMCPAdapter } from "@mcpcn/runtime";
import { Button, Card } from "@mcpcn/react";
import { WorkflowFrame, useReferenceWorkflow } from "@mcpcn/reference-workflows/client";
import { CandidateStateSchema, candidateSeed } from "./contracts.js";
export const fixture = candidateSeed;
function Review() {
  const controller = useReferenceWorkflow("hr-candidate-review", CandidateStateSchema), [decision, setDecision] = useState("approve"), [note, setNote] = useState("");
  const state = controller.view?.state;
  return <WorkflowFrame controller={controller} title="Candidate review">{state && <>
    <Card><section className="reference-section"><h2>{state.candidate.name}</h2><p>{state.candidate.role}</p><p>{state.candidate.summary}</p></section></Card>
    <div className="reference-grid"><Card><section className="reference-section"><h2>Evidence</h2>{state.evidence.map(item => <article key={item.id}><h3>{item.title}</h3><blockquote>{item.excerpt}</blockquote></article>)}</section></Card>
      <Card><section className="reference-section"><h2>Reported scores</h2>{state.scores.map(score => <div key={score.label}><h3>{score.label}: {score.value}/100</h3><p>{score.reason}</p></div>)}</section></Card></div>
    <Card><section className="reference-section"><h2>Missing data and risks</h2><ul>{state.gaps.map(gap => <li key={gap.label}>{gap.label}{gap.blocking ? " — blocks approval" : " — reviewer judgment required"}</li>)}{state.risks.map(risk => <li key={risk}>{risk}</li>)}</ul></section></Card>
    {state.note && <p aria-label="Saved reviewer note">Saved reviewer note: {state.note}</p>}
    <form className="reference-form" aria-label="Candidate decision" onSubmit={event => { event.preventDefault(); void controller.prepare({ decision, note }); }}>
      <fieldset disabled={controller.busy || !controller.ready}><legend>Choose a decision to review</legend>
        <label>Decision<select aria-label="Candidate decision" value={decision} onChange={event => { setDecision(event.currentTarget.value); controller.clearReview(); }}><option value="approve">Approve recommendation</option><option value="reject">Reject recommendation</option><option value="request-info">Request more information</option></select></label>
        <label>Reviewer note<textarea aria-label="Reviewer note" minLength={5} maxLength={4000} required value={note} onChange={event => { setNote(event.currentTarget.value); controller.clearReview(); }} /></label>
        <Button type="submit">Review candidate decision</Button></fieldset></form>
  </>}</WorkflowFrame>;
}
export function App() { const [adapter] = useState(() => new OfficialMCPAdapter()); return <AgentAppProvider adapter={adapter}><Review /></AgentAppProvider>; }

"use client";
import { useEffect, useState } from "react";
import { AgentAppProvider, OfficialMCPAdapter } from "@mcpcn/runtime";
import { Button, Card, ToolProgressTimeline } from "@mcpcn/react";
import { WorkflowFrame, useReferenceWorkflow } from "@mcpcn/reference-workflows/client";
import { ResearchStateSchema, researchSeed } from "./contracts.js";
export const fixture = researchSeed;
function ResearchReview() {
  const controller = useReferenceWorkflow("research-workflow", ResearchStateSchema), [conclusion, setConclusion] = useState("");
  const current = controller.view?.state, revision = controller.view?.revision;
  const state = controller.view?.prepared?.proposed ?? current;
  useEffect(() => { if (current) setConclusion(current.conclusion); }, [revision]);
  return <WorkflowFrame controller={controller} title="Research source review">{state && current && <>
    <h2>{state.question}</h2><p>Gather configured primary-source text, inspect partial failures and write your own final decision. No model generates a conclusion.</p>
    <ToolProgressTimeline title="Source gathering" steps={state.sources.map(source => ({ id: source.id, label: source.title, status: source.status === "pending" ? "queued" : source.status, ...(source.error ? { error: source.error } : {}) }))} />
    <Button disabled={controller.busy || !controller.ready || !current.sources.some(source => source.status === "pending") || current.status === "completed"} onClick={() => void controller.prepare({ action: "gather" })}>Gather primary sources</Button>
    {state.sources.map(source => <Card key={source.id}><section className="reference-section"><h3>{source.title}</h3><a href={source.url} target="_blank" rel="noreferrer">Read primary source</a><p>{source.status}</p>
      {source.text && <pre className="reference-text" tabIndex={0} aria-label={"Complete source: " + source.title}>{source.text}</pre>}{source.error && <p>{source.error}</p>}
      {current.sources.some(item => item.id === source.id && item.status === "failed") && current.status !== "completed" && <Button disabled={controller.busy || !controller.ready} onClick={() => void controller.prepare({ action: "retry", sourceId: source.id })}>Retry {source.title}</Button>}
    </section></Card>)}
    {current.status !== "completed" ? <form className="reference-form" aria-label="Research decision" onSubmit={event => { event.preventDefault(); void controller.prepare({ action: "decide", conclusion }); }}><fieldset disabled={controller.busy || !controller.ready || !current.sources.some(source => source.status === "succeeded")}><legend>Write the reviewed final decision</legend>
      <label>Decision<textarea aria-label="Research conclusion" required minLength={20} maxLength={10000} value={conclusion} onChange={event => { setConclusion(event.currentTarget.value); controller.clearReview(); }} /></label><Button type="submit">Review final decision</Button></fieldset></form> : <Card><section className="reference-section"><h2>Saved final decision</h2><p className="reference-text">{current.conclusion}</p></section></Card>}
  </>}</WorkflowFrame>;
}
export function App() { const [adapter] = useState(() => new OfficialMCPAdapter()); return <AgentAppProvider adapter={adapter}><ResearchReview /></AgentAppProvider>; }

"use client";
import { useEffect, useRef, useState } from "react";
import { AgentAppProvider, OfficialMCPAdapter } from "@mcpcn/runtime";
import { Button, Card } from "@mcpcn/react";
import { WorkflowFrame, useReferenceWorkflow } from "@mcpcn/reference-workflows/client";
import { DocumentStateSchema, documentSeed, type DocumentKindSchema } from "./contracts.js";
import type { z } from "zod";
export { extractAuthoredInvoiceFields } from "./contracts.js";
export const fixture = documentSeed;
function DocumentReview() {
  const controller = useReferenceWorkflow("document-extraction", DocumentStateSchema), [file, setFile] = useState<File | null>(null), [kind, setKind] = useState<z.infer<typeof DocumentKindSchema>>("invoice"), [error, setError] = useState<string>(), [reading, setReading] = useState(false);
  const epoch = useRef(0), live = useRef(false), selected = useRef<File | null>(null);
  const [values, setValues] = useState<Record<string, string>>({}), state = controller.view?.state, revision = controller.view?.revision;
  useEffect(() => { live.current = true; return () => { live.current = false; epoch.current++; }; }, []);
  useEffect(() => { if (state) setValues(Object.fromEntries(state.fields.map(field => [field.id, field.value]))); }, [revision]);
  const extract = async () => {
    const chosen = selected.current; if (!chosen || reading || controller.busy || !controller.view) return;
    const generation = ++epoch.current; setReading(true); setError(undefined);
    try {
      if (chosen.size > 65536 || !/\.(txt|md)$/i.test(chosen.name)) throw new Error("invalid_file");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await chosen.arrayBuffer());
      if (!live.current || generation !== epoch.current || selected.current !== chosen) return;
      await controller.prepare({ action: "extract", kind, fileName: chosen.name, text });
    } catch { if (live.current && generation === epoch.current) setError("Choose a UTF-8 .txt or .md document no larger than 64 KiB."); }
    finally { if (live.current && generation === epoch.current) setReading(false); }
  };
  const visible = controller.view?.prepared?.action === "extract" ? controller.view.prepared.proposed : state;
  return <WorkflowFrame controller={controller} title="Document extraction review">
    <form className="reference-form" aria-label="Document source" onSubmit={event => { event.preventDefault(); void extract(); }}><fieldset disabled={controller.busy || reading || !controller.ready || !state}><legend>Choose an authored UTF-8 document</legend>
      <p>Invoice: Supplier:, Total:, Currency: lines. Contract: Party:, Effective date:, Term:. Resume: Name:, Email:, Experience:. Extract only on request; no OCR or model is connected. Saving requires a separate reviewed confirmation.</p>
      <label>Document kind<select aria-label="Document kind" value={kind} onChange={event => { epoch.current++; setReading(false); setKind(event.currentTarget.value as z.infer<typeof DocumentKindSchema>); controller.clearReview(); }}><option value="invoice">Invoice</option><option value="contract">Contract</option><option value="resume">Resume</option></select></label>
      <label>UTF-8 document<input type="file" aria-label="UTF-8 document" accept=".txt,.md,text/plain,text/markdown" onChange={event => { epoch.current++; const next = event.currentTarget.files?.[0] ?? null; selected.current = next; setFile(next); setError(undefined); setReading(false); controller.clearReview(); }} /></label>
      {error && <p role="alert">{error}</p>}<Button type="submit" disabled={!file}>Prepare text extraction</Button></fieldset></form>
    {visible && visible.status !== "empty" && <>
      <Card><section className="reference-section"><h2>Complete source text: {visible.fileName}</h2><pre className="reference-text" tabIndex={0} aria-label="Complete document text">{visible.text}</pre></section></Card>
      <Card><section className="reference-section"><h2>Extracted fields and source matches</h2>{visible.fields.map(field => <article key={field.id}><h3>{field.label}</h3><p>Current value: {field.value || "Missing"}</p><p>Extracted value: {field.original || "Missing"} · literal-line match confidence: {field.confidence}</p><blockquote>{field.source}</blockquote></article>)}</section></Card>
    </>}
    {state?.status === "extracted" && <form className="reference-form" aria-label="Correct extracted fields" onSubmit={event => { event.preventDefault(); void controller.prepare({ action: "save", fields: state.fields.map(field => ({ id: field.id, value: values[field.id] ?? "" })) }); }}>
      <fieldset disabled={controller.busy || !controller.ready}><legend>Review and correct before saving</legend>{state.fields.map(field => <label key={field.id}>{field.label}<input aria-label={"Correct " + field.label} required={field.required} maxLength={4000} value={values[field.id] ?? ""} onChange={event => { const value = event.currentTarget.value; setValues(current => ({ ...current, [field.id]: value })); controller.clearReview(); }} /></label>)}<Button type="submit">Review corrected fields</Button></fieldset></form>}
    {state?.status === "saved" && <p role="status">The corrected document fields are saved in the private local workspace.</p>}
  </WorkflowFrame>;
}
export function App() { const [adapter] = useState(() => new OfficialMCPAdapter()); return <AgentAppProvider adapter={adapter}><DocumentReview /></AgentAppProvider>; }

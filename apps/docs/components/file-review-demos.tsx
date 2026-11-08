"use client";

import { useEffect, useRef, useState } from "react";
import { DocumentPreview, FileReview, type ComponentAction } from "@mcpcn/react";
import type { DocumentPreviewData, FileReviewData } from "@mcpcn/schemas";
import { controlledData } from "../../playground/src/component-preview";
import { fileReviewExamples } from "./file-review-examples";

type Data = Record<string, unknown>;
const localPreview = (): DocumentPreviewData => {
  const value = structuredClone(fileReviewExamples["document-preview"]);
  if (value.state === "ready") { delete value.selectedPageId; delete value.selectedSourceId; }
  return value;
};

function FileDocumentDemo({ review }: { review: boolean }) {
  const [preview, setPreview] = useState<DocumentPreviewData>(localPreview);
  const [data, setData] = useState<FileReviewData>(() => ({ ...structuredClone(fileReviewExamples["file-review"]), preview: localPreview() }));
  const [last, setLast] = useState<ComponentAction | null>(null), [count, setCount] = useState(0), [settled, setSettled] = useState(0);
  const [response, setResponse] = useState("immediate"), [appended, setAppended] = useState(false), [revision, setRevision] = useState(1);
  const jobs = useRef(new Set<{ timer: ReturnType<typeof setTimeout>; resolve(): void }>());
  useEffect(() => () => { for (const job of jobs.current) { clearTimeout(job.timer); job.resolve(); } jobs.current.clear(); }, []);
  const receive = (action: ComponentAction): void | Promise<void> => {
    setLast(action); setCount(value => value + 1);
    if (review) setData(current => {
      const patch = controlledData("file-review", current as Data, action);
      return patch ? { ...current, ...patch } : current;
    });
    // Local navigation and controlled typing stay synchronous and keep focus.
    if (action.type !== "save-file-review" || response === "immediate") return;
    const captured = response;
    return new Promise<void>((resolve, reject) => {
      const job = { timer: setTimeout(() => {
        jobs.current.delete(job); setSettled(value => value + 1);
        if (captured === "reject") reject(new Error("Authored save refusal")); else resolve();
      }, 1500), resolve };
      jobs.current.add(job);
    });
  };
  const replace = () => {
    const next = revision + 1; setRevision(next); setAppended(false);
    const current = localPreview(), file = { ...current.file, revision: String(next) };
    const replacement = { ...current, file, title: "Replacement supplied document" };
    setPreview(replacement);
    setData(current => ({ ...current, file, preview: replacement, extraction: current.extraction ? { ...current.extraction, revision: String(next), fileRevision: file.revision, fields: current.extraction.fields.map(field => ({ ...field, value: field.original })) } : undefined }));
  };
  return <div className="mcpcn-stack">
    <label className="mcpcn-label">Consumer response<select aria-label="Consumer response" value={response} onChange={event => setResponse(event.currentTarget.value)}>
      <option value="immediate">Immediate</option><option value="delayed">Delayed</option><option value="reject">Reject</option>
    </select></label>
    {review ? <FileReview {...data} onAction={receive} /> : <DocumentPreview {...preview} onAction={receive} />}
    <div className="filter-row"><button type="button" className="button secondary" disabled={appended} onClick={() => {
      const append = (current: DocumentPreviewData): DocumentPreviewData => current.state === "ready" && current.content.type === "pages" ? { ...current, content: { ...current.content, pages: [...current.content.pages, { id: "appendix-3", label: "Additional appendix", text: "Unrelated authored appendix." }] } } : current;
      setPreview(append); setData(current => ({ ...current, preview: current.preview ? append(current.preview) : undefined })); setAppended(true);
    }}>Append unrelated page</button>
      <button type="button" className="button secondary" onClick={replace}>Replace file revision</button>
      {review && <button type="button" className="button secondary" onClick={() => setData(current => ({ ...current, extraction: current.extraction ? { ...current.extraction, revision: `${current.extraction.revision}-replacement`, fields: current.extraction.fields.map(field => ({ ...field, value: field.original })) } : undefined }))}>Replace extraction revision</button>}
    </div>
    <p className="mcpcn-hint">Authored representations and local consumer feedback only. The component does not read files, extract data or save records. Matching IDs do not verify original bytes.</p>
    <p>File review intents: <output aria-label="File review intent count">{count}</output> · Settled: <output aria-label="Settled callback count">{settled}</output></p>
    <pre className="code" aria-label="Last file review intent">{JSON.stringify(last, null, 2)}</pre>
  </div>;
}

export function DocumentPreviewDemo() { return <FileDocumentDemo review={false} />; }
export function FileReviewDemo() { return <FileDocumentDemo review />; }

"use client";

import { useEffect, useRef, useState } from "react";
import { FileReview, type ComponentAction } from "@mcpcn/react";
import { FileUploadAndExtract } from "@mcpcn/react/blocks";
import { FileReviewSchema, type FileReviewData, type ReviewFile } from "@mcpcn/schemas";

export const fixture: FileReviewData = { id: "invoice-review", title: "Review extracted invoice", file: null };

export function extractAuthoredInvoiceFields(text: string) {
  return { supplier: /^Supplier:[ \t]*(.*)$/mi.exec(text)?.[1] ?? "", total: /^Total:[ \t]*(.*)$/mi.exec(text)?.[1] ?? "" };
}

/** Consumer-owned local text adapter; no OCR, upload, model or database. */
export function App() {
  const [file, setFile] = useState<File | null>(null), currentFile = useRef<File | null>(null);
  const identities = useRef(new WeakMap<File, ReviewFile>());
  const generation = useRef(0);
  const [review, setReview] = useState<FileReviewData>(fixture), [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const [last, setLast] = useState<ComponentAction | null>(null);
  useEffect(() => () => { generation.current++; currentFile.current = null; }, []);
  const select = (next: File | null) => {
    generation.current++; currentFile.current = next; setFile(next); setBusy(false); setError(undefined); setLast(null);
    if (!next) { setReview(fixture); return; }
    let descriptor = identities.current.get(next);
    if (!descriptor) {
      descriptor = { id: crypto.randomUUID(), revision: "1", name: next.name, bytes: next.size, ...(next.type ? { mimeType: next.type } : {}) };
      identities.current.set(next, descriptor);
    }
    setReview({ ...fixture, file: descriptor });
  };
  const extract = async (chosen: File) => {
    const descriptor = identities.current.get(chosen);
    if (!descriptor || chosen !== currentFile.current) return;
    const request = ++generation.current;
    const current = () => chosen === currentFile.current && request === generation.current;
    setBusy(true); setError(undefined);
    try {
      // This explicit user action reads text in this example consumer only.
      const text = await chosen.text();
      if (!current()) return;
      if (text.length > 65536) throw new Error("The text representation exceeds 65536 characters.");
      const { supplier, total } = extractAuthoredInvoiceFields(text);
      const next = FileReviewSchema.safeParse({ ...fixture, file: descriptor,
        preview: { id: `preview-${descriptor.id}`, title: "Selected text representation", file: descriptor, state: "ready", content: { type: "text", text } },
        extraction: { id: `extraction-${descriptor.id}`, revision: "1", fileId: descriptor.id, fileRevision: descriptor.revision, fields: [
          { id: "supplier", label: "Supplier", original: supplier, value: supplier, required: true },
          { id: "total", label: "Total", original: total, value: total, required: true },
        ] },
      });
      if (!next.success) throw new Error("The file does not fit this bounded plain-text example.");
      setReview(next.data);
    } catch (value) { if (current()) setError(value instanceof Error ? value.message : "The local text could not be read."); }
    finally { if (current()) setBusy(false); }
  };
  const receive = (action: ComponentAction) => {
    setLast(action);
    const scope = action.data as { reviewId?: string; fileId?: string; fileRevision?: string; extractionId?: string; extractionRevision?: string; fieldId?: string; value?: string } | undefined;
    if (action.type !== "file-correction-change" || !scope) return;
    setReview(current => {
      if (scope.reviewId !== current.id || !current.file || !current.extraction || scope.fileId !== current.file.id || scope.fileRevision !== current.file.revision || scope.extractionId !== current.extraction.id || scope.extractionRevision !== current.extraction.revision || typeof scope.value !== "string") return current;
      return { ...current, extraction: { ...current.extraction, fields: current.extraction.fields.map(field => field.id === scope.fieldId && !field.disabled ? { ...field, value: scope.value! } : field) } };
    });
    // A save-file-review event is visible intent only. Integrate and validate
    // persistence separately before displaying any saved result.
  };
  return <div className="mcpcn mcpcn-stack">
    <p>Choose a small authored .txt file with Supplier: and Total: lines. Extract explicitly reads it locally and uses those two line patterns. No OCR, upload, model or saving service is connected.</p>
    <FileUploadAndExtract title="Choose authored invoice text" file={file} maxFileBytes={65536} accept=".txt,.md,text/plain,text/markdown" busy={busy} error={error} onFileChange={select} onExtract={chosen => { void extract(chosen); }} onFileError={setError} />
    <FileReview {...review} busy={busy} error={error} onAction={receive} />
    <pre aria-label="Last document extraction intent">{JSON.stringify(last, null, 2)}</pre>
  </div>;
}

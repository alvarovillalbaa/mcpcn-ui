"use client";

import { useEffect, useId, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  DocumentPreviewSchema, FileReviewSchema, reviewRasterDataUrl, sameReviewFile, stableReviewKey,
  type DocumentPreviewData, type ParsedDocumentPreviewData, type FileReviewData, type ParsedFileReviewData,
  type ParsedDocumentPage, type ParsedReviewFile, type ParsedReviewRasterImage, type ParsedFileExtraction,
  type DocumentViewIntent, type FileReviewIntent,
} from "@mcpcn/schemas";
import { Button, Card, InvalidPayload, Select } from "./primitives.js";
import { Feedback, useComponentAction } from "./component-helpers.js";
import { ExtractedFieldsReview } from "./decision-components.js";
import type { ComponentAction, ComponentProps } from "./component-types.js";

type UIProps = Pick<ComponentProps<unknown>, "className" | "onAction" | "busy" | "error">;
type ReadyPreview = Extract<ParsedDocumentPreviewData, { state: "ready" }>;
const ownData = <T extends object>({ className: _className, onAction: _onAction, busy: _busy, error: _error, ...data }: ComponentProps<T>) => data;
const identityOf = (data: ParsedDocumentPreviewData) => stableReviewKey({ id: data.id, fileId: data.file.id, fileRevision: data.file.revision });
const pagesOf = (data: ReadyPreview): ParsedDocumentPage[] => data.content.type === "pages" ? data.content.pages : [];
const fileClass = (className: string | undefined) => ["mcpcn-file-root", className].filter(Boolean).join(" ");

export interface FilePreviewViewState {
  identity: string; kind: string; localPageId?: string; localSourceId?: string;
  pageId?: string; pageKey?: string; sourceId?: string; sourceKey?: string; contentKey?: string;
  zoom: number | null; fence: number;
}

/** Reconcile actual view state without discarding it for an unrelated append. */
export function reconcileFilePreviewView(data: ReadyPreview, previous?: FilePreviewViewState): FilePreviewViewState {
  const identity = identityOf(data), fresh = !previous || previous.identity !== identity;
  const stored = fresh ? undefined : previous, pages = pagesOf(data);
  const oldPage = pages.find(page => page.id === stored?.pageId), oldSource = data.sources.find(source => source.id === stored?.sourceId);
  const pageReplaced = Boolean(stored?.pageId && stableReviewKey(oldPage ?? null) !== stored.pageKey);
  const sourceReplaced = Boolean(stored?.sourceId && stableReviewKey(oldSource ?? null) !== stored.sourceKey);
  const contentKey = data.content.type === "pages" ? undefined : stableReviewKey(data.content);
  const contentReplaced = Boolean(stored && (stored.kind !== data.content.type || stored.contentKey !== contentKey));
  const localPageId = data.selectedPageId ?? (pages.some(page => page.id === stored?.localPageId) ? stored?.localPageId : pages[0]?.id);
  const localSourceId = data.selectedSourceId ?? (!pageReplaced && !sourceReplaced && !contentReplaced
    && data.sources.some(source => source.id === stored?.localSourceId) ? stored?.localSourceId : undefined);
  const pageId = data.selectedPageId ?? localPageId, sourceId = data.selectedSourceId ?? localSourceId;
  const page = pages.find(item => item.id === pageId), source = data.sources.find(item => item.id === sourceId);
  const replaced = pageReplaced || sourceReplaced || contentReplaced;
  const next: FilePreviewViewState = { identity, kind: data.content.type, localPageId, localSourceId, pageId, sourceId,
    pageKey: page ? stableReviewKey(page) : undefined, sourceKey: source ? stableReviewKey(source) : undefined, contentKey,
    zoom: !stored || pageReplaced || contentReplaced || stored.pageId !== pageId ? null : stored.zoom,
    fence: stored ? stored.fence + (replaced ? 1 : 0) : 0 };
  return stored && (Object.keys(next) as Array<keyof FilePreviewViewState>).every(key => next[key] === stored[key]) ? stored : next;
}

function FileDetails({ file }: { file: ParsedReviewFile }) {
  return <dl className="mcpcn-file-details" aria-label="Reported file details">
    <div><dt>File name</dt><dd>{file.name}</dd></div><div><dt>File ID</dt><dd>{file.id}</dd></div>
    <div><dt>Revision</dt><dd>{file.revision}</dd></div><div><dt>Reported bytes</dt><dd>{file.bytes}</dd></div>
    <div><dt>MIME hint</dt><dd>{file.mimeType === undefined ? "Not supplied" : file.mimeType}</dd></div>
  </dl>;
}
function Header({ title, description }: { title: string; description?: string }) {
  return <header className="mcpcn-header"><h3 className="mcpcn-title">{title}</h3>{description !== undefined && <p className="mcpcn-description">{description}</p>}</header>;
}

export function DocumentPreview(props: ComponentProps<DocumentPreviewData>) {
  const parsed = DocumentPreviewSchema.safeParse(ownData(props));
  if (!parsed.success) return <InvalidPayload title="Document preview is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  const data = parsed.data;
  if (data.state === "ready") return <ReadyPreviewState key={identityOf(data)} data={data} className={props.className} onAction={props.onAction} busy={props.busy} error={props.error} />;
  return <Card className={fileClass(props.className)} role="region" aria-label={data.title} aria-busy={Boolean(props.busy)}>
    <Header {...data} /><div className="mcpcn-body mcpcn-stack"><FileDetails file={data.file} />
      {data.state === "loading" && <p role="status">Document preview is loading.</p>}
      {data.state === "empty" && <p role="status">No document content was supplied.</p>}
      {data.state === "unsupported" && <p role="status">This document representation is unsupported.</p>}
      {data.message !== undefined && <p role={data.state === "error" ? "alert" : undefined}>{data.message}</p>}
      <p className="mcpcn-hint">This supplied representation does not verify the original file.</p><Feedback busy={props.busy} error={props.error} />
    </div></Card>;
}
function ReadyPreviewState({ data, ...props }: UIProps & { data: ReadyPreview }) {
  const [stored, setStored] = useState(() => reconcileFilePreviewView(data));
  const state = reconcileFilePreviewView(data, stored);
  if (state !== stored) setStored(state);
  return <ReadyPreviewBody key={state.fence} data={data} state={state} setState={setStored} {...props} />;
}
function RasterPage({ image, zoom }: { image: ParsedReviewRasterImage; zoom: number | null }) {
  const [failed, setFailed] = useState(false), url = useMemo(() => reviewRasterDataUrl(image), [image]);
  return <>{failed || url === undefined ? <p className="mcpcn-error" role="alert">The supplied page image could not be decoded.</p>
    : <img className="mcpcn-file-image" src={url} alt={image.alt} width={image.width} height={image.height}
      style={zoom === null ? undefined : { width: image.width * zoom, maxWidth: "none" }} onError={() => setFailed(true)} />}</>;
}
function ReadyPreviewBody({ data, state, setState, ...props }: UIProps & {
  data: ReadyPreview; state: FilePreviewViewState; setState: Dispatch<SetStateAction<FilePreviewViewState>>;
}) {
  const viewportId = useId(), action = useComponentAction(props.onAction, props.busy), pages = pagesOf(data);
  const index = pages.findIndex(page => page.id === state.pageId), page = pages[index];
  const pageBlocked = (data.selectedPageId !== undefined && !props.onAction) || Boolean(props.onAction && action.busy);
  const sourceBlocked = (data.selectedSourceId !== undefined && !props.onAction) || Boolean(props.onAction && action.busy);
  const scope = { previewId: data.id, fileId: data.file.id, fileRevision: data.file.revision };
  const emit = (intent: DocumentViewIntent) => { if (props.onAction) action.send(intent); };
  const selectPage = (pageId: string) => {
    if (pageBlocked || !pages.some(item => item.id === pageId)) return;
    if (data.selectedPageId === undefined) setState(current => ({ ...current, localPageId: pageId }));
    emit({ type: "document-page-change", data: { ...scope, pageId } });
  };
  const selectSource = (sourceId: string) => {
    const source = data.sources.find(item => item.id === sourceId);
    if (!source || sourceBlocked) return;
    if (data.selectedSourceId === undefined || source.pageId && data.selectedPageId === undefined) setState(current => ({ ...current,
      ...(data.selectedSourceId === undefined ? { localSourceId: sourceId } : {}),
      ...(source.pageId && data.selectedPageId === undefined ? { localPageId: source.pageId } : {}) }));
    emit({ type: "document-source-change", data: { ...scope, sourceId, ...(source.pageId === undefined ? {} : { pageId: source.pageId }) } });
  };
  const zoom = (value: number | null) => setState(current => ({ ...current, zoom: value }));
  return <Card className={fileClass(props.className)} role="region" aria-label={data.title} aria-busy={action.busy}>
    <Header {...data} /><div className="mcpcn-body mcpcn-stack"><FileDetails file={data.file} />
      <p className="mcpcn-hint">This supplied representation does not verify the original file.</p>{data.message !== undefined && <p>{data.message}</p>}
      {data.content.type === "pages" && <nav className="mcpcn-row" aria-label="Document page navigation">
        <Button type="button" data-variant="secondary" disabled={pageBlocked || index <= 0} onClick={() => { const previous = pages[index - 1]; if (previous) selectPage(previous.id); }}>Previous page</Button>
        <label className="mcpcn-label">Document page<Select aria-label="Document page" value={state.pageId ?? ""} disabled={pageBlocked} onChange={event => selectPage(event.currentTarget.value)}>
          {pages.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</Select></label>
        <Button type="button" data-variant="secondary" disabled={pageBlocked || index >= pages.length - 1} onClick={() => { const next = pages[index + 1]; if (next) selectPage(next.id); }}>Next page</Button>
        <output role="status" aria-live="polite">Page {index + 1} of {pages.length}</output>
      </nav>}
      {page?.image && <div className="mcpcn-row" role="group" aria-label="Document image zoom">
        <Button type="button" data-variant="secondary" aria-pressed={state.zoom === null} onClick={() => zoom(null)}>Fit page</Button>
        <Button type="button" data-variant="secondary" aria-pressed={state.zoom === 1} onClick={() => zoom(1)}>Actual size</Button>
        <Button type="button" data-variant="secondary" disabled={state.zoom !== null && state.zoom <= 0.5} onClick={() => zoom(Math.max(0.5, (state.zoom ?? 1) - 0.25))}>Zoom out</Button>
        <Button type="button" data-variant="secondary" disabled={state.zoom !== null && state.zoom >= 3} onClick={() => zoom(Math.min(3, (state.zoom ?? 1) + 0.25))}>Zoom in</Button>
        <output aria-label="Document zoom" aria-live="polite">{state.zoom === null ? "Fit" : `${Math.round(state.zoom * 100)}%`}</output>
      </div>}
      <div id={viewportId} className="mcpcn-file-viewport" role="region" aria-label="Document content" tabIndex={0}>
        {data.content.type === "text" && <pre className="mcpcn-file-text">{data.content.text}</pre>}
        {data.content.type === "json" && <details open><summary>Document JSON</summary><pre className="mcpcn-code">{JSON.stringify(data.content.value, null, 2)}</pre></details>}
        {page && <article aria-label={page.label}><h4>{page.label}</h4>
          {page.image && <figure className="mcpcn-file-figure"><RasterPage key={stableReviewKey(page.image)} image={page.image} zoom={state.zoom} /><figcaption>{page.image.alt}</figcaption></figure>}
          {page.text !== undefined && <pre className="mcpcn-file-text">{page.text}</pre>}
        </article>}
      </div>
      {data.sources.length > 0 && <section aria-label="Document sources"><h4>Sources</h4><ol className="mcpcn-stack">
        {data.sources.map(source => <li key={source.id}><Button type="button" data-variant="secondary" aria-label={`Select source: ${source.label}`}
          aria-pressed={state.sourceId === source.id} aria-controls={source.pageId ? viewportId : undefined} disabled={sourceBlocked} onClick={() => selectSource(source.id)}>{source.label}</Button>
          {source.pageId && <p className="mcpcn-hint">Page: {pages.find(item => item.id === source.pageId)?.label}</p>}<blockquote className="mcpcn-file-text">{source.text}</blockquote>
        </li>)}</ol></section>}
      <Feedback busy={action.busy} error={props.error ?? action.error} />
    </div></Card>;
}

function previewTerms(preview: ParsedDocumentPreviewData | undefined) {
  if (preview?.state !== "ready") return preview;
  const { selectedPageId: _page, selectedSourceId: _source, ...terms } = preview;
  return terms;
}
/** Current review terms include supplied values and provenance, never view selection. */
export function fileReviewTermsKey(data: ParsedFileReviewData): string {
  return stableReviewKey({ ...data, preview: previewTerms(data.preview) });
}
function fieldValues(extraction: ParsedFileExtraction): Record<string, string> {
  return Object.fromEntries(extraction.fields.map(field => [field.id, field.value]));
}
const completeExtraction = (extraction: ParsedFileExtraction) => extraction.fields.length > 0 && extraction.fields.every(field => !field.required || Boolean(field.value.trim()));
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export function FileReview(props: ComponentProps<FileReviewData>) {
  const parsed = FileReviewSchema.safeParse(ownData(props));
  if (!parsed.success) return <InvalidPayload title="File review is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <FileReviewContent data={parsed.data} className={props.className} onAction={props.onAction} busy={props.busy} error={props.error} />;
}
function FileReviewContent({ data, ...props }: UIProps & { data: ParsedFileReviewData }) {
  const terms = fileReviewTermsKey(data), [stored, setStored] = useState({ terms, reviewed: false, count: 0 });
  const [saving, setSaving] = useState({ terms, pending: false }), liveTerms = useRef(terms), savingRef = useRef(false);
  const acknowledgement = stored.terms === terms ? stored : { terms, reviewed: false, count: 0 };
  if (acknowledgement !== stored) setStored(acknowledgement);
  if (liveTerms.current !== terms) { liveTerms.current = terms; savingRef.current = false; }
  const saveBusy = saving.terms === terms && saving.pending;
  const pending = (value: boolean) => {
    if (liveTerms.current !== terms) return;
    savingRef.current = value;
    setSaving(current => current.terms === terms && current.pending === value ? current : { terms, pending: value });
  };
  const file = data.file, extraction = data.extraction, preview = data.preview;
  const previewMatches = Boolean(file && preview && sameReviewFile(file, preview.file));
  const extractionMatches = Boolean(file && extraction && extraction.fileId === file.id && extraction.fileRevision === file.revision);
  const matching = Boolean(previewMatches && preview?.state === "ready" && extractionMatches);
  const ready = Boolean(matching && extraction && completeExtraction(extraction));
  const childTerms = stableReviewKey({ id: data.id, file, preview: previewTerms(preview), extraction: extraction && {
    ...extraction, fields: extraction.fields.map(({ value: _value, ...field }) => field) } });
  const reviewed = () => {
    if (savingRef.current || !ready || data.disabled || props.busy || !props.onAction) return;
    setStored(current => ({ terms, reviewed: true, count: current.terms === terms ? current.count + 1 : 1 }));
  };
  const correction = () => setStored(current => ({ terms, reviewed: false, count: current.terms === terms ? current.count + 1 : 1 }));
  return <Card className={fileClass(props.className)} role="region" aria-label={data.title} aria-busy={Boolean(props.busy || saveBusy)}>
    <Header {...data} /><div className="mcpcn-body mcpcn-stack">
      {!file ? <p role="status">No file was supplied for review.</p> : <><FileDetails file={file} />
        {preview ? previewMatches ? <DocumentPreview {...preview} onAction={props.onAction} />
          : <p className="mcpcn-error" role="alert">The supplied preview does not match the current file descriptor.</p>
          : <p role="status">No document preview was supplied.</p>}
        {extraction ? extractionMatches ? <ExtractionEditor key={childTerms} extraction={extraction} file={file} reviewId={data.id}
          onAction={props.onAction} disabled={data.disabled || !matching} busy={Boolean(props.busy || saveBusy)} onReview={reviewed} onCorrection={correction} />
          : <p className="mcpcn-error" role="alert">The supplied extraction does not match the current file revision.</p>
          : <p role="status">No extraction was supplied.</p>}
        {previewMatches && preview?.state !== "ready" && <p role="status">A matching ready preview is required before reviewing these values.</p>}
        <SaveReviewedFile key={terms} data={data} file={file} extraction={extractionMatches ? extraction : undefined} available={ready}
          reviewed={acknowledgement.reviewed} reviewCount={acknowledgement.count} onAction={props.onAction} busy={props.busy} onPending={pending} />
      </>}
      <Feedback error={props.error} />
    </div></Card>;
}
function ExtractionEditor({ extraction, file, reviewId, disabled, busy, onAction, onReview, onCorrection }: UIProps & {
  extraction: ParsedFileExtraction; file: ParsedReviewFile; reviewId: string; disabled: boolean;
  onReview: () => void; onCorrection: () => void;
}) {
  const childId = useId(), blocked = disabled || busy || !onAction;
  const scope = { reviewId, fileId: file.id, fileRevision: file.revision, extractionId: extraction.id, extractionRevision: extraction.revision };
  const receive = (intent: ComponentAction) => {
    if (blocked || !record(intent.data)) return;
    const incoming = intent.data, fieldId = incoming.fieldId, value = incoming.value;
    if (intent.type === "correction-change" && typeof fieldId === "string" && typeof value === "string") {
      const field = extraction.fields.find(item => item.id === fieldId);
      if (!field || field.disabled || value.length > 4000) return;
      onCorrection();
      const wrapped: FileReviewIntent = { type: "file-correction-change", data: { ...scope, fieldId: field.id, value } };
      return onAction?.(wrapped);
    }
    if (intent.type === "submit" && completeExtraction(extraction) && record(incoming.values)
      && stableReviewKey(incoming.values) === stableReviewKey(fieldValues(extraction))) onReview();
  };
  return <ExtractedFieldsReview id={childId} title="Review extracted fields" fields={extraction.fields}
    submitLabel="Review current corrections" disabled={Boolean(blocked)} busy={busy} onAction={receive} />;
}
function SaveReviewedFile({ data, file, extraction, available, reviewed, reviewCount, onPending, ...props }: UIProps & {
  data: ParsedFileReviewData; file: ParsedReviewFile; extraction?: ParsedFileExtraction; available: boolean;
  reviewed: boolean; reviewCount: number; onPending: (value: boolean) => void;
}) {
  const [consent, setConsent] = useState({ count: reviewCount, checked: false }), heading = useRef<HTMLHeadingElement>(null), mounted = useRef(true);
  const checked = consent.count === reviewCount && consent.checked;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (reviewed) heading.current?.focus(); }, [reviewed, reviewCount]);
  const tracked = (intent: ComponentAction) => {
    onPending(true);
    try {
      const result: unknown = props.onAction?.(intent);
      if (result && typeof (result as PromiseLike<unknown>).then === "function") return Promise.resolve(result).finally(() => { if (mounted.current) onPending(false); });
      onPending(false); return result;
    } catch (error) { onPending(false); throw error; }
  };
  const action = useComponentAction(props.onAction ? tracked : undefined, props.busy);
  const blocked = data.disabled || action.busy || !props.onAction || !available || !extraction || !reviewed || !checked;
  return <section className="mcpcn-file-save mcpcn-stack" aria-label="Save reviewed file values" aria-busy={action.busy}>
    {reviewed ? <><h4 tabIndex={-1} ref={heading}>Confirm reviewed file values</h4>
      <label className="mcpcn-row"><input type="checkbox" checked={checked} disabled={data.disabled || action.busy || !available || !props.onAction}
        onChange={event => setConsent({ count: reviewCount, checked: event.currentTarget.checked })} />{data.confirmationLabel}</label></>
      : <p role="status">Review current corrections before confirming these file values.</p>}
    <Button type="button" disabled={Boolean(blocked)} onClick={() => {
      if (blocked || !extraction) return;
      const intent: FileReviewIntent = { type: "save-file-review", data: { reviewId: data.id, fileId: file.id, fileRevision: file.revision,
        extractionId: extraction.id, extractionRevision: extraction.revision, values: fieldValues(extraction) } };
      action.send(intent);
    }}>{data.confirmLabel}</Button>
    <Feedback busy={action.busy} error={action.error} />
  </section>;
}

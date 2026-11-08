// Actual SSR and state-reconciliation contracts. Browser interaction is a separate packet.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DocumentPreviewSchema, FileReviewSchema,
  type DocumentPreviewData, type DocumentPage, type FileReviewData, type ParsedDocumentPreviewData,
} from "@mcpcn/schemas";
import { DocumentPreview, FileReview, fileReviewTermsKey, reconcileFilePreviewView } from "./file-review-components.js";
import * as publicComponents from "./index.js";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQVDL+DwACFAFmBODefwAAAABJRU5ErkJggg==";
const image = { mimeType: "image/png" as const, base64: png, width: 1, height: 1, alt: "Authored page image" };
const file = { id: "file-authored", revision: "revision-1", name: "Authored invoice.txt", bytes: 0, mimeType: "text/plain" };
type Ready = Extract<ParsedDocumentPreviewData, { state: "ready" }>;
type ReadyInput = Extract<DocumentPreviewData, { state: "ready" }>;
const pageRows: DocumentPage[] = [
  { id: "page-1", label: "First authored page", text: "First full page\nwith an authored final line.", image },
  { id: "page-2", label: "Second authored page", text: "Second complete page", image: { ...image, alt: "Second authored page image" } },
];
const sources = [{ id: "source-1", label: "First authored source", text: "First complete evidence snippet.", pageId: "page-1" },
  { id: "source-2", label: "Second authored source", text: "Second complete evidence snippet.", pageId: "page-2" }];
const paged: ReadyInput = { id: "preview-authored", title: "Review the supplied document", file, state: "ready", content: { type: "pages", pages: pageRows }, sources };
const review: FileReviewData = { id: "review-authored", title: "Review the authored file", file, preview: paged,
  extraction: { id: "extraction-authored", revision: "extraction-1", fileId: file.id, fileRevision: file.revision, fields: [
    { id: "amount", label: "Amount", original: "Original amount", value: "Reviewed amount", required: true, confidence: 0,
      evidence: [{ id: "evidence-1", label: "Authored evidence", text: "Full extracted evidence", url: "https://example.invalid/authored" }] },
    { id: "notes", label: "Notes", original: "Original notes", value: "", disabled: true },
  ] } };
const callback = () => undefined;
const render = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);
function attributes(html: string, label: string) {
  const found = [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/g)].find(row => row[2] === label);
  expect(found, `Expected button ${label}`).toBeDefined();
  return found?.[1] ?? "";
}
function parsedReady(data: DocumentPreviewData): Ready {
  const value = DocumentPreviewSchema.parse(data);
  if (value.state !== "ready") throw new Error("Authored fixture must be ready");
  return value;
}
function selectedState() {
  const data = parsedReady(paged), initial = reconcileFilePreviewView(data);
  return reconcileFilePreviewView(data, { ...initial, localPageId: "page-2", localSourceId: "source-2", zoom: 1.5 });
}

describe("document preview and file review", () => {
  it("exports both dedicated implementations while preserving other named APIs", () => {
    expect(publicComponents.DocumentPreview).toBe(DocumentPreview); expect(publicComponents.FileReview).toBe(FileReview);
    expect(DocumentPreview).not.toBe(publicComponents.GenericAgentComponent); expect(FileReview).not.toBe(publicComponents.GenericAgentComponent);
    expect(publicComponents.RecordInspector).toBe(publicComponents.GenericAgentComponent); expect(publicComponents.ExtractedFieldsReview).toBeTypeOf("function");
  });
  it("renders both named accessible regions and strips only the four UI props", () => {
    for (const html of [render(<DocumentPreview {...paged} onAction={callback} busy={false} error="Authored error" className="authored-class" />),
      render(<FileReview {...review} onAction={callback} busy={false} error="Authored error" className="authored-class" />)]) {
      expect(html).toContain('role="region"'); expect(html).toContain("authored-class"); expect(html).toContain("Authored error"); expect(html).not.toContain("is invalid");
    }
  });
  it("refuses unsupported DTO fields and stale page selections before mounting content", () => {
    for (const data of [{ ...paged, unknown: true }, { ...paged, selectedPageId: "foreign-page" }, { ...paged, content: { type: "html", html: "<script>authored()</script>" } }]) {
      const html = render(<DocumentPreview {...data as DocumentPreviewData} />);
      expect(html).toContain("Document preview is invalid"); expect(html).toContain('role="alert"'); expect(html).not.toContain("<img");
    }
    expect(render(<FileReview {...{ ...review, unknown: true } as FileReviewData} />)).toContain("File review is invalid");
  });
  it("displays complete escaped text with whitespace and a final supplied marker", () => {
    const text = "Authored first line\n" + "x".repeat(12000) + "\n<script>authored()</script>\nAuthored final marker";
    const html = render(<DocumentPreview {...paged} content={{ type: "text", text }} sources={[]} />);
    expect(html).toContain("x".repeat(12000)); expect(html).toContain("Authored final marker"); expect(html).toContain("Authored first line\n");
    expect(html).toContain("&lt;script&gt;authored()&lt;/script&gt;"); expect(html).not.toContain("<script>"); expect(html).not.toContain("[object Object]");
  });
  it("inspects complete JSON including zero false null empty and fields beyond the third", () => {
    for (const value of [0, false, null, "", { first: 0, second: false, third: null, fourth: { nested: [0, false, null, ""] } }]) {
      const html = render(<DocumentPreview {...paged} content={{ type: "json", value }} sources={[]} />);
      expect(html).toContain("<summary>Document JSON</summary>"); expect(html).toContain("<details open"); expect(html).not.toContain("is invalid");
      if (typeof value === "object" && value !== null) { expect(html).toContain("&quot;fourth&quot;"); expect(html).toContain("&quot;nested&quot;"); }
    }
  });
  it("keeps loading empty error and unsupported representations explicit", () => {
    for (const [state, message, expected] of [
      ["loading", "Authored loading detail", "Document preview is loading."], ["empty", "Authored empty detail", "No document content was supplied."],
      ["error", "Authored decoding refusal", "Authored decoding refusal"], ["unsupported", "Authored unsupported MIME", "This document representation is unsupported."],
    ] as const) {
      const html = render(<DocumentPreview id="state" title="Reported state" file={file} state={state} message={message} />);
      expect(html).toContain(expected); expect(html).toContain(message); expect(html).not.toContain('aria-label="Document page"'); expect(html).not.toContain("<img");
      if (state === "error") expect(html).toContain('role="alert"');
    }
  });
  it("shows the full consumer-reported descriptor including a zero byte count", () => {
    const html = render(<DocumentPreview {...paged} file={{ ...file, name: "<b>Authored file</b>" }} />);
    expect(html).toContain('aria-label="Reported file details"'); expect(html).toContain("&lt;b&gt;Authored file&lt;/b&gt;");
    expect(html).toContain("Reported bytes</dt><dd>0</dd>"); expect(html).toContain("revision-1"); expect(html).toContain("text/plain"); expect(html).toContain("does not verify the original file");
    expect(render(<DocumentPreview {...paged} file={{ ...file, mimeType: undefined }} />)).toContain("MIME hint</dt><dd>Not supplied</dd>");
  });
  it("mounts only the selected page image and its complete independent page text", () => {
    const html = render(<DocumentPreview {...paged} selectedPageId="page-2" />);
    expect((html.match(/<img\b/g) ?? []).length).toBe(1); expect(html).toContain('alt="Second authored page image"');
    expect(html).toContain("Second complete page"); expect(html).not.toContain("First full page"); expect(html).toContain("Page 2 of 2");
    expect(html).toContain('src="data:image/png;base64,'); expect(html).not.toContain("<iframe"); expect(html).not.toContain("<object");
  });
  it("defaults local navigation to the first page without requiring an action callback", () => {
    const html = render(<DocumentPreview {...paged} />);
    expect(html.indexOf("First authored page</option>")).toBeLessThan(html.indexOf("Second authored page</option>"));
    expect(html).toMatch(/<option value="page-1" selected="">/); expect(attributes(html, "Previous page")).toContain("disabled");
    expect(attributes(html, "Next page")).not.toContain("disabled"); expect(html).toContain("First full page\nwith an authored final line.");
  });
  it("keeps controlled navigation unavailable without a consumer while local controls remain usable", () => {
    const html = render(<DocumentPreview {...paged} selectedPageId="page-1" selectedSourceId="source-1" />);
    expect(attributes(html, "Next page")).toContain("disabled"); expect(html).toMatch(/<select[^>]*aria-label="Document page"[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*aria-label="Select source: First authored source"[^>]*disabled=""/);
    const withCallback = render(<DocumentPreview {...paged} selectedPageId="page-1" onAction={callback} />);
    expect(attributes(withCallback, "Next page")).not.toContain("disabled");
  });
  it("renders full source snippets with selected state and an explicit current-page association", () => {
    const html = render(<DocumentPreview {...paged} selectedSourceId="source-2" onAction={callback} />);
    expect(html).toContain("First complete evidence snippet."); expect(html).toContain("Second complete evidence snippet.");
    expect(html).toMatch(/aria-label="Select source: Second authored source"[^>]*aria-pressed="true"/);
    expect(html).toContain("Page: Second authored page"); expect(html).not.toContain("href=");
  });
  it("provides a focusable scroll region and explicit native fit and zoom controls", () => {
    const html = render(<DocumentPreview {...paged} />);
    expect(html).toMatch(/class="mcpcn-file-viewport"[^>]*role="region"[^>]*aria-label="Document content"[^>]*tabindex="0"/);
    for (const label of ["Fit page", "Actual size", "Zoom in", "Zoom out"]) expect(attributes(html, label)).not.toContain("disabled");
    expect(attributes(html, "Fit page")).toContain('aria-pressed="true"'); expect(html).toContain('aria-label="Document zoom"'); expect(html).toContain(">Fit</output>");
  });
  it("keeps supplied text alongside header-validated bytes without claiming browser decode success", () => {
    const headerOnly = Buffer.from(png, "base64").subarray(0, 33).toString("base64");
    const html = render(<DocumentPreview {...paged} content={{ type: "pages", pages: [{ id: "header", label: "Header-only authored representation", text: "Independent text remains supplied", image: { ...image, base64: headerOnly } }] }} sources={[]} />);
    expect(html).toContain("Independent text remains supplied"); expect(html).toContain("<img"); expect(html).toContain("does not verify the original file"); expect(html).not.toContain("verified original");
  });
  it("preserves the actual local page source zoom and pending fence across unrelated appends", () => {
    const data = parsedReady(paged), selected = selectedState(), zoomed = { ...selected, zoom: 1.5 };
    const appended = parsedReady({ ...paged, content: { type: "pages", pages: [...pageRows, { id: "page-3", label: "Unrelated appended page", text: "Additional complete page" }] },
      sources: [...sources, { id: "source-3", label: "Unrelated appended source", text: "Additional source" }] });
    expect(reconcileFilePreviewView(data, zoomed)).toBe(zoomed); expect(reconcileFilePreviewView(appended, zoomed)).toBe(zoomed);
  });
  it("resets relevant local state and fences feedback when the current page is replaced", () => {
    const selected = { ...selectedState(), zoom: 2 };
    const replaced = parsedReady({ ...paged, content: { type: "pages", pages: [pageRows[0]!, { ...pageRows[1]!, text: "Replacement current content" }] } });
    const next = reconcileFilePreviewView(replaced, selected);
    expect(next.pageId).toBe("page-2"); expect(next.zoom).toBeNull(); expect(next.sourceId).toBeUndefined(); expect(next.fence).toBe(selected.fence + 1);
  });
  it("resets file revisions and source replacements without changing unrelated page content", () => {
    const selected = { ...selectedState(), zoom: 2 };
    const replacedSource = parsedReady({ ...paged, sources: [sources[0]!, { ...sources[1]!, text: "Replacement source text" }] });
    const sourceState = reconcileFilePreviewView(replacedSource, selected);
    expect(sourceState.pageId).toBe("page-2"); expect(sourceState.zoom).toBe(2); expect(sourceState.sourceId).toBeUndefined(); expect(sourceState.fence).toBe(selected.fence + 1);
    const fileState = reconcileFilePreviewView(parsedReady({ ...paged, file: { ...file, revision: "revision-2" } }), selected);
    expect(fileState.pageId).toBe("page-1"); expect(fileState.sourceId).toBeUndefined(); expect(fileState.zoom).toBeNull();
  });
  it("composes current extracted originals confidence evidence and caller-controlled correction values", () => {
    const html = render(<FileReview {...review} onAction={callback} />);
    expect(html).toContain('<form aria-label="Review extracted fields"'); expect(html).toContain("Original amount"); expect(html).toContain("Reviewed amount");
    expect(html).toContain("0% confidence"); expect(html).toContain("Full extracted evidence"); expect(html).toContain('href="https://example.invalid/authored"');
    expect(attributes(html, "Review current corrections")).not.toContain("disabled"); expect(attributes(html, "Save reviewed fields")).toContain("disabled"); expect(html).not.toContain('type="checkbox"');
  });
  it("keeps missing files previews and extractions visible without offering a save", () => {
    expect(render(<FileReview id="empty" title="No file" file={null} />)).toContain("No file was supplied for review.");
    const html = render(<FileReview id="missing" title="Missing representations" file={file} onAction={callback} />);
    expect(html).toContain("No document preview was supplied."); expect(html).toContain("No extraction was supplied."); expect(attributes(html, "Save reviewed fields")).toContain("disabled");
    const empty = render(<FileReview {...review} extraction={{ id: "empty", revision: "one", fileId: file.id, fileRevision: file.revision, fields: [] }} onAction={callback} />);
    expect(empty).toContain("No extracted fields to review."); expect(attributes(empty, "Save reviewed fields")).toContain("disabled");
  });
  it("leaves required blank corrections editable while refusing local review and save", () => {
    const html = render(<FileReview {...review} extraction={{ id: "blank", revision: "one", fileId: file.id, fileRevision: file.revision,
      fields: [{ id: "required", label: "Required correction", original: "Authored original", value: "", required: true }] }} onAction={callback} />);
    expect(html).toMatch(/<input[^>]*aria-label="Correct Required correction"[^>]*required=""/); expect(html).not.toMatch(/<input[^>]*aria-label="Correct Required correction"[^>]*disabled=""/);
    expect(attributes(html, "Review current corrections")).toContain("disabled"); expect(attributes(html, "Save reviewed fields")).toContain("disabled");
  });
  it("hides foreign preview content and extraction fields using complete descriptor and revision binding", () => {
    const foreignPreview = { ...paged, file: { ...file, name: "Different reported descriptor" }, content: { type: "text" as const, text: "FOREIGN PREVIEW CANARY" }, sources: [] };
    const html = render(<FileReview {...review} preview={foreignPreview} extraction={{ id: "foreign", revision: "one", fileId: file.id, fileRevision: "foreign-revision", fields: [{ id: "foreign", label: "FOREIGN FIELD CANARY", original: "Foreign", value: "Foreign" }] }} onAction={callback} />);
    expect(html).toContain("preview does not match the current file descriptor"); expect(html).toContain("extraction does not match the current file revision");
    expect(html).not.toContain("FOREIGN PREVIEW CANARY"); expect(html).not.toContain("FOREIGN FIELD CANARY"); expect(attributes(html, "Save reviewed fields")).toContain("disabled");
  });
  it("binds meaningful review terms and corrected values while excluding view-only selection", () => {
    const data = FileReviewSchema.parse(review), key = fileReviewTermsKey(data);
    const selected = FileReviewSchema.parse({ ...review, preview: { ...paged, selectedPageId: "page-2", selectedSourceId: "source-2" } });
    expect(fileReviewTermsKey(selected)).toBe(key);
    for (const patch of [{ title: "Changed review title" }, { description: "Changed explanation" }, { disabled: true },
      { confirmLabel: "Changed save terms" }, { confirmationLabel: "Changed consent terms" }, { file: { ...file, bytes: 1 } }]) {
      expect(fileReviewTermsKey(FileReviewSchema.parse({ ...review, ...patch }))).not.toBe(key);
    }
    const extraction = data.extraction;
    if (!extraction) throw new Error("Authored extraction is required");
    expect(fileReviewTermsKey(FileReviewSchema.parse({ ...review, extraction: { ...extraction, fields: extraction.fields.map(field => ({ ...field, value: "Changed correction" })) } }))).not.toBe(key);
    expect(fileReviewTermsKey(FileReviewSchema.parse({ ...review, extraction: { ...extraction, revision: "new-extraction" } }))).not.toBe(key);
  });
  it("disables editing and saving without a consumer or while externally blocked and never calls actions on render", () => {
    const callbackSpy = vi.fn();
    for (const props of [{}, { busy: true, onAction: callbackSpy }, { disabled: true, onAction: callbackSpy }]) {
      const html = render(<FileReview {...review} {...props} />);
      expect(html).toMatch(/<input[^>]*aria-label="Correct Amount"[^>]*disabled=""/); expect(attributes(html, "Save reviewed fields")).toContain("disabled");
    }
    render(<DocumentPreview {...paged} onAction={callbackSpy} />); expect(callbackSpy).not.toHaveBeenCalled();
  });
});

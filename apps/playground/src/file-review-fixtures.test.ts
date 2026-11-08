import { describe, expect, it } from "vitest";
import { schemaBySlug } from "@mcpcn/schemas";
import { controlledData } from "./component-preview";
import { makeFixture, playgroundItems, schemaFor, validateFixture } from "./fixtures";
import { authoredDocumentPreview, authoredFileReview } from "./file-review-fixtures";

const slugs = ["document-preview", "file-review"] as const;
const scope = { previewId: authoredDocumentPreview.id, fileId: authoredDocumentPreview.file.id, fileRevision: authoredDocumentPreview.file.revision };
const reviewScope = { reviewId: authoredFileReview.id, fileId: authoredFileReview.file.id, fileRevision: authoredFileReview.file.revision, extractionId: authoredFileReview.extraction.id, extractionRevision: authoredFileReview.extraction.revision };
const data = (slug: typeof slugs[number]) => makeFixture(slug).data as Record<string, unknown>;

describe("file review playground ownership", () => {
  it("keeps 79 identities and gives both former aliases dedicated strict fixtures", () => {
    expect(playgroundItems).toHaveLength(79);
    expect(playgroundItems.filter(item => item.kind === "specialized")).toHaveLength(33);
    expect(playgroundItems.filter(item => item.kind === "generic-alias")).toHaveLength(23);
    for (const slug of slugs) {
      expect(playgroundItems.find(item => item.slug === slug)?.kind).toBe("specialized");
      expect(validateFixture(makeFixture(slug)).success).toBe(true);
      expect(schemaBySlug[slug].safeParse(makeFixture(slug).data).success).toBe(true);
      const schema = schemaFor(slug);
      if (slug === "file-review") expect(schema).toMatchObject({ type: "object", additionalProperties: false });
      else {
        const variants = (schema as { oneOf?: unknown[]; anyOf?: unknown[] }).oneOf ?? (schema as { anyOf?: unknown[] }).anyOf;
        expect(variants).toHaveLength(5);
        for (const variant of variants!) expect(variant).toMatchObject({ type: "object", additionalProperties: false });
      }
    }
  });
  it("detaches fixtures and keeps compact representations inside the editor envelope", () => {
    for (const slug of slugs) {
      const first = makeFixture(slug), second = makeFixture(slug);
      expect(first).toEqual(second); expect(first.data).not.toBe(second.data);
      expect(new TextEncoder().encode(JSON.stringify(first)).byteLength).toBeLessThan(65536);
      const strings: string[] = [];
      JSON.stringify(first, (_key, value) => { if (typeof value === "string") strings.push(value); return value; });
      expect(strings.every(value => value.length <= 8192)).toBe(true);
    }
  });
  it("acknowledges only current controlled page navigation without echoing content", () => {
    const current = data("document-preview"), before = structuredClone(current);
    expect(controlledData("document-preview", current, { type: "document-page-change", data: { ...scope, pageId: "page-2" } })).toEqual({ selectedPageId: "page-2" });
    for (const patch of [{ previewId: "foreign" }, { fileId: "foreign" }, { fileRevision: "old" }, { pageId: "missing" }]) expect(controlledData("document-preview", current, { type: "document-page-change", data: { ...scope, pageId: "page-2", ...patch } })).toBeUndefined();
    expect(current).toEqual(before);
  });
  it("acknowledges a current source and its page as a single identity-only view patch", () => {
    const current = data("document-preview");
    expect(controlledData("document-preview", current, { type: "document-source-change", data: { ...scope, sourceId: "terms-source", pageId: "page-2" } })).toEqual({ selectedSourceId: "terms-source", selectedPageId: "page-2" });
    expect(controlledData("document-preview", current, { type: "document-source-change", data: { ...scope, sourceId: "missing" } })).toBeUndefined();
  });
  it("updates only current declared enabled corrections under exact file and extraction scope", () => {
    const current = data("file-review"), before = structuredClone(current);
    const patch = controlledData("file-review", current, { type: "file-correction-change", data: { ...reviewScope, fieldId: "supplier", value: "Reviewed supplier" } });
    expect(patch).toEqual({ extraction: { ...authoredFileReview.extraction, fields: authoredFileReview.extraction.fields.map(field => field.id === "supplier" ? { ...field, value: "Reviewed supplier" } : field) } });
    expect(current).toEqual(before);
    for (const wrong of [{ reviewId: "foreign" }, { fileId: "foreign" }, { fileRevision: "old" }, { extractionId: "foreign" }, { extractionRevision: "old" }, { fieldId: "missing" }, { value: 0 }, { value: "x".repeat(4001) }]) expect(controlledData("file-review", current, { type: "file-correction-change", data: { ...reviewScope, fieldId: "supplier", value: "Reviewed", ...wrong } })).toBeUndefined();
  });
  it("refuses stale extraction corrections and leaves saving consumer-owned", () => {
    const current = data("file-review");
    const stale = { ...current, extraction: { ...authoredFileReview.extraction, fileRevision: "old" } };
    expect(controlledData("file-review", stale, { type: "file-correction-change", data: { ...reviewScope, fieldId: "supplier", value: "Reviewed" } })).toBeUndefined();
    for (const patch of [{ disabled: true }, { preview: undefined }, { preview: { ...authoredDocumentPreview, file: { ...authoredDocumentPreview.file, name: "Another descriptor.txt" } } }]) expect(controlledData("file-review", { ...current, ...patch }, { type: "file-correction-change", data: { ...reviewScope, fieldId: "supplier", value: "Reviewed" } })).toBeUndefined();
    for (const value of [current, stale]) expect(controlledData("file-review", value, { type: "save-file-review", data: { ...reviewScope, values: { supplier: "Reviewed" } } })).toBeUndefined();
  });
  it("refuses generic cards malformed page selections and UI-only payload properties", () => {
    for (const slug of slugs) {
      expect(validateFixture({ kind: `mcpcn/${slug}`, version: 1, data: { title: "Generic", items: [] } }).success).toBe(false);
      for (const patch of [{ busy: true }, { onAction: "callback" }, { error: "UI feedback" }]) expect(validateFixture({ ...makeFixture(slug), data: { ...data(slug), ...patch } }).success).toBe(false);
    }
    expect(validateFixture({ ...makeFixture("document-preview"), data: { ...data("document-preview"), selectedPageId: "missing" } }).success).toBe(false);
  });
  it("acknowledges nested preview navigation without mutating extraction or sharing file bodies", () => {
    const current = data("file-review"), before = structuredClone(current);
    const patch = controlledData("file-review", current, { type: "document-page-change", data: { ...scope, pageId: "page-2" } });
    expect(patch).toEqual({ preview: { ...authoredDocumentPreview, selectedPageId: "page-2" } });
    expect(Object.hasOwn(patch!, "extraction")).toBe(false); expect(current).toEqual(before);
  });
});

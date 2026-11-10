import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { schemaBySlug } from "@mcpcn/schemas";
import { DocumentPreviewDemo, FileReviewDemo } from "./file-review-demos";
import { fileReviewExampleCode, fileReviewExamples } from "./file-review-examples";
import { App, extractAuthoredInvoiceFields } from "../../../examples/document-extraction/src/app";

describe("file review documentation consumers", () => {
  it("renders a real complete paginated preview with local inspection controls", () => {
    const html = renderToStaticMarkup(<DocumentPreviewDemo />);
    expect(html).toContain("Inspect the supplied document"); expect(html).toContain("Page one ends here.");
    for (const text of ["Payment terms source", "Append unrelated page", "Replace file revision", "Consumer response", "Last file review intent"]) expect(html).toContain(text);
    expect(html).not.toContain("GenericAgentComponent"); expect(html).not.toContain("<object");
  });
  it("renders actual controlled correction inputs and a separate explicit save stage", () => {
    const html = renderToStaticMarkup(<FileReviewDemo />);
    expect(html).toContain('aria-label="Correct Supplier"'); expect(html).toContain('aria-label="Correct Total"');
    expect(html).toContain("Review supplied file values"); expect(html).toContain("Save reviewed fields");
    expect(html).toContain("Replace extraction revision"); expect(html).not.toContain("GenericAgentComponent");
  });
  it("provides strict schema-valid complete examples with useful full content", () => {
    for (const slug of ["document-preview", "file-review"] as const) {
      expect(schemaBySlug[slug].safeParse(fileReviewExamples[slug]).success).toBe(true);
      expect(JSON.stringify(fileReviewExamples[slug])).toContain("Final authored line.");
    }
  });
  it("provides complete copyable consumer snippets with scoped controlled corrections", () => {
    for (const slug of ["document-preview", "file-review"] as const) {
      const source = fileReviewExampleCode(slug)!;
      expect(source).toContain("export function Example()"); expect(source).toContain("useState<"); expect(source).toContain("setLast(action)");
      expect(source).not.toContain("candidateData"); expect(source).not.toContain("callTool"); expect(source).not.toContain("selectedPageId");
    }
    const source = fileReviewExampleCode("file-review")!;
    expect(source).toContain("scope.fileRevision !== current.file.revision"); expect(source).toContain("scope.extractionRevision !== current.extraction.revision");
    expect(source).toContain("save-file-review is intent only");
  });
  it("does not claim examples for unrelated components", () => {
    expect(fileReviewExampleCode("approval-card")).toBeUndefined(); expect(fileReviewExampleCode("document-preview-unknown")).toBeUndefined();
  });
  it("waits for a server record without reading or extracting on mount", () => {
    expect(extractAuthoredInvoiceFields("Supplier:\nTotal: EUR 48.20")).toEqual({ supplier: "", total: "EUR 48.20" });
    expect(extractAuthoredInvoiceFields("Supplier:\tAcme Labs\r\nTotal:  EUR 48.20")).toEqual({ supplier: "Acme Labs", total: "EUR 48.20" });
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("Document extraction review");
    expect(html).toContain("Connect this app through the reference workbench or an authorized MCP host.");
    expect(html).not.toContain('type="file"'); expect(html).not.toContain("Last document extraction intent"); expect(html).not.toContain("GenericAgentComponent");
  });
});

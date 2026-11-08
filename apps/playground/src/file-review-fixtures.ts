import type { DocumentPreviewData, FileReviewData } from "@mcpcn/schemas";

/** Authored representations only; no file or extraction service was invoked. */
export const authoredReviewFile = { id: "authored-file-1", revision: "1", name: "Authored invoice.txt", bytes: 62, mimeType: "text/plain" };
export const authoredDocumentPreview = {
  id: "authored-preview-1", title: "Inspect the authored document", file: authoredReviewFile, state: "ready",
  content: { type: "pages", pages: [
    { id: "page-1", label: "Invoice", text: "Authored invoice\nSupplier: Acme Labs\nTotal: EUR 48.20\nPage one ends here." },
    { id: "page-2", label: "Review note", text: "Authored appendix\nPayment terms: 30 days\nFinal authored line." },
  ] },
  selectedPageId: "page-1", sources: [
    { id: "supplier-source", label: "Supplier source", text: "Supplier: Acme Labs", pageId: "page-1" },
    { id: "terms-source", label: "Payment terms source", text: "Payment terms: 30 days", pageId: "page-2" },
  ],
} satisfies DocumentPreviewData;
export const authoredFileReview = {
  id: "authored-review-1", title: "Review the authored file", file: authoredReviewFile,
  preview: authoredDocumentPreview,
  extraction: { id: "authored-extraction-1", revision: "1", fileId: authoredReviewFile.id, fileRevision: authoredReviewFile.revision, fields: [
    { id: "supplier", label: "Supplier", original: "Acme Labs", value: "Acme Labs", required: true, confidence: 0.97, evidence: [{ id: "supplier-line", label: "Authored supplier line", text: "Supplier: Acme Labs" }] },
    { id: "total", label: "Total", original: "EUR 48.20", value: "EUR 48.20", required: true, confidence: 0.91, evidence: [{ id: "total-line", label: "Authored total line", text: "Total: EUR 48.20" }] },
  ] },
} satisfies FileReviewData;

export const fileReviewFixtures = { "document-preview": authoredDocumentPreview, "file-review": authoredFileReview };

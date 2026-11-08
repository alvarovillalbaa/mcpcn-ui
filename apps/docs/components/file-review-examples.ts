import type { DocumentPreviewData, FileReviewData } from "@mcpcn/schemas";
import { authoredDocumentPreview, authoredFileReview } from "../../playground/src/file-review-fixtures";

export const fileReviewExamples: { "document-preview": DocumentPreviewData; "file-review": FileReviewData } = {
  "document-preview": { ...authoredDocumentPreview, title: "Inspect the supplied document" },
  "file-review": { ...authoredFileReview, title: "Review supplied file values" },
};

/** View events carry no document content. This is local consumer state only. */
export function fileReviewExampleCode(slug: string): string | undefined {
  if (slug !== "document-preview" && slug !== "file-review") return undefined;
  const name = slug === "document-preview" ? "DocumentPreview" : "FileReview";
  const correction = slug === "file-review" ? `
    const scope = action.data as { reviewId?: string; fileId?: string; fileRevision?: string; extractionId?: string; extractionRevision?: string; fieldId?: string; value?: string } | undefined;
    if (action.type === "file-correction-change" && scope?.reviewId === data.id && data.file && data.extraction && scope.fileId === data.file.id && scope.fileRevision === data.file.revision && scope.extractionId === data.extraction.id && scope.extractionRevision === data.extraction.revision) {
      setData(current => {
        if (!current.file || !current.extraction || scope.reviewId !== current.id || scope.fileId !== current.file.id || scope.fileRevision !== current.file.revision || scope.extractionId !== current.extraction.id || scope.extractionRevision !== current.extraction.revision) return current;
        return { ...current, extraction: { ...current.extraction, fields: current.extraction.fields.map(field => field.id === scope.fieldId && !field.disabled && typeof scope.value === "string" ? { ...field, value: scope.value } : field) } };
      });
    }
    // save-file-review is intent only. Independently validate scope, values,
    // authorization and persistence in your application before claiming success.` : "";
  // Omit selection props to use the component's local page/source navigation.
  const data = structuredClone(fileReviewExamples[slug]);
  const preview = slug === "document-preview" ? data as DocumentPreviewData : (data as FileReviewData).preview;
  if (preview?.state === "ready") { delete preview.selectedPageId; delete preview.selectedSourceId; }
  return `"use client";
import { useState } from "react";
import { ${name}, type ComponentAction } from "@mcpcn/react";
import type { ${name}Data } from "@mcpcn/schemas";

export function Example() {
  const [data${slug === "file-review" ? ", setData" : ""}] = useState<${name}Data>(${JSON.stringify(data, null, 2)});
  const [last, setLast] = useState<ComponentAction | null>(null);
  const handleAction = (action: ComponentAction) => {
    setLast(action);${correction}
  };
  return <>
    <${name} {...data} onAction={handleAction} />
    <pre aria-label="Last file review intent">{JSON.stringify(last, null, 2)}</pre>
  </>;
}`;
}

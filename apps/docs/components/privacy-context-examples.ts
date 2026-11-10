import type { DataAccessNoticeData, PrivacyBoundaryCardData, ConsentPanelData, ModelContextPreviewData } from "@mcpcn/schemas";

const root = { revision: "1", state: "ready" as const };
const action = { id: "review", revision: "1", label: "Request privacy review", available: true };
const value = { amount: 0, enabled: false, absent: null, details: Array.from({ length: 50 }, (_, index) => ({ ordinal: index, text: index === 49 ? "COMPLETE_CONTEXT_END" : `Authored complete context row ${index}` })) };
export const privacyContextExamples = {
  "data-access-notice": { ...root, id: "access-1", title: "Review reported data access", action: { ...action, label: "Request access review" }, access: {
    id: "access-report", revision: "1", label: "Supplied access report", requesterLabel: "Authored assistant", purpose: "Review authored field metadata.", reportedStatus: "allowed",
    resources: [{ id: "resource-1", revision: "1", label: "Authored records", operation: "read", reportedRecordCount: 0, fields: [{ id: "field-1", revision: "1", label: "Authored display name" }] }],
  } },
  "privacy-boundary-card": { ...root, id: "boundary-1", title: "Review reported privacy boundaries", action, boundary: { id: "boundary-report", revision: "1", label: "Supplied visibility report", entries: [
    { id: "visible-1", revision: "1", label: "Authored planned summary", visibility: "model-visible", value },
    { id: "private-1", revision: "1", label: "Authored private draft", visibility: "private-ui", value: [0, false, null, "PRIVATE_VALUE_END"] },
    { id: "server-1", revision: "1", label: "Authored credential boundary", visibility: "server-only", description: "Metadata only; no credential value is present." },
  ] } },
  "consent-panel": { ...root, id: "consent-1", title: "Review a current consent request", approveAction: { ...action, id: "approve", label: "Request consent approval" },
    declineAction: { ...action, id: "decline", label: "Decline consent request" }, request: { id: "consent-report", revision: "1", label: "Supplied consent request", recipientLabel: "Authored review service", purpose: "Review selected authored scopes.", reportedDecision: "granted", scopes: [
      { id: "scope-required", revision: "1", label: "Read authored summary", required: true, available: true, description: "Required for this supplied request." },
      { id: "scope-optional", revision: "2", label: "Read authored notes", required: false, available: true },
      { id: "scope-unavailable", revision: "3", label: "Export authored records", required: false, available: false },
    ] } },
  "model-context-preview": { ...root, id: "context-1", title: "Review planned model context", action: { ...action, label: "Request context handoff" }, preview: {
    id: "context-report", revision: "1", label: "Supplied planned context", recipientLabel: "Authored model recipient", purpose: "Review the complete authored context before handoff.", reportedTokenEstimate: 0,
    sections: [{ id: "section-1", revision: "1", label: "Authored planned summary", value }], excluded: [{ id: "excluded-1", revision: "1", label: "Authored private notes", reason: "Excluded from the planned handoff; metadata only." }],
  } },
} satisfies { "data-access-notice": DataAccessNoticeData; "privacy-boundary-card": PrivacyBoundaryCardData; "consent-panel": ConsentPanelData; "model-context-preview": ModelContextPreviewData };
export type PrivacyContextSlug = keyof typeof privacyContextExamples;
export const privacyContextNames = { "data-access-notice": "DataAccessNotice", "privacy-boundary-card": "PrivacyBoundaryCard", "consent-panel": "ConsentPanel", "model-context-preview": "ModelContextPreview" } as const;
export function privacyContextExampleCode(slug: PrivacyContextSlug) {
  return `import { ${privacyContextNames[slug]} } from "@mcpcn/react";\nimport type { ${privacyContextNames[slug]}Data } from "@mcpcn/schemas";\n\nconst data: ${privacyContextNames[slug]}Data = ${JSON.stringify(privacyContextExamples[slug], null, 2)};\n\n<${privacyContextNames[slug]} {...data} onAction={intent => console.log(intent)} />`;
}

import type { DataAccessNoticeData, PrivacyBoundaryCardData, ConsentPanelData, ModelContextPreviewData } from "../../packages/schemas/src/privacy-context-schemas.js";

const root = { revision: "one", state: "ready" as const, title: "Authored privacy report" };
const action = { id: "review", revision: "two", label: "Request authored review", available: true };
const value = { first: 0, second: false, third: null, fourth: { complete: "VALUE_END <script>never execute</script>" } };
export const privacyContextData = {
  "data-access-notice": { ...root, id: "access-1", action, access: { id: "access-report", revision: "five", label: "Supplied access metadata", requesterLabel: "Authored assistant", purpose: "Authored complete purpose", reportedStatus: "allowed", resources: [
    { id: "resource-a", revision: "three", label: "Authored resource A", operation: "delete", reportedRecordCount: 0, fields: [{ id: "field-a", revision: "four", label: "Authored field <A>" }] },
    { id: "resource-b", revision: "four", label: "Authored resource B", operation: "read", fields: [] },
  ] } },
  "privacy-boundary-card": { ...root, id: "boundary-1", action, boundary: { id: "boundary-report", revision: "five", label: "Supplied boundary report", entries: [
    { id: "visible", revision: "three", label: "Authored model-visible value", visibility: "model-visible", value },
    { id: "private", revision: "four", label: "Authored private value", visibility: "private-ui", value: [0, false, null, "PRIVATE_END"] },
    { id: "server", revision: "six", label: "Authored server-only boundary", visibility: "server-only", description: "Metadata only" },
  ] } },
  "consent-panel": { ...root, id: "consent-1", approveAction: { ...action, id: "approve" }, declineAction: { ...action, id: "decline", label: "Decline authored request" }, request: {
    id: "consent-report", revision: "five", label: "Supplied consent request", recipientLabel: "Authored recipient", purpose: "Authored complete purpose", reportedDecision: "granted", scopes: [
      { id: "required", revision: "three", label: "Authored required scope", required: true, available: true },
      { id: "optional", revision: "four", label: "Authored optional scope", required: false, available: true, description: "Optional authored description" },
      { id: "unavailable", revision: "six", label: "Authored unavailable scope", required: false, available: false },
    ] } },
  "model-context-preview": { ...root, id: "context-1", action, preview: { id: "context-report", revision: "five", label: "Supplied planned context", recipientLabel: "Authored recipient", purpose: "Authored complete purpose", reportedTokenEstimate: 0, sections: [
    { id: "section-a", revision: "three", label: "Authored planned value", value }, { id: "section-b", revision: "four", label: "Second authored value", value: [0, false, null, "SECTION_END"] },
  ], excluded: [{ id: "excluded-a", revision: "six", label: "Authored excluded item", reason: "Keep the actual value out of this client payload." }] } },
} satisfies { "data-access-notice": DataAccessNoticeData; "privacy-boundary-card": PrivacyBoundaryCardData; "consent-panel": ConsentPanelData; "model-context-preview": ModelContextPreviewData };
export const privacyContextCases = [
  { slug: "data-access-notice", name: "DataAccessNotice", report: "access", type: "request-data-access-review", data: privacyContextData["data-access-notice"] },
  { slug: "privacy-boundary-card", name: "PrivacyBoundaryCard", report: "boundary", type: "request-privacy-review", data: privacyContextData["privacy-boundary-card"] },
  { slug: "consent-panel", name: "ConsentPanel", report: "request", type: "request-consent-approval", data: privacyContextData["consent-panel"] },
  { slug: "model-context-preview", name: "ModelContextPreview", report: "preview", type: "request-context-handoff", data: privacyContextData["model-context-preview"] },
] as const;
export type PrivacyCase = typeof privacyContextCases[number];
export const mutablePrivacy = (row: PrivacyCase) => structuredClone(row.data) as unknown as Record<string, unknown>;
export const privacyReport = (data: Record<string, unknown>) => (data.access ?? data.boundary ?? data.request ?? data.preview) as Record<string, unknown>;
export const privacyMembers = (data: Record<string, unknown>) => {
  const report = privacyReport(data);
  return (report.resources ?? report.entries ?? report.scopes ?? report.sections) as Array<Record<string, unknown>>;
};

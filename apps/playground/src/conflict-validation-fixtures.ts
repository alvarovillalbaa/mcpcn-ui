import type { ConflictResolverData, ValidationSummaryData, ValidationIssue, InspectionField } from "@mcpcn/schemas";

export const authoredConflictValue = { confirmed: false, count: 0, next: null, empty: "", items: [false, 0, null, "", { literal: "<script>never executed</script>", end: "END-CONFLICT-JSON" }] };
export const authoredConflictCandidates: InspectionField[] = [
  { id: "preferred", revision: "1", label: "Preferred candidate", value: authoredConflictValue, confidence: 0,
    evidence: [{ id: "conflict-note", label: "Authored conflict note", text: "Complete supplied <em>conflict evidence</em>. END-CONFLICT-EVIDENCE", url: "https://example.com/supplied-conflict" }] },
  { id: "alternative", revision: "1", label: "Alternative candidate", value: false },
  { id: "matching", revision: "1", label: "Equal value candidate", value: authoredConflictValue, confidence: 0.5, evidence: [] },
];
export const authoredValidationIssues: ValidationIssue[] = [
  { id: "format", revision: "1", label: "Format review", severity: "error", message: "Authored error in a report explicitly marked valid; no status is inferred.",
    context: { flags: [false, 0, null, ""], literal: "<script>never executed</script>", end: "END-VALIDATION-JSON" },
    evidence: [{ id: "validation-note", label: "Authored validation note", text: "Complete supplied <em>validation evidence</em>. END-VALIDATION-EVIDENCE", url: "https://example.com/supplied-validation" }] },
  { id: "warning", revision: "1", label: "Warning review", severity: "warning", message: "An authored warning with false context.", context: false },
  { id: "count", revision: "1", label: "Count review", severity: "info", message: "An authored information issue with zero context.", context: 0 },
  { id: "empty", revision: "1", label: "Empty review", severity: "info", message: "An authored information issue with empty text context.", context: "" },
  { id: "next", revision: "1", label: "Next step", severity: "warning", message: "An authored warning with explicit null context.", context: null },
  { id: "missing", revision: "1", label: "No supplied context", severity: "info", message: "No context was supplied for this authored issue." },
];
export const authoredConflictResolver = { id: "conflict-resolver-1", revision: "1", title: "Supplied conflict choices", state: "ready",
  conflict: { id: "conflict-1", revision: "1", label: "Authored conflicting record", candidates: authoredConflictCandidates }, selectedCandidateId: null } satisfies ConflictResolverData;
export const authoredValidationSummary = { id: "validation-summary-1", revision: "1", title: "Supplied validation report", state: "ready",
  report: { id: "report-1", revision: "1", label: "Authored validation report", reportedStatus: "valid", issues: authoredValidationIssues }, selectedIssueId: null } satisfies ValidationSummaryData;
export const conflictStateFixtures = [authoredConflictResolver,
  { id: "conflict-resolver-1", revision: "1", title: "Supplied conflict choices", state: "loading" },
  { id: "conflict-resolver-1", revision: "1", title: "Supplied conflict choices", state: "empty" },
  { id: "conflict-resolver-1", revision: "1", title: "Supplied conflict choices", state: "error", message: "Authored conflict failure." },
] satisfies ConflictResolverData[];
export const validationStateFixtures = [authoredValidationSummary,
  { id: "validation-summary-1", revision: "1", title: "Supplied validation report", state: "loading" },
  { id: "validation-summary-1", revision: "1", title: "Supplied validation report", state: "empty" },
  { id: "validation-summary-1", revision: "1", title: "Supplied validation report", state: "error", message: "Authored validation failure." },
  { ...authoredValidationSummary, report: { ...authoredValidationSummary.report, issues: [] } },
] satisfies ValidationSummaryData[];
export const conflictValidationFixtures = { "conflict-resolver": authoredConflictResolver, "validation-summary": authoredValidationSummary } as const;

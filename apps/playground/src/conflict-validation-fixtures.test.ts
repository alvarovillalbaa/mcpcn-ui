import { describe, expect, it } from "vitest";
import type { MCPCNPayload } from "@mcpcn/core";
import { ConflictResolverSchema, ValidationSummarySchema, schemaBySlug } from "@mcpcn/schemas";
import { controlledData, conflictValidationPreviewKey } from "./component-preview";
import { makeFixture, playgroundItems, validateFixture } from "./fixtures";
import { authoredConflictResolver, authoredValidationSummary, authoredConflictCandidates, authoredValidationIssues, conflictStateFixtures, validationStateFixtures } from "./conflict-validation-fixtures";

const scope = { componentId: "conflict-resolver-1", componentRevision: "1", conflictId: "conflict-1", conflictRevision: "1", candidateId: "preferred", candidateRevision: "1" };
const issue = { componentId: "validation-summary-1", componentRevision: "1", reportId: "report-1", reportRevision: "1", issueId: "format", issueRevision: "1" };
const envelope = (data: unknown, slug = "conflict-resolver"): MCPCNPayload<string, unknown> => ({ kind: `mcpcn/${slug}`, version: 1, data });

describe("conflict and validation playground consumers", () => {
  it("CV-F01 dispatches the two new strict public schemas with controlled none selected", () => {
    expect(playgroundItems).toHaveLength(79);
    for (const slug of ["conflict-resolver", "validation-summary"] as const) {
      const data = makeFixture(slug); expect(validateFixture(data).success).toBe(true); expect(schemaBySlug[slug].safeParse(data.data).success).toBe(true);
    }
    const conflict = ConflictResolverSchema.parse(authoredConflictResolver), validation = ValidationSummarySchema.parse(authoredValidationSummary);
    if (conflict.state !== "ready" || validation.state !== "ready") throw new Error("ready_expected");
    expect(conflict.selectedCandidateId).toBeNull(); expect(validation.selectedIssueId).toBeNull();
  });
  it("CV-F02 detaches complete falsy nested values and safe evidence from mutable producer input", () => {
    const data = structuredClone(authoredConflictResolver), result = validateFixture(envelope(data)); expect(result.success).toBe(true);
    data.conflict.candidates[0]!.label = "Changed outside the validated snapshot";
    if (result.success) { const parsed = ConflictResolverSchema.parse(result.data.data); if (parsed.state !== "ready") throw new Error("ready_expected");
      expect(parsed.conflict.candidates[0]?.label).toBe("Preferred candidate"); expect(parsed.conflict.candidates[0]?.value).toEqual(authoredConflictCandidates[0]?.value);
      expect(parsed.conflict.candidates[0]?.evidence[0]?.url).toBe("https://example.com/supplied-conflict"); }
  });
  it("CV-F03 permits equal candidate values while preserving distinct identities and absent confidence", () => {
    const parsed = ConflictResolverSchema.parse(authoredConflictResolver); if (parsed.state !== "ready") throw new Error("ready_expected");
    expect(parsed.conflict.candidates[0]?.value).toEqual(parsed.conflict.candidates[2]?.value); expect(new Set(parsed.conflict.candidates.map(item => item.id)).size).toBe(3);
    expect(parsed.conflict.candidates[0]?.confidence).toBe(0); expect(parsed.conflict.candidates[1]).not.toHaveProperty("confidence"); expect(parsed.conflict.candidates[1]?.evidence).toEqual([]);
  });
  it("CV-F04 preserves object false zero empty null and absent issue contexts without status inference", () => {
    const parsed = ValidationSummarySchema.parse(authoredValidationSummary); if (parsed.state !== "ready") throw new Error("ready_expected");
    expect(parsed.report.reportedStatus).toBe("valid"); expect(parsed.report.issues[0]?.severity).toBe("error");
    expect(parsed.report.issues.slice(1, 5).map(item => item.context)).toEqual([false, 0, "", null]); expect(parsed.report.issues[5]).not.toHaveProperty("context");
  });
  it("CV-F05 supports all explicit states and an empty ready report with any supplied status", () => {
    for (const data of conflictStateFixtures) expect(validateFixture(envelope(data)).success).toBe(true);
    for (const data of validationStateFixtures) expect(validateFixture(envelope(data, "validation-summary")).success).toBe(true);
    for (const reportedStatus of ["unknown", "pending", "valid", "invalid"] as const) {
      const data = { ...authoredValidationSummary, report: { ...authoredValidationSummary.report, issues: [], reportedStatus } };
      const parsed = ValidationSummarySchema.parse(data); expect(parsed.state).toBe("ready"); if (parsed.state === "ready") expect(parsed.report.reportedStatus).toBe(reportedStatus);
    }
  });
  it("CV-F06 rejects malformed unsafe duplicate and out-of-range producer payloads", () => {
    expect(validateFixture(envelope({ ...authoredConflictResolver, unsupported: true })).success).toBe(false);
    const unsafe = structuredClone(authoredConflictResolver); unsafe.conflict.candidates[0]!.evidence![0]!.url = "javascript:alert(1)"; expect(validateFixture(envelope(unsafe)).success).toBe(false);
    expect(validateFixture(envelope({ ...authoredConflictResolver, conflict: { ...authoredConflictResolver.conflict, candidates: [authoredConflictCandidates[0]] } })).success).toBe(false);
    expect(validateFixture(envelope({ ...authoredValidationSummary, report: { ...authoredValidationSummary.report, issues: [authoredValidationIssues[0], authoredValidationIssues[0]] } }, "validation-summary")).success).toBe(false);
  });
  it("CV-F07 preserves local omission versus controlled null and refuses unknown selected members", () => {
    const { selectedCandidateId: _candidate, ...localConflict } = authoredConflictResolver;
    const { selectedIssueId: _issue, ...localReport } = authoredValidationSummary;
    expect(ConflictResolverSchema.parse(localConflict)).not.toHaveProperty("selectedCandidateId"); expect(ValidationSummarySchema.parse(localReport)).not.toHaveProperty("selectedIssueId");
    expect(validateFixture(envelope({ ...authoredConflictResolver, selectedCandidateId: "missing" })).success).toBe(false);
    expect(validateFixture(envelope({ ...authoredValidationSummary, selectedIssueId: "unknown-issue" }, "validation-summary")).success).toBe(false);
  });
  it("CV-F08 echoes only scoped current selection and clear requests never confirmation", () => {
    expect(controlledData("conflict-resolver", authoredConflictResolver, { type: "select-conflict-candidate", data: scope })).toEqual({ selectedCandidateId: "preferred" });
    expect(controlledData("conflict-resolver", authoredConflictResolver, { type: "confirm-conflict-candidate", data: scope })).toBeUndefined();
    expect(controlledData("validation-summary", authoredValidationSummary, { type: "inspect-validation-issue", data: issue })).toEqual({ selectedIssueId: "format" });
    expect(controlledData("validation-summary", authoredValidationSummary, { type: "clear-validation-issue", data: { componentId: issue.componentId, componentRevision: "1", reportId: "report-1", reportRevision: "1" } })).toEqual({ selectedIssueId: null });
    expect(controlledData("conflict-resolver", authoredConflictResolver, { type: "select-conflict-candidate", data: { ...scope, value: null } })).toBeUndefined();
    expect(controlledData("validation-summary", authoredValidationSummary, { type: "inspect-validation-issue", data: { ...issue, issueRevision: "stale" } })).toBeUndefined();
  });
  it("CV-F09 keeps same-root preview identity through owner or semantic data refreshes", () => {
    const first = envelope(authoredConflictResolver), changed = envelope({ ...authoredConflictResolver, conflict: { ...authoredConflictResolver.conflict, revision: "2" } });
    expect(conflictValidationPreviewKey(first)).toBe(conflictValidationPreviewKey(changed));
    expect(conflictValidationPreviewKey(envelope({ ...authoredConflictResolver, revision: "2" }))).not.toBe(conflictValidationPreviewKey(first));
    expect(conflictValidationPreviewKey({ kind: "mcpcn/record-inspector", version: 1, data: {} })).toBeUndefined();
  });
  it("CV-F10 retains descriptor-safe smaller shared editor bounds for the new source slugs", () => {
    let reads = 0; const data = { ...authoredConflictResolver }; Object.defineProperty(data, "title", { enumerable: true, get() { reads++; return "Unsafe getter"; } });
    expect(validateFixture(envelope(data)).success).toBe(false); expect(reads).toBe(0);
    const largerNativeValue = { ...authoredConflictResolver, conflict: { ...authoredConflictResolver.conflict,
      candidates: authoredConflictCandidates.map((candidate, index) => index === 0 ? { ...candidate, value: "x".repeat(8193) } : candidate) } };
    expect(ConflictResolverSchema.safeParse(largerNativeValue).success).toBe(true);
    expect(validateFixture(envelope(largerNativeValue)).success).toBe(false);
    const sparse = new Array<unknown>(3); sparse[0] = authoredConflictCandidates[0]; expect(validateFixture(envelope({ ...authoredConflictResolver, conflict: { ...authoredConflictResolver.conflict, candidates: sparse } })).success).toBe(false);
  });
});

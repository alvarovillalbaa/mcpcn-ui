import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ConflictResolver, ValidationSummary } from "@mcpcn/react";
import { ConflictResolverSchema, ValidationSummarySchema } from "@mcpcn/schemas";
import { ConflictResolverDemo, ValidationSummaryDemo } from "./conflict-validation-demos";
import { applyConflictValidationExampleAction, conflictValidationExamples, conflictValidationExampleCode } from "./conflict-validation-examples";

const candidateScope = { componentId: "conflict-resolver-1", componentRevision: "1", conflictId: "conflict-1", conflictRevision: "1", candidateId: "preferred", candidateRevision: "1" };
const issueScope = { componentId: "validation-summary-1", componentRevision: "1", reportId: "report-1", reportRevision: "1", issueId: "format", issueRevision: "1" };
const selected = { type: "select-conflict-candidate", data: candidateScope };
const inspected = { type: "inspect-validation-issue", data: issueScope };
const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#x27;");

describe("conflict and validation documentation consumers", () => {
  it("CV-DOC01 supplies strict controlled examples with no default winning candidate or issue", () => {
    const conflict = ConflictResolverSchema.parse(conflictValidationExamples["conflict-resolver"]), validation = ValidationSummarySchema.parse(conflictValidationExamples["validation-summary"]);
    expect(conflict.state).toBe("ready"); expect(validation.state).toBe("ready");
    if (conflict.state === "ready" && validation.state === "ready") {
      expect(conflict.selectedCandidateId).toBeNull(); expect(validation.selectedIssueId).toBeNull();
      expect(conflict.conflict.candidates).toHaveLength(3); expect(validation.report.issues).toHaveLength(6);
      expect(validation.report.reportedStatus).toBe("valid"); expect(validation.report.issues[0]?.severity).toBe("error");
    }
  });
  it("CV-DOC02 renders local conflict selection with a separate initially disabled confirmation", () => {
    const html = renderToStaticMarkup(<ConflictResolverDemo />);
    expect(html).toContain('aria-label="Conflict resolver demonstration"'); expect(html).toContain("Review supplied conflict choices");
    expect(html).toContain('aria-label="Select candidate: Preferred candidate"'); expect(html).toContain("Confirm choice");
    expect(html).toMatch(/<button\b[^>]*\bdisabled=""[^>]*>Confirm choice<\/button>/);
    expect(html).toContain('aria-label="Conflict resolver intent count">0</output>'); expect(html).toContain('aria-label="Confirmation count">0</output>');
    expect(html).toContain('aria-label="Pending confirmations">0</output>'); expect(html).not.toContain('aria-label="Complete candidate JSON"');
  });
  it("CV-DOC03 renders a supplied valid report without deriving status from its error issue", () => {
    const html = renderToStaticMarkup(<ValidationSummaryDemo />).replaceAll("<!-- -->", "");
    expect(html).toContain("Inspect supplied validation report"); expect(html).toContain("Reported validation: <strong>valid</strong>");
    expect(html).toContain('aria-label="Inspect issue: Format review"'); expect(html).toContain('aria-label="Reported validation status"');
    expect(html).toContain('aria-label="Validation summary intent count">0</output>'); expect(html).not.toContain('aria-label="Confirmation response"');
  });
  it("CV-DOC04 applies current selection identities but never treats confirmation as resolution", () => {
    const data = conflictValidationExamples["conflict-resolver"], next = applyConflictValidationExampleAction(data, selected);
    expect(next).not.toBe(data);
    if (next.state === "ready" && data.state === "ready") { expect(next.selectedCandidateId).toBe("preferred"); expect(next.conflict).toBe(data.conflict); }
    expect(applyConflictValidationExampleAction(next, { type: "confirm-conflict-candidate", data: candidateScope })).toBe(next);
    expect(JSON.stringify(next)).not.toContain('"resolved"');
  });
  it("CV-DOC05 explicitly acknowledges clear and leaves omitted local selection to the component", () => {
    const conflict = applyConflictValidationExampleAction(conflictValidationExamples["conflict-resolver"], selected), validation = applyConflictValidationExampleAction(conflictValidationExamples["validation-summary"], inspected);
    const a = applyConflictValidationExampleAction(conflict, { type: "clear-conflict-candidate", data: { componentId: candidateScope.componentId, componentRevision: "1", conflictId: "conflict-1", conflictRevision: "1" } });
    const b = applyConflictValidationExampleAction(validation, { type: "clear-validation-issue", data: { componentId: issueScope.componentId, componentRevision: "1", reportId: "report-1", reportRevision: "1" } });
    if (a.state === "ready" && b.state === "ready") { expect(a.selectedCandidateId).toBeNull(); expect(b.selectedIssueId).toBeNull(); }
    if (conflict.state === "ready") { const { selectedCandidateId: _selected, ...local } = conflict; expect(applyConflictValidationExampleAction(local, selected)).toBe(local); }
  });
  it("CV-DOC06 refuses stale root owner member identities and extra private event fields", () => {
    const data = conflictValidationExamples["conflict-resolver"];
    for (const key of Object.keys(candidateScope) as Array<keyof typeof candidateScope>) expect(applyConflictValidationExampleAction(data, { ...selected, data: { ...candidateScope, [key]: "stale" } })).toBe(data);
    expect(applyConflictValidationExampleAction(data, { ...selected, data: { ...candidateScope, value: false } })).toBe(data);
    expect(applyConflictValidationExampleAction(conflictValidationExamples["validation-summary"], { ...inspected, data: { ...issueScope, message: "Private" } })).toBe(conflictValidationExamples["validation-summary"]);
  });
  it("CV-DOC07 preserves complete escaped selected candidate JSON evidence and zero confidence", () => {
    const data = conflictValidationExamples["conflict-resolver"]; if (data.state !== "ready") throw new Error("authored_ready_required");
    const field = data.conflict.candidates[0]; if (!field) throw new Error("authored_field_required");
    const text = JSON.stringify(field.value, null, 2); if (text === undefined) throw new Error("authored_value_required");
    const html = renderToStaticMarkup(<ConflictResolver {...data} selectedCandidateId="preferred" onAction={() => undefined} />);
    expect(html).toContain(escape(text));
    expect(html).toContain("END-CONFLICT-EVIDENCE"); expect(html).toContain('aria-valuetext="0%"'); expect(html).toContain('href="https://example.com/supplied-conflict"');
    expect(html).not.toContain("<script>"); expect(html).not.toContain("<em>conflict evidence</em>");
  });
  it("CV-DOC08 renders complete issue context and evidence without changing the supplied status", () => {
    const data = conflictValidationExamples["validation-summary"]; if (data.state !== "ready") throw new Error("authored_ready_required");
    const field = data.report.issues[0]; if (!field) throw new Error("authored_issue_required");
    const text = JSON.stringify(field.context, null, 2); if (text === undefined) throw new Error("authored_context_required");
    const html = renderToStaticMarkup(<ValidationSummary {...data} selectedIssueId="format" onAction={() => undefined} />).replaceAll("<!-- -->", "");
    expect(html).toContain(escape(text)); expect(html).toContain("END-VALIDATION-EVIDENCE");
    expect(html).toContain("Reported validation: <strong>valid</strong>"); expect(html).not.toContain("<script>"); expect(html).not.toContain("<em>validation evidence</em>");
  });
  it("CV-DOC09 exposes independent held notification confirmation and explicit replacement controls", () => {
    const html = renderToStaticMarkup(<ConflictResolverDemo />);
    for (const name of ["Selection notification response", "Confirmation response", "Selection ownership", "Reported state", "Callback enabled", "External busy", "Malformed data", "Mount component"]) expect(html).toContain(`aria-label="${name}"`);
    for (const name of ["Apply last selection request", "Append unrelated member", "Reorder members", "Replace selected member", "Remove selected member", "Replace conflict", "Replace component", "Resolve oldest notification", "Reject oldest notification", "Resolve oldest confirmation", "Reject oldest confirmation"]) expect(html).toContain(name);
    expect(html.match(/value="throw"/g)).toHaveLength(2); expect(html.match(/value="hold"/g)).toHaveLength(2);
  });
  it("CV-DOC10 publishes complete current API snippets with strict identity-only controlled acknowledgements", () => {
    for (const [slug, name] of [["conflict-resolver", "ConflictResolver"], ["validation-summary", "ValidationSummary"]] as const) {
      const code = conflictValidationExampleCode(slug)!;
      expect(code).toContain(`import { ${name}, type ComponentAction } from "@mcpcn/react"`); expect(code).toContain(`import type { ${name}Data } from "@mcpcn/schemas"`);
      expect(code).toContain("Object.keys(scope).length !== keys.length"); expect(code).toContain("scope.componentRevision !== current.revision"); expect(code).toContain("END-");
      expect(code).not.toContain("callTool("); expect(code).not.toContain("fetch("); expect(code).not.toContain("resolved: true");
    }
    expect(conflictValidationExampleCode("record-inspector")).toBeUndefined();
  });
});

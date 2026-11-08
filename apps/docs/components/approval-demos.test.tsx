import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { schemaBySlug } from "@mcpcn/schemas";
import { ApprovalChecklistDemo, BeforeSubmitConfirmationDemo, DestructiveActionGuardDemo, HumanOverridePanelDemo, PermissionRequestCardDemo } from "./approval-demos";
import { approvalExampleCode, approvalExamples } from "./approval-examples";

describe("approval cohort documentation previews", () => {
  it("renders the dedicated controlled checklist preview and consumer controls", () => {
    const html = renderToStaticMarkup(<ApprovalChecklistDemo />);
    expect(html).toContain("Review the publication checklist"); expect(html).toContain("Review affected records"); expect(html).toContain("Approve checklist");
    expect(html).toContain('aria-label="Consumer response"'); expect(html).toContain("Replace review"); expect(html).not.toContain("GenericAgentComponent");
  });
  it("renders the dedicated field review with explicit submission consent", () => {
    const html = renderToStaticMarkup(<BeforeSubmitConfirmationDemo />);
    expect(html).toContain("Review the submission"); expect(html).toContain("Authored publication request"); expect(html).toContain("I reviewed these fields and want to submit.");
    expect(html).toContain("Delayed"); expect(html).toContain("Reject"); expect(html).not.toContain("GenericAgentComponent");
  });
  it("renders destructive impact phrase and local consent without executing an action", () => {
    const html = renderToStaticMarkup(<DestructiveActionGuardDemo />);
    expect(html).toContain("Two authored draft records"); expect(html).toContain("REMOVE DRAFTS"); expect(html).toContain("Confirm destructive action"); expect(html).toContain("I understand this action and want to continue.");
    expect(html).not.toContain("GenericAgentComponent");
  });
  it("renders current override choices and local reason with explicit consent", () => {
    const html = renderToStaticMarkup(<HumanOverridePanelDemo />);
    expect(html).toContain("Standard review"); expect(html).toContain("Manual review"); expect(html).toContain("Reason for override"); expect(html).toContain("Override recommendation");
    expect(html).toContain("Last approval intent"); expect(html).not.toContain("GenericAgentComponent");
  });
  it("renders requested permission scopes with separate request and denial intents", () => {
    const html = renderToStaticMarkup(<PermissionRequestCardDemo />);
    expect(html).toContain("Authored review assistant"); expect(html).toContain("Read document metadata"); expect(html).toContain("Request permission"); expect(html).toContain("Deny permission");
    expect(html).toContain("No permission, authorization, tool or model call"); expect(html).not.toContain("GenericAgentComponent");
  });
  it("supplies complete typed examples for all five canonical data contracts", () => {
    for (const slug of Object.keys(approvalExamples) as Array<keyof typeof approvalExamples>) {
      expect(schemaBySlug[slug].safeParse(approvalExamples[slug]).success).toBe(true);
      const source = approvalExampleCode(slug)!;
      expect(source).toContain("export function Example()"); expect(source).toContain("useState<"); expect(source).toContain("setLast(action)");
      expect(source).not.toContain("candidateData"); expect(source).not.toContain("callTool"); expect(source).not.toContain("requestAuth");
    }
    expect(approvalExampleCode("tool-result-card")).toBeUndefined();
  });
});

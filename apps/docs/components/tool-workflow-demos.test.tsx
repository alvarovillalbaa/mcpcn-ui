import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { schemaBySlug } from "@mcpcn/schemas";
import { ToolResultCardDemo, RunningTaskCardDemo, PartialResultViewerDemo, QueuedStepListDemo, ToolTraceViewerDemo, toolWorkflowSelection } from "./tool-workflow-demos";
import { toolWorkflowExampleCode, toolWorkflowExamples } from "./tool-workflow-examples";

describe("tool workflow cohort documentation previews", () => {
  it("renders the dedicated partial outcome with complete structured result and local feedback controls", () => {
    const html = renderToStaticMarkup(<ToolResultCardDemo />);
    expect(html).toContain("Inspect the reported tool outcome"); expect(html).toContain("Inspect outcome"); expect(html).toContain("Incomplete Result");
    expect(html).toContain('aria-label="Consumer response"'); expect(html).toContain("Replace operation"); expect(html).toContain("Settled callback count"); expect(html).not.toContain("GenericAgentComponent");
  });
  it("renders consumer reported task progress and a separate cancellation request", () => {
    const html = renderToStaticMarkup(<RunningTaskCardDemo />);
    expect(html).toContain("Review reported task progress"); expect(html).toContain("Review authored output"); expect(html).toContain("Inspect task"); expect(html).toContain("Request cancellation");
    expect(html).toContain("Advance task progress");
    expect(html).toContain("Delayed"); expect(html).toContain("Reject"); expect(html).not.toContain("GenericAgentComponent");
  });
  it("renders current result part selection with explicit pending and failed parts", () => {
    const html = renderToStaticMarkup(<PartialResultViewerDemo />);
    expect(html).toContain("Review reported result parts"); expect(html).toContain("Select part: Authored summary"); expect(html).toContain("Authored details"); expect(html).toContain("Pending appendix");
    expect(html).toContain("Inspect part"); expect(html).toContain("Last tool workflow intent"); expect(html).not.toContain("GenericAgentComponent");
    expect(html).toContain("Append unrelated part");
    expect(html).toContain("Replace selected part");
  });
  it("renders original queued step order attempts and an explicitly eligible retry", () => {
    const html = renderToStaticMarkup(<QueuedStepListDemo />);
    expect(html).toContain("Review reported queued steps"); expect(html).toContain("Select step: Review authored output"); expect(html).toContain("Request step retry");
    expect(html.indexOf("Read authored input")).toBeLessThan(html.indexOf("Publish authored result")); expect(html).not.toContain("GenericAgentComponent");
    expect(html).toContain("Append unrelated step");
    expect(html).toContain("Replace selected step");
  });
  it("renders the controlled trace filter current event and full JSON without starting a runtime", () => {
    const html = renderToStaticMarkup(<ToolTraceViewerDemo />);
    expect(html).toContain("Review the reported tool trace"); expect(html).toContain("Trace event filter"); expect(html).toContain("Select event: Authored output"); expect(html).toContain("Inspect event");
    expect(html).toContain("No tool, queue, tracing, authorization or model runtime is started"); expect(html).not.toContain("GenericAgentComponent");
    expect(html).toContain("Append unrelated event");
    expect(html).toContain("Replace selected event");
  });
  it("supplies complete typed examples and current identity guarded controlled selection handlers", () => {
    for (const slug of Object.keys(toolWorkflowExamples) as Array<keyof typeof toolWorkflowExamples>) {
      expect(schemaBySlug[slug].safeParse(toolWorkflowExamples[slug]).success).toBe(true);
      const source = toolWorkflowExampleCode(slug)!;
      expect(source).toContain("export function Example()"); expect(source).toContain("useState<"); expect(source).toContain("setLast(action)");
      expect(source).not.toContain("candidateData"); expect(source).not.toContain("callTool"); expect(source).not.toContain("requestAuth");
    }
    expect(toolWorkflowExampleCode("approval-card")).toBeUndefined();
    const parts = toolWorkflowExamples["partial-result-viewer"], trace = toolWorkflowExamples["tool-trace-viewer"];
    expect(toolWorkflowSelection("partial-result-viewer", parts, { type: "select-result-part", data: { id: parts.id, partId: "details" } })).toEqual({ selectedPartId: "details" });
    expect(toolWorkflowSelection("tool-trace-viewer", trace, { type: "change-trace-filter", data: { id: trace.id, kind: "error" } })).toEqual({ filterKind: "error" });
    expect(toolWorkflowSelection("tool-trace-viewer", trace, { type: "select-trace-event", data: { id: "foreign", eventId: "output" } })).toBeUndefined();
  });
});

import type { ToolResultCardData, RunningTaskCardData, PartialResultViewerData, QueuedStepListData, ToolTraceViewerData } from "@mcpcn/schemas";

export const toolWorkflowExamples = {
  "tool-result-card": { id: "docs-outcome-1", title: "Inspect the reported tool outcome", description: "Authored data only. No tool was executed.", tool: "read_authored_records", status: "partial", result: { records: [{ id: "record-a", accepted: false, count: 0, note: "" }], next: null } },
  "running-task-card": { id: "docs-task-1", title: "Review reported task progress", status: "running", currentStep: "Review authored output", progress: { completed: 2, total: 3 }, elapsedMs: 1200, cancellable: true },
  "partial-result-viewer": { id: "docs-parts-1", title: "Review reported result parts", status: "partial", parts: [{ id: "summary", label: "Authored summary", status: "available", value: { accepted: false, count: 0, note: "", next: null } }, { id: "details", label: "Authored details", status: "failed", message: "The authored details need another attempt.", value: null, attempt: 2, retryable: true }, { id: "pending", label: "Pending appendix", status: "pending" }], selectedPartId: "summary" },
  "queued-step-list": { id: "docs-queue-1", title: "Review reported queued steps", steps: [{ id: "read", label: "Read authored input", status: "succeeded", attempt: 1 }, { id: "review", label: "Review authored output", status: "failed", message: "The authored review needs another attempt.", attempt: 2, retryable: true }, { id: "publish", label: "Publish authored result", status: "queued" }], selectedStepId: "review" },
  "tool-trace-viewer": { id: "docs-trace-1", title: "Review the reported tool trace", events: [{ id: "input", label: "Authored input", kind: "input", details: { query: "Authored record", limit: 0 } }, { id: "progress", label: "Authored progress", kind: "progress", parentId: "input", elapsedMs: 0, details: false }, { id: "output", label: "Authored output", kind: "output", parentId: "input", elapsedMs: 1200, details: { records: [], next: null } }, { id: "error", label: "Authored diagnostic", kind: "error", parentId: "input", details: "Authored diagnostic only" }, { id: "note", label: "Authored note", kind: "note", details: "" }], filterKind: "all", selectedEventId: "output" },
} satisfies {
  "tool-result-card": ToolResultCardData;
  "running-task-card": RunningTaskCardData;
  "partial-result-viewer": PartialResultViewerData;
  "queued-step-list": QueuedStepListData;
  "tool-trace-viewer": ToolTraceViewerData;
};
export type ToolWorkflowSlug = keyof typeof toolWorkflowExamples;
const names = { "tool-result-card": "ToolResultCard", "running-task-card": "RunningTaskCard", "partial-result-viewer": "PartialResultViewer", "queued-step-list": "QueuedStepList", "tool-trace-viewer": "ToolTraceViewer" } as const;
const handlers = {
  "partial-result-viewer": `    const value = action.data as { id?: string; partId?: string } | undefined;
    if (action.type === "select-result-part" && value?.id === data.id && typeof value.partId === "string") {
      const { partId } = value;
      setData(current => current.parts.some(part => part.id === partId) ? { ...current, selectedPartId: partId } : current);
    }`,
  "queued-step-list": `    const value = action.data as { id?: string; stepId?: string } | undefined;
    if (action.type === "select-queued-step" && value?.id === data.id && typeof value.stepId === "string") {
      const { stepId } = value;
      setData(current => current.steps.some(step => step.id === stepId) ? { ...current, selectedStepId: stepId } : current);
    }`,
  "tool-trace-viewer": `    const value = action.data as { id?: string; eventId?: string; kind?: ToolTraceViewerData["filterKind"] } | undefined;
    if (value?.id === data.id) {
      if (action.type === "change-trace-filter" && value.kind && ["all", "input", "progress", "output", "error", "note"].includes(value.kind)) {
        const { kind } = value;
        setData(current => ({ ...current, filterKind: kind }));
      }
      if (action.type === "select-trace-event" && typeof value.eventId === "string") {
        const { eventId } = value;
        setData(current => current.events.some(event => event.id === eventId) ? { ...current, selectedEventId: eventId } : current);
      }
    }`,
};

/** Complete examples acknowledge controlled props; terminal callbacks record intent only. */
export function toolWorkflowExampleCode(slug: string): string | undefined {
  if (!Object.hasOwn(toolWorkflowExamples, slug)) return undefined;
  const key = slug as ToolWorkflowSlug, name = names[key], controlled = key === "partial-result-viewer" || key === "queued-step-list" || key === "tool-trace-viewer";
  return `"use client";
import { useState } from "react";
import { ${name}, type ComponentAction } from "@mcpcn/react";
import type { ${name}Data } from "@mcpcn/schemas";

export function Example() {
  const [data${controlled ? ", setData" : ""}] = useState<${name}Data>(${JSON.stringify(toolWorkflowExamples[key], null, 2)});
  const [last, setLast] = useState<ComponentAction | null>(null);
  const handleAction = (action: ComponentAction) => {
    setLast(action);
${controlled ? handlers[key as keyof typeof handlers] : "    // The consuming application independently validates and executes requests."}
  };
  return <>
    <${name} {...data} onAction={handleAction} />
    <pre aria-label="Last intent">{JSON.stringify(last, null, 2)}</pre>
  </>;
}`;
}

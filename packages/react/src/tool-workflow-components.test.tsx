// Authored SSR/revision contracts. Native focus and async settlement require the new browser packet.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "./component-types.js";
import type { ToolResultCardData, RunningTaskCardData, PartialResultViewerData, QueuedStepListData, ToolTraceViewerData } from "@mcpcn/schemas";
import { ToolResultCard, RunningTaskCard, PartialResultViewer, QueuedStepList, ToolTraceViewer } from "./tool-workflow-components.js";
import * as publicComponents from "./index.js";

const outcome: ToolResultCardData = { id: "result-1", title: "Review reported outcome", tool: "authored_lookup", status: "succeeded", result: { total: 0, enabled: false, owner: null, rows: ["", { exact: true }] } };
const task: RunningTaskCardData = { id: "task-1", title: "Review reported task", status: "running", currentStep: "Read authored records", progress: { completed: 2, total: 4 }, elapsedMs: 0, cancellable: true };
const partial: PartialResultViewerData = { id: "parts-1", title: "Review partial results", status: "partial", parts: [
  { id: "ready", label: "Available part", status: "available", value: { exact: false, count: 0 } },
  { id: "failed", label: "Failed part", status: "failed", message: "Authored part failure", attempt: 2, retryable: true, value: null },
  { id: "pending", label: "Pending part", status: "pending" },
], selectedPartId: "ready" };
const queue: QueuedStepListData = { id: "queue-1", title: "Review queued steps", steps: [
  { id: "later", label: "First supplied step", status: "running", attempt: 1 },
  { id: "earlier", label: "Second supplied step", status: "running", attempt: 3 },
  { id: "failed", label: "Failed step", status: "failed", attempt: 2, retryable: true, message: "Authored step failure" },
], selectedStepId: "failed" };
const trace: ToolTraceViewerData = { id: "trace-1", title: "Review reported trace", events: [
  { id: "child", label: "First supplied event", kind: "output", parentId: "parent", elapsedMs: 0, details: { exact: false, count: 0, owner: null } },
  { id: "parent", label: "Later parent event", kind: "input", details: { request: "authored" } },
], selectedEventId: "child" };
type StatusProps = Pick<ComponentProps<unknown>, "onAction" | "busy" | "error" | "className">;
const callback = () => undefined;
function allMarkup(props: StatusProps = {}, disabled = false) {
  return [<ToolResultCard {...outcome} {...props} disabled={disabled} />, <RunningTaskCard {...task} {...props} disabled={disabled} />,
    <PartialResultViewer {...partial} {...props} disabled={disabled} />, <QueuedStepList {...queue} {...props} disabled={disabled} />,
    <ToolTraceViewer {...trace} {...props} disabled={disabled} />].map(node => renderToStaticMarkup(node));
}
function buttonAttributes(html: string, label: string) {
  const match = [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/g)].find(row => row[2] === label);
  expect(match, `Expected ${label}`).toBeDefined(); return match![1]!;
}
function controlsDisabled(html: string) {
  const controls = [...html.matchAll(/<(?:input|button|select)\b([^>]*)>/g)]; expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) expect(control[1]).toContain('disabled=""');
}

describe("dedicated tool workflow components", () => {
  it("exports five dedicated views and preserves a remaining generic identity", () => {
    expect(publicComponents.ToolResultCard).toBe(ToolResultCard); expect(publicComponents.RunningTaskCard).toBe(RunningTaskCard);
    expect(publicComponents.PartialResultViewer).toBe(PartialResultViewer); expect(publicComponents.QueuedStepList).toBe(QueuedStepList);
    expect(publicComponents.ToolTraceViewer).toBe(ToolTraceViewer); expect(ToolResultCard).not.toBe(publicComponents.GenericAgentComponent);
    expect(publicComponents.RecordInspector).toBe(publicComponents.GenericAgentComponent);
  });

  it("accepts only the four UI props outside strict payload validation", () => {
    const onAction = vi.fn();
    for (const html of allMarkup({ onAction, busy: false, error: "Authored consumer error", className: "authored-class" })) {
      expect(html).not.toContain("data is invalid"); expect(html).toContain('role="region"'); expect(html).toContain("authored-class"); expect(html).toContain("Authored consumer error");
    }
    const invalid = renderToStaticMarkup(<ToolResultCard {...({ ...outcome, unexpected: true } as ToolResultCardData)} onAction={onAction} />);
    expect(invalid).toContain("Tool result data is invalid"); expect(invalid).not.toContain("<button"); expect(onAction).not.toHaveBeenCalled();
  });

  it("blocks all consumer controls without a callback during busy or when disabled", () => {
    for (const html of allMarkup()) controlsDisabled(html);
    for (const html of allMarkup({ onAction: callback, busy: true })) { controlsDisabled(html); expect(html).toContain('aria-busy="true"'); }
    for (const html of allMarkup({ onAction: callback }, true)) controlsDisabled(html);
  });

  it("renders consumer feedback as escaped text without executing callbacks", () => {
    const onAction = vi.fn();
    for (const html of allMarkup({ onAction, error: "<script>consumer()</script>" })) {
      expect(html).toContain("&lt;script&gt;consumer()&lt;/script&gt;"); expect(html).not.toContain("<script>");
    }
    expect(onAction).not.toHaveBeenCalled();
  });

  it("renders complete nested outcome JSON rather than coercing object values", () => {
    const html = renderToStaticMarkup(<ToolResultCard {...outcome} onAction={callback} />);
    for (const text of ["authored_lookup", "result-1", "succeeded", "<details>", "<summary>Result</summary>", "&quot;total&quot;: 0", "&quot;enabled&quot;: false", "&quot;owner&quot;: null", "&quot;exact&quot;: true"]) expect(html).toContain(text);
    expect(html).not.toContain("[object Object]"); expect(html).not.toContain("incomplete"); expect(html).toContain("never executes a tool");
    expect(buttonAttributes(html, "Inspect outcome")).not.toContain("disabled");
  });

  it("distinguishes null false zero and empty outcome strings from missing results", () => {
    for (const result of [null, false, 0, ""]) {
      const html = renderToStaticMarkup(<ToolResultCard {...outcome} result={result} />);
      expect(html).toContain("<summary>Result</summary>"); expect(html).not.toContain("No result was supplied."); expect(html).not.toContain("data is invalid");
    }
  });

  it("labels failed and partial retained outcomes incomplete while preserving failure detail", () => {
    const failed = renderToStaticMarkup(<ToolResultCard {...outcome} status="failed" errorMessage="Authored failure" result={null} onAction={callback} />);
    expect(failed).toContain("Authored failure"); expect(failed).toContain("<summary>Incomplete Result</summary>"); expect(failed).toContain(">null</pre>");
    const missing = renderToStaticMarkup(<ToolResultCard id="missing" title="No retained outcome" tool="lookup" status="failed" errorMessage="Failed before producing a result" />);
    expect(missing).toContain("No result was supplied."); expect(missing).not.toContain("<details>");
    const incomplete = renderToStaticMarkup(<ToolResultCard {...outcome} status="partial" result={false} />);
    expect(incomplete).toContain("This result is incomplete."); expect(incomplete).toContain(">false</pre>");
  });

  it("visibly refuses missing contradictory and non JSON outcomes", () => {
    const circular: Record<string, unknown> = {}; circular.self = circular;
    for (const dto of [{ ...outcome, result: undefined }, { ...outcome, errorMessage: "Contradictory failure" },
      { ...outcome, status: "failed", errorMessage: undefined }, { ...outcome, status: "complete" },
      { ...outcome, result: circular }, { ...outcome, result: { unsupported: undefined } }, { ...outcome, result: NaN }]) {
      const html = renderToStaticMarkup(<ToolResultCard {...dto as ToolResultCardData} />); expect(html).toContain("Tool result data is invalid"); expect(html).not.toContain("<button");
    }
  });

  it("replaces outcome revision identity when the inspected operation changes", () => {
    const key = ToolResultCard(outcome).key;
    expect(ToolResultCard({ ...outcome, busy: true, error: "UI failure", onAction: callback }).key).toBe(key);
    expect(ToolResultCard({ ...outcome, result: { total: 1 } }).key).not.toBe(key);
    expect(ToolResultCard({ ...outcome, id: "result-2" }).key).not.toBe(key);
    expect(ToolResultCard({ ...outcome, tool: "other_lookup" }).key).not.toBe(key);
  });

  it("keeps a fully reported running progress count explicitly running", () => {
    const html = renderToStaticMarkup(<RunningTaskCard {...task} progress={{ completed: 4, total: 4 }} onAction={callback} />);
    expect(html).toContain('aria-label="Reported task progress"'); expect(html).toMatch(/<progress[^>]*max="4"/); expect(html).toMatch(/<progress[^>]*value="4"/);
    expect(html).toContain("4 of 4 reported steps"); expect(html).toContain("Reported task status: <strong>running</strong>");
    expect(html).toContain("Progress counts do not determine the reported status."); expect(html).not.toContain("<strong>completed</strong>");
  });

  it("shows only supplied elapsed time and never invents missing progress", () => {
    expect(renderToStaticMarkup(<RunningTaskCard {...task} />)).toContain("0 ms reported elapsed");
    const html = renderToStaticMarkup(<RunningTaskCard id="queued" title="Queued task" status="queued" />);
    expect(html).toContain("No progress counts were supplied."); expect(html).not.toContain("<progress"); expect(html).not.toContain("ms reported elapsed"); expect(html).toContain("No timer runs here.");
  });

  it("offers cancellation only for explicitly cancellable active reported states", () => {
    for (const status of ["queued", "running", "paused"] as const) expect(renderToStaticMarkup(<RunningTaskCard {...task} status={status} progress={{ completed: 0, total: 4 }} onAction={callback} />)).toContain(">Request cancellation</button>");
    for (const status of ["completed", "failed", "cancelled"] as const) expect(renderToStaticMarkup(<RunningTaskCard {...task} status={status} progress={{ completed: 4, total: 4 }} onAction={callback} />)).not.toContain(">Request cancellation</button>");
    expect(renderToStaticMarkup(<RunningTaskCard {...task} cancellable={false} />)).not.toContain(">Request cancellation</button>");
  });

  it("refuses impossible progress and contradictory task error data before rendering actions", () => {
    for (const patch of [{ progress: { completed: 5, total: 4 } }, { progress: { completed: 0, total: 0 } },
      { status: "queued", progress: { completed: 1, total: 4 } }, { status: "completed", progress: { completed: 1, total: 4 } },
      { elapsedMs: -1 }, { elapsedMs: 1.5 }, { errorMessage: "Only failure may carry this" }]) {
      const html = renderToStaticMarkup(<RunningTaskCard {...{ ...task, ...patch } as RunningTaskCardData} />); expect(html).toContain("Running task data is invalid"); expect(html).not.toContain("<button");
    }
  });

  it("preserves task operation revision during progress updates and fences identity or status changes", () => {
    const key = RunningTaskCard(task).key;
    expect(RunningTaskCard({ ...task, progress: { completed: 3, total: 4 }, elapsedMs: 12, currentStep: "Read the next record" }).key).toBe(key);
    expect(RunningTaskCard({ ...task, busy: true, error: "Consumer failure" }).key).toBe(key);
    expect(RunningTaskCard({ ...task, status: "paused" }).key).not.toBe(key); expect(RunningTaskCard({ ...task, id: "task-2" }).key).not.toBe(key);
  });

  it("renders supplied part order availability counts and complete selected JSON", () => {
    const html = renderToStaticMarkup(<PartialResultViewer {...partial} onAction={callback} />);
    expect(html.indexOf("Select part: Available part")).toBeLessThan(html.indexOf("Select part: Failed part")); expect(html.indexOf("Select part: Failed part")).toBeLessThan(html.indexOf("Select part: Pending part"));
    expect(html).toContain("1 of 3 parts available"); expect(html).toContain('aria-label="Selected result part"'); expect(html).toContain("&quot;exact&quot;: false"); expect(html).toContain("&quot;count&quot;: 0");
    expect(buttonAttributes(html, "Inspect part")).not.toContain("disabled"); expect(html).not.toContain(">Request part retry</button>");
  });

  it("treats an empty complete result honestly without deriving other overall states", () => {
    for (const status of ["streaming", "partial", "complete", "failed"] as const) {
      const html = renderToStaticMarkup(<PartialResultViewer id="empty" title="Empty result" status={status} parts={[]} />);
      expect(html).toContain("No result parts were supplied."); expect(html).toContain("0 of 0 parts available"); expect(html).toContain(`Reported result status: <strong>${status}</strong>`); expect(html).not.toContain("<button");
    }
  });

  it("lets pending parts be inspected without manufacturing values or retry controls", () => {
    const html = renderToStaticMarkup(<PartialResultViewer {...partial} selectedPartId="pending" onAction={callback} />);
    expect(html).toContain("This part is pending. No value is available."); expect(buttonAttributes(html, "Inspect part")).not.toContain("disabled"); expect(html).not.toContain("<details>"); expect(html).not.toContain(">Request part retry</button>");
  });

  it("shows failed part attempts incomplete null content and explicit retry availability", () => {
    const html = renderToStaticMarkup(<PartialResultViewer {...partial} selectedPartId="failed" onAction={callback} />);
    expect(html).toContain("Authored part failure"); expect(html).toContain("Attempt 2"); expect(html).toContain("Incomplete part value"); expect(html).toContain(">null</pre>"); expect(buttonAttributes(html, "Request part retry")).not.toContain("disabled");
    const notRetryable = { ...partial, selectedPartId: "failed", parts: partial.parts.map(part => ({ ...part, retryable: false })) };
    expect(renderToStaticMarkup(<PartialResultViewer {...notRetryable} onAction={callback} />)).not.toContain(">Request part retry</button>");
  });

  it("refuses stale duplicate contradictory and malformed partial states visibly", () => {
    for (const patch of [{ selectedPartId: "removed" }, { parts: [partial.parts[0], partial.parts[0]] },
      { parts: [{ id: "bad", label: "Missing value", status: "available" }] }, { parts: [{ id: "bad", label: "Pending value", status: "pending", value: null }] },
      { status: "complete" }, { parts: [{ id: "bad", label: "Available retry", status: "available", value: 0, retryable: true }] }]) {
      const html = renderToStaticMarkup(<PartialResultViewer {...{ ...partial, ...patch } as PartialResultViewerData} />); expect(html).toContain("Partial result data is invalid"); expect(html).not.toContain("<input"); expect(html).not.toContain("<button");
    }
  });

  it("keeps the part list revision stable across controlled selection and unrelated appends", () => {
    const key = PartialResultViewer(partial).key;
    expect(PartialResultViewer({ ...partial, selectedPartId: "failed" }).key).toBe(key);
    expect(PartialResultViewer({ ...partial, status: "streaming", parts: [...partial.parts, { id: "extra", label: "Later part", status: "pending" }] }).key).toBe(key);
    expect(PartialResultViewer({ ...partial, id: "parts-2" }).key).not.toBe(key);
  });

  it("retains queue order concurrent running reports and source attempt counts", () => {
    const html = renderToStaticMarkup(<QueuedStepList {...queue} onAction={callback} />);
    expect(html.indexOf("Select step: First supplied step")).toBeLessThan(html.indexOf("Select step: Second supplied step"));
    expect(html.indexOf("Select step: Second supplied step")).toBeLessThan(html.indexOf("Select step: Failed step"));
    expect(html.match(/>running<\/span>/g)).toHaveLength(2); expect(html).toContain("Attempt 3"); expect(html).toContain("never starts, advances or retries a step");
  });

  it("renders an empty queue and permits inspection of a zero attempt queued step", () => {
    expect(renderToStaticMarkup(<QueuedStepList id="empty" title="Empty queue" steps={[]} />)).toContain("No queued steps were supplied.");
    const html = renderToStaticMarkup(<QueuedStepList id="queued" title="Queued state" steps={[{ id: "new", label: "Unattempted", status: "queued" }]} selectedStepId="new" onAction={callback} />);
    expect(html).toContain("Attempt 0"); expect(buttonAttributes(html, "Inspect step")).not.toContain("disabled"); expect(html).not.toContain(">Request step retry</button>");
  });

  it("shows a step retry only for the selected explicitly retryable failure", () => {
    const html = renderToStaticMarkup(<QueuedStepList {...queue} onAction={callback} />);
    expect(html).toContain("Authored step failure"); expect(html).toContain('aria-label="Selected queued step"'); expect(buttonAttributes(html, "Request step retry")).not.toContain("disabled");
    expect(renderToStaticMarkup(<QueuedStepList {...queue} selectedStepId="later" onAction={callback} />)).not.toContain(">Request step retry</button>");
    expect(renderToStaticMarkup(<QueuedStepList {...queue} steps={queue.steps.map(step => ({ ...step, retryable: false }))} onAction={callback} />)).not.toContain(">Request step retry</button>");
  });

  it("refuses stale queue selection duplicate steps and invalid retry attempts", () => {
    for (const patch of [{ selectedStepId: "removed" }, { steps: [queue.steps[0], queue.steps[0]] },
      { steps: [{ id: "bad", label: "No attempt", status: "running", attempt: 0 }] }, { steps: [{ id: "bad", label: "Fraction", status: "failed", attempt: 1.5 }] },
      { steps: [{ id: "bad", label: "Queued retry", status: "queued", retryable: true }] }]) {
      const html = renderToStaticMarkup(<QueuedStepList {...{ ...queue, ...patch } as QueuedStepListData} />); expect(html).toContain("Queued step data is invalid"); expect(html).not.toContain("<input"); expect(html).not.toContain("<button");
    }
  });

  it("keeps the queue list revision stable when selection or unrelated steps change", () => {
    const key = QueuedStepList(queue).key;
    expect(QueuedStepList({ ...queue, selectedStepId: "later" }).key).toBe(key);
    expect(QueuedStepList({ ...queue, steps: [...queue.steps, { id: "extra", label: "Appended step", status: "queued" }] }).key).toBe(key);
    expect(QueuedStepList({ ...queue, id: "queue-2" }).key).not.toBe(key);
  });

  it("shows trace consumer order later parent identity zero elapsed and complete selected details", () => {
    const html = renderToStaticMarkup(<ToolTraceViewer {...trace} onAction={callback} />);
    expect(html.indexOf("Select event: First supplied event")).toBeLessThan(html.indexOf("Select event: Later parent event")); expect(html).toContain("Parent event: <code>parent</code>");
    expect(html).toContain("0 ms reported elapsed"); expect(html).toContain("Event details"); expect(html).toContain("&quot;owner&quot;: null"); expect(html).toContain("&quot;count&quot;: 0"); expect(html).toContain("Inspection never sends event details.");
  });

  it("conceals filtered selected details and distinguishes empty traces from no matches", () => {
    const hidden = renderToStaticMarkup(<ToolTraceViewer {...trace} filterKind="error" onAction={callback} />);
    expect(hidden).toContain("No events match this filter."); expect(hidden).toContain("The selected event is hidden by the current filter."); expect(hidden).not.toContain("Event details</summary>"); expect(hidden).not.toContain("&quot;owner&quot;"); expect(buttonAttributes(hidden, "Inspect event")).toContain('disabled=""');
    const empty = renderToStaticMarkup(<ToolTraceViewer id="empty" title="Empty trace" events={[]} onAction={callback} />);
    expect(empty).toContain("No trace events were supplied."); expect(empty).not.toContain("No events match this filter.");
  });

  it("refuses missing cyclic self parent duplicate and unsupported trace states", () => {
    for (const patch of [{ selectedEventId: "removed" }, { filterKind: "other" }, { events: [trace.events[0], trace.events[0]] },
      { events: [{ id: "self", label: "Self", kind: "note", parentId: "self" }] }, { events: [{ id: "orphan", label: "Orphan", kind: "note", parentId: "missing" }] },
      { events: [{ id: "a", label: "A", kind: "note", parentId: "b" }, { id: "b", label: "B", kind: "note", parentId: "a" }] },
      { events: [{ id: "bad", label: "Negative time", kind: "note", elapsedMs: -1 }] }]) {
      const html = renderToStaticMarkup(<ToolTraceViewer {...{ ...trace, ...patch } as ToolTraceViewerData} />); expect(html).toContain("Tool trace data is invalid"); expect(html).not.toContain("<select"); expect(html).not.toContain("<button");
    }
  });

  it("keeps trace control revision stable during filtering selection and unrelated appends", () => {
    const key = ToolTraceViewer(trace).key;
    expect(ToolTraceViewer({ ...trace, filterKind: "input", selectedEventId: "parent" }).key).toBe(key);
    expect(ToolTraceViewer({ ...trace, events: [...trace.events, { id: "extra", label: "Appended note", kind: "note" }] }).key).toBe(key);
    expect(ToolTraceViewer({ ...trace, id: "trace-2" }).key).not.toBe(key);
  });

  it("escapes complete result part and trace strings without constructing links or executable markup", () => {
    const value = { html: "<script>authored()</script>", link: "javascript:authored()", tail: "COMPLETE_JSON_TAIL" }, onAction = vi.fn();
    const htmls = [renderToStaticMarkup(<ToolResultCard {...outcome} result={value} onAction={onAction} />),
      renderToStaticMarkup(<PartialResultViewer {...partial} parts={[{ id: "ready", label: "Available", status: "available", value }]} onAction={onAction} />),
      renderToStaticMarkup(<ToolTraceViewer {...trace} events={[{ id: "child", label: "Output", kind: "output", details: value }]} onAction={onAction} />)];
    for (const html of htmls) { expect(html).toContain("&lt;script&gt;"); expect(html).toContain("COMPLETE_JSON_TAIL"); expect(html).not.toContain("<script>"); expect(html).not.toContain("href="); expect(html).not.toContain("<iframe"); }
    expect(onAction).not.toHaveBeenCalled();
  });
});

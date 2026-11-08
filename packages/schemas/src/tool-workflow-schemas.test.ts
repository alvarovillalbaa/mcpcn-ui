import { describe, expect, it } from "vitest";
import {
  ToolResultCardSchema, RunningTaskCardSchema, PartialResultViewerSchema, QueuedStepListSchema, ToolTraceViewerSchema,
  InspectableJSONSchema, GenericComponentSchema, RecordInspectorSchema, ToolCallCardSchema, schemaBySlug, toJSONSchema,
} from "./index.js";

const outcome = () => ({ id: "result-1", title: "Inspect outcome", tool: "find-records", status: "succeeded" as const, result: { count: 0 } });
const task = () => ({ id: "task-1", title: "Inspect task", status: "running" as const });
const partial = () => ({ id: "partial-1", title: "Inspect partial results", status: "partial" as const, parts: [
  { id: "first", label: "First result", status: "available" as const, value: false },
  { id: "second", label: "Second result", status: "failed" as const, message: "Authored failure", retryable: true, attempt: 2 },
  { id: "third", label: "Third result", status: "pending" as const },
] });
const queue = () => ({ id: "queue-1", title: "Inspect queued steps", steps: [
  { id: "one", label: "First step", status: "queued" as const },
  { id: "two", label: "Second step", status: "failed" as const, attempt: 2, retryable: true },
] });
const trace = () => ({ id: "trace-1", title: "Inspect trace", events: [
  { id: "later-child", label: "Child output", kind: "output" as const, parentId: "parent", details: null },
  { id: "parent", label: "Tool input", kind: "input" as const, elapsedMs: 0, details: { query: "Authored query" } },
] });
const examples = () => [
  { schema: ToolResultCardSchema, data: outcome() }, { schema: RunningTaskCardSchema, data: task() },
  { schema: PartialResultViewerSchema, data: partial() }, { schema: QueuedStepListSchema, data: queue() },
  { schema: ToolTraceViewerSchema, data: trace() },
];
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
function boundaryPayload() {
  const value = { id: "boundary", title: "Exact collective boundary", status: "partial" as const, disabled: false,
    inspectLabel: "Inspect part", retryLabel: "Request part retry",
    parts: Array.from({ length: 27 }, (_, index) => ({ id: `part-${index}`, label: `Part ${index}`, status: "available" as const, value: "", attempt: 1, retryable: false })) };
  let remaining = 262144 - bytes(value);
  for (const part of value.parts) { const count = Math.min(10000, remaining); part.value = "x".repeat(count); remaining -= count; }
  if (remaining !== 0) throw new Error("Authored boundary fixture does not fill the budget.");
  return value;
}

describe("tool workflow shared schema contract", () => {
  it("exports five dedicated schemas and keeps an unrelated generic alias", () => {
    expect(schemaBySlug["tool-result-card"]).toBe(ToolResultCardSchema);
    expect(schemaBySlug["running-task-card"]).toBe(RunningTaskCardSchema);
    expect(schemaBySlug["partial-result-viewer"]).toBe(PartialResultViewerSchema);
    expect(schemaBySlug["queued-step-list"]).toBe(QueuedStepListSchema);
    expect(schemaBySlug["tool-trace-viewer"]).toBe(ToolTraceViewerSchema);
    expect(RecordInspectorSchema).toBe(GenericComponentSchema);
    for (const { schema } of examples()) expect(schema).not.toBe(GenericComponentSchema);
    expect(Object.keys(schemaBySlug)).toHaveLength(26);
  });

  it("requires trimmed bounded stable identities and visible titles", () => {
    for (const { schema, data } of examples()) {
      const { id: _id, title: _title, ...missing } = data;
      expect(schema.safeParse(missing).success).toBe(false);
      for (const id of ["", " ", " padded", "padded ", "line\nbreak", "tab\t", "nul\u0000", "del\u007f", "x".repeat(129)]) expect(schema.safeParse({ ...data, id }).success).toBe(false);
      expect(schema.safeParse({ ...data, id: "record-東京", title: "Review\tcurrent\nresults" }).success).toBe(true);
      for (const title of ["", " ", "x".repeat(241)]) expect(schema.safeParse({ ...data, title }).success).toBe(false);
    }
  });

  it("bounds provided visible text and refuses unsupported text controls", () => {
    for (const { schema, data } of examples()) {
      for (const description of ["", " \n\t", "x".repeat(2001), "escape\u001b", "del\u007f", "vertical\u000b"]) expect(schema.safeParse({ ...data, description }).success).toBe(false);
      expect(schema.safeParse({ ...data, description: "Line one\nLine two\tannotation" }).success).toBe(true);
      expect(schema.safeParse({ ...data, inspectLabel: "x".repeat(121) }).success).toBe(false);
      expect(schema.safeParse({ ...data, inspectLabel: " " }).success).toBe(false);
    }
    expect(PartialResultViewerSchema.safeParse({ ...partial(), parts: [{ id: "x", label: "x".repeat(501), status: "pending" }] }).success).toBe(false);
  });

  it("defaults disabled and refuses unknown data or runtime UI props", () => {
    for (const { schema, data } of examples()) {
      expect(schema.parse(data).disabled).toBe(false);
      expect(schema.parse({ ...data, disabled: true }).disabled).toBe(true);
      for (const extra of [{ disabled: "false" }, { busy: false }, { error: "Injected error" }, { className: "injected" }, { onAction: () => undefined }, { unknown: true }]) expect(schema.safeParse({ ...data, ...extra }).success).toBe(false);
    }
  });

  it("preserves explicit false zero null empty and whitespace JSON values", () => {
    for (const value of [null, false, 0, "", " \n\t", { text: "", flag: false, count: 0, missing: null }, [null, false, 0, ""]]) {
      expect(ToolResultCardSchema.parse({ ...outcome(), result: value }).result).toEqual(value);
      expect(PartialResultViewerSchema.parse({ ...partial(), parts: [{ id: "x", label: "X", status: "available", value }] }).parts[0]?.value).toEqual(value);
      expect(ToolTraceViewerSchema.parse({ ...trace(), events: [{ id: "x", label: "X", kind: "note", details: value }] }).events[0]?.details).toEqual(value);
    }
  });

  it("reuses the old finite acyclic descriptor-safe JSON guard without invoking getters", () => {
    let calls = 0;
    const getter = Object.defineProperty({}, "secret", { enumerable: true, get: () => { calls++; return "unexpected"; } });
    const cyclic: { self?: unknown } = {}; cyclic.self = cyclic;
    const symbolic = { [Symbol("hidden")]: "not JSON" }, hole = Array(1);
    for (const result of [NaN, Infinity, -Infinity, undefined, 1n, Symbol("x"), () => undefined, new Date(0), new Map(), cyclic, getter, symbolic, hole]) {
      expect(InspectableJSONSchema.safeParse(result).success).toBe(false);
      expect(ToolResultCardSchema.safeParse({ ...outcome(), result }).success).toBe(false);
    }
    expect(PartialResultViewerSchema.safeParse({ ...partial(), parts: [{ id: "getter", label: "Getter", status: "available", value: getter }] }).success).toBe(false);
    expect(ToolTraceViewerSchema.safeParse({ ...trace(), events: [{ id: "getter", label: "Getter", kind: "note", details: getter }] }).success).toBe(false);
    expect(calls).toBe(0);
    expect(InspectableJSONSchema.parse({ value: [0, false, null, ""] })).toEqual({ value: [0, false, null, ""] });
    expect(ToolCallCardSchema.safeParse({ id: "old-call", tool: "old-tool", status: "succeeded", result: { value: 0 } }).success).toBe(true);
  });
});

describe("tool result outcome rules", () => {
  it("requires supplied results for succeeded and partial outcomes", () => {
    const { result: _result, ...missing } = outcome();
    expect(ToolResultCardSchema.safeParse(missing).success).toBe(false);
    expect(ToolResultCardSchema.safeParse({ ...missing, status: "partial" }).success).toBe(false);
    expect(ToolResultCardSchema.safeParse({ ...missing, status: "partial", result: null }).success).toBe(true);
    expect(ToolResultCardSchema.safeParse({ ...missing, result: undefined }).success).toBe(false);
  });

  it("requires failure detail while allowing retained incomplete content", () => {
    expect(ToolResultCardSchema.safeParse({ ...outcome(), status: "failed" }).success).toBe(false);
    for (const errorMessage of ["", " ", "x".repeat(2001)]) expect(ToolResultCardSchema.safeParse({ ...outcome(), status: "failed", errorMessage }).success).toBe(false);
    const value = ToolResultCardSchema.parse({ id: "failure", title: "Failed outcome", tool: "lookup", status: "failed", errorMessage: "The producer failed.", result: false });
    expect(value).toMatchObject({ status: "failed", result: false, resultLabel: "Result", inspectLabel: "Inspect outcome", disabled: false });
  });

  it("forbids error detail on success and permits it on explicit partial outcomes", () => {
    expect(ToolResultCardSchema.safeParse({ ...outcome(), errorMessage: "Not a successful result." }).success).toBe(false);
    expect(ToolResultCardSchema.parse({ ...outcome(), status: "partial", errorMessage: "Some sources failed." }).status).toBe("partial");
  });

  it("distinguishes an absent failed result from supplied null", () => {
    const data = { id: "failed", title: "Failed outcome", tool: "lookup", status: "failed", errorMessage: "No result arrived." };
    expect(ToolResultCardSchema.parse(data)).not.toHaveProperty("result");
    expect(ToolResultCardSchema.parse({ ...data, result: null })).toHaveProperty("result", null);
    expect(ToolResultCardSchema.safeParse({ ...data, tool: " padded" }).success).toBe(false);
    expect(ToolResultCardSchema.safeParse({ ...data, resultLabel: "x".repeat(501) }).success).toBe(false);
  });

  it("retains existing per-value depth node string and object-shape refusals", () => {
    let deep: unknown = null; for (let index = 0; index < 10; index++) deep = [deep];
    for (const result of [deep, "x".repeat(10001), Array.from({ length: 201 }, () => null), Object.fromEntries(Array.from({ length: 201 }, (_, index) => [`k${index}`, null]))]) expect(ToolResultCardSchema.safeParse({ ...outcome(), result }).success).toBe(false);
    expect(ToolResultCardSchema.safeParse({ ...outcome(), result: { nested: ["a", { b: 0 }] } }).success).toBe(true);
  });
});

describe("reported running task states", () => {
  it("defaults controls while leaving absent timing and progress unknown", () => {
    const parsed = RunningTaskCardSchema.parse(task());
    expect(parsed).toMatchObject({ status: "running", cancellable: false, inspectLabel: "Inspect task", cancelLabel: "Request cancellation" });
    expect(parsed).not.toHaveProperty("elapsedMs"); expect(parsed).not.toHaveProperty("progress");
    expect(RunningTaskCardSchema.safeParse({ ...task(), currentStep: "Read\ncurrent sources" }).success).toBe(true);
  });

  it("requires safe nonnegative elapsed and progress integers", () => {
    for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, true, "1"]) {
      expect(RunningTaskCardSchema.safeParse({ ...task(), elapsedMs: value }).success).toBe(false);
      expect(RunningTaskCardSchema.safeParse({ ...task(), progress: { completed: value, total: 10 } }).success).toBe(false);
    }
    expect(RunningTaskCardSchema.safeParse({ ...task(), elapsedMs: Number.MAX_SAFE_INTEGER }).success).toBe(true);
  });

  it("requires positive progress totals and prevents over-completion", () => {
    for (const total of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, true]) expect(RunningTaskCardSchema.safeParse({ ...task(), progress: { completed: 0, total } }).success).toBe(false);
    expect(RunningTaskCardSchema.safeParse({ ...task(), progress: { completed: 4, total: 3 } }).success).toBe(false);
    expect(RunningTaskCardSchema.safeParse({ ...task(), progress: { completed: 0, total: 1, ignored: true } }).success).toBe(false);
  });

  it("requires zero reported completion on queued tasks", () => {
    expect(RunningTaskCardSchema.safeParse({ ...task(), status: "queued", progress: { completed: 1, total: 10 } }).success).toBe(false);
    expect(RunningTaskCardSchema.safeParse({ ...task(), status: "queued", progress: { completed: 0, total: 10 } }).success).toBe(true);
    expect(RunningTaskCardSchema.safeParse({ ...task(), status: "queued" }).success).toBe(true);
  });

  it("checks completed progress without inferring completion from a percentage", () => {
    expect(RunningTaskCardSchema.safeParse({ ...task(), status: "completed", progress: { completed: 2, total: 3 } }).success).toBe(false);
    expect(RunningTaskCardSchema.safeParse({ ...task(), status: "completed", progress: { completed: 3, total: 3 } }).success).toBe(true);
    expect(RunningTaskCardSchema.safeParse({ ...task(), status: "completed" }).success).toBe(true);
    expect(RunningTaskCardSchema.parse({ ...task(), progress: { completed: 3, total: 3 } }).status).toBe("running");
  });

  it("limits failure detail to failed status without treating cancellation capability as execution", () => {
    for (const status of ["queued", "running", "paused", "completed", "cancelled"]) expect(RunningTaskCardSchema.safeParse({ ...task(), status, errorMessage: "Failure detail" }).success).toBe(false);
    expect(RunningTaskCardSchema.safeParse({ ...task(), status: "failed", errorMessage: "Failure detail" }).success).toBe(true);
    expect(RunningTaskCardSchema.safeParse({ ...task(), status: "failed" }).success).toBe(true);
    expect(RunningTaskCardSchema.parse({ ...task(), status: "completed", cancellable: true }).cancellable).toBe(true);
    expect(RunningTaskCardSchema.safeParse({ ...task(), cancellable: "true" }).success).toBe(false);
  });
});

describe("partial result availability and retry rules", () => {
  it("defaults part operations and permits selected unavailable parts", () => {
    const parsed = PartialResultViewerSchema.parse({ ...partial(), selectedPartId: "third" });
    expect(parsed).toMatchObject({ inspectLabel: "Inspect part", retryLabel: "Request part retry", selectedPartId: "third" });
    expect(parsed.parts[0]).toMatchObject({ attempt: 1, retryable: false, value: false });
    expect(parsed.parts[2]).toMatchObject({ attempt: 1, retryable: false, status: "pending" });
  });

  it("requires a supplied value for an available part", () => {
    for (const extra of [{}, { value: undefined }]) expect(PartialResultViewerSchema.safeParse({ ...partial(), parts: [{ id: "x", label: "X", status: "available", ...extra }] }).success).toBe(false);
    expect(PartialResultViewerSchema.safeParse({ ...partial(), parts: [{ id: "x", label: "X", status: "available", value: null }] }).success).toBe(true);
  });

  it("requires failed-part messages and preserves optional retained values", () => {
    for (const message of [undefined, "", " "]) expect(PartialResultViewerSchema.safeParse({ ...partial(), parts: [{ id: "x", label: "X", status: "failed", message }] }).success).toBe(false);
    expect(PartialResultViewerSchema.parse({ ...partial(), parts: [{ id: "x", label: "X", status: "failed", message: "Failed", value: 0 }] }).parts[0]?.value).toBe(0);
    expect(PartialResultViewerSchema.parse({ ...partial(), parts: [{ id: "x", label: "X", status: "failed", message: "Failed" }] }).parts[0]).not.toHaveProperty("value");
  });

  it("refuses pending value or message properties including explicit undefined", () => {
    for (const extra of [{ value: null }, { value: false }, { value: undefined }, { message: "Waiting" }, { message: undefined }]) expect(PartialResultViewerSchema.safeParse({ ...partial(), parts: [{ id: "x", label: "X", status: "pending", ...extra }] }).success).toBe(false);
    expect(PartialResultViewerSchema.safeParse({ ...partial(), parts: [{ id: "x", label: "X", status: "pending" }] }).success).toBe(true);
  });

  it("restricts retries to failed parts and bounds actual attempt numbers", () => {
    for (const part of [{ id: "x", label: "X", status: "available", value: null, retryable: true }, { id: "x", label: "X", status: "pending", retryable: true }, { id: "x", label: "X", status: "failed", message: "Failed", retryable: "true" }]) expect(PartialResultViewerSchema.safeParse({ ...partial(), parts: [part] }).success).toBe(false);
    for (const attempt of [0, -1, 1.5, 1001, Infinity, true]) expect(PartialResultViewerSchema.safeParse({ ...partial(), parts: [{ id: "x", label: "X", status: "failed", message: "Failed", attempt }] }).success).toBe(false);
    expect(PartialResultViewerSchema.safeParse({ ...partial(), parts: [{ id: "x", label: "X", status: "failed", message: "Failed", attempt: 1000, retryable: true }] }).success).toBe(true);
  });

  it("requires all parts available only for explicit complete status", () => {
    expect(PartialResultViewerSchema.safeParse({ ...partial(), status: "complete" }).success).toBe(false);
    expect(PartialResultViewerSchema.safeParse({ ...partial(), status: "complete", parts: [] }).success).toBe(true);
    expect(PartialResultViewerSchema.safeParse({ ...partial(), status: "complete", parts: [{ id: "x", label: "X", status: "available", value: "" }] }).success).toBe(true);
    for (const status of ["streaming", "partial", "failed"]) expect(PartialResultViewerSchema.parse({ ...partial(), status, parts: [{ id: "x", label: "X", status: "available", value: 0 }] }).status).toBe(status);
  });

  it("requires unique current part references and bounds the collection", () => {
    expect(PartialResultViewerSchema.safeParse({ ...partial(), parts: [partial().parts[0], partial().parts[0]] }).success).toBe(false);
    expect(PartialResultViewerSchema.safeParse({ ...partial(), selectedPartId: "removed" }).success).toBe(false);
    const parts = Array.from({ length: 100 }, (_, index) => ({ id: `p${index}`, label: "Part", status: "pending" }));
    expect(PartialResultViewerSchema.safeParse({ ...partial(), parts }).success).toBe(true);
    expect(PartialResultViewerSchema.safeParse({ ...partial(), parts: [...parts, { id: "overflow", label: "Part", status: "pending" }] }).success).toBe(false);
    expect(PartialResultViewerSchema.safeParse({ ...partial(), parts: [{ id: "x", label: "X", status: "pending", ignored: true }] }).success).toBe(false);
  });
});

describe("queued step inspection rules", () => {
  it("keeps empty queues original order and concurrent running steps valid", () => {
    expect(QueuedStepListSchema.parse({ ...queue(), steps: [] })).toMatchObject({ steps: [], inspectLabel: "Inspect step", retryLabel: "Request step retry" });
    expect(QueuedStepListSchema.parse(queue()).steps[0]).toMatchObject({ attempt: 0, retryable: false });
    const steps = [{ id: "z", label: "Z", status: "running", attempt: 1 }, { id: "a", label: "A", status: "running", attempt: 2 }];
    expect(QueuedStepListSchema.parse({ ...queue(), steps }).steps.map(step => step.id)).toEqual(["z", "a"]);
  });

  it("requires an actual attempt for running succeeded and failed steps", () => {
    for (const status of ["running", "succeeded", "failed"]) {
      expect(QueuedStepListSchema.safeParse({ ...queue(), steps: [{ id: "x", label: "X", status }] }).success).toBe(false);
      expect(QueuedStepListSchema.safeParse({ ...queue(), steps: [{ id: "x", label: "X", status, attempt: 1 }] }).success).toBe(true);
    }
    for (const status of ["queued", "skipped", "cancelled"]) expect(QueuedStepListSchema.safeParse({ ...queue(), steps: [{ id: "x", label: "X", status, attempt: 0 }] }).success).toBe(true);
  });

  it("restricts queued retry flags and refuses invalid attempt values", () => {
    for (const status of ["queued", "running", "succeeded", "skipped", "cancelled"]) expect(QueuedStepListSchema.safeParse({ ...queue(), steps: [{ id: "x", label: "X", status, attempt: 1, retryable: true }] }).success).toBe(false);
    for (const attempt of [-1, 1.5, 1001, Infinity, Number.MAX_SAFE_INTEGER + 1, true]) expect(QueuedStepListSchema.safeParse({ ...queue(), steps: [{ id: "x", label: "X", status: "queued", attempt }] }).success).toBe(false);
    expect(QueuedStepListSchema.safeParse({ ...queue(), steps: [{ id: "x", label: "X", status: "failed", attempt: 1000, retryable: true }] }).success).toBe(true);
  });

  it("requires unique current step identities within one hundred entries", () => {
    expect(QueuedStepListSchema.safeParse({ ...queue(), selectedStepId: "removed" }).success).toBe(false);
    expect(QueuedStepListSchema.safeParse({ ...queue(), steps: [queue().steps[0], queue().steps[0]] }).success).toBe(false);
    const steps = Array.from({ length: 100 }, (_, index) => ({ id: `s${index}`, label: "Step", status: "queued" }));
    expect(QueuedStepListSchema.safeParse({ ...queue(), steps, selectedStepId: "s99" }).success).toBe(true);
    expect(QueuedStepListSchema.safeParse({ ...queue(), steps: [...steps, { id: "overflow", label: "Step", status: "queued" }] }).success).toBe(false);
  });

  it("refuses unknown step fields states and invalid optional messages", () => {
    for (const extra of [{ ignored: true }, { status: "waiting" }, { message: "" }, { message: "x".repeat(2001) }, { retryable: 1 }]) expect(QueuedStepListSchema.safeParse({ ...queue(), steps: [{ id: "x", label: "X", status: "queued", ...extra }] }).success).toBe(false);
    expect(QueuedStepListSchema.safeParse({ ...queue(), steps: [{ id: " padded", label: "X", status: "queued" }] }).success).toBe(false);
  });
});

describe("trace parent references and controlled filtering", () => {
  it("defaults the filter and permits empty or currently hidden selections", () => {
    expect(ToolTraceViewerSchema.parse({ ...trace(), events: [] })).toMatchObject({ events: [], filterKind: "all", inspectLabel: "Inspect event" });
    expect(ToolTraceViewerSchema.parse({ ...trace(), filterKind: "error", selectedEventId: "later-child" })).toMatchObject({ filterKind: "error", selectedEventId: "later-child" });
  });

  it("accepts later-array parents and preserves the supplied event order", () => {
    const parsed = ToolTraceViewerSchema.parse(trace());
    expect(parsed.events.map(event => event.id)).toEqual(["later-child", "parent"]);
    expect(parsed.events[0]).toMatchObject({ parentId: "parent", details: null });
    expect(parsed.events[1]?.elapsedMs).toBe(0);
  });

  it("refuses missing and self-referential parents", () => {
    for (const parentId of ["missing", "x"]) expect(ToolTraceViewerSchema.safeParse({ ...trace(), events: [{ id: "x", label: "X", kind: "note", parentId }] }).success).toBe(false);
  });

  it("refuses short long and disconnected cyclic parent graphs", () => {
    const two = [{ id: "a", label: "A", kind: "input", parentId: "b" }, { id: "b", label: "B", kind: "output", parentId: "a" }];
    const three = [{ id: "a", label: "A", kind: "input", parentId: "b" }, { id: "b", label: "B", kind: "progress", parentId: "c" }, { id: "c", label: "C", kind: "output", parentId: "a" }];
    expect(ToolTraceViewerSchema.safeParse({ ...trace(), events: two }).success).toBe(false);
    expect(ToolTraceViewerSchema.safeParse({ ...trace(), events: three }).success).toBe(false);
    expect(ToolTraceViewerSchema.safeParse({ ...trace(), events: [{ id: "root", label: "Root", kind: "note" }, ...three] }).success).toBe(false);
  });

  it("requires unique current trace selections within one hundred events", () => {
    expect(ToolTraceViewerSchema.safeParse({ ...trace(), selectedEventId: "missing" }).success).toBe(false);
    expect(ToolTraceViewerSchema.safeParse({ ...trace(), events: [trace().events[1], trace().events[1]] }).success).toBe(false);
    const events = Array.from({ length: 100 }, (_, index) => ({ id: `e${index}`, label: "Event", kind: "note" }));
    expect(ToolTraceViewerSchema.safeParse({ ...trace(), events, selectedEventId: "e99" }).success).toBe(true);
    expect(ToolTraceViewerSchema.safeParse({ ...trace(), events: [...events, { id: "overflow", label: "Event", kind: "note" }] }).success).toBe(false);
  });

  it("requires reported safe nonnegative elapsed times", () => {
    for (const elapsedMs of [-1, 0.1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, true, "0"]) expect(ToolTraceViewerSchema.safeParse({ ...trace(), events: [{ id: "x", label: "X", kind: "note", elapsedMs }] }).success).toBe(false);
    expect(ToolTraceViewerSchema.safeParse({ ...trace(), events: [{ id: "x", label: "X", kind: "note", elapsedMs: Number.MAX_SAFE_INTEGER }] }).success).toBe(true);
  });

  it("refuses unknown kinds filters and nested trace fields", () => {
    expect(ToolTraceViewerSchema.safeParse({ ...trace(), filterKind: "hidden" }).success).toBe(false);
    for (const extra of [{ kind: "debug" }, { ignored: true }, { label: " " }, { parentId: " padded" }]) expect(ToolTraceViewerSchema.safeParse({ ...trace(), events: [{ id: "x", label: "X", kind: "note", ...extra }] }).success).toBe(false);
    expect(ToolTraceViewerSchema.safeParse({ ...trace(), events: [{ id: "x", label: "X", kind: "note", details: Infinity }] }).success).toBe(false);
  });
});

describe("collective parsed JSON limits and public metadata", () => {
  it("accepts exactly 256 KiB after defaults and refuses one extra byte", () => {
    const value = boundaryPayload(); expect(bytes(value)).toBe(262144);
    const parsed = PartialResultViewerSchema.parse(value); expect(bytes(parsed)).toBe(262144); expect(parsed).toEqual(value);
    value.parts[value.parts.length - 1]!.value += "x";
    const result = PartialResultViewerSchema.safeParse(value); expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(issue => issue.message.includes("256 KiB"))).toBe(true);
  });

  it("counts UTF-8 bytes rather than UTF-16 units for aggregate part content", () => {
    const value = { ...partial(), parts: Array.from({ length: 10 }, (_, index) => ({ id: `p${index}`, label: "Part", status: "available", value: "界".repeat(9000) })) };
    expect(JSON.stringify(value).length).toBeLessThan(262144); expect(bytes(value)).toBeGreaterThan(262144);
    const result = PartialResultViewerSchema.safeParse(value); expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(issue => issue.message.includes("256 KiB"))).toBe(true);
  });

  it("applies the collective budget to queued messages and trace details", () => {
    const steps = Array.from({ length: 44 }, (_, index) => ({ id: `s${index}`, label: "Step", status: "queued", message: "界".repeat(2000) }));
    const queueResult = QueuedStepListSchema.safeParse({ ...queue(), steps }); expect(queueResult.success).toBe(false);
    if (!queueResult.success) expect(queueResult.error.issues.some(issue => issue.message.includes("256 KiB"))).toBe(true);
    const events = Array.from({ length: 10 }, (_, index) => ({ id: `e${index}`, label: "Event", kind: "note", details: "界".repeat(9000) }));
    const traceResult = ToolTraceViewerSchema.safeParse({ ...trace(), events }); expect(traceResult.success).toBe(false);
    if (!traceResult.success) expect(traceResult.error.issues.some(issue => issue.message.includes("256 KiB"))).toBe(true);
  });

  it("publishes strict shapes typed defaults and honest cross-field descriptions", () => {
    for (const { schema } of examples()) {
      const json = toJSONSchema(schema) as { type: string; additionalProperties: boolean; description: string; properties: Record<string, Record<string, unknown>>; required: string[] };
      expect(json.type).toBe("object"); expect(json.additionalProperties).toBe(false);
      expect(json.properties.disabled?.default).toBe(false); expect(json.required).toEqual(expect.arrayContaining(["id", "title"]));
      expect(json.description).toContain("262144 UTF-8 JSON bytes");
    }
    const partialJSON = toJSONSchema(PartialResultViewerSchema) as { properties: { parts: { maxItems: number }; inspectLabel: { default: string }; retryLabel: { default: string } } };
    expect(partialJSON.properties.parts.maxItems).toBe(100); expect(partialJSON.properties.inspectLabel.default).toBe("Inspect part"); expect(partialJSON.properties.retryLabel.default).toBe("Request part retry");
    expect(toJSONSchema(ToolTraceViewerSchema).description).toContain("acyclic");
    const resultJSON = toJSONSchema(ToolResultCardSchema) as { properties: { result: { description: string } } };
    expect(resultJSON.properties.result.description).toContain("1000 nodes"); expect(resultJSON.properties.result.description).toContain("65536 serialized UTF-16 units");
  });
});

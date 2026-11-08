import { describe, expect, it } from "vitest";
import { schemaBySlug } from "@mcpcn/schemas";
import { controlledData } from "./component-preview";
import { makeFixture, playgroundItems, schemaFor, validateFixture } from "./fixtures";

const slugs = ["tool-result-card", "running-task-card", "partial-result-viewer", "queued-step-list", "tool-trace-viewer"] as const;
const data = (slug: typeof slugs[number]) => makeFixture(slug).data as Record<string, unknown>;

describe("tool workflow cohort playground fixtures and controlled intent", () => {
  it("provides five dedicated valid fixtures within all 79 unchanged catalogue identities", () => {
    expect(playgroundItems).toHaveLength(79);
    expect(playgroundItems.filter(item => item.kind === "specialized")).toHaveLength(35);
    expect(playgroundItems.filter(item => item.kind === "generic-alias")).toHaveLength(21);
    for (const slug of slugs) {
      expect(playgroundItems.find(item => item.slug === slug)?.kind).toBe("specialized");
      expect(validateFixture(makeFixture(slug)).success).toBe(true);
      expect(schemaBySlug[slug].safeParse(makeFixture(slug).data).success).toBe(true);
      expect(schemaFor(slug)).toMatchObject({ type: "object", additionalProperties: false });
    }
  });
  it("returns detached snapshots retaining explicit false zero empty string and null values", () => {
    for (const slug of slugs) {
      const first = makeFixture(slug), second = makeFixture(slug); expect(first).toEqual(second); expect(first.data).not.toBe(second.data);
      const parsed = validateFixture(first); expect(parsed.success).toBe(true); if (parsed.success) expect(parsed.data.data).not.toBe(first.data);
    }
    expect(data("tool-result-card").result).toEqual({ records: [{ id: "record-a", accepted: false, count: 0, note: "" }], next: null });
  });
  it("acknowledges only current result part selection without retrying or changing part content", () => {
    const current = data("partial-result-viewer"), before = structuredClone(current);
    expect(controlledData("partial-result-viewer", current, { type: "select-result-part", data: { id: current.id, partId: "details" } })).toEqual({ selectedPartId: "details" });
    for (const type of ["inspect-result-part", "retry-result-part"]) expect(controlledData("partial-result-viewer", current, { type, data: { id: current.id, partId: "details", attempt: 2 } })).toBeUndefined();
    expect(current).toEqual(before);
  });
  it("acknowledges only current queue selection without advancing attempts or queue status", () => {
    const current = data("queued-step-list"), before = structuredClone(current);
    expect(controlledData("queued-step-list", current, { type: "select-queued-step", data: { id: current.id, stepId: "read" } })).toEqual({ selectedStepId: "read" });
    for (const type of ["inspect-queued-step", "retry-queued-step"]) expect(controlledData("queued-step-list", current, { type, data: { id: current.id, stepId: "review", attempt: 2 } })).toBeUndefined();
    expect(current).toEqual(before);
  });
  it("keeps trace filtering controlled while retaining a valid hidden selection and event order", () => {
    const current = data("tool-trace-viewer"), before = structuredClone(current);
    const patch = controlledData("tool-trace-viewer", current, { type: "change-trace-filter", data: { id: current.id, kind: "input" } });
    expect(patch).toEqual({ filterKind: "input" });
    expect(validateFixture({ ...makeFixture("tool-trace-viewer"), data: { ...current, ...patch } }).success).toBe(true);
    expect(controlledData("tool-trace-viewer", current, { type: "select-trace-event", data: { id: current.id, eventId: "note" } })).toEqual({ selectedEventId: "note" });
    expect(controlledData("tool-trace-viewer", current, { type: "inspect-trace-event", data: { id: current.id, eventId: "output", kind: "output" } })).toBeUndefined();
    expect(current).toEqual(before);
  });
  it("refuses foreign operation identities selection IDs and unrecognized trace filters", () => {
    for (const [slug, type, key, id] of [["partial-result-viewer", "select-result-part", "partId", "details"], ["queued-step-list", "select-queued-step", "stepId", "read"], ["tool-trace-viewer", "select-trace-event", "eventId", "output"]] as const) {
      const current = data(slug);
      for (const value of [{ id: "foreign", [key]: id }, { id: current.id, [key]: "foreign" }, { id: current.id, [key]: null }]) expect(controlledData(slug, current, { type, data: value })).toBeUndefined();
    }
    const trace = data("tool-trace-viewer");
    for (const kind of ["foreign", null, 1]) expect(controlledData("tool-trace-viewer", trace, { type: "change-trace-filter", data: { id: trace.id, kind } })).toBeUndefined();
    expect(controlledData("tool-trace-viewer", trace, { type: "change-trace-filter", data: { id: "foreign", kind: "all" } })).toBeUndefined();
  });
  it("refuses generic missing conditional values invalid attempts and malformed trace parents", () => {
    for (const slug of slugs) expect(validateFixture({ kind: `mcpcn/${slug}`, version: 1, data: { title: "Generic card", items: [] } }).success).toBe(false);
    const malformed = [
      ["tool-result-card", { result: undefined }], ["running-task-card", { progress: { completed: 4, total: 3 } }],
      ["partial-result-viewer", { parts: [{ id: "part", label: "Part", status: "available" }] }],
      ["queued-step-list", { steps: [{ id: "step", label: "Step", status: "running", attempt: 0 }] }],
      ["tool-trace-viewer", { events: [{ id: "event", label: "Event", kind: "note", parentId: "foreign" }] }],
    ] as const;
    for (const [slug, patch] of malformed) expect(validateFixture({ ...makeFixture(slug), data: { ...data(slug), ...patch } }).success).toBe(false);
  });
  it("refuses UI callbacks in data and leaves terminal inspection cancellation and retry consumer owned", () => {
    for (const slug of slugs) for (const patch of [{ busy: true }, { error: "UI prop" }, { onAction: "callback" }]) expect(validateFixture({ ...makeFixture(slug), data: { ...data(slug), ...patch } }).success).toBe(false);
    for (const [slug, type] of [["tool-result-card", "inspect-result"], ["running-task-card", "inspect-task"], ["running-task-card", "cancel-task"]] as const) {
      const current = data(slug), before = structuredClone(current);
      expect(controlledData(slug, current, { type, data: { id: current.id, status: current.status } })).toBeUndefined(); expect(current).toEqual(before);
    }
  });
});

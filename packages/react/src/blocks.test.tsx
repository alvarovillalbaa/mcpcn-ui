// Authored, unrun SSR and callback checks. Captured JSX props let these cases
// inspect intent handlers without claiming native events, focus or host proof.
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApprovalCard } from "./index.js";
import {
  AdminChangeReview, AgentGeneratedReportReview, ApprovalGatedToolCall,
  CollectMissingData, CompareOptionsApprove, ExtractReviewSave,
  FileUploadAndExtract, HumanCorrectsAiOutput, MultiStepToolRun,
  ReviewBeforeAction, TableBulkActionReview,
} from "./blocks.js";

const capture = vi.hoisted(() => ({ elements: [] as Array<{ type: unknown; props: Record<string, unknown>; key: unknown }> }));
vi.mock("react/jsx-runtime", async importOriginal => {
  const actual = await importOriginal<typeof import("react/jsx-runtime")>();
  return { ...actual,
    jsx: (...args: Parameters<typeof actual.jsx>) => { capture.elements.push({ type: args[0], props: args[1] as Record<string, unknown>, key: args[2] }); return actual.jsx(...args); },
    jsxs: (...args: Parameters<typeof actual.jsxs>) => { capture.elements.push({ type: args[0], props: args[1] as Record<string, unknown>, key: args[2] }); return actual.jsxs(...args); },
  };
});
vi.mock("react/jsx-dev-runtime", async importOriginal => {
  const actual = await importOriginal<typeof import("react/jsx-dev-runtime")>();
  return { ...actual, jsxDEV: (...args: Parameters<typeof actual.jsxDEV>) => {
    capture.elements.push({ type: args[0], props: args[1] as Record<string, unknown>, key: args[2] });
    return actual.jsxDEV(...args);
  } };
});

function render(element: ReactElement) { capture.elements.length = 0; return renderToStaticMarkup(element); }
function record(type: unknown, predicate: (props: Record<string, unknown>) => boolean = () => true) {
  const found = capture.elements.find(element => element.type === type && predicate(element.props));
  if (!found) throw new Error("Expected authored element was not rendered");
  return found;
}
function fire(element: ReturnType<typeof record>, name: string, value: unknown) {
  const handler = element.props[name];
  if (typeof handler !== "function") throw new Error("Expected authored callback was not exposed");
  handler(value);
}
function button(label: string) { return record("button", props => props.children === label); }
const changes = [{ label: "Status", before: "Draft", after: "Reviewed" }];
const review = () => ({ reviewId: "authored-revision-1", title: "Review authored changes", changes, onApprove: vi.fn(), onCancel: vi.fn() });
const fields = [{ name: "name", label: "Name", required: true, original: "Before", source: "Authored source" }];

describe("controlled workflow blocks", () => {
  it("ReviewBeforeAction renders the actual diff, resets review identity and emits only requested intents", () => {
    const props = review();
    const html = render(<ReviewBeforeAction {...props} error="Authored retry message" />);
    expect(html).toContain("Draft"); expect(html).toContain("Reviewed"); expect(html).toContain("Authored retry message");
    expect(props.onApprove).not.toHaveBeenCalled();
    const previousKey = record(ApprovalCard).key;
    fire(record(ApprovalCard), "onAction", { type: "approve" }); expect(props.onApprove).toHaveBeenCalledTimes(1);
    fire(record(ApprovalCard), "onAction", { type: "cancel" }); expect(props.onCancel).toHaveBeenCalledTimes(1);
    render(<ReviewBeforeAction {...props} changes={[{ label: "Status", before: "Draft", after: "Different review" }]} />);
    expect(record(ApprovalCard).key).not.toBe(previousKey);
  });

  it("CollectMissingData edits a controlled value and refuses incomplete required fields", () => {
    const onValuesChange = vi.fn(), onSubmit = vi.fn(), values = { name: "After" };
    render(<CollectMissingData title="Missing data" fields={fields} values={values} onValuesChange={onValuesChange} onSubmit={onSubmit} />);
    fire(record("input", props => props["aria-label"] === "Name"), "onChange", { currentTarget: { value: "Edited" } });
    expect(onValuesChange).toHaveBeenCalledWith({ name: "Edited" }); expect(values).toEqual({ name: "After" });
    fire(record("form"), "onSubmit", { preventDefault: vi.fn() }); expect(onSubmit).toHaveBeenCalledWith({ name: "After" });
    render(<CollectMissingData title="Missing data" fields={fields} values={{ name: "" }} onValuesChange={onValuesChange} onSubmit={onSubmit} />);
    fire(record("form"), "onSubmit", { preventDefault: vi.fn() }); expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(button("Send information").props.disabled).toBe(true);
  });

  it("ExtractReviewSave preserves source and before-after values and submits declared fields only", () => {
    const onSubmit = vi.fn();
    const html = render(<ExtractReviewSave title="Extracted fields" fields={fields} values={{ name: "After", unrelated: "private extra" }} onValuesChange={vi.fn()} onSubmit={onSubmit} />);
    expect(html).toContain("Authored source"); expect(html).toContain("Before: Before"); expect(html).toContain("After: After");
    fire(record("form"), "onSubmit", { preventDefault: vi.fn() });
    expect(onSubmit).toHaveBeenCalledWith({ name: "After" }); expect(JSON.stringify(onSubmit.mock.calls)).not.toContain("private extra");
  });

  it("CompareOptionsApprove exposes evidence and approves only the available current radio selection", () => {
    const props = { ...review(), onApprove: vi.fn(), options: [{ id: "a", label: "Option A", evidence: ["Authored evidence"], changes }, { id: "b", label: "Option B", evidence: [], changes, disabled: true }], onValueChange: vi.fn() };
    let html = render(<CompareOptionsApprove {...props} value="a" />);
    expect(html).toContain("Authored evidence"); expect(html).toContain('type="radio"');
    fire(record(ApprovalCard), "onAction", { type: "approve" }); expect(props.onApprove).toHaveBeenCalledWith("a");
    fire(record("input", item => item["aria-label"] === "Option A"), "onChange", { currentTarget: { checked: true } }); expect(props.onValueChange).toHaveBeenCalledWith("a");
    html = render(<CompareOptionsApprove {...props} value="b" />);
    expect(html).toContain("Choose an available option"); fire(record(ApprovalCard), "onAction", { type: "approve" }); expect(props.onApprove).toHaveBeenCalledTimes(1);
  });

  it("MultiStepToolRun renders actual states and emits retries only for a known failed step", () => {
    const onRetry = vi.fn();
    const html = render(<MultiStepToolRun title="Authored run" onRetry={onRetry} steps={[{ id: "failed", label: "Failed step", status: "failed", error: "Authored failure" }, { id: "done", label: "Completed step", status: "succeeded" }]} />);
    expect(html).toContain("Authored failure"); expect(html).toContain("succeeded"); expect(onRetry).not.toHaveBeenCalled();
    fire(button("Retry Failed step"), "onClick", {}); expect(onRetry).toHaveBeenCalledWith("failed");
    expect(capture.elements.filter(element => element.type === "button" && element.props.children === "Retry Completed step")).toHaveLength(0);
    expect(render(<MultiStepToolRun title="Empty run" steps={[]} />)).toContain("No workflow steps available");
  });

  it("ApprovalGatedToolCall forces consent and binds tool changes to a fresh review", () => {
    const props = review();
    const html = render(<ApprovalGatedToolCall {...props} toolName="publish_authored" requiresExplicitConsent={false} />);
    expect(html).toContain("publish_authored"); expect(record(ApprovalCard).props.requiresExplicitConsent).toBe(true);
    expect(button("Approve").props.disabled).toBe(true); expect(props.onApprove).not.toHaveBeenCalled();
    const oldKey = record(ApprovalCard).key;
    render(<ApprovalGatedToolCall {...props} toolName="different_authored" />);
    expect(record(ApprovalCard).key).not.toBe(oldKey);
  });

  it("HumanCorrectsAiOutput supports native controlled textarea and required boolean correction", () => {
    const onValuesChange = vi.fn(), onSubmit = vi.fn();
    const corrected = [{ name: "text", label: "Corrected text", type: "textarea" as const, original: "Original text", required: true }, { name: "confirm", label: "I reviewed it", type: "boolean" as const, required: true }];
    const html = render(<HumanCorrectsAiOutput title="Correct output" fields={corrected} values={{ text: "Corrected", confirm: false }} onValuesChange={onValuesChange} onSubmit={onSubmit} />);
    expect(html).toContain("Original text"); expect(html).toContain("textarea");
    fire(record("input", props => props["aria-label"] === "I reviewed it"), "onChange", { currentTarget: { checked: true } });
    expect(onValuesChange).toHaveBeenCalledWith({ text: "Corrected", confirm: true });
    fire(record("form"), "onSubmit", { preventDefault: vi.fn() }); expect(onSubmit).not.toHaveBeenCalled();
  });

  it("AgentGeneratedReportReview preserves sources and body, edits conclusion and keeps unsafe URLs inert", () => {
    const props = { ...review(), summary: "Authored report summary", sections: [{ id: "body", title: "Finding", body: "Authored full body" }], conclusion: "Draft conclusion", onConclusionChange: vi.fn(), sources: [{ id: "https", label: "Primary source", url: "https://example.invalid/authored" }, { id: "unsafe", label: "Unsafe source", url: "javascript:authored()" }] };
    const html = render(<AgentGeneratedReportReview {...props} />);
    expect(html).toContain("Authored full body"); expect(html).toContain('href="https://example.invalid/authored"');
    expect(html).toContain("Unsafe source"); expect(html).not.toContain('href="javascript:');
    fire(record("textarea"), "onChange", { currentTarget: { value: "Reviewed conclusion" } }); expect(props.onConclusionChange).toHaveBeenCalledWith("Reviewed conclusion");
    const oldKey = record(ApprovalCard).key;
    render(<AgentGeneratedReportReview {...props} sources={[{ id: "new", label: "Replacement source" }]} conclusion="Reviewed conclusion" />);
    expect(record(ApprovalCard).key).not.toBe(oldKey);
    expect(record(ApprovalCard).props.changes).toContainEqual({ label: "Conclusion", after: "Reviewed conclusion" });
  });

  it("FileUploadAndExtract reports only the chosen local File, enforces its limit and binds extraction review", () => {
    const file = new File(["owned"], "authored.txt", { type: "text/plain" });
    const arrayBuffer = vi.spyOn(file, "arrayBuffer"), text = vi.spyOn(file, "text");
    const props = { title: "Review local file", file, maxFileBytes: 20, onFileChange: vi.fn(), onExtract: vi.fn(), onFileError: vi.fn(), onAccept: vi.fn() };
    let html = render(<FileUploadAndExtract {...props} extractedFor={file} extractedFields={[{ id: "value", label: "Extracted title", value: "Authored title" }]} />);
    expect(html).toContain("authored.txt"); expect(html).toContain("Maximum file size: 20 bytes"); expect(html).toContain("Authored title");
    expect(arrayBuffer).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled(); expect(props.onExtract).not.toHaveBeenCalled();
    fire(button("Extract file"), "onClick", {}); expect(props.onExtract).toHaveBeenCalledWith(file);
    fire(button("Accept extracted fields"), "onClick", {}); expect(props.onAccept).toHaveBeenCalledWith(file);
    const tooLarge = new File(["x".repeat(21)], "too-large.txt"), target = { files: { item: () => tooLarge }, value: "owned-selection" };
    fire(record("input", item => item.type === "file"), "onChange", { currentTarget: target });
    expect(target.value).toBe(""); expect(props.onFileChange).not.toHaveBeenCalled(); expect(props.onFileError).toHaveBeenCalledWith("Choose a file no larger than 20 bytes.");
    html = render(<FileUploadAndExtract {...props} extractedFor={new File(["other"], "other.txt")} extractedFields={[{ id: "old", label: "Old result", value: "Not current" }]} />);
    expect(html).toContain("does not match the current file"); expect(html).not.toContain("Accept extracted fields");
  });

  it("TableBulkActionReview displays current counts and diffs, rejects stale IDs and copies approved selection", () => {
    const selected = ["a"], props = { ...review(), rows: [{ id: "a", label: "Authored row A", changes }, { id: "b", label: "Authored row B", changes }], onValueChange: vi.fn(), onApprove: vi.fn() };
    let html = render(<TableBulkActionReview {...props} value={selected} />);
    expect(html).toContain("1 of 2 rows selected"); expect(html).toContain("Authored row A: Status");
    fire(record(ApprovalCard), "onAction", { type: "approve" }); expect(props.onApprove).toHaveBeenCalledWith(["a"]); expect(props.onApprove.mock.calls[0]?.[0]).not.toBe(selected);
    fire(record("input", item => item["aria-label"] === "Authored row B"), "onChange", { currentTarget: { checked: true } }); expect(props.onValueChange).toHaveBeenCalledWith(["a", "b"]);
    html = render(<TableBulkActionReview {...props} value={["gone"]} />);
    expect(html).toContain("unavailable or repeated records"); fire(record(ApprovalCard), "onAction", { type: "approve" }); expect(props.onApprove).toHaveBeenCalledTimes(1);
    expect(selected).toEqual(["a"]);
  });

  it("AdminChangeReview keeps zero affected records, rollback guidance and an explicit consent gate", () => {
    const props = review();
    const html = render(<AdminChangeReview {...props} affectedCount={0} rollback="Restore the authored setting" />);
    expect(html).toContain("0 affected"); expect(html).toContain("Restore the authored setting"); expect(html).toContain("Draft");
    expect(record(ApprovalCard).props.requiresExplicitConsent).toBe(true); expect(button("Approve").props.disabled).toBe(true); expect(props.onApprove).not.toHaveBeenCalled();
    render(<AdminChangeReview {...props} affectedCount={-1} rollback="" />);
    fire(record(ApprovalCard), "onAction", { type: "approve" }); expect(props.onApprove).not.toHaveBeenCalled();
  });

  it("busy and invalid controlled contexts cannot dispatch actions even through captured callbacks", () => {
    const approve = vi.fn(), onValuesChange = vi.fn(), onSubmit = vi.fn(), onRetry = vi.fn(), props = review();
    render(<CompareOptionsApprove {...props} busy options={[{ id: "a", label: "A", changes, evidence: [] }]} value="a" onValueChange={onValuesChange} onApprove={approve} />);
    fire(record(ApprovalCard), "onAction", { type: "approve" }); fire(record("input", item => item.type === "radio"), "onChange", { currentTarget: { checked: true } });
    expect(approve).not.toHaveBeenCalled(); expect(onValuesChange).not.toHaveBeenCalled();
    render(<CollectMissingData title="Busy form" busy fields={fields} values={{ name: "Ready" }} onValuesChange={onValuesChange} onSubmit={onSubmit} />);
    fire(record("input", item => item["aria-label"] === "Name"), "onChange", { currentTarget: { value: "New" } }); fire(record("form"), "onSubmit", { preventDefault: vi.fn() });
    expect(onValuesChange).not.toHaveBeenCalled(); expect(onSubmit).not.toHaveBeenCalled();
    render(<MultiStepToolRun title="Busy retry" busy steps={[{ id: "failed", label: "Failed", status: "failed" }]} onRetry={onRetry} />);
    fire(button("Retry Failed"), "onClick", {}); expect(onRetry).not.toHaveBeenCalled();
    expect(render(<CollectMissingData title="Empty form" fields={[]} values={{}} onValuesChange={onValuesChange} onSubmit={onSubmit} />)).toContain("No fields to complete");
  });
});

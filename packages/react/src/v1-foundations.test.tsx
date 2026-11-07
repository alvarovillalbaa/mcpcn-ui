import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ApprovalCardSchema, SchemaFormSchema, type ApprovalCardData } from "@mcpcn/schemas";
import { ApprovalCard, SchemaForm } from "./index.js";

describe("v1 foundation review and form contracts", () => {
  it("renders current approval impact without emitting consumer intent during render", () => {
    let calls = 0;
    const html = renderToStaticMarkup(<ApprovalCard title="Review authored price" requiresExplicitConsent
      changes={[{ label: "Price", before: 49, after: 59, confidence: 0 }]} onAction={() => { calls++; }} />);
    expect(html).toContain("Review authored price"); expect(html).toContain("49"); expect(html).toContain("59");
    expect(html).toContain("0% confidence"); expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('checked=""'); expect(html).toContain('disabled=""'); expect(calls).toBe(0);
  });
  it("shows consumer busy and error feedback while approval controls are disabled", () => {
    const html = renderToStaticMarkup(<ApprovalCard title="Review pending change" requiresExplicitConsent busy
      error="The authored consumer refused this change." onAction={() => undefined} />);
    expect(html).toContain('aria-busy="true"'); expect(html).toContain('role="alert"');
    expect(html).toContain("The authored consumer refused this change."); expect(html).toContain("Working…");
    expect(html.match(/disabled=""/g)?.length).toBe(3);
  });
  it("rejects malformed approval terms instead of exposing an approval action", () => {
    expect(ApprovalCardSchema.safeParse({ title: " " }).success).toBe(false);
    expect(ApprovalCardSchema.safeParse({ title: "Bad confidence", changes: [{ label: "Price", confidence: 2 }] }).success).toBe(false);
    const malformed = { title: "Bad risk", riskLevel: "unbounded" } as unknown as ApprovalCardData;
    const html = renderToStaticMarkup(<ApprovalCard {...malformed} />);
    expect(html).toContain("Approval card could not be rendered"); expect(html).not.toContain('type="checkbox"');
  });
  it("keeps required boolean confirmation and empty forms unavailable for submission", () => {
    const html = renderToStaticMarkup(<SchemaForm title="Review consent" fields={[{ name: "confirmed", label: "Confirm details", type: "boolean", required: true }]} onAction={() => undefined} />);
    expect(html).toContain('type="checkbox" required=""'); expect(html).not.toContain('checked=""');
    expect(html).toContain('disabled=""');
    const empty = renderToStaticMarkup(<SchemaForm title="No requested fields" fields={[]} onAction={() => undefined} />);
    expect(empty).toContain("No fields to complete."); expect(empty).toContain('disabled=""');
  });
  it("rejects blank and repeated form field identities and invisible labels", () => {
    expect(SchemaFormSchema.safeParse({ title: "Fields", fields: [{ name: "same", label: "First", type: "text" }, { name: "same", label: "Second", type: "text" }] }).success).toBe(false);
    expect(SchemaFormSchema.safeParse({ title: "Fields", fields: [{ name: "", label: "Name", type: "text" }] }).success).toBe(false);
    expect(SchemaFormSchema.safeParse({ title: "Fields", fields: [{ name: "name", label: " ", type: "text" }] }).success).toBe(false);
    expect(SchemaFormSchema.safeParse({ title: " ", fields: [] }).success).toBe(false);
  });
  it("rejects nonfinite and mismatched initial values before creating form state", () => {
    expect(SchemaFormSchema.safeParse({ title: "Fields", fields: [{ name: "n", label: "Amount", type: "number", value: Infinity }] }).success).toBe(false);
    expect(SchemaFormSchema.safeParse({ title: "Fields", fields: [{ name: "n", label: "Amount", type: "number", value: NaN }] }).success).toBe(false);
    expect(SchemaFormSchema.safeParse({ title: "Fields", fields: [{ name: "b", label: "Confirmed", type: "boolean", value: "yes" }] }).success).toBe(false);
    expect(SchemaFormSchema.safeParse({ title: "Fields", fields: [{ name: "t", label: "Text", type: "text", value: {} }] }).success).toBe(false);
  });
  it("requires coherent current select choices instead of accepting stale options", () => {
    const fields = [{ name: "choice", label: "Choice", type: "select", options: [{ value: "a", label: "A" }] }];
    expect(SchemaFormSchema.safeParse({ title: "Choice", fields: [{ ...fields[0], value: "removed" }] }).success).toBe(false);
    expect(SchemaFormSchema.safeParse({ title: "Choice", fields: [{ ...fields[0], options: [{ value: "a", label: "A" }, { value: "a", label: "Again" }] }] }).success).toBe(false);
    expect(SchemaFormSchema.safeParse({ title: "Choice", fields: [{ ...fields[0], value: "a" }] }).success).toBe(true);
  });
  it("preserves numeric zero and optional empty values without submitting during render", () => {
    let calls = 0;
    const html = renderToStaticMarkup(<SchemaForm title="Finite authored values" fields={[
      { name: "amount", label: "Amount", type: "number", required: true, value: 0 },
      { name: "budget", label: "Budget", type: "number", value: "" }
    ]} onAction={() => { calls++; }} />);
    expect(html).toContain('value="0"'); expect(html).toContain('value=""'); expect(html).not.toContain("NaN"); expect(calls).toBe(0);
  });
});

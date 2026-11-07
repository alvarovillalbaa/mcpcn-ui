import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "zod";
import { AuthRequiredCardSchema, RetryableErrorStateSchema, ToolCallCardSchema } from "../../schemas/src/execution-schemas.js";
import { AuthRequiredCard, RetryableErrorState, ToolCallCard } from "./execution-components.js";

const call = { id: "call-42", tool: "lookup_invoice", arguments: { invoiceId: "INV-42", exact: false, limit: 0 }, status: "succeeded" as const, result: { total: 29.5, lines: [1, null, true] } };
const retry = { id: "failed-42", message: "Authored request failure", tool: "lookup_invoice", arguments: { invoiceId: "INV-42" } };
const auth = { id: "access-42", service: "Authored workspace", scopes: [{ id: "invoices.read", label: "Read invoices" }] };

describe("v1 execution schemas", () => {
  it("preserves exact tool arguments and JSON results in owned snapshots", () => {
    const parsed = ToolCallCardSchema.parse(call); expect(parsed.arguments).toEqual(call.arguments); expect(parsed.result).toEqual(call.result);
    expect(parsed.arguments).not.toBe(call.arguments); expect(parsed.result).not.toBe(call.result);
  });
  it("accepts explicit false zero and null results without treating them as missing", () => {
    for (const result of [false, 0, null]) expect(ToolCallCardSchema.parse({ ...call, result }).result).toBe(result);
  });
  it("rejects unsupported tool statuses and contradictory failure details", () => {
    expect(ToolCallCardSchema.safeParse({ ...call, status: "finished" }).success).toBe(false);
    expect(ToolCallCardSchema.safeParse({ ...call, errorMessage: "Failure" }).success).toBe(false);
    expect(ToolCallCardSchema.safeParse({ ...call, status: "failed", errorMessage: "Failure" }).success).toBe(true);
  });
  it("rejects blank or control-character operation identities", () => {
    for (const id of ["", "  ", "call\n42"]) expect(ToolCallCardSchema.safeParse({ ...call, id }).success).toBe(false);
    expect(ToolCallCardSchema.safeParse({ ...call, tool: " " }).success).toBe(false);
  });
  it("rejects functions bigint nonfinite and cyclic JSON without serialization", () => {
    const circular: Record<string, unknown> = {}; circular.self = circular;
    for (const value of [() => undefined, BigInt(1), NaN, Infinity, circular, { unsupported: undefined }]) {
      expect(ToolCallCardSchema.safeParse({ ...call, result: value }).success).toBe(false);
    }
  });
  it("rejects JSON accessors without invoking them", () => {
    const getter = vi.fn(() => "private"); const value = Object.defineProperty({}, "secret", { enumerable: true, get: getter });
    expect(ToolCallCardSchema.safeParse({ ...call, arguments: value }).success).toBe(false); expect(getter).not.toHaveBeenCalled();
  });
  it("bounds deep oversized and nonobject arguments", () => {
    let nested: unknown = null; for (let i = 0; i < 10; i++) nested = { child: nested };
    for (const value of [nested, { text: "x".repeat(10001) }, new Date(), []]) expect(ToolCallCardSchema.safeParse({ ...call, arguments: value }).success).toBe(false);
  });
  it("rejects sparse arrays and prototype-sensitive keys rather than dropping values", () => {
    expect(ToolCallCardSchema.safeParse({ ...call, result: Array(2) }).success).toBe(false);
    expect(ToolCallCardSchema.safeParse({ ...call, arguments: JSON.parse('{"__proto__":{"value":true}}') }).success).toBe(false);
  });
  it("keeps the named schemas representable by the public JSON Schema exporter", () => {
    for (const schema of [ToolCallCardSchema, RetryableErrorStateSchema, AuthRequiredCardSchema]) expect(() => z.toJSONSchema(schema)).not.toThrow();
  });
  it("does not enable retry by default or coerce invalid attempts", () => {
    const parsed = RetryableErrorStateSchema.parse(retry); expect(parsed.retryable).toBe(false); expect(parsed.attempt).toBe(1);
    for (const attempt of [0, -1, 1.5, 1001, "1", NaN]) expect(RetryableErrorStateSchema.safeParse({ ...retry, attempt }).success).toBe(false);
  });
  it("rejects duplicate permission identities before an access intent", () => {
    expect(AuthRequiredCardSchema.safeParse({ ...auth, scopes: [...auth.scopes, { id: "invoices.read", label: "Duplicate" }] }).success).toBe(false);
    expect(AuthRequiredCardSchema.safeParse({ ...auth, scopes: [{ id: "", label: "Missing ID" }] }).success).toBe(false);
  });
  it("supports an explicit empty permission list but rejects malformed host states", () => {
    expect(AuthRequiredCardSchema.parse({ ...auth, scopes: [] }).scopes).toEqual([]);
    expect(AuthRequiredCardSchema.safeParse({ ...auth, status: "authenticated" }).success).toBe(false);
    expect(AuthRequiredCardSchema.safeParse({ ...auth, service: "" }).success).toBe(false);
  });
});

describe("v1 execution SSR contracts", () => {
  it("renders inspectable tool identity status arguments and result without executing", () => {
    const onAction = vi.fn(); const html = renderToStaticMarkup(<ToolCallCard {...call} onAction={onAction} />);
    for (const value of ["lookup_invoice", "call-42", "succeeded", "INV-42", "29.5", "Arguments", "Current result", "Review tool call"]) expect(html).toContain(value);
    expect(html).toContain("never runs a tool"); expect(onAction).not.toHaveBeenCalled();
  });
  it("shows queued running empty and failed states honestly", () => {
    const queued = renderToStaticMarkup(<ToolCallCard id="empty" tool="list" status="queued" />); expect(queued).toContain("No arguments supplied."); expect(queued).toContain("No result supplied."); expect(queued).toContain("is queued");
    expect(renderToStaticMarkup(<ToolCallCard {...call} status="running" />)).toContain("consumer reports");
    expect(renderToStaticMarkup(<ToolCallCard {...call} status="failed" errorMessage="Authored failure" />)).toContain("Authored failure");
  });
  it("disables inspection without a callback or during busy and disabled states", () => {
    for (const props of [{}, { busy: true, onAction: vi.fn() }, { disabled: true, onAction: vi.fn() }]) expect(renderToStaticMarkup(<ToolCallCard {...call} {...props} />)).toMatch(/<button[^>]*disabled=""/);
  });
  it("escapes result and service text without executable markup or links", () => {
    const payload = "<script>alert(1)</script>";
    const html = renderToStaticMarkup(<ToolCallCard {...call} result={{ html: payload }} />) + renderToStaticMarkup(<AuthRequiredCard {...auth} service={payload} />);
    expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<iframe"); expect(html).not.toContain("href=");
  });
  it("offers retry only when retryable and never during consumer busy state", () => {
    const onAction = vi.fn(); expect(renderToStaticMarkup(<RetryableErrorState {...retry} onAction={onAction} />)).not.toContain(">Retry tool</button>");
    expect(renderToStaticMarkup(<RetryableErrorState {...retry} retryable onAction={onAction} />)).toContain(">Retry tool</button>");
    expect(renderToStaticMarkup(<RetryableErrorState {...retry} retryable busy onAction={onAction} />)).toMatch(/<button[^>]*disabled=""/);
    expect(onAction).not.toHaveBeenCalled();
  });
  it("shows access as consumer intent without credential inputs redirects or automatic action", () => {
    const onAction = vi.fn(); const html = renderToStaticMarkup(<AuthRequiredCard {...auth} onAction={onAction} />);
    expect(html).toContain("invoices.read"); expect(html).toContain("Request access"); expect(html).toContain("does not sign in"); expect(html).not.toContain("<input"); expect(html).not.toContain("href="); expect(onAction).not.toHaveBeenCalled();
  });
  it("keeps pending unavailable disabled and callback-free access requests blocked", () => {
    for (const props of [{ status: "pending" as const, onAction: vi.fn() }, { status: "unavailable" as const, onAction: vi.fn() }, { disabled: true, onAction: vi.fn() }, {}]) expect(renderToStaticMarkup(<AuthRequiredCard {...auth} {...props} />)).toMatch(/<button[^>]*disabled=""/);
    expect(renderToStaticMarkup(<AuthRequiredCard {...auth} scopes={[]} />)).toContain("No permissions supplied.");
  });
  it("renders malformed schema and consumer errors instead of unsafe actions", () => {
    const malformed = renderToStaticMarkup(<AuthRequiredCard {...auth} scopes={[{ id: "same", label: "One" }, { id: "same", label: "Two" }]} />);
    expect(malformed).toContain("Access request data is invalid"); expect(malformed).not.toContain("<button");
    expect(renderToStaticMarkup(<RetryableErrorState {...retry} retryable error="Authored consumer rejection" />)).toContain("Authored consumer rejection");
  });
});

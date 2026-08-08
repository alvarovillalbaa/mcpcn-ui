import { describe, expect, it } from "vitest";
import { ApprovalCardSchema, validatePayload } from "./index.js";

describe("validatePayload", () => {
  it("validates and applies safe defaults", () => {
    const result = validatePayload({ kind: "mcpcn/approval-card", version: 1, data: { title: "Review", changes: [] } }, ApprovalCardSchema);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.data.actionLabel).toBe("Approve");
  });
  it("rejects malformed tool output", () => {
    expect(validatePayload({ kind: "wrong", version: 1, data: {} }, ApprovalCardSchema).success).toBe(false);
  });
});

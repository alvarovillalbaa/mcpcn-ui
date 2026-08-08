import { describe, expect, it } from "vitest";
import { MockAdapter } from "./index.js";

describe("MockAdapter", () => {
  it("records app-initiated tool calls", async () => {
    const adapter = new MockAdapter();
    await adapter.callTool("approve", { id: "42" });
    expect(adapter.calls).toEqual([{ name: "approve", args: { id: "42" } }]);
  });
});

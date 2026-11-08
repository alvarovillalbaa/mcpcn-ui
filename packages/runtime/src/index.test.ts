import { describe, expect, it } from "vitest";
import { MockAdapter } from "./index.js";

describe("MockAdapter", () => {
  it("records app-initiated tool calls", async () => {
    const adapter = new MockAdapter();
    await adapter.callTool("approve", { id: "42" });
    expect(adapter.calls).toEqual([{ name: "approve", args: { id: "42" } }]);
  });

  it("notifies active subscribers of explicit message context and private local state changes", async () => {
    const adapter = new MockAdapter({ toolInput: { id: "authored" } });
    const snapshots: unknown[] = []; const stop = adapter.connect(snapshot => snapshots.push(snapshot));
    await adapter.sendMessage("Authored message"); await adapter.updateModelContext({ summary: "Authored context" });
    await adapter.setWidgetState({ privateCanary: "local-only" });
    expect(snapshots).toEqual([
      { toolInput: { id: "authored" } }, { meta: { lastMessage: "Authored message" } },
      { meta: { lastMessage: "Authored message", modelContext: { summary: "Authored context" } } },
      { widgetState: { privateCanary: "local-only" } }
    ]);
    expect(adapter.snapshot.meta).toEqual({ lastMessage: "Authored message", modelContext: { summary: "Authored context" } });
    stop(); await adapter.setWidgetState({ privateCanary: "after-unsubscribe" }); expect(snapshots).toHaveLength(4);
  });

  it("publishes actual supported display changes and rejects unsupported modes", async () => {
    const adapter = new MockAdapter(); const snapshots: unknown[] = []; const stop = adapter.connect(snapshot => snapshots.push(snapshot));
    await adapter.requestDisplayMode("fullscreen"); expect(snapshots.at(-1)).toEqual({ displayMode: "fullscreen" });
    await expect(adapter.requestDisplayMode("pip")).rejects.toThrow("does not support");
    expect(snapshots.at(-1)).toEqual({ displayMode: "fullscreen" }); stop();
  });
});

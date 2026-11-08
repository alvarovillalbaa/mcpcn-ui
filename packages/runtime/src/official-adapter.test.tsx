// Tier 0: authored SDK doubles exercise the normalized runtime, not a real host.
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentAppProvider, OfficialMCPAdapter, useAgentApp, type AgentAppSnapshot } from "./index.js";

const sdk = vi.hoisted(() => {
  type Mode = "inline" | "fullscreen" | "pip";
  type Result = { content?: Array<{ type: string; text?: string }>; structuredContent?: unknown; _meta?: Record<string, unknown>; isError?: boolean };
  class App {
    static instances: App[] = [];
    ontoolinput?: (input: { arguments?: Record<string, unknown> }) => void;
    ontoolresult?: (result: unknown) => void;
    onhostcontextchanged?: (context: Record<string, unknown>) => void;
    onteardown?: () => unknown;
    onclose?: () => void;
    capabilities: Record<string, unknown> = {};
    context: Record<string, unknown> = {};
    handlersAtConnect?: Record<string, boolean>;
    private resolveConnection!: () => void;
    private rejectConnection!: (error: Error) => void;
    private connection = new Promise<void>((resolve, reject) => { this.resolveConnection = resolve; this.rejectConnection = reject; });
    constructor(readonly info: unknown, readonly appCapabilities: unknown, readonly options: unknown) { App.instances.push(this); }
    connect = vi.fn(() => {
      this.handlersAtConnect = { input: !!this.ontoolinput, result: !!this.ontoolresult, context: !!this.onhostcontextchanged, teardown: !!this.onteardown };
      return this.connection;
    });
    close = vi.fn(async () => { this.onclose?.(); });
    callServerTool = vi.fn(async (_params: { name: string; arguments: Record<string, unknown> }): Promise<Result> => ({ content: [] }));
    sendMessage = vi.fn(async (_params: unknown) => ({}));
    updateModelContext = vi.fn(async (_params: unknown) => ({}));
    requestDisplayMode = vi.fn(async (_params: { mode: Mode }): Promise<{ mode: Mode }> => ({ mode: "inline" }));
    getHostCapabilities() { return this.capabilities; }
    getHostContext() { return this.context; }
    succeed(capabilities: Record<string, unknown>, context: Record<string, unknown>) {
      this.capabilities = capabilities; this.context = context; this.resolveConnection();
    }
    fail(error: Error) { this.rejectConnection(error); }
  }
  return { App };
});
vi.mock("@modelcontextprotocol/ext-apps", () => ({ App: sdk.App }));

const stops: Array<() => void> = [];
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
const capabilities = () => ({ serverTools: {}, message: { text: {} }, updateModelContext: { text: {} } });
const context = () => ({ displayMode: "inline", availableDisplayModes: ["inline", "fullscreen", "pip"], theme: "light" });
function open(adapter = new OfficialMCPAdapter()) {
  const events: Array<Partial<AgentAppSnapshot>> = [];
  const listener = vi.fn((snapshot: Partial<AgentAppSnapshot>) => { events.push(snapshot); });
  const stop = adapter.connect(listener); stops.push(stop);
  return { adapter, listener, events, stop, app: sdk.App.instances.at(-1)! };
}
async function ready(connection: ReturnType<typeof open>, host = capabilities(), hostContext = context()) {
  connection.app.succeed(host, hostContext); await turn(); return connection;
}
afterEach(() => { for (const stop of stops.splice(0)) stop(); sdk.App.instances.length = 0; vi.clearAllMocks(); });

describe("OfficialMCPAdapter sessions", () => {
  it("does not create a transport or advertise capabilities before connecting", () => {
    const adapter = new OfficialMCPAdapter();
    expect(sdk.App.instances).toHaveLength(0);
    expect(adapter.getCapabilities()).toEqual({ host: "standard-mcp", callTool: false, sendMessage: false, updateModelContext: false, widgetState: false, displayModes: [] });
  });

  it("registers handlers before the finite initialization request and clears prior snapshot fields", () => {
    const connection = open();
    expect(connection.app.options).toEqual({ autoResize: true, strict: true });
    expect(connection.app.handlersAtConnect).toEqual({ input: true, result: true, context: true, teardown: true });
    expect(connection.app.connect).toHaveBeenCalledWith(undefined, { timeout: 10000 });
    expect(connection.events[0]).toEqual({ toolInput: undefined, toolResult: undefined, structuredContent: undefined, meta: undefined,
      widgetState: undefined, displayMode: "inline", theme: undefined, capabilities: connection.adapter.getCapabilities() });
  });

  it("rejects a second active connection without constructing another SDK instance", () => {
    const { adapter } = open();
    expect(() => adapter.connect(() => undefined)).toThrow("already connected");
    expect(sdk.App.instances).toHaveLength(1);
  });

  it("rejects outbound calls before a session exists", async () => {
    const adapter = new OfficialMCPAdapter();
    await expect(adapter.callTool("fixture", {})).rejects.toThrow("not ready");
    await expect(adapter.sendMessage("Authored message")).rejects.toThrow("not ready");
    await expect(adapter.updateModelContext({ summary: "Authored" })).rejects.toThrow("not ready");
    await expect(adapter.requestDisplayMode("fullscreen")).rejects.toThrow("not ready");
    expect(sdk.App.instances).toHaveLength(0);
  });

  it("rejects outbound calls while initialization is pending", async () => {
    const { adapter, app } = open();
    await expect(adapter.callTool("fixture")).rejects.toThrow("not ready");
    await expect(adapter.sendMessage("Authored")).rejects.toThrow("not ready");
    await expect(adapter.updateModelContext("Authored")).rejects.toThrow("not ready");
    await expect(adapter.requestDisplayMode("fullscreen")).rejects.toThrow("not ready");
    expect(app.callServerTool).not.toHaveBeenCalled(); expect(app.sendMessage).not.toHaveBeenCalled();
    expect(app.updateModelContext).not.toHaveBeenCalled(); expect(app.requestDisplayMode).not.toHaveBeenCalled();
  });

  it("publishes only negotiated capabilities and initial actual theme and display mode", async () => {
    const connection = await ready(open(), capabilities(), { ...context(), displayMode: "pip", theme: "dark" });
    expect(connection.adapter.getCapabilities()).toEqual({ host: "standard-mcp", callTool: true, sendMessage: true, updateModelContext: true,
      widgetState: false, displayModes: ["inline", "fullscreen", "pip"] });
    expect(connection.events.at(-1)).toMatchObject({ theme: "dark", displayMode: "pip", capabilities: connection.adapter.getCapabilities() });
  });

  it("rejects missing negotiated capabilities without sending requests", async () => {
    const connection = open(); connection.app.succeed({}, {}); await turn();
    await expect(connection.adapter.callTool("fixture")).rejects.toThrow("does not support callTool");
    await expect(connection.adapter.sendMessage("Authored")).rejects.toThrow("does not support sendMessage");
    await expect(connection.adapter.updateModelContext("Authored")).rejects.toThrow("does not support updateModelContext");
    expect(connection.app.callServerTool).not.toHaveBeenCalled(); expect(connection.app.sendMessage).not.toHaveBeenCalled();
    expect(connection.app.updateModelContext).not.toHaveBeenCalled();
    expect(connection.adapter.getCapabilities().displayModes).toEqual(["inline"]);
  });

  it("does not treat a message or context modality object without text as text support", async () => {
    const connection = open(); connection.app.succeed({ message: {}, updateModelContext: {} }, context()); await turn();
    expect(connection.adapter.getCapabilities()).toMatchObject({ sendMessage: false, updateModelContext: false });
    await expect(connection.adapter.sendMessage("Authored")).rejects.toThrow("does not support");
    await expect(connection.adapter.updateModelContext("Authored")).rejects.toThrow("does not support");
  });

  it("passes exact tool arguments and returns tool-level errors without inventing success", async () => {
    const { adapter, app } = await ready(open());
    const result = { isError: true, content: [{ type: "text", text: "Authored fixture rejection" }], _meta: { privateCanary: "view-only" } };
    app.callServerTool.mockResolvedValue(result);
    await expect(adapter.callTool("fixture", { id: "authored-1" })).resolves.toEqual(result);
    expect(app.callServerTool).toHaveBeenCalledWith({ name: "fixture", arguments: { id: "authored-1" } });
    expect(app.updateModelContext).not.toHaveBeenCalled(); expect(app.sendMessage).not.toHaveBeenCalled();
  });

  it("preserves a rejected tool request and supplies an empty arguments object by default", async () => {
    const { adapter, app } = await ready(open()); const failure = new Error("Authored protocol failure");
    app.callServerTool.mockRejectedValue(failure);
    await expect(adapter.callTool("fixture")).rejects.toBe(failure);
    expect(app.callServerTool).toHaveBeenCalledWith({ name: "fixture", arguments: {} });
  });

  it("normalizes tool input to raw arguments including empty and absent arguments", async () => {
    const { app, events } = await ready(open());
    app.ontoolinput?.({ arguments: { id: "authored-1" } }); expect(events.at(-1)).toEqual({ toolInput: { id: "authored-1" } });
    app.ontoolinput?.({ arguments: {} }); expect(events.at(-1)).toEqual({ toolInput: {} });
    app.ontoolinput?.({}); expect(events.at(-1)).toEqual({ toolInput: undefined });
  });

  it("keeps structured content and private metadata separate without automatic context sharing", async () => {
    const { app, events } = await ready(open());
    const result = { content: [{ type: "text", text: "Public authored summary" }], structuredContent: { visible: true }, _meta: { privateCanary: "not-model-context" } };
    app.ontoolresult?.(result);
    expect(events.at(-1)).toEqual({ toolResult: result, structuredContent: result.structuredContent, meta: result._meta });
    expect(app.updateModelContext).not.toHaveBeenCalled(); expect(app.sendMessage).not.toHaveBeenCalled();
  });

  it("sends messages and context only from their explicit methods", async () => {
    const { adapter, app } = await ready(open());
    await adapter.sendMessage("Authored user intent"); await adapter.updateModelContext({ summary: "Authored shared fields" });
    expect(app.sendMessage).toHaveBeenCalledWith({ role: "user", content: [{ type: "text", text: "Authored user intent" }] });
    expect(app.updateModelContext).toHaveBeenCalledWith({ content: [{ type: "text", text: '{"summary":"Authored shared fields"}' }] });
  });

  it("refuses private host widget storage without forwarding it to model context", async () => {
    const { adapter, app } = await ready(open());
    await expect(adapter.setWidgetState()).rejects.toThrow("does not support private host widget storage");
    expect(adapter.getCapabilities().widgetState).toBe(false); expect(app.updateModelContext).not.toHaveBeenCalled();
  });

  it("publishes an accepted display mode from the actual host response", async () => {
    const { adapter, app, events } = await ready(open()); app.requestDisplayMode.mockResolvedValue({ mode: "fullscreen" });
    await adapter.requestDisplayMode("fullscreen");
    expect(app.requestDisplayMode).toHaveBeenCalledWith({ mode: "fullscreen" }); expect(events.at(-1)).toEqual({ displayMode: "fullscreen" });
  });

  it("preserves the actual host denial instead of publishing the requested mode", async () => {
    const { adapter, app, events } = await ready(open()); app.requestDisplayMode.mockResolvedValue({ mode: "inline" });
    await adapter.requestDisplayMode("fullscreen"); expect(events.at(-1)).toEqual({ displayMode: "inline" });
  });

  it("leaves display state unchanged when the host rejects the request", async () => {
    const { adapter, app, events } = await ready(open()); const count = events.length; const error = new Error("Authored mode failure");
    app.requestDisplayMode.mockRejectedValue(error);
    await expect(adapter.requestDisplayMode("fullscreen")).rejects.toBe(error); expect(events).toHaveLength(count);
  });

  it("rejects an unadvertised display mode before sending the request", async () => {
    const connection = open(); connection.app.succeed(capabilities(), { displayMode: "inline", availableDisplayModes: ["inline"] }); await turn();
    await expect(connection.adapter.requestDisplayMode("fullscreen")).rejects.toThrow("does not support this display mode");
    expect(connection.app.requestDisplayMode).not.toHaveBeenCalled();
  });

  it("reads the merged host context when publishing theme and mode changes", async () => {
    const { adapter, app, events } = await ready(open());
    app.context = { displayMode: "pip", availableDisplayModes: ["inline", "pip"], theme: "dark" };
    app.onhostcontextchanged?.({ theme: "dark" });
    expect(events.at(-1)).toMatchObject({ displayMode: "pip", theme: "dark", capabilities: { displayModes: ["inline", "pip"] } });
    const modes = adapter.getCapabilities().displayModes; modes.push("fullscreen");
    expect(adapter.getCapabilities().displayModes).toEqual(["inline", "pip"]);
  });

  it("closes once on idempotent disposal and rejects subsequent calls", async () => {
    const { adapter, app, stop } = await ready(open()); stop(); stop(); await turn();
    expect(app.close).toHaveBeenCalledTimes(1);
    expect(app.ontoolinput).toBeUndefined(); expect(app.ontoolresult).toBeUndefined(); expect(app.onhostcontextchanged).toBeUndefined();
    expect(app.onteardown).toBeUndefined(); expect(app.onclose).toBeUndefined();
    await expect(adapter.callTool("fixture")).rejects.toThrow("not ready");
    expect(adapter.getCapabilities().displayModes).toEqual([]);
  });

  it("ignores initialization success after disposal", async () => {
    const connection = open(); const count = connection.events.length; connection.stop();
    connection.app.succeed(capabilities(), context()); await turn();
    expect(connection.events).toHaveLength(count); expect(connection.adapter.getCapabilities().callTool).toBe(false);
  });

  it("ignores initialization rejection after disposal", async () => {
    const connection = open(); const count = connection.events.length; connection.stop();
    connection.app.fail(new Error("Authored late failure")); await turn();
    expect(connection.events).toHaveLength(count); expect(connection.app.close).toHaveBeenCalledTimes(1);
  });

  it("creates a fresh SDK session after cleanup and ignores old notification closures", async () => {
    const first = await ready(open()); const late = first.app.ontoolinput!, previousCount = first.events.length; first.stop();
    const second = await ready(open(first.adapter));
    late({ arguments: { privateCanary: "old-session" } });
    expect(second.app).not.toBe(first.app); expect(first.events).toHaveLength(previousCount);
    expect(second.events.some(event => event.toolInput)).toBe(false);
    second.app.ontoolinput?.({ arguments: { id: "current-session" } });
    expect(second.events.at(-1)).toEqual({ toolInput: { id: "current-session" } });
  });

  it("rejects a late display response without publishing into a replacement session", async () => {
    const first = await ready(open()); let resolve!: (value: { mode: "fullscreen" }) => void;
    first.app.requestDisplayMode.mockImplementation(() => new Promise<{ mode: "inline" | "fullscreen" | "pip" }>(done => { resolve = done; }));
    const pending = first.adapter.requestDisplayMode("fullscreen"), assertion = expect(pending).rejects.toThrow("connection changed");
    first.stop(); const second = await ready(open(first.adapter)); const count = second.events.length;
    resolve({ mode: "fullscreen" }); await assertion; expect(second.events).toHaveLength(count);
  });

  it("rejects a tool result that completes after its session was disposed", async () => {
    const first = await ready(open()); let resolve!: (value: { structuredContent: unknown }) => void;
    first.app.callServerTool.mockImplementation(() => new Promise<{ structuredContent: unknown }>(done => { resolve = done; }));
    const pending = first.adapter.callTool("fixture"), assertion = expect(pending).rejects.toThrow("connection changed");
    first.stop(); await ready(open(first.adapter)); resolve({ structuredContent: { stale: true } }); await assertion;
  });

  it("acknowledges teardown with capabilities off while retaining transport until disposal", async () => {
    const { adapter, app, events, stop } = await ready(open()); const input = app.ontoolinput!;
    expect(app.onteardown?.()).toEqual({}); expect(adapter.getCapabilities().callTool).toBe(false);
    const count = events.length; input({ arguments: { stale: true } }); expect(events).toHaveLength(count);
    await expect(adapter.callTool("fixture")).rejects.toThrow("not ready"); expect(app.close).not.toHaveBeenCalled();
    stop(); expect(app.close).toHaveBeenCalledTimes(1);
  });

  it("disables capabilities and ignores notifications after an unexpected transport close", async () => {
    const { adapter, app, events } = await ready(open()); const input = app.ontoolinput!;
    app.onclose?.(); expect(adapter.getCapabilities().callTool).toBe(false);
    const count = events.length; input({ arguments: { stale: true } }); expect(events).toHaveLength(count);
    await expect(adapter.sendMessage("Authored")).rejects.toThrow("not ready");
    expect(events.at(-1)?.meta).toEqual({ connectionError: "The MCP App connection closed." });
  });

  it("retains a failed initialization error with capabilities off and closes its SDK session", async () => {
    const connection = open(); connection.app.fail(new Error("Authored initialization failure")); await turn();
    expect(connection.events.at(-1)?.meta).toEqual({ connectionError: "Authored initialization failure" });
    expect(connection.adapter.getCapabilities().callTool).toBe(false); expect(connection.app.close).toHaveBeenCalledTimes(1);
  });

  it("renders honest pre-connection provider state during SSR without creating or invoking a bridge", async () => {
    const adapter = new OfficialMCPAdapter(); let observed: ReturnType<typeof useAgentApp> | undefined;
    function ReadSnapshot() { observed = useAgentApp(); return <output data-can-call={observed.capabilities.callTool}>{observed.displayMode}</output>; }
    expect(renderToStaticMarkup(<AgentAppProvider adapter={adapter}><ReadSnapshot /></AgentAppProvider>)).toContain('data-can-call="false"');
    await expect(observed!.callTool("fixture")).rejects.toThrow("provider connection is not active");
    expect(sdk.App.instances).toHaveLength(0);
  });
});

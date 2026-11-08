import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import type { DisplayMode } from "@mcpcn/core";

export type PlaygroundResult = Parameters<AppBridge["sendToolResult"]>[0];
export type HostSettings = {
  theme: "light" | "dark";
  displayMode: DisplayMode;
  width: number;
  tools: boolean;
  context: boolean;
  denyExpanded: boolean;
  toolOutcome: "success" | "tool-error" | "protocol-error";
};
export type TraceEvent = { direction: "app → host" | "host → app" | "session"; message: string };
type Options = {
  settings(): HostSettings;
  trace(event: TraceEvent): void;
  status(value: "connecting" | "ready" | "closed" | "failed"): void;
  context(value: string): void;
  message(value: string): void;
  mode(value: DisplayMode): void;
};
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function wireSummary(value: unknown) {
  if (!record(value) || value.jsonrpc !== "2.0") return null;
  const id = typeof value.id === "number" || typeof value.id === "string" ? ` #${String(value.id).slice(0, 40)}` : "";
  if (typeof value.method === "string") return value.method.slice(0, 100) + id;
  if (record(value.error)) return `error${id} (${typeof value.error.code === "number" ? value.error.code : "unknown"})`;
  return Object.hasOwn(value, "result") ? `result${id}` : null;
}
class ObservedTransport extends PostMessageTransport {
  constructor(target: Window, private observe: (event: TraceEvent) => void) { super(target, target); }
  override async send(...args: Parameters<PostMessageTransport["send"]>) {
    await super.send(...args);
    const summary = wireSummary(args[0]);
    if (summary) this.observe({ direction: "host → app", message: summary });
  }
}

// A fixture host for this repository's trusted built-in app. It never connects
// an MCP server, executes an external tool or evaluates editor text as code.
export function createHostSession(iframe: HTMLIFrameElement, options: Options) {
  const target = iframe.contentWindow;
  if (!target) throw new Error("frame_window_missing");
  let live = true, initialized = false, closing: Promise<void> | undefined;
  const initial = options.settings();
  let currentMode = initial.displayMode;
  const context = () => ({ theme: options.settings().theme, displayMode: currentMode,
    availableDisplayModes: ["inline", "pip", "fullscreen"] as DisplayMode[],
    containerDimensions: { width: options.settings().width, maxHeight: 1000 } });
  const bridge = new AppBridge(null, { name: "MCPCN authored fixture host", version: "0.1.0" }, {
    ...(initial.tools ? { serverTools: {} } : {}),
    ...(initial.context ? { updateModelContext: { text: {} } } : {}),
    message: { text: {} },
  }, { hostContext: context() });
  const trace = (event: TraceEvent) => { if (live) options.trace(event); };
  const incoming = (event: MessageEvent) => {
    if (!live || event.source !== target) return;
    const summary = wireSummary(event.data);
    if (summary) trace({ direction: "app → host", message: summary });
  };
  window.addEventListener("message", incoming);
  let readyResolve!: () => void, readyReject!: (reason: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  // Attach a rejection observer immediately; the UI also awaits this promise.
  void ready.catch(() => undefined);
  const timer = window.setTimeout(() => {
    if (!live || initialized) return;
    options.status("failed"); readyReject(new Error("bridge_initialization_timeout"));
    void dispose().catch(() => options.trace({ direction: "session", message: "Transport close failed after initialization timeout" }));
  }, 6000);
  bridge.oninitialized = () => {
    if (!live) return;
    initialized = true; clearTimeout(timer); options.status("ready");
    trace({ direction: "session", message: "SDK initialization completed" }); readyResolve();
  };
  bridge.oncalltool = async params => {
    if (!live || !initialized || !initial.tools) throw new Error("fixture_tool_unavailable");
    if (!["playground_action", "playground_echo"].includes(params.name) || !record(params.arguments)
      || Object.keys(params.arguments).some(key => !["component", "decision"].includes(key))
      || typeof params.arguments.component !== "string" || params.arguments.component.length > 100
      || typeof params.arguments.decision !== "string" || params.arguments.decision.length > 80) throw new Error("fixture_tool_arguments_invalid");
    const outcome = options.settings().toolOutcome;
    if (outcome === "protocol-error") throw new Error("authored_fixture_host_error");
    if (outcome === "tool-error") return { content: [{ type: "text", text: "Authored fixture tool reported an error." }], isError: true };
    return { content: [{ type: "text", text: "Authored fixture action accepted. No external change was made." }],
      structuredContent: { fixture: true, component: params.arguments.component, decision: params.arguments.decision } };
  };
  bridge.onupdatemodelcontext = async params => {
    if (!live || !initialized || !initial.context) throw new Error("fixture_context_unavailable");
    const content = params.content;
    if (params.structuredContent !== undefined || !Array.isArray(content) || content.length !== 1 || content[0]?.type !== "text"
      || content[0].text.length > 1024) throw new Error("fixture_context_invalid");
    let value: unknown;
    try { value = JSON.parse(content[0].text); } catch { throw new Error("fixture_context_invalid"); }
    if (!record(value) || Object.keys(value).sort().join(",") !== "component,decision"
      || typeof value.component !== "string" || value.component.length > 100
      || typeof value.decision !== "string" || value.decision.length > 80) throw new Error("fixture_context_invalid");
    options.context(JSON.stringify(value, null, 2));
    return {};
  };
  bridge.onmessage = async params => {
    if (!live || !initialized || params.content.length !== 1 || params.content[0]?.type !== "text"
      || params.content[0].text.length > 500) throw new Error("fixture_message_invalid");
    options.message(params.content[0].text); return {};
  };
  bridge.onrequestdisplaymode = async ({ mode }) => {
    if (!live || !initialized) throw new Error("fixture_session_unavailable");
    currentMode = options.settings().denyExpanded && mode !== "inline" ? "inline" : mode;
    bridge.setHostContext(context()); options.mode(currentMode);
    return { mode: currentMode };
  };
  bridge.onerror = () => { if (live) trace({ direction: "session", message: "SDK protocol error observed" }); };
  options.status("connecting");
  const connected = bridge.connect(new ObservedTransport(target, trace));
  void connected.catch(() => {
    if (!live) return;
    options.status("failed"); readyReject(new Error("bridge_connect_failed"));
    void dispose().catch(() => options.trace({ direction: "session", message: "Transport close failed after connection error" }));
  });
  async function dispose(graceful = false) {
    if (closing) return closing;
    live = false; clearTimeout(timer); window.removeEventListener("message", incoming);
    if (!initialized) readyReject(new Error("fixture_session_closed"));
    closing = (async () => {
      if (graceful && initialized) {
        try {
          await bridge.teardownResource({}, { timeout: 1000 });
          options.trace({ direction: "session", message: "App teardown acknowledged" });
        } catch { options.trace({ direction: "session", message: "App teardown acknowledgement unavailable; closing transport" }); }
      }
      bridge.oninitialized = undefined; bridge.oncalltool = undefined; bridge.onmessage = undefined;
      bridge.onupdatemodelcontext = undefined; bridge.onrequestdisplaymode = undefined;
      bridge.onerror = undefined;
      await bridge.close();
    })();
    await closing;
  }
  return {
    connected, ready,
    async invoke(input: Record<string, unknown>, result: PlaygroundResult) {
      await ready;
      if (!live) throw new Error("fixture_session_closed");
      await bridge.sendToolInput({ arguments: input });
      if (!live) throw new Error("fixture_session_closed");
      await bridge.sendToolResult(result);
    },
    updateContext() {
      if (!live || !initialized) return;
      currentMode = options.settings().displayMode;
      bridge.setHostContext(context());
    },
    dispose,
  };
}

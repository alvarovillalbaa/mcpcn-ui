"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DisplayMode, HostCapabilities, ToolResult } from "@mcpcn/core";
import { App as MCPApp } from "@modelcontextprotocol/ext-apps";

export type AgentAppSnapshot = {
  toolInput?: unknown;
  toolResult?: ToolResult;
  structuredContent?: unknown;
  meta?: Record<string, unknown>;
  displayMode: DisplayMode;
  widgetState?: unknown;
  capabilities: HostCapabilities;
};

export interface AgentAppAdapter {
  readonly kind: HostCapabilities["host"];
  connect?(listener: (snapshot: Partial<AgentAppSnapshot>) => void): () => void;
  callTool(name: string, args?: Record<string, unknown>): Promise<ToolResult>;
  sendMessage(message: string): Promise<void>;
  updateModelContext(context: unknown): Promise<void>;
  setWidgetState(state: unknown): Promise<void>;
  requestDisplayMode?(mode: DisplayMode): Promise<void>;
  getCapabilities(): HostCapabilities;
}

type RPCResponse = { jsonrpc: "2.0"; id?: number; result?: unknown; error?: { code: number; message: string } };

export class StandardMCPAdapter implements AgentAppAdapter {
  readonly kind = "standard-mcp" as const;
  private id = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private target: Window;
  private origin: string;
  constructor(options: { target?: Window; origin?: string } = {}) {
    this.target = options.target ?? window.parent;
    this.origin = options.origin ?? "*";
  }
  private rpc(method: string, params?: unknown): Promise<unknown> {
    const id = ++this.id;
    this.target.postMessage({ jsonrpc: "2.0", id, method, params }, this.origin);
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  connect(listener: (snapshot: Partial<AgentAppSnapshot>) => void): () => void {
    const onMessage = (event: MessageEvent) => {
      if (this.origin !== "*" && event.origin !== this.origin) return;
      const message = event.data as RPCResponse & { method?: string; params?: Record<string, unknown> };
      if (!message || message.jsonrpc !== "2.0") return;
      if (typeof message.id === "number" && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id)!;
        this.pending.delete(message.id);
        message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
      }
      if (message.method === "ui/notifications/tool-input") listener({ toolInput: message.params });
      if (message.method === "ui/notifications/tool-result") {
        const result = message.params as ToolResult;
        listener({ toolResult: result, structuredContent: result.structuredContent, meta: result._meta });
      }
      if (message.method === "ui/notifications/host-context-changed") {
        const mode = message.params?.displayMode;
        if (mode === "inline" || mode === "pip" || mode === "fullscreen") listener({ displayMode: mode });
      }
    };
    window.addEventListener("message", onMessage);
    void this.rpc("ui/initialize", { protocolVersion: "2026-01-26", appInfo: { name: "mcpcn-app", version: "0.1.0" }, appCapabilities: {} }).catch(() => undefined);
    return () => window.removeEventListener("message", onMessage);
  }
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> { return await this.rpc("tools/call", { name, arguments: args }) as ToolResult; }
  async sendMessage(message: string): Promise<void> { await this.rpc("ui/message", { role: "user", content: [{ type: "text", text: message }] }); }
  async updateModelContext(context: unknown): Promise<void> { await this.rpc("ui/update-model-context", { content: context }); }
  async setWidgetState(state: unknown): Promise<void> { await this.updateModelContext({ widgetState: state, visibility: "private" }); }
  async requestDisplayMode(mode: DisplayMode): Promise<void> { await this.rpc("ui/request-display-mode", { mode }); }
  getCapabilities(): HostCapabilities { return { callTool: true, sendMessage: true, updateModelContext: true, widgetState: true, displayModes: ["inline", "pip", "fullscreen"], host: this.kind }; }
}

/** Standard MCP Apps adapter backed by the official ext-apps SDK. */
export class OfficialMCPAdapter implements AgentAppAdapter {
  readonly kind = "standard-mcp" as const;
  private app = new MCPApp({ name: "mcpcn-app", version: "0.1.0" }, {}, { autoResize: true, strict: true });
  connect(listener: (snapshot: Partial<AgentAppSnapshot>) => void): () => void {
    this.app.ontoolinput = (input) => listener({ toolInput: input });
    this.app.ontoolresult = (result) => {
      const normalized = result as ToolResult;
      listener({ toolResult: normalized, structuredContent: normalized.structuredContent, meta: normalized._meta });
    };
    this.app.onhostcontextchanged = (context) => {
      const displayMode = context.displayMode;
      if (displayMode === "inline" || displayMode === "pip" || displayMode === "fullscreen") listener({ displayMode });
    };
    void this.app.connect().then(() => {
      const context = this.app.getHostContext();
      const displayMode = context?.displayMode;
      listener({ capabilities: this.getCapabilities(), ...(displayMode === "inline" || displayMode === "pip" || displayMode === "fullscreen" ? { displayMode } : {}) });
    }).catch((error) => listener({ meta: { connectionError: error instanceof Error ? error.message : String(error) } }));
    return () => {
      this.app.ontoolinput = undefined;
      this.app.ontoolresult = undefined;
      this.app.onhostcontextchanged = undefined;
    };
  }
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> { return await this.app.callServerTool({ name, arguments: args }) as ToolResult; }
  async sendMessage(message: string): Promise<void> { await this.app.sendMessage({ role: "user", content: [{ type: "text", text: message }] }); }
  async updateModelContext(context: unknown): Promise<void> { await this.app.updateModelContext({ content: [{ type: "text", text: typeof context === "string" ? context : JSON.stringify(context) }] }); }
  async setWidgetState(): Promise<void> { /* Standard MCP Apps does not define private host widget storage. */ }
  async requestDisplayMode(mode: DisplayMode): Promise<void> { await this.app.requestDisplayMode({ mode }); }
  getCapabilities(): HostCapabilities {
    const host = this.app.getHostContext();
    return { callTool: true, sendMessage: true, updateModelContext: true, widgetState: false, displayModes: host?.availableDisplayModes ?? ["inline"], host: this.kind };
  }
}

type OpenAIWindow = Window & { openai?: { callTool?: (name: string, args: Record<string, unknown>) => Promise<ToolResult>; sendFollowUpMessage?: (args: { prompt: string }) => Promise<void>; setWidgetState?: (state: unknown) => Promise<void>; toolInput?: unknown; toolOutput?: ToolResult; widgetState?: unknown; displayMode?: DisplayMode } };
export class OpenAIAdapter implements AgentAppAdapter {
  readonly kind = "openai" as const;
  private api() { return (window as OpenAIWindow).openai; }
  connect(listener: (snapshot: Partial<AgentAppSnapshot>) => void): () => void {
    const api = this.api();
    listener({ toolInput: api?.toolInput, toolResult: api?.toolOutput, structuredContent: api?.toolOutput?.structuredContent, widgetState: api?.widgetState, displayMode: api?.displayMode ?? "inline" });
    const handler = () => listener({ toolInput: api?.toolInput, toolResult: api?.toolOutput, structuredContent: api?.toolOutput?.structuredContent, widgetState: api?.widgetState, displayMode: api?.displayMode ?? "inline" });
    window.addEventListener("openai:set_globals", handler);
    return () => window.removeEventListener("openai:set_globals", handler);
  }
  async callTool(name: string, args: Record<string, unknown> = {}) { const fn = this.api()?.callTool; if (!fn) throw new Error("Host does not expose callTool"); return fn(name, args); }
  async sendMessage(message: string) { const fn = this.api()?.sendFollowUpMessage; if (!fn) throw new Error("Host does not expose follow-up messages"); await fn({ prompt: message }); }
  async updateModelContext(context: unknown) { await this.sendMessage(typeof context === "string" ? context : JSON.stringify(context)); }
  async setWidgetState(state: unknown) { const fn = this.api()?.setWidgetState; if (!fn) throw new Error("Host does not expose widget state"); await fn(state); }
  getCapabilities(): HostCapabilities { const api = this.api(); return { callTool: !!api?.callTool, sendMessage: !!api?.sendFollowUpMessage, updateModelContext: !!api?.sendFollowUpMessage, widgetState: !!api?.setWidgetState, displayModes: ["inline", "fullscreen"], host: this.kind }; }
}

export class MockAdapter implements AgentAppAdapter {
  readonly kind = "mock" as const;
  calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  constructor(public snapshot: Partial<AgentAppSnapshot> = {}, private toolHandler?: (name: string, args: Record<string, unknown>) => Promise<ToolResult>) {}
  connect(listener: (snapshot: Partial<AgentAppSnapshot>) => void) { listener(this.snapshot); return () => undefined; }
  async callTool(name: string, args: Record<string, unknown> = {}) { this.calls.push({ name, args }); return this.toolHandler ? this.toolHandler(name, args) : { structuredContent: { ok: true } }; }
  async sendMessage(message: string) { this.snapshot = { ...this.snapshot, meta: { ...this.snapshot.meta, lastMessage: message } }; }
  async updateModelContext(context: unknown) { this.snapshot = { ...this.snapshot, meta: { ...this.snapshot.meta, modelContext: context } }; }
  async setWidgetState(widgetState: unknown) { this.snapshot = { ...this.snapshot, widgetState }; }
  getCapabilities(): HostCapabilities { return { callTool: true, sendMessage: true, updateModelContext: true, widgetState: true, displayModes: ["inline", "fullscreen"], host: this.kind }; }
}

export function detectAdapter(): AgentAppAdapter {
  if (typeof window === "undefined") return new MockAdapter();
  if ((window as OpenAIWindow).openai) return new OpenAIAdapter();
  if (window.parent !== window) return new OfficialMCPAdapter();
  return new MockAdapter();
}

type AgentAppContextValue = AgentAppSnapshot & {
  callTool: AgentAppAdapter["callTool"];
  sendMessage: AgentAppAdapter["sendMessage"];
  updateModelContext: AgentAppAdapter["updateModelContext"];
  setWidgetState: AgentAppAdapter["setWidgetState"];
  requestDisplayMode(mode: DisplayMode): Promise<void>;
};
const AgentAppContext = createContext<AgentAppContextValue | null>(null);

export function AgentAppProvider({ children, adapter }: { children: ReactNode; adapter?: AgentAppAdapter }) {
  const adapterRef = useRef<AgentAppAdapter>(adapter ?? detectAdapter());
  const [snapshot, setSnapshot] = useState<AgentAppSnapshot>(() => ({ displayMode: "inline", capabilities: adapterRef.current.getCapabilities() }));
  useEffect(() => adapterRef.current.connect?.((next) => setSnapshot((current) => ({ ...current, ...next }))), []);
  const value = useMemo<AgentAppContextValue>(() => ({
    ...snapshot,
    callTool: adapterRef.current.callTool.bind(adapterRef.current),
    sendMessage: adapterRef.current.sendMessage.bind(adapterRef.current),
    updateModelContext: adapterRef.current.updateModelContext.bind(adapterRef.current),
    setWidgetState: adapterRef.current.setWidgetState.bind(adapterRef.current),
    requestDisplayMode: async (mode) => { await adapterRef.current.requestDisplayMode?.(mode); setSnapshot((s) => ({ ...s, displayMode: mode })); }
  }), [snapshot]);
  return <AgentAppContext.Provider value={value}>{children}</AgentAppContext.Provider>;
}

export function useAgentApp() { const value = useContext(AgentAppContext); if (!value) throw new Error("useAgentApp must be used within AgentAppProvider"); return value; }
export function useToolInput<T = unknown>() { return useAgentApp().toolInput as T | undefined; }
export function useToolResult<T = unknown>() { return useAgentApp().toolResult as (ToolResult & { structuredContent?: T }) | undefined; }
export function useHostCapabilities() { return useAgentApp().capabilities; }
export function useWidgetState<T>(initial: T) {
  const app = useAgentApp();
  const [state, setLocalState] = useState<T>((app.widgetState as T | undefined) ?? initial);
  const setState = useCallback(async (next: T | ((current: T) => T)) => { const resolved = typeof next === "function" ? (next as (current: T) => T)(state) : next; setLocalState(resolved); await app.setWidgetState(resolved); }, [app, state]);
  return [state, setState] as const;
}

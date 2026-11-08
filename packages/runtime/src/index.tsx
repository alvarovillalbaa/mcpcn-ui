"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DisplayMode, HostCapabilities, ToolResult } from "@mcpcn/core";
import { App as MCPApp } from "@modelcontextprotocol/ext-apps";

export type AgentAppSnapshot = {
  /** Official/OpenAI adapters expose raw arguments, not a notification envelope. */
  toolInput?: unknown;
  toolResult?: ToolResult;
  structuredContent?: unknown;
  meta?: Record<string, unknown>;
  displayMode: DisplayMode;
  theme?: "light" | "dark";
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

type OfficialSession = {
  app: MCPApp;
  listener: (snapshot: Partial<AgentAppSnapshot>) => void;
  active: boolean;
  ready: boolean;
  tearingDown: boolean;
  closed: boolean;
  closeRequested: boolean;
};

/** Standard MCP Apps adapter backed by the official ext-apps SDK. */
export class OfficialMCPAdapter implements AgentAppAdapter {
  readonly kind = "standard-mcp" as const;
  private session?: OfficialSession;
  private current(session: OfficialSession) {
    return session.active && !session.tearingDown && this.session === session;
  }
  private close(session: OfficialSession) {
    if (session.closeRequested || session.closed) return;
    session.closeRequested = true;
    void session.app.close().then(() => { session.closed = true; }).catch(() => {
      if (this.current(session)) session.listener({ meta: { connectionError: "The MCP App connection could not be closed." } });
    });
  }
  private ready(capability?: "callTool" | "sendMessage" | "updateModelContext") {
    const session = this.session;
    if (!session || !session.active || !session.ready || session.closed) throw new Error("The MCP App connection is not ready.");
    if (capability && !this.getCapabilities()[capability]) throw new Error(`The host does not support ${capability}.`);
    return session;
  }
  private completed(session: OfficialSession) {
    if (!this.current(session) || !session.ready || session.closed) throw new Error("The MCP App connection changed before the request completed.");
  }
  private publishContext(session: OfficialSession) {
    if (!this.current(session) || session.closed) return;
    const context = session.app.getHostContext(), displayMode = context?.displayMode, theme = context?.theme;
    session.listener({ capabilities: this.getCapabilities(),
      ...(displayMode === "inline" || displayMode === "pip" || displayMode === "fullscreen" ? { displayMode } : {}),
      ...(theme === "light" || theme === "dark" ? { theme } : {}) });
  }
  connect(listener: (snapshot: Partial<AgentAppSnapshot>) => void): () => void {
    if (this.session?.active) throw new Error("The MCP App adapter is already connected.");
    const app = new MCPApp({ name: "mcpcn-app", version: "0.1.0" }, {}, { autoResize: true, strict: true });
    const session = { app, listener, active: true, ready: false, tearingDown: false, closed: false, closeRequested: false };
    this.session = session;
    app.ontoolinput = (input) => { if (this.current(session) && !session.closed) listener({ toolInput: input.arguments }); };
    app.ontoolresult = (result) => {
      if (!this.current(session) || session.closed) return;
      const normalized = result as ToolResult;
      listener({ toolResult: normalized, structuredContent: normalized.structuredContent, meta: normalized._meta });
    };
    app.onhostcontextchanged = () => this.publishContext(session);
    app.onteardown = () => {
      if (this.current(session)) { session.ready = false; session.tearingDown = true; listener({ capabilities: this.getCapabilities() }); }
      return {};
    };
    app.onclose = () => {
      session.ready = false; session.closed = true;
      if (this.current(session)) listener({ capabilities: this.getCapabilities(), meta: { connectionError: "The MCP App connection closed." } });
    };
    listener({ toolInput: undefined, toolResult: undefined, structuredContent: undefined, meta: undefined, widgetState: undefined,
      displayMode: "inline", theme: undefined, capabilities: this.getCapabilities() });
    void app.connect(undefined, { timeout: 10000 }).then(() => {
      if (!this.current(session) || session.closed) return;
      session.ready = true; this.publishContext(session);
    }).catch((error) => {
      if (!this.current(session)) return;
      session.ready = false;
      listener({ capabilities: this.getCapabilities(), meta: { connectionError: error instanceof Error ? error.message : String(error) } });
      session.tearingDown = true;
      this.close(session);
    });
    return () => {
      if (!session.active) return;
      session.active = false; session.ready = false;
      if (this.session === session) this.session = undefined;
      app.ontoolinput = undefined; app.ontoolresult = undefined; app.onhostcontextchanged = undefined; app.onteardown = undefined; app.onclose = undefined;
      this.close(session);
    };
  }
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    const session = this.ready("callTool"), result = await session.app.callServerTool({ name, arguments: args });
    this.completed(session); return result as ToolResult;
  }
  async sendMessage(message: string): Promise<void> {
    const session = this.ready("sendMessage"); await session.app.sendMessage({ role: "user", content: [{ type: "text", text: message }] }); this.completed(session);
  }
  async updateModelContext(context: unknown): Promise<void> {
    const session = this.ready("updateModelContext");
    await session.app.updateModelContext({ content: [{ type: "text", text: typeof context === "string" ? context : JSON.stringify(context) }] }); this.completed(session);
  }
  async setWidgetState(): Promise<void> { throw new Error("Standard MCP Apps does not support private host widget storage."); }
  async requestDisplayMode(mode: DisplayMode): Promise<void> {
    const session = this.ready();
    if (!this.getCapabilities().displayModes.includes(mode)) throw new Error("The host does not support this display mode.");
    const result = await session.app.requestDisplayMode({ mode });
    this.completed(session); session.listener({ displayMode: result.mode });
  }
  getCapabilities(): HostCapabilities {
    const session = this.session, ready = session?.active && session.ready && !session.closed;
    const capabilities = ready ? session.app.getHostCapabilities() : undefined, host = ready ? session.app.getHostContext() : undefined;
    return { callTool: !!capabilities?.serverTools, sendMessage: !!capabilities?.message?.text, updateModelContext: !!capabilities?.updateModelContext?.text,
      widgetState: false, displayModes: ready ? [...(host?.availableDisplayModes ?? ["inline"])] : [], host: this.kind };
  }
}

type OpenAIWindow = Window & { openai?: { callTool?: (name: string, args: Record<string, unknown>) => Promise<ToolResult>; sendFollowUpMessage?: (args: { prompt: string }) => Promise<void>; setWidgetState?: (state: unknown) => Promise<void>; toolInput?: unknown; toolOutput?: ToolResult; widgetState?: unknown; displayMode?: DisplayMode; theme?: "light" | "dark" } };
export class OpenAIAdapter implements AgentAppAdapter {
  readonly kind = "openai" as const;
  private api() { return (window as OpenAIWindow).openai; }
  connect(listener: (snapshot: Partial<AgentAppSnapshot>) => void): () => void {
    const api = this.api();
    listener({ toolInput: api?.toolInput, toolResult: api?.toolOutput, structuredContent: api?.toolOutput?.structuredContent, widgetState: api?.widgetState, displayMode: api?.displayMode ?? "inline", theme: api?.theme === "light" || api?.theme === "dark" ? api.theme : undefined });
    const handler = () => listener({ toolInput: api?.toolInput, toolResult: api?.toolOutput, structuredContent: api?.toolOutput?.structuredContent, widgetState: api?.widgetState, displayMode: api?.displayMode ?? "inline", theme: api?.theme === "light" || api?.theme === "dark" ? api.theme : undefined });
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
  private listeners = new Set<(snapshot: Partial<AgentAppSnapshot>) => void>();
  constructor(public snapshot: Partial<AgentAppSnapshot> = {}, private toolHandler?: (name: string, args: Record<string, unknown>) => Promise<ToolResult>) {}
  private publish(next: Partial<AgentAppSnapshot>) { this.snapshot = { ...this.snapshot, ...next }; for (const listener of this.listeners) listener(next); }
  connect(listener: (snapshot: Partial<AgentAppSnapshot>) => void) { this.listeners.add(listener); listener(this.snapshot); return () => { this.listeners.delete(listener); }; }
  async callTool(name: string, args: Record<string, unknown> = {}) { this.calls.push({ name, args }); return this.toolHandler ? this.toolHandler(name, args) : { structuredContent: { ok: true } }; }
  async sendMessage(message: string) { this.publish({ meta: { ...this.snapshot.meta, lastMessage: message } }); }
  async updateModelContext(context: unknown) { this.publish({ meta: { ...this.snapshot.meta, modelContext: context } }); }
  async setWidgetState(widgetState: unknown) { this.publish({ widgetState }); }
  async requestDisplayMode(mode: DisplayMode) {
    if (!this.getCapabilities().displayModes.includes(mode)) throw new Error("The mock host does not support this display mode.");
    this.publish({ displayMode: mode });
  }
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
function initialSnapshot(adapter: AgentAppAdapter): AgentAppSnapshot { return { displayMode: "inline", capabilities: adapter.getCapabilities() }; }

export function AgentAppProvider({ children, adapter }: { children: ReactNode; adapter?: AgentAppAdapter }) {
  const connection = useMemo(() => ({ adapter: adapter ?? detectAdapter() }), [adapter]), selected = connection.adapter;
  const activeConnection = useRef<typeof connection | null>(null);
  const [state, setState] = useState(() => ({ connection, snapshot: initialSnapshot(selected) }));
  const snapshot = state.connection === connection ? state.snapshot : initialSnapshot(selected);
  useEffect(() => {
    let active = true; activeConnection.current = connection;
    setState({ connection, snapshot: initialSnapshot(selected) });
    const disconnect = selected.connect?.((next) => {
      if (!active || activeConnection.current !== connection) return;
      setState((current) => active && activeConnection.current === connection ? { connection, snapshot: { ...(current.connection === connection ? current.snapshot : initialSnapshot(selected)), ...next } } : current);
    });
    return () => { active = false; if (activeConnection.current === connection) activeConnection.current = null; disconnect?.(); };
  }, [connection, selected]);
  const value = useMemo<AgentAppContextValue>(() => {
    const current = () => { if (activeConnection.current !== connection) throw new Error("This app provider connection is not active."); };
    return { ...snapshot,
      callTool: async (name, args) => { current(); const result = await selected.callTool(name, args); current(); return result; },
      sendMessage: async (message) => { current(); await selected.sendMessage(message); current(); },
      updateModelContext: async (context) => { current(); await selected.updateModelContext(context); current(); },
      setWidgetState: async (widgetState) => { current(); await selected.setWidgetState(widgetState); current(); },
      requestDisplayMode: async (mode) => {
        current(); if (!selected.requestDisplayMode) throw new Error("The adapter does not support display mode requests.");
        await selected.requestDisplayMode(mode); current();
      }
    };
  }, [connection, selected, snapshot]);
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

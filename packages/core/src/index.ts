export type MCPCNPayload<K extends string = string, D = unknown> = {
  kind: `mcpcn/${K}`;
  version: 1;
  data: D;
  stateVersion?: number;
};

export type MCPCNSecurityManifest = {
  modelVisible: string[];
  privateOnly: string[];
  callsTools: string[];
  destructive: boolean;
};

export type MCPCNAction<T = unknown> = {
  type: string;
  payload?: T;
  requestId?: string;
};

export type HostCapabilities = {
  callTool: boolean;
  sendMessage: boolean;
  updateModelContext: boolean;
  widgetState: boolean;
  displayModes: string[];
  host: "standard-mcp" | "openai" | "mock" | "unknown";
};

export type ToolResult = {
  structuredContent?: unknown;
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  _meta?: Record<string, unknown>;
  isError?: boolean;
};

export type DisplayMode = "inline" | "pip" | "fullscreen";

export const MCPCN_VERSION = "0.1.0";

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function createPayload<K extends string, D>(kind: K, data: D, stateVersion?: number): MCPCNPayload<K, D> {
  return { kind: `mcpcn/${kind}`, version: 1, data, ...(stateVersion === undefined ? {} : { stateVersion }) };
}

export function isMCPCNPayload(value: unknown): value is MCPCNPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.kind === "string" && candidate.kind.startsWith("mcpcn/") && candidate.version === 1 && "data" in candidate;
}

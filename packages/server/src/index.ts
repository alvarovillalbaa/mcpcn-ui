import type { MCPCNPayload, MCPCNSecurityManifest } from "@mcpcn/core";
import type { z } from "zod";

export { registerAppTool, registerAppResource } from "@modelcontextprotocol/ext-apps/server";

export const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";
export type ToolVisibility = "model" | "app";

export type StructuredResult<K extends string, T> = {
  structuredContent: MCPCNPayload<K, T>;
  content: Array<{ type: "text"; text: string }>;
  _meta?: Record<string, unknown>;
};

export function createStructuredResult<K extends string, T>(kind: K, data: T, options: { text?: string; meta?: Record<string, unknown>; stateVersion?: number } = {}): StructuredResult<K, T> {
  return {
    structuredContent: { kind: `mcpcn/${kind}`, version: 1, data, ...(options.stateVersion === undefined ? {} : { stateVersion: options.stateVersion }) },
    content: [{ type: "text", text: options.text ?? `Rendered ${kind} for review.` }],
    ...(options.meta ? { _meta: options.meta } : {})
  };
}

export function createApprovalResult<T>(data: T, options?: Parameters<typeof createStructuredResult<"approval-card", T>>[2]) { return createStructuredResult("approval-card", data, options); }
export function createToolProgressResult<T>(data: T, options?: Parameters<typeof createStructuredResult<"tool-progress-timeline", T>>[2]) { return createStructuredResult("tool-progress-timeline", data, options); }

export type ToolConfig<I, O, K extends string> = {
  name: string;
  title?: string;
  description: string;
  component: K;
  resourceUri?: string;
  inputSchema: z.ZodType<I> | Record<string, unknown>;
  outputSchema?: z.ZodType<O> | Record<string, unknown>;
  visibility?: ToolVisibility[];
  destructive?: boolean;
  readOnly?: boolean;
  idempotent?: boolean;
  security?: MCPCNSecurityManifest;
  handler(input: I): Promise<StructuredResult<K, O>> | StructuredResult<K, O>;
};

type MCPServerLike = {
  registerTool(name: string, config: Record<string, unknown>, handler: (input: unknown) => unknown): unknown;
  registerResource(name: string, uri: string, config: Record<string, unknown>, handler: () => unknown): unknown;
};

function schemaValue(schema: z.ZodType | Record<string, unknown>): unknown { return "safeParse" in schema ? schema : schema; }

export function registerComponentTool<I, O, K extends string>(server: MCPServerLike, config: ToolConfig<I, O, K>) {
  const resourceUri = config.resourceUri ?? `ui://mcpcn/${config.component}`;
  const visibility = config.visibility ?? ["model", "app"];
  return server.registerTool(config.name, {
    title: config.title ?? config.name,
    description: config.description,
    inputSchema: schemaValue(config.inputSchema),
    ...(config.outputSchema ? { outputSchema: schemaValue(config.outputSchema) } : {}),
    annotations: { readOnlyHint: config.readOnly ?? false, destructiveHint: config.destructive ?? false, idempotentHint: config.idempotent ?? false },
    _meta: {
      ui: { resourceUri, visibility },
      "openai/outputTemplate": resourceUri,
      mcpcn: { component: config.component, security: config.security }
    }
  }, async (input) => {
    const candidate = config.inputSchema as z.ZodType<I>;
    const parsed = typeof candidate.safeParse === "function" ? candidate.safeParse(input) : { success: true as const, data: input as I };
    if (!parsed.success) return { isError: true, content: [{ type: "text", text: `Invalid tool input: ${parsed.error.message}` }] };
    return await config.handler(parsed.data);
  });
}

export function registerComponentResource(server: MCPServerLike, options: { component: string; html: string | (() => string); resourceUri?: string; csp?: { connectDomains?: string[]; resourceDomains?: string[]; frameDomains?: string[] }; description?: string }) {
  const uri = options.resourceUri ?? `ui://mcpcn/${options.component}`;
  return server.registerResource(options.component, uri, { description: options.description ?? `MCPCN ${options.component} app resource`, mimeType: RESOURCE_MIME_TYPE }, () => ({
    contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: typeof options.html === "function" ? options.html() : options.html, _meta: { ui: { csp: options.csp ?? {} }, "openai/widgetCSP": options.csp ?? {} } }]
  }));
}

export function registerComponentApp<I, O, K extends string>(server: MCPServerLike, config: ToolConfig<I, O, K> & { html: string | (() => string); csp?: Parameters<typeof registerComponentResource>[1]["csp"] }) {
  registerComponentResource(server, { component: config.component, html: config.html, resourceUri: config.resourceUri, csp: config.csp });
  return registerComponentTool(server, config);
}

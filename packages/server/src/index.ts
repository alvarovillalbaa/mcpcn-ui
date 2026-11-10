import type { MCPCNPayload, MCPCNSecurityManifest } from "@mcpcn/core";
import type { McpServer, RegisteredResource, RegisteredTool, ResourceMetadata, ReadResourceCallback, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AnySchema, ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/types.js";
import { registerAppTool as officialRegisterAppTool, registerAppResource as officialRegisterAppResource, RESOURCE_MIME_TYPE as OFFICIAL_RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { wireSnapshot } from "./wire.js";

export const RESOURCE_MIME_TYPE: "text/html;profile=mcp-app" = OFFICIAL_RESOURCE_MIME_TYPE;
type AppToolConfig = {
  title?: string; description?: string;
  annotations?: Parameters<McpServer["registerTool"]>[1]["annotations"];
  _meta: Record<string, unknown> & { ui?: { resourceUri?: string; visibility?: Array<"model" | "app">; [key: string]: unknown }; "ui/resourceUri"?: string };
};
// Keep server declarations on SDK1 types. ext-apps1.7.5's public declaration
// graph imports unrelated browser declarations with extensionless ESM paths.
// Runtime registration still delegates to the pinned official implementation.
export function registerAppTool<O extends ZodRawShapeCompat | AnySchema, I extends undefined | ZodRawShapeCompat | AnySchema = undefined>(
  server: Pick<McpServer, "registerTool">, name: string, config: AppToolConfig & { inputSchema?: I; outputSchema?: O }, handler: ToolCallback<I>,
): RegisteredTool {
  // ext-apps1.x delegates these Zod forms directly to SDK1 at runtime; its
  // transitional Standard-Schema declaration is narrower than that SDK surface.
  return officialRegisterAppTool(server, name, config as Parameters<typeof officialRegisterAppTool>[2], handler as Parameters<typeof officialRegisterAppTool>[3]);
}
export function registerAppResource(server: Pick<McpServer, "registerResource">, name: string, uri: string, config: ResourceMetadata, handler: ReadResourceCallback): RegisteredResource {
  return officialRegisterAppResource(server, name, uri, config, handler);
}
export type ToolVisibility = "model" | "app";
export type ToolContext = RequestHandlerExtra<ServerRequest, ServerNotification>;
type TextContent = { type: "text"; text: string };
export type StructuredResult<K extends string, T> = {
  structuredContent: MCPCNPayload<K, T>;
  content: TextContent[];
  isError?: false;
  _meta?: Record<string, unknown>;
};
export type ToolFailure = { isError: true; content: TextContent[]; _meta?: Record<string, unknown> };
export type ToolResultValidation<K extends string, T> =
  | { success: true; data: StructuredResult<K, T> | ToolFailure }
  | { success: false; error: { code: "tool-result-invalid" } };

const componentId = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/).max(128);
const stateVersion = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const textContent = z.object({ type: z.literal("text"), text: z.string().max(65536) }).strict();
const metadata = z.record(z.string(), z.unknown());
const resultOptions = z.object({ text: z.string().max(65536).optional(), meta: metadata.optional(), stateVersion: stateVersion.optional() }).strict();
function payloadSchema<K extends string, O extends z.ZodType>(component: K, schema: O) {
  return z.object({ kind: z.literal(`mcpcn/${component}` as const), version: z.literal(1), data: schema, stateVersion: stateVersion.optional() }).strict().required({ data: true });
}
export function createStructuredResult<K extends string, T>(kind: K, data: T, options: { text?: string; meta?: Record<string, unknown>; stateVersion?: number } = {}): StructuredResult<K, T> {
  try {
    componentId.parse(kind);
    const supplied = resultOptions.parse(wireSnapshot(options));
    const result: StructuredResult<K, T> = { structuredContent: { kind: `mcpcn/${kind}`, version: 1, data,
      ...(supplied.stateVersion === undefined ? {} : { stateVersion: supplied.stateVersion }) },
      content: [{ type: "text", text: supplied.text ?? `Rendered ${kind} for review.` }],
      ...(supplied.meta === undefined ? {} : { _meta: supplied.meta }) };
    return wireSnapshot(result);
  } catch { throw new Error("mcpcn_server_payload_invalid"); }
}
export function createApprovalResult<T>(data: T, options?: Parameters<typeof createStructuredResult<"approval-card", T>>[2]) { return createStructuredResult("approval-card", data, options); }
export function createToolProgressResult<T>(data: T, options?: Parameters<typeof createStructuredResult<"tool-progress-timeline", T>>[2]) { return createStructuredResult("tool-progress-timeline", data, options); }

/** Output schema describes data; the registered MCP schema describes its envelope. */
export async function validateToolResult<K extends string, O extends z.ZodType>(component: K, schema: O, candidate: unknown): Promise<ToolResultValidation<K, z.output<O>>> {
  try {
    componentId.parse(component);
    const result = wireSnapshot(candidate);
    if (result === null || typeof result !== "object" || Array.isArray(result)) return { success: false, error: { code: "tool-result-invalid" } };
    const fields = result as Record<string, unknown>;
    if (fields.isError !== true && (!fields.structuredContent || typeof fields.structuredContent !== "object" || Array.isArray(fields.structuredContent)
      || !Object.hasOwn(fields.structuredContent, "data"))) return { success: false, error: { code: "tool-result-invalid" } };
    const success = z.object({ structuredContent: payloadSchema(component, schema), content: z.array(textContent).max(20),
      isError: z.literal(false).optional(), _meta: metadata.optional() }).strict();
    const failure = z.object({ isError: z.literal(true), content: z.array(textContent.extend({ text: z.string().min(1).max(65536).refine(value => Boolean(value.trim())) })).min(1).max(20), _meta: metadata.optional() }).strict();
    const parsed = await z.union([success, failure]).safeParseAsync(result);
    if (!parsed.success) return { success: false, error: { code: "tool-result-invalid" } };
    return { success: true, data: wireSnapshot(parsed.data) as StructuredResult<K, z.output<O>> | ToolFailure };
  } catch { return { success: false, error: { code: "tool-result-invalid" } }; }
}

export type ToolConfig<I extends z.ZodObject = z.ZodObject, O extends z.ZodType = z.ZodType, K extends string = string> = {
  name: string; title?: string; description: string; component: K; resourceUri?: string;
  inputSchema: I; outputSchema: O; visibility?: ToolVisibility[];
  destructive?: boolean; readOnly?: boolean; idempotent?: boolean;
  security?: MCPCNSecurityManifest;
  handler(input: z.output<I>, context: ToolContext): Promise<StructuredResult<K, z.input<O>> | ToolFailure> | StructuredResult<K, z.input<O>> | ToolFailure;
};
const plain = (max: number) => z.string().min(1).max(max).refine(value => Boolean(value.trim()) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Supply visible plain text.");
const uiUri = z.string().max(2048).refine(value => {
  try { const url = new URL(value); return url.protocol === "ui:" && Boolean(url.hostname) && !url.username && !url.password && !url.hash && !/\s/.test(value); } catch { return false; }
}, "Supply a stable ui:// resource URI.");
const declarations = z.object({ modelVisible: z.array(plain(300)).max(100), privateOnly: z.array(plain(300)).max(100), callsTools: z.array(plain(128)).max(100), destructive: z.boolean() }).strict();
const settingsSchema = z.object({ name: z.string().regex(/^[A-Za-z0-9_.-]{1,128}$/), title: plain(300).optional(), description: plain(4000), component: componentId,
  resourceUri: uiUri, visibility: z.array(z.enum(["model", "app"])).min(1).max(2).refine(value => new Set(value).size === value.length),
  destructive: z.boolean(), readOnly: z.boolean(), idempotent: z.boolean(), security: declarations.optional(),
}).strict().refine(value => !(value.readOnly && value.destructive), "Read-only and destructive declarations conflict.");
function prepareTool<I extends z.ZodObject, O extends z.ZodType, K extends string>(config: ToolConfig<I, O, K>) {
  try {
    const settings = settingsSchema.parse({ name: config.name, title: config.title, description: config.description, component: config.component,
      resourceUri: config.resourceUri ?? `ui://mcpcn/${config.component}`, visibility: config.visibility ?? ["model", "app"],
      destructive: config.destructive ?? false, readOnly: config.readOnly ?? false, idempotent: config.idempotent ?? false,
      ...(config.security === undefined ? {} : { security: wireSnapshot(config.security) }) });
    if (config.inputSchema?.type !== "object" || typeof config.inputSchema.safeParseAsync !== "function" || typeof config.outputSchema?.safeParseAsync !== "function" || typeof config.handler !== "function") throw new Error("schema_required");
    const input = config.inputSchema, data = config.outputSchema, output = payloadSchema(config.component, data), handler = config.handler;
    // Refuse an unsupported schema before either SDK registration can mutate state.
    z.toJSONSchema(input, { io: "input" }); z.toJSONSchema(output, { io: "output" });
    return { settings, input, data, output, handler, component: config.component };
  } catch { throw new Error("mcpcn_server_tool_config_invalid"); }
}
function registerPreparedTool<I extends z.ZodObject, O extends z.ZodType, K extends string>(server: Pick<McpServer, "registerTool">, prepared: ReturnType<typeof prepareTool<I, O, K>>): RegisteredTool {
  const p = prepared.settings;
  return registerAppTool(server, p.name, { title: p.title ?? p.name, description: p.description, inputSchema: prepared.input, outputSchema: prepared.output,
    annotations: { readOnlyHint: p.readOnly, destructiveHint: p.destructive, idempotentHint: p.idempotent },
    _meta: { ui: { resourceUri: p.resourceUri, visibility: [...p.visibility] }, "openai/outputTemplate": p.resourceUri,
      "openai/widgetAccessible": p.visibility.includes("app"), "openai/visibility": p.visibility.includes("model") ? "public" : "private",
      mcpcn: { component: p.component, ...(p.security === undefined ? {} : { security: p.security }) } },
  }, async (input, context) => {
    const fail = (text: string): ToolFailure => ({ isError: true, content: [{ type: "text", text }] });
    if (context.signal.aborted) return fail("The MCP tool request was cancelled.");
    try {
      // The real MCP SDK has already parsed/transformed input. Preserve context.
      const candidate = await prepared.handler(input as z.output<I>, context);
      if (context.signal.aborted) return fail("The MCP tool request was cancelled.");
      const result = await validateToolResult(prepared.component, prepared.data, candidate);
      if (context.signal.aborted) return fail("The MCP tool request was cancelled.");
      return result.success ? result.data : fail("The MCP App tool returned an invalid result.");
    } catch { return fail(context.signal.aborted ? "The MCP tool request was cancelled." : "The MCP tool request could not be completed."); }
  });
}
export function registerComponentTool<I extends z.ZodObject, O extends z.ZodType, K extends string>(server: Pick<McpServer, "registerTool">, config: ToolConfig<I, O, K>): RegisteredTool {
  return registerPreparedTool(server, prepareTool(config));
}

const origin = z.string().max(2048).refine(value => {
  try {
    const url = new URL(value);
    return ["https:", "http:", "wss:", "ws:"].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === "/" && !/\s/.test(value) && (!url.hostname.includes("*") || /^\*\.[^*]+\.[^*]+$/.test(url.hostname));
  } catch { return false; }
}, "Supply an explicit origin, optionally with a wildcard subdomain.");
const origins = z.array(origin).max(100).refine(value => new Set(value).size === value.length, "Origins must be unique.");
const cspSchema = z.object({ connectDomains: origins.default([]), resourceDomains: origins.default([]), frameDomains: origins.optional(), baseUriDomains: origins.optional() }).strict();
export type ResourceOptions = { component: string; html: string | (() => string | Promise<string>); resourceUri?: string; description?: string; csp?: z.input<typeof cspSchema> };
function prepareResource(options: ResourceOptions) {
  try {
    const component = componentId.parse(options.component), uri = uiUri.parse(options.resourceUri ?? `ui://mcpcn/${component}`);
    const description = plain(4000).parse(options.description ?? `MCPCN ${component} app resource`);
    if (typeof options.html !== "string" && typeof options.html !== "function") throw new Error("html_required");
    if (typeof options.html === "string" && new TextEncoder().encode(options.html).byteLength > 2 * 1024 * 1024) throw new Error("html_bound");
    const csp = cspSchema.parse(options.csp === undefined ? {} : wireSnapshot(options.csp));
    const meta = { ui: { csp }, "openai/widgetCSP": { connect_domains: csp.connectDomains, resource_domains: csp.resourceDomains,
      ...(csp.frameDomains === undefined ? {} : { frame_domains: csp.frameDomains }) } };
    return { component, uri, description, html: options.html, meta: wireSnapshot(meta) };
  } catch { throw new Error("mcpcn_server_resource_config_invalid"); }
}
function registerPreparedResource(server: Pick<McpServer, "registerResource">, resource: ReturnType<typeof prepareResource>): RegisteredResource {
  return registerAppResource(server, resource.component, resource.uri, { description: resource.description, _meta: wireSnapshot(resource.meta) }, async () => {
    try {
      const html = typeof resource.html === "function" ? await resource.html() : resource.html;
      if (typeof html !== "string" || new TextEncoder().encode(html).byteLength > 2 * 1024 * 1024) throw new Error("html_bound");
      return { contents: [{ uri: resource.uri, mimeType: RESOURCE_MIME_TYPE, text: html, _meta: wireSnapshot(resource.meta) }] };
    } catch { throw new Error("The MCP App resource could not be read."); }
  });
}
export function registerComponentResource(server: Pick<McpServer, "registerResource">, options: ResourceOptions): RegisteredResource {
  return registerPreparedResource(server, prepareResource(options));
}
export function registerComponentApp<I extends z.ZodObject, O extends z.ZodType, K extends string>(server: Pick<McpServer, "registerTool" | "registerResource">, config: ToolConfig<I, O, K> & Pick<ResourceOptions, "html" | "csp">): RegisteredTool {
  const tool = prepareTool(config), resource = prepareResource({ component: config.component, resourceUri: config.resourceUri, html: config.html, csp: config.csp });
  const registered = registerPreparedResource(server, resource);
  try { return registerPreparedTool(server, tool); }
  catch (error) { registered.remove(); throw error; }
}

// T2 real SDK registration plus authored callback contexts; not host/Auth proof.
import { afterEach, describe, expect, it, vi } from "vitest";
import { McpServer, type RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerComponentTool, registerComponentResource, registerComponentApp, createStructuredResult, RESOURCE_MIME_TYPE, type ToolContext } from "./index.js";

const servers: McpServer[] = [];
function server() { const value = new McpServer({ name: "authored-server", version: "1.0.0" }); servers.push(value); return value; }
function config() {
  return { name: "authored_tool", description: "Authored description", component: "authored-report" as const,
    inputSchema: z.object({ count: z.number() }).strict(), outputSchema: z.object({ count: z.number() }).strict(),
    handler: ({ count }: { count: number }) => createStructuredResult("authored-report", { count }) };
}
const context = (controller = new AbortController()) => ({ signal: controller.signal, requestId: "authored-request", authInfo: { token: "AUTHORED_ONLY", clientId: "authored-client", scopes: ["authored:read"] } }) as unknown as ToolContext;
const invoke = async (tool: RegisteredTool, input: unknown, extra = context()) => {
  expect(typeof tool.handler).toBe("function");
  return await (tool.handler as (input: unknown, context: ToolContext) => unknown)(input, extra);
};
afterEach(async () => { for (const value of servers.splice(0)) await value.close(); vi.restoreAllMocks(); });

describe("T2 server registration contract", () => {
  it("SV-T01 registers the complete payload output schema and official linkage", () => {
    const tool = registerComponentTool(server(), config()), exported = z.toJSONSchema(tool.outputSchema as z.ZodType) as Record<string, unknown>;
    expect(exported.required).toEqual(expect.arrayContaining(["kind", "version", "data"]));
    expect(exported.properties).toMatchObject({ kind: { const: "mcpcn/authored-report" }, version: { const: 1 }, data: { type: "object" } });
    expect(tool._meta).toMatchObject({ ui: { resourceUri: "ui://mcpcn/authored-report", visibility: ["model", "app"] }, "ui/resourceUri": "ui://mcpcn/authored-report", "openai/outputTemplate": "ui://mcpcn/authored-report" });
  });
  it("SV-T02 preserves explicit model/app/both visibility with coherent compatibility hints", () => {
    for (const [index, visibility] of [["model"], ["app"], ["app", "model"]].entries()) {
      const tool = registerComponentTool(server(), { ...config(), name: `tool_${index}`, visibility: visibility as Array<"model" | "app"> });
      expect(tool._meta).toMatchObject({ ui: { visibility }, "openai/widgetAccessible": visibility.includes("app"), "openai/visibility": visibility.includes("model") ? "public" : "private" });
    }
  });
  it("SV-T03 rejects empty, duplicate and unknown visibility before SDK mutation", () => {
    const value = server(), spy = vi.spyOn(value, "registerTool");
    for (const visibility of [[], ["model", "model"], ["unknown"]]) expect(() => registerComponentTool(value, { ...config(), visibility } as never)).toThrow("mcpcn_server_tool_config_invalid");
    expect(spy).not.toHaveBeenCalled();
  });
  it("SV-T04 rejects invalid names, component identifiers and resource URIs before registration", () => {
    const value = server(), spy = vi.spyOn(value, "registerTool");
    for (const patch of [{ name: "bad name" }, { component: "bad/name" }, { resourceUri: "https://example.com/app" }, { resourceUri: "ui://user:password@view/app" }, { resourceUri: "ui://view/app#fragment" }]) expect(() => registerComponentTool(value, { ...config(), ...patch } as never)).toThrow("mcpcn_server_tool_config_invalid");
    expect(spy).not.toHaveBeenCalled();
  });
  it("SV-T05 requires Zod object input and a representable output schema", () => {
    const value = server(), spy = vi.spyOn(value, "registerTool");
    for (const patch of [{ inputSchema: { type: "object" } }, { inputSchema: z.string() }, { outputSchema: undefined }, { outputSchema: z.custom(() => true) }]) expect(() => registerComponentTool(value, { ...config(), ...patch } as never)).toThrow("mcpcn_server_tool_config_invalid");
    expect(spy).not.toHaveBeenCalled();
  });
  it("SV-T06 refuses contradictory annotations and snapshots declared metadata", () => {
    expect(() => registerComponentTool(server(), { ...config(), readOnly: true, destructive: true })).toThrow("mcpcn_server_tool_config_invalid");
    const security = { modelVisible: ["count"], privateOnly: ["private"], callsTools: [], destructive: false };
    const tool = registerComponentTool(server(), { ...config(), security, readOnly: true }); security.modelVisible.push("later");
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: false });
    expect(tool._meta).toMatchObject({ mcpcn: { security: { modelVisible: ["count"] } } });
  });
  it("SV-T07 captures the selected handler and preserves the original SDK context", async () => {
    const value = config(), extra = context(); let seen: unknown;
    value.handler = (input, supplied?: ToolContext) => { seen = supplied; return createStructuredResult("authored-report", input); };
    const tool = registerComponentTool(server(), value); value.handler = () => { throw new Error("REPLACEMENT_MUST_NOT_RUN"); };
    expect(await invoke(tool, { count: 0 }, extra)).toMatchObject({ structuredContent: { data: { count: 0 } } }); expect(seen).toBe(extra);
  });
  it("SV-T08 retains typed data schema defaults in successful handler output", async () => {
    const tool = registerComponentTool(server(), { ...config(), outputSchema: z.object({ count: z.number().default(0) }).strict(), handler: () => createStructuredResult("authored-report", {}) });
    expect(await invoke(tool, { count: 7 })).toMatchObject({ structuredContent: { data: { count: 0 } } });
  });
  it("SV-T09 converts malformed output to a generic data-free error", async () => {
    const tool = registerComponentTool(server(), { ...config(), handler: () => ({ structuredContent: { kind: "mcpcn/other", version: 1, data: { count: 0 } }, content: [{ type: "text", text: "PRIVATE_BAD_OUTPUT" }], _meta: { private: "PRIVATE_META" } }) } as never);
    expect(await invoke(tool, { count: 0 })).toEqual({ isError: true, content: [{ type: "text", text: "The MCP App tool returned an invalid result." }] });
  });
  it("SV-T10 sanitizes synchronous and asynchronous handler exceptions", async () => {
    for (const handler of [() => { throw new Error("PRIVATE_SYNC"); }, async () => { throw new Error("PRIVATE_ASYNC"); }]) {
      const tool = registerComponentTool(server(), { ...config(), handler });
      expect(await invoke(tool, { count: 0 })).toEqual({ isError: true, content: [{ type: "text", text: "The MCP tool request could not be completed." }] });
    }
  });
  it("SV-T11 preserves explicit application error metadata without structured data", async () => {
    const response = { isError: true as const, content: [{ type: "text" as const, text: "Authored request denied" }], _meta: { "example/denial": "Authored" } };
    const tool = registerComponentTool(server(), { ...config(), handler: () => response });
    expect(await invoke(tool, { count: 0 })).toEqual(response);
  });
  it("SV-T12 never invokes the handler after a pre-existing cancellation", async () => {
    const handler = vi.fn(config().handler), tool = registerComponentTool(server(), { ...config(), handler }), controller = new AbortController(); controller.abort();
    expect(await invoke(tool, { count: 0 }, context(controller))).toEqual({ isError: true, content: [{ type: "text", text: "The MCP tool request was cancelled." }] }); expect(handler).not.toHaveBeenCalled();
  });
  it("SV-T13 discards handler data/metadata when cancelled before completion", async () => {
    const controller = new AbortController();
    const tool = registerComponentTool(server(), { ...config(), handler: () => { controller.abort(); return createStructuredResult("authored-report", { count: 0 }, { meta: { private: "PRIVATE_AFTER_ABORT" } }); } });
    expect(await invoke(tool, { count: 0 }, context(controller))).toEqual({ isError: true, content: [{ type: "text", text: "The MCP tool request was cancelled." }] });
  });
  it("SV-T14 fences cancellation during asynchronous output validation", async () => {
    const controller = new AbortController(); let entered!: () => void, settle!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { settle = resolve; });
    const outputSchema = config().outputSchema.refine(async () => { entered(); await gate; return true; });
    const tool = registerComponentTool(server(), { ...config(), outputSchema }); const pending = invoke(tool, { count: 0 }, context(controller));
    await enteredPromise; controller.abort(); settle();
    expect(await pending).toEqual({ isError: true, content: [{ type: "text", text: "The MCP tool request was cancelled." }] });
  });
  it("SV-T15 exposes complete standard CSP and explicit snake_case compatibility metadata", async () => {
    const csp = { connectDomains: ["wss://api.example.com"], resourceDomains: ["https://*.cdn.example.com"], frameDomains: ["https://frames.example.com"], baseUriDomains: ["https://cdn.example.com"] };
    const resource = registerComponentResource(server(), { component: "authored-report", html: "<main>Complete authored HTML</main>", csp });
    const meta = { ui: { csp: structuredClone(csp) }, "openai/widgetCSP": { connect_domains: [...csp.connectDomains], resource_domains: [...csp.resourceDomains], frame_domains: [...csp.frameDomains] } };
    expect(resource.metadata).toMatchObject({ mimeType: RESOURCE_MIME_TYPE, _meta: meta });
    const result = await resource.readCallback(new URL("ui://mcpcn/authored-report"), context()); expect(result.contents[0]).toMatchObject({ text: "<main>Complete authored HTML</main>", mimeType: RESOURCE_MIME_TYPE, _meta: meta });
    csp.connectDomains.push("https://later.example.com"); expect(resource.metadata?._meta).toEqual(meta);
  });
  it("SV-T16 reads asynchronous HTML only on demand and returns owned metadata", async () => {
    const html = vi.fn(async () => "<main>ASYNC_HTML_END</main>"), resource = registerComponentResource(server(), { component: "authored-report", html }); expect(html).not.toHaveBeenCalled();
    const first = await resource.readCallback(new URL("ui://mcpcn/authored-report"), context()); expect(html).toHaveBeenCalledOnce(); expect(first.contents[0]).toMatchObject({ text: "<main>ASYNC_HTML_END</main>" });
    expect(first.contents[0]?._meta).not.toBe(resource.metadata?._meta);
  });
  it("SV-T17 rejects malformed CSP, URI and oversized static HTML before mutation", () => {
    const value = server(), spy = vi.spyOn(value, "registerResource");
    for (const patch of [{ resourceUri: "https://example.com" }, { csp: { connectDomains: ["https://user:secret@example.com"] } }, { csp: { connectDomains: ["https://example.com/path"] } }, { csp: { connectDomains: ["*"] } }, { csp: { connectDomains: ["https://same.example.com", "https://same.example.com"] } }, { csp: { unsafe: true } }, { html: "界".repeat(700000) }]) expect(() => registerComponentResource(value, { component: "authored-report", html: "Authored", ...patch } as never)).toThrow("mcpcn_server_resource_config_invalid");
    expect(spy).not.toHaveBeenCalled();
  });
  it("SV-T18 sanitizes async HTML exceptions, nonstrings and oversized output", async () => {
    for (const html of [async () => { throw new Error("PRIVATE_HTML_ERROR"); }, async () => 7, async () => "界".repeat(700000)]) {
      const resource = registerComponentResource(server(), { component: "authored-report", html } as never);
      await expect(resource.readCallback(new URL("ui://mcpcn/authored-report"), context())).rejects.toThrow("The MCP App resource could not be read.");
    }
  });
  it("SV-T19 preflights both configurations before app registration", () => {
    const value = server(), toolSpy = vi.spyOn(value, "registerTool"), resourceSpy = vi.spyOn(value, "registerResource");
    expect(() => registerComponentApp(value, { ...config(), outputSchema: undefined, html: "Authored" } as never)).toThrow("mcpcn_server_tool_config_invalid");
    expect(() => registerComponentApp(value, { ...config(), html: "Authored", csp: { unsafe: true } } as never)).toThrow("mcpcn_server_resource_config_invalid");
    expect(toolSpy).not.toHaveBeenCalled(); expect(resourceSpy).not.toHaveBeenCalled();
  });
  it("SV-T20 rolls back only its newly created resource after duplicate tool failure", () => {
    const value = server(), existing = registerComponentTool(value, config()); registerComponentResource(value, { component: "unrelated-view", html: "KEEP_EXISTING" });
    const original = value.registerResource.bind(value); let removed = 0;
    vi.spyOn(value, "registerResource").mockImplementation(((...args: Parameters<typeof original>) => {
      const resource = original(...args), remove = resource.remove.bind(resource); resource.remove = () => { removed++; remove(); }; return resource;
    }) as typeof value.registerResource);
    expect(() => registerComponentApp(value, { ...config(), html: "NEW_RESOURCE" })).toThrow(); expect(removed).toBe(1); expect(existing.enabled).toBe(true);
  });
});

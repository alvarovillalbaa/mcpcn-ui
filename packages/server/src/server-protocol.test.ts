// T2 authored traffic through the real locked SDK and InMemoryTransport. No sockets.
import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { registerComponentTool, registerComponentResource, registerComponentApp, createStructuredResult, RESOURCE_MIME_TYPE, type ToolContext } from "./index.js";

type Observation = { id: string; status: string; messages: Array<{ direction: string; value: unknown }>; clientClosed: boolean; serverClosed: boolean; error?: string };
const observations: Observation[] = [];
const config = () => ({ name: "authored_tool", description: "Authored in-memory protocol case", component: "authored-report" as const,
  inputSchema: z.object({ count: z.number().int() }).strict(), outputSchema: z.object({ count: z.number().int() }).strict(),
  handler: ({ count }: { count: number }) => createStructuredResult("authored-report", { count }) });
async function session(id: string, register: (server: McpServer) => void, body: (client: Client) => Promise<void>) {
  const row: Observation = { id, status: "failed", messages: [], clientClosed: false, serverClosed: false }; observations.push(row);
  const server = new McpServer({ name: "authored-protocol-server", version: "1.0.0" }), client = new Client({ name: "authored-protocol-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  for (const [transport, direction] of [[clientTransport, "client-to-server"], [serverTransport, "server-to-client"]] as const) {
    const send = transport.send.bind(transport);
    transport.send = async (message, options) => {
      const encoded = JSON.stringify(message); expect(Buffer.byteLength(encoded)).toBeLessThan(131072); expect(row.messages.length).toBeLessThan(100);
      row.messages.push({ direction, value: JSON.parse(encoded) }); return send(message, options);
    };
  }
  try {
    register(server); await server.connect(serverTransport); await client.connect(clientTransport, { timeout: 2000 });
    await body(client); row.status = "passed";
  } catch (error) { row.error = error instanceof Error ? error.message : String(error); throw error; }
  finally {
    await client.close(); row.clientClosed = true; await server.close(); row.serverClosed = !server.isConnected(); expect(row.serverClosed).toBe(true);
  }
}
const call = (client: Client, args: { name: string; arguments: Record<string, unknown> }) => client.callTool(args, undefined, { timeout: 2000 });
afterAll(() => {
  const output = process.env.MCPCN_SV_OUTPUT;
  if (!output) return;
  const root = process.env.MCPCN_SV_RUN_ROOT;
  if (process.env.CI !== "true" || !root || !path.isAbsolute(root) || output !== path.join(root, "output") || fs.realpathSync(root) !== root
    || fs.lstatSync(root).uid !== process.getuid?.() || fs.readFileSync(path.join(root, ".owner"), "utf8") !== process.env.MCPCN_SV_NONCE) throw new Error("protocol_retention_owner_invalid");
  const report = { schemaVersion: "mcpcn.server-protocol.v1", sourceCommit: process.env.SOURCE_COMMIT, cases: observations,
    passed: observations.length === 12 && observations.every(row => row.status === "passed" && row.clientClosed && row.serverClosed),
    proofLimits: ["Real pinned SDK and in-memory MCP transport only. No external host, network listener, authentication provider, database or external state change."] };
  const encoded = JSON.stringify(report); if (Buffer.byteLength(encoded) > 4 * 1024 * 1024) throw new Error("protocol_report_bound");
  fs.writeFileSync(path.join(output, "server-protocol.json"), encoded, { flag: "wx", mode: 0o600 });
});

describe("T2 real MCP server/client protocol", () => {
  it("SV-P01 advertises and returns the same complete envelope schema", async () => session("SV-P01", server => { registerComponentTool(server, config()); }, async client => {
    const listed = await client.listTools(); expect(listed.tools).toHaveLength(1);
    expect(listed.tools[0]?.outputSchema).toMatchObject({ type: "object", required: expect.arrayContaining(["kind", "version", "data"]), properties: { kind: { const: "mcpcn/authored-report" }, data: { type: "object" } } });
    expect(await call(client, { name: "authored_tool", arguments: { count: 0 } })).toMatchObject({ structuredContent: { kind: "mcpcn/authored-report", version: 1, data: { count: 0 } } });
  }));
  it("SV-P02 refuses a wrong component result without leaking its body", async () => session("SV-P02", server => {
    registerComponentTool(server, { ...config(), handler: () => createStructuredResult("other-report", { count: 0 }, { meta: { marker: "PRIVATE_WRONG_KIND" } }) } as never);
  }, async client => {
    await client.listTools(); const result = await call(client, { name: "authored_tool", arguments: { count: 0 } });
    expect(result).toEqual({ isError: true, content: [{ type: "text", text: "The MCP App tool returned an invalid result." }] });
  }));
  it("SV-P03 rejects invalid output data before the SDK/client expose it", async () => session("SV-P03", server => {
    registerComponentTool(server, { ...config(), handler: () => createStructuredResult("authored-report", { count: "PRIVATE_WRONG_TYPE" }) } as never);
  }, async client => {
    await client.listTools(); expect(await call(client, { name: "authored_tool", arguments: { count: 0 } })).toEqual({ isError: true, content: [{ type: "text", text: "The MCP App tool returned an invalid result." }] });
  }));
  it("SV-P04 lets the real SDK reject bad arguments before handler invocation", async () => {
    const handler = vi.fn(config().handler);
    await session("SV-P04", server => { registerComponentTool(server, { ...config(), handler }); }, async client => {
      const result = await call(client, { name: "authored_tool", arguments: { count: "AUTHORED_BAD_INPUT" } }); expect(result.isError).toBe(true); expect(JSON.stringify(result)).not.toContain("AUTHORED_BAD_INPUT"); expect(handler).not.toHaveBeenCalled();
    });
  });
  it("SV-P05 transforms input once and preserves actual SDK request context", async () => {
    let transforms = 0, received: ToolContext | undefined;
    await session("SV-P05", server => {
      registerComponentTool(server, { ...config(), inputSchema: z.object({ count: z.number().transform(value => { transforms++; return value + 1; }) }).strict(),
        handler: (value, extra) => { received = extra; return createStructuredResult("authored-report", value); } });
    }, async client => {
      await client.listTools(); expect(await call(client, { name: "authored_tool", arguments: { count: 2 } })).toMatchObject({ structuredContent: { data: { count: 3 } } });
      expect(transforms).toBe(1); expect(received?.signal).toBeInstanceOf(AbortSignal); expect(received?.requestId).toBeDefined();
    });
  });
  it("SV-P06 keeps deliberate private metadata outside model-visible fields", async () => session("SV-P06", server => {
    registerComponentTool(server, { ...config(), handler: value => createStructuredResult("authored-report", value, { meta: { "example/private": { marker: "PRIVATE_AUTHORED_END" } } }) });
  }, async client => {
    await client.listTools(); const result = await call(client, { name: "authored_tool", arguments: { count: 0 } });
    expect(result._meta).toEqual({ "example/private": { marker: "PRIVATE_AUTHORED_END" } }); expect(JSON.stringify([result.structuredContent, result.content])).not.toContain("PRIVATE_AUTHORED_END");
  }));
  it("SV-P07 declares all three visibility modes without claiming server authorization", async () => session("SV-P07", server => {
    for (const [index, visibility] of [["model"], ["app"], ["model", "app"]].entries()) registerComponentTool(server, { ...config(), name: `tool_${index}`, visibility: visibility as Array<"model" | "app"> });
  }, async client => {
    const result = await client.listTools(); expect(result.tools).toHaveLength(3);
    result.tools.forEach((tool, index) => expect(tool._meta).toMatchObject({ ui: { visibility: [["model"], ["app"], ["model", "app"]][index], resourceUri: "ui://mcpcn/authored-report" }, "ui/resourceUri": "ui://mcpcn/authored-report" }));
  }));
  it("SV-P08 lists and reads exact async resource HTML and complete CSP metadata", async () => session("SV-P08", server => {
    registerComponentApp(server, { ...config(), resourceUri: "ui://authored/review.html", html: async () => "<main>REAL_RESOURCE_END</main>", csp: { connectDomains: [], resourceDomains: ["https://cdn.example.com"], frameDomains: [], baseUriDomains: ["https://cdn.example.com"] } });
  }, async client => {
    const listed = await client.listResources(); expect(listed.resources).toHaveLength(1); expect(listed.resources[0]).toMatchObject({ uri: "ui://authored/review.html", mimeType: RESOURCE_MIME_TYPE });
    const result = await client.readResource({ uri: "ui://authored/review.html" }); expect(result.contents).toHaveLength(1);
    expect(result.contents[0]).toMatchObject({ uri: "ui://authored/review.html", mimeType: RESOURCE_MIME_TYPE, text: "<main>REAL_RESOURCE_END</main>", _meta: listed.resources[0]?._meta });
    expect(result.contents[0]?._meta).toMatchObject({ ui: { csp: { baseUriDomains: ["https://cdn.example.com"] } }, "openai/widgetCSP": { connect_domains: [], resource_domains: ["https://cdn.example.com"], frame_domains: [] } });
  }));
  it("SV-P09 preserves explicit application error results and sanitizes exceptions", async () => session("SV-P09", server => {
    registerComponentTool(server, { ...config(), name: "denied_tool", handler: () => ({ isError: true, content: [{ type: "text", text: "Authored denial" }], _meta: { "example/denied": true } }) });
    registerComponentTool(server, { ...config(), name: "throwing_tool", handler: () => { throw new Error("PRIVATE_HANDLER_ERROR"); } });
  }, async client => {
    await client.listTools(); expect(await call(client, { name: "denied_tool", arguments: { count: 0 } })).toEqual({ isError: true, content: [{ type: "text", text: "Authored denial" }], _meta: { "example/denied": true } });
    expect(await call(client, { name: "throwing_tool", arguments: { count: 0 } })).toEqual({ isError: true, content: [{ type: "text", text: "The MCP tool request could not be completed." }] });
  }));
  it("SV-P10 leaves no orphan resource and preserves existing registrations on failure", async () => session("SV-P10", server => {
    registerComponentTool(server, config()); registerComponentResource(server, { component: "unrelated-view", html: "KEEP_EXISTING_RESOURCE" });
    expect(() => registerComponentApp(server, { ...config(), html: "MUST_ROLL_BACK" })).toThrow();
  }, async client => {
    expect((await client.listResources()).resources.map(resource => resource.uri)).toEqual(["ui://mcpcn/unrelated-view"]);
    expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(["authored_tool"]);
    expect(await call(client, { name: "authored_tool", arguments: { count: 0 } })).toMatchObject({ structuredContent: { data: { count: 0 } } });
  }));
  it("SV-P11 refuses a programmatic result getter across the real protocol without reading it", async () => {
    let reads = 0;
    await session("SV-P11", server => {
      registerComponentTool(server, { ...config(), handler: () => { const value = {}; Object.defineProperty(value, "structuredContent", { enumerable: true, get() { reads++; return "PRIVATE_GETTER"; } }); return value; } } as never);
    }, async client => {
      const result = await call(client, { name: "authored_tool", arguments: { count: 0 } }); expect(result.isError).toBe(true); expect(reads).toBe(0); expect(JSON.stringify(result)).not.toContain("PRIVATE_GETTER");
    });
  });
  it("SV-P12 propagates actual client cancellation into the handler signal", async () => {
    let begin!: () => void, release!: () => void, observed!: () => void, finished!: () => void;
    const started = new Promise<void>(resolve => { begin = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const aborted = new Promise<void>(resolve => { observed = resolve; }), completed = new Promise<void>(resolve => { finished = resolve; });
    await session("SV-P12", server => {
      registerComponentTool(server, { ...config(), handler: async (input, extra) => {
        extra.signal.addEventListener("abort", observed, { once: true }); begin(); await gate; expect(extra.signal.aborted).toBe(true); finished(); return createStructuredResult("authored-report", input);
      } });
    }, async client => {
      const controller = new AbortController(), request = client.callTool({ name: "authored_tool", arguments: { count: 0 } }, undefined, { signal: controller.signal, timeout: 2000 });
      await started; controller.abort(); await expect(request).rejects.toThrow(); await aborted; release(); await completed;
    });
  });
});

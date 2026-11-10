// Explicit CI-only fixture. Never a public server or production authentication example.
import fs from "node:fs";
import path from "node:path";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { BlockKindSchema, blockToolNames, type BlockKind } from "../../schemas/dist/block-workflow-schemas.js";
import { BlockWorkflowStore, registerBlockServer } from "../dist/block-recipes.js";
import { blockFixturePrincipal, blockFixtureExecutors, seedBlockFixture } from "../dist/block-fixtures.js";
function need(value: unknown): asserts value { if (!value) throw new Error("block_fixture_refused"); }
need(process.env.CI === "true" && process.platform === "linux" && process.version === "v24.22.2");
const root = fs.realpathSync(process.env.MCPCN_BR_RUN_ROOT!), nonce = process.env.MCPCN_BR_NONCE!;
const stat = fs.lstatSync(root); need(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid!() && (stat.mode & 0o077) === 0 && fs.readFileSync(path.join(root, ".owner"), "utf8") === nonce);
const width = Number(process.env.MCPCN_BR_WIDTH), phase = process.env.MCPCN_BR_PHASE; need([390,1280].includes(width) && ["flow","reload"].includes(phase!));
const sourceCommit = process.env.SOURCE_COMMIT!; need(/^[a-f0-9]{40}$/.test(sourceCommit)); process.umask(0o077);
const assets = fs.realpathSync(path.resolve("tooling/dist/block-browser")), output = path.join(root, "output"), privateReady = path.join(root, "tmp", `block-${phase}-${width}-ready.json`);
const databasePath = path.join(root, "consumers", `browser-${width}.sqlite`);
if (!fs.existsSync(databasePath)) fs.closeSync(fs.openSync(databasePath, "wx", 0o600));
const dbStat = fs.lstatSync(databasePath); need(dbStat.isFile() && !dbStat.isSymbolicLink() && dbStat.nlink === 1 && (dbStat.mode & 0o077) === 0);
const database = new DatabaseSync(databasePath), store = new BlockWorkflowStore(database), principal = structuredClone(blockFixturePrincipal);
const sessions = new Map<BlockKind, { server: McpServer; client: Client; dispose(): void }>(), active = new Set<Promise<unknown>>();
const traffic: Array<{ block: BlockKind; direction: string; message: unknown }> = [], token = randomBytes(32).toString("hex"), tokenHash = createHash("sha256").update(token).digest();
let bytes = 0, origin = "", closing = false;
function regular(file: string, maximum: number) {
  const stat = fs.lstatSync(file); need(stat.isFile() && !stat.isSymbolicLink() && stat.size <= maximum && fs.realpathSync(file) === file);
  return fs.readFileSync(file);
}
function send(response: ServerResponse, status: number, value: unknown) { if (!response.destroyed && !response.writableEnded) { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(value)); } }
async function body(request: IncomingMessage) {
  let count = 0; const chunks: Buffer[] = [];
  for await (const chunk of request) { count += chunk.length; need(count <= 1024 * 1024); chunks.push(Buffer.from(chunk)); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
const CallSchema = z.object({ block: BlockKindSchema, name: z.string().max(128), args: z.record(z.string(), z.unknown()) }).strict();
const http = createServer((request, response) => {
  const handle = async () => {
    response.setHeader("Cache-Control", "no-store"); response.setHeader("X-Content-Type-Options", "nosniff"); response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; form-action 'self'; base-uri 'none'");
    try {
      need(!closing && origin && request.headers.host === new URL(origin).host);
      const url = new URL(request.url ?? "/", origin); need(url.origin === origin && !url.search && !url.hash);
      const cookies = (request.headers.cookie ?? "").split(";").map(value => value.trim()).filter(value => value.startsWith("mcpcn-block="));
      const supplied = cookies.length === 1 ? cookies[0]!.slice("mcpcn-block=".length) : "";
      if (!/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(createHash("sha256").update(supplied).digest(), tokenHash)) return send(response, 401, { error: "access-required" });
      if (request.method === "POST" && url.pathname === "/api/call") {
        need(request.headers.origin === origin && /^application\/json(?:;|$)/i.test(request.headers["content-type"] ?? ""));
        const call = CallSchema.parse(await body(request)), session = sessions.get(call.block); need(session && Object.values(blockToolNames(call.block)).includes(call.name));
        const controller = new AbortController(); response.once("close", () => { if (!response.writableEnded) controller.abort(); });
        const result = await session.client.callTool({ name: call.name, arguments: call.args }, undefined, { signal: controller.signal, timeout: 15000 }); return send(response, 200, result);
      }
      if (request.method === "GET" && url.pathname.startsWith("/app/")) {
        const block = BlockKindSchema.parse(url.pathname.slice(5)), session = sessions.get(block); need(session);
        const resource = await session.client.readResource({ uri: `ui://mcpcn/blocks/${block}.html` }), content = resource.contents[0]; need(content && "text" in content);
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end(content.text); return;
      }
      const relative = url.pathname === "/" ? "host/index.html" : url.pathname.startsWith("/block-assets/") ? url.pathname.slice(14) : "";
      need(request.method === "GET" && /^(?:(?:host|app)\/index\.html|assets\/[A-Za-z0-9._-]+\.(?:js|css))$/.test(relative));
      const raw = regular(path.join(assets, relative), 2 * 1024 * 1024);
      response.writeHead(200, { "Content-Type": relative.endsWith(".html") ? "text/html; charset=utf-8" : relative.endsWith(".css") ? "text/css" : "application/javascript" }); response.end(raw);
    } catch { send(response, 400, { error: "request-refused" }); }
  };
  const pending = handle(); active.add(pending); void pending.finally(() => active.delete(pending)).catch(() => undefined);
});
http.requestTimeout = 20000; http.headersTimeout = 5000; http.keepAliveTimeout = 1000; http.maxHeadersCount = 50;
let closePromise: Promise<void> | undefined;
function close() {
  if (closePromise) return closePromise; closing = true;
  closePromise = (async () => {
    const stopped = http.listening ? new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve())) : Promise.resolve();
    http.closeAllConnections(); await Promise.allSettled([...active]);
    for (const session of sessions.values()) { session.dispose(); await session.client.close(); await session.server.close(); }
    const closedSessions = sessions.size; sessions.clear(); await stopped; store.close();
    fs.writeFileSync(path.join(output, `block-${phase}-${width}-protocol.json`), JSON.stringify({ sourceCommit, width, phase, closed: !http.listening && store.isClosed && !active.size, closedSessions, traffic }, null, 2), { flag: "wx", mode: 0o600 });
  })(); return closePromise;
}
try {
  for (const block of BlockKindSchema.options) {
    seedBlockFixture(database, store, principal, block); const server = new McpServer({ name: "authored-block-browser", version: "1" });
    const registration = registerBlockServer(server, block, { store, resolvePrincipal: () => principal, policyRevision: "authored-policy-v1", executors: blockFixtureExecutors,
      html: regular(path.join(assets, "app/index.html"), 65536).toString("utf8") });
    const client = new Client({ name: "authored-block-browser-client", version: "1" }), [a,b] = InMemoryTransport.createLinkedPair();
    sessions.set(block, { server, client, dispose: registration.dispose });
    for (const [transport, direction] of [[a,"server-to-client"], [b,"client-to-server"]] as const) {
      const original = transport.send.bind(transport); transport.send = async (message, options) => { const copied = JSON.parse(JSON.stringify(message)); bytes += Buffer.byteLength(JSON.stringify(copied)); need(bytes <= 16 * 1024 * 1024);
        traffic.push({ block, direction, message: copied }); return original(message, options); };
    }
    await server.connect(a); await client.connect(b); await client.listTools();
  }
  await new Promise<void>((resolve, reject) => { http.once("error", reject); http.listen(0, "127.0.0.1", () => { http.removeListener("error", reject); resolve(); }); });
  const address = http.address(); need(address && typeof address !== "string"); origin = `http://127.0.0.1:${address.port}`;
  fs.writeFileSync(privateReady, JSON.stringify({ sourceCommit, width, phase, origin, token }), { flag: "wx", mode: 0o600 });
  for (const signal of ["SIGTERM","SIGINT"] as const) process.once(signal, () => { void close().catch(() => { process.exitCode = 1; }); });
} catch (error) { await close(); throw error; }

import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { createServer as createHTTPServer, type IncomingMessage, type ServerResponse } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WorkflowStore, type Principal } from "./store.js";
import { WorkflowSchema, toolPrefix, type Workflow } from "./contracts.js";

type Definition = { id: Workflow; title: string; seed: unknown; create(options: { store: WorkflowStore; principal: Principal; html: string }): McpServer };
type Options = { workspace: string; assets: string; definitions: Definition[]; port?: number; authoredChecks?: boolean;
  observe?: (workflow: Workflow, direction: string, message: unknown) => void };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const refuse = () => { throw new Error("reference_request_refused"); };
function regular(file: string, maximum: number) {
  const before = fs.lstatSync(file); if (!before.isFile() || before.isSymbolicLink() || before.size > maximum) return refuse();
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { const now = fs.fstatSync(descriptor); if (now.dev !== before.dev || now.ino !== before.ino) return refuse(); const raw = fs.readFileSync(descriptor); if (raw.length !== before.size) return refuse(); return raw; }
  finally { fs.closeSync(descriptor); }
}
function openWorkspace(directory: string) {
  if (typeof process.getuid !== "function") return refuse();
  const target = path.resolve(directory);
  if (!fs.existsSync(target)) { if (fs.realpathSync(path.dirname(target)) !== path.dirname(target)) return refuse(); fs.mkdirSync(target, { mode: 0o700 }); }
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0 || fs.realpathSync(target) !== target) return refuse();
  const marker = path.join(target, "reference-workspace.json"), database = path.join(target, "reference.sqlite");
  if (!fs.existsSync(marker)) {
    if (fs.readdirSync(target).length) return refuse();
    fs.writeFileSync(marker, JSON.stringify({ format: "mcpcn-reference-workspace-v1", id: randomUUID(), owner: process.getuid() }), { flag: "wx", mode: 0o600 });
  }
  const value = z.object({ format: z.literal("mcpcn-reference-workspace-v1"), id: z.string().uuid(), owner: z.literal(process.getuid()) }).strict().parse(JSON.parse(regular(marker, 4096).toString()));
  const allowed = new Set(["reference-workspace.json", "reference.sqlite", "reference.sqlite-wal", "reference.sqlite-shm"]);
  if (fs.readdirSync(target).some(name => !allowed.has(name))) return refuse();
  for (const name of fs.readdirSync(target)) { const file = fs.lstatSync(path.join(target, name)); if (!file.isFile() || file.isSymbolicLink() || file.uid !== process.getuid() || file.nlink !== 1 || (file.mode & 0o077) !== 0) return refuse(); }
  if (!fs.existsSync(database)) fs.closeSync(fs.openSync(database, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600));
  return { database, principal: { workspace: value.id, actor: `local:${value.owner}`, grants: WorkflowSchema.options.slice() } satisfies Principal };
}
async function body(request: IncomingMessage, maximum: number) {
  let bytes = 0; const chunks: Buffer[] = [];
  for await (const chunk of request) { const buffer = Buffer.from(chunk); bytes += buffer.length; if (bytes > maximum) { request.destroy(); return refuse(); } chunks.push(buffer); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
function send(response: ServerResponse, status: number, value: unknown) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify(value));
}
const CallSchema = z.object({ workflow: WorkflowSchema, name: z.string().max(128), args: z.record(z.string(), z.unknown()) }).strict();

/** Trusted built-in apps only. Loopback single-operator access, not public auth. */
export async function startWorkbench(options: Options) {
  if (options.authoredChecks && process.env.CI !== "true") return refuse();
  if (options.definitions.length !== 5 || new Set(options.definitions.map(definition => definition.id)).size !== 5) return refuse();
  const assets = fs.realpathSync(options.assets), workspace = openWorkspace(options.workspace);
  const db = new DatabaseSync(workspace.database, { timeout: 3000 }); let store: WorkflowStore;
  try { store = new WorkflowStore(db); } catch (error) { db.close(); throw error; }
  const sessions = new Map<Workflow, { client: Client; server: McpServer; title: string }>();
  const active = new Set<Promise<unknown>>(), aborts = new Set<AbortController>();
  const cookies = new Map<string, number>(), accessCode = options.authoredChecks ? "authored-reference-workbench-check-code" : randomBytes(24).toString("hex");
  const codeBytes = Buffer.from(hash(accessCode)); let closing = false, origin = "", loginWindow = Date.now(), loginAttempts = 0;
  let closePromise: Promise<void> | undefined;
  const http = createHTTPServer((request, response) => {
    const handle = async () => {
      response.setHeader("Cache-Control", "no-store"); response.setHeader("X-Content-Type-Options", "nosniff"); response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("X-Frame-Options", "SAMEORIGIN");
      response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'");
      try {
        if (closing || !origin || request.headers.host !== new URL(origin).host) return send(response, 403, { error: "request-refused" });
        const url = new URL(request.url ?? "/", origin); if (url.origin !== origin || url.search || url.hash) return send(response, 400, { error: "request-refused" });
        if (request.method === "POST" && (request.headers.origin !== origin || !/^application\/json(?:;|$)/i.test(request.headers["content-type"] ?? ""))) return send(response, 403, { error: "request-refused" });
        if (request.method === "POST" && url.pathname === "/api/session") {
          if (Date.now() - loginWindow > 60000) { loginWindow = Date.now(); loginAttempts = 0; }
          if (++loginAttempts > 30) return send(response, 429, { error: "request-refused" });
          const supplied = z.object({ code: z.string().max(256) }).strict().parse(await body(request, 2048));
          if (!timingSafeEqual(Buffer.from(hash(supplied.code)), codeBytes)) return send(response, 403, { error: "request-refused" });
          for (const [cookie, expires] of cookies) if (expires < Date.now()) cookies.delete(cookie);
          if (cookies.size >= 20) return send(response, 429, { error: "request-refused" });
          const cookie = randomBytes(32).toString("hex"); cookies.set(hash(cookie), Date.now() + 1800000);
          response.setHeader("Set-Cookie", `mcpcn-reference=${cookie}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800`); return send(response, 200, { ready: true });
        }
        const selected = (request.headers.cookie ?? "").split(";").map(value => value.trim()).filter(value => value.startsWith("mcpcn-reference="));
        const cookie = selected.length === 1 ? selected[0]!.slice("mcpcn-reference=".length) : "";
        const authorized = /^[a-f0-9]{64}$/.test(cookie) && (cookies.get(hash(cookie)) ?? 0) > Date.now();
        if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/app/")) {
          if (!authorized) return send(response, 401, { error: "access-required" });
        }
        if (request.method === "GET" && url.pathname === "/api/session") return send(response, 200, { workflows: options.definitions.map(({ id, title }) => ({ id, title })), sourceMode: options.authoredChecks ? "authored-checks" : "configured-primary-sources" });
        if (request.method === "POST" && url.pathname === "/api/call") {
          const call = CallSchema.parse(await body(request, 1024 * 1024)), session = sessions.get(call.workflow);
          if (!session || !["read", "prepare", "confirm", "cancel"].some(operation => call.name === `${toolPrefix(call.workflow)}_${operation}`)) return send(response, 403, { error: "request-refused" });
          const controller = new AbortController(); aborts.add(controller);
          response.once("close", () => { if (!response.writableEnded) controller.abort(); });
          try { const result = await session.client.callTool({ name: call.name, arguments: call.args }, undefined, { signal: controller.signal, timeout: 20000 }); return send(response, 200, result); }
          finally { aborts.delete(controller); }
        }
        if (request.method === "GET" && url.pathname.startsWith("/app/")) {
          const workflow = WorkflowSchema.parse(url.pathname.slice("/app/".length)), session = sessions.get(workflow); if (!session) return refuse();
          const result = await session.client.readResource({ uri: `ui://mcpcn-reference/${workflow}.html` }); const content = result.contents[0];
          if (!content || !("text" in content) || typeof content.text !== "string") return refuse();
          response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end(content.text); return;
        }
        if (request.method === "GET" && (url.pathname === "/" || /^\/reference-assets\/(?:assets\/[A-Za-z0-9._-]+\.(?:js|css)|(?:host|hr-candidate-review|document-extraction|ecommerce-checkout-review|admin-settings-change|research-workflow)\/index\.html)$/.test(url.pathname))) {
          const relative = url.pathname === "/" ? "host/index.html" : url.pathname.slice("/reference-assets/".length), file = path.join(assets, relative);
          if (fs.realpathSync(file) !== file || !file.startsWith(assets + path.sep)) return refuse();
          const raw = regular(file, 2 * 1024 * 1024), type = file.endsWith(".html") ? "text/html" : file.endsWith(".css") ? "text/css" : "application/javascript";
          response.writeHead(200, { "Content-Type": type + "; charset=utf-8" }); response.end(raw); return;
        }
        return send(response, 404, { error: "not-found" });
      } catch { return send(response, 400, { error: "request-refused" }); }
    };
    const pending = handle(); active.add(pending); void pending.finally(() => active.delete(pending)).catch(() => undefined);
  });
  http.requestTimeout = 25000; http.headersTimeout = 5000; http.keepAliveTimeout = 1000; http.maxHeadersCount = 50;
  async function close() {
    if (closePromise) return closePromise;
    closing = true;
    closePromise = (async () => {
      for (const controller of aborts) controller.abort();
      const stopped = http.listening ? new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve())) : Promise.resolve();
      http.closeAllConnections();
      await Promise.allSettled([...active]);
      for (const { client, server } of sessions.values()) { await client.close(); await server.close(); }
      sessions.clear(); cookies.clear(); await stopped; store.close();
    })();
    return closePromise;
  }
  try {
    for (const definition of options.definitions) {
      WorkflowSchema.parse(definition.id); store.seed(workspace.principal, definition.id, "record-one", definition.seed);
      const html = regular(path.join(assets, definition.id, "index.html"), 65536).toString("utf8");
      const server = definition.create({ store, principal: workspace.principal, html }), client = new Client({ name: "mcpcn-reference-workbench", version: "0.1.0" });
      sessions.set(definition.id, { client, server, title: definition.title });
      const [a, b] = InMemoryTransport.createLinkedPair();
      if (options.observe) for (const [transport, direction] of [[a, "client-to-server"], [b, "server-to-client"]] as const) {
        const sendMessage = transport.send.bind(transport); transport.send = async (message, details) => { options.observe?.(definition.id, direction, JSON.parse(JSON.stringify(message))); return sendMessage(message, details); };
      }
      await server.connect(b); await client.connect(a, { timeout: 3000 }); await client.listTools(); await client.listResources();
    }
    await new Promise<void>((resolve, reject) => { http.once("error", reject); http.listen(options.port ?? 4557, "127.0.0.1", () => { http.removeListener("error", reject); resolve(); }); });
    const address = http.address(); if (!address || typeof address === "string") return refuse(); origin = `http://127.0.0.1:${address.port}`;
    return { origin, accessCode, close, get closed() { return closing && !http.listening && store.isClosed && sessions.size === 0 && active.size === 0; } };
  } catch (error) { await close(); throw error; }
}

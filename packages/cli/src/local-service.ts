import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST = "asset-manifest.json";
const MAX_FILE = 4 * 1024 * 1024, MAX_TOTAL = 16 * 1024 * 1024;
const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon", ".json": "application/json; charset=utf-8" };
export class LocalServiceError extends Error { constructor(readonly code: string) { super(code); } }
function need(value: unknown, code: string): asserts value { if (!value) throw new LocalServiceError(code); }
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function safeAsset(name: unknown): name is string {
  return typeof name === "string" && name.length <= 160 && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name)
    && !name.split("/").some(part => !part || part === "." || part === "..")
    && (["index.html", "frame.html"].includes(name) || /^assets\/[A-Za-z0-9._/-]+\.(?:js|css|svg|png|jpe?g|webp|avif|woff2?|ico)$/.test(name));
}
async function readAsset(file: string, cap = MAX_FILE): Promise<Buffer> {
  const before = await lstat(file);
  need(before.isFile() && !before.isSymbolicLink() && before.size <= cap && await realpath(file) === file, "local_service_asset_invalid");
  const fd = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  const stable = (stat: typeof before) => before.dev === stat.dev && before.ino === stat.ino && before.size === stat.size && before.mode === stat.mode && before.mtimeMs === stat.mtimeMs && before.ctimeMs === stat.ctimeMs;
  try {
    need(stable(await fd.stat()), "local_service_asset_changed");
    const buffer = Buffer.alloc(before.size + 1); let count = 0;
    while (count < buffer.length) {
      const read = await fd.read(buffer, count, Math.min(65536, buffer.length - count), null);
      if (read.bytesRead === 0) break; count += read.bytesRead;
    }
    need(count <= before.size && count <= cap, "local_service_asset_changed");
    const bytes = Buffer.from(buffer.subarray(0, count));
    need(bytes.length === before.size && stable(await fd.stat()) && stable(await lstat(file)), "local_service_asset_changed"); return bytes;
  } finally { await fd.close(); }
}
async function loadAssets(folder: string): Promise<{ files: Map<string, Buffer>; manifestSha256: string }> {
  need(isAbsolute(folder), "local_service_assets_missing"); folder = resolve(folder);
  const root = await realpath(folder), rootStat = await lstat(folder);
  need(root === folder && rootStat.isDirectory() && !rootStat.isSymbolicLink(), "local_service_assets_missing");
  const bytes = await readAsset(join(root, MANIFEST), 32768);
  const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  need(value && typeof value === "object" && !Array.isArray(value), "local_service_manifest_invalid");
  const manifest = value as Record<string, unknown>;
  need(Object.keys(manifest).sort().join() === "files,kind,schemaVersion" && manifest.schemaVersion === 1 && manifest.kind === "mcpcn.playground.assets.v1"
    && Array.isArray(manifest.files) && manifest.files.length >= 2 && manifest.files.length <= 64, "local_service_manifest_invalid");
  const files = new Map<string, Buffer>(); let total = 0; const ordered: string[] = [];
  for (const entry of manifest.files) {
    need(entry && typeof entry === "object" && !Array.isArray(entry), "local_service_manifest_invalid");
    const row = entry as Record<string, unknown>;
    need(Object.keys(row).sort().join() === "bytes,path,sha256" && safeAsset(row.path) && !files.has(row.path)
      && Number.isSafeInteger(row.bytes) && Number(row.bytes) > 0 && Number(row.bytes) <= MAX_FILE && typeof row.sha256 === "string" && /^[a-f0-9]{64}$/.test(row.sha256), "local_service_manifest_invalid");
    const data = await readAsset(join(root, row.path)); total += data.length;
    need(total <= MAX_TOTAL && data.length === row.bytes && sha(data) === row.sha256, "local_service_asset_hash_mismatch");
    files.set(row.path, data); ordered.push(row.path);
  }
  need(files.has("index.html") && files.has("frame.html") && JSON.stringify(ordered) === JSON.stringify([...ordered].sort()), "local_service_entries_invalid");
  const actual: string[] = []; let directories = 0;
  async function walk(folder: string, prefix = ""): Promise<void> {
    need(++directories <= 65 && prefix.length <= 160, "local_service_asset_directory_bound");
    for (const item of await readdir(folder, { withFileTypes: true })) {
      const name = prefix + item.name;
      need(!item.isSymbolicLink(), "local_service_asset_invalid");
      if (item.isDirectory()) { need(name === "assets" || name.startsWith("assets/"), "local_service_asset_invalid"); await walk(join(folder, item.name), name + "/"); }
      else { need(item.isFile() && actual.length < 65, "local_service_asset_invalid"); actual.push(name); }
    }
  }
  await walk(root);
  need(JSON.stringify(actual.sort()) === JSON.stringify([...ordered, MANIFEST].sort()), "local_service_asset_set_changed");
  const after = await lstat(root);
  need(rootStat.dev === after.dev && rootStat.ino === after.ino && rootStat.mtimeMs === after.mtimeMs && rootStat.ctimeMs === after.ctimeMs, "local_service_asset_changed");
  // Serve these verified snapshots only, never read the working directory on a request.
  files.set(MANIFEST, bytes); return { files, manifestSha256: sha(bytes) };
}
export type LocalService = { origin: string; url: string; manifestSha256: string; closed: Promise<void>; close: () => Promise<void> };
export type LocalServiceOptions = { component?: string; port?: number; assetDirectory?: string };
export async function startLocalService(options: LocalServiceOptions = {}): Promise<LocalService> {
  const port = options.port ?? 4545, component = options.component ?? "approval-card";
  need(Number.isInteger(port) && port >= 0 && port <= 65535 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(component) && component.length <= 100, "local_service_arguments_invalid");
  let assets: Awaited<ReturnType<typeof loadAssets>>;
  try { assets = await loadAssets(options.assetDirectory ?? fileURLToPath(new URL("./playground", import.meta.url))); }
  catch (error) { if (error instanceof LocalServiceError) throw error; throw new LocalServiceError("local_service_assets_missing_or_invalid"); }
  const sockets = new Set<Socket>(); let origin = "", closing = false, closedEvent = false, complete = false, terminalError: LocalServiceError | undefined;
  let resolveClosed!: () => void, rejectClosed!: (error: LocalServiceError) => void, timer: ReturnType<typeof setTimeout> | undefined, drain: ReturnType<typeof setTimeout> | undefined;
  const closed = new Promise<void>((resolve, reject) => { resolveClosed = resolve; rejectClosed = reject; }); void closed.catch(() => undefined);
  const settle = () => { if (!complete && closedEvent && sockets.size === 0) { complete = true; clearTimeout(timer); clearTimeout(drain); terminalError ? rejectClosed(terminalError) : closing ? resolveClosed() : rejectClosed(new LocalServiceError("local_service_stopped_unexpectedly")); } };
  function reply(response: ServerResponse, status: number, message: string) {
    const body = Buffer.from(message + "\n"); response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Content-Length": body.length, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...(status === 405 ? { Allow: "GET, HEAD" } : {}) }); response.end(body);
  }
  function serve(request: IncomingMessage, response: ServerResponse) {
    if (closing) { reply(response, 503, "Playground is closing."); return; }
    const hosts = request.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === "host");
    if (hosts.length !== 1 || request.headers.host !== new URL(origin).host || (request.headers.origin !== undefined && request.headers.origin !== origin)) { reply(response, 403, "Request origin is not allowed."); return; }
    if (request.method !== "GET" && request.method !== "HEAD") { reply(response, 405, "Method is not allowed."); return; }
    const raw = request.url ?? "";
    if (raw.length > 512 || !raw.startsWith("/") || raw.startsWith("//") || /[%\\\u0000-\u0020\u007f#]/.test(raw)) { reply(response, 400, "Invalid request path."); return; }
    const url = new URL(raw, origin), name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (url.origin !== origin || raw.split("?")[0] !== url.pathname || (name !== MANIFEST && !safeAsset(name))) { reply(response, 400, "Invalid request path."); return; }
    const params = [...url.searchParams];
    if (params.length && (!['/', '/index.html'].includes(url.pathname) || params.length !== 1 || params[0]![0] !== 'component' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(params[0]![1]) || params[0]![1].length > 100)) { reply(response, 400, "Invalid preview selection."); return; }
    const bytes = assets.files.get(name);
    if (!bytes) { reply(response, 404, "Playground asset not found."); return; }
    response.writeHead(200, {
      "Content-Type": mime[extname(name)]!, "Content-Length": bytes.length, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"
    }); response.end(request.method === "HEAD" ? undefined : bytes);
  }
  const server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
    try { serve(request, response); } catch { if (!response.headersSent) reply(response, 400, "Invalid request."); else response.destroy(); }
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000; server.keepAliveTimeout = 1000; server.maxConnections = 32; server.maxRequestsPerSocket = 16;
  server.on("connection", socket => { sockets.add(socket); socket.setTimeout(5000, () => socket.destroy()); socket.once("close", () => { sockets.delete(socket); settle(); }); });
  server.on("clientError", (_error, socket) => socket.destroy());
  server.once("close", () => { closedEvent = true; settle(); });
  let started = false;
  server.on("error", () => { if (started && !complete) { terminalError ??= new LocalServiceError("local_service_server_error"); void close().catch(() => undefined); } });
  await new Promise<void>((resolve, reject) => {
    let expired = false;
    const timeout = setTimeout(() => { expired = true; server.close(); reject(new LocalServiceError("local_service_start_timeout")); }, 5000);
    const error = (cause: NodeJS.ErrnoException) => { clearTimeout(timeout); reject(new LocalServiceError(cause.code === "EADDRINUSE" ? "local_service_port_in_use" : "local_service_start_failed")); };
    server.once("error", error);
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => { clearTimeout(timeout); server.off("error", error); if (expired) { server.close(); return; } started = true; const address = server.address(); if (!address || typeof address === "string") { server.close(); reject(new LocalServiceError("local_service_address_invalid")); return; } origin = `http://127.0.0.1:${address.port}`; resolve(); });
  });
  function close(): Promise<void> {
    if (!closing && !complete) {
      closing = true;
      drain = setTimeout(() => { for (const socket of sockets) socket.destroy(); }, 1000);
      timer = setTimeout(() => { if (!complete) { complete = true; rejectClosed(new LocalServiceError("local_service_close_incomplete")); } }, 3000);
      server.close(); server.closeIdleConnections();
      settle();
    }
    return closed;
  }
  return { origin, url: `${origin}/?component=${encodeURIComponent(component)}`, manifestSha256: assets.manifestSha256, close, closed };
}
export async function runLocalService(options: { component: string; port: number; log: (value: string) => void }): Promise<number> {
  let service: LocalService | undefined, signal: "SIGINT" | "SIGTERM" | undefined;
  const stop = (value: "SIGINT" | "SIGTERM") => { signal ??= value; if (service) void service.close().catch(() => undefined); };
  const interrupt = () => stop("SIGINT"), terminate = () => stop("SIGTERM");
  process.on("SIGINT", interrupt); process.on("SIGTERM", terminate);
  try {
    service = await startLocalService(options); options.log(`MCPCN playground: ${service.url}`); options.log("Press Ctrl+C to stop. No external host or tools are connected.");
    if (signal) await service.close(); await service.closed;
    return signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 0;
  } finally {
    process.off("SIGINT", interrupt); process.off("SIGTERM", terminate);
    if (service) await service.close();
  }
}

// Tier 2: authored asset fixtures test the real Node server, not a real MCP host.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import { blockCatalog, catalog } from "@mcpcn/registry/catalog";
import { runCLI } from "./installer.js";
import { LocalServiceError, startLocalService, type LocalService } from "./local-service.js";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
async function withAssets(action: (directory: string) => Promise<void>) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "mcpcn-local-service-")));
  await mkdir(join(directory, "assets"));
  const files = new Map([['index.html', Buffer.from('<!doctype html><title>Authored host fixture</title>')], ['frame.html', Buffer.from('<!doctype html><title>Authored frame fixture</title>')], ['assets/app.js', Buffer.from('export const authoredFixture = true;\n')]]);
  for (const [name, bytes] of files) await writeFile(join(directory, name), bytes);
  await writeFile(join(directory, "asset-manifest.json"), JSON.stringify({ schemaVersion: 1, kind: "mcpcn.playground.assets.v1", files: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: hash(bytes) })) }));
  try { await action(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}
async function response(service: LocalService, pathname: string, method = "GET", headers: Record<string, string> = {}) {
  return await new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; bytes: Buffer }>((resolve, reject) => {
    const target = new URL(service.origin), parts: Buffer[] = []; let bodyEnded = false, requestClosed = false, socketClosed = false, status = 0, observedHeaders = {};
    const finish = () => { if (bodyEnded && requestClosed && socketClosed) { clearTimeout(timer); resolve({ status, headers: observedHeaders, bytes: Buffer.concat(parts) }); } };
    const request = httpRequest({ hostname: target.hostname, port: target.port, path: pathname, method, agent: false, headers: { Connection: "close", ...headers } }, value => {
      status = value.statusCode!; observedHeaders = value.headers;
      value.on("data", chunk => parts.push(chunk)); value.once("end", () => { bodyEnded = true; finish(); }); value.once("error", reject);
    });
    const timer = setTimeout(() => { request.destroy(); reject(new Error("authored_http_deadline")); }, 2000);
    request.once("socket", socket => socket.once("close", () => { socketClosed = true; finish(); }));
    request.once("close", () => { requestClosed = true; finish(); }); request.once("error", reject); request.end();
  });
}
describe("local simulator service", () => {
  it("serves exact manifest-bound index frame and asset bytes with HEAD and no credential or CORS response", async () => withAssets(async directory => {
    const service = await startLocalService({ port: 0, assetDirectory: directory, component: "comparison-matrix" });
    try {
      expect(service.url).toBe(service.origin + "/?component=comparison-matrix");
      for (const name of ["index.html", "frame.html", "assets/app.js", "asset-manifest.json"]) {
        const row = await response(service, "/" + name); expect(row.status).toBe(200); expect(row.bytes).toEqual(await readFile(join(directory, name)));
        expect(row.headers["set-cookie"]).toBeUndefined(); expect(row.headers["access-control-allow-origin"]).toBeUndefined(); expect(row.headers["x-content-type-options"]).toBe("nosniff");
      }
      const head = await response(service, "/frame.html", "HEAD"); expect(head.status).toBe(200); expect(head.bytes.length).toBe(0); expect(Number(head.headers["content-length"])).toBe((await readFile(join(directory, "frame.html"))).length);
    } finally { await service.close(); }
    await expect(service.closed).resolves.toBeUndefined();
  }));
  it("rejects foreign Host and Origin without serving a body from the bundle", async () => withAssets(async directory => {
    const service = await startLocalService({ port: 0, assetDirectory: directory });
    try { expect((await response(service, "/", "GET", { Host: "evil.example" })).status).toBe(403); expect((await response(service, "/", "GET", { Origin: "https://evil.example" })).status).toBe(403); }
    finally { await service.close(); }
  }));
  it("accepts a trailing-slash artifact directory while refusing a symlink directory alias", async () => withAssets(async directory => {
    const service = await startLocalService({ port: 0, assetDirectory: directory + "/" });
    try { expect((await response(service, "/")).status).toBe(200); } finally { await service.close(); }
    const parent = await realpath(await mkdtemp(join(tmpdir(), "mcpcn-local-alias-")));
    try { await symlink(directory, join(parent, "alias")); await expect(startLocalService({ port: 0, assetDirectory: join(parent, "alias") })).rejects.toThrow("local_service_assets_missing"); }
    finally { await rm(parent, { recursive: true, force: true }); }
  }));
  it("rejects traversal encoded separators unsupported methods unknown files and duplicate selection", async () => withAssets(async directory => {
    const service = await startLocalService({ port: 0, assetDirectory: directory });
    try {
      for (const name of ["/../index.html", "/assets/%2e%2e/frame.html", "/assets%2fapp.js", "/mcpcn.json", "/?component=approval-card&component=audit-trail"]) expect((await response(service, name)).status).toBe(400);
      expect((await response(service, "/assets/missing.js")).status).toBe(404);
      const post = await response(service, "/", "POST"); expect(post.status).toBe(405); expect(post.headers.allow).toBe("GET, HEAD");
    } finally { await service.close(); }
  }));
  it("keeps serving the verified startup snapshot rather than rereading mutable package files", async () => withAssets(async directory => {
    const before = await readFile(join(directory, "assets/app.js")), service = await startLocalService({ port: 0, assetDirectory: directory });
    try { await writeFile(join(directory, "assets/app.js"), "changed after startup"); expect((await response(service, "/assets/app.js")).bytes).toEqual(before); }
    finally { await service.close(); }
  }));
  it("refuses altered missing unlisted duplicate and symlink artifact inputs before listening", async () => {
    await withAssets(async directory => { await writeFile(join(directory, "assets/app.js"), "tampered"); await expect(startLocalService({ port: 0, assetDirectory: directory })).rejects.toThrow("local_service_asset_hash_mismatch"); });
    await withAssets(async directory => { await rm(join(directory, "frame.html")); await expect(startLocalService({ port: 0, assetDirectory: directory })).rejects.toBeInstanceOf(LocalServiceError); });
    await withAssets(async directory => { await writeFile(join(directory, "assets/unknown.js"), "unlisted"); await expect(startLocalService({ port: 0, assetDirectory: directory })).rejects.toThrow("local_service_asset_set_changed"); });
    await withAssets(async directory => { const file = join(directory, "asset-manifest.json"), data = JSON.parse(await readFile(file, "utf8")); data.files.push(data.files[0]); await writeFile(file, JSON.stringify(data)); await expect(startLocalService({ port: 0, assetDirectory: directory })).rejects.toThrow("local_service_manifest_invalid"); });
    await withAssets(async directory => { await rm(join(directory, "assets/app.js")); await symlink(join(directory, "index.html"), join(directory, "assets/app.js")); await expect(startLocalService({ port: 0, assetDirectory: directory })).rejects.toThrow("local_service_asset_invalid"); });
  });
  it("refuses an occupied port and leaves the actual first service available", async () => withAssets(async directory => {
    const service = await startLocalService({ port: 0, assetDirectory: directory });
    try { await expect(startLocalService({ port: Number(new URL(service.origin).port), assetDirectory: directory })).rejects.toThrow("local_service_port_in_use"); expect((await response(service, "/")).status).toBe(200); }
    finally { await service.close(); }
  }));
  it("closes owned idle connections and acknowledges repeated shutdown calls", async () => withAssets(async directory => {
    const service = await startLocalService({ port: 0, assetDirectory: directory }), target = new URL(service.origin);
    const socket = connect({ host: target.hostname, port: Number(target.port) });
    const socketClosed = new Promise<void>(resolve => socket.once("close", () => resolve()));
    try { await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject); }); await Promise.all([service.close(), service.close()]); await socketClosed; await expect(service.closed).resolves.toBeUndefined(); }
    finally { socket.destroy(); await service.close(); }
  }));
  it("dispatches every catalog and block slug to the same service and defaults dev without reading cwd", async () => {
    const calls: Array<{ component: string; port: number }> = [], errors: string[] = [];
    const context = { cwd: "/authored/nonexistent-directory", log: () => undefined, error: (value: string) => errors.push(value), localService: async ({ component, port }: { component: string; port: number }) => { calls.push({ component, port }); return 143; } };
    expect(await runCLI(["dev"], context)).toBe(143); expect(calls.shift()).toEqual({ component: "approval-card", port: 4545 });
    for (const name of [...catalog.map(item => item.slug), ...blockCatalog.map(item => item.name)]) { expect(await runCLI(["preview", name, "--port=12345"], context)).toBe(143); expect(calls.shift()).toEqual({ component: name, port: 12345 }); }
    expect(errors).toEqual([]);
  });
  it("refuses unknown selections invalid ports duplicate flags and extra arguments before launching", async () => {
    let launches = 0; const errors: string[] = [], context = { log: () => undefined, error: (value: string) => errors.push(value), localService: async () => { launches++; return 0; } };
    for (const args of [["preview", "unknown"], ["preview"], ["dev", "extra"], ["dev", "--port=0"], ["dev", "--port=65536"], ["dev", "--port=2", "--port=3"], ["preview", "approval-card", "--host=0.0.0.0"]]) expect(await runCLI(args, context)).toBe(1);
    expect(launches).toBe(0); expect(errors).toHaveLength(7); expect(errors.every(value => /^mcpcn: invalid_(?:arguments|selection)$/.test(value))).toBe(true);
  });
});

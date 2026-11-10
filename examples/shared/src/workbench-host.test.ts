// T2: actual loopback HTTP, SDK sessions, authored HTML and private SQLite fixtures.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { request as httpRequest } from "node:http";
import { startWorkbench } from "../dist/workbench-host.js";
import { referenceDefinitions } from "../../definitions.js";
import { METADATA_KEY } from "./contracts.js";

const owned: string[] = [], hosts: Awaited<ReturnType<typeof startWorkbench>>[] = [];
function fixture() {
  const parent = process.env.MCPCN_RF_RUN_ROOT ?? fs.realpathSync(os.tmpdir());
  if (process.env.MCPCN_RF_RUN_ROOT && fs.readFileSync(path.join(parent, ".owner"), "utf8") !== process.env.MCPCN_RF_NONCE) throw new Error("fixture_owner_invalid");
  const root = fs.mkdtempSync(path.join(parent, "workbench-http-check-")); owned.push(root); const assets = path.join(root, "assets"); fs.mkdirSync(assets, { mode: 0o700 });
  for (const name of ["host", ...referenceDefinitions().map(value => value.id)]) { fs.mkdirSync(path.join(assets, name), { mode: 0o700 }); fs.writeFileSync(path.join(assets, name, "index.html"), "<!doctype html><main>AUTHORED_HTTP_RESOURCE_END</main>", { flag: "wx", mode: 0o600 }); }
  return { root, assets, workspace: path.join(root, "workspace") };
}
async function start(value: ReturnType<typeof fixture>) { const host = await startWorkbench({ ...value, port: 0, definitions: referenceDefinitions({ readSource: async () => "Authored primary-source adapter." }), authoredChecks: process.env.CI === "true" }); hosts.push(host); return host; }
type Host = Awaited<ReturnType<typeof start>>;
async function login(host: Host) {
  const response = await fetch(host.origin + "/api/session", { method: "POST", headers: { Origin: host.origin, "Content-Type": "application/json" }, body: JSON.stringify({ code: host.accessCode }) }); expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";")[0]!;
}
async function call(host: Host, cookie: string, name: string, args: Record<string, unknown>) {
  return fetch(host.origin + "/api/call", { method: "POST", headers: { Origin: host.origin, "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ workflow: "admin-settings-change", name: "admin_settings_change_" + name, args }) });
}
afterEach(async () => { for (const host of hosts.splice(0)) { await host.close(); expect(host.closed).toBe(true); } for (const directory of owned.splice(0)) fs.rmSync(directory, { recursive: true }); });

describe("T2 local workbench access and persistence", () => {
  it("RF-H01 refuses unauthenticated records, tool calls and resource reads", async () => {
    const host = await start(fixture()); expect((await fetch(host.origin + "/api/session")).status).toBe(401); expect((await fetch(host.origin + "/app/admin-settings-change")).status).toBe(401);
    expect((await call(host, "", "read", { id: "record-one" })).status).toBe(401);
  });
  it("RF-H02 requires the actual launch capability and returns a strict HttpOnly cookie", async () => {
    const host = await start(fixture()), denied = await fetch(host.origin + "/api/session", { method: "POST", headers: { Origin: host.origin, "Content-Type": "application/json" }, body: JSON.stringify({ code: "AUTHORED_WRONG_CODE" }) }); expect(denied.status).toBe(403);
    const cookie = await login(host), response = await fetch(host.origin + "/api/session", { headers: { Cookie: cookie } }); expect(response.status).toBe(200); expect((await response.json()).workflows).toHaveLength(5);
    const accepted = await fetch(host.origin + "/api/session", { method: "POST", headers: { Origin: host.origin, "Content-Type": "application/json" }, body: JSON.stringify({ code: host.accessCode }) });
    expect(accepted.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Strict; Path=\/; Max-Age=1800/);
  });
  it("RF-H03 refuses cross-origin and missing-origin POSTs even with a valid cookie", async () => {
    const host = await start(fixture()), cookie = await login(host);
    for (const origin of [undefined, "https://authored-attacker.example"]) { const headers: Record<string, string> = { "Content-Type": "application/json", Cookie: cookie }; if (origin) headers.Origin = origin;
      expect((await fetch(host.origin + "/api/call", { method: "POST", headers, body: JSON.stringify({ workflow: "admin-settings-change", name: "admin_settings_change_read", args: { id: "record-one" } }) })).status).toBe(403); }
  });
  it("RF-H04 refuses an unrelated Host header on the real loopback listener", async () => {
    const host = await start(fixture()); const status = await new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest(host.origin + "/", { headers: { Host: "authored-attacker.example" } }, response => { response.resume(); response.once("end", () => resolve(response.statusCode)); }); request.once("error", reject); request.end();
    }); expect(status).toBe(403);
  });
  it("RF-H05 routes actual tool preparation and atomic confirmation through the SDK", async () => {
    const host = await start(fixture()), cookie = await login(host);
    const review = await (await call(host, cookie, "prepare", { id: "record-one", revision: 1, proposal: { action: "change", settings: { weeklyDigest: true, retentionDays: 45 } } })).json();
    const result = await (await call(host, cookie, "confirm", { token: review._meta[METADATA_KEY].prepared.token })).json(); expect(result.structuredContent.data.revision).toBe(2); expect(result._meta[METADATA_KEY].state.settings.retentionDays).toBe(45); expect(result._meta[METADATA_KEY].audit).toHaveLength(1);
    const resource = await fetch(host.origin + "/app/admin-settings-change", { headers: { Cookie: cookie } }); expect(resource.headers.get("content-type")).toContain("text/html"); expect(await resource.text()).toContain("AUTHORED_HTTP_RESOURCE_END");
  });
  it("RF-H06 refuses arbitrary tools and forged SDK argument scopes", async () => {
    const host = await start(fixture()), cookie = await login(host); expect((await call(host, cookie, "delete_everything", {})).status).toBe(403);
    const result = await (await call(host, cookie, "read", { id: "record-one", actor: "forged-actor" })).json(); expect(result.isError).toBe(true); expect(result._meta).toBeUndefined();
  });
  it("RF-H07 bounds malformed JSON and request size without changing records", async () => {
    const host = await start(fixture()), cookie = await login(host), headers = { Origin: host.origin, "Content-Type": "application/json", Cookie: cookie };
    expect((await fetch(host.origin + "/api/call", { method: "POST", headers, body: "{ malformed authored" })).status).toBe(400);
    let accepted = false; try { accepted = (await fetch(host.origin + "/api/call", { method: "POST", headers, body: JSON.stringify({ text: "x".repeat(1024 * 1024) }) })).ok; } catch { /* Oversized requests may close their socket. */ }
    expect(accepted).toBe(false); const record = await (await call(host, cookie, "read", { id: "record-one" })).json(); expect(record.structuredContent.data.revision).toBe(1); expect(record._meta[METADATA_KEY].audit).toEqual([]);
  });
  it("RF-H08 refuses static symlink escapes and discloses no outside authored file", async () => {
    const value = fixture(), directory = path.join(value.assets, "assets"); fs.mkdirSync(directory); const outside = path.join(value.root, "outside.js"); fs.writeFileSync(outside, "AUTHORED_OUTSIDE_STATIC"); fs.symlinkSync(outside, path.join(directory, "escape.js"));
    const host = await start(value), response = await fetch(host.origin + "/reference-assets/assets/escape.js"); expect(response.status).toBe(400); expect(await response.text()).not.toContain("AUTHORED_OUTSIDE_STATIC");
  });
  it("RF-H09 preserves saved state across server/database reopen and invalidates old cookies", async () => {
    const value = fixture(), first = await start(value), cookie = await login(first);
    const review = await (await call(first, cookie, "prepare", { id: "record-one", revision: 1, proposal: { action: "change", settings: { weeklyDigest: true, retentionDays: 45 } } })).json();
    await call(first, cookie, "confirm", { token: review._meta[METADATA_KEY].prepared.token }); await first.close();
    const second = await start(value); expect((await fetch(second.origin + "/api/session", { headers: { Cookie: cookie } })).status).toBe(401);
    const record = await (await call(second, await login(second), "read", { id: "record-one" })).json(); expect(record.structuredContent.data.revision).toBe(2); expect(record._meta[METADATA_KEY].state.settings.weeklyDigest).toBe(true); expect(record._meta[METADATA_KEY].audit).toHaveLength(1);
  });
  it("RF-H10 closes its HTTP listener, real SDK sessions and SQLite connection idempotently", async () => {
    const host = await start(fixture()); await host.close(); await host.close(); expect(host.closed).toBe(true); await expect(fetch(host.origin + "/api/session")).rejects.toThrow();
  });
  it("RF-H11 routes review cancellation and refuses its later confirmation", async () => {
    const host = await start(fixture()), cookie = await login(host), review = await (await call(host, cookie, "prepare", { id: "record-one", revision: 1, proposal: { action: "change", settings: { weeklyDigest: true, retentionDays: 45 } } })).json();
    const token = review._meta[METADATA_KEY].prepared.token; expect((await (await call(host, cookie, "cancel", { token })).json()).isError).not.toBe(true); expect((await (await call(host, cookie, "confirm", { token })).json()).isError).toBe(true);
    const record = await (await call(host, cookie, "read", { id: "record-one" })).json(); expect(record.structuredContent.data.revision).toBe(1); expect(record._meta[METADATA_KEY].audit).toEqual([]);
  });
});

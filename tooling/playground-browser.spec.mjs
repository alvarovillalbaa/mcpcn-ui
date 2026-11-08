// Tier 2: trusted bundled iframe/official SDK simulator and installed local CLI.
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstat, open, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";

const tools = process.env.MCPCN_PLAYGROUND_BROWSER_TOOLS;
assert.ok(tools && path.isAbsolute(tools));
const { test, expect: playwrightExpect } = createRequire(path.join(tools, "package.json"))("playwright/test");
const expect = playwrightExpect.configure({ timeout: 3000 });
const packageManifest = JSON.parse(await readFile(path.join(tools, "package.json"), "utf8"));
assert.equal(packageManifest.name, "playwright"); assert.equal(packageManifest.version, "1.65.0");
const origins = Object.fromEntries([["docs", "MCPCN_PLAYGROUND_ORIGIN", "4173"], ["cliDev", "MCPCN_PLAYGROUND_CLI_DEV_ORIGIN", "4545"], ["cliPreview", "MCPCN_PLAYGROUND_CLI_PREVIEW_ORIGIN", "4546"]].map(([key, name, port]) => {
  const url = new URL(process.env[name] ?? "");
  assert.equal(url.protocol, "http:"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, port);
  assert.equal(url.href, url.origin + "/"); assert.ok(!url.username && !url.password);
  return [key, url.origin];
}));
const output = process.env.MCPCN_PLAYGROUND_BROWSER_OUTPUT, sourceCommit = process.env.SOURCE_COMMIT;
assert.ok(output && path.isAbsolute(output)); assert.match(sourceCommit ?? "", /^[0-9a-f]{40}$/);
const directory = await lstat(output);
assert.ok(directory.isDirectory() && !directory.isSymbolicLink() && directory.uid === process.getuid() && (directory.mode & 0o077) === 0);
assert.equal(await realpath(output), output);
const sha = value => createHash("sha256").update(value).digest("hex");
const canary = "LOCAL_UI_ONLY_CANARY", fileBody = "MCPCN_AUTHORED_FILE_BODY_NOT_SHARED\n";
test.setTimeout(40000);

async function within(operation, deadline, code) {
  const remaining = deadline - performance.now();
  if (!(remaining > 0)) { if (typeof operation !== "function") void Promise.resolve(operation).catch(() => undefined); throw new Error(code); }
  let timer;
  try {
    const promise = typeof operation === "function" ? operation() : operation;
    const value = await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(code)), remaining); })]);
    assert.ok(performance.now() < deadline, code); return value;
  } finally { clearTimeout(timer); }
}
async function absent(filename) {
  try { await lstat(filename); throw new Error("browser_output_exists"); } catch (error) { if (error.code !== "ENOENT") throw error; }
}
async function json(locator) {
  const value = await locator.textContent(); assert.ok(typeof value === "string" && Buffer.byteLength(value) <= 65536);
  return JSON.parse(value);
}
async function jsonIs(locator, expected) { await expect.poll(() => json(locator)).toEqual(expected); return json(locator); }
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const locationMeta = value => { const url = new URL(value); return { origin: url.origin, pathname: url.pathname }; };

function observe(context, report, started, deadline, allowedOrigin) {
  const rows = new Map(), blobRows = new Map(), jobs = new Set(); let closing = false, downloadArmed = false, downloadAllowed = false, downloads = 0, signal, changed;
  const reset = () => { changed = new Promise(resolve => { signal = resolve; }); }; reset();
  const notify = () => { signal(); reset(); };
  const error = (code, extra = {}) => { report.network.errorCount++; if (report.network.errors.length < 20) report.network.errors.push({ code, atMs: performance.now() - started, ...extra }); notify(); };
  const track = work => { let job; job = work.catch(() => error("observer_operation_failed")).finally(() => { jobs.delete(job); notify(); }); jobs.add(job); };
  const terminal = (row, value) => { if (row.terminal) error("duplicate_terminal", { ordinal: row.ordinal }); else { row.terminal = value; row.terminalAtMs = performance.now() - started; } notify(); };
  context.on("request", request => {
    if (closing) error("request_after_close_started");
    const url = new URL(request.url());
    if (url.protocol === "blob:") {
      if (!downloadAllowed || url.origin !== allowedOrigin || request.method() !== "GET" || blobRows.size) error("unapproved_blob_request");
      const row = { method: request.method(), origin: url.origin, urlSha256: sha(request.url()), status: null, terminal: null, responseFinished: "not_claimed_blob_download", atMs: performance.now() - started };
      blobRows.set(request, row); report.blobDownload.rows.push(row); notify(); return;
    }
    report.network.requests++;
    if (rows.size >= 300) { error("request_bound_exceeded"); return; }
    const row = { ordinal: rows.size + 1, method: request.method(), protocol: url.protocol, host: url.host, pathname: url.pathname.slice(0, 512), startedAtMs: performance.now() - started, status: null, responseFinished: "unobserved", terminal: null };
    rows.set(request, row);
    if (url.origin !== allowedOrigin || !["GET", "HEAD"].includes(request.method()) || url.username || url.password || url.protocol !== "http:") error("unapproved_request", { ordinal: row.ordinal });
    notify();
  });
  context.on("response", response => {
    const blob = blobRows.get(response.request());
    if (blob) { if (blob.status !== null) error("duplicate_blob_response"); blob.status = response.status(); if (blob.status >= 400) error("blob_http_error"); notify(); return; }
    const row = rows.get(response.request()); if (!row) { error("response_without_request"); return; }
    if (row.status !== null) { error("duplicate_response", { ordinal: row.ordinal }); return; }
    row.status = response.status(); row.responseAtMs = performance.now() - started;
    if (row.status >= 400) error("http_error", { ordinal: row.ordinal, status: row.status });
    track((async () => {
      try {
        const result = await within(response.finished(), Math.min(deadline, performance.now() + 10000), "response_finished_timeout");
        row.responseFinished = result === null ? "null" : "error"; row.responseFinishedAtMs = performance.now() - started;
        if (result !== null) error("response_finished_error", { ordinal: row.ordinal });
      } catch { row.responseFinished = "unresolved_or_late"; error("response_finished_unproved", { ordinal: row.ordinal }); }
      notify();
    })());
  });
  context.on("requestfinished", request => { const blob = blobRows.get(request); if (blob) { blob.terminal = "finished"; notify(); return; } const row = rows.get(request); row ? terminal(row, "finished") : error("finished_without_request"); });
  context.on("requestfailed", request => {
    const blob = blobRows.get(request);
    if (blob) { const failure = request.failure()?.errorText ?? ""; blob.terminal = "failed"; blob.failure = /^net::ERR_[A-Z_]+$/.test(failure) ? failure : "other"; blob.failureSha256 = sha(failure); notify(); return; }
    report.network.requestFailures++; const row = rows.get(request), reason = request.failure()?.errorText ?? "";
    if (row) terminal(row, "failed"); error("request_failed", { ordinal: row?.ordinal ?? null, reason: /^net::ERR_[A-Z_]+$/.test(reason) ? reason : "other" });
  });
  context.on("page", page => {
    report.cleanup.pagesCreated++; if (report.cleanup.pagesCreated > 1) error("unexpected_page");
    page.on("console", message => {
      const text = message.text(), type = message.type();
      if (type === "error") { report.network.consoleErrors++; error("console_error", { messageSha256: sha(text) }); }
      if (type === "warning") { report.console.warningCount++; if (report.console.warnings.length < 20) report.console.warnings.push({ sha256: sha(text), sandboxSameOriginWarning: text.includes("allow-scripts") && text.includes("allow-same-origin") }); }
      if (type === "debug") report.console.debugCount++;
      if (type !== "debug" || !text.startsWith("Sending message") || message.args().length < 2) return;
      track((async () => {
        const value = await within(message.args()[1].jsonValue(), Math.min(deadline, performance.now() + 3000), "wire_console_deadline");
        if (!object(value) || value.jsonrpc !== "2.0") return;
        if (typeof value.method === "string") {
          assert.match(value.method, /^[A-Za-z0-9_/-]{1,100}$/);
          assert.ok(Object.keys(report.sdkSends).length < 60 || Object.hasOwn(report.sdkSends, value.method));
          report.sdkSends[value.method] = (report.sdkSends[value.method] ?? 0) + 1;
        }
        if (value.method === "ui/request-display-mode" || (!value.method && object(value.result) && ["inline", "pip", "fullscreen"].includes(value.result.mode))) {
          assert.ok(report.displayMessages.length < 20 && ["string", "number"].includes(typeof value.id));
          const request = value.method === "ui/request-display-mode", mode = request ? value.params?.mode : value.result.mode;
          assert.ok(["inline", "pip", "fullscreen"].includes(mode));
          report.displayMessages.push({ kind: request ? "request" : "response", idSha256: sha(typeof value.id + ":" + String(value.id)), mode, atMs: performance.now() - started }); notify();
        }
        if (!["tools/call", "ui/update-model-context", "ui/message"].includes(value.method)) return;
        const raw = JSON.stringify(value); assert.ok(Buffer.byteLength(raw) <= 16384 && report.wire.length < 60, "wire_bound");
        const row = { ordinal: report.wire.length + 1, method: value.method, atMs: performance.now() - started, bytes: Buffer.byteLength(raw), sha256: sha(raw), canaryAbsent: !raw.includes(canary), fileBodyAbsent: !raw.includes(fileBody.trim()), privateKeyAbsent: !raw.includes("privateFixtureNote") };
        if (!row.canaryAbsent || !row.fileBodyAbsent || !row.privateKeyAbsent) error("private_value_in_outbound_request");
        assert.ok(object(value.params));
        if (value.method === "tools/call") {
          assert.ok(["playground_action", "playground_echo"].includes(value.params.name) && object(value.params.arguments));
          assert.deepEqual(Object.keys(value.params.arguments).sort(), ["component", "decision"]);
          assert.match(value.params.arguments.component, /^[a-z][a-z0-9-]{0,99}$/); assert.match(value.params.arguments.decision, /^[a-z][a-z0-9-]{0,79}$/);
          row.name = value.params.name; row.arguments = value.params.arguments;
        } else if (value.method === "ui/update-model-context") {
          assert.ok(Array.isArray(value.params.content) && value.params.content.length === 1 && value.params.content[0].type === "text");
          const shared = JSON.parse(value.params.content[0].text); assert.ok(object(shared)); assert.deepEqual(Object.keys(shared).sort(), ["component", "decision"]);
          assert.match(shared.component, /^[a-z][a-z0-9-]{0,99}$/); assert.match(shared.decision, /^[a-z][a-z0-9-]{0,79}$/); row.shared = shared;
        } else {
          assert.equal(value.params.role, "user"); assert.ok(Array.isArray(value.params.content) && value.params.content.length === 1 && value.params.content[0].type === "text");
          assert.match(value.params.content[0].text, /^Reviewed the [a-z][a-z0-9-]{0,99} authored fixture\.$/); row.message = value.params.content[0].text;
        }
        report.wire.push(row); notify();
      })());
    });
    page.on("pageerror", value => { report.network.pageErrors++; error("page_error", { messageSha256: sha(String(value.message)) }); });
    page.on("websocket", () => { report.network.webSockets++; error("websocket"); });
    page.on("crash", () => error("page_crash"));
    page.on("download", download => {
      downloads++; report.downloadEvents = downloads;
      const url = new URL(download.url());
      if (!downloadArmed || downloads !== 1 || url.protocol !== "blob:" || url.origin !== allowedOrigin) error("unexpected_download");
      else { downloadArmed = false; report.downloadUrlSha256 = sha(download.url()); report.downloadSuggestedName = download.suggestedFilename().slice(0, 160); }
      notify();
    });
    page.on("dialog", dialog => { error("unexpected_dialog"); track(dialog.dismiss()); });
    page.on("close", () => { report.cleanup.pagesClosed++; if (!closing) error("unexpected_page_close"); notify(); });
  });
  context.on("serviceworker", () => error("unexpected_service_worker"));
  return { rows, jobs, error,
    armDownload() { assert.equal(downloads, 0); assert.equal(downloadArmed, false); downloadArmed = true; downloadAllowed = true; },
    closeStarted() { closing = true; report.cleanup.closeStartedAtMs = performance.now() - started; },
    async settle(end = deadline) {
      while (true) {
        assert.ok(performance.now() < end, "network_settlement_deadline"); if (report.network.errorCount) throw new Error("network_or_browser_error");
        if (!jobs.size && [...rows.values()].every(row => row.terminal === "finished" && row.responseFinished === "null")) {
          if (blobRows.size) assert.ok(downloads === 1 && report.download?.failure === null && report.download.jsonEqual && report.download.removed
            && [...blobRows.values()].every(row => row.urlSha256 === report.downloadUrlSha256 && row.urlSha256 === report.download.urlSha256), "blob_download_acknowledgement_missing");
          return;
        }
        await within(changed, end, "network_settlement_deadline");
      }
    },
    snapshot() { report.network.rows = [...rows.values()]; report.cleanup.pendingRequests = [...rows.values()].filter(row => row.terminal === null || ["unobserved", "unresolved_or_late"].includes(row.responseFinished)).length; report.cleanup.observerJobs = jobs.size; report.cleanup.downloadArmRemaining = downloadArmed; report.blobDownload.nativeDownloadJoined = blobRows.size ? report.download?.failure === null && report.download.jsonEqual && report.download.removed && [...blobRows.values()].every(row => row.urlSha256 === report.downloadUrlSha256 && row.urlSha256 === report.download.urlSha256) : null; }
  };
}

async function ready(host) {
  await expect(host.getByRole("status", { name: "Host connection", exact: true })).toHaveText("ready", { timeout: 12000 });
  const app = host.frameLocator('iframe[title="Rendered MCP app"]');
  await expect(app.locator("main.frame-app > header").getByRole("status")).toHaveText("Bridge connected", { timeout: 12000 });
  return app;
}
async function choose(host, slug) {
  await host.getByRole("combobox", { name: "Component or block", exact: true }).selectOption(slug);
  const app = await ready(host); await jsonIs(app.getByLabel("Received tool input", { exact: true }), { component: slug }); return app;
}
async function typeWithFocus(locator, value) { await locator.fill(""); await locator.pressSequentially(value); await expect(locator).toBeFocused(); await expect(locator).toHaveValue(value); }
const toolCalls = report => report.wire.filter(row => row.method === "tools/call");

async function bridge({ page, host, app, report, observer, record, activate }) {
  await observer.settle(); assert.equal(toolCalls(report).length, 0);
  await jsonIs(app.getByLabel("UI-only metadata", { exact: true }), { privateFixtureNote: canary });
  const approve = app.getByRole("button", { name: "Approve", exact: true }), consent = app.getByRole("checkbox", { name: "I understand the impact of this action.", exact: true });
  await expect(approve).toBeDisabled(); await consent.focus(); await page.keyboard.press("Space"); report.input.keyboardActions++;
  await expect(consent).toBeChecked(); await expect(approve).toBeEnabled(); assert.equal(toolCalls(report).length, 0);
  await activate(approve);
  await expect.poll(async () => (await json(app.getByLabel("Fixture tool response", { exact: true })))?.structuredContent).toEqual({ fixture: true, component: "approval-card", decision: "approve" });
  await observer.settle(); assert.equal(toolCalls(report).length, 1); assert.deepEqual(toolCalls(report)[0].arguments, { component: "approval-card", decision: "approve" });
  await activate(app.getByRole("button", { name: "Share review summary", exact: true }));
  await jsonIs(host.getByLabel("Shared model context", { exact: true }), { component: "approval-card", decision: "approve" });
  await activate(app.getByRole("button", { name: "Send fixture message", exact: true }));
  await expect(host.getByLabel("Fake chat", { exact: true }).getByText("Reviewed the approval-card authored fixture.", { exact: true })).toBeVisible();
  await observer.settle(); assert.equal(report.wire.filter(row => row.method === "ui/update-model-context").length, 1); assert.equal(report.wire.filter(row => row.method === "ui/message").length, 1);
  assert.ok(report.wire.every(row => row.canaryAbsent && row.privateKeyAbsent && row.fileBodyAbsent));
  record("consent_and_private_metadata_boundary", { automaticToolCalls: 0, consentChecked: await consent.isChecked(), toolArguments: toolCalls(report)[0].arguments, sharedContext: await json(host.getByLabel("Shared model context")), uiMetadataCanaryObserved: true, outboundCanaryAbsent: true });
  await host.getByRole("combobox", { name: "Fixture tool outcome", exact: true }).selectOption("tool-error");
  await activate(app.getByRole("button", { name: "Call fixture tool", exact: true }));
  await expect(app.getByText("The authored fixture tool reported an error.", { exact: true })).toBeVisible();
  await expect.poll(async () => (await json(app.getByLabel("Fixture tool response")))?.isError).toBe(true);
  record("tool_error_result", { isError: true });
  await host.getByRole("combobox", { name: "Fixture tool outcome", exact: true }).selectOption("protocol-error");
  await activate(app.getByRole("button", { name: "Call fixture tool", exact: true }));
  await expect(app.getByText("The fixture host rejected this request. Inspect the host trace and capabilities.", { exact: true })).toBeVisible();
  await expect(host.getByRole("list", { name: "Bridge trace", exact: true })).toContainText("tools/call");
  await expect(host.getByRole("list", { name: "Bridge trace", exact: true })).toContainText("error #");
  await observer.settle(); assert.equal(toolCalls(report).length, 3);
  record("protocol_error_preserved", { actualToolRequests: 3, visibleTraceHasRequestAndError: true, protocolFailureWasNotSuccess: true });
}

const editedData = { title: "Authored editor form", fields: [{ name: "owner", label: "Owner", type: "text", required: true, value: "" }, { name: "notes", label: "Notes", type: "textarea", required: false, value: "" }], submitLabel: "Send authored review" };
const editedInput = { component: "schema-form", fixtureRevision: "authored-editor-1" };
const editedResult = { structuredContent: { kind: "mcpcn/schema-form", version: 1, data: editedData }, content: [{ type: "text", text: "Authored editor result." }], _meta: { privateFixtureNote: canary } };
function expectedSnippet() {
  return `import { registerComponentApp, createStructuredResult } from "@mcpcn/server";\n\n// Supply your MCP server and your app's bundled HTML.\nexport function registerPreview(server: Parameters<typeof registerComponentApp>[0], appHtml: string) {\n  registerComponentApp(server, {\n    name: "review_schema_form",\n    description: "Review authored schema-form output",\n    component: "schema-form",\n    inputSchema: { type: "object", properties: {} },\n    readOnly: true,\n    html: appHtml,\n    handler: () => createStructuredResult("schema-form", ${JSON.stringify(editedData, null, 2)})\n  });\n}\n`;
}
async function retainDownload(download, caseId, expected, deadline, report) {
  const filename = path.join(output, caseId + ".fixture.json"); await absent(filename); let identity;
  try {
    assert.equal(download.suggestedFilename(), "mcpcn-schema-form-fixture.json");
    await within(download.saveAs(filename), deadline, "download_save_deadline"); assert.equal(await within(download.failure(), deadline, "download_ack_deadline"), null);
    identity = await lstat(filename); assert.ok(identity.isFile() && !identity.isSymbolicLink() && identity.uid === process.getuid() && identity.size > 0 && identity.size <= 65536); assert.equal(await realpath(filename), filename);
    const fd = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW); let bytes;
    try {
      const before = await fd.stat(); assert.equal(before.ino, identity.ino); assert.equal(before.dev, identity.dev);
      const buffer = Buffer.alloc(identity.size + 1); let count = 0;
      while (count < buffer.length) { const row = await fd.read(buffer, count, buffer.length - count, null); if (!row.bytesRead) break; count += row.bytesRead; }
      assert.equal(count, identity.size); bytes = buffer.subarray(0, count);
      const after = await fd.stat(); assert.equal(after.ino, identity.ino); assert.equal(after.size, identity.size); assert.equal(after.mtimeMs, identity.mtimeMs); assert.equal(after.ctimeMs, identity.ctimeMs);
    } finally { await fd.close(); }
    const compressed = gzipSync(bytes);
    report.download = { suggestedFilename: download.suggestedFilename(), urlSha256: sha(download.url()), bytes: bytes.length, sha256: sha(bytes), failure: null, jsonEqual: false, removed: false,
      raw: { encoding: "gzip-base64", bytes: bytes.length, sha256: sha(bytes), compressedBytes: compressed.length, data: compressed.toString("base64"), complete: true } };
    assert.deepEqual(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), expected);
    report.download.jsonEqual = true; return report.download;
  } finally {
    if (identity) { const current = await lstat(filename); assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino); assert.equal(current.size, identity.size); assert.equal(current.mtimeMs, identity.mtimeMs); assert.equal(current.ctimeMs, identity.ctimeMs); await unlink(filename); await absent(filename); if (report.download) report.download.removed = true; }
  }
}
async function editors({ page, context, host, app, report, observer, record, activate, deadline }) {
  await host.getByRole("textbox", { name: "Tool input JSON", exact: true }).fill(JSON.stringify(editedInput));
  await host.getByRole("textbox", { name: "Tool result JSON", exact: true }).fill(JSON.stringify(editedResult));
  await expect(app.getByRole("heading", { name: "Authored request", exact: true })).toBeVisible();
  await activate(host.getByRole("button", { name: "Invoke tool result", exact: true }));
  await expect(app.getByRole("heading", { name: editedData.title, exact: true })).toBeVisible(); await jsonIs(app.getByLabel("Received tool input", { exact: true }), editedInput);
  await typeWithFocus(app.getByRole("textbox", { name: "Owner", exact: true }), "Authored reviewer");
  await typeWithFocus(app.getByRole("textbox", { name: "Notes", exact: true }), "Local only");
  await activate(app.getByRole("button", { name: "Send authored review", exact: true }));
  await jsonIs(app.getByLabel("Last component intent", { exact: true }), { type: "submit", data: { values: { owner: "Authored reviewer", notes: "Local only" } } });
  await expect.poll(async () => (await json(app.getByLabel("Fixture tool response")))?.structuredContent).toEqual({ fixture: true, component: "schema-form", decision: "submit" });
  record("edited_input_result_and_actual_submit", { receivedInput: await json(app.getByLabel("Received tool input")), intent: await json(app.getByLabel("Last component intent")) });
  await host.getByRole("textbox", { name: "Tool result JSON", exact: true }).fill("{"); await activate(host.getByRole("button", { name: "Invoke tool result", exact: true }));
  await expect(host.getByRole("alert")).toHaveText("Tool result must be valid JSON."); await expect(app.getByRole("heading", { name: editedData.title, exact: true })).toBeVisible();
  await activate(host.getByRole("button", { name: "Send invalid schema fixture", exact: true }));
  await expect(app.getByText("Component payload is invalid", { exact: true })).toBeVisible();
  await host.getByRole("textbox", { name: "Tool result JSON", exact: true }).fill(JSON.stringify(editedResult)); await activate(host.getByRole("button", { name: "Invoke tool result", exact: true }));
  await expect(app.getByRole("heading", { name: editedData.title, exact: true })).toBeVisible(); await expect(app.getByRole("textbox", { name: "Owner", exact: true })).toHaveValue("");
  record("malformed_refusal_invalid_schema_and_recovery", { malformedJSONRefused: true, invalidSchemaRenderedSafely: true, recoveredValue: await app.getByRole("textbox", { name: "Owner", exact: true }).inputValue() });
  observer.armDownload(); const download = page.waitForEvent("download", { timeout: 5000 }); void download.catch(() => undefined); await activate(host.getByRole("button", { name: "Export fixture", exact: true }));
  await retainDownload(await download, report.caseId, { toolInput: editedInput, toolResult: editedResult }, deadline, report);
  assert.equal(report.downloadEvents, 1); record("single_export_acknowledged_and_removed", report.download);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: origins.cliPreview });
  await activate(host.getByRole("button", { name: "Copy MCP server snippet", exact: true }));
  await expect(host.getByText("Server registration snippet copied. Supply your server and app HTML.", { exact: true })).toBeVisible();
  const text = await within(() => host.locator("body").evaluate(() => navigator.clipboard.readText()), deadline, "clipboard_read_deadline");
  assert.equal(text, expectedSnippet()); assert.ok(!text.includes(canary));
  record("clipboard_server_snippet", { bytes: Buffer.byteLength(text), sha256: sha(text), exactAuthoredSnippet: true, metadataCanaryAbsent: true, permissionOrigin: origins.cliPreview });
}

async function display({ host, app, report, record, activate, profile }) {
  const expectedTheme = profile === "narrow" ? "dark" : "light";
  await expect(app.locator("main.frame-app")).toHaveAttribute("data-theme", expectedTheme);
  const actualWidths = [];
  for (const width of [760, 390, profile === "narrow" ? 390 : 760]) {
    await host.getByRole("combobox", { name: "Viewport", exact: true }).selectOption(String(width));
    await expect(host.getByRole("combobox", { name: "Viewport", exact: true })).toHaveValue(String(width));
    const frameWidth = await host.locator('iframe[title="Rendered MCP app"]').evaluate(element => element.clientWidth);
    await expect.poll(() => app.locator("main").evaluate(() => innerWidth)).toBe(frameWidth);
    assert.ok(frameWidth > 0 && frameWidth <= width);
    actualWidths.push({ configured: width, observedFrameWidth: frameWidth });
  }
  await host.getByRole("combobox", { name: "Host display mode", exact: true }).selectOption("pip");
  await expect(app.locator("main.frame-app")).toHaveAttribute("data-display-mode", "pip");
  const requestMode = async (mode, actual) => {
    const previous = report.displayMessages.length;
    await activate(app.getByRole("button", { name: mode === "fullscreen" ? "Request fullscreen" : "Request inline", exact: true }));
    await expect.poll(() => {
      const recent = report.displayMessages.slice(previous), request = recent.find(row => row.kind === "request" && row.mode === mode);
      return request ? recent.find(row => row.kind === "response" && row.idSha256 === request.idSha256)?.mode : undefined;
    }).toBe(actual);
  };
  await requestMode("fullscreen", "fullscreen");
  await expect(app.locator("main.frame-app")).toHaveAttribute("data-display-mode", "fullscreen"); await expect(host.getByRole("combobox", { name: "Host display mode", exact: true })).toHaveValue("fullscreen");
  await requestMode("inline", "inline");
  await expect(app.locator("main.frame-app")).toHaveAttribute("data-display-mode", "inline");
  await host.getByRole("checkbox", { name: "Deny app requests for expanded modes", exact: true }).check();
  await requestMode("fullscreen", "inline");
  await expect(host.getByRole("list", { name: "Bridge trace", exact: true })).toContainText("ui/request-display-mode");
  await expect(app.locator("main.frame-app")).toHaveAttribute("data-display-mode", "inline"); await expect(host.getByRole("combobox", { name: "Host display mode", exact: true })).toHaveValue("inline");
  const before = await app.locator("main.frame-app").evaluate(element => ({ width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, backgroundColor: getComputedStyle(element).backgroundColor }));
  const other = expectedTheme === "dark" ? "light" : "dark"; await host.getByRole("combobox", { name: "Theme", exact: true }).selectOption(other); await expect(app.locator("main.frame-app")).toHaveAttribute("data-theme", other);
  await host.getByRole("combobox", { name: "Theme", exact: true }).selectOption(expectedTheme); await expect(app.locator("main.frame-app")).toHaveAttribute("data-theme", expectedTheme);
  assert.ok(before.documentWidth <= before.width + 1); assert.equal(before.backgroundColor, expectedTheme === "dark" ? "rgb(24, 24, 27)" : "rgb(250, 250, 250)");
  record("actual_theme_viewport_and_negotiated_display", { ...before, actualWidths, theme: expectedTheme, hostPipObserved: true, appFullscreenAccepted: true, appFullscreenDeniedActualInline: true });
}

async function lifecycle({ page, host, app, report, observer, record, activate }) {
  const replaceSession = async control => {
    const element = host.locator('iframe[title="Rendered MCP app"]'), before = await element.getAttribute("src");
    await activate(control);
    await expect.poll(async () => { const after = await element.getAttribute("src"); return typeof after === "string" && after.length > 0 && after !== before; }, { timeout: 5000 }).toBe(true);
  };
  await replaceSession(host.getByRole("checkbox", { name: "Allow fixture tool calls", exact: true })); app = await ready(host);
  await replaceSession(host.getByRole("checkbox", { name: "Allow model-context updates", exact: true })); app = await ready(host);
  const caps = await json(app.getByLabel("App capabilities", { exact: true })); assert.equal(caps.callTool, false); assert.equal(caps.updateModelContext, false); assert.equal(caps.widgetState, false);
  await expect(app.getByRole("button", { name: "Call fixture tool", exact: true })).toBeDisabled(); await expect(app.getByRole("button", { name: "Share review summary", exact: true })).toBeDisabled();
  const consent = app.getByRole("checkbox", { name: "I understand the impact of this action.", exact: true }); await consent.focus(); await page.keyboard.press("Space"); report.input.keyboardActions++;
  await activate(app.getByRole("button", { name: "Approve", exact: true }));
  await expect(app.getByText("The fixture host rejected this request. Inspect the host trace and capabilities.", { exact: true })).toBeVisible();
  await observer.settle(); assert.equal(toolCalls(report).length, 0); assert.equal(report.wire.filter(row => row.method === "ui/update-model-context").length, 0);
  await activate(app.getByRole("button", { name: "Send fixture message", exact: true })); await expect(host.getByLabel("Fake chat", { exact: true }).getByText("Reviewed the approval-card authored fixture.", { exact: true })).toBeVisible();
  record("negotiated_capability_refusal", { callTool: caps.callTool, updateModelContext: caps.updateModelContext, actualOutgoingToolRequests: 0, actualOutgoingContextRequests: 0, permittedMessageWorked: true });
  const element = host.locator('iframe[title="Rendered MCP app"]');
  const oldWindow = await element.evaluateHandle(node => node.contentWindow);
  try {
    await replaceSession(host.getByRole("button", { name: "Simulate missing bridge", exact: true }));
    await expect(host.getByRole("status", { name: "Host connection", exact: true })).toHaveText("disconnected");
    app = host.frameLocator('iframe[title="Rendered MCP app"]'); await expect(app.getByRole("heading", { name: "Bridge unavailable", exact: true })).toBeVisible({ timeout: 7500 });
    record("missing_bridge_actual_five_second_timeout", { unavailableVisible: true });
    await replaceSession(host.getByRole("button", { name: "Reconnect bridge", exact: true })); app = await ready(host);
    const different = await element.evaluate((node, previous) => node.contentWindow !== previous, oldWindow); assert.equal(different, true);
    await expect(app.getByRole("checkbox", { name: "I understand the impact of this action.", exact: true })).not.toBeChecked(); await jsonIs(app.getByLabel("Last component intent"), null); await jsonIs(app.getByLabel("Fixture tool response"), null);
    await expect(host.getByLabel("Shared model context")).toHaveText("No model context shared."); await expect(host.getByLabel("Fake chat").getByText("Reviewed the approval-card authored fixture.", { exact: true })).toHaveCount(0);
    await host.locator("body").evaluate(() => window.dispatchEvent(new MessageEvent("message", { source: window, origin: location.origin, data: { jsonrpc: "2.0", id: "MCPCN_AUTHORED_WRONG_SOURCE", method: "ui/notifications/tool-result", params: { content: [], structuredContent: { kind: "mcpcn/card", version: 1, data: { title: "FOREIGN_WINDOW_FAULT" } } } } })));
    const previousResults = report.sdkSends["ui/notifications/tool-result"] ?? 0;
    const barrierInput = { component: "approval-card", fixtureRevision: "after-source-fault" };
    await host.getByRole("textbox", { name: "Tool input JSON", exact: true }).fill(JSON.stringify(barrierInput));
    await activate(host.getByRole("button", { name: "Invoke tool result", exact: true }));
    await expect.poll(() => report.sdkSends["ui/notifications/tool-result"] ?? 0).toBe(previousResults + 1);
    await jsonIs(app.getByLabel("Received tool input"), barrierInput);
    await expect(host.getByRole("list", { name: "Bridge trace", exact: true })).not.toContainText("MCPCN_AUTHORED_WRONG_SOURCE");
    await expect(app.getByRole("heading", { name: "Approve authored changes", exact: true })).toBeVisible(); await expect(app.getByText("FOREIGN_WINDOW_FAULT", { exact: true })).toHaveCount(0);
    record("fresh_window_and_wrong_source_fault", { oldAndNewWindowIdentityDiffer: different, localConsentReset: true, oldIntentReset: true, oldResponseReset: true, wrongSource: "simulator_window", syntheticMessageEventFaultOnly: true, wrongSourceMarkerAbsentAfterRoundtrip: true, validBridgeRoundtripAfterFault: true, receivedBarrierInput: await json(app.getByLabel("Received tool input")) });
  } finally { await oldWindow.dispose(); }
}

const specialized = ["approval-card", "confirmation-panel", "risk-review-panel", "tool-progress-timeline", "tool-call-card", "retryable-error-state", "schema-form", "dynamic-question-flow", "entity-review-table", "extracted-fields-review", "diff-viewer", "comparison-matrix", "score-breakdown", "audit-trail", "source-evidence-panel", "auth-required-card"];
const primitives = ["button", "card", "badge", "tabs", "dialog", "input", "textarea", "select", "alert", "tooltip", "skeleton", "empty-state"];
const aliases = ["approval-checklist", "before-submit-confirmation", "destructive-action-guard", "human-override-panel", "permission-request-card", "tool-result-card", "running-task-card", "partial-result-viewer", "queued-step-list", "tool-trace-viewer", "record-inspector", "field-confidence-list", "conflict-resolver", "validation-summary", "document-preview", "file-review", "missing-data-request", "multi-step-form", "inline-edit-form", "form-progress-card", "validated-field-list", "option-selector", "recommendation-card", "tradeoff-panel", "ranking-list", "decision-memo", "reasoning-summary", "source-list", "evidence-drawer", "data-access-notice", "privacy-boundary-card", "consent-panel", "model-context-preview", "billing-gate", "unsupported-host-notice", "no-data-state", "loading-bridge-state", "offline-state", "permission-denied-state", "expired-session-state"];
const blocksList = ["review-before-action", "collect-missing-data", "extract-review-save", "compare-options-approve", "multi-step-tool-run", "approval-gated-tool-call", "human-corrects-ai-output", "agent-generated-report-review", "file-upload-and-extract", "table-bulk-action-review", "admin-change-review"];
const expectedKinds = new Map([[specialized, "specialized"], [primitives, "primitive"], [aliases, "generic-alias"], [blocksList, "workflow-block"]].flatMap(([slugs, kind]) => slugs.map(slug => [slug, kind])));
const headings = { "approval-card": "Approve authored changes", "tool-progress-timeline": "Authored progress", "schema-form": "Authored request", "entity-review-table": "Authored documents", "audit-trail": "Authored audit", "confirmation-panel": "Confirm authored changes", "risk-review-panel": "Review authored risks", "diff-viewer": "Authored changes", "source-evidence-panel": "Authored evidence", "dynamic-question-flow": "Authored questions", "extracted-fields-review": "Review authored extraction", "comparison-matrix": "Compare authored options", "score-breakdown": "Authored score", "tool-call-card": "Authored tool call", "retryable-error-state": "Authored retry", "auth-required-card": "Authored access request" };
async function catalog({ host, record, activate, observer, report }) {
  const select = host.getByRole("combobox", { name: "Component or block", exact: true });
  const options = await select.locator("option").evaluateAll(nodes => nodes.map(node => ({ slug: node.value, name: node.label })));
  assert.equal(options.length, 79); assert.equal(new Set(options.map(row => row.slug)).size, 79); assert.deepEqual(options.map(row => row.slug).sort(), [...expectedKinds.keys()].sort());
  await activate(host.getByRole("button", { name: "Invoke tool result", exact: true }));
  const entries = [];
  for (const option of options) {
    const app = await choose(host, option.slug), kind = expectedKinds.get(option.slug);
    const editor = JSON.parse(await host.getByRole("textbox", { name: "Tool result JSON", exact: true }).inputValue()); assert.equal(editor.structuredContent.kind, "mcpcn/" + option.slug);
    await expect(host.getByLabel("Implementation kind", { exact: true })).toContainText(kind);
    if (kind === "specialized") await expect(app.getByRole("heading", { name: headings[option.slug], exact: true }).first()).toBeVisible();
    else if (kind === "generic-alias") { await expect(app.getByRole("heading", { name: option.name, exact: true })).toBeVisible(); await expect(app.getByText("Generic alias of GenericAgentComponent.", { exact: true })).toBeVisible(); }
    else if (kind === "workflow-block") {
      await expect(app.getByRole("heading", { name: editor.structuredContent.data.title, exact: true }).first()).toBeVisible();
      if (option.slug === "admin-change-review") {
        await expect(app.getByText("2 affected.", { exact: true })).toBeVisible();
        await expect(app.getByText("Rollback: Restore the previous authored values.", { exact: true })).toBeVisible();
      }
    }
    else {
      const d = editor.structuredContent.data;
      if (option.slug === "button") await expect(app.getByRole("button", { name: d.label, exact: true })).toBeVisible();
      else if (option.slug === "tabs") await expect(app.getByRole("tab", { name: d.items[0].label, exact: true })).toBeVisible();
      else if (option.slug === "dialog") await expect(app.getByRole("dialog", { name: d.title, exact: true })).toBeVisible();
      else if (["input", "textarea", "select"].includes(option.slug)) await expect(app.getByLabel(d.label, { exact: true })).toBeVisible();
      else if (option.slug === "skeleton") await expect(app.getByLabel("Loading", { exact: true })).toBeVisible();
      else if (option.slug === "tooltip") await expect(app.getByLabel(d.label, { exact: true })).toBeVisible();
      else await expect(app.getByText(d.title ?? d.label, { exact: true })).toBeVisible();
    }
    await expect(app.getByText("Component payload is invalid", { exact: true })).toHaveCount(0); await expect(app.getByText("fixture_renderer_unavailable", { exact: true })).toHaveCount(0);
    await jsonIs(app.getByLabel("Last component intent"), null);
    entries.push({ slug: option.slug, kind, payloadKind: editor.structuredContent.kind, receivedInput: await json(app.getByLabel("Received tool input")), actualSurfaceObserved: true });
  }
  await observer.settle(); assert.equal(toolCalls(report).length, 0);
  record("all_79_actual_catalog_surfaces", { entries, counts: { specialized: 16, "generic-alias": 40, primitive: 12, "workflow-block": 11 }, automaticToolCalls: 0 });
}

async function blocks({ host, report, observer, record, activate }) {
  let app = await choose(host, "compare-options-approve");
  const approve = app.getByRole("button", { name: "Approve", exact: true }); await expect(approve).toBeDisabled();
  await activate(app.getByRole("radio", { name: "Express", exact: true })); await expect(app.getByRole("radio", { name: "Express", exact: true })).toBeChecked();
  await jsonIs(app.getByLabel("Last component intent"), { type: "selection-change", data: { selectedId: "express" } }); await expect(approve).toBeDisabled();
  await activate(app.getByRole("checkbox", { name: "I reviewed this authored example.", exact: true })); await activate(approve);
  await jsonIs(app.getByLabel("Last component intent"), { type: "approve", data: { reviewId: "authored-review-1", selectedId: "express" } });
  await expect.poll(async () => (await json(app.getByLabel("Fixture tool response")))?.structuredContent).toEqual({ fixture: true, component: "compare-options-approve", decision: "approve" });
  record("controlled_workflow_selection_and_consent", { intent: await json(app.getByLabel("Last component intent")), explicitConsentObserved: true });
  app = await choose(host, "file-upload-and-extract"); await expect(app.getByRole("button", { name: "Extract file", exact: true })).toBeDisabled();
  await observer.settle(); const before = toolCalls(report).length;
  await app.getByLabel("Choose a file", { exact: true }).setInputFiles({ name: "authored-playground.txt", mimeType: "text/plain", buffer: Buffer.from(fileBody) });
  const metadata = { name: "authored-playground.txt", bytes: Buffer.byteLength(fileBody), type: "text/plain" };
  await jsonIs(app.getByLabel("Last component intent"), { type: "file-change", data: { file: metadata } });
  await activate(app.getByRole("button", { name: "Extract file", exact: true })); await jsonIs(app.getByLabel("Last component intent"), { type: "extract", data: { file: metadata } });
  await observer.settle(); assert.equal(toolCalls(report).length, before); assert.ok(!(await app.locator("main").innerText()).includes(fileBody.trim()));
  await expect(app.getByText("Local selection emits metadata only. This preview does not read, extract or upload the file.", { exact: true })).toBeVisible();
  await activate(app.getByRole("button", { name: "Clear file", exact: true })); await jsonIs(app.getByLabel("Last component intent"), { type: "file-change", data: { file: null } }); await expect(app.getByRole("button", { name: "Extract file", exact: true })).toBeDisabled();
  record("native_authored_file_metadata_only", { fileMetadata: metadata, actualInputSelection: true, extractWasIntentOnly: true, outgoingToolCountUnchanged: true, bodyNotRendered: true, clearObserved: true });
}

const CASES = [
  ["P01", "P01 desktop docs bridge consent privacy and request failures", "desktop", "bridge", "docs", bridge],
  ["P02", "P02 narrow docs bridge consent privacy and request failures", "narrow", "bridge", "docs", bridge],
  ["P03", "P03 desktop CLI preview editors export and clipboard", "desktop", "editors", "cliPreview", editors],
  ["P04", "P04 narrow CLI preview editors export and clipboard", "narrow", "editors", "cliPreview", editors],
  ["P05", "P05 desktop docs theme viewport and negotiated display", "desktop", "display", "docs", display],
  ["P06", "P06 narrow docs theme viewport and negotiated display", "narrow", "display", "docs", display],
  ["P07", "P07 desktop CLI dev capabilities timeout and fresh sessions", "desktop", "lifecycle", "cliDev", lifecycle],
  ["P08", "P08 narrow CLI dev capabilities timeout and fresh sessions", "narrow", "lifecycle", "cliDev", lifecycle],
  ["P09", "P09 desktop CLI dev all 79 honest catalog fixtures", "desktop", "catalog", "cliDev", catalog],
  ["P10", "P10 narrow CLI dev all 79 honest catalog fixtures", "narrow", "catalog", "cliDev", catalog],
  ["P11", "P11 desktop CLI preview workflow selection and file intents", "desktop", "blocks", "cliPreview", blocks],
  ["P12", "P12 narrow CLI preview workflow selection and file intents", "narrow", "blocks", "cliPreview", blocks]
];
assert.equal(CASES.length, 12); assert.equal(new Set(CASES.map(row => row[0])).size, 12); assert.equal(expectedKinds.size, 79);

async function runCase(browser, testInfo, [caseId, title, profile, scenario, originKey, journey]) {
  assert.equal(testInfo.retry, 0); assert.equal(browser.browserType().name(), "chromium");
  const total = scenario === "catalog" ? 80000 : 40000; testInfo.setTimeout(total);
  const started = performance.now(), deadline = started + total - 4000, closeDeadline = started + total - 1000;
  const origin = origins[originKey], route = originKey === "docs" ? "/playground" : originKey === "cliDev" ? "/?component=approval-card" : "/?component=schema-form";
  const jsonPath = path.join(output, caseId + ".json"), pngPath = path.join(output, caseId + ".png"); await absent(jsonPath); await absent(pngPath);
  const viewport = profile === "desktop" ? { width: 1280, height: 900 } : { width: 390, height: 844 };
  const report = { schemaVersion: 1, sourceCommit, caseId, title, profile, scenario, originKey, route, origin, playwright: packageManifest.version, browserVersion: browser.version(), startedAt: new Date().toISOString(), viewport, touchEmulated: profile === "narrow", status: "failed", observations: [],
    input: { trackedTaps: 0, trackedClicks: 0, keyboardActions: 0 }, wire: [], sdkSends: {}, displayMessages: [], console: { debugCount: 0, warningCount: 0, warnings: [] }, downloadEvents: 0, blobDownload: { rows: [], nativeDownloadJoined: null },
    network: { requests: 0, requestFailures: 0, consoleErrors: 0, pageErrors: 0, webSockets: 0, errorCount: 0, errors: [], rows: [] },
    cleanup: { contextCreated: false, contextClosed: false, pagesCreated: 0, pagesClosed: 0, pendingRequests: null, observerJobs: null },
    limits: { workMs: total - 4000, closeMs: total - 1000, nativeMs: total, reportBytes: 262144, screenshotBytes: 262144 },
    proofLimits: ["Trusted bundled examples using real nested frames and official SDK in owned production/installed-CLI servers; no external host, model, authentication or real tool.", "Read-only console arguments observe actual SDK outgoing request objects; visible trace omits bodies. Synthetic wrong-source MessageEvent is an authored control, not real attack proof.", "Native File input uses an authored in-memory fixture and emits metadata only; no extraction/read/upload is claimed. Clipboard permission is granted only to this owned browser context/origin.", "Chromium narrow/touch emulation and selected DOM/theme checks are not physical-device, accessibility or arbitrary-HTML isolation acceptance.", "The single armed blob export uses native Download failure-null/original hash/JSON/removal acknowledgements; any blob Request is joined by actual Download URL hash and reported separately without HTTP EOF claims. Every ordinary HTTP request failure remains fatal.", "Request identity/completion observations do not prove every asset's integrity or raw socket EOF; browser-process teardown belongs to the outer supervisor."] };
  let context, page, observer, primary;
  const record = (stage, value) => { assert.ok(report.observations.length < 20); report.observations.push({ stage, atMs: performance.now() - started, ...value }); };
  try {
    context = await browser.newContext({ viewport, isMobile: profile === "narrow", hasTouch: profile === "narrow", locale: "en-US", timezoneId: "UTC", acceptDownloads: scenario === "editors" }); report.cleanup.contextCreated = true;
    context.setDefaultTimeout(3000); context.setDefaultNavigationTimeout(10000); observer = observe(context, report, started, deadline, origin); page = await context.newPage();
    const response = await within(() => page.goto(origin + route, { waitUntil: "load", timeout: 10000 }), deadline, "navigation_deadline"); assert.ok(response); assert.equal(response.status(), 200);
    const request = response.request(), navigation = observer.rows.get(request); assert.ok(navigation && request.isNavigationRequest() && request.frame() === page.mainFrame()); assert.equal(request.url(), origin + route);
    const host = originKey === "docs" ? page.frameLocator('iframe[title="MCPCN host simulator"]') : page;
    let app = await ready(host);
    await host.getByRole("combobox", { name: "Theme", exact: true }).selectOption(profile === "narrow" ? "dark" : "light");
    await host.getByRole("combobox", { name: "Viewport", exact: true }).selectOption(profile === "narrow" ? "390" : "760");
    await expect(app.locator("main.frame-app")).toHaveAttribute("data-theme", profile === "narrow" ? "dark" : "light");
    await observer.settle(); assert.equal(navigation.terminal, "finished"); assert.equal(navigation.responseFinished, "null");
    report.navigation = { requestOrdinal: navigation.ordinal, status: response.status(), exactRequestIdentity: true, requestFinished: navigation.terminal, responseFinished: navigation.responseFinished };
    const appElement = host.locator('iframe[title="Rendered MCP app"]'), appSrc = await appElement.getAttribute("src"); assert.ok(appSrc);
    const appURL = new URL(appSrc, origin); assert.equal(appURL.origin, origin); assert.equal(appURL.pathname, originKey === "docs" ? "/playground-simulator/frame.html" : "/frame.html"); assert.ok(appURL.hash);
    const hostElement = originKey === "docs" ? page.locator('iframe[title="MCPCN host simulator"]') : null;
    const hostURL = hostElement ? new URL(await hostElement.getAttribute("src"), page.url()) : new URL(page.url());
    assert.equal(hostURL.origin, origin); assert.equal(hostURL.pathname, originKey === "docs" ? "/playground-simulator/index.html" : "/");
    report.frames = { outerPage: locationMeta(page.url()), hostUrl: locationMeta(hostURL.href), appUrl: locationMeta(appURL.href), sessionFragmentSha256: sha(appURL.hash),
      hostRole: hostElement ? await hostElement.getAttribute("title") : "direct CLI simulator", appRole: await appElement.getAttribute("title"), hostFrameCount: hostElement ? await hostElement.count() : 0, appFrameCount: await appElement.count(), actualFrameCount: page.frames().length };
    assert.equal(report.frames.appFrameCount, 1); assert.equal(report.frames.actualFrameCount, originKey === "docs" ? 3 : 2);
    report.observedViewport = await page.evaluate(() => ({ innerWidth, innerHeight, documentWidth: document.documentElement.scrollWidth, maxTouchPoints: navigator.maxTouchPoints }));
    assert.equal(report.observedViewport.innerWidth, viewport.width); assert.equal(report.observedViewport.innerHeight, viewport.height); assert.ok(report.observedViewport.documentWidth <= viewport.width + 1); assert.ok(profile === "narrow" ? report.observedViewport.maxTouchPoints > 0 : report.observedViewport.maxTouchPoints === 0);
    const activate = async locator => { if (profile === "narrow") { await locator.tap(); report.input.trackedTaps++; } else { await locator.click(); report.input.trackedClicks++; } };
    record("actual_nested_bridge_ready", { frames: report.frames, theme: profile === "narrow" ? "dark" : "light", viewport: report.observedViewport });
    await within(() => journey({ page, context, host, app, report, observer, record, activate, deadline, profile }), deadline, "journey_deadline");
    assert.ok(profile === "narrow" ? report.input.trackedTaps > 0 : report.input.trackedClicks > 0); await observer.settle(); assert.equal((await context.cookies()).length, 0);
    if (scenario === "editors") assert.ok(report.downloadEvents === 1 && report.download?.removed && report.download.failure === null && report.download.urlSha256 === report.downloadUrlSha256); else assert.equal(report.downloadEvents, 0);
    assert.equal(report.network.requestFailures, 0);
  } catch (error) { primary = error; report.failure = { name: String(error?.name ?? "Error").slice(0, 80), messageSha256: sha(String(error?.message ?? error)) }; }
  finally {
    if (page && !page.isClosed()) {
      try { const png = await within(() => page.screenshot({ path: pngPath, type: "png", fullPage: false, animations: "disabled", timeout: 3000 }), deadline, "screenshot_deadline"); report.screenshot = { filename: caseId + ".png", bytes: png.length, sha256: sha(png), viewportOnly: true }; assert.ok(png.length > 0 && png.length <= 262144); }
      catch (error) { primary ??= error; observer?.error("screenshot_unproved"); }
    } else { primary ??= new Error("screenshot_page_unavailable"); observer?.error("screenshot_unproved"); }
    if (observer && !primary) { try { await observer.settle(); } catch (error) { primary ??= error; } }
    if (context) { observer?.closeStarted(); try { await within(context.close(), closeDeadline, "context_close_deadline"); report.cleanup.contextClosed = true; } catch (error) { primary ??= error; observer?.error("context_close_unproved"); } }
    if (observer) { if (observer.jobs.size) { try { await within(Promise.all([...observer.jobs]), closeDeadline, "observer_close_deadline"); } catch (error) { primary ??= error; observer.error("observer_cleanup_incomplete"); } } observer.snapshot(); }
    const current = await lstat(output); if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== directory.dev || current.ino !== directory.ino || current.uid !== directory.uid) primary ??= new Error("browser_output_identity_changed");
    const clean = report.cleanup.contextCreated && report.cleanup.contextClosed && report.cleanup.pagesCreated === 1 && report.cleanup.pagesClosed === 1 && report.cleanup.pendingRequests === 0 && report.cleanup.observerJobs === 0 && !report.cleanup.downloadArmRemaining;
    if (!primary && clean && report.network.errorCount === 0 && report.screenshot) report.status = "passed"; else primary ??= new Error("browser_case_or_cleanup_unproved");
    report.completedAt = new Date().toISOString(); const bytes = Buffer.from(JSON.stringify(report, null, 2) + "\n"); assert.ok(bytes.length <= 262144); await writeFile(jsonPath, bytes, { flag: "wx", mode: 0o600 });
  }
  if (primary) throw primary;
}
for (const row of CASES) test(row[1], async ({ browser }, testInfo) => runCase(browser, testInfo, row));

# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: form-workflow-browser.spec.mjs >> F11 desktop docs draft updates and replacement fences
- Location: tooling/form-workflow-browser.spec.mjs:653:26

# Error details

```
AssertionError: observation_original_bound
```

# Test source

```ts
  1   | // Trusted form-workflow DOM/intent checks; no tool, queue, tracing or model runtime.
  2   | import assert from "node:assert/strict";
  3   | import { createHash } from "node:crypto";
  4   | import { createRequire } from "node:module";
  5   | import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
  6   | import path from "node:path";
  7   | import { performance } from "node:perf_hooks";
  8   | import { gzipSync } from "node:zlib";
  9   | 
  10  | const tools = process.env.MCPCN_FORMS_BROWSER_TOOLS;
  11  | assert.ok(tools && path.isAbsolute(tools));
  12  | const { test, expect: playwrightExpect } = createRequire(path.join(tools, "package.json"))("playwright/test");
  13  | const expect = playwrightExpect.configure({ timeout: 3000 });
  14  | const packageManifest = JSON.parse(await readFile(path.join(tools, "package.json"), "utf8"));
  15  | assert.equal(packageManifest.name, "playwright"); assert.equal(packageManifest.version, "1.65.0");
  16  | const origins = Object.fromEntries([["docs", "MCPCN_FORMS_ORIGIN", "4173"], ["cliDev", "MCPCN_FORMS_CLI_DEV_ORIGIN", "4545"], ["cliPreview", "MCPCN_FORMS_CLI_PREVIEW_ORIGIN", "4546"]].map(([key, name, port]) => {
  17  |   const url = new URL(process.env[name] ?? "");
  18  |   assert.equal(url.protocol, "http:"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, port);
  19  |   assert.equal(url.href, url.origin + "/"); assert.ok(!url.username && !url.password); return [key, url.origin];
  20  | }));
  21  | const output = process.env.MCPCN_FORMS_BROWSER_OUTPUT, sourceCommit = process.env.SOURCE_COMMIT;
  22  | assert.ok(output && path.isAbsolute(output)); assert.match(sourceCommit ?? "", /^[0-9a-f]{40}$/);
  23  | const directory = await lstat(output);
  24  | assert.ok(directory.isDirectory() && !directory.isSymbolicLink() && directory.uid === process.getuid() && (directory.mode & 0o077) === 0);
  25  | assert.equal(await realpath(output), output);
  26  | const sha = value => createHash("sha256").update(value).digest("hex");
  27  | const forbiddenMethods = ["tools/call", "ui/update-model-context", "ui/message"];
  28  | test.setTimeout(40000);
  29  | 
  30  | async function within(operation, deadline, code) {
  31  |   const remaining = deadline - performance.now();
  32  |   if (!(remaining > 0)) { if (typeof operation !== "function") void Promise.resolve(operation).catch(() => undefined); throw new Error(code); }
  33  |   let timer;
  34  |   try {
  35  |     const promise = typeof operation === "function" ? operation() : operation;
  36  |     const value = await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(code)), remaining); })]);
  37  |     assert.ok(performance.now() < deadline, code); return value;
  38  |   } finally { clearTimeout(timer); }
  39  | }
  40  | async function absent(filename) {
  41  |   try { await lstat(filename); throw new Error("browser_output_exists"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  42  | }
  43  | function original(value) {
> 44  |   const bytes = Buffer.from(value); assert.ok(bytes.length <= 65536, "observation_original_bound");
      |                                            ^ AssertionError: observation_original_bound
  45  |   const packed = gzipSync(bytes);
  46  |   return { encoding: "gzip-base64", bytes: bytes.length, sha256: sha(bytes), compressedBytes: packed.length, data: packed.toString("base64"), complete: true };
  47  | }
  48  | async function rawText(locator) { const raw = await locator.textContent(); assert.ok(typeof raw === "string" && Buffer.byteLength(raw) <= 65536); return raw; }
  49  | async function json(locator) { return JSON.parse(await rawText(locator)); }
  50  | async function jsonIs(locator, expected) { await expect.poll(() => json(locator)).toEqual(expected); return json(locator); }
  51  | const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  52  | const locationMeta = value => { const url = new URL(value); return { origin: url.origin, pathname: url.pathname }; };
  53  | 
  54  | // The trusted-network/frame observer is adapted from playground-browser.spec.mjs.
  55  | // No download arm, clipboard permission or permitted tool/context/message path exists here.
  56  | function observe(context, report, started, deadline, allowedOrigin) {
  57  |   const rows = new Map(), jobs = new Set(); let closing = false, signal, changed;
  58  |   const reset = () => { changed = new Promise(resolve => { signal = resolve; }); }; reset();
  59  |   const notify = () => { signal(); reset(); };
  60  |   const error = (code, extra = {}) => { report.network.errorCount++; if (report.network.errors.length < 20) report.network.errors.push({ code, atMs: performance.now() - started, ...extra }); notify(); };
  61  |   const track = (work, operation) => {
  62  |     let job; job = work.catch(value => error("observer_operation_failed", { operation, errorName: String(value?.name ?? "Error").slice(0, 40), messageSha256: sha(String(value?.message ?? value)) }))
  63  |       .finally(() => { jobs.delete(job); notify(); }); jobs.add(job);
  64  |   };
  65  |   const terminal = (row, value) => { if (row.terminal) error("duplicate_terminal", { ordinal: row.ordinal }); else { row.terminal = value; row.terminalAtMs = performance.now() - started; } notify(); };
  66  |   context.on("request", request => {
  67  |     if (closing) error("request_after_close_started");
  68  |     const url = new URL(request.url()); report.network.requests++;
  69  |     if (rows.size >= 300) { error("request_bound_exceeded"); return; }
  70  |     const row = { ordinal: rows.size + 1, method: request.method(), protocol: url.protocol, host: url.host, pathname: url.pathname.slice(0, 512), startedAtMs: performance.now() - started, status: null, responseFinished: "unobserved", terminal: null };
  71  |     rows.set(request, row);
  72  |     if (url.origin !== allowedOrigin || request.method() !== "GET" || url.username || url.password || url.protocol !== "http:") error("unapproved_request", { ordinal: row.ordinal });
  73  |     notify();
  74  |   });
  75  |   context.on("response", response => {
  76  |     const row = rows.get(response.request()); if (!row) { error("response_without_request"); return; }
  77  |     if (row.status !== null) error("duplicate_response", { ordinal: row.ordinal });
  78  |     row.status = response.status(); row.responseAtMs = performance.now() - started;
  79  |     if (row.status >= 400) error("http_error", { ordinal: row.ordinal, status: row.status });
  80  |     track((async () => {
  81  |       try {
  82  |         const result = await within(response.finished(), Math.min(deadline, performance.now() + 10000), "response_finished_timeout");
  83  |         row.responseFinished = result === null ? "null" : "error"; row.responseFinishedAtMs = performance.now() - started;
  84  |         if (result !== null) error("response_finished_error", { ordinal: row.ordinal });
  85  |       } catch { row.responseFinished = "unresolved_or_late"; error("response_finished_unproved", { ordinal: row.ordinal }); }
  86  |       notify();
  87  |     })(), "http_response_finished");
  88  |   });
  89  |   context.on("requestfinished", request => { const row = rows.get(request); row ? terminal(row, "finished") : error("finished_without_request"); });
  90  |   context.on("requestfailed", request => {
  91  |     report.network.requestFailures++; const row = rows.get(request), reason = request.failure()?.errorText ?? "";
  92  |     if (row) terminal(row, "failed"); error("request_failed", { ordinal: row?.ordinal ?? null, reason: /^net::ERR_[A-Z_]+$/.test(reason) ? reason : "other" });
  93  |   });
  94  |   context.on("page", page => {
  95  |     report.cleanup.pagesCreated++; if (report.cleanup.pagesCreated > 1) error("unexpected_page");
  96  |     page.on("console", message => {
  97  |       const text = message.text(), type = message.type();
  98  |       if (type === "error") { report.network.consoleErrors++; error("console_error", { messageSha256: sha(text) }); }
  99  |       if (type === "warning") { report.console.warningCount++; if (report.console.warnings.length < 20) report.console.warnings.push({ sha256: sha(text), sandboxSameOriginWarning: text.includes("allow-scripts") && text.includes("allow-same-origin") }); }
  100 |       if (type === "debug") report.console.debugCount++;
  101 |       if (type !== "debug" || !text.startsWith("Sending message")) return;
  102 |       report.console.sdkSendPreviewCount++;
  103 |       const preview = text.slice("Sending message".length).trim(), methods = [...preview.matchAll(/(?:\{|,)\s*method:\s*([A-Za-z0-9_/-]{1,100})(?=\s*[,}])/g)];
  104 |       const candidate = text.length <= 4096 && preview.startsWith("{") && preview.endsWith("}") && methods.length === 1 ? methods[0][1] : undefined;
  105 |       const responsePreview = text.length <= 4096 && preview.startsWith("{") && preview.endsWith("}") && !methods.length && /(?:\{|,)\s*(?:result|error):/.test(preview) && /(?:\{|,)\s*id:/.test(preview);
  106 |       if (candidate) {
  107 |         if (Object.keys(report.sdkSends).length >= 60 && !Object.hasOwn(report.sdkSends, candidate)) { error("sdk_method_metadata_bound"); return; }
  108 |         report.sdkSends[candidate] = (report.sdkSends[candidate] ?? 0) + 1;
  109 |       } else if (responsePreview) report.console.responsePreviewCount++;
  110 |       else {
  111 |         report.console.unclassifiedSendCount++;
  112 |         if (report.console.unclassifiedSends.length < 20) report.console.unclassifiedSends.push({ bytes: Buffer.byteLength(text), sha256: sha(text) });
  113 |         error("unclassified_sdk_send");
  114 |       }
  115 |       if (!forbiddenMethods.includes(candidate)) return;
  116 |       if (message.args().length < 2) { error("required_console_argument_missing"); return; }
  117 |       track((async () => {
  118 |         const value = await within(message.args()[1].jsonValue(), Math.min(deadline, performance.now() + 3000), "wire_console_deadline");
  119 |         assert.ok(object(value) && value.jsonrpc === "2.0" && value.method === candidate);
  120 |         assert.ok(report.wire.length < 60); report.wire.push({ method: value.method, atMs: performance.now() - started, raw: original(JSON.stringify(value)) });
  121 |         error("forbidden_component_rpc", { method: value.method });
  122 |       })(), "forbidden_sdk_request");
  123 |     });
  124 |     page.on("pageerror", value => { report.network.pageErrors++; error("page_error", { messageSha256: sha(String(value.message)) }); });
  125 |     page.on("websocket", () => { report.network.webSockets++; error("websocket"); });
  126 |     page.on("crash", () => error("page_crash"));
  127 |     page.on("download", () => { report.downloadEvents++; error("unexpected_download"); });
  128 |     page.on("dialog", dialog => { error("unexpected_dialog"); track(dialog.dismiss(), "unexpected_dialog_dismiss"); });
  129 |     page.on("close", () => { report.cleanup.pagesClosed++; if (!closing) error("unexpected_page_close"); notify(); });
  130 |   });
  131 |   context.on("serviceworker", () => error("unexpected_service_worker"));
  132 |   return { rows, jobs, error,
  133 |     closeStarted() { closing = true; report.cleanup.closeStartedAtMs = performance.now() - started; },
  134 |     async settle(end = deadline) {
  135 |       while (true) {
  136 |         assert.ok(performance.now() < end, "network_settlement_deadline"); if (report.network.errorCount) throw new Error("network_or_browser_error");
  137 |         if (!jobs.size && [...rows.values()].every(row => row.terminal === "finished" && row.responseFinished === "null")) return;
  138 |         await within(changed, end, "network_settlement_deadline");
  139 |       }
  140 |     },
  141 |     snapshot() { report.network.rows = [...rows.values()]; report.cleanup.pendingRequests = [...rows.values()].filter(row => row.terminal === null || ["unobserved", "unresolved_or_late"].includes(row.responseFinished)).length; report.cleanup.observerJobs = jobs.size; report.cleanup.downloadArmRemaining = false; }
  142 |   };
  143 | }
  144 | 
```
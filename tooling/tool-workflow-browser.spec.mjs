// Trusted tool-workflow DOM/intent checks; no tool, queue, tracing or model runtime.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";

const tools = process.env.MCPCN_TOOLFLOW_BROWSER_TOOLS;
assert.ok(tools && path.isAbsolute(tools));
const { test, expect: playwrightExpect } = createRequire(path.join(tools, "package.json"))("playwright/test");
const expect = playwrightExpect.configure({ timeout: 3000 });
const packageManifest = JSON.parse(await readFile(path.join(tools, "package.json"), "utf8"));
assert.equal(packageManifest.name, "playwright"); assert.equal(packageManifest.version, "1.65.0");
const origins = Object.fromEntries([["docs", "MCPCN_TOOLFLOW_ORIGIN", "4173"], ["cliDev", "MCPCN_TOOLFLOW_CLI_DEV_ORIGIN", "4545"], ["cliPreview", "MCPCN_TOOLFLOW_CLI_PREVIEW_ORIGIN", "4546"]].map(([key, name, port]) => {
  const url = new URL(process.env[name] ?? "");
  assert.equal(url.protocol, "http:"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, port);
  assert.equal(url.href, url.origin + "/"); assert.ok(!url.username && !url.password); return [key, url.origin];
}));
const output = process.env.MCPCN_TOOLFLOW_BROWSER_OUTPUT, sourceCommit = process.env.SOURCE_COMMIT;
assert.ok(output && path.isAbsolute(output)); assert.match(sourceCommit ?? "", /^[0-9a-f]{40}$/);
const directory = await lstat(output);
assert.ok(directory.isDirectory() && !directory.isSymbolicLink() && directory.uid === process.getuid() && (directory.mode & 0o077) === 0);
assert.equal(await realpath(output), output);
const sha = value => createHash("sha256").update(value).digest("hex");
const forbiddenMethods = ["tools/call", "ui/update-model-context", "ui/message"];
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
function original(value) {
  const bytes = Buffer.from(value); assert.ok(bytes.length <= 65536, "observation_original_bound");
  const packed = gzipSync(bytes);
  return { encoding: "gzip-base64", bytes: bytes.length, sha256: sha(bytes), compressedBytes: packed.length, data: packed.toString("base64"), complete: true };
}
async function rawText(locator) { const raw = await locator.textContent(); assert.ok(typeof raw === "string" && Buffer.byteLength(raw) <= 65536); return raw; }
async function json(locator) { return JSON.parse(await rawText(locator)); }
async function jsonIs(locator, expected) { await expect.poll(() => json(locator)).toEqual(expected); return json(locator); }
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const locationMeta = value => { const url = new URL(value); return { origin: url.origin, pathname: url.pathname }; };

// The trusted-network/frame observer is adapted from playground-browser.spec.mjs.
// No download arm, clipboard permission or permitted tool/context/message path exists here.
function observe(context, report, started, deadline, allowedOrigin) {
  const rows = new Map(), jobs = new Set(); let closing = false, signal, changed;
  const reset = () => { changed = new Promise(resolve => { signal = resolve; }); }; reset();
  const notify = () => { signal(); reset(); };
  const error = (code, extra = {}) => { report.network.errorCount++; if (report.network.errors.length < 20) report.network.errors.push({ code, atMs: performance.now() - started, ...extra }); notify(); };
  const track = (work, operation) => {
    let job; job = work.catch(value => error("observer_operation_failed", { operation, errorName: String(value?.name ?? "Error").slice(0, 40), messageSha256: sha(String(value?.message ?? value)) }))
      .finally(() => { jobs.delete(job); notify(); }); jobs.add(job);
  };
  const terminal = (row, value) => { if (row.terminal) error("duplicate_terminal", { ordinal: row.ordinal }); else { row.terminal = value; row.terminalAtMs = performance.now() - started; } notify(); };
  context.on("request", request => {
    if (closing) error("request_after_close_started");
    const url = new URL(request.url()); report.network.requests++;
    if (rows.size >= 300) { error("request_bound_exceeded"); return; }
    const row = { ordinal: rows.size + 1, method: request.method(), protocol: url.protocol, host: url.host, pathname: url.pathname.slice(0, 512), startedAtMs: performance.now() - started, status: null, responseFinished: "unobserved", terminal: null };
    rows.set(request, row);
    if (url.origin !== allowedOrigin || request.method() !== "GET" || url.username || url.password || url.protocol !== "http:") error("unapproved_request", { ordinal: row.ordinal });
    notify();
  });
  context.on("response", response => {
    const row = rows.get(response.request()); if (!row) { error("response_without_request"); return; }
    if (row.status !== null) error("duplicate_response", { ordinal: row.ordinal });
    row.status = response.status(); row.responseAtMs = performance.now() - started;
    if (row.status >= 400) error("http_error", { ordinal: row.ordinal, status: row.status });
    track((async () => {
      try {
        const result = await within(response.finished(), Math.min(deadline, performance.now() + 10000), "response_finished_timeout");
        row.responseFinished = result === null ? "null" : "error"; row.responseFinishedAtMs = performance.now() - started;
        if (result !== null) error("response_finished_error", { ordinal: row.ordinal });
      } catch { row.responseFinished = "unresolved_or_late"; error("response_finished_unproved", { ordinal: row.ordinal }); }
      notify();
    })(), "http_response_finished");
  });
  context.on("requestfinished", request => { const row = rows.get(request); row ? terminal(row, "finished") : error("finished_without_request"); });
  context.on("requestfailed", request => {
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
      if (type !== "debug" || !text.startsWith("Sending message")) return;
      report.console.sdkSendPreviewCount++;
      const preview = text.slice("Sending message".length).trim(), methods = [...preview.matchAll(/(?:\{|,)\s*method:\s*([A-Za-z0-9_/-]{1,100})(?=\s*[,}])/g)];
      const candidate = text.length <= 4096 && preview.startsWith("{") && preview.endsWith("}") && methods.length === 1 ? methods[0][1] : undefined;
      const responsePreview = text.length <= 4096 && preview.startsWith("{") && preview.endsWith("}") && !methods.length && /(?:\{|,)\s*(?:result|error):/.test(preview) && /(?:\{|,)\s*id:/.test(preview);
      if (candidate) {
        if (Object.keys(report.sdkSends).length >= 60 && !Object.hasOwn(report.sdkSends, candidate)) { error("sdk_method_metadata_bound"); return; }
        report.sdkSends[candidate] = (report.sdkSends[candidate] ?? 0) + 1;
      } else if (responsePreview) report.console.responsePreviewCount++;
      else {
        report.console.unclassifiedSendCount++;
        if (report.console.unclassifiedSends.length < 20) report.console.unclassifiedSends.push({ bytes: Buffer.byteLength(text), sha256: sha(text) });
        error("unclassified_sdk_send");
      }
      if (!forbiddenMethods.includes(candidate)) return;
      if (message.args().length < 2) { error("required_console_argument_missing"); return; }
      track((async () => {
        const value = await within(message.args()[1].jsonValue(), Math.min(deadline, performance.now() + 3000), "wire_console_deadline");
        assert.ok(object(value) && value.jsonrpc === "2.0" && value.method === candidate);
        assert.ok(report.wire.length < 60); report.wire.push({ method: value.method, atMs: performance.now() - started, raw: original(JSON.stringify(value)) });
        error("forbidden_component_rpc", { method: value.method });
      })(), "forbidden_sdk_request");
    });
    page.on("pageerror", value => { report.network.pageErrors++; error("page_error", { messageSha256: sha(String(value.message)) }); });
    page.on("websocket", () => { report.network.webSockets++; error("websocket"); });
    page.on("crash", () => error("page_crash"));
    page.on("download", () => { report.downloadEvents++; error("unexpected_download"); });
    page.on("dialog", dialog => { error("unexpected_dialog"); track(dialog.dismiss(), "unexpected_dialog_dismiss"); });
    page.on("close", () => { report.cleanup.pagesClosed++; if (!closing) error("unexpected_page_close"); notify(); });
  });
  context.on("serviceworker", () => error("unexpected_service_worker"));
  return { rows, jobs, error,
    closeStarted() { closing = true; report.cleanup.closeStartedAtMs = performance.now() - started; },
    async settle(end = deadline) {
      while (true) {
        assert.ok(performance.now() < end, "network_settlement_deadline"); if (report.network.errorCount) throw new Error("network_or_browser_error");
        if (!jobs.size && [...rows.values()].every(row => row.terminal === "finished" && row.responseFinished === "null")) return;
        await within(changed, end, "network_settlement_deadline");
      }
    },
    snapshot() { report.network.rows = [...rows.values()]; report.cleanup.pendingRequests = [...rows.values()].filter(row => row.terminal === null || ["unobserved", "unresolved_or_late"].includes(row.responseFinished)).length; report.cleanup.observerJobs = jobs.size; report.cleanup.downloadArmRemaining = false; }
  };
}

async function ready(host) {
  await expect(host.getByRole("status", { name: "Host connection", exact: true })).toHaveText("ready", { timeout: 12000 });
  const app = host.frameLocator('iframe[title="Rendered MCP app"]');
  await expect(app.locator("main.frame-app > header").getByRole("status")).toHaveText("Bridge connected", { timeout: 12000 }); return app;
}
async function choose(host, slug) {
  await host.getByRole("combobox", { name: "Component or block", exact: true }).selectOption(slug);
  const app = await ready(host); await jsonIs(app.getByLabel("Received tool input", { exact: true }), { component: slug }); return app;
}

const labels = { result: "Inspect authored tool outcome", running: "Review authored task progress", partial: "Review authored result parts", queue: "Review authored queue", trace: "Review authored tool trace", callbacks: "Review the reported tool trace" };
const slugs = { result: "tool-result-card", running: "running-task-card", partial: "partial-result-viewer", queue: "queued-step-list", trace: "tool-trace-viewer" };
const callbackError = "The action could not be completed. Try again.";
const regionFor = (app, scenario) => app.getByRole("region", { name: labels[scenario], exact: true });
const intentFor = (app, direct = false) => app.getByLabel(direct ? "Last tool workflow intent" : "Last component intent", { exact: true });
async function nativeDOM(region) {
  return region.evaluate(element => {
    const nodes = [...element.querySelectorAll("input,button,textarea,select")];
    const texts = (root, selector) => [...root.querySelectorAll(selector)].map(node => node.textContent);
    const alerts = texts(element, '[role="alert"]');
    return {
      outerHTML: element.outerHTML, textContent: element.textContent,
      data: { ariaLabel: element.getAttribute("aria-label"), ariaBusy: element.getAttribute("aria-busy"), role: element.getAttribute("role") },
      controls: nodes.map((control, index) => ({ index, tag: control.tagName, type: "type" in control ? control.type : control.tagName.toLowerCase(), id: control.id, name: control.getAttribute("name") ?? "",
        label: control.getAttribute("aria-label") ?? [...(control.labels ?? [])].map(label => label.textContent).join(" "), value: "value" in control ? control.value : null,
        checked: control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type) ? control.checked : null,
        disabled: control.matches(":disabled"), required: "required" in control ? control.required : false, focused: control === document.activeElement, text: control instanceof HTMLButtonElement ? control.textContent : null,
        options: control instanceof HTMLSelectElement ? [...control.options].map(option => ({ value: option.value, label: option.label, selected: option.selected, disabled: option.disabled })) : null,
      })),
      details: [...element.querySelectorAll("details")].map(node => ({ summary: node.querySelector("summary")?.textContent ?? null, open: node.open, textContent: node.textContent, preText: node.querySelector("pre")?.textContent ?? null })),
      progress: [...element.querySelectorAll("progress")].map(node => ({ label: node.getAttribute("aria-label"), value: node.value, max: node.max, position: node.position })),
      sections: [...element.querySelectorAll("section[aria-label]")].map(section => ({ label: section.getAttribute("aria-label"), ariaBusy: section.getAttribute("aria-busy"), outerHTML: section.outerHTML, textContent: section.textContent,
        alerts: texts(section, '[role="alert"]'), statuses: texts(section, '[role="status"]'), controlIndices: [...section.querySelectorAll("input,button,textarea,select")].map(node => nodes.indexOf(node)) })),
      alerts, feedbackErrors: alerts.filter(value => value === "The action could not be completed. Try again."),
      callbackCounters: document.querySelector('output[aria-label="Tool workflow intent count"]') ? {
        intents: document.querySelector('output[aria-label="Tool workflow intent count"]')?.textContent ?? null,
        settled: document.querySelector('output[aria-label="Settled callback count"]')?.textContent ?? null,
      } : null,
      focus: { tag: document.activeElement?.tagName ?? null, id: document.activeElement?.id ?? null, inRegion: element.contains(document.activeElement), documentHasFocus: document.hasFocus() },
      viewport: { innerWidth, innerHeight, documentWidth: document.documentElement.scrollWidth, maxTouchPoints: navigator.maxTouchPoints },
    };
  });
}
async function snapshot(region, app, host = null, direct = false) {
  const dom = await nativeDOM(region), intent = await rawText(intentFor(app, direct));
  const payload = host ? await host.getByRole("textbox", { name: "Tool result JSON", exact: true }).inputValue() : null;
  return { regionLabel: dom.data.ariaLabel, controlCount: dom.controls.length, dom: original(JSON.stringify(dom)), intent: original(intent), intentValue: JSON.parse(intent), payload: payload === null ? null : original(payload) };
}
async function selected(locator, activate) {
  assert.equal(await locator.isChecked(), false); const before = await locator.elementHandle(); assert.ok(before);
  try {
    await activate(locator); await expect(locator).toBeChecked(); await expect(locator).toBeFocused();
    const sameNode = await locator.evaluate((node, previous) => node === previous, before); assert.equal(sameNode, true);
    return { checked: await locator.isChecked(), focused: await locator.evaluate(node => node === document.activeElement), sameNode };
  } finally { await before.dispose(); }
}
async function filtered(locator, value) {
  const before = await locator.elementHandle(); assert.ok(before);
  try {
    await locator.focus(); await locator.selectOption(value); await expect(locator).toHaveValue(value); await expect(locator).toBeFocused();
    const sameNode = await locator.evaluate((node, previous) => node === previous, before); assert.equal(sameNode, true);
    return { value: await locator.inputValue(), focused: await locator.evaluate(node => node === document.activeElement), sameNode };
  } finally { await before.dispose(); }
}
async function openJSON(region, label, expected, activate) {
  const summary = region.locator("summary").filter({ hasText: new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$") });
  const details = summary.locator(".."); if (!(await details.evaluate(node => node.open))) await activate(summary);
  await expect(details).toHaveAttribute("open", ""); const pre = details.locator("pre"); await expect(pre).toBeVisible();
  const raw = await rawText(pre); assert.deepEqual(JSON.parse(raw), expected); return original(raw);
}
async function edited(host, mutate, activate) {
  const editor = host.getByRole("textbox", { name: "Tool result JSON", exact: true }), result = JSON.parse(await editor.inputValue());
  assert.ok(object(result) && object(result.structuredContent) && object(result.structuredContent.data)); mutate(result.structuredContent.data);
  await editor.fill(JSON.stringify(result, null, 2)); await activate(host.getByRole("button", { name: "Invoke tool result", exact: true })); return result;
}
async function invalidRefusal(args, mutate) {
  const { host, app, region, activate } = args; await expect(region).toHaveAttribute("aria-busy", "false");
  const beforeDOM = await nativeDOM(region), before = await snapshot(region, app, host);
  const editor = host.getByRole("textbox", { name: "Tool result JSON", exact: true }), initial = await editor.inputValue();
  await edited(host, mutate, activate); const alert = host.getByRole("alert"); await expect(alert).toContainText("Invalid component payload"); await expect(region).toBeVisible();
  const afterDOM = await nativeDOM(region), proof = await snapshot(region, app, host);
  assert.equal(afterDOM.outerHTML, beforeDOM.outerHTML); assert.deepEqual(proof.intentValue, before.intentValue);
  const controls = rows => rows.map(({ focused: _focused, ...row }) => row); assert.deepEqual(controls(afterDOM.controls), controls(beforeDOM.controls));
  const hostAlert = original(await rawText(alert)); await editor.fill(initial); return { before, proof, hostAlert, previousUIUnchanged: true, oldIntentUnchanged: true };
}
async function disabledRefusal(args) {
  const { host, app, region, activate, page, report } = args;
  await edited(host, data => { data.disabled = true; }, activate); await expect(host.getByRole("alert")).toHaveCount(0);
  await expect.poll(() => region.locator("input,button,textarea,select").evaluateAll(nodes => nodes.length > 0 && nodes.every(node => node.matches(":disabled")))).toBe(true);
  const before = await snapshot(region, app, host); await activate(region.getByRole("button").last(), true); await page.keyboard.press("Enter"); report.input.keyboardActions++;
  const proof = await snapshot(region, app, host); assert.deepEqual(proof.intentValue, before.intentValue);
  return { before, proof, allControlsDisabled: true, forcedNativePointerAttempt: true, nativeEnterAttempt: true, oldIntentUnchanged: true };
}

async function resultJourney(args) {
  const { app, host, record, activate } = args, region = regionFor(app, "result");
  const expected = { records: [{ id: "record-a", accepted: false, count: 0, note: "" }], next: null };
  const structured = await openJSON(region, "Incomplete Result", expected, activate);
  await expect(region.getByText("This result is incomplete.", { exact: true })).toBeVisible();
  await activate(region.getByRole("button", { name: "Inspect outcome", exact: true }));
  await jsonIs(intentFor(app), { type: "inspect-result", data: { id: "outcome-1", tool: "read_authored_records", status: "partial" } });
  record("result_structured_partial_inspection", { proof: await snapshot(region, app, host), structured });
  const primitives = [];
  for (const value of [null, false, 0, ""]) {
    await edited(host, data => { data.status = "succeeded"; data.result = value; delete data.errorMessage; }, activate);
    await expect(region.getByText("Reported outcome:", { exact: false })).toContainText("succeeded");
    const raw = await openJSON(region, "Result", value, activate); primitives.push({ value, raw, proof: await snapshot(region, app, host) });
  }
  record("result_falsy_values_are_supplied", { proof: await snapshot(region, app, host), primitives });
  await edited(host, data => { data.status = "failed"; data.errorMessage = "Authored failed outcome"; data.result = null; }, activate);
  await expect(region.getByRole("alert")).toHaveText("Authored failed outcome"); await openJSON(region, "Incomplete Result", null, activate); const retained = await snapshot(region, app, host);
  await edited(host, data => { delete data.result; }, activate); await expect(region.getByText("No result was supplied.", { exact: true })).toBeVisible();
  record("result_failed_retained_and_absent", { proof: await snapshot(region, app, host), retained });
  record("result_missing_success_refused", await invalidRefusal({ ...args, region }, data => { data.status = "succeeded"; delete data.result; delete data.errorMessage; }));
  record("result_disabled_refused", await disabledRefusal({ ...args, region }));
}

async function runningJourney(args) {
  const { app, host, record, activate } = args, region = regionFor(app, "running");
  await expect(region.getByRole("progressbar", { name: "Reported task progress", exact: true })).toHaveAttribute("value", "2");
  await expect(region.getByText("1200 ms reported elapsed", { exact: true })).toBeVisible();
  await activate(region.getByRole("button", { name: "Inspect task", exact: true })); await jsonIs(intentFor(app), { type: "inspect-task", data: { id: "task-1" } });
  const inspected = await snapshot(region, app, host); await activate(region.getByRole("button", { name: "Request cancellation", exact: true }));
  await jsonIs(intentFor(app), { type: "cancel-task", data: { id: "task-1", status: "running" } });
  record("running_inspect_and_cancel_intents", { proof: await snapshot(region, app, host), inspected });
  await edited(host, data => { data.progress.completed = data.progress.total; data.elapsedMs = 0; }, activate);
  await expect(region.getByText("Reported task status:", { exact: false })).toContainText("running"); await expect(region.getByText("3 of 3 reported steps", { exact: true })).toBeVisible();
  record("running_full_progress_not_completion", { proof: await snapshot(region, app, host) });
  await edited(host, data => { data.status = "completed"; }, activate); await expect(region.getByRole("button", { name: "Request cancellation", exact: true })).toHaveCount(0);
  const completed = await snapshot(region, app, host);
  await edited(host, data => { data.status = "queued"; delete data.progress; delete data.elapsedMs; data.cancellable = false; }, activate);
  await expect(region.getByText("No progress counts were supplied.", { exact: true })).toBeVisible(); await expect(region.getByText(/ms reported elapsed/)).toHaveCount(0);
  record("running_completed_and_missing_progress", { proof: await snapshot(region, app, host), completed });
  record("running_impossible_progress_refused", await invalidRefusal({ ...args, region }, data => { data.progress = { completed: 2, total: 1 }; }));
  record("running_disabled_refused", await disabledRefusal({ ...args, region }));
}

async function partialJourney(args) {
  const { app, host, record, activate } = args, region = regionFor(app, "partial");
  const structured = await openJSON(region, "Part value", { accepted: false, count: 0, note: "", next: null }, activate);
  await expect(region.getByText("1 of 3 parts available", { exact: true })).toBeVisible();
  await activate(region.getByRole("button", { name: "Inspect part", exact: true })); await jsonIs(intentFor(app), { type: "inspect-result-part", data: { id: "parts-1", partId: "summary", status: "available", attempt: 1 } });
  record("partial_available_json_and_inspection", { proof: await snapshot(region, app, host), structured });
  const focus = await selected(region.getByRole("radio", { name: "Select part: Authored details", exact: true }), activate);
  await jsonIs(intentFor(app), { type: "select-result-part", data: { id: "parts-1", partId: "details" } });
  const selectedProof = await snapshot(region, app, host); await openJSON(region, "Incomplete part value", null, activate);
  await activate(region.getByRole("button", { name: "Request part retry", exact: true })); await jsonIs(intentFor(app), { type: "retry-result-part", data: { id: "parts-1", partId: "details", attempt: 2 } });
  record("partial_current_failed_retry_and_focus", { proof: await snapshot(region, app, host), selectedProof, focus });
  const pendingFocus = await selected(region.getByRole("radio", { name: "Select part: Pending appendix", exact: true }), activate);
  await expect(region.getByRole("button", { name: "Request part retry", exact: true })).toHaveCount(0); await expect(region.getByText("This part is pending. No value is available.", { exact: true })).toBeVisible();
  await activate(region.getByRole("button", { name: "Inspect part", exact: true })); await jsonIs(intentFor(app), { type: "inspect-result-part", data: { id: "parts-1", partId: "pending", status: "pending", attempt: 1 } });
  record("partial_pending_state_is_inspectable", { proof: await snapshot(region, app, host), pendingFocus });
  await edited(host, data => { data.parts = []; data.status = "complete"; delete data.selectedPartId; }, activate); await expect(region.getByText("No result parts were supplied.", { exact: true })).toBeVisible();
  record("partial_empty_complete_is_explicit", { proof: await snapshot(region, app, host) });
  record("partial_stale_selection_refused", await invalidRefusal({ ...args, region }, data => { data.selectedPartId = "removed-part"; }));
  await edited(host, data => { data.status = "partial"; data.parts = [{ id: "failed", label: "Restored failed part", status: "failed", message: "Authored restored failure", attempt: 3, retryable: true }]; data.selectedPartId = "failed"; }, activate);
  await expect(region.getByRole("button", { name: "Request part retry", exact: true })).toBeEnabled();
  record("partial_disabled_refused", await disabledRefusal({ ...args, region }));
}

async function queueJourney(args) {
  const { app, host, record, activate } = args, region = regionFor(app, "queue");
  const initial = await snapshot(region, app, host); await activate(region.getByRole("button", { name: "Inspect step", exact: true }));
  await jsonIs(intentFor(app), { type: "inspect-queued-step", data: { id: "queue-1", stepId: "review", status: "failed", attempt: 2 } });
  await activate(region.getByRole("button", { name: "Request step retry", exact: true })); await jsonIs(intentFor(app), { type: "retry-queued-step", data: { id: "queue-1", stepId: "review", attempt: 2 } });
  record("queue_order_attempts_and_failed_retry", { proof: await snapshot(region, app, host), initial });
  const focus = await selected(region.getByRole("radio", { name: "Select step: Publish authored result", exact: true }), activate);
  await jsonIs(intentFor(app), { type: "select-queued-step", data: { id: "queue-1", stepId: "publish" } });
  const selectedProof = await snapshot(region, app, host); await expect(region.getByRole("button", { name: "Request step retry", exact: true })).toHaveCount(0);
  await activate(region.getByRole("button", { name: "Inspect step", exact: true })); await jsonIs(intentFor(app), { type: "inspect-queued-step", data: { id: "queue-1", stepId: "publish", status: "queued", attempt: 0 } });
  record("queue_zero_attempt_selection_and_focus", { proof: await snapshot(region, app, host), selectedProof, focus });
  await edited(host, data => { data.steps[0].status = "running"; data.steps[1].status = "running"; data.steps[1].retryable = false; }, activate);
  record("queue_concurrent_running_is_reported", { proof: await snapshot(region, app, host) });
  record("queue_duplicate_identity_refused", await invalidRefusal({ ...args, region }, data => { data.steps.push({ ...data.steps[0] }); }));
  record("queue_disabled_refused", await disabledRefusal({ ...args, region }));
}

async function traceJourney(args) {
  const { app, host, record, activate } = args, region = regionFor(app, "trace"), filter = region.getByRole("combobox", { name: "Trace event filter", exact: true });
  await edited(host, data => { const byId = new Map(data.events.map(event => [event.id, event])); data.events = ["output", "input", "progress", "error", "note"].map(id => byId.get(id)); }, activate);
  const structured = await openJSON(region, "Event details", { records: [], next: null }, activate);
  await activate(region.getByRole("button", { name: "Inspect event", exact: true })); await jsonIs(intentFor(app), { type: "inspect-trace-event", data: { id: "trace-1", eventId: "output", kind: "output" } });
  record("trace_order_parent_and_json_inspection", { proof: await snapshot(region, app, host), structured });
  const filterFocus = await filtered(filter, "input"); await jsonIs(intentFor(app), { type: "change-trace-filter", data: { id: "trace-1", kind: "input" } });
  await expect(region.getByRole("button", { name: "Inspect event", exact: true })).toBeDisabled(); await expect(region.getByText("The selected event is hidden by the current filter. Its details are concealed.", { exact: true })).toBeVisible();
  const hidden = await snapshot(region, app, host); const inputFocus = await selected(region.getByRole("radio", { name: "Select event: Authored input", exact: true }), activate);
  await jsonIs(intentFor(app), { type: "select-trace-event", data: { id: "trace-1", eventId: "input" } });
  await activate(region.getByRole("button", { name: "Inspect event", exact: true })); await jsonIs(intentFor(app), { type: "inspect-trace-event", data: { id: "trace-1", eventId: "input", kind: "input" } });
  record("trace_controlled_filter_selection_and_focus", { proof: await snapshot(region, app, host), hidden, filterFocus, inputFocus });
  await filtered(filter, "all"); const values = [];
  for (const [label, value] of [["Authored progress", false], ["Authored note", ""]]) {
    const focus = await selected(region.getByRole("radio", { name: "Select event: " + label, exact: true }), activate);
    const raw = await openJSON(region, "Event details", value, activate); values.push({ value, raw, focus, proof: await snapshot(region, app, host) });
  }
  record("trace_false_and_empty_details_are_supplied", { proof: await snapshot(region, app, host), values });
  record("trace_cycle_refused", await invalidRefusal({ ...args, region }, data => { data.events.find(event => event.id === "input").parentId = "output"; }));
  await edited(host, data => { data.events = []; delete data.selectedEventId; data.filterKind = "all"; }, activate); await expect(region.getByText("No trace events were supplied.", { exact: true })).toBeVisible();
  record("trace_empty_state_is_explicit", { proof: await snapshot(region, app, host) });
  await edited(host, data => { data.events = [{ id: "restored", label: "Restored event", kind: "note", details: null }]; data.selectedEventId = "restored"; }, activate);
  record("trace_disabled_refused", await disabledRefusal({ ...args, region }));
}

async function count(page, label) { const text = await rawText(page.getByLabel(label, { exact: true })); assert.match(text, /^\d+$/); const value = Number(text); assert.ok(Number.isSafeInteger(value)); return value; }
async function counters(page) { return { intents: await count(page, "Tool workflow intent count"), settled: await count(page, "Settled callback count") }; }
async function docNavigation(page, url, observer, report, deadline) {
  await observer.settle(); const response = await within(() => page.goto(url, { waitUntil: "load", timeout: 10000 }), deadline, "supplementary_navigation_deadline"); assert.ok(response); assert.equal(response.status(), 200);
  const request = response.request(), row = observer.rows.get(request); assert.ok(row && request.isNavigationRequest() && request.frame() === page.mainFrame()); assert.equal(request.url(), url);
  await observer.settle(); assert.equal(row.terminal, "finished"); assert.equal(row.responseFinished, "null");
  (report.additionalNavigations ??= []).push({ url, requestOrdinal: row.ordinal, status: response.status(), exactRequestIdentity: true, requestFinished: row.terminal, responseFinished: row.responseFinished }); assert.equal(page.frames().length, 1);
}
const detailFor = (region, label) => region.locator(`section[aria-label="${label}"]`);
async function noCallbackError(region) { assert.deepEqual((await nativeDOM(region)).feedbackErrors, []); }
async function duplicateWhilePending(args, button, expectedCount) {
  await expect(button).toBeDisabled(); await args.activate(button, true); await args.page.keyboard.press("Enter"); args.report.input.keyboardActions++;
  assert.equal(await count(args.page, "Tool workflow intent count"), expectedCount);
}
async function pendingAppend(args, { region, detailLabel, buttonLabel, appendLabel, expectedIntent, expectedCounters }) {
  const { page, activate } = args, detail = detailFor(region, detailLabel), button = detail.getByRole("button", { name: buttonLabel, exact: true });
  await activate(button); await expect(detail).toHaveAttribute("aria-busy", "true"); await jsonIs(intentFor(page, true), expectedIntent);
  assert.deepEqual(await counters(page), expectedCounters); const pending = await snapshot(region, page, null, true), oldDetail = await detail.elementHandle(); assert.ok(oldDetail);
  try {
    await activate(page.getByRole("button", { name: appendLabel, exact: true }));
    const appendedLabel = { "Append unrelated part": "Select part: Additional authored part", "Append unrelated step": "Select step: Additional authored step" }[appendLabel];
    assert.ok(appendedLabel); await expect(region.getByRole("radio", { name: appendedLabel, exact: true })).toBeVisible();
    const sameDetailNode = await detail.evaluate((node, previous) => node === previous, oldDetail); assert.equal(sameDetailNode, true); await expect(detail).toHaveAttribute("aria-busy", "true"); await expect(button).toBeDisabled();
    assert.deepEqual(await counters(page), expectedCounters); const appended = await snapshot(region, page, null, true);
    await duplicateWhilePending(args, button, expectedCounters.intents);
    await expect.poll(() => count(page, "Settled callback count")).toBe(expectedCounters.settled + 1); await expect(button).toBeEnabled(); await expect(detail).toHaveAttribute("aria-busy", "false");
    await noCallbackError(region); return { proof: await snapshot(region, page, null, true), pending, appended, sameDetailNode, nativeDuplicateAttempt: true, beforeCounters: expectedCounters, afterCounters: await counters(page) };
  } finally { await oldDetail.dispose(); }
}
async function sameRootReplacement(args, { region, detailLabel, buttonLabel, replacementLabel, radioLabel, newRadioLabel = radioLabel, expectedIntent, beforeCounters, replacementJSONLabel, expectedNewIntent }) {
  const { page, activate } = args, detail = detailFor(region, detailLabel), button = detail.getByRole("button", { name: buttonLabel, exact: true });
  await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("reject"); await activate(button);
  await expect(detail).toHaveAttribute("aria-busy", "true"); await jsonIs(intentFor(page, true), expectedIntent);
  assert.deepEqual(await counters(page), { intents: beforeCounters.intents + 1, settled: beforeCounters.settled });
  const oldPending = await snapshot(region, page, null, true), oldDetail = await detail.elementHandle(), oldRadio = await region.getByRole("radio", { name: radioLabel, exact: true }).elementHandle(); assert.ok(oldDetail && oldRadio);
  try {
    await activate(page.getByRole("button", { name: replacementLabel, exact: true }));
    await expect.poll(() => oldDetail.evaluate(node => node.isConnected)).toBe(false);
    const sameSelectionNode = await region.getByRole("radio", { name: newRadioLabel, exact: true }).evaluate((node, previous) => node === previous, oldRadio); assert.equal(sameSelectionNode, true);
    await expect(detail).toHaveAttribute("aria-busy", "false"); await expect(button).toBeEnabled(); await noCallbackError(region);
    await jsonIs(intentFor(page, true), expectedIntent); assert.deepEqual(await counters(page), { intents: beforeCounters.intents + 1, settled: beforeCounters.settled });
    const replacementBeforeSettlement = await snapshot(region, page, null, true);
    await expect.poll(() => count(page, "Settled callback count")).toBe(beforeCounters.settled + 1); await noCallbackError(region); await expect(button).toBeEnabled();
    await jsonIs(intentFor(page, true), expectedIntent); const settled = await snapshot(region, page, null, true);
    if (replacementJSONLabel) await openJSON(region, replacementJSONLabel, { replacement: true }, activate);
    await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("immediate"); await activate(button); await jsonIs(intentFor(page, true), expectedNewIntent);
    assert.deepEqual(await counters(page), { intents: beforeCounters.intents + 2, settled: beforeCounters.settled + 1 });
    return { proof: await snapshot(region, page, null, true), oldPending, replacementBeforeSettlement, settled, beforeCounters, afterCounters: await counters(page), oldDetailNodeDetached: true, sameSelectionNode, positiveOldCallbackSettlement: true };
  } finally { await oldDetail.dispose(); await oldRadio.dispose(); }
}
async function callbacksJourney(args) {
  const { page, activate, record, report, observer, deadline } = args;
  let region = regionFor(page, "callbacks"), detail = detailFor(region, "Selected trace event");
  const traceIntent = { type: "inspect-trace-event", data: { id: "docs-trace-1", eventId: "output", kind: "output" } };
  assert.deepEqual(await counters(page), { intents: 0, settled: 0 }); await jsonIs(intentFor(page, true), null);
  await activate(detail.getByRole("button", { name: "Inspect event", exact: true })); await jsonIs(intentFor(page, true), traceIntent);
  assert.deepEqual(await counters(page), { intents: 1, settled: 0 }); record("callbacks_trace_immediate", { proof: await snapshot(region, page, null, true), counters: await counters(page) });
  await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("reject");
  const traceButton = detail.getByRole("button", { name: "Inspect event", exact: true }); await activate(traceButton); await expect(detail).toHaveAttribute("aria-busy", "true");
  const pending = await snapshot(region, page, null, true), oldDetail = await detail.elementHandle(); assert.ok(oldDetail);
  let sameDetailNode;
  try {
    await activate(page.getByRole("button", { name: "Append unrelated event", exact: true }));
    await expect(region.getByRole("radio", { name: "Select event: Additional authored event", exact: true })).toBeVisible();
    sameDetailNode = await detail.evaluate((node, previous) => node === previous, oldDetail); assert.equal(sameDetailNode, true); await expect(detail).toHaveAttribute("aria-busy", "true");
    const appended = await snapshot(region, page, null, true); await duplicateWhilePending(args, traceButton, 2);
    await expect.poll(() => count(page, "Settled callback count")).toBe(1); await expect(detail.getByRole("alert")).toHaveText(callbackError); await expect(traceButton).toBeEnabled();
    const rejected = await snapshot(region, page, null, true), rejectionText = original(await rawText(detail.getByRole("alert")));
    await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("immediate"); await activate(traceButton); await noCallbackError(region); await jsonIs(intentFor(page, true), traceIntent);
    assert.deepEqual(await counters(page), { intents: 3, settled: 1 });
    record("callbacks_trace_pending_append_and_recovery", { proof: await snapshot(region, page, null, true), pending, appended, rejected, rejectionText, sameDetailNode, nativeDuplicateAttempt: true, afterCounters: await counters(page) });
  } finally { await oldDetail.dispose(); }
  record("callbacks_trace_same_root_replacement", await sameRootReplacement(args, { region, detailLabel: "Selected trace event", buttonLabel: "Inspect event", replacementLabel: "Replace selected event", radioLabel: "Select event: Authored output", newRadioLabel: "Select event: Replacement authored event",
    expectedIntent: traceIntent, beforeCounters: { intents: 3, settled: 1 }, replacementJSONLabel: "Event details", expectedNewIntent: traceIntent }));

  await docNavigation(page, origins.docs + "/components/partial-result-viewer", observer, report, deadline);
  region = page.getByRole("region", { name: "Review reported result parts", exact: true }); await expect(region).toBeVisible();
  const partFocus = await selected(region.getByRole("radio", { name: "Select part: Authored details", exact: true }), activate);
  await jsonIs(intentFor(page, true), { type: "select-result-part", data: { id: "docs-parts-1", partId: "details" } });
  const partIntent = { type: "retry-result-part", data: { id: "docs-parts-1", partId: "details", attempt: 2 } };
  await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("delayed");
  record("callbacks_part_pending_append", { ...await pendingAppend(args, { region, detailLabel: "Selected result part", buttonLabel: "Request part retry", appendLabel: "Append unrelated part", expectedIntent: partIntent, expectedCounters: { intents: 2, settled: 0 } }), partFocus });
  record("callbacks_part_same_root_replacement", await sameRootReplacement(args, { region, detailLabel: "Selected result part", buttonLabel: "Request part retry", replacementLabel: "Replace selected part", radioLabel: "Select part: Authored details",
    expectedIntent: partIntent, beforeCounters: { intents: 2, settled: 1 }, replacementJSONLabel: "Incomplete part value", expectedNewIntent: { type: "retry-result-part", data: { id: "docs-parts-1", partId: "details", attempt: 3 } } }));

  await docNavigation(page, origins.docs + "/components/queued-step-list", observer, report, deadline);
  region = page.getByRole("region", { name: "Review reported queued steps", exact: true }); await expect(region).toBeVisible();
  const stepIntent = { type: "retry-queued-step", data: { id: "docs-queue-1", stepId: "review", attempt: 2 } };
  await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("delayed");
  record("callbacks_queue_pending_append", await pendingAppend(args, { region, detailLabel: "Selected queued step", buttonLabel: "Request step retry", appendLabel: "Append unrelated step", expectedIntent: stepIntent, expectedCounters: { intents: 1, settled: 0 } }));
  record("callbacks_queue_same_root_replacement", await sameRootReplacement(args, { region, detailLabel: "Selected queued step", buttonLabel: "Request step retry", replacementLabel: "Replace selected step", radioLabel: "Select step: Review authored output",
    expectedIntent: stepIntent, beforeCounters: { intents: 1, settled: 1 }, expectedNewIntent: { type: "retry-queued-step", data: { id: "docs-queue-1", stepId: "review", attempt: 3 } } }));

  await docNavigation(page, origins.docs + "/components/running-task-card", observer, report, deadline);
  region = page.getByRole("region", { name: "Review reported task progress", exact: true }); await expect(region).toBeVisible(); const inspect = region.getByRole("button", { name: "Inspect task", exact: true });
  await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("delayed"); await activate(inspect); await expect(region).toHaveAttribute("aria-busy", "true");
  const taskPending = await snapshot(region, page, null, true), oldTask = await region.elementHandle(); assert.ok(oldTask);
  try {
    await activate(page.getByRole("button", { name: "Advance task progress", exact: true })); await expect(region.getByText("3 of 3 reported steps", { exact: true })).toBeVisible();
    const sameTaskNode = await region.evaluate((node, previous) => node === previous, oldTask); assert.equal(sameTaskNode, true); await expect(region).toHaveAttribute("aria-busy", "true");
    const advanced = await snapshot(region, page, null, true); await duplicateWhilePending(args, inspect, 1);
    await expect.poll(() => count(page, "Settled callback count")).toBe(1); await expect(inspect).toBeEnabled(); await noCallbackError(region);
    await jsonIs(intentFor(page, true), { type: "inspect-task", data: { id: "docs-task-1" } }); assert.deepEqual(await counters(page), { intents: 1, settled: 1 });
    record("callbacks_task_progress_preserves_pending", { proof: await snapshot(region, page, null, true), pending: taskPending, advanced, sameTaskNode, nativeDuplicateAttempt: true, afterCounters: await counters(page) });
  } finally { await oldTask.dispose(); }
  await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("reject"); await activate(inspect); await expect(region).toHaveAttribute("aria-busy", "true");
  const oldPending = await snapshot(region, page, null, true), oldRegion = await region.elementHandle(); assert.ok(oldRegion);
  try {
    await activate(page.getByRole("button", { name: "Replace operation", exact: true })); await expect.poll(() => oldRegion.evaluate(node => node.isConnected)).toBe(false);
    await expect(inspect).toBeEnabled(); await expect(region).toHaveAttribute("aria-busy", "false"); assert.deepEqual(await counters(page), { intents: 0, settled: 1 }); await jsonIs(intentFor(page, true), null);
    const replacementBeforeSettlement = await snapshot(region, page, null, true);
    await expect.poll(() => count(page, "Settled callback count")).toBe(2); await noCallbackError(region); await jsonIs(intentFor(page, true), null);
    const settled = await snapshot(region, page, null, true); await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("immediate"); await activate(inspect);
    await jsonIs(intentFor(page, true), { type: "inspect-task", data: { id: "docs-task-1-replacement-2" } }); assert.deepEqual(await counters(page), { intents: 1, settled: 2 });
    record("callbacks_task_root_replacement", { proof: await snapshot(region, page, null, true), oldPending, replacementBeforeSettlement, settled, afterCounters: await counters(page), oldTaskNodeDetached: true, positiveOldCallbackSettlement: true });
  } finally { await oldRegion.dispose(); }
}

const CASES = [
  ["T01", "T01 desktop docs result JSON and outcome intent", "desktop", "result", "docs", resultJourney],
  ["T02", "T02 narrow docs result JSON and outcome intent", "narrow", "result", "docs", resultJourney],
  ["T03", "T03 desktop CLI dev reported running task", "desktop", "running", "cliDev", runningJourney],
  ["T04", "T04 narrow CLI dev reported running task", "narrow", "running", "cliDev", runningJourney],
  ["T05", "T05 desktop CLI preview partial result review", "desktop", "partial", "cliPreview", partialJourney],
  ["T06", "T06 narrow CLI preview partial result review", "narrow", "partial", "cliPreview", partialJourney],
  ["T07", "T07 desktop docs queued step review and retry intent", "desktop", "queue", "docs", queueJourney],
  ["T08", "T08 narrow docs queued step review and retry intent", "narrow", "queue", "docs", queueJourney],
  ["T09", "T09 desktop CLI dev controlled trace review", "desktop", "trace", "cliDev", traceJourney],
  ["T10", "T10 narrow CLI dev controlled trace review", "narrow", "trace", "cliDev", traceJourney],
  ["T11", "T11 desktop docs async updates and replacement fences", "desktop", "callbacks", "docs", callbacksJourney],
  ["T12", "T12 narrow docs async updates and replacement fences", "narrow", "callbacks", "docs", callbacksJourney]
];
assert.equal(CASES.length, 12); assert.equal(new Set(CASES.map(row => row[0])).size, 12);

async function runCase(browser, testInfo, [caseId, title, profile, scenario, originKey, journey]) {
  assert.equal(testInfo.retry, 0); assert.equal(browser.browserType().name(), "chromium"); testInfo.setTimeout(40000);
  const started = performance.now(), deadline = started + 36000, closeDeadline = started + 39000, origin = origins[originKey];
  const direct = scenario === "callbacks", route = direct ? "/components/tool-trace-viewer" : originKey === "docs" ? "/playground" : "/?component=tool-result-card";
  const jsonPath = path.join(output, caseId + ".json"), pngPath = path.join(output, caseId + ".png"); await absent(jsonPath); await absent(pngPath);
  const viewport = profile === "desktop" ? { width: 1280, height: 900 } : { width: 390, height: 844 };
  const report = { schemaVersion: 1, sourceCommit, caseId, title, profile, scenario, originKey, route, origin, playwright: packageManifest.version, browserVersion: browser.version(), startedAt: new Date().toISOString(), viewport, touchEmulated: profile === "narrow", status: "failed", observations: [],
    input: { trackedTaps: 0, trackedClicks: 0, keyboardActions: 0 }, wire: [], sdkSends: {}, displayMessages: [],
    console: { debugCount: 0, warningCount: 0, warnings: [], sdkSendPreviewCount: 0, responsePreviewCount: 0, unclassifiedSendCount: 0, unclassifiedSends: [] }, downloadEvents: 0, blobDownload: { rows: [], nativeDownloadJoined: null },
    network: { requests: 0, requestFailures: 0, consoleErrors: 0, pageErrors: 0, webSockets: 0, errorCount: 0, errors: [], rows: [] },
    cleanup: { contextCreated: false, contextClosed: false, pagesCreated: 0, pagesClosed: 0, pendingRequests: null, observerJobs: null, downloadArmRemaining: false },
    limits: { workMs: 36000, closeMs: 39000, nativeMs: 40000, reportBytes: 262144, screenshotBytes: 262144 },
    proofLimits: ["Trusted authored tool-workflow data only. No tool, queue, tracing, model or authorization runtime is started. Components do not run a task clock; authored consumer callbacks use fixed 1500ms timers solely to exercise asynchronous feedback.", "First ten cases use real official-SDK nested frames; last two use direct docs consumers to isolate selected-member and task revision fences from iframe remounts.", "Raw region DOM records current native control values, JSON disclosures, reported progress, child SECTION busy/alerts and lifetime callback counters. Producer alerts remain distinct from the exact consumer-callback error.", "Host editor payloads describe invocation data; local controlled selections and filters do not rewrite that editor. Intents carry identity/status/attempt only, never JSON result or trace values.", "Pinned SDK console classification is fatal on any unclassified send. No tools/context/message request, download, cookie or browser permission is allowed. Every ordinary request must be owned-origin GET and completely acknowledged.", "Chromium narrow touch is emulation, not physical-device or exhaustive accessibility/untrusted-HTML proof. Browser HTTP completion is not raw socket EOF or every-asset integrity; process teardown belongs to the supervisor."] };
  let context, page, observer, primary;
  const record = (stage, value) => { assert.ok(report.observations.length < 20); report.observations.push({ stage, atMs: performance.now() - started, ...value }); };
  try {
    context = await browser.newContext({ viewport, isMobile: profile === "narrow", hasTouch: profile === "narrow", locale: "en-US", timezoneId: "UTC", acceptDownloads: false, permissions: [] }); report.cleanup.contextCreated = true;
    context.setDefaultTimeout(3000); context.setDefaultNavigationTimeout(10000); observer = observe(context, report, started, deadline, origin); page = await context.newPage();
    const response = await within(() => page.goto(origin + route, { waitUntil: "load", timeout: 10000 }), deadline, "navigation_deadline"); assert.ok(response); assert.equal(response.status(), 200);
    const request = response.request(), navigation = observer.rows.get(request); assert.ok(navigation && request.isNavigationRequest() && request.frame() === page.mainFrame()); assert.equal(request.url(), origin + route);
    let host = null, app = page;
    if (direct) {
      await expect(regionFor(page, "callbacks")).toBeVisible(); assert.equal(page.frames().length, 1);
      report.frames = { outerPage: locationMeta(page.url()), hostUrl: null, appUrl: null, sessionFragmentSha256: null, hostRole: null, appRole: null, hostFrameCount: 0, appFrameCount: 0, actualFrameCount: 1 };
    } else {
      host = originKey === "docs" ? page.frameLocator('iframe[title="MCPCN host simulator"]') : page; app = await ready(host);
      await host.getByRole("combobox", { name: "Theme", exact: true }).selectOption(profile === "narrow" ? "dark" : "light");
      await host.getByRole("combobox", { name: "Viewport", exact: true }).selectOption(profile === "narrow" ? "390" : "760"); app = await choose(host, slugs[scenario]);
      await expect(app.locator("main.frame-app")).toHaveAttribute("data-theme", profile === "narrow" ? "dark" : "light");
      const appElement = host.locator('iframe[title="Rendered MCP app"]'), appSrc = await appElement.getAttribute("src"); assert.ok(appSrc);
      const appURL = new URL(appSrc, origin); assert.equal(appURL.origin, origin); assert.equal(appURL.pathname, originKey === "docs" ? "/playground-simulator/frame.html" : "/frame.html"); assert.ok(appURL.hash);
      const hostElement = originKey === "docs" ? page.locator('iframe[title="MCPCN host simulator"]') : null;
      const hostURL = hostElement ? new URL(await hostElement.getAttribute("src"), page.url()) : new URL(page.url());
      assert.equal(hostURL.origin, origin); assert.equal(hostURL.pathname, originKey === "docs" ? "/playground-simulator/index.html" : "/");
      report.frames = { outerPage: locationMeta(page.url()), hostUrl: locationMeta(hostURL.href), appUrl: locationMeta(appURL.href), sessionFragmentSha256: sha(appURL.hash), hostRole: hostElement ? await hostElement.getAttribute("title") : "direct CLI simulator", appRole: await appElement.getAttribute("title"), hostFrameCount: hostElement ? await hostElement.count() : 0, appFrameCount: await appElement.count(), actualFrameCount: page.frames().length };
      assert.equal(report.frames.appFrameCount, 1); assert.equal(report.frames.actualFrameCount, originKey === "docs" ? 3 : 2);
    }
    await observer.settle(); assert.equal(navigation.terminal, "finished"); assert.equal(navigation.responseFinished, "null");
    report.navigation = { requestOrdinal: navigation.ordinal, status: response.status(), exactRequestIdentity: true, requestFinished: navigation.terminal, responseFinished: navigation.responseFinished };
    report.observedViewport = await page.evaluate(() => ({ innerWidth, innerHeight, documentWidth: document.documentElement.scrollWidth, maxTouchPoints: navigator.maxTouchPoints }));
    assert.equal(report.observedViewport.innerWidth, viewport.width); assert.equal(report.observedViewport.innerHeight, viewport.height); assert.ok(report.observedViewport.documentWidth <= viewport.width + 1); assert.ok(profile === "narrow" ? report.observedViewport.maxTouchPoints > 0 : report.observedViewport.maxTouchPoints === 0);
    const activate = async (locator, force = false) => { if (profile === "narrow") { await locator.tap({ force }); report.input.trackedTaps++; } else { await locator.click({ force }); report.input.trackedClicks++; } };
    record(direct ? "actual_docs_component_ready" : "actual_nested_bridge_ready", { frames: report.frames, viewport: report.observedViewport, theme: direct ? null : profile === "narrow" ? "dark" : "light", proof: await snapshot(regionFor(app, scenario), app, host, direct) });
    await within(() => journey({ page, context, host, app, report, observer, record, activate, deadline, profile }), deadline, "journey_deadline");
    assert.ok(profile === "narrow" ? report.input.trackedTaps > 0 : report.input.trackedClicks > 0); await observer.settle(); report.cookieCount = (await context.cookies()).length; assert.equal(report.cookieCount, 0);
    assert.deepEqual(report.wire, []); for (const method of forbiddenMethods) assert.equal(report.sdkSends[method] ?? 0, 0);
    if (direct) assert.equal(Object.keys(report.sdkSends).length, 0); else for (const method of ["ui/initialize", "ui/notifications/initialized", "ui/notifications/tool-input", "ui/notifications/tool-result"]) assert.ok((report.sdkSends[method] ?? 0) > 0);
    assert.equal(report.downloadEvents, 0); assert.equal(report.network.requestFailures, 0); assert.equal(report.console.unclassifiedSendCount, 0);
    report.finalLocation = locationMeta(page.url());
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

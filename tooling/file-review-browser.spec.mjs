// Trusted file representation/review DOM and intent checks; no parser, upload or persistence.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";

const tools = process.env.MCPCN_FILES_BROWSER_TOOLS;
assert.ok(tools && path.isAbsolute(tools));
const { test, expect: playwrightExpect } = createRequire(path.join(tools, "package.json"))("playwright/test");
const expect = playwrightExpect.configure({ timeout: 3000 });
const packageManifest = JSON.parse(await readFile(path.join(tools, "package.json"), "utf8"));
assert.equal(packageManifest.name, "playwright"); assert.equal(packageManifest.version, "1.65.0");
const origins = Object.fromEntries([["docs", "MCPCN_FILES_ORIGIN", "4173"], ["cliDev", "MCPCN_FILES_CLI_DEV_ORIGIN", "4545"], ["cliPreview", "MCPCN_FILES_CLI_PREVIEW_ORIGIN", "4546"]].map(([key, name, port]) => {
  const url = new URL(process.env[name] ?? "");
  assert.equal(url.protocol, "http:"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, port);
  assert.equal(url.href, url.origin + "/"); assert.ok(!url.username && !url.password); return [key, url.origin];
}));
const output = process.env.MCPCN_FILES_BROWSER_OUTPUT, sourceCommit = process.env.SOURCE_COMMIT;
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

const labels = { text: "Inspect the authored document", pages: "Inspect the authored document", raster: "Inspect the authored document", review: "Review the authored file", stale: "Review the authored file", callbacks: "Review supplied file values" };
const slugs = { text: "document-preview", pages: "document-preview", raster: "document-preview", review: "file-review", stale: "file-review" };
const callbackError = "The action could not be completed. Try again.";
const regionFor = (app, scenario) => app.getByRole("region", { name: labels[scenario], exact: true });
const intentFor = (app, direct = false) => app.getByLabel(direct ? "Last file review intent" : "Last component intent", { exact: true });
async function nativeDOM(region) {
  return region.evaluate(element => {
    const nodes = [...element.querySelectorAll("input,button,textarea,select")];
    const texts = (root, selector) => [...root.querySelectorAll(selector)].map(node => node.textContent);
    const alerts = texts(element, '[role="alert"]');
    return {
      outerHTML: element.outerHTML, textContent: element.textContent,
      data: { tag: element.tagName, ariaLabel: element.getAttribute("aria-label"), ariaBusy: element.getAttribute("aria-busy"), role: element.getAttribute("role") },
      controls: nodes.map((control, index) => ({ index, tag: control.tagName, type: "type" in control ? control.type : control.tagName.toLowerCase(), id: control.id, name: control.getAttribute("name") ?? "",
        label: control.getAttribute("aria-label") ?? [...(control.labels ?? [])].map(label => label.textContent).join(" "), value: "value" in control ? control.value : null,
        checked: control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type) ? control.checked : null,
        constraints: { min: control.getAttribute("min"), max: control.getAttribute("max"), minLength: control.getAttribute("minlength"), maxLength: control.getAttribute("maxlength"), step: control.getAttribute("step"), badInput: "validity" in control ? control.validity.badInput : false }, disabled: control.matches(":disabled"), required: "required" in control ? control.required : false, focused: control === document.activeElement, text: control instanceof HTMLButtonElement ? control.textContent : null,
        options: control instanceof HTMLSelectElement ? [...control.options].map(option => ({ value: option.value, label: option.label, selected: option.selected, disabled: option.disabled })) : null,
      })),
      details: [...element.querySelectorAll("details")].map(node => ({ summary: node.querySelector("summary")?.textContent ?? null, open: node.open, textContent: node.textContent, preText: node.querySelector("pre")?.textContent ?? null })),
      images: [...element.querySelectorAll("img")].map(image => ({ alt: image.alt, complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, width: image.width, height: image.height, sourceProtocol: image.src.split(":")[0], style: image.getAttribute("style") })),
      progress: [...element.querySelectorAll("progress")].map(node => ({ label: node.getAttribute("aria-label"), value: node.value, max: node.max, position: node.position, rawValue: node.getAttribute("value"), rawMax: node.getAttribute("max"), ariaValueText: node.getAttribute("aria-valuetext") })),
      sections: [...element.querySelectorAll("section[aria-label]")].map(section => ({ label: section.getAttribute("aria-label"), ariaBusy: section.getAttribute("aria-busy"), outerHTML: section.outerHTML, textContent: section.textContent,
        alerts: texts(section, '[role="alert"]'), statuses: texts(section, '[role="status"]'), controlIndices: [...section.querySelectorAll("input,button,textarea,select")].map(node => nodes.indexOf(node)) })),
      alerts, feedbackErrors: alerts.filter(value => value === "The action could not be completed. Try again."),
      callbackCounters: document.querySelector('output[aria-label="File review intent count"]') ? {
        intents: document.querySelector('output[aria-label="File review intent count"]')?.textContent ?? null,
        settled: document.querySelector('output[aria-label="Settled callback count"]')?.textContent ?? null,
      } : null,
      focus: { ariaLabel: document.activeElement?.getAttribute("aria-label") ?? null, textContent: element.contains(document.activeElement) ? document.activeElement?.textContent ?? null : null, tag: document.activeElement?.tagName ?? null, id: document.activeElement?.id ?? null, inRegion: element.contains(document.activeElement), documentHasFocus: document.hasFocus() },
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

async function count(page, label) { const text = await rawText(page.getByLabel(label, { exact: true })); assert.match(text, /^\d+$/); const value = Number(text); assert.ok(Number.isSafeInteger(value)); return value; }
async function counters(page) { return { intents: await count(page, "File review intent count"), settled: await count(page, "Settled callback count") }; }
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
  assert.equal(await count(args.page, "File review intent count"), expectedCount);
}

async function put(args, region, label, value) {
  const control = region.getByLabel(label, { exact: true }); await control.fill(value); await expect(control).toHaveValue(value);
  args.report.input.localEdits = (args.report.input.localEdits ?? 0) + 1;
}
async function inputValues(region, values) {
  for (const [label, value] of Object.entries(values)) await expect(region.getByLabel(label, { exact: true })).toHaveValue(value);
  return Object.fromEntries(await Promise.all(Object.keys(values).map(async label => [label, await region.getByLabel(label, { exact: true }).inputValue()])));
}
async function validationError(region, fields) {
  const summary = region.getByRole("alert", { name: "Form validation errors", exact: true }); await expect(summary).toBeFocused();
  for (const label of fields) await expect(summary).toContainText(label + ":");
  return original(await rawText(summary));
}

const raster = { mimeType: "image/png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQVDL+DwACFAFmBODefwAAAABJRU5ErkJggg==", width: 1, height: 1, alt: "Authored one-pixel colour representation" };
const fileScope = { fileId: "authored-file-1", fileRevision: "1" };
const previewScope = { previewId: "authored-preview-1", ...fileScope };
const reviewScope = { reviewId: "authored-review-1", ...fileScope, extractionId: "authored-extraction-1", extractionRevision: "1" };
const values = { supplier: "Reviewed supplier", total: "EUR 48.20" };
const saveFor = region => region.getByRole("button", { name: "Save reviewed fields", exact: true });
const consentFor = region => region.getByRole("checkbox", { name: "I confirm these reviewed file values.", exact: true });
const contentFor = region => region.getByRole("region", { name: "Document content", exact: true });
function asContent(data, content) {
  data.state = "ready"; data.content = content;
  delete data.sources; delete data.selectedPageId; delete data.selectedSourceId; delete data.message;
}
async function textJourney(args) {
  const { host, app, activate, record } = args, region = regionFor(app, "text");
  const text = "First authored line\n<svg onload=never()>literal markup</svg>\n" + "LongAuthoredWord".repeat(70) + "\nFinal authored line is complete.";
  await edited(host, data => asContent(data, { type: "text", text }), activate);
  await expect(contentFor(region)).toHaveText(text); assert.equal(await region.locator("svg,script,object,iframe").count(), 0);
  const viewport = await contentFor(region).evaluate(node => ({ width: node.getBoundingClientRect().width, parent: node.parentElement.getBoundingClientRect().width, scroll: node.scrollWidth }));
  assert.ok(viewport.width <= viewport.parent + 1);
  record("complete_escaped_text", { proof: await snapshot(region, app, host), expectedText: original(text), viewport, noMarkupExecution: true });
  const variants = [];
  for (const value of [{ first: false, zero: 0, empty: "", nested: { lines: [null, { final: "Complete nested tail" }] } }, null, false, 0, ""]) {
    await edited(host, data => asContent(data, { type: "json", value }), activate);
    const raw = await openJSON(region, "Document JSON", value, activate);
    variants.push({ value, raw, proof: await snapshot(region, app, host) });
  }
  record("complete_json_and_falsy_values", { proof: await snapshot(region, app, host), variants });
  record("strict_preview_refusal", await invalidRefusal({ ...args, region }, data => { data.content = { type: "html", html: "<script>never()</script>" }; }));
}
async function pagesJourney(args) {
  const { app, host, activate, record } = args, region = regionFor(app, "pages");
  const pageSelect = region.getByRole("combobox", { name: "Document page", exact: true });
  const focus = await filtered(pageSelect, "page-2");
  await jsonIs(intentFor(app), { type: "document-page-change", data: { ...previewScope, pageId: "page-2" } });
  await expect(contentFor(region)).toContainText("Final authored line."); await expect(region.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  record("controlled_page_navigation", { proof: await snapshot(region, app, host), focus });
  await activate(region.getByRole("button", { name: "Previous page", exact: true }));
  await expect(pageSelect).toHaveValue("page-1");
  const source = region.getByRole("button", { name: "Select source: Payment terms source", exact: true });
  await activate(source); await expect(source).toHaveAttribute("aria-pressed", "true"); await expect(pageSelect).toHaveValue("page-2");
  await jsonIs(intentFor(app), { type: "document-source-change", data: { ...previewScope, sourceId: "terms-source", pageId: "page-2" } });
  record("source_selects_current_page", { proof: await snapshot(region, app, host), noContentInIntent: true });
  record("foreign_page_refused", await invalidRefusal({ ...args, region }, data => { data.selectedPageId = "foreign-page"; }));
}
async function rasterJourney(args) {
  const { app, host, activate, record } = args, region = regionFor(app, "raster");
  await edited(host, data => asContent(data, { type: "pages", pages: [
    { id: "raster-1", label: "First raster", text: "Full authored raster transcription.", image: raster },
    { id: "raster-2", label: "Second raster", text: "Second complete transcription.", image: { ...raster, alt: "Second authored raster" } },
  ] }), activate);
  await expect(region.locator("img")).toHaveCount(1);
  await expect.poll(() => region.locator("img").evaluate(image => ({ complete: image.complete, width: image.naturalWidth, height: image.naturalHeight }))).toEqual({ complete: true, width: 1, height: 1 });
  await activate(region.getByRole("button", { name: "Actual size", exact: true }));
  await expect(region.getByLabel("Document zoom", { exact: true })).toHaveText("100%");
  await activate(region.getByRole("button", { name: "Zoom in", exact: true }));
  const zoomed = await rawText(region.getByLabel("Document zoom", { exact: true })); assert.notEqual(zoomed, "100%"); assert.match(zoomed, /^\d+%$/);
  await activate(region.getByRole("button", { name: "Fit page", exact: true })); await expect(region.getByLabel("Document zoom", { exact: true })).toHaveText("Fit");
  record("decoded_raster_and_zoom", { proof: await snapshot(region, app, host), decoded: { width: 1, height: 1 }, zoomed });
  await activate(region.getByRole("button", { name: "Next page", exact: true }));
  await expect(region.locator("img")).toHaveCount(1); await expect(region.locator("img")).toHaveAttribute("alt", "Second authored raster");
  await expect(contentFor(region)).toContainText("Second complete transcription.");
  record("only_selected_raster_mounted", { proof: await snapshot(region, app, host) });
  const states = [];
  for (const state of ["loading", "empty", "error", "unsupported"]) {
    const message = `Authored ${state} representation.`;
    await edited(host, data => { data.state = state; data.message = message; delete data.content; delete data.sources; delete data.selectedPageId; delete data.selectedSourceId; }, activate);
    await expect(region).toContainText(message); await expect(region.locator("img")).toHaveCount(0);
    states.push({ state, message, proof: await snapshot(region, app, host) });
  }
  record("explicit_preview_states", { proof: await snapshot(region, app, host), states });
  record("malformed_raster_refused", await invalidRefusal({ ...args, region }, data => asContent(data, { type: "pages", pages: [{ id: "bad", label: "Bad declared size", image: { ...raster, width: 2 } }] })));
}
async function confirmReview(args, region) {
  await args.activate(region.getByRole("button", { name: "Review current corrections", exact: true }));
  const consent = consentFor(region); await expect(consent).not.toBeChecked(); await args.activate(consent); await expect(consent).toBeChecked(); await expect(saveFor(region)).toBeEnabled();
}
async function reviewJourney(args) {
  const { app, host, activate, record } = args, region = regionFor(app, "review"), correction = region.getByRole("textbox", { name: "Correct Supplier", exact: true });
  await expect(saveFor(region)).toBeDisabled();
  await correction.fill(""); await expect(region.getByRole("button", { name: "Review current corrections", exact: true })).toBeDisabled();
  await jsonIs(intentFor(app), { type: "file-correction-change", data: { ...reviewScope, fieldId: "supplier", value: "" } });
  const before = await correction.elementHandle(); assert.ok(before);
  let sameNode;
  try { await correction.fill(values.supplier); await expect(correction).toBeFocused(); sameNode = await correction.evaluate((node, old) => node === old, before); assert.equal(sameNode, true); } finally { await before.dispose(); }
  await jsonIs(intentFor(app), { type: "file-correction-change", data: { ...reviewScope, fieldId: "supplier", value: values.supplier } });
  record("controlled_scoped_correction", { proof: await snapshot(region, app, host), sameInputNode: sameNode, requiredBlankRefused: true });
  await confirmReview(args, region); await activate(saveFor(region));
  await jsonIs(intentFor(app), { type: "save-file-review", data: { ...reviewScope, values } });
  await expect(region.getByText("Saved successfully", { exact: true })).toHaveCount(0);
  record("review_consent_and_scoped_save", { proof: await snapshot(region, app, host), expectedValues: values, noSavedResultInvented: true });
  await activate(region.getByRole("button", { name: "Next page", exact: true })); await expect(consentFor(region)).toBeChecked();
  await correction.fill("A new correction"); await expect(saveFor(region)).toBeDisabled();
  const consent = consentFor(region); if (await consent.count()) await expect(consent).not.toBeChecked();
  record("view_preserves_but_value_invalidates_consent", { proof: await snapshot(region, app, host) });
  record("unknown_field_refused", await invalidRefusal({ ...args, region }, data => { data.extraction.fields[0].extra = "unreviewed"; }));
}
async function staleJourney(args) {
  const { app, host, activate, record } = args, region = regionFor(app, "stale");
  await edited(host, data => { data.extraction.fileRevision = "old"; data.extraction.fields[0].original = "FOREIGN EXTRACTION SECRET"; data.extraction.fields[0].value = "FOREIGN EXTRACTION SECRET"; }, activate);
  await expect(region.getByRole("textbox", { name: "Correct Supplier", exact: true })).toHaveCount(0); await expect(region).not.toContainText("FOREIGN EXTRACTION SECRET"); await expect(saveFor(region)).toBeDisabled();
  record("foreign_extraction_hidden", { proof: await snapshot(region, app, host) });
  await edited(host, data => { data.extraction.fileRevision = data.file.revision; data.extraction.fields[0].original = "Acme Labs"; data.extraction.fields[0].value = "Acme Labs"; data.preview.file = { ...data.preview.file, name: "Other reported file.txt" }; data.preview.content = { type: "text", text: "FOREIGN PREVIEW SECRET" }; delete data.preview.sources; delete data.preview.selectedPageId; }, activate);
  await expect(region).not.toContainText("FOREIGN PREVIEW SECRET"); await expect(saveFor(region)).toBeDisabled();
  record("foreign_preview_hidden", { proof: await snapshot(region, app, host) });
  const states = [];
  for (const state of ["missing-preview", "empty-extraction", "loading-preview", "no-file"]) {
    await edited(host, data => {
      if (state === "missing-preview") delete data.preview;
      if (state === "empty-extraction") data.extraction.fields = [];
      if (state === "loading-preview") data.preview = { id: "loading-current", title: "Current supplied document", file: data.file, state: "loading", message: "Authored current preview is loading." };
      if (state === "no-file") { data.file = null; delete data.preview; delete data.extraction; }
    }, activate);
    if (state === "no-file") await expect(saveFor(region)).toHaveCount(0);
    else await expect(saveFor(region)).toBeDisabled();
    states.push({ state, proof: await snapshot(region, app, host) });
  }
  record("non_saveable_file_states", { proof: await snapshot(region, app, host), states });
  record("null_file_with_foreign_content_refused", await invalidRefusal({ ...args, region }, data => { data.preview = { id: "foreign", title: "Foreign", file: { id: "other", revision: "1", name: "Other.txt", bytes: 0 }, state: "empty" }; }));
}
async function waitSettled(page, expected) { await expect.poll(() => count(page, "Settled callback count")).toBe(expected); }
async function callbackJourney(args) {
  const { page, activate, record, report } = args, region = regionFor(page, "callbacks"), correction = region.getByRole("textbox", { name: "Correct Supplier", exact: true });
  const response = page.getByRole("combobox", { name: "Consumer response", exact: true });
  await response.selectOption("reject"); await correction.fill(values.supplier); await confirmReview(args, region);
  const initial = await counters(page); await activate(saveFor(region)); const pending = await snapshot(region, page, null, true);
  await expect(saveFor(region)).toBeDisabled(); await activate(saveFor(region), true); await page.keyboard.press("Enter"); report.input.keyboardActions++;
  assert.equal(await count(page, "File review intent count"), initial.intents + 1);
  await waitSettled(page, initial.settled + 1); await expect(region.getByText(callbackError, { exact: true })).toBeVisible(); await expect(correction).toHaveValue(values.supplier);
  record("rejection_preserves_corrections_and_suppresses_duplicate", { proof: await snapshot(region, page, null, true), pending, beforeCounters: initial, afterCounters: await counters(page) });
  await response.selectOption("immediate"); await activate(saveFor(region)); await expect(region.getByText(callbackError, { exact: true })).toHaveCount(0);
  const retried = await json(intentFor(page, true)); assert.equal(retried.type, "save-file-review"); assert.deepEqual(retried.data.values, values);
  record("explicit_retry_without_saved_claim", { proof: await snapshot(region, page, null, true), expectedValues: values });
  await activate(region.getByRole("button", { name: "Next page", exact: true }));
  await activate(page.getByRole("button", { name: "Append unrelated page", exact: true }));
  await expect(region.getByRole("combobox", { name: "Document page", exact: true })).toHaveValue("page-2"); await expect(correction).toHaveValue(values.supplier); await expect(saveFor(region)).toBeDisabled();
  record("unrelated_append_preserves_view_and_controlled_values", { proof: await snapshot(region, page, null, true), consentInvalidatedForChangedRepresentation: true });
  for (const kind of ["file", "extraction"]) {
    await confirmReview(args, region); await response.selectOption("reject");
    const before = await counters(page); await activate(saveFor(region)); await expect(saveFor(region)).toBeDisabled();
    const oldPending = await snapshot(region, page, null, true);
    await activate(page.getByRole("button", { name: kind === "file" ? "Replace file revision" : "Replace extraction revision", exact: true }));
    await expect(correction).toHaveValue("Acme Labs"); await expect(saveFor(region)).toBeDisabled();
    const replaced = await snapshot(region, page, null, true); await waitSettled(page, before.settled + 1);
    await expect(region.getByText(callbackError, { exact: true })).toHaveCount(0); await expect(saveFor(region)).toBeDisabled();
    record(kind === "file" ? "old_file_callback_fenced" : "old_extraction_callback_fenced", { proof: await snapshot(region, page, null, true), oldPending, replaced, beforeCounters: before, afterCounters: await counters(page), positiveOldCallbackSettlement: true });
    await correction.fill(values.supplier);
  }
  await response.selectOption("immediate"); await confirmReview(args, region); await activate(saveFor(region));
  const current = await json(intentFor(page, true)); assert.equal(current.type, "save-file-review"); assert.equal(current.data.fileRevision, "2"); assert.equal(current.data.extractionRevision, "2-replacement"); assert.deepEqual(current.data.values, values);
  record("replacement_scope_can_submit_explicitly", { proof: await snapshot(region, page, null, true), currentScope: current.data });
}

const CASES = [
  ["F01", "F01 desktop docs complete text and JSON", "desktop", "text", "docs", textJourney],
  ["F02", "F02 narrow docs complete text and JSON", "narrow", "text", "docs", textJourney],
  ["F03", "F03 desktop CLI dev controlled pages and sources", "desktop", "pages", "cliDev", pagesJourney],
  ["F04", "F04 narrow CLI dev controlled pages and sources", "narrow", "pages", "cliDev", pagesJourney],
  ["F05", "F05 desktop CLI preview raster inspection and states", "desktop", "raster", "cliPreview", rasterJourney],
  ["F06", "F06 narrow CLI preview raster inspection and states", "narrow", "raster", "cliPreview", rasterJourney],
  ["F07", "F07 desktop docs corrections and explicit save intent", "desktop", "review", "docs", reviewJourney],
  ["F08", "F08 narrow docs corrections and explicit save intent", "narrow", "review", "docs", reviewJourney],
  ["F09", "F09 desktop CLI dev stale and absent file review", "desktop", "stale", "cliDev", staleJourney],
  ["F10", "F10 narrow CLI dev stale and absent file review", "narrow", "stale", "cliDev", staleJourney],
  ["F11", "F11 desktop docs callback and revision fences", "desktop", "callbacks", "docs", callbackJourney],
  ["F12", "F12 narrow docs callback and revision fences", "narrow", "callbacks", "docs", callbackJourney],
];

async function runCase(browser, testInfo, [caseId, title, profile, scenario, originKey, journey]) {
  assert.equal(testInfo.retry, 0); assert.equal(browser.browserType().name(), "chromium"); testInfo.setTimeout(40000);
  const started = performance.now(), deadline = started + 36000, closeDeadline = started + 39000, origin = origins[originKey];
  const direct = scenario === "callbacks", route = direct ? "/components/file-review" : originKey === "docs" ? "/playground" : "/?component=document-preview";
  const jsonPath = path.join(output, caseId + ".json"), pngPath = path.join(output, caseId + ".png"); await absent(jsonPath); await absent(pngPath);
  const viewport = profile === "desktop" ? { width: 1280, height: 900 } : { width: 390, height: 844 };
  const report = { schemaVersion: 1, sourceCommit, caseId, title, profile, scenario, originKey, route, origin, playwright: packageManifest.version, browserVersion: browser.version(), startedAt: new Date().toISOString(), viewport, touchEmulated: profile === "narrow", status: "failed", observations: [],
    input: { trackedTaps: 0, trackedClicks: 0, keyboardActions: 0 }, wire: [], sdkSends: {}, displayMessages: [],
    console: { debugCount: 0, warningCount: 0, warnings: [], sdkSendPreviewCount: 0, responsePreviewCount: 0, unclassifiedSendCount: 0, unclassifiedSends: [] }, downloadEvents: 0, blobDownload: { rows: [], nativeDownloadJoined: null },
    network: { requests: 0, requestFailures: 0, consoleErrors: 0, pageErrors: 0, webSockets: 0, errorCount: 0, errors: [], rows: [] },
    cleanup: { contextCreated: false, contextClosed: false, pagesCreated: 0, pagesClosed: 0, pendingRequests: null, observerJobs: null, downloadArmRemaining: false },
    limits: { workMs: 36000, closeMs: 39000, nativeMs: 40000, reportBytes: 262144, screenshotBytes: 262144 },
    proofLimits: ["Trusted authored caller-supplied representations only; no original file-byte verification, OCR, file upload, server persistence, model or authorization runtime.", "First ten cases use real official-SDK nested frames; last two use a direct docs consumer for local view/controlled correction preservation, explicit consent and asynchronous callback replacement fences.", "Raw complete region DOM, image natural dimensions, native controls, full text/JSON, identity-scoped intents and callback counters are retained. Header validation does not prove complete image decoding.", "Pinned SDK console classification is fatal on unclassified sends. No tools/context/message request, download, cookie or browser permission is allowed; ordinary requests must be owned-origin GET and fully acknowledged.", "Chromium narrow touch is emulation, not physical device, exhaustive accessibility, untrusted HTML isolation or external-host proof. Browser completion is not raw socket lifecycle; process cleanup belongs to the supervisor."] };
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

// Trusted form-workflow DOM/intent checks; no tool, queue, tracing or model runtime.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";

const tools = process.env.MCPCN_FORMS_BROWSER_TOOLS;
assert.ok(tools && path.isAbsolute(tools));
const { test, expect: playwrightExpect } = createRequire(path.join(tools, "package.json"))("playwright/test");
const expect = playwrightExpect.configure({ timeout: 3000 });
const packageManifest = JSON.parse(await readFile(path.join(tools, "package.json"), "utf8"));
assert.equal(packageManifest.name, "playwright"); assert.equal(packageManifest.version, "1.65.0");
const origins = Object.fromEntries([["docs", "MCPCN_FORMS_ORIGIN", "4173"], ["cliDev", "MCPCN_FORMS_CLI_DEV_ORIGIN", "4545"], ["cliPreview", "MCPCN_FORMS_CLI_PREVIEW_ORIGIN", "4546"]].map(([key, name, port]) => {
  const url = new URL(process.env[name] ?? "");
  assert.equal(url.protocol, "http:"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, port);
  assert.equal(url.href, url.origin + "/"); assert.ok(!url.username && !url.password); return [key, url.origin];
}));
const output = process.env.MCPCN_FORMS_BROWSER_OUTPUT, sourceCommit = process.env.SOURCE_COMMIT;
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

const labels = { missing: "Provide authored missing fields", multi: "Complete authored form steps", inline: "Edit authored structured values", progress: "Review authored form progress", validated: "Review authored field validation", callbacks: "Provide the missing information" };
const slugs = { missing: "missing-data-request", multi: "multi-step-form", inline: "inline-edit-form", progress: "form-progress-card", validated: "validated-field-list" };
const callbackError = "The action could not be completed. Try again.";
const regionFor = (app, scenario) => app.getByRole(["missing", "multi", "inline", "callbacks"].includes(scenario) ? "form" : "region", { name: labels[scenario], exact: true });
const intentFor = (app, direct = false) => app.getByLabel(direct ? "Last form workflow intent" : "Last component intent", { exact: true });
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
      progress: [...element.querySelectorAll("progress")].map(node => ({ label: node.getAttribute("aria-label"), value: node.value, max: node.max, position: node.position, rawValue: node.getAttribute("value"), rawMax: node.getAttribute("max"), ariaValueText: node.getAttribute("aria-valuetext") })),
      sections: [...element.querySelectorAll("section[aria-label]")].map(section => ({ label: section.getAttribute("aria-label"), ariaBusy: section.getAttribute("aria-busy"), outerHTML: section.outerHTML, textContent: section.textContent,
        alerts: texts(section, '[role="alert"]'), statuses: texts(section, '[role="status"]'), controlIndices: [...section.querySelectorAll("input,button,textarea,select")].map(node => nodes.indexOf(node)) })),
      alerts, feedbackErrors: alerts.filter(value => value === "The action could not be completed. Try again."),
      callbackCounters: document.querySelector('output[aria-label="Form workflow intent count"]') ? {
        intents: document.querySelector('output[aria-label="Form workflow intent count"]')?.textContent ?? null,
        settled: document.querySelector('output[aria-label="Settled callback count"]')?.textContent ?? null,
      } : null,
      focus: { ariaLabel: document.activeElement?.getAttribute("aria-label") ?? null, textContent: document.activeElement?.textContent ?? null, tag: document.activeElement?.tagName ?? null, id: document.activeElement?.id ?? null, inRegion: element.contains(document.activeElement), documentHasFocus: document.hasFocus() },
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
async function counters(page) { return { intents: await count(page, "Form workflow intent count"), settled: await count(page, "Settled callback count") }; }
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
  assert.equal(await count(args.page, "Form workflow intent count"), expectedCount);
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
async function missingValues(args, region, subject = "Reviewed missing information") {
  await put(args, region, "Subject", subject); await put(args, region, "Count", "0");
  await filtered(region.getByRole("combobox", { name: "Reviewed", exact: true }), "false");
  await put(args, region, "Details", JSON.stringify({ rows: [0, false, null, ""], next: null }));
  return { subject, count: 0, reviewed: false, details: { rows: [0, false, null, ""], next: null } };
}

async function missingJourney(args) {
  const { app, host, activate, record, report } = args, region = regionFor(app, "missing"), submit = region.getByRole("button", { name: "Provide information", exact: true });
  const initial = await snapshot(region, app, host); await activate(submit);
  const requiredErrors = await validationError(region, ["Subject", "Count", "Reviewed"]); await jsonIs(intentFor(app), null);
  await put(args, region, "Subject", "Reviewed subject"); await put(args, region, "Count", "11");
  await filtered(region.getByRole("combobox", { name: "Reviewed", exact: true }), "false"); await activate(submit);
  const rangeError = await validationError(region, ["Count"]); await jsonIs(intentFor(app), null);
  record("missing_required_and_range_errors", { proof: await snapshot(region, app, host), initial, requiredErrors, rangeError, noCallback: true });
  const known = await openJSON(region, "Known authored document", { title: "Authored record", count: 0, reviewed: false, next: null }, activate);
  const values = await missingValues(args, region); await region.getByRole("textbox", { name: "Subject", exact: true }).press("Enter"); report.input.keyboardActions++;
  await jsonIs(intentFor(app), { type: "submit-missing-data", data: { id: "missing-1", values } });
  record("missing_typed_reviewed_submission", { proof: await snapshot(region, app, host), values, known, nativeEnter: true });
  await put(args, region, "Details", "{"); await activate(submit); const malformed = await validationError(region, ["Details"]);
  await jsonIs(intentFor(app), { type: "submit-missing-data", data: { id: "missing-1", values } });
  const malformedProof = await snapshot(region, app, host), variants = [];
  for (const [input, value] of [["null", null], ['""', ""]]) {
    await put(args, region, "Details", input); await activate(submit);
    const expected = { type: "submit-missing-data", data: { id: "missing-1", values: { ...values, details: value } } }; await jsonIs(intentFor(app), expected);
    variants.push({ input, expected, proof: await snapshot(region, app, host) });
  }
  await activate(region.getByRole("button", { name: "Clear Details", exact: true })); await activate(submit);
  await jsonIs(intentFor(app), { type: "submit-missing-data", data: { id: "missing-1", values: { subject: values.subject, count: 0, reviewed: false } } });
  record("missing_json_and_explicit_absence", { proof: await snapshot(region, app, host), malformed, malformedProof, variants });
  await activate(region.getByRole("button", { name: "Cancel", exact: true })); await jsonIs(intentFor(app), { type: "cancel-missing-data", data: { id: "missing-1" } });
  record("missing_cancel_intent", { proof: await snapshot(region, app, host) });
  record("missing_invalid_payload_refused", await invalidRefusal({ ...args, region }, data => { data.fields[0].value = "Already supplied"; }));
  record("missing_disabled_refused", await disabledRefusal({ ...args, region }));
}

async function multiJourney(args) {
  const { app, host, activate, record, report } = args, region = regionFor(app, "multi");
  await put(args, region, "Team", "Reviewed team"); await put(args, region, "Quantity", "0"); await activate(region.getByRole("button", { name: "Next", exact: true }));
  const error = await validationError(region, ["Quantity"]); await jsonIs(intentFor(app), null);
  await put(args, region, "Quantity", "2.5"); const deliveryFocus = await filtered(region.getByRole("combobox", { name: "Delivery", exact: true }), "express");
  const initial = await snapshot(region, app, host); await region.getByRole("textbox", { name: "Team", exact: true }).press("Enter"); report.input.keyboardActions++;
  await jsonIs(intentFor(app), { type: "change-form-step", data: { id: "multi-1", fromStepId: "details", stepId: "review" } });
  await expect(region.getByRole("heading", { name: "Review", exact: true })).toBeFocused();
  record("multi_validated_forward_navigation", { proof: await snapshot(region, app, host), initial, error, deliveryFocus, nativeEnter: true });
  await put(args, region, "Notes", "Reviewed context"); await region.getByRole("textbox", { name: "Notes", exact: true }).press("End"); await region.getByRole("textbox", { name: "Notes", exact: true }).press("Enter");
  await region.getByRole("textbox", { name: "Notes", exact: true }).press("x"); report.input.keyboardActions += 3;
  await expect(region.getByRole("textbox", { name: "Notes", exact: true })).toHaveValue("Reviewed context\nx");
  await jsonIs(intentFor(app), { type: "change-form-step", data: { id: "multi-1", fromStepId: "details", stepId: "review" } });
  await put(args, region, "Config", "{"); const invalidDraft = await snapshot(region, app, host);
  await activate(region.getByRole("button", { name: "Previous", exact: true })); await jsonIs(intentFor(app), { type: "change-form-step", data: { id: "multi-1", fromStepId: "review", stepId: "details" } });
  await inputValues(region, { Team: "Reviewed team", Quantity: "2.5", Delivery: "express" }); const earlier = await snapshot(region, app, host);
  await activate(region.getByRole("button", { name: "Next", exact: true })); await expect(region.getByRole("heading", { name: "Review", exact: true })).toBeFocused();
  await inputValues(region, { Notes: "Reviewed context\nx", Config: "{", Confirmed: "false" }); await activate(region.getByRole("button", { name: "Submit form", exact: true }));
  const jsonError = await validationError(region, ["Config"]); await jsonIs(intentFor(app), { type: "change-form-step", data: { id: "multi-1", fromStepId: "details", stepId: "review" } });
  record("multi_back_preserves_invalid_drafts", { proof: await snapshot(region, app, host), invalidDraft, earlier, jsonError, textareaNewline: true });
  const values = { team: "Reviewed team", quantity: 2.5, delivery: "express", notes: "Reviewed context\nx", confirmed: false, config: { flags: [false, 0], owner: null } };
  await put(args, region, "Config", JSON.stringify(values.config)); await activate(region.getByRole("button", { name: "Submit form", exact: true }));
  await jsonIs(intentFor(app), { type: "submit-multi-step-form", data: { id: "multi-1", values } });
  record("multi_complete_reviewed_submission", { proof: await snapshot(region, app, host), values });
  await edited(host, data => { data.currentStepId = "review"; data.steps[0].fields[0].value = ""; }, activate);
  await activate(region.getByRole("button", { name: "Submit form", exact: true })); const hiddenError = await validationError(region, ["Team"]);
  const invalidEarlier = await snapshot(region, app, host); await activate(region.getByRole("alert", { name: "Form validation errors", exact: true }).getByRole("button", { name: /^Team:/ }));
  await jsonIs(intentFor(app), { type: "change-form-step", data: { id: "multi-1", fromStepId: "review", stepId: "details" } });
  await expect(region.getByRole("heading", { name: "Details", exact: true })).toBeFocused(); await expect(region.getByRole("textbox", { name: "Team", exact: true })).toHaveValue("");
  record("multi_earlier_error_navigation", { proof: await snapshot(region, app, host), invalidEarlier, hiddenError });
  record("multi_invalid_payload_refused", await invalidRefusal({ ...args, region }, data => { data.currentStepId = "removed"; }));
  record("multi_disabled_refused", await disabledRefusal({ ...args, region }));
}

async function inlineJourney(args) {
  const { app, host, activate, record } = args, region = regionFor(app, "inline"), save = region.getByRole("button", { name: "Save changes", exact: true });
  await expect(save).toBeDisabled(); await expect(region.getByText("No changes to save.", { exact: true })).toBeVisible();
  await inputValues(region, { Count: "0", Reviewed: "false", Payload: '{"records":[],"next":null}' });
  const initial = await snapshot(region, app, host);
  await put(args, region, "Subject", "Reviewed subject"); await put(args, region, "Count", "1.5"); await filtered(region.getByRole("combobox", { name: "Reviewed", exact: true }), "true");
  const payload = { records: [0, false, null, ""], next: null }; await put(args, region, "Payload", JSON.stringify(payload));
  await activate(region.getByRole("button", { name: "Clear Notes", exact: true })); await filtered(region.getByRole("combobox", { name: "Delivery", exact: true }), ""); await activate(save);
  const changes = [{ fieldId: "subject", op: "set", value: "Reviewed subject" }, { fieldId: "count", op: "set", value: 1.5 }, { fieldId: "reviewed", op: "set", value: true },
    { fieldId: "payload", op: "set", value: payload }, { fieldId: "notes", op: "clear" }, { fieldId: "delivery", op: "clear" }];
  await jsonIs(intentFor(app), { type: "commit-inline-edit", data: { id: "inline-1", changes } }); await expect(save).toBeEnabled();
  record("inline_typed_changes_only", { proof: await snapshot(region, app, host), initial, changes, noSaveSuccessInferred: true });
  await activate(region.getByRole("button", { name: "Cancel", exact: true })); await jsonIs(intentFor(app), { type: "cancel-inline-edit", data: { id: "inline-1" } });
  await inputValues(region, { Subject: "Authored subject", Count: "0", Reviewed: "false", Payload: '{"records":[],"next":null}', Notes: "Authored notes", Delivery: "standard" }); await expect(save).toBeDisabled();
  record("inline_cancel_discards_local_edits", { proof: await snapshot(region, app, host) });
  await put(args, region, "Notes", ""); await activate(save);
  const emptyIntent = { type: "commit-inline-edit", data: { id: "inline-1", changes: [{ fieldId: "notes", op: "set", value: "" }] } }; await jsonIs(intentFor(app), emptyIntent); const empty = await snapshot(region, app, host);
  await activate(region.getByRole("button", { name: "Cancel", exact: true })); await activate(region.getByRole("button", { name: "Clear Notes", exact: true })); await put(args, region, "Payload", "null"); await activate(save);
  await jsonIs(intentFor(app), { type: "commit-inline-edit", data: { id: "inline-1", changes: [{ fieldId: "payload", op: "set", value: null }, { fieldId: "notes", op: "clear" }] } });
  record("inline_empty_null_and_clear_are_distinct", { proof: await snapshot(region, app, host), empty });
  const before = await json(intentFor(app)); await put(args, region, "Payload", "{"); await activate(save); const jsonError = await validationError(region, ["Payload"]); await jsonIs(intentFor(app), before);
  const malformed = await snapshot(region, app, host); await put(args, region, "Payload", "null"); await filtered(region.getByRole("combobox", { name: "Reviewed", exact: true }), ""); await activate(save);
  const requiredError = await validationError(region, ["Reviewed"]); await jsonIs(intentFor(app), before);
  record("inline_invalid_edits_do_not_dispatch", { proof: await snapshot(region, app, host), malformed, jsonError, requiredError });
  record("inline_invalid_payload_refused", await invalidRefusal({ ...args, region }, data => { data.fields.find(field => field.id === "count").value = "not a number"; }));
  record("inline_disabled_refused", await disabledRefusal({ ...args, region }));
}

async function progressJourney(args) {
  const { app, host, activate, record } = args, region = regionFor(app, "progress"), detail = detailFor(region, "Selected form progress step");
  await expect(region.getByRole("progressbar", { name: "Reported form progress", exact: true })).toHaveAttribute("value", "2");
  await activate(region.getByRole("button", { name: "Inspect form progress", exact: true })); await jsonIs(intentFor(app), { type: "inspect-form-progress", data: { id: "form-progress-1" } }); const root = await snapshot(region, app, host);
  await activate(detail.getByRole("button", { name: "Inspect progress step", exact: true })); await jsonIs(intentFor(app), { type: "inspect-form-progress-step", data: { id: "form-progress-1", stepId: "review", status: "in-progress" } });
  record("progress_reported_inspection", { proof: await snapshot(region, app, host), root });
  const focus = await selected(region.getByRole("radio", { name: "Select form step: Collect details", exact: true }), activate); await jsonIs(intentFor(app), { type: "select-form-progress-step", data: { id: "form-progress-1", stepId: "collect" } });
  await activate(detail.getByRole("button", { name: "Inspect progress step", exact: true })); await jsonIs(intentFor(app), { type: "inspect-form-progress-step", data: { id: "form-progress-1", stepId: "collect", status: "complete" } });
  record("progress_controlled_selection_focus", { proof: await snapshot(region, app, host), focus });
  await edited(host, data => { data.progress = { completed: 3, total: 3 }; data.selectedStepId = "collect"; data.steps[0].progress = { completed: 0, total: 0 }; }, activate);
  await expect(region.getByText("Reported form status:", { exact: false })).toContainText("in-progress"); await expect(region.getByRole("progressbar", { name: "Reported form progress", exact: true })).toHaveAttribute("value", "3");
  const zero = detail.getByRole("progressbar", { name: "Selected step progress", exact: true }); await expect(zero).toHaveAttribute("aria-valuetext", "0 of 0 reported");
  assert.equal(await zero.getAttribute("value"), null); assert.equal(await zero.getAttribute("max"), null); assert.equal(await zero.evaluate(node => node.position), -1);
  record("progress_zero_and_full_counts", { proof: await snapshot(region, app, host) });
  await edited(host, data => { data.status = "blocked"; delete data.progress; data.steps = []; delete data.selectedStepId; }, activate);
  await expect(region.getByText("No progress counts were supplied.", { exact: true })).toBeVisible(); await expect(region.getByText("No form steps were supplied.", { exact: true })).toBeVisible(); await expect(region.getByRole("progressbar")).toHaveCount(0);
  record("progress_unknown_and_empty", { proof: await snapshot(region, app, host) });
  record("progress_invalid_payload_refused", await invalidRefusal({ ...args, region }, data => { data.progress = { completed: 1, total: 0 }; }));
  record("progress_disabled_refused", await disabledRefusal({ ...args, region }));
}

async function validatedJourney(args) {
  const { app, host, activate, record } = args, region = regionFor(app, "validated"), detail = detailFor(region, "Selected validated field");
  const structured = await openJSON(detail, "Field value", "Authored subject", activate);
  await activate(detail.getByRole("button", { name: "Validate field", exact: true })); await jsonIs(intentFor(app), { type: "validate-field", data: { id: "validated-1", fieldId: "subject" } }); const requested = await snapshot(region, app, host);
  await activate(detail.getByRole("button", { name: "Inspect field", exact: true })); await jsonIs(intentFor(app), { type: "inspect-validated-field", data: { id: "validated-1", fieldId: "subject", status: "invalid" } });
  record("validated_reported_actions", { proof: await snapshot(region, app, host), requested, structured });
  const primitives = [];
  for (const [label, fieldId, value] of [["Count", "count", 0], ["Reviewed", "reviewed", false], ["Payload", "payload", null]]) {
    const focus = await selected(region.getByRole("radio", { name: "Select field: " + label, exact: true }), activate); await jsonIs(intentFor(app), { type: "select-validated-field", data: { id: "validated-1", fieldId } });
    const raw = await openJSON(detail, "Field value", value, activate); await expect(detail.getByRole("button", { name: "Validate field", exact: true })).toHaveCount(0);
    await activate(detail.getByRole("button", { name: "Inspect field", exact: true })); await jsonIs(intentFor(app), { type: "inspect-validated-field", data: { id: "validated-1", fieldId, status: "valid" } });
    primitives.push({ fieldId, value, focus, raw, proof: await snapshot(region, app, host) });
  }
  record("validated_primitives_and_selection", { proof: await snapshot(region, app, host), primitives });
  const pendingFocus = await selected(region.getByRole("radio", { name: "Select field: Pending detail", exact: true }), activate);
  await expect(detail.getByText("No value was supplied.", { exact: true })).toBeVisible(); await expect(detail.locator("details")).toHaveCount(0); await expect(detail.getByRole("button", { name: "Validate field", exact: true })).toHaveCount(0);
  await activate(detail.getByRole("button", { name: "Inspect field", exact: true })); await jsonIs(intentFor(app), { type: "inspect-validated-field", data: { id: "validated-1", fieldId: "pending", status: "pending" } });
  record("validated_pending_absence", { proof: await snapshot(region, app, host), pendingFocus });
  await edited(host, data => { data.fields[0].status = "unvalidated"; delete data.fields[0].message; data.selectedFieldId = "subject"; }, activate);
  await activate(detail.getByRole("button", { name: "Validate field", exact: true })); await jsonIs(intentFor(app), { type: "validate-field", data: { id: "validated-1", fieldId: "subject" } });
  await expect(detail.getByText("Reported validation:", { exact: false })).toContainText("unvalidated");
  record("validated_request_does_not_invent_success", { proof: await snapshot(region, app, host) });
  await edited(host, data => { data.fields = []; delete data.selectedFieldId; }, activate); await expect(region.getByText("No validation fields were supplied.", { exact: true })).toBeVisible();
  record("validated_empty_list", { proof: await snapshot(region, app, host) });
  record("validated_invalid_payload_refused", await invalidRefusal({ ...args, region }, data => { data.fields = [{ id: "bad", label: "Bad", status: "valid" }]; }));
  await edited(host, data => { data.fields = [{ id: "restored", label: "Restored field", status: "invalid", value: null, message: "Authored restored issue", validatable: true }]; data.selectedFieldId = "restored"; }, activate);
  record("validated_disabled_refused", await disabledRefusal({ ...args, region }));
}

async function pendingForm(args, { region, buttonLabel, appendLabel, afterAppend, expectedIntent, reject = false }) {
  const { page, activate } = args, beforeCounters = await counters(page), button = region.getByRole("button", { name: buttonLabel, exact: true });
  await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption(reject ? "reject" : "delayed");
  await activate(button); await expect(region).toHaveAttribute("aria-busy", "true"); await jsonIs(intentFor(page, true), expectedIntent);
  assert.deepEqual(await counters(page), { intents: beforeCounters.intents + 1, settled: beforeCounters.settled });
  const pending = await snapshot(region, page, null, true), oldForm = await region.elementHandle(); assert.ok(oldForm);
  try {
    await activate(page.getByRole("button", { name: appendLabel, exact: true })); await afterAppend();
    const sameFormNode = await region.evaluate((node, previous) => node === previous, oldForm); assert.equal(sameFormNode, true);
    await expect(region).toHaveAttribute("aria-busy", "true"); await expect(button).toBeDisabled();
    assert.equal(await region.locator("input,button,textarea,select").evaluateAll(nodes => nodes.length > 0 && nodes.every(node => node.matches(":disabled"))), true);
    await jsonIs(intentFor(page, true), expectedIntent); const appended = await snapshot(region, page, null, true);
    await duplicateWhilePending(args, button, beforeCounters.intents + 1);
    await expect.poll(() => count(page, "Settled callback count")).toBe(beforeCounters.settled + 1); await expect(button).toBeEnabled(); await expect(region).toHaveAttribute("aria-busy", "false");
    if (reject) await expect(region.getByRole("alert")).toHaveText(callbackError); else await noCallbackError(region);
    const settled = await snapshot(region, page, null, true); let recovered = null;
    if (reject) {
      await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("immediate"); await activate(button); await noCallbackError(region); await jsonIs(intentFor(page, true), expectedIntent);
      assert.deepEqual(await counters(page), { intents: beforeCounters.intents + 2, settled: beforeCounters.settled + 1 }); recovered = await snapshot(region, page, null, true);
    }
    return { proof: await snapshot(region, page, null, true), pending, appended, settled, recovered, beforeCounters, afterCounters: await counters(page), sameFormNode, nativeDuplicateAttempt: true, rejectedThenRetried: reject };
  } finally { await oldForm.dispose(); }
}
async function replaceForm(args, { region, buttonLabel, replacementLabel, expectedIntent, afterReplace, prepareNew = async () => undefined, expectedNewIntent }) {
  const { page, activate } = args, button = region.getByRole("button", { name: buttonLabel, exact: true }), beforeCounters = await counters(page);
  await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("reject"); await activate(button); await expect(region).toHaveAttribute("aria-busy", "true");
  await jsonIs(intentFor(page, true), expectedIntent); const pending = await snapshot(region, page, null, true), oldForm = await region.elementHandle(); assert.ok(oldForm);
  try {
    await activate(page.getByRole("button", { name: replacementLabel, exact: true })); await expect.poll(() => oldForm.evaluate(node => node.isConnected)).toBe(false);
    await expect(region).toHaveAttribute("aria-busy", "false"); await noCallbackError(region); await afterReplace();
    await jsonIs(intentFor(page, true), expectedIntent); assert.deepEqual(await counters(page), { intents: beforeCounters.intents + 1, settled: beforeCounters.settled });
    const replacementBeforeSettlement = await snapshot(region, page, null, true), replacementHTML = (await nativeDOM(region)).outerHTML;
    await expect.poll(() => count(page, "Settled callback count")).toBe(beforeCounters.settled + 1); await noCallbackError(region); await jsonIs(intentFor(page, true), expectedIntent);
    assert.equal((await nativeDOM(region)).outerHTML, replacementHTML); await afterReplace(); const settled = await snapshot(region, page, null, true);
    await prepareNew(); const beforeNewCounters = await counters(page); await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("immediate");
    await activate(button); await jsonIs(intentFor(page, true), expectedNewIntent); await noCallbackError(region);
    assert.deepEqual(await counters(page), { intents: beforeNewCounters.intents + 1, settled: beforeNewCounters.settled });
    return { proof: await snapshot(region, page, null, true), pending, replacementBeforeSettlement, settled, beforeCounters, beforeNewCounters, afterCounters: await counters(page), oldFormNodeDetached: true, positiveOldCallbackSettlement: true };
  } finally { await oldForm.dispose(); }
}
async function pendingChild(args, { region, detailLabel, buttonLabel, append, afterAppend, expectedIntent, reject = false }) {
  const { page, activate } = args, detail = detailFor(region, detailLabel), button = detail.getByRole("button", { name: buttonLabel, exact: true }), beforeCounters = await counters(page);
  await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption(reject ? "reject" : "delayed");
  await activate(button); await expect(detail).toHaveAttribute("aria-busy", "true"); await jsonIs(intentFor(page, true), expectedIntent);
  const pending = await snapshot(region, page, null, true), oldDetail = await detail.elementHandle(); assert.ok(oldDetail);
  try {
    await append(); await afterAppend(); const sameDetailNode = await detail.evaluate((node, previous) => node === previous, oldDetail); assert.equal(sameDetailNode, true);
    await expect(detail).toHaveAttribute("aria-busy", "true"); await expect(button).toBeDisabled(); const appended = await snapshot(region, page, null, true);
    await duplicateWhilePending(args, button, beforeCounters.intents + 1);
    await expect.poll(() => count(page, "Settled callback count")).toBe(beforeCounters.settled + 1); await expect(detail).toHaveAttribute("aria-busy", "false"); await expect(button).toBeEnabled();
    if (reject) await expect(detail.getByRole("alert").filter({ hasText: new RegExp("^" + callbackError.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$") })).toHaveText(callbackError); else await noCallbackError(region);
    const settled = await snapshot(region, page, null, true); let recovered = null;
    if (reject) {
      await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("immediate"); await activate(button); await noCallbackError(region); await jsonIs(intentFor(page, true), expectedIntent);
      recovered = await snapshot(region, page, null, true);
    }
    assert.deepEqual(await counters(page), { intents: beforeCounters.intents + (reject ? 2 : 1), settled: beforeCounters.settled + 1 });
    return { proof: await snapshot(region, page, null, true), pending, appended, settled, recovered, beforeCounters, afterCounters: await counters(page), sameDetailNode, nativeDuplicateAttempt: true, rejectedThenRetried: reject };
  } finally { await oldDetail.dispose(); }
}
async function replaceChild(args, { region, detailLabel, buttonLabel, replacementLabel, radioLabel, newRadioLabel, expectedIntent, expectedNewIntent, expectedValue }) {
  const { page, activate } = args, detail = detailFor(region, detailLabel), button = detail.getByRole("button", { name: buttonLabel, exact: true }), beforeCounters = await counters(page);
  await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("reject"); await activate(button); await expect(detail).toHaveAttribute("aria-busy", "true");
  await jsonIs(intentFor(page, true), expectedIntent); const pending = await snapshot(region, page, null, true), oldDetail = await detail.elementHandle(), oldRadio = await region.getByRole("radio", { name: radioLabel, exact: true }).elementHandle(); assert.ok(oldDetail && oldRadio);
  try {
    await activate(page.getByRole("button", { name: replacementLabel, exact: true })); await expect.poll(() => oldDetail.evaluate(node => node.isConnected)).toBe(false);
    const sameSelectionNode = await region.getByRole("radio", { name: newRadioLabel, exact: true }).evaluate((node, previous) => node === previous, oldRadio); assert.equal(sameSelectionNode, true);
    await expect(detail).toHaveAttribute("aria-busy", "false"); await noCallbackError(region); await expect(button).toBeEnabled();
    await jsonIs(intentFor(page, true), expectedIntent); assert.deepEqual(await counters(page), { intents: beforeCounters.intents + 1, settled: beforeCounters.settled });
    const replacementBeforeSettlement = await snapshot(region, page, null, true), html = (await nativeDOM(region)).outerHTML;
    await expect.poll(() => count(page, "Settled callback count")).toBe(beforeCounters.settled + 1); await noCallbackError(region); await jsonIs(intentFor(page, true), expectedIntent);
    assert.equal((await nativeDOM(region)).outerHTML, html); const settled = await snapshot(region, page, null, true); let structured = null;
    if (expectedValue !== undefined) structured = await openJSON(detail, "Field value", expectedValue, activate);
    await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("immediate"); await activate(button); await jsonIs(intentFor(page, true), expectedNewIntent);
    assert.deepEqual(await counters(page), { intents: beforeCounters.intents + 2, settled: beforeCounters.settled + 1 });
    return { proof: await snapshot(region, page, null, true), pending, replacementBeforeSettlement, settled, structured, beforeCounters, afterCounters: await counters(page), oldDetailNodeDetached: true, sameSelectionNode, positiveOldCallbackSettlement: true };
  } finally { await oldDetail.dispose(); await oldRadio.dispose(); }
}
async function callbacksJourney(args) {
  const { page, activate, record, report, observer, deadline } = args;
  let region = regionFor(page, "callbacks"); assert.deepEqual(await counters(page), { intents: 0, settled: 0 }); await jsonIs(intentFor(page, true), null);
  const missing = await missingValues(args, region), missingIntent = { type: "submit-missing-data", data: { id: "docs-missing-1", values: missing } };
  record("callbacks_missing_pending_context_and_recovery", await pendingForm(args, { region, buttonLabel: "Provide information", appendLabel: "Append known context", expectedIntent: missingIntent, reject: true,
    afterAppend: async () => { await expect(region.locator("summary").filter({ hasText: /^Additional known context$/ })).toBeVisible(); await inputValues(region, { Subject: missing.subject, Count: "0", Reviewed: "false", Details: JSON.stringify(missing.details) }); } }));
  record("callbacks_missing_field_replacement", await replaceForm(args, { region, buttonLabel: "Provide information", replacementLabel: "Replace requested field", expectedIntent: missingIntent,
    afterReplace: async () => { await inputValues(region, { "Replacement subject": "", Count: "0", Reviewed: "false", Details: JSON.stringify(missing.details) }); },
    prepareNew: async () => { await put(args, region, "Replacement subject", "Recovered missing subject"); },
    expectedNewIntent: { type: "submit-missing-data", data: { id: "docs-missing-1", values: { ...missing, subject: "Recovered missing subject" } } } }));

  await docNavigation(page, origins.docs + "/components/multi-step-form", observer, report, deadline);
  region = page.getByRole("form", { name: "Complete the reviewed form", exact: true }); await expect(region).toBeVisible();
  await put(args, region, "Team", "Locally reviewed team"); await activate(region.getByRole("button", { name: "Next", exact: true }));
  await expect(region.getByRole("heading", { name: "Review", exact: true })).toBeFocused();
  await put(args, region, "Notes", "Locally reviewed\nnotes"); const multiConfig = ["local", 0, false, null]; await put(args, region, "Config", JSON.stringify(multiConfig));
  const multiValues = { team: "Locally reviewed team", quantity: 2, delivery: "standard", notes: "Locally reviewed\nnotes", confirmed: false, config: multiConfig };
  record("callbacks_multi_pending_append", await pendingForm(args, { region, buttonLabel: "Submit form", appendLabel: "Append unrelated field", expectedIntent: { type: "submit-multi-step-form", data: { id: "docs-multi-1", values: multiValues } },
    afterAppend: async () => { await inputValues(region, { Notes: multiValues.notes, Confirmed: "false", Config: JSON.stringify(multiConfig), "Additional context": "Authored appendix" }); } }));
  const multiCurrent = { ...multiValues, appendix: "Authored appendix" };
  record("callbacks_multi_field_replacement", await replaceForm(args, { region, buttonLabel: "Submit form", replacementLabel: "Replace current field", expectedIntent: { type: "submit-multi-step-form", data: { id: "docs-multi-1", values: multiCurrent } },
    afterReplace: async () => { await inputValues(region, { "Replacement current field": "Replacement authored value", Confirmed: "false", Config: JSON.stringify(multiConfig), "Additional context": "Authored appendix" }); },
    prepareNew: async () => { await activate(region.getByRole("button", { name: "Previous", exact: true })); await inputValues(region, { Team: multiValues.team, Quantity: "2", Delivery: "standard" }); await activate(region.getByRole("button", { name: "Next", exact: true })); await inputValues(region, { "Replacement current field": "Replacement authored value", Config: JSON.stringify(multiConfig) }); },
    expectedNewIntent: { type: "submit-multi-step-form", data: { id: "docs-multi-1", values: { ...multiCurrent, notes: "Replacement authored value" } } } }));

  await docNavigation(page, origins.docs + "/components/inline-edit-form", observer, report, deadline);
  region = page.getByRole("form", { name: "Review and edit structured values", exact: true }); await expect(region).toBeVisible();
  await put(args, region, "Subject", "Locally reviewed subject"); await put(args, region, "Count", "3.5"); await filtered(region.getByRole("combobox", { name: "Reviewed", exact: true }), "true");
  const localPayload = { local: [0, false, null] }; await put(args, region, "Payload", JSON.stringify(localPayload)); await put(args, region, "Notes", "Locally reviewed notes");
  const inlineChanges = [{ fieldId: "subject", op: "set", value: "Locally reviewed subject" }, { fieldId: "count", op: "set", value: 3.5 }, { fieldId: "reviewed", op: "set", value: true }, { fieldId: "payload", op: "set", value: localPayload }, { fieldId: "notes", op: "set", value: "Locally reviewed notes" }];
  const inlineIntent = { type: "commit-inline-edit", data: { id: "docs-inline-1", changes: inlineChanges } };
  record("callbacks_inline_pending_append", await pendingForm(args, { region, buttonLabel: "Save changes", appendLabel: "Append unrelated field", expectedIntent: inlineIntent,
    afterAppend: async () => { await inputValues(region, { Subject: "Locally reviewed subject", Count: "3.5", Reviewed: "true", Payload: JSON.stringify(localPayload), Notes: "Locally reviewed notes", "Additional context": "Authored appendix" }); } }));
  const replacement = await replaceForm(args, { region, buttonLabel: "Save changes", replacementLabel: "Replace edited field", expectedIntent: inlineIntent,
    afterReplace: async () => { await inputValues(region, { Subject: "Replacement authored subject", Count: "3.5", Reviewed: "true", Payload: JSON.stringify(localPayload), Notes: "Locally reviewed notes", "Additional context": "Authored appendix" }); },
    expectedNewIntent: { type: "commit-inline-edit", data: { id: "docs-inline-1", changes: inlineChanges.slice(1) } } });
  await activate(region.getByRole("button", { name: "Cancel", exact: true })); await jsonIs(intentFor(page, true), { type: "cancel-inline-edit", data: { id: "docs-inline-1" } });
  await inputValues(region, { Subject: "Replacement authored subject", Count: "0", Reviewed: "false", Payload: '{"records":[],"next":null}', Notes: "Authored notes", "Additional context": "Authored appendix" }); await expect(region.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  const beforeRoot = await snapshot(region, page, null, true); assert.deepEqual(await counters(page), { intents: 4, settled: 2 });
  await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("reject");
  await activate(region.getByRole("button", { name: "Cancel", exact: true })); await expect(region).toHaveAttribute("aria-busy", "true");
  await jsonIs(intentFor(page, true), { type: "cancel-inline-edit", data: { id: "docs-inline-1" } }); assert.deepEqual(await counters(page), { intents: 5, settled: 2 });
  const rootPending = await snapshot(region, page, null, true), oldForm = await region.elementHandle(); assert.ok(oldForm);
  let rootReset;
  try {
    await activate(page.getByRole("button", { name: "Replace operation", exact: true })); await expect.poll(() => oldForm.evaluate(node => node.isConnected)).toBe(false);
    await inputValues(region, { Subject: "Authored subject", Count: "0", Reviewed: "false", Payload: '{"records":[],"next":null}', Notes: "Authored notes" }); await expect(region.getByLabel("Additional context", { exact: true })).toHaveCount(0);
    await expect(region).toHaveAttribute("aria-busy", "false"); await noCallbackError(region);
    assert.deepEqual(await counters(page), { intents: 0, settled: 2 }); await jsonIs(intentFor(page, true), null);
    const reset = await snapshot(region, page, null, true), replacementHTML = (await nativeDOM(region)).outerHTML;
    await expect.poll(() => count(page, "Settled callback count")).toBe(3); await noCallbackError(region); await jsonIs(intentFor(page, true), null);
    assert.equal((await nativeDOM(region)).outerHTML, replacementHTML); await expect(region).toHaveAttribute("aria-busy", "false");
    await inputValues(region, { Subject: "Authored subject", Count: "0", Reviewed: "false", Payload: '{"records":[],"next":null}', Notes: "Authored notes" });
    const settled = await snapshot(region, page, null, true); assert.deepEqual(await counters(page), { intents: 0, settled: 3 });
    await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("immediate");
    await activate(region.getByRole("button", { name: "Cancel", exact: true })); await jsonIs(intentFor(page, true), { type: "cancel-inline-edit", data: { id: "docs-inline-1-replacement-2" } });
    assert.deepEqual(await counters(page), { intents: 1, settled: 3 });
    rootReset = { before: beforeRoot, pending: rootPending, reset, settled, proof: await snapshot(region, page, null, true), oldFormDetached: true, positiveOldCallbackSettlement: true, afterCounters: await counters(page) };
  } finally { await oldForm.dispose(); }
  record("callbacks_inline_field_and_root_replacement", { ...replacement, rootReset });

  await docNavigation(page, origins.docs + "/components/form-progress-card", observer, report, deadline);
  region = page.getByRole("region", { name: "Review reported form progress", exact: true }); await expect(region).toBeVisible();
  const progressIntent = { type: "inspect-form-progress-step", data: { id: "docs-form-progress-1", stepId: "review", status: "in-progress" } };
  record("callbacks_progress_updates_preserve_pending", await pendingChild(args, { region, detailLabel: "Selected form progress step", buttonLabel: "Inspect progress step", expectedIntent: progressIntent,
    append: async () => { await activate(page.getByRole("button", { name: "Advance reported progress", exact: true })); await activate(page.getByRole("button", { name: "Append unrelated step", exact: true })); },
    afterAppend: async () => { await expect(region.getByRole("progressbar", { name: "Reported form progress", exact: true })).toHaveAttribute("value", "3"); await expect(region.getByRole("radio", { name: "Select form step: Additional authored step", exact: true })).toBeVisible(); await expect(detailFor(region, "Selected form progress step").getByText("Reported step status:", { exact: false })).toContainText("in-progress"); } }));
  record("callbacks_progress_same_root_replacement", await replaceChild(args, { region, detailLabel: "Selected form progress step", buttonLabel: "Inspect progress step", replacementLabel: "Replace selected step", radioLabel: "Select form step: Review details", newRadioLabel: "Select form step: Replacement authored step", expectedIntent: progressIntent,
    expectedNewIntent: { type: "inspect-form-progress-step", data: { id: "docs-form-progress-1", stepId: "review", status: "blocked" } } }));

  await docNavigation(page, origins.docs + "/components/validated-field-list", observer, report, deadline);
  region = page.getByRole("region", { name: "Review reported field validation", exact: true }); await expect(region).toBeVisible();
  const validationIntent = { type: "validate-field", data: { id: "docs-validated-1", fieldId: "subject" } };
  record("callbacks_validation_pending_append_and_recovery", await pendingChild(args, { region, detailLabel: "Selected validated field", buttonLabel: "Validate field", expectedIntent: validationIntent, reject: true,
    append: async () => { await activate(page.getByRole("button", { name: "Append unrelated field", exact: true })); },
    afterAppend: async () => { await expect(region.getByRole("radio", { name: "Select field: Additional authored field", exact: true })).toBeVisible(); await expect(detailFor(region, "Selected validated field").getByText("Reported validation:", { exact: false })).toContainText("invalid"); } }));
  record("callbacks_validation_same_root_replacement", await replaceChild(args, { region, detailLabel: "Selected validated field", buttonLabel: "Validate field", replacementLabel: "Replace selected field", radioLabel: "Select field: Subject", newRadioLabel: "Select field: Replacement authored field", expectedIntent: validationIntent, expectedNewIntent: validationIntent, expectedValue: { replacement: true } }));
}

const CASES = [
  ["F01", "F01 desktop docs missing fields and reviewed values", "desktop", "missing", "docs", missingJourney],
  ["F02", "F02 narrow docs missing fields and reviewed values", "narrow", "missing", "docs", missingJourney],
  ["F03", "F03 desktop CLI dev multi step review and submission", "desktop", "multi", "cliDev", multiJourney],
  ["F04", "F04 narrow CLI dev multi step review and submission", "narrow", "multi", "cliDev", multiJourney],
  ["F05", "F05 desktop CLI preview typed inline edit differences", "desktop", "inline", "cliPreview", inlineJourney],
  ["F06", "F06 narrow CLI preview typed inline edit differences", "narrow", "inline", "cliPreview", inlineJourney],
  ["F07", "F07 desktop docs reported form progress inspection", "desktop", "progress", "docs", progressJourney],
  ["F08", "F08 narrow docs reported form progress inspection", "narrow", "progress", "docs", progressJourney],
  ["F09", "F09 desktop CLI dev reported validation review", "desktop", "validated", "cliDev", validatedJourney],
  ["F10", "F10 narrow CLI dev reported validation review", "narrow", "validated", "cliDev", validatedJourney],
  ["F11", "F11 desktop docs draft updates and replacement fences", "desktop", "callbacks", "docs", callbacksJourney],
  ["F12", "F12 narrow docs draft updates and replacement fences", "narrow", "callbacks", "docs", callbacksJourney]
];
assert.equal(CASES.length, 12); assert.equal(new Set(CASES.map(row => row[0])).size, 12);

async function runCase(browser, testInfo, [caseId, title, profile, scenario, originKey, journey]) {
  assert.equal(testInfo.retry, 0); assert.equal(browser.browserType().name(), "chromium"); testInfo.setTimeout(40000);
  const started = performance.now(), deadline = started + 36000, closeDeadline = started + 39000, origin = origins[originKey];
  const direct = scenario === "callbacks", route = direct ? "/components/missing-data-request" : originKey === "docs" ? "/playground" : "/?component=missing-data-request";
  const jsonPath = path.join(output, caseId + ".json"), pngPath = path.join(output, caseId + ".png"); await absent(jsonPath); await absent(pngPath);
  const viewport = profile === "desktop" ? { width: 1280, height: 900 } : { width: 390, height: 844 };
  const report = { schemaVersion: 1, sourceCommit, caseId, title, profile, scenario, originKey, route, origin, playwright: packageManifest.version, browserVersion: browser.version(), startedAt: new Date().toISOString(), viewport, touchEmulated: profile === "narrow", status: "failed", observations: [],
    input: { trackedTaps: 0, trackedClicks: 0, keyboardActions: 0 }, wire: [], sdkSends: {}, displayMessages: [],
    console: { debugCount: 0, warningCount: 0, warnings: [], sdkSendPreviewCount: 0, responsePreviewCount: 0, unclassifiedSendCount: 0, unclassifiedSends: [] }, downloadEvents: 0, blobDownload: { rows: [], nativeDownloadJoined: null },
    network: { requests: 0, requestFailures: 0, consoleErrors: 0, pageErrors: 0, webSockets: 0, errorCount: 0, errors: [], rows: [] },
    cleanup: { contextCreated: false, contextClosed: false, pagesCreated: 0, pagesClosed: 0, pendingRequests: null, observerJobs: null, downloadArmRemaining: false },
    limits: { workMs: 36000, closeMs: 39000, nativeMs: 40000, reportBytes: 262144, screenshotBytes: 262144 },
    proofLimits: ["Trusted authored form-workflow data only. No persistence, validator service, model or authorization runtime is started. Disposable consumer callbacks use fixed 1500ms timers solely to exercise asynchronous feedback.", "First ten cases use real official-SDK nested frames; last two use direct docs consumers to isolate local-draft preservation and same-root replacement fences from iframe remounts.", "Raw form/region DOM records native values, constraints, JSON disclosures, reported progress, child SECTION busy/alerts, focused summaries/headings and lifetime callback counters. Producer alerts remain distinct from the exact consumer-callback error.", "Host editor payloads describe invocation data; local edits and controlled navigation do not rewrite that editor. Explicit form submit/commit intents contain reviewed supplied values or differences; navigation and reported-state inspection carry identity only.", "Pinned SDK console classification is fatal on any unclassified send. No tools/context/message request, download, cookie or browser permission is allowed. Every ordinary request must be owned-origin GET and completely acknowledged.", "Chromium narrow touch is emulation, not physical-device or exhaustive accessibility/untrusted-HTML proof. Browser HTTP completion is not raw socket EOF or every-asset integrity; process teardown belongs to the supervisor."] };
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

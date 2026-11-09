// Supplied record and field-confidence inspection checks; no fetch, tool or persistence.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";

const tools = process.env.MCPCN_INSPECTION_BROWSER_TOOLS;
assert.ok(tools && path.isAbsolute(tools));
const { test, expect: playwrightExpect } = createRequire(path.join(tools, "package.json"))("playwright/test");
const expect = playwrightExpect.configure({ timeout: 3000 });
const packageManifest = JSON.parse(await readFile(path.join(tools, "package.json"), "utf8"));
assert.equal(packageManifest.name, "playwright"); assert.equal(packageManifest.version, "1.65.0");
const origins = Object.fromEntries([["docs", "MCPCN_INSPECTION_ORIGIN", "4173"], ["cliDev", "MCPCN_INSPECTION_CLI_DEV_ORIGIN", "4545"], ["cliPreview", "MCPCN_INSPECTION_CLI_PREVIEW_ORIGIN", "4546"]].map(([key, name, port]) => {
  const url = new URL(process.env[name] ?? "");
  assert.equal(url.protocol, "http:"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, port);
  assert.equal(url.href, url.origin + "/"); assert.ok(!url.username && !url.password); return [key, url.origin];
}));
const output = process.env.MCPCN_INSPECTION_BROWSER_OUTPUT, sourceCommit = process.env.SOURCE_COMMIT;
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
const slugs = { record: "record-inspector", confidence: "field-confidence-list", values: "record-inspector" };
const labels = { record: "Supplied record inspection", confidence: "Supplied field confidence", values: "Supplied record inspection",
  controlled: "Inspect supplied record fields", fences: "Inspect reported field confidence", states: "Inspect supplied record fields" };
const actionError = "The action could not be completed. Try again.";
const recordScope = { componentId: "record-inspector-1", componentRevision: "1", recordId: "record-1", recordRevision: "1" };
const confidenceScope = { componentId: "confidence-list-1", componentRevision: "1" };
const profileScope = { fieldId: "profile", fieldRevision: "1" };
const regionFor = (app, scenario) => app.getByRole("region", { name: labels[scenario], exact: true });
const fieldsOf = data => Object.hasOwn(data, "record") ? data.record.fields : data.fields;
const recordLast = "Last record inspector intent", confidenceLast = "Last field confidence intent";
async function snapshot(region, app, host = null, directLabel = null) {
  const value = await region.evaluate(element => ({
    outerHTML: element.outerHTML, textContent: element.textContent,
    root: { tag: element.tagName, role: element.getAttribute("role"), label: element.getAttribute("aria-label"), busy: element.getAttribute("aria-busy") },
    focus: { tag: document.activeElement?.tagName ?? null, label: document.activeElement?.getAttribute("aria-label") ?? null,
      text: element.contains(document.activeElement) ? document.activeElement?.textContent ?? null : null,
      inRegion: element.contains(document.activeElement), documentHasFocus: document.hasFocus() },
    controls: [...element.querySelectorAll("button,input,select,summary,a")].map(node => ({ tag: node.tagName, text: node.textContent,
      label: node.getAttribute("aria-label"), disabled: node.matches(":disabled"), pressed: node.getAttribute("aria-pressed"), focused: node === document.activeElement,
      href: node.getAttribute("href"), target: node.getAttribute("target"), rel: node.getAttribute("rel"), referrerPolicy: node.getAttribute("referrerpolicy") })),
    selectedRegions: [...element.querySelectorAll('[role="region"]')].map(node => ({ tag: node.tagName, label: node.getAttribute("aria-label"), tabIndex: node.tabIndex })),
    values: [...element.querySelectorAll('pre[aria-label="Complete field JSON"]')].map(node => ({ label: node.getAttribute("aria-label"), text: node.textContent })),
    evidenceLists: [...element.querySelectorAll('ul[aria-label="Supplied field evidence"]')].map(node => ({ label: node.getAttribute("aria-label"), text: node.textContent })),
    meters: [...element.querySelectorAll("meter")].map(node => ({ tag: node.tagName, label: node.getAttribute("aria-label"),
      min: node.min, max: node.max, value: node.value, ariaValueText: node.getAttribute("aria-valuetext") })),
    statuses: [...element.querySelectorAll('[role="status"]')].map(node => node.textContent), alerts: [...element.querySelectorAll('[role="alert"]')].map(node => node.textContent),
    counters: [...document.querySelectorAll("output[aria-label]")].map(node => ({ label: node.getAttribute("aria-label"), text: node.textContent })),
    viewport: { innerWidth, innerHeight, documentWidth: document.documentElement.scrollWidth, maxTouchPoints: navigator.maxTouchPoints },
  }));
  const intent = await rawText(app.getByLabel(directLabel ?? "Last component intent", { exact: true }));
  const payload = host ? await host.getByRole("textbox", { name: "Tool result JSON", exact: true }).inputValue() : null;
  const received = host ? await rawText(app.getByLabel("Received inspection payload", { exact: true })) : null;
  return { dom: original(JSON.stringify(value)), intent: original(intent), intentValue: JSON.parse(intent),
    payload: payload === null ? null : original(payload), receivedPayload: received === null ? null : original(received) };
}
async function delivered(args, mutate, invalid = false) {
  const editor = args.host.getByRole("textbox", { name: "Tool result JSON", exact: true }), value = JSON.parse(await editor.inputValue());
  assert.ok(object(value.structuredContent) && object(value.structuredContent.data));
  const version = value.structuredContent.stateVersion ?? 0;
  assert.ok(Number.isSafeInteger(version) && version >= 0 && version < Number.MAX_SAFE_INTEGER);
  value.structuredContent.stateVersion = version + 1; mutate(value.structuredContent.data);
  await editor.fill(JSON.stringify(value, null, 2)); args.report.input.editorFills++;
  await args.activate(args.host.getByRole("button", { name: "Invoke tool result", exact: true }));
  if (!invalid) await jsonIs(args.app.getByLabel("Received inspection payload", { exact: true }), value.structuredContent);
  return { preparedPayload: original(JSON.stringify(value)),
    receivedPayload: invalid ? null : original(await rawText(args.app.getByLabel("Received inspection payload", { exact: true }))) };
}
async function counters(page, record = false) {
  const number = async label => Number(await page.getByLabel(label, { exact: true }).textContent());
  return { intents: await number(record ? "Record inspector intent count" : "Field confidence intent count"),
    settled: await number("Settled inspection notification count"), pending: await number("Pending inspection notifications") };
}
async function checked(args, label, value) {
  const checkbox = args.page.getByRole("checkbox", { name: label, exact: true });
  if (await checkbox.isChecked() !== value) await args.activate(checkbox);
  assert.equal(await checkbox.isChecked(), value);
}
async function selectOption(args, app, label, value) {
  const control = app.getByRole("combobox", { name: label, exact: true });
  await alignReachable(args, control, "select"); await control.selectOption(value); args.report.input.nativeSelections++;
  await expect(control).toHaveValue(value);
}
async function sameNode(locator, handle) { assert.equal(await locator.evaluate((node, old) => node === old, handle), true); }
async function press(args, key) { await args.page.keyboard.press(key); args.report.input.keyboardActions++; }
async function capture(args, stage, target) {
  await alignReachable(args, target, "capture:" + stage);
  const filename = args.report.caseId + "-" + stage + ".png", targetPath = path.join(output, filename); await absent(targetPath);
  const bytes = await args.page.screenshot({ path: targetPath, type: "png", fullPage: false, animations: "disabled", timeout: 3000 });
  assert.ok(bytes.length > 0 && bytes.length <= 262144);
  args.report.stageScreenshots.push({ stage, filename, bytes: bytes.length, sha256: sha(bytes), viewportOnly: true });
}
async function navigate(args, route) {
  await args.observer.settle();
  const url = origins.docs + route, response = await within(() => args.page.goto(url, { waitUntil: "load", timeout: 10000 }), args.deadline, "secondary_navigation_deadline");
  assert.ok(response); assert.equal(response.status(), 200);
  const request = response.request(), row = args.observer.rows.get(request);
  assert.ok(row && request.isNavigationRequest() && request.frame() === args.page.mainFrame()); assert.equal(request.url(), url);
  await args.observer.settle(); assert.equal(row.terminal, "finished"); assert.equal(row.responseFinished, "null");
  args.report.secondaryNavigations.push({ url, requestOrdinal: row.ordinal, status: response.status(), exactRequestIdentity: true, requestFinished: row.terminal, responseFinished: row.responseFinished });
}
async function producerRefresh(args, mutate, focused) {
  const editor = args.host.getByRole("textbox", { name: "Tool result JSON", exact: true }), result = JSON.parse(await editor.inputValue());
  assert.ok(object(result) && object(result.structuredContent) && object(result.structuredContent.data));
  const previousStateVersion = result.structuredContent.stateVersion ?? null;
  assert.ok(previousStateVersion === null || Number.isSafeInteger(previousStateVersion) && previousStateVersion >= 0 && previousStateVersion < Number.MAX_SAFE_INTEGER);
  result.structuredContent.stateVersion = (previousStateVersion ?? 0) + 1;
  mutate(result.structuredContent.data); await editor.fill(JSON.stringify(result, null, 2)); args.report.input.editorFills++;
  // Set up active app focus before incoming producer delivery; never repair it afterwards.
  await focused.focus(); args.report.input.programmaticFocusRestorations++;
  await expect(focused).toBeFocused();
  const focusBefore = await focused.evaluate(node => {
    const ancestors = []; let view = node.ownerDocument.defaultView;
    while (view.frameElement) {
      if (ancestors.length >= 2) throw new Error("producer_focus_frame_bound");
      const frame = view.frameElement;
      ancestors.push({ tag: frame.tagName, title: frame.title, active: frame.ownerDocument.activeElement === frame });
      view = frame.ownerDocument.defaultView;
    }
    return { tag: node.tagName, label: node.getAttribute("aria-label"), text: node.textContent,
      active: node.ownerDocument.activeElement === node, documentHasFocus: node.ownerDocument.hasFocus(), ancestors };
  });
  assert.ok(focusBefore.active && focusBefore.documentHasFocus && focusBefore.ancestors.every(frame => frame.active));
  const delivery = await args.host.getByRole("button", { name: "Invoke tool result", exact: true }).evaluate(button => {
    if (!(button instanceof HTMLButtonElement) || button.disabled || button.textContent !== "Invoke tool result") throw new Error("producer_button_unavailable");
    const observation = { tag: button.tagName, text: button.textContent, disabled: button.disabled, method: "HTMLElement.click" };
    button.click(); return observation;
  });
  args.report.input.programmaticProducerInvocations++; await ready(args.host);
  const received = args.app.getByLabel("Received inspection payload", { exact: true });
  await jsonIs(received, result.structuredContent);
  return { focusBefore: original(JSON.stringify(focusBefore)), preparedPayload: original(JSON.stringify(result)), delivery,
    previousStateVersion, receivedPayload: original(await rawText(received)) };
}
async function alignReachable(args, locator, purpose) {
  const chain = await locator.evaluate(element => {
    element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    let view = element.ownerDocument.defaultView, rect = element.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2, depth = 0;
    while (view.frameElement) {
      if (++depth > 2) throw new Error("alignment_frame_bound");
      const frame = view.frameElement, parent = frame.ownerDocument.defaultView, bounds = frame.getBoundingClientRect();
      parent.scrollBy({ left: bounds.left + frame.clientLeft + x - parent.innerWidth / 2,
        top: bounds.top + frame.clientTop + y - parent.innerHeight / 2, behavior: "instant" });
      const after = frame.getBoundingClientRect(); x += after.left + frame.clientLeft; y += after.top + frame.clientTop; view = parent;
    }
    const result = []; let target = element; view = element.ownerDocument.defaultView;
    rect = element.getBoundingClientRect(); x = rect.left + rect.width / 2; y = rect.top + rect.height / 2;
    for (;;) {
      const hit = view.document.elementFromPoint(x, y), within = hit !== null && (hit === target || target.contains(hit));
      if (!(x > 0 && x < view.innerWidth && y > 0 && y < view.innerHeight && within)) throw new Error("aligned_target_not_reachable");
      result.push({ depth: result.length, targetTag: target.tagName, targetLabel: target.getAttribute("aria-label"), targetTitle: target.getAttribute("title"),
        centerX: x, centerY: y, innerWidth: view.innerWidth, innerHeight: view.innerHeight,
        hitTag: hit.tagName, hitTitle: hit.getAttribute("title"), hitWithinTarget: within });
      if (!view.frameElement) break;
      if (result.length >= 3) throw new Error("alignment_frame_bound");
      const frame = view.frameElement, bounds = frame.getBoundingClientRect();
      x += bounds.left + frame.clientLeft; y += bounds.top + frame.clientTop; target = frame; view = frame.ownerDocument.defaultView;
    }
    return result;
  });
  args.report.viewportAlignments.push({ purpose, chain }); return chain;
}

const inspect = (region, label) => region.getByRole("button", { name: "Inspect field: " + label, exact: true });
const selected = (region, label) => region.getByRole("region", { name: "Complete value and evidence: " + label, exact: true });
const clear = region => region.getByRole("button", { name: "Clear selection", exact: true });
const fullJSON = region => region.getByLabel("Complete field JSON", { exact: true });
const currentIntent = (args, label = null) => args.app.getByLabel(label ?? "Last component intent", { exact: true });
async function expectSelected(region, label, value) {
  await expect(inspect(region, label)).toHaveAttribute("aria-pressed", "true");
  await expect(selected(region, label)).toBeVisible(); await jsonIs(fullJSON(region), value);
}
async function noSelection(region) {
  await expect(region.getByText("No field is selected.", { exact: true })).toBeVisible();
  await expect(fullJSON(region)).toHaveCount(0); await expect(clear(region)).toBeDisabled();
}
async function settle(args, reject, expected, record = false) {
  await args.activate(args.page.getByRole("button", { name: reject ? "Reject oldest notification" : "Resolve oldest notification", exact: true }));
  await expect.poll(() => counters(args.page, record)).toEqual(expected);
}

async function recordJourney(args) {
  const { app, host, activate, record } = args, region = regionFor(app, "record");
  await delivered(args, data => { delete data.selectedFieldId; });
  const button = inspect(region, "Profile"), handle = await button.elementHandle(); assert.ok(handle);
  try {
    await activate(button); await expectSelected(region, "Profile", JSON.parse(await host.getByRole("textbox", { name: "Tool result JSON", exact: true }).inputValue()).structuredContent.data.record.fields[0].value);
    await jsonIs(currentIntent(args), { type: "inspect-record-field", data: { ...recordScope, ...profileScope } });
    await expect(selected(region, "Profile")).toContainText("END-RECORD-EVIDENCE");
    const link = selected(region, "Profile").getByRole("link", { name: "https://example.com/supplied-record", exact: true });
    await expect(link).toHaveAttribute("target", "_blank"); await expect(link).toHaveAttribute("rel", "noopener noreferrer"); await expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
    record("current_record_field_full_value_and_identity", { proof: await snapshot(region, app, host), safeLinkNotFollowed: true }); await capture(args, "selected", button);
    const refresh = await producerRefresh(args, data => { data.record.fields.push({ id: "appendix", revision: "1", label: "Unrelated appended field", value: "END-APPENDIX", evidence: [] }); }, button);
    await expect(inspect(region, "Unrelated appended field")).toBeVisible(); await sameNode(button, handle); await expect(button).toBeFocused();
    assert.equal(await button.evaluate(node => node.ownerDocument.hasFocus()), true);
    const append = await snapshot(region, app, host);
    await delivered(args, data => { data.record.fields.reverse(); }); await sameNode(button, handle); await expect(button).toHaveAttribute("aria-pressed", "true");
    record("append_preserves_active_focus_and_reorder_preserves_local_choice", { append, proof: await snapshot(region, app, host), sameNativeNode: true, producerRefresh: refresh });
    await delivered(args, data => { const field = data.record.fields.find(item => item.id === "profile"); Object.assign(field, { revision: "2", label: "Replacement profile", value: { replacement: true, end: "END-RECORD-REPLACEMENT" }, confidence: 0.25, evidence: [] }); });
    await noSelection(region); await activate(inspect(region, "Replacement profile")); await expectSelected(region, "Replacement profile", { replacement: true, end: "END-RECORD-REPLACEMENT" });
    await jsonIs(currentIntent(args), { type: "inspect-record-field", data: { ...recordScope, fieldId: "profile", fieldRevision: "2" } });
    record("selected_member_replacement_requires_new_local_choice", { proof: await snapshot(region, app, host) });
    await activate(clear(region)); await noSelection(region); await jsonIs(currentIntent(args), { type: "clear-record-field", data: recordScope });
    record("clear_selection_emits_only_current_record_scope", { proof: await snapshot(region, app, host) });
    const before = await snapshot(region, app, host);
    await delivered(args, data => { data.record.fields[0].evidence = [{ id: "unsafe", label: "Unsafe supplied URL", url: "javascript:alert(1)" }]; }, true);
    await expect(host.getByRole("alert")).toContainText("Invalid component payload");
    const proof = await snapshot(region, app, host); assert.deepEqual(proof.intentValue, before.intentValue);
    record("malformed_producer_refused_without_stale_emission", { before, proof, refusal: original(await rawText(host.getByRole("alert"))) });
  } finally { await handle.dispose(); }
}

async function confidenceJourney(args) {
  const { app, host, activate, record } = args, region = regionFor(app, "confidence");
  await noSelection(region);
  const profile = region.getByRole("meter", { name: "Reported confidence: Profile", exact: true });
  await expect(profile).toHaveAttribute("value", "0"); await expect(profile).toHaveAttribute("aria-valuetext", "0%");
  await expect(region.getByRole("meter", { name: "Reported confidence: Approved", exact: true })).toHaveCount(0);
  await expect(region.locator("li.mcpcn-inspection-field").filter({ hasText: "Approved" })).toContainText("Not supplied");
  record("zero_and_absent_confidence_are_distinct_native_observations", { proof: await snapshot(region, app, host) });
  await activate(inspect(region, "Profile"));
  const expected = JSON.parse(await host.getByRole("textbox", { name: "Tool result JSON", exact: true }).inputValue()).structuredContent.data.fields[0].value;
  await expectSelected(region, "Profile", expected); await jsonIs(currentIntent(args), { type: "inspect-confidence-field", data: { ...confidenceScope, ...profileScope } });
  await expect(selected(region, "Profile")).toContainText("END-RECORD-EVIDENCE");
  record("current_confidence_field_has_complete_value_and_identity", { proof: await snapshot(region, app, host) }); await capture(args, "confidence", selected(region, "Profile"));
  await delivered(args, data => { data.fields = data.fields.filter(item => item.id !== "profile"); data.selectedFieldId = null; });
  await noSelection(region); await expect(inspect(region, "Profile")).toHaveCount(0);
  await jsonIs(currentIntent(args), { type: "inspect-confidence-field", data: { ...confidenceScope, ...profileScope } });
  record("producer_removal_clears_current_controlled_selection", { proof: await snapshot(region, app, host) });
  const states = [];
  for (const state of ["loading", "empty", "error", "ready"]) {
    await delivered(args, data => {
      for (const key of Object.keys(data)) if (!["id", "revision", "title"].includes(key)) delete data[key];
      data.state = state; if (state === "error") data.message = "Authored confidence failure.";
      if (state === "ready") { data.fields = []; data.selectedFieldId = null; }
    });
    await expect(region.getByRole("button", { name: /^Inspect field:/ })).toHaveCount(0); await expect(fullJSON(region)).toHaveCount(0);
    await expect(region).toContainText(state === "loading" ? "Field confidence is loading." : state === "error" ? "Authored confidence failure." : "No fields were supplied.");
    states.push({ state, proof: await snapshot(region, app, host) });
  }
  record("ready_empty_and_nonready_states_hide_private_content", { states });
  const before = await snapshot(region, app, host);
  await delivered(args, data => { data.fields = [{ id: "same", revision: "1", label: "First", value: false }, { id: "same", revision: "2", label: "Second", value: 0 }]; }, true);
  await expect(host.getByRole("alert")).toContainText("Invalid component payload");
  const proof = await snapshot(region, app, host); assert.deepEqual(proof.intentValue, before.intentValue);
  record("duplicate_field_producer_refused_without_stale_emission", { before, proof, refusal: original(await rawText(host.getByRole("alert"))) });
}

const longRows = Array.from({ length: 60 }, (_, index) => `Complete authored JSON row ${String(index + 1).padStart(2, "0")}`);
const completeValue = { flags: [false, 0, null, ""], nested: { literal: "<script>never executed</script>" }, rows: longRows, end: "END-INSPECTION-JSON" };
const completeEvidence = "BEGIN-INSPECTION-EVIDENCE\n" + "Complete authored evidence line.\n".repeat(70) + "END-INSPECTION-EVIDENCE";

async function reading(args, panel, marker) {
  await alignReachable(args, panel, "reading"); args.report.input.readingSetups++;
  let tabSteps = 0;
  while (!(await panel.evaluate(node => node.ownerDocument.activeElement === node)) && tabSteps < 5) { await press(args, "Tab"); tabSteps++; }
  await expect(panel).toBeFocused();
  const measure = async () => panel.evaluate((node, finalMarker) => {
    const text = node.textContent ?? "", offset = text.lastIndexOf(finalMarker), pre = node.querySelector("pre");
    if (offset < 0 || !pre) throw new Error("reading_marker_missing");
    const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT), range = node.ownerDocument.createRange();
    let current, passed = 0, started = false, ended = false;
    while ((current = walker.nextNode())) {
      const length = current.textContent.length;
      if (!started && offset >= passed && offset < passed + length) { range.setStart(current, offset - passed); started = true; }
      if (started && offset + finalMarker.length <= passed + length) { range.setEnd(current, offset + finalMarker.length - passed); ended = true; break; }
      passed += length;
    }
    if (!started || !ended) throw new Error("reading_marker_range_missing");
    const rect = value => ({ left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height });
    const bounds = node.getBoundingClientRect(), style = getComputedStyle(node), preStyle = getComputedStyle(pre);
    return { body: { rect: rect(bounds), clientRect: { left: bounds.left + node.clientLeft, top: bounds.top + node.clientTop,
      right: bounds.left + node.clientLeft + node.clientWidth, bottom: bounds.top + node.clientTop + node.clientHeight },
      scrollTop: node.scrollTop, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, clientWidth: node.clientWidth,
      overflowY: style.overflowY, focused: node.ownerDocument.activeElement === node, documentHasFocus: node.ownerDocument.hasFocus(), label: node.getAttribute("aria-label"), tabIndex: node.tabIndex },
      pre: { text: pre.textContent, maxHeight: preStyle.maxHeight, overflowX: preStyle.overflowX, overflowY: preStyle.overflowY, scrollTop: pre.scrollTop, scrollHeight: pre.scrollHeight, clientHeight: pre.clientHeight },
      marker: { text: finalMarker, rect: rect(range.getBoundingClientRect()) }, viewport: { innerWidth, innerHeight } };
  }, marker);
  await press(args, "Home"); await expect.poll(async () => (await measure()).body.scrollTop <= 1).toBe(true); const start = await measure();
  assert.ok(start.body.scrollHeight > start.body.clientHeight + 1 && start.body.focused && start.body.documentHasFocus);
  assert.equal(start.pre.maxHeight, "none"); assert.equal(start.pre.overflowY, "visible");
  assert.ok(start.pre.clientHeight > 240 && Math.abs(start.pre.scrollHeight - start.pre.clientHeight) <= 1);
  await press(args, "End"); await expect.poll(async () => {
    const end = await measure(), rect = end.marker.rect, clip = end.body.clientRect;
    return end.body.scrollTop > start.body.scrollTop + 1 && rect.width > 0 && rect.height > 0
      && rect.left >= clip.left - 1 && rect.right <= clip.right + 1 && rect.top >= clip.top - 1 && rect.bottom <= clip.bottom + 1
      && rect.left >= -1 && rect.right <= end.viewport.innerWidth + 1 && rect.top >= -1 && rect.bottom <= end.viewport.innerHeight + 1;
  }).toBe(true); const end = await measure();
  await press(args, "Home"); await expect.poll(async () => (await measure()).body.scrollTop <= 1).toBe(true);
  return { marker, tabSteps, keySequence: ["Home", "End", "Home"], start: original(JSON.stringify(start)), end: original(JSON.stringify(end)), restored: original(JSON.stringify(await measure())) };
}

async function valuesJourney(args) {
  const { app, host, activate, record } = args, region = regionFor(app, "values");
  await delivered(args, data => {
    delete data.selectedFieldId;
    data.record.fields = [{ id: "complete", revision: "1", label: "Complete JSON", value: completeValue, confidence: 0,
      evidence: [{ id: "complete-proof", label: "Complete supplied evidence", text: completeEvidence, url: "https://example.com/complete-record" }] }];
  });
  const button = inspect(region, "Complete JSON"); await activate(button); await expectSelected(region, "Complete JSON", completeValue);
  await jsonIs(currentIntent(args), { type: "inspect-record-field", data: { ...recordScope, fieldId: "complete", fieldRevision: "1" } });
  await expect(selected(region, "Complete JSON")).toContainText(completeEvidence); assert.equal(await selected(region, "Complete JSON").locator("script").count(), 0);
  record("complete_nested_value_and_evidence_are_escaped_and_private", { proof: await snapshot(region, app, host), expectedValue: completeValue, expectedEvidence: original(completeEvidence) });
  const panel = selected(region, "Complete JSON"), handle = await panel.elementHandle(); assert.ok(handle);
  try {
    const keyboardReading = await reading(args, panel, "END-INSPECTION-EVIDENCE");
    record("keyboard_home_end_reads_final_supplied_marker", { proof: await snapshot(region, app, host), keyboardReading }); await capture(args, "reading", panel);
    const equivalent = { end: "END-INSPECTION-JSON", rows: [...longRows], nested: { literal: "<script>never executed</script>" }, flags: [false, 0, null, ""] };
    const refresh = await producerRefresh(args, data => { data.record.fields[0].value = equivalent; }, panel);
    await sameNode(panel, handle); await expect(panel).toBeFocused(); assert.equal(await panel.evaluate(node => node.ownerDocument.hasFocus()), true);
    assert.deepEqual(await json(fullJSON(region)), equivalent);
    record("equivalent_value_refresh_preserves_native_selection_node_and_focus", { proof: await snapshot(region, app, host), sameNativeNode: true, producerRefresh: refresh, expectedValue: completeValue });
  } finally { await handle.dispose(); }
  const values = [];
  for (const [index, value] of [null, false, 0, "", [], {}].entries()) {
    const revision = String(index + 2);
    await delivered(args, data => { const field = data.record.fields[0]; field.value = value; field.revision = revision; field.evidence = []; delete field.confidence; });
    await noSelection(region); await activate(button); await expectSelected(region, "Complete JSON", value);
    await jsonIs(currentIntent(args), { type: "inspect-record-field", data: { ...recordScope, fieldId: "complete", fieldRevision: revision } });
    await expect(region).not.toContainText("END-INSPECTION-EVIDENCE");
    values.push({ value, proof: await snapshot(region, app, host) });
  }
  record("all_json_primitives_remain_complete_without_stale_evidence", { values });
}

const suppliedProfile = { confirmed: false, count: 0, next: null, empty: "", items: [false, 0, null, "", { literal: "<script>never executed</script>", end: "END-RECORD-JSON" }] };
const demoButton = (args, name) => args.page.getByRole("button", { name, exact: true });
async function demoProof(args, region, record) { return snapshot(region, args.page, null, record ? recordLast : confidenceLast); }
async function expectCounts(args, record, expected) { await expect.poll(() => counters(args.page, record)).toEqual(expected); }
async function noFailure(region) { await expect(region.getByText(actionError, { exact: true })).toHaveCount(0); }

async function controlledJourney(args) {
  const { page, activate, record } = args, region = regionFor(page, "controlled");
  await noSelection(region); await selectOption(args, page, "Selection ownership", "controlled");
  await activate(inspect(region, "Profile")); await noSelection(region);
  await jsonIs(currentIntent(args, recordLast), { type: "inspect-record-field", data: { ...recordScope, ...profileScope } });
  await expectCounts(args, true, { intents: 1, settled: 1, pending: 0 });
  const waiting = await demoProof(args, region, true);
  await activate(demoButton(args, "Apply last selection request")); await expectSelected(region, "Profile", suppliedProfile);
  record("controlled_request_waits_for_explicit_consumer_acknowledgement", { waiting, proof: await demoProof(args, region, true) });
  await activate(clear(region)); await expectSelected(region, "Profile", suppliedProfile);
  await jsonIs(currentIntent(args, recordLast), { type: "clear-record-field", data: recordScope });
  await expectCounts(args, true, { intents: 2, settled: 2, pending: 0 }); const clearWaiting = await demoProof(args, region, true);
  await activate(demoButton(args, "Apply last selection request")); await noSelection(region);
  record("controlled_clear_waits_and_has_no_member_identifiers", { waiting: clearWaiting, proof: await demoProof(args, region, true) });
  await activate(inspect(region, "Profile")); await activate(demoButton(args, "Apply last selection request")); await expectSelected(region, "Profile", suppliedProfile);
  await checked(args, "Callback enabled", false);
  const buttons = region.getByRole("button", { name: /^Inspect field:/ });
  for (let index = 0; index < await buttons.count(); index++) await expect(buttons.nth(index)).toBeDisabled();
  await expect(clear(region)).toBeDisabled(); await expectSelected(region, "Profile", suppliedProfile);
  const readonly = await demoProof(args, region, true);
  await selectOption(args, page, "Selection ownership", "local"); await noSelection(region); await activate(inspect(region, "Approved"));
  await expectSelected(region, "Approved", false); await expectCounts(args, true, { intents: 3, settled: 3, pending: 0 });
  record("callback_free_local_reading_follows_controlled_readonly", { readonly, proof: await demoProof(args, region, true) });
  await checked(args, "Callback enabled", true); await selectOption(args, page, "Notification response", "hold");
  await activate(inspect(region, "Profile")); await expectSelected(region, "Profile", suppliedProfile);
  await expectCounts(args, true, { intents: 4, settled: 3, pending: 1 }); const pending = await demoProof(args, region, true);
  await activate(demoButton(args, "Replace record")); await noSelection(region); const replaced = await demoProof(args, region, true);
  await settle(args, true, { intents: 4, settled: 4, pending: 0 }, true); await noSelection(region); await noFailure(region); const settled = await demoProof(args, region, true);
  await activate(inspect(region, "Profile")); await expectSelected(region, "Profile", suppliedProfile);
  const newRecord = { ...recordScope, recordId: "record-1-replacement-2", recordRevision: "2" };
  await jsonIs(currentIntent(args, recordLast), { type: "inspect-record-field", data: { ...newRecord, ...profileScope } });
  await settle(args, false, { intents: 5, settled: 5, pending: 0 }, true); await noFailure(region);
  record("record_replacement_fences_old_rejection_and_uses_current_scope", { pending, replaced, settled, proof: await demoProof(args, region, true) });
  await activate(inspect(region, "Count")); await expectSelected(region, "Count", 0); await expectCounts(args, true, { intents: 6, settled: 5, pending: 1 });
  const rootPending = await demoProof(args, region, true);
  await activate(demoButton(args, "Replace inspection")); await noSelection(region); const rootReplaced = await demoProof(args, region, true);
  await settle(args, true, { intents: 6, settled: 6, pending: 0 }, true); await noSelection(region); await noFailure(region); const rootSettled = await demoProof(args, region, true);
  await activate(inspect(region, "Approved")); await expectSelected(region, "Approved", false);
  await jsonIs(currentIntent(args, recordLast), { type: "inspect-record-field", data: { ...recordScope, componentId: "record-inspector-1-replacement-2", componentRevision: "2", fieldId: "approved", fieldRevision: "1" } });
  await settle(args, false, { intents: 7, settled: 7, pending: 0 }, true); await noFailure(region);
  record("root_replacement_fences_old_notification_and_uses_current_component", { pending: rootPending, replaced: rootReplaced, settled: rootSettled, proof: await demoProof(args, region, true) });
  await capture(args, "controlled", selected(region, "Approved"));
}

async function fencesJourney(args) {
  const { page, activate, record } = args, region = regionFor(page, "fences");
  await noSelection(region); await selectOption(args, page, "Notification response", "hold"); await checked(args, "External busy", true);
  await activate(inspect(region, "Profile")); await expectSelected(region, "Profile", suppliedProfile);
  await expectCounts(args, false, { intents: 1, settled: 0, pending: 1 }); const profile = await demoProof(args, region, false);
  await activate(inspect(region, "Profile")); await expectCounts(args, false, { intents: 1, settled: 0, pending: 1 });
  await activate(inspect(region, "Count")); await expectSelected(region, "Count", 0); await expectCounts(args, false, { intents: 2, settled: 0, pending: 2 });
  record("local_reading_and_switching_remain_available_during_pending_busy", { profile, proof: await demoProof(args, region, false) });
  await settle(args, true, { intents: 2, settled: 1, pending: 1 }); await expectSelected(region, "Count", 0); await noFailure(region);
  record("old_selected_member_rejection_settles_without_current_feedback", { proof: await demoProof(args, region, false) });
  const button = inspect(region, "Count"), handle = await button.elementHandle(); assert.ok(handle);
  try {
    await activate(demoButton(args, "Append unrelated field")); await expect(inspect(region, "Unrelated appended field")).toBeVisible();
    await activate(demoButton(args, "Reorder fields")); await sameNode(button, handle); await expectSelected(region, "Count", 0);
    await activate(button); await expectCounts(args, false, { intents: 2, settled: 1, pending: 1 });
    record("append_reorder_preserve_current_pending_member_guard", { proof: await demoProof(args, region, false), sameNativeNode: true });
  } finally { await handle.dispose(); }
  const pending = await demoProof(args, region, false); await activate(demoButton(args, "Replace selected field")); await noSelection(region);
  await expect(inspect(region, "Replacement field")).toBeVisible(); await expect(region).not.toContainText("END-REPLACEMENT-FIELD"); const replaced = await demoProof(args, region, false);
  await settle(args, true, { intents: 2, settled: 2, pending: 0 }); await noSelection(region); await noFailure(region);
  record("member_replacement_fences_old_rejection_and_hides_old_value", { pending, replaced, proof: await demoProof(args, region, false) });
  const replacement = { replaced: true, marker: "END-REPLACEMENT-FIELD" };
  await activate(inspect(region, "Replacement field")); await expectSelected(region, "Replacement field", replacement); await expectCounts(args, false, { intents: 3, settled: 2, pending: 1 });
  await jsonIs(currentIntent(args, confidenceLast), { type: "inspect-confidence-field", data: { ...confidenceScope, fieldId: "count", fieldRevision: "2" } });
  await checked(args, "Callback enabled", false); const callbackRemoved = await demoProof(args, region, false);
  await settle(args, true, { intents: 3, settled: 3, pending: 0 }); await noFailure(region); await expectSelected(region, "Replacement field", replacement); const oldSettled = await demoProof(args, region, false);
  await checked(args, "Callback enabled", true); await activate(inspect(region, "Replacement field")); await expectCounts(args, false, { intents: 4, settled: 3, pending: 1 });
  await settle(args, true, { intents: 4, settled: 4, pending: 0 }); await expectSelected(region, "Replacement field", replacement); await expect(region.getByText(actionError, { exact: true })).toBeVisible();
  record("callback_availability_fences_old_rejection_then_current_failure_is_truthful", { callbackRemoved, oldSettled, proof: await demoProof(args, region, false) }); await capture(args, "fence", selected(region, "Replacement field"));
  await selectOption(args, page, "Notification response", "immediate"); await activate(inspect(region, "Approved")); await expectSelected(region, "Approved", false); await noFailure(region);
  await activate(clear(region)); await noSelection(region); await expectCounts(args, false, { intents: 6, settled: 6, pending: 0 }); const before = await demoProof(args, region, false);
  await checked(args, "Callback enabled", false); await activate(inspect(region, "Next step")); await expectSelected(region, "Next step", null);
  const local = await demoProof(args, region, false); await activate(clear(region)); await noSelection(region); await expectCounts(args, false, { intents: 6, settled: 6, pending: 0 });
  await jsonIs(currentIntent(args, confidenceLast), { type: "clear-confidence-field", data: confidenceScope });
  record("callback_free_local_reading_and_clear_emit_nothing", { before, local, proof: await demoProof(args, region, false) });
}

async function explicitStates(args, region, record) {
  const states = [];
  for (const state of ["loading", "empty", "error", "ready-empty", "ready"]) {
    await selectOption(args, args.page, "Reported state", state);
    await expect(fullJSON(region)).toHaveCount(0);
    if (state === "ready") await noSelection(region);
    else {
      await expect(region.getByRole("button", { name: /^Inspect field:/ })).toHaveCount(0);
      await expect(region).toContainText(state === "loading" ? record ? "Record is loading." : "Field confidence is loading."
        : state === "error" ? "Authored inspection failure." : state === "empty" && record ? "No record was supplied." : "No fields were supplied.");
    }
    states.push({ state, proof: await demoProof(args, region, record) });
  }
  return states;
}
async function malformedDemo(args, region, record) {
  const before = await counters(args.page, record);
  await checked(args, "Malformed inspection", true);
  const demo = args.page.locator(`section[aria-label="${record ? "Record inspector" : "Field confidence"} demonstration"]`);
  await expect(demo.getByRole("alert")).toContainText(record ? "Record inspection data is invalid" : "Field confidence data is invalid");
  await expect(region).toHaveCount(0); await expect(demo.getByLabel("Complete field JSON", { exact: true })).toHaveCount(0);
  const invalid = await demoProof(args, demo, record);
  await checked(args, "Malformed inspection", false); await noSelection(region); await expectCounts(args, record, before);
  return { invalid, proof: await demoProof(args, region, record) };
}
async function statesJourney(args) {
  const { page, activate, record } = args; let region = regionFor(page, "states");
  record("record_explicit_states_do_not_infer_data_or_emit", { states: await explicitStates(args, region, true) }); await expectCounts(args, true, { intents: 0, settled: 0, pending: 0 });
  await activate(inspect(region, "Approved")); await expectSelected(region, "Approved", false);
  record("malformed_record_hides_selected_value_then_recovers", await malformedDemo(args, region, true));
  await navigate(args, "/components/field-confidence-list"); region = regionFor(page, "fences");
  await expect(region).toBeVisible(); await noSelection(region); await expectCounts(args, false, { intents: 0, settled: 0, pending: 0 }); assert.equal(page.frames().length, 1);
  record("actual_confidence_route_starts_fresh_local_inspection", { proof: await demoProof(args, region, false) });
  record("confidence_explicit_states_distinguish_ready_empty", { states: await explicitStates(args, region, false) }); await expectCounts(args, false, { intents: 0, settled: 0, pending: 0 });
  await activate(inspect(region, "Count")); await expectSelected(region, "Count", 0);
  await jsonIs(currentIntent(args, confidenceLast), { type: "inspect-confidence-field", data: { ...confidenceScope, fieldId: "count", fieldRevision: "1" } });
  const meter = selected(region, "Count").getByRole("meter", { name: "Reported confidence: Count", exact: true });
  await expect(meter).toHaveAttribute("value", "1"); await expect(meter).toHaveAttribute("aria-valuetext", "100%"); const selectedCount = await demoProof(args, region, false);
  await activate(clear(region)); await noSelection(region); await jsonIs(currentIntent(args, confidenceLast), { type: "clear-confidence-field", data: confidenceScope });
  record("current_confidence_value_and_meter_remain_readable", { selected: selectedCount, proof: await demoProof(args, region, false) });
  await activate(inspect(region, "Profile")); await expectSelected(region, "Profile", suppliedProfile);
  record("malformed_confidence_hides_selected_value_then_recovers", await malformedDemo(args, region, false));
  await capture(args, "states", inspect(region, "Profile"));
}

const CASES = [
  ["I01", "I01 desktop docs current supplied record inspection", "desktop", "record", "docs", recordJourney],
  ["I02", "I02 narrow docs current supplied record inspection", "narrow", "record", "docs", recordJourney],
  ["I03", "I03 desktop CLI dev reported field confidence", "desktop", "confidence", "cliDev", confidenceJourney],
  ["I04", "I04 narrow CLI dev reported field confidence", "narrow", "confidence", "cliDev", confidenceJourney],
  ["I05", "I05 desktop CLI preview complete values and keyboard reading", "desktop", "values", "cliPreview", valuesJourney],
  ["I06", "I06 narrow CLI preview complete values and keyboard reading", "narrow", "values", "cliPreview", valuesJourney],
  ["I07", "I07 desktop docs controlled record acknowledgement and scope", "desktop", "controlled", "docs", controlledJourney],
  ["I08", "I08 narrow docs controlled record acknowledgement and scope", "narrow", "controlled", "docs", controlledJourney],
  ["I09", "I09 desktop docs pending confidence notification fences", "desktop", "fences", "docs", fencesJourney],
  ["I10", "I10 narrow docs pending confidence notification fences", "narrow", "fences", "docs", fencesJourney],
  ["I11", "I11 desktop direct docs explicit inspection states", "desktop", "states", "docs", statesJourney],
  ["I12", "I12 narrow direct docs explicit inspection states", "narrow", "states", "docs", statesJourney],
];

async function runCase(browser, testInfo, [caseId, title, profile, scenario, originKey, journey]) {
  assert.equal(testInfo.retry, 0); assert.equal(browser.browserType().name(), "chromium"); testInfo.setTimeout(40000);
  const started = performance.now(), deadline = started + 36000, closeDeadline = started + 39000, origin = origins[originKey];
  const direct = ["controlled", "fences", "states"].includes(scenario);
  const route = direct ? scenario === "fences" ? "/components/field-confidence-list" : "/components/record-inspector" : originKey === "docs" ? "/playground" : "/?component=" + slugs[scenario];
  const jsonPath = path.join(output, caseId + ".json"), pngPath = path.join(output, caseId + ".png"); await absent(jsonPath); await absent(pngPath);
  const viewport = profile === "desktop" ? { width: 1280, height: 900 } : { width: 390, height: 844 };
  const report = { schemaVersion: 1, sourceCommit, caseId, title, profile, scenario, originKey, route, origin, playwright: packageManifest.version, browserVersion: browser.version(), startedAt: new Date().toISOString(), viewport, touchEmulated: profile === "narrow", status: "failed", observations: [],
    stageScreenshots: [], secondaryNavigations: [], viewportAlignments: [], input: { trackedTaps: 0, trackedClicks: 0, keyboardActions: 0, pointerActions: 0, nativeSelections: 0, editorFills: 0, readingSetups: 0, programmaticProducerInvocations: 0, programmaticFocusRestorations: 0 }, wire: [], sdkSends: {}, displayMessages: [],
    console: { debugCount: 0, warningCount: 0, warnings: [], sdkSendPreviewCount: 0, responsePreviewCount: 0, unclassifiedSendCount: 0, unclassifiedSends: [] }, downloadEvents: 0, blobDownload: { rows: [], nativeDownloadJoined: null },
    network: { requests: 0, requestFailures: 0, consoleErrors: 0, pageErrors: 0, webSockets: 0, errorCount: 0, errors: [], rows: [] },
    cleanup: { contextCreated: false, contextClosed: false, pagesCreated: 0, pagesClosed: 0, pendingRequests: null, observerJobs: null, downloadArmRemaining: false },
    limits: { workMs: 36000, closeMs: 39000, nativeMs: 40000, reportBytes: 262144, screenshotBytes: 262144 },
    proofLimits: ["Only caller-supplied record values, confidence and evidence are inspected. No source fetching/verification, tool/context/message call, persistence or clipboard.",
      "Narrow Chromium is touch emulation; physical devices, complete assistive technology and external MCP hosts remain unverified.",
      "Complete native DOM, JSON value, identity-only intent, producer input and callback-counter originals are retained. Native HTTP settlement is distinct from raw socket/process cleanup.",
      "Two producer refresh scenarios prepare the real editor and active app focus BEFORE delivery through the existing Invoke button's HTMLElement.click. Those counts are separate from real component clicks/taps; focus is never repaired after delivery. Every tracked activation, native select, reading setup and stage capture aligns and hit-tests the target through all actual ancestor viewports."] };
  let context, page, observer, primary;
  const record = (stage, value) => { assert.ok(report.observations.length < 20); report.observations.push({ stage, atMs: performance.now() - started, ...value }); };
  try {
    context = await browser.newContext({ viewport, isMobile: profile === "narrow", hasTouch: profile === "narrow", locale: "en-US", timezoneId: "UTC", acceptDownloads: false, permissions: [] }); report.cleanup.contextCreated = true;
    context.setDefaultTimeout(3000); context.setDefaultNavigationTimeout(10000); observer = observe(context, report, started, deadline, origin); page = await context.newPage();
    const response = await within(() => page.goto(origin + route, { waitUntil: "load", timeout: 10000 }), deadline, "navigation_deadline"); assert.ok(response); assert.equal(response.status(), 200);
    const request = response.request(), navigation = observer.rows.get(request); assert.ok(navigation && request.isNavigationRequest() && request.frame() === page.mainFrame()); assert.equal(request.url(), origin + route);
    const args = { page, context, host: null, app: page, report, observer, record, deadline, profile };
    args.activate = async locator => {
      await alignReachable(args, locator, "activate");
      if (profile === "narrow") { await locator.tap(); report.input.trackedTaps++; } else { await locator.click(); report.input.trackedClicks++; }
    };
    if (direct) {
      await expect(regionFor(page, scenario)).toBeVisible(); assert.equal(page.frames().length, 1);
      report.frames = { outerPage: locationMeta(page.url()), hostUrl: null, appUrl: null, sessionFragmentSha256: null, hostRole: null, appRole: null, hostFrameCount: 0, appFrameCount: 0, actualFrameCount: 1 };
    } else {
      args.host = originKey === "docs" ? page.frameLocator('iframe[title="MCPCN host simulator"]') : page; args.app = await ready(args.host);
      await selectOption(args, args.host, "Theme", profile === "narrow" ? "dark" : "light");
      await selectOption(args, args.host, "Viewport", profile === "narrow" ? "390" : "760");
      await selectOption(args, args.host, "Component or block", slugs[scenario]); args.app = await ready(args.host);
      await jsonIs(args.app.getByLabel("Received tool input", { exact: true }), { component: slugs[scenario] });
      await expect(args.app.locator("main.frame-app")).toHaveAttribute("data-theme", profile === "narrow" ? "dark" : "light");
      const appElement = args.host.locator('iframe[title="Rendered MCP app"]'), appSrc = await appElement.getAttribute("src"); assert.ok(appSrc);
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
    record(direct ? "actual_docs_component_ready" : "actual_nested_bridge_ready", { frames: report.frames, viewport: report.observedViewport, theme: direct ? null : profile === "narrow" ? "dark" : "light", proof: await snapshot(regionFor(args.app, scenario), args.app, args.host, direct ? scenario === "fences" ? confidenceLast : recordLast : null) });
    await within(() => journey(args), deadline, "journey_deadline");
    assert.ok(profile === "narrow" ? report.input.trackedTaps > 0 : report.input.trackedClicks > 0); await observer.settle(); report.cookieCount = (await context.cookies()).length; assert.equal(report.cookieCount, 0);
    assert.deepEqual(report.wire, []); for (const method of forbiddenMethods) assert.equal(report.sdkSends[method] ?? 0, 0);
    if (direct) assert.equal(Object.keys(report.sdkSends).length, 0); else for (const method of ["ui/initialize", "ui/notifications/initialized", "ui/notifications/tool-input", "ui/notifications/tool-result"]) assert.ok((report.sdkSends[method] ?? 0) > 0);
    assert.equal(report.downloadEvents, 0); assert.equal(report.network.requestFailures, 0); assert.equal(report.console.unclassifiedSendCount, 0);
    assert.equal(report.stageScreenshots.length, 1);
    assert.equal(report.viewportAlignments.length, report.input.trackedTaps + report.input.trackedClicks + report.input.nativeSelections + report.input.readingSetups + report.stageScreenshots.length);
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

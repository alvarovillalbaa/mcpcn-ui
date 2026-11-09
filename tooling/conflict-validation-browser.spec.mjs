// Supplied conflict and validation checks; no automatic resolution, fetch, tool or persistence.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";

const tools = process.env.MCPCN_CV_BROWSER_TOOLS;
assert.ok(tools && path.isAbsolute(tools));
const { test, expect: playwrightExpect } = createRequire(path.join(tools, "package.json"))("playwright/test");
const expect = playwrightExpect.configure({ timeout: 3000 });
const packageManifest = JSON.parse(await readFile(path.join(tools, "package.json"), "utf8"));
assert.equal(packageManifest.name, "playwright"); assert.equal(packageManifest.version, "1.65.0");
const origins = Object.fromEntries([["docs", "MCPCN_CV_ORIGIN", "4173"], ["cliDev", "MCPCN_CV_CLI_DEV_ORIGIN", "4545"], ["cliPreview", "MCPCN_CV_CLI_PREVIEW_ORIGIN", "4546"]].map(([key, name, port]) => {
  const url = new URL(process.env[name] ?? "");
  assert.equal(url.protocol, "http:"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, port);
  assert.equal(url.href, url.origin + "/"); assert.ok(!url.username && !url.password); return [key, url.origin];
}));
const output = process.env.MCPCN_CV_BROWSER_OUTPUT, sourceCommit = process.env.SOURCE_COMMIT;
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
const slugs = { conflict: "conflict-resolver", validation: "validation-summary", values: "validation-summary" };
const labels = { conflict: "Supplied conflict choices", validation: "Supplied validation report", values: "Supplied validation report", controlled: "Review supplied conflict choices", fences: "Review supplied conflict choices", states: "Review supplied conflict choices" };
const actionError = "The action could not be completed. Try again.";
const conflictScope = { componentId: "conflict-resolver-1", componentRevision: "1", conflictId: "conflict-1", conflictRevision: "1" };
const validationScope = { componentId: "validation-summary-1", componentRevision: "1", reportId: "report-1", reportRevision: "1" };
const candidateScope = { candidateId: "preferred", candidateRevision: "1" };
const issueScope = { issueId: "format", issueRevision: "1" };
const regionFor = (app, scenario) => app.getByRole("region", { name: labels[scenario], exact: true });
const conflictLast = "Last conflict resolver intent", validationLast = "Last validation summary intent";
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
    values: [...element.querySelectorAll('pre[aria-label="Complete candidate JSON"],pre[aria-label="Complete issue context"]')].map(node => ({ label: node.getAttribute("aria-label"), text: node.textContent })),
    evidenceLists: [...element.querySelectorAll('ul[aria-label="Supplied evidence"]')].map(node => ({ label: node.getAttribute("aria-label"), text: node.textContent })),
    meters: [...element.querySelectorAll("meter")].map(node => ({ tag: node.tagName, label: node.getAttribute("aria-label"),
      min: node.min, max: node.max, value: node.value, ariaValueText: node.getAttribute("aria-valuetext") })),
    statuses: [...element.querySelectorAll('[role="status"]')].map(node => node.textContent), alerts: [...element.querySelectorAll('[role="alert"]')].map(node => node.textContent),
    counters: [...document.querySelectorAll("output[aria-label]")].map(node => ({ label: node.getAttribute("aria-label"), text: node.textContent })),
    viewport: { innerWidth, innerHeight, documentWidth: document.documentElement.scrollWidth, maxTouchPoints: navigator.maxTouchPoints },
  }));
  const intent = await rawText(app.getByLabel(directLabel ?? "Last component intent", { exact: true }));
  const payload = host ? await host.getByRole("textbox", { name: "Tool result JSON", exact: true }).inputValue() : null;
  const received = host ? await rawText(app.getByLabel("Received conflict or validation payload", { exact: true })) : null;
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
  if (!invalid) await jsonIs(args.app.getByLabel("Received conflict or validation payload", { exact: true }), value.structuredContent);
  return { preparedPayload: original(JSON.stringify(value)),
    receivedPayload: invalid ? null : original(await rawText(args.app.getByLabel("Received conflict or validation payload", { exact: true }))) };
}
async function counters(page, conflict = true) {
  const number = async label => Number(await page.getByLabel(label, { exact: true }).textContent());
  return { intents: await number(conflict ? "Conflict resolver intent count" : "Validation summary intent count"),
    notifications: await number("Selection notification count"), notificationSettled: await number("Settled selection notification count"), notificationPending: await number("Pending selection notifications"),
    confirmations: conflict ? await number("Confirmation count") : 0, confirmationSettled: conflict ? await number("Settled confirmation count") : 0, confirmationPending: conflict ? await number("Pending confirmations") : 0 };
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
  const received = args.app.getByLabel("Received conflict or validation payload", { exact: true });
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

const choose = (region, label, conflict = true) => region.getByRole("button", { name: (conflict ? "Select candidate: " : "Inspect issue: ") + label, exact: true });
const selected = (region, label, conflict = true) => region.getByRole("region", { name: (conflict ? "Complete candidate value and evidence: " : "Complete validation issue: ") + label, exact: true });
const clear = region => region.getByRole("button", { name: "Clear selection", exact: true });
const confirm = region => region.getByRole("button", { name: "Confirm choice", exact: true });
const fullJSON = (region, conflict = true) => region.getByLabel(conflict ? "Complete candidate JSON" : "Complete issue context", { exact: true });
const currentIntent = (args, label = null) => args.app.getByLabel(label ?? "Last component intent", { exact: true });
async function expectSelected(region, label, value, conflict = true, hasContext = true) {
  await expect(choose(region, label, conflict)).toHaveAttribute("aria-pressed", "true");
  await expect(selected(region, label, conflict)).toBeVisible();
  if (hasContext) await jsonIs(fullJSON(region, conflict), value); else { await expect(fullJSON(region, false)).toHaveCount(0); await expect(selected(region, label, false)).toContainText("No context was supplied."); }
}
async function noSelection(region, conflict = true) {
  await expect(region.getByText(conflict ? "No candidate is selected." : "No validation issue is selected.", { exact: true })).toBeVisible();
  await expect(fullJSON(region, conflict)).toHaveCount(0); await expect(clear(region)).toBeDisabled();
}
async function expectCounts(args, expected, conflict = true) { await expect.poll(() => counters(args.page, conflict)).toEqual(expected); }
async function demoProof(args, region, conflict = true) { return snapshot(region, args.page, null, conflict ? conflictLast : validationLast); }
async function noFailure(region) { await expect(region.getByText(actionError, { exact: true })).toHaveCount(0); }
const demoButton = (args, name) => args.page.getByRole("button", { name, exact: true });
async function settle(args, channel, reject, expected, conflict = true) {
  await args.activate(demoButton(args, (reject ? "Reject" : "Resolve") + " oldest " + channel));
  await expectCounts(args, expected, conflict);
}

const suppliedCandidate = { confirmed: false, count: 0, next: null, empty: "", items: [false, 0, null, "", { literal: "<script>never executed</script>", end: "END-CONFLICT-JSON" }] };
const suppliedContext = { flags: [false, 0, null, ""], literal: "<script>never executed</script>", end: "END-VALIDATION-JSON" };
const numbers = (intents, notifications, notificationSettled, notificationPending, confirmations = 0, confirmationSettled = 0, confirmationPending = 0) => ({ intents, notifications, notificationSettled, notificationPending, confirmations, confirmationSettled, confirmationPending });

async function conflictJourney(args) {
  const { app, host, activate, record } = args, region = regionFor(app, "conflict");
  await noSelection(region); await expect(confirm(region)).toBeDisabled();
  await delivered(args, data => { delete data.selectedCandidateId; });
  const button = choose(region, "Preferred candidate"), handle = await button.elementHandle(); assert.ok(handle);
  try {
    await activate(button); await expectSelected(region, "Preferred candidate", suppliedCandidate);
    await jsonIs(currentIntent(args), { type: "select-conflict-candidate", data: { ...conflictScope, ...candidateScope } });
    await expect(selected(region, "Preferred candidate")).toContainText("END-CONFLICT-EVIDENCE");
    const zeroMeters = region.getByRole("meter", { name: "Reported confidence: Preferred candidate", exact: true }); await expect(zeroMeters).toHaveCount(2);
    for (let index = 0; index < 2; index++) { await expect(zeroMeters.nth(index)).toHaveAttribute("value", "0"); await expect(zeroMeters.nth(index)).toHaveAttribute("aria-valuetext", "0%"); }
    const link = selected(region, "Preferred candidate").getByRole("link", { name: "https://example.com/supplied-conflict", exact: true });
    await expect(link).toHaveAttribute("target", "_blank"); await expect(link).toHaveAttribute("rel", "noopener noreferrer"); await expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect(region.getByRole("meter", { name: "Reported confidence: Alternative candidate", exact: true })).toHaveCount(0);
    record("current_candidate_complete_value_and_supplied_confidence", { proof: await snapshot(region, app, host), safeLinkNotFollowed: true });
    await activate(confirm(region)); await jsonIs(currentIntent(args), { type: "confirm-conflict-candidate", data: { ...conflictScope, ...candidateScope } });
    await expect(confirm(region)).toBeEnabled(); await expectSelected(region, "Preferred candidate", suppliedCandidate);
    record("explicit_confirmation_only_reports_current_candidate_identity", { proof: await snapshot(region, app, host) }); await capture(args, "choice", selected(region, "Preferred candidate"));
    const refresh = await producerRefresh(args, data => { data.conflict.candidates.push({ id: "appendix", revision: "1", label: "Unrelated appended candidate", value: { note: "END-CONFLICT-APPENDIX" }, evidence: [] }); }, button);
    await expect(choose(region, "Unrelated appended candidate")).toBeVisible(); await sameNode(button, handle); await expect(button).toBeFocused();
    assert.equal(await button.evaluate(node => node.ownerDocument.hasFocus()), true); const append = await snapshot(region, app, host);
    await delivered(args, data => { data.conflict.candidates.reverse(); }); await sameNode(button, handle); await expectSelected(region, "Preferred candidate", suppliedCandidate);
    record("append_focus_and_reorder_preserve_local_candidate_choice", { append, proof: await snapshot(region, app, host), sameNativeNode: true, producerRefresh: refresh });
    await delivered(args, data => { Object.assign(data.conflict.candidates.find(member => member.id === "preferred"), { revision: "2", label: "Replacement candidate", value: { replaced: true, end: "END-CONFLICT-REPLACEMENT" }, confidence: 0.25, evidence: [] }); });
    await noSelection(region); await expect(confirm(region)).toBeDisabled(); await activate(choose(region, "Replacement candidate"));
    await expectSelected(region, "Replacement candidate", { replaced: true, end: "END-CONFLICT-REPLACEMENT" });
    await jsonIs(currentIntent(args), { type: "select-conflict-candidate", data: { ...conflictScope, candidateId: "preferred", candidateRevision: "2" } });
    record("selected_candidate_replacement_requires_new_local_choice", { proof: await snapshot(region, app, host) });
    await activate(clear(region)); await noSelection(region); await expect(confirm(region)).toBeDisabled();
    await jsonIs(currentIntent(args), { type: "clear-conflict-candidate", data: conflictScope });
    record("local_clear_has_no_candidate_or_private_value_fields", { proof: await snapshot(region, app, host) });
    await activate(choose(region, "Alternative candidate")); await expectSelected(region, "Alternative candidate", false); const removedSelection = await snapshot(region, app, host);
    await delivered(args, data => { data.conflict.candidates = data.conflict.candidates.filter(member => member.id !== "alternative"); }); await noSelection(region); await expect(choose(region, "Alternative candidate")).toHaveCount(0);
    record("selected_candidate_removal_clears_local_choice", { before: removedSelection, proof: await snapshot(region, app, host) });
    const before = await snapshot(region, app, host);
    await delivered(args, data => { data.conflict.candidates[0].evidence = [{ id: "unsafe", label: "Unsafe supplied URL", url: "javascript:alert(1)" }]; }, true);
    await expect(host.getByRole("alert")).toContainText("Invalid component payload"); const proof = await snapshot(region, app, host);
    assert.deepEqual(proof.intentValue, before.intentValue);
    record("unsafe_candidate_evidence_is_refused_without_stale_emission", { before, proof, refusal: original(await rawText(host.getByRole("alert"))) });
  } finally { await handle.dispose(); }
}

async function validationJourney(args) {
  const { app, host, activate, record } = args, region = regionFor(app, "validation");
  await noSelection(region, false); await delivered(args, data => { delete data.selectedIssueId; });
  await expect(region).toContainText("Reported validation: valid");
  await activate(choose(region, "Format review", false)); await expectSelected(region, "Format review", suppliedContext, false);
  await expect(selected(region, "Format review", false)).toContainText("Reported severity: error");
  await expect(selected(region, "Format review", false)).toContainText("END-VALIDATION-EVIDENCE");
  await jsonIs(currentIntent(args), { type: "inspect-validation-issue", data: { ...validationScope, ...issueScope } });
  record("reported_valid_status_keeps_complete_supplied_error_issue", { proof: await snapshot(region, app, host) }); await capture(args, "report", selected(region, "Format review", false));
  const reports = [];
  for (const reportedStatus of ["unknown", "pending", "valid", "invalid"]) {
    await delivered(args, data => { data.report.reportedStatus = reportedStatus; });
    await expect(region).toContainText("Reported validation: " + reportedStatus); await expectSelected(region, "Format review", suppliedContext, false);
    await expect(selected(region, "Format review", false)).toContainText("Reported severity: error");
    reports.push({ reportedStatus, proof: await snapshot(region, app, host) });
  }
  record("supplied_status_is_independent_of_unchanged_issue_severity", { reports });
  await delivered(args, data => { Object.assign(data.report.issues[0], { revision: "2", label: "Replacement issue", severity: "warning", message: "Complete replacement supplied issue.", context: null, evidence: [] }); });
  await noSelection(region, false); await activate(choose(region, "Replacement issue", false)); await expectSelected(region, "Replacement issue", null, false);
  await jsonIs(currentIntent(args), { type: "inspect-validation-issue", data: { ...validationScope, issueId: "format", issueRevision: "2" } });
  record("issue_replacement_clears_local_choice_and_preserves_explicit_null", { proof: await snapshot(region, app, host) });
  await delivered(args, data => { data.report.issues = data.report.issues.filter(member => member.id !== "format"); });
  await noSelection(region, false); await expect(choose(region, "Replacement issue", false)).toHaveCount(0);
  record("removed_selected_issue_hides_its_private_context", { proof: await snapshot(region, app, host) });
  const before = await snapshot(region, app, host);
  await delivered(args, data => { data.report.issues.push({ ...data.report.issues[0] }); }, true);
  await expect(host.getByRole("alert")).toContainText("Invalid component payload"); const proof = await snapshot(region, app, host);
  assert.deepEqual(proof.intentValue, before.intentValue);
  record("duplicate_issue_producer_is_refused_without_stale_emission", { before, proof, refusal: original(await rawText(host.getByRole("alert"))) });
}

const longRows = Array.from({ length: 60 }, (_, index) => "Complete authored issue row " + String(index + 1).padStart(2, "0"));
const completeContext = { flags: [false, 0, null, ""], nested: { literal: "<script>never executed</script>" }, rows: longRows, end: "END-CV-JSON" };
const completeEvidence = "BEGIN-CV-EVIDENCE\n" + "Complete authored evidence line.\n".repeat(70) + "END-CV-EVIDENCE";

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
  await delivered(args, data => { delete data.selectedIssueId; data.report.reportedStatus = "valid"; data.report.issues = [{ id: "complete", revision: "1", label: "Complete issue", severity: "error", message: "Complete supplied error context; valid is still the supplied report status.", context: completeContext,
    evidence: [{ id: "complete-proof", label: "Complete supplied evidence", text: completeEvidence, url: "https://example.com/complete-validation" }] }]; });
  const button = choose(region, "Complete issue", false); await activate(button); await expectSelected(region, "Complete issue", completeContext, false);
  await expect(region).toContainText("Reported validation: valid"); await expect(selected(region, "Complete issue", false)).toContainText(completeEvidence);
  assert.equal(await selected(region, "Complete issue", false).locator("script").count(), 0);
  await jsonIs(currentIntent(args), { type: "inspect-validation-issue", data: { ...validationScope, issueId: "complete", issueRevision: "1" } });
  record("complete_nested_issue_context_and_evidence_remain_private", { proof: await snapshot(region, app, host), expectedValue: completeContext, expectedEvidence: original(completeEvidence) });
  const panel = selected(region, "Complete issue", false), handle = await panel.elementHandle(); assert.ok(handle);
  try {
    const keyboardReading = await reading(args, panel, "END-CV-EVIDENCE");
    record("keyboard_home_end_reads_complete_supplied_issue_marker", { proof: await snapshot(region, app, host), keyboardReading }); await capture(args, "reading", panel);
    const equivalent = { end: "END-CV-JSON", rows: [...longRows], nested: { literal: "<script>never executed</script>" }, flags: [false, 0, null, ""] };
    const refresh = await producerRefresh(args, data => { data.report.issues[0].context = equivalent; }, panel);
    await sameNode(panel, handle); await expect(panel).toBeFocused(); assert.equal(await panel.evaluate(node => node.ownerDocument.hasFocus()), true);
    assert.deepEqual(await json(fullJSON(region, false)), equivalent);
    record("equivalent_context_refresh_preserves_native_body_and_focus", { proof: await snapshot(region, app, host), sameNativeNode: true, producerRefresh: refresh, expectedValue: completeContext });
  } finally { await handle.dispose(); }
  const values = [];
  const variants = [null, false, 0, "", [], {}].map(value => ({ present: true, value })); variants.push({ present: false, value: null });
  for (const [index, variant] of variants.entries()) {
    const revision = String(index + 2);
    await delivered(args, data => { const issue = data.report.issues[0]; issue.revision = revision; issue.evidence = []; if (variant.present) issue.context = variant.value; else delete issue.context; });
    await noSelection(region, false); await activate(button); await expectSelected(region, "Complete issue", variant.value, false, variant.present);
    await jsonIs(currentIntent(args), { type: "inspect-validation-issue", data: { ...validationScope, issueId: "complete", issueRevision: revision } });
    await expect(region).not.toContainText("END-CV-EVIDENCE"); values.push({ ...variant, proof: await snapshot(region, app, host) });
  }
  record("complete_falsy_contexts_and_omission_keep_distinct_meanings", { values });
}

async function controlledJourney(args) {
  const { page, activate, record } = args, region = regionFor(page, "controlled");
  await noSelection(region); await selectOption(args, page, "Selection ownership", "controlled");
  await activate(choose(region, "Preferred candidate")); await noSelection(region); await expect(confirm(region)).toBeDisabled();
  await jsonIs(currentIntent(args, conflictLast), { type: "select-conflict-candidate", data: { ...conflictScope, ...candidateScope } }); await expectCounts(args, numbers(1, 1, 1, 0));
  const waiting = await demoProof(args, region); await activate(demoButton(args, "Apply last selection request")); await expectSelected(region, "Preferred candidate", suppliedCandidate);
  record("controlled_candidate_request_waits_for_producer_acknowledgement", { waiting, proof: await demoProof(args, region) });
  await activate(clear(region)); await expectSelected(region, "Preferred candidate", suppliedCandidate); await jsonIs(currentIntent(args, conflictLast), { type: "clear-conflict-candidate", data: conflictScope });
  const clearWaiting = await demoProof(args, region); await activate(demoButton(args, "Apply last selection request")); await noSelection(region); await expectCounts(args, numbers(2, 2, 2, 0));
  record("controlled_clear_waits_and_omits_candidate_identity", { waiting: clearWaiting, proof: await demoProof(args, region) });
  await activate(choose(region, "Alternative candidate")); await noSelection(region); await activate(demoButton(args, "Apply last selection request")); await expectSelected(region, "Alternative candidate", false);
  await checked(args, "Callback enabled", false);
  const buttons = region.getByRole("button", { name: /^Select candidate:/ }); for (let index = 0; index < await buttons.count(); index++) await expect(buttons.nth(index)).toBeDisabled();
  await expect(clear(region)).toBeDisabled(); await expect(confirm(region)).toBeDisabled(); const readonly = await demoProof(args, region);
  await selectOption(args, page, "Selection ownership", "local"); await noSelection(region); await activate(choose(region, "Equal value candidate")); await expectSelected(region, "Equal value candidate", suppliedCandidate);
  await expect(confirm(region)).toBeDisabled(); await expect(demoButton(args, "Replace selected member")).toBeDisabled(); const local = await demoProof(args, region);
  await activate(clear(region)); await noSelection(region); await expectCounts(args, numbers(3, 3, 3, 0));
  record("callback_free_local_choice_is_private_and_controlled_choice_readonly", { readonly, local, proof: await demoProof(args, region) });
  await checked(args, "Callback enabled", true); await activate(choose(region, "Preferred candidate")); await expectSelected(region, "Preferred candidate", suppliedCandidate);
  await selectOption(args, page, "Confirmation response", "throw"); await activate(confirm(region)); await expectCounts(args, numbers(5, 4, 4, 0, 1, 1, 0));
  await expect(region.getByText(actionError, { exact: true })).toBeVisible(); const failure = await demoProof(args, region);
  await selectOption(args, page, "Confirmation response", "immediate"); await activate(confirm(region)); await noFailure(region); await expectCounts(args, numbers(6, 4, 4, 0, 2, 2, 0));
  await jsonIs(currentIntent(args, conflictLast), { type: "confirm-conflict-candidate", data: { ...conflictScope, ...candidateScope } });
  record("current_confirmation_throw_requires_explicit_retry_without_resolution", { failure, proof: await demoProof(args, region) });
  await checked(args, "External busy", true); await expect(confirm(region)).toBeDisabled();
  await activate(choose(region, "Alternative candidate")); await expectSelected(region, "Alternative candidate", false); const switched = await demoProof(args, region);
  await activate(clear(region)); await noSelection(region); await expectCounts(args, numbers(8, 6, 6, 0, 2, 2, 0)); await expect(confirm(region)).toBeDisabled();
  record("external_busy_blocks_confirmation_but_keeps_local_reading_and_clear", { switched, proof: await demoProof(args, region) }); await capture(args, "controlled", choose(region, "Preferred candidate"));
}

async function fencesJourney(args) {
  const { page, activate, record } = args, region = regionFor(page, "fences");
  await noSelection(region); await selectOption(args, page, "Selection notification response", "hold"); await selectOption(args, page, "Confirmation response", "hold");
  await activate(choose(region, "Preferred candidate")); await expectSelected(region, "Preferred candidate", suppliedCandidate); await expectCounts(args, numbers(1, 1, 0, 1));
  await activate(confirm(region)); await expectCounts(args, numbers(2, 1, 0, 1, 1, 0, 1)); await expect(confirm(region)).toBeDisabled(); const pending = await demoProof(args, region);
  await activate(choose(region, "Alternative candidate")); await expectSelected(region, "Alternative candidate", false); await expectCounts(args, numbers(3, 2, 0, 2, 1, 0, 1));
  await activate(clear(region)); await noSelection(region); const cleared = await demoProof(args, region);
  await settle(args, "confirmation", true, numbers(4, 3, 0, 3, 1, 1, 0)); await noFailure(region); await noSelection(region);
  record("switch_and_clear_fence_old_confirmation_without_blocking_reading", { pending, cleared, proof: await demoProof(args, region) });
  await settle(args, "notification", true, numbers(4, 3, 1, 2, 1, 1, 0)); await noFailure(region);
  await settle(args, "notification", true, numbers(4, 3, 2, 1, 1, 1, 0)); await noFailure(region);
  await settle(args, "notification", false, numbers(4, 3, 3, 0, 1, 1, 0)); await noFailure(region);
  record("selection_and_confirmation_queues_settle_independently", { proof: await demoProof(args, region) });
  await activate(choose(region, "Preferred candidate")); await activate(confirm(region)); await expectCounts(args, numbers(6, 4, 3, 1, 2, 1, 1)); const memberPending = await demoProof(args, region);
  await activate(demoButton(args, "Replace selected member")); await noSelection(region); const memberReplaced = await demoProof(args, region);
  await settle(args, "confirmation", true, numbers(6, 4, 3, 1, 2, 2, 0)); await settle(args, "notification", true, numbers(6, 4, 4, 0, 2, 2, 0)); await noSelection(region); await noFailure(region);
  record("selected_candidate_replacement_fences_both_pending_channels", { pending: memberPending, replaced: memberReplaced, proof: await demoProof(args, region) });
  const replacement = { replaced: true, end: "END-CONFLICT-REPLACEMENT" };
  await activate(choose(region, "Replacement candidate")); await expectSelected(region, "Replacement candidate", replacement); await activate(confirm(region)); await expectCounts(args, numbers(8, 5, 4, 1, 3, 2, 1)); const ownerPending = await demoProof(args, region);
  await activate(demoButton(args, "Replace conflict")); await noSelection(region); const ownerReplaced = await demoProof(args, region);
  await settle(args, "confirmation", true, numbers(8, 5, 4, 1, 3, 3, 0)); await settle(args, "notification", true, numbers(8, 5, 5, 0, 3, 3, 0)); await noSelection(region); await noFailure(region);
  record("conflict_identity_replacement_fences_old_selection_and_confirm", { pending: ownerPending, replaced: ownerReplaced, proof: await demoProof(args, region) });
  await activate(choose(region, "Alternative candidate")); await expectSelected(region, "Alternative candidate", false); await activate(confirm(region)); await expectCounts(args, numbers(10, 6, 5, 1, 4, 3, 1));
  await checked(args, "Callback enabled", false); const callbackRemoved = await demoProof(args, region);
  await settle(args, "confirmation", true, numbers(10, 6, 5, 1, 4, 4, 0)); await settle(args, "notification", true, numbers(10, 6, 6, 0, 4, 4, 0)); await noFailure(region); await expectSelected(region, "Alternative candidate", false); const oldSettled = await demoProof(args, region);
  await activate(choose(region, "Equal value candidate")); await expectSelected(region, "Equal value candidate", suppliedCandidate); await expectCounts(args, numbers(10, 6, 6, 0, 4, 4, 0));
  await checked(args, "Callback enabled", true); await expect(demoButton(args, "Replace selected member")).toBeDisabled(); await expect(demoButton(args, "Remove selected member")).toBeDisabled(); const privateChoice = await demoProof(args, region);
  await activate(choose(region, "Equal value candidate")); await expectCounts(args, numbers(11, 7, 6, 1, 4, 4, 0)); await expect(demoButton(args, "Replace selected member")).toBeEnabled();
  record("callback_availability_fences_both_channels_and_keeps_private_choice_unknown", { callbackRemoved, oldSettled, privateChoice, proof: await demoProof(args, region) });
  await activate(confirm(region)); await expectCounts(args, numbers(12, 7, 6, 1, 5, 4, 1)); await checked(args, "Mount component", false); await expect(region).toHaveCount(0);
  const demo = page.locator('section[aria-label="Conflict resolver demonstration"]'), unmounted = await demoProof(args, demo);
  await checked(args, "Mount component", true); await noSelection(region); const remounted = await demoProof(args, region);
  await settle(args, "confirmation", true, numbers(12, 7, 6, 1, 5, 5, 0)); await settle(args, "notification", true, numbers(12, 7, 7, 0, 5, 5, 0)); await noSelection(region); await noFailure(region);
  record("unmounted_view_settlements_cannot_change_the_new_local_view", { unmounted, remounted, proof: await demoProof(args, region) });
  await activate(choose(region, "Replacement candidate")); await activate(confirm(region)); await expectCounts(args, numbers(14, 8, 7, 1, 6, 5, 1)); const rootPending = await demoProof(args, region);
  await activate(demoButton(args, "Replace component")); await noSelection(region); const rootReplaced = await demoProof(args, region);
  await settle(args, "confirmation", true, numbers(14, 8, 7, 1, 6, 6, 0)); await settle(args, "notification", true, numbers(14, 8, 8, 0, 6, 6, 0)); await noSelection(region); await noFailure(region);
  record("component_replacement_fences_obsolete_pending_channels", { pending: rootPending, replaced: rootReplaced, proof: await demoProof(args, region) });
  await activate(choose(region, "Preferred candidate")); await expectSelected(region, "Preferred candidate", suppliedCandidate); await activate(confirm(region)); await expectCounts(args, numbers(16, 9, 8, 1, 7, 6, 1));
  await jsonIs(currentIntent(args, conflictLast), { type: "confirm-conflict-candidate", data: { ...conflictScope, componentId: "conflict-resolver-1-replacement-2", componentRevision: "2", ...candidateScope } });
  await settle(args, "confirmation", true, numbers(16, 9, 8, 1, 7, 7, 0)); await expect(region.locator('[data-feedback-channel="confirmation"]')).toContainText(actionError); const failed = await demoProof(args, region);
  await settle(args, "notification", false, numbers(16, 9, 9, 0, 7, 7, 0)); await expect(region.locator('[data-feedback-channel="confirmation"]')).toContainText(actionError); const notificationSettled = await demoProof(args, region);
  await activate(confirm(region)); await expectCounts(args, numbers(17, 9, 9, 0, 8, 7, 1)); await settle(args, "confirmation", false, numbers(17, 9, 9, 0, 8, 8, 0)); await noFailure(region); await expectSelected(region, "Preferred candidate", suppliedCandidate);
  record("current_confirmation_failure_survives_other_channel_until_explicit_retry", { failed, notificationSettled, proof: await demoProof(args, region) }); await capture(args, "fence", selected(region, "Preferred candidate"));
}

async function explicitStates(args, region, conflict) {
  const states = [];
  for (const state of (conflict ? ["loading", "empty", "error", "ready"] : ["loading", "empty", "error", "ready-empty", "ready"])) {
    await selectOption(args, args.page, "Reported state", state); await expect(fullJSON(region, conflict)).toHaveCount(0);
    if (state === "ready") await noSelection(region, conflict);
    else {
      await expect(region.getByRole("button", { name: conflict ? /^Select candidate:/ : /^Inspect issue:/ })).toHaveCount(0);
      await expect(region).toContainText(state === "loading" ? conflict ? "Conflict candidates are loading." : "Validation report is loading."
        : state === "error" ? "Authored conflict or validation failure." : state === "ready-empty" ? "No validation issues were supplied." : conflict ? "No conflict was supplied." : "No validation report was supplied.");
    }
    states.push({ state, proof: await demoProof(args, region, conflict) });
  }
  return states;
}
async function malformedDemo(args, region, conflict, expected) {
  await checked(args, "Malformed data", true);
  const demo = args.page.locator('section[aria-label="' + (conflict ? "Conflict resolver" : "Validation summary") + ' demonstration"]');
  await expect(demo.getByRole("alert")).toContainText(conflict ? "Conflict data is invalid" : "Validation report data is invalid");
  await expect(region).toHaveCount(0); const invalid = await demoProof(args, demo, conflict);
  await checked(args, "Malformed data", false); await noSelection(region, conflict); await expectCounts(args, expected, conflict);
  return { invalid, proof: await demoProof(args, region, conflict) };
}
async function statesJourney(args) {
  const { page, activate, record } = args; let region = regionFor(page, "states");
  record("explicit_conflict_states_never_infer_choice_or_emit", { states: await explicitStates(args, region, true) }); await expectCounts(args, numbers(0, 0, 0, 0));
  await activate(choose(region, "Preferred candidate")); await expectSelected(region, "Preferred candidate", suppliedCandidate);
  record("malformed_conflict_hides_selected_private_value_then_recovers", await malformedDemo(args, region, true, numbers(1, 1, 1, 0)));
  await navigate(args, "/components/validation-summary"); region = page.getByRole("region", { name: "Inspect supplied validation report", exact: true });
  await expect(region).toBeVisible(); await noSelection(region, false); await expectCounts(args, numbers(0, 0, 0, 0), false); assert.equal(page.frames().length, 1);
  record("actual_validation_route_starts_a_fresh_local_report", { proof: await demoProof(args, region, false) });
  record("validation_states_keep_ready_empty_distinct_from_empty", { states: await explicitStates(args, region, false) });
  const reports = [];
  for (const reportedStatus of ["unknown", "pending", "valid", "invalid"]) {
    await selectOption(args, page, "Reported validation status", reportedStatus); await expect(region).toContainText("Reported validation: " + reportedStatus); await noSelection(region, false);
    await expectCounts(args, numbers(0, 0, 0, 0), false); reports.push({ reportedStatus, proof: await demoProof(args, region, false) });
  }
  record("direct_report_status_changes_preserve_all_supplied_issues_without_emission", { reports });
  await selectOption(args, page, "Selection notification response", "hold"); await activate(choose(region, "Format review", false)); await expectSelected(region, "Format review", suppliedContext, false);
  await expectCounts(args, numbers(1, 1, 0, 1), false); const pending = await demoProof(args, region, false);
  await activate(demoButton(args, "Replace report")); await noSelection(region, false); const replaced = await demoProof(args, region, false);
  await settle(args, "notification", true, numbers(1, 1, 1, 0), false); await noFailure(region); await noSelection(region, false);
  record("validation_report_replacement_fences_old_held_notification", { pending, replaced, proof: await demoProof(args, region, false) });
  await activate(choose(region, "Format review", false)); await activate(choose(region, "Count review", false)); await expectSelected(region, "Count review", 0, false); await expectCounts(args, numbers(3, 3, 1, 2), false);
  const switched = await demoProof(args, region, false); await settle(args, "notification", true, numbers(3, 3, 2, 1), false); await noFailure(region); await expectSelected(region, "Count review", 0, false);
  await checked(args, "Callback enabled", false); const callbackRemoved = await demoProof(args, region, false); await settle(args, "notification", true, numbers(3, 3, 3, 0), false); await noFailure(region);
  record("validation_selection_and_callback_changes_fence_old_rejections", { switched, callbackRemoved, proof: await demoProof(args, region, false) });
  await checked(args, "Callback enabled", true); await activate(choose(region, "No supplied context", false)); await expectSelected(region, "No supplied context", null, false, false); await expectCounts(args, numbers(4, 4, 3, 1), false);
  await settle(args, "notification", true, numbers(4, 4, 4, 0), false); await expect(region.getByText(actionError, { exact: true })).toBeVisible(); const failure = await demoProof(args, region, false);
  await activate(choose(region, "No supplied context", false)); await expectCounts(args, numbers(5, 5, 4, 1), false); await settle(args, "notification", false, numbers(5, 5, 5, 0), false); await noFailure(region);
  await jsonIs(currentIntent(args, validationLast), { type: "inspect-validation-issue", data: { ...validationScope, reportId: "report-1-replacement-2", reportRevision: "2", issueId: "missing", issueRevision: "1" } });
  record("current_validation_failure_keeps_missing_context_distinct_and_needs_retry", { failure, proof: await demoProof(args, region, false) });
  record("malformed_validation_hides_current_issue_then_recovers", await malformedDemo(args, region, false, numbers(5, 5, 5, 0)));
  await capture(args, "states", choose(region, "Format review", false));
}

const CASES = [
  ["R01", "R01 desktop docs supplied conflict choice and explicit confirmation", "desktop", "conflict", "docs", conflictJourney],
  ["R02", "R02 narrow docs supplied conflict choice and explicit confirmation", "narrow", "conflict", "docs", conflictJourney],
  ["R03", "R03 desktop CLI dev supplied validation status and current issues", "desktop", "validation", "cliDev", validationJourney],
  ["R04", "R04 narrow CLI dev supplied validation status and current issues", "narrow", "validation", "cliDev", validationJourney],
  ["R05", "R05 desktop CLI preview complete issue context and keyboard reading", "desktop", "values", "cliPreview", valuesJourney],
  ["R06", "R06 narrow CLI preview complete issue context and keyboard reading", "narrow", "values", "cliPreview", valuesJourney],
  ["R07", "R07 desktop docs controlled conflict selection acknowledgement", "desktop", "controlled", "docs", controlledJourney],
  ["R08", "R08 narrow docs controlled conflict selection acknowledgement", "narrow", "controlled", "docs", controlledJourney],
  ["R09", "R09 desktop docs independent confirmation and notification fences", "desktop", "fences", "docs", fencesJourney],
  ["R10", "R10 narrow docs independent confirmation and notification fences", "narrow", "fences", "docs", fencesJourney],
  ["R11", "R11 desktop docs explicit states and validation callback scope", "desktop", "states", "docs", statesJourney],
  ["R12", "R12 narrow docs explicit states and validation callback scope", "narrow", "states", "docs", statesJourney],
];

async function runCase(browser, testInfo, [caseId, title, profile, scenario, originKey, journey]) {
  assert.equal(testInfo.retry, 0); assert.equal(browser.browserType().name(), "chromium"); testInfo.setTimeout(40000);
  const started = performance.now(), deadline = started + 36000, closeDeadline = started + 39000, origin = origins[originKey];
  const direct = ["controlled", "fences", "states"].includes(scenario);
  const route = direct ? "/components/conflict-resolver" : originKey === "docs" ? "/playground" : "/?component=" + slugs[scenario];
  const jsonPath = path.join(output, caseId + ".json"), pngPath = path.join(output, caseId + ".png"); await absent(jsonPath); await absent(pngPath);
  const viewport = profile === "desktop" ? { width: 1280, height: 900 } : { width: 390, height: 844 };
  const report = { schemaVersion: 1, sourceCommit, caseId, title, profile, scenario, originKey, route, origin, playwright: packageManifest.version, browserVersion: browser.version(), startedAt: new Date().toISOString(), viewport, touchEmulated: profile === "narrow", status: "failed", observations: [],
    stageScreenshots: [], secondaryNavigations: [], viewportAlignments: [], input: { trackedTaps: 0, trackedClicks: 0, keyboardActions: 0, pointerActions: 0, nativeSelections: 0, editorFills: 0, readingSetups: 0, programmaticProducerInvocations: 0, programmaticFocusRestorations: 0 }, wire: [], sdkSends: {}, displayMessages: [],
    console: { debugCount: 0, warningCount: 0, warnings: [], sdkSendPreviewCount: 0, responsePreviewCount: 0, unclassifiedSendCount: 0, unclassifiedSends: [] }, downloadEvents: 0, blobDownload: { rows: [], nativeDownloadJoined: null },
    network: { requests: 0, requestFailures: 0, consoleErrors: 0, pageErrors: 0, webSockets: 0, errorCount: 0, errors: [], rows: [] },
    cleanup: { contextCreated: false, contextClosed: false, pagesCreated: 0, pagesClosed: 0, pendingRequests: null, observerJobs: null, downloadArmRemaining: false },
    limits: { workMs: 36000, closeMs: 39000, nativeMs: 40000, reportBytes: 262144, screenshotBytes: 262144 },
    proofLimits: ["Only supplied conflict candidates, reported validation status, issues, context and evidence are inspected. No inferred resolution or validation, source fetching/verification, tool/context/message call, persistence or clipboard.",
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
    record(direct ? "actual_docs_component_ready" : "actual_nested_bridge_ready", { frames: report.frames, viewport: report.observedViewport, theme: direct ? null : profile === "narrow" ? "dark" : "light", proof: await snapshot(regionFor(args.app, scenario), args.app, args.host, direct ? conflictLast : null) });
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

// Supplied option and ranking checks; no sorting, recommendation, fetch, tool or persistence.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";

const tools = process.env.MCPCN_OR_BROWSER_TOOLS;
assert.ok(tools && path.isAbsolute(tools));
const { test, expect: playwrightExpect } = createRequire(path.join(tools, "package.json"))("playwright/test");
const expect = playwrightExpect.configure({ timeout: 3000 });
const packageManifest = JSON.parse(await readFile(path.join(tools, "package.json"), "utf8"));
assert.equal(packageManifest.name, "playwright"); assert.equal(packageManifest.version, "1.65.0");
const origins = Object.fromEntries([["docs", "MCPCN_OR_ORIGIN", "4173"], ["cliDev", "MCPCN_OR_CLI_DEV_ORIGIN", "4545"], ["cliPreview", "MCPCN_OR_CLI_PREVIEW_ORIGIN", "4546"]].map(([key, name, port]) => {
  const url = new URL(process.env[name] ?? "");
  assert.equal(url.protocol, "http:"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, port);
  assert.equal(url.href, url.origin + "/"); assert.ok(!url.username && !url.password); return [key, url.origin];
}));
const output = process.env.MCPCN_OR_BROWSER_OUTPUT, sourceCommit = process.env.SOURCE_COMMIT;
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
const slugs = { option: "option-selector", ranking: "ranking-list", values: "ranking-list" };
const labels = { option: "Supplied option choices", ranking: "Supplied ranked options", values: "Supplied ranked options", controlled: "Choose supplied options", fences: "Choose supplied options", states: "Choose supplied options" };
const actionError = "The action could not be completed. Try again.";
const optionScope = { componentId: "option-selector-1", componentRevision: "1", groupId: "group-1", groupRevision: "1" };
const rankingScope = { componentId: "ranking-list-1", componentRevision: "1", listId: "list-1", listRevision: "1" };
const preferredScope = { optionId: "preferred", optionRevision: "1" };
const nestedScope = { entryId: "nested", entryRevision: "1" };
const regionFor = (app, scenario) => app.getByRole("region", { name: labels[scenario], exact: true });
const optionLast = "Last option selector intent", rankingLast = "Last ranking list intent";
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
    values: [...element.querySelectorAll('pre[aria-label="Complete option JSON"],pre[aria-label="Complete ranked option JSON"]')].map(node => ({ label: node.getAttribute("aria-label"), text: node.textContent })),
    memberRows: [...element.querySelectorAll("ul.mcpcn-or-members > li")].map(node => {
      const button = node.querySelector("button"), spans = node.querySelectorAll(".mcpcn-or-ranking > span");
      return { buttonLabel: button?.getAttribute("aria-label") ?? null, textContent: node.textContent, pressed: button?.getAttribute("aria-pressed") ?? null,
        rankText: spans[0]?.textContent ?? null, scoreText: spans[1]?.textContent ?? null, scoreLabelText: spans[2]?.textContent ?? null };
    }),
    evidenceLists: [...element.querySelectorAll('ul[aria-label="Supplied evidence"]')].map(node => ({ label: node.getAttribute("aria-label"), text: node.textContent })),
    meters: [...element.querySelectorAll("meter")].map(node => ({ tag: node.tagName, label: node.getAttribute("aria-label"),
      min: node.min, max: node.max, value: node.value, ariaValueText: node.getAttribute("aria-valuetext") })),
    statuses: [...element.querySelectorAll('[role="status"]')].map(node => node.textContent), alerts: [...element.querySelectorAll('[role="alert"]')].map(node => node.textContent),
    counters: [...document.querySelectorAll("output[aria-label]")].map(node => ({ label: node.getAttribute("aria-label"), text: node.textContent })),
    viewport: { innerWidth, innerHeight, documentWidth: document.documentElement.scrollWidth, maxTouchPoints: navigator.maxTouchPoints },
  }));
  const intent = await rawText(app.getByLabel(directLabel ?? "Last component intent", { exact: true }));
  const payload = host ? await host.getByRole("textbox", { name: "Tool result JSON", exact: true }).inputValue() : null;
  const received = host ? await rawText(app.getByLabel("Received option or ranking payload", { exact: true })) : null;
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
  if (!invalid) await jsonIs(args.app.getByLabel("Received option or ranking payload", { exact: true }), value.structuredContent);
  return { preparedPayload: original(JSON.stringify(value)),
    receivedPayload: invalid ? null : original(await rawText(args.app.getByLabel("Received option or ranking payload", { exact: true }))) };
}
async function counters(page, option = true) {
  const number = async label => Number(await page.getByLabel(label, { exact: true }).textContent());
  return { intents: await number(option ? "Option selector intent count" : "Ranking list intent count"),
    notifications: await number("Selection notification count"), notificationSettled: await number("Settled selection notification count"), notificationPending: await number("Pending selection notifications") };
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
  const received = args.app.getByLabel("Received option or ranking payload", { exact: true });
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

const choose = (region, label, option = true) => region.getByRole("button", { name: (option ? "Select option: " : "Inspect ranked option: ") + label, exact: true });
const selected = (region, label, option = true) => region.getByRole("region", { name: (option ? "Complete option value and evidence: " : "Complete ranked option value and evidence: ") + label, exact: true });
const clear = region => region.getByRole("button", { name: "Clear selection", exact: true });
const fullJSON = (region, option = true) => region.getByLabel(option ? "Complete option JSON" : "Complete ranked option JSON", { exact: true });
const currentIntent = (args, label = null) => args.app.getByLabel(label ?? "Last component intent", { exact: true });
async function expectSelected(region, label, value, option = true) {
  await expect(choose(region, label, option)).toHaveAttribute("aria-pressed", "true");
  await expect(selected(region, label, option)).toBeVisible(); await jsonIs(fullJSON(region, option), value);
}
async function noSelection(region, option = true) {
  await expect(region.getByText(option ? "No option is selected." : "No ranked option is selected.", { exact: true })).toBeVisible();
  await expect(fullJSON(region, option)).toHaveCount(0); await expect(clear(region)).toBeDisabled();
}
async function expectCounts(args, expected, option = true) { await expect.poll(() => counters(args.page, option)).toEqual(expected); }
async function demoProof(args, region, option = true) { return snapshot(region, args.page, null, option ? optionLast : rankingLast); }
async function noFailure(region) { await expect(region.getByText(actionError, { exact: true })).toHaveCount(0); }
const demoButton = (args, name) => args.page.getByRole("button", { name, exact: true });
async function settle(args, reject, expected, option = true) {
  await args.activate(demoButton(args, (reject ? "Reject" : "Resolve") + " oldest notification")); await expectCounts(args, expected, option);
}
const numbers = (intents, notificationSettled, notificationPending) => ({ intents, notifications: intents, notificationSettled, notificationPending });
const suppliedOption = { approved: false, count: 0, next: null, empty: "", items: [false, 0, null, "", { literal: "<script>never executed</script>", end: "END-OPTION-JSON" }] };
const suppliedRanking = { flags: [false, 0, null, ""], literal: "<script>never executed</script>", end: "END-RANKING-JSON" };
const longRows = Array.from({ length: 60 }, (_, index) => "Complete authored ranked option row " + String(index + 1).padStart(2, "0"));
const completeValue = { flags: [false, 0, null, ""], nested: { literal: "<script>never executed</script>" }, rows: longRows, end: "END-OR-JSON" };
const completeEvidence = "BEGIN-OR-EVIDENCE\n" + "Complete authored evidence line.\n".repeat(70) + "END-OR-EVIDENCE";
async function rankedRows(region) {
  return region.locator("ul.mcpcn-or-members > li").evaluateAll(nodes => nodes.map(node => {
    const spans = node.querySelectorAll(".mcpcn-or-ranking > span");
    return { label: node.querySelector("button")?.getAttribute("aria-label"), rank: spans[0]?.textContent, score: spans[1]?.textContent, scoreLabel: spans[2]?.textContent ?? null };
  }));
}
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

async function optionJourney(args) {
  const { app, host, activate, record } = args, region = regionFor(app, "option");
  await noSelection(region); await delivered(args, data => { delete data.selectedOptionId; });
  const button = choose(region, "Preferred option"), handle = await button.elementHandle(); assert.ok(handle);
  try {
    await activate(button); await expectSelected(region, "Preferred option", suppliedOption);
    await jsonIs(currentIntent(args), { type: "select-option", data: { ...optionScope, ...preferredScope } });
    await expect(selected(region, "Preferred option")).toContainText("END-OPTION-EVIDENCE");
    const meters = region.getByRole("meter", { name: "Reported confidence: Preferred option", exact: true }); await expect(meters).toHaveCount(2);
    for (let index = 0; index < 2; index++) { await expect(meters.nth(index)).toHaveAttribute("value", "0"); await expect(meters.nth(index)).toHaveAttribute("aria-valuetext", "0%"); }
    const link = selected(region, "Preferred option").getByRole("link", { name: "https://example.com/supplied-option", exact: true });
    await expect(link).toHaveAttribute("target", "_blank"); await expect(link).toHaveAttribute("rel", "noopener noreferrer"); await expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect(region.getByRole("meter", { name: "Reported confidence: Alternative option", exact: true })).toHaveCount(0);
    record("current_option_complete_value_and_zero_confidence", { proof: await snapshot(region, app, host), safeLinkNotFollowed: true }); await capture(args, "selected", selected(region, "Preferred option"));
    const refresh = await producerRefresh(args, data => { data.group.options.push({ id: "appendix", revision: "1", label: "Unrelated appended option", value: { note: "END-OPTION-APPENDIX" }, evidence: [] }); }, button);
    await expect(choose(region, "Unrelated appended option")).toBeVisible(); await sameNode(button, handle); await expect(button).toBeFocused();
    assert.equal(await button.evaluate(node => node.ownerDocument.hasFocus()), true); const append = await snapshot(region, app, host);
    await delivered(args, data => { data.group.options.reverse(); }); await sameNode(button, handle); await expectSelected(region, "Preferred option", suppliedOption);
    record("append_focus_and_reorder_preserve_local_option", { append, proof: await snapshot(region, app, host), sameNativeNode: true, producerRefresh: refresh });
    await delivered(args, data => { Object.assign(data.group.options.find(member => member.id === "preferred"), { revision: "2", label: "Replacement option", value: { replaced: true, end: "END-OPTION-REPLACEMENT" }, confidence: 0.25, evidence: [] }); });
    await noSelection(region); await activate(choose(region, "Replacement option")); await expectSelected(region, "Replacement option", { replaced: true, end: "END-OPTION-REPLACEMENT" });
    await jsonIs(currentIntent(args), { type: "select-option", data: { ...optionScope, optionId: "preferred", optionRevision: "2" } });
    record("selected_option_replacement_requires_new_local_choice", { proof: await snapshot(region, app, host) });
    await activate(clear(region)); await noSelection(region); await jsonIs(currentIntent(args), { type: "clear-option", data: optionScope });
    record("local_clear_emits_group_identity_only", { proof: await snapshot(region, app, host) });
    await activate(choose(region, "Alternative option")); await expectSelected(region, "Alternative option", false); const beforeRemoval = await snapshot(region, app, host);
    await delivered(args, data => { data.group.options = data.group.options.filter(member => member.id !== "alternative"); }); await noSelection(region); await expect(choose(region, "Alternative option")).toHaveCount(0);
    record("selected_option_removal_clears_private_value", { before: beforeRemoval, proof: await snapshot(region, app, host) });
    const before = await snapshot(region, app, host);
    await delivered(args, data => { data.group.options[0].evidence = [{ id: "unsafe", label: "Unsafe supplied URL", url: "javascript:alert(1)" }]; }, true);
    await expect(host.getByRole("alert")).toContainText("Invalid component payload"); const proof = await snapshot(region, app, host); assert.deepEqual(proof.intentValue, before.intentValue);
    record("unsafe_option_evidence_is_refused_without_emission", { before, proof, refusal: original(await rawText(host.getByRole("alert"))) });
  } finally { await handle.dispose(); }
}

async function rankingJourney(args) {
  const { app, host, activate, record } = args, region = regionFor(app, "ranking");
  await noSelection(region, false); await delivered(args, data => { delete data.selectedEntryId; });
  const rows = await rankedRows(region);
  assert.deepEqual(rows, [
    { label: "Inspect ranked option: Nested result", rank: "Reported rank: 7", score: "Reported score: 0", scoreLabel: null },
    { label: "Inspect ranked option: False result", rank: "Reported rank: 2", score: "Reported score: Not supplied", scoreLabel: null },
    { label: "Inspect ranked option: Zero result", rank: "Reported rank: 7", score: "Reported score: -12.5", scoreLabel: "Score label: Authored score" },
    { label: "Inspect ranked option: Empty result", rank: "Reported rank: 11", score: "Reported score: 1", scoreLabel: null },
    { label: "Inspect ranked option: Null result", rank: "Reported rank: 4", score: "Reported score: 1", scoreLabel: null },
  ]);
  await activate(choose(region, "Nested result", false)); await expectSelected(region, "Nested result", suppliedRanking, false);
  await jsonIs(currentIntent(args), { type: "inspect-ranked-option", data: { ...rankingScope, ...nestedScope } });
  const zeroMeters = region.getByRole("meter", { name: "Reported confidence: Nested result", exact: true }); await expect(zeroMeters).toHaveCount(2);
  for (let index = 0; index < 2; index++) { await expect(zeroMeters.nth(index)).toHaveAttribute("value", "0"); await expect(zeroMeters.nth(index)).toHaveAttribute("aria-valuetext", "0%"); }
  await expect(region.getByRole("meter", { name: "Reported confidence: False result", exact: true })).toHaveCount(0);
  record("supplied_order_ties_and_zero_score_are_not_recomputed", { proof: await snapshot(region, app, host), rows }); await capture(args, "ranking", selected(region, "Nested result", false));
  const values = [];
  for (const [id, label, value] of [["false", "False result", false], ["zero", "Zero result", 0], ["empty", "Empty result", ""], ["null", "Null result", null]]) {
    await activate(choose(region, label, false)); await expectSelected(region, label, value, false);
    await jsonIs(currentIntent(args), { type: "inspect-ranked-option", data: { ...rankingScope, entryId: id, entryRevision: "1" } });
    values.push({ id, value, proof: await snapshot(region, app, host) });
  }
  record("every_complete_falsy_ranked_value_keeps_its_type", { values });
  const before = await snapshot(region, app, host); await delivered(args, data => { data.list.entries.reverse(); }); await expectSelected(region, "Null result", null, false);
  const reversed = await rankedRows(region); assert.deepEqual(reversed, [...rows].reverse());
  record("reorder_preserves_rank_score_and_local_selected_member", { before, proof: await snapshot(region, app, host), rows: reversed });
  await delivered(args, data => { data.list.entries.find(member => member.id === "null").rank = 18; }); await noSelection(region, false);
  await activate(choose(region, "Null result", false)); await expectSelected(region, "Null result", null, false); await expect(selected(region, "Null result", false)).toContainText("Reported rank: 18");
  record("rank_only_replacement_clears_local_choice", { proof: await snapshot(region, app, host) });
  await delivered(args, data => { data.list.entries.find(member => member.id === "null").score = 0; }); await noSelection(region, false);
  await activate(choose(region, "Null result", false)); await expectSelected(region, "Null result", null, false); await expect(selected(region, "Null result", false)).toContainText("Reported score: 0");
  record("score_only_replacement_clears_local_choice", { proof: await snapshot(region, app, host) });
  const removed = await snapshot(region, app, host); await delivered(args, data => { data.list.entries = data.list.entries.filter(member => member.id !== "null"); });
  await noSelection(region, false); await expect(choose(region, "Null result", false)).toHaveCount(0);
  record("removed_ranked_member_hides_private_value", { before: removed, proof: await snapshot(region, app, host) });
  const valid = await snapshot(region, app, host); await delivered(args, data => { data.list.entries[0].rank = 0; }, true);
  await expect(host.getByRole("alert")).toContainText("Invalid component payload"); const refused = await snapshot(region, app, host); assert.deepEqual(refused.intentValue, valid.intentValue);
  record("invalid_rank_producer_is_refused_without_emission", { before: valid, proof: refused, refusal: original(await rawText(host.getByRole("alert"))) });
}

async function valuesJourney(args) {
  const { app, host, activate, record } = args, region = regionFor(app, "values");
  await delivered(args, data => { delete data.selectedEntryId; data.list.entries = [{ id: "complete", revision: "1", label: "Complete ranked option", value: completeValue, rank: 7, score: 0, confidence: 0,
    evidence: [{ id: "complete-proof", label: "Complete supplied evidence", text: completeEvidence, url: "https://example.com/complete-ranking" }] }]; });
  const button = choose(region, "Complete ranked option", false); await activate(button); await expectSelected(region, "Complete ranked option", completeValue, false);
  await expect(selected(region, "Complete ranked option", false)).toContainText(completeEvidence); assert.equal(await selected(region, "Complete ranked option", false).locator("script").count(), 0);
  await jsonIs(currentIntent(args), { type: "inspect-ranked-option", data: { ...rankingScope, entryId: "complete", entryRevision: "1" } });
  record("complete_ranked_json_and_evidence_remain_private", { proof: await snapshot(region, app, host), expectedValue: completeValue, expectedEvidence: original(completeEvidence) });
  const panel = selected(region, "Complete ranked option", false), handle = await panel.elementHandle(); assert.ok(handle);
  try {
    const keyboardReading = await reading(args, panel, "END-OR-EVIDENCE");
    record("keyboard_home_end_reads_complete_ranked_marker", { proof: await snapshot(region, app, host), keyboardReading }); await capture(args, "reading", panel);
    const equivalent = { end: "END-OR-JSON", rows: [...longRows], nested: { literal: "<script>never executed</script>" }, flags: [false, 0, null, ""] };
    const refresh = await producerRefresh(args, data => { data.list.entries[0].value = equivalent; }, panel);
    await sameNode(panel, handle); await expect(panel).toBeFocused(); assert.equal(await panel.evaluate(node => node.ownerDocument.hasFocus()), true); assert.deepEqual(await json(fullJSON(region, false)), equivalent);
    record("equivalent_json_refresh_preserves_native_body_and_focus", { proof: await snapshot(region, app, host), sameNativeNode: true, producerRefresh: refresh, expectedValue: completeValue });
  } finally { await handle.dispose(); }
  const values = [];
  for (const [index, value] of [null, false, 0, "", [], {}].entries()) {
    const revision = String(index + 2); await delivered(args, data => { Object.assign(data.list.entries[0], { revision, value, evidence: [] }); });
    await noSelection(region, false); await activate(button); await expectSelected(region, "Complete ranked option", value, false);
    await jsonIs(currentIntent(args), { type: "inspect-ranked-option", data: { ...rankingScope, entryId: "complete", entryRevision: revision } });
    await expect(region).not.toContainText("END-OR-EVIDENCE"); values.push({ value, revision, proof: await snapshot(region, app, host) });
  }
  record("complete_falsy_ranked_values_remain_json_not_absence", { values });
}
async function controlledJourney(args) {
  const { page, activate, record } = args, region = regionFor(page, "controlled");
  await noSelection(region); await selectOption(args, page, "Selection ownership", "controlled");
  await activate(choose(region, "Preferred option")); await noSelection(region);
  await jsonIs(currentIntent(args, optionLast), { type: "select-option", data: { ...optionScope, ...preferredScope } }); await expectCounts(args, numbers(1, 1, 0));
  const waiting = await demoProof(args, region); await activate(demoButton(args, "Apply last selection request")); await expectSelected(region, "Preferred option", suppliedOption);
  record("controlled_option_request_waits_for_apply", { waiting, proof: await demoProof(args, region) });
  await activate(clear(region)); await expectSelected(region, "Preferred option", suppliedOption); await jsonIs(currentIntent(args, optionLast), { type: "clear-option", data: optionScope });
  const clearWaiting = await demoProof(args, region); await activate(demoButton(args, "Apply last selection request")); await noSelection(region); await expectCounts(args, numbers(2, 2, 0));
  record("controlled_clear_waits_and_omits_member_identity", { waiting: clearWaiting, proof: await demoProof(args, region) });
  await activate(choose(region, "Alternative option")); await noSelection(region); await activate(demoButton(args, "Apply last selection request")); await expectSelected(region, "Alternative option", false);
  await checked(args, "Callback enabled", false);
  const buttons = region.getByRole("button", { name: /^Select option:/ }); for (let index = 0; index < await buttons.count(); index++) await expect(buttons.nth(index)).toBeDisabled();
  await expect(clear(region)).toBeDisabled(); const readonly = await demoProof(args, region);
  await selectOption(args, page, "Selection ownership", "local"); await noSelection(region); await activate(choose(region, "Equal value option")); await expectSelected(region, "Equal value option", suppliedOption);
  await expect(demoButton(args, "Replace selected member")).toBeDisabled(); const local = await demoProof(args, region);
  await activate(clear(region)); await noSelection(region); await expectCounts(args, numbers(3, 3, 0));
  record("callback_free_controlled_is_readonly_and_local_choice_private", { readonly, local, proof: await demoProof(args, region) });
  await checked(args, "Callback enabled", true); await checked(args, "External busy", true);
  await activate(choose(region, "Preferred option")); await expectSelected(region, "Preferred option", suppliedOption); const switched = await demoProof(args, region);
  await activate(clear(region)); await noSelection(region); await expectCounts(args, numbers(5, 5, 0));
  record("external_busy_keeps_local_selection_and_clear_available", { switched, proof: await demoProof(args, region) });
  await checked(args, "External busy", false); await selectOption(args, page, "Selection notification response", "throw");
  await activate(choose(region, "Alternative option")); await expectSelected(region, "Alternative option", false); await expectCounts(args, numbers(6, 6, 0));
  await expect(region.getByText(actionError, { exact: true })).toBeVisible(); const failure = await demoProof(args, region);
  await selectOption(args, page, "Selection notification response", "immediate"); await activate(choose(region, "Alternative option")); await noFailure(region); await expectCounts(args, numbers(7, 7, 0));
  await jsonIs(currentIntent(args, optionLast), { type: "select-option", data: { ...optionScope, optionId: "alternative", optionRevision: "1" } });
  record("current_selection_throw_requires_explicit_retry", { failure, proof: await demoProof(args, region) }); await capture(args, "controlled", choose(region, "Preferred option"));
}

async function fencesJourney(args) {
  const { page, activate, record } = args, region = regionFor(page, "fences");
  await noSelection(region); await selectOption(args, page, "Selection notification response", "hold");
  await activate(choose(region, "Preferred option")); await expectSelected(region, "Preferred option", suppliedOption); await expectCounts(args, numbers(1, 0, 1)); const firstA = await demoProof(args, region);
  await activate(choose(region, "Alternative option")); await expectSelected(region, "Alternative option", false); await expectCounts(args, numbers(2, 0, 2)); const switched = await demoProof(args, region);
  await activate(clear(region)); await noSelection(region); await expectCounts(args, numbers(3, 0, 3)); const cleared = await demoProof(args, region);
  await activate(choose(region, "Preferred option")); await expectSelected(region, "Preferred option", suppliedOption); await expectCounts(args, numbers(4, 0, 4)); const returnedA = await demoProof(args, region);
  await settle(args, true, numbers(4, 1, 3)); await settle(args, true, numbers(4, 2, 2)); await settle(args, true, numbers(4, 3, 1)); await noFailure(region);
  await expect(region.getByText("Sending selection notification…", { exact: true })).toBeVisible(); const oldSettled = await demoProof(args, region);
  await settle(args, false, numbers(4, 4, 0)); await noFailure(region); await expect(region.getByText("Sending selection notification…", { exact: true })).toHaveCount(0);
  record("local_aba_hides_obsolete_pending_and_late_errors", { firstA, switched, cleared, returnedA, oldSettled, proof: await demoProof(args, region) });
  await activate(choose(region, "Preferred option")); await expectCounts(args, numbers(5, 4, 1)); const memberPending = await demoProof(args, region);
  await activate(demoButton(args, "Replace selected member")); await noSelection(region); const memberReplaced = await demoProof(args, region);
  await settle(args, true, numbers(5, 5, 0)); await noFailure(region); await noSelection(region);
  record("selected_member_replacement_fences_held_notification", { pending: memberPending, replaced: memberReplaced, proof: await demoProof(args, region) });
  const replacement = { replaced: true, end: "END-OPTION-REPLACEMENT" };
  await activate(choose(region, "Replacement option")); await expectSelected(region, "Replacement option", replacement); await expectCounts(args, numbers(6, 5, 1)); const groupPending = await demoProof(args, region);
  await activate(demoButton(args, "Replace group")); await noSelection(region); const groupReplaced = await demoProof(args, region);
  await settle(args, true, numbers(6, 6, 0)); await noFailure(region); await noSelection(region);
  record("group_replacement_fences_held_notification", { pending: groupPending, replaced: groupReplaced, proof: await demoProof(args, region) });
  await activate(choose(region, "Alternative option")); await expectSelected(region, "Alternative option", false); await expectCounts(args, numbers(7, 6, 1)); const callbackPending = await demoProof(args, region);
  await checked(args, "Callback enabled", false); const callbackRemoved = await demoProof(args, region); await settle(args, true, numbers(7, 7, 0)); await noFailure(region); const callbackSettled = await demoProof(args, region);
  await activate(choose(region, "Equal value option")); await expectSelected(region, "Equal value option", suppliedOption); await expectCounts(args, numbers(7, 7, 0));
  await checked(args, "Callback enabled", true); await expect(demoButton(args, "Replace selected member")).toBeDisabled(); await expect(demoButton(args, "Remove selected member")).toBeDisabled(); const privateChoice = await demoProof(args, region);
  await activate(choose(region, "Equal value option")); await expectCounts(args, numbers(8, 7, 1)); await expect(demoButton(args, "Replace selected member")).toBeEnabled();
  record("callback_availability_fences_old_and_keeps_private_choice_unknown", { pending: callbackPending, callbackRemoved, oldSettled: callbackSettled, privateChoice, proof: await demoProof(args, region) });
  await checked(args, "Mount component", false); await expect(region).toHaveCount(0);
  const demo = page.locator('section[aria-label="Option selector demonstration"]'), unmounted = await demoProof(args, demo);
  await checked(args, "Mount component", true); await noSelection(region); const remounted = await demoProof(args, region);
  await settle(args, true, numbers(8, 8, 0)); await noFailure(region); await noSelection(region);
  record("unmount_settlement_cannot_change_remounted_local_view", { unmounted, remounted, proof: await demoProof(args, region) });
  await activate(choose(region, "Replacement option")); await expectSelected(region, "Replacement option", replacement); await expectCounts(args, numbers(9, 8, 1)); const rootPending = await demoProof(args, region);
  await activate(demoButton(args, "Replace component")); await noSelection(region); const rootReplaced = await demoProof(args, region);
  await settle(args, true, numbers(9, 9, 0)); await noFailure(region); await noSelection(region);
  record("root_replacement_fences_held_notification", { pending: rootPending, replaced: rootReplaced, proof: await demoProof(args, region) });
  await activate(choose(region, "Preferred option")); await expectSelected(region, "Preferred option", suppliedOption); await expectCounts(args, numbers(10, 9, 1));
  await settle(args, true, numbers(10, 10, 0)); await expect(region.getByText(actionError, { exact: true })).toBeVisible(); const failure = await demoProof(args, region);
  await selectOption(args, page, "Selection notification response", "immediate"); await activate(choose(region, "Preferred option")); await noFailure(region); await expectCounts(args, numbers(11, 11, 0)); const retried = await demoProof(args, region);
  await selectOption(args, page, "Selection notification response", "throw"); await activate(choose(region, "Alternative option")); await expectCounts(args, numbers(12, 12, 0)); await expect(region.getByText(actionError, { exact: true })).toBeVisible(); const thrown = await demoProof(args, region);
  await selectOption(args, page, "Selection notification response", "immediate"); await activate(choose(region, "Alternative option")); await noFailure(region); await expectCounts(args, numbers(13, 13, 0));
  await jsonIs(currentIntent(args, optionLast), { type: "select-option", data: { ...optionScope, componentId: "option-selector-1-replacement-2", componentRevision: "2", optionId: "alternative", optionRevision: "1" } });
  record("current_notification_reject_and_throw_need_explicit_retry", { failure, retried, thrown, proof: await demoProof(args, region) }); await capture(args, "fence", selected(region, "Alternative option"));
}

async function explicitStates(args, region, option) {
  const states = [];
  for (const state of (option ? ["loading", "empty", "error", "ready"] : ["loading", "empty", "error", "ready-empty", "ready"])) {
    await selectOption(args, args.page, "Reported state", state); await expect(fullJSON(region, option)).toHaveCount(0);
    if (state === "ready") await noSelection(region, option);
    else {
      await expect(region.getByRole("button", { name: option ? /^Select option:/ : /^Inspect ranked option:/ })).toHaveCount(0);
      await expect(region).toContainText(state === "loading" ? option ? "Options are loading." : "Ranked options are loading."
        : state === "error" ? "Authored option or ranking failure." : state === "ready-empty" ? "No ranked options were supplied." : option ? "No option group was supplied." : "No ranking list was supplied.");
    }
    states.push({ state, proof: await demoProof(args, region, option) });
  }
  return states;
}
async function malformedDemo(args, region, option, expected) {
  await checked(args, "Malformed data", true);
  const demo = args.page.locator('section[aria-label="' + (option ? "Option selector" : "Ranking list") + ' demonstration"]');
  await expect(demo.getByRole("alert")).toContainText(option ? "Option selection data is invalid" : "Ranking data is invalid");
  await expect(region).toHaveCount(0); const invalid = await demoProof(args, demo, option);
  await checked(args, "Malformed data", false); await noSelection(region, option); await expectCounts(args, expected, option);
  return { invalid, proof: await demoProof(args, region, option) };
}
async function statesJourney(args) {
  const { page, activate, record } = args; let region = regionFor(page, "states");
  record("explicit_option_states_never_infer_selection_or_emit", { states: await explicitStates(args, region, true) }); await expectCounts(args, numbers(0, 0, 0));
  await activate(choose(region, "Preferred option")); await expectSelected(region, "Preferred option", suppliedOption);
  record("malformed_option_hides_private_value_then_recovers", await malformedDemo(args, region, true, numbers(1, 1, 0)));
  await navigate(args, "/components/ranking-list"); region = page.getByRole("region", { name: "Inspect supplied ranked options", exact: true });
  await expect(region).toBeVisible(); await noSelection(region, false); await expectCounts(args, numbers(0, 0, 0), false); assert.equal(page.frames().length, 1);
  record("actual_ranking_route_starts_a_fresh_local_list", { proof: await demoProof(args, region, false) });
  record("ranking_states_keep_ready_empty_distinct_from_empty", { states: await explicitStates(args, region, false) });
  await selectOption(args, page, "Selection notification response", "hold");
  await activate(choose(region, "Nested result", false)); await expectSelected(region, "Nested result", suppliedRanking, false); await expectCounts(args, numbers(1, 0, 1), false); const rankPending = await demoProof(args, region, false);
  await activate(demoButton(args, "Change selected rank")); await noSelection(region, false); const rankChanged = await demoProof(args, region, false);
  await settle(args, true, numbers(1, 1, 0), false); await noFailure(region); await noSelection(region, false);
  record("rank_only_change_fences_old_held_notification", { pending: rankPending, replaced: rankChanged, proof: await demoProof(args, region, false) });
  await activate(choose(region, "Nested result", false)); await expectSelected(region, "Nested result", suppliedRanking, false); await expect(selected(region, "Nested result", false)).toContainText("Reported rank: 8"); await expectCounts(args, numbers(2, 1, 1), false); const scorePending = await demoProof(args, region, false);
  await activate(demoButton(args, "Change selected score")); await noSelection(region, false); const scoreChanged = await demoProof(args, region, false);
  await settle(args, true, numbers(2, 2, 0), false); await noFailure(region); await noSelection(region, false);
  record("score_only_change_fences_old_held_notification", { pending: scorePending, replaced: scoreChanged, proof: await demoProof(args, region, false) });
  await activate(choose(region, "Nested result", false)); await expectSelected(region, "Nested result", suppliedRanking, false); await expect(selected(region, "Nested result", false)).toContainText("Reported score: 1"); await expectCounts(args, numbers(3, 2, 1), false); const memberPending = await demoProof(args, region, false);
  await activate(demoButton(args, "Replace selected member")); await noSelection(region, false); const memberReplaced = await demoProof(args, region, false);
  await settle(args, true, numbers(3, 3, 0), false); await noFailure(region); await noSelection(region, false);
  record("ranked_member_replacement_fences_old_held_notification", { pending: memberPending, replaced: memberReplaced, proof: await demoProof(args, region, false) });
  await activate(choose(region, "Replacement ranked option", false)); await expectSelected(region, "Replacement ranked option", { replaced: true, end: "END-RANKING-REPLACEMENT" }, false); await expectCounts(args, numbers(4, 3, 1), false); const listPending = await demoProof(args, region, false);
  await activate(demoButton(args, "Replace list")); await noSelection(region, false); const listReplaced = await demoProof(args, region, false);
  await settle(args, true, numbers(4, 4, 0), false); await noFailure(region); await noSelection(region, false);
  record("list_replacement_fences_old_held_ranked_notification", { pending: listPending, replaced: listReplaced, proof: await demoProof(args, region, false) });
  await activate(choose(region, "False result", false)); await expectSelected(region, "False result", false, false); await expectCounts(args, numbers(5, 4, 1), false); const rootPending = await demoProof(args, region, false);
  await activate(demoButton(args, "Replace component")); await noSelection(region, false); const rootReplaced = await demoProof(args, region, false);
  await settle(args, true, numbers(5, 5, 0), false); await noFailure(region); await noSelection(region, false);
  record("ranking_root_replacement_fences_old_held_notification", { pending: rootPending, replaced: rootReplaced, proof: await demoProof(args, region, false) });
  await activate(choose(region, "Zero result", false)); await expectSelected(region, "Zero result", 0, false); await expectCounts(args, numbers(6, 5, 1), false);
  await settle(args, true, numbers(6, 6, 0), false); await expect(region.getByText(actionError, { exact: true })).toBeVisible(); const failure = await demoProof(args, region, false);
  await activate(choose(region, "Zero result", false)); await expectCounts(args, numbers(7, 6, 1), false); await settle(args, false, numbers(7, 7, 0), false); await noFailure(region); await expectSelected(region, "Zero result", 0, false);
  await jsonIs(currentIntent(args, rankingLast), { type: "inspect-ranked-option", data: { ...rankingScope, componentId: "ranking-list-1-replacement-2", componentRevision: "2", entryId: "zero", entryRevision: "1" } });
  record("current_ranking_failure_needs_retry_without_rank_inference", { failure, proof: await demoProof(args, region, false) });
  record("malformed_ranking_hides_selected_value_then_recovers", await malformedDemo(args, region, false, numbers(7, 7, 0)));
  await capture(args, "states", choose(region, "Nested result", false));
}

const CASES = [
  ["O01", "O01 desktop docs supplied option selection and producer scope", "desktop", "option", "docs", optionJourney],
  ["O02", "O02 narrow docs supplied option selection and producer scope", "narrow", "option", "docs", optionJourney],
  ["O03", "O03 desktop CLI dev supplied ranking order scores and values", "desktop", "ranking", "cliDev", rankingJourney],
  ["O04", "O04 narrow CLI dev supplied ranking order scores and values", "narrow", "ranking", "cliDev", rankingJourney],
  ["O05", "O05 desktop CLI preview complete ranked values and keyboard reading", "desktop", "values", "cliPreview", valuesJourney],
  ["O06", "O06 narrow CLI preview complete ranked values and keyboard reading", "narrow", "values", "cliPreview", valuesJourney],
  ["O07", "O07 desktop docs controlled option selection acknowledgement", "desktop", "controlled", "docs", controlledJourney],
  ["O08", "O08 narrow docs controlled option selection acknowledgement", "narrow", "controlled", "docs", controlledJourney],
  ["O09", "O09 desktop docs local option notification ABA and scope fences", "desktop", "fences", "docs", fencesJourney],
  ["O10", "O10 narrow docs local option notification ABA and scope fences", "narrow", "fences", "docs", fencesJourney],
  ["O11", "O11 desktop docs explicit states and held ranking scope fences", "desktop", "states", "docs", statesJourney],
  ["O12", "O12 narrow docs explicit states and held ranking scope fences", "narrow", "states", "docs", statesJourney],
];
async function runCase(browser, testInfo, [caseId, title, profile, scenario, originKey, journey]) {
  assert.equal(testInfo.retry, 0); assert.equal(browser.browserType().name(), "chromium"); testInfo.setTimeout(40000);
  const started = performance.now(), deadline = started + 36000, closeDeadline = started + 39000, origin = origins[originKey];
  const direct = ["controlled", "fences", "states"].includes(scenario);
  const route = direct ? "/components/option-selector" : originKey === "docs" ? "/playground" : "/?component=" + slugs[scenario];
  const jsonPath = path.join(output, caseId + ".json"), pngPath = path.join(output, caseId + ".png"); await absent(jsonPath); await absent(pngPath);
  const viewport = profile === "desktop" ? { width: 1280, height: 900 } : { width: 390, height: 844 };
  const report = { kind: "mcpcn.option-ranking-browser-case.v1", schemaVersion: 1, sourceCommit, caseId, title, profile, scenario, originKey, route, origin, playwright: packageManifest.version, browserVersion: browser.version(), startedAt: new Date().toISOString(), viewport, touchEmulated: profile === "narrow", status: "failed", observations: [],
    stageScreenshots: [], secondaryNavigations: [], viewportAlignments: [], input: { trackedTaps: 0, trackedClicks: 0, keyboardActions: 0, pointerActions: 0, nativeSelections: 0, editorFills: 0, readingSetups: 0, programmaticProducerInvocations: 0, programmaticFocusRestorations: 0 }, wire: [], sdkSends: {}, displayMessages: [],
    console: { debugCount: 0, warningCount: 0, warnings: [], sdkSendPreviewCount: 0, responsePreviewCount: 0, unclassifiedSendCount: 0, unclassifiedSends: [] }, downloadEvents: 0, blobDownload: { rows: [], nativeDownloadJoined: null },
    network: { requests: 0, requestFailures: 0, consoleErrors: 0, pageErrors: 0, webSockets: 0, errorCount: 0, errors: [], rows: [] },
    cleanup: { contextCreated: false, contextClosed: false, pagesCreated: 0, pagesClosed: 0, pendingRequests: null, observerJobs: null, downloadArmRemaining: false },
    limits: { workMs: 36000, closeMs: 39000, nativeMs: 40000, reportBytes: 262144, screenshotBytes: 262144 },
    proofLimits: ["Only supplied options and reported ranks, scores, confidence, complete values and evidence are inspected. No sorting, computed winner or recommendation, source fetching/verification, tool/context/message call, persistence or clipboard.",
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
    record(direct ? "actual_docs_component_ready" : "actual_nested_bridge_ready", { frames: report.frames, viewport: report.observedViewport, theme: direct ? null : profile === "narrow" ? "dark" : "light", proof: await snapshot(regionFor(args.app, scenario), args.app, args.host, direct ? optionLast : null) });
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

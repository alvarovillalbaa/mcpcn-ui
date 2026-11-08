// Supplied source selection and native evidence-modal checks; no fetch, tool or persistence.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";

const tools = process.env.MCPCN_EVIDENCE_BROWSER_TOOLS;
assert.ok(tools && path.isAbsolute(tools));
const { test, expect: playwrightExpect } = createRequire(path.join(tools, "package.json"))("playwright/test");
const expect = playwrightExpect.configure({ timeout: 3000 });
const packageManifest = JSON.parse(await readFile(path.join(tools, "package.json"), "utf8"));
assert.equal(packageManifest.name, "playwright"); assert.equal(packageManifest.version, "1.65.0");
const origins = Object.fromEntries([["docs", "MCPCN_EVIDENCE_ORIGIN", "4173"], ["cliDev", "MCPCN_EVIDENCE_CLI_DEV_ORIGIN", "4545"], ["cliPreview", "MCPCN_EVIDENCE_CLI_PREVIEW_ORIGIN", "4546"]].map(([key, name, port]) => {
  const url = new URL(process.env[name] ?? "");
  assert.equal(url.protocol, "http:"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, port);
  assert.equal(url.href, url.origin + "/"); assert.ok(!url.username && !url.password); return [key, url.origin];
}));
const output = process.env.MCPCN_EVIDENCE_BROWSER_OUTPUT, sourceCommit = process.env.SOURCE_COMMIT;
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


const labels = { sources: "Supplied research sources", native: "Supplied evidence", json: "Supplied evidence", requests: "Supplied evidence", stack: "Evidence drawer stack demonstration", fences: "Review supplied sources" };
const slugs = { sources: "source-list", native: "evidence-drawer", json: "evidence-drawer", requests: "evidence-drawer" };
const regionFor = (app, scenario) => app.getByRole("region", { name: labels[scenario], exact: true });
const sourceScope = { listId: "sources-1", listRevision: "1", sourceId: "note-a", sourceRevision: "1" };
const drawerScope = { drawerId: "evidence-1", drawerRevision: "1", sourceId: "note-a", sourceRevision: "1" };
const notificationError = "The view request could not be reported. Try again.";
const actionError = "The action could not be completed. Try again.";
async function snapshot(region, app, host = null, directLabel = null) {
  const dom = await region.evaluate(element => ({
    outerHTML: element.outerHTML, textContent: element.textContent,
    focus: { tag: document.activeElement?.tagName ?? null, label: document.activeElement?.getAttribute("aria-label") ?? null, text: element.contains(document.activeElement) ? document.activeElement?.textContent ?? null : null, inRegion: element.contains(document.activeElement), documentHasFocus: document.hasFocus() },
    dialogs: [...element.querySelectorAll("dialog")].map(node => ({ id: node.id, open: node.open, modal: node.matches(":modal"), title: document.getElementById(node.getAttribute("aria-labelledby"))?.textContent, role: node.getAttribute("role"), ariaModal: node.getAttribute("aria-modal"), tabIndexAttribute: node.getAttribute("tabindex") })),
    documentModalCount: document.querySelectorAll("dialog:modal").length,
    controls: [...element.querySelectorAll("button,input,select,summary,a")].map(node => ({ tag: node.tagName, text: node.textContent, label: node.getAttribute("aria-label"), disabled: node.matches(":disabled"), pressed: node.getAttribute("aria-pressed"), focused: node === document.activeElement, href: node.getAttribute("href"), target: node.getAttribute("target"), rel: node.getAttribute("rel"), referrerPolicy: node.getAttribute("referrerpolicy") })),
    details: [...element.querySelectorAll("details")].map(node => ({ open: node.open, summary: node.querySelector("summary")?.textContent, pre: node.querySelector("pre")?.textContent })),
    alerts: [...element.querySelectorAll('[role="alert"]')].map(node => node.textContent),
    counters: [...document.querySelectorAll("output[aria-label]")].map(node => ({ label: node.getAttribute("aria-label"), text: node.textContent })),
    viewport: { innerWidth, innerHeight, documentWidth: document.documentElement.scrollWidth, maxTouchPoints: navigator.maxTouchPoints },
  }));
  const label = directLabel ?? "Last component intent";
  const intent = await rawText(app.getByLabel(label, { exact: true }));
  const payload = host ? await host.getByRole("textbox", { name: "Tool result JSON", exact: true }).inputValue() : null;
  return { dom: original(JSON.stringify(dom)), intent: original(intent), intentValue: JSON.parse(intent), payload: payload === null ? null : original(payload) };
}
async function edited(host, mutate, activate, expectedKind) {
  const editor = host.getByRole("textbox", { name: "Tool result JSON", exact: true }), result = JSON.parse(await editor.inputValue());
  assert.ok(object(result) && object(result.structuredContent) && object(result.structuredContent.data));
  mutate(result.structuredContent.data);
  await editor.fill(JSON.stringify(result, null, 2)); await activate(host.getByRole("button", { name: "Invoke tool result", exact: true }));
  const app = await ready(host);
  if (expectedKind) await jsonIs(app.getByLabel("Received tool input", { exact: true }), { component: expectedKind });
  return { app, payload: original(JSON.stringify(result)) };
}
async function producerRefresh(args, mutate, focused) {
  const editor = args.host.getByRole("textbox", { name: "Tool result JSON", exact: true }), result = JSON.parse(await editor.inputValue());
  assert.ok(object(result) && object(result.structuredContent) && object(result.structuredContent.data));
  const previousStateVersion = result.structuredContent.stateVersion ?? null;
  assert.ok(previousStateVersion === null || Number.isSafeInteger(previousStateVersion) && previousStateVersion >= 0 && previousStateVersion < Number.MAX_SAFE_INTEGER);
  result.structuredContent.stateVersion = (previousStateVersion ?? 0) + 1;
  mutate(result.structuredContent.data); await editor.fill(JSON.stringify(result, null, 2));
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
  const received = args.app.getByLabel("Received evidence payload", { exact: true });
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
const dialogFor = region => region.locator("dialog");
async function modal(region, opened = true) {
  await expect.poll(() => dialogFor(region).evaluate(node => ({ open: node.open, modal: node.matches(":modal") }))).toEqual({ open: opened, modal: opened });
}
async function open(args, region) {
  await args.activate(region.getByRole("button", { name: "Open evidence", exact: true }));
  await modal(region);
  await expect(dialogFor(region).getByRole("heading", { level: 2 })).toBeFocused();
}
async function close(args, region) {
  const button = dialogFor(region).getByRole("button", { name: "Close evidence", exact: true });
  await alignReachable(args, button, "close"); await args.activate(button);
  await modal(region, false);
}
async function count(page, label) { return Number(await page.getByLabel(label, { exact: true }).textContent()); }
async function counters(page, kind = "Evidence") {
  return { intents: await count(page, kind === "Evidence" ? "Evidence intent count" : "Source list intent count"), settled: await count(page, "Settled callback count") };
}
async function waitSettled(page, target) { await expect.poll(() => count(page, "Settled callback count"), { timeout: 4000 }).toBe(target); }
async function press(args, key) { await args.page.keyboard.press(key); args.report.input.keyboardActions++; }
async function sameNode(locator, handle) { assert.equal(await locator.evaluate((node, old) => node === old, handle), true); }
async function capture(args, stage, locator) {
  if (locator) await alignReachable(args, locator, "capture:" + stage);
  const filename = args.report.caseId + "-" + stage + ".png", target = path.join(output, filename);
  await absent(target); const bytes = await args.page.screenshot({ path: target, type: "png", fullPage: false, animations: "disabled", timeout: 3000 });
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
async function sourcesJourney(args) {
  const { app, host, activate, record } = args, region = regionFor(app, "sources");
  const select = region.getByRole("button", { name: "Select source: Authored research note", exact: true });
  const handle = await select.elementHandle(); assert.ok(handle);
  try {
    await activate(select); await expect(select).toHaveAttribute("aria-pressed", "true"); await expect(select).toBeFocused();
    await jsonIs(app.getByLabel("Last component intent", { exact: true }), { type: "select-source", data: sourceScope });
    const anchor = region.getByRole("link", { name: "https://example.com/supplied-note", exact: true });
    await expect(anchor).toHaveAttribute("target", "_blank"); await expect(anchor).toHaveAttribute("rel", "noopener noreferrer"); await expect(anchor).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect(region).toContainText("END-EXCERPT"); await expect(region).toContainText("END-SUPPORT");
    record("controlled_current_source_identity_and_private_full_text", { proof: await snapshot(region, app, host), safeLinkNotFollowed: true }); await capture(args, "selected", select);
    // Echo the current controlled selection in the new producer result before append.
    const refresh = await producerRefresh(args, data => { data.selectedSourceId = "note-a"; data.sources.push({ id: "note-c", revision: "1", label: "Unrelated appended source", supports: [] }); }, select);
    await expect(region.getByRole("button", { name: "Select source: Unrelated appended source", exact: true })).toBeVisible();
    await sameNode(select, handle); await expect(select).toHaveAttribute("aria-pressed", "true"); await expect(select).toBeFocused();
    record("unrelated_append_preserves_selected_node_and_inner_document_focus", { proof: await snapshot(region, app, host), sameNativeNode: true, producerRefresh: refresh });
    await activate(region.getByRole("button", { name: "Inspect source: Authored research note", exact: true }));
    await jsonIs(app.getByLabel("Last component intent", { exact: true }), { type: "inspect-source", data: sourceScope });
    record("inspect_contains_only_current_identity", { proof: await snapshot(region, app, host) });
  } finally { await handle.dispose(); }
  const states = [];
  for (const state of ["loading", "empty", "error"]) {
    await edited(host, data => { for (const key of Object.keys(data)) if (!["id", "revision", "title"].includes(key)) delete data[key]; data.state = state; if (state === "error") data.message = "Authored source failure."; }, activate);
    await expect(region.getByRole("button")).toHaveCount(0);
    await expect(region).toContainText(state === "loading" ? "Source list is loading." : state === "empty" ? "No sources were supplied." : "Authored source failure.");
    states.push({ state, proof: await snapshot(region, app, host) });
  }
  record("explicit_source_states_hide_stale_members", { states });
  const prior = await snapshot(region, app, host);
  await edited(host, data => { data.state = "ready"; data.sources = [{ id: "x", revision: "1", label: "Unsafe URL", url: "javascript:alert(1)" }]; }, activate);
  await expect(host.getByRole("alert")).toContainText("Invalid component payload");
  const after = await snapshot(region, app, host); assert.deepEqual(after.intentValue, prior.intentValue);
  record("malformed_producer_refused_before_new_app_payload", { prior, proof: after, refusal: original(await rawText(host.getByRole("alert"))) });
}
async function nativeJourney(args) {
  const { app, host, activate, record, page } = args, region = regionFor(app, "native"), expected = JSON.parse(await host.getByRole("textbox", { name: "Tool result JSON", exact: true }).inputValue()).structuredContent.data.content.text;
  await modal(region, false); await open(args, region);
  await expect(dialogFor(region).locator("pre")).toHaveText(expected); assert.ok(expected.includes("END-EVIDENCE"));
  assert.equal(await dialogFor(region).locator("script").count(), 0); await jsonIs(app.getByLabel("Last component intent", { exact: true }), { type: "open-evidence", data: drawerScope });
  for (let i = 0; i < 8; i++) { await press(args, "Tab"); assert.equal(await dialogFor(region).evaluate(node => node.contains(document.activeElement)), true); }
  for (let i = 0; i < 8; i++) { await press(args, "Shift+Tab"); assert.equal(await dialogFor(region).evaluate(node => node.contains(document.activeElement)), true); }
  const bounds = await dialogFor(region).boundingBox(); assert.ok(bounds);
  const ownViewport = await dialogFor(region).evaluate(node => ({ width: innerWidth, height: innerHeight, scroll: node.scrollHeight, client: node.clientHeight }));
  assert.ok(bounds.width <= ownViewport.width && bounds.height <= ownViewport.height && bounds.x >= 0);
  record("native_modal_complete_escaped_text_focus_and_keyboard_containment", { proof: await snapshot(region, app, host), expectedText: original(expected), tabActions: 16, ownViewport }); await capture(args, "modal", dialogFor(region));
  await close(args, region); await expect(region.getByRole("button", { name: "Open evidence", exact: true })).toBeFocused();
  await jsonIs(app.getByLabel("Last component intent", { exact: true }), { type: "close-evidence", data: drawerScope });
  record("close_immediate_and_invoker_restored", { proof: await snapshot(region, app, host) });
  await open(args, region); await press(args, "Escape"); await modal(region, false); await expect(region.getByRole("button", { name: "Open evidence", exact: true })).toBeFocused();
  record("escape_dismisses_and_restores", { proof: await snapshot(region, app, host) });
  await open(args, region);
  const rect = await dialogFor(region).boundingBox(); assert.ok(rect && rect.x > 2);
  // Real page pointer coordinates include iframe offsets, supplied by boundingBox.
  await page.mouse.move(rect.x + rect.width / 2, rect.y + 10); await page.mouse.down();
  await page.mouse.move(rect.x - 2, rect.y + 10); await page.mouse.up(); args.report.input.pointerActions += 4;
  await modal(region);
  record("drag_from_content_to_backdrop_keeps_presentation", { proof: await snapshot(region, app, host) });
  await page.mouse.click(rect.x - 2, rect.y + 10); args.report.input.pointerActions++;
  await modal(region, false); record("genuine_backdrop_pointer_pair_dismisses", { proof: await snapshot(region, app, host) });
}
const nested = { alpha: { empty: "", zero: 0, no: false, nullable: null, list: ["<b>literal</b>", { end: "END-JSON" }] }, url: "plain JSON data", href: false };
async function jsonJourney(args) {
  const { app, host, activate, record } = args, region = regionFor(app, "json");
  await edited(host, data => { data.content = { type: "json", value: nested }; }, activate);
  await open(args, region); const shell = await dialogFor(region).elementHandle(), summary = dialogFor(region).locator("summary"); assert.ok(shell);
  try {
    assert.deepEqual(await json(dialogFor(region).locator("pre")), nested); await activate(summary);
    await expect(dialogFor(region).locator("details")).not.toHaveAttribute("open", ""); await expect(summary).toBeFocused();
    const equivalent = { href: false, url: "plain JSON data", alpha: { list: ["<b>literal</b>", { end: "END-JSON" }], nullable: null, no: false, zero: 0, empty: "" } };
    const refresh = await producerRefresh(args, data => { data.content = { type: "json", value: equivalent }; }, summary);
    assert.deepEqual(await json(dialogFor(region).locator("pre")), equivalent);
    await modal(region); await sameNode(dialogFor(region), shell); await expect(summary).toBeFocused(); await expect(dialogFor(region).locator("details")).not.toHaveAttribute("open", "");
    record("equivalent_key_order_preserves_native_shell_disclosure_and_focus", { proof: await snapshot(region, app, host), sameNativeShell: true, expectedValue: nested, producerRefresh: refresh }); await capture(args, "json", dialogFor(region));
    await edited(host, data => { data.content.value.alpha.zero = 1; }, activate); await modal(region, false); await sameNode(dialogFor(region), shell);
    record("meaningful_content_replacement_closes_old_presentation", { proof: await snapshot(region, app, host), sameNativeShell: true });
  } finally { await shell.dispose(); }
  for (const value of [null, false, 0, "", [], {}]) {
    await edited(host, data => { data.content = { type: "json", value }; }, activate); await open(args, region);
    assert.deepEqual(await json(dialogFor(region).locator("pre")), value); await close(args, region);
    record("complete_json_value_" + JSON.stringify(value), { value, proof: await snapshot(region, app, host) });
  }
}
async function requestsJourney(args) {
  const { app, host, activate, record, page } = args, region = regionFor(app, "requests");
  await edited(host, data => { data.open = false; }, activate);
  await activate(region.getByRole("button", { name: "Open evidence", exact: true })); await modal(region, false);
  await jsonIs(app.getByLabel("Last component intent", { exact: true }), { type: "open-evidence", data: drawerScope });
  record("external_false_emits_request_and_waits_for_producer", { proof: await snapshot(region, app, host) });
  await edited(host, data => { data.open = true; }, activate); await modal(region); await close(args, region);
  await edited(host, () => {}, activate); await modal(region, false);
  record("unchanged_true_does_not_undo_owned_dismissal", { proof: await snapshot(region, app, host) });
  await edited(host, data => { data.open = false; }, activate); await edited(host, data => { data.open = true; }, activate); await modal(region);
  record("fresh_external_request_opens_again", { proof: await snapshot(region, app, host) }); await capture(args, "request", dialogFor(region)); await close(args, region);
  await navigate(args, "/components/evidence-drawer");
  const direct = page.getByRole("region", { name: "Inspect supplied evidence", exact: true });
  await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("reject");
  await page.getByRole("checkbox", { name: "External busy", exact: true }).check();
  const before = await counters(page); await open(args, direct); await close(args, direct); await modal(direct, false);
  await waitSettled(page, before.settled + 2); await expect(direct.getByText(notificationError, { exact: true })).toBeVisible();
  assert.equal((await counters(page)).intents, before.intents + 2);
  record("busy_pending_rejected_notifications_cannot_strand_dismissal", { proof: await snapshot(direct, page, null, "Last evidence intent"), beforeCounters: before, afterCounters: await counters(page), positiveRejectedSettlements: 2 });
}
async function stackJourney(args) {
  const { page, activate, record } = args, region = regionFor(page, "stack");
  const a = region.getByRole("region", { name: "First stacked evidence", exact: true }), b = region.getByRole("region", { name: "Second stacked evidence", exact: true });
  const invoker = region.getByRole("button", { name: "Open stacked drawers", exact: true });
  await activate(invoker); await modal(a); await modal(b); await expect(dialogFor(b).getByRole("heading", { level: 2 })).toBeFocused();
  record("two_native_modal_instances_stack_in_document", { proof: await snapshot(region, page, null, "Last stacked evidence intent") }); await capture(args, "stack", dialogFor(b));
  await close(args, b); await modal(a); await expect(dialogFor(a).getByRole("heading", { level: 2 })).toBeFocused();
  record("top_close_returns_focus_to_active_lower_modal", { proof: await snapshot(region, page, null, "Last stacked evidence intent") });
  await close(args, a); await expect(invoker).toBeFocused();
  await region.getByRole("checkbox", { name: "Remove stack invoker after opening", exact: true }).check();
  await activate(invoker); await modal(a); await modal(b); await expect(invoker).toHaveCount(0);
  await close(args, b); await modal(a); await close(args, a); await expect(page.locator("dialog:modal")).toHaveCount(0);
  record("removed_invoker_is_not_focused_and_top_layer_releases", { proof: await snapshot(region, page, null, "Last stacked evidence intent"), invokerRemoved: true });
  await navigate(args, "/components/evidence-drawer");
  await page.getByRole("combobox", { name: "Drawer lifecycle", exact: true }).selectOption("unmount");
  const direct = page.getByRole("region", { name: "Inspect supplied evidence", exact: true });
  await open(args, direct); await expect(direct).toHaveCount(0); await expect(page.locator("dialog:modal")).toHaveCount(0);
  const mount = page.getByRole("checkbox", { name: "Mount evidence drawer", exact: true }); await expect(mount).not.toBeChecked(); await mount.check();
  await expect(direct).toBeVisible(); await modal(direct, false);
  record("owned_unmount_removes_modal_and_fresh_remount_is_closed", { proof: await snapshot(direct, page, null, "Last evidence intent") });
}
async function fencesJourney(args) {
  const { page, activate, record } = args, region = regionFor(page, "fences"), response = page.getByRole("combobox", { name: "Consumer response", exact: true });
  await response.selectOption("reject"); const select = region.getByRole("button", { name: "Select source: Authored research note", exact: true });
  const before = await counters(page, "Source"); await activate(select); await expect(select).toHaveAttribute("aria-pressed", "true"); await expect(select).toBeDisabled();
  await activate(select, true); assert.equal((await counters(page, "Source")).intents, before.intents + 1);
  await activate(page.getByRole("button", { name: "Append unrelated source", exact: true })); await expect(select).toHaveAttribute("aria-pressed", "true"); await expect(select).toBeDisabled();
  record("unrelated_append_preserves_local_choice_and_pending_duplicate_guard", { proof: await snapshot(region, page, null, "Last source list intent"), beforeCounters: before, afterCounters: await counters(page, "Source") });
  await waitSettled(page, before.settled + 1); await expect(region.getByText(actionError, { exact: true })).toBeVisible();
  for (const button of ["Replace selected source", "Replace source list"]) {
    const current = region.getByRole("button", { name: /^Select source:/ }).first(), prior = await counters(page, "Source");
    await activate(current); await expect(current).toBeDisabled(); await activate(page.getByRole("button", { name: button, exact: true }));
    const replaced = await snapshot(region, page, null, "Last source list intent");
    await waitSettled(page, prior.settled + 1); await expect(region.getByText(actionError, { exact: true })).toHaveCount(0);
    record(button === "Replace selected source" ? "old_member_rejection_is_positively_settled_and_fenced" : "old_root_rejection_is_positively_settled_and_fenced", { replaced, proof: await snapshot(region, page, null, "Last source list intent"), beforeCounters: prior, afterCounters: await counters(page, "Source"), positiveRejectedSettlement: true });
  }
  await page.getByRole("checkbox", { name: "Callback enabled", exact: true }).uncheck();
  await activate(region.getByRole("button", { name: /^Select source:/ }).first()); await expect(region.getByRole("button", { name: /^Select source:/ }).first()).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("checkbox", { name: "Malformed source list", exact: true }).check(); await expect(page.getByText("Source list is invalid", { exact: true })).toBeVisible(); await expect(region).toHaveCount(0);
  record("callback_free_local_selection_and_invalid_data_hide_stale_list", { invalid: original(await rawText(page.getByText("Source list is invalid", { exact: true }))), proof: await snapshot(page.getByText("Source list is invalid", { exact: true }).locator(".."), page, null, "Last source list intent") });
  await navigate(args, "/components/evidence-drawer");
  const drawer = page.getByRole("region", { name: "Inspect supplied evidence", exact: true });
  await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("reject");
  const old = await counters(page); await open(args, drawer); await close(args, drawer);
  await activate(page.getByRole("button", { name: "Replace evidence content", exact: true }));
  await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("immediate"); await open(args, drawer);
  await waitSettled(page, old.settled + 3); await modal(drawer); await expect(drawer.getByText(notificationError, { exact: true })).toHaveCount(0);
  record("old_presentation_rejections_settle_without_closing_or_labelling_replacement", { proof: await snapshot(drawer, page, null, "Last evidence intent"), beforeCounters: old, afterCounters: await counters(page), positiveRejectedSettlements: 2 }); await capture(args, "fence", dialogFor(drawer)); await close(args, drawer);
  await page.getByRole("checkbox", { name: "Callback enabled", exact: true }).uncheck(); await open(args, drawer); await close(args, drawer);
  await page.getByRole("checkbox", { name: "Malformed evidence", exact: true }).check(); await expect(page.getByText("Evidence drawer is invalid", { exact: true })).toBeVisible(); await expect(page.locator("dialog:modal")).toHaveCount(0);
  record("callback_free_native_view_and_invalid_data_unmount_stale_evidence", { invalid: original(await rawText(page.getByText("Evidence drawer is invalid", { exact: true }))), proof: await snapshot(page.getByText("Evidence drawer is invalid", { exact: true }).locator(".."), page, null, "Last evidence intent") });
}
const CASES = [
  ["E01", "E01 desktop docs current supplied source selection", "desktop", "sources", "docs", sourcesJourney],
  ["E02", "E02 narrow docs current supplied source selection", "narrow", "sources", "docs", sourcesJourney],
  ["E03", "E03 desktop CLI dev native modal inspection", "desktop", "native", "cliDev", nativeJourney],
  ["E04", "E04 narrow CLI dev native modal inspection", "narrow", "native", "cliDev", nativeJourney],
  ["E05", "E05 desktop CLI preview complete JSON and presentation scope", "desktop", "json", "cliPreview", jsonJourney],
  ["E06", "E06 narrow CLI preview complete JSON and presentation scope", "narrow", "json", "cliPreview", jsonJourney],
  ["E07", "E07 desktop docs external requests and owned dismissal", "desktop", "requests", "docs", requestsJourney],
  ["E08", "E08 narrow docs external requests and owned dismissal", "narrow", "requests", "docs", requestsJourney],
  ["E09", "E09 desktop docs native stacking and lifecycle", "desktop", "stack", "docs", stackJourney],
  ["E10", "E10 narrow docs native stacking and lifecycle", "narrow", "stack", "docs", stackJourney],
  ["E11", "E11 desktop docs current callback and replacement fences", "desktop", "fences", "docs", fencesJourney],
  ["E12", "E12 narrow docs current callback and replacement fences", "narrow", "fences", "docs", fencesJourney],
];

async function runCase(browser, testInfo, [caseId, title, profile, scenario, originKey, journey]) {
  assert.equal(testInfo.retry, 0); assert.equal(browser.browserType().name(), "chromium"); testInfo.setTimeout(40000);
  const started = performance.now(), deadline = started + 36000, closeDeadline = started + 39000, origin = origins[originKey];
  const direct = ["stack", "fences"].includes(scenario), route = direct ? scenario === "stack" ? "/components/evidence-drawer" : "/components/source-list" : originKey === "docs" ? "/playground" : "/?component=evidence-drawer";
  const jsonPath = path.join(output, caseId + ".json"), pngPath = path.join(output, caseId + ".png"); await absent(jsonPath); await absent(pngPath);
  const viewport = profile === "desktop" ? { width: 1280, height: 900 } : { width: 390, height: 844 };
  const report = { schemaVersion: 1, sourceCommit, caseId, title, profile, scenario, originKey, route, origin, playwright: packageManifest.version, browserVersion: browser.version(), startedAt: new Date().toISOString(), viewport, touchEmulated: profile === "narrow", status: "failed", observations: [],
    stageScreenshots: [], secondaryNavigations: [], viewportAlignments: [], input: { trackedTaps: 0, trackedClicks: 0, keyboardActions: 0, pointerActions: 0, programmaticProducerInvocations: 0, programmaticFocusRestorations: 0 }, wire: [], sdkSends: {}, displayMessages: [],
    console: { debugCount: 0, warningCount: 0, warnings: [], sdkSendPreviewCount: 0, responsePreviewCount: 0, unclassifiedSendCount: 0, unclassifiedSends: [] }, downloadEvents: 0, blobDownload: { rows: [], nativeDownloadJoined: null },
    network: { requests: 0, requestFailures: 0, consoleErrors: 0, pageErrors: 0, webSockets: 0, errorCount: 0, errors: [], rows: [] },
    cleanup: { contextCreated: false, contextClosed: false, pagesCreated: 0, pagesClosed: 0, pendingRequests: null, observerJobs: null, downloadArmRemaining: false },
    limits: { workMs: 36000, closeMs: 39000, nativeMs: 40000, reportBytes: 262144, screenshotBytes: 262144 },
    proofLimits: ["Trusted caller-supplied evidence only, without source fetching/verification, tools, context publication, messages or persistence.", "Native modal acceptance is scoped to its own document. Narrow Chromium is touch emulation; physical devices, full assistive technology and external MCP hosts remain unverified.", "Complete DOM/intent/input originals, actual callback counters and native modal/focus observations are retained. Browser settlement is separate from raw socket/process cleanup.", "Two focus-preserving refresh scenarios prepare the real host editor, set up app focus before delivery and call the existing Invoke button programmatically. Those setup/delivery counts are separate from real component clicks/taps; focus is never repaired after delivery. Close and stage captures align and hit-test the target center through every actual ancestor viewport."] };
  let context, page, observer, primary;
  const record = (stage, value) => { assert.ok(report.observations.length < 20); report.observations.push({ stage, atMs: performance.now() - started, ...value }); };
  try {
    context = await browser.newContext({ viewport, isMobile: profile === "narrow", hasTouch: profile === "narrow", locale: "en-US", timezoneId: "UTC", acceptDownloads: false, permissions: [] }); report.cleanup.contextCreated = true;
    context.setDefaultTimeout(3000); context.setDefaultNavigationTimeout(10000); observer = observe(context, report, started, deadline, origin); page = await context.newPage();
    const response = await within(() => page.goto(origin + route, { waitUntil: "load", timeout: 10000 }), deadline, "navigation_deadline"); assert.ok(response); assert.equal(response.status(), 200);
    const request = response.request(), navigation = observer.rows.get(request); assert.ok(navigation && request.isNavigationRequest() && request.frame() === page.mainFrame()); assert.equal(request.url(), origin + route);
    let host = null, app = page;
    if (direct) {
      await expect(regionFor(page, scenario)).toBeVisible(); assert.equal(page.frames().length, 1);
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
    record(direct ? "actual_docs_component_ready" : "actual_nested_bridge_ready", { frames: report.frames, viewport: report.observedViewport, theme: direct ? null : profile === "narrow" ? "dark" : "light", proof: await snapshot(regionFor(app, scenario), app, host, direct ? scenario === "stack" ? "Last stacked evidence intent" : "Last source list intent" : null) });
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

// Trusted approval-cohort DOM/intent checks; no tool, permission or model action.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";

const tools = process.env.MCPCN_APPROVALS_BROWSER_TOOLS;
assert.ok(tools && path.isAbsolute(tools));
const { test, expect: playwrightExpect } = createRequire(path.join(tools, "package.json"))("playwright/test");
const expect = playwrightExpect.configure({ timeout: 3000 });
const packageManifest = JSON.parse(await readFile(path.join(tools, "package.json"), "utf8"));
assert.equal(packageManifest.name, "playwright"); assert.equal(packageManifest.version, "1.65.0");
const origins = Object.fromEntries([["docs", "MCPCN_APPROVALS_ORIGIN", "4173"], ["cliDev", "MCPCN_APPROVALS_CLI_DEV_ORIGIN", "4545"], ["cliPreview", "MCPCN_APPROVALS_CLI_PREVIEW_ORIGIN", "4546"]].map(([key, name, port]) => {
  const url = new URL(process.env[name] ?? "");
  assert.equal(url.protocol, "http:"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, port);
  assert.equal(url.href, url.origin + "/"); assert.ok(!url.username && !url.password); return [key, url.origin];
}));
const output = process.env.MCPCN_APPROVALS_BROWSER_OUTPUT, sourceCommit = process.env.SOURCE_COMMIT;
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
    if (url.origin !== allowedOrigin || !["GET", "HEAD"].includes(request.method()) || url.username || url.password || url.protocol !== "http:") error("unapproved_request", { ordinal: row.ordinal });
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
const labels = { checklist: "Review authored checklist", submission: "Review authored submission", destructive: "Review authored destructive action", override: "Review authored recommendation", permission: "Review authored permission request", callbacks: "Review the recommendation" };
const slugs = { checklist: "approval-checklist", submission: "before-submit-confirmation", destructive: "destructive-action-guard", override: "human-override-panel", permission: "permission-request-card" };
const formFor = (app, scenario) => app.getByRole("form", { name: labels[scenario], exact: true });
const intentFor = (app, direct = false) => app.getByLabel(direct ? "Last approval intent" : "Last component intent", { exact: true });
async function nativeDOM(form) {
  return form.evaluate(element => ({
    outerHTML: element.outerHTML, textContent: element.textContent,
    data: { ariaLabel: element.getAttribute("aria-label"), ariaBusy: element.parentElement?.getAttribute("aria-busy") ?? null },
    controls: [...element.querySelectorAll("input,button,textarea,select")].map((control, index) => ({
      index, tag: control.tagName, type: "type" in control ? control.type : control.tagName.toLowerCase(), id: control.id, name: control.getAttribute("name") ?? "",
      label: control.getAttribute("aria-label") ?? [...(control.labels ?? [])].map(label => label.textContent).join(" "),
      value: "value" in control ? control.value : null, checked: control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type) ? control.checked : null,
      disabled: control.matches(":disabled"), required: "required" in control ? control.required : false, focused: control === document.activeElement,
      text: control instanceof HTMLButtonElement ? control.textContent : null,
    })),
    feedbackAlerts: [...(element.parentElement?.querySelectorAll('[role="alert"]') ?? [])].map(node => node.textContent),
    callbackCounters: document.querySelector('output[aria-label="Approval intent count"]') ? {
      intents: document.querySelector('output[aria-label="Approval intent count"]')?.textContent ?? null,
      settled: document.querySelector('output[aria-label="Settled callback count"]')?.textContent ?? null,
    } : null,
    focus: { tag: document.activeElement?.tagName ?? null, id: document.activeElement?.id ?? null, inForm: element.contains(document.activeElement), documentHasFocus: document.hasFocus() },
    viewport: { innerWidth, innerHeight, documentWidth: document.documentElement.scrollWidth, maxTouchPoints: navigator.maxTouchPoints },
  }));
}
async function snapshot(form, app, host = null, direct = false) {
  const dom = await nativeDOM(form), intent = await rawText(intentFor(app, direct));
  const payload = host ? await host.getByRole("textbox", { name: "Tool result JSON", exact: true }).inputValue() : null;
  return { formLabel: dom.data.ariaLabel, controlCount: dom.controls.length, dom: original(JSON.stringify(dom)),
    intent: original(intent), intentValue: JSON.parse(intent), payload: payload === null ? null : original(payload) };
}
async function toggled(locator, checked, activate) {
  assert.equal(await locator.isChecked(), !checked); const before = await locator.elementHandle(); assert.ok(before);
  try {
    await activate(locator); await expect.poll(() => locator.isChecked()).toBe(checked); await expect(locator).toBeFocused();
    const sameNode = await locator.evaluate((node, previous) => node === previous, before); assert.equal(sameNode, true);
    return { checked: await locator.isChecked(), focused: await locator.evaluate(node => node === document.activeElement), sameNode };
  } finally { await before.dispose(); }
}
async function typed(locator, value, report) {
  const before = await locator.elementHandle(); assert.ok(before);
  try {
    await locator.fill(""); await locator.pressSequentially(value); report.input.keyboardActions += value.length;
    await expect(locator).toHaveValue(value); await expect(locator).toBeFocused();
    const sameNode = await locator.evaluate((node, previous) => node === previous, before); assert.equal(sameNode, true);
    return { value: await locator.inputValue(), focused: await locator.evaluate(node => node === document.activeElement), sameNode };
  } finally { await before.dispose(); }
}
async function edited(host, mutate, activate) {
  const editor = host.getByRole("textbox", { name: "Tool result JSON", exact: true }), result = JSON.parse(await editor.inputValue());
  assert.ok(object(result) && object(result.structuredContent) && object(result.structuredContent.data)); mutate(result.structuredContent.data);
  await editor.fill(JSON.stringify(result, null, 2)); await activate(host.getByRole("button", { name: "Invoke tool result", exact: true }));
  return result;
}
async function invalidRefusal(args, mutate) {
  const { host, app, form, activate } = args;
  await expect(form.locator("..")).toHaveAttribute("aria-busy", "false");
  const beforeDOM = await nativeDOM(form), before = await snapshot(form, app, host), editor = host.getByRole("textbox", { name: "Tool result JSON", exact: true });
  const initial = await editor.inputValue(); await edited(host, mutate, activate);
  const alert = host.getByRole("alert"); await expect(alert).toContainText("Invalid component payload"); await expect(form).toBeVisible();
  const afterDOM = await nativeDOM(form), proof = await snapshot(form, app, host);
  assert.equal(afterDOM.outerHTML, beforeDOM.outerHTML); assert.deepEqual(proof.intentValue, before.intentValue);
  const controls = rows => rows.map(({ focused: _focused, ...row }) => row);
  assert.deepEqual(controls(afterDOM.controls), controls(beforeDOM.controls));
  const hostAlert = original(await rawText(alert)); await editor.fill(initial);
  return { before, proof, hostAlert, previousUIUnchanged: true, oldIntentUnchanged: true };
}
async function disabledRefusal(args) {
  const { host, app, form, activate, page, report } = args;
  await edited(host, data => { data.disabled = true; }, activate);
  await expect(host.getByRole("alert")).toHaveCount(0);
  await expect.poll(() => form.locator("input,button,textarea,select").evaluateAll(nodes => nodes.length > 0 && nodes.every(node => node.matches(":disabled")))).toBe(true);
  const before = await snapshot(form, app, host); await activate(form.getByRole("button").last(), true);
  await page.keyboard.press("Enter"); report.input.keyboardActions++;
  const proof = await snapshot(form, app, host); assert.deepEqual(proof.intentValue, before.intentValue);
  return { before, proof, allControlsDisabled: true, forcedNativePointerAttempt: true, nativeEnterAttempt: true, oldIntentUnchanged: true };
}

async function checklistJourney(args) {
  const { app, host, record, activate } = args, form = formFor(app, "checklist"), approve = form.getByRole("button", { name: "Approve checklist", exact: true });
  await expect(approve).toBeDisabled();
  const focus = [];
  focus.push(await toggled(form.getByRole("checkbox", { name: "Include review notes (optional)", exact: true }), true, activate));
  await expect(approve).toBeDisabled(); const optionalOnly = await snapshot(form, app, host);
  focus.push(await toggled(form.getByRole("checkbox", { name: "Review rollback plan (required)", exact: true }), true, activate));
  await expect(approve).toBeDisabled(); const missingRequired = await snapshot(form, app, host);
  focus.push(await toggled(form.getByRole("checkbox", { name: "Review affected records (required)", exact: true }), true, activate));
  await expect(approve).toBeEnabled(); record("checklist_required_optional_and_focus", { proof: await snapshot(form, app, host), optionalOnly, missingRequired, focus, requiredGateObserved: true, optionalWasSelectedFirst: true });
  await activate(approve); const approval = await jsonIs(intentFor(app), { type: "approve-checklist", data: { reviewId: "checklist-1", itemIds: ["scope", "rollback", "notes"] } });
  const approved = await snapshot(form, app, host); await activate(form.getByRole("button", { name: "Cancel", exact: true }));
  await jsonIs(intentFor(app), { type: "cancel", data: { reviewId: "checklist-1" } });
  record("checklist_approval_and_cancel", { proof: await snapshot(form, app, host), approved, approval, definitionOrder: ["scope", "rollback", "notes"] });
  record("checklist_invalid_empty_refused", await invalidRefusal({ ...args, form }, data => { data.items = []; }));
  record("checklist_disabled_refused", await disabledRefusal({ ...args, form }));
}

const submittedFields = [{ id: "private", label: "Private field", value: "FORM_ONLY_VALUE" }, { id: "zero", label: "Zero", value: 0 }, { id: "false", label: "False", value: false }, { id: "null", label: "Null", value: null }, { id: "empty", label: "Empty", value: "" }];
async function submissionJourney(args) {
  const { app, host, record, activate } = args, form = formFor(app, "submission");
  await edited(host, data => { data.reviewId = "submission-browser-1"; data.fields = submittedFields; }, activate);
  const submit = form.getByRole("button", { name: "Submit", exact: true }), consent = form.getByRole("checkbox", { name: "I reviewed these fields and want to submit.", exact: true });
  await expect(form.getByText("FORM_ONLY_VALUE", { exact: true })).toBeVisible(); await expect(submit).toBeDisabled();
  const fields = await form.locator("tbody tr").evaluateAll(rows => rows.map(row => [...row.cells].map(cell => cell.textContent)));
  assert.deepEqual(fields, [["Private field", "FORM_ONLY_VALUE"], ["Zero", "0"], ["False", "false"], ["Null", "None"], ["Empty", "Empty text"]]);
  record("submission_values_and_consent", { proof: await snapshot(form, app, host), fields, consentInitiallyUnchecked: !(await consent.isChecked()) });
  await toggled(consent, true, activate); await expect(submit).toBeEnabled(); await activate(submit);
  const expected = { type: "confirm-submit", data: { reviewId: "submission-browser-1", fieldIds: ["private", "zero", "false", "null", "empty"] } };
  await jsonIs(intentFor(app), expected); assert.ok(!JSON.stringify(await json(intentFor(app))).includes("FORM_ONLY_VALUE"));
  record("submission_confirm_ids_only", { proof: await snapshot(form, app, host), expectedIntent: expected, valueEchoAbsent: true });
  const previous = await snapshot(form, app, host);
  await edited(host, data => { data.reviewId = "submission-browser-2"; data.fields[0].value = "REPLACED_FORM_ONLY_VALUE"; }, activate);
  await expect(form.getByText("REPLACED_FORM_ONLY_VALUE", { exact: true })).toBeVisible(); await expect(consent).not.toBeChecked(); await expect(submit).toBeDisabled();
  record("submission_replacement_revokes_consent", { proof: await snapshot(form, app, host), previous, replacementMechanism: "new SDK tool-result invocation" });
  record("submission_invalid_empty_refused", await invalidRefusal({ ...args, form }, data => { data.fields = []; }));
  record("submission_disabled_refused", await disabledRefusal({ ...args, form }));
}

async function destructiveJourney(args) {
  const { app, host, report, record, activate } = args, form = formFor(app, "destructive");
  const phrase = form.getByRole("textbox", { name: "Confirmation phrase", exact: true }), consent = form.getByRole("checkbox", { name: "I understand this action and want to continue.", exact: true });
  const confirm = form.getByRole("button", { name: "Confirm destructive action", exact: true });
  await expect(form.getByText("2 affected items", { exact: true })).toBeVisible(); await expect(confirm).toBeDisabled();
  await typed(phrase, "remove drafts", report); await toggled(consent, true, activate); await expect(confirm).toBeDisabled(); const wrongCase = await snapshot(form, app, host);
  await typed(phrase, "REMOVE DRAFTS ", report); await expect(confirm).toBeDisabled(); const trailing = await snapshot(form, app, host);
  await typed(phrase, "REMOVE DRAFTS", report); await toggled(consent, false, activate); await expect(confirm).toBeDisabled(); const withoutConsent = await snapshot(form, app, host);
  await toggled(consent, true, activate); await expect(confirm).toBeEnabled();
  record("destructive_exact_phrase_and_consent", { proof: await snapshot(form, app, host), wrongCase, trailing, withoutConsent, positiveCount: 2 });
  await activate(confirm); await jsonIs(intentFor(app), { type: "confirm-destructive", data: { reviewId: "destructive-1", affectedCount: 2 } });
  record("destructive_confirmation_intent", { proof: await snapshot(form, app, host) });
  const previous = await snapshot(form, app, host);
  await edited(host, data => { data.reviewId = "destructive-2"; data.targetLabel = "Three authored draft records"; data.affectedCount = 3; data.confirmationText = "REMOVE THREE"; }, activate);
  await expect(form.getByText("3 affected items", { exact: true })).toBeVisible(); await expect(phrase).toHaveValue(""); await expect(consent).not.toBeChecked(); await expect(confirm).toBeDisabled();
  record("destructive_replacement_clears_guards", { proof: await snapshot(form, app, host), previous, replacementMechanism: "new SDK tool-result invocation" });
  record("destructive_zero_count_refused", await invalidRefusal({ ...args, form }, data => { data.affectedCount = 0; }));
  record("destructive_disabled_refused", await disabledRefusal({ ...args, form }));
}

const reason = "  Authored exception for review.  ";
async function overrideJourney(args) {
  const { app, host, report, record, activate } = args, form = formFor(app, "override"), input = form.getByRole("textbox", { name: "Reason for override", exact: true });
  const consent = form.getByRole("checkbox", { name: "I reviewed this override and want to apply it.", exact: true }), submit = form.getByRole("button", { name: "Override recommendation", exact: true });
  await expect(submit).toBeDisabled(); const radioFocus = await toggled(form.getByRole("radio", { name: "Select override: Manual review", exact: true }), true, activate);
  const selectionIntent = await jsonIs(intentFor(app), { type: "select-override-option", data: { reviewId: "override-1", optionId: "manual" } });
  await toggled(consent, true, activate); await typed(input, "   ", report); await expect(submit).toBeDisabled();
  const blankReason = await snapshot(form, app, host); await toggled(consent, false, activate);
  const reasonFocus = await typed(input, reason, report); await jsonIs(intentFor(app), selectionIntent); await expect(submit).toBeDisabled();
  record("override_controlled_focus_and_reason", { proof: await snapshot(form, app, host), blankReason, radioFocus, reasonFocus, typingLeftIntentUnchanged: true });
  await toggled(consent, true, activate); await expect(submit).toBeEnabled();
  const beforeChange = await snapshot(form, app, host), changedFocus = await toggled(form.getByRole("radio", { name: "Select override: Defer review", exact: true }), true, activate);
  await expect(consent).not.toBeChecked(); await expect(input).toHaveValue(reason); await expect(submit).toBeDisabled();
  record("override_selection_revokes_consent", { proof: await snapshot(form, app, host), beforeChange, changedFocus, reasonRetained: await input.inputValue() });
  await toggled(consent, true, activate); await activate(submit);
  await jsonIs(intentFor(app), { type: "override", data: { reviewId: "override-1", optionId: "defer", reason: reason.trim() } }); const approved = await snapshot(form, app, host);
  await activate(form.getByRole("button", { name: "Cancel", exact: true })); await jsonIs(intentFor(app), { type: "cancel", data: { reviewId: "override-1" } });
  await expect(form.getByText("Current recommendation: Standard review", { exact: true })).toBeVisible();
  record("override_intent_and_cancel", { proof: await snapshot(form, app, host), approved, recommendationUnchanged: true });
  record("override_stale_selection_refused", await invalidRefusal({ ...args, form }, data => { data.selectedOptionId = "removed-option"; }));
  const previous = await snapshot(form, app, host);
  await edited(host, data => { data.reviewId = "override-2"; data.recommendation = "A replacement authored recommendation."; data.disabled = true; }, activate);
  await expect(form.getByText("A replacement authored recommendation.", { exact: true })).toBeVisible(); await expect(input).toHaveValue(""); await expect(consent).not.toBeChecked();
  const disabled = await disabledRefusal({ ...args, form }); record("override_replacement_and_disabled", { ...disabled, previous, replacementMechanism: "new SDK tool-result invocation" });
}

async function permissionJourney(args) {
  const { app, host, record, activate } = args, form = formFor(app, "permission"), request = form.getByRole("button", { name: "Request permission", exact: true });
  const consent = form.getByRole("checkbox", { name: "I reviewed these scopes and want to request permission.", exact: true });
  const optionalFocus = await toggled(form.getByRole("checkbox", { name: "Read review notes (optional)", exact: true }), true, activate); await expect(request).toBeDisabled();
  const optionalOnly = await snapshot(form, app, host);
  const requiredFocus = await toggled(form.getByRole("checkbox", { name: "Read document metadata (required)", exact: true }), true, activate); await expect(request).toBeDisabled();
  await expect(form.getByText("This sends permission-request intent only. It does not grant access or change authorization.", { exact: true })).toBeVisible();
  record("permission_required_optional_and_focus", { proof: await snapshot(form, app, host), optionalOnly, optionalFocus, requiredFocus, optionalWasSelectedFirst: true });
  await toggled(consent, true, activate); await expect(request).toBeEnabled(); const beforeChange = await snapshot(form, app, host);
  const changedFocus = await toggled(form.getByRole("checkbox", { name: "Read review notes (optional)", exact: true }), false, activate);
  await expect(consent).not.toBeChecked(); await expect(request).toBeDisabled();
  await toggled(form.getByRole("checkbox", { name: "Read review notes (optional)", exact: true }), true, activate);
  record("permission_scope_change_revokes_consent", { proof: await snapshot(form, app, host), beforeChange, changedFocus });
  await toggled(consent, true, activate); await activate(request);
  await jsonIs(intentFor(app), { type: "request-permission", data: { reviewId: "permission-1", scopeIds: ["documents.read", "notes.read"] } }); const requested = await snapshot(form, app, host);
  await activate(form.getByRole("button", { name: "Deny permission", exact: true })); await jsonIs(intentFor(app), { type: "deny-permission", data: { reviewId: "permission-1" } });
  record("permission_request_and_deny", { proof: await snapshot(form, app, host), requested, definitionOrder: ["documents.read", "notes.read"], permissionGrantPerformed: false });
  record("permission_stale_scope_refused", await invalidRefusal({ ...args, form }, data => { data.selectedScopeIds = ["removed.scope"]; }));
  record("permission_disabled_refused", await disabledRefusal({ ...args, form }));
}

async function count(page, label) { const text = await rawText(page.getByLabel(label, { exact: true })); assert.match(text, /^\d+$/); const value = Number(text); assert.ok(Number.isSafeInteger(value)); return value; }
async function counters(page) { return { intents: await count(page, "Approval intent count"), settled: await count(page, "Settled callback count") }; }
async function docNavigation(page, url, observer, report, deadline) {
  await observer.settle();
  const response = await within(() => page.goto(url, { waitUntil: "load", timeout: 10000 }), deadline, "supplementary_navigation_deadline"); assert.ok(response); assert.equal(response.status(), 200);
  const request = response.request(), row = observer.rows.get(request); assert.ok(row && request.isNavigationRequest() && request.frame() === page.mainFrame()); assert.equal(request.url(), url);
  await observer.settle(); assert.equal(row.terminal, "finished"); assert.equal(row.responseFinished, "null");
  (report.additionalNavigations ??= []).push({ url, requestOrdinal: row.ordinal, status: response.status(), exactRequestIdentity: true, requestFinished: row.terminal, responseFinished: row.responseFinished });
  assert.equal(page.frames().length, 1);
}
async function callbacksJourney(args) {
  const { page, record, report, activate, observer, deadline } = args;
  const form = formFor(page, "callbacks"), input = form.getByRole("textbox", { name: "Reason for override", exact: true });
  const consent = form.getByRole("checkbox", { name: "I reviewed this override and want to apply it.", exact: true }), submit = form.getByRole("button", { name: "Override recommendation", exact: true });
  const mode = page.getByRole("combobox", { name: "Consumer response", exact: true });
  assert.deepEqual(await counters(page), { intents: 0, settled: 0 }); await jsonIs(intentFor(page, true), null);
  const radioFocus = await toggled(form.getByRole("radio", { name: "Select override: Manual review", exact: true }), true, activate);
  await expect.poll(() => count(page, "Approval intent count")).toBe(1);
  const reasonFocus = await typed(input, reason, report); await toggled(consent, true, activate); assert.equal(await count(page, "Approval intent count"), 1);
  await activate(submit); const expected = { type: "override", data: { reviewId: "docs-override-1", optionId: "manual", reason: reason.trim() } };
  await jsonIs(intentFor(page, true), expected); await expect.poll(() => count(page, "Approval intent count")).toBe(2);
  record("callbacks_immediate_intent_count", { proof: await snapshot(form, page, null, true), radioFocus, reasonFocus, counters: await counters(page), reasonAndConsentDidNotEmit: true });

  await mode.selectOption("delayed"); const delayedBefore = await counters(page); await activate(submit);
  await expect(submit).toBeDisabled(); await expect.poll(() => count(page, "Approval intent count")).toBe(delayedBefore.intents + 1);
  const pending = await snapshot(form, page, null, true); await page.keyboard.press("Enter"); report.input.keyboardActions++;
  assert.equal(await count(page, "Approval intent count"), delayedBefore.intents + 1);
  await expect.poll(() => count(page, "Settled callback count")).toBe(delayedBefore.settled + 1); await expect(submit).toBeEnabled();
  await expect(form.locator("..").getByRole("alert")).toHaveCount(0);
  record("callbacks_pending_duplicate_suppression", { proof: await snapshot(form, page, null, true), pending, beforeCounters: delayedBefore, afterCounters: await counters(page), nativeEnterDuplicateAttempt: true });

  await mode.selectOption("reject"); const rejectedBefore = await counters(page); await activate(submit); await expect(submit).toBeDisabled();
  await expect.poll(() => count(page, "Settled callback count")).toBe(rejectedBefore.settled + 1);
  const alert = form.locator("..").getByRole("alert"); await expect(alert).toHaveText("The action could not be completed. Try again."); await expect(submit).toBeEnabled();
  const rejected = await snapshot(form, page, null, true), rejectionText = original(await rawText(alert));
  assert.equal(await count(page, "Approval intent count"), rejectedBefore.intents + 1);
  await mode.selectOption("immediate"); await activate(submit); await expect(alert).toHaveCount(0); await jsonIs(intentFor(page, true), expected);
  assert.equal(await count(page, "Approval intent count"), rejectedBefore.intents + 2);
  record("callbacks_rejection_and_recovery", { proof: await snapshot(form, page, null, true), rejected, rejectionText, beforeCounters: rejectedBefore, afterCounters: await counters(page) });

  await mode.selectOption("reject"); const oldBefore = await counters(page); await activate(submit); await expect(submit).toBeDisabled();
  const oldPending = await snapshot(form, page, null, true), oldNode = await input.elementHandle(); assert.ok(oldNode);
  try {
    await activate(page.getByRole("button", { name: "Replace review", exact: true }));
    await expect(form.getByText("Use the standard route for revision 2.", { exact: true })).toBeVisible();
    await expect(input).toHaveValue(""); await expect(consent).not.toBeChecked(); await expect(submit).toBeDisabled();
    await expect.poll(() => count(page, "Approval intent count")).toBe(0); await jsonIs(intentFor(page, true), null);
    assert.equal(await oldNode.evaluate(node => node.isConnected), false);
    const replacementBeforeSettlement = await snapshot(form, page, null, true);
    await expect.poll(() => count(page, "Settled callback count")).toBe(oldBefore.settled + 1);
    await expect(form.locator("..").getByRole("alert")).toHaveCount(0); assert.equal(await count(page, "Approval intent count"), 0); await jsonIs(intentFor(page, true), null);
    await expect(input).toHaveValue(""); await expect(consent).not.toBeChecked(); await expect(submit).toBeDisabled();
    record("callbacks_replacement_fences_old_settlement", { proof: await snapshot(form, page, null, true), oldPending, replacementBeforeSettlement,
      beforeCounters: oldBefore, afterCounters: await counters(page), oldReasonNodeDetached: true, positiveOldCallbackSettlement: true });
  } finally { await oldNode.dispose(); }

  await docNavigation(page, origins.docs + "/components/before-submit-confirmation", observer, report, deadline);
  const submission = page.getByRole("form", { name: "Review the submission", exact: true }), submitConsent = submission.getByRole("checkbox", { name: "I reviewed these fields and want to submit.", exact: true });
  await expect(submission).toBeVisible(); await toggled(submitConsent, true, activate); await activate(submission.getByRole("button", { name: "Submit", exact: true }));
  await jsonIs(intentFor(page, true), { type: "confirm-submit", data: { reviewId: "docs-submission-1", fieldIds: ["subject", "records", "notify"] } });
  const submissionBefore = await snapshot(submission, page, null, true), oldConsent = await submitConsent.elementHandle(); assert.ok(oldConsent);
  try {
    await activate(page.getByRole("button", { name: "Replace review", exact: true })); await expect(submission.getByText("Replacement request 2", { exact: true })).toBeVisible();
    await expect(submitConsent).not.toBeChecked(); await expect(submission.getByRole("button", { name: "Submit", exact: true })).toBeDisabled();
    assert.equal(await oldConsent.evaluate(node => node.isConnected), false); assert.equal(await count(page, "Approval intent count"), 0); await jsonIs(intentFor(page, true), null);
    record("docs_submission_replacement_fence", { proof: await snapshot(submission, page, null, true), before: submissionBefore, oldConsentNodeDetached: true, counters: await counters(page), directLibraryRevision: true });
  } finally { await oldConsent.dispose(); }

  await docNavigation(page, origins.docs + "/components/destructive-action-guard", observer, report, deadline);
  const destructive = page.getByRole("form", { name: "Review the destructive action", exact: true }), phrase = destructive.getByRole("textbox", { name: "Confirmation phrase", exact: true });
  const destructiveConsent = destructive.getByRole("checkbox", { name: "I understand this action and want to continue.", exact: true });
  await typed(phrase, "REMOVE DRAFTS", report); await toggled(destructiveConsent, true, activate); await activate(destructive.getByRole("button", { name: "Confirm destructive action", exact: true }));
  await jsonIs(intentFor(page, true), { type: "confirm-destructive", data: { reviewId: "docs-destructive-1", affectedCount: 2 } });
  const destructiveBefore = await snapshot(destructive, page, null, true), oldPhrase = await phrase.elementHandle(); assert.ok(oldPhrase);
  try {
    await activate(page.getByRole("button", { name: "Replace review", exact: true })); await expect(destructive.getByText("3 affected items", { exact: true })).toBeVisible();
    await expect(phrase).toHaveValue(""); await expect(destructiveConsent).not.toBeChecked(); await expect(destructive.getByRole("button", { name: "Confirm destructive action", exact: true })).toBeDisabled();
    assert.equal(await oldPhrase.evaluate(node => node.isConnected), false); assert.equal(await count(page, "Approval intent count"), 0); await jsonIs(intentFor(page, true), null);
    record("docs_destructive_replacement_fence", { proof: await snapshot(destructive, page, null, true), before: destructiveBefore, oldPhraseNodeDetached: true, counters: await counters(page), directLibraryRevision: true });
  } finally { await oldPhrase.dispose(); }
}

const CASES = [
  ["A01", "A01 desktop docs checklist intent and review guards", "desktop", "checklist", "docs", checklistJourney],
  ["A02", "A02 narrow docs checklist intent and review guards", "narrow", "checklist", "docs", checklistJourney],
  ["A03", "A03 desktop CLI dev submission values and consent", "desktop", "submission", "cliDev", submissionJourney],
  ["A04", "A04 narrow CLI dev submission values and consent", "narrow", "submission", "cliDev", submissionJourney],
  ["A05", "A05 desktop CLI preview destructive action guards", "desktop", "destructive", "cliPreview", destructiveJourney],
  ["A06", "A06 narrow CLI preview destructive action guards", "narrow", "destructive", "cliPreview", destructiveJourney],
  ["A07", "A07 desktop docs controlled human override", "desktop", "override", "docs", overrideJourney],
  ["A08", "A08 narrow docs controlled human override", "narrow", "override", "docs", overrideJourney],
  ["A09", "A09 desktop CLI dev permission request intent", "desktop", "permission", "cliDev", permissionJourney],
  ["A10", "A10 narrow CLI dev permission request intent", "narrow", "permission", "cliDev", permissionJourney],
  ["A11", "A11 desktop docs callback and local revision fences", "desktop", "callbacks", "docs", callbacksJourney],
  ["A12", "A12 narrow docs callback and local revision fences", "narrow", "callbacks", "docs", callbacksJourney]
];
assert.equal(CASES.length, 12); assert.equal(new Set(CASES.map(row => row[0])).size, 12);

async function runCase(browser, testInfo, [caseId, title, profile, scenario, originKey, journey]) {
  assert.equal(testInfo.retry, 0); assert.equal(browser.browserType().name(), "chromium"); testInfo.setTimeout(40000);
  const started = performance.now(), deadline = started + 36000, closeDeadline = started + 39000, origin = origins[originKey];
  const direct = scenario === "callbacks", route = direct ? "/components/human-override-panel" : originKey === "docs" ? "/playground" : "/?component=approval-checklist";
  const jsonPath = path.join(output, caseId + ".json"), pngPath = path.join(output, caseId + ".png"); await absent(jsonPath); await absent(pngPath);
  const viewport = profile === "desktop" ? { width: 1280, height: 900 } : { width: 390, height: 844 };
  const report = { schemaVersion: 1, sourceCommit, caseId, title, profile, scenario, originKey, route, origin, playwright: packageManifest.version, browserVersion: browser.version(), startedAt: new Date().toISOString(), viewport, touchEmulated: profile === "narrow", status: "failed", observations: [],
    input: { trackedTaps: 0, trackedClicks: 0, keyboardActions: 0 }, wire: [], sdkSends: {}, displayMessages: [],
    console: { debugCount: 0, warningCount: 0, warnings: [], sdkSendPreviewCount: 0, responsePreviewCount: 0, unclassifiedSendCount: 0, unclassifiedSends: [] }, downloadEvents: 0, blobDownload: { rows: [], nativeDownloadJoined: null },
    network: { requests: 0, requestFailures: 0, consoleErrors: 0, pageErrors: 0, webSockets: 0, errorCount: 0, errors: [], rows: [] },
    cleanup: { contextCreated: false, contextClosed: false, pagesCreated: 0, pagesClosed: 0, pendingRequests: null, observerJobs: null, downloadArmRemaining: false },
    limits: { workMs: 36000, closeMs: 39000, nativeMs: 40000, reportBytes: 262144, screenshotBytes: 262144 },
    proofLimits: ["Trusted authored approval examples only; no external tool, model, permission grant or authorization change.", "First ten cases use real official-SDK nested frames; last two use direct docs components to separate library revision fences from external iframe remounts.", "DOM and intent originals are UTF-8 gzip records. Host editor payloads describe invocation data; local controlled selections do not rewrite that editor.", "SDK method absence uses pinned console classification, with forbidden requests decoded if observed. Unclassified SDK sends fail. No tools/context/message request, download or browser permission is allowed.", "Chromium narrow touch is emulation, not physical-device or exhaustive accessibility/HTML-isolation proof.", "Network completion is browser request/responseFinished evidence, not raw socket EOF or every-asset integrity. Browser process teardown belongs to the supervisor."] };
  let context, page, observer, primary;
  const record = (stage, value) => { assert.ok(report.observations.length < 20); report.observations.push({ stage, atMs: performance.now() - started, ...value }); };
  try {
    context = await browser.newContext({ viewport, isMobile: profile === "narrow", hasTouch: profile === "narrow", locale: "en-US", timezoneId: "UTC", acceptDownloads: false, permissions: [] }); report.cleanup.contextCreated = true;
    context.setDefaultTimeout(3000); context.setDefaultNavigationTimeout(10000); observer = observe(context, report, started, deadline, origin); page = await context.newPage();
    const response = await within(() => page.goto(origin + route, { waitUntil: "load", timeout: 10000 }), deadline, "navigation_deadline"); assert.ok(response); assert.equal(response.status(), 200);
    const request = response.request(), navigation = observer.rows.get(request); assert.ok(navigation && request.isNavigationRequest() && request.frame() === page.mainFrame()); assert.equal(request.url(), origin + route);
    let host = null, app = page;
    if (direct) {
      await expect(formFor(page, "callbacks")).toBeVisible(); assert.equal(page.frames().length, 1);
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
    record(direct ? "actual_docs_component_ready" : "actual_nested_bridge_ready", { frames: report.frames, viewport: report.observedViewport, theme: direct ? null : profile === "narrow" ? "dark" : "light", proof: await snapshot(formFor(app, scenario), app, host, direct) });
    await within(() => journey({ page, context, host, app, report, observer, record, activate, deadline, profile }), deadline, "journey_deadline");
    assert.ok(profile === "narrow" ? report.input.trackedTaps > 0 : report.input.trackedClicks > 0); await observer.settle(); report.cookieCount = (await context.cookies()).length; assert.equal(report.cookieCount, 0);
    assert.deepEqual(report.wire, []); for (const method of forbiddenMethods) assert.equal(report.sdkSends[method] ?? 0, 0);
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

// Tier 2: actual Chromium events against the owned Next production docs server.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const tools = process.env.MCPCN_V1_BROWSER_TOOLS;
assert.ok(tools && path.isAbsolute(tools), "An absolute isolated Playwright package is required");
const { test, expect: playwrightExpect } = createRequire(path.join(tools, "package.json"))("playwright/test");
const expect = playwrightExpect.configure({ timeout: 3000 });
const packageManifest = JSON.parse(await readFile(path.join(tools, "package.json"), "utf8"));
assert.equal(packageManifest.name, "playwright"); assert.equal(packageManifest.version, "1.65.0");
const origin = new URL(process.env.MCPCN_V1_ORIGIN ?? "");
assert.ok(origin.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname));
assert.equal(origin.href, origin.origin + "/");
assert.ok(!origin.username && !origin.password && origin.port);
const output = process.env.MCPCN_V1_BROWSER_OUTPUT, sourceCommit = process.env.SOURCE_COMMIT;
assert.ok(output && path.isAbsolute(output)); assert.match(sourceCommit ?? "", /^[0-9a-f]{40}$/);
const directory = await lstat(output);
assert.ok(directory.isDirectory() && !directory.isSymbolicLink() && directory.uid === process.getuid() && (directory.mode & 0o077) === 0);
assert.equal(await realpath(output), output);
const sha = value => createHash("sha256").update(value).digest("hex");
const actionError = "The action could not be completed. Try again.";
test.setTimeout(30000);

async function within(operation, deadline, code) {
  const remaining = deadline - performance.now();
  if (!(remaining > 0)) {
    // Already-started cleanup/metadata promises remain observed even when late.
    if (typeof operation !== "function") void Promise.resolve(operation).catch(() => undefined);
    throw new Error(code);
  }
  const promise = typeof operation === "function" ? operation() : operation;
  let timer;
  try {
    const value = await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(code)), remaining); })]);
    assert.ok(performance.now() < deadline, code);
    return value;
  } finally { clearTimeout(timer); }
}
async function absent(filename) {
  try { await lstat(filename); throw new Error("Output already exists: " + path.basename(filename)); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
async function readJSON(locator) {
  const value = await locator.textContent();
  assert.ok(typeof value === "string" && Buffer.byteLength(value) <= 16384);
  try { return JSON.parse(value); } catch { return { notJSON: true, sha256: sha(value) }; }
}
async function actionIs(demo, label, expected, record, stage) {
  const locator = demo.getByLabel(label, { exact: true });
  await expect.poll(() => readJSON(locator)).toEqual(expected);
  const actual = await readJSON(locator); expect(actual).toEqual(expected);
  record(stage, { action: actual }); return actual;
}
async function keyboardCheck(page, locator) {
  await locator.focus(); await expect(locator).toBeFocused();
  await page.keyboard.press("Space"); await expect(locator).toBeChecked();
}
async function typeWithFocus(locator, first, rest = "") {
  await locator.fill(""); await locator.pressSequentially(first); await expect(locator).toBeFocused();
  if (rest) { await locator.pressSequentially(rest); await expect(locator).toBeFocused(); }
  await expect(locator).toHaveValue(first + rest);
}
function networkObserver(context, report, started, deadline) {
  const rows = new Map(), jobs = new Set();
  let closing = false, signal, changed;
  const reset = () => { changed = new Promise(resolve => { signal = resolve; }); }; reset();
  const notify = () => { signal(); reset(); };
  const error = (code, extra = {}) => {
    report.network.errorCount++;
    if (report.network.errors.length < 20) report.network.errors.push({ code, atMs: performance.now() - started, ...extra });
    notify();
  };
  const urlMeta = value => {
    try { const url = new URL(value); return { protocol: url.protocol, host: url.host, pathname: url.pathname.slice(0, 512) }; }
    catch { return { invalidURL: true }; }
  };
  const terminal = (row, value) => {
    if (row.terminal) { error("duplicate_or_conflicting_terminal", { ordinal: row.ordinal }); return; }
    row.terminal = value; row.terminalAtMs = performance.now() - started; notify();
  };
  const track = work => {
    let job;
    job = work.catch(() => error("observer_operation_failed")).finally(() => { jobs.delete(job); notify(); });
    jobs.add(job); return job;
  };
  context.on("request", request => {
    report.network.requests++;
    if (closing) error("request_after_fixture_close_started");
    if (rows.size >= 200) { error("request_bound_exceeded"); return; }
    const url = new URL(request.url());
    const row = { ordinal: rows.size + 1, method: request.method(), ...urlMeta(request.url()), startedAtMs: performance.now() - started,
      responseFinished: "unobserved", terminal: null, status: null };
    rows.set(request, row);
    if (url.origin !== origin.origin || !["GET", "HEAD"].includes(request.method()) || url.username || url.password) error("unapproved_request", { ordinal: row.ordinal, ...urlMeta(request.url()) });
    notify();
  });
  context.on("response", response => {
    const request = response.request(), row = rows.get(request);
    if (!row) { error("response_without_request"); return; }
    if (row.status !== null) { error("duplicate_response", { ordinal: row.ordinal }); return; }
    row.status = response.status(); row.responseAtMs = performance.now() - started;
    if (response.status() >= 400) error("http_error", { ordinal: row.ordinal, status: response.status() });
    const finishedDeadline = Math.min(deadline, performance.now() + 10000);
    track((async () => {
      try {
        const result = await within(response.finished(), finishedDeadline, "response_finished_timeout");
        row.responseFinished = result === null ? "null" : "error";
        row.responseFinishedAtMs = performance.now() - started;
        if (result !== null) error("response_finished_error", { ordinal: row.ordinal });
      } catch { row.responseFinished = "unresolved_or_late"; error("response_finished_unproved", { ordinal: row.ordinal }); }
      notify();
    })());
    notify();
  });
  context.on("requestfinished", request => {
    const row = rows.get(request); if (!row) { error("finished_without_request"); return; }
    terminal(row, "finished");
  });
  context.on("requestfailed", request => {
    report.network.requestFailures++;
    const row = rows.get(request), failure = request.failure()?.errorText ?? "";
    const match = failure.match(/^net::ERR_[A-Z_]+$/);
    if (row) { row.failure = match ? match[0] : "other_request_failure"; terminal(row, "failed"); }
    error("request_failed", { ordinal: row?.ordinal ?? null, reason: match ? match[0] : "other_request_failure" });
  });
  context.on("page", page => {
    report.cleanup.pagesCreated++;
    if (report.cleanup.pagesCreated > 1) error("unexpected_page");
    page.on("console", message => { if (message.type() === "error") { report.network.consoleErrors++; error("console_error", { messageSha256: sha(message.text()) }); } });
    page.on("pageerror", value => { report.network.pageErrors++; error("page_error", { messageSha256: sha(String(value.message)) }); });
    page.on("websocket", socket => { report.network.webSockets++; error("websocket", urlMeta(socket.url())); });
    page.on("crash", () => error("page_crash"));
    page.on("download", () => error("unexpected_download"));
    page.on("dialog", dialog => { error("unexpected_dialog"); track(dialog.dismiss()); });
    page.on("close", () => { report.cleanup.pagesClosed++; if (!closing) error("unexpected_page_close"); notify(); });
  });
  context.on("serviceworker", () => error("unexpected_service_worker"));
  return {
    rows, jobs, error,
    closeStarted() { closing = true; report.cleanup.closeStartedAtMs = performance.now() - started; },
    async settle(end = deadline) {
      while (true) {
        assert.ok(performance.now() < end, "network_settlement_deadline");
        if (report.network.errorCount) throw new Error("Observed network or browser error");
        if (!jobs.size && [...rows.values()].every(row => row.terminal === "finished" && row.responseFinished === "null")) return;
        await within(changed, end, "network_settlement_deadline");
      }
    },
    snapshot() {
      report.network.rows = [...rows.values()];
      report.cleanup.pendingRequests = [...rows.values()].filter(row => row.terminal === null || row.responseFinished === "unobserved" || row.responseFinished === "unresolved_or_late").length;
      report.cleanup.observerJobs = jobs.size;
    }
  };
}

async function approval({ page, demo, record, activate }) {
  const button = demo.getByRole("button", { name: "Approve & publish", exact: true });
  const consent = () => demo.getByRole("checkbox", { name: "I understand the impact of this action.", exact: true });
  await expect(button).toBeDisabled(); await expect(consent()).not.toBeChecked();
  await keyboardCheck(page, consent()); await expect(button).toBeEnabled();
  await activate(demo.getByRole("checkbox", { name: "Approval is busy", exact: true }));
  await expect(button).toBeDisabled(); await expect(consent()).toBeDisabled();
  await demo.getByRole("checkbox", { name: "Approval is busy", exact: true }).uncheck();
  await expect(consent()).toBeChecked();
  const reject = demo.getByRole("checkbox", { name: "Reject next approval", exact: true });
  await reject.check(); await button.dblclick();
  await expect(demo.getByLabel("Approval intent count", { exact: true })).toHaveText("1");
  await expect(demo.getByLabel("Approval settled count", { exact: true })).toHaveText("1");
  await expect(demo.getByText(actionError, { exact: true })).toBeVisible();
  await actionIs(demo, "Approval last action", { type: "approve", data: { tool: "approve_pricing" } }, record, "current_rejection");
  await button.click(); await expect(demo.getByRole("button", { name: "Working…", exact: true })).toBeDisabled();
  await expect(demo.getByLabel("Approval intent count", { exact: true })).toHaveText("2");
  await expect(demo.getByLabel("Approval settled count", { exact: true })).toHaveText("1");
  await demo.getByRole("button", { name: "Change review terms", exact: true }).click();
  await expect(consent()).not.toBeChecked(); await expect(button).toBeDisabled();
  await expect(demo.getByText("€61", { exact: true })).toBeVisible();
  await expect(demo.getByLabel("Approval settled count", { exact: true })).toHaveText("2");
  await expect(demo.getByText(actionError, { exact: true })).toHaveCount(0);
  record("replacement_after_observed_pending", { consent: await consent().isChecked(), intents: await demo.getByLabel("Approval intent count").textContent(), settled: await demo.getByLabel("Approval settled count").textContent() });
  await reject.uncheck(); await keyboardCheck(page, consent()); await button.dblclick();
  await expect(demo.getByLabel("Approval intent count", { exact: true })).toHaveText("3");
  await expect(demo.getByLabel("Approval settled count", { exact: true })).toHaveText("3");
  await expect(demo.getByText(actionError, { exact: true })).toHaveCount(0);
  await actionIs(demo, "Approval last action", { type: "approve", data: { tool: "approve_pricing" } }, record, "new_terms_accepted_intent");
}
async function schemaForm({ page, demo, record, activate }) {
  const submit = () => demo.getByRole("button", { name: "Continue workflow", exact: true });
  await expect(demo.getByLabel("Travelers", { exact: true })).toHaveValue("2");
  await expect(submit()).toBeDisabled();
  await demo.getByLabel("Cabin", { exact: true }).selectOption("business");
  await typeWithFocus(demo.getByLabel("Constraints", { exact: true }), "Old travel draft");
  await expect(submit()).toBeEnabled();
  await activate(demo.getByRole("button", { name: "Replace form fields", exact: true }));
  for (const label of ["Travelers", "Cabin", "Constraints"]) await expect(demo.getByLabel(label, { exact: true })).toHaveCount(0);
  const owner = demo.getByLabel("Owner email", { exact: true }), confirmed = demo.getByRole("checkbox", { name: "Confirm details", exact: true });
  await expect(owner).toHaveValue(""); await expect(confirmed).not.toBeChecked();
  await expect(confirmed).toHaveAttribute("required", ""); await expect(submit()).toBeDisabled();
  await typeWithFocus(owner, "owner@", "example.com"); await keyboardCheck(page, confirmed);
  await expect(demo.getByLabel("Budget", { exact: true })).toHaveValue(""); await expect(submit()).toBeEnabled();
  const reject = demo.getByRole("checkbox", { name: "Reject next form intent", exact: true });
  await reject.check(); await submit().dblclick();
  await expect(demo.getByLabel("Form intent count", { exact: true })).toHaveText("1");
  await expect(demo.getByLabel("Form settled count", { exact: true })).toHaveText("1");
  await expect(demo.getByText(actionError, { exact: true })).toBeVisible();
  const expected = { type: "submit", data: { values: { ownerEmail: "owner@example.com", confirmed: true, budget: "" }, tool: "save_reviewed_details" } };
  await actionIs(demo, "Form last action", expected, record, "replaced_field_allowlist_rejected_once");
  await reject.uncheck(); await submit().dblclick();
  await expect(demo.getByLabel("Form intent count", { exact: true })).toHaveText("2");
  await expect(demo.getByLabel("Form settled count", { exact: true })).toHaveText("2");
  await expect(demo.getByText(actionError, { exact: true })).toHaveCount(0);
  await actionIs(demo, "Form last action", expected, record, "replaced_field_allowlist_success");
}
async function confirmation({ page, demo, record, activate }) {
  const consent = demo.getByRole("checkbox", { name: "I reviewed these changes.", exact: true });
  const confirm = demo.getByRole("button", { name: "Confirm", exact: true });
  await expect(confirm).toBeDisabled(); await keyboardCheck(page, consent); await activate(confirm);
  await actionIs(demo, "Last action", { type: "confirm", data: { reviewId: "confirmation-1", changeIds: ["status"] } }, record, "confirmation");
  await demo.getByRole("button", { name: "Change confirmation terms", exact: true }).click();
  await expect(consent).not.toBeChecked(); await expect(confirm).toBeDisabled();
  await expect(demo.getByRole("cell", { name: "Archived", exact: true })).toBeVisible();
  await keyboardCheck(page, consent); await confirm.click();
  await actionIs(demo, "Last action", { type: "confirm", data: { reviewId: "confirmation-2", changeIds: ["status"] } }, record, "new_confirmation_terms");
  await demo.getByRole("button", { name: "Cancel", exact: true }).click();
  await actionIs(demo, "Last action", { type: "cancel", data: { reviewId: "confirmation-2" } }, record, "cancel_intent");
}
async function riskReview({ page, demo, record, activate }) {
  const acknowledge = demo.getByRole("checkbox", { name: "I reviewed Public visibility", exact: true });
  const consent = demo.getByRole("checkbox", { name: "I reviewed the current risk terms.", exact: true });
  const accept = demo.getByRole("button", { name: "Accept reviewed risks", exact: true });
  await expect(accept).toBeDisabled(); await expect(demo.getByText("12 affected records", { exact: true })).toBeVisible();
  await keyboardCheck(page, acknowledge); await expect(acknowledge).toBeFocused();
  await actionIs(demo, "Last action", { type: "acknowledge-risk", data: { reviewId: "risk-1", riskId: "visibility", acknowledged: true } }, record, "risk_acknowledgement");
  await expect(accept).toBeDisabled(); await keyboardCheck(page, consent); await activate(accept);
  await actionIs(demo, "Last action", { type: "accept-risks", data: { reviewId: "risk-1", riskIds: ["visibility"] } }, record, "risk_acceptance_intent");
  await demo.getByRole("button", { name: "Change risk terms", exact: true }).click();
  await expect(acknowledge).not.toBeChecked(); await expect(consent).not.toBeChecked(); await expect(accept).toBeDisabled();
  await keyboardCheck(page, acknowledge); await keyboardCheck(page, consent); await accept.click();
  await actionIs(demo, "Last action", { type: "accept-risks", data: { reviewId: "risk-2", riskIds: ["visibility"] } }, record, "new_risk_revision");
}
async function diffViewer({ demo, record, activate }) {
  const table = demo.getByRole("table", { name: "Before and after changes", exact: true });
  for (const name of ["Field", "Before", "After", "Impact", "Selection"]) await expect(table.getByRole("columnheader", { name, exact: true })).toBeVisible();
  await expect(table.getByRole("cell", { name: "Draft", exact: true })).toBeVisible();
  await expect(table.getByRole("cell", { name: "Reviewed", exact: true })).toBeVisible();
  await expect(table.getByRole("cell", { name: "0 affected", exact: true })).toBeVisible();
  const status = demo.getByRole("button", { name: "Select change: Document status", exact: true });
  const limit = demo.getByRole("button", { name: "Select change: Daily limit", exact: true });
  await status.focus(); await activate(status); await expect(status).toHaveAttribute("aria-pressed", "true");
  await actionIs(demo, "Last action", { type: "select-change", data: { reviewId: "diff-1", changeId: "status" } }, record, "first_change");
  await limit.focus(); await limit.press("Space"); await expect(limit).toHaveAttribute("aria-pressed", "true"); await expect(status).toHaveAttribute("aria-pressed", "false");
  await actionIs(demo, "Last action", { type: "select-change", data: { reviewId: "diff-1", changeId: "limit" } }, record, "current_change");
}
async function sourceEvidence({ demo, record, activate }) {
  await expect(demo.getByRole("list", { name: "Claims supported by Authored policy", exact: true })).toContainText("Human review precedes publication.");
  const link = demo.getByRole("link", { name: "Open source: Authored policy", exact: true });
  await expect(link).toHaveAttribute("href", "https://example.com/policy"); await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  record("unvisited_evidence_link", { href: await link.getAttribute("href"), target: await link.getAttribute("target"), rel: await link.getAttribute("rel") });
  const policy = demo.getByRole("button", { name: "Select source: Authored policy", exact: true });
  const notes = demo.getByRole("button", { name: "Select source: Authored review notes", exact: true });
  await policy.focus(); await activate(policy); await expect(policy).toHaveAttribute("aria-pressed", "true");
  await actionIs(demo, "Last action", { type: "select-source", data: { reviewId: "evidence-1", sourceId: "policy" } }, record, "policy_selection");
  await notes.focus(); await notes.press("Space"); await expect(notes).toHaveAttribute("aria-pressed", "true"); await expect(policy).toHaveAttribute("aria-pressed", "false");
  await actionIs(demo, "Last action", { type: "select-source", data: { reviewId: "evidence-1", sourceId: "notes" } }, record, "notes_selection");
}
async function toolCall({ demo, record, activate }) {
  const argumentsSummary = demo.locator("summary").filter({ hasText: /^Arguments$/ });
  await argumentsSummary.click();
  const argumentsDetails = argumentsSummary.locator("xpath=..");
  expect(await readJSON(argumentsDetails.locator("pre"))).toEqual({ invoiceId: "INV-42", includeLines: true });
  const resultSummary = demo.locator("summary").filter({ hasText: /^Current result$/ });
  await resultSummary.click();
  const currentResult = resultSummary.locator("xpath=..");
  expect(await readJSON(currentResult.locator("pre"))).toEqual({ found: true, total: 29.5 });
  const inspect = demo.getByRole("button", { name: "Review tool call", exact: true });
  await activate(inspect);
  await actionIs(demo, "Tool-call last action", { type: "inspect", data: { id: "call-invoice-42", tool: "lookup_invoice", arguments: { invoiceId: "INV-42", includeLines: true }, status: "succeeded", result: { found: true, total: 29.5 } } }, record, "inspected_completed_call");
  await demo.getByRole("checkbox", { name: "Consumer is busy inspecting", exact: true }).check(); await expect(inspect).toBeDisabled();
  await demo.getByRole("checkbox", { name: "Consumer is busy inspecting", exact: true }).uncheck();
  await demo.getByRole("checkbox", { name: "Reject next inspection intent", exact: true }).check(); await inspect.click();
  await expect(demo.getByText(actionError, { exact: true })).toBeVisible();
  await demo.getByLabel("Tool-call example status", { exact: true }).selectOption("running");
  await expect(demo.getByText("The consumer reports this tool call is running.", { exact: true })).toBeVisible();
  await expect(demo.getByText(actionError, { exact: true })).toHaveCount(0);
  await demo.getByLabel("Tool-call example status", { exact: true }).selectOption("failed");
  await expect(demo.getByRole("alert")).toContainText("Authored lookup failure");
  await expect(demo.getByText("No result supplied.", { exact: true })).toBeVisible();
  await inspect.click();
  await actionIs(demo, "Tool-call last action", { type: "inspect", data: { id: "call-invoice-42", tool: "lookup_invoice", arguments: { invoiceId: "INV-42", includeLines: true }, status: "failed" } }, record, "failed_call_remains_failed");
}
async function retryState({ demo, record, activate }) {
  await demo.locator("summary").filter({ hasText: /^Arguments to retry$/ }).click();
  expect(await readJSON(demo.locator("details pre"))).toEqual({ invoiceId: "INV-42", includeLines: true });
  const retry = demo.getByRole("button", { name: "Retry tool", exact: true });
  await activate(retry);
  const expected = { type: "retry", data: { id: "retry-invoice-42", tool: "lookup_invoice", arguments: { invoiceId: "INV-42", includeLines: true }, attempt: 1 } };
  await actionIs(demo, "Retry last action", expected, record, "explicit_retry_intent");
  const busy = demo.getByRole("checkbox", { name: "Consumer is busy retrying", exact: true });
  await busy.check(); await expect(retry).toBeDisabled(); await busy.uncheck();
  const allowed = demo.getByRole("checkbox", { name: "Allow retry intent", exact: true });
  await allowed.uncheck(); await expect(retry).toHaveCount(0);
  await expect(demo.getByText("This failure is not retryable.", { exact: true })).toBeVisible(); await allowed.check();
  await demo.getByRole("checkbox", { name: "Reject next retry intent", exact: true }).check(); await retry.click();
  await expect(demo.getByText(actionError, { exact: true })).toBeVisible();
  await actionIs(demo, "Retry last action", expected, record, "rejection_preserves_operation");
  await expect(demo.getByText("Request ID: retry-invoice-42 · Failed attempt: 1", { exact: true })).toBeVisible();
}
async function authRequired({ demo, record, activate }) {
  const request = demo.getByRole("button", { name: "Request access", exact: true });
  await expect(demo.getByRole("listitem").filter({ hasText: /Read invoice metadata/ })).toBeVisible();
  await expect(demo.locator("code").filter({ hasText: /^invoices\.read$/ })).toBeVisible();
  await demo.getByRole("checkbox", { name: "Reject next access intent", exact: true }).check(); await activate(request);
  const expected = { type: "request-auth", data: { id: "access-invoices", service: "Authored invoice workspace", scopes: ["invoices.read"] } };
  await actionIs(demo, "Access last action", expected, record, "rejected_access_intent");
  await expect(demo.getByText(actionError, { exact: true })).toBeVisible(); await expect(request).toBeEnabled();
  await request.click();
  await expect(demo.getByText("The consumer reports an access request is pending.", { exact: true })).toBeVisible(); await expect(request).toBeDisabled();
  await actionIs(demo, "Access last action", expected, record, "consumer_pending_without_authentication");
  await demo.getByLabel("Access example status", { exact: true }).selectOption("unavailable");
  await expect(demo.getByText("Access cannot be requested in this state.", { exact: true })).toBeVisible(); await expect(request).toBeDisabled();
  await demo.getByLabel("Access example status", { exact: true }).selectOption("required"); await expect(request).toBeEnabled();
}
async function dynamicFlow({ page, demo, record, activate }) {
  await expect(demo.getByRole("button", { name: "Next question", exact: true })).toBeDisabled();
  await demo.getByLabel("What do you need?", { exact: true }).selectOption("research");
  await expect(demo.getByText("Question 1 of 3", { exact: true })).toBeVisible();
  await activate(demo.getByRole("button", { name: "Next question", exact: true }));
  await typeWithFocus(demo.getByLabel("Research topic", { exact: true }), "Local ", "sources");
  await actionIs(demo, "Last question-flow action", { type: "answer-change", data: { flowId: "demo-flow-1", questionId: "topic", value: "Local sources" } }, record, "controlled_typing_retains_focus");
  await demo.getByRole("button", { name: "Next question", exact: true }).click();
  const reviewed = demo.getByRole("checkbox", { name: "I reviewed my answers", exact: true });
  await expect(reviewed).toHaveAttribute("required", ""); await expect(demo.getByRole("button", { name: "Submit answers", exact: true })).toBeDisabled();
  await keyboardCheck(page, reviewed); await demo.getByRole("button", { name: "Submit answers", exact: true }).click();
  await actionIs(demo, "Last question-flow action", { type: "submit", data: { flowId: "demo-flow-1", answers: { goal: "research", topic: "Local sources", reviewed: true } } }, record, "visible_branch_submission");
  await demo.getByRole("button", { name: "Back", exact: true }).click(); await demo.getByRole("button", { name: "Back", exact: true }).click();
  await demo.getByLabel("What do you need?", { exact: true }).selectOption("other");
  await expect(demo.getByText("Question 1 of 2", { exact: true })).toBeVisible();
  await demo.getByRole("button", { name: "Next question", exact: true }).click();
  await expect(demo.getByLabel("Research topic", { exact: true })).toHaveCount(0); await demo.getByRole("button", { name: "Submit answers", exact: true }).click();
  await actionIs(demo, "Last question-flow action", { type: "submit", data: { flowId: "demo-flow-1", answers: { goal: "other", reviewed: true } } }, record, "hidden_answer_excluded");
  await demo.getByRole("button", { name: "Reset question flow", exact: true }).click();
  await expect(demo.getByLabel("What do you need?", { exact: true })).toHaveValue("");
  await expect(demo.getByRole("button", { name: "Next question", exact: true })).toBeDisabled();
  await expect(demo.getByLabel("Last question-flow action", { exact: true })).toHaveText("No action yet");
}
async function extractionReview({ demo, record, activate }) {
  const total = demo.getByLabel("Correct Invoice total", { exact: true });
  await expect(total).toHaveValue("EUR 125"); await expect(demo.getByText("58% confidence", { exact: true })).toBeVisible();
  await expect(demo.getByText("Total: EUR 120. Check the extraction before confirming.", { exact: true })).toBeVisible();
  await typeWithFocus(total, "EUR ", "120");
  await actionIs(demo, "Last extraction action", { type: "correction-change", data: { reviewId: "demo-extraction-1", fieldId: "total", value: "EUR 120" } }, record, "actual_correction");
  const submit = demo.getByRole("button", { name: "Confirm corrections", exact: true });
  await activate(submit);
  await actionIs(demo, "Last extraction action", { type: "submit", data: { reviewId: "demo-extraction-1", values: { supplier: "Acme Labs", total: "EUR 120" } } }, record, "declared_fields_only");
  await total.fill(""); await expect(submit).toBeDisabled(); await expect(total).toHaveAttribute("required", "");
  await demo.getByRole("button", { name: "Reset extraction review", exact: true }).click();
  await expect(total).toHaveValue("EUR 125"); await expect(demo.getByLabel("Last extraction action", { exact: true })).toHaveText("No action yet");
}
async function comparisonMatrix({ demo, record, activate }) {
  const confirm = demo.getByRole("button", { name: "Confirm selection", exact: true });
  await expect(confirm).toBeDisabled();
  const table = demo.getByRole("table", { name: "Compare delivery options", exact: true });
  await expect(table.getByRole("columnheader", { name: "Cost", exact: true })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Delivery time", exact: true })).toBeVisible();
  const standard = demo.getByRole("radio", { name: "Select Standard", exact: true }), express = demo.getByRole("radio", { name: "Select Express", exact: true });
  await expect(demo.getByRole("radio", { name: "Select Same day", exact: true })).toBeDisabled();
  await standard.focus(); await standard.press("Space"); await expect(standard).toBeChecked();
  await standard.press("ArrowDown"); await expect(express).toBeChecked(); await expect(express).toBeFocused(); await expect(standard).not.toBeChecked();
  await actionIs(demo, "Last comparison action", { type: "selection-change", data: { comparisonId: "demo-delivery-comparison", selectedId: "express" } }, record, "keyboard_radio_selection");
  await activate(confirm);
  await actionIs(demo, "Last comparison action", { type: "confirm", data: { comparisonId: "demo-delivery-comparison", selectedId: "express" } }, record, "current_option_confirmed");
  await demo.getByRole("button", { name: "Clear selection", exact: true }).click(); await expect(confirm).toBeDisabled();
  await actionIs(demo, "Last comparison action", { type: "selection-change", data: { comparisonId: "demo-delivery-comparison", selectedId: null } }, record, "cleared_selection");
  const mode = demo.getByLabel("Comparison example payload", { exact: true });
  await mode.selectOption("empty"); await expect(demo.getByText("No options to compare.", { exact: true })).toBeVisible(); await expect(demo.getByRole("radio")).toHaveCount(0);
  record("actual_empty_payload", { text: await demo.getByText("No options to compare.", { exact: true }).textContent() });
  await mode.selectOption("malformed"); await expect(demo.getByRole("alert")).toContainText("Comparison is invalid");
  await expect(demo.getByRole("radio")).toHaveCount(0);
  record("actual_malformed_payload", { text: await demo.getByRole("alert").textContent() });
  await mode.selectOption("ready"); await expect(confirm).toBeDisabled(); await expect(express).not.toBeChecked();
}
async function scoreBreakdown({ demo, record, activate }) {
  const total = demo.getByLabel("Weighted total", { exact: true });
  await expect(total).toHaveText("Weighted total: 20 / 25 (80%)");
  const coverage = demo.getByRole("progressbar", { name: "Coverage score", exact: true });
  await expect(coverage).toHaveAttribute("value", "8"); await expect(coverage).toHaveAttribute("max", "10");
  await expect(demo.getByText("Eight covered; two still need review.", { exact: true })).toBeVisible();
  const reviewCoverage = demo.getByRole("button", { name: "Review Coverage", exact: true }), reviewCost = demo.getByRole("button", { name: "Review Cost fit", exact: true });
  await reviewCoverage.focus(); await activate(reviewCoverage); await expect(reviewCoverage).toHaveAttribute("aria-pressed", "true");
  await actionIs(demo, "Last score action", { type: "criterion-review", data: { scoreId: "demo-scorecard", criterionId: "coverage" } }, record, "coverage_review");
  await reviewCost.focus(); await reviewCost.press("Space"); await expect(reviewCost).toHaveAttribute("aria-pressed", "true"); await expect(reviewCoverage).toHaveAttribute("aria-pressed", "false");
  await actionIs(demo, "Last score action", { type: "criterion-review", data: { scoreId: "demo-scorecard", criterionId: "cost" } }, record, "cost_review");
  record("displayed_weighted_total", { text: await total.textContent(), coverageValue: await coverage.getAttribute("value"), coverageMax: await coverage.getAttribute("max") });
}

export const CASES = [
  ["B01", "B01 desktop approval-card consent revisions and asynchronous intent", "desktop", "approval-card", approval],
  ["B02", "B02 narrow approval-card consent revisions and asynchronous intent", "narrow", "approval-card", approval],
  ["B03", "B03 desktop schema-form replacement required fields and typed intent", "desktop", "schema-form", schemaForm],
  ["B04", "B04 narrow schema-form replacement required fields and typed intent", "narrow", "schema-form", schemaForm],
  ["B05", "B05 desktop confirmation-panel consent and current terms", "desktop", "confirmation-panel", confirmation],
  ["B06", "B06 narrow confirmation-panel consent and current terms", "narrow", "confirmation-panel", confirmation],
  ["B07", "B07 desktop risk-review-panel acknowledgements and revision", "desktop", "risk-review-panel", riskReview],
  ["B08", "B08 narrow risk-review-panel acknowledgements and revision", "narrow", "risk-review-panel", riskReview],
  ["B09", "B09 desktop diff-viewer semantic cells and current selection", "desktop", "diff-viewer", diffViewer],
  ["B10", "B10 narrow diff-viewer semantic cells and current selection", "narrow", "diff-viewer", diffViewer],
  ["B11", "B11 desktop source-evidence-panel claims and source selection", "desktop", "source-evidence-panel", sourceEvidence],
  ["B12", "B12 narrow source-evidence-panel claims and source selection", "narrow", "source-evidence-panel", sourceEvidence],
  ["B13", "B13 desktop tool-call-card inspect status busy and rejection", "desktop", "tool-call-card", toolCall],
  ["B14", "B14 narrow tool-call-card inspect status busy and rejection", "narrow", "tool-call-card", toolCall],
  ["B15", "B15 desktop retryable-error-state retained operation and rejection", "desktop", "retryable-error-state", retryState],
  ["B16", "B16 narrow retryable-error-state retained operation and rejection", "narrow", "retryable-error-state", retryState],
  ["B17", "B17 desktop auth-required-card scoped intent and unavailable state", "desktop", "auth-required-card", authRequired],
  ["B18", "B18 narrow auth-required-card scoped intent and unavailable state", "narrow", "auth-required-card", authRequired],
  ["B19", "B19 desktop dynamic-question-flow branching focus and allowlisted submit", "desktop", "dynamic-question-flow", dynamicFlow],
  ["B20", "B20 narrow dynamic-question-flow branching focus and allowlisted submit", "narrow", "dynamic-question-flow", dynamicFlow],
  ["B21", "B21 desktop extracted-fields-review correction evidence and reset", "desktop", "extracted-fields-review", extractionReview],
  ["B22", "B22 narrow extracted-fields-review correction evidence and reset", "narrow", "extracted-fields-review", extractionReview],
  ["B23", "B23 desktop comparison-matrix keyboard selection empty and malformed", "desktop", "comparison-matrix", comparisonMatrix],
  ["B24", "B24 narrow comparison-matrix keyboard selection empty and malformed", "narrow", "comparison-matrix", comparisonMatrix],
  ["B25", "B25 desktop score-breakdown weighted total and criterion review", "desktop", "score-breakdown", scoreBreakdown],
  ["B26", "B26 narrow score-breakdown weighted total and criterion review", "narrow", "score-breakdown", scoreBreakdown]
];
assert.equal(CASES.length, 26); assert.equal(new Set(CASES.map(row => row[0])).size, 26);

async function runCase(browser, testInfo, [caseId, title, profile, slug, journey]) {
  assert.equal(testInfo.retry, 0); assert.equal(browser.browserType().name(), "chromium");
  const started = performance.now(), deadline = started + 26000, closeDeadline = started + 29000;
  const route = "/components/" + slug, jsonPath = path.join(output, caseId + ".json"), pngPath = path.join(output, caseId + ".png");
  await absent(jsonPath); await absent(pngPath);
  const viewport = profile === "desktop" ? { width: 1280, height: 900 } : { width: 390, height: 844 };
  const report = { schemaVersion: 1, sourceCommit, caseId, title, profile, route, origin: origin.origin, playwright: packageManifest.version,
    startedAt: new Date().toISOString(), browserVersion: browser.version(), viewport, touchEmulated: profile === "narrow", status: "failed", observations: [],
    input: { trackedTaps: 0, trackedClicks: 0 },
    network: { requests: 0, requestFailures: 0, consoleErrors: 0, pageErrors: 0, webSockets: 0, errorCount: 0, errors: [], rows: [] },
    cleanup: { contextCreated: false, contextClosed: false, pagesCreated: 0, pagesClosed: 0, pendingRequests: null, observerJobs: null },
    proofLimits: ["Owned Next production docs server and authored intent callbacks only; no external MCP host, tools, authentication, model or persistence.",
      "Narrow uses Chromium mobile/touch emulation, not a physical device. Assertions establish selected keyboard/semantics behavior, not accessibility conformance.",
      "Network rows bind observed Playwright Request identities and terminal acknowledgements; no all-assets integrity or raw transport EOF assertion.",
      "One viewport screenshot records the final observed state, not every transition. Browser-process teardown is the outer supervisor's responsibility."] };
  let context, observer, page, primary;
  const record = (stage, observation) => { assert.ok(report.observations.length < 20); report.observations.push({ stage, atMs: performance.now() - started, ...observation }); };
  try {
    context = await browser.newContext({ viewport, isMobile: profile === "narrow", hasTouch: profile === "narrow", locale: "en-US", timezoneId: "UTC", acceptDownloads: false });
    report.cleanup.contextCreated = true; context.setDefaultTimeout(3000); context.setDefaultNavigationTimeout(10000);
    observer = networkObserver(context, report, started, deadline);
    page = await context.newPage();
    const response = await within(() => page.goto(origin.origin + route, { waitUntil: "load", timeout: 10000 }), deadline, "navigation_deadline");
    assert.ok(response); assert.equal(response.status(), 200);
    const request = response.request(), navigation = observer.rows.get(request);
    assert.ok(navigation && request.isNavigationRequest() && request.frame() === page.mainFrame()); assert.equal(new URL(request.url()).pathname, route);
    await observer.settle();
    assert.equal(navigation.terminal, "finished"); assert.equal(navigation.responseFinished, "null");
    report.navigation = { requestOrdinal: navigation.ordinal, status: response.status(), exactRequestIdentity: true, requestFinished: navigation.terminal, responseFinished: navigation.responseFinished };
    const demo = page.locator(".preview-shell"); await expect(demo).toHaveCount(1); await expect(demo).toBeVisible();
    const theme = demo.getByLabel("Preview theme", { exact: true }), mode = profile === "narrow" ? "dark" : "light";
    await expect(theme).toHaveValue("light");
    if (profile === "narrow") await theme.selectOption("dark");
    await expect(demo.locator("[data-preview-theme]")).toHaveAttribute("data-preview-theme", mode);
    const card = demo.locator(".mcpcn-card").first();
    const cardColors = () => card.evaluate(element => {
      const style = getComputedStyle(element);
      return { backgroundColor: style.backgroundColor, color: style.color };
    });
    const expectedColors = profile === "narrow" ? { backgroundColor: "rgb(24, 24, 27)", color: "rgb(250, 250, 250)" } : { backgroundColor: "rgb(255, 255, 255)", color: "rgb(24, 24, 27)" };
    await expect.poll(cardColors).toEqual(expectedColors);
    report.theme = { mode, ...await cardColors() };
    report.observedViewport = await page.evaluate(() => ({ innerWidth, innerHeight, documentWidth: document.documentElement.scrollWidth, maxTouchPoints: navigator.maxTouchPoints }));
    assert.equal(report.observedViewport.innerWidth, viewport.width); assert.equal(report.observedViewport.innerHeight, viewport.height);
    assert.ok(report.observedViewport.documentWidth <= viewport.width + 1);
    assert.ok(profile === "narrow" ? report.observedViewport.maxTouchPoints > 0 : report.observedViewport.maxTouchPoints === 0);
    record("initial_theme_and_viewport", { theme: report.theme, viewport: report.observedViewport });
    const activate = async locator => {
      if (profile === "narrow") { await locator.tap(); report.input.trackedTaps++; }
      else { await locator.click(); report.input.trackedClicks++; }
    };
    await journey({ page, demo, record, activate });
    assert.ok(profile === "narrow" ? report.input.trackedTaps > 0 : report.input.trackedClicks > 0);
    await observer.settle();
    assert.equal((await context.cookies()).length, 0);
  } catch (error) { primary = error; report.failure = { name: String(error?.name ?? "Error").slice(0, 80), messageSha256: sha(String(error?.message ?? error)) }; }
  finally {
    if (page && !page.isClosed()) {
      try {
        const png = await within(() => page.screenshot({ path: pngPath, type: "png", fullPage: false, animations: "disabled", timeout: 3000 }), deadline, "screenshot_deadline");
        report.screenshot = { filename: caseId + ".png", bytes: png.length, sha256: sha(png), viewportOnly: true };
        assert.ok(png.length > 0 && png.length <= 256 * 1024, "Screenshot exceeds 256 KiB bound");
      } catch (error) { primary ??= error; observer?.error("screenshot_unproved"); }
    } else { primary ??= new Error("Screenshot page unavailable"); observer?.error("screenshot_unproved"); }
    if (observer && !primary) {
      try { await observer.settle(); } catch (error) { primary ??= error; }
    }
    if (context) {
      observer?.closeStarted();
      try { await within(context.close(), closeDeadline, "context_close_deadline"); report.cleanup.contextClosed = true; }
      catch (error) { primary ??= error; observer?.error("context_close_unproved"); }
    }
    if (observer) {
      if (observer.jobs.size) {
        try { await within(Promise.all([...observer.jobs]), closeDeadline, "observer_close_deadline"); }
        catch (error) { primary ??= error; observer.error("observer_cleanup_incomplete"); }
      }
      observer.snapshot();
    }
    const current = await lstat(output);
    if (current.dev !== directory.dev || current.ino !== directory.ino || current.uid !== directory.uid || !current.isDirectory() || current.isSymbolicLink()) primary ??= new Error("Output directory identity changed");
    const clean = report.cleanup.contextCreated && report.cleanup.contextClosed && report.cleanup.pagesCreated === 1 && report.cleanup.pagesClosed === 1 && report.cleanup.pendingRequests === 0 && report.cleanup.observerJobs === 0;
    if (!primary && clean && report.network.errorCount === 0 && report.screenshot) report.status = "passed";
    else primary ??= new Error("Browser case or cleanup unproved");
    report.completedAt = new Date().toISOString();
    const bytes = Buffer.from(JSON.stringify(report, null, 2) + "\n"); assert.ok(bytes.length <= 256 * 1024, "Case report exceeds its bound");
    await writeFile(jsonPath, bytes, { flag: "wx", mode: 0o600 });
  }
  if (primary) throw primary;
}
for (const row of CASES) test(row[1], async ({ browser }, testInfo) => runCase(browser, testInfo, row));

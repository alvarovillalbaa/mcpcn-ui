# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: v1-browser.spec.mjs >> B04 narrow schema-form replacement required fields and typed intent
- Location: tooling/v1-browser.spec.mjs:521:26

# Error details

```
TimeoutError: locator.selectOption: Timeout 3000ms exceeded.
Call log:
  - waiting for locator('.preview-shell').getByLabel('Cabin', { exact: true })

```

# Test source

```ts
  95  |     const row = { ordinal: rows.size + 1, method: request.method(), ...urlMeta(request.url()), startedAtMs: performance.now() - started,
  96  |       responseFinished: "unobserved", terminal: null, status: null };
  97  |     rows.set(request, row);
  98  |     if (url.origin !== origin.origin || !["GET", "HEAD"].includes(request.method()) || url.username || url.password) error("unapproved_request", { ordinal: row.ordinal, ...urlMeta(request.url()) });
  99  |     notify();
  100 |   });
  101 |   context.on("response", response => {
  102 |     const request = response.request(), row = rows.get(request);
  103 |     if (!row) { error("response_without_request"); return; }
  104 |     if (row.status !== null) { error("duplicate_response", { ordinal: row.ordinal }); return; }
  105 |     row.status = response.status(); row.responseAtMs = performance.now() - started;
  106 |     if (response.status() >= 400) error("http_error", { ordinal: row.ordinal, status: response.status() });
  107 |     const finishedDeadline = Math.min(deadline, performance.now() + 10000);
  108 |     track((async () => {
  109 |       try {
  110 |         const result = await within(response.finished(), finishedDeadline, "response_finished_timeout");
  111 |         row.responseFinished = result === null ? "null" : "error";
  112 |         row.responseFinishedAtMs = performance.now() - started;
  113 |         if (result !== null) error("response_finished_error", { ordinal: row.ordinal });
  114 |       } catch { row.responseFinished = "unresolved_or_late"; error("response_finished_unproved", { ordinal: row.ordinal }); }
  115 |       notify();
  116 |     })());
  117 |     notify();
  118 |   });
  119 |   context.on("requestfinished", request => {
  120 |     const row = rows.get(request); if (!row) { error("finished_without_request"); return; }
  121 |     terminal(row, "finished");
  122 |   });
  123 |   context.on("requestfailed", request => {
  124 |     report.network.requestFailures++;
  125 |     const row = rows.get(request), failure = request.failure()?.errorText ?? "";
  126 |     const match = failure.match(/^net::ERR_[A-Z_]+$/);
  127 |     if (row) { row.failure = match ? match[0] : "other_request_failure"; terminal(row, "failed"); }
  128 |     error("request_failed", { ordinal: row?.ordinal ?? null, reason: match ? match[0] : "other_request_failure" });
  129 |   });
  130 |   context.on("page", page => {
  131 |     report.cleanup.pagesCreated++;
  132 |     if (report.cleanup.pagesCreated > 1) error("unexpected_page");
  133 |     page.on("console", message => { if (message.type() === "error") { report.network.consoleErrors++; error("console_error", { messageSha256: sha(message.text()) }); } });
  134 |     page.on("pageerror", value => { report.network.pageErrors++; error("page_error", { messageSha256: sha(String(value.message)) }); });
  135 |     page.on("websocket", socket => { report.network.webSockets++; error("websocket", urlMeta(socket.url())); });
  136 |     page.on("crash", () => error("page_crash"));
  137 |     page.on("download", () => error("unexpected_download"));
  138 |     page.on("dialog", dialog => { error("unexpected_dialog"); track(dialog.dismiss()); });
  139 |     page.on("close", () => { report.cleanup.pagesClosed++; if (!closing) error("unexpected_page_close"); notify(); });
  140 |   });
  141 |   context.on("serviceworker", () => error("unexpected_service_worker"));
  142 |   return {
  143 |     rows, jobs, error,
  144 |     closeStarted() { closing = true; report.cleanup.closeStartedAtMs = performance.now() - started; },
  145 |     async settle(end = deadline) {
  146 |       while (true) {
  147 |         assert.ok(performance.now() < end, "network_settlement_deadline");
  148 |         if (report.network.errorCount) throw new Error("Observed network or browser error");
  149 |         if (!jobs.size && [...rows.values()].every(row => row.terminal === "finished" && row.responseFinished === "null")) return;
  150 |         await within(changed, end, "network_settlement_deadline");
  151 |       }
  152 |     },
  153 |     snapshot() {
  154 |       report.network.rows = [...rows.values()];
  155 |       report.cleanup.pendingRequests = [...rows.values()].filter(row => row.terminal === null || row.responseFinished === "unobserved" || row.responseFinished === "unresolved_or_late").length;
  156 |       report.cleanup.observerJobs = jobs.size;
  157 |     }
  158 |   };
  159 | }
  160 | 
  161 | async function approval({ page, demo, record, activate }) {
  162 |   const button = demo.getByRole("button", { name: "Approve & publish", exact: true });
  163 |   const consent = () => demo.getByRole("checkbox", { name: "I understand the impact of this action.", exact: true });
  164 |   await expect(button).toBeDisabled(); await expect(consent()).not.toBeChecked();
  165 |   await keyboardCheck(page, consent()); await expect(button).toBeEnabled();
  166 |   await activate(demo.getByRole("checkbox", { name: "Approval is busy", exact: true }));
  167 |   await expect(button).toBeDisabled(); await expect(consent()).toBeDisabled();
  168 |   await demo.getByRole("checkbox", { name: "Approval is busy", exact: true }).uncheck();
  169 |   await expect(consent()).toBeChecked();
  170 |   const reject = demo.getByRole("checkbox", { name: "Reject next approval", exact: true });
  171 |   await reject.check(); await button.dblclick();
  172 |   await expect(demo.getByLabel("Approval intent count", { exact: true })).toHaveText("1");
  173 |   await expect(demo.getByLabel("Approval settled count", { exact: true })).toHaveText("1");
  174 |   await expect(demo.getByText(actionError, { exact: true })).toBeVisible();
  175 |   await actionIs(demo, "Approval last action", { type: "approve", data: { tool: "approve_pricing" } }, record, "current_rejection");
  176 |   await button.click(); await expect(demo.getByRole("button", { name: "Working…", exact: true })).toBeDisabled();
  177 |   await expect(demo.getByLabel("Approval intent count", { exact: true })).toHaveText("2");
  178 |   await expect(demo.getByLabel("Approval settled count", { exact: true })).toHaveText("1");
  179 |   await demo.getByRole("button", { name: "Change review terms", exact: true }).click();
  180 |   await expect(consent()).not.toBeChecked(); await expect(button).toBeDisabled();
  181 |   await expect(demo.getByText("€61", { exact: true })).toBeVisible();
  182 |   await expect(demo.getByLabel("Approval settled count", { exact: true })).toHaveText("2");
  183 |   await expect(demo.getByText(actionError, { exact: true })).toHaveCount(0);
  184 |   record("replacement_after_observed_pending", { consent: await consent().isChecked(), intents: await demo.getByLabel("Approval intent count").textContent(), settled: await demo.getByLabel("Approval settled count").textContent() });
  185 |   await reject.uncheck(); await keyboardCheck(page, consent()); await button.dblclick();
  186 |   await expect(demo.getByLabel("Approval intent count", { exact: true })).toHaveText("3");
  187 |   await expect(demo.getByLabel("Approval settled count", { exact: true })).toHaveText("3");
  188 |   await expect(demo.getByText(actionError, { exact: true })).toHaveCount(0);
  189 |   await actionIs(demo, "Approval last action", { type: "approve", data: { tool: "approve_pricing" } }, record, "new_terms_accepted_intent");
  190 | }
  191 | async function schemaForm({ page, demo, record, activate }) {
  192 |   const submit = () => demo.getByRole("button", { name: "Continue workflow", exact: true });
  193 |   await expect(demo.getByLabel("Travelers", { exact: true })).toHaveValue("2");
  194 |   await expect(submit()).toBeDisabled();
> 195 |   await demo.getByLabel("Cabin", { exact: true }).selectOption("business");
      |                                                   ^ TimeoutError: locator.selectOption: Timeout 3000ms exceeded.
  196 |   await typeWithFocus(demo.getByLabel("Constraints", { exact: true }), "Old travel draft");
  197 |   await expect(submit()).toBeEnabled();
  198 |   await activate(demo.getByRole("button", { name: "Replace form fields", exact: true }));
  199 |   for (const label of ["Travelers", "Cabin", "Constraints"]) await expect(demo.getByLabel(label, { exact: true })).toHaveCount(0);
  200 |   const owner = demo.getByLabel("Owner email", { exact: true }), confirmed = demo.getByRole("checkbox", { name: "Confirm details", exact: true });
  201 |   await expect(owner).toHaveValue(""); await expect(confirmed).not.toBeChecked();
  202 |   await expect(confirmed).toHaveAttribute("required", ""); await expect(submit()).toBeDisabled();
  203 |   await typeWithFocus(owner, "owner@", "example.com"); await keyboardCheck(page, confirmed);
  204 |   await expect(demo.getByLabel("Budget", { exact: true })).toHaveValue(""); await expect(submit()).toBeEnabled();
  205 |   const reject = demo.getByRole("checkbox", { name: "Reject next form intent", exact: true });
  206 |   await reject.check(); await submit().dblclick();
  207 |   await expect(demo.getByLabel("Form intent count", { exact: true })).toHaveText("1");
  208 |   await expect(demo.getByLabel("Form settled count", { exact: true })).toHaveText("1");
  209 |   await expect(demo.getByText(actionError, { exact: true })).toBeVisible();
  210 |   const expected = { type: "submit", data: { values: { ownerEmail: "owner@example.com", confirmed: true, budget: "" }, tool: "save_reviewed_details" } };
  211 |   await actionIs(demo, "Form last action", expected, record, "replaced_field_allowlist_rejected_once");
  212 |   await reject.uncheck(); await submit().dblclick();
  213 |   await expect(demo.getByLabel("Form intent count", { exact: true })).toHaveText("2");
  214 |   await expect(demo.getByLabel("Form settled count", { exact: true })).toHaveText("2");
  215 |   await expect(demo.getByText(actionError, { exact: true })).toHaveCount(0);
  216 |   await actionIs(demo, "Form last action", expected, record, "replaced_field_allowlist_success");
  217 | }
  218 | async function confirmation({ page, demo, record, activate }) {
  219 |   const consent = demo.getByRole("checkbox", { name: "I reviewed these changes.", exact: true });
  220 |   const confirm = demo.getByRole("button", { name: "Confirm", exact: true });
  221 |   await expect(confirm).toBeDisabled(); await keyboardCheck(page, consent); await activate(confirm);
  222 |   await actionIs(demo, "Last action", { type: "confirm", data: { reviewId: "confirmation-1", changeIds: ["status"] } }, record, "confirmation");
  223 |   await demo.getByRole("button", { name: "Change confirmation terms", exact: true }).click();
  224 |   await expect(consent).not.toBeChecked(); await expect(confirm).toBeDisabled();
  225 |   await expect(demo.getByRole("cell", { name: "Archived", exact: true })).toBeVisible();
  226 |   await keyboardCheck(page, consent); await confirm.click();
  227 |   await actionIs(demo, "Last action", { type: "confirm", data: { reviewId: "confirmation-2", changeIds: ["status"] } }, record, "new_confirmation_terms");
  228 |   await demo.getByRole("button", { name: "Cancel", exact: true }).click();
  229 |   await actionIs(demo, "Last action", { type: "cancel", data: { reviewId: "confirmation-2" } }, record, "cancel_intent");
  230 | }
  231 | async function riskReview({ page, demo, record, activate }) {
  232 |   const acknowledge = demo.getByRole("checkbox", { name: "I reviewed Public visibility", exact: true });
  233 |   const consent = demo.getByRole("checkbox", { name: "I reviewed the current risk terms.", exact: true });
  234 |   const accept = demo.getByRole("button", { name: "Accept reviewed risks", exact: true });
  235 |   await expect(accept).toBeDisabled(); await expect(demo.getByText("12 affected records", { exact: true })).toBeVisible();
  236 |   await keyboardCheck(page, acknowledge); await expect(acknowledge).toBeFocused();
  237 |   await actionIs(demo, "Last action", { type: "acknowledge-risk", data: { reviewId: "risk-1", riskId: "visibility", acknowledged: true } }, record, "risk_acknowledgement");
  238 |   await expect(accept).toBeDisabled(); await keyboardCheck(page, consent); await activate(accept);
  239 |   await actionIs(demo, "Last action", { type: "accept-risks", data: { reviewId: "risk-1", riskIds: ["visibility"] } }, record, "risk_acceptance_intent");
  240 |   await demo.getByRole("button", { name: "Change risk terms", exact: true }).click();
  241 |   await expect(acknowledge).not.toBeChecked(); await expect(consent).not.toBeChecked(); await expect(accept).toBeDisabled();
  242 |   await keyboardCheck(page, acknowledge); await keyboardCheck(page, consent); await accept.click();
  243 |   await actionIs(demo, "Last action", { type: "accept-risks", data: { reviewId: "risk-2", riskIds: ["visibility"] } }, record, "new_risk_revision");
  244 | }
  245 | async function diffViewer({ demo, record, activate }) {
  246 |   const table = demo.getByRole("table", { name: "Before and after changes", exact: true });
  247 |   for (const name of ["Field", "Before", "After", "Impact", "Selection"]) await expect(table.getByRole("columnheader", { name, exact: true })).toBeVisible();
  248 |   await expect(table.getByRole("cell", { name: "Draft", exact: true })).toBeVisible();
  249 |   await expect(table.getByRole("cell", { name: "Reviewed", exact: true })).toBeVisible();
  250 |   await expect(table.getByRole("cell", { name: "0 affected", exact: true })).toBeVisible();
  251 |   const status = demo.getByRole("button", { name: "Select change: Document status", exact: true });
  252 |   const limit = demo.getByRole("button", { name: "Select change: Daily limit", exact: true });
  253 |   await status.focus(); await activate(status); await expect(status).toHaveAttribute("aria-pressed", "true");
  254 |   await actionIs(demo, "Last action", { type: "select-change", data: { reviewId: "diff-1", changeId: "status" } }, record, "first_change");
  255 |   await limit.focus(); await limit.press("Space"); await expect(limit).toHaveAttribute("aria-pressed", "true"); await expect(status).toHaveAttribute("aria-pressed", "false");
  256 |   await actionIs(demo, "Last action", { type: "select-change", data: { reviewId: "diff-1", changeId: "limit" } }, record, "current_change");
  257 | }
  258 | async function sourceEvidence({ demo, record, activate }) {
  259 |   await expect(demo.getByRole("list", { name: "Claims supported by Authored policy", exact: true })).toContainText("Human review precedes publication.");
  260 |   const link = demo.getByRole("link", { name: "Open source: Authored policy", exact: true });
  261 |   await expect(link).toHaveAttribute("href", "https://example.com/policy"); await expect(link).toHaveAttribute("target", "_blank");
  262 |   await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  263 |   record("unvisited_evidence_link", { href: await link.getAttribute("href"), target: await link.getAttribute("target"), rel: await link.getAttribute("rel") });
  264 |   const policy = demo.getByRole("button", { name: "Select source: Authored policy", exact: true });
  265 |   const notes = demo.getByRole("button", { name: "Select source: Authored review notes", exact: true });
  266 |   await policy.focus(); await activate(policy); await expect(policy).toHaveAttribute("aria-pressed", "true");
  267 |   await actionIs(demo, "Last action", { type: "select-source", data: { reviewId: "evidence-1", sourceId: "policy" } }, record, "policy_selection");
  268 |   await notes.focus(); await notes.press("Space"); await expect(notes).toHaveAttribute("aria-pressed", "true"); await expect(policy).toHaveAttribute("aria-pressed", "false");
  269 |   await actionIs(demo, "Last action", { type: "select-source", data: { reviewId: "evidence-1", sourceId: "notes" } }, record, "notes_selection");
  270 | }
  271 | async function toolCall({ demo, record, activate }) {
  272 |   const argumentsSummary = demo.locator("summary").filter({ hasText: /^Arguments$/ });
  273 |   await argumentsSummary.click();
  274 |   const argumentsDetails = argumentsSummary.locator("xpath=..");
  275 |   expect(await readJSON(argumentsDetails.locator("pre"))).toEqual({ invoiceId: "INV-42", includeLines: true });
  276 |   const resultSummary = demo.locator("summary").filter({ hasText: /^Current result$/ });
  277 |   await resultSummary.click();
  278 |   const currentResult = resultSummary.locator("xpath=..");
  279 |   expect(await readJSON(currentResult.locator("pre"))).toEqual({ found: true, total: 29.5 });
  280 |   const inspect = demo.getByRole("button", { name: "Review tool call", exact: true });
  281 |   await activate(inspect);
  282 |   await actionIs(demo, "Tool-call last action", { type: "inspect", data: { id: "call-invoice-42", tool: "lookup_invoice", arguments: { invoiceId: "INV-42", includeLines: true }, status: "succeeded", result: { found: true, total: 29.5 } } }, record, "inspected_completed_call");
  283 |   await demo.getByRole("checkbox", { name: "Consumer is busy inspecting", exact: true }).check(); await expect(inspect).toBeDisabled();
  284 |   await demo.getByRole("checkbox", { name: "Consumer is busy inspecting", exact: true }).uncheck();
  285 |   await demo.getByRole("checkbox", { name: "Reject next inspection intent", exact: true }).check(); await inspect.click();
  286 |   await expect(demo.getByText(actionError, { exact: true })).toBeVisible();
  287 |   await demo.getByLabel("Tool-call example status", { exact: true }).selectOption("running");
  288 |   await expect(demo.getByText("The consumer reports this tool call is running.", { exact: true })).toBeVisible();
  289 |   await expect(demo.getByText(actionError, { exact: true })).toHaveCount(0);
  290 |   await demo.getByLabel("Tool-call example status", { exact: true }).selectOption("failed");
  291 |   await expect(demo.getByRole("alert")).toContainText("Authored lookup failure");
  292 |   await expect(demo.getByText("No result supplied.", { exact: true })).toBeVisible();
  293 |   await inspect.click();
  294 |   await actionIs(demo, "Tool-call last action", { type: "inspect", data: { id: "call-invoice-42", tool: "lookup_invoice", arguments: { invoiceId: "INV-42", includeLines: true }, status: "failed" } }, record, "failed_call_remains_failed");
  295 | }
```
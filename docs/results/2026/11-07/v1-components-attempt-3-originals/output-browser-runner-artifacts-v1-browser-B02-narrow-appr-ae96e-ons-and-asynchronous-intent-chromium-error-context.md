# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: v1-browser.spec.mjs >> B02 narrow approval-card consent revisions and asynchronous intent
- Location: tooling/v1-browser.spec.mjs:521:26

# Error details

```
Error: expect(locator).toBeDisabled() failed

Locator: locator('.preview-shell').getByRole('button', { name: 'Approve & publish', exact: true })
Expected: disabled
Timeout: 3000ms
Error: element(s) not found

Call log:
  - Expect "toBeDisabled" locator('.preview-shell').getByRole('button', { name: 'Approve & publish', exact: true }) with timeout 3000ms
  - waiting for locator('.preview-shell').getByRole('button', { name: 'Approve & publish', exact: true })

```

```yaml
- banner:
  - link "M MCPCN":
    - /url: /
  - link "GitHub":
    - /url: https://github.com/alvarovillalbaa/mcpcn-ui
- main:
  - text: approval
  - heading "ApprovalCard" [level=1]
  - paragraph: "Human review and approval for agent actions: ApprovalCard."
  - text: Domain component React Validated data
  - region "ApprovalCard preview":
    - text: Preview theme
    - combobox "Preview theme":
      - option "Light"
      - option "Dark" [selected]
    - button "Change review terms"
    - checkbox "Approval is busy" [checked]
    - text: Approval is busy
    - checkbox "Reject next approval"
    - text: Reject next approval
    - heading "Publish pricing update?" [level=3]
    - text: high risk
    - paragraph: This changes prices for active EU customers.
    - strong: Pro plan
    - text: €49 → €59 1248 affected
    - strong: Effective date
    - text: — → Aug 15, 2026
    - paragraph: "Rollback: Restore the previous price table within 24 hours."
    - checkbox "I understand the impact of this action." [checked] [disabled]
    - text: I understand the impact of this action.
    - status: Working…
    - button "Cancel" [disabled]
    - button "Working…" [disabled]
    - paragraph:
      - text: "Intent count:"
      - status "Approval intent count": "0"
      - text: "· Settled:"
      - status "Approval settled count": "0"
    - text: "null"
  - heading "Install" [level=2]
  - text: pnpm dlx mcpcn add approval-card
  - paragraph: Public npm availability is a separate release gate. The repository documentation records the currently verified source, archives and hosting profile.
  - heading "Data props" [level=2]
  - paragraph: These fields come from the actual exported schema. Defaults may be omitted on input; the schema below describes validated output. Runtime checks also validate identities, conditional values and safe evidence links.
  - table "ApprovalCard data fields":
    - caption: ApprovalCard data fields
    - rowgroup:
      - row "Field Type Input":
        - columnheader "Field"
        - columnheader "Type"
        - columnheader "Input"
    - rowgroup:
      - row "title string Required":
        - rowheader "title":
          - code: title
        - cell "string"
        - cell "Required"
      - row "description string Optional":
        - rowheader "description":
          - code: description
        - cell "string"
        - cell "Optional"
      - row "riskLevel enum Defaulted":
        - rowheader "riskLevel":
          - code: riskLevel
        - cell "enum"
        - cell "Defaulted"
      - row "actionLabel string Defaulted":
        - rowheader "actionLabel":
          - code: actionLabel
        - cell "string"
        - cell "Defaulted"
      - row "cancelLabel string Defaulted":
        - rowheader "cancelLabel":
          - code: cancelLabel
        - cell "string"
        - cell "Defaulted"
      - row "changes array Defaulted":
        - rowheader "changes":
          - code: changes
        - cell "array"
        - cell "Defaulted"
      - row "requiresExplicitConsent boolean Defaulted":
        - rowheader "requiresExplicitConsent":
          - code: requiresExplicitConsent
        - cell "boolean"
        - cell "Defaulted"
      - row "consentLabel string Optional":
        - rowheader "consentLabel":
          - code: consentLabel
        - cell "string"
        - cell "Optional"
      - row "rollback string Optional":
        - rowheader "rollback":
          - code: rollback
        - cell "string"
        - cell "Optional"
      - row "approvalTool string Optional":
        - rowheader "approvalTool":
          - code: approvalTool
        - cell "string"
        - cell "Optional"
  - heading "React integration" [level=2]
  - text: "import { ApprovalCard } from \"@mcpcn/react\"; import { ApprovalCardSchema } from \"@mcpcn/schemas\"; const data = ApprovalCardSchema.parse(candidateData); <ApprovalCard {...data} onAction={handleAction} />;"
  - paragraph:
    - code: className
    - text: styles the surface and
    - code: onAction
    - text: receives consumer-owned intent. The new domain controls and revised approval/form surfaces expose
    - code: busy
    - text: and
    - code: error
    - text: feedback. Controlled selections and answers must be acknowledged by updating their props.
  - heading "Events" [level=2]
  - table "ApprovalCard action payloads":
    - caption: ApprovalCard action payloads
    - rowgroup:
      - row "Action type Data":
        - columnheader "Action type"
        - columnheader "Data"
    - rowgroup:
      - 'row "approve { tool? }"':
        - rowheader "approve":
          - code: approve
        - 'cell "{ tool? }"':
          - code: "{ tool? }"
      - row "cancel No data":
        - rowheader "cancel":
          - code: cancel
        - cell "No data":
          - code: No data
  - heading "JSON Schema" [level=2]
  - text: "{ \"$schema\": \"https://json-schema.org/draft/2020-12/schema\", \"type\": \"object\", \"properties\": { \"title\": { \"type\": \"string\" }, \"description\": { \"type\": \"string\" }, \"riskLevel\": { \"default\": \"medium\", \"type\": \"string\", \"enum\": [ \"low\", \"medium\", \"high\", \"critical\" ] }, \"actionLabel\": { \"default\": \"Approve\", \"type\": \"string\" }, \"cancelLabel\": { \"default\": \"Cancel\", \"type\": \"string\" }, \"changes\": { \"default\": [], \"type\": \"array\", \"items\": { \"type\": \"object\", \"properties\": { \"label\": { \"type\": \"string\" }, \"before\": { \"anyOf\": [ { \"type\": \"string\" }, { \"type\": \"number\" }, { \"type\": \"boolean\" }, { \"type\": \"null\" } ] }, \"after\": { \"anyOf\": [ { \"type\": \"string\" }, { \"type\": \"number\" }, { \"type\": \"boolean\" }, { \"type\": \"null\" } ] }, \"confidence\": { \"type\": \"number\", \"minimum\": 0, \"maximum\": 1 }, \"affectedCount\": { \"type\": \"integer\", \"minimum\": 0, \"maximum\": 9007199254740991 } }, \"required\": [ \"label\" ], \"additionalProperties\": false } }, \"requiresExplicitConsent\": { \"default\": false, \"type\": \"boolean\" }, \"consentLabel\": { \"type\": \"string\" }, \"rollback\": { \"type\": \"string\" }, \"approvalTool\": { \"type\": \"string\" } }, \"required\": [ \"title\", \"riskLevel\", \"actionLabel\", \"cancelLabel\", \"changes\", \"requiresExplicitConsent\" ], \"additionalProperties\": false }"
  - heading "Structured tool result" [level=2]
  - text: "import { ApprovalCardSchema } from \"@mcpcn/schemas\"; import { createStructuredResult } from \"@mcpcn/server\"; export function reviewedResult(candidate: unknown) { const data = ApprovalCardSchema.parse(candidate); return createStructuredResult(\"approval-card\", data); }"
  - heading "Security contract" [level=2]
  - paragraph: Previews use authored data and consumer callbacks. Applications own authorization, persistence, tool execution and explicit model-context publication.
  - paragraph:
    - strong: "Declared model-visible fields:"
    - text: decision, userInput
  - paragraph:
    - strong: "Private fields:"
    - text: internalId, rawPII
  - paragraph:
    - strong: "Declared consumer tool intents:"
    - text: configuredTool
  - paragraph:
    - strong: "Destructive intent:"
    - text: Potentially; review the exact application action
  - heading "Host and keyboard behavior" [level=2]
  - paragraph: Host integration uses the consuming application's runtime provider. Native inputs, buttons, links and semantic tables expose the local interactions shown above. External-host compatibility and full accessibility conformance require their own acceptance evidence.
- contentinfo:
  - strong: MCPCN
  - paragraph: Human control for agentic apps.
  - link "llms.txt":
    - /url: /llms.txt
  - link "GitHub":
    - /url: https://github.com/alvarovillalbaa/mcpcn-ui
  - link "Security":
    - /url: https://github.com/alvarovillalbaa/mcpcn-ui/blob/main/SECURITY.md
- alert
```

# Test source

```ts
  67  | function networkObserver(context, report, started, deadline) {
  68  |   const rows = new Map(), jobs = new Set();
  69  |   let closing = false, signal, changed;
  70  |   const reset = () => { changed = new Promise(resolve => { signal = resolve; }); }; reset();
  71  |   const notify = () => { signal(); reset(); };
  72  |   const error = (code, extra = {}) => {
  73  |     report.network.errorCount++;
  74  |     if (report.network.errors.length < 20) report.network.errors.push({ code, atMs: performance.now() - started, ...extra });
  75  |     notify();
  76  |   };
  77  |   const urlMeta = value => {
  78  |     try { const url = new URL(value); return { protocol: url.protocol, host: url.host, pathname: url.pathname.slice(0, 512) }; }
  79  |     catch { return { invalidURL: true }; }
  80  |   };
  81  |   const terminal = (row, value) => {
  82  |     if (row.terminal) { error("duplicate_or_conflicting_terminal", { ordinal: row.ordinal }); return; }
  83  |     row.terminal = value; row.terminalAtMs = performance.now() - started; notify();
  84  |   };
  85  |   const track = work => {
  86  |     let job;
  87  |     job = work.catch(() => error("observer_operation_failed")).finally(() => { jobs.delete(job); notify(); });
  88  |     jobs.add(job); return job;
  89  |   };
  90  |   context.on("request", request => {
  91  |     report.network.requests++;
  92  |     if (closing) error("request_after_fixture_close_started");
  93  |     if (rows.size >= 200) { error("request_bound_exceeded"); return; }
  94  |     const url = new URL(request.url());
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
> 167 |   await expect(button).toBeDisabled(); await expect(consent()).toBeDisabled();
      |                        ^ Error: expect(locator).toBeDisabled() failed
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
  195 |   await demo.getByLabel("Cabin", { exact: true }).selectOption("business");
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
```
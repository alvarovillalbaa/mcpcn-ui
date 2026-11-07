# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: v1-browser.spec.mjs >> B03 desktop schema-form replacement required fields and typed intent
- Location: tooling/v1-browser.spec.mjs:522:26

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator: locator('.preview-shell').getByLabel('Constraints', { exact: true })
Expected: focused
Timeout: 3000ms
Error: element(s) not found

Call log:
  - Expect "toBeFocused" locator('.preview-shell').getByLabel('Constraints', { exact: true }) with timeout 3000ms
  - waiting for locator('.preview-shell').getByLabel('Constraints', { exact: true })

```

```yaml
- banner:
  - link "M MCPCN":
    - /url: /
  - navigation:
    - link "Docs":
      - /url: /docs
    - link "Components":
      - /url: /components
    - link "Blocks":
      - /url: /blocks
    - link "Examples":
      - /url: /examples
    - link "Playground":
      - /url: /playground
  - link "Create":
    - /url: /create
  - link "GitHub":
    - /url: https://github.com/alvarovillalbaa/mcpcn-ui
- main:
  - text: forms
  - heading "SchemaForm" [level=1]
  - paragraph: "Schema-driven human input: SchemaForm."
  - text: Domain component React Validated data
  - region "SchemaForm preview":
    - text: Preview theme
    - combobox "Preview theme":
      - option "Light" [selected]
      - option "Dark"
    - button "Replace form fields"
    - checkbox "Reject next form intent"
    - text: Reject next form intent
    - form "A few details are missing":
      - heading "A few details are missing" [level=3]
      - paragraph: Review the currently requested fields before sending.
      - group "Fields to complete":
        - text: Fields to complete Travelers
        - spinbutton "Travelers": "2"
        - text: Cabin
        - combobox "Cabin":
          - option "Select…"
          - option "Economy"
          - option "Business" [selected]
        - text: Constraints
        - textbox "Constraints": Old travel draft
      - button "Continue workflow"
    - paragraph:
      - text: "Intent count:"
      - status "Form intent count": "0"
      - text: "· Settled:"
      - status "Form settled count": "0"
    - text: "null"
  - heading "Install" [level=2]
  - text: pnpm dlx mcpcn add schema-form
  - paragraph: Public npm availability is a separate release gate. The repository documentation records the currently verified source, archives and hosting profile.
  - heading "Data props" [level=2]
  - paragraph: These fields come from the actual exported schema. Defaults may be omitted on input; the schema below describes validated output. Runtime checks also validate identities, conditional values and safe evidence links.
  - table "SchemaForm data fields":
    - caption: SchemaForm data fields
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
      - row "fields array Required":
        - rowheader "fields":
          - code: fields
        - cell "array"
        - cell "Required"
      - row "submitLabel string Defaulted":
        - rowheader "submitLabel":
          - code: submitLabel
        - cell "string"
        - cell "Defaulted"
      - row "submitTool string Optional":
        - rowheader "submitTool":
          - code: submitTool
        - cell "string"
        - cell "Optional"
  - heading "React integration" [level=2]
  - text: "import { SchemaForm } from \"@mcpcn/react\"; import { SchemaFormSchema } from \"@mcpcn/schemas\"; const data = SchemaFormSchema.parse(candidateData); <SchemaForm {...data} onAction={handleAction} />;"
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
  - table "SchemaForm action payloads":
    - caption: SchemaForm action payloads
    - rowgroup:
      - row "Action type Data":
        - columnheader "Action type"
        - columnheader "Data"
    - rowgroup:
      - 'row "submit { values: current field allowlist, tool? }"':
        - rowheader "submit":
          - code: submit
        - 'cell "{ values: current field allowlist, tool? }"':
          - code: "{ values: current field allowlist, tool? }"
  - heading "JSON Schema" [level=2]
  - text: "{ \"$schema\": \"https://json-schema.org/draft/2020-12/schema\", \"type\": \"object\", \"properties\": { \"title\": { \"type\": \"string\" }, \"description\": { \"type\": \"string\" }, \"fields\": { \"type\": \"array\", \"items\": { \"type\": \"object\", \"properties\": { \"name\": { \"type\": \"string\" }, \"label\": { \"type\": \"string\" }, \"type\": { \"type\": \"string\", \"enum\": [ \"text\", \"textarea\", \"number\", \"email\", \"select\", \"boolean\" ] }, \"description\": { \"type\": \"string\" }, \"required\": { \"default\": false, \"type\": \"boolean\" }, \"value\": {}, \"options\": { \"type\": \"array\", \"items\": { \"type\": \"object\", \"properties\": { \"label\": { \"type\": \"string\" }, \"value\": { \"type\": \"string\" } }, \"required\": [ \"label\", \"value\" ], \"additionalProperties\": false } } }, \"required\": [ \"name\", \"label\", \"type\", \"required\" ], \"additionalProperties\": false } }, \"submitLabel\": { \"default\": \"Continue\", \"type\": \"string\" }, \"submitTool\": { \"type\": \"string\" } }, \"required\": [ \"title\", \"fields\", \"submitLabel\" ], \"additionalProperties\": false }"
  - heading "Structured tool result" [level=2]
  - text: "import { SchemaFormSchema } from \"@mcpcn/schemas\"; import { createStructuredResult } from \"@mcpcn/server\"; export function reviewedResult(candidate: unknown) { const data = SchemaFormSchema.parse(candidate); return createStructuredResult(\"schema-form\", data); }"
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
    - text: None
  - paragraph:
    - strong: "Destructive intent:"
    - text: No by default
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
  1   | // Tier 2: actual Chromium events against the owned Next production docs server.
  2   | import assert from "node:assert/strict";
  3   | import { createHash } from "node:crypto";
  4   | import { createRequire } from "node:module";
  5   | import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
  6   | import path from "node:path";
  7   | import { performance } from "node:perf_hooks";
  8   | 
  9   | const tools = process.env.MCPCN_V1_BROWSER_TOOLS;
  10  | assert.ok(tools && path.isAbsolute(tools), "An absolute isolated Playwright package is required");
  11  | const { test, expect: playwrightExpect } = createRequire(path.join(tools, "package.json"))("playwright/test");
  12  | const expect = playwrightExpect.configure({ timeout: 3000 });
  13  | const packageManifest = JSON.parse(await readFile(path.join(tools, "package.json"), "utf8"));
  14  | assert.equal(packageManifest.name, "playwright"); assert.equal(packageManifest.version, "1.65.0");
  15  | const origin = new URL(process.env.MCPCN_V1_ORIGIN ?? "");
  16  | assert.ok(origin.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname));
  17  | assert.equal(origin.href, origin.origin + "/");
  18  | assert.ok(!origin.username && !origin.password && origin.port);
  19  | const output = process.env.MCPCN_V1_BROWSER_OUTPUT, sourceCommit = process.env.SOURCE_COMMIT;
  20  | assert.ok(output && path.isAbsolute(output)); assert.match(sourceCommit ?? "", /^[0-9a-f]{40}$/);
  21  | const directory = await lstat(output);
  22  | assert.ok(directory.isDirectory() && !directory.isSymbolicLink() && directory.uid === process.getuid() && (directory.mode & 0o077) === 0);
  23  | assert.equal(await realpath(output), output);
  24  | const sha = value => createHash("sha256").update(value).digest("hex");
  25  | const actionError = "The action could not be completed. Try again.";
  26  | test.setTimeout(30000);
  27  | 
  28  | async function within(operation, deadline, code) {
  29  |   const remaining = deadline - performance.now();
  30  |   if (!(remaining > 0)) {
  31  |     // Already-started cleanup/metadata promises remain observed even when late.
  32  |     if (typeof operation !== "function") void Promise.resolve(operation).catch(() => undefined);
  33  |     throw new Error(code);
  34  |   }
  35  |   const promise = typeof operation === "function" ? operation() : operation;
  36  |   let timer;
  37  |   try {
  38  |     const value = await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(code)), remaining); })]);
  39  |     assert.ok(performance.now() < deadline, code);
  40  |     return value;
  41  |   } finally { clearTimeout(timer); }
  42  | }
  43  | async function absent(filename) {
  44  |   try { await lstat(filename); throw new Error("Output already exists: " + path.basename(filename)); }
  45  |   catch (error) { if (error.code !== "ENOENT") throw error; }
  46  | }
  47  | async function readJSON(locator) {
  48  |   const value = await locator.textContent();
  49  |   assert.ok(typeof value === "string" && Buffer.byteLength(value) <= 16384);
  50  |   try { return JSON.parse(value); } catch { return { notJSON: true, sha256: sha(value) }; }
  51  | }
  52  | async function actionIs(demo, label, expected, record, stage) {
  53  |   const locator = demo.getByLabel(label, { exact: true });
  54  |   await expect.poll(() => readJSON(locator)).toEqual(expected);
  55  |   const actual = await readJSON(locator); expect(actual).toEqual(expected);
  56  |   record(stage, { action: actual }); return actual;
  57  | }
  58  | async function keyboardCheck(page, locator) {
  59  |   await locator.focus(); await expect(locator).toBeFocused();
  60  |   await page.keyboard.press("Space"); await expect(locator).toBeChecked();
  61  | }
  62  | async function typeWithFocus(locator, first, rest = "") {
> 63  |   await locator.fill(""); await locator.pressSequentially(first); await expect(locator).toBeFocused();
      |                                                                                         ^ Error: expect(locator).toBeFocused() failed
  64  |   if (rest) { await locator.pressSequentially(rest); await expect(locator).toBeFocused(); }
  65  |   await expect(locator).toHaveValue(first + rest);
  66  | }
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
```
# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: evidence-review-browser.spec.mjs >> E02 narrow docs current supplied source selection
- Location: tooling/evidence-review-browser.spec.mjs:457:26

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator:  locator('iframe[title="MCPCN host simulator"]').contentFrame().locator('iframe[title="Rendered MCP app"]').contentFrame().getByRole('region', { name: 'Supplied research sources', exact: true }).getByRole('button', { name: 'Select source: Authored research note', exact: true })
Expected: focused
Received: inactive
Timeout:  3000ms

Call log:
  - Expect "toBeFocused" locator('iframe[title="MCPCN host simulator"]').contentFrame().locator('iframe[title="Rendered MCP app"]').contentFrame().getByRole('region', { name: 'Supplied research sources', exact: true }).getByRole('button', { name: 'Select source: Authored research note', exact: true }) with timeout 3000ms
  - waiting for locator('iframe[title="MCPCN host simulator"]').contentFrame().locator('iframe[title="Rendered MCP app"]').contentFrame().getByRole('region', { name: 'Supplied research sources', exact: true }).getByRole('button', { name: 'Select source: Authored research note', exact: true })
    10 × locator resolved to <button type="button" aria-pressed="true" data-variant="secondary" class="mcpcn mcpcn-button" aria-label="Select source: Authored research note">Select source</button>
       - unexpected value "inactive"

```

```yaml
- 'button "Select source: Authored research note" [pressed]': Select source
```

# Test source

```ts
  138 |         await within(changed, end, "network_settlement_deadline");
  139 |       }
  140 |     },
  141 |     snapshot() { report.network.rows = [...rows.values()]; report.cleanup.pendingRequests = [...rows.values()].filter(row => row.terminal === null || ["unobserved", "unresolved_or_late"].includes(row.responseFinished)).length; report.cleanup.observerJobs = jobs.size; report.cleanup.downloadArmRemaining = false; }
  142 |   };
  143 | }
  144 | 
  145 | async function ready(host) {
  146 |   await expect(host.getByRole("status", { name: "Host connection", exact: true })).toHaveText("ready", { timeout: 12000 });
  147 |   const app = host.frameLocator('iframe[title="Rendered MCP app"]');
  148 |   await expect(app.locator("main.frame-app > header").getByRole("status")).toHaveText("Bridge connected", { timeout: 12000 }); return app;
  149 | }
  150 | async function choose(host, slug) {
  151 |   await host.getByRole("combobox", { name: "Component or block", exact: true }).selectOption(slug);
  152 |   const app = await ready(host); await jsonIs(app.getByLabel("Received tool input", { exact: true }), { component: slug }); return app;
  153 | }
  154 | 
  155 | 
  156 | const labels = { sources: "Supplied research sources", native: "Supplied evidence", json: "Supplied evidence", requests: "Supplied evidence", stack: "Evidence drawer stack demonstration", fences: "Review supplied sources" };
  157 | const slugs = { sources: "source-list", native: "evidence-drawer", json: "evidence-drawer", requests: "evidence-drawer" };
  158 | const regionFor = (app, scenario) => app.getByRole("region", { name: labels[scenario], exact: true });
  159 | const sourceScope = { listId: "sources-1", listRevision: "1", sourceId: "note-a", sourceRevision: "1" };
  160 | const drawerScope = { drawerId: "evidence-1", drawerRevision: "1", sourceId: "note-a", sourceRevision: "1" };
  161 | const notificationError = "The view request could not be reported. Try again.";
  162 | const actionError = "The action could not be completed. Try again.";
  163 | async function snapshot(region, app, host = null, directLabel = null) {
  164 |   const dom = await region.evaluate(element => ({
  165 |     outerHTML: element.outerHTML, textContent: element.textContent,
  166 |     focus: { tag: document.activeElement?.tagName ?? null, label: document.activeElement?.getAttribute("aria-label") ?? null, text: element.contains(document.activeElement) ? document.activeElement?.textContent ?? null : null, inRegion: element.contains(document.activeElement), documentHasFocus: document.hasFocus() },
  167 |     dialogs: [...element.querySelectorAll("dialog")].map(node => ({ id: node.id, open: node.open, modal: node.matches(":modal"), title: document.getElementById(node.getAttribute("aria-labelledby"))?.textContent, role: node.getAttribute("role"), ariaModal: node.getAttribute("aria-modal"), tabIndexAttribute: node.getAttribute("tabindex") })),
  168 |     documentModalCount: document.querySelectorAll("dialog:modal").length,
  169 |     controls: [...element.querySelectorAll("button,input,select,summary,a")].map(node => ({ tag: node.tagName, text: node.textContent, label: node.getAttribute("aria-label"), disabled: node.matches(":disabled"), pressed: node.getAttribute("aria-pressed"), focused: node === document.activeElement, href: node.getAttribute("href"), target: node.getAttribute("target"), rel: node.getAttribute("rel"), referrerPolicy: node.getAttribute("referrerpolicy") })),
  170 |     details: [...element.querySelectorAll("details")].map(node => ({ open: node.open, summary: node.querySelector("summary")?.textContent, pre: node.querySelector("pre")?.textContent })),
  171 |     alerts: [...element.querySelectorAll('[role="alert"]')].map(node => node.textContent),
  172 |     counters: [...document.querySelectorAll("output[aria-label]")].map(node => ({ label: node.getAttribute("aria-label"), text: node.textContent })),
  173 |     viewport: { innerWidth, innerHeight, documentWidth: document.documentElement.scrollWidth, maxTouchPoints: navigator.maxTouchPoints },
  174 |   }));
  175 |   const label = directLabel ?? "Last component intent";
  176 |   const intent = await rawText(app.getByLabel(label, { exact: true }));
  177 |   const payload = host ? await host.getByRole("textbox", { name: "Tool result JSON", exact: true }).inputValue() : null;
  178 |   return { dom: original(JSON.stringify(dom)), intent: original(intent), intentValue: JSON.parse(intent), payload: payload === null ? null : original(payload) };
  179 | }
  180 | async function edited(host, mutate, activate, expectedKind) {
  181 |   const editor = host.getByRole("textbox", { name: "Tool result JSON", exact: true }), result = JSON.parse(await editor.inputValue());
  182 |   assert.ok(object(result) && object(result.structuredContent) && object(result.structuredContent.data));
  183 |   mutate(result.structuredContent.data);
  184 |   await editor.fill(JSON.stringify(result, null, 2)); await activate(host.getByRole("button", { name: "Invoke tool result", exact: true }));
  185 |   const app = await ready(host);
  186 |   if (expectedKind) await jsonIs(app.getByLabel("Received tool input", { exact: true }), { component: expectedKind });
  187 |   return { app, payload: original(JSON.stringify(result)) };
  188 | }
  189 | const dialogFor = region => region.locator("dialog");
  190 | async function modal(region, opened = true) {
  191 |   await expect.poll(() => dialogFor(region).evaluate(node => ({ open: node.open, modal: node.matches(":modal") }))).toEqual({ open: opened, modal: opened });
  192 | }
  193 | async function open(args, region) {
  194 |   await args.activate(region.getByRole("button", { name: "Open evidence", exact: true }));
  195 |   await modal(region);
  196 |   await expect(dialogFor(region).getByRole("heading", { level: 2 })).toBeFocused();
  197 | }
  198 | async function close(args, region) {
  199 |   await args.activate(dialogFor(region).getByRole("button", { name: "Close evidence", exact: true }));
  200 |   await modal(region, false);
  201 | }
  202 | async function count(page, label) { return Number(await page.getByLabel(label, { exact: true }).textContent()); }
  203 | async function counters(page, kind = "Evidence") {
  204 |   return { intents: await count(page, kind === "Evidence" ? "Evidence intent count" : "Source list intent count"), settled: await count(page, "Settled callback count") };
  205 | }
  206 | async function waitSettled(page, target) { await expect.poll(() => count(page, "Settled callback count"), { timeout: 4000 }).toBe(target); }
  207 | async function press(args, key) { await args.page.keyboard.press(key); args.report.input.keyboardActions++; }
  208 | async function sameNode(locator, handle) { assert.equal(await locator.evaluate((node, old) => node === old, handle), true); }
  209 | async function capture(args, stage, locator) {
  210 |   if (locator) await locator.scrollIntoViewIfNeeded();
  211 |   const filename = args.report.caseId + "-" + stage + ".png", target = path.join(output, filename);
  212 |   await absent(target); const bytes = await args.page.screenshot({ path: target, type: "png", fullPage: false, animations: "disabled", timeout: 3000 });
  213 |   assert.ok(bytes.length > 0 && bytes.length <= 262144);
  214 |   args.report.stageScreenshots.push({ stage, filename, bytes: bytes.length, sha256: sha(bytes), viewportOnly: true });
  215 | }
  216 | async function navigate(args, route) {
  217 |   await args.observer.settle();
  218 |   const url = origins.docs + route, response = await within(() => args.page.goto(url, { waitUntil: "load", timeout: 10000 }), args.deadline, "secondary_navigation_deadline");
  219 |   assert.ok(response); assert.equal(response.status(), 200);
  220 |   const request = response.request(), row = args.observer.rows.get(request);
  221 |   assert.ok(row && request.isNavigationRequest() && request.frame() === args.page.mainFrame()); assert.equal(request.url(), url);
  222 |   await args.observer.settle(); assert.equal(row.terminal, "finished"); assert.equal(row.responseFinished, "null");
  223 |   args.report.secondaryNavigations.push({ url, requestOrdinal: row.ordinal, status: response.status(), exactRequestIdentity: true, requestFinished: row.terminal, responseFinished: row.responseFinished });
  224 | }
  225 | async function sourcesJourney(args) {
  226 |   const { app, host, activate, record } = args, region = regionFor(app, "sources");
  227 |   const select = region.getByRole("button", { name: "Select source: Authored research note", exact: true });
  228 |   const handle = await select.elementHandle(); assert.ok(handle);
  229 |   try {
  230 |     await activate(select); await expect(select).toHaveAttribute("aria-pressed", "true"); await expect(select).toBeFocused();
  231 |     await jsonIs(app.getByLabel("Last component intent", { exact: true }), { type: "select-source", data: sourceScope });
  232 |     const anchor = region.getByRole("link", { name: "https://example.com/supplied-note", exact: true });
  233 |     await expect(anchor).toHaveAttribute("target", "_blank"); await expect(anchor).toHaveAttribute("rel", "noopener noreferrer"); await expect(anchor).toHaveAttribute("referrerpolicy", "no-referrer");
  234 |     await expect(region).toContainText("END-EXCERPT"); await expect(region).toContainText("END-SUPPORT");
  235 |     record("controlled_current_source_identity_and_private_full_text", { proof: await snapshot(region, app, host), safeLinkNotFollowed: true }); await capture(args, "selected", select);
  236 |     // Echo the current controlled selection in the new producer result before append.
  237 |     await edited(host, data => { data.selectedSourceId = "note-a"; data.sources.push({ id: "note-c", revision: "1", label: "Unrelated appended source", supports: [] }); }, activate);
> 238 |     await sameNode(select, handle); await expect(select).toHaveAttribute("aria-pressed", "true"); await expect(select).toBeFocused();
      |                                                                                                                        ^ Error: expect(locator).toBeFocused() failed
  239 |     record("unrelated_append_preserves_selected_node_and_inner_document_focus", { proof: await snapshot(region, app, host), sameNativeNode: true });
  240 |     await activate(region.getByRole("button", { name: "Inspect source: Authored research note", exact: true }));
  241 |     await jsonIs(app.getByLabel("Last component intent", { exact: true }), { type: "inspect-source", data: sourceScope });
  242 |     record("inspect_contains_only_current_identity", { proof: await snapshot(region, app, host) });
  243 |   } finally { await handle.dispose(); }
  244 |   const states = [];
  245 |   for (const state of ["loading", "empty", "error"]) {
  246 |     await edited(host, data => { for (const key of Object.keys(data)) if (!["id", "revision", "title"].includes(key)) delete data[key]; data.state = state; if (state === "error") data.message = "Authored source failure."; }, activate);
  247 |     await expect(region.getByRole("button")).toHaveCount(0);
  248 |     await expect(region).toContainText(state === "loading" ? "Source list is loading." : state === "empty" ? "No sources were supplied." : "Authored source failure.");
  249 |     states.push({ state, proof: await snapshot(region, app, host) });
  250 |   }
  251 |   record("explicit_source_states_hide_stale_members", { states });
  252 |   const prior = await snapshot(region, app, host);
  253 |   await edited(host, data => { data.state = "ready"; data.sources = [{ id: "x", revision: "1", label: "Unsafe URL", url: "javascript:alert(1)" }]; }, activate);
  254 |   await expect(host.getByRole("alert")).toContainText("Invalid component payload");
  255 |   const after = await snapshot(region, app, host); assert.deepEqual(after.intentValue, prior.intentValue);
  256 |   record("malformed_producer_refused_before_new_app_payload", { prior, proof: after, refusal: original(await rawText(host.getByRole("alert"))) });
  257 | }
  258 | async function nativeJourney(args) {
  259 |   const { app, host, activate, record, page } = args, region = regionFor(app, "native"), expected = JSON.parse(await host.getByRole("textbox", { name: "Tool result JSON", exact: true }).inputValue()).structuredContent.data.content.text;
  260 |   await modal(region, false); await open(args, region);
  261 |   await expect(dialogFor(region).locator("pre")).toHaveText(expected); assert.ok(expected.includes("END-EVIDENCE"));
  262 |   assert.equal(await dialogFor(region).locator("script").count(), 0); await jsonIs(app.getByLabel("Last component intent", { exact: true }), { type: "open-evidence", data: drawerScope });
  263 |   for (let i = 0; i < 8; i++) { await press(args, "Tab"); assert.equal(await dialogFor(region).evaluate(node => node.contains(document.activeElement)), true); }
  264 |   for (let i = 0; i < 8; i++) { await press(args, "Shift+Tab"); assert.equal(await dialogFor(region).evaluate(node => node.contains(document.activeElement)), true); }
  265 |   const bounds = await dialogFor(region).boundingBox(); assert.ok(bounds);
  266 |   const ownViewport = await dialogFor(region).evaluate(node => ({ width: innerWidth, height: innerHeight, scroll: node.scrollHeight, client: node.clientHeight }));
  267 |   assert.ok(bounds.width <= ownViewport.width && bounds.height <= ownViewport.height && bounds.x >= 0);
  268 |   record("native_modal_complete_escaped_text_focus_and_keyboard_containment", { proof: await snapshot(region, app, host), expectedText: original(expected), tabActions: 16, ownViewport }); await capture(args, "modal", dialogFor(region));
  269 |   await close(args, region); await expect(region.getByRole("button", { name: "Open evidence", exact: true })).toBeFocused();
  270 |   await jsonIs(app.getByLabel("Last component intent", { exact: true }), { type: "close-evidence", data: drawerScope });
  271 |   record("close_immediate_and_invoker_restored", { proof: await snapshot(region, app, host) });
  272 |   await open(args, region); await press(args, "Escape"); await modal(region, false); await expect(region.getByRole("button", { name: "Open evidence", exact: true })).toBeFocused();
  273 |   record("escape_dismisses_and_restores", { proof: await snapshot(region, app, host) });
  274 |   await open(args, region);
  275 |   const rect = await dialogFor(region).boundingBox(); assert.ok(rect && rect.x > 2);
  276 |   // Real page pointer coordinates include iframe offsets, supplied by boundingBox.
  277 |   await page.mouse.move(rect.x + rect.width / 2, rect.y + 10); await page.mouse.down();
  278 |   await page.mouse.move(rect.x - 2, rect.y + 10); await page.mouse.up(); args.report.input.pointerActions += 4;
  279 |   await modal(region);
  280 |   record("drag_from_content_to_backdrop_keeps_presentation", { proof: await snapshot(region, app, host) });
  281 |   await page.mouse.click(rect.x - 2, rect.y + 10); args.report.input.pointerActions++;
  282 |   await modal(region, false); record("genuine_backdrop_pointer_pair_dismisses", { proof: await snapshot(region, app, host) });
  283 | }
  284 | const nested = { alpha: { empty: "", zero: 0, no: false, nullable: null, list: ["<b>literal</b>", { end: "END-JSON" }] }, url: "plain JSON data", href: false };
  285 | async function jsonJourney(args) {
  286 |   const { app, host, activate, record } = args, region = regionFor(app, "json");
  287 |   await edited(host, data => { data.content = { type: "json", value: nested }; }, activate);
  288 |   await open(args, region); const shell = await dialogFor(region).elementHandle(), summary = dialogFor(region).locator("summary"); assert.ok(shell);
  289 |   try {
  290 |     assert.deepEqual(await json(dialogFor(region).locator("pre")), nested); await activate(summary);
  291 |     await expect(dialogFor(region).locator("details")).not.toHaveAttribute("open", ""); await expect(summary).toBeFocused();
  292 |     const equivalent = { href: false, url: "plain JSON data", alpha: { list: ["<b>literal</b>", { end: "END-JSON" }], nullable: null, no: false, zero: 0, empty: "" } };
  293 |     await edited(host, data => { data.content = { type: "json", value: equivalent }; }, activate);
  294 |     await modal(region); await sameNode(dialogFor(region), shell); await expect(summary).toBeFocused(); await expect(dialogFor(region).locator("details")).not.toHaveAttribute("open", "");
  295 |     record("equivalent_key_order_preserves_native_shell_disclosure_and_focus", { proof: await snapshot(region, app, host), sameNativeShell: true, expectedValue: nested }); await capture(args, "json", dialogFor(region));
  296 |     await edited(host, data => { data.content.value.alpha.zero = 1; }, activate); await modal(region, false); await sameNode(dialogFor(region), shell);
  297 |     record("meaningful_content_replacement_closes_old_presentation", { proof: await snapshot(region, app, host), sameNativeShell: true });
  298 |   } finally { await shell.dispose(); }
  299 |   for (const value of [null, false, 0, "", [], {}]) {
  300 |     await edited(host, data => { data.content = { type: "json", value }; }, activate); await open(args, region);
  301 |     assert.deepEqual(await json(dialogFor(region).locator("pre")), value); await close(args, region);
  302 |     record("complete_json_value_" + JSON.stringify(value), { value, proof: await snapshot(region, app, host) });
  303 |   }
  304 | }
  305 | async function requestsJourney(args) {
  306 |   const { app, host, activate, record, page } = args, region = regionFor(app, "requests");
  307 |   await edited(host, data => { data.open = false; }, activate);
  308 |   await activate(region.getByRole("button", { name: "Open evidence", exact: true })); await modal(region, false);
  309 |   await jsonIs(app.getByLabel("Last component intent", { exact: true }), { type: "open-evidence", data: drawerScope });
  310 |   record("external_false_emits_request_and_waits_for_producer", { proof: await snapshot(region, app, host) });
  311 |   await edited(host, data => { data.open = true; }, activate); await modal(region); await close(args, region);
  312 |   await edited(host, () => {}, activate); await modal(region, false);
  313 |   record("unchanged_true_does_not_undo_owned_dismissal", { proof: await snapshot(region, app, host) });
  314 |   await edited(host, data => { data.open = false; }, activate); await edited(host, data => { data.open = true; }, activate); await modal(region);
  315 |   record("fresh_external_request_opens_again", { proof: await snapshot(region, app, host) }); await capture(args, "request", dialogFor(region)); await close(args, region);
  316 |   await navigate(args, "/components/evidence-drawer");
  317 |   const direct = page.getByRole("region", { name: "Inspect supplied evidence", exact: true });
  318 |   await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("reject");
  319 |   await page.getByRole("checkbox", { name: "External busy", exact: true }).check();
  320 |   const before = await counters(page); await open(args, direct); await close(args, direct); await modal(direct, false);
  321 |   await waitSettled(page, before.settled + 2); await expect(direct.getByText(notificationError, { exact: true })).toBeVisible();
  322 |   assert.equal((await counters(page)).intents, before.intents + 2);
  323 |   record("busy_pending_rejected_notifications_cannot_strand_dismissal", { proof: await snapshot(direct, page, null, "Last evidence intent"), beforeCounters: before, afterCounters: await counters(page), positiveRejectedSettlements: 2 });
  324 | }
  325 | async function stackJourney(args) {
  326 |   const { page, activate, record } = args, region = regionFor(page, "stack");
  327 |   const a = region.getByRole("region", { name: "First stacked evidence", exact: true }), b = region.getByRole("region", { name: "Second stacked evidence", exact: true });
  328 |   const invoker = region.getByRole("button", { name: "Open stacked drawers", exact: true });
  329 |   await activate(invoker); await modal(a); await modal(b); await expect(dialogFor(b).getByRole("heading", { level: 2 })).toBeFocused();
  330 |   record("two_native_modal_instances_stack_in_document", { proof: await snapshot(region, page, null, "Last stacked evidence intent") }); await capture(args, "stack", dialogFor(b));
  331 |   await close(args, b); await modal(a); await expect(dialogFor(a).getByRole("heading", { level: 2 })).toBeFocused();
  332 |   record("top_close_returns_focus_to_active_lower_modal", { proof: await snapshot(region, page, null, "Last stacked evidence intent") });
  333 |   await close(args, a); await expect(invoker).toBeFocused();
  334 |   await region.getByRole("checkbox", { name: "Remove stack invoker after opening", exact: true }).check();
  335 |   await activate(invoker); await modal(a); await modal(b); await expect(invoker).toHaveCount(0);
  336 |   await close(args, b); await modal(a); await close(args, a); await expect(page.locator("dialog:modal")).toHaveCount(0);
  337 |   record("removed_invoker_is_not_focused_and_top_layer_releases", { proof: await snapshot(region, page, null, "Last stacked evidence intent"), invokerRemoved: true });
  338 |   await navigate(args, "/components/evidence-drawer");
```
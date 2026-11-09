# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: evidence-review-browser.spec.mjs >> E06 narrow CLI preview complete JSON and presentation scope
- Location: tooling/evidence-review-browser.spec.mjs:457:26

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator:  locator('iframe[title="Rendered MCP app"]').contentFrame().getByRole('region', { name: 'Supplied evidence', exact: true }).locator('dialog').locator('summary')
Expected: focused
Received: inactive
Timeout:  3000ms

Call log:
  - Expect "toBeFocused" locator('iframe[title="Rendered MCP app"]').contentFrame().getByRole('region', { name: 'Supplied evidence', exact: true }).locator('dialog').locator('summary') with timeout 3000ms
  - waiting for locator('iframe[title="Rendered MCP app"]').contentFrame().getByRole('region', { name: 'Supplied evidence', exact: true }).locator('dialog').locator('summary')
    10 × locator resolved to <summary>Evidence JSON</summary>
       - unexpected value "inactive"

```

```yaml
- text: Evidence JSON
```

# Test source

```ts
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
  238 |     await sameNode(select, handle); await expect(select).toHaveAttribute("aria-pressed", "true"); await expect(select).toBeFocused();
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
> 294 |     await modal(region); await sameNode(dialogFor(region), shell); await expect(summary).toBeFocused(); await expect(dialogFor(region).locator("details")).not.toHaveAttribute("open", "");
      |                                                                                          ^ Error: expect(locator).toBeFocused() failed
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
  339 |   await page.getByRole("combobox", { name: "Drawer lifecycle", exact: true }).selectOption("unmount");
  340 |   const direct = page.getByRole("region", { name: "Inspect supplied evidence", exact: true });
  341 |   await open(args, direct); await expect(direct).toHaveCount(0); await expect(page.locator("dialog:modal")).toHaveCount(0);
  342 |   const mount = page.getByRole("checkbox", { name: "Mount evidence drawer", exact: true }); await expect(mount).not.toBeChecked(); await mount.check();
  343 |   await expect(direct).toBeVisible(); await modal(direct, false);
  344 |   record("owned_unmount_removes_modal_and_fresh_remount_is_closed", { proof: await snapshot(direct, page, null, "Last evidence intent") });
  345 | }
  346 | async function fencesJourney(args) {
  347 |   const { page, activate, record } = args, region = regionFor(page, "fences"), response = page.getByRole("combobox", { name: "Consumer response", exact: true });
  348 |   await response.selectOption("reject"); const select = region.getByRole("button", { name: "Select source: Authored research note", exact: true });
  349 |   const before = await counters(page, "Source"); await activate(select); await expect(select).toHaveAttribute("aria-pressed", "true"); await expect(select).toBeDisabled();
  350 |   await activate(select, true); assert.equal((await counters(page, "Source")).intents, before.intents + 1);
  351 |   await activate(page.getByRole("button", { name: "Append unrelated source", exact: true })); await expect(select).toHaveAttribute("aria-pressed", "true"); await expect(select).toBeDisabled();
  352 |   record("unrelated_append_preserves_local_choice_and_pending_duplicate_guard", { proof: await snapshot(region, page, null, "Last source list intent"), beforeCounters: before, afterCounters: await counters(page, "Source") });
  353 |   await waitSettled(page, before.settled + 1); await expect(region.getByText(actionError, { exact: true })).toBeVisible();
  354 |   for (const button of ["Replace selected source", "Replace source list"]) {
  355 |     const current = region.getByRole("button", { name: /^Select source:/ }).first(), prior = await counters(page, "Source");
  356 |     await activate(current); await expect(current).toBeDisabled(); await activate(page.getByRole("button", { name: button, exact: true }));
  357 |     const replaced = await snapshot(region, page, null, "Last source list intent");
  358 |     await waitSettled(page, prior.settled + 1); await expect(region.getByText(actionError, { exact: true })).toHaveCount(0);
  359 |     record(button === "Replace selected source" ? "old_member_rejection_is_positively_settled_and_fenced" : "old_root_rejection_is_positively_settled_and_fenced", { replaced, proof: await snapshot(region, page, null, "Last source list intent"), beforeCounters: prior, afterCounters: await counters(page, "Source"), positiveRejectedSettlement: true });
  360 |   }
  361 |   await page.getByRole("checkbox", { name: "Callback enabled", exact: true }).uncheck();
  362 |   await activate(region.getByRole("button", { name: /^Select source:/ }).first()); await expect(region.getByRole("button", { name: /^Select source:/ }).first()).toHaveAttribute("aria-pressed", "true");
  363 |   await page.getByRole("checkbox", { name: "Malformed source list", exact: true }).check(); await expect(page.getByText("Source list is invalid", { exact: true })).toBeVisible(); await expect(region).toHaveCount(0);
  364 |   record("callback_free_local_selection_and_invalid_data_hide_stale_list", { invalid: original(await rawText(page.getByText("Source list is invalid", { exact: true }))), proof: await snapshot(page.getByText("Source list is invalid", { exact: true }).locator(".."), page, null, "Last source list intent") });
  365 |   await navigate(args, "/components/evidence-drawer");
  366 |   const drawer = page.getByRole("region", { name: "Inspect supplied evidence", exact: true });
  367 |   await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("reject");
  368 |   const old = await counters(page); await open(args, drawer); await close(args, drawer);
  369 |   await activate(page.getByRole("button", { name: "Replace evidence content", exact: true }));
  370 |   await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("immediate"); await open(args, drawer);
  371 |   await waitSettled(page, old.settled + 3); await modal(drawer); await expect(drawer.getByText(notificationError, { exact: true })).toHaveCount(0);
  372 |   record("old_presentation_rejections_settle_without_closing_or_labelling_replacement", { proof: await snapshot(drawer, page, null, "Last evidence intent"), beforeCounters: old, afterCounters: await counters(page), positiveRejectedSettlements: 2 }); await capture(args, "fence", dialogFor(drawer)); await close(args, drawer);
  373 |   await page.getByRole("checkbox", { name: "Callback enabled", exact: true }).uncheck(); await open(args, drawer); await close(args, drawer);
  374 |   await page.getByRole("checkbox", { name: "Malformed evidence", exact: true }).check(); await expect(page.getByText("Evidence drawer is invalid", { exact: true })).toBeVisible(); await expect(page.locator("dialog:modal")).toHaveCount(0);
  375 |   record("callback_free_native_view_and_invalid_data_unmount_stale_evidence", { invalid: original(await rawText(page.getByText("Evidence drawer is invalid", { exact: true }))), proof: await snapshot(page.getByText("Evidence drawer is invalid", { exact: true }).locator(".."), page, null, "Last evidence intent") });
  376 | }
  377 | const CASES = [
  378 |   ["E01", "E01 desktop docs current supplied source selection", "desktop", "sources", "docs", sourcesJourney],
  379 |   ["E02", "E02 narrow docs current supplied source selection", "narrow", "sources", "docs", sourcesJourney],
  380 |   ["E03", "E03 desktop CLI dev native modal inspection", "desktop", "native", "cliDev", nativeJourney],
  381 |   ["E04", "E04 narrow CLI dev native modal inspection", "narrow", "native", "cliDev", nativeJourney],
  382 |   ["E05", "E05 desktop CLI preview complete JSON and presentation scope", "desktop", "json", "cliPreview", jsonJourney],
  383 |   ["E06", "E06 narrow CLI preview complete JSON and presentation scope", "narrow", "json", "cliPreview", jsonJourney],
  384 |   ["E07", "E07 desktop docs external requests and owned dismissal", "desktop", "requests", "docs", requestsJourney],
  385 |   ["E08", "E08 narrow docs external requests and owned dismissal", "narrow", "requests", "docs", requestsJourney],
  386 |   ["E09", "E09 desktop docs native stacking and lifecycle", "desktop", "stack", "docs", stackJourney],
  387 |   ["E10", "E10 narrow docs native stacking and lifecycle", "narrow", "stack", "docs", stackJourney],
  388 |   ["E11", "E11 desktop docs current callback and replacement fences", "desktop", "fences", "docs", fencesJourney],
  389 |   ["E12", "E12 narrow docs current callback and replacement fences", "narrow", "fences", "docs", fencesJourney],
  390 | ];
  391 | 
  392 | async function runCase(browser, testInfo, [caseId, title, profile, scenario, originKey, journey]) {
  393 |   assert.equal(testInfo.retry, 0); assert.equal(browser.browserType().name(), "chromium"); testInfo.setTimeout(40000);
  394 |   const started = performance.now(), deadline = started + 36000, closeDeadline = started + 39000, origin = origins[originKey];
```
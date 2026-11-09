# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: evidence-review-browser.spec.mjs >> E06 narrow CLI preview complete JSON and presentation scope
- Location: tooling/evidence-review-browser.spec.mjs:515:26

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: locator('iframe[title="Rendered MCP app"]').contentFrame().getByRole('region', { name: 'Supplied evidence', exact: true }).locator('dialog').locator('pre')
Timeout: 3000ms
- Expected  - 9
+ Received  + 9

  {
-   "href": false,
-   "url": "plain JSON data",
+   "alpha": {
+     "empty": "",
+     "zero": 0,
+     "no": false,
-   "alpha": {
+     "nullable": null,
      "list": [
        "<b>literal</b>",
        {
          "end": "END-JSON"
        }
-     ],
+     ]
-     "nullable": null,
-     "no": false,
-     "zero": 0,
+   },
+   "url": "plain JSON data",
-     "empty": ""
-   }
+   "href": false
  }

Call log:
  - Expect "toHaveText" locator('iframe[title="Rendered MCP app"]').contentFrame().getByRole('region', { name: 'Supplied evidence', exact: true }).locator('dialog').locator('pre') with timeout 3000ms
  - waiting for locator('iframe[title="Rendered MCP app"]').contentFrame().getByRole('region', { name: 'Supplied evidence', exact: true }).locator('dialog').locator('pre')
    10 × locator resolved to <pre class="mcpcn-code">{↵  "alpha": {↵    "empty": "",↵    "zero": 0,↵  …</pre>
       - unexpected value "{
  "alpha": {
    "empty": "",
    "zero": 0,
    "no": false,
    "nullable": null,
    "list": [
      "<b>literal</b>",
      {
        "end": "END-JSON"
      }
    ]
  },
  "url": "plain JSON data",
  "href": false
}"

```

```yaml
- main:
  - text: MCPCN app frame
  - status: Bridge connected
  - paragraph: dark · inline · authored fixtures
  - region "Supplied evidence":
    - heading "Supplied evidence" [level=3]
    - paragraph: Evidence is supplied for inspection; its contents are not independently verified.
    - button "Open evidence" [expanded]
    - dialog "Supplied evidence":
      - heading "Supplied evidence" [level=2]
      - button "Close evidence"
      - region "Supplied evidence content":
        - heading "Authored research note" [level=4]
        - paragraph:
          - link "https://example.com/supplied-note":
            - /url: https://example.com/supplied-note
        - paragraph: Authored excerpt <em>kept as text</em>. END-EXCERPT
        - 'list "Supplied support: Authored research note"':
          - listitem: A supplied claim; not independently verified.
          - listitem: END-SUPPORT
        - group: Evidence JSON
        - paragraph: Sources and support are supplied claims, not verified evidence.
  - region "App requests":
    - button "Call fixture tool"
    - button "Share review summary"
    - button "Send fixture message"
    - button "Request fullscreen"
    - button "Request inline"
  - group: App state and capabilities
  - group: Last component intent
  - group: Fixture tool response
  - group: UI-only metadata
```

# Test source

```ts
  251 |   await expect(dialogFor(region).getByRole("heading", { level: 2 })).toBeFocused();
  252 | }
  253 | async function close(args, region) {
  254 |   const button = dialogFor(region).getByRole("button", { name: "Close evidence", exact: true });
  255 |   await alignReachable(args, button, "close"); await args.activate(button);
  256 |   await modal(region, false);
  257 | }
  258 | async function count(page, label) { return Number(await page.getByLabel(label, { exact: true }).textContent()); }
  259 | async function counters(page, kind = "Evidence") {
  260 |   return { intents: await count(page, kind === "Evidence" ? "Evidence intent count" : "Source list intent count"), settled: await count(page, "Settled callback count") };
  261 | }
  262 | async function waitSettled(page, target) { await expect.poll(() => count(page, "Settled callback count"), { timeout: 4000 }).toBe(target); }
  263 | async function press(args, key) { await args.page.keyboard.press(key); args.report.input.keyboardActions++; }
  264 | async function sameNode(locator, handle) { assert.equal(await locator.evaluate((node, old) => node === old, handle), true); }
  265 | async function capture(args, stage, locator) {
  266 |   if (locator) await alignReachable(args, locator, "capture:" + stage);
  267 |   const filename = args.report.caseId + "-" + stage + ".png", target = path.join(output, filename);
  268 |   await absent(target); const bytes = await args.page.screenshot({ path: target, type: "png", fullPage: false, animations: "disabled", timeout: 3000 });
  269 |   assert.ok(bytes.length > 0 && bytes.length <= 262144);
  270 |   args.report.stageScreenshots.push({ stage, filename, bytes: bytes.length, sha256: sha(bytes), viewportOnly: true });
  271 | }
  272 | async function navigate(args, route) {
  273 |   await args.observer.settle();
  274 |   const url = origins.docs + route, response = await within(() => args.page.goto(url, { waitUntil: "load", timeout: 10000 }), args.deadline, "secondary_navigation_deadline");
  275 |   assert.ok(response); assert.equal(response.status(), 200);
  276 |   const request = response.request(), row = args.observer.rows.get(request);
  277 |   assert.ok(row && request.isNavigationRequest() && request.frame() === args.page.mainFrame()); assert.equal(request.url(), url);
  278 |   await args.observer.settle(); assert.equal(row.terminal, "finished"); assert.equal(row.responseFinished, "null");
  279 |   args.report.secondaryNavigations.push({ url, requestOrdinal: row.ordinal, status: response.status(), exactRequestIdentity: true, requestFinished: row.terminal, responseFinished: row.responseFinished });
  280 | }
  281 | async function sourcesJourney(args) {
  282 |   const { app, host, activate, record } = args, region = regionFor(app, "sources");
  283 |   const select = region.getByRole("button", { name: "Select source: Authored research note", exact: true });
  284 |   const handle = await select.elementHandle(); assert.ok(handle);
  285 |   try {
  286 |     await activate(select); await expect(select).toHaveAttribute("aria-pressed", "true"); await expect(select).toBeFocused();
  287 |     await jsonIs(app.getByLabel("Last component intent", { exact: true }), { type: "select-source", data: sourceScope });
  288 |     const anchor = region.getByRole("link", { name: "https://example.com/supplied-note", exact: true });
  289 |     await expect(anchor).toHaveAttribute("target", "_blank"); await expect(anchor).toHaveAttribute("rel", "noopener noreferrer"); await expect(anchor).toHaveAttribute("referrerpolicy", "no-referrer");
  290 |     await expect(region).toContainText("END-EXCERPT"); await expect(region).toContainText("END-SUPPORT");
  291 |     record("controlled_current_source_identity_and_private_full_text", { proof: await snapshot(region, app, host), safeLinkNotFollowed: true }); await capture(args, "selected", select);
  292 |     // Echo the current controlled selection in the new producer result before append.
  293 |     const refresh = await producerRefresh(args, data => { data.selectedSourceId = "note-a"; data.sources.push({ id: "note-c", revision: "1", label: "Unrelated appended source", supports: [] }); }, select);
  294 |     await expect(region.getByRole("button", { name: "Select source: Unrelated appended source", exact: true })).toBeVisible();
  295 |     await sameNode(select, handle); await expect(select).toHaveAttribute("aria-pressed", "true"); await expect(select).toBeFocused();
  296 |     record("unrelated_append_preserves_selected_node_and_inner_document_focus", { proof: await snapshot(region, app, host), sameNativeNode: true, producerRefresh: refresh });
  297 |     await activate(region.getByRole("button", { name: "Inspect source: Authored research note", exact: true }));
  298 |     await jsonIs(app.getByLabel("Last component intent", { exact: true }), { type: "inspect-source", data: sourceScope });
  299 |     record("inspect_contains_only_current_identity", { proof: await snapshot(region, app, host) });
  300 |   } finally { await handle.dispose(); }
  301 |   const states = [];
  302 |   for (const state of ["loading", "empty", "error"]) {
  303 |     await edited(host, data => { for (const key of Object.keys(data)) if (!["id", "revision", "title"].includes(key)) delete data[key]; data.state = state; if (state === "error") data.message = "Authored source failure."; }, activate);
  304 |     await expect(region.getByRole("button")).toHaveCount(0);
  305 |     await expect(region).toContainText(state === "loading" ? "Source list is loading." : state === "empty" ? "No sources were supplied." : "Authored source failure.");
  306 |     states.push({ state, proof: await snapshot(region, app, host) });
  307 |   }
  308 |   record("explicit_source_states_hide_stale_members", { states });
  309 |   const prior = await snapshot(region, app, host);
  310 |   await edited(host, data => { data.state = "ready"; data.sources = [{ id: "x", revision: "1", label: "Unsafe URL", url: "javascript:alert(1)" }]; }, activate);
  311 |   await expect(host.getByRole("alert")).toContainText("Invalid component payload");
  312 |   const after = await snapshot(region, app, host); assert.deepEqual(after.intentValue, prior.intentValue);
  313 |   record("malformed_producer_refused_before_new_app_payload", { prior, proof: after, refusal: original(await rawText(host.getByRole("alert"))) });
  314 | }
  315 | async function nativeJourney(args) {
  316 |   const { app, host, activate, record, page } = args, region = regionFor(app, "native"), expected = JSON.parse(await host.getByRole("textbox", { name: "Tool result JSON", exact: true }).inputValue()).structuredContent.data.content.text;
  317 |   await modal(region, false); await open(args, region);
  318 |   await expect(dialogFor(region).locator("pre")).toHaveText(expected); assert.ok(expected.includes("END-EVIDENCE"));
  319 |   assert.equal(await dialogFor(region).locator("script").count(), 0); await jsonIs(app.getByLabel("Last component intent", { exact: true }), { type: "open-evidence", data: drawerScope });
  320 |   for (let i = 0; i < 8; i++) { await press(args, "Tab"); assert.equal(await dialogFor(region).evaluate(node => node.contains(document.activeElement)), true); }
  321 |   for (let i = 0; i < 8; i++) { await press(args, "Shift+Tab"); assert.equal(await dialogFor(region).evaluate(node => node.contains(document.activeElement)), true); }
  322 |   const bounds = await dialogFor(region).boundingBox(); assert.ok(bounds);
  323 |   const ownViewport = await dialogFor(region).evaluate(node => ({ width: innerWidth, height: innerHeight, scroll: node.scrollHeight, client: node.clientHeight }));
  324 |   assert.ok(bounds.width <= ownViewport.width && bounds.height <= ownViewport.height && bounds.x >= 0);
  325 |   record("native_modal_complete_escaped_text_focus_and_keyboard_containment", { proof: await snapshot(region, app, host), expectedText: original(expected), tabActions: 16, ownViewport }); await capture(args, "modal", dialogFor(region));
  326 |   await close(args, region); await expect(region.getByRole("button", { name: "Open evidence", exact: true })).toBeFocused();
  327 |   await jsonIs(app.getByLabel("Last component intent", { exact: true }), { type: "close-evidence", data: drawerScope });
  328 |   record("close_immediate_and_invoker_restored", { proof: await snapshot(region, app, host) });
  329 |   await open(args, region); await press(args, "Escape"); await modal(region, false); await expect(region.getByRole("button", { name: "Open evidence", exact: true })).toBeFocused();
  330 |   record("escape_dismisses_and_restores", { proof: await snapshot(region, app, host) });
  331 |   await open(args, region);
  332 |   const rect = await dialogFor(region).boundingBox(); assert.ok(rect && rect.x > 2);
  333 |   // Real page pointer coordinates include iframe offsets, supplied by boundingBox.
  334 |   await page.mouse.move(rect.x + rect.width / 2, rect.y + 10); await page.mouse.down();
  335 |   await page.mouse.move(rect.x - 2, rect.y + 10); await page.mouse.up(); args.report.input.pointerActions += 4;
  336 |   await modal(region);
  337 |   record("drag_from_content_to_backdrop_keeps_presentation", { proof: await snapshot(region, app, host) });
  338 |   await page.mouse.click(rect.x - 2, rect.y + 10); args.report.input.pointerActions++;
  339 |   await modal(region, false); record("genuine_backdrop_pointer_pair_dismisses", { proof: await snapshot(region, app, host) });
  340 | }
  341 | const nested = { alpha: { empty: "", zero: 0, no: false, nullable: null, list: ["<b>literal</b>", { end: "END-JSON" }] }, url: "plain JSON data", href: false };
  342 | async function jsonJourney(args) {
  343 |   const { app, host, activate, record } = args, region = regionFor(app, "json");
  344 |   await edited(host, data => { data.content = { type: "json", value: nested }; }, activate);
  345 |   await open(args, region); const shell = await dialogFor(region).elementHandle(), summary = dialogFor(region).locator("summary"); assert.ok(shell);
  346 |   try {
  347 |     assert.deepEqual(await json(dialogFor(region).locator("pre")), nested); await activate(summary);
  348 |     await expect(dialogFor(region).locator("details")).not.toHaveAttribute("open", ""); await expect(summary).toBeFocused();
  349 |     const equivalent = { href: false, url: "plain JSON data", alpha: { list: ["<b>literal</b>", { end: "END-JSON" }], nullable: null, no: false, zero: 0, empty: "" } };
  350 |     const refresh = await producerRefresh(args, data => { data.content = { type: "json", value: equivalent }; }, summary);
> 351 |     await expect(dialogFor(region).locator("pre")).toHaveText(JSON.stringify(equivalent, null, 2));
      |                                                    ^ Error: expect(locator).toHaveText(expected) failed
  352 |     await modal(region); await sameNode(dialogFor(region), shell); await expect(summary).toBeFocused(); await expect(dialogFor(region).locator("details")).not.toHaveAttribute("open", "");
  353 |     record("equivalent_key_order_preserves_native_shell_disclosure_and_focus", { proof: await snapshot(region, app, host), sameNativeShell: true, expectedValue: nested, producerRefresh: refresh }); await capture(args, "json", dialogFor(region));
  354 |     await edited(host, data => { data.content.value.alpha.zero = 1; }, activate); await modal(region, false); await sameNode(dialogFor(region), shell);
  355 |     record("meaningful_content_replacement_closes_old_presentation", { proof: await snapshot(region, app, host), sameNativeShell: true });
  356 |   } finally { await shell.dispose(); }
  357 |   for (const value of [null, false, 0, "", [], {}]) {
  358 |     await edited(host, data => { data.content = { type: "json", value }; }, activate); await open(args, region);
  359 |     assert.deepEqual(await json(dialogFor(region).locator("pre")), value); await close(args, region);
  360 |     record("complete_json_value_" + JSON.stringify(value), { value, proof: await snapshot(region, app, host) });
  361 |   }
  362 | }
  363 | async function requestsJourney(args) {
  364 |   const { app, host, activate, record, page } = args, region = regionFor(app, "requests");
  365 |   await edited(host, data => { data.open = false; }, activate);
  366 |   await activate(region.getByRole("button", { name: "Open evidence", exact: true })); await modal(region, false);
  367 |   await jsonIs(app.getByLabel("Last component intent", { exact: true }), { type: "open-evidence", data: drawerScope });
  368 |   record("external_false_emits_request_and_waits_for_producer", { proof: await snapshot(region, app, host) });
  369 |   await edited(host, data => { data.open = true; }, activate); await modal(region); await close(args, region);
  370 |   await edited(host, () => {}, activate); await modal(region, false);
  371 |   record("unchanged_true_does_not_undo_owned_dismissal", { proof: await snapshot(region, app, host) });
  372 |   await edited(host, data => { data.open = false; }, activate); await edited(host, data => { data.open = true; }, activate); await modal(region);
  373 |   record("fresh_external_request_opens_again", { proof: await snapshot(region, app, host) }); await capture(args, "request", dialogFor(region)); await close(args, region);
  374 |   await navigate(args, "/components/evidence-drawer");
  375 |   const direct = page.getByRole("region", { name: "Inspect supplied evidence", exact: true });
  376 |   await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("reject");
  377 |   await page.getByRole("checkbox", { name: "External busy", exact: true }).check();
  378 |   const before = await counters(page); await open(args, direct); await close(args, direct); await modal(direct, false);
  379 |   await waitSettled(page, before.settled + 2); await expect(direct.getByText(notificationError, { exact: true })).toBeVisible();
  380 |   assert.equal((await counters(page)).intents, before.intents + 2);
  381 |   record("busy_pending_rejected_notifications_cannot_strand_dismissal", { proof: await snapshot(direct, page, null, "Last evidence intent"), beforeCounters: before, afterCounters: await counters(page), positiveRejectedSettlements: 2 });
  382 | }
  383 | async function stackJourney(args) {
  384 |   const { page, activate, record } = args, region = regionFor(page, "stack");
  385 |   const a = region.getByRole("region", { name: "First stacked evidence", exact: true }), b = region.getByRole("region", { name: "Second stacked evidence", exact: true });
  386 |   const invoker = region.getByRole("button", { name: "Open stacked drawers", exact: true });
  387 |   await activate(invoker); await modal(a); await modal(b); await expect(dialogFor(b).getByRole("heading", { level: 2 })).toBeFocused();
  388 |   record("two_native_modal_instances_stack_in_document", { proof: await snapshot(region, page, null, "Last stacked evidence intent") }); await capture(args, "stack", dialogFor(b));
  389 |   await close(args, b); await modal(a); await expect(dialogFor(a).getByRole("heading", { level: 2 })).toBeFocused();
  390 |   record("top_close_returns_focus_to_active_lower_modal", { proof: await snapshot(region, page, null, "Last stacked evidence intent") });
  391 |   await close(args, a); await expect(invoker).toBeFocused();
  392 |   await region.getByRole("checkbox", { name: "Remove stack invoker after opening", exact: true }).check();
  393 |   await activate(invoker); await modal(a); await modal(b); await expect(invoker).toHaveCount(0);
  394 |   await close(args, b); await modal(a); await close(args, a); await expect(page.locator("dialog:modal")).toHaveCount(0);
  395 |   record("removed_invoker_is_not_focused_and_top_layer_releases", { proof: await snapshot(region, page, null, "Last stacked evidence intent"), invokerRemoved: true });
  396 |   await navigate(args, "/components/evidence-drawer");
  397 |   await page.getByRole("combobox", { name: "Drawer lifecycle", exact: true }).selectOption("unmount");
  398 |   const direct = page.getByRole("region", { name: "Inspect supplied evidence", exact: true });
  399 |   await open(args, direct); await expect(direct).toHaveCount(0); await expect(page.locator("dialog:modal")).toHaveCount(0);
  400 |   const mount = page.getByRole("checkbox", { name: "Mount evidence drawer", exact: true }); await expect(mount).not.toBeChecked(); await mount.check();
  401 |   await expect(direct).toBeVisible(); await modal(direct, false);
  402 |   record("owned_unmount_removes_modal_and_fresh_remount_is_closed", { proof: await snapshot(direct, page, null, "Last evidence intent") });
  403 | }
  404 | async function fencesJourney(args) {
  405 |   const { page, activate, record } = args, region = regionFor(page, "fences"), response = page.getByRole("combobox", { name: "Consumer response", exact: true });
  406 |   await response.selectOption("reject"); const select = region.getByRole("button", { name: "Select source: Authored research note", exact: true });
  407 |   const before = await counters(page, "Source"); await activate(select); await expect(select).toHaveAttribute("aria-pressed", "true"); await expect(select).toBeDisabled();
  408 |   await activate(select, true); assert.equal((await counters(page, "Source")).intents, before.intents + 1);
  409 |   await activate(page.getByRole("button", { name: "Append unrelated source", exact: true })); await expect(select).toHaveAttribute("aria-pressed", "true"); await expect(select).toBeDisabled();
  410 |   record("unrelated_append_preserves_local_choice_and_pending_duplicate_guard", { proof: await snapshot(region, page, null, "Last source list intent"), beforeCounters: before, afterCounters: await counters(page, "Source") });
  411 |   await waitSettled(page, before.settled + 1); await expect(region.getByText(actionError, { exact: true })).toBeVisible();
  412 |   for (const button of ["Replace selected source", "Replace source list"]) {
  413 |     const current = region.getByRole("button", { name: /^Select source:/ }).first(), prior = await counters(page, "Source");
  414 |     await activate(current); await expect(current).toBeDisabled(); await activate(page.getByRole("button", { name: button, exact: true }));
  415 |     const replaced = await snapshot(region, page, null, "Last source list intent");
  416 |     await waitSettled(page, prior.settled + 1); await expect(region.getByText(actionError, { exact: true })).toHaveCount(0);
  417 |     record(button === "Replace selected source" ? "old_member_rejection_is_positively_settled_and_fenced" : "old_root_rejection_is_positively_settled_and_fenced", { replaced, proof: await snapshot(region, page, null, "Last source list intent"), beforeCounters: prior, afterCounters: await counters(page, "Source"), positiveRejectedSettlement: true });
  418 |   }
  419 |   await page.getByRole("checkbox", { name: "Callback enabled", exact: true }).uncheck();
  420 |   await activate(region.getByRole("button", { name: /^Select source:/ }).first()); await expect(region.getByRole("button", { name: /^Select source:/ }).first()).toHaveAttribute("aria-pressed", "true");
  421 |   await page.getByRole("checkbox", { name: "Malformed source list", exact: true }).check(); await expect(page.getByText("Source list is invalid", { exact: true })).toBeVisible(); await expect(region).toHaveCount(0);
  422 |   record("callback_free_local_selection_and_invalid_data_hide_stale_list", { invalid: original(await rawText(page.getByText("Source list is invalid", { exact: true }))), proof: await snapshot(page.getByText("Source list is invalid", { exact: true }).locator(".."), page, null, "Last source list intent") });
  423 |   await navigate(args, "/components/evidence-drawer");
  424 |   const drawer = page.getByRole("region", { name: "Inspect supplied evidence", exact: true });
  425 |   await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("reject");
  426 |   const old = await counters(page); await open(args, drawer); await close(args, drawer);
  427 |   await activate(page.getByRole("button", { name: "Replace evidence content", exact: true }));
  428 |   await page.getByRole("combobox", { name: "Consumer response", exact: true }).selectOption("immediate"); await open(args, drawer);
  429 |   await waitSettled(page, old.settled + 3); await modal(drawer); await expect(drawer.getByText(notificationError, { exact: true })).toHaveCount(0);
  430 |   record("old_presentation_rejections_settle_without_closing_or_labelling_replacement", { proof: await snapshot(drawer, page, null, "Last evidence intent"), beforeCounters: old, afterCounters: await counters(page), positiveRejectedSettlements: 2 }); await capture(args, "fence", dialogFor(drawer)); await close(args, drawer);
  431 |   await page.getByRole("checkbox", { name: "Callback enabled", exact: true }).uncheck(); await open(args, drawer); await close(args, drawer);
  432 |   await page.getByRole("checkbox", { name: "Malformed evidence", exact: true }).check(); await expect(page.getByText("Evidence drawer is invalid", { exact: true })).toBeVisible(); await expect(page.locator("dialog:modal")).toHaveCount(0);
  433 |   record("callback_free_native_view_and_invalid_data_unmount_stale_evidence", { invalid: original(await rawText(page.getByText("Evidence drawer is invalid", { exact: true }))), proof: await snapshot(page.getByText("Evidence drawer is invalid", { exact: true }).locator(".."), page, null, "Last evidence intent") });
  434 | }
  435 | const CASES = [
  436 |   ["E01", "E01 desktop docs current supplied source selection", "desktop", "sources", "docs", sourcesJourney],
  437 |   ["E02", "E02 narrow docs current supplied source selection", "narrow", "sources", "docs", sourcesJourney],
  438 |   ["E03", "E03 desktop CLI dev native modal inspection", "desktop", "native", "cliDev", nativeJourney],
  439 |   ["E04", "E04 narrow CLI dev native modal inspection", "narrow", "native", "cliDev", nativeJourney],
  440 |   ["E05", "E05 desktop CLI preview complete JSON and presentation scope", "desktop", "json", "cliPreview", jsonJourney],
  441 |   ["E06", "E06 narrow CLI preview complete JSON and presentation scope", "narrow", "json", "cliPreview", jsonJourney],
  442 |   ["E07", "E07 desktop docs external requests and owned dismissal", "desktop", "requests", "docs", requestsJourney],
  443 |   ["E08", "E08 narrow docs external requests and owned dismissal", "narrow", "requests", "docs", requestsJourney],
  444 |   ["E09", "E09 desktop docs native stacking and lifecycle", "desktop", "stack", "docs", stackJourney],
  445 |   ["E10", "E10 narrow docs native stacking and lifecycle", "narrow", "stack", "docs", stackJourney],
  446 |   ["E11", "E11 desktop docs current callback and replacement fences", "desktop", "fences", "docs", fencesJourney],
  447 |   ["E12", "E12 narrow docs current callback and replacement fences", "narrow", "fences", "docs", fencesJourney],
  448 | ];
  449 | 
  450 | async function runCase(browser, testInfo, [caseId, title, profile, scenario, originKey, journey]) {
  451 |   assert.equal(testInfo.retry, 0); assert.equal(browser.browserType().name(), "chromium"); testInfo.setTimeout(40000);
```
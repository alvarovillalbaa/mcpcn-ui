# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: evidence-review-browser.spec.mjs >> E07 desktop docs external requests and owned dismissal
- Location: tooling/evidence-review-browser.spec.mjs:457:26

# Error details

```
TimeoutError: locator.click: Timeout 3000ms exceeded.
Call log:
  - waiting for locator('iframe[title="MCPCN host simulator"]').contentFrame().locator('iframe[title="Rendered MCP app"]').contentFrame().getByRole('region', { name: 'Supplied evidence', exact: true }).locator('dialog').getByRole('button', { name: 'Close evidence', exact: true })
    - locator resolved to <button type="button" data-variant="secondary" class="mcpcn mcpcn-button" aria-label="Close evidence">Close evidence</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - element is outside of the viewport
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - element is outside of the viewport
    - retrying click action
      - waiting 100ms
    6 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - element is outside of the viewport
    - retrying click action
      - waiting 500ms

```

# Test source

```ts
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
  395 |   const direct = ["stack", "fences"].includes(scenario), route = direct ? scenario === "stack" ? "/components/evidence-drawer" : "/components/source-list" : originKey === "docs" ? "/playground" : "/?component=evidence-drawer";
  396 |   const jsonPath = path.join(output, caseId + ".json"), pngPath = path.join(output, caseId + ".png"); await absent(jsonPath); await absent(pngPath);
  397 |   const viewport = profile === "desktop" ? { width: 1280, height: 900 } : { width: 390, height: 844 };
  398 |   const report = { schemaVersion: 1, sourceCommit, caseId, title, profile, scenario, originKey, route, origin, playwright: packageManifest.version, browserVersion: browser.version(), startedAt: new Date().toISOString(), viewport, touchEmulated: profile === "narrow", status: "failed", observations: [],
  399 |     stageScreenshots: [], secondaryNavigations: [], input: { trackedTaps: 0, trackedClicks: 0, keyboardActions: 0, pointerActions: 0 }, wire: [], sdkSends: {}, displayMessages: [],
  400 |     console: { debugCount: 0, warningCount: 0, warnings: [], sdkSendPreviewCount: 0, responsePreviewCount: 0, unclassifiedSendCount: 0, unclassifiedSends: [] }, downloadEvents: 0, blobDownload: { rows: [], nativeDownloadJoined: null },
  401 |     network: { requests: 0, requestFailures: 0, consoleErrors: 0, pageErrors: 0, webSockets: 0, errorCount: 0, errors: [], rows: [] },
  402 |     cleanup: { contextCreated: false, contextClosed: false, pagesCreated: 0, pagesClosed: 0, pendingRequests: null, observerJobs: null, downloadArmRemaining: false },
  403 |     limits: { workMs: 36000, closeMs: 39000, nativeMs: 40000, reportBytes: 262144, screenshotBytes: 262144 },
  404 |     proofLimits: ["Trusted caller-supplied evidence only, without source fetching/verification, tools, context publication, messages or persistence.", "Native modal acceptance is scoped to its own document. Narrow Chromium is touch emulation; physical devices, full assistive technology and external MCP hosts remain unverified.", "Complete DOM/intent/input originals, actual callback counters and native modal/focus observations are retained. Browser settlement is separate from raw socket/process cleanup."] };
  405 |   let context, page, observer, primary;
  406 |   const record = (stage, value) => { assert.ok(report.observations.length < 20); report.observations.push({ stage, atMs: performance.now() - started, ...value }); };
  407 |   try {
  408 |     context = await browser.newContext({ viewport, isMobile: profile === "narrow", hasTouch: profile === "narrow", locale: "en-US", timezoneId: "UTC", acceptDownloads: false, permissions: [] }); report.cleanup.contextCreated = true;
  409 |     context.setDefaultTimeout(3000); context.setDefaultNavigationTimeout(10000); observer = observe(context, report, started, deadline, origin); page = await context.newPage();
  410 |     const response = await within(() => page.goto(origin + route, { waitUntil: "load", timeout: 10000 }), deadline, "navigation_deadline"); assert.ok(response); assert.equal(response.status(), 200);
  411 |     const request = response.request(), navigation = observer.rows.get(request); assert.ok(navigation && request.isNavigationRequest() && request.frame() === page.mainFrame()); assert.equal(request.url(), origin + route);
  412 |     let host = null, app = page;
  413 |     if (direct) {
  414 |       await expect(regionFor(page, scenario)).toBeVisible(); assert.equal(page.frames().length, 1);
  415 |       report.frames = { outerPage: locationMeta(page.url()), hostUrl: null, appUrl: null, sessionFragmentSha256: null, hostRole: null, appRole: null, hostFrameCount: 0, appFrameCount: 0, actualFrameCount: 1 };
  416 |     } else {
  417 |       host = originKey === "docs" ? page.frameLocator('iframe[title="MCPCN host simulator"]') : page; app = await ready(host);
  418 |       await host.getByRole("combobox", { name: "Theme", exact: true }).selectOption(profile === "narrow" ? "dark" : "light");
  419 |       await host.getByRole("combobox", { name: "Viewport", exact: true }).selectOption(profile === "narrow" ? "390" : "760"); app = await choose(host, slugs[scenario]);
  420 |       await expect(app.locator("main.frame-app")).toHaveAttribute("data-theme", profile === "narrow" ? "dark" : "light");
  421 |       const appElement = host.locator('iframe[title="Rendered MCP app"]'), appSrc = await appElement.getAttribute("src"); assert.ok(appSrc);
  422 |       const appURL = new URL(appSrc, origin); assert.equal(appURL.origin, origin); assert.equal(appURL.pathname, originKey === "docs" ? "/playground-simulator/frame.html" : "/frame.html"); assert.ok(appURL.hash);
  423 |       const hostElement = originKey === "docs" ? page.locator('iframe[title="MCPCN host simulator"]') : null;
  424 |       const hostURL = hostElement ? new URL(await hostElement.getAttribute("src"), page.url()) : new URL(page.url());
  425 |       assert.equal(hostURL.origin, origin); assert.equal(hostURL.pathname, originKey === "docs" ? "/playground-simulator/index.html" : "/");
  426 |       report.frames = { outerPage: locationMeta(page.url()), hostUrl: locationMeta(hostURL.href), appUrl: locationMeta(appURL.href), sessionFragmentSha256: sha(appURL.hash), hostRole: hostElement ? await hostElement.getAttribute("title") : "direct CLI simulator", appRole: await appElement.getAttribute("title"), hostFrameCount: hostElement ? await hostElement.count() : 0, appFrameCount: await appElement.count(), actualFrameCount: page.frames().length };
  427 |       assert.equal(report.frames.appFrameCount, 1); assert.equal(report.frames.actualFrameCount, originKey === "docs" ? 3 : 2);
  428 |     }
  429 |     await observer.settle(); assert.equal(navigation.terminal, "finished"); assert.equal(navigation.responseFinished, "null");
  430 |     report.navigation = { requestOrdinal: navigation.ordinal, status: response.status(), exactRequestIdentity: true, requestFinished: navigation.terminal, responseFinished: navigation.responseFinished };
  431 |     report.observedViewport = await page.evaluate(() => ({ innerWidth, innerHeight, documentWidth: document.documentElement.scrollWidth, maxTouchPoints: navigator.maxTouchPoints }));
  432 |     assert.equal(report.observedViewport.innerWidth, viewport.width); assert.equal(report.observedViewport.innerHeight, viewport.height); assert.ok(report.observedViewport.documentWidth <= viewport.width + 1); assert.ok(profile === "narrow" ? report.observedViewport.maxTouchPoints > 0 : report.observedViewport.maxTouchPoints === 0);
> 433 |     const activate = async (locator, force = false) => { if (profile === "narrow") { await locator.tap({ force }); report.input.trackedTaps++; } else { await locator.click({ force }); report.input.trackedClicks++; } };
      |                                                                                                                                                                       ^ TimeoutError: locator.click: Timeout 3000ms exceeded.
  434 |     record(direct ? "actual_docs_component_ready" : "actual_nested_bridge_ready", { frames: report.frames, viewport: report.observedViewport, theme: direct ? null : profile === "narrow" ? "dark" : "light", proof: await snapshot(regionFor(app, scenario), app, host, direct ? scenario === "stack" ? "Last stacked evidence intent" : "Last source list intent" : null) });
  435 |     await within(() => journey({ page, context, host, app, report, observer, record, activate, deadline, profile }), deadline, "journey_deadline");
  436 |     assert.ok(profile === "narrow" ? report.input.trackedTaps > 0 : report.input.trackedClicks > 0); await observer.settle(); report.cookieCount = (await context.cookies()).length; assert.equal(report.cookieCount, 0);
  437 |     assert.deepEqual(report.wire, []); for (const method of forbiddenMethods) assert.equal(report.sdkSends[method] ?? 0, 0);
  438 |     if (direct) assert.equal(Object.keys(report.sdkSends).length, 0); else for (const method of ["ui/initialize", "ui/notifications/initialized", "ui/notifications/tool-input", "ui/notifications/tool-result"]) assert.ok((report.sdkSends[method] ?? 0) > 0);
  439 |     assert.equal(report.downloadEvents, 0); assert.equal(report.network.requestFailures, 0); assert.equal(report.console.unclassifiedSendCount, 0);
  440 |     report.finalLocation = locationMeta(page.url());
  441 |   } catch (error) { primary = error; report.failure = { name: String(error?.name ?? "Error").slice(0, 80), messageSha256: sha(String(error?.message ?? error)) }; }
  442 |   finally {
  443 |     if (page && !page.isClosed()) {
  444 |       try { const png = await within(() => page.screenshot({ path: pngPath, type: "png", fullPage: false, animations: "disabled", timeout: 3000 }), deadline, "screenshot_deadline"); report.screenshot = { filename: caseId + ".png", bytes: png.length, sha256: sha(png), viewportOnly: true }; assert.ok(png.length > 0 && png.length <= 262144); }
  445 |       catch (error) { primary ??= error; observer?.error("screenshot_unproved"); }
  446 |     } else { primary ??= new Error("screenshot_page_unavailable"); observer?.error("screenshot_unproved"); }
  447 |     if (observer && !primary) { try { await observer.settle(); } catch (error) { primary ??= error; } }
  448 |     if (context) { observer?.closeStarted(); try { await within(context.close(), closeDeadline, "context_close_deadline"); report.cleanup.contextClosed = true; } catch (error) { primary ??= error; observer?.error("context_close_unproved"); } }
  449 |     if (observer) { if (observer.jobs.size) { try { await within(Promise.all([...observer.jobs]), closeDeadline, "observer_close_deadline"); } catch (error) { primary ??= error; observer.error("observer_cleanup_incomplete"); } } observer.snapshot(); }
  450 |     const current = await lstat(output); if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== directory.dev || current.ino !== directory.ino || current.uid !== directory.uid) primary ??= new Error("browser_output_identity_changed");
  451 |     const clean = report.cleanup.contextCreated && report.cleanup.contextClosed && report.cleanup.pagesCreated === 1 && report.cleanup.pagesClosed === 1 && report.cleanup.pendingRequests === 0 && report.cleanup.observerJobs === 0 && !report.cleanup.downloadArmRemaining;
  452 |     if (!primary && clean && report.network.errorCount === 0 && report.screenshot) report.status = "passed"; else primary ??= new Error("browser_case_or_cleanup_unproved");
  453 |     report.completedAt = new Date().toISOString(); const bytes = Buffer.from(JSON.stringify(report, null, 2) + "\n"); assert.ok(bytes.length <= 262144); await writeFile(jsonPath, bytes, { flag: "wx", mode: 0o600 });
  454 |   }
  455 |   if (primary) throw primary;
  456 | }
  457 | for (const row of CASES) test(row[1], async ({ browser }, testInfo) => runCase(browser, testInfo, row));
  458 | 
```
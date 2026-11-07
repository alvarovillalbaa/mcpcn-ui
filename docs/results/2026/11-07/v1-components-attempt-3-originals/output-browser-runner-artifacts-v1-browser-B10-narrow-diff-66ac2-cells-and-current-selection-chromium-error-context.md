# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: v1-browser.spec.mjs >> B10 narrow diff-viewer semantic cells and current selection
- Location: tooling/v1-browser.spec.mjs:521:26

# Error details

```
AssertionError: Expected values to be strictly equal:

522 !== 390

```

# Test source

```ts
  374 |   await actionIs(demo, "Last comparison action", { type: "selection-change", data: { comparisonId: "demo-delivery-comparison", selectedId: "express" } }, record, "keyboard_radio_selection");
  375 |   await activate(confirm);
  376 |   await actionIs(demo, "Last comparison action", { type: "confirm", data: { comparisonId: "demo-delivery-comparison", selectedId: "express" } }, record, "current_option_confirmed");
  377 |   await demo.getByRole("button", { name: "Clear selection", exact: true }).click(); await expect(confirm).toBeDisabled();
  378 |   await actionIs(demo, "Last comparison action", { type: "selection-change", data: { comparisonId: "demo-delivery-comparison", selectedId: null } }, record, "cleared_selection");
  379 |   const mode = demo.getByLabel("Comparison example payload", { exact: true });
  380 |   await mode.selectOption("empty"); await expect(demo.getByText("No options to compare.", { exact: true })).toBeVisible(); await expect(demo.getByRole("radio")).toHaveCount(0);
  381 |   record("actual_empty_payload", { text: await demo.getByText("No options to compare.", { exact: true }).textContent() });
  382 |   await mode.selectOption("malformed"); await expect(demo.getByRole("alert")).toContainText("Comparison is invalid");
  383 |   await expect(demo.getByRole("radio")).toHaveCount(0);
  384 |   record("actual_malformed_payload", { text: await demo.getByRole("alert").textContent() });
  385 |   await mode.selectOption("ready"); await expect(confirm).toBeDisabled(); await expect(express).not.toBeChecked();
  386 | }
  387 | async function scoreBreakdown({ demo, record, activate }) {
  388 |   const total = demo.getByLabel("Weighted total", { exact: true });
  389 |   await expect(total).toHaveText("Weighted total: 20 / 25 (80%)");
  390 |   const coverage = demo.getByRole("progressbar", { name: "Coverage score", exact: true });
  391 |   await expect(coverage).toHaveAttribute("value", "8"); await expect(coverage).toHaveAttribute("max", "10");
  392 |   await expect(demo.getByText("Eight covered; two still need review.", { exact: true })).toBeVisible();
  393 |   const reviewCoverage = demo.getByRole("button", { name: "Review Coverage", exact: true }), reviewCost = demo.getByRole("button", { name: "Review Cost fit", exact: true });
  394 |   await reviewCoverage.focus(); await activate(reviewCoverage); await expect(reviewCoverage).toHaveAttribute("aria-pressed", "true");
  395 |   await actionIs(demo, "Last score action", { type: "criterion-review", data: { scoreId: "demo-scorecard", criterionId: "coverage" } }, record, "coverage_review");
  396 |   await reviewCost.focus(); await reviewCost.press("Space"); await expect(reviewCost).toHaveAttribute("aria-pressed", "true"); await expect(reviewCoverage).toHaveAttribute("aria-pressed", "false");
  397 |   await actionIs(demo, "Last score action", { type: "criterion-review", data: { scoreId: "demo-scorecard", criterionId: "cost" } }, record, "cost_review");
  398 |   record("displayed_weighted_total", { text: await total.textContent(), coverageValue: await coverage.getAttribute("value"), coverageMax: await coverage.getAttribute("max") });
  399 | }
  400 | 
  401 | export const CASES = [
  402 |   ["B01", "B01 desktop approval-card consent revisions and asynchronous intent", "desktop", "approval-card", approval],
  403 |   ["B02", "B02 narrow approval-card consent revisions and asynchronous intent", "narrow", "approval-card", approval],
  404 |   ["B03", "B03 desktop schema-form replacement required fields and typed intent", "desktop", "schema-form", schemaForm],
  405 |   ["B04", "B04 narrow schema-form replacement required fields and typed intent", "narrow", "schema-form", schemaForm],
  406 |   ["B05", "B05 desktop confirmation-panel consent and current terms", "desktop", "confirmation-panel", confirmation],
  407 |   ["B06", "B06 narrow confirmation-panel consent and current terms", "narrow", "confirmation-panel", confirmation],
  408 |   ["B07", "B07 desktop risk-review-panel acknowledgements and revision", "desktop", "risk-review-panel", riskReview],
  409 |   ["B08", "B08 narrow risk-review-panel acknowledgements and revision", "narrow", "risk-review-panel", riskReview],
  410 |   ["B09", "B09 desktop diff-viewer semantic cells and current selection", "desktop", "diff-viewer", diffViewer],
  411 |   ["B10", "B10 narrow diff-viewer semantic cells and current selection", "narrow", "diff-viewer", diffViewer],
  412 |   ["B11", "B11 desktop source-evidence-panel claims and source selection", "desktop", "source-evidence-panel", sourceEvidence],
  413 |   ["B12", "B12 narrow source-evidence-panel claims and source selection", "narrow", "source-evidence-panel", sourceEvidence],
  414 |   ["B13", "B13 desktop tool-call-card inspect status busy and rejection", "desktop", "tool-call-card", toolCall],
  415 |   ["B14", "B14 narrow tool-call-card inspect status busy and rejection", "narrow", "tool-call-card", toolCall],
  416 |   ["B15", "B15 desktop retryable-error-state retained operation and rejection", "desktop", "retryable-error-state", retryState],
  417 |   ["B16", "B16 narrow retryable-error-state retained operation and rejection", "narrow", "retryable-error-state", retryState],
  418 |   ["B17", "B17 desktop auth-required-card scoped intent and unavailable state", "desktop", "auth-required-card", authRequired],
  419 |   ["B18", "B18 narrow auth-required-card scoped intent and unavailable state", "narrow", "auth-required-card", authRequired],
  420 |   ["B19", "B19 desktop dynamic-question-flow branching focus and allowlisted submit", "desktop", "dynamic-question-flow", dynamicFlow],
  421 |   ["B20", "B20 narrow dynamic-question-flow branching focus and allowlisted submit", "narrow", "dynamic-question-flow", dynamicFlow],
  422 |   ["B21", "B21 desktop extracted-fields-review correction evidence and reset", "desktop", "extracted-fields-review", extractionReview],
  423 |   ["B22", "B22 narrow extracted-fields-review correction evidence and reset", "narrow", "extracted-fields-review", extractionReview],
  424 |   ["B23", "B23 desktop comparison-matrix keyboard selection empty and malformed", "desktop", "comparison-matrix", comparisonMatrix],
  425 |   ["B24", "B24 narrow comparison-matrix keyboard selection empty and malformed", "narrow", "comparison-matrix", comparisonMatrix],
  426 |   ["B25", "B25 desktop score-breakdown weighted total and criterion review", "desktop", "score-breakdown", scoreBreakdown],
  427 |   ["B26", "B26 narrow score-breakdown weighted total and criterion review", "narrow", "score-breakdown", scoreBreakdown]
  428 | ];
  429 | assert.equal(CASES.length, 26); assert.equal(new Set(CASES.map(row => row[0])).size, 26);
  430 | 
  431 | async function runCase(browser, testInfo, [caseId, title, profile, slug, journey]) {
  432 |   assert.equal(testInfo.retry, 0); assert.equal(browser.browserType().name(), "chromium");
  433 |   const started = performance.now(), deadline = started + 26000, closeDeadline = started + 29000;
  434 |   const route = "/components/" + slug, jsonPath = path.join(output, caseId + ".json"), pngPath = path.join(output, caseId + ".png");
  435 |   await absent(jsonPath); await absent(pngPath);
  436 |   const viewport = profile === "desktop" ? { width: 1280, height: 900 } : { width: 390, height: 844 };
  437 |   const report = { schemaVersion: 1, sourceCommit, caseId, title, profile, route, origin: origin.origin, playwright: packageManifest.version,
  438 |     startedAt: new Date().toISOString(), browserVersion: browser.version(), viewport, touchEmulated: profile === "narrow", status: "failed", observations: [],
  439 |     input: { trackedTaps: 0, trackedClicks: 0 },
  440 |     network: { requests: 0, requestFailures: 0, consoleErrors: 0, pageErrors: 0, webSockets: 0, errorCount: 0, errors: [], rows: [] },
  441 |     cleanup: { contextCreated: false, contextClosed: false, pagesCreated: 0, pagesClosed: 0, pendingRequests: null, observerJobs: null },
  442 |     proofLimits: ["Owned Next production docs server and authored intent callbacks only; no external MCP host, tools, authentication, model or persistence.",
  443 |       "Narrow uses Chromium mobile/touch emulation, not a physical device. Assertions establish selected keyboard/semantics behavior, not accessibility conformance.",
  444 |       "Network rows bind observed Playwright Request identities and terminal acknowledgements; no all-assets integrity or raw transport EOF assertion.",
  445 |       "One viewport screenshot records the final observed state, not every transition. Browser-process teardown is the outer supervisor's responsibility."] };
  446 |   let context, observer, page, primary;
  447 |   const record = (stage, observation) => { assert.ok(report.observations.length < 20); report.observations.push({ stage, atMs: performance.now() - started, ...observation }); };
  448 |   try {
  449 |     context = await browser.newContext({ viewport, isMobile: profile === "narrow", hasTouch: profile === "narrow", locale: "en-US", timezoneId: "UTC", acceptDownloads: false });
  450 |     report.cleanup.contextCreated = true; context.setDefaultTimeout(3000); context.setDefaultNavigationTimeout(10000);
  451 |     observer = networkObserver(context, report, started, deadline);
  452 |     page = await context.newPage();
  453 |     const response = await within(() => page.goto(origin.origin + route, { waitUntil: "load", timeout: 10000 }), deadline, "navigation_deadline");
  454 |     assert.ok(response); assert.equal(response.status(), 200);
  455 |     const request = response.request(), navigation = observer.rows.get(request);
  456 |     assert.ok(navigation && request.isNavigationRequest() && request.frame() === page.mainFrame()); assert.equal(new URL(request.url()).pathname, route);
  457 |     await observer.settle();
  458 |     assert.equal(navigation.terminal, "finished"); assert.equal(navigation.responseFinished, "null");
  459 |     report.navigation = { requestOrdinal: navigation.ordinal, status: response.status(), exactRequestIdentity: true, requestFinished: navigation.terminal, responseFinished: navigation.responseFinished };
  460 |     const demo = page.locator(".preview-shell"); await expect(demo).toHaveCount(1); await expect(demo).toBeVisible();
  461 |     const theme = demo.getByLabel("Preview theme", { exact: true }), mode = profile === "narrow" ? "dark" : "light";
  462 |     await expect(theme).toHaveValue("light");
  463 |     if (profile === "narrow") await theme.selectOption("dark");
  464 |     await expect(demo.locator("[data-preview-theme]")).toHaveAttribute("data-preview-theme", mode);
  465 |     const card = demo.locator(".mcpcn-card").first();
  466 |     const cardColors = () => card.evaluate(element => {
  467 |       const style = getComputedStyle(element);
  468 |       return { backgroundColor: style.backgroundColor, color: style.color };
  469 |     });
  470 |     const expectedColors = profile === "narrow" ? { backgroundColor: "rgb(24, 24, 27)", color: "rgb(250, 250, 250)" } : { backgroundColor: "rgb(255, 255, 255)", color: "rgb(24, 24, 27)" };
  471 |     await expect.poll(cardColors).toEqual(expectedColors);
  472 |     report.theme = { mode, ...await cardColors() };
  473 |     report.observedViewport = await page.evaluate(() => ({ innerWidth, innerHeight, documentWidth: document.documentElement.scrollWidth, maxTouchPoints: navigator.maxTouchPoints }));
> 474 |     assert.equal(report.observedViewport.innerWidth, viewport.width); assert.equal(report.observedViewport.innerHeight, viewport.height);
      |            ^ AssertionError: Expected values to be strictly equal:
  475 |     assert.ok(report.observedViewport.documentWidth <= viewport.width + 1);
  476 |     assert.ok(profile === "narrow" ? report.observedViewport.maxTouchPoints > 0 : report.observedViewport.maxTouchPoints === 0);
  477 |     record("initial_theme_and_viewport", { theme: report.theme, viewport: report.observedViewport });
  478 |     const activate = async locator => {
  479 |       if (profile === "narrow") { await locator.tap(); report.input.trackedTaps++; }
  480 |       else { await locator.click(); report.input.trackedClicks++; }
  481 |     };
  482 |     await journey({ page, demo, record, activate });
  483 |     assert.ok(profile === "narrow" ? report.input.trackedTaps > 0 : report.input.trackedClicks > 0);
  484 |     await observer.settle();
  485 |     assert.equal((await context.cookies()).length, 0);
  486 |   } catch (error) { primary = error; report.failure = { name: String(error?.name ?? "Error").slice(0, 80), messageSha256: sha(String(error?.message ?? error)) }; }
  487 |   finally {
  488 |     if (page && !page.isClosed()) {
  489 |       try {
  490 |         const png = await within(() => page.screenshot({ path: pngPath, type: "png", fullPage: false, animations: "disabled", timeout: 3000 }), deadline, "screenshot_deadline");
  491 |         report.screenshot = { filename: caseId + ".png", bytes: png.length, sha256: sha(png), viewportOnly: true };
  492 |         assert.ok(png.length > 0 && png.length <= 256 * 1024, "Screenshot exceeds 256 KiB bound");
  493 |       } catch (error) { primary ??= error; observer?.error("screenshot_unproved"); }
  494 |     } else { primary ??= new Error("Screenshot page unavailable"); observer?.error("screenshot_unproved"); }
  495 |     if (observer && !primary) {
  496 |       try { await observer.settle(); } catch (error) { primary ??= error; }
  497 |     }
  498 |     if (context) {
  499 |       observer?.closeStarted();
  500 |       try { await within(context.close(), closeDeadline, "context_close_deadline"); report.cleanup.contextClosed = true; }
  501 |       catch (error) { primary ??= error; observer?.error("context_close_unproved"); }
  502 |     }
  503 |     if (observer) {
  504 |       if (observer.jobs.size) {
  505 |         try { await within(Promise.all([...observer.jobs]), closeDeadline, "observer_close_deadline"); }
  506 |         catch (error) { primary ??= error; observer.error("observer_cleanup_incomplete"); }
  507 |       }
  508 |       observer.snapshot();
  509 |     }
  510 |     const current = await lstat(output);
  511 |     if (current.dev !== directory.dev || current.ino !== directory.ino || current.uid !== directory.uid || !current.isDirectory() || current.isSymbolicLink()) primary ??= new Error("Output directory identity changed");
  512 |     const clean = report.cleanup.contextCreated && report.cleanup.contextClosed && report.cleanup.pagesCreated === 1 && report.cleanup.pagesClosed === 1 && report.cleanup.pendingRequests === 0 && report.cleanup.observerJobs === 0;
  513 |     if (!primary && clean && report.network.errorCount === 0 && report.screenshot) report.status = "passed";
  514 |     else primary ??= new Error("Browser case or cleanup unproved");
  515 |     report.completedAt = new Date().toISOString();
  516 |     const bytes = Buffer.from(JSON.stringify(report, null, 2) + "\n"); assert.ok(bytes.length <= 256 * 1024, "Case report exceeds its bound");
  517 |     await writeFile(jsonPath, bytes, { flag: "wx", mode: 0o600 });
  518 |   }
  519 |   if (primary) throw primary;
  520 | }
  521 | for (const row of CASES) test(row[1], async ({ browser }, testInfo) => runCase(browser, testInfo, row));
  522 | 
```
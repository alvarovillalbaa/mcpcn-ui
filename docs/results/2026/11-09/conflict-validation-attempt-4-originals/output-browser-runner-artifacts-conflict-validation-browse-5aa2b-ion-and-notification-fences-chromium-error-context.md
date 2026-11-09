# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: conflict-validation-browser.spec.mjs >> R09 desktop docs independent confirmation and notification fences
- Location: tooling/conflict-validation-browser.spec.mjs:690:26

# Error details

```
TimeoutError: locator.click: Timeout 3000ms exceeded.
Call log:
  - waiting for getByRole('region', { name: 'Review supplied conflict choices', exact: true }).getByRole('button', { name: 'Confirm choice', exact: true })
    - locator resolved to <button disabled type="button" class="mcpcn mcpcn-button">Confirm choice</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
      - waiting 100ms
    6 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
      - waiting 500ms

```

# Test source

```ts
  541 |   record("current_confirmation_failure_survives_other_channel_until_explicit_retry", { failed, notificationSettled, proof: await demoProof(args, region) }); await capture(args, "fence", selected(region, "Preferred candidate"));
  542 | }
  543 | 
  544 | async function explicitStates(args, region, conflict) {
  545 |   const states = [];
  546 |   for (const state of (conflict ? ["loading", "empty", "error", "ready"] : ["loading", "empty", "error", "ready-empty", "ready"])) {
  547 |     await selectOption(args, args.page, "Reported state", state); await expect(fullJSON(region, conflict)).toHaveCount(0);
  548 |     if (state === "ready") await noSelection(region, conflict);
  549 |     else {
  550 |       await expect(region.getByRole("button", { name: conflict ? /^Select candidate:/ : /^Inspect issue:/ })).toHaveCount(0);
  551 |       await expect(region).toContainText(state === "loading" ? conflict ? "Conflict candidates are loading." : "Validation report is loading."
  552 |         : state === "error" ? "Authored conflict or validation failure." : state === "ready-empty" ? "No validation issues were supplied." : conflict ? "No conflict was supplied." : "No validation report was supplied.");
  553 |     }
  554 |     states.push({ state, proof: await demoProof(args, region, conflict) });
  555 |   }
  556 |   return states;
  557 | }
  558 | async function malformedDemo(args, region, conflict, expected) {
  559 |   await checked(args, "Malformed data", true);
  560 |   const demo = args.page.locator('section[aria-label="' + (conflict ? "Conflict resolver" : "Validation summary") + ' demonstration"]');
  561 |   await expect(demo.getByRole("alert")).toContainText(conflict ? "Conflict data is invalid" : "Validation report data is invalid");
  562 |   await expect(region).toHaveCount(0); const invalid = await demoProof(args, demo, conflict);
  563 |   await checked(args, "Malformed data", false); await noSelection(region, conflict); await expectCounts(args, expected, conflict);
  564 |   return { invalid, proof: await demoProof(args, region, conflict) };
  565 | }
  566 | async function statesJourney(args) {
  567 |   const { page, activate, record } = args; let region = regionFor(page, "states");
  568 |   record("explicit_conflict_states_never_infer_choice_or_emit", { states: await explicitStates(args, region, true) }); await expectCounts(args, numbers(0, 0, 0, 0));
  569 |   await activate(choose(region, "Preferred candidate")); await expectSelected(region, "Preferred candidate", suppliedCandidate);
  570 |   record("malformed_conflict_hides_selected_private_value_then_recovers", await malformedDemo(args, region, true, numbers(1, 1, 1, 0)));
  571 |   await navigate(args, "/components/validation-summary"); region = page.getByRole("region", { name: "Inspect supplied validation report", exact: true });
  572 |   await expect(region).toBeVisible(); await noSelection(region, false); await expectCounts(args, numbers(0, 0, 0, 0), false); assert.equal(page.frames().length, 1);
  573 |   record("actual_validation_route_starts_a_fresh_local_report", { proof: await demoProof(args, region, false) });
  574 |   record("validation_states_keep_ready_empty_distinct_from_empty", { states: await explicitStates(args, region, false) });
  575 |   const reports = [];
  576 |   for (const reportedStatus of ["unknown", "pending", "valid", "invalid"]) {
  577 |     await selectOption(args, page, "Reported validation status", reportedStatus); await expect(region).toContainText("Reported validation: " + reportedStatus); await noSelection(region, false);
  578 |     await expectCounts(args, numbers(0, 0, 0, 0), false); reports.push({ reportedStatus, proof: await demoProof(args, region, false) });
  579 |   }
  580 |   record("direct_report_status_changes_preserve_all_supplied_issues_without_emission", { reports });
  581 |   await selectOption(args, page, "Selection notification response", "hold"); await activate(choose(region, "Format review", false)); await expectSelected(region, "Format review", suppliedContext, false);
  582 |   await expectCounts(args, numbers(1, 1, 0, 1), false); const pending = await demoProof(args, region, false);
  583 |   await activate(demoButton(args, "Replace report")); await noSelection(region, false); const replaced = await demoProof(args, region, false);
  584 |   await settle(args, "notification", true, numbers(1, 1, 1, 0), false); await noFailure(region); await noSelection(region, false);
  585 |   record("validation_report_replacement_fences_old_held_notification", { pending, replaced, proof: await demoProof(args, region, false) });
  586 |   await activate(choose(region, "Format review", false)); await activate(choose(region, "Count review", false)); await expectSelected(region, "Count review", 0, false); await expectCounts(args, numbers(3, 3, 1, 2), false);
  587 |   const switched = await demoProof(args, region, false); await settle(args, "notification", true, numbers(3, 3, 2, 1), false); await noFailure(region); await expectSelected(region, "Count review", 0, false);
  588 |   await checked(args, "Callback enabled", false); const callbackRemoved = await demoProof(args, region, false); await settle(args, "notification", true, numbers(3, 3, 3, 0), false); await noFailure(region);
  589 |   record("validation_selection_and_callback_changes_fence_old_rejections", { switched, callbackRemoved, proof: await demoProof(args, region, false) });
  590 |   await checked(args, "Callback enabled", true); await activate(choose(region, "No supplied context", false)); await expectSelected(region, "No supplied context", null, false, false); await expectCounts(args, numbers(4, 4, 3, 1), false);
  591 |   await settle(args, "notification", true, numbers(4, 4, 4, 0), false); await expect(region.getByText(actionError, { exact: true })).toBeVisible(); const failure = await demoProof(args, region, false);
  592 |   await activate(choose(region, "No supplied context", false)); await expectCounts(args, numbers(5, 5, 4, 1), false); await settle(args, "notification", false, numbers(5, 5, 5, 0), false); await noFailure(region);
  593 |   await jsonIs(currentIntent(args, validationLast), { type: "inspect-validation-issue", data: { ...validationScope, reportId: "report-1-replacement-2", reportRevision: "2", issueId: "missing", issueRevision: "1" } });
  594 |   record("current_validation_failure_keeps_missing_context_distinct_and_needs_retry", { failure, proof: await demoProof(args, region, false) });
  595 |   record("malformed_validation_hides_current_issue_then_recovers", await malformedDemo(args, region, false, numbers(5, 5, 5, 0)));
  596 |   await capture(args, "states", choose(region, "Format review", false));
  597 | }
  598 | 
  599 | const CASES = [
  600 |   ["R01", "R01 desktop docs supplied conflict choice and explicit confirmation", "desktop", "conflict", "docs", conflictJourney],
  601 |   ["R02", "R02 narrow docs supplied conflict choice and explicit confirmation", "narrow", "conflict", "docs", conflictJourney],
  602 |   ["R03", "R03 desktop CLI dev supplied validation status and current issues", "desktop", "validation", "cliDev", validationJourney],
  603 |   ["R04", "R04 narrow CLI dev supplied validation status and current issues", "narrow", "validation", "cliDev", validationJourney],
  604 |   ["R05", "R05 desktop CLI preview complete issue context and keyboard reading", "desktop", "values", "cliPreview", valuesJourney],
  605 |   ["R06", "R06 narrow CLI preview complete issue context and keyboard reading", "narrow", "values", "cliPreview", valuesJourney],
  606 |   ["R07", "R07 desktop docs controlled conflict selection acknowledgement", "desktop", "controlled", "docs", controlledJourney],
  607 |   ["R08", "R08 narrow docs controlled conflict selection acknowledgement", "narrow", "controlled", "docs", controlledJourney],
  608 |   ["R09", "R09 desktop docs independent confirmation and notification fences", "desktop", "fences", "docs", fencesJourney],
  609 |   ["R10", "R10 narrow docs independent confirmation and notification fences", "narrow", "fences", "docs", fencesJourney],
  610 |   ["R11", "R11 desktop docs explicit states and validation callback scope", "desktop", "states", "docs", statesJourney],
  611 |   ["R12", "R12 narrow docs explicit states and validation callback scope", "narrow", "states", "docs", statesJourney],
  612 | ];
  613 | 
  614 | async function runCase(browser, testInfo, [caseId, title, profile, scenario, originKey, journey]) {
  615 |   assert.equal(testInfo.retry, 0); assert.equal(browser.browserType().name(), "chromium"); testInfo.setTimeout(40000);
  616 |   const started = performance.now(), deadline = started + 36000, closeDeadline = started + 39000, origin = origins[originKey];
  617 |   const direct = ["controlled", "fences", "states"].includes(scenario);
  618 |   const route = direct ? "/components/conflict-resolver" : originKey === "docs" ? "/playground" : "/?component=" + slugs[scenario];
  619 |   const jsonPath = path.join(output, caseId + ".json"), pngPath = path.join(output, caseId + ".png"); await absent(jsonPath); await absent(pngPath);
  620 |   const viewport = profile === "desktop" ? { width: 1280, height: 900 } : { width: 390, height: 844 };
  621 |   const report = { schemaVersion: 1, sourceCommit, caseId, title, profile, scenario, originKey, route, origin, playwright: packageManifest.version, browserVersion: browser.version(), startedAt: new Date().toISOString(), viewport, touchEmulated: profile === "narrow", status: "failed", observations: [],
  622 |     stageScreenshots: [], secondaryNavigations: [], viewportAlignments: [], input: { trackedTaps: 0, trackedClicks: 0, keyboardActions: 0, pointerActions: 0, nativeSelections: 0, editorFills: 0, readingSetups: 0, programmaticProducerInvocations: 0, programmaticFocusRestorations: 0 }, wire: [], sdkSends: {}, displayMessages: [],
  623 |     console: { debugCount: 0, warningCount: 0, warnings: [], sdkSendPreviewCount: 0, responsePreviewCount: 0, unclassifiedSendCount: 0, unclassifiedSends: [] }, downloadEvents: 0, blobDownload: { rows: [], nativeDownloadJoined: null },
  624 |     network: { requests: 0, requestFailures: 0, consoleErrors: 0, pageErrors: 0, webSockets: 0, errorCount: 0, errors: [], rows: [] },
  625 |     cleanup: { contextCreated: false, contextClosed: false, pagesCreated: 0, pagesClosed: 0, pendingRequests: null, observerJobs: null, downloadArmRemaining: false },
  626 |     limits: { workMs: 36000, closeMs: 39000, nativeMs: 40000, reportBytes: 262144, screenshotBytes: 262144 },
  627 |     proofLimits: ["Only supplied conflict candidates, reported validation status, issues, context and evidence are inspected. No inferred resolution or validation, source fetching/verification, tool/context/message call, persistence or clipboard.",
  628 |       "Narrow Chromium is touch emulation; physical devices, complete assistive technology and external MCP hosts remain unverified.",
  629 |       "Complete native DOM, JSON value, identity-only intent, producer input and callback-counter originals are retained. Native HTTP settlement is distinct from raw socket/process cleanup.",
  630 |       "Two producer refresh scenarios prepare the real editor and active app focus BEFORE delivery through the existing Invoke button's HTMLElement.click. Those counts are separate from real component clicks/taps; focus is never repaired after delivery. Every tracked activation, native select, reading setup and stage capture aligns and hit-tests the target through all actual ancestor viewports."] };
  631 |   let context, page, observer, primary;
  632 |   const record = (stage, value) => { assert.ok(report.observations.length < 20); report.observations.push({ stage, atMs: performance.now() - started, ...value }); };
  633 |   try {
  634 |     context = await browser.newContext({ viewport, isMobile: profile === "narrow", hasTouch: profile === "narrow", locale: "en-US", timezoneId: "UTC", acceptDownloads: false, permissions: [] }); report.cleanup.contextCreated = true;
  635 |     context.setDefaultTimeout(3000); context.setDefaultNavigationTimeout(10000); observer = observe(context, report, started, deadline, origin); page = await context.newPage();
  636 |     const response = await within(() => page.goto(origin + route, { waitUntil: "load", timeout: 10000 }), deadline, "navigation_deadline"); assert.ok(response); assert.equal(response.status(), 200);
  637 |     const request = response.request(), navigation = observer.rows.get(request); assert.ok(navigation && request.isNavigationRequest() && request.frame() === page.mainFrame()); assert.equal(request.url(), origin + route);
  638 |     const args = { page, context, host: null, app: page, report, observer, record, deadline, profile };
  639 |     args.activate = async locator => {
  640 |       await alignReachable(args, locator, "activate");
> 641 |       if (profile === "narrow") { await locator.tap(); report.input.trackedTaps++; } else { await locator.click(); report.input.trackedClicks++; }
      |                                                                                                           ^ TimeoutError: locator.click: Timeout 3000ms exceeded.
  642 |     };
  643 |     if (direct) {
  644 |       await expect(regionFor(page, scenario)).toBeVisible(); assert.equal(page.frames().length, 1);
  645 |       report.frames = { outerPage: locationMeta(page.url()), hostUrl: null, appUrl: null, sessionFragmentSha256: null, hostRole: null, appRole: null, hostFrameCount: 0, appFrameCount: 0, actualFrameCount: 1 };
  646 |     } else {
  647 |       args.host = originKey === "docs" ? page.frameLocator('iframe[title="MCPCN host simulator"]') : page; args.app = await ready(args.host);
  648 |       await selectOption(args, args.host, "Theme", profile === "narrow" ? "dark" : "light");
  649 |       await selectOption(args, args.host, "Viewport", profile === "narrow" ? "390" : "760");
  650 |       await selectOption(args, args.host, "Component or block", slugs[scenario]); args.app = await ready(args.host);
  651 |       await jsonIs(args.app.getByLabel("Received tool input", { exact: true }), { component: slugs[scenario] });
  652 |       await expect(args.app.locator("main.frame-app")).toHaveAttribute("data-theme", profile === "narrow" ? "dark" : "light");
  653 |       const appElement = args.host.locator('iframe[title="Rendered MCP app"]'), appSrc = await appElement.getAttribute("src"); assert.ok(appSrc);
  654 |       const appURL = new URL(appSrc, origin); assert.equal(appURL.origin, origin); assert.equal(appURL.pathname, originKey === "docs" ? "/playground-simulator/frame.html" : "/frame.html"); assert.ok(appURL.hash);
  655 |       const hostElement = originKey === "docs" ? page.locator('iframe[title="MCPCN host simulator"]') : null;
  656 |       const hostURL = hostElement ? new URL(await hostElement.getAttribute("src"), page.url()) : new URL(page.url());
  657 |       assert.equal(hostURL.origin, origin); assert.equal(hostURL.pathname, originKey === "docs" ? "/playground-simulator/index.html" : "/");
  658 |       report.frames = { outerPage: locationMeta(page.url()), hostUrl: locationMeta(hostURL.href), appUrl: locationMeta(appURL.href), sessionFragmentSha256: sha(appURL.hash), hostRole: hostElement ? await hostElement.getAttribute("title") : "direct CLI simulator", appRole: await appElement.getAttribute("title"), hostFrameCount: hostElement ? await hostElement.count() : 0, appFrameCount: await appElement.count(), actualFrameCount: page.frames().length };
  659 |       assert.equal(report.frames.appFrameCount, 1); assert.equal(report.frames.actualFrameCount, originKey === "docs" ? 3 : 2);
  660 |     }
  661 |     await observer.settle(); assert.equal(navigation.terminal, "finished"); assert.equal(navigation.responseFinished, "null");
  662 |     report.navigation = { requestOrdinal: navigation.ordinal, status: response.status(), exactRequestIdentity: true, requestFinished: navigation.terminal, responseFinished: navigation.responseFinished };
  663 |     report.observedViewport = await page.evaluate(() => ({ innerWidth, innerHeight, documentWidth: document.documentElement.scrollWidth, maxTouchPoints: navigator.maxTouchPoints }));
  664 |     assert.equal(report.observedViewport.innerWidth, viewport.width); assert.equal(report.observedViewport.innerHeight, viewport.height); assert.ok(report.observedViewport.documentWidth <= viewport.width + 1); assert.ok(profile === "narrow" ? report.observedViewport.maxTouchPoints > 0 : report.observedViewport.maxTouchPoints === 0);
  665 |     record(direct ? "actual_docs_component_ready" : "actual_nested_bridge_ready", { frames: report.frames, viewport: report.observedViewport, theme: direct ? null : profile === "narrow" ? "dark" : "light", proof: await snapshot(regionFor(args.app, scenario), args.app, args.host, direct ? conflictLast : null) });
  666 |     await within(() => journey(args), deadline, "journey_deadline");
  667 |     assert.ok(profile === "narrow" ? report.input.trackedTaps > 0 : report.input.trackedClicks > 0); await observer.settle(); report.cookieCount = (await context.cookies()).length; assert.equal(report.cookieCount, 0);
  668 |     assert.deepEqual(report.wire, []); for (const method of forbiddenMethods) assert.equal(report.sdkSends[method] ?? 0, 0);
  669 |     if (direct) assert.equal(Object.keys(report.sdkSends).length, 0); else for (const method of ["ui/initialize", "ui/notifications/initialized", "ui/notifications/tool-input", "ui/notifications/tool-result"]) assert.ok((report.sdkSends[method] ?? 0) > 0);
  670 |     assert.equal(report.downloadEvents, 0); assert.equal(report.network.requestFailures, 0); assert.equal(report.console.unclassifiedSendCount, 0);
  671 |     assert.equal(report.stageScreenshots.length, 1);
  672 |     assert.equal(report.viewportAlignments.length, report.input.trackedTaps + report.input.trackedClicks + report.input.nativeSelections + report.input.readingSetups + report.stageScreenshots.length);
  673 |     report.finalLocation = locationMeta(page.url());
  674 |   } catch (error) { primary = error; report.failure = { name: String(error?.name ?? "Error").slice(0, 80), messageSha256: sha(String(error?.message ?? error)) }; }
  675 |   finally {
  676 |     if (page && !page.isClosed()) {
  677 |       try { const png = await within(() => page.screenshot({ path: pngPath, type: "png", fullPage: false, animations: "disabled", timeout: 3000 }), deadline, "screenshot_deadline"); report.screenshot = { filename: caseId + ".png", bytes: png.length, sha256: sha(png), viewportOnly: true }; assert.ok(png.length > 0 && png.length <= 262144); }
  678 |       catch (error) { primary ??= error; observer?.error("screenshot_unproved"); }
  679 |     } else { primary ??= new Error("screenshot_page_unavailable"); observer?.error("screenshot_unproved"); }
  680 |     if (observer && !primary) { try { await observer.settle(); } catch (error) { primary ??= error; } }
  681 |     if (context) { observer?.closeStarted(); try { await within(context.close(), closeDeadline, "context_close_deadline"); report.cleanup.contextClosed = true; } catch (error) { primary ??= error; observer?.error("context_close_unproved"); } }
  682 |     if (observer) { if (observer.jobs.size) { try { await within(Promise.all([...observer.jobs]), closeDeadline, "observer_close_deadline"); } catch (error) { primary ??= error; observer.error("observer_cleanup_incomplete"); } } observer.snapshot(); }
  683 |     const current = await lstat(output); if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== directory.dev || current.ino !== directory.ino || current.uid !== directory.uid) primary ??= new Error("browser_output_identity_changed");
  684 |     const clean = report.cleanup.contextCreated && report.cleanup.contextClosed && report.cleanup.pagesCreated === 1 && report.cleanup.pagesClosed === 1 && report.cleanup.pendingRequests === 0 && report.cleanup.observerJobs === 0 && !report.cleanup.downloadArmRemaining;
  685 |     if (!primary && clean && report.network.errorCount === 0 && report.screenshot) report.status = "passed"; else primary ??= new Error("browser_case_or_cleanup_unproved");
  686 |     report.completedAt = new Date().toISOString(); const bytes = Buffer.from(JSON.stringify(report, null, 2) + "\n"); assert.ok(bytes.length <= 262144); await writeFile(jsonPath, bytes, { flag: "wx", mode: 0o600 });
  687 |   }
  688 |   if (primary) throw primary;
  689 | }
  690 | for (const row of CASES) test(row[1], async ({ browser }, testInfo) => runCase(browser, testInfo, row));
  691 | 
```
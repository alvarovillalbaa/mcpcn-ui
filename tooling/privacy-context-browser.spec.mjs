// T2 actual loopback Chromium journeys, with no provider, account or host operation.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

assert.equal(process.env.CI, 'true'); assert.equal(process.platform, 'linux');
const origin = process.env.MCPCN_PC_ORIGIN; assert.equal(origin, 'http://127.0.0.1:4387');
const output = process.env.MCPCN_PC_OUTPUT, tools = process.env.MCPCN_PC_BROWSER_TOOLS;
assert.ok(path.isAbsolute(output) && path.isAbsolute(tools));
const { chromium } = createRequire(path.join(tools, 'package.json'))('playwright');
const cohort = [
  ['data-access-notice', 'DataAccessNotice', 'Review reported data access', 'access-1', 'access-report', 'request-data-access-review', 'Request access review', 20],
  ['privacy-boundary-card', 'PrivacyBoundaryCard', 'Review reported privacy boundaries', 'boundary-1', 'boundary-report', 'request-privacy-review', 'Request privacy review', 20],
  ['consent-panel', 'ConsentPanel', 'Review a current consent request', 'consent-1', 'consent-report', 'request-consent-approval', 'Request consent approval', 21],
  ['model-context-preview', 'ModelContextPreview', 'Review planned model context', 'context-1', 'context-report', 'request-context-handoff', 'Request context handoff', 21],
];
const report = { schemaVersion: 'mcpcn.privacy-context-browser.v1', sourceCommit: process.env.SOURCE_COMMIT, passed: false, cases: [], headingRegressions: [], browserClosed: false,
  proofLimits: ['1280px/390px Chromium viewport emulation, not a physical device, touch or accessibility certification.', 'Authored supplied reports only. No authorization grant/revocation, actual context handoff, provider/model call or hosted interaction.'] };
const browser = await chromium.launch({ headless: true });
async function heading(page, name) {
  const result = await page.locator('h1.component-heading').evaluate(element => {
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    return { text: element.textContent, viewport: innerWidth, rect: { left: box.left, right: box.right, width: box.width, height: box.height }, lineHeight: parseFloat(style.lineHeight),
      parts: [...element.children].map(part => { const range = document.createRange(); range.selectNodeContents(part); return { text: part.textContent, rects: [...range.getClientRects()].filter(rect => rect.width > 0).map(rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height })) }; }) };
  });
  assert.equal(result.text, name); assert.ok(result.rect.left >= 0 && result.rect.right <= result.viewport + 1);
  for (const part of result.parts) { assert.equal(part.rects.length, 1, `Heading word must stay whole: ${part.text}`); assert.ok(part.rects[0].left >= 0 && part.rects[0].right <= result.viewport + 1); }
  return result;
}
try {
  for (const [slug, name, title, componentId, reportId, type, actionLabel, expectedStages] of cohort) for (const width of [1280, 390]) {
    const id = `${slug}-${width}`, row = { id, slug, viewport: { width, height: 900 }, status: 'failed', stages: [], screenshots: [], externalRequestsBlocked: [], errors: [] }; report.cases.push(row);
    const context = await browser.newContext({ viewport: row.viewport }), page = await context.newPage(); page.setDefaultTimeout(10000);
    await page.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue(); row.externalRequestsBlocked.push(url.origin); return route.abort(); });
    page.on('pageerror', error => row.errors.push(error.message));
    try {
      const response = await page.goto(`${origin}/components/${slug}`, { waitUntil: 'networkidle' }); assert.equal(response.status(), 200); row.heading = await heading(page, name);
      row.integrationContract = await page.getByRole('region', { name: 'Privacy and context integration contract', exact: true }).textContent();
      assert.ok(row.integrationContract.includes('never place private review values in model-visible structuredContent or content') && row.integrationContract.includes('does not send data'));
      const serverExample = page.locator('pre.code').filter({ hasText: 'preparePrivateReview' }); assert.equal(await serverExample.count(), 1);
      assert.ok((await serverExample.textContent()).includes('modelSafeMetadata') && (await serverExample.textContent()).includes('privateAppPayload') && !(await serverExample.textContent()).includes('createStructuredResult'));
      const demo = page.getByRole('region', { name: `${name} demonstration`, exact: true }), card = demo.getByRole('region', { name: title, exact: true });
      const consent = slug === 'consent-panel', contextPreview = slug === 'model-context-preview', needsAck = consent || contextPreview;
      const request = () => card.getByRole('button', { name: actionLabel, exact: true });
      const ack = () => card.getByRole('checkbox', { name: 'Acknowledge current review', exact: true });
      const required = () => card.getByRole('checkbox', { name: 'Select scope: Read authored summary', exact: true });
      const optional = () => card.getByRole('checkbox', { name: 'Select scope: Read authored notes', exact: true });
      const eventually = async check => { for (let attempt = 0; ; attempt++) { if (await check()) return; assert.ok(attempt < 100, 'Observed state did not settle'); await page.waitForTimeout(20); } };
      const count = async label => Number(await demo.locator(`output[aria-label="${label}"]`).textContent());
      const prepare = async () => { if (consent) await required().check(); if (needsAck) await ack().check(); assert.equal(await request().isEnabled(), true); };
      const resetObserved = async () => { if (needsAck) { assert.equal(await ack().isChecked(), false); assert.equal(await request().isDisabled(), true); } if (consent) { assert.equal(await required().isChecked(), false); assert.equal(await optional().isChecked(), false); } };
      const reportUnchanged = async () => { const text = await card.textContent(); if (consent) assert.ok(text.includes('Reported consent decision: granted')); if (slug === 'data-access-notice') assert.ok(text.includes('Reported access status: allowed')); };
      const capture = async label => { const html = await demo.evaluate(element => element.outerHTML); assert.ok(Buffer.byteLength(html) < 262144); const file = `${id}-${label}.html`; fs.writeFileSync(path.join(output, file), html, { flag: 'wx' }); row.stages.push({ label, file, bytes: Buffer.byteLength(html), sha256: createHash('sha256').update(html).digest('hex') }); };
      const screenshot = async label => { const file = `${id}-${label}.png`; await page.screenshot({ path: path.join(output, file), fullPage: false }); row.screenshots.push(file); };
      await request().waitFor(); assert.equal(await count('Privacy intent count'), 0); assert.equal(await request().isDisabled(), needsAck); await reportUnchanged(); await capture('initial'); await screenshot('initial');
      if (slug === 'privacy-boundary-card' || contextPreview) {
        const json = card.getByRole('region', { name: 'Complete JSON: Authored planned summary', exact: true }); await json.scrollIntoViewIfNeeded(); await json.focus();
        const before = await json.evaluate(element => ({ scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, focused: document.activeElement === element }));
        assert.ok(before.focused && before.scrollHeight > before.clientHeight + 1); assert.equal(before.scrollTop, 0);
        const readPosition = () => json.evaluate(element => {
          const text = element.querySelector('pre').firstChild, position = text.textContent.indexOf('COMPLETE_CONTEXT_END'); if (position < 0) throw new Error('Complete JSON end marker missing');
          const range = document.createRange(); range.setStart(text, position); range.setEnd(text, position + 'COMPLETE_CONTEXT_END'.length);
          const marker = range.getBoundingClientRect(), box = element.getBoundingClientRect();
          return { scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, focused: document.activeElement === element,
            markerVisible: marker.top >= box.top && marker.bottom <= box.bottom, markerRect: { top: marker.top, bottom: marker.bottom }, containerRect: { top: box.top, bottom: box.bottom }, text: element.querySelector('pre').textContent };
        });
        let reading; const samples = []; await json.press('End');
        await eventually(async () => { reading = await readPosition(); const { text, ...position } = reading; samples.push(position); row.keyboardReading = { input: 'native End key', before, after: position, samples, textBytes: Buffer.byteLength(text), textSha256: createHash('sha256').update(text).digest('hex') }; return reading.focused && reading.markerVisible && reading.scrollTop > before.scrollTop; });
        assert.ok(reading.text.includes('"amount": 0') && reading.text.includes('"enabled": false') && reading.text.includes('"absent": null')); await capture('complete-json-keyboard');
      }
      if (consent) { await required().focus(); await required().press('Space'); } if (needsAck) { await ack().focus(); await ack().press('Space'); }
      assert.equal(await count('Privacy intent count'), 0); await request().focus(); await request().press('Enter'); await eventually(async () => await count('Privacy intent count') === 1);
      const scope = { componentId, componentRevision: '1', reportId, reportRevision: '1', actionId: consent ? 'approve' : 'review', actionRevision: '1' };
      const intent = JSON.parse(await demo.getByLabel('Last privacy intent', { exact: true }).textContent());
      assert.deepEqual(intent, { type, data: { ...scope, ...(consent ? { scopes: [{ scopeId: 'scope-required', scopeRevision: '1' }] } : contextPreview ? { sections: [{ sectionId: 'section-1', sectionRevision: '1' }] } : {}) } });
      assert.ok(!JSON.stringify(intent).match(/COMPLETE_|PRIVATE_|purpose|recipient|label|value/)); await resetObserved(); await reportUnchanged(); await capture('keyboard-intent');
      if (consent) {
        assert.equal(await card.getByRole('checkbox', { name: 'Select scope: Export authored records', exact: true }).isDisabled(), true);
        await optional().check(); await ack().check(); assert.equal(await request().isDisabled(), true); await required().check(); assert.equal(await ack().isChecked(), false); await ack().check();
        const previous = await count('Privacy intent count'); await request().click(); await eventually(async () => await count('Privacy intent count') === previous + 1);
        assert.deepEqual(JSON.parse(await demo.getByLabel('Last privacy intent', { exact: true }).textContent()).data.scopes, [{ scopeId: 'scope-required', scopeRevision: '1' }, { scopeId: 'scope-optional', scopeRevision: '2' }]); await capture('supplied-scope-order');
        await demo.getByLabel('Required scope available', { exact: true }).uncheck(); await optional().check(); await ack().check(); assert.equal(await request().isDisabled(), true);
        const beforeDecline = await count('Privacy intent count'); await card.getByRole('button', { name: 'Decline consent request', exact: true }).click(); await eventually(async () => await count('Privacy intent count') === beforeDecline + 1);
        assert.deepEqual(JSON.parse(await demo.getByLabel('Last privacy intent', { exact: true }).textContent()), { type: 'decline-consent-request', data: { ...scope, actionId: 'decline' } }); await reportUnchanged(); await capture('required-unavailable-decline'); await demo.getByLabel('Required scope available', { exact: true }).check();
      }
      await demo.getByLabel('Privacy request response', { exact: true }).selectOption('hold'); await prepare(); await request().click(); await eventually(async () => await count('Pending privacy requests') === 1);
      assert.equal(await request().isDisabled(), true); if (needsAck) assert.equal(await ack().isChecked(), false); await capture('pending');
      await demo.getByRole('button', { name: 'Reject oldest request', exact: true }).click(); await eventually(async () => await card.getByRole('alert').count() === 1); assert.ok((await card.getByRole('alert').textContent()).includes('Review and try again')); await resetObserved(); await capture('rejected');
      await demo.getByLabel('Privacy request response', { exact: true }).selectOption('throw'); await prepare(); await request().click(); await eventually(async () => await card.getByRole('alert').count() === 1); assert.ok(!(await card.textContent()).includes('Authored private exception')); await resetObserved(); await capture('sanitized-failure');
      await demo.getByLabel('Privacy request response', { exact: true }).selectOption('hold'); await prepare(); await request().click(); await eventually(async () => await count('Pending privacy requests') === 1);
      await demo.getByRole('button', { name: 'Replace callback', exact: true }).click(); await demo.getByRole('button', { name: 'Replace callback', exact: true }).click(); await resetObserved(); await prepare(); await request().click(); await eventually(async () => await count('Pending privacy requests') === 2);
      await demo.getByRole('button', { name: 'Reject oldest request', exact: true }).click(); await eventually(async () => await count('Pending privacy requests') === 1); assert.equal(await request().isDisabled(), true); assert.equal(await card.getByRole('alert').count(), 0); await capture('callback-aba-protected');
      await demo.getByRole('button', { name: 'Resolve oldest request', exact: true }).click(); await eventually(async () => await count('Pending privacy requests') === 0); assert.equal(await card.getByRole('alert').count(), 0); await resetObserved(); await reportUnchanged(); await capture('callback-current-settled');
      await prepare(); await request().click(); await eventually(async () => await count('Pending privacy requests') === 1);
      await demo.getByRole('button', { name: 'Replace report revision', exact: true }).click(); await demo.getByRole('button', { name: 'Replace report revision', exact: true }).click(); await resetObserved(); await prepare(); await request().click(); await eventually(async () => await count('Pending privacy requests') === 2);
      await demo.getByRole('button', { name: 'Reject oldest request', exact: true }).click(); await eventually(async () => await count('Pending privacy requests') === 1); assert.equal(await request().isDisabled(), true); assert.equal(await card.getByRole('alert').count(), 0);
      await demo.getByRole('button', { name: 'Resolve oldest request', exact: true }).click(); await eventually(async () => await count('Pending privacy requests') === 0); await resetObserved(); await reportUnchanged(); await capture('report-aba-fence');
      await prepare(); await request().click(); await eventually(async () => await count('Pending privacy requests') === 1); await demo.getByRole('button', { name: 'Replace supplied content', exact: true }).click(); await demo.getByRole('button', { name: 'Replace supplied content', exact: true }).click();
      await demo.getByRole('button', { name: 'Reject oldest request', exact: true }).click(); await eventually(async () => await count('Pending privacy requests') === 0); assert.equal(await card.getByRole('alert').count(), 0); await resetObserved(); await capture('content-fence');
      await prepare(); await request().click(); await eventually(async () => await count('Pending privacy requests') === 1); await demo.getByLabel('Malformed data', { exact: true }).check();
      await demo.getByRole('button', { name: 'Reject oldest request', exact: true }).click(); await demo.getByLabel('Malformed data', { exact: true }).uncheck(); await eventually(async () => await count('Pending privacy requests') === 0); assert.equal(await card.getByRole('alert').count(), 0); await resetObserved(); await capture('malformed-fence');
      await prepare(); await request().click(); await eventually(async () => await count('Pending privacy requests') === 1); await demo.getByLabel('Privacy report state', { exact: true }).selectOption('loading');
      await demo.getByRole('button', { name: 'Reject oldest request', exact: true }).click(); await demo.getByLabel('Privacy report state', { exact: true }).selectOption('ready'); await eventually(async () => await count('Pending privacy requests') === 0); assert.equal(await card.getByRole('alert').count(), 0); await resetObserved(); await capture('nonready-fence');
      await prepare(); await request().click(); await eventually(async () => await count('Pending privacy requests') === 1); await demo.getByLabel('Mount component', { exact: true }).uncheck();
      await demo.getByRole('button', { name: 'Reject oldest request', exact: true }).click(); await demo.getByLabel('Mount component', { exact: true }).check(); await eventually(async () => await count('Pending privacy requests') === 0); assert.equal(await card.getByRole('alert').count(), 0); await resetObserved(); await capture('unmount-fence');
      if (slug === 'data-access-notice' || contextPreview) { assert.ok((await card.textContent()).includes(contextPreview ? 'Reported token estimate: 0' : 'Reported record count: 0')); await demo.getByRole('button', { name: 'Remove reported count', exact: true }).click(); assert.ok((await card.textContent()).includes(contextPreview ? 'Reported token estimate: Not supplied' : 'Reported record count: Not supplied')); await capture('absent-count'); }
      await prepare(); await demo.getByLabel('Callback enabled', { exact: true }).uncheck(); assert.equal(await request().isDisabled(), true); await demo.getByLabel('Callback enabled', { exact: true }).check(); await resetObserved(); await prepare();
      await demo.getByLabel('External busy', { exact: true }).check(); assert.equal(await request().isDisabled(), true); await demo.getByLabel('External busy', { exact: true }).uncheck();
      await demo.getByLabel('Action available', { exact: true }).uncheck(); assert.equal(await request().isDisabled(), true); await capture('disabled');
      await demo.getByRole('button', { name: 'Remove supplied actions', exact: true }).click(); assert.equal(await card.getByRole('button').count(), 0); await capture('no-action');
      for (const state of ['loading', 'empty', 'error']) { await demo.getByLabel('Privacy report state', { exact: true }).selectOption(state); assert.ok((await card.textContent()).includes(`Authored ${state} privacy state.`)); assert.equal(await card.getByRole('button').count(), 0); assert.equal(await card.getByRole('checkbox').count(), 0); await capture(state); }
      await demo.getByLabel('Malformed data', { exact: true }).check(); await demo.getByText('Privacy report is invalid', { exact: true }).waitFor(); assert.equal(await demo.getByRole('button', { name: actionLabel, exact: true }).count(), 0); await capture('invalid');
      await demo.getByLabel('Malformed data', { exact: true }).uncheck(); await demo.getByLabel('Privacy report state', { exact: true }).selectOption('ready'); assert.equal(await request().isDisabled(), needsAck); assert.equal(await count('Pending privacy requests'), 0); await resetObserved(); await reportUnchanged(); await capture('restored');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Page must fit the viewport'); assert.deepEqual(row.errors, []); assert.deepEqual(row.externalRequestsBlocked, []);
      assert.equal(row.stages.length, expectedStages); await screenshot('restored'); row.status = 'passed';
    } catch (error) {
      row.error = error.message;
      try { const file = `${id}-failure.png`; await page.screenshot({ path: path.join(output, file), fullPage: false }); row.failureScreenshot = file; } catch { row.failureScreenshotUnavailable = true; }
      throw error;
    } finally { await context.close(); row.contextClosed = true; }
  }
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const row = { id: `recommendation-heading-${width}`, status: 'failed' }; report.headingRegressions.push(row);
    try { const page = await context.newPage(); await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      assert.equal((await page.goto(`${origin}/components/recommendation-card`, { waitUntil: 'networkidle' })).status(), 200); row.heading = await heading(page, 'RecommendationCard');
      row.screenshot = `${row.id}.png`; await page.screenshot({ path: path.join(output, row.screenshot), fullPage: false }); row.status = 'passed';
    } finally { await context.close(); row.contextClosed = true; }
  }
  assert.equal(report.cases.reduce((sum, row) => sum + row.stages.length, 0), 164);
  report.passed = report.cases.length === 8 && report.cases.every(row => row.status === 'passed' && row.contextClosed) && report.headingRegressions.length === 2 && report.headingRegressions.every(row => row.status === 'passed' && row.contextClosed);
} finally { await browser.close(); report.browserClosed = true; fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify(report, null, 2)); }

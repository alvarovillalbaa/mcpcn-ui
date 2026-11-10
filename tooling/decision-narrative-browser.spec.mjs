// T2 actual loopback Chromium journeys; no provider, account or external host.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

assert.equal(process.env.CI, 'true'); assert.equal(process.platform, 'linux');
const origin = process.env.MCPCN_DN_ORIGIN; assert.equal(origin, 'http://127.0.0.1:4387');
const output = process.env.MCPCN_DN_OUTPUT, tools = process.env.MCPCN_DN_BROWSER_TOOLS;
assert.ok(path.isAbsolute(output) && path.isAbsolute(tools));
const { chromium } = createRequire(path.join(tools, 'package.json'))('playwright');
const cohort = [
  ['recommendation-card', 'RecommendationCard', 'Authored recommendation report', 'recommendation-1', 'recommendation-report', 'request-recommendation'],
  ['tradeoff-panel', 'TradeoffPanel', 'Authored option tradeoffs', 'tradeoffs-1', 'tradeoff-report', 'request-tradeoff-review'],
  ['decision-memo', 'DecisionMemo', 'Authored decision memo', 'memo-1', 'memo-report', 'request-decision-review'],
  ['reasoning-summary', 'ReasoningSummary', 'Authored user-facing rationale', 'summary-1', 'summary-report', 'request-summary-review'],
];
const report = { schemaVersion: 'mcpcn.decision-narrative-browser.v1', sourceCommit: process.env.SOURCE_COMMIT, passed: false, cases: [], browserClosed: false,
  proofLimits: ['Desktop and plain 390px Chromium viewport emulation, not a physical device, touch or accessibility certification.', 'Authored supplied reports only; no computed recommendation, executed decision, internal model trace or hosted interaction.'] };
const browser = await chromium.launch({ headless: true });
try {
  for (const [slug, name, title, componentId, reportId, type] of cohort) for (const width of [1280, 390]) {
    const id = `${slug}-${width}`, row = { id, slug, viewport: { width, height: 900 }, status: 'failed', stages: [], screenshots: [], externalRequestsBlocked: [], errors: [] }; report.cases.push(row);
    const context = await browser.newContext({ viewport: row.viewport }), page = await context.newPage(); page.setDefaultTimeout(10000);
    await page.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue(); row.externalRequestsBlocked.push(url.origin); return route.abort(); });
    page.on('pageerror', error => row.errors.push(error.message));
    try {
      const response = await page.goto(`${origin}/components/${slug}`, { waitUntil: 'networkidle' }); assert.equal(response.status(), 200);
      const demo = page.getByRole('region', { name: `${name} demonstration`, exact: true }), card = demo.getByRole('region', { name: title, exact: true });
      const request = () => card.getByRole('button', { name: 'Request report review', exact: true });
      const eventually = async check => { for (let attempt = 0; ; attempt++) { if (await check()) return; assert.ok(attempt < 100, 'Observed state did not settle'); await page.waitForTimeout(20); } };
      const count = async label => Number(await demo.locator(`output[aria-label="${label}"]`).textContent());
      const capture = async label => { const html = await demo.evaluate(element => element.outerHTML); assert.ok(Buffer.byteLength(html) < 262144); const file = `${id}-${label}.html`; fs.writeFileSync(path.join(output, file), html, { flag: 'wx' }); row.stages.push({ label, file, bytes: Buffer.byteLength(html), sha256: createHash('sha256').update(html).digest('hex') }); };
      const screenshot = async label => { const file = `${id}-${label}.png`; await page.screenshot({ path: path.join(output, file), fullPage: false }); row.screenshots.push(file); };
      await request().waitFor(); assert.equal(await count('Decision intent count'), 0); assert.equal(await request().isEnabled(), true); await capture('initial'); await screenshot('initial');
      const json = card.getByRole('region', { name: 'Complete JSON: Authored option A', exact: true }); await json.scrollIntoViewIfNeeded(); await json.focus();
      const before = await json.evaluate(element => ({ scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, focused: document.activeElement === element }));
      assert.ok(before.focused && before.scrollHeight > before.clientHeight + 1); assert.equal(before.scrollTop, 0);
      await json.press('End'); await eventually(() => json.evaluate(element => element.scrollTop > 0));
      const reading = await json.evaluate(element => {
        const text = element.querySelector('pre').firstChild, position = text.textContent.indexOf('COMPLETE_VALUE_END'); if (position < 0) throw new Error('Complete JSON end marker missing');
        const range = document.createRange(); range.setStart(text, position); range.setEnd(text, position + 'COMPLETE_VALUE_END'.length);
        const marker = range.getBoundingClientRect(), box = element.getBoundingClientRect();
        return { scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, focused: document.activeElement === element,
          markerVisible: marker.top >= box.top && marker.bottom <= box.bottom, text: element.querySelector('pre').textContent };
      });
      assert.ok(reading.focused && reading.markerVisible && reading.scrollTop > before.scrollTop); assert.ok(reading.text.includes('"amount": 0') && reading.text.includes('"enabled": false') && reading.text.includes('"absent": null'));
      row.keyboardReading = { input: 'native End key', before, after: { ...reading, text: undefined }, textBytes: Buffer.byteLength(reading.text), textSha256: createHash('sha256').update(reading.text).digest('hex') }; await capture('complete-json-keyboard');
      await request().focus(); await request().press('Enter'); await eventually(async () => await count('Decision intent count') === 1);
      const intent = JSON.parse(await demo.getByLabel('Last decision intent', { exact: true }).textContent());
      const scope = { componentId, componentRevision: '1', reportId, reportRevision: '1', actionId: 'review', actionRevision: '1' };
      assert.deepEqual(intent, { type, data: slug === 'recommendation-card' ? { ...scope, optionId: 'option-a', optionRevision: '1' } : scope }); await capture('keyboard-intent');
      await demo.getByLabel('Decision request response', { exact: true }).selectOption('hold'); await request().click(); await eventually(async () => await count('Pending decision requests') === 1);
      assert.equal(await request().isDisabled(), true); await capture('pending');
      await demo.getByRole('button', { name: 'Reject oldest request', exact: true }).click(); await eventually(async () => await card.getByRole('alert').count() === 1); assert.ok((await card.getByRole('alert').textContent()).includes('Try again')); assert.equal(await request().isEnabled(), true); await capture('rejected');
      await demo.getByLabel('Decision request response', { exact: true }).selectOption('throw'); await request().click(); await eventually(async () => await card.getByRole('alert').count() === 1); assert.ok(!(await card.textContent()).includes('Authored private exception')); await capture('sanitized-failure');
      await demo.getByLabel('Decision request response', { exact: true }).selectOption('hold'); await request().click(); await eventually(async () => await count('Pending decision requests') === 1);
      await demo.getByRole('button', { name: 'Replace callback', exact: true }).click(); assert.equal(await request().isEnabled(), true);
      await demo.getByRole('button', { name: 'Reject oldest request', exact: true }).click(); await eventually(async () => await count('Pending decision requests') === 0); assert.equal(await card.getByRole('alert').count(), 0); await capture('callback-fence');
      await request().click(); await eventually(async () => await count('Pending decision requests') === 1);
      await demo.getByRole('button', { name: 'Replace report revision', exact: true }).click(); await demo.getByRole('button', { name: 'Replace report revision', exact: true }).click();
      await demo.getByRole('button', { name: 'Reject oldest request', exact: true }).click(); await eventually(async () => await count('Pending decision requests') === 0); assert.equal(await card.getByRole('alert').count(), 0); assert.equal(await request().isEnabled(), true); await capture('report-aba-fence');
      await request().click(); await eventually(async () => await count('Pending decision requests') === 1); await demo.getByLabel('Mount component', { exact: true }).uncheck();
      await demo.getByRole('button', { name: 'Reject oldest request', exact: true }).click(); await demo.getByLabel('Mount component', { exact: true }).check(); assert.equal(await card.getByRole('alert').count(), 0); await capture('unmount-fence');
      await demo.getByRole('button', { name: 'Remove supplied confidence', exact: true }).click(); assert.ok((await card.textContent()).includes('Reported confidence: Not supplied')); assert.ok(!(await card.textContent()).includes('Reported confidence: 0%')); await capture('absent-confidence');
      await demo.getByLabel('Callback enabled', { exact: true }).uncheck(); assert.equal(await request().isDisabled(), true); await demo.getByLabel('Callback enabled', { exact: true }).check();
      await demo.getByLabel('External busy', { exact: true }).check(); assert.equal(await request().isDisabled(), true); await demo.getByLabel('External busy', { exact: true }).uncheck();
      await demo.getByLabel('Action available', { exact: true }).uncheck(); assert.equal(await request().isDisabled(), true); await capture('unavailable');
      await demo.getByRole('button', { name: 'Remove supplied action', exact: true }).click(); assert.equal(await card.getByRole('button').count(), 0); await capture('no-action');
      for (const state of ['loading', 'empty', 'error']) { await demo.getByLabel('Decision report state', { exact: true }).selectOption(state); assert.ok((await card.textContent()).includes(`Authored ${state} report state.`)); assert.equal(await card.getByRole('button').count(), 0); assert.equal(await card.getByRole('region', { name: 'Complete JSON: Authored option A', exact: true }).count(), 0); await capture(state); }
      await demo.getByLabel('Malformed data', { exact: true }).check(); await demo.getByText('Decision report is invalid', { exact: true }).waitFor(); assert.equal(await demo.getByRole('button', { name: 'Request report review', exact: true }).count(), 0); await capture('invalid');
      await demo.getByLabel('Malformed data', { exact: true }).uncheck(); await demo.getByLabel('Decision report state', { exact: true }).selectOption('ready'); assert.equal(await request().isEnabled(), true); assert.equal(await count('Pending decision requests'), 0); await capture('restored');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Page must fit the viewport'); assert.deepEqual(row.errors, []); assert.deepEqual(row.externalRequestsBlocked, []);
      assert.equal(row.stages.length, 17); await screenshot('restored'); row.status = 'passed';
    } catch (error) { row.error = error.message; throw error; }
    finally { await context.close(); row.contextClosed = true; }
  }
  report.passed = report.cases.length === 8 && report.cases.every(row => row.status === 'passed' && row.contextClosed);
} finally { await browser.close(); report.browserClosed = true; fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify(report, null, 2)); }

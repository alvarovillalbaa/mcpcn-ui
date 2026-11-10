// T2 loopback Chromium journeys; no real account, provider or host is contacted.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

assert.equal(process.env.CI, 'true'); assert.equal(process.platform, 'linux');
const origin = process.env.MCPCN_HS_ORIGIN; assert.equal(origin, 'http://127.0.0.1:4387');
const output = process.env.MCPCN_HS_OUTPUT, tools = process.env.MCPCN_HS_BROWSER_TOOLS;
assert.ok(path.isAbsolute(output) && path.isAbsolute(tools));
const { chromium } = createRequire(path.join(tools, 'package.json'))('playwright');
const cohort = [['billing-gate', 'BillingGate', 'request-billing-review'], ['unsupported-host-notice', 'UnsupportedHostNotice', 'request-compatible-host'], ['no-data-state', 'NoDataState', 'request-data-refresh'], ['loading-bridge-state', 'LoadingBridgeState', 'request-bridge-recheck'], ['offline-state', 'OfflineState', 'request-reconnect'], ['permission-denied-state', 'PermissionDeniedState', 'request-access-review'], ['expired-session-state', 'ExpiredSessionState', 'request-session-renewal']];
const report = { schemaVersion: 'mcpcn.host-state-browser.v1', sourceCommit: process.env.SOURCE_COMMIT, passed: false, cases: [], browserClosed: false, proofLimits: ['Desktop and plain 390px Chromium viewport emulation, not a physical device or touch/accessibility certification.', 'Loopback authored-state UI only. No live status, permission, session, billing or host observation.'] };
const browser = await chromium.launch({ headless: true });
try {
  for (const [slug, name, type] of cohort) for (const width of [1280, 390]) {
    const id = `${slug}-${width}`, row = { id, slug, viewport: { width, height: 900 }, status: 'failed', stages: [], externalRequestsBlocked: [], errors: [] }; report.cases.push(row);
    const context = await browser.newContext({ viewport: row.viewport }), page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue(); row.externalRequestsBlocked.push(url.origin); return route.abort(); });
    page.on('pageerror', error => row.errors.push(error.message));
    try {
      const response = await page.goto(`${origin}/components/${slug}`, { waitUntil: 'networkidle' }); assert.equal(response.status(), 200);
      const demo = page.getByRole('region', { name: `${name} demonstration`, exact: true }), card = demo.getByRole('region');
      const request = () => card.getByRole('button', { name: 'Request consumer review', exact: true });
      const eventually = async check => { for (let attempt = 0; ; attempt++) { if (await check()) return; assert.ok(attempt < 100, 'Observed state did not settle'); await page.waitForTimeout(20); } };
      const count = async label => Number(await demo.locator(`output[aria-label="${label}"]`).textContent());
      const capture = async label => { const html = await demo.evaluate(element => element.outerHTML); assert.ok(Buffer.byteLength(html) < 262144); const file = `${id}-${label}.html`; fs.writeFileSync(path.join(output, file), html, { flag: 'wx' }); row.stages.push({ label, file, bytes: Buffer.byteLength(html), sha256: createHash('sha256').update(html).digest('hex') }); };
      await request().waitFor(); assert.equal(await count('Host-state intent count'), 0); assert.equal(await request().isEnabled(), true); await capture('initial');
      if (slug === 'loading-bridge-state') { assert.ok((await card.textContent()).includes('Reported elapsed time: 0 ms')); assert.equal(await card.getByRole('progressbar').getAttribute('value'), '0'); }
      if (slug === 'offline-state') assert.ok((await card.textContent()).includes('Reported unsent changes: 0'));
      await request().focus(); await request().press('Enter'); await eventually(async () => await count('Host-state intent count') === 1);
      const intent = JSON.parse(await demo.getByLabel('Last host-state intent', { exact: true }).textContent()); assert.equal(intent.type, type); assert.deepEqual(Object.keys(intent.data).sort(), ['actionId', 'actionRevision', 'componentId', 'componentRevision']); await capture('keyboard-intent');
      await demo.getByLabel('Host-state request response', { exact: true }).selectOption('hold'); await request().click();
      await eventually(async () => await count('Pending host-state requests') === 1); assert.equal(await request().isDisabled(), true); await capture('pending');
      await demo.getByRole('button', { name: 'Reject oldest request', exact: true }).click(); await eventually(async () => await card.getByRole('alert').count() === 1); assert.ok((await card.getByRole('alert').textContent()).includes('Try again')); assert.equal(await request().isEnabled(), true); await capture('rejected');
      await demo.getByLabel('Host-state request response', { exact: true }).selectOption('throw'); await request().click(); await eventually(async () => await card.getByRole('alert').count() === 1); assert.ok(!(await card.textContent()).includes('Authored private exception')); await capture('sanitized-failure');
      await demo.getByLabel('Host-state request response', { exact: true }).selectOption('hold'); await request().click(); await eventually(async () => await count('Pending host-state requests') === 1);
      await demo.getByRole('button', { name: 'Replace callback', exact: true }).click(); assert.equal(await request().isEnabled(), true);
      await demo.getByRole('button', { name: 'Reject oldest request', exact: true }).click(); await eventually(async () => await count('Pending host-state requests') === 0); assert.equal(await card.getByRole('alert').count(), 0); await capture('callback-fence');
      await request().click(); await eventually(async () => await count('Pending host-state requests') === 1);
      await demo.getByRole('button', { name: 'Replace report revision', exact: true }).click(); await demo.getByRole('button', { name: 'Replace report revision', exact: true }).click();
      await demo.getByRole('button', { name: 'Reject oldest request', exact: true }).click(); await eventually(async () => await count('Pending host-state requests') === 0); assert.equal(await card.getByRole('alert').count(), 0); assert.equal(await request().isEnabled(), true); await capture('report-aba-fence');
      await request().click(); await eventually(async () => await count('Pending host-state requests') === 1); await demo.getByLabel('Mount component', { exact: true }).uncheck();
      await demo.getByRole('button', { name: 'Reject oldest request', exact: true }).click(); await demo.getByLabel('Mount component', { exact: true }).check(); assert.equal(await card.getByRole('alert').count(), 0); await capture('unmount-fence');
      await demo.getByLabel('Callback enabled', { exact: true }).uncheck(); assert.equal(await request().isDisabled(), true); await demo.getByLabel('Callback enabled', { exact: true }).check();
      await demo.getByLabel('External busy', { exact: true }).check(); assert.equal(await request().isDisabled(), true); await demo.getByLabel('External busy', { exact: true }).uncheck();
      await demo.getByLabel('Action available', { exact: true }).uncheck(); assert.equal(await request().isDisabled(), true); await capture('unavailable');
      await demo.getByRole('button', { name: 'Remove supplied action', exact: true }).click(); assert.equal(await card.getByRole('button').count(), 0); await capture('no-action');
      await demo.getByLabel('Malformed data', { exact: true }).check(); await demo.getByText('Reported host state is invalid', { exact: true }).waitFor(); assert.equal(await demo.getByRole('button', { name: 'Request consumer review', exact: true }).count(), 0); await capture('invalid');
      await demo.getByLabel('Malformed data', { exact: true }).uncheck(); assert.equal(await card.getByRole('button').count(), 0); assert.equal(await count('Pending host-state requests'), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Page must fit the viewport'); assert.deepEqual(row.errors, []); assert.deepEqual(row.externalRequestsBlocked, []);
      await page.screenshot({ path: path.join(output, `${id}.png`), fullPage: false }); row.screenshot = `${id}.png`; row.status = 'passed';
    } catch (error) { row.error = error.message; throw error; }
    finally { await context.close(); row.contextClosed = true; }
  }
  report.passed = report.cases.length === 14 && report.cases.every(row => row.status === 'passed' && row.contextClosed);
} finally { await browser.close(); report.browserClosed = true; fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify(report, null, 2)); }

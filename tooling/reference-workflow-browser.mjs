// T2 actual browser actions against the owned loopback SDK/SQLite workbench.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const root = process.env.MCPCN_RF_RUN_ROOT, output = process.env.MCPCN_RF_OUTPUT, origin = process.env.MCPCN_RF_ORIGIN, width = Number(process.env.MCPCN_RF_WIDTH), phase = process.env.MCPCN_RF_PHASE;
assert.equal(process.env.CI, 'true'); assert.equal(process.platform, 'linux'); assert.ok(root && output === path.join(root, 'output') && [1280, 390].includes(width) && ['flow', 'reload'].includes(phase));
assert.equal(fs.readFileSync(path.join(root, '.owner'), 'utf8'), process.env.MCPCN_RF_NONCE); assert.match(origin, /^http:\/\/127\.0\.0\.1:[0-9]+$/);
const { chromium } = createRequire(path.join(process.env.MCPCN_RF_BROWSER_TOOLS, 'package.json'))('playwright');
const sha = raw => createHash('sha256').update(raw).digest('hex');
const report = { schemaVersion: 'mcpcn.reference-browser.v1', sourceCommit: process.env.SOURCE_COMMIT, phase, width, passed: false, cases: [], browserClosed: false };
const browser = await chromium.launch({ headless: true });
const workflows = [['hr-candidate-review', 'Candidate review'], ['document-extraction', 'Document extraction'], ['ecommerce-checkout-review', 'Checkout review'], ['admin-settings-change', 'Workspace settings'], ['research-workflow', 'Research sources']];
try {
  for (const [workflow, title] of workflows) {
    const id = `reference-${phase}-${workflow}-${width}`, row = { id, workflow, title, status: 'failed', viewport: { width, height: 1000 }, stages: [], errors: [], blocked: [], screenshots: [], contextClosed: false }; report.cases.push(row);
    const context = await browser.newContext({ viewport: row.viewport }), page = await context.newPage(); page.setDefaultTimeout(10000);
    await page.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === origin || ['about:', 'data:', 'blob:'].includes(url.protocol)) return route.continue(); row.blocked.push(url.origin); return route.abort(); });
    page.on('pageerror', error => row.errors.push(error.message));
    row.network = []; const network = (event, request) => { assert.ok(row.network.length < 500); row.network.push({ event, path: new URL(request.url()).pathname }); };
    page.on('request', request => network('request', request)); page.on('requestfinished', request => network('finished', request)); page.on('requestfailed', request => network('failed', request));
    const frame = page.frameLocator('iframe');
    const capture = async label => { const html = await frame.getByRole('main').evaluate(node => node.outerHTML), file = `${id}-${label}.html`; assert.ok(Buffer.byteLength(html) < 262144); fs.writeFileSync(path.join(output, file), html, { flag: 'wx', mode: 0o600 }); row.stages.push({ label, file, bytes: Buffer.byteLength(html), sha256: sha(html) }); };
    const revision = async (version, status, events) => { const locator = frame.getByRole('status', { name: 'Record revision and audit', exact: true }); await locator.filter({ hasText: `Revision ${version} · ${status} · ${events} saved audit events` }).waitFor(); };
    const nativeEnd = async (complete, marker) => {
      const text = await complete.textContent(); assert.ok(text.endsWith(marker)); await complete.focus();
      const measure = () => complete.evaluate(node => ({ focused: document.activeElement === node, top: node.scrollTop, height: node.scrollHeight, client: node.clientHeight }));
      const before = await measure(); row.nativeReading = { input: 'one native End key', before, readings: [], bytes: Buffer.byteLength(text), sha256: sha(text) }; await complete.press('End');
      for (let attempt = 0; attempt <= 100; attempt++) {
        const after = await measure(); row.nativeReading.after = after; row.nativeReading.readings.push(after);
        if (after.focused && after.top > before.top && after.top + after.client >= after.height - 2) break;
        if (attempt === 100) break; await page.waitForTimeout(20);
      }
      const after = row.nativeReading.after; assert.ok(before.focused && before.top === 0 && before.height > before.client && after.focused && after.top > 0 && after.top + after.client >= after.height - 2, 'Native End must reach the complete text tail');
    };
    const reviewed = async label => {
      const scope = frame.getByRole('region', { name: 'Prepared review' });
      // A section with aria-label has an implicit region role.
      await scope.waitFor(); const button = scope.getByRole('button', { name: 'Confirm reviewed change', exact: true }); assert.ok(await button.isDisabled());
      const checkbox = scope.getByRole('checkbox', { name: 'I reviewed these exact changes and want to apply them.', exact: true }); assert.equal(await checkbox.isChecked(), false); await capture(label + '-unchecked');
      await checkbox.focus(); await checkbox.press('Space'); assert.equal(await checkbox.isChecked(), true); assert.equal(await button.isEnabled(), true); await button.focus(); await button.press('Enter');
    };
    try {
      assert.equal((await page.goto(origin, { waitUntil: 'domcontentloaded' })).status(), 200);
      await page.getByLabel('Workbench access code', { exact: true }).waitFor();
      await page.getByLabel('Workbench access code', { exact: true }).fill('authored-reference-workbench-check-code'); await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
      await page.getByRole('button', { name: title, exact: true }).click(); await page.getByRole('status', { name: 'Workbench connection', exact: true }).filter({ hasText: 'Ready' }).waitFor();
      await frame.getByRole('status', { name: 'Record revision and audit', exact: true }).waitFor();
      if (phase === 'reload') {
        const expected = { 'hr-candidate-review': [2, 'recommended', 1], 'document-extraction': [3, 'saved', 2], 'ecommerce-checkout-review': [3, 'ordered', 2], 'admin-settings-change': [3, 'rolled-back', 2], 'research-workflow': [4, 'completed', 3] }[workflow];
        await revision(...expected); await capture('process-restart-persisted');
        if (workflow === 'document-extraction') assert.ok((await frame.getByRole('main').textContent()).includes('Reviewed Authored Labs'));
        if (workflow === 'research-workflow') assert.ok((await frame.getByRole('main').textContent()).includes('Reviewed source evidence requires explicit authorization and exact terms.'));
        if (workflow === 'ecommerce-checkout-review') assert.ok((await frame.getByRole('main').textContent()).includes('charged: false'));
      } else {
        await revision(1, { 'hr-candidate-review': 'screening', 'document-extraction': 'empty', 'ecommerce-checkout-review': 'quote', 'admin-settings-change': 'unchanged', 'research-workflow': 'pending' }[workflow], 0); await capture('initial');
        if (workflow === 'hr-candidate-review') {
          for (const label of ['Evidence', 'Reported scores', 'Missing data and risks']) await frame.getByRole('heading', { name: label, exact: true }).waitFor();
          await frame.getByLabel('Reviewer note', { exact: true }).fill('Authored evidence and gaps reviewed.'); await frame.getByRole('button', { name: 'Review candidate decision', exact: true }).click(); await reviewed('decision');
          await revision(2, 'recommended', 1); await capture('confirmed'); await frame.getByRole('button', { name: 'Reload record', exact: true }).click(); await revision(2, 'recommended', 1); await capture('reloaded');
        } else if (workflow === 'document-extraction') {
          const text = 'Supplier: Authored Labs\nTotal: 0\nCurrency: EUR\n' + Array.from({ length: 50 }, (_, i) => 'Authored note ' + i + ': complete supplied text.').join('\n') + '\nAUTHORED_DOCUMENT_END';
          await frame.getByLabel('UTF-8 document', { exact: true }).setInputFiles({ name: 'authored-invoice.txt', mimeType: 'text/plain', buffer: Buffer.from(text) }); await frame.getByRole('button', { name: 'Prepare text extraction', exact: true }).click();
          const complete = frame.getByLabel('Complete document text', { exact: true }); await complete.waitFor(); assert.equal(await complete.textContent(), text);
          await nativeEnd(complete, 'AUTHORED_DOCUMENT_END'); await capture('complete-text-native-end');
          await reviewed('extraction'); await revision(2, 'extracted', 1); await capture('extracted');
          await frame.getByLabel('Correct Supplier', { exact: true }).fill('Reviewed Authored Labs'); assert.equal(await frame.getByLabel('Correct Total', { exact: true }).inputValue(), '0');
          await frame.getByRole('button', { name: 'Review corrected fields', exact: true }).click(); await reviewed('save'); await revision(3, 'saved', 2); await capture('saved');
          await frame.getByRole('button', { name: 'Reload record', exact: true }).click(); await revision(3, 'saved', 2); await capture('reloaded');
        } else if (workflow === 'ecommerce-checkout-review') {
          assert.ok((await frame.getByRole('main').textContent()).includes('€46.00'));
          await frame.getByRole('button', { name: 'Review quote refresh', exact: true }).click(); await reviewed('refresh'); await revision(2, 'quote', 1); await capture('quote-refreshed');
          await frame.getByLabel('Delivery address', { exact: true }).fill('Authored street 12, Example City'); await frame.getByLabel('Accept the stated return terms', { exact: true }).check(); await frame.getByRole('button', { name: 'Review uncharged order', exact: true }).click();
          await reviewed('order'); await revision(3, 'ordered', 2); await capture('confirmed'); assert.ok((await frame.getByRole('main').textContent()).includes('charged: false'));
          await frame.getByRole('button', { name: 'Reload record', exact: true }).click(); await revision(3, 'ordered', 2); await capture('reloaded'); assert.equal(await frame.getByRole('button', { name: 'Review uncharged order', exact: true }).count(), 0);
        } else if (workflow === 'admin-settings-change') {
          await frame.getByLabel('Weekly digest', { exact: true }).check(); await frame.getByLabel('Retention preference (days)', { exact: true }).fill('45'); await frame.getByRole('button', { name: 'Review settings change', exact: true }).click();
          await frame.getByRole('region', { name: 'Prepared review', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click(); assert.equal(await frame.getByRole('region', { name: 'Prepared review', exact: true }).count(), 0); await revision(1, 'unchanged', 0); await capture('review-cancelled');
          await frame.getByRole('button', { name: 'Review settings change', exact: true }).click();
          await reviewed('change'); await revision(2, 'changed', 1); await capture('changed'); await frame.getByRole('button', { name: 'Review rollback', exact: true }).click(); await reviewed('rollback');
          await revision(3, 'rolled-back', 2); await capture('rolled-back'); await frame.getByRole('button', { name: 'Reload record', exact: true }).click(); await revision(3, 'rolled-back', 2); await capture('reloaded');
          assert.equal(await frame.getByLabel('Weekly digest', { exact: true }).isChecked(), false); assert.equal(await frame.getByLabel('Retention preference (days)', { exact: true }).inputValue(), '30');
        } else {
          await frame.getByRole('button', { name: 'Gather primary sources', exact: true }).click();
          const complete = frame.getByLabel('Complete source: Official MCP Apps overview', { exact: true }); await complete.waitFor(); assert.ok((await complete.textContent()).endsWith('AUTHORED_RESEARCH_SOURCE_END'));
          await nativeEnd(complete, 'AUTHORED_RESEARCH_SOURCE_END'); await capture('complete-source-native-end');
          await reviewed('gather'); await revision(2, 'partial', 1); await capture('partial');
          await frame.getByRole('button', { name: 'Retry Official TypeScript SDK overview', exact: true }).click(); await reviewed('retry'); await revision(3, 'gathered', 2); await capture('gathered');
          await frame.getByLabel('Research conclusion', { exact: true }).fill('Reviewed source evidence requires explicit authorization and exact terms.'); await frame.getByRole('button', { name: 'Review final decision', exact: true }).click(); await reviewed('decision'); await revision(4, 'completed', 3); await capture('completed');
          await frame.getByRole('button', { name: 'Reload record', exact: true }).click(); await revision(4, 'completed', 3); await capture('reloaded');
        }
      }
      assert.deepEqual(row.errors, []); assert.deepEqual(row.blocked, []);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert.ok(await frame.locator('html').evaluate(node => node.scrollWidth <= innerWidth + 1));
      const screenshot = id + '-final.png'; await page.screenshot({ path: path.join(output, screenshot), fullPage: false }); row.screenshots.push(screenshot); row.status = 'passed';
    } catch (error) { row.error = error.message; try { row.failureScreenshot = id + '-failure.png'; await page.screenshot({ path: path.join(output, row.failureScreenshot), fullPage: false }); } catch { row.failureScreenshotUnavailable = true; } throw error; }
    finally { await context.close(); row.contextClosed = true; }
  }
  report.passed = report.cases.length === 5 && report.cases.every(row => row.status === 'passed' && row.contextClosed);
} finally { await browser.close(); report.browserClosed = true; fs.writeFileSync(path.join(output, `reference-${phase}-${width}-browser.json`), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 }); }

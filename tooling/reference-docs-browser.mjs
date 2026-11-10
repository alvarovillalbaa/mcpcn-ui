// T2 docs/gallery checks after staging the five actual authored-data screenshots.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const root = process.env.MCPCN_RF_RUN_ROOT, output = process.env.MCPCN_RF_OUTPUT, origin = process.env.MCPCN_RF_DOCS_ORIGIN;
assert.equal(process.env.CI, 'true'); assert.equal(process.platform, 'linux'); assert.equal(output, path.join(root, 'output')); assert.equal(origin, 'http://127.0.0.1:4389');
assert.equal(fs.readFileSync(path.join(root, '.owner'), 'utf8'), process.env.MCPCN_RF_NONCE);
const { chromium } = createRequire(path.join(process.env.MCPCN_RF_BROWSER_TOOLS, 'package.json'))('playwright');
const sha = body => createHash('sha256').update(body).digest('hex');
const report = { sourceCommit: process.env.SOURCE_COMMIT, passed: false, cases: [], browserClosed: false };
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1280, 390]) {
    const row = { id: 'reference-docs-' + width, width, status: 'failed', stages: [], screenshots: [], images: [], errors: [], blocked: [], contextClosed: false }; report.cases.push(row);
    const context = await browser.newContext({ viewport: { width, height: 1000 } }), page = await context.newPage(); page.setDefaultTimeout(10000);
    await page.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue(); row.blocked.push(url.origin); return route.abort(); });
    page.on('pageerror', error => row.errors.push(error.message));
    const capture = async label => { const body = await page.locator('main').evaluate(node => node.outerHTML), file = `${row.id}-${label}.html`; assert.ok(Buffer.byteLength(body) < 262144); fs.writeFileSync(path.join(output, file), body, { flag: 'wx', mode: 0o600 }); row.stages.push({ label, file, bytes: Buffer.byteLength(body), sha256: sha(body) }); const png = `${row.id}-${label}.png`; await page.screenshot({ path: path.join(output, png), fullPage: false }); row.screenshots.push(png); };
    try {
      assert.equal((await page.goto(origin + '/docs', { waitUntil: 'networkidle' })).status(), 200); await page.getByRole('link', { name: 'Run five persistent reference workflows', exact: true }).click(); await page.waitForURL(origin + '/docs/reference-workflows');
      const guide = page.getByRole('article', { name: 'Persistent reference workflow guide', exact: true }); await guide.waitFor();
      const commands = await page.getByLabel('Reference workbench commands', { exact: true }).textContent(); assert.ok(commands.includes('pnpm install --frozen-lockfile --ignore-scripts') && commands.includes('pnpm examples:build') && commands.includes('pnpm examples:dev --workspace'));
      assert.ok((await guide.textContent()).includes('A failed network response can follow a completed mutation'));
      const download = await page.getByRole('link', { name: 'download the focused workbench source', exact: true }).getAttribute('href'); assert.equal(download, 'https://github.com/alvarovillalbaa/mcpcn-ui/releases/download/v0.1.0-reference-workflows.1/mcpcn-reference-workbench-0.1.0.tgz'); row.download = download; row.commands = commands;
      for (const name of ['Run locally', 'Review and confirm', 'Access and data boundaries']) await page.getByRole('link', { name, exact: true }).click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await guide.getByRole('heading', { name: 'Review a real change. Keep its audit.', exact: true }).scrollIntoViewIfNeeded(); await capture('guide');
      await page.getByRole('link', { name: 'Browse the five applications', exact: true }).click(); await page.waitForURL(origin + '/examples');
      assert.equal(await page.getByRole('link', { name: 'Read example source', exact: true }).count(), 5);
      const images = page.locator('main article img'); assert.equal(await images.count(), 5);
      for (let index = 0; index < 5; index++) {
        const image = images.nth(index); await image.scrollIntoViewIfNeeded(); await image.evaluate(node => node.decode());
        const observed = await image.evaluate(node => ({ src: new URL(node.src).pathname, width: node.naturalWidth, height: node.naturalHeight, alt: node.alt })); assert.equal(observed.width, 1280); assert.equal(observed.height, 1000); assert.ok(observed.alt.includes('authored check data')); row.images.push(observed);
      }
      assert.ok((await page.locator('main').textContent()).includes('production identity/providers and external-host compatibility require separate integration and acceptance'));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await page.getByRole('heading', { name: 'Review. Confirm. Verify.', exact: true }).scrollIntoViewIfNeeded(); await capture('gallery'); assert.deepEqual(row.errors, []); assert.deepEqual(row.blocked, []); row.status = 'passed';
    } catch (error) { row.error = error.message; try { row.failureScreenshot = row.id + '-failure.png'; await page.screenshot({ path: path.join(output, row.failureScreenshot), fullPage: false }); } catch {} throw error; }
    finally { await context.close(); row.contextClosed = true; }
  }
  report.passed = report.cases.every(row => row.status === 'passed' && row.contextClosed);
} finally { await browser.close(); report.browserClosed = true; fs.writeFileSync(path.join(output, 'reference-docs-browser.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 }); }

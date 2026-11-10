// T2 authored guide/snippet checks. The disposable browser clipboard is CI-owned.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

assert.equal(process.env.CI, 'true'); assert.equal(process.platform, 'linux');
const origin = process.env.MCPCN_SV_ORIGIN, output = process.env.MCPCN_SV_OUTPUT, tools = process.env.MCPCN_SV_BROWSER_TOOLS;
assert.equal(origin, 'http://127.0.0.1:4387'); assert.ok(path.isAbsolute(output) && path.isAbsolute(tools));
const { chromium } = createRequire(path.join(tools, 'package.json'))('playwright');
const sha = value => createHash('sha256').update(value).digest('hex');
const report = { schemaVersion: 'mcpcn.server-contract-browser.v1', sourceCommit: process.env.SOURCE_COMMIT, passed: false, cases: [], browserClosed: false,
  proofLimits: ['Authored source guide and fixture clipboard only, not an external MCP host or production authorization. 390px viewport emulation is not a physical device.'] };
const browser = await chromium.launch({ headless: true });
try {
  for (const kind of ['guide', 'playground']) for (const width of [1280, 390]) {
    const id = `server-${kind}-${width}`, row = { id, kind, viewport: { width, height: 900 }, status: 'failed', stages: [], screenshots: [], codeFiles: [], snippets: [], errors: [], externalRequestsBlocked: [] }; report.cases.push(row);
    const context = await browser.newContext({ viewport: row.viewport, permissions: ['clipboard-read', 'clipboard-write'] }), page = await context.newPage(); page.setDefaultTimeout(10000);
    await page.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue(); row.externalRequestsBlocked.push(url.origin); return route.abort(); });
    page.on('pageerror', error => row.errors.push(error.message));
    const capture = async label => { const html = await page.locator('main,div.studio').first().evaluate(element => element.outerHTML); assert.ok(Buffer.byteLength(html) < 262144); const file = `${id}-${label}.html`; fs.writeFileSync(path.join(output, file), html, { flag: 'wx', mode: 0o600 }); row.stages.push({ label, file, bytes: Buffer.byteLength(html), sha256: sha(html) }); };
    const screenshot = async label => { const file = `${id}-${label}.png`; await page.screenshot({ path: path.join(output, file), fullPage: false }); row.screenshots.push(file); };
    try {
      if (kind === 'guide') {
        assert.equal((await page.goto(`${origin}/docs`, { waitUntil: 'networkidle' })).status(), 200);
        await page.getByRole('link', { name: 'Build a validated MCP server integration', exact: true }).click(); await page.waitForURL(`${origin}/docs/server`);
        const guide = page.getByRole('article', { name: 'Validated MCP server guide', exact: true }); await guide.waitFor();
        await page.getByRole('heading', { name: 'Return a validated review surface', exact: true }).scrollIntoViewIfNeeded();
        assert.ok((await guide.textContent()).includes('SDK-owned input diagnostics remain SDK-owned')); await capture('guide'); await screenshot('guide');
        const samples = [['public', 'Public review server example'], ['validation', 'Result validation example'], ['private', 'Private review result example'], ['resource', 'Resource registration example']];
        for (const [name, label] of samples) {
          const code = await page.getByLabel(label, { exact: true }).textContent(); assert.ok(code && Buffer.byteLength(code) <= 32768);
          const file = `${id}-code-${name}.ts`; fs.writeFileSync(path.join(output, file), code, { flag: 'wx', mode: 0o600 }); row.codeFiles.push({ name, file, bytes: Buffer.byteLength(code), sha256: sha(code) });
        }
        await page.getByRole('link', { name: 'Separate private app data', exact: true }).click(); assert.equal(new URL(page.url()).hash, '#private-data');
        assert.ok((await guide.textContent()).includes('Server-only values must stay out of every client payload')); assert.ok((await page.getByLabel('Private review result example', { exact: true }).textContent()).includes('meta: { "example/private-review": review }')); await capture('private-contract');
        await page.getByRole('link', { name: 'Resources and CSP', exact: true }).click(); assert.equal(new URL(page.url()).hash, '#resources');
        assert.ok((await page.getByLabel('Resource registration example', { exact: true }).textContent()).includes('baseUriDomains')); assert.ok((await guide.textContent()).includes('Cancellation cannot roll back')); await capture('resource-contract');
        await page.getByRole('link', { name: 'Review the current reference UIs', exact: true }).click(); await page.waitForURL(`${origin}/examples`);
        assert.equal(await page.getByRole('link', { name: 'Read example source', exact: true }).count(), 5); assert.ok((await page.locator('main').textContent()).includes('Connect your own authorized server and audit service')); await capture('honest-examples'); await screenshot('examples');
      } else {
        assert.equal((await page.goto(`${origin}/playground-simulator/index.html?component=approval-card`, { waitUntil: 'networkidle' })).status(), 200);
        await page.getByRole('button', { name: 'Copy MCP server snippet', exact: true }).waitFor(); await capture('initial'); await screenshot('initial');
        for (const slug of ['approval-card', 'consent-panel']) {
          await page.getByLabel('Component or block', { exact: true }).selectOption(slug);
          await page.getByRole('button', { name: 'Copy MCP server snippet', exact: true }).click(); await page.getByText('Server registration snippet copied. Supply your server, app HTML and output data schema.', { exact: true }).waitFor();
          let code;
          for (let attempt = 0; ; attempt++) {
            code = await page.evaluate(() => navigator.clipboard.readText());
            if (code.includes(`component: ${JSON.stringify(slug)}`)) break;
            assert.ok(attempt < 100, 'Observed clipboard did not contain the selected fixture'); await page.waitForTimeout(20);
          }
          assert.ok(code.includes('inputSchema: z.object({}).strict()') && code.includes('outputSchema: z.ZodType') && code.includes(`component: ${JSON.stringify(slug)}`));
          assert.ok(code.includes('Authored public fixture only') && !code.includes('inputSchema: { type: "object"'));
          const file = `${id}-clipboard-${slug}.ts`; fs.writeFileSync(path.join(output, file), code, { flag: 'wx', mode: 0o600 }); row.snippets.push({ slug, file, bytes: Buffer.byteLength(code), sha256: sha(code) }); await capture(`copied-${slug}`);
        }
        const before = await page.evaluate(() => navigator.clipboard.readText()); await page.getByLabel('Tool result JSON', { exact: true }).fill('{ malformed authored result');
        await page.getByRole('button', { name: 'Copy MCP server snippet', exact: true }).click(); await page.getByRole('alert').filter({ hasText: 'The snippet could not be copied.' }).waitFor();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), before); await capture('invalid-copy-refused'); await screenshot('refused');
      }
      assert.equal(row.stages.length, 4); assert.deepEqual(row.errors, []); assert.deepEqual(row.externalRequestsBlocked, []);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page must fit the viewport'); row.status = 'passed';
    } catch (error) {
      row.error = error.message;
      try { const file = `${id}-failure.png`; await page.screenshot({ path: path.join(output, file), fullPage: false }); row.failureScreenshot = file; } catch { row.failureScreenshotUnavailable = true; }
      throw error;
    } finally { await context.close(); row.contextClosed = true; }
  }
  report.passed = report.cases.length === 4 && report.cases.every(row => row.status === 'passed' && row.contextClosed);
} finally { await browser.close(); report.browserClosed = true; fs.writeFileSync(path.join(output, 'server-browser.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 }); }

// T2: production docs, actual clipboard and authored configuration only.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const need = (value, message) => { if (!value) throw new Error(message); };
const root = fs.realpathSync(process.env.MCPCN_PI_ROOT);
need(process.env.CI === 'true' && process.platform === 'linux' && process.version === 'v24.22.2'
  && fs.readFileSync(path.join(root, '.owner'), 'utf8') === process.env.MCPCN_PI_NONCE, 'owned_public_ci_only');
const sourceCommit = process.env.SOURCE_COMMIT, origin = process.env.MCPCN_PI_ORIGIN;
need(/^[a-f0-9]{40}$/.test(sourceCommit) && origin === 'http://127.0.0.1:4322', 'source_origin_binding');
const profiles = JSON.parse(fs.readFileSync('tests/fixtures/public-release-profiles.json'));
const release = JSON.parse(fs.readFileSync('apps/docs/data/archive-release.json'));
need(profiles.length === 4 && release.packages.length === 8, 'frozen_scope');
const { chromium } = createRequire(process.env.MCPCN_PI_PLAYWRIGHT + '/package.json')(process.env.MCPCN_PI_PLAYWRIGHT);
const output = path.join(root, 'output'), report = { sourceCommit, passed: false, cases: [], errors: [], browserClosed: false };
let browser;
try {
  browser = await chromium.launch({ headless: true }); report.browserVersion = browser.version();
  for (const profile of profiles) {
    const row = { ...profile, stages: [], errors: [], copies: [], requests: [], contextClosed: false };
    report.cases.push(row);
    const context = await browser.newContext({ viewport: { width: profile.width, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage(); let routeBodies = {};
    page.on('pageerror', error => row.errors.push('page: ' + error.message));
    page.on('requestfailed', request => row.errors.push('request: ' + request.url() + ': ' + request.failure()?.errorText));
    page.on('request', request => { row.requests.push({ method: request.method(), url: request.url() });
      if (!request.url().startsWith(origin + '/') && !request.url().startsWith('data:')) row.errors.push('external_origin'); });
    page.on('response', response => { if (response.status() >= 400) row.errors.push('http: ' + response.status() + ': ' + response.url()); });
    const capture = async (name, png = false) => {
      const stem = 'public-install-' + profile.id + '-' + name;
      const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      const body = Buffer.from(JSON.stringify({ sourceCommit, profile, geometry, html: await page.content(), routeBodies }, null, 2) + '\n');
      need(body.length <= 2 * 1024 * 1024, 'dom_bound');
      fs.writeFileSync(path.join(output, stem + '.dom.json'), body, { flag: 'wx' });
      if (png) { const image = await page.screenshot({ fullPage: false }); need(image.length <= 1024 * 1024, 'png_bound');
        fs.writeFileSync(path.join(output, stem + '.png'), image, { flag: 'wx' }); }
      row.stages.push({ name, dom: stem + '.dom.json', png: png ? stem + '.png' : null, geometry });
      need(geometry.scroll <= geometry.width + 1 && geometry.body <= geometry.width + 1, 'document_horizontal_overflow');
    };
    const prepared = () => page.getByRole('region', { name: 'Prepared installation', exact: true });
    const config = async () => {
      const details = prepared().locator('details').filter({ has: page.getByText('Review mcpcn.json', { exact: true }) });
      if (await details.getAttribute('open') === null) await details.locator('summary').click();
      return JSON.parse(await details.locator('pre').textContent());
    };
    const choose = async () => {
      const search = page.getByRole('searchbox', { name: 'Find components and blocks' });
      await search.fill('');
      for (let n = 0; await page.locator('input[name="install-item"]:checked').count(); n++) {
        need(n < 80, 'selection_clear_bound'); await page.locator('input[name="install-item"]:checked').first().uncheck();
      }
      for (const slug of profile.selected) { await search.fill(slug); await page.locator(`input[name="install-item"][value="${slug}"]`).check(); }
      await search.fill('');
    };
    try {
      await page.goto(origin + '/docs#install', { waitUntil: 'networkidle', timeout: 20000 });
      const source = page.getByRole('region', { name: 'Source installation', exact: true });
      const packaged = page.getByRole('region', { name: 'Package installation', exact: true });
      need(await source.locator('[data-archive-release]').getAttribute('data-archive-release') === release.tag
        && await packaged.locator('[data-archive-release]').getAttribute('data-archive-release') === release.tag, 'getting_started_release');
      for (const section of [source, packaged]) {
        const text = await section.locator('pre[aria-label="release packages"] code').textContent();
        need(release.packages.every(item => text.includes(release.assetBase + '/' + item.file)), 'getting_started_archives');
        need((await section.locator('pre[aria-label="initialization"] code').textContent()).includes('--registry=' + release.registry), 'getting_started_pin');
      }
      await source.scrollIntoViewIfNeeded(); await capture('01-getting-started', true);
      await page.goto(origin + '/create', { waitUntil: 'networkidle' });
      need((await config()).registry === release.registry, 'initial_registry_pin');
      await capture('02-initial-configurator');
      await page.getByLabel('Package manager', { exact: true }).selectOption(profile.manager);
      await page.getByLabel('Installation mode', { exact: true }).selectOption(profile.mode);
      await page.getByLabel('Theme', { exact: true }).selectOption(profile.style);
      await page.getByLabel('Host adapter', { exact: true }).selectOption(profile.host);
      const paths = page.locator('details').filter({ has: page.getByText('Installation paths', { exact: true }) });
      await paths.locator('summary').click();
      await page.getByLabel('Component directory', { exact: true }).fill(profile.componentsDir);
      await choose();
      row.config = await config();
      for (const key of ['mode', 'style', 'host', 'componentsDir']) need(row.config[key] === profile[key], 'visible_config_' + key);
      need(row.config.packageManager === profile.manager && row.config.registry === release.registry, 'visible_manager_registry');
      await prepared().scrollIntoViewIfNeeded(); await capture('03-configured-commands', true);
      const commands = {};
      for (const [key, label] of [['bootstrap', 'release packages'], ['initialize', 'initialization'], ['add', 'selected items']]) {
        const value = await prepared().locator(`pre[aria-label="${label}"] code`).textContent();
        await prepared().getByRole('button', { name: 'Copy ' + label, exact: true }).click();
        await prepared().getByRole('button', { name: 'Copy ' + label, exact: true }).locator('..').getByRole('status').filter({ hasText: 'Command copied.' }).waitFor();
        const actual = await page.evaluate(() => navigator.clipboard.readText());
        row.copies.push({ key, requested: value, actual }); need(actual === value, 'actual_clipboard_' + key); commands[key] = actual;
      }
      need(commands.initialize.startsWith('node node_modules/mcpcn/dist/index.js init ') && commands.add === 'node node_modules/mcpcn/dist/index.js add ' + profile.selected.join(' '), 'local_cli_commands');
      const captured = { sourceCommit, profile, config: row.config, commands };
      fs.writeFileSync(path.join(output, 'public-install-' + profile.id + '-commands.json'), JSON.stringify(captured, null, 2) + '\n', { flag: 'wx' });
      await capture('04-native-clipboard');
      await page.getByLabel('Component directory', { exact: true }).fill('node_modules/foreign');
      await page.getByRole('alert').waitFor(); need(await prepared().count() === 0, 'invalid_path_hides_commands');
      await page.getByLabel('Component directory', { exact: true }).fill(profile.componentsDir);
      await prepared().waitFor(); need((await config()).componentsDir === profile.componentsDir, 'valid_path_restored');
      await capture('05-invalid-path');
      for (const slug of profile.selected) await page.locator(`input[name="install-item"][value="${slug}"]`).uncheck();
      need(await prepared().count() === 0 && await page.getByText('Choose at least one component or workflow block to prepare an installation.', { exact: true }).isVisible(), 'empty_selection');
      await choose(); need((await config()).componentsDir === profile.componentsDir, 'selection_restores_config');
      await capture('06-empty-selection');
      await page.getByLabel('Registry URL', { exact: true }).fill('https://example.invalid/preview');
      need((await config()).registry === 'https://example.invalid/preview'
        && (await prepared().locator('pre[aria-label="initialization"] code').textContent()).includes('--registry=https://example.invalid/preview'), 'custom_registry_explicit');
      await page.getByLabel('Package manager', { exact: true }).selectOption('bun');
      need(await prepared().getByText('Bun currently shows the prepared npm-package interface. Choose npm or pnpm for the checked GitHub archive installation.', { exact: true }).isVisible()
        && await prepared().getByRole('button', { name: /^Copy / }).count() === 0
        && (await config()).registry === 'https://example.invalid/preview', 'bun_preview_and_config');
      await capture('07-custom-and-preview');
      await page.goto(origin + '/components/tabs', { waitUntil: 'networkidle' });
      need(await page.getByRole('link', { name: 'Install the checked release packages and initialize your app', exact: true }).getAttribute('href') === '/docs#install', 'component_setup_link');
      need(await page.locator('pre[aria-label="Tabs installation"] code').textContent() === 'node node_modules/mcpcn/dist/index.js add tabs', 'component_local_cli');
      routeBodies['/components/tabs'] = await page.content();
      await page.goto(origin + '/blocks', { waitUntil: 'networkidle' });
      const blockCommands = await page.locator('article pre code').allTextContents();
      need(blockCommands.length === 11 && blockCommands.every(text => /^node node_modules\/mcpcn\/dist\/index\.js add [a-z0-9-]+$/.test(text)), 'all_blocks_local_cli');
      routeBodies['/blocks'] = await page.content();
      await page.goto(origin + '/docs/block-recipes', { waitUntil: 'networkidle' });
      need(await page.locator('pre[aria-label="block installation"] code').textContent() === 'node node_modules/mcpcn/dist/index.js add review-before-action', 'guide_preserves_configuration');
      routeBodies['/docs/block-recipes'] = await page.content();
      await capture('08-installation-routes');
      need(row.stages.length === 8 && row.stages.filter(stage => stage.png).length === 2 && row.errors.length === 0, 'browser_profile');
      row.passed = true;
    } catch (error) {
      row.errors.push(String(error.stack ?? error)); try { await capture('failed-state'); } catch (failure) { row.errors.push('capture: ' + failure.message); }
      throw error;
    } finally { await context.close(); row.contextClosed = true; }
  }
  report.passed = report.cases.length === 4 && report.cases.every(row => row.passed && row.contextClosed && !row.errors.length);
} catch (error) { report.errors.push(String(error.stack ?? error)); }
finally {
  if (browser) { await browser.close(); report.browserClosed = true; }
  fs.writeFileSync(path.join(output, 'public-install-browser.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
if (!report.passed || !report.browserClosed) process.exitCode = 1;

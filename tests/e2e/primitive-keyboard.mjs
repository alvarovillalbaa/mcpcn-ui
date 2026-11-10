// T2: actual Chromium input against fresh installed UI in a real iframe.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const need = (value, message) => { if (!value) throw new Error(message); };
const root = fs.realpathSync(process.env.MCPCN_PR_ROOT);
need(process.env.CI === 'true' && process.platform === 'linux' && process.version === 'v24.22.2'
  && fs.readFileSync(path.join(root, '.owner'), 'utf8') === process.env.MCPCN_PR_NONCE, 'owned_public_ci_only');
const mode = process.env.MCPCN_PR_MODE, sourceCommit = process.env.SOURCE_COMMIT;
need(['package', 'copy'].includes(mode) && /^[a-f0-9]{40}$/.test(sourceCommit), 'profile_identity');
const origin = 'http://127.0.0.1:' + (mode === 'package' ? '4319' : '4320');
const { chromium } = createRequire(process.env.MCPCN_PR_PLAYWRIGHT + '/package.json')(process.env.MCPCN_PR_PLAYWRIGHT);
const profiles = mode === 'package'
  ? [{ width: 1280, colorScheme: 'light', reducedMotion: 'no-preference', forcedColors: 'none' },
    { width: 390, colorScheme: 'dark', reducedMotion: 'reduce', forcedColors: 'none' }]
  : [{ width: 1280, colorScheme: 'light', reducedMotion: 'reduce', forcedColors: 'active' },
    { width: 390, colorScheme: 'dark', reducedMotion: 'no-preference', forcedColors: 'none' }];
const report = { sourceCommit, mode, passed: false, cases: [], errors: [], browserClosed: false };
const output = path.join(root, 'output');
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const profile of profiles) {
    const id = mode + '-' + profile.width;
    const row = { id, ...profile, stages: [], keys: [], lifecycle: [], requests: [], errors: [], contextClosed: false };
    report.cases.push(row);
    const context = await browser.newContext({ viewport: { width: profile.width, height: 1000 },
      colorScheme: profile.colorScheme, reducedMotion: profile.reducedMotion, forcedColors: profile.forcedColors });
    const page = await context.newPage();
    let frame;
    const capture = async (name, screenshot = false) => {
      const file = 'primitive-' + id + '-' + name;
      const data = { sourceCommit, profile, host: await page.content(),
        iframe: frame ? await frame.content() : null,
        focus: frame ? await frame.evaluate(() => ({ tag: document.activeElement?.tagName,
          text: document.activeElement?.textContent, id: document.activeElement?.id,
          dialogOpen: document.querySelector('dialog')?.open,
          modal: !!document.querySelector('dialog:modal') })) : null };
      const body = Buffer.from(JSON.stringify(data, null, 2) + '\n');
      need(body.length <= 2 * 1024 * 1024, 'dom_bound');
      fs.writeFileSync(path.join(output, file + '.dom.json'), body, { flag: 'wx' });
      if (screenshot) {
        const png = await page.screenshot({ fullPage: false });
        need(png.length <= 1024 * 1024, 'png_bound');
        fs.writeFileSync(path.join(output, file + '.png'), png, { flag: 'wx' });
      }
      row.stages.push({ name, dom: file + '.dom.json', png: screenshot ? file + '.png' : null });
    };
    page.on('pageerror', error => row.errors.push('page: ' + error.message));
    page.on('requestfailed', request => row.errors.push('request: ' + request.url() + ': ' + request.failure()?.errorText));
    page.on('request', request => {
      row.requests.push({ method: request.method(), url: request.url() });
      if (!request.url().startsWith(origin + '/') && !request.url().startsWith('data:')) row.errors.push('external_origin');
    });
    page.on('response', response => { if (response.status() >= 400) row.errors.push('http: ' + response.status() + ': ' + response.url()); });
    const relationships = async () => {
      const observation = await frame.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
        const lists = [...document.querySelectorAll('[role="tablist"]')].map(list => {
          const tabs = [...list.querySelectorAll('[role="tab"]')];
          return { label: list.getAttribute('aria-label'), count: tabs.length,
            selected: tabs.filter(tab => tab.getAttribute('aria-selected') === 'true').length,
            stops: tabs.filter(tab => tab.tabIndex === 0).length,
            valid: tabs.every(tab => {
              const panel = document.getElementById(tab.getAttribute('aria-controls'));
              return panel?.getAttribute('role') === 'tabpanel' && panel.getAttribute('aria-labelledby') === tab.id
                && panel.hidden === (tab.getAttribute('aria-selected') !== 'true')
                && panel.tabIndex === 0;
            }) };
        });
        return { uniqueIds: ids.length === new Set(ids).size, lists };
      });
      row.relationships = observation;
      need(observation.uniqueIds && observation.lists.length === 3 && observation.lists.every(list =>
        list.label && list.valid && list.selected === (list.count ? 1 : 0) && list.stops === (list.count ? 1 : 0)), 'tab_relationships');
    };
    const group = name => frame.getByRole('tablist', { name });
    const activeTab = async (name, expected) => {
      const list = group(name);
      const selected = list.locator('[aria-selected="true"]');
      need(await selected.textContent() === expected, 'selected_tab_' + name + '_' + expected);
      return selected;
    };
    const press = async (name, key, expected) => {
      const list = group(name);
      await list.locator('[aria-selected="true"]').press(key);
      const observation = await list.evaluate(list => ({ selected: list.querySelector('[aria-selected="true"]')?.textContent,
        focused: document.activeElement?.textContent, focusedRole: document.activeElement?.getAttribute('role') }));
      row.keys.push({ name, key, ...observation });
      need(observation.selected === expected && observation.focused === expected && observation.focusedRole === 'tab', 'actual_key_' + key);
    };
    const focusInside = async () => frame.evaluate(() => !!document.querySelector('dialog:modal')?.contains(document.activeElement));
    try {
      await page.goto(origin + '/', { waitUntil: 'networkidle', timeout: 20000 });
      frame = page.frames().find(item => item.url() === origin + '/frame.html');
      need(frame, 'actual_iframe');
      await frame.locator('[data-ready="true"]').waitFor();
      row.binding = await frame.evaluate(async () => (await fetch('/source-binding.json')).json());
      need(row.binding.sourceCommit === sourceCommit && row.binding.mode === mode, 'built_source_binding');
      row.media = await frame.evaluate(() => ({ dark: matchMedia('(prefers-color-scheme:dark)').matches,
        reduced: matchMedia('(prefers-reduced-motion:reduce)').matches, forced: matchMedia('(forced-colors:active)').matches,
        colorScheme: getComputedStyle(document.documentElement).colorScheme }));
      need(row.media.dark === (profile.colorScheme === 'dark') && row.media.reduced === (profile.reducedMotion === 'reduce')
        && row.media.forced === (profile.forcedColors === 'active')
        && row.media.colorScheme === (profile.forcedColors === 'active' ? 'light dark' : profile.colorScheme), 'observed_media');
      await capture('01-initial-tabs', true);
      need(await frame.locator('dialog').count() === 0, 'closed_dialog_unmounted');
      await relationships();
      for (const name of ['Controlled sections', 'Local sections']) {
        await group(name).getByRole('tab', { name: 'Alpha', exact: true }).click();
        for (const [key, expected] of [['ArrowLeft', 'Gamma'], ['ArrowRight', 'Alpha'], ['End', 'Gamma'], ['Home', 'Alpha'],
          ['ArrowRight', 'Beta'], ['Enter', 'Beta'], ['Space', 'Beta']]) await press(name, key, expected);
        await (await activeTab(name, 'Beta')).press('ArrowDown');
        need(await frame.locator('main').getAttribute('data-unhandled') === 'false', 'vertical_key_not_consumed');
        await (await activeTab(name, 'Beta')).press('Tab');
        need(await frame.evaluate(() => document.activeElement?.getAttribute('role')) === 'tabpanel', 'tab_to_panel');
        await page.keyboard.press('Tab');
        need(await frame.evaluate(() => document.activeElement?.textContent) === 'beta panel action', 'tab_to_panel_action');
      }
      await capture('02-keyboard');
      await group('Changing sections').getByRole('tab', { name: 'Gamma', exact: true }).click();
      await frame.getByRole('button', { name: 'Remove Gamma', exact: true }).click();
      await activeTab('Changing sections', 'Alpha');
      await frame.getByRole('button', { name: 'Reverse items', exact: true }).click();
      await activeTab('Changing sections', 'Alpha');
      await relationships();
      await frame.getByRole('button', { name: 'Empty items', exact: true }).click();
      need(await group('Changing sections').getByRole('tab').count() === 0, 'empty_tabs');
      await relationships();
      await frame.getByRole('button', { name: 'Restore items', exact: true }).click();
      await activeTab('Changing sections', 'Alpha');
      await capture('03-changing-items');
      await relationships();
      const invoker = frame.getByRole('button', { name: 'Open modal', exact: true });
      const dialog = frame.getByRole('dialog', { name: 'Review authored note', exact: true });
      await invoker.click();
      await dialog.waitFor();
      await capture('04-native-modal', true);
      row.modalGeometry = await dialog.evaluate(element => {
        const box = element.getBoundingClientRect(), title = element.querySelector('h2').getBoundingClientRect();
        return { width: innerWidth, height: innerHeight, left: box.left, top: box.top,
          right: box.right, bottom: box.bottom, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
          titleTop: title.top, titleBottom: title.bottom };
      });
      need(row.modalGeometry.left >= -1 && row.modalGeometry.top >= -1
        && row.modalGeometry.right <= row.modalGeometry.width + 1 && row.modalGeometry.bottom <= row.modalGeometry.height + 1
        && row.modalGeometry.scrollWidth <= row.modalGeometry.clientWidth + 1
        && row.modalGeometry.titleTop >= 0 && row.modalGeometry.titleBottom <= row.modalGeometry.height, 'bounded_modal_geometry');
      need(await frame.evaluate(() => document.activeElement === document.querySelector('dialog h2')
        && !!document.querySelector('dialog:modal')), 'native_modal_title_focus');
      await frame.getByRole('button', { name: 'Background action', exact: true }).evaluate(button => button.focus());
      need(await focusInside(), 'background_focus_inert');
      await frame.getByRole('button', { name: 'Background action', exact: true }).click({ force: true });
      need(await frame.locator('main').getAttribute('data-background') === '0', 'background_pointer_inert');
      await dialog.getByRole('button', { name: 'Close', exact: true }).focus();
      const forward = ['INPUT:Note', 'BUTTON:Record note', 'BUTTON:Owner closes modal', 'BUTTON:Unmount dialog', 'BUTTON:Close'];
      for (const expected of forward) {
        await page.keyboard.press('Tab');
        const actual = await frame.evaluate(() => document.activeElement?.tagName + ':'
          + (document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent));
        row.lifecycle.push({ key: 'Tab', actual });
        need(actual === expected && await focusInside(), 'modal_forward_wrap');
      }
      await page.keyboard.press('Shift+Tab');
      need(await frame.evaluate(() => document.activeElement?.textContent) === 'Unmount dialog' && await focusInside(), 'modal_reverse_wrap');
      await dialog.getByRole('textbox', { name: 'Note', exact: true }).fill('Changed authored note');
      await dialog.getByRole('button', { name: 'Record note', exact: true }).click();
      need(await frame.locator('main').getAttribute('data-notes') === '1', 'reachable_modal_action');
      await capture('05-focus-containment');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      need(await frame.locator('main').getAttribute('data-close-requests') === '1' && await invoker.evaluate(button => button === document.activeElement), 'escape_restore');
      await capture('06-escape-restoration');
      await frame.getByRole('checkbox', { name: 'Keep open after close request' }).check();
      await invoker.click();
      await dialog.waitFor();
      await page.keyboard.press('Escape');
      need(await frame.locator('main').getAttribute('data-close-requests') === '2' && await focusInside(), 'controlled_escape_retained');
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      need(await frame.locator('main').getAttribute('data-close-requests') === '3' && await focusInside(), 'controlled_button_retained');
      await dialog.getByRole('button', { name: 'Owner closes modal', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      need(await invoker.evaluate(button => button === document.activeElement), 'owner_close_restores');
      await invoker.click();
      await dialog.getByRole('button', { name: 'Unmount dialog', exact: true }).click();
      need(await frame.locator('dialog').count() === 0 && await invoker.evaluate(button => button === document.activeElement), 'unmount_restores');
      need(await frame.locator('main').getAttribute('data-close-requests') === '3', 'no_synthetic_close_request');
      await capture('07-controlled-lifecycle');
      await frame.getByRole('button', { name: 'Background action', exact: true }).click();
      need(await frame.locator('main').getAttribute('data-background') === '1', 'background_restored');
      need(await frame.locator('main').getAttribute('data-submits') === '0', 'no_unintended_submit');
      await relationships();
      row.geometry = await frame.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
        body: document.body.scrollWidth }));
      need(row.geometry.scroll <= row.geometry.width + 1 && row.geometry.body <= row.geometry.width + 1, 'horizontal_overflow');
      need(row.errors.length === 0, 'unexpected_browser_errors');
      await capture('08-final');
      need(row.stages.length === 8 && row.stages.filter(stage => stage.png).length === 2, 'stage_profile');
      row.passed = true;
    } catch (error) {
      row.errors.push(String(error.stack ?? error));
      try { await capture('failed-state'); } catch (captureError) { row.errors.push('capture: ' + captureError.message); }
      throw error;
    } finally {
      await context.close();
      row.contextClosed = true;
    }
  }
  report.passed = report.cases.length === 2 && report.cases.every(row => row.passed && row.contextClosed && !row.errors.length);
} catch (error) {
  report.errors.push(String(error.stack ?? error));
} finally {
  if (browser) { await browser.close(); report.browserClosed = true; }
  fs.writeFileSync(path.join(output, 'primitive-' + mode + '-browser.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
if (!report.passed || !report.browserClosed) process.exitCode = 1;

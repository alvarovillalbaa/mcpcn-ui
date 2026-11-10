// One public CI job. All execution is in bounded owned scratch; source stays read-only.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { publicReleaseConsumers } from '../tests/helpers/public-release-consumers.mjs';
const need = (value, message) => { if (!value) throw new Error(message); };
const sha = body => createHash('sha256').update(body).digest('hex');
const sourceCommit = process.argv[3], workflowCommit = process.env.GITHUB_SHA;
need(process.argv[2] === '--source-commit' && sourceCommit === process.env.SOURCE_COMMIT && /^[a-f0-9]{40}$/.test(sourceCommit ?? ''), 'source_pin_required');
need(process.env.GITHUB_REPOSITORY === 'alvarovillalbaa/mcpcn-ui' && process.env.GITHUB_REF === 'refs/heads/main'
  && process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && process.env.MCPCN_PUBLIC_REPOSITORY === 'true'
  && process.env.CI === 'true' && process.platform === 'linux' && process.version === 'v24.22.2'
  && /^[a-f0-9]{40}$/.test(workflowCommit ?? '') && workflowCommit !== sourceCommit, 'approved_public_ci_required');
const repo = fs.realpathSync(process.cwd()), runner = fs.realpathSync(process.env.RUNNER_TEMP);
const root = fs.mkdtempSync(path.join(runner, 'mcpcn-public-install-')); fs.chmodSync(root, 0o700);
const identity = fs.lstatSync(root), nonce = randomBytes(16).toString('hex');
fs.writeFileSync(path.join(root, '.owner'), nonce, { flag: 'wx', mode: 0o600 });
const packet = path.join(runner, `mcpcn-public-install-packet-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`);
fs.mkdirSync(packet, { mode: 0o700 }); fs.appendFileSync(process.env.GITHUB_ENV, `MCPCN_PUBLIC_INSTALL_PACKET=${packet}\n`);
for (const name of ['source', 'output', 'archives', 'consumers', 'tools', 'tmp', 'cache', 'config', 'data', 'state']) fs.mkdirSync(path.join(root, name), { mode: 0o700 });
for (const name of ['npm-user', 'npm-global']) fs.writeFileSync(path.join(root, name), '', { flag: 'wx', mode: 0o600 });
const source = path.join(root, 'source'), output = path.join(root, 'output'), archives = path.join(root, 'archives');
const env = { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: process.env.HOME, LANG: 'C.UTF-8', TZ: 'UTC', CI: 'true', NO_COLOR: '1', SOURCE_COMMIT: sourceCommit,
  NEXT_TELEMETRY_DISABLED: '1', TMPDIR: path.join(root, 'tmp'), TMP: path.join(root, 'tmp'), TEMP: path.join(root, 'tmp'),
  XDG_CACHE_HOME: path.join(root, 'cache'), XDG_CONFIG_HOME: path.join(root, 'config'), XDG_DATA_HOME: path.join(root, 'data'), XDG_STATE_HOME: path.join(root, 'state'),
  npm_config_cache: path.join(root, 'cache/npm'), npm_config_store_dir: path.join(root, 'cache/pnpm'),
  npm_config_userconfig: path.join(root, 'npm-user'), npm_config_globalconfig: path.join(root, 'npm-global'),
  npm_config_registry: 'https://registry.npmjs.org/', npm_config_ignore_scripts: 'true', npm_config_audit: 'false', npm_config_fund: 'false',
  npm_config_fetch_retries: '0', npm_config_fetch_timeout: '15000', npm_config_update_notifier: 'false',
  MCPCN_PI_ROOT: root, MCPCN_PI_NONCE: nonce, MCPCN_PI_ORIGIN: 'http://127.0.0.1:4322' };
fs.mkdirSync(env.npm_config_cache, { recursive: true, mode: 0o700 });
const started = Date.now(), deadline = started + 1020000, active = new Set();
const report = { schemaVersion: 'mcpcn.public-release-install-checks.v1', sourceCommit, workflowCommit, status: 'failed',
  startedAt: new Date(started).toISOString(), commands: [], guards: [], errors: [], cleanup: {},
  proofLimits: ['T2 authored consumer apps and in-memory SQLite fixtures; no production data/account/provider/model/payment or external host.',
    'Four selected Chromium docs/clipboard journeys and npm/pnpm URL installs only; Bun, physical input, human accessibility, public npm publication and full-product acceptance remain open.'] };
let baseline, seed, server, interrupted = false;
function owner() {
  const now = fs.lstatSync(root);
  need(now.dev === identity.dev && now.ino === identity.ino && now.uid === process.getuid() && !now.isSymbolicLink()
    && fs.readFileSync(path.join(root, '.owner'), 'utf8') === nonce, 'owned_root_changed');
}
function proc(pid) {
  try { const raw = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'), fields = raw.slice(raw.lastIndexOf(')') + 2).split(' ');
    return { pid, uid: fs.statSync(`/proc/${pid}`).uid, pgid: Number(fields[2]), sid: Number(fields[3]), start: fields[19] };
  } catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) return null; throw error; }
}
function absent(pid) { try { process.kill(-pid, 0); return false; } catch (error) { return error.code === 'ESRCH'; } }
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { interrupted = true; for (const child of active) child.stop('SIGTERM'); });
function launch(label, command, args, cwd = source, seconds = 120) {
  owner(); need(!interrupted && Date.now() + 15000 < deadline, 'deadline_or_interruption');
  const row = { label, command, args, startedAt: new Date().toISOString(), signals: [], streams: [] }; report.commands.push(row);
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const bound = child.pid ? proc(child.pid) : null; row.pid = child.pid; row.identity = bound;
  const pieces = [[], []], sizes = [0, 0], ended = [false, false]; let timer, killTimer, handle;
  const stop = signal => { const now = child.pid && proc(child.pid);
    if (now && bound && now.uid === bound.uid && now.start === bound.start && now.pgid === child.pid && now.sid === child.pid) {
      process.kill(-child.pid, signal); row.signals.push(signal);
    } else if (child.pid && !absent(child.pid)) row.uncertainOwnership = true;
  };
  const promise = new Promise((resolve, reject) => {
    child.once('error', error => { row.spawnError = error.code ?? 'spawn_error'; });
    [child.stdout, child.stderr].forEach((stream, index) => {
      stream.on('data', body => { sizes[index] += body.length;
        if (sizes[index] <= 4 * 1024 * 1024) pieces[index].push(body); else { row.overflow = true; stop('SIGTERM'); } });
      stream.once('end', () => { ended[index] = true; });
    });
    child.once('close', async (code, signal) => {
      clearTimeout(timer); clearTimeout(killTimer); active.delete(handle);
      row.exitCode = code; row.signal = signal; row.closeObserved = true; row.completedAt = new Date().toISOString();
      for (let n = 0; child.pid && !absent(child.pid) && n < 20; n++) await new Promise(done => setTimeout(done, 50));
      row.originalGroupAbsent = !child.pid || absent(child.pid);
      for (let n = 0; n < 2; n++) { const body = Buffer.concat(pieces[n]), name = label + (n ? '.stderr.txt' : '.stdout.txt');
        fs.writeFileSync(path.join(output, name), body, { flag: 'wx' }); row.streams.push({ name, bytes: body.length, sha256: sha(body), complete: ended[n] && !row.overflow }); }
      if (row.spawnError || row.overflow || !row.originalGroupAbsent || !ended.every(Boolean)) reject(new Error('command_or_stream_closure_failed'));
      else resolve({ row, stdout: Buffer.concat(pieces[0]), code, signal });
    });
    timer = setTimeout(() => { row.timedOut = true; stop('SIGTERM'); killTimer = setTimeout(() => stop('SIGKILL'), 5000); },
      Math.min(seconds * 1000, Math.max(1000, deadline - Date.now() - 10000)));
  });
  promise.catch(() => undefined); handle = { child, row, promise, stop }; active.add(handle); return handle;
}
async function run(label, command, args, cwd = source, seconds = 120) {
  const result = await launch(label, command, args, cwd, seconds).promise;
  need(result.code === 0 && result.signal === null && !result.row.timedOut, label + '_failed'); return result.stdout;
}
const git = (...args) => execFileSync('git', args, { cwd: repo, env: { ...env, GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 2 * 1024 * 1024, timeout: 30000 });
const names = git('ls-files', '-z').toString().split('\0').filter(Boolean).sort(); need(names.length <= 10500, 'source_file_count');
const exported = names.filter(name => !['docs/results/', '.github/', '.agents/', '.codex/'].some(prefix => name.startsWith(prefix)));
function snapshot(base, paths) {
  let total = 0;
  return paths.map(name => { const file = path.join(base, name), stat = fs.lstatSync(file);
    need(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 40 * 1024 * 1024, 'source_file_bound');
    total += stat.size; need(total <= 1152 * 1024 * 1024, 'source_total_bound');
    return { path: name, bytes: stat.size, mode: stat.mode & 0o777, sha256: sha(fs.readFileSync(file)) }; });
}
function guard(label) {
  owner(); const now = snapshot(repo, names), exportedNow = snapshot(source, exported);
  need(JSON.stringify(now) === JSON.stringify(baseline), 'canonical_source_changed');
  need(JSON.stringify(exportedNow) === JSON.stringify(seed), 'entire_export_changed');
  report.guards.push({ label, canonicalFiles: now.length, canonicalVectorSha256: sha(Buffer.from(JSON.stringify(now))),
    protectedFiles: exportedNow.length, protectedVectorSha256: sha(Buffer.from(JSON.stringify(exportedNow))) });
}
try {
  need(git('rev-parse', 'HEAD').toString().trim() === sourceCommit && git('status', '--porcelain').length === 0, 'exact_clean_checkout');
  need(git('rev-parse', 'HEAD^').toString().trim() === 'ec3e6384c9806c1b480b9c98d9f9b209d8063d4a', 'candidate_must_follow_closed_base');
  baseline = snapshot(repo, names); let bytes = 0;
  for (const name of exported) {
    need(!path.isAbsolute(name) && !name.split('/').some(part => ['..', '.git'].includes(part)), 'export_path');
    const from = path.join(repo, name), to = path.join(source, name); bytes += fs.lstatSync(from).size;
    need(bytes <= 128 * 1024 * 1024, 'export_bound'); fs.mkdirSync(path.dirname(to), { recursive: true, mode: 0o700 });
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
  }
  seed = snapshot(source, exported); report.export = { files: exported.length, bytes }; guard('before-install');
  await run('public-tools-install', 'npm', ['install', '--prefix', path.join(root, 'tools'), '--ignore-scripts', '--no-audit', '--no-fund', 'pnpm@10.24.0', 'playwright@1.65.0'], root, 120);
  env.PATH = path.join(root, 'tools/node_modules/.bin') + ':' + path.dirname(process.execPath) + ':/usr/bin:/bin';
  await run('public-frozen-install', 'pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], source, 180); guard('after-install');
  const build = (await run('public-production-docs-build', 'pnpm', ['exec', 'turbo', 'run', 'build', '--filter=@mcpcn/docs...', '--force'], source, 240)).toString();
  const plain = build.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
  need(/10 successful, 10 total/.test(plain) && /0 cached, 10 total/.test(plain)
    && /Generating static pages[^\n]*\(84\/84\)/.test(plain), 'actual_cold_production_profile');
  report.production = { coldSuccessfulTasks: 10, totalTasks: 10, expectedPages: 84 }; guard('after-production-build');
  await run('public-chromium-install', path.join(root, 'tools/node_modules/.bin/playwright'), ['install', 'chromium'], source, 120);
  env.MCPCN_PI_PLAYWRIGHT = path.join(root, 'tools/node_modules/playwright');
  server = launch('public-docs-server', path.join(source, 'apps/docs/node_modules/.bin/next'), ['start', '--hostname', '127.0.0.1', '--port', '4322'], path.join(source, 'apps/docs'), 240);
  let ready = false;
  for (let n = 0; n < 100 && !ready; n++) {
    need(!server.row.closeObserved, 'docs_stopped_before_ready');
    try { const response = await fetch(env.MCPCN_PI_ORIGIN + '/docs', { signal: AbortSignal.timeout(1000) }); ready = response.status === 200; await response.arrayBuffer(); }
    catch (error) { if (error.name !== 'TimeoutError' && !(error instanceof TypeError)) throw error; }
    if (!ready) await new Promise(done => setTimeout(done, 100));
  }
  need(ready, 'docs_not_ready');
  await run('public-docs-browser', process.execPath, ['tests/e2e/public-release-install.mjs'], source, 180);
  const browser = JSON.parse(fs.readFileSync(path.join(output, 'public-install-browser.json')));
  need(browser.passed && browser.browserClosed && browser.cases.length === 4 && browser.cases.every(row => row.passed && row.contextClosed && row.stages.length === 8), 'four_docs_journeys');
  need(browser.cases.reduce((n, row) => n + row.stages.length, 0) === 32 && browser.cases.reduce((n, row) => n + row.stages.filter(stage => stage.png).length, 0) === 8, 'docs_capture_profile');
  report.browser = { profiles: 4, domStages: 32, pngs: 8, version: browser.browserVersion, nativeClipboardReadbacks: 12 };
  server.stop('SIGTERM'); const closed = await server.promise;
  need(closed.row.originalGroupAbsent && closed.row.signals.includes('SIGTERM') && !closed.row.timedOut
    && ((closed.code === null && closed.signal === 'SIGTERM') || ([0, 143].includes(closed.code) && closed.signal === null)), 'explicit_docs_shutdown');
  server = undefined; guard('after-docs-browser');
  report.consumers = await publicReleaseConsumers({ root, source, output, archives, sourceCommit, run });
  need(report.consumers.passed && report.consumers.actualDownloadedArchives === 8 && report.consumers.consumers.length === 4
    && report.consumers.consumers.every(row => row.skipLibCheck === false && row.installedSdkCases === 1 && row.actualViteBuild), 'four_public_consumers');
  guard('after-public-consumers'); report.status = 'passed';
} catch (error) {
  report.errors.push(/^[a-zA-Z0-9_-]+$/.test(error.message ?? '') ? error.message : 'controller_error');
  const body = Buffer.from(String(error.stack ?? error));
  if (body.length <= 4 * 1024 * 1024) fs.writeFileSync(path.join(output, 'public-install-controller-error.txt'), body, { flag: 'wx' });
  else report.errors.push('diagnostic_bound');
} finally {
  if (server) { server.stop('SIGTERM'); try { await server.promise; } catch {} }
  for (const child of active) child.stop('SIGTERM');
  if (baseline && seed && !active.size) { try { guard('terminal-source-check'); } catch { report.status = 'failed'; report.errors.push('terminal_source_guard_failed'); } }
  if (report.status === 'passed' && (report.commands.length !== 56 || report.guards.length !== 6
    || report.commands.reduce((total, row) => total + row.streams.length, 0) !== 112)) {
    report.status = 'failed'; report.errors.push('complete_pipeline_profile');
  }
  const live = report.commands.filter(row => row.pid && !absent(row.pid));
  report.cleanup = { activeChildren: active.size, remainingOriginalGroups: live.map(row => row.label),
    allStreamsComplete: report.commands.every(row => row.closeObserved && row.streams.length === 2 && row.streams.every(stream => stream.complete)), rootRemoved: false };
  if (active.size || live.length || !report.cleanup.allStreamsComplete) { report.status = 'failed'; report.errors.push('cleanup_not_proven'); }
  try {
    owner(); let retained = 0;
    for (const name of fs.readdirSync(output)) { const file = path.join(output, name), stat = fs.lstatSync(file); retained += stat.size;
      need(stat.isFile() && !stat.isSymbolicLink() && retained <= 32 * 1024 * 1024, 'packet_bound');
      fs.copyFileSync(file, path.join(packet, name), fs.constants.COPYFILE_EXCL); }
    if (!active.size && !live.length) { fs.rmSync(root, { recursive: true }); report.cleanup.rootRemoved = !fs.existsSync(root); }
  } catch { report.status = 'failed'; report.errors.push('owned_cleanup_failed'); }
  report.completedAt = new Date().toISOString();
  fs.writeFileSync(path.join(packet, 'receipt.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  const files = fs.readdirSync(packet).sort().map(name => { const body = fs.readFileSync(path.join(packet, name)); return { name, bytes: body.length, sha256: sha(body) }; });
  fs.writeFileSync(path.join(packet, 'packet-manifest.json'), JSON.stringify({ sourceCommit, workflowCommit, files }, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify({ status: report.status, commands: report.commands.length, errors: report.errors, cleanup: report.cleanup }));
if (report.status !== 'passed') process.exitCode = 1;

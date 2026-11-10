// One bounded public CI job; canonical source is read-only and runtime is owned scratch.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { primitiveConsumers } from '../tests/helpers/primitive-consumers.mjs';
const need = (value, message) => { if (!value) throw new Error(message); };
const sha = body => createHash('sha256').update(body).digest('hex');
const sourceCommit = process.argv[3], workflowCommit = process.env.GITHUB_SHA;
need(process.argv[2] === '--source-commit' && sourceCommit === process.env.SOURCE_COMMIT && /^[a-f0-9]{40}$/.test(sourceCommit ?? ''), 'source_pin_required');
need(process.env.GITHUB_REPOSITORY === 'alvarovillalbaa/mcpcn-ui' && process.env.GITHUB_REF === 'refs/heads/main'
  && process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && process.env.MCPCN_PUBLIC_REPOSITORY === 'true'
  && process.env.CI === 'true' && process.platform === 'linux' && process.version === 'v24.22.2'
  && /^[a-f0-9]{40}$/.test(workflowCommit ?? '') && workflowCommit !== sourceCommit, 'approved_public_ci_required');
const repo = fs.realpathSync(process.cwd()), runner = fs.realpathSync(process.env.RUNNER_TEMP);
const root = fs.mkdtempSync(path.join(runner, 'mcpcn-primitives-')); fs.chmodSync(root, 0o700);
const identity = fs.lstatSync(root), nonce = randomBytes(16).toString('hex');
fs.writeFileSync(path.join(root, '.owner'), nonce, { flag: 'wx', mode: 0o600 });
const packet = path.join(runner, `mcpcn-primitives-packet-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`);
fs.mkdirSync(packet, { mode: 0o700 }); fs.appendFileSync(process.env.GITHUB_ENV, `MCPCN_PRIMITIVE_PACKET=${packet}\n`);
for (const name of ['source', 'output', 'archives', 'consumers', 'tools', 'tmp', 'cache', 'config', 'data', 'state']) fs.mkdirSync(path.join(root, name), { mode: 0o700 });
for (const name of ['npm-user', 'npm-global']) fs.writeFileSync(path.join(root, name), '', { flag: 'wx', mode: 0o600 });
const source = path.join(root, 'source'), output = path.join(root, 'output'), archives = path.join(root, 'archives');
const env = { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: process.env.HOME, LANG: 'C.UTF-8', TZ: 'UTC', CI: 'true', NO_COLOR: '1', SOURCE_COMMIT: sourceCommit,
  NEXT_TELEMETRY_DISABLED: '1', TMPDIR: path.join(root, 'tmp'), TMP: path.join(root, 'tmp'), TEMP: path.join(root, 'tmp'),
  XDG_CACHE_HOME: path.join(root, 'cache'), XDG_CONFIG_HOME: path.join(root, 'config'), XDG_DATA_HOME: path.join(root, 'data'), XDG_STATE_HOME: path.join(root, 'state'),
  npm_config_cache: path.join(root, 'cache/npm'), npm_config_userconfig: path.join(root, 'npm-user'), npm_config_globalconfig: path.join(root, 'npm-global'),
  npm_config_registry: 'https://registry.npmjs.org/', npm_config_ignore_scripts: 'true', npm_config_audit: 'false', npm_config_fund: 'false',
  npm_config_fetch_retries: '0', npm_config_fetch_timeout: '15000', npm_config_update_notifier: 'false', MCPCN_PR_ROOT: root, MCPCN_PR_NONCE: nonce };
fs.mkdirSync(env.npm_config_cache, { recursive: true, mode: 0o700 });
const started = Date.now(), deadline = started + 1020000, active = new Set();
const report = { schemaVersion: 'mcpcn.primitive-keyboard-checks.v1', sourceCommit, workflowCommit, status: 'failed',
  startedAt: new Date(started).toISOString(), commands: [], guards: [], errors: [], cleanup: {},
  proofLimits: ['T2 authored frontend primitives in four selected Chromium iframe/media profiles; no SDK, external host, account, database, production service, provider or model.',
    'No physical touch, human screenreader, complete WCAG/media/device matrix, public npm or full copied-source NodeNext acceptance.'] };
let baseline, protectedSeed, server, interrupted = false;
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
  const pieces = [[], []], sizes = [0, 0], ended = [false, false]; let timer, killTimer;
  const stop = signal => {
    const now = child.pid && proc(child.pid);
    if (now && bound && now.uid === bound.uid && now.start === bound.start && now.pgid === child.pid && now.sid === child.pid) {
      process.kill(-child.pid, signal); row.signals.push(signal);
    } else if (child.pid && !absent(child.pid)) row.uncertainOwnership = true;
  };
  let handle;
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
      for (let n = 0; n < 2; n++) {
        const body = Buffer.concat(pieces[n]), name = label + (n ? '.stderr.txt' : '.stdout.txt');
        fs.writeFileSync(path.join(output, name), body, { flag: 'wx' }); row.streams.push({ name, bytes: body.length, sha256: sha(body), complete: ended[n] && !row.overflow });
      }
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
const names = git('ls-files', '-z').toString().split('\0').filter(Boolean).sort(); need(names.length <= 9700, 'source_file_count');
const exported = names.filter(name => !['docs/results/', '.github/', '.agents/', '.codex/'].some(prefix => name.startsWith(prefix)));
const registryIndex = JSON.parse(fs.readFileSync(path.join(repo, 'registry/registry.json')));
const derivedPaths = ['registry/registry.json', ...registryIndex.items.flatMap(item => ['registry/' + item.name + '.json', 'registry/items/' + item.name + '.json'])].sort();
const derived = new Set(derivedPaths); need(derived.size === 159 && registryIndex.items.length === 79, 'baseline_registry_profile');
function snapshot(base, paths, cap = 1152 * 1024 * 1024) {
  let total = 0;
  return paths.map(name => { const file = path.join(base, name), stat = fs.lstatSync(file);
    need(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 40 * 1024 * 1024, 'source_file_bound');
    total += stat.size; need(total <= cap, 'source_total_bound');
    return { path: name, bytes: stat.size, mode: stat.mode & 0o777, sha256: sha(fs.readFileSync(file)) };
  });
}
function guard(label) {
  owner(); const now = snapshot(repo, names), protectedNow = snapshot(source, exported.filter(name => !derived.has(name)));
  need(JSON.stringify(now) === JSON.stringify(baseline), 'canonical_source_changed');
  need(JSON.stringify(protectedNow) === JSON.stringify(protectedSeed), 'protected_export_changed');
  report.guards.push({ label, canonicalFiles: now.length, canonicalVectorSha256: sha(Buffer.from(JSON.stringify(now))),
    protectedFiles: protectedNow.length, protectedVectorSha256: sha(Buffer.from(JSON.stringify(protectedNow))) });
}
try {
  need(git('rev-parse', 'HEAD').toString().trim() === sourceCommit && git('status', '--porcelain').length === 0, 'exact_clean_checkout');
  need(git('rev-parse', 'HEAD^').toString().trim() === 'd2ebd10311ec4381928c35857e60884a6da337e8', 'candidate_must_follow_closed_base');
  baseline = snapshot(repo, names); let size = 0;
  for (const name of exported) {
    need(!path.isAbsolute(name) && !name.split('/').some(part => ['..', '.git'].includes(part)), 'export_path');
    const from = path.join(repo, name), to = path.join(source, name); size += fs.lstatSync(from).size;
    need(size <= 128 * 1024 * 1024, 'export_bound'); fs.mkdirSync(path.dirname(to), { recursive: true, mode: 0o700 });
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
  }
  protectedSeed = snapshot(source, exported.filter(name => !derived.has(name))); report.export = { files: exported.length, bytes: size }; guard('before-install');
  await run('primitive-tools-install', 'npm', ['install', '--prefix', path.join(root, 'tools'), '--ignore-scripts', '--no-audit', '--no-fund', 'pnpm@10.24.0', 'playwright@1.65.0'], root, 120);
  env.PATH = path.join(root, 'tools/node_modules/.bin') + ':' + path.dirname(process.execPath) + ':/usr/bin:/bin';
  await run('primitive-frozen-install', 'pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], source, 180); guard('after-install');
  for (const name of ['core', 'schemas', 'runtime', 'react', 'server', 'themes', 'registry']) await run('primitive-build-' + name, 'pnpm', ['run', 'build'], path.join(source, 'packages', name), 120);
  await run('primitive-build-playground', 'pnpm', ['run', 'build'], path.join(source, 'apps/playground'), 120);
  await run('primitive-build-cli', 'pnpm', ['run', 'build'], path.join(source, 'packages/cli'), 120);
  const primitive = fs.readFileSync(path.join(source, 'packages/react/src/primitives.tsx'), 'utf8').replaceAll('"@mcpcn/core"', '"./core"');
  const style = fs.readFileSync(path.join(source, 'packages/react/src/styles.css'), 'utf8') + '\n' + fs.readFileSync(path.join(source, 'packages/themes/src/default.css'), 'utf8');
  let changedEmbeddedFiles = 0;
  const expectedItems = registryIndex.items.map(item => {
    need(item.files.length === (item.type === 'registry:block' ? 53 : 40), 'per_item_file_profile');
    const expected = structuredClone(item);
    for (const [suffix, content] of [['_mcpcn/primitives.tsx', primitive], ['styles.css', style]]) {
      const selected = expected.files.filter(file => file.path === 'components/mcpcn/' + suffix);
      need(selected.length === 1 && selected[0].content !== content, 'owned_embedded_file_change');
      selected[0].content = content; changedEmbeddedFiles++;
    }
    const raw = Buffer.from(JSON.stringify(expected, null, 2) + '\n');
    need(raw.equals(fs.readFileSync(path.join(source, 'registry', item.name + '.json')))
      && raw.equals(fs.readFileSync(path.join(source, 'registry/items', item.name + '.json'))), 'only_owned_item_changes');
    return expected;
  });
  need(Buffer.from(JSON.stringify({ ...registryIndex, items: expectedItems }, null, 2) + '\n').equals(fs.readFileSync(path.join(source, 'registry/registry.json'))), 'only_owned_index_changes');
  need(new Set(expectedItems.flatMap(item => item.files.map(file => file.path))).size === 171 && changedEmbeddedFiles === 158, 'source_identity_profile');
  report.registry = { identities: 79, derivedPaths: 159, changedEmbeddedFiles: 158, unionPaths: 171, unchangedAllOtherFields: true }; guard('after-builds');
  const consumers = await primitiveConsumers({ root, source, output, archives, sourceCommit, run }); report.consumers = consumers.report; guard('after-consumers');
  await run('primitive-chromium-install', path.join(root, 'tools/node_modules/.bin/playwright'), ['install', 'chromium'], source, 120);
  env.MCPCN_PR_PLAYWRIGHT = path.join(root, 'tools/node_modules/playwright'); report.browser = [];
  for (const consumer of consumers.consumers) {
    env.MCPCN_PR_MODE = consumer.mode; const port = consumer.mode === 'package' ? '4319' : '4320';
    server = launch('primitive-' + consumer.mode + '-server', process.execPath,
      [path.join(consumer.cwd, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', port, '--strictPort'], consumer.cwd, 180);
    let ready = false;
    for (let n = 0; n < 100 && !ready; n++) {
      need(!server.row.closeObserved, 'preview_stopped_before_ready');
      try { const response = await fetch('http://127.0.0.1:' + port + '/source-binding.json', { signal: AbortSignal.timeout(1000) });
        if (response.status === 200) { const body = await response.json(); ready = body.sourceCommit === sourceCommit && body.mode === consumer.mode; }
      } catch (error) { if (error.name !== 'TimeoutError' && !(error instanceof TypeError)) throw error; }
      if (!ready) await new Promise(done => setTimeout(done, 100));
    }
    need(ready, 'preview_not_ready');
    await run('primitive-' + consumer.mode + '-browser', process.execPath, ['tests/e2e/primitive-keyboard.mjs'], source, 150);
    const observed = JSON.parse(fs.readFileSync(path.join(output, 'primitive-' + consumer.mode + '-browser.json')));
    need(observed.passed && observed.browserClosed && observed.cases.length === 2 && observed.cases.every(row => row.passed && row.contextClosed && row.stages.length === 8), 'browser_profile');
    report.browser.push(...observed.cases.map(row => ({ id: row.id, stages: row.stages, contextClosed: row.contextClosed, passed: row.passed })));
    server.stop('SIGTERM'); const closed = await server.promise;
    need(closed.row.originalGroupAbsent && closed.row.signals.includes('SIGTERM') && !closed.row.timedOut
      && ((closed.code === null && closed.signal === 'SIGTERM') || (closed.code === 143 && closed.signal === null)), 'explicit_preview_shutdown');
    server = undefined; guard('after-browser-' + consumer.mode);
  }
  need(report.browser.length === 4 && report.browser.reduce((n, row) => n + row.stages.length, 0) === 32
    && report.browser.reduce((n, row) => n + row.stages.filter(stage => stage.png).length, 0) === 8, 'complete_browser_scope');
  const rows = snapshot(source, derivedPaths, 192 * 1024 * 1024);
  fs.writeFileSync(path.join(output, 'primitive-derived-manifest.json'), JSON.stringify({ sourceCommit, workflowCommit, files: rows }, null, 2) + '\n', { flag: 'wx' });
  await run('primitive-derived-archive', 'tar', ['--sort=name', '--mtime=2026-11-10T00:00:00Z', '--owner=0', '--group=0', '--numeric-owner',
    '-czf', path.join(output, 'primitive-derived-files.tgz'), '-C', source, ...derivedPaths], root, 90);
  need(fs.statSync(path.join(output, 'primitive-derived-files.tgz')).size <= 48 * 1024 * 1024, 'derived_compressed_bound');
  report.derived = { paths: 159, archiveSha256: sha(fs.readFileSync(path.join(output, 'primitive-derived-files.tgz'))) };
  guard('after-complete-packet'); report.status = 'passed';
} catch (error) {
  report.errors.push(/^[a-zA-Z0-9_-]+$/.test(error.message ?? '') ? error.message : 'controller_error');
  const body = Buffer.from(String(error.stack ?? error));
  if (body.length <= 4 * 1024 * 1024) fs.writeFileSync(path.join(output, 'primitive-controller-error.txt'), body, { flag: 'wx' });
  else report.errors.push('diagnostic_bound');
} finally {
  if (server) { server.stop('SIGTERM'); try { await server.promise; } catch {} }
  for (const child of active) child.stop('SIGTERM');
  if (baseline && protectedSeed && !active.size) { try { guard('terminal-source-check'); } catch { report.status = 'failed'; report.errors.push('terminal_source_guard_failed'); } }
  const live = report.commands.filter(row => row.pid && !absent(row.pid));
  report.cleanup = { activeChildren: active.size, remainingOriginalGroups: live.map(row => row.label),
    allStreamsComplete: report.commands.every(row => row.closeObserved && row.streams.length === 2 && row.streams.every(stream => stream.complete)), rootRemoved: false };
  if (active.size || live.length || !report.cleanup.allStreamsComplete) { report.status = 'failed'; report.errors.push('cleanup_not_proven'); }
  try {
    owner(); let retained = 0;
    for (const name of fs.readdirSync(output)) {
      const file = path.join(output, name), stat = fs.lstatSync(file); retained += stat.size;
      need(stat.isFile() && !stat.isSymbolicLink() && retained <= 80 * 1024 * 1024, 'packet_bound');
      fs.copyFileSync(file, path.join(packet, name), fs.constants.COPYFILE_EXCL);
    }
    if (!active.size && !live.length) { fs.rmSync(root, { recursive: true }); report.cleanup.rootRemoved = !fs.existsSync(root); }
  } catch { report.status = 'failed'; report.errors.push('owned_cleanup_failed'); }
  report.completedAt = new Date().toISOString();
  fs.writeFileSync(path.join(packet, 'receipt.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  const files = fs.readdirSync(packet).sort().map(name => { const body = fs.readFileSync(path.join(packet, name)); return { name, bytes: body.length, sha256: sha(body) }; });
  fs.writeFileSync(path.join(packet, 'packet-manifest.json'), JSON.stringify({ sourceCommit, workflowCommit, files }, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify({ status: report.status, commands: report.commands.length, errors: report.errors, cleanup: report.cleanup }));
if (report.status !== 'passed') process.exitCode = 1;

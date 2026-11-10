// CI-only T2 checks; the canonical checkout is read-only and scratch is owned.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const need = (value, message) => { if (!value) throw new Error(message); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceCommit = process.argv[3], workflowCommit = process.env.GITHUB_SHA;
need(process.argv[2] === '--source-commit' && /^[a-f0-9]{40}$/.test(sourceCommit ?? '') && sourceCommit === process.env.SOURCE_COMMIT, 'source_pin_required');
need(process.env.GITHUB_REPOSITORY === 'alvarovillalbaa/mcpcn-ui' && process.env.GITHUB_REF === 'refs/heads/main' && process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && process.env.MCPCN_PUBLIC_REPOSITORY === 'true' && process.env.CI === 'true' && process.platform === 'linux' && process.version === 'v24.22.2' && /^[a-f0-9]{40}$/.test(workflowCommit ?? '') && workflowCommit !== sourceCommit, 'approved_public_ci_required');
const repo = fs.realpathSync(process.cwd()), runner = fs.realpathSync(process.env.RUNNER_TEMP);
const root = fs.mkdtempSync(path.join(runner, 'mcpcn-host-state-')); fs.chmodSync(root, 0o700);
const identity = fs.lstatSync(root), nonce = randomBytes(16).toString('hex');
fs.writeFileSync(path.join(root, '.owner'), nonce, { flag: 'wx', mode: 0o600 });
const packet = path.join(runner, `mcpcn-host-state-packet-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`);
fs.mkdirSync(packet, { mode: 0o700 });
fs.appendFileSync(process.env.GITHUB_ENV, `MCPCN_HOST_PACKET=${packet}\n`);
for (const name of ['source', 'archives', 'output', 'consumers', 'tools', 'tmp', 'cache', 'config', 'data', 'state']) fs.mkdirSync(path.join(root, name), { mode: 0o700 });
for (const name of ['npm-user', 'npm-global']) fs.writeFileSync(path.join(root, name), '', { flag: 'wx', mode: 0o600 });
const source = path.join(root, 'source'), output = path.join(root, 'output'), archives = path.join(root, 'archives');
const env = { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: process.env.HOME, LANG: 'C.UTF-8', TZ: 'UTC', CI: 'true', NO_COLOR: '1',
  SOURCE_COMMIT: sourceCommit, NEXT_TELEMETRY_DISABLED: '1', TMPDIR: path.join(root, 'tmp'), TMP: path.join(root, 'tmp'), TEMP: path.join(root, 'tmp'),
  XDG_CACHE_HOME: path.join(root, 'cache'), XDG_CONFIG_HOME: path.join(root, 'config'), XDG_DATA_HOME: path.join(root, 'data'), XDG_STATE_HOME: path.join(root, 'state'),
  npm_config_cache: path.join(root, 'cache/npm'), npm_config_userconfig: path.join(root, 'npm-user'), npm_config_globalconfig: path.join(root, 'npm-global'),
  npm_config_registry: 'https://registry.npmjs.org/', npm_config_ignore_scripts: 'true', npm_config_audit: 'false', npm_config_fund: 'false', npm_config_fetch_retries: '0', npm_config_fetch_timeout: '15000', npm_config_update_notifier: 'false',
  MCPCN_HS_RUN_ROOT: root, MCPCN_HS_NONCE: nonce, MCPCN_HS_SOURCE_ROOT: source, MCPCN_HS_OUTPUT: output, MCPCN_HS_ARCHIVES: archives, MCPCN_HS_WORK: path.join(root, 'consumers') };
for (const name of ['npm_config_cache']) fs.mkdirSync(env[name], { recursive: true, mode: 0o700 });
const start = Date.now(), deadline = start + 1020000;
const report = { schemaVersion: 'mcpcn.host-state-checks.v3', sourceCommit, workflowCommit, status: 'failed', startedAt: new Date(start).toISOString(), commands: [], guards: [], errors: [], cleanup: {}, proofLimits: ['T2 authored reports and loopback browser/installed archive consumers only. No live billing, session, access, host, connectivity, provider or MCP acceptance.', 'Eight fixture and six current-payload installation regressions are separate from 88 component checks. Previous component packets are not replayed.'] };
const active = new Set(); let baseline, protectedSeed, server, interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { interrupted = true; for (const child of active) child.stop('SIGTERM'); });
function owner() { const now = fs.lstatSync(root); need(now.dev === identity.dev && now.ino === identity.ino && now.uid === process.getuid() && !now.isSymbolicLink() && fs.readFileSync(path.join(root, '.owner'), 'utf8') === nonce, 'owned_root_changed'); }
function proc(pid) { try { const raw = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'), p = raw.slice(raw.lastIndexOf(')') + 2).split(' '); return { pid, uid: fs.statSync(`/proc/${pid}`).uid, pgid: Number(p[2]), sid: Number(p[3]), start: p[19] }; } catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) return null; throw error; } }
function groupAbsent(pid) { try { process.kill(-pid, 0); return false; } catch (error) { return error.code === 'ESRCH'; } }
function launch(label, command, args, cwd = source, seconds = 120) {
  owner(); need(!interrupted && Date.now() + 15000 < deadline, 'work_deadline_or_interruption');
  const row = { label, command, args, startedAt: new Date().toISOString(), streams: [], signals: [] }; report.commands.push(row);
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const bound = child.pid ? proc(child.pid) : null; row.pid = child.pid; row.identity = bound;
  const pieces = [[], []], sizes = [0, 0], ended = [false, false]; let timer, killTimer;
  const stop = signal => { const now = child.pid && proc(child.pid); if (now && bound && now.uid === bound.uid && now.start === bound.start && now.pgid === child.pid && now.sid === child.pid) { process.kill(-child.pid, signal); row.signals.push(signal); } else if (child.pid && !groupAbsent(child.pid)) row.uncertainOwnership = true; };
  const promise = new Promise((resolve, reject) => {
    child.once('error', error => { row.spawnError = error.code ?? 'spawn_error'; });
    [child.stdout, child.stderr].forEach((stream, index) => { stream.on('data', bytes => { sizes[index] += bytes.length; if (sizes[index] <= 4 * 1024 * 1024) pieces[index].push(bytes); else { row.overflow = true; stop('SIGTERM'); } }); stream.once('end', () => { ended[index] = true; }); });
    child.once('close', async (code, signal) => {
      clearTimeout(timer); clearTimeout(killTimer); active.delete(handle);
      row.exitCode = code; row.signal = signal; row.closeObserved = true; row.completedAt = new Date().toISOString();
      for (let attempt = 0; child.pid && !groupAbsent(child.pid) && attempt < 20; attempt++) await new Promise(done => setTimeout(done, 50));
      row.originalGroupAbsent = !child.pid || groupAbsent(child.pid);
      for (let index = 0; index < 2; index++) { const body = Buffer.concat(pieces[index]), name = `${label}.${index ? 'stderr' : 'stdout'}.txt`; fs.writeFileSync(path.join(output, name), body, { flag: 'wx', mode: 0o600 }); row.streams.push({ name, bytes: body.length, sha256: sha(body), complete: ended[index] && !row.overflow }); }
      if (row.spawnError || row.overflow || !row.originalGroupAbsent || !ended.every(Boolean)) reject(new Error('command_or_stream_closure_failed'));
      else resolve({ row, stdout: Buffer.concat(pieces[0]), code, signal });
    });
    timer = setTimeout(() => { row.timedOut = true; stop('SIGTERM'); killTimer = setTimeout(() => stop('SIGKILL'), 5000); }, Math.min(seconds * 1000, Math.max(1000, deadline - Date.now() - 10000)));
  });
  // Services may close before their later awaited teardown; attach a rejection observer now.
  promise.catch(() => undefined);
  const handle = { child, row, promise, stop }; active.add(handle); return handle;
}
async function run(label, command, args, cwd = source, seconds = 120) { const result = await launch(label, command, args, cwd, seconds).promise; need(result.code === 0 && result.signal === null && !result.row.timedOut, `${label}_failed`); return result.stdout; }
function snapshot(base, names) { let total = 0; return names.map(name => { const file = path.join(base, name), stat = fs.lstatSync(file); need(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 40 * 1024 * 1024, 'source_file_bound'); total += stat.size; need(total <= 1024 * 1024 * 1024, 'source_total_bound'); const bytes = fs.readFileSync(file); return { path: name, mode: stat.mode & 0o777, bytes: bytes.length, sha256: sha(bytes) }; }); }
const generated = name => name.startsWith('registry/') || /^packages\/(core|schemas|runtime|react|themes|registry|cli)\/LICENSE$/.test(name);
const git = (...args) => execFileSync('git', args, { cwd: repo, env: { ...env, GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 2 * 1024 * 1024, timeout: 30000 });
const names = git('ls-files', '-z').toString().split('\0').filter(Boolean).sort(); need(names.length <= 6000, 'source_file_count');
const exported = names.filter(name => !name.startsWith('docs/results/') && !name.startsWith('.agents/') && !name.startsWith('.github/') && !name.startsWith('.codex/'));
function guard(label) { owner(); const current = snapshot(repo, names); need(JSON.stringify(current) === JSON.stringify(baseline), 'canonical_checkout_changed'); const protectedNow = snapshot(source, exported.filter(name => !generated(name))); need(JSON.stringify(protectedNow) === JSON.stringify(protectedSeed), 'protected_export_changed'); report.guards.push({ label, canonicalFiles: current.length, canonicalVectorSha256: sha(Buffer.from(JSON.stringify(current))), protectedFiles: protectedNow.length, protectedVectorSha256: sha(Buffer.from(JSON.stringify(protectedNow))) }); }
try {
  need(git('rev-parse', 'HEAD').toString().trim() === sourceCommit && git('status', '--porcelain').length === 0, 'checkout_not_exact_clean');
  need(git('rev-parse', 'HEAD^').toString().trim() === 'a493df6fe961dbdd3e70f120b2e5bb8d1755bb36', 'candidate_must_follow_closed_base');
  baseline = snapshot(repo, names); let bytes = 0;
  for (const name of exported) { need(!path.isAbsolute(name) && !name.split('/').some(part => ['..', '.git'].includes(part)), 'export_path_invalid'); const from = path.join(repo, name), to = path.join(source, name); bytes += fs.lstatSync(from).size; need(bytes <= 100663296, 'seed_export_bound'); fs.mkdirSync(path.dirname(to), { recursive: true, mode: 0o700 }); fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL); }
  protectedSeed = snapshot(source, exported.filter(name => !generated(name))); report.export = { files: exported.length, bytes }; guard('before-install');
  await run('tools-install', 'npm', ['install', '--prefix', path.join(root, 'tools'), '--ignore-scripts', '--no-audit', '--no-fund', 'pnpm@10.24.0', 'playwright@1.65.0'], root, 120);
  env.PATH = `${path.join(root, 'tools/node_modules/.bin')}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
  await run('workspace-install', 'pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], source, 180); guard('after-install');
  const packages = ['core', 'schemas', 'runtime', 'react', 'themes', 'registry', 'cli'];
  for (const name of packages.filter(name => name !== 'cli')) await run(`build-${name}`, 'pnpm', ['--filter', `@mcpcn/${name}`, 'build']);
  await run('generate-first', 'pnpm', ['generate']); const first = snapshot(source, exported.filter(generated));
  await run('generate-second', 'pnpm', ['generate']); const second = snapshot(source, exported.filter(generated));
  need(JSON.stringify(second) === JSON.stringify(first), 'generation_not_deterministic'); report.generatedSnapshots = [first, second]; guard('after-generation');
  const unitFiles = ['packages/schemas/src/host-state-schemas.test.ts', 'packages/react/src/host-state-components.test.tsx', 'packages/registry/src/host-state-source.test.ts', 'apps/playground/src/host-state-fixtures.test.ts', 'apps/docs/components/host-state-demos.test.tsx', 'apps/playground/src/fixtures.test.ts', 'packages/cli/src/host-state-installation.test.ts'];
  await run('focused-units', 'pnpm', ['exec', 'vitest', 'run', ...unitFiles, '--reporter=json', `--outputFile=${path.join(output, 'units.json')}`]);
  const units = JSON.parse(fs.readFileSync(path.join(output, 'units.json'))); need(units.success && units.numPassedTests === 102 && units.numFailedTests === 0 && units.numPendingTests === 0, 'unit_profile_mismatch'); report.units = { total: 102, new: 88, fixtureRegressions: 8, installationRegressions: 6 };
  await run('playground-typecheck', 'pnpm', ['--filter', '@mcpcn/playground', 'typecheck']);
  await run('playground-build', 'pnpm', ['--filter', '@mcpcn/playground', 'build']);
  await run('build-cli', 'pnpm', ['--filter', 'mcpcn', 'build']);
  await run('docs-build', 'pnpm', ['--filter', '@mcpcn/docs', 'build'], source, 180); guard('after-builds');
  const archiveRows = [];
  for (const name of packages) {
    const directory = path.join(source, 'packages', name), pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json')));
    need(pkg.name === (name === 'cli' ? 'mcpcn' : `@mcpcn/${name}`), 'archive_package_name');
    await run(`pack-${name}`, 'pnpm', ['--dir', directory, 'pack', '--pack-destination', archives]);
    const filename = `${pkg.name.replace(/^@/, '').replaceAll('/', '-')}-${pkg.version}.tgz`, file = path.join(archives, filename), body = fs.readFileSync(file);
    const packed = JSON.parse(await run(`inspect-pack-${name}`, 'tar', ['-xOzf', file, 'package/package.json']));
    need(packed.name === pkg.name && packed.version === pkg.version && !JSON.stringify(packed).includes('workspace:'), 'archive_workspace_protocol_not_resolved');
    need(JSON.stringify(packed.exports ?? null) === JSON.stringify(pkg.exports ?? null) && JSON.stringify(packed.bin ?? null) === JSON.stringify(pkg.bin ?? null), 'archive_exports_or_bins_changed');
    archiveRows.push({ name: pkg.name, version: pkg.version, filename, bytes: body.length, sha256: sha(body), integrity: 'sha512-' + createHash('sha512').update(body).digest('base64') });
    fs.copyFileSync(file, path.join(output, filename), fs.constants.COPYFILE_EXCL);
  }
  fs.writeFileSync(path.join(output, 'archive-manifest.json'), JSON.stringify({ schemaVersion: 1, sourceCommit, archives: archiveRows })); env.MCPCN_HS_ARCHIVE_MANIFEST = path.join(output, 'archive-manifest.json');
  await run('installed-consumers', process.execPath, [path.join(source, 'tooling/host-state-installed-consumer.mjs')], source, 310);
  const consumers = JSON.parse(fs.readFileSync(path.join(output, 'consumers.json'))); need(consumers.passed && consumers.cases.length === 2, 'consumer_profile_failed'); report.consumers = consumers.cases.map(row => ({ id: row.id, status: row.status, writtenFiles: row.observations.files.length, renderedSurfaces: row.observations.installedProbe.rendered.length }));
  await run('chromium-install', path.join(root, 'tools/node_modules/.bin/playwright'), ['install', 'chromium'], source, 120);
  env.MCPCN_HS_BROWSER_TOOLS = path.join(root, 'tools/node_modules/playwright'); env.MCPCN_HS_ORIGIN = 'http://127.0.0.1:4387';
  const next = path.join(source, 'apps/docs/node_modules/next/dist/bin/next'); server = launch('docs-server', process.execPath, [next, 'start', '--hostname', '127.0.0.1', '--port', '4387'], path.join(source, 'apps/docs'), 240);
  for (let attempt = 0; ; attempt++) { try { const response = await fetch(env.MCPCN_HS_ORIGIN, { signal: AbortSignal.timeout(1000) }); if (response.ok) break; } catch {} need(attempt < 60 && !server.row.closeObserved, 'docs_server_not_ready'); await new Promise(done => setTimeout(done, 250)); }
  await run('host-state-browser', process.execPath, [path.join(source, 'tooling/host-state-browser.spec.mjs')], source, 240);
  const browser = JSON.parse(fs.readFileSync(path.join(output, 'browser.json'))); need(browser.passed && browser.cases.length === 14, 'browser_profile_failed'); report.browser = browser;
  server.stop('SIGTERM'); await server.promise; server = undefined; guard('after-acceptance');
  const files = first.map(row => ({ ...row, contentBase64: fs.readFileSync(path.join(source, row.path)).toString('base64') })); need(files.length === 167, 'generated_path_set');
  const bundle = Buffer.from(JSON.stringify({ schemaVersion: 'mcpcn.host-state-generated.v1', sourceCommit, workflowCommit, files })), packed = gzipSync(bundle, { level: 9 }); report.generated = { files: files.length, bytes: bundle.length, sha256: sha(bundle), gzipBytes: packed.length, gzipSha256: sha(packed), deterministic: true }; need(bundle.length <= 160 * 1024 * 1024 && packed.length <= 40 * 1024 * 1024, 'generated_bundle_bound'); fs.writeFileSync(path.join(output, 'generated-files.json.gz'), packed);
  report.status = 'passed';
} catch (error) { report.errors.push(/^[a-z0-9_-]+$/.test(error.message ?? '') ? error.message : 'controller_error'); }
finally {
  if (server) { server.stop('SIGTERM'); try { await server.promise; } catch {} }
  for (const child of active) child.stop('SIGTERM');
  if (baseline && protectedSeed && !active.size) {
    try { guard('terminal-source-check'); }
    catch { report.status = 'failed'; report.errors.push('terminal_source_guard_failed'); }
  }
  const live = report.commands.filter(row => row.pid && !groupAbsent(row.pid)); report.cleanup = { activeChildren: active.size, remainingOriginalGroups: live.map(row => row.label), allStreamsComplete: report.commands.every(row => row.closeObserved && row.streams.length === 2 && row.streams.every(stream => stream.complete)), rootRemoved: false };
  if (active.size || live.length || !report.cleanup.allStreamsComplete) { report.status = 'failed'; report.errors.push('cleanup_not_proven'); }
  try { owner(); for (const name of fs.readdirSync(output)) { const file = path.join(output, name), stat = fs.lstatSync(file); need(stat.isFile() && !stat.isSymbolicLink(), 'output_not_regular'); fs.copyFileSync(file, path.join(packet, name), fs.constants.COPYFILE_EXCL); } if (!active.size && !live.length) { fs.rmSync(root, { recursive: true }); report.cleanup.rootRemoved = !fs.existsSync(root); } } catch { report.status = 'failed'; report.errors.push('retention_or_removal_failed'); }
  report.completedAt = new Date().toISOString(); fs.writeFileSync(path.join(packet, 'receipt.json'), JSON.stringify(report, null, 2));
  const rows = fs.readdirSync(packet).sort().map(name => { const bytes = fs.readFileSync(path.join(packet, name)); return { name, bytes: bytes.length, sha256: sha(bytes) }; }); fs.writeFileSync(path.join(packet, 'packet-manifest.json'), JSON.stringify({ sourceCommit, workflowCommit, files: rows }, null, 2));
  console.log(JSON.stringify({ status: report.status, sourceCommit, workflowCommit, errors: report.errors, units: report.units, consumers: report.consumers, browserCases: report.browser?.cases.length, cleanup: report.cleanup })); process.exitCode = report.status === 'passed' ? 0 : 1;
}

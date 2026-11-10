// CI-only T2 checks; the canonical checkout is read-only and scratch is owned.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { checkServerConsumers } from './server-installed-consumer.mjs';

const need = (value, message) => { if (!value) throw new Error(message); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceCommit = process.argv[3], workflowCommit = process.env.GITHUB_SHA;
need(process.argv[2] === '--source-commit' && /^[a-f0-9]{40}$/.test(sourceCommit ?? '') && sourceCommit === process.env.SOURCE_COMMIT, 'source_pin_required');
need(process.env.GITHUB_REPOSITORY === 'alvarovillalbaa/mcpcn-ui' && process.env.GITHUB_REF === 'refs/heads/main' && process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && process.env.MCPCN_PUBLIC_REPOSITORY === 'true' && process.env.CI === 'true' && process.platform === 'linux' && process.version === 'v24.22.2' && /^[a-f0-9]{40}$/.test(workflowCommit ?? '') && workflowCommit !== sourceCommit, 'approved_public_ci_required');
const repo = fs.realpathSync(process.cwd()), runner = fs.realpathSync(process.env.RUNNER_TEMP);
const root = fs.mkdtempSync(path.join(runner, 'mcpcn-server-contract-')); fs.chmodSync(root, 0o700);
const identity = fs.lstatSync(root), nonce = randomBytes(16).toString('hex');
fs.writeFileSync(path.join(root, '.owner'), nonce, { flag: 'wx', mode: 0o600 });
const packet = path.join(runner, `mcpcn-server-contract-packet-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`);
fs.mkdirSync(packet, { mode: 0o700 });
fs.appendFileSync(process.env.GITHUB_ENV, `MCPCN_SERVER_PACKET=${packet}\n`);
for (const name of ['source', 'archives', 'output', 'consumers', 'tools', 'tmp', 'cache', 'config', 'data', 'state']) fs.mkdirSync(path.join(root, name), { mode: 0o700 });
for (const name of ['npm-user', 'npm-global']) fs.writeFileSync(path.join(root, name), '', { flag: 'wx', mode: 0o600 });
const source = path.join(root, 'source'), output = path.join(root, 'output'), archives = path.join(root, 'archives');
const env = { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: process.env.HOME, LANG: 'C.UTF-8', TZ: 'UTC', CI: 'true', NO_COLOR: '1',
  SOURCE_COMMIT: sourceCommit, NEXT_TELEMETRY_DISABLED: '1', TMPDIR: path.join(root, 'tmp'), TMP: path.join(root, 'tmp'), TEMP: path.join(root, 'tmp'),
  XDG_CACHE_HOME: path.join(root, 'cache'), XDG_CONFIG_HOME: path.join(root, 'config'), XDG_DATA_HOME: path.join(root, 'data'), XDG_STATE_HOME: path.join(root, 'state'),
  npm_config_cache: path.join(root, 'cache/npm'), npm_config_userconfig: path.join(root, 'npm-user'), npm_config_globalconfig: path.join(root, 'npm-global'),
  npm_config_registry: 'https://registry.npmjs.org/', npm_config_ignore_scripts: 'true', npm_config_audit: 'false', npm_config_fund: 'false', npm_config_fetch_retries: '0', npm_config_fetch_timeout: '15000', npm_config_update_notifier: 'false',
  MCPCN_SV_RUN_ROOT: root, MCPCN_SV_NONCE: nonce, MCPCN_SV_SOURCE_ROOT: source, MCPCN_SV_OUTPUT: output, MCPCN_SV_ARCHIVES: archives, MCPCN_SV_WORK: path.join(root, 'consumers') };
for (const name of ['npm_config_cache']) fs.mkdirSync(env[name], { recursive: true, mode: 0o700 });
const start = Date.now(), deadline = start + 1020000;
const report = { schemaVersion: 'mcpcn.server-contract-checks.v1', sourceCommit, workflowCommit, status: 'failed', startedAt: new Date(start).toISOString(), commands: [], guards: [], errors: [], cleanup: {}, proofLimits: ['T2 authored unit/real in-memory MCP protocol, source guide and CI clipboard checks only. No external host, network listener, account/provider/model or production operation.', 'Two fresh installed server profiles use Bundler/NodeNext with skipLibCheck=false. Browser runtime NodeNext, public npm and full-product acceptance remain separate.'] };
const active = new Set(); let baseline, protectedSeed, server, derivedLockSha, interrupted = false;
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
const generated = name => name === 'pnpm-lock.yaml' || name.startsWith('registry/') || /^packages\/(core|schemas|runtime|react|themes|registry|cli|server)\/LICENSE$/.test(name);
const git = (...args) => execFileSync('git', args, { cwd: repo, env: { ...env, GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 2 * 1024 * 1024, timeout: 30000 });
const names = git('ls-files', '-z').toString().split('\0').filter(Boolean).sort(); need(names.length <= 7500, 'source_file_count');
const exported = names.filter(name => !name.startsWith('docs/results/') && !name.startsWith('.agents/') && !name.startsWith('.github/') && !name.startsWith('.codex/'));
function guard(label) { owner(); const current = snapshot(repo, names); need(JSON.stringify(current) === JSON.stringify(baseline), 'canonical_checkout_changed'); if (derivedLockSha) need(sha(fs.readFileSync(path.join(source, 'pnpm-lock.yaml'))) === derivedLockSha, 'derived_lock_changed'); const protectedNow = snapshot(source, exported.filter(name => !generated(name))); need(JSON.stringify(protectedNow) === JSON.stringify(protectedSeed), 'protected_export_changed'); report.guards.push({ label, canonicalFiles: current.length, canonicalVectorSha256: sha(Buffer.from(JSON.stringify(current))), protectedFiles: protectedNow.length, protectedVectorSha256: sha(Buffer.from(JSON.stringify(protectedNow))) }); }
try {
  need(git('rev-parse', 'HEAD').toString().trim() === sourceCommit && git('status', '--porcelain').length === 0, 'checkout_not_exact_clean');
  need(git('rev-parse', 'HEAD^').toString().trim() === '8405fd3c630cb5d63d6a92c48069af11ce56d6d5', 'candidate_must_follow_closed_base');
  baseline = snapshot(repo, names); let bytes = 0;
  for (const name of exported) { need(!path.isAbsolute(name) && !name.split('/').some(part => ['..', '.git'].includes(part)), 'export_path_invalid'); const from = path.join(repo, name), to = path.join(source, name); bytes += fs.lstatSync(from).size; need(bytes <= 128 * 1024 * 1024, 'seed_export_bound'); fs.mkdirSync(path.dirname(to), { recursive: true, mode: 0o700 }); fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL); }
  protectedSeed = snapshot(source, exported.filter(name => !generated(name))); report.export = { files: exported.length, bytes }; guard('before-install');
  const registryNames = exported.filter(name => name.startsWith('registry/')), registryBefore = snapshot(source, registryNames);
  need(registryNames.length === 160, 'registry_path_set');
  await run('tools-install', 'npm', ['install', '--prefix', path.join(root, 'tools'), '--ignore-scripts', '--no-audit', '--no-fund', 'pnpm@10.24.0', 'playwright@1.65.0'], root, 120);
  env.PATH = `${path.join(root, 'tools/node_modules/.bin')}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
  const lockFile = path.join(source, 'pnpm-lock.yaml'), lockBefore = fs.readFileSync(lockFile), oldSpecifier = "        specifier: '>=1.29.0'\n", newSpecifier = "        specifier: '>=1.29.0 <2'\n";
  need(lockBefore.toString().split(oldSpecifier).length === 2 && !lockBefore.includes(Buffer.from(newSpecifier)), 'original_peer_lock_identity');
  await run('derive-lock-metadata', 'pnpm', ['install', '--lockfile-only', '--ignore-scripts', '--prefer-offline'], source, 120);
  const derivedLock = fs.readFileSync(lockFile); need(derivedLock.equals(Buffer.from(lockBefore.toString().replace(oldSpecifier, newSpecifier))), 'unexpected_lock_resolution_change'); derivedLockSha = sha(derivedLock);
  report.lockDerivation = { beforeBytes: lockBefore.length, beforeSha256: sha(lockBefore), bytes: derivedLock.length, sha256: derivedLockSha, onlySDKPeerSpecifierChanged: true, allResolvedVersionsAndIntegritiesUnchanged: true };
  fs.writeFileSync(path.join(output, 'derived-pnpm-lock.yaml'), derivedLock, { flag: 'wx', mode: 0o600 }); guard('after-lock-derivation');
  await run('workspace-install', 'pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], source, 180); guard('after-install');
  const packages = ['core', 'schemas', 'runtime', 'react', 'themes', 'registry', 'server', 'cli'];
  for (const name of packages.filter(name => name !== 'cli')) await run(`build-${name}`, 'pnpm', ['--filter', `@mcpcn/${name}`, 'build']);
  const generatedNames = [...exported.filter(name => generated(name) && name !== 'pnpm-lock.yaml'), 'packages/server/LICENSE'].sort(); need(generatedNames.length === 168 && new Set(generatedNames).size === 168, 'generated_path_set');
  await run('generate-first', 'pnpm', ['generate']); const first = snapshot(source, generatedNames);
  await run('generate-second', 'pnpm', ['generate']); const second = snapshot(source, generatedNames);
  need(JSON.stringify(second) === JSON.stringify(first) && JSON.stringify(snapshot(source, registryNames)) === JSON.stringify(registryBefore), 'existing_registry_or_generation_changed'); report.generatedSnapshots = [first, second]; report.registryUnchanged = { paths: 160, vectorSha256: sha(Buffer.from(JSON.stringify(registryBefore))), copiedOwners: 36, itemIdentities: 79 }; guard('after-generation');
  const unitFiles = ['packages/server/src/result-contract.test.ts', 'packages/server/src/registration-contract.test.ts', 'packages/server/src/server-protocol.test.ts', 'packages/server/src/index.test.ts', 'apps/playground/src/server-snippet.test.ts', 'apps/docs/content/server-guide.test.tsx'];
  await run('focused-units', 'pnpm', ['exec', 'vitest', 'run', ...unitFiles, '--reporter=json', `--outputFile=${path.join(output, 'units.json')}`]);
  const units = JSON.parse(fs.readFileSync(path.join(output, 'units.json'))); need(units.success && units.numPassedTests === 78 && units.numFailedTests === 0 && units.numPendingTests === 0, 'unit_profile_mismatch'); report.units = { total: 78, newUnit: 64, realSDKProtocol: 12, legacyRegressions: 2 };
  const protocol = JSON.parse(fs.readFileSync(path.join(output, 'server-protocol.json'))); need(protocol.passed && protocol.cases.length === 12 && protocol.cases.every(row => row.clientClosed && row.serverClosed), 'real_protocol_profile'); report.protocol = { cases: 12, transcripts: true, allSessionsClosed: true };
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
    if (name === 'server') { const license = await run('inspect-server-license', 'tar', ['-xOzf', file, 'package/LICENSE']); need(license.equals(fs.readFileSync(path.join(source, 'LICENSE'))) && packed.peerDependencies['@modelcontextprotocol/sdk'] === '>=1.29.0 <2', 'server_license_or_peer_invalid'); }
    archiveRows.push({ name: pkg.name, version: pkg.version, filename, bytes: body.length, sha256: sha(body), integrity: 'sha512-' + createHash('sha512').update(body).digest('base64') }); fs.copyFileSync(file, path.join(output, filename), fs.constants.COPYFILE_EXCL);
  }
  fs.writeFileSync(path.join(output, 'archive-manifest.json'), JSON.stringify({ schemaVersion: 1, sourceCommit, archives: archiveRows }), { flag: 'wx', mode: 0o600 });
  await run('chromium-install', path.join(root, 'tools/node_modules/.bin/playwright'), ['install', 'chromium'], source, 120);
  env.MCPCN_SV_BROWSER_TOOLS = path.join(root, 'tools/node_modules/playwright'); env.MCPCN_SV_ORIGIN = 'http://127.0.0.1:4387';
  const next = path.join(source, 'apps/docs/node_modules/next/dist/bin/next'); server = launch('docs-server', process.execPath, [next, 'start', '--hostname', '127.0.0.1', '--port', '4387'], path.join(source, 'apps/docs'), 300);
  for (let attempt = 0; ; attempt++) { try { const response = await fetch(env.MCPCN_SV_ORIGIN, { signal: AbortSignal.timeout(1000) }); if (response.ok) break; } catch {} need(attempt < 60 && !server.row.closeObserved, 'docs_server_not_ready'); await new Promise(done => setTimeout(done, 250)); }
  await run('server-contract-browser', process.execPath, [path.join(source, 'tooling/server-contract-browser.spec.mjs')], source, 180);
  const browser = JSON.parse(fs.readFileSync(path.join(output, 'server-browser.json'))); need(browser.passed && browser.cases.length === 4 && browser.cases.reduce((sum, row) => sum + row.stages.length, 0) === 16, 'browser_profile_failed'); report.browser = browser;
  server.stop('SIGTERM'); await server.promise; server = undefined; guard('after-browser');
  const consumers = await checkServerConsumers({ run, root, source, archives, output, archiveRows, browser }); need(consumers.passed && consumers.cases.length === 2, 'server_consumer_profile'); report.consumers = consumers.cases.map(row => ({ id: row.id, status: row.status, moduleResolution: row.compiler.moduleResolution, skipLibCheck: false, observedCodeFiles: row.observedCodeFiles, protocolSessions: row.protocol.sessions })); guard('after-consumers');
  const derived = ['pnpm-lock.yaml', 'packages/server/LICENSE'].map(name => { const body = fs.readFileSync(path.join(source, name)); return { path: name, mode: 0o644, bytes: body.length, sha256: sha(body), contentBase64: body.toString('base64') }; });
  const bundle = Buffer.from(JSON.stringify({ schemaVersion: 'mcpcn.server-derived.v1', sourceCommit, workflowCommit, files: derived })); need(bundle.length <= 1024 * 1024, 'derived_bundle_bound'); fs.writeFileSync(path.join(output, 'derived-files.json'), bundle, { flag: 'wx', mode: 0o600 }); report.derived = { files: 2, bytes: bundle.length, sha256: sha(bundle), registryFilesUnchanged: 160, deterministic: true };
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

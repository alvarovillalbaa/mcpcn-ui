// CI-only T2 checks; the canonical checkout is read-only and scratch is owned.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { packageReferenceWorkbench } from './reference-workbench-package.mjs';

const need = (value, message) => { if (!value) throw new Error(message); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceCommit = process.argv[3], workflowCommit = process.env.GITHUB_SHA;
need(process.argv[2] === '--source-commit' && /^[a-f0-9]{40}$/.test(sourceCommit ?? '') && sourceCommit === process.env.SOURCE_COMMIT, 'source_pin_required');
need(process.env.GITHUB_REPOSITORY === 'alvarovillalbaa/mcpcn-ui' && process.env.GITHUB_REF === 'refs/heads/main' && process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && process.env.MCPCN_PUBLIC_REPOSITORY === 'true' && process.env.CI === 'true' && process.platform === 'linux' && process.version === 'v24.22.2' && /^[a-f0-9]{40}$/.test(workflowCommit ?? '') && workflowCommit !== sourceCommit, 'approved_public_ci_required');
const repo = fs.realpathSync(process.cwd()), runner = fs.realpathSync(process.env.RUNNER_TEMP);
const root = fs.mkdtempSync(path.join(runner, 'mcpcn-reference-workflows-')); fs.chmodSync(root, 0o700);
const identity = fs.lstatSync(root), nonce = randomBytes(16).toString('hex');
fs.writeFileSync(path.join(root, '.owner'), nonce, { flag: 'wx', mode: 0o600 });
const packet = path.join(runner, `mcpcn-reference-workflows-packet-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`);
fs.mkdirSync(packet, { mode: 0o700 });
fs.appendFileSync(process.env.GITHUB_ENV, `MCPCN_REFERENCE_PACKET=${packet}\n`);
for (const name of ['source', 'archives', 'output', 'consumers', 'tools', 'tmp', 'cache', 'config', 'data', 'state']) fs.mkdirSync(path.join(root, name), { mode: 0o700 });
for (const name of ['npm-user', 'npm-global']) fs.writeFileSync(path.join(root, name), '', { flag: 'wx', mode: 0o600 });
const source = path.join(root, 'source'), output = path.join(root, 'output'), archives = path.join(root, 'archives');
const env = { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: process.env.HOME, LANG: 'C.UTF-8', TZ: 'UTC', CI: 'true', NO_COLOR: '1',
  SOURCE_COMMIT: sourceCommit, NEXT_TELEMETRY_DISABLED: '1', TMPDIR: path.join(root, 'tmp'), TMP: path.join(root, 'tmp'), TEMP: path.join(root, 'tmp'),
  XDG_CACHE_HOME: path.join(root, 'cache'), XDG_CONFIG_HOME: path.join(root, 'config'), XDG_DATA_HOME: path.join(root, 'data'), XDG_STATE_HOME: path.join(root, 'state'),
  npm_config_cache: path.join(root, 'cache/npm'), npm_config_userconfig: path.join(root, 'npm-user'), npm_config_globalconfig: path.join(root, 'npm-global'),
  npm_config_registry: 'https://registry.npmjs.org/', npm_config_ignore_scripts: 'true', npm_config_audit: 'false', npm_config_fund: 'false', npm_config_fetch_retries: '0', npm_config_fetch_timeout: '15000', npm_config_update_notifier: 'false',
  MCPCN_RF_RUN_ROOT: root, MCPCN_RF_NONCE: nonce, MCPCN_RF_SOURCE_ROOT: source, MCPCN_RF_OUTPUT: output, MCPCN_RF_ARCHIVES: archives, MCPCN_RF_WORK: path.join(root, 'consumers') };
for (const name of ['npm_config_cache']) fs.mkdirSync(env[name], { recursive: true, mode: 0o700 });
const start = Date.now(), deadline = start + 1020000;
const report = { schemaVersion: 'mcpcn.reference-workflow-checks.v1', sourceCommit, workflowCommit, status: 'failed', startedAt: new Date(start).toISOString(), commands: [], guards: [], errors: [], cleanup: {}, proofLimits: ['Authored local SDK/AppBridge/SQLite workflows, explicit private capability/cookie checks and source-bundle build only. No external host, real identity/provider/model/payment or production data.', 'Node24.22.2 Linux CI and 1280/390px Chromium. Native devices, production auth/providers, public npm and full-product acceptance remain separate.'] };
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
const generated = name => name === 'pnpm-lock.yaml';
const git = (...args) => execFileSync('git', args, { cwd: repo, env: { ...env, GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 2 * 1024 * 1024, timeout: 30000 });
const names = git('ls-files', '-z').toString().split('\0').filter(Boolean).sort(); need(names.length <= 8500, 'source_file_count');
const exported = names.filter(name => !name.startsWith('docs/results/') && !name.startsWith('.agents/') && !name.startsWith('.github/') && !name.startsWith('.codex/'));
function guard(label) { owner(); const current = snapshot(repo, names); need(JSON.stringify(current) === JSON.stringify(baseline), 'canonical_checkout_changed'); if (derivedLockSha) need(sha(fs.readFileSync(path.join(source, 'pnpm-lock.yaml'))) === derivedLockSha, 'derived_lock_changed'); const protectedNow = snapshot(source, exported.filter(name => !generated(name))); need(JSON.stringify(protectedNow) === JSON.stringify(protectedSeed), 'protected_export_changed'); report.guards.push({ label, canonicalFiles: current.length, canonicalVectorSha256: sha(Buffer.from(JSON.stringify(current))), protectedFiles: protectedNow.length, protectedVectorSha256: sha(Buffer.from(JSON.stringify(protectedNow))) }); }
try {
  need(git('rev-parse', 'HEAD').toString().trim() === sourceCommit && git('status', '--porcelain').length === 0, 'checkout_not_exact_clean');
  need(git('rev-parse', 'HEAD^').toString().trim() === '1ac3672f7415077a14571ac3cc6cf6f549321723', 'candidate_must_follow_closed_base');
  baseline = snapshot(repo, names); let bytes = 0;
  for (const name of exported) { need(!path.isAbsolute(name) && !name.split('/').some(part => ['..', '.git'].includes(part)), 'export_path_invalid'); const from = path.join(repo, name), to = path.join(source, name); bytes += fs.lstatSync(from).size; need(bytes <= 128 * 1024 * 1024, 'seed_export_bound'); fs.mkdirSync(path.dirname(to), { recursive: true, mode: 0o700 }); fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL); }
  protectedSeed = snapshot(source, exported.filter(name => !generated(name))); report.export = { files: exported.length, bytes }; guard('before-install');
  const registryNames = exported.filter(name => name.startsWith('registry/')), registryBefore = snapshot(source, registryNames); need(registryNames.length === 160, 'registry_path_set');
  await run('tools-install', 'npm', ['install', '--prefix', path.join(root, 'tools'), '--ignore-scripts', '--no-audit', '--no-fund', 'pnpm@10.24.0', 'playwright@1.65.0', 'js-yaml@4.3.1'], root, 120);
  env.PATH = `${path.join(root, 'tools/node_modules/.bin')}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
  const yaml = createRequire(path.join(root, 'tools/package.json'))('js-yaml');
  const lockFile = path.join(source, 'pnpm-lock.yaml'), lockBefore = fs.readFileSync(lockFile), originalLock = yaml.load(lockBefore.toString());
  const desiredLock = structuredClone(originalLock), slugs = ['hr-candidate-review', 'document-extraction', 'ecommerce-checkout-review', 'admin-settings-change', 'research-workflow'];
  const same = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  const catalogVersion = name => originalLock.importers['apps/playground'].dependencies[name]?.version ?? originalLock.importers['packages/schemas'].dependencies[name]?.version;
  for (const slug of slugs) {
    const key = 'examples/' + slug, importer = desiredLock.importers[key];
    need(importer && !importer.dependencies['@mcpcn/reference-workflows'], 'original_example_importer');
    Object.assign(importer.dependencies, {
      '@mcpcn/reference-workflows': { specifier: 'workspace:*', version: 'link:../shared' },
      '@mcpcn/runtime': { specifier: 'workspace:*', version: 'link:../../packages/runtime' },
      'react-dom': { specifier: 'catalog:', version: catalogVersion('react-dom') }, zod: { specifier: 'catalog:', version: catalogVersion('zod') },
    });
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(source, 'examples/shared/package.json'))), dependencies = {};
  need(!desiredLock.importers['examples/shared'] && pkg.name === '@mcpcn/reference-workflows' && pkg.private === true, 'new_private_importer');
  for (const [name, specifier] of Object.entries(pkg.dependencies)) {
    const version = specifier === 'workspace:*' ? 'link:../../packages/' + name.slice('@mcpcn/'.length) : specifier === 'catalog:' ? catalogVersion(name)
      : name === '@modelcontextprotocol/sdk' ? originalLock.importers['packages/server'].dependencies[name].version : name === '@modelcontextprotocol/ext-apps' ? originalLock.importers['apps/playground'].dependencies[name].version : undefined;
    need(version && (specifier === 'workspace:*' || specifier === 'catalog:' || ['1.30.0', '1.7.5'].includes(specifier)), 'unexpected_example_dependency'); dependencies[name] = { specifier, version };
  }
  desiredLock.importers['examples/shared'] = { dependencies };
  await run('derive-workspace-lock', 'pnpm', ['install', '--lockfile-only', '--ignore-scripts', '--prefer-offline'], source, 120);
  const derivedLock = fs.readFileSync(lockFile); need(same(yaml.load(derivedLock.toString())) === same(desiredLock), 'unexpected_lock_change'); derivedLockSha = sha(derivedLock);
  report.lockDerivation = { beforeBytes: lockBefore.length, beforeSha256: sha(lockBefore), bytes: derivedLock.length, sha256: derivedLockSha, existingExternalVersionsAndIntegritiesUnchanged: true, changedImporters: [...slugs.map(slug => 'examples/' + slug), 'examples/shared'], onlyDeclaredWorkspaceAndPinnedImporterEdges: true };
  fs.writeFileSync(path.join(output, 'derived-pnpm-lock.yaml'), derivedLock, { flag: 'wx', mode: 0o600 }); guard('after-lock-derivation');
  await run('workspace-install', 'pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], source, 180); guard('after-install');
  await run('reference-build', 'pnpm', ['examples:build'], source, 180);
  await run('strict-reference-types', 'pnpm', ['exec', 'tsc', '--project', 'examples/checks.tsconfig.json', '--pretty', 'false'], source, 120);
  const unitFiles = ['examples/shared/src/store.test.ts', 'examples/shared/src/workflows.test.ts', 'examples/shared/src/workbench-host.test.ts', 'examples/shared/src/views.test.tsx'];
  await run('reference-units', 'pnpm', ['exec', 'vitest', 'run', ...unitFiles, '--reporter=json', `--outputFile=${path.join(output, 'reference-units.json')}`], source, 180);
  const units = JSON.parse(fs.readFileSync(path.join(output, 'reference-units.json'))); need(units.success && units.numPassedTests === 78 && units.numFailedTests === 0 && units.numPendingTests === 0, 'new_unit_profile');
  await run('docs-registry-build', 'pnpm', ['--filter', '@mcpcn/registry', 'build'], source, 120);
  await run('reference-selected-regressions', 'pnpm', ['exec', 'vitest', 'run', 'apps/docs/content/server-guide.test.tsx', 'apps/docs/components/file-review-demos.test.tsx', '--testNamePattern', 'SV-D05|waits for a server record without reading or extracting on mount', '--reporter=json', `--outputFile=${path.join(output, 'reference-regressions.json')}`], source, 120);
  const regressions = JSON.parse(fs.readFileSync(path.join(output, 'reference-regressions.json'))); need(regressions.success && regressions.numPassedTests === 2 && regressions.numFailedTests === 0 && regressions.numPendingTests === 10, 'selected_regression_profile');
  report.units = { executed: 80, new: 78, selectedRegressions: 2, unchangedCasesOutsideSelectedFilter: 10 };
  const protocol = JSON.parse(fs.readFileSync(path.join(output, 'reference-protocol.json'))); need(protocol.passed && protocol.cases.length === 28 && protocol.cases.every(row => row.clientClosed && row.serverClosed && row.databaseClosed), 'real_unit_protocol_profile'); report.protocol = { unitSessions: 28, actualMessages: true, closed: true }; guard('after-units');
  await run('chromium-install', path.join(root, 'tools/node_modules/.bin/playwright'), ['install', 'chromium'], source, 120); env.MCPCN_RF_BROWSER_TOOLS = path.join(root, 'tools/node_modules/playwright');
  const browserCases = [];
  for (const width of [1280, 390]) for (const phase of ['flow', 'reload']) {
    env.MCPCN_RF_WIDTH = String(width); env.MCPCN_RF_PHASE = phase;
    const profile = `reference-${phase}-${width}`, readyFile = path.join(output, profile + '-ready.json');
    server = launch(profile + '-server', process.execPath, ['--import', 'tsx', 'tooling/reference-workbench-fixture.ts'], source, 240);
    for (let attempt = 0; !fs.existsSync(readyFile); attempt++) { need(attempt < 100 && !server.row.closeObserved, 'reference_server_not_ready'); await new Promise(resolve => setTimeout(resolve, 100)); }
    const ready = JSON.parse(fs.readFileSync(readyFile)); need(ready.sourceCommit === sourceCommit && ready.width === width && ready.phase === phase && /^http:\/\/127\.0\.0\.1:[0-9]+$/.test(ready.origin), 'ready_binding'); env.MCPCN_RF_ORIGIN = ready.origin;
    await run(profile + '-browser', process.execPath, ['tooling/reference-workflow-browser.mjs'], source, 180);
    const browser = JSON.parse(fs.readFileSync(path.join(output, profile + '-browser.json'))); need(browser.passed && browser.browserClosed && browser.cases.length === 5 && browser.cases.every(row => row.contextClosed), 'reference_browser_profile'); browserCases.push(...browser.cases);
    server.stop('SIGTERM'); const closed = await server.promise; need(closed.code === 0 && closed.row.originalGroupAbsent, 'reference_server_close'); server = undefined;
    const observed = JSON.parse(fs.readFileSync(path.join(output, profile + '-protocol.json'))); need(observed.closed && observed.workflows === 5 && observed.sourceCommit === sourceCommit, 'reference_sdk_database_close'); guard('after-' + profile);
  }
  need(browserCases.length === 20 && browserCases.reduce((sum, row) => sum + row.stages.length, 0) === 76 && browserCases.filter(row => row.nativeReading).length === 4, 'workflow_browser_stage_count');
  report.browser = { passed: true, cases: browserCases, workflowProfiles: 20, workflowDOM: 76, nativeEndReadings: 4, workbenchProcessStarts: 4, realProcessRestartProfiles: 10 };
  const gallery = path.join(source, 'apps/docs/public/reference-workflows'); fs.mkdirSync(gallery, { recursive: true, mode: 0o755 }); const images = [];
  for (const slug of slugs) {
    const original = `reference-flow-${slug}-1280-final.png`, raw = fs.readFileSync(path.join(output, original)); need(raw.length <= 1024 * 1024 && raw.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), 'gallery_png_original');
    fs.writeFileSync(path.join(gallery, slug + '.png'), raw, { flag: 'wx', mode: 0o644 }); images.push({ path: slug + '.png', original, bytes: raw.length, sha256: sha(raw), width: 1280, height: 1000 });
  }
  fs.writeFileSync(path.join(gallery, 'manifest.json'), JSON.stringify({ sourceCommit, kind: 'mcpcn.reference-workflow-previews.v1', files: images }, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
  report.bundle = await packageReferenceWorkbench({ root, source, output, sourceCommit, names: exported, run, env }); guard('after-fresh-bundle');
  await run('docs-playground-build', 'pnpm', ['--filter', '@mcpcn/playground', 'build'], source, 120);
  await run('docs-build', 'pnpm', ['--filter', '@mcpcn/docs', 'build'], source, 180); guard('after-docs-build');
  env.MCPCN_RF_DOCS_ORIGIN = 'http://127.0.0.1:4389';
  server = launch('reference-docs-server', process.execPath, [path.join(source, 'apps/docs/node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '4389'], path.join(source, 'apps/docs'), 180);
  for (let attempt = 0; ; attempt++) { try { const response = await fetch(env.MCPCN_RF_DOCS_ORIGIN, { signal: AbortSignal.timeout(1000) }); if (response.ok) break; } catch {} need(attempt < 60 && !server.row.closeObserved, 'reference_docs_not_ready'); await new Promise(resolve => setTimeout(resolve, 100)); }
  await run('reference-docs-browser', process.execPath, ['tooling/reference-docs-browser.mjs'], source, 120);
  const docs = JSON.parse(fs.readFileSync(path.join(output, 'reference-docs-browser.json'))); need(docs.passed && docs.browserClosed && docs.cases.length === 2 && docs.cases.reduce((sum, row) => sum + row.stages.length, 0) === 4, 'reference_docs_profile'); report.browser.cases.push(...docs.cases); report.browser.totalProfiles = 22; report.browser.totalDOM = 80; report.browser.totalPNGs = 24;
  server.stop('SIGTERM'); await server.promise; server = undefined;
  need(JSON.stringify(snapshot(source, registryNames)) === JSON.stringify(registryBefore), 'existing_registry_changed'); report.registryUnchanged = { files: 160, identities: 79, owners: 36, vectorSha256: sha(Buffer.from(JSON.stringify(registryBefore))) };
  const derivedNames = ['pnpm-lock.yaml', ...slugs.map(slug => 'apps/docs/public/reference-workflows/' + slug + '.png'), 'apps/docs/public/reference-workflows/manifest.json'];
  const derived = derivedNames.map(name => { const body = fs.readFileSync(path.join(source, name)); return { path: name, mode: 0o644, bytes: body.length, sha256: sha(body), contentBase64: body.toString('base64') }; });
  const body = Buffer.from(JSON.stringify({ schemaVersion: 'mcpcn.reference-derived.v1', sourceCommit, workflowCommit, files: derived })); need(body.length <= 8 * 1024 * 1024, 'reference_derived_bound'); fs.writeFileSync(path.join(output, 'reference-derived-files.json'), body, { flag: 'wx', mode: 0o600 }); report.derived = { files: 7, bytes: body.length, sha256: sha(body), lockAndFiveOriginalPNGsAndManifestOnly: true };
  guard('after-complete-packet'); report.status = 'passed';
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
  try { owner(); let retained = 0; for (const name of fs.readdirSync(output)) { const file = path.join(output, name), stat = fs.lstatSync(file); retained += stat.size; need(stat.isFile() && !stat.isSymbolicLink() && retained <= 64 * 1024 * 1024, 'output_not_regular_or_packet_bound'); fs.copyFileSync(file, path.join(packet, name), fs.constants.COPYFILE_EXCL); } if (!active.size && !live.length) { fs.rmSync(root, { recursive: true }); report.cleanup.rootRemoved = !fs.existsSync(root); } } catch { report.status = 'failed'; report.errors.push('retention_or_removal_failed'); }
  report.completedAt = new Date().toISOString(); fs.writeFileSync(path.join(packet, 'receipt.json'), JSON.stringify(report, null, 2));
  const rows = fs.readdirSync(packet).sort().map(name => { const bytes = fs.readFileSync(path.join(packet, name)); return { name, bytes: bytes.length, sha256: sha(bytes) }; }); fs.writeFileSync(path.join(packet, 'packet-manifest.json'), JSON.stringify({ sourceCommit, workflowCommit, files: rows }, null, 2));
  console.log(JSON.stringify({ status: report.status, sourceCommit, workflowCommit, errors: report.errors, units: report.units, consumers: report.consumers, browserCases: report.browser?.cases.length, cleanup: report.cleanup })); process.exitCode = report.status === 'passed' ? 0 : 1;
}

// V1 components: owned generation, fresh consumers and production-docs browser checks.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ACTIVE = '.github/workflows/v1-components-checks.yml';
const PACKAGES = ['core', 'schemas', 'runtime', 'react', 'themes', 'registry', 'cli'];
const GEN_RAW = 134217728, GEN_GZIP = 8388608;
const STREAM = 524288, PROOF = 8388608;
const sha = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const need = (condition, code) => { if (!condition) throw new Error(code); };
const finite = error => /^[a-z0-9_]+$/.test(error?.message ?? '') ? error.message : 'controller_error';
const sourceCommit = process.argv[3];
need(process.argv.length === 4 && process.argv[2] === '--source-commit' && /^[a-f0-9]{40}$/.test(sourceCommit ?? ''), 'source_pin_required');
need(process.env.SOURCE_COMMIT === sourceCommit, 'dispatch_source_mismatch');
need(process.platform === 'linux' && process.version === 'v24.22.2' && process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true'
  && process.env.GITHUB_REPOSITORY === 'alvarovillalbaa/mcpcn-ui' && process.env.GITHUB_REF === 'refs/heads/main'
  && process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && process.env.MCPCN_PUBLIC_REPOSITORY === 'true', 'approved_public_main_ci_required');
const jobStart = Number(process.env.MCPCN_V1_JOB_STARTED_MS);
need(Number.isSafeInteger(jobStart) && jobStart <= Date.now() && jobStart > Date.now() - 300000, 'job_start_invalid');
const taskStartTicks = process.env.MCPCN_V1_START_TICKS;
need(/^[1-9][0-9]{0,19}$/.test(taskStartTicks ?? ''), 'task_start_ticks_required');
const workflowCommit = process.env.GITHUB_SHA;
need(/^[a-f0-9]{40}$/.test(workflowCommit ?? '') && workflowCommit !== sourceCommit, 'workflow_commit_required_and_distinct');
const workEnd = Math.min(Date.now() + 1020000, jobStart + 1200000 - 90000 - 30000);
const repo = fs.realpathSync(process.cwd()), parent = fs.realpathSync(process.env.RUNNER_TEMP ?? '');
const root = fs.mkdtempSync(path.join(parent, 'mcpcn-v1-')); fs.chmodSync(root, 0o700);
const rootIdentity = fs.lstatSync(root), nonce = randomBytes(16).toString('hex');
fs.writeFileSync(path.join(root, '.owner'), nonce, { flag: 'wx', mode: 0o600 });
for (const dir of ['source', 'archives', 'output', 'consumers', 'tools', 'tmp', 'cache', 'config', 'data', 'state']) fs.mkdirSync(path.join(root, dir), { mode: 0o700 });
for (const name of ['npm-user', 'npm-global']) fs.writeFileSync(path.join(root, name), '', { flag: 'wx', mode: 0o600 });
const source = path.join(root, 'source'), archives = path.join(root, 'archives'), output = path.join(root, 'output');
const env = { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: process.env.HOME, LANG: 'C.UTF-8', TZ: 'UTC', CI: 'true', NO_COLOR: '1',
  TMPDIR: path.join(root, 'tmp'), TMP: path.join(root, 'tmp'), TEMP: path.join(root, 'tmp'),
  XDG_CACHE_HOME: path.join(root, 'cache'), XDG_CONFIG_HOME: path.join(root, 'config'), XDG_DATA_HOME: path.join(root, 'data'), XDG_STATE_HOME: path.join(root, 'state'),
  npm_config_cache: path.join(root, 'cache', 'npm'), npm_config_userconfig: path.join(root, 'npm-user'), npm_config_globalconfig: path.join(root, 'npm-global'),
  npm_config_registry: 'https://registry.npmjs.org/', npm_config_ignore_scripts: 'true', npm_config_audit: 'false', npm_config_fund: 'false',
  npm_config_fetch_retries: '0', npm_config_fetch_timeout: '15000', npm_config_update_notifier: 'false',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0',
  MCPCN_V1_RUN_ROOT: root, MCPCN_V1_NONCE: nonce, MCPCN_V1_ARCHIVES: archives,
  MCPCN_V1_OUTPUT: output, MCPCN_V1_WORK: path.join(root, 'consumers'), MCPCN_V1_SOURCE_ROOT: source,
  NEXT_TELEMETRY_DISABLED: '1', SOURCE_COMMIT: sourceCommit };
const report = { schemaVersion: 'mcpcn.v1-components-checks.v1', sourceCommit, workflowCommit, status: 'failed', startedAt: new Date().toISOString(),
  runtime: { node: process.version, executableSha256: sha(fs.readFileSync(process.execPath)), platform: process.platform, architecture: process.arch },
  limits: { jobSeconds: 1200, workMaximumSeconds: 1020, cleanupSeconds: 90, marginSeconds: 30, streamBytes: STREAM, normalProofGzipBytes: PROOF,
    generatedRawBytes: GEN_RAW, generatedGzipBytes: GEN_GZIP, allProofGzipBytes: PROOF + GEN_GZIP, termGraceSeconds: 5, killDrainSeconds: 5 },
  timing: { jobStartedMs: jobStart, admittedAtMs: Date.now(), workEndMs: workEnd }, commands: [], sourceGuards: [], archives: [], errors: [],
  processBaseline: { taskStartTicks, limit: 2048, complete: false, identities: [], ancestors: [], errors: [], exclusionScope: 'exact_unchanged_pre_task_identities_and_supervisor_ancestors_only' },
  cleanup: { passed: false, rootRemoved: false, ownedProcessesRemaining: null, uncertain: false, processes: [], scanErrors: [], scanErrorCount: 0,
    baselineSkipped: [], ancestorSkipped: [], dispositions: { vanished: 0, pid_reused: 0, stable_unreadable: 0, identity_recheck_failed: 0 } },
  proofLimits: ['New v1 cases plus the explicitly changed-contract CLI installer regressions, two fresh consumers and 26 browser cases. The old whole 52/consumer/HTTP packets are not invoked.',
    'The checked Git commit contains the original registry seed. Fresh generated bytes are separately hashed, tested and returned, not relabelled as bytes present in that Git commit.',
    'Only 160 registry JSON paths and seven package LICENSE files may change in the owned export. Canonical checkout identities and all other exported source bytes/modes stay unchanged.',
    'The docs use their actual Next production build/server. Service SIGTERM is separately attributed; finite commands still require zero exit, original EOF and absent groups.',
    'No publication, credentials, provider/model, account, real MCP host or physical-device proof is included.',
    'Process evidence uses exact direct-launch identities plus nonce-marked indirect processes, with finite unknown reads remaining fatal; this is not a host-wide sandbox.'] };
const commands = new Set(), evidence = [], observed = new Map();
let baseline, cleanupEnd, interrupted = false, evidenceBytes = 0, generatedEvidence = null, serverHandle = null, serverPromise = null;
function owner() {
  const s = fs.lstatSync(root), marker = fs.lstatSync(path.join(root, '.owner'));
  need(s.isDirectory() && !s.isSymbolicLink() && s.dev === rootIdentity.dev && s.ino === rootIdentity.ino && s.uid === process.getuid() && (s.mode & 0o777) === 0o700
    && marker.isFile() && !marker.isSymbolicLink() && marker.uid === process.getuid() && (marker.mode & 0o777) === 0o600
    && fs.readFileSync(path.join(root, '.owner'), 'utf8') === nonce, 'owned_root_changed');
}
function read(file, cap = 16777216) {
  const a = fs.lstatSync(file); need(a.isFile() && !a.isSymbolicLink() && a.size <= cap, 'file_type_or_bound');
  const b = fs.readFileSync(file), c = fs.lstatSync(file);
  need(a.dev === c.dev && a.ino === c.ino && a.size === c.size && a.mtimeMs === c.mtimeMs && a.ctimeMs === c.ctimeMs && b.length === a.size, 'file_changed'); return b;
}
function retain(name, bytes) {
  need(/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/.test(name) && bytes.length <= 4194304, 'evidence_file_bound');
  const packed = gzipSync(bytes, { level: 9, mtime: 0 });
  need(evidenceBytes + packed.length <= (name === 'receipt.json' ? PROOF : PROOF - 524288), 'evidence_total_bound');
  evidenceBytes += packed.length;
  evidence.push({ name, bytes: bytes.length, sha256: sha(bytes), gzipBytes: packed.length, packed });
}
function groupAbsent(pgid) { try { process.kill(-pgid, 0); return false; } catch (e) { return e.code === 'ESRCH' ? true : null; } }
function readProc(file, limit) {
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(limit + 1); let bytes = 0;
    while (bytes < buffer.length) {
      const count = fs.readSync(fd, buffer, bytes, buffer.length - bytes, null);
      if (count === 0) break; bytes += count;
    }
    need(bytes <= limit, 'process_read_bound'); return buffer.subarray(0, bytes);
  }
  finally { fs.closeSync(fd); }
}
function proc(pid) {
  const base = `/proc/${pid}`, s = fs.statSync(base); if (s.uid !== process.getuid()) return null;
  const fields = () => {
    const text = readProc(path.join(base, 'stat'), 8192).toString(), close = text.lastIndexOf(')'); need(close > 0, 'proc_shape');
    const parts = text.slice(close + 2).trim().split(/\s+/);
    need(parts.length >= 20 && /^\d+$/.test(parts[19]) && /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[2]), 'proc_shape'); return parts;
  };
  const before = fields(), after = fields(), current = fs.statSync(base);
  need(s.uid === current.uid && before[19] === after[19] && before[2] === after[2], 'proc_identity_changed');
  return { pid, uid: current.uid, ppid: Number(after[1]), pgid: Number(after[2]), starttime: after[19], state: after[0] };
}
function same(a, b) { return a && b && a.pid === b.pid && a.uid === b.uid && a.pgid === b.pgid && a.starttime === b.starttime; }
const baselineProcesses = new Map(), ancestors = new Map(), skippedBaseline = new Set(), skippedAncestors = new Set();
function captureProcessBaseline() {
  const supervisor = proc(process.pid); need(supervisor && BigInt(taskStartTicks) <= BigInt(supervisor.starttime), 'task_cutoff_after_supervisor');
  const names = fs.readdirSync('/proc').filter(x => /^\d+$/.test(x)); need(names.length <= 16384, 'proc_scan_bound');
  for (const name of names) {
    try {
      const item = proc(Number(name)); if (!item) continue;
      need(baselineProcesses.size < report.processBaseline.limit, 'process_baseline_bound'); baselineProcesses.set(item.pid, item); report.processBaseline.identities.push(item);
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) { report.processBaseline.errors.push({ pid: Number(name), errno: processErrorCode(error) }); throw error; }
    }
  }
  let parentInfo = supervisor;
  while (parentInfo.ppid > 1 && !ancestors.has(parentInfo.ppid)) {
    need(ancestors.size < 64, 'ancestor_chain_bound');
    const item = proc(parentInfo.ppid); if (!item) break;
    ancestors.set(item.pid, item); report.processBaseline.ancestors.push(item); parentInfo = item;
  }
  report.processBaseline.complete = true;
}
function excludedProcess(info) {
  if (observed.has(`${info.pid}:${info.starttime}`)) return false;
  if (same(ancestors.get(info.pid), info)) {
    const key = `${info.pid}:${info.starttime}`; if (!skippedAncestors.has(key)) { skippedAncestors.add(key); report.cleanup.ancestorSkipped.push(info); } return true;
  }
  if (report.processBaseline.complete && same(baselineProcesses.get(info.pid), info) && BigInt(info.starttime) < BigInt(taskStartTicks)) {
    const key = `${info.pid}:${info.starttime}`; if (!skippedBaseline.has(key)) { skippedBaseline.add(key); report.cleanup.baselineSkipped.push(info); } return true;
  }
  return false;
}
function processErrorCode(error) {
  if (typeof error?.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code)) return error.code;
  return /^[a-z0-9_]{1,32}$/.test(error?.message ?? '') ? error.message.toUpperCase() : 'UNKNOWN';
}
function scan() {
  const names = fs.readdirSync('/proc').filter(x => /^\d+$/.test(x)); need(names.length <= 16384, 'proc_scan_bound'); const rows = []; let inspected = 0;
  for (const name of names) {
    const pid = Number(name); if (pid === process.pid) continue;
    let info, phase = 'identity';
    try {
      info = proc(pid); if (!info) continue;
      need(++inspected <= report.processBaseline.limit, 'process_scan_bound');
      const direct = report.commands.find(command => same(command.identity, info));
      if (!direct && excludedProcess(info)) continue;
      const key = `${pid}:${info.starttime}`;
      const ownershipMethod = direct ? 'direct_command_identity' : observed.has(key) ? 'previously_observed_owned_identity' : 'nonce_environment';
      if (!direct && !observed.has(key)) {
        phase = 'environment'; const raw = readProc(`/proc/${pid}/environ`, 1048576);
        const fields = raw.toString().split('\0');
        if (!fields.includes(`MCPCN_V1_RUN_ROOT=${root}`) || !fields.includes(`MCPCN_V1_NONCE=${nonce}`)) continue;
      }
      phase = 'identity_after'; const after = proc(pid);
      if (!after) { const error = new Error('process_identity_changed'); throw error; }
      if (info.starttime !== after.starttime) continue;
      need(same(info, after), 'process_identity_changed');
      const owned = { ...info, ownershipMethod, directCommandLabel: direct?.label ?? null };
      if (!observed.has(key)) { observed.set(key, owned); report.cleanup.processes.push(owned); }
      rows.push(owned);
    } catch (e) {
      const record = { pid, phase, identityBefore: info ?? null, errno: processErrorCode(e), identityAfter: null, recheckErrno: null, disposition: null };
      let after;
      try { after = proc(pid); record.identityAfter = after; }
      catch (again) {
        record.recheckErrno = processErrorCode(again);
        if (['ENOENT', 'ESRCH'].includes(again.code)) record.disposition = 'vanished';
        else record.disposition = 'identity_recheck_failed';
      }
      if (!record.disposition) {
        if (info && after && info.starttime !== after.starttime) record.disposition = 'pid_reused';
        else record.disposition = 'stable_unreadable';
      }
      report.cleanup.scanErrorCount++;
      report.cleanup.dispositions[record.disposition]++;
      if (report.cleanup.scanErrors.length < 64) report.cleanup.scanErrors.push(record);
      if (!['vanished', 'pid_reused'].includes(record.disposition)) {
        report.cleanup.uncertain = true;
        if (!report.errors.includes('owned_process_scan_uncertain')) report.errors.push('owned_process_scan_uncertain');
      }
    }
  }
  return rows;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function run(label, executable, args, seconds, { cwd = source, allowFailure = false, cleanup = false, service = false, onSpawn } = {}) {
  owner(); need(cleanup || !interrupted, 'interrupted'); const deadline = Math.min(Date.now() + seconds * 1000, cleanup ? cleanupEnd : workEnd);
  need(deadline > Date.now() + 1000, 'command_budget_exhausted');
  const row = { label, executable, arguments: args.map(arg => String(arg).replaceAll(root, '[owned-root]')),
    cwd: cwd.replaceAll(root, '[owned-root]'), startedAt: new Date().toISOString(), deadlineMs: deadline, terminalClosedMs: null, pid: null, identity: null, code: null, signal: null, error: null,
    exitObserved: false, closeObserved: false, groupAbsent: null, signals: [], streams: [], expectedService: service, serviceStopRequestedAtMs: null };
  report.commands.push(row);
  const child = spawn(executable, args, { cwd, env: service ? { ...env, NODE_ENV: 'production' } : env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const terminal = {}, data = [[], []], counts = [0, 0], hashes = [createHash('sha256'), createHash('sha256')];
  commands.add(child); let closedResolve, timer, stopAt = null;
  const closed = new Promise(resolve => { closedResolve = resolve; });
  child.once('error', () => { row.error ??= 'spawn_error'; });
  child.once('exit', (code, signal) => { row.code = code; row.signal = signal; row.exitObserved = true; });
  child.once('close', () => { row.closeObserved = true; row.terminalClosedMs = Date.now(); commands.delete(child); closedResolve(); });
  for (const [i, stream] of [child.stdout, child.stderr].entries()) {
    terminal[i] = { end: false, close: false };
    stream.on('data', chunk => { counts[i] += chunk.length; hashes[i].update(chunk); const keep = Math.min(chunk.length, Math.max(0, STREAM - (counts[i] - chunk.length))); if (keep) data[i].push(chunk.subarray(0, keep)); if (counts[i] > STREAM) stop('stream_bound'); });
    stream.on('end', () => { terminal[i].end = true; }); stream.on('close', () => { terminal[i].close = true; });
    stream.on('error', () => stop('pipe_error'));
  }
  function signal(value) {
    if (!child.pid) return;
    try {
      let current; try { current = proc(child.pid); } catch (e) { if (!['ENOENT', 'ESRCH'].includes(e.code)) throw e; }
      const members = scan();
      need(same(current, row.identity) || members.some(x => x.pgid === child.pid), 'signal_identity_unproved');
      process.kill(-child.pid, value); row.signals.push(value);
    } catch (e) { if (e.code !== 'ESRCH' && e.code !== 'ENOENT') row.error ??= 'signal_identity_unproved'; }
  }
  function stop(code) {
    if (stopAt !== null) return;
    if (service && code === 'service_shutdown') row.serviceStopRequestedAtMs = Date.now(); else row.error ??= code;
    stopAt = Date.now(); signal('SIGTERM');
  }
  child.releaseStop = stop;
  onSpawn?.({ child, row, stop: () => stop('service_shutdown') });
  try {
    if (child.pid) { row.pid = child.pid; try { row.identity = proc(child.pid); } catch (e) { if (!['ENOENT', 'ESRCH'].includes(e.code)) throw e; } }
    timer = setInterval(() => {
      if (interrupted && !cleanup) stop('interrupted'); else if (Date.now() >= deadline) stop('command_deadline');
      if (stopAt !== null && Date.now() >= stopAt + 5000 && !row.signals.includes('SIGKILL') && groupAbsent(child.pid) !== true) signal('SIGKILL');
    }, 50);
    let done = false; closed.then(() => { done = true; });
    while (!done && Date.now() < deadline + 10000 && !(stopAt !== null && Date.now() >= stopAt + 10000)) { scan(); await pause(100); }
    if (!done) { stop('pipe_close_deadline'); child.stdout.destroy(); child.stderr.destroy(); }
    while (child.pid && groupAbsent(child.pid) !== true && Date.now() < (stopAt ?? deadline) + 10000) { stop('process_group_remaining'); scan(); await pause(50); }
    row.groupAbsent = child.pid ? groupAbsent(child.pid) : true;
  } catch (e) {
    row.error ??= finite(e); stop(row.error);
    const until = Math.min(deadline + 10000, Date.now() + 10000);
    while (!row.closeObserved && Date.now() < until) {
      if (stopAt !== null && Date.now() >= stopAt + 5000 && !row.signals.includes('SIGKILL')) signal('SIGKILL');
      await pause(50);
    }
    row.groupAbsent = child.pid ? groupAbsent(child.pid) : true;
  }
  finally {
    clearInterval(timer);
    if (!row.closeObserved) {
      row.error ??= 'pipe_close_deadline';
      for (const stream of [child.stdout, child.stderr]) { stream.removeAllListeners('data'); stream.destroy(); }
    }
    const bytes = data.map(parts => Buffer.concat(parts));
    row.streams = bytes.map((b, i) => ({ name: i ? 'stderr' : 'stdout', bytes: b.length, sha256: sha(b), observedBytes: counts[i], observedSha256: hashes[i].digest('hex'),
      eof: terminal[i].end, descriptorClosed: terminal[i].close, complete: row.closeObserved && terminal[i].end && terminal[i].close && counts[i] === b.length }));
    bytes.forEach((b, i) => retain(`${label}.${i ? 'stderr' : 'stdout'}.txt`, b)); row.finishedAt = new Date().toISOString();
  }
  if (row.terminalClosedMs !== null && row.terminalClosedMs >= deadline) row.error ??= 'command_deadline';
  const normalCommand = !service && row.code === 0 && row.signal === null && row.signals.length === 0;
  const expectedService = service && row.serviceStopRequestedAtMs !== null && row.signals.length === 1 && row.signals[0] === 'SIGTERM'
    && (row.signal === 'SIGTERM' || (row.signal === null && (row.code === 0 || row.code === 143)));
  row.passed = (normalCommand || expectedService) && row.error === null && row.exitObserved && row.closeObserved && row.groupAbsent === true && row.streams.every(s => s.complete);
  need(allowFailure || row.passed, `${label.replaceAll('-', '_')}_failed`); return { row, bytes: data.map(parts => Buffer.concat(parts)) };
}
const signals = new Map();
for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP']) { const fn = () => { interrupted = true; for (const child of commands) child.releaseStop?.('interrupted'); }; signals.set(name, fn); process.on(name, fn); }
async function guard(label, cleanup = false) {
  const row = { label, passed: false, files: [] }; report.sourceGuards.push(row);
  const get = async args => (await run(`guard-${label}-${row.calls = (row.calls ?? 0) + 1}`, '/usr/bin/git', args, 10, { cwd: repo, cleanup })).bytes[0];
  need((await get(['rev-parse', 'HEAD'])).toString().trim() === sourceCommit, 'source_head_changed');
  const tree = new Map(); for (const entry of (await get(['ls-tree', '-r', '-z', 'HEAD'])).toString().split('\0').filter(Boolean)) {
    const [head, name] = entry.split('\t'), [mode, type, blob] = head.split(' '); need(type === 'blob' && ['100644', '100755'].includes(mode), 'source_type_invalid'); tree.set(name, { mode, blob });
  }
  need(tree.size <= 1000, 'source_count_bound');
  need((await get(['status', '--porcelain=v1', '-z', '--untracked-files=all'])).length === 0, 'source_status_dirty');
  await get(['-c', 'core.filemode=true', 'diff', '--no-ext-diff', '--no-textconv', '--exit-code', 'HEAD', '--']);
  for (const [name, item] of tree) {
    need(!path.isAbsolute(name) && !name.split('/').some(x => ['', '.', '..'].includes(x)), 'source_path_invalid');
    const file = path.join(repo, name), s = fs.lstatSync(file), b = read(file);
    const blob = sha(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b]), 'sha1');
    need(item.mode === (s.mode & 0o111 ? '100755' : '100644') && item.blob === blob, 'source_bytes_changed');
    row.files.push({ path: name, mode: item.mode, bytes: b.length, sha256: sha(b), gitBlob: blob, device: s.dev, inode: s.ino, mtimeMs: s.mtimeMs, ctimeMs: s.ctimeMs });
  }
  if (baseline) need(JSON.stringify(row.files) === JSON.stringify(baseline), 'source_identity_changed'); else baseline = row.files;
  row.passed = true;
}
function exportSource() {
  let total = 0;
  for (const entry of baseline) {
    if (entry.path === ACTIVE) continue;
    const b = read(path.join(repo, entry.path));
    const publicWorkspaceConfig = entry.path === '.npmrc' && b.equals(Buffer.from('auto-install-peers=true\nstrict-peer-dependencies=false\nlink-workspace-packages=true\n'));
    need(publicWorkspaceConfig || !/(?:^|\/)(?:\.git|node_modules|\.npmrc|\.env(?!\.example$)[^/]*|id_rsa|id_ed25519|[^/]*\.(?:pem|key))(?:\/|$)/.test(entry.path), 'source_secret_or_dependency_path');
    const target = path.join(source, entry.path); fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    total += b.length; need(total <= 67108864, 'export_total_bound');
    fs.writeFileSync(target, b, { flag: 'wx', mode: entry.mode === '100755' ? 0o700 : 0o600 });
  }
  report.export = { files: baseline.filter(entry => entry.path !== ACTIVE).length, bytes: total, excludedExactPath: ACTIVE, originalModesRecorded: true, copiedPermissions: 'owner-only' };
}

const MODULES = [
  ['packages/core/src/index.ts', 'core.ts'], ['packages/schemas/src/index.ts', 'schemas.ts'],
  ['packages/react/src/index.tsx', 'components.tsx'], ['packages/runtime/src/index.tsx', 'runtime.tsx'],
  ['packages/schemas/src/schema-common.ts', 'schema-common.ts'], ['packages/schemas/src/review-schemas.ts', 'review-schemas.ts'],
  ['packages/schemas/src/decision-schemas.ts', 'decision-schemas.ts'], ['packages/schemas/src/execution-schemas.ts', 'execution-schemas.ts'],
  ['packages/react/src/primitives.tsx', 'primitives.tsx'], ['packages/react/src/component-helpers.tsx', 'component-helpers.tsx'],
  ['packages/react/src/review-components.tsx', 'review-components.tsx'], ['packages/react/src/decision-components.tsx', 'decision-components.tsx'],
  ['packages/react/src/execution-components.tsx', 'execution-components.tsx'], ['packages/react/src/component-types.ts', 'component-types.ts'],
];
let generatedPaths, seedNames, generatedBaseline;
const exact = (actual, expected, code) => need(JSON.stringify(actual) === JSON.stringify(expected), code);
function exactSet(actual, expected, code) {
  need(Array.isArray(actual) && new Set(actual).size === actual.length, code);
  exact([...actual].sort(), [...expected].sort(), code);
}
function generationScope() {
  const seed = JSON.parse(read(path.join(source, 'registry/registry.json')));
  need(Array.isArray(seed.items) && seed.items.length === 79, 'seed_registry_count');
  seedNames = seed.items.map(item => item.name);
  need(new Set(seedNames).size === 79 && seedNames.every(name => /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)), 'seed_registry_names');
  const registry = ['registry/registry.json', 'registry/config.schema.json', ...seedNames.flatMap(name => [`registry/${name}.json`, `registry/items/${name}.json`])];
  exactSet(baseline.filter(entry => entry.path.startsWith('registry/')).map(entry => entry.path), registry, 'seed_registry_path_set');
  generatedPaths = new Set([...registry, ...PACKAGES.map(name => `packages/${name}/LICENSE`)]);
  need(generatedPaths.size === 167 && MODULES.length === 14, 'generation_scope_count');
  report.generation = { seedCommit: sourceCommit, seedRegistrySha256: sha(read(path.join(source, 'registry/registry.json'))), registryPaths: 160, licensePaths: 7,
    items: 79, sourceModules: MODULES.map(([file, target]) => ({ path: file, target: `components/mcpcn/_mcpcn/${target}`, sha256: sha(read(path.join(source, file))) })), snapshots: [], determinism: false, tested: false };
}
function guardExport(label) {
  const result = { label, passed: false }; report.exportGuards ??= []; report.exportGuards.push(result);
  const tracked = new Set(baseline.map(entry => entry.path));
  function walk(directory, relative = '') {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = relative ? `${relative}/${item.name}` : item.name;
      if (item.name === 'node_modules' || name === 'apps/docs/.next' || /^packages\/(?:core|schemas|runtime|react|themes|registry|cli)\/dist$/.test(name)) continue;
      if (item.isDirectory()) walk(path.join(directory, item.name), name);
      else {
        need(item.isFile() && !item.isSymbolicLink(), 'export_unexpected_type');
        need(tracked.has(name) || generatedPaths.has(name) || /^(?:packages\/(?:core|schemas|runtime|react|themes|registry|cli)|apps\/docs)\/tsconfig\.tsbuildinfo$/.test(name), 'export_unexpected_file');
      }
    }
  }
  walk(source);
  for (const entry of baseline) {
    if (entry.path === ACTIVE || generatedPaths.has(entry.path)) continue;
    const file = path.join(source, entry.path), stat = fs.lstatSync(file);
    need((stat.mode & 0o111 ? '100755' : '100644') === entry.mode && sha(read(file)) === entry.sha256, 'export_nongenerated_source_changed');
  }
  need(!fs.existsSync(path.join(source, ACTIVE)), 'export_active_workflow_present'); result.passed = true;
}
function snapshotGenerated(label) {
  let bytes = 0;
  const files = [...generatedPaths].sort().map(name => {
    const file = path.join(source, name), stat = fs.lstatSync(file), data = read(file, GEN_RAW);
    need(stat.uid === process.getuid() && (stat.mode & 0o111) === 0, 'generated_file_ownership');
    bytes += data.length; need(bytes <= GEN_RAW, 'generated_raw_bound');
    return { path: name, mode: '100644', bytes: data.length, sha256: sha(data), gitBlob: sha(Buffer.concat([Buffer.from(`blob ${data.length}\0`), data]), 'sha1') };
  });
  const vectorSha256 = sha(Buffer.from(JSON.stringify(files))); report.generation.snapshots.push({ label, bytes, vectorSha256, files });
  return { files, bytes, vectorSha256 };
}
function rewriteModule(text, blocks = false) {
  const aliases = { '@mcpcn/core': './core', '@mcpcn/schemas': './schemas', '@mcpcn/react': './components', '@mcpcn/runtime': './runtime' };
  const value = text.replace(/(["'])(@mcpcn\/(?:core|schemas|react|runtime))\1/g, (_, quote, name) => `${quote}${aliases[name]}${quote}`);
  return blocks ? value.replace(/(["'])\.\/index\.js\1/g, '"./components"') : value;
}
function verifyGenerated() {
  const index = JSON.parse(read(path.join(source, 'registry/registry.json'), GEN_RAW));
  exactSet(index.items.map(item => item.name), seedNames, 'fresh_registry_names');
  const moduleBytes = new Map(MODULES.map(([file, target]) => [`components/mcpcn/_mcpcn/${target}`, rewriteModule(read(path.join(source, file)).toString())]));
  const blockBytes = rewriteModule(read(path.join(source, 'packages/react/src/blocks.tsx')).toString(), true);
  const license = read(path.join(source, 'LICENSE'));
  for (const name of PACKAGES) need(read(path.join(source, `packages/${name}/LICENSE`)).equals(license), 'generated_license_binding');
  JSON.parse(read(path.join(source, 'registry/config.schema.json')));
  for (const item of index.items) {
    const canonical = Buffer.from(`${JSON.stringify(item, null, 2)}\n`);
    need(read(path.join(source, `registry/${item.name}.json`), GEN_RAW).equals(canonical)
      && read(path.join(source, `registry/items/${item.name}.json`), GEN_RAW).equals(canonical), 'generated_item_index_pair');
    need(Array.isArray(item.files) && new Set(item.files.map(file => file.path)).size === item.files.length, 'generated_payload_file_set');
    const files = new Map(item.files.map(file => [file.path, file.content]));
    for (const [file, bytes] of moduleBytes) need(files.get(file) === bytes, 'generated_fourteen_source_binding');
    need(files.get('components/mcpcn/LICENSE') === license.toString(), 'generated_payload_license');
    const styles = `${read(path.join(source, 'packages/react/src/styles.css')).toString()}\n${read(path.join(source, 'packages/themes/src/default.css')).toString()}`;
    need(files.get('components/mcpcn/styles.css') === styles && typeof files.get('components/mcpcn/provider.tsx') === 'string', 'generated_styles_provider');
    const block = item.type === 'registry:block';
    if (block) need(files.get('components/mcpcn/_mcpcn/blocks.tsx') === blockBytes, 'generated_block_source_binding');
    need(item.files.length === (block ? 19 : 18), 'generated_payload_closure_count');
    for (const file of item.files) need(typeof file.content === 'string' && !file.content.includes('@mcpcn/'), 'generated_unresolved_package_alias');
  }
  report.generation.verifiedSourceModulesPerItem = 14; report.generation.verifiedIndexPairs = 79;
}
function retainGenerated(snapshot) {
  const files = snapshot.files.map(row => ({ ...row, content: new TextDecoder('utf-8', { fatal: true }).decode(read(path.join(source, row.path), GEN_RAW)) }));
  const raw = Buffer.from(`${JSON.stringify({ schemaVersion: 'mcpcn.generated-v1.v1', sourceCommit, workflowCommit, files })}\n`);
  need(raw.length <= GEN_RAW, 'generated_bundle_raw_bound'); const packed = gzipSync(raw, { level: 9, mtime: 0 });
  need(packed.length <= GEN_GZIP, 'generated_bundle_gzip_bound');
  generatedEvidence = { name: 'generated-files.json', bytes: raw.length, sha256: sha(raw), gzipBytes: packed.length, packed };
  report.generation.returnedBundle = { name: generatedEvidence.name, bytes: raw.length, sha256: sha(raw), gzipBytes: packed.length, vectorSha256: snapshot.vectorSha256 };
}
function tarEntries(gz) {
  need(gz.length <= 2097152, 'archive_gzip_bound'); const raw = gunzipSync(gz, { maxOutputLength: 16777216 });
  const entries = new Map(); let offset = 0, ended = false;
  const string = bytes => { const i = bytes.indexOf(0); return bytes.subarray(0, i < 0 ? bytes.length : i).toString('utf8'); };
  const octal = bytes => { const value = string(bytes).trim(); need(/^[0-7]+$/.test(value), 'tar_octal_invalid'); const n = Number.parseInt(value, 8); need(Number.isSafeInteger(n), 'tar_integer_invalid'); return n; };
  while (offset + 512 <= raw.length) {
    const h = raw.subarray(offset, offset + 512); if (h.every(x => x === 0)) { need(raw.subarray(offset).every(x => x === 0), 'tar_trailing_data'); ended = true; break; }
    const stored = octal(h.subarray(148, 156)), checksum = [...h].reduce((sum, n, i) => sum + (i >= 148 && i < 156 ? 32 : n), 0); need(stored === checksum, 'tar_checksum_invalid');
    const prefix = string(h.subarray(345, 500)), base = string(h.subarray(0, 100)), name = prefix ? `${prefix}/${base}` : base;
    need(name.startsWith('package/') && !name.includes('\\') && !name.split('/').some(x => ['.', '..', ''].includes(x)) && !entries.has(name), 'tar_path_invalid');
    const kind = h[156], size = octal(h.subarray(124, 136)), mode = octal(h.subarray(100, 108));
    need(kind === 0 || kind === 48, 'tar_nonregular_member'); need((mode & 0o022) === 0 && (mode & 0o7000) === 0, 'tar_mode_invalid');
    need(size <= 4194304 && offset + 512 + size <= raw.length, 'tar_member_bound');
    const bytes = raw.subarray(offset + 512, offset + 512 + size); entries.set(name, { name, mode, bytes: size, sha256: sha(bytes), data: bytes });
    need(entries.size <= 250, 'tar_member_count'); offset += 512 + Math.ceil(size / 512) * 512;
  }
  need(ended, 'tar_missing_terminator'); return entries;
}

function inspectArchives() {
  const filenames = [];
  for (const directory of PACKAGES) {
    const manifest = JSON.parse(read(path.join(source, `packages/${directory}/package.json`)));
    need(typeof manifest.name === 'string' && /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(manifest.version), 'package_manifest_identity');
    const filename = `${manifest.name.replace(/^@/, '').replaceAll('/', '-')}-${manifest.version}.tgz`; filenames.push(filename);
    const bytes = read(path.join(archives, filename), 2097152), members = tarEntries(bytes);
    const packed = JSON.parse(members.get('package/package.json')?.data.toString() ?? 'null');
    need(packed?.name === manifest.name && packed.version === manifest.version, 'archive_package_identity');
    exact(packed.exports ?? null, manifest.exports ?? null, 'archive_exports_changed'); exact(packed.bin ?? null, manifest.bin ?? null, 'archive_bins_changed');
    need(members.get('package/LICENSE')?.data.equals(read(path.join(source, 'LICENSE'))), 'archive_license_missing');
    for (const [name, entry] of members) {
      const relative = name.slice('package/'.length);
      need(!/(?:^|\/)(?:node_modules|\.git|\.env[^/]*|\.npmrc|.*\.pem|.*\.key)(?:\/|$)/i.test(relative), 'archive_forbidden_content');
      need(relative === 'package.json' || relative === 'LICENSE' || relative === 'README.md' || relative.startsWith('dist/'), 'archive_unexpected_member');
      if (relative !== 'package.json') need(entry.sha256 === sha(read(path.join(source, 'packages', directory, relative))), 'archive_built_bytes_changed');
    }
    const row = { name: manifest.name, version: manifest.version, filename, bytes: bytes.length, sha256: sha(bytes), integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
      sourceManifestSha256: sha(read(path.join(source, `packages/${directory}/package.json`))), packedManifest: packed, members: [...members.values()].map(({ data, ...entry }) => entry) };
    report.archives.push(row); retain(filename, bytes);
  }
  exactSet(fs.readdirSync(archives), filenames, 'archive_directory_set');
  const summary = { schemaVersion: 1, sourceCommit, archives: report.archives.map(({ name, version, filename, bytes, sha256, integrity }) => ({ name, version, filename, bytes, sha256, integrity })) };
  const data = Buffer.from(`${JSON.stringify(summary, null, 2)}\n`), file = path.join(output, 'archive-manifest.json');
  fs.writeFileSync(file, data, { flag: 'wx', mode: 0o600 }); env.MCPCN_V1_ARCHIVE_MANIFEST = file; retain('archive-manifest.json', data);
}
function discoverUnitTests() {
  const paths = baseline.map(row => row.path).filter(name => /^packages\/react\/src\/v1-[a-z-]+\.test\.tsx$/.test(name) || name === 'packages/registry/src/v1-source.test.ts' || name === 'packages/cli/src/installer.test.ts').sort();
  need(['packages/react/src/v1-review.test.tsx', 'packages/react/src/v1-decision.test.tsx', 'packages/react/src/v1-execution.test.tsx', 'packages/registry/src/v1-source.test.ts'].every(name => paths.includes(name)), 'v1_test_files_missing');
  const ts = createRequire(path.join(source, 'package.json'))('typescript'); need(ts.version === '5.9.3', 'unit_parser_version');
  const files = [];
  for (const name of paths) {
    const bytes = read(path.join(source, name)), parsed = ts.createSourceFile(name, bytes.toString(), ts.ScriptTarget.Latest, true, name.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    need(parsed.parseDiagnostics.length === 0, 'unit_source_parse_failed'); const cases = [];
    function walk(node, parents = []) {
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        let head = expression; while (ts.isPropertyAccessExpression(head) || ts.isElementAccessExpression(head) || ts.isCallExpression(head)) head = ts.isCallExpression(head) ? head.expression : head.expression;
        const testCall = ts.isIdentifier(head) && ['it', 'test', 'describe'].includes(head.text);
        if (testCall) {
          const sequential = ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)
            && expression.expression.text === 'describe' && expression.name.text === 'sequential';
          need(ts.isIdentifier(expression) || sequential, 'dynamic_or_directive_test_definition');
          const title = node.arguments[0], callback = node.arguments[1];
          need(title && ts.isStringLiteral(title) && title.text.length > 0 && callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)), 'nonliteral_test_definition');
          if (head.text === 'describe') walk(callback.body, [...parents, title.text]);
          else cases.push([...parents, title.text].join(' '));
          return;
        }
      }
      ts.forEachChild(node, child => walk(child, parents));
    }
    walk(parsed); need(cases.length > 0 && new Set(cases).size === cases.length, 'unit_source_case_set');
    files.push({ path: name, sha256: sha(bytes), cases });
  }
  const count = files.reduce((sum, file) => sum + file.cases.length, 0);
  need(count === 107, 'unit_case_scope_changed'); report.unitManifest = { parserVersion: ts.version, files, cases: count,
    changedContractRegressionFile: 'packages/cli/src/installer.test.ts', wholeHistoricalPacketInvoked: false };
  return paths;
}
function parseUnitResults(bytes) {
  const result = JSON.parse(bytes), expected = new Map(report.unitManifest.files.flatMap(file => file.cases.map(name => [`${file.path}\0${name}`, true]))), found = new Set();
  need(result.success === true && result.numTotalTests === expected.size && result.numPassedTests === expected.size && result.numFailedTests === 0 && result.numPendingTests === 0 && result.numTodoTests === 0, 'unit_result_totals');
  exactSet(result.testResults.map(file => path.relative(source, file.name)), report.unitManifest.files.map(file => file.path), 'unit_result_files');
  for (const file of result.testResults) {
    need(file.status === 'passed', 'unit_file_failed');
    for (const row of file.assertionResults) {
      const fullName = [...row.ancestorTitles, row.title].join(' '), key = `${path.relative(source, file.name)}\0${fullName}`;
      need(row.fullName === fullName && row.status === 'passed' && Array.isArray(row.failureMessages) && row.failureMessages.length === 0 && expected.has(key) && !found.has(key), 'unit_case_identity_or_status'); found.add(key);
    }
  }
  need(found.size === expected.size, 'unit_result_case_count'); report.unitResults = { passed: true, cases: found.size, originalSha256: sha(bytes), files: result.testResults.length };
}
function original(value, limit = 524288) {
  need(value && typeof value.data === 'string' && value.encoding === 'gzip-base64' && Number.isSafeInteger(value.bytes) && value.bytes >= 0 && value.bytes <= limit && Number.isSafeInteger(value.compressedBytes), 'helper_original_shape');
  const zip = Buffer.from(value.data, 'base64'); need(zip.toString('base64') === value.data && zip.length === value.compressedBytes && zip.length <= limit + 1024, 'helper_original_base64');
  const data = gunzipSync(zip, { maxOutputLength: limit }); need(data.length === value.bytes && sha(data) === value.sha256, 'helper_original_hash'); return data;
}
async function installTools() {
  const npmCli = fs.realpathSync(path.join(path.dirname(process.execPath), 'npm'));
  report.runtime.npmCliSha256 = sha(read(npmCli));
  const tools = path.join(root, 'tools'), expected = { pnpm: '10.24.0', '@playwright/test': '1.65.0', playwright: '1.65.0' }, metadata = [];
  for (const [name, version] of Object.entries(expected)) {
    const row = await run(`metadata-${name.replaceAll(/[^a-z0-9]/g, '-')}`, process.execPath, [npmCli, 'view', `${name}@${version}`, 'name', 'version', 'dist', '--json'], 30, { cwd: tools });
    const value = JSON.parse(row.bytes[0]); need(value.name === name && value.version === version && value.dist.tarball.startsWith('https://registry.npmjs.org/') && /^sha512-[A-Za-z0-9+/]+=*$/.test(value.dist.integrity), 'tool_metadata_identity'); metadata.push(value);
  }
  fs.writeFileSync(path.join(tools, 'package.json'), JSON.stringify({ name: 'mcpcn-v1-owned-tools', private: true, dependencies: expected }), { flag: 'wx', mode: 0o600 });
  await run('tools-install', process.execPath, [npmCli, 'install', '--ignore-scripts', '--omit=optional', '--no-audit', '--no-fund'], 120, { cwd: tools });
  const bytes = read(path.join(tools, 'package-lock.json')), lock = JSON.parse(bytes);
  for (const value of metadata) { const entry = lock.packages[`node_modules/${value.name}`]; need(entry?.version === value.version && entry.resolved === value.dist.tarball && entry.integrity === value.dist.integrity, 'tool_lock_identity'); }
  const pins = {
    playwright: 'sha512-F3AMWcR44qMBt4kq+6Kb6mX7bjGXshktKFOPULd7reED6ZJWevjbNRqysP7q+AATE9kdPEZBibex1BYsvpVoeA==',
    'playwright-core': 'sha512-vNSKgH6YqtN7cdT/L334zo0a+YwkrpicyrHJlWWPIm/Q+Nn2SWInil01oT0mbu96U4GgoRtCYQD9CzJQgju+lA==',
  };
  for (const [name, integrity] of Object.entries(pins)) need(lock.packages[`node_modules/${name}`]?.version === '1.65.0' && lock.packages[`node_modules/${name}`].integrity === integrity, 'playwright_locked_integrity');
  retain('tools-lock.json', bytes); report.runtime.toolMetadata = metadata;
  const pnpm = path.join(tools, 'node_modules/pnpm/bin/pnpm.cjs'), playwright = path.join(tools, 'node_modules/playwright');
  report.runtime.pnpmExecutableSha256 = sha(read(pnpm)); report.runtime.playwrightExecutableSha256 = sha(read(path.join(playwright, 'cli.js')));
  need((await run('pnpm-version', process.execPath, [pnpm, '--version'], 10)).bytes[0].toString().trim() === '10.24.0', 'pnpm_runtime_version');
  env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, 'browsers'); fs.mkdirSync(env.PLAYWRIGHT_BROWSERS_PATH, { mode: 0o700 });
  env.MCPCN_V1_BROWSER_TOOLS = playwright;
  await run('chromium-install', process.execPath, [path.join(playwright, 'cli.js'), 'install', 'chromium'], 180);
  return { pnpm, playwright };
}

function discoverBrowserCases() {
  const name = 'tooling/v1-browser.spec.mjs', bytes = read(path.join(source, name));
  const ts = createRequire(path.join(source, 'package.json'))('typescript'), parsed = ts.createSourceFile(name, bytes.toString(), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  need(parsed.parseDiagnostics.length === 0, 'browser_source_parse_failed'); let table;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'CASES') { need(!table && node.initializer && ts.isArrayLiteralExpression(node.initializer), 'browser_case_table'); table = node.initializer; }
    ts.forEachChild(node, visit);
  }
  visit(parsed); need(table?.elements.length === 26, 'browser_case_count');
  const cases = table.elements.map((node, index) => {
    need(ts.isArrayLiteralExpression(node) && node.elements.length === 5 && node.elements.slice(0, 4).every(value => ts.isStringLiteral(value)) && ts.isIdentifier(node.elements[4]), 'browser_case_literal');
    const [id, title, profile, slug] = node.elements.slice(0, 4).map(value => value.text);
    need(id === `B${String(index + 1).padStart(2, '0')}` && profile === (index % 2 ? 'narrow' : 'desktop') && title.startsWith(`${id} ${profile} `), 'browser_case_identity');
    return { id, title, profile, slug, route: `/components/${slug}` };
  });
  exactSet(cases.map(row => row.title), cases.map(row => row.title), 'browser_unique_titles');
  const slugs = ['approval-card', 'schema-form', 'confirmation-panel', 'risk-review-panel', 'diff-viewer', 'source-evidence-panel', 'tool-call-card', 'retryable-error-state', 'auth-required-card', 'dynamic-question-flow', 'extracted-fields-review', 'comparison-matrix', 'score-breakdown'];
  exact(cases.map(row => row.slug), slugs.flatMap(slug => [slug, slug]), 'browser_component_scope');
  report.browserManifest = { path: name, sha256: sha(bytes), cases }; return cases;
}
async function readiness() {
  const end = Math.min(Date.now() + 60000, workEnd), route = '/components/tool-call-card'; report.readiness = { passed: false, route, attempts: [] };
  while (Date.now() < end) {
    need(serverHandle && !serverHandle.row.exitObserved, 'docs_server_exited_before_ready');
    const row = { at: new Date().toISOString(), status: null, bytes: 0, sha256: null, complete: false, error: null }; report.readiness.attempts.push(row);
    const body = await new Promise(resolve => {
      const pieces = []; let response, socket, ended = false, requestClosed = false, socketClosed = false, finished = false;
      const deadline = Math.min(Date.now() + 2000, end);
      const finish = () => {
        if (finished || !((ended && requestClosed && socketClosed) || row.error && requestClosed && (!socket || socketClosed))) return;
        finished = true; clearTimeout(timer); const bytes = Buffer.concat(pieces); row.sha256 = sha(bytes); row.complete = !row.error && response?.complete === true && Date.now() < deadline; resolve(bytes);
      };
      const fail = () => { row.error ??= 'readiness_http_failed'; response?.destroy(); request.destroy(); socket?.destroy(); finish(); };
      const request = http.get({ hostname: '127.0.0.1', port: 4173, path: route, agent: false, headers: { Connection: 'close' } }, incoming => {
        response = incoming; row.status = incoming.statusCode;
        incoming.on('data', chunk => { row.bytes += chunk.length; if (row.bytes <= 1048576) pieces.push(chunk); else { row.error = 'readiness_body_bound'; fail(); } });
        incoming.on('end', () => { ended = true; finish(); }); incoming.on('error', fail); incoming.on('aborted', fail);
      });
      request.on('socket', value => { socket = value; value.on('close', () => { socketClosed = true; finish(); }); });
      request.on('close', () => { requestClosed = true; finish(); }); request.on('error', fail);
      const timer = setTimeout(() => { if (finished) return; row.error = 'readiness_deadline'; request.destroy(); response?.destroy(); socket?.destroy(); finished = true; const bytes = Buffer.concat(pieces); row.sha256 = sha(bytes); resolve(bytes); }, Math.max(1, deadline - Date.now()));
    });
    if (row.status === 200 && row.complete && body.includes(Buffer.from('ToolCallCard')) && body.includes(Buffer.from('Review tool call'))) {
      retain('readiness.html', body); report.readiness.passed = true; return;
    }
    need(report.readiness.attempts.length <= 60, 'readiness_attempt_bound'); await pause(200);
  }
  need(false, 'docs_readiness_failed');
}
function parseBrowserResults(browserOutput, cases) {
  const reporter = JSON.parse(read(path.join(browserOutput, 'playwright.json'), 4194304)), tests = [];
  function visit(suite) { for (const spec of suite.specs ?? []) tests.push(spec); for (const child of suite.suites ?? []) visit(child); }
  for (const suite of reporter.suites ?? []) visit(suite);
  exactSet(tests.map(spec => spec.title), cases.map(row => row.title), 'browser_reporter_title_set');
  need(Array.isArray(reporter.errors) && reporter.errors.length === 0 && reporter.stats?.expected === 26 && reporter.stats.unexpected === 0 && reporter.stats.flaky === 0 && reporter.stats.skipped === 0, 'browser_reporter_totals');
  for (const spec of tests) need(spec.ok === true && spec.tests.length === 1 && spec.tests[0].status === 'expected' && spec.tests[0].results.length === 1
    && spec.tests[0].results[0].status === 'passed' && spec.tests[0].results[0].retry === 0, 'browser_reporter_status');
  const expectedFiles = ['playwright.json', ...cases.flatMap(row => [`${row.id}.json`, `${row.id}.png`])];
  exactSet(fs.readdirSync(browserOutput), expectedFiles, 'browser_output_file_set');
  const reports = [];
  for (const row of cases) {
    const bytes = read(path.join(browserOutput, `${row.id}.json`), 262144), value = JSON.parse(bytes);
    need(value.schemaVersion === 1 && value.sourceCommit === sourceCommit && value.caseId === row.id && value.title === row.title && value.profile === row.profile
      && value.route === row.route && value.origin === 'http://127.0.0.1:4173' && value.playwright === '1.65.0' && value.status === 'passed' && !value.failure, 'browser_case_identity_or_status');
    exact(value.viewport, row.profile === 'desktop' ? { width: 1280, height: 900 } : { width: 390, height: 844 }, 'browser_viewport');
    need(value.touchEmulated === (row.profile === 'narrow') && typeof value.browserVersion === 'string' && value.browserVersion.length > 0, 'browser_profile_runtime');
    exact(value.theme, row.profile === 'narrow' ? { mode: 'dark', backgroundColor: 'rgb(24, 24, 27)', color: 'rgb(250, 250, 250)' }
      : { mode: 'light', backgroundColor: 'rgb(255, 255, 255)', color: 'rgb(24, 24, 27)' }, 'browser_actual_theme');
    const viewport = value.observedViewport;
    need(viewport.innerWidth === value.viewport.width && viewport.innerHeight === value.viewport.height && viewport.documentWidth > 0 && viewport.documentWidth <= value.viewport.width + 1
      && (row.profile === 'narrow' ? viewport.maxTouchPoints > 0 : viewport.maxTouchPoints === 0), 'browser_actual_viewport');
    need(value.input[row.profile === 'narrow' ? 'trackedTaps' : 'trackedClicks'] > 0, 'browser_real_input');
    const cleanup = value.cleanup;
    need(cleanup.contextCreated === true && cleanup.contextClosed === true && cleanup.pagesCreated === 1 && cleanup.pagesClosed === 1 && cleanup.pendingRequests === 0 && cleanup.observerJobs === 0, 'browser_case_closure');
    need(['requestFailures', 'consoleErrors', 'pageErrors', 'webSockets', 'errorCount'].every(key => value.network[key] === 0) && value.network.errors.length === 0 && value.network.rows.length === value.network.requests, 'browser_fatal_boundary');
    for (const request of value.network.rows) {
      need(['GET', 'HEAD'].includes(request.method) && request.protocol === 'http:' && request.host === '127.0.0.1:4173' && request.status >= 200 && request.status < 400
        && request.terminal === 'finished' && request.responseFinished === 'null', 'browser_request_terminal');
      need(request.pathname.startsWith('/_next/static/') || baseline.some(file => file.path.startsWith('apps/docs/public/') && request.pathname === '/' + file.path.slice('apps/docs/public/'.length))
        || (request.pathname === '/icon.svg' && baseline.some(file => file.path === 'apps/docs/app/icon.svg'))
        || ['/', '/docs', '/components', '/blocks', '/examples', '/create', '/playground'].includes(request.pathname)
        || /^\/components\/[a-z][a-z0-9-]*$/.test(request.pathname), 'browser_unexpected_read_path');
    }
    const nav = value.navigation, originalRequest = value.network.rows.find(request => request.ordinal === nav.requestOrdinal);
    need(nav.status === 200 && nav.exactRequestIdentity === true && nav.requestFinished === 'finished' && nav.responseFinished === 'null'
      && originalRequest?.pathname === row.route && originalRequest.status === 200, 'browser_navigation_identity');
    need(Array.isArray(value.observations) && value.observations.length > 0 && value.observations.length <= 20, 'browser_observations_empty');
    const png = read(path.join(browserOutput, `${row.id}.png`), 262144);
    need(png.length > 0 && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && value.screenshot.filename === `${row.id}.png`
      && value.screenshot.bytes === png.length && value.screenshot.sha256 === sha(png) && value.screenshot.viewportOnly === true, 'browser_screenshot_binding');
    reports.push(value);
  }
  report.browser = { passed: true, cases: reports.map(value => ({ id: value.caseId, title: value.title, profile: value.profile, route: value.route,
    status: value.status, observedStages: value.observations.map(row => row.stage), networkCounters: Object.fromEntries(['requests', 'requestFailures', 'consoleErrors', 'pageErrors', 'webSockets', 'errorCount'].map(key => [key, value.network[key]])),
    cleanup: value.cleanup, screenshot: value.screenshot, originalSha256: sha(read(path.join(browserOutput, `${value.caseId}.json`), 262144)) })),
    reporterSha256: sha(read(path.join(browserOutput, 'playwright.json'), 4194304)) };
}
const collected = new Set();
function collectOutputs() {
  report.outputs ??= [];
  function visit(directory, prefix = '') {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${item.name}` : item.name; need(!relative.includes('..') && !item.isSymbolicLink(), 'output_path_invalid');
      if (item.isDirectory()) visit(path.join(directory, item.name), relative);
      else {
        need(item.isFile() && report.outputs.length < 250, 'output_file_bound');
        const bytes = read(path.join(directory, item.name), 4194304);
        if (collected.has(relative)) { const prior = report.outputs.find(file => file.path === relative); need(prior.bytes === bytes.length && prior.sha256 === sha(bytes), 'retained_output_changed'); continue; }
        const short = relative.replaceAll('/', '-');
        const name = short.length <= 135 && /^[A-Za-z0-9._-]+$/.test(short) ? `output-${short}` : `output-${sha(Buffer.from(relative)).slice(0, 32)}${path.extname(item.name)}`;
        retain(name, bytes); collected.add(relative); report.outputs.push({ path: relative, proofName: name, bytes: bytes.length, sha256: sha(bytes) });
      }
    }
  }
  visit(output);
}

function parseConsumers(bytes, stdout) {
  const value = JSON.parse(bytes), summary = JSON.parse(stdout.toString().trim());
  need(value.schemaVersion === 1 && value.sourceCommit === sourceCommit && value.passed === true && value.errors.length === 0, 'consumer_report_identity');
  exact(value.cases.map(row => [row.id, row.status, row.error]), [['C01-package', 'passed', null], ['C02-copy', 'passed', null]], 'consumer_case_set');
  exact(summary, { sourceCommit, passed: true, cases: value.cases.map(({ id, status, error }) => ({ id, status, error })), errors: [] }, 'consumer_stdout_parity');
  const labels = ['npm-version', ...['install', 'tree', 'cli-init', 'cli-add79', 'installed-probe', 'ts-version', 'typecheck'].map(step => `C01-package-${step}`),
    ...['install', 'tree', 'cli-init', 'cli-add79', 'ts-version', 'typecheck'].map(step => `C02-copy-${step}`)];
  exact(value.commands.map(row => row.label), labels, 'consumer_command_set');
  const childOriginals = new Map();
  for (const command of value.commands) {
    need(command.status === 0 && command.signal === null && command.error === null && command.exitObserved === true && command.closeObserved === true && command.groupAbsent === true
      && command.signals.length === 0 && Number.isFinite(command.deadline) && command.terminalClosedMs < command.deadline, 'consumer_command_terminal');
    exact(command.streams.map(stream => stream.name), ['stdout', 'stderr'], 'consumer_stream_set');
    const decoded = {};
    for (const stream of command.streams) { need(stream.eof === true && stream.descriptorClosed === true && stream.observedBytes === stream.bytes && stream.observedSha256 === stream.sha256, 'consumer_stream_terminal'); decoded[stream.name] = original(stream, 131072); }
    childOriginals.set(command.label, decoded);
  }
  exact(value.cleanup, { activeChildren: 0, allDirectChildrenReaped: true, allStreamsComplete: true, allOriginalGroupsAbsent: true, noSignals: true, parentOwnsWorkRemoval: true }, 'consumer_cleanup');
  exact(value.inputs.sourceBefore, value.inputs.sourceAfter, 'consumer_source_vector_changed'); exact(value.inputs.archivesBefore, value.inputs.archivesAfter, 'consumer_archive_vector_changed');
  exact(value.inputs.archiveManifestBefore, value.inputs.archiveManifestAfter, 'consumer_archive_manifest_changed');
  exactSet(value.archives.map(row => row.name), report.archives.map(row => row.name), 'consumer_archive_names');
  for (const archive of report.archives) { const row = value.archives.find(item => item.name === archive.name); need(row.filename === archive.filename && row.version === archive.version && row.bytes === archive.bytes && row.sha256 === archive.sha256 && row.integrity === archive.integrity, 'consumer_archive_binding'); }
  const names = ['ApprovalCard', 'ConfirmationPanel', 'RiskReviewPanel', 'ToolProgressTimeline', 'ToolCallCard', 'RetryableErrorState', 'SchemaForm', 'DynamicQuestionFlow', 'EntityReviewTable', 'ExtractedFieldsReview', 'DiffViewer', 'ComparisonMatrix', 'ScoreBreakdown', 'AuditTrail', 'SourceEvidencePanel', 'AuthRequiredCard'];
  const probe = value.cases[0].observations.installedProbe;
  exact(probe, JSON.parse(childOriginals.get('C01-package-installed-probe').stdout.toString()), 'consumer_probe_original_parity');
  exact(probe.exports, names, 'consumer_sixteen_exports');
  exact(probe.newImplementations, names.filter(name => !['ApprovalCard', 'ToolProgressTimeline', 'SchemaForm', 'EntityReviewTable', 'AuditTrail'].includes(name)), 'consumer_eleven_implementations');
  exact(probe.sourceModulePaths, MODULES.map(([, target]) => `_mcpcn/${target}`), 'consumer_fourteen_modules'); need(probe.publicRegistryGetter === true && probe.schemas.length === 16, 'consumer_public_schemas');
  const registry = JSON.parse(read(path.join(source, 'registry/registry.json'), GEN_RAW));
  exact(probe.schemas.map(row => row.slug), names.map(name => registry.items.find(item => item.title === name)?.name), 'consumer_schema_name_set');
  for (const entry of probe.schemas) exact(entry.schema, registry.items.find(item => item.name === entry.slug)?.meta.dataSchema, 'consumer_schema_registry_binding');
  for (const [index, mode] of ['package', 'copy'].entries()) {
    const row = value.cases[index].observations;
    need(row.selectedItems === 79 && row.unrelatedPreserved === true && row.strictTypecheck === true && row.compiler.version === '5.9.3' && row.compiler.skipLibCheck === false, 'consumer_actual_typecheck');
    need(row.files.length === (mode === 'copy' ? 97 : 80) && new Set(row.files.map(file => file.path)).size === row.files.length, 'consumer_written_file_count');
    const manifestBytes = original(row.manifestOriginal), configBytes = original(row.configOriginal), manifest = JSON.parse(manifestBytes), config = JSON.parse(configBytes);
    need(manifest.version === 2 && manifest.configHash === sha(configBytes) && row.manifestSha256 === sha(manifestBytes), 'consumer_manifest_original_binding');
    need(config.mode === mode && config.registry === pathToFileURL(path.join(source, 'registry/items')).href && config.componentsDir === 'src/mcpcn' && config.host === 'standard-mcp' && config.style === 'graphite', 'consumer_config');
    exactSet(Object.keys(manifest.items), seedNames, 'consumer_ownership_item_set');
    for (const file of row.files) {
      need(file.path.startsWith('src/mcpcn/') && !file.path.includes('..') && !file.path.includes('\\'), 'consumer_written_path');
      const data = read(path.join(root, 'consumers', mode, file.path)); need(data.length === file.bytes && sha(data) === file.sha256 && manifest.files[file.path]?.hash === file.sha256, 'consumer_written_hash');
    }
    const lock = JSON.parse(original(row.lockOriginal));
    for (const [name, version] of Object.entries({ react: '19.2.8', 'react-dom': '19.2.8', typescript: '5.9.3', zod: '4.4.3', '@modelcontextprotocol/ext-apps': '1.7.5', '@modelcontextprotocol/sdk': '1.30.0', '@types/react': '19.2.18', '@types/react-dom': '19.2.4' })) need(row.versions[name] === version && lock.packages[`node_modules/${name}`]?.version === version, 'consumer_installed_pins');
    need(row.selectedPackages.length === (mode === 'copy' ? 0 : 7) && row.launcher.actualInstalledLauncher === true, 'consumer_no_package_substitution');
    need(row.fixtureOriginals.length === 3, 'consumer_fixture_originals'); for (const file of row.fixtureOriginals) original(file);
  }
  report.consumers = { passed: true, originalSha256: sha(bytes), cases: value.cases.map(row => ({ id: row.id, status: row.status, selectedItems: row.observations.selectedItems,
    writtenFiles: row.observations.files.length, manifestSha256: row.observations.manifestSha256, compiler: row.observations.compiler, strictTypecheck: row.observations.strictTypecheck })), commands: value.commands.length, originalStreams: value.commands.length * 2,
    freshRegistryVectorSha256: generatedBaseline.vectorSha256, inputSourceFiles: value.inputs.sourceBefore.length };
}

async function emit(item, prefix, deadline) {
  const encoded = item.packed.toString('base64');
  async function line(value) {
    need(Date.now() < deadline, 'proof_stdout_deadline');
    if (process.stdout.write(value + '\n')) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { clean(); reject(new Error('proof_stdout_deadline')); }, Math.max(1, deadline - Date.now()));
      const drain = () => { clean(); resolve(); }, error = () => { clean(); reject(new Error('proof_stdout_error')); };
      const clean = () => { clearTimeout(timer); process.stdout.off('drain', drain); process.stdout.off('error', error); };
      process.stdout.once('drain', drain); process.stdout.once('error', error);
    });
  }
  await line(`${prefix}_FILE ${JSON.stringify({ name: item.name, bytes: item.bytes, sha256: item.sha256, gzipBytes: item.gzipBytes, chunks: Math.ceil(encoded.length / 3000) })}`);
  for (let index = 0; index * 3000 < encoded.length; index++) await line(`${prefix}_CHUNK ${JSON.stringify({ name: item.name, index, data: encoded.slice(index * 3000, (index + 1) * 3000) })}`);
}

try {
  captureProcessBaseline(); await guard('before'); exportSource(); generationScope(); guardExport('before');
  fs.mkdirSync(env.npm_config_cache, { recursive: true, mode: 0o700 });
  const tools = await installTools();
  const pnpm = (label, args, seconds, options) => run(label, process.execPath, [tools.pnpm, `--config.store-dir=${path.join(root, 'cache', 'pnpm-store')}`, ...args], seconds, options);
  report.install = { lockSha256: sha(read(path.join(source, 'pnpm-lock.yaml'))), ignoreScripts: true, frozenLockfile: true, registry: env.npm_config_registry };
  await pnpm('frozen-install', ['install', '--frozen-lockfile', '--ignore-scripts', '--reporter=append-only'], 240);
  guardExport('after-install');
  for (const name of PACKAGES) await pnpm(`build-${name}`, ['--filter', name === 'cli' ? 'mcpcn' : `@mcpcn/${name}`, 'build'], 90);
  guardExport('after-seven-builds'); await guard('after-seven-builds');
  await pnpm('generate-first', ['exec', 'tsx', 'tooling/generate.ts'], 60);
  guardExport('after-first-generation'); verifyGenerated(); generatedBaseline = snapshotGenerated('first-generation');
  await pnpm('generate-second', ['exec', 'tsx', 'tooling/generate.ts'], 60);
  guardExport('after-second-generation'); const second = snapshotGenerated('second-generation');
  exact(second.files, generatedBaseline.files, 'generation_not_deterministic'); report.generation.determinism = true;
  report.generation.changedSeedPaths = generatedBaseline.files.filter(file => baseline.find(seed => seed.path === file.path)?.sha256 !== file.sha256).map(file => file.path);
  retainGenerated(generatedBaseline); await guard('after-generation');
  const selected = discoverUnitTests(), unitFile = path.join(output, 'vitest.json');
  const unit = await pnpm('v1-unit-and-cli-regressions', ['exec', 'vitest', 'run', ...selected, '--reporter=json', `--outputFile=${unitFile}`], 150, { allowFailure: true });
  collectOutputs(); need(fs.existsSync(unitFile), 'unit_original_missing'); parseUnitResults(read(unitFile, 4194304)); need(unit.row.passed, 'unit_command_failed');
  const docs = await pnpm('docs-production-build', ['--filter', '@mcpcn/docs', 'build'], 180); report.docsBuild = { passed: docs.row.passed, actualCommand: 'pnpm --filter @mcpcn/docs build', output: '.next', configurationChanged: false };
  guardExport('after-docs-build'); exact(snapshotGenerated('after-docs-build').files, generatedBaseline.files, 'docs_changed_generated_inputs');
  for (const name of PACKAGES) await pnpm(`pack-${name}`, ['--dir', path.join(source, 'packages', name), 'pack', '--pack-destination', archives], 45);
  inspectArchives(); guardExport('after-pack');
  need(workEnd - Date.now() >= 760000, 'consumer_and_browser_full_budgets_not_reserved');
  const consumers = await run('fresh-installed-consumers', process.execPath, [path.join(source, 'tooling/v1-installed-consumer.mjs')], 310, { allowFailure: true });
  collectOutputs(); const consumerFile = path.join(output, 'consumers.json'); need(fs.existsSync(consumerFile), 'consumer_original_missing');
  parseConsumers(read(consumerFile, 4194304), consumers.bytes[0]); need(consumers.row.passed, 'consumer_command_failed');
  guardExport('after-consumers'); exact(snapshotGenerated('after-consumers').files, generatedBaseline.files, 'consumer_changed_generated_inputs');
  const cases = discoverBrowserCases(), browserOutput = path.join(output, 'browser'); fs.mkdirSync(browserOutput, { mode: 0o700 });
  env.MCPCN_V1_BROWSER_OUTPUT = browserOutput; env.MCPCN_V1_ORIGIN = 'http://127.0.0.1:4173';
  need(workEnd - Date.now() >= 430000, 'browser_full_budget_not_reserved');
  const next = fs.realpathSync(path.join(source, 'apps/docs/node_modules/next/dist/bin/next'));
  report.runtime.next = { version: JSON.parse(read(path.join(source, 'apps/docs/node_modules/next/package.json'))).version, cliSha256: sha(read(next)) };
  serverPromise = run('docs-production-server', process.execPath, [next, 'start', '--hostname', '127.0.0.1', '--port', '4173'], Math.floor((workEnd - Date.now()) / 1000),
    { cwd: path.join(source, 'apps/docs'), service: true, allowFailure: true, onSpawn: value => { serverHandle = value; } });
  serverPromise.catch(() => {}); await readiness();
  const config = path.join(root, 'tools/playwright.config.cjs');
  fs.writeFileSync(config, `module.exports=${JSON.stringify({ testDir: path.join(source, 'tooling'), testMatch: 'v1-browser.spec.mjs', workers: 1, retries: 0, timeout: 30000, globalTimeout: 350000,
    reporter: [['json', { outputFile: path.join(browserOutput, 'playwright.json') }]], outputDir: path.join(output, 'browser-runner-artifacts'), projects: [{ name: 'chromium', use: { browserName: 'chromium', headless: true } }] })};\n`, { flag: 'wx', mode: 0o600 });
  const browser = await run('v1-production-browser', process.execPath, [path.join(tools.playwright, 'cli.js'), 'test', '--config', config], 360, { allowFailure: true });
  collectOutputs(); parseBrowserResults(browserOutput, cases); need(browser.row.passed, 'browser_command_failed');
  serverHandle.stop(); const stopped = await serverPromise; need(stopped.row.passed, 'production_server_close_unproved');
  guardExport('after-browser'); exact(snapshotGenerated('after-browser').files, generatedBaseline.files, 'browser_changed_generated_inputs');
  await guard('after-acceptance');
} catch (error) { report.errors.push(finite(error)); }
finally {
  cleanupEnd = Math.min(Date.now() + 90000, jobStart + 1200000 - 15000);
  if (serverHandle && !serverHandle.row.closeObserved) serverHandle.stop();
  if (serverPromise) try { const result = await serverPromise; if (!result.row.passed) report.errors.push('production_server_close_unproved'); } catch (error) { report.errors.push(finite(error)); }
  try { collectOutputs(); } catch (error) { report.errors.push(finite(error)); }
  try { await guard('after', true); if (baseline && generatedPaths) guardExport('after'); } catch (error) { report.errors.push(finite(error)); }
  try {
    owner(); for (const child of commands) child.releaseStop?.('cleanup_active_child');
    let rows = scan();
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      for (const item of rows) { const fresh = proc(item.pid); need(same(item, fresh), 'cleanup_pid_changed'); process.kill(item.pid, signal); report.errors.push('cleanup_signal_required'); }
      const until = Math.min(cleanupEnd, Date.now() + 5000); do { await pause(100); rows = scan(); } while (rows.length && Date.now() < until);
    }
    report.cleanup.ownedProcessesRemaining = rows.length;
    need(!rows.length && !report.cleanup.uncertain && report.commands.every(command => !command.pid || (command.exitObserved && command.closeObserved && command.groupAbsent === true && command.streams.every(stream => stream.complete))), 'closure_unproved');
    owner(); fs.rmSync(root, { recursive: true, force: false, maxRetries: 0 }); report.cleanup.rootRemoved = !fs.existsSync(root); need(report.cleanup.rootRemoved, 'scratch_not_removed'); report.cleanup.passed = true;
  } catch (error) { report.errors.push(finite(error)); }
  for (const [name, handler] of signals) process.off(name, handler);
  if (interrupted) report.errors.push('interrupted'); report.completedAt = new Date().toISOString();
  report.status = !report.errors.length && report.unitResults?.passed && report.consumers?.passed && report.browser?.passed && report.docsBuild?.passed && report.generation?.determinism && generatedEvidence && report.archives.length === 7 && report.cleanup.passed ? 'passed' : 'failed';
  if (report.generation) report.generation.tested = report.status === 'passed';
  report.proof = { normalGzipBytesBeforeReceipt: evidenceBytes, generatedGzipBytes: generatedEvidence?.gzipBytes ?? 0, finalStdoutSeconds: 20 };
  try { retain('receipt.json', Buffer.from(`${JSON.stringify(report, null, 2)}\n`)); } catch (error) { report.status = 'failed'; report.errors.push(finite(error)); }
  try {
    const end = Math.min(Date.now() + 20000, jobStart + 1200000 - 5000);
    for (const file of evidence) await emit(file, 'MCPCN_V1', end);
    if (generatedEvidence) await emit(generatedEvidence, 'MCPCN_V1_GENERATED', end);
    process.stdout.write(`MCPCN_V1_RESULT=${JSON.stringify({ status: report.status, sourceCommit, workflowCommit, errors: report.errors, unitCases: report.unitResults?.cases ?? 0, consumers: report.consumers?.passed === true, browserCases: report.browser?.cases.length ?? 0, generatedBundleSha256: generatedEvidence?.sha256 ?? null })}\n`);
  } catch (error) { report.status = 'failed'; report.errors.push(finite(error)); process.stdout.destroy(); }
  process.exitCode = report.status === 'passed' ? 0 : 1;
}

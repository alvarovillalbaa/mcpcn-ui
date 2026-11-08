// Approval-cohort protocol: exact-source generation, five dedicated consumers and focused browser checks.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ACTIVE = '.github/workflows/approval-components-checks.yml';
const BASE = '3e9e787863002c59b13736597a416019035508d1';
const COMPONENTS = [['approval-checklist', 'ApprovalChecklist'], ['before-submit-confirmation', 'BeforeSubmitConfirmation'],
  ['destructive-action-guard', 'DestructiveActionGuard'], ['human-override-panel', 'HumanOverridePanel'], ['permission-request-card', 'PermissionRequestCard']];
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
const jobStart = Number(process.env.MCPCN_APPROVALS_JOB_STARTED_MS);
need(Number.isSafeInteger(jobStart) && jobStart <= Date.now() && jobStart > Date.now() - 300000, 'job_start_invalid');
const taskStartTicks = process.env.MCPCN_APPROVALS_START_TICKS;
need(/^[1-9][0-9]{0,19}$/.test(taskStartTicks ?? ''), 'task_start_ticks_required');
const workflowCommit = process.env.GITHUB_SHA;
need(/^[a-f0-9]{40}$/.test(workflowCommit ?? '') && workflowCommit !== sourceCommit, 'workflow_commit_required_and_distinct');
const workEnd = Math.min(Date.now() + 1020000, jobStart + 1200000 - 90000 - 30000);
const repo = fs.realpathSync(process.cwd()), parent = fs.realpathSync(process.env.RUNNER_TEMP ?? '');
const root = fs.mkdtempSync(path.join(parent, 'mcpcn-approvals-')); fs.chmodSync(root, 0o700);
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
  MCPCN_APPROVALS_RUN_ROOT: root, MCPCN_APPROVALS_NONCE: nonce, MCPCN_APPROVALS_ARCHIVES: archives,
  MCPCN_APPROVALS_OUTPUT: output, MCPCN_APPROVALS_WORK: path.join(root, 'consumers'), MCPCN_APPROVALS_SOURCE_ROOT: source,
  NEXT_TELEMETRY_DISABLED: '1', SOURCE_COMMIT: sourceCommit };
const report = { schemaVersion: 'mcpcn.approval-components-checks.v1', sourceCommit, workflowCommit, status: 'failed', startedAt: new Date().toISOString(),
  runtime: { node: process.version, executableSha256: sha(fs.readFileSync(process.execPath)), platform: process.platform, architecture: process.arch },
  limits: { jobSeconds: 1200, workMaximumSeconds: 1020, cleanupSeconds: 90, marginSeconds: 30, streamBytes: STREAM, normalProofGzipBytes: PROOF,
    generatedRawBytes: GEN_RAW, generatedGzipBytes: GEN_GZIP, allProofGzipBytes: PROOF + GEN_GZIP, termGraceSeconds: 5, killDrainSeconds: 5 },
  timing: { jobStartedMs: jobStart, admittedAtMs: Date.now(), workEndMs: workEnd }, commands: [], sourceGuards: [], archives: [], errors: [],
  processBaseline: { taskStartTicks, limit: 2048, complete: false, identities: [], ancestors: [], errors: [], exclusionScope: 'exact_unchanged_pre_task_identities_and_supervisor_ancestors_only' },
  cleanup: { passed: false, rootRemoved: false, ownedProcessesRemaining: null, uncertain: false, processes: [], scanErrors: [], scanErrorCount: 0,
    baselineSkipped: [], ancestorSkipped: [], dispositions: { vanished: 0, pid_reused: 0, stable_unreadable: 0, identity_recheck_failed: 0 } },
  proofLimits: ['Only five new approval schema/React/fixture/registry/docs test files, two newly installed relevant consumer profiles and twelve new approval browser cases are invoked. Historical packets and edited older test files are not rerun.',
    'The checked Git commit contains the original registry seed. Fresh generated bytes are separately hashed, tested and returned, not relabelled as bytes present in that Git commit.',
    'Only 160 registry JSON paths and seven package LICENSE files may change as generated source. Exact declared build/stage directories are owned outputs verified separately; canonical checkout and all nongenerated exported source bytes/modes remain unchanged.',
    'The docs use their actual Next production server; both CLI services use the newly installed archive entry. Requested service SIGTERM is separately attributed; finite commands require zero exit and full original closure.',
    'The first ten browser cases use actual SDK iframes with an authored fixture host; the last two inspect direct docs consumer callbacks. No external MCP host, permission grant, publication, credentials, provider/model, account, untrusted-HTML isolation or physical-device proof is included.',
    'Process evidence uses exact direct-launch identities, nonce-marked indirect processes and fresh child/parent/group bindings to prior direct/nonce ownership; finite unknown reads remain fatal. This is not a host-wide sandbox.'] };
const commands = new Set(), evidence = [], observed = new Map();
let baseline, exportedEntries, cleanupEnd, interrupted = false, evidenceBytes = 0, generatedEvidence = null, playgroundAssetBaseline = null;
const services = new Map();
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
function verifiedOwnedParentAndGroup(info) {
  const attempt = { child: info, disposition: 'unproven', failure: null, before: null, after: null, anchors: {} };
  report.cleanup.ownershipAttempts ??= []; report.cleanup.ownershipAttemptCount = (report.cleanup.ownershipAttemptCount ?? 0) + 1;
  if (report.cleanup.ownershipAttempts.length < 64) report.cleanup.ownershipAttempts.push(attempt);
  const refuse = code => { attempt.failure = code; return null; };
  try {
    const parentBefore = proc(info.ppid), groupBefore = proc(info.pgid), childBefore = proc(info.pid);
    attempt.before = { child: childBefore, parent: parentBefore, groupLeader: groupBefore };
    const cutoff = BigInt(taskStartTicks);
    if (!parentBefore || !groupBefore || !same(info, childBefore) || info.ppid !== childBefore.ppid
      || info.ppid === info.pid || parentBefore.uid !== info.uid || groupBefore.uid !== info.uid
      || parentBefore.pgid !== info.pgid || groupBefore.pgid !== info.pgid || groupBefore.pid !== info.pgid
      || BigInt(info.starttime) < cutoff || BigInt(parentBefore.starttime) < cutoff || BigInt(groupBefore.starttime) < cutoff
      || BigInt(parentBefore.starttime) > BigInt(info.starttime) || BigInt(groupBefore.starttime) > BigInt(info.starttime)) return refuse('anchor_structure_unproved');
    const known = (current, role) => {
      const anchor = { identity: current, disposition: 'unproven', errno: null, identityAfter: null }; attempt.anchors[role] = anchor;
      const direct = report.commands.find(command => same(command.identity, current));
      if (direct) { anchor.disposition = 'prior_direct'; return { method: 'direct_command_identity', label: direct.label, identity: direct.identity }; }
      const prior = observed.get(`${current.pid}:${current.starttime}`);
      if (same(prior, current) && ['nonce_environment', 'direct_command_identity'].includes(prior.ownershipMethod)) {
        anchor.disposition = 'prior_independent'; return { method: prior.ownershipMethod, label: prior.directCommandLabel, identity: prior };
      }
      if (prior) { anchor.disposition = 'derived_anchor_ineligible'; return null; }
      report.cleanup.anchorNonceProbeCount = (report.cleanup.anchorNonceProbeCount ?? 0) + 1;
      if (report.cleanup.anchorNonceProbeCount > 64) { anchor.disposition = 'probe_bound'; return null; }
      let raw;
      try { raw = readProc(`/proc/${current.pid}/environ`, 1048576); }
      catch (error) { anchor.disposition = 'nonce_read_failed'; anchor.errno = processErrorCode(error); return null; }
      const fields = raw.toString().split('\0'), nonceNamespace = ['MCPCN_APPROVALS'].find(prefix =>
        fields.includes(`${prefix}_RUN_ROOT=${root}`) && fields.includes(`${prefix}_NONCE=${nonce}`));
      try { anchor.identityAfter = proc(current.pid); }
      catch (error) { anchor.disposition = 'identity_recheck_failed'; anchor.errno = processErrorCode(error); return null; }
      if (!same(current, anchor.identityAfter) || current.ppid !== anchor.identityAfter.ppid) { anchor.disposition = 'identity_changed'; return null; }
      if (!nonceNamespace) { anchor.disposition = 'nonce_absent'; return null; }
      const owned = { ...current, ownershipMethod: 'nonce_environment', directCommandLabel: null, nonceNamespace,
        nonceObservation: { source: 'fresh_anchor_probe', before: current, after: anchor.identityAfter } };
      observed.set(`${current.pid}:${current.starttime}`, owned); report.cleanup.processes.push(owned); anchor.disposition = 'fresh_nonce_verified';
      return { method: 'nonce_environment', label: null, identity: owned };
    };
    const parent = known(parentBefore, 'parent'), group = known(groupBefore, 'groupLeader');
    if (!parent || !group) return refuse('anchor_independent_ownership_unproved');
    const childAfter = proc(info.pid), parentAfter = proc(info.ppid), groupAfter = proc(info.pgid);
    attempt.after = { child: childAfter, parent: parentAfter, groupLeader: groupAfter };
    if (!same(childBefore, childAfter) || childAfter.ppid !== info.ppid || !same(parentBefore, parentAfter) || parentBefore.ppid !== parentAfter.ppid
      || !same(groupBefore, groupAfter) || groupBefore.ppid !== groupAfter.ppid) return refuse('fresh_identity_recheck_unproved');
    attempt.disposition = 'accepted';
    return { taskStartTicks, childBefore, childAfter,
      parent: { provenance: parent, before: parentBefore, after: parentAfter },
      groupLeader: { provenance: group, before: groupBefore, after: groupAfter } };
  } catch (error) { attempt.errno = processErrorCode(error); return refuse('ownership_probe_failed'); }
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
      let ownershipMethod = direct ? 'direct_command_identity' : observed.has(key) ? 'previously_observed_owned_identity' : 'nonce_environment';
      let ownershipProof = null, nonceNamespace = null;
      if (!direct && !observed.has(key)) {
        phase = 'environment'; let raw;
        try { raw = readProc(`/proc/${pid}/environ`, 1048576); }
        catch (error) {
          if (typeof error?.code !== 'string') throw error;
          ownershipProof = verifiedOwnedParentAndGroup(info);
          if (!ownershipProof) throw error;
          ownershipProof.environmentReadError = processErrorCode(error);
          ownershipMethod = 'verified_owned_parent_and_group';
        }
        if (!ownershipProof) {
          const fields = raw.toString().split('\0');
          nonceNamespace = ['MCPCN_APPROVALS'].find(prefix => fields.includes(`${prefix}_RUN_ROOT=${root}`) && fields.includes(`${prefix}_NONCE=${nonce}`)) ?? null;
          if (!nonceNamespace) continue;
        }
      }
      phase = 'identity_after'; const after = proc(pid);
      if (!after) { const error = new Error('process_identity_changed'); throw error; }
      if (info.starttime !== after.starttime) continue;
      need(same(info, after), 'process_identity_changed');
      if (ownershipProof) need(info.ppid === after.ppid, 'process_parent_changed');
      const owned = { ...info, ownershipMethod, directCommandLabel: direct?.label ?? null, ...(nonceNamespace ? { nonceNamespace } : {}), ...(ownershipProof ? { ownershipProof } : {}) };
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
  const serviceKind = !service ? null : label === 'docs-production-server' ? 'next' : ['installed-cli-dev-server', 'installed-cli-preview-server'].includes(label) ? 'installed_cli' : null;
  need(!service || serviceKind !== null, 'unknown_service_contract');
  const row = { label, executable, arguments: args.map(arg => String(arg).replaceAll(root, '[owned-root]')),
    cwd: cwd.replaceAll(root, '[owned-root]'), startedAt: new Date().toISOString(), deadlineMs: deadline, terminalClosedMs: null, pid: null, identity: null, code: null, signal: null, error: null,
    exitObserved: false, closeObserved: false, groupAbsent: null, signals: [], streams: [], expectedService: service, serviceStopRequestedAtMs: null,
    expectedServiceKind: serviceKind, expectedTerminal: !service ? 'exit_0_no_signal' : serviceKind === 'installed_cli' ? 'exit_143_signal_null_after_own_term' : 'exit_0_or_143_or_sigterm_after_own_term', acceptedTerminalShape: null };
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
  const serviceTerminal = serviceKind === 'installed_cli' ? row.signal === null && row.code === 143
    : serviceKind === 'next' && (row.signal === 'SIGTERM' || (row.signal === null && (row.code === 0 || row.code === 143)));
  const expectedService = service && row.serviceStopRequestedAtMs !== null && row.signals.length === 1 && row.signals[0] === 'SIGTERM'
    && serviceTerminal;
  row.acceptedTerminalShape = service ? expectedService : normalCommand;
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
  need(tree.size <= 1500, 'source_count_bound');
  if (!baseline) {
    need((await get(['rev-list', '--parents', '-n', '1', 'HEAD'])).toString().trim() === `${sourceCommit} ${BASE}`, 'source_direct_parent_required');
    need(!tree.has(ACTIVE), 'source_active_workflow_forbidden');
    const prior = new Map();
    for (const entry of (await get(['ls-tree', '-r', '-z', BASE])).toString().split('\0').filter(Boolean)) {
      const [head, name] = entry.split('\t'), [mode, type, blob] = head.split(' ');
      need(type === 'blob' && ['100644', '100755'].includes(mode), 'baseline_source_type_invalid'); prior.set(name, { mode, blob });
    }
    const protectedPath = name => name === 'package.json' || name.endsWith('/package.json')
      || ['pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc'].includes(name)
      || ['apps/playground/src/frame.tsx', 'apps/playground/src/host-session.ts', 'apps/playground/src/editor.ts',
        'packages/react/src/component-helpers.tsx', 'packages/react/src/component-types.ts'].includes(name)
      || /^(?:packages\/(?:runtime|server|core)\/|registry\/)/.test(name) || /^packages\/[^/]+\/LICENSE$/.test(name);
    const protectedNames = [...new Set([...prior.keys(), ...tree.keys()])].filter(protectedPath).sort();
    for (const name of protectedNames) need(prior.has(name) && tree.has(name)
      && prior.get(name).mode === tree.get(name).mode && prior.get(name).blob === tree.get(name).blob, 'protected_dependency_runtime_or_seed_changed');
    report.sourceAdmission = { baseCommit: BASE, directParent: true, activeWorkflowAbsent: true,
      sourceFileLimit: 1500, protectedFiles: protectedNames, protectedPathsUnchanged: true, generatedSeedUnchanged: true };
  }
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
  const prefixes = ['packages/', 'apps/docs/', 'apps/playground/', 'registry/', 'templates/', 'examples/'];
  const tools = ['tooling/generate.ts', 'tooling/stage-playground.mjs', 'tooling/approval-browser.spec.mjs', 'tooling/approval-installed-consumer.mjs'];
  exportedEntries = baseline.filter(entry => !entry.path.startsWith('apps/docs/public/playground-simulator/')
    && (!entry.path.includes('/') || prefixes.some(prefix => entry.path.startsWith(prefix)) || tools.includes(entry.path)));
  need(tools.every(name => exportedEntries.some(entry => entry.path === name)), 'runtime_owner_file_missing');
  let total = 0;
  for (const entry of exportedEntries) {
    const b = read(path.join(repo, entry.path));
    need(b.length === entry.bytes && sha(b) === entry.sha256
      && sha(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b]), 'sha1') === entry.gitBlob, 'export_read_source_binding');
    const publicWorkspaceConfig = entry.path === '.npmrc' && b.equals(Buffer.from('auto-install-peers=true\nstrict-peer-dependencies=false\nlink-workspace-packages=true\n'));
    need(publicWorkspaceConfig || !/(?:^|\/)(?:\.git|node_modules|\.npmrc|\.env(?!\.example$)[^/]*|id_rsa|id_ed25519|[^/]*\.(?:pem|key))(?:\/|$)/.test(entry.path), 'source_secret_or_dependency_path');
    const target = path.join(source, entry.path); fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    total += b.length; need(total <= 67108864, 'export_total_bound');
    fs.writeFileSync(target, b, { flag: 'wx', mode: entry.mode === '100755' ? 0o700 : 0o600 });
    need(read(target).equals(b), 'export_written_source_binding');
  }
  report.export = { files: exportedEntries.length, bytes: total, sourceFiles: baseline.length, excludedFiles: baseline.length - exportedEntries.length,
    includedPrefixes: prefixes, toolingFiles: tools, rootMetadataIncluded: true, excludedBuiltSimulator: true,
    originalModesRecorded: true, copiedPermissions: 'owner-only', filesVector: exportedEntries.map(({ path, mode, bytes, sha256, gitBlob }) => ({ path, mode, bytes, sha256, gitBlob })) };
}

const MODULES = [
  ['packages/core/src/index.ts', 'core.ts'], ['packages/schemas/src/index.ts', 'schemas.ts'],
  ['packages/react/src/index.tsx', 'components.tsx'], ['packages/runtime/src/index.tsx', 'runtime.tsx'],
  ['packages/schemas/src/schema-common.ts', 'schema-common.ts'], ['packages/schemas/src/review-schemas.ts', 'review-schemas.ts'],
  ['packages/schemas/src/decision-schemas.ts', 'decision-schemas.ts'], ['packages/schemas/src/execution-schemas.ts', 'execution-schemas.ts'],
  ['packages/react/src/primitives.tsx', 'primitives.tsx'], ['packages/react/src/component-helpers.tsx', 'component-helpers.tsx'],
  ['packages/react/src/review-components.tsx', 'review-components.tsx'], ['packages/react/src/decision-components.tsx', 'decision-components.tsx'],
  ['packages/react/src/execution-components.tsx', 'execution-components.tsx'], ['packages/react/src/component-types.ts', 'component-types.ts'],
  ['packages/schemas/src/approval-schemas.ts', 'approval-schemas.ts'], ['packages/react/src/approval-components.tsx', 'approval-components.tsx'],
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
  need(generatedPaths.size === 167 && MODULES.length === 16, 'generation_scope_count');
  report.generation = { seedCommit: sourceCommit, seedRegistrySha256: sha(read(path.join(source, 'registry/registry.json'))), registryPaths: 160, licensePaths: 7,
    items: 79, sourceModules: MODULES.map(([file, target]) => ({ path: file, target: `components/mcpcn/_mcpcn/${target}`, sha256: sha(read(path.join(source, file))) })), snapshots: [], determinism: false, tested: false };
}
function guardExport(label) {
  const result = { label, passed: false }; report.exportGuards ??= []; report.exportGuards.push(result);
  const tracked = new Set(exportedEntries.map(entry => entry.path));
  function walk(directory, relative = '') {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = relative ? `${relative}/${item.name}` : item.name;
      if (item.name === 'node_modules' || ['apps/docs/.next', 'apps/playground/dist', 'apps/docs/public/playground-simulator'].includes(name) || /^packages\/(?:core|schemas|runtime|react|themes|registry|cli)\/dist$/.test(name)) continue;
      if (item.isDirectory()) walk(path.join(directory, item.name), name);
      else {
        need(item.isFile() && !item.isSymbolicLink(), 'export_unexpected_type');
        need(tracked.has(name) || generatedPaths.has(name) || /^(?:packages\/(?:core|schemas|runtime|react|themes|registry|cli)|apps\/(?:docs|playground))\/tsconfig\.tsbuildinfo$/.test(name), 'export_unexpected_file');
      }
    }
  }
  walk(source);
  for (const entry of exportedEntries) {
    if (generatedPaths.has(entry.path)) continue;
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
    for (const [file, bytes] of moduleBytes) need(files.get(file) === bytes, 'generated_sixteen_source_binding');
    need(files.get('components/mcpcn/LICENSE') === license.toString(), 'generated_payload_license');
    const styles = `${read(path.join(source, 'packages/react/src/styles.css')).toString()}\n${read(path.join(source, 'packages/themes/src/default.css')).toString()}`;
    need(files.get('components/mcpcn/styles.css') === styles && typeof files.get('components/mcpcn/provider.tsx') === 'string', 'generated_styles_provider');
    const block = item.type === 'registry:block';
    if (block) need(files.get('components/mcpcn/_mcpcn/blocks.tsx') === blockBytes, 'generated_block_source_binding');
    need(item.files.length === (block ? 21 : 20), 'generated_payload_closure_count');
    for (const file of item.files) need(typeof file.content === 'string' && !file.content.includes('@mcpcn/'), 'generated_unresolved_package_alias');
  }
  need(index.items.filter(item => item.meta?.implementation === 'specialized').length === 21
    && index.items.filter(item => item.meta?.implementation === 'generic-alias').length === 35, 'fresh_implementation_counts');
  for (const [slug, title] of COMPONENTS) {
    const item = index.items.find(item => item.name === slug), schema = item?.meta?.dataSchema;
    need(item?.title === title && item?.meta?.implementation === 'specialized' && schema?.type === 'object'
      && schema.additionalProperties === false && schema.properties?.reviewId?.type === 'string'
      && schema.properties?.title?.type === 'string' && schema.properties?.disabled?.default === false
      && schema.required?.includes('reviewId') && schema.required?.includes('title')
      && item.meta.provenance.sourceFiles.includes('packages/schemas/src/approval-schemas.ts')
      && item.meta.provenance.sourceFiles.includes('packages/react/src/approval-components.tsx'), 'fresh_approval_metadata');
  }
  report.generation.verifiedSourceModulesPerItem = 16; report.generation.verifiedIndexPairs = 79;
  report.generation.implementationCounts = { specialized: 21, genericAlias: 35 }; report.generation.approvalSlugs = COMPONENTS.map(([slug]) => slug);
}
function retainGenerated(snapshot) {
  const files = snapshot.files.map(row => ({ ...row, content: new TextDecoder('utf-8', { fatal: true }).decode(read(path.join(source, row.path), GEN_RAW)) }));
  const raw = Buffer.from(`${JSON.stringify({ schemaVersion: 'mcpcn.approval-components-generated.v1', sourceCommit, workflowCommit, files })}\n`);
  need(raw.length <= GEN_RAW, 'generated_bundle_raw_bound'); const packed = gzipSync(raw, { level: 9, mtime: 0 });
  need(packed.length <= GEN_GZIP, 'generated_bundle_gzip_bound');
  generatedEvidence = { name: 'generated-files.json', bytes: raw.length, sha256: sha(raw), gzipBytes: packed.length, packed };
  report.generation.returnedBundle = { name: generatedEvidence.name, bytes: raw.length, sha256: sha(raw), gzipBytes: packed.length, vectorSha256: snapshot.vectorSha256 };
}
function tarEntries(gz, cli = false) {
  need(gz.length <= (cli ? 4194304 : 2097152), 'archive_gzip_bound'); const raw = gunzipSync(gz, { maxOutputLength: cli ? 33554432 : 16777216 });
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
    const bytes = read(path.join(archives, filename), directory === 'cli' ? 4194304 : 2097152), members = tarEntries(bytes, directory === 'cli');
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
    if (directory === 'cli') exactSet([...members.keys()].filter(name => name.startsWith('package/dist/playground/')).map(name => name.slice('package/dist/playground/'.length)),
      ['asset-manifest.json', ...playgroundAssetBaseline.files.map(file => file.path)], 'cli_archive_asset_set');
    const row = { name: manifest.name, version: manifest.version, filename, bytes: bytes.length, sha256: sha(bytes), integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
      sourceManifestSha256: sha(read(path.join(source, `packages/${directory}/package.json`))), packedManifest: packed, members: [...members.values()].map(({ data, ...entry }) => entry) };
    report.archives.push(row); retain(filename, bytes);
  }
  exactSet(fs.readdirSync(archives), filenames, 'archive_directory_set');
  const summary = { schemaVersion: 1, sourceCommit, archives: report.archives.map(({ name, version, filename, bytes, sha256, integrity }) => ({ name, version, filename, bytes, sha256, integrity })) };
  const data = Buffer.from(`${JSON.stringify(summary, null, 2)}\n`), file = path.join(output, 'archive-manifest.json');
  fs.writeFileSync(file, data, { flag: 'wx', mode: 0o600 }); env.MCPCN_APPROVALS_ARCHIVE_MANIFEST = file; retain('archive-manifest.json', data);
}

const SERVICE_ORIGINS = { docs: 'http://127.0.0.1:4173', cliDev: 'http://127.0.0.1:4545', cliPreview: 'http://127.0.0.1:4546' };
function playgroundSnapshot(directory) {
  const rootStat = fs.lstatSync(directory);
  need(rootStat.isDirectory() && !rootStat.isSymbolicLink() && rootStat.uid === process.getuid() && fs.realpathSync(directory) === directory, 'playground_asset_root');
  const raw = read(path.join(directory, 'asset-manifest.json'), 32768), manifest = JSON.parse(raw);
  need(manifest.schemaVersion === 1 && manifest.kind === 'mcpcn.playground.assets.v1' && Object.keys(manifest).sort().join() === 'files,kind,schemaVersion'
    && Array.isArray(manifest.files) && manifest.files.length >= 2 && manifest.files.length <= 64, 'playground_manifest_shape');
  let bytes = 0, directories = 0; const rows = [], names = [];
  for (const row of manifest.files) {
    need(row && Object.keys(row).sort().join() === 'bytes,path,sha256' && typeof row.path === 'string' && row.path.length <= 160
      && !row.path.split('/').some(part => !part || part === '.' || part === '..')
      && (['index.html', 'frame.html'].includes(row.path) || /^assets\/[A-Za-z0-9._/-]+\.(?:js|css|svg|png|jpe?g|webp|avif|woff2?|ico)$/.test(row.path))
      && Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= 4194304 && /^[a-f0-9]{64}$/.test(row.sha256), 'playground_manifest_row');
    const file = path.join(directory, row.path), stat = fs.lstatSync(file), body = read(file, 4194304);
    need(stat.uid === process.getuid() && fs.realpathSync(file) === file && body.length === row.bytes && sha(body) === row.sha256, 'playground_asset_binding');
    bytes += body.length; need(bytes <= 16777216, 'playground_asset_total');
    rows.push({ path: row.path, bytes: body.length, sha256: sha(body) });
  }
  exactSet(rows.map(row => row.path), rows.map(row => row.path), 'playground_asset_duplicates');
  exact(rows.map(row => row.path), [...rows.map(row => row.path)].sort(), 'playground_asset_order');
  need(rows.some(row => row.path === 'index.html') && rows.some(row => row.path === 'frame.html'), 'playground_two_entries');
  function visit(folder, prefix = '') {
    need(++directories <= 65 && prefix.length <= 160, 'playground_asset_directory_bound');
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      const relative = prefix + item.name, file = path.join(folder, item.name);
      need(!item.isSymbolicLink(), 'playground_asset_symlink');
      if (item.isDirectory()) { need(relative === 'assets' || relative.startsWith('assets/'), 'playground_asset_directory'); visit(file, relative + '/'); }
      else { need(item.isFile() && names.length < 65, 'playground_asset_file_bound'); names.push(relative); }
    }
  }
  visit(directory); exactSet(names, ['asset-manifest.json', ...rows.map(row => row.path)], 'playground_asset_file_set');
  return { location: path.relative(root, directory), manifestBytes: raw.length, manifestSha256: sha(raw), bytes, files: rows };
}
function verifyPlaygroundAssets(label, locations) {
  const check = { label, passed: false, locations: [], currentLocation: null }; report.playgroundAssetChecks ??= []; report.playgroundAssetChecks.push(check);
  for (const directory of locations) {
    check.currentLocation = path.relative(root, directory); const value = playgroundSnapshot(directory); check.locations.push(value);
    if (!playgroundAssetBaseline) {
      playgroundAssetBaseline = value; retain('playground-asset-manifest.json', read(path.join(directory, 'asset-manifest.json'), 32768));
    }
    need(value.manifestSha256 === playgroundAssetBaseline.manifestSha256 && value.manifestBytes === playgroundAssetBaseline.manifestBytes, 'playground_staged_manifest_changed');
    exact(value.files, playgroundAssetBaseline.files, 'playground_staged_asset_changed');
  }
  check.currentLocation = null; check.passed = true;
}
function installedCli() {
  const directory = path.join(root, 'consumers/package/node_modules/mcpcn'), archive = report.archives.find(row => row.name === 'mcpcn');
  need(archive && JSON.parse(read(path.join(directory, 'package.json'), 262144)).version === archive.version, 'installed_cli_package_identity');
  const files = [];
  for (const member of archive.members.filter(row => row.name.startsWith('package/dist/'))) {
    const relative = member.name.slice('package/'.length), file = path.join(directory, relative), stat = fs.lstatSync(file), bytes = read(file, 4194304);
    need(stat.uid === process.getuid() && fs.realpathSync(file) === file && bytes.length === member.bytes && sha(bytes) === member.sha256, 'installed_cli_archive_body');
    files.push({ path: relative, bytes: bytes.length, sha256: sha(bytes) });
  }
  need(files.some(row => row.path === 'dist/index.js') && files.some(row => row.path === 'dist/local-service.js'), 'installed_cli_entry_missing');
  verifyPlaygroundAssets('installed-cli', [path.join(directory, 'dist/playground')]);
  report.installedCli = { directory: path.relative(root, directory), package: archive.name, version: archive.version, archiveSha256: archive.sha256, files };
  return path.join(directory, 'dist/index.js');
}
async function stopServices() {
  for (const value of services.values()) if (value.handle && !value.handle.row.closeObserved) value.handle.stop();
  const results = await Promise.allSettled([...services.values()].map(value => value.promise));
  for (const result of results) need(result.status === 'fulfilled' && result.value.row.passed, 'owned_service_close_unproved');
}

function discoverUnitTests() {
  const paths = ['packages/schemas/src/approval-schemas.test.ts', 'packages/react/src/approval-components.test.tsx',
    'apps/playground/src/approval-fixtures.test.ts', 'packages/registry/src/approval-source.test.ts', 'apps/docs/components/approval-demos.test.tsx'].sort();
  need(paths.every(name => baseline.some(file => file.path === name)), 'focused_test_files_missing');
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
  need(count === 79, 'unit_case_scope_changed'); report.unitManifest = { parserVersion: ts.version, files, cases: count,
    newAuthoredCases: 79, relevantRegressionCases: 0, changedContractRegressionFiles: [], wholeHistoricalPacketInvoked: false };
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
  need(value && value.complete === true && typeof value.data === 'string' && value.encoding === 'gzip-base64' && Number.isSafeInteger(value.bytes) && value.bytes >= 0 && value.bytes <= limit && Number.isSafeInteger(value.compressedBytes), 'helper_original_shape');
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
  fs.writeFileSync(path.join(tools, 'package.json'), JSON.stringify({ name: 'mcpcn-approvals-owned-tools', private: true, dependencies: expected }), { flag: 'wx', mode: 0o600 });
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
  env.MCPCN_APPROVALS_BROWSER_TOOLS = playwright;
  await run('chromium-install', process.execPath, [path.join(playwright, 'cli.js'), 'install', 'chromium'], 180);
  return { pnpm, playwright };
}


function discoverBrowserCases() {
  const name = 'tooling/approval-browser.spec.mjs', bytes = read(path.join(source, name));
  const ts = createRequire(path.join(source, 'package.json'))('typescript'), parsed = ts.createSourceFile(name, bytes.toString(), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  need(parsed.parseDiagnostics.length === 0, 'browser_source_parse_failed'); let table;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'CASES') { need(!table && node.initializer && ts.isArrayLiteralExpression(node.initializer), 'browser_case_table'); table = node.initializer; }
    ts.forEachChild(node, visit);
  }
  visit(parsed); need(table?.elements.length === 12, 'browser_case_count');
  const scenarios = ['checklist', 'submission', 'destructive', 'override', 'permission', 'callbacks'], origins = ['docs', 'cliDev', 'cliPreview', 'docs', 'cliDev', 'docs'];
  const cases = table.elements.map((node, index) => {
    need(ts.isArrayLiteralExpression(node) && node.elements.length === 6 && node.elements.slice(0, 5).every(value => ts.isStringLiteral(value)) && ts.isIdentifier(node.elements[5]), 'browser_case_literal');
    const [id, title, profile, scenario, originKey] = node.elements.slice(0, 5).map(value => value.text);
    need(id === `A${String(index + 1).padStart(2, '0')}` && profile === (index % 2 ? 'narrow' : 'desktop') && title.startsWith(`${id} ${profile} `)
      && scenario === scenarios[Math.floor(index / 2)] && originKey === origins[Math.floor(index / 2)], 'browser_case_identity');
    return { id, title, profile, scenario, originKey, origin: SERVICE_ORIGINS[originKey] };
  });
  exactSet(cases.map(row => row.title), cases.map(row => row.title), 'browser_unique_titles');
  report.browserManifest = { path: name, sha256: sha(bytes), cases }; return cases;
}
async function readiness() {
  const end = Math.min(Date.now() + 60000, workEnd), artifact = path.join(source, 'apps/playground/dist');
  report.readiness = { passed: false, totalSeconds: 60, checks: [] };
  const probes = [
    { role: 'docs', route: '/playground', name: 'docs-wrapper', expected: null },
    ...['docs', 'cliDev', 'cliPreview'].flatMap(role => [
      { role, route: role === 'docs' ? '/playground-simulator/index.html' : role === 'cliPreview' ? '/?component=approval-checklist' : '/?component=approval-checklist', name: `${role}-index`, expected: 'index.html' },
      { role, route: `${role === 'docs' ? '/playground-simulator' : ''}/frame.html`, name: `${role}-frame`, expected: 'frame.html' },
      { role, route: `${role === 'docs' ? '/playground-simulator' : ''}/asset-manifest.json`, name: `${role}-manifest`, expected: 'asset-manifest.json' },
    ]),
  ];
  for (const probe of probes) {
    const check = { role: probe.role, route: probe.route, passed: false, attempts: [] }; report.readiness.checks.push(check);
    while (Date.now() < end) {
      const service = services.get(probe.role); need(service && !service.handle.row.exitObserved, 'owned_service_exited_before_ready');
      const url = new URL(probe.route, SERVICE_ORIGINS[probe.role]), row = { at: new Date().toISOString(), url: url.href, status: null, bytes: 0, retainedBytes: 0, sha256: null, complete: false, error: null };
      check.attempts.push(row);
      const body = await new Promise(resolve => {
        const pieces = []; let response, socket, ended = false, requestClosed = false, socketClosed = false, finished = false;
        const deadline = Math.min(Date.now() + 2000, end);
        const finish = () => {
          if (finished || !((ended && requestClosed && socketClosed) || row.error && requestClosed && (!socket || socketClosed))) return;
          finished = true; clearTimeout(timer); const bytes = Buffer.concat(pieces); row.retainedBytes = bytes.length; row.sha256 = sha(bytes);
          row.complete = !row.error && response?.complete === true && Date.now() < deadline; resolve(bytes);
        };
        const fail = () => { row.error ??= 'readiness_http_failed'; response?.destroy(); request.destroy(); socket?.destroy(); finish(); };
        const request = http.get({ hostname: '127.0.0.1', port: url.port, path: url.pathname + url.search, agent: false, headers: { Connection: 'close' } }, incoming => {
          response = incoming; row.status = incoming.statusCode;
          incoming.on('data', chunk => { row.bytes += chunk.length; if (row.bytes <= 1048576) pieces.push(chunk); else { row.error = 'readiness_body_bound'; fail(); } });
          incoming.on('end', () => { ended = true; finish(); }); incoming.on('error', fail); incoming.on('aborted', fail);
        });
        request.on('socket', value => { socket = value; value.on('close', () => { socketClosed = true; finish(); }); });
        request.on('close', () => { requestClosed = true; finish(); }); request.on('error', fail);
        const timer = setTimeout(() => {
          if (finished) return; row.error = 'readiness_deadline'; request.destroy(); response?.destroy(); socket?.destroy(); finished = true;
          const bytes = Buffer.concat(pieces); row.retainedBytes = bytes.length; row.sha256 = sha(bytes); resolve(bytes);
        }, Math.max(1, deadline - Date.now()));
      });
      const matches = probe.expected ? body.equals(read(path.join(artifact, probe.expected), probe.expected.endsWith('.json') ? 32768 : 1048576))
        : body.includes(Buffer.from('Test the whole interaction.')) && body.includes(Buffer.from('/playground-simulator/index.html'));
      if (row.status === 200 && row.complete && matches) { retain(`readiness-${probe.name}.bin`, body); check.passed = true; break; }
      need(check.attempts.length <= 60, 'readiness_attempt_bound'); await pause(200);
    }
    need(check.passed, 'owned_service_readiness_failed');
  }
  report.readiness.passed = true;
}


function browserReadPath(originKey, pathname) {
  const prefix = originKey === 'docs' ? '/playground-simulator/' : '/';
  if (pathname === prefix + 'asset-manifest.json' || playgroundAssetBaseline.files.some(file => pathname === prefix + file.path)) return true;
  if (originKey !== 'docs') return pathname === '/';
  if (COMPONENTS.some(([slug]) => pathname === `/components/${slug}`)) return true;
  if (pathname.startsWith('/_next/static/')) return true;
  if (pathname === '/icon.svg' && baseline.some(file => file.path === 'apps/docs/app/icon.svg')) return true;
  if (baseline.some(file => file.path.startsWith('apps/docs/public/') && pathname === '/' + file.path.slice('apps/docs/public/'.length))) return true;
  return baseline.some(file => {
    const match = /^apps\/docs\/app\/(.*\/)?page\.tsx$/.exec(file.path);
    return match && !match[1]?.includes('[') && pathname === '/' + (match[1] ?? '').replace(/\/$/, '');
  });
}
function parseBrowserResults(browserOutput, cases) {
  const reporterBytes = read(path.join(browserOutput, 'playwright.json'), 4194304), reporter = JSON.parse(reporterBytes), tests = [];
  function visit(suite) { for (const spec of suite.specs ?? []) tests.push(spec); for (const child of suite.suites ?? []) visit(child); }
  for (const suite of reporter.suites ?? []) visit(suite);
  exactSet(tests.map(spec => spec.title), cases.map(row => row.title), 'browser_reporter_title_set');
  need(Array.isArray(reporter.errors) && reporter.errors.length === 0 && reporter.stats?.expected === 12
    && reporter.stats.unexpected === 0 && reporter.stats.flaky === 0 && reporter.stats.skipped === 0, 'browser_reporter_totals');
  for (const spec of tests) need(spec.ok === true && spec.tests.length === 1 && spec.tests[0].status === 'expected'
    && spec.tests[0].results.length === 1 && spec.tests[0].results[0].status === 'passed'
    && spec.tests[0].results[0].retry === 0, 'browser_reporter_status');
  exactSet(fs.readdirSync(browserOutput), ['playwright.json', ...cases.flatMap(row => [row.id + '.json', row.id + '.png'])], 'browser_output_file_set');
  const stageNames = {
    checklist: ['checklist_required_optional_and_focus', 'checklist_approval_and_cancel', 'checklist_invalid_empty_refused', 'checklist_disabled_refused'],
    submission: ['submission_values_and_consent', 'submission_confirm_ids_only', 'submission_replacement_revokes_consent', 'submission_invalid_empty_refused', 'submission_disabled_refused'],
    destructive: ['destructive_exact_phrase_and_consent', 'destructive_confirmation_intent', 'destructive_replacement_clears_guards', 'destructive_zero_count_refused', 'destructive_disabled_refused'],
    override: ['override_controlled_focus_and_reason', 'override_selection_revokes_consent', 'override_intent_and_cancel', 'override_stale_selection_refused', 'override_replacement_and_disabled'],
    permission: ['permission_required_optional_and_focus', 'permission_scope_change_revokes_consent', 'permission_request_and_deny', 'permission_stale_scope_refused', 'permission_disabled_refused'],
    callbacks: ['callbacks_immediate_intent_count', 'callbacks_pending_duplicate_suppression', 'callbacks_rejection_and_recovery', 'callbacks_replacement_fences_old_settlement', 'docs_submission_replacement_fence', 'docs_destructive_replacement_fence'],
  };
  const reports = [], decoder = new TextDecoder('utf-8', { fatal: true });
  for (const row of cases) {
    const bytes = read(path.join(browserOutput, row.id + '.json'), 262144), value = JSON.parse(bytes), direct = row.scenario === 'callbacks';
    const route = direct ? '/components/human-override-panel' : row.originKey === 'docs' ? '/playground' : '/?component=approval-checklist';
    need(value.schemaVersion === 1 && value.sourceCommit === sourceCommit && value.caseId === row.id && value.title === row.title
      && value.profile === row.profile && value.scenario === row.scenario && value.originKey === row.originKey
      && value.route === route && value.origin === row.origin && value.playwright === '1.65.0'
      && value.status === 'passed' && !value.failure, 'browser_case_identity_or_status');
    exact(value.viewport, row.profile === 'desktop' ? { width: 1280, height: 900 } : { width: 390, height: 844 }, 'browser_viewport');
    exact(value.limits, { workMs: 36000, closeMs: 39000, nativeMs: 40000, reportBytes: 262144, screenshotBytes: 262144 }, 'browser_case_limits');
    need(value.touchEmulated === (row.profile === 'narrow') && typeof value.browserVersion === 'string'
      && value.browserVersion.length > 0 && value.browserVersion.length <= 100, 'browser_profile_runtime');
    const viewport = value.observedViewport, first = value.observations?.[0];
    function checkViewport(actual) {
      need(['innerWidth', 'innerHeight', 'documentWidth', 'maxTouchPoints'].every(key => Number.isSafeInteger(actual?.[key]))
        && actual.innerWidth === value.viewport.width && actual.innerHeight === value.viewport.height
        && actual.documentWidth > 0 && actual.documentWidth <= value.viewport.width + 1
        && (row.profile === 'narrow' ? actual.maxTouchPoints > 0 : actual.maxTouchPoints === 0), 'browser_actual_viewport');
    }
    checkViewport(viewport);
    exact(value.observations?.map(item => item.stage), [direct ? 'actual_docs_component_ready' : 'actual_nested_bridge_ready', ...stageNames[row.scenario]], 'browser_required_stage_set');
    exact(first.viewport, viewport, 'browser_viewport_observation_binding');
    const frames = value.frames, nestedDocs = row.originKey === 'docs';
    exact(frames.outerPage, { origin: row.origin, pathname: new URL(route, row.origin).pathname }, 'browser_actual_outer_frame');
    if (direct) {
      need(frames.hostUrl === null && frames.appUrl === null && frames.hostRole === null && frames.appRole === null
        && frames.hostFrameCount === 0 && frames.appFrameCount === 0 && frames.actualFrameCount === 1
        && frames.sessionFragmentSha256 === null, 'browser_direct_docs_frame_boundary');
    } else {
      need(first.theme === (row.profile === 'narrow' ? 'dark' : 'light'), 'browser_actual_initial_theme');
      exact(frames.hostUrl, { origin: row.origin, pathname: nestedDocs ? '/playground-simulator/index.html' : '/' }, 'browser_actual_host_frame');
      exact(frames.appUrl, { origin: row.origin, pathname: nestedDocs ? '/playground-simulator/frame.html' : '/frame.html' }, 'browser_actual_app_frame');
      need(frames.hostRole === (nestedDocs ? 'MCPCN host simulator' : 'direct CLI simulator') && frames.appRole === 'Rendered MCP app'
        && frames.hostFrameCount === (nestedDocs ? 1 : 0) && frames.appFrameCount === 1 && frames.actualFrameCount === (nestedDocs ? 3 : 2)
        && /^[a-f0-9]{64}$/.test(frames.sessionFragmentSha256), 'browser_actual_frame_roles');
    }
    exact(first.frames, frames, 'browser_frame_observation_binding');
    need(['trackedTaps', 'trackedClicks', 'keyboardActions'].every(key => Number.isSafeInteger(value.input?.[key]) && value.input[key] >= 0 && value.input[key] <= 10000)
      && value.input[row.profile === 'narrow' ? 'trackedTaps' : 'trackedClicks'] > 0, 'browser_real_input');
    const cleanup = value.cleanup;
    need(cleanup.contextCreated === true && cleanup.contextClosed === true && cleanup.pagesCreated === 1 && cleanup.pagesClosed === 1
      && cleanup.pendingRequests === 0 && cleanup.observerJobs === 0 && cleanup.downloadArmRemaining === false
      && Number.isFinite(cleanup.closeStartedAtMs) && cleanup.closeStartedAtMs < value.limits.closeMs, 'browser_case_closure');
    need(['requestFailures', 'consoleErrors', 'pageErrors', 'webSockets', 'errorCount'].every(key => value.network?.[key] === 0)
      && Array.isArray(value.network.errors) && value.network.errors.length === 0
      && value.network.rows.length === value.network.requests && value.network.requests > 0 && value.network.requests <= 300, 'browser_fatal_boundary');
    const origin = new URL(row.origin);
    for (const [index, request] of value.network.rows.entries()) {
      need(request.ordinal === index + 1 && ['GET', 'HEAD'].includes(request.method) && request.protocol === 'http:' && request.host === origin.host
        && request.status >= 200 && request.status < 400 && request.terminal === 'finished' && request.responseFinished === 'null'
        && browserReadPath(row.originKey, request.pathname), 'browser_request_terminal_or_path');
    }
    const nav = value.navigation, request = value.network.rows.find(request => request.ordinal === nav.requestOrdinal);
    need(nav.status === 200 && nav.exactRequestIdentity === true && nav.requestFinished === 'finished' && nav.responseFinished === 'null'
      && request?.pathname === new URL(route, row.origin).pathname && request.status === 200, 'browser_navigation_identity');
    if (direct) {
      exact(value.additionalNavigations?.map(item => item.url), ['before-submit-confirmation', 'destructive-action-guard'].map(slug => row.origin + '/components/' + slug), 'browser_additional_navigation_set');
      for (const navigation of value.additionalNavigations) {
        const native = value.network.rows.find(item => item.ordinal === navigation.requestOrdinal);
        need(navigation.status === 200 && navigation.exactRequestIdentity === true && navigation.requestFinished === 'finished' && navigation.responseFinished === 'null'
          && native?.pathname === new URL(navigation.url).pathname && native.status === 200, 'browser_additional_navigation_identity');
      }
    } else need(value.additionalNavigations === undefined, 'browser_unexpected_additional_navigation');
    exact(value.finalLocation, { origin: row.origin, pathname: direct ? '/components/destructive-action-guard' : new URL(route, row.origin).pathname }, 'browser_final_location');
    need(value.observations.length <= 20 && value.observations.every(item => Number.isFinite(item.atMs)
      && item.atMs >= 0 && item.atMs < value.limits.workMs), 'browser_observation_shape');
    exact(value.wire, [], 'browser_no_tool_context_or_message_intent');
    need(value.sdkSends && Object.keys(value.sdkSends).length <= 60
      && Object.entries(value.sdkSends).every(([method, count]) => /^[A-Za-z0-9_/-]{1,100}$/.test(method) && Number.isSafeInteger(count) && count > 0)
      && ['tools/call', 'ui/update-model-context', 'ui/message'].every(method => (value.sdkSends[method] ?? 0) === 0), 'browser_sdk_intent_boundary');
    if (direct) exact(value.sdkSends, {}, 'browser_direct_docs_no_sdk');
    else need(['ui/initialize', 'ui/notifications/initialized', 'ui/notifications/tool-input', 'ui/notifications/tool-result']
      .every(method => value.sdkSends[method] >= 1), 'browser_positive_sdk_initialization_and_result');
    need(value.cookieCount === 0 && value.console?.unclassifiedSendCount === 0 && value.console.unclassifiedSends?.length === 0
      && Number.isSafeInteger(value.console.sdkSendPreviewCount) && Number.isSafeInteger(value.console.responsePreviewCount)
      && value.console.responsePreviewCount >= 0 && value.console.sdkSendPreviewCount <= 10000
      && value.console.sdkSendPreviewCount === value.console.responsePreviewCount + Object.values(value.sdkSends).reduce((sum, count) => sum + count, 0), 'browser_sdk_classification_and_cookie_boundary');
    exact(value.displayMessages, [], 'browser_no_display_requests');
    need(value.downloadEvents === 0 && value.download === undefined, 'browser_unexpected_download');
    exact(value.blobDownload, { rows: [], nativeDownloadJoined: null }, 'browser_unexpected_blob_download');
    const proofCache = new WeakMap(), proofs = [];
    function snapshot(proof) {
      need(proof && typeof proof === 'object' && typeof proof.formLabel === 'string' && proof.formLabel.length > 0
        && proof.formLabel.length <= 240 && Number.isSafeInteger(proof.controlCount) && proof.controlCount >= 0 && proof.controlCount <= 500, 'browser_dom_proof_shape');
      if (proofCache.has(proof)) return proofCache.get(proof);
      const domBytes = original(proof.dom, 65536), intentBytes = original(proof.intent, 65536);
      const dom = JSON.parse(decoder.decode(domBytes)), intent = JSON.parse(decoder.decode(intentBytes));
      exact(intent, proof.intentValue, 'browser_intent_original_parity');
      need(dom && typeof dom.outerHTML === 'string' && dom.outerHTML.length > 0 && typeof dom.textContent === 'string'
        && dom.data?.ariaLabel === proof.formLabel && Array.isArray(dom.controls) && dom.controls.length === proof.controlCount
        && ['true', 'false'].includes(dom.data.ariaBusy) && Array.isArray(dom.feedbackAlerts) && dom.feedbackAlerts.length <= 5
        && dom.feedbackAlerts.every(text => typeof text === 'string' && text.length <= 2000)
        && (direct ? dom.callbackCounters && Object.keys(dom.callbackCounters).sort().join() === 'intents,settled'
          && Object.values(dom.callbackCounters).every(text => typeof text === 'string' && /^(?:0|[1-9][0-9]{0,5})$/.test(text)) : dom.callbackCounters === null)
        && (dom.focus?.tag === null || typeof dom.focus?.tag === 'string') && (dom.focus.id === null || typeof dom.focus.id === 'string') && typeof dom.focus.inForm === 'boolean'
        && typeof dom.focus.documentHasFocus === 'boolean', 'browser_raw_dom_binding');
      if (direct) checkViewport(dom.viewport);
      else need(['innerWidth', 'innerHeight', 'documentWidth', 'maxTouchPoints'].every(key => Number.isSafeInteger(dom.viewport?.[key]))
        && dom.viewport.innerWidth > 0 && dom.viewport.innerWidth <= value.viewport.width && dom.viewport.innerHeight > 0 && dom.viewport.innerHeight <= 4096
        && dom.viewport.documentWidth > 0 && dom.viewport.documentWidth <= dom.viewport.innerWidth + 1
        && (row.profile === 'narrow' ? dom.viewport.maxTouchPoints > 0 : dom.viewport.maxTouchPoints === 0), 'browser_embedded_dom_viewport');
      for (const [index, control] of dom.controls.entries()) {
        need(control.index === index && ['tag', 'type', 'id', 'name', 'label'].every(key => typeof control[key] === 'string' && control[key].length <= 10000)
          && ['value', 'text'].every(key => control[key] === null || typeof control[key] === 'string' && control[key].length <= 10000)
          && (control.checked === null || typeof control.checked === 'boolean') && ['disabled', 'required', 'focused'].every(key => typeof control[key] === 'boolean'), 'browser_raw_control_shape');
      }
      let payload = null;
      if (proof.payload !== null) {
        need(!direct, 'browser_direct_docs_payload_forbidden');
        payload = JSON.parse(decoder.decode(original(proof.payload, 65536)));
        need(payload.structuredContent?.version === 1 && COMPONENTS.some(([slug]) => payload.structuredContent.kind === 'mcpcn/' + slug)
          && payload.structuredContent.data && typeof payload.structuredContent.data === 'object', 'browser_payload_original_binding');
      } else need(direct, 'browser_iframe_payload_original_missing');
      const result = { dom, intent, payload, proof }; proofCache.set(proof, result); proofs.push(result); return result;
    }
    let visited = 0;
    function walkProofs(node, depth = 0) {
      need(++visited <= 5000 && depth <= 12, 'browser_proof_structure_bound');
      if (!node || typeof node !== 'object') return;
      if ('formLabel' in node && 'dom' in node && 'intent' in node) { snapshot(node); return; }
      for (const child of Object.values(node)) if (child && typeof child === 'object') walkProofs(child, depth + 1);
    }
    for (const stage of value.observations) { snapshot(stage.proof); walkProofs(stage); }
    validateApprovalStages(value, snapshot);
    const png = read(path.join(browserOutput, row.id + '.png'), 262144);
    need(png.length >= 24 && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      && png.readUInt32BE(16) === value.viewport.width && png.readUInt32BE(20) === value.viewport.height
      && value.screenshot.filename === row.id + '.png' && value.screenshot.bytes === png.length
      && value.screenshot.sha256 === sha(png) && value.screenshot.viewportOnly === true, 'browser_screenshot_binding');
    reports.push({ value, bytes, proofs: proofs.length });
  }
  need(new Set(reports.map(({ value }) => value.browserVersion)).size === 1, 'browser_version_changed');
  report.browser = { passed: true, reporterSha256: sha(reporterBytes), cases: reports.map(({ value, bytes, proofs }) => ({
    id: value.caseId, title: value.title, profile: value.profile, scenario: value.scenario, origin: value.origin, route: value.route,
    frames: value.frames, status: value.status, observedStages: value.observations.map(item => item.stage), originalSha256: sha(bytes),
    originalDomSnapshots: proofs, screenshot: value.screenshot, cleanup: value.cleanup,
    networkCounters: Object.fromEntries(['requests', 'requestFailures', 'consoleErrors', 'pageErrors', 'webSockets', 'errorCount'].map(key => [key, value.network[key]])),
  })) };
}
function validateApprovalStages(value, snapshot) {
  const stages = new Map(value.observations.map(stage => [stage.stage, stage]));
  const at = name => { const stage = stages.get(name); need(stage, 'browser_required_positive_stage'); return stage; };
  const decoded = proof => snapshot(proof);
  const data = proof => decoded(proof).payload?.structuredContent.data;
  const controls = proof => decoded(proof).dom.controls;
  const select = (proof, predicate) => { const rows = controls(proof).filter(predicate); need(rows.length === 1, 'browser_control_identity'); return rows[0]; };
  const button = (proof, label, disabled) => need(select(proof, row => row.tag === 'BUTTON' && row.text?.trim() === label).disabled === disabled, 'browser_actual_button_gate');
  const checks = (proof, expected) => exact(controls(proof).filter(row => row.type === 'checkbox').map(row => row.checked), expected, 'browser_actual_checkbox_state');
  const radios = (proof, expected) => exact(controls(proof).filter(row => row.type === 'radio').map(row => row.checked), expected, 'browser_actual_radio_state');
  const field = (proof, label, expected) => need(select(proof, row => row.label.trim() === label).value === expected, 'browser_actual_field_value');
  const reasonText = (proof, expected) => need(select(proof, row => row.tag === 'TEXTAREA').value === expected, 'browser_actual_reason_value');
  const intent = (proof, type, fields) => exact(decoded(proof).intent, { type, data: fields }, 'browser_actual_intent_payload');
  const noIntent = proof => exact(decoded(proof).intent, null, 'browser_actual_no_intent');
  const focus = (fact, checked) => need(fact?.sameNode === true && fact.focused === true
    && (checked === undefined || fact.checked === checked), 'browser_controlled_native_node_focus');
  const alerts = (proof, expected = []) => exact(decoded(proof).dom.feedbackAlerts, expected, 'browser_actual_feedback_alerts');
  const counters = (proof, expected) => exact(decoded(proof).dom.callbackCounters,
    { intents: String(expected.intents), settled: String(expected.settled) }, 'browser_actual_counter_originals');
  const metadataCounters = (actual, intents, settled) => exact(actual, { intents, settled }, 'browser_counter_arithmetic');
  const text = (proof, expected) => need(decoded(proof).dom.textContent.includes(expected), 'browser_actual_visible_text');
  const busy = (proof, expected) => need(decoded(proof).dom.data.ariaBusy === String(expected), 'browser_actual_busy_state');
  const allDisabled = proof => need(controls(proof).length > 0 && controls(proof).every(row => row.disabled), 'browser_actual_disabled_controls');
  const originalText = packed => new TextDecoder('utf-8', { fatal: true }).decode(original(packed, 65536));
  const reason = '  Authored exception for review.  ', trimmedReason = 'Authored exception for review.';
  const first = value.observations[0].proof;
  noIntent(first); alerts(first);
  const terminalLabels = { checklist: 'Approve checklist', submission: 'Submit', destructive: 'Confirm destructive action',
    override: 'Override recommendation', permission: 'Request permission', callbacks: 'Override recommendation' };
  button(first, terminalLabels[value.scenario], true);
  if (value.scenario === 'callbacks') counters(first, { intents: 0, settled: 0 });

  function invalid(name, predicate) {
    const stage = at(name), before = decoded(stage.before), after = decoded(stage.proof);
    need(stage.previousUIUnchanged === true && stage.oldIntentUnchanged === true
      && originalText(stage.hostAlert).includes('Invalid component payload'), 'browser_actual_invalid_refusal');
    exact(after.dom.outerHTML, before.dom.outerHTML, 'browser_invalid_preserved_dom');
    exact(after.intent, before.intent, 'browser_invalid_preserved_intent');
    const withoutFocus = rows => rows.map(({ focused: _focused, ...row }) => row);
    exact(withoutFocus(after.dom.controls), withoutFocus(before.dom.controls), 'browser_invalid_preserved_controls');
    need(predicate(data(stage.proof)), 'browser_actual_invalid_editor_payload'); alerts(stage.proof);
  }
  function disabled(name) {
    const stage = at(name);
    need(stage.allControlsDisabled === true && stage.forcedNativePointerAttempt === true && stage.nativeEnterAttempt === true
      && stage.oldIntentUnchanged === true && data(stage.proof)?.disabled === true, 'browser_disabled_native_attempt');
    allDisabled(stage.before); allDisabled(stage.proof);
    exact(decoded(stage.proof).intent, decoded(stage.before).intent, 'browser_disabled_preserved_intent'); alerts(stage.proof);
  }
  function replacement(stage) {
    need(stage.replacementMechanism === 'new SDK tool-result invocation', 'browser_actual_sdk_replacement');
    alerts(stage.proof);
  }
  if (value.scenario === 'checklist') {
    const current = at('checklist_required_optional_and_focus');
    need(current.requiredGateObserved === true && current.optionalWasSelectedFirst === true && current.focus?.length === 3, 'browser_checklist_required_gate');
    current.focus.forEach(fact => focus(fact, true));
    checks(current.optionalOnly, [false, false, true]); button(current.optionalOnly, 'Approve checklist', true);
    checks(current.missingRequired, [false, true, true]); button(current.missingRequired, 'Approve checklist', true);
    checks(current.proof, [true, true, true]); button(current.proof, 'Approve checklist', false);
    need(controls(current.proof).filter(row => row.type === 'checkbox')[0].focused, 'browser_checklist_actual_focus');
    intent(current.proof, 'check-item', { reviewId: 'checklist-1', itemId: 'scope', checked: true });
    const terminal = at('checklist_approval_and_cancel'), fields = { reviewId: 'checklist-1', itemIds: ['scope', 'rollback', 'notes'] };
    intent(terminal.approved, 'approve-checklist', fields); exact(terminal.approval, { type: 'approve-checklist', data: fields }, 'browser_checklist_approval_parity');
    exact(terminal.definitionOrder, fields.itemIds, 'browser_checklist_definition_order');
    intent(terminal.proof, 'cancel', { reviewId: 'checklist-1' }); checks(terminal.proof, [true, true, true]);
    invalid('checklist_invalid_empty_refused', dto => Array.isArray(dto?.items) && dto.items.length === 0);
    disabled('checklist_disabled_refused');
  } else if (value.scenario === 'submission') {
    const shown = at('submission_values_and_consent'), fieldIds = ['private', 'zero', 'false', 'null', 'empty'];
    const fields = [{ id: 'private', label: 'Private field', value: 'FORM_ONLY_VALUE' }, { id: 'zero', label: 'Zero', value: 0 },
      { id: 'false', label: 'False', value: false }, { id: 'null', label: 'Null', value: null }, { id: 'empty', label: 'Empty', value: '' }];
    exact(shown.fields, [['Private field', 'FORM_ONLY_VALUE'], ['Zero', '0'], ['False', 'false'], ['Null', 'None'], ['Empty', 'Empty text']], 'browser_submission_displayed_primitives');
    exact(data(shown.proof)?.fields, fields, 'browser_submission_original_primitives');
    need(shown.consentInitiallyUnchecked === true && data(shown.proof).reviewId === 'submission-browser-1', 'browser_submission_current_review');
    checks(shown.proof, [false]); button(shown.proof, 'Submit', true);
    for (const expected of ['FORM_ONLY_VALUE', 'None', 'Empty text']) text(shown.proof, expected);
    const sent = at('submission_confirm_ids_only'), expected = { reviewId: 'submission-browser-1', fieldIds };
    intent(sent.proof, 'confirm-submit', expected); exact(sent.expectedIntent, { type: 'confirm-submit', data: expected }, 'browser_submission_intent_parity');
    need(sent.valueEchoAbsent === true && !originalText(sent.proof.intent).includes('FORM_ONLY_VALUE'), 'browser_submission_no_values_echo');
    const changed = at('submission_replacement_revokes_consent'); replacement(changed);
    checks(changed.previous, [true]); checks(changed.proof, [false]); button(changed.proof, 'Submit', true);
    need(data(changed.proof)?.reviewId === 'submission-browser-2' && data(changed.proof).fields[0].value === 'REPLACED_FORM_ONLY_VALUE', 'browser_submission_replacement_payload');
    text(changed.proof, 'REPLACED_FORM_ONLY_VALUE');
    invalid('submission_invalid_empty_refused', dto => Array.isArray(dto?.fields) && dto.fields.length === 0);
    disabled('submission_disabled_refused');
  } else if (value.scenario === 'destructive') {
    const gates = at('destructive_exact_phrase_and_consent');
    need(gates.positiveCount === 2 && data(gates.proof)?.affectedCount === 2, 'browser_destructive_positive_count');
    for (const [proof, phrase, consent] of [[gates.wrongCase, 'remove drafts', true], [gates.trailing, 'REMOVE DRAFTS ', true], [gates.withoutConsent, 'REMOVE DRAFTS', false]]) {
      field(proof, 'Confirmation phrase', phrase); checks(proof, [consent]); button(proof, 'Confirm destructive action', true);
    }
    field(gates.proof, 'Confirmation phrase', 'REMOVE DRAFTS'); checks(gates.proof, [true]); button(gates.proof, 'Confirm destructive action', false);
    intent(at('destructive_confirmation_intent').proof, 'confirm-destructive', { reviewId: 'destructive-1', affectedCount: 2 });
    const changed = at('destructive_replacement_clears_guards'); replacement(changed);
    field(changed.previous, 'Confirmation phrase', 'REMOVE DRAFTS'); checks(changed.previous, [true]);
    need(data(changed.proof)?.reviewId === 'destructive-2' && data(changed.proof).affectedCount === 3 && data(changed.proof).confirmationText === 'REMOVE THREE', 'browser_destructive_replacement_payload');
    field(changed.proof, 'Confirmation phrase', ''); checks(changed.proof, [false]); button(changed.proof, 'Confirm destructive action', true); text(changed.proof, '3 affected items');
    invalid('destructive_zero_count_refused', dto => dto?.affectedCount === 0);
    disabled('destructive_disabled_refused');
  } else if (value.scenario === 'override') {
    const current = at('override_controlled_focus_and_reason'); focus(current.radioFocus, true); focus(current.reasonFocus);
    need(current.reasonFocus.value === reason && current.typingLeftIntentUnchanged === true, 'browser_override_reason_typing');
    reasonText(current.blankReason, '   '); checks(current.blankReason, [true]); button(current.blankReason, 'Override recommendation', true);
    radios(current.blankReason, [false, true, false]);
    intent(current.proof, 'select-override-option', { reviewId: 'override-1', optionId: 'manual' });
    reasonText(current.proof, reason); checks(current.proof, [false]); radios(current.proof, [false, true, false]); button(current.proof, 'Override recommendation', true);
    need(select(current.proof, row => row.tag === 'TEXTAREA').focused, 'browser_override_actual_reason_focus');
    const changed = at('override_selection_revokes_consent'); focus(changed.changedFocus, true);
    checks(changed.beforeChange, [true]); button(changed.beforeChange, 'Override recommendation', false);
    reasonText(changed.proof, reason); need(changed.reasonRetained === reason, 'browser_override_reason_retained');
    checks(changed.proof, [false]); radios(changed.proof, [false, false, true]); button(changed.proof, 'Override recommendation', true);
    intent(changed.proof, 'select-override-option', { reviewId: 'override-1', optionId: 'defer' });
    const sent = at('override_intent_and_cancel');
    intent(sent.approved, 'override', { reviewId: 'override-1', optionId: 'defer', reason: trimmedReason });
    intent(sent.proof, 'cancel', { reviewId: 'override-1' }); radios(sent.proof, [false, false, true]);
    need(sent.recommendationUnchanged === true, 'browser_override_cancel_keeps_recommendation'); text(sent.proof, 'Current recommendation: Standard review');
    invalid('override_stale_selection_refused', dto => dto?.selectedOptionId === 'removed-option' && !dto.options.some(option => option.id === dto.selectedOptionId));
    disabled('override_replacement_and_disabled');
    const replaced = at('override_replacement_and_disabled'); replacement(replaced);
    need(data(replaced.proof)?.reviewId === 'override-2', 'browser_override_replacement_review'); reasonText(replaced.proof, ''); checks(replaced.proof, [false]);
    text(replaced.proof, 'A replacement authored recommendation.');
  } else if (value.scenario === 'permission') {
    const current = at('permission_required_optional_and_focus'); focus(current.optionalFocus, true); focus(current.requiredFocus, true);
    need(current.optionalWasSelectedFirst === true, 'browser_permission_nonvacuous_required_gate');
    checks(current.optionalOnly, [false, true, false]); button(current.optionalOnly, 'Request permission', true);
    checks(current.proof, [true, true, false]); button(current.proof, 'Request permission', true);
    text(current.proof, 'It does not grant access or change authorization.');
    const changed = at('permission_scope_change_revokes_consent'); focus(changed.changedFocus, false);
    checks(changed.beforeChange, [true, true, true]); button(changed.beforeChange, 'Request permission', false);
    checks(changed.proof, [true, true, false]); button(changed.proof, 'Request permission', true);
    intent(changed.proof, 'select-scope', { reviewId: 'permission-1', scopeId: 'notes.read', selected: true });
    const sent = at('permission_request_and_deny');
    intent(sent.requested, 'request-permission', { reviewId: 'permission-1', scopeIds: ['documents.read', 'notes.read'] });
    intent(sent.proof, 'deny-permission', { reviewId: 'permission-1' }); exact(sent.definitionOrder, ['documents.read', 'notes.read'], 'browser_permission_definition_order');
    need(sent.permissionGrantPerformed === false, 'browser_no_permission_grant');
    invalid('permission_stale_scope_refused', dto => Array.isArray(dto?.selectedScopeIds) && dto.selectedScopeIds.length === 1
      && dto.selectedScopeIds[0] === 'removed.scope' && !dto.scopes.some(scope => scope.id === dto.selectedScopeIds[0]));
    disabled('permission_disabled_refused');
  } else {
    need(value.scenario === 'callbacks', 'browser_unknown_scenario');
    const immediate = at('callbacks_immediate_intent_count'), override = { reviewId: 'docs-override-1', optionId: 'manual', reason: trimmedReason };
    focus(immediate.radioFocus, true); focus(immediate.reasonFocus);
    need(immediate.reasonFocus.value === reason && immediate.reasonAndConsentDidNotEmit === true, 'browser_local_edits_emit_no_intent');
    metadataCounters(immediate.counters, 2, 0); counters(immediate.proof, immediate.counters);
    intent(immediate.proof, 'override', override); reasonText(immediate.proof, reason); checks(immediate.proof, [true]); alerts(immediate.proof);
    const delayed = at('callbacks_pending_duplicate_suppression');
    metadataCounters(delayed.beforeCounters, 2, 0); metadataCounters(delayed.afterCounters, 3, 1);
    counters(delayed.pending, { intents: 3, settled: 0 }); counters(delayed.proof, delayed.afterCounters);
    need(delayed.nativeEnterDuplicateAttempt === true, 'browser_native_duplicate_attempt');
    busy(delayed.pending, true); allDisabled(delayed.pending); busy(delayed.proof, false); button(delayed.proof, 'Override recommendation', false);
    intent(delayed.pending, 'override', override); intent(delayed.proof, 'override', override); alerts(delayed.proof);
    const rejected = at('callbacks_rejection_and_recovery'), error = 'The action could not be completed. Try again.';
    metadataCounters(rejected.beforeCounters, 3, 1); metadataCounters(rejected.afterCounters, 5, 2);
    counters(rejected.rejected, { intents: 4, settled: 2 }); counters(rejected.proof, rejected.afterCounters);
    need(originalText(rejected.rejectionText) === error, 'browser_actual_rejection_text');
    alerts(rejected.rejected, [error]); alerts(rejected.proof); busy(rejected.proof, false); button(rejected.proof, 'Override recommendation', false);
    intent(rejected.proof, 'override', override);
    const replaced = at('callbacks_replacement_fences_old_settlement');
    metadataCounters(replaced.beforeCounters, 5, 2); metadataCounters(replaced.afterCounters, 0, 3);
    counters(replaced.oldPending, { intents: 6, settled: 2 }); counters(replaced.replacementBeforeSettlement, { intents: 0, settled: 2 });
    counters(replaced.proof, replaced.afterCounters); busy(replaced.oldPending, true); allDisabled(replaced.oldPending);
    need(replaced.oldReasonNodeDetached === true && replaced.positiveOldCallbackSettlement === true, 'browser_positive_old_callback_settlement');
    for (const proof of [replaced.replacementBeforeSettlement, replaced.proof]) {
      noIntent(proof); reasonText(proof, ''); checks(proof, [false]); radios(proof, [false, false, false]); button(proof, 'Override recommendation', true); alerts(proof);
      text(proof, 'Use the standard route for revision 2.');
    }
    exact(decoded(replaced.replacementBeforeSettlement).dom.outerHTML, decoded(replaced.proof).dom.outerHTML, 'browser_old_callback_did_not_change_current_view');
    const submission = at('docs_submission_replacement_fence');
    intent(submission.before, 'confirm-submit', { reviewId: 'docs-submission-1', fieldIds: ['subject', 'records', 'notify'] });
    checks(submission.before, [true]); noIntent(submission.proof); checks(submission.proof, [false]); button(submission.proof, 'Submit', true);
    need(submission.oldConsentNodeDetached === true && submission.directLibraryRevision === true, 'browser_direct_submission_revision');
    metadataCounters(submission.counters, 0, 0); counters(submission.proof, submission.counters); text(submission.proof, 'Replacement request 2'); alerts(submission.proof);
    const destructive = at('docs_destructive_replacement_fence');
    intent(destructive.before, 'confirm-destructive', { reviewId: 'docs-destructive-1', affectedCount: 2 });
    field(destructive.before, 'Confirmation phrase', 'REMOVE DRAFTS'); checks(destructive.before, [true]);
    need(destructive.oldPhraseNodeDetached === true && destructive.directLibraryRevision === true, 'browser_direct_destructive_revision');
    noIntent(destructive.proof); field(destructive.proof, 'Confirmation phrase', ''); checks(destructive.proof, [false]); button(destructive.proof, 'Confirm destructive action', true);
    metadataCounters(destructive.counters, 0, 0); counters(destructive.proof, destructive.counters); text(destructive.proof, '3 affected items'); alerts(destructive.proof);
  }
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
  const names = COMPONENTS.map(([, name]) => name), slugs = COMPONENTS.map(([slug]) => slug);
  const probe = value.cases[0].observations.installedProbe;
  exact(probe, JSON.parse(childOriginals.get('C01-package-installed-probe').stdout.toString()), 'consumer_probe_original_parity');
  exact(probe.exports, names, 'consumer_five_exports'); exact(probe.newImplementations, names, 'consumer_five_implementations');
  exact(probe.sourceModulePaths, MODULES.map(([, target]) => `_mcpcn/${target}`), 'consumer_sixteen_modules');
  need(probe.publicRegistryGetter === true && probe.schemas.length === 5, 'consumer_public_schemas');
  const registry = JSON.parse(read(path.join(source, 'registry/registry.json'), GEN_RAW));
  exact(probe.schemas.map(row => row.slug), slugs, 'consumer_schema_name_set');
  for (const entry of probe.schemas) exact(entry.schema, registry.items.find(item => item.name === entry.slug)?.meta.dataSchema, 'consumer_schema_registry_binding');
  const titles = ['Review authored checklist', 'Review authored submission', 'Review authored removal', 'Review authored recommendation', 'Review authored access'];
  need(Array.isArray(probe.rendered) && probe.rendered.length === 5, 'consumer_rendered_five');
  exact(probe.rendered.map(row => row.slug), slugs, 'consumer_rendered_order');
  for (const [index, row] of probe.rendered.entries()) {
    need(Object.keys(row).sort().join() === 'bytes,html,sha256,slug' && typeof row.html === 'string'
      && row.bytes > 0 && row.bytes <= 65536 && Buffer.byteLength(row.html) === row.bytes
      && sha(Buffer.from(row.html)) === row.sha256 && row.html.includes('<form') && row.html.includes(titles[index]), 'consumer_rendered_html_binding');
  }

  for (const [index, mode] of ['package', 'copy'].entries()) {
    const row = value.cases[index].observations;
    need(row.selectedItems === 79 && row.unrelatedPreserved === true && row.strictTypecheck === true && row.compiler.version === '5.9.3' && row.compiler.skipLibCheck === false, 'consumer_actual_typecheck');
    need(row.files.length === (mode === 'copy' ? 99 : 80) && new Set(row.files.map(file => file.path)).size === row.files.length, 'consumer_written_file_count');
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
  for (const name of PACKAGES.filter(name => name !== 'cli')) await pnpm(`build-${name}`, ['--filter', `@mcpcn/${name}`, 'build'], 90);
  const playgroundTypecheck = await pnpm('playground-typecheck', ['--filter', '@mcpcn/playground', 'typecheck'], 90, { allowFailure: true });
  report.playgroundTypecheck = { passed: playgroundTypecheck.row.passed, actualCommand: 'pnpm --filter @mcpcn/playground typecheck', commandLabel: playgroundTypecheck.row.label };
  need(playgroundTypecheck.row.passed, 'playground_typecheck_failed');
  await pnpm('build-playground', ['--filter', '@mcpcn/playground', 'build'], 120);
  verifyPlaygroundAssets('after-playground-build', [path.join(source, 'apps/playground/dist')]);
  await pnpm('build-cli', ['--filter', 'mcpcn', 'build'], 90);
  verifyPlaygroundAssets('after-cli-build', [path.join(source, 'apps/playground/dist'), path.join(source, 'packages/cli/dist/playground')]);
  guardExport('after-package-builds'); await guard('after-package-builds');
  await pnpm('generate-first', ['exec', 'tsx', 'tooling/generate.ts'], 60);
  guardExport('after-first-generation'); verifyGenerated(); generatedBaseline = snapshotGenerated('first-generation');
  await pnpm('generate-second', ['exec', 'tsx', 'tooling/generate.ts'], 60);
  guardExport('after-second-generation'); const second = snapshotGenerated('second-generation');
  exact(second.files, generatedBaseline.files, 'generation_not_deterministic'); report.generation.determinism = true;
  report.generation.changedSeedPaths = generatedBaseline.files.filter(file => baseline.find(seed => seed.path === file.path)?.sha256 !== file.sha256).map(file => file.path);
  retainGenerated(generatedBaseline); await guard('after-generation');
  const selected = discoverUnitTests(), unitFile = path.join(output, 'vitest.json');
  const unit = await pnpm('focused-approval-cohort-units', ['exec', 'vitest', 'run', ...selected, '--reporter=json', `--outputFile=${unitFile}`], 150, { allowFailure: true });
  collectOutputs(); need(fs.existsSync(unitFile), 'unit_original_missing'); parseUnitResults(read(unitFile, 4194304)); need(unit.row.passed, 'unit_command_failed');
  const docs = await pnpm('docs-production-build', ['--filter', '@mcpcn/docs', 'build'], 180, { allowFailure: true });
  report.docsBuild = { passed: false, actualCommand: 'pnpm --filter @mcpcn/docs build', output: '.next', nextConfigChanged: false, expectedPages: 82,
    stdoutSha256: sha(docs.bytes[0]), stderrSha256: sha(docs.bytes[1]) };
  need(docs.row.passed, 'docs_production_build_failed');
  need(/Generating static pages[^\n]*\(82\/82\)/.test(docs.bytes[0].toString()), 'docs_static_page_count');
  report.docsBuild.passed = true; report.docsBuild.observedPages = 82;
  verifyPlaygroundAssets('after-docs-build', [path.join(source, 'apps/playground/dist'), path.join(source, 'packages/cli/dist/playground'), path.join(source, 'apps/docs/public/playground-simulator')]);
  guardExport('after-docs-build'); exact(snapshotGenerated('after-docs-build').files, generatedBaseline.files, 'docs_changed_generated_inputs');
  for (const name of PACKAGES) await pnpm(`pack-${name}`, ['--dir', path.join(source, 'packages', name), 'pack', '--pack-destination', archives], 45);
  inspectArchives(); guardExport('after-pack');
  need(workEnd - Date.now() >= 870000, 'consumer_browser_readiness_full_budgets_not_reserved');
  const consumers = await run('fresh-installed-consumers', process.execPath, [path.join(source, 'tooling/approval-installed-consumer.mjs')], 310, { allowFailure: true });
  collectOutputs(); const consumerFile = path.join(output, 'consumers.json'); need(fs.existsSync(consumerFile), 'consumer_original_missing');
  parseConsumers(read(consumerFile, 4194304), consumers.bytes[0]); need(consumers.row.passed, 'consumer_command_failed');
  guardExport('after-consumers'); exact(snapshotGenerated('after-consumers').files, generatedBaseline.files, 'consumer_changed_generated_inputs');
  const entry = installedCli(), cases = discoverBrowserCases(), browserOutput = path.join(output, 'browser'); fs.mkdirSync(browserOutput, { mode: 0o700 });
  env.MCPCN_APPROVALS_BROWSER_OUTPUT = browserOutput; env.MCPCN_APPROVALS_ORIGIN = SERVICE_ORIGINS.docs;
  env.MCPCN_APPROVALS_CLI_DEV_ORIGIN = SERVICE_ORIGINS.cliDev; env.MCPCN_APPROVALS_CLI_PREVIEW_ORIGIN = SERVICE_ORIGINS.cliPreview;
  need(workEnd - Date.now() >= 560000, 'browser_readiness_full_budgets_not_reserved');
  const next = fs.realpathSync(path.join(source, 'apps/docs/node_modules/next/dist/bin/next'));
  report.runtime.next = { version: JSON.parse(read(path.join(source, 'apps/docs/node_modules/next/package.json'))).version, cliSha256: sha(read(next)) };
  const definitions = [
    ['docs', 'docs-production-server', [next, 'start', '--hostname', '127.0.0.1', '--port', '4173'], path.join(source, 'apps/docs')],
    ['cliDev', 'installed-cli-dev-server', [entry, 'dev', '--port=4545'], path.join(root, 'consumers/package')],
    ['cliPreview', 'installed-cli-preview-server', [entry, 'preview', 'approval-checklist', '--port=4546'], path.join(root, 'consumers/package')],
  ];
  report.services = definitions.map(([role, label]) => ({ role, label, origin: SERVICE_ORIGINS[role] }));
  for (const [role, label, args, cwd] of definitions) {
    const value = {}; services.set(role, value);
    value.promise = run(label, process.execPath, args, Math.floor((workEnd - Date.now()) / 1000), {
      cwd, service: true, allowFailure: true, onSpawn: handle => { value.handle = handle; },
    }); value.promise.catch(() => {});
  }
  await readiness();
  const config = path.join(root, 'tools/playwright.config.cjs');
  fs.writeFileSync(config, `module.exports=${JSON.stringify({
    testDir: path.join(source, 'tooling'), testMatch: 'approval-browser.spec.mjs', workers: 1, retries: 0, timeout: 40000, globalTimeout: 450000,
    reporter: [['json', { outputFile: path.join(browserOutput, 'playwright.json') }]], outputDir: path.join(output, 'browser-runner-artifacts'),
    projects: [{ name: 'chromium', use: { browserName: 'chromium', headless: true } }],
  })};\n`, { flag: 'wx', mode: 0o600 });
  const browser = await run('approval-production-browser', process.execPath, [path.join(tools.playwright, 'cli.js'), 'test', '--config', config], 460, { allowFailure: true });
  collectOutputs(); parseBrowserResults(browserOutput, cases); need(browser.row.passed, 'browser_command_failed');
  await stopServices();
  verifyPlaygroundAssets('after-browser', [path.join(source, 'apps/playground/dist'), path.join(source, 'packages/cli/dist/playground'),
    path.join(source, 'apps/docs/public/playground-simulator'), path.join(root, 'consumers/package/node_modules/mcpcn/dist/playground')]);
  installedCli(); guardExport('after-browser'); exact(snapshotGenerated('after-browser').files, generatedBaseline.files, 'browser_changed_generated_inputs');
  await guard('after-acceptance');
} catch (error) { report.errors.push(finite(error)); }
finally {
  cleanupEnd = Math.min(Date.now() + 90000, jobStart + 1200000 - 15000);
  try { await stopServices(); } catch (error) { report.errors.push(finite(error)); }
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
  report.status = !report.errors.length && report.unitResults?.passed && report.consumers?.passed && report.browser?.passed && report.docsBuild?.passed && report.playgroundTypecheck?.passed
    && report.playgroundAssetChecks?.length >= 4 && report.playgroundAssetChecks.every(row => row.passed)
    && report.services?.length === 3 && report.services.every(service => report.commands.some(command => command.label === service.label && command.passed))
    && report.generation?.determinism && generatedEvidence && report.archives.length === 7 && report.cleanup.passed ? 'passed' : 'failed';
  if (report.generation) report.generation.tested = report.status === 'passed';
  report.proof = { normalGzipBytesBeforeReceipt: evidenceBytes, generatedGzipBytes: generatedEvidence?.gzipBytes ?? 0, finalStdoutSeconds: 20 };
  try { retain('receipt.json', Buffer.from(`${JSON.stringify(report, null, 2)}\n`)); } catch (error) { report.status = 'failed'; report.errors.push(finite(error)); }
  try {
    const end = Math.min(Date.now() + 20000, jobStart + 1200000 - 5000);
    for (const file of evidence) await emit(file, 'MCPCN_APPROVALS', end);
    if (generatedEvidence) await emit(generatedEvidence, 'MCPCN_APPROVALS_GENERATED', end);
    process.stdout.write(`MCPCN_APPROVALS_RESULT=${JSON.stringify({ status: report.status, sourceCommit, workflowCommit, errors: report.errors,
      unitCases: report.unitResults?.cases ?? 0, consumers: report.consumers?.passed === true, browserCases: report.browser?.cases.length ?? 0,
      generatedBundleSha256: generatedEvidence?.sha256 ?? null })}\n`);
  } catch (error) { report.status = 'failed'; report.errors.push(finite(error)); process.stdout.destroy(); }
  process.exitCode = report.status === 'passed' ? 0 : 1;
}


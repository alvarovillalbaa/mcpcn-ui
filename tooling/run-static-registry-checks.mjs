// Hosting-only protocol: unchanged library, eight stager checks, two Turbo builds and six owned HTTP observations.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import http from 'node:http';
import net from 'node:net';
import { isFormWorkflowEagerOwnershipCandidate, verifyFormWorkflowTwoEdgeOwnership } from './form-workflow-process-ownership.mjs';

const ACTIVE = '.github/workflows/static-registry-checks.yml';
const BASE = '6b008cded663f9dc746cb6dfa099018018d47501';
const APPLICATION_PATHS = ['.gitignore', 'apps/docs/app/r/registry.json/route.ts', 'apps/docs/package.json',
  'tooling/run-static-registry-checks.mjs', 'tooling/stage-docs-registry.mjs', 'tooling/stage-docs-registry.test.mjs', 'turbo.json'];
const PACKAGES = ['core', 'schemas', 'runtime', 'react', 'themes', 'registry', 'cli'];
const STREAM = 524288, PROOF = 8388608, RECEIPT_RAW = 8388608, REGISTRY_INDEX_BYTES = 33554432;
const INDEX = { path: 'registry/registry.json', bytes: 21357274, sha256: 'dea9330bc53e1d1269f598f8ba548b3717097ce429610f189d5e6ffb297f6c24' };
const STAGING_CASES = ['ST01_exact_large_first_staging', 'ST02_idempotent_staging_preserves_identities',
  'ST03_current_owned_artifact_replaced', 'ST04_unmarked_or_malformed_destination_refused', 'ST05_extra_foreign_entry_refused',
  'ST06_source_symlink_refused', 'ST07_parent_and_destination_symlinks_refused', 'ST08_empty_oversized_and_nonregular_source_refused'];
const ASSET_FILES = [
  { path: 'assets/frame-BCAh7JKd.css', bytes: 7313, sha256: 'e0e32668307575ba05d4461bd6b675cba390ca6d70a904fe9d00ce0ddc375ffa' },
  { path: 'assets/frame-mseXV9PA.js', bytes: 166502, sha256: '6d18c68a6cc1dfdf26119c9d91d73e514c861f0e0b24f2579c399f11df208f0d' },
  { path: 'assets/index-CWhdqbja.js', bytes: 44166, sha256: '859388c5d300d436c668e53c7b945ffc05c7dd1b1ae2b4bcdabe9da0fd4ba7f0' },
  { path: 'assets/index-ylmVxKY0.css', bytes: 3322, sha256: '7ae3b7970f66da5e0da8f0d8ce74f15bdb4a11095aa0560324c9e05bd8d3ee2c' },
  { path: 'assets/jsx-runtime-5TLZpg5L.js', bytes: 574595, sha256: '9435580522a30f359604bf72e65a3a5221000fcb5911a3532d5890eee18a894c' },
  { path: 'frame.html', bytes: 518, sha256: '419eedd6c0e4f9d567dfab74a22f38803222bc1150d0d8e90e674876596bf6f6' },
  { path: 'index.html', bytes: 680, sha256: '5031af7f0eaba2a5934ecc2ea8cc8f47c4fec031dafd5d704f67b051fb1d2c86' },
];
const sha = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const need = (condition, code) => { if (!condition) throw new Error(code); };
const finite = error => /^[a-z0-9_]+$/.test(error?.message ?? '') ? error.message : 'controller_error';
const exact = (actual, expected, code) => need(JSON.stringify(actual) === JSON.stringify(expected), code);
function exactSet(actual, expected, code) {
  need(Array.isArray(actual) && new Set(actual).size === actual.length, code);
  exact([...actual].sort(), [...expected].sort(), code);
}
const sourceCommit = process.argv[3];
need(process.argv.length === 4 && process.argv[2] === '--source-commit' && /^[a-f0-9]{40}$/.test(sourceCommit ?? ''), 'source_pin_required');
need(process.env.SOURCE_COMMIT === sourceCommit, 'dispatch_source_mismatch');
need(process.platform === 'linux' && process.version === 'v24.22.2' && process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true'
  && process.env.GITHUB_REPOSITORY === 'alvarovillalbaa/mcpcn-ui' && process.env.GITHUB_REF === 'refs/heads/main'
  && process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && process.env.MCPCN_PUBLIC_REPOSITORY === 'true', 'approved_public_main_ci_required');
const jobStart = Number(process.env.MCPCN_HOSTING_JOB_STARTED_MS);
need(Number.isSafeInteger(jobStart) && jobStart <= Date.now() && jobStart > Date.now() - 300000, 'job_start_invalid');
const taskStartTicks = process.env.MCPCN_HOSTING_START_TICKS;
need(/^[1-9][0-9]{0,19}$/.test(taskStartTicks ?? ''), 'task_start_ticks_required');
const workflowCommit = process.env.GITHUB_SHA, runId = process.env.GITHUB_RUN_ID;
need(/^[a-f0-9]{40}$/.test(workflowCommit ?? '') && workflowCommit !== sourceCommit && /^[1-9][0-9]{0,19}$/.test(runId ?? ''), 'workflow_and_run_identity_required');
const workEnd = Math.min(Date.now() + 1020000, jobStart + 1200000 - 90000 - 30000);
const repo = fs.realpathSync(process.cwd()), parent = fs.realpathSync(process.env.RUNNER_TEMP ?? '');
const root = fs.mkdtempSync(path.join(parent, 'mcpcn-hosting-')); fs.chmodSync(root, 0o700);
const rootIdentity = fs.lstatSync(root), nonce = randomBytes(16).toString('hex');
fs.writeFileSync(path.join(root, '.owner'), nonce, { flag: 'wx', mode: 0o600 });
for (const dir of ['source', 'output', 'tools', 'tmp', 'cache', 'config', 'data', 'state']) fs.mkdirSync(path.join(root, dir), { mode: 0o700 });
for (const name of ['npm-user', 'npm-global']) fs.writeFileSync(path.join(root, name), '', { flag: 'wx', mode: 0o600 });
const source = path.join(root, 'source'), output = path.join(root, 'output');
const env = { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: process.env.HOME, LANG: 'C.UTF-8', TZ: 'UTC', CI: 'true', NO_COLOR: '1',
  TMPDIR: path.join(root, 'tmp'), TMP: path.join(root, 'tmp'), TEMP: path.join(root, 'tmp'),
  XDG_CACHE_HOME: path.join(root, 'cache'), XDG_CONFIG_HOME: path.join(root, 'config'), XDG_DATA_HOME: path.join(root, 'data'), XDG_STATE_HOME: path.join(root, 'state'),
  npm_config_cache: path.join(root, 'cache', 'npm'), npm_config_userconfig: path.join(root, 'npm-user'), npm_config_globalconfig: path.join(root, 'npm-global'),
  npm_config_registry: 'https://registry.npmjs.org/', npm_config_ignore_scripts: 'true', npm_config_audit: 'false', npm_config_fund: 'false',
  npm_config_fetch_retries: '0', npm_config_fetch_timeout: '15000', npm_config_update_notifier: 'false',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0',
  MCPCN_HOSTING_RUN_ROOT: root, MCPCN_HOSTING_NONCE: nonce,
  MCPCN_FORMS_RUN_ROOT: root, MCPCN_FORMS_NONCE: nonce, // Actual fresh compatibility markers for the unchanged shared helper.
  NEXT_TELEMETRY_DISABLED: '1', TURBO_TELEMETRY_DISABLED: '1', SOURCE_COMMIT: sourceCommit };
const report = { schemaVersion: 'mcpcn.static-registry-checks.v1', sourceCommit, workflowCommit, runId, status: 'failed', startedAt: new Date().toISOString(),
  runtime: { node: process.version, executableSha256: sha(fs.readFileSync(process.execPath)), platform: process.platform, architecture: process.arch },
  limits: { jobSeconds: 1200, workMaximumSeconds: 1020, cleanupSeconds: 90, marginSeconds: 30, streamBytes: STREAM, normalProofGzipBytes: PROOF,
    evidenceFileRawBytes: 4194304, receiptRawBytes: RECEIPT_RAW, registryIndexBytes: REGISTRY_INDEX_BYTES, sourceFileLimit: 4000,
    sourceExportBytes: 67108864, httpOrdinaryBodyBytes: 4194304, httpCombinedBodyBytes: 54525952, termGraceSeconds: 5, killDrainSeconds: 5 },
  timing: { jobStartedMs: jobStart, admittedAtMs: Date.now(), workEndMs: workEnd }, commands: [], sourceGuards: [], errors: [],
  processBaseline: { taskStartTicks, limit: 2048, complete: false, identities: [], ancestors: [], errors: [], exclusionScope: 'exact_unchanged_pre_task_identities_and_supervisor_ancestors_only' },
  cleanup: { passed: false, rootRemoved: false, ownedProcessesRemaining: null, uncertain: false, processes: [], scanErrors: [], scanErrorCount: 0,
    baselineSkipped: [], ancestorSkipped: [], dispositions: { vanished: 0, pid_reused: 0, stable_unreadable: 0, identity_recheck_failed: 0 } },
  proofLimits: ['Hosting-only packet: eight actual staging cases, twelve unchanged shared process-ownership prerequisites, two identical Turbo docs builds and six owned loopback HTTP observations. Closed component/browser/consumer checks are not replayed.',
    'Required dependency builds may invoke the registry generator; the complete canonical aggregate and all 167 generated files must stay unchanged. No generated bundle is returned or adopted and no new package archive is produced.',
    'The second build must be an actual docs cache hit after only two identity-verified generated public files are removed and positively observed absent. Both full bodies must be restored.',
    'The large HTTP index is compared byte-for-byte to the complete immutable canonical source and its count/hash; a duplicate large response original is deliberately not retained. Five bounded ordinary bodies and all request/response/socket terminal observations are retained.',
    'Actual fresh MCPCN_FORMS root/nonce markers are compatibility aliases for the unchanged shared ownership helper. The new ledger uses MCPCN_HOSTING; environment evidence is never rewritten. Unknown ownership stays fatal.',
    'CI verifies owned localhost production routing, not Vercel READY/alias/public delivery, browser interaction, external hosts, npm, accounts, providers or full-product acceptance.'] };
const commands = new Set(), evidence = [], observed = new Map(), services = new Map(), requests = new Set(), readinessSockets = new Set();
let baseline, exportedEntries, cleanupEnd, interrupted = false, evidenceBytes = 0, playgroundAssetBaseline = null, generatedPaths, generatedBaseline;
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
function readSource(file) {
  const indexed = file === path.join(source, INDEX.path) || file === path.join(repo, INDEX.path);
  return read(file, indexed ? REGISTRY_INDEX_BYTES : 16777216);
}
function retain(name, bytes) {
  need(/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/.test(name) && bytes.length <= (name === 'receipt.json' ? RECEIPT_RAW : 4194304), 'evidence_file_bound');
  need(!evidence.some(item => item.name === name), 'evidence_name_duplicate');
  const packed = gzipSync(bytes, { level: 9, mtime: 0 });
  need(evidenceBytes + packed.length <= (name === 'receipt.json' ? PROOF : PROOF - 524288), 'evidence_total_bound');
  evidenceBytes += packed.length; evidence.push({ name, bytes: bytes.length, sha256: sha(bytes), gzipBytes: packed.length, packed });
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
function verifiedOwnedParentAndGroup(info, trigger = null) {
  const attempt = { child: info, disposition: 'unproven', failure: null, before: null, after: null, anchors: {}, ...(trigger ? { trigger } : {}) };
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
      // A derived parent may be freshly shown nonce-absent for another complete
      // two-edge proof; its prior identity never becomes an independent anchor.
      if (prior && role !== 'parent') { anchor.disposition = 'derived_anchor_ineligible'; return null; }
      report.cleanup.anchorNonceProbeCount = (report.cleanup.anchorNonceProbeCount ?? 0) + 1;
      if (report.cleanup.anchorNonceProbeCount > 64) { anchor.disposition = 'probe_bound'; return null; }
      let raw;
      try { raw = readProc(`/proc/${current.pid}/environ`, 1048576); }
      catch (error) { anchor.disposition = 'nonce_read_failed'; anchor.errno = processErrorCode(error); return null; }
      const fields = raw.toString().split('\0'), nonceNamespace = ['MCPCN_HOSTING'].find(prefix =>
        fields.includes(`${prefix}_RUN_ROOT=${root}`) && fields.includes(`${prefix}_NONCE=${nonce}`));
      try { anchor.identityAfter = proc(current.pid); }
      catch (error) { anchor.disposition = 'identity_recheck_failed'; anchor.errno = processErrorCode(error); return null; }
      if (!same(current, anchor.identityAfter) || current.ppid !== anchor.identityAfter.ppid) { anchor.disposition = 'identity_changed'; return null; }
      if (!nonceNamespace) { anchor.disposition = 'nonce_absent'; return null; }
      if (prior) { anchor.disposition = 'derived_anchor_ineligible'; return null; }
      const owned = { ...current, ownershipMethod: 'nonce_environment', directCommandLabel: null, nonceNamespace,
        nonceObservation: { source: 'fresh_anchor_probe', before: current, after: anchor.identityAfter } };
      observed.set(`${current.pid}:${current.starttime}`, owned); report.cleanup.processes.push(owned); anchor.disposition = 'fresh_nonce_verified';
      return { method: 'nonce_environment', label: null, identity: owned };
    };
    const parent = known(parentBefore, 'parent'), group = known(groupBefore, 'groupLeader');
    if (!parent && group && attempt.anchors.parent?.disposition === 'nonce_absent') {
      const twoEdge = verifyFormWorkflowTwoEdgeOwnership({ child: childBefore, parent: parentBefore, groupLeader: groupBefore,
        parentAnchorDisposition: attempt.anchors.parent.disposition, groupProvenance: group, taskStartTicks, root, nonce,
        consumeProbe: () => {
          report.cleanup.anchorNonceProbeCount = (report.cleanup.anchorNonceProbeCount ?? 0) + 1;
          return report.cleanup.anchorNonceProbeCount <= 64;
        }, readIdentity: proc, readEnvironment: (pid, limit) => readProc(`/proc/${pid}/environ`, limit) });
      attempt.twoEdge = twoEdge;
      if (twoEdge.accepted) {
        const proof = twoEdge.proof, method = proof.method;
        const derivedParent = { ...proof.before.parent, ownershipMethod: method, directCommandLabel: null, ownershipProof: proof };
        const parentKey = `${derivedParent.pid}:${derivedParent.starttime}`;
        if (!observed.has(parentKey)) { observed.set(parentKey, derivedParent); report.cleanup.processes.push(derivedParent); }
        attempt.after = proof.after; attempt.disposition = 'accepted';
        return { method, taskStartTicks, ...(trigger ? { trigger } : {}), childBefore: proof.before.child, childAfter: proof.after.child,
          parent: { provenance: { method, label: null, identity: derivedParent }, before: proof.before.parent, after: proof.after.parent },
          groupLeader: { provenance: group, before: proof.before.groupLeader, after: proof.after.groupLeader }, twoEdgeProof: proof };
      }
    }
    if (!parent || !group) return refuse('anchor_independent_ownership_unproved');
    const childAfter = proc(info.pid), parentAfter = proc(info.ppid), groupAfter = proc(info.pgid);
    attempt.after = { child: childAfter, parent: parentAfter, groupLeader: groupAfter };
    if (!same(childBefore, childAfter) || childAfter.ppid !== info.ppid || !same(parentBefore, parentAfter) || parentBefore.ppid !== parentAfter.ppid
      || !same(groupBefore, groupAfter) || groupBefore.ppid !== groupAfter.ppid) return refuse('fresh_identity_recheck_unproved');
    attempt.disposition = 'accepted';
    return { taskStartTicks, ...(trigger ? { trigger } : {}), childBefore, childAfter,
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
          ownershipMethod = ownershipProof.method ?? 'verified_owned_parent_and_group';
        }
        if (!ownershipProof) {
          const fields = raw.toString().split('\0');
          nonceNamespace = ['MCPCN_HOSTING'].find(prefix => fields.includes(`${prefix}_RUN_ROOT=${root}`) && fields.includes(`${prefix}_NONCE=${nonce}`)) ?? null;
          if (!nonceNamespace) {
            const independentMethods = ['direct_command_identity', 'nonce_environment'];
            const knownGroupPid = report.commands.some(command => command.identity?.pid === info.pgid)
              || [...observed.values()].some(item => item.pid === info.pgid && independentMethods.includes(item.ownershipMethod));
            if (!knownGroupPid) continue;
            const groupLeader = proc(info.pgid);
            const directGroup = report.commands.find(command => same(command.identity, groupLeader));
            const priorGroup = groupLeader ? observed.get(`${groupLeader.pid}:${groupLeader.starttime}`) : null;
            const groupProvenance = directGroup
              ? { method: 'direct_command_identity', label: directGroup.label, identity: directGroup.identity }
              : same(priorGroup, groupLeader) && independentMethods.includes(priorGroup.ownershipMethod)
                ? { method: priorGroup.ownershipMethod, label: priorGroup.directCommandLabel, identity: priorGroup } : null;
            if (!isFormWorkflowEagerOwnershipCandidate({ candidate: info, groupLeader, groupProvenance, taskStartTicks })) continue;
            ownershipProof = verifiedOwnedParentAndGroup(info, 'readable_nonce_absent');
            if (!ownershipProof && !report.errors.includes('eager_ownership_unproved')) report.errors.push('eager_ownership_unproved');
            need(ownershipProof, 'eager_ownership_unproved');
            ownershipMethod = ownershipProof.method ?? 'verified_owned_parent_and_group';
          }
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
  const parseTree = bytes => {
    const value = new Map();
    for (const entry of bytes.toString().split('\0').filter(Boolean)) {
      const [head, name] = entry.split('\t'), [mode, type, blob] = head.split(' ');
      need(type === 'blob' && ['100644', '100755'].includes(mode), 'source_type_invalid'); value.set(name, { mode, blob });
    }
    return value;
  };
  const tree = parseTree(await get(['ls-tree', '-r', '-z', 'HEAD']));
  need(tree.size <= 4000, 'source_count_bound');
  if (!baseline) {
    need((await get(['rev-list', '--parents', '-n', '1', 'HEAD'])).toString().trim() === `${sourceCommit} ${BASE}`, 'source_direct_parent_required');
    need(!tree.has(ACTIVE), 'source_active_workflow_forbidden');
    const prior = parseTree(await get(['ls-tree', '-r', '-z', BASE]));
    const metadata = name => name.startsWith('docs/') || ['AGENTS.md', 'README.md'].includes(name);
    const names = [...new Set([...prior.keys(), ...tree.keys()])].sort();
    const changes = names.filter(name => JSON.stringify(prior.get(name)) !== JSON.stringify(tree.get(name)));
    const applicationChanges = changes.filter(name => !metadata(name));
    exactSet(applicationChanges, APPLICATION_PATHS, 'hosting_application_delta_set');
    const protectedNames = names.filter(name => !metadata(name) && !APPLICATION_PATHS.includes(name));
    for (const name of protectedNames) need(prior.has(name) && tree.has(name)
      && prior.get(name).mode === tree.get(name).mode && prior.get(name).blob === tree.get(name).blob, 'protected_application_changed');
    for (const name of ['tooling/run-static-registry-checks.mjs', 'tooling/stage-docs-registry.mjs', 'tooling/stage-docs-registry.test.mjs'])
      need(!prior.has(name) && tree.get(name)?.mode === '100644', 'new_hosting_tool_shape');
    for (const name of ['.gitignore', 'apps/docs/package.json', 'turbo.json'])
      need(prior.get(name)?.mode === tree.get(name)?.mode, 'hosting_configuration_mode_changed');
    need(prior.has('apps/docs/app/r/registry.json/route.ts') && !tree.has('apps/docs/app/r/registry.json/route.ts'), 'aggregate_isr_route_not_deleted');
    const priorBody = async name => (await get(['show', `${BASE}:${name}`])).toString('utf8');
    const packageBefore = JSON.parse(await priorBody('apps/docs/package.json')), packageAfter = JSON.parse(read(path.join(repo, 'apps/docs/package.json')));
    const originalBuild = packageBefore.scripts.build;
    need(originalBuild === 'node ../../tooling/stage-playground.mjs --target docs && next build'
      && packageAfter.scripts.build === 'node ../../tooling/stage-playground.mjs --target docs && node ../../tooling/stage-docs-registry.mjs && next build', 'docs_build_script_delta');
    packageAfter.scripts.build = originalBuild; exact(packageAfter, packageBefore, 'docs_other_package_metadata_changed');
    const turboBefore = JSON.parse(await priorBody('turbo.json')), turboAfter = JSON.parse(read(path.join(repo, 'turbo.json')));
    need(!Object.hasOwn(turboBefore.tasks, '@mcpcn/docs#build'), 'baseline_docs_task_already_present');
    exact(turboAfter.tasks['@mcpcn/docs#build'], { dependsOn: ['^build'],
      inputs: ['$TURBO_DEFAULT$', '!public/playground-simulator/**', '!public/r/**', '$TURBO_ROOT$/registry/registry.json', '$TURBO_ROOT$/tooling/stage-playground.mjs', '$TURBO_ROOT$/tooling/stage-docs-registry.mjs'],
      outputs: ['.next/**', '!.next/cache/**', 'public/playground-simulator/**', 'public/r/**'] }, 'docs_turbo_task_delta');
    delete turboAfter.tasks['@mcpcn/docs#build']; exact(turboAfter, turboBefore, 'other_turbo_configuration_changed');
    const ignoreBefore = await priorBody('.gitignore'), ignoreAfter = read(path.join(repo, '.gitignore')).toString('utf8');
    const ignoreAnchor = 'apps/docs/public/playground-simulator/\n';
    need(ignoreBefore.split(ignoreAnchor).length === 2 && ignoreAfter === ignoreBefore.replace(ignoreAnchor, ignoreAnchor + 'apps/docs/public/r/\n'), 'ignore_delta_not_single_entry');
    report.sourceAdmission = { baseCommit: BASE, packageSource: BASE, directParent: true, activeWorkflowAbsent: true, sourceFileLimit: 4000,
      applicationDelta: applicationChanges.map(name => ({ path: name, before: prior.get(name) ?? null, after: tree.get(name) ?? null })),
      protectedFiles: protectedNames.map(name => ({ path: name, ...prior.get(name) })), protectedPathsUnchanged: true, generatedSeedUnchanged: true,
      metadataChanges: changes.filter(metadata), docsPackageBuildOnly: true, docsTurboTaskOnly: true, ignoreSingleEntryOnly: true };
  }
  need((await get(['status', '--porcelain=v1', '-z', '--untracked-files=all'])).length === 0, 'source_status_dirty');
  await get(['-c', 'core.filemode=true', 'diff', '--no-ext-diff', '--no-textconv', '--exit-code', 'HEAD', '--']);
  for (const [name, item] of tree) {
    need(!path.isAbsolute(name) && !name.split('/').some(x => ['', '.', '..'].includes(x)), 'source_path_invalid');
    const file = path.join(repo, name), s = fs.lstatSync(file), b = readSource(file);
    const blob = sha(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b]), 'sha1');
    need(item.mode === (s.mode & 0o111 ? '100755' : '100644') && item.blob === blob, 'source_bytes_changed');
    row.files.push({ path: name, mode: item.mode, bytes: b.length, sha256: sha(b), gitBlob: blob, device: s.dev, inode: s.ino, mtimeMs: s.mtimeMs, ctimeMs: s.ctimeMs });
  }
  if (baseline) exact(row.files, baseline, 'source_identity_changed'); else baseline = row.files;
  row.passed = true;
}
function exportSource() {
  const prefixes = ['packages/', 'apps/docs/', 'apps/playground/', 'registry/', 'templates/', 'examples/'];
  const tools = ['tooling/stage-playground.mjs', 'tooling/stage-docs-registry.mjs', 'tooling/stage-docs-registry.test.mjs',
    'tooling/form-workflow-process-ownership.mjs', 'tooling/form-workflow-process-ownership.test.mjs'];
  exportedEntries = baseline.filter(entry => !entry.path.startsWith('apps/docs/public/playground-simulator/') && !entry.path.startsWith('apps/docs/public/r/')
    && (!entry.path.includes('/') || prefixes.some(prefix => entry.path.startsWith(prefix)) || tools.includes(entry.path)));
  need(tools.every(name => exportedEntries.some(entry => entry.path === name)), 'runtime_owner_file_missing');
  let total = 0;
  for (const entry of exportedEntries) {
    const b = readSource(path.join(repo, entry.path));
    need(b.length === entry.bytes && sha(b) === entry.sha256
      && sha(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b]), 'sha1') === entry.gitBlob, 'export_read_source_binding');
    const publicWorkspaceConfig = entry.path === '.npmrc' && b.equals(Buffer.from('auto-install-peers=true\nstrict-peer-dependencies=false\nlink-workspace-packages=true\n'));
    need(publicWorkspaceConfig || !/(?:^|\/)(?:\.git|node_modules|\.npmrc|\.env(?!\.example$)[^/]*|id_rsa|id_ed25519|[^/]*\.(?:pem|key))(?:\/|$)/.test(entry.path), 'source_secret_or_dependency_path');
    const target = path.join(source, entry.path); fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    total += b.length; need(total <= 67108864, 'export_total_bound');
    fs.writeFileSync(target, b, { flag: 'wx', mode: entry.mode === '100755' ? 0o700 : 0o600 });
    need(readSource(target).equals(b), 'export_written_source_binding');
  }
  report.export = { files: exportedEntries.length, bytes: total, sourceFiles: baseline.length, excludedFiles: baseline.length - exportedEntries.length,
    includedPrefixes: prefixes, toolingFiles: tools, rootMetadataIncluded: true, excludedBuiltSimulator: true, excludedStaticRegistry: true,
    originalModesRecorded: true, copiedPermissions: 'owner-only', filesVector: exportedEntries.map(({ path, mode, bytes, sha256, gitBlob }) => ({ path, mode, bytes, sha256, gitBlob })) };
}
function guardExport(label) {
  const result = { label, passed: false }; report.exportGuards ??= []; report.exportGuards.push(result);
  const tracked = new Set(exportedEntries.map(entry => entry.path)); let entries = 0;
  function walk(directory, relative = '') {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      need(++entries <= 4000, 'export_entry_bound');
      const name = relative ? `${relative}/${item.name}` : item.name;
      need(!item.isSymbolicLink(), 'export_unexpected_symlink');
      if (item.name === 'node_modules') { need(item.isDirectory(), 'export_dependency_directory'); continue; }
      if (['apps/docs/.next', 'apps/playground/dist', 'apps/docs/public/playground-simulator', 'apps/docs/public/r'].includes(name)
        || /^packages\/(?:core|schemas|runtime|react|themes|registry|cli)\/dist$/.test(name)) { need(item.isDirectory(), 'export_output_directory'); continue; }
      if (item.isDirectory()) walk(path.join(directory, item.name), name);
      else need(item.isFile() && (tracked.has(name) || /^\.turbo\/runs\/[A-Za-z0-9_-]+\.json$/.test(name)
        || /^(?:packages\/(?:core|schemas|runtime|react|themes|registry|cli)|apps\/(?:docs|playground))\/(?:tsconfig\.tsbuildinfo|\.turbo\/turbo-build\.log)$/.test(name)), 'export_unexpected_file');
    }
  }
  walk(source);
  for (const entry of exportedEntries) {
    const file = path.join(source, entry.path), stat = fs.lstatSync(file);
    need((stat.mode & 0o111 ? '100755' : '100644') === entry.mode && sha(readSource(file)) === entry.sha256, 'export_source_changed');
  }
  need(!fs.existsSync(path.join(source, ACTIVE)), 'export_active_workflow_present'); result.passed = true;
}
function generatedSnapshot(label) {
  const raw = readSource(path.join(source, INDEX.path));
  need(raw.length === INDEX.bytes && sha(raw) === INDEX.sha256, 'canonical_index_binding');
  const seed = JSON.parse(raw);
  need(Array.isArray(seed.items) && seed.items.length === 79, 'registry_item_count');
  const names = seed.items.map(item => item.name);
  need(new Set(names).size === 79 && names.every(name => /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)), 'registry_item_names');
  const registry = ['registry/registry.json', 'registry/config.schema.json', ...names.flatMap(name => [`registry/${name}.json`, `registry/items/${name}.json`])];
  exactSet(baseline.filter(entry => entry.path.startsWith('registry/')).map(entry => entry.path), registry, 'registry_path_set');
  generatedPaths = new Set([...registry, ...PACKAGES.map(name => `packages/${name}/LICENSE`)]);
  need(generatedPaths.size === 167, 'generated_integrity_count');
  const files = [...generatedPaths].sort().map(name => {
    const data = readSource(path.join(source, name)), original = baseline.find(entry => entry.path === name);
    need(original && data.length === original.bytes && sha(data) === original.sha256, 'generated_original_changed');
    return { path: name, mode: original.mode, bytes: data.length, sha256: sha(data), gitBlob: original.gitBlob };
  });
  const value = { label, files, bytes: files.reduce((total, file) => total + file.bytes, 0), vectorSha256: sha(Buffer.from(JSON.stringify(files))), passed: true };
  report.generatedIntegrity ??= { passed: false, files: 167, canonicalIndex: INDEX, snapshots: [] };
  report.generatedIntegrity.snapshots.push(value);
  if (generatedBaseline) exact(files, generatedBaseline.files, 'generated_integrity_changed'); else generatedBaseline = value;
  report.generatedIntegrity.passed = true; return seed;
}
async function installTools() {
  const npmCli = fs.realpathSync(path.join(path.dirname(process.execPath), 'npm')); report.runtime.npmCliSha256 = sha(read(npmCli));
  const tools = path.join(root, 'tools'), version = '10.24.0';
  const result = await run('metadata-pnpm', process.execPath, [npmCli, 'view', `pnpm@${version}`, 'name', 'version', 'dist', '--json'], 30, { cwd: tools });
  const metadata = JSON.parse(result.bytes[0]);
  need(metadata.name === 'pnpm' && metadata.version === version && metadata.dist.tarball.startsWith('https://registry.npmjs.org/')
    && /^sha512-[A-Za-z0-9+/]+=*$/.test(metadata.dist.integrity), 'tool_metadata_identity');
  fs.writeFileSync(path.join(tools, 'package.json'), JSON.stringify({ name: 'mcpcn-hosting-owned-tools', private: true, dependencies: { pnpm: version } }), { flag: 'wx', mode: 0o600 });
  await run('tools-install', process.execPath, [npmCli, 'install', '--ignore-scripts', '--omit=optional', '--no-audit', '--no-fund'], 120, { cwd: tools });
  const bytes = read(path.join(tools, 'package-lock.json')), lock = JSON.parse(bytes), entry = lock.packages['node_modules/pnpm'];
  need(entry?.version === version && entry.resolved === metadata.dist.tarball && entry.integrity === metadata.dist.integrity, 'tool_lock_identity');
  exactSet(Object.keys(lock.packages).filter(name => name), ['node_modules/pnpm'], 'tool_unexpected_dependency');
  retain('tools-lock.json', bytes); report.runtime.toolMetadata = [metadata];
  const pnpm = path.join(tools, 'node_modules/pnpm/bin/pnpm.cjs'); report.runtime.pnpmExecutableSha256 = sha(read(pnpm));
  const binaryDirectory = path.join(tools, 'node_modules/.bin'), binaryStat = fs.lstatSync(binaryDirectory);
  need(binaryStat.isDirectory() && !binaryStat.isSymbolicLink() && binaryStat.uid === process.getuid() && fs.realpathSync(binaryDirectory) === binaryDirectory
    && fs.realpathSync(path.join(binaryDirectory, 'pnpm')) === fs.realpathSync(pnpm), 'owned_pnpm_path_identity');
  env.PATH = `${binaryDirectory}:${env.PATH}`;
  need((await run('pnpm-version', process.execPath, [pnpm, '--version'], 10)).bytes[0].toString().trim() === version, 'pnpm_runtime_version'); return { pnpm };
}
async function stagingTests() {
  const files = ['tooling/stage-docs-registry.mjs', 'tooling/stage-docs-registry.test.mjs'].map(name => {
    const canonical = read(path.join(repo, name)), copied = read(path.join(source, name)); need(canonical.equals(copied), 'staging_fixture_source_binding');
    return { path: name, bytes: copied.length, sha256: sha(copied) };
  });
  const authored = read(path.join(source, files[1].path)).toString('utf8');
  const ids = [...authored.matchAll(/^test\('([A-Za-z0-9_]+)', async \(\) => \{$/gm)].map(match => match[1]);
  exact(ids, STAGING_CASES, 'staging_case_manifest'); need(!/\btest\.(?:skip|only|todo)\s*\(/.test(authored), 'staging_case_modifier');
  report.stagingTests = { passed: false, cases: 8, caseIds: ids, sourceFiles: files, commandLabel: 'static-registry-staging-checks' };
  const checked = await run(report.stagingTests.commandLabel, process.execPath,
    ['--test', '--test-reporter=tap', '--test-concurrency=1', path.join(source, files[1].path)], 120, { allowFailure: true });
  report.stagingTests.stdout = { bytes: checked.bytes[0].length, sha256: sha(checked.bytes[0]) };
  report.stagingTests.stderr = { bytes: checked.bytes[1].length, sha256: sha(checked.bytes[1]) };
  const tap = checked.bytes[0].toString('utf8'), passed = [...tap.matchAll(/^ok ([1-9][0-9]*) - ([A-Za-z0-9_]+)$/gm)];
  need(tap.startsWith('TAP version 13\n') && /^1\.\.8$/m.test(tap) && /^# tests 8$/m.test(tap) && /^# pass 8$/m.test(tap)
    && /^# fail 0$/m.test(tap) && /^# cancelled 0$/m.test(tap) && /^# skipped 0$/m.test(tap) && /^# todo 0$/m.test(tap)
    && !/^not ok\b/m.test(tap) && !/^\s*(?:not )?ok\b[^\n]*#\s*(?:SKIP|TODO)\b/im.test(tap), 'staging_tap_totals');
  exact(passed.map(match => Number(match[1])), STAGING_CASES.map((_, index) => index + 1), 'staging_tap_order');
  exact(passed.map(match => match[2]), STAGING_CASES, 'staging_tap_cases'); need(checked.row.passed, 'staging_command_failed'); report.stagingTests.passed = true;
}
async function checkProcessOwnershipFixtures() {
  const paths = ['tooling/form-workflow-process-ownership.mjs', 'tooling/form-workflow-process-ownership.test.mjs'];
  const files = paths.map(name => {
    const canonical = read(path.join(repo, name)), copied = read(path.join(source, name));
    need(copied.equals(canonical), 'ownership_fixture_source_binding');
    return { path: name, bytes: copied.length, sha256: sha(copied) };
  });
  const expected = [
    'PO01_direct_group_binds_exact_two_edge_chain', 'PO02_nonce_group_binds_without_promoting_derived_parent',
    'PO03_only_fresh_parent_nonce_absence_enables_fallback', 'PO04_derived_or_changed_group_never_becomes_independent',
    'PO05_offchain_parent_or_collapsed_edges_are_refused', 'PO06_reparenting_before_or_after_nonce_read_is_refused',
    'PO07_pid_or_starttime_reuse_at_each_edge_is_refused', 'PO08_group_nonce_and_root_must_match_exact_current_namespace',
    'PO09_uid_mismatch_or_change_at_any_identity_is_refused', 'PO10_pgid_mismatch_or_change_at_any_identity_is_refused',
    'PO11_job_cutoff_and_group_parent_child_start_order_are_required', 'PO12_probe_environment_and_identity_read_bounds_fail_closed',
  ];
  const authored = read(path.join(source, paths[1])).toString('utf8');
  const declared = [...authored.matchAll(/^test\('([A-Za-z0-9_]+)', \(\) => \{$/gm)].map(match => match[1]);
  exact(declared, expected, 'ownership_fixture_case_manifest');
  need(!/\btest\.(?:skip|only|todo)\s*\(/.test(authored), 'ownership_fixture_case_modifier');
  const label = 'form-workflow-process-ownership-checks';
  report.processOwnershipChecks = { passed: false, cases: expected.length, caseIds: expected, sourceFiles: files,
    productionFunction: 'verifyFormWorkflowTwoEdgeOwnership', candidateFunction: 'isFormWorkflowEagerOwnershipCandidate',
    commandLabel: label, productCaseManifestUnchanged: true, sharedClosedPrerequisite: true,
    compatibilityMarkers: ['MCPCN_FORMS_RUN_ROOT', 'MCPCN_FORMS_NONCE'] };
  const checked = await run(label, process.execPath,
    ['--test', '--test-reporter=tap', '--test-concurrency=1', path.join(source, paths[1])], 15, { allowFailure: true });
  report.processOwnershipChecks.stdout = { bytes: checked.bytes[0].length, sha256: sha(checked.bytes[0]) };
  report.processOwnershipChecks.stderr = { bytes: checked.bytes[1].length, sha256: sha(checked.bytes[1]) };
  const tap = checked.bytes[0].toString('utf8');
  const passed = [...tap.matchAll(/^ok ([1-9][0-9]*) - ([A-Za-z0-9_]+)$/gm)];
  need(tap.startsWith('TAP version 13\n') && /^1\.\.12$/m.test(tap)
    && /^# tests 12$/m.test(tap) && /^# pass 12$/m.test(tap) && /^# fail 0$/m.test(tap)
    && /^# cancelled 0$/m.test(tap) && /^# skipped 0$/m.test(tap) && /^# todo 0$/m.test(tap)
    && !/^not ok\b/m.test(tap) && !/^\s*(?:not )?ok\b[^\n]*#\s*(?:SKIP|TODO)\b/im.test(tap), 'ownership_fixture_tap_totals');
  exact(passed.map(match => Number(match[1])), expected.map((_, index) => index + 1), 'ownership_fixture_tap_order');
  exact(passed.map(match => match[2]), expected, 'ownership_fixture_tap_cases');
  need(checked.row.passed, 'ownership_fixture_command_failed'); report.processOwnershipChecks.passed = true;
}

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
async function stopServices() {
  for (const value of services.values()) if (value.handle && !value.handle.row.closeObserved) value.handle.stop();
  const results = await Promise.allSettled([...services.values()].map(value => value.promise));
  for (const result of results) need(result.status === 'fulfilled' && result.value.row.passed, 'owned_service_close_unproved');
}


function artifactSnapshot(label) {
  const folder = path.join(source, 'apps/docs/public/r'), parents = ['apps', 'apps/docs', 'apps/docs/public', 'apps/docs/public/r'];
  for (const relative of parents) {
    const file = path.join(source, relative), stat = fs.lstatSync(file);
    need(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() && fs.realpathSync(file) === file, 'static_artifact_parent_invalid');
  }
  exactSet(fs.readdirSync(folder), ['registry.json', 'registry-static-manifest.json'], 'static_artifact_entry_set');
  const files = ['registry.json', 'registry-static-manifest.json'].map(name => {
    const file = path.join(folder, name), stat = fs.lstatSync(file), body = read(file, name === 'registry.json' ? REGISTRY_INDEX_BYTES : 32768);
    need(stat.uid === process.getuid() && fs.realpathSync(file) === file && body.length > 0, 'static_artifact_file_invalid');
    return { path: `apps/docs/public/r/${name}`, bytes: body.length, sha256: sha(body),
      identity: { dev: stat.dev, ino: stat.ino, size: stat.size, uid: stat.uid, mode: stat.mode, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs } };
  });
  const index = files[0], marker = files[1], manifest = JSON.parse(read(path.join(source, marker.path), 32768));
  need(index.bytes === INDEX.bytes && index.sha256 === INDEX.sha256
    && read(path.join(source, index.path), REGISTRY_INDEX_BYTES).equals(readSource(path.join(source, INDEX.path))), 'static_index_not_exact_canonical');
  exact(manifest, { schemaVersion: 1, kind: 'mcpcn.docs.registry-static.v1', files: [{ path: 'registry.json', bytes: INDEX.bytes, sha256: INDEX.sha256 }] }, 'static_manifest_binding');
  const directory = fs.lstatSync(folder);
  const value = { label, passed: true, directory: { dev: directory.dev, ino: directory.ino, uid: directory.uid, mode: directory.mode }, files };
  report.staticArtifacts ??= []; report.staticArtifacts.push(value); return value;
}
function removeExactArtifact(previous) {
  const current = artifactSnapshot('before-cache-output-removal');
  exact(current.files, previous.files, 'cache_output_identity_changed'); exact(current.directory, previous.directory, 'cache_output_directory_changed');
  const row = { passed: false, before: previous, removed: [], positivelyAbsent: [], restored: null };
  report.cacheRestore = row;
  for (const file of previous.files) {
    const native = path.join(source, file.path), stat = fs.lstatSync(native);
    exact({ dev: stat.dev, ino: stat.ino, size: stat.size, uid: stat.uid, mode: stat.mode, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs }, file.identity, 'cache_removal_identity_changed');
    need(sha(read(native, file.path.endsWith('/registry.json') ? REGISTRY_INDEX_BYTES : 32768)) === file.sha256, 'cache_removal_body_changed');
    fs.unlinkSync(native); row.removed.push({ path: file.path, bytes: file.bytes, sha256: file.sha256 });
  }
  for (const file of previous.files) {
    try { fs.lstatSync(path.join(source, file.path)); throw new Error('cache_output_not_absent'); }
    catch (error) { need(error.code === 'ENOENT', 'cache_output_not_absent'); row.positivelyAbsent.push(file.path); }
  }
  need(fs.readdirSync(path.join(source, 'apps/docs/public/r')).length === 0, 'cache_output_directory_not_empty');
  const stat = fs.lstatSync(path.join(source, 'apps/docs/public/r'));
  exact({ dev: stat.dev, ino: stat.ino, uid: stat.uid, mode: stat.mode }, previous.directory, 'cache_empty_directory_changed');
  return row;
}
function turboRunFiles() {
  const directory = path.join(source, '.turbo/runs');
  if (!fs.existsSync(directory)) return [];
  const stat = fs.lstatSync(directory); need(stat.isDirectory() && !stat.isSymbolicLink() && fs.realpathSync(directory) === directory, 'turbo_summary_directory');
  const files = fs.readdirSync(directory); need(files.length <= 2 && files.every(name => /^[A-Za-z0-9_-]+\.json$/.test(name)), 'turbo_summary_file_set'); return files;
}
function turboSummary(label, before, expectedStatus = null) {
  const after = turboRunFiles(), added = after.filter(name => !before.includes(name));
  need(added.length === 1 && before.every(name => after.includes(name)), 'turbo_summary_not_one_new_file');
  const relative = `.turbo/runs/${added[0]}`, raw = read(path.join(source, relative), 2097152), value = JSON.parse(raw);
  need(Array.isArray(value.tasks) && value.tasks.length > 0 && value.tasks.length <= 32, 'turbo_summary_tasks');
  const tasks = value.tasks.filter(task => task.taskId === '@mcpcn/docs#build');
  need(tasks.length === 1 && ['MISS', 'HIT'].includes(tasks[0].cache?.status) && (expectedStatus === null || tasks[0].cache.status === expectedStatus)
    && typeof tasks[0].hash === 'string' && /^[a-f0-9]{16,64}$/.test(tasks[0].hash), 'turbo_docs_cache_status');
  const proofName = `${label}.turbo-summary.json`; retain(proofName, raw);
  return { path: relative, proofName, bytes: raw.length, sha256: sha(raw), docsTaskId: tasks[0].taskId, docsHash: tasks[0].hash,
    docsCacheStatus: tasks[0].cache.status, taskCount: value.tasks.length, passed: true };
}
function parseStageOutput(stdout, artifact) {
  const rows = stdout.toString('utf8').split('\n').filter(line => line.includes('"kind":"mcpcn.docs.registry-static.stage.v1"'));
  need(rows.length === 1, 'build_stage_success_record');
  const parsed = JSON.parse(rows[0].slice(rows[0].indexOf('{')));
  exact(parsed, { schemaVersion: 1, kind: 'mcpcn.docs.registry-static.stage.v1', status: 'staged', source: INDEX, destination: 'apps/docs/public/r',
    files: artifact.files.map(file => ({ path: path.basename(file.path), bytes: file.bytes, sha256: file.sha256 })) }, 'build_stage_source_artifact_binding');
  return parsed;
}
function prerenderSnapshot() {
  const file = path.join(source, 'apps/docs/.next/prerender-manifest.json'), raw = read(file, 2097152), value = JSON.parse(raw);
  need(value && value.routes && value.dynamicRoutes && typeof value.routes === 'object' && typeof value.dynamicRoutes === 'object', 'prerender_manifest_shape');
  need(!Object.hasOwn(value.routes, '/r/registry.json') && !Object.hasOwn(value.dynamicRoutes, '/r/registry.json')
    && (!Array.isArray(value.notFoundRoutes) || !value.notFoundRoutes.includes('/r/registry.json')), 'aggregate_still_prerendered');
  need(!fs.existsSync(path.join(source, 'apps/docs/app/r/registry.json/route.ts')), 'aggregate_isr_route_reappeared');
  retain('next-prerender-manifest.json', raw);
  report.prerender = { passed: true, path: 'apps/docs/.next/prerender-manifest.json', bytes: raw.length, sha256: sha(raw),
    aggregateRouteAbsent: true, staticArtifact: 'apps/docs/public/r/registry.json', dynamicItemRouteUnchanged: true };
}
const ORIGIN = 'http://127.0.0.1:4173';
const HTTP_CASES = [
  { id: 'H01_document_preview_html', route: '/components/document-preview', status: 200, mime: 'text/html', title: 'DocumentPreview' },
  { id: 'H02_file_review_html', route: '/components/file-review', status: 200, mime: 'text/html', title: 'FileReview' },
  { id: 'H03_exact_static_registry', route: '/r/registry.json', status: 200, mime: 'application/json', index: true },
  { id: 'H04_document_preview_item', route: '/r/document-preview.json', status: 200, mime: 'application/json', item: 'document-preview' },
  { id: 'H05_file_review_item', route: '/r/file-review.json', status: 200, mime: 'application/json', item: 'file-review' },
  { id: 'H06_unknown_item_404', route: '/r/mcpcn-hosting-unknown-item.json', status: 404, mime: 'application/json', missing: true },
];
async function productionReadiness() {
  const deadline = Math.min(Date.now() + 30000, workEnd); report.readiness = { passed: false, kind: 'owned_loopback_tcp_connect_and_close', attempts: [] };
  while (Date.now() < deadline && report.readiness.attempts.length < 60) {
    const row = { connected: false, socketClosed: false, error: null }; report.readiness.attempts.push(row);
    await new Promise(resolve => {
      const socket = net.createConnection({ host: '127.0.0.1', port: 4173 }); readinessSockets.add(socket);
      const terminal = setTimeout(() => { row.error ??= 'tcp_close_deadline'; socket.destroy(); resolve(); }, 2500);
      const timer = setTimeout(() => { row.error ??= 'tcp_deadline'; socket.destroy(); }, 1000);
      socket.once('connect', () => { row.connected = true; socket.destroy(); });
      socket.once('error', error => { row.error = /^[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'tcp_error'; });
      socket.once('close', () => { row.socketClosed = true; readinessSockets.delete(socket); clearTimeout(timer); clearTimeout(terminal); resolve(); });
    });
    need(row.socketClosed, 'readiness_socket_not_closed'); if (row.connected) { report.readiness.passed = true; return; }
    await pause(100);
  }
  throw new Error('production_listener_not_ready');
}
let httpBytes = 0;
function request(test, row, canonical) {
  const deadline = Math.min(Date.now() + 20000, workEnd), cap = test.index ? REGISTRY_INDEX_BYTES : 4194304, pieces = [], hash = createHash('sha256');
  Object.assign(row, { id: test.id, route: test.route, expectedStatus: test.status, status: 'running', deadlineMs: deadline, httpStatus: null,
    bytes: 0, sha256: null, complete: false, responseEnded: false, responseClosed: false, requestClosed: false, socketClosed: false, error: null,
    canonicalByteEquality: test.index ? true : null });
  return new Promise(resolve => {
    let incoming, socket, settled = false, timer; const state = { request: null, socket: null, row }; requests.add(state);
    const finish = (forced = false) => {
      const closed = row.requestClosed && row.socketClosed && (!incoming || row.responseClosed); if (closed) requests.delete(state);
      if (settled || !forced && !(closed && (row.error || row.responseEnded))) return;
      settled = true; clearTimeout(timer); row.settledAtMs = Date.now(); row.sha256 = hash.digest('hex');
      row.complete = row.responseEnded && incoming?.complete === true; if (Date.now() >= deadline) row.error ??= 'request_or_total_deadline';
      resolve(Buffer.concat(pieces));
    };
    const fail = code => { row.error ??= code; incoming?.destroy(); state.request?.destroy(); socket?.destroy(); finish(); };
    state.fail = fail;
    const target = new URL(test.route, ORIGIN);
    need(target.origin === ORIGIN && target.pathname === test.route && !target.search && !target.hash && !target.username && !target.password, 'fixed_http_url_invalid');
    state.request = http.get(target, { agent: false, maxHeaderSize: 16384,
      headers: { Accept: test.mime, 'Accept-Encoding': 'identity', Connection: 'close' } }, response => {
      incoming = response; row.httpStatus = response.statusCode; row.rawHeaders = response.rawHeaders; row.contentType = String(response.headers['content-type'] ?? '').slice(0, 128);
      const declared = response.headers['content-length'], counts = response.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'content-length').length;
      response.on('data', chunk => {
        if (settled) return;
        const offset = row.bytes; row.bytes += chunk.length; httpBytes += chunk.length; hash.update(chunk);
        if (test.index && (!canonical.subarray(offset, offset + chunk.length).equals(chunk))) row.canonicalByteEquality = false;
        if (row.bytes > cap || httpBytes > 54525952) fail('http_body_bound'); else if (!test.index) pieces.push(chunk);
      });
      response.on('end', () => {
        row.responseEnded = true;
        if (declared !== undefined && (!/^(?:0|[1-9][0-9]*)$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) !== row.bytes)) row.error ??= 'content_length_mismatch';
        finish();
      });
      response.on('close', () => { row.responseClosed = true; finish(); }); response.on('aborted', () => fail('response_aborted')); response.on('error', () => fail('response_stream_error'));
      if (response.statusCode !== test.status || response.headers.location !== undefined) fail('http_status_or_redirect');
      else if (row.contentType.split(';', 1)[0].trim().toLowerCase() !== test.mime) fail('http_content_type');
      else if (counts > 1 || declared !== undefined && (!/^(?:0|[1-9][0-9]*)$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > cap)) fail('content_length_invalid');
      else if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') fail('unexpected_content_encoding');
    });
    state.request.on('socket', value => { socket = value; state.socket = value; value.once('close', () => { row.socketClosed = true; finish(); }); });
    state.request.on('error', error => { if (/^[A-Z0-9_]{1,40}$/.test(error.code ?? '')) row.transportCode = error.code; fail('request_transport_error'); });
    state.request.once('close', () => { row.requestClosed = true; finish(); });
    timer = setTimeout(() => { fail('request_or_total_deadline'); finish(true); }, Math.max(1, deadline - Date.now()));
  });
}
async function checkHttp() {
  const canonical = readSource(path.join(source, INDEX.path)), registry = JSON.parse(canonical);
  report.http = { passed: false, origin: ORIGIN, sourceCommit, cases: [], combinedBytes: 0 };
  for (const test of HTTP_CASES) {
    const row = {}; report.http.cases.push(row); const body = await request(test, row, canonical);
    if (!test.index) { row.bodyProofName = `${test.id}.body`; row.retainedBody = { bytes: body.length, sha256: sha(body) }; retain(row.bodyProofName, body); }
    need(!row.error && row.httpStatus === test.status && row.bytes > 0 && row.complete && row.responseClosed && row.requestClosed && row.socketClosed, row.error ?? 'http_terminal_incomplete');
    if (test.index) {
      need(row.bytes === INDEX.bytes && row.sha256 === INDEX.sha256 && row.canonicalByteEquality, 'http_static_index_not_exact');
      row.canonicalBodyBinding = { source: INDEX, sourceCommit, duplicateResponseOriginalRetained: false, comparison: 'complete_streamed_byte_equality_and_sha256' };
    } else if (test.item) {
      const expected = registry.items.find(item => item.name === test.item);
      need(expected, 'http_expected_item_missing'); exact(JSON.parse(body), expected, 'http_item_semantic_mismatch');
      row.comparison = { kind: 'exact_canonical_item_semantics', item: test.item, canonicalItemSha256: sha(Buffer.from(JSON.stringify(expected))) };
    } else if (test.missing) {
      exact(JSON.parse(body), { error: 'Registry item not found' }, 'http_missing_item_body'); row.comparison = { kind: 'exact_missing_item_404' };
    } else {
      const html = new TextDecoder('utf-8', { fatal: true }).decode(body);
      need(html.includes(`<h1>${test.title}</h1>`) && html.includes('Supplied representations') && html.includes(`${test.title} data fields`), 'http_component_html_markers');
      row.comparison = { kind: 'actual_full_ssr_component_markers', title: test.title };
    }
    row.status = 'passed';
  }
  report.http.combinedBytes = httpBytes; report.http.passed = report.http.cases.length === 6 && report.http.cases.every(row => row.status === 'passed');
}
async function closeRequests() {
  for (const state of requests) state.fail('cleanup_active_http_request');
  for (const socket of readinessSockets) socket.destroy();
  const end = Math.min(cleanupEnd ?? workEnd, Date.now() + 5000);
  while ((requests.size || readinessSockets.size) && Date.now() < end) await pause(25);
  report.httpCleanup = { passed: requests.size === 0 && readinessSockets.size === 0, pendingReadinessSockets: readinessSockets.size,
    pendingRequests: [...requests].filter(state => !state.row.requestClosed).length,
    pendingResponses: [...requests].filter(state => state.row.httpStatus !== null && !state.row.responseClosed).length,
    pendingSockets: [...requests].filter(state => !state.row.socketClosed).length };
  need(report.httpCleanup.passed, 'http_closure_unproved');
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

function verifyAcceptedPlaygroundAssets(label) {
  verifyPlaygroundAssets(label, [path.join(source, 'apps/playground/dist'), path.join(source, 'apps/docs/public/playground-simulator')]);
  const check = report.playgroundAssetChecks.at(-1);
  for (const location of check.locations) {
    need(location.files.length === 7 && location.bytes === 797096, 'accepted_simulator_size_changed');
    exact(location.files, ASSET_FILES, 'accepted_simulator_bytes_changed');
  }
  check.acceptedPackageSource = BASE; check.acceptedFileReviewPacketUnchanged = true;
}
try {
  captureProcessBaseline(); await guard('before'); exportSource(); generatedSnapshot('before'); guardExport('before');
  await checkProcessOwnershipFixtures(); await stagingTests();
  fs.mkdirSync(env.npm_config_cache, { recursive: true, mode: 0o700 });
  const tools = await installTools();
  const pnpm = (label, args, seconds, options) => run(label, process.execPath, [tools.pnpm, `--config.store-dir=${path.join(root, 'cache', 'pnpm-store')}`, ...args], seconds, options);
  report.install = { lockSha256: sha(read(path.join(source, 'pnpm-lock.yaml'))), ignoreScripts: true, frozenLockfile: true, registry: env.npm_config_registry };
  await pnpm('frozen-install', ['install', '--frozen-lockfile', '--ignore-scripts', '--reporter=append-only'], 240);
  guardExport('after-install'); generatedSnapshot('after-install');
  const turboPackage = JSON.parse(read(path.join(source, 'node_modules/turbo/package.json')));
  report.runtime.turbo = { version: turboPackage.version, packageSha256: sha(read(path.join(source, 'node_modules/turbo/package.json'))) };
  need(turboPackage.version === '2.10.9', 'locked_turbo_version');
  const cache = path.join(root, 'cache', 'turbo'); fs.mkdirSync(cache, { mode: 0o700 });
  need(fs.readdirSync(cache).length === 0, 'turbo_cache_not_initially_empty');
  const args = ['exec', 'turbo', 'run', 'build', '--filter=@mcpcn/docs', `--cache-dir=${cache}`, '--cache=local:rw', '--env-mode=loose', '--summarize', '--output-logs=full'];
  report.docsBuild = { passed: false, actualArguments: args.map(value => value.replaceAll(root, '[owned-root]')), localCacheOnly: true,
    commandLabels: ['docs-production-build-first', 'docs-production-build-cache-restore'], builds: [], expectedPages: 81 };
  const firstBefore = turboRunFiles(), first = await pnpm(report.docsBuild.commandLabels[0], args, 240, { allowFailure: true });
  const firstRow = { commandLabel: first.row.label, passed: false, stdoutSha256: sha(first.bytes[0]), stderrSha256: sha(first.bytes[1]) }; report.docsBuild.builds.push(firstRow);
  need(first.row.passed, 'docs_first_build_failed');
  need(/Generating static pages[^\n]*\(81\/81\)/.test(first.bytes[0].toString('utf8')), 'docs_static_page_count');
  firstRow.summary = turboSummary('docs-build-first', firstBefore, 'MISS');
  const staged = artifactSnapshot('after-first-build'); firstRow.stageRecord = parseStageOutput(first.bytes[0], staged);
  firstRow.passed = true; report.docsBuild.observedPages = 81;
  verifyAcceptedPlaygroundAssets('after-first-build'); guardExport('after-first-build'); generatedSnapshot('after-first-build'); await guard('after-first-build');
  const removed = removeExactArtifact(staged), secondBefore = turboRunFiles();
  const second = await pnpm(report.docsBuild.commandLabels[1], args, 120, { allowFailure: true });
  const secondRow = { commandLabel: second.row.label, passed: false, stdoutSha256: sha(second.bytes[0]), stderrSha256: sha(second.bytes[1]) }; report.docsBuild.builds.push(secondRow);
  secondRow.summary = turboSummary('docs-build-cache-restore', secondBefore);
  need(second.row.passed, 'docs_cache_restore_build_failed');
  need(secondRow.summary.docsCacheStatus === 'HIT', 'turbo_docs_cache_status');
  need(secondRow.summary.docsHash === firstRow.summary.docsHash, 'docs_cache_key_changed');
  const restored = artifactSnapshot('after-cache-restore');
  exact(restored.files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })), staged.files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })), 'docs_cache_restored_body_mismatch');
  removed.restored = restored; removed.firstCacheStatus = firstRow.summary.docsCacheStatus; removed.secondCacheStatus = secondRow.summary.docsCacheStatus;
  removed.docsHash = secondRow.summary.docsHash; removed.passed = removed.removed.length === 2 && removed.positivelyAbsent.length === 2;
  secondRow.passed = true; report.docsBuild.passed = true;
  verifyAcceptedPlaygroundAssets('after-cache-restore'); guardExport('after-cache-restore'); generatedSnapshot('after-cache-restore'); prerenderSnapshot();
  need(workEnd - Date.now() >= 180000, 'http_readiness_full_budgets_not_reserved');
  const next = fs.realpathSync(path.join(source, 'apps/docs/node_modules/next/dist/bin/next'));
  report.runtime.next = { version: JSON.parse(read(path.join(source, 'apps/docs/node_modules/next/package.json'))).version, cliSha256: sha(read(next)) };
  report.services = [{ role: 'docs', label: 'docs-production-server', origin: ORIGIN }];
  const service = {}; services.set('docs', service);
  service.promise = run('docs-production-server', process.execPath, [next, 'start', '--hostname', '127.0.0.1', '--port', '4173'],
    Math.floor((workEnd - Date.now()) / 1000), { cwd: path.join(source, 'apps/docs'), service: true, allowFailure: true, onSpawn: handle => { service.handle = handle; } });
  service.promise.catch(() => {});
  await productionReadiness(); await checkHttp(); await closeRequests(); await stopServices();
  artifactSnapshot('after-http'); verifyAcceptedPlaygroundAssets('after-http'); generatedSnapshot('after-http'); guardExport('after-http'); await guard('after-acceptance');
} catch (error) { report.errors.push(finite(error)); }
finally {
  cleanupEnd = Math.min(Date.now() + 90000, jobStart + 1200000 - 15000);
  try { await closeRequests(); } catch (error) { report.errors.push(finite(error)); }
  try { await stopServices(); } catch (error) { report.errors.push(finite(error)); }
  try { await guard('after', true); if (exportedEntries) { guardExport('after'); generatedSnapshot('after'); } } catch (error) { report.errors.push(finite(error)); }
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
  report.status = !report.errors.length && report.processOwnershipChecks?.passed && report.stagingTests?.passed && report.docsBuild?.passed
    && report.cacheRestore?.passed && report.prerender?.passed && report.generatedIntegrity?.passed && report.readiness?.passed && report.http?.passed && report.httpCleanup?.passed
    && report.playgroundAssetChecks?.length === 3 && report.playgroundAssetChecks.every(row => row.passed && row.acceptedFileReviewPacketUnchanged)
    && report.services?.length === 1 && report.services.every(service => report.commands.some(command => command.label === service.label && command.passed))
    && report.sourceGuards.length === 4 && report.sourceGuards.every(row => row.passed) && report.exportGuards?.every(row => row.passed) && report.cleanup.passed ? 'passed' : 'failed';
  report.proof = { normalGzipBytesBeforeReceipt: evidenceBytes, generatedBundleReturned: false, finalStdoutSeconds: 20 };
  try { retain('receipt.json', Buffer.from(`${JSON.stringify(report, null, 2)}\n`)); } catch (error) { report.status = 'failed'; report.errors.push(finite(error)); }
  try {
    const end = Math.min(Date.now() + 20000, jobStart + 1200000 - 5000);
    for (const file of evidence) await emit(file, 'MCPCN_HOSTING', end);
    process.stdout.write(`MCPCN_HOSTING_RESULT=${JSON.stringify({ status: report.status, sourceCommit, workflowCommit, runId, errors: report.errors,
      stagingCases: report.stagingTests?.cases ?? 0, processOwnershipCases: report.processOwnershipChecks?.cases ?? 0,
      httpCases: report.http?.cases.length ?? 0, cacheRestored: report.cacheRestore?.passed === true })}\n`);
  } catch (error) { report.status = 'failed'; report.errors.push(finite(error)); process.stdout.destroy(); }
  process.exitCode = report.status === 'passed' ? 0 : 1;
}

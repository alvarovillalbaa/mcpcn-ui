// Anonymous delivery of a passing CI packet's exact shared playground artifact.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { rootCertificates } from 'node:tls';
import { createHash } from 'node:crypto';

const ORIGIN = 'https://mcpcn-ui.vercel.app', MIB = 1048576;
const MANIFEST = 'docs/results/2026/11-08/playground-asset-manifest.json';
const ORACLE = 'docs/results/2026/11-08/playground-asset-oracle.json';
const RECEIPT = 'docs/results/2026/11-08/playground-checks-originals/receipt.json';
const started = Date.now(), end = started + 60000, sources = new Map(), active = new Set();
const sourceCommit = process.argv[3], deploymentId = process.argv[5];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const need = (value, code) => { if (!value) throw new Error(code); };
const finite = error => /^[a-z0-9_]{1,80}$/.test(error?.message ?? '') ? error.message : 'observation_failed';
const same = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
const report = { schemaVersion: 'mcpcn.playground-public-delivery.v1', sourceCommit, deploymentId, workflowCommit: process.env.GITHUB_SHA,
  origin: ORIGIN, status: 'failed', startedAt: new Date(started).toISOString(), runtime: { node: process.version, platform: process.platform },
  anonymous: { authorization: false, cookies: false, credentials: false, proxy: false, redirectFollowing: false },
  limits: { assetFiles: 64, requestSeconds: 15, totalSeconds: 60, htmlBytes: MIB, manifestBytes: 32768, assetBytes: 4 * MIB,
    allAssetBytes: 16 * MIB, allResponseBytes: 17 * MIB + 32768, reportBytes: 32768, stdoutSeconds: 2 },
  checks: [], sources: [], errors: [], cleanup: { pendingRequests: null, pendingResponses: null, pendingSockets: null, allClosed: false },
  proofLimits: ['Anonymous canonical-origin HTTP only: the SSR iframe marker, manifest and every file named by the passing retained CI artifact. No browser interaction, CSS rendering, general docs all-assets or future availability proof.',
    'The checked CI source/workflow and supplied run/job metadata identify the retained passing packet. The deployed comparison source can include later evidence; supplied deployment ID and READY/alias source binding remain independent provider observations, not proven by HTTP.',
    'Full response bodies exist only in memory. Retained status, lengths, hashes, comparisons and terminal acknowledgements do not publish response bodies.',
    'Trusted built-in same-origin examples do not establish isolation of arbitrary third-party HTML. No external tool, model, account, authentication or npm publication is exercised.'] };
let root, combinedBytes = 0, assetBytes = 0;
const budget = deadline => need(Date.now() < Math.min(deadline, end), 'request_or_total_deadline');
function readSource(name, cap) {
  budget(end); const file = path.join(root, name), before = fs.lstatSync(file);
  need(before.isFile() && !before.isSymbolicLink() && before.size <= cap && fs.realpathSync(file) === file, 'source_file_invalid');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); let bytes;
  try {
    need(same(before, fs.fstatSync(fd)), 'source_identity_changed'); const buffer = Buffer.alloc(before.size + 1); let count = 0;
    while (count < buffer.length) { budget(end); const n = fs.readSync(fd, buffer, count, Math.min(65536, buffer.length - count), null); if (!n) break; count += n; }
    need(count === before.size && same(before, fs.fstatSync(fd)) && same(before, fs.lstatSync(file)), 'source_changed_during_read'); bytes = buffer.subarray(0, count);
  } finally { fs.closeSync(fd); }
  const row = { path: name, bytes: bytes.length, sha256: sha(bytes), device: before.dev, inode: before.ino, mtimeMs: before.mtimeMs, ctimeMs: before.ctimeMs, cap };
  if (sources.has(name)) need(JSON.stringify(row) === JSON.stringify(sources.get(name)), 'source_identity_changed'); else sources.set(name, row);
  return bytes;
}
function semantic(bytes) {
  const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); let nodes = 0;
  function ordered(value, depth = 0) {
    need(++nodes <= 10000 && depth <= 20, 'json_structure_bound');
    if (typeof value === 'number') need(Number.isFinite(value), 'json_nonfinite_number');
    if (Array.isArray(value)) return value.map(item => ordered(item, depth + 1));
    return value !== null && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key], depth + 1)])) : value;
  }
  return { parsed, canonical: JSON.stringify(ordered(parsed)) };
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, names) => need(object(value) && Object.keys(value).sort().join(',') === [...names].sort().join(','), 'oracle_shape');
const types = { html: ['text/html'], js: ['application/javascript', 'text/javascript'], css: ['text/css'], svg: ['image/svg+xml'], png: ['image/png'],
  jpg: ['image/jpeg'], jpeg: ['image/jpeg'], webp: ['image/webp'], avif: ['image/avif'], woff: ['font/woff', 'application/font-woff'], woff2: ['font/woff2'], ico: ['image/x-icon', 'image/vnd.microsoft.icon'] };
function passingProcessObservations(cleanup) {
  const rows = cleanup.scanErrors, counts = cleanup.dispositions;
  need(Array.isArray(rows) && rows.length <= 64 && Number.isSafeInteger(cleanup.scanErrorCount) && cleanup.scanErrorCount === rows.length, 'oracle_process_observation_count');
  exactKeys(counts, ['vanished', 'pid_reused', 'stable_unreadable', 'identity_recheck_failed']);
  need(Object.values(counts).every(value => Number.isSafeInteger(value) && value >= 0 && value <= 64)
    && counts.stable_unreadable === 0 && counts.identity_recheck_failed === 0 && counts.vanished + counts.pid_reused === rows.length, 'oracle_process_disposition_counts');
  const identity = (value, pid) => {
    exactKeys(value, ['pid', 'uid', 'ppid', 'pgid', 'starttime', 'state']);
    need(value.pid === pid && ['uid', 'ppid', 'pgid'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)
      && typeof value.starttime === 'string' && /^[0-9]{1,20}$/.test(value.starttime) && /^[A-Za-z]$/.test(value.state), 'oracle_process_identity');
  };
  let vanished = 0, reused = 0;
  for (const row of rows) {
    exactKeys(row, ['pid', 'phase', 'identityBefore', 'errno', 'identityAfter', 'recheckErrno', 'disposition']);
    need(Number.isSafeInteger(row.pid) && row.pid > 0 && ['identity', 'environment', 'identity_after'].includes(row.phase)
      && typeof row.errno === 'string' && /^[A-Z0-9_]{1,32}$/.test(row.errno), 'oracle_process_observation');
    if (row.identityBefore !== null) identity(row.identityBefore, row.pid);
    if (row.disposition === 'vanished') { need(row.identityAfter === null && ['ENOENT', 'ESRCH'].includes(row.recheckErrno), 'oracle_process_vanished'); vanished++; }
    else {
      need(row.disposition === 'pid_reused' && row.identityBefore !== null && row.recheckErrno === null, 'oracle_process_unproved'); identity(row.identityAfter, row.pid);
      need(row.identityBefore.starttime !== row.identityAfter.starttime && row.identityBefore.uid === row.identityAfter.uid, 'oracle_process_pid_reuse'); reused++;
    }
  }
  need(vanished === counts.vanished && reused === counts.pid_reused, 'oracle_process_row_disposition_parity');
  return { count: rows.length, vanished, pidReused: reused, unknown: 0 };
}
function artifactOracle() {
  const manifestBytes = readSource(MANIFEST, 32768), manifest = semantic(manifestBytes), oracleBytes = readSource(ORACLE, 32768), oracle = semantic(oracleBytes).parsed;
  exactKeys(oracle, ['schemaVersion', 'checkedSourceCommit', 'checkedWorkflowCommit', 'runId', 'jobId', 'receipt', 'manifest']);
  need(oracle.schemaVersion === 'mcpcn.playground-asset-oracle.v1' && /^[a-f0-9]{40}$/.test(oracle.checkedSourceCommit) && /^[a-f0-9]{40}$/.test(oracle.checkedWorkflowCommit)
    && oracle.checkedSourceCommit !== oracle.checkedWorkflowCommit && oracle.checkedSourceCommit !== sourceCommit, 'oracle_ci_source_pins');
  for (const key of ['runId', 'jobId']) need((typeof oracle[key] === 'string' || Number.isSafeInteger(oracle[key])) && /^[1-9][0-9]{0,19}$/.test(String(oracle[key])), 'oracle_run_job_metadata');
  for (const [key, filename, cap] of [['receipt', RECEIPT, 4 * MIB], ['manifest', MANIFEST, 32768]]) {
    exactKeys(oracle[key], ['path', 'bytes', 'sha256']);
    need(oracle[key].path === filename && Number.isSafeInteger(oracle[key].bytes) && oracle[key].bytes > 0 && oracle[key].bytes <= cap && /^[a-f0-9]{64}$/.test(oracle[key].sha256), 'oracle_file_pin');
  }
  need(manifestBytes.length === oracle.manifest.bytes && sha(manifestBytes) === oracle.manifest.sha256, 'oracle_manifest_hash');
  const receiptBytes = readSource(RECEIPT, 4 * MIB), receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(receiptBytes));
  need(receiptBytes.length === oracle.receipt.bytes && sha(receiptBytes) === oracle.receipt.sha256, 'oracle_passing_receipt_hash');
  need(receipt.schemaVersion === 'mcpcn.playground-checks.v1' && receipt.status === 'passed' && receipt.sourceCommit === oracle.checkedSourceCommit && receipt.workflowCommit === oracle.checkedWorkflowCommit
    && Array.isArray(receipt.errors) && receipt.errors.length === 0 && receipt.unitResults?.passed === true && receipt.unitResults.cases === 76
    && receipt.docsBuild?.passed === true && receipt.playgroundTypecheck?.passed === true && receipt.consumers?.passed === true && receipt.consumers.cases.length === 2
    && receipt.consumers.cases.every(row => row.status === 'passed') && receipt.browser?.passed === true && receipt.browser.cases.length === 12 && receipt.browser.cases.every(row => row.status === 'passed')
    && receipt.generation?.tested === true && receipt.generation.determinism === true && receipt.cleanup?.passed === true && receipt.cleanup.rootRemoved === true
    && receipt.cleanup.ownedProcessesRemaining === 0 && receipt.cleanup.uncertain === false
    && receipt.cleanup.dispositions.stable_unreadable === 0 && receipt.cleanup.dispositions.identity_recheck_failed === 0, 'oracle_requires_complete_passing_ci');
  const processObservations = passingProcessObservations(receipt.cleanup);
  exactKeys(manifest.parsed, ['schemaVersion', 'kind', 'files']);
  const files = manifest.parsed.files;
  need(manifest.parsed.schemaVersion === 1 && manifest.parsed.kind === 'mcpcn.playground.assets.v1' && Array.isArray(files) && files.length >= 2 && files.length <= 64, 'manifest_shape');
  let total = 0;
  for (const file of files) {
    exactKeys(file, ['path', 'bytes', 'sha256']);
    need(typeof file.path === 'string' && file.path.length <= 160 && !file.path.split('/').some(part => !part || part === '.' || part === '..')
      && (['index.html', 'frame.html'].includes(file.path) || /^assets\/[A-Za-z0-9._/-]+\.(?:js|css|svg|png|jpe?g|webp|avif|woff2?|ico)$/.test(file.path))
      && Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= 4 * MIB && /^[a-f0-9]{64}$/.test(file.sha256), 'manifest_asset');
    total += file.bytes; need(total <= 16 * MIB, 'manifest_asset_total');
  }
  const names = files.map(file => file.path);
  need(new Set(names).size === names.length && JSON.stringify(names) === JSON.stringify([...names].sort()) && names.includes('index.html') && names.includes('frame.html'), 'manifest_asset_set');
  const locations = new Set(), allowed = new Set(['source/apps/playground/dist', 'source/packages/cli/dist/playground', 'source/apps/docs/public/playground-simulator', 'consumers/package/node_modules/mcpcn/dist/playground']);
  need(Array.isArray(receipt.playgroundAssetChecks) && receipt.playgroundAssetChecks.length >= 4, 'oracle_asset_checks');
  for (const check of receipt.playgroundAssetChecks) {
    need(check.passed === true && check.currentLocation === null && Array.isArray(check.locations) && check.locations.length > 0, 'oracle_asset_check_failed');
    for (const location of check.locations) {
      need(allowed.has(location.location) && location.manifestBytes === manifestBytes.length && location.manifestSha256 === sha(manifestBytes)
        && location.bytes === total && semantic(Buffer.from(JSON.stringify(location.files))).canonical === semantic(Buffer.from(JSON.stringify(files))).canonical, 'oracle_asset_location_mismatch'); locations.add(location.location);
    }
  }
  need(locations.size === 4, 'oracle_all_staged_locations_required');
  report.oracle = { path: ORACLE, sha256: sha(oracleBytes), checkedSourceCommit: oracle.checkedSourceCommit, checkedWorkflowCommit: oracle.checkedWorkflowCommit,
    runId: String(oracle.runId), jobId: String(oracle.jobId), receipt: oracle.receipt, manifest: oracle.manifest, files: files.length, assetBytes: total,
    fileVectorSha256: sha(Buffer.from(JSON.stringify(files))), passingLocations: locations.size, processObservations, metadataBinding: 'supplied_retained_ci_metadata_not_independently_observed_via_http' };
  return { manifest, files };
}
function validateWrapper(bytes, row) {
  const html = new TextDecoder('utf-8', { fatal: true }).decode(bytes), markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const frames = [...markup.matchAll(/<iframe\b[^>]*>/gi)].map(match => match[0]).filter(tag => /\btitle="MCPCN host simulator"/.test(tag));
  need(markup.includes('<h1>Test the whole interaction.</h1>') && frames.length === 1 && /\bsrc="\/playground-simulator\/index\.html"/.test(frames[0]), 'ssr_playground_iframe_marker');
  row.comparison = 'actual_ssr_title_and_exact_iframe_src';
}
function request(test, row) {
  const deadline = Math.min(Date.now() + 15000, end), pieces = [], hash = createHash('sha256');
  Object.assign(row, { status: 'running', deadlineMs: deadline, httpStatus: null, bytes: 0, sha256: null, complete: false, responseEnded: false,
    responseClosed: false, requestClosed: false, socketClosed: false, tlsAuthorized: false, error: null });
  return new Promise(resolve => {
    let incoming, socket, settled = false, timer; const state = { request: null, socket: null, row }; active.add(state);
    const finish = (forced = false) => {
      const closed = row.requestClosed && row.socketClosed && (!incoming || row.responseClosed); if (closed) active.delete(state);
      if (settled || !forced && !(closed && (row.error || row.responseEnded))) return;
      settled = true; clearTimeout(timer); row.settledAtMs = Date.now(); row.sha256 = hash.digest('hex'); row.complete = row.responseEnded && incoming?.complete === true;
      if (Date.now() >= deadline) row.error ??= 'request_or_total_deadline'; resolve(Buffer.concat(pieces));
    };
    const fail = code => { row.error ??= code; incoming?.destroy(); state.request?.destroy(); socket?.destroy(); finish(); };
    const target = new URL(test.route, ORIGIN);
    need(target.origin === ORIGIN && target.pathname === test.route && !target.search && !target.hash && !target.username && !target.password, 'fixed_request_url_invalid');
    state.request = https.get(target, { agent: false, rejectUnauthorized: true, ca: rootCertificates, minVersion: 'TLSv1.2', servername: target.hostname, maxHeaderSize: 16384,
      headers: { Accept: test.mime.join(', '), 'Accept-Encoding': 'identity', Connection: 'close' } }, response => {
      incoming = response; row.httpStatus = response.statusCode; row.contentType = String(response.headers['content-type'] ?? '').slice(0, 128);
      const declared = response.headers['content-length'], count = response.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'content-length').length;
      response.on('data', chunk => { if (settled) return; row.bytes += chunk.length; combinedBytes += chunk.length; if (test.asset) assetBytes += chunk.length; hash.update(chunk);
        if (row.bytes > test.cap || combinedBytes > 17 * MIB + 32768 || assetBytes > 16 * MIB) fail('response_body_bound'); else pieces.push(chunk); });
      response.on('end', () => { row.responseEnded = true; if (declared !== undefined && (!/^(?:0|[1-9][0-9]*)$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) !== row.bytes)) row.error ??= 'content_length_mismatch'; finish(); });
      response.on('close', () => { row.responseClosed = true; finish(); }); response.on('aborted', () => fail('response_aborted')); response.on('error', () => fail('response_stream_error'));
      if (response.statusCode !== 200 || response.headers.location !== undefined) fail('http_status_or_redirect');
      else if (!test.mime.includes(row.contentType.split(';', 1)[0].trim().toLowerCase())) fail('response_content_type');
      else if (count > 1 || declared !== undefined && (!/^(?:0|[1-9][0-9]*)$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > test.cap)) fail('content_length_invalid');
      else if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') fail('unexpected_content_encoding');
    });
    state.request.on('socket', value => { socket = value; state.socket = value;
      value.once('secureConnect', () => { row.tlsAuthorized = value.authorized === true; if (!row.tlsAuthorized) fail('tls_not_authorized'); });
      value.once('close', () => { row.socketClosed = true; finish(); }); });
    state.request.on('error', error => { if (/^[A-Z0-9_]{1,40}$/.test(error.code ?? '')) row.transportCode = error.code; fail('request_transport_error'); });
    state.request.once('close', () => { row.requestClosed = true; finish(); });
    timer = setTimeout(() => { fail('request_or_total_deadline'); finish(true); }, Math.max(1, deadline - Date.now()));
  });
}
try {
  need(process.argv.length === 6 && process.argv[2] === '--source-commit' && process.argv[4] === '--deployment-id' && /^[a-f0-9]{40}$/.test(sourceCommit ?? '') && /^dpl_[A-Za-z0-9]{10,100}$/.test(deploymentId ?? ''), 'full_source_and_deployment_inputs_required');
  need(process.version === 'v24.22.2' && process.platform === 'linux' && process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true'
    && process.env.GITHUB_REPOSITORY === 'alvarovillalbaa/mcpcn-ui' && process.env.GITHUB_REF === 'refs/heads/main' && process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && process.env.MCPCN_PUBLIC_REPOSITORY === 'true', 'approved_public_main_ci_required');
  need(process.env.SOURCE_COMMIT === sourceCommit && process.env.MCPCN_V1_DEPLOYMENT_ID === deploymentId && process.env.MCPCN_PLAYGROUND_PUBLIC_VERIFIED_SOURCE === sourceCommit && /^[a-f0-9]{40}$/.test(report.workflowCommit ?? ''), 'workflow_source_guard_required');
  const jobStarted = Number(process.env.MCPCN_PLAYGROUND_PUBLIC_JOB_STARTED_MS);
  need(Number.isSafeInteger(jobStarted) && jobStarted <= started && jobStarted + 240000 - 30000 - started >= 65000, 'full_asset_http_job_budget_not_available'); report.jobStartedMs = jobStarted;
  need(['NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_USE_ENV_PROXY', 'SSLKEYLOGFILE'].every(name => !process.env[name]), 'external_tls_or_transport_override');
  root = fs.realpathSync(process.cwd());
  readSource('tooling/check-playground-public-delivery.mjs', 262144); readSource('tooling/check-v1-public-delivery.mjs', 262144); readSource('apps/docs/app/playground/page.tsx', 65536);
  const expected = artifactOracle(), cases = [{ route: '/playground', cap: MIB, mime: types.html, validate: validateWrapper },
    { route: '/playground-simulator/asset-manifest.json', cap: 32768, mime: ['application/json'], validate: (body, row) => { need(semantic(body).canonical === expected.manifest.canonical, 'served_manifest_semantic_mismatch'); row.comparison = 'exact_manifest_semantics'; } },
    ...expected.files.map(file => ({ route: '/playground-simulator/' + file.path, cap: 4 * MIB, mime: types[path.extname(file.path).slice(1)], asset: true,
      validate: (body, row) => { need(body.length === file.bytes && sha(body) === file.sha256, 'served_asset_bytes_mismatch'); row.comparison = 'exact_passing_ci_bytes_and_sha256'; } }))];
  report.expectedRequests = cases.length;
  for (const test of cases) {
    budget(end); const row = { route: test.route, status: 'not_run' }; report.checks.push(row); const body = await request(test, row);
    need(!row.error && row.tlsAuthorized && row.httpStatus === 200 && row.bytes > 0 && row.complete && row.responseClosed && row.requestClosed && row.socketClosed, row.error ?? 'http_terminal_incomplete');
    budget(row.deadlineMs); test.validate(body, row); budget(row.deadlineMs); row.status = 'passed';
  }
} catch (error) { report.errors.push(finite(error)); const row = report.checks.find(item => item.status === 'running'); if (row) { row.status = 'failed'; row.error ??= finite(error); } }
finally {
  for (const state of active) { state.request?.destroy(); state.socket?.destroy(); }
  const closeEnd = Math.min(end, Date.now() + 2000); while (active.size && Date.now() < closeEnd) await new Promise(resolve => setTimeout(resolve, 10));
  report.cleanup = { pendingRequests: [...active].filter(item => !item.row.requestClosed).length, pendingSockets: [...active].filter(item => !item.row.socketClosed).length,
    pendingResponses: [...active].filter(item => item.row.httpStatus !== null && !item.row.responseClosed).length, allClosed: active.size === 0 };
  try { if (root) for (const row of sources.values()) readSource(row.path, row.cap); } catch (error) { report.errors.push(finite(error)); }
  report.sources = [...sources.values()]; report.combinedBodyBytes = combinedBytes; report.assetBodyBytes = assetBytes; report.completedAt = new Date().toISOString();
  if (!report.cleanup.allClosed) report.errors.push('http_closure_unproved');
  report.status = !report.errors.length && Date.now() < end && report.oracle && report.checks.length === report.expectedRequests && report.checks.every(row => row.status === 'passed') && report.cleanup.allClosed ? 'passed' : 'failed';
  let bytes = Buffer.from(JSON.stringify(report) + '\n');
  if (bytes.length > 32768) { bytes = Buffer.from(JSON.stringify({ schemaVersion: report.schemaVersion, sourceCommit, deploymentId, status: 'failed', errors: ['report_bound'] }) + '\n'); report.status = 'failed'; }
  const timer = setTimeout(() => { process.stdout.destroy(); process.exit(1); }, 2000);
  process.stdout.write('MCPCN_PLAYGROUND_PUBLIC_DELIVERY_RESULT=' + bytes, error => { clearTimeout(timer); process.exit(error || report.status !== 'passed' ? 1 : 0); });
}

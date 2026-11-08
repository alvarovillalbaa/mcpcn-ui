// Seven post-acceptance anonymous HTTP observations; no installation or browser.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { rootCertificates } from 'node:tls';
import { createHash } from 'node:crypto';

const ORIGIN = 'https://mcpcn-ui.vercel.app', MIB = 1024 * 1024;
const started = Date.now(), end = started + 90000, sources = new Map(), active = new Set();
const need = (value, code) => { if (!value) throw new Error(code); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const finite = error => /^[a-z0-9_]{1,80}$/.test(error?.message ?? '') ? error.message : 'observation_failed';
const sourceCommit = process.argv[3], deploymentId = process.argv[5];
const CASES = [
  { route: '/', markers: ['Human control for agentic apps.', 'Public package release pending.'] },
  { route: '/components/confirmation-panel', title: 'ConfirmationPanel', markers: ['Confirm document changes', 'Change confirmation terms'] },
  { route: '/components/dynamic-question-flow', title: 'DynamicQuestionFlow', markers: ['Collect the missing answers', 'What do you need?', 'Reset question flow'] },
  { route: '/components/tool-call-card', title: 'ToolCallCard', markers: ['Inspect the invoice lookup', 'Review tool call', 'Tool-call example status'] },
  { route: '/schema/config.json', source: 'registry/config.schema.json' },
  { route: '/r/comparison-matrix.json', source: 'registry/items/comparison-matrix.json' },
  { route: '/r/registry.json', source: 'registry/registry.json' },
];
const report = { schemaVersion: 'mcpcn.v1-public-delivery.v1', sourceCommit, deploymentId, workflowCommit: process.env.GITHUB_SHA,
  origin: ORIGIN, status: 'failed', startedAt: new Date(started).toISOString(), runtime: { node: process.version, platform: process.platform },
  anonymous: { authorization: false, cookies: false, credentials: false, proxy: false, redirectFollowing: false },
  limits: { sequentialRequests: 7, requestSeconds: 15, totalSeconds: 90, htmlBytes: MIB, jsonBytes: 16 * MIB, combinedBytes: 24 * MIB, reportBytes: 32768, stdoutSeconds: 2 },
  checks: CASES.map(test => ({ route: test.route, status: 'not_run' })), sources: [], errors: [],
  cleanup: { pendingRequests: null, pendingSockets: null, allClosed: false },
  proofLimits: ['Seven anonymous canonical-origin TLS GET responses only. No browser, interaction, CSS rendering, all-assets, accessibility, live MCP host, package publication or future availability proof.',
    'sourceCommit identifies the immutable checkout used for JSON comparisons. deploymentId is a supplied provider observation; HTTP does not independently prove deployment-to-source mapping.',
    'Object keys are compared without order; array order and every JSON value are retained. Full response bodies exist only in memory; the report retains sizes, hashes and finite observations.',
    'The current homepage has 68 catalog entries, 11 blocks, five examples and two install modes. Sixteen domain components and forty aliases are checked in registry metadata, not invented homepage copy.',
    'The prior five-route delivery and separate v1 build, browser and installed-consumer packets keep their own sources and acceptance boundaries.'] };
let root, combinedBytes = 0;
const budget = deadline => need(Date.now() < Math.min(deadline, end), 'request_or_total_deadline');
function readSource(name) {
  budget(end); const file = path.join(root, name), before = fs.lstatSync(file);
  need(fs.realpathSync(file) === file && before.isFile() && !before.isSymbolicLink() && before.size <= 16 * MIB, 'source_file_invalid');
  const bytes = fs.readFileSync(file), after = fs.lstatSync(file);
  need(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs && bytes.length === before.size, 'source_changed_during_read');
  const record = { path: name, bytes: bytes.length, sha256: sha(bytes), device: after.dev, inode: after.ino, mtimeMs: after.mtimeMs, ctimeMs: after.ctimeMs };
  if (sources.has(name)) need(JSON.stringify(record) === JSON.stringify(sources.get(name)), 'source_identity_changed'); else sources.set(name, record);
  return bytes;
}
function semantic(bytes) {
  const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); let nodes = 0;
  function ordered(value, depth = 0) {
    need(++nodes <= 1000000 && depth <= 128, 'json_structure_bound');
    if (typeof value === 'number') need(Number.isFinite(value), 'json_nonfinite_number');
    if (Array.isArray(value)) return value.map(item => ordered(item, depth + 1));
    return value !== null && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key], depth + 1)])) : value;
  }
  return { parsed, canonical: JSON.stringify(ordered(parsed)) };
}
function registryCounts(value) {
  need(Array.isArray(value.items) && value.items.length === 79 && new Set(value.items.map(item => item.name)).size === 79, 'registry_item_set');
  const counts = Object.fromEntries(['specialized', 'generic-alias', 'primitive', 'workflow-block'].map(kind => [kind, value.items.filter(item => item.meta?.implementation === kind).length]));
  need(counts.specialized === 16 && counts['generic-alias'] === 40 && counts.primitive === 12 && counts['workflow-block'] === 11, 'registry_implementation_counts');
  return counts;
}
function validate(test, bytes, row) {
  if (test.source) {
    const expectedBytes = readSource(test.source), expected = semantic(expectedBytes), actual = semantic(bytes);
    row.comparison = { source: test.source, sourceBytes: expectedBytes.length, sourceSha256: sha(expectedBytes), sourceSemanticSha256: sha(expected.canonical), responseSemanticSha256: sha(actual.canonical), equal: expected.canonical === actual.canonical };
    need(row.comparison.equal, 'json_semantic_mismatch');
    if (test.route === '/r/registry.json') row.implementationCounts = registryCounts(actual.parsed);
    if (test.route === '/r/comparison-matrix.json') need(actual.parsed.name === 'comparison-matrix' && actual.parsed.meta?.implementation === 'specialized' && actual.parsed.meta.dataSchema, 'comparison_domain_schema_missing');
    return;
  }
  const html = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const text = markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  row.html = { title: test.title ?? 'Home', markers: test.markers.map(marker => ({ marker, present: text.includes(marker) })) };
  need(row.html.markers.every(marker => marker.present), 'html_fixture_marker_missing');
  if (test.title) {
    need(markup.includes(`<h1>${test.title}</h1>`) && text.includes('Domain component') && text.includes('Data props') && text.includes('Events'), 'component_domain_markers_missing');
    need(/<select\b[^>]*\baria-label="Preview theme"/.test(markup) && /data-preview-theme="light"/.test(markup), 'component_theme_marker_missing');
    row.html.domainComponent = true; row.html.initialThemeControl = 'light';
  } else {
    need(markup.includes('<h1>Human control for agentic apps.</h1>'), 'home_title_missing');
    row.html.catalogCounts = [[68, 'catalog entries'], [11, 'workflow blocks'], [5, 'reference examples'], [2, 'install modes']].map(([count, label]) => ({ count, label, present: new RegExp(`<strong>${count}</strong>\\s*<span>${label}</span>`).test(markup) }));
    need(row.html.catalogCounts.every(item => item.present), 'home_catalog_markers_missing');
  }
}
function request(test, row) {
  const deadline = Math.min(Date.now() + 15000, end), pieces = [], hash = createHash('sha256');
  Object.assign(row, { status: 'running', startedAtMs: Date.now(), deadlineMs: deadline, httpStatus: null, bodyBytes: 0, bodySha256: null, bodyComplete: false,
    responseEnded: false, responseClosed: false, requestClosed: false, socketClosed: false, tlsAuthorized: false, error: null });
  return new Promise(resolve => {
    let incoming, socket, settled = false, timer;
    const state = { request: null, socket: null, row }; active.add(state);
    const finish = (forced = false) => {
      const closed = row.requestClosed && row.socketClosed && (!incoming || row.responseClosed);
      if (closed) active.delete(state);
      if (settled || !forced && !(closed && (row.error || row.responseEnded))) return;
      settled = true; clearTimeout(timer); row.closedAtMs = Date.now(); row.bodySha256 = hash.digest('hex'); row.bodyComplete = row.responseEnded && incoming?.complete === true;
      if (Date.now() >= deadline) row.error ??= 'request_or_total_deadline';
      resolve(Buffer.concat(pieces));
    };
    const fail = code => { row.error ??= code; incoming?.destroy(); state.request?.destroy(); socket?.destroy(); finish(); };
    const target = new URL(test.route, ORIGIN);
    need(target.origin === ORIGIN && target.pathname === test.route && !target.search && !target.hash && !target.username && !target.password, 'fixed_request_url_invalid');
    state.request = https.get(target, { agent: false, rejectUnauthorized: true, ca: rootCertificates, minVersion: 'TLSv1.2', servername: target.hostname,
      headers: { Accept: test.source ? 'application/json' : 'text/html', 'Accept-Encoding': 'identity', Connection: 'close' } }, response => {
      incoming = response; row.httpStatus = response.statusCode;
      row.contentType = String(response.headers['content-type'] ?? '').slice(0, 128);
      const lengths = response.rawHeaders.filter((_, index) => index % 2 === 0 && response.rawHeaders[index].toLowerCase() === 'content-length').length;
      const declared = response.headers['content-length'];
      row.contentLength = typeof declared === 'string' && /^(?:0|[1-9][0-9]*)$/.test(declared) && Number.isSafeInteger(Number(declared)) ? Number(declared) : null;
      response.on('data', chunk => {
        if (settled) return;
        row.bodyBytes += chunk.length; combinedBytes += chunk.length; hash.update(chunk);
        if (row.bodyBytes > (test.source ? 16 * MIB : MIB) || combinedBytes > 24 * MIB) fail('response_body_bound'); else pieces.push(chunk);
      });
      response.on('end', () => {
        row.responseEnded = true;
        if (declared !== undefined && (!/^(?:0|[1-9][0-9]*)$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) !== row.bodyBytes)) row.error ??= 'content_length_mismatch';
        finish();
      });
      response.on('close', () => { row.responseClosed = true; finish(); });
      response.on('aborted', () => fail('response_aborted')); response.on('error', () => fail('response_stream_error'));
      if (response.statusCode !== 200 || response.headers.location !== undefined) fail('http_status_or_redirect');
      else if (!(test.source ? /^application\/json(?:;|$)/i : /^text\/html(?:;|$)/i).test(row.contentType)) fail('response_content_type');
      else if (lengths > 1 || declared !== undefined && (!/^(?:0|[1-9][0-9]*)$/.test(declared) || Number(declared) > (test.source ? 16 * MIB : MIB))) fail('content_length_invalid');
      else if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') fail('unexpected_content_encoding');
    });
    state.request.on('socket', value => {
      socket = value; state.socket = value;
      value.once('secureConnect', () => { row.tlsAuthorized = value.authorized === true; row.tlsProtocol = value.getProtocol(); if (!row.tlsAuthorized) fail('tls_not_authorized'); });
      value.once('close', () => { row.socketClosed = true; finish(); });
    });
    state.request.on('error', error => { if (/^[A-Z0-9_]{1,40}$/.test(error.code ?? '')) row.transportCode = error.code; fail('request_transport_error'); });
    state.request.once('close', () => { row.requestClosed = true; finish(); });
    timer = setTimeout(() => { fail('request_or_total_deadline'); finish(true); }, Math.max(1, deadline - Date.now()));
  });
}
try {
  need(process.argv.length === 6 && process.argv[2] === '--source-commit' && process.argv[4] === '--deployment-id'
    && /^[a-f0-9]{40}$/.test(sourceCommit ?? '') && /^dpl_[A-Za-z0-9]{10,100}$/.test(deploymentId ?? ''), 'full_source_and_deployment_inputs_required');
  need(process.version === 'v24.22.2' && process.platform === 'linux' && process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true'
    && process.env.GITHUB_REPOSITORY === 'alvarovillalbaa/mcpcn-ui' && process.env.GITHUB_REF === 'refs/heads/main'
    && process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && process.env.MCPCN_PUBLIC_REPOSITORY === 'true', 'approved_public_main_ci_required');
  need(process.env.SOURCE_COMMIT === sourceCommit && process.env.MCPCN_V1_DEPLOYMENT_ID === deploymentId && process.env.MCPCN_V1_HTTP_VERIFIED_SOURCE === sourceCommit
    && /^[a-f0-9]{40}$/.test(report.workflowCommit ?? ''), 'workflow_source_guard_required');
  const jobStarted = Number(process.env.MCPCN_V1_HTTP_JOB_STARTED_MS);
  need(Number.isSafeInteger(jobStarted) && jobStarted <= started && jobStarted + 180000 - started >= 95000, 'full_http_job_budget_not_available');
  report.jobStartedMs = jobStarted;
  need(['NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_USE_ENV_PROXY', 'SSLKEYLOGFILE'].every(name => !process.env[name]), 'external_tls_or_transport_override');
  root = fs.realpathSync(process.cwd());
  for (const name of ['apps/docs/app/page.tsx', 'apps/docs/app/components/[slug]/page.tsx', 'apps/docs/components/component-preview.tsx',
    'apps/docs/components/v1-review-demos.tsx', 'apps/docs/components/v1-decision-demos.tsx', 'apps/docs/components/v1-execution-demos.tsx',
    ...CASES.filter(test => test.source).map(test => test.source)]) readSource(name);
  registryCounts(semantic(readSource('registry/registry.json')).parsed);
  for (const [index, test] of CASES.entries()) {
    budget(end); const row = report.checks[index], body = await request(test, row);
    need(!row.error && row.tlsAuthorized && row.httpStatus === 200 && row.bodyBytes > 0 && row.bodyComplete && row.responseClosed && row.requestClosed && row.socketClosed, row.error ?? 'http_terminal_incomplete');
    budget(row.deadlineMs); validate(test, body, row); budget(row.deadlineMs); row.status = 'passed';
  }
} catch (error) { report.errors.push(finite(error)); const row = report.checks.find(item => item.status === 'running'); if (row) { row.status = 'failed'; row.error ??= finite(error); } }
finally {
  for (const state of active) { state.request?.destroy(); state.socket?.destroy(); }
  const closeEnd = Math.min(end, Date.now() + 2000);
  while (active.size && Date.now() < closeEnd) await new Promise(resolve => setTimeout(resolve, 10));
  report.cleanup = { pendingRequests: [...active].filter(item => !item.row.requestClosed).length, pendingSockets: [...active].filter(item => !item.row.socketClosed).length,
    pendingResponses: [...active].filter(item => item.row.httpStatus !== null && !item.row.responseClosed).length, allClosed: active.size === 0 };
  try { if (root) for (const name of sources.keys()) readSource(name); } catch (error) { report.errors.push(finite(error)); }
  report.sources = [...sources.values()]; report.combinedBodyBytes = combinedBytes; report.completedAt = new Date().toISOString();
  if (!report.cleanup.allClosed) report.errors.push('http_closure_unproved');
  report.status = report.errors.length === 0 && Date.now() < end && report.checks.every(row => row.status === 'passed') && report.cleanup.allClosed ? 'passed' : 'failed';
  let bytes = Buffer.from(`${JSON.stringify(report)}\n`);
  if (bytes.length > 32768) { bytes = Buffer.from(`${JSON.stringify({ schemaVersion: report.schemaVersion, sourceCommit, deploymentId, status: 'failed', errors: ['report_bound'] })}\n`); report.status = 'failed'; }
  const timer = setTimeout(() => { process.stdout.destroy(); process.exit(1); }, 2000);
  process.stdout.write(`MCPCN_V1_PUBLIC_DELIVERY_RESULT=${bytes}`, error => { clearTimeout(timer); process.exit(error || report.status !== 'passed' ? 1 : 0); });
}

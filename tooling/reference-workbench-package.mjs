// CI-only focused source packaging and a genuinely fresh build/SDK consumer.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const need = (ok, why) => { if (!ok) throw new Error(why); };
const sha = body => createHash('sha256').update(body).digest('hex');
const write = (file, body) => fs.writeFileSync(file, body, { flag: 'wx', mode: 0o600 });
const probe = String.raw`import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const root = process.cwd(), require = createRequire(path.join(root, 'examples/shared/package.json'));
const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
const { InMemoryTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/inMemory.js')).href);
const { WorkflowStore } = await import(pathToFileURL(path.join(root, 'examples/shared/dist/store.js')).href);
const { referenceDefinitions } = await import(pathToFileURL(path.join(root, 'examples/definitions.ts')).href);
const definitions = referenceDefinitions({ readSource: async () => 'Complete authored bundle source. BUNDLE_SOURCE_END' });
const principal = { workspace: 'authored-bundle-workspace', actor: 'authored-bundle-reviewer', grants: definitions.map(value => value.id) };
const dbFile = process.env.MCPCN_RF_BUNDLE_DB, db = new DatabaseSync(dbFile), store = new WorkflowStore(db), cases = [];
for (const definition of definitions) store.seed(principal, definition.id, 'record-one', definition.seed);
try {
  for (const definition of definitions) {
    const row = { workflow: definition.id, status: 'failed', messages: [], clientClosed: false, serverClosed: false }; cases.push(row);
    const server = definition.create({ store, principal, html: '<main>BUNDLE_RESOURCE_END</main>' }), client = new Client({ name: 'fresh-source-bundle-consumer', version: '1.0.0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    for (const [transport, direction] of [[a, 'client-to-server'], [b, 'server-to-client']]) { const send = transport.send.bind(transport); transport.send = async (message, extra) => { assert.ok(row.messages.length < 100); row.messages.push({ direction, value: JSON.parse(JSON.stringify(message)) }); return send(message, extra); }; }
    const prefix = definition.id.replaceAll('-', '_');
    const call = (operation, args) => client.callTool({ name: prefix + '_' + operation, arguments: args }, undefined, { timeout: 2000 });
    const view = result => { assert.notEqual(result.isError, true); return result._meta['mcpcn/reference-workflow']; };
    const apply = async (proposal, revision = 1) => { const prepared = view(await call('prepare', { id: 'record-one', revision, proposal })); assert.ok(prepared.prepared.token); return view(await call('confirm', { token: prepared.prepared.token })); };
    try {
      await server.connect(b); await client.connect(a, { timeout: 2000 }); await client.listTools(); assert.equal(view(await call('read', { id: 'record-one' })).revision, 1);
      assert.equal((await client.readResource({ uri: 'ui://mcpcn-reference/' + definition.id + '.html' })).contents[0].text, '<main>BUNDLE_RESOURCE_END</main>');
      if (definition.id === 'hr-candidate-review') { const result = await apply({ decision: 'approve', note: 'The complete authored evidence was reviewed.' }); assert.equal(result.state.status, 'recommended'); assert.equal(result.audit.length, 1); }
      else if (definition.id === 'document-extraction') { const result = await apply({ action: 'extract', fileName: 'bundle.txt', kind: 'invoice', text: 'Supplier: Authored\nTotal: 0\nCurrency: EUR' }); const saved = await apply({ action: 'save', fields: result.state.fields.map(field => ({ id: field.id, value: field.value })) }, 2); assert.equal(saved.state.status, 'saved'); assert.equal(saved.state.fields[1].value, '0'); assert.equal(saved.audit.length, 2); }
      else if (definition.id === 'ecommerce-checkout-review') { const result = await apply({ action: 'place-order', address: 'Authored bundle street 12', acceptReturns: true }); assert.equal(result.state.order.totalMinor, 4600); assert.equal(result.state.order.charged, false); assert.equal(result.audit.length, 1); }
      else if (definition.id === 'admin-settings-change') { const result = await apply({ action: 'change', settings: { weeklyDigest: true, retentionDays: 45 } }); assert.equal(result.state.settings.retentionDays, 45); const rollback = await apply({ action: 'rollback' }, 2); assert.deepEqual(rollback.state.settings, { weeklyDigest: false, retentionDays: 30 }); assert.equal(rollback.audit.length, 2); }
      else { const result = await apply({ action: 'gather' }); assert.equal(result.state.status, 'gathered'); const saved = await apply({ action: 'decide', conclusion: 'The authored bundle source evidence requires exact terms and authorization.' }, 2); assert.equal(saved.state.status, 'completed'); assert.equal(saved.audit.length, 2); }
      row.status = 'passed';
    } finally { await client.close(); row.clientClosed = true; await server.close(); row.serverClosed = !server.isConnected(); }
  }
} finally { store.close(); }
const reopened = new WorkflowStore(new DatabaseSync(dbFile));
const persisted = definitions.map(definition => { const view = reopened.read(principal, definition.id, 'record-one'); return { workflow: definition.id, revision: view.revision, status: view.state.status, audit: view.audit.length }; }); reopened.close();
assert.deepEqual(persisted.map(row => [row.status, row.audit]), [['recommended', 1], ['saved', 2], ['ordered', 1], ['rolled-back', 2], ['completed', 2]]);
assert.ok(cases.every(row => row.status === 'passed' && row.clientClosed && row.serverClosed));
console.log(JSON.stringify({ passed: true, sourceCommit: process.env.SOURCE_COMMIT, cases, persisted, databaseClosed: store.isClosed && reopened.isClosed, proofLimits: ['Fresh focused source install/build and five real in-memory SDK sessions with authored data. No external host/provider/model/payment or production authentication.'] }));
`;

export async function packageReferenceWorkbench({ root, source, output, sourceCommit, names, run, env }) {
  need(process.env.CI === 'true' && process.platform === 'linux' && fs.lstatSync(root).uid === process.getuid(), 'package_owned_ci_required');
  const directory = path.join(root, 'source-bundle'), destination = path.join(directory, 'package'); fs.mkdirSync(directory, { mode: 0o700 }); fs.mkdirSync(destination, { mode: 0o700 });
  const base = new Set(['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'tsconfig.json', '.npmrc', '.gitignore', 'LICENSE', 'docs/specs/reference-workflows.md', 'apps/playground/package.json']);
  const selected = names.filter(name => base.has(name) || name.startsWith('examples/') && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name) && !name.includes('/dist/')
    || /^packages\/(core|schemas|runtime|react|themes|registry|server|cli)\/(?:package\.json|tsconfig\.json|LICENSE|src\/)/.test(name) && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name));
  need(selected.length > 80 && selected.length <= 512 && !selected.includes('README.md'), 'focused_source_path_count');
  const mapping = [...selected.map(name => ({ source: name, path: name })), { source: 'examples/BUNDLE-README.md', path: 'README.md' }].sort((a, b) => a.path.localeCompare(b.path));
  const rows = []; let total = 0;
  for (const row of mapping) {
    need(!path.isAbsolute(row.path) && !row.path.split('/').some(part => ['..', '.git', 'node_modules', '.env'].includes(part)), 'bundle_path_invalid');
    const from = path.join(source, row.source), stat = fs.lstatSync(from); need(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 1024 * 1024, 'bundle_source_bound');
    const raw = fs.readFileSync(from); total += raw.length; need(total <= 8 * 1024 * 1024, 'bundle_total_bound');
    const to = path.join(destination, row.path); fs.mkdirSync(path.dirname(to), { recursive: true, mode: 0o755 }); fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL); fs.chmodSync(to, stat.mode & 0o111 ? 0o755 : 0o644);
    rows.push({ ...row, bytes: raw.length, sha256: sha(raw), mode: stat.mode & 0o111 ? 0o755 : 0o644 });
  }
  const manifest = { schemaVersion: 'mcpcn.reference-source-bundle.v1', sourceCommit, files: rows, bytes: total, purpose: 'Focused examples:build/examples:dev source; use full repository for complete development/tests/history.' };
  write(path.join(destination, 'SOURCE-MANIFEST.json'), JSON.stringify(manifest, null, 2)); write(path.join(output, 'reference-source-manifest.json'), JSON.stringify(manifest, null, 2));
  const filename = 'mcpcn-reference-workbench-0.1.0.tgz', archive = path.join(output, filename);
  await run('pack-reference-source', 'tar', ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '-czf', archive, '-C', directory, 'package'], source, 60);
  const packed = fs.readFileSync(archive); need(packed.length <= 4 * 1024 * 1024, 'focused_archive_bound');
  const listing = (await run('inspect-reference-source', 'tar', ['-tzf', archive])).toString().trim().split('\n');
  need(listing.length <= 1024 && listing.every(name => name.startsWith('package/') && !name.split('/').some(part => ['..', '.git', 'node_modules', '.env'].includes(part))), 'bundle_tar_paths');
  const consumerRoot = path.join(root, 'fresh-bundle'); fs.mkdirSync(consumerRoot, { mode: 0o700 }); await run('extract-fresh-source', 'tar', ['-xzf', archive, '-C', consumerRoot], source, 60);
  const consumer = path.join(consumerRoot, 'package');
  const vector = () => rows.map(row => { const raw = fs.readFileSync(path.join(consumer, row.path)); need(raw.length === row.bytes && sha(raw) === row.sha256, 'fresh_source_changed'); return { path: row.path, bytes: raw.length, sha256: sha(raw) }; });
  const before = vector(), start = Date.now();
  await run('fresh-bundle-install', 'pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], consumer, 160);
  await run('fresh-bundle-build', 'pnpm', ['examples:build'], consumer, 180);
  const probeFile = path.join(consumerRoot, 'probe.mjs'); write(probeFile, probe); env.MCPCN_RF_BUNDLE_DB = path.join(consumerRoot, 'authored-probe.sqlite');
  const original = await run('fresh-bundle-protocol', 'pnpm', ['exec', 'tsx', probeFile], consumer, 60), observed = JSON.parse(original);
  need(observed.passed && observed.sourceCommit === sourceCommit && observed.cases.length === 5 && observed.databaseClosed, 'fresh_bundle_protocol_failed');
  write(path.join(output, 'reference-bundle-protocol.json'), original); const after = vector(); need(JSON.stringify(before) === JSON.stringify(after) && sha(fs.readFileSync(archive)) === sha(packed), 'bundle_or_fresh_source_changed');
  const record = { schemaVersion: 'mcpcn.reference-bundle-consumer.v1', sourceCommit, passed: true, archive: { filename, bytes: packed.length, sha256: sha(packed) }, sourceFiles: rows.length, sourceBytes: total,
    sourceBefore: before, sourceAfter: after, elapsedInstallBuildProbeMs: Date.now() - start, protocol: { cases: 5, bytes: original.length, sha256: sha(original), file: 'reference-bundle-protocol.json' },
    proofLimits: ['Fresh dependency tree and actual focused source build. Cache/download time on this runner is not a universal two-minute install guarantee. No public npm ownership or external-host acceptance.'] };
  write(path.join(output, 'reference-bundle-consumer.json'), JSON.stringify(record, null, 2)); return record;
}

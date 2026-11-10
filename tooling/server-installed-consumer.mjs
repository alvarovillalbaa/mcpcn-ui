import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const need = (value, code) => { if (!value) throw new Error(code); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pins = { '@modelcontextprotocol/sdk': '1.30.0', '@modelcontextprotocol/ext-apps': '1.7.5', zod: '4.4.3', react: '19.2.8', 'react-dom': '19.2.8', typescript: '5.9.3', '@types/node': '24.13.3', '@types/react': '19.2.18', '@types/react-dom': '19.2.4' };
const types = `import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerComponentTool, createStructuredResult, type ToolConfig, type ToolContext } from '@mcpcn/server';
declare const server: McpServer;
const Input = z.object({ count: z.coerce.number() }).strict();
const Output = z.object({ count: z.number() }).strict();
registerComponentTool(server, { name: 'typed_tool', description: 'Authored type check', component: 'authored-report', inputSchema: Input, outputSchema: Output,
  handler(input, context) { const count: number = input.count; const signal: AbortSignal = context.signal; const typed: ToolContext = context; void signal; void typed;
    // @ts-expect-error Parsed input is a number, never the raw string.
    const incorrect: string = input.count;
    return createStructuredResult('authored-report', { count }); } });
// @ts-expect-error The server contract requires an output data schema.
registerComponentTool(server, { name: 'missing_schema', description: 'Authored', component: 'authored-report', inputSchema: Input, handler: () => createStructuredResult('authored-report', { count: 0 }) });
// @ts-expect-error Unchecked raw JSON schemas are not Zod object inputs.
registerComponentTool(server, { name: 'raw_input', description: 'Authored', component: 'authored-report', inputSchema: { type: 'object' }, outputSchema: Output, handler: () => createStructuredResult('authored-report', { count: 0 }) });
// @ts-expect-error Handler output must match the declared number data schema.
const badHandler: ToolConfig<typeof Input, typeof Output, 'authored-report'>['handler'] = () => createStructuredResult('authored-report', { count: 'wrong' });
void badHandler;
`;

const probe = String.raw`import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as uiServer from '@mcpcn/server';
import { ApprovalCardSchema, ConsentPanelSchema } from '@mcpcn/schemas';
const input = JSON.parse(fs.readFileSync('probe-input.json', 'utf8')), cases = [];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const modules = {};
for (const row of input.guide) modules[row.name] = await import(pathToFileURL(path.resolve('compiled/observed', row.file.replace(/[.]ts$/, '.js'))).href);
const publicResult = { value: undefined };
async function session(id, server, body) {
  const row = { id, status: 'failed', messages: [], clientClosed: false, serverClosed: false }; cases.push(row);
  const client = new Client({ name: 'installed-server-consumer', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  for (const [transport, direction] of [[a, 'client-to-server'], [b, 'server-to-client']]) {
    const send = transport.send.bind(transport); transport.send = async (message, options) => { const encoded = JSON.stringify(message); assert.ok(Buffer.byteLength(encoded) <= 131072 && row.messages.length < 100); row.messages.push({ direction, value: JSON.parse(encoded) }); return send(message, options); };
  }
  try { await server.connect(b); await client.connect(a, { timeout: 2000 }); await body(client); row.status = 'passed'; }
  finally { await client.close(); row.clientClosed = true; await server.close(); row.serverClosed = !server.isConnected(); assert.ok(row.serverClosed); }
}
await session('public-guide', modules.public.createReviewServer('<main>PUBLIC_GUIDE_HTML_END</main>'), async client => {
  const tools = await client.listTools(); assert.equal(tools.tools.length, 1); assert.ok(tools.tools[0].outputSchema.properties.data);
  const result = await client.callTool({ name: 'review_authored_action', arguments: { reviewId: 'example-one' } }, undefined, { timeout: 2000 });
  assert.equal(result.isError, undefined); assert.equal(result.structuredContent.kind, 'mcpcn/approval-card'); assert.equal(result.structuredContent.stateVersion, 0); assert.equal(result.structuredContent.data.requiresExplicitConsent, true);
  assert.deepEqual(await modules.validation.inspectResult(result), result); await assert.rejects(() => modules.validation.inspectResult({ content: [] })); publicResult.value = result;
  assert.equal((await client.readResource({ uri: 'ui://mcpcn/approval-card' })).contents[0].text, '<main>PUBLIC_GUIDE_HTML_END</main>');
});
const privateDTO = { id: 'private-review', revision: 'one', title: 'Authored private review', state: 'ready', boundary: { id: 'boundary', revision: 'one', label: 'Authored boundary', entries: [
  { id: 'private', revision: 'one', label: 'Authored UI value', visibility: 'private-ui', value: { marker: 'PRIVATE_GUIDE_END', zero: 0, disabled: false, absent: null } },
  { id: 'server', revision: 'one', label: 'Server metadata only', visibility: 'server-only' },
] } };
const privateServer = new McpServer({ name: 'private-guide', version: '1.0.0' });
uiServer.registerComponentTool(privateServer, { name: 'private_review', description: 'Authored metadata channel', component: 'privacy-boundary-card', inputSchema: z.object({}).strict(), outputSchema: modules.private.PublicReviewSchema,
  visibility: ['app'], readOnly: true, handler: () => modules.private.createPrivateReviewResult(privateDTO) });
await session('private-guide', privateServer, async client => {
  await client.listTools(); const result = await client.callTool({ name: 'private_review', arguments: {} }, undefined, { timeout: 2000 });
  assert.equal(result.isError, undefined); assert.deepEqual(result.structuredContent.data, { reviewId: 'private-review', revision: 'one', state: 'ready' });
  assert.ok(!JSON.stringify([result.content, result.structuredContent]).includes('PRIVATE_GUIDE_END')); assert.deepEqual(result._meta['example/private-review'], privateDTO);
});
const resourceServer = new McpServer({ name: 'resource-guide', version: '1.0.0' }); modules.resource.registerReviewResource(resourceServer, '<main>RESOURCE_GUIDE_END</main>');
await session('resource-guide', resourceServer, async client => {
  const listed = await client.listResources(), result = await client.readResource({ uri: 'ui://reviews/approval.html' });
  assert.equal(listed.resources.length, 1); assert.equal(result.contents[0].text, '<main>RESOURCE_GUIDE_END</main>'); assert.equal(result.contents[0].mimeType, uiServer.RESOURCE_MIME_TYPE);
  assert.deepEqual(result.contents[0]._meta, listed.resources[0]._meta); assert.deepEqual(result.contents[0]._meta['openai/widgetCSP'], { connect_domains: [], resource_domains: ['https://cdn.example.com'], frame_domains: [] });
  assert.deepEqual(result.contents[0]._meta.ui.csp.baseUriDomains, ['https://cdn.example.com']);
});
for (const row of input.snippets) {
  const module = await import(pathToFileURL(path.resolve('compiled/observed', row.file.replace(/[.]ts$/, '.js'))).href);
  const server = new McpServer({ name: 'copied-snippet', version: '1.0.0' }), schema = row.slug === 'approval-card' ? ApprovalCardSchema : ConsentPanelSchema;
  module.registerPreview(server, '<main>COPIED_SNIPPET_END</main>', schema);
  await session('clipboard-' + row.slug, server, async client => {
    const listed = await client.listTools(), result = await client.callTool({ name: 'review_' + row.slug.replaceAll('-', '_'), arguments: {} }, undefined, { timeout: 2000 });
    assert.equal(result.isError, undefined); assert.equal(result.structuredContent.kind, 'mcpcn/' + row.slug); assert.ok(schema.safeParse(result.structuredContent.data).success); assert.ok(listed.tools[0].outputSchema.properties.data);
    assert.equal((await client.readResource({ uri: 'ui://mcpcn/' + row.slug })).contents[0].text, '<main>COPIED_SNIPPET_END</main>');
  });
}
const lowLevel = new McpServer({ name: 'low-level', version: '1.0.0' });
uiServer.registerAppTool(lowLevel, 'low_level', { inputSchema: z.object({ count: z.number() }), outputSchema: z.object({ count: z.number() }), _meta: { ui: { resourceUri: 'ui://low-level/view' } } }, async value => ({ structuredContent: value, content: [] }));
uiServer.registerAppResource(lowLevel, 'Low-level view', 'ui://low-level/view', {}, async () => ({ contents: [{ uri: 'ui://low-level/view', mimeType: uiServer.RESOURCE_MIME_TYPE, text: '<main>LOW_LEVEL_END</main>' }] }));
await session('low-level-delegates', lowLevel, async client => {
  const listed = await client.listTools(); assert.equal(listed.tools[0]._meta['ui/resourceUri'], 'ui://low-level/view'); assert.equal((await client.listResources()).resources[0].mimeType, uiServer.RESOURCE_MIME_TYPE);
  assert.deepEqual((await client.callTool({ name: 'low_level', arguments: { count: 0 } }, undefined, { timeout: 2000 })).structuredContent, { count: 0 });
});
const declarations = fs.readFileSync('node_modules/@mcpcn/server/dist/index.d.ts'); assert.ok(!declarations.includes(Buffer.from('@modelcontextprotocol/ext-apps')));
assert.equal(cases.length, 6); assert.ok(cases.every(row => row.status === 'passed' && row.clientClosed && row.serverClosed));
console.log(JSON.stringify({ passed: true, cases, codeFiles: input.allCode, serverDeclaration: { bytes: declarations.length, sha256: sha(declarations), avoidsBrowserDeclarationGraph: true }, publicReviewTitle: publicResult.value.structuredContent.data.title,
  proofLimits: ['Actual installed archives and six real in-memory SDK sessions. No public npm install, external host, network listener, provider, database or real authentication.'] }));
`;

export async function checkServerConsumers({ run, root, archives, output, archiveRows, browser }) {
  need(process.env.CI === 'true' && process.platform === 'linux' && fs.realpathSync(root) === root && fs.lstatSync(root).uid === process.getuid(), 'consumer_owner_required');
  need(archiveRows.length === 8 && browser.passed && browser.cases.length === 4, 'consumer_inputs_required');
  const allCode = browser.cases.flatMap(row => [...row.codeFiles, ...row.snippets]);
  need(allCode.length === 12 && new Set(allCode.map(row => row.file)).size === 12, 'observed_code_set');
  const guide = browser.cases.find(row => row.kind === 'guide' && row.viewport.width === 1280).codeFiles;
  const snippets = browser.cases.find(row => row.kind === 'playground' && row.viewport.width === 1280).snippets;
  for (const wide of [...guide, ...snippets]) {
    const narrow = allCode.find(row => row.file !== wide.file && (wide.name ? row.name === wide.name : row.slug === wide.slug));
    need(narrow?.sha256 === wide.sha256, 'narrow_wide_code_parity');
  }
  const beforeArchives = archiveRows.map(row => { const body = fs.readFileSync(path.join(archives, row.filename)); need(body.length === row.bytes && sha(body) === row.sha256, 'archive_input_changed'); return { name: row.filename, bytes: body.length, sha256: sha(body) }; });
  const report = { schemaVersion: 'mcpcn.server-consumers.v1', sourceCommit: process.env.SOURCE_COMMIT, passed: false, cases: [], archiveBefore: beforeArchives, archiveAfter: [], proofLimits: ['Two fresh server consumers only. Browser runtime/React package NodeNext support, external hosts and public npm remain separate.'] };
  const write = (file, body) => fs.writeFileSync(file, body, { flag: 'wx', mode: 0o600 });
  try {
    for (const mode of ['bundler', 'node-next']) {
      const cwd = path.join(root, 'consumers', `server-${mode}`); fs.mkdirSync(cwd, { mode: 0o700 }); fs.mkdirSync(path.join(cwd, 'observed'), { mode: 0o700 });
      const dependencies = { ...Object.fromEntries(archiveRows.map(row => [row.name, 'file:' + path.join(archives, row.filename)])), ...pins };
      write(path.join(cwd, 'package.json'), JSON.stringify({ name: `authored-server-${mode}`, version: '0.0.0', private: true, type: 'module', dependencies }, null, 2));
      for (const row of allCode) {
        need(/^server-[a-z0-9-]+\.ts$/.test(row.file) && row.bytes <= 32768, 'code_path_bound');
        const body = fs.readFileSync(path.join(output, row.file)); need(body.length === row.bytes && sha(body) === row.sha256, 'actual_browser_code_changed'); write(path.join(cwd, 'observed', row.file), body);
      }
      write(path.join(cwd, 'consumer-types.ts'), types);
      const config = { compilerOptions: { target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'], module: mode === 'node-next' ? 'NodeNext' : 'ESNext', moduleResolution: mode === 'node-next' ? 'NodeNext' : 'Bundler', strict: true, skipLibCheck: false, noUncheckedIndexedAccess: true, noEmitOnError: true, outDir: 'compiled', rootDir: '.', types: ['node'] }, include: ['observed/**/*.ts', 'consumer-types.ts'] };
      write(path.join(cwd, 'tsconfig.json'), JSON.stringify(config, null, 2)); write(path.join(cwd, 'probe-input.json'), JSON.stringify({ guide, snippets, allCode })); write(path.join(cwd, 'probe.mjs'), probe);
      const protectedNames = ['package.json', 'consumer-types.ts', 'tsconfig.json', 'probe-input.json', 'probe.mjs', ...allCode.map(row => 'observed/' + row.file)];
      const before = protectedNames.map(file => ({ file, sha256: sha(fs.readFileSync(path.join(cwd, file))) }));
      const row = { id: mode, status: 'failed', compiler: { version: '5.9.3', skipLibCheck: false, moduleResolution: config.compilerOptions.moduleResolution }, observedCodeFiles: 12, sourcesBefore: before }; report.cases.push(row);
      try {
        await run(`consumer-${mode}-install`, 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], cwd, 140);
        const installed = JSON.parse(await run(`consumer-${mode}-tree`, 'npm', ['ls', '--all', '--json'], cwd, 30)); need(installed.dependencies && !installed.problems, 'consumer_dependency_tree');
        for (const [name, version] of Object.entries(pins)) need(installed.dependencies[name]?.version === version, 'consumer_pin_mismatch');
        for (const archive of archiveRows) need(installed.dependencies[archive.name]?.version === archive.version, 'consumer_archive_version');
        const manifest = JSON.parse(fs.readFileSync(path.join(cwd, 'node_modules/@mcpcn/server/package.json'))); need(manifest.peerDependencies['@modelcontextprotocol/sdk'] === '>=1.29.0 <2', 'server_peer_major_bound');
        await run(`consumer-${mode}-types`, process.execPath, [path.join(cwd, 'node_modules/typescript/bin/tsc'), '--project', path.join(cwd, 'tsconfig.json'), '--pretty', 'false'], cwd, 80);
        const original = await run(`consumer-${mode}-protocol`, process.execPath, [path.join(cwd, 'probe.mjs')], cwd, 60), observed = JSON.parse(original); need(observed.passed && observed.cases.length === 6 && observed.codeFiles.length === 12, 'consumer_protocol_profile');
        const filename = `consumer-${mode}-protocol.json`; write(path.join(output, filename), original); row.protocol = { file: filename, bytes: original.length, sha256: sha(original), sessions: 6 };
        const lock = fs.readFileSync(path.join(cwd, 'package-lock.json')); need(lock.length < 1024 * 1024, 'consumer_lock_bound'); const lockName = `consumer-${mode}-package-lock.json`; write(path.join(output, lockName), lock); row.lock = { file: lockName, bytes: lock.length, sha256: sha(lock) };
        row.sourcesAfter = protectedNames.map(file => ({ file, sha256: sha(fs.readFileSync(path.join(cwd, file))) })); need(JSON.stringify(row.sourcesAfter) === JSON.stringify(before), 'consumer_authored_source_changed'); row.status = 'passed';
      } finally {
        if (row.status !== 'passed') for (const file of ['package-lock.json', 'consumer-types.ts', 'tsconfig.json']) { const from = path.join(cwd, file), to = path.join(output, `consumer-${mode}-failed-${file}`); if (fs.existsSync(from) && fs.statSync(from).size <= 1024 * 1024 && !fs.existsSync(to)) write(to, fs.readFileSync(from)); }
      }
    }
    report.archiveAfter = archiveRows.map(row => { const body = fs.readFileSync(path.join(archives, row.filename)); return { name: row.filename, bytes: body.length, sha256: sha(body) }; });
    need(JSON.stringify(report.archiveAfter) === JSON.stringify(report.archiveBefore), 'archive_input_vector_changed'); report.passed = report.cases.length === 2 && report.cases.every(row => row.status === 'passed');
  } finally { write(path.join(output, 'server-consumers.json'), JSON.stringify(report, null, 2)); }
  return report;
}

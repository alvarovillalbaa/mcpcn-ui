// T2: execute only exact browser-captured public-release argv in authored apps.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const need = (value, message) => { if (!value) throw new Error(message); };
const sha = body => createHash('sha256').update(body).digest('hex');
const write = (root, name, value) => {
  const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
};
const inside = (root, file) => { const relative = path.relative(root, file); return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep); };
function inventory(base) {
  const rows = []; let total = 0;
  function walk(folder, prefix = '') {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      need(!entry.isSymbolicLink(), 'archive_symlink'); const file = path.join(folder, entry.name), name = prefix + entry.name;
      if (entry.isDirectory()) walk(file, name + '/');
      else {
        const value = fs.lstatSync(file); need(entry.isFile() && value.size <= 4 * 1024 * 1024 && rows.length < 1024, 'archive_member_bound');
        const body = fs.readFileSync(file); total += body.length; need(total <= 16 * 1024 * 1024, 'archive_raw_bound');
        rows.push({ path: name, bytes: body.length, sha256: sha(body) });
      }
    }
  }
  walk(base); return rows.sort((a, b) => a.path.localeCompare(b.path));
}
export async function publicReleaseConsumers({ root, source, output, archives, sourceCommit, run }) {
  const release = JSON.parse(fs.readFileSync(path.join(source, 'apps/docs/data/archive-release.json')));
  const profiles = JSON.parse(fs.readFileSync(path.join(source, 'tests/fixtures/public-release-profiles.json')));
  need(release.tag === 'v0.1.0-keyboard.1' && release.sourceCommit === 'd91fe403eb6b3ec07ef9791e47a8655f5ed519f3'
    && release.packages.length === 8 && profiles.length === 4, 'exact_release_scope');
  const downloads = [], packageFiles = new Map();
  for (const item of release.packages) {
    need(/^(?:@mcpcn\/)?[a-z]+$/.test(item.name) && /^[a-z0-9.-]+\.tgz$/.test(item.file), 'release_identity');
    const file = path.join(archives, item.file), url = release.assetBase + '/' + item.file;
    const raw = await run('public-download-' + item.name.replace('@', '').replace('/', '-'), 'curl', ['-q', '-L', '-sS',
      '--proto', '=https', '--proto-redir', '=https', '--connect-timeout', '10', '--max-time', '45', '--max-redirs', '3',
      '--max-filesize', '4194304', '--output', file, '--write-out', '{"httpCode":%{http_code},"redirects":%{num_redirects},"tlsVerifyResult":%{ssl_verify_result},"bytes":%{size_download}}', url], root, 60);
    const transfer = JSON.parse(raw.toString()), body = fs.readFileSync(file);
    need(transfer.httpCode === 200 && transfer.tlsVerifyResult === 0 && transfer.redirects >= 0 && transfer.redirects <= 3
      && transfer.bytes === item.bytes && body.length === item.bytes && sha(body) === item.sha256, 'public_archive_integrity');
    fs.copyFileSync(file, path.join(output, item.file), fs.constants.COPYFILE_EXCL);
    const listed = (await run('public-list-' + item.name.replace('@', '').replace('/', '-'), 'tar', ['-tvzf', file], root, 30)).toString().trim().split('\n');
    let total = 0;
    for (const line of listed) {
      const columns = line.trim().split(/\s+/), name = columns.at(-1), bytes = Number(columns[2]);
      need(['-', 'd'].includes(line[0]) && /^package\/[A-Za-z0-9_.@/-]+\/?$/.test(name)
        && !name.split('/').includes('..') && Number.isSafeInteger(bytes) && bytes >= 0 && bytes <= 4 * 1024 * 1024, 'safe_archive_listing');
      total += bytes; need(total <= 16 * 1024 * 1024 && listed.length <= 1024, 'safe_archive_listing_bound');
    }
    const extracted = path.join(archives, 'extracted-' + item.name.replace('@', '').replace('/', '-')); fs.mkdirSync(extracted, { mode: 0o700 });
    await run('public-extract-' + item.name.replace('@', '').replace('/', '-'), 'tar', ['-xzf', file, '-C', extracted], root, 30);
    const base = path.join(extracted, 'package'), rows = inventory(base);
    const manifest = JSON.parse(fs.readFileSync(path.join(base, 'package.json')));
    need(manifest.name === item.name && manifest.version === '0.1.0', 'downloaded_package_manifest');
    packageFiles.set(item.name, rows);
    downloads.push({ ...item, canonicalUrl: url, transfer, files: rows, rawCarrierRedirectHeadersCollected: false });
  }
  write(output, 'public-release-downloads.json', { sourceCommit, release: release.tag, downloads });
  const versions = {}, owners = { react: 'apps/playground', 'react-dom': 'apps/playground', typescript: '.',
    '@types/node': '.', '@types/react': '.', '@types/react-dom': '.', vite: 'apps/playground', '@vitejs/plugin-react': 'apps/playground' };
  for (const [name, owner] of Object.entries(owners)) {
    const metadata = JSON.parse(fs.readFileSync(path.join(source, owner, 'node_modules', name, 'package.json')));
    need(metadata.name === name && typeof metadata.version === 'string', 'declared_tooling_owner'); versions[name] = metadata.version;
  }
  need(versions.react === '19.2.8' && versions.typescript === '5.9.3' && versions.vite === '8.2.1', 'existing_tooling_versions');
  const consumers = [];
  for (const profile of profiles) {
    const captured = JSON.parse(fs.readFileSync(path.join(output, 'public-install-' + profile.id + '-commands.json')));
    need(captured.sourceCommit === sourceCommit && JSON.stringify(captured.profile) === JSON.stringify(profile), 'browser_consumer_binding');
    const config = captured.config;
    need(config.packageManager === profile.manager && config.registry === release.registry && config.componentsDir === profile.componentsDir
      && config.mode === profile.mode && config.style === profile.style && config.host === profile.host, 'captured_configuration');
    const cwd = path.join(root, 'consumers', profile.id); fs.mkdirSync(cwd, { mode: 0o700 });
    const initial = { name: 'mcpcn-public-' + profile.id, private: true, type: 'module', authorNote: 'Keep this authored package field.',
      scripts: { dev: 'vite', build: 'vite build' }, dependencies: { react: versions.react, 'react-dom': versions['react-dom'] },
      devDependencies: Object.fromEntries(Object.entries(versions).filter(([name]) => !['react', 'react-dom'].includes(name))),
      ...(profile.manager === 'pnpm' ? { packageManager: 'pnpm@10.24.0', pnpm: { overrides: { 'authored-unused-package': '0.0.0' } } } : {}) };
    write(cwd, 'package.json', initial);
    write(cwd, 'tsconfig.json', { compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, skipLibCheck: false, types: ['vite/client'] } });
    write(cwd, 'owner-note.txt', 'Retain this authored application note.\n');
    write(cwd, 'vite-env.d.ts', '/// <reference types="vite/client" />\n');
    const component = profile.componentsDir;
    write(cwd, 'main.tsx', `import { createRoot } from 'react-dom/client';\nimport { Tabs } from './${component}/tabs';\nimport { ApprovalCard } from './${component}/approval-card';\nimport { ReviewBeforeActionApp } from './${component}/blocks/review-before-action';\nimport { MCPCNProvider } from './${component}/provider';\nvoid ApprovalCard; void ReviewBeforeActionApp; void MCPCNProvider;\ncreateRoot(document.getElementById('root')!).render(<Tabs label="Installed public release" items={[{value:'first',label:'First',content:'Installed from checked public archives.'}]} />);\nexport { ApprovalCard, ReviewBeforeActionApp, MCPCNProvider };\n`);
    write(cwd, 'index.html', '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Public release consumer</title></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>\n');
    const preserved = Object.fromEntries(['tsconfig.json', 'owner-note.txt', 'vite-env.d.ts', 'main.tsx', 'index.html'].map(name => [name, sha(fs.readFileSync(path.join(cwd, name)))]));
    const bootstrap = captured.commands.bootstrap.replace(/\\\r?\n[ \t]*/g, ' ').trim().split('\n').map(line => line.trim().split(/\s+/));
    need(bootstrap.length === (profile.manager === 'pnpm' ? 2 : 1), 'bootstrap_command_count');
    if (profile.manager === 'pnpm') {
      const pins = [...release.sourceDependencies, release.blockTypes].map(value => {
        const at = value.lastIndexOf('@'); return `pnpm.overrides.${value.slice(0, at)}=${value.slice(at + 1)}`;
      });
      const expected = ['npm', 'pkg', 'set', ...release.packages.map(item => `pnpm.overrides.${item.name}=${release.assetBase}/${item.file}`), ...pins];
      need(JSON.stringify(bootstrap[0]) === JSON.stringify(expected), 'exact_project_override_argv');
      await run('public-' + profile.id + '-pin-project', 'npm', bootstrap[0].slice(1), cwd, 30);
    }
    const installation = bootstrap.at(-1), dependencies = [...release.packages.map(item => release.assetBase + '/' + item.file), ...release.sourceDependencies, release.blockTypes];
    const expected = [profile.manager, profile.manager === 'npm' ? 'install' : 'add', '--ignore-scripts', '--save-exact',
      ...(profile.manager === 'npm' ? ['--no-audit', '--no-fund'] : []), ...dependencies];
    need(JSON.stringify(installation) === JSON.stringify(expected), 'exact_public_install_argv');
    await run('public-' + profile.id + '-install-urls', profile.manager, installation.slice(1), cwd, 180);
    const installed = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json')));
    need(installed.authorNote === initial.authorNote && JSON.stringify(installed.scripts) === JSON.stringify(initial.scripts)
      && Object.entries(initial.devDependencies).filter(([name]) => name !== '@types/node')
        .every(([name, version]) => installed.devDependencies[name] === version), 'authored_manifest_fields_changed');
    need((installed.dependencies['@types/node'] ?? installed.devDependencies['@types/node']) === versions['@types/node'], 'explicit_node_types_version');
    for (const name of ['zod', '@modelcontextprotocol/ext-apps', '@modelcontextprotocol/sdk']) {
      const expectedVersion = release.sourceDependencies.find(value => value.startsWith(name + '@')).slice(name.length + 1);
      need(installed.dependencies[name] === expectedVersion
        && JSON.parse(fs.readFileSync(path.join(cwd, 'node_modules', name, 'package.json'))).version === expectedVersion, 'exact_public_dependency_version');
    }
    if (profile.manager === 'pnpm') {
      need(installed.pnpm.overrides['authored-unused-package'] === '0.0.0' && installed.packageManager === initial.packageManager, 'unrelated_override_or_manager_changed');
      for (const item of release.packages) need(installed.pnpm.overrides[item.name] === release.assetBase + '/' + item.file, 'project_release_override');
      for (const pin of [...release.sourceDependencies, release.blockTypes]) {
        const at = pin.lastIndexOf('@'); need(installed.pnpm.overrides[pin.slice(0, at)] === pin.slice(at + 1), 'project_public_dependency_override');
      }
    }
    let verifiedMembers = 0;
    for (const item of release.packages) {
      need(installed.dependencies[item.name] === release.assetBase + '/' + item.file, 'direct_public_url_dependency');
      const base = fs.realpathSync(path.join(cwd, 'node_modules', item.name)); need(inside(root, base), 'installed_package_outside_owned_root');
      for (const file of packageFiles.get(item.name)) {
        const target = path.join(base, file.path), body = fs.readFileSync(target);
        need(body.length === file.bytes && sha(body) === file.sha256, 'installed_archive_member_changed'); verifiedMembers++;
      }
    }
    const dependencyRoot = (from, name) => {
      const lookup = createRequire(from).resolve.paths(name) ?? [];
      for (const folder of lookup) {
        const candidate = path.join(folder, name);
        if (inside(root, candidate) && fs.existsSync(path.join(candidate, 'package.json'))) return fs.realpathSync(candidate);
      }
      throw new Error('owned_dependency_missing');
    };
    for (const [owner, dependency] of [['@mcpcn/react', 'react'], ['@mcpcn/server', '@modelcontextprotocol/sdk'],
      ['@mcpcn/runtime', '@modelcontextprotocol/ext-apps'], ['@mcpcn/schemas', 'zod']]) {
      const ownerBase = fs.realpathSync(path.join(cwd, 'node_modules', owner));
      need(dependencyRoot(path.join(cwd, 'package.json'), dependency)
        === dependencyRoot(path.join(ownerBase, 'package.json'), dependency), 'shared_runtime_dependency_graph');
    }
    for (const [operation, key] of [['initialize', 'init'], ['add', 'add']]) {
      const tokens = captured.commands[operation].trim().split(/\s+/);
      need(tokens[0] === 'node' && tokens[1] === 'node_modules/mcpcn/dist/index.js' && tokens[2] === key
        && tokens.every(token => /^[A-Za-z0-9_./:@=-]+$/.test(token)), 'validated_cli_argv');
      if (key === 'add') need(JSON.stringify(tokens.slice(3)) === JSON.stringify(profile.selected), 'exact_selected_argv');
      await run('public-' + profile.id + '-cli-' + key, process.execPath, [path.join(cwd, tokens[1]), ...tokens.slice(2)], cwd, 90);
    }
    need(JSON.stringify(JSON.parse(fs.readFileSync(path.join(cwd, 'mcpcn.json')))) === JSON.stringify(config), 'exact_config_roundtrip');
    const lockName = profile.manager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml'; need(fs.existsSync(path.join(cwd, lockName)), 'real_manager_lockfile');
    for (const name of ['package.json', 'mcpcn.json', 'mcpcn.lock.json', lockName]) {
      const body = fs.readFileSync(path.join(cwd, name)); need(body.length <= 2 * 1024 * 1024, 'consumer_metadata_bound');
      fs.writeFileSync(path.join(output, 'public-' + profile.id + '-' + name), body, { flag: 'wx' });
    }
    const lock = JSON.parse(fs.readFileSync(path.join(cwd, 'mcpcn.lock.json'))), expectedNames = ['approval-card', 'audit-trail', 'badge', 'button', 'card', 'diff-viewer', 'review-before-action', 'tabs'];
    need(JSON.stringify(Object.keys(lock.items).sort()) === JSON.stringify(expectedNames.sort()), 'actual_dependency_selection');
    const expectedUnion = profile.mode === 'copy' ? 60 : 13;
    need(Object.keys(lock.files).length === expectedUnion, 'installed_union_profile');
    for (const [name, row] of Object.entries(lock.items)) need(row.files.length === (profile.mode === 'copy' ? name === 'review-before-action' ? 53 : 40 : name === 'review-before-action' ? 6 : 2), 'installed_item_profile');
    const provenance = Object.entries(lock.files).sort().map(([name, entry]) => { const body = fs.readFileSync(path.join(cwd, name));
      need(sha(body) === entry.hash, 'actual_cli_file_provenance'); return { path: name, bytes: body.length, sha256: sha(body) }; });
    const sources = provenance.map(row => row.path).filter(name => /\.(?:ts|tsx|mts)$/.test(name));
    need(sources.length === (profile.mode === 'copy' ? 57 : 12), 'strict_actual_source_count');
    const tsc = path.join(cwd, 'node_modules/typescript/bin/tsc');
    await run('public-' + profile.id + '-strict', process.execPath, [tsc, '--strict', '--noUncheckedIndexedAccess', '--noUncheckedSideEffectImports',
      '--skipLibCheck', 'false', '--target', 'ES2022', '--lib', 'ES2022,DOM,DOM.Iterable', '--jsx', 'react-jsx', '--esModuleInterop',
      '--types', 'node,react,vite/client', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--rootDir', '.', '--outDir', 'compiled', 'main.tsx', 'vite-env.d.ts', ...sources], cwd, 120);
    const test = path.join(cwd, 'compiled', profile.componentsDir, 'blocks/review-before-action.server.test.mjs'); need(fs.existsSync(test), 'actual_emitted_fixture');
    const tap = (await run('public-' + profile.id + '-installed-sdk', process.execPath, ['--test', '--test-reporter=tap', test], cwd, 90)).toString();
    need(/^# tests 1$/m.test(tap) && /^# pass 1$/m.test(tap) && /^# fail 0$/m.test(tap), 'one_actual_installed_sdk_case');
    write(cwd, 'vite.config.mts', 'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nexport default defineConfig({plugins:[react()],build:{outDir:"client-output",emptyOutDir:true}});\n');
    await run('public-' + profile.id + '-client-build', process.execPath, [path.join(cwd, 'node_modules/vite/bin/vite.js'), 'build'], cwd, 120);
    for (const [name, digest] of Object.entries(preserved)) need(sha(fs.readFileSync(path.join(cwd, name))) === digest, 'authored_app_file_changed');
    for (const file of provenance) need(sha(fs.readFileSync(path.join(cwd, file.path))) === file.sha256, 'installed_source_changed');
    consumers.push({ id: profile.id, manager: profile.manager, mode: profile.mode, config, installedPaths: expectedUnion,
      strictTsFiles: sources.length, skipLibCheck: false, installedSdkCases: 1, actualViteBuild: true, verifiedArchiveMembers: verifiedMembers,
      preservedAuthoredApp: true, preservedUnrelatedMetadata: true, provenance });
  }
  const report = { sourceCommit, passed: true, release: release.tag, versions, actualDownloadedArchives: downloads.length, consumers };
  write(output, 'public-release-consumers.json', report); return report;
}

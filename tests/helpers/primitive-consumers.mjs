// Fresh declared-dependency consumers; called only by the owned CI controller.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const need = (value, message) => { if (!value) throw new Error(message); };
const sha = body => createHash('sha256').update(body).digest('hex');
const write = (root, name, value) => {
  const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
};
export async function primitiveConsumers({ root, source, output, archives, sourceCommit, run }) {
  const versions = {}, owners = { react: 'apps/playground', 'react-dom': 'apps/playground', zod: 'packages/schemas',
    typescript: '.', '@types/node': '.', '@types/react': '.', '@types/react-dom': '.', vite: 'apps/playground', '@vitejs/plugin-react': 'apps/playground' };
  for (const [name, owner] of Object.entries(owners)) {
    const data = JSON.parse(fs.readFileSync(path.join(source, owner, 'node_modules', name, 'package.json')));
    need(data.name === name && typeof data.version === 'string', 'declared_dependency_identity'); versions[name] = data.version;
  }
  need(versions.react === '19.2.8' && versions.zod === '4.4.3' && versions.typescript === '5.9.3' && versions.vite === '8.2.1', 'existing_locked_versions');
  const identities = {}, artifacts = [];
  for (const owner of ['core', 'schemas', 'runtime', 'react', 'themes', 'registry', 'cli', 'server']) {
    const data = JSON.parse(fs.readFileSync(path.join(source, 'packages', owner, 'package.json')));
    need(data.name === (owner === 'cli' ? 'mcpcn' : '@mcpcn/' + owner) && data.version === '0.1.0', 'package_identity');
    const name = data.name.replace(/^@/, '').replace('/', '-') + '-' + data.version + '.tgz';
    await run('primitive-pack-' + owner, 'pnpm', ['pack', '--pack-destination', archives], path.join(source, 'packages', owner), 90);
    const body = fs.readFileSync(path.join(archives, name)); need(body.length <= 4 * 1024 * 1024, 'package_archive_bound');
    fs.copyFileSync(path.join(archives, name), path.join(output, name), fs.constants.COPYFILE_EXCL);
    artifacts.push({ name, bytes: body.length, sha256: sha(body) }); identities[data.name] = 'file:' + path.join(archives, name);
  }
  const consumers = [];
  for (const mode of ['package', 'copy']) {
    const cwd = path.join(root, 'consumers', mode); fs.mkdirSync(cwd, { mode: 0o700 });
    write(cwd, 'package.json', { name: 'mcpcn-keyboard-' + mode, private: true, type: 'module',
      dependencies: { ...versions, '@modelcontextprotocol/sdk': '1.30.0', '@modelcontextprotocol/ext-apps': '1.7.5', ...identities } });
    write(cwd, 'tsconfig.json', { compilerOptions: { jsx: 'react-jsx' } });
    write(cwd, 'owner-note.txt', 'Keep this authored consumer note.\n');
    await run('primitive-' + mode + '-install', 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], cwd, 180);
    const cli = path.join(cwd, 'node_modules/mcpcn/dist/index.js');
    await run('primitive-' + mode + '-cli-init', process.execPath, [cli, 'init', '--mode=' + mode, '--host=standard-mcp', '--registry=file://' + path.join(source, 'registry/items')], cwd, 45);
    await run('primitive-' + mode + '-cli-add', process.execPath, [cli, 'add', 'tabs', 'dialog'], cwd, 45);
    const lock = JSON.parse(fs.readFileSync(path.join(cwd, 'mcpcn.lock.json')));
    need(Object.keys(lock.files).length === (mode === 'copy' ? 41 : 3), 'installed_union');
    need(Object.values(lock.items).length === 2 && Object.values(lock.items).every(item => item.files.length === (mode === 'copy' ? 40 : 2)), 'installed_item_profiles');
    const provenance = Object.entries(lock.files).sort().map(([name, entry]) => {
      const body = fs.readFileSync(path.join(cwd, name)); need(sha(body) === entry.hash, 'cli_provenance');
      return { path: name, bytes: body.length, sha256: sha(body) };
    });
    const rawFixture = fs.readFileSync(path.join(source, 'tests/fixtures/primitive-keyboard-ui.tsx'), 'utf8');
    const originalImport = 'import { Button, Dialog, Input, Tabs } from "@mcpcn/react";';
    need(rawFixture.split(originalImport).length === 2, 'fixture_import_identity');
    const replacement = 'import { Tabs } from "./components/mcpcn/tabs";\nimport { Dialog } from "./components/mcpcn/dialog";\n'
      + (mode === 'copy' ? 'import { Button, Input } from "./components/mcpcn/_mcpcn/primitives";' : 'import { Button, Input } from "@mcpcn/react";');
    write(cwd, 'app.tsx', rawFixture.replace(originalImport, replacement));
    write(cwd, 'candidate.css', mode === 'copy' ? '@import "./components/mcpcn/styles.css";\n' : '@import "@mcpcn/react/styles.css";\n');
    write(cwd, 'theme.css', fs.readFileSync(path.join(source, 'packages/themes/src/default.css'), 'utf8'));
    write(cwd, 'styles.d.ts', 'declare module "*.css";\n');
    const header = '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Installed primitive checks</title></head>';
    write(cwd, 'index.html', header + '<body style="margin:0"><h1 style="font:16px system-ui">Authored iframe host</h1><iframe title="Installed primitives" src="/frame.html" style="display:block;width:100%;height:900px;border:0"></iframe></body></html>\n');
    write(cwd, 'frame.html', header + '<body style="margin:0;background:var(--mcpcn-bg)"><script>document.documentElement.dataset.theme=matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light";</script><div id="root"></div><script type="module" src="/app.tsx"></script></body></html>\n');
    write(cwd, 'public/source-binding.json', { sourceCommit, mode, fixtureSha256: sha(Buffer.from(rawFixture)), installed: provenance });
    write(cwd, 'strict.json', { compilerOptions: { target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, noEmit: true,
      skipLibCheck: false, noUncheckedIndexedAccess: true, noUncheckedSideEffectImports: true, esModuleInterop: true, types: ['react', 'node'] },
      include: ['app.tsx', 'styles.d.ts', 'components/**/*.ts', 'components/**/*.tsx'] });
    await run('primitive-' + mode + '-strict', process.execPath, [path.join(cwd, 'node_modules/typescript/bin/tsc'), '-p', 'strict.json', '--pretty', 'false'], cwd, 120);
    write(cwd, 'vite.config.mts', 'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nimport { resolve } from "node:path";\nexport default defineConfig({plugins:[react()],build:{outDir:"client-output",emptyOutDir:true,rollupOptions:{input:{host:resolve("index.html"),frame:resolve("frame.html")}}}});\n');
    await run('primitive-' + mode + '-client-build', process.execPath, [path.join(cwd, 'node_modules/vite/bin/vite.js'), 'build'], cwd, 120);
    need(fs.readFileSync(path.join(cwd, 'owner-note.txt'), 'utf8') === 'Keep this authored consumer note.\n', 'owner_note_changed');
    for (const row of provenance) need(sha(fs.readFileSync(path.join(cwd, row.path))) === row.sha256, 'installed_source_changed');
    consumers.push({ mode, cwd, paths: provenance.length, filesPerItem: mode === 'copy' ? 40 : 2,
      strictBundler: true, skipLibCheck: false, actualViteBuild: true, provenance });
  }
  const report = { sourceCommit, passed: true, versions, artifacts, consumers: consumers.map(({ cwd, ...row }) => row) };
  write(output, 'primitive-consumers.json', report);
  return { report, consumers };
}

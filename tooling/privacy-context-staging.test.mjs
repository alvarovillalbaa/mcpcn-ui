import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);
const SCRIPT = new URL('./stage-docs-registry.mjs', import.meta.url);
const INDEX = 'registry.json', MANIFEST = 'registry-static-manifest.json';
const KIND = 'mcpcn.docs.registry-static.v1', MAX_INDEX = 40 * 1024 * 1024;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const encoded = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const small = () => encoded({ name: 'authored-registry', items: [{ name: 'authored-item', content: 'Authored original source.' }] });
const identity = value => [value.dev, value.ino, value.uid, value.mode, value.size, value.mtimeNs, value.ctimeNs];

async function fixture(body, run) {
  const owner = process.env.TMPDIR;
  assert.ok(owner && path.isAbsolute(owner), 'TMPDIR must be the CI task-owned scratch directory');
  const parent = await fs.lstat(owner);
  assert.ok(parent.isDirectory() && !parent.isSymbolicLink() && parent.uid === process.getuid());
  assert.equal(await fs.realpath(owner), owner);
  const root = await fs.mkdtemp(path.join(owner, 'mcpcn-registry-stage-test-'));
  await fs.chmod(root, 0o700);
  const rootStat = await fs.lstat(root);
  try {
    const source = path.join(root, 'registry', INDEX), publicRoot = path.join(root, 'apps/docs/public');
    await fs.mkdir(path.join(root, 'tooling'));
    await fs.mkdir(path.dirname(source));
    await fs.mkdir(publicRoot, { recursive: true });
    await fs.writeFile(path.join(root, 'tooling/stage-docs-registry.mjs'), await fs.readFile(SCRIPT), { flag: 'wx' });
    await fs.writeFile(source, body, { flag: 'wx' });
    const unrelated = path.join(publicRoot, 'unrelated-public.txt'), unrelatedBytes = Buffer.from('Authored unrelated public bytes.\n');
    await fs.writeFile(unrelated, unrelatedBytes, { flag: 'wx' });
    const before = identity(await fs.lstat(unrelated, { bigint: true }));
    await run({ root, source, publicRoot, destination: path.join(publicRoot, 'r'), unrelated });
    assert.deepEqual(await fs.readFile(unrelated), unrelatedBytes);
    assert.deepEqual(identity(await fs.lstat(unrelated, { bigint: true })), before);
  } finally {
    const current = await fs.lstat(root);
    assert.ok(current.isDirectory() && !current.isSymbolicLink() && current.dev === rootStat.dev && current.ino === rootStat.ino);
    // The fixture owns this exclusive root and every authored child, including its symlinks.
    await fs.rm(root, { recursive: true, force: false });
  }
}

async function invoke(value) {
  try {
    const result = await execute(process.execPath, [path.join(value.root, 'tooling/stage-docs-registry.mjs')], {
      cwd: value.root, timeout: 15000, maxBuffer: 65536, env: { ...process.env, TMPDIR: process.env.TMPDIR },
    });
    assert.equal(result.stderr, '');
    assert.equal(result.stdout.split('\n').length, 2);
    return { passed: true, result: JSON.parse(result.stdout) };
  } catch (error) {
    if (error.stdout === undefined) throw error;
    assert.equal(error.code, 1);
    assert.equal(error.signal, null);
    assert.equal(error.stdout, '');
    assert.match(error.stderr, /^mcpcn: docs_registry_[a-z_]+\n$/);
    return { passed: false, stderr: error.stderr };
  }
}

async function snapshot(folder) {
  const rows = [];
  async function walk(current, prefix = '') {
    const names = (await fs.readdir(current)).sort();
    assert.ok(names.length <= 16 && rows.length <= 32);
    for (const name of names) {
      const file = path.join(current, name), stat = await fs.lstat(file, { bigint: true });
      const row = { path: prefix + name, identity: identity(stat) };
      if (stat.isSymbolicLink()) row.link = await fs.readlink(file);
      else if (stat.isFile()) row.sha256 = sha(await fs.readFile(file));
      else assert.ok(stat.isDirectory());
      rows.push(row);
      if (stat.isDirectory()) await walk(file, prefix + name + '/');
    }
  }
  await walk(folder);
  return rows;
}

async function artifact(value, body) {
  const names = (await fs.readdir(value.destination)).sort();
  assert.deepEqual(names, [INDEX, MANIFEST].sort());
  const bytes = await fs.readFile(path.join(value.destination, INDEX));
  const marker = await fs.readFile(path.join(value.destination, MANIFEST));
  assert.deepEqual(bytes, body);
  assert.deepEqual(JSON.parse(marker), { schemaVersion: 1, kind: KIND, files: [{ path: INDEX, bytes: body.length, sha256: sha(body) }] });
  assert.ok(marker.length <= 32768);
  return { bytes, marker };
}

function success(value, status, body, marker) {
  assert.equal(value.passed, true);
  assert.deepEqual(value.result, { schemaVersion: 1, kind: 'mcpcn.docs.registry-static.stage.v1', status,
    source: { path: 'registry/registry.json', bytes: body.length, sha256: sha(body) }, destination: 'apps/docs/public/r',
    files: [{ path: INDEX, bytes: body.length, sha256: sha(body) }, { path: MANIFEST, bytes: marker.length, sha256: sha(marker) }] });
}


test('PC-ST01_exact40MiB_stages_all_bytes', async () => {
  const seed = small(), body = Buffer.concat([seed, Buffer.alloc(MAX_INDEX - seed.length, 0x20)]);
  assert.equal(body.length, 40 * 1024 * 1024);
  await fixture(body, async value => {
    const result = await invoke(value), staged = await artifact(value, body);
    success(result, 'staged', body, staged.marker);
    assert.deepEqual(await fs.readFile(value.source), body);
  });
});

test('PC-ST02_40MiB_plus_one_refuses_without_mutation', async () => {
  await fixture(Buffer.alloc(MAX_INDEX + 1, 0x20), async value => {
    const before = await snapshot(value.root);
    assert.equal((await invoke(value)).passed, false);
    assert.deepEqual(await snapshot(value.root), before);
    assert.deepEqual((await fs.readdir(value.publicRoot)).sort(), ['unrelated-public.txt']);
  });
});

test('PC-ST03_above_old32MiB_preserves_identities_and_refuses_foreign_member', async () => {
  const seed = small(), body = Buffer.concat([seed, Buffer.alloc(33 * 1024 * 1024 - seed.length, 0x20)]);
  await fixture(body, async value => {
    const staged = await invoke(value), original = await artifact(value, body);
    success(staged, 'staged', body, original.marker);
    const before = await snapshot(value.publicRoot);
    success(await invoke(value), 'unchanged', body, original.marker);
    assert.deepEqual(await snapshot(value.publicRoot), before);
    await fs.writeFile(path.join(value.destination, 'foreign.txt'), 'Authored existing foreign bytes.', { flag: 'wx' });
    const foreign = await snapshot(value.publicRoot);
    assert.equal((await invoke(value)).passed, false);
    assert.deepEqual(await snapshot(value.publicRoot), foreign);
  });
});

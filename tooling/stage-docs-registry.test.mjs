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

test('ST01_exact_large_first_staging', async () => {
  const body = Buffer.from(JSON.stringify({ authored: 'x'.repeat(21 * 1024 * 1024), items: [] }) + '\n');
  assert.ok(body.length > 20 * 1024 * 1024 && body.length <= MAX_INDEX);
  await fixture(body, async value => {
    const result = await invoke(value), staged = await artifact(value, body);
    success(result, 'staged', body, staged.marker);
    assert.deepEqual(await fs.readFile(value.source), body);
    assert.deepEqual((await fs.readdir(value.publicRoot)).sort(), ['r', 'unrelated-public.txt']);
  });
});

test('ST02_idempotent_staging_preserves_identities', async () => {
  const body = small();
  await fixture(body, async value => {
    assert.equal((await invoke(value)).passed, true);
    const staged = await artifact(value, body), before = await snapshot(value.publicRoot);
    const directoryBefore = identity(await fs.lstat(value.destination, { bigint: true }));
    success(await invoke(value), 'unchanged', body, staged.marker);
    assert.deepEqual(await snapshot(value.publicRoot), before);
    assert.deepEqual(identity(await fs.lstat(value.destination, { bigint: true })), directoryBefore);
  });
});

test('ST03_current_owned_artifact_replaced', async () => {
  const body = small(), replacement = encoded({ authored: 'Replacement complete source.', items: [{ name: 'new-authored-item' }] });
  await fixture(body, async value => {
    assert.equal((await invoke(value)).passed, true);
    const before = await fs.lstat(value.destination);
    await fs.writeFile(value.source, replacement);
    const result = await invoke(value), staged = await artifact(value, replacement);
    success(result, 'replaced', replacement, staged.marker);
    assert.notEqual((await fs.lstat(value.destination)).ino, before.ino);
    assert.deepEqual(await fs.readFile(value.source), replacement);
    assert.deepEqual((await fs.readdir(value.publicRoot)).sort(), ['r', 'unrelated-public.txt']);
  });
});

test('ST04_unmarked_or_malformed_destination_refused', async () => {
  for (const marker of [undefined, Buffer.from('not JSON\n'), encoded({ schemaVersion: 1, kind: 'foreign.artifact', files: [] })]) {
    await fixture(small(), async value => {
      await fs.mkdir(value.destination);
      await fs.writeFile(path.join(value.destination, INDEX), 'Authored foreign existing bytes.');
      if (marker) await fs.writeFile(path.join(value.destination, MANIFEST), marker);
      const before = await snapshot(value.publicRoot);
      assert.equal((await invoke(value)).passed, false);
      assert.deepEqual(await snapshot(value.publicRoot), before);
    });
  }
});

test('ST05_extra_foreign_entry_refused', async () => {
  await fixture(small(), async value => {
    assert.equal((await invoke(value)).passed, true);
    await fs.writeFile(path.join(value.destination, 'foreign.txt'), 'Authored foreign entry.');
    const before = await snapshot(value.publicRoot);
    assert.equal((await invoke(value)).passed, false);
    assert.deepEqual(await snapshot(value.publicRoot), before);
  });
});

test('ST06_source_symlink_refused', async () => {
  await fixture(small(), async value => {
    const target = path.join(value.root, 'authored-target.json');
    await fs.rename(value.source, target);
    await fs.symlink(target, value.source);
    const before = await snapshot(value.root);
    assert.equal((await invoke(value)).passed, false);
    assert.deepEqual(await snapshot(value.root), before);
  });
});

test('ST07_parent_and_destination_symlinks_refused', async () => {
  for (const variant of ['source-parent', 'public-parent', 'destination']) {
    await fixture(small(), async value => {
      if (variant === 'source-parent') {
        const target = path.join(value.root, 'authored-registry-parent');
        await fs.rename(path.dirname(value.source), target);
        await fs.symlink(target, path.dirname(value.source));
      } else if (variant === 'public-parent') {
        const target = path.join(value.root, 'authored-public-parent');
        await fs.rename(value.publicRoot, target);
        await fs.symlink(target, value.publicRoot);
      } else {
        const target = path.join(value.root, 'authored-destination-target');
        await fs.mkdir(target);
        await fs.writeFile(path.join(target, 'foreign.txt'), 'Authored symlink target.');
        await fs.symlink(target, value.destination);
      }
      const before = await snapshot(value.root);
      assert.equal((await invoke(value)).passed, false);
      assert.deepEqual(await snapshot(value.root), before);
    });
  }
});

test('ST08_empty_oversized_and_nonregular_source_refused', async () => {
  for (const variant of ['empty', 'oversized', 'directory']) {
    await fixture(variant === 'oversized' ? Buffer.alloc(MAX_INDEX + 1, 0x20) : Buffer.alloc(0), async value => {
      if (variant === 'directory') { await fs.unlink(value.source); await fs.mkdir(value.source); }
      const before = await snapshot(value.root);
      assert.equal((await invoke(value)).passed, false);
      assert.deepEqual(await snapshot(value.root), before);
    });
  }
});

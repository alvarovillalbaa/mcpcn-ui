// Build-only owner of the exact static aggregate registry and its ownership manifest.
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const SOURCE = path.join(ROOT, 'registry/registry.json');
const PUBLIC = path.join(ROOT, 'apps/docs/public');
const DESTINATION = path.join(PUBLIC, 'r');
const INDEX = 'registry.json', MANIFEST = 'registry-static-manifest.json';
const KIND = 'mcpcn.docs.registry-static.v1';
const MAX_INDEX = 40 * 1024 * 1024, MAX_MANIFEST = 32 * 1024;
const need = (condition, code) => { if (!condition) throw new Error(code); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const identity = value => [value.dev, value.ino, value.uid, value.mode, value.size, value.mtimeMs, value.ctimeMs];
const same = (left, right) => JSON.stringify(identity(left)) === JSON.stringify(identity(right));
const sameDirectory = (left, right) => ['dev', 'ino', 'uid', 'mode'].every(key => left[key] === right[key]);
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');

async function directory(folder) {
  const value = await fs.lstat(folder);
  need(value.isDirectory() && !value.isSymbolicLink() && value.uid === process.getuid()
    && await fs.realpath(folder) === folder, 'docs_registry_directory_invalid');
  return value;
}

async function read(file, cap) {
  const before = await fs.lstat(file);
  need(before.isFile() && !before.isSymbolicLink() && before.uid === process.getuid()
    && Number.isSafeInteger(before.size) && before.size > 0 && before.size <= cap
    && await fs.realpath(file) === file, 'docs_registry_file_invalid');
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    need(same(before, await handle.stat()), 'docs_registry_file_changed');
    const buffer = Buffer.alloc(before.size + 1); let count = 0;
    while (count < buffer.length) {
      const result = await handle.read(buffer, count, Math.min(65536, buffer.length - count), null);
      if (result.bytesRead === 0) break;
      count += result.bytesRead;
    }
    need(count === before.size && count <= cap && same(before, await handle.stat())
      && same(before, await fs.lstat(file)), 'docs_registry_file_changed');
    return { bytes: Buffer.from(buffer.subarray(0, count)), stat: before };
  } finally { await handle.close(); }
}

async function source() {
  const rootStat = await directory(ROOT), parentStat = await directory(path.dirname(SOURCE));
  const value = await read(SOURCE, MAX_INDEX);
  need(same(parentStat, await directory(path.dirname(SOURCE))), 'docs_registry_source_parent_changed');
  return { ...value, rootStat, parentStat };
}

async function sameSource(previous) {
  const current = await source();
  need(sameDirectory(previous.rootStat, current.rootStat) && same(previous.parentStat, current.parentStat)
    && same(previous.stat, current.stat) && previous.bytes.equals(current.bytes), 'docs_registry_source_changed');
}

async function parents() {
  await directory(ROOT);
  let current = ROOT; const folders = [ROOT];
  for (const segment of ['apps', 'docs', 'public']) {
    current = path.join(current, segment);
    try { await fs.mkdir(current, { mode: 0o755 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    await directory(current);
    folders.push(current);
  }
  return Promise.all(folders.map(async folder => ({ folder, stat: await directory(folder) })));
}

async function sameParents(previous) {
  for (const row of previous) {
    need(sameDirectory(row.stat, await directory(row.folder)), 'docs_registry_parent_changed');
  }
}

async function inventory(folder) {
  await directory(folder);
  const names = [];
  for await (const entry of await fs.opendir(folder)) {
    need(names.length < 2 && entry.isFile() && !entry.isSymbolicLink()
      && [INDEX, MANIFEST].includes(entry.name), 'docs_registry_artifact_entries_invalid');
    names.push(entry.name);
  }
  need(names.sort().join() === [INDEX, MANIFEST].sort().join(), 'docs_registry_artifact_entries_invalid');
}

async function artifact(folder) {
  const rootStat = await directory(folder);
  await inventory(folder);
  const marker = await read(path.join(folder, MANIFEST), MAX_MANIFEST);
  let manifest;
  try { manifest = JSON.parse(marker.bytes.toString('utf8')); } catch { throw new Error('docs_registry_manifest_invalid'); }
  need(manifest && typeof manifest === 'object' && !Array.isArray(manifest)
    && Object.keys(manifest).sort().join() === 'files,kind,schemaVersion'
    && manifest.schemaVersion === 1 && manifest.kind === KIND
    && Array.isArray(manifest.files) && manifest.files.length === 1, 'docs_registry_manifest_invalid');
  const row = manifest.files[0];
  need(row && typeof row === 'object' && !Array.isArray(row)
    && Object.keys(row).sort().join() === 'bytes,path,sha256' && row.path === INDEX
    && Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= MAX_INDEX
    && typeof row.sha256 === 'string' && /^[a-f0-9]{64}$/.test(row.sha256), 'docs_registry_manifest_invalid');
  const index = await read(path.join(folder, INDEX), MAX_INDEX);
  need(index.bytes.length === row.bytes && sha(index.bytes) === row.sha256, 'docs_registry_artifact_hash_mismatch');
  await inventory(folder);
  need(same(rootStat, await directory(folder)), 'docs_registry_artifact_directory_changed');
  return { rootStat, data: new Map([[INDEX, index], [MANIFEST, marker]]) };
}

async function unchanged(folder, previous) {
  const fresh = await artifact(folder);
  need(same(previous.rootStat, fresh.rootStat), 'docs_registry_artifact_directory_changed');
  for (const [name, value] of previous.data) {
    const now = fresh.data.get(name);
    need(now && same(value.stat, now.stat) && value.bytes.equals(now.bytes), 'docs_registry_artifact_file_changed');
  }
}

async function absent(file) {
  try { await fs.lstat(file); return false; } catch (error) { if (error.code === 'ENOENT') return true; throw error; }
}

async function existing() {
  if (await absent(DESTINATION)) return undefined;
  return artifact(DESTINATION);
}

async function removeKnown(folder, previous) {
  await unchanged(folder, previous);
  for (const [name, value] of previous.data) {
    const file = path.join(folder, name), fresh = await read(file, name === INDEX ? MAX_INDEX : MAX_MANIFEST);
    need(same(value.stat, fresh.stat) && value.bytes.equals(fresh.bytes), 'docs_registry_cleanup_file_changed');
    await fs.unlink(file);
  }
  // rmdir refuses anything that appeared outside the complete verified inventory.
  await fs.rmdir(folder);
}

function output(status, current, staged) {
  return { schemaVersion: 1, kind: 'mcpcn.docs.registry-static.stage.v1', status,
    source: { path: 'registry/registry.json', bytes: current.bytes.length, sha256: sha(current.bytes) },
    destination: 'apps/docs/public/r',
    files: [...staged.data].map(([name, value]) => ({ path: name, bytes: value.bytes.length, sha256: sha(value.bytes) })) };
}

async function stage() {
  need(process.argv.length === 2, 'docs_registry_arguments_invalid');
  const current = await source();
  const parentRows = await parents();
  await sameParents(parentRows);
  const previous = await existing();
  const manifest = encode({ schemaVersion: 1, kind: KIND,
    files: [{ path: INDEX, bytes: current.bytes.length, sha256: sha(current.bytes) }] });
  need(manifest.length <= MAX_MANIFEST, 'docs_registry_manifest_bound');
  if (previous && previous.data.get(INDEX).bytes.equals(current.bytes) && previous.data.get(MANIFEST).bytes.equals(manifest)) {
    await sameSource(current);
    await sameParents(parentRows);
    await unchanged(DESTINATION, previous);
    return output('unchanged', current, previous);
  }
  const scratch = await fs.mkdtemp(path.join(PUBLIC, '.mcpcn-registry-stage-'));
  await fs.chmod(scratch, 0o700);
  const ready = path.join(scratch, 'ready'), backup = path.join(scratch, 'previous');
  await fs.mkdir(ready, { mode: 0o755 });
  // On any uncertainty preserve scratch and prior contents for the task owner.
  await fs.writeFile(path.join(ready, INDEX), current.bytes, { flag: 'wx', mode: 0o644 });
  await fs.writeFile(path.join(ready, MANIFEST), manifest, { flag: 'wx', mode: 0o644 });
  const prepared = await artifact(ready);
  await sameSource(current);
  await sameParents(parentRows);
  if (previous) {
    await unchanged(DESTINATION, previous);
    await fs.rename(DESTINATION, backup);
    const moved = await directory(backup);
    need(moved.dev === previous.rootStat.dev && moved.ino === previous.rootStat.ino
      && moved.uid === previous.rootStat.uid && moved.mode === previous.rootStat.mode, 'docs_registry_backup_changed');
    // Rename changes only the directory ctime; child identities must stay exact.
    previous.rootStat = moved;
    await unchanged(backup, previous);
  }
  need(await absent(DESTINATION), 'docs_registry_destination_appeared');
  await sameParents(parentRows);
  await fs.rename(ready, DESTINATION);
  const adopted = await artifact(DESTINATION);
  for (const [name, value] of prepared.data) {
    need(value.bytes.equals(adopted.data.get(name).bytes), 'docs_registry_adopted_bytes_changed');
  }
  await sameSource(current);
  await sameParents(parentRows);
  if (previous) await removeKnown(backup, previous);
  await fs.rmdir(scratch);
  await unchanged(DESTINATION, adopted);
  return output(previous ? 'replaced' : 'staged', current, adopted);
}

try {
  console.log(JSON.stringify(await stage()));
} catch (error) {
  console.error('mcpcn: ' + (/^docs_registry_[a-z_]+$/.test(error?.message ?? '') ? error.message : 'docs_registry_io_error'));
  process.exitCode = 1;
}

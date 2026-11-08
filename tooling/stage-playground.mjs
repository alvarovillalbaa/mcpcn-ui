// Build-only owner of the single playground artifact and its two exact copies.
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE = path.join(ROOT, 'apps/playground/dist');
const NAME = 'asset-manifest.json', KIND = 'mcpcn.playground.assets.v1';
const MAX_FILE = 4 * 1024 * 1024, MAX_TOTAL = 16 * 1024 * 1024, MAX_FILES = 64;
const need = (value, code) => { if (!value) throw new Error(code); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const identity = value => [value.dev, value.ino, value.size, value.mode, value.mtimeMs, value.ctimeMs];
const same = (a, b) => JSON.stringify(identity(a)) === JSON.stringify(identity(b));
function safe(name) {
  return typeof name === 'string' && name.length <= 160 && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name)
    && !name.split('/').some(part => !part || part === '.' || part === '..')
    && (['index.html', 'frame.html'].includes(name) || /^assets\/[A-Za-z0-9._/-]+\.(?:js|css|svg|png|jpe?g|webp|avif|woff2?|ico)$/.test(name));
}
async function directory(name) {
  const stat = await fs.lstat(name);
  need(stat.isDirectory() && !stat.isSymbolicLink() && await fs.realpath(name) === name, 'playground_directory_invalid');
  return stat;
}
async function read(file, cap = MAX_FILE) {
  const before = await fs.lstat(file);
  need(before.isFile() && !before.isSymbolicLink() && before.size <= cap && await fs.realpath(file) === file, 'playground_file_invalid');
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    need(same(before, await handle.stat()), 'playground_file_changed');
    const buffer = Buffer.alloc(before.size + 1); let count = 0;
    while (count < buffer.length) {
      const read = await handle.read(buffer, count, Math.min(65536, buffer.length - count), null);
      if (read.bytesRead === 0) break; count += read.bytesRead;
    }
    need(count <= before.size && count <= cap, 'playground_file_changed');
    const bytes = Buffer.from(buffer.subarray(0, count));
    need(bytes.length === before.size && same(before, await handle.stat()) && same(before, await fs.lstat(file)), 'playground_file_changed');
    return { bytes, stat: before };
  } finally { await handle.close(); }
}
async function inventory(root) {
  await directory(root); const files = []; let directories = 0;
  async function walk(folder, prefix = '') {
    need(++directories <= 65 && prefix.length <= 160, 'playground_directory_bound');
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const name = prefix + entry.name, file = path.join(folder, entry.name);
      need(!entry.isSymbolicLink(), 'playground_symlink');
      if (entry.isDirectory()) { need(name === 'assets' || name.startsWith('assets/'), 'playground_directory_unexpected'); await directory(file); await walk(file, name + '/'); }
      else { need(entry.isFile() && (name === NAME || safe(name)) && files.length < MAX_FILES + 1, 'playground_asset_unexpected'); files.push(name); }
    }
  }
  await walk(root); return files.sort();
}
async function artifact(root) {
  const raw = await read(path.join(root, NAME), 32768), manifest = JSON.parse(raw.bytes.toString('utf8'));
  need(manifest.schemaVersion === 1 && manifest.kind === KIND && Object.keys(manifest).sort().join() === 'files,kind,schemaVersion'
    && Array.isArray(manifest.files) && manifest.files.length >= 2 && manifest.files.length <= MAX_FILES, 'playground_manifest_invalid');
  const data = new Map(), rows = []; let total = 0;
  for (const row of manifest.files) {
    need(row && Object.keys(row).sort().join() === 'bytes,path,sha256' && safe(row.path) && !data.has(row.path)
      && Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= MAX_FILE && /^[a-f0-9]{64}$/.test(row.sha256), 'playground_manifest_asset_invalid');
    const value = await read(path.join(root, row.path)); total += value.bytes.length;
    need(total <= MAX_TOTAL && value.bytes.length === row.bytes && sha(value.bytes) === row.sha256, 'playground_asset_hash_mismatch');
    data.set(row.path, value); rows.push(row.path);
  }
  need(data.has('index.html') && data.has('frame.html') && JSON.stringify(rows) === JSON.stringify([...rows].sort()), 'playground_entry_or_order_invalid');
  need(JSON.stringify(await inventory(root)) === JSON.stringify([...rows, NAME].sort()), 'playground_asset_set_changed');
  data.set(NAME, raw); return { data, rootStat: await directory(root), manifest: raw.bytes };
}
async function createManifest() {
  const names = await inventory(SOURCE); need(!names.includes(NAME), 'playground_manifest_already_present');
  const rows = []; let total = 0;
  for (const name of names) {
    const { bytes } = await read(path.join(SOURCE, name)); total += bytes.length;
    need(bytes.length > 0 && total <= MAX_TOTAL && rows.length < MAX_FILES, 'playground_bundle_bound');
    rows.push({ path: name, bytes: bytes.length, sha256: sha(bytes) });
  }
  need(names.includes('index.html') && names.includes('frame.html'), 'playground_entries_missing');
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, kind: KIND, files: rows }, null, 2) + '\n');
  need(bytes.length <= 32768, 'playground_manifest_bound');
  await fs.writeFile(path.join(SOURCE, NAME), bytes, { flag: 'wx', mode: 0o644 });
  await artifact(SOURCE);
}
async function unchanged(root, previous) {
  const fresh = await artifact(root);
  need(same(fresh.rootStat, previous.rootStat), 'playground_stage_directory_changed');
  need(fresh.data.size === previous.data.size, 'playground_stage_set_changed');
  for (const [name, value] of previous.data) {
    const now = fresh.data.get(name);
    need(now && same(value.stat, now.stat) && value.bytes.equals(now.bytes), 'playground_stage_owned_file_changed');
  }
}
async function mkdirParents(folder) {
  const relative = path.relative(ROOT, folder); need(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'playground_destination_outside_repo');
  let current = ROOT;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try { await fs.mkdir(current, { mode: 0o755 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    await directory(current);
  }
}
async function removeKnown(root, previous) {
  await unchanged(root, previous);
  const dirs = new Set();
  for (const [name, value] of previous.data) {
    const file = path.join(root, name), fresh = await read(file, name === NAME ? 32768 : MAX_FILE);
    need(same(value.stat, fresh.stat) && value.bytes.equals(fresh.bytes), 'playground_cleanup_owned_file_changed');
    await fs.unlink(file);
    let folder = path.dirname(file); while (folder !== root) { dirs.add(folder); folder = path.dirname(folder); }
  }
  for (const dir of [...dirs].sort((a, b) => b.length - a.length)) await fs.rmdir(dir);
  await fs.rmdir(root);
}
async function stage(target) {
  const destination = path.join(ROOT, target === 'cli' ? 'packages/cli/dist/playground' : 'apps/docs/public/playground-simulator');
  await mkdirParents(path.dirname(destination)); const current = await artifact(SOURCE); let previous;
  try { await fs.lstat(destination); previous = await artifact(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; if (await fs.lstat(destination).catch(() => null)) throw new Error('playground_existing_stage_invalid'); }
  if (previous && current.data.size === previous.data.size && [...current.data].every(([name, value]) => previous.data.get(name)?.bytes.equals(value.bytes))) {
    await unchanged(destination, previous); return;
  }
  const scratch = await fs.mkdtemp(path.join(path.dirname(destination), '.mcpcn-playground-stage-')); await fs.chmod(scratch, 0o700);
  const ready = path.join(scratch, 'ready'), backup = path.join(scratch, 'previous'); await fs.mkdir(ready, { mode: 0o755 });
  // A failed staging attempt is preserved rather than broadly deleting uncertain output.
  for (const [name, value] of current.data) {
    const file = path.join(ready, name); await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o755 });
    await fs.writeFile(file, value.bytes, { flag: 'wx', mode: 0o644 });
  }
  const prepared = await artifact(ready); await unchanged(SOURCE, current);
  if (previous) { await unchanged(destination, previous); await fs.rename(destination, backup); }
  else need(!(await fs.lstat(destination).catch(() => null)), 'playground_stage_destination_appeared');
  await fs.rename(ready, destination);
  const adopted = await artifact(destination); need(adopted.manifest.equals(prepared.manifest), 'playground_stage_manifest_changed');
  for (const [name, value] of current.data) need(adopted.data.get(name)?.bytes.equals(value.bytes), 'playground_stage_bytes_changed');
  if (previous) {
    // Directory rename changes its ctime; all file identities remain the original ones.
    const moved = await directory(backup);
    need(moved.dev === previous.rootStat.dev && moved.ino === previous.rootStat.ino && moved.mode === previous.rootStat.mode, 'playground_stage_backup_changed');
    previous.rootStat = moved; await removeKnown(backup, previous);
  }
  await fs.rmdir(scratch);
}
try {
  if (process.argv.length === 3 && process.argv[2] === '--manifest') await createManifest();
  else if (process.argv.length === 4 && process.argv[2] === '--target' && ['cli', 'docs'].includes(process.argv[3])) await stage(process.argv[3]);
  else throw new Error('playground_stage_arguments_invalid');
} catch (error) {
  console.error('mcpcn: ' + (/^playground_[a-z_]+$/.test(error?.message ?? '') ? error.message : 'playground_stage_io_error'));
  process.exitCode = 1;
}

import { createHash, randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, mkdir, open, realpath, rename, rmdir, unlink, link, type FileHandle } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { blockCatalog, catalog, findCatalogItem } from "@mcpcn/registry/catalog";
import { blockExportName, buildInstallationPlan, defaultConfig, renderProvider, resolveInstallConfig, type InstallConfig } from "@mcpcn/registry/installation";

export type CLIContext = {
  cwd?: string;
  fetch?: typeof globalThis.fetch;
  log?: (value: string) => void;
  error?: (value: string) => void;
};
type Identity = { dev: number; ino: number };
type Captured = { bytes: Buffer; stat: Stats };
type PlannedFile = { bytes: Buffer; source: string };
type OwnedFile = { identity: Identity; bytes: Buffer };
type InstallLock = {
  version: 2;
  configHash: string;
  files: Record<string, { hash: string; source: string }>;
  items: Record<string, { files: string[] }>;
};
const JSON_LIMIT = 2 * 1024 * 1024;
const TOTAL_LIMIT = 16 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const INSTALL_LOCK = ".mcpcn-install.lock";
const MANIFEST = "mcpcn.lock.json";
const CONFIG = "mcpcn.json";
const shared = new Set(["_mcpcn/core.ts", "_mcpcn/schemas.ts", "_mcpcn/components.tsx", "_mcpcn/runtime.tsx", "_mcpcn/blocks.tsx", "provider.tsx", "styles.css", "LICENSE"]);
class CLIError extends Error {
  constructor(readonly code: string) { super(code); }
}
function fail(code: string): never { throw new CLIError(code); }
function hash(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex"); }
function encode(value: unknown): Buffer { return Buffer.from(JSON.stringify(value, null, 2) + "\n"); }
function same(a: Identity, b: Identity): boolean { return a.dev === b.dev && a.ino === b.ino; }
function stamps(a: Stats, b: Stats): boolean {
  return same(a, b) && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && a.mode === b.mode;
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, fields: string[]): boolean {
  return Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
}
async function maybeStat(path: string): Promise<Stats | null> {
  try { return await lstat(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
function text(bytes: Buffer, code = "registry_invalid"): string {
  try {
    const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (value.includes("\0")) fail(code);
    return value;
  } catch { fail(code); }
}
function parse(bytes: Buffer, code: string): unknown {
  try { return JSON.parse(text(bytes, code)); }
  catch { fail(code); }
}
function safePath(path: string): boolean {
  return path.length <= 512 && !path.includes("\\") && !path.startsWith("/") &&
    path.split("/").every(part => part !== "" && part !== "." && part !== ".." && /^[A-Za-z0-9_.-]+$/.test(part));
}
async function checkParents(root: string, path: string): Promise<void> {
  if (!safePath(path)) fail("path_not_allowed");
  let current = root;
  for (const part of path.split("/").slice(0, -1)) {
    current = join(current, part);
    const info = await maybeStat(current);
    if (info && (!info.isDirectory() || info.isSymbolicLink())) fail("path_not_allowed");
  }
}
async function capture(path: string, limit = JSON_LIMIT): Promise<Captured | null> {
  const leaf = await maybeStat(path);
  if (!leaf) return null;
  if (!leaf.isFile() || leaf.isSymbolicLink()) fail("path_not_allowed");
  if (leaf.size > limit) fail("registry_too_large");
  if (typeof constants.O_NOFOLLOW !== "number" || typeof constants.O_NONBLOCK !== "number") fail("platform_unsupported");
  let file: FileHandle | undefined;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = await file.stat();
    if (!before.isFile() || !stamps(leaf, before)) fail("file_conflict");
    const chunks: Buffer[] = [];
    let count = 0;
    while (true) {
      const buffer = Buffer.alloc(Math.min(65_536, limit + 1 - count));
      const result = await file.read(buffer, 0, buffer.length, count);
      if (!result.bytesRead) break;
      count += result.bytesRead;
      if (count > limit) fail("registry_too_large");
      chunks.push(buffer.subarray(0, result.bytesRead));
    }
    const after = await file.stat();
    const current = await lstat(path);
    if (!stamps(before, after) || !stamps(before, current) || !current.isFile()) fail("file_conflict");
    return { bytes: Buffer.concat(chunks, count), stat: before };
  } finally { await file?.close(); }
}
async function readConfig(root: string): Promise<{ config: InstallConfig; captured: Captured }> {
  const captured = await capture(join(root, CONFIG), 65_536);
  if (!captured) fail("config_required");
  try { return { config: resolveInstallConfig(parse(captured.bytes, "invalid_config")), captured }; }
  catch { fail("invalid_config"); }
}
function allowedRelative(config: InstallConfig, path: string): boolean {
  if (!safePath(path) || !path.startsWith(config.componentsDir + "/")) return false;
  const suffix = path.slice(config.componentsDir.length + 1);
  return shared.has(suffix) || catalog.some(item => suffix === item.slug + ".tsx") ||
    blockCatalog.some(item => suffix === "blocks/" + item.name + ".tsx");
}
function itemPaths(config: InstallConfig, slug: string): string[] {
  const block = blockCatalog.some(item => item.name === slug);
  return [(block ? "blocks/" : "") + slug + ".tsx", "provider.tsx",
    ...(config.mode === "copy" ? ["styles.css", "LICENSE", "_mcpcn/core.ts", "_mcpcn/schemas.ts", "_mcpcn/components.tsx", "_mcpcn/runtime.tsx", ...(block ? ["_mcpcn/blocks.tsx"] : [])] : [])]
    .map(path => config.componentsDir + "/" + path);
}
function readLock(value: unknown, config: InstallConfig): InstallLock {
  if (record(value) && value.version === 1) fail("legacy_lock_unsupported");
  if (!record(value) || !exact(value, ["version", "configHash", "files", "items"]) || value.version !== 2 ||
      typeof value.configHash !== "string" || !/^[a-f0-9]{64}$/.test(value.configHash) || !record(value.files) || !record(value.items)) fail("lock_invalid");
  if (value.configHash !== hash(encode(config))) fail("config_changed");
  const files: InstallLock["files"] = {};
  const items: InstallLock["items"] = {};
  if (Object.keys(value.files).length > 500 || Object.keys(value.items).length > catalog.length + blockCatalog.length) fail("lock_invalid");
  for (const [path, entry] of Object.entries(value.files)) {
    if (!allowedRelative(config, path) || !record(entry) || !exact(entry, ["hash", "source"]) ||
        typeof entry.hash !== "string" || !/^[a-f0-9]{64}$/.test(entry.hash) ||
        typeof entry.source !== "string" || entry.source.length > 4096 || !entry.source || entry.source.includes("\0")) fail("lock_invalid");
    files[path] = { hash: entry.hash, source: entry.source };
  }
  const referenced = new Set<string>();
  for (const [slug, entry] of Object.entries(value.items)) {
    if ((!catalog.some(item => item.slug === slug) && !blockCatalog.some(item => item.name === slug)) ||
        !record(entry) || !exact(entry, ["files"]) || !Array.isArray(entry.files) ||
        !entry.files.length || entry.files.length > 32 || new Set(entry.files).size !== entry.files.length ||
        entry.files.some(path => typeof path !== "string" || !Object.hasOwn(files, path))) fail("lock_invalid");
    const listed = entry.files as string[];
    const expected = itemPaths(config, slug);
    if (listed.length !== expected.length || expected.some(path => !listed.includes(path))) fail("lock_invalid");
    items[slug] = { files: [...listed] };
    for (const path of items[slug]!.files) referenced.add(path);
  }
  if (Object.keys(files).some(path => !referenced.has(path))) fail("lock_invalid");
  return { version: 2, configHash: value.configHash, files, items };
}
async function request(url: string, fetcher: typeof globalThis.fetch): Promise<unknown> {
  if (url.startsWith("file:")) {
    const captured = await capture(fileURLToPath(url));
    if (!captured) fail("registry_unavailable");
    return parse(captured.bytes, "registry_invalid");
  }
  const controller = new AbortController();
  const deadline = performance.now() + REQUEST_TIMEOUT_MS;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      controller.abort();
      void reader?.cancel().catch(() => undefined);
      reject(new CLIError("registry_timeout"));
    }, REQUEST_TIMEOUT_MS);
  });
  const live = () => { if (expired || performance.now() >= deadline) fail("registry_timeout"); };
  const work = async () => {
    let response: Response;
    try { response = await fetcher(url, { signal: controller.signal, redirect: "error", credentials: "omit" }); }
    catch { fail(expired ? "registry_timeout" : "registry_unavailable"); }
    if (expired || performance.now() >= deadline) { void response.body?.cancel().catch(() => undefined); fail("registry_timeout"); }
    if (!response.ok || !response.body) { void response.body?.cancel().catch(() => undefined); fail("registry_unavailable"); }
    const declared = response.headers.get("content-length");
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > JSON_LIMIT)) {
      void response.body.cancel().catch(() => undefined); fail("registry_too_large");
    }
    reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let count = 0;
    try {
      while (true) {
        live();
        const part = await reader.read();
        live();
        if (part.done) break;
        count += part.value.byteLength;
        if (count > JSON_LIMIT) fail("registry_too_large");
        chunks.push(Buffer.from(part.value));
      }
      return parse(Buffer.concat(chunks, count), "registry_invalid");
    } finally { void reader.cancel().catch(() => undefined); reader.releaseLock(); }
  };
  try { return await Promise.race([work(), timeout]); }
  finally { if (timer) clearTimeout(timer); }
}
function payloadFiles(value: unknown, slug: string, config: InstallConfig): Map<string, PlannedFile> {
  const block = blockCatalog.some(item => item.name === slug);
  if (!record(value) || value.name !== slug || value.type !== (block ? "registry:block" : "registry:ui") ||
      !Array.isArray(value.files) || !value.files.length || value.files.length > 32 ||
      !Array.isArray(value.registryDependencies) || value.registryDependencies.some(name => typeof name !== "string" ||
        (!catalog.some(item => item.slug === name) && !blockCatalog.some(item => item.name === name)))) fail("registry_invalid");
  const result = new Map<string, PlannedFile>();
  const entry = (block ? "blocks/" : "") + slug + ".tsx";
  for (const file of value.files) {
    if (!record(file) || typeof file.path !== "string" || !file.path.startsWith("components/mcpcn/") ||
        typeof file.content !== "string" || !file.content.trim() || file.content.includes("\0") ||
        !["registry:component", "registry:lib", "registry:style"].includes(String(file.type))) fail("registry_invalid");
    const suffix = file.path.slice("components/mcpcn/".length);
    if ((!shared.has(suffix) && suffix !== entry) || (!block && suffix === "_mcpcn/blocks.tsx")) fail("path_not_allowed");
    const path = config.componentsDir + "/" + suffix;
    if (!allowedRelative(config, path) || result.has(path)) fail("registry_invalid");
    const bytes = Buffer.from(suffix === "provider.tsx" ? renderProvider(config) : file.content);
    if (text(Buffer.from(file.content)) !== file.content || bytes.length > JSON_LIMIT) fail("registry_invalid");
    result.set(path, { bytes, source: config.registry + "/" + slug + ".json" });
  }
  for (const required of itemPaths(config, slug)) {
    if (!result.has(required)) fail("registry_invalid");
  }
  return result;
}
class Transaction {
  private readonly files = new Map<string, OwnedFile>();
  private readonly directories = new Map<string, Identity>();
  private readonly uncertain = new Set<string>();
  private readonly temporaryFiles = new Set<string>();
  private uncertainCommit = false;
  private mutex: FileHandle | undefined;
  private identity: Identity | undefined;
  private mutexBytes: Buffer | undefined;
  committed = false;
  constructor(readonly root: string) {}
  async acquire(): Promise<void> {
    try { this.mutex = await open(join(this.root, INSTALL_LOCK), "wx", 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") fail("lock_busy"); throw error; }
    this.identity = await this.mutex.stat();
    this.mutexBytes = encode({ nonce: randomUUID(), pid: process.pid });
    await this.mutex.writeFile(this.mutexBytes);
    await this.mutex.sync();
  }
  async check(): Promise<void> {
    if (!this.mutex || !this.identity) fail("lock_invalid");
    const leaf = await lstat(join(this.root, INSTALL_LOCK));
    const held = await this.mutex.stat();
    const actual = await capture(join(this.root, INSTALL_LOCK));
    if (!leaf.isFile() || !same(leaf, this.identity) || !same(held, this.identity) ||
        !actual || !actual.bytes.equals(this.mutexBytes!)) fail("lock_invalid");
  }
  async write(path: string, bytes: Buffer): Promise<void> {
    await checkParents(this.root, path);
    let current = this.root;
    for (const part of path.split("/").slice(0, -1)) {
      current = join(current, part);
      const existing = await maybeStat(current);
      if (existing) { if (!existing.isDirectory() || existing.isSymbolicLink()) fail("path_not_allowed"); continue; }
      await mkdir(current, { mode: 0o700 });
      this.uncertain.add(current);
      this.directories.set(current, await lstat(current));
      this.uncertain.delete(current);
    }
    let file: FileHandle | undefined;
    try {
      file = await open(join(this.root, path), "wx", 0o600);
      this.uncertain.add(path);
      const owned: OwnedFile = { identity: await file.stat(), bytes: Buffer.alloc(0) };
      this.files.set(path, owned);
      this.uncertain.delete(path);
      let offset = 0;
      while (offset < bytes.length) {
        const written = await file.write(bytes, offset, bytes.length - offset, offset);
        if (!written.bytesWritten) fail("io_error");
        offset += written.bytesWritten;
        owned.bytes = bytes.subarray(0, offset);
      }
      await file.sync();
    } finally { await file?.close(); }
    const actual = await capture(join(this.root, path));
    if (!actual || !same(actual.stat, this.files.get(path)!.identity) || !actual.bytes.equals(bytes)) fail("file_conflict");
  }
  async manifest(value: InstallLock, previous: Captured | null): Promise<void> {
    const temporary = ".mcpcn-manifest-" + randomUUID() + ".tmp";
    const bytes = encode(value);
    this.temporaryFiles.add(temporary);
    await this.write(temporary, bytes);
    await this.check();
    const current = await capture(join(this.root, MANIFEST));
    if (previous ? !current || !stamps(previous.stat, current.stat) || !previous.bytes.equals(current.bytes) : current !== null) fail("file_conflict");
    const installedIdentity = this.files.get(temporary)!.identity;
    try {
      if (previous) await rename(join(this.root, temporary), join(this.root, MANIFEST));
      else await link(join(this.root, temporary), join(this.root, MANIFEST));
      // This is the rollback boundary, not a successful verification receipt.
      this.committed = true;
    } catch (cause) {
      try {
        const installed = await capture(join(this.root, MANIFEST));
        if (installed && same(installed.stat, installedIdentity) && installed.bytes.equals(bytes)) {
          this.committed = true;
        } else {
          const unchanged = previous
            ? installed !== null && stamps(previous.stat, installed.stat) && previous.bytes.equals(installed.bytes)
            : installed === null;
          if (!unchanged) {
            this.committed = true;
            this.uncertainCommit = true;
          }
        }
      } catch {
        this.committed = true;
        this.uncertainCommit = true;
      }
      throw cause;
    }
    if (!previous) await unlink(join(this.root, temporary));
    this.files.delete(temporary);
    this.temporaryFiles.delete(temporary);
    const installed = await capture(join(this.root, MANIFEST));
    if (!installed || !same(installed.stat, installedIdentity) || !installed.bytes.equals(bytes)) fail("file_conflict");
  }
  async release(): Promise<void> {
    let incomplete = this.uncertain.size > 0 || this.uncertainCommit;
    if (!this.committed) {
      for (const [path, owned] of [...this.files].reverse()) {
        try {
          const current = await maybeStat(join(this.root, path));
          if (!current) continue;
          if (!current.isFile() || !same(current, owned.identity)) { incomplete = true; continue; }
          const actual = await capture(join(this.root, path));
          if (actual && same(actual.stat, owned.identity) && actual.bytes.equals(owned.bytes)) await unlink(join(this.root, path));
          else incomplete = true;
        } catch { incomplete = true; }
      }
      for (const [path, identity] of [...this.directories].reverse()) {
        try { const current = await maybeStat(path); if (current?.isDirectory() && same(current, identity)) await rmdir(path); }
        catch { incomplete = true; }
      }
    }
    if (this.committed) {
      for (const path of this.temporaryFiles) {
        try {
          const current = await maybeStat(join(this.root, path));
          if (!current) continue;
          const owned = this.files.get(path);
          if (!owned || !current.isFile() || !same(current, owned.identity)) { incomplete = true; continue; }
          const actual = await capture(join(this.root, path));
          if (actual && same(actual.stat, owned.identity) && actual.bytes.equals(owned.bytes)) await unlink(join(this.root, path));
          else incomplete = true;
        } catch { incomplete = true; }
      }
    }
    try {
      if (this.identity) {
        const current = await maybeStat(join(this.root, INSTALL_LOCK));
        const actual = current?.isFile() && same(current, this.identity) ? await capture(join(this.root, INSTALL_LOCK)) : null;
        if (actual && actual.bytes.equals(this.mutexBytes!)) await unlink(join(this.root, INSTALL_LOCK));
        else if (current) incomplete = true;
      } else if (this.mutex) incomplete = true;
    } catch { incomplete = true; }
    finally { await this.mutex?.close(); }
    if (incomplete) fail("cleanup_incomplete");
  }
}
async function locked<T>(root: string, use: (transaction: Transaction) => Promise<T>): Promise<T> {
  const transaction = new Transaction(root);
  try { await transaction.acquire(); return await use(transaction); }
  finally { await transaction.release(); }
}
async function verifyFiles(root: string, files: InstallLock["files"]): Promise<void> {
  for (const [path, item] of Object.entries(files)) {
    await checkParents(root, path);
    const actual = await capture(join(root, path));
    if (!actual || hash(actual.bytes) !== item.hash) fail("file_conflict");
  }
}
async function install(root: string, names: string[], fetcher: typeof globalThis.fetch, log: (value: string) => void): Promise<void> {
  const initial = await readConfig(root);
  let plan;
  try { plan = buildInstallationPlan(initial.config, names, catalog, blockCatalog); }
  catch { fail("invalid_selection"); }
  await locked(root, async transaction => {
    const currentConfig = await readConfig(root);
    if (!stamps(initial.captured.stat, currentConfig.captured.stat) || !initial.captured.bytes.equals(currentConfig.captured.bytes)) fail("config_changed");
    const config = currentConfig.config;
    const previous = await capture(join(root, MANIFEST));
    const lock: InstallLock = previous ? readLock(parse(previous.bytes, "lock_invalid"), config)
      : { version: 2, configHash: hash(encode(config)), files: {}, items: {} };
    await verifyFiles(root, lock.files);
    const pending = new Map<string, PlannedFile>();
    let total = 0;
    for (const slug of plan.itemNames) {
      let files: Map<string, PlannedFile>;
      if (config.mode === "copy") {
        const value = await request(config.registry + "/" + slug + ".json", fetcher);
        files = payloadFiles(value, slug, config);
      } else {
        const block = blockCatalog.find(item => item.name === slug);
        const item = findCatalogItem(slug);
        const path = config.componentsDir + "/" + (block ? "blocks/" : "") + slug + ".tsx";
        const name = block ? blockExportName(slug) : item!.name;
        files = new Map([[path, { bytes: Buffer.from('"use client";\nexport { ' + name + ' } from "' + (block ? "@mcpcn/react/blocks" : "@mcpcn/react") + '";\n'), source: "package:" + (block ? "@mcpcn/react/blocks" : "@mcpcn/react") }],
          [config.componentsDir + "/provider.tsx", { bytes: Buffer.from(renderProvider(config)), source: "configuration:provider" }]]);
      }
      lock.items[slug] = { files: [...files.keys()] };
      for (const [path, file] of files) {
        total += file.bytes.length;
        if (total > TOTAL_LIMIT) fail("registry_too_large");
        const existing = pending.get(path);
        if (existing && !existing.bytes.equals(file.bytes)) fail("registry_invalid");
        if (!existing) pending.set(path, file);
      }
    }
    // Finish every remote read and every local conflict check before creating source files.
    for (const [path, file] of pending) {
      await checkParents(root, path);
      const existing = await capture(join(root, path));
      if (existing && !existing.bytes.equals(file.bytes)) fail("file_conflict");
      if (lock.files[path] && lock.files[path]!.hash !== hash(file.bytes)) fail("file_conflict");
    }
    for (const [path, file] of pending) {
      if (!await capture(join(root, path))) await transaction.write(path, file.bytes);
      lock.files[path] ??= { hash: hash(file.bytes), source: file.source };
    }
    await verifyFiles(root, lock.files);
    const finalConfig = await capture(join(root, CONFIG), 65_536);
    if (!finalConfig || !stamps(currentConfig.captured.stat, finalConfig.stat) || !currentConfig.captured.bytes.equals(finalConfig.bytes)) fail("config_changed");
    await transaction.manifest(lock, previous);
  });
  log("Installed " + plan.selected.length + " selected items. Source files are tracked in " + MANIFEST + ".");
  log("Install consumer dependencies explicitly:\n" + plan.dependencyCommand);
  log(plan.imports.join("\n"));
}
const flagNames = new Map([["mode", "mode"], ["style", "style"], ["host", "host"], ["manager", "packageManager"], ["components-dir", "componentsDir"], ["registry", "registry"]]);
function options(args: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--package") {
      if (Object.hasOwn(result, "mode")) fail("invalid_arguments");
      result.mode = "package"; continue;
    }
    if (!arg.startsWith("--")) fail("invalid_arguments");
    const separator = arg.indexOf("=");
    const name = arg.slice(2, separator < 0 ? undefined : separator);
    const field = flagNames.get(name);
    if (!field || Object.hasOwn(result, field)) fail("invalid_arguments");
    const value = separator < 0 ? args[++index] : arg.slice(separator + 1);
    if (!value || value.startsWith("--")) fail("invalid_arguments");
    result[field] = value;
  }
  return result;
}
const HELP = "MCPCN — configure an existing React app\n\ninit | create [--mode=copy|package] [--style=default|graphite|violet] [--host=auto|standard-mcp|openai]\n  [--manager=npm|pnpm|bun] [--components-dir=components/mcpcn] [--registry=URL]\nadd <components or blocks...>   install reviewed source or package wrappers\ndoctor                         inspect configuration only\nlist | search [query] | view <item>\nupgrade --diff                 audit tracked file changes only\nvalidate <file> <item>          check JSON envelope shape only\ngenerate block|schema          print a starter\npreview <item>                 show the source catalog location\ndev | registry build|validate  show repository commands\n";

export async function runCLI(argv: string[], context: CLIContext = {}): Promise<number> {
  const log = context.log ?? console.log;
  const error = context.error ?? console.error;
  try {
    const [command = "help", ...args] = argv;
    if (["help", "--help", "-h"].includes(command)) { if (args.length) fail("invalid_arguments"); log(HELP); return 0; }
    const root = await realpath(context.cwd ?? process.cwd());
    if (!(await lstat(root)).isDirectory()) fail("io_error");
    if (command === "init" || command === "create") {
      let config: InstallConfig;
      try { config = resolveInstallConfig({ ...defaultConfig, ...options(args) }); }
      catch (cause) { if (cause instanceof CLIError) throw cause; fail("invalid_config"); }
      await locked(root, async transaction => {
        if (await maybeStat(join(root, CONFIG))) fail("file_conflict");
        await transaction.write(CONFIG, encode(config));
        await transaction.check();
        transaction.committed = true;
      });
      log("Created mcpcn.json. Dependencies were not installed.");
    } else if (command === "add") {
      if (!args.length || args.some(arg => arg.startsWith("-"))) fail("invalid_arguments");
      await install(root, args, context.fetch ?? globalThis.fetch, log);
    } else if (command === "list" || command === "search") {
      if (command === "list" && args.length) fail("invalid_arguments");
      const query = args.join(" ").toLowerCase();
      for (const item of catalog) if (!query || (item.slug + " " + item.name + " " + item.description).toLowerCase().includes(query)) log(item.slug + " — " + item.description);
      for (const item of blockCatalog) if (!query || (item.name + " " + item.description).toLowerCase().includes(query)) log(item.name + " — " + item.description);
    } else if (command === "view" || command === "preview") {
      if (args.length !== 1) fail("invalid_arguments");
      const item = findCatalogItem(args[0]!) ?? blockCatalog.find(item => item.name === args[0]);
      if (!item) fail("invalid_selection");
      log(command === "view" ? JSON.stringify(item, null, 2) : "Source catalog: https://github.com/alvarovillalbaa/mcpcn-ui#readme\nUse the local documentation app to preview this item.");
    } else if (command === "doctor") {
      if (args.length) fail("invalid_arguments");
      const { config } = await readConfig(root);
      const packageFile = await capture(join(root, "package.json"));
      const pkg = packageFile ? parse(packageFile.bytes, "invalid_config") : null;
      const dependencies = record(pkg) && record(pkg.dependencies) ? pkg.dependencies : {};
      const peers = record(pkg) && record(pkg.peerDependencies) ? pkg.peerDependencies : {};
      const react = Object.hasOwn(dependencies, "react") || Object.hasOwn(peers, "react");
      log("Configuration-only audit: " + config.mode + ", " + config.style + ", " + config.host + ".");
      log(react ? "React dependency is declared." : "React dependency is missing.");
      log("Host connectivity, installed versions and runtime compatibility were not checked.");
      if (!react) return 1;
    } else if (command === "upgrade") {
      if (args.length !== 1 || args[0] !== "--diff") fail("invalid_arguments");
      const { config } = await readConfig(root);
      const captured = await capture(join(root, MANIFEST));
      if (!captured) fail("lock_invalid");
      const lock = readLock(parse(captured.bytes, "lock_invalid"), config);
      let changed = false;
      for (const [path, entry] of Object.entries(lock.files)) {
        await checkParents(root, path);
        const actual = await capture(join(root, path));
        const clean = !!actual && hash(actual.bytes) === entry.hash;
        log((clean ? "clean " : "modified ") + path); changed ||= !clean;
      }
      log("Audit only. No files were upgraded or overwritten.");
      if (changed) return 1;
    } else if (command === "validate") {
      if (args.length !== 2 || !safePath(args[0]!) || !findCatalogItem(args[1]!)) fail("invalid_arguments");
      await checkParents(root, args[0]!);
      const captured = await capture(resolve(root, args[0]!));
      if (!captured) fail("io_error");
      const value = parse(captured.bytes, "invalid_payload");
      if (!record(value) || (!Object.hasOwn(value, "structuredContent") && !Object.hasOwn(value, "kind"))) fail("invalid_payload");
      log("JSON envelope shape accepted. Component schema, permissions and host behavior were not validated.");
    } else if (command === "generate") {
      if (args.length !== 1 || !["schema", "block"].includes(args[0]!)) fail("invalid_arguments");
      log(args[0] === "schema" ? 'import { z } from "zod";\nexport const ResultSchema = z.object({ title: z.string() });'
        : "export function AgentWorkflowBlock() { return <div>Review agent output here</div> }");
    } else if (command === "dev") {
      if (args.length) fail("invalid_arguments");
      log("Repository command only: pnpm --filter @mcpcn/playground dev");
    } else if (command === "registry") {
      if (args.length !== 1 || !["build", "validate"].includes(args[0]!)) fail("invalid_arguments");
      log("Repository command only: pnpm --filter @mcpcn/registry " + args[0]);
    } else fail("invalid_arguments");
    return 0;
  } catch (cause) {
    error("mcpcn: " + (cause instanceof CLIError ? cause.code : "io_error"));
    return 1;
  }
}

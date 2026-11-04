// Run only in the scoped Linux CI packet. Importing this module starts no work.
import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { constants, type Stats } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, open, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const EXPECTED_NODE = "v24.21.0";
const EXPECTED_TS = "5.9.3";
const STREAM_LIMIT = 256 * 1024;
const LOG_STREAM_LIMIT = 32 * 1024, LOG_TOTAL_LIMIT = 128 * 1024, REPORT_LIMIT = 512 * 1024;
const TERM_WAIT = 1000, STOP_WAIT = 2500, CLEANUP_WAIT = 4000;
const PACKAGES = ["@mcpcn/core", "@mcpcn/schemas", "@mcpcn/runtime", "@mcpcn/react", "@mcpcn/themes", "@mcpcn/registry", "mcpcn"];
const PINS: Record<string, string> = {
  typescript: EXPECTED_TS,
  react: "19.2.8", "react-dom": "19.2.8", zod: "4.4.3",
  "@modelcontextprotocol/ext-apps": "1.7.5", "@modelcontextprotocol/sdk": "1.30.0",
  "@types/react": "19.2.18", "@types/react-dom": "19.2.4",
};
type Identity = { dev: number; ino: number };
type CommandResult = {
  label: string; exit: number | null; signal: NodeJS.Signals | null;
  timedOut: boolean; cancelled: boolean; outputLimit: boolean; forcedSettlement: boolean;
  stdout: Buffer; stderr: Buffer; stdoutBytes: number; stderrBytes: number;
  stdoutObservedSha256: string; stderrObservedSha256: string;
  spawned: boolean; exitObserved: boolean; closeObserved: boolean; originalProcessGroupAbsent: boolean | null;
  termSent: boolean; killSent: boolean; groupAfterLeaderClose: boolean; signalError: boolean;
};
type StreamReceipt = { bytes: number; capturedBytes: number; sha256: string; observedSha256: string; complete: boolean;
  raw?: { encoding: "gzip-base64"; compressedBytes: number; data: string } };
type CommandReceipt = Omit<CommandResult, "stdout" | "stderr"> & { stdoutSha256: string; stderrSha256: string;
  streams: { stdout: StreamReceipt; stderr: StreamReceipt } };
type ExportTarget = { package: string; path: string; kind: "javascript" | "types" | "css" | "bin"; bytes: number; sha256: string };
type CaseResult = {
  name: "copy" | "package"; status: "passed" | "failed" | "not_run";
  code?: string; cleanupCode?: string; commands: CommandReceipt[]; writtenFiles: number | null;
  lockSha256: string | null; sourceTreeSha256: string | null;
  npmLockSha256: string | null; versions: Record<string, string> | null;
  teardown: "not_allocated" | "removed" | "failed";
  selectedItems: number | null; compiler: { version: string; entry: string; sha256: string } | null;
  launcher: { kind: "workspace-node" | "installed-bin"; entrySha256: string; ownedEntry: boolean; realpathMatchesEntry: boolean } | null;
  exportTargets: ExportTarget[] | null; stylesVerified: string[];
};
type Archive = { path: string; name: string; version: string; sha256: string; stat: Stats };
type RegistryEntry = { name: string; type: "registry:ui" | "registry:block"; files: Array<{ path: string; content: string }> };
class HarnessError extends Error { constructor(readonly code: string) { super(code); } }
const fail = (code: string): never => { throw new HarnessError(code); };
const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const same = (left: Identity, right: Identity) => left.dev === right.dev && left.ino === right.ino;
const stamped = (left: Stats, right: Stats) => same(left, right) && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const pause = (milliseconds: number) => new Promise<void>(resolvePause => setTimeout(resolvePause, milliseconds));
const cancellation = new AbortController();
type ActiveChild = { stop: () => void; forceKill: () => void; refresh: () => boolean };
const active = new Map<ChildProcess, ActiveChild>();
let compressedLogBytes = 0;

async function boundedFile(path: string, maximum: number): Promise<{ bytes: Buffer; stat: Stats }> {
  const leaf = await lstat(path);
  if (!leaf.isFile() || leaf.isSymbolicLink() || leaf.size > maximum) fail("input_file_invalid");
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await file.stat();
    if (!before.isFile() || !stamped(before, leaf)) fail("input_file_changed");
    const chunks: Buffer[] = []; let total = 0;
    while (true) {
      const buffer = Buffer.alloc(Math.min(65_536, maximum + 1 - total));
      const part = await file.read(buffer, 0, buffer.length, total);
      if (!part.bytesRead) break;
      total += part.bytesRead;
      if (total > maximum) fail("input_file_too_large");
      chunks.push(buffer.subarray(0, part.bytesRead));
    }
    if (!stamped(before, await file.stat()) || !stamped(before, await lstat(path))) fail("input_file_changed");
    return { bytes: Buffer.concat(chunks, total), stat: before };
  } finally { await file.close(); }
}
function json(bytes: Buffer): unknown {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail("json_invalid"); }
}
async function jsonFile(path: string, maximum = 2 * 1024 * 1024) { return json((await boundedFile(path, maximum)).bytes); }
function environment(home?: string): NodeJS.ProcessEnv {
  // No inherited credentials, NODE_OPTIONS, NODE_PATH, proxies or npm config.
  const value: NodeJS.ProcessEnv = { PATH: process.env.PATH, LANG: "C.UTF-8", TZ: "UTC", CI: "true", NO_COLOR: "1" };
  if (home) Object.assign(value, { HOME: join(home, ".home"), TMPDIR: join(home, ".tmp"),
    TMP: join(home, ".tmp"), TEMP: join(home, ".tmp"), NODE_COMPILE_CACHE: join(home, ".npm-cache", "node-compile-cache"),
    npm_config_cache: join(home, ".npm-cache"), npm_config_userconfig: join(home, ".npmrc"),
    npm_config_globalconfig: join(home, ".global.npmrc"), npm_config_registry: "https://registry.npmjs.org" });
  return value;
}
function killGroup(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) return;
  try { process.kill(-child.pid, signal); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
}
function groupAbsent(child: ChildProcess): boolean | null {
  if (!child.pid) return null;
  try { process.kill(-child.pid, 0); return false; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH" ? true : null; }
}
async function drainChildren(): Promise<boolean> {
  if (!active.size) return true;
  let failed = false, killed = false, pipesClosed = false;
  const started = Date.now();
  for (const entry of active.values()) { try { entry.stop(); } catch { failed = true; } }
  while (active.size && Date.now() - started < CLEANUP_WAIT) {
    for (const entry of active.values()) entry.refresh();
    if (!active.size) break;
    if (!killed && Date.now() - started >= TERM_WAIT) {
      killed = true;
      for (const entry of active.values()) { try { entry.forceKill(); } catch { failed = true; } }
    }
    if (!pipesClosed && Date.now() - started >= STOP_WAIT) {
      pipesClosed = true;
      for (const child of active.keys()) { child.stdout?.destroy(); child.stderr?.destroy(); }
    }
    await pause(20);
  }
  for (const entry of active.values()) entry.refresh();
  return !failed && active.size === 0;
}
async function command(label: string, executable: string, args: string[], cwd: string, milliseconds: number, env: NodeJS.ProcessEnv): Promise<CommandResult> {
  if (cancellation.signal.aborted) fail("cancelled");
  process.stderr.write(`Consumer step: ${label}\n`);
  return new Promise(resolveCommand => {
    const child = spawn(executable, args, { cwd, env, detached: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    const stdoutDigest = createHash("sha256"), stderrDigest = createHash("sha256");
    let stdoutBytes = 0, stderrBytes = 0, timedOut = false, cancelled = false, outputLimit = false, settled = false;
    let exit: number | null = null, signal: NodeJS.Signals | null = null, exitObserved = false, closeObserved = false, spawnFailed = false;
    let termSent = false, killSent = false, groupAfterLeaderClose = false, signalError = false, stopping = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined, settleTimer: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval>;
    const release = () => {
      if ((exitObserved && closeObserved && groupAbsent(child) === true) || (!child.pid && spawnFailed && closeObserved)) {
        active.delete(child); return true;
      }
      return false;
    };
    const finish = (forcedSettlement = false) => {
      if (settled) return; settled = true;
      clearTimeout(timer); clearInterval(poll); if (killTimer) clearTimeout(killTimer); if (settleTimer) clearTimeout(settleTimer);
      cancellation.signal.removeEventListener("abort", abort);
      release();
      resolveCommand({ label, exit, signal, timedOut, cancelled, outputLimit, forcedSettlement,
        stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), stdoutBytes, stderrBytes,
        stdoutObservedSha256: stdoutDigest.digest("hex"), stderrObservedSha256: stderrDigest.digest("hex"),
        spawned: Boolean(child.pid), exitObserved, closeObserved, originalProcessGroupAbsent: groupAbsent(child),
        termSent, killSent, groupAfterLeaderClose, signalError });
    };
    const refresh = () => { const released = release(); if (released) finish(); return released; };
    const forceKill = () => {
      if (!child.pid) return;
      killSent = true;
      try { killGroup(child, "SIGKILL"); } catch { signalError = true; }
    };
    const stop = () => {
      if (stopping) return;
      stopping = true; termSent = Boolean(child.pid);
      try { killGroup(child, "SIGTERM"); } catch { signalError = true; }
      killTimer = setTimeout(forceKill, TERM_WAIT);
      settleTimer = setTimeout(() => {
        child.stdout?.destroy(); child.stderr?.destroy();
        if (!refresh()) finish(true);
      }, STOP_WAIT);
    };
    active.set(child, { stop, forceKill, refresh });
    const abort = () => { cancelled = true; stop(); };
    const timer = setTimeout(() => { timedOut = true; stop(); }, milliseconds);
    const collect = (kind: "stdout" | "stderr", chunk: Buffer) => {
      if (settled) return;
      const previous = kind === "stdout" ? stdoutBytes : stderrBytes;
      (kind === "stdout" ? stdoutDigest : stderrDigest).update(chunk);
      if (kind === "stdout") stdoutBytes += chunk.length; else stderrBytes += chunk.length;
      if (previous < STREAM_LIMIT) (kind === "stdout" ? stdout : stderr).push(chunk.subarray(0, STREAM_LIMIT - previous));
      if (previous + chunk.length > STREAM_LIMIT) { outputLimit = true; stop(); }
    };
    child.stdout?.on("data", (chunk: Buffer) => collect("stdout", chunk));
    child.stderr?.on("data", (chunk: Buffer) => collect("stderr", chunk));
    child.once("error", () => { spawnFailed = true; if (child.pid) stop(); });
    child.once("exit", (code, receivedSignal) => { exit = code; signal = receivedSignal; exitObserved = true; refresh(); });
    child.once("close", () => {
      closeObserved = true;
      if (child.pid && groupAbsent(child) !== true) { groupAfterLeaderClose = true; stop(); }
      refresh();
    });
    poll = setInterval(refresh, 20);
    cancellation.signal.addEventListener("abort", abort, { once: true });
    if (cancellation.signal.aborted) abort();
  });
}
function receipt(result: CommandResult): CommandReceipt {
  const { stdout, stderr, ...rest } = result;
  const stream = (data: Buffer, bytes: number, observedSha256: string): StreamReceipt => {
    const value: StreamReceipt = { bytes, capturedBytes: data.length, sha256: sha256(data), observedSha256,
      complete: result.closeObserved && bytes === data.length };
    if (data.length) {
      const compressed = gzipSync(data); compressedLogBytes += compressed.length;
      if (compressed.length > LOG_STREAM_LIMIT || compressedLogBytes > LOG_TOTAL_LIMIT) fail("command_log_evidence_limit");
      value.raw = { encoding: "gzip-base64", compressedBytes: compressed.length, data: compressed.toString("base64") };
    }
    return value;
  };
  return { ...rest, stdoutSha256: sha256(stdout), stderrSha256: sha256(stderr),
    streams: { stdout: stream(stdout, result.stdoutBytes, result.stdoutObservedSha256), stderr: stream(stderr, result.stderrBytes, result.stderrObservedSha256) } };
}
async function checked(label: string, executable: string, args: string[], cwd: string, milliseconds: number,
                       env: NodeJS.ProcessEnv, results: CommandReceipt[]): Promise<Buffer> {
  const result = await command(label, executable, args, cwd, milliseconds, env);
  results.push(receipt(result));
  if (result.exit !== 0 || result.signal !== null || result.timedOut || result.cancelled || result.outputLimit || result.forcedSettlement
    || !result.spawned || !result.exitObserved || !result.closeObserved || result.originalProcessGroupAbsent !== true || result.groupAfterLeaderClose || result.signalError) {
    process.stderr.write(`Failed consumer step: ${label}\n`); process.stderr.write(result.stdout); process.stderr.write(result.stderr);
    fail(result.cancelled ? "cancelled" : result.timedOut ? "command_timeout" : result.outputLimit ? "command_output_limit" : "command_failed");
  }
  return result.stdout;
}
async function registry(root: string): Promise<RegistryEntry[]> {
  const value = await jsonFile(join(root, "registry/registry.json"), 32 * 1024 * 1024);
  if (!object(value) || !Array.isArray(value.items) || value.items.length !== 79) fail("registry_selection_changed");
  const entries = value.items as unknown[];
  if (entries.some(item => !object(item) || typeof item.name !== "string" || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(item.name)
    || !["registry:ui", "registry:block"].includes(String(item.type)) || !Array.isArray(item.files) || !item.files.length)) fail("registry_selection_changed");
  const checkedEntries = entries as RegistryEntry[];
  if (new Set(checkedEntries.map(item => item.name)).size !== 79 || checkedEntries.filter(item => item.type === "registry:ui").length !== 68
    || checkedEntries.filter(item => item.type === "registry:block").length !== 11) fail("registry_selection_changed");
  return checkedEntries;
}
async function archives(directory: string, root: string, license: Buffer, preparation: CommandReceipt[]): Promise<Archive[]> {
  const files = await readdir(directory);
  if (files.length !== 7 || files.some(file => !/^[A-Za-z0-9_.-]+\.tgz$/.test(file))) fail("archive_selection_invalid");
  const results: Archive[] = [];
  for (const file of files.sort()) {
    const path = join(directory, file), captured = await boundedFile(path, 16 * 1024 * 1024);
    const value = json(await checked("archive-metadata", "tar", ["-xOf", path, "package/package.json"], root, 10_000, environment(), preparation));
    if (!object(value) || typeof value.name !== "string" || !PACKAGES.includes(value.name) || value.version !== "0.1.0") fail("archive_identity_invalid");
    for (const key of ["dependencies", "optionalDependencies", "peerDependencies"]) if (object(value[key]) && Object.values(value[key]).some(item => typeof item !== "string" || /^(workspace|catalog):/.test(item))) fail("archive_dependency_unresolved");
    for (const key of ["dependencies", "optionalDependencies"]) if (object(value[key]) && Object.entries(value[key]).some(([name, version]) => PACKAGES.includes(name) && version !== "0.1.0")) fail("archive_dependency_unresolved");
    const packagedLicense = await checked("archive-license", "tar", ["-xOf", path, "package/LICENSE"], root, 10_000, environment(), preparation);
    if (!packagedLicense.equals(license)) fail("archive_license_mismatch");
    results.push({ path, name: value.name, version: value.version, sha256: sha256(captured.bytes), stat: captured.stat });
  }
  if (new Set(results.map(item => item.name)).size !== PACKAGES.length) fail("archive_selection_invalid");
  return results;
}
async function installedVersions(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [name, version] of Object.entries(PINS)) {
    const value = await jsonFile(join(root, "node_modules", name, "package.json"), 128 * 1024);
    if (!object(value) || value.version !== version) fail("installed_version_changed");
    result[name] = version;
  }
  return result;
}
async function installedTargets(root: string, workspace: string, archiveList: Archive[]) {
  const targets: ExportTarget[] = [], styles: string[] = [];
  const cssSources: Record<string, string> = {
    "@mcpcn/react:dist/styles.css": "packages/react/src/styles.css",
    "@mcpcn/themes:dist/default.css": "packages/themes/src/default.css",
  };
  const leaves = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (!object(value)) fail("package_export_invalid");
    return Object.values(value).flatMap(leaves);
  };
  const bins = (value: unknown) => {
    if (value === undefined) return null;
    if (!object(value) || Object.values(value).some(path => typeof path !== "string")) fail("package_bin_invalid");
    return Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([name, path]) => [name, (path as string).replace(/^\.\//, "")]);
  };
  for (const archive of archiveList) {
    const packageRoot = await realpath(join(root, "node_modules", archive.name));
    if (!packageRoot.startsWith(root + sep)) fail("package_target_outside_consumer");
    const installed = await jsonFile(join(packageRoot, "package.json"), 128 * 1024);
    const source = await jsonFile(join(workspace, "packages", archive.name === "mcpcn" ? "cli" : archive.name.slice("@mcpcn/".length), "package.json"), 128 * 1024);
    if (!object(installed) || !object(source) || JSON.stringify(installed.exports) !== JSON.stringify(source.exports)
      || JSON.stringify(bins(installed.bin)) !== JSON.stringify(bins(source.bin))) fail("package_exports_changed");
    const declarations: Array<{ path: string; bin: boolean }> = [];
    if (installed.exports !== undefined) for (const path of leaves(installed.exports)) declarations.push({ path, bin: false });
    if (installed.bin !== undefined) for (const path of leaves(installed.bin)) declarations.push({ path, bin: true });
    if (!declarations.length) fail("package_exports_missing");
    const seen = new Set<string>();
    for (const declaration of declarations) {
      const target = declaration.path.replace(/^\.\//, "");
      if (!target || target.startsWith("/") || target.includes("\\") || /[\x00-\x1f\x7f*]/.test(target)
        || target.split("/").some(part => !part || part === "." || part === "..")) fail("package_export_invalid");
      const key = `${declaration.bin ? "bin" : "export"}:${target}`;
      if (seen.has(key)) continue; seen.add(key);
      const resolved = await realpath(join(packageRoot, target));
      if (!resolved.startsWith(packageRoot + sep)) fail("package_target_outside_package");
      const captured = await boundedFile(resolved, 16 * 1024 * 1024);
      const kind = declaration.bin ? "bin" : target.endsWith(".d.ts") ? "types" : target.endsWith(".css") ? "css" : target.endsWith(".js") ? "javascript" : fail("package_export_invalid");
      if (kind === "css") {
        const original = cssSources[`${archive.name}:${target}`];
        if (!original || !captured.bytes.equals((await boundedFile(join(workspace, original), 2 * 1024 * 1024)).bytes)) fail("package_style_mismatch");
        styles.push(`${archive.name}/${target}`);
      }
      if (kind === "bin" && !(captured.stat.mode & 0o111)) fail("package_bin_not_executable");
      targets.push({ package: archive.name, path: target, kind, bytes: captured.bytes.length, sha256: sha256(captured.bytes) });
    }
  }
  if (new Set(targets.map(target => target.package)).size !== 7 || styles.length !== 2) fail("package_exports_incomplete");
  return { targets, styles };
}
async function verifyConfig(root: string, mode: "copy" | "package", source: string) {
  const value = await jsonFile(join(root, "mcpcn.json"));
  if (!object(value) || value.mode !== mode || value.style !== (mode === "copy" ? "graphite" : "violet")
    || value.host !== (mode === "copy" ? "standard-mcp" : "openai") || value.componentsDir !== "src/mcpcn"
    || value.registry !== source || value.typescript !== true || value.packageManager !== "npm") fail("configuration_mismatch");
}
async function verifyWritten(root: string, mode: "copy" | "package", entries: RegistryEntry[], license: Buffer) {
  const captured = await boundedFile(join(root, "mcpcn.lock.json"), 2 * 1024 * 1024), lock = json(captured.bytes);
  if (!object(lock) || lock.version !== 2 || !object(lock.files) || !object(lock.items)) fail("manifest_invalid");
  const names = entries.map(item => item.name).sort();
  if (JSON.stringify(Object.keys(lock.items).sort()) !== JSON.stringify(names)) fail("manifest_selection_mismatch");
  const expected = new Set<string>(["src/mcpcn/provider.tsx"]);
  for (const entry of entries) {
    if (mode === "package") expected.add(`src/mcpcn/${entry.type === "registry:block" ? "blocks/" : ""}${entry.name}.tsx`);
    else for (const file of entry.files) {
      if (typeof file.path !== "string" || !file.path.startsWith("components/mcpcn/") || file.path.includes("..")) fail("registry_path_invalid");
      expected.add("src/mcpcn/" + file.path.slice("components/mcpcn/".length));
    }
  }
  if (JSON.stringify(Object.keys(lock.files).sort()) !== JSON.stringify([...expected].sort())) fail("manifest_file_mismatch");
  const records: Array<{ path: string; bytes: number; sha256: string }> = [];
  for (const [path, item] of Object.entries(lock.files)) {
    if (!object(item) || typeof item.hash !== "string" || !/^[a-f0-9]{64}$/.test(item.hash) || path.startsWith("/") || path.includes("..") || path.includes("\\")) fail("manifest_invalid");
    const capturedFile = await boundedFile(join(root, path), 2 * 1024 * 1024), content = capturedFile.bytes.toString("utf8");
    if (sha256(capturedFile.bytes) !== item.hash) fail("installed_source_changed");
    if (mode === "copy" && /\.[jt]sx?$/.test(path) && content.includes("@mcpcn/")) fail("copied_package_import");
    records.push({ path, bytes: capturedFile.bytes.length, sha256: item.hash });
  }
  const provider = (await boundedFile(join(root, "src/mcpcn/provider.tsx"), 128 * 1024)).bytes.toString("utf8");
  if (mode === "copy" && !(await boundedFile(join(root, "src/mcpcn/LICENSE"), 128 * 1024)).bytes.equals(license)) fail("copied_license_mismatch");
  if (!provider.includes(`data-mcpcn-theme="${mode === "copy" ? "graphite" : "violet"}"`)
    || !provider.includes(mode === "copy" ? "new OfficialMCPAdapter()" : "new OpenAIAdapter()")
    || provider.includes("new StandardMCPAdapter()")) fail("provider_configuration_mismatch");
  return { selectedItems: Object.keys(lock.items).length, writtenFiles: records.length, lockSha256: sha256(captured.bytes), sourceTreeSha256: sha256(JSON.stringify(records.sort((a, b) => a.path.localeCompare(b.path)))) };
}
async function typeFixture(root: string) {
  await writeFile(join(root, "consumer.tsx"), `import { MCPCNProvider } from "./src/mcpcn/provider";
import { ApprovalCard } from "./src/mcpcn/approval-card";
import { ReviewBeforeAction } from "./src/mcpcn/blocks/review-before-action";
export const consumer = <MCPCNProvider><ApprovalCard title="Authored review" changes={[]} />
  <ReviewBeforeAction reviewId="authored-1" title="Review" changes={[]} onApprove={() => {}} onCancel={() => {}} /></MCPCNProvider>;
`, { flag: "wx", mode: 0o600 });
  await writeFile(join(root, "styles.d.ts"), 'declare module "*.css";\n', { flag: "wx", mode: 0o600 });
  await writeFile(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", lib: ["ES2022", "DOM", "DOM.Iterable"], module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", strict: true, noEmit: true, skipLibCheck: true, noUncheckedIndexedAccess: true, noUncheckedSideEffectImports: true, types: ["react"] }, include: ["src/**/*.ts", "src/**/*.tsx", "consumer.tsx", "styles.d.ts"] }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
async function removeOwned(root: string, identity: Identity, runner: string, mode: string): Promise<boolean> {
  const current = await lstat(root);
  if (dirname(root) !== runner || !basename(root).startsWith(`mcpcn-consumer-${mode}-`) || !current.isDirectory() || current.isSymbolicLink() || !same(current, identity)) return false;
  await rm(root, { recursive: true, force: false });
  return true;
}
async function scenario(mode: "copy" | "package", runner: string, workspace: string, archiveList: Archive[], entries: RegistryEntry[], license: Buffer): Promise<CaseResult> {
  const result: CaseResult = { name: mode, status: "failed", commands: [], writtenFiles: null, lockSha256: null, sourceTreeSha256: null, npmLockSha256: null, versions: null, teardown: "not_allocated",
    selectedItems: null, compiler: null, launcher: null, exportTargets: null, stylesVerified: [] };
  let root: string | undefined, identity: Stats | undefined;
  try {
    if (cancellation.signal.aborted) fail("cancelled");
    root = await mkdtemp(join(runner, `mcpcn-consumer-${mode}-`)); await chmod(root, 0o700); identity = await lstat(root);
    for (const directory of [".home", ".tmp", ".npm-cache"]) await mkdir(join(root, directory), { mode: 0o700 });
    for (const file of [".npmrc", ".global.npmrc"]) await writeFile(join(root, file), "", { flag: "wx", mode: 0o600 });
    const dependencies: Record<string, string> = { ...PINS };
    if (mode === "package") for (const archive of archiveList) dependencies[archive.name] = pathToFileURL(archive.path).href;
    await writeFile(join(root, "package.json"), JSON.stringify({ name: `mcpcn-authored-${mode}-consumer`, version: "0.0.0", private: true, type: "module", dependencies }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    const env = environment(root);
    await checked(`${mode}:install`, "npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org"], root, 180_000, env, result.commands);
    result.versions = await installedVersions(root);
    const compiler = await realpath(join(root, "node_modules/typescript/lib/tsc.js"));
    if (!compiler.startsWith(root + sep)) fail("compiler_outside_consumer");
    result.compiler = { version: result.versions.typescript!, entry: "node_modules/typescript/lib/tsc.js", sha256: sha256((await boundedFile(compiler, 2 * 1024 * 1024)).bytes) };
    result.npmLockSha256 = sha256((await boundedFile(join(root, "package-lock.json"), 4 * 1024 * 1024)).bytes);
    if (mode === "package") for (const archive of archiveList) {
      const installed = await jsonFile(join(root, "node_modules", archive.name, "package.json"), 128 * 1024);
      if (!object(installed) || installed.name !== archive.name || installed.version !== archive.version) fail("installed_package_mismatch");
      if (!(await boundedFile(join(root, "node_modules", archive.name, "LICENSE"), 128 * 1024)).bytes.equals(license)) fail("installed_license_mismatch");
      const current = await boundedFile(archive.path, 16 * 1024 * 1024);
      if (!stamped(current.stat, archive.stat) || sha256(current.bytes) !== archive.sha256) fail("archive_changed");
    }
    if (mode === "package") {
      const verified = await installedTargets(root, workspace, archiveList);
      result.exportTargets = verified.targets; result.stylesVerified = verified.styles;
    }
    const cli = mode === "copy" ? join(workspace, "packages/cli/dist/index.js") : join(root, "node_modules/mcpcn/dist/index.js");
    const cliFile = await boundedFile(cli, 2 * 1024 * 1024);
    let executable = process.execPath, prefix = [cli];
    if (mode === "package") {
      executable = join(root, "node_modules/.bin/mcpcn"); prefix = [];
      const launcherTarget = await realpath(executable), expectedTarget = await realpath(cli);
      if (!launcherTarget.startsWith(root + sep) || launcherTarget !== expectedTarget || !(cliFile.stat.mode & 0o111)) fail("installed_launcher_invalid");
      result.launcher = { kind: "installed-bin", entrySha256: sha256(cliFile.bytes), ownedEntry: true, realpathMatchesEntry: true };
    } else {
      if (await realpath(cli) !== cli || !cli.startsWith(workspace + sep)) fail("workspace_launcher_invalid");
      result.launcher = { kind: "workspace-node", entrySha256: sha256(cliFile.bytes), ownedEntry: false, realpathMatchesEntry: true };
    }
    const source = pathToFileURL(join(workspace, "registry/items")).href;
    await checked(`${mode}:init`, executable, [...prefix, "init", `--mode=${mode}`, `--style=${mode === "copy" ? "graphite" : "violet"}`, `--host=${mode === "copy" ? "standard-mcp" : "openai"}`, "--manager=npm", "--components-dir=src/mcpcn", `--registry=${source}`], root, 60_000, env, result.commands);
    await verifyConfig(root, mode, source);
    await checked(`${mode}:add-all-79`, executable, [...prefix, "add", ...entries.map(item => item.name)], root, 60_000, env, result.commands);
    Object.assign(result, await verifyWritten(root, mode, entries, license));
    await typeFixture(root);
    await checked(`${mode}:typecheck`, process.execPath, [compiler, "--project", join(root, "tsconfig.json"), "--pretty", "false"], root, 60_000, env, result.commands);
    result.status = "passed";
  } catch (error) { result.code = error instanceof HarnessError ? error.code : "consumer_failed"; }
  finally {
    try {
      const drained = await drainChildren();
      if (root && identity) result.teardown = drained && await removeOwned(root, identity, runner, mode) ? "removed" : "failed";
      else if (root) result.teardown = "failed";
    } catch { result.teardown = "failed"; }
    if (result.teardown === "failed") { result.status = "failed"; result.code ??= "cleanup_failed"; result.cleanupCode = "cleanup_failed"; }
  }
  return result;
}
async function writeReport(path: string, runner: string, value: unknown, beforeWrite?: () => Promise<void>) {
  const destination = resolve(path), parent = await realpath(dirname(destination));
  const relation = relative(runner, parent);
  if (relation.startsWith("..") || relation.startsWith(sep) || !/^[A-Za-z0-9_.-]+\.json$/.test(basename(destination))) fail("report_path_invalid");
  const bytes = Buffer.from(JSON.stringify(value) + "\n");
  if (bytes.length > REPORT_LIMIT) fail("report_output_limit");
  const file = await open(join(parent, basename(destination)), "wx", 0o600);
  try { if (beforeWrite) await beforeWrite(); await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
}
type SignalRecord = { signal: NodeJS.Signals; phase: "work" | "cleanup" | "report" };
function signalHandlers() {
  const state = { count: 0, received: [] as SignalRecord[], phase: "work" as SignalRecord["phase"] };
  const handlers = new Map<NodeJS.Signals, () => void>();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    const handler = () => { state.count++; if (state.received.length < 16) state.received.push({ signal, phase: state.phase }); cancellation.abort(); };
    process.on(signal, handler); handlers.set(signal, handler);
  }
  return { state, remove: () => { for (const [signal, handler] of handlers) process.removeListener(signal, handler); } };
}
async function emitSummary(value: unknown) {
  const bytes = Buffer.from(JSON.stringify(value) + "\n");
  if (bytes.length > REPORT_LIMIT) fail("report_output_limit");
  await new Promise<void>((resolveWrite, reject) => {
    const timer = setTimeout(() => { process.stdout.destroy(); reject(new HarnessError("report_stdout_timeout")); }, 2000);
    process.stdout.write(bytes, error => { clearTimeout(timer); if (error) reject(new HarnessError("report_stdout_failed")); else resolveWrite(); });
  });
}
type ProcessCleanup = { verified: boolean; remainingCommands: number; allOriginalGroupsAbsent: boolean };
async function processCleanup(): Promise<ProcessCleanup> {
  const drained = await drainChildren();
  return { verified: drained && active.size === 0, remainingCommands: active.size, allOriginalGroupsAbsent: active.size === 0 };
}
async function main() {
  const summary = {
    schemaVersion: 1, kind: "mcpcn-consumer-checks", status: "failed" as "passed" | "failed", exit: 1 as 0 | 1,
    node: process.version, typescript: EXPECTED_TS, platform: process.platform, preparation: [] as CommandReceipt[],
    archives: [] as Array<{ name: string; version: string; sha256: string }>, code: undefined as string | undefined,
    licenseSha256: undefined as string | undefined, processCleanup: undefined as ProcessCleanup | undefined,
    interrupted: false, signalCount: 0, signals: [] as SignalRecord[],
    limits: { workSeconds: 720, finalCleanupReserveSeconds: 30, commandStopMilliseconds: STOP_WAIT, processDrainMilliseconds: CLEANUP_WAIT,
      streamBytes: STREAM_LIMIT, compressedStreamBytes: LOG_STREAM_LIMIT, compressedTotalBytes: LOG_TOTAL_LIMIT, reportBytes: REPORT_LIMIT },
    cases: ["copy", "package"].map<CaseResult>(name => ({ name: name as "copy" | "package", status: "not_run", commands: [], writtenFiles: null, lockSha256: null, sourceTreeSha256: null, npmLockSha256: null, versions: null, teardown: "not_allocated",
      selectedItems: null, compiler: null, launcher: null, exportTargets: null, stylesVerified: [] })),
  };
  let runner: string | undefined;
  const signals = signalHandlers();
  const overall = setTimeout(() => cancellation.abort(), 12 * 60_000);
  const refresh = () => {
    summary.interrupted = cancellation.signal.aborted || signals.state.count > 0;
    summary.signalCount = signals.state.count; summary.signals = [...signals.state.received];
    if (summary.interrupted) summary.code ??= "cancelled";
    summary.exit = summary.code || !summary.processCleanup?.verified || summary.cases.some(item => item.status !== "passed" || item.teardown !== "removed") ? 1 : 0;
    summary.status = summary.exit === 0 ? "passed" : "failed";
  };
  try {
    try {
      if (process.argv.length !== 3 || process.version !== EXPECTED_NODE || process.platform !== "linux" || process.env.CI !== "true" || !process.env.RUNNER_TEMP) fail("approved_environment_required");
      runner = await realpath(process.env.RUNNER_TEMP);
      const workspace = await realpath(fileURLToPath(new URL("../", import.meta.url))), tarballs = await realpath(process.argv[2]!);
      if (!(await lstat(runner)).isDirectory() || !(await lstat(tarballs)).isDirectory()) fail("input_directory_invalid");
      const version = await jsonFile(join(workspace, "node_modules/typescript/package.json"), 128 * 1024);
      if (!object(version) || version.version !== EXPECTED_TS) fail("typescript_version_changed");
      const license = (await boundedFile(join(workspace, "LICENSE"), 128 * 1024)).bytes;
      summary.licenseSha256 = sha256(license);
      const entries = await registry(workspace), archiveList = await archives(tarballs, workspace, license, summary.preparation);
      summary.archives = archiveList.map(({ name, version, sha256 }) => ({ name, version, sha256 }));
      summary.cases[0] = await scenario("copy", runner, workspace, archiveList, entries, license);
      if (!cancellation.signal.aborted && active.size === 0) summary.cases[1] = await scenario("package", runner, workspace, archiveList, entries, license);
    } catch (error) { summary.code = error instanceof HarnessError ? error.code : "preparation_failed"; }
    signals.state.phase = "cleanup";
    summary.processCleanup = await processCleanup();
    if (!summary.processCleanup.verified) summary.code ??= "process_cleanup_failed";
    signals.state.phase = "report"; refresh();
    if (process.env.MCPCN_CONSUMER_REPORT && runner) {
      try { await writeReport(process.env.MCPCN_CONSUMER_REPORT, runner, summary); }
      catch { summary.code ??= "report_write_failed"; }
    }
    refresh();
    try { await emitSummary(summary); } catch { summary.code ??= "report_stdout_failed"; }
    refresh(); process.exitCode = summary.exit;
  } finally {
    clearTimeout(overall); signals.remove();
  }
}

type LifecycleCase = { name: string; status: "passed" | "failed" | "not_run"; commands: CommandReceipt[]; code?: string; evidence?: Record<string, unknown> };
async function lifecycleChecks() {
  const summary = {
    schemaVersion: 1, kind: "mcpcn-consumer-lifecycle-checks", status: "failed" as "passed" | "failed", exit: 1 as 0 | 1,
    node: process.version, platform: process.platform, code: undefined as string | undefined,
    cases: ["leader close keeps a surviving owned group through TERM and KILL", "repeated signals remain handled during cleanup and report"]
      .map<LifecycleCase>(name => ({ name, status: "not_run", commands: [] })),
    processCleanup: undefined as ProcessCleanup | undefined, teardown: "not_allocated" as "not_allocated" | "removed" | "failed",
    interrupted: false, authoredSignals: 3, signalCount: 0, signals: [] as SignalRecord[],
    limits: { workSeconds: 30, cleanupMilliseconds: CLEANUP_WAIT, commandStopMilliseconds: STOP_WAIT, reportBytes: REPORT_LIMIT },
  };
  const signals = signalHandlers(); let deadlineExpired = false;
  const overall = setTimeout(() => { deadlineExpired = true; cancellation.abort(); }, 30_000);
  let runner: string | undefined, root: string | undefined, identity: Stats | undefined;
  const refresh = () => {
    summary.interrupted = cancellation.signal.aborted || signals.state.count > 0;
    summary.signalCount = signals.state.count; summary.signals = [...signals.state.received];
    if (deadlineExpired) summary.code ??= "lifecycle_timeout";
    summary.exit = summary.code || summary.signalCount !== 3 || !summary.processCleanup?.verified || summary.teardown !== "removed"
      || summary.cases.some(item => item.status !== "passed") ? 1 : 0;
    summary.status = summary.exit === 0 ? "passed" : "failed";
  };
  try {
    try {
      if (process.argv.length !== 3 || process.argv[2] !== "--lifecycle-checks" || process.version !== EXPECTED_NODE || process.platform !== "linux" || process.env.CI !== "true" || !process.env.RUNNER_TEMP) fail("approved_environment_required");
      runner = await realpath(process.env.RUNNER_TEMP);
      if (!(await lstat(runner)).isDirectory()) fail("input_directory_invalid");
      root = await mkdtemp(join(runner, "mcpcn-consumer-lifecycle-")); await chmod(root, 0o700); identity = await lstat(root);
      for (const directory of [".home", ".tmp", ".npm-cache"]) await mkdir(join(root, directory), { mode: 0o700 });
      for (const file of [".npmrc", ".global.npmrc"]) await writeFile(join(root, file), "", { flag: "wx", mode: 0o600 });
      const env = environment(root), first = summary.cases[0]!; first.status = "failed";
      try {
        const descendant = "process.on('SIGTERM',()=>{});process.on('disconnect',()=>{});setInterval(()=>{},1000);process.send('ready');";
        const leader = `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:false,stdio:['ignore','ignore','ignore','ipc'],env:process.env});child.once('message',value=>{if(value==='ready')process.stdout.write('owned-descendant-ready\\n',()=>process.exit(0));});setTimeout(()=>process.exit(2),1500);`;
        const result = await command("lifecycle:leader-close", process.execPath, ["-e", leader], root, 5000, env); first.commands.push(receipt(result));
        if (result.exit !== 0 || result.signal !== null || !result.exitObserved || !result.closeObserved || result.originalProcessGroupAbsent !== true
          || !result.groupAfterLeaderClose || !result.termSent || !result.killSent || result.forcedSettlement || result.timedOut || result.outputLimit || result.cancelled || result.signalError
          || result.stdout.toString() !== "owned-descendant-ready\n" || active.size !== 0) fail("leader_close_lifecycle_failed");
        first.evidence = { leaderClosedWithOwnedGroup: true, termAndKillObserved: true, originalGroupAbsent: true }; first.status = "passed";
      } catch (error) { first.code = error instanceof HarnessError ? error.code : "lifecycle_failed"; }
      if (first.status === "passed") {
        const second = summary.cases[1]!; second.status = "failed";
        try {
          const marker = join(root, "interrupt-ready");
          const program = "process.on('SIGTERM',()=>{});require('node:fs').writeFileSync(process.argv[1],'ready',{flag:'wx'});setInterval(()=>{},1000);";
          const pending = command("lifecycle:cleanup-interrupt", process.execPath, ["-e", program, marker], root, 5000, env); void pending.catch(() => {});
          const readyEnd = Date.now() + 2000; let ready = false;
          while (Date.now() < readyEnd && !cancellation.signal.aborted) {
            try { ready = (await boundedFile(marker, 16)).bytes.toString() === "ready"; if (ready) break; }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
            await pause(20);
          }
          if (!ready) fail("lifecycle_ready_timeout");
          const deliver = async (signal: NodeJS.Signals) => {
            const previous = signals.state.count; process.kill(process.pid, signal); const end = Date.now() + 2000;
            while (signals.state.count === previous && Date.now() < end) await pause(10);
            if (signals.state.count !== previous + 1) fail("lifecycle_signal_not_observed");
          };
          signals.state.phase = "cleanup";
          const draining = drainChildren();
          await deliver("SIGTERM"); await deliver("SIGINT");
          const drained = await draining, result = await pending; second.commands.push(receipt(result));
          if (!drained || !result.cancelled || result.timedOut || result.outputLimit || result.forcedSettlement || !result.exitObserved || !result.closeObserved || result.originalProcessGroupAbsent !== true
            || !result.termSent || !result.killSent || result.signalError || active.size !== 0) fail("cleanup_interrupt_lifecycle_failed");
          await writeReport(join(root, "signal-report.json"), runner, { authored: true }, async () => {
            signals.state.phase = "report"; await deliver("SIGHUP");
          });
          if (signals.state.count !== 3 || JSON.stringify(signals.state.received) !== JSON.stringify([
            { signal: "SIGTERM", phase: "cleanup" }, { signal: "SIGINT", phase: "cleanup" }, { signal: "SIGHUP", phase: "report" },
          ])) fail("signal_handler_lifetime_failed");
          second.evidence = { signalsDuringCleanup: 2, signalsDuringReport: 1, commandCancelled: true, originalGroupAbsent: true }; second.status = "passed";
        } catch (error) { second.code = error instanceof HarnessError ? error.code : "lifecycle_failed"; }
      }
    } catch (error) { summary.code = error instanceof HarnessError ? error.code : "lifecycle_preparation_failed"; }
    signals.state.phase = "cleanup"; summary.processCleanup = await processCleanup();
    if (root && identity && runner && summary.processCleanup.verified) {
      try { summary.teardown = await removeOwned(root, identity, runner, "lifecycle") ? "removed" : "failed"; } catch { summary.teardown = "failed"; }
    } else if (root) summary.teardown = "failed";
    signals.state.phase = "report"; refresh();
    if (process.env.MCPCN_CONSUMER_REPORT && runner) {
      try { await writeReport(process.env.MCPCN_CONSUMER_REPORT, runner, summary); } catch { summary.code ??= "report_write_failed"; }
    }
    refresh(); try { await emitSummary(summary); } catch { summary.code ??= "report_stdout_failed"; }
    refresh(); process.exitCode = summary.exit;
  } finally { clearTimeout(overall); signals.remove(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv[2] === "--lifecycle-checks") await lifecycleChecks(); else await main();
}

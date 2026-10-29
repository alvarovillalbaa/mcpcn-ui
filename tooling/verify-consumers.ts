// INACTIVE EXECUTION SCOPE. Authoring this harness does not approve its installs,
// subprocesses or typechecks. Run only in the separately approved Linux CI job.
import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { constants, type Stats } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, open, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EXPECTED_NODE = "v24.21.0";
const EXPECTED_TS = "5.9.3";
const STREAM_LIMIT = 256 * 1024;
const PACKAGES = ["@mcpcn/core", "@mcpcn/schemas", "@mcpcn/runtime", "@mcpcn/react", "@mcpcn/themes", "@mcpcn/registry", "mcpcn"];
const PINS: Record<string, string> = {
  react: "19.2.8", "react-dom": "19.2.8", zod: "4.4.3",
  "@modelcontextprotocol/ext-apps": "1.7.5", "@modelcontextprotocol/sdk": "1.30.0",
  "@types/react": "19.2.18", "@types/react-dom": "19.2.4",
};
type Identity = { dev: number; ino: number };
type CommandResult = {
  label: string; exit: number | null; signal: NodeJS.Signals | null;
  timedOut: boolean; cancelled: boolean; outputLimit: boolean; forcedSettlement: boolean;
  stdout: Buffer; stderr: Buffer; stdoutBytes: number; stderrBytes: number;
};
type CommandReceipt = Omit<CommandResult, "stdout" | "stderr"> & { stdoutSha256: string; stderrSha256: string };
type CaseResult = {
  name: "copy" | "package"; status: "passed" | "failed" | "not_run";
  code?: string; commands: CommandReceipt[]; writtenFiles: number | null;
  lockSha256: string | null; sourceTreeSha256: string | null;
  npmLockSha256: string | null; versions: Record<string, string> | null;
  teardown: "not_allocated" | "removed" | "failed";
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
const active = new Map<ChildProcess, Promise<void>>();

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
    npm_config_cache: join(home, ".npm-cache"), npm_config_userconfig: join(home, ".npmrc"),
    npm_config_globalconfig: join(home, ".global.npmrc"), npm_config_registry: "https://registry.npmjs.org" });
  return value;
}
function killGroup(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) return;
  try { process.kill(-child.pid, signal); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
}
async function drainChildren(): Promise<boolean> {
  if (!active.size) return true;
  let failed = false;
  for (const child of active.keys()) { try { killGroup(child, "SIGTERM"); } catch { failed = true; } }
  await Promise.race([Promise.all(active.values()), pause(1000)]);
  for (const child of active.keys()) { try { killGroup(child, "SIGKILL"); } catch { failed = true; } child.stdout?.destroy(); child.stderr?.destroy(); }
  await Promise.race([Promise.all(active.values()), pause(1000)]);
  return !failed && active.size === 0;
}
async function command(label: string, executable: string, args: string[], cwd: string, milliseconds: number, env: NodeJS.ProcessEnv): Promise<CommandResult> {
  if (cancellation.signal.aborted) fail("cancelled");
  process.stderr.write(`Consumer step: ${label}\n`);
  return new Promise(resolveCommand => {
    const child = spawn(executable, args, { cwd, env, detached: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let closeOwned!: () => void;
    active.set(child, new Promise<void>(resolveClose => { closeOwned = resolveClose; }));
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    let stdoutBytes = 0, stderrBytes = 0, timedOut = false, cancelled = false, outputLimit = false, settled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined, settleTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (exit: number | null, signal: NodeJS.Signals | null, forcedSettlement = false) => {
      if (settled) return; settled = true;
      clearTimeout(timer); if (killTimer) clearTimeout(killTimer); if (settleTimer) clearTimeout(settleTimer);
      cancellation.signal.removeEventListener("abort", abort);
      resolveCommand({ label, exit, signal, timedOut, cancelled, outputLimit, forcedSettlement,
        stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), stdoutBytes, stderrBytes });
    };
    const stop = () => {
      if (killTimer || settled) return;
      try { killGroup(child, "SIGTERM"); } catch { finish(null, null, true); return; }
      killTimer = setTimeout(() => {
        try { killGroup(child, "SIGKILL"); } catch { finish(null, null, true); return; }
        child.stdout?.destroy(); child.stderr?.destroy();
      }, 1000);
      settleTimer = setTimeout(() => finish(child.exitCode, child.signalCode, true), 2500);
    };
    const abort = () => { cancelled = true; stop(); };
    const timer = setTimeout(() => { timedOut = true; stop(); }, milliseconds);
    const collect = (kind: "stdout" | "stderr", chunk: Buffer) => {
      const previous = kind === "stdout" ? stdoutBytes : stderrBytes;
      if (kind === "stdout") stdoutBytes += chunk.length; else stderrBytes += chunk.length;
      if (previous < STREAM_LIMIT) (kind === "stdout" ? stdout : stderr).push(chunk.subarray(0, STREAM_LIMIT - previous));
      if (previous + chunk.length > STREAM_LIMIT) { outputLimit = true; stop(); }
    };
    child.stdout?.on("data", (chunk: Buffer) => collect("stdout", chunk));
    child.stderr?.on("data", (chunk: Buffer) => collect("stderr", chunk));
    child.once("error", () => finish(null, null));
    child.once("close", (exit, signal) => { active.delete(child); closeOwned(); finish(exit, signal); });
    cancellation.signal.addEventListener("abort", abort, { once: true });
    if (cancellation.signal.aborted) abort();
  });
}
function receipt(result: CommandResult): CommandReceipt {
  const { stdout, stderr, ...rest } = result;
  return { ...rest, stdoutSha256: sha256(stdout), stderrSha256: sha256(stderr) };
}
async function checked(label: string, executable: string, args: string[], cwd: string, milliseconds: number,
                       env: NodeJS.ProcessEnv, results: CommandReceipt[]): Promise<Buffer> {
  const result = await command(label, executable, args, cwd, milliseconds, env);
  results.push(receipt(result));
  if (result.exit !== 0 || result.timedOut || result.cancelled || result.outputLimit || result.forcedSettlement) {
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
  return { writtenFiles: records.length, lockSha256: sha256(captured.bytes), sourceTreeSha256: sha256(JSON.stringify(records.sort((a, b) => a.path.localeCompare(b.path)))) };
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
async function scenario(mode: "copy" | "package", runner: string, workspace: string, archiveList: Archive[], entries: RegistryEntry[], compiler: string, license: Buffer): Promise<CaseResult> {
  const result: CaseResult = { name: mode, status: "failed", commands: [], writtenFiles: null, lockSha256: null, sourceTreeSha256: null, npmLockSha256: null, versions: null, teardown: "not_allocated" };
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
    result.npmLockSha256 = sha256((await boundedFile(join(root, "package-lock.json"), 4 * 1024 * 1024)).bytes);
    if (mode === "package") for (const archive of archiveList) {
      const installed = await jsonFile(join(root, "node_modules", archive.name, "package.json"), 128 * 1024);
      if (!object(installed) || installed.name !== archive.name || installed.version !== archive.version) fail("installed_package_mismatch");
      if (!(await boundedFile(join(root, "node_modules", archive.name, "LICENSE"), 128 * 1024)).bytes.equals(license)) fail("installed_license_mismatch");
      const current = await boundedFile(archive.path, 16 * 1024 * 1024);
      if (!stamped(current.stat, archive.stat) || sha256(current.bytes) !== archive.sha256) fail("archive_changed");
    }
    const cli = mode === "copy" ? join(workspace, "packages/cli/dist/index.js") : join(root, "node_modules/mcpcn/dist/index.js");
    await boundedFile(cli, 2 * 1024 * 1024);
    const source = pathToFileURL(join(workspace, "registry/items")).href;
    await checked(`${mode}:init`, process.execPath, [cli, "init", `--mode=${mode}`, `--style=${mode === "copy" ? "graphite" : "violet"}`, `--host=${mode === "copy" ? "standard-mcp" : "openai"}`, "--manager=npm", "--components-dir=src/mcpcn", `--registry=${source}`], root, 60_000, env, result.commands);
    await verifyConfig(root, mode, source);
    await checked(`${mode}:add-all-79`, process.execPath, [cli, "add", ...entries.map(item => item.name)], root, 60_000, env, result.commands);
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
    if (result.teardown === "failed") { result.status = "failed"; result.code = "cleanup_failed"; }
  }
  return result;
}
async function writeReport(path: string, runner: string, value: unknown) {
  const destination = resolve(path), parent = await realpath(dirname(destination));
  const relation = relative(runner, parent);
  if (relation.startsWith("..") || relation.startsWith(sep) || !/^[A-Za-z0-9_.-]+\.json$/.test(basename(destination))) fail("report_path_invalid");
  const file = await open(join(parent, basename(destination)), "wx", 0o600);
  try { await file.writeFile(JSON.stringify(value) + "\n"); await file.sync(); } finally { await file.close(); }
}
async function main() {
  const summary: { schemaVersion: number; kind: string; status: "passed" | "failed"; exit: 0 | 1; node: string; typescript: string; platform: string; licenseSha256?: string; preparation: CommandReceipt[]; archives: Array<{ name: string; version: string; sha256: string }>; cases: CaseResult[]; code?: string } = {
    schemaVersion: 1, kind: "mcpcn-consumer-checks", status: "failed", exit: 1, node: process.version, typescript: EXPECTED_TS, platform: process.platform, preparation: [], archives: [],
    cases: ["copy", "package"].map<CaseResult>(name => ({ name: name as "copy" | "package", status: "not_run", commands: [], writtenFiles: null, lockSha256: null, sourceTreeSha256: null, npmLockSha256: null, versions: null, teardown: "not_allocated" })),
  };
  let runner: string | undefined;
  const abort = () => cancellation.abort();
  process.once("SIGINT", abort); process.once("SIGTERM", abort);
  const overall = setTimeout(abort, 12 * 60_000);
  try {
    if (process.argv.length !== 3 || process.version !== EXPECTED_NODE || process.platform !== "linux" || process.env.CI !== "true" || !process.env.RUNNER_TEMP) fail("approved_environment_required");
    runner = await realpath(process.env.RUNNER_TEMP);
    const workspace = await realpath(fileURLToPath(new URL("../", import.meta.url))), tarballs = await realpath(process.argv[2]!);
    if (!(await lstat(runner)).isDirectory() || !(await lstat(tarballs)).isDirectory()) fail("input_directory_invalid");
    const version = await jsonFile(join(workspace, "node_modules/typescript/package.json"), 128 * 1024);
    if (!object(version) || version.version !== EXPECTED_TS) fail("typescript_version_changed");
    const compiler = join(workspace, "node_modules/typescript/lib/tsc.js");
    const license = (await boundedFile(join(workspace, "LICENSE"), 128 * 1024)).bytes;
    summary.licenseSha256 = sha256(license);
    const entries = await registry(workspace), archiveList = await archives(tarballs, workspace, license, summary.preparation);
    summary.archives = archiveList.map(({ name, version, sha256 }) => ({ name, version, sha256 }));
    summary.cases[0] = await scenario("copy", runner, workspace, archiveList, entries, compiler, license);
    if (!cancellation.signal.aborted) summary.cases[1] = await scenario("package", runner, workspace, archiveList, entries, compiler, license);
  } catch (error) { summary.code = error instanceof HarnessError ? error.code : "preparation_failed"; }
  finally {
    clearTimeout(overall); process.removeListener("SIGINT", abort); process.removeListener("SIGTERM", abort);
    if (!await drainChildren()) summary.code = "process_cleanup_failed";
  }
  summary.exit = summary.code || summary.cases.some(item => item.status !== "passed" || item.teardown !== "removed") ? 1 : 0;
  summary.status = summary.exit === 0 ? "passed" : "failed";
  if (process.env.MCPCN_CONSUMER_REPORT && runner) {
    try { await writeReport(process.env.MCPCN_CONSUMER_REPORT, runner, summary); }
    catch { summary.code = "report_write_failed"; summary.exit = 1; summary.status = "failed"; }
  }
  process.stdout.write(JSON.stringify(summary) + "\n");
  process.exitCode = summary.exit;
}

await main();

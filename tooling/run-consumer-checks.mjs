import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { gzipSync, gunzipSync } from "node:zlib";

const SEAL = "docs/results/2026/11-04/consumer-checks-source.json";
const ACTIVE = ".github/workflows/consumer-checks.yml";
const BRANCH = "qa/mcpcn-consumers-20261104";
const SCENARIOS = ["copy", "package"];
const LIFECYCLE_CASES = ["leader close keeps a surviving owned group through TERM and KILL", "repeated signals remain handled during cleanup and report"];
const PINS = { react: "19.2.8", "react-dom": "19.2.8", zod: "4.4.3", "@modelcontextprotocol/ext-apps": "1.7.5",
  "@modelcontextprotocol/sdk": "1.30.0", "@types/react": "19.2.18", "@types/react-dom": "19.2.4", typescript: "5.9.3" };
const PACKAGES = ["@mcpcn/core", "@mcpcn/schemas", "@mcpcn/runtime", "@mcpcn/react", "@mcpcn/themes", "@mcpcn/registry", "mcpcn"];
const STREAM_LIMIT = 131072, JSON_LIMIT = 524288, LOG_GZIP_LIMIT = 65536;
const hash = (data, algorithm = "sha256") => createHash(algorithm).update(data).digest("hex");
const requireThat = (value, code) => { if (!value) throw new Error(code); };
const codeOf = (error) => /^[a-z0-9_]+$/.test(error?.message ?? "") ? error.message : "controller_error";
const sourceCommit = process.argv[3];
requireThat(process.argv.length === 4 && process.argv[2] === "--source-commit" && /^[a-f0-9]{40}$/.test(sourceCommit ?? ""), "source_commit_required");
requireThat(process.env.GITHUB_ACTIONS === "true" && process.env.CI === "true" && process.env.GITHUB_REPOSITORY === "alvarovillalbaa/mcpcn-ui"
  && process.env.GITHUB_REF === "refs/heads/" + BRANCH && process.env.GITHUB_EVENT_NAME === "create"
  && process.env.MCPCN_CREATED_REF_TYPE === "branch" && process.env.MCPCN_PUBLIC_REPOSITORY === "true" && process.platform === "linux", "public_owned_branch_ci_required");
requireThat(process.version === "v24.21.0", "node_version_mismatch");
const repo = fs.realpathSync(process.cwd()), parent = fs.realpathSync(process.env.RUNNER_TEMP ?? "");
requireThat(path.isAbsolute(parent) && fs.statSync(parent).isDirectory(), "runner_temp_invalid");
const root = fs.mkdtempSync(path.join(parent, "mcpcn-consumers-")), identity = fs.lstatSync(root), nonce = randomUUID();
fs.writeFileSync(path.join(root, "owner"), nonce, { flag: "wx", mode: 0o600 });
for (const name of ["home", "tools-temp", "fixtures", "archives", "store", "cache", "config", "data", "state"]) fs.mkdirSync(path.join(root, name), { mode: 0o700 });
for (const name of ["npm-user", "npm-global"]) fs.writeFileSync(path.join(root, name), "", { flag: "wx", mode: 0o600 });
const env = {
  PATH: process.env.PATH, HOME: path.join(root, "home"), LANG: "C.UTF-8", TZ: "UTC", CI: "true", NO_COLOR: "1",
  TMPDIR: path.join(root, "tools-temp"), TMP: path.join(root, "tools-temp"), TEMP: path.join(root, "tools-temp"),
  XDG_CACHE_HOME: path.join(root, "cache"), XDG_CONFIG_HOME: path.join(root, "config"), XDG_DATA_HOME: path.join(root, "data"), XDG_STATE_HOME: path.join(root, "state"),
  npm_config_userconfig: path.join(root, "npm-user"), npm_config_globalconfig: path.join(root, "npm-global"),
  npm_config_cache: path.join(root, "cache"), npm_config_store_dir: path.join(root, "store"), npm_config_registry: "https://registry.npmjs.org/",
  npm_config_ignore_scripts: "true", npm_config_audit: "false", npm_config_fund: "false", npm_config_update_notifier: "false",
  NODE_COMPILE_CACHE: path.join(root, "cache", "node-compile-cache"),
  NEXT_TELEMETRY_DISABLED: "1", TURBO_TELEMETRY_DISABLED: "1",
};
const report = { schemaVersion: "mcpcn.installed-consumers.v1", sourceCommit, status: "failed", startedAtUtc: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  scope: { consumerScenarios: SCENARIOS, lifecycleCases: LIFECYCLE_CASES, selectedItemsPerConsumer: 79, packages: PACKAGES, generator: "tooling/generate.ts", docsBuild: true, packagePacking: true },
  commands: [], sourceGuards: [], errors: [],
  limits: { workSeconds: 900, cleanupSeconds: 60, cleanupCommandsSeconds: 58, finalReportSeconds: 2, jobMinutes: 20, streamBytes: STREAM_LIMIT, helperStdoutBytes: 524288,
    consumerRawBytes: 524288, consumerGzipBytes: 196608, lifecycleRawBytes: 131072, lifecycleGzipBytes: 32768,
    commandLogGzipBytes: LOG_GZIP_LIMIT, lifecycleHelperOuterSeconds: 40, consumerHelperWorkSeconds: 720, consumerHelperFinalReserveSeconds: 30, consumerHelperOuterSeconds: 750,
    consumerHelperRequiredRemainingSeconds: 756, termToKillSeconds: 3, postKillDrainSeconds: 3, reportBytes: JSON_LIMIT },
  helpers: [], proofLimits: ["Two lifecycle controls and two installed consumers are separate scopes; no prior 52-case rerun is included.",
    "Docs compilation, installed export targets and TypeScript consumers do not establish native browser/CSS runtime or live MCP/host behavior.",
    "No npm publication, hosted deployment, account, model/provider or production-data access is included. Direct consumer pins are exact; fresh transitive npm locks are recorded, not equated to the workspace graph.",
    "Typechecks retain skipLibCheck:true and do not prove every third-party declaration or runtime combination.",
    "Child exit/close and original process-group absence are checked; descendant PIDs or separate sessions are not independently inventoried.",
    "Only controller-owned scratch/config/store/temp is removed. Installed ignored workspace outputs and action-managed tools belong to the ephemeral runner; runner disposal is not independently observed.",
    "Executable file hashes do not inventory dynamic libraries. Userspace deadlines cannot interrupt a blocked kernel filesystem operation."] };
const workEnd = Date.now() + 900000;
let cleanupEnd = null, finalReportEnd = null, interrupted = false, manifest = null, compressedLogBytes = 0;
const handlers = new Map();
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  const handler = () => { interrupted = true; }; handlers.set(signal, handler); process.on(signal, handler);
}
function owner() {
  const stat = fs.lstatSync(root), marker = path.join(root, "owner");
  requireThat(path.dirname(root) === parent && stat.isDirectory() && !stat.isSymbolicLink() && stat.dev === identity.dev && stat.ino === identity.ino
    && !fs.lstatSync(marker).isSymbolicLink() && fs.readFileSync(marker, "utf8") === nonce, "scratch_identity_changed");
}
function clean(value, limit = 1200) {
  let text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
  text = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  for (const [from, to] of [[root, "[owned-scratch]"], [repo, "[repository]"], [process.env.HOME, "[runner-home]"]])
    if (from) text = text.split(from).join(to);
  return Buffer.from(text).subarray(0, limit).toString("utf8");
}
async function fileHash(file) {
  const digest = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}
function groupAbsent(pid) {
  try { process.kill(-pid, 0); return false; } catch (error) { return error.code === "ESRCH" ? true : null; }
}
async function run(label, executable, args, seconds, { cleanup = false, quiet = false, helperReport = null, allowFailure = false } = {}) {
  owner(); requireThat(cleanup || !interrupted, "interrupted_before_command");
  // Keep the entire escalation/drain window inside the work or cleanup budget.
  const remaining = (cleanup ? cleanupEnd : workEnd) - Date.now() - 6000;
  requireThat(remaining > 0, "command_deadline_exhausted");
  const commandEnv = { ...env };
  if (helperReport) Object.assign(commandEnv, { RUNNER_TEMP: path.join(root, "fixtures"), MCPCN_CONSUMER_REPORT: helperReport });
  const streamLimits = [helperReport ? 524288 : STREAM_LIMIT, STREAM_LIMIT];
  const child = spawn(executable, args, { cwd: repo, env: commandEnv, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const chunks = [[], []], counts = [0, 0], captured = [0, 0], digests = [createHash("sha256"), createHash("sha256")];
  let stop = null, exitCode = null, exitSignal = null, exited = false, closed = false, term = false, killed = false;
  let killTimer, drainTimer, poll, stopNow, stoppedAt = null;
  await new Promise((resolve) => {
    stopNow = (reason) => {
      if (stop) return;
      stop = reason; term = true; stoppedAt = Date.now();
      try { process.kill(-child.pid, "SIGTERM"); } catch {}
      killTimer = setTimeout(() => { killed = true; try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 3000);
      drainTimer = setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); resolve(); }, 6000);
    };
    [child.stdout, child.stderr].forEach((stream, i) => stream.on("data", (chunk) => {
      counts[i] += chunk.length; digests[i].update(chunk);
      const part = chunk.subarray(0, Math.max(0, streamLimits[i] - captured[i])); chunks[i].push(part); captured[i] += part.length;
      if (counts[i] > streamLimits[i]) stopNow("output_limit");
    }));
    child.once("error", () => { stop = "spawn_failed"; resolve(); });
    child.once("exit", (code, signal) => { exited = true; exitCode = code; exitSignal = signal; });
    child.once("close", () => { closed = true; resolve(); });
    const started = Date.now();
    poll = setInterval(() => { if (interrupted && !cleanup) stopNow("interrupted"); else if (Date.now() - started >= Math.min(seconds * 1000, remaining)) stopNow("timeout"); }, 25);
  });
  // A closed leader must not cancel escalation for a surviving owned group.
  if (child.pid && groupAbsent(child.pid) === false) {
    if (!stop) stopNow("process_group_remaining");
    while (groupAbsent(child.pid) === false && Date.now() < stoppedAt + 6000)
      await new Promise((resolve) => setTimeout(resolve, 25));
  }
  clearInterval(poll); clearTimeout(killTimer); clearTimeout(drainTimer);
  const output = chunks.map((parts) => Buffer.concat(parts));
  const row = { label, arguments: [executable === process.execPath ? "[node]" : path.isAbsolute(executable) ? "[pnpm]" : executable, ...args.map((arg) => clean(arg, 500))],
    exitCode, signal: exitSignal, stop, spawned: !!child.pid, exitObserved: exited, closeObserved: closed,
    originalProcessGroupAbsent: child.pid ? groupAbsent(child.pid) : true, termSent: term, killSent: killed,
    streams: output.map((data, i) => ({ stream: i ? "stderr" : "stdout", observedBytes: counts[i], capturedBytes: data.length,
      limitBytes: streamLimits[i], observedSha256: digests[i].digest("hex"), capturedSha256: hash(data), complete: closed && counts[i] === data.length,
      ...(quiet ? {} : { head: clean(data), tail: clean(data.subarray(Math.max(0, data.length - 1600)), 1600) }) })) };
  report.commands.push(row);
  if (!quiet) for (let i = 0; i < output.length; i++) {
    const gzip = gzipSync(output[i]); compressedLogBytes += gzip.length;
    requireThat(gzip.length <= 32768 && compressedLogBytes <= LOG_GZIP_LIMIT, "command_log_evidence_too_large");
    row.streams[i].raw = { encoding: "gzip-base64", compressedBytes: gzip.length, data: gzip.toString("base64") };
  }
  const passed = exitCode === 0 && exitSignal === null && stop === null && exited && closed && row.originalProcessGroupAbsent === true;
  requireThat(allowFailure || passed, label + "_failed");
  return { output, row, passed };
}
function boundedRead(file, limit) {
  const before = fs.lstatSync(file);
  requireThat(before.isFile() && !before.isSymbolicLink() && before.size <= limit, "bounded_file_invalid");
  const bytes = fs.readFileSync(file), after = fs.lstatSync(file);
  requireThat(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs
    && before.ctimeMs === after.ctimeMs && bytes.length === before.size, "file_changed_during_read");
  return bytes;
}
function safePath(name) {
  requireThat(typeof name === "string" && name !== "" && !path.isAbsolute(name) && !name.split("/").some((part) => ["", ".", ".."].includes(part)) && !/[\x00-\x1f\x7f\\]/.test(name), "source_path_invalid");
}
async function guard(label, cleanup = false) {
  const result = { label, passed: false, changedPaths: [] }; report.sourceGuards.push(result);
  const options = { cleanup, quiet: true };
  requireThat((await run(label + "_head", "git", ["rev-parse", "HEAD"], 10, options)).output[0].toString().trim() === sourceCommit, "source_head_changed");
  requireThat(!fs.existsSync(path.join(repo, ACTIVE)) && !fs.existsSync(path.join(repo, ".github/workflows/source-installation-52-checks.yml")), "active_workflow_in_preparation");
  const raw = boundedRead(path.join(repo, SEAL), 131072);
  const pinned = (await run(label + "_seal", "git", ["show", "HEAD:" + SEAL], 10, options)).output[0];
  requireThat(raw.equals(pinned) && (!report.sealSha256 || report.sealSha256 === hash(raw)), "seal_changed");
  manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)); report.sealSha256 = hash(raw);
  requireThat(manifest.schemaVersion === 1 && manifest.kind === "mcpcn-consumer-checks-source" && manifest.files.length === 316
    && manifest.fileCount === 316 && JSON.stringify(manifest.excludedPrefixes) === '["docs/results/"]', "seal_scope_invalid");
  requireThat(JSON.stringify(manifest.consumerScenarios) === JSON.stringify(SCENARIOS)
    && JSON.stringify(manifest.lifecycleCases) === JSON.stringify(LIFECYCLE_CASES), "case_scope_invalid");
  const indexRaw = (await run(label + "_index", "git", ["ls-files", "--stage", "-z"], 10, options)).output[0];
  const treeRaw = (await run(label + "_tree", "git", ["ls-tree", "-r", "-z", "HEAD"], 10, options)).output[0];
  const allIndex = new Map(), allTree = new Map();
  for (const row of indexRaw.toString().split("\0").filter(Boolean)) {
    const [header, name] = row.split("\t"), [mode, blob, stage] = header.split(" "); safePath(name);
    requireThat(stage === "0" && !allIndex.has(name), "unmerged_or_duplicate_index"); allIndex.set(name, { mode, blob });
  }
  for (const row of treeRaw.toString().split("\0").filter(Boolean)) {
    const [header, name] = row.split("\t"), [mode, type, blob] = header.split(" "); safePath(name);
    requireThat(type === "blob" && !allTree.has(name), "non_blob_or_duplicate_source"); allTree.set(name, { mode, blob });
  }
  result.indexedLeaves = allIndex.size;
  result.changedPaths = [...new Set([...allIndex.keys(), ...allTree.keys()])].filter((name) =>
    allIndex.get(name)?.mode !== allTree.get(name)?.mode || allIndex.get(name)?.blob !== allTree.get(name)?.blob);
  requireThat(allIndex.size === manifest.trackedFileCount && allTree.size === manifest.trackedFileCount && result.changedPaths.length === 0, "complete_index_changed");
  for (const [name, row] of allTree) {
    const stat = fs.lstatSync(path.join(repo, name)), bytes = boundedRead(path.join(repo, name), 16777216);
    const mode = stat.mode & 0o111 ? "100755" : "100644", blob = hash(Buffer.concat([Buffer.from("blob " + bytes.length + "\0"), bytes]), "sha1");
    if (mode !== row.mode || blob !== row.blob) result.changedPaths.push(name);
  }
  requireThat(result.changedPaths.length === 0, "complete_working_bytes_changed");
  const status = (await run(label + "_status", "git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], 10, options)).output[0];
  result.statusEntries = status.toString().split("\0").filter(Boolean).slice(0, 16).map((entry) => clean(entry, 240));
  requireThat(status.length === 0, "working_tree_not_clean");
  await run(label + "_working", "git", ["-c", "core.filemode=true", "diff", "--no-ext-diff", "--no-textconv", "--quiet", "--exit-code", "HEAD", "--"], 10, options);
  result.fullIndexMatchesHead = true; result.fullWorkingTreeClean = true; result.historicalResultsUnchanged = true;
  const source = new Map([...allTree].filter(([name]) => !name.startsWith("docs/results/")));
  const expected = new Map(manifest.files.map((row) => [row.path, row]));
  requireThat(expected.size === 316 && source.size === 316 && [...source.keys()].every((name) => expected.has(name)), "source_path_set_changed");
  let total = 0;
  for (const [name, row] of expected) {
    safePath(name); const data = boundedRead(path.join(repo, name), 16777216);
    if (source.get(name)?.mode !== row.mode || source.get(name)?.blob !== row.gitSha || data.length !== row.bytes || hash(data) !== row.sha256) result.changedPaths.push(name);
    total += data.length;
  }
  result.files = expected.size; result.sourceBytes = total; result.sealSha256 = hash(raw);
  requireThat(result.changedPaths.length === 0 && total === manifest.sourceBytes, "source_fingerprint_changed");
  report.sourceInputs = { path: SEAL, sha256: hash(raw), files: expected.size, bytes: total, trackedFileCount: allIndex.size };
  result.passed = true;
}
function phaseLogs(row, output) {
  for (let i = 0; i < output.length; i++) {
    const gzip = gzipSync(output[i]); compressedLogBytes += gzip.length;
    requireThat(gzip.length <= 32768 && compressedLogBytes <= LOG_GZIP_LIMIT, "command_log_evidence_too_large");
    row.streams[i].raw = { encoding: "gzip-base64", compressedBytes: gzip.length, data: gzip.toString("base64") };
  }
}
function archiveSnapshot() {
  owner(); const directory = path.join(root, "archives"), stat = fs.lstatSync(directory);
  requireThat(stat.isDirectory() && !stat.isSymbolicLink() && fs.realpathSync(directory) === directory, "archive_directory_invalid");
  const names = fs.readdirSync(directory).sort();
  requireThat(names.length === 7 && names.every((name) => /^[A-Za-z0-9_.-]+\.tgz$/.test(name)), "archive_file_set_invalid");
  return names.map((name) => { const data = boundedRead(path.join(directory, name), 16777216); return { file: name, bytes: data.length, sha256: hash(data) }; });
}
function commandPassed(command) {
  return command.exit === 0 && command.signal === null && !command.timedOut && !command.cancelled && !command.outputLimit
    && !command.forcedSettlement && command.spawned && command.exitObserved && command.closeObserved && command.originalProcessGroupAbsent === true
    && command.groupAfterLeaderClose === false && command.signalError === false;
}
function withoutRawPayloads(value) {
  return JSON.parse(JSON.stringify(value, (key, child) => key === "data" ? undefined : child));
}
function helperCommands(phase, value) {
  const names = phase === "consumers" ? SCENARIOS : LIFECYCLE_CASES;
  requireThat(value.schemaVersion === 1 && value.kind === (phase === "consumers" ? "mcpcn-consumer-checks" : "mcpcn-consumer-lifecycle-checks")
    && Array.isArray(value.cases) && value.cases.length === 2 && new Set(value.cases.map((entry) => entry.name)).size === 2
    && value.cases.every((entry) => names.includes(entry.name) && ["passed", "failed", "not_run"].includes(entry.status) && Array.isArray(entry.commands)), "helper_cleanup_schema_incomplete");
  requireThat(phase !== "consumers" || (Array.isArray(value.preparation) && value.cases.every((entry) => ["removed", "not_allocated"].includes(entry.teardown))), "consumer_teardown_unverified");
  requireThat(phase !== "lifecycle" || value.teardown === "removed", "lifecycle_teardown_unverified");
  return [...(value.preparation ?? []), ...value.cases.flatMap((entry) => entry.commands)];
}
function validateCommandStreams(commands) {
  let compressedBytes = 0;
  for (const command of commands) for (const name of ["stdout", "stderr"]) {
    const stream = command.streams?.[name];
    requireThat(stream && Number.isSafeInteger(stream.bytes) && stream.bytes >= 0 && stream.bytes <= 262144
      && stream.bytes === stream.capturedBytes && stream.complete === true && stream.sha256 === stream.observedSha256
      && stream.sha256 === command[name + "Sha256"] && stream.observedSha256 === command[name + "ObservedSha256"]
      && stream.bytes === command[name + "Bytes"], "helper_command_stream_incomplete");
    let bytes = Buffer.alloc(0);
    if (stream.bytes) {
      requireThat(stream.raw?.encoding === "gzip-base64" && typeof stream.raw.data === "string", "helper_command_raw_missing");
      const packed = Buffer.from(stream.raw.data, "base64"); compressedBytes += packed.length;
      requireThat(packed.toString("base64") === stream.raw.data && packed.length === stream.raw.compressedBytes
        && packed.length <= 32768 && compressedBytes <= 131072, "helper_command_gzip_limit");
      bytes = gunzipSync(packed, { maxOutputLength: 262144 });
    } else requireThat(stream.raw === undefined, "empty_helper_stream_has_payload");
    requireThat(bytes.length === stream.bytes && hash(bytes) === stream.sha256, "helper_command_raw_mismatch");
  }
}
function expectedExportTargets() {
  const expected = new Set();
  const leaves = (value) => typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(leaves) : [];
  for (const name of PACKAGES) {
    const directory = name === "mcpcn" ? "cli" : name.slice("@mcpcn/".length);
    const data = JSON.parse(boundedRead(path.join(repo, "packages", directory, "package.json"), 131072));
    for (const [value, isBin] of [[data.exports, false], [data.bin, true]]) for (const target of leaves(value)) {
      const file = target.replace(/^\.\//, ""); safePath(file);
      const kind = isBin ? "bin" : file.endsWith(".d.ts") ? "types" : file.endsWith(".css") ? "css" : file.endsWith(".js") ? "javascript" : null;
      requireThat(kind, "declared_export_kind_invalid"); expected.add(name + ":" + kind + ":" + file);
    }
  }
  return expected;
}
function validateConsumers(value) {
  requireThat(value.schemaVersion === 1 && value.kind === "mcpcn-consumer-checks" && value.status === "passed" && value.exit === 0
    && value.node === "v24.21.0" && value.typescript === "5.9.3" && value.platform === "linux" && value.interrupted === false
    && value.signalCount === 0 && Array.isArray(value.signals) && value.signals.length === 0
    && value.limits?.workSeconds === 720 && value.limits.finalCleanupReserveSeconds === 30, "consumer_summary_invalid");
  requireThat(value.licenseSha256 === hash(boundedRead(path.join(repo, "LICENSE"), 131072)), "consumer_license_invalid");
  requireThat(Array.isArray(value.archives) && value.archives.length === 7 && new Set(value.archives.map((entry) => entry.name)).size === 7
    && new Set(value.archives.map((entry) => entry.sha256)).size === 7
    && value.archives.every((entry) => PACKAGES.includes(entry.name) && entry.version === "0.1.0" && report.archives.some((file) => file.sha256 === entry.sha256)), "consumer_archives_invalid");
  requireThat(Array.isArray(value.preparation) && value.preparation.length === 14 && value.preparation.every(commandPassed), "consumer_archive_checks_failed");
  requireThat(Array.isArray(value.cases) && value.cases.length === 2 && new Set(value.cases.map((entry) => entry.name)).size === 2, "consumer_case_set_invalid");
  for (const entry of value.cases) {
    requireThat(SCENARIOS.includes(entry.name) && entry.status === "passed" && entry.teardown === "removed" && entry.selectedItems === 79, "consumer_case_failed");
    requireThat(entry.writtenFiles === (entry.name === "copy" ? 87 : 80) && [entry.lockSha256, entry.sourceTreeSha256, entry.npmLockSha256].every((digest) => /^[a-f0-9]{64}$/.test(digest ?? "")), "consumer_written_evidence_invalid");
    requireThat(JSON.stringify(Object.keys(entry.versions ?? {}).sort()) === JSON.stringify(Object.keys(PINS).sort())
      && Object.entries(PINS).every(([name, version]) => entry.versions[name] === version), "consumer_versions_invalid");
    requireThat(entry.compiler?.version === "5.9.3" && entry.compiler.entry === "node_modules/typescript/lib/tsc.js"
      && /^[a-f0-9]{64}$/.test(entry.compiler.sha256 ?? ""), "consumer_compiler_invalid");
    requireThat(entry.launcher?.kind === (entry.name === "copy" ? "workspace-node" : "installed-bin")
      && entry.launcher.ownedEntry === (entry.name === "package") && entry.launcher.realpathMatchesEntry === true && /^[a-f0-9]{64}$/.test(entry.launcher.entrySha256 ?? ""), "consumer_launcher_invalid");
    requireThat(Array.isArray(entry.commands) && entry.commands.length === 4 && entry.commands.every(commandPassed)
      && new Set(entry.commands.map((command) => command.label)).size === 4
      && ["install", "init", "add-all-79", "typecheck"].every((label) => entry.commands.some((command) => command.label === entry.name + ":" + label)), "consumer_command_set_invalid");
    if (entry.name === "copy") requireThat(entry.exportTargets === null && entry.stylesVerified?.length === 0, "copy_exports_invalid");
    else {
      const expected = expectedExportTargets();
      const actual = new Set(entry.exportTargets?.map((target) => target.package + ":" + target.kind + ":" + target.path));
      requireThat(Array.isArray(entry.exportTargets) && expected.size === 24 && entry.exportTargets.length === expected.size && actual.size === expected.size
        && [...expected].every((target) => actual.has(target))
        && entry.exportTargets.every((target) => PACKAGES.includes(target.package) && ["javascript", "types", "css", "bin"].includes(target.kind)
          && typeof target.path === "string" && Number.isSafeInteger(target.bytes) && target.bytes >= 0 && /^[a-f0-9]{64}$/.test(target.sha256 ?? ""))
        && entry.stylesVerified?.length === 2 && new Set(entry.stylesVerified).size === 2
        && ["@mcpcn/react/dist/styles.css", "@mcpcn/themes/dist/default.css"].every((file) => entry.stylesVerified.includes(file)), "package_exports_invalid");
      for (const [name, source] of [["@mcpcn/react", "packages/react/src/styles.css"], ["@mcpcn/themes", "packages/themes/src/default.css"]]) {
        const data = boundedRead(path.join(repo, source), 2097152), target = entry.exportTargets.find((item) => item.package === name && item.kind === "css");
        requireThat(target?.bytes === data.length && target.sha256 === hash(data), "packaged_style_evidence_mismatch");
      }
    }
  }
  report.consumers.exactScenarioSet = true;
}
function validateLifecycle(value) {
  requireThat(value.schemaVersion === 1 && value.kind === "mcpcn-consumer-lifecycle-checks" && value.status === "passed"
    && value.exit === 0 && value.node === "v24.21.0" && value.platform === "linux" && value.interrupted === true && value.authoredSignals === 3
    && value.signalCount === 3 && value.teardown === "removed" && value.limits?.workSeconds === 30
    && JSON.stringify(value.signals) === '[{"signal":"SIGTERM","phase":"cleanup"},{"signal":"SIGINT","phase":"cleanup"},{"signal":"SIGHUP","phase":"report"}]', "lifecycle_summary_invalid");
  requireThat(Array.isArray(value.cases) && value.cases.length === 2 && new Set(value.cases.map((entry) => entry.name)).size === 2
    && value.cases.every((entry) => LIFECYCLE_CASES.includes(entry.name) && entry.status === "passed"), "lifecycle_case_set_invalid");
  for (const entry of value.cases) requireThat(entry.commands.length === 1 && entry.commands[0].spawned && entry.commands[0].exitObserved
    && entry.commands[0].closeObserved && entry.commands[0].originalProcessGroupAbsent === true && entry.commands[0].termSent
    && entry.commands[0].killSent && entry.commands[0].signalError === false && entry.commands[0].timedOut === false
    && entry.commands[0].outputLimit === false && entry.commands[0].forcedSettlement === false, "lifecycle_command_cleanup_failed");
  const leader = value.cases.find((entry) => entry.name === LIFECYCLE_CASES[0]), interruptedCase = value.cases.find((entry) => entry.name === LIFECYCLE_CASES[1]);
  requireThat(leader.commands[0].label === "lifecycle:leader-close" && leader.commands[0].groupAfterLeaderClose === true
    && leader.commands[0].cancelled === false && leader.commands[0].exit === 0 && leader.commands[0].signal === null
    && leader.evidence?.leaderClosedWithOwnedGroup === true && leader.evidence.termAndKillObserved === true && leader.evidence.originalGroupAbsent === true,
  "leader_lifecycle_evidence_invalid");
  requireThat(interruptedCase.commands[0].label === "lifecycle:cleanup-interrupt" && interruptedCase.commands[0].cancelled === true
    && interruptedCase.evidence?.signalsDuringCleanup === 2 && interruptedCase.evidence.signalsDuringReport === 1
    && interruptedCase.evidence.commandCancelled === true && interruptedCase.evidence.originalGroupAbsent === true, "interrupt_lifecycle_evidence_invalid");
  report.lifecycle.exactCaseSet = true;
}
function readHelper(phase, result, file) {
  const target = phase === "consumers" ? (report.consumers = {}) : (report.lifecycle = {});
  const rawLimit = phase === "consumers" ? 524288 : 131072, gzipLimit = phase === "consumers" ? 196608 : 32768;
  try {
    const identity = fs.lstatSync(file), raw = boundedRead(file, rawLimit), gzip = gzipSync(raw);
    target.raw = { encoding: "gzip-base64", bytes: raw.length, sha256: hash(raw), compressedBytes: gzip.length };
    requireThat(gzip.length <= gzipLimit, "helper_report_gzip_limit"); target.raw.data = gzip.toString("base64");
    requireThat(raw.equals(result.output[0]), "helper_stdout_report_mismatch");
    result.row.streams[0].evidenceRef = phase + ".raw";
    phaseLogs({ streams: [result.row.streams[1]] }, [result.output[1]]);
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    target.summary = withoutRawPayloads(value); target.projectionNote = "Embedded gzip data is retained only in the lossless raw helper JSON.";
    // Helper children use separate groups; the outer helper group's exit is insufficient.
    const commands = helperCommands(phase, value); validateCommandStreams(commands);
    const safe = value.processCleanup?.verified === true && value.processCleanup.remainingCommands === 0
      && value.processCleanup.allOriginalGroupsAbsent === true && commands.every((command) => typeof command.spawned === "boolean"
        && (!command.spawned || (command.exitObserved === true && command.closeObserved === true && command.originalProcessGroupAbsent === true)));
    report.helpers.find((entry) => entry.phase === phase).cleanupVerified = safe;
    requireThat(safe, "nested_process_cleanup_unverified");
    // Remove this report leaf only after capture and acknowledged nested cleanup.
    const current = fs.lstatSync(file);
    requireThat(current.dev === identity.dev && current.ino === identity.ino && boundedRead(file, rawLimit).equals(raw), "helper_report_changed"); fs.unlinkSync(file);
    (phase === "consumers" ? validateConsumers : validateLifecycle)(value);
    requireThat(result.passed, phase + "_process_failed");
  } catch (error) {
    target.readError = codeOf(error);
    if (!result.row.streams[0].evidenceRef) try { phaseLogs(result.row, result.output); }
    catch (captureError) { target.captureError = codeOf(captureError); report.errors.push(codeOf(captureError)); }
    throw error;
  }
}
async function helper(phase, pnpmCli, args, seconds) {
  const file = path.join(root, "fixtures", phase + ".json"), ownership = { phase, started: false, cleanupVerified: false };
  report.helpers.push(ownership); let result;
  try {
    result = await run(phase, pnpmCli, ["exec", "tsx", "tooling/verify-consumers.ts", ...args], seconds,
      { helperReport: file, quiet: true, allowFailure: true });
  } finally { ownership.started = report.commands.findLast((entry) => entry.label === phase)?.spawned ?? false; }
  readHelper(phase, result, file);
}
try {
  await guard("before");
  report.runtime.executableSha256 = await fileHash(process.execPath);
  const pnpm = process.env.PATH.split(path.delimiter).map((directory) => path.join(directory, "pnpm")).find((file) => fs.existsSync(file));
  requireThat(pnpm, "pnpm_executable_missing");
  const pnpmCli = fs.realpathSync(pnpm); report.runtime.pnpmExecutableSha256 = await fileHash(pnpmCli);
  report.runtime.pnpm = (await run("pnpm_version", pnpmCli, ["--version"], 15)).output[0].toString().trim();
  requireThat(report.runtime.pnpm === "10.24.0", "pnpm_version_mismatch");
  await run("install", pnpmCli, ["install", "--frozen-lockfile", "--ignore-scripts", "--store-dir", path.join(root, "store"), "--reporter=append-only"], 360);
  await helper("lifecycle", pnpmCli, ["--lifecycle-checks"], 40);
  requireThat(fs.readdirSync(path.join(root, "fixtures")).length === 0, "lifecycle_fixture_cleanup_incomplete");
  for (const packageName of PACKAGES) await run("build_" + packageName.replace("@mcpcn/", ""), pnpmCli, ["--filter", packageName, "build"], 90);
  await guard("after_packages");
  await run("canonical_generator", pnpmCli, ["exec", "tsx", "tooling/generate.ts"], 90);
  await guard("after_generator");
  report.generator = { command: "pnpm exec tsx tooling/generate.ts", byteIdentical: true, checkedBy: "after_generator" };
  await run("docs_build", pnpmCli, ["--filter", "@mcpcn/docs", "build"], 180);
  await guard("after_docs");
  for (const directory of ["core", "schemas", "runtime", "react", "themes", "registry", "cli"])
    await run("pack_" + directory, pnpmCli, ["--dir", "packages/" + directory, "pack", "--pack-destination", path.join(root, "archives")], 30);
  report.archives = archiveSnapshot(); await guard("after_pack");
  // Reserve the helper's 12-minute work cap and bounded cleanup/report window.
  requireThat(workEnd - Date.now() >= 756000, "insufficient_consumer_helper_budget");
  await helper("consumers", pnpmCli, [path.join(root, "archives")], 750);
  requireThat(JSON.stringify(archiveSnapshot()) === JSON.stringify(report.archives), "archive_bytes_changed");

} catch (error) { report.errors.push(codeOf(error)); }
finally {
  finalReportEnd = Date.now() + 60000; cleanupEnd = finalReportEnd - 2000;
  try { await guard("after", true); } catch (error) { report.errors.push(codeOf(error)); }
  try {
    owner(); const entries = fs.readdirSync(path.join(root, "fixtures"));
    report.fixtures = { remainingEntries: entries.slice(0, 16).map((name) => clean(name, 160)), remainingCount: entries.length, passed: entries.length === 0 };
    requireThat(entries.length === 0, "fixture_cleanup_incomplete");
  } catch (error) { report.errors.push(codeOf(error)); }
  try {
    owner();
    requireThat(report.commands.every((row) => !row.spawned || (row.exitObserved && row.closeObserved && row.originalProcessGroupAbsent === true)), "process_cleanup_unverified");
    requireThat(report.helpers.every((entry) => !entry.started || entry.cleanupVerified) && report.fixtures?.passed, "nested_cleanup_or_fixture_state_unverified");
    let timer;
    try {
      await Promise.race([fs.promises.rm(root, { recursive: true, force: false, maxRetries: 0 }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("scratch_cleanup_timeout")), Math.max(1, cleanupEnd - Date.now())); })]);
    } finally { clearTimeout(timer); }
    requireThat(!fs.existsSync(root), "scratch_still_present"); report.scratchCleanup = "passed";
  } catch (error) { report.scratchCleanup = "failed"; report.errors.push(codeOf(error)); }
  if (interrupted) report.errors.push("interrupted");
}
report.completedAtUtc = new Date().toISOString(); report.interrupted = interrupted;
report.status = report.errors.length === 0 && report.lifecycle?.exactCaseSet && report.consumers?.exactScenarioSet && report.fixtures?.passed && report.scratchCleanup === "passed" ? "passed" : "failed";
let output = JSON.stringify(report);
if (Buffer.byteLength(output) > JSON_LIMIT) {
  report.errors.push("report_bound_exceeded"); report.status = "failed";
  for (const row of report.commands) for (const stream of row.streams) { delete stream.head; delete stream.tail; }
  output = JSON.stringify(report);
}
if (Buffer.byteLength(output) > JSON_LIMIT) {
  report.evidenceOmitted = "Gzip payloads omitted from this failed record to preserve bounded actual metadata.";
  for (const row of report.commands) for (const stream of row.streams) if (stream.raw) { delete stream.raw.data; stream.raw.payloadOmitted = true; }
  for (const phase of [report.lifecycle, report.consumers]) if (phase?.raw) { delete phase.raw.data; phase.raw.payloadOmitted = true; }
  output = JSON.stringify(report);
}
requireThat(Buffer.byteLength(output) <= JSON_LIMIT, "report_bound_exceeded");
function finishController(code) {
  for (const [signal, handler] of handlers) process.off(signal, handler);
  process.exit(code);
}
const outputTimer = setTimeout(() => { process.stdout.destroy(); finishController(1); }, Math.max(1, Math.min(2000, finalReportEnd - Date.now())));
process.stdout.write(output + "\n", (error) => {
  clearTimeout(outputTimer);
  finishController(!error && report.status === "passed" && !interrupted ? 0 : 1);
});

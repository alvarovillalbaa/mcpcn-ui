import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { gzipSync } from "node:zlib";

const SEAL = "docs/results/2026/11-04/source-installation-52-source.json";
const OLD_SEAL = "docs/results/2026/10-29/source-inventory.json";
const ACTIVE = ".github/workflows/source-installation-52-checks.yml";
const BRANCH = "qa/mcpcn-source-52-20261104";
const FILES = ["packages/registry/src/source-registry.test.ts", "packages/cli/src/installer.test.ts", "packages/react/src/blocks.test.tsx", "apps/docs/components/configurator.test.tsx"];
const SUITES = ["canonical source registry", "source installation CLI", "controlled workflow blocks", "installation configurator source"];
const PACKAGES = ["@mcpcn/core", "@mcpcn/schemas", "@mcpcn/runtime", "@mcpcn/react", "@mcpcn/themes", "@mcpcn/registry", "mcpcn"];
const STREAM_LIMIT = 131072, JSON_LIMIT = 262144, LOG_GZIP_LIMIT = 65536;
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
const root = fs.mkdtempSync(path.join(parent, "mcpcn-source52-")), identity = fs.lstatSync(root), nonce = randomUUID();
fs.writeFileSync(path.join(root, "owner"), nonce, { flag: "wx", mode: 0o600 });
for (const name of ["home", "tools-temp", "fixtures", "store", "cache", "config", "data", "state"]) fs.mkdirSync(path.join(root, name), { mode: 0o700 });
for (const name of ["npm-user", "npm-global"]) fs.writeFileSync(path.join(root, name), "", { flag: "wx", mode: 0o600 });
const env = {
  PATH: process.env.PATH, HOME: path.join(root, "home"), LANG: "C.UTF-8", TZ: "UTC", CI: "true", NO_COLOR: "1",
  TMPDIR: path.join(root, "tools-temp"), TMP: path.join(root, "tools-temp"), TEMP: path.join(root, "tools-temp"),
  XDG_CACHE_HOME: path.join(root, "cache"), XDG_CONFIG_HOME: path.join(root, "config"), XDG_DATA_HOME: path.join(root, "data"), XDG_STATE_HOME: path.join(root, "state"),
  npm_config_userconfig: path.join(root, "npm-user"), npm_config_globalconfig: path.join(root, "npm-global"),
  npm_config_cache: path.join(root, "cache"), npm_config_store_dir: path.join(root, "store"), npm_config_registry: "https://registry.npmjs.org/",
  npm_config_ignore_scripts: "true", npm_config_audit: "false", npm_config_fund: "false", npm_config_update_notifier: "false",
  NEXT_TELEMETRY_DISABLED: "1", TURBO_TELEMETRY_DISABLED: "1",
};
const report = { schemaVersion: "mcpcn.source-installation-52.v1", sourceCommit, status: "failed", startedAtUtc: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  scope: { expectedCases: 52, files: FILES, packages: PACKAGES, generator: "tooling/generate.ts", docsBuild: false, packagePacking: false, consumers: false },
  commands: [], sourceGuards: [], errors: [],
  limits: { workSeconds: 900, cleanupSeconds: 60, jobMinutes: 20, streamBytes: STREAM_LIMIT, rawVitestBytes: JSON_LIMIT,
    rawVitestGzipBytes: 65536, commandLogGzipBytes: LOG_GZIP_LIMIT, termToKillSeconds: 3, postKillDrainSeconds: 3, reportBytes: JSON_LIMIT },
  proofLimits: ["The 52 authored registry/CLI/SSR/captured-callback cases do not establish native browser events or live MCP/host behavior.",
    "No documentation app build, tarball packing, installed consumers, npm release, hosted deployment, account or model/provider call is included.",
    "Child exit/close and original process-group absence are checked; descendant PIDs or separate sessions are not independently inventoried.",
    "Only controller-owned scratch/config/store/temp is removed. Installed ignored workspace outputs and action-managed tools belong to the ephemeral runner; runner disposal is not independently observed.",
    "Executable file hashes do not inventory dynamic libraries. Userspace deadlines cannot interrupt a blocked kernel filesystem operation."] };
const workEnd = Date.now() + 900000;
let cleanupEnd = null, interrupted = false, manifest = null, compressedLogBytes = 0;
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
async function run(label, executable, args, seconds, { cleanup = false, quiet = false, fixture = false, allowFailure = false } = {}) {
  owner(); requireThat(cleanup || !interrupted, "interrupted_before_command");
  // Keep the entire escalation/drain window inside the work or cleanup budget.
  const remaining = (cleanup ? cleanupEnd : workEnd) - Date.now() - 6000;
  requireThat(remaining > 0, "command_deadline_exhausted");
  const commandEnv = { ...env };
  if (fixture) for (const key of ["TMPDIR", "TMP", "TEMP"]) commandEnv[key] = path.join(root, "fixtures");
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
      const part = chunk.subarray(0, Math.max(0, STREAM_LIMIT - captured[i])); chunks[i].push(part); captured[i] += part.length;
      if (counts[i] > STREAM_LIMIT) stopNow("output_limit");
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
      observedSha256: digests[i].digest("hex"), capturedSha256: hash(data), complete: closed && counts[i] === data.length,
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
  requireThat(!fs.existsSync(path.join(repo, ACTIVE)), "active_workflow_in_preparation");
  const raw = boundedRead(path.join(repo, SEAL), 131072);
  const pinned = (await run(label + "_seal", "git", ["show", "HEAD:" + SEAL], 10, options)).output[0];
  requireThat(raw.equals(pinned) && (!report.sealSha256 || report.sealSha256 === hash(raw)), "seal_changed");
  manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)); report.sealSha256 = hash(raw);
  requireThat(manifest.schemaVersion === 1 && manifest.kind === "mcpcn-source-installation-52-source" && manifest.files.length === 313
    && manifest.fileCount === 313 && JSON.stringify(manifest.excludedPrefixes) === '["docs/results/"]', "seal_scope_invalid");
  const old = JSON.parse(boundedRead(path.join(repo, OLD_SEAL), 131072));
  requireThat(old.source_files.length === 311 && old.literal_case_count === 52 && old.test_files.length === 4
    && manifest.testFiles.length === 4 && JSON.stringify(manifest.testFiles.map((file) => file.path)) === JSON.stringify(FILES)
    && JSON.stringify(manifest.testFiles.map((file) => file.names.length)) === "[12,16,12,12]", "case_scope_invalid");
  for (let i = 0; i < FILES.length; i++) requireThat(manifest.testFiles[i].suite === SUITES[i]
    && old.test_files[i].path === FILES[i] && JSON.stringify(manifest.testFiles[i].names) === JSON.stringify(old.test_files[i].case_names), "historical_case_set_changed");
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
  requireThat(expected.size === 313 && source.size === 313 && [...source.keys()].every((name) => expected.has(name)), "source_path_set_changed");
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
function parseVitest(file) {
  report.vitest = { raw: { available: false } };
  const raw = boundedRead(file, JSON_LIMIT), gzip = gzipSync(raw);
  Object.assign(report.vitest.raw, { available: true, encoding: "gzip-base64", bytes: raw.length, sha256: hash(raw), compressedBytes: gzip.length });
  requireThat(gzip.length <= 65536, "vitest_evidence_too_large"); report.vitest.raw.data = gzip.toString("base64");
  const actual = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  report.vitest.totals = Object.fromEntries(["numTotalTests", "numPassedTests", "numFailedTests", "numPendingTests", "numTodoTests", "success"].map((key) => [key, actual[key] ?? null]));
  requireThat(Array.isArray(actual.testResults) && actual.testResults.length === 4, "vitest_file_scope_changed");
  const cases = [], seen = new Set(); let valid = true;
  for (const fileResult of actual.testResults) {
    const name = path.isAbsolute(fileResult.name) ? path.relative(repo, fileResult.name) : fileResult.name;
    const expected = manifest.testFiles.find((entry) => entry.path === name);
    requireThat(expected && !seen.has(name) && Array.isArray(fileResult.assertionResults), "vitest_file_scope_changed"); seen.add(name);
    valid &&= fileResult.status === "passed";
    for (const item of fileResult.assertionResults) {
      cases.push({ file: name, title: item.title, fullName: item.fullName, status: item.status, retryCount: item.retryCount ?? 0,
        failureMessages: Array.isArray(item.failureMessages) ? item.failureMessages.slice(0, 2).map((message) => clean(message, 1200)) : [] });
      valid &&= item.status === "passed" && (item.retryCount === undefined || item.retryCount === 0);
      valid &&= !item.retryReasons?.length && expected.names.includes(item.title) && item.fullName === expected.suite + " " + item.title;
    }
  }
  const expectedNames = manifest.testFiles.flatMap((entry) => entry.names.map((name) => entry.suite + " " + name));
  const names = cases.map((entry) => entry.fullName);
  report.vitest.cases = cases;
  report.vitest.exactNameStatusSet = cases.length === 52 && new Set(names).size === 52 && expectedNames.length === 52 && new Set(expectedNames).size === 52
    && names.every((name) => expectedNames.includes(name)) && valid;
  report.vitest.orderingRequired = false;
  requireThat(report.vitest.exactNameStatusSet && actual.numTotalTests === 52 && actual.numPassedTests === 52 && actual.numFailedTests === 0
    && actual.numPendingTests === 0 && actual.numTodoTests === 0 && actual.success === true, "vitest_acceptance_failed");
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
  for (const packageName of PACKAGES) await run("build_" + packageName.replace("@mcpcn/", ""), pnpmCli, ["--filter", packageName, "build"], 90);
  await guard("after_build");
  await run("canonical_generator", pnpmCli, ["exec", "tsx", "tooling/generate.ts"], 90);
  await guard("after_generator");
  report.generator = { command: "pnpm exec tsx tooling/generate.ts", byteIdentical: true, checkedBy: "after_generator" };
  const unitFile = path.join(root, "unit.json");
  const tests = await run("tests", pnpmCli, ["exec", "vitest", "run", "--maxWorkers=1", "--no-file-parallelism", "--retry=0",
    "--reporter=verbose", "--reporter=json", "--outputFile=" + unitFile, ...FILES], 180, { fixture: true, allowFailure: true });
  parseVitest(unitFile); requireThat(tests.passed, "tests_failed");
} catch (error) { report.errors.push(codeOf(error)); }
finally {
  cleanupEnd = Date.now() + 60000;
  try { await guard("after", true); } catch (error) { report.errors.push(codeOf(error)); }
  try {
    owner(); const entries = fs.readdirSync(path.join(root, "fixtures"));
    report.fixtures = { remainingEntries: entries.slice(0, 16).map((name) => clean(name, 160)), remainingCount: entries.length, passed: entries.length === 0 };
    requireThat(entries.length === 0, "fixture_cleanup_incomplete");
  } catch (error) { report.errors.push(codeOf(error)); }
  try {
    owner();
    requireThat(report.commands.every((row) => !row.spawned || (row.exitObserved && row.closeObserved && row.originalProcessGroupAbsent === true)), "process_cleanup_unverified");
    let timer;
    try {
      await Promise.race([fs.promises.rm(root, { recursive: true, force: false, maxRetries: 0 }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("scratch_cleanup_timeout")), Math.max(1, cleanupEnd - Date.now())); })]);
    } finally { clearTimeout(timer); }
    requireThat(!fs.existsSync(root), "scratch_still_present"); report.scratchCleanup = "passed";
  } catch (error) { report.scratchCleanup = "failed"; report.errors.push(codeOf(error)); }
  if (interrupted) report.errors.push("interrupted");
  for (const [signal, handler] of handlers) process.off(signal, handler);
}
report.completedAtUtc = new Date().toISOString(); report.interrupted = interrupted;
report.status = report.errors.length === 0 && report.vitest?.exactNameStatusSet && report.fixtures?.passed && report.scratchCleanup === "passed" ? "passed" : "failed";
let output = JSON.stringify(report);
if (Buffer.byteLength(output) > JSON_LIMIT) {
  report.errors.push("report_bound_exceeded"); report.status = "failed";
  for (const row of report.commands) for (const stream of row.streams) { delete stream.head; delete stream.tail; }
  output = JSON.stringify(report);
}
requireThat(Buffer.byteLength(output) <= JSON_LIMIT, "report_bound_exceeded");
process.stdout.write(output + "\n", () => process.exit(report.status === "passed" ? 0 : 1));

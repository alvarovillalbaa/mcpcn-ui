// CI-owned T2 server; actual SDK/HTTP/SQLite, authored source adapter only.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startWorkbench } from "../examples/shared/src/workbench-host.js";
import { referenceDefinitions } from "../examples/definitions.js";
import { researchSources } from "../examples/research-workflow/src/contracts.js";

const root = process.env.MCPCN_RF_RUN_ROOT, output = process.env.MCPCN_RF_OUTPUT, width = process.env.MCPCN_RF_WIDTH, phase = process.env.MCPCN_RF_PHASE;
if (process.env.CI !== "true" || process.platform !== "linux" || !root || output !== path.join(root, "output") || !["1280", "390"].includes(width ?? "") || !["flow", "reload"].includes(phase ?? "")
  || fs.realpathSync(root) !== root || fs.lstatSync(root).uid !== process.getuid() || fs.readFileSync(path.join(root, ".owner"), "utf8") !== process.env.MCPCN_RF_NONCE) throw new Error("reference_fixture_owned_ci_required");
const messages: Array<{ workflow: string; direction: string; value: unknown }> = []; let bytes = 0, attempts = 0;
const profile = `reference-${phase}-${width}`;
const workbench = await startWorkbench({ workspace: path.join(root, `reference-workspace-${width}`), assets: fileURLToPath(new URL("../examples/dist/browser", import.meta.url)), port: 0, authoredChecks: true,
  definitions: referenceDefinitions({ readSource: async (url, signal) => {
    if (signal.aborted) throw new Error("Authored cancelled source");
    if (url === researchSources[1].url && ++attempts === 1) throw new Error("AUTHORED_PRIVATE_SOURCE_FAILURE");
    return "Authored check source for " + researchSources.find(source => source.url === url)!.title + "\n" + Array.from({ length: 70 }, (_, index) => `Authored evidence line ${index}: review exact terms and preserve server authorization.`).join("\n") + "\n<script>AUTHORED_TEXT_ONLY</script>\nAUTHORED_RESEARCH_SOURCE_END";
  } }),
  observe(workflow, direction, value) { const encoded = JSON.stringify(value); bytes += Buffer.byteLength(encoded); if (bytes > 8 * 1024 * 1024 || messages.length >= 1000) throw new Error("reference_fixture_protocol_bound"); messages.push({ workflow, direction, value }); },
});
fs.writeFileSync(path.join(output, profile + "-ready.json"), JSON.stringify({ sourceCommit: process.env.SOURCE_COMMIT, origin: workbench.origin, width: Number(width), phase, sourceMode: "authored-checks" }), { flag: "wx", mode: 0o600 });
process.stdout.write(JSON.stringify({ status: "ready", profile, origin: workbench.origin, sourceMode: "authored-checks" }) + "\n");
let closing = false;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(signal, () => {
  if (closing) return; closing = true;
  void workbench.close().then(() => {
    fs.writeFileSync(path.join(output, profile + "-protocol.json"), JSON.stringify({ sourceCommit: process.env.SOURCE_COMMIT, profile, messages, protocolBytes: bytes, closed: workbench.closed, workflows: 5,
      proofLimits: ["Real local SDK/HTTP/SQLite with authored sources. No external host, public source fetch, model, payment or account."] }), { flag: "wx", mode: 0o600 });
    process.stdout.write(JSON.stringify({ status: "closed", profile, closed: workbench.closed }) + "\n"); process.exitCode = workbench.closed ? 0 : 1;
  }).catch(() => { process.exitCode = 1; });
});

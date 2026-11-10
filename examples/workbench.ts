import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { startWorkbench } from "./shared/dist/workbench-host.js";
import { referenceDefinitions } from "./definitions.js";

const { values } = parseArgs({ options: { workspace: { type: "string" }, port: { type: "string", default: "4557" } }, strict: true });
if (!values.workspace || !/^[0-9]{1,5}$/.test(values.port!) || Number(values.port) < 1 || Number(values.port) > 65535) throw new Error("Supply --workspace /absolute/private/directory and an optional --port between 1 and 65535.");
const workbench = await startWorkbench({ workspace: values.workspace, port: Number(values.port), assets: fileURLToPath(new URL("./dist/browser", import.meta.url)), definitions: referenceDefinitions() });
process.stdout.write(`Reference workbench: ${workbench.origin}\nPer-launch access code: ${workbench.accessCode}\nRecords persist in the selected private workspace. Press Ctrl-C to close.\n`);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(signal, () => { void workbench.close().then(() => { process.exitCode = 0; }).catch(() => { process.exitCode = 1; }); });

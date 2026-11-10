import type { InstallationPlan } from "@mcpcn/registry/installation";
import { archiveInstallation, archiveRelease } from "../lib/release-installation";
import { InstallCommand } from "./install-command";

export function ArchiveSetup({ plan }: { plan: InstallationPlan }) {
  const commands = archiveInstallation(plan);
  if (!commands) return <div>
    <p role="status">Bun currently shows the prepared npm-package interface. Choose npm or pnpm for the checked GitHub archive installation.</p>
    <ol>
      <li><h3>Initialize your configuration</h3><pre className="code">{plan.initCommand}</pre></li>
      <li><h3>Install selected items</h3><pre className="code">{plan.addCommand}</pre></li>
      <li><h3>Install consumer dependencies</h3><pre className="code">{plan.dependencyCommand}</pre></li>
    </ol>
  </div>;
  return <div data-archive-release={archiveRelease.tag}>
    <p>Use Node 24 and an existing React 19.2 TypeScript app. These commands install the eight matching packages from the <a href={archiveRelease.releaseUrl}>checked GitHub release</a>, then run its local CLI. Public npm publication remains separate.</p>
    {plan.config.packageManager === "pnpm" && <p>For pnpm 10, the first block uses npm to record the release URLs and checked SDK/schema/type versions in your project's <code>pnpm.overrides</code>, then installs with pnpm. Review these project-local pins alongside your existing overrides.</p>}
    <ol style={{ paddingLeft: 24 }}>
      <li><h3>Install the matching release packages</h3><InstallCommand label="release packages" command={commands.bootstrap} /></li>
      <li><h3>Initialize your configuration</h3><InstallCommand label="initialization" command={commands.initialize} /></li>
      <li><h3>Add your selected items</h3><InstallCommand label="selected items" command={commands.add} /></li>
    </ol>
    <p className="mcpcn-hint">Step 1 installs the release and its consumer dependencies. The local CLI's generic registry dependency hint is already covered for this pinned release. Steps 2–3 prepare files and configuration; they do not create a framework app or connect a live host.</p>
    <details><summary>Review release archive hashes</summary><ul>{archiveRelease.packages.map(item => <li key={item.name}><code>{item.file}</code><br /><code style={{ overflowWrap: "anywhere" }}>{item.sha256}</code></li>)}</ul></details>
  </div>;
}

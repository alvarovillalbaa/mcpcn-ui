import { defaultConfig, type InstallationPlan } from "@mcpcn/registry/installation";
import release from "../data/archive-release.json";

export const archiveRelease = release;
export const archiveDefaultConfig = { ...defaultConfig, registry: release.registry };
export const localCli = "node node_modules/mcpcn/dist/index.js";

/** Keep validated owner flags/escaping while selecting the installed executable. */
export function archiveInstallation(plan: InstallationPlan) {
  const manager = plan.config.packageManager;
  if (manager === "bun") return null;
  const prefix = manager === "npm" ? "npx mcpcn" : "pnpm dlx mcpcn";
  const local = (command: string) => {
    if (!command.startsWith(prefix + " ")) throw new Error("Unexpected installation command.");
    return localCli + command.slice(prefix.length);
  };
  const dependencies = [...release.packages.map(item => `${release.assetBase}/${item.file}`), ...release.sourceDependencies,
    ...(plan.selected.some(item => item.kind === "block") ? [release.blockTypes] : [])];
  const args = [manager, manager === "npm" ? "install" : "add", "--ignore-scripts", "--save-exact",
    ...(manager === "npm" ? ["--no-audit", "--no-fund"] : [])];
  const install = args.join(" ") + " \\\n  " + dependencies.join(" \\\n  ");
  const publicPins = [...release.sourceDependencies, ...(plan.selected.some(item => item.kind === "block") ? [release.blockTypes] : [])];
  const pins = [...release.packages.map(item => `pnpm.overrides.${item.name}=${release.assetBase}/${item.file}`),
    ...publicPins.map(value => { const at = value.lastIndexOf("@"); return `pnpm.overrides.${value.slice(0, at)}=${value.slice(at + 1)}`; })];
  return {
    bootstrap: manager === "pnpm" ? "npm pkg set \\\n  " + pins.join(" \\\n  ") + "\n" + install : install,
    initialize: local(plan.initCommand),
    add: local(plan.addCommand),
  };
}

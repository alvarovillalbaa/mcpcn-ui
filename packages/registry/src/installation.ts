import type { CatalogItem } from "./catalog.js";

export type PackageManager = "npm" | "pnpm" | "bun";
export type InstallConfig = {
  $schema: string;
  mode: "copy" | "package";
  style: "default" | "graphite" | "violet";
  host: "auto" | "standard-mcp" | "openai";
  typescript: true;
  componentsDir: string;
  registry: string;
  packageManager: PackageManager;
};
type BlockItem = { name: string; components: readonly string[] };
export type InstallSelection = { slug: string; name: string; kind: "component" | "block" };
export type InstallationPlan = {
  config: InstallConfig;
  selected: InstallSelection[];
  itemNames: string[];
  initCommand: string;
  addCommand: string;
  dependencyCommand: string;
  providerSource: string;
  imports: string[];
};

const schemaURL = "https://raw.githubusercontent.com/alvarovillalbaa/mcpcn-ui/main/registry/config.schema.json";
export const defaultConfig: Readonly<InstallConfig> = Object.freeze({
  $schema: schemaURL,
  mode: "copy",
  style: "default",
  host: "auto",
  typescript: true,
  componentsDir: "components/mcpcn",
  registry: "https://raw.githubusercontent.com/alvarovillalbaa/mcpcn-ui/main/registry/items",
  packageManager: "pnpm",
});

const keys = new Set(Object.keys(defaultConfig));
const safeDirectory = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/;
const reservedFolders = ["node_modules", "vendor", "dist", "build"];
const reservedPattern = `(?:^|/)(?:${reservedFolders.map(word => [...word].map(letter => /[a-z]/.test(letter) ? `[${letter}${letter.toUpperCase()}]` : letter).join("")).join("|")})(?:/|$)`;
const registryPattern = "^(?:https?://[^\\s/@?#]+(?:/[^\\s?#]*)?|file://(?:localhost)?/[^\\s?#]+)$";
function invalid(message: string): never { throw new Error(message); }
function choice<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (typeof value !== "string" || !options.includes(value as T)) invalid(`Choose a supported ${label}.`);
  return value as T;
}

export function resolveInstallConfig(value: unknown): InstallConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Installation configuration must be an object.");
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some(key => !keys.has(key))) invalid("Installation configuration contains unsupported fields.");
  const config = { ...defaultConfig, ...raw };
  const mode = choice(config.mode, ["copy", "package"] as const, "installation mode");
  const style = choice(config.style, ["default", "graphite", "violet"] as const, "theme");
  const host = choice(config.host, ["auto", "standard-mcp", "openai"] as const, "host adapter");
  const packageManager = choice(config.packageManager, ["npm", "pnpm", "bun"] as const, "package manager");
  if (config.typescript !== true) invalid("This source installer currently supports TypeScript; JavaScript output is not available.");
  if (typeof config.componentsDir !== "string" || config.componentsDir.length > 240 || !safeDirectory.test(config.componentsDir)) {
    invalid("Choose a relative component directory containing ordinary directory names.");
  }
  if (config.componentsDir.split("/").some(part => reservedFolders.includes(part.toLowerCase()))) {
    invalid("Choose a source directory outside dependency and generated output folders.");
  }
  if (typeof config.registry !== "string" || config.registry.length > 2048 || /[\u0000-\u0020\u007f]/.test(config.registry)
    || !new RegExp(registryPattern).test(config.registry)) {
    invalid("Choose a registry URL without whitespace or credentials.");
  }
  try {
    const url = new URL(config.registry);
    if (!["https:", "http:", "file:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      invalid("Choose an HTTP(S) or local file registry without credentials, query or fragment.");
    }
    if (url.protocol === "file:" && url.hostname && url.hostname !== "localhost") invalid("File registries must be local.");
  } catch {
    invalid("Choose a valid HTTP(S) or local file registry URL.");
  }
  if (config.$schema !== schemaURL) invalid("Use the supported MCPCN configuration schema.");
  return { $schema: schemaURL, mode, style, host, typescript: true,
    componentsDir: config.componentsDir, registry: config.registry.replace(/\/+$/, ""), packageManager };
}

export function blockExportName(slug: string): string {
  return slug.split("-").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

function shellWord(value: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}
function runner(manager: PackageManager): string {
  return manager === "npm" ? "npx" : manager === "pnpm" ? "pnpm dlx" : "bunx";
}

export function renderProvider(value: unknown): string {
  const config = resolveInstallConfig(value);
  const source = config.mode === "copy" ? "./_mcpcn/runtime" : "@mcpcn/runtime";
  const factory = config.host === "auto" ? "detectAdapter()"
    : config.host === "standard-mcp" ? "new OfficialMCPAdapter()" : "new OpenAIAdapter()";
  const factoryImport = config.host === "auto" ? "detectAdapter"
    : config.host === "standard-mcp" ? "OfficialMCPAdapter" : "OpenAIAdapter";
  const styles = config.mode === "copy" ? 'import "./styles.css";'
    : 'import "@mcpcn/react/styles.css";\nimport "@mcpcn/themes/default.css";';
  return `"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AgentAppProvider, ${factoryImport}, type AgentAppAdapter } from ${JSON.stringify(source)};
${styles}

export function MCPCNProvider({ children }: { children: ReactNode }) {
  const [adapter, setAdapter] = useState<AgentAppAdapter | null>(null);
  useEffect(() => { setAdapter(${factory}); }, []);
  return <div className="mcpcn" data-mcpcn-theme=${JSON.stringify(config.style)}>
    {adapter ? <AgentAppProvider adapter={adapter}>{children}</AgentAppProvider>
      : <p role="status" aria-busy="true">Preparing app connection…</p>}
  </div>;
}
`;
}

export function buildInstallationPlan(value: unknown, names: string[], catalog: readonly CatalogItem[],
  blocks: readonly BlockItem[]): InstallationPlan {
  const config = resolveInstallConfig(value);
  if (!Array.isArray(names) || !names.length) invalid("Select at least one component or block.");
  if (names.length > catalog.length + blocks.length || names.some(name => typeof name !== "string" || !name)) {
    invalid("Select supported component or block names.");
  }
  const byName = new Map<string, InstallSelection>();
  for (const item of catalog) {
    const selection: InstallSelection = { slug: item.slug, name: item.name, kind: "component" };
    byName.set(item.slug, selection); byName.set(item.name.toLowerCase(), selection);
  }
  for (const block of blocks) byName.set(block.name, { slug: block.name, name: blockExportName(block.name), kind: "block" });
  const selected = names.map(name => {
    const item = byName.get(name.toLowerCase());
    if (!item) invalid("An installation item is not in the MCPCN catalog.");
    return { ...item };
  });
  if (new Set(selected.map(item => item.slug)).size !== selected.length) invalid("Select each component or block once.");
  const itemNames: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(name: string): void {
    const item = byName.get(name);
    if (!item) invalid("A registry dependency is missing from the catalog.");
    if (visiting.has(item.slug)) invalid("Registry dependencies contain a cycle.");
    if (visited.has(item.slug)) return;
    visiting.add(item.slug);
    const dependencies = item.kind === "component" ? catalog.find(entry => entry.slug === item.slug)?.registryDependencies ?? []
      : blocks.find(entry => entry.name === item.slug)?.components ?? [];
    dependencies.forEach(visit);
    visiting.delete(item.slug); visited.add(item.slug); itemNames.push(item.slug);
  }
  selected.forEach(item => visit(item.slug));
  const prefix = `${runner(config.packageManager)} mcpcn`;
  const initCommand = `${prefix} init --mode=${config.mode} --style=${config.style} --host=${config.host}`
    + ` --manager=${config.packageManager} --components-dir=${shellWord(config.componentsDir)} --registry=${shellWord(config.registry)}`;
  const dependencies = config.mode === "copy"
    ? ["zod@^4.4.0", "@modelcontextprotocol/ext-apps@1.7.5", "@modelcontextprotocol/sdk@1.30.0"]
    : ["@mcpcn/react", "@mcpcn/runtime", "@mcpcn/schemas", "@mcpcn/themes"];
  const dependencyCommand = `${config.packageManager} ${config.packageManager === "npm" ? "install" : "add"} ${dependencies.map(shellWord).join(" ")}`;
  const imports = [`import { MCPCNProvider } from ${JSON.stringify(`./${config.componentsDir}/provider`)};`,
    ...selected.map(item => `import { ${item.name} } from ${JSON.stringify(config.mode === "copy"
      ? `./${config.componentsDir}/${item.kind === "block" ? "blocks/" : ""}${item.slug}`
      : item.kind === "block" ? "@mcpcn/react/blocks" : "@mcpcn/react")};`)];
  return { config, selected, itemNames, initCommand, addCommand: `${prefix} add ${selected.map(item => item.slug).join(" ")}`,
    dependencyCommand, providerSource: renderProvider(config), imports };
}

export const configSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema", title: "MCPCN TypeScript installation configuration",
  type: "object", additionalProperties: false,
  properties: {
    $schema: { const: schemaURL }, mode: { enum: ["copy", "package"] },
    style: { enum: ["default", "graphite", "violet"] }, host: { enum: ["auto", "standard-mcp", "openai"] },
    typescript: { const: true }, componentsDir: { type: "string", maxLength: 240, pattern: safeDirectory.source, not: { pattern: reservedPattern } },
    registry: { type: "string", maxLength: 2048, format: "uri", pattern: registryPattern }, packageManager: { enum: ["npm", "pnpm", "bun"] },
  }, required: Object.keys(defaultConfig),
} as const;

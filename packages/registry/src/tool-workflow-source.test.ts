import { readFile } from "node:fs/promises";
import { posix } from "node:path";
import { describe, expect, it } from "vitest";
import { GenericComponentSchema, schemaBySlug, toJSONSchema } from "@mcpcn/schemas";
import { blockCatalog, catalog } from "./catalog.js";
import { componentDataSchema } from "./component-schemas.js";
import { defaultConfig, renderProvider } from "./installation.js";
import { buildSourceRegistry, sourceModulePaths } from "./source-registry.js";

const root = new URL("../../../", import.meta.url);
const readSource = (path: string) => readFile(new URL(path, root), "utf8");
const build = (read = readSource) => buildSourceRegistry({ catalog, blockCatalog, readSource: read, providerSource: renderProvider(defaultConfig) });
const cohort = [["tool-result-card", "ToolResultCard"], ["running-task-card", "RunningTaskCard"], ["partial-result-viewer", "PartialResultViewer"], ["queued-step-list", "QueuedStepList"], ["tool-trace-viewer", "ToolTraceViewer"]] as const;
const modules = [["packages/schemas/src/tool-workflow-schemas.ts", "tool-workflow-schemas.ts"], ["packages/react/src/tool-workflow-components.tsx", "tool-workflow-components.tsx"]] as const;
const namespaces: Record<string, string> = { "@mcpcn/core": "./core", "@mcpcn/schemas": "./schemas", "@mcpcn/react": "./components", "@mcpcn/runtime": "./runtime" };
const adapt = (value: string) => value.replace(/(["'])(@mcpcn\/(?:core|schemas|react|runtime))\1/g, (_match, quote: string, name: string) => `${quote}${namespaces[name]}${quote}`);

describe("tool workflow cohort canonical registry integration", () => {
  it("preserves all 79 identities with 35 specialized components and 21 remaining aliases", async () => {
    const { registry, items } = await build();
    expect(items.map(item => item.name)).toEqual([...catalog.map(item => item.slug), ...blockCatalog.map(item => item.name)]);
    expect(new Set(items.map(item => item.name)).size).toBe(79); expect(registry.items).toBe(items);
    expect(items.filter(item => item.meta.implementation === "specialized")).toHaveLength(41);
    expect(items.filter(item => item.meta.implementation === "generic-alias")).toHaveLength(15);
    for (const [slug] of cohort) expect(items.find(item => item.name === slug)?.meta.implementation).toBe("specialized");
  });
  it("publishes five dedicated strict data schemas instead of generic card schemas", () => {
    for (const [slug] of cohort) {
      expect(schemaBySlug[slug]).not.toBe(GenericComponentSchema);
      expect(componentDataSchema(slug)).toEqual(toJSONSchema(schemaBySlug[slug]));
      expect(componentDataSchema(slug)).toMatchObject({ type: "object", additionalProperties: false });
    }
  });
  it("appends both actual owner modules after the existing sixteen source modules", async () => {
    const { items } = await build(); expect(sourceModulePaths).toHaveLength(30);
    expect(sourceModulePaths.slice(14, 18)).toEqual(["_mcpcn/approval-schemas.ts", "_mcpcn/approval-components.tsx", "_mcpcn/tool-workflow-schemas.ts", "_mcpcn/tool-workflow-components.tsx"]);
    for (const item of items) for (const [path, target] of modules) {
      expect(item.files.find(file => file.path === `components/mcpcn/_mcpcn/${target}`)?.content).toBe(adapt(await readSource(path)));
      expect((item.meta.provenance as { sourceFiles: string[] }).sourceFiles).toContain(path);
    }
  });
  it("exports each dedicated implementation through the copied component entry", async () => {
    const { items } = await build(), implementation = await readSource("packages/react/src/tool-workflow-components.tsx");
    for (const [slug, name] of cohort) {
      const item = items.find(item => item.name === slug)!;
      expect(item.files.find(file => file.path === `components/mcpcn/${slug}.tsx`)?.content).toContain(`export { ${name} }`);
      expect(implementation).toMatch(new RegExp(`export function ${name}\\(`));
      expect(item.meta.dataSchema).toEqual(componentDataSchema(slug));
    }
    expect(implementation).not.toContain("GenericAgentComponent");
  });
  it("resolves the current 24 module closure with 28 component 29 block and 107 union files", async () => {
    const { items } = await build(), union = new Set<string>();
    for (const item of items) {
      expect(item.files).toHaveLength(item.type === "registry:block" ? 35 : 34);
      const paths = new Set(item.files.map(file => file.path));
      for (const source of item.files) {
        union.add(source.path); expect(source.content).not.toContain("@mcpcn/");
        if (source.type === "registry:style") continue;
        for (const match of source.content.matchAll(/\bfrom\s*["'](\.[^"']+)["']/g)) {
          const path = posix.normalize(posix.join(posix.dirname(source.path), match[1]!)), stem = path.replace(/\.js$/, "");
          expect([path, `${stem}.ts`, `${stem}.tsx`].some(value => paths.has(value))).toBe(true);
        }
      }
    }
    expect(union.size).toBe(113);
  });
  it("declares raw result part and trace details private with no direct tool execution", () => {
    for (const [slug] of cohort) {
      const item = catalog.find(item => item.slug === slug)!;
      expect(item.security.callsTools).toEqual([]); expect(item.security.destructive).toBe(false);
      expect(item.security.modelVisible.length).toBeGreaterThan(0);
    }
    expect(catalog.find(item => item.slug === "tool-result-card")!.security.privateOnly).toContain("result");
    expect(catalog.find(item => item.slug === "partial-result-viewer")!.security.privateOnly).toContain("parts.value");
    expect(catalog.find(item => item.slug === "tool-trace-viewer")!.security.privateOnly).toContain("events.details");
    expect(catalog.find(item => item.slug === "tool-call-card")!.security.callsTools).toEqual(["configuredTool"]);
  });
  it("refuses missing owner modules and imports outside the declared source closure", async () => {
    for (const [missing] of modules) await expect(build(path => path === missing ? Promise.resolve("") : readSource(path))).rejects.toThrow("registry_source_invalid");
    for (const replacement of ['export { missing } from "./missing-tool-workflow.js";', 'export { missing } from "unreviewed-tool-workflow-package";']) {
      await expect(build(path => path === "packages/react/src/tool-workflow-components.tsx" ? Promise.resolve(replacement) : readSource(path))).rejects.toThrow("registry_source_invalid");
    }
  });
});

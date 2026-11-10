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
const cohort = [["missing-data-request", "MissingDataRequest"], ["multi-step-form", "MultiStepForm"], ["inline-edit-form", "InlineEditForm"], ["form-progress-card", "FormProgressCard"], ["validated-field-list", "ValidatedFieldList"]] as const;
const modules = [["packages/schemas/src/form-workflow-schemas.ts", "form-workflow-schemas.ts"], ["packages/react/src/form-workflow-components.tsx", "form-workflow-components.tsx"]] as const;
const namespaces: Record<string, string> = { "@mcpcn/core": "./core", "@mcpcn/schemas": "./schemas", "@mcpcn/react": "./components", "@mcpcn/runtime": "./runtime" };
const adapt = (value: string) => value.replace(/(["'])(@mcpcn\/(?:core|schemas|react|runtime))\1/g, (_match, quote: string, name: string) => `${quote}${namespaces[name]}${quote}`);

describe("form workflow cohort canonical registry integration", () => {
  it("preserves all 79 identities with 35 specialized components and 21 honest aliases", async () => {
    const { registry, items } = await build();
    expect(items.map(item => item.name)).toEqual([...catalog.map(item => item.slug), ...blockCatalog.map(item => item.name)]);
    expect(new Set(items.map(item => item.name)).size).toBe(79); expect(registry.items).toBe(items);
    expect(items.filter(item => item.meta.implementation === "specialized")).toHaveLength(52);
    expect(items.filter(item => item.meta.implementation === "generic-alias")).toHaveLength(4);
    for (const [slug] of cohort) expect(items.find(item => item.name === slug)?.meta.implementation).toBe("specialized");
  });
  it("publishes five dedicated strict form schemas instead of generic informational contracts", () => {
    for (const [slug] of cohort) {
      expect(schemaBySlug[slug]).not.toBe(GenericComponentSchema);
      expect(componentDataSchema(slug)).toEqual(toJSONSchema(schemaBySlug[slug]));
      expect(componentDataSchema(slug)).toMatchObject({ type: "object", additionalProperties: false });
    }
  });
  it("appends both actual form owner modules after the unchanged eighteen-module source closure", async () => {
    const { items } = await build(); expect(sourceModulePaths).toHaveLength(34);
    expect(sourceModulePaths.slice(16, 20)).toEqual(["_mcpcn/tool-workflow-schemas.ts", "_mcpcn/tool-workflow-components.tsx", "_mcpcn/form-workflow-schemas.ts", "_mcpcn/form-workflow-components.tsx"]);
    for (const item of items) for (const [path, target] of modules) {
      expect(item.files.find(file => file.path === `components/mcpcn/_mcpcn/${target}`)?.content).toBe(adapt(await readSource(path)));
      expect((item.meta.provenance as { sourceFiles: string[] }).sourceFiles).toContain(path);
    }
  });
  it("exports every dedicated form implementation and its public schema through copied entries", async () => {
    const { items } = await build(), implementation = await readSource("packages/react/src/form-workflow-components.tsx");
    for (const [slug, name] of cohort) {
      const item = items.find(item => item.name === slug)!;
      expect(item.files.find(file => file.path === `components/mcpcn/${slug}.tsx`)?.content).toContain(`export { ${name} }`);
      expect(implementation).toMatch(new RegExp(`export function ${name}\\(`));
      expect(item.meta.dataSchema).toEqual(componentDataSchema(slug));
    }
    expect(implementation).not.toContain("GenericAgentComponent");
  });
  it("resolves 24 modules with 28 component 29 block and 107 union files", async () => {
    const { items } = await build(), union = new Set<string>();
    for (const item of items) {
      expect(item.files).toHaveLength(item.type === "registry:block" ? 37 : 36);
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
    expect(union.size).toBe(117);
  });
  it("declares current identities and reported state separately from private input without tool execution", () => {
    for (const [slug] of cohort) {
      const item = catalog.find(item => item.slug === slug)!;
      expect(item.security.callsTools).toEqual([]); expect(item.security.destructive).toBe(false);
      expect(item.security.modelVisible).toContain("id");
      expect(item.security.modelVisible).not.toContain("values"); expect(item.security.modelVisible).not.toContain("fields.value");
    }
    expect(catalog.find(item => item.slug === "missing-data-request")!.security.privateOnly).toContain("knownFields.value");
    expect(catalog.find(item => item.slug === "multi-step-form")!.security.privateOnly).toContain("values");
    expect(catalog.find(item => item.slug === "inline-edit-form")!.security.privateOnly).toContain("changes.value");
    expect(catalog.find(item => item.slug === "validated-field-list")!.security.privateOnly).toContain("fields.value");
    expect(catalog.find(item => item.slug === "tool-call-card")!.security.callsTools).toEqual(["configuredTool"]);
  });
  it("refuses missing form owner modules and undeclared copied-source imports", async () => {
    for (const [missing] of modules) await expect(build(path => path === missing ? Promise.resolve("") : readSource(path))).rejects.toThrow("registry_source_invalid");
    for (const replacement of ['export { missing } from "./missing-form-workflow.js";', 'export { missing } from "unreviewed-form-workflow-package";']) {
      await expect(build(path => path === "packages/react/src/form-workflow-components.tsx" ? Promise.resolve(replacement) : readSource(path))).rejects.toThrow("registry_source_invalid");
    }
  });
});

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
const cohort = [["source-list", "SourceList"], ["evidence-drawer", "EvidenceDrawer"]] as const;
const modules = [["packages/schemas/src/source-evidence-schemas.ts", "source-evidence-schemas.ts"], ["packages/react/src/source-evidence-components.tsx", "source-evidence-components.tsx"]] as const;
const namespaces: Record<string, string> = { "@mcpcn/core": "./core", "@mcpcn/schemas": "./schemas", "@mcpcn/react": "./components", "@mcpcn/runtime": "./runtime" };
const adapt = (value: string) => value.replace(/(["'])(@mcpcn\/(?:core|schemas|react|runtime))\1/g, (_match, quote: string, name: string) => `${quote}${namespaces[name]}${quote}`);

describe("source evidence canonical registry integration", () => {
  it("SE-R01 preserves all79 identities with35 specialized and21 honest aliases", async () => {
    const { registry, items } = await build();
    expect(items.map(item => item.name)).toEqual([...catalog.map(item => item.slug), ...blockCatalog.map(item => item.name)]);
    expect(new Set(items.map(item => item.name)).size).toBe(79); expect(registry.items).toBe(items);
    expect(items.filter(item => item.meta.implementation === "specialized")).toHaveLength(37);
    expect(items.filter(item => item.meta.implementation === "generic-alias")).toHaveLength(19);
  });
  it("SE-R02 publishes strict actual four-state schemas instead of aliases", () => {
    for (const [slug] of cohort) {
      expect(schemaBySlug[slug]).not.toBe(GenericComponentSchema);
      expect(componentDataSchema(slug)).toEqual(toJSONSchema(schemaBySlug[slug]));
      const schema = componentDataSchema(slug)!, variants = (schema.oneOf ?? schema.anyOf) as unknown[];
      expect(variants).toHaveLength(4);
      for (const variant of variants) expect(variant).toMatchObject({ type: "object", additionalProperties: false });
    }
  });
  it("SE-R03 appends the two real owners after the unchanged22-module closure", async () => {
    const { items } = await build(); expect(sourceModulePaths).toHaveLength(26);
    expect(sourceModulePaths.slice(20, 24)).toEqual(["_mcpcn/file-review-schemas.ts", "_mcpcn/file-review-components.tsx", "_mcpcn/source-evidence-schemas.ts", "_mcpcn/source-evidence-components.tsx"]);
    for (const item of items) for (const [path, target] of modules) {
      expect(item.files.find(file => file.path === `components/mcpcn/_mcpcn/${target}`)?.content).toBe(adapt(await readSource(path)));
      expect((item.meta.provenance as { sourceFiles: string[] }).sourceFiles).toContain(path);
    }
  });
  it("SE-R04 exports both implementations and schemas through actual copied public entries", async () => {
    const { items } = await build(), implementation = await readSource("packages/react/src/source-evidence-components.tsx");
    const publicReact = await readSource("packages/react/src/index.tsx");
    for (const [slug, name] of cohort) {
      const item = items.find(item => item.name === slug)!;
      expect(item.files.find(file => file.path === `components/mcpcn/${slug}.tsx`)?.content).toContain(`export { ${name} }`);
      expect(implementation).toMatch(new RegExp(`export function ${name}\\(`));
      expect(publicReact).not.toMatch(new RegExp(`${name}\\s*=\\s*GenericAgentComponent`));
      expect(item.meta.dataSchema).toEqual(componentDataSchema(slug));
    }
    expect(implementation).not.toContain("GenericAgentComponent");
  });
  it("SE-R05 resolves24 modules with28 component29 block and107 union files", async () => {
    const { items } = await build(), union = new Set<string>();
    for (const item of items) {
      expect(item.files).toHaveLength(item.type === "registry:block" ? 31 : 30);
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
    expect(union.size).toBe(109);
  });
  it("SE-R06 keeps supplied claims URLs content messages and presentation private without tool calls", () => {
    for (const [slug] of cohort) {
      const item = catalog.find(item => item.slug === slug)!;
      expect(item.security.callsTools).toEqual([]); expect(item.security.destructive).toBe(false);
      expect(item.security.modelVisible).toEqual(slug === "source-list" ? ["id", "revision", "state", "sources.id", "sources.revision", "selectedSourceId"] : ["id", "revision", "state", "source.id", "source.revision"]);
      for (const field of ["title", "description", "message", slug === "source-list" ? "sources.url" : "source.url"]) expect(item.security.privateOnly).toContain(field);
    }
    for (const field of ["content", "content.text", "content.value", "open", "localPresentation"]) expect(catalog.find(item => item.slug === "evidence-drawer")!.security.privateOnly).toContain(field);
  });
  it("SE-R07 refuses missing owner bytes and undeclared copied imports", async () => {
    for (const [missing] of modules) await expect(build(path => path === missing ? Promise.resolve("") : readSource(path))).rejects.toThrow("registry_source_invalid");
    for (const replacement of ['export { missing } from "./missing-evidence.js";', 'export { missing } from "unreviewed-evidence-package";']) await expect(build(path => path === "packages/react/src/source-evidence-components.tsx" ? Promise.resolve(replacement) : readSource(path))).rejects.toThrow("registry_source_invalid");
  });
});

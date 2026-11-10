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
const cohort = [["record-inspector", "RecordInspector"], ["field-confidence-list", "FieldConfidenceList"]] as const;
const modules = [["packages/schemas/src/record-inspection-schemas.ts", "record-inspection-schemas.ts"], ["packages/react/src/record-inspection-components.tsx", "record-inspection-components.tsx"]] as const;
const namespaces: Record<string, string> = { "@mcpcn/core": "./core", "@mcpcn/schemas": "./schemas", "@mcpcn/react": "./components", "@mcpcn/runtime": "./runtime" };
const adapt = (value: string) => value.replace(/(["'])(@mcpcn\/(?:core|schemas|react|runtime))\1/g, (_match, quote: string, name: string) => `${quote}${namespaces[name]}${quote}`);

describe("record inspection source installation", () => {
  it("RI-R01 preserves79 identities with37 specialized and19 honest aliases", async () => {
    const { registry, items } = await build();
    expect(items.map(item => item.name)).toEqual([...catalog.map(item => item.slug), ...blockCatalog.map(item => item.name)]);
    expect(new Set(items.map(item => item.name)).size).toBe(79);
    expect(registry.items).toBe(items);
    expect(items.filter(item => item.meta.implementation === "specialized")).toHaveLength(48);
    expect(items.filter(item => item.meta.implementation === "generic-alias")).toHaveLength(8);
  });
  it("RI-R02 exports actual strict four-state JSON schemas rather than informational aliases", () => {
    for (const [slug] of cohort) {
      expect(schemaBySlug[slug]).not.toBe(GenericComponentSchema);
      const schema = componentDataSchema(slug)!;
      expect(schema).toEqual(toJSONSchema(schemaBySlug[slug]));
      const variants = (schema.oneOf ?? schema.anyOf) as Array<Record<string, unknown>>;
      expect(variants).toHaveLength(4);
      for (const variant of variants) expect(variant).toMatchObject({ type: "object", additionalProperties: false });
    }
  });
  it("RI-R03 appends both exact owner bodies after all24 existing copied modules", async () => {
    const { items } = await build();
    expect(sourceModulePaths).toHaveLength(32);
    expect(sourceModulePaths.slice(22, 26)).toEqual(["_mcpcn/source-evidence-schemas.ts", "_mcpcn/source-evidence-components.tsx", "_mcpcn/record-inspection-schemas.ts", "_mcpcn/record-inspection-components.tsx"]);
    for (const item of items) for (const [path, target] of modules) {
      expect(item.files.find(file => file.path === `components/mcpcn/_mcpcn/${target}`)?.content).toBe(adapt(await readSource(path)));
      expect((item.meta.provenance as { sourceFiles: string[] }).sourceFiles).toContain(path);
    }
  });
  it("RI-R04 copies both dedicated implementations and real public schema exports", async () => {
    const { items } = await build(), implementation = await readSource("packages/react/src/record-inspection-components.tsx");
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
  it("RI-R05 resolves all26 owners in30/31 payloads and109 installed source paths", async () => {
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
    expect(union.size).toBe(115);
  });
  it("RI-R06 keeps supplied values confidence evidence labels and local selection private", () => {
    for (const [slug] of cohort) {
      const item = catalog.find(item => item.slug === slug)!, prefix = slug === "record-inspector" ? "record.fields" : "fields";
      expect(item.security.callsTools).toEqual([]); expect(item.security.destructive).toBe(false);
      for (const field of ["title", "description", "message", "localSelection", `${prefix}.label`, `${prefix}.value`, `${prefix}.confidence`, `${prefix}.evidence`]) {
        expect(item.security.privateOnly).toContain(field); expect(item.security.modelVisible).not.toContain(field);
      }
      for (const field of ["id", "revision", "state", `${prefix}.id`, `${prefix}.revision`, "selectedFieldId"]) expect(item.security.modelVisible).toContain(field);
    }
  });
  it("RI-R07 refuses missing new owners and unresolved or undeclared copied imports", async () => {
    for (const [missing] of modules) await expect(build(path => path === missing ? Promise.resolve("") : readSource(path))).rejects.toThrow("registry_source_invalid");
    for (const replacement of ['export { missing } from "./missing-inspection.js";', 'export { missing } from "unreviewed-inspection-package";']) {
      await expect(build(path => path === "packages/react/src/record-inspection-components.tsx" ? Promise.resolve(replacement) : readSource(path))).rejects.toThrow("registry_source_invalid");
    }
  });
  it("RI-R08 preserves complete immutable canonical index bodies across repeated owner generation", async () => {
    const first = await build(), second = await build();
    expect(first).toEqual(second); expect(first.registry.items).toBe(first.items);
    for (const item of first.items) {
      expect(Object.isFrozen(item)).toBe(true); expect(Object.isFrozen(item.files)).toBe(true);
      expect(Object.isFrozen(item.meta)).toBe(true);
    }
  });
});

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
const cohort = [["document-preview", "DocumentPreview"], ["file-review", "FileReview"]] as const;
const modules = [["packages/schemas/src/file-review-schemas.ts", "file-review-schemas.ts"], ["packages/react/src/file-review-components.tsx", "file-review-components.tsx"]] as const;
const namespaces: Record<string, string> = { "@mcpcn/core": "./core", "@mcpcn/schemas": "./schemas", "@mcpcn/react": "./components", "@mcpcn/runtime": "./runtime" };
const adapt = (value: string) => value.replace(/(["'])(@mcpcn\/(?:core|schemas|react|runtime))\1/g, (_match, quote: string, name: string) => `${quote}${namespaces[name]}${quote}`);

describe("file review canonical registry integration", () => {
  it("preserves all 79 identities with 35 specialized components and 21 honest aliases", async () => {
    const { registry, items } = await build();
    expect(items.map(item => item.name)).toEqual([...catalog.map(item => item.slug), ...blockCatalog.map(item => item.name)]);
    expect(new Set(items.map(item => item.name)).size).toBe(79); expect(registry.items).toBe(items);
    expect(items.filter(item => item.meta.implementation === "specialized")).toHaveLength(41);
    expect(items.filter(item => item.meta.implementation === "generic-alias")).toHaveLength(15);
  });
  it("publishes actual strict schemas instead of generic informational contracts", () => {
    for (const [slug] of cohort) {
      expect(schemaBySlug[slug]).not.toBe(GenericComponentSchema);
      expect(componentDataSchema(slug)).toEqual(toJSONSchema(schemaBySlug[slug]));
      const schema = componentDataSchema(slug)!;
      if (slug === "file-review") expect(schema).toMatchObject({ type: "object", additionalProperties: false });
      else {
        const variants = (schema.oneOf ?? schema.anyOf) as unknown[];
        expect(variants).toHaveLength(5);
        for (const variant of variants) expect(variant).toMatchObject({ type: "object", additionalProperties: false });
      }
    }
  });
  it("appends the two actual owners after the unchanged twenty-module closure", async () => {
    const { items } = await build(); expect(sourceModulePaths).toHaveLength(30);
    expect(sourceModulePaths.slice(18, 22)).toEqual(["_mcpcn/form-workflow-schemas.ts", "_mcpcn/form-workflow-components.tsx", "_mcpcn/file-review-schemas.ts", "_mcpcn/file-review-components.tsx"]);
    for (const item of items) for (const [path, target] of modules) {
      expect(item.files.find(file => file.path === `components/mcpcn/_mcpcn/${target}`)?.content).toBe(adapt(await readSource(path)));
      expect((item.meta.provenance as { sourceFiles: string[] }).sourceFiles).toContain(path);
    }
  });
  it("exports both real implementations and their strict public schemas through copied entries", async () => {
    const { items } = await build(), implementation = await readSource("packages/react/src/file-review-components.tsx");
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
  it("declares private file representations and reviewed values without autonomous tools", () => {
    for (const [slug] of cohort) {
      const item = catalog.find(item => item.slug === slug)!;
      expect(item.security.callsTools).toEqual([]); expect(item.security.destructive).toBe(false);
      expect(item.security.modelVisible).toContain("file.id"); expect(item.security.modelVisible).not.toContain("values");
      expect(item.security.privateOnly).toContain("file.name"); expect(item.security.privateOnly).toContain("file.mimeType");
    }
    expect(catalog.find(item => item.slug === "document-preview")!.security.privateOnly).toContain("content.pages");
    for (const path of ["preview", "extraction.fields.original", "extraction.fields.value", "extraction.fields.evidence", "values"]) expect(catalog.find(item => item.slug === "file-review")!.security.privateOnly).toContain(path);
  });
  it("refuses missing owners and undeclared copied-source imports", async () => {
    for (const [missing] of modules) await expect(build(path => path === missing ? Promise.resolve("") : readSource(path))).rejects.toThrow("registry_source_invalid");
    for (const replacement of ['export { missing } from "./missing-file-review.js";', 'export { missing } from "unreviewed-file-review-package";']) await expect(build(path => path === "packages/react/src/file-review-components.tsx" ? Promise.resolve(replacement) : readSource(path))).rejects.toThrow("registry_source_invalid");
  });
});

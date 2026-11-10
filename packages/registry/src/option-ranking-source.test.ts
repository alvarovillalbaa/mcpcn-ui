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
const cohort = [["option-selector", "OptionSelector"], ["ranking-list", "RankingList"]] as const;
const modules = [["packages/schemas/src/option-ranking-schemas.ts", "option-ranking-schemas.ts"], ["packages/react/src/option-ranking-components.tsx", "option-ranking-components.tsx"]] as const;
const namespaces: Record<string, string> = { "@mcpcn/core": "./core", "@mcpcn/schemas": "./schemas", "@mcpcn/react": "./components", "@mcpcn/runtime": "./runtime" };
const adapt = (value: string) => value.replace(/(["'])(@mcpcn\/(?:core|schemas|react|runtime))\1/g, (_match, quote: string, name: string) => `${quote}${namespaces[name]}${quote}`);

describe("supplied option and ranking installation", () => {
  it("OR-R01 preserves79 identities with41 specialized and15 honest aliases", async () => {
    const { registry, items } = await build();
    expect(items.map(item => item.name)).toEqual([...catalog.map(item => item.slug), ...blockCatalog.map(item => item.name)]);
    expect(new Set(items.map(item => item.name)).size).toBe(79); expect(registry.items).toBe(items);
    expect(items.filter(item => item.meta.implementation === "specialized")).toHaveLength(48);
    expect(items.filter(item => item.meta.implementation === "generic-alias")).toHaveLength(8);
  });
  it("OR-R02 exports strict supplied option and reported ranking four-state schemas", () => {
    for (const [slug] of cohort) {
      expect(schemaBySlug[slug]).not.toBe(GenericComponentSchema);
      const schema = componentDataSchema(slug)!;
      expect(schema).toEqual(toJSONSchema(schemaBySlug[slug]));
      const variants = (schema.oneOf ?? schema.anyOf) as Array<Record<string, unknown>>;
      expect(variants).toHaveLength(4);
      for (const variant of variants) expect(variant).toMatchObject({ type: "object", additionalProperties: false });
    }
  });
  it("OR-R03 appends exact owner bodies after the existing28 copied modules", async () => {
    const { items } = await build(); expect(sourceModulePaths).toHaveLength(32);
    expect(sourceModulePaths.slice(26, 30)).toEqual(["_mcpcn/conflict-validation-schemas.ts", "_mcpcn/conflict-validation-components.tsx", "_mcpcn/option-ranking-schemas.ts", "_mcpcn/option-ranking-components.tsx"]);
    for (const item of items) for (const [path, target] of modules) {
      expect(item.files.find(file => file.path === `components/mcpcn/_mcpcn/${target}`)?.content).toBe(adapt(await readSource(path)));
      expect((item.meta.provenance as { sourceFiles: string[] }).sourceFiles).toContain(path);
    }
  });
  it("OR-R04 copies both dedicated public implementations with their strict schemas", async () => {
    const { items } = await build(), implementation = await readSource("packages/react/src/option-ranking-components.tsx"), publicReact = await readSource("packages/react/src/index.tsx");
    for (const [slug, name] of cohort) {
      const item = items.find(item => item.name === slug)!;
      expect(item.files.find(file => file.path === `components/mcpcn/${slug}.tsx`)?.content).toContain(`export { ${name} }`);
      expect(implementation).toMatch(new RegExp(`export function ${name}\\(`));
      expect(publicReact).not.toMatch(new RegExp(`${name}\\s*=\\s*GenericAgentComponent`));
      expect(item.meta.dataSchema).toEqual(componentDataSchema(slug));
    }
    expect(implementation).not.toContain("GenericAgentComponent");
  });
  it("OR-R05 resolves all30 owners in34 or35 payloads and113 installed paths", async () => {
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
  it("OR-R06 keeps option values and supplied ranks and scores private without tool authority", () => {
    for (const [slug] of cohort) {
      const item = catalog.find(item => item.slug === slug)!, option = slug === "option-selector", owner = option ? "group" : "list", stem = option ? "group.options" : "list.entries";
      expect(item.security.callsTools).toEqual([]); expect(item.security.destructive).toBe(false);
      for (const field of ["title", "description", "message", "localSelection", "notificationFeedback", `${owner}.label`, `${stem}.label`, `${stem}.value`, `${stem}.confidence`, `${stem}.evidence`, ...(option ? [] : [`${stem}.rank`, `${stem}.score`, `${stem}.scoreLabel`])]) {
        expect(item.security.privateOnly).toContain(field); expect(item.security.modelVisible).not.toContain(field);
      }
      for (const field of ["id", "revision", "state", `${owner}.id`, `${owner}.revision`, `${stem}.id`, `${stem}.revision`, option ? "selectedOptionId" : "selectedEntryId"]) expect(item.security.modelVisible).toContain(field);
    }
  });
  it("OR-R07 refuses absent new owners and undeclared or unresolved copied imports", async () => {
    for (const [missing] of modules) await expect(build(path => path === missing ? Promise.resolve("") : readSource(path))).rejects.toThrow("registry_source_invalid");
    for (const replacement of ['export { missing } from "./missing-option.js";', 'export { missing } from "unreviewed-ranking-package";']) await expect(build(path => path === "packages/react/src/option-ranking-components.tsx" ? Promise.resolve(replacement) : readSource(path))).rejects.toThrow("registry_source_invalid");
  });
  it("OR-R08 preserves complete immutable index bodies across repeated owner generation", async () => {
    const first = await build(), second = await build(); expect(first).toEqual(second); expect(first.registry.items).toBe(first.items);
    for (const item of first.items) { expect(Object.isFrozen(item)).toBe(true); expect(Object.isFrozen(item.files)).toBe(true); expect(Object.isFrozen(item.meta)).toBe(true); }
  });
});

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
const cohort = [["conflict-resolver", "ConflictResolver"], ["validation-summary", "ValidationSummary"]] as const;
const modules = [["packages/schemas/src/conflict-validation-schemas.ts", "conflict-validation-schemas.ts"], ["packages/react/src/conflict-validation-components.tsx", "conflict-validation-components.tsx"]] as const;
const namespaces: Record<string, string> = { "@mcpcn/core": "./core", "@mcpcn/schemas": "./schemas", "@mcpcn/react": "./components", "@mcpcn/runtime": "./runtime" };
const adapt = (value: string) => value.replace(/(["'])(@mcpcn\/(?:core|schemas|react|runtime))\1/g, (_match, quote: string, name: string) => `${quote}${namespaces[name]}${quote}`);

describe("conflict choices and validation report installation", () => {
  it("CV-R01 preserves79 identities with39 specialized and17 honest aliases", async () => {
    const { registry, items } = await build();
    expect(items.map(item => item.name)).toEqual([...catalog.map(item => item.slug), ...blockCatalog.map(item => item.name)]);
    expect(new Set(items.map(item => item.name)).size).toBe(79); expect(registry.items).toBe(items);
    expect(items.filter(item => item.meta.implementation === "specialized")).toHaveLength(41);
    expect(items.filter(item => item.meta.implementation === "generic-alias")).toHaveLength(15);
  });
  it("CV-R02 exports strict current conflict and reported validation four-state schemas", () => {
    for (const [slug] of cohort) {
      expect(schemaBySlug[slug]).not.toBe(GenericComponentSchema);
      const schema = componentDataSchema(slug)!;
      expect(schema).toEqual(toJSONSchema(schemaBySlug[slug]));
      const variants = (schema.oneOf ?? schema.anyOf) as Array<Record<string, unknown>>;
      expect(variants).toHaveLength(4);
      for (const variant of variants) expect(variant).toMatchObject({ type: "object", additionalProperties: false });
    }
  });
  it("CV-R03 appends exact owner bodies after the existing26 copied modules", async () => {
    const { items } = await build(); expect(sourceModulePaths).toHaveLength(30);
    expect(sourceModulePaths.slice(24, 28)).toEqual(["_mcpcn/record-inspection-schemas.ts", "_mcpcn/record-inspection-components.tsx", "_mcpcn/conflict-validation-schemas.ts", "_mcpcn/conflict-validation-components.tsx"]);
    for (const item of items) for (const [path, target] of modules) {
      expect(item.files.find(file => file.path === `components/mcpcn/_mcpcn/${target}`)?.content).toBe(adapt(await readSource(path)));
      expect((item.meta.provenance as { sourceFiles: string[] }).sourceFiles).toContain(path);
    }
  });
  it("CV-R04 copies both dedicated public implementations with their strict schemas", async () => {
    const { items } = await build(), implementation = await readSource("packages/react/src/conflict-validation-components.tsx"), publicReact = await readSource("packages/react/src/index.tsx");
    for (const [slug, name] of cohort) {
      const item = items.find(item => item.name === slug)!;
      expect(item.files.find(file => file.path === `components/mcpcn/${slug}.tsx`)?.content).toContain(`export { ${name} }`);
      expect(implementation).toMatch(new RegExp(`export function ${name}\\(`));
      expect(publicReact).not.toMatch(new RegExp(`${name}\\s*=\\s*GenericAgentComponent`));
      expect(item.meta.dataSchema).toEqual(componentDataSchema(slug));
    }
    expect(implementation).not.toContain("GenericAgentComponent");
  });
  it("CV-R05 resolves all28 owners in32 or33 payloads and111 installed paths", async () => {
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
  it("CV-R06 keeps candidate values and issue report contents private without tool authority", () => {
    for (const [slug] of cohort) {
      const item = catalog.find(item => item.slug === slug)!, conflict = slug === "conflict-resolver", owner = conflict ? "conflict" : "report", stem = conflict ? "conflict.candidates" : "report.issues";
      expect(item.security.callsTools).toEqual([]); expect(item.security.destructive).toBe(false);
      for (const field of ["title", "description", "message", "localSelection", `${owner}.label`, `${stem}.label`, `${stem}.evidence`, ...(conflict ? [`${stem}.value`, `${stem}.confidence`, "confirmationFeedback"] : ["report.reportedStatus", `${stem}.severity`, `${stem}.message`, `${stem}.context`])]) {
        expect(item.security.privateOnly).toContain(field); expect(item.security.modelVisible).not.toContain(field);
      }
      for (const field of ["id", "revision", "state", `${owner}.id`, `${owner}.revision`, `${stem}.id`, `${stem}.revision`, conflict ? "selectedCandidateId" : "selectedIssueId"]) expect(item.security.modelVisible).toContain(field);
    }
  });
  it("CV-R07 refuses absent new owners and undeclared or unresolved copied imports", async () => {
    for (const [missing] of modules) await expect(build(path => path === missing ? Promise.resolve("") : readSource(path))).rejects.toThrow("registry_source_invalid");
    for (const replacement of ['export { missing } from "./missing-conflict.js";', 'export { missing } from "unreviewed-validation-package";']) await expect(build(path => path === "packages/react/src/conflict-validation-components.tsx" ? Promise.resolve(replacement) : readSource(path))).rejects.toThrow("registry_source_invalid");
  });
  it("CV-R08 preserves complete immutable index bodies across repeated owner generation", async () => {
    const first = await build(), second = await build(); expect(first).toEqual(second); expect(first.registry.items).toBe(first.items);
    for (const item of first.items) { expect(Object.isFrozen(item)).toBe(true); expect(Object.isFrozen(item.files)).toBe(true); expect(Object.isFrozen(item.meta)).toBe(true); }
  });
});

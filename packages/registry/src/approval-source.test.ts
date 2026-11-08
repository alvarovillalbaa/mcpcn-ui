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
const cohort = [["approval-checklist", "ApprovalChecklist"], ["before-submit-confirmation", "BeforeSubmitConfirmation"], ["destructive-action-guard", "DestructiveActionGuard"], ["human-override-panel", "HumanOverridePanel"], ["permission-request-card", "PermissionRequestCard"]] as const;
const modules = [["packages/schemas/src/approval-schemas.ts", "approval-schemas.ts"], ["packages/react/src/approval-components.tsx", "approval-components.tsx"]] as const;
const namespaces: Record<string, string> = { "@mcpcn/core": "./core", "@mcpcn/schemas": "./schemas", "@mcpcn/react": "./components", "@mcpcn/runtime": "./runtime" };
const adapt = (value: string) => value.replace(/(["'])(@mcpcn\/(?:core|schemas|react|runtime))\1/g, (_match, quote: string, name: string) => `${quote}${namespaces[name]}${quote}`);

describe("approval cohort canonical registry integration", () => {
  it("keeps all 79 identities while promoting only the five approval aliases", async () => {
    const { registry, items } = await build();
    expect(items.map(item => item.name)).toEqual([...catalog.map(item => item.slug), ...blockCatalog.map(item => item.name)]);
    expect(new Set(items.map(item => item.name)).size).toBe(79); expect(registry.items).toBe(items);
    expect(items.filter(item => item.meta.implementation === "specialized")).toHaveLength(31);
    expect(items.filter(item => item.meta.implementation === "generic-alias")).toHaveLength(25);
    for (const [slug] of cohort) expect(items.find(item => item.name === slug)?.meta.implementation).toBe("specialized");
  });
  it("publishes five dedicated canonical schemas rather than the generic contract", () => {
    for (const [slug] of cohort) {
      expect(schemaBySlug[slug]).not.toBe(GenericComponentSchema);
      expect(componentDataSchema(slug)).toEqual(toJSONSchema(schemaBySlug[slug]));
      expect(componentDataSchema(slug)).toMatchObject({ type: "object", additionalProperties: false });
    }
  });
  it("copies the two actual approval modules and their provenance into every item", async () => {
    const { items } = await build(); expect(sourceModulePaths).toHaveLength(20);
    for (const item of items) {
      for (const [path, target] of modules) {
        expect(item.files.find(file => file.path === `components/mcpcn/_mcpcn/${target}`)?.content).toBe(adapt(await readSource(path)));
        expect((item.meta.provenance as { sourceFiles: string[] }).sourceFiles).toContain(path);
      }
    }
  });
  it("exports all five real implementations through the copied component entry", async () => {
    const { items } = await build(), implementation = await readSource("packages/react/src/approval-components.tsx");
    for (const [slug, name] of cohort) {
      const item = items.find(item => item.name === slug)!;
      expect(item.files.find(file => file.path === `components/mcpcn/${slug}.tsx`)?.content).toContain(`export { ${name} }`);
      expect(implementation).toMatch(new RegExp(`export function ${name}\\(`));
      expect(implementation).not.toContain("GenericAgentComponent");
      expect(item.meta.dataSchema).toEqual(componentDataSchema(slug));
    }
  });
  it("resolves approval imports within the complete eighteen module closure", async () => {
    const { items } = await build();
    for (const item of items) {
      const paths = new Set(item.files.map(file => file.path));
      for (const target of ["schemas.ts", "components.tsx", "approval-schemas.ts", "approval-components.tsx"]) {
        const source = item.files.find(file => file.path === `components/mcpcn/_mcpcn/${target}`)!;
        expect(source.content).not.toContain("@mcpcn/");
        for (const match of source.content.matchAll(/\bfrom\s*["'](\.[^"']+)["']/g)) {
          const path = posix.normalize(posix.join(posix.dirname(source.path), match[1]!)), stem = path.replace(/\.js$/, "");
          expect([path, `${stem}.ts`, `${stem}.tsx`].some(value => paths.has(value))).toBe(true);
        }
      }
    }
  });
  it("fails closed for absent approval modules or undeclared approval imports", async () => {
    for (const [missing] of modules) await expect(build(path => path === missing ? Promise.resolve("") : readSource(path))).rejects.toThrow("registry_source_invalid");
    for (const replacement of ['export { missing } from "./missing-approval.js";', 'export { missing } from "unreviewed-approval-package";']) {
      await expect(build(path => path === "packages/react/src/approval-components.tsx" ? Promise.resolve(replacement) : readSource(path))).rejects.toThrow("registry_source_invalid");
    }
  });
});

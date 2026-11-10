import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { catalog, blockCatalog } from "./catalog.js";
import { buildSourceRegistry, sourceModulePaths } from "./source-registry.js";
import { componentDataSchema } from "./component-schemas.js";
import { defaultConfig, renderProvider } from "./installation.js";
import { privacyContextCases } from "../../../tests/fixtures/privacy-context.js";

const build = () => buildSourceRegistry({ catalog, blockCatalog, readSource: path => readFile(new URL(`../../../${path}`, import.meta.url), "utf8"), providerSource: renderProvider(defaultConfig) });
describe("T2 privacy/context source contracts", () => {
  it.each(privacyContextCases)("PC-R01 $slug publishes typed source and identity-only declarations", async row => {
    const { items } = await build(), item = items.find(item => item.name === row.slug)!;
    expect(item.meta.implementation).toBe("specialized"); expect(item.meta.dataSchema).toEqual(componentDataSchema(row.slug));
    expect(item.files.find(file => file.path.endsWith("/_mcpcn/privacy-context-components.tsx"))?.content).toContain(`export function ${row.name}(`);
    expect(item.files.find(file => file.path.endsWith("/_mcpcn/privacy-context-schemas.ts"))?.content).toContain(`export const ${row.name}Schema`);
    expect(item.files).toHaveLength(40); expect(item.meta.security).toMatchObject({ callsTools: [], destructive: false });
    expect(item.meta.security.modelVisible).toContain(`${row.report}.revision`);
    expect(item.meta.security.modelVisible.every(field => /(^|\.)(id|revision)$/.test(field))).toBe(true);
    expect(item.files.find(file => file.path.endsWith("/_mcpcn/components.tsx"))?.content).not.toMatch(new RegExp(`${row.name}\\s*=\\s*GenericAgentComponent`));
  });
  it("PC-R02 preserves all79 identities/11blocks and exact36-owner source closure", async () => {
    const { items } = await build(); expect(items).toHaveLength(79); expect(blockCatalog).toHaveLength(11); expect(sourceModulePaths).toHaveLength(36);
    expect(items.filter(item => item.meta.implementation === "specialized")).toHaveLength(56); expect(items.filter(item => item.meta.implementation === "generic-alias")).toHaveLength(0);
    expect(new Set(items.flatMap(item => item.files.map(file => file.path))).size).toBe(119);
    expect(items.filter(item => item.type === "registry:block").every(item => item.files.length === 41)).toBe(true);
  });
});

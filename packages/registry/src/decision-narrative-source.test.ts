import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { catalog, blockCatalog } from "./catalog.js";
import { buildSourceRegistry, sourceModulePaths } from "./source-registry.js";
import { componentDataSchema } from "./component-schemas.js";
import { defaultConfig, renderProvider } from "./installation.js";
import { decisionNarrativeCases } from "../../../tests/fixtures/decision-narratives.js";

const build = () => buildSourceRegistry({ catalog, blockCatalog, readSource: path => readFile(new URL(`../../../${path}`, import.meta.url), "utf8"), providerSource: renderProvider(defaultConfig) });
describe("T2 decision narrative source contracts", () => {
  it.each(decisionNarrativeCases)("DN-R01 $slug publishes real typed source and identity-only metadata", async row => {
    const { items } = await build(), item = items.find(item => item.name === row.slug)!;
    expect(item.meta.implementation).toBe("specialized"); expect(item.meta.dataSchema).toEqual(componentDataSchema(row.slug));
    expect(item.files.find(file => file.path.endsWith("/_mcpcn/decision-narrative-components.tsx"))?.content).toContain(`export function ${row.name}(`);
    expect(item.files.find(file => file.path.endsWith("/_mcpcn/decision-narrative-schemas.ts"))?.content).toContain(`export const ${row.name}Schema`);
    expect(item.files).toHaveLength(38); expect(item.meta.security).toMatchObject({ callsTools: [], destructive: false });
    expect(item.meta.security.modelVisible).toContain(`${row.report}.revision`); expect(item.meta.security.modelVisible).not.toContain(`${row.report}.label`);
  });
  it("DN-R02 preserves all identities/blocks and exact34-owner source closure", async () => {
    const { items } = await build(); expect(items).toHaveLength(79); expect(blockCatalog).toHaveLength(11); expect(sourceModulePaths).toHaveLength(34);
    expect(items.filter(item => item.meta.implementation === "specialized")).toHaveLength(52); expect(items.filter(item => item.meta.implementation === "generic-alias")).toHaveLength(4);
    expect(new Set(items.flatMap(item => item.files.map(file => file.path))).size).toBe(117);
  });
});

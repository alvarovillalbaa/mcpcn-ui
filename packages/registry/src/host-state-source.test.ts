import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { catalog, blockCatalog } from "./catalog.js";
import { componentDataSchema } from "./component-schemas.js";
import { buildSourceRegistry, sourceModulePaths } from "./source-registry.js";
import { defaultConfig, renderProvider } from "./installation.js";
import { hostStateCases } from "../../../tests/fixtures/host-states.js";

const build = () => buildSourceRegistry({ catalog, blockCatalog, readSource: path => readFile(new URL(`../../../${path}`, import.meta.url), "utf8"), providerSource: renderProvider(defaultConfig) });
describe("T2 host state source installation contracts", () => {
  it.each(hostStateCases)("HS-R01 $slug publishes dedicated schema, source and intent-only metadata", async row => {
    const { items } = await build(), item = items.find(item => item.name === row.slug)!;
    expect(item.meta.implementation).toBe("specialized"); expect(item.meta.dataSchema).toEqual(componentDataSchema(row.slug));
    expect(item.files.find(file => file.path.endsWith("/_mcpcn/host-state-components.tsx"))?.content).toContain(`export function ${row.name}(`);
    expect(item.files.find(file => file.path.endsWith("/_mcpcn/host-state-schemas.ts"))?.content).toContain(`export const ${row.name}Schema`);
    expect(item.meta.security).toEqual(expect.objectContaining({ callsTools: [], destructive: false, modelVisible: ["id", "revision", "action.id", "action.revision"] }));
    expect(item.files).toHaveLength(38);
  });
  it("HS-R02 retains identities and complete two-owner source closure", async () => {
    const { items } = await build(); expect(items).toHaveLength(79); expect(sourceModulePaths).toHaveLength(34);
    expect(items.filter(item => item.meta.implementation === "specialized")).toHaveLength(52);
    expect(items.filter(item => item.meta.implementation === "generic-alias")).toHaveLength(4);
    const union = new Set(items.flatMap(item => item.files.map(file => file.path))); expect(union.size).toBe(117);
    for (const path of ["_mcpcn/host-state-components.tsx", "_mcpcn/host-state-schemas.ts"]) expect(sourceModulePaths).toContain(path);
  });
});

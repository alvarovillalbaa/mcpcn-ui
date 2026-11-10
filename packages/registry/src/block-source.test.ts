import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { catalog, blockCatalog } from "./catalog.js";
import { buildSourceRegistry, sourceModulePaths, blockSourceModulePaths } from "./source-registry.js";
import { defaultConfig, renderProvider, buildInstallationPlan } from "./installation.js";
const readSource = (path: string) => readFile(new URL(`../../../${path}`, import.meta.url), "utf8");
const build = (read = readSource) => buildSourceRegistry({ catalog, blockCatalog, readSource: read, providerSource: renderProvider(defaultConfig) });
describe("BR-R: complete editable block source", () => {
  it("BR-R01 preserves every component payload and all 79 identities", async () => {
    const { items } = await build(); expect(items).toHaveLength(79); expect(sourceModulePaths).toHaveLength(36); expect(blockSourceModulePaths).toHaveLength(8);
    for (const item of items.filter(item => item.type === "registry:ui")) expect(item).toEqual(JSON.parse(await readSource("registry/items/" + item.name + ".json")));
    expect(new Set(items.flatMap(item => item.files.map(file => file.path))).size).toBe(171);
  });
  it.each(blockCatalog)("BR-R02 $name includes exact independent server/fixture/test/README entries", async block => {
    const item = (await build()).items.find(item => item.name === block.name)!; expect(item.files).toHaveLength(53);
    const entry = item.files.find(file => file.path.endsWith("/blocks/" + block.name + ".tsx"))!;
    expect(entry.content).toContain("App }"); expect(entry.content).not.toMatch(/server|fixture|node:/);
    for (const suffix of [".server.mts", ".fixture.mts", ".server.test.mts", ".README.md"]) expect(item.files.some(file => file.path.endsWith("/blocks/" + block.name + suffix))).toBe(true);
    expect(item.files.filter(file => /\/blocks\//.test(file.path))).toHaveLength(5);
    expect(item.meta.security).toMatchObject({ modelVisible: ["block","id","revision","status","receipt"], destructive: true });
    expect(item.files.find(file => file.path.endsWith("/block-recipes.mts"))?.content).toContain('"./server.mjs"');
    expect(item.files.find(file => file.path.endsWith("/block-schemas.mts"))?.content).toContain("BlockStateSchema");
  });
  it("BR-R03 client closure refuses a hidden server dependency", async () => {
    await expect(build(async path => (await readSource(path)) + (path === "packages/react/src/block-apps.tsx" ? '\nimport "./block-store.mjs";\n' : ""))).rejects.toThrow("registry_source_invalid");
  });
  it("BR-R04 copied server closure refuses an unknown external dependency", async () => {
    await expect(build(async path => (await readSource(path)) + (path === "packages/server/src/block-store.ts" ? '\nimport "unapproved-store";\n' : ""))).rejects.toThrow("registry_source_invalid");
  });
  it("BR-R05 dependency commands add server requirements only for block selections", () => {
    expect(buildInstallationPlan({ mode: "package" }, ["review-before-action"], catalog, blockCatalog).dependencyCommand).toContain("@mcpcn/server");
    expect(buildInstallationPlan({}, ["review-before-action"], catalog, blockCatalog).dependencyCommand).toContain("@types/node");
    expect(buildInstallationPlan({ mode: "package" }, ["approval-card"], catalog, blockCatalog).dependencyCommand).not.toContain("@mcpcn/server");
  });
});

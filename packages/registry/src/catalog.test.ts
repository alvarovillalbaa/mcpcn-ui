import { describe,expect,it } from "vitest";
import { blockCatalog,catalog } from "./catalog.js";
describe("catalog",()=>{it("ships the complete component catalog",()=>expect(catalog).toHaveLength(68));it("ships complete workflow blocks",()=>expect(blockCatalog).toHaveLength(11));it("uses unique slugs",()=>expect(new Set(catalog.map(i=>i.slug)).size).toBe(catalog.length))});

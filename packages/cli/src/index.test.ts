import { describe,expect,it } from "vitest";
import { catalog } from "@mcpcn/registry/catalog";
describe("CLI catalog",()=>it("can expose all components",()=>expect(catalog.length).toBe(68)));

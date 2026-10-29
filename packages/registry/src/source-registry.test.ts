import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { blockCatalog, catalog } from "./catalog.js";
import { defaultConfig, renderProvider } from "./installation.js";
import { buildSourceRegistry, type SourceRegistryInput } from "./source-registry.js";

const root=new URL("../../../",import.meta.url);
const actualSource=(path:string)=>readFile(new URL(path,root),"utf8");
const providerSource=renderProvider(defaultConfig);
const build=(overrides:Partial<SourceRegistryInput>={})=>buildSourceRegistry({catalog,blockCatalog,readSource:actualSource,providerSource,...overrides});
const file=(item:Awaited<ReturnType<typeof build>>["items"][number],suffix:string)=>{
  const found=item.files.find(value=>value.path===`components/mcpcn/${suffix}`);
  expect(found,`Missing copied file ${suffix}`).toBeDefined();
  return found!;
};

describe("canonical source registry",()=>{
  it("copies actual component, schema and core implementations instead of package reexports",async()=>{
    const {items}=await build();
    const item=items.find(value=>value.name==="approval-card")!;
    expect(file(item,"approval-card.tsx").content).toContain('export { ApprovalCard } from "./_mcpcn/components"');
    expect(file(item,"_mcpcn/components.tsx").content).toContain("export function ApprovalCard(");
    expect(file(item,"_mcpcn/components.tsx").content).toContain('from "./schemas"');
    expect(file(item,"_mcpcn/schemas.ts").content).toContain('from "./core"');
    expect(file(item,"_mcpcn/core.ts").content).toContain("export function cn(");
    expect(file(item,"LICENSE").type).toBe("registry:lib");
    expect(file(item,"LICENSE").content).toBe(await actualSource("LICENSE"));
    for(const copied of item.files) expect(copied.content).not.toContain('from "@mcpcn/');
  });

  it("retains real core and runtime source with only their local import adaptation",async()=>{
    const {items}=await build();
    expect(file(items[0]!,"_mcpcn/core.ts").content).toBe(await actualSource("packages/core/src/index.ts"));
    expect(file(items[0]!,"_mcpcn/runtime.tsx").content).toBe((await actualSource("packages/runtime/src/index.tsx")).replaceAll('"@mcpcn/core"','"./core"'));
    expect(file(items[0]!,"_mcpcn/runtime.tsx").content).toContain("export class OfficialMCPAdapter");
    expect(file(items[0]!,"_mcpcn/runtime.tsx").content).toContain("export function AgentAppProvider");
  });

  it("ships actual base and theme CSS together as a registry style",async()=>{
    const {items}=await build();
    const style=file(items[0]!,"styles.css");
    expect(style.type).toBe("registry:style");
    expect(style.content).toBe(`${await actualSource("packages/react/src/styles.css")}\n${await actualSource("packages/themes/src/default.css")}`);
    expect(style.content).toContain('[data-mcpcn-theme="graphite"]');
    expect(style.content).toContain('[data-mcpcn-theme="violet"]');
  });

  it("preserves the supplied provider exactly and resolves its local runtime and style imports",async()=>{
    const supplied=renderProvider({...defaultConfig,style:"graphite",host:"standard-mcp"});
    const {items}=await build({providerSource:supplied});
    for(const item of items) {
      expect(file(item,"provider.tsx").content).toBe(supplied);
      expect(file(item,"provider.tsx").content).toContain('from "./_mcpcn/runtime"');
      expect(file(item,"provider.tsx").content).toContain('import "./styles.css"');
      expect(file(item,"provider.tsx").content).toContain('data-mcpcn-theme="graphite"');
    }
  });

  it("exports every real workflow block through its copied local implementation",async()=>{
    const {items}=await build();
    const blocks=items.filter(item=>item.type==="registry:block");
    expect(blocks).toHaveLength(11);
    const actual=await actualSource("packages/react/src/blocks.tsx");
    for(const item of blocks) {
      const copied=file(item,"_mcpcn/blocks.tsx").content;
      expect(copied).toBe(actual.replaceAll('"./index.js"','"./components"').replaceAll('"@mcpcn/schemas"','"./schemas"').replaceAll('"@mcpcn/core"','"./core"'));
      expect(file(item,`blocks/${item.name}.tsx`).content).toContain('from "../_mcpcn/blocks"');
      expect(item.meta.implementation).toBe("workflow-block");
      expect(copied).not.toContain("export const block =");
    }
    expect(file(blocks.find(item=>item.name==="human-corrects-ai-output")!,"blocks/human-corrects-ai-output.tsx").content).toContain("HumanCorrectsAiOutput");
  });

  it("identifies existing generic aliases honestly while retaining all selected component exports",async()=>{
    const {items}=await build();
    const components=items.filter(item=>item.type==="registry:ui");
    expect(components.filter(item=>item.meta.implementation==="generic-alias")).toHaveLength(51);
    expect(components.filter(item=>item.meta.implementation==="specialized")).toHaveLength(5);
    expect(components.filter(item=>item.meta.implementation==="primitive")).toHaveLength(12);
    const alias=components.find(item=>item.name==="approval-checklist")!;
    expect(file(alias,"approval-checklist.tsx").content).toContain("export { ApprovalChecklist }");
    expect(file(alias,"_mcpcn/components.tsx").content).toContain("GenericAgentComponent");
  });

  it("declares the actual runtime peers without an unpublished MCPCN or server dependency",async()=>{
    const {items}=await build();
    for(const item of items) {
      expect(item.dependencies).toEqual(["react@^19.2.0","zod@^4.4.0","@modelcontextprotocol/ext-apps@1.7.5","@modelcontextprotocol/sdk@1.30.0"]);
      expect(item.dependencies.some(name=>name.startsWith("@mcpcn/"))).toBe(false);
      expect(item.registryDependencies).toEqual([]);
    }
  });

  it("exposes identical complete item payloads in its index with canonical portable paths",async()=>{
    const {registry,items}=await build();
    expect(registry.items).toBe(items);
    expect(registry.name).toBe("mcpcn");
    expect(registry.homepage).toBe("https://github.com/alvarovillalbaa/mcpcn-ui");
    for(const item of items) {
      expect(item.$schema).toBe("https://ui.shadcn.com/schema/registry-item.json");
      expect(new Set(item.files.map(value=>value.path)).size).toBe(item.files.length);
      for(const copied of item.files) {
        expect(copied.path.startsWith("components/mcpcn/")).toBe(true);
        expect(copied.path).not.toContain("..");
        expect(copied.path).not.toContain(fileURLToPath(root));
      }
    }
  });

  it("is deterministic, detaches catalog metadata and freezes its complete output",async()=>{
    const input=structuredClone(catalog);
    const before=JSON.stringify(input);
    const first=await build({catalog:input});
    const second=await build({catalog:input,readSource:async path=>{await Promise.resolve();return actualSource(path);}});
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(input)).toBe(false);
    input[0]!.security.modelVisible.push("later-owner-edit");
    expect(JSON.stringify(first)).not.toContain("later-owner-edit");
    expect(Object.isFrozen(first.registry.items)).toBe(true);
    expect(Object.isFrozen(first.items[0]!.files[0]!)).toBe(true);
    expect(Object.isFrozen(first.items[0]!.meta)).toBe(true);
  });

  it("preserves explicit catalog and block ordering regardless of source-read completion",async()=>{
    const reversedCatalog=[...catalog].reverse(), reversedBlocks=[...blockCatalog].reverse();
    const {items}=await build({catalog:reversedCatalog,blockCatalog:reversedBlocks});
    expect(items.map(item=>item.name)).toEqual([...reversedCatalog.map(item=>item.slug),...reversedBlocks.map(item=>item.name)]);
  });

  it("rejects invalid names, duplicate entries and unknown block components before reading source",async()=>{
    let reads=0;
    const readSource=async()=>{reads++;return "never copied";};
    await expect(build({catalog:[{...catalog[0]!,slug:"../outside"}],blockCatalog:[],readSource})).rejects.toThrow("registry_source_invalid");
    await expect(build({catalog:[catalog[0]!,catalog[0]!],blockCatalog:[],readSource})).rejects.toThrow("registry_source_invalid");
    await expect(build({blockCatalog:[{name:"unknown-workflow",description:"Authored invalid fixture",components:["unavailable-component"]}],readSource})).rejects.toThrow("registry_source_invalid");
    await expect(build({catalog:[{...catalog[0]!,name:"Bad; export {}"}],blockCatalog:[],readSource})).rejects.toThrow("registry_source_invalid");
    expect(reads).toBe(0);
  });

  it("fails closed for absent implementations or unresolved imports instead of emitting a stub",async()=>{
    const broken=(path:string,replacement:string)=>(readPath:string)=>readPath===path?Promise.resolve(replacement):actualSource(readPath);
    await expect(build({readSource:broken("packages/react/src/blocks.tsx","")})).rejects.toThrow("registry_source_invalid");
    await expect(build({readSource:broken("packages/core/src/index.ts",'export { secret } from "./missing";')})).rejects.toThrow("registry_source_invalid");
    await expect(build({readSource:broken("packages/core/src/index.ts",'export { secret } from "unexpected-package";')})).rejects.toThrow("registry_source_invalid");
    await expect(build({providerSource:'export { AgentAppProvider } from "@mcpcn/runtime";'})).rejects.toThrow("registry_source_invalid");
    await expect(build({readSource:async()=>{throw new Error("authored_source_missing");}})).rejects.toThrow("authored_source_missing");
  });
});

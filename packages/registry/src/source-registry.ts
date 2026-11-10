import { posix } from "node:path";
import type { CatalogItem } from "./catalog.js";
import type { RegistryFile, RegistryItem } from "./index.js";
import { componentDataSchema } from "./component-schemas.js";
import { blockClientEntry, blockExtraFiles } from "./block-source-entries.js";

export type BlockCatalogItem = { name:string; description:string; components:readonly string[] };
export type SourceRegistry = { $schema:string; name:string; homepage:string; items:RegistryItem[] };
export type SourceRegistryInput = {
  catalog:readonly CatalogItem[];
  blockCatalog:readonly BlockCatalogItem[];
  readSource:(repositoryRelativePath:string)=>Promise<string>;
  providerSource:string;
};

const REPOSITORY = "https://github.com/alvarovillalbaa/mcpcn-ui";
const PREFIX = "components/mcpcn/";
const DEPENDENCIES = ["react@^19.2.0", "zod@^4.4.0", "@modelcontextprotocol/ext-apps@1.7.5", "@modelcontextprotocol/sdk@1.30.0"];
const SOURCES = [
  ["packages/core/src/index.ts", "_mcpcn/core.ts", "registry:lib"],
  ["packages/schemas/src/index.ts", "_mcpcn/schemas.ts", "registry:lib"],
  ["packages/react/src/index.tsx", "_mcpcn/components.tsx", "registry:component"],
  ["packages/runtime/src/index.tsx", "_mcpcn/runtime.tsx", "registry:lib"],
  ["packages/schemas/src/schema-common.ts", "_mcpcn/schema-common.ts", "registry:lib"],
  ["packages/schemas/src/review-schemas.ts", "_mcpcn/review-schemas.ts", "registry:lib"],
  ["packages/schemas/src/decision-schemas.ts", "_mcpcn/decision-schemas.ts", "registry:lib"],
  ["packages/schemas/src/execution-schemas.ts", "_mcpcn/execution-schemas.ts", "registry:lib"],
  ["packages/react/src/primitives.tsx", "_mcpcn/primitives.tsx", "registry:component"],
  ["packages/react/src/component-helpers.tsx", "_mcpcn/component-helpers.tsx", "registry:component"],
  ["packages/react/src/review-components.tsx", "_mcpcn/review-components.tsx", "registry:component"],
  ["packages/react/src/decision-components.tsx", "_mcpcn/decision-components.tsx", "registry:component"],
  ["packages/react/src/execution-components.tsx", "_mcpcn/execution-components.tsx", "registry:component"],
  ["packages/react/src/component-types.ts", "_mcpcn/component-types.ts", "registry:lib"],
  ["packages/schemas/src/approval-schemas.ts", "_mcpcn/approval-schemas.ts", "registry:lib"],
  ["packages/react/src/approval-components.tsx", "_mcpcn/approval-components.tsx", "registry:component"],
  ["packages/schemas/src/tool-workflow-schemas.ts", "_mcpcn/tool-workflow-schemas.ts", "registry:lib"],
  ["packages/react/src/tool-workflow-components.tsx", "_mcpcn/tool-workflow-components.tsx", "registry:component"],
  ["packages/schemas/src/form-workflow-schemas.ts", "_mcpcn/form-workflow-schemas.ts", "registry:lib"],
  ["packages/react/src/form-workflow-components.tsx", "_mcpcn/form-workflow-components.tsx", "registry:component"],
  ["packages/schemas/src/file-review-schemas.ts", "_mcpcn/file-review-schemas.ts", "registry:lib"],
  ["packages/react/src/file-review-components.tsx", "_mcpcn/file-review-components.tsx", "registry:component"],
  ["packages/schemas/src/source-evidence-schemas.ts", "_mcpcn/source-evidence-schemas.ts", "registry:lib"],
  ["packages/react/src/source-evidence-components.tsx", "_mcpcn/source-evidence-components.tsx", "registry:component"],
  ["packages/schemas/src/record-inspection-schemas.ts", "_mcpcn/record-inspection-schemas.ts", "registry:lib"],
  ["packages/react/src/record-inspection-components.tsx", "_mcpcn/record-inspection-components.tsx", "registry:component"],
  ["packages/schemas/src/conflict-validation-schemas.ts", "_mcpcn/conflict-validation-schemas.ts", "registry:lib"],
  ["packages/react/src/conflict-validation-components.tsx", "_mcpcn/conflict-validation-components.tsx", "registry:component"],
  ["packages/schemas/src/option-ranking-schemas.ts", "_mcpcn/option-ranking-schemas.ts", "registry:lib"],
  ["packages/react/src/option-ranking-components.tsx", "_mcpcn/option-ranking-components.tsx", "registry:component"],
  ["packages/schemas/src/host-state-schemas.ts", "_mcpcn/host-state-schemas.ts", "registry:lib"],
  ["packages/react/src/host-state-components.tsx", "_mcpcn/host-state-components.tsx", "registry:component"],
  ["packages/schemas/src/decision-narrative-schemas.ts", "_mcpcn/decision-narrative-schemas.ts", "registry:lib"],
  ["packages/react/src/decision-narrative-components.tsx", "_mcpcn/decision-narrative-components.tsx", "registry:component"],
  ["packages/schemas/src/privacy-context-schemas.ts", "_mcpcn/privacy-context-schemas.ts", "registry:lib"],
  ["packages/react/src/privacy-context-components.tsx", "_mcpcn/privacy-context-components.tsx", "registry:component"],
] as const;
export const sourceModulePaths: readonly string[] = Object.freeze(SOURCES.map(([, target]) => target));
const BLOCK_SOURCES = [
  ["packages/schemas/src/block-workflow-schemas.ts", "_mcpcn/block-schemas.mts", "registry:lib"],
  ["packages/server/src/index.ts", "_mcpcn/server.mts", "registry:lib"],
  ["packages/server/src/wire.ts", "_mcpcn/server-wire.mts", "registry:lib"],
  ["packages/server/src/block-store.ts", "_mcpcn/block-store.mts", "registry:lib"],
  ["packages/server/src/block-operations.ts", "_mcpcn/block-operations.mts", "registry:lib"],
  ["packages/server/src/block-recipes.ts", "_mcpcn/block-recipes.mts", "registry:lib"],
  ["packages/server/src/block-fixtures.ts", "_mcpcn/block-fixtures.mts", "registry:lib"],
  ["packages/react/src/block-apps.tsx", "_mcpcn/block-apps.tsx", "registry:component"],
] as const;
export const blockSourceModulePaths: readonly string[] = Object.freeze(BLOCK_SOURCES.map(([, target]) => target));
const INTERNAL_IMPORTS:Record<string,string> = {"@mcpcn/core":"./core","@mcpcn/schemas":"./schemas","@mcpcn/react":"./components","@mcpcn/runtime":"./runtime"};
const EXTERNAL_IMPORTS = new Set(["react", "react/jsx-runtime", "zod", "@modelcontextprotocol/ext-apps", "@modelcontextprotocol/sdk"]);
const BLOCK_EXTERNAL_IMPORTS = new Set(["node:crypto", "node:sqlite", "node:assert/strict", "node:test",
  "@modelcontextprotocol/ext-apps/server", "@modelcontextprotocol/sdk/server/mcp.js", "@modelcontextprotocol/sdk/server/zod-compat.js",
  "@modelcontextprotocol/sdk/shared/protocol.js", "@modelcontextprotocol/sdk/types.js", "@modelcontextprotocol/sdk/client/index.js", "@modelcontextprotocol/sdk/inMemory.js"]);

function fail():never { throw new Error("registry_source_invalid"); }
function slug(value:string):boolean { return typeof value === "string" && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value); }
function pascal(value:string):string { return value.split("-").map(part=>part[0]!.toUpperCase()+part.slice(1)).join(""); }
function rewrite(source:string, block=false):string {
  if(typeof source!=="string" || source.trim()==="") fail();
  const rewritten=source.replace(/(["'])(@mcpcn\/(?:core|schemas|react|runtime))\1/g, (_,quote:string,name:string)=>`${quote}${INTERNAL_IMPORTS[name]}${quote}`);
  return block?rewritten.replace(/(["'])\.\/index\.js\1/g,'"./components"'):rewritten;
}
function rewriteBlock(source: string, path: string): string {
  const renamed = source.replace(/(["'])@mcpcn\/schemas\/blocks\1/g, '"./block-schemas.mjs"')
    .replace(/(["'])\.\/wire\.js\1/g, '"./server-wire.mjs"')
    .replace(/(["'])\.\/block-(store|operations|recipes|fixtures)\.js\1/g, '"./block-$2.mjs"');
  const index = path === "packages/react/src/block-apps.tsx" ? "./components" : "./server.mjs";
  return rewrite(renamed.replace(/(["'])\.\/index\.js\1/g, JSON.stringify(index)));
}
function freeze<T>(value:T):T {
  if(value && typeof value==="object" && !Object.isFrozen(value)) {
    for(const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

// Check the copied import closure without executing it or replacing TypeScript.
function verifyClosure(files:readonly RegistryFile[], block = false):void {
  const paths=new Set(files.map(file=>file.path));
  if(paths.size!==files.length) fail();
  for(const file of files) {
    if(!file.path.startsWith(PREFIX) || file.path.includes("..") || !file.content.trim()) fail();
    if(file.type==="registry:style" || file.path.endsWith(".README.md") || file.path.endsWith("/LICENSE")) continue;
    const imports=file.content.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g);
    for(const match of imports) {
      const specifier=match[1]??match[2]??match[3]!;
      if(!specifier.startsWith(".")) {
        if(!EXTERNAL_IMPORTS.has(specifier) && !(block && BLOCK_EXTERNAL_IMPORTS.has(specifier))) fail();
        continue;
      }
      const target=posix.normalize(posix.join(posix.dirname(file.path),specifier));
      const stem=target.replace(/\.m?js$/, "");
      if(![target,`${stem}.ts`,`${stem}.tsx`,`${stem}.mts`].some(path=>paths.has(path))) fail();
    }
    if(file.content.includes("@mcpcn/")) fail();
  }
  if (block) {
    const byPath = new Map(files.map(file => [file.path, file])), seen = new Set<string>();
    const visit = (path: string) => {
      if (seen.has(path)) return; seen.add(path);
      const file = byPath.get(path); if (!file) fail();
      if (/\.server(?:\.test)?\.mts$|\.fixture\.mts$|\/_mcpcn\/(?:server|server-wire|block-store|block-operations|block-recipes|block-fixtures)\.mts$/.test(path)) fail();
      for (const match of file.content.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
        const specifier = match[1] ?? match[2] ?? match[3]!;
        if (specifier.startsWith("node:") || specifier.includes("/server") || specifier === "@modelcontextprotocol/sdk/inMemory.js") fail();
        if (!specifier.startsWith(".")) continue;
        const target = posix.normalize(posix.join(posix.dirname(path), specifier)), stem = target.replace(/\.m?js$/, "");
        const resolved = [target, stem + ".ts", stem + ".tsx", stem + ".mts"].find(item => byPath.has(item));
        if (!resolved) fail();
        if (!resolved.endsWith(".css")) visit(resolved);
      }
    };
    const entry = files.find(file => file.path.startsWith(PREFIX + "blocks/") && file.path.endsWith(".tsx"));
    if (!entry) fail(); visit(entry.path); visit(PREFIX + "provider.tsx");
  }
}

export async function buildSourceRegistry({catalog,blockCatalog,readSource,providerSource}:SourceRegistryInput):Promise<{registry:SourceRegistry;items:RegistryItem[]}> {
  if(!Array.isArray(catalog) || !Array.isArray(blockCatalog) || typeof readSource!=="function" || typeof providerSource!=="string" || !providerSource.trim()) fail();
  const names=new Set<string>();
  for(const item of catalog) {
    if(!slug(item.slug) || !/^[A-Z][A-Za-z0-9]*$/.test(item.name) || !item.description?.trim() || names.has(item.slug)) fail();
    names.add(item.slug);
  }
  const componentNames=new Set(catalog.map(item=>item.slug));
  for(const block of blockCatalog) {
    if(!slug(block.name) || !block.description?.trim() || names.has(block.name) || !Array.isArray(block.components) || block.components.some((name:string)=>!componentNames.has(name))) fail();
    names.add(block.name);
  }
  const sourcePaths=[...SOURCES.map(([path])=>path),"packages/react/src/styles.css","packages/themes/src/default.css","LICENSE",...(blockCatalog.length?["packages/react/src/blocks.tsx"]:[])];
  const blockPaths = blockCatalog.length ? BLOCK_SOURCES.map(([path]) => path) : [];
  const read=await Promise.all([...sourcePaths, ...blockPaths].map(async path=>[path,await readSource(path)] as const));
  const source=new Map<string,string>(read);
  const common:RegistryFile[]=SOURCES.map(([path,target,type])=>({path:PREFIX+target,type,content:rewrite(source.get(path)!)}));
  const baseStyle=source.get("packages/react/src/styles.css"), themeStyle=source.get("packages/themes/src/default.css");
  if(!baseStyle?.trim() || !themeStyle?.trim()) fail();
  common.push({path:PREFIX+"styles.css",type:"registry:style",content:`${baseStyle}\n${themeStyle}`});
  common.push({path:PREFIX+"provider.tsx",type:"registry:component",content:providerSource});
  const license=source.get("LICENSE");
  if(!license?.trim()) fail();
  common.push({path:PREFIX+"LICENSE",type:"registry:lib",content:license});
  const blockFile:RegistryFile|undefined=blockCatalog.length?{path:PREFIX+"_mcpcn/blocks.tsx",type:"registry:component",content:rewrite(source.get("packages/react/src/blocks.tsx")!,true)}:undefined;
  const blockFiles: RegistryFile[] = blockCatalog.length ? BLOCK_SOURCES.map(([path, target, type]) => ({ path: PREFIX + target, type, content: rewriteBlock(source.get(path)!, path) })) : [];
  const makeFiles=(entry:RegistryFile,includeBlock:boolean)=>[entry,...common.map(file=>({...file})),...(includeBlock?[{...blockFile!}, ...blockFiles.map(file => ({ ...file }))]:[])];
  const provenance={license:"MIT",repository:REPOSITORY,sourceProfile:"typescript-local-source-v1",sourceFiles:sourcePaths.slice()};
  const items:RegistryItem[]=catalog.map(item=>{
    const dataSchema=item.category==="primitive"?undefined:componentDataSchema(item.slug);
    if(item.category!=="primitive" && dataSchema===undefined) fail();
    return {
    $schema:"https://ui.shadcn.com/schema/registry-item.json",name:item.slug,type:"registry:ui",title:item.name,description:item.description,
    dependencies:DEPENDENCIES.slice(),registryDependencies:[],
    files:makeFiles({path:`${PREFIX}${item.slug}.tsx`,type:"registry:component",content:`"use client";\nexport { ${item.name} } from "./_mcpcn/components";\n`},false),
    meta:{category:item.category,implementation:item.category==="primitive"?"primitive":item.specialized?"specialized":"generic-alias",...(dataSchema===undefined?{}:{dataSchema}),security:{modelVisible:[...item.security.modelVisible],privateOnly:[...item.security.privateOnly],callsTools:[...item.security.callsTools],destructive:item.security.destructive},provenance:{...provenance,sourceFiles:sourcePaths.filter(path=>path!=="packages/react/src/blocks.tsx")},docs:`${REPOSITORY}#readme`},
  };});
  for(const block of blockCatalog) items.push({
    $schema:"https://ui.shadcn.com/schema/registry-item.json",name:block.name,type:"registry:block",title:pascal(block.name),description:block.description,
    dependencies:[...DEPENDENCIES, "@types/node@^24.0.0"],registryDependencies:[],
    files:[...makeFiles(blockClientEntry(block.name, "copy"),true), ...blockExtraFiles(block.name, "copy")],
    meta:{components:[...block.components],implementation:"persistent-workflow-block",provenance:{...provenance,sourceProfile:"typescript-block-source-v1",sourceFiles:[...sourcePaths, ...blockPaths, "packages/registry/src/block-source-entries.ts"]},
      server:{storage:"caller-opened dedicated Node24 SQLite",execution:"trusted synchronous transaction-local SQL",principal:"resolved from original request context on every call",tools:["read","prepare","confirm","cancel"]},
      security:{modelVisible:["block","id","revision","status","receipt"],privateOnly:["state","source","arguments","audit","reviewToken"],callsTools:["read","prepare","confirm","cancel"],destructive:true},docs:"https://mcpcn-ui.vercel.app/docs/block-recipes"},
  });
  for(const item of items) verifyClosure(item.files, item.type === "registry:block");
  const registry:SourceRegistry={$schema:"https://ui.shadcn.com/schema/registry.json",name:"mcpcn",homepage:REPOSITORY,items};
  return freeze({registry,items});
}

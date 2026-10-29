import { posix } from "node:path";
import type { CatalogItem } from "./catalog.js";
import type { RegistryFile, RegistryItem } from "./index.js";

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
] as const;
const INTERNAL_IMPORTS:Record<string,string> = {"@mcpcn/core":"./core","@mcpcn/schemas":"./schemas","@mcpcn/react":"./components","@mcpcn/runtime":"./runtime"};
const EXTERNAL_IMPORTS = new Set(["react", "react/jsx-runtime", "zod", "@modelcontextprotocol/ext-apps", "@modelcontextprotocol/sdk"]);

function fail():never { throw new Error("registry_source_invalid"); }
function slug(value:string):boolean { return typeof value === "string" && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value); }
function pascal(value:string):string { return value.split("-").map(part=>part[0]!.toUpperCase()+part.slice(1)).join(""); }
function rewrite(source:string, block=false):string {
  if(typeof source!=="string" || source.trim()==="") fail();
  const rewritten=source.replace(/(["'])(@mcpcn\/(?:core|schemas|react|runtime))\1/g, (_,quote:string,name:string)=>`${quote}${INTERNAL_IMPORTS[name]}${quote}`);
  return block?rewritten.replace(/(["'])\.\/index\.js\1/g,'"./components"'):rewritten;
}
function freeze<T>(value:T):T {
  if(value && typeof value==="object" && !Object.isFrozen(value)) {
    for(const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

// Check the copied import closure without executing it or replacing TypeScript.
function verifyClosure(files:readonly RegistryFile[]):void {
  const paths=new Set(files.map(file=>file.path));
  if(paths.size!==files.length) fail();
  for(const file of files) {
    if(!file.path.startsWith(PREFIX) || file.path.includes("..") || !file.content.trim()) fail();
    if(file.type==="registry:style") continue;
    const imports=file.content.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g);
    for(const match of imports) {
      const specifier=match[1]??match[2]??match[3]!;
      if(!specifier.startsWith(".")) {
        if(!EXTERNAL_IMPORTS.has(specifier)) fail();
        continue;
      }
      const target=posix.normalize(posix.join(posix.dirname(file.path),specifier));
      const stem=target.replace(/\.js$/, "");
      if(![target,`${stem}.ts`,`${stem}.tsx`].some(path=>paths.has(path))) fail();
    }
    if(file.content.includes("@mcpcn/")) fail();
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
  const read=await Promise.all(sourcePaths.map(async path=>[path,await readSource(path)] as const));
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
  const makeFiles=(entry:RegistryFile,includeBlock:boolean)=>[entry,...common.map(file=>({...file})),...(includeBlock?[{...blockFile!}]:[])];
  const provenance={license:"MIT",repository:REPOSITORY,sourceProfile:"typescript-local-source-v1",sourceFiles:sourcePaths.slice()};
  const items:RegistryItem[]=catalog.map(item=>({
    $schema:"https://ui.shadcn.com/schema/registry-item.json",name:item.slug,type:"registry:ui",title:item.name,description:item.description,
    dependencies:DEPENDENCIES.slice(),registryDependencies:[],
    files:makeFiles({path:`${PREFIX}${item.slug}.tsx`,type:"registry:component",content:`"use client";\nexport { ${item.name} } from "./_mcpcn/components";\n`},false),
    meta:{category:item.category,implementation:item.category==="primitive"?"primitive":item.specialized?"specialized":"generic-alias",security:{modelVisible:[...item.security.modelVisible],privateOnly:[...item.security.privateOnly],callsTools:[...item.security.callsTools],destructive:item.security.destructive},provenance:{...provenance,sourceFiles:sourcePaths.filter(path=>path!=="packages/react/src/blocks.tsx")},docs:`${REPOSITORY}#readme`},
  }));
  for(const block of blockCatalog) items.push({
    $schema:"https://ui.shadcn.com/schema/registry-item.json",name:block.name,type:"registry:block",title:pascal(block.name),description:block.description,
    dependencies:DEPENDENCIES.slice(),registryDependencies:[],
    files:makeFiles({path:`${PREFIX}blocks/${block.name}.tsx`,type:"registry:component",content:`"use client";\nexport { ${pascal(block.name)} } from "../_mcpcn/blocks";\n`},true),
    meta:{components:[...block.components],implementation:"workflow-block",provenance:{...provenance,sourceFiles:sourcePaths.slice()},docs:`${REPOSITORY}#readme`},
  });
  for(const item of items) verifyClosure(item.files);
  const registry:SourceRegistry={$schema:"https://ui.shadcn.com/schema/registry.json",name:"mcpcn",homepage:REPOSITORY,items};
  return freeze({registry,items});
}

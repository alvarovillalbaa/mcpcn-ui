import { lstat, mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { blockCatalog, catalog } from "@mcpcn/registry/catalog";
import { defaultConfig, renderProvider } from "@mcpcn/registry/installation";
import { sourceModulePaths } from "@mcpcn/registry/source-registry";
import { runCLI } from "./installer.js";

const faults=vi.hoisted(()=>({
  mode:null as null|"partial-write"|"fsync"|"edited-fsync"|"manifest-readback"|"link-ack-replaced"|"manifest-rename",
  source:"",manifest:"",writeCalls:0,failures:0,partialBytes:0,linked:false,sameInode:false,
  publishedIdentity:null as null|{dev:number;ino:number},replacementIdentity:null as null|{dev:number;ino:number},replacementBytes:"",
  editedBytes:"// Authored owner edit during a failed install; retain exactly.\n",
}));

// Real temporary files still carry every byte. Only these named native-operation
// failures are authored; this is not proof of an actual disk or kernel fault.
vi.mock("node:fs/promises",async(importOriginal)=>{
  const actual=await importOriginal<typeof import("node:fs/promises")>();
  const failure=()=>Object.assign(new Error("AUTHORED_PRIVATE_FS_FAILURE /authored/private/path"),{code:"EIO"});
  return {
    ...actual,
    open:async(...args:Parameters<typeof actual.open>)=>{
      const path=String(args[0]);
      if(faults.mode==="manifest-readback" && faults.linked && path===faults.manifest && faults.failures===0) {
        faults.failures++;
        throw failure();
      }
      const handle=await actual.open(...args);
      if(path!==faults.source || args[1]!=="wx" || !["partial-write","fsync","edited-fsync"].includes(faults.mode??"")) return handle;
      return new Proxy(handle,{
        get(target,key) {
          if(key==="write" && faults.mode==="partial-write") return async(buffer:Buffer,offset:number,length:number,position:number)=>{
            faults.writeCalls++;
            if(faults.writeCalls>1) {faults.failures++;throw failure();}
            const result=await target.write(buffer,offset,Math.min(length,7),position);
            faults.partialBytes=result.bytesWritten;
            return result;
          };
          if(key==="sync" && (faults.mode==="fsync" || faults.mode==="edited-fsync")) return async()=>{
            if(faults.mode==="edited-fsync") {
              const before=await target.stat();
              await actual.writeFile(path,faults.editedBytes);
              const after=await target.stat();
              faults.sameInode=before.dev===after.dev && before.ino===after.ino;
            }
            faults.failures++;
            throw failure();
          };
          const value=Reflect.get(target,key,target);
          return typeof value==="function"?value.bind(target):value;
        },
      });
    },
    link:async(...args:Parameters<typeof actual.link>)=>{
      const result=await actual.link(...args);
      if(faults.mode==="manifest-readback" && String(args[1])===faults.manifest) faults.linked=true;
      if(faults.mode==="link-ack-replaced" && String(args[1])===faults.manifest) {
        faults.linked=true;
        const installed=await actual.lstat(faults.manifest);
        faults.publishedIdentity={dev:installed.dev,ino:installed.ino};
        const bytes=await actual.readFile(faults.manifest);
        await actual.unlink(faults.manifest);
        await actual.writeFile(faults.manifest,bytes,{flag:"wx",mode:0o600});
        const replacement=await actual.lstat(faults.manifest);
        faults.replacementIdentity={dev:replacement.dev,ino:replacement.ino};
        faults.replacementBytes=bytes.toString("utf8");
        faults.failures++;
        throw failure();
      }
      return result;
    },
    rename:async(...args:Parameters<typeof actual.rename>)=>{
      if(faults.mode==="manifest-rename" && String(args[1])===faults.manifest) {faults.failures++;throw failure();}
      return actual.rename(...args);
    },
  };
});

// These are authored registry/transport fixtures, not compiled component proofs.
const PREFIX="components/mcpcn/";
const REGISTRY="https://registry.example/items";
const AUTHORED_LICENSE="MIT License\n\nCopyright (c) 2026 Authored fixture authors\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the \"Software\"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n";
type PayloadFile={path:string;type:string;content:string};
const EXPECTED_SOURCE_MODULE_PATHS = [
  "_mcpcn/core.ts", "_mcpcn/schemas.ts", "_mcpcn/components.tsx", "_mcpcn/runtime.tsx",
  "_mcpcn/schema-common.ts", "_mcpcn/review-schemas.ts", "_mcpcn/decision-schemas.ts", "_mcpcn/execution-schemas.ts",
  "_mcpcn/primitives.tsx", "_mcpcn/component-helpers.tsx", "_mcpcn/review-components.tsx",
  "_mcpcn/decision-components.tsx", "_mcpcn/execution-components.tsx", "_mcpcn/component-types.ts",
] as const;
const PRIOR_SOURCE_MODULE_PATHS = ["_mcpcn/core.ts", "_mcpcn/schemas.ts", "_mcpcn/components.tsx", "_mcpcn/runtime.tsx"] as const;
const AUTHORED_MODULES: Record<string, {type:string;content:string}> = {
  "_mcpcn/core.ts": {type:"registry:lib",content:"export const authoredCore = true;\n"},
  "_mcpcn/schemas.ts": {type:"registry:lib",content:'import { authoredCore } from "./core";\nexport const authoredSchema = authoredCore;\n'},
  "_mcpcn/components.tsx": {type:"registry:component",content:'"use client";\nexport function Button(){return null;}\nexport function Card(){return null;}\nexport function Badge(){return null;}\nexport function InlineEditForm(){return null;}\nexport function ValidationSummary(){return null;}\n'},
  "_mcpcn/runtime.tsx": {type:"registry:lib",content:'"use client";\nexport const authoredRuntime = true;\n'},
  "_mcpcn/schema-common.ts": {type:"registry:lib",content:"export const authoredSchemaCommon = true;\n"},
  "_mcpcn/review-schemas.ts": {type:"registry:lib",content:"export const authoredReviewSchemas = true;\n"},
  "_mcpcn/decision-schemas.ts": {type:"registry:lib",content:"export const authoredDecisionSchemas = true;\n"},
  "_mcpcn/execution-schemas.ts": {type:"registry:lib",content:"export const authoredExecutionSchemas = true;\n"},
  "_mcpcn/primitives.tsx": {type:"registry:component",content:"export const authoredPrimitives = true;\n"},
  "_mcpcn/component-helpers.tsx": {type:"registry:component",content:"export const authoredComponentHelpers = true;\n"},
  "_mcpcn/review-components.tsx": {type:"registry:component",content:"export const authoredReviewComponents = true;\n"},
  "_mcpcn/decision-components.tsx": {type:"registry:component",content:"export const authoredDecisionComponents = true;\n"},
  "_mcpcn/execution-components.tsx": {type:"registry:component",content:"export const authoredExecutionComponents = true;\n"},
  "_mcpcn/component-types.ts": {type:"registry:lib",content:"export type AuthoredComponentAction = {type:string};\n"},
};
function payload(name:string) {
  const component=catalog.find(item=>item.slug===name), block=blockCatalog.find(item=>item.name===name);
  if(!component && !block) throw new Error("Authored fixture requested an unknown item");
  const exportName=component?.name??name.split("-").map(part=>part[0]!.toUpperCase()+part.slice(1)).join("");
  const common:PayloadFile[]=[
    {path:PREFIX+"LICENSE",type:"registry:lib",content:AUTHORED_LICENSE},
    ...sourceModulePaths.map(target => {
      const fixture = AUTHORED_MODULES[target];
      if (!fixture) throw new Error("Authored fixture is missing a current source module");
      return {path:PREFIX+target,...fixture};
    }),
    {path:PREFIX+"styles.css",type:"registry:style",content:".mcpcn { color: inherit; }\n"},
    {path:PREFIX+"provider.tsx",type:"registry:component",content:renderProvider(defaultConfig)},
  ];
  const entry={path:PREFIX+(block?"blocks/":"")+name+".tsx",type:"registry:component",content:`"use client";\nexport { ${exportName} } from "${block?"../_mcpcn/blocks":"./_mcpcn/components"}";\n`};
  if(block) common.push({path:PREFIX+"_mcpcn/blocks.tsx",type:"registry:component",content:'"use client";\nimport { Card } from "./components";\nexport function HumanCorrectsAiOutput(){return Card();}\n'});
  return {$schema:"https://ui.shadcn.com/schema/registry-item.json",name,type:block?"registry:block":"registry:ui",title:exportName,description:"Authored source-install protocol fixture.",dependencies:["react@^19.2.0","zod@^4.4.0","@modelcontextprotocol/ext-apps@1.7.5","@modelcontextprotocol/sdk@1.30.0"],registryDependencies:[],files:[entry,...common],meta:{fixture:"authored"}};
}
const exists=(path:string)=>lstat(path).then(()=>true,()=>false);
const json=(value:unknown)=>JSON.stringify(value,null,2)+"\n";
function deferred<T>() {
  let resolve!:(value:T)=>void;
  const promise=new Promise<T>(done=>{resolve=done;});
  return {promise,resolve};
}
const fakeRegistry=(change?:(name:string,value:ReturnType<typeof payload>)=>unknown):typeof globalThis.fetch=>async input=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  const name=url.pathname.split("/").at(-1)!.replace(/\.json$/,"");
  const value=payload(name);
  return Response.json(change?change(name,value):value);
};
async function withProject(body:(fixture:{root:string;cwd:string;invoke:(args:string[],fetcher?:typeof globalThis.fetch)=>Promise<{code:number;logs:string[];errors:string[]}>})=>Promise<void>) {
  const root=await realpath(await mkdtemp(join(tmpdir(),"mcpcn-installer-authored-")));
  const cwd=join(root,"project");
  await mkdir(cwd);
  await writeFile(join(cwd,"package.json"),json({private:true,type:"module",dependencies:{react:"^19.2.0"}}));
  await writeFile(join(cwd,"tsconfig.json"),json({compilerOptions:{jsx:"react-jsx"}}));
  const invoke=async(args:string[],fetcher:typeof globalThis.fetch=fakeRegistry())=>{
    const logs:string[]=[],errors:string[]=[];
    const code=await runCLI(args,{cwd,fetch:fetcher,log:value=>logs.push(value),error:value=>errors.push(value)});
    return {code,logs,errors};
  };
  try {await body({root,cwd,invoke});} finally {await rm(root,{recursive:true,force:true});}
}
const initArgs=["init",`--registry=${REGISTRY}`];
async function withFault(mode:NonNullable<typeof faults.mode>,cwd:string,body:()=>Promise<void>) {
  Object.assign(faults,{mode,source:join(cwd,"components/mcpcn/_mcpcn/core.ts"),manifest:join(cwd,"mcpcn.lock.json"),writeCalls:0,failures:0,partialBytes:0,linked:false,sameInode:false,publishedIdentity:null,replacementIdentity:null,replacementBytes:""});
  try {await body();} finally {faults.mode=null;}
}
async function expectNoTransactionDebris(cwd:string) {
  const names=await readdir(cwd);
  expect(names).not.toContain(".mcpcn-install.lock");
  expect(names.filter(name=>name.startsWith(".mcpcn-manifest-"))).toEqual([]);
}

describe.sequential("source installation CLI",()=>{
  it("persists every requested supported init option instead of silently using defaults",async()=>withProject(async({cwd,invoke})=>{
    const result=await invoke(["init","--mode=copy","--style=violet","--host=openai","--manager=npm","--components-dir=src/widgets",`--registry=${REGISTRY}`]);
    expect(result.code).toBe(0);
    expect(result.errors).toEqual([]);
    expect(JSON.parse(await readFile(join(cwd,"mcpcn.json"),"utf8"))).toEqual({...defaultConfig,mode:"copy",style:"violet",host:"openai",packageManager:"npm",componentsDir:"src/widgets",registry:REGISTRY});
    expect(await exists(join(cwd,"mcpcn.lock.json"))).toBe(false);
  }));

  it("rejects unsupported options and reserved paths and never overwrites an existing configuration",async()=>withProject(async({cwd,invoke})=>{
    for(const args of [["init","--typescript=false"],["init","--host=unknown"],["init","--unknown=yes"],["init","--components-dir=../outside"],["init","--components-dir=Node_Modules/authored"]]) {
      expect((await invoke(args)).code).toBe(1);
      expect(await exists(join(cwd,"mcpcn.json"))).toBe(false);
    }
    expect((await invoke(initArgs)).code).toBe(0);
    const before=await readFile(join(cwd,"mcpcn.json"),"utf8");
    expect((await invoke(["init","--style=graphite"])).code).toBe(1);
    expect(await readFile(join(cwd,"mcpcn.json"),"utf8")).toBe(before);
  }));

  it("installs a complete selected block closure into the configured directory with provider and per-file ownership",async()=>withProject(async({cwd,invoke})=>{
    expect(sourceModulePaths).toEqual(EXPECTED_SOURCE_MODULE_PATHS);
    expect(sourceModulePaths).toHaveLength(14);
    expect((await invoke([...initArgs,"--components-dir=src/widgets","--style=graphite","--host=standard-mcp"])).code).toBe(0);
    const requested:string[]=[];
    const transport:typeof globalThis.fetch=async(input,options)=>{requested.push(String(input));return fakeRegistry()(input,options);};
    const result=await invoke(["add","human-corrects-ai-output"],transport);
    expect(result.code).toBe(0);
    expect(requested.some(url=>url.endsWith("/human-corrects-ai-output.json"))).toBe(true);
    expect(await readFile(join(cwd,"src/widgets/blocks/human-corrects-ai-output.tsx"),"utf8")).toContain('from "../_mcpcn/blocks"');
    expect(await readFile(join(cwd,"src/widgets/_mcpcn/blocks.tsx"),"utf8")).toContain("export function HumanCorrectsAiOutput");
    const config=JSON.parse(await readFile(join(cwd,"mcpcn.json"),"utf8"));
    expect(await readFile(join(cwd,"src/widgets/provider.tsx"),"utf8")).toBe(renderProvider(config));
    const lock=JSON.parse(await readFile(join(cwd,"mcpcn.lock.json"),"utf8"));
    expect(lock.version).toBe(2);
    expect(lock.configHash).toMatch(/^[a-f0-9]{64}$/);
    for(const path of ["src/widgets/blocks/human-corrects-ai-output.tsx","src/widgets/_mcpcn/blocks.tsx","src/widgets/_mcpcn/core.ts","src/widgets/_mcpcn/schemas.ts","src/widgets/_mcpcn/components.tsx","src/widgets/_mcpcn/runtime.tsx","src/widgets/provider.tsx","src/widgets/styles.css","src/widgets/LICENSE"]) {
      expect(lock.files[path].hash).toMatch(/^[a-f0-9]{64}$/);
      expect(lock.items["human-corrects-ai-output"].files).toContain(path);
    }
    for(const module of EXPECTED_SOURCE_MODULE_PATHS) {
      const path="src/widgets/"+module;
      expect(lock.files[path].hash).toMatch(/^[a-f0-9]{64}$/);
      expect(lock.items["human-corrects-ai-output"].files).toContain(path);
      expect(await readFile(join(cwd,path),"utf8")).toBe(AUTHORED_MODULES[module]!.content);
    }
    expect(await readFile(join(cwd,"src/widgets/LICENSE"),"utf8")).toBe(AUTHORED_LICENSE);
    expect(await exists(join(cwd,"components/mcpcn/provider.tsx"))).toBe(false);
  }));

  it("retains previous item ownership and source bytes across repeated and additive installs",async()=>withProject(async({cwd,invoke})=>{
    await invoke(initArgs);
    expect((await invoke(["add","button"])).code).toBe(0);
    const before=await readFile(join(cwd,"components/mcpcn/button.tsx"),"utf8");
    expect((await invoke(["add","badge"])).code).toBe(0);
    expect((await invoke(["add","button"])).code).toBe(0);
    const lock=JSON.parse(await readFile(join(cwd,"mcpcn.lock.json"),"utf8"));
    expect(Object.keys(lock.items).sort()).toEqual(["badge","button"]);
    expect(lock.items.button.files).toContain("components/mcpcn/button.tsx");
    expect(lock.items.badge.files).toContain("components/mcpcn/badge.tsx");
    expect(await readFile(join(cwd,"components/mcpcn/button.tsx"),"utf8")).toBe(before);
  }));

  it("refuses an additive install when any previously owned unselected source was edited",async()=>withProject(async({cwd,invoke})=>{
    await invoke(initArgs);
    expect((await invoke(["add","button"])).code).toBe(0);
    const lockBefore=await readFile(join(cwd,"mcpcn.lock.json"),"utf8");
    const edited='// Authored owner edit; preserve exactly.\nexport const OwnerButton = true;\n';
    await writeFile(join(cwd,"components/mcpcn/button.tsx"),edited);
    const result=await invoke(["add","badge"]);
    expect(result.code).toBe(1);
    expect(await readFile(join(cwd,"components/mcpcn/button.tsx"),"utf8")).toBe(edited);
    expect(await readFile(join(cwd,"mcpcn.lock.json"),"utf8")).toBe(lockBefore);
    expect(await exists(join(cwd,"components/mcpcn/badge.tsx"))).toBe(false);
  }));

  it("validates every later response before making any source or lockfile write",async()=>withProject(async({cwd,invoke})=>{
    await invoke(initArgs);
    const before=(await readdir(cwd)).sort();
    const result=await invoke(["add","button","badge"],fakeRegistry((name,value)=>name==="badge"?{...value,files:[]}:value));
    expect(result.code).toBe(1);
    expect((await readdir(cwd)).sort()).toEqual(before);
    expect(await exists(join(cwd,"components/mcpcn/button.tsx"))).toBe(false);
    expect(await exists(join(cwd,"mcpcn.lock.json"))).toBe(false);
  }));

  it("reports unavailable registry responses finitely without fallback sources or private failure text",async()=>withProject(async({cwd,invoke})=>{
    await invoke(initArgs);
    const marker="AUTHORED_PRIVATE_TOKEN /authored/private/source";
    const transport:typeof globalThis.fetch=async()=>{throw new Error(marker);};
    const result=await invoke(["add","button"],transport);
    expect(result.code).toBe(1);
    expect(result.errors).toEqual(["mcpcn: registry_unavailable"]);
    expect([...result.logs,...result.errors].join("\n")).not.toContain(marker);
    expect(await exists(join(cwd,"components/mcpcn/button.tsx"))).toBe(false);
    expect(await exists(join(cwd,"mcpcn.lock.json"))).toBe(false);
    const upstream=await invoke(["add","button"],async()=>new Response(marker,{status:503}));
    expect(upstream.code).toBe(1);
    expect(upstream.errors).toEqual(["mcpcn: registry_unavailable"]);
    expect(upstream.errors.join("\n")).not.toContain(marker);
  }));

  it("refuses symlink parents and existing symlink leaves while preserving owned outside fixtures",async()=>{
    await withProject(async({root,cwd,invoke})=>{
      await invoke(initArgs);
      const outside=join(root,"outside");await mkdir(outside);
      await writeFile(join(outside,"sentinel.txt"),"authored outside sentinel");
      await symlink(outside,join(cwd,"components"),"dir");
      expect((await invoke(["add","button"])).code).toBe(1);
      expect((await readdir(outside)).sort()).toEqual(["sentinel.txt"]);
      expect(await readFile(join(outside,"sentinel.txt"),"utf8")).toBe("authored outside sentinel");
      expect(await exists(join(cwd,"mcpcn.lock.json"))).toBe(false);
    });
    await withProject(async({root,cwd,invoke})=>{
      await invoke(initArgs);await mkdir(join(cwd,"components/mcpcn"),{recursive:true});
      const outside=join(root,"outside.tsx");await writeFile(outside,"// authored outside source\n");
      await symlink(outside,join(cwd,"components/mcpcn/button.tsx"),"file");
      expect((await invoke(["add","button"])).code).toBe(1);
      expect(await readFile(outside,"utf8")).toBe("// authored outside source\n");
      expect(await exists(join(cwd,"mcpcn.lock.json"))).toBe(false);
    });
  });

  it("rejects traversal and noncanonical registry paths before writing even valid earlier files",async()=>withProject(async({root,cwd,invoke})=>{
    await invoke(initArgs);
    for(const path of ["components/mcpcn/../../outside.tsx","/absolute-authored.tsx","components/mcpcn/unexpected.tsx"]) {
      const result=await invoke(["add","button"],fakeRegistry((_name,value)=>({...value,files:[...value.files,{path,type:"registry:component",content:"export const Authored = true;\n"}]})));
      expect(result.code).toBe(1);
      expect(await exists(join(cwd,"components/mcpcn/button.tsx"))).toBe(false);
      expect(await exists(join(cwd,"mcpcn.lock.json"))).toBe(false);
    }
    expect(await exists(join(root,"outside.tsx"))).toBe(false);
  }));

  it("rejects conflicting shared source bytes across selected payloads instead of taking the last response",async()=>withProject(async({cwd,invoke})=>{
    await invoke(initArgs);
    const result=await invoke(["add","button","badge"],fakeRegistry((name,value)=>({...value,files:value.files.map(file=>name==="badge" && file.path===PREFIX+"_mcpcn/core.ts"?{...file,content:"export const authoredCore = false;\n"}:file)})));
    expect(result.code).toBe(1);
    expect(await exists(join(cwd,"components/mcpcn/button.tsx"))).toBe(false);
    expect(await exists(join(cwd,"components/mcpcn/badge.tsx"))).toBe(false);
    expect(await exists(join(cwd,"mcpcn.lock.json"))).toBe(false);
  }));

  it("preserves legacy and incomplete ownership files and excludes a concurrent install until its owner releases the lock",async()=>{
    await withProject(async({cwd,invoke})=>{
      await invoke(initArgs);
      const legacy=json({version:1,items:{button:{hash:"0".repeat(64),path:"components/mcpcn/button.tsx",source:"authored"}}});
      await writeFile(join(cwd,"mcpcn.lock.json"),legacy);
      const result=await invoke(["add","button"]);
      expect(result.code).toBe(1);
      expect(result.errors).toEqual(["mcpcn: legacy_lock_unsupported"]);
      expect(await readFile(join(cwd,"mcpcn.lock.json"),"utf8")).toBe(legacy);
      await rm(join(cwd,"mcpcn.lock.json"));
      expect((await invoke(["add","button"])).code).toBe(0);
      const incomplete=JSON.parse(await readFile(join(cwd,"mcpcn.lock.json"),"utf8"));
      incomplete.items.button.files=["components/mcpcn/button.tsx"];
      const incompleteBytes=json(incomplete);
      await writeFile(join(cwd,"mcpcn.lock.json"),incompleteBytes);
      const refused=await invoke(["add","badge"]);
      expect(refused.code).toBe(1);
      expect(refused.errors).toEqual(["mcpcn: lock_invalid"]);
      expect(await readFile(join(cwd,"mcpcn.lock.json"),"utf8")).toBe(incompleteBytes);
      expect(await exists(join(cwd,"components/mcpcn/button.tsx"))).toBe(true);
      expect(await exists(join(cwd,"components/mcpcn/badge.tsx"))).toBe(false);
    });
    await withProject(async({cwd,invoke})=>{
      await invoke(initArgs);
      const entered=deferred<void>(),release=deferred<Response>();
      const first=invoke(["add","button"],async()=>{entered.resolve(undefined);return release.promise;});
      await Promise.race([entered.promise,first.then(()=>{throw new Error("The authored first request did not reach its transport");})]);
      try {
        const second=await invoke(["add","badge"]);
        expect(second.code).toBe(1);
        expect(second.errors).toEqual(["mcpcn: lock_busy"]);
      } finally {release.resolve(Response.json(payload("button")));await first;}
      expect((await first).code).toBe(0);
      expect(await exists(join(cwd,"components/mcpcn/badge.tsx"))).toBe(false);
      expect((await invoke(["add","badge"])).code).toBe(0);
    });
  });

  it("requires the full current source profile and preserves exact prior-profile locks for explicit review",async()=>{
    const priorSuffixes=new Set<string>([...PRIOR_SOURCE_MODULE_PATHS,"styles.css","LICENSE","provider.tsx","_mcpcn/blocks.tsx"]);
    await withProject(async({cwd,invoke})=>{
      await invoke(initArgs);
      const before=(await readdir(cwd)).sort();
      const result=await invoke(["add","button"],fakeRegistry((_name,value)=>({...value,files:value.files.filter(file=>{
        const suffix=file.path.slice(PREFIX.length);
        return suffix==="button.tsx" || priorSuffixes.has(suffix);
      })})));
      expect(result.code).toBe(1);
      expect(result.errors).toEqual(["mcpcn: registry_invalid"]);
      expect((await readdir(cwd)).sort()).toEqual(before);
      expect(await exists(join(cwd,"components/mcpcn/button.tsx"))).toBe(false);
      expect(await exists(join(cwd,"mcpcn.lock.json"))).toBe(false);
      await expectNoTransactionDebris(cwd);
    });
    for(const slug of ["button","human-corrects-ai-output"]) await withProject(async({cwd,invoke})=>{
      await invoke(initArgs);
      const config=JSON.parse(await readFile(join(cwd,"mcpcn.json"),"utf8"));
      const entry=(slug==="button"?"":"blocks/")+slug+".tsx";
      const legacyFiles=payload(slug).files.filter(file=>{
        const suffix=file.path.slice(PREFIX.length);
        return suffix===entry || priorSuffixes.has(suffix);
      });
      const files:Record<string,{hash:string;source:string}>={}, originals=new Map<string,Buffer>();
      for(const file of legacyFiles) {
        const bytes=Buffer.from(file.path===PREFIX+"provider.tsx"?renderProvider(config):file.content);
        await mkdir(dirname(join(cwd,file.path)),{recursive:true});
        await writeFile(join(cwd,file.path),bytes,{flag:"wx"});
        originals.set(file.path,bytes);
        files[file.path]={hash:createHash("sha256").update(bytes).digest("hex"),source:REGISTRY+"/"+slug+".json"};
      }
      const lock={version:2,configHash:createHash("sha256").update(json(config)).digest("hex"),files,items:{[slug]:{files:Object.keys(files)}}};
      const previous=json(lock); await writeFile(join(cwd,"mcpcn.lock.json"),previous,{flag:"wx"});
      let fetched=0;
      const forbidden:typeof globalThis.fetch=async()=>{fetched++;throw new Error("Prior profile must not fetch or migrate");};
      const refused=await invoke(["add","badge"],forbidden);
      expect(refused.code).toBe(1);
      expect(refused.errors).toEqual(["mcpcn: source_profile_upgrade_required"]);
      expect(fetched).toBe(0);
      expect(await readFile(join(cwd,"mcpcn.lock.json"),"utf8")).toBe(previous);
      for(const [path,bytes] of originals) expect(await readFile(join(cwd,path))).toEqual(bytes);
      for(const path of EXPECTED_SOURCE_MODULE_PATHS.filter(path=>!PRIOR_SOURCE_MODULE_PATHS.some(prior=>prior===path))) expect(await exists(join(cwd,PREFIX+path))).toBe(false);
      expect(await exists(join(cwd,"components/mcpcn/badge.tsx"))).toBe(false);
      await expectNoTransactionDebris(cwd);

      // A damaged old-looking closure is not an exact recognized profile.
      lock.items[slug]!.files=lock.items[slug]!.files.filter(path=>path!==PREFIX+"provider.tsx");
      const damaged=json(lock); await writeFile(join(cwd,"mcpcn.lock.json"),damaged);
      const invalid=await invoke(["add","badge"],forbidden);
      expect(invalid.errors).toEqual(["mcpcn: lock_invalid"]);
      expect(await readFile(join(cwd,"mcpcn.lock.json"),"utf8")).toBe(damaged);
      expect(fetched).toBe(0); await expectNoTransactionDebris(cwd);
    });
  });

  it("keeps package installation explicit and generates the selected provider without fetching or inventing installed packages",async()=>withProject(async({cwd,invoke})=>{
    let calls=0;
    const forbidden:typeof globalThis.fetch=async()=>{calls++;throw new Error("Authored fixture forbids package-mode fetch");};
    expect((await invoke(["init","--package","--style=violet","--host=openai","--manager=npm",`--registry=${REGISTRY}`],forbidden)).code).toBe(0);
    const result=await invoke(["add","button"],forbidden);
    expect(result.code).toBe(0);
    expect(calls).toBe(0);
    const config=JSON.parse(await readFile(join(cwd,"mcpcn.json"),"utf8"));
    expect(config.mode).toBe("package");
    expect(await readFile(join(cwd,"components/mcpcn/provider.tsx"),"utf8")).toBe(renderProvider(config));
    expect(await readFile(join(cwd,"components/mcpcn/button.tsx"),"utf8")).toContain('from "@mcpcn/react"');
    expect(result.logs.join("\n")).toContain("npm install");
    expect(result.logs.join("\n")).toContain("@mcpcn/runtime");
    expect(await exists(join(cwd,"node_modules"))).toBe(false);
    expect(JSON.parse(await readFile(join(cwd,"package.json"),"utf8"))).toEqual({private:true,type:"module",dependencies:{react:"^19.2.0"}});
  }));

  it("rolls back acknowledged partial writes and fsync failures without removing preexisting user files",async()=>{
    for(const mode of ["partial-write","fsync"] as const) await withProject(async({cwd,invoke})=>{
      await invoke(initArgs);
      await mkdir(join(cwd,"components"));
      await writeFile(join(cwd,"components/user-note.txt"),"Authored existing user file.\n");
      const before=(await readdir(cwd)).sort();
      await withFault(mode,cwd,async()=>{
        const result=await invoke(["add","button"]);
        expect(result.code).toBe(1);
        expect(result.errors).toEqual(["mcpcn: io_error"]);
        expect(faults.failures).toBe(1);
        if(mode==="partial-write") {
          expect(faults.partialBytes).toBeGreaterThan(0);
          expect(faults.partialBytes).toBeLessThan(Buffer.byteLength("export const authoredCore = true;\n"));
          expect(faults.writeCalls).toBe(2);
        }
        expect([...result.logs,...result.errors].join("\n")).not.toContain("AUTHORED_PRIVATE_FS_FAILURE");
      });
      expect(await readFile(join(cwd,"components/user-note.txt"),"utf8")).toBe("Authored existing user file.\n");
      expect(await exists(join(cwd,"components/mcpcn"))).toBe(false);
      expect(await exists(join(cwd,"mcpcn.lock.json"))).toBe(false);
      expect((await readdir(cwd)).sort()).toEqual(before);
      await expectNoTransactionDebris(cwd);
    });
  });

  it("retains a same-inode owner edit during failed installation and reports incomplete cleanup",async()=>withProject(async({cwd,invoke})=>{
    await invoke(initArgs);
    await writeFile(join(cwd,"user-note.txt"),"Authored retained note.\n");
    await withFault("edited-fsync",cwd,async()=>{
      const result=await invoke(["add","button"]);
      expect(result.code).toBe(1);
      expect(result.errors).toEqual(["mcpcn: cleanup_incomplete"]);
      expect(faults.failures).toBe(1);
      expect(faults.sameInode).toBe(true);
      expect(await readFile(faults.source,"utf8")).toBe(faults.editedBytes);
      expect(await exists(join(cwd,"components/mcpcn/button.tsx"))).toBe(false);
      expect(await exists(join(cwd,"components/mcpcn/LICENSE"))).toBe(false);
      expect(await exists(join(cwd,"mcpcn.lock.json"))).toBe(false);
      expect(result.errors.join("\n")).not.toContain(cwd);
    });
    expect(await readFile(join(cwd,"user-note.txt"),"utf8")).toBe("Authored retained note.\n");
    await expectNoTransactionDebris(cwd);
  }));

  it("retains a published manifest and every referenced source when its post-link readback fails",async()=>{
    for(const mode of ["manifest-readback","link-ack-replaced"] as const) await withProject(async({cwd,invoke})=>{
      await invoke(initArgs);
      await withFault(mode,cwd,async()=>{
        const result=await invoke(["add","button"]);
        expect(result.code).toBe(1);
        expect(result.errors).toEqual([mode==="manifest-readback"?"mcpcn: io_error":"mcpcn: cleanup_incomplete"]);
        expect(faults.linked).toBe(true);
        expect(faults.failures).toBe(1);
        expect(result.logs.some(line=>line.startsWith("Installed "))).toBe(false);
        const installed=JSON.parse(await readFile(join(cwd,"mcpcn.lock.json"),"utf8"));
        expect(installed.version).toBe(2);
        expect(installed.items.button.files).toContain("components/mcpcn/button.tsx");
        expect(Object.keys(installed.files).sort()).toEqual(payload("button").files.map(file=>file.path).sort());
        expect([...installed.items.button.files].sort()).toEqual(Object.keys(installed.files).sort());
        for(const [path,entry] of Object.entries(installed.files) as [string,{hash:string}][]) {
          expect(createHash("sha256").update(await readFile(join(cwd,path))).digest("hex")).toBe(entry.hash);
        }
        if(mode==="link-ack-replaced") {
          expect(faults.replacementIdentity).not.toEqual(faults.publishedIdentity);
          const retained=await lstat(join(cwd,"mcpcn.lock.json"));
          expect({dev:retained.dev,ino:retained.ino}).toEqual(faults.replacementIdentity);
          expect(await readFile(join(cwd,"mcpcn.lock.json"),"utf8")).toBe(faults.replacementBytes);
        }
        expect(result.errors.join("\n")).not.toContain("AUTHORED_PRIVATE_FS_FAILURE");
        await expectNoTransactionDebris(cwd);
      });
      if(mode==="manifest-readback") expect((await invoke(["add","button"])).code).toBe(0);
    });
  });

  it("preserves the old manifest and sources when additive publication fails before rename",async()=>withProject(async({cwd,invoke})=>{
    await invoke(initArgs);
    expect((await invoke(["add","button"])).code).toBe(0);
    const oldManifest=await readFile(join(cwd,"mcpcn.lock.json"));
    const oldLock=JSON.parse(oldManifest.toString("utf8"));
    const oldFiles=new Map<string,Buffer>();
    for(const path of Object.keys(oldLock.files)) oldFiles.set(path,await readFile(join(cwd,path)));
    await writeFile(join(cwd,"user-note.txt"),"Authored retained note.\n");
    await withFault("manifest-rename",cwd,async()=>{
      const result=await invoke(["add","badge"]);
      expect(result.code).toBe(1);
      expect(result.errors).toEqual(["mcpcn: io_error"]);
      expect(faults.failures).toBe(1);
      expect(await readFile(join(cwd,"mcpcn.lock.json"))).toEqual(oldManifest);
      for(const [path,bytes] of oldFiles) expect(await readFile(join(cwd,path))).toEqual(bytes);
      expect(await exists(join(cwd,"components/mcpcn/badge.tsx"))).toBe(false);
      expect(await readFile(join(cwd,"user-note.txt"),"utf8")).toBe("Authored retained note.\n");
      expect(result.errors.join("\n")).not.toContain("AUTHORED_PRIVATE_FS_FAILURE");
      await expectNoTransactionDebris(cwd);
    });
    expect((await invoke(["add","badge"])).code).toBe(0);
  }));
});

#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { blockCatalog, catalog } from "./catalog.js";
import { configSchema, defaultConfig, renderProvider } from "./installation.js";
import { buildSourceRegistry } from "./source-registry.js";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../../../");
const command=process.argv[2]??"build";
if(command!=="build" && command!=="validate") throw new Error("registry_command_invalid");
const {registry,items}=await buildSourceRegistry({catalog,blockCatalog,readSource:path=>readFile(resolve(root,path),"utf8"),providerSource:renderProvider(defaultConfig)});
if(command==="build") {
  const json=(value:unknown)=>JSON.stringify(value,null,2)+"\n";
  const write=async(path:string,value:unknown)=>{
    const target=resolve(root,"registry",path);
    await mkdir(dirname(target),{recursive:true});
    await writeFile(target,json(value));
  };
  await write("registry.json",registry);
  await write("config.schema.json",configSchema);
  for(const item of items) {
    await write(`${item.name}.json`,item);
    await write(`items/${item.name}.json`,item);
  }
  console.log(`Built ${items.length} source registry items`);
} else console.log(`Validated ${items.length} source registry items`);

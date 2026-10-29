import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { blockCatalog, catalog } from "../packages/registry/src/catalog.ts";
import { configSchema, defaultConfig, renderProvider } from "../packages/registry/src/installation.ts";
import { buildSourceRegistry } from "../packages/registry/src/source-registry.ts";

const root=resolve(import.meta.dirname,"..");
const {registry,items}=await buildSourceRegistry({catalog,blockCatalog,readSource:path=>readFile(resolve(root,path),"utf8"),providerSource:renderProvider(defaultConfig)});
const json=(value:unknown)=>JSON.stringify(value,null,2)+"\n";
async function writeText(path:string,value:string) {
  const target=resolve(root,path);
  await mkdir(dirname(target),{recursive:true});
  await writeFile(target,value);
}
const write=(path:string,value:unknown)=>writeText(path,json(value));
await write("registry/registry.json",registry);
await write("registry/config.schema.json",configSchema);
for(const item of items) {
  await write(`registry/${item.name}.json`,item);
  await write(`registry/items/${item.name}.json`,item);
}
const license=await readFile(resolve(root,"LICENSE"),"utf8");
for(const name of ["core","schemas","runtime","react","themes","registry","cli"]) {
  await writeText(`packages/${name}/LICENSE`,license);
}
console.log(`Generated ${items.length} source registry items; examples and templates were preserved.`);

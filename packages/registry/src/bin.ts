#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { blockCatalog, catalog } from "./catalog.js";
import type { RegistryItem } from "./index.js";
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,"../../../");
const output=resolve(root,"registry");
const componentSource=(item:typeof catalog[number])=>`import { ${item.name} } from "@mcpcn/react"\nexport { ${item.name} }\n`;
const items:RegistryItem[]=catalog.map(item=>({name:item.slug,type:"registry:ui",title:item.name,description:item.description,dependencies:item.dependencies??[],registryDependencies:item.registryDependencies??[],files:[{path:`components/mcpcn/${item.slug}.tsx`,type:"registry:component",content:componentSource(item)}],meta:{category:item.category,security:item.security,docs:`https://mcpcn.dev/components/${item.slug}`}}));
const blockItems:RegistryItem[]=blockCatalog.map(block=>({name:block.name,type:"registry:block",title:block.name.split("-").map(v=>v[0]?.toUpperCase()+v.slice(1)).join(" "),description:block.description,dependencies:["@mcpcn/react","@mcpcn/runtime","@mcpcn/schemas"],registryDependencies:block.components,files:[{path:`components/mcpcn/blocks/${block.name}.tsx`,type:"registry:component",content:`export const block = ${JSON.stringify(block,null,2)} as const\n`}],meta:{components:block.components,docs:`https://mcpcn.dev/blocks/${block.name}`}}));
async function build(){await mkdir(output,{recursive:true});const all=[...items,...blockItems];await writeFile(resolve(output,"registry.json"),JSON.stringify({$schema:"https://ui.shadcn.com/schema/registry.json",name:"mcpcn",homepage:"https://mcpcn.dev",items:all.map(({files,...item})=>({...item,files:files.map(({content,...file})=>file)}))},null,2)+"\n");for(const item of all)await writeFile(resolve(output,`${item.name}.json`),JSON.stringify({$schema:"https://ui.shadcn.com/schema/registry-item.json",...item},null,2)+"\n");console.log(`Built ${all.length} registry items in ${output}`)}
async function validate(){const names=new Set<string>();for(const item of [...items,...blockItems]){if(names.has(item.name))throw new Error(`Duplicate item ${item.name}`);names.add(item.name);if(!item.description||!item.files.length)throw new Error(`Incomplete item ${item.name}`)}console.log(`Validated ${names.size} registry items`)}
const command=process.argv[2]??"build";
if(command==="build")await build();else if(command==="validate")await validate();else throw new Error(`Unknown registry command: ${command}`);

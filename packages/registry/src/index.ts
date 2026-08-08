export * from "./catalog.js";
export type RegistryItem={name:string;type:"registry:ui"|"registry:block";title:string;description:string;dependencies:string[];registryDependencies:string[];files:Array<{path:string;type:"registry:component"|"registry:lib";content:string}>;meta:Record<string,unknown>};

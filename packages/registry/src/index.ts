export * from "./catalog.js";
export type RegistryFile = { path:string; type:"registry:component"|"registry:lib"|"registry:style"; content:string };
export type RegistryItem = {
  $schema:string;
  name:string;
  type:"registry:ui"|"registry:block";
  title:string;
  description:string;
  dependencies:string[];
  registryDependencies:string[];
  files:RegistryFile[];
  meta:Record<string,unknown>;
};

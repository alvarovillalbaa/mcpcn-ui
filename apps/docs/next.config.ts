import type { NextConfig } from "next";
const config:NextConfig={transpilePackages:["@mcpcn/react","@mcpcn/runtime","@mcpcn/registry"],experimental:{optimizePackageImports:["@mcpcn/react"]}};
export default config;

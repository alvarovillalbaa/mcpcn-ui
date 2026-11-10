import type { MCPCNPayload } from "@mcpcn/core";

/** Registration example for an authored public fixture; the caller owns schemas. */
export function serverSnippet(payload: MCPCNPayload<string, unknown>) {
  const slug = payload.kind.slice(6);
  if (payload.version !== 1 || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug) || payload.kind !== `mcpcn/${slug}`) throw new Error("Invalid fixture component.");
  return `import { z } from "zod";\nimport { registerComponentApp, createStructuredResult } from "@mcpcn/server";\n\n// Authored public fixture only. Supply model-safe data and enforce authorization.\n// Private UI data belongs in deliberate _meta, never in this public fixture.\nconst fixture = ${JSON.stringify(payload.data, null, 2)};\n\n// Supply your MCP server, bundled HTML and the real output data schema.\nexport function registerPreview(\n  server: Parameters<typeof registerComponentApp>[0],\n  appHtml: string,\n  outputSchema: z.ZodType,\n) {\n  return registerComponentApp(server, {\n    name: ${JSON.stringify(`review_${slug.replaceAll("-", "_")}`)},\n    description: ${JSON.stringify(`Review authored ${slug} output`)},\n    component: ${JSON.stringify(slug)},\n    inputSchema: z.object({}).strict(),\n    outputSchema,\n    readOnly: true,\n    html: appHtml,\n    handler: () => createStructuredResult(${JSON.stringify(slug)}, fixture),\n  });\n}\n`;
}

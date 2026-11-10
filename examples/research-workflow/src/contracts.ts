import { z } from "zod";

export const researchSources = [
  { id: "apps-readme", title: "Official MCP Apps overview", url: "https://raw.githubusercontent.com/modelcontextprotocol/ext-apps/v1.7.5/README.md" },
  { id: "sdk-readme", title: "Official TypeScript SDK overview", url: "https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.30.0/README.md" },
  { id: "apps-spec", title: "Pinned MCP Apps specification", url: "https://raw.githubusercontent.com/modelcontextprotocol/ext-apps/v1.7.5/specification/2026-01-26/apps.mdx" },
] as const;
export const ResearchStateSchema = z.object({ status: z.enum(["pending", "partial", "gathered", "completed"]), question: z.string().min(1).max(2000),
  sources: z.array(z.object({ id: z.string(), title: z.string().min(1).max(300), url: z.string().url().refine(url => researchSources.some(source => source.url === url)), status: z.enum(["pending", "succeeded", "failed"]), text: z.string().max(65536), error: z.string().max(300) }).strict()).min(1).max(10),
  conclusion: z.string().max(10000),
}).strict();
export const ResearchProposalSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("gather") }).strict(),
  z.object({ action: z.literal("retry"), sourceId: z.string().min(1).max(80) }).strict(),
  z.object({ action: z.literal("decide"), conclusion: z.string().trim().min(20).max(10000) }).strict(),
]);
export const researchSeed: z.input<typeof ResearchStateSchema> = { status: "pending", question: "Which MCP Apps boundaries should an integration review before release?",
  sources: researchSources.map(source => ({ ...source, status: "pending", text: "", error: "" })), conclusion: "" };

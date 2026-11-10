import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApprovalCardSchema } from "@mcpcn/schemas";
import { registerComponentApp, createStructuredResult } from "@mcpcn/server";

// Supply your bundled MCP App HTML. This example returns public authored data.
export function createReviewServer(appHtml: string) {
  const server = new McpServer({ name: "authored-review", version: "1.0.0" });
  registerComponentApp(server, {
    name: "review_authored_action",
    description: "Inspect a public authored action without executing it.",
    component: "approval-card",
    inputSchema: z.object({ reviewId: z.string().regex(/^[a-z0-9-]{1,80}$/) }).strict(),
    outputSchema: ApprovalCardSchema,
    visibility: ["model", "app"],
    readOnly: true,
    html: appHtml,
    handler: ({ reviewId }) => {
      const data = {
        title: "Review an authored action",
        description: "Public authored review " + reviewId,
        riskLevel: "medium",
        actionLabel: "Request approval",
        requiresExplicitConsent: true,
        changes: [{ label: "Authored setting", before: "Off", after: "On" }],
      } satisfies z.input<typeof ApprovalCardSchema>;
      return createStructuredResult("approval-card", data, { stateVersion: 0 });
    },
  });
  return server;
}

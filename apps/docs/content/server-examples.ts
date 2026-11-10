export const publicServerExample = `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
`;

export const validateResultExample = `import { ApprovalCardSchema } from "@mcpcn/schemas";
import { validateToolResult } from "@mcpcn/server";

export async function inspectResult(candidate: unknown) {
  const checked = await validateToolResult("approval-card", ApprovalCardSchema, candidate);
  if (!checked.success) throw new Error("The supplied tool result is invalid.");
  return checked.data;
}
`;

export const privateResultExample = `import { z } from "zod";
import { PrivacyBoundaryCardSchema } from "@mcpcn/schemas";
import { createStructuredResult } from "@mcpcn/server";

// Advertise this model-safe DATA schema when registering this particular tool.
export const PublicReviewSchema = z.object({
  reviewId: z.string(), revision: z.string(), state: z.enum(["ready", "loading", "empty", "error"]),
}).strict();

// Call only after your server has authorized access to the supplied review.
export function createPrivateReviewResult(candidate: unknown) {
  const review = PrivacyBoundaryCardSchema.parse(candidate);
  const publicData = PublicReviewSchema.parse({ reviewId: review.id, revision: review.revision, state: review.state });
  return createStructuredResult("privacy-boundary-card", publicData, {
    text: "A privacy review is available in the app.",
    meta: { "example/private-review": review },
  });
}
// The app explicitly reads meta["example/private-review"] from useAgentApp(),
// validates it with PrivacyBoundaryCardSchema and renders the private review.
// That key is an example application convention, not automatic library routing.
`;

export const resourceExample = `import { registerComponentResource } from "@mcpcn/server";

export function registerReviewResource(server: Parameters<typeof registerComponentResource>[0], appHtml: string) {
  return registerComponentResource(server, {
    component: "approval-card",
    resourceUri: "ui://reviews/approval.html",
    html: async () => appHtml,
    csp: {
      connectDomains: [],
      resourceDomains: ["https://cdn.example.com"],
      frameDomains: [],
      baseUriDomains: ["https://cdn.example.com"],
    },
  });
}
`;

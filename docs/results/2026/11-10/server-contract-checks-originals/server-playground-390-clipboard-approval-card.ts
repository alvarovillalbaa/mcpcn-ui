import { z } from "zod";
import { registerComponentApp, createStructuredResult } from "@mcpcn/server";

// Authored public fixture only. Supply model-safe data and enforce authorization.
// Private UI data belongs in deliberate _meta, never in this public fixture.
const fixture = {
  "title": "Approve authored changes",
  "riskLevel": "medium",
  "actionLabel": "Approve",
  "cancelLabel": "Cancel",
  "changes": [
    {
      "label": "Document status",
      "before": "Draft",
      "after": "Reviewed"
    }
  ],
  "requiresExplicitConsent": true
};

// Supply your MCP server, bundled HTML and the real output data schema.
export function registerPreview(
  server: Parameters<typeof registerComponentApp>[0],
  appHtml: string,
  outputSchema: z.ZodType,
) {
  return registerComponentApp(server, {
    name: "review_approval_card",
    description: "Review authored approval-card output",
    component: "approval-card",
    inputSchema: z.object({}).strict(),
    outputSchema,
    readOnly: true,
    html: appHtml,
    handler: () => createStructuredResult("approval-card", fixture),
  });
}

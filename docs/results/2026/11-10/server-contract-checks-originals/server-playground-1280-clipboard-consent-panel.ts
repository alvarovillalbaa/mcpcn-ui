import { z } from "zod";
import { registerComponentApp, createStructuredResult } from "@mcpcn/server";

// Authored public fixture only. Supply model-safe data and enforce authorization.
// Private UI data belongs in deliberate _meta, never in this public fixture.
const fixture = {
  "id": "consent-1",
  "revision": "1",
  "title": "Review a current consent request",
  "state": "ready",
  "request": {
    "id": "consent-report",
    "revision": "1",
    "label": "Supplied consent request",
    "recipientLabel": "Authored review service",
    "purpose": "Review selected authored scopes.",
    "reportedDecision": "not-recorded",
    "scopes": [
      {
        "id": "scope-required",
        "revision": "1",
        "label": "Read authored summary",
        "description": "Required for this supplied request.",
        "required": true,
        "available": true
      },
      {
        "id": "scope-optional",
        "revision": "2",
        "label": "Read authored notes",
        "required": false,
        "available": true
      },
      {
        "id": "scope-unavailable",
        "revision": "3",
        "label": "Export authored records",
        "required": false,
        "available": false
      }
    ]
  },
  "approveAction": {
    "id": "approve",
    "revision": "1",
    "label": "Request consent approval",
    "available": true
  },
  "declineAction": {
    "id": "decline",
    "revision": "1",
    "label": "Decline consent request",
    "available": true
  }
};

// Supply your MCP server, bundled HTML and the real output data schema.
export function registerPreview(
  server: Parameters<typeof registerComponentApp>[0],
  appHtml: string,
  outputSchema: z.ZodType,
) {
  return registerComponentApp(server, {
    name: "review_consent_panel",
    description: "Review authored consent-panel output",
    component: "consent-panel",
    inputSchema: z.object({}).strict(),
    outputSchema,
    readOnly: true,
    html: appHtml,
    handler: () => createStructuredResult("consent-panel", fixture),
  });
}

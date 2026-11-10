import { registerComponentResource } from "@mcpcn/server";

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

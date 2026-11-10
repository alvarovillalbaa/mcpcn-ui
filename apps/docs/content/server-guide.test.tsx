// T2 authored docs/code. Real SDK/installed code checks remain separate.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ServerGuide from "../app/docs/server/page.js";
import Examples from "../app/examples/page.js";
import Docs from "../app/docs/page.js";
import { publicServerExample, validateResultExample, privateResultExample, resourceExample } from "./server-examples.js";

describe("T2 server integration documentation", () => {
  it("SV-D01 renders all four complete exported code examples", () => {
    const html = renderToStaticMarkup(<ServerGuide />);
    expect(html).toContain('aria-label="Validated MCP server guide"');
    for (const label of ["Public review server example", "Result validation example", "Private review result example", "Resource registration example"]) expect(html).toContain(`aria-label="${label}"`);
    for (const marker of ["createReviewServer", "inspectResult", "createPrivateReviewResult", "registerReviewResource"]) expect(html).toContain(marker);
  });
  it("SV-D02 provides a full read-only schema-first registration rather than execution claims", () => {
    expect(publicServerExample).toContain('new McpServer({ name: "authored-review"'); expect(publicServerExample).toContain("outputSchema: ApprovalCardSchema");
    expect(publicServerExample).toContain("inputSchema: z.object("); expect(publicServerExample).toContain("requiresExplicitConsent: true"); expect(publicServerExample).toContain("readOnly: true");
    expect(publicServerExample).not.toContain(".connect("); expect(publicServerExample).not.toContain(".listen("); expect(validateResultExample).toContain("await validateToolResult(");
  });
  it("SV-D03 separates model-safe schema/data from deliberately private metadata", () => {
    expect(privateResultExample).toContain("export const PublicReviewSchema"); expect(privateResultExample).toContain("PrivacyBoundaryCardSchema.parse(candidate)");
    expect(privateResultExample).toContain('meta: { "example/private-review": review }'); expect(privateResultExample).toContain("not automatic library routing");
    const html = renderToStaticMarkup(<ServerGuide />); expect(html).toContain("Server-only values must stay out of every client payload"); expect(html).toContain("does not grant access");
  });
  it("SV-D04 documents complete CSP, result bounds, cancellation and SDK proof limits", () => {
    for (const key of ["connectDomains", "resourceDomains", "frameDomains", "baseUriDomains"]) expect(resourceExample).toContain(key);
    const html = renderToStaticMarkup(<ServerGuide />);
    for (const text of ["4 MiB", "2 MiB", "SDK 1.30.0", "ext-apps 1.7.5", "Cancellation cannot roll back", "SDK-owned input diagnostics remain SDK-owned"]) expect(html).toContain(text);
  });
  it("SV-D05 accurately labels five existing UIs and links their actual source", () => {
    const html = renderToStaticMarkup(<Examples />);
    for (const slug of ["hr-candidate-review", "document-extraction", "ecommerce-checkout-review", "admin-settings-change", "research-workflow"]) expect(html).toContain(`/examples/${slug}`);
    expect(html).toContain("Connect your own authorized server and audit service"); expect(html).toContain("do not persist or execute external actions");
    expect(html).not.toContain("Five end-to-end reference integrations"); expect(html).not.toContain("Includes structured fixtures, component composition, runtime actions, server registration, and audit state");
  });
  it("SV-D06 exposes the real guide from getting-started and provides all section anchors", () => {
    expect(renderToStaticMarkup(<Docs />)).toContain('href="/docs/server"');
    const html = renderToStaticMarkup(<ServerGuide />);
    for (const id of ["first-tool", "validation", "private-data", "resources", "authorization", "compatibility"]) { expect(html).toContain(`href="#${id}"`); expect(html).toContain(`id="${id}"`); }
  });
});

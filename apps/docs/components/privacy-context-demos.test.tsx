import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { schemaBySlug } from "@mcpcn/schemas";
import { PrivacyContextDemo } from "./privacy-context-demos.js";
import { privacyContextExamples, privacyContextExampleCode, privacyContextNames, type PrivacyContextSlug } from "./privacy-context-examples.js";

describe("T2 privacy/context documentation", () => {
  it.each(Object.keys(privacyContextExamples) as PrivacyContextSlug[])("PC-D01 %s has a typed demonstration without automatic dispatch", slug => {
    expect(schemaBySlug[slug].safeParse(privacyContextExamples[slug]).success).toBe(true);
    expect(privacyContextExampleCode(slug)).toContain(`const data: ${privacyContextNames[slug]}Data`);
    const output = renderToStaticMarkup(<PrivacyContextDemo kind={slug} />);
    expect(output).toContain(`${privacyContextNames[slug]} demonstration`); expect(output).toContain("No request sent.");
    expect(output).toContain('aria-label="Privacy intent count"'); expect(output).not.toContain("is invalid");
    if (slug === "privacy-boundary-card" || slug === "model-context-preview") expect(output).toContain("COMPLETE_CONTEXT_END");
    if (slug === "consent-panel" || slug === "model-context-preview") expect(output).toContain('aria-label="Acknowledge current review"');
    const route = readFileSync(new URL("../app/components/[slug]/page.tsx", import.meta.url), "utf8");
    expect(route).toContain("const serverCode = privacyCode ?"); expect(route).toContain("modelSafeMetadata"); expect(route).toContain("privateAppPayload");
    expect(route).toContain("never place private review values in model-visible structuredContent or content");
  });
});

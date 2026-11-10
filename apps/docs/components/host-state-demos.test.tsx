import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { schemaBySlug } from "@mcpcn/schemas";
import { HostStateDemo } from "./host-state-demos.js";
import { hostStateExamples, hostStateExampleCode, hostStateNames, type HostStateSlug } from "./host-state-examples.js";

describe("T2 host state documentation", () => {
  it.each(Object.keys(hostStateExamples) as HostStateSlug[])("HS-D01 %s has a typed example and real demo", slug => {
    expect(schemaBySlug[slug].safeParse(hostStateExamples[slug]).success).toBe(true);
    const code = hostStateExampleCode(slug); expect(code).toContain(`const data: ${hostStateNames[slug]}Data`);
    const html = renderToStaticMarkup(<HostStateDemo kind={slug} />);
    expect(html).toContain(`${hostStateNames[slug]} demonstration`); expect(html).toContain("Request consumer review");
    expect(html).toContain('aria-label="Host-state intent count"'); expect(html).not.toContain("is invalid");
    expect(html).not.toContain("generic informational-card");
  });
});

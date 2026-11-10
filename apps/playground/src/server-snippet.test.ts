// T2 authored public fixture snippets. Compilation/protocol proof runs separately.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { makeFixture } from "./fixtures.js";
import { serverSnippet } from "./server-snippet.js";

describe("T2 server snippet contract", () => {
  it.each(["approval-card", "privacy-boundary-card", "review-before-action", "card"])("SV-S01 %s requires real Zod input/output registration", slug => {
    const source = serverSnippet(makeFixture(slug));
    expect(source).toContain('import { z } from "zod"'); expect(source).toContain("inputSchema: z.object({}).strict()");
    expect(source).toContain("outputSchema: z.ZodType"); expect(source).toContain("    outputSchema,"); expect(source).toContain("return registerComponentApp(server");
    expect(source).toContain(`component: ${JSON.stringify(slug)}`); expect(source).not.toContain('inputSchema: { type: "object"');
  });
  it("SV-S02 refuses malformed names, versions and injected component strings", () => {
    for (const fixture of [{ kind: "other/approval-card", version: 1, data: {} }, { kind: "mcpcn/approval-card", version: 2, data: {} }, { kind: 'mcpcn/x\"; execute();', version: 1, data: {} }]) expect(() => serverSnippet(fixture as never)).toThrow();
  });
  it("SV-S03 retains complete fixture values and safely quoted source literals", () => {
    const value = { count: 0, enabled: false, absent: null, complete: 'END </script> " quoted' };
    const source = serverSnippet({ kind: "mcpcn/authored-report", version: 1, data: value });
    const body = source.split("const fixture = ")[1]!.split(";\n\n// Supply")[0]!; expect(JSON.parse(body)).toEqual(value);
  });
  it("SV-S04 labels public fixture/authorization/private-channel responsibility explicitly", () => {
    const source = serverSnippet(makeFixture("consent-panel"));
    expect(source).toContain("Authored public fixture only"); expect(source).toContain("enforce authorization"); expect(source).toContain("Private UI data belongs in deliberate _meta"); expect(source).toContain("readOnly: true");
  });
  it("SV-S05 connects the actual copy button to the new schema requirement", () => {
    const source = readFileSync(new URL("./Simulator.tsx", import.meta.url), "utf8");
    expect(source).toContain('import { serverSnippet } from "./server-snippet.js"'); expect(source).toContain("navigator.clipboard.writeText(serverSnippet(");
    expect(source).toContain("Supply your server, app HTML and output data schema.");
  });
});

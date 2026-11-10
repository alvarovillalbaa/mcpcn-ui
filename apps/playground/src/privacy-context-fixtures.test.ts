import { describe, expect, it } from "vitest";
import { makeFixture, validateFixture, schemaFor } from "./fixtures";
import { privacyContextFixtures } from "./privacy-context-fixtures";

describe("T2 authored privacy/context playground", () => {
  it.each(Object.keys(privacyContextFixtures) as Array<keyof typeof privacyContextFixtures>)("PC-P01 %s uses a fresh strict four-state report", slug => {
    const a = makeFixture(slug), b = makeFixture(slug); expect(a).toEqual(b); expect(a.data).not.toBe(b.data);
    expect(validateFixture(a)).toMatchObject({ success: true }); expect(schemaFor(slug)?.oneOf ?? schemaFor(slug)?.anyOf).toHaveLength(4);
    expect(validateFixture({ ...a, data: { ...a.data as object, unexpected: true } })).toMatchObject({ success: false });
    expect(JSON.stringify(a.data)).not.toContain("GenericAgentComponent");
  });
});

import { describe, expect, it } from "vitest";
import { hostStateFixtures } from "./host-state-fixtures.js";
import { makeFixture, validateFixture, playgroundItems } from "./fixtures.js";

describe("T2 host state playground fixtures", () => {
  it.each(Object.entries(hostStateFixtures))("HS-F01 %s uses its actual specialized payload", (slug, data) => {
    const payload = makeFixture(slug);
    expect(payload.data).toEqual(data); expect(payload.kind).toBe(`mcpcn/${slug}`);
    expect(validateFixture(payload).success).toBe(true);
    expect(playgroundItems.find(item => item.slug === slug)?.kind).toBe("specialized");
    expect(validateFixture({ ...payload, data: { ...data, token: "not allowed" } }).success).toBe(false);
  });
});

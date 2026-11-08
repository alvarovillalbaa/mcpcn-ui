import { describe, expect, it } from "vitest";
import { schemaBySlug } from "@mcpcn/schemas";
import { controlledData } from "./component-preview";
import { makeFixture, playgroundItems, schemaFor, validateFixture } from "./fixtures";

const slugs = ["approval-checklist", "before-submit-confirmation", "destructive-action-guard", "human-override-panel", "permission-request-card"] as const;
const data = (slug: typeof slugs[number]) => makeFixture(slug).data as Record<string, unknown>;

describe("approval cohort playground fixtures and controlled intent", () => {
  it("provides five dedicated valid fixtures within the unchanged 79 item catalogue", () => {
    expect(playgroundItems).toHaveLength(79);
    expect(playgroundItems.filter(item => item.kind === "specialized")).toHaveLength(26);
    expect(playgroundItems.filter(item => item.kind === "generic-alias")).toHaveLength(30);
    for (const slug of slugs) {
      expect(playgroundItems.find(item => item.slug === slug)?.kind).toBe("specialized");
      expect(validateFixture(makeFixture(slug)).success).toBe(true);
      expect(schemaBySlug[slug].safeParse(makeFixture(slug).data).success).toBe(true);
      expect(schemaFor(slug)).toMatchObject({ type: "object", additionalProperties: false });
    }
  });
  it("keeps checklist selections consumer owned without approving or duplicating IDs", () => {
    const current = data("approval-checklist"), before = structuredClone(current);
    const action = { type: "check-item", data: { reviewId: current.reviewId, itemId: "scope", checked: true } };
    const next = controlledData("approval-checklist", current, action)!;
    expect(next).toEqual({ checkedItemIds: ["scope"] }); expect(current).toEqual(before);
    expect(controlledData("approval-checklist", { ...current, ...next }, action)).toEqual(next);
    expect(controlledData("approval-checklist", { ...current, ...next }, { ...action, data: { ...action.data, checked: false } })).toEqual({ checkedItemIds: [] });
    expect(controlledData("approval-checklist", current, { type: "approve-checklist", data: { reviewId: current.reviewId, itemIds: ["scope"] } })).toBeUndefined();
  });
  it("keeps permission scope selection separate from request or denial intent", () => {
    const current = data("permission-request-card");
    const action = { type: "select-scope", data: { reviewId: current.reviewId, scopeId: "documents.read", selected: true } };
    const next = controlledData("permission-request-card", current, action)!;
    expect(next).toEqual({ selectedScopeIds: ["documents.read"] });
    expect(controlledData("permission-request-card", { ...current, ...next }, { ...action, data: { ...action.data, selected: false } })).toEqual({ selectedScopeIds: [] });
    for (const type of ["request-permission", "deny-permission"]) expect(controlledData("permission-request-card", current, { type, data: { reviewId: current.reviewId, scopeIds: ["documents.read"] } })).toBeUndefined();
    expect(current.selectedScopeIds).toEqual([]);
  });
  it("acknowledges only current override choices without persisting reason or consent", () => {
    const current = data("human-override-panel");
    expect(controlledData("human-override-panel", current, { type: "select-override-option", data: { reviewId: current.reviewId, optionId: "manual" } })).toEqual({ selectedOptionId: "manual" });
    expect(controlledData("human-override-panel", current, { type: "override", data: { reviewId: current.reviewId, optionId: "manual", reason: "Authored reason" } })).toBeUndefined();
    expect(current).not.toHaveProperty("reason"); expect(current).not.toHaveProperty("consent");
  });
  it("refuses foreign review identities IDs and malformed controlled events", () => {
    const checklist = data("approval-checklist"), permission = data("permission-request-card"), override = data("human-override-panel");
    for (const value of [{ reviewId: "foreign", itemId: "scope", checked: true }, { reviewId: checklist.reviewId, itemId: "foreign", checked: true }, { reviewId: checklist.reviewId, itemId: "scope", checked: "true" }]) expect(controlledData("approval-checklist", checklist, { type: "check-item", data: value })).toBeUndefined();
    for (const value of [{ reviewId: "foreign", scopeId: "documents.read", selected: true }, { reviewId: permission.reviewId, scopeId: "foreign", selected: true }, { reviewId: permission.reviewId, scopeId: "documents.read", selected: 1 }]) expect(controlledData("permission-request-card", permission, { type: "select-scope", data: value })).toBeUndefined();
    for (const value of [{ reviewId: "foreign", optionId: "manual" }, { reviewId: override.reviewId, optionId: "foreign" }]) expect(controlledData("human-override-panel", override, { type: "select-override-option", data: value })).toBeUndefined();
  });
  it("refuses generic cards malformed terms and prefilled local approval state", () => {
    for (const slug of slugs) expect(validateFixture({ kind: `mcpcn/${slug}`, version: 1, data: { title: "Generic card", items: [] } }).success).toBe(false);
    const malformed = [
      ["approval-checklist", { checkedItemIds: ["foreign"] }], ["before-submit-confirmation", { fields: [{ id: "field", label: "Field", value: {} }] }],
      ["destructive-action-guard", { affectedCount: 0 }], ["human-override-panel", { selectedOptionId: "foreign" }], ["permission-request-card", { selectedScopeIds: ["foreign"] }],
    ] as const;
    for (const [slug, patch] of malformed) expect(validateFixture({ ...makeFixture(slug), data: { ...data(slug), ...patch } }).success).toBe(false);
    for (const [slug, patch] of [["destructive-action-guard", { typedConfirmation: "REMOVE DRAFTS" }], ["human-override-panel", { reason: "Prefilled reason" }], ["permission-request-card", { consent: true }]] as const) {
      expect(validateFixture({ ...makeFixture(slug), data: { ...data(slug), ...patch } }).success).toBe(false);
    }
  });
  it("returns detached parsed approval snapshots and rejects duplicate selections", () => {
    for (const slug of slugs) {
      const first = makeFixture(slug), second = makeFixture(slug); expect(first).toEqual(second); expect(first.data).not.toBe(second.data);
      const parsed = validateFixture(first); expect(parsed.success).toBe(true); if (parsed.success) expect(parsed.data.data).not.toBe(first.data);
    }
    for (const [slug, patch] of [["approval-checklist", { checkedItemIds: ["scope", "scope"] }], ["permission-request-card", { selectedScopeIds: ["documents.read", "documents.read"] }]] as const) {
      expect(validateFixture({ ...makeFixture(slug), data: { ...data(slug), ...patch } }).success).toBe(false);
    }
  });
});

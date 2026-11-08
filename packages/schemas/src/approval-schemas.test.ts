import { describe, expect, it } from "vitest";
import {
  ApprovalChecklistSchema, BeforeSubmitConfirmationSchema, DestructiveActionGuardSchema,
  HumanOverridePanelSchema, PermissionRequestCardSchema, GenericComponentSchema,
  RecordInspectorSchema, schemaBySlug, toJSONSchema,
} from "./index.js";

const checklist = () => ({ reviewId: "checklist-1", title: "Release review", items: [
  { id: "tests", label: "Review test results" }, { id: "notes", label: "Review notes", required: false },
] });
const submission = () => ({ reviewId: "submit-1", title: "Submit report", fields: [{ id: "name", label: "Name", value: "Report" }] });
const destructive = () => ({ reviewId: "delete-1", title: "Review removal", targetLabel: "Selected drafts", summary: "Remove the reviewed drafts.", affectedCount: 2, confirmationText: "REMOVE DRAFTS" });
const override = () => ({ reviewId: "override-1", title: "Review recommendation", recommendation: "Keep the draft.", options: [
  { id: "keep", label: "Keep draft" }, { id: "archive", label: "Archive draft" },
], recommendedOptionId: "keep" });
const permission = () => ({ reviewId: "permission-1", title: "Review access request", requester: "Report tool", purpose: "Read the selected report.", scopes: [
  { id: "read", label: "Read report" }, { id: "comment", label: "Add comments", required: false },
] });
const examples = () => [
  { schema: ApprovalChecklistSchema, data: checklist() },
  { schema: BeforeSubmitConfirmationSchema, data: submission() },
  { schema: DestructiveActionGuardSchema, data: destructive() },
  { schema: HumanOverridePanelSchema, data: override() },
  { schema: PermissionRequestCardSchema, data: permission() },
];

describe("approval cohort schemas", () => {
  it("exports five specialized public schemas without changing another generic alias", () => {
    expect(schemaBySlug["approval-checklist"]).toBe(ApprovalChecklistSchema);
    expect(schemaBySlug["before-submit-confirmation"]).toBe(BeforeSubmitConfirmationSchema);
    expect(schemaBySlug["destructive-action-guard"]).toBe(DestructiveActionGuardSchema);
    expect(schemaBySlug["human-override-panel"]).toBe(HumanOverridePanelSchema);
    expect(schemaBySlug["permission-request-card"]).toBe(PermissionRequestCardSchema);
    expect(RecordInspectorSchema).toBe(GenericComponentSchema);
    expect(ApprovalChecklistSchema).not.toBe(GenericComponentSchema);
  });

  it("rejects blank padded overlong and control-character review identities", () => {
    for (const { schema, data } of examples()) {
      for (const reviewId of ["", " ", " padded", "padded ", "line\nbreak", "nul\u0000", "del\u007f", "x".repeat(129)]) {
        expect(schema.safeParse({ ...data, reviewId }).success).toBe(false);
      }
      expect(schema.safeParse({ ...data, reviewId: "review-東京" }).success).toBe(true);
    }
  });

  it("bounds common text and refuses unknown payload or injected consent fields", () => {
    for (const { schema, data } of examples()) {
      expect(schema.safeParse({ ...data, title: " " }).success).toBe(false);
      expect(schema.safeParse({ ...data, title: "x".repeat(241) }).success).toBe(false);
      expect(schema.safeParse({ ...data, description: "x".repeat(2001) }).success).toBe(false);
      expect(schema.safeParse({ ...data, description: "escape\u001b" }).success).toBe(false);
      expect(schema.safeParse({ ...data, consent: true }).success).toBe(false);
      expect(schema.safeParse({ ...data, arbitrary: "ignored" }).success).toBe(false);
    }
  });

  it("defaults disabled to false and requires a boolean when supplied", () => {
    for (const { schema, data } of examples()) {
      expect(schema.parse(data).disabled).toBe(false);
      expect(schema.parse({ ...data, disabled: true }).disabled).toBe(true);
      expect(schema.safeParse({ ...data, disabled: "false" }).success).toBe(false);
    }
  });

  it("rejects nonboolean required flags in checklist items and permission scopes", () => {
    expect(ApprovalChecklistSchema.safeParse({ ...checklist(), items: [{ id: "a", label: "A", required: "true" }] }).success).toBe(false);
    expect(PermissionRequestCardSchema.safeParse({ ...permission(), scopes: [{ id: "a", label: "A", required: 1 }] }).success).toBe(false);
  });

  it("applies checklist required selection and action-label defaults", () => {
    const value = ApprovalChecklistSchema.parse(checklist());
    expect(value.items.map(item => item.required)).toEqual([true, false]);
    expect(value.checkedItemIds).toEqual([]);
    expect(value.approveLabel).toBe("Approve checklist");
    expect(value.cancelLabel).toBe("Cancel");
  });

  it("accepts both incomplete and complete current checklist states", () => {
    expect(ApprovalChecklistSchema.parse({ ...checklist(), checkedItemIds: [] }).checkedItemIds).toEqual([]);
    expect(ApprovalChecklistSchema.parse({ ...checklist(), checkedItemIds: ["notes", "tests"] }).checkedItemIds).toEqual(["notes", "tests"]);
  });

  it("requires nonempty unique checklist items and at least one required item", () => {
    expect(ApprovalChecklistSchema.safeParse({ ...checklist(), items: [] }).success).toBe(false);
    expect(ApprovalChecklistSchema.safeParse({ ...checklist(), items: [{ id: "a", label: "A" }, { id: "a", label: "Other" }] }).success).toBe(false);
    expect(ApprovalChecklistSchema.safeParse({ ...checklist(), items: [{ id: "a", label: "A", required: false }] }).success).toBe(false);
  });

  it("rejects duplicate or stale checked-item references", () => {
    expect(ApprovalChecklistSchema.safeParse({ ...checklist(), checkedItemIds: ["tests", "tests"] }).success).toBe(false);
    expect(ApprovalChecklistSchema.safeParse({ ...checklist(), checkedItemIds: ["removed"] }).success).toBe(false);
  });

  it("enforces checklist cardinality and bounded strict item text", () => {
    const items = Array.from({ length: 100 }, (_, index) => ({ id: `item-${index}`, label: "Item" }));
    expect(ApprovalChecklistSchema.safeParse({ ...checklist(), items }).success).toBe(true);
    expect(ApprovalChecklistSchema.safeParse({ ...checklist(), items: [...items, { id: "extra", label: "Extra" }] }).success).toBe(false);
    expect(ApprovalChecklistSchema.safeParse({ ...checklist(), items: [{ id: "a", label: "x".repeat(501) }] }).success).toBe(false);
    expect(ApprovalChecklistSchema.safeParse({ ...checklist(), items: [{ id: "a", label: "A", tool: "run" }] }).success).toBe(false);
  });

  it("preserves empty strings zero false null and finite submission primitives", () => {
    const values = ["", "line one\nline two", 0, false, null, 1.25, 1e100];
    const fields = values.map((value, index) => ({ id: `field-${index}`, label: "Field", value }));
    expect(BeforeSubmitConfirmationSchema.parse({ ...submission(), fields }).fields.map(field => field.value)).toEqual(values);
  });

  it("applies submission and fresh-consent display label defaults", () => {
    const value = BeforeSubmitConfirmationSchema.parse(submission());
    expect(value.submitLabel).toBe("Submit");
    expect(value.cancelLabel).toBe("Cancel");
    expect(value.consentLabel).toBe("I reviewed these fields and want to submit.");
  });

  it("rejects missing nested and nonfinite submitted field values", () => {
    for (const value of [undefined, {}, [], Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(BeforeSubmitConfirmationSchema.safeParse({ ...submission(), fields: [{ id: "a", label: "A", value }] }).success).toBe(false);
    }
    expect(BeforeSubmitConfirmationSchema.safeParse({ ...submission(), fields: [{ id: "a", label: "A" }] }).success).toBe(false);
  });

  it("rejects empty duplicate and excessive submitted field sets", () => {
    expect(BeforeSubmitConfirmationSchema.safeParse({ ...submission(), fields: [] }).success).toBe(false);
    expect(BeforeSubmitConfirmationSchema.safeParse({ ...submission(), fields: [{ id: "a", label: "A", value: 1 }, { id: "a", label: "A2", value: 2 }] }).success).toBe(false);
    const fields = Array.from({ length: 100 }, (_, index) => ({ id: `field-${index}`, label: "Field", value: null }));
    expect(BeforeSubmitConfirmationSchema.safeParse({ ...submission(), fields }).success).toBe(true);
    expect(BeforeSubmitConfirmationSchema.safeParse({ ...submission(), fields: [...fields, { id: "extra", label: "Extra", value: null }] }).success).toBe(false);
  });

  it("bounds submitted strings while preserving deliberately blank values", () => {
    expect(BeforeSubmitConfirmationSchema.safeParse({ ...submission(), fields: [{ id: "a", label: "A", value: "x".repeat(5000) }] }).success).toBe(true);
    expect(BeforeSubmitConfirmationSchema.safeParse({ ...submission(), fields: [{ id: "a", label: "A", value: "x".repeat(5001) }] }).success).toBe(false);
    expect(BeforeSubmitConfirmationSchema.parse({ ...submission(), fields: [{ id: "a", label: "A", value: "  " }] }).fields[0]?.value).toBe("  ");
    expect(BeforeSubmitConfirmationSchema.safeParse({ ...submission(), fields: [{ id: "a", label: "A", value: "nul\u0000" }] }).success).toBe(false);
  });

  it("accepts positive safe affected-count boundaries and an exact phrase", () => {
    expect(DestructiveActionGuardSchema.parse({ ...destructive(), affectedCount: 1 }).affectedCount).toBe(1);
    expect(DestructiveActionGuardSchema.parse({ ...destructive(), affectedCount: Number.MAX_SAFE_INTEGER }).affectedCount).toBe(Number.MAX_SAFE_INTEGER);
    expect(DestructiveActionGuardSchema.parse(destructive()).confirmationText).toBe("REMOVE DRAFTS");
  });

  it("rejects zero fractional unsafe and nonfinite affected counts", () => {
    for (const affectedCount of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY, true]) {
      expect(DestructiveActionGuardSchema.safeParse({ ...destructive(), affectedCount }).success).toBe(false);
    }
  });

  it("rejects blank padded excessive and control-character confirmation phrases", () => {
    for (const confirmationText of ["", " ", " REMOVE", "REMOVE ", "x".repeat(121), "REMOVE\u001b", "REMOVE\nDRAFTS", "REMOVE\rDRAFTS", "REMOVE\tDRAFTS"]) {
      expect(DestructiveActionGuardSchema.safeParse({ ...destructive(), confirmationText }).success).toBe(false);
    }
  });

  it("applies destructive-action display defaults without a preconfirmed state", () => {
    const value = DestructiveActionGuardSchema.parse(destructive());
    expect(value.confirmLabel).toBe("Confirm destructive action");
    expect(value.cancelLabel).toBe("Cancel");
    expect(value.consentLabel).toBe("I understand this action and want to continue.");
    expect(DestructiveActionGuardSchema.safeParse({ ...destructive(), confirmed: true }).success).toBe(false);
  });

  it("bounds destructive context and optional rollback descriptions", () => {
    expect(DestructiveActionGuardSchema.safeParse({ ...destructive(), targetLabel: "x".repeat(501) }).success).toBe(false);
    expect(DestructiveActionGuardSchema.safeParse({ ...destructive(), summary: "x".repeat(2001) }).success).toBe(false);
    expect(DestructiveActionGuardSchema.safeParse({ ...destructive(), rollback: " " }).success).toBe(false);
    expect(DestructiveActionGuardSchema.safeParse({ ...destructive(), rollback: "x".repeat(2001) }).success).toBe(false);
  });

  it("accepts a current recommendation with an optional current override choice", () => {
    expect(HumanOverridePanelSchema.parse(override()).selectedOptionId).toBeUndefined();
    expect(HumanOverridePanelSchema.parse({ ...override(), selectedOptionId: "archive" }).selectedOptionId).toBe("archive");
    expect(HumanOverridePanelSchema.parse({ ...override(), selectedOptionId: "keep" }).recommendedOptionId).toBe("keep");
  });

  it("requires two to one hundred unique override choices", () => {
    expect(HumanOverridePanelSchema.safeParse({ ...override(), options: [{ id: "keep", label: "Keep" }] }).success).toBe(false);
    expect(HumanOverridePanelSchema.safeParse({ ...override(), options: [{ id: "keep", label: "Keep" }, { id: "keep", label: "Other" }] }).success).toBe(false);
    const options = Array.from({ length: 100 }, (_, index) => ({ id: `option-${index}`, label: "Option" }));
    expect(HumanOverridePanelSchema.safeParse({ ...override(), options, recommendedOptionId: "option-0" }).success).toBe(true);
    expect(HumanOverridePanelSchema.safeParse({ ...override(), options: [...options, { id: "extra", label: "Extra" }] }).success).toBe(false);
  });

  it("rejects missing or stale recommendation and override references", () => {
    expect(HumanOverridePanelSchema.safeParse({ ...override(), recommendedOptionId: undefined }).success).toBe(false);
    expect(HumanOverridePanelSchema.safeParse({ ...override(), recommendedOptionId: "removed" }).success).toBe(false);
    expect(HumanOverridePanelSchema.safeParse({ ...override(), selectedOptionId: "removed" }).success).toBe(false);
  });

  it("applies override reason labels without accepting local reason or consent props", () => {
    const value = HumanOverridePanelSchema.parse(override());
    expect(value.overrideLabel).toBe("Override recommendation");
    expect(value.reasonLabel).toBe("Reason for override");
    expect(value.consentLabel).toBe("I reviewed this override and want to apply it.");
    expect(HumanOverridePanelSchema.safeParse({ ...override(), reason: "Preapproved" }).success).toBe(false);
  });

  it("bounds recommendation and override option descriptions", () => {
    expect(HumanOverridePanelSchema.safeParse({ ...override(), recommendation: " " }).success).toBe(false);
    expect(HumanOverridePanelSchema.safeParse({ ...override(), recommendation: "x".repeat(2001) }).success).toBe(false);
    expect(HumanOverridePanelSchema.safeParse({ ...override(), options: [{ id: "keep", label: "Keep" }, { id: "archive", label: "Archive", description: "x".repeat(2001) }] }).success).toBe(false);
  });

  it("applies permission required selection and action-label defaults", () => {
    const value = PermissionRequestCardSchema.parse(permission());
    expect(value.scopes.map(scope => scope.required)).toEqual([true, false]);
    expect(value.selectedScopeIds).toEqual([]);
    expect(value.requestLabel).toBe("Request permission");
    expect(value.denyLabel).toBe("Deny permission");
    expect(value.consentLabel).toBe("I reviewed these scopes and want to request permission.");
  });

  it("accepts incomplete and complete controlled scopes without granting permission", () => {
    expect(PermissionRequestCardSchema.parse({ ...permission(), selectedScopeIds: [] }).selectedScopeIds).toEqual([]);
    expect(PermissionRequestCardSchema.parse({ ...permission(), selectedScopeIds: ["comment", "read"] }).selectedScopeIds).toEqual(["comment", "read"]);
    expect(PermissionRequestCardSchema.safeParse({ ...permission(), granted: true }).success).toBe(false);
  });

  it("requires nonempty unique permission scopes and at least one required scope", () => {
    expect(PermissionRequestCardSchema.safeParse({ ...permission(), scopes: [] }).success).toBe(false);
    expect(PermissionRequestCardSchema.safeParse({ ...permission(), scopes: [{ id: "a", label: "A" }, { id: "a", label: "Other" }] }).success).toBe(false);
    expect(PermissionRequestCardSchema.safeParse({ ...permission(), scopes: [{ id: "a", label: "A", required: false }] }).success).toBe(false);
  });

  it("rejects duplicate stale and excessive selected permission scopes", () => {
    expect(PermissionRequestCardSchema.safeParse({ ...permission(), selectedScopeIds: ["read", "read"] }).success).toBe(false);
    expect(PermissionRequestCardSchema.safeParse({ ...permission(), selectedScopeIds: ["removed"] }).success).toBe(false);
    const scopes = Array.from({ length: 100 }, (_, index) => ({ id: `scope-${index}`, label: "Scope" }));
    expect(PermissionRequestCardSchema.safeParse({ ...permission(), scopes }).success).toBe(true);
    expect(PermissionRequestCardSchema.safeParse({ ...permission(), scopes: [...scopes, { id: "extra", label: "Extra" }] }).success).toBe(false);
    expect(PermissionRequestCardSchema.safeParse({ ...permission(), selectedScopeIds: Array.from({ length: 101 }, () => "read") }).success).toBe(false);
  });

  it("bounds requester purpose and permission scope descriptions", () => {
    expect(PermissionRequestCardSchema.safeParse({ ...permission(), requester: " " }).success).toBe(false);
    expect(PermissionRequestCardSchema.safeParse({ ...permission(), requester: "x".repeat(501) }).success).toBe(false);
    expect(PermissionRequestCardSchema.safeParse({ ...permission(), purpose: "x".repeat(2001) }).success).toBe(false);
    expect(PermissionRequestCardSchema.safeParse({ ...permission(), scopes: [{ id: "read", label: "Read", description: "x".repeat(2001) }] }).success).toBe(false);
  });

  it("exports checklist and permission defaults and array bounds as JSON Schema", () => {
    expect(toJSONSchema(ApprovalChecklistSchema)).toMatchObject({ type: "object", additionalProperties: false, properties: {
      disabled: { type: "boolean", default: false }, checkedItemIds: { type: "array", maxItems: 100, default: [] },
      items: { type: "array", minItems: 1, maxItems: 100, items: { type: "object", properties: { required: { type: "boolean", default: true } } } },
    } });
    expect(toJSONSchema(PermissionRequestCardSchema)).toMatchObject({ properties: {
      selectedScopeIds: { type: "array", maxItems: 100, default: [] },
      scopes: { type: "array", minItems: 1, maxItems: 100, items: { properties: { required: { type: "boolean", default: true } } } },
      requestLabel: { type: "string", default: "Request permission" },
    } });
  });

  it("exports finite primitive choices and safe destructive count bounds", () => {
    expect(toJSONSchema(BeforeSubmitConfirmationSchema)).toMatchObject({ properties: { fields: { minItems: 1, maxItems: 100, items: { properties: {
      value: { anyOf: [{ type: "string", maxLength: 5000 }, { type: "number" }, { type: "boolean" }, { type: "null" }] },
    } } } } });
    expect(toJSONSchema(DestructiveActionGuardSchema)).toMatchObject({ properties: {
      affectedCount: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER }, confirmationText: { type: "string", maxLength: 120 },
    } });
  });

  it("exports override minimum choices and typed review label defaults", () => {
    expect(toJSONSchema(HumanOverridePanelSchema)).toMatchObject({ properties: {
      options: { type: "array", minItems: 2, maxItems: 100 }, selectedOptionId: { type: "string", maxLength: 128 },
      overrideLabel: { type: "string", default: "Override recommendation" }, reasonLabel: { type: "string", default: "Reason for override" },
    } });
  });

  it("publishes required identities and values without a payload consent field", () => {
    const submit = toJSONSchema(BeforeSubmitConfirmationSchema);
    expect(submit.required).toEqual(expect.arrayContaining(["reviewId", "title", "fields"]));
    const human = toJSONSchema(HumanOverridePanelSchema);
    expect(human.required).toEqual(expect.arrayContaining(["reviewId", "title", "options", "recommendedOptionId"]));
    expect(JSON.stringify(submit)).not.toContain('"consent":');
    expect(JSON.stringify(human)).not.toContain('"reason":');
  });
});

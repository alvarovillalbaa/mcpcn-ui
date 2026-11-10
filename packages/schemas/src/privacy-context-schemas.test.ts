import { describe, expect, it } from "vitest";
import { schemaBySlug, toJSONSchema, GenericComponentSchema } from "./index.js";
import { privacyContextCases, privacyContextData, mutablePrivacy, privacyReport, privacyMembers } from "../../../tests/fixtures/privacy-context.js";

describe.each(privacyContextCases)("T2 privacy/context schema $slug", row => {
  const schema = schemaBySlug[row.slug], clone = () => mutablePrivacy(row);
  it("PC-S01 accepts only its real typed report with four strict states", () => {
    expect(schema).not.toBe(GenericComponentSchema); expect(schema.parse(row.data)).toEqual(row.data);
    const exported = toJSONSchema(schema), variants = (exported.oneOf ?? exported.anyOf) as Array<Record<string, unknown>>;
    expect(variants).toHaveLength(4); for (const variant of variants) expect(variant.additionalProperties).toBe(false);
    expect(schema.safeParse({ title: "Legacy", items: [] }).success).toBe(false);
  });
  it("PC-S02 permits loading/empty/error without retaining ready reports or actions", () => {
    for (const state of ["loading", "empty", "error"]) {
      const data = { id: row.data.id, revision: "one", title: "Authored nonready", state, message: "Authored message" };
      expect(schema.parse(data)).toEqual(data); expect(schema.safeParse({ ...data, [row.report]: privacyReport(clone()) }).success).toBe(false);
      expect(schema.safeParse({ ...data, action: { id: "a", revision: "one", label: "Send", available: true } }).success).toBe(false);
    }
  });
  it("PC-S03 rejects unknown nested fields and duplicate member IDs", () => {
    for (const level of ["root", "report", "member"]) {
      const data = clone(); (level === "root" ? data : level === "report" ? privacyReport(data) : privacyMembers(data)[0]!).unexpected = true;
      expect(schema.safeParse(data).success).toBe(false);
    }
    const data = clone(), members = privacyMembers(data); members.push(members[0]!); expect(schema.safeParse(data).success).toBe(false);
  });
  it("PC-S04 rejects root/nested accessors without reading them", () => {
    for (const nested of [false, true]) {
      let reads = 0; const data = clone(), target = nested ? privacyMembers(data)[0]! : data;
      Object.defineProperty(target, nested ? "label" : "title", { enumerable: true, get() { reads++; return "Read getter"; } });
      expect(schema.safeParse(data).success).toBe(false); expect(reads).toBe(0);
    }
  });
  it("PC-S05 rejects symbols, nonenumerable fields, cycles and foreign prototypes", () => {
    const bad = [clone(), clone(), clone(), clone()];
    Object.defineProperty(bad[0]!, Symbol("secret"), { value: "hidden" }); Object.defineProperty(bad[1]!, "hidden", { value: "hidden" });
    bad[2]!.cycle = bad[2]; Object.setPrototypeOf(privacyMembers(bad[3]!)[0]!, { foreign: true });
    for (const data of bad) expect(schema.safeParse(data).success).toBe(false);
  });
  it("PC-S06 rejects sparse collections, nonfinite and unbounded values", () => {
    const sparse = clone(), members = privacyMembers(sparse); delete members[0]; expect(schema.safeParse(sparse).success).toBe(false);
    for (const title of [" ", "bad\u0000text", "x".repeat(301)]) expect(schema.safeParse({ ...clone(), title }).success).toBe(false);
    const data = clone(); privacyMembers(data)[0]!.unexpected = Infinity; expect(schema.safeParse(data).success).toBe(false);
    const tooMany = clone(), target = privacyReport(tooMany), key = row.slug === "data-access-notice" ? "resources" : row.slug === "privacy-boundary-card" ? "entries" : row.slug === "consent-panel" ? "scopes" : "sections";
    target[key] = Array.from({ length: 21 }, (_, i) => ({ ...privacyMembers(clone())[0], id: `member-${i}` })); expect(schema.safeParse(tooMany).success).toBe(false);
  });
  it("PC-S07 requires explicit valid identities, revisions and boolean availability", () => {
    for (const patch of [{ id: "bad id" }, { revision: "" }, { id: 0 }]) expect(schema.safeParse({ ...clone(), ...patch }).success).toBe(false);
    const data = clone(), key = row.slug === "consent-panel" ? "approveAction" : "action";
    (data[key] as Record<string, unknown>).available = "true"; expect(schema.safeParse(data).success).toBe(false);
  });
  it("PC-S08 accepts absent supplied actions without adding defaults", () => {
    const data = clone(); delete data.action; delete data.approveAction; delete data.declineAction;
    expect(schema.parse(data)).toEqual(data); expect(schema.parse(data)).not.toHaveProperty("action");
  });
  it("PC-S09 preserves supplied member order and explicit false/zero/null values", () => {
    const data = clone(); privacyMembers(data).reverse(); expect(schema.parse(data)).toEqual(data);
    expect(privacyReport(schema.parse(clone()) as Record<string, unknown>).revision).toBe("five");
  });
});

describe("T2 distinct privacy contracts", () => {
  it("PC-S10 preserves zero and absent record counts but rejects negative/fractional counts", () => {
    const data = structuredClone(privacyContextData["data-access-notice"]); const parsed = schemaBySlug["data-access-notice"].parse(data);
    if (parsed.state !== "ready") throw new Error("ready_required");
    expect(parsed.access.resources[0]!.reportedRecordCount).toBe(0); expect(parsed.access.resources[1]).not.toHaveProperty("reportedRecordCount");
    for (const reportedRecordCount of [-1, 0.5, Infinity]) expect(schemaBySlug["data-access-notice"].safeParse({ ...data, access: { ...data.access, resources: [{ ...data.access.resources[0], reportedRecordCount }] } }).success).toBe(false);
  });
  it("PC-S11 rejects duplicate field IDs and arbitrary operations", () => {
    const data = mutablePrivacy(privacyContextCases[0]), resource = privacyMembers(data)[0]!, fields = resource.fields as unknown[];
    fields.push(fields[0]); expect(schemaBySlug["data-access-notice"].safeParse(data).success).toBe(false);
    resource.fields = []; resource.operation = "execute"; expect(schemaBySlug["data-access-notice"].safeParse(data).success).toBe(false);
  });
  it("PC-S12 rejects server-only values, including explicitly undefined", () => {
    for (const value of [undefined, null, "SECRET_MUST_NOT_ENTER_CLIENT"]) {
      const data = mutablePrivacy(privacyContextCases[1]); privacyMembers(data)[2]!.value = value;
      expect(schemaBySlug["privacy-boundary-card"].safeParse(data).success).toBe(false);
    }
  });
  it("PC-S13 requires complete JSON values for both client visibility branches", () => {
    const data = mutablePrivacy(privacyContextCases[1]); delete privacyMembers(data)[0]!.value;
    expect(schemaBySlug["privacy-boundary-card"].safeParse(data).success).toBe(false);
    privacyMembers(data)[0]!.value = false; privacyMembers(data)[1]!.value = null;
    expect(schemaBySlug["privacy-boundary-card"].parse(data)).toEqual(data);
  });
  it("PC-S14 accepts a reported grant and unavailable required scope without inventing permission", () => {
    const data = mutablePrivacy(privacyContextCases[2]); privacyMembers(data)[0]!.available = false;
    expect(schemaBySlug["consent-panel"].parse(data)).toEqual(data);
    for (const key of ["required", "available"]) { const bad = mutablePrivacy(privacyContextCases[2]); delete privacyMembers(bad)[0]![key]; expect(schemaBySlug["consent-panel"].safeParse(bad).success).toBe(false); }
  });
  it("PC-S15 accepts all explicit reported decisions, refusing unknown decisions", () => {
    const data = mutablePrivacy(privacyContextCases[2]);
    for (const decision of ["not-recorded", "granted", "declined", "revoked", "unknown"]) { privacyReport(data).reportedDecision = decision; expect(schemaBySlug["consent-panel"].parse(data)).toEqual(data); }
    privacyReport(data).reportedDecision = "approved-by-this-ui"; expect(schemaBySlug["consent-panel"].safeParse(data).success).toBe(false);
  });
  it("PC-S16 rejects excluded context values, even undefined", () => {
    for (const value of [undefined, null, "EXCLUDED_SECRET"]) {
      const data = mutablePrivacy(privacyContextCases[3]); (privacyReport(data).excluded as Array<Record<string, unknown>>)[0]!.value = value;
      expect(schemaBySlug["model-context-preview"].safeParse(data).success).toBe(false);
    }
  });
  it("PC-S17 rejects included/excluded ID overlap and duplicate exclusions", () => {
    const data = mutablePrivacy(privacyContextCases[3]), report = privacyReport(data), excluded = report.excluded as Array<Record<string, unknown>>;
    excluded.push(excluded[0]!); expect(schemaBySlug["model-context-preview"].safeParse(data).success).toBe(false);
    excluded.pop(); excluded[0]!.id = privacyMembers(data)[0]!.id; expect(schemaBySlug["model-context-preview"].safeParse(data).success).toBe(false);
  });
  it("PC-S18 distinguishes zero and absent token estimates, refusing negative/fractional ones", () => {
    const data = mutablePrivacy(privacyContextCases[3]), report = privacyReport(data); expect(report.reportedTokenEstimate).toBe(0);
    delete report.reportedTokenEstimate; expect(schemaBySlug["model-context-preview"].parse(data)).toEqual(data);
    for (const value of [-1, 0.5, Infinity]) { report.reportedTokenEstimate = value; expect(schemaBySlug["model-context-preview"].safeParse(data).success).toBe(false); }
  });
  it.each([privacyContextCases[1], privacyContextCases[3]])("PC-S19 $slug bounds each full JSON value", row => {
    const schema = schemaBySlug[row.slug];
    for (const value of [undefined, new Date(), { deep: "x".repeat(10001) }, Array.from({ length: 201 }, () => 0)]) {
      const data = mutablePrivacy(row); privacyMembers(data)[0]!.value = value; expect(schema.safeParse(data).success).toBe(false);
    }
  });
  it.each([privacyContextCases[1], privacyContextCases[3]])("PC-S20 $slug enforces collective UTF-8 budget", row => {
    const data = mutablePrivacy(row), report = privacyReport(data), key = row.slug === "privacy-boundary-card" ? "entries" : "sections", member = privacyMembers(data)[0]!;
    report[key] = Array.from({ length: 20 }, (_, i) => ({ ...member, id: `large-${i}`, value: Array.from({ length: 6 }, () => "界".repeat(10000)) }));
    const parsed = schemaBySlug[row.slug].safeParse(data); expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some(issue => issue.message.includes("complete parsed privacy report"))).toBe(true);
  });
});

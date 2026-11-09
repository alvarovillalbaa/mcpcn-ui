import { describe, expect, it } from "vitest";
import { z } from "zod";
import { InspectableJSONSchema } from "./execution-schemas.js";
import { FileExtractionFieldSchema, stableReviewKey } from "./file-review-schemas.js";
import { InspectionFieldSchema, RecordInspectorSchema, type InspectionField } from "./record-inspection-schemas.js";
import * as publicSchemas from "./index.js";
import {
  ConflictResolverSchema, ValidationSummarySchema, ValidationIssueSchema,
  type ValidationIssue,
} from "./conflict-validation-schemas.js";

const common = { id: "component-1", revision: "component-revision-1", title: "Authored conflict and validation" };
const candidate = (patch: Partial<InspectionField> = {}): InspectionField => ({ id: "candidate-1", revision: "candidate-revision-1", label: "Candidate one", value: null, ...patch });
const issue = (patch: Partial<ValidationIssue> = {}): ValidationIssue => ({ id: "issue-1", revision: "issue-revision-1", label: "Issue one", severity: "warning", message: "Complete supplied finding.\n", ...patch });
const resolver = (candidates: InspectionField[] = [candidate(), candidate({ id: "candidate-2" })]) => ({ ...common, state: "ready" as const, conflict: { id: "conflict-1", revision: "conflict-revision-1", label: "Supplied conflict", candidates } });
const summary = (issues: ValidationIssue[] = [issue()], reportedStatus: "unknown" | "pending" | "valid" | "invalid" = "unknown") => ({ ...common, state: "ready" as const, report: { id: "report-1", revision: "report-revision-1", label: "Supplied report", reportedStatus, issues } });
const evidence = { id: "evidence-1", label: "Supplied note", text: "Complete supplied evidence.\n", url: "https://example.test/source?q=authored#note" };
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

function atConflictBudget() {
  const candidates = Array.from({ length: 20 }, (_, index) => ({
    id: `candidate-${index}`, revision: "one", label: "Candidate", value: "",
    evidence: Array.from({ length: 20 }, (_, number) => ({ id: `evidence-${number}`, label: "Evidence", text: "" })),
  }));
  const value = { ...resolver(candidates), description: "" };
  let remaining = 2097152 - bytes(ConflictResolverSchema.parse(value));
  const fill = (maximum: number) => {
    const amount = Math.min(remaining, maximum * 2); remaining -= amount;
    return "é".repeat(Math.floor(amount / 2)) + (amount % 2 ? "x" : "");
  };
  for (const item of candidates) item.value = fill(10000);
  for (const item of candidates) for (const source of item.evidence) source.text = fill(4000);
  if (remaining !== 0) throw new Error("authored_conflict_budget_fixture_incomplete");
  return value;
}

function atValidationBudget() {
  const issues = Array.from({ length: 100 }, (_, index) => ({
    id: `issue-${index}`, revision: "one", label: "Issue", severity: "info" as const, message: "Supplied.", context: "",
    evidence: Array.from({ length: 20 }, (_, number) => ({ id: `evidence-${number}`, label: "Evidence", text: "" })),
  }));
  const value = { ...summary(issues), description: "" };
  let remaining = 2097152 - bytes(ValidationSummarySchema.parse(value));
  const fill = (maximum: number) => {
    const amount = Math.min(remaining, maximum * 2); remaining -= amount;
    return "é".repeat(Math.floor(amount / 2)) + (amount % 2 ? "x" : "");
  };
  for (const item of issues) item.context = fill(10000);
  for (const item of issues) for (const source of item.evidence) source.text = fill(4000);
  if (remaining !== 0) throw new Error("authored_validation_budget_fixture_incomplete");
  return value;
}

describe("conflict and validation schemas", () => {
  it("CV-S01 bounds supplied candidates at two through twenty", () => {
    expect(ConflictResolverSchema.safeParse(resolver()).success).toBe(true);
    const twenty = Array.from({ length: 20 }, (_, index) => candidate({ id: `candidate-${index}` }));
    expect(ConflictResolverSchema.safeParse(resolver(twenty)).success).toBe(true);
    for (const candidates of [[], [candidate()], [...twenty, candidate({ id: "extra" })]]) expect(ConflictResolverSchema.safeParse(resolver(candidates)).success).toBe(false);
  });

  it("CV-S02 requires unique candidate identities even when revisions differ", () => {
    expect(ConflictResolverSchema.safeParse(resolver([candidate(), candidate({ revision: "two" })])).success).toBe(false);
    expect(ConflictResolverSchema.safeParse(resolver([candidate(), candidate({ id: "candidate-2", revision: "two" })])).success).toBe(true);
  });

  it("CV-S03 permits equal complete values without adding a winner or resolution", () => {
    const value = { supplied: [false, 0, null, ""] };
    const parsed = ConflictResolverSchema.parse(resolver([candidate({ value }), candidate({ id: "candidate-2", value })]));
    if (parsed.state !== "ready") throw new Error("authored_ready_required");
    expect(parsed.conflict.candidates[0]?.value).toEqual(parsed.conflict.candidates[1]?.value);
    expect(Object.hasOwn(parsed, "selectedCandidateId")).toBe(false); expect(Object.hasOwn(parsed, "resolved")).toBe(false);
    expect(Object.keys(parsed.conflict)).toEqual(["id", "revision", "label", "candidates"]);
  });

  it("CV-S04 requires candidate values and retains falsy primitives and complete nested JSON", () => {
    for (const value of [null, false, true, 0, -0, 4.5, "", " \n\t", { nested: [null, false, 0, "", { end: "<em>Complete</em>\n" }] }]) {
      const parsed = ConflictResolverSchema.parse(resolver([candidate({ value }), candidate({ id: "candidate-2" })]));
      if (parsed.state !== "ready") throw new Error("authored_ready_required");
      expect(parsed.conflict.candidates[0]?.value).toEqual(value);
    }
    const { value: _value, ...missing } = candidate();
    expect(ConflictResolverSchema.safeParse(resolver([missing as InspectionField, candidate({ id: "candidate-2" })])).success).toBe(false);
  });

  it("CV-S05 retains the shared candidate string serialization and depth boundaries", () => {
    let nested: unknown = null;
    for (let depth = 0; depth < 8; depth++) nested = [nested];
    for (const value of ["é".repeat(10000), nested]) {
      expect(InspectableJSONSchema.safeParse(value).success).toBe(true);
      expect(ConflictResolverSchema.safeParse(resolver([candidate({ value }), candidate({ id: "candidate-2" })])).success).toBe(true);
    }
    for (const value of ["x".repeat(10001), [nested], Array.from({ length: 10 }, () => "x".repeat(7000))]) expect(ConflictResolverSchema.safeParse(resolver([candidate({ value }), candidate({ id: "candidate-2" })])).success).toBe(false);
  });

  it("CV-S06 distinguishes absent confidence from zero and refuses coercion or nonfinite claims", () => {
    const absent = ConflictResolverSchema.parse(resolver());
    if (absent.state !== "ready") throw new Error("authored_ready_required");
    expect(Object.hasOwn(absent.conflict.candidates[0]!, "confidence")).toBe(false);
    for (const confidence of [0, 0.125, 1]) expect(ConflictResolverSchema.safeParse(resolver([candidate({ confidence }), candidate({ id: "candidate-2" })])).success).toBe(true);
    for (const confidence of [NaN, Infinity, -Infinity, -0.01, 1.01, "0.5", null, false]) expect(ConflictResolverSchema.safeParse(resolver([{ ...candidate(), confidence } as InspectionField, candidate({ id: "candidate-2" })])).success).toBe(false);
  });

  it("CV-S07 reuses candidate evidence defaults safe links and per-member identity bounds", () => {
    const supplied = Array.from({ length: 20 }, (_, index) => ({ ...evidence, id: `evidence-${index}` }));
    const parsed = ConflictResolverSchema.parse(resolver([candidate({ evidence: supplied }), candidate({ id: "candidate-2" })]));
    if (parsed.state !== "ready") throw new Error("authored_ready_required");
    expect(parsed.conflict.candidates[0]?.evidence).toEqual(InspectionFieldSchema.parse(candidate({ evidence: supplied })).evidence);
    expect(parsed.conflict.candidates[1]?.evidence).toEqual([]);
    for (const evidence of [[...supplied, { ...supplied[0], id: "extra" }], [supplied[0], supplied[0]], [{ ...supplied[0], url: "javascript:alert(1)" }]]) expect(ConflictResolverSchema.safeParse(resolver([{ ...candidate(), evidence } as InspectionField, candidate({ id: "candidate-2" })])).success).toBe(false);
  });

  it("CV-S08 refuses candidate and evidence authority properties instead of stripping them", () => {
    expect(ConflictResolverSchema.safeParse(resolver([{ ...candidate(), verified: true } as InspectionField, candidate({ id: "candidate-2" })])).success).toBe(false);
    expect(ConflictResolverSchema.safeParse(resolver([candidate({ evidence: [{ ...evidence, verified: true } as typeof evidence] }), candidate({ id: "candidate-2" })])).success).toBe(false);
  });

  it("CV-S09 preserves local omission controlled null and a current candidate selection", () => {
    expect(Object.hasOwn(ConflictResolverSchema.parse(resolver()), "selectedCandidateId")).toBe(false);
    for (const selectedCandidateId of [null, "candidate-1", "candidate-2"]) {
      const parsed = ConflictResolverSchema.parse({ ...resolver(), selectedCandidateId });
      if (parsed.state !== "ready") throw new Error("authored_ready_required");
      expect(parsed.selectedCandidateId).toBe(selectedCandidateId);
    }
  });

  it("CV-S10 refuses stale candidate selection instead of defaulting to a winner", () => {
    for (const selectedCandidateId of ["missing", "candidate-removed", ""]) expect(ConflictResolverSchema.safeParse({ ...resolver(), selectedCandidateId }).success).toBe(false);
  });

  it("CV-S11 requires a current strict conflict owner in the ready state", () => {
    expect(ConflictResolverSchema.safeParse({ ...common, state: "ready" }).success).toBe(false);
    for (const key of ["id", "revision", "label", "candidates"] as const) {
      const value: Record<string, unknown> = { ...resolver().conflict }; delete value[key];
      expect(ConflictResolverSchema.safeParse({ ...resolver(), conflict: value }).success).toBe(false);
    }
    expect(ConflictResolverSchema.safeParse({ ...resolver(), conflict: { ...resolver().conflict, reportId: "foreign" } }).success).toBe(false);
  });

  it("CV-S12 keeps every conflict state explicit and forbids hidden nonready payloads", () => {
    for (const state of ["loading", "empty", "error"]) {
      const value = { ...common, state, message: "Supplied status" };
      expect(ConflictResolverSchema.safeParse(value).success).toBe(true);
      expect(ConflictResolverSchema.safeParse({ ...value, conflict: resolver().conflict }).success).toBe(false);
      expect(ConflictResolverSchema.safeParse({ ...value, selectedCandidateId: null }).success).toBe(false);
    }
    for (const message of [undefined, "", " \n\t", "bad\u0000message"]) expect(ConflictResolverSchema.safeParse({ ...common, state: "error", message }).success).toBe(false);
  });

  it("CV-S13 applies safe120 identities to component conflict candidate and issue revisions", () => {
    expect(ConflictResolverSchema.safeParse({ ...resolver(), id: "i".repeat(120), revision: "r".repeat(120) }).success).toBe(true);
    for (const value of ["", " ", " leading", "trailing ", "bad\nidentity", "bad\u007fidentity", "i".repeat(121), "__proto__", "prototype", "constructor"]) {
      expect(ConflictResolverSchema.safeParse({ ...resolver(), id: value }).success).toBe(false);
      expect(ConflictResolverSchema.safeParse({ ...resolver(), conflict: { ...resolver().conflict, revision: value } }).success).toBe(false);
      expect(ConflictResolverSchema.safeParse(resolver([candidate({ revision: value }), candidate({ id: "candidate-2" })])).success).toBe(false);
      expect(ValidationIssueSchema.safeParse(issue({ id: value, revision: value })).success).toBe(false);
    }
  });

  it("CV-S14 preserves bounded plain labels descriptions and messages without trimming", () => {
    const value = { ...resolver(), title: "t".repeat(300), description: "é".repeat(4000), message: " \n" };
    expect(ConflictResolverSchema.parse(value).description).toBe(value.description);
    expect(ConflictResolverSchema.safeParse({ ...resolver(), conflict: { ...resolver().conflict, label: "  Supplied label\n" } }).success).toBe(true);
    for (const title of ["", " \n\t", "bad\u0000title", "bad\u007ftitle", "t".repeat(301)]) expect(ConflictResolverSchema.safeParse({ ...resolver(), title }).success).toBe(false);
    expect(ValidationSummarySchema.safeParse({ ...summary(), description: "x".repeat(4001) }).success).toBe(false);
    expect(ConflictResolverSchema.safeParse({ ...resolver(), message: "bad\u000bmessage" }).success).toBe(false);
  });

  it("CV-S15 refuses inferred resolution and unknown root properties", () => {
    for (const patch of [{ resolved: true }, { winner: "candidate-1" }, { busy: true }, { onAction: "hidden" }, { state: "resolved" }]) expect(ConflictResolverSchema.safeParse({ ...resolver(), ...patch }).success).toBe(false);
    expect(ConflictResolverSchema.safeParse({ ...resolver(), conflict: { ...resolver().conflict, defaultCandidateId: "candidate-1" } }).success).toBe(false);
  });

  it("CV-S16 requires exactly one explicit reported status without coercion or defaults", () => {
    for (const reportedStatus of ["unknown", "pending", "valid", "invalid"] as const) {
      const parsed = ValidationSummarySchema.parse(summary([], reportedStatus));
      if (parsed.state !== "ready") throw new Error("authored_ready_required");
      expect(parsed.report.reportedStatus).toBe(reportedStatus);
    }
    for (const reportedStatus of [undefined, "", "VALID", "complete", true, 0, null]) expect(ValidationSummarySchema.safeParse({ ...summary(), report: { ...summary().report, reportedStatus } }).success).toBe(false);
  });

  it("CV-S17 preserves reported status independently of issue severity or count", () => {
    for (const [reportedStatus, issues] of [["valid", [issue({ severity: "error" })]], ["invalid", []], ["pending", [issue({ severity: "info" })]], ["unknown", [issue({ severity: "warning" })]]] as const) {
      const parsed = ValidationSummarySchema.parse(summary([...issues], reportedStatus));
      if (parsed.state !== "ready") throw new Error("authored_ready_required");
      expect(parsed.report.reportedStatus).toBe(reportedStatus); expect(parsed.report.issues).toHaveLength(issues.length);
      expect(Object.hasOwn(parsed.report, "inferredStatus")).toBe(false);
    }
  });

  it("CV-S18 requires complete issue messages and retains their plain text boundary", () => {
    expect(ValidationIssueSchema.parse(issue({ message: "é".repeat(4000) })).message).toHaveLength(4000);
    for (const message of [undefined, "", " \n\t", "bad\u0000message", "x".repeat(4001)]) expect(ValidationIssueSchema.safeParse({ ...issue(), message }).success).toBe(false);
    const parsed = ValidationIssueSchema.parse(issue()); expect(parsed.message).toBe("Complete supplied finding.\n");
  });

  it("CV-S19 bounds ready issue lists at one hundred and refuses duplicate member IDs", () => {
    const issues = Array.from({ length: 100 }, (_, index) => issue({ id: `issue-${index}` }));
    expect(ValidationSummarySchema.safeParse(summary([])).success).toBe(true); expect(ValidationSummarySchema.safeParse(summary(issues)).success).toBe(true);
    expect(ValidationSummarySchema.safeParse(summary([...issues, issue({ id: "extra" })])).success).toBe(false);
    expect(ValidationSummarySchema.safeParse(summary([issue(), issue({ revision: "two" })])).success).toBe(false);
    expect(ValidationIssueSchema.safeParse({ ...issue(), revision: undefined }).success).toBe(false);
  });

  it("CV-S20 preserves omitted null and current issue selection without choosing a default", () => {
    expect(Object.hasOwn(ValidationSummarySchema.parse(summary()), "selectedIssueId")).toBe(false);
    for (const selectedIssueId of [null, "issue-1"]) {
      const parsed = ValidationSummarySchema.parse({ ...summary(), selectedIssueId });
      if (parsed.state !== "ready") throw new Error("authored_ready_required");
      expect(parsed.selectedIssueId).toBe(selectedIssueId);
    }
  });

  it("CV-S21 refuses issue selections outside the current report including ready empty", () => {
    expect(ValidationSummarySchema.safeParse({ ...summary(), selectedIssueId: "removed" }).success).toBe(false);
    expect(ValidationSummarySchema.safeParse({ ...summary([]), selectedIssueId: "issue-1" }).success).toBe(false);
    expect(ValidationSummarySchema.safeParse({ ...summary([]), selectedIssueId: null }).success).toBe(true);
  });

  it("CV-S22 distinguishes absent context from all supplied falsy and empty values", () => {
    expect(Object.hasOwn(ValidationIssueSchema.parse(issue()), "context")).toBe(false);
    for (const context of [null, false, 0, "", [], {}]) {
      const parsed = ValidationIssueSchema.parse(issue({ context }));
      expect(Object.hasOwn(parsed, "context")).toBe(true); expect(parsed.context).toEqual(context);
    }
    expect(ValidationIssueSchema.safeParse({ ...issue(), context: undefined }).success).toBe(false);
  });

  it("CV-S23 preserves complete context text arrays and legitimate JSON property names", () => {
    const context = JSON.parse('{"supplied":{"confirmed":false,"count":0},"nested":[null,false,0,"",{"end":"<script>supplied()</script>\\n"}]}');
    const parsed = ValidationIssueSchema.parse(issue({ context }));
    expect(parsed.context).toEqual(context); expect(parsed.context).not.toBe(context);
    expect(Object.hasOwn(parsed.context as object, "supplied")).toBe(true);
    const unsafe = JSON.parse('{"__proto__":{"supplied":false}}');
    expect(InspectableJSONSchema.safeParse(unsafe).success).toBe(false);
    expect(ValidationIssueSchema.safeParse(issue({ context: unsafe })).success).toBe(false);
  });

  it("CV-S24 reuses strict extracted-field evidence and its safe URL list contract", () => {
    const supplied = Array.from({ length: 20 }, (_, index) => ({ ...evidence, id: `evidence-${index}` }));
    const old = FileExtractionFieldSchema.parse({ id: "issue-1", label: "Issue one", original: "Supplied", evidence: supplied });
    expect(ValidationIssueSchema.parse(issue({ evidence: supplied })).evidence).toEqual(old.evidence);
    expect(ValidationIssueSchema.parse(issue()).evidence).toEqual([]);
    for (const sources of [[evidence, evidence], [...supplied, { ...evidence, id: "extra" }], [{ ...evidence, verified: true }]]) expect(ValidationIssueSchema.safeParse({ ...issue(), evidence: sources }).success).toBe(false);
    for (const url of ["javascript:alert(1)", "data:text/plain,x", "file:///tmp/authored", "/relative", "//example.test", "https://user:pass@example.test", "https://example.test/a b", " https://example.test", "https://example.test/\n"]) expect(ValidationIssueSchema.safeParse(issue({ evidence: [{ ...evidence, url }] })).success).toBe(false);
  });

  it("CV-S25 requires an explicit exact severity instead of inferring validation authority", () => {
    for (const severity of ["info", "warning", "error"] as const) expect(ValidationIssueSchema.parse(issue({ severity })).severity).toBe(severity);
    for (const severity of [undefined, "", "ERROR", "valid", "fatal", 1, false]) expect(ValidationIssueSchema.safeParse({ ...issue(), severity }).success).toBe(false);
  });

  it("CV-S26 refuses foreign report issue and root properties instead of silently dropping them", () => {
    expect(ValidationSummarySchema.safeParse({ ...summary(), verified: true }).success).toBe(false);
    expect(ValidationSummarySchema.safeParse({ ...summary(), report: { ...summary().report, errorCount: 1 } }).success).toBe(false);
    expect(ValidationSummarySchema.safeParse(summary([{ ...issue(), valid: false } as ValidationIssue])).success).toBe(false);
    expect(ValidationSummarySchema.safeParse({ ...common, state: "ready" }).success).toBe(false);
  });

  it("CV-S27 keeps ready empty reports distinct from all nonready states", () => {
    const ready = ValidationSummarySchema.parse(summary([])); expect(ready.state).toBe("ready");
    for (const state of ["loading", "empty", "error"]) {
      const value = { ...common, state, message: "Supplied state" };
      expect(ValidationSummarySchema.safeParse(value).success).toBe(true);
      expect(ValidationSummarySchema.safeParse({ ...value, report: summary().report }).success).toBe(false);
      expect(ValidationSummarySchema.safeParse({ ...value, selectedIssueId: null }).success).toBe(false);
    }
    for (const message of [undefined, "", " \n\t", "bad\u007fmessage"]) expect(ValidationSummarySchema.safeParse({ ...common, state: "error", message }).success).toBe(false);
  });

  it("CV-S28 refuses root owner member context and evidence accessors with zero reads", () => {
    let reads = 0;
    const accessor = <T extends object>(value: T, key: string) => Object.defineProperty(value, key, { enumerable: true, get() { reads++; return "Never read"; } });
    expect(ConflictResolverSchema.safeParse(accessor(resolver(), "id")).success).toBe(false);
    expect(ConflictResolverSchema.safeParse({ ...resolver(), conflict: accessor(resolver().conflict, "label") }).success).toBe(false);
    expect(ConflictResolverSchema.safeParse(resolver([accessor(candidate(), "value"), candidate({ id: "candidate-2" })])).success).toBe(false);
    expect(ValidationSummarySchema.safeParse(accessor(summary(), "report")).success).toBe(false);
    expect(ValidationSummarySchema.safeParse(summary([accessor(issue(), "message")])).success).toBe(false);
    expect(ValidationIssueSchema.safeParse(issue({ context: accessor({}, "secret") })).success).toBe(false);
    expect(ValidationSummarySchema.safeParse(summary([issue({ evidence: [accessor({ ...evidence }, "text")] })])).success).toBe(false);
    expect(reads).toBe(0);
  });

  it("CV-S29 never calls toJSON while rejecting data or measuring collective bytes", () => {
    let calls = 0; const value = { toJSON() { calls++; return "Never serialize"; } };
    expect(ConflictResolverSchema.safeParse(resolver([candidate({ value }), candidate({ id: "candidate-2" })])).success).toBe(false);
    expect(ValidationSummarySchema.safeParse(summary([issue({ context: value })])).success).toBe(false); expect(calls).toBe(0);
  });

  it("CV-S30 refuses foreign DTO prototypes and object instances but accepts plain null prototypes", () => {
    const foreign = <T extends object>(value: T): T => Object.assign(Object.create({ inherited: true }), value) as T;
    expect(ConflictResolverSchema.safeParse(foreign(resolver())).success).toBe(false);
    expect(ConflictResolverSchema.safeParse(resolver([foreign(candidate()), candidate({ id: "candidate-2" })])).success).toBe(false);
    expect(ValidationSummarySchema.safeParse({ ...summary(), report: foreign(summary().report) }).success).toBe(false);
    expect(ValidationIssueSchema.safeParse(issue({ evidence: [foreign(evidence)] })).success).toBe(false);
    for (const context of [new Date(0), new Map([["supplied", 1]]), new Set([1])]) expect(ValidationIssueSchema.safeParse(issue({ context })).success).toBe(false);
    const context = Object.assign(Object.create(null), { supplied: [false, 0, null] });
    expect(ValidationIssueSchema.parse(issue({ context })).context).toEqual({ supplied: [false, 0, null] });
  });

  it("CV-S31 refuses cycles while retaining repeated acyclic supplied values", () => {
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(ConflictResolverSchema.safeParse(resolver([candidate({ value: cyclic }), candidate({ id: "candidate-2" })])).success).toBe(false);
    const outer = summary() as unknown as Record<string, unknown>; outer.report = outer;
    expect(ValidationSummarySchema.safeParse(outer).success).toBe(false);
    const shared = { complete: [0, false, null] };
    expect(ValidationSummarySchema.safeParse(summary([issue({ context: { first: shared, second: shared } })])).success).toBe(true);
  });

  it("CV-S32 refuses symbols hidden data sparse arrays and custom array properties", () => {
    const hidden = Object.defineProperty({}, "hidden", { value: "No omission", enumerable: false });
    const sparse = new Array(2); sparse[1] = "Last";
    const extra = ["Supplied"] as string[] & { extra?: string }; extra.extra = "No omission";
    expect(ConflictResolverSchema.safeParse({ ...resolver(), [Symbol("hidden")]: true }).success).toBe(false);
    for (const context of [hidden, { [Symbol("hidden")]: true }, sparse, extra]) expect(ValidationIssueSchema.safeParse(issue({ context })).success).toBe(false);
    expect(ConflictResolverSchema.safeParse(resolver(sparse)).success).toBe(false);
    expect(ValidationSummarySchema.safeParse(summary(sparse)).success).toBe(false);
  });

  it("CV-S33 catches throwing descriptor traps before nested parsing or serialization", () => {
    const value = new Proxy({}, { ownKeys() { throw new Error("Supplied descriptor failure"); } });
    const nested = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("Supplied descriptor failure"); }, ownKeys() { return ["key"]; } });
    expect(ConflictResolverSchema.safeParse(value).success).toBe(false);
    expect(ValidationSummarySchema.safeParse(summary([issue({ context: value })])).success).toBe(false);
    expect(ValidationIssueSchema.safeParse(issue({ context: nested })).success).toBe(false);
  });

  it("CV-S34 refuses omitted unsupported and nonfinite JSON instead of reinterpreting it", () => {
    for (const value of [undefined, NaN, Infinity, -Infinity, BigInt(1), Symbol("supplied"), () => "supplied"]) {
      expect(ConflictResolverSchema.safeParse(resolver([{ ...candidate(), value } as InspectionField, candidate({ id: "candidate-2" })])).success).toBe(false);
      expect(ValidationIssueSchema.safeParse({ ...issue(), context: value }).success).toBe(false);
    }
  });

  it("CV-S35 preserves per-context node string and depth bounds through one hundred issues", () => {
    const context = Array.from({ length: 199 }, () => ({ a: 0, b: false, c: null, d: "" }));
    expect(InspectableJSONSchema.safeParse(context).success).toBe(true);
    const issues = Array.from({ length: 100 }, (_, index) => issue({ id: `issue-${index}`, context,
      evidence: Array.from({ length: 20 }, (_, number) => ({ id: `evidence-${number}`, label: "Supplied evidence" })) }));
    expect(ValidationSummarySchema.safeParse(summary(issues)).success).toBe(true);
    expect(ValidationIssueSchema.safeParse(issue({ context: [...context, { a: 0, b: false, c: null, d: "" }] })).success).toBe(false);
    let nested: unknown = null; for (let depth = 0; depth < 8; depth++) nested = [nested];
    expect(ValidationSummarySchema.safeParse(summary([issue({ context: nested })])).success).toBe(true);
    for (const context of [[nested], "x".repeat(10001), Array.from({ length: 10 }, () => "x".repeat(7000))]) expect(ValidationIssueSchema.safeParse(issue({ context })).success).toBe(false);
    expect(ValidationSummarySchema.safeParse(summary([issue({ context: "é".repeat(10000) })])).success).toBe(true);
  });

  it("CV-S36 admits exactly two MiB of parsed conflict UTF8 JSON and rejects one extra byte", () => {
    const value = atConflictBudget(); const parsed = ConflictResolverSchema.parse(value);
    expect(bytes(parsed)).toBe(2097152); expect(ConflictResolverSchema.safeParse({ ...value, description: "x" }).success).toBe(false);
    expect(ConflictResolverSchema.safeParse({ ...value, description: "é" }).success).toBe(false);
  });

  it("CV-S37 admits exactly two MiB of parsed validation UTF8 JSON and rejects one extra byte", () => {
    const value = atValidationBudget(); const parsed = ValidationSummarySchema.parse(value);
    expect(bytes(parsed)).toBe(2097152); expect(ValidationSummarySchema.safeParse({ ...value, description: "x" }).success).toBe(false);
    expect(ValidationSummarySchema.safeParse({ ...value, description: "é" }).success).toBe(false);
  });

  it("CV-S38 exposes strict output JSON schemas with explicit four-state unions", () => {
    for (const schema of [ConflictResolverSchema, ValidationSummarySchema]) {
      const json = z.toJSONSchema(schema) as { oneOf?: { additionalProperties?: boolean; required?: string[]; properties?: Record<string, unknown> }[] };
      expect(json.oneOf).toHaveLength(4);
      for (const variant of json.oneOf ?? []) { expect(variant.additionalProperties).toBe(false); expect(variant.required).toEqual(expect.arrayContaining(["id", "revision", "title", "state"])); }
    }
    const json = z.toJSONSchema(ValidationIssueSchema) as { additionalProperties?: boolean; required?: string[]; properties?: Record<string, unknown> };
    expect(json.additionalProperties).toBe(false); expect(json.required).toEqual(expect.arrayContaining(["id", "revision", "label", "severity", "message", "evidence"]));
    expect(json.required).not.toContain("context"); expect(json.properties).toHaveProperty("context");
  });

  it("CV-S39 routes public validation to the new owners while preserving unrelated aliases", () => {
    expect(publicSchemas.ConflictResolverSchema).toBe(ConflictResolverSchema); expect(publicSchemas.ValidationSummarySchema).toBe(ValidationSummarySchema);
    expect(publicSchemas.schemaBySlug["conflict-resolver"]).toBe(ConflictResolverSchema); expect(publicSchemas.schemaBySlug["validation-summary"]).toBe(ValidationSummarySchema);
    expect(publicSchemas.RecordInspectorSchema).toBe(RecordInspectorSchema); expect(publicSchemas.RecommendationCardSchema).toBe(publicSchemas.GenericComponentSchema);
    const conflictEnvelope = { version: 1, kind: "mcpcn/conflict-resolver", data: resolver() };
    const validationEnvelope = { version: 1, kind: "mcpcn/validation-summary", data: summary() };
    expect(publicSchemas.validatePayload(conflictEnvelope, ConflictResolverSchema).success).toBe(true);
    expect(publicSchemas.validatePayload(validationEnvelope, ValidationSummarySchema).success).toBe(true);
    expect(publicSchemas.validatePayload({ ...conflictEnvelope, data: { title: "Legacy generic", items: [] } }, ConflictResolverSchema).success).toBe(false);
    expect(publicSchemas.validatePayload({ ...validationEnvelope, data: { title: "Legacy generic", items: [] } }, ValidationSummarySchema).success).toBe(false);
  });

  it("CV-S40 canonicalizes equivalent JSON key order while retaining every meaningful member term", () => {
    const first = ConflictResolverSchema.parse(resolver([candidate({ value: { a: false, b: { c: 0 } }, evidence: [evidence] }), candidate({ id: "candidate-2" })]));
    const reordered = ConflictResolverSchema.parse(resolver([candidate({ value: { b: { c: 0 }, a: false }, evidence: [evidence] }), candidate({ id: "candidate-2" })]));
    expect(stableReviewKey(first)).toBe(stableReviewKey(reordered));
    for (const patch of [{ revision: "two" }, { label: "Replacement" }, { value: false }, { confidence: 0 }, { evidence: [{ ...evidence, text: "Replacement" }] }]) expect(stableReviewKey(ConflictResolverSchema.parse(resolver([candidate({ value: { a: false, b: { c: 0 } }, evidence: [evidence], ...patch }), candidate({ id: "candidate-2" })])))).not.toBe(stableReviewKey(first));
    const reported = ValidationSummarySchema.parse(summary([issue({ context: { a: false, b: 0 } })]));
    expect(stableReviewKey(reported)).toBe(stableReviewKey(ValidationSummarySchema.parse(summary([issue({ context: { b: 0, a: false } })]))));
    for (const patch of [{ revision: "two" }, { severity: "error" as const }, { message: "Replacement" }, { context: null }, { evidence: [evidence] }]) expect(stableReviewKey(ValidationSummarySchema.parse(summary([issue({ context: { a: false, b: 0 }, ...patch })])))).not.toBe(stableReviewKey(reported));
  });
});

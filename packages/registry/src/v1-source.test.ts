// Authored source/JSON-schema checks. No generation, installed consumer or host claim.
import { readFile } from "node:fs/promises";
import { posix } from "node:path";
import { describe, expect, it } from "vitest";
import { GenericComponentSchema, schemaBySlug, toJSONSchema } from "@mcpcn/schemas";
import { blockCatalog, catalog } from "./catalog.js";
import { componentDataSchema } from "./index.js";
import { defaultConfig, renderProvider } from "./installation.js";
import { buildSourceRegistry } from "./source-registry.js";

const root = new URL("../../../", import.meta.url);
const readSource = (path: string) => readFile(new URL(path, root), "utf8");
const build = (read = readSource) => buildSourceRegistry({ catalog, blockCatalog, readSource: read, providerSource: renderProvider(defaultConfig) });
const requiredComponents = [
  ["approval-checklist", "ApprovalChecklist"], ["before-submit-confirmation", "BeforeSubmitConfirmation"],
  ["destructive-action-guard", "DestructiveActionGuard"], ["human-override-panel", "HumanOverridePanel"], ["permission-request-card", "PermissionRequestCard"],
  ["approval-card", "ApprovalCard"], ["confirmation-panel", "ConfirmationPanel"], ["risk-review-panel", "RiskReviewPanel"],
  ["tool-progress-timeline", "ToolProgressTimeline"], ["tool-call-card", "ToolCallCard"], ["retryable-error-state", "RetryableErrorState"],
  ["tool-result-card", "ToolResultCard"], ["running-task-card", "RunningTaskCard"], ["partial-result-viewer", "PartialResultViewer"], ["queued-step-list", "QueuedStepList"], ["tool-trace-viewer", "ToolTraceViewer"],
  ["schema-form", "SchemaForm"], ["dynamic-question-flow", "DynamicQuestionFlow"], ["entity-review-table", "EntityReviewTable"],
  ["extracted-fields-review", "ExtractedFieldsReview"], ["diff-viewer", "DiffViewer"], ["comparison-matrix", "ComparisonMatrix"],
  ["score-breakdown", "ScoreBreakdown"], ["audit-trail", "AuditTrail"], ["source-evidence-panel", "SourceEvidencePanel"], ["auth-required-card", "AuthRequiredCard"],
  ["missing-data-request", "MissingDataRequest"], ["multi-step-form", "MultiStepForm"], ["inline-edit-form", "InlineEditForm"], ["form-progress-card", "FormProgressCard"], ["validated-field-list", "ValidatedFieldList"],
] as const;
const modules = [
  ["packages/core/src/index.ts", "core.ts"], ["packages/schemas/src/index.ts", "schemas.ts"],
  ["packages/react/src/index.tsx", "components.tsx"], ["packages/runtime/src/index.tsx", "runtime.tsx"],
  ["packages/schemas/src/schema-common.ts", "schema-common.ts"], ["packages/schemas/src/review-schemas.ts", "review-schemas.ts"],
  ["packages/schemas/src/decision-schemas.ts", "decision-schemas.ts"], ["packages/schemas/src/execution-schemas.ts", "execution-schemas.ts"],
  ["packages/react/src/primitives.tsx", "primitives.tsx"], ["packages/react/src/component-helpers.tsx", "component-helpers.tsx"],
  ["packages/react/src/review-components.tsx", "review-components.tsx"], ["packages/react/src/decision-components.tsx", "decision-components.tsx"],
  ["packages/react/src/execution-components.tsx", "execution-components.tsx"], ["packages/react/src/component-types.ts", "component-types.ts"],
  ["packages/schemas/src/approval-schemas.ts", "approval-schemas.ts"],
  ["packages/react/src/approval-components.tsx", "approval-components.tsx"],
  ["packages/schemas/src/tool-workflow-schemas.ts", "tool-workflow-schemas.ts"],
  ["packages/react/src/tool-workflow-components.tsx", "tool-workflow-components.tsx"],
  ["packages/schemas/src/form-workflow-schemas.ts", "form-workflow-schemas.ts"],
  ["packages/react/src/form-workflow-components.tsx", "form-workflow-components.tsx"],
] as const;
const namespaces: Record<string, string> = { "@mcpcn/core": "./core", "@mcpcn/schemas": "./schemas", "@mcpcn/react": "./components", "@mcpcn/runtime": "./runtime" };
const adapt = (text: string) => text.replace(/(["'])(@mcpcn\/(?:core|schemas|react|runtime))\1/g, (_match, quote: string, name: string) => `${quote}${namespaces[name]}${quote}`);

describe("v1 component schema and copied-source integration", () => {
  it("binds all named schemas to real component functions instead of the generic alias", async () => {
    const implementations = (await Promise.all(["index", "review-components", "decision-components", "execution-components", "approval-components", "tool-workflow-components", "form-workflow-components"].map(name => readSource(`packages/react/src/${name}.tsx`)))).join("\n");
    expect(Object.keys(schemaBySlug)).toHaveLength(39);
    expect(Object.keys(schemaBySlug)).toEqual(expect.arrayContaining(requiredComponents.map(([slug]) => slug)));
    for (const [slug, name] of requiredComponents) {
      expect(schemaBySlug[slug]).not.toBe(GenericComponentSchema);
      expect(implementations).toMatch(new RegExp(`export function ${name}\\(`));
      expect(implementations).not.toMatch(new RegExp(`\\b${name}\\s*=\\s*GenericAgentComponent`));
    }
  });

  it("exports the actual default-output JSON Schema for every named component", () => {
    for (const [slug] of requiredComponents) {
      const schema = componentDataSchema(slug);
      expect(schema).toEqual(toJSONSchema(schemaBySlug[slug]));
      expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
      expect(schema?.type).toBe("object");
    }
    const confirmation = componentDataSchema("confirmation-panel")!;
    expect((confirmation.properties as Record<string, { default?: unknown }>).requiresExplicitConsent?.default).toBe(true);
    const tool = componentDataSchema("tool-call-card")!;
    expect((tool.properties as Record<string, { default?: unknown }>).title?.default).toBe("Tool call");
  });

  it("keeps generic contracts honest and omits schemas for twelve primitives and unknown names", () => {
    const generic = catalog.filter(item => item.category !== "primitive" && !item.specialized);
    const primitive = catalog.filter(item => item.category === "primitive");
    expect(generic).toHaveLength(17); expect(primitive).toHaveLength(12);
    for (const item of generic) expect(componentDataSchema(item.slug)).toEqual(toJSONSchema(GenericComponentSchema));
    for (const item of primitive) expect(componentDataSchema(item.slug)).toBeUndefined();
    for (const name of ["missing-component", "ApprovalCard", "APPROVAL-CARD", "review-before-action"]) expect(componentDataSchema(name)).toBeUndefined();
  });

  it("detaches public schema results so a consumer cannot change subsequent registry contracts", () => {
    const first = componentDataSchema("confirmation-panel")!;
    const expected = JSON.stringify(first);
    first.title = "Consumer-only mutation";
    expect(JSON.stringify(componentDataSchema("confirmation-panel"))).toBe(expected);
  });

  it("places canonical data schemas in identical index and item metadata with the exact category counts", async () => {
    const { registry, items } = await build();
    expect(items).toHaveLength(79); expect(registry.items).toBe(items);
    expect(items.filter(item => item.meta.implementation === "specialized")).toHaveLength(39);
    expect(items.filter(item => item.meta.implementation === "generic-alias")).toHaveLength(17);
    expect(items.filter(item => item.meta.implementation === "primitive")).toHaveLength(12);
    expect(items.filter(item => item.meta.implementation === "workflow-block")).toHaveLength(11);
    for (const item of items) {
      if (item.type === "registry:block" || item.meta.implementation === "primitive") expect(Object.hasOwn(item.meta, "dataSchema")).toBe(false);
      else expect(item.meta.dataSchema).toEqual(componentDataSchema(item.name));
      expect(JSON.parse(JSON.stringify(registry.items.find(entry => entry.name === item.name)))).toEqual(JSON.parse(JSON.stringify(item)));
    }
  });

  it("copies every earlier owner module with namespace-only adaptations and complete provenance", async () => {
    const { items } = await build();
    const originals = await Promise.all(modules.map(async ([path, name]) => ({ path, name, text: await readSource(path) })));
    for (const item of items) {
      const provenance = item.meta.provenance as { sourceFiles: string[] };
      for (const module of originals) {
        expect(item.files.find(file => file.path === `components/mcpcn/_mcpcn/${module.name}`)?.content).toBe(adapt(module.text));
        expect(provenance.sourceFiles).toContain(module.path);
      }
      expect(item.files.find(file => file.path === "components/mcpcn/LICENSE")?.content).toBe(await readSource("LICENSE"));
    }
  });

  it("resolves all new local js module imports to copied ts or tsx files without MCPCN package dependencies", async () => {
    const { items } = await build();
    for (const item of items) {
      const paths = new Set(item.files.map(file => file.path));
      for (const file of item.files.filter(file => /\.(?:ts|tsx)$/.test(file.path))) {
        expect(file.content).not.toContain("@mcpcn/");
        for (const match of file.content.matchAll(/\bfrom\s*["'](\.[^"']+)["']|\bimport\s*["'](\.[^"']+)["']/g)) {
          const target = posix.normalize(posix.join(posix.dirname(file.path), (match[1] ?? match[2])!));
          const stem = target.replace(/\.js$/, "");
          expect([target, `${stem}.ts`, `${stem}.tsx`].some(path => paths.has(path))).toBe(true);
        }
      }
    }
  });

  it("fails rather than emitting a partial registry when any new family or shared source module is missing", async () => {
    for (const [missing] of modules.slice(4)) {
      await expect(build(path => path === missing ? Promise.resolve("") : readSource(path))).rejects.toThrow("registry_source_invalid");
    }
  });

  it("fails closed when a new helper has an unresolved local or undeclared external dependency", async () => {
    const helper = "packages/react/src/component-helpers.tsx";
    for (const source of ['export { missing } from "./missing-helper.js";', 'export { missing } from "unreviewed-package";']) {
      await expect(build(path => path === helper ? Promise.resolve(source) : readSource(path))).rejects.toThrow("registry_source_invalid");
    }
  });
});

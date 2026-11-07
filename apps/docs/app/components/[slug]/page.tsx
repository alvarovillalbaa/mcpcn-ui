import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { catalog, componentDataSchema, findCatalogItem } from "@mcpcn/registry";
import { ApprovalDemo, AuditDemo, FormDemo, GenericDemo, ProgressDemo, ReviewDemo } from "../../../components/demos";
import { ConfirmationPanelDemo, RiskReviewPanelDemo, DiffViewerDemo, SourceEvidencePanelDemo } from "../../../components/v1-review-demos";
import { DynamicQuestionFlowDemo, ExtractedFieldsReviewDemo, ComparisonMatrixDemo, ScoreBreakdownDemo } from "../../../components/v1-decision-demos";
import { ToolCallCardDemo, RetryableErrorStateDemo, AuthRequiredCardDemo } from "../../../components/v1-execution-demos";
import { ComponentPreview } from "../../../components/component-preview";

export function generateStaticParams() { return catalog.map(item => ({ slug: item.slug })); }

const demos: Record<string, ReactNode> = {
  "approval-card": <ApprovalDemo />, "tool-progress-timeline": <ProgressDemo />,
  "schema-form": <FormDemo />, "entity-review-table": <ReviewDemo />, "audit-trail": <AuditDemo />,
  "confirmation-panel": <ConfirmationPanelDemo />, "risk-review-panel": <RiskReviewPanelDemo />,
  "diff-viewer": <DiffViewerDemo />, "source-evidence-panel": <SourceEvidencePanelDemo />,
  "dynamic-question-flow": <DynamicQuestionFlowDemo />, "extracted-fields-review": <ExtractedFieldsReviewDemo />,
  "comparison-matrix": <ComparisonMatrixDemo />, "score-breakdown": <ScoreBreakdownDemo />,
  "tool-call-card": <ToolCallCardDemo />, "retryable-error-state": <RetryableErrorStateDemo />,
  "auth-required-card": <AuthRequiredCardDemo />
};
const events: Record<string, Array<[string, string]>> = {
  "approval-card": [["approve", "{ tool? }"], ["cancel", "No data"]],
  "tool-progress-timeline": [["retry", "{ stepId, tool }"]],
  "schema-form": [["submit", "{ values: current field allowlist, tool? }"]],
  "entity-review-table": [["confirm", "{ ids: current row IDs, tool? }"]],
  "audit-trail": [],
  "confirmation-panel": [["confirm", "{ reviewId, changeIds }"], ["cancel", "{ reviewId }"]],
  "risk-review-panel": [["acknowledge-risk", "{ reviewId, riskId, acknowledged }"], ["accept-risks", "{ reviewId, riskIds }"], ["cancel", "{ reviewId }"]],
  "diff-viewer": [["select-change", "{ reviewId, changeId }"]],
  "source-evidence-panel": [["select-source", "{ reviewId, sourceId }"]],
  "dynamic-question-flow": [["answer-change", "{ flowId, questionId, value }"], ["question-change", "{ flowId, questionId }"], ["submit", "{ flowId, answers: visible question allowlist }"]],
  "extracted-fields-review": [["correction-change", "{ reviewId, fieldId, value }"], ["submit", "{ reviewId, values: current field allowlist }"]],
  "comparison-matrix": [["selection-change", "{ comparisonId, selectedId }"], ["confirm", "{ comparisonId, selectedId }"]],
  "score-breakdown": [["criterion-review", "{ scoreId, criterionId }"]],
  "tool-call-card": [["inspect", "{ id, tool, arguments, status, result? }"]],
  "retryable-error-state": [["retry", "{ id, tool, arguments, attempt }"]],
  "auth-required-card": [["request-auth", "{ id, service, scopes: scope IDs }"]]
};
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function fieldType(value: unknown): string {
  const field = object(value);
  if (Array.isArray(field.enum)) return "enum";
  if (typeof field.type === "string") return field.type;
  if (Array.isArray(field.type)) return field.type.join(" | ");
  if (typeof field.$ref === "string") return "referenced value";
  if (Array.isArray(field.anyOf) || Array.isArray(field.oneOf)) return "union";
  return "structured value";
}

export default async function ComponentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params, item = findCatalogItem(slug);
  if (!item) notFound();
  const schema = componentDataSchema(slug), properties = object(schema?.properties);
  const requiredFields = schema?.required;
  const required = new Set(Array.isArray(requiredFields) ? requiredFields.filter((value): value is string => typeof value === "string") : []);
  const implementation = item.category === "primitive" ? "Primitive" : item.specialized ? "Domain component" : "Shared informational alias";
  const renderCode = 'import { ' + item.name + ' } from "@mcpcn/react";\nimport { ' + item.name + 'Schema } from "@mcpcn/schemas";\n\nconst data = ' + item.name + 'Schema.parse(candidateData);\n<' + item.name + ' {...data} onAction={handleAction} />;';
  const serverCode = 'import { ' + item.name + 'Schema } from "@mcpcn/schemas";\nimport { createStructuredResult } from "@mcpcn/server";\n\nexport function reviewedResult(candidate: unknown) {\n  const data = ' + item.name + 'Schema.parse(candidate);\n  return createStructuredResult("' + item.slug + '", data);\n}';
  return <main>
    <span className="eyebrow">{item.category}</span><h1>{item.name}</h1><p className="lede">{item.description}</p>
    <div className="filter-row"><span className="pill">{implementation}</span><span className="pill">React</span>{schema && <span className="pill">Validated data</span>}</div>
    {!item.specialized && item.category !== "primitive" && <p>This name currently shares the generic informational-card implementation. Dedicated component behavior remains unfinished.</p>}
    <section className="preview-shell" aria-label={item.name + " preview"}>
      <ComponentPreview>
      {demos[slug] ?? (item.category !== "primitive" ? <GenericDemo title={item.name} /> : <p>A dedicated interactive preview for this primitive is not available yet.</p>)}
      </ComponentPreview>
    </section>
    <section className="section prose">
      <h2>Install</h2><pre className="code">pnpm dlx mcpcn add {item.slug}</pre>
      <p>Public npm availability is a separate release gate. The repository documentation records the currently verified source, archives and hosting profile.</p>
      {schema && <>
        <h2>Data props</h2><p>These fields come from the actual exported schema. Defaults may be omitted on input; the schema below describes validated output. Runtime checks also validate identities, conditional values and safe evidence links.</p>
        <div className="mcpcn-table-wrap"><table className="mcpcn-table"><caption>{item.name} data fields</caption><thead><tr><th>Field</th><th>Type</th><th>Input</th></tr></thead><tbody>
          {Object.entries(properties).map(([name, field]) => <tr key={name}><th scope="row"><code>{name}</code></th><td>{fieldType(field)}</td><td>{"default" in object(field) ? "Defaulted" : required.has(name) ? "Required" : "Optional"}</td></tr>)}
        </tbody></table></div>
        <h2>React integration</h2><pre className="code">{renderCode}</pre>
        <p><code>className</code> styles the surface and <code>onAction</code> receives consumer-owned intent. The new domain controls and revised approval/form surfaces expose <code>busy</code> and <code>error</code> feedback. Controlled selections and answers must be acknowledged by updating their props.</p>
        <h2>Events</h2>{events[slug]?.length ? <div className="mcpcn-table-wrap"><table className="mcpcn-table"><caption>{item.name} action payloads</caption><thead><tr><th>Action type</th><th>Data</th></tr></thead><tbody>{events[slug]!.map(([type, data]) => <tr key={type}><th scope="row"><code>{type}</code></th><td><code>{data}</code></td></tr>)}</tbody></table></div> : <p>This surface displays data and has no dedicated domain event contract.</p>}
        <h2>JSON Schema</h2><pre className="code" aria-label={item.name + " JSON Schema"}>{JSON.stringify(schema, null, 2)}</pre>
        <h2>Structured tool result</h2><pre className="code">{serverCode}</pre>
      </>}
      <h2>Security contract</h2>
      <p>Previews use authored data and consumer callbacks. Applications own authorization, persistence, tool execution and explicit model-context publication.</p>
      <p><strong>Declared model-visible fields:</strong> {item.security.modelVisible.join(", ") || "None"}</p>
      <p><strong>Private fields:</strong> {item.security.privateOnly.join(", ")}</p>
      <p><strong>Declared consumer tool intents:</strong> {item.security.callsTools.join(", ") || "None"}</p>
      <p><strong>Destructive intent:</strong> {item.security.destructive ? "Potentially; review the exact application action" : "No by default"}</p>
      <h2>Host and keyboard behavior</h2>
      <p>Host integration uses the consuming application's runtime provider. Native inputs, buttons, links and semantic tables expose the local interactions shown above. External-host compatibility and full accessibility conformance require their own acceptance evidence.</p>
    </section>
  </main>;
}

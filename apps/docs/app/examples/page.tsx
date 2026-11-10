import Link from "next/link";

const examples = [
  ["hr-candidate-review", "HR candidate review"], ["document-extraction", "Document extraction review"],
  ["ecommerce-checkout-review", "Ecommerce checkout review"], ["admin-settings-change", "SaaS admin change"], ["research-workflow", "Multi-step research workflow"],
] as const;
export const metadata = { title: "Examples" };
export default function Examples() {
  return <main><span className="eyebrow">Reference UIs</span><h1>Start with an authored workflow</h1>
    <p className="lede">Five React examples demonstrate supplied data and review interactions. Connect your own authorized server and audit service before using their actions in a real workflow.</p>
    <div className="catalog-grid">{examples.map(([slug, name], index) => <article className="catalog-card" key={slug}><span>Example 0{index + 1}</span><h3>{name}</h3>
      <p>Includes an authored fixture and React review surface. Document extraction also offers an explicit local text-file adapter; the examples do not persist or execute external actions.</p>
      <a href={`https://github.com/alvarovillalbaa/mcpcn-ui/tree/main/examples/${slug}`}>Read example source</a></article>)}</div>
    <p><Link href="/docs/server">Build the validated MCP server integration</Link>. Component callbacks are requests; the server must enforce access and reviewed terms.</p>
  </main>;
}

import Link from "next/link";

const examples = [
  ["hr-candidate-review", "HR candidate review", "Inspect supplied evidence,scores,gaps and risks; persist an explicit reviewer decision and note."],
  ["document-extraction", "Document extraction review", "Submit UTF-8 text,inspect source matches,correct extracted fields and confirm their persistent save."],
  ["ecommerce-checkout-review", "Ecommerce checkout review", "Review prices,shipping,tax and return terms; refresh an expired quote and record one uncharged order."],
  ["admin-settings-change", "SaaS admin change", "Review actual reference preferences,affected members and before/after values; apply a change or a fresh reviewed rollback."],
  ["research-workflow", "Multi-step research workflow", "Gather configured sources,inspect complete text and failures,retry one failed source and save a human conclusion."],
] as const;
export const metadata = { title: "Examples" };
export default function Examples() {
  return <main><span className="eyebrow">Persistent reference workflows</span><h1>Review. Confirm. Verify.</h1>
    <p className="lede">Five React applications connect real MCP tools to a private local SQLite workspace. Their reviewed records and audit survive a restart.</p>
    <p><Link className="button" href="/docs/reference-workflows">Run the reference workbench</Link></p>
    <div className="catalog-grid">{examples.map(([slug, name, description], index) => <article className="catalog-card" key={slug}><span>Example 0{index + 1}</span><h3>{name}</h3>
      <img src={`/reference-workflows/${slug}.png`} alt={`${name} in the actual local workbench with authored check data`} width={1280} height={1000} loading="lazy" style={{ display: "block", width: "100%", height: "auto", borderRadius: 10, border: "1px solid var(--line)" }} />
      <p>{description}</p>
      <a href={`https://github.com/alvarovillalbaa/mcpcn-ui/tree/main/examples/${slug}`}>Read example source</a></article>)}</div>
    <p>No payment,candidate messaging,SSO,OCR or AI provider is connected. These are local reference applications; production identity/providers and external-host compatibility require separate integration and acceptance.</p>
    <p><Link href="/docs/server">Build the validated MCP server integration</Link>. Component callbacks are requests; the server enforces the authorized principal,current revision and exact reviewed terms.</p>
  </main>;
}

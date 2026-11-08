export const metadata = { title: "Playground" };
export default function Playground() {
  return <main>
    <span className="eyebrow">MCP Apps playground</span><h1>Test the whole interaction.</h1>
    <p className="lede">Load authored fixtures into a real app iframe, inspect observed SDK messages and rehearse host capabilities. The same simulator is bundled with the local CLI.</p>
    <iframe title="MCPCN host simulator" src="/playground-simulator/index.html" sandbox="allow-scripts allow-same-origin allow-downloads" allow="clipboard-write" style={{ width: "100%", minHeight: 2000, border: "1px solid var(--border)", borderRadius: 12 }} />
    <p>Run <code>mcpcn dev</code> or <code>mcpcn preview approval-card</code> from a built package to serve this simulator on <code>127.0.0.1:4545</code>. Public npm availability remains pending.</p>
  </main>;
}

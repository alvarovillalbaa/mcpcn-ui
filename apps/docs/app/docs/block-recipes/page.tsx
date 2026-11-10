import Link from "next/link";
import { blockCatalog } from "@mcpcn/registry/catalog";
import styles from "./recipes.module.css";

export const metadata = { title: "Persistent block server recipes" };
const setup = `// Server entry only. Supply a dedicated caller-opened Node24 SQLite DB.
import { registerReviewBeforeActionServer, BlockWorkflowStore } from "@mcpcn/server/blocks";

const store = new BlockWorkflowStore(database);
store.seed(trustedPrincipal, "review-before-action", "settings-one", serverOwnedState);
const registration = registerReviewBeforeActionServer(mcpServer, {
  store,
  policyRevision: "settings-policy-v1",
  resolvePrincipal: resolveVerifiedTransportPrincipal,
  html: builtReviewBeforeActionAppHtml,
  executors: {
    "change-setting": ({ database, principal, operation, signal }) => {
      const change = SettingChangeSchema.parse(operation.arguments);
      if (signal.aborted) throw new Error("cancelled");
      const update = database.prepare(
        "UPDATE business_settings SET value=?,revision=revision+1 " +
        "WHERE workspace=? AND id=? AND revision=?"
      ).run(change.value, principal.workspace, change.id, change.revision);
      if (update.changes !== 1) throw new Error("business_revision_conflict");
      return { id: change.id, revision: change.revision + 1, value: change.value };
    }
  }
});
// dispose() removes only this block's tools/resource and cancels pending work.`;
export default function BlockRecipes() {
  return <main className={"docs-layout server-guide " + styles.guide}><aside className="sidebar" aria-label="Block recipe guide"><Link href="/blocks">All eleven blocks</Link><a href="#install">Install</a><a href="#server">Wire the server</a><a href="#review">Review lifecycle</a><a href="#boundaries">Data and execution boundaries</a><a href="#recipes">Recipes and previews</a></aside>
    <article className="prose" style={{ minWidth: 0 }} aria-label="Persistent block recipe guide"><span className="eyebrow">UI and server together</span><h1>Make a reviewed change. Keep the result.</h1>
      <p>Each workflow block has a controlled React UI, a bound app, typed Zod schemas, a real MCP server registration, an authored input/result fixture, a runnable SDK/SQLite check and a README. The app reads the server record, prepares exact terms, confirms the reviewed change and displays its saved state and audit.</p>
      <h2 id="install">Install one block</h2><p>Install the matching CLI package archive from the repository release first. Public npm publication remains pending; these commands use the installed archive directly.</p><pre className="code" aria-label="Block installation commands">{`node node_modules/mcpcn/dist/index.js init --mode=copy --host=standard-mcp
node node_modules/mcpcn/dist/index.js add review-before-action`}</pre>
      <p>Copy mode adds editable client code and explicit .server.mts, .fixture.mts, .server.test.mts and .README.md entries under your block directory. Package mode adds equivalent thin entries using matching package archives. The CLI prints dependency commands and never installs dependencies or executes a fixture. Keep server and fixture modules out of browser imports.</p>
      <p>Use Node 24.22.2 for the SQLite server. Copied sources use strict Bundler TypeScript and explicit emitted server .mjs modules; the caller package can use CommonJS. Package server declarations support Bundler and NodeNext. Full copied-source NodeNext compatibility remains a separate quality gate because existing client imports and pinned upstream implementation declarations contain extensionless paths.</p>
      <pre className="code" aria-label="Bound block app entry">{`"use client";
import { MCPCNProvider } from "./components/mcpcn/provider";
import { ReviewBeforeActionApp } from "./components/mcpcn/blocks/review-before-action";

export default function App() {
  return <MCPCNProvider><ReviewBeforeActionApp /></MCPCNProvider>;
}`}</pre>
      <p>The record identity comes from the authorized read tool result, or an explicit id prop. Select the OpenAI adapter with --host=openai for that host. Neither adapter supplies server authentication.</p>
      <h2 id="server">Wire the server-owned operation</h2><p>Open an empty dedicated SQLite database in your server, supply validated initial state and resolve a trusted principal from the original verified transport context on every request. The store refuses a foreign schema. This sketch names consumer-owned state, authentication, business validation and built HTML explicitly; replace those integration points with your application.</p>
      <pre className="code" aria-label="Transaction-local server registration">{setup}</pre>
      <p>Import the matching state schema from @mcpcn/schemas/blocks and the named registration from @mcpcn/server/blocks. Fixture entries show complete authored state and real revision-checked business SQL. Use fixtures only with disposable data; their fixed principal is a check identity.</p>
      <h2 id="review">A review is exact and short-lived</h2><ol><li>Read the authorized record and its current revision.</li><li>Submit a correction, selection or action. Prepare stores exact terms without applying the business change.</li><li>Review full values, arguments and evidence. Every new prepared review starts unchecked.</li><li>Confirm within five minutes. The server rechecks grants, actor, workspace, block, record revision, policy and captured terms before committing state, token consumption and audit.</li><li>Reload and inspect the saved outcome. An uncertain network response may follow a committed operation; another mutation stays blocked until a successful read.</li></ol>
      <p>Cancel revokes an unconsumed review and clears its private proposal. It cannot undo a committed operation. Exact consumed-token replay returns its original receipt and the current record without running SQL again; current block access is still required. Audit history stays in SQLite; the app shows the latest 100 events and the earlier-event count.</p>
      <h2 id="boundaries">Concrete execution and data boundaries</h2><p>Executors are trusted synchronous functions using the same SQLite connection. Enforce current business-row revision and principal scope inside each executor. Bulk rows share one savepoint: a failed member rolls back every selected business change and records a sanitized failed outcome. Multi-step runs execute only the next eligible queued step or eligible failed step, after a separate review.</p>
      <p>This transaction does not atomically send email, charge cards or change another service. External or asynchronous actions need your own durable idempotency, outbox and reconciliation. Report approval saves the reviewed report; it does not publish it externally.</p>
      <p>Only deliberate block/id/revision/status/receipt fields enter public text and structured output. Complete business values, arguments, source text, review tokens and audit use app-only metadata, which the host can still read. Metadata, visibility and consent checkboxes are not authentication or proof of human identity.</p>
      <p>Text extraction supports complete UTF-8 .txt/.md documents up to 64 KiB, preserving a BOM. Invoice labels: Supplier:, Total:, Currency:. Contract labels: Party:, Effective date:, Term:. Resume labels: Name:, Email:, Experience:. Select a file, explicitly extract it, review its complete text/hash/source matches, save that extraction, then separately review acceptance. No PDF, OCR or model provider is included.</p>
      <h2 id="recipes">All eleven recipes</h2><div className="block-grid">{blockCatalog.map(block => <section className="catalog-card" key={block.name} aria-label={block.name + " recipe"}><h3>{block.name}</h3><p>{block.description}</p>
        <pre className="code">pnpm dlx mcpcn add {block.name}</pre><a href={`/block-recipes/${block.name}.png`}><img src={`/block-recipes/${block.name}.png`} alt={block.name + " saved workflow preview"} width={1280} height={1000} loading="lazy" style={{ width: "100%", height: "auto" }} /></a>
        <p><a href={`/r/${block.name}.json`}>Editable UI/server/schema/fixture/test/README payload</a></p></section>)}</div>
      <p><a href="https://github.com/alvarovillalbaa/mcpcn-ui/blob/main/docs/specs/block-server-recipes.md">Source contract and verification boundary</a>. Public npm, external-host certification, production identity/providers and full accessibility/device acceptance remain separate gates. <Link href="/docs/server">Generic server integration</Link> and <Link href="/docs/reference-workflows">five persistent reference applications</Link> are also available.</p>
    </article></main>;
}

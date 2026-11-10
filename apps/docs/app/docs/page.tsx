import Link from "next/link";
import { blockCatalog, catalog } from "@mcpcn/registry/catalog";
import { buildInstallationPlan } from "@mcpcn/registry/installation";
import { archiveDefaultConfig } from "../../lib/release-installation";
import { ArchiveSetup } from "../../components/archive-setup";

export const metadata = { title: "Documentation" };
const sections = [["contract", "The contract"], ["install", "Install"], ["provider", "Mount your provider"], ["first-component", "Your first component"], ["host-compatibility", "Host compatibility"], ["security-boundaries", "Security boundaries"], ["registry", "Registry"], ["server-helpers", "Server helpers"]] as const;

export default function Docs() {
  const copy = buildInstallationPlan(archiveDefaultConfig, ["review-before-action"], catalog, blockCatalog);
  const component = buildInstallationPlan(archiveDefaultConfig, ["approval-card"], catalog, blockCatalog);
  const packaged = buildInstallationPlan({ ...archiveDefaultConfig, mode: "package" }, ["approval-card"], catalog, blockCatalog);
  const example = component.imports.join("\n") + `

export function ReviewAction({ onApprove }: { onApprove: () => void }) {
  return <MCPCNProvider>
    <ApprovalCard
      title="Send this email?"
      riskLevel="medium"
      actionLabel="Send"
      changes={[{ label: "Recipients", after: "43 customers" }]}
      onAction={({ type }) => { if (type === "approve") onApprove(); }}
    />
  </MCPCNProvider>;
}`;
  return <main className="docs-layout">
    <aside className="sidebar" aria-label="Documentation sections"><strong>Getting started</strong>{sections.map(([id, label]) => <a href={`#${id}`} key={id}>{label}</a>)}</aside>
    <article className="prose" style={{ minWidth: 0 }}>
      <span className="eyebrow">Documentation</span>
      <h1>Build a reviewable agent workflow</h1>
      <p>MCPCN connects structured MCP tool results to React review surfaces. Your application handles user actions and validates every operation on the server.</p>
      <h2 id="contract">The contract</h2>
      <pre className="code">{"Tool structuredContent\n  → validate the payload and component schema\n  → render a typed component or a safe error\n  → user reviews and acts\n  → your application calls a permitted tool\n  → render the updated result"}</pre>
      <h2 id="install">Install into an existing React app</h2>
      <p>Install the matching GitHub release archives, then use the local executable. The registry URL below is pinned to that release's source.</p>
      <p>The installer prepares TypeScript files and configuration. It does not create a framework app, install dependencies automatically or establish a host connection.</p>
      <h3>Own the source</h3>
      <p>Copy components, schemas, runtime and shared styles into your app. Workflow blocks include their component dependencies. The release setup below also installs the required SDK/schema dependencies.</p>
      <section aria-label="Source installation"><ArchiveSetup plan={copy} /></section>
      <h3>Use package imports</h3>
      <p>Keep component imports in the MCPCN packages and generate your local provider. The first command installs all matching release packages; your selection determines the local wrappers and import instructions.</p>
      <section aria-label="Package installation"><ArchiveSetup plan={packaged} /></section>
      <p><Link href="/create">Configure a different manager, theme, host or selection.</Link> Both modes require an existing React application. JavaScript output is not supported by this source installer.</p>
      <h2 id="provider">Mount your provider</h2>
      <p>The generated <code>{copy.config.componentsDir}/provider.tsx</code> applies your chosen theme and creates the selected adapter on the client. Mount <code>MCPCNProvider</code> around your MCP App UI. Import paths in these examples are relative to your project root; adjust them to the location of your integration file.</p>
      <pre className="code">{copy.providerSource}</pre>
      <p>Copy mode includes local styles. Package mode imports <code>@mcpcn/react/styles.css</code> and <code>@mcpcn/themes/default.css</code>. The provider sets <code>data-mcpcn-theme</code> for Default, Graphite or Violet.</p>
      <h2 id="first-component">Your first component</h2>
      <p>For this example, add <code>approval-card</code> using the configurator. Connect <code>onApprove</code> to your own authorized action, and provide its pending/error handling.</p>
      <pre className="code">{example}</pre>
      <h2 id="host-compatibility">Host compatibility</h2>
      <p>Auto detect uses the existing runtime detection: OpenAI compatibility when that host surface exists, the official MCP Apps adapter inside an iframe, and a local mock otherwise. Standard MCP Apps explicitly selects <code>OfficialMCPAdapter</code>; OpenAI compatibility explicitly selects <code>OpenAIAdapter</code>. Configuration does not grant host capabilities or server permissions.</p>
      <p>The configurator previews are authored local examples. Their actions never execute host tools or install files, and they are not a live host acceptance check.</p>
      <h2 id="security-boundaries">Security boundaries</h2>
      <p>A UI approval is not server authorization. Keep raw personal data in private UI or server state, send only deliberate context to the model, and validate every app-initiated tool call on the server. Treat tools, membership and destructive operations as application-owned permissions.</p>
      <h2 id="registry">Registry</h2>
      <p>The source registry contains component and workflow-block entries with their local source closure. Choose a registry you trust, review installed files, and retain the lockfile to detect changes before updating. The CLI reports required dependencies instead of running a package manager for you.</p>
      <h2 id="server-helpers">Server helpers</h2>
      <p>The separate <code>@mcpcn/server</code> helpers support MCP tool/resource registration. Client installation does not create a server, authorization policy or production endpoint. Connect your reviewed UI to an app-visible tool in your own server integration.</p>
      <p><Link href="/docs/server">Build a validated MCP server integration</Link> with complete result schemas, request context, explicit private metadata and standard resource/CSP declarations.</p>
      <p><Link href="/docs/reference-workflows">Run five persistent reference workflows</Link> with actual MCP tools, reviewed changes and a private local audit.</p>
      <Link className="button" href="/components">Explore the catalog</Link>
    </article>
  </main>;
}

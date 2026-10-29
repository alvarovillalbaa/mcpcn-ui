"use client";

import { useId, useMemo, useState } from "react";
import { blockCatalog, catalog, findCatalogItem } from "@mcpcn/registry/catalog";
import { buildInstallationPlan, defaultConfig, type InstallConfig } from "@mcpcn/registry/installation";
import { ApprovalDemo, AuditDemo, FormDemo, ProgressDemo, ReviewDemo } from "./demos";

const initialSelection = ["approval-card", "tool-progress-timeline", "schema-form", "entity-review-table", "audit-trail"];
const categoryLabels: Record<string, string> = {
  primitive: "Primitives", approval: "Approvals", "tool-execution": "Tool execution",
  "data-review": "Data review", forms: "Forms", decision: "Decisions", trust: "Trust and evidence", "host-state": "Host state",
};
const previews = [
  { slug: "approval-card", label: "Approval card", render: () => <ApprovalDemo /> },
  { slug: "tool-progress-timeline", label: "Tool progress", render: () => <ProgressDemo /> },
  { slug: "schema-form", label: "Schema form", render: () => <FormDemo /> },
  { slug: "entity-review-table", label: "Entity review", render: () => <ReviewDemo /> },
  { slug: "audit-trail", label: "Audit trail", render: () => <AuditDemo /> },
];

export type ConfiguratorProps = { initialConfig?: Partial<InstallConfig>; initialItems?: string[] };

export function Configurator({ initialConfig, initialItems = initialSelection }: ConfiguratorProps = {}) {
  const id = useId();
  const [config, setConfig] = useState<InstallConfig>(() => ({ ...defaultConfig, ...initialConfig }));
  const [items, setItems] = useState(() => initialItems.map(name => findCatalogItem(name)?.slug ?? name));
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState("approval-card");
  const result = useMemo(() => {
    if (!items.length) return { plan: null, error: null };
    try {
      return { plan: buildInstallationPlan(config, items, catalog, blockCatalog), error: null };
    } catch {
      return { plan: null, error: "Check the component directory, registry URL and selected items before preparing your installation." };
    }
  }, [config, items]);
  const plan = result.plan;
  const filter = query.trim().toLowerCase();
  const visibleComponents = catalog.filter(item => `${item.name} ${item.slug} ${item.category} ${item.description}`.toLowerCase().includes(filter));
  const visibleBlocks = blockCatalog.filter(item => `${item.name} ${item.description} ${item.components.join(" ")}`.toLowerCase().includes(filter));
  const activePreview = previews.find(item => item.slug === preview) ?? previews[0]!;

  function update<Key extends keyof InstallConfig>(key: Key, value: InstallConfig[Key]) {
    setConfig(current => ({ ...current, [key]: value }));
  }
  function toggle(slug: string) {
    setItems(current => current.includes(slug) ? current.filter(item => item !== slug) : [...current, slug]);
  }

  return <div className="configurator" style={{ alignItems: "start" }}>
    <aside className="config-panel" aria-label="Installation choices">
      <span className="eyebrow">Existing React app</span>
      <label htmlFor={`${id}-manager`}>Package manager</label>
      <select id={`${id}-manager`} value={config.packageManager} onChange={event => update("packageManager", event.target.value as InstallConfig["packageManager"])}>
        <option value="pnpm">pnpm</option><option value="npm">npm / npx</option><option value="bun">Bun</option>
      </select>
      <label htmlFor={`${id}-mode`}>Installation mode</label>
      <select id={`${id}-mode`} value={config.mode} onChange={event => update("mode", event.target.value as InstallConfig["mode"])}>
        <option value="copy">Copy source</option><option value="package">Package imports</option>
      </select>
      <p className="mcpcn-hint">{config.mode === "copy" ? "Own and edit the installed component source." : "Import components from packages; keep your provider and workflow blocks in your app."}</p>
      <label htmlFor={`${id}-style`}>Theme</label>
      <select id={`${id}-style`} value={config.style} onChange={event => update("style", event.target.value as InstallConfig["style"])}>
        <option value="default">Default</option><option value="graphite">Graphite</option><option value="violet">Violet</option>
      </select>
      <label htmlFor={`${id}-host`}>Host adapter</label>
      <select id={`${id}-host`} value={config.host} onChange={event => update("host", event.target.value as InstallConfig["host"])}>
        <option value="auto">Auto detect</option><option value="standard-mcp">Standard MCP Apps</option><option value="openai">OpenAI compatibility</option>
      </select>
      <details style={{ marginTop: 20 }}>
        <summary>Installation paths</summary>
        <label htmlFor={`${id}-directory`}>Component directory</label>
        <input className="mcpcn mcpcn-input" id={`${id}-directory`} value={config.componentsDir} onChange={event => update("componentsDir", event.target.value)} spellCheck={false} autoComplete="off" />
        <label htmlFor={`${id}-registry`}>Registry URL</label>
        <input className="mcpcn mcpcn-input" id={`${id}-registry`} type="url" value={config.registry} onChange={event => update("registry", event.target.value)} spellCheck={false} autoComplete="off" />
        <p className="mcpcn-hint">Generated files use TypeScript. Review the commands before running them in your project.</p>
      </details>
      <label htmlFor={`${id}-search`}>Find components and blocks</label>
      <input className="mcpcn mcpcn-input" id={`${id}-search`} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search the catalog" maxLength={120} />
      <p className="mcpcn-hint" aria-live="polite">{items.length} selected. {visibleComponents.length + visibleBlocks.length} matching choices.</p>
      <div style={{ maxHeight: "32rem", overflowY: "auto", paddingRight: 8 }}>
        {Object.keys(categoryLabels).map(category => {
          const choices = visibleComponents.filter(item => item.category === category);
          if (!choices.length) return null;
          return <fieldset key={category} style={{ border: 0, padding: 0, margin: "16px 0" }}>
            <legend><strong>{categoryLabels[category]}</strong></legend>
            {choices.map(item => <label className="check" key={item.slug}>
              <input name="install-item" type="checkbox" value={item.slug} checked={items.includes(item.slug)} onChange={() => toggle(item.slug)} />
              <span>{item.name}<small className="mcpcn-hint" style={{ display: "block", fontWeight: 400 }}>{item.description}</small></span>
            </label>)}
          </fieldset>;
        })}
        {visibleBlocks.length > 0 && <fieldset style={{ border: 0, padding: 0, margin: "16px 0" }}>
          <legend><strong>Workflow blocks</strong></legend>
          {visibleBlocks.map(item => <label className="check" key={item.name}>
            <input name="install-item" type="checkbox" value={item.name} checked={items.includes(item.name)} onChange={() => toggle(item.name)} />
            <span>{item.name}<small className="mcpcn-hint" style={{ display: "block", fontWeight: 400 }}>{item.description}</small></span>
          </label>)}
        </fieldset>}
        {!visibleComponents.length && !visibleBlocks.length && <p role="status">No matching components or blocks. Your selection is preserved.</p>}
      </div>
    </aside>
    <div style={{ minWidth: 0 }}>
      <label className="mcpcn-label" htmlFor={`${id}-preview`}>Local preview example</label>
      <select className="mcpcn mcpcn-input" id={`${id}-preview`} value={preview} onChange={event => setPreview(event.target.value)} style={{ maxWidth: 320, margin: "8px 0 16px" }}>
        {previews.map(item => <option value={item.slug} key={item.slug}>{item.label}</option>)}
      </select>
      <div className="preview-shell" data-mcpcn-theme={config.style} key={`${config.style}-${preview}`}>{activePreview.render()}</div>
      <p className="mcpcn-hint">An authored, local example for comparing styles. Preview actions do not call a host or install anything.</p>
      {!items.length && <p role="status">Choose at least one component or workflow block to prepare an installation.</p>}
      {result.error && <p role="alert">{result.error}</p>}
      {plan && <section aria-label="Prepared installation">
        <h2 style={{ fontSize: 28, marginTop: 32 }}>Your installation</h2>
        <p role="status"><strong>Package release pending.</strong> The npm packages and executable are not published yet. Review these prepared commands for the forthcoming release.</p>
        <p>{plan.selected.length} selected items; {plan.itemNames.length} items including shared dependencies.</p>
        <ol style={{ paddingLeft: 24 }}>
          <li><h3>Initialize your configuration</h3><pre className="code">{plan.initCommand}</pre></li>
          <li><h3>Install selected items</h3><pre className="code">{plan.addCommand}</pre></li>
          <li><h3>Install consumer dependencies</h3><pre className="code">{plan.dependencyCommand}</pre><p className="mcpcn-hint">The CLI writes files and reports this command. Dependency installation is your explicit next step.</p></li>
        </ol>
        <h3>Mount your provider</h3>
        <p><code>{plan.config.componentsDir}/provider.tsx</code> uses your selected host and theme. Mount its <code>MCPCNProvider</code> around the parts of your app that use MCPCN.</p>
        <pre className="code">{plan.imports.join("\n")}</pre>
        <pre className="code">{"<MCPCNProvider>\n  {/* Your selected components and workflow blocks */}\n</MCPCNProvider>"}</pre>
        <details><summary>Review the generated provider</summary><pre className="code">{plan.providerSource}</pre></details>
        <details style={{ marginTop: 16 }}><summary>Review mcpcn.json</summary><pre className="code">{JSON.stringify(plan.config, null, 2)}</pre></details>
        <p className="mcpcn-hint">Commands target an existing React app. This local preview does not check a live host connection.</p>
      </section>}
    </div>
  </div>;
}

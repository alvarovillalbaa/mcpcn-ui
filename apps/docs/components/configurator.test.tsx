// Authored frontend plan/SSR cases. UNRUN; no browser, installation or host calls.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { blockCatalog, catalog } from "@mcpcn/registry/catalog";
import { buildInstallationPlan, configSchema, defaultConfig, resolveInstallConfig, type InstallConfig } from "@mcpcn/registry/installation";
import { Configurator } from "./configurator";

const plan = (config: Partial<InstallConfig> = {}, names = ["approval-card"]) => buildInstallationPlan({ ...defaultConfig, ...config }, names, catalog, blockCatalog);

describe("installation configurator source", () => {
  it("renders all component and workflow choices with five explicit initial selections", () => {
    const html = renderToStaticMarkup(<Configurator />);
    expect((html.match(/name="install-item"/g) ?? []).length).toBe(catalog.length + blockCatalog.length);
    expect((html.match(/<input\b(?=[^>]*name="install-item")(?=[^>]*checked="")[^>]*>/g) ?? []).length).toBe(5);
    for (const item of catalog) expect(html).toContain(`value="${item.slug}"`);
    for (const block of blockCatalog) expect(html).toContain(`value="${block.name}"`);
    expect(html).toContain("Find components and blocks");
    expect(html).toContain("Workflow blocks");
    expect(html).toContain("Package release pending.");
  });

  it("renders nondefault manager mode host and theme from the same prepared plan", () => {
    const html = renderToStaticMarkup(<Configurator initialConfig={{ packageManager: "npm", mode: "package", host: "openai", style: "graphite" }} initialItems={["approval-card"]} />);
    expect(html).toContain("--manager=npm");
    expect(html).toContain("--mode=package");
    expect(html).toContain("--host=openai");
    expect(html).toContain('data-mcpcn-theme="graphite"');
    expect(html).toContain("OpenAIAdapter");
    expect(html).toContain("npm install");
    expect(html).toContain("Preview actions do not call a host or install anything.");
  });

  it("renders an empty selection as a prompt without a dangling add command or provider", () => {
    const html = renderToStaticMarkup(<Configurator initialItems={[]} />);
    expect(html).toContain("Choose at least one component or workflow block");
    expect(html).not.toContain('aria-label="Prepared installation"');
    expect(html).not.toContain("mcpcn add ");
    expect(html).not.toContain("Review the generated provider");
  });

  it("retains invalid editable configuration while withholding commands and exposing finite guidance", () => {
    const html = renderToStaticMarkup(<Configurator initialConfig={{ componentsDir: "../keep-my-draft" }} initialItems={["approval-card"]} />);
    expect(html).toContain('value="../keep-my-draft"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Check the component directory, registry URL and selected items");
    expect(html).not.toContain('aria-label="Prepared installation"');
    expect(html).toContain('value="approval-card"');
  });

  it("prepares npm copy commands with every selected installation option", () => {
    const result = plan({ packageManager: "npm", mode: "copy", host: "standard-mcp", style: "violet", componentsDir: "src/ui/agents" });
    expect(result.initCommand).toMatch(/^npx mcpcn init /);
    for (const flag of ["--manager=npm", "--mode=copy", "--host=standard-mcp", "--style=violet", "--components-dir=src/ui/agents", `--registry=${defaultConfig.registry}`]) expect(result.initCommand).toContain(flag);
    expect(result.addCommand).toBe("npx mcpcn add approval-card");
    expect(result.dependencyCommand).toMatch(/^npm install /);
    expect(result.dependencyCommand).toContain("zod");
    expect(result.dependencyCommand).not.toContain("@mcpcn/react");
  });

  it("prepares bun package imports and dependencies without invoking another manager", () => {
    const result = plan({ packageManager: "bun", mode: "package" });
    expect(result.initCommand).toMatch(/^bunx mcpcn init /);
    expect(result.addCommand).toBe("bunx mcpcn add approval-card");
    expect(result.dependencyCommand).toMatch(/^bun add /);
    expect(result.dependencyCommand).toContain("@mcpcn/themes");
    expect(result.imports.some(source => source.includes('from "@mcpcn/react"'))).toBe(true);
    expect(result.providerSource).toContain('import "@mcpcn/react/styles.css"');
    expect(result.providerSource).toContain('import "@mcpcn/themes/default.css"');
  });

  it("selects each existing adapter factory in a client effect without connecting the preview", () => {
    for (const [host, factory] of [["auto", "detectAdapter()"], ["standard-mcp", "new OfficialMCPAdapter()"], ["openai", "new OpenAIAdapter()"]] as const) {
      const source = plan({ host }).providerSource;
      expect(source).toContain('"use client"');
      expect(source).toContain(`setAdapter(${factory})`);
      expect(source).toContain("useEffect(() =>");
      expect(source).toContain("<AgentAppProvider adapter={adapter}>");
    }
  });

  it("keeps all three theme choices consistent between preview attributes and generated provider", () => {
    for (const style of ["default", "graphite", "violet"] as const) {
      const result = plan({ style });
      expect(result.providerSource).toContain(`data-mcpcn-theme="${style}"`);
      const html = renderToStaticMarkup(<Configurator initialConfig={{ style }} initialItems={["approval-card"]} />);
      expect(html).toContain(`data-mcpcn-theme="${style}"`);
      expect(html).toContain(`--style=${style}`);
    }
  });

  it("preserves explicit block and component choices while deduplicating their dependency closure", () => {
    const result = plan({}, ["review-before-action", "ApprovalCard"]);
    expect(result.selected.map(item => [item.slug, item.kind])).toEqual([["review-before-action", "block"], ["approval-card", "component"]]);
    expect(new Set(result.itemNames).size).toBe(result.itemNames.length);
    for (const dependency of ["approval-card", "diff-viewer", "audit-trail", "button", "card", "badge"]) expect(result.itemNames).toContain(dependency);
    expect(result.itemNames.indexOf("approval-card")).toBeLessThan(result.itemNames.indexOf("review-before-action"));
    expect(result.addCommand).toBe("pnpm dlx mcpcn add review-before-action approval-card");
  });

  it("uses configured local import paths for copied blocks components and provider", () => {
    const result = plan({ componentsDir: "src/ui/agents" }, ["review-before-action", "schema-form"]);
    expect(result.imports).toContain('import { MCPCNProvider } from "./src/ui/agents/provider";');
    expect(result.imports).toContain('import { ReviewBeforeAction } from "./src/ui/agents/blocks/review-before-action";');
    expect(result.imports).toContain('import { SchemaForm } from "./src/ui/agents/schema-form";');
    expect(result.providerSource).toContain('from "./_mcpcn/runtime"');
    expect(result.providerSource).not.toContain('from "@mcpcn/runtime"');
  });

  it("rejects unsupported configuration unknown selections and duplicate aliases before preparing commands", () => {
    for (const config of [{ typescript: false }, { style: "unavailable" }, { host: "other" }, { componentsDir: "../outside" }, { registry: "https://user:secret@example.test/r" }]) {
      expect(() => buildInstallationPlan({ ...defaultConfig, ...config }, ["approval-card"], catalog, blockCatalog)).toThrow();
    }
    expect(() => plan({}, ["unknown-item"])).toThrow();
    expect(() => plan({}, ["approval-card", "ApprovalCard"])).toThrow();
    expect(() => plan({}, [])).toThrow();
  });

  it("roundtrips the exact generated schema fields including schema URL manager and TypeScript restriction", () => {
    const result = plan({ packageManager: "npm", style: "violet" });
    const decoded = resolveInstallConfig(JSON.parse(JSON.stringify(result.config)));
    expect(decoded).toEqual(result.config);
    expect(decoded).not.toBe(result.config);
    expect(configSchema.properties.$schema.const).toBe(defaultConfig.$schema);
    expect(configSchema.properties.typescript.const).toBe(true);
    expect(new Set(configSchema.required)).toEqual(new Set(Object.keys(defaultConfig)));
    expect(Object.keys(configSchema.properties).sort()).toEqual(Object.keys(defaultConfig).sort());
  });
});

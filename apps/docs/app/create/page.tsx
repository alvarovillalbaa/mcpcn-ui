import { Configurator } from "../../components/configurator";

export const metadata = { title: "Create installation" };

export default function Create() {
  return <main>
    <span className="eyebrow">Installation configurator</span>
    <h1>Configure MCPCN for your app.</h1>
    <p className="lede">Choose source ownership, theme, host adapter and workflow surfaces. Review the matching commands, provider and dependencies before installing in your existing React app.</p>
    <p>This prepares a TypeScript integration, with components and workflow blocks from the current catalog. It does not scaffold a new framework project.</p>
    <Configurator />
  </main>;
}

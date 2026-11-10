// Browser fixture uses the playground's declared React/runtime dependencies.
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { AgentAppProvider, OfficialMCPAdapter } from "@mcpcn/runtime";
import { BlockApp } from "@mcpcn/react/block-apps";
import { BlockKindSchema } from "@mcpcn/schemas/blocks";
import "@mcpcn/react/styles.css";
import "@mcpcn/themes/default.css";
const block = BlockKindSchema.parse(location.pathname.slice("/app/".length));
function App() {
  const [adapter, setAdapter] = useState<OfficialMCPAdapter | null>(null);
  useEffect(() => { setAdapter(new OfficialMCPAdapter()); }, []);
  return adapter ? <AgentAppProvider adapter={adapter}><BlockApp block={block} /></AgentAppProvider> : <p role="status">Connecting block app…</p>;
}
const element = document.getElementById("root"); if (!element) throw new Error("block_app_root_missing"); createRoot(element).render(<App />);

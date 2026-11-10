// Browser host uses the playground's declared ext-apps/React dependencies.
import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { BlockKindSchema, blockToolNames, type BlockKind } from "@mcpcn/schemas/blocks";

async function invoke(block: BlockKind, name: string, args: Record<string, unknown>) {
  const response = await fetch("/api/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ block, name, args }) });
  if (!response.ok) throw new Error("block_host_request_refused"); return await response.json() as Parameters<AppBridge["sendToolResult"]>[0];
}
function Frame({ block }: { block: BlockKind }) {
  const frame = useRef<HTMLIFrameElement>(null), [status, setStatus] = useState("Connecting");
  useEffect(() => {
    const element = frame.current, target = element?.contentWindow; if (!element || !target) return;
    let live = true, initialized = false;
    const bridge = new AppBridge(null, { name: "Authored block check host", version: "1" }, { serverTools: {} }, { hostContext: {
      theme: "light", displayMode: "inline", availableDisplayModes: ["inline"], containerDimensions: { width: element.clientWidth, maxHeight: 1800 },
    } });
    bridge.oncalltool = async params => { if (!live || !initialized) throw new Error("block_host_closed"); return invoke(block, params.name, params.arguments ?? {}); };
    bridge.oninitialized = () => { initialized = true; void (async () => {
      try { const result = await invoke(block, blockToolNames(block).read, { id: "authored-record" }); if (!live) return;
        await bridge.sendToolInput({ arguments: { id: "authored-record" } }); if (live) await bridge.sendToolResult(result); if (live) setStatus("Ready"); }
      catch { if (live) setStatus("Connection failed"); }
    })(); };
    bridge.onsizechange = params => { if (live && typeof params.height === "number" && Number.isFinite(params.height)) element.style.height = Math.max(800, Math.min(1800, params.height)) + "px"; };
    bridge.onerror = () => { if (live) setStatus("Connection failed"); };
    void bridge.connect(new PostMessageTransport(target, target)).then(() => { if (live) element.src = "/app/" + block; }).catch(() => { if (live) setStatus("Connection failed"); });
    return () => { live = false; bridge.oncalltool = undefined; bridge.oninitialized = undefined; bridge.onsizechange = undefined; bridge.onerror = undefined; void bridge.close().catch(() => undefined); };
  }, [block]);
  return <><p role="status" aria-label="Block host connection">{status}</p><iframe ref={frame} title="Authored MCP block" sandbox="allow-scripts allow-same-origin allow-forms" src="about:blank"
    style={{ width: "100%", minWidth: 0, height: 1200, border: 0, display: "block" }} /></>;
}
function Host() {
  const [block, setBlock] = useState<BlockKind>("review-before-action");
  return <main style={{ maxWidth: 1248, margin: "auto", minWidth: 0, fontFamily: "system-ui" }}><h1>Authored block workflows</h1>
    <p>CI-only trusted local host: actual AppBridge, MCP SDK and disposable SQLite. No external identity, provider or production data.</p>
    <nav aria-label="Workflow blocks" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{BlockKindSchema.options.map(value => <button key={value} aria-pressed={block === value} onClick={() => setBlock(value)}>{value}</button>)}</nav>
    <Frame key={block} block={block} /></main>;
}
const element = document.getElementById("root"); if (!element) throw new Error("block_host_root_missing"); createRoot(element).render(<Host />);

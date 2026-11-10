import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { z } from "zod";
import { WorkflowSchema, toolPrefix, type Workflow } from "./contracts.js";
import "./reference.css";

const SessionSchema = z.object({ workflows: z.array(z.object({ id: WorkflowSchema, title: z.string() })).length(5), sourceMode: z.enum(["authored-checks", "configured-primary-sources"]) });
async function invoke(workflow: Workflow, name: string, args: Record<string, unknown>) {
  const response = await fetch("/api/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workflow, name, args }) });
  if (!response.ok) throw new Error("The local server request was refused.");
  return await response.json() as Parameters<AppBridge["sendToolResult"]>[0];
}
function Frame({ workflow, title }: { workflow: Workflow; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null), [status, setStatus] = useState("Connecting");
  useEffect(() => {
    const element = frame.current, target = element?.contentWindow; if (!element || !target) return;
    let live = true, initialized = false;
    const timer = setTimeout(() => { if (live && !initialized) setStatus("The app did not connect. Reload the workbench before continuing."); }, 10000);
    const bridge = new AppBridge(null, { name: "MCPCN local reference workbench", version: "0.1.0" }, { serverTools: {} }, { hostContext: {
      theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light", displayMode: "inline", availableDisplayModes: ["inline"], containerDimensions: { width: element.clientWidth, maxHeight: 1600 },
    } });
    bridge.oncalltool = async params => { if (!live || !initialized) throw new Error("The review session is closed."); const result = await invoke(workflow, params.name, params.arguments ?? {}); if (!live) throw new Error("The review session changed."); return result; };
    bridge.oninitialized = () => { initialized = true; clearTimeout(timer); void (async () => {
      try { const result = await invoke(workflow, `${toolPrefix(workflow)}_read`, { id: "record-one" }); if (!live) return; await bridge.sendToolInput({ arguments: { id: "record-one" } }); if (!live) return; await bridge.sendToolResult(result); if (live) setStatus("Ready"); }
      catch { if (live) setStatus("The record could not be opened. Switch workflows or reload the workbench."); }
    })(); };
    bridge.onsizechange = params => { if (live && typeof params.height === "number" && Number.isFinite(params.height)) element.style.height = Math.max(720, Math.min(1600, params.height)) + "px"; };
    bridge.onerror = () => { if (live) setStatus("The app connection reported an error. Reload before continuing."); };
    void bridge.connect(new PostMessageTransport(target, target)).then(() => { if (live) element.src = "/app/" + workflow; }).catch(() => { if (live) setStatus("The app connection could not be opened."); });
    return () => { live = false; clearTimeout(timer); bridge.oninitialized = undefined; bridge.oncalltool = undefined; bridge.onsizechange = undefined; bridge.onerror = undefined; void bridge.close().catch(() => undefined); };
  }, [workflow]);
  return <section><p role="status" aria-label="Workbench connection">{status}</p><iframe ref={frame} title={title + " MCP App"} sandbox="allow-scripts allow-same-origin" src="about:blank" /></section>;
}
function Workbench() {
  const [session, setSession] = useState<z.infer<typeof SessionSchema> | null>(null), [selected, setSelected] = useState<Workflow>("hr-candidate-review"), [code, setCode] = useState(""), [error, setError] = useState<string>(), [busy, setBusy] = useState(false);
  const load = async () => { const response = await fetch("/api/session"); if (response.ok) setSession(SessionSchema.parse(await response.json())); };
  useEffect(() => { let live = true; void fetch("/api/session").then(async response => { if (response.ok) { const value = SessionSchema.parse(await response.json()); if (live) setSession(value); } }).catch(() => { if (live) setError("The local workbench could not be reached."); }); return () => { live = false; }; }, []);
  if (!session) return <main className="workbench workbench-login"><h1>Open the reference workspace</h1><p>Enter the per-launch access code printed by your local workbench. Your review records stay in the private workspace you selected.</p>
    <form onSubmit={event => { event.preventDefault(); if (busy) return; setBusy(true); setError(undefined); void (async () => { try { const response = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) }); if (!response.ok) throw new Error("refused"); setCode(""); await load(); } catch { setError("The access code was refused or the local server is unavailable."); } finally { setBusy(false); } })(); }}>
      <label>Workbench access code<input aria-label="Workbench access code" type="password" value={code} maxLength={256} required autoComplete="off" onChange={event => setCode(event.currentTarget.value)} /></label><button disabled={busy}>Open workspace</button></form>{error && <p className="workbench-error" role="alert">{error}</p>}</main>;
  const chosen = session.workflows.find(value => value.id === selected)!;
  return <main className="workbench"><h1>Review. Confirm. Verify.</h1><p className="workbench-notice">Five reference apps use actual MCP tools and a persistent local workspace. Review exact changes before applying them; inspect the saved audit after a reload. No payment, messaging, SSO or AI provider is connected.</p>
    {session.sourceMode === "authored-checks" && <p role="status">Authored check sources: no public research source content is fetched in this check profile.</p>}
    <nav className="workbench-nav" aria-label="Reference workflows">{session.workflows.map(workflow => <button key={workflow.id} aria-pressed={selected === workflow.id} onClick={() => setSelected(workflow.id)}>{workflow.title}</button>)}</nav>
    <Frame key={selected} workflow={selected} title={chosen.title} /></main>;
}
const element = document.getElementById("root"); if (!element) throw new Error("reference_host_root_missing"); createRoot(element).render(<Workbench />);

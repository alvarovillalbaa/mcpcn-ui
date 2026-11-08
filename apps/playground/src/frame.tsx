import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AgentAppProvider, OfficialMCPAdapter, useAgentApp } from "@mcpcn/runtime";
import { InvalidPayload, type ComponentAction } from "@mcpcn/react";
import { PlaygroundComponent } from "./component-preview.js";
import { validateFixture } from "./fixtures.js";
import "@mcpcn/react/styles.css";
import "./frame.css";

function ConnectedApp({ unavailable }: { unavailable(): void }) {
  const app = useAgentApp();
  // Each received result owns its request feedback, including identical data
  // received in a later invocation. Late setters belong to the unmounted view.
  const invocation = useMemo(() => crypto.randomUUID(), [app.structuredContent]);
  return <InvocationView key={invocation} unavailable={unavailable} />;
}
function InvocationView({ unavailable }: { unavailable(): void }) {
  const app = useAgentApp();
  const [action, setAction] = useState<ComponentAction | null>(null), [error, setError] = useState("");
  const [toolResult, setToolResult] = useState<unknown>(null), [notice, setNotice] = useState("");
  const ready = app.capabilities.sendMessage;
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(unavailable, 5000);
    return () => clearTimeout(timer);
  }, [ready, unavailable]);
  const parsed = useMemo(() => validateFixture(app.structuredContent), [app.structuredContent]);
  const slug = parsed.success ? parsed.data.kind.slice("mcpcn/".length) : "";
  const attempt = async (work: () => Promise<void>) => {
    setError(""); setNotice("");
    try { await work(); } catch { setError("The fixture host rejected this request. Inspect the host trace and capabilities."); }
  };
  const onAction = async (next: ComponentAction) => {
    setAction(next);
    if (!["approve", "confirm", "submit"].includes(next.type)) return;
    await attempt(async () => {
      const result = await app.callTool("playground_action", { component: slug, decision: next.type });
      setToolResult(result);
      if (result.isError) setError("The authored fixture tool reported an error.");
    });
  };
  return <main className={`mcpcn frame-app ${app.theme === "dark" ? "dark" : ""}`} data-theme={app.theme ?? "light"} data-display-mode={app.displayMode}>
    <header><span>MCPCN app frame</span><strong role="status">{ready ? "Bridge connected" : "Waiting for host bridge…"}</strong></header>
    <p className="frame-hint">{app.theme ?? "light"} · {app.displayMode} · authored fixtures</p>
    {!ready ? <p>Waiting for the SDK initialization handshake.</p>
      : !app.toolResult ? <p>Use “Invoke tool result” in the host to load a component.</p>
        : app.toolResult.isError ? <p role="alert">The host supplied a tool error result.</p>
          : parsed.success ? <PlaygroundComponent key={JSON.stringify(app.structuredContent)} payload={parsed.data} onAction={onAction} />
            : <InvalidPayload title="Component payload is invalid" issues={parsed.issues} />}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <section aria-label="App requests" className="frame-requests">
      <button disabled={!app.capabilities.callTool || !parsed.success} onClick={() => void attempt(async () => {
        const result = await app.callTool("playground_echo", { component: slug, decision: "inspect" }); setToolResult(result);
        if (result.isError) setError("The authored fixture tool reported an error.");
      })}>Call fixture tool</button>
      <button disabled={!app.capabilities.updateModelContext || !parsed.success} onClick={() => void attempt(async () => {
        await app.updateModelContext({ component: slug, decision: action?.type ?? "inspected" }); setNotice("Review summary shared. UI-only metadata was excluded.");
      })}>Share review summary</button>
      <button disabled={!ready || !parsed.success} onClick={() => void attempt(async () => {
        await app.sendMessage(`Reviewed the ${slug} authored fixture.`); setNotice("Message delivered to the fake chat.");
      })}>Send fixture message</button>
      <button disabled={!ready} onClick={() => void attempt(() => app.requestDisplayMode("fullscreen"))}>Request fullscreen</button>
      <button disabled={!ready} onClick={() => void attempt(() => app.requestDisplayMode("inline"))}>Request inline</button>
    </section>
    <details><summary>App state and capabilities</summary><pre aria-label="App capabilities">{JSON.stringify(app.capabilities, null, 2)}</pre><pre aria-label="Received tool input">{JSON.stringify(app.toolInput ?? null, null, 2)}</pre></details>
    <details><summary>Last component intent</summary><pre aria-label="Last component intent">{JSON.stringify(action, null, 2)}</pre></details>
    <details><summary>Fixture tool response</summary><pre aria-label="Fixture tool response">{JSON.stringify(toolResult, null, 2)}</pre></details>
    <details><summary>UI-only metadata</summary><pre aria-label="UI-only metadata">{JSON.stringify(app.meta ?? null, null, 2)}</pre></details>
  </main>;
}
function FrameApp() {
  const adapter = useMemo(() => new OfficialMCPAdapter(), []), [expired, setExpired] = useState(false);
  const unavailable = useCallback(() => setExpired(true), []);
  return expired ? <main className="frame-app"><h1>Bridge unavailable</h1><p role="status">No host completed initialization. Reconnect from the simulator to start a fresh app frame.</p></main>
    : <AgentAppProvider adapter={adapter}><ConnectedApp unavailable={unavailable} /></AgentAppProvider>;
}
const element = document.getElementById("root");
if (!element) throw new Error("app_frame_root_missing");
const root = createRoot(element);
root.render(<StrictMode><FrameApp /></StrictMode>);
window.addEventListener("pagehide", () => root.unmount(), { once: true });

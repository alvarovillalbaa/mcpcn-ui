import { useEffect, useRef, useState } from "react";
import type { MCPCNPayload } from "@mcpcn/core";
import { makeFixture, playgroundItems, schemaFor } from "./fixtures.js";
import { fixtureResult, parseInput, parseResult } from "./editor.js";
import { createHostSession, type HostSettings, type PlaygroundResult, type TraceEvent } from "./host-session.js";

type Session = ReturnType<typeof createHostSession>;
function initialSelection() {
  const query = new URL(location.href).searchParams.get("component");
  return playgroundItems.find(item => item.slug === query)?.slug ?? "approval-card";
}
function serverSnippet(payload: MCPCNPayload<string, unknown>) {
  const slug = payload.kind.slice(6);
  return `import { registerComponentApp, createStructuredResult } from "@mcpcn/server";\n\n// Supply your MCP server and your app's bundled HTML.\nexport function registerPreview(server: Parameters<typeof registerComponentApp>[0], appHtml: string) {\n  registerComponentApp(server, {\n    name: "review_${slug.replaceAll("-", "_")}",\n    description: "Review authored ${slug} output",\n    component: ${JSON.stringify(slug)},\n    inputSchema: { type: "object", properties: {} },\n    readOnly: true,\n    html: appHtml,\n    handler: () => createStructuredResult(${JSON.stringify(slug)}, ${JSON.stringify(payload.data, null, 2)})\n  });\n}\n`;
}
export function Simulator() {
  const [initial] = useState(initialSelection), [slug, setSlug] = useState(initial);
  const [input, setInput] = useState(() => JSON.stringify({ component: initial }, null, 2));
  const [result, setResult] = useState(() => JSON.stringify(fixtureResult(makeFixture(initial)), null, 2));
  const [settings, setSettings] = useState<HostSettings>({ theme: "light", displayMode: "inline", width: 760, tools: true, context: true, denyExpanded: false, toolOutcome: "success" });
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const [generation, setGeneration] = useState(0), [missing, setMissing] = useState(false);
  const [status, setStatus] = useState("connecting"), [error, setError] = useState("");
  const [invoking, setInvoking] = useState(false), [restarting, setRestarting] = useState(false), [notice, setNotice] = useState("");
  const [context, setContext] = useState("No model context shared."), [chat, setChat] = useState<string[]>([]);
  const [events, setEvents] = useState<Array<TraceEvent & { id: number; at: string }>>([]), sequence = useRef(0);
  const frame = useRef<HTMLIFrameElement>(null), session = useRef<Session | null>(null);
  const invocation = useRef<{ input: Record<string, unknown>; result: PlaygroundResult }>({ input: { component: initial }, result: fixtureResult(makeFixture(initial)) });
  const trace = (event: TraceEvent) => {
    const row = { ...event, message: event.message.slice(0, 240), id: ++sequence.current, at: new Date().toISOString().slice(11, 23) };
    setEvents(current => [...current.slice(-79), row]);
  };
  function change<K extends keyof HostSettings>(key: K, value: HostSettings[K]) { setSettings(current => ({ ...current, [key]: value })); }
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let live = true;
    setError(""); setInvoking(false); setContext("No model context shared."); setChat([]);
    const url = new URL("./frame.html", location.href); url.hash = crypto.randomUUID();
    if (missing) {
      setStatus("disconnected"); element.src = url.href;
      trace({ direction: "session", message: "Host bridge withheld for the missing-bridge scenario" });
      return () => { live = false; };
    }
    const active = createHostSession(element, {
      settings: () => ({ ...settingsRef.current, width: element.clientWidth || settingsRef.current.width }),
      trace: event => { if (live) trace(event); },
      status: value => { if (live) setStatus(value); },
      context: value => { if (live) setContext(value); },
      message: value => { if (live) setChat(current => [...current.slice(-7), value]); },
      mode: value => { if (live) change("displayMode", value); },
    });
    session.current = active;
    // Listen before the app can send ui/initialize from its new document.
    void active.connected.then(() => { if (live) element.src = url.href; }).catch(() => undefined);
    void active.ready.then(async () => { if (live) await active.invoke(invocation.current.input, invocation.current.result); })
      .catch(() => { if (live) setError("The SDK initialization did not complete. Reconnect to start a fresh frame."); });
    return () => { live = false; if (session.current === active) session.current = null; void active.dispose().catch(() => undefined); };
  }, [generation, missing]);
  useEffect(() => { session.current?.updateContext(); }, [settings.theme, settings.displayMode, settings.width]);
  async function restart(update?: Partial<HostSettings>, disconnected = missing) {
    if (restarting) return;
    setRestarting(true); setStatus("closing"); setError(""); setNotice("");
    try { await session.current?.dispose(true); } catch { setError("The old bridge reported a close error; its frame will be replaced."); }
    session.current = null;
    if (update) setSettings(current => ({ ...current, ...update }));
    setMissing(disconnected); setGeneration(current => current + 1); setRestarting(false);
  }
  async function invoke(nextInput?: Record<string, unknown>, nextResult?: PlaygroundResult) {
    const active = session.current;
    if (!active || status !== "ready") { setError("Connect the bridge before invoking a result."); return; }
    setError(""); setNotice(""); setInvoking(true);
    try {
      const value = { input: nextInput ?? parseInput(input), result: nextResult ?? parseResult(result) };
      invocation.current = value; await active.invoke(value.input, value.result);
    } catch (cause) { if (session.current === active) setError(cause instanceof Error ? cause.message : "Fixture invocation failed."); }
    finally { if (session.current === active) setInvoking(false); }
  }
  function select(next: string) {
    const nextInput = { component: next }, nextResult = fixtureResult(makeFixture(next));
    setSlug(next); setInput(JSON.stringify(nextInput, null, 2)); setResult(JSON.stringify(nextResult, null, 2)); setNotice("");
    invocation.current = { input: nextInput, result: nextResult };
    const url = new URL(location.href); url.searchParams.set("component", next); history.replaceState(null, "", url);
    if (status === "ready") void invoke(nextInput, nextResult);
  }
  async function exportFixture() {
    try {
      const exported = { toolInput: parseInput(input), toolResult: parseResult(result) };
      const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2) + "\n"], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `mcpcn-${slug}-fixture.json`;
      document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url); setNotice("Fixture exported.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Fixture export failed."); }
  }
  async function copySnippet() {
    try {
      const parsed = parseResult(result);
      await navigator.clipboard.writeText(serverSnippet(parsed.structuredContent as MCPCNPayload<string, unknown>));
      setNotice("Server registration snippet copied. Supply your server and app HTML.");
    } catch { setError("The snippet could not be copied. Check the payload and clipboard permission."); }
  }
  const item = playgroundItems.find(value => value.slug === slug);
  return <div className="studio">
    <header className="studio-header"><div><strong>MCPCN Playground</strong><span>Official MCP Apps SDK · authored fixture host</span></div><span role="status" aria-label="Host connection">{status}</span></header>
    <aside className="host-controls" aria-label="Fixture host controls">
      <h1>Test the whole interaction.</h1><p className="hint">One real app frame, with explicit host capabilities. Built-in examples only; no external tool or model is connected.</p>
      <label>Component or block<select aria-label="Component or block" value={slug} onChange={event => select(event.currentTarget.value)}>{playgroundItems.map(value => <option key={value.slug} value={value.slug}>{value.name}</option>)}</select></label>
      <p className="hint" aria-label="Implementation kind">{item?.kind}{item?.kind === "generic-alias" ? " — current generic informational implementation" : ""}</p>
      <label>Theme<select value={settings.theme} onChange={event => change("theme", event.currentTarget.value as HostSettings["theme"])}><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <label>Viewport<select value={settings.width} onChange={event => change("width", Number(event.currentTarget.value))}><option value={390}>Compact · 390 px</option><option value={760}>Expanded · 760 px</option></select></label>
      <label>Host display mode<select value={settings.displayMode} onChange={event => change("displayMode", event.currentTarget.value as HostSettings["displayMode"])}><option value="inline">Inline</option><option value="pip">Picture in picture</option><option value="fullscreen">Fullscreen</option></select></label>
      <label className="toggle"><input type="checkbox" checked={settings.tools} disabled={restarting} onChange={event => void restart({ tools: event.currentTarget.checked })} />Allow fixture tool calls</label>
      <label className="toggle"><input type="checkbox" checked={settings.context} disabled={restarting} onChange={event => void restart({ context: event.currentTarget.checked })} />Allow model-context updates</label>
      <label className="toggle"><input type="checkbox" checked={settings.denyExpanded} onChange={event => change("denyExpanded", event.currentTarget.checked)} />Deny app requests for expanded modes</label>
      <label>Fixture tool outcome<select value={settings.toolOutcome} onChange={event => change("toolOutcome", event.currentTarget.value as HostSettings["toolOutcome"])}><option value="success">Success</option><option value="tool-error">Tool error result</option><option value="protocol-error">Host request error</option></select></label>
      <button disabled={status !== "ready" || invoking || restarting} onClick={() => void invoke()}>Invoke tool result</button>
      <button className="secondary" disabled={restarting} onClick={() => void restart(undefined, !missing)}>{missing ? "Reconnect bridge" : "Simulate missing bridge"}</button>
      <button className="secondary" disabled={restarting} onClick={() => void restart()}>Reset app session</button>
      <button className="secondary" disabled={status !== "ready" || invoking} onClick={() => {
        const invalid = { structuredContent: { kind: "mcpcn/approval-card", version: 1, data: { title: 42 } }, content: [] };
        setResult(JSON.stringify(invalid, null, 2)); void invoke({ component: "approval-card" }, invalid);
      }}>Send invalid schema fixture</button>
      <section aria-label="Fake chat"><h2>Fake chat</h2><p className="chat">The agent supplied <b>{slug}</b> for review.</p>{chat.map((message, index) => <p className="chat" key={index}>{message}</p>)}</section>
    </aside>
    <main className="preview-area"><div className="preview-bar"><span>Rendered MCP app iframe</span><span>{settings.displayMode} · {settings.theme}</span></div>
      <div className="frame-viewport" style={{ width: settings.width }}><iframe key={generation} ref={frame} title="Rendered MCP app" className="app-frame" sandbox="allow-scripts allow-same-origin" /></div>
      <p className="hint">This frame runs trusted bundled examples. It does not establish isolation for arbitrary third-party HTML.</p>
      {error && <p role="alert" className="studio-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    </main>
    <section className="editor-area" aria-label="Invocation editors"><h2>Tool input and result</h2><p className="hint">Edits are sent only when invoked. Paste a component envelope or a text-content tool result containing structuredContent.</p>
      <label>Tool input<textarea aria-label="Tool input JSON" value={input} onChange={event => setInput(event.currentTarget.value)} spellCheck={false} /></label>
      <label>Tool result<textarea aria-label="Tool result JSON" value={result} onChange={event => setResult(event.currentTarget.value)} spellCheck={false} /></label>
      <div className="button-row"><button className="secondary" onClick={() => void exportFixture()}>Export fixture</button><button className="secondary" onClick={() => void copySnippet()}>Copy MCP server snippet</button></div>
      <details><summary>Selected component schema</summary><pre>{JSON.stringify(schemaFor(slug), null, 2) ?? "This primitive or block uses the curated playground fixture contract. It has no public component schema."}</pre></details>
    </section>
    <section className="trace-area" aria-label="Observed host messages"><h2>Bridge trace</h2><p className="hint">Observed SDK messages for this frame. The last 80 entries stay in memory; payloads and UI-only metadata are omitted.</p>
      <ol aria-label="Bridge trace">{events.map(event => <li key={event.id}><time>{event.at}</time><b>{event.direction}</b><code>{event.message}</code></li>)}</ol>
      <button className="secondary" onClick={() => setEvents([])}>Clear trace</button><h2>Shared model context</h2><pre aria-label="Shared model context">{context}</pre>
    </section>
  </div>;
}

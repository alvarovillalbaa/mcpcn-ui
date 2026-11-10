"use client";

import { useRef, useState } from "react";

export function InstallCommand({ command, label }: { command: string; label: string }) {
  const [copied, setCopied] = useState<string>();
  const [failed, setFailed] = useState<string>();
  const current = useRef(command);
  const request = useRef(0);
  current.current = command;
  async function copy() {
    const value = command;
    const id = ++request.current;
    try {
      await navigator.clipboard.writeText(value);
      if (current.current === value && request.current === id) { setCopied(value); setFailed(undefined); }
    } catch {
      if (current.current === value && request.current === id) { setFailed(value); setCopied(undefined); }
    }
  }
  return <div style={{ minWidth: 0 }}>
    <button type="button" className="button secondary" aria-label={`Copy ${label}`} onClick={() => { void copy(); }}>Copy command</button>
    <pre className="code" tabIndex={0} style={{ maxWidth: "100%", maxHeight: "24rem", overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }} aria-label={label}><code>{command}</code></pre>
    <p className="mcpcn-hint" role="status">{copied === command ? "Command copied." : failed === command ? "Clipboard unavailable. Select and copy the command above." : "Review and run this in your existing app."}</p>
  </div>;
}

"use client";

import { useState, type ReactNode } from "react";

export function ComponentPreview({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState("light");
  return <div className="mcpcn-stack">
    <label className="mcpcn-label">Preview theme<select aria-label="Preview theme" value={theme} onChange={event => setTheme(event.currentTarget.value)}>
      <option value="light">Light</option><option value="dark">Dark</option>
    </select></label>
    <div data-preview-theme={theme} className={theme === "dark" ? "dark" : undefined}>{children}</div>
  </div>;
}

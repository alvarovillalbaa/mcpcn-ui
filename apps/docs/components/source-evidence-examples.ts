import type { ComponentAction } from "@mcpcn/react";
import type { SourceListData, EvidenceDrawerData } from "@mcpcn/schemas";
import { authoredSourceList, authoredEvidenceDrawer } from "../../playground/src/source-evidence-fixtures";

export const sourceEvidenceExamples: { "source-list": SourceListData; "evidence-drawer": EvidenceDrawerData } = {
  "source-list": { ...authoredSourceList, title: "Review supplied sources" },
  "evidence-drawer": { ...authoredEvidenceDrawer, title: "Inspect supplied evidence" },
};

/** A local producer echo, not source verification or remote persistence. */
export function applySourceListExampleAction(current: SourceListData, action: ComponentAction): SourceListData {
  if (current.state !== "ready" || action.type !== "select-source" || !action.data || typeof action.data !== "object" || Array.isArray(action.data)) return current;
  const scope = action.data as Record<string, unknown>;
  if (scope.listId !== current.id || scope.listRevision !== current.revision) return current;
  const source = current.sources.find(item => item.id === scope.sourceId && item.revision === scope.sourceRevision);
  return source ? { ...current, selectedSourceId: source.id } : current;
}

export function sourceEvidenceExampleCode(slug: string): string | undefined {
  if (slug !== "source-list" && slug !== "evidence-drawer") return undefined;
  const list = slug === "source-list", name = list ? "SourceList" : "EvidenceDrawer";
  const initial = structuredClone(sourceEvidenceExamples[slug]);
  const echo = list ? `
    if (action.type !== "select-source" || !action.data || typeof action.data !== "object" || Array.isArray(action.data)) return;
    const scope = action.data as Record<string, unknown>;
    setData(current => {
      if (current.state !== "ready" || scope.listId !== current.id || scope.listRevision !== current.revision) return current;
      const source = current.sources.find(item => item.id === scope.sourceId && item.revision === scope.sourceRevision);
      return source ? { ...current, selectedSourceId: source.id } : current;
    });` : `
    // The component owns immediate dismissal. View notifications never authorize
    // closing, and their settlement cannot reopen a dismissed drawer.`;
  return `"use client";
import { useState } from "react";
import { ${name}, type ComponentAction } from "@mcpcn/react";
import type { ${name}Data } from "@mcpcn/schemas";

export function Example() {
  const [data${list ? ", setData" : ""}] = useState<${name}Data>(${JSON.stringify(initial, null, 2)});
  const [last, setLast] = useState<ComponentAction | null>(null);
  const handleAction = (action: ComponentAction) => {
    setLast(action);${echo}
  };
  // Supplied claims remain unverified. No fetching, tool call or persistence.
  return <>
    <${name} {...data} onAction={handleAction} />
    <pre aria-label="Last ${list ? "source list" : "evidence"} intent">{JSON.stringify(last, null, 2)}</pre>
  </>;
}`;
}

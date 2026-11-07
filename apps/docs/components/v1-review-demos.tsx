"use client";

import { useState } from "react";
import { ConfirmationPanel, DiffViewer, RiskReviewPanel, SourceEvidencePanel, type ComponentAction } from "@mcpcn/react";

function LastAction({ action }: { action: ComponentAction | null }) {
  return <pre className="code" role="status" aria-label="Last action">{JSON.stringify(action)}</pre>;
}
const initialChanges = [{ id: "status", label: "Document status", before: "Draft", after: "Reviewed", affectedCount: 2 }];

export function ConfirmationPanelDemo() {
  const [action, setAction] = useState<ComponentAction | null>(null);
  const [revision, setRevision] = useState(1);
  return <div className="mcpcn-stack"><ConfirmationPanel reviewId={`confirmation-${revision}`} title="Confirm document changes"
    description="This authored example records an intent without changing a document."
    changes={initialChanges.map(change => ({ ...change, after: revision === 1 ? "Reviewed" : "Archived" }))}
    onAction={next => setAction(next)} />
    <button type="button" className="button secondary" onClick={() => { setRevision(value => value + 1); setAction(null); }}>Change confirmation terms</button>
    <LastAction action={action} /></div>;
}

export function RiskReviewPanelDemo() {
  const [action, setAction] = useState<ComponentAction | null>(null);
  const [revision, setRevision] = useState(1);
  const [acknowledgedRiskIds, setAcknowledgedRiskIds] = useState<string[]>([]);
  return <div className="mcpcn-stack"><RiskReviewPanel reviewId={`risk-${revision}`} title="Review publication risks" affectedCount={12}
    rollback="Restore the previous authored revision."
    risks={[{ id: "visibility", label: "Public visibility", severity: "high", description: revision === 1 ? "Twelve authored records become visible." : "The reviewed visibility terms have changed.", mitigation: "Check the selected records first." }]}
    acknowledgedRiskIds={acknowledgedRiskIds} onAction={next => {
      setAction(next);
      const data = next.data as { riskId?: string; acknowledged?: boolean } | undefined;
      if (next.type === "acknowledge-risk" && data?.riskId === "visibility" && typeof data.acknowledged === "boolean") {
        setAcknowledgedRiskIds(data.acknowledged ? ["visibility"] : []);
      }
    }} />
    <button type="button" className="button secondary" onClick={() => { setRevision(value => value + 1); setAcknowledgedRiskIds([]); setAction(null); }}>Change risk terms</button>
    <LastAction action={action} /></div>;
}

export function DiffViewerDemo() {
  const [action, setAction] = useState<ComponentAction | null>(null);
  const [selectedChangeId, setSelectedChangeId] = useState<string>();
  return <div className="mcpcn-stack"><DiffViewer reviewId="diff-1" title="Compare authored settings" selectedChangeId={selectedChangeId}
    changes={[...initialChanges, { id: "limit", label: "Daily limit", before: 10, after: 20, affectedCount: 0 }]}
    onAction={next => {
      setAction(next);
      const data = next.data as { changeId?: string } | undefined;
      if (next.type === "select-change" && (data?.changeId === "status" || data?.changeId === "limit")) setSelectedChangeId(data.changeId);
    }} /><LastAction action={action} /></div>;
}

export function SourceEvidencePanelDemo() {
  const [action, setAction] = useState<ComponentAction | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string>();
  return <div className="mcpcn-stack"><SourceEvidencePanel reviewId="evidence-1" title="Inspect authored evidence" selectedSourceId={selectedSourceId}
    sources={[{ id: "policy", label: "Authored policy", url: "https://example.com/policy", excerpt: "Review each proposed change before acting.", supports: ["Human review precedes publication."] },
      { id: "notes", label: "Authored review notes", excerpt: "Twelve sample records were reviewed.", supports: ["The affected count is twelve."] }]}
    onAction={next => {
      setAction(next);
      const data = next.data as { sourceId?: string } | undefined;
      if (next.type === "select-source" && (data?.sourceId === "policy" || data?.sourceId === "notes")) setSelectedSourceId(data.sourceId);
    }} /><LastAction action={action} /></div>;
}

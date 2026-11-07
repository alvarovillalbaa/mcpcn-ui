"use client";

import { useState } from "react";
import {
  ConfirmationPanelSchema, DiffViewerSchema, RiskReviewPanelSchema, SourceEvidencePanelSchema,
  type ConfirmationPanelData, type DiffViewerData, type RiskReviewPanelData, type SourceEvidencePanelData,
} from "@mcpcn/schemas";
import { Badge, Button, Card, InvalidPayload } from "./primitives.js";
import type { ComponentProps } from "./component-types.js";
import { Feedback, revisionKey, useComponentAction } from "./component-helpers.js";

type ParsedConfirmation = ReturnType<typeof ConfirmationPanelSchema.parse>;
type ParsedRisk = ReturnType<typeof RiskReviewPanelSchema.parse>;
type ParsedDiff = ReturnType<typeof DiffViewerSchema.parse>;
type ParsedEvidence = ReturnType<typeof SourceEvidencePanelSchema.parse>;
type Change = ParsedDiff["changes"][number];

function valueText(value: Change["before"]) {
  return value === undefined ? "Not supplied" : value === null ? "None" : String(value);
}
function ChangeTable({ changes, selectedId, onSelect, busy }: {
  changes: Change[]; selectedId?: string; onSelect?: (id: string) => void; busy?: boolean;
}) {
  return <div className="mcpcn-table-wrap"><table className="mcpcn-table">
    <caption>Before and after changes</caption>
    <thead><tr><th scope="col">Field</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Impact</th>{onSelect && <th scope="col">Selection</th>}</tr></thead>
    <tbody>{changes.map(change => <tr key={change.id} aria-selected={onSelect ? selectedId === change.id : undefined}>
      <th scope="row">{change.label}</th><td>{valueText(change.before)}</td><td>{valueText(change.after)}</td>
      <td>{change.affectedCount === undefined ? "Not supplied" : `${change.affectedCount} affected`}{change.confidence !== undefined && <span className="mcpcn-hint"> · {Math.round(change.confidence * 100)}% confidence</span>}</td>
      {onSelect && <td><Button type="button" data-variant="secondary" aria-pressed={selectedId === change.id} aria-label={`Select change: ${change.label}`} disabled={busy} onClick={() => onSelect(change.id)}>Select</Button></td>}
    </tr>)}</tbody>
  </table></div>;
}

export function ConfirmationPanel(props: ComponentProps<ConfirmationPanelData>) {
  const parsed = ConfirmationPanelSchema.safeParse(props);
  if (!parsed.success) return <InvalidPayload title="Confirmation data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  return <ConfirmationView key={revisionKey(parsed.data)} {...props} data={parsed.data} />;
}
function ConfirmationView({ data, ...props }: ComponentProps<ConfirmationPanelData> & { data: ParsedConfirmation }) {
  const [consent, setConsent] = useState(false);
  const action = useComponentAction(props.onAction, props.busy);
  const blocked = action.busy || !props.onAction || !data.changes.length || (data.requiresExplicitConsent && !consent);
  return <section className="mcpcn" aria-label={data.title} aria-busy={action.busy}><Card className={props.className}>
    <header className="mcpcn-header"><h3 className="mcpcn-title">{data.title}</h3>{data.description && <p className="mcpcn-description">{data.description}</p>}</header>
    <div className="mcpcn-body mcpcn-stack">{data.changes.length ? <ChangeTable changes={data.changes} /> : <p role="status">No changes to confirm.</p>}
      {data.requiresExplicitConsent && data.changes.length > 0 && <label className="mcpcn-row"><input type="checkbox" checked={consent} disabled={action.busy || !props.onAction} onChange={event => { if (!action.busy) setConsent(event.currentTarget.checked); }} />{data.consentLabel}</label>}
    </div>
    <footer className="mcpcn-footer mcpcn-row"><Button type="button" data-variant="secondary" disabled={action.busy || !props.onAction} onClick={() => action.send({ type: "cancel", data: { reviewId: data.reviewId } })}>{data.cancelLabel}</Button>
      <Button type="button" disabled={blocked} onClick={() => { if (!blocked) action.send({ type: "confirm", data: { reviewId: data.reviewId, changeIds: data.changes.map(change => change.id) } }); }}>{data.confirmLabel}</Button></footer>
    <Feedback busy={action.busy} error={props.error || action.error} />
  </Card></section>;
}

export function RiskReviewPanel(props: ComponentProps<RiskReviewPanelData>) {
  const parsed = RiskReviewPanelSchema.safeParse(props);
  if (!parsed.success) return <InvalidPayload title="Risk review data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  const { acknowledgedRiskIds: _acknowledgements, ...terms } = parsed.data;
  return <RiskView key={revisionKey(terms)} {...props} data={parsed.data} />;
}
function RiskView({ data, ...props }: ComponentProps<RiskReviewPanelData> & { data: ParsedRisk }) {
  const [consent, setConsent] = useState(false);
  const action = useComponentAction(props.onAction, props.busy);
  const allAcknowledged = data.risks.length > 0 && data.risks.every(risk => data.acknowledgedRiskIds.includes(risk.id));
  return <section className="mcpcn" aria-label={data.title} aria-busy={action.busy}><Card className={props.className}>
    <header className="mcpcn-header"><h3 className="mcpcn-title">{data.title}</h3>{data.description && <p className="mcpcn-description">{data.description}</p>}</header>
    <div className="mcpcn-body mcpcn-stack">{data.affectedCount !== undefined && <p>{data.affectedCount} affected records</p>}{data.rollback && <p>Rollback: {data.rollback}</p>}
      {data.risks.length ? <ul aria-label="Risks to acknowledge" className="mcpcn-stack">{data.risks.map(risk => <li key={risk.id}>
        <div className="mcpcn-row"><strong>{risk.label}</strong><Badge risk={risk.severity}>{risk.severity} risk</Badge></div>
        {risk.description && <p>{risk.description}</p>}{risk.mitigation && <p>Mitigation: {risk.mitigation}</p>}
        <label className="mcpcn-row"><input type="checkbox" checked={data.acknowledgedRiskIds.includes(risk.id)} disabled={action.busy || !props.onAction}
          onChange={event => { if (!action.busy) action.send({ type: "acknowledge-risk", data: { reviewId: data.reviewId, riskId: risk.id, acknowledged: event.currentTarget.checked } }); }} />I reviewed {risk.label}</label>
      </li>)}</ul> : <p role="status">No risks supplied. Risk acceptance is unavailable.</p>}
      {data.risks.length > 0 && <label className="mcpcn-row"><input type="checkbox" checked={consent} disabled={action.busy || !props.onAction} onChange={event => { if (!action.busy) setConsent(event.currentTarget.checked); }} />I reviewed the current risk terms.</label>}
    </div>
    <footer className="mcpcn-footer mcpcn-row"><Button type="button" data-variant="secondary" disabled={action.busy || !props.onAction} onClick={() => action.send({ type: "cancel", data: { reviewId: data.reviewId } })}>{data.cancelLabel}</Button>
      <Button type="button" disabled={action.busy || !props.onAction || !allAcknowledged || !consent} onClick={() => { if (allAcknowledged && consent && !action.busy) action.send({ type: "accept-risks", data: { reviewId: data.reviewId, riskIds: data.risks.map(risk => risk.id) } }); }}>{data.acceptLabel}</Button></footer>
    <Feedback busy={action.busy} error={props.error || action.error} />
  </Card></section>;
}

export function DiffViewer(props: ComponentProps<DiffViewerData>) {
  const parsed = DiffViewerSchema.safeParse(props);
  if (!parsed.success) return <InvalidPayload title="Change comparison data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  const { selectedChangeId: _selection, ...terms } = parsed.data;
  return <DiffView key={revisionKey(terms)} {...props} data={parsed.data} />;
}
function DiffView({ data, ...props }: ComponentProps<DiffViewerData> & { data: ParsedDiff }) {
  const action = useComponentAction(props.onAction, props.busy);
  return <section className="mcpcn" aria-label={data.title} aria-busy={action.busy}><Card className={props.className}>
    <header className="mcpcn-header"><h3 className="mcpcn-title">{data.title}</h3>{data.description && <p className="mcpcn-description">{data.description}</p>}</header>
    <div className="mcpcn-body">{data.changes.length ? <ChangeTable changes={data.changes} selectedId={data.selectedChangeId} busy={action.busy}
      onSelect={props.onAction ? changeId => action.send({ type: "select-change", data: { reviewId: data.reviewId, changeId } }) : undefined} /> : <p role="status">No changes to compare.</p>}</div>
    <Feedback busy={action.busy} error={props.error || action.error} />
  </Card></section>;
}

export function SourceEvidencePanel(props: ComponentProps<SourceEvidencePanelData>) {
  const parsed = SourceEvidencePanelSchema.safeParse(props);
  if (!parsed.success) return <InvalidPayload title="Source evidence data is invalid" issues={parsed.error.issues.map(issue => issue.message)} />;
  const { selectedSourceId: _selection, ...terms } = parsed.data;
  return <EvidenceView key={revisionKey(terms)} {...props} data={parsed.data} />;
}
function EvidenceView({ data, ...props }: ComponentProps<SourceEvidencePanelData> & { data: ParsedEvidence }) {
  const action = useComponentAction(props.onAction, props.busy);
  return <section className="mcpcn" aria-label={data.title} aria-busy={action.busy}><Card className={props.className}>
    <header className="mcpcn-header"><h3 className="mcpcn-title">{data.title}</h3>{data.description && <p className="mcpcn-description">{data.description}</p>}</header>
    <div className="mcpcn-body">{data.sources.length ? <ul className="mcpcn-stack" aria-label="Supporting sources">{data.sources.map(source => <li key={source.id}>
      <strong>{source.label}</strong>{source.url && <p><a href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open source: {source.label}</a></p>}
      {source.excerpt && <blockquote style={{ whiteSpace: "pre-wrap" }}>{source.excerpt}</blockquote>}
      {source.supports.length ? <ul aria-label={`Claims supported by ${source.label}`}>{source.supports.map((claim, index) => <li key={index}>{claim}</li>)}</ul> : <p className="mcpcn-hint">No supporting claims supplied.</p>}
      {props.onAction && <Button type="button" data-variant="secondary" aria-pressed={data.selectedSourceId === source.id} aria-label={`Select source: ${source.label}`} disabled={action.busy}
        onClick={() => action.send({ type: "select-source", data: { reviewId: data.reviewId, sourceId: source.id } })}>Select evidence</Button>}
    </li>)}</ul> : <p role="status">No evidence sources supplied.</p>}</div>
    <Feedback busy={action.busy} error={props.error || action.error} />
  </Card></section>;
}

// Authored schema/SSR checks. These do not establish native events or host behavior.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfirmationPanel, DiffViewer, RiskReviewPanel, SourceEvidencePanel } from "./review-components.js";
import { ConfirmationPanelSchema, DiffViewerSchema, RiskReviewPanelSchema, SourceEvidencePanelSchema } from "../../schemas/src/review-schemas.js";

const change = { id: "price", label: "Price", before: 0, after: 12, affectedCount: 0 };
const confirmation = { reviewId: "confirmation-1", title: "Review the authored price", changes: [change] };
const risk = { id: "visibility", label: "Public visibility", severity: "high" as const, description: "Records become visible.", mitigation: "Review the selected records." };
const risks = { reviewId: "risks-1", title: "Review risks", risks: [risk], acknowledgedRiskIds: ["visibility"] };
const diff = { reviewId: "diff-1", title: "Review differences", changes: [change] };
const source = { id: "policy", label: "Authored policy", url: "https://example.com/policy", excerpt: "<script> stays text", supports: ["Review precedes action."] };
const evidence = { reviewId: "evidence-1", title: "Review evidence", sources: [source] };
const disabledButton = (label: string) => new RegExp(`<button\\b[^>]*disabled[^>]*>${label}</button>`);

describe("v1 review family schema and SSR", () => {
  it("ConfirmationPanel renders typed impact and starts behind its current-terms consent gate", () => {
    const onAction = vi.fn();
    const html = renderToStaticMarkup(<ConfirmationPanel {...confirmation} onAction={onAction} />);
    expect(ConfirmationPanelSchema.parse(confirmation).requiresExplicitConsent).toBe(true);
    expect(html).toContain("Before and after changes"); expect(html).toContain("0 affected");
    expect(html).toContain(">0</td>"); expect(html).toContain(">12</td>");
    expect(html).toContain("I reviewed these changes."); expect(html).toMatch(disabledButton("Confirm"));
    expect(onAction).not.toHaveBeenCalled();
  });

  it("ConfirmationPanel rejects duplicate identities, valueless changes and nonfinite input", () => {
    expect(ConfirmationPanelSchema.safeParse({ ...confirmation, changes: [change, change] }).success).toBe(false);
    expect(ConfirmationPanelSchema.safeParse({ ...confirmation, changes: [{ id: "a", label: "A" }] }).success).toBe(false);
    expect(ConfirmationPanelSchema.safeParse({ ...confirmation, changes: [{ ...change, after: Infinity }] }).success).toBe(false);
    expect(renderToStaticMarkup(<ConfirmationPanel {...confirmation} changes={[change, change]} />)).toContain("Confirmation data is invalid");
  });

  it("ConfirmationPanel cannot accept an empty change set even when consent is optional", () => {
    const html = renderToStaticMarkup(<ConfirmationPanel {...confirmation} changes={[]} requiresExplicitConsent={false} onAction={vi.fn()} />);
    expect(html).toContain("No changes to confirm."); expect(html).toMatch(disabledButton("Confirm"));
    expect(html).not.toContain('type="checkbox"');
  });

  it("ConfirmationPanel keeps failed or pending consumer feedback visible without emitting an action", () => {
    const onAction = vi.fn();
    const html = renderToStaticMarkup(<ConfirmationPanel {...confirmation} busy error="Authored confirmation failed" onAction={onAction} />);
    expect(html).toContain('aria-busy="true"'); expect(html).toContain("Authored confirmation failed");
    expect(html).toMatch(disabledButton("Confirm")); expect(html).toMatch(disabledButton("Cancel"));
    expect(onAction).not.toHaveBeenCalled();
  });

  it("ConfirmationPanel changes the consent-view identity when terms change without a new review ID", () => {
    const before = ConfirmationPanel(confirmation).key;
    expect(ConfirmationPanel({ ...confirmation, changes: [{ ...change, after: 13 }] }).key).not.toBe(before);
    expect(ConfirmationPanel({ ...confirmation, consentLabel: "Read the amended terms." }).key).not.toBe(before);
    expect(ConfirmationPanel({ ...confirmation, busy: true }).key).toBe(before);
  });

  it("RiskReviewPanel presents severity, mitigation, zero impact and rollback before acceptance", () => {
    const onAction = vi.fn();
    const html = renderToStaticMarkup(<RiskReviewPanel {...risks} affectedCount={0} rollback="Restore the old version." onAction={onAction} />);
    expect(html).toContain("high risk"); expect(html).toContain("Review the selected records.");
    expect(html).toContain("0 affected records"); expect(html).toContain("Restore the old version.");
    expect(html).toContain("I reviewed the current risk terms."); expect(html).toMatch(disabledButton("Accept reviewed risks"));
    expect(onAction).not.toHaveBeenCalled();
  });

  it("RiskReviewPanel refuses repeated risks and repeated or foreign controlled acknowledgements", () => {
    expect(RiskReviewPanelSchema.safeParse({ ...risks, risks: [risk, risk] }).success).toBe(false);
    expect(RiskReviewPanelSchema.safeParse({ ...risks, acknowledgedRiskIds: ["visibility", "visibility"] }).success).toBe(false);
    expect(RiskReviewPanelSchema.safeParse({ ...risks, acknowledgedRiskIds: ["different"] }).success).toBe(false);
    expect(renderToStaticMarkup(<RiskReviewPanel {...risks} risks={[risk, risk]} />)).toContain("Risk review data is invalid");
  });

  it("RiskReviewPanel makes absent risk evidence explicit rather than treating it as accepted", () => {
    const html = renderToStaticMarkup(<RiskReviewPanel {...risks} risks={[]} acknowledgedRiskIds={[]} onAction={vi.fn()} />);
    expect(html).toContain("No risks supplied. Risk acceptance is unavailable.");
    expect(html).toMatch(disabledButton("Accept reviewed risks"));
  });

  it("RiskReviewPanel disables pending acknowledgements and retains consumer error feedback", () => {
    const html = renderToStaticMarkup(<RiskReviewPanel {...risks} busy error="Authored risk action failed" onAction={vi.fn()} />);
    expect(html).toContain('aria-busy="true"'); expect(html).toContain("Authored risk action failed");
    expect(html).toMatch(/<input\b[^>]*disabled/); expect(html).toMatch(disabledButton("Accept reviewed risks"));
  });

  it("RiskReviewPanel preserves focus identity for acknowledgements but resets consent on changed terms", () => {
    const before = RiskReviewPanel(risks).key;
    expect(RiskReviewPanel({ ...risks, acknowledgedRiskIds: [] }).key).toBe(before);
    expect(RiskReviewPanel({ ...risks, risks: [{ ...risk, severity: "critical" }] }).key).not.toBe(before);
  });

  it("DiffViewer uses a semantic comparison table with scalar and missing-value distinctions", () => {
    const html = renderToStaticMarkup(<DiffViewer {...diff} changes={[change, { id: "flag", label: "Enabled", before: false, after: null }, { id: "new", label: "Added field", after: "New" }]} />);
    expect(html).toContain("<caption>Before and after changes</caption>"); expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"'); expect(html).toContain(">false</td>");
    expect(html).toContain(">None</td>"); expect(html).toContain(">Not supplied</td>");
  });

  it("DiffViewer refuses duplicate changes, object values and selection of a missing change", () => {
    expect(DiffViewerSchema.safeParse({ ...diff, changes: [change, change] }).success).toBe(false);
    expect(DiffViewerSchema.safeParse({ ...diff, changes: [{ ...change, before: { hidden: true } }] }).success).toBe(false);
    expect(DiffViewerSchema.safeParse({ ...diff, selectedChangeId: "missing" }).success).toBe(false);
    expect(renderToStaticMarkup(<DiffViewer {...diff} selectedChangeId="missing" />)).toContain("Change comparison data is invalid");
  });

  it("DiffViewer renders an explicit empty comparison without selection controls", () => {
    const html = renderToStaticMarkup(<DiffViewer {...diff} changes={[]} onAction={vi.fn()} />);
    expect(html).toContain("No changes to compare."); expect(html).not.toContain("Select change:");
  });

  it("DiffViewer exposes controlled selection and disables it during pending consumer work", () => {
    const onAction = vi.fn();
    const html = renderToStaticMarkup(<DiffViewer {...diff} selectedChangeId="price" busy error="Authored comparison failed" onAction={onAction} />);
    expect(html).toContain('aria-selected="true"'); expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Authored comparison failed"); expect(html).toMatch(disabledButton("Select"));
    expect(onAction).not.toHaveBeenCalled();
  });

  it("DiffViewer keeps a stable view for controlled selection and changes it for a new diff", () => {
    const before = DiffViewer(diff).key;
    expect(DiffViewer({ ...diff, selectedChangeId: "price" }).key).toBe(before);
    expect(DiffViewer({ ...diff, changes: [{ ...change, before: 1 }] }).key).not.toBe(before);
  });

  it("SourceEvidencePanel renders escaped evidence, claim attribution and deliberate protected links", () => {
    const html = renderToStaticMarkup(<SourceEvidencePanel {...evidence} />);
    expect(html).toContain("&lt;script&gt; stays text"); expect(html).not.toContain("<script>");
    expect(html).toContain("Review precedes action."); expect(html).toContain('href="https://example.com/policy"');
    expect(html).toContain('rel="noopener noreferrer"'); expect(html).toMatch(/referrerpolicy="no-referrer"/i);
  });

  it("SourceEvidencePanel refuses duplicate sources, foreign selection and unsafe evidence URLs", () => {
    expect(SourceEvidencePanelSchema.safeParse({ ...evidence, sources: [source, source] }).success).toBe(false);
    expect(SourceEvidencePanelSchema.safeParse({ ...evidence, selectedSourceId: "missing" }).success).toBe(false);
    for (const url of ["javascript:alert(1)", "data:text/html,authored", "https://user:pass@example.com", "//example.com", "https://example.com/\npath"]) {
      expect(SourceEvidencePanelSchema.safeParse({ ...evidence, sources: [{ ...source, url }] }).success).toBe(false);
    }
    expect(renderToStaticMarkup(<SourceEvidencePanel {...evidence} sources={[source, source]} />)).toContain("Source evidence data is invalid");
  });

  it("SourceEvidencePanel makes missing evidence explicit without inventing supporting claims", () => {
    const html = renderToStaticMarkup(<SourceEvidencePanel {...evidence} sources={[]} onAction={vi.fn()} />);
    expect(html).toContain("No evidence sources supplied."); expect(html).not.toContain("Select evidence");
    expect(renderToStaticMarkup(<SourceEvidencePanel {...evidence} sources={[{ id: "none", label: "Unattributed source" }]} />)).toContain("No supporting claims supplied.");
  });

  it("SourceEvidencePanel retains current source selection and pending/error feedback", () => {
    const onAction = vi.fn();
    const html = renderToStaticMarkup(<SourceEvidencePanel {...evidence} selectedSourceId="policy" busy error="Authored evidence action failed" onAction={onAction} />);
    expect(html).toContain('aria-pressed="true"'); expect(html).toContain("Authored evidence action failed");
    expect(html).toMatch(disabledButton("Select evidence")); expect(onAction).not.toHaveBeenCalled();
  });

  it("SourceEvidencePanel preserves selection focus but changes identity when evidence changes", () => {
    const before = SourceEvidencePanel(evidence).key;
    expect(SourceEvidencePanel({ ...evidence, selectedSourceId: "policy" }).key).toBe(before);
    expect(SourceEvidencePanel({ ...evidence, sources: [{ ...source, excerpt: "Amended evidence." }] }).key).not.toBe(before);
  });
});

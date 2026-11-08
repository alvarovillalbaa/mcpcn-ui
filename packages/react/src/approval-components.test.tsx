// Authored DTO/SSR/revision contracts. Real focus, events and async settlement need the browser packet.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "./component-types.js";
import {
  ApprovalChecklist, BeforeSubmitConfirmation, DestructiveActionGuard, HumanOverridePanel, PermissionRequestCard,
} from "./approval-components.js";
import * as publicComponents from "./index.js";
import {
  ApprovalChecklistSchema, HumanOverridePanelSchema, PermissionRequestCardSchema,
  type ApprovalChecklistData, type BeforeSubmitConfirmationData, type DestructiveActionGuardData,
  type HumanOverridePanelData, type PermissionRequestCardData,
} from "@mcpcn/schemas";

const checklist: ApprovalChecklistData = { reviewId: "check-1", title: "Review release checks", items: [
  { id: "owner", label: "Confirm owner", required: true, description: "The selected owner reviewed the release." },
  { id: "notify", label: "Notify team", required: false },
] };
const submission: BeforeSubmitConfirmationData = { reviewId: "submit-1", title: "Review submission", fields: [
  { id: "total", label: "Total", value: 0 }, { id: "enabled", label: "Enabled", value: false },
  { id: "note", label: "Note", value: "" }, { id: "owner", label: "Owner", value: null },
  { id: "text", label: "Untrusted text", value: "<script>authored()</script>" },
] };
const destruction: DestructiveActionGuardData = { reviewId: "delete-1", title: "Review destructive intent",
  targetLabel: "Authored draft records", summary: "Remove the three selected draft records.", affectedCount: 3,
  confirmationText: "REMOVE DRAFTS", rollback: "A reviewed snapshot can restore these drafts." };
const override: HumanOverridePanelData = { reviewId: "override-1", title: "Review human override",
  recommendation: "Keep the authored current plan.", options: [{ id: "retain", label: "Keep plan" },
    { id: "revise", label: "Revise plan", description: "Use the reviewed alternative." }],
  recommendedOptionId: "retain", selectedOptionId: "revise" };
const permission: PermissionRequestCardData = { reviewId: "permission-1", title: "Review permission request",
  requester: "Authored reporting app", purpose: "Read the selected report; notifications are optional.", scopes: [
    { id: "reports.read", label: "Read selected report", required: true },
    { id: "notifications.send", label: "Send notifications", required: false },
  ] };
type StatusProps = Pick<ComponentProps<unknown>, "onAction" | "busy" | "error" | "className">;
function allMarkup(status: StatusProps = {}, disabled = false) {
  return [
    <ApprovalChecklist {...checklist} {...status} disabled={disabled} />,
    <BeforeSubmitConfirmation {...submission} {...status} disabled={disabled} />,
    <DestructiveActionGuard {...destruction} {...status} disabled={disabled} />,
    <HumanOverridePanel {...override} {...status} disabled={disabled} />,
    <PermissionRequestCard {...permission} {...status} disabled={disabled} />,
  ].map(element => renderToStaticMarkup(element));
}
function buttonAttributes(html: string, label: string) {
  const found = [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/g)].find(match => match[2] === label);
  expect(found, `Expected the ${label} button`).toBeDefined();
  return found![1]!;
}
function expectAllControlsDisabled(html: string) {
  const controls = [...html.matchAll(/<(?:input|button|textarea)\b([^>]*)>/g)];
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) expect(control[1]).toContain('disabled=""');
}

describe("dedicated approval components", () => {
  it("exports all five dedicated implementations without replacing the remaining generic aliases", () => {
    expect(publicComponents.ApprovalChecklist).toBe(ApprovalChecklist);
    expect(publicComponents.BeforeSubmitConfirmation).toBe(BeforeSubmitConfirmation);
    expect(publicComponents.DestructiveActionGuard).toBe(DestructiveActionGuard);
    expect(publicComponents.HumanOverridePanel).toBe(HumanOverridePanel);
    expect(publicComponents.PermissionRequestCard).toBe(PermissionRequestCard);
    expect(ApprovalChecklist).not.toBe(publicComponents.GenericAgentComponent);
    expect(publicComponents.RecordInspector).toBe(publicComponents.GenericAgentComponent);
    expect(publicComponents.BillingGate).toBe(publicComponents.GenericAgentComponent);
  });

  it("accepts the four UI-only props without weakening strict approval payload validation", () => {
    const onAction = vi.fn();
    for (const html of allMarkup({ onAction, busy: false, error: "Authored consumer error", className: "authored-class" })) {
      expect(html).not.toContain("data is invalid"); expect(html).toContain("authored-class");
      expect(html).toContain("Authored consumer error"); expect(html).toContain("<form");
    }
    expect(onAction).not.toHaveBeenCalled();
  });

  it("shows required and optional checklist semantics while incomplete review stays valid and blocked", () => {
    expect(ApprovalChecklistSchema.safeParse(checklist).success).toBe(true);
    const html = renderToStaticMarkup(<ApprovalChecklist {...checklist} onAction={() => undefined} />);
    expect(html).toContain("Confirm owner"); expect(html).toContain("(required)"); expect(html).toContain("(optional)");
    expect(html).toContain("Optional items may be left unchecked."); expect(html).toContain("Complete the required checks");
    expect(buttonAttributes(html, "Approve checklist")).toContain('disabled=""');
    expect(buttonAttributes(html, "Cancel")).not.toContain("disabled");
  });

  it("allows a completed checklist without requiring optional checks or dispatching during render", () => {
    const onAction = vi.fn();
    const html = renderToStaticMarkup(<ApprovalChecklist {...checklist} checkedItemIds={["owner"]} onAction={onAction} />);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(buttonAttributes(html, "Approve checklist")).not.toContain("disabled");
    expect(onAction).not.toHaveBeenCalled();
  });

  it("visibly refuses empty duplicate stale and optional-only checklist payloads", () => {
    for (const patch of [{ items: [] }, { items: [checklist.items[0], checklist.items[0]] },
      { checkedItemIds: ["removed"] }, { checkedItemIds: ["owner", "owner"] },
      { items: [{ id: "optional", label: "Optional only", required: false }] }]) {
      const html = renderToStaticMarkup(<ApprovalChecklist {...({ ...checklist, ...patch } as ApprovalChecklistData)} onAction={() => undefined} />);
      expect(html).toContain("Approval checklist data is invalid"); expect(html).not.toContain("<button");
    }
  });

  it("keeps checklist identity across controlled checks and replaces it when reviewed items change", () => {
    const key = ApprovalChecklist(checklist).key;
    expect(ApprovalChecklist({ ...checklist, checkedItemIds: ["notify", "owner"] }).key).toBe(key);
    expect(ApprovalChecklist({ ...checklist, reviewId: "check-2" }).key).not.toBe(key);
    expect(ApprovalChecklist({ ...checklist, items: [{ id: "owner", label: "A different owner review" }] }).key).not.toBe(key);
  });

  it("renders zero false null empty and escaped submission values behind fresh local consent", () => {
    const onAction = vi.fn();
    const html = renderToStaticMarkup(<BeforeSubmitConfirmation {...submission} onAction={onAction} />);
    expect(html).toContain("Fields to submit"); expect(html).toContain(">0</td>"); expect(html).toContain(">false</td>");
    expect(html).toContain("Empty text"); expect(html).toContain(">None</td>"); expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>"); expect(html).not.toContain('checked=""');
    expect(buttonAttributes(html, "Submit")).toContain('disabled=""'); expect(onAction).not.toHaveBeenCalled();
  });

  it("refuses empty duplicate nonprimitive and nonfinite submission fields without controls", () => {
    for (const fields of [[], [submission.fields[0], submission.fields[0]],
      [{ id: "bad", label: "Bad", value: {} }], [{ id: "bad", label: "Bad", value: Infinity }],
      [{ id: "bad", label: "Bad", value: NaN }]]) {
      const html = renderToStaticMarkup(<BeforeSubmitConfirmation {...({ ...submission, fields } as BeforeSubmitConfirmationData)} />);
      expect(html).toContain("Submission review data is invalid"); expect(html).not.toContain("<button");
    }
  });

  it("replaces submission identity on value changes while UI-only status keeps the same review", () => {
    const key = BeforeSubmitConfirmation(submission).key;
    expect(BeforeSubmitConfirmation({ ...submission, busy: true, error: "Failure", onAction: vi.fn() }).key).toBe(key);
    expect(BeforeSubmitConfirmation({ ...submission, fields: [{ id: "total", label: "Total", value: 1 }] }).key).not.toBe(key);
    expect(BeforeSubmitConfirmation({ ...submission, reviewId: "submit-2" }).key).not.toBe(key);
  });

  it("renders destructive target impact rollback and exact phrase with both local gates initially closed", () => {
    const onAction = vi.fn();
    const html = renderToStaticMarkup(<DestructiveActionGuard {...destruction} onAction={onAction} />);
    expect(html).toContain("Authored draft records"); expect(html).toContain("3 affected items");
    expect(html).toContain(destruction.summary); expect(html).toContain(`Rollback: ${destruction.rollback}`);
    expect(html).toContain("REMOVE DRAFTS"); expect(html).toContain('aria-label="Confirmation phrase"');
    expect(html).toContain('value=""'); expect(html).not.toContain('checked=""');
    expect(buttonAttributes(html, "Confirm destructive action")).toContain('disabled=""'); expect(onAction).not.toHaveBeenCalled();
  });

  it("refuses vacuous unsafe destructive counts and blank or padded confirmation phrases", () => {
    for (const patch of [{ affectedCount: 0 }, { affectedCount: -1 }, { affectedCount: 1.5 },
      { affectedCount: Number.MAX_SAFE_INTEGER + 1 }, { affectedCount: Infinity }, { affectedCount: NaN },
      { confirmationText: " " }, { confirmationText: " REMOVE DRAFTS" }, { confirmationText: "REMOVE\nDRAFTS" },
      { confirmationText: "REMOVE\tDRAFTS" }, { targetLabel: " " }, { summary: "" }]) {
      const html = renderToStaticMarkup(<DestructiveActionGuard {...{ ...destruction, ...patch }} />);
      expect(html).toContain("Destructive action data is invalid"); expect(html).not.toContain("<button");
    }
  });

  it("labels missing rollback information without inventing a recovery plan", () => {
    const html = renderToStaticMarkup(<DestructiveActionGuard {...destruction} rollback={undefined} onAction={() => undefined} />);
    expect(html).toContain("Rollback information was not supplied."); expect(buttonAttributes(html, "Confirm destructive action")).toContain('disabled=""');
  });

  it("replaces destructive identity whenever the target count phrase or rollback terms change", () => {
    const key = DestructiveActionGuard(destruction).key;
    for (const patch of [{ targetLabel: "Different drafts" }, { affectedCount: 4 }, { confirmationText: "REMOVE FOUR" }, { rollback: "No reviewed recovery is available." }]) {
      expect(DestructiveActionGuard({ ...destruction, ...patch }).key).not.toBe(key);
    }
    expect(DestructiveActionGuard({ ...destruction, busy: true, onAction: vi.fn() }).key).toBe(key);
  });

  it("shows the existing recommendation and controlled alternative without supplying local reason or consent", () => {
    const onAction = vi.fn();
    const html = renderToStaticMarkup(<HumanOverridePanel {...override} onAction={onAction} />);
    expect(html).toContain("Current recommendation: Keep plan"); expect(html).toContain(override.recommendation);
    expect(html).toContain('aria-label="Select override: Revise plan"'); expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toContain("Reason for override"); expect(html).toContain("<textarea");
    expect(buttonAttributes(html, "Override recommendation")).toContain('disabled=""'); expect(onAction).not.toHaveBeenCalled();
  });

  it("keeps unset and recommended selections unavailable as overrides", () => {
    expect(HumanOverridePanelSchema.safeParse({ ...override, selectedOptionId: undefined }).success).toBe(true);
    for (const selectedOptionId of [undefined, "retain"]) {
      const html = renderToStaticMarkup(<HumanOverridePanel {...override} selectedOptionId={selectedOptionId} onAction={() => undefined} />);
      expect(html).toContain("Select a different option"); expect(buttonAttributes(html, "Override recommendation")).toContain('disabled=""');
    }
  });

  it("visibly refuses stale recommendations selections duplicate options and one-option overrides", () => {
    for (const patch of [{ recommendedOptionId: "removed" }, { selectedOptionId: "removed" },
      { options: [override.options[0], override.options[0]] }, { options: [override.options[0]] }]) {
      const html = renderToStaticMarkup(<HumanOverridePanel {...({ ...override, ...patch } as HumanOverridePanelData)} />);
      expect(html).toContain("Human override data is invalid"); expect(html).not.toContain("<button");
    }
  });

  it("preserves override identity for controlled selection and fences replacement recommendation terms", () => {
    const key = HumanOverridePanel(override).key;
    expect(HumanOverridePanel({ ...override, selectedOptionId: "retain" }).key).toBe(key);
    expect(HumanOverridePanel({ ...override, recommendation: "A newly reviewed recommendation." }).key).not.toBe(key);
    expect(HumanOverridePanel({ ...override, reasonLabel: "A new reason requirement" }).key).not.toBe(key);
    expect(HumanOverridePanel({ ...override, options: [{ id: "retain", label: "Keep revised plan" }, override.options[1]!] }).key).not.toBe(key);
  });

  it("renders permission purpose required scopes and optional semantics without granting access", () => {
    expect(PermissionRequestCardSchema.safeParse(permission).success).toBe(true);
    const html = renderToStaticMarkup(<PermissionRequestCard {...permission} onAction={() => undefined} />);
    expect(html).toContain(permission.requester); expect(html).toContain(permission.purpose);
    expect(html).toContain("Read selected report"); expect(html).toContain("(required)"); expect(html).toContain("(optional)");
    expect(html).toContain("does not grant access or change authorization");
    expect(buttonAttributes(html, "Request permission")).toContain('disabled=""');
    expect(buttonAttributes(html, "Deny permission")).not.toContain("disabled");
  });

  it("requires fresh local consent even when every required permission scope is selected", () => {
    const onAction = vi.fn();
    const html = renderToStaticMarkup(<PermissionRequestCard {...permission} selectedScopeIds={["reports.read", "notifications.send"]} onAction={onAction} />);
    expect(html.match(/checked=""/g)).toHaveLength(2); expect(buttonAttributes(html, "Request permission")).toContain('disabled=""');
    expect(onAction).not.toHaveBeenCalled();
  });

  it("refuses empty optional-only duplicate and stale permission scope payloads", () => {
    for (const patch of [{ scopes: [] }, { scopes: [permission.scopes[0], permission.scopes[0]] },
      { scopes: [{ id: "optional", label: "Optional only", required: false }] },
      { selectedScopeIds: ["removed"] }, { selectedScopeIds: ["reports.read", "reports.read"] }]) {
      const html = renderToStaticMarkup(<PermissionRequestCard {...({ ...permission, ...patch } as PermissionRequestCardData)} />);
      expect(html).toContain("Permission request data is invalid"); expect(html).not.toContain("<button");
    }
  });

  it("preserves permission identity for controlled scope sets and replaces changed permission terms", () => {
    const key = PermissionRequestCard(permission).key;
    expect(PermissionRequestCard({ ...permission, selectedScopeIds: ["reports.read"] }).key).toBe(key);
    expect(PermissionRequestCard({ ...permission, selectedScopeIds: ["notifications.send", "reports.read"] }).key).toBe(key);
    expect(PermissionRequestCard({ ...permission, purpose: "A different access purpose." }).key).not.toBe(key);
    expect(PermissionRequestCard({ ...permission, scopes: [{ id: "reports.read", label: "Read a different report" }] }).key).not.toBe(key);
  });

  it("disables every action and local input for disabled data without presenting it as pending work", () => {
    const onAction = vi.fn();
    for (const html of allMarkup({ onAction }, true)) {
      expectAllControlsDisabled(html); expect(html).toContain('aria-busy="false"'); expect(html).not.toContain("Working…");
    }
    expect(onAction).not.toHaveBeenCalled();
  });

  it("shows external pending feedback while all five components refuse further interaction", () => {
    const onAction = vi.fn();
    for (const html of allMarkup({ onAction, busy: true })) {
      expectAllControlsDisabled(html); expect(html).toContain('aria-busy="true"'); expect(html).toContain("Working…");
    }
    expect(onAction).not.toHaveBeenCalled();
  });

  it("keeps every interactive control unavailable when a consumer callback is absent", () => {
    for (const html of allMarkup()) { expectAllControlsDisabled(html); expect(html).not.toContain("data is invalid"); }
  });

  it("renders consumer failure feedback as escaped text without treating it as approval", () => {
    const onAction = vi.fn();
    for (const html of allMarkup({ onAction, error: "<script>consumer refused</script>" })) {
      expect(html).toContain('role="alert"'); expect(html).toContain("&lt;script&gt;consumer refused&lt;/script&gt;"); expect(html).not.toContain("<script>");
    }
    expect(onAction).not.toHaveBeenCalled();
  });

  it("refuses caller-supplied local consent phrase and reason fields rather than trusting them", () => {
    const onAction = vi.fn();
    const invalid = [
      <ApprovalChecklist {...({ ...checklist, consent: true } as ApprovalChecklistData)} onAction={onAction} />,
      <BeforeSubmitConfirmation {...({ ...submission, consent: true } as BeforeSubmitConfirmationData)} onAction={onAction} />,
      <DestructiveActionGuard {...({ ...destruction, phrase: "REMOVE DRAFTS" } as DestructiveActionGuardData)} onAction={onAction} />,
      <HumanOverridePanel {...({ ...override, reason: "Already approved" } as HumanOverridePanelData)} onAction={onAction} />,
      <PermissionRequestCard {...({ ...permission, consent: true } as PermissionRequestCardData)} onAction={onAction} />,
    ];
    for (const element of invalid) {
      const html = renderToStaticMarkup(element); expect(html).toContain('role="alert"'); expect(html).not.toContain("<button");
    }
    expect(onAction).not.toHaveBeenCalled();
  });
});

import type { ApprovalChecklistData, BeforeSubmitConfirmationData, DestructiveActionGuardData, HumanOverridePanelData, PermissionRequestCardData } from "@mcpcn/schemas";

export const approvalExamples = {
  "approval-checklist": { reviewId: "docs-checklist-1", title: "Review the publication checklist", description: "Check the required items before approval intent. Nothing is published.", items: [{ id: "scope", label: "Review affected records", required: true }, { id: "rollback", label: "Review rollback plan", required: true }, { id: "notes", label: "Include review notes", required: false }], checkedItemIds: [] },
  "before-submit-confirmation": { reviewId: "docs-submission-1", title: "Review the submission", description: "Confirm the current values. This example does not submit a form.", fields: [{ id: "subject", label: "Subject", value: "Authored publication request" }, { id: "records", label: "Records", value: 2 }, { id: "notify", label: "Notify reviewers", value: false }] },
  "destructive-action-guard": { reviewId: "docs-destructive-1", title: "Review the destructive action", targetLabel: "Two authored draft records", summary: "The consuming app would remove the selected drafts.", affectedCount: 2, confirmationText: "REMOVE DRAFTS", rollback: "Restore the previous authored revision." },
  "human-override-panel": { reviewId: "docs-override-1", title: "Review the recommendation", recommendation: "Use the standard review route.", options: [{ id: "standard", label: "Standard review" }, { id: "manual", label: "Manual review" }, { id: "defer", label: "Defer review" }], recommendedOptionId: "standard" },
  "permission-request-card": { reviewId: "docs-permission-1", title: "Review requested permissions", requester: "Authored review assistant", purpose: "Read the selected document metadata for review.", scopes: [{ id: "documents.read", label: "Read document metadata", required: true }, { id: "notes.read", label: "Read review notes", required: false }], selectedScopeIds: [] },
} satisfies {
  "approval-checklist": ApprovalChecklistData;
  "before-submit-confirmation": BeforeSubmitConfirmationData;
  "destructive-action-guard": DestructiveActionGuardData;
  "human-override-panel": HumanOverridePanelData;
  "permission-request-card": PermissionRequestCardData;
};

const names = { "approval-checklist": "ApprovalChecklist", "before-submit-confirmation": "BeforeSubmitConfirmation", "destructive-action-guard": "DestructiveActionGuard", "human-override-panel": "HumanOverridePanel", "permission-request-card": "PermissionRequestCard" } as const;
const controlledHandlers = {
  "approval-checklist": `    const value = action.data as { reviewId?: string; itemId?: string; checked?: boolean } | undefined;
    if (action.type === "check-item" && value?.reviewId === data.reviewId && typeof value.itemId === "string" && typeof value.checked === "boolean") {
      const { itemId, checked } = value;
      setData(current => current.items.some(item => item.id === itemId) ? { ...current, checkedItemIds: checked ? [...new Set([...(current.checkedItemIds ?? []), itemId])] : (current.checkedItemIds ?? []).filter(id => id !== itemId) } : current);
    }`,
  "human-override-panel": `    const value = action.data as { reviewId?: string; optionId?: string } | undefined;
    if (action.type === "select-override-option" && value?.reviewId === data.reviewId && typeof value.optionId === "string") {
      const { optionId } = value;
      setData(current => current.options.some(option => option.id === optionId) ? { ...current, selectedOptionId: optionId } : current);
    }`,
  "permission-request-card": `    const value = action.data as { reviewId?: string; scopeId?: string; selected?: boolean } | undefined;
    if (action.type === "select-scope" && value?.reviewId === data.reviewId && typeof value.scopeId === "string" && typeof value.selected === "boolean") {
      const { scopeId, selected } = value;
      setData(current => current.scopes.some(scope => scope.id === scopeId) ? { ...current, selectedScopeIds: selected ? [...new Set([...(current.selectedScopeIds ?? []), scopeId])] : (current.selectedScopeIds ?? []).filter(id => id !== scopeId) } : current);
    }`,
};

/** Complete, typed consumer examples; terminal callbacks record intent only. */
export function approvalExampleCode(slug: string): string | undefined {
  if (!Object.hasOwn(approvalExamples, slug)) return undefined;
  const key = slug as keyof typeof approvalExamples, name = names[key];
  const controlled = key === "approval-checklist" || key === "human-override-panel" || key === "permission-request-card";
  return `"use client";
import { useState } from "react";
import { ${name}, type ComponentAction } from "@mcpcn/react";
import type { ${name}Data } from "@mcpcn/schemas";

export function Example() {
  const [data${controlled ? ", setData" : ""}] = useState<${name}Data>(${JSON.stringify(approvalExamples[key], null, 2)});
  const [last, setLast] = useState<ComponentAction | null>(null);
  const handleAction = (action: ComponentAction) => {
    setLast(action);
${controlled ? controlledHandlers[key as keyof typeof controlledHandlers] : "    // The consuming application owns authorization and any external action."}
  };
  return <>
    <${name} {...data} onAction={handleAction} />
    <pre aria-label="Last intent">{JSON.stringify(last, null, 2)}</pre>
  </>;
}`;
}

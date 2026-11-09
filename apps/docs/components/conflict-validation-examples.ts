import type { ComponentAction } from "@mcpcn/react";
import type { ConflictResolverData, ValidationSummaryData } from "@mcpcn/schemas";
import { authoredConflictResolver, authoredValidationSummary } from "../../playground/src/conflict-validation-fixtures";

export type ConflictValidationExampleData = ConflictResolverData | ValidationSummaryData;
export const conflictValidationExamples: { "conflict-resolver": ConflictResolverData; "validation-summary": ValidationSummaryData } = {
  "conflict-resolver": { ...authoredConflictResolver, title: "Review supplied conflict choices" },
  "validation-summary": { ...authoredValidationSummary, title: "Inspect supplied validation report" },
};

/** The consumer acknowledges only current selection identities; confirmation is never resolution. */
export function applyConflictValidationExampleAction<T extends ConflictValidationExampleData>(current: T, action: ComponentAction): T {
  if (current.state !== "ready" || !action.data || typeof action.data !== "object" || Array.isArray(action.data)) return current;
  const conflict = "conflict" in current, selection = conflict ? current.selectedCandidateId : current.selectedIssueId;
  if (selection === undefined) return current;
  const scope = action.data as Record<string, unknown>, owner = conflict ? current.conflict : current.report;
  const select = conflict ? "select-conflict-candidate" : "inspect-validation-issue", clear = conflict ? "clear-conflict-candidate" : "clear-validation-issue";
  if (action.type !== select && action.type !== clear) return current;
  const ownerKey = conflict ? "conflict" : "report", memberKey = conflict ? "candidate" : "issue";
  const keys = ["componentId", "componentRevision", ownerKey + "Id", ownerKey + "Revision", ...(action.type === select ? [memberKey + "Id", memberKey + "Revision"] : [])];
  if (Object.keys(scope).length !== keys.length || keys.some(key => !Object.hasOwn(scope, key))
    || scope.componentId !== current.id || scope.componentRevision !== current.revision || scope[ownerKey + "Id"] !== owner.id || scope[ownerKey + "Revision"] !== owner.revision) return current;
  const member = action.type === clear ? null : (conflict ? current.conflict.candidates : current.report.issues).find(item => item.id === scope[memberKey + "Id"] && item.revision === scope[memberKey + "Revision"]);
  if (action.type !== clear && !member) return current;
  return { ...current, [conflict ? "selectedCandidateId" : "selectedIssueId"]: member?.id ?? null };
}

export function conflictValidationExampleCode(slug: string): string | undefined {
  if (slug !== "conflict-resolver" && slug !== "validation-summary") return undefined;
  const conflict = slug === "conflict-resolver", name = conflict ? "ConflictResolver" : "ValidationSummary";
  const selection = conflict ? "selectedCandidateId" : "selectedIssueId", owner = conflict ? "conflict" : "report", member = conflict ? "candidate" : "issue";
  return `"use client";
import { useState } from "react";
import { ${name}, type ComponentAction } from "@mcpcn/react";
import type { ${name}Data } from "@mcpcn/schemas";

export function Example() {
  const [data, setData] = useState<${name}Data>(${JSON.stringify(conflictValidationExamples[slug], null, 2)});
  const [last, setLast] = useState<ComponentAction | null>(null);
  const handleAction = (action: ComponentAction) => {
    setLast(action);
    if (!action.data || typeof action.data !== "object" || Array.isArray(action.data)) return;
    const scope = action.data as Record<string, unknown>;
    setData(current => {
      if (current.state !== "ready" || current.${selection} === undefined
        || scope.componentId !== current.id || scope.componentRevision !== current.revision
        || scope.${owner}Id !== current.${owner}.id || scope.${owner}Revision !== current.${owner}.revision) return current;
      const selecting = action.type === "${conflict ? "select-conflict-candidate" : "inspect-validation-issue"}";
      const clearing = action.type === "${conflict ? "clear-conflict-candidate" : "clear-validation-issue"}";
      const keys = ["componentId", "componentRevision", "${owner}Id", "${owner}Revision", ...(selecting ? ["${member}Id", "${member}Revision"] : [])];
      if ((!selecting && !clearing) || Object.keys(scope).length !== keys.length || keys.some(key => !Object.hasOwn(scope, key))) return current;
      if (clearing) return { ...current, ${selection}: null };
      const member = current.${owner}.${conflict ? "candidates" : "issues"}.find(item => item.id === scope.${member}Id && item.revision === scope.${member}Revision);
      return member ? { ...current, ${selection}: member.id } : current;
    });
  };
  // Omit ${selection} for callback-optional local selection.
  // Confirmation only notifies this consumer. No resolution, validation, save or tool call is performed.
  return <><${name} {...data} onAction={handleAction} /><pre aria-label="Last choice or validation intent">{JSON.stringify(last, null, 2)}</pre></>;
}`;
}

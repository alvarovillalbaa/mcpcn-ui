import type { ComponentAction } from "@mcpcn/react";
import type { OptionSelectorData, RankingListData } from "@mcpcn/schemas";
import { authoredOptionSelector, authoredRankingList } from "../../playground/src/option-ranking-fixtures";

export type OptionRankingExampleData = OptionSelectorData | RankingListData;
export const optionRankingExamples: { "option-selector": OptionSelectorData; "ranking-list": RankingListData } = {
  "option-selector": { ...authoredOptionSelector, title: "Choose supplied options" },
  "ranking-list": { ...authoredRankingList, title: "Inspect supplied ranked options" },
};

/** Acknowledgement changes only an explicit controlled selection at its current scope. */
export function applyOptionRankingExampleAction<T extends OptionRankingExampleData>(current: T, action: ComponentAction): T {
  if (current.state !== "ready" || !action.data || typeof action.data !== "object" || Array.isArray(action.data)) return current;
  const option = "group" in current, selection = option ? current.selectedOptionId : current.selectedEntryId;
  if (selection === undefined) return current;
  const scope = action.data as Record<string, unknown>, owner = option ? current.group : current.list;
  const select = option ? "select-option" : "inspect-ranked-option", clear = option ? "clear-option" : "clear-ranked-option";
  if (action.type !== select && action.type !== clear) return current;
  const ownerKey = option ? "group" : "list", memberKey = option ? "option" : "entry";
  const keys = ["componentId", "componentRevision", ownerKey + "Id", ownerKey + "Revision", ...(action.type === select ? [memberKey + "Id", memberKey + "Revision"] : [])];
  if (Object.keys(scope).length !== keys.length || keys.some(key => !Object.hasOwn(scope, key))
    || scope.componentId !== current.id || scope.componentRevision !== current.revision || scope[ownerKey + "Id"] !== owner.id || scope[ownerKey + "Revision"] !== owner.revision) return current;
  const member = action.type === clear ? null : (option ? current.group.options : current.list.entries).find(item => item.id === scope[memberKey + "Id"] && item.revision === scope[memberKey + "Revision"]);
  if (action.type !== clear && !member) return current;
  return { ...current, [option ? "selectedOptionId" : "selectedEntryId"]: member?.id ?? null };
}

export function optionRankingExampleCode(slug: string): string | undefined {
  if (slug !== "option-selector" && slug !== "ranking-list") return undefined;
  const option = slug === "option-selector", name = option ? "OptionSelector" : "RankingList";
  const selection = option ? "selectedOptionId" : "selectedEntryId", owner = option ? "group" : "list", member = option ? "option" : "entry";
  return `"use client";
import { useState } from "react";
import { ${name}, type ComponentAction } from "@mcpcn/react";
import type { ${name}Data } from "@mcpcn/schemas";

export function Example() {
  const [data, setData] = useState<${name}Data>(${JSON.stringify(optionRankingExamples[slug], null, 2)});
  const [last, setLast] = useState<ComponentAction | null>(null);
  const handleAction = (action: ComponentAction) => {
    setLast(action);
    if (!action.data || typeof action.data !== "object" || Array.isArray(action.data)) return;
    const scope = action.data as Record<string, unknown>;
    setData(current => {
      if (current.state !== "ready" || current.${selection} === undefined
        || scope.componentId !== current.id || scope.componentRevision !== current.revision
        || scope.${owner}Id !== current.${owner}.id || scope.${owner}Revision !== current.${owner}.revision) return current;
      const selecting = action.type === "${option ? "select-option" : "inspect-ranked-option"}";
      const clearing = action.type === "${option ? "clear-option" : "clear-ranked-option"}";
      const keys = ["componentId", "componentRevision", "${owner}Id", "${owner}Revision", ...(selecting ? ["${member}Id", "${member}Revision"] : [])];
      if ((!selecting && !clearing) || Object.keys(scope).length !== keys.length || keys.some(key => !Object.hasOwn(scope, key))) return current;
      if (clearing) return { ...current, ${selection}: null };
      const member = current.${owner}.${option ? "options" : "entries"}.find(item => item.id === scope.${member}Id && item.revision === scope.${member}Revision);
      return member ? { ...current, ${selection}: member.id } : current;
    });
  };
  // Omit ${selection} for callback-optional local reading.
  // Supplied order, rank, score and confidence are not computed or approved here.
  return <><${name} {...data} onAction={handleAction} /><pre aria-label="Last option or ranking intent">{JSON.stringify(last, null, 2)}</pre></>;
}`;
}

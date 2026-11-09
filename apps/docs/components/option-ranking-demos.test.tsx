import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OptionSelector, RankingList } from "@mcpcn/react";
import { OptionSelectorSchema, RankingListSchema } from "@mcpcn/schemas";
import { OptionSelectorDemo, RankingListDemo } from "./option-ranking-demos";
import { applyOptionRankingExampleAction, optionRankingExamples, optionRankingExampleCode } from "./option-ranking-examples";

const optionScope = { componentId: "option-selector-1", componentRevision: "1", groupId: "group-1", groupRevision: "1", optionId: "preferred", optionRevision: "1" };
const entryScope = { componentId: "ranking-list-1", componentRevision: "1", listId: "list-1", listRevision: "1", entryId: "nested", entryRevision: "1" };
const selected = { type: "select-option", data: optionScope }, inspected = { type: "inspect-ranked-option", data: entryScope };
const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#x27;");

describe("option and ranking documentation consumers", () => {
  it("OR-DOC01 supplies strict controlled examples with no inferred winner or selected entry", () => {
    const a = OptionSelectorSchema.parse(optionRankingExamples["option-selector"]), b = RankingListSchema.parse(optionRankingExamples["ranking-list"]);
    if (a.state !== "ready" || b.state !== "ready") throw new Error("authored_ready_required");
    expect(a.selectedOptionId).toBeNull(); expect(b.selectedEntryId).toBeNull(); expect(a.group.options).toHaveLength(3); expect(b.list.entries).toHaveLength(5);
    expect(b.list.entries.map(item => item.rank)).toEqual([7, 2, 7, 11, 4]); expect(b.list.entries.map(item => item.score)).toEqual([0, undefined, -12.5, 1, 1]);
  });
  it("OR-DOC02 renders local none with option controls and four initially zero counters", () => {
    const html = renderToStaticMarkup(<OptionSelectorDemo />);
    expect(html).toContain('aria-label="Option selector demonstration"'); expect(html).toContain("Choose supplied options"); expect(html).toContain('aria-label="Select option: Preferred option"');
    expect(html).toContain("No option is selected."); expect(html).not.toContain('aria-label="Complete option JSON"');
    for (const label of ["Option selector intent count", "Selection notification count", "Settled selection notification count", "Pending selection notifications"]) expect(html).toContain(`aria-label="${label}">0</output>`);
    expect(html).not.toContain("Confirm choice");
  });
  it("OR-DOC03 renders reported ranking order ties scores and absent score without selection", () => {
    const html = renderToStaticMarkup(<RankingListDemo />).replaceAll("<!-- -->", "");
    expect(html).toContain("Inspect supplied ranked options"); expect(html).toContain('aria-label="Inspect ranked option: Nested result"'); expect(html).toContain("No ranked option is selected.");
    expect(html.indexOf("Nested result")).toBeLessThan(html.indexOf("False result")); expect(html.indexOf("False result")).toBeLessThan(html.indexOf("Zero result"));
    expect(html).toContain("Reported rank: 7"); expect(html).toContain("Reported score: 0"); expect(html).toContain("Reported score: Not supplied"); expect(html).toContain("Reported score: -12.5");
    expect(html).toContain('aria-label="Ranking list intent count">0</output>'); expect(html).not.toContain('aria-label="Complete ranked option JSON"');
  });
  it("OR-DOC04 acknowledges current identities while retaining all supplied option data", () => {
    const data = optionRankingExamples["option-selector"], next = applyOptionRankingExampleAction(data, selected);
    expect(next).not.toBe(data); if (next.state !== "ready" || data.state !== "ready") throw new Error("authored_ready_required");
    expect(next.selectedOptionId).toBe("preferred"); expect(next.group).toBe(data.group);
    expect(applyOptionRankingExampleAction(next, { type: "approve", data: optionScope })).toBe(next); expect(JSON.stringify(next)).not.toContain('"approved":true');
  });
  it("OR-DOC05 explicitly clears both controlled selections and leaves local omission private", () => {
    const a = applyOptionRankingExampleAction(optionRankingExamples["option-selector"], selected), b = applyOptionRankingExampleAction(optionRankingExamples["ranking-list"], inspected);
    const clearedA = applyOptionRankingExampleAction(a, { type: "clear-option", data: { componentId: optionScope.componentId, componentRevision: "1", groupId: "group-1", groupRevision: "1" } });
    const clearedB = applyOptionRankingExampleAction(b, { type: "clear-ranked-option", data: { componentId: entryScope.componentId, componentRevision: "1", listId: "list-1", listRevision: "1" } });
    if (clearedA.state !== "ready" || clearedB.state !== "ready") throw new Error("authored_ready_required");
    expect(clearedA.selectedOptionId).toBeNull(); expect(clearedB.selectedEntryId).toBeNull();
    const { selectedOptionId: _selected, ...local } = clearedA; expect(applyOptionRankingExampleAction(local, selected)).toBe(local);
  });
  it("OR-DOC06 rejects stale root owner member scopes and every private event addition", () => {
    const data = optionRankingExamples["option-selector"];
    for (const key of Object.keys(optionScope) as Array<keyof typeof optionScope>) expect(applyOptionRankingExampleAction(data, { ...selected, data: { ...optionScope, [key]: "stale" } })).toBe(data);
    expect(applyOptionRankingExampleAction(data, { ...selected, data: { ...optionScope, value: false } })).toBe(data);
    const ranking = optionRankingExamples["ranking-list"];
    for (const key of ["rank", "score", "confidence", "evidence", "url"]) expect(applyOptionRankingExampleAction(ranking, { ...inspected, data: { ...entryScope, [key]: 0 } })).toBe(ranking);
  });
  it("OR-DOC07 displays complete escaped option JSON evidence and zero confidence", () => {
    const data = optionRankingExamples["option-selector"]; if (data.state !== "ready") throw new Error("authored_ready_required");
    const first = data.group.options[0]; if (!first) throw new Error("authored_member_required"); const text = JSON.stringify(first.value, null, 2); if (text === undefined) throw new Error("authored_value_required");
    const html = renderToStaticMarkup(<OptionSelector {...data} selectedOptionId="preferred" onAction={() => undefined} />);
    expect(html).toContain(escape(text)); expect(html).toContain("END-OPTION-EVIDENCE"); expect(html).toContain('aria-valuetext="0%"'); expect(html).toContain('href="https://example.com/supplied-option"');
    expect(html).not.toContain("<script>"); expect(html).not.toContain("<em>option evidence</em>");
  });
  it("OR-DOC08 displays complete ranked value and zero score independently from confidence", () => {
    const data = optionRankingExamples["ranking-list"]; if (data.state !== "ready") throw new Error("authored_ready_required");
    const first = data.list.entries[0]; if (!first) throw new Error("authored_member_required"); const text = JSON.stringify(first.value, null, 2); if (text === undefined) throw new Error("authored_value_required");
    const html = renderToStaticMarkup(<RankingList {...data} selectedEntryId="nested" onAction={() => undefined} />).replaceAll("<!-- -->", "");
    expect(html).toContain(escape(text)); expect(html).toContain("END-RANKING-EVIDENCE"); expect(html).toContain("Reported rank: 7"); expect(html).toContain("Reported score: 0"); expect(html).toContain('aria-valuetext="0%"');
    expect(html).not.toContain("<script>"); expect(html).not.toContain("<em>ranking evidence</em>");
  });
  it("OR-DOC09 exposes held FIFO rejection throw and explicit replacement lifecycle controls", () => {
    const html = renderToStaticMarkup(<OptionSelectorDemo />), ranking = renderToStaticMarkup(<RankingListDemo />);
    for (const label of ["Selection notification response", "Selection ownership", "Reported state", "Callback enabled", "External busy", "Malformed data", "Mount component"]) expect(html).toContain(`aria-label="${label}"`);
    for (const label of ["Apply last selection request", "Append unrelated member", "Reorder members", "Replace selected member", "Remove selected member", "Replace group", "Replace component", "Resolve oldest notification", "Reject oldest notification"]) expect(html).toContain(label);
    expect(ranking).toContain("Replace list"); expect(ranking).toContain('value="ready-empty"'); expect(html).toContain('value="hold"'); expect(html).toContain('value="throw"'); expect(html).not.toContain("Confirmation response");
    for (const label of ["Change selected rank", "Change selected score"]) {
      expect(ranking).toMatch(new RegExp('<button\\b[^>]*\\bdisabled=""[^>]*>' + label + '</button>'));
      expect(html).not.toContain(label);
    }
  });
  it("OR-DOC10 publishes current API snippets with strict identity-only functional acknowledgements", () => {
    for (const [slug, name] of [["option-selector", "OptionSelector"], ["ranking-list", "RankingList"]] as const) {
      const code = optionRankingExampleCode(slug)!;
      expect(code).toContain(`import { ${name}, type ComponentAction } from "@mcpcn/react"`); expect(code).toContain(`import type { ${name}Data } from "@mcpcn/schemas"`);
      expect(code).toContain("setData(current =>"); expect(code).toContain("Object.keys(scope).length !== keys.length"); expect(code).toContain("scope.componentRevision !== current.revision"); expect(code).toContain("END-");
      expect(code).not.toContain("callTool("); expect(code).not.toContain("fetch("); expect(code).not.toContain(".sort(");
    }
    expect(optionRankingExampleCode("conflict-resolver")).toBeUndefined();
  });
});

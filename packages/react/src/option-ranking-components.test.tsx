import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OptionSelectorSchema, RankingListSchema, stableReviewKey,
  type ChoiceOption, type RankedOption, type OptionSelectorData, type ParsedOptionSelectorData,
  type RankingListData, type ParsedRankingListData, type ParsedChoiceOption, type ParsedRankedOption,
} from "@mcpcn/schemas";
import {
  OptionSelector, RankingList, reconcileOptionRankingSelection, optionRankingNotificationScope, optionRankingIntent,
} from "./option-ranking-components.js";

const first: ChoiceOption = { id: "first", revision: "member-one", label: "Supplied first option", value: { zero: 0, checked: false, next: null, empty: "", items: [false, 0, null, "", { end: "Final supplied value" }] }, confidence: 0,
  evidence: [{ id: "line", label: "Supplied evidence note", text: "Complete authored text.\nFinal evidence marker", url: "https://example.invalid/supplied" }] };
const second: ChoiceOption = { id: "second", revision: "member-two", label: "Supplied second option", value: "Private sibling value",
  evidence: [{ id: "sibling", label: "Private sibling evidence", text: "Private sibling evidence text" }] };
type OptionsInput = Extract<OptionSelectorData, { state: "ready" }>;
type RankingInput = Extract<RankingListData, { state: "ready" }>;
const options: OptionsInput = { id: "option-selector", revision: "component-one", title: "Inspect supplied options", state: "ready",
  group: { id: "group-one", revision: "group-revision-one", label: "Supplied choice group", options: [first, second] } };
const ranking: RankingInput = { id: "ranking-list", revision: "component-two", title: "Inspect supplied ranking", state: "ready",
  list: { id: "list-one", revision: "list-revision-one", label: "Supplied ranking list", entries: [{ ...first, rank: 7, score: 0, scoreLabel: "Authored score" }, { ...second, rank: 2 }] } };
type ReadyOptions = Extract<ParsedOptionSelectorData, { state: "ready" }>;
type ReadyRanking = Extract<ParsedRankingListData, { state: "ready" }>;
type Ready = ReadyOptions | ReadyRanking;
type Member = ParsedChoiceOption | ParsedRankedOption;
const render = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);
const callback = () => undefined;
function parsedOptions(value: OptionSelectorData = options): ReadyOptions {
  const data = OptionSelectorSchema.parse(value); if (data.state !== "ready") throw new Error("Authored ready options required"); return data;
}
function parsedRanking(value: RankingListData = ranking): ReadyRanking {
  const data = RankingListSchema.parse(value); if (data.state !== "ready") throw new Error("Authored ready ranking required"); return data;
}
const membersOf = (data: Ready): Member[] => "group" in data ? data.group.options : data.list.entries;
function firstMember(data: Ready): Member {
  const member = membersOf(data)[0]; if (!member) throw new Error("Authored first member required"); return member;
}
function withMembers(data: Ready, members: Member[]): Ready {
  return "group" in data ? parsedOptions({ ...data, group: { ...data.group, options: members } })
    : parsedRanking({ ...data, list: { ...data.list, entries: members.map(member => { if (!("rank" in member)) throw new Error("Authored rank required"); return member; }) } });
}
function selected(data: Ready) {
  const member = firstMember(data);
  return { ...reconcileOptionRankingSelection(data), localId: member.id, selectedId: member.id, memberKey: stableReviewKey(member) };
}
function button(html: string, label: string) {
  const native = [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/g)].find(match => match[1]?.includes(`aria-label="${label}"`) || match[2] === label);
  expect(native, `Expected native button ${label}`).toBeDefined(); return native?.[1] ?? "";
}

describe("supplied option selection and reported ranking", () => {
  it("OR-UI01 renders labelled native regions and separates caller-only UI properties", () => {
    for (const html of [render(<OptionSelector {...options} className="authored-options" busy error="Authored UI feedback" onAction={callback} />),
      render(<RankingList {...ranking} className="authored-options" busy error="Authored UI feedback" onAction={callback} />)]) {
      expect(html).toMatch(/^<section\b/); expect(html).toContain('role="region"'); expect(html).toContain('aria-busy="true"');
      expect(html).toContain("authored-options"); expect(html).toContain("Authored UI feedback"); expect(html).not.toContain("is invalid");
    }
  });
  it("OR-UI02 rejects unsafe root descriptors without reading getters or revealing private content", () => {
    let reads = 0;
    const accessorOptions = Object.defineProperty({ ...options }, "group", { enumerable: true, get() { reads++; return options.group; } });
    const accessorRanking = Object.defineProperty({ ...ranking }, "list", { enumerable: true, get() { reads++; return ranking.list; } });
    // Direct wrappers preserve the authored descriptors before React can copy props.
    for (const html of [render(OptionSelector(accessorOptions)), render(RankingList(accessorRanking))]) {
      expect(html).toContain('role="alert"'); expect(html).toContain("is invalid"); expect(html).not.toContain("Final supplied value");
      expect(html).not.toContain("https://example.invalid"); expect(html).not.toContain("<button");
    }
    expect(reads).toBe(0);
  });
  it("OR-UI03 starts callback-free local reading with no inferred selection or private value disclosure", () => {
    for (const [html, label] of [[render(<OptionSelector {...options} />), "Select option: Supplied first option"],
      [render(<RankingList {...ranking} />), "Inspect ranked option: Supplied first option"]] as const) {
      expect(button(html, label)).toContain('aria-pressed="false"'); expect(button(html, label)).not.toContain("disabled");
      expect(button(html, "Clear selection")).toContain("disabled"); expect(html).not.toContain("<pre");
      expect(html).not.toContain("Private sibling value"); expect(html).not.toContain("Final evidence marker");
    }
  });
  it("OR-UI04 preserves controlled null and requires a callback for selection requests", () => {
    const absent = render(<OptionSelector {...options} selectedOptionId={null} />), present = render(<OptionSelector {...options} selectedOptionId={null} onAction={callback} />);
    expect(button(absent, "Select option: Supplied first option")).toContain("disabled"); expect(button(present, "Select option: Supplied first option")).not.toContain("disabled");
    const ranked = render(<RankingList {...ranking} selectedEntryId={null} />);
    expect(button(ranked, "Inspect ranked option: Supplied first option")).toContain("disabled");
    for (const html of [absent, present, ranked]) { expect(button(html, "Clear selection")).toContain("disabled"); expect(html).not.toContain("<pre"); }
  });
  it("OR-UI05 keeps controlled selected content readable when requests have no callback", () => {
    for (const [html, label] of [[render(<OptionSelector {...options} selectedOptionId={first.id} />), "Select option: Supplied first option"],
      [render(<RankingList {...ranking} selectedEntryId={first.id} />), "Inspect ranked option: Supplied first option"]] as const) {
      expect(button(html, label)).toContain('aria-pressed="true"'); expect(button(html, label)).toContain("disabled");
      expect(button(html, "Clear selection")).toContain("disabled"); expect(html).toContain("Final supplied value"); expect(html).toContain("Final evidence marker");
    }
  });
  it("OR-UI06 renders complete falsy primitives and nested JSON in each selected value region", () => {
    for (const value of [false, 0, null, "", { zero: 0, checked: false, next: null, nested: ["", { end: "Complete final member" }] }]) {
      const choice = render(<OptionSelector {...options} group={{ ...options.group, options: [{ ...first, value }] }} selectedOptionId={first.id} />);
      const ranked = render(<RankingList {...ranking} list={{ ...ranking.list, entries: [{ ...first, value, rank: 7 }] }} selectedEntryId={first.id} />);
      expect(choice).toContain('aria-label="Complete option JSON"'); expect(ranked).toContain('aria-label="Complete ranked option JSON"');
      for (const html of [choice, ranked]) {
        expect(html).toContain('tabindex="0"');
        if (value !== null && typeof value === "object") { expect(html).toContain("&quot;nested&quot;"); expect(html).toContain("Complete final member"); }
        else expect(html).toContain(JSON.stringify(value).replaceAll('"', "&quot;"));
      }
    }
  });
  it("OR-UI07 preserves complete escaped long values and evidence with safe explicit links", () => {
    const value = "x".repeat(9900) + "<script>supplied()</script>\nFinal value marker", text = "y".repeat(3900) + "\n<em>Evidence ending</em>";
    const html = render(<OptionSelector {...options} group={{ ...options.group, label: "<b>Supplied group</b>", options: [{ ...first, label: "<b>Supplied option</b>", value,
      evidence: [{ id: "full", label: "Complete evidence", text, url: "https://example.invalid/full" }] }] }} selectedOptionId={first.id} />);
    expect(html).toContain("x".repeat(9900)); expect(html).toContain("Final value marker"); expect(html).toContain("y".repeat(3900));
    expect(html).toContain("&lt;script&gt;supplied()&lt;/script&gt;"); expect(html).toContain("&lt;em&gt;Evidence ending&lt;/em&gt;");
    expect(html).toContain("&lt;b&gt;Supplied group&lt;/b&gt;"); expect(html).not.toContain("<script>"); expect(html).not.toContain("<em>");
    expect(html).toContain('href="https://example.invalid/full"'); expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"'); expect(html).toMatch(/referrerpolicy="no-referrer"/i);
  });
  it("OR-UI08 discloses only the current selected member's complete value and evidence", () => {
    for (const html of [render(<OptionSelector {...options} selectedOptionId={first.id} />), render(<RankingList {...ranking} selectedEntryId={first.id} />)]) {
      expect(html).toContain(second.label); expect(html).toContain("Final supplied value"); expect(html).toContain("Final evidence marker");
      expect(html).not.toContain("Private sibling value"); expect(html).not.toContain("Private sibling evidence text"); expect(html).not.toContain("Private sibling evidence</strong>");
    }
  });
  it("OR-UI09 distinguishes zero and absent confidence with only supplied native meters", () => {
    const html = render(<OptionSelector {...options} />);
    expect(html).toContain("Reported confidence: 0%"); expect(html).toContain("Reported confidence: Not supplied"); expect(html.match(/<meter\b/g)).toHaveLength(1);
    expect(html).toContain('min="0" max="1" value="0"'); expect(html).toContain('aria-label="Reported confidence: Supplied first option"'); expect(html).toContain('aria-valuetext="0%"');
    const selected = render(<OptionSelector {...options} selectedOptionId={first.id} />); expect(selected.match(/<meter\b/g)).toHaveLength(2);
  });
  it("OR-UI10 preserves reported scores including zero negatives and absence independently of confidence", () => {
    const entries: RankedOption[] = [{ ...first, rank: 7, score: 0, scoreLabel: "<b>Authored score</b>" }, { ...second, rank: 2 },
      { ...second, id: "negative", label: "Negative score", rank: 7, score: -1000000000000, confidence: 1 }];
    const html = render(<RankingList {...ranking} list={{ ...ranking.list, entries }} />);
    expect(html).toContain("Reported score: 0"); expect(html).toContain("Reported score: Not supplied"); expect(html).toContain("Reported score: -1000000000000");
    expect(html).toContain("Score label: &lt;b&gt;Authored score&lt;/b&gt;"); expect(html).not.toContain("<b>"); expect(html).toContain("Reported confidence: 100%");
    expect(html.match(/<meter\b/g)).toHaveLength(2); expect(html).not.toContain("winner");
  });
  it("OR-UI11 preserves supplied entry order tied ranks gaps and inconsistent rank score combinations", () => {
    const entries: RankedOption[] = [{ ...first, label: "Supplied first in array", rank: 7, score: -8 },
      { ...second, label: "Supplied second in array", rank: 2, score: 100 }, { ...second, id: "tie", label: "Supplied tied rank", rank: 7, score: 999 }];
    const html = render(<RankingList {...ranking} list={{ ...ranking.list, entries }} />);
    const labels = [...html.matchAll(/aria-label="Inspect ranked option: ([^"]+)"/g)].map(match => match[1]);
    expect(labels).toEqual(entries.map(entry => entry.label)); expect(html.match(/Reported rank: 7/g)).toHaveLength(2); expect(html).toContain("Reported rank: 2");
    expect(html).toContain("not recommendations or authorization");
  });
  it("OR-UI12 renders the full fifty-option and one-hundred-entry collection without clipping", () => {
    const choices = Array.from({ length: 50 }, (_, index) => ({ id: `option-${index}`, revision: "one", label: `Supplied option ${index}`, value: index % 2 ? [] : null }));
    const entries = Array.from({ length: 100 }, (_, index) => ({ id: `entry-${index}`, revision: "one", label: `Supplied entry ${index}`, value: index, rank: 1000000 - index }));
    const choice = render(<OptionSelector {...options} group={{ ...options.group, options: choices }} />), ranked = render(<RankingList {...ranking} list={{ ...ranking.list, entries }} />);
    expect([...choice.matchAll(/aria-label="Select option:/g)]).toHaveLength(50); expect(choice).toContain("Supplied option 49");
    expect([...ranked.matchAll(/aria-label="Inspect ranked option:/g)]).toHaveLength(100); expect(ranked).toContain("Supplied entry 99"); expect(ranked).toContain("Reported rank: 1000000");
  });
  it("OR-UI13 renders each explicit non-ready state without stale payload or action controls", () => {
    for (const state of ["loading", "empty", "error"] as const) {
      const common = { id: "reported", revision: "one", title: "Reported options", state, message: `Authored ${state} message` };
      for (const html of [render(<OptionSelector {...common} />), render(<RankingList {...common} />)]) {
        expect(html).toContain(common.message); expect(html).not.toContain("Supplied first option"); expect(html).not.toContain("<pre"); expect(html).not.toContain("<button");
        expect(html).toContain(state === "error" ? 'role="alert"' : 'role="status"');
      }
    }
  });
  it("OR-UI14 keeps ready empty ranking distinct from empty roots and refuses ready empty options", () => {
    const ready = render(<RankingList {...ranking} list={{ ...ranking.list, entries: [] }} />);
    expect(ready).toContain("Supplied ranking list"); expect(ready).toContain("No ranked options were supplied."); expect(ready).toContain("No ranked option is selected.");
    const empty = render(<RankingList id="empty" revision="one" title="Empty ranking" state="empty" />);
    expect(empty).toContain("No ranking list was supplied."); expect(empty).not.toContain("No ranked options were supplied.");
    const invalid = render(<OptionSelector {...options} group={{ ...options.group, options: [] }} />);
    expect(invalid).toContain("Option selection data is invalid"); expect(invalid).not.toContain("<button");
  });
  it("OR-UI15 leaves local and callback-enabled controlled reading available during external busy without automatic requests", () => {
    let calls = 0; const receive = () => { calls++; throw new Error("SSR must never invoke a consumer"); };
    for (const html of [render(<OptionSelector {...options} busy onAction={receive} />), render(<RankingList {...ranking} selectedEntryId={first.id} busy onAction={receive} />)]) {
      expect(button(html, html.includes("Inspect ranked option:") ? "Inspect ranked option: Supplied first option" : "Select option: Supplied first option")).not.toContain("disabled");
      expect(html).toContain("Working…"); expect(html).not.toContain("Confirm"); expect(html).not.toContain("Approve");
    }
    expect(calls).toBe(0);
  });
  it("OR-UI16 keeps selected evidence absence explicit and uses one labelled tabbable value body", () => {
    const html = render(<RankingList {...ranking} list={{ ...ranking.list, entries: [{ ...second, rank: 5, evidence: [] }] }} selectedEntryId={second.id} />);
    expect(html).toContain('role="region" aria-label="Complete ranked option value and evidence: Supplied second option" tabindex="0"');
    expect(html).toContain("Private sibling value"); expect(html).toContain("No evidence was supplied."); expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).not.toMatch(/<pre[^>]*tabindex/); expect(html).toContain("Reported rank: 5");
  });
  it("OR-UI17 initializes local state to none and keeps equal-valued members distinct by identity", () => {
    for (const data of [parsedOptions(), parsedRanking()]) {
      const member = firstMember(data), equal = { ...member, id: "equal", label: "Equal supplied value" };
      const next = withMembers(data, [member, equal]); const state = reconcileOptionRankingSelection(next);
      expect(state.localId).toBeNull(); expect(state.selectedId).toBeNull(); expect(state.memberKey).toBeUndefined();
      expect(optionRankingIntent(next, member.id)).not.toEqual(optionRankingIntent(next, equal.id));
    }
  });
  it("OR-UI18 preserves exact local selection state across unrelated append and reorder", () => {
    for (const data of [parsedOptions(), parsedRanking()]) {
      const state = selected(data), members = membersOf(data), one = firstMember(data), two = members[1]; if (!two) throw new Error("Authored second member required");
      const next = withMembers(data, [two, { ...two, id: "appendix", label: "Additional supplied option" }, one]);
      expect(reconcileOptionRankingSelection(data, state)).toBe(state); expect(reconcileOptionRankingSelection(next, state)).toBe(state);
    }
  });
  it("OR-UI19 preserves a local selection when a different current member meaningfully changes", () => {
    for (const data of [parsedOptions(), parsedRanking()]) {
      const members = membersOf(data), two = members[1]; if (!two) throw new Error("Authored second member required");
      const next = withMembers(data, [firstMember(data), { ...two, revision: "new", label: "Unrelated replacement", value: false, confidence: 1 }]);
      const state = selected(data); expect(reconcileOptionRankingSelection(next, state)).toBe(state);
    }
  });
  it("OR-UI20 clears private selection for every meaningful current value evidence confidence or ranking replacement", () => {
    for (const data of [parsedOptions(), parsedRanking()]) {
      const member = firstMember(data), { confidence: _confidence, ...withoutConfidence } = member;
      const replacements: Member[] = [{ ...member, revision: "new" }, { ...member, label: "New label" }, { ...member, value: false }, withoutConfidence,
        { ...member, evidence: [{ id: "new", label: "Replacement evidence" }] }];
      if ("rank" in member) replacements.push({ ...member, rank: 8 }, { ...member, score: 1 }, { ...member, scoreLabel: "Replacement score attribution" });
      for (const replacement of replacements) {
        const next = reconcileOptionRankingSelection(withMembers(data, [replacement, ...membersOf(data).slice(1)]), selected(data));
        expect(next.localId).toBeNull(); expect(next.selectedId).toBeNull(); expect(next.memberKey).toBeUndefined();
      }
    }
  });
  it("OR-UI21 clears removed local members without selecting an equal-valued substitute", () => {
    for (const data of [parsedOptions(), parsedRanking()]) {
      const member = firstMember(data), next = withMembers(data, [{ ...member, id: "equal", label: "Equal substitute" }]);
      expect(reconcileOptionRankingSelection(next, selected(data)).selectedId).toBeNull();
    }
  });
  it("OR-UI22 resets private selection for each component or group list identity replacement", () => {
    for (const data of [parsedOptions(), parsedRanking()]) {
      const replacements: Ready[] = [{ ...data, id: "replacement-component" }, { ...data, revision: "replacement-component-revision" },
        ...("group" in data ? [{ ...data, group: { ...data.group, id: "replacement-group" } }, { ...data, group: { ...data.group, revision: "replacement-group-revision" } }]
          : [{ ...data, list: { ...data.list, id: "replacement-list" } }, { ...data, list: { ...data.list, revision: "replacement-list-revision" } }])];
      for (const next of replacements) { const state = reconcileOptionRankingSelection(next, selected(data)); expect(state.localId).toBeNull(); expect(state.selectedId).toBeNull(); }
    }
  });
  it("OR-UI23 preserves local selection across equivalent nested JSON object-key order", () => {
    for (const data of [parsedOptions(), parsedRanking()]) {
      const member = firstMember(data), original = withMembers(data, [{ ...member, value: { first: 0, nested: { enabled: false, next: null }, items: [0, ""] } }]);
      const equivalent = withMembers(data, [{ ...member, value: { items: [0, ""], nested: { next: null, enabled: false }, first: 0 } }]);
      const state = selected(original); expect(reconcileOptionRankingSelection(equivalent, state)).toBe(state);
    }
  });
  it("OR-UI24 preserves producer-controlled truth including null and meaningful selected-member replacement", () => {
    const choice = parsedOptions({ ...options, selectedOptionId: first.id });
    expect(reconcileOptionRankingSelection(choice).selectedId).toBe(first.id);
    const changed = parsedOptions({ ...choice, group: { ...choice.group, options: [{ ...first, revision: "current", value: "Current replacement" }] } });
    expect(reconcileOptionRankingSelection(changed, selected(choice)).selectedId).toBe(first.id);
    expect(reconcileOptionRankingSelection(parsedOptions({ ...options, selectedOptionId: null }), selected(choice)).selectedId).toBeNull();
    const ranked = parsedRanking({ ...ranking, selectedEntryId: second.id }), rankedState = reconcileOptionRankingSelection(ranked);
    expect(rankedState.selectedId).toBe(second.id);
    expect(reconcileOptionRankingSelection(parsedRanking({ ...ranking, selectedEntryId: null }), rankedState).selectedId).toBeNull();
  });
  it("OR-UI25 emits only exact current option and ranked-entry identity fields", () => {
    expect(optionRankingIntent(parsedOptions(), first.id)).toEqual({ type: "select-option", data: { componentId: options.id, componentRevision: options.revision,
      groupId: options.group.id, groupRevision: options.group.revision, optionId: first.id, optionRevision: first.revision } });
    expect(optionRankingIntent(parsedRanking(), first.id)).toEqual({ type: "inspect-ranked-option", data: { componentId: ranking.id, componentRevision: ranking.revision,
      listId: ranking.list.id, listRevision: ranking.list.revision, entryId: first.id, entryRevision: first.revision } });
  });
  it("OR-UI26 keeps clear intents owner-scoped and refuses stale requested member identities", () => {
    expect(optionRankingIntent(parsedOptions(), null)).toEqual({ type: "clear-option", data: { componentId: options.id, componentRevision: options.revision, groupId: options.group.id, groupRevision: options.group.revision } });
    expect(optionRankingIntent(parsedRanking(), null)).toEqual({ type: "clear-ranked-option", data: { componentId: ranking.id, componentRevision: ranking.revision, listId: ranking.list.id, listRevision: ranking.list.revision } });
    for (const data of [parsedOptions(), parsedRanking()]) expect(optionRankingIntent(data, "unknown-member")).toBeUndefined();
  });
  it("OR-UI27 scopes a requested member before controlled acknowledgement and fences its replacement or removal", () => {
    for (const data of [parsedOptions({ ...options, selectedOptionId: null }), parsedRanking({ ...ranking, selectedEntryId: null })]) {
      const member = firstMember(data), scope = optionRankingNotificationScope(data, null, member.id, true);
      expect(optionRankingNotificationScope(withMembers(data, [{ ...member, revision: "new", value: "Requested replacement" }]), null, member.id, true)).not.toBe(scope);
      const other = membersOf(data)[1]; if (!other) throw new Error("Authored second member required");
      expect(optionRankingNotificationScope(withMembers(data, [other]), null, member.id, true)).not.toBe(scope);
    }
  });
  it("OR-UI28 leaves current notification scope unchanged for unrelated content append and reorder", () => {
    for (const data of [parsedOptions(), parsedRanking()]) {
      const member = firstMember(data), other = membersOf(data)[1]; if (!other) throw new Error("Authored second member required");
      const scope = optionRankingNotificationScope(data, member.id, member.id, true);
      const next = withMembers(data, [{ ...other, revision: "new", value: "Unrelated content" }, { ...other, id: "appendix" }, member]);
      expect(optionRankingNotificationScope(next, member.id, member.id, true)).toBe(scope);
      expect(optionRankingNotificationScope({ ...next, title: "Changed heading", description: "Changed explanation" }, member.id, member.id, true)).toBe(scope);
    }
  });
  it("OR-UI29 scopes feedback to current ownership callback availability selection and component identity", () => {
    for (const data of [parsedOptions(), parsedRanking()]) {
      const member = firstMember(data), scope = optionRankingNotificationScope(data, member.id, member.id, true);
      expect(optionRankingNotificationScope(data, member.id, member.id, false)).not.toBe(scope);
      expect(optionRankingNotificationScope(data, null, member.id, true)).not.toBe(scope);
      expect(optionRankingNotificationScope({ ...data, revision: "new" }, member.id, member.id, true)).not.toBe(scope);
      const controlled = "group" in data ? parsedOptions({ ...data, selectedOptionId: member.id }) : parsedRanking({ ...data, selectedEntryId: member.id });
      expect(optionRankingNotificationScope(controlled, member.id, member.id, true)).not.toBe(scope);
    }
  });
  it("OR-UI30 refuses unsafe evidence stale selection and undeclared root fields without stale output", () => {
    const unsafe = { ...first, evidence: [{ id: "unsafe", label: "Unsafe supplied link", url: "javascript:never()" }] };
    const choice = render(<OptionSelector {...options} group={{ ...options.group, options: [unsafe] }} selectedOptionId={first.id} />);
    const stale = render(<RankingList {...ranking} selectedEntryId="unknown-member" />);
    const unknown = { ...ranking, undeclared: "Never render" } as RankingListData;
    for (const html of [choice, stale, render(<RankingList {...unknown} />)]) {
      expect(html).toContain('role="alert"'); expect(html).toContain("is invalid"); expect(html).not.toContain("Final supplied value");
      expect(html).not.toContain("javascript:"); expect(html).not.toContain("<button"); expect(html).not.toContain("Never render");
    }
  });
});

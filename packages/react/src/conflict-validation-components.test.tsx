import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ConflictResolverSchema, ValidationSummarySchema, stableReviewKey,
  type ConflictResolverData, type ParsedConflictResolverData, type ValidationSummaryData, type ParsedValidationSummaryData,
  type InspectionField, type ValidationIssue,
} from "@mcpcn/schemas";
import {
  ConflictResolver, ValidationSummary, reconcileConflictValidationSelection, conflictValidationNotificationScope,
  conflictValidationConfirmationScope, conflictValidationIntent, canConfirmConflictChoice, type ConflictValidationSelectionState,
} from "./conflict-validation-components.js";
import { GenericAgentComponent, ConflictResolver as PublicConflictResolver, ValidationSummary as PublicValidationSummary } from "./index.js";

const evidence = [{ id: "source-one", label: "Supplied source", text: "Complete supplied <em>excerpt</em>. END-SUPPLIED-EVIDENCE", url: "https://example.invalid/supplied-choice" }];
const candidate: InspectionField = { id: "candidate-a", revision: "candidate-one", label: "Imported candidate", confidence: 0,
  value: { confirmed: false, count: 0, next: null, empty: "", items: [false, 0, null, "", { literal: "<script>not executed</script>", end: "END-CANDIDATE-JSON" }] }, evidence };
const alternative: InspectionField = { id: "candidate-b", revision: "candidate-two", label: "Existing candidate", value: "Complete alternative value", evidence: [] };
const issue: ValidationIssue = { id: "issue-a", revision: "issue-one", label: "Supplied error", severity: "error",
  message: "Complete supplied failure <em>kept as text</em>. END-ISSUE-MESSAGE", context: { approved: false, count: 0, next: null }, evidence };
const information: ValidationIssue = { id: "issue-b", revision: "issue-two", label: "Supplied information", severity: "info", message: "The consumer supplied information.", evidence: [] };
const conflict: ConflictResolverData = { id: "resolver", revision: "root-one", title: "Review supplied alternatives", state: "ready",
  conflict: { id: "conflict-one", revision: "conflict-revision", label: "Imported record conflict", candidates: [candidate, alternative] } };
const validation: ValidationSummaryData = { id: "validation", revision: "root-two", title: "Review reported validation", state: "ready",
  report: { id: "report-one", revision: "report-revision", label: "Supplied validation report", reportedStatus: "valid", issues: [issue, information] } };
type ReadyConflict = Extract<ParsedConflictResolverData, { state: "ready" }>;
type ReadySummary = Extract<ParsedValidationSummaryData, { state: "ready" }>;
type Ready = ReadyConflict | ReadySummary;
const render = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);
const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#x27;");
const callback = () => undefined;
function parsedConflict(value: ConflictResolverData = conflict): ReadyConflict {
  const data = ConflictResolverSchema.parse(value); if (data.state !== "ready") throw new Error("Expected authored ready conflict"); return data;
}
function parsedValidation(value: ValidationSummaryData = validation): ReadySummary {
  const data = ValidationSummarySchema.parse(value); if (data.state !== "ready") throw new Error("Expected authored ready report"); return data;
}
const membersOf = (data: Ready) => "conflict" in data ? data.conflict.candidates : data.report.issues;
function withMembers(data: Ready, members: Array<InspectionField | ValidationIssue>): Ready {
  return "conflict" in data ? parsedConflict({ ...data, conflict: { ...data.conflict, candidates: members as InspectionField[] } })
    : parsedValidation({ ...data, report: { ...data.report, issues: members as ValidationIssue[] } });
}
function selected(data: Ready, id = membersOf(data)[0]!.id): ConflictValidationSelectionState {
  const member = membersOf(data).find(item => item.id === id); if (!member) throw new Error("Expected current fixture member");
  return { ...reconcileConflictValidationSelection(data), localId: id, selectedId: id, memberKey: stableReviewKey(member) };
}
function button(html: string, label: string) {
  const node = [...html.matchAll(/<button\b([^>]*)>/g)].find(match => match[1]?.includes(`aria-label="${label}"`));
  expect(node, `Expected native button ${label}`).toBeDefined(); return node?.[1] ?? "";
}
function textButton(html: string, label: string) {
  const node = [...html.matchAll(/<button\b([^>]*)>([^<]+)<\/button>/g)].find(match => match[2] === label);
  expect(node, `Expected native button ${label}`).toBeDefined(); return node?.[1] ?? "";
}

describe("supplied conflict choice and validation report components", () => {
  it("CV-UI01 exports dedicated public components and renders labelled regions with caller UI status", () => {
    expect(PublicConflictResolver).toBe(ConflictResolver); expect(PublicValidationSummary).toBe(ValidationSummary);
    expect(ConflictResolver).not.toBe(GenericAgentComponent); expect(ValidationSummary).not.toBe(GenericAgentComponent);
    for (const html of [render(<ConflictResolver {...conflict} className="authored-review" busy error="Supplied UI feedback" />),
      render(<ValidationSummary {...validation} className="authored-review" busy error="Supplied UI feedback" />)]) {
      expect(html).toMatch(/^<section\b/); expect(html).toContain('role="region"'); expect(html).toContain('aria-busy="true"');
      expect(html).toContain("authored-review"); expect(html).toContain("Supplied UI feedback"); expect(html).not.toContain("is invalid");
    }
  });
  it("CV-UI02 refuses outer DTO accessors without reading them or exposing private values", () => {
    let reads = 0;
    const badConflict = Object.defineProperty({ ...conflict }, "conflict", { enumerable: true, get() { reads++; return "Never read"; } });
    const badValidation = Object.defineProperty({ ...validation }, "report", { enumerable: true, get() { reads++; return "Never read"; } });
    for (const html of [render(ConflictResolver(badConflict)), render(ValidationSummary(badValidation))]) {
      expect(html).toContain('role="alert"'); expect(html).toContain("is invalid"); expect(html).not.toContain("END-CANDIDATE-JSON");
      expect(html).not.toContain("END-ISSUE-MESSAGE"); expect(html).not.toContain("<button");
    }
    expect(reads).toBe(0);
  });
  it("CV-UI03 starts local selection at none without complete candidate or issue disclosure or notification", () => {
    let calls = 0;
    const html = render(<ConflictResolver {...conflict} onAction={() => { calls++; }} />), summary = render(<ValidationSummary {...validation} onAction={() => { calls++; }} />);
    expect(button(html, "Select candidate: Imported candidate")).toContain('aria-pressed="false"');
    expect(button(summary, "Inspect issue: Supplied error")).toContain('aria-pressed="false"');
    expect(html).toContain("No candidate is selected."); expect(summary).toContain("No validation issue is selected.");
    for (const value of [html, summary]) { expect(value).not.toContain("<pre"); expect(textButton(value, "Clear selection")).toContain("disabled"); }
    expect(textButton(html, "Confirm choice")).toContain("disabled"); expect(calls).toBe(0);
  });
  it("CV-UI04 preserves explicit controlled none while enabling only selection requests with a callback", () => {
    const html = render(<ConflictResolver {...conflict} selectedCandidateId={null} onAction={callback} />);
    const summary = render(<ValidationSummary {...validation} selectedIssueId={null} onAction={callback} />);
    expect(button(html, "Select candidate: Imported candidate")).not.toContain("disabled"); expect(textButton(html, "Confirm choice")).toContain("disabled");
    expect(button(summary, "Inspect issue: Supplied error")).not.toContain("disabled");
    expect(html).not.toContain("END-CANDIDATE-JSON"); expect(summary).not.toContain("END-ISSUE-MESSAGE");
  });
  it("CV-UI05 keeps controlled content readable without callbacks and disables controlled requests and confirmation", () => {
    const html = render(<ConflictResolver {...conflict} selectedCandidateId={candidate.id} />);
    const summary = render(<ValidationSummary {...validation} selectedIssueId={issue.id} />);
    expect(html).toContain("END-CANDIDATE-JSON"); expect(summary).toContain("END-ISSUE-MESSAGE");
    expect(button(html, "Select candidate: Imported candidate")).toContain('aria-pressed="true"');
    expect(button(summary, "Inspect issue: Supplied error")).toContain("disabled");
    for (const value of [html,summary]) expect(textButton(value, "Clear selection")).toContain("disabled");
    expect(textButton(html, "Confirm choice")).toContain("disabled");
  });
  it("CV-UI06 leaves local reading controls enabled during external busy while blocking explicit confirmation", () => {
    const html = render(<ConflictResolver {...conflict} busy onAction={callback} />), summary = render(<ValidationSummary {...validation} busy />);
    expect(button(html,"Select candidate: Imported candidate")).not.toContain("disabled");
    expect(button(summary,"Inspect issue: Supplied error")).not.toContain("disabled");
    expect(textButton(html,"Confirm choice")).toContain("disabled"); expect(html).toContain("Working…");
    const chosen = render(<ConflictResolver {...conflict} selectedCandidateId={candidate.id} busy onAction={callback} />);
    expect(textButton(chosen,"Confirm choice")).toContain("disabled"); expect(button(chosen,"Select candidate: Existing candidate")).not.toContain("disabled");
  });
  it("CV-UI07 renders complete nested candidate JSON and evidence as escaped text in one tabbable body", () => {
    const html = render(<ConflictResolver {...conflict} selectedCandidateId={candidate.id} onAction={callback} />);
    expect(html).toContain('aria-label="Complete candidate value and evidence: Imported candidate" tabindex="0"');
    expect(html).toContain('aria-label="Complete candidate JSON"'); expect(html).toContain(escape(JSON.stringify(candidate.value,null,2)));
    expect(html).toContain(escape(evidence[0]!.text)); expect(html).not.toContain("<script>not executed</script>"); expect(html).not.toContain("<em>excerpt</em>");
    expect(html).toContain('href="https://example.invalid/supplied-choice" target="_blank" rel="noopener noreferrer"'); expect(html).toMatch(/referrerpolicy="no-referrer"/i);
    expect(textButton(html,"Confirm choice")).not.toContain("disabled"); expect(html).toContain("It does not resolve or save the conflict.");
  });
  it("CV-UI08 preserves every falsy and structured candidate primitive as its full JSON representation", () => {
    for (const value of [null,false,0,"",[],{}]) {
      const data = parsedConflict(); data.conflict.candidates[0]!.value = value;
      const html = render(<ConflictResolver {...data} selectedCandidateId={candidate.id} onAction={callback} />);
      expect(html).toContain(`<pre class="mcpcn-code" aria-label="Complete candidate JSON">${escape(JSON.stringify(value,null,2))}</pre>`);
      expect(button(html,"Select candidate: Imported candidate")).toContain('aria-pressed="true"');
    }
  });
  it("CV-UI09 distinguishes native zero confidence from absence without inventing a confidence meter", () => {
    const html = render(<ConflictResolver {...conflict} selectedCandidateId={candidate.id} onAction={callback} />);
    const meters = html.match(/<meter\b[^>]*>/g) ?? [];
    expect(meters).toHaveLength(2); expect(meters.every(meter => meter.includes('min="0" max="1" value="0"') && meter.includes('aria-valuetext="0%"'))).toBe(true);
    expect(html).toContain("Reported confidence: 0%"); expect(html).toContain("Reported confidence: Not supplied");
    expect(html).not.toContain('aria-label="Reported confidence: Existing candidate"');
  });
  it("CV-UI10 displays supplied valid status alongside error severity without correcting either claim", () => {
    const html = render(<ValidationSummary {...validation} selectedIssueId={issue.id} />);
    expect(html).toContain('Reported validation: <strong>valid</strong>'); expect(html).toContain('Reported severity: <strong>error</strong>');
    expect(html).toContain("Reported validation is independent of supplied issue count and severity.");
    expect(html).not.toContain("<meter"); expect(html).not.toContain("Confirm choice");
  });
  it("CV-UI11 keeps all reported statuses unchanged when the supplied issue list is empty", () => {
    for (const reportedStatus of ["unknown","pending","valid","invalid"] as const) {
      const data = parsedValidation(); data.report = { ...data.report, reportedStatus, issues: [] };
      const html = render(<ValidationSummary {...data} />);
      expect(html).toContain(`Reported validation: <strong>${reportedStatus}</strong>`); expect(html).toContain("No validation issues were supplied.");
      expect(html).not.toContain('aria-label="Inspect issue:'); expect(html).not.toContain("<pre"); expect(html).not.toContain("All issues passed");
    }
  });
  it("CV-UI12 renders the full long issue message and complete escaped context and evidence", () => {
    const data = parsedValidation(), message = "BEGIN-ISSUE " + "Complete message. ".repeat(180) + "END-ISSUE-MESSAGE";
    data.report.issues[0] = { ...data.report.issues[0]!, message, context: { text: "<script>never executed</script>", last: "END-CONTEXT" } };
    const html = render(<ValidationSummary {...data} selectedIssueId={issue.id} />);
    expect(html).toContain('aria-label="Complete validation issue: Supplied error" tabindex="0"');
    expect(html).toContain(message); expect(html).toContain(escape(JSON.stringify(data.report.issues[0]!.context,null,2)));
    expect(html).toContain("END-CONTEXT"); expect(html).toContain("END-SUPPLIED-EVIDENCE"); expect(html).not.toContain("<script>never executed</script>");
  });
  it("CV-UI13 distinguishes omitted issue context from null false zero empty string and empty structures", () => {
    const base = parsedValidation(), { context: _context, ...without } = base.report.issues[0]!;
    const absent = render(<ValidationSummary {...base} report={{ ...base.report, issues: [without] }} selectedIssueId={issue.id} />);
    expect(absent).toContain("No context was supplied."); expect(absent).not.toContain('aria-label="Complete issue context"');
    for (const context of [null,false,0,"",[],{}]) {
      const html = render(<ValidationSummary {...base} report={{ ...base.report, issues: [{ ...without, context }] }} selectedIssueId={issue.id} />);
      expect(html).not.toContain("No context was supplied."); expect(html).toContain(`<pre class="mcpcn-code" aria-label="Complete issue context">${escape(JSON.stringify(context,null,2))}</pre>`);
    }
  });
  it("CV-UI14 renders explicit nonready states without candidate issue or confirmation controls", () => {
    for (const state of ["loading","empty","error"] as const) {
      const common = { id:"state-root",revision:"one",title:"Supplied state" };
      const data: ConflictResolverData & ValidationSummaryData = state === "error" ? { ...common,state,message:"Supplied failure <em>text</em>." } : { ...common,state };
      for (const html of [render(<ConflictResolver {...data} />),render(<ValidationSummary {...data} />)]) {
        expect(html).not.toContain("<button"); expect(html).not.toContain("<pre"); expect(html).not.toContain("END-SUPPLIED-EVIDENCE");
        if (state === "error") { expect(html).toContain('role="alert"'); expect(html).toContain("Supplied failure &lt;em&gt;text&lt;/em&gt;."); }
      }
    }
  });
  it("CV-UI15 refuses foreign selections duplicate identities and unsupported properties without leaking content", () => {
    const badConflict = { ...conflict, selectedCandidateId:"foreign" } as ConflictResolverData;
    const data = parsedValidation(), badReport = { ...data, report:{ ...data.report, issues:[data.report.issues[0]!,data.report.issues[0]!] } };
    const unsupported = { ...validation, executeTool:"not allowed" } as unknown as ValidationSummaryData;
    for (const html of [render(<ConflictResolver {...badConflict} />),render(<ValidationSummary {...badReport} />),render(<ValidationSummary {...unsupported} />)]) {
      expect(html).toContain("is invalid"); expect(html).not.toContain("END-CANDIDATE-JSON"); expect(html).not.toContain("END-ISSUE-MESSAGE"); expect(html).not.toContain("<a ");
    }
  });
  it("CV-UI16 explicitly reports absent evidence without borrowing evidence from another member", () => {
    const html = render(<ConflictResolver {...conflict} selectedCandidateId={alternative.id} onAction={callback} />);
    const summary = render(<ValidationSummary {...validation} selectedIssueId={information.id} />);
    for (const value of [html,summary]) { expect(value).toContain("No evidence was supplied."); expect(value).not.toContain("END-SUPPLIED-EVIDENCE"); expect(value).not.toContain("<a "); }
  });
  it("CV-UI17 permits equal candidate values while selecting only the supplied current identity", () => {
    const data = parsedConflict(); data.conflict.candidates[1] = { ...data.conflict.candidates[1]!, value: data.conflict.candidates[0]!.value };
    let calls = 0; const html = render(<ConflictResolver {...data} selectedCandidateId={alternative.id} onAction={() => { calls++; }} />);
    expect(button(html,"Select candidate: Imported candidate")).toContain('aria-pressed="false"');
    expect(button(html,"Select candidate: Existing candidate")).toContain('aria-pressed="true"');
    expect(html).toContain("END-CANDIDATE-JSON"); expect(textButton(html,"Confirm choice")).not.toContain("disabled"); expect(calls).toBe(0);
  });
  it("CV-UI18 reconciles initial omitted null and current controlled selection without a default winner", () => {
    for (const data of [parsedConflict(),parsedValidation()]) {
      expect(reconcileConflictValidationSelection(data).selectedId).toBeNull();
      const controlled = "conflict" in data ? { ...data,selectedCandidateId:membersOf(data)[0]!.id } : { ...data,selectedIssueId:membersOf(data)[0]!.id };
      expect(reconcileConflictValidationSelection(controlled).selectedId).toBe(membersOf(data)[0]!.id);
      const none = "conflict" in data ? { ...data,selectedCandidateId:null } : { ...data,selectedIssueId:null };
      expect(reconcileConflictValidationSelection(none).selectedId).toBeNull();
    }
  });
  it("CV-UI19 preserves the exact local selection state across unrelated append reorder and other-member changes", () => {
    for (const data of [parsedConflict(),parsedValidation()]) {
      const state = selected(data), members = membersOf(data), appended = "conflict" in data ? { ...alternative,id:"third",label:"Third candidate" } : { ...information,id:"third",label:"Third issue" };
      const changed = withMembers(data,[{ ...members[1]!,label:"Unrelated relabelled member" },appended,members[0]!]);
      expect(reconcileConflictValidationSelection(data,state)).toBe(state); expect(reconcileConflictValidationSelection(changed,state)).toBe(state);
    }
  });
  it("CV-UI20 clears local candidate choice for every meaningful selected candidate replacement", () => {
    const data = parsedConflict(), state = selected(data);
    const replacements: InspectionField[] = [{ ...candidate,revision:"new" },{ ...candidate,label:"Replacement candidate" },{ ...candidate,value:false },
      { ...candidate,confidence:undefined },{ ...candidate,evidence:[{ id:"different",label:"Different evidence" }] }];
    for (const member of replacements) {
      const next = reconcileConflictValidationSelection(withMembers(data,[member,alternative]),state);
      expect(next.localId).toBeNull(); expect(next.selectedId).toBeNull(); expect(next.memberKey).toBeUndefined();
    }
  });
  it("CV-UI21 clears local issue choice for severity message context evidence identity or label replacement", () => {
    const data = parsedValidation(), state = selected(data), { context: _context,...absent } = issue;
    const replacements: ValidationIssue[] = [{ ...issue,severity:"warning" },{ ...issue,message:"Replacement full message" },{ ...issue,context:null },absent,
      { ...issue,revision:"new" },{ ...issue,label:"New issue label" },{ ...issue,evidence:[] }];
    for (const member of replacements) expect(reconcileConflictValidationSelection(withMembers(data,[member,information]),state).selectedId).toBeNull();
  });
  it("CV-UI22 clears local selection when its candidate or issue is removed", () => {
    const data = parsedConflict(), expanded = withMembers(data,[candidate,alternative,{ ...alternative,id:"third" }]);
    expect(reconcileConflictValidationSelection(withMembers(expanded,[alternative,{ ...alternative,id:"third" }]),selected(expanded)).selectedId).toBeNull();
    const summary = parsedValidation(); expect(reconcileConflictValidationSelection(withMembers(summary,[information]),selected(summary)).selectedId).toBeNull();
  });
  it("CV-UI23 clears local selection for component identity or revision replacement while preserving a title edit", () => {
    for (const data of [parsedConflict(),parsedValidation()]) {
      const state = selected(data);
      for (const change of [{ id:"new-root" },{ revision:"new-root-revision" }]) expect(reconcileConflictValidationSelection({ ...data,...change },state).selectedId).toBeNull();
      expect(reconcileConflictValidationSelection({ ...data,title:"Updated visible title" },state)).toBe(state);
    }
  });
  it("CV-UI24 scopes selection to conflict or report identity but preserves unrelated labels and reported status", () => {
    const data = parsedConflict(), summary = parsedValidation(), candidateState = selected(data), issueState = selected(summary);
    for (const change of [{ id:"new-scope" },{ revision:"new-scope-revision" }]) {
      expect(reconcileConflictValidationSelection({ ...data,conflict:{ ...data.conflict,...change } },candidateState).selectedId).toBeNull();
      expect(reconcileConflictValidationSelection({ ...summary,report:{ ...summary.report,...change } },issueState).selectedId).toBeNull();
    }
    expect(reconcileConflictValidationSelection({ ...data,conflict:{ ...data.conflict,label:"Relabelled conflict" } },candidateState)).toBe(candidateState);
    expect(reconcileConflictValidationSelection({ ...summary,report:{ ...summary.report,label:"Relabelled report",reportedStatus:"invalid" } },issueState)).toBe(issueState);
  });
  it("CV-UI25 retains current controlled selection as producer truth after a meaningful member replacement", () => {
    const data = parsedConflict(), summary = parsedValidation();
    const controlled = { ...data,selectedCandidateId:candidate.id }, controlledSummary = { ...summary,selectedIssueId:issue.id };
    const replaced = withMembers(controlled,[{ ...candidate,revision:"new",value:0 },alternative]);
    const replacedSummary = withMembers(controlledSummary,[{ ...issue,revision:"new",severity:"warning" },information]);
    expect(reconcileConflictValidationSelection(replaced,selected(controlled)).selectedId).toBe(candidate.id);
    expect(reconcileConflictValidationSelection(replacedSummary,selected(controlledSummary)).selectedId).toBe(issue.id);
    expect(reconcileConflictValidationSelection(replaced,selected(controlled)).localId).toBeNull();
  });
  it("CV-UI26 preserves semantic JSON property-order changes in selected candidate values and issue context", () => {
    const first = { alpha:1,nested:{ zero:0,no:false } }, second = { nested:{ no:false,zero:0 },alpha:1 };
    const data = withMembers(parsedConflict(),[{ ...candidate,value:first },alternative]), summary = withMembers(parsedValidation(),[{ ...issue,context:first },information]);
    const candidateState = selected(data); expect(reconcileConflictValidationSelection(withMembers(data,[{ ...candidate,value:second },alternative]),candidateState)).toBe(candidateState);
    const state = selected(summary); expect(reconcileConflictValidationSelection(withMembers(summary,[{ ...issue,context:second },information]),state)).toBe(state);
  });
  it("CV-UI27 preserves notification scope through append reorder and unrelated member replacement", () => {
    for (const data of [parsedConflict(),parsedValidation()]) {
      const members = membersOf(data), current = members[0]!.id, scope = conflictValidationNotificationScope(data,current,current,true);
      const changed = withMembers(data,[{ ...members[1]!,label:"Changed unrelated label" },members[0]!]);
      expect(conflictValidationNotificationScope(changed,current,current,true)).toBe(scope);
      expect(conflictValidationNotificationScope(withMembers(changed,[...membersOf(changed),{ ...members[1]!,id:"third" }]),current,current,true)).toBe(scope);
    }
  });
  it("CV-UI28 fences notification feedback on selection callback ownership and component or parent replacement", () => {
    for (const data of [parsedConflict(),parsedValidation()]) {
      const id = membersOf(data)[0]!.id, scope = conflictValidationNotificationScope(data,id,id,true);
      expect(conflictValidationNotificationScope(data,null,id,true)).not.toBe(scope);
      expect(conflictValidationNotificationScope(data,id,id,false)).not.toBe(scope);
      expect(conflictValidationNotificationScope({ ...data,revision:"new-root" },id,id,true)).not.toBe(scope);
      const controlled = "conflict" in data ? { ...data,selectedCandidateId:id } : { ...data,selectedIssueId:id };
      expect(conflictValidationNotificationScope(controlled,id,id,true)).not.toBe(scope);
      const replaced = "conflict" in data ? { ...data,conflict:{ ...data.conflict,revision:"new-parent" } } : { ...data,report:{ ...data.report,revision:"new-parent" } };
      expect(conflictValidationNotificationScope(replaced,id,id,true)).not.toBe(scope);
    }
  });
  it("CV-UI29 fences an unacknowledged requested candidate or issue while preserving unrelated changes", () => {
    for (const data of [parsedConflict(),parsedValidation()]) {
      const members = membersOf(data), id = members[0]!.id;
      const controlled = "conflict" in data ? { ...data,selectedCandidateId:null } : { ...data,selectedIssueId:null };
      const scope = conflictValidationNotificationScope(controlled,null,id,true);
      expect(conflictValidationNotificationScope(withMembers(controlled,[{ ...members[0]!,revision:"replacement" },members[1]!]),null,id,true)).not.toBe(scope);
      expect(conflictValidationNotificationScope(withMembers(controlled,[members[0]!,{ ...members[1]!,label:"Unrelated label" }]),null,id,true)).toBe(scope);
      expect(conflictValidationNotificationScope(controlled,null,null,true)).not.toBe(scope);
    }
  });
  it("CV-UI30 keeps confirmation scope separate and current while fencing selected candidate replacement and availability", () => {
    const data = parsedConflict(), scope = conflictValidationConfirmationScope(data,candidate.id,true);
    expect(scope).not.toBe(conflictValidationNotificationScope(data,candidate.id,candidate.id,true));
    expect(conflictValidationConfirmationScope(withMembers(data,[candidate,{ ...alternative,value:false }]),candidate.id,true)).toBe(scope);
    expect(conflictValidationConfirmationScope(data,alternative.id,true)).not.toBe(scope); expect(conflictValidationConfirmationScope(data,null,true)).not.toBe(scope);
    expect(conflictValidationConfirmationScope(data,candidate.id,false)).not.toBe(scope);
    expect(conflictValidationConfirmationScope(withMembers(data,[{ ...candidate,confidence:1 },alternative]),candidate.id,true)).not.toBe(scope);
    expect(conflictValidationConfirmationScope({ ...data,conflict:{ ...data.conflict,revision:"replacement" } },candidate.id,true)).not.toBe(scope);
  });
  it("CV-UI31 creates only current identity-scoped selection clear confirmation and inspection intents", () => {
    const data = parsedConflict(), summary = parsedValidation();
    const conflictScope = { componentId:data.id,componentRevision:data.revision,conflictId:data.conflict.id,conflictRevision:data.conflict.revision };
    const reportScope = { componentId:summary.id,componentRevision:summary.revision,reportId:summary.report.id,reportRevision:summary.report.revision };
    expect(conflictValidationIntent(data,candidate.id)).toEqual({ type:"select-conflict-candidate",data:{ ...conflictScope,candidateId:candidate.id,candidateRevision:candidate.revision } });
    expect(conflictValidationIntent(data,candidate.id,true)).toEqual({ type:"confirm-conflict-candidate",data:{ ...conflictScope,candidateId:candidate.id,candidateRevision:candidate.revision } });
    expect(conflictValidationIntent(data,null)).toEqual({ type:"clear-conflict-candidate",data:conflictScope });
    expect(conflictValidationIntent(summary,issue.id)).toEqual({ type:"inspect-validation-issue",data:{ ...reportScope,issueId:issue.id,issueRevision:issue.revision } });
    expect(conflictValidationIntent(summary,null)).toEqual({ type:"clear-validation-issue",data:reportScope });
    expect(conflictValidationIntent(data,"foreign")).toBeUndefined(); expect(conflictValidationIntent(data,null,true)).toBeUndefined(); expect(conflictValidationIntent(summary,issue.id,true)).toBeUndefined();
  });
  it("CV-UI32 permits confirmation only for a current selected candidate with callback and no external busy or pending confirmation", () => {
    const data = parsedConflict(); expect(canConfirmConflictChoice(data,candidate.id,true,false,false)).toBe(true);
    for (const [id,available,busy,pending] of [[null,true,false,false],["foreign",true,false,false],[candidate.id,false,false,false],[candidate.id,true,true,false],[candidate.id,true,false,true]] as const) {
      expect(canConfirmConflictChoice(data,id,available,busy,pending)).toBe(false);
    }
    expect(canConfirmConflictChoice(parsedValidation(),issue.id,true,false,false)).toBe(false);
  });
});

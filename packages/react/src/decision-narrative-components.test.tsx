import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as UI from "./decision-narrative-components.js";
import { decisionNarrativeIntent } from "./decision-narrative-components.js";
import type { ComponentProps } from "./component-types.js";
import { schemaBySlug, type ParsedDecisionNarrativeData } from "@mcpcn/schemas";
import { decisionNarrativeCases, mutableNarrative, narrativeReport } from "../../../tests/fixtures/decision-narratives.js";

describe.each(decisionNarrativeCases)("T2 decision narrative React $slug", row => {
  const View = UI[row.name] as unknown as ComponentType<Record<string, unknown> & Pick<ComponentProps<unknown>, "onAction" | "busy">>;
  const html = (data: Record<string, unknown> = mutableNarrative(row), ui: Pick<ComponentProps<unknown>, "onAction" | "busy"> = {}) => renderToStaticMarkup(createElement(View, { ...data, ...ui }));
  it("DN-UI01 renders its real typed report and full supplied report label", () => {
    const output = html(); expect(output).toContain("Authored decision report"); expect(output).toContain(String(narrativeReport(mutableNarrative(row)).label));
    expect(output).toContain("Complete supplied option:"); expect(output).not.toContain("generic informational"); expect(output).not.toContain("is invalid");
  });
  it("DN-UI02 preserves complete nested values, zero confidence and escaped evidence", () => {
    const output = html();
    for (const text of ["VALUE_END", "EVIDENCE_END", "Reported confidence: 0%", "false", "null", "Complete JSON:"]) expect(output).toContain(text);
    expect(output).toContain('tabindex="0"'); expect(output).toContain("&lt;script&gt;"); expect(output).not.toContain("<script>");
    expect(output).toContain('rel="noopener noreferrer"'); expect(output).toMatch(/referrerpolicy="no-referrer"/i);
  });
  it("DN-UI03 emits only exact current component/report/action identities and recommendation option", () => {
    const data = schemaBySlug[row.slug].parse(row.data), report = narrativeReport(mutableNarrative(row));
    const scope = { componentId: row.data.id, componentRevision: "one", reportId: report.id, reportRevision: "five", actionId: "review", actionRevision: "two" };
    expect(decisionNarrativeIntent(data)).toEqual({ type: row.type, data: row.slug === "recommendation-card" ? { ...scope, optionId: "option-a", optionRevision: "three" } : scope });
    expect(JSON.stringify(decisionNarrativeIntent(data))).not.toMatch(/VALUE_END|EVIDENCE_END|Authored|rationale|confidence/);
  });
  it("DN-UI04 has no invented action or intent when the consumer supplies none", () => {
    const data = mutableNarrative(row); delete data.action; expect(html(data)).not.toContain("<button");
    expect(decisionNarrativeIntent(schemaBySlug[row.slug].parse(data))).toBeUndefined();
  });
  it("DN-UI05 disables unavailable, callback-free and externally busy requests", () => {
    expect(html()).toContain("disabled");
    expect(html(mutableNarrative(row), { onAction: () => undefined, busy: true })).toContain("disabled");
    const data = mutableNarrative(row); data.action = { ...row.data.action, available: false };
    expect(html(data, { onAction: () => undefined })).toContain("disabled");
    expect(decisionNarrativeIntent(schemaBySlug[row.slug].parse(data))).toBeUndefined();
  });
  it("DN-UI06 renders explicit nonready states without leaking a previous report/action", () => {
    for (const state of ["loading", "empty", "error"] as const) {
      const data = { id: row.data.id, revision: "one", title: "Authored nonready", state, message: `Authored ${state}` };
      const output = html(data); expect(output).toContain(`Authored ${state}`); expect(output).not.toContain("VALUE_END"); expect(output).not.toContain("<button");
      expect(decisionNarrativeIntent(schemaBySlug[row.slug].parse(data))).toBeUndefined();
    }
  });
  it("DN-UI07 rejects malformed/legacy generic reports without an action", () => {
    const output = html({ title: "Legacy generic", items: [{ label: "Legacy" }], actions: [{ label: "Send", value: "send" }] });
    expect(output).toContain("Decision report is invalid"); expect(output).not.toContain("<button");
  });
  it("DN-UI08 never dispatches on render or interprets a callback as a reported decision", () => {
    let requests = 0; const output = html(mutableNarrative(row), { onAction: () => { requests += 1; } });
    expect(requests).toBe(0); expect(output).toContain("does not execute an action or change the reported decision");
    if (row.slug === "decision-memo") { expect(output).toContain("Reported memo status:"); expect(output).toContain("proposed"); }
    if (row.slug === "reasoning-summary") expect(output).toContain("not an internal model trace");
    expect(decisionNarrativeIntent({ ...schemaBySlug[row.slug].parse(row.data), state: "empty" } as ParsedDecisionNarrativeData)).toBeUndefined();
  });
});

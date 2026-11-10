import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as UI from "./privacy-context-components.js";
import { privacyContextIntent } from "./privacy-context-components.js";
import type { ComponentProps } from "./component-types.js";
import { schemaBySlug } from "@mcpcn/schemas";
import { privacyContextCases, mutablePrivacy, privacyReport, privacyMembers } from "../../../tests/fixtures/privacy-context.js";

describe.each(privacyContextCases)("T2 privacy/context React $slug", row => {
  const View = UI[row.name] as unknown as ComponentType<Record<string, unknown> & Pick<ComponentProps<unknown>, "onAction" | "busy">>;
  const html = (data = mutablePrivacy(row), ui: Pick<ComponentProps<unknown>, "onAction" | "busy"> = {}) => renderToStaticMarkup(createElement(View, { ...data, ...ui }));
  it("PC-UI01 renders its complete typed report and real export", () => {
    const output = html(); expect(output).toContain("Authored privacy report"); expect(output).toContain(String(privacyReport(mutablePrivacy(row)).label));
    expect(output).not.toContain("is invalid"); expect(output).not.toContain("generic informational");
  });
  it("PC-UI02 preserves full supplied metadata or escaped JSON without truncation", () => {
    const output = html();
    if (row.slug === "privacy-boundary-card" || row.slug === "model-context-preview") {
      for (const text of ["VALUE_END", "false", "null", "Complete JSON:", 'tabindex="0"', "&lt;script&gt;"]) expect(output).toContain(text);
      expect(output).not.toContain("<script>");
    } else expect(output).toContain("Authored complete purpose");
  });
  it("PC-UI03 emits exact current IDs/revisions, with supplied-order approved members only", () => {
    const data = schemaBySlug[row.slug].parse(row.data), scope = { componentId: row.data.id, componentRevision: "one", reportId: privacyReport(mutablePrivacy(row)).id, reportRevision: "five", actionId: row.slug === "consent-panel" ? "approve" : "review", actionRevision: "two" };
    const extra = row.slug === "consent-panel" ? { scopes: [{ scopeId: "required", scopeRevision: "three" }, { scopeId: "optional", scopeRevision: "four" }] }
      : row.slug === "model-context-preview" ? { sections: [{ sectionId: "section-a", sectionRevision: "three" }, { sectionId: "section-b", sectionRevision: "four" }] } : {};
    const intent = privacyContextIntent(data, ["optional", "required"], true); expect(intent).toEqual({ type: row.type, data: { ...scope, ...extra } });
    expect(JSON.stringify(intent)).not.toMatch(/VALUE_END|PRIVATE_END|Authored|purpose|label|reported|value/);
  });
  it("PC-UI04 invents no missing supplied actions or intents", () => {
    const data = mutablePrivacy(row); delete data.action; delete data.approveAction; delete data.declineAction;
    expect(html(data)).not.toContain("<button"); expect(privacyContextIntent(schemaBySlug[row.slug].parse(data), ["required"], true)).toBeUndefined();
  });
  it("PC-UI05 disables callback-free, externally busy and unavailable actions", () => {
    expect(html()).toContain("disabled"); expect(html(mutablePrivacy(row), { onAction: () => undefined, busy: true })).toContain("disabled");
    const data = mutablePrivacy(row), key = row.slug === "consent-panel" ? "approveAction" : "action";
    (data[key] as Record<string, unknown>).available = false;
    expect(privacyContextIntent(schemaBySlug[row.slug].parse(data), ["required"], true)).toBeUndefined();
  });
  it("PC-UI06 renders each nonready branch without reports or actions", () => {
    for (const state of ["loading", "empty", "error"]) {
      const data = { id: row.data.id, revision: "one", title: "Authored nonready", state, message: `Authored ${state}` };
      const output = html(data); expect(output).toContain(`Authored ${state}`); expect(output).not.toContain("VALUE_END"); expect(output).not.toContain("<button");
      expect(privacyContextIntent(schemaBySlug[row.slug].parse(data), ["required"], true)).toBeUndefined();
    }
  });
  it("PC-UI07 rejects malformed generic data without rendering actions", () => {
    const output = html({ title: "Legacy", items: [{ value: "LEAK" }], actions: [{ label: "Send", value: "send" }] });
    expect(output).toContain("Privacy report is invalid"); expect(output).not.toContain("LEAK"); expect(output).not.toContain("<button");
  });
  it("PC-UI08 dispatches nothing on render and retains supplied reported decisions", () => {
    let requests = 0; const output = html(mutablePrivacy(row), { onAction: () => { requests++; } }); expect(requests).toBe(0);
    if (row.slug === "data-access-notice") { expect(output).toContain("allowed"); expect(output).toContain("does not read records or grant access"); }
    if (row.slug === "consent-panel") { expect(output).toContain("granted"); expect(output).not.toContain('checked=""'); }
    if (row.slug === "model-context-preview") { expect(output).toContain("does not send data or update model context"); expect(output).not.toContain('checked=""'); }
    if (row.slug === "privacy-boundary-card") expect(output).toContain("do not enforce isolation or send context");
  });
});

describe("T2 explicit consent and context intentions", () => {
  const consent = () => schemaBySlug["consent-panel"].parse(privacyContextCases[2].data);
  it("PC-UI09 requires fresh selection and acknowledgement despite a reported grant", () => {
    expect(privacyContextIntent(consent())).toBeUndefined(); expect(privacyContextIntent(consent(), [], true)).toBeUndefined();
    expect(privacyContextIntent(consent(), ["required"], false)).toBeUndefined(); expect(privacyContextIntent(consent(), ["required"], true)?.type).toBe("request-consent-approval");
  });
  it("PC-UI10 refuses optional-only, unknown, duplicate or unavailable selected IDs", () => {
    for (const selected of [["optional"], ["required", "unknown"], ["required", "required"], ["required", "unavailable"]]) expect(privacyContextIntent(consent(), selected, true)).toBeUndefined();
  });
  it("PC-UI11 blocks an unavailable required scope while allowing explicit decline", () => {
    const data = mutablePrivacy(privacyContextCases[2]); privacyMembers(data)[0]!.available = false;
    const parsed = schemaBySlug["consent-panel"].parse(data); expect(privacyContextIntent(parsed, ["required", "optional"], true)).toBeUndefined();
    expect(privacyContextIntent(parsed, [], false, "decline")).toEqual({ type: "decline-consent-request", data: { componentId: "consent-1", componentRevision: "one", reportId: "consent-report", reportRevision: "five", actionId: "decline", actionRevision: "two" } });
  });
  it("PC-UI12 only permits supplied available decline actions", () => {
    const data = mutablePrivacy(privacyContextCases[2]); delete data.declineAction;
    expect(privacyContextIntent(schemaBySlug["consent-panel"].parse(data), [], false, "decline")).toBeUndefined();
    data.declineAction = { id: "decline", revision: "two", label: "Decline", available: false };
    expect(privacyContextIntent(schemaBySlug["consent-panel"].parse(data), [], false, "decline")).toBeUndefined();
  });
  it("PC-UI13 never invents or dispatches excluded context values", () => {
    const data = schemaBySlug["model-context-preview"].parse(privacyContextCases[3].data);
    expect(privacyContextIntent(data)).toBeUndefined(); const intent = privacyContextIntent(data, [], true); expect(intent?.type).toBe("request-context-handoff");
    expect(JSON.stringify(intent)).not.toMatch(/excluded|VALUE_END|SECTION_END|recipient|estimate/);
  });
  it("PC-UI14 keeps complete JSON and server boundary metadata readable", () => {
    const output = renderToStaticMarkup(<UI.PrivacyBoundaryCard {...privacyContextCases[1].data} />);
    expect(output).toContain("PRIVATE_END"); expect(output).toContain("Server-only metadata; no value supplied"); expect(output).toContain("model-visible"); expect(output).toContain("private-ui");
  });
  it("PC-UI15 distinguishes zero and missing reported counts in both views", () => {
    for (const index of [0, 3] as const) {
      const row = privacyContextCases[index], data = mutablePrivacy(row), View = UI[row.name] as unknown as ComponentType<Record<string, unknown>>;
      const before = renderToStaticMarkup(createElement(View, data)); expect(before).toMatch(/Reported (record count|token estimate): 0/);
      if (index === 0) delete privacyMembers(data)[0]!.reportedRecordCount; else delete privacyReport(data).reportedTokenEstimate;
      expect(renderToStaticMarkup(createElement(View, data))).toMatch(/Reported (record count|token estimate): Not supplied/);
    }
  });
  it("PC-UI16 uses the replacement report/action/member revisions without values", () => {
    const data = mutablePrivacy(privacyContextCases[2]); data.revision = "new"; privacyReport(data).revision = "new-report";
    (data.approveAction as Record<string, unknown>).revision = "new-action"; privacyMembers(data)[0]!.revision = "new-scope";
    expect(privacyContextIntent(schemaBySlug["consent-panel"].parse(data), ["required"], true)).toMatchObject({ data: { componentRevision: "new", reportRevision: "new-report", actionRevision: "new-action", scopes: [{ scopeId: "required", scopeRevision: "new-scope" }] } });
  });
});

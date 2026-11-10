import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as UI from "./index.js";
import { hostStateIntent } from "./host-state-components.js";
import { schemaBySlug } from "@mcpcn/schemas";
import { hostStateCases } from "../../../tests/fixtures/host-states.js";

const render = (name: typeof hostStateCases[number]["name"], data: object) => renderToStaticMarkup(createElement(UI[name] as unknown as ComponentType<Record<string, unknown>>, { ...data }));
describe("T2 reported host state views", () => {
  it.each(hostStateCases)("HS-UI01 $slug renders distinct complete semantics and escaped text", row => {
    const html = render(row.name, { ...row.data, onAction: () => undefined });
    expect(html).toContain('role="region"'); expect(html).toContain(row.text);
    expect(html).toContain("Reported &lt;script&gt;not executable&lt;/script&gt; condition"); expect(html).not.toContain("<script>");
    expect(html).not.toContain("is invalid"); expect(html).not.toContain("GenericAgentComponent");
    expect(html).toContain("Request review"); expect(html).not.toContain('disabled=""');
  });
  it.each(hostStateCases)("HS-UI02 $slug has no invented action and no handler-free activation", row => {
    const { action: _action, ...without } = row.data;
    const html = render(row.name, without); expect(html).not.toContain("<button"); expect(html).toContain("No action was supplied.");
    expect(render(row.name, row.data)).toContain('disabled=""');
  });
  it.each(hostStateCases)("HS-UI03 $slug blocks unavailable or externally busy requests", row => {
    for (const data of [{ ...row.data, action: { ...row.data.action, available: false } }, { ...row.data, busy: true }]) {
      expect(render(row.name, { ...data, onAction: () => undefined })).toContain('disabled=""');
    }
  });
  it.each(hostStateCases)("HS-UI04 $slug projects only current revision-bound action identities", row => {
    const data = schemaBySlug[row.slug].parse(row.data);
    expect(hostStateIntent(data)).toEqual({ type: row.intent, data: { componentId: "state-1", componentRevision: "one", actionId: "request-1", actionRevision: "one" } });
    expect(hostStateIntent({ ...data, action: undefined })).toBeUndefined();
    expect(hostStateIntent({ ...data, action: { ...row.data.action, available: false } })).toBeUndefined();
  });
  it("HS-UI05 displays absent counts separately from zero and never reports readiness", () => {
    const waiting = hostStateCases[3].data, offline = hostStateCases[4].data;
    const { elapsedMs: _elapsed, progress: _progress, ...withoutTime } = waiting;
    expect(render("LoadingBridgeState", withoutTime)).toContain("Reported elapsed time: Not supplied");
    const { unsentChanges: _count, ...withoutCount } = offline;
    expect(render("OfflineState", withoutCount)).toContain("Reported unsent changes: Not supplied");
    const html = render("LoadingBridgeState", { ...waiting, progress: { completed: 3, total: 3 } });
    expect(html).toContain("Reported work: 3 of 3"); expect(html).toContain("does not establish bridge readiness");
  });
  it("HS-UI06 fails closed before reading unsafe DTO descriptors", () => {
    let reads = 0;
    const props = Object.defineProperty({ ...hostStateCases[0].data }, "message", { enumerable: true, get() { reads++; return "secret"; } });
    const html = renderToStaticMarkup(UI.BillingGate(props));
    expect(html).toContain("Reported host state is invalid"); expect(html).not.toContain("<button"); expect(reads).toBe(0);
  });
});

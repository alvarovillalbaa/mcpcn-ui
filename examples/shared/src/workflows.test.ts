// T2: actual SDK traffic and SQLite; all people/documents/source bodies authored.
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { WorkflowStore, type Principal } from "./store.js";
import { METADATA_KEY, PublicRecordSchema, privateRecordSchema, toolPrefix, type Workflow } from "./contracts.js";
import { referenceDefinitions } from "../../definitions.js";
import { CandidateStateSchema, candidateSeed } from "../../hr-candidate-review/src/contracts.js";
import { DocumentStateSchema, extractTextFields } from "../../document-extraction/src/contracts.js";
import { CheckoutStateSchema, checkoutSeed } from "../../ecommerce-checkout-review/src/contracts.js";
import { AdminStateSchema } from "../../admin-settings-change/src/contracts.js";
import { ResearchStateSchema, researchSources } from "../../research-workflow/src/contracts.js";
import { readPrimarySource, type SourceReader } from "../../research-workflow/src/server.js";

const principal: Principal = { workspace: "workspace-one", actor: "reviewer-one", grants: ["hr-candidate-review", "document-extraction", "ecommerce-checkout-review", "admin-settings-change", "research-workflow"] };
const fixed = Date.UTC(2026, 10, 10);
type Observation = { id: string; workflow: Workflow; status: string; messages: Array<{ direction: string; value: unknown }>; clientClosed: boolean; serverClosed: boolean; databaseClosed: boolean; error?: string };
const observations: Observation[] = [];
type Session = { client: Client; store: WorkflowStore; db: DatabaseSync; clock: { value: number }; workflow: Workflow };
async function session(id: string, workflow: Workflow, body: (value: Session) => Promise<void>, options: { seed?: unknown; principal?: Principal; read?: SourceReader } = {}) {
  const row: Observation = { id, workflow, status: "failed", messages: [], clientClosed: false, serverClosed: false, databaseClosed: false }; observations.push(row);
  const clock = { value: fixed }, db = new DatabaseSync(":memory:"), store = new WorkflowStore(db, () => clock.value);
  const definition = referenceDefinitions({ now: () => clock.value, readSource: options.read ?? (async () => "Authored source text. AUTHORED_SOURCE_END") }).find(value => value.id === workflow)!;
  store.seed(principal, workflow, "record-one", options.seed ?? definition.seed);
  const server = definition.create({ store, principal: options.principal ?? principal, html: "<main>AUTHORED_WORKFLOW_RESOURCE_END</main>" }), client = new Client({ name: "authored-workflow-check", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  for (const [transport, direction] of [[a, "client-to-server"], [b, "server-to-client"]] as const) {
    const send = transport.send.bind(transport); transport.send = async (message, extra) => { const raw = JSON.stringify(message); expect(Buffer.byteLength(raw)).toBeLessThan(1024 * 1024); expect(row.messages.length).toBeLessThan(200); row.messages.push({ direction, value: JSON.parse(raw) }); return send(message, extra); };
  }
  try { await server.connect(b); await client.connect(a, { timeout: 2000 }); await client.listTools(); await body({ client, store, db, clock, workflow }); row.status = "passed"; }
  catch (error) { row.error = error instanceof Error ? error.message : String(error); throw error; }
  finally { await client.close(); row.clientClosed = true; await server.close(); row.serverClosed = !server.isConnected(); store.close(); row.databaseClosed = store.isClosed; }
}
const call = (value: Session, operation: string, args: Record<string, unknown>) => value.client.callTool({ name: `${toolPrefix(value.workflow)}_${operation}`, arguments: args }, undefined, { timeout: 3000 });
const read = (value: Session) => call(value, "read", { id: "record-one" });
const prepare = (value: Session, proposal: unknown, revision = 1) => call(value, "prepare", { id: "record-one", revision, proposal });
const parsed = <S extends z.ZodType>(result: CallToolResult, schema: S) => {
  expect(result.isError).not.toBe(true); const privateView = privateRecordSchema(schema).parse(result._meta?.[METADATA_KEY]), visible = PublicRecordSchema.parse(result.structuredContent?.data);
  expect(visible.revision).toBe(privateView.revision); expect(visible.id).toBe(privateView.id); return privateView;
};
async function confirm<S extends z.ZodType>(value: Session, prepared: CallToolResult, schema: S) { const token = parsed(prepared, schema).prepared!.token; return call(value, "confirm", { token }); }
const auditCount = (value: Session) => value.db.prepare("SELECT count(*) AS count FROM audit").get()?.count;
afterEach(() => vi.restoreAllMocks());
afterAll(() => {
  const root = process.env.MCPCN_RF_RUN_ROOT, output = process.env.MCPCN_RF_OUTPUT;
  if (!output) return;
  if (!root || output !== path.join(root, "output") || process.env.CI !== "true" || fs.readFileSync(path.join(root, ".owner"), "utf8") !== process.env.MCPCN_RF_NONCE) throw new Error("protocol_retention_owner_required");
  const body = JSON.stringify({ schemaVersion: "mcpcn.reference-workflow-protocol.v1", sourceCommit: process.env.SOURCE_COMMIT, cases: observations,
    passed: observations.length === 28 && observations.every(row => row.status === "passed" && row.clientClosed && row.serverClosed && row.databaseClosed),
    proofLimits: ["Real in-memory SDK and SQLite only; source reads are authored adapters. No external host, provider/model, payment, email or production data."] });
  if (Buffer.byteLength(body) > 8 * 1024 * 1024) throw new Error("protocol_original_bound");
  fs.writeFileSync(path.join(output, "reference-protocol.json"), body, { flag: "wx", mode: 0o600 });
});

describe("T2 five reference workflows through the real MCP SDK", () => {
  it("RF-P01 reads the actual model-safe envelope and complete private candidate view", () => session("RF-P01", "hr-candidate-review", async value => {
    const result = await read(value), view = parsed(result, CandidateStateSchema); expect(view.state.evidence).toEqual(candidateSeed.evidence);
    expect(JSON.stringify([result.content, result.structuredContent])).not.toContain(candidateSeed.candidate.name); expect(JSON.stringify(result._meta)).toContain(candidateSeed.candidate.name);
    const resources = await value.client.listResources(); expect(resources.resources[0]?.uri).toBe("ui://mcpcn-reference/hr-candidate-review.html");
    expect((await value.client.readResource({ uri: resources.resources[0]!.uri })).contents[0]).toMatchObject({ text: "<main>AUTHORED_WORKFLOW_RESOURCE_END</main>" });
  }));
  it("RF-P02 persists an approved candidate decision and real audit", () => session("RF-P02", "hr-candidate-review", async value => {
    const review = await prepare(value, { decision: "approve", note: "Authored evidence reviewed." }); expect(auditCount(value)).toBe(0);
    const result = parsed(await confirm(value, review, CandidateStateSchema), CandidateStateSchema); expect(result.state.status).toBe("recommended"); expect(result.state.note).toBe("Authored evidence reviewed."); expect(auditCount(value)).toBe(1);
  }));
  it("RF-P03 persists an explicit rejection", () => session("RF-P03", "hr-candidate-review", async value => {
    const result = parsed(await confirm(value, await prepare(value, { decision: "reject", note: "Authored evidence is insufficient." }), CandidateStateSchema), CandidateStateSchema); expect(result.state.status).toBe("rejected"); expect(result.audit[0]?.action).toBe("reject");
  }));
  it("RF-P04 persists a request for information without contacting anyone", () => session("RF-P04", "hr-candidate-review", async value => {
    const result = parsed(await confirm(value, await prepare(value, { decision: "request-info", note: "Please record a reviewed reference." }), CandidateStateSchema), CandidateStateSchema); expect(result.state.status).toBe("needs-info"); expect(result.audit).toHaveLength(1);
  }));
  it("RF-P05 refuses candidate approval while a blocking evidence gap remains", () => session("RF-P05", "hr-candidate-review", async value => {
    expect((await prepare(value, { decision: "approve", note: "Authored review cannot waive this." })).isError).toBe(true); expect(auditCount(value)).toBe(0);
  }, { seed: { ...candidateSeed, gaps: [{ label: "Required work sample absent", blocking: true }] } }));
  it("RF-P06 denies a workflow grant before exposing its private view", () => session("RF-P06", "hr-candidate-review", async value => {
    const result = await read(value); expect(result.isError).toBe(true); expect(result._meta).toBeUndefined(); expect(JSON.stringify(result)).not.toContain(candidateSeed.candidate.name);
  }, { principal: { ...principal, grants: [] } }));
  it.each(["invoice", "contract", "resume"] as const)("RF-P07 %s extracts actual supplied text, saves corrections and audit", kind => session("RF-P07-" + kind, "document-extraction", async value => {
    const text = { invoice: "Supplier: Authored Labs\nTotal: 0\nCurrency: EUR\nDOCUMENT_COMPLETE_END", contract: "Party: Authored Company\nEffective date: 2026-11-10\nTerm: 30 days\nDOCUMENT_COMPLETE_END", resume: "Name: Authored Person\nEmail: authored@example.com\nExperience: Supplied work sample\nDOCUMENT_COMPLETE_END" }[kind];
    const extracted = parsed(await confirm(value, await prepare(value, { action: "extract", fileName: "authored.txt", kind, text }), DocumentStateSchema), DocumentStateSchema);
    expect(extracted.state.status).toBe("extracted"); expect(extracted.state.text).toBe(text); expect(extracted.state.fields).toHaveLength(3); expect(extracted.state.fields.every(field => field.confidence === 1)).toBe(true);
    const fields = extracted.state.fields.map((field, index) => ({ id: field.id, value: index === 0 ? "Reviewed correction" : field.value }));
    const saved = parsed(await confirm(value, await prepare(value, { action: "save", fields }, 2), DocumentStateSchema), DocumentStateSchema); expect(saved.state.status).toBe("saved"); expect(saved.state.fields[0]?.value).toBe("Reviewed correction"); expect(saved.state.fields[0]?.original).not.toBe("Reviewed correction"); expect(auditCount(value)).toBe(2);
  }));
  it("RF-P08 refuses absent required document values", () => session("RF-P08", "document-extraction", async value => {
    const extracted = parsed(await confirm(value, await prepare(value, { action: "extract", fileName: "authored.txt", kind: "invoice", text: "Supplier: Authored\nTotal: 0\nCurrency: EUR" }), DocumentStateSchema), DocumentStateSchema);
    expect((await prepare(value, { action: "save", fields: extracted.state.fields.map(field => ({ id: field.id, value: "" })) }, 2)).isError).toBe(true); expect(auditCount(value)).toBe(1);
  }));
  it("RF-P09 refuses duplicated or foreign correction field identities", () => session("RF-P09", "document-extraction", async value => {
    const extracted = parsed(await confirm(value, await prepare(value, { action: "extract", fileName: "authored.txt", kind: "invoice", text: "Supplier: Authored\nTotal: 0\nCurrency: EUR" }), DocumentStateSchema), DocumentStateSchema);
    const fields = extracted.state.fields.map(field => ({ id: field.id, value: field.value })); fields[1] = fields[0]!;
    expect((await prepare(value, { action: "save", fields }, 2)).isError).toBe(true); fields[1] = { id: "foreign", value: "Authored" }; expect((await prepare(value, { action: "save", fields }, 2)).isError).toBe(true); expect(auditCount(value)).toBe(1);
  }));
  it("RF-P10 refuses an oversized UTF-8 document without a partial extraction", () => session("RF-P10", "document-extraction", async value => {
    expect((await prepare(value, { action: "extract", fileName: "authored.txt", kind: "invoice", text: "界".repeat(22000) })).isError).toBe(true); expect(parsed(await read(value), DocumentStateSchema).state.status).toBe("empty"); expect(auditCount(value)).toBe(0);
  }));
  it("RF-P11 computes exact checkout prices including zero tax and records no charge", () => session("RF-P11", "ecommerce-checkout-review", async value => {
    const review = await prepare(value, { action: "place-order", address: "Authored street 12, Example City", acceptReturns: true });
    const first = await confirm(value, review, CheckoutStateSchema), saved = parsed(first, CheckoutStateSchema); expect(saved.state.order).toMatchObject({ totalMinor: 4600, charged: false });
    const replay = await confirm(value, review, CheckoutStateSchema); expect(PublicRecordSchema.parse(replay.structuredContent?.data).receipt).toEqual(PublicRecordSchema.parse(first.structuredContent?.data).receipt); expect(auditCount(value)).toBe(1);
  }));
  it("RF-P12 refuses caller-supplied prices and missing returns acceptance", () => session("RF-P12", "ecommerce-checkout-review", async value => {
    expect((await prepare(value, { action: "place-order", address: "Authored street 12", acceptReturns: true, totalMinor: 0 })).isError).toBe(true); expect((await prepare(value, { action: "place-order", address: "Authored street 12", acceptReturns: false })).isError).toBe(true); expect(auditCount(value)).toBe(0);
  }));
  it("RF-P13 rechecks quote expiry inside the confirmation transaction", () => session("RF-P13", "ecommerce-checkout-review", async value => {
    const review = await prepare(value, { action: "place-order", address: "Authored street 12", acceptReturns: true }); value.clock.value += 101;
    expect((await confirm(value, review, CheckoutStateSchema)).isError).toBe(true); expect(parsed(await read(value), CheckoutStateSchema).state.status).toBe("quote"); expect(auditCount(value)).toBe(0);
  }, { seed: { ...checkoutSeed(fixed), expiresAt: fixed + 100 } }));
  it("RF-P14 never creates a second order from a new prepared request", () => session("RF-P14", "ecommerce-checkout-review", async value => {
    await confirm(value, await prepare(value, { action: "place-order", address: "Authored street 12", acceptReturns: true }), CheckoutStateSchema);
    expect((await prepare(value, { action: "place-order", address: "Another authored street", acceptReturns: true }, 2)).isError).toBe(true); expect(auditCount(value)).toBe(1);
  }));
  it("RF-P15 applies actual settings, affected-member terms and a reviewed rollback", () => session("RF-P15", "admin-settings-change", async value => {
    const review = await prepare(value, { action: "change", settings: { weeklyDigest: true, retentionDays: 45 } }); expect(parsed(review, AdminStateSchema).prepared?.changes).toContainEqual({ label: "Affected example members", before: "2", after: "2" });
    const changed = parsed(await confirm(value, review, AdminStateSchema), AdminStateSchema); expect(changed.state.settings).toEqual({ weeklyDigest: true, retentionDays: 45 });
    const rollback = parsed(await confirm(value, await prepare(value, { action: "rollback" }, 2), AdminStateSchema), AdminStateSchema); expect(rollback.state.settings).toEqual({ weeklyDigest: false, retentionDays: 30 }); expect(rollback.state.previous).toBeNull(); expect(auditCount(value)).toBe(2);
  }));
  it("RF-P16 refuses invalid settings, empty changes and unavailable rollback", () => session("RF-P16", "admin-settings-change", async value => {
    for (const proposal of [{ action: "rollback" }, { action: "change", settings: { weeklyDigest: true, retentionDays: 0 } }, { action: "change", settings: { weeklyDigest: false, retentionDays: 30 } }]) expect((await prepare(value, proposal)).isError).toBe(true); expect(auditCount(value)).toBe(0);
  }));
  it("RF-P17 refuses a stale settings review and preserves the winning change", () => session("RF-P17", "admin-settings-change", async value => {
    const a = await prepare(value, { action: "change", settings: { weeklyDigest: true, retentionDays: 45 } }), b = await prepare(value, { action: "change", settings: { weeklyDigest: false, retentionDays: 60 } });
    await confirm(value, a, AdminStateSchema); expect((await confirm(value, b, AdminStateSchema)).isError).toBe(true); expect(parsed(await read(value), AdminStateSchema).state.settings.retentionDays).toBe(45); expect(auditCount(value)).toBe(1);
  }));
  it("RF-P18 gathers partial source results and sanitizes provider failure details", () => session("RF-P18", "research-workflow", async value => {
    const review = await prepare(value, { action: "gather" }); expect(JSON.stringify(review)).not.toContain("PRIVATE_PROVIDER_FAILURE");
    const saved = parsed(await confirm(value, review, ResearchStateSchema), ResearchStateSchema); expect(saved.state.status).toBe("partial"); expect(saved.state.sources.map(source => source.status)).toEqual(["succeeded", "failed", "succeeded"]); expect(saved.state.sources[0]?.text).toContain("AUTHORED_SOURCE_END");
  }, { read: async url => { if (url === researchSources[1].url) throw new Error("PRIVATE_PROVIDER_FAILURE"); return "Complete authored source. AUTHORED_SOURCE_END"; } }));
  it("RF-P19 retries only the requested failed source and preserves other full text", async () => {
    const calls: string[] = []; let failed = false;
    await session("RF-P19", "research-workflow", async value => {
      const first = parsed(await confirm(value, await prepare(value, { action: "gather" }), ResearchStateSchema), ResearchStateSchema); expect(first.state.status).toBe("partial");
      const second = parsed(await confirm(value, await prepare(value, { action: "retry", sourceId: "sdk-readme" }, 2), ResearchStateSchema), ResearchStateSchema); expect(second.state.status).toBe("gathered"); expect(calls).toEqual([...researchSources.map(source => source.url), researchSources[1].url]); expect(second.state.sources[0]?.text).toBe(first.state.sources[0]?.text);
      expect((await prepare(value, { action: "retry", sourceId: "apps-readme" }, 3)).isError).toBe(true);
    }, { read: async url => { calls.push(url); if (url === researchSources[1].url && !failed) { failed = true; throw new Error("Authored transient failure"); } return "Complete authored source. AUTHORED_SOURCE_END"; } });
  });
  it("RF-P20 saves a reviewed final decision with its actual source states", () => session("RF-P20", "research-workflow", async value => {
    await confirm(value, await prepare(value, { action: "gather" }), ResearchStateSchema);
    const saved = parsed(await confirm(value, await prepare(value, { action: "decide", conclusion: "The authored source evidence requires explicit review and server authorization." }, 2), ResearchStateSchema), ResearchStateSchema);
    expect(saved.state.status).toBe("completed"); expect(saved.state.conclusion).toContain("explicit review"); expect(auditCount(value)).toBe(2);
  }));
  it("RF-P21 refuses a final decision before any successful source", () => session("RF-P21", "research-workflow", async value => {
    expect((await prepare(value, { action: "decide", conclusion: "Authored conclusion without any evidence must be refused." })).isError).toBe(true); expect(auditCount(value)).toBe(0);
  }));
  it("RF-P22 propagates real SDK cancellation before persisting a prepared source review", async () => {
    let started!: () => void, ended!: () => void; const began = new Promise<void>(resolve => { started = resolve; }), finished = new Promise<void>(resolve => { ended = resolve; });
    await session("RF-P22", "research-workflow", async value => {
      const controller = new AbortController(), pending = value.client.callTool({ name: "research_workflow_prepare", arguments: { id: "record-one", revision: 1, proposal: { action: "gather" } } }, undefined, { signal: controller.signal, timeout: 3000 });
      await began; controller.abort(); await expect(pending).rejects.toThrow(); await finished; expect(auditCount(value)).toBe(0); expect(value.db.prepare("SELECT count(*) AS count FROM reviews").get()?.count).toBe(0);
    }, { read: async (_url, signal) => { started(); await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true })); ended(); throw new Error("Authored abort"); } });
  });
  it("RF-P23 rejects forged actor/workspace arguments through real SDK validation", () => session("RF-P23", "admin-settings-change", async value => {
    const result = await call(value, "read", { id: "record-one", workspace: "other-workspace", actor: "other-reviewer" }); expect(result.isError).toBe(true); expect(result._meta).toBeUndefined(); expect(auditCount(value)).toBe(0);
  }));
  it("RF-P24 keeps opaque approval tokens out of model-visible fields", () => session("RF-P24", "admin-settings-change", async value => {
    const review = await prepare(value, { action: "change", settings: { weeklyDigest: true, retentionDays: 45 } }), token = parsed(review, AdminStateSchema).prepared!.token;
    expect(JSON.stringify([review.content, review.structuredContent])).not.toContain(token); expect(JSON.stringify(review._meta)).toContain(token);
  }));
  it("RF-P25 revokes the exact app-cancelled review through the real SDK", () => session("RF-P25", "admin-settings-change", async value => {
    const review = await prepare(value, { action: "change", settings: { weeklyDigest: true, retentionDays: 45 } }), token = parsed(review, AdminStateSchema).prepared!.token;
    expect(parsed(await call(value, "cancel", { token }), AdminStateSchema).prepared).toBeNull(); expect((await call(value, "confirm", { token })).isError).toBe(true); expect(auditCount(value)).toBe(0);
  }));
  it("RF-P26 renews an expired local quote through a separately reviewed revision", () => session("RF-P26", "ecommerce-checkout-review", async value => {
    const renewed = parsed(await confirm(value, await prepare(value, { action: "refresh-quote" }), CheckoutStateSchema), CheckoutStateSchema);
    expect(renewed.revision).toBe(2); expect(renewed.state.expiresAt).toBe(fixed + 86400000);
    const placed = parsed(await confirm(value, await prepare(value, { action: "place-order", address: "Authored street 12", acceptReturns: true }, 2), CheckoutStateSchema), CheckoutStateSchema); expect(placed.state.status).toBe("ordered"); expect(auditCount(value)).toBe(2);
  }, { seed: { ...checkoutSeed(fixed), expiresAt: fixed - 1 } }));
});

describe("T2 primary-source and text adapters", () => {
  it("RF-A01 refuses arbitrary source URLs before a network request", async () => {
    const fetch = vi.spyOn(globalThis, "fetch"); await expect(readPrimarySource("http://127.0.0.1/private", new AbortController().signal)).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
  });
  it("RF-A02 applies no-redirect, timeout and complete-text source reads", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Complete authored body. SOURCE_END", { headers: { "Content-Type": "text/plain" } }));
    expect(await readPrimarySource(researchSources[0].url, new AbortController().signal)).toBe("Complete authored body. SOURCE_END"); expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "error", headers: { Accept: "text/plain" } });
  });
  it("RF-A03 refuses oversized, nontext, malformed UTF-8 and empty responses", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    for (const response of [new Response("x".repeat(65537), { headers: { "Content-Type": "text/plain" } }), new Response("Authored", { headers: { "Content-Type": "application/json" } }), new Response(new Uint8Array([255]), { headers: { "Content-Type": "text/plain" } }), new Response(" ", { headers: { "Content-Type": "text/plain" } })]) {
      fetch.mockResolvedValueOnce(response); await expect(readPrimarySource(researchSources[0].url, new AbortController().signal)).rejects.toThrow();
    }
  });
  it("RF-A04 preserves empty fields without crossing to another source line", () => {
    const fields = extractTextFields("invoice", "Supplier:\nTotal: 0\nCurrency: EUR"); expect(fields[0]?.value).toBe(""); expect(fields[1]?.value).toBe("0"); expect(fields[2]?.source).toBe("Currency: EUR");
  });
});

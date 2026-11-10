import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { BlockKindSchema, BlockRecordSchema, BLOCK_METADATA_KEY, type BlockKind, type BlockProposal, type BlockState } from "@mcpcn/schemas/blocks";
import { BlockWorkflowStore, registerBlockServer, type BlockPrincipal, type BlockServerOptions } from "./block-recipes.js";
import { blockFixturePrincipal, blockFixtureExecutors, createBlockFixture, seedBlockFixture, exerciseBlockFixture } from "./block-fixtures.js";

const disposals: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const dispose of disposals.splice(0).reverse()) await dispose(); });
const signal = () => new AbortController().signal;
function opened(block: BlockKind = "collect-missing-data", now?: () => number, file = ":memory:") {
  const database = new DatabaseSync(file), store = new BlockWorkflowStore(database, now), principal = structuredClone(blockFixturePrincipal);
  disposals.push(() => store.close()); const fixture = seedBlockFixture(database, store, principal, block);
  return { database, store, principal, fixture, block };
}
async function connected(block: BlockKind, configure: Partial<BlockServerOptions> = {}) {
  const openedFixture = opened(block), server = new McpServer({ name: "block-domain-check", version: "1" });
  const client = new Client({ name: "block-domain-client", version: "1" }), [a, b] = InMemoryTransport.createLinkedPair();
  const registration = registerBlockServer(server, block, { store: openedFixture.store, resolvePrincipal: () => openedFixture.principal,
    policyRevision: "policy-v1", html: "<html><body>Authored</body></html>", executors: blockFixtureExecutors, ...configure });
  disposals.push(async () => { registration.dispose(); await client.close(); await server.close(); });
  await server.connect(a); await client.connect(b);
  const call = async (operation: keyof typeof registration.tools, args: Record<string, unknown>) => CallToolResultSchema.parse(await client.callTool({ name: registration.tools[operation], arguments: args }));
  const read = (result: Awaited<ReturnType<typeof call>>) => { expect(result.isError).not.toBe(true); return BlockRecordSchema.parse(result._meta?.[BLOCK_METADATA_KEY]); };
  const prepare = async (proposal = openedFixture.fixture.proposal, revision = 1) => read(await call("prepare", { id: "authored-record", revision, proposal }));
  return { ...openedFixture, server, client, registration, call, read, prepare };
}
function prepared(fixture: ReturnType<typeof opened>, policy = "policy-v1") {
  return fixture.store.prepare(fixture.principal, fixture.block, "authored-record", 1, policy, fixture.fixture.proposal, signal(), current => ({
    preview: { ...current, ...(current.block === "collect-missing-data" ? { values: { amount: "0", enabled: false }, status: "collected" as const } : {}) } as BlockState,
    terms: { action: "save-fields", title: "Save exact authored fields", description: "A complete transaction", riskLevel: "medium", changes: [{ label: "Amount", before: "10", after: "0" }] },
  }));
}
const apply = (_: BlockState, _proposal: BlockProposal, _db: DatabaseSync, plan: { preview: BlockState }) => plan.preview;

describe("BR-S: each block has an actual SDK/SQLite example", () => {
  it.each(BlockKindSchema.options)("BR-S01 %s", async block => { expect((await exerciseBlockFixture(block)).realSdk).toBe(true); });
});
describe("BR-T: persistent review invariants", () => {
  it("BR-T01 refuses a foreign database without replacing its table", () => {
    const db = new DatabaseSync(":memory:"); disposals.push(() => db.close()); db.exec("CREATE TABLE owner_data(value TEXT); INSERT INTO owner_data VALUES('keep');");
    expect(() => new BlockWorkflowStore(db)).toThrow(); expect(db.prepare("SELECT value FROM owner_data").get()?.value).toBe("keep");
  });
  it("BR-T02 seed never overwrites existing reviewed state", () => {
    const f = opened(), view = prepared(f); f.store.confirm(f.principal, f.block, view.prepared!.token, "policy-v1", signal(), apply);
    f.store.seed(f.principal, f.block, "authored-record", f.fixture.initial); expect(f.store.read(f.principal, f.block, "authored-record").revision).toBe(2);
  });
  it("BR-T03 rejects a different actor, workspace or block token", () => {
    const f = opened(), token = prepared(f).prepared!.token;
    for (const principal of [{ ...f.principal, actor: "different" }, { ...f.principal, workspace: "different" }]) expect(() => f.store.confirm(principal, f.block, token, "policy-v1", signal(), apply)).toThrow();
    expect(() => f.store.confirm(f.principal, "extract-review-save", token, "policy-v1", signal(), apply)).toThrow();
  });
  it("BR-T04 expiry is exclusive at the exact five-minute boundary", () => {
    let time = 1000; const f = opened("collect-missing-data", () => time), review = prepared(f).prepared!; time = review.expiresAt;
    expect(() => f.store.confirm(f.principal, f.block, review.token, "policy-v1", signal(), apply)).toThrow(); expect(f.store.read(f.principal, f.block, "authored-record").revision).toBe(1);
  });
  it("BR-T05 changed policy rejects unconsumed terms", () => {
    const f = opened(), review = prepared(f).prepared!; expect(() => f.store.confirm(f.principal, f.block, review.token, "policy-v2", signal(), apply)).toThrow();
  });
  it("BR-T06 replay retains its original receipt after expiry and policy rotation", () => {
    let time = 1000; const f = opened("collect-missing-data", () => time), review = prepared(f).prepared!;
    const first = f.store.confirm(f.principal, f.block, review.token, "policy-v1", signal(), apply); time = review.expiresAt + 1;
    const replay = f.store.confirm(f.principal, f.block, review.token, "policy-v2", signal(), () => { throw new Error("must_not_execute"); });
    expect(replay.receipt).toEqual(first.receipt); expect(replay.replay).toBe(true);
  });
  it("BR-T07 cancellation clears private review payload and cannot undo a commit", () => {
    const f = opened(), a = prepared(f).prepared!, b = prepared(f).prepared!; f.store.cancel(f.principal, f.block, a.token);
    expect(f.database.prepare("SELECT proposal,terms,preview FROM mcpcn_block_reviews WHERE expires=0").get()).toMatchObject({ proposal: "null", terms: "null", preview: "null" });
    expect(() => f.store.confirm(f.principal, f.block, a.token, "policy-v1", signal(), apply)).toThrow();
    f.store.confirm(f.principal, f.block, b.token, "policy-v1", signal(), apply); expect(() => f.store.cancel(f.principal, f.block, b.token)).toThrow();
  });
  it("BR-T08 a competing handle wins once and stale review cannot apply", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcpcn-block-race-")); disposals.push(() => rmSync(dir, { recursive: true }));
    const f = opened("collect-missing-data", undefined, join(dir, "authored.sqlite")), a = prepared(f).prepared!;
    const second = opened("collect-missing-data", undefined, join(dir, "authored.sqlite")), b = prepared(second).prepared!;
    f.store.confirm(f.principal, f.block, a.token, "policy-v1", signal(), apply);
    expect(() => second.store.confirm(second.principal, second.block, b.token, "policy-v1", signal(), apply)).toThrow();
    expect(second.store.read(second.principal, second.block, "authored-record").revision).toBe(2);
  });
  it("BR-T09 reopen retains state, audit and consumed-token receipt", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcpcn-block-reopen-")); disposals.push(() => rmSync(dir, { recursive: true }));
    const f = opened("collect-missing-data", undefined, join(dir, "authored.sqlite")), review = prepared(f).prepared!;
    const first = f.store.confirm(f.principal, f.block, review.token, "policy-v1", signal(), apply); f.store.close();
    const reopened = opened("collect-missing-data", undefined, join(dir, "authored.sqlite"));
    expect(reopened.store.confirm(reopened.principal, f.block, review.token, "policy-v1", signal(), apply).receipt).toEqual(first.receipt);
  });
  it("BR-T10 bounded pending reviews recover after cancel without lifetime lockout", () => {
    const f = opened(), reviews = Array.from({ length: 20 }, () => prepared(f).prepared!); expect(() => prepared(f)).toThrow();
    f.store.cancel(f.principal, f.block, reviews[0]!.token); expect(prepared(f).prepared).not.toBeNull();
  });
  it("BR-T11 SQL and audit both roll back when cancellation arrives during apply", () => {
    const f = opened(), review = prepared(f).prepared!, controller = new AbortController();
    expect(() => f.store.confirm(f.principal, f.block, review.token, "policy-v1", controller.signal, (_state, _proposal, database, plan) => {
      database.prepare("INSERT INTO mcpcn_fixture_values VALUES(?,?,?,1,'changed')").run(f.principal.workspace, f.block, "new-row"); controller.abort(); return plan.preview;
    })).toThrow();
    expect(f.database.prepare("SELECT count(*) AS n FROM mcpcn_fixture_values").get()?.n).toBe(0); expect(f.store.read(f.principal, f.block, "authored-record").audit).toEqual([]);
  });
  it("BR-T12 raw token is absent from SQLite and revoked grants deny replay", () => {
    const f = opened(), review = prepared(f).prepared!, raw = JSON.stringify(f.database.prepare("SELECT * FROM mcpcn_block_reviews").all());
    expect(raw).not.toContain(review.token); f.store.confirm(f.principal, f.block, review.token, "policy-v1", signal(), apply);
    expect(() => f.store.confirm({ ...f.principal, grants: [] }, f.block, review.token, "policy-v1", signal(), apply)).toThrow();
  });
});
describe("BR-P: real SDK planner and executor boundaries", () => {
  it("BR-P01 invalid/known/extra form keys do not prepare or save", async () => {
    const f = await connected("collect-missing-data");
    for (const values of [{ amount: "NaN", enabled: false }, { amount: "0", enabled: "false" }, { amount: "0", enabled: false, account: "overwrite" }]) {
      expect((await f.call("prepare", { id: "authored-record", revision: 1, proposal: { action: "submit", values } })).isError).toBe(true);
    }
    expect(f.database.prepare("SELECT count(*) AS n FROM mcpcn_block_reviews").get()?.n).toBe(0);
  });
  it("BR-P02 failed bulk member rolls back earlier selected SQL changes", async () => {
    const f = await connected("table-bulk-action-review"); f.database.prepare("UPDATE mcpcn_fixture_values SET revision=5 WHERE target='two'").run();
    const before = f.database.prepare("SELECT * FROM mcpcn_fixture_values ORDER BY target").all(), review = await f.prepare();
    const result = f.read(await f.call("confirm", { token: review.prepared!.token })); expect(result.state.status).toBe("failed");
    expect(f.database.prepare("SELECT * FROM mcpcn_fixture_values ORDER BY target").all()).toEqual(before); expect(result.audit).toHaveLength(1);
    expect(f.read(await f.call("confirm", { token: review.prepared!.token }))).toEqual(result);
  });
  it("BR-P03 duplicate/unknown/unavailable bulk ids are refused before SQL", async () => {
    const f = await connected("table-bulk-action-review");
    for (const rowIds of [["one", "one"], ["missing"], []]) expect((await f.call("prepare", { id: "authored-record", revision: 1, proposal: { action: "apply-rows", rowIds } })).isError).toBe(true);
  });
  it("BR-P04 retry cannot skip an earlier unfinished step or run a succeeded one", async () => {
    const f = await connected("multi-step-tool-run");
    for (const proposal of [{ action: "run-step", stepId: "queued" }, { action: "retry", stepId: "retained" }]) expect((await f.call("prepare", { id: "authored-record", revision: 1, proposal })).isError).toBe(true);
  });
  it("BR-P05 an unknown executor cannot prepare a review", async () => {
    const f = await connected("approval-gated-tool-call", { executors: {} }); expect((await f.call("prepare", { id: "authored-record", revision: 1, proposal: { action: "approve" } })).isError).toBe(true);
  });
  it("BR-P06 an executor failure is sanitized and cannot leak its private error", async () => {
    const f = await connected("approval-gated-tool-call", { executors: { "set-reviewed-value": () => { throw new Error("private-executor-secret"); } } });
    const review = await f.prepare(), result = await f.call("confirm", { token: review.prepared!.token });
    expect(f.read(result).state.status).toBe("failed"); expect(JSON.stringify(result)).not.toContain("private-executor-secret");
  });
  it("BR-P07 a foreign filename, malformed UTF-8 and missing extraction are refused", async () => {
    const f = await connected("file-upload-and-extract");
    for (const proposal of [{ action: "accept-file" }, { action: "extract-file", fileName: "x.pdf", kind: "invoice", text: "text" },
      { action: "extract-file", fileName: "x.txt", kind: "invoice", text: "\ud800" }]) expect((await f.call("prepare", { id: "authored-record", revision: 1, proposal })).isError).toBe(true);
  });
  it("BR-P08 the original request context reaches the resolver on every request", async () => {
    const contexts: unknown[] = []; const f = await connected("collect-missing-data", { resolvePrincipal: context => { contexts.push(context); return blockFixturePrincipal; } });
    await f.call("read", { id: "authored-record" }); await f.prepare(); expect(contexts).toHaveLength(2);
    for (const context of contexts) expect(context).toMatchObject({ signal: expect.any(AbortSignal), requestId: expect.anything() });
  });
  it("BR-P09 dispose during principal resolution prevents any prepare record", async () => {
    let entered!: () => void, release!: () => void; const started = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
    const f = await connected("collect-missing-data", { resolvePrincipal: async () => { entered(); await held; return blockFixturePrincipal; } });
    const result = f.call("prepare", { id: "authored-record", revision: 1, proposal: f.fixture.proposal }); await started; f.registration.dispose(); release();
    expect((await result).isError).toBe(true); expect(f.database.prepare("SELECT count(*) AS n FROM mcpcn_block_reviews").get()?.n).toBe(0);
  });
  it("BR-P10 all eleven registrations coexist and disposing one keeps the others", async () => {
    const f = opened(), server = new McpServer({ name: "all-blocks", version: "1" }), client = new Client({ name: "all-client", version: "1" });
    const registrations = BlockKindSchema.options.map(block => registerBlockServer(server, block, { store: f.store, policyRevision: "policy-v1", html: "<html>Authored</html>", resolvePrincipal: () => f.principal }));
    disposals.push(async () => { registrations.forEach(registration => registration.dispose()); await client.close(); await server.close(); });
    const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(a); await client.connect(b); expect((await client.listTools()).tools).toHaveLength(44);
    registrations[0]!.dispose(); expect((await client.listTools()).tools).toHaveLength(40); expect((await client.listResources()).resources).toHaveLength(10);
  });
  it("BR-P11 registration collision removes only newly owned registrations", async () => {
    const f = opened(), server = new McpServer({ name: "collision", version: "1" }), client = new Client({ name: "collision-client", version: "1" });
    const first = registerBlockServer(server, f.block, { store: f.store, policyRevision: "policy-v1", html: "<html>Authored</html>", resolvePrincipal: () => f.principal });
    expect(() => registerBlockServer(server, f.block, { store: f.store, policyRevision: "policy-v1", html: "<html>Other</html>", resolvePrincipal: () => f.principal })).toThrow();
    disposals.push(async () => { first.dispose(); await client.close(); await server.close(); }); const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(a); await client.connect(b);
    expect((await client.listTools()).tools).toHaveLength(4); expect((await client.listResources()).resources).toHaveLength(1);
    first.dispose();
    const owner = server.registerTool(first.tools.prepare, { description: "Existing owner registration" }, async () => ({ content: [{ type: "text" as const, text: "Owned tool" }] }));
    expect(() => registerBlockServer(server, f.block, { store: f.store, policyRevision: "policy-v1", html: "<html>Partial attempt</html>", resolvePrincipal: () => f.principal })).toThrow();
    expect((await client.listTools()).tools.map(tool => tool.name)).toEqual([first.tools.prepare]); expect((await client.listResources()).resources).toHaveLength(0); owner.remove();
  });
  it("BR-P12 an asynchronous executor result rolls back its SQL work", async () => {
    const executor = ((context: Parameters<(typeof blockFixtureExecutors)[string]>[0]) => {
      blockFixtureExecutors["set-reviewed-value"]!(context); return Promise.resolve({ invalid: "asynchronous" });
    }) as unknown as (typeof blockFixtureExecutors)[string];
    const f = await connected("approval-gated-tool-call", { executors: { "set-reviewed-value": executor } });
    const before = f.database.prepare("SELECT * FROM mcpcn_fixture_values").all(), review = await f.prepare();
    expect(f.read(await f.call("confirm", { token: review.prepared!.token })).state.status).toBe("failed"); expect(f.database.prepare("SELECT * FROM mcpcn_fixture_values").all()).toEqual(before);
  });
  it("BR-P13 changing terms without a revision cannot substitute an operation", async () => {
    const f = await connected("approval-gated-tool-call"), review = await f.prepare(), changed = createBlockFixture(f.block).initial;
    if (!("operation" in changed)) throw new Error("fixture_operation_required"); changed.operation.arguments.value = "substituted";
    f.database.prepare("UPDATE mcpcn_block_records SET state=?").run(JSON.stringify(changed));
    expect((await f.call("confirm", { token: review.prepared!.token })).isError).toBe(true); expect(f.database.prepare("SELECT value FROM mcpcn_fixture_values").get()?.value).toBe("draft");
  });
  it("BR-P14 selecting an unavailable option cannot prepare", async () => {
    const f = await connected("compare-options-approve"), changed = createBlockFixture(f.block).initial;
    if (changed.block !== "compare-options-approve") throw new Error("fixture_options_required"); changed.options[1]!.disabled = true;
    f.database.prepare("UPDATE mcpcn_block_records SET state=?").run(JSON.stringify(changed)); expect((await f.call("prepare", { id: "authored-record", revision: 1, proposal: f.fixture.proposal })).isError).toBe(true);
  });
  it("BR-P15 a report requires a nonblank reviewed conclusion and supplied sources", async () => {
    const f = await connected("agent-generated-report-review"); expect((await f.call("prepare", { id: "authored-record", revision: 1, proposal: { action: "review-report", conclusion: "   " } })).isError).toBe(true);
    const changed = createBlockFixture(f.block).initial; if (changed.block !== "agent-generated-report-review") throw new Error("fixture_report_required"); changed.sources = [];
    f.database.prepare("UPDATE mcpcn_block_records SET state=?").run(JSON.stringify(changed)); expect((await f.call("prepare", { id: "authored-record", revision: 1, proposal: f.fixture.proposal })).isError).toBe(true);
  });
  it("BR-P16 disposal inside a SQL callback aborts its whole confirmation", async () => {
    let dispose: () => void = () => undefined;
    const f = await connected("approval-gated-tool-call", { executors: { "set-reviewed-value": context => {
      const result = blockFixtureExecutors["set-reviewed-value"]!(context); dispose(); return result;
    } } }); dispose = () => f.registration.dispose(); const review = await f.prepare();
    expect((await f.call("confirm", { token: review.prepared!.token })).isError).toBe(true); expect(f.database.prepare("SELECT value FROM mcpcn_fixture_values").get()?.value).toBe("draft");
    expect(f.store.read(f.principal, f.block, "authored-record").audit).toHaveLength(0);
  });
});

/** Authored disposable examples. Importing this module does not open a database or run a check. */
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { z } from "zod";
import { BlockKindSchema, BlockRecordSchema, PublicBlockRecordSchema, BLOCK_METADATA_KEY, blockToolNames,
  type BlockKind, type BlockState, type BlockProposal } from "@mcpcn/schemas/blocks";
import { BlockWorkflowStore, registerBlockServer, type BlockPrincipal, type BlockExecutors } from "./block-recipes.js";

export const BLOCK_FIXTURE_ID = "authored-record";
export const blockFixturePrincipal: BlockPrincipal = { workspace: "authored-workspace", actor: "authored-reviewer", grants: [...BlockKindSchema.options] };
const idle = () => ({ status: "idle" as const, result: null, message: "" });
const source = { id: "authored-source", label: "Authored source", url: "https://example.com/authored-source",
  excerpt: "Name: Ada Sample\nSupplier: Example Workshop\nTotal: 0\nCurrency: EUR\nKeep the complete authored source and its trailing evidence." };
const fields = [{ name: "amount", label: "Amount", type: "number" as const, required: true, original: "10", source: "Total: 10" },
  { name: "enabled", label: "Enabled", type: "boolean" as const, required: false, original: true, source: "Enabled: true" }];
const operation = (target = "setting", expected = "draft", value = "reviewed") => ({ name: "set-reviewed-value",
  arguments: { target, expected, value, revision: 1 } });
const changes = [{ label: "Setting", before: "draft", after: "reviewed" }];
export function createBlockFixture(block: BlockKind): { initial: BlockState; proposal: BlockProposal; expectedStatus: string } {
  BlockKindSchema.parse(block);
  const common = { block, title: "Authored " + block, description: "Disposable, transaction-local example. No provider, message, payment or production account is involved." };
  switch (block) {
    case "review-before-action": case "approval-gated-tool-call": case "admin-change-review":
      return { initial: { ...common, block, status: "ready", changes, riskLevel: "high", operation: operation(), execution: idle(),
        ...(block === "admin-change-review" ? { affectedCount: 1, rollback: "Create a separately reviewed inverse change using the current business revision." } : {}) } as BlockState,
        proposal: { action: "approve" }, expectedStatus: "completed" };
    case "collect-missing-data": return { initial: { ...common, block, status: "needs-data", fields, known: { account: "Read-only authored context" }, values: {} },
      proposal: { action: "submit", values: { amount: "0", enabled: false } }, expectedStatus: "collected" };
    case "extract-review-save": return { initial: { ...common, block, status: "extracted", fields, values: { amount: "10", enabled: true }, sources: [source] },
      proposal: { action: "submit", values: { amount: "0", enabled: false } }, expectedStatus: "saved" };
    case "human-corrects-ai-output": return { initial: { ...common, block, status: "needs-correction", fields, values: { amount: "10", enabled: true }, sources: [source] },
      proposal: { action: "submit", values: { amount: "0", enabled: false } }, expectedStatus: "corrected" };
    case "compare-options-approve": return { initial: { ...common, block, status: "ready", selectedId: null,
      options: ["first", "second"].map(id => ({ id, label: "Option " + id, description: "Complete authored option " + id,
        evidence: [source.excerpt], value: { amount: 0, enabled: false, nested: { complete: "Trailing option evidence" } }, changes, disabled: false })) },
      proposal: { action: "choose", optionId: "second" }, expectedStatus: "selected" };
    case "multi-step-tool-run": return { initial: { ...common, block, status: "partial", steps: [
      { id: "retained", label: "Earlier completed step", description: "Retained earlier result", status: "succeeded", attempts: 1, operation: operation("retained"), result: { retained: true }, error: null },
      { id: "retry", label: "Failed local step", description: "Retry only this eligible step", status: "failed", attempts: 1, operation: operation("retry"), result: null, error: "Authored earlier failure" },
      { id: "queued", label: "Queued local step", description: "Runs only after a separate review", status: "queued", attempts: 0, operation: operation("queued"), result: null, error: null },
    ] }, proposal: { action: "retry", stepId: "retry" }, expectedStatus: "partial" };
    case "agent-generated-report-review": return { initial: { ...common, block, status: "ready", summary: "Complete authored report summary.",
      sections: [{ id: "evidence", title: "Evidence", body: "Authored report evidence remains complete, including zero and false.\n".repeat(180) + "FINAL_REPORT_EVIDENCE" }],
      conclusion: "Draft conclusion", sources: [source] }, proposal: { action: "review-report", conclusion: "Reviewed conclusion: zero cost; disabled option retained." }, expectedStatus: "approved" };
    case "file-upload-and-extract": return { initial: { ...common, block, status: "empty", file: null, fields: [] },
      proposal: { action: "extract-file", fileName: "authored-invoice.txt", kind: "invoice", text: "\uFEFFSupplier: Example Workshop\r\nTotal: 0\r\nCurrency: EUR\r\nTrailing complete source.\r\n" }, expectedStatus: "extracted" };
    case "table-bulk-action-review": return { initial: { ...common, block, status: "ready", riskLevel: "high", selectedIds: [],
      rows: ["one", "two", "untouched"].map(id => ({ id, revision: 1, label: "Row " + id, changes, operation: operation(id), disabled: false, execution: idle() })) },
      proposal: { action: "apply-rows", rowIds: ["two", "one"] }, expectedStatus: "applied" };
  }
}

/** These real SQL rows intentionally live in the same dedicated workflow database. */
export function seedBlockFixture(database: DatabaseSync, store: BlockWorkflowStore, principal: BlockPrincipal, block: BlockKind, id = BLOCK_FIXTURE_ID) {
  database.exec(`CREATE TABLE IF NOT EXISTS mcpcn_fixture_values (workspace TEXT NOT NULL,block TEXT NOT NULL,target TEXT NOT NULL,
    revision INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(workspace,block,target)) STRICT;`);
  const fixture = createBlockFixture(block);
  const operations = "operation" in fixture.initial ? [fixture.initial.operation]
    : fixture.initial.block === "multi-step-tool-run" ? fixture.initial.steps.map(step => step.operation)
    : fixture.initial.block === "table-bulk-action-review" ? fixture.initial.rows.map(row => row.operation) : [];
  for (const operation of operations) {
    const retained = fixture.initial.block === "multi-step-tool-run" && fixture.initial.steps.some(step => step.status === "succeeded" && step.operation.arguments.target === operation.arguments.target);
    database.prepare("INSERT OR IGNORE INTO mcpcn_fixture_values(workspace,block,target,revision,value) VALUES(?,?,?,?,?)")
      .run(principal.workspace, block, String(operation.arguments.target), retained ? 2 : 1, String(retained ? operation.arguments.value : operation.arguments.expected));
  }
  store.seed(principal, block, id, fixture.initial); return fixture;
}
export const blockFixtureExecutors: BlockExecutors = {
  "set-reviewed-value": ({ database, principal, block, operation }) => {
    const input = z.object({ target: z.string(), expected: z.string(), value: z.string(), revision: z.number().int().positive() }).strict().parse(operation.arguments);
    const result = database.prepare(`UPDATE mcpcn_fixture_values SET value=?,revision=revision+1
      WHERE workspace=? AND block=? AND target=? AND revision=? AND value=?`)
      .run(input.value, principal.workspace, block, input.target, input.revision, input.expected);
    if (result.changes !== 1) throw new Error("fixture_business_revision_conflict");
    return { target: input.target, value: input.value, revision: input.revision + 1, amount: 0, enabled: false };
  },
};
export function blockFixtureResult(block: BlockKind) {
  const { expectedStatus } = createBlockFixture(block);
  const actions: Record<BlockKind, string> = { "review-before-action": "execute-reviewed", "collect-missing-data": "collect-fields", "extract-review-save": "save-fields",
    "compare-options-approve": "select-option", "multi-step-tool-run": "retry-step", "approval-gated-tool-call": "execute-reviewed", "human-corrects-ai-output": "correct-fields",
    "agent-generated-report-review": "approve-report", "file-upload-and-extract": "extract-text", "table-bulk-action-review": "apply-selected-rows", "admin-change-review": "execute-reviewed" };
  return PublicBlockRecordSchema.parse({ block, id: BLOCK_FIXTURE_ID, revision: 2, status: expectedStatus,
    receipt: { sequence: 1, recordId: BLOCK_FIXTURE_ID, revision: 2, action: actions[block], at: "2026-11-10T00:00:00.000Z" } });
}

/** Explicit runnable real SDK/SQLite check, shared by each editable installed block test. */
export async function exerciseBlockFixture(block: BlockKind) {
  const [{ McpServer }, { Client }, { InMemoryTransport }, { CallToolResultSchema }] = await Promise.all([
    import("@modelcontextprotocol/sdk/server/mcp.js"), import("@modelcontextprotocol/sdk/client/index.js"),
    import("@modelcontextprotocol/sdk/inMemory.js"), import("@modelcontextprotocol/sdk/types.js"),
  ]);
  const database = new DatabaseSync(":memory:"), store = new BlockWorkflowStore(database), principal = structuredClone(blockFixturePrincipal);
  const fixture = seedBlockFixture(database, store, principal, block), server = new McpServer({ name: "authored-block", version: "1.0.0" });
  const registration = registerBlockServer(server, block, { store, policyRevision: "authored-policy-v1", resolvePrincipal: () => principal,
    executors: blockFixtureExecutors, html: "<!doctype html><html><body>Use the matching built bound block app.</body></html>" });
  const client = new Client({ name: "authored-block-check", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const call = async (name: string, args: Record<string, unknown>) => CallToolResultSchema.parse(await client.callTool({ name, arguments: args }));
  const record = (result: Awaited<ReturnType<typeof call>>) => {
    assert.notEqual(result.isError, true); return BlockRecordSchema.parse(result._meta?.[BLOCK_METADATA_KEY]);
  };
  const rows = () => database.prepare("SELECT target,revision,value FROM mcpcn_fixture_values WHERE workspace=? AND block=? ORDER BY target")
    .all(principal.workspace, block);
  try {
    await server.connect(a); await client.connect(b);
    const listed = await client.listTools(); assert.equal(listed.tools.length, 4); assert.deepEqual(new Set(listed.tools.map(tool => tool.name)), new Set(Object.values(registration.tools)));
    const resource = await client.readResource({ uri: registration.resourceUri }); assert.equal(resource.contents.length, 1);
    const initial = record(await call(registration.tools.read, { id: BLOCK_FIXTURE_ID })); assert.equal(initial.revision, 1);
    const before = rows(), preparedResult = await call(registration.tools.prepare, { id: initial.id, revision: 1, proposal: fixture.proposal });
    const prepared = record(preparedResult); assert.equal(prepared.revision, 1); assert.ok(prepared.prepared); assert.deepEqual(rows(), before);
    assert.equal(JSON.stringify(preparedResult.structuredContent).includes("authored-policy-v1"), false);
    assert.equal(JSON.stringify(preparedResult.content).includes(prepared.prepared.token), false);
    const args = { token: prepared.prepared.token }, savedResult = await call(registration.tools.confirm, args), saved = record(savedResult);
    const publicSaved = PublicBlockRecordSchema.parse((savedResult.structuredContent as { data: unknown }).data);
    assert.equal(publicSaved.receipt?.action, blockFixtureResult(block).receipt?.action);
    assert.equal(saved.revision, 2); assert.equal(saved.state.status, fixture.expectedStatus); assert.equal(saved.audit.length, 1); assert.equal(saved.prepared, null);
    const after = rows(), replay = await call(registration.tools.confirm, args); assert.deepEqual(record(replay), saved);
    assert.deepEqual(PublicBlockRecordSchema.parse((replay.structuredContent as { data: unknown }).data).receipt,
      PublicBlockRecordSchema.parse((savedResult.structuredContent as { data: unknown }).data).receipt); assert.deepEqual(rows(), after);
    if (saved.state.block === "collect-missing-data" || saved.state.block === "extract-review-save" || saved.state.block === "human-corrects-ai-output") {
      assert.deepEqual(saved.state.values, { amount: "0", enabled: false });
    }
    if (saved.state.block === "compare-options-approve") assert.equal(saved.state.selectedId, "second");
    if (saved.state.block === "agent-generated-report-review") assert.equal(saved.state.conclusion, fixture.proposal.action === "review-report" ? fixture.proposal.conclusion : "invalid");
    if (["review-before-action", "approval-gated-tool-call", "admin-change-review", "table-bulk-action-review", "multi-step-tool-run"].includes(block)) {
      assert.notDeepEqual(after, before); assert.ok(after.some(row => row.value === "reviewed" && row.revision === 2));
    }
    if (saved.state.block === "table-bulk-action-review") {
      assert.equal(after.find(row => row.target === "untouched")?.value, "draft");
      assert.equal(after.filter(row => row.value === "reviewed").length, 2);
    }
    if (saved.state.block === "multi-step-tool-run") {
      assert.deepEqual(saved.state.steps[0], fixture.initial.block === "multi-step-tool-run" ? fixture.initial.steps[0] : null);
      assert.equal(saved.state.steps[1]?.attempts, 2); assert.equal(saved.state.steps[2]?.attempts, 0);
      const next = record(await call(registration.tools.prepare, { id: saved.id, revision: 2, proposal: { action: "run-step", stepId: "queued" } }));
      const completed = record(await call(registration.tools.confirm, { token: next.prepared!.token }));
      assert.equal(completed.state.status, "completed"); assert.equal(completed.revision, 3);
    }
    if (saved.state.block === "file-upload-and-extract") {
      assert.equal(saved.state.fields.find(field => field.id === "total")?.value, "0");
      assert.equal(saved.state.file?.text, fixture.proposal.action === "extract-file" ? fixture.proposal.text : null);
      const next = record(await call(registration.tools.prepare, { id: saved.id, revision: 2, proposal: { action: "accept-file" } }));
      assert.equal(record(await call(registration.tools.confirm, { token: next.prepared!.token })).state.status, "accepted");
    }
    const persisted = record(await call(registration.tools.read, { id: saved.id })); assert.equal(persisted.audit.length, persisted.revision - 1);
    principal.workspace = "another-workspace"; assert.equal((await call(registration.tools.read, { id: saved.id })).isError, true);
    principal.workspace = blockFixturePrincipal.workspace; principal.grants = [];
    assert.equal((await call(registration.tools.confirm, args)).isError, true);
    return { block, realSdk: true, database: "node:sqlite", revision: persisted.revision, auditEvents: persisted.audit.length };
  } finally { registration.dispose(); await client.close(); await server.close(); store.close(); }
}

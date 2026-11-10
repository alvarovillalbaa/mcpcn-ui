// T2: authored records and real disposable SQLite connections only.
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { WorkflowStore, type Principal } from "./store.js";

const principal: Principal = { workspace: "workspace-one", actor: "reviewer-one", grants: ["admin-settings-change", "hr-candidate-review"] };
const workflow = "admin-settings-change" as const;
type State = { status: string; zero: number; enabled: boolean; absent: null };
const initial: State = { status: "unchanged", zero: 0, enabled: false, absent: null };
const stores: WorkflowStore[] = [], directories: string[] = [];
function setup(database = ":memory:", clock = { value: Date.UTC(2026, 10, 10) }) {
  const db = new DatabaseSync(database), store = new WorkflowStore(db, () => clock.value); stores.push(store); store.seed(principal, workflow, "record-one", initial);
  return { db, store, clock };
}
function proposal(state: State) { return { state: { ...state, status: "changed", enabled: true }, action: "change", title: "Apply authored setting", description: "Authored review", riskLevel: "high" as const, changes: [{ label: "Enabled", before: "false", after: "true" }] }; }
function prepare(store: WorkflowStore) { return store.prepare<State>(principal, workflow, "record-one", 1, proposal).prepared!; }
function disk() {
  const root = process.env.MCPCN_RF_RUN_ROOT ?? fs.realpathSync(os.tmpdir());
  if (process.env.MCPCN_RF_RUN_ROOT && fs.readFileSync(path.join(root, ".owner"), "utf8") !== process.env.MCPCN_RF_NONCE) throw new Error("owned_ci_required_for_disk_check");
  const dir = fs.mkdtempSync(path.join(root, "store-check-")); directories.push(dir); return path.join(dir, "authored.sqlite");
}
afterEach(() => { for (const store of stores.splice(0)) store.close(); for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true }); });

describe("T2 reference workflow transactions", () => {
  it("RF-S01 creates a real empty schema and retains complete zero/false/null values", () => {
    const { store } = setup(); expect(store.read(principal, workflow, "record-one")).toMatchObject({ revision: 1, state: initial, audit: [], prepared: null });
  });
  it("RF-S02 never overwrites an existing seeded record", () => {
    const { store } = setup(); store.seed(principal, workflow, "record-one", { status: "REPLACE_ME" }); expect(store.read(principal, workflow, "record-one").state).toEqual(initial);
  });
  it("RF-S03 returns owned records independent of caller mutation", () => {
    const { store } = setup(), view = store.read<State>(principal, workflow, "record-one"); view.state.enabled = true; view.audit.push({ sequence: 1, recordId: "record-one", revision: 1, action: "fake", actor: "fake", at: "fake", summary: "fake" });
    expect(store.read(principal, workflow, "record-one")).toMatchObject({ state: initial, audit: [] });
  });
  it("RF-S04 requires an explicit workflow grant before reading", () => {
    const { store } = setup(); expect(() => store.read({ ...principal, grants: [] }, workflow, "record-one")).toThrow();
  });
  it("RF-S05 isolates the same record identifier by workspace", () => {
    const { store } = setup(); expect(() => store.read({ ...principal, workspace: "other-workspace" }, workflow, "record-one")).toThrow();
  });
  it("RF-S06 isolates the same record identifier by workflow", () => {
    const { store } = setup(); expect(() => store.read(principal, "hr-candidate-review", "record-one")).toThrow();
  });
  it("RF-S07 rejects malformed principals and record identities", () => {
    const { store } = setup(); for (const id of ["", "../record-one", "x".repeat(81)]) expect(() => store.read(principal, workflow, id)).toThrow();
    expect(() => store.read({ ...principal, actor: "" }, workflow, "record-one")).toThrow();
  });
  it("RF-S08 prepares exact terms without changing business state or audit", () => {
    const { store } = setup(), prepared = prepare(store); expect(prepared).toMatchObject({ title: "Apply authored setting", proposed: { ...initial, status: "changed", enabled: true } });
    expect(prepared.token).toMatch(/^[a-f0-9]{64}$/); expect(store.read(principal, workflow, "record-one")).toMatchObject({ revision: 1, state: initial, audit: [] });
  });
  it("RF-S09 commits state, revision and exactly one real audit row", () => {
    const { store, db } = setup(), token = prepare(store).token, result = store.commit<State>(principal, workflow, token);
    expect(result).toMatchObject({ replay: false, receipt: { sequence: 1, revision: 2, action: "change" }, view: { revision: 2, state: { enabled: true }, audit: [{ actor: principal.actor, revision: 2 }] } });
    expect(db.prepare("SELECT count(*) AS count FROM audit").get()?.count).toBe(1);
  });
  it("RF-S10 exact-token replay returns its original receipt without repeating mutation", () => {
    const { store, db } = setup(), token = prepare(store).token, first = store.commit(principal, workflow, token), replay = store.commit(principal, workflow, token);
    expect(replay.replay).toBe(true); expect(replay.receipt).toEqual(first.receipt); expect(replay.view.revision).toBe(2); expect(db.prepare("SELECT count(*) AS count FROM audit").get()?.count).toBe(1);
  });
  it("RF-S11 refuses a token prepared by another actor", () => {
    const { store } = setup(), token = prepare(store).token; expect(() => store.commit({ ...principal, actor: "reviewer-two" }, workflow, token)).toThrow(); expect(store.read(principal, workflow, "record-one").revision).toBe(1);
  });
  it("RF-S12 refuses a token prepared in another workspace", () => {
    const { store } = setup(), token = prepare(store).token; expect(() => store.commit({ ...principal, workspace: "workspace-two" }, workflow, token)).toThrow();
  });
  it("RF-S13 refuses a token belonging to another workflow", () => {
    const { store } = setup(), token = prepare(store).token; expect(() => store.commit(principal, "hr-candidate-review", token)).toThrow();
  });
  it("RF-S14 refuses unknown, malformed and guessed tokens", () => {
    const { store } = setup(); for (const token of ["", "f".repeat(63), "x".repeat(64), "f".repeat(64)]) expect(() => store.commit(principal, workflow, token)).toThrow();
  });
  it("RF-S15 refuses expired unconsumed reviews", () => {
    const { store, clock } = setup(), token = prepare(store).token; clock.value += 300001; expect(() => store.commit(principal, workflow, token)).toThrow(); expect(store.read(principal, workflow, "record-one").audit).toEqual([]);
  });
  it("RF-S16 retains a consumed receipt for exact replay after expiry", () => {
    const { store, clock } = setup(), token = prepare(store).token, first = store.commit(principal, workflow, token); clock.value += 300001;
    expect(store.commit(principal, workflow, token)).toMatchObject({ replay: true, receipt: first.receipt });
  });
  it("RF-S17 refuses a stale prepare revision before invoking proposal code", () => {
    const { store } = setup(); let called = false; expect(() => store.prepare<State>(principal, workflow, "record-one", 2, state => { called = true; return proposal(state); })).toThrow(); expect(called).toBe(false);
  });
  it("RF-S18 invalidates a second prepared review after the first commits", () => {
    const { store } = setup(), a = prepare(store), b = prepare(store); store.commit(principal, workflow, a.token); expect(() => store.commit(principal, workflow, b.token)).toThrow(); expect(store.read(principal, workflow, "record-one").audit).toHaveLength(1);
  });
  it("RF-S19 preserves a prepared snapshot when caller objects are changed", () => {
    const { store } = setup(), prepared = prepare(store); prepared.proposed.enabled = false; prepared.changes[0]!.after = "FORGED";
    expect(store.commit<State>(principal, workflow, prepared.token).view.state.enabled).toBe(true);
  });
  it("RF-S20 rolls back a failed domain revalidation without consuming the token", () => {
    const { store } = setup(), token = prepare(store).token; expect(() => store.commit(principal, workflow, token, () => { throw new Error("Authored validation refusal"); })).toThrow();
    expect(store.read(principal, workflow, "record-one")).toMatchObject({ revision: 1, state: initial, audit: [] }); expect(store.commit(principal, workflow, token).receipt.sequence).toBe(1);
  });
  it("RF-S21 rolls back proposal exceptions and malformed review declarations", () => {
    const { store } = setup(); expect(() => store.prepare(principal, workflow, "record-one", 1, () => { throw new Error("Authored failure"); })).toThrow();
    expect(() => store.prepare<State>(principal, workflow, "record-one", 1, state => ({ ...proposal(state), changes: [] }))).toThrow(); expect(store.read(principal, workflow, "record-one").audit).toEqual([]);
  });
  it("RF-S22 bounds serialized records rather than silently truncating values", () => {
    const { store } = setup(); expect(() => store.seed(principal, workflow, "large-record", { text: "x".repeat(1024 * 1024) })).toThrow(); expect(() => store.read(principal, workflow, "large-record")).toThrow();
  });
  it("RF-S23 retains multiple distinct audit events in order", () => {
    const { store } = setup(); store.commit(principal, workflow, prepare(store).token);
    const review = store.prepare<State>(principal, workflow, "record-one", 2, state => ({ ...proposal(state), state: { ...state, enabled: false }, action: "rollback", title: "Restore authored setting" }));
    store.commit(principal, workflow, review.prepared!.token); expect(store.read(principal, workflow, "record-one").audit.map(event => [event.sequence, event.revision, event.action])).toEqual([[1, 2, "change"], [2, 3, "rollback"]]);
  });
  it("RF-S24 refuses further access after owned database closure", () => {
    const { store } = setup(); store.close(); store.close(); expect(store.isClosed).toBe(true); expect(() => store.read(principal, workflow, "record-one")).toThrow();
  });
  it("RF-S25 refuses a foreign SQLite schema without altering it", () => {
    const db = new DatabaseSync(":memory:"); try { db.exec("CREATE TABLE keep_me(value TEXT)"); expect(() => new WorkflowStore(db)).toThrow(); expect(db.prepare("SELECT name FROM sqlite_master WHERE name='keep_me'").get()?.name).toBe("keep_me"); } finally { db.close(); }
  });
  it("RF-S26 persists records, reviews and receipts across real connection reopen", () => {
    const file = disk(), first = setup(file), token = prepare(first.store).token; first.store.close(); const second = setup(file); const receipt = second.store.commit(principal, workflow, token).receipt; second.store.close();
    const third = setup(file); expect(third.store.read<State>(principal, workflow, "record-one")).toMatchObject({ revision: 2, state: { enabled: true }, audit: [{ sequence: receipt.sequence }] }); expect(third.store.commit(principal, workflow, token).receipt).toEqual(receipt);
  });
  it("RF-S27 serializes competing real file connections and refuses stale confirmation", () => {
    const file = disk(), a = setup(file), b = setup(file), first = prepare(a.store), second = prepare(b.store);
    a.store.commit(principal, workflow, first.token); expect(() => b.store.commit(principal, workflow, second.token)).toThrow(); expect(b.store.read(principal, workflow, "record-one").audit).toHaveLength(1);
  });
  it("RF-S28 checks a revoked workflow grant even on receipt replay", () => {
    const { store } = setup(), token = prepare(store).token; store.commit(principal, workflow, token); expect(() => store.commit({ ...principal, grants: [] }, workflow, token)).toThrow();
  });
  it("RF-S29 revokes a cancelled review without changing records or audit", () => {
    const { store } = setup(), token = prepare(store).token; expect(store.cancel(principal, workflow, token)).toMatchObject({ revision: 1, state: initial, audit: [] });
    expect(() => store.commit(principal, workflow, token)).toThrow(); expect(store.read(principal, workflow, "record-one").revision).toBe(1);
  });
  it("RF-S30 binds cancellation to its actor and never undoes a consumed receipt", () => {
    const { store } = setup(), token = prepare(store).token; expect(() => store.cancel({ ...principal, actor: "other-reviewer" }, workflow, token)).toThrow();
    store.commit(principal, workflow, token); expect(() => store.cancel(principal, workflow, token)).toThrow(); expect(store.read(principal, workflow, "record-one")).toMatchObject({ revision: 2, state: { enabled: true } });
  });
});

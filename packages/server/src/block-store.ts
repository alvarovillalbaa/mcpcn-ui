import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { BlockKindSchema, BlockIdentitySchema, BlockRevisionSchema, BlockStateSchema, BlockProposalSchema, BlockExtractProposalSchema,
  BlockTermsSchema, BlockRecordSchema, BlockReceiptSchema, BlockTokenSchema,
  type BlockKind, type BlockState, type BlockProposal, type BlockTerms, type BlockRecord, type BlockReceipt } from "@mcpcn/schemas/blocks";
import { wireSnapshot } from "./wire.js";

const PrincipalSchema = z.object({ workspace: BlockIdentitySchema, actor: BlockIdentitySchema,
  grants: z.array(BlockKindSchema).max(11).refine(grants => new Set(grants).size === grants.length) }).strict();
export type BlockPrincipal = z.infer<typeof PrincipalSchema>;
export type BlockPlan = { terms: BlockTerms; preview: BlockState };
export const BLOCK_DATABASE_APPLICATION_ID = 1296257092;
const require = (value: unknown): void => { if (!value) throw new Error("mcpcn_block_request_refused"); };
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
function encoded(value: unknown, limit: number) {
  const text = JSON.stringify(wireSnapshot(value)); require(Buffer.byteLength(text) <= limit); return text;
}
function state(value: unknown, block: BlockKind): BlockState {
  // Budget nesting at the deepest actual app-metadata position, not as a bare value.
  const bounded = wireSnapshot({ _meta: { block: { prepared: { preview: value } } } });
  const result = BlockStateSchema.parse(bounded._meta.block.prepared.preview); require(result.block === block);
  if (result.block === "file-upload-and-extract") {
    require(result.status === "empty" ? result.file === null && result.fields.length === 0 : result.file !== null && result.fields.length > 0);
    if (result.file) {
      const file = BlockExtractProposalSchema.parse({ action: "extract-file", fileName: result.file.name, kind: result.file.kind, text: result.file.text });
      const bytes = new TextEncoder().encode(file.text);
      require(bytes.length === result.file.bytes && createHash("sha256").update(bytes).digest("hex") === result.file.sha256);
    }
  }
  encoded(result, 512 * 1024); return result;
}
const RecordRowSchema = z.object({ revision: BlockRevisionSchema, state: z.string().max(512 * 1024) }).strict();
const ReviewRowSchema = z.object({ record_id: BlockIdentitySchema, revision: BlockRevisionSchema, policy_revision: BlockIdentitySchema,
  proposal: z.string(), terms: z.string(), preview: z.string(), expires: z.number().int(), receipt: z.string().nullable() }).strict();

/** Dedicated caller-opened Node24 database. Never opens a path or migrates foreign data. */
export class BlockWorkflowStore {
  private closed = false;
  private inTransaction = false;
  constructor(private readonly database: DatabaseSync, private readonly now: () => number = Date.now) {
    database.exec("PRAGMA busy_timeout=3000; PRAGMA foreign_keys=ON;");
    this.transaction("IMMEDIATE", () => {
      const version = database.prepare("PRAGMA user_version").get()?.user_version;
      const application = database.prepare("PRAGMA application_id").get()?.application_id;
      if (version === 0 && application === 0) {
        require(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get()?.count === 0);
        database.exec(`
          CREATE TABLE mcpcn_block_records (workspace TEXT NOT NULL, block TEXT NOT NULL, id TEXT NOT NULL,
            revision INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY(workspace,block,id)) STRICT;
          CREATE TABLE mcpcn_block_reviews (hash TEXT PRIMARY KEY, workspace TEXT NOT NULL, actor TEXT NOT NULL,
            block TEXT NOT NULL, record_id TEXT NOT NULL, revision INTEGER NOT NULL, policy_revision TEXT NOT NULL,
            proposal TEXT NOT NULL, terms TEXT NOT NULL, preview TEXT NOT NULL, expires INTEGER NOT NULL, receipt TEXT) STRICT;
          CREATE INDEX mcpcn_block_pending_reviews ON mcpcn_block_reviews(workspace,actor,block,record_id,expires);
          CREATE TABLE mcpcn_block_audit (workspace TEXT NOT NULL, block TEXT NOT NULL, record_id TEXT NOT NULL,
            revision INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, summary TEXT NOT NULL, at TEXT NOT NULL,
            PRIMARY KEY(workspace,block,record_id,revision)) STRICT;
          PRAGMA application_id=1296257092; PRAGMA user_version=1;`);
      } else require(version === 1 && application === BLOCK_DATABASE_APPLICATION_ID);
    });
    database.exec("PRAGMA journal_mode=WAL;");
  }
  authorize(principal: BlockPrincipal, block: BlockKind): BlockPrincipal {
    require(!this.closed); const selected = PrincipalSchema.parse(wireSnapshot(principal));
    BlockKindSchema.parse(block); require(selected.grants.includes(block)); return selected;
  }
  private clock() { const value = this.now(); require(Number.isSafeInteger(value) && value >= 0 && value < 8640000000000000 - 300000); return value; }
  private transaction<T>(mode: "DEFERRED" | "IMMEDIATE", body: () => T): T {
    require(!this.closed && !this.inTransaction); this.database.exec(`BEGIN ${mode}`); this.inTransaction = true;
    try { const result = body(); this.database.exec("COMMIT"); return result; }
    catch (error) { this.database.exec("ROLLBACK"); throw error; }
    finally { this.inTransaction = false; }
  }
  seed(principal: BlockPrincipal, block: BlockKind, id: string, supplied: unknown) {
    const selected = this.authorize(principal, block); BlockIdentitySchema.parse(id); const initial = encoded(state(supplied, block), 512 * 1024);
    this.transaction("IMMEDIATE", () => {
      this.database.prepare("INSERT OR IGNORE INTO mcpcn_block_records(workspace,block,id,revision,state) VALUES(?,?,?,1,?)")
        .run(selected.workspace, block, id, initial);
      this.readCurrent(selected, block, id);
    });
  }
  private readCurrent(principal: BlockPrincipal, block: BlockKind, id: string): BlockRecord {
    const row = RecordRowSchema.parse(this.database.prepare("SELECT revision,state FROM mcpcn_block_records WHERE workspace=? AND block=? AND id=?")
      .get(principal.workspace, block, id));
    const count = this.database.prepare("SELECT count(*) AS count FROM mcpcn_block_audit WHERE workspace=? AND block=? AND record_id=?")
      .get(principal.workspace, block, id)?.count;
    require(typeof count === "number" && count === row.revision - 1);
    const audit = this.database.prepare(`SELECT revision-1 AS sequence,record_id AS recordId,revision,actor,action,summary,at
      FROM mcpcn_block_audit WHERE workspace=? AND block=? AND record_id=? ORDER BY revision DESC LIMIT 100`)
      .all(principal.workspace, block, id).reverse();
    return BlockRecordSchema.parse({ block, id, revision: row.revision, state: state(JSON.parse(row.state), block), audit,
      earlierAuditEvents: Number(count) - audit.length, prepared: null });
  }
  read(principal: BlockPrincipal, block: BlockKind, id: string): BlockRecord {
    const selected = this.authorize(principal, block); BlockIdentitySchema.parse(id);
    // State, audit and count must share one SQLite snapshot, including across processes.
    return this.inTransaction ? this.readCurrent(selected, block, id) : this.transaction("DEFERRED", () => this.readCurrent(selected, block, id));
  }
  prepare(principal: BlockPrincipal, block: BlockKind, id: string, revision: number, policyRevision: string,
    supplied: BlockProposal, signal: AbortSignal, propose: (current: BlockState) => BlockPlan): BlockRecord {
    const selected = this.authorize(principal, block); BlockIdentitySchema.parse(id); BlockRevisionSchema.parse(revision); BlockIdentitySchema.parse(policyRevision);
    require(!signal.aborted);
    const proposal = encoded(BlockProposalSchema.parse(wireSnapshot(supplied)), 256 * 1024), time = this.clock();
    return this.transaction("IMMEDIATE", () => {
      const current = this.readCurrent(selected, block, id); require(current.revision === revision);
      const plan = propose(wireSnapshot(current.state)), terms = BlockTermsSchema.parse(wireSnapshot(plan.terms)), preview = state(plan.preview, block);
      require(!signal.aborted);
      const termsJSON = encoded(terms, 1280 * 1024), previewJSON = encoded(preview, 512 * 1024);
      this.database.prepare(`DELETE FROM mcpcn_block_reviews WHERE workspace=? AND actor=? AND block=? AND record_id=? AND receipt IS NULL AND expires<=?`)
        .run(selected.workspace, selected.actor, block, id, time);
      const pending = this.database.prepare(`SELECT count(*) AS count FROM mcpcn_block_reviews
        WHERE workspace=? AND actor=? AND block=? AND record_id=? AND receipt IS NULL AND expires>?`)
        .get(selected.workspace, selected.actor, block, id, time)?.count;
      require(typeof pending === "number" && pending < 20);
      const token = randomBytes(32).toString("hex"), expiresAt = time + 300000;
      this.database.prepare(`INSERT INTO mcpcn_block_reviews(hash,workspace,actor,block,record_id,revision,policy_revision,proposal,terms,preview,expires)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(digest(token), selected.workspace, selected.actor, block, id, revision, policyRevision, proposal, termsJSON, previewJSON, expiresAt);
      return BlockRecordSchema.parse({ ...current, prepared: { token, expiresAt, policyRevision, terms, preview } });
    });
  }
  confirm(principal: BlockPrincipal, block: BlockKind, token: string, policyRevision: string, signal: AbortSignal,
    apply: (current: BlockState, proposal: BlockProposal, database: DatabaseSync, prepared: BlockPlan) => BlockState): { view: BlockRecord; receipt: BlockReceipt; replay: boolean } {
    const selected = this.authorize(principal, block); BlockTokenSchema.parse(token); BlockIdentitySchema.parse(policyRevision); require(!signal.aborted);
    return this.transaction("IMMEDIATE", () => {
      const row = ReviewRowSchema.parse(this.database.prepare(`SELECT record_id,revision,policy_revision,proposal,terms,preview,expires,receipt FROM mcpcn_block_reviews
        WHERE hash=? AND workspace=? AND actor=? AND block=?`).get(digest(token), selected.workspace, selected.actor, block));
      if (row.receipt !== null) return { view: this.readCurrent(selected, block, row.record_id), receipt: BlockReceiptSchema.parse(JSON.parse(row.receipt)), replay: true };
      require(row.expires > this.clock() && row.policy_revision === policyRevision);
      const current = this.readCurrent(selected, block, row.record_id); require(current.revision === row.revision);
      const proposal = BlockProposalSchema.parse(JSON.parse(row.proposal));
      const prepared = { terms: BlockTermsSchema.parse(JSON.parse(row.terms)), preview: state(JSON.parse(row.preview), block) };
      const next = state(apply(wireSnapshot(current.state), proposal, this.database, prepared), block); require(!signal.aborted);
      const revision = BlockRevisionSchema.parse(current.revision + 1);
      const update = this.database.prepare("UPDATE mcpcn_block_records SET revision=?,state=? WHERE workspace=? AND block=? AND id=? AND revision=?")
        .run(revision, encoded(next, 512 * 1024), selected.workspace, block, row.record_id, current.revision); require(update.changes === 1);
      const terms = prepared.terms, at = new Date(this.clock()).toISOString();
      this.database.prepare("INSERT INTO mcpcn_block_audit(workspace,block,record_id,revision,actor,action,summary,at) VALUES(?,?,?,?,?,?,?,?)")
        .run(selected.workspace, block, row.record_id, revision, selected.actor, terms.action, terms.title, at);
      const receipt = BlockReceiptSchema.parse({ sequence: revision - 1, recordId: row.record_id, revision, action: terms.action, at });
      const consumed = this.database.prepare("UPDATE mcpcn_block_reviews SET receipt=? WHERE hash=? AND receipt IS NULL").run(encoded(receipt, 4096), digest(token));
      require(consumed.changes === 1);
      return { view: this.readCurrent(selected, block, row.record_id), receipt, replay: false };
    });
  }
  cancel(principal: BlockPrincipal, block: BlockKind, token: string): BlockRecord {
    const selected = this.authorize(principal, block); BlockTokenSchema.parse(token);
    return this.transaction("IMMEDIATE", () => {
      const row = this.database.prepare("SELECT record_id,receipt FROM mcpcn_block_reviews WHERE hash=? AND workspace=? AND actor=? AND block=?")
        .get(digest(token), selected.workspace, selected.actor, block);
      require(row && typeof row.record_id === "string" && row.receipt === null);
      this.database.prepare("UPDATE mcpcn_block_reviews SET expires=0,proposal='null',terms='null',preview='null' WHERE hash=? AND receipt IS NULL").run(digest(token));
      return this.readCurrent(selected, block, String(row!.record_id));
    });
  }
  close() { require(!this.inTransaction); if (!this.closed) { this.database.close(); this.closed = true; } }
  get isClosed() { return this.closed; }
}

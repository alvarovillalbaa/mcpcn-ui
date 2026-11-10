import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { WorkflowSchema, IdentitySchema, RevisionSchema, ReviewTermsSchema, ReceiptSchema, TokenSchema, type Workflow, type ReviewTerms, type RecordView, type Receipt } from "./contracts.js";

const PrincipalSchema = z.object({ workspace: IdentitySchema, actor: IdentitySchema, grants: z.array(WorkflowSchema).max(5) }).strict();
export type Principal = z.infer<typeof PrincipalSchema>;
export type ProposedChange<S> = ReviewTerms & { state: S };
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
function encoded(value: unknown) { const raw = JSON.stringify(value); if (!raw || Buffer.byteLength(raw) > 1024 * 1024) throw new Error("reference_value_invalid"); return raw; }
function required(value: unknown): asserts value { if (!value) throw new Error("reference_request_refused"); }
const rowSchema = z.object({ id: IdentitySchema, revision: RevisionSchema, state: z.string() });

/** Example-only synchronous transaction store. Principal is trusted server context. */
export class WorkflowStore {
  private closed = false;
  constructor(private readonly db: DatabaseSync, private readonly now: () => number = Date.now) {
    const version = db.prepare("PRAGMA user_version").get()?.user_version;
    const app = db.prepare("PRAGMA application_id").get()?.application_id;
    if (version === 0 && app === 0) {
      required(db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get()?.count === 0);
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE records (workspace TEXT NOT NULL, workflow TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY(workspace,workflow,id)) STRICT;
        CREATE TABLE reviews (hash TEXT PRIMARY KEY, workspace TEXT NOT NULL, actor TEXT NOT NULL, workflow TEXT NOT NULL, record_id TEXT NOT NULL, revision INTEGER NOT NULL, terms TEXT NOT NULL, proposed TEXT NOT NULL, expires INTEGER NOT NULL, receipt TEXT) STRICT;
        CREATE TABLE audit (sequence INTEGER PRIMARY KEY AUTOINCREMENT, workspace TEXT NOT NULL, workflow TEXT NOT NULL, record_id TEXT NOT NULL, actor TEXT NOT NULL, revision INTEGER NOT NULL, action TEXT NOT NULL, summary TEXT NOT NULL, at TEXT NOT NULL) STRICT;
        PRAGMA application_id=1296257091; PRAGMA user_version=1; COMMIT;`);
    } else required(version === 1 && app === 1296257091);
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000; PRAGMA journal_mode=WAL;");
  }
  authorize(principal: Principal, workflow: Workflow) {
    required(!this.closed); const p = PrincipalSchema.parse(principal); WorkflowSchema.parse(workflow); required(p.grants.includes(workflow)); return p;
  }
  private transaction<T>(body: () => T): T {
    required(!this.closed); this.db.exec("BEGIN IMMEDIATE");
    try { const result = body(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  seed<S>(principal: Principal, workflow: Workflow, id: string, state: S) {
    const p = this.authorize(principal, workflow); IdentitySchema.parse(id);
    this.db.prepare("INSERT OR IGNORE INTO records(workspace,workflow,id,revision,state) VALUES(?,?,?,1,?)").run(p.workspace, workflow, id, encoded(state));
  }
  read<S>(principal: Principal, workflow: Workflow, id: string): RecordView<S> {
    const p = this.authorize(principal, workflow); IdentitySchema.parse(id);
    const row = rowSchema.parse(this.db.prepare("SELECT id,revision,state FROM records WHERE workspace=? AND workflow=? AND id=?").get(p.workspace, workflow, id));
    const count = this.db.prepare("SELECT count(*) AS count FROM audit WHERE workspace=? AND workflow=? AND record_id=?").get(p.workspace, workflow, id)?.count;
    required(typeof count === "number");
    const audit = this.db.prepare("SELECT sequence,record_id AS recordId,revision,action,actor,summary,at FROM audit WHERE workspace=? AND workflow=? AND record_id=? ORDER BY sequence DESC LIMIT 100").all(p.workspace, workflow, id).reverse();
    return { workflow, id, revision: row.revision, state: JSON.parse(row.state) as S, audit: audit as RecordView<S>["audit"], earlierAuditEvents: Math.max(0, count - audit.length), prepared: null };
  }
  prepare<S>(principal: Principal, workflow: Workflow, id: string, revision: number, propose: (current: S) => ProposedChange<S>): RecordView<S> {
    const p = this.authorize(principal, workflow); RevisionSchema.parse(revision);
    return this.transaction(() => {
      const current = this.read<S>(p, workflow, id); required(current.revision === revision);
      const { state: proposedState, ...declarations } = propose(current.state);
      const terms = ReviewTermsSchema.parse(declarations), next = encoded(proposedState);
      // Only expired, unconsumed ephemeral reviews are discarded; audit/receipts persist.
      this.db.prepare("DELETE FROM reviews WHERE receipt IS NULL AND expires<? AND workspace=? AND actor=?").run(this.now(), p.workspace, p.actor);
      const count = this.db.prepare("SELECT count(*) AS count FROM reviews").get()?.count; required(typeof count === "number" && count < 10000);
      const token = randomBytes(32).toString("hex"), expiresAt = this.now() + 300000;
      this.db.prepare("INSERT INTO reviews(hash,workspace,actor,workflow,record_id,revision,terms,proposed,expires) VALUES(?,?,?,?,?,?,?,?,?)")
        .run(digest(token), p.workspace, p.actor, workflow, id, revision, encoded(terms), next, expiresAt);
      return { ...current, prepared: { ...terms, token, expiresAt, proposed: JSON.parse(next) as S } };
    });
  }
  commit<S>(principal: Principal, workflow: Workflow, token: string, validate: (current: S, proposed: S) => void = () => undefined): { view: RecordView<S>; receipt: Receipt; replay: boolean } {
    const p = this.authorize(principal, workflow); TokenSchema.parse(token);
    return this.transaction(() => {
      const row = this.db.prepare("SELECT record_id,revision,terms,proposed,expires,receipt FROM reviews WHERE hash=? AND workspace=? AND actor=? AND workflow=?")
        .get(digest(token), p.workspace, p.actor, workflow); required(row);
      required(typeof row.record_id === "string");
      if (typeof row.receipt === "string") return { view: this.read<S>(p, workflow, row.record_id), receipt: ReceiptSchema.parse(JSON.parse(row.receipt)), replay: true };
      required(typeof row.expires === "number" && row.expires > 0 && row.expires >= this.now());
      const current = this.read<S>(p, workflow, row.record_id); required(current.revision === row.revision && typeof row.terms === "string" && typeof row.proposed === "string");
      validate(current.state, JSON.parse(row.proposed) as S);
      const terms = ReviewTermsSchema.parse(JSON.parse(row.terms)), revision = RevisionSchema.parse(current.revision + 1);
      const count = this.db.prepare("SELECT count(*) AS count FROM audit").get()?.count; required(typeof count === "number" && count < 100000);
      const update = this.db.prepare("UPDATE records SET revision=?,state=? WHERE workspace=? AND workflow=? AND id=? AND revision=?")
        .run(revision, row.proposed, p.workspace, workflow, row.record_id, current.revision); required(update.changes === 1);
      const at = new Date(this.now()).toISOString();
      const event = this.db.prepare("INSERT INTO audit(workspace,workflow,record_id,actor,revision,action,summary,at) VALUES(?,?,?,?,?,?,?,?)")
        .run(p.workspace, workflow, row.record_id, p.actor, revision, terms.action, terms.title, at);
      const receipt = ReceiptSchema.parse({ sequence: Number(event.lastInsertRowid), recordId: row.record_id, revision, action: terms.action, at });
      this.db.prepare("UPDATE reviews SET receipt=? WHERE hash=? AND receipt IS NULL").run(encoded(receipt), digest(token));
      return { view: this.read<S>(p, workflow, row.record_id), receipt, replay: false };
    });
  }
  cancel<S>(principal: Principal, workflow: Workflow, token: string): RecordView<S> {
    const p = this.authorize(principal, workflow); TokenSchema.parse(token);
    return this.transaction(() => {
      const row = this.db.prepare("SELECT record_id,receipt FROM reviews WHERE hash=? AND workspace=? AND actor=? AND workflow=?").get(digest(token), p.workspace, p.actor, workflow);
      required(row && typeof row.record_id === "string" && row.receipt === null);
      this.db.prepare("UPDATE reviews SET expires=0 WHERE hash=? AND receipt IS NULL").run(digest(token));
      return this.read<S>(p, workflow, row.record_id);
    });
  }
  close() { if (!this.closed) { this.db.close(); this.closed = true; } }
  get isClosed() { return this.closed; }
}

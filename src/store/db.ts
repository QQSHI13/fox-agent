import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { estimateTokens } from "../providers/models.ts";

export type Role = "system" | "user" | "assistant" | "tool" | "think";

export interface SessionRow {
  id: string;
  cwd: string;
  model: string;
  title: string | null;
  created_at: number;
}

export interface MessageRow {
  id: string;
  seq: number;
  session_id: string;
  parent_id: string | null;
  role: Role;
  content: string;
  tool_calls: string | null; // JSON: [{id, name, arguments}]
  tool_call_id: string | null;
  tokens: number;
  error: string | null;
  created_at: number;
}

export interface OpRow {
  seq: number;
  session_id: string;
  kind: "delete" | "replace" | "restore";
  payload: string; // JSON
  created_at: number;
}

// ---- view ops (context surgery) ----

export interface DeleteOp {
  kind: "delete";
  ids: number[]; // message seqs
  summary?: string;
}
export interface ReplaceOp {
  kind: "replace";
  id: number; // message seq
  content: string;
}
/** Host-only op appended by /undo — restores nodes hidden by a delete. */
export interface RestoreOp {
  kind: "restore";
  ids: number[];
}
export type ViewOp = DeleteOp | ReplaceOp | RestoreOp;

let _db: Database | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    cwd TEXT NOT NULL,
    model TEXT NOT NULL,
    title TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    seq INTEGER NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    parent_id TEXT,
    role TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    tool_calls TEXT,
    tool_call_id TEXT,
    tokens INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_seq ON messages(session_id, seq);
  CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(session_id, parent_id);
  CREATE TABLE IF NOT EXISTS refs (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    name TEXT NOT NULL,
    message_id TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (session_id, name)
  );
  CREATE TABLE IF NOT EXISTS ops (
    seq INTEGER NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_seq ON ops(session_id, seq);
  CREATE TABLE IF NOT EXISTS usage (
    session_id TEXT NOT NULL,
    message_id TEXT,
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_usage_session ON usage(session_id);
  CREATE TABLE IF NOT EXISTS kv (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (session_id, key)
  );
`;

export function db(): Database {
  if (_db) return _db;
  const dir = process.env.FOX_HOME ?? join(homedir(), ".local", "share", "fox");
  mkdirSync(join(dir, "pty"), { recursive: true });
  const d = new Database(join(dir, "sessions.db"));
  d.exec("PRAGMA journal_mode = WAL;");
  d.exec("PRAGMA foreign_keys = ON;");
  d.exec(SCHEMA);
  d.exec(`PRAGMA user_version = 2;`);
  _db = d;
  return d;
}

export function estTokens(s: string): number {
  return estimateTokens(s);
}

function rid(): string {
  // sortable id: timestamp + rand
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function createSession(cwd: string, model: string): SessionRow {
  const s: SessionRow = { id: rid(), cwd, model, title: null, created_at: Date.now() };
  db().prepare("INSERT INTO sessions VALUES (?, ?, ?, ?, ?)").run(s.id, s.cwd, s.model, s.title, s.created_at);
  db().prepare("INSERT INTO refs VALUES (?, 'main', NULL, ?)").run(s.id, Date.now());
  return s;
}

export function getSession(id: string): SessionRow | null {
  return db().prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | null;
}

export function latestSessionFor(cwd: string): SessionRow | null {
  return db()
    .prepare("SELECT * FROM sessions WHERE cwd = ? ORDER BY created_at DESC LIMIT 1")
    .get(cwd) as SessionRow | null;
}

export function listSessions(limit = 20): SessionRow[] {
  return db().prepare("SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?").all(limit) as SessionRow[];
}

export function setRefTitle(sessionId: string, title: string) {
  db().prepare("UPDATE sessions SET title = ? WHERE id = ?").run(title.slice(0, 80), sessionId);
}

/**
 * Copy a session's messages (optionally up to `uptoSeq` inclusive) into a new
 * session. Message ids are re-minted as `<forkId>:<seq>` so a session can be
 * forked any number of times, and `parent_id` is remapped through the same
 * table so the copy never points back into the source (parents cut off by
 * `uptoSeq` become null). Ops referencing copied messages carry over; ones
 * past the cut are harmless no-ops during projection.
 */
export function forkSession(sourceId: string, uptoSeq?: number): SessionRow | null {
  const src = getSession(sourceId);
  if (!src) return null;
  const cap = uptoSeq ?? Number.MAX_SAFE_INTEGER;
  const rows = db()
    .prepare("SELECT * FROM messages WHERE session_id = ? AND seq <= ? ORDER BY seq")
    .all(sourceId, cap) as MessageRow[];

  const fork = createSession(src.cwd, src.model);
  const newId = (seq: number) => `${fork.id}:${seq}`;
  // old message id -> new id, for parent remapping
  const idMap = new Map<string, string>();
  for (const r of rows) idMap.set(r.id, newId(r.seq));

  const ins = db().prepare(
    `INSERT INTO messages (id, seq, session_id, parent_id, role, content, tool_calls, tool_call_id, tokens, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db().transaction(() => {
    for (const r of rows) {
      // a parent outside the copied range is dropped rather than dangling
      const parent = r.parent_id ? idMap.get(r.parent_id) ?? null : null;
      ins.run(newId(r.seq), r.seq, fork.id, parent, r.role, r.content, r.tool_calls, r.tool_call_id, r.tokens, r.error, r.created_at);
    }
  })();

  const tip = rows[rows.length - 1];
  if (tip) advanceMain(fork.id, newId(tip.seq));
  db()
    .prepare(
      `INSERT OR IGNORE INTO ops (seq, session_id, kind, payload, created_at)
       SELECT seq, ?, kind, payload, created_at FROM ops WHERE session_id = ?`,
    )
    .run(fork.id, sourceId);
  setRefTitle(fork.id, `fork of ${src.title ?? src.id}`);
  return fork;
}

export function setSessionModel(sessionId: string, model: string): void {
  db().run("UPDATE sessions SET model = ? WHERE id = ?", [model, sessionId]);
}

export function appendMessage(
  sessionId: string,
  msg: Partial<Pick<MessageRow, "id" | "parent_id" | "tool_calls" | "tool_call_id" | "error">> & {
    role: Role;
    content: string;
    tokens: number;
  },
): MessageRow {
  const d = db();
  const row = d.query("SELECT COALESCE(MAX(seq),0)+1 AS n FROM messages WHERE session_id = ?").get(sessionId) as { n: number };
  const m: MessageRow = {
    id: msg.id ?? rid(),
    seq: row.n,
    session_id: sessionId,
    parent_id: msg.parent_id ?? null,
    role: msg.role,
    content: msg.content ?? "",
    tool_calls: msg.tool_calls ?? null,
    tool_call_id: msg.tool_call_id ?? null,
    tokens: msg.tokens,
    error: msg.error ?? null,
    created_at: Date.now(),
  };
  d.prepare(
    "INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(m.id, m.seq, m.session_id, m.parent_id, m.role, m.content, m.tool_calls, m.tool_call_id, m.tokens, m.error, m.created_at);

  if (m.role === "user") {
    const s = getSession(sessionId)!;
    if (!s?.title) setRefTitle(sessionId, m.content.replace(/\s+/g, " ").slice(0, 60));
  }
  advanceMain(sessionId, m.id);
  return m;
}

export function getMessage(sessionId: string, seq: number): MessageRow | null {
  return db().prepare("SELECT * FROM messages WHERE session_id = ? AND seq = ?").get(sessionId, seq) as MessageRow | null;
}

export function allMessages(sessionId: string): MessageRow[] {
  return db().prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY seq").all(sessionId) as MessageRow[];
}

function advanceMain(sessionId: string, messageId: string) {
  db().prepare("UPDATE refs SET message_id = ?, updated_at = ? WHERE session_id = ? AND name = 'main'").run(messageId, Date.now(), sessionId);
}

export function getRef(sessionId: string, name = "main"): string | null {
  const r = db().prepare("SELECT message_id FROM refs WHERE session_id = ? AND name = ?").get(sessionId, name) as { message_id: string } | undefined;
  return r?.message_id ?? null;
}

export function appendOps(sessionId: string, ops: ViewOp[]): void {
  const d = db();
  const row = d.query("SELECT COALESCE(MAX(seq),0)+1 AS n FROM ops WHERE session_id = ?").get(sessionId) as { n: number };
  let seq = row.n;
  const ins = d.prepare("INSERT INTO ops VALUES (?, ?, ?, ?, ?)");
  for (const op of ops) ins.run(seq++, sessionId, op.kind, JSON.stringify(op), Date.now());
}

export function allOps(sessionId: string): OpRow[] {
  return db().prepare("SELECT * FROM ops WHERE session_id = ? ORDER BY seq").all(sessionId) as OpRow[];
}

/**
 * Undo without rewriting history: appends the inverse of the newest op
 * (delete -> restore, replace -> replace with original content). The log
 * stays INSERT-only; projection replays the compensation.
 */
export function undoLastOp(sessionId: string): string | null {
  const last = db().query("SELECT * FROM ops WHERE session_id = ? ORDER BY seq DESC LIMIT 1").get(sessionId) as OpRow | undefined;
  if (!last) return null;
  const op = JSON.parse(last.payload) as ViewOp;
  if (op.kind === "delete") {
    appendOps(sessionId, [{ kind: "restore", ids: [...op.ids] }]);
    return `restored ${op.ids.length} node(s)`;
  }
  if (op.kind === "restore") {
    appendOps(sessionId, [{ kind: "delete", ids: [...op.ids] }]);
    return `re-hid ${op.ids.length} node(s)`;
  }
  // undo of a replace steps back one view state: the newest *earlier* replace
  // of the same node if there is one, else the stored original.
  const prior = db()
    .query("SELECT payload FROM ops WHERE session_id = ? AND kind = 'replace' AND seq < ? ORDER BY seq DESC")
    .all(sessionId, last.seq) as { payload: string }[];
  for (const r of prior) {
    const p = JSON.parse(r.payload) as ReplaceOp;
    if (p.id === op.id) {
      appendOps(sessionId, [{ kind: "replace", id: op.id, content: p.content }]);
      return `reverted m${op.id} to its previous edit`;
    }
  }
  const orig = getMessage(sessionId, op.id);
  if (!orig) return null;
  appendOps(sessionId, [{ kind: "replace", id: op.id, content: orig.content }]);
  return `restored original content of m${op.id}`;
}

// ---- session-scoped key/value (todos, task lineage, ...) ----

export function kvSet(sessionId: string, key: string, value: unknown): void {
  db()
    .prepare("INSERT INTO kv VALUES (?, ?, ?, ?) ON CONFLICT(session_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .run(sessionId, key, JSON.stringify(value), Date.now());
}

export function kvGet<T>(sessionId: string, key: string): T | null {
  const r = db().prepare("SELECT value FROM kv WHERE session_id = ? AND key = ?").get(sessionId, key) as { value: string } | undefined;
  if (!r) return null;
  try {
    return JSON.parse(r.value) as T;
  } catch {
    return null;
  }
}

// ---- usage ----

export function recordUsage(sessionId: string, messageId: string | null, promptTokens: number, completionTokens: number) {
  db().prepare("INSERT INTO usage VALUES (?, ?, ?, ?, ?)").run(sessionId, messageId, promptTokens, completionTokens, Date.now());
}

export function sessionUsage(sessionId: string): { prompt: number; completion: number } {
  const r = db()
    .query("SELECT COALESCE(SUM(prompt_tokens),0) AS p, COALESCE(SUM(completion_tokens),0) AS c FROM usage WHERE session_id = ?")
    .get(sessionId) as { p: number; c: number };
  return { prompt: r.p, completion: r.c };
}

/**
 * Most recent provider-reported prompt size — i.e. how big the context
 * actually was last call. Unlike sessionUsage().prompt (a running total) this
 * tracks the live window and drops after a compaction.
 */
export function lastPromptTokens(sessionId: string): number {
  const r = db()
    .query("SELECT prompt_tokens AS p FROM usage WHERE session_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .get(sessionId) as { p: number } | undefined;
  return r?.p ?? 0;
}

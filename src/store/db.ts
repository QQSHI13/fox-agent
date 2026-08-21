import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Role = "system" | "user" | "assistant" | "tool";

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
  kind: "delete" | "replace";
  payload: string; // JSON
  created_at: number;
}

let _db: Database | null = null;

export function db(): Database {
  if (_db) return _db;
  const dir = process.env.FOXC_HOME ?? join(homedir(), ".local", "share", "foxc");
  mkdirSync(dir, { recursive: true });
  const d = new Database(join(dir, "sessions.db"));
  d.exec("PRAGMA journal_mode = WAL;");
  d.exec("PRAGMA foreign_keys = ON;");
  d.exec(`
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
  `);
  _db = d;
  return d;
}

export function estTokens(s: string): number {
  return Math.ceil((s?.length ?? 0) / 4);
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

// ---- view ops (context surgery) ----

export interface DeleteOp {
  kind: "delete";
  ids: number[]; // seq numbers
  summary?: string;
}
export interface ReplaceOp {
  kind: "replace";
  id: number; // seq
  content: string;
}
export type ViewOp = DeleteOp | ReplaceOp;

export function appendOps(sessionId: string, ops: ViewOp[]): void {
  const d = db();
  const row = d.query("SELECT COALESCE(MAX(seq),0)+1 AS n FROM ops WHERE session_id = ?").get(sessionId) as { n: number };
  let seq = row.n;
  const ins = d.prepare("INSERT INTO ops VALUES (?, ?, ?, ?, ?)");
  for (const op of ops) {
    ins.run(seq++, sessionId, op.kind, JSON.stringify(op), Date.now());
  }
}

export function allOps(sessionId: string): ViewOp[] {
  return (db().prepare("SELECT * FROM ops WHERE session_id = ? ORDER BY seq").all(sessionId) as OpRow[]).map(
    (r) => JSON.parse(r.payload) as ViewOp,
  );
}

export function undoLastOp(sessionId: string): boolean {
  const d = db();
  const last = d.query("SELECT MAX(seq) AS s FROM ops WHERE session_id = ?").get(sessionId) as { s: number | null };
  if (!last.s) return false;
  d.prepare("DELETE FROM ops WHERE session_id = ? AND seq = ?").run(sessionId, last.s);
  return true;
}

export function recordUsage(sessionId: string, messageId: string | null, promptTokens: number, completionTokens: number) {
  db().prepare("INSERT INTO usage VALUES (?, ?, ?, ?, ?)").run(sessionId, messageId, promptTokens, completionTokens, Date.now());
}

export function sessionUsage(sessionId: string): { prompt: number; completion: number } {
  const r = db()
    .query("SELECT COALESCE(SUM(prompt_tokens),0) AS p, COALESCE(SUM(completion_tokens),0) AS c FROM usage WHERE session_id = ?")
    .get(sessionId) as { p: number; c: number };
  return { prompt: r.p, completion: r.c };
}

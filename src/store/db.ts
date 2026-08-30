import { Database } from "bun:sqlite";
import { existsSync, rmSync } from "node:fs";
import { estimateTokens } from "../providers/models.ts";
import { ensureLayout, agentHome, indexDbPath, legacyDbPath, sessionDbPath } from "../core/paths.ts";

export type Role = "system" | "user" | "assistant" | "tool" | "think";

export interface SessionRow {
  id: string;
  cwd: string;
  model: string;
  title: string | null;
  created_at: number;
  /**
   * Last append to the session's log. Maintained by `appendMessage` since the
   * index was introduced, but for a long time nothing read it: every listing
   * query ordered by and projected `created_at`, so `/sessions` and `fox -c`
   * ranked by *birth* order. A session created this morning and worked in all
   * day sorted below one created five minutes ago and never used, which is the
   * opposite of what "latest" means to anyone picking from the list.
   */
  updated_at: number;
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
  /** JSON: MediaPart[] — binary attachments (image/audio/video) on a tool result */
  media: string | null;
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

/**
 * Session list. Lives in its own database so `fox ls` / `-c` don't have to open
 * (or even know about) every session file. It is a pure cache of what the
 * session databases already contain, so losing it costs a listing, not data.
 */
const INDEX_SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    cwd TEXT NOT NULL,
    model TEXT NOT NULL,
    title TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_cwd_recent ON sessions(cwd, updated_at DESC);
`;

/** Every listing/lookup projects the same columns, in SessionRow order. */
const SESSION_COLS = "id, cwd, model, title, created_at, updated_at";

/**
 * One database per session. `session_id` columns are kept even though the file
 * scopes them already: every query filters on them, and a session's rows are
 * copied verbatim on fork. The old `REFERENCES sessions(id)` clauses are gone —
 * that table now lives in the index, so the constraint could not resolve.
 */
const SESSION_SCHEMA = `
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    seq INTEGER NOT NULL,
    session_id TEXT NOT NULL,
    parent_id TEXT,
    role TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    tool_calls TEXT,
    tool_call_id TEXT,
    media TEXT,
    tokens INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_seq ON messages(session_id, seq);
  CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(session_id, parent_id);
  CREATE TABLE IF NOT EXISTS refs (
    session_id TEXT NOT NULL,
    name TEXT NOT NULL,
    message_id TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (session_id, name)
  );
  CREATE TABLE IF NOT EXISTS ops (
    seq INTEGER NOT NULL,
    session_id TEXT NOT NULL,
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
    session_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (session_id, key)
  );
`;

const USER_VERSION = 4;

let _index: Database | null = null;
/** Insertion-ordered, so the first key is the least recently opened. */
const _sessions = new Map<string, Database>();
/** The subagent tool mints a session per task; without a cap those fds pile up. */
const MAX_OPEN_SESSIONS = 8;
/**
 * Sessions whose handle must survive eviction.
 *
 * The cap alone was fine while nothing enumerated sessions: the harness touched
 * one session and the LRU order kept it hot. The interactive picker breaks that
 * — it reads usage for every session in the list, so the *live* session becomes
 * the least-recently-used and its handle gets closed.
 *
 * Most call sites survive that: they go through `sessionDb`, which reopens on a
 * miss. The ones that do not are the callers that *hold* the `Database` across
 * other work — `forkSession` keeps `srcDb` while it snapshots, and
 * `pruneSession` holds `d` across `projectView` and a VACUUM. A closed
 * `bun:sqlite` handle throws `RangeError: Cannot use a closed database` on next
 * use rather than reopening, so an eviction landing inside one of those is an
 * exception out of the middle of the operation, not a slow path. Measured:
 * a statement prepared before the close still runs, but any new `prepare` on
 * the stale handle throws — so the failure is both real and easy to miss.
 *
 * Pinning is a set rather than a refcount: the harness pins the one session it
 * is driving and unpins on switch, which is the entire lifecycle.
 */
const _pinned = new Set<string>();
let _legacyChecked = false;
/** FOX_AGENT_HOME the open handles belong to; if it moves, they are the wrong files. */
let _home: string | null = null;

function open(path: string, schema: string): Database {
  const d = new Database(path);
  d.exec("PRAGMA journal_mode = WAL;");
  d.exec("PRAGMA foreign_keys = ON;");
  d.exec(schema);
  d.exec(`PRAGMA user_version = ${USER_VERSION};`);
  return d;
}

/**
 * Prepare the state dir and invalidate cached handles if FOX_AGENT_HOME moved. Tests
 * repoint it between cases, and a handle to the previous directory would keep
 * reading a database nobody asked for.
 */
function ready(): void {
  const home = agentHome();
  if (_home !== null && _home !== home) closeAll();
  _home = home;
  ensureLayout();
  dropLegacy();
}

/**
 * Remove the pre-1.0 single-file store. Deliberately destructive and not
 * migrated — the layout change was requested with old data explicitly declared
 * disposable, and a stale sessions.db would otherwise sit there forever looking
 * like it still mattered.
 */
function dropLegacy(): void {
  if (_legacyChecked) return;
  _legacyChecked = true;
  const legacy = legacyDbPath();
  if (!existsSync(legacy)) return;
  for (const p of [legacy, `${legacy}-wal`, `${legacy}-shm`]) rmSync(p, { force: true });
  console.error(`fox-agent: removed pre-1.0 ${legacy} (sessions are per-file now; old history was not migrated)`);
}

export function indexDb(): Database {
  ready();
  if (_index) return _index;
  _index = open(indexDbPath(), INDEX_SCHEMA);
  return _index;
}

/** The database holding one session's log. Opened on demand, LRU-capped. */
export function sessionDb(sessionId: string): Database {
  ready();
  const hit = _sessions.get(sessionId);
  if (hit) {
    // refresh recency: delete+set moves the key to the end of the iteration order
    _sessions.delete(sessionId);
    _sessions.set(sessionId, hit);
    return hit;
  }
  const d = open(sessionDbPath(sessionId), SESSION_SCHEMA);
  ensureColumn(d, "messages", "media", "media TEXT");
  _sessions.set(sessionId, d);
  evict(sessionId);
  return d;
}

/**
 * Add a column a database created by an older fox-agent lacks. `CREATE TABLE IF
 * NOT EXISTS` only shapes *new* files; an existing session db opened after an
 * upgrade would otherwise throw `no such column` on the first media insert.
 */
function ensureColumn(d: Database, table: string, column: string, ddl: string): void {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) d.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

/**
 * Close handles past the cap, oldest first, skipping pinned sessions.
 *
 * Bounded by the map size rather than looping on `size > cap`: if everything
 * open is pinned there is nothing evictable, and a `while` would spin forever.
 * Going over the cap is the correct outcome there — an fd over budget beats a
 * closed handle under someone's feet.
 *
 * `keep` is the handle the caller is about to return, and it must be immune
 * even though it is not pinned. Without it, a cache over the cap whose older
 * entries are all pinned walks all the way to the newest entry and closes the
 * very handle `sessionDb` just opened — so the caller gets back a closed
 * database and the next `prepare` throws. Found by the all-pinned test:
 * `createSession` failed on its own fresh session.
 */
function evict(keep?: string): void {
  for (const id of [..._sessions.keys()]) {
    if (_sessions.size <= MAX_OPEN_SESSIONS) return;
    if (id === keep || _pinned.has(id)) continue;
    _sessions.get(id)?.close();
    _sessions.delete(id);
  }
}

/**
 * Keep this session's handle open until `unpinSession`. Call it for the session
 * a turn loop is actively writing to; see `_pinned`.
 */
export function pinSession(sessionId: string): void {
  _pinned.add(sessionId);
}

export function unpinSession(sessionId: string): void {
  _pinned.delete(sessionId);
  evict();
}

/** Drop cached handles — tests point FOX_AGENT_HOME at a fresh dir between cases. */
export function closeAll(): void {
  for (const d of _sessions.values()) d.close();
  _sessions.clear();
  _pinned.clear();
  _index?.close();
  _index = null;
  _legacyChecked = false;
  _home = null;
}


export function estTokens(s: string): number {
  return estimateTokens(s);
}

function rid(): string {
  // sortable id: timestamp + rand
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * A strictly increasing clock for `updated_at`, per process.
 *
 * `updated_at` is what /sessions, `fox -c` and the picker rank by, and it has
 * millisecond resolution: two sessions created and touched in the same ms tie,
 * and the `id DESC` tiebreak is then random (ids share a timestamp prefix; only
 * the random suffix differs), so "most recently used" flip-flopped run to run
 * — an intermittent test failure that was really a real ordering bug. A touch
 * is always *after* any previous touch in this process, so force it to be.
 * Drift from wall time is bounded by the number of touches in one ms.
 */
let _lastTouch = 0;
function touch(): number {
  _lastTouch = Math.max(Date.now(), _lastTouch + 1);
  return _lastTouch;
}

export function createSession(cwd: string, model: string): SessionRow {
  // created_at and updated_at are the same stamp at birth (a test and the
  // picker both rely on it), so one touch() serves both — two calls could tick.
  const now = touch();
  const s: SessionRow = { id: rid(), cwd, model, title: null, created_at: now, updated_at: now };
  indexDb()
    .prepare("INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)")
    .run(s.id, s.cwd, s.model, s.title, s.created_at, s.updated_at);
  sessionDb(s.id).prepare("INSERT OR IGNORE INTO refs VALUES (?, 'main', NULL, ?)").run(s.id, Date.now());
  return s;
}

export function getSession(id: string): SessionRow | null {
  return indexDb()
    .prepare(`SELECT ${SESSION_COLS} FROM sessions WHERE id = ?`)
    .get(id) as SessionRow | null;
}

/**
 * Erase a session: its database file and its row in the index.
 *
 * Both halves matter. Deleting only the file leaves the session listed and
 * openable — `sessionDb` would recreate an empty database under the same id, so
 * `/sessions` shows a ghost. Deleting only the row orphans the file. The cached
 * handle is closed first, because on Windows an open handle blocks the unlink and
 * on any platform a stale handle would keep answering queries for a file that is
 * no longer there.
 *
 * Returns false if the id was not in the index, so callers can report "no such
 * session" instead of silently succeeding.
 */
export function deleteSession(id: string): boolean {
  ready();
  const existed = !!getSession(id);
  _sessions.get(id)?.close();
  _sessions.delete(id);
  // a pin on a session whose file is gone would only keep a future handle to a
  // recreated empty database alive
  _pinned.delete(id);
  const path = sessionDbPath(id);
  for (const p of [path, `${path}-wal`, `${path}-shm`]) rmSync(p, { force: true });
  indexDb().prepare("DELETE FROM sessions WHERE id = ?").run(id);
  return existed;
}

/**
 * The session a `fox -c` in this directory should land in: most recently
 * *worked in*, not most recently created. `updated_at` comes from `touch()`,
 * which is strictly increasing per process, so ties only survive across
 * processes touching in the same ms; `id DESC` settles those.
 */
export function latestSessionFor(cwd: string): SessionRow | null {
  return indexDb()
    .prepare(`SELECT ${SESSION_COLS} FROM sessions WHERE cwd = ? ORDER BY updated_at DESC, id DESC LIMIT 1`)
    .get(cwd) as SessionRow | null;
}

/**
 * Sessions, most recently worked in first. `cwd` narrows to one directory —
 * the interactive picker offers that as a filter, and passing it here lets
 * SQLite answer from `idx_sessions_cwd_recent` instead of sorting every row.
 */
export function listSessions(limit = 20, cwd?: string): SessionRow[] {
  return indexDb()
    .prepare(
      cwd
        ? `SELECT ${SESSION_COLS} FROM sessions WHERE cwd = ? ORDER BY updated_at DESC, id DESC LIMIT ?`
        : `SELECT ${SESSION_COLS} FROM sessions ORDER BY updated_at DESC, id DESC LIMIT ?`,
    )
    .all(...(cwd ? [cwd, limit] : [limit])) as SessionRow[];
}

export function setRefTitle(sessionId: string, title: string) {
  indexDb().prepare("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?").run(title.slice(0, 80), touch(), sessionId);
}

/**
 * Copy a session into a brand-new one, up to `uptoSeq` inclusive. The bodies are
 * cloned by `VACUUM INTO` — a consistent snapshot even with a live WAL, which a
 * plain file copy is not — and then rewritten in place inside the copy.
 *
 * Message ids still become `<forkId>:<seq>`. A separate file removes the id
 * collision that forced this originally, but keeping it means an id names the
 * session it belongs to, so a row pasted into a bug report is traceable and a
 * `parent_id` can never silently resolve against the wrong session.
 */
export function forkSession(sourceId: string, uptoSeq?: number): SessionRow | null {
  const src = getSession(sourceId);
  if (!src) return null;

  const now = touch(); // one stamp for created_at and updated_at, as in createSession
  const fork: SessionRow = { id: rid(), cwd: src.cwd, model: src.model, title: null, created_at: now, updated_at: now };
  const target = sessionDbPath(fork.id);
  ensureLayout();
  // checkpoint first: VACUUM INTO reads the database, and anything still sitting
  // in this process's WAL would otherwise be missing from the snapshot
  const srcDb = sessionDb(sourceId);
  srcDb.exec("PRAGMA wal_checkpoint(FULL);");
  srcDb.prepare("VACUUM INTO ?").run(target);

  const cap = uptoSeq ?? Number.MAX_SAFE_INTEGER;
  const d = sessionDb(fork.id);
  d.transaction(() => {
    d.prepare("DELETE FROM messages WHERE seq > ?").run(cap);
    // a parent cut off by the truncation is dropped rather than left dangling
    d.exec("UPDATE messages SET parent_id = NULL WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM messages)");
    // re-mint ids: parent_id is remapped through the *old* ids, so it has to be
    // rewritten before the ids it points at change
    d.prepare("UPDATE messages SET parent_id = (SELECT ? || ':' || p.seq FROM messages p WHERE p.id = messages.parent_id) WHERE parent_id IS NOT NULL").run(fork.id);
    d.prepare("UPDATE messages SET id = ? || ':' || seq, session_id = ?").run(fork.id, fork.id);
    d.prepare("UPDATE ops SET session_id = ?").run(fork.id);
    d.prepare("UPDATE kv SET session_id = ?").run(fork.id);
    // usage is billing history for the source's calls, not the fork's
    d.exec("DELETE FROM usage");
    d.prepare("DELETE FROM refs").run();
    const tip = d.query("SELECT id FROM messages ORDER BY seq DESC LIMIT 1").get() as { id: string } | undefined;
    d.prepare("INSERT INTO refs VALUES (?, 'main', ?, ?)").run(fork.id, tip?.id ?? null, Date.now());
  })();

  indexDb()
    .prepare("INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)")
    .run(fork.id, fork.cwd, fork.model, null, fork.created_at, fork.updated_at);
  setRefTitle(fork.id, `fork of ${src.title ?? src.id}`);
  return { ...fork, title: `fork of ${src.title ?? src.id}`.slice(0, 80) };
}

export function setSessionModel(sessionId: string, model: string): void {
  indexDb().run("UPDATE sessions SET model = ?, updated_at = ? WHERE id = ?", [model, touch(), sessionId]);
}


export function appendMessage(
  sessionId: string,
  msg: Partial<Pick<MessageRow, "id" | "parent_id" | "tool_calls" | "tool_call_id" | "media" | "error">> & {
    role: Role;
    content: string;
    tokens: number;
  },
): MessageRow {
  const d = sessionDb(sessionId);
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
    media: msg.media ?? null,
    tokens: msg.tokens,
    error: msg.error ?? null,
    created_at: Date.now(),
  };
  d.prepare(
    // explicit column list: a db migrated by ALTER has `media` as its LAST
    // column, so positional VALUES would write media into tokens
    "INSERT INTO messages (id, seq, session_id, parent_id, role, content, tool_calls, tool_call_id, media, tokens, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(m.id, m.seq, m.session_id, m.parent_id, m.role, m.content, m.tool_calls, m.tool_call_id, m.media, m.tokens, m.error, m.created_at);

  if (m.role === "user") {
    const s = getSession(sessionId);
    if (!s?.title) setRefTitle(sessionId, m.content.replace(/\s+/g, " ").slice(0, 60));
  }
  // keep the index's recency in step with the log, so /sessions sorts sensibly.
  // touch(), not m.created_at: a same-ms create+append must still order the
  // appended session after the untouched one, and ms resolution alone ties.
  indexDb().run("UPDATE sessions SET updated_at = ? WHERE id = ?", [touch(), sessionId]);
  advanceMain(sessionId, m.id);
  return m;
}

export function getMessage(sessionId: string, seq: number): MessageRow | null {
  return sessionDb(sessionId).prepare("SELECT * FROM messages WHERE session_id = ? AND seq = ?").get(sessionId, seq) as MessageRow | null;
}

export function allMessages(sessionId: string): MessageRow[] {
  return sessionDb(sessionId).prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY seq").all(sessionId) as MessageRow[];
}

function advanceMain(sessionId: string, messageId: string) {
  sessionDb(sessionId)
    .prepare("UPDATE refs SET message_id = ?, updated_at = ? WHERE session_id = ? AND name = 'main'")
    .run(messageId, Date.now(), sessionId);
}

export function getRef(sessionId: string, name = "main"): string | null {
  const r = sessionDb(sessionId).prepare("SELECT message_id FROM refs WHERE session_id = ? AND name = ?").get(sessionId, name) as { message_id: string } | undefined;
  return r?.message_id ?? null;
}

export function appendOps(sessionId: string, ops: ViewOp[]): void {
  const d = sessionDb(sessionId);
  const row = d.query("SELECT COALESCE(MAX(seq),0)+1 AS n FROM ops WHERE session_id = ?").get(sessionId) as { n: number };
  let seq = row.n;
  const ins = d.prepare("INSERT INTO ops VALUES (?, ?, ?, ?, ?)");
  for (const op of ops) ins.run(seq++, sessionId, op.kind, JSON.stringify(op), Date.now());
}

export function allOps(sessionId: string): OpRow[] {
  return sessionDb(sessionId).prepare("SELECT * FROM ops WHERE session_id = ? ORDER BY seq").all(sessionId) as OpRow[];
}

/**
 * Undo without rewriting history: appends the inverse of the newest op
 * (delete -> restore, replace -> replace with original content). The log
 * stays INSERT-only; projection replays the compensation.
 */
export function undoLastOp(sessionId: string): string | null {
  const d = sessionDb(sessionId);
  const last = d.query("SELECT * FROM ops WHERE session_id = ? ORDER BY seq DESC LIMIT 1").get(sessionId) as OpRow | undefined;
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
  const prior = d
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
  sessionDb(sessionId)
    .prepare("INSERT INTO kv VALUES (?, ?, ?, ?) ON CONFLICT(session_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .run(sessionId, key, JSON.stringify(value), Date.now());
}

export function kvGet<T>(sessionId: string, key: string): T | null {
  const r = sessionDb(sessionId).prepare("SELECT value FROM kv WHERE session_id = ? AND key = ?").get(sessionId, key) as { value: string } | undefined;
  if (!r) return null;
  try {
    return JSON.parse(r.value) as T;
  } catch {
    return null;
  }
}

// ---- usage ----

export function recordUsage(sessionId: string, messageId: string | null, promptTokens: number, completionTokens: number) {
  sessionDb(sessionId).prepare("INSERT INTO usage VALUES (?, ?, ?, ?, ?)").run(sessionId, messageId, promptTokens, completionTokens, Date.now());
}

export function sessionUsage(sessionId: string): { prompt: number; completion: number } {
  const r = sessionDb(sessionId)
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
  const r = sessionDb(sessionId)
    .query("SELECT prompt_tokens AS p FROM usage WHERE session_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .get(sessionId) as { p: number } | undefined;
  return r?.p ?? 0;
}

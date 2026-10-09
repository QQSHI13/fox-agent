/**
 * Move a session between devices: export = one `.fox.zip` holding the
 * session's SQLite database plus a manifest; import = the reverse, landing the
 * session in the local store under its own id so `/sessions`, `fox -c` and
 * every opening path treat it like a session born here.
 *
 * The manifest exists so an import can be honest about what it is reading: a
 * foreign file claiming a db it does not contain, or a schema/format this
 * build cannot use, is refused with a message instead of half-landed. The db
 * itself is copied verbatim — sessions are self-contained SQLite files by
 * design (the index is a rebuildable cache), so that copy IS the session.
 */
import { existsSync, readFileSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { basename, join } from "node:path";
import { Database } from "bun:sqlite";
import { zipSync, unzipSync, type ZipEntry } from "./zip.ts";
import { sessionDbPath, sessionsDir, assertSafeSessionId } from "../core/paths.ts";
import { indexDb, getSession, closeSessionHandle, sessionDb } from "./db.ts";

const MANIFEST = "manifest.json";
const DB_ENTRY = "session.db";
/** Bump when the archive layout changes in a way old foxes cannot read. */
const FORMAT = 1;

interface Manifest {
  format: number;
  id: string;
  cwd: string;
  model: string;
  title: string | null;
  created_at: number;
  updated_at: number;
  /** rows in the messages table — a sanity floor, not a byte count */
  messages: number;
  exported_at: number;
  fox_version: string;
}

/**
 * Pack a session into `<name>.fox.zip` (default name: `fox-session-<id>.zip`).
 * WAL is checkpointed into the file first — an open session's newest messages
 * live in `-wal`, and copying only the main db would silently drop them.
 */
export function exportSession(sessionId: string, outPath?: string, foxVersion = ""): string {
  assertSafeSessionId(sessionId);
  const s = getSession(sessionId);
  if (!s) throw new Error(`no session ${sessionId}`);
  const path = sessionDbPath(sessionId);
  if (!existsSync(path)) throw new Error(`session ${sessionId} has no database file`);
  checkpointWal(sessionId);

  const db = new Database(path, { readonly: true });
  try {
    const n = db.query("SELECT COUNT(*) AS n FROM messages WHERE session_id = ?").get(sessionId) as { n: number };
    // manifest fields come from the index row (the per-session db has no
    // `sessions` table — that lives in index.db), which `getSession` read above
    const manifest: Manifest = {
      id: s.id,
      cwd: s.cwd,
      model: s.model,
      title: s.title,
      created_at: s.created_at,
      updated_at: s.updated_at,
      format: FORMAT,
      messages: n.n,
      exported_at: Date.now(),
      fox_version: foxVersion,
    };
    const entries: ZipEntry[] = [
      { name: MANIFEST, data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) },
      { name: DB_ENTRY, data: new Uint8Array(readFileSync(path)) },
    ];
    const dest = outPath ?? join(process.cwd(), `fox-session-${sessionId}.zip`);
    writeFileSync(dest, zipSync(entries, manifest.updated_at));
    return dest;
  } finally {
    db.close();
  }
}

/**
 * `wal_checkpoint(TRUNCATE)` so the main db file is complete on its own. Runs
 * on the store's own cached handle — a second connection here made bun:sqlite
 * throw API-misuse, and one handle is what every other store path uses.
 */
function checkpointWal(sessionId: string): void {
  sessionDb(sessionId).exec("PRAGMA wal_checkpoint(TRUNCATE)");
}

export interface ImportResult {
  id: string;
  messages: number;
  /** true when the id already existed locally and the import replaced it */
  replaced: boolean;
}

/**
 * Land a `.fox.zip` into the local store. The manifest is validated, the id is
 * safety-checked, and the db is installed at `sessions/<id>.db`; an existing
 * session with that id is replaced (export/import of the same session twice
 * must converge, not duplicate).
 */
export function importSession(zipPath: string): ImportResult {
  const raw = new Uint8Array(readFileSync(zipPath));
  let entries: Map<string, Uint8Array>;
  try {
    entries = unzipSync(raw);
  } catch (e) {
    throw new Error(`${basename(zipPath)} is not a readable session archive: ${(e as Error).message}`);
  }
  const mfRaw = entries.get(MANIFEST);
  const dbRaw = entries.get(DB_ENTRY);
  if (!mfRaw || !dbRaw) throw new Error(`${basename(zipPath)} is missing ${MANIFEST} or ${DB_ENTRY} — not a fox-agent session export`);
  let mf: Manifest;
  try {
    mf = JSON.parse(new TextDecoder().decode(mfRaw)) as Manifest;
  } catch {
    throw new Error(`${basename(zipPath)}: unreadable manifest`);
  }
  if (mf.format !== FORMAT) throw new Error(`${basename(zipPath)}: format ${mf.format} not understood (this fox reads ${FORMAT})`);
  assertSafeSessionId(mf.id);

  // Sanity floor: a db claiming no messages is either brand new (fine) or
  // wrong content — verify the archive actually holds a messages table.
  // Probe through a temp file: Database's typed surface here takes a path,
  // and the probe handle is closed (and the file dropped) before anything
  // is installed.
  const probePath = join(sessionsDir(), `.import-probe-${process.pid}-${Date.now()}.db`);
  writeFileSync(probePath, dbRaw);
  const probe = new Database(probePath, { readonly: true });
  try {
    const t = probe.query("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'").get() as { name: string } | null;
    if (!t) throw new Error(`${basename(zipPath)}: the database has no messages table — not a session export`);
    const n = probe.query("SELECT COUNT(*) AS n FROM messages WHERE session_id = ?").get(mf.id) as { n: number };
    if (n.n !== mf.messages) {
      // manifest/rows disagree: the archive is mixed content — refuse
      throw new Error(`${basename(zipPath)}: manifest says ${mf.messages} messages, db holds ${n.n} — refusing a broken archive`);
    }
  } finally {
    probe.close();
    rmSync(probePath, { force: true });
  }

  const existed = !!getSession(mf.id);
  if (existed) closeSessionHandle(mf.id);
  const dest = join(sessionsDir(), `${mf.id}.db`);
  for (const p of [dest, `${dest}-wal`, `${dest}-shm`]) rmSync(p, { force: true });
  writeFileSync(dest, dbRaw);
  // sqlite needs a writable file; archives may carry read-only bits
  try {
    chmodSync(dest, 0o644);
  } catch {}

  // index row: the cache that makes /sessions list it. INSERT OR REPLACE —
  // re-importing refreshes, including the cwd so the session "moved" devices.
  indexDb()
    .prepare(
      "INSERT OR REPLACE INTO sessions (id, cwd, model, title, created_at, updated_at, prompt_tokens, completion_tokens, cached_tokens, preview) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(mf.id, mf.cwd, mf.model, mf.title, mf.created_at, mf.updated_at, 0, 0, 0, null);
  return { id: mf.id, messages: mf.messages, replaced: existed };
}

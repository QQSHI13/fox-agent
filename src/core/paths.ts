/**
 * Single source of truth for the on-disk layout. Both the store and the pty
 * tool used to derive `FOX_AGENT_HOME` themselves, which meant two copies of the same
 * fallback that could drift apart.
 *
 *   $FOX_AGENT_HOME (default ~/.local/share/fox-agent)
 *     index.db              session list only — rebuildable from sessions/
 *     sessions/<id>.db      one database per session
 *     pty/                  tmux pipe-pane logs
 */
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Read lazily on every call: tests set FOX_AGENT_HOME after this module is imported. */
export function agentHome(): string {
  return process.env.FOX_AGENT_HOME ?? join(homedir(), ".local", "share", "fox-agent");
}

export function sessionsDir(): string {
  return join(agentHome(), "sessions");
}

export function sessionDbPath(id: string): string {
  return join(sessionsDir(), `${id}.db`);
}

export function indexDbPath(): string {
  return join(agentHome(), "index.db");
}

export function ptyDir(): string {
  return join(agentHome(), "pty");
}

/** Pre-1.0 single-file store. Deleted on first open; never migrated. */
export function legacyDbPath(): string {
  return join(agentHome(), "sessions.db");
}

/** Create every directory the layout needs. Idempotent. */
export function ensureLayout(): void {
  mkdirSync(sessionsDir(), { recursive: true });
  mkdirSync(ptyDir(), { recursive: true });
}

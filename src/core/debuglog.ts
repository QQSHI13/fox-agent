/**
 * fox-agent's debug log — the one place diagnostics go that are not part of the
 * chat transcript.
 *
 * Anything diagnostic (provider error bodies, plugin failures, turn timings,
 * tool calls, frame-loop faults) goes here, so the TUI never has to choose
 * between printing a raw error over its own grid and losing the information.
 * The transcript keeps one friendly line; this file keeps the truth.
 *
 * ## Levels and categories
 *
 * A level (`trace` < `debug` < `info` < `warn` < `error`) sets how much detail
 * is kept; a category (`provider`, `turn`, `plugin`, `session`, `tools`,
 * `gateway`, `tui`, `config`) says which subsystem. Both are filterable:
 * `FOX_AGENT_DEBUG=provider,turn` keeps those two categories at `debug` level,
 * `FOX_AGENT_DEBUG=warn` keeps warnings and errors from everywhere.
 *
 * ## Cost when off
 *
 * The level check is the FIRST statement in every entry point, before any
 * timestamp, formatting or file work — a disabled call costs one integer
 * compare and allocates nothing. That is what keeps the hot paths (the frame
 * loop, the provider stream, the store) free when debugging is off.
 *
 * ## Format
 *
 * One line per entry, then optional indented detail lines:
 *   [2026-10-22T09:12:33.123Z] ERROR provider: request failed
 *   GET https://api.example.com/v1/chat/completions -> 400
 * Entries are greppable by level (`grep 'ERROR provider:'`).
 */
import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { agentHome } from "./paths.ts";

const CAP = 5_000_000; // bytes

/** Detail depth kept in the log. `off` keeps nothing at all. */
export type DebugLevel = "off" | "error" | "warn" | "info" | "debug" | "trace";

const LEVEL_RANK: Record<DebugLevel, number> = {
  off: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

/** Which subsystem an entry belongs to. */
export type DebugCategory =
  | "provider"
  | "turn"
  | "plugin"
  | "session"
  | "tools"
  | "gateway"
  | "tui"
  | "config"
  | "core";

export function debugLogPath(): string {
  return join(agentHome(), "debug.log");
}

/**
 * The live filter. Module-level so the check is a plain field read on the hot
 * path — no config lookup, no allocation.
 */
let level: DebugLevel = "off";
/** Categories kept when a level is set globally; empty = keep all. */
let categories: Set<DebugCategory> = new Set();
/** Mirror entries to stderr as well as the file (for headless runs). */
let mirrorStderr = false;
/**
 * True when a CLI flag or an env var chose the level. The TUI's config-driven
 * `setDebug(on)` only widens the log when the level was NOT chosen explicitly
 * — otherwise `fox -ddd` would be silently downgraded to the config's `debug`.
 */
let explicitLevel = false;

function parseLevel(v: string | undefined): DebugLevel | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (s in LEVEL_RANK) return s as DebugLevel;
  // "provider,turn" / "provider:debug" / "all"
  if (s === "all" || s === "verbose") return "debug";
  return null;
}

/**
 * Apply a filter from a spec string: `warn`, `debug`, `provider,turn`,
 * `provider:debug`, `all`. Returns the level it settled on, or null if the
 * spec was not understood.
 */
export function applyDebugSpec(spec: string): DebugLevel | null {
  const s = spec.trim().toLowerCase();
  if (!s) return null;
  explicitLevel = true;
  // "category:level" applies a level to specific categories.
  if (s.includes(":")) {
    const [cats, lvl] = s.split(":");
    const parsed = parseLevel(lvl);
    if (!parsed) return null;
    level = parsed;
    categories = new Set(cats.split(",").map((c) => c.trim()).filter(Boolean) as DebugCategory[]);
    return level;
  }
  // comma list of categories = debug level for those categories
  if (s.includes(",")) {
    const list = s.split(",").map((c) => c.trim()).filter(Boolean);
    if (list.every((c) => (c as DebugCategory) in CATEGORIES)) {
      categories = new Set(list as DebugCategory[]);
      level = "debug";
      return level;
    }
    return null;
  }
  const parsed = parseLevel(s);
  if (!parsed) return null;
  level = parsed;
  categories = new Set();
  return level;
}

const CATEGORIES: Record<DebugCategory, true> = {
  provider: true,
  turn: true,
  plugin: true,
  session: true,
  tools: true,
  gateway: true,
  tui: true,
  config: true,
  core: true,
};

export function allDebugCategories(): DebugCategory[] {
  return Object.keys(CATEGORIES) as DebugCategory[];
}

/** The live level. */
export function debugLevel(): DebugLevel {
  return level;
}

/** The live category filter (empty = all categories). */
export function debugCategories(): DebugCategory[] {
  return [...categories];
}

/** Set the level directly (the `/debug` command and the `--debug` flag). */
export function setDebugLevel(l: DebugLevel, explicit = false): void {
  level = l;
  if (explicit) explicitLevel = true;
}

/** Was the level chosen explicitly (CLI flag / env var)? */
export function debugLevelIsExplicit(): boolean {
  return explicitLevel;
}

/** Restrict to these categories (empty = all). */
export function setDebugCategories(cats: DebugCategory[]): void {
  categories = new Set(cats);
}

/** Also print entries to stderr (headless runs: `fox -p ... 2>&1 | grep`). */
export function setDebugMirrorStderr(on: boolean): void {
  mirrorStderr = on;
}

/** Is ANY entry currently being kept? The cheapest possible question. */
export function debugEnabled(): boolean {
  return level !== "off";
}

/** Would an entry at this level/category be kept? The hot-path check. */
function keep(l: DebugLevel, cat: DebugCategory): boolean {
  if (LEVEL_RANK[l] > LEVEL_RANK[level]) return false;
  if (categories.size > 0 && !categories.has(cat)) return false;
  return true;
}

function write(label: string, detail?: unknown): void {
  try {
    mkdirSync(agentHome(), { recursive: true });
    const p = debugLogPath();
    try {
      if (statSync(p).size > CAP) renameSync(p, `${p}.old`);
    } catch {}
    const body = detail === undefined ? "" : detail instanceof Error ? (detail.stack ?? detail.message) : String(detail);
    const line = `[${new Date().toISOString()}] ${label}${body ? `\n${body}\n` : "\n"}`;
    appendFileSync(p, line);
    if (mirrorStderr) process.stderr.write(line);
  } catch {
    // the log must never become a failure of its own — a full disk is not a crash
  }
}

/**
 * Write an entry. The level check happens FIRST, so a call at a disabled level
 * costs one compare and nothing else.
 */
export function debugLog(label: string, detail?: unknown): void {
  write(label, detail);
}

/**
 * Write a categorised, levelled entry. The gate is the first statement: with
 * debug off this is one integer compare per call.
 */
export function debugAt(l: DebugLevel, cat: DebugCategory, message: string, detail?: unknown): void {
  if (!keep(l, cat)) return;
  const label = `${l.toUpperCase()} ${cat}: ${message}`;
  write(label, detail);
}

/** Shorthands for the common levels. */
export const debugTrace = (cat: DebugCategory, msg: string, detail?: unknown) => debugAt("trace", cat, msg, detail);
export const debugInfo = (cat: DebugCategory, msg: string, detail?: unknown) => debugAt("info", cat, msg, detail);
export const debugWarn = (cat: DebugCategory, msg: string, detail?: unknown) => debugAt("warn", cat, msg, detail);
export const debugError = (cat: DebugCategory, msg: string, detail?: unknown) => debugAt("error", cat, msg, detail);

/** Debug verbosity for a level (used by `/debug` to explain the current state). */
export function debugLevelName(): string {
  const cats = debugCategories();
  return cats.length ? `${level} (${cats.join(",")})` : level;
}

/**
 * Read the environment for a debug spec at startup: FOX_AGENT_DEBUG=provider,turn
 * or FOX_AGENT_DEBUG=warn. Returns the level applied, or null.
 */
export function debugFromEnv(): DebugLevel | null {
  return applyDebugSpec(process.env.FOX_AGENT_DEBUG ?? "");
}

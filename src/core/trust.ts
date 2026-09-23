import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { agentHome } from "./paths.ts";
import { PROJECT_CONFIG_NAME, findUp } from "./config.ts";

export function trustFilePath(): string {
  return join(agentHome(), "trusted_dirs");
}

export function normalizeDir(dir: string): string {
  try {
    return resolve(dir);
  } catch {
    return dir;
  }
}

function loadTrustedSet(): Set<string> {
  try {
    const text = readFileSync(trustFilePath(), "utf8");
    return new Set(
      text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map(normalizeDir),
    );
  } catch {
    return new Set();
  }
}

export function isTrusted(dir: string): boolean {
  return loadTrustedSet().has(normalizeDir(dir));
}

export function markTrusted(dir: string): void {
  const cur = normalizeDir(dir);
  const set = loadTrustedSet();
  if (set.has(cur)) return;
  set.add(cur);
  mkdirSync(dirname(trustFilePath()), { recursive: true });
  writeFileSync(trustFilePath(), `${[...set].join("\n")}\n`);
}

export function findProjectConfig(cwd: string): string | null {
  try {
    return findUp(cwd, [PROJECT_CONFIG_NAME]);
  } catch {
    return null;
  }
}

/** Never prompt in scripts/tests: explicit opt-out or missing TTY. */
export function shouldSkipTrustCheck(): boolean {
  const v = process.env.FOX_AGENT_NO_TRUST_CHECK ?? process.env.FOX_AGENT_TRUST_CHECK;
  if (v === "0" || v === "false" || v === "no" || v === "off") return true;
  if (process.env.FOX_AGENT_NO_TRUST_CHECK === "1") return true;
  return false;
}

function err(msg: string): void {
  console.error(process.stderr.isTTY ? `\x1b[90m${msg}\x1b[0m` : msg);
}

/**
 * Classify one trust-prompt keypress. Enter defaults to yes — the prompt
 * reads `[Y]es / [n]o / [c]hange`, and there is no empty input on a
 * single-keypress read, so enter is an explicit confirmation, not an accident.
 * Multi-char escape sequences (arrows, etc.) are unknown: stray keys must
 * re-prompt, never abort or trust.
 */
export function classifyTrustKey(key: string): "yes" | "no" | "change" | "unknown" {
  if (key.startsWith("\x1b") && key.length > 1) return "unknown";
  const k = key[0]?.toLowerCase() ?? "";
  if (k === "y" || k === "\r" || k === "\n") return "yes";
  if (k === "n" || k === "q" || k === "\x1b" || k === "\x03") return "no";
  if (k === "c") return "change";
  return "unknown";
}

/**
 * Read one keypress, without requiring enter.
 *
 * Raw mode on a TTY reports the key the moment it is typed; anywhere else
 * (piped stdin, no setRawMode) falls back to a line read and classifies its
 * first character, so scripts and tests keep working.
 */
/**
 * Swallow habitual type-ahead after a decisive keypress.
 *
 * Someone used to the old prompt types `y e s enter` as four separate
 * keypresses; only the `y` decided anything, and the `es\r` arriving after
 * would land in the TUI input box the moment it opens. So after a decision,
 * discard the rest of the burst: keep consuming while bytes keep arriving,
 * stop at the first quiet window (or a cap, so a held key can't stall startup
 * forever). Anything the user types after reading the next screen arrives
 * long after the quiet window and is untouched.
 */
async function drainBurst(stdin: NodeJS.ReadStream, quietMs = 150, maxMs = 800): Promise<void> {
  const end = Date.now() + maxMs;
  for (;;) {
    const got = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        stdin.off("data", onData);
        resolve(false);
      }, quietMs);
      const onData = () => {
        clearTimeout(timer);
        resolve(true);
      };
      stdin.once("data", onData);
    });
    if (!got || Date.now() >= end) return;
  }
}

async function readTrustKey(prompt: string): Promise<string> {
  // The question ends in ": " on purpose (see readTrustKey's echo): the
  // deciding key lands right after it, on the same line, so the prompt line
  // reads "… [c]hange directory: y" and nothing else follows it.
  err(prompt);
  const stdin = process.stdin as NodeJS.ReadStream & { setRawMode?: (mode: boolean) => void };
  if (process.stdin.isTTY && typeof stdin.setRawMode === "function") {
    stdin.setRawMode(true);
    stdin.resume();
    try {
      const key = await new Promise<string>((resolve) => {
        const onData = (chunk: unknown) => {
          stdin.off("data", onData);
          resolve(Buffer.from(chunk as Uint8Array).toString("utf8"));
        };
        stdin.on("data", onData);
      });
      // raw mode echoes nothing — echo the deciding key + newline so the
      // terminal history shows the answer on the prompt line and nothing
      // else follows it (console.error here used to spend an extra line
      // after the prompt; first char only: a pasted "yes" decides on y)
      const first = key[0] ?? "";
      process.stderr.write(first === "\r" || first === "\n" ? "\n" : `${first.replace(/[\x00-\x1f\x7f]/g, "")}\n`);
      await drainBurst(process.stdin as NodeJS.ReadStream);
      return key;
    } finally {
      try {
        stdin.setRawMode(false);
      } catch {}
      try {
        stdin.pause();
      } catch {}
    }
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return ((await rl.question("")) ?? "").slice(0, 1);
  } finally {
    rl.close();
  }
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Interactive trust gate for TUI start. Shows the working directory clearly,
 * explains what trusting it enables, and lets the user trust, quit, or switch
 * to a different directory. Returns the directory to run in, or null to abort.
 */
export async function promptTrustDir(startCwd: string): Promise<string | null> {
  let cwd = normalizeDir(startCwd);
  for (;;) {
    const project = findProjectConfig(cwd);
    err(`fox-agent working directory: ${cwd}`);
    err(`Do you trust this folder? Only continue if it is a repo you created,`);
    err(`your team's repo, or a well-known project you verified — stars can be faked`);
    err(`and even team repos can be compromised.`);
    if (project) err(`project config found: ${project} ([mcpServers.*]/[agents.*]/[lsp.*]/[providers.*] run as your user)`);
    else err(`no project ${PROJECT_CONFIG_NAME} found here (parent dirs checked too).`);
    err(`AGENTS.md/CLAUDE.md instructions + any file the agent reads can steer it.`);
    err(`Children get your FULL environment (no key stripping).`);
    // single keypress, no enter: y trusts, n aborts, c asks for a directory
    // (that answer is a path, so it still uses a line read). Anything else —
    // arrows, typos — re-prompts rather than deciding for you.
    const kind = classifyTrustKey(await readTrustKey(`trust ${cwd}? [Y]es / [n]o / [c]hange directory: `));
    if (kind === "yes") {
      markTrusted(cwd);
      return cwd;
    }
    if (kind === "change") {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      let next = "";
      try {
        next = ((await rl.question(`new working directory: `)) ?? "").trim();
      } finally {
        rl.close();
      }
      if (!next) continue;
      const resolved = normalizeDir(resolve(cwd, next));
      if (!isDir(resolved)) {
        err(`not a directory: ${resolved}`);
        continue;
      }
      if (isTrusted(resolved)) return resolved;
      cwd = resolved;
      continue;
    }
    if (kind === "unknown") continue;
    // n, q, esc, ctrl+c, or anything else aborts — safe default
    return null;
  }
}

/**
 * Resolve the directory the TUI should run in. Trusted dirs pass through,
 * untrusted interactive dirs go through promptTrustDir (which may return a
 * different directory), non-TTY callers pass through so scripts never block.
 */
export async function resolveTrustedCwd(startCwd: string, opts: { autoTrust?: boolean } = {}): Promise<string | null> {
  const cwd = normalizeDir(startCwd);
  if (opts.autoTrust) {
    markTrusted(cwd);
    return cwd;
  }
  if (shouldSkipTrustCheck()) return cwd;
  if (isTrusted(cwd)) return cwd;
  if (!process.stdin.isTTY) return cwd;
  return promptTrustDir(cwd);
}

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
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
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
      const ans = ((await rl.question(`trust ${cwd}? [y]es / [n]o / [c]hange directory: `)) ?? "").trim().toLowerCase();
      if (ans === "y" || ans === "yes") {
        markTrusted(cwd);
        return cwd;
      }
      if (ans === "c" || ans === "change" || ans === "cd") {
        const next = ((await rl.question(`new working directory: `)) ?? "").trim();
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
      // n, empty, or anything else aborts — safe default
      return null;
    }
  } finally {
    rl.close();
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

import { existsSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { findUp } from "../core/config.ts";

/**
 * Which language server handles which file, and where its project root is.
 *
 * The three built-ins are detected on `PATH` — nothing is spawned unless the
 * user already installed it, so this feature is silent rather than surprising on
 * a machine without a server. `[lsp.*]` in `fox-agent.toml` adds or overrides any of
 * them.
 */
export interface LspServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  /** file extensions this server handles, with the leading dot */
  extensions: string[];
  /** filenames that mark this server's project root, nearest-first */
  rootMarkers?: string[];
}

/**
 * Built-in servers, by name.
 *
 * `typescript-language-server` is the one verified end to end against this repo
 * (initialize 252ms, first diagnostics ~4.8s cold, ~500ms warm). pyright and
 * rust-analyzer follow the same `--stdio`/stdio contract and the same
 * `publishDiagnostics` flow, but they are not installed here and so ship
 * unexercised — if one misbehaves, the failure is contained: an unreachable or
 * broken server degrades to "no diagnostics", never to a failed edit.
 */
export const BUILTIN_SERVERS: Record<string, LspServerConfig> = {
  typescript: {
    command: "typescript-language-server",
    args: ["--stdio"],
    extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
    rootMarkers: ["tsconfig.json", "jsconfig.json", "package.json"],
  },
  pyright: {
    command: "pyright-langserver",
    args: ["--stdio"],
    extensions: [".py", ".pyi"],
    rootMarkers: ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt"],
  },
  rust: {
    command: "rust-analyzer",
    extensions: [".rs"],
    rootMarkers: ["Cargo.toml"],
  },
};

/** LSP `languageId` for a path. Servers use it to pick a parser. */
export function languageId(path: string): string {
  switch (extname(path)) {
    case ".ts":
    case ".mts":
    case ".cts":
      return "typescript";
    case ".tsx":
      return "typescriptreact";
    case ".jsx":
      return "javascriptreact";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".py":
    case ".pyi":
      return "python";
    case ".rs":
      return "rust";
    default:
      return "plaintext";
  }
}

/**
 * Resolve the server for a file, or null if none handles that extension.
 *
 * Config entries are consulted before built-ins so a project can point at a
 * pinned binary (`vtsls`, a workspace-local `pyright`) without fox-agent second-guessing
 * it; a config entry is used even if the command is not on `PATH`, because the
 * user naming it explicitly is a stronger signal than our detection, and the
 * spawn failure it produces is visible and specific.
 */
export function serverFor(
  path: string,
  configured: Record<string, LspServerConfig> = {},
  onPath: (cmd: string) => boolean = commandExists,
): { name: string; cfg: LspServerConfig } | null {
  const ext = extname(path);
  if (!ext) return null;
  for (const [name, cfg] of Object.entries(configured)) {
    if (cfg.extensions?.includes(ext)) return { name, cfg };
  }
  for (const [name, cfg] of Object.entries(BUILTIN_SERVERS)) {
    if (cfg.extensions.includes(ext) && onPath(cfg.command)) return { name, cfg };
  }
  return null;
}

/**
 * The project root to initialize a server at: the nearest ancestor holding one
 * of its markers, else the file's own directory.
 *
 * This matters more than it looks. `typescript-language-server` reports **zero
 * diagnostics, with no error at all**, for a file outside the `include` of the
 * tsconfig it loaded — measured, not assumed. Rooting at the wrong directory
 * therefore does not fail loudly; it silently reports that everything is fine.
 */
export function projectRoot(file: string, cfg: LspServerConfig): string {
  const dir = dirname(file);
  const marker = cfg.rootMarkers?.length ? findUp(dir, cfg.rootMarkers) : null;
  return marker ? dirname(marker) : dir;
}

/** `PATH` lookup without spawning anything. */
export function commandExists(cmd: string): boolean {
  if (cmd.includes("/")) return existsSync(cmd);
  const path = process.env.PATH ?? "";
  for (const dir of path.split(":")) {
    if (dir && existsSync(join(dir, cmd))) return true;
  }
  return false;
}

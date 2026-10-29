/**
 * How to re-launch this fox-agent as another process.
 *
 * Compiled and from-source runs need opposite halves of the same pair. In a
 * `bun build --compile` binary `process.execPath` IS fox-agent and `Bun.main` is
 * a virtual `/$bunfs/root/...` path that no process can execute; running from
 * source it is the other way around — `execPath` is bun and `Bun.main` is
 * `src/cli.ts`. Probed both, rather than assumed.
 *
 * Was `selfAgent()` in tools/task.ts, which needed it for ACP subagents; the MCP
 * pool daemon (`mcp/pool.ts`) needs the same answer, so it lives here instead of
 * being duplicated with a second set of probes that could drift.
 */
import { existsSync } from "node:fs";

export function selfCommand(): { command: string; args: string[] } {
  const main = Bun.main;
  const compiled = main.startsWith("/$bunfs/") || !existsSync(main);
  return { command: process.execPath, args: compiled ? [] : [main] };
}

/**
 * Whether `selfCommand()` would relaunch fox-agent itself.
 *
 * False under `bun test` (Bun.main is the test file) and inside any embedder
 * that imported the SDK: passing --mcp-pool to THOSE would start the wrong
 * program. Callers that spawn a copy of themselves check this first and fall
 * back instead of guessing.
 */
export function canSelfExec(): boolean {
  const main = Bun.main;
  return main.startsWith("/$bunfs/") || /(^|[\\/])cli\.ts$/.test(main) || !existsSync(main);
}

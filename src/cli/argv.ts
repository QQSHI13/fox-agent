/**
 * argv parsing — the ONLY thing the entry needs before it knows whether this
 * run is a real task.
 *
 * Kept in its own module so the entry (cli.ts) and the application (app.ts) can
 * both use it without importing each other: `fox --version` must answer without
 * evaluating the store, the turn loop, the tools or the command surface, and a
 * cycle between entry and app would defeat that.
 *
 * Imports nothing but ConfigError — a parser that pulled the app in would be
 * paying for the whole program to reject a bad flag.
 */
import { ConfigError } from "../core/errors.ts";

export interface Parsed {
  flags: Map<string, string | boolean>;
  rest: string[];
}
/** First-position subcommands: flags after one belong to it, not to fox. */
const SUBCOMMANDS = new Set(["ls", "plugin", "plugins", "upgrade", "json", "mini", "acp", "help", "share"]);
/** Subcommand-specific flags (beyond --help/-h, which every subcommand takes). */
const SUBCOMMAND_FLAGS: Record<string, Set<string>> = {
  upgrade: new Set(["--beta"]),
};
export function parseArgv(argv: string[]): Parsed {
  const flags = new Map<string, string | boolean>();
  const rest: string[] = [];
  const VALUED = new Set([
    "--model",
    "--base-url",
    "--provider",
    "--max-steps",
    "--retry-limit",
    "--compact-at",
    "--request-timeout-ms",
    "--config",
    "--port",
    "--mcp-pool",
    "-p",
    "--print",
  ]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-c" || a === "--continue") {
      // optionally followed by a session selector: `fox -c 2` or `fox -c <id>`.
      // A following flag is never the selector, so `-c -p '...'` still parses.
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) flags.set("continue", next), i++;
      else flags.set("continue", true);
    }
    else if (a === "--no-tui") flags.set("no-tui", true);
    else if (a === "--json") flags.set("json", true);
    else if (a === "--acp") flags.set("acp", true);
    else if (a === "--a2a") flags.set("a2a", true);
    else if (a === "--trust") flags.set("trust", true);
    else if (a === "-h" || a === "--help") {
      // after a known subcommand this belongs to it (`fox upgrade --help`
      // documents upgrade); otherwise it is the global overview. Consuming it
      // globally first is what made every `fox <cmd> --help` print the wrong help.
      const sub = rest[0];
      if (sub !== undefined && SUBCOMMANDS.has(sub)) rest.push(a);
      else flags.set("help", true);
    }
    else if (a === "--version" || a === "-v") flags.set("version", true);
    else if (VALUED.has(a)) {
      const v = argv[++i];
      // a valued flag with no value is a usage error, not an empty override —
      // silently treating `--model` at end-of-argv as "" opened the TUI with a
      // bogus empty model instead of telling the user what was wrong
      if (v === undefined) throw new ConfigError(`flag ${a} needs a value (e.g. ${a} <value>)`);
      flags.set(a === "-p" ? "print" : a.slice(2), v);
    }
    else if (!a.startsWith("-")) {
      // subcommand spellings for the headless modes read better than flags
      // and compose the same way (`fox json -p "..."`); first position only,
      // so e.g. a plugin literally named "mini" still installs and runs
      if (rest.length === 0 && (a === "json" || a === "mini" || a === "acp")) {
        flags.set(a === "json" ? "json" : a === "mini" ? "no-tui" : "acp", true);
      } else rest.push(a);
    } else {
      // after a known subcommand, --help/-h and that subcommand's own flags
      // belong to it (so `fox upgrade --beta` reaches the upgrade handler
      // instead of dying in the parser); anywhere else an unknown flag is
      // still a hard error, not a silent ignore
      const sub = rest[0];
      if (sub !== undefined && SUBCOMMANDS.has(sub) && (a === "--help" || a === "-h" || SUBCOMMAND_FLAGS[sub]?.has(a))) {
        rest.push(a);
      } else {
        // An unknown flag must SAY WHAT TO DO: which command rejected it, what
        // it accepts, and where the full list lives. "unknown flag -z" sent the
        // reader hunting for a flag that does not exist anywhere.
        const where = sub !== undefined && SUBCOMMANDS.has(sub) ? `fox ${sub}` : "fox";
        const known = [...VALUED, "--no-tui", "--json", "--acp", "--a2a", "--trust", "--help", "--version"].sort();
        throw new ConfigError(
          `unknown flag ${a} for ${where}\n` +
            `  known flags: ${known.join(", ")}\n` +
            `  run ${where} --help for details`,
        );
      }
    }
  }
  return { flags, rest };
}

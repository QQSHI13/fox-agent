#!/usr/bin/env bun
/**
 * The entry point — and ONLY the entry point.
 *
 * A `fox` invocation splits in two: the questions that can be answered from
 * argv alone (`--version`, `--help`) and the application (a session, a turn, a
 * server). The application lives in ./app.ts and is imported ONLY once we know
 * this run needs it, because its static graph is the expensive part: the session
 * store (bun:sqlite), the turn loop, every tool, the whole slash-command surface.
 *
 * Before this split, cli.ts imported all of that at module scope, so answering
 * `--version` evaluated the entire agent first. Measured on the same machine:
 * a program that only parses argv and prints took 4.6ms, `fox --version` 16.4ms
 * — the difference was module evaluation for a run that never used any of it.
 *
 * So the rule for this file: no static import of app.ts, the store, the turn
 * loop, the tools or commands.ts. Only argv, the version constant, the command
 * registry and the error type — all of which are a few hundred bytes of code.
 */
import { parseArgv, type Parsed } from "./cli/argv.ts";
import { VERSION } from "./core/version.ts";
import { commandHelp, usage, findCommand } from "./cli/registry.ts";
import { registerBuiltins } from "./cli/builtins.ts";
import { ConfigError } from "./core/errors.ts";

// re-exported so `fox help <cmd>` and the tests keep one import site
export { commandHelp, usage, parseArgv };

// The built-in commands exist as soon as this module is loaded, so `fox help
// <cmd>` works for anyone importing cli.ts — not only through the entry.
registerBuiltins();

/**
 * `--help` / `fox help [cmd]`. Answered here because it is the other question
 * that needs no session. The plugin-commands section costs a plugin load, which
 * is why it sits behind a dynamic import and a catch: a broken plugin must
 * never take the help page down with it.
 */
async function printHelp(parsed: Parsed): Promise<void> {
  // `fox help <cmd>` documents one subcommand; `fox <cmd> --help` documents that
  // command too (the parser folds --help into a flag for a command it does not
  // know yet — a PLUGIN command, say — so the topic is rest[0]). Bare help is
  // the overview.
  const topic = parsed.rest[0] === "help" ? parsed.rest[1] : parsed.rest[0];
  if (topic && findCommand(topic)) return console.log(commandHelp(topic));

  let pluginCmds: { name: string; description?: string }[] = [];
  try {
    const { effectiveConfigPath, loadConfig } = await import("./core/config.ts");
    const { bundledPlugins, bundledDisabled } = await import("./plugins/bundled.ts");
    const { loadPlugins, setActivePlugins } = await import("./plugins/load.ts");
    const pcfg = loadConfig({
      cwd: process.cwd(),
      configPath: effectiveConfigPath((parsed.flags.get("config") as string) || undefined),
    });
    const disabled = pcfg.disabledPlugins ?? [];
    const loaded = await loadPlugins(pcfg.plugins ?? [], undefined, disabled);
    const all = [...bundledPlugins().filter((p) => !bundledDisabled(p.name, disabled)), ...loaded.plugins];
    setActivePlugins(all);
    pluginCmds = all
      .filter((p) => p.cliCommand)
      .map((p) => ({ name: p.cliCommand!.name, description: p.cliCommand!.description ?? `${p.name} subcommand` }));
  } catch {
    /* plugin load failed — omit the section rather than break help */
  }
  console.log(usage(undefined, pluginCmds));
}

async function entry(): Promise<void> {
  const parsed = parseArgv(process.argv.slice(2));

  // The two answers that need no application. Both return before app.ts is
  // imported, which is the whole point of this file.
  if (parsed.flags.get("version")) return console.log(VERSION);
  if (parsed.flags.get("help") || parsed.rest[0] === "help") return printHelp(parsed);

  // Everything else IS the application: evaluate its graph now, once.
  const { run } = await import("./app.ts");
  return run(parsed);
}

// .catch rather than top-level await: `bun build --bytecode` targets CJS, which
// has no TLA, and the pending handles inside run() keep the process alive the
// same way the await did. Guarded so tests can import parseArgv/commandHelp
// without launching the CLI.
if (import.meta.main) {
  entry().catch((e) => {
    if (e instanceof ConfigError) {
      console.error(`fox-agent: ${e.message}`);
      process.exit(1);
    }
    throw e;
  });
}

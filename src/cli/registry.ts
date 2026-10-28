/**
 * The CLI command registry — ONE table for every `fox <command>`.
 *
 * Before this, `src/cli.ts` dispatched with a chain of `parsed.rest[0] === "…"`
 * checks and kept a SECOND parallel map for the per-command help text. Adding a
 * command meant editing both, in a file that mixes dispatch with process
 * setup. This module is the single place a command lives: its name, aliases,
 * summary, help text, and what it does. `cli.ts` looks the name up and runs it;
 * plugin-provided commands join the SAME table, so a plugin's subcommand gets
 * help, usage listing and dispatch for free.
 */
import { VERSION } from "../core/version.ts";

export interface CliCommandContext {
  /** the positional args AFTER the command name */
  args: string[];
  /** parsed flags (global + the command's own) */
  flags: Map<string, string | boolean>;
}

export interface CliCommand {
  /** the name the user types */
  name: string;
  /** other spellings that route here */
  aliases?: string[];
  /** one line, for the usage overview */
  summary: string;
  /** the full help text (`fox <cmd> --help`) */
  help: string;
  /** does this command want `--help` handled for it? (default: yes) */
  handlesHelp?: boolean;
  /** run it */
  run(ctx: CliCommandContext): Promise<void> | void;
}

/**
 * The built-in commands. Plugin commands are appended to this table at dispatch
 * time (see `registerCommand`), so a plugin's `fox gateway` is a first-class
 * command: listed in `fox --help`, documented by `fox help gateway`, and
 * dispatched by the same lookup.
 */
export const CLI_COMMANDS: CliCommand[] = [];

/** Register a command (used by the plugin loader and by tests). */
export function registerCommand(cmd: CliCommand): void {
  const i = CLI_COMMANDS.findIndex((c) => c.name === cmd.name || (c.aliases ?? []).includes(cmd.name));
  if (i >= 0) CLI_COMMANDS[i] = cmd;
  else CLI_COMMANDS.push(cmd);
}

/** Find a command by name or alias. */
export function findCommand(name: string | undefined): CliCommand | undefined {
  if (!name) return undefined;
  return CLI_COMMANDS.find((c) => c.name === name || (c.aliases ?? []).includes(name));
}

/** The help text for a command name (falls back to the overview). */
export function commandHelp(cmd: string): string {
  return findCommand(cmd)?.help ?? usage();
}

/**
 * The overview. The subcommand list is GENERATED from the table, so a new
 * command shows up here without anyone editing this string.
 */
export function usage(color?: boolean, pluginCommands: { name: string; description?: string }[] = []): string {
  const st = {
    b: (s: string) => (color ? `\x1b[1m${s}\x1b[0m` : s),
    dim: (s: string) => (color ? `\x1b[2m${s}\x1b[0m` : s),
    cyan: (s: string) => (color ? `\x1b[36m${s}\x1b[0m` : s),
    yellow: (s: string) => (color ? `\x1b[33m${s}\x1b[0m` : s),
    green: (s: string) => (color ? `\x1b[32m${s}\x1b[0m` : s),
  };
  // subcommands read as actions (cyan), flags read as options (yellow value
  // hints), so a long help page scans by shape before it scans by text
  const cmd = (spec: string, desc: string, extra = "") =>
    `  ${st.cyan(spec.padEnd(24))} ${desc}${extra ? `\n${" ".repeat(28)}${st.dim(extra)}` : ""}`;
  const flag = (spec: string, desc: string, extra = "") =>
    `  ${st.b(spec.padEnd(24))} ${desc}${extra ? `\n${" ".repeat(28)}${st.dim(extra)}` : ""}`;
  return `${st.b(`fox-agent v${VERSION}`)} — light coding harness with agent-controlled context

${st.dim("usage:")} fox ${st.yellow("[options]")} ${st.yellow("[-p \"prompt\"]")}

${st.dim("launch")}
${flag("(no args)", "open TUI in a new session bound to cwd")}
${flag("-c, --continue [n|id]", "continue a session: latest, a 'fox ls' index, or an id", "(no argument + a real terminal opens the picker)")}
${flag("--no-tui", "plain streaming mode (see: fox mini)")}
${flag("--trust", "mark this directory trusted and skip the TUI trust prompt", "(trust = project fox-agent.toml / AGENTS.md may run code as you)")}

${st.dim("headless / scripted")}
${flag("-p, --print", "run one prompt headless, print the answer, exit", "(reads stdin when no prompt given or stdin is piped)")}
${flag("--json", "with -p: emit NDJSON agent events instead of text (see: fox json)")}
${flag("--acp", "serve the Agent Client Protocol on stdio (see: fox acp)")}
${flag("--a2a", "serve the Agent2Agent protocol on HTTP (see: fox a2a)")}
${flag("--port <n>", "port for --a2a (default 0 = ephemeral)")}
${flag("FOX_AGENT_A2A_TOKEN", "bearer token required on every --a2a request when set")}

${st.dim("overrides")}
${flag("--model <id>", "override model")}
${flag("--provider <p>", "openai-compatible | anthropic | google | plugin-registered")}
${flag("--base-url <u>", "override API base url")}
${flag("--max-steps <n>", "turn step cap (default 0 = unlimited)")}
${flag("--retry-limit <n>", "provider retry attempts (default 3)")}
${flag("--compact-at <f>", "auto-compact at this fraction of the context window (default 0.85)")}
${flag("--request-timeout-ms <n>", "abort a provider request silent this long (default 120000, 0 = never)")}
${flag("--config <path>", "config file override")}

${st.dim("subcommands")}
${CLI_COMMANDS.map((c) => cmd(c.name, c.summary)).join("\n")}
${pluginCommands.length ? `
${st.dim("plugin commands")}
${pluginCommands.map((c) => cmd(c.name, c.description ?? `plugin: ${c.name}`)).join("\n")}
` : ""}
${st.dim("inside a session")}: ${st.green("/help")} lists slash commands`;
}

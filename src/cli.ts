#!/usr/bin/env bun
import { createSession, getSession, latestSessionFor, setSessionModel } from "./store/db.ts";
import { loadConfig, resolveProfile, type Config } from "./core/config.ts";
import type { ProviderConfig } from "./providers/types.ts";
import { ConfigError, errMsg } from "./core/errors.ts";
import { runTurnCore } from "./loop/turn.ts";
import { resolveChat } from "./providers/index.ts";
import { setActiveEndpoint } from "./providers/models.ts";
import {
  cliColor,
  completeSlashCommand,
  formatSessionList,
  helpText,
  providerDisplayName,
  relTime,
  resolveSessionArg,
  runSlashCommand,
  sessionList,
  sty,
  type HarnessState,
} from "./commands.ts";
import { shutdownTools } from "./tools/index.ts";
import { VERSION } from "./loop/prompt.ts";
import { expandMentions } from "./core/mentions.ts";

function usage(color?: boolean): string {
  const st = {
    b: (s: string) => (color ? `\x1b[1m${s}\x1b[0m` : s),
    dim: (s: string) => (color ? `\x1b[2m${s}\x1b[0m` : s),
  };
  const flag = (spec: string, desc: string, extra = "") =>
    `  ${st.b(spec.padEnd(24))} ${desc}${extra ? `\n${" ".repeat(28)}${st.dim(extra)}` : ""}`;
  return `${st.b(`fox-agent v${VERSION}`)} \u2014 light coding harness with agent-controlled context

usage: fox [options] [-p "prompt"]

${flag("(no args)", "open TUI in a new session bound to cwd")}
${flag("-p, --print", "run one prompt headless, print the answer, exit", "(reads stdin when no prompt given or stdin is piped)")}
${flag("--json", "with -p: emit NDJSON agent events instead of text (see: fox json)")}
${flag("--acp", "serve the Agent Client Protocol on stdio (see: fox acp)")}
${flag("-c, --continue [n|id]", "continue a session: latest, a 'fox ls' index, or an id", "(no argument + a real terminal opens the picker)")}
${flag("--no-tui", "plain streaming mode (see: fox mini)")}
${flag("--model <id>", "override model")}
${flag("--provider <p>", "openai-compatible | anthropic | google | plugin-registered")}
${flag("--base-url <u>", "override API base url")}
${flag("--max-steps <n>", "turn step cap (default 0 = unlimited)")}
${flag("--retry-limit <n>", "provider retry attempts (default 3)")}
${flag("--compact-at <f>", "auto-compact at this fraction of the context window (default 0.85)")}
${flag("--request-timeout-ms <n>", "abort a provider request silent this long (default 120000, 0 = never)")}
${flag("--config <path>", "config file override")}
${flag("--trust", "mark this directory trusted and skip the TUI trust prompt", "(trust = project fox-agent.toml / AGENTS.md may run code as you)")}
${flag("ls", "list sessions")}
${flag("plugin [on|off|add|rm|info <name>]", "manage plugins without the TUI")}
${flag("json", "headless NDJSON event stream (use with -p \"prompt\" or piped stdin)")}
${flag("mini", "plain streaming REPL, no TUI")}
${flag("acp", "serve the Agent Client Protocol on stdio (for Zed, acpx, ...)")}
${flag("upgrade [--beta|<version>]", "self-update from GitHub releases")}
${flag("help [command]", "show overview, or help for one command")}

slash commands inside a session: /help`;
}

interface Parsed {
  flags: Map<string, string | boolean>;
  rest: string[];
}
/** First-position subcommands: flags after one belong to it, not to fox. */
const SUBCOMMANDS = new Set(["ls", "plugin", "plugins", "upgrade", "json", "mini", "acp", "help"]);
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
    else if (VALUED.has(a)) flags.set(a === "-p" ? "print" : a.slice(2), argv[++i] ?? "");
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
        throw new ConfigError(`unknown flag ${a}`);
      }
    }
  }
  return { flags, rest };
}

/** Usage for one subcommand: `fox <cmd> --help` and `fox help <cmd>`. */
export function commandHelp(cmd: string): string {
  const H: Record<string, string> = {
    ls: `usage: fox ls\n\nlist sessions, most recently worked-in first, across all directories.\nPass an index to resume it: fox -c 2 (or fox -c <id>).`,
    plugin: `usage: fox plugin [on|off|add|rm|info <name>]\n\nlist plugins and switch them on/off without entering the TUI.\nNames accept the short form (pty), the full form (bundled:pty), the\nplugin's own name, or the configured path. (Also: fox plugins, /plugin.)`,
    upgrade: `usage: fox upgrade [--beta|<version>]\n\nbare: latest stable release; beta: newest release including betas;\na version installs that tag (e.g. fox upgrade 0.5.0-beta.1).\nDownloads are SHA-256 verified; the previous binary is kept as .fox-previous.\nGitHub API rate limits apply — set GITHUB_TOKEN (or GH_TOKEN) to raise them.`,
    json: `usage: fox json [-p "prompt"]\n\nheadless NDJSON agent events on stdout (same as -p ... --json).\nReads stdin when no prompt is given or stdin is piped.`,
    mini: `usage: fox mini [-p "prompt"]\n\nplain streaming REPL, no TUI: runtime header, colors, tab completion\nfor /commands, ! shell mode, queued turns. Piped stdin stays non-interactive.`,
    acp: `usage: fox acp\n\nserve the Agent Client Protocol on stdio, for Zed, acpx and other\nACP clients. Stdout is the protocol stream: nothing else may be written to it.`,
  };
  return H[cmd] ?? usage();
}

/** informational startup lines — gray, not the alarming default stderr red */
const note = (msg: string) => console.error(process.stderr.isTTY ? `\x1b[90m${msg}\x1b[0m` : msg);

async function main() {
  const parsed = parseArgv(process.argv.slice(2));
  // installed-binary housekeeping: keep a fox-agent alias beside `fox`
  void import("./core/upgrade.ts").then((m) => m.ensureAlias()).catch(() => {});

  if (parsed.flags.get("version")) return console.log(VERSION);
  if (parsed.flags.get("help") || parsed.rest[0] === "help") {
    // `fox help <cmd>` documents one subcommand; bare help stays the overview
    const topic = parsed.rest[0] === "help" ? parsed.rest[1] : undefined;
    const known: Record<string, string> = { ls: "ls", plugin: "plugin", plugins: "plugin", upgrade: "upgrade", json: "json", mini: "mini", acp: "acp" };
    if (topic && known[topic]) return console.log(commandHelp(known[topic]));
    return console.log(usage(cliColor()));
  }
  if (parsed.rest[0] === "plugin" || parsed.rest[0] === "plugins") {
    if (parsed.rest[1] === "--help" || parsed.rest[1] === "-h") return console.log(commandHelp("plugin"));
    // plugin management without entering the TUI — same inventory and
    // verbs the /plugin slash command works through, in terminal colors
    const { cliColor, pluginAddPath, pluginInfoText, pluginListText, pluginRemovePath, pluginSetEnabled } =
      await import("./commands.ts");
    try {
      const flagPath = (parsed.flags.get("config") as string) || undefined;
      const { effectiveConfigPath } = await import("./core/config.ts");
      const configPath = effectiveConfigPath(flagPath);
      const pcfg = loadConfig({ cwd: process.cwd(), configPath });
      const [sub, ...words] = parsed.rest.slice(1);
      const name = words.join(" ");
      const color = cliColor();
      const ctx = { config: pcfg, configPath, color };
      const out =
        (sub === "on" || sub === "off") && name
          ? await pluginSetEnabled(ctx, name, sub === "on")
          : sub === "add" && name
            ? await pluginAddPath(ctx, name)
            : (sub === "rm" || sub === "remove" || sub === "uninstall") && name
              ? await pluginRemovePath(ctx, name)
              : sub === "info" && name
                ? await pluginInfoText(ctx, name)
                : sub === undefined
                  ? await pluginListText(ctx)
                  : "usage: fox plugin [on|off|add|rm|info <name>]";
      console.log(out);
    } catch (e) {
      console.error(`fox-agent error: ${errMsg(e)}`);
      process.exitCode = 1;
    }
    return;
  }
  if (parsed.rest[0] === "ls") {
    if (parsed.rest[1] === "--help" || parsed.rest[1] === "-h") return console.log(commandHelp("ls"));
    // same renderer the TUI and `/sessions` use, so a session that looks stale
    // here looks stale there too — this used to be its own loop over
    // `created_at` and disagreed with every other listing about ordering
    console.log(formatSessionList(sessionList({ limit: loadConfig({ cwd: process.cwd() }).sessionListLimit }), { color: cliColor() }));
    return;
  }
  if (parsed.rest[0] === "upgrade") {
    if (parsed.rest[1] === "--help" || parsed.rest[1] === "-h") return console.log(commandHelp("upgrade"));
    const sel = parsed.rest[1];
    const opts: import("./core/upgrade.ts").UpgradeOptions =
      sel === "--beta" || sel === "beta" ? { beta: true }
      : sel ? { to: sel.replace(/^v/, "") }
      : {};
    try {
      const { upgrade } = await import("./core/upgrade.ts");
      const r = await upgrade(opts, console.log);
      console.log(r.changed ? `upgraded to v${r.version} — restart fox to run it` : `already on v${r.version}`);
    } catch (e) {
      console.error(`fox-agent error: ${errMsg(e)}`);
      process.exitCode = 1;
    }
    return;
  }
  // a positional argument that survived flag parsing is a command we don't
  // have — refuse it rather than silently opening a TUI the user didn't ask for
  if (parsed.rest.length) {
    console.error(`fox-agent: unknown command '${parsed.rest[0]}' — try 'fox help'`);
    process.exit(1);
  }

  let cwd = process.cwd();
  const autoTrust = !!parsed.flags.get("trust");
  const trustMod = await import("./core/trust.ts");
  // Trust is the malware boundary: trusted dirs get full agent control
  // (project commands, MCP, LSP, !cmd), untrusted dirs get safe keys only.
  // FOX_AGENT_NO_TRUST_CHECK=1 treats everything as trusted (tests/sandboxes).
  let trustedDir = trustMod.shouldSkipTrustCheck() || autoTrust || trustMod.isTrusted(cwd);
  if (autoTrust) {
    try {
      trustMod.markTrusted(cwd);
    } catch {}
    trustedDir = true;
  }
  const configOverrides: Parameters<typeof loadConfig>[0] & { cwd: string } = {
    cwd,
    trusted: trustedDir,
    configPath: (parsed.flags.get("config") as string) || undefined,
    model: (parsed.flags.get("model") as string) || undefined,
    baseUrl: (parsed.flags.get("base-url") as string) || undefined,
    provider: (parsed.flags.get("provider") as Config["provider"]) || undefined,
    maxSteps: parsed.flags.has("max-steps") ? Number(parsed.flags.get("max-steps")) : undefined,
    retryLimit: parsed.flags.has("retry-limit") ? Number(parsed.flags.get("retry-limit")) : undefined,
    compactAt: parsed.flags.has("compact-at") ? Number(parsed.flags.get("compact-at")) : undefined,
    requestTimeoutMs: parsed.flags.has("request-timeout-ms") ? Number(parsed.flags.get("request-timeout-ms")) : undefined,
  };
  let config: Config | undefined;
  // Placeholder until the real config lands — the TUI paints before config
  // loads, so a slow config/plugin path never delays the first frame. The
  // request-time key check (in resolveChat) is what reports a missing key.
  let provider: ProviderConfig = {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "…",
    provider: "openai-compatible",
    requestTimeoutMs: 120_000,
  };
  function applyLoadedConfig(c: Config) {
    config = c;
    const p = resolveProfile(c);
    provider = {
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
      model: c.model,
      provider: p.format,
      label: p.label,
      headers: p.headers,
      // reasoning effort rides in sampling — providers turn it into the
      // format-specific providerOptions (reasoningEffort / thinking budget)
      sampling: { ...p.sampling, ...(c.reasoningEffort ? { reasoningEffort: c.reasoningEffort } : {}) },
      requestTimeoutMs: c.requestTimeoutMs,
    };
    setActiveEndpoint(p.baseUrl);
  }
  const needsConfigNow = !!parsed.flags.get("acp") || parsed.flags.has("print") || !process.stdout.isTTY || !!parsed.flags.get("no-tui");
  if (needsConfigNow) applyLoadedConfig(loadConfig(configOverrides));

  // ---- ACP server ----
  // Ordered ahead of session creation on purpose. An editor spawns `fox --acp`
  // as a subprocess and often shows the user nothing but "agent exited"; ACP has a
  // vocabulary for this (`auth_required` on the first prompt), and the server
  // reports it there instead of dying silently at startup. It also runs before any
  // session is created, since the client asks for sessions via `session/new` —
  // creating one here would orphan an empty session on every launch. From this
  // point stdout is the protocol stream: nothing but ndJSON may be written to it,
  // which is why every message in this file goes to stderr.
  if (parsed.flags.get("acp")) {
    const { runAcpServer } = await import("./acp/server.ts");
    await runAcpServer({ config: config!, provider });
    return;
  }

  const cont = parsed.flags.get("continue");
  const printMode = parsed.flags.has("print") || (!process.stdin.isTTY && !process.stdout.isTTY);
  const tuiMode = !printMode && !parsed.flags.get("no-tui") && !!process.stdout.isTTY;

  // ---- trust gate ----
  // Trusted dirs are saved to $FOX_AGENT_HOME/trusted_dirs so the question is
  // asked once per directory. --trust marks + skips the prompt.
  // TUI interactive prompts (and may chdir); every other mode never blocks —
  // untrusted headless/ACP/plain runs restricted (project commands ignored).
  // No status notes on the TUI path: the prompt already names the directory,
  // the welcome block repeats it inside the TUI, and an extra stderr line
  // after the prompt was exactly the noise users flagged. The one exception
  // is a [c]hange-directory answer — there the switch is worth a line.
  if (tuiMode && !!process.stdin.isTTY && !trustedDir) {
    const trusted = await trustMod.resolveTrustedCwd(cwd, { autoTrust: false });
    if (!trusted) {
      console.error(`fox-agent: untrusted directory — refusing to start in ${cwd}`);
      process.exit(1);
    }
    if (trusted !== cwd) {
      try {
        process.chdir(trusted);
      } catch (e) {
        console.error(`fox-agent: cannot chdir to ${trusted}: ${(e as Error).message}`);
        process.exit(1);
      }
      cwd = trusted;
      configOverrides.cwd = trusted;
      note(`working directory: ${cwd}`);
    }
    trustedDir = true;
    configOverrides.trusted = true;
  } else if (!trustedDir) {
    // Non-interactive: fail safe, not silent. Project [mcpServers/agents/lsp/
    // providers] are ignored by loadConfig(trusted:false); the warnings surface
    // in the turn/headless output via config.warnings. Only mention it when a
    // project file actually exists — otherwise it is noise on every scripted run.
    try {
      if (trustMod.findProjectConfig(cwd)) {
        note(`working directory ${cwd} is untrusted — project commands ignored (use --trust or run the TUI to trust)`);
      }
    } catch {}
  }

  let sessionId: string;
  if (cont) {
    if (typeof cont === "string") {
      // `fox -c 2` / `fox -c <id>`: resolve against the same list /sessions uses,
      // at the same length — a custom sessionListLimit changes what N means
      const id = resolveSessionArg(cont, loadConfig(configOverrides).sessionListLimit);
      if (!id) {
        console.error(`fox-agent: no session '${cont}' — see 'fox ls'`);
        process.exit(1);
      }
      note(`resuming ${id}`);
      sessionId = id;
    } else {
      // the picker can create a session, which needs the real model — load now
      if (!config) applyLoadedConfig(loadConfig(configOverrides));
      const picked = await pickSession(cwd, {
        // `-c -p '...'` and `-c | cat` need an answer without a keypress, so they
        // keep the old behavior: this directory's most recent session. Only a
        // real terminal gets the chooser.
        interactive: !printMode && !!process.stdout.isTTY && !!process.stdin.isTTY,
        model: provider.model,
        theme: config?.theme,
      });
      if (!picked) return; // the user cancelled out of the picker
      sessionId = picked;
    }
  } else if (tuiMode) {
    // no row until the user submits something: starting and closing the TUI
    // must not litter the session list with empties
    sessionId = "";
  } else {
    sessionId = createSession(cwd, provider.model).id;
    note(`new session ${sessionId} (${provider.model})`);
  }
  if (sessionId) getSession(sessionId); // warm

  const state = { sessionId, cwd, provider, config, configPath: (parsed.flags.get("config") as string) || undefined, pendingSession: tuiMode && !sessionId };

  // ---- TUI ----
  if (tuiMode) {
    try {
      // lazy: headless/-p/--acp runs should not pay for the renderer's modules
      const { startTui } = await import("./tui/app.ts");
      await startTui(state, () => {
        // called at boot, on /new and on /reload — always re-read the files
        applyLoadedConfig(loadConfig(configOverrides));
        state.provider = provider;
        state.config = config;
        const s = getSession(state.sessionId);
        if (s && s.model !== provider.model) setSessionModel(state.sessionId, provider.model);
        return { warnings: config?.warnings ?? [] };
      });
    } finally {
      await shutdownTools(sessionId);
    }
    return;
  }

  // ---- headless: -p / --json / piped stdin ----
  let prompt = (parsed.flags.get("print") as string) || "";
  if (!prompt && !process.stdin.isTTY) {
    prompt = await new Response(Bun.stdin.stream()).text();
  }
  const jsonMode = !!parsed.flags.get("json");

  if (!prompt) {
    // interactive plain mode
    await plainLoop(state);
    await shutdownTools(sessionId);
    return;
  }
  // A slash command headlessly means the same thing it means in the TUI: run the
  // command, not a turn. Without this `-p '/prune'` would be sent to the model as
  // a prompt, which both costs a request and does nothing the user asked for.
  const trimmed = prompt.trim();
  if (trimmed.startsWith("/")) {
    try {
      if (trimmed === "/help" || trimmed === "/?") console.log(helpText());
      else {
        const res = runSlashCommand(trimmed, state);
        if (res?.output) console.log(jsonMode ? JSON.stringify({ type: "command", output: res.output }) : res.output);
        if (res?.task) {
          try {
            const out = await res.task();
            console.log(jsonMode ? JSON.stringify({ type: "command", output: out }) : out);
          } catch (e) {
            console.error(`fox-agent error: ${errMsg(e)}`);
            process.exitCode = 1;
          }
        }
      }
    } catch (e) {
      console.error(`fox-agent error: ${errMsg(e)}`);
      process.exitCode = 1;
    } finally {
      await shutdownTools(sessionId);
    }
    return;
  }
  try {
    for await (const ev of runTurnCore(sessionId, provider, trimmed, undefined, {
      // headless reached here only via the eager-load path, so config is set
      maxSteps: config!.maxSteps,
      retryLimit: config!.retryLimit,
      compactAt: config!.compactAt,
      projectInstructions: config!.projectInstructions,
      config,
      chat: resolveChat,
    })) {
      if (jsonMode) console.log(JSON.stringify(ev));
      else emitHuman(ev);
    }
  } catch (e) {
    console.error(`\nfox-agent error: ${errMsg(e)}`);
    process.exitCode = 1;
  } finally {
    await shutdownTools(sessionId);
  }
}

/**
 * Resolve a bare `-c` to a session id, interactively when there is a terminal
 * to do it in. (A `-c` with a selector never reaches here — main resolves it.)
 *
 * Non-tty callers get this directory's newest session, because that is the only
 * answer that needs no keypress; a terminal gets the picker, which can fork or
 * delete from the same list. Returns null only when the user cancelled — the
 * caller must then exit quietly rather than opening something they didn't choose.
 */
async function pickSession(cwd: string, opts: { interactive: boolean; model: string; theme?: string }): Promise<string | null> {
  if (!opts.interactive) {
    const s = latestSessionFor(cwd);
    if (!s) {
      console.error("fox-agent: no previous session in this directory");
      process.exit(1);
    }
    note(`resuming ${s.id}`);
    return s.id;
  }

  // Scoped to cwd by default, like `-c` always was: a session carries its
  // directory, and silently reopening one rooted somewhere else would point
  // every relative path in the transcript at the wrong tree. The `a` key
  // toggles to every directory's sessions for when the user knows the one they
  // want lives elsewhere.
  let allDirs = false;
  const rows = () => sessionRows(sessionList(allDirs ? {} : { cwd }), relTime, allDirs);
  // No sessions in this directory: fall open on the all-directories view rather
  // than minting an empty session the user never asked for. `n` still makes one.
  if (!sessionList({ cwd }).length) allDirs = true;

  const { setTheme } = await import("./tui/themes.ts");
  if (opts.theme) setTheme(opts.theme);
  const { runPicker, sessionRows } = await import("./tui/pickerui.ts");
  const { deleteSession, forkSession } = await import("./store/db.ts");
  const title = () => (allDirs ? "fox-agent — sessions in all directories" : `fox-agent — sessions in ${cwd}`);
  const action = await runPicker(
    rows(),
    { title: title(), allowNew: true, allowDelete: true, allowFork: true, allowAll: true },
    {
      onDelete: (id) => (deleteSession(id) ? rows() : null),
      onAll: () => {
        allDirs = !allDirs;
        return { rows: rows(), title: title() };
      },
    },
  );

  switch (action.kind) {
    case "choose":
      note(`resuming ${action.id}`);
      return action.id;
    case "fork": {
      const fork = forkSession(action.id);
      if (!fork) {
        console.error("fox-agent: fork failed");
        process.exit(1);
      }
      note(`forked ${action.id} -> ${fork.id}`);
      return fork.id;
    }
    case "new": {
      const id = createSession(cwd, opts.model).id;
      note(`new session ${id} (${opts.model})`);
      return id;
    }
    default:
      return null;
  }
}

function emitHuman(ev: import("./core/events.ts").AgentEvent, color = false) {
  // color is opt-in per call: the TUI paints its own styles and piped -p
  // output must stay clean, so only the interactive mini passes true
  const st = sty(color);
  switch (ev.type) {
    case "text":
      process.stdout.write(ev.delta);
      break;
    case "reasoning":
      break;
    case "tool_end":
      process.stdout.write(
        `\n  [m${ev.seq}] » ${st.cyan(ev.name)}${ev.ok ? "" : st.red(" — failed")} → ${ev.output.replace(/\n/g, " ").slice(0, 160)}\n`,
      );
      break;
    case "retry":
      console.error(st.yellow(`\nfox-agent: retry ${ev.attempt}: ${ev.error}`));
      break;
    case "child_tool":
      if (ev.done) console.error(st.dim(`  ${ev.session} · ${ev.name}${ev.ok ? "" : " — failed"}`));
      break;
    case "compacted":
      console.error(st.dim(`\nfox-agent: auto-compacted ${ev.removed.length} messages (${ev.tokens_before} → ${ev.tokens_after} est tok)`));
      break;
    case "warn":
      console.error(st.yellow(`\nfox-agent: ${ev.message}`));
      break;
    case "steered":
      console.error(`\n❯ ${ev.text.replace(/\n/g, " ").slice(0, 120)}`);
      break;
    case "done":
      // headless mode must not exit 0 on a provider/turn failure
      if (ev.reason.startsWith("error") || ev.reason === "aborted") {
        console.error(st.red(`\nfox-agent: turn ended: ${ev.reason}`));
        process.exitCode = 1;
      } else process.stdout.write("\n");
      break;
  }
}

async function plainLoop(state: HarnessState) {
  const { config } = state;
  const color = cliColor();
  const st = sty(color);
  // mini runtime header: what/where/who at a glance, same sources the TUI
  // status line reads so the two can never disagree
  const home = process.env.HOME ?? "";
  const cwdShort = home && state.cwd.startsWith(home) ? "~" + state.cwd.slice(home.length) : state.cwd;
  console.log(st.b(`fox-agent v${VERSION} · mini`) + `  ${st.dim(cwdShort)}`);
  console.log(`model ${st.yellow(state.provider.model)} · ${providerDisplayName(state)}${state.sessionId ? ` · session ${st.cyan(state.sessionId)}` : ""}`);
  console.log(st.dim("type a prompt · ctrl+d exits · /help for commands · tab completes /commands"));

  let busy = false;
  const queued: string[] = [];
  // true when the line asked to leave (only /exit /quit)
  const dispatchMini = async (line: string): Promise<boolean> => {
    const prompt = line.trim();
    if (!prompt) return false;
    if (prompt.startsWith("/")) {
      if (prompt === "/help" || prompt === "/?") console.log(helpText());
      else {
        const res = runSlashCommand(prompt, state);
        if (res?.output) console.log(res.output);
        if (res?.task) {
          try {
            console.log(await res.task());
          } catch (e) {
            console.error(`fox-agent error: ${errMsg(e)}`);
          }
        }
        if (res?.newSessionId) {
          // the old session's resources go with it, same as a TUI switch
          const { fireSessionEnd } = await import("./plugins/load.ts");
          await fireSessionEnd(state.sessionId, "switch").catch(() => {});
          state.sessionId = res.newSessionId;
        }
        if (res?.exit) return true;
      }
      return false;
    }
    if (prompt.startsWith("!")) {
      // shell escape, same meaning as in the TUI — through the exec tool, so
      // timeouts, merged output and group-kill behave identically
      const { execRun } = await import("./tools/exec.ts");
      const r = await execRun(
        { cmd: prompt.slice(1).trim() },
        { sessionId: state.sessionId, cwd: state.cwd } as unknown as import("./tools/types.ts").ToolContext,
      );
      console.log(typeof r === "string" ? r : r.output);
      return false;
    }
    // a turn already running: park behind it like the TUI queues, instead of
    // interleaving two turns on one session
    if (busy) {
      queued.push(prompt);
      console.log(st.dim(`(queued ${queued.length})`));
      return false;
    }
    busy = true;
    try {
      // state.provider is read live — /model and /login REPLACE it, and a
      // captured copy would keep calling the old model/endpoint/key forever.
      // @path mentions inline file text, as in the TUI.
      const text = expandMentions(prompt, state.cwd).text;
      for await (const ev of runTurnCore(state.sessionId, state.provider, text, undefined, {
        maxSteps: config?.maxSteps,
        retryLimit: config?.retryLimit,
        compactAt: config?.compactAt,
        projectInstructions: config?.projectInstructions,
        config,
        chat: resolveChat,
      })) {
        emitHuman(ev, color);
      }
    } catch (e) {
      console.error(`\nfox-agent error: ${errMsg(e)}`);
    } finally {
      busy = false;
    }
    console.log();
    const next = queued.shift();
    if (next !== undefined) return dispatchMini(next);
    return false;
  };

  if (process.stdin.isTTY && process.stdout.isTTY) {
    // interactive: line editing with slash-command tab completion
    const { createInterface } = await import("node:readline");
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "❯ ",
      completer: (line: string): [string[], string] => [completeSlashCommand(line), line],
    });
    rl.prompt();
    rl.on("line", (line: string) => {
      void dispatchMini(line)
        .catch((e) => console.error(`fox-agent error: ${errMsg(e)}`))
        .then((done) => {
          if (done) rl.close();
          else rl.prompt();
        });
    });
    await new Promise<void>((resolve) => rl.on("close", () => resolve()));
    return;
  }
  // piped: sequential line reading, same dispatch (mentions, shell, queueing)
  process.stdout.write("❯ ");
  for await (const line of console) {
    if (await dispatchMini(line)) return;
    process.stdout.write("\n❯ ");
  }
}

// A bad config is now a thrown ConfigError rather than a silently ignored file.
// .catch rather than top-level await: `bun build --bytecode` targets CJS, which
// has no TLA, and the pending handles inside main() keep the process alive the
// same way the await did. Guarded so tests can import parseArgv/commandHelp
// without launching the CLI.
if (import.meta.main) {
  main().catch((e) => {
    if (e instanceof ConfigError) {
      console.error(`fox-agent: ${e.message}`);
      process.exit(1);
    }
    throw e;
  });
}

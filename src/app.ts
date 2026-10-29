/**
 * The application: everything that a real `fox` run does.
 *
 * Deliberately a separate module from the entry (cli.ts). The entry answers
 * `--version` and `--help` and then imports THIS; nothing here is evaluated on
 * those paths. The imports below are the expensive ones — the session store
 * (bun:sqlite), the turn loop, every tool, the whole slash-command surface — and
 * paying for them to print a version string was most of `fox --version`'s cost.
 */
import { createSession, getSession, latestSessionFor, setSessionModel } from "./store/db.ts";
import { join } from "node:path";
import { loadConfig, resolveProfile, type Config } from "./core/config.ts";
import type { ProviderConfig } from "./providers/types.ts";
import { ConfigError, errMsg } from "./core/errors.ts";
import { assertNever } from "./core/events.ts";

import { runTurnCore } from "./loop/turn.ts";
import { attachHost, detachHost } from "./loop/steer.ts";
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
  resolveSessionArgMatches,
  runSlashCommand,
  sessionList,
  sty,
  type HarnessState,
} from "./commands.ts";
import { shutdownTools } from "./tools/index.ts";
import { VERSION } from "./core/version.ts";
import { expandMentions } from "./core/mentions.ts";
import { commandHelp, usage, findCommand, registerCommand, CLI_COMMANDS } from "./cli/registry.ts";
import { registerBuiltins } from "./cli/builtins.ts";
import type { Parsed } from "./cli/argv.ts";


/** informational startup lines — gray, not the alarming default stderr red */
const note = (msg: string) => console.error(process.stderr.isTTY ? `\x1b[90m${msg}\x1b[0m` : msg);

export async function run(parsed: Parsed): Promise<void> {
  if (parsed.flags.get("version")) return console.log(VERSION);
  // installed-binary housekeeping: keep a fox-agent alias beside `fox`
  void import("./core/upgrade.ts").then((m) => m.ensureAlias()).catch(() => {});


  // ---- plugin CLI subcommands ----
  // A plugin may expose a top-level subcommand (`fox gateway`, …) that runs
  // before the TUI, without a session. Load plugins and route only when the
  // first arg is NOT a built-in subcommand (built-ins win). Kept lazy: plugins
  // load only when there's a non-built-in first arg to route.
  const BUILTIN_SUBS = new Set(["ls", "plugin", "plugins", "upgrade", "json", "mini", "acp", "help", "share", "export", "import"]);
  const firstArg = parsed.rest[0];
  if (firstArg && !BUILTIN_SUBS.has(firstArg)) {
    // Route to a plugin's CLI subcommand only when a plugin claims the name.
    // A config that fails to load must NOT hijack the unknown-command report:
    // `fox frobnicate` with no config file is an unknown command, not a config
    // error. The config error is only reported when a plugin actually claims
    // the name and then fails.
    let pcfg: Config | undefined;
    let configError: unknown;
    try {
      const { effectiveConfigPath, loadConfig: loadCfg } = await import("./core/config.ts");
      const cfgPath = effectiveConfigPath((parsed.flags.get("config") as string) || undefined);
      pcfg = loadCfg({ cwd: process.cwd(), configPath: cfgPath });
    } catch (e) {
      configError = e;
    }
    try {
      const { loadPlugins: loadPlugs, setActivePlugins } = await import("./plugins/load.ts");
      const { bundledPlugins, bundledDisabled } = await import("./plugins/bundled.ts");
      const disabled = pcfg?.disabledPlugins ?? [];
      const loaded = pcfg ? await loadPlugs(pcfg.plugins ?? [], undefined, disabled) : { plugins: [], warnings: [], files: [] };
      // bundled plugins are enabled unless explicitly disabled; config plugins are
      // enabled only when listed in config (the loader already honors disabledPlugins).
      const allPlugins = [...bundledPlugins().filter((p) => !bundledDisabled(p.name, disabled)), ...loaded.plugins];
      const hit = allPlugins.find((p) => p.cliCommand?.name === firstArg);
      if (hit?.cliCommand) {
        setActivePlugins(allPlugins);
        // The plugin's command joins the SAME table as the built-ins, so it gets
        // dispatch, `fox help <name>` and the usage listing for free.
        const { registerCommand } = await import("./cli/registry.ts");
        const pluginCmd = hit.cliCommand;
        registerCommand({
          name: pluginCmd.name,
          summary: pluginCmd.description ?? `plugin: ${hit.name} subcommand`,
          help: `usage: fox ${pluginCmd.name} [args]\n\n${pluginCmd.description ?? `provided by the ${hit.name} plugin`}`,
          run: async ({ args, flags }) => {
        // `--help` is the TABLE's job, not the plugin's: a plugin command that
        // binds a port when asked for help (the gateway did) is the worst
        // possible answer to "what does this do".
        if (args[0] === "--help" || args[0] === "-h") {
          console.log(`usage: fox ${pluginCmd.name} [args]\n\n${pluginCmd.description ?? `provided by the ${hit.name} plugin`}`);
          return;
        }
        // resolve provider like the other headless modes so the plugin can run turns
        const { resolveProfile } = await import("./core/config.ts");
        if (!pcfg) {
          // a plugin claims the name but the config is broken — that IS the
          // reason the command cannot run, so say so instead of "unknown command"
          const detail = configError instanceof Error ? (configError.stack ?? configError.message) : String(configError);
          console.error(`fox-agent: '${firstArg}' needs a readable config: ${(configError as Error)?.message ?? detail}`);
          console.error(detail);
          process.exitCode = 1;
          return;
        }
        const p = resolveProfile(pcfg);
        const provider = {
          baseUrl: p.baseUrl,
          apiKey: p.apiKey,
          model: pcfg.model,
          provider: p.format,
          label: p.label,
          headers: p.headers,
          requestTimeoutMs: pcfg.requestTimeoutMs,
        };
        // publish the host API so an ON-DISK plugin can reach the engine without
        // importing the harness's internals (a compiled binary has no src/ beside it)
        const { installHostApi } = await import("./gateway/host.ts");
        installHostApi(pcfg, provider);
        // A plugin that THROWS must say so: the bare catch used to swallow its
        // failure and report "unknown command", which sent the reader hunting for
        // a command that plainly existed. The plugin's own error is the truth.
        try {
          await pluginCmd.run(args, { config: pcfg, provider, flags });
        } catch (e) {
          const detail = e instanceof Error ? (e.stack ?? e.message) : String(e);
          console.error(`fox-agent: plugin command '${pluginCmd.name}' failed: ${(e as Error)?.message ?? detail}`);
          console.error(detail);
          process.exitCode = 1;
        }
          },
        });
      }
      // not a plugin subcommand — fall through to the normal (unknown-command) path
    } catch (e) {
      // The plugin LOAD itself failed (a throwing import, an invalid export).
      // That is NOT "unknown command" — say what broke, or the reader chases a
      // command that exists while the real fault is a broken plugin file.
      const detail = e instanceof Error ? (e.stack ?? e.message) : String(e);
      console.error(`fox-agent: could not load plugins for '${firstArg}': ${(e as Error)?.message ?? detail}`);
      console.error(detail);
      process.exitCode = 1;
      return;
    }
  }

  if (parsed.flags.get("help") || parsed.rest[0] === "help") {
    // `fox help <cmd>` documents one subcommand; `fox <cmd> --help` documents
    // that command too (the parser folds --help into a flag for a command it
    // does not know yet — a PLUGIN command, say — so the topic is rest[0]).
    // Bare help stays the overview.
    const topic = parsed.rest[0] === "help" ? parsed.rest[1] : parsed.rest[0];
    if (topic && findCommand(topic)) return console.log(commandHelp(topic));
    // surface plugin CLI subcommands in the overview so `gateway` and friends are discoverable.
    // Load plugins (bundled unless disabled + config) — bare `--help` hasn't loaded them yet.
    let pluginCmds: { name: string; description?: string }[] = [];
    try {
      const { effectiveConfigPath, loadConfig: loadCfg } = await import("./core/config.ts");
      const { bundledPlugins, bundledDisabled } = await import("./plugins/bundled.ts");
      const { loadPlugins: loadPlugs, setActivePlugins, activePlugins } = await import("./plugins/load.ts");
      const pcfg = loadCfg({ cwd: process.cwd(), configPath: effectiveConfigPath((parsed.flags.get("config") as string) || undefined) });
      const disabled = pcfg.disabledPlugins ?? [];
      const loaded = await loadPlugs(pcfg.plugins ?? [], undefined, disabled);
      const all = [...bundledPlugins().filter((p) => !bundledDisabled(p.name, disabled)), ...loaded.plugins];
      setActivePlugins(all);
      pluginCmds = all
        .filter((p) => p.cliCommand)
        .map((p) => ({ name: p.cliCommand!.name, description: p.cliCommand!.description ?? `${p.name} subcommand` }));
    } catch { /* plugin load failed — omit the section rather than break help */ }
    return console.log(usage(cliColor(), pluginCmds));
  }
  // ---- command dispatch: one lookup, one table ----
  // The built-ins and every plugin-provided command live in the same table
  // (src/cli/registry.ts), so a new command is an entry, not a branch here.
  {
    const cmd = findCommand(parsed.rest[0]);
    if (cmd) {
      await cmd.run({ args: parsed.rest.slice(1), flags: parsed.flags });
      return;
    }
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
    compactWarnAt: parsed.flags.has("compact-warn-at") ? Number(parsed.flags.get("compact-warn-at")) : undefined,
    compactCtxOnlyAt: parsed.flags.has("compact-ctx-only-at") ? Number(parsed.flags.get("compact-ctx-only-at")) : undefined,
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
    // Every startup mode (TUI, --acp, --a2a, -p) lands here, so this is the one
    // place that can start the shared MCP pool before the first turn needs it.
    // Fire-and-forget: the first turn falls back to a local dial if it is not
    // ready, exactly as before this existed.
    void import("./mcp/pool.ts").then((m) => m.warmPool(c.mcpServers, c.mcpSharedPool)).catch(() => {});
  }
  const needsConfigNow = !!parsed.flags.get("acp") || !!parsed.flags.get("a2a") || parsed.flags.has("print") || !process.stdout.isTTY || !!parsed.flags.get("no-tui");
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

  // ---- A2A server ----
  // The horizontal peer-agent surface: other agents (and the gateway plugin)
  // discover this fox-agent at /.well-known/agent-card.json and delegate via
  // SendMessage, SendStreamingMessage (SSE), SubscribeToTask or GetTask. Runs a
  // turn through the same runTurnCore engine as everything else, and speaks the
  // A2A 1.0 protocol (0.3 dialect on request). Binds local-only by default.
  if (parsed.flags.get("a2a")) {
    const { runA2aServer } = await import("./a2a/server.ts");
    const port = Number(parsed.flags.get("port") ?? 0) || 0;
    await runA2aServer({
      config: config!,
      provider,
      port,
      // An endpoint that runs tools with full machine access must not be open
      // beyond loopback without a credential. Off loopback, a token is required.
      authToken: process.env.FOX_AGENT_A2A_TOKEN || undefined,
    });
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
      // `fox -c 2` / `fox -c <id>` / `fox -c <search>`: resolved against the same
      // list /sessions uses, at the same length — a custom sessionListLimit
      // changes what N means. A search term matches what the picker's
      // type-to-filter searches (id/title/cwd/model/preview).
      const id = resolveSessionArg(cont, loadConfig(configOverrides).sessionListLimit);
      if (!id) {
        const hits = resolveSessionArgMatches(cont, loadConfig(configOverrides).sessionListLimit);
        if (hits.length > 1) {
          console.error(`fox-agent: several sessions match '${cont}':`);
          for (const h of hits) console.error(`  ${h.index}  ${h.label}`);
          console.error("use the index or the full id");
        } else console.error(`fox-agent: no session '${cont}' — see 'fox ls'`);
        process.exit(1);
      }
      note(`resuming ${id}`);
      sessionId = id;
    } else if (tuiMode && !printMode && process.stdout.isTTY && process.stdin.isTTY) {
      // Bare `fox -c` on a real terminal: boot the TUI unbound and let its
      // session overlay drive the choice (pickSessionOnBoot), rather than a
      // standalone pre-TUI chooser. sessionId stays "" → pendingSession.
      sessionId = "";
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

  const state = { sessionId, cwd, provider, config, configPath: (parsed.flags.get("config") as string) || undefined, pendingSession: tuiMode && !sessionId, pickSessionOnBoot: tuiMode && cont === true };

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
      compactWarnAt: config!.compactWarnAt,
      compactCtxOnlyAt: config!.compactCtxOnlyAt,
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
        `\n  [${ev.seq}] » ${st.cyan(ev.name)}${ev.ok ? "" : st.red(" — failed")} → ${ev.output.replace(/\n/g, " ").slice(0, 160)}\n`,
      );
      break;
    case "retry":
      console.error(st.yellow(`\nfox-agent: retry ${ev.attempt}: ${ev.error}`));
      break;
    case "child_tool":
      if (ev.done) console.error(st.dim(`  ${ev.session} · ${ev.name}${ev.ok ? "" : " — failed"}`));
      break;
    case "warn":
      console.error(st.yellow(`\nfox-agent: ${ev.message}`));
      break;
    case "steered":
    case "user":
      // A user message, whether typed or steered in mid-turn (a background job
      // finishing, usually). Headless output shows it so the transcript is
      // complete: the answer that follows refers to it.
      console.error(`\n❯ ${ev.text.replace(/\n/g, " ").slice(0, 120)}`);
      break;
    case "done":
      // headless mode must not exit 0 on a provider/turn failure
      if (ev.reason.startsWith("error") || ev.reason === "aborted") {
        console.error(st.red(`\nfox-agent: turn ended: ${ev.reason}`));
        process.exitCode = 1;
      } else process.stdout.write("\n");
      break;
    case "tool_start":
    case "tool_output":
    case "usage":
    case "assistant":
    case "step":
      // in-flight streaming detail and per-step chatter: the headless printer
      // shows settled results only, so these are deliberately not rendered here
      break;
    default:
      assertNever(ev);
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
  // the in-flight turn's AbortController, so a SIGINT (ctrl+c) aborts the
  // provider call instead of killing the whole process — non-null only while
  // a turn runs
  let currentAbort: AbortController | null = null;

  /**
   * Render one turn to the terminal, yielding its events.
   *
   * The spinner, the busy flag and the SIGINT wiring live here so a typed
   * message and a steered one (core starts that turn — src/loop/steer.ts) look
   * and behave identically. A generator because core consumes it.
   */
  async function* miniTurnStream(raw: string, signal: AbortSignal): AsyncGenerator<import("./core/events.ts").AgentEvent> {
    busy = true;
    const spinChars = color ? ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"] : ["-","\\","|","/"];
    let spinIdx = 0;
    let gotOutput = false;
    const spinTimer = setInterval(() => {
      if (!color || gotOutput) return; // stop once real output starts streaming
      process.stderr.write(`\r${st.cyan(spinChars[spinIdx++ % spinChars.length])} thinking…   `);
    }, 80);
    (spinTimer as { unref?: () => void }).unref?.();
    try {
      // state.provider is read live — /model and /login REPLACE it, and a
      // captured copy would keep calling the old model/endpoint/key forever.
      // @path mentions inline file text, as in the TUI.
      const text = expandMentions(raw, state.cwd).text;
      for await (const ev of runTurnCore(state.sessionId, state.provider, text, signal, {
        maxSteps: config?.maxSteps,
        retryLimit: config?.retryLimit,
        compactWarnAt: config?.compactWarnAt,
        compactCtxOnlyAt: config?.compactCtxOnlyAt,
        projectInstructions: config?.projectInstructions,
        config,
        chat: resolveChat,
      })) {
        if (ev.type === "text" && !gotOutput) {
          gotOutput = true;
          clearInterval(spinTimer);
          if (color) process.stderr.write("\r\x1b[K"); // clear the spinner before the text
        }
        emitHuman(ev, color);
        yield ev;
      }
    } catch (e) {
      console.error(`\nfox-agent error: ${errMsg(e)}`);
      throw e;
    } finally {
      clearInterval(spinTimer);
      if (color) process.stderr.write("\r\x1b[K"); // clear the spinner line
      busy = false;
      currentAbort = null;
    }
    console.log();
  }

  /** Send text the USER typed: consume the renderer, owning the abort. */
  const sendMini = async (raw: string): Promise<void> => {
    const ac = new AbortController();
    currentAbort = ac;
    try {
      for await (const _ev of miniTurnStream(raw, ac.signal)) {
        // rendering happens inside miniTurnStream
      }
    } finally {
      if (currentAbort === ac) currentAbort = null;
    }
    const next = queued.shift();
    if (next !== undefined) await dispatchMini(next);
  };

  /** Register this CLI as the session's host, so core can start steered turns. */
  const attachMiniHost = (id: string) =>
    attachHost(id, {
      provider: () => state.provider,
      config: () => config,
      chat: resolveChat,
      turn: (text, ctl) => {
        currentAbort = ctl;
        return miniTurnStream(text, ctl.signal);
      },
    });

  // a resumed session must already have a host, or a steer arriving while idle
  // (a background job finishing) would have no way to become a turn
  if (state.sessionId) attachMiniHost(state.sessionId);

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
          detachHost(state.sessionId);
          state.sessionId = res.newSessionId;
          attachMiniHost(state.sessionId);
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
    await sendMini(prompt);
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
    // ctrl+c during a turn: abort the in-flight provider call (the spinner
    // stops, the turn reports aborted) instead of tearing the REPL down; the
    // readline 'close' on ctrl+d is the only exit. A second ctrl+c with no
    // turn running exits, matching the TUI's esc-then-esc-again.
    process.on("SIGINT", () => {
      if (currentAbort) {
        currentAbort.abort();
      } else {
        console.log();
        rl.close();
      }
    });
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

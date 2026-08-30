#!/usr/bin/env bun
import { createSession, getSession, latestSessionFor } from "./store/db.ts";
import { loadConfig, type Config } from "./core/config.ts";
import { ConfigError, errMsg } from "./core/errors.ts";
import { runTurnCore } from "./loop/turn.ts";
import { resolveChat } from "./providers/index.ts";
import {
  formatSessionList,
  helpText,
  relTime,
  resolveSessionArg,
  runSlashCommand,
  sessionList,
  type HarnessState,
} from "./commands.ts";
import { shutdownTools } from "./tools/index.ts";
import { VERSION } from "./loop/prompt.ts";

function usage(): string {
  return `fox-agent v${VERSION} — light coding harness with agent-controlled context

usage: fox [options] [-p "prompt"]

  (no args)        open TUI in a new session bound to cwd
  -p, --print      run one prompt headless, print the answer, exit
                   (reads stdin when no prompt given or stdin is piped)
  --json           with -p: emit NDJSON agent events instead of text
  --acp            serve the Agent Client Protocol on stdio (for Zed, acpx, ...)
  -c, --continue [n|id]  continue a session: latest, a 'fox ls' index, or an id
                   (no argument + a real terminal opens the picker)
  --no-tui         plain streaming mode (pipes)
  --model <id>     override model
  --provider <p>   openai-compatible | anthropic | google | plugin-registered
  --base-url <u>   override API base url
  --max-steps <n>  turn step cap (default 0 = unlimited)
  --retry-limit <n>        provider retry attempts (default 3)
  --compact-at <f>       auto-compact at this fraction of the context window (default 0.85)
  --request-timeout-ms <n>  abort a provider request silent this long (default 120000, 0 = never)
  --config <path>  config file override
  ls               list sessions
  help             show this

slash commands inside a session: /help`;
}

interface Parsed {
  flags: Map<string, string | boolean>;
  rest: string[];
}
function parseArgv(argv: string[]): Parsed {
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
    else if (a === "-h" || a === "--help") flags.set("help", true);
    else if (a === "--version" || a === "-v") flags.set("version", true);
    else if (VALUED.has(a)) flags.set(a === "-p" ? "print" : a.slice(2), argv[++i] ?? "");
    else if (!a.startsWith("-")) rest.push(a);
    else {
      console.error(`fox-agent: unknown flag ${a}`);
      process.exit(1);
    }
  }
  return { flags, rest };
}

/** informational startup lines — gray, not the alarming default stderr red */
const note = (msg: string) => console.error(process.stderr.isTTY ? `\x1b[90m${msg}\x1b[0m` : msg);

async function main() {
  const parsed = parseArgv(process.argv.slice(2));

  if (parsed.flags.get("version")) return console.log(VERSION);
  if (parsed.flags.get("help") || parsed.rest[0] === "help") return console.log(usage());
  if (parsed.rest[0] === "ls") {
    // same renderer the TUI and `/sessions` use, so a session that looks stale
    // here looks stale there too — this used to be its own loop over
    // `created_at` and disagreed with every other listing about ordering
    console.log(formatSessionList(sessionList()));
    return;
  }
  // a positional argument that survived flag parsing is a command we don't
  // have — refuse it rather than silently opening a TUI the user didn't ask for
  if (parsed.rest.length) {
    console.error(`fox-agent: unknown command '${parsed.rest[0]}' — try 'fox help'`);
    process.exit(1);
  }

  const cwd = process.cwd();
  const config = loadConfig({
    cwd,
    configPath: (parsed.flags.get("config") as string) || undefined,
    model: (parsed.flags.get("model") as string) || undefined,
    baseUrl: (parsed.flags.get("base-url") as string) || undefined,
    provider: (parsed.flags.get("provider") as Config["provider"]) || undefined,
    maxSteps: parsed.flags.has("max-steps") ? Number(parsed.flags.get("max-steps")) : undefined,
    retryLimit: parsed.flags.has("retry-limit") ? Number(parsed.flags.get("retry-limit")) : undefined,
    compactAt: parsed.flags.has("compact-at") ? Number(parsed.flags.get("compact-at")) : undefined,
    requestTimeoutMs: parsed.flags.has("request-timeout-ms") ? Number(parsed.flags.get("request-timeout-ms")) : undefined,
  });
  const provider = {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    provider: config.provider,
    requestTimeoutMs: config.requestTimeoutMs,
  };

  // ---- ACP server ----
  // Ordered ahead of the missing-key exit on purpose. An editor spawns `fox --acp`
  // as a subprocess and often shows the user nothing but "agent exited"; ACP has a
  // vocabulary for this (`auth_required` on the first prompt), and the server
  // reports it there instead of dying silently at startup. It also runs before any
  // session is created, since the client asks for sessions via `session/new` —
  // creating one here would orphan an empty session on every launch. From this
  // point stdout is the protocol stream: nothing but ndJSON may be written to it,
  // which is why every message in this file goes to stderr.
  if (parsed.flags.get("acp")) {
    const { runAcpServer } = await import("./acp/server.ts");
    await runAcpServer({ config, provider });
    return;
  }

  const cont = parsed.flags.get("continue");
  const printMode = parsed.flags.has("print") || (!process.stdin.isTTY && !process.stdout.isTTY);

  // No key is not a startup refusal when there is a UI to fix it in: the TUI
  // opens anyway and /login configures a key without a restart. Headless fails
  // fast instead — there is no /login there, just a guaranteed 401.
  if (!config.apiKey && printMode) {
    console.error(
      "fox-agent: no API key — set FOX_AGENT_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY, or run fox interactively and use /login",
    );
    process.exit(1);
  }

  let sessionId: string;
  if (cont) {
    if (typeof cont === "string") {
      // `fox -c 2` / `fox -c <id>`: resolve against the same list /sessions uses
      const id = resolveSessionArg(cont);
      if (!id) {
        console.error(`fox-agent: no session '${cont}' — see 'fox ls'`);
        process.exit(1);
      }
      note(`resuming ${id}`);
      sessionId = id;
    } else {
      const picked = await pickSession(cwd, {
        // `-c -p '...'` and `-c | cat` need an answer without a keypress, so they
        // keep the old behavior: this directory's most recent session. Only a
        // real terminal gets the chooser.
        interactive: !printMode && !!process.stdout.isTTY && !!process.stdin.isTTY,
        model: provider.model,
      });
      if (!picked) return; // the user cancelled out of the picker
      sessionId = picked;
    }
  } else {
    sessionId = createSession(cwd, provider.model).id;
    note(`new session ${sessionId} (${provider.model})`);
  }
  getSession(sessionId); // warm

  const state = { sessionId, cwd, provider, config, configPath: (parsed.flags.get("config") as string) || undefined };

  // ---- TUI ----
  if (!printMode && !parsed.flags.get("no-tui") && process.stdout.isTTY) {
    try {
      // lazy: headless/-p/--acp runs should not pay for the renderer's modules
      const { startTui } = await import("./tui/app.ts");
      await startTui(state);
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
      maxSteps: config.maxSteps,
      retryLimit: config.retryLimit,
      compactAt: config.compactAt,
      projectInstructions: config.projectInstructions,
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
async function pickSession(cwd: string, opts: { interactive: boolean; model: string }): Promise<string | null> {
  if (!opts.interactive) {
    const s = latestSessionFor(cwd);
    if (!s) {
      console.error("fox-agent: no previous session in this directory");
      process.exit(1);
    }
    note(`resuming ${s.id}`);
    return s.id;
  }

  // Scoped to cwd, like `-c` always was: a session carries its directory, and
  // silently reopening one rooted somewhere else would point every relative
  // path in the transcript at the wrong tree.
  const items = sessionList({ cwd });
  if (!items.length) {
    const id = createSession(cwd, opts.model).id;
    note(`no previous session here — new session ${id} (${opts.model})`);
    return id;
  }

  const { runPicker, sessionRows } = await import("./tui/pickerui.ts");
  const { deleteSession, forkSession } = await import("./store/db.ts");
  const action = await runPicker(
    sessionRows(items, relTime),
    { title: `fox-agent — sessions in ${cwd}`, allowNew: true, allowDelete: true, allowFork: true },
    { onDelete: (id) => (deleteSession(id) ? sessionRows(sessionList({ cwd }), relTime) : null) },
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

function emitHuman(ev: import("./core/events.ts").AgentEvent) {
  switch (ev.type) {
    case "text":
      process.stdout.write(ev.delta);
      break;
    case "reasoning":
      break;
    case "tool_end":
      process.stdout.write(`\n  [m${ev.seq}] ⚙ ${ev.name}${ev.ok ? "" : " ✗"} → ${ev.output.replace(/\n/g, " ").slice(0, 160)}\n`);
      break;
    case "retry":
      console.error(`\nfox-agent: retry ${ev.attempt}: ${ev.error}`);
      break;
    case "child_tool":
      if (ev.done) console.error(`  ↳ ${ev.session} · ${ev.name}${ev.ok ? "" : " ✗"}`);
      break;
    case "compacted":
      console.error(`\nfox-agent: auto-compacted ${ev.removed.length} messages (${ev.tokens_before} → ${ev.tokens_after} est tok)`);
      break;
    case "warn":
      console.error(`\nfox-agent: ${ev.message}`);
      break;
    case "done":
      // headless mode must not exit 0 on a provider/turn failure
      if (ev.reason.startsWith("error") || ev.reason === "aborted") {
        console.error(`\nfox-agent: turn ended: ${ev.reason}`);
        process.exitCode = 1;
      } else process.stdout.write("\n");
      break;
  }
}

async function plainLoop(state: HarnessState) {
  const { sessionId, provider, config } = state;
  console.log("plain mode · type a prompt · ctrl+d exits · /help for commands");
  process.stdout.write("❯ ");
  for await (const line of console) {
    const prompt = line.trim();
    if (!prompt) {
      process.stdout.write("❯ ");
      continue;
    }
    if (prompt.startsWith("/")) {
      if (prompt === "/help" || prompt === "/?") console.log(helpText());
      else {
        const res = runSlashCommand(prompt, state);
        if (res?.output) console.log(res.output);
        if (res?.newSessionId) state.sessionId = res.newSessionId;
        if (res?.exit) return;
      }
      process.stdout.write("\n❯ ");
      continue;
    }
    try {
      for await (const ev of runTurnCore(state.sessionId, provider, prompt, undefined, {
        maxSteps: config?.maxSteps,
        retryLimit: config?.retryLimit,
        compactAt: config?.compactAt,
        projectInstructions: config?.projectInstructions,
        config,
        chat: resolveChat,
      })) {
        emitHuman(ev);
      }
    } catch (e) {
      console.error(`\nfox-agent error: ${errMsg(e)}`);
    }
    console.log();
    process.stdout.write("❯ ");
  }
}

// A bad config is now a thrown ConfigError rather than a silently ignored file,
// and loadConfig runs before any of main's own try/catch. Without this the user
// gets a Bun stack trace for what is really a one-line "fix your config" message.
try {
  await main();
} catch (e) {
  if (e instanceof ConfigError) {
    console.error(`fox-agent: ${e.message}`);
    process.exit(1);
  }
  throw e;
}

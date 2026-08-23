#!/usr/bin/env bun
import { createSession, getSession, latestSessionFor } from "./store/db.ts";
import { loadConfig, type Config } from "./core/config.ts";
import { errMsg } from "./core/errors.ts";
import { runTurnCore } from "./loop/turn.ts";
import { resolveChat } from "./providers/index.ts";
import { runSlashCommand, type HarnessState } from "./commands.ts";
import { startTui } from "./tui/app.ts";
import { shutdownTools } from "./tools/index.ts";
import { VERSION } from "./loop/prompt.ts";

function usage(): string {
  return `fox v${VERSION} — light coding harness with agent-controlled context

usage: fox [options] [-p "prompt"]

  (no args)        open TUI in a new session bound to cwd
  -p, --print      run one prompt headless, print the answer, exit
                   (reads stdin when no prompt given or stdin is piped)
  --json           with -p: emit NDJSON agent events instead of text
  -c, --continue   resume this directory's latest session
  --no-tui         plain streaming mode (pipes)
  --model <id>     override model
  --provider <p>   openai-compatible | anthropic
  --base-url <u>   override API base url
  --max-steps <n>  turn step cap (default 40)
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
  const VALUED = new Set(["--model", "--base-url", "--provider", "--max-steps", "--config", "-p", "--print"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-c" || a === "--continue") flags.set("continue", true);
    else if (a === "--no-tui") flags.set("no-tui", true);
    else if (a === "--json") flags.set("json", true);
    else if (a === "-h" || a === "--help") flags.set("help", true);
    else if (a === "--version" || a === "-v") flags.set("version", true);
    else if (VALUED.has(a)) flags.set(a === "-p" ? "print" : a.slice(2), argv[++i] ?? "");
    else if (!a.startsWith("-")) rest.push(a);
    else {
      console.error(`fox: unknown flag ${a}`);
      process.exit(1);
    }
  }
  return { flags, rest };
}

async function main() {
  const parsed = parseArgv(process.argv.slice(2));

  if (parsed.flags.get("version")) return console.log(VERSION);
  if (parsed.flags.get("help") || parsed.rest[0] === "help") return console.log(usage());
  if (parsed.rest[0] === "ls") {
    const { listSessions, sessionUsage } = await import("./store/db.ts");
    for (const s of listSessions()) {
      const u = sessionUsage(s.id);
      console.log(
        `${s.id}  ${new Date(s.created_at).toLocaleString()}  ${s.model.padEnd(22)} ${String(u.prompt + u.completion).padStart(7)} tok  ${
          s.title ?? s.cwd
        }`,
      );
    }
    return;
  }

  const cwd = process.cwd();
  const config = loadConfig({
    cwd,
    configPath: (parsed.flags.get("config") as string) || undefined,
    model: (parsed.flags.get("model") as string) || undefined,
    baseUrl: (parsed.flags.get("base-url") as string) || undefined,
    provider: (parsed.flags.get("provider") as Config["provider"]) || undefined,
    maxSteps: parsed.flags.has("max-steps") ? Number(parsed.flags.get("max-steps")) : undefined,
  });
  if (!config.apiKey) {
    console.error("fox: set FOX_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY (or FOX_BASE_URL pointing at your gateway)");
    process.exit(1);
  }

  const provider = { baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model, provider: config.provider };
  const cont = !!parsed.flags.get("continue");
  const printMode = parsed.flags.has("print") || (!process.stdin.isTTY && !process.stdout.isTTY);

  let sessionId: string;
  if (cont) {
    const s = latestSessionFor(cwd);
    if (!s) {
      console.error("fox: no previous session in this directory");
      process.exit(1);
    }
    sessionId = s.id;
    console.error(`resuming ${sessionId}`);
  } else {
    sessionId = createSession(cwd, provider.model).id;
    console.error(`new session ${sessionId} (${provider.model})`);
  }
  getSession(sessionId); // warm

  const state = { sessionId, cwd, provider, config };

  // ---- TUI ----
  if (!printMode && !parsed.flags.get("no-tui") && process.stdout.isTTY) {
    try {
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
  try {
    for await (const ev of runTurnCore(sessionId, provider, prompt.trim(), undefined, {
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
    console.error(`\nfox error: ${errMsg(e)}`);
    process.exitCode = 1;
  } finally {
    await shutdownTools(sessionId);
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
      console.error(`\nfox: retry ${ev.attempt}: ${ev.error}`);
      break;
    case "compacted":
      console.error(`\nfox: auto-compacted ${ev.removed.length} messages (${ev.tokens_before} → ${ev.tokens_after} est tok)`);
      break;
    case "warn":
      console.error(`\nfox: ${ev.message}`);
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
      if (prompt === "/help" || prompt === "/?") console.log((await import("./commands.ts")).SLASH_HELP);
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
      console.error(`\nfox error: ${errMsg(e)}`);
    }
    console.log();
    process.stdout.write("❯ ");
  }
}

await main();

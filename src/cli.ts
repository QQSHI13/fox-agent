#!/usr/bin/env bun
import { createSession, getSession, latestSessionFor } from "./store/db.ts";
import { providerFromEnv } from "./provider/openai.ts";
import { runTurn } from "./loop/agent.ts";
import { runSlashCommand } from "./commands.ts";
import { startTui } from "./tui.tsx";

const VERSION = "0.1.0";

function usage(): string {
  return `foxc v${VERSION} — light coding harness with agent-controlled context

usage: foxc [options]

  (no args)        open TUI in a new session bound to cwd
  -c, --continue   resume this directory's latest session
  --no-tui         plain streaming mode (pipes/CI)
  --model <id>     override model
  --base-url <u>   override API base url
  ls               list sessions
  help             show this

slash commands inside a session: /help`;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "help" || argv.includes("-h") || argv.includes("--help")) {
    console.log(usage());
    return;
  }
  if (argv[0] === "ls") {
    const { listSessions, sessionUsage } = await import("./store/db.ts");
    for (const s of listSessions()) {
      const u = sessionUsage(s.id);
      console.log(`${s.id}  ${new Date(s.created_at).toLocaleString()}  ${s.model.padEnd(22)} ${String(u.prompt + u.completion).padStart(7)} tok  ${s.title ?? s.cwd}`);
    }
    return;
  }

  const cont = argv.includes("-c") || argv.includes("--continue");
  const noTui = argv.includes("--no-tui") || !process.stdout.isTTY;
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const provider = providerFromEnv();
  provider.model = flag("--model") ?? provider.model;
  if (flag("--base-url")) provider.baseUrl = String(flag("--base-url")).replace(/\/$/, "");

  const cwd = process.cwd();
  let sessionId: string;
  if (cont) {
    const s = latestSessionFor(cwd);
    if (!s) {
      console.error("foxc: no previous session in this directory");
      process.exit(1);
    }
    sessionId = s.id;
    console.log(`resuming ${sessionId}`);
  } else {
    sessionId = createSession(cwd, provider.model).id;
    console.log(`new session ${sessionId} (${provider.model})`);
  }

  const state = { sessionId, cwd, provider };
  getSession(sessionId); // warm

  if (!noTui) {
    await startTui(state);
    return;
  }

  // ---- plain mode ----
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
        if (res?.exit) return;
      }
      process.stdout.write("\n❯ ");
      continue;
    }
    try {
      for await (const ev of runTurn(sessionId, provider, prompt)) {
        if (ev.type === "text") process.stdout.write(ev.delta);
        else if (ev.type === "tool_end")
          process.stdout.write(`\n  [m${ev.seq}] ${ev.name} → ${ev.output.replace(/\n/g, " ").slice(0, 120)}\n`);
      }
    } catch (e) {
      console.error(`\nfoxc error: ${(e as Error).message}`);
    }
    process.stdout.write("\n❯ ");
  }
}

await main();

#!/usr/bin/env bun
import { createSession, latestSessionFor, listSessions, sessionUsage } from "./store/db.ts";
import { providerFromEnv } from "./provider/openai.ts";
import { runTurn } from "./loop/agent.ts";

const args = process.argv.slice(2);
const cwd = process.cwd();

function fail(msg: string): never {
  console.error(`foxc: ${msg}`);
  process.exit(1);
}

async function main() {
  if (args[0] === "ls") {
    for (const s of listSessions()) {
      const u = sessionUsage(s.id);
      console.log(`${s.id}  ${new Date(s.created_at).toLocaleString()}  ${s.model.padEnd(20)} ${u.prompt + u.completion} tok  ${s.title ?? s.cwd}`);
    }
    return;
  }

  const cont = args.includes("-c") || args.includes("--continue");
  const provider = providerFromEnv();

  let session;
  if (cont) {
    session = latestSessionFor(cwd) ?? fail("no previous session in this directory");
    console.log(`resuming ${session.id}`);
  } else {
    session = createSession(cwd, provider.model);
    console.log(`new session ${session.id} (${provider.model})`);
  }

  console.log("type a prompt, ctrl+d to exit");

  process.stdout.write("❯ ");
  for await (const line of console) {
    const prompt = line.trim();
    if (!prompt) {
      process.stdout.write("❯ ");
      continue;
    }
    try {
      for await (const ev of runTurn(session.id, provider, prompt)) {
        if (ev.type === "text") {
          process.stdout.write(ev.delta);
        } else if (ev.type === "tool_end") {
          const preview = ev.output.replace(/\n/g, " ").slice(0, 120);
          process.stdout.write(`\n  [m${ev.seq}] ${ev.name} → ${preview}\n`);
        } else if (ev.type === "usage") {
          // silent per-call; totals printed at turn end
        }
      }
      const u = sessionUsage(session.id);
      process.stdout.write(`\n· ${u.prompt + u.completion} tok\n`);
    } catch (e) {
      console.error(`\nfoxc error: ${(e as Error).message}`);
    }
    process.stdout.write("\n❯ ");
  }
}

await main();

#!/usr/bin/env bun
/**
 * Drive `fox --acp` from acpx: the acceptance check that closes v2.
 *
 * `test/acp.test.ts` has 31 tests, and every one of them pairs fox-agent's agent to a
 * client *in-process* — `client().connectWith(buildAgent(...), …)`, the seam
 * `buildAgent` exists for. Same SDK on both ends, same objects, no serialization.
 * A misspelled field, a capability advertised in `initialize` but mishandled, or
 * framing that only round-trips inside one library would pass all 31.
 *
 * acpx (https://npmjs.com/acpx) is a foreign client written against the protocol
 * as published, not against this repo's model of it. That is the entire value
 * here, and it is why this is a script rather than only a unit test: it needs a
 * built binary, a real subprocess, and a provider.
 *
 * Hermetic: `test/fixtures/fake-provider.ts` answers fox-agent's provider calls, so
 * this needs no API key and no network. `--json-strict` gives us the raw wire
 * frames on stdout, which is what the assertions read.
 *
 *   bun scripts/acp-accept.ts            # after `bun run build`
 *   bun scripts/acp-accept.ts --verbose  # dump every frame
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFakeProvider, FAKE_TEXT_REPLY, FAKE_TOOL_BODY, FAKE_TOOL_FILE, type FakeScript } from "../test/fixtures/fake-provider.ts";

const ROOT = join(import.meta.dir, "..");
const FOX = join(ROOT, "bin", "fox");
const VERBOSE = process.argv.includes("--verbose");

const failures: string[] = [];
let checks = 0;

function check(ok: boolean, what: string, detail = "") {
  checks++;
  if (ok) console.log(`  ✓ ${what}`);
  else {
    console.log(`  ✗ ${what}${detail ? `\n      ${detail}` : ""}`);
    failures.push(what);
  }
}

/** A JSON-RPC frame from acpx's --json-strict stream. */
interface Frame {
  id?: number | null;
  method?: string;
  params?: Record<string, any>;
  result?: Record<string, any>;
  error?: Record<string, any>;
}

interface RunResult {
  code: number | null;
  frames: Frame[];
  stdout: string;
  stderr: string;
  /** every `session/update` payload, in order */
  updates: Record<string, any>[];
}

/**
 * One acpx invocation against `fox --acp`.
 *
 * `exec` rather than a bare prompt: acpx otherwise expects a session record it
 * manages itself to already exist, and refuses with NO_SESSION. `exec` is its
 * one-shot path and creates the session as part of the run, which is what we
 * want to exercise anyway.
 */
async function runAcpx(args: string[], env: Record<string, string>, cwd: string): Promise<RunResult> {
  const p = Bun.spawn(
    [
      "acpx",
      "--agent",
      `${FOX} --acp`,
      "--cwd",
      cwd,
      "--format",
      "json",
      // strict mode is an assertion in itself: acpx refuses to emit anything
      // non-JSON, so sloppy framing that a permissive client tolerates fails here
      "--json-strict",
      "--approve-all",
      "--timeout",
      "45",
      // fox-agent never prompts for auth over ACP (it answers authRequired when it has
      // no key), so `skip` keeps acpx from inventing an auth step
      "--auth-policy",
      "skip",
      ...args,
    ],
    { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" },
  );

  const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);

  const frames: Frame[] = [];
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      frames.push(JSON.parse(t));
    } catch {
      // a non-JSON line under --json-strict is itself a finding; recorded via the
      // stdout-purity check rather than thrown here
    }
  }
  if (VERBOSE) for (const f of frames) console.log(`    | ${JSON.stringify(f).slice(0, 240)}`);

  const updates = frames.filter((f) => f.method === "session/update").map((f) => f.params!.update);
  return { code, frames, stdout, stderr, updates };
}

/** A temp FOX_AGENT_HOME + cwd + fake provider, torn down together. */
async function withRig<T>(script: FakeScript, fn: (rig: { env: Record<string, string>; work: string; fake: { requests: number } }) => Promise<T>): Promise<T> {
  const home = mkdtempSync(join(tmpdir(), "fox-acpx-home-"));
  const work = mkdtempSync(join(tmpdir(), "fox-acpx-work-"));
  const fake = startFakeProvider(script);
  try {
    return await fn({
      env: {
        FOX_AGENT_HOME: home,
        FOX_AGENT_BASE_URL: fake.baseUrl,
        FOX_AGENT_API_KEY: "fake-key-never-leaves-this-machine",
        FOX_AGENT_PROVIDER: "openai-compatible",
        FOX_AGENT_MODEL: "test-model",
      },
      work,
      fake,
    });
  } finally {
    fake.stop();
    rmSync(home, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * fox-agent's stdout *is* the protocol stream, so a stray `console.log` anywhere in the
 * agent path corrupts it.
 *
 * This has to be a direct probe rather than an acpx assertion, which is worth
 * spelling out because the tempting version does not work: acpx's stdout under
 * `--format json` is acpx's own reconstruction of the conversation, not fox-agent's
 * bytes, so inspecting it only ever proves acpx emits JSON. Nor does
 * `--json-strict` help — it suppresses acpx's non-JSON *stderr* and says nothing
 * about the agent — and acpx's ndjson reader skips an unparseable line in
 * silence. Verified by sabotage: a `console.log` at the top of `runAcpServer`
 * left all three acpx runs passing while fox-agent's first stdout line was plain text.
 *
 * So: spawn fox-agent, hand it one `initialize` frame, and read what it actually wrote.
 */
async function stdoutPurityRun() {
  console.log("\n[4/4] raw stdout — the protocol stream carries protocol only");
  const home = mkdtempSync(join(tmpdir(), "fox-acpx-pure-"));
  try {
    const p = Bun.spawn([FOX, "--acp"], {
      cwd: home,
      env: { ...process.env, FOX_AGENT_HOME: home, FOX_AGENT_API_KEY: "fake", FOX_AGENT_MODEL: "test-model", FOX_AGENT_BASE_URL: "http://127.0.0.1:1" },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    p.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: 1, clientCapabilities: {} } })}\n`);
    await p.stdin.flush();

    // read until the response arrives, then stop — the server stays up until its
    // stdin closes, so waiting on exit would hang
    const reader = p.stdout.getReader();
    const dec = new TextDecoder();
    let seen = "";
    const deadline = Bun.nanoseconds() + 15e9;
    while (!seen.includes("\n") && Bun.nanoseconds() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      seen += dec.decode(value, { stream: true });
    }
    reader.releaseLock();
    p.kill();
    await p.exited;

    const lines = seen.split("\n").filter((l) => l.length > 0);
    check(lines.length > 0, "fox-agent answered initialize on stdout");
    const junk = lines.filter((l) => {
      try {
        JSON.parse(l);
        return false;
      } catch {
        return true;
      }
    });
    check(junk.length === 0, "every line fox-agent writes to stdout is a JSON frame", junk.slice(0, 3).join(" | "));
    // parsed defensively: when the line above fails, the first line is by
    // definition not JSON, and a throw here would replace a clear report with a
    // stack trace
    let first: Record<string, any> | null = null;
    try {
      first = lines[0] ? JSON.parse(lines[0]) : null;
    } catch {
      first = null;
    }
    check(first?.jsonrpc === "2.0" && first?.id === 0, "the first thing on stdout is the initialize response", lines[0]?.slice(0, 120));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

async function textRun() {
  console.log("\n[1/4] text turn — initialize, session/new, session/prompt, end_turn");
  await withRig("text", async ({ env, work, fake }) => {
    const r = await runAcpx(["exec", "say hi"], env, work);
    check(r.code === 0, "acpx exits 0", `code=${r.code} stderr=${r.stderr.slice(0, 200)}`);

    const init = r.frames.find((f) => f.method === "initialize" && f.result === undefined);
    const initRes = r.frames.find((f) => f.id === init?.id && f.result)?.result;
    check(initRes?.protocolVersion === 1, "initialize reports protocol version 1", JSON.stringify(initRes?.protocolVersion));
    check(initRes?.agentInfo?.name === "fox-agent", "initialize identifies the agent as fox-agent");

    // the capabilities fox-agent advertises at src/acp/server.ts:136 — a foreign client
    // reads these and will call the methods they promise, so a claim fox-agent cannot
    // honor is worse than not claiming it
    const caps = initRes?.agentCapabilities?.sessionCapabilities ?? {};
    for (const cap of ["list", "delete", "fork", "resume", "close"]) {
      check(caps[cap] !== undefined, `advertises session capability: ${cap}`);
    }
    check(initRes?.agentCapabilities?.loadSession === true, "advertises loadSession");

    const newRes = r.frames.find((f) => r.frames.some((q) => q.id === f.id && q.method === "session/new") && f.result)?.result;
    check(typeof newRes?.sessionId === "string" && newRes.sessionId.length > 0, "session/new returns a session id");

    const chunks = r.updates.filter((u) => u.sessionUpdate === "agent_message_chunk");
    check(chunks.length >= 2, `streams agent_message_chunk (${chunks.length} chunks)`);
    const text = chunks.map((c) => c.content?.text ?? "").join("");
    check(text === FAKE_TEXT_REPLY, "the streamed text is what the provider sent", JSON.stringify(text));

    const usage = r.updates.find((u) => u.sessionUpdate === "usage_update");
    check(usage !== undefined && usage.used > 0 && usage.size > 0, "reports usage_update with used and size", JSON.stringify(usage));

    const promptRes = r.frames.find((f) => f.result?.stopReason)?.result;
    check(promptRes?.stopReason === "end_turn", "session/prompt resolves end_turn", JSON.stringify(promptRes));
    check(fake.requests > 0, "fox-agent actually called the provider", `requests=${fake.requests}`);
  });
}

async function toolRun() {
  console.log("\n[2/4] tool turn — tool_call, tool_call_update, real side effect");
  await withRig("tool", async ({ env, work }) => {
    const r = await runAcpx(["exec", "write the file"], env, work);
    check(r.code === 0, "acpx exits 0", `code=${r.code} stderr=${r.stderr.slice(0, 200)}`);

    const start = r.updates.find((u) => u.sessionUpdate === "tool_call");
    check(start !== undefined, "emits tool_call when the tool starts");
    check(start?.status === "pending", "the tool_call is pending", JSON.stringify(start?.status));
    check(start?.name === "write", "the tool_call names the tool");
    check(start?.kind === "edit", "the tool_call carries an ACP ToolKind", JSON.stringify(start?.kind));
    check(start?.rawInput?.path === FAKE_TOOL_FILE, "the tool_call carries rawInput");

    const end = r.updates.find((u) => u.sessionUpdate === "tool_call_update");
    check(end !== undefined, "emits tool_call_update when the tool finishes");
    check(end?.status === "completed", "the update reports completed", JSON.stringify(end?.status));
    check(end?.toolCallId === start?.toolCallId, "the update correlates by toolCallId");
    check(Array.isArray(end?.content) && end.content.length > 0, "the update carries the tool's output");

    // fox-agent runs its own tools rather than delegating to the client's fs/* (the
    // deliberate choice in src/acp/server.ts's header). This is the proof: the
    // file exists even though acpx was told --approve-all and never asked to write.
    const p = join(work, FAKE_TOOL_FILE);
    check(existsSync(p), "the tool had a real effect on disk");
    check(existsSync(p) && readFileSync(p, "utf8") === FAKE_TOOL_BODY, "the file holds what the tool was told to write");

    const promptRes = r.frames.find((f) => f.result?.stopReason)?.result;
    check(promptRes?.stopReason === "end_turn", "the turn still ends end_turn after a tool", JSON.stringify(promptRes));
  });
}

async function sessionListRun() {
  console.log("\n[3/4] session/list — a capability fox-agent advertises, exercised for real");
  await withRig("text", async ({ env, work }) => {
    // a turn first, so there is something to list and it has a title
    await runAcpx(["exec", "say hi"], env, work);
    const r = await runAcpx(["sessions", "list"], env, work);
    check(r.code === 0, "acpx exits 0", `code=${r.code} stderr=${r.stderr.slice(0, 200)}`);

    // `sessions list` reports one object rather than a frame stream; `source`
    // distinguishes fox-agent's own session store from acpx's local records, so this is
    // the assertion that the session/list capability was actually called
    const payload = r.frames.find((f) => Array.isArray((f as Record<string, any>).sessions)) as Record<string, any> | undefined;
    check(payload?.source === "agent", "acpx queried the agent, not its own records", JSON.stringify(payload?.source));
    const sessions = payload?.sessions ?? [];
    check(sessions.length >= 1, `the agent reported its sessions (${sessions.length})`);
    check(typeof sessions[0]?.sessionId === "string", "each entry has a sessionId");
    check(sessions[0]?.cwd === work, "each entry reports the cwd it was created in", JSON.stringify(sessions[0]?.cwd));
    check(sessions[0]?.title === "say hi", "the title is the first user message", JSON.stringify(sessions[0]?.title));
    // updatedAt is where an earlier recency bug lived; over the wire it must be a
    // parseable ISO timestamp, not a raw epoch or a missing field
    const ts = Date.parse(sessions[0]?.updatedAt ?? "");
    check(Number.isFinite(ts) && ts > 0, "updatedAt is an ISO timestamp", JSON.stringify(sessions[0]?.updatedAt));
  });
}

// ---- main ----

if (!existsSync(FOX)) {
  console.error(`fox binary not found at ${FOX} — run \`bun run build\` first`);
  process.exit(2);
}
if (!Bun.which("acpx")) {
  console.error("acpx not on PATH — install it (npm i -g acpx) or skip this check");
  process.exit(2);
}

console.log(`acpx acceptance check against ${FOX}`);
console.log("(hermetic: a scripted local provider, no API key, no network)");

await textRun();
await toolRun();
await sessionListRun();
await stdoutPurityRun();

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length) {
  console.log(`\nfailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("fox-agent speaks ACP as published, not just as its own tests model it.");

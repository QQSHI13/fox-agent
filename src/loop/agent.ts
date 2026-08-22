import { appendMessage, estTokens, getSession, recordUsage } from "../store/db.ts";
import { streamChat, type ChatMessage, type ToolCall } from "../provider/openai.ts";
import type { ProviderConfig } from "../provider/openai.ts";
import { registry, type ToolContext } from "../tools/index.ts";
import { renderContext } from "./context.ts";
import { OUT_CAP } from "../tools/files.ts";

export const VERSION = "0.1.0";

export type TurnEvent =
  | { type: "reasoning"; delta: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; seq: number; name: string; args: string }
  | { type: "tool_end"; seq: number; name: string; output: string }
  | { type: "usage"; prompt_tokens: number; completion_tokens: number }
  | { type: "done"; reason: string };

export async function* runTurn(
  sessionId: string,
  cfg: ProviderConfig,
  userText: string,
  signal?: AbortSignal,
): AsyncGenerator<TurnEvent> {
  const session = getSession(sessionId);
  if (!session) throw new Error(`no session ${sessionId}`);

  const userNode = appendMessage(sessionId, {
    parent_id: null,
    role: "user",
    content: userText,
    tokens: estTokens(userText),
  });
  const turnStartSeq = userNode.seq;
  const tools = registry();
  const toolDefs = [...tools.values()].map((t) => t.def);
  // shared per-turn state so "read before write/edit" works across calls
  let ptyState: ToolContext["pty"] = undefined;
  const turnReads = new Set<string>();

  while (true) {
    const messages = buildMessages(sessionId, session.cwd, cfg.model);
    const assistantText: string[] = [];
    const calls: ToolCall[] = [];
    let finish = "";
    let lastUsage: { prompt_tokens: number; completion_tokens: number } | null = null;

    for await (const ev of streamChat(cfg, messages, toolDefs, signal)) {
      if (ev.type === "reasoning") {
        yield ev;
      } else if (ev.type === "text") {
        assistantText.push(ev.delta);
        yield ev;
      } else if (ev.type === "tool_call") {
        calls.push(ev.call);
      } else if (ev.type === "usage") {
        lastUsage = { prompt_tokens: ev.prompt_tokens, completion_tokens: ev.completion_tokens };
        yield ev;
      } else if (ev.type === "done") {
        finish = ev.reason;
      }
    }

    const text = assistantText.join("");
    const asstNode = appendMessage(sessionId, {
      parent_id: userNode.id,
      role: "assistant",
      content: text,
      tool_calls: calls.length ? JSON.stringify(calls) : null,
      tokens: estTokens(text) + calls.reduce((a, c) => a + estTokens(c.arguments), 0),
    });
    if (lastUsage) recordUsage(sessionId, asstNode.id, lastUsage.prompt_tokens, lastUsage.completion_tokens);

    if (!calls.length) {
      yield { type: "done", reason: finish || "stop" };
      return;
    }

    for (const call of calls) {
      const tool = tools.get(call.name);
      let output: string;
      let err: string | null = null;
      const tctx: ToolContext = {
        sessionId,
        cwd: session.cwd,
        turnStartSeq,
        readFiles: turnReads,
        get pty() {
          return ptyState;
        },
        set pty(v) {
          ptyState = v;
        },
      };
      if (!tool) {
        output = `error: unknown tool ${call.name}`;
        err = output;
      } else {
        try {
          output = await tool.run(safeParse(call.arguments), tctx);
          if (output.startsWith("error:")) err = output;
        } catch (e) {
          output = `error: ${(e as Error).message}`;
          err = output;
        }
      }
      if (output.length > OUT_CAP * 2) output = output.slice(-OUT_CAP * 2);
      const node = appendMessage(sessionId, {
        parent_id: asstNode.id,
        role: "tool",
        content: output,
        tool_call_id: call.id,
        tokens: estTokens(output),
        error: err,
      });
      yield { type: "tool_start", seq: node.seq, name: call.name, args: call.arguments.slice(0, 200) };
      yield { type: "tool_end", seq: node.seq, name: call.name, output };
    }
    if (signal?.aborted) {
      yield { type: "done", reason: "aborted" };
      return;
    }
  }
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}

// ---- runtime header + system prompt ----

function gitInfo(cwd: string): string {
  try {
    const branch = Bun.spawnSync(["git", "-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], { stdout: "pipe", stderr: "ignore" });
    if (branch.exitCode !== 0) return "repo=no";
    const dirty = Bun.spawnSync(["git", "-C", cwd, "status", "--porcelain"], { stdout: "pipe" });
    const n = dirty.stdout.toString().trim().split("\n").filter(Boolean).length;
    return `repo=yes branch=${branch.stdout.toString().trim()} dirty=${n}`;
  } catch {
    return "repo=no";
  }
}

export function buildMessages(sessionId: string, cwd: string, model: string): ChatMessage[] {
  const header = [
    "<runtime>",
    `cwd: ${cwd}`,
    `git: ${gitInfo(cwd)}`,
    `os: ${process.platform} shell=/bin/bash`,
    `date: ${new Date().toISOString().slice(0, 10)}`,
    `model: ${model}`,
    `foxc: v${VERSION}`,
    "</runtime>",
  ].join("\n");

  const prompt = `You are foxc, a light coding harness. You have full control of the machine — no permission prompts.

Every message in your context carries a marker like [m12]. You can edit your own context window with ctx_edit:
- delete ops hide stale/noisy nodes from future turns (pass summary to keep a one-line note)
- replace ops rewrite a node's text
Use it proactively when old tool outputs pile up — storage is safe, only your view changes.

${header}`;

  return renderContext(sessionId, prompt);
}

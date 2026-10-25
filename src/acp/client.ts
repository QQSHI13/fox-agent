/**
 * fox as an ACP *client* — fox-agent driving another agent.
 *
 * This is what makes delegation (`src/tools/task.ts`) a protocol boundary instead
 * of an in-process special case: the child is any ACP agent, spawned as a
 * subprocess, and by default it is another `fox --acp` with the full tool
 * registry. Nothing about the child is privileged or restricted by the parent.
 *
 * The client handlers here reflect fox-agent's own posture rather than a generic host's:
 * `fs/*` is honored (fox-agent has full disk access anyway, so refusing would be
 * theater), `session/request_permission` auto-approves, `terminal/*` runs a real
 * child process, and `elicitation/*` is answered with a decline — see the
 * per-handler comments.
 */
import * as acp from "@agentclientprotocol/sdk/unstable";
import { RequestError } from "@agentclientprotocol/sdk/unstable";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { killTree } from "../tools/exec.ts";

export interface AcpAgentSpec {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface RunAcpAgentOptions extends AcpAgentSpec {
  cwd: string;
  prompt: string;
  signal?: AbortSignal;
  /** every update the child sends, in order, before the turn stops */
  onUpdate?: (u: acp.SessionUpdate) => void;
}

export interface AcpAgentResult {
  text: string;
  stopReason: acp.StopReason;
  sessionId: string;
}

/**
 * Wrap a spawned child's stdio for `ndJsonStream`.
 *
 * Bun's `proc.stdin` is a `FileSink`, not a WHATWG `WritableStream`, so the SDK
 * cannot consume it directly. This and `bunStdout` in `./server.ts` are the only
 * two places that gap is bridged; if a third appears, one of them is wrong.
 */
function childStream(proc: Bun.Subprocess<"pipe", "pipe", "inherit">): acp.Stream {
  const sink = proc.stdin;
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      sink.write(chunk);
      return sink.flush() as unknown as Promise<void>;
    },
    close() {
      sink.end();
    },
    abort() {
      sink.end();
    },
  });
  return acp.ndJsonStream(writable, proc.stdout as ReadableStream<Uint8Array>);
}

/** Resolve a client-supplied path against the session cwd, as ACP requires absolute. */
function resolvePath(cwd: string, path: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

/** One live terminal, from `terminal/create` until `terminal/release`. */
interface LiveTerminal {
  proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  /** stdout+stderr as they arrived, still raw: bytes, not text */
  chunks: Uint8Array[];
  truncated: boolean;
  limit: number;
  /** pending SIGKILL from `killTree`, dropped when the child exits on its own */
  cancelKill: (() => void) | null;
  exited: Promise<acp.TerminalExitStatus>;
}

/** The exit status of a terminal's process, or undefined while it still runs. */
function exitStatusOf(p: LiveTerminal["proc"]): acp.TerminalExitStatus | undefined {
  if (p.exitCode === null && p.signalCode === null) return undefined;
  // `signal` must be a string per the protocol, but Bun reports a number or a
  // Signals name — String() covers both without a mapping table.
  return { exitCode: p.exitCode, signal: p.signalCode == null ? null : String(p.signalCode) };
}

/**
 * The terminal host.
 *
 * ACP's `terminal/*` is how an agent asks the *client* to run a command —
 * the point being that the client owns the sandbox, the environment and the
 * user's visibility. fox-agent runs it for real, in the session cwd, because
 * the alternative (a half-built host that fakes output) is worse than a clear
 * refusal. Output is accumulated with the requested byte limit honoured, since
 * a chatty build can otherwise put megabytes through the protocol.
 */
class TerminalHost {
  private terminals = new Map<string, LiveTerminal>();
  private nextId = 1;

  constructor(private cwd: string) {}

  create(params: acp.CreateTerminalRequest): acp.CreateTerminalResponse {
    const cwd = params.cwd ? resolvePath(this.cwd, params.cwd) : this.cwd;
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
    for (const e of params.env ?? []) env[e.name] = e.value;

    const proc = Bun.spawn([params.command, ...(params.args ?? [])], {
      cwd,
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      // `detached` puts the child in its own process group, which is what
      // killTree targets — without it `sh -c "bun test"` survives the kill and
      // keeps running (and holding the pipes) after the editor closed it.
      detached: true,
    });
    const id = `term-${this.nextId++}`;
    const term: LiveTerminal = {
      proc,
      chunks: [],
      truncated: false,
      limit: params.outputByteLimit && params.outputByteLimit > 0 ? params.outputByteLimit : 1_000_000,
      cancelKill: null,
      exited: proc.exited.then(() => exitStatusOf(proc) ?? { exitCode: proc.exitCode, signal: null }),
    };
    this.terminals.set(id, term);

    // Drain both pipes as bytes. Truncation happens at read time, not here:
    // the protocol says to keep the TAIL of the output, and dropping from the
    // front means deciding what a character boundary is, which needs the
    // decoding context a per-chunk append throws away.
    const append = (chunk: Uint8Array) => {
      term.chunks.push(chunk);
    };
    void (async () => {
      for await (const chunk of proc.stdout as ReadableStream<Uint8Array>) append(chunk);
    })();
    void (async () => {
      for await (const chunk of proc.stderr as ReadableStream<Uint8Array>) append(chunk);
    })();

    return { terminalId: id };
  }

  private get(terminalId: string): LiveTerminal {
    const t = this.terminals.get(terminalId);
    if (!t) throw RequestError.invalidParams(undefined, `unknown terminal ${JSON.stringify(terminalId)}`);
    return t;
  }

  output(params: acp.TerminalOutputRequest): acp.TerminalOutputResponse {
    const t = this.get(params.terminalId);
    return { output: this.textOf(t), truncated: t.truncated, exitStatus: exitStatusOf(t.proc) };
  }

  /** The retained tail of a terminal's output, decoded as one stream. */
  private textOf(t: LiveTerminal): string {
    let bytes = t.chunks.length === 1 ? t.chunks[0]! : Buffer.concat(t.chunks);
    if (bytes.byteLength > t.limit) {
      // keep the tail: a build's failure reason is the last thing it printed
      bytes = bytes.subarray(bytes.byteLength - t.limit);
      t.truncated = true;
      // never start inside a multi-byte character: 0b10xxxxxx is a continuation
      let i = 0;
      while (i < bytes.byteLength && i < 3 && (bytes[i]! & 0xc0) === 0x80) i++;
      if (i) bytes = bytes.subarray(i);
    }
    // one decoder for the whole retained buffer, so a character split across
    // two chunks is still decoded correctly
    return new TextDecoder().decode(bytes);
  }

  async waitForExit(params: acp.WaitForTerminalExitRequest): Promise<acp.WaitForTerminalExitResponse> {
    return await this.get(params.terminalId).exited;
  }

  kill(params: acp.KillTerminalRequest): acp.KillTerminalResponse {
    this.stop(this.get(params.terminalId));
    return {};
  }

  release(params: acp.ReleaseTerminalRequest): acp.ReleaseTerminalResponse {
    const t = this.terminals.get(params.terminalId);
    // releasing an unknown id is not an error: the agent may be cleaning up
    // after a failure and cannot know whether its own create succeeded
    if (t) {
      this.stop(t);
      this.terminals.delete(params.terminalId);
    }
    return {};
  }

  /** Kill every terminal an exiting connection left behind. */
  closeAll(): void {
    for (const t of this.terminals.values()) this.stop(t);
    this.terminals.clear();
  }

  /** TERM then KILL the whole process group, reusing exec's `killTree`. */
  private stop(t: LiveTerminal): void {
    if (t.proc.pid && exitStatusOf(t.proc) === undefined) {
      t.cancelKill?.();
      t.cancelKill = killTree(t.proc.pid);
      void t.exited.then(() => t.cancelKill?.());
    }
  }
}

/**
 * Live terminal hosts, so an exiting connection can kill what it spawned.
 *
 * `ClientApp` has no close hook, and `connectWith` resolving is the only signal
 * that the connection is done — so `runAcpAgent` calls `closeAllTerminals()` in
 * its finally rather than this module inventing a lifecycle the SDK lacks.
 */
const liveHosts = new Set<TerminalHost>();

/** Kill every terminal every host is still running. Idempotent. */
export function closeAllTerminals(): void {
  for (const h of liveHosts) h.closeAll();
  liveHosts.clear();
}

/**
 * The client half fox-agent presents to a child agent. Exported so tests can pair it
 * against an in-process agent app with no subprocess.
 */
export function buildClient(cwd: string): acp.ClientApp {
  const terminals = new TerminalHost(cwd);
  liveHosts.add(terminals);

  return acp
    .client({ name: "fox-agent" })
    .onRequest(acp.methods.client.fs.readTextFile, async ({ params }) => {
      const full = resolvePath(cwd, params.path);
      try {
        let content = readFileSync(full, "utf8");
        if (params.line != null || params.limit != null) {
          const lines = content.split("\n");
          const from = Math.max(0, (params.line ?? 1) - 1);
          content = lines.slice(from, params.limit != null ? from + params.limit : undefined).join("\n");
        }
        return { content };
      } catch (e) {
        throw RequestError.internalError(undefined, `read ${full}: ${(e as Error).message}`);
      }
    })
    .onRequest(acp.methods.client.fs.writeTextFile, async ({ params }) => {
      const full = resolvePath(cwd, params.path);
      try {
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, params.content);
        return {};
      } catch (e) {
        throw RequestError.internalError(undefined, `write ${full}: ${(e as Error).message}`);
      }
    })
    .onRequest(acp.methods.client.session.requestPermission, async ({ params }) => {
      // fox-agent never prompts (see the security model), so it cannot start prompting
      // on a child's behalf either. Pick the first allow-shaped option; if the
      // agent offered none, report cancellation rather than inventing an id.
      const opt =
        params.options.find((o) => o.kind === "allow_always") ?? params.options.find((o) => o.kind === "allow_once");
      if (!opt) return { outcome: { outcome: "cancelled" } };
      return { outcome: { outcome: "selected", optionId: opt.optionId } };
    })
    .onRequest(acp.methods.client.terminal.create, async ({ params }) => terminals.create(params))
    .onRequest(acp.methods.client.terminal.output, async ({ params }) => terminals.output(params))
    .onRequest(acp.methods.client.terminal.waitForExit, async ({ params }) => terminals.waitForExit(params))
    .onRequest(acp.methods.client.terminal.kill, async ({ params }) => terminals.kill(params))
    .onRequest(acp.methods.client.terminal.release, async ({ params }) => terminals.release(params))
    .onRequest(acp.methods.client.elicitation.create, async ({ params }) => {
      // `elicitation/create` exists so an agent can ask the *human* a question
      // mid-turn. fox-agent's whole posture is that no human is watching — it
      // is a no-prompt harness, and a delegating parent answering on the user's
      // behalf would be inventing consent for a form it cannot read.
      //
      // `decline` is the protocol's own word for "the user was asked and said
      // no"; `cancel` means "could not ask". Neither is true, so the honest
      // choice is `decline` with no content, which a conforming agent treats as
      // "proceed without this input" rather than as an error to retry.
      void params;
      return { action: "decline" as const };
    })
    .onNotification(acp.methods.client.elicitation.complete, async () => {
      // A completion notice for an elicitation we already declined — nothing to
      // do, and throwing here would break the child's stream for no reason.
    });
}

/**
 * Environment for a child agent.
 *
 * Note what this does NOT use: `childEnv()`, which is now a plain passthrough
 * (no credential stripping — secrets live in shell rc files / exported env and
 * the agent can read those files directly). An ACP agent is a peer harness whose entire
 * job is to call a model, so it needs the full env by design, and today's
 * in-process subagent already runs with the key by virtue of sharing the process.
 *
 * What keeps that safe is that the model cannot choose the command: the default
 * is fox-agent itself, and every alternative is a `[agents.<name>]` entry the user
 * wrote in `fox-agent.toml`. The model only picks a name from that fixed set. If you
 * ever let a tool argument reach `command`, this reasoning collapses and the env
 * must be filtered again.
 */
function agentEnv(extra?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) out[k] = v;
  return extra ? { ...out, ...extra } : out;
}

/**
 * Run one prompt against a child ACP agent and return its final text.
 *
 * The child's own text is accumulated from `agent_message_chunk` updates; thought
 * chunks are excluded, since a delegating parent wants the report, not the
 * child's reasoning. `signal` maps to `session/cancel` and then to killing the
 * process, because an agent that ignores cancel must not outlive the turn.
 */
export async function runAcpAgent(opts: RunAcpAgentOptions): Promise<AcpAgentResult> {
  const proc = Bun.spawn([opts.command, ...(opts.args ?? [])], {
    cwd: opts.cwd,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit", // the child's diagnostics belong on the parent's stderr, never in the protocol stream
    env: agentEnv(opts.env),
  });

  const kill = () => {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  };

  try {
    return await buildClient(opts.cwd).connectWith(childStream(proc), async (agent) => {
      await agent.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          // advertised because `buildClient` implements all five terminal
          // methods — a false here would make a conforming child run its own
          // commands, which is the behaviour this host exists to avoid
          terminal: true,
          // no form host: `elicitation/create` is declined, so advertising it
          // would promise an interaction that never comes
          elicitation: { form: false, url: false },
        },
      });

      return await agent.buildSession(opts.cwd).withSession(async (session) => {
        if (opts.signal?.aborted) return { text: "", stopReason: "cancelled" as const, sessionId: session.sessionId };
        const onAbort = () => {
          void agent.notify(acp.methods.agent.session.cancel, { sessionId: session.sessionId }).catch(() => {});
        };
        opts.signal?.addEventListener("abort", onAbort, { once: true });

        let text = "";
        try {
          void session.prompt(opts.prompt).catch(() => {
            // The rejection is also delivered as the `stop` message read below;
            // swallowing it here only prevents an unhandled rejection.
          });
          for (;;) {
            // Race the next protocol message against the abort signal: a child
            // that ignores session/cancel would otherwise leave nextUpdate()
            // pending forever, the loop never reaches the finally, and the
            // process is never killed. On abort, break out so the outer finally
            // runs kill().
            const msg = await Promise.race([
              session.nextUpdate(),
              new Promise<never>((_, rej) => {
                if (opts.signal?.aborted) return rej(new Error("aborted"));
                opts.signal?.addEventListener("abort", () => rej(new Error("aborted")), { once: true });
              }),
            ]);
            if (msg.kind === "stop") return { text: text.trim(), stopReason: msg.stopReason, sessionId: session.sessionId };
            opts.onUpdate?.(msg.update);
            if (msg.update.sessionUpdate === "agent_message_chunk" && msg.update.content.type === "text") {
              text += msg.update.content.text;
            }
          }
        } finally {
          opts.signal?.removeEventListener("abort", onAbort);
        }
      });
    });
  } finally {
    // the child is gone, so anything it asked this host to run dies with it
    closeAllTerminals();
    kill();
  }
}

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
  /**
   * Reopen this existing session instead of starting a new one.
   *
   * Without it every call is a fresh child with an empty context, which is why
   * a subagent could never be asked a follow-up question. With it the child is
   * still a new process — only the transcript is restored, via `session/load`.
   */
  sessionId?: string;
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
function childStream(proc: Bun.Subprocess<"pipe", "pipe", "pipe">): acp.Stream {
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
export function buildClient(cwd: string, onSessionUpdate?: (n: acp.SessionNotification) => void): acp.ClientApp {
  const terminals = new TerminalHost(cwd);
  liveHosts.add(terminals);

  const app = acp
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
    .onNotification(acp.methods.client.session.update, async ({ params }) => {
      // Called for EVERY session update, including ones the SDK's own router
      // already delivered to an ActiveSession (it returns `Handled.no`, so
      // both see it). The caller filters by session id; a fresh session ignores
      // them all and reads its ActiveSession queue instead.
      onSessionUpdate?.(params);
    })
    .onNotification(acp.methods.client.elicitation.complete, async () => {
      // A completion notice for an elicitation we already declined — nothing to
      // do, and throwing here would break the child's stream for no reason.
    });

  return app;
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
    // PIPE, never "inherit". The child inheriting fd 2 writes PAST every one of
    // the TUI's guards: those patch `process.stderr.write`, `console.error` and
    // now `Bun.stderr.write` — all JS properties in THIS process — while an
    // inherited fd is the terminal itself. A child agent that logs a warning
    // then paints straight over the grid, and because the alt screen has no
    // scrollback the row-hash diff sees the scribble as already painted, so
    // the frame never repairs itself (the black input dock).
    //
    // The pipe still has to be DRAINED (a full pipe buffer blocks the child),
    // but nothing is kept: the child's own diagnostics are its own business.
    stderr: "pipe",
    env: agentEnv(opts.env),
  });

  // Drain stderr or the child blocks once the pipe buffer fills. The text is
  // discarded: a chatty agent must not turn a delegation into console spam.
  if (proc.stderr && typeof (proc.stderr as ReadableStream<Uint8Array>).getReader === "function") {
    void (async () => {
      try {
        const reader = (proc.stderr as ReadableStream<Uint8Array>).getReader();
        for (;;) {
          const { done } = await reader.read();
          if (done) break;
        }
      } catch {
        /* the child died mid-write; nothing to report */
      }
    })();
  }


  const kill = () => {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  };

  // A resumed session has no `ActiveSession` to read from: `session/load`
  // returns an empty response, and the SDK only routes `session/update` into
  // helpers created by `session/new`. Its router declines the notification
  // (`Handled.no`), so an ordinary `onNotification` handler still sees every
  // update — that is the queue a resumed turn reads from.
  const { app, queue } = clientForTurn(opts.cwd, opts.sessionId);

  try {
    return await app.connectWith(childStream(proc), (agent) => runAcpTurn(agent, opts, queue));
  } finally {
    // the child is gone, so anything it asked this host to run dies with it
    closeAllTerminals();
    kill();
  }
}

/** Updates waiting to be read by a resumed turn, fed by the client's notification hook. */
export interface ResumeQueue {
  /** An update the child sent for the resumed session. */
  push: (n: acp.SessionNotification) => void;
  /** Resolve with the next update, waiting for one if the queue is empty. */
  next: () => Promise<acp.ActiveSessionMessage>;
  /** End the turn: the `session/prompt` response, which is its `stop` message. */
  stop: (r: acp.PromptResponse) => void;
  /** Discard everything queued so far. */
  drain: () => void;
}

/**
 * The client app for one delegation, plus the queue its updates land in.
 *
 * Exported as a pair because the hook has to be registered when the app is
 * built — before `connectWith` — while the queue is read later inside the turn.
 * Tests use this to drive `runAcpTurn` against an in-process agent app, which is
 * the only way to exercise the resume path without a subprocess.
 */
export function clientForTurn(cwd: string, sessionId?: string): { app: acp.ClientApp; queue: ResumeQueue } {
  const pending: acp.ActiveSessionMessage[] = [];
  let wake: (() => void) | null = null;
  const enqueue = (m: acp.ActiveSessionMessage) => {
    pending.push(m);
    wake?.();
  };
  const queue: ResumeQueue = {
    push(n) {
      // a fresh turn reads its ActiveSession queue instead; the hook still sees
      // those updates (the SDK router cannot consume them) and must ignore them
      if (!sessionId || n.sessionId !== sessionId) return;
      enqueue({ kind: "session_update", notification: n, update: n.update });
    },
    async next() {
      while (!pending.length) {
        await new Promise<void>((r) => {
          wake = () => {
            wake = null;
            r();
          };
        });
      }
      return pending.shift()!;
    },
    stop(r) {
      enqueue({ kind: "stop", response: r, stopReason: r.stopReason });
    },
    drain() {
      pending.length = 0;
    },
  };
  return { app: buildClient(cwd, (n) => queue.push(n)), queue };
}

/**
 * Initialize the child and run one prompt turn, returning its final text.
 *
 * The child's own text is accumulated from `agent_message_chunk` updates; thought
 * chunks are excluded, since a delegating parent wants the report, not the
 * child's reasoning. `signal` maps to `session/cancel` and then to killing the
 * process, because an agent that ignores cancel must not outlive the turn.
 *
 * A fresh session and a resumed one differ only in how the next message is read:
 * `session/new` hands back an `ActiveSession` whose queue the SDK fills, while
 * `session/load` hands back nothing and the updates come from `queue` instead.
 */
export async function runAcpTurn(
  agent: acp.ClientContext,
  opts: Pick<RunAcpAgentOptions, "cwd" | "prompt" | "signal" | "onUpdate" | "sessionId">,
  queue: ResumeQueue,
): Promise<AcpAgentResult> {
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

  // Prompt one session id to completion, accumulating the child's text.
  const promptSession = async (
    sid: string,
    nextMsg: () => Promise<acp.ActiveSessionMessage>,
    send: (text: string) => Promise<unknown>,
  ): Promise<AcpAgentResult> => {
    if (opts.signal?.aborted) return { text: "", stopReason: "cancelled" as const, sessionId: sid };
    const onAbort = () => {
      void agent.notify(acp.methods.agent.session.cancel, { sessionId: sid }).catch(() => {});
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    let text = "";
    try {
      void send(opts.prompt).catch(() => {
        // The rejection is also delivered as the `stop` message read below;
        // swallowing it here only prevents an unhandled rejection.
      });
      for (;;) {
        // Race the next protocol message against the abort signal: a child
        // that ignores session/cancel would otherwise leave the read pending
        // forever, the loop never reaches the finally, and the process is
        // never killed. On abort, break out so the caller's finally runs kill().
        const msg = await Promise.race([
          nextMsg(),
          new Promise<never>((_, rej) => {
            if (opts.signal?.aborted) return rej(new Error("aborted"));
            opts.signal?.addEventListener("abort", () => rej(new Error("aborted")), { once: true });
          }),
        ]);
        if (msg.kind === "stop") return { text: text.trim(), stopReason: msg.stopReason, sessionId: sid };
        opts.onUpdate?.(msg.update);
        if (msg.update.sessionUpdate === "agent_message_chunk" && msg.update.content.type === "text") {
          text += msg.update.content.text;
        }
      }
    } finally {
      opts.signal?.removeEventListener("abort", onAbort);
    }
  };

  const resumeId = opts.sessionId;
  if (!resumeId) {
    return await agent.buildSession(opts.cwd).withSession((session) =>
      promptSession(session.sessionId, () => session.nextUpdate(), (t) => session.prompt(t)),
    );
  }

  // Resuming: the transcript comes back as a replay of `session/update`
  // notifications, so the queue has to exist BEFORE `session/load` is sent or
  // the history a follow-up depends on is dropped on the floor. The reloaded
  // turns are then discarded — they are the child's memory, not this turn's
  // output, and `onUpdate` is documented as the live turn only.
  // Resuming: the transcript comes back as a replay of `session/update`
  // notifications, so the queue has to exist BEFORE `session/load` is sent or
  // the history a follow-up depends on is dropped on the floor. The reloaded
  // turns are then discarded — they are the child's memory, not this turn's
  // output, and `onUpdate` is documented as the live turn only.
  await agent.request(acp.methods.agent.session.load, { sessionId: resumeId, cwd: opts.cwd, mcpServers: [] });
  queue.drain();
  return await promptSession(
    resumeId,
    queue.next,
    // The prompt RESPONSE is this turn's `stop` message. `ActiveSession.prompt`
    // does that conversion for a fresh session; a bare request does not, so
    // without this the read waits on a notification that never comes and the
    // delegation hangs until the turn is cancelled.
    async (t) => {
      const res = await agent.request(acp.methods.agent.session.prompt, {
        sessionId: resumeId,
        prompt: [{ type: "text" as const, text: t }],
      });
      queue.stop(res);
      return res;
    },
  );
}

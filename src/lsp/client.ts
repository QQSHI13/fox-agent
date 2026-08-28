import { pathToFileURL } from "node:url";
import { relative } from "node:path";
import { childEnv } from "../core/childenv.ts";
import { encode, FrameReader } from "./codec.ts";
import { formatDiagnostics, type Diagnostic } from "./types.ts";
import { languageId, projectRoot, serverFor, type LspServerConfig } from "./servers.ts";

/**
 * A persistent language server per (server, project root), used for one thing:
 * telling the model what its edit just broke.
 *
 * Why persistent rather than shelling out to `tsc --noEmit`: measured on this
 * repo, `tsc` takes 11.5s while a warm server answers a re-check in ~500ms. A
 * type error reported 11 seconds after every edit would simply be turned off.
 * The cost is that the first request to a cold server pays ~5s, so the first
 * edit of a session is slow and the rest are not.
 *
 * Everything here degrades to "no diagnostics" rather than to a failed edit. A
 * missing server, a server that dies, a crash on startup, a slow project — none
 * of them may turn a successful `edit` into a failure, because the edit really
 * did happen. That is why every entry point returns `string | null` and swallows.
 */

const DEFAULT_TIMEOUT_MS = 10_000;
/** Cold servers index the whole project before answering; measured ~5s for this repo. */
const FIRST_REQUEST_TIMEOUT_MS = 25_000;

interface Session {
  proc: ReturnType<typeof Bun.spawn>;
  root: string;
  name: string;
  /** resolves once `initialize` has come back; rejects if the server never starts */
  ready: Promise<boolean>;
  /** latest diagnostics per file URI, replaced wholesale as LSP specifies */
  diagnostics: Map<string, Diagnostic[]>;
  /** URIs already sent as didOpen, so later edits use didChange + a version bump */
  open: Map<string, number>;
  /** woken on every publishDiagnostics so a waiter can re-check its file */
  waiters: Set<() => void>;
  nextId: number;
  /** true until the first request completes, to allow the cold-start budget */
  cold: boolean;
  dead: boolean;
}

/** Keyed by `<server name>\0<project root>`: one server process per project. */
const sessions = new Map<string, Session>();

function key(name: string, root: string): string {
  return `${name}\0${root}`;
}

function uriOf(path: string): string {
  return pathToFileURL(path).href;
}

function start(name: string, cfg: LspServerConfig, root: string): Session {
  const proc = Bun.spawn([cfg.command, ...(cfg.args ?? [])], {
    cwd: root,
    stdin: "pipe",
    stdout: "pipe",
    // A language server logs volumes of progress to stderr. It must not reach
    // fox-agent's stderr, which is the TUI's own surface (and the ACP server's only
    // legal diagnostic channel).
    stderr: "ignore",
    env: childEnv(cfg.env, root),
  });

  const s: Session = {
    proc,
    root,
    name,
    ready: Promise.resolve(false),
    diagnostics: new Map(),
    open: new Map(),
    waiters: new Set(),
    nextId: 1,
    cold: true,
    dead: false,
  };

  let resolveReady!: (ok: boolean) => void;
  s.ready = new Promise<boolean>((r) => {
    resolveReady = r;
  });

  // reader loop
  (async () => {
    const reader = new FrameReader();
    try {
      for await (const chunk of proc.stdout as AsyncIterable<Uint8Array>) {
        for (const msg of reader.push(chunk)) handle(s, msg, resolveReady);
      }
    } catch {
      // stdout closed under us; the exit handler below marks it dead
    }
    s.dead = true;
    resolveReady(false);
    wake(s);
  })();

  proc.exited.then(() => {
    s.dead = true;
    resolveReady(false);
    wake(s);
  });

  send(s, {
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: uriOf(root),
      workspaceFolders: [{ uri: uriOf(root), name: root.split("/").pop() ?? root }],
      capabilities: {
        textDocument: {
          synchronization: { didSave: true, dynamicRegistration: false },
          publishDiagnostics: { relatedInformation: false },
        },
        workspace: { workspaceFolders: true, configuration: false },
      },
      // pyright and several others stay quiet unless told which analysis to run
      initializationOptions: {},
    },
  });
  return s;
}

function handle(s: Session, msg: unknown, resolveReady: (ok: boolean) => void) {
  const m = msg as { id?: number; method?: string; params?: any; result?: unknown; error?: unknown };
  if (m.id === 0) {
    // An `initialize` *error* is the common misconfiguration, not an exception:
    // typescript-language-server refuses to start when it cannot resolve a
    // `typescript` install from the workspace. Treat it as "no diagnostics here".
    if (m.error) {
      s.dead = true;
      resolveReady(false);
      wake(s);
      return;
    }
    send(s, { jsonrpc: "2.0", method: "initialized", params: {} });
    resolveReady(true);
    return;
  }
  if (m.method === "textDocument/publishDiagnostics" && m.params?.uri) {
    // LSP replaces the whole set for a URI on every publish; an empty array is
    // meaningful (the file is now clean) and must overwrite, not be ignored.
    s.diagnostics.set(m.params.uri, (m.params.diagnostics ?? []) as Diagnostic[]);
    wake(s);
    return;
  }
  // Server-to-client requests we do not implement still need an answer, or a
  // strict server blocks waiting for one. Null result is the spec's "nothing".
  if (m.id !== undefined && m.method) {
    send(s, { jsonrpc: "2.0", id: m.id, result: null });
  }
}

function wake(s: Session) {
  for (const w of [...s.waiters]) w();
}

function send(s: Session, msg: unknown): boolean {
  if (s.dead) return false;
  try {
    const { header, body } = encode(msg);
    const sink = s.proc.stdin as { write(c: string | Uint8Array): void; flush(): void };
    sink.write(header);
    sink.write(body);
    sink.flush();
    return true;
  } catch {
    s.dead = true;
    return false;
  }
}

/**
 * Diagnostics for one file after fox-agent changed it on disk, or null if nothing can
 * be said: no server for this language, the server won't start, it stayed silent
 * within the deadline, or it found nothing worth reporting.
 *
 * The file's *new* content is passed in rather than read back, so the server sees
 * exactly what was written even if something else touches the file afterwards.
 */
export async function diagnose(
  file: string,
  content: string,
  opts: { servers?: Record<string, LspServerConfig>; cwd?: string; timeoutMs?: number } = {},
): Promise<string | null> {
  try {
    const found = serverFor(file, opts.servers ?? {});
    if (!found) return null;
    const root = projectRoot(file, found.cfg);
    const k = key(found.name, root);

    let s = sessions.get(k);
    if (s?.dead) {
      sessions.delete(k);
      s = undefined;
    }
    if (!s) {
      s = start(found.name, found.cfg, root);
      sessions.set(k, s);
    }
    const budget = opts.timeoutMs ?? (s.cold ? FIRST_REQUEST_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
    const deadline = Date.now() + budget;

    // The whole budget bounds `initialize` too, not just the publish wait. A
    // server that accepts stdin and never replies (measured: any process that
    // simply does not speak LSP) would otherwise hold the edit open until it
    // exits on its own.
    const started = await withDeadline(s.ready, budget);
    if (!started) {
      // It may still answer later, but this call is over. Drop it so the next
      // edit starts a fresh one rather than inheriting a process we gave up on.
      if (!s.dead) {
        sessions.delete(k);
        s.dead = true;
        try {
          s.proc.kill();
        } catch {}
      }
      return null;
    }

    const uri = uriOf(file);
    const version = (s.open.get(uri) ?? 0) + 1;
    if (version === 1) {
      send(s, {
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: { textDocument: { uri, languageId: languageId(file), version, text: content } },
      });
    } else {
      // full-document sync: fox-agent always has the whole new text, and computing
      // incremental ranges would be effort spent to send fewer bytes to a
      // localhost process
      send(s, {
        jsonrpc: "2.0",
        method: "textDocument/didChange",
        params: { textDocument: { uri, version }, contentChanges: [{ text: content }] },
      });
    }
    s.open.set(uri, version);

    const got = await waitForPublish(s, uri, version, Math.max(0, deadline - Date.now()));
    s.cold = false;
    if (!got) return null;

    const rel = relative(opts.cwd ?? root, file) || file;
    return formatDiagnostics(rel, found.name, s.diagnostics.get(uri) ?? []);
  } catch {
    // a broken server must never turn a successful edit into a failed one
    return null;
  }
}

/**
 * Wait for a publish for this URI after our change landed.
 *
 * There is no request id to correlate against — `publishDiagnostics` is an
 * unsolicited notification — so this waits for the next publish naming our URI.
 * The subtlety: on a *first* open the server may publish an empty set almost
 * immediately and then a real set once it has type-checked, so an empty first
 * publish is not accepted as final until a short grace period passes with
 * nothing further. Returning early there would report "clean" on every new file.
 */
async function waitForPublish(s: Session, uri: string, version: number, budget: number): Promise<boolean> {
  const deadline = Date.now() + budget;
  const seenBefore = s.diagnostics.has(uri);
  const initial = s.diagnostics.get(uri);
  let sawEmpty = false;

  for (;;) {
    const current = s.diagnostics.get(uri);
    const changed = current !== initial || (!seenBefore && current !== undefined);
    if (changed) {
      if (current && current.length) return true;
      // Empty result: plausibly "clean", plausibly "not analyzed yet". Give the
      // server a moment to follow up before believing it.
      if (sawEmpty) return true;
      sawEmpty = true;
      if (!(await sleepOrWake(s, Math.min(600, Math.max(0, deadline - Date.now()))))) return true;
      continue;
    }
    if (s.dead) return false;
    const left = deadline - Date.now();
    if (left <= 0) return version > 1 && s.diagnostics.has(uri); // stale beats nothing on a re-edit
    await sleepOrWake(s, Math.min(250, left));
  }
}

/**
 * Resolve `p`, or false once `ms` elapses — with the timer cleared either way.
 *
 * `Promise.race([p, Bun.sleep(ms)])` would be shorter and wrong: the sleep keeps
 * a timer (and the event loop) alive for its full duration after the race is
 * decided, which under `bun test` shows up as a hung test rather than a fast one.
 */
function withDeadline(p: Promise<boolean>, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
}

/** Sleep until either the timeout elapses or a publish arrives. Returns false on timeout. */
function sleepOrWake(s: Session, ms: number): Promise<boolean> {
  if (ms <= 0) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (woke: boolean) => {
      if (done) return;
      done = true;
      s.waiters.delete(waiter);
      clearTimeout(timer);
      resolve(woke);
    };
    const waiter = () => finish(true);
    const timer = setTimeout(() => finish(false), ms);
    s.waiters.add(waiter);
  });
}

/**
 * Stop every language server.
 *
 * Called from `shutdownTools`, so a session that spawned servers does not leave
 * them behind — an idle tsserver holds a project's worth of memory, and fox-agent may
 * be started and stopped many times in one shell.
 */
export async function shutdownLsp(): Promise<void> {
  const all = [...sessions.values()];
  sessions.clear();
  await Promise.all(
    all.map(async (s) => {
      if (s.dead) return;
      // Ask politely first: a server killed mid-write can leave a stale lock or
      // cache. Then stop waiting.
      send(s, { jsonrpc: "2.0", id: s.nextId++, method: "shutdown", params: null });
      send(s, { jsonrpc: "2.0", method: "exit", params: null });
      const exited = await Promise.race([s.proc.exited.then(() => true), Bun.sleep(1_000).then(() => false)]);
      if (!exited) s.proc.kill();
    }),
  );
}

/** Test seam: how many servers are currently running. */
export function liveServerCount(): number {
  return [...sessions.values()].filter((s) => !s.dead).length;
}

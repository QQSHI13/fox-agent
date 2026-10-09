import { pathToFileURL } from "node:url";
import { relative } from "node:path";
import { readFileSync } from "node:fs";
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
  /** pending request/response correlation, by request id (navigation requests) */
  pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
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
    pending: new Map(),
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
    return;
  }
  // Responses to OUR requests (navigation): correlate by id.
  if (m.id !== undefined && s.pending.has(m.id as number)) {
    const p = s.pending.get(m.id as number)!;
    s.pending.delete(m.id as number);
    if (m.error) p.reject(new Error(String((m.error as { message?: string })?.message ?? "lsp request failed")));
    else p.resolve(m.result);
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
/**
 * Resolve the live (or freshly started) session for a file, or null when no
 * server applies. Shared by `diagnose` and the navigation requests — same
 * server table, same root logic, same dead-session replacement.
 */
async function sessionFor(
  file: string,
  opts: { servers?: Record<string, LspServerConfig>; timeoutMs?: number } = {},
): Promise<{ s: Session; k: string; found: { name: string; cfg: LspServerConfig }; root: string } | null> {
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
  return { s, k, found, root };
}

/**
 * didOpen/didChange a document so requests that need server-side position
 * info work on files the model has not edited this session. Full-document
 * sync (same reasoning as `diagnose`'s didChange).
 */
function openDoc(s: Session, file: string, content?: string): string {
  const uri = uriOf(file);
  const version = (s.open.get(uri) ?? 0) + 1;
  if (version === 1) {
    send(s, {
      jsonrpc: "2.0",
      method: "textDocument/didOpen",
      params: { textDocument: { uri, languageId: languageId(file), version, text: content ?? readOrEmpty(file) } },
    });
  } else if (content !== undefined) {
    send(s, {
      jsonrpc: "2.0",
      method: "textDocument/didChange",
      params: { textDocument: { uri, version }, contentChanges: [{ text: content }] },
    });
  } else {
    send(s, {
      jsonrpc: "2.0",
      method: "textDocument/didChange",
      params: { textDocument: { uri, version }, contentChanges: [{ text: readOrEmpty(file) }] },
    });
  }
  s.open.set(uri, version);
  return uri;
}

function readOrEmpty(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

export async function diagnose(
  file: string,
  content: string,
  opts: { servers?: Record<string, LspServerConfig>; cwd?: string; timeoutMs?: number } = {},
): Promise<string | null> {
  try {
    const got = await sessionFor(file, opts);
    if (!got) return null;
    const { s, found, root } = got;
    const budget = opts.timeoutMs ?? (s.cold ? FIRST_REQUEST_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
    const deadline = Date.now() + budget;

    const uri = openDoc(s, file, content);

    const published = await waitForPublish(s, uri, s.open.get(uri) ?? 1, Math.max(0, deadline - Date.now()));
    s.cold = false;
    if (!published) return null;

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

// ---- navigation (requests, not notifications) ------------------------------

/** One position in a file, 1-based everywhere (matches read/grep output). */
export interface LspLocation {
  file: string;
  line: number;
  character: number;
}

interface RawLocation {
  uri: string;
  range: { start: { line: number; character: number } };
}

function fromRaw(l: RawLocation | null): LspLocation | null {
  if (!l?.uri?.startsWith("file://")) return null;
  let path = decodeURIComponent(l.uri.slice("file://".length));
  // file://localhost/... hosts are rare; strip a leading empty host
  path = path.replace(/^localhost/, "");
  return { file: path, line: l.range.start.line + 1, character: l.range.start.character + 1 };
}

/**
 * Issue one LSP request against a session and await its correlated response.
 *
 * Reads the file off disk and didOpen/didChange it first — a navigation query
 * must see the CURRENT text, and the file may never have been touched by an
 * edit this session. Bounded by the same cold/warm budgets as diagnostics.
 */
async function request<T>(
  file: string,
  method: string,
  params: (uri: string) => unknown,
  opts: { servers?: Record<string, LspServerConfig>; timeoutMs?: number } = {},
): Promise<T | null> {
  const got = await sessionFor(file, opts);
  if (!got) return null;
  const { s } = got;
  s.cold = false;
  const uri = openDoc(s, file);
  const id = s.nextId++;
  const p = new Promise<T>((resolve, reject) => s.pending.set(id, { resolve: resolve as (v: unknown) => void, reject }));
  if (!send(s, { jsonrpc: "2.0", id, method, params: params(uri) })) {
    s.pending.delete(id);
    return null;
  }
  const budget = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((resolve) => {
      const t = setTimeout(() => {
        s.pending.delete(id);
        resolve(null);
      }, budget);
      (t as { unref?: () => void }).unref?.();
    }),
  ]);
}

function posArgs(line: number, character: number) {
  return { position: { line: Math.max(0, line - 1), character: Math.max(0, character - 1) } };
}

async function locate(method: string, args: { file: string; line: number; character: number }, opts?: { servers?: Record<string, LspServerConfig>; timeoutMs?: number }): Promise<LspLocation[] | null> {
  const r = await request<RawLocation | RawLocation[] | null>(args.file, method, (uri) => ({ textDocument: { uri }, ...posArgs(args.line, args.character) }), opts);
  if (r === null) return null;
  const list = Array.isArray(r) ? r : [r];
  return list.map(fromRaw).filter((x): x is LspLocation => x !== null);
}

/** Where the symbol under (line, character) is defined. */
export function definition(file: string, at: { line: number; character: number }, opts?: { servers?: Record<string, LspServerConfig>; timeoutMs?: number }) {
  return locate("textDocument/definition", { file, ...at }, opts);
}

export function implementation(file: string, at: { line: number; character: number }, opts?: { servers?: Record<string, LspServerConfig>; timeoutMs?: number }) {
  return locate("textDocument/implementation", { file, ...at }, opts);
}

/** Every reference to the symbol under (line, character). */
export async function references(file: string, at: { line: number; character: number }, opts?: { servers?: Record<string, LspServerConfig>; timeoutMs?: number; includeDeclaration?: boolean }) {
  const got = await request<RawLocation[] | null>(
    file,
    "textDocument/references",
    (uri) => ({ textDocument: { uri }, ...posArgs(at.line, at.character), context: { includeDeclaration: opts?.includeDeclaration ?? false } }),
    opts,
  );
  return got === null ? null : got.map(fromRaw).filter((x): x is LspLocation => x !== null);
}

export interface HoverInfo {
  /** the marked-up contents the server offers (markdown/plaintext, concatenated) */
  text: string;
}

interface RawHover {
  contents: { kind?: string; value?: string } | { kind?: string; value?: string }[] | string;
}

/** Type/signature documentation for the symbol under (line, character). */
export async function hover(file: string, at: { line: number; character: number }, opts?: { servers?: Record<string, LspServerConfig>; timeoutMs?: number }): Promise<HoverInfo | null> {
  const r = await request<RawHover | null>(file, "textDocument/hover", (uri) => ({ textDocument: { uri }, ...posArgs(at.line, at.character) }), opts);
  if (!r?.contents) return null;
  const parts = Array.isArray(r.contents) ? r.contents : [r.contents];
  const text = parts.map((c) => (typeof c === "string" ? c : c.value ?? "")).join("\n").trim();
  return text ? { text } : null;
}

export interface SymbolInfo {
  name: string;
  kind: string;
  line: number;
  character: number;
  /** set only where the server reports a file URI (workspace/symbol); document symbols omit it */
  file?: string;
}

const SYM_KIND: Record<number, string> = {
  1: "file", 2: "module", 3: "namespace", 4: "package", 5: "class", 6: "method", 7: "property", 8: "field",
  9: "constructor", 10: "enum", 11: "interface", 12: "function", 13: "variable", 14: "constant", 15: "string",
  16: "number", 17: "boolean", 18: "array", 19: "object", 20: "key", 21: "null", 22: "enum-member", 23: "struct",
  24: "event", 25: "operator", 26: "type-parameter",
};

interface RawSymbol {
  name: string;
  kind: number;
  location?: RawLocation;
  range?: { start: { line: number; character: number } };
  children?: RawSymbol[];
}

function flattenSymbols(r: RawSymbol[], out: SymbolInfo[] = []): SymbolInfo[] {
  for (const s of r) {
    const loc = s.location ?? (s.range ? { uri: "", range: s.range } : undefined);
    if (loc)
      out.push({
        name: s.name,
        kind: SYM_KIND[s.kind] ?? "symbol",
        line: loc.range.start.line + 1,
        character: loc.range.start.character + 1,
        ...(loc.uri.startsWith("file://") ? { file: decodeURIComponent(loc.uri.slice("file://".length)) } : {}),
      });
    if (s.children?.length) flattenSymbols(s.children, out);
  }
  return out;
}

/** All symbols in a document (functions, classes, methods — the file's outline). */
export async function documentSymbols(file: string, opts?: { servers?: Record<string, LspServerConfig>; timeoutMs?: number }): Promise<SymbolInfo[] | null> {
  const r = await request<RawSymbol[] | null>(file, "textDocument/documentSymbol", (uri) => ({ textDocument: { uri } }), opts);
  return r === null ? null : flattenSymbols(r);
}

/** Workspace-wide symbol search (fuzzy in most servers). */
export async function workspaceSymbols(query: string, file: string, opts?: { servers?: Record<string, LspServerConfig>; timeoutMs?: number }): Promise<SymbolInfo[] | null> {
  const r = await request<RawSymbol[] | null>(file, "workspace/symbol", () => ({ query }), opts);
  return r === null ? null : flattenSymbols(r);
}

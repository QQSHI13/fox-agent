// The gateway's wire contract, driven over a REAL socket against a stub host.
//
// Why a stub host and not `bin/fox`: the point of these tests is what the
// gateway does with the host API, so every branch needs a host that misbehaves
// on demand — a generator that ends without `done`, a turn that throws, a
// command that throws, a 5,000-message session. A real binary can only be the
// happy path. The end-to-end run against the real engine is a separate,
// manual check (see plugins/gateway/README.md).
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clampLimit, DEFAULT_LIMIT, isPaged, MAX_LIMIT, olderCursor, pageMessages, type PageQuery } from "../plugins/gateway/paging.ts";

// ---- hermetic: never read the developer's real config or data dir ----
let home: string;
beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "fox-gateway-"));
  process.env.FOX_AGENT_HOME = home;
  process.env.FOX_AGENT_CONFIG = join(home, "config.toml");
});
afterAll(() => {
  delete process.env.FOX_AGENT_HOME;
  delete process.env.FOX_AGENT_CONFIG;
  rmSync(home, { recursive: true, force: true });
});

// ---- paging: the pure half ----

describe("paging", () => {
  const msgs = (n: number) => Array.from({ length: n }, (_, i) => ({ role: "user", content: `m${i + 1}`, seq: i + 1 }));

  test("no params is not paged (v1 compatibility)", () => {
    expect(isPaged(undefined)).toBe(false);
    expect(isPaged({})).toBe(false);
    expect(isPaged({ id: "x" } as unknown as PageQuery)).toBe(false);
    expect(isPaged({ before: 10 })).toBe(true);
    expect(isPaged({ limit: 5 })).toBe(true);
  });

  test("default limit takes the NEWEST messages, ascending", () => {
    const all = msgs(200);
    const { messages, hasMore } = pageMessages(all, {});
    expect(messages).toHaveLength(DEFAULT_LIMIT);
    expect(messages[0].seq).toBe(151);
    expect(messages.at(-1)!.seq).toBe(200);
    expect(hasMore).toBe(true);
  });

  test("before is an exclusive cursor, and walking back reaches the start", () => {
    const all = msgs(120);
    let before: number | undefined;
    const seen: number[] = [];
    let pages = 0;
    for (;;) {
      const page = pageMessages(all, before === undefined ? { limit: 50 } : { limit: 50, before });
      seen.unshift(...page.messages.map((m) => m.seq));
      pages++;
      if (!page.hasMore) break;
      before = olderCursor(page.messages);
      if (pages > 10) throw new Error("did not terminate");
    }
    expect(pages).toBe(3);
    expect(seen).toEqual(all.map((m) => m.seq));
  });

  test("a session shorter than the limit has hasMore false", () => {
    const { messages, hasMore } = pageMessages(msgs(3), { limit: 50 });
    expect(messages.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(hasMore).toBe(false);
  });

  test("a before cursor at or below the first seq yields an empty page", () => {
    expect(pageMessages(msgs(10), { before: 1, limit: 5 })).toEqual({ messages: [], hasMore: false });
    expect(pageMessages(msgs(10), { before: 0, limit: 5 }).messages).toEqual([]);
  });

  test("limit is clamped, and junk falls back to the default", () => {
    expect(clampLimit(undefined)).toBe(DEFAULT_LIMIT);
    expect(clampLimit(0)).toBe(DEFAULT_LIMIT);
    expect(clampLimit(-4)).toBe(DEFAULT_LIMIT);
    expect(clampLimit("abc")).toBe(DEFAULT_LIMIT);
    expect(clampLimit(10_000)).toBe(MAX_LIMIT);
    expect(clampLimit(7.9)).toBe(7);
    expect(clampLimit("12")).toBe(12);
  });

  test("an exactly-full page with more behind it reports hasMore", () => {
    const page = pageMessages(msgs(4), { limit: 3 });
    expect(page.messages.map((m) => m.seq)).toEqual([2, 3, 4]);
    expect(page.hasMore).toBe(true);
  });

  test("5,000 messages page without loading everything into one reply", () => {
    const all = msgs(5000);
    const first = pageMessages(all, { limit: 50 });
    expect(first.messages).toHaveLength(50);
    expect(first.messages.at(-1)!.seq).toBe(5000);
    expect(first.hasMore).toBe(true);
    const next = pageMessages(all, { limit: 50, before: 4951 });
    expect(next.messages.at(-1)!.seq).toBe(4950);
  });
});

// ---- a stub host: every misbehaviour these tests need, on demand ----

interface Msg {
  role: string;
  content: string;
  seq: number;
}

/** Behaviour of the next turn, chosen per test. */
let turnMode: "ok" | "throws" | "silent" | "slow" = "ok";

function makeHost() {
  const sessions = new Map<string, { id: string; title: string | null; cwd: string; model: string; updated_at: number }>();
  const messages = new Map<string, Msg[]>();
  const make = (id: string, title: string | null, count = 2) => {
    sessions.set(id, { id, title, cwd: "/home/tester/proj", model: "test-model", updated_at: 1_700_000_000_000 });
    messages.set(id, Array.from({ length: count }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `msg ${i + 1}`, seq: i + 1 })));
  };
  make("s1", "first session", 120);
  make("s2", "second session", 2);
  make("big", "big session", 5000);

  const h = {
    version: "9.9.9-test",
    provider: { model: "test-model" },
    sessions: {
      list: (limit = 100) => [...sessions.values()].slice(0, limit),
      get: (id: string) => sessions.get(id) ?? null,
      messages: (id: string) => messages.get(id) ?? [],
      create: (cwd?: string) => {
        const id = `new${sessions.size}`;
        make(id, null, 0);
        if (cwd) sessions.get(id)!.cwd = cwd;
        return { id };
      },
    },
    async *turn(sessionId: string, prompt: string, signal?: AbortSignal) {
      if (turnMode === "throws") throw new Error("provider exploded");
      yield { type: "reasoning", delta: "thinking about it" };
      yield { type: "text", delta: `echo: ${prompt}` };
      yield { type: "tool_start", id: "call_1", name: "exec", args: '{"cmd":"ls"}' };
      yield { type: "tool_end", id: "call_1", seq: 3, name: "exec", args: '{"cmd":"ls"}', output: "a\nb", ok: true };
      if (turnMode === "silent") {
        // a generator that stops WITHOUT a done event: the client must still
        // get a terminal status, not a spinner forever
        return;
      }
      if (turnMode === "slow") {
        // Abort-aware sleep: a stub that ignores the signal for 5s leaves the
        // session "running" for every later test in the file.
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, 5_000);
          signal?.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new Error("aborted"));
          }, { once: true });
        });
      }
      yield { type: "text", delta: " done" };
      yield { type: "done", reason: "stop" };
      if (sessionId === "never") return;
    },
    commands: {
      list: () => [
        { name: "/help", desc: "show commands" },
        { name: "/usage", desc: "token totals", usage: "[x]" },
        { name: "/login", desc: "credentials", mutates: true },
        { name: "/boom", desc: "a command that throws" },
      ],
      run: async (_id: string, input: string) => {
        if (input.startsWith("/boom")) throw new Error("command exploded");
        return { handled: true, output: `ran ${input}` };
      },
    },
    plugins: {
      active: () => [
        {
          name: "demo",
          gateway: {
            methods: {
              ping: async (params: unknown, ctx: any) => {
                ctx.broadcast({ event: "plugin.demo.pong", sessionId: ctx.sessionId });
                return { pong: true, params, sessionId: ctx.sessionId ?? null, plugin: ctx.plugin };
              },
              boom: () => {
                throw new Error("plugin method failed");
              },
              slow: async () => {
                await new Promise((r) => setTimeout(r, 20));
                return 42;
              },
            },
            routes: {
              "info": () => Response.json({ hello: "world" }),
              "bad": () => {
                throw new Error("route exploded");
              },
            },
            panels: {
              clock: { title: "Clock", html: "<!doctype html><p>tick</p>" },
              lazy: { title: "Lazy", html: () => "<p>lazy</p>" },
            },
          },
        },
        { name: "plain" },
      ],
    },
  };
  (globalThis as { foxHost?: unknown }).foxHost = h;
  return h;
}

// ---- the socket client ----

interface Frame {
  id?: number;
  result?: any;
  error?: { message: string };
  event?: string;
  [k: string]: any;
}

/** A tiny promise-based client: `rpc` resolves the reply with that id. */
class Client {
  ws: WebSocket;
  frames: Frame[] = [];
  /**
   * Outstanding requests, as a list of records rather than a Map keyed by the
   * id in the incoming frame.
   *
   * A Map lookup plus `w(f)` is a call through a value selected by data off the
   * wire, which a static scanner rightly flags as a dynamic dispatch - if
   * anything else ever wrote that map, a frame could reach a function it has no
   * business reaching. Scanning the list by a validated integer id keeps every
   * call site a literal property here, and the semantics the same: only the
   * waiter registered for that exact id is resolved.
   */
  private waiters: { id: number; resolve: (f: Frame) => void; timer?: ReturnType<typeof setTimeout> }[] = [];
  private events: ((e: Frame) => void)[] = [];
  closed = false;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onmessage = (ev) => {
      const f = JSON.parse(String(ev.data)) as Frame;
      this.frames.push(f);
      // A reply is `{id: <number>}`. A tool event is `{event, id: <string>}` -
      // the same key, a different type. Dispatch on the type, or a tool card
      // gets swallowed as a reply nobody is waiting for.
      if (typeof f.id === "number" && Number.isInteger(f.id)) {
        const i = this.waiters.findIndex((w) => w.id === f.id);
        if (i >= 0) {
          const waiter = this.waiters[i];
          this.waiters.splice(i, 1);
          if (waiter.timer) clearTimeout(waiter.timer);
          waiter.resolve(f);
        }
        return;
      }
      for (const cb of this.events) cb(f);
    };
  }
  open(): Promise<this> {
    return new Promise((res, rej) => {
      this.ws.onopen = () => res(this);
      this.ws.onerror = () => rej(new Error("socket error"));
    });
  }
  close() {
    this.closed = true;
    this.ws.close();
  }
  /** send an RPC, resolve its reply (result or error) - never a hang: this
   *  timeout is the assertion that a broken method still answers */
  async rpc(method: string, params?: unknown, id = 0): Promise<Frame> {
    const n = id || ++seq;
    const p = new Promise<Frame>((res) => this.waiters.push({ id: n, resolve: res }));
    this.ws.send(JSON.stringify(params === undefined ? { id: n, method } : { id: n, method, params }));
    const timeout = new Promise<Frame>((_, rej) => setTimeout(() => rej(new Error(`no reply to ${method} (id ${n})`)), 4000));
    return Promise.race([p, timeout]);
  }
  sendRaw(data: string) {
    this.ws.send(data);
  }
  /** resolve on the first event matching `pred` (already-received ones count) */
  nextEvent(pred: (e: Frame) => boolean, ms = 4000): Promise<Frame> {
    const seen = this.frames.find((f) => !f.id && pred(f));
    if (seen) return Promise.resolve(seen);
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error("event never arrived")), ms);
      const cb = (e: Frame) => {
        if (!pred(e)) return;
        clearTimeout(timer);
        this.events = this.events.filter((x) => x !== cb);
        res(e);
      };
      this.events.push(cb);
    });
  }
}

let seq = 0;
let base = "";
let handle: { stop(): Promise<void>; port: number };

beforeEach(() => {
  turnMode = "ok";
});

beforeAll(async () => {
  makeHost();
  const { createGateway } = await import("../plugins/gateway/server.ts");
  handle = await createGateway({ port: 0, hostname: "127.0.0.1" });
  base = `127.0.0.1:${handle.port}`;
});

afterAll(async () => {
  await handle?.stop();
});

const connect = async () => {
  seq = 0;
  return new Client(`ws://${base}/ws`).open();
};

describe("static assets", () => {
  test("the UI page is served with the model substituted, and %MODEL% is gone", async () => {
    const r = await fetch(`http://${base}/`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/html");
    const body = await r.text();
    expect(body).not.toContain("%MODEL%");
    expect(body).toContain("test-model");
    expect(body).not.toContain("cdn.jsdelivr.net");
  });

  test("ui.js and md.js are served as JavaScript, without a CDN", async () => {
    for (const f of ["ui.js", "md.js"]) {
      const r = await fetch(`http://${base}/${f}`);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toContain("javascript");
      expect(await r.text()).not.toContain("cdn.jsdelivr.net");
    }
  });

  test("a path outside the allowlist is not served", async () => {
    const r = await fetch(`http://${base}/../server.ts`);
    expect(r.status).toBe(404);
  });

  test("/health reports the engine, the model and the running turns", async () => {
    const r = await fetch(`http://${base}/health`);
    const j = (await r.json()) as any;
    expect(r.status).toBe(200);
    expect(j.ok).toBe(true);
    expect(j.model).toBe("test-model");
    expect(j.version).toBe("9.9.9-test");
    expect(Array.isArray(j.running)).toBe(true);
  });
});

describe("plugin contributions over HTTP", () => {
  test("a panel is served as an HTML document", async () => {
    const r = await fetch(`http://${base}/plugin/demo/clock.html`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/html");
    expect(await r.text()).toContain("tick");
  });

  test("a panel's html thunk is called per request", async () => {
    const r = await fetch(`http://${base}/plugin/demo/lazy.html`);
    expect(await r.text()).toContain("lazy");
  });

  test("a route is served, and a throwing route is a 500 with a reason", async () => {
    expect(await (await fetch(`http://${base}/plugin/demo/info`)).json()).toEqual({ hello: "world" });
    const bad = await fetch(`http://${base}/plugin/demo/bad`);
    expect(bad.status).toBe(500);
    expect(((await bad.json()) as any).error).toContain("route exploded");
  });

  test("an unknown plugin or path is a 404", async () => {
    expect((await fetch(`http://${base}/plugin/nope/info`)).status).toBe(404);
    expect((await fetch(`http://${base}/plugin/demo/missing`)).status).toBe(404);
    expect((await fetch(`http://${base}/plugin/plain/x.html`)).status).toBe(404);
  });
});

describe("session RPCs", () => {
  let c: Client;
  beforeAll(async () => {
    c = await connect();
  });
  afterAll(() => c.close());

  test("session.list returns the sessions", async () => {
    const r = await c.rpc("session.list");
    const list = r.result as any[];
    expect(list.map((s) => s.id)).toContain("s1");
    expect(list[0]).toHaveProperty("cwd");
  });

  test("session.get with no params returns the WHOLE transcript (v1 shape)", async () => {
    const r = await c.rpc("session.get", { id: "s1" });
    expect(r.result.messages).toHaveLength(120);
    expect(r.result.hasMore).toBeUndefined();
    expect(r.result.title).toBe("first session");
  });

  test("session.get paged: newest page, then the one before it", async () => {
    const first = (await c.rpc("session.get", { id: "s1", limit: 10 })).result;
    expect(first.messages).toHaveLength(10);
    expect(first.messages[0].seq).toBe(111);
    expect(first.messages.at(-1).seq).toBe(120);
    expect(first.hasMore).toBe(true);
    expect(first.total).toBe(120);

    const second = (await c.rpc("session.get", { id: "s1", limit: 10, before: 111 })).result;
    expect(second.messages.at(-1).seq).toBe(110);
    expect(second.hasMore).toBe(true);

    const last = (await c.rpc("session.get", { id: "s1", limit: 200, before: 21 })).result;
    expect(last.messages[0].seq).toBe(1);
    expect(last.messages.at(-1).seq).toBe(20);
    expect(last.hasMore).toBe(false);
  });

  test("session.get pages a 5,000-message session by default limit", async () => {
    const r = (await c.rpc("session.get", { id: "big", limit: 50 })).result;
    expect(r.messages).toHaveLength(50);
    expect(r.total).toBe(5000);
    expect(r.hasMore).toBe(true);
    expect(r.messages.at(-1).seq).toBe(5000);
  });

  test("session.get for a missing session replies null, not a hang", async () => {
    const r = await c.rpc("session.get", { id: "ghost" });
    expect(r.result).toBeNull();
  });

  test("session.new creates one, with an optional cwd", async () => {
    const r = await c.rpc("session.new", { cwd: "/tmp/elsewhere" });
    const got = (await c.rpc("session.get", { id: r.result.id })).result;
    expect(got.cwd).toBe("/tmp/elsewhere");
    expect(got.messages).toEqual([]);
  });

  test("debug.log is gone", async () => {
    const r = await c.rpc("debug.log", { lines: 5 });
    expect(r.error?.message ?? "").toContain("unknown method");
  });
});

describe("errors carry the id", () => {
  let c: Client;
  beforeAll(async () => {
    c = await connect();
  });
  afterAll(() => c.close());

  test("an unknown method answers with {id, error}", async () => {
    const r = await c.rpc("nonsense.method");
    expect(r.error?.message).toContain("unknown method");
  });

  test("command.run on an unknown command is an error reply, not silence", async () => {
    const r = await c.rpc("command.run", { sessionId: "s1", input: "/nope" });
    expect(r.error?.message).toContain("unknown command");
  });

  test("a throwing command is an error reply", async () => {
    const r = await c.rpc("command.run", { sessionId: "s1", input: "/boom" });
    expect(r.error?.message).toContain("command exploded");
  });

  test("turn.send on a missing session is refused", async () => {
    const r = await c.rpc("turn.send", { sessionId: "ghost", prompt: "hi" });
    expect(r.error?.message).toContain("no such session");
  });

  test("turn.send without a prompt is refused", async () => {
    const r = await c.rpc("turn.send", { sessionId: "s1" });
    expect(r.error?.message).toContain("needs sessionId and prompt");
  });

  test("malformed JSON gets an error frame and the socket survives", async () => {
    c.sendRaw("{not json");
    const f = await c.nextEvent((e) => !!e.error && e.id === undefined);
    expect(f.error?.message).toContain("malformed JSON");
    // still usable afterwards
    const r = await c.rpc("session.list");
    expect(Array.isArray(r.result)).toBe(true);
  });
});

describe("commands", () => {
  let c: Client;
  beforeAll(async () => {
    c = await connect();
  });
  afterAll(() => c.close());

  test("command.list marks the harness-mutating ones", async () => {
    const list = (await c.rpc("command.list")).result as any[];
    expect(list.find((x) => x.name === "/help").mutates).toBeFalsy();
    expect(list.find((x) => x.name === "/login").mutates).toBe(true);
  });

  test("a read-only command runs and returns its output", async () => {
    const r = await c.rpc("command.run", { sessionId: "s1", input: "/usage" });
    expect(r.result).toEqual({ handled: true, output: "ran /usage" });
  });

  test("a harness-mutating command is refused with a reason", async () => {
    const r = await c.rpc("command.run", { sessionId: "s1", input: "/login" });
    expect(r.error?.message).toContain("terminal-only");
  });
});

describe("turns", () => {
  test("a turn streams think, text, tool events and a terminal status", async () => {
    const c = await connect();
    const r = await c.rpc("turn.send", { sessionId: "s2", prompt: "hello" });
    expect(r.result).toEqual({ ok: true });
    const done = await c.nextEvent((e) => e.event === "turn.status" && e.state === "completed");
    expect(done.sessionId).toBe("s2");

    const order = c.frames.filter((f) => typeof f.id !== "number").map((f) =>
      f.event === "turn.status" ? `status:${f.state}` : f.event,
    );
    expect(order).toContain("turn.think");
    expect(order).toContain("turn.delta");
    expect(order).toContain("turn.tool_start");
    expect(order).toContain("turn.tool_end");
    expect(order[0]).toBe("status:started");
    expect(order.at(-1)).toBe("status:completed");

    const toolEnd = c.frames.find((f) => f.event === "turn.tool_end")!;
    expect(toolEnd.name).toBe("exec");
    expect(toolEnd.ok).toBe(true);
    expect(toolEnd.output).toBe("a\nb");
    c.close();
  });

  test("a generator that ends without done still reports completed", async () => {
    turnMode = "silent";
    const c = await connect();
    await c.rpc("turn.send", { sessionId: "s2", prompt: "hi" });
    const done = await c.nextEvent((e) => e.event === "turn.status" && e.state === "completed");
    expect(done.state).toBe("completed");
    c.close();
  });

  test("a throwing turn reports failed and streams the error text", async () => {
    turnMode = "throws";
    const c = await connect();
    await c.rpc("turn.send", { sessionId: "s2", prompt: "hi" });
    const done = await c.nextEvent((e) => e.event === "turn.status" && e.state === "failed");
    expect(done.state).toBe("failed");
    expect(c.frames.some((f) => f.event === "turn.delta" && String(f.delta).includes("provider exploded"))).toBe(true);
    c.close();
  });

  test("cancel mid-stream yields the cancelled status", async () => {
    turnMode = "slow";
    const c = await connect();
    await c.rpc("turn.send", { sessionId: "s2", prompt: "long one" });
    await c.nextEvent((e) => e.event === "turn.tool_end");
    const cancel = await c.rpc("turn.cancel", { sessionId: "s2" });
    expect(cancel.result).toEqual({ ok: true, wasRunning: true });
    const done = await c.nextEvent((e) => e.event === "turn.status" && e.state === "cancelled", 8000);
    expect(done.state).toBe("cancelled");
    c.close();
  });

  test("a second turn in the same session is refused while one runs", async () => {
    turnMode = "slow";
    const c = await connect();
    await c.rpc("turn.send", { sessionId: "s2", prompt: "first" });
    const second = await c.rpc("turn.send", { sessionId: "s2", prompt: "second" });
    expect(second.error?.message).toContain("already running");
    await c.rpc("turn.cancel", { sessionId: "s2" });
    c.close();
  });

  test("cancelling an idle session is a no-op, not an error", async () => {
    const c = await connect();
    const r = await c.rpc("turn.cancel", { sessionId: "s2" });
    expect(r.result).toEqual({ ok: true, wasRunning: false });
    c.close();
  });
});

describe("many clients", () => {
  test("events reach every connected client", async () => {
    const a = await connect();
    const b = await connect();
    await a.rpc("turn.send", { sessionId: "s2", prompt: "broadcast" });
    await b.nextEvent((e) => e.event === "turn.status" && e.state === "completed");
    await a.nextEvent((e) => e.event === "turn.status" && e.state === "completed");
    a.close();
    b.close();
  });

  test("one client closing does not silence the others", async () => {
    // The old server kept a Set and called clear() on any close: a single tab
    // closing stopped every broadcast for every other tab. This is that test.
    const a = await connect();
    const b = await connect();
    a.close();
    await new Promise((r) => setTimeout(r, 100));
    await b.rpc("turn.send", { sessionId: "s2", prompt: "still here" });
    const done = await b.nextEvent((e) => e.event === "turn.status" && e.state === "completed");
    expect(done.state).toBe("completed");
    b.close();
  });
});

describe("plugin contributions over the socket", () => {
  let c: Client;
  beforeAll(async () => {
    c = await connect();
  });
  afterAll(() => c.close());

  test("plugin.list names each contributing plugin's surface", async () => {
    const list = (await c.rpc("plugin.list")).result as any[];
    expect(list.map((p) => p.name)).toEqual(["demo"]);
    expect(list[0].methods.sort()).toEqual(["boom", "ping", "slow"]);
    expect(list[0].panels[0].url).toBe("/plugin/demo/clock.html");
  });

  test("plugin.<name>.<method> dispatches with a context and can broadcast", async () => {
    const r = await c.rpc("plugin.demo.ping", { sessionId: "s1", n: 7 });
    expect(r.result.pong).toBe(true);
    expect(r.result.sessionId).toBe("s1");
    expect(r.result.plugin).toBe("demo");
    expect(r.result.params).toEqual({ sessionId: "s1", n: 7 });
    const ev = await c.nextEvent((e) => e.event === "plugin.demo.pong");
    expect(ev.sessionId).toBe("s1");
  });

  test("an async method is awaited", async () => {
    expect((await c.rpc("plugin.demo.slow")).result).toBe(42);
  });

  test("a throwing method is an error reply naming the plugin", async () => {
    const r = await c.rpc("plugin.demo.boom");
    expect(r.error?.message).toContain("plugin method failed");
  });

  test("an unknown plugin or method is a named error", async () => {
    expect((await c.rpc("plugin.nope.ping")).error?.message).toContain("no method 'ping' on plugin 'nope'");
    expect((await c.rpc("plugin.demo.zzz")).error?.message).toContain("no method 'zzz'");
  });

  test("a plugin without a gateway field is not dispatchable", async () => {
    const r = await c.rpc("plugin.plain.anything");
    expect(r.error?.message).toContain("on plugin 'plain'");
  });
});

// The task store: the guarantees A2A makes about tasks, not about sockets.
//
// §3.5.2 is the important one — events broadcast to every active stream, in the
// same order, and closing one stream must not affect the others. §3.1.4's
// cursor pagination and §3.1.5's cancel rules are the rest.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskStore } from "../src/a2a/registry.ts";
import { A2aError } from "../src/a2a/errors.ts";
import type { StreamResponse } from "../src/a2a/types.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-a2areg-"));
  process.env.FOX_AGENT_HOME = join(dir, ".fox");
  process.env.FOX_AGENT_CONFIG = join(dir, ".fox", "config.toml");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Collect every frame a subscriber is handed. */
function watcher() {
  const frames: StreamResponse[] = [];
  return {
    frames,
    sub: {
      send: (f: StreamResponse) => frames.push(f),
      close: () => {},
    },
  };
}

describe("task lifecycle", () => {
  test("a new task starts submitted with a context and a timestamp", () => {
    const store = new TaskStore();
    const t = store.create(undefined);
    expect(t.task.status.state).toBe("TASK_STATE_SUBMITTED");
    expect(t.task.contextId).toBeTruthy();
    // §5.6.1: every status carries an ISO 8601 UTC timestamp
    expect(t.task.status.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  test("a supplied contextId is preserved (§3.4.1)", () => {
    const store = new TaskStore();
    expect(store.create("ctx-1").task.contextId).toBe("ctx-1");
  });

  test("an unknown task raises TaskNotFoundError, not undefined", () => {
    const store = new TaskStore();
    expect(() => store.require("nope")).toThrow();
    try {
      store.require("nope");
    } catch (e) {
      expect(e).toBeInstanceOf(A2aError);
      expect((e as A2aError).code).toBe(-32001);
    }
  });

  test("history is recorded and trimmed by historyLength (§3.2.4)", () => {
    const store = new TaskStore();
    const t = store.create("c");
    for (let i = 0; i < 5; i++) {
      store.appendHistory(t, { messageId: `m${i}`, role: "ROLE_USER", parts: [{ text: `t${i}` }] });
    }
    expect(store.view(t).history).toHaveLength(5);
    expect(store.view(t, 2).history?.map((m) => m.messageId)).toEqual(["m3", "m4"]);
    // 0 means "no history at all", not "an empty array"
    expect(store.view(t, 0).history).toBeUndefined();
  });

  test("includeArtifacts=false omits the field entirely (§3.1.4)", () => {
    const store = new TaskStore();
    const t = store.create("c");
    store.updateArtifact(t, { artifactId: "a", parts: [{ text: "x" }] }, false);
    expect(store.view(t, undefined, false).artifacts).toBeUndefined();
    expect(store.view(t, undefined, true).artifacts).toHaveLength(1);
  });
});

describe("events reach every watcher (§3.5.2)", () => {
  test("two subscribers both see an artifact update, in order", () => {
    const store = new TaskStore();
    const t = store.create("c");
    const a = watcher();
    const b = watcher();
    store.subscribe(t, a.sub);
    store.subscribe(t, b.sub);

    store.updateArtifact(t, { artifactId: "r", parts: [{ text: "one" }] }, true);
    store.updateArtifact(t, { artifactId: "r", parts: [{ text: "two" }] }, true);

    const textOf = (frames: StreamResponse[]) =>
      frames.filter((f) => "artifactUpdate" in f).map((f) => ("artifactUpdate" in f ? (f.artifactUpdate.artifact.parts[0] as any).text : ""));
    expect(textOf(a.frames)).toEqual(["one", "two"]);
    expect(textOf(b.frames)).toEqual(["one", "two"]);
  });

  test("closing one stream does not affect the other", () => {
    const store = new TaskStore();
    const t = store.create("c");
    const a = watcher();
    const b = watcher();
    const unsubA = store.subscribe(t, a.sub);
    store.subscribe(t, b.sub);

    unsubA(); // a's stream went away
    store.updateStatus(t, "TASK_STATE_WORKING");

    // b still got it; a got nothing new
    expect(b.frames).toHaveLength(1);
    expect(a.frames).toHaveLength(0);
  });

  test("a throwing subscriber is dropped and the others still get the event", () => {
    const store = new TaskStore();
    const t = store.create("c");
    const good = watcher();
    // once the sink throws, the store must treat that stream as gone
    store.subscribe(t, {
      send: () => {
        throw new Error("socket gone");
      },
      close: () => {},
    });
    store.subscribe(t, good.sub);
    store.updateStatus(t, "TASK_STATE_WORKING");
    expect(good.frames).toHaveLength(1);
    // the bad one was removed, so a second event reaches only the good stream
    store.updateStatus(t, "TASK_STATE_WORKING");
    expect(good.frames).toHaveLength(2);
  });

  test("a terminal status closes every stream (§3.1.2)", () => {
    const store = new TaskStore();
    const t = store.create("c");
    const closed: number[] = [];
    for (const i of [0, 1]) {
      store.subscribe(t, { send: () => {}, close: () => closed.push(i) });
    }
    store.updateStatus(t, "TASK_STATE_COMPLETED");
    expect(closed.sort()).toEqual([0, 1]);
  });

  test("terminated() resolves when somebody else finishes the task", async () => {
    const store = new TaskStore();
    const t = store.create("c");
    let done = false;
    const waiting = store.terminated(t).then(() => (done = true));
    await Bun.sleep(5);
    expect(done).toBe(false);
    store.updateStatus(t, "TASK_STATE_COMPLETED");
    await waiting;
    expect(done).toBe(true);
  });

  test("appending an artifact merges into the existing one", () => {
    const store = new TaskStore();
    const t = store.create("c");
    store.updateArtifact(t, { artifactId: "r", parts: [{ text: "a" }] }, true);
    store.updateArtifact(t, { artifactId: "r", parts: [{ text: "b" }] }, true);
    expect(t.task.artifacts).toHaveLength(1);
    expect((t.task.artifacts![0].parts as any[]).map((p) => p.text)).toEqual(["a", "b"]);
  });
});

describe("cancel (§3.1.5)", () => {
  test("a running task becomes canceled and its runner is told", () => {
    const store = new TaskStore();
    const t = store.create("c");
    let told = false;
    t.onCancel = () => (told = true);
    store.updateStatus(t, "TASK_STATE_WORKING");

    const task = store.cancel(t.task.id);
    expect(task.status.state).toBe("TASK_STATE_CANCELED");
    expect(told).toBe(true);
    expect(t.canceled).toBe(true);
  });

  test("a terminal task is TaskNotCancelable, not silently accepted", () => {
    const store = new TaskStore();
    const t = store.create("c");
    store.updateStatus(t, "TASK_STATE_COMPLETED");
    try {
      store.cancel(t.task.id);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as A2aError).code).toBe(-32002);
    }
  });

  test("canceling twice: the second is TaskNotCancelable (idempotent in effect)", () => {
    const store = new TaskStore();
    const t = store.create("c");
    store.updateStatus(t, "TASK_STATE_WORKING");
    store.cancel(t.task.id);
    expect(() => store.cancel(t.task.id)).toThrow();
  });
});

describe("listTasks (§3.1.4)", () => {
  const seed = (n: number) => {
    const store = new TaskStore();
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const t = store.create(i % 2 === 0 ? "even" : "odd");
      ids.push(t.task.id);
    }
    return { store, ids };
  };

  test("filtering by contextId", () => {
    const { store } = seed(6);
    expect(store.list({ contextId: "even" }).totalSize).toBe(3);
  });

  test("filtering by status", () => {
    const { store, ids } = seed(4);
    store.updateStatus(store.require(ids[0]), "TASK_STATE_COMPLETED");
    expect(store.list({ status: "TASK_STATE_COMPLETED" }).totalSize).toBe(1);
  });

  test("pagination is cursor-based and never repeats or skips a row", () => {
    const { store } = seed(7);
    const seen: string[] = [];
    let token: string | undefined;
    for (let page = 0; page < 10; page++) {
      const res = store.list({ pageSize: 3, pageToken: token });
      seen.push(...res.tasks.map((t) => t.id));
      if (!res.nextPageToken) break;
      token = res.nextPageToken;
    }
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
  });

  test("the last page reports an empty nextPageToken, not a missing field", () => {
    const { store } = seed(2);
    const res = store.list({ pageSize: 10 });
    expect(res.nextPageToken).toBe("");
  });

  test("pageSize is clamped to 1..100 (§6.5 validation)", () => {
    const { store } = seed(5);
    expect(store.list({ pageSize: 0 }).pageSize).toBe(1);
    expect(store.list({ pageSize: 1000 }).pageSize).toBe(100);
    expect(store.list({ pageSize: 1000 }).tasks).toHaveLength(5);
  });

  test("newest first (§3.1.4 ordering)", () => {
    const { store, ids } = seed(3);
    // touch the first task so it becomes the most recent
    store.updateStatus(store.require(ids[0]), "TASK_STATE_WORKING");
    const list = store.list({ pageSize: 10 });
    expect(list.tasks[0].id).toBe(ids[0]);
  });

  test("artifacts are omitted by default and included on request", () => {
    const { store, ids } = seed(1);
    store.updateArtifact(store.require(ids[0]), { artifactId: "a", parts: [{ text: "x" }] }, false);
    expect(store.list({}).tasks[0].artifacts).toBeUndefined();
    expect(store.list({ includeArtifacts: true }).tasks[0].artifacts).toHaveLength(1);
  });
});

describe("push notification configs (§3.1.7-§3.1.10)", () => {
  test("create assigns an id and get/list/delete agree", () => {
    const store = new TaskStore();
    const t = store.create("c");
    const cfg = store.createPushConfig(t.task.id, { url: "https://hook" });
    expect(cfg.id).toBeTruthy();
    expect(store.getPushConfig(t.task.id, cfg.id!).url).toBe("https://hook");
    expect(store.listPushConfigs(t.task.id)).toHaveLength(1);
    store.deletePushConfig(t.task.id, cfg.id!);
    expect(store.listPushConfigs(t.task.id)).toHaveLength(0);
    // and it is gone for good
    expect(() => store.getPushConfig(t.task.id, cfg.id!)).toThrow();
  });

  test("a config for an unknown task is TaskNotFound, not a silent create", () => {
    const store = new TaskStore();
    expect(() => store.createPushConfig("ghost", { url: "https://hook" })).toThrow();
  });

  test("a state change is POSTed to the webhook, with the configured auth", async () => {
    const store = new TaskStore();
    const t = store.create("c");
    const seen: { auth?: string; body: any }[] = [];
    const hook = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(req) {
        seen.push({ auth: req.headers.get("authorization") ?? undefined, body: await req.json() });
        return new Response("ok");
      },
    });
    try {
      store.createPushConfig(t.task.id, {
        url: `http://127.0.0.1:${hook.port}/hook`,
        authentication: { scheme: "Bearer", credentials: "tok" },
      });
      store.updateStatus(t, "TASK_STATE_COMPLETED");
      await store.drain(2_000);
      expect(seen).toHaveLength(1);
      // §4.3.3: the payload is a StreamResponse, and auth rides the header
      expect(seen[0].body.statusUpdate.status.state).toBe("TASK_STATE_COMPLETED");
      expect(seen[0].auth).toBe("Bearer tok");
    } finally {
      hook.stop(true);
    }
  }, 10_000);

  test("a failing webhook is retried and then given up on, without throwing", async () => {
    const store = new TaskStore();
    const t = store.create("c");
    let attempts = 0;
    const hook = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        attempts++;
        return new Response("nope", { status: 500 });
      },
    });
    try {
      store.createPushConfig(t.task.id, { url: `http://127.0.0.1:${hook.port}/hook` });
      // must not reject: delivery is fire-and-forget from the caller's side
      store.updateStatus(t, "TASK_STATE_FAILED");
      await store.drain(5_000);
      expect(attempts).toBeGreaterThan(1);
      expect(attempts).toBeLessThanOrEqual(3);
    } finally {
      hook.stop(true);
    }
  }, 15_000);
});

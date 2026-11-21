import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-media-"));
  process.env.FOX_AGENT_HOME = dir;
  process.env.FOX_AGENT_CONFIG = join(dir, "config.toml");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.FOX_AGENT_HOME;
  delete process.env.FOX_AGENT_CONFIG;
});

const PNG = { mimeType: "image/png", data: "aGk=", filename: "a.png" };

describe("media offloading: store round-trip", () => {
  test("externalize writes the blob once and returns a ref-only part", async () => {
    const db = await import("../src/store/db.ts");
    const { externalizeMedia } = await import("../src/store/media.ts");
    const s = db.createSession("/w", "m1");

    const [stored] = externalizeMedia(s.id, [PNG]);
    expect(stored.data).toBeUndefined();
    expect(stored.ref).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.bytes).toBe(2); // "aGk=" is base64 for "hi"
    expect(stored.filename).toBe("a.png");

    // the bytes are in the session db, raw (not base64)
    const row = db.sessionDb(s.id).prepare("SELECT mime, bytes, data FROM media_blobs WHERE hash = ?").get(stored.ref!) as { mime: string; bytes: number; data: Uint8Array };
    expect(row.mime).toBe("image/png");
    expect(row.bytes).toBe(2);
    expect(Buffer.from(row.data).toString()).toBe("hi");
  });

  test("identical payloads dedupe to one blob", async () => {
    const db = await import("../src/store/db.ts");
    const { externalizeMedia } = await import("../src/store/media.ts");
    const s = db.createSession("/w", "m1");
    const a = externalizeMedia(s.id, [PNG]);
    const b = externalizeMedia(s.id, [{ ...PNG, filename: "copy.png" }]);
    expect(a[0]!.ref).toBe(b[0]!.ref);
    const n = db.sessionDb(s.id).prepare("SELECT COUNT(*) AS n FROM media_blobs").get() as { n: number };
    expect(n.n).toBe(1);
  });

  test("hydrate restores the base64; inline (pre-offload) parts pass through", async () => {
    const db = await import("../src/store/db.ts");
    const { externalizeMedia, hydrateMediaParts } = await import("../src/store/media.ts");
    const s = db.createSession("/w", "m1");
    const [stored] = externalizeMedia(s.id, [PNG]);
    const [hydrated] = hydrateMediaParts(s.id, [stored]);
    expect(hydrated.data).toBe("aGk=");
    expect(hydrated.ref).toBe(stored.ref);
    // an old-session inline part is untouched
    const [inline] = hydrateMediaParts(s.id, [PNG]);
    expect(inline).toBe(PNG); // same object: no copy, no rewrite
  });

  test("a missing blob degrades to empty bytes instead of throwing", async () => {
    const db = await import("../src/store/db.ts");
    const { hydrateMediaParts } = await import("../src/store/media.ts");
    const s = db.createSession("/w", "m1");
    const [p] = hydrateMediaParts(s.id, [{ mimeType: "image/png", ref: "deadbeef" }]);
    expect(p.data).toBe("");
  });
});

describe("media offloading: turn integration", () => {
  const toolScript: import("../src/providers/types.ts").StreamEvent[] = [
    { type: "tool_call", call: { id: "t1", name: "shot", arguments: "{}" } },
    { type: "done", reason: "tool_calls" },
  ];

  test("the stored row carries refs while the provider request is hydrated", async () => {
    const db = await import("../src/store/db.ts");
    const turn = await import("../src/loop/turn.ts");
    const s = db.createSession("/w", "m1");
    const registry: any = new Map([
      [
        "shot",
        {
          def: { name: "shot", description: "", parameters: { type: "object" } },
          run: async () => ({ ok: true, output: "shot taken", media: [PNG] }),
        },
      ],
    ]);
    const calls: any[] = [];
    const chat: any = async function* (_c: any, messages: any, _t: any) {
      calls.push(structuredClone(messages));
      const script = calls.length === 1 ? toolScript : [{ type: "text", delta: "ok" }, { type: "done", reason: "stop" }];
      for (const ev of script) yield ev;
    };
    for await (const _ of turn.runTurnCore(s.id, { baseUrl: "http://localhost:9", apiKey: "k", model: "test-model" }, "look", undefined, { chat, registryOverride: registry, quiet: true })) {
    }

    // the STORED row is ref-only: no base64 in the message table
    const row = db.allMessages(s.id).find((m) => m.role === "tool" && m.media);
    expect(row).toBeDefined();
    const stored = JSON.parse(row!.media!);
    expect(stored[0].ref).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0].data).toBeUndefined();

    // the PROVIDER request for the next step was hydrated
    const toolMsg = calls[1].find((m: any) => m.role === "tool");
    expect(toolMsg.media[0].data).toBe("aGk=");
    // and the blob is in the session db, not just the heap
    const n = db.sessionDb(s.id).prepare("SELECT COUNT(*) AS n FROM media_blobs").get() as { n: number };
    expect(n.n).toBe(1);
  });

  test("share pages hydrate refs back into inline data URIs", async () => {
    const db = await import("../src/store/db.ts");
    const { shareSession } = await import("../src/store/share.ts");
    const { externalizeMedia } = await import("../src/store/media.ts");
    const s = db.createSession("/w", "m1");
    const asst = db.appendMessage(s.id, { parent_id: null, role: "assistant", content: "", tokens: 1, tool_calls: JSON.stringify([{ id: "t1", name: "shot", arguments: "{}" }]) });
    db.appendMessage(s.id, {
      parent_id: asst.id,
      role: "tool",
      content: "shot taken",
      tokens: 4,
      tool_call_id: "t1",
      media: JSON.stringify(externalizeMedia(s.id, [PNG])),
    });
    const out = join(dir, "share.html");
    shareSession(s.id, out);
    const html = readFileSync(out, "utf8");
    expect(html).toContain("data:image/png;base64,aGk=");
  });
});

// Media input through `read`: images/audio/video attach as base64 parts when
// the active model accepts that kind of input, and refuse with a named reason
// when it does not. The report behind the old behavior was an image read
// failing with "vision input is not wired up yet" on a vision-capable model.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolContext } from "../src/tools/types.ts";
import type { ProviderConfig } from "../src/providers/types.ts";

let dir: string;
let base: ToolContext;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-media-"));
  process.env.FOX_AGENT_HOME = join(dir, ".fox");
  let pty: unknown;
  base = { sessionId: "s1", cwd: dir, readFiles: new Set<string>(), get pty() { return pty; }, set pty(v: unknown) { pty = v; } } as unknown as ToolContext;
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const withModel = (model?: string): ToolContext =>
  ({ ...base, providerCfg: model ? ({ model, baseUrl: "http://x", apiKey: "k" } as ProviderConfig) : undefined }) as ToolContext;

/** not a real PNG — read detects media by extension, never by content */
const writeBlob = (name: string) => {
  writeFileSync(join(dir, name), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x03]));
  return name;
};

describe("read: media files", () => {
  test("an image attaches as base64 when the model has vision", async () => {
    const { readRun } = await import("../src/tools/files.ts");
    const r = await readRun({ path: writeBlob("pic.png") }, withModel("gpt-4o"));
    expect(r.ok).toBe(true);
    expect(r.output).toContain("image/png");
    expect(r.media).toHaveLength(1);
    expect(r.media![0].mimeType).toBe("image/png");
    expect(Buffer.from(r.media![0].data, "base64")).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x03]));
  });

  test("an image is refused with a named reason when the model lacks vision", async () => {
    const { readRun } = await import("../src/tools/files.ts");
    const r = await readRun({ path: writeBlob("pic.png") }, withModel("kimi-k2"));
    expect(r.ok).toBe(false);
    expect(r.output).toContain("does not accept image input");
    expect(r.media).toBeUndefined();
  });

  test("no provider config means no media — the gate fails safe", async () => {
    const { readRun } = await import("../src/tools/files.ts");
    const r = await readRun({ path: writeBlob("pic.png") }, withModel(undefined));
    expect(r.ok).toBe(false);
    expect(r.output).toContain("does not accept image input");
  });

  test("audio attaches for gemini but not for a vision-only model", async () => {
    const { readRun } = await import("../src/tools/files.ts");
    writeBlob("clip.mp3");
    const yes = await readRun({ path: "clip.mp3" }, withModel("gemini-2.5-pro"));
    expect(yes.ok).toBe(true);
    expect(yes.media![0].mimeType).toBe("audio/mpeg");
    const no = await readRun({ path: "clip.mp3" }, withModel("gpt-4o"));
    expect(no.ok).toBe(false);
    expect(no.output).toContain("does not accept audio input");
  });

  test("video attaches for gemini", async () => {
    const { readRun } = await import("../src/tools/files.ts");
    const r = await readRun({ path: writeBlob("mov.mp4") }, withModel("gemini-2.0-flash"));
    expect(r.ok).toBe(true);
    expect(r.media![0].mimeType).toBe("video/mp4");
  });
});

describe("media through the pipeline", () => {
  test("media survives storage and renders onto the provider message", async () => {
    const { createSession, appendMessage } = await import("../src/store/db.ts");
    const { renderContext } = await import("../src/context/render.ts");
    const s = createSession(dir, "gpt-4o");
    const asst = appendMessage(s.id, {
      parent_id: null,
      role: "assistant",
      content: "",
      tool_calls: JSON.stringify([{ id: "c1", name: "read", arguments: '{"path":"pic.png"}' }]),
      tokens: 5,
    });
    const part = { mimeType: "image/png", data: "aGk=", filename: "pic.png" };
    appendMessage(s.id, {
      parent_id: asst.id,
      role: "tool",
      content: "pic.png: image/png, 0.0 KB — attached as image content below",
      tool_call_id: "c1",
      media: JSON.stringify([part]),
      tokens: 1505,
    });
    const msgs = renderContext(s.id, "sys");
    const toolMsg = msgs.find((m) => m.role === "tool")!;
    expect(toolMsg.media).toEqual([part]);
  });

  test("a tool message with media converts to content parts, not a bare string", async () => {
    const { toModelMessages } = await import("../src/providers/convert.ts");
    const msgs = toModelMessages([
      { role: "assistant", content: "", tool_calls: [{ id: "c1", name: "read", arguments: "{}" }] },
      {
        role: "tool",
        tool_call_id: "c1",
        content: "attached",
        media: [{ mimeType: "image/png", data: "aGk=", filename: "pic.png" }],
      },
    ]);
    const out = (msgs[1] as any).content[0].output;
    expect(out.type).toBe("content");
    expect(out.value[0]).toEqual({ type: "text", text: "attached" });
    expect(out.value[1]).toMatchObject({ type: "file", mediaType: "image/png", filename: "pic.png" });
    expect(out.value[1].data).toEqual({ type: "data", data: "aGk=" });
    // and the no-media path is unchanged
    const plain = toModelMessages([
      { role: "assistant", content: "", tool_calls: [{ id: "c2", name: "read", arguments: "{}" }] },
      { role: "tool", tool_call_id: "c2", content: "text only" },
    ]);
    expect((plain[1] as any).content[0].output).toEqual({ type: "text", value: "text only" });
  });

  test("a session db written before the media column exists is migrated on open", async () => {
    const { Database } = await import("bun:sqlite");
    const { ensureLayout, sessionDbPath } = await import("../src/core/paths.ts");
    ensureLayout();
    // hand-build the pre-media schema, the way an older fox-agent left it
    const old = new Database(sessionDbPath("oldsession"));
    old.exec(`CREATE TABLE messages (
      id TEXT PRIMARY KEY, seq INTEGER NOT NULL, session_id TEXT NOT NULL, parent_id TEXT,
      role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', tool_calls TEXT, tool_call_id TEXT,
      tokens INTEGER NOT NULL DEFAULT 0, error TEXT, created_at INTEGER NOT NULL
    )`);
    old.prepare("INSERT INTO messages VALUES ('m1', 1, 'oldsession', NULL, 'user', 'hi', NULL, NULL, 1, NULL, 0)").run();
    old.close();

    const { getMessage, appendMessage } = await import("../src/store/db.ts");
    expect(getMessage("oldsession", 1)?.content).toBe("hi"); // opens without throwing
    const m = appendMessage("oldsession", { parent_id: null, role: "tool", content: "x", media: JSON.stringify([{ mimeType: "image/png", data: "aGk=" }]), tokens: 1 });
    expect(getMessage("oldsession", m.seq)?.media).toContain("image/png");
  });
});

import { describe, expect, test } from "bun:test";
import { toModelMessages } from "../src/providers/convert.ts";
import type { ChatMessage, MediaPart } from "../src/providers/types.ts";

const PNG: MediaPart = { mimeType: "image/png", data: "iVBORw0KGgo=", filename: "shot.png" };
const MP3: MediaPart = { mimeType: "audio/mpeg", data: "SGVsbG8=", filename: "clip.mp3" };
const MP4: MediaPart = { mimeType: "video/mp4", data: "AAAA", filename: "vid.mp4" };

function toolMsg(media: MediaPart[]): ChatMessage {
  return {
    role: "tool",
    tool_call_id: "call_1",
    content: "shot taken",
    media,
  };
}

const withAssistant = (tool: ChatMessage): ChatMessage[] => [
  { role: "user", content: "look" },
  { role: "assistant", content: "", tool_calls: [{ id: "call_1", name: "read", arguments: "{}" }] },
  tool,
];

describe("media routing: user-fallback (openai-compatible / openai-responses)", () => {
  test("tool message carries PLAIN TEXT; media moves to a following user message with file parts", () => {
    const out = toModelMessages(withAssistant(toolMsg([PNG])), "user-fallback");
    expect(out).toHaveLength(4);
    const tool = out[2] as any;
    expect(tool.role).toBe("tool");
    // the tool-result output is plain text — NO base64 rides in it
    expect(tool.content[0].output).toEqual({ type: "text", value: "shot taken" });
    const user = out[3] as any;
    expect(user.role).toBe("user");
    expect(user.content[0].type).toBe("text");
    expect(user.content[0].text).toContain("shot.png");
    expect(user.content[0].text).toContain("image/png");
    expect(user.content[1]).toEqual({
      type: "file",
      data: { type: "data", data: PNG.data },
      mediaType: "image/png",
      filename: "shot.png",
    });
  });

  test("the tool-result output carries no base64 — the blob rides only in the user file part", () => {
    const out = toModelMessages(withAssistant(toolMsg([PNG])), "user-fallback");
    const tool = out[2] as any;
    // the exact bug: the tool message text contained the raw base64 blob
    expect(JSON.stringify(tool)).not.toContain("iVBORw0KGgo");
    // and the file part exists exactly once, in the user message
    const user = out[3] as any;
    expect(user.content[1].data.data).toBe("iVBORw0KGgo=");
  });

  test("audio and video route the same way", () => {
    const out = toModelMessages(withAssistant(toolMsg([MP3, MP4])), "user-fallback");
    const user = out[3] as any;
    expect(user.content[1].mediaType).toBe("audio/mpeg");
    expect(user.content[2].mediaType).toBe("video/mp4");
  });

  test("no media -> no synthetic user message", () => {
    const out = toModelMessages(withAssistant(toolMsg([])), "user-fallback");
    expect(out).toHaveLength(3);
  });
});

describe("media routing: native (anthropic / google)", () => {
  test("media stays in the tool-result content as file parts", () => {
    const out = toModelMessages(withAssistant(toolMsg([PNG])), "native");
    expect(out).toHaveLength(3);
    const tool = out[2] as any;
    expect(tool.role).toBe("tool");
    expect(tool.content[0].output.type).toBe("content");
    expect(tool.content[0].output.value[1]).toEqual({
      type: "file",
      data: { type: "data", data: PNG.data },
      mediaType: "image/png",
      filename: "shot.png",
    });
  });

  test("default routing is native (existing providers unchanged)", () => {
    const out = toModelMessages(withAssistant(toolMsg([PNG])));
    expect(out).toHaveLength(3);
    expect((out[2] as any).content[0].output.type).toBe("content");
  });

  test("no media -> identical to user-fallback (text-only tool result)", () => {
    const a = toModelMessages(withAssistant(toolMsg([])), "native");
    const b = toModelMessages(withAssistant(toolMsg([])), "user-fallback");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

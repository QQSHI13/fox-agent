import { describe, expect, test } from "bun:test";
import { toModelMessages } from "../src/providers/convert.ts";
import type { ChatMessage } from "../src/providers/types.ts";

describe("toModelMessages", () => {
  test("system and user pass through as-is", () => {
    const msgs: ChatMessage[] = [
      { role: "system", content: "you are a helper" },
      { role: "user", content: "hi" },
    ];
    const out = toModelMessages(msgs);
    expect(out).toEqual([
      { role: "system", content: "you are a helper" },
      { role: "user", content: "hi" },
    ]);
  });

  test("plain assistant becomes { role, content: string }", () => {
    const out = toModelMessages([{ role: "assistant", content: "hello" }]);
    expect(out).toEqual([{ role: "assistant", content: "hello" }]);
  });

  test("assistant with tool_calls becomes parts array", () => {
    const msgs: ChatMessage[] = [
      {
        role: "assistant",
        content: "let me check",
        tool_calls: [{ id: "tc1", name: "search", arguments: '{"q":"bun"}' }],
      },
    ];
    const out = toModelMessages(msgs);
    expect(out).toHaveLength(1);
    const asst = out[0] as { role: string; content: unknown[] };
    expect(asst.role).toBe("assistant");
    expect(asst.content).toContainEqual({ type: "text", text: "let me check" });
    expect(asst.content).toContainEqual({
      type: "tool-call",
      toolCallId: "tc1",
      toolName: "search",
      input: { q: "bun" },
    });
  });

  test("assistant with tool_calls and empty text omits text part", () => {
    const msgs: ChatMessage[] = [
      { role: "assistant", content: "", tool_calls: [{ id: "x", name: "t", arguments: "{}" }] },
    ];
    const parts = (toModelMessages(msgs)[0] as any).content as unknown[];
    expect(parts.every((p: any) => p.type !== "text")).toBe(true);
  });

  test("tool result maps tool_call_id and looks up name from preceding assistant", () => {
    const msgs: ChatMessage[] = [
      { role: "assistant", content: "", tool_calls: [{ id: "tc2", name: "echo", arguments: '{"say":"yo"}' }] },
      { role: "tool", content: "echo: yo", tool_call_id: "tc2" },
    ];
    const out = toModelMessages(msgs);
    const toolMsg = out[1] as any;
    expect(toolMsg.role).toBe("tool");
    expect(toolMsg.content[0]).toMatchObject({
      type: "tool-result",
      toolCallId: "tc2",
      toolName: "echo",
      output: { type: "text", value: "echo: yo" },
    });
  });

  test("tool result with unknown id still produces a result (falls back to 'unknown')", () => {
    const msgs: ChatMessage[] = [{ role: "tool", content: "x", tool_call_id: "orphan" }];
    const out = toModelMessages(msgs);
    expect((out[0] as any).content[0].toolName).toBe("unknown");
  });

  test("malformed tool_calls arguments fall back to {} not a throw", () => {
    const msgs: ChatMessage[] = [
      { role: "assistant", content: "", tool_calls: [{ id: "bad", name: "t", arguments: "{invalid" }] },
    ];
    const parts = (toModelMessages(msgs)[0] as any).content as any[];
    const call = parts.find((p: any) => p.type === "tool-call");
    expect(call.input).toEqual({});
  });
});

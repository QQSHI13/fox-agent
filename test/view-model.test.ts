/**
 * The shared transcript view model.
 *
 * This module is the seam that lets a front end be a renderer and nothing more:
 * `Item[]` in, pixels out. It used to live inside `app.ts`'s closure, and the
 * gateway grew its own copy of the same join — these tests pin the contract so a
 * third front end does not invent a third answer.
 */
import { describe, expect, test } from "bun:test";
import { callMaps, nodeToItems, type NodeViewOptions } from "../src/view/model.ts";
import type { MessageRow } from "../src/store/db.ts";

/** A stored row with only the fields the view reads. */
function row(over: Partial<MessageRow> & { role: MessageRow["role"]; seq: number }): MessageRow {
  return {
    id: `m${over.seq}`,
    session_id: "s",
    parent_id: null,
    content: "",
    tool_calls: null,
    tool_call_id: null,
    media: null,
    tokens: 0,
    error: null,
    created_at: 0,
    ...over,
  };
}

const opts = (expanded: number[] = []): NodeViewOptions => ({
  key: (seq, slot) => seq * 4 + slot,
  expanded: (seq) => expanded.includes(seq),
  keptChars: 1_000,
});

describe("nodeToItems", () => {
  test("a user row is one item carrying the prompt glyph", () => {
    const items = nodeToItems(row({ role: "user", seq: 1, content: "hi" }), callMaps([], String), opts());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "user", seq: 1, text: "❯ hi" });
  });

  test("an assistant row is markdown, and an empty body still renders", () => {
    const items = nodeToItems(row({ role: "assistant", seq: 2, content: "" }), callMaps([], String), opts());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "md", seq: 2, text: "" });
  });

  test("a tool row is TWO items — a head and its body — sharing one seq", () => {
    // The pair is why this returns an array: the head wears the [N] chip and the
    // body is `markerCont`, so a tool call does not appear to be two messages.
    const assistant = row({
      role: "assistant",
      seq: 2,
      tool_calls: JSON.stringify([{ id: "t1", name: "exec", arguments: '{"cmd":"ls"}' }]),
    });
    const cm = callMaps([assistant], (name, args) => `${name} ${args}`);
    const items = nodeToItems(row({ role: "tool", seq: 3, tool_call_id: "t1", content: "a b" }), cm, opts());

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: "toolhead", seq: 3 });
    expect(items[0].markerCont).toBeUndefined();
    expect(items[0].text).toContain("exec");
    expect(items[1]).toMatchObject({ kind: "toolbody", seq: 3, markerCont: true, toolResult: true, ref: 3 });
  });

  test("the head and body get distinct keys, or the line cache collapses them", () => {
    const assistant = row({
      role: "assistant",
      seq: 2,
      tool_calls: JSON.stringify([{ id: "t1", name: "exec", arguments: "{}" }]),
    });
    const cm = callMaps([assistant], String);
    const items = nodeToItems(row({ role: "tool", seq: 3, tool_call_id: "t1", content: "out" }), cm, opts());
    expect(items[0].k).not.toBe(items[1].k);
  });

  test("a failed tool call says so on the head", () => {
    const cm = callMaps([], String);
    const items = nodeToItems(row({ role: "tool", seq: 4, tool_call_id: "gone", content: "", error: "boom" }), cm, opts());
    expect(items[0].text).toContain("failed");
  });

  test("a tool row whose call is unknown still renders, labelled generically", () => {
    // A historical row can outlive its assistant row (a ctx delete op). Losing
    // the label must not lose the body.
    const items = nodeToItems(row({ role: "tool", seq: 5, tool_call_id: "missing", content: "out" }), callMaps([], String), opts());
    expect(items).toHaveLength(2);
    expect(items[1].text).toBe("out");
  });

  test("todo and ctx bodies are pinned open; other tool bodies follow the user", () => {
    const mk = (name: string) => {
      const a = row({ role: "assistant", seq: 2, tool_calls: JSON.stringify([{ id: "t1", name, arguments: "{}" }]) });
      return nodeToItems(row({ role: "tool", seq: 3, tool_call_id: "t1", content: "x" }), callMaps([a], String), opts());
    };
    expect(mk("todo")[1].expanded).toBe(true);
    expect(mk("ctx")[1].expanded).toBe(true);
    expect(mk("exec")[1].expanded).toBe(false);
  });

  test("a long tool body is capped for the live view but says how much it dropped", () => {
    const big = "z".repeat(50_000);
    const cm = callMaps([], String);
    const items = nodeToItems(row({ role: "tool", seq: 6, tool_call_id: "x", content: big }), cm, { ...opts(), keptChars: 100 });
    expect(items[1].text.length).toBeLessThan(big.length);
    expect(items[1].text).toContain("chars dropped");
    expect(items[1].truncated).toBe(true); // the model may have seen an excerpt
  });

  test("a model-truncated row is flagged even when the body is short", () => {
    // `replaceVersion` on the node means the harness replaced what the model
    // reads; without the flag a reply that ignored the middle looks like a
    // model failure rather than the display budget it was.
    const items = nodeToItems(row({ role: "tool", seq: 7, tool_call_id: "x", content: "short" }), callMaps([], String), opts(), false, true);
    expect(items[1].truncated).toBe(true);
  });

  test("hidden (reverted) rows are marked, not dropped — storage is append-only", () => {
    const items = nodeToItems(row({ role: "assistant", seq: 8, content: "gone" }), callMaps([], String), opts(), true);
    expect(items[0].hidden).toBe(true);
  });

  test("expansion is the caller's state, passed in rather than read from a closure", () => {
    const r = row({ role: "think", seq: 9, content: "hmm" });
    expect(nodeToItems(r, callMaps([], String), opts())[0].expanded).toBe(false);
    expect(nodeToItems(r, callMaps([], String), opts([9]))[0].expanded).toBe(true);
  });
});

describe("callMaps", () => {
  test("joins tool calls to their ids, keeping the raw arguments", () => {
    const a = row({
      role: "assistant",
      seq: 1,
      tool_calls: JSON.stringify([{ id: "t1", name: "read", arguments: '{"path":"x"}' }]),
    });
    const cm = callMaps([a], (name, args) => `${name}(${args})`);
    expect(cm.name.get("t1")).toBe("read");
    expect(cm.raw.get("t1")).toBe('{"path":"x"}');
    expect(cm.label.get("t1")).toBe('read({"path":"x"})');
  });

  test("a corrupt tool_calls payload costs its labels, not the session", () => {
    // One bad historical row must not make a whole session unrenderable.
    const bad = row({ role: "assistant", seq: 1, tool_calls: "{not json" });
    expect(() => callMaps([bad], String)).not.toThrow();
    expect(callMaps([bad], String).name.size).toBe(0);
  });

  test("a non-array payload is ignored rather than iterated", () => {
    const odd = row({ role: "assistant", seq: 1, tool_calls: '{"id":"t1"}' });
    expect(callMaps([odd], String).name.size).toBe(0);
  });

  test("calls without a string id or name are skipped", () => {
    const odd = row({ role: "assistant", seq: 1, tool_calls: JSON.stringify([{ id: 5, name: "x" }, { id: "ok" }]) });
    expect(callMaps([odd], String).name.size).toBe(0);
  });

  test("non-assistant rows are not scanned", () => {
    const t = row({ role: "tool", seq: 1, tool_calls: JSON.stringify([{ id: "t1", name: "x", arguments: "{}" }]) });
    expect(callMaps([t], String).name.size).toBe(0);
  });
});

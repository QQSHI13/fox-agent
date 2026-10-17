// diffTouchKeys: the diff-and-touch logic behind refresh()'s "re-render only
// what changed". Pure and exported (not trapped in startTui's closure) so it
// can be unit-tested directly. The whole point: prior nodes are append-only,
// so an unchanged node must keep its cached rows across a rebuild — only nodes
// whose render signature moved get touched.
import { describe, expect, test } from "bun:test";
import { diffTouchKeys } from "../src/tui/app.ts";

interface Fake {
  k: number;
  text: string;
  expanded?: boolean;
}

const key = (t: Fake) => t.k;
const sig = (t: Fake) => `${t.text}|${t.expanded ? 1 : 0}`;

describe("diffTouchKeys", () => {
  test("a fresh build touches every node (no sigs yet)", () => {
    const sigs = new Map<number, string>();
    const items = [
      { k: 1, text: "a" },
      { k: 2, text: "b" },
      { k: 3, text: "c" },
    ];
    expect(diffTouchKeys([], items, key, sig, sigs)).toEqual([1, 2, 3]);
  });

  test("an unchanged rebuild touches nothing — prior nodes keep their cache", () => {
    const sigs = new Map<number, string>();
    const items = [
      { k: 1, text: "a" },
      { k: 2, text: "b" },
    ];
    diffTouchKeys([], items, key, sig, sigs); // first build
    // identical rebuild: same keys, same content -> nothing changed
    expect(diffTouchKeys(items, items, key, sig, sigs)).toEqual([]);
  });

  test("a node whose text changed is touched; the rest are not", () => {
    const sigs = new Map<number, string>();
    const before = [
      { k: 1, text: "a" },
      { k: 2, text: "b" },
      { k: 3, text: "c" },
    ];
    diffTouchKeys([], before, key, sig, sigs);
    const after = [
      { k: 1, text: "a" },
      { k: 2, text: "b CHANGED" },
      { k: 3, text: "c" },
    ];
    expect(diffTouchKeys(before, after, key, sig, sigs)).toEqual([2]);
    // and a further identical rebuild is quiet again
    expect(diffTouchKeys(after, after, key, sig, sigs)).toEqual([]);
  });

  test("an expand/collapse flip touches that node (policy input is in the sig)", () => {
    const sigs = new Map<number, string>();
    const collapsed = [{ k: 5, text: "tool output", expanded: false }];
    diffTouchKeys([], collapsed, key, sig, sigs);
    const expanded = [{ k: 5, text: "tool output", expanded: true }];
    expect(diffTouchKeys(collapsed, expanded, key, sig, sigs)).toEqual([5]);
  });

  test("appending a new node touches only the new tail, not the history", () => {
    const sigs = new Map<number, string>();
    const v1 = [
      { k: 1, text: "a" },
      { k: 2, text: "b" },
    ];
    diffTouchKeys([], v1, key, sig, sigs);
    const v2 = [
      { k: 1, text: "a" },
      { k: 2, text: "b" },
      { k: 3, text: "c" }, // new tail appended (a fresh message)
    ];
    expect(diffTouchKeys(v1, v2, key, sig, sigs)).toEqual([3]);
  });

  test("a vanished node (ctx hid it) drops its sig so a reuse of the key is not stale", () => {
    const sigs = new Map<number, string>();
    const before = [
      { k: 1, text: "a" },
      { k: 2, text: "b" },
    ];
    diffTouchKeys([], before, key, sig, sigs);
    expect(sigs.has(2)).toBe(true);
    // node 2 vanished (hidden)
    const after = [{ k: 1, text: "a" }];
    expect(diffTouchKeys(before, after, key, sig, sigs)).toEqual([]);
    expect(sigs.has(2)).toBe(false); // its sig was dropped
    // a NEW node later lands on key 2 (seq reuse after renumber, say) — it must
    // be treated as new, not reuse the stale sig
    const reused = [
      { k: 1, text: "a" },
      { k: 2, text: "something entirely different" },
    ];
    expect(diffTouchKeys(after, reused, key, sig, sigs)).toEqual([2]);
  });

  test("changing a node's kind (not just text) touches it", () => {
    const sigs = new Map<number, string>();
    // kind is part of the real itemSig; emulate by folding it into text here
    const kindSig = (t: Fake & { kind?: string }) => `${t.kind ?? ""}|${t.text}`;
    const before = [{ k: 1, text: "x", kind: "md" }];
    diffTouchKeys([], before, key, kindSig, sigs);
    const after = [{ k: 1, text: "x", kind: "error" }]; // same text, different kind
    expect(diffTouchKeys(before, after, key, kindSig, sigs)).toEqual([1]);
  });
});

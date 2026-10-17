// Tests for recent work that's pure and exported — the helpers the bug-fix
// batch introduced, pinned so they don't regress.
import { describe, expect, test } from "bun:test";

describe("keepTail", () => {
  test("text under the cap passes through unchanged", async () => {
    const { keepTail } = await import("../src/tui/app.ts");
    expect(keepTail("short", 100)).toBe("short");
  });

  test("over-cap text keeps the TAIL and notes the dropped head", async () => {
    const { keepTail } = await import("../src/tui/app.ts");
    const text = "A".repeat(10) + "B".repeat(90); // 100 chars
    const out = keepTail(text, 40);
    expect(out.endsWith("B".repeat(40))).toBe(true);
    expect(out).toContain("60 chars dropped");
    expect(out.includes("A".repeat(10))).toBe(false); // the head is gone, not kept
  });

  test("exactly at the cap is unchanged (no spurious note)", async () => {
    const { keepTail } = await import("../src/tui/app.ts");
    const text = "x".repeat(50);
    expect(keepTail(text, 50)).toBe(text);
  });
});

describe("nodeRendersToNothing", () => {
  const node = (role: string, content: string, toolCalls?: string, deleted = false) =>
    ({ msg: { role, content, tool_calls: toolCalls }, content, deleted }) as any;

  test("a deleted node renders to nothing", async () => {
    const { nodeRendersToNothing } = await import("../src/context/budget.ts");
    expect(nodeRendersToNothing(node("user", "hi", undefined, true), new Set())).toBe(true);
  });

  test("an assistant with empty content and no visible calls renders to nothing", async () => {
    const { nodeRendersToNothing } = await import("../src/context/budget.ts");
    expect(nodeRendersToNothing(node("assistant", ""), new Set())).toBe(true);
  });

  test("an assistant with text renders even with no calls", async () => {
    const { nodeRendersToNothing } = await import("../src/context/budget.ts");
    expect(nodeRendersToNothing(node("assistant", "hello"), new Set())).toBe(false);
  });

  test("an assistant whose calls are all hidden renders to nothing; visible calls render", async () => {
    const { nodeRendersToNothing } = await import("../src/context/budget.ts");
    const tc = JSON.stringify([{ id: "c1", name: "exec", arguments: "{}" }]);
    // c1 not in visibleToolIds -> hidden -> renders to nothing
    expect(nodeRendersToNothing(node("assistant", "", tc), new Set())).toBe(true);
    // c1 visible -> renders
    expect(nodeRendersToNothing(node("assistant", "", tc), new Set(["c1"]))).toBe(false);
  });

  test("non-assistant roles render regardless", async () => {
    const { nodeRendersToNothing } = await import("../src/context/budget.ts");
    expect(nodeRendersToNothing(node("user", ""), new Set())).toBe(false);
    expect(nodeRendersToNothing(node("tool", "output"), new Set())).toBe(false);
  });
});

describe("registerPluginProviders", () => {
  test("collects and registers plugin providers (one shared rule)", async () => {
    const { registerPluginProviders } = await import("../src/tools/index.ts");
    const { availableProviders } = await import("../src/providers/index.ts");
    const fake = async function* (): AsyncGenerator<any> {
      yield { type: "done", reason: "stop" };
    };
    registerPluginProviders([
      { name: "testprov-a", providers: { "test-prov-alpha": fake as any } },
      { name: "testprov-b", providers: { "test-prov-beta": fake as any, notAFunction: 42 as any } },
    ]);
    const avail = availableProviders();
    expect(avail).toContain("test-prov-alpha");
    expect(avail).toContain("test-prov-beta");
    expect(avail.some((n) => n === "notAFunction")).toBe(false); // non-function skipped
  });

  test("re-registering replaces the set (a removed plugin's provider is gone)", async () => {
    const { registerPluginProviders } = await import("../src/tools/index.ts");
    const { availableProviders } = await import("../src/providers/index.ts");
    const fake = async function* (): AsyncGenerator<any> {
      yield { type: "done", reason: "stop" };
    };
    registerPluginProviders([{ name: "p1", providers: { "test-prov-gone": fake as any } }]);
    expect(availableProviders()).toContain("test-prov-gone");
    registerPluginProviders([]);
    expect(availableProviders()).not.toContain("test-prov-gone");
  });
});

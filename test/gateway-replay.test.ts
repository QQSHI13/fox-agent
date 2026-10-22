// Replaying a stored transcript into render items (plugins/gateway/replay.js).
//
// The interesting part is not "render a message" but the PAIRING: a stored
// `tool` row carries its output and a `tool_call_id`, while the tool's NAME and
// ARGUMENTS live on the assistant row's `tool_calls`. Getting that lookup wrong
// is why the old UI could only label every replayed card "tool".
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dir, "..", "plugins", "gateway", "replay.js"), "utf8");
const sandbox: {
  FoxReplay?: {
    pair(m: unknown[]): { kind: string; role?: string; content?: string; name?: string; args?: string; output?: string; seq?: number; ok?: unknown }[];
    parseCalls(raw: unknown): { name: string; arguments?: unknown; id?: string }[] | null;
    argText(raw: unknown): string;
  };
} = {};
new Function("globalThis", src)(sandbox);
const R = sandbox.FoxReplay!;

const calls = (list: { id: string; name: string; arguments: string }[]) => JSON.stringify(list);

describe("pair", () => {
  test("a tool row takes its name and args from the assistant row above it", () => {
    const items = R.pair([
      { role: "user", content: "list files", seq: 1 },
      { role: "assistant", content: "", seq: 2, tool_calls: calls([{ id: "c1", name: "exec", arguments: '{"cmd":"ls"}' }]) },
      { role: "tool", content: "a.txt\nb.txt", seq: 3, tool_call_id: "c1" },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["message", "message", "tool"]);
    const card = items[2];
    expect(card.name).toBe("exec");
    expect(card.args).toBe('{"cmd":"ls"}');
    expect(card.output).toBe("a.txt\nb.txt");
  });

  test("several calls in one step each pair with their own result", () => {
    const items = R.pair([
      {
        role: "assistant",
        content: "",
        seq: 2,
        tool_calls: calls([
          { id: "c1", name: "read", arguments: '{"path":"a.ts"}' },
          { id: "c2", name: "grep", arguments: '{"pattern":"x"}' },
        ]),
      },
      { role: "tool", content: "file a", seq: 3, tool_call_id: "c1" },
      { role: "tool", content: "3 matches", seq: 4, tool_call_id: "c2" },
    ]);
    const tools = items.filter((i) => i.kind === "tool");
    expect(tools.map((i) => i.name)).toEqual(["read", "grep"]);
    expect(tools.map((i) => i.output)).toEqual(["file a", "3 matches"]);
  });

  test("a result whose call is not in the transcript degrades to 'tool', never a wrong name", () => {
    const items = R.pair([{ role: "tool", content: "orphan output", seq: 9, tool_call_id: "gone" }]);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("tool");
    expect(items[0].args).toBe("");
    expect(items[0].output).toBe("orphan output");
  });

  test("a tool row with no tool_call_id at all still renders", () => {
    const items = R.pair([{ role: "tool", content: "x", seq: 1, tool_call_id: null }]);
    expect(items[0].kind).toBe("tool");
    expect(items[0].name).toBe("tool");
  });

  test("history does not invent an ok/fail state", () => {
    // The store keeps the failure flag in a column this projection does not
    // carry, so a replayed card must report "unknown" rather than "passed".
    const items = R.pair([
      { role: "assistant", content: "", seq: 1, tool_calls: calls([{ id: "c1", name: "exec", arguments: "{}" }]) },
      { role: "tool", content: "boom", seq: 2, tool_call_id: "c1" },
    ]);
    expect(items[1].ok).toBeUndefined();
  });

  test("user, assistant, think and system keep their order and role", () => {
    const items = R.pair([
      { role: "user", content: "hi", seq: 1 },
      { role: "think", content: "hmm", seq: 2 },
      { role: "assistant", content: "hello", seq: 3 },
      { role: "system", content: "compacted", seq: 4 },
    ]);
    expect(items.map((i) => i.role)).toEqual(["user", "think", "assistant", "system"]);
    expect(items.map((i) => i.content)).toEqual(["hi", "hmm", "hello", "compacted"]);
  });

  test("an assistant row with only tool calls yields an empty message item", () => {
    // pair() reports it; the UI's renderer is what drops it, so a caller that
    // wants every stored row (a diff, an export) still sees it.
    const items = R.pair([
      { role: "assistant", content: "", seq: 1, tool_calls: calls([{ id: "c1", name: "exec", arguments: "{}" }]) },
      { role: "tool", content: "ok", seq: 2, tool_call_id: "c1" },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["message", "tool"]);
    expect(items[0].content).toBe("");
    expect(items[1].name).toBe("exec");
  });

  test("a call id is matched as a string even when the store holds numbers", () => {
    const items = R.pair([
      { role: "assistant", content: "", seq: 1, tool_calls: calls([{ id: "7", name: "exec", arguments: "{}" }] as never) },
      { role: "tool", content: "x", seq: 2, tool_call_id: "7" },
    ]);
    expect(items[1].name).toBe("exec");
  });

  test("empty and malformed input never throws", () => {
    expect(R.pair([])).toEqual([]);
    expect(R.pair(null as unknown as unknown[])).toEqual([]);
    const items = R.pair([
      { role: "assistant", content: "text", seq: 1, tool_calls: "{not json" },
      { role: "tool", content: "out", seq: 2, tool_call_id: "c1" },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].content).toBe("text");
    expect(items[1].name).toBe("tool");
  });

  test("one corrupt row costs that card its name, not the transcript", () => {
    const items = R.pair([
      { role: "assistant", content: "before", seq: 1 },
      { role: "assistant", content: "", seq: 2, tool_calls: "[1,2,3]" },
      { role: "tool", content: "out", seq: 3, tool_call_id: "c1" },
      { role: "assistant", content: "after", seq: 4 },
    ]);
    expect(items.filter((i) => i.kind === "message").map((i) => i.content)).toEqual(["before", "", "after"]);
    expect(items.filter((i) => i.kind === "tool")[0].name).toBe("tool");
  });
});

describe("parseCalls", () => {
  test("accepts a JSON string and an already-parsed array", () => {
    expect(R.parseCalls('[{"id":"c1","name":"exec","arguments":"{}"}]')).toHaveLength(1);
    expect(R.parseCalls([{ id: "c1", name: "exec" }])).toHaveLength(1);
  });

  test("rejects anything that is not a call list", () => {
    for (const bad of [null, undefined, "", "null", "{}", '{"a":1}', "42"]) {
      expect(R.parseCalls(bad)).toBeNull();
    }
    // An array whose entries are not calls is a valid-but-empty list, not an
    // error: those rows are simply unpaired, which is what corruption looks
    // like from here and must not cost the transcript its other cards.
    expect(R.parseCalls("[1,2]")).toEqual([]);
    expect(R.parseCalls('[{"id":"a"},null]')).toEqual([]);
  });

  test("drops entries without a usable name but keeps the rest", () => {
    const got = R.parseCalls('[{"id":"a"},{"id":"b","name":"ok"},null]');
    expect(got).toHaveLength(1);
    expect(got![0].name).toBe("ok");
  });
});

describe("argText", () => {
  test("a JSON object renders compactly", () => {
    expect(R.argText('{"cmd":"ls","cwd":"/tmp"}')).toBe('{"cmd":"ls","cwd":"/tmp"}');
  });

  test("a JSON string is unwrapped, not shown quoted", () => {
    expect(R.argText('"just a string"')).toBe("just a string");
  });

  test("a non-JSON string passes through", () => {
    expect(R.argText("plain text")).toBe("plain text");
  });

  test("empty input is empty, not the string 'undefined'", () => {
    for (const v of [undefined, null, "", "   "]) expect(R.argText(v)).toBe("");
  });

  test("a circular object does not throw", () => {
    const o: Record<string, unknown> = {};
    o.self = o;
    expect(() => R.argText(o)).not.toThrow();
  });
});

describe("the file itself", () => {
  test("is a classic script with no CDN and no module syntax", () => {
    expect(src).not.toContain("cdn.");
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).toContain("FoxReplay = {");
  });
});

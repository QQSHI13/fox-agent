import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-test-"));
  process.env.FOX_HOME = dir;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("view projection", () => {
  test("delete op hides node; restore (undo) brings it back", async () => {
    const { createSession, appendMessage, appendOps, undoLastOp } = await import("../src/store/db.ts");
    const { projectView } = await import("../src/context/view.ts");

    const s = createSession("/tmp", "m1");
    const a = appendMessage(s.id, { parent_id: null, role: "user", content: "hello", tokens: 2 });
    const b = appendMessage(s.id, { parent_id: null, role: "assistant", content: "world", tokens: 2 });

    appendOps(s.id, [{ kind: "delete", ids: [a.seq], summary: "greeting noted" }]);
    let view = projectView(s.id);
    expect(view.find((n) => n.msg.seq === a.seq)!.deleted).toBe(true);
    expect(view.find((n) => n.msg.seq === b.seq)!.deleted).toBe(false);

    undoLastOp(s.id);
    view = projectView(s.id);
    expect(view.find((n) => n.msg.seq === a.seq)!.deleted).toBe(false);
    // log stays append-only
    const { allOps } = await import("../src/store/db.ts");
    expect(allOps(s.id)).toHaveLength(2);
  });

  test("replace op rewrites view content only", async () => {
    const { createSession, appendMessage, appendOps, getMessage } = await import("../src/store/db.ts");
    const { projectView } = await import("../src/context/view.ts");

    const s = createSession("/tmp", "m1");
    const m = appendMessage(s.id, { parent_id: null, role: "user", content: "original", tokens: 3 });
    appendOps(s.id, [{ kind: "replace", id: m.seq, content: "rewritten" }]);
    const n = projectView(s.id).find((x) => x.msg.seq === m.seq)!;
    expect(n.content).toBe("rewritten");
    expect(getMessage(s.id, m.seq)!.content).toBe("original"); // storage immutable
  });

  test("pairing invariant: hiding an assistant hides its tool results", async () => {
    const { createSession, appendMessage, appendOps } = await import("../src/store/db.ts");
    const { projectView } = await import("../src/context/view.ts");

    const s = createSession("/tmp", "m1");
    appendMessage(s.id, { parent_id: null, role: "user", content: "run it", tokens: 4 });
    const calls = [{ id: "c1", name: "exec", arguments: "{}" }];
    const asst = appendMessage(s.id, {
      parent_id: null,
      role: "assistant",
      content: "",
      tool_calls: JSON.stringify(calls),
      tokens: 4,
    });
    appendMessage(s.id, { parent_id: asst.id, role: "tool", content: "exit 0", tool_call_id: "c1", tokens: 2 });

    // hide the whole span like ctx_edit would
    appendOps(s.id, [{ kind: "delete", ids: [asst.seq], summary: "ran exec ok" }]);
    const view = projectView(s.id);
    const toolNode = view.find((n) => n.msg.role === "tool")!;
    expect(toolNode.deleted).toBe(true); // orphan repair
    expect(toolNode.orphan).toBe(true);
  });

  test("restore does not resurrect orphans whose parent is still hidden", async () => {
    const { createSession, appendMessage, appendOps } = await import("../src/store/db.ts");
    const { projectView } = await import("../src/context/view.ts");

    const s = createSession("/tmp", "m1");
    const calls = [{ id: "c1", name: "read", arguments: "{}" }];
    const asst = appendMessage(s.id, { parent_id: null, role: "assistant", content: "", tool_calls: JSON.stringify(calls), tokens: 2 });
    appendMessage(s.id, { parent_id: asst.id, role: "tool", content: "data", tool_call_id: "c1", tokens: 2 });
    const user = appendMessage(s.id, { parent_id: null, role: "user", content: "next", tokens: 2 });

    // delete [asst, user] then restore only user — orphan must stay hidden
    appendOps(s.id, [
      { kind: "delete", ids: [asst.seq, user.seq], summary: "cleaned" },
      { kind: "restore", ids: [user.seq] },
    ]);
    const view = projectView(s.id);
    expect(view.find((n) => n.msg.role === "tool")!.deleted).toBe(true);
    expect(view.find((n) => n.msg.seq === user.seq)!.deleted).toBe(false);
  });

  test("renderContext drops unpaired tool_calls from kept assistants", async () => {
    const { createSession, appendMessage, appendOps } = await import("../src/store/db.ts");
    const { renderContext } = await import("../src/context/render.ts");

    const s = createSession("/tmp", "m1");
    const calls = [
      { id: "keep", name: "read", arguments: "{}" },
      { id: "drop", name: "exec", arguments: "{}" },
    ];
    const asst = appendMessage(s.id, { parent_id: null, role: "assistant", content: "", tool_calls: JSON.stringify(calls), tokens: 6 });
    appendMessage(s.id, { parent_id: asst.id, role: "tool", content: "file data", tool_call_id: "keep", tokens: 2 });

    appendOps(s.id, [{ kind: "delete", ids: [asst.seq + 1] }]); // hide the 'keep' result
    let msgs = renderContext(s.id, "sys");
    // assistant with no visible calls and no text -> skipped entirely
    expect(msgs.filter((m) => m.role === "assistant")).toHaveLength(0);

    appendOps(s.id, [{ kind: "restore", ids: [asst.seq + 1] }]);
    msgs = renderContext(s.id, "sys");
    const asstMsg = msgs.find((m) => m.role === "assistant")!;
    expect(asstMsg.tool_calls).toHaveLength(1);
    expect(asstMsg.tool_calls![0].id).toBe("keep");
    expect(msgs.filter((m) => m.role === "tool")).toHaveLength(1);
  });
});

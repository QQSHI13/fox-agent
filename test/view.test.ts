import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-test-"));
  process.env.FOX_AGENT_HOME = dir;
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

describe("render roles", () => {
  test("a compaction summary is the assistant's voice, not the user's", async () => {
    const { createSession, appendMessage, appendOps } = await import("../src/store/db.ts");
    const { renderContext } = await import("../src/context/render.ts");

    const s = createSession("/tmp", "m1");
    const a = appendMessage(s.id, { parent_id: null, role: "user", content: "old question", tokens: 2 });
    appendMessage(s.id, { parent_id: null, role: "user", content: "new question", tokens: 2 });
    appendOps(s.id, [{ kind: "delete", ids: [a.seq], summary: "SUMMARY: we discussed X" }]);

    const msgs = renderContext(s.id, "SYS");
    const note = msgs.find((m) => m.content.includes("SUMMARY: we discussed X"))!;
    expect(note).toBeTruthy();
    // the summary is the model's own recap of its own conversation. Rendering it
    // as `user` made the harness speak in the user's voice: the model cannot
    // tell that note apart from something the person typed, and anything
    // imperative inside it then arrives with a user instruction's authority.
    expect(note.role).toBe("assistant");
    expect(note.content).toContain(`(ctx: [m${a.seq}] summarized away)`);
    // and it must not be mistaken for a real turn
    expect(msgs.filter((m) => m.role === "user").map((m) => m.content)).toEqual([`[m2] new question`]);
  });

  test("a summary never lands between an assistant's tool call and its result", async () => {
    // that pairing is a hard API requirement, so a note wedged in the middle is
    // a rejected request rather than a cosmetic problem
    const { createSession, appendMessage, appendOps } = await import("../src/store/db.ts");
    const { renderContext } = await import("../src/context/render.ts");

    const s = createSession("/tmp", "m1");
    appendMessage(s.id, { parent_id: null, role: "user", content: "run it", tokens: 2 });
    const asst = appendMessage(s.id, {
      parent_id: null,
      role: "assistant",
      content: "",
      tokens: 1,
      tool_calls: JSON.stringify([{ id: "c1", name: "exec", arguments: "{}" }]),
    });
    const junk = appendMessage(s.id, { parent_id: null, role: "user", content: "noise", tokens: 1 });
    appendMessage(s.id, { parent_id: null, role: "tool", tool_call_id: "c1", content: "output", tokens: 2 });
    // the hidden span sits immediately before the tool result
    appendOps(s.id, [{ kind: "delete", ids: [junk.seq], summary: "dropped the noise" }]);

    const msgs = renderContext(s.id, "SYS");
    const roles = msgs.map((m) => m.role);
    const call = roles.indexOf("assistant");
    expect(msgs[call].tool_calls).toBeTruthy();
    // whatever else happens, the message right after the call is its result
    expect(msgs[call + 1].role).toBe("tool");
    // and the summary was not dropped on the floor to achieve that
    expect(msgs.some((m) => m.content.includes("dropped the noise"))).toBe(true);
    expect(asst.seq).toBeGreaterThan(0);
  });

  test("consecutive hidden spans collapse into one note, not one per row", async () => {
    const { createSession, appendMessage, appendOps } = await import("../src/store/db.ts");
    const { renderContext } = await import("../src/context/render.ts");

    const s = createSession("/tmp", "m1");
    const a = appendMessage(s.id, { parent_id: null, role: "user", content: "one", tokens: 1 });
    const b = appendMessage(s.id, { parent_id: null, role: "assistant", content: "two", tokens: 1 });
    appendMessage(s.id, { parent_id: null, role: "user", content: "live", tokens: 1 });
    appendOps(s.id, [
      { kind: "delete", ids: [a.seq], summary: "first recap" },
      { kind: "delete", ids: [b.seq], summary: "second recap" },
    ]);

    const msgs = renderContext(s.id, "SYS");
    const notes = msgs.filter((m) => m.content.includes("recap"));
    expect(notes).toHaveLength(1);
    expect(notes[0].role).toBe("assistant");
    expect(notes[0].content).toContain("first recap");
    expect(notes[0].content).toContain("second recap");
  });

  test("an echoed [mN] at the top of an assistant reply never renders doubled", async () => {
    const { createSession, appendMessage } = await import("../src/store/db.ts");
    const { renderContext, stripEchoedMarkers } = await import("../src/context/render.ts");

    expect(stripEchoedMarkers("[m12] sure, doing that")).toBe("sure, doing that");
    expect(stripEchoedMarkers("  [m3] [m4] ok")).toBe("ok");
    expect(stripEchoedMarkers("plain reply")).toBe("plain reply");
    // mid-text mentions survive — only the leading echo is stripped
    expect(stripEchoedMarkers("hiding [m3] now")).toBe("hiding [m3] now");

    const s = createSession("/tmp", "m1");
    appendMessage(s.id, { parent_id: null, role: "user", content: "hi", tokens: 1 });
    const a = appendMessage(s.id, { parent_id: null, role: "assistant", content: "[m1] hello there", tokens: 2 });
    const msgs = renderContext(s.id, "SYS");
    const rendered = msgs.find((m) => m.role === "assistant")!;
    expect(rendered.content).toBe(`[m${a.seq}] hello there`);
    expect(rendered.content).not.toContain("[m1] hello");
  });

  test("markers: false renders no [mN] anywhere, summaries included", async () => {
    const { createSession, appendMessage, appendOps } = await import("../src/store/db.ts");
    const { renderContext } = await import("../src/context/render.ts");

    const s = createSession("/tmp", "m1");
    const old = appendMessage(s.id, { parent_id: null, role: "user", content: "old", tokens: 1 });
    appendMessage(s.id, { parent_id: null, role: "assistant", content: "answer", tokens: 1 });
    appendOps(s.id, [{ kind: "delete", ids: [old.seq], summary: "recap" }]);

    const msgs = renderContext(s.id, "SYS", { markers: false });
    for (const m of msgs.slice(1)) expect(m.content).not.toMatch(/\[m\d+\]/);
    expect(msgs.find((m) => m.role === "assistant" && m.content === "answer")).toBeTruthy();
    expect(msgs.some((m) => m.content.includes("(ctx: summarized away) recap"))).toBe(true);
    // flipping the flag re-renders (the memo key includes it), no stale cache
    const withMarkers = renderContext(s.id, "SYS", { markers: true });
    expect(withMarkers.find((m) => m.role === "assistant" && !m.content.includes("recap"))!.content).toMatch(/^\[m\d+\] answer$/);
  });
});

describe("renderContext node memo", () => {
  test("re-renders only what changed: replace and delete ops are picked up", async () => {
    const db = await import("../src/store/db.ts");
    const { renderContext } = await import("../src/context/render.ts");
    const s = db.createSession("/tmp", "m1");
    const a = db.appendMessage(s.id, { parent_id: null, role: "user", content: "hello", tokens: 2 });
    const b = db.appendMessage(s.id, { parent_id: a.id, role: "assistant", content: "world", tokens: 2 });

    const first = renderContext(s.id, "sys");
    expect(first.map((m) => m.content)).toEqual(["sys", `[m${a.seq}] hello`, `[m${b.seq}] world`]);

    // a replace op rewrites the view content; the memo must not serve the old text
    db.appendOps(s.id, [{ kind: "replace", id: b.seq, content: "WORLD" }]);
    const second = renderContext(s.id, "sys");
    expect(second[2].content).toBe(`[m${b.seq}] WORLD`);

    // a delete-with-summary hides the node and emits the summary note instead
    db.appendOps(s.id, [{ kind: "delete", ids: [b.seq], summary: "greeting done" }]);
    const third = renderContext(s.id, "sys");
    expect(third).toHaveLength(3); // system + user + summary
    expect(third[2].role).toBe("assistant");
    expect(third[2].content).toContain("greeting done");
  });
});

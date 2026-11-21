import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CountEntry } from "../../src/tui/layout.ts";

const dir = mkdtempSync(join(tmpdir(), "fox-transcript-perf-"));
process.env.FOX_AGENT_HOME = join(dir, ".fox");
process.env.FOX_AGENT_CONFIG = join(dir, ".fox", "config.toml");

const db = await import("../../src/store/db.ts");
const view = await import("../../src/context/view.ts");
const model = await import("../../src/view/model.ts");
const layout = await import("../../src/tui/layout.ts");

const session = db.createSession(dir, "perf");
let bytes = 0;
for (let i = 0; i < 1200; i++) {
  const role = i % 3 === 2 ? "tool" : i % 2 ? "assistant" : "user";
  const content = role === "tool" ? `output ${i}\n${"x".repeat(20_000)}` : `message ${i}\n${"word ".repeat(80)}`;
  bytes += content.length;
  if (role === "tool") {
    db.appendMessage(session.id, {
      parent_id: null,
      role: "assistant",
      content: "",
      tokens: 10,
      tool_calls: JSON.stringify([{ id: `call-${i}`, name: "exec", arguments: `{"cmd":"echo ${i}"}` }]),
    });
    db.appendMessage(session.id, { parent_id: null, role: "tool", content, tokens: 10, tool_call_id: `call-${i}` });
  } else {
    db.appendMessage(session.id, { parent_id: null, role, content, tokens: 10 });
  }
}

const t0 = performance.now();
const nodes = view.projectView(session.id).filter((n) => !n.deleted);
const hydrateMs = performance.now() - t0;

const t1 = performance.now();
const maps = model.callMaps(nodes.map((n) => n.msg), (name, args) => `${name} ${args.slice(0, 20)}`);
const items = nodes.flatMap((n) => model.nodeToItems(n.msg, maps, { key: (seq, slot) => seq * 4 + slot, expanded: () => false, keptChars: 4000 }, false, n.replaceVersion !== undefined));
const itemBuildMs = performance.now() - t1;

const cache = new Map<number, CountEntry>();
const base = {
  W: 120,
  H: 40,
  scrollTop: Number.MAX_SAFE_INTEGER,
  stick: true,
  scrollbar: true,
  streamText: null,
  renderItem: () => [{ segs: [] }],
  countItem: () => 1,
  renderStream: () => [],
  countStream: () => 0,
  inputRows: 1,
  caretRow: 0,
  INPUT_MAX_ROWS: 6,
  pendingCount: 0,
};
let cold = 0;
for (let i = 0; i < 3; i++) cold += layout.computeFrame({ ...base, items, countCache: { version: () => i, at: cache } }).total;
const frameColdMs = cold / 3;
const t2 = performance.now();
layout.computeFrame({ ...base, items, countCache: { version: () => 99, at: cache } });
const frameWarmMs = performance.now() - t2;

console.log(JSON.stringify({ hydrateMs, itemBuildMs, projectViewBytes: bytes, frameColdMs, frameWarmMs, rssMB: process.memoryUsage().rss / 1024 / 1024 }));
rmSync(dir, { recursive: true, force: true });

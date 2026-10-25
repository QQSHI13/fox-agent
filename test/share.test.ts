import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSession, appendMessage } from "../src/store/db.ts";
import { shareSession } from "../src/store/share.ts";

let home: string;
function fresh() {
  home = mkdtempSync(join(tmpdir(), "fox-share-"));
  process.env.FOX_AGENT_HOME = home;
  // BOTH: loadConfig reads the global config from FOX_AGENT_CONFIG when set,
  // else ~/.config — setting only the home left this suite asserting against
  // the developer's real config (a stray key there flips expect(warnings)).
  // Point it inside the tmp home; never touch the real config (CLAUDE.md).
  process.env.FOX_AGENT_CONFIG = join(home, "config.toml");
  return home;
}

describe("/share: a self-contained offline page", () => {
  test("renders the transcript with code highlighting and collapsible tool output", () => {
    const d = fresh();
    const s = createSession("/tmp/p", "m");
    appendMessage(s.id, { role: "user", content: "add a loader", tokens: 2 });
    appendMessage(s.id, {
      role: "assistant",
      content: "```ts\nexport function load(p: string) {\n  return JSON.parse(readFileSync(p));\n}\n```",
      tokens: 10,
    });
    appendMessage(s.id, {
      role: "assistant",
      content: "",
      tokens: 1,
      tool_calls: JSON.stringify([{ id: "t1", name: "exec", arguments: '{"cmd":"npm test"}' }]),
    });
    appendMessage(s.id, { role: "tool", tool_call_id: "t1", content: "PASS 12 tests", tokens: 3 });

    const out = join(d, "s.html");
    const r = shareSession(s.id, out);
    const html = readFileSync(out, "utf8");

    expect(r.bytes).toBeGreaterThan(0);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("add a loader");
    expect(html).toContain("export function load");
    // Shiki's real hex, not a flat gutter color
    expect(html).toContain("style=\"color:");
    expect(html).toContain("exec");
    expect(html).toContain("PASS 12 tests");
    expect(html).toContain("<details");
    rmSync(d, { recursive: true, force: true });
  });

  test("nothing is fetched at view time — no external script or image", () => {
    const d = fresh();
    const s = createSession("/tmp/p", "m");
    appendMessage(s.id, { role: "user", content: "hi", tokens: 1 });
    const out = join(d, "s.html");
    shareSession(s.id, out);
    const html = readFileSync(out, "utf8");
    expect(html).not.toMatch(/<(script|img)[^>]+src=["']https?:/i);
    expect(html).toContain("--accent:");
    rmSync(d, { recursive: true, force: true });
  });

  // A shared page is a file people email around, so credential-shaped text in
  // tool args or prose must not ride along.
  test("credential-shaped text is masked", () => {
    const d = fresh();
    const s = createSession("/tmp/p", "m");
    appendMessage(s.id, {
      role: "assistant",
      content: "",
      tokens: 1,
      tool_calls: JSON.stringify([
        { id: "t1", name: "exec", arguments: '{"env":"API_KEY=sk-live-abcdef0123456789ABCD"}' },
      ]),
    });
    const out = join(d, "s.html");
    shareSession(s.id, out);
    const html = readFileSync(out, "utf8");
    expect(html).not.toContain("sk-live-abcdef0123456789ABCD");
    expect(html).toContain("redacted");
    rmSync(d, { recursive: true, force: true });
  });

  // Model output reaches this page, so raw tags must render as text and a
  // javascript: href must never become an anchor.
  test("raw html is escaped and dangerous link schemes are dropped", () => {
    const d = fresh();
    const s = createSession("/tmp/p", "m");
    appendMessage(s.id, { role: "assistant", content: "<script>alert(1)</script>\n\n[x](javascript:alert(2))", tokens: 2 });
    const out = join(d, "s.html");
    shareSession(s.id, out);
    const html = readFileSync(out, "utf8");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain('href="javascript:');
    rmSync(d, { recursive: true, force: true });
  });

  // The page's whole purpose is fidelity: a tool result's image lives in `media`
  // and its failure lives in `error`, so a projection that drops those columns
  // would show a picture-less page and call a failed command a success.
  test("images ride along and a failed tool is not shown as a success", () => {
    const d = fresh();
    const s = createSession("/tmp/p", "m");
    appendMessage(s.id, {
      role: "assistant",
      content: "",
      tokens: 1,
      tool_calls: JSON.stringify([{ id: "t1", name: "read", arguments: '{"path":"x.png"}' }]),
    });
    appendMessage(s.id, {
      role: "tool",
      tool_call_id: "t1",
      content: "error: read x.png: permission denied",
      tokens: 3,
      media: JSON.stringify([{ mimeType: "image/png", data: "iVBORw0KGgo=" }]),
      error: "error: read x.png: permission denied",
    });
    const out = join(d, "s.html");
    shareSession(s.id, out);
    const html = readFileSync(out, "utf8");
    expect(html).toContain('<img src="data:image/png;base64,iVBORw0KGgo="');
    expect(html).toContain("permission denied");
    expect(html).toContain("· 1 image");
    rmSync(d, { recursive: true, force: true });
  });

  test("an unknown session is refused, not an empty page", () => {
    const d = fresh();
    expect(() => shareSession("nope123", join(d, "s.html"))).toThrow(/no session/);
    rmSync(d, { recursive: true, force: true });
  });
});

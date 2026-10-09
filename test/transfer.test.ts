import { describe, expect, test, beforeEach, afterAll } from "bun:test";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exportSession, importSession } from "../src/store/transfer.ts";
import { createSession, appendMessage, setRefTitle, getSession, allMessages, closeAll } from "../src/store/db.ts";
import { ensureLayout } from "../src/core/paths.ts";
import { zipSync } from "../src/store/zip.ts";

let home: string;
let carry: string; // where the zip lives across the simulated device move

beforeEach(() => {
  home = mkdtempSync("/tmp/fox-transfer-");
  carry = mkdtempSync("/tmp/fox-carry-");
  process.env.FOX_AGENT_HOME = home;
  closeAll();
});
afterAll(() => {
  closeAll();
  if (home) rmSync(home, { recursive: true, force: true });
  if (carry) rmSync(carry, { recursive: true, force: true });
});

describe("session export/import", () => {
  test("export then import restores a working session", () => {
    const s = createSession("/tmp/proj-a", "test-model");
    appendMessage(s.id, { role: "user", content: "hello from device A", tokens: 4 });
    appendMessage(s.id, { role: "assistant", content: "hi back", tokens: 3 });
    setRefTitle(s.id, "transfer title");

    const dest = join(carry, "out.zip");
    const written = exportSession(s.id, dest, "test");
    expect(written).toBe(dest);
    expect(existsSync(dest)).toBe(true);

    // pretend this is another device: wipe the local store, then land the zip
    closeAll();
    rmSync(home, { recursive: true, force: true });
    ensureLayout();

    const r = importSession(dest);
    expect(r.id).toBe(s.id);
    expect(r.replaced).toBe(false);
    expect(r.messages).toBe(2);

    const back = getSession(s.id);
    expect(back).not.toBeNull();
    expect(back!.title).toBe("transfer title");
    expect(back!.cwd).toBe("/tmp/proj-a");
    const msgs = allMessages(s.id);
    expect(msgs.length).toBe(2);
    expect(msgs[0].content).toBe("hello from device A");
  });

  test("re-import replaces rather than duplicates", () => {
    const s = createSession("/tmp/proj-b", "m");
    appendMessage(s.id, { role: "user", content: "one", tokens: 1 });
    const dest = join(carry, "again.zip");
    exportSession(s.id, dest, "test");
    const r = importSession(dest);
    expect(r.replaced).toBe(true);
    expect(allMessages(s.id).length).toBe(1);
  });

  test("garbage and foreign zips are refused with messages", () => {
    const bad = join(carry, "bad.zip");
    writeFileSync(bad, "definitely not a zip");
    expect(() => importSession(bad)).toThrow(/not a readable session archive/);

    // a zip without our manifest: structurally valid, not a session export
    const foreign = join(carry, "foreign.zip");
    writeFileSync(
      foreign,
      zipSync([{ name: "readme.txt", data: new TextEncoder().encode("hi") }]),
    );
    expect(() => importSession(foreign)).toThrow(/missing manifest/);
  });

  test("export refuses an unknown session", () => {
    expect(() => exportSession("nope123", undefined, "test")).toThrow(/no session/);
  });
});

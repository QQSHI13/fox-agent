import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as F from "../src/tools/files.ts";
import { execRun } from "../src/tools/exec.ts";
import { baseRegistry, buildRegistry } from "../src/tools/index.ts";
import { childEnv } from "../src/core/childenv.ts";
import type { ToolContext } from "../src/tools/types.ts";

let dir: string;
let ctx: ToolContext;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-tools-"));
  process.env.FOX_HOME = join(dir, ".fox");
  let pty: unknown;
  ctx = {
    sessionId: "s1",
    cwd: dir,
    turnStartSeq: 0,
    readFiles: new Set<string>(),
    get pty() {
      return pty;
    },
    set pty(v: unknown) {
      pty = v;
    },
  } as unknown as ToolContext;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const write = (rel: string, body: string) => {
  const p = join(dir, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, body);
  return p;
};

describe("read", () => {
  test("returns line-numbered content", async () => {
    write("a.txt", "one\ntwo\nthree\n");
    const r = await F.readRun({ path: "a.txt" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("1:");
    expect(r.output).toContain("two");
  });

  test("offset and limit window the file", async () => {
    write("b.txt", Array.from({ length: 50 }, (_, i) => `line${i + 1}`).join("\n"));
    const r = await F.readRun({ path: "b.txt", offset: 10, limit: 3 }, ctx);
    expect(r.output).toContain("line10");
    expect(r.output).toContain("line12");
    expect(r.output).not.toContain("line13");
  });

  test("missing file is a failure, not a throw", async () => {
    const r = await F.readRun({ path: "nope.txt" }, ctx);
    expect(r.ok).toBe(false);
  });

  test("binary files are refused", async () => {
    writeFileSync(join(dir, "bin.dat"), Buffer.from([0x41, 0x00, 0x42, 0x00]));
    const r = await F.readRun({ path: "bin.dat" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/binary/i);
  });

  test("reading a directory fails cleanly", async () => {
    mkdirSync(join(dir, "sub"));
    const r = await F.readRun({ path: "sub" }, ctx);
    expect(r.ok).toBe(false);
  });
});

describe("write", () => {
  test("creates parent directories", async () => {
    const r = await F.writeRun({ path: "deep/nested/x.txt", content: "hi" }, ctx);
    expect(r.ok).toBe(true);
    expect(await Bun.file(join(dir, "deep/nested/x.txt")).text()).toBe("hi");
  });

  test("overwriting an unread existing file is refused", async () => {
    write("o.txt", "old");
    const r = await F.writeRun({ path: "o.txt", content: "new" }, ctx);
    expect(r.ok).toBe(false);
    expect(await Bun.file(join(dir, "o.txt")).text()).toBe("old");
  });

  test("overwrites once the file has been read", async () => {
    write("o.txt", "old");
    await F.readRun({ path: "o.txt" }, ctx);
    const r = await F.writeRun({ path: "o.txt", content: "new" }, ctx);
    expect(r.ok).toBe(true);
    expect(await Bun.file(join(dir, "o.txt")).text()).toBe("new");
  });
});

describe("edit", () => {
  test("replaces a unique string", async () => {
    write("c.ts", "const a = 1;\nconst b = 2;\n");
    await F.readRun({ path: "c.ts" }, ctx); // read-before-edit is enforced
    const r = await F.editRun({ path: "c.ts", oldString: "const a = 1;", newString: "const a = 99;" }, ctx);
    expect(r.ok).toBe(true);
    expect(await Bun.file(join(dir, "c.ts")).text()).toContain("const a = 99;");
  });

  test("ambiguous match is rejected without touching the file", async () => {
    write("d.ts", "aa\naa\n");
    await F.readRun({ path: "d.ts" }, ctx);
    const before = await Bun.file(join(dir, "d.ts")).text();
    const r = await F.editRun({ path: "d.ts", edits: [{ oldString: "aa", newString: "y" }] }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/matches 2 times/);
    expect(await Bun.file(join(dir, "d.ts")).text()).toBe(before);
  });

  test("missing match is rejected", async () => {
    write("e.ts", "hello\n");
    await F.readRun({ path: "e.ts" }, ctx);
    const r = await F.editRun({ path: "e.ts", oldString: "absent", newString: "z" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/not found/);
  });

  test("editing a file that was never read is refused", async () => {
    write("f.ts", "hello\n");
    const r = await F.editRun({ path: "f.ts", oldString: "hello", newString: "bye" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/read f\.ts before editing/);
    expect(await Bun.file(join(dir, "f.ts")).text()).toBe("hello\n");
  });
});

describe("glob", () => {
  test("finds files by pattern", async () => {
    write("src/a.ts", "");
    write("src/b.ts", "");
    write("src/c.md", "");
    const r = await F.globRun({ pattern: "src/*.ts" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("a.ts");
    expect(r.output).toContain("b.ts");
    expect(r.output).not.toContain("c.md");
  });

  test("no matches reports plainly rather than failing", async () => {
    const r = await F.globRun({ pattern: "*.nothing" }, ctx);
    expect(r.output).toMatch(/no (files|matches)/i);
  });
});

describe("grep", () => {
  test("finds a pattern and reports the file", async () => {
    write("g.ts", "const needle = 1;\n");
    const r = await F.grepRun({ pattern: "needle" }, ctx);
    expect(r.output).toContain("g.ts");
  });

  test("no match is reported, not an error", async () => {
    write("g.ts", "nothing here\n");
    const r = await F.grepRun({ pattern: "zzzznomatch" }, ctx);
    expect(r.output).toMatch(/no match/i);
  });
});

describe("exec", () => {
  test("captures stdout on success", async () => {
    const r = await execRun({ cmd: "echo hello-exec" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("hello-exec");
  });

  test("a non-zero exit is reported as a failure", async () => {
    const r = await execRun({ cmd: "exit 3" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/^exit 3/);
  });

  test("stderr is captured", async () => {
    const r = await execRun({ cmd: "echo oops >&2; exit 1" }, ctx);
    expect(r.output).toContain("oops");
  });

  test("timeout kills the command and reports it", async () => {
    const r = await execRun({ cmd: "sleep 30", timeout_ms: 1_000 }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/timeout \d+ms/);
  }, 10_000);

  test("runs in ctx.cwd", async () => {
    write("marker.txt", "");
    const r = await execRun({ cmd: "ls" }, ctx);
    expect(r.output).toContain("marker.txt");
  });
});

describe("registry", () => {
  test("base registry exposes the built-in tools", () => {
    const reg = baseRegistry();
    for (const name of ["read", "write", "edit", "glob", "grep", "exec", "pty", "ctx_edit", "todowrite", "task", "fetch"]) {
      expect(reg.has(name)).toBe(true);
    }
  });

  test("every tool def has a name, description and object params", () => {
    for (const [name, tool] of baseRegistry()) {
      expect(tool.def.name).toBe(name);
      expect(tool.def.description.length).toBeGreaterThan(10);
      expect(tool.def.parameters.type).toBe("object");
    }
  });

  test("buildRegistry with no MCP servers returns built-ins and no warnings", async () => {
    const { tools, warnings } = await buildRegistry({ mcpServers: {} } as any);
    expect(warnings).toEqual([]);
    expect(tools.has("read")).toBe(true);
  });

  test("exclude drops the named tools", async () => {
    const { tools } = await buildRegistry({ mcpServers: {} } as any, new Set(["task", "pty", "ctx_edit"]));
    expect(tools.has("task")).toBe(false);
    expect(tools.has("pty")).toBe(false);
    expect(tools.has("ctx_edit")).toBe(false);
    expect(tools.has("read")).toBe(true);
  });
});

describe("childEnv", () => {
  test("strips provider credentials but keeps ordinary vars", () => {
    process.env.FOX_API_KEY = "secret1";
    process.env.ANTHROPIC_API_KEY = "secret2";
    process.env.SOME_OTHER_API_KEY = "secret3";
    process.env.FOX_KEEP_ME = "fine";
    try {
      const env = childEnv();
      expect(env.FOX_API_KEY).toBeUndefined();
      expect(env.ANTHROPIC_API_KEY).toBeUndefined();
      expect(env.SOME_OTHER_API_KEY).toBeUndefined();
      expect(env.FOX_KEEP_ME).toBe("fine");
      expect(env.PATH).toBe(process.env.PATH!);
    } finally {
      delete process.env.FOX_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.SOME_OTHER_API_KEY;
      delete process.env.FOX_KEEP_ME;
    }
  });

  test("extra vars are merged and win over the inherited set", () => {
    process.env.FOX_OVERRIDE_ME = "before";
    try {
      const env = childEnv({ FOX_OVERRIDE_ME: "after", EXTRA: "x" });
      expect(env.FOX_OVERRIDE_ME).toBe("after");
      expect(env.EXTRA).toBe("x");
    } finally {
      delete process.env.FOX_OVERRIDE_ME;
    }
  });
});

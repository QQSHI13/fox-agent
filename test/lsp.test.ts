/**
 * The LSP layer: frame codec, server selection, diagnostic formatting, and one
 * real end-to-end check against `typescript-language-server`.
 *
 * Most of this is deliberately server-free. The codec and the formatter are pure,
 * and server *selection* is injectable — so the parts that decide what the model
 * is told are tested exhaustively without paying ~5s of tsserver startup per
 * assertion. The single integration test at the bottom is what proves the whole
 * path works against a real server, and it is skipped rather than failed when no
 * server is installed, because whether one exists is a property of the machine.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encode, FrameReader } from "../src/lsp/codec.ts";
import { formatDiagnostics, MAX_REPORTED, reportable, SEVERITY, type Diagnostic } from "../src/lsp/types.ts";
import { BUILTIN_SERVERS, languageId, projectRoot, serverFor } from "../src/lsp/servers.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-lsp-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const bytes = (s: string) => new TextEncoder().encode(s);
/** Frame a message the way a server would write it. */
const framed = (o: unknown) => {
  const { header, body } = encode(o);
  return header + body.toString("utf8");
};

const diag = (line: number, message: string, severity: number = SEVERITY.error, code?: string | number): Diagnostic => ({
  range: { start: { line, character: 0 }, end: { line, character: 5 } },
  severity,
  code,
  message,
});

describe("lsp codec", () => {
  test("a whole message in one chunk round trips", () => {
    const r = new FrameReader();
    expect(r.push(bytes(framed({ jsonrpc: "2.0", id: 1, result: { ok: true } })))).toEqual([
      { jsonrpc: "2.0", id: 1, result: { ok: true } },
    ]);
  });

  test("Content-Length counts bytes, not characters", () => {
    // The bug this pins: `str.length` for a message containing non-ASCII frames
    // short, and then every subsequent message on the connection is misaligned.
    // A diagnostic quoting an identifier with an accent is enough to trigger it.
    const msg = { jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { message: "café — ünïcode ✓" } };
    const { header, body } = encode(msg);
    const declared = Number(/Content-Length: (\d+)/.exec(header)![1]);
    expect(declared).toBe(body.byteLength);
    expect(declared).toBeGreaterThan(JSON.stringify(msg).length); // multi-byte chars present
    // and it still parses when read back, byte-for-byte
    expect(new FrameReader().push(bytes(header + body.toString("utf8")))).toEqual([msg]);
  });

  test("a message split across chunk boundaries is reassembled", () => {
    const whole = framed({ jsonrpc: "2.0", id: 7, result: "split" });
    const r = new FrameReader();
    // split mid-header, then mid-body — a stdout chunk boundary has nothing to do
    // with a message boundary
    expect(r.push(bytes(whole.slice(0, 8)))).toEqual([]);
    expect(r.push(bytes(whole.slice(8, 30)))).toEqual([]);
    expect(r.push(bytes(whole.slice(30)))).toEqual([{ jsonrpc: "2.0", id: 7, result: "split" }]);
  });

  test("several messages coalesced into one chunk all come back, in order", () => {
    const r = new FrameReader();
    const got = r.push(bytes(framed({ id: 1 }) + framed({ id: 2 }) + framed({ id: 3 })));
    expect(got).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  test("a trailing partial message is held, not lost", () => {
    const r = new FrameReader();
    const next = framed({ id: 2 });
    expect(r.push(bytes(framed({ id: 1 }) + next.slice(0, 12)))).toEqual([{ id: 1 }]);
    expect(r.push(bytes(next.slice(12)))).toEqual([{ id: 2 }]);
  });

  test("a malformed body loses one message, not the connection", () => {
    const r = new FrameReader();
    const bad = "Content-Length: 5\r\n\r\n{{{{{";
    expect(r.push(bytes(bad + framed({ id: 9 })))).toEqual([{ id: 9 }]);
  });

  test("a header with no Content-Length does not spin forever", () => {
    // There is no way to know where such a frame's body ends, so it is dropped.
    // The failure mode being guarded is an infinite loop on the same bytes.
    const r = new FrameReader();
    expect(r.push(bytes("Bogus-Header: 1\r\n\r\n" + framed({ id: 4 })))).toEqual([{ id: 4 }]);
  });

  test("header casing and extra headers are tolerated", () => {
    const r = new FrameReader();
    const body = Buffer.from(JSON.stringify({ id: 5 }), "utf8");
    const raw = `content-length: ${body.byteLength}\r\nContent-Type: application/vscode-jsonrpc\r\n\r\n${body}`;
    expect(r.push(bytes(raw))).toEqual([{ id: 5 }]);
  });
});

describe("lsp server selection", () => {
  const always = () => true;
  const never = () => false;

  test("built-ins cover ts/tsx/js/py/rs when the command is on PATH", () => {
    expect(serverFor("/x/a.ts", {}, always)?.name).toBe("typescript");
    expect(serverFor("/x/a.tsx", {}, always)?.name).toBe("typescript");
    expect(serverFor("/x/a.mjs", {}, always)?.name).toBe("typescript");
    expect(serverFor("/x/a.py", {}, always)?.name).toBe("pyright");
    expect(serverFor("/x/a.rs", {}, always)?.name).toBe("rust");
  });

  test("no server for unhandled extensions or extensionless files", () => {
    // this is the common case for fox-agent's own edits (.md, .toml, Makefile) and must
    // cost nothing at all
    expect(serverFor("/x/README.md", {}, always)).toBeNull();
    expect(serverFor("/x/fox-agent.toml", {}, always)).toBeNull();
    expect(serverFor("/x/Makefile", {}, always)).toBeNull();
  });

  test("a built-in that is not installed is not selected", () => {
    // nothing may be spawned on a machine where the user never installed a server
    expect(serverFor("/x/a.ts", {}, never)).toBeNull();
  });

  test("config wins over a built-in for the same extension, even off PATH", () => {
    // an explicitly named binary is a stronger signal than PATH detection, and
    // the spawn failure it produces is specific rather than silent
    const configured = { vtsls: { command: "/opt/vtsls", args: ["--stdio"], extensions: [".ts"] } };
    expect(serverFor("/x/a.ts", configured, never)).toMatchObject({ name: "vtsls" });
    // and it does not hijack extensions it never claimed
    expect(serverFor("/x/a.py", configured, always)?.name).toBe("pyright");
  });

  test("languageId maps the extensions the servers actually distinguish", () => {
    expect(languageId("/x/a.ts")).toBe("typescript");
    expect(languageId("/x/a.tsx")).toBe("typescriptreact"); // not "typescript" — servers parse JSX differently
    expect(languageId("/x/a.jsx")).toBe("javascriptreact");
    expect(languageId("/x/a.py")).toBe("python");
    expect(languageId("/x/a.rs")).toBe("rust");
    expect(languageId("/x/a.txt")).toBe("plaintext");
  });

  test("every built-in server declares extensions, and they do not overlap", () => {
    // overlap would make selection depend on object key order, i.e. on nothing
    const seen = new Map<string, string>();
    for (const [name, cfg] of Object.entries(BUILTIN_SERVERS)) {
      expect(cfg.extensions.length).toBeGreaterThan(0);
      for (const ext of cfg.extensions) {
        expect(ext.startsWith(".")).toBe(true);
        expect(seen.has(ext)).toBe(false);
        seen.set(ext, name);
      }
    }
  });

  test("projectRoot finds the nearest marker, not the deepest path", () => {
    // Measured behavior this protects: typescript-language-server reports ZERO
    // diagnostics, with no error, for a file outside the loaded tsconfig's
    // include. Rooting wrongly therefore reports "all clean" forever.
    const deep = join(dir, "pkg", "src", "nested");
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(dir, "tsconfig.json"), "{}");
    writeFileSync(join(dir, "pkg", "tsconfig.json"), "{}");
    const file = join(deep, "a.ts");
    expect(projectRoot(file, BUILTIN_SERVERS.typescript)).toBe(join(dir, "pkg"));
  });

  test("projectRoot falls back to the file's own directory with no marker", () => {
    const sub = join(dir, "loose");
    mkdirSync(sub, { recursive: true });
    // Cargo.toml is nowhere above this, and dir is a fresh mkdtemp
    expect(projectRoot(join(sub, "a.rs"), BUILTIN_SERVERS.rust)).toBe(sub);
  });
});

describe("diagnostic formatting", () => {
  test("errors and warnings are reported; hints and info are not", () => {
    // "declared but never read" fires constantly and legitimately mid-refactor:
    // a helper written in one edit and called in the next is unused for exactly
    // one turn. Reporting it trains the model to chase noise on every edit.
    expect(reportable(diag(0, "boom", SEVERITY.error))).toBe(true);
    expect(reportable(diag(0, "eh", SEVERITY.warning))).toBe(true);
    expect(reportable(diag(0, "fyi", SEVERITY.information))).toBe(false);
    expect(reportable(diag(0, "unused", SEVERITY.hint))).toBe(false);
    // absent severity is unspecified in LSP; treating it as low would hide real errors
    expect(reportable({ range: diag(0, "x").range, message: "no severity" })).toBe(true);
  });

  test("nothing to report yields null, not an empty block", () => {
    expect(formatDiagnostics("a.ts", "typescript", [])).toBeNull();
    // a file whose only diagnostics are hints is clean as far as the model is told
    expect(formatDiagnostics("a.ts", "typescript", [diag(3, "unused", SEVERITY.hint)])).toBeNull();
  });

  test("line and column are 1-based, matching read's gutter and grep", () => {
    // LSP is 0-based. An off-by-one here is invisible to a substring assertion
    // and infuriating in use, so it is pinned exactly.
    const out = formatDiagnostics("src/a.ts", "typescript", [
      { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, severity: 1, code: 2322, message: "Type 'number' is not assignable to type 'string'." },
    ])!;
    expect(out).toContain("src/a.ts:1:1 error 2322");
    expect(out).not.toContain(":0:");
  });

  test("the header counts errors and warnings separately", () => {
    const out = formatDiagnostics("a.ts", "typescript", [
      diag(1, "bad", SEVERITY.error),
      diag(2, "also bad", SEVERITY.error),
      diag(3, "meh", SEVERITY.warning),
      diag(4, "unused", SEVERITY.hint), // excluded, so must not be counted
    ])!;
    expect(out).toContain("diagnostics (typescript, 2 errors, 1 warning):");
    expect(out).not.toContain("hint");
  });

  test("output is sorted by position, whatever order the server sent", () => {
    const out = formatDiagnostics("a.ts", "typescript", [diag(9, "later"), diag(2, "earlier"), diag(5, "middle")])!;
    const lines = out.split("\n").slice(1);
    expect(lines.map((l) => l.trim().split(" ")[0])).toEqual(["a.ts:3:1", "a.ts:6:1", "a.ts:10:1"]);
  });

  test("a flood is capped and the remainder counted", () => {
    // one bad edit to a widely-imported file can produce hundreds; dumping them
    // all would blow the context window the harness exists to protect
    const many = Array.from({ length: MAX_REPORTED + 8 }, (_, i) => diag(i, `problem ${i}`));
    const out = formatDiagnostics("a.ts", "typescript", many)!;
    expect(out.split("\n")).toHaveLength(MAX_REPORTED + 2); // header + capped rows + summary
    expect(out).toContain(`… and 8 more`);
  });

  test("a multi-line server message is collapsed to its first line", () => {
    // TS overload dumps and rustc explanations restate the same thing per
    // candidate; the first line names the problem
    const out = formatDiagnostics("a.ts", "typescript", [
      diag(0, "No overload matches this call.\n  Overload 1 of 3 gave the following error.\n  Overload 2 of 3 ..."),
    ])!;
    expect(out).toContain("No overload matches this call.");
    expect(out).not.toContain("Overload 1 of 3");
    expect(out.split("\n")).toHaveLength(2);
  });

  test("a diagnostic with no code still renders", () => {
    // rust-analyzer and pyright both omit `code` for some diagnostics
    const out = formatDiagnostics("a.rs", "rust", [{ range: diag(0, "x").range, severity: 1, message: "mismatched types" }])!;
    expect(out).toContain("a.rs:1:1 error  mismatched types");
  });
});

describe("diagnose: the paths that must never break an edit", () => {
  test("a file no server handles returns null without spawning anything", async () => {
    const { diagnose } = await import("../src/lsp/client.ts");
    const { liveServerCount } = await import("../src/lsp/client.ts");
    const md = join(dir, "notes.md");
    writeFileSync(md, "# hi");
    expect(await diagnose(md, "# hi", { cwd: dir })).toBeNull();
    expect(liveServerCount()).toBe(0);
  });

  test("a configured server that cannot be spawned degrades to null", async () => {
    // The contract that matters most: the edit already happened. A broken or
    // missing language server may not turn a successful write into a failure.
    const { diagnose } = await import("../src/lsp/client.ts");
    const f = join(dir, "a.ts");
    writeFileSync(f, "const x = 1;\n");
    const servers = { broken: { command: "/nonexistent/definitely-not-a-server", extensions: [".ts"] } };
    expect(await diagnose(f, "const x = 1;\n", { servers, cwd: dir, timeoutMs: 2_000 })).toBeNull();
  });

  test("a server that exits immediately degrades to null", async () => {
    const { diagnose } = await import("../src/lsp/client.ts");
    const f = join(dir, "b.ts");
    writeFileSync(f, "const y = 2;\n");
    // `true` starts, says nothing, exits 0 — the "server crashed on startup" shape
    const servers = { silent: { command: "true", extensions: [".ts"] } };
    expect(await diagnose(f, "const y = 2;\n", { servers, cwd: dir, timeoutMs: 2_000 })).toBeNull();
  });

  test("a server that never answers initialize gives up at the deadline", async () => {
    const { diagnose } = await import("../src/lsp/client.ts");
    const f = join(dir, "c.ts");
    writeFileSync(f, "const z = 3;\n");
    // holds stdin open, writes nothing: the "hung server" shape. Without a
    // deadline this would block the edit forever.
    const servers = { hang: { command: "sleep", args: ["30"], extensions: [".ts"] } };
    const t0 = Date.now();
    expect(await diagnose(f, "const z = 3;\n", { servers, cwd: dir, timeoutMs: 1_500 })).toBeNull();
    expect(Date.now() - t0).toBeLessThan(10_000);
  }, 20_000);
});

// The real thing, once, against a real server. Everything above is a stand-in for
// this; this is the only test that can catch a wrong `initialize` shape, a
// misread `publishDiagnostics`, or a version-bump mistake in didChange.
const TSLS = Bun.which("typescript-language-server");
/** This repo's own typescript, which the fixture lends to its temp project. */
const TS_LIB = join(import.meta.dir, "..", "node_modules", "typescript");
const CAN_RUN = !!TSLS && existsSync(TS_LIB);

/**
 * A temp project a real tsserver will actually analyze. Both halves are load-bearing,
 * and each fails *silently* if omitted — measured, not guessed:
 *   - no resolvable `typescript` → `initialize` returns -32603 "Could not find a
 *     valid TypeScript installation" and every file looks clean forever.
 *   - a file outside tsconfig's `include` → zero diagnostics and no error at all.
 */
function tsProject(): string {
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  symlinkSync(TS_LIB, join(dir, "node_modules", "typescript"), "dir");
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, target: "esnext", module: "esnext", moduleResolution: "bundler" },
      include: ["."],
    }),
  );
  return dir;
}

describe.skipIf(!CAN_RUN)("diagnose: end to end against typescript-language-server", () => {
  test("reports a real type error, then reports it fixed", async () => {
    const { diagnose, shutdownLsp } = await import("../src/lsp/client.ts");
    tsProject();
    const f = join(dir, "sub.ts");
    const broken = "export function f(n: number): string {\n  return n;\n}\n";
    writeFileSync(f, broken);

    try {
      const out = await diagnose(f, broken, { cwd: dir });
      expect(out).not.toBeNull();
      expect(out).toContain("sub.ts:2:3");
      expect(out).toMatch(/2322/); // not assignable
      expect(out).toContain("diagnostics (typescript,");

      // and the same server, warm, sees the fix. Verified by sabotage: force the
      // didChange branch to send didOpen instead and this line fails with the
      // stale error still reported — i.e. the model gets told its fix did not take.
      const fixed = "export function f(n: number): string {\n  return String(n);\n}\n";
      writeFileSync(f, fixed);
      expect(await diagnose(f, fixed, { cwd: dir })).toBeNull();
    } finally {
      await shutdownLsp();
    }
  }, 60_000);

  test("edit surfaces diagnostics in its tool result", async () => {
    // the actual user-visible behavior: the model edits, and the result tells it
    // what broke, without being asked
    const F = await import("../src/tools/files.ts");
    const { shutdownLsp } = await import("../src/lsp/client.ts");
    tsProject();
    const rel = "target.ts";
    writeFileSync(join(dir, rel), "export const n: number = 1;\n");
    let pty: unknown;
    const ctx = {
      sessionId: "s", cwd: dir, readFiles: new Set([join(dir, rel)]),
      get pty() { return pty; }, set pty(v: unknown) { pty = v; },
    } as any;

    try {
      const r = await F.editRun({ path: rel, oldString: "= 1;", newString: '= "not a number";' }, ctx);
      expect(r.ok).toBe(true); // the edit succeeded; diagnostics are information, not failure
      expect(r.output).toContain("edited target.ts");
      expect(r.output).toContain("diagnostics (typescript,");
      expect(r.output).toMatch(/target\.ts:1:14/);
    } finally {
      await shutdownLsp();
    }
  }, 60_000);

  test("diagnostics: false skips the server entirely", async () => {
    const F = await import("../src/tools/files.ts");
    const { liveServerCount } = await import("../src/lsp/client.ts");
    tsProject();
    const rel = "off.ts";
    let pty: unknown;
    const ctx = {
      sessionId: "s", cwd: dir, readFiles: new Set<string>(), diagnostics: false,
      get pty() { return pty; }, set pty(v: unknown) { pty = v; },
    } as any;
    const r = await F.writeRun({ path: rel, content: "export const s: string = 42;\n" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).not.toContain("diagnostics (");
    expect(liveServerCount()).toBe(0);
  });
});

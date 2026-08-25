import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDef } from "../providers/types.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import { fail, ok } from "./types.ts";
import { applyEdits, syntaxWarning, type EditOp } from "./patch.ts";
import { diagnose } from "../lsp/client.ts";

const execFileP = promisify(execFile);
export const READ_CAP = 50_000; // chars
export const OUT_CAP = 30_000;
export const MAX_READ_BYTES = 10_000_000;

/**
 * What to append to an edit/write result about the state of the file afterwards.
 *
 * A language server is authoritative when one answers: it type-checks, so it
 * catches the errors that matter, and its output supersedes the transpiler's
 * parse check. `syntaxWarning` stays as the fallback for when no server is
 * configured, not installed, or silent — without it, a `.py` edit on a machine
 * with no pyright would lose the one check fox used to do.
 */
async function afterWrite(path: string, absPath: string, content: string, ctx: ToolContext): Promise<string> {
  if (ctx.diagnostics !== false) {
    const diags = await diagnose(absPath, content, { servers: ctx.lsp, cwd: ctx.cwd });
    if (diags) return `\n${diags}`;
  }
  const warn = syntaxWarning(path, content);
  return warn ? `\n${warn}` : "";
}

function cap(s: string, note = "… (truncated)"): string {
  return s.length > OUT_CAP ? s.slice(0, OUT_CAP) + note : s;
}

function sniffBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function isImage(p: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|ico)$/i.test(p);
}

// ---------- read ----------

export const readDef: ToolDef = {
  name: "read",
  description:
    "Read a text file. Returns line-numbered content (n: line). Caps at 2000 lines / 50KB. Refuses binary files.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path (absolute or relative to cwd)" },
      offset: { type: "number", description: "1-based start line" },
      limit: { type: "number", description: "Max lines to return" },
    },
    required: ["path"],
  },
};

export async function readRun(args: { path: string; offset?: number; limit?: number }, ctx: ToolContext): Promise<ToolResult> {
  const p = resolve(ctx.cwd, args.path);
  let buf: Buffer;
  try {
    const st = statSync(p);
    if (st.isDirectory()) return fail(`error: ${args.path} is a directory`);
    if (st.size > MAX_READ_BYTES) return fail(`error: ${args.path} is ${(st.size / 1e6).toFixed(1)}MB — too large for read; use exec to slice it`);
    buf = readFileSync(p);
  } catch (e) {
    return fail(`error: cannot read ${args.path}: ${(e as Error).message}`);
  }
  if (isImage(p)) return fail(`error: ${args.path} looks like an image (${buf.length} bytes); vision input is not wired up yet`);
  if (sniffBinary(buf)) return fail(`error: ${args.path} is binary (${buf.length} bytes)`);

  ctx.readFiles.add(p);
  const raw = buf.toString("utf8");
  let lines = raw.split("\n");
  const total = lines.length;
  const off = Math.max(1, args.offset ?? 1);
  lines = lines.slice(off - 1);
  if (args.limit) lines = lines.slice(0, args.limit);
  lines = lines.slice(0, 2000);

  let out = "";
  for (let i = 0; i < lines.length; i++) {
    const l = `${off + i}: ${lines[i]}\n`;
    if (out.length + l.length > READ_CAP) return ok(cap(out, `\n… truncated at line ${off + i} of ${total} total`));
    out += l;
  }
  const body = out.trimEnd() || "(empty file)";
  return ok(off > 1 || body.length < raw.length ? `${body}\n(${total} lines total)` : body);
}

// ---------- write ----------

export const writeDef: ToolDef = {
  name: "write",
  description: "Write a file (creates parent dirs). Overwriting an existing file requires reading it first. The result reports any type errors the new contents cause.",
  parameters: {
    type: "object",
    properties: { path: { type: "string" }, content: { type: "string" } },
    required: ["path", "content"],
  },
};

export async function writeRun(args: { path: string; content: string }, ctx: ToolContext): Promise<ToolResult> {
  const p = resolve(ctx.cwd, args.path);
  let exists = false;
  try {
    statSync(p);
    exists = true;
  } catch {}
  if (exists && !ctx.readFiles.has(p)) {
    return fail(`error: ${args.path} exists and was not read this turn — read it before overwriting`);
  }
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, args.content);
  ctx.readFiles.add(p);
  // write used to report nothing about what it produced, so a newly created file
  // with a type error looked identical to a clean one
  return ok(`wrote ${args.path} (${Buffer.byteLength(args.content)} bytes)${await afterWrite(args.path, p, args.content, ctx)}`);
}

// ---------- edit ----------

export const editDef: ToolDef = {
  name: "edit",
  description:
    'Edit a file. Pass edits:[{oldString,newString,replaceAll?}] (multiple changes applied in order) or the legacy single oldString/newString. Exact-match first; falls back to whitespace-tolerant match preserving relative indentation. The result reports any type errors your change caused, so do not run a type-checker separately just to see them.',
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      edits: {
        type: "array",
        items: {
          type: "object",
          properties: {
            oldString: { type: "string" },
            newString: { type: "string" },
            replaceAll: { type: "boolean" },
          },
          required: ["oldString", "newString"],
        },
        description: "Batch of replacements applied in order",
      },
      oldString: { type: "string" },
      newString: { type: "string" },
      replaceAll: { type: "boolean" },
    },
    required: ["path"],
  },
};

export async function editRun(
  args: { path: string; edits?: EditOp[]; oldString?: string; newString?: string; replaceAll?: boolean },
  ctx: ToolContext,
): Promise<ToolResult> {
  const p = resolve(ctx.cwd, args.path);
  if (!ctx.readFiles.has(p)) return fail(`error: read ${args.path} before editing`);

  const ops: EditOp[] =
    args.edits && args.edits.length
      ? args.edits
      : args.oldString !== undefined && args.newString !== undefined
        ? [{ oldString: args.oldString, newString: args.newString, replaceAll: args.replaceAll }]
        : [];
  if (!ops.length) return fail("error: provide edits[] or oldString+newString");

  let raw: string;
  try {
    raw = readFileSync(p, "utf8");
  } catch (e) {
    return fail(`error: ${(e as Error).message}`);
  }

  try {
    const { content, applied, fuzzy } = applyEdits(raw, ops);
    writeFileSync(p, content);
    return ok(
      `edited ${args.path} (${applied} replacement${applied === 1 ? "" : "s"}${fuzzy ? `, ${fuzzy} via whitespace-tolerant match` : ""})${await afterWrite(args.path, p, content, ctx)}`,
    );
  } catch (e) {
    return fail((e as Error).message.startsWith("edit:") ? (e as Error).message : `error: edit failed: ${(e as Error).message}`);
  }
}

// ---------- glob ----------

export const globDef: ToolDef = {
  name: "glob",
  description: "Find files by wildcard pattern (e.g. src/**/*.ts). Caps at 200 results.",
  parameters: {
    type: "object",
    properties: { pattern: { type: "string" }, path: { type: "string", description: "Base dir (default cwd)" } },
    required: ["pattern"],
  },
};

export async function globRun(args: { pattern: string; path?: string }, ctx: ToolContext): Promise<ToolResult> {
  const base = resolve(ctx.cwd, args.path ?? ".");
  const g = new Bun.Glob(args.pattern);
  const found: string[] = [];
  for await (const f of g.scan({ cwd: base, dot: false })) {
    found.push(f.split("\\").join("/"));
    if (found.length >= 200) break;
  }
  found.sort();
  return ok(found.length ? cap(found.join("\n")) : "(no matches)");
}

// ---------- grep ----------

export const grepDef: ToolDef = {
  name: "grep",
  description: "Search file contents with a regex. Output 'path:line: match'. Uses ripgrep when available. Caps output.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string" },
      path: { type: "string", description: "Dir or file (default cwd)" },
      include: { type: "string", description: "Glob filter e.g. '*.ts'" },
    },
    required: ["pattern"],
  },
};

export async function grepRun(args: { pattern: string; path?: string; include?: string }, ctx: ToolContext): Promise<ToolResult> {
  const p = resolve(ctx.cwd, args.path ?? ".");
  let re: RegExp;
  try {
    re = new RegExp(args.pattern);
  } catch (e) {
    return fail(`error: bad pattern: ${(e as Error).message}`);
  }

  const rg = Bun.which("rg");
  if (rg) {
    const argv = ["--line-number", "--no-heading", "--color", "never", "--max-count", "5", "--glob", "!.git"];
    if (!args.include) argv.push("--glob", "!node_modules");
    if (args.include) argv.push("--glob", args.include);
    argv.push(args.pattern, p);
    try {
      const { stdout } = await execFileP(rg, argv, { maxBuffer: 64 * 1024 * 1024, timeout: 30_000 });
      return ok(cap(stdout.trimEnd()) || "(no matches)");
    } catch (e: any) {
      if (e.code === 1) return ok("(no matches)");
      // fall through to walker on other failures
    }
  }
  return ok(walkGrep(re, p, args.include));
}

const SKIP_DIRS = new Set([".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", ".next"]);

function walkGrep(re: RegExp, root: string, include?: string): string {
  const out: string[] = [];
  const includeRe = include ? new Bun.Glob(include) : null;

  const walk = (dir: string) => {
    if (out.length >= 300) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries.sort()) {
      if (out.length >= 300) return;
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(name) && !name.startsWith(".")) walk(full);
        continue;
      }
      if (!st.isFile() || st.size > 2_000_000) continue;
      if (includeRe && !includeRe.match(name)) continue;
      try {
        const buf = readFileSync(full);
        if (sniffBinary(buf.subarray(0, 4000))) continue;
        const lines = buf.toString("utf8").split("\n");
        for (let i = 0; i < lines.length && out.length < 300; i++) {
          if (re.test(lines[i])) out.push(`${full}:${i + 1}: ${lines[i].trim().slice(0, 300)}`);
        }
      } catch {}
    }
  };

  try {
    if (statSync(root).isFile()) {
      const buf = readFileSync(root);
      if (!sniffBinary(buf.subarray(0, 4000))) {
        buf
          .toString("utf8")
          .split("\n")
          .forEach((l, i) => {
            if (re.test(l) && out.length < 300) out.push(`${root}:${i + 1}: ${l.trim().slice(0, 300)}`);
          });
      }
    } else walk(root);
  } catch {}

  return out.length ? out.join("\n") : "(no matches)";
}

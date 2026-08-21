import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDef } from "../provider/openai.ts";
import type { ToolContext } from "./index.ts";

const execFileP = promisify(execFile);
export const READ_CAP = 50_000; // chars
export const OUT_CAP = 30_000;

function cap(s: string, note = "… (truncated)"): string {
  return s.length > OUT_CAP ? s.slice(0, OUT_CAP) + note : s;
}

// ---------- read ----------
export const readDef: ToolDef = {
  name: "read",
  description: "Read a text file. Returns line-numbered content (n: line). Caps at 2000 lines / 50KB.",
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

export async function readRun(args: { path: string; offset?: number; limit?: number }, ctx: ToolContext): Promise<string> {
  const p = resolve(ctx.cwd, args.path);
  let raw: string;
  try {
    raw = readFileSync(p, "utf8");
  } catch (e) {
    return `error: cannot read ${args.path}: ${(e as Error).message}`;
  }
  ctx.readFiles.add(p);
  let lines = raw.split("\n");
  const total = lines.length;
  const off = Math.max(1, args.offset ?? 1);
  lines = lines.slice(off - 1);
  if (args.limit) lines = lines.slice(0, args.limit);
  lines = lines.slice(0, 2000);

  let out = "";
  for (let i = 0; i < lines.length; i++) {
    const l = `${off + i}: ${lines[i]}\n`;
    if (out.length + l.length > READ_CAP) return cap(out, `\n… truncated at ${off + i}/${total} lines`);
    out += l;
  }
  return cap(out.trimEnd() || "(empty file)");
}

// ---------- write ----------
export const writeDef: ToolDef = {
  name: "write",
  description: "Write a file (creates parent dirs). Overwriting an existing file requires reading it first.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
  },
};

export async function writeRun(args: { path: string; content: string }, ctx: ToolContext): Promise<string> {
  const p = resolve(ctx.cwd, args.path);
  let exists = false;
  try {
    statSync(p);
    exists = true;
  } catch {}
  if (exists && !ctx.readFiles.has(p)) {
    return `error: ${args.path} exists and was not read this session — read it before overwriting`;
  }
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, args.content);
  ctx.readFiles.add(p);
  return `wrote ${args.path} (${args.content.length} bytes)`;
}

// ---------- edit ----------
export const editDef: ToolDef = {
  name: "edit",
  description: "Exact-string replace in a file. File must have been read this session. Fails if oldString is not found or not unique.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" },
      oldString: { type: "string" },
      newString: { type: "string" },
      replaceAll: { type: "boolean", description: "Replace every occurrence (default false)" },
    },
    required: ["path", "oldString", "newString"],
  },
};

export async function editRun(
  args: { path: string; oldString: string; newString: string; replaceAll?: boolean },
  ctx: ToolContext,
): Promise<string> {
  const p = resolve(ctx.cwd, args.path);
  if (!ctx.readFiles.has(p)) return `error: read ${args.path} before editing`;
  let raw: string;
  try {
    raw = readFileSync(p, "utf8");
  } catch (e) {
    return `error: ${(e as Error).message}`;
  }
  const count = raw.split(args.oldString).length - 1;
  if (count === 0) return `error: oldString not found in ${args.path}`;
  if (count > 1 && !args.replaceAll) return `error: oldString matches ${count} times; pass replaceAll:true or add context`;
  const next = args.replaceAll ? raw.replaceAll(args.oldString, args.newString) : raw.replace(args.oldString, args.newString);
  writeFileSync(p, next);
  return `edited ${args.path} (${count} occurrence${count > 1 ? "s" : ""})`;
}

// ---------- glob ----------
export const globDef: ToolDef = {
  name: "glob",
  description: "Find files by wildcard pattern (e.g. src/**/*.ts). Caps at 200 results.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string" },
      path: { type: "string", description: "Base dir (default cwd)" },
    },
    required: ["pattern"],
  },
};

export async function globRun(args: { pattern: string; path?: string }, ctx: ToolContext): Promise<string> {
  const base = resolve(ctx.cwd, args.path ?? ".");
  const g = new Bun.Glob(args.pattern);
  const found: string[] = [];
  for await (const f of g.scan({ cwd: base, dot: false })) {
    found.push(f);
    if (found.length >= 200) break;
  }
  return cap(found.length ? found.join("\n") : "(no matches)");
}

// ---------- grep ----------
export const grepDef: ToolDef = {
  name: "grep",
  description: "Search file contents with a regex. Output 'path:line: match'. Caps output.",
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

export async function grepRun(args: { pattern: string; path?: string; include?: string }, ctx: ToolContext): Promise<string> {
  const p = resolve(ctx.cwd, args.path ?? ".");
  const argv = ["-rIn", "-E", "--exclude-dir=.git"];
  if (args.include) argv.push(`--include=${args.include}`);
  argv.push(args.pattern, p);
  try {
    const { stdout } = await execFileP("grep", argv, { maxBuffer: 64 * 1024 * 1024, timeout: 30_000 });
    return cap(stdout.trimEnd() || "(no matches)");
  } catch (e: any) {
    if (e.code === 1) return "(no matches)";
    return cap(`error: ${e.message?.slice(0, 200)}`);
  }
}

import { mkdirSync, readFileSync, readdirSync, statSync, lstatSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDef } from "../providers/types.ts";
import { lookupModel } from "../providers/models.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import { fail, ok } from "./types.ts";
import { applyEdits, syntaxWarning, type EditOp } from "./patch.ts";
import { diagnose } from "../lsp/client.ts";

const execFileP = promisify(execFile);
/**
 * The `read` tool's per-result text cap (chars). Configurable (`readCap` in
 * config, applied by `buildRegistry`); module-level for the same reason as
 * OUT_CAP below — `read` reads it directly and threading it through ToolContext
 * would touch signatures for a constant nobody changes mid-turn. Distinct from
 * OUT_CAP: `read` pages by line, so it wants its own larger ceiling before the
 * shared tail-cap applies.
 */
let READ_CAP_VALUE = 50_000;
export function readCap(): number {
  return READ_CAP_VALUE;
}
export function setReadCap(n: number): void {
  if (Number.isFinite(n) && n >= 1000) READ_CAP_VALUE = Math.floor(n);
}
export const MAX_READ_BYTES = 10_000_000;

/**
 * Tool output cap. Configurable (`toolOutputCap` in config, applied by
 * `buildRegistry`); module-level because every tool reads it and threading a
 * number through ToolContext would touch a dozen signatures for a constant
 * nobody changes mid-turn.
 */
let OUT_CAP = 30_000;
/** The cap tools should apply to one result's text. */
export function outCap(): number {
  return OUT_CAP;
}
export function setOutputCap(n: number): void {
  if (Number.isFinite(n) && n >= 1000) OUT_CAP = Math.floor(n);
}

/**
 * What to append to an edit/write result about the state of the file afterwards.
 *
 * A language server is authoritative when one answers: it type-checks, so it
 * catches the errors that matter, and its output supersedes the transpiler's
 * parse check. `syntaxWarning` stays as the fallback for when no server is
 * configured, not installed, or silent — without it, a `.py` edit on a machine
 * with no pyright would lose the one check fox-agent used to do.
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

/** Media files `read` can attach for a capable model, by extension -> [kind, IANA type]. */
type MediaKind = "image" | "video" | "audio" | "pdf";
const MEDIA_TYPES: Record<string, [MediaKind, string]> = {
  png: ["image", "image/png"],
  jpg: ["image", "image/jpeg"],
  jpeg: ["image", "image/jpeg"],
  gif: ["image", "image/gif"],
  webp: ["image", "image/webp"],
  bmp: ["image", "image/bmp"],
  ico: ["image", "image/x-icon"],
  avif: ["image", "image/avif"],
  mp4: ["video", "video/mp4"],
  webm: ["video", "video/webm"],
  mov: ["video", "video/quicktime"],
  mkv: ["video", "video/x-matroska"],
  avi: ["video", "video/x-msvideo"],
  mp3: ["audio", "audio/mpeg"],
  wav: ["audio", "audio/wav"],
  ogg: ["audio", "audio/ogg"],
  flac: ["audio", "audio/flac"],
  m4a: ["audio", "audio/mp4"],
  aac: ["audio", "audio/aac"],
  // documents: `pdf` is its own catalog modality (see models.ts ModelInfo.pdf),
  // NOT a flavour of `vision` — plenty of vision models take an image and
  // refuse a pdf, so gating this on vision would attach a file the endpoint
  // then rejects with an opaque 400.
  pdf: ["pdf", "application/pdf"],
};

function mediaTypeOf(p: string): [MediaKind, string] | null {
  const ext = p.split(".").pop()?.toLowerCase() ?? "";
  return MEDIA_TYPES[ext] ?? null;
}

/**
 * Does the active model accept this kind of media input? Fails safe (false)
 * with no provider config: an attachment a text-only model cannot parse would
 * be dropped silently or fail the whole request. Shared by `read` and `fetch`.
 */
export function modelAcceptsMedia(kind: MediaKind, ctx: ToolContext): boolean {
  if (!ctx.providerCfg?.model) return false;
  const info = lookupModel(ctx.providerCfg.model);
  return kind === "image" ? !!info.vision : kind === "video" ? !!info.video : kind === "audio" ? !!info.audio : !!info.pdf;
}

// ---------- read ----------

export const readDef: ToolDef = {
  name: "read",
  description:
    "Read a file's contents. Text returns line-numbered (n: line) output; use offset/limit to page through a large file. Image/audio/video/pdf attach as media when the model accepts that kind (otherwise an error says so); other binary files are refused.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" },
      offset: { type: "number", description: "1-based start line" },
      limit: { type: "number", description: "Max lines to return (page through a large file)" },
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
  const media = mediaTypeOf(p);
  if (media) {
    const [kind, mimeType] = media;
    const info = ctx.providerCfg?.model;
    if (!modelAcceptsMedia(kind, ctx)) {
      return fail(
        `error: ${args.path} is ${kind} (${mimeType}, ${buf.length} bytes) and the current model (${info ?? "unknown"}) does not accept ${kind} input`,
      );
    }
    return {
      ok: true,
      output: `${args.path}: ${mimeType}, ${(buf.length / 1024).toFixed(1)} KB — attached as ${kind} content below`,
      media: [{ mimeType, data: buf.toString("base64"), filename: basename(p) }],
    };
  }
  if (sniffBinary(buf)) return fail(`error: ${args.path} is binary (${buf.length} bytes)`);

  const raw = buf.toString("utf8");
  let lines = raw.split("\n");
  const total = lines.length;
  const off = Math.max(1, args.offset ?? 1);
  lines = lines.slice(off - 1);
  // The caller's limit is the budget; it used to be silently re-capped at 2000
  // lines, so `limit: 5000` returned 2000 and looked complete. Keep a guard
  // against a pathological ask, but SAY when it bites instead of hiding it.
  const asked = args.limit && args.limit > 0 ? Math.floor(args.limit) : undefined;
  const HARD_LINE_GUARD = 2000;
  let withheldFromGuard = 0;
  if (asked !== undefined) lines = lines.slice(0, asked);
  if (lines.length > HARD_LINE_GUARD) {
    withheldFromGuard = lines.length - HARD_LINE_GUARD;
    lines = lines.slice(0, HARD_LINE_GUARD);
  }

  let out = "";
  for (let i = 0; i < lines.length; i++) {
    const l = `${off + i}: ${lines[i]}\n`;
    if (out.length + l.length > readCap()) return ok(cap(out, `\n… truncated at line ${off + i} of ${total} total`));
    out += l;
  }
  const body = out.trimEnd() || "(empty file)";
  const lastShown = off + lines.length - 1;
  const more = total > lastShown;
  // name what was held back and how to get it — a bare "(N lines total)" after
  // a cut listing reads as the whole file to a model that is skimming
  const notes = [
    withheldFromGuard > 0 ? `${withheldFromGuard} more line(s) beyond the ${HARD_LINE_GUARD}-line guard — use offset/limit to page` : "",
    more && withheldFromGuard === 0 ? `${total} lines total; showed through line ${lastShown} — continue with offset: ${lastShown + 1}` : "",
    more && withheldFromGuard > 0 ? `${total} lines total` : "",
  ].filter(Boolean);
  return ok(notes.length ? `${body}\n(${notes.join("; ")})` : body);
}

// ---------- write ----------

export const writeDef: ToolDef = {
  name: "write",
  description: "Write a file (creates parent dirs; overwrites in place).",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" },
      content: { type: "string", description: "Full new contents of the file" },
    },
    required: ["path", "content"],
  },
};

export async function writeRun(args: { path: string; content: string }, ctx: ToolContext): Promise<ToolResult> {
  const p = resolve(ctx.cwd, args.path);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, args.content);
  // write used to report nothing about what it produced, so a newly created file
  // with a type error looked identical to a clean one
  return ok(`wrote ${args.path} (${Buffer.byteLength(args.content)} bytes)${await afterWrite(args.path, p, args.content, ctx)}`);
}

// ---------- edit ----------

export const editDef: ToolDef = {
  name: "edit",
  description:
    "Edit a file. Pass edits:[{oldString,newString,replaceAll?}] (multiple changes applied in order) or a single oldString/newString. Exact-match first; falls back to whitespace-tolerant match preserving relative indentation.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" },
      edits: {
        type: "array",
        items: {
          type: "object",
          properties: {
            oldString: { type: "string", description: "Exact text to find" },
            newString: { type: "string", description: "Replacement text" },
            replaceAll: { type: "boolean", description: "Replace every occurrence instead of the first" },
          },
          required: ["oldString", "newString"],
        },
        description: "Batch of replacements applied in order",
      },
      oldString: { type: "string", description: "Text to find" },
      newString: { type: "string", description: "Replacement text" },
      replaceAll: { type: "boolean", description: "Replace every occurrence" },
    },
    required: ["path"],
  },
};

export async function editRun(
  args: { path: string; edits?: EditOp[]; oldString?: string; newString?: string; replaceAll?: boolean },
  ctx: ToolContext,
): Promise<ToolResult> {
  const p = resolve(ctx.cwd, args.path);

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
  description: "Find files by wildcard pattern (e.g. src/**/*.ts). Pass limit to cap the number of results (default 500).",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Wildcard pattern, e.g. src/**/*.ts" },
      path: { type: "string", description: "Base dir (default cwd)" },
      limit: { type: "number", description: "Max results to return, default 500" },
    },
    required: ["pattern"],
  },
};

/**
 * Default result cap for glob/grep.
 *
 * These used to hard-cap at 200 matches and silently truncate the rest — a
 * listing the model had no way to page through and no way to know was cut.
 * A caller-chosen `limit` replaces that: the model decides how much it can
 * afford, and when it does hit the cap the result SAYS so (truncated, more
 * available) instead of reading as the complete set.
 */
const SEARCH_LIMIT_DEFAULT = 500;

export async function globRun(args: { pattern: string; path?: string; limit?: number }, ctx: ToolContext): Promise<ToolResult> {
  const base = resolve(ctx.cwd, args.path ?? ".");
  const g = new Bun.Glob(args.pattern);
  const limit = Math.max(1, Math.floor(args.limit ?? SEARCH_LIMIT_DEFAULT));
  const found: string[] = [];
  let truncated = false;
  for await (const f of g.scan({ cwd: base, dot: false })) {
    if (found.length >= limit) {
      truncated = true;
      break;
    }
    found.push(f.split("\\").join("/"));
  }
  found.sort();
  if (!found.length) return ok("(no matches)");
  return ok(truncated ? `${found.join("\n")}\n… (truncated at ${limit} results — narrow the pattern or raise limit)` : found.join("\n"));
}

// ---------- grep ----------

export const grepDef: ToolDef = {
  name: "grep",
  description: "Search file contents with a regex. Output 'path:line: match'. Uses ripgrep when available. Pass limit to cap matches (default 500).",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex to match" },
      path: { type: "string", description: "Dir or file (default cwd)" },
      include: { type: "string", description: "Glob filter e.g. '*.ts'" },
      limit: { type: "number", description: "Max matches to return, default 500" },
    },
    required: ["pattern"],
  },
};

export async function grepRun(args: { pattern: string; path?: string; include?: string; limit?: number }, ctx: ToolContext): Promise<ToolResult> {
  const p = resolve(ctx.cwd, args.path ?? ".");
  let re: RegExp;
  try {
    re = new RegExp(args.pattern);
  } catch (e) {
    return fail(`error: bad pattern: ${(e as Error).message}`);
  }
  const limit = Math.max(1, Math.floor(args.limit ?? SEARCH_LIMIT_DEFAULT));

  const rg = Bun.which("rg");
  if (rg) {
    const argv = ["--line-number", "--no-heading", "--color", "never", "--max-count", "5", "--glob", "!.git"];
    if (!args.include) argv.push("--glob", "!node_modules");
    if (args.include) argv.push("--glob", args.include);
    // `--` so a pattern like `--files` is searched, not parsed as a flag.
    // `-e` so a pattern starting with `-` is always a pattern.
    argv.push("-e", args.pattern, "--", p);
    try {
      const { stdout } = await execFileP(rg, argv, { maxBuffer: 64 * 1024 * 1024, timeout: 30_000 });
      // one pass, then slice: rg's own `--max-count` is PER FILE, so it cannot
      // bound a whole-repo search. The listing is cut at the caller's limit and
      // says so — an unannounced cut reads as "that is all of them", which is
      // how a model concludes a symbol has no other callers.
      const lines = stdout.split("\n").filter(Boolean);
      if (!lines.length) return ok("(no matches)");
      if (lines.length <= limit) return ok(lines.join("\n"));
      return ok(`${lines.slice(0, limit).join("\n")}\n… (truncated at ${limit} of ${lines.length}+ matches — narrow the pattern, add include, or raise limit)`);
    } catch (e: any) {
      if (e.code === 1) return ok("(no matches)");
      // fall through to walker on other failures
    }
  }
  return ok(walkGrep(re, p, args.include, limit));
}

const SKIP_DIRS = new Set([".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", ".next"]);

function walkGrep(re: RegExp, root: string, include: string | undefined, limit: number): string {
  const out: string[] = [];
  let truncated = false; // a further match existed past `limit` — say so, like the rg path
  const includeRe = include ? new Bun.Glob(include) : null;
  const seen = new Set<string>();
  const MAX_DEPTH = 20;

  const walk = (dir: string, depth: number) => {
    if (out.length >= limit && truncated) return; // already full AND noted: stop
    if (depth > MAX_DEPTH) return;
    // resolve the real path so a symlink loop (ln -s . loop) terminates
    let real = dir;
    try {
      real = realpathSync(dir);
    } catch {
      return;
    }
    if (seen.has(real)) return;
    seen.add(real);
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries.sort()) {
      if (out.length >= limit && truncated) return;
      const full = join(dir, name);
      let st;
      try {
        // lstat: never follow a symlinked dir into a loop; symlinked files are
        // still read via readFileSync below (open follows the link once).
        st = lstatSync(full);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) {
        // Skip symlinked directories entirely; symlinked files are treated as
        // files only if they are small (stat follows once for the size check).
        try {
          const t = statSync(full);
          if (t.isDirectory()) continue;
          if (!t.isFile() || t.size > 2_000_000) continue;
        } catch {
          continue;
        }
      } else if (st.isDirectory()) {
        if (!SKIP_DIRS.has(name) && !name.startsWith(".")) walk(full, depth + 1);
        continue;
      } else if (!st.isFile() || st.size > 2_000_000) {
        continue;
      }
      if (includeRe && !includeRe.match(name)) continue;
      try {
        const buf = readFileSync(full);
        if (sniffBinary(buf.subarray(0, 4000))) continue;
        const lines = buf.toString("utf8").split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (!re.test(lines[i])) continue;
          if (out.length < limit) out.push(`${full}:${i + 1}: ${lines[i].trim().slice(0, 300)}`);
          else truncated = true; // a match existed past the cap: the result is incomplete
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
            if (!re.test(l)) return;
            if (out.length < limit) out.push(`${root}:${i + 1}: ${l.trim().slice(0, 300)}`);
            else truncated = true; // a match existed past the cap: incomplete
          });
      }
    } else walk(root, 0);
  } catch {}

  if (!out.length) return "(no matches)";
  return truncated
    ? `${out.slice(0, limit).join("\n")}\n… (truncated at ${limit} of ${out.length}+ matches — narrow the pattern, add include, or raise limit)`
    : out.join("\n");
}

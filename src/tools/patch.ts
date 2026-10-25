// Edit application with exact-match fast path and an indent-tolerant fuzzy
// fallback (leading whitespace per line may differ; relative indentation of
// newString is preserved). Multi-edit batches are applied sequentially.
import { ToolError } from "../core/errors.ts";

export interface EditOp {
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface FuzzyMatch {
  text: string; // full matched text
  index: number; // offset in raw
  /** leading whitespace the matched first line actually has in `raw` */
  rawIndent: string;
  /** leading whitespace of oldString's first line (what the caller wrote) */
  oldIndent: string;
  /** rawIndent minus oldIndent — what every FOLLOWING line must gain */
  indentDelta: string;
}

/** Leading whitespace of a string's first line. */
function leadingIndent(s: string): string {
  return /^[ \t]*/.exec(s)?.[0] ?? "";
}

/** Leading-whitespace-tolerant single match. Returns null unless unique. */
function fuzzyFind(raw: string, oldString: string): FuzzyMatch[] {
  const lines = oldString.split("\n");
  // per line: optional leading indent, escaped body, tolerant trailing ws,
  // terminated by newline or EOF. The leading `^` (with the `m` flag) anchors
  // the match to a LINE START: without it `[ \t]*` matches zero characters and
  // the body happily matches the tail of a longer token, so oldString "foo"
  // rewrote the "foo" in "xfoo" and corrupted the line around it.
  const pattern =
    "^" +
    lines
      .map((l) => {
        const body = escapeRe(l.replace(/[ \t]+$/, ""));
        if (body === "") return "[ \\t]*(?:\\n|$)";
        return `[ \\t]*${body}[ \\t]*(?:\\n|$)`;
      })
      .join("");
  let re: RegExp;
  try {
    re = new RegExp(pattern, "gm");
  } catch {
    return [];
  }
  const out: FuzzyMatch[] = [];
  const oldIndent = leadingIndent(oldString);
  for (const m of raw.matchAll(re)) {
    if (m.index === undefined) continue;
    const matched = m[0];
    const rawIndent = leadingIndent(raw.slice(m.index));
    out.push({ text: matched, index: m.index, rawIndent, oldIndent, indentDelta: subtractIndent(rawIndent, oldIndent) });
    if (out.length > 1) break;
  }
  return out;
}

function subtractIndent(a: string, b: string): string {
  if (a.startsWith(b)) return a.slice(b.length);
  return a.length >= b.length ? a.slice(b.length) : "";
}

/**
 * Put a fuzzy replacement back at the depth the match had in the file.
 *
 * The match CONSUMED the first line's leading whitespace (the pattern starts
 * with `[ \t]*`), so it has to be restored — and this is where the old code
 * was wrong: it re-indented every line EXCEPT the first, so a caller who wrote
 * oldString dedented (the usual reason the exact match failed in the first
 * place) got its first replacement line pushed to column 0:
 *
 *     function f() {
 *     const a = 2;      <- was indented by two spaces
 *
 * The first line is placed at `rawIndent`, plus whatever extra depth the
 * caller's own first line carries relative to oldString's, so a deliberately
 * re-nested replacement still moves as far as it was written to move.
 */
function reindent(newString: string, m: FuzzyMatch): string {
  const lines = newString.split("\n");
  const newIndent = leadingIndent(lines[0]);
  const extra = newIndent.startsWith(m.oldIndent) ? newIndent.slice(m.oldIndent.length) : "";
  const out = [m.rawIndent + extra + lines[0].slice(newIndent.length)];
  for (let i = 1; i < lines.length; i++) {
    out.push(lines[i].trim() === "" ? lines[i] : m.indentDelta + lines[i]);
  }
  return out.join("\n");
}

const stripTrailingNl = (s: string) => s.replace(/\n$/, "");

export function applyEdits(raw: string, ops: EditOp[]): { content: string; applied: number; fuzzy: number } {
  let content = raw;
  let applied = 0;
  let fuzzy = 0;

  for (const op of ops) {
    if (!op.oldString) throw new ToolError("edit: empty oldString");
    if (op.oldString === op.newString) throw new ToolError("edit: oldString equals newString");

    const needle = stripTrailingNl(op.oldString);
    const replacement = op.newString;

    if (op.replaceAll) {
      const n = content.split(needle).length - 1;
      if (n === 0) throw new ToolError(`edit: oldString not found`);
      content = content.split(needle).join(replacement);
      applied += n;
      continue;
    }

    const count = content.split(needle).length - 1;
    if (count === 1) {
      content = content.replace(needle, () => replacement);
      applied++;
      continue;
    }
    if (count > 1) throw new ToolError(`edit: oldString matches ${count} times; add surrounding context or pass replaceAll`);

    // exact miss -> fuzzy path
    const matches = fuzzyFind(content, needle);
    if (matches.length !== 1) {
      if (matches.length === 0) throw new ToolError("edit: oldString not found (exact or whitespace-insensitive)");
      throw new ToolError("edit: oldString matches multiple times even ignoring indentation; add context");
    }
    const fm = matches[0];
    const matchedBody = stripTrailingNl(fm.text);
    content = content.slice(0, fm.index) + reindent(replacement, fm) + content.slice(fm.index + matchedBody.length);
    applied++;
    fuzzy++;
  }

  return { content, applied, fuzzy };
}

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/** Best-effort syntax sanity check after edits. Returns a warning or null. */
export function syntaxWarning(path: string, content: string): string | null {
  if (!CODE_EXT.test(path)) return null;
  try {
    const loader = path.endsWith(".ts") || path.endsWith(".tsx") ? "tsx" : "js";
    const transpiler = new Bun.Transpiler({ loader: loader as "tsx" | "js" });
    transpiler.transformSync(content);
    return null;
  } catch (e) {
    return `warning: edited file may not parse: ${(e as Error).message.slice(0, 200)}`;
  }
}

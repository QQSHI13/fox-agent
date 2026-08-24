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
  indentDelta: string; // leading ws of match minus leading ws of oldString's first line
}

/** Leading-whitespace-tolerant single match. Returns null unless unique. */
function fuzzyFind(raw: string, oldString: string): FuzzyMatch[] {
  const lines = oldString.split("\n");
  // per line: optional leading indent, escaped body, tolerant trailing ws,
  // terminated by newline or EOF
  const pattern = lines
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
  for (const m of raw.matchAll(re)) {
    if (m.index === undefined) continue;
    const matched = m[0];
    const rawFirstIndent = /^[ \t]*/.exec(raw.slice(m.index))?.[0] ?? "";
    const oldFirstIndent = /^[ \t]*/.exec(oldString)?.[0] ?? "";
    out.push({ text: matched, index: m.index, indentDelta: subtractIndent(rawFirstIndent, oldFirstIndent) });
    if (out.length > 1) break;
  }
  return out;
}

function subtractIndent(a: string, b: string): string {
  if (a.startsWith(b)) return a.slice(b.length);
  return a.length >= b.length ? a.slice(b.length) : "";
}

function reindent(newString: string, delta: string): string {
  if (!delta) return newString;
  const lines = newString.split("\n");
  return lines.map((l, i) => (i === 0 || l.trim() === "" ? l : delta + l)).join("\n");
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
    content = content.slice(0, fm.index) + reindent(replacement, fm.indentDelta) + content.slice(fm.index + matchedBody.length);
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

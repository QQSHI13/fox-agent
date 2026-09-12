/**
 * `@path` mentions in a message, and drag-and-drop.
 *
 * Terminals deliver a dropped file as pasted text — a bare path, a quoted path,
 * or a `file://` URI. `droppedPath` recognizes those; the TUI inserts an
 * `@path` token, and `expandMentions` inlines the file's text at send time, so
 * the model reads the contents rather than a path it then has to `read`.
 *
 * Text files only, and small ones: a binary or a megabyte log belongs to the
 * `read` tool, which can slice it.
 */
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const MAX_FILE_BYTES = 64_000;
const MAX_TOTAL_BYTES = 200_000;

/** A dropped/pasted token as a real file path, or null. */
export function droppedPath(tok: string, cwd: string): string | null {
  let t = tok.trim();
  if (!t || /\n/.test(t)) return null;
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) t = t.slice(1, -1);
  if (t.startsWith("file://")) {
    try {
      t = decodeURIComponent(new URL(t).pathname);
    } catch {
      return null;
    }
  }
  if (t.startsWith("~/") || t === "~") t = homedir() + t.slice(1);
  const p = resolve(cwd, t);
  try {
    return statSync(p).isFile() ? p : null;
  } catch {
    return null;
  }
}

function sniffBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8192).includes(0);
}

/**
 * Replace every `@path` that names a real text file with a fenced block of its
 * contents. Unknown or oversized tokens stay literal — a tweet handle is not a
 * file mention.
 */
export function expandMentions(text: string, cwd: string): { text: string; files: string[] } {
  const files: string[] = [];
  let total = 0;
  const out = text.replace(/@(\S+)/g, (m, tok: string) => {
    const p = droppedPath(tok, cwd);
    if (!p || total >= MAX_TOTAL_BYTES) return m;
    let buf: Buffer;
    try {
      buf = readFileSync(p);
    } catch {
      return m;
    }
    if (buf.length > MAX_FILE_BYTES || sniffBinary(buf)) return m;
    total += buf.length;
    files.push(p);
    return `\n\n--- ${p} ---\n\`\`\`\n${buf.toString("utf8")}\n\`\`\`\n`;
  });
  return { text: out, files };
}

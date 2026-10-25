/**
 * Small filesystem/questions answered the same way everywhere.
 *
 * Both helpers existed twice (skills + trust, file reads + @mentions) and the
 * copies had already drifted — one sniffed 8000 bytes, the other 8192 — so a
 * fix to "what counts as binary" would have landed in one of them.
 */
import { statSync } from "node:fs";

export function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * A NUL byte in the head means binary, which no tool should hand to the model as
 * text. 8192 bytes is the usual heuristic window; a file whose only NUL sits
 * past it reads as text, which is the accepted trade (paging a huge binary is
 * the tools' own concern).
 */
export function sniffBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8192).includes(0);
}

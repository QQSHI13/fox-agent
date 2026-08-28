/**
 * The slice of LSP fox-agent actually uses, and how a diagnostic is rendered for the
 * model.
 *
 * fox-agent is not an editor: it never asks for completions, hovers or code actions.
 * It wants one thing — "did the edit I just made break anything" — so this file
 * describes diagnostics and nothing else.
 */

/** LSP `DiagnosticSeverity`. 1 is the worst; 4 is a hint. */
export const SEVERITY = { error: 1, warning: 2, information: 3, hint: 4 } as const;

export interface Diagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity?: number;
  code?: string | number;
  source?: string;
  message: string;
}

/** How many diagnostics one tool result may carry before the rest are counted instead. */
export const MAX_REPORTED = 12;

/**
 * Only errors and warnings reach the model.
 *
 * Hints (severity 4) are the "declared but never read" class, which fires
 * constantly and legitimately mid-refactor: a function written in one edit and
 * called in the next is unused for exactly one turn. Reporting those trains the
 * model to chase noise, and it costs tokens on every single edit.
 */
export function reportable(d: Diagnostic): boolean {
  const sev = d.severity ?? SEVERITY.error; // absent severity means unspecified; treat as an error
  return sev === SEVERITY.error || sev === SEVERITY.warning;
}

const LABEL: Record<number, string> = { 1: "error", 2: "warning", 3: "info", 4: "hint" };

/**
 * Render diagnostics as a block appended to an `edit`/`write` result, or null
 * when there is nothing worth saying.
 *
 * LSP line/character are 0-based; every human-facing line/column in fox-agent (`read`'s
 * gutter, `grep` output, editor jump targets) is 1-based, so they are converted
 * here. Getting this wrong is invisible in tests that only check for a substring
 * and infuriating in use.
 */
export function formatDiagnostics(rel: string, server: string, all: Diagnostic[]): string | null {
  const shown = all.filter(reportable);
  if (!shown.length) return null;
  shown.sort((a, b) => a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character);
  const errors = shown.filter((d) => (d.severity ?? 1) === SEVERITY.error).length;
  const warnings = shown.length - errors;
  const counts = [errors && `${errors} error${errors === 1 ? "" : "s"}`, warnings && `${warnings} warning${warnings === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(", ");

  const lines = shown.slice(0, MAX_REPORTED).map((d) => {
    const where = `${rel}:${d.range.start.line + 1}:${d.range.start.character + 1}`;
    const code = d.code === undefined ? "" : ` ${d.code}`;
    // multi-line messages (TS overload dumps, rustc explanations) are collapsed:
    // the first line names the problem and the rest is usually the same
    // information restated per candidate
    const msg = d.message.split("\n")[0].trim();
    return `  ${where} ${LABEL[d.severity ?? 1] ?? "error"}${code}  ${msg}`;
  });
  if (shown.length > MAX_REPORTED) lines.push(`  … and ${shown.length - MAX_REPORTED} more`);
  return `diagnostics (${server}, ${counts}):\n${lines.join("\n")}`;
}

/**
 * fox-agent's own debug log. Anything diagnostic that is NOT part of the chat
 * transcript — provider error bodies, internal stack traces, frame-loop faults —
 * goes here, so the TUI never has to choose between printing a raw error over
 * its own grid and losing the information. The transcript keeps one friendly
 * line; this file keeps the truth.
 *
 * Capped by rotation, not truncation: at CAP the file becomes debug.log.old and
 * a fresh one starts, so a flood cannot grow it without bound and the previous
 * run's tail survives.
 */
import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { agentHome } from "./paths.ts";

const CAP = 5_000_000; // bytes

export function debugLogPath(): string {
  return join(agentHome(), "debug.log");
}

export function debugLog(label: string, detail?: unknown): void {
  try {
    mkdirSync(agentHome(), { recursive: true });
    const p = debugLogPath();
    try {
      if (statSync(p).size > CAP) renameSync(p, `${p}.old`);
    } catch {}
    const body = detail === undefined ? "" : detail instanceof Error ? (detail.stack ?? detail.message) : String(detail);
    appendFileSync(p, `[${new Date().toISOString()}] ${label}${body ? `\n${body}\n` : "\n"}`);
  } catch {
    // the log must never become a failure of its own — a full disk is not a crash
  }
}

/**
 * Windows Subsystem for Linux: where Windows executables are reachable through
 * interop, and where the clipboard is the one thing a Linux-side tool cannot
 * own.
 *
 * Used by the copy path (tui/app.ts clipWrite) to reorder the clipboard probes.
 * On WSL the native Linux writers are either absent or (without WSLg) pointed at
 * a display that does not exist, while two routes that DO work are sitting right
 * there: Windows Terminal's OSC 52 support, and PowerShell. Detection matters
 * because the wrong order costs a spawn per copy and, on the shared timeout,
 * silently loses.
 */
import { readFileSync } from "node:fs";

/**
 * Env markers first — cheapest, and the only ones visible when /proc is not
 * mounted (a container, a restricted sandbox).
 */
function hasEnvMarker(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.WSL_DISTRO_NAME || env.WSLENV || env.WSL_INTEROP);
}

/**
 * `/proc/version` carries `microsoft` / `wsl` on every WSL1 and WSL2 kernel,
 * including when the env markers have been scrubbed. Overridable for tests so
 * the suite is host-independent (a bare-Linux CI runner has no real marker).
 */
function hasProcMarker(procVersion: string | null = readProcVersion()): boolean {
  return !!procVersion && /microsoft|wsl/i.test(procVersion);
}

function readProcVersion(): string | null {
  try {
    return readFileSync("/proc/version", "utf8");
  } catch {
    return null;
  }
}

let cached: boolean | null = null;

/** Cached: the kernel cannot change under a running process. */
export function isWSL(env: NodeJS.ProcessEnv = process.env, procVersion?: string | null): boolean {
  if (cached === null) cached = hasEnvMarker(env) || hasProcMarker(procVersion);
  return cached;
}

/** Test seam: drop the cached answer so a suite can flip the environment. */
export function resetWslCache(): void {
  cached = null;
}

/**
 * Windows Terminal, whose OSC 52 `c` (clipboard) selector writes the Windows
 * clipboard directly — no helper process, no interop round trip.
 *
 * Only meaningful on WSL; on a remote or container session the client terminal
 * is what matters, and that is handled separately by the caller.
 */
export function isWindowsTerminal(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.WT_SESSION);
}

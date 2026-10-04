/**
 * Which shell the harness actually runs commands in.
 *
 * Never hardcoded. Two things must agree on the answer — the `exec` tool's
 * description (so the model writes syntax the shell understands) and every
 * spawn — and the machine it runs on has no reason to be Linux: macOS ships
 * bash 3.2 at /bin/bash with zsh as the login shell, and a minimal container
 * may have /bin/sh and nothing else. `$SHELL` is the user's own answer; when it
 * is unset (a service, a CI job, a stripped container) or points at something
 * that is no longer there, fall back down a platform-appropriate chain to a
 * shell that is actually executable.
 *
 * Every candidate speaks `-c <command>`, which is the only invocation the
 * harness uses — POSIX sh, bash, zsh, dash and fish all take it.
 */
import { accessSync, constants } from "node:fs";

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function candidates(): string[] {
  const list: string[] = [];
  if (process.env.SHELL) list.push(process.env.SHELL);
  // macOS's login shell first there, /bin/bash first on Linux — zsh is the
  // platform default only on darwin
  list.push(...(process.platform === "darwin" ? ["/bin/zsh", "/bin/bash"] : ["/bin/bash", "/bin/zsh"]));
  // /bin/sh is the one path POSIX guarantees
  list.push("/bin/sh");
  return list;
}

/** Absolute path of the shell to spawn, always executable. */
export function shellPath(): string {
  return candidates().find(executable) ?? "/bin/sh";
}

/** Bare name (`zsh`, `bash`) — what the prompt and tool descriptions read best as. */
export function shellName(): string {
  const path = shellPath();
  return path.slice(path.lastIndexOf("/") + 1) || path;
}

/**
 * The built-in tools that ship AS plugins. Same `FoxPlugin` shape a third-party
 * module exports, loaded through the same merge path in `buildRegistry`, so:
 *
 *   - a user plugin can shadow one of these by name (later registration wins,
 *     with a warning) exactly the way it shadows any other tool;
 *   - `disabledPlugins = ["pty"]` turns one off without touching code;
 *   - the pty plugin demonstrates the lifecycle seam: its tmux session is
 *     released from `onSessionEnd`, not from a special case in the harness.
 */
import type { FoxPlugin } from "./types.ts";
import { ptyDef, drivePty, cleanupPty, ptySessionName } from "../tools/pty.ts";
import { todoDef, todoRun } from "../tools/todo.ts";
import { fetchDef, fetchRun } from "../tools/fetch.ts";

const ptyPlugin: FoxPlugin = {
  name: "bundled:pty",
  tools: [{ def: ptyDef, run: drivePty }],
  hooks: {
    // tmux sessions outlive the fox-agent turn that made them; the hook is what
    // ties their lifetime to the session's, on exit AND on session switch
    onSessionEnd: (c) => cleanupPty(ptySessionName(c.sessionId)),
  },
};

const todoPlugin: FoxPlugin = { name: "bundled:todo", tools: [{ def: todoDef, run: todoRun }] };
const fetchPlugin: FoxPlugin = { name: "bundled:fetch", tools: [{ def: fetchDef, run: fetchRun }] };

/** All bundled plugins. Order matters only for shadowing: user plugins load after. */
export function bundledPlugins(): FoxPlugin[] {
  return [ptyPlugin, todoPlugin, fetchPlugin];
}

/**
 * Does a disabledPlugins entry name this bundled plugin? Accepts "pty" and
 * "bundled:pty" alike — the prefix is our namespacing, not the user's problem.
 */
export function bundledDisabled(name: string, disabled: string[]): boolean {
  const short = name.replace(/^bundled:/, "");
  return disabled.some((d) => d === name || d === short);
}

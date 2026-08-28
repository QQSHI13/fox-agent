/**
 * A plugin that exercises all three extension points at once.
 *
 * Written as a real module loaded off disk by `loadPlugins`, not an object handed
 * to `pluginsOverride`, because the loader is half of what is under test: the
 * dynamic import, the shape validation, and the `~`/relative path resolution only
 * happen for a file.
 *
 * The side effects are files rather than in-memory state. A plugin is imported
 * into a *separate* module graph from the test's when the test spawns a real fox-agent
 * binary, so a counter exported from here would read 0 no matter what fired.
 * A file in `FOX_AGENT_PLUGIN_LOG`'s directory is observable from both.
 */
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import type { FoxPlugin } from "../../src/plugins/types.ts";
import { ok } from "../../src/tools/types.ts";

export const PING_OUTPUT = "pong from the plugin";
export const APPENDED_SYSTEM = "PLUGIN_SYSTEM_MARKER: the plugin appended this.";
export const AFTER_TOOL_PREFIX = "[patched by plugin] ";

/**
 * Record that a hook fired, in the directory `FOX_AGENT_PLUGIN_LOG` names *now*.
 *
 * Read per call, not once at module scope. A plugin module is imported once and
 * then cached — by Bun's module registry, which `resetPlugins()` cannot clear —
 * so a `const LOG_DIR = process.env...` would freeze to whatever the first test's
 * temp directory was and every later test would read an empty log while the hooks
 * were in fact firing.
 */
function note(line: string) {
  const dir = process.env.FOX_AGENT_PLUGIN_LOG;
  if (!dir) return;
  try {
    appendFileSync(join(dir, "hooks.log"), `${line}\n`);
  } catch {
    // a fixture that cannot write its log must not fail the turn — the assertion
    // belongs in the test, and a throw here would instead exercise runHook
  }
}

const plugin: FoxPlugin = {
  name: "fixture",

  tools: [
    {
      def: {
        name: "ping",
        description: "A tool contributed by a plugin. Returns a fixed string.",
        parameters: { type: "object", properties: {} },
      },
      async run() {
        note("tool:ping");
        return ok(PING_OUTPUT);
      },
    },
  ],

  hooks: {
    onSessionStart(c) {
      note(`onSessionStart:${c.sessionId}:${c.model}`);
    },
    beforeLLMCall(c) {
      note(`beforeLLMCall:step=${c.step}:messages=${c.messages.length}:tools=${c.tools.length}`);
      return { appendSystem: APPENDED_SYSTEM };
    },
    afterTool(c) {
      note(`afterTool:${c.name}:ok=${c.ok}`);
      // rewrites rather than appends, so a test can tell the patched output from
      // the original by absence as well as by presence
      return { output: `${AFTER_TOOL_PREFIX}${c.output}` };
    },
  },

  providers: {
    // a provider that answers without a network, so `provider = "fixture-echo"`
    // in a config is a resolvable, runnable choice
    async *["fixture-echo"](cfg, messages) {
      note(`provider:fixture-echo:${messages.length}`);
      yield { type: "text" as const, delta: `echo(${cfg.model})` };
      yield { type: "usage" as const, prompt_tokens: 3, completion_tokens: 2 };
      yield { type: "done" as const, reason: "stop" };
    },
  },
};

export default plugin;

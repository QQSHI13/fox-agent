/**
 * Tool types re-exported from core/tool.ts (the vocabulary home) plus the
 * runtime helpers (`validateArgs`, `ok`, `fail`) that are tool-logic, not
 * types. Everything that builds or calls a tool imports from here; the types
 * themselves live in core so the MCP pool, plugins, and providers can
 * reference them without importing the tool implementations.
 */
import type { ToolDef } from "../providers/types.ts";
import type { PtyState, Tool, ToolContext, ToolResult } from "../core/tool.ts";

// Re-export the vocabulary so existing `import { ... } from "./types.ts"` works.
export type { PtyState, Tool, ToolContext, ToolResult };

/**
 * Reject arguments the tool's schema does not declare.
 *
 * A tool used to run with whatever the model sent it: unknown keys were dropped
 * silently, so `task({job:"t3", signal:"kill"})` — which `task` has never
 * supported, unlike `exec` — answered with a normal "still running" line and the
 * caller retried the same doomed call forever. An unknown key is always a
 * mistake (typo, or a field copied from a sibling tool), and running anyway
 * hides it behind a plausible-looking result.
 *
 * `additionalProperties: true` on the tool's own schema opts out, for a tool that
 * genuinely takes open-ended arguments; no built-in does (MCP's `arguments`
 * value is a declared property, whose nested contents are passed through
 * untouched).
 */
export function validateArgs(name: string, def: ToolDef, args: unknown): string | null {
  if (args === null || typeof args !== "object" || Array.isArray(args)) return `${name}: arguments must be a JSON object`;
  const params = (def.parameters ?? {}) as { properties?: Record<string, unknown>; required?: string[]; additionalProperties?: unknown };
  const props = params.properties ?? {};
  const obj = args as Record<string, unknown>;
  if (params.additionalProperties !== true) {
    const extra = Object.keys(obj).filter((k) => !(k in props));
    if (extra.length) {
      const list = extra.map((k) => `"${k}"`).join(", ");
      const known = Object.keys(props);
      return known.length
        ? `${name}: unknown argument${extra.length > 1 ? "s" : ""} ${list} — this tool accepts only: ${known.join(", ")}`
        : `${name}: unknown argument${extra.length > 1 ? "s" : ""} ${list} — this tool takes no arguments`;
    }
  }
  for (const key of params.required ?? []) {
    if (obj[key] === undefined) return `${name}: missing required argument "${key}"`;
  }
  return null;
}

export const ok = (output: string): ToolResult => ({ ok: true, output });
export const fail = (output: string): ToolResult => ({ ok: false, output });

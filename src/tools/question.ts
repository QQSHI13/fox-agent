/**
 * The `question` tool — the model asks the user structured questions mid-run
 * (opencode's pattern). A thin wrapper over the UiBridge that the interactive
 * host already puts on every ToolContext: selects render as the TUI's option
 * list, free text in the input dock, secrets masked — all UI exists; this just
 * makes it reachable from a tool call.
 *
 * On a headless host (`ctx.ui` absent: -p, ACP, tests) the tool fails with a
 * clear message instead of blocking on an answer that can never come — the
 * model is told to decide on its own, which is the correct default there.
 */
import type { Tool } from "./types.ts";
import type { ToolDef } from "../providers/types.ts";
import { ok, fail } from "./types.ts";
import type { UiStep } from "../core/ui.ts";

export const questionDef: ToolDef = {
  name: "question",
  description:
    "Ask the user one or more structured questions mid-run and wait for the answers. Use when a decision is the user's to make and guessing risks wasted work: which of two approaches to take, a missing required value, confirm-before-destructive. Each question is one step: a choose-one list ('select') or a line of free text. Prefer select with explicit options — the user answers in one keypress. Interactive hosts only; headless runs fail fast.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short heading shown above all questions, e.g. 'Auth approach'" },
      questions: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        description: "1-6 questions, asked in order",
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: "answers-map key you read in the result, e.g. 'approach'" },
            label: { type: "string", description: "the question text, e.g. 'Session storage: keep SQLite or move to files?'" },
            type: { type: "string", enum: ["select", "text"], description: "select = pick one option; text = free text line" },
            options: {
              type: "array",
              minItems: 2,
              description: "select only: 2-8 choices",
              items: {
                type: "object",
                properties: {
                  value: { type: "string", description: "what the answer map gets" },
                  label: { type: "string", description: "what the user sees (defaults to value)" },
                },
                required: ["value"],
              },
            },
            initial: { type: "string", description: "select: value to start on; text: prefill" },
            secret: { type: "boolean", description: "text only: mask typed characters (keys, tokens)" },
            allowEmpty: { type: "boolean", description: "default true; false makes an empty answer stay on the question" },
          },
          required: ["key", "label", "type"],
        },
      },
    },
    required: ["title", "questions"],
  },
};

export async function questionRun(args: any, ctx: import("./types.ts").ToolContext): Promise<import("./types.ts").ToolResult> {
  if (!ctx.ui) {
    return fail(
      "error: no interactive UI on this host (headless run) — no one can answer. Decide yourself using the context you have and say which assumption you made.",
    );
  }
  const qs: {
    key: string;
    label: string;
    type: "select" | "text";
    options?: { value: string; label?: string }[];
    initial?: string;
    secret?: boolean;
    allowEmpty?: boolean;
  }[] = args?.questions;
  if (!args?.title || typeof args.title !== "string" || !Array.isArray(qs) || qs.length === 0) {
    return fail("error: title (string) and questions (non-empty array) are required");
  }
  if (qs.length > 6) return fail("error: at most 6 questions per call");
  for (const q of qs) {
    if (!q.key || !q.label || (q.type !== "select" && q.type !== "text")) return fail(`error: question '${q.key}' needs key, label, type`);
    if (q.type === "select" && (!Array.isArray(q.options) || q.options.length < 2)) return fail(`error: select question '${q.key}' needs >= 2 options`);
  }

  // Map onto UiSteps. Selects get the "other…" escape hatch: the model listing
  // options cannot anticipate every answer, and the dock's free-text swap is
  // already built (core/ui.ts).
  const steps: UiStep[] = qs.map((q) =>
    q.type === "select"
      ? {
          key: q.key,
          label: q.label,
          kind: "select" as const,
          options: (q.options ?? []).map((o) => ({ value: o.value, label: o.label ?? o.value })),
          custom: true,
          initial: q.initial,
          allowEmpty: false,
        }
      : {
          key: q.key,
          label: q.label,
          kind: "text" as const,
          initial: q.initial,
          secret: q.secret === true,
          allowEmpty: q.allowEmpty !== false,
        },
  );

  const answers = await ctx.ui.wizard(args.title, steps);
  if (!answers) return fail("cancelled: the user dismissed the questions — treat this as 'do not proceed with the asked decision'");
  // A "custom" answer is raw text the user typed in place of the list; pass it
  // through as-is (the sentinel itself never becomes an answer — core/ui.ts
  // swaps it for the typed value before resolving).
  const lines = qs.map((q) => `${q.key}: ${answers[q.key] === undefined ? "(no answer)" : answers[q.key]}`);
  return ok(lines.join("\n"));
}

export const questionPlugin: import("../plugins/types.ts").FoxPlugin = {
  name: "bundled:question",
  tools: [{ def: questionDef, run: questionRun }],
};

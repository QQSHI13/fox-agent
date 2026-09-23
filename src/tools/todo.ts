import { kvGet, kvSet } from "../store/db.ts";
import type { ToolDef } from "../providers/types.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import { fail, ok } from "./types.ts";

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "done";
}

export const todoDef: ToolDef = {
  name: "todowrite",
  description:
    "Maintain your task list for the current session. Replaces the whole list each call. Current list is shown in your runtime header every step.",
  parameters: {
    type: "object",
    properties: {
      todos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            content: { type: "string" },
            status: { type: "string", enum: ["pending", "in_progress", "done"] },
          },
          required: ["content", "status"],
        },
      },
    },
    required: ["todos"],
  },
};

// ASCII markers (AGENTS.md convention — ballot-box glyphs like ☑ render as
// emoji on some terminals), and [x]/[~]/[ ] matches the markdown task-list
// syntax the tool result is rendered with.
const ICON = { pending: "[ ]", in_progress: "[~]", done: "[x]" };

/** Plain rendering — model-facing (runtime header in the system prompt). */
export function renderTodos(todos: TodoItem[] | null): string {
  if (!todos?.length) return "";
  return todos.map((t) => `${ICON[t.status] ?? "[ ]"} ${t.content}`).join("\n");
}

/**
 * GFM task-list markdown — display-facing. The TUI renders `[x]` as a
 * settled ✔, `[~]` as an in-flight ▸ with bold text, `[ ]` as an open ☐.
 */
const MD_MARK = { pending: "[ ]", in_progress: "[~]", done: "[x]" };

export function renderTodosMd(todos: TodoItem[] | null): string {
  if (!todos?.length) return "";
  return todos.map((t) => `- ${MD_MARK[t.status] ?? "[ ]"} ${t.content}`).join("\n");
}

export async function todoRun(args: { todos?: TodoItem[] }, ctx: ToolContext): Promise<ToolResult> {
  const todos = args.todos;
  if (!Array.isArray(todos)) return fail("error: todos must be an array");
  for (const t of todos) {
    if (typeof t.content !== "string" || !t.content.trim()) return fail("error: every todo needs non-empty content");
    if (!["pending", "in_progress", "done"].includes(t.status)) return fail(`error: bad status ${t.status}`);
  }
  kvSet(ctx.sessionId, "todos", todos);
  return ok(`todo list updated (${todos.filter((t) => t.status === "done").length}/${todos.length} done):\n${renderTodosMd(todos)}`);
}

export function getTodos(sessionId: string): TodoItem[] | null {
  return kvGet<TodoItem[]>(sessionId, "todos");
}

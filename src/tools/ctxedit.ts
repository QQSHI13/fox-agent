import { allMessages, appendOps, getMessage, type ViewOp } from "../store/db.ts";
import type { ToolDef } from "../providers/types.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import { fail, ok } from "./types.ts";

export const ctxEditDef: ToolDef = {
  name: "ctx_edit",
  description:
    "Edit your own context window (view only — nothing is deleted from storage). Messages appear to you as [mN] markers. delete hides nodes from future turns (optional summary keeps a tiny note). replace rewrites a node's text. Batch multiple ops in one call.",
  parameters: {
    type: "object",
    properties: {
      ops: {
        type: "array",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: ["delete", "replace"] },
            ids: { type: "array", items: { type: "number" }, description: "delete: message seqs ([mN] -> N)" },
            summary: { type: "string", description: "delete: optional one-line summary kept in place of content" },
            id: { type: "number", description: "replace: message seq" },
            content: { type: "string", description: "replace: new content" },
          },
          required: ["op"],
        },
      },
      reason: { type: "string" },
    },
    required: ["ops"],
  },
};

function validateSeq(ctx: ToolContext, seq: number): string | null {
  if (typeof seq !== "number" || !Number.isInteger(seq)) return `error: invalid id ${seq}`;
  if (seq >= ctx.turnStartSeq) return `error: m${seq} belongs to the current turn and cannot be edited yet`;
  if (!getMessage(ctx.sessionId, seq)) return `error: no message m${seq}`;
  return null;
}

export async function ctxEditRun(args: { ops?: any[]; reason?: string }, ctx: ToolContext): Promise<ToolResult> {
  const ops = args.ops ?? [];
  if (!Array.isArray(ops) || !ops.length) return fail("error: empty ops");
  const viewOps: ViewOp[] = [];
  for (const o of ops) {
    if (o.op === "delete") {
      const ids: number[] = o.ids ?? [];
      if (!ids.length) return fail("error: delete needs ids");
      for (const seq of ids) {
        const bad = validateSeq(ctx, seq);
        if (bad) return fail(bad);
      }
      viewOps.push({ kind: "delete", ids, summary: o.summary });
    } else if (o.op === "replace") {
      const bad = validateSeq(ctx, o.id);
      if (bad) return fail(bad);
      if (typeof o.content !== "string") return fail("error: replace needs content");
      viewOps.push({ kind: "replace", id: o.id, content: o.content });
    } else {
      return fail(`error: unknown op ${o.op}`);
    }
  }
  appendOps(ctx.sessionId, viewOps);
  const total = allMessages(ctx.sessionId).length;
  const delCount = ops.filter((o: any) => o.op === "delete").reduce((a: number, o: any) => a + (o.ids?.length ?? 0), 0);
  const repCount = ops.length - ops.filter((o: any) => o.op === "delete").length;
  return ok(
    `ctx_edit ok: ${delCount} hidden, ${repCount} replaced (view now excludes them from next turn; log untouched, ${total} nodes stored).${args.reason ? ` reason: ${args.reason}` : ""}`,
  );
}

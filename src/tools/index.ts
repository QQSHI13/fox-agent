import type { ToolDef } from "../provider/openai.ts";
import { allMessages, appendOps, getMessage, type ViewOp } from "../store/db.ts";
import * as F from "./files.ts";
import { execDef, execRun } from "./exec.ts";

export interface ToolContext {
  sessionId: string;
  cwd: string;
  /** seq of the user message that started the current turn; nodes >= this are in-flight */
  turnStartSeq: number;
  readFiles: Set<string>;
  pty?: { session: string; cursor: number };
}

export interface Tool {
  def: ToolDef;
  run(args: any, ctx: ToolContext): Promise<string>;
}

// ---------- ctx_edit ----------
const ctxEditDef: ToolDef = {
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

async function ctxEditRun(args: { ops?: any[]; reason?: string }, ctx: ToolContext): Promise<string> {
  const ops = args.ops ?? [];
  if (!ops.length) return "error: empty ops";
  const viewOps: ViewOp[] = [];
  for (const o of ops) {
    if (o.op === "delete") {
      const ids: number[] = o.ids ?? [];
      if (!ids.length) return "error: delete needs ids";
      for (const seq of ids) {
        const bad = validateSeq(ctx, seq);
        if (bad) return bad;
      }
      viewOps.push({ kind: "delete", ids, summary: o.summary });
    } else if (o.op === "replace") {
      const bad = validateSeq(ctx, o.id);
      if (bad) return bad;
      if (typeof o.content !== "string") return "error: replace needs content";
      viewOps.push({ kind: "replace", id: o.id, content: o.content });
    } else {
      return `error: unknown op ${o.op}`;
    }
  }
  appendOps(ctx.sessionId, viewOps);
  const total = allMessages(ctx.sessionId).length;
  const delCount = ops.filter((o: any) => o.op === "delete").reduce((a: number, o: any) => a + (o.ids?.length ?? 0), 0);
  return `ctx_edit ok: ${delCount} hidden, ${ops.length - ops.filter((o: any) => o.op === "delete").length} replaced (view now excludes them from next turn; log untouched, ${total} nodes stored).${args.reason ? ` reason: ${args.reason}` : ""}`;
}

function validateSeq(ctx: ToolContext, seq: number): string | null {
  if (typeof seq !== "number" || !Number.isInteger(seq)) return `error: invalid id ${seq}`;
  if (seq >= ctx.turnStartSeq) return `error: m${seq} belongs to the current turn and cannot be edited yet`;
  if (!getMessage(ctx.sessionId, seq)) return `error: no message m${seq}`;
  return null;
}

export function registry(): Map<string, Tool> {
  const map = new Map<string, Tool>();
  const add = (def: ToolDef, run: (args: any, ctx: ToolContext) => Promise<string>) => map.set(def.name, { def, run });
  add(F.readDef, F.readRun);
  add(F.writeDef, F.writeRun);
  add(F.editDef, F.editRun);
  add(F.globDef, F.globRun);
  add(F.grepDef, F.grepRun);
  add(execDef, execRun);
  add(ctxEditDef, ctxEditRun);
  return map;
}

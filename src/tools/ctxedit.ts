import { allMessages, appendOps, getMessage, type ViewOp } from "../store/db.ts";
import { projectView } from "../context/view.ts";
import type { ToolDef } from "../providers/types.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import { fail, ok } from "./types.ts";

const SEARCH_DEFAULT_LIMIT = 30;
const SEARCH_MAX_LIMIT = 100;
const STATS_DEFAULT_TOP = 5;
const STATS_MAX_TOP = 20;

export const ctxDef: ToolDef = {
  name: "ctx",
  description:
    "Your own context window: view, search and surgically edit what you see (view only — storage is never touched). Messages appear as [mN] markers. search finds nodes by pattern and shows snippets instead of whole bodies — query instead of reading; stats shows sizes and the biggest nodes; delete hides nodes (optional summary keeps a tiny note); delete_by_query hides by pattern; replace rewrites text; restore un-hides. Batch multiple ops in one call.",
  parameters: {
    type: "object",
    properties: {
      ops: {
        type: "array",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: ["delete", "replace", "restore", "search", "delete_by_query", "stats"] },
            ids: { type: "array", items: { type: "number" }, description: "delete/restore: message seqs ([mN] -> N)" },
            summary: { type: "string", description: "delete: optional one-line summary kept in place of content" },
            id: { type: "number", description: "replace: message seq" },
            content: { type: "string", description: "replace: new content" },
            pattern: { type: "string", description: "search/delete_by_query: regex matched against one-line node text" },
            role: { type: "string", description: "search/delete_by_query: only this role (user, assistant, tool, think)" },
            limit: { type: "number", description: "search: max hits (default 30)" },
            top: { type: "number", description: "stats: how many biggest nodes to list (default 5)" },
            all: { type: "boolean", description: "delete_by_query: required when the pattern matches everything visible" },
          },
          required: ["op"],
        },
      },
      reason: { type: "string" },
    },
    required: ["ops"],
  },
};

/** Deprecated alias for ctx (delete/replace only) — use ctx. */
export const ctxEditDef: ToolDef = {
  name: "ctx_edit",
  description: "Deprecated alias for ctx — same delete/replace ops; prefer ctx (adds search, stats, restore, delete_by_query).",
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
  if (!getMessage(ctx.sessionId, seq)) return `error: no message m${seq}`;
  return null;
}

function compilePattern(pattern: unknown): { re: RegExp } | { error: string } {
  if (typeof pattern !== "string" || !pattern.trim()) return { error: "error: search needs a non-empty pattern" };
  try {
    return { re: new RegExp(pattern) };
  } catch (e) {
    return { error: `error: bad pattern: ${(e as Error).message}` };
  }
}

interface Hit {
  seq: number;
  role: string;
  snippet: string;
}

/** Visible nodes matching pattern — snippets, never bodies (query, don't read). */
function searchNodes(ctx: ToolContext, pattern: string, role?: string, limit = SEARCH_DEFAULT_LIMIT): { hits: Hit[] } | { error: string } {
  const compiled = compilePattern(pattern);
  if ("error" in compiled) return compiled;
  const cap = Math.max(1, Math.min(SEARCH_MAX_LIMIT, limit || SEARCH_DEFAULT_LIMIT));
  const hits: Hit[] = [];
  for (const n of projectView(ctx.sessionId).filter((x) => !x.deleted)) {
    if (hits.length >= cap) break;
    if (role && n.msg.role !== role) continue;
    const line = n.content.replace(/\s+/g, " ").trim();
    const at = line.search(compiled.re);
    if (at < 0) continue;
    const from = Math.max(0, at - 60);
    const slice = line.slice(from, from + 120);
    hits.push({ seq: n.msg.seq, role: n.msg.role, snippet: `${from > 0 ? "…" : ""}${slice}${from + 120 < line.length ? "…" : ""}` });
  }
  return { hits };
}

export async function ctxRun(args: { ops?: any[]; reason?: string }, ctx: ToolContext): Promise<ToolResult> {
  const ops = args.ops ?? [];
  if (!Array.isArray(ops) || !ops.length) return fail("error: empty ops");
  const viewOps: ViewOp[] = [];
  const out: string[] = [];
  let hidden = 0;
  let replaced = 0;
  let restored = 0;
  for (const o of ops) {
    if (o.op === "delete") {
      const ids: number[] = o.ids ?? [];
      if (!ids.length) return fail("error: delete needs ids");
      for (const seq of ids) {
        const bad = validateSeq(ctx, seq);
        if (bad) return fail(bad);
      }
      viewOps.push({ kind: "delete", ids, summary: o.summary });
      hidden += ids.length;
      out.push(`hidden: ${ids.map((s) => `m${s}`).join(", ")}`);
    } else if (o.op === "replace") {
      const bad = validateSeq(ctx, o.id);
      if (bad) return fail(bad);
      if (typeof o.content !== "string") return fail("error: replace needs content");
      viewOps.push({ kind: "replace", id: o.id, content: o.content });
      replaced++;
      out.push(`replaced: m${o.id}`);
    } else if (o.op === "restore") {
      const ids: number[] = o.ids ?? [];
      if (!ids.length) return fail("error: restore needs ids");
      for (const seq of ids) {
        const bad = validateSeq(ctx, seq);
        if (bad) return fail(bad);
      }
      viewOps.push({ kind: "restore", ids });
      restored += ids.length;
      out.push(`restored: ${ids.map((s) => `m${s}`).join(", ")}`);
    } else if (o.op === "search") {
      if (o.role !== undefined && typeof o.role !== "string") return fail("error: role must be a string");
      const found = searchNodes(ctx, o.pattern, o.role, o.limit);
      if ("error" in found) return fail(found.error);
      out.push(
        found.hits.length
          ? `search ${JSON.stringify(o.pattern)}: ${found.hits.length} match(es)\n${found.hits.map((h) => `[m${h.seq}] ${h.role} ${h.snippet}`).join("\n")}`
          : `search ${JSON.stringify(o.pattern)}: no matches`,
      );
    } else if (o.op === "delete_by_query") {
      if (o.role !== undefined && typeof o.role !== "string") return fail("error: role must be a string");
      const found = searchNodes(ctx, o.pattern, o.role, SEARCH_MAX_LIMIT);
      if ("error" in found) return fail(found.error);
      if (!found.hits.length) return fail(`error: delete_by_query matched nothing for ${JSON.stringify(o.pattern)}`);
      const visible = projectView(ctx.sessionId).filter((x) => !x.deleted).length;
      if (found.hits.length >= visible && !o.all) {
        return fail(`error: delete_by_query matches everything visible (${visible} nodes) — pass all:true to confirm`);
      }
      const ids = found.hits.map((h) => h.seq);
      viewOps.push({ kind: "delete", ids, summary: o.summary });
      hidden += ids.length;
      out.push(`hidden by query ${JSON.stringify(o.pattern)}: ${ids.map((s) => `m${s}`).join(", ")}`);
    } else if (o.op === "stats") {
      const nodes = projectView(ctx.sessionId).filter((x) => !x.deleted);
      const stored = allMessages(ctx.sessionId).length;
      const top = Math.max(1, Math.min(STATS_MAX_TOP, o.top || STATS_DEFAULT_TOP));
      const biggest = [...nodes]
        .map((n) => ({ seq: n.msg.seq, role: n.msg.role, chars: n.content.length, preview: n.content.replace(/\s+/g, " ").trim().slice(0, 80) }))
        .sort((a, b) => b.chars - a.chars)
        .slice(0, top);
      out.push(
        `context: ${nodes.length} visible of ${stored} stored (${stored - nodes.length} hidden)\n` +
          biggest.map((b) => `[m${b.seq}] ${b.role} ${b.chars} chars: ${b.preview}`).join("\n"),
      );
    } else {
      return fail(`error: unknown op ${o.op}`);
    }
  }
  if (viewOps.length) appendOps(ctx.sessionId, viewOps);
  const total = allMessages(ctx.sessionId).length;
  out.push(`ctx ok: ${hidden} hidden, ${replaced} replaced, ${restored} restored (view only; log untouched, ${total} nodes stored).${args.reason ? ` reason: ${args.reason}` : ""}`);
  return ok(out.join("\n"));
}

/** Deprecated alias entry point — delete/replace only; anything else names ctx. */
export async function ctxEditRun(args: { ops?: any[]; reason?: string }, ctx: ToolContext): Promise<ToolResult> {
  for (const o of args.ops ?? []) {
    if (o?.op !== "delete" && o?.op !== "replace") return fail(`error: unknown op ${o?.op} (ctx_edit supports delete/replace — use ctx)`);
  }
  return ctxRun(args, ctx);
}

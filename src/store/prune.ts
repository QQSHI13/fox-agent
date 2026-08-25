/**
 * Reclaim disk from context that is already invisible.
 *
 * Auto-compaction only *hides* messages: it appends a `delete` op and the bodies
 * stay in the log so `/undo` can bring them back. Over a long session that is
 * most of the file. Prune makes the hiding physical.
 *
 * The subtlety that makes this more than a DELETE: a compaction's summary is
 * stored on the op, but `renderContext` only emits it while the *first message
 * row of the hidden span* still exists (it hangs the "(ctx: [mN] summarized
 * away)" line off that node). Deleting every hidden row therefore drops the
 * summary from the prompt and silently loses the context the compaction was
 * meant to preserve. So each summarized span keeps its anchor row as an empty
 * stub, and only the bodies go.
 */
import { sessionDb } from "./db.ts";
import { projectView } from "../context/view.ts";
import type { DeleteOp, ViewOp } from "./db.ts";
import { allOps } from "./db.ts";

export interface PruneReport {
  /** rows whose body would be / was removed */
  messages: number;
  /** anchor rows blanked but kept so their summary still renders */
  stubs: number;
  /** orphaned usage rows removed */
  usage: number;
  bytesBefore: number;
  bytesAfter: number;
  /** false when nothing was written (dry run, or nothing to do) */
  applied: boolean;
}

function dbBytes(sessionId: string): number {
  const d = sessionDb(sessionId);
  const p = d.query("PRAGMA page_count").get() as { page_count: number };
  const s = d.query("PRAGMA page_size").get() as { page_size: number };
  return p.page_count * s.page_size;
}

/**
 * Seqs that must survive as stubs: the anchor of every summarized delete span.
 *
 * Mirrors `projectView`'s rule — the summary lands on the first node of the span
 * that was not already hidden — so the anchor computed here is the same row the
 * renderer will look for.
 */
function summaryAnchors(sessionId: string): Set<number> {
  const anchors = new Set<number>();
  const hidden = new Set<number>();
  for (const row of allOps(sessionId)) {
    let op: ViewOp;
    try {
      op = JSON.parse(row.payload) as ViewOp;
    } catch {
      continue;
    }
    if (op.kind === "restore") {
      for (const id of op.ids) hidden.delete(id);
      continue;
    }
    if (op.kind !== "delete") continue;
    const del = op as DeleteOp;
    let first = true;
    for (const id of del.ids) {
      if (hidden.has(id)) continue;
      hidden.add(id);
      if (del.summary && first) {
        anchors.add(id);
        first = false;
      }
    }
  }
  return anchors;
}

/**
 * Physically remove hidden message bodies. One-way: pruned text cannot be
 * restored by `/undo` afterward, though the op log itself is left intact so
 * projection still replays correctly.
 */
export function pruneSession(sessionId: string, opts: { dryRun?: boolean } = {}): PruneReport {
  const d = sessionDb(sessionId);
  const view = projectView(sessionId);
  const anchors = summaryAnchors(sessionId);

  // An orphan is hidden only as a *consequence* of its assistant being hidden
  // (pairing repair), not by an op. Pruning it is still correct — it cannot
  // become visible again while its assistant is gone — but it has no body worth
  // keeping either way, so it is treated like any other hidden row.
  const hidden = view.filter((n) => n.deleted).map((n) => n.msg.seq);
  // an anchor with an empty body is already a stub; re-blanking it frees nothing
  const toStub = hidden.filter((s) => anchors.has(s) && (view.find((n) => n.msg.seq === s)!.msg.content ?? "") !== "");
  const toDelete = hidden.filter((s) => !anchors.has(s));

  const bytesBefore = dbBytes(sessionId);
  if (opts.dryRun || (toDelete.length === 0 && toStub.length === 0)) {
    return {
      messages: toDelete.length,
      stubs: toStub.length,
      usage: countOrphanUsage(sessionId, toDelete),
      bytesBefore,
      bytesAfter: bytesBefore,
      applied: false,
    };
  }

  let usageRemoved = 0;
  d.transaction(() => {
    const blank = d.prepare("UPDATE messages SET content = '', tool_calls = NULL, tokens = 0 WHERE session_id = ? AND seq = ?");
    for (const seq of toStub) blank.run(sessionId, seq);

    const delUsage = d.prepare(
      "DELETE FROM usage WHERE session_id = ? AND message_id IN (SELECT id FROM messages WHERE session_id = ? AND seq = ?)",
    );
    const delMsg = d.prepare("DELETE FROM messages WHERE session_id = ? AND seq = ?");
    for (const seq of toDelete) {
      usageRemoved += (delUsage.run(sessionId, sessionId, seq) as { changes: number }).changes;
      delMsg.run(sessionId, seq);
    }
  })();

  // VACUUM is what actually returns pages to the filesystem, and SQLite refuses
  // to run it inside a transaction — hence outside the block above.
  d.exec("VACUUM;");
  return { messages: toDelete.length, stubs: toStub.length, usage: usageRemoved, bytesBefore, bytesAfter: dbBytes(sessionId), applied: true };
}

function countOrphanUsage(sessionId: string, seqs: number[]): number {
  if (!seqs.length) return 0;
  const d = sessionDb(sessionId);
  const r = d
    .query(
      `SELECT COUNT(*) AS n FROM usage WHERE session_id = ?1
         AND message_id IN (SELECT id FROM messages WHERE session_id = ?1 AND seq IN (${seqs.join(",")}))`,
    )
    .get(sessionId) as { n: number };
  return r.n;
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

/** Human-readable one-or-two lines for the slash command. */
export function formatPruneReport(r: PruneReport): string {
  if (!r.applied && r.messages === 0 && r.stubs === 0) {
    return `nothing to prune — no hidden context in this session (db ${kb(r.bytesBefore)})`;
  }
  if (!r.applied) {
    return [
      `/prune would delete ${r.messages} hidden message(s)${r.usage ? ` and ${r.usage} usage row(s)` : ""}`,
      r.stubs ? `, keeping ${r.stubs} summary anchor(s) as empty stubs` : "",
      `.\ndb is ${kb(r.bytesBefore)} now; VACUUM reclaims the freed pages.`,
      `\nThis is one-way: /undo can no longer restore the pruned text. Run "/prune yes" to do it.`,
    ].join("");
  }
  const freed = r.bytesBefore - r.bytesAfter;
  return `pruned ${r.messages} hidden message(s)${r.usage ? `, ${r.usage} usage row(s)` : ""}${
    r.stubs ? `, kept ${r.stubs} summary anchor(s)` : ""
  } — db ${kb(r.bytesBefore)} → ${kb(r.bytesAfter)} (${freed >= 0 ? "freed" : "grew"} ${kb(Math.abs(freed))})`;
}

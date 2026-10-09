/**
 * Reclaim disk from context that is already invisible.
 *
 * Auto-compaction only *hides* messages: it appends a `delete` op and the bodies
 * stay in the log so `/undo` can bring them back. Over a long session that is
 * most of the file. Prune makes the hiding physical.
 *
 * The subtlety that makes this more than a DELETE: a compaction's summary is
 * stored on the op, but `renderContext` only emits it while the *first message
 * row of the hidden span* still exists (it hangs the "(ctx: [N] summarized
 * away)" line off that node). Deleting every hidden row therefore drops the
 * summary from the prompt and silently loses the context the compaction was
 * meant to preserve. So each summarized span keeps its anchor row as an empty
 * stub, and only the bodies go.
 */
import { sessionDb, rid } from "./db.ts";
import { projectView, dropViewCache } from "../context/view.ts";
import { dropRenderCache } from "../context/render.ts";
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
  /** compact mode: summary rows spliced in, remaining seqs renumbered 1..n */
  compacted?: { summaries: number; renumbered: number };
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
 * Summarized spans, in anchor order: what compact mode turns into real rows.
 * Walks the op log exactly like summaryAnchors but keeps the summary text.
 */
function summarySpans(sessionId: string): { anchor: number; summary: string }[] {
  const out: { anchor: number; summary: string }[] = [];
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
        out.push({ anchor: id, summary: del.summary });
        first = false;
      }
    }
  }
  return out.sort((a, b) => a.anchor - b.anchor);
}

/**
 * Physically remove hidden message bodies. One-way: pruned text cannot be
 * restored by `/undo` afterward, though the op log itself is left intact so
 * projection still replays correctly.
 *
 * `mode: "compact"` goes further: the summary anchors are deleted too, each
 * span's summary is spliced back in as a REAL assistant row at the span's old
 * position, the op log is cleared (projection of the surviving rows is then
 * trivially "all visible" — remapping stale op seqs onto renumbered rows could
 * otherwise un-delete the WRONG row), and the remaining seqs are renumbered to
 * a contiguous 1..n so transcript markers carry no gaps. Even more one-way
 * than the default mode: /undo history goes with the op log.
 */
export function pruneSession(
  sessionId: string,
  opts: { dryRun?: boolean; mode?: "default" | "compact" } = {},
): PruneReport {
  const d = sessionDb(sessionId);
  const view = projectView(sessionId);
  const compact = opts.mode === "compact";
  const anchors = compact ? new Set<number>() : summaryAnchors(sessionId);

  // An orphan is hidden only as a *consequence* of its assistant being hidden
  // (pairing repair), not by an op. Pruning it is still correct — it cannot
  // become visible again while its assistant is gone — but it has no body worth
  // keeping either way, so it is treated like any other hidden row.
  const hidden = view.filter((n) => n.deleted).map((n) => n.msg.seq);
  // compact mode deletes anchors outright (their summary comes back as a real
  // row); default mode blanks and keeps them so renderContext keeps hanging
  // the summary off the anchor node
  const toStub = compact ? [] : hidden.filter((s) => anchors.has(s) && (view.find((n) => n.msg.seq === s)!.msg.content ?? "") !== "");
  const toDelete = compact ? hidden : hidden.filter((s) => !anchors.has(s));
  const spans = compact ? summarySpans(sessionId) : [];

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

  let compacted: PruneReport["compacted"] | undefined;
  if (compact) {
    // Summaries come back as real rows at their span's old position, then the
    // survivors are renumbered 1..n. Renumbering must not collide with the
    // unique (session_id, seq) index mid-rewrite, so everything first shifts
    // into a high offset range no new seq can reach, then the final numbers
    // are assigned in one descending pass.
    d.transaction(() => {
      const summaries = spans.length
        ? d.prepare("INSERT INTO messages (id, seq, session_id, parent_id, role, content, tokens, created_at) VALUES (?, ?, ?, NULL, 'assistant', ?, 0, ?)")
        : null;
      const remaining = d
        .prepare("SELECT id, seq FROM messages WHERE session_id = ? ORDER BY seq")
        .all(sessionId) as { id: string; seq: number }[];
      // splice synthetic summary rows at their anchor positions: before the
      // first surviving row that followed the anchor (the anchor opened the span)
      type Row = { id: string; seq: number; summary?: string };
      const ordered: Row[] = [];
      let si = 0;
      for (const r of remaining) {
        while (si < spans.length && spans[si].anchor < r.seq) {
          ordered.push({ id: `sum-${spans[si].anchor}-${rid().slice(-8)}`, seq: spans[si].anchor, summary: spans[si].summary });
          si++;
        }
        ordered.push(r);
      }
      while (si < spans.length) {
        ordered.push({ id: `sum-${spans[si].anchor}-${rid().slice(-8)}`, seq: spans[si].anchor, summary: spans[si].summary });
        si++;
      }

      const shift = d.prepare("UPDATE messages SET seq = seq + 1000000 WHERE session_id = ?");
      shift.run(sessionId);
      const setSeq = d.prepare("UPDATE messages SET seq = ? WHERE session_id = ? AND id = ?");
      for (let i = ordered.length - 1; i >= 0; i--) {
        const r = ordered[i];
        if (r.summary !== undefined) summaries!.run(r.id, i + 1, sessionId, r.summary, Date.now());
        else setSeq.run(i + 1, sessionId, r.id);
      }

      // the op log references old seqs; remapping stale deletes onto the
      // renumbered rows could un-delete the WRONG row, so the log goes and
      // projection becomes "everything visible"
      d.prepare("DELETE FROM ops WHERE session_id = ?").run(sessionId);

      // a tip pointer at a pruned row would dangle; repoint at the new last row
      const tip = d
        .prepare("SELECT id FROM messages WHERE session_id = ? ORDER BY seq DESC LIMIT 1")
        .get(sessionId) as { id: string } | undefined;
      if (tip) d.prepare("UPDATE refs SET message_id = ? WHERE session_id = ? AND name = 'main'").run(tip.id, sessionId);

      compacted = { summaries: spans.length, renumbered: ordered.length };
    })();
  }

  // VACUUM is what actually returns pages to the filesystem, and SQLite refuses
  // to run it inside a transaction — hence outside the block above.
  d.exec("VACUUM;");
  // Prune is the one place the append-only contract is broken (rows deleted,
  // stubs blanked), so the incremental projection cache must not survive it.
  // The render cache rides along: its key is the projection's watermark, and
  // dropping both keeps the two caches from ever disagreeing about the view.
  dropViewCache(sessionId);
  dropRenderCache();
  return { messages: toDelete.length, stubs: toStub.length, usage: usageRemoved, bytesBefore, bytesAfter: dbBytes(sessionId), applied: true, compacted };
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
      `\nOne-way either way: "/prune yes" vacuums, "/prune compact yes" also removes the hidden context entirely and renumbers [N] markers 1..n.`,
    ].join("");
  }
  const freed = r.bytesBefore - r.bytesAfter;
  const tail = r.compacted
    ? `, ${r.compacted.summaries} summary row(s) spliced in, markers renumbered 1..${r.compacted.renumbered}`
    : r.stubs
      ? `, kept ${r.stubs} summary anchor(s)`
      : "";
  return `pruned ${r.messages} hidden message(s)${r.usage ? `, ${r.usage} usage row(s)` : ""}${tail} — db ${kb(
    r.bytesBefore,
  )} → ${kb(r.bytesAfter)} (${freed >= 0 ? "freed" : "grew"} ${kb(Math.abs(freed))})`;
}

/**
 * The transcript view model — what a stored row or a live event LOOKS like,
 * independent of who draws it.
 *
 * ## Why this module exists
 *
 * Three front ends already answer "what does a stored message render as?" and
 * each answered it separately:
 *
 *   src/tui/app.ts:960        `nodeToItems`      (terminal)
 *   plugins/gateway/replay.js `if (m.role === "tool")` (web)
 *   src/acp/updates.ts        session/update    (editor)
 *
 * The TUI's and the gateway's copies both pair `tool_call_id` against the
 * assistant's `tool_calls` by hand, and both special-case `todo`/`ctx` bodies.
 * That duplication is what makes a fourth front end expensive — not the
 * painting. This module is the one definition; a front end maps `Item[]` to
 * pixels and nothing else.
 *
 * ## What belongs here, and what must not
 *
 * IN: the shape of a view item, and the pure function from stored rows to
 * items. Everything in this file is data in, data out — no terminal, no
 * signals, no store handle.
 *
 * OUT: keys (`k`), which the caller mints because they are a cache identity,
 * not a view concept; and any state the caller owns (`expanded`, `hidden`),
 * which arrives as an argument rather than a closure read.
 */
import type { MessageRow } from "../store/db.ts";
import { keepTail } from "../tui/helpers.ts";

/**
 * What one transcript row IS.
 *
 * `markerCont` and `hidden` are the only fields a renderer must interpret
 * structurally; everything else is content or a hint the renderer may ignore.
 * A front end that draws no gutter and no dimming is still correct.
 */
export interface Item {
  /**
   * Stable render identity, minted by the caller. The TUI keys its line cache
   * on it, so it must survive a rebuild: a re-derived item with the same key and
   * the same content must NOT be re-rendered.
   */
  k: number;
  kind: ItemKind;
  text: string;
  /** storage seq for items loaded from the log — survives refresh() */
  ref?: number;
  /** expandable: thinking + long tool output */
  expanded?: boolean;
  /** transient (/help): removed on the next keypress or click */
  ephemeral?: boolean;
  /** a real tool result body — collapses to an arrow line; plain info lines in
   *  the toolbody style (welcome, hints) don't */
  toolResult?: boolean;
  /** full untruncated tool input — the head line is clickable to reveal it */
  detail?: string;
  /** part of the startup block — rebuilt live when config changes */
  welcome?: boolean;
  /** tool result whose body is markdown (todo task lists) — expanded rendering
   *  goes through the markdown parser instead of plain lines */
  mdBody?: boolean;
  /**
   * raw tool-call arguments; the pretty-print is deferred to first
   * render/expand — pretty-printing every call in history at load was 416 ms on
   * a 4k-message session, for data only an expanded head ever shows.
   */
  argsRaw?: string;
  /**
   * The view holds a PRESENTATION-TRUNCATED body for this tool result (a
   * harness-authored replace op, see context/truncate.ts) while storage holds
   * the whole original. Expanding such a body re-reads `ref` so the user sees
   * everything the tool actually returned — the excerpt is a default view, never
   * a ceiling on what can be inspected.
   */
  truncated?: boolean;
  /**
   * Storage seq rendered as the leading `[N]` gutter marker. Settled items get
   * it from `loadItems`; a live item gets it as soon as the turn assigns one, so
   * the marker appears in-flight instead of only after a rebuild.
   */
  seq?: number;
  /**
   * The second row of a multi-row logical unit (a tool's body behind its head):
   * indents under the unit's marker instead of repeating the chip, so a tool
   * pair shows ONE `[N]`, not two.
   */
  markerCont?: boolean;
  /**
   * Set by a revert (ctx delete) op — the node is hidden from the MODEL's
   * context but the transcript keeps it (storage is append-only). Rendered
   * dimmed so the op is visible; /undo clears it.
   */
  hidden?: boolean;
}

export type ItemKind = "user" | "toolhead" | "toolbody" | "info" | "error" | "md" | "think";

/**
 * Tool-call metadata, keyed by `tool_call_id`.
 *
 * A `tool` row carries only the id of the call it answers, so a renderer has to
 * join against the assistant row that made it. The caller builds these three
 * maps once per rebuild (see `callMaps`) and hands them in, because the join is
 * the caller's query, not a view concern.
 */
export interface CallMaps {
  /** the call's one-line summary, e.g. `exec · bun test` */
  label: Map<string, string>;
  /** the full raw arguments, for the clickable detail */
  raw: Map<string, string>;
  /** bare tool name, for the todo/ctx special cases */
  name: Map<string, string>;
}

/** What the caller knows that the row itself does not. */
export interface NodeViewOptions {
  /**
   * Mint the render identity for a row's slot. `slot` distinguishes the parts
   * of one storage row: 0 the row itself, 1 a tool head, 2 its body. The caller
   * owns this because the key is a CACHE identity, not a view concept — the TUI
   * derives it from the seq so it survives a rebuild, while a stateless renderer
   * can use anything stable.
   */
  key(seq: number, slot: 0 | 1 | 2): number;
  /**
   * Which seqs the user has expanded. Passed in, not closed over: this module
   * has no state, and a renderer that keeps expansion somewhere else (a web UI,
   * an editor outline) must still get the same items.
   */
  expanded(seq: number): boolean;
  /**
   * Memory guard for pathological tool bodies — the row is never CUT on screen,
   * this only bounds what an unexpanded live view holds. Passed in because the
   * cap is config (`tuiKeptChars`), which is the host's to read.
   */
  keptChars: number;
}

/**
 * One stored row → the items it renders as.
 *
 * A `user`, `think` or assistant row is one item. A `tool` row is TWO: the head
 * (with its `[N]` chip) and the body behind it (`markerCont`, so the pair shows
 * one chip). That split is the reason this function returns an array.
 */
export function nodeToItems(m: MessageRow, callMaps: CallMaps, opts: NodeViewOptions, hidden?: boolean, modelTruncated?: boolean): Item[] {
  // the [N] marker is not baked into text — it rides `it.seq` as a gutter chip.
  // `hidden` (a revert hid this node from the model's context) marks every item
  // so the renderer can dim it: the op stays visible in the transcript even
  // though storage is append-only.
  if (m.role === "user") return [{ k: opts.key(m.seq, 0), kind: "user", seq: m.seq, text: `❯ ${m.content}`, hidden }];
  if (m.role === "tool") {
    // todo bodies are markdown task lists — rendered as md, always visible.
    // ctx bodies stay expanded too: the per-op report is the audit trail for
    // what the model just did to its view.
    const name = callMaps.name.get(m.tool_call_id ?? "");
    const isTodo = name === "todo";
    const isCtx = name === "ctx";
    const pinned = isTodo || isCtx;
    const failed = m.error != null;
    // The TRANSCRIPT shows the whole stored body. Truncation is a model-facing
    // presentation (see context/truncate.ts, which appends a replace op); the
    // row itself is never cut, so a reader who wants the full output should get
    // it. `keepTail` here is only a memory guard for pathological bodies;
    // expanding re-reads the row from SQLite and shows it all.
    const shown = isTodo || isCtx ? m.content : keepTail(m.content, opts.keptChars * 4);
    const seq = m.seq;
    return [
      {
        k: opts.key(seq, 1),
        kind: "toolhead",
        seq,
        text: `» ${callMaps.label.get(m.tool_call_id ?? "") ?? "tool"}${failed ? " — failed" : ""}`,
        argsRaw: callMaps.raw.get(m.tool_call_id ?? ""),
        hidden,
      },
      {
        k: opts.key(seq, 2),
        kind: "toolbody",
        seq,
        markerCont: true, // indents under the head's [N]; a tool pair shows ONE chip
        text: shown,
        ref: seq,
        toolResult: true,
        mdBody: isTodo || undefined,
        expanded: pinned || opts.expanded(seq),
        hidden,
        // the model read an excerpt while the row holds everything: say so on
        // the head line, so "the assistant missed X" has a visible reason
        truncated: modelTruncated || shown.length < m.content.length,
      },
    ];
  }
  if (m.role === "think")
    return [{ k: opts.key(m.seq, 0), kind: "think", seq: m.seq, text: m.content, ref: m.seq, expanded: opts.expanded(m.seq), hidden }];
  return [{ k: opts.key(m.seq, 0), kind: "md", seq: m.seq, text: m.content || "", hidden }];
}

/**
 * Build the `tool_call_id` → metadata maps for a whole session.
 *
 * Lives here so the join is written once. The assistant row's `tool_calls` is
 * JSON; a malformed payload degrades to "no calls" rather than throwing, because
 * one bad historical row must not make a whole session unrenderable.
 */
export function callMaps(rows: readonly MessageRow[], summarize: (name: string, args: string) => string): CallMaps {
  const label = new Map<string, string>();
  const raw = new Map<string, string>();
  const name = new Map<string, string>();
  for (const m of rows) {
    if (m.role !== "assistant" || !m.tool_calls) continue;
    let calls: unknown;
    try {
      calls = JSON.parse(m.tool_calls);
    } catch {
      continue; // a corrupt row loses its labels, not the session
    }
    if (!Array.isArray(calls)) continue;
    for (const c of calls) {
      const tc = c as { id?: unknown; name?: unknown; arguments?: unknown };
      if (typeof tc?.id !== "string" || typeof tc?.name !== "string") continue;
      const argsText = typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments ?? {});
      name.set(tc.id, tc.name);
      raw.set(tc.id, argsText);
      label.set(tc.id, summarize(tc.name, argsText));
    }
  }
  return { label, raw, name };
}

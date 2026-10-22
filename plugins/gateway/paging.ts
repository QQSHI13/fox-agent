/**
 * Transcript pagination — the pure half of `session.get`.
 *
 * Kept out of server.ts so the cursor rules can be tested without a socket, and
 * kept OUT of the host API on purpose: the host still hands over the whole
 * transcript and the gateway slices it. That is what makes the paging addition
 * backward-compatible in both directions — an older `bin/fox` (no paging in its
 * host) still pages correctly under a newer gateway, and an older client that
 * sends no params still gets the full transcript it expects.
 *
 * The cursor is a `seq`, not an offset: seqs are stable, monotonic per session,
 * and an offset would shift under a turn that is still appending.
 */

export interface LiteMessage {
  role: string;
  content: string;
  seq: number;
}

/** One page of a long session. 50 keeps a phone-sized first paint quick. */
export const DEFAULT_LIMIT = 50;

/**
 * Upper bound on a single page. A client asking for 100k would serialize the
 * whole session anyway (defeating the point) and can stall the socket, which is
 * shared with the streaming events.
 */
export const MAX_LIMIT = 500;

/** `limit` from untrusted JSON: absent/NaN/<=0 -> the default, >max -> max. */
export function clampLimit(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(n));
}

export interface PageQuery {
  before?: unknown;
  limit?: unknown;
}

/**
 * Whether the caller asked for a page at all.
 *
 * `session.get` with no params keeps its original meaning (the whole
 * transcript). Only an explicit `before` or `limit` opts into paging, so a
 * client written against v1 is never surprised by a truncated view.
 */
export function isPaged(q: PageQuery | undefined | null): boolean {
  if (!q) return false;
  return q.before !== undefined || q.limit !== undefined;
}

/**
 * Newest-first window over `all` (which must be ascending by `seq`).
 *
 * `before` is exclusive: `seq < before`. Absent means "the newest there is".
 * `hasMore` reports whether the returned window was cut, i.e. whether asking
 * again with `before = messages[0].seq` yields anything.
 */
export function pageMessages(
  all: readonly LiteMessage[],
  q: PageQuery = {},
): { messages: LiteMessage[]; hasMore: boolean } {
  const limit = clampLimit(q.limit);
  const before = typeof q.before === "number" && Number.isFinite(q.before) ? q.before : undefined;
  const bounded = before === undefined ? all : all.filter((m) => m.seq < before);
  if (bounded.length <= limit) return { messages: bounded.slice(), hasMore: false };
  return { messages: bounded.slice(bounded.length - limit), hasMore: true };
}

/** The `seq` a client sends back as `before` to load the page before this one. */
export function olderCursor(page: readonly LiteMessage[]): number | undefined {
  return page.length ? page[0].seq : undefined;
}

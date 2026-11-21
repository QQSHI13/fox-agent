/**
 * Media offloading: binary payloads live in `media_blobs`, message rows carry refs.
 *
 * Why: a tool result's base64 (13MB for a 10MB read) used to be stored INLINE in
 * `messages.media`, so every full-row query, view projection and render cache
 * dragged the payload through SQLite and pinned it in the heap for the whole
 * session. Now the bytes are written ONCE, keyed by the SHA-256 of the raw
 * data (identical attachments dedupe), and the message row keeps only
 * `{mimeType, ref, bytes, filename}` — a few dozen bytes. Hydration is
 * request-scoped: `hydrateMessagesMedia` runs at the provider boundary, so the
 * base64 exists only while one request is being built, and the render cache
 * retains refs, not payloads (opencode's `media_blob` pattern, pi-mono's
 * file-backed cap, adapted to fox-agent's append-only session db).
 *
 * Sessions written before this table existed still carry inline `data`;
 * hydrate treats those as a pass-through, so old transcripts need no migration.
 */
import { createHash } from "node:crypto";
import { sessionDb } from "./db.ts";
import type { ChatMessage, MediaPart } from "../providers/types.ts";

/** Move each part's inline base64 into `media_blobs`, returning ref-only parts. */
export function externalizeMedia(sessionId: string, media: MediaPart[]): MediaPart[] {
  const d = sessionDb(sessionId);
  const put = d.prepare("INSERT OR IGNORE INTO media_blobs (hash, mime, bytes, data) VALUES (?, ?, ?, ?)");
  return media.map((p) => {
    if (p.data === undefined || p.ref !== undefined) return p; // already offloaded / external
    const raw = Buffer.from(p.data, "base64");
    const ref = createHash("sha256").update(raw).digest("hex");
    put.run(ref, p.mimeType, raw.byteLength, raw);
    const { data: _dropped, ...rest } = p;
    return { ...rest, ref, bytes: raw.byteLength };
  });
}

/** Restore base64 for ref parts; inline parts pass through untouched. */
export function hydrateMediaParts(sessionId: string, media: MediaPart[]): MediaPart[] {
  const d = sessionDb(sessionId);
  const get = d.prepare("SELECT data FROM media_blobs WHERE hash = ?");
  return media.map((p) => {
    if (p.data !== undefined || p.ref === undefined) return p;
    const row = get.get(p.ref) as { data: Buffer | Uint8Array } | undefined;
    // A missing blob means corruption, not a lost upload: the row was written
    // before the message that names it. Degrade to empty bytes rather than
    // failing the whole request — the tool's text note still describes the
    // attachment.
    const buf = row ? (Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data)) : Buffer.alloc(0);
    return { ...p, data: buf.toString("base64") };
  });
}

/**
 * Hydrate the media refs of one request's message list, right before provider
 * conversion. Messages without media are returned by reference (no copy);
 * only media-carrying tool messages get fresh, fully-hydrated objects, so the
 * base64 never enters the render cache that produced the refs.
 */
export function hydrateMessagesMedia(sessionId: string, messages: ChatMessage[]): ChatMessage[] {
  if (!messages.some((m) => m.media?.some((p) => p.data === undefined && p.ref !== undefined))) return messages;
  return messages.map((m) =>
    m.media?.length ? { ...m, media: hydrateMediaParts(sessionId, m.media) } : m,
  );
}

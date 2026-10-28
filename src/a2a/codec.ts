/**
 * Wire conversion for both A2A dialects.
 *
 * Everything in this codebase works with the 1.0 shape from `types.ts`. This is
 * the only module that knows how bytes look on the wire, and it knows two
 * spellings of them:
 *
 * - **1.0** — the member NAME discriminates a union (`{text}`, `{statusUpdate}`),
 *   enums are SCREAMING_SNAKE_CASE, parts carry `raw`/`url`/`filename` at the top
 *   level (§A.2.1, §5.5).
 * - **legacy** (0.3) — an inline `kind` field discriminates, enums are lowercase,
 *   a file part nests its payload under `file`.
 *
 * Both are supported in both directions because §A.2 asks implementations to
 * accept the legacy form during the overlap, and because a peer that has not
 * upgraded is still a peer. Encoding always produces the dialect the request
 * asked for, so a 0.3 client is never handed 1.0 bytes.
 */
import type {
  AgentCard,
  Artifact,
  DataPart,
  FilePart,
  Message,
  Part,
  Role,
  StreamResponse,
  Task,
  TaskArtifactUpdateEvent,
  TaskState,
  TaskStatus,
  TaskStatusUpdateEvent,
  TextPart,
  Dialect,
} from "./types.ts";

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

/** Drop `undefined` members so a JSON payload carries only what was set (§5.7). */
function compact<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

export function isObj(v: unknown): v is Record<string, any> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** ISO 8601 in UTC with a `Z` suffix and millisecond precision (§5.6.1). */
export function isoNow(ms = Date.now()): string {
  return new Date(ms).toISOString();
}

// ---------------------------------------------------------------------------
// enums
// ---------------------------------------------------------------------------

const STATE_TO_LEGACY: Record<string, string> = {
  TASK_STATE_UNSPECIFIED: "unknown",
  TASK_STATE_SUBMITTED: "submitted",
  TASK_STATE_WORKING: "working",
  TASK_STATE_COMPLETED: "completed",
  TASK_STATE_FAILED: "failed",
  TASK_STATE_CANCELED: "canceled",
  TASK_STATE_REJECTED: "rejected",
  TASK_STATE_INPUT_REQUIRED: "input-required",
  TASK_STATE_AUTH_REQUIRED: "auth-required",
};
const LEGACY_TO_STATE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_TO_LEGACY).map(([k, v]) => [v, k]),
);

/** A state in the requested dialect. Unknown values pass through untouched. */
export function encodeState(state: string, dialect: Dialect): string {
  return dialect === "legacy" ? (STATE_TO_LEGACY[state] ?? state) : state;
}

/** A state from the wire, in either spelling, normalised to 1.0. */
export function decodeState(raw: unknown): TaskState {
  const s = typeof raw === "string" ? raw.trim() : "";
  // An absent state is UNSPECIFIED, not "TASK_STATE_" — string-building the
  // fallback produced a state no client or server recognises.
  if (!s) return "TASK_STATE_UNSPECIFIED";
  const up = s.toUpperCase().replace(/[- ]/g, "_");
  if (up.startsWith("TASK_STATE_")) return up as TaskState;
  const mapped = LEGACY_TO_STATE[s];
  if (mapped) return mapped as TaskState;
  // A spelling we do not know: accept the shouting form only if it names a real
  // state, so a typo cannot invent a state the rest of the code will treat as
  // non-terminal forever.
  const prefixed = `TASK_STATE_${up}`;
  return (KNOWN_STATES.has(prefixed) ? prefixed : "TASK_STATE_UNSPECIFIED") as TaskState;
}

/** Every state 1.0 defines (§4.1.3). */
const KNOWN_STATES: ReadonlySet<string> = new Set(Object.keys(STATE_TO_LEGACY));

/** Roles normalise the same way (`ROLE_USER` ↔ `user`). */
export function encodeRole(role: Role, dialect: Dialect): string {
  if (dialect === "legacy") return role === "ROLE_AGENT" ? "agent" : role === "ROLE_USER" ? "user" : "";
  return role;
}

export function decodeRole(raw: unknown): Role {
  const s = typeof raw === "string" ? raw.toUpperCase() : "";
  if (s.startsWith("ROLE_")) return s as Role;
  if (s === "AGENT") return "ROLE_AGENT";
  if (s === "USER") return "ROLE_USER";
  return "ROLE_UNSPECIFIED";
}

// ---------------------------------------------------------------------------
// parts
// ---------------------------------------------------------------------------

function decodePartLegacy(p: Record<string, any>): Part | null {
  switch (p.kind) {
    case "text":
      return compact({ text: String(p.text ?? ""), metadata: p.metadata }) as TextPart;
    case "file": {
      const f = isObj(p.file) ? p.file : {};
      return compact({
        raw: f.fileWithBytes,
        url: f.fileWithUri ?? f.fileWithUrl,
        filename: f.name ?? f.filename,
        mediaType: f.mimeType ?? f.mediaType,
        metadata: p.metadata,
      }) as FilePart;
    }
    case "data":
      return compact({ data: p.data, mediaType: p.metadata?.mediaType, metadata: p.metadata }) as DataPart;
    default:
      // A part we do not understand is dropped rather than guessed at: a wrong
      // guess would put arbitrary text in the model's prompt.
      return null;
  }
}

/**
 * One part, from either dialect, in 1.0 shape.
 *
 * 1.0 has no `kind`: `text` present means text, `data` present means data, and
 * `raw`/`url` mean a file. Legacy detection is the presence of `kind`, which 1.0
 * never sends (§A.2.1 says the field "is no longer part of the protocol").
 */
export function decodePart(p: unknown): Part | null {
  if (!isObj(p)) return null;
  if (typeof p.kind === "string") return decodePartLegacy(p);
  if (typeof p.text === "string") return compact({ text: p.text, metadata: p.metadata }) as TextPart;
  if (p.data !== undefined) return compact({ data: p.data, mediaType: p.mediaType, metadata: p.metadata }) as DataPart;
  if (p.raw !== undefined || p.url !== undefined) {
    return compact({ raw: p.raw, url: p.url, filename: p.filename, mediaType: p.mediaType, metadata: p.metadata }) as FilePart;
  }
  return null;
}

export function decodeParts(parts: unknown): Part[] {
  return (Array.isArray(parts) ? parts : []).map(decodePart).filter((p): p is Part => p !== null);
}

/** One part in the requested dialect. */
export function encodePart(p: Part, dialect: Dialect): Record<string, unknown> {
  if ("text" in p) {
    return dialect === "legacy"
      ? compact({ kind: "text", text: p.text, metadata: p.metadata })
      : compact({ text: p.text, metadata: p.metadata });
  }
  if ("data" in p) {
    return dialect === "legacy"
      ? compact({ kind: "data", data: p.data, metadata: p.metadata })
      : compact({ data: p.data, mediaType: p.mediaType, metadata: p.metadata });
  }
  const f = p as FilePart;
  if (dialect === "legacy") {
    return compact({
      kind: "file",
      file: compact({
        name: f.filename,
        mimeType: f.mediaType,
        // 0.3 spelled the two carriers apart and required exactly one
        ...(f.raw !== undefined ? { fileWithBytes: f.raw } : { fileWithUri: f.url }),
      }),
      metadata: f.metadata,
    });
  }
  return compact({ raw: f.raw, url: f.url, filename: f.filename, mediaType: f.mediaType, metadata: f.metadata });
}

export function encodeParts(parts: Part[], dialect: Dialect): Record<string, unknown>[] {
  return parts.map((p) => encodePart(p, dialect));
}

/**
 * Every text part of a part list, joined.
 *
 * Only `text` parts carry prose a caller wants in a prompt; a file's base64 or a
 * data part's JSON would be noise there (or worse, megabytes of it).
 */
export function partsText(parts: unknown): string {
  return decodeParts(parts)
    .map((p) => ("text" in p ? p.text : ""))
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// messages
// ---------------------------------------------------------------------------

export function decodeMessage(m: unknown): Message | null {
  if (!isObj(m)) return null;
  return compact({
    messageId: String(m.messageId ?? m.message_id ?? ""),
    role: decodeRole(m.role),
    parts: decodeParts(m.parts),
    contextId: m.contextId ?? m.context_id,
    taskId: m.taskId ?? m.task_id,
    referenceTaskIds: m.referenceTaskIds ?? m.reference_task_ids,
    extensions: m.extensions,
    metadata: m.metadata,
  }) as Message;
}

export function encodeMessage(m: Message, dialect: Dialect): Record<string, unknown> {
  return compact({
    ...(dialect === "legacy" ? { kind: "message" } : {}),
    messageId: m.messageId,
    role: encodeRole(m.role, dialect),
    parts: encodeParts(m.parts, dialect),
    contextId: m.contextId,
    taskId: m.taskId,
    referenceTaskIds: m.referenceTaskIds,
    extensions: m.extensions,
    metadata: m.metadata,
  });
}

// ---------------------------------------------------------------------------
// artifacts, status, task
// ---------------------------------------------------------------------------

export function decodeArtifact(a: unknown): Artifact | null {
  if (!isObj(a)) return null;
  return compact({
    artifactId: String(a.artifactId ?? ""),
    name: a.name,
    description: a.description,
    parts: decodeParts(a.parts),
    extensions: a.extensions,
    metadata: a.metadata,
  }) as Artifact;
}

export function encodeArtifact(a: Artifact, dialect: Dialect): Record<string, unknown> {
  return compact({
    artifactId: a.artifactId,
    name: a.name,
    description: a.description,
    parts: encodeParts(a.parts, dialect),
    extensions: a.extensions,
    metadata: a.metadata,
  });
}

export function decodeStatus(s: unknown): TaskStatus {
  if (!isObj(s)) return { state: "TASK_STATE_UNSPECIFIED" };
  return compact({
    state: decodeState(s.state),
    message: decodeMessage(s.message) ?? undefined,
    timestamp: typeof s.timestamp === "string" ? s.timestamp : undefined,
  }) as TaskStatus;
}

export function encodeStatus(s: TaskStatus, dialect: Dialect): Record<string, unknown> {
  return compact({
    state: encodeState(s.state, dialect),
    message: s.message ? encodeMessage(s.message, dialect) : undefined,
    timestamp: s.timestamp,
  });
}

/**
 * A task, if this really is one.
 *
 * The id check has to be `typeof id === "string"`, not `typeof (id ?? "")`:
 * the nullish fallback made the test true for EVERY object without an id, so
 * `decodeTask({statusUpdate: …})` invented a task with the id `"undefined"` and
 * swallowed the frame it was handed. With that, a peer answering with a bare
 * status update looked like a completed task with no report.
 */
export function decodeTask(t: unknown): Task | null {
  if (!isObj(t) || typeof t.id !== "string" || !t.id) return null;
  return compact({
    id: String(t.id),
    contextId: t.contextId ?? t.context_id,
    status: decodeStatus(t.status),
    history: Array.isArray(t.history)
      ? t.history.map(decodeMessage).filter((m: Message | null): m is Message => m !== null)
      : undefined,
    artifacts: Array.isArray(t.artifacts)
      ? t.artifacts.map(decodeArtifact).filter((a: Artifact | null): a is Artifact => a !== null)
      : undefined,
    metadata: t.metadata,
  }) as Task;
}

export function encodeTask(t: Task, dialect: Dialect): Record<string, unknown> {
  return compact({
    ...(dialect === "legacy" ? { kind: "task" } : {}),
    id: t.id,
    contextId: t.contextId,
    status: encodeStatus(t.status, dialect),
    history: t.history?.map((m) => encodeMessage(m, dialect)),
    artifacts: t.artifacts?.map((a) => encodeArtifact(a, dialect)),
    metadata: t.metadata,
  });
}

// ---------------------------------------------------------------------------
// streaming events (§3.2.3, §A.2.1)
// ---------------------------------------------------------------------------

export function decodeStatusUpdate(r: Record<string, any>): TaskStatusUpdateEvent {
  return compact({
    taskId: String(r.taskId ?? r.task_id ?? ""),
    contextId: r.contextId ?? r.context_id,
    status: decodeStatus(r.status),
    metadata: r.metadata,
  }) as TaskStatusUpdateEvent;
}

export function decodeArtifactUpdate(r: Record<string, any>): TaskArtifactUpdateEvent {
  const artifact = decodeArtifact(r.artifact) ?? { artifactId: "", parts: [] };
  return compact({
    taskId: String(r.taskId ?? r.task_id ?? ""),
    contextId: r.contextId ?? r.context_id,
    artifact,
    append: r.append,
    lastChunk: r.lastChunk ?? r.last_chunk,
    metadata: r.metadata,
  }) as TaskArtifactUpdateEvent;
}

/**
 * One stream frame from either dialect.
 *
 * 1.0 wraps the payload in a member named after its type (`{statusUpdate: …}`);
 * 0.3 spread the same object and put `kind: "status-update"` inside it. Both are
 * accepted, and anything unrecognisable returns null so a forward-compatible
 * peer's new frame type is skipped rather than crashing the stream.
 */
export function decodeStreamResponse(r: unknown): StreamResponse | null {
  if (!isObj(r)) return null;
  if (isObj(r.task)) {
    const t = decodeTask(r.task);
    return t ? { task: t } : null;
  }
  if (isObj(r.message)) {
    const m = decodeMessage(r.message);
    return m ? { message: m } : null;
  }
  if (isObj(r.statusUpdate)) return { statusUpdate: decodeStatusUpdate(r.statusUpdate) };
  if (isObj(r.artifactUpdate)) return { artifactUpdate: decodeArtifactUpdate(r.artifactUpdate) };
  // legacy: the discriminator is inside the event object
  switch (r.kind) {
    case "task": {
      const t = decodeTask(r);
      return t ? { task: t } : null;
    }
    case "message": {
      const m = decodeMessage(r);
      return m ? { message: m } : null;
    }
    case "status-update":
      return { statusUpdate: decodeStatusUpdate(r) };
    case "artifact-update":
      return { artifactUpdate: decodeArtifactUpdate(r) };
    default:
      return null;
  }
}

export function encodeStreamResponse(r: StreamResponse, dialect: Dialect): Record<string, unknown> {
  if ("task" in r) {
    if (dialect === "legacy") return encodeTask(r.task, dialect);
    return { task: encodeTask(r.task, dialect) };
  }
  if ("message" in r) {
    if (dialect === "legacy") return encodeMessage(r.message, dialect);
    return { message: encodeMessage(r.message, dialect) };
  }
  if ("statusUpdate" in r) {
    const e = r.statusUpdate;
    const body = compact({
      taskId: e.taskId,
      contextId: e.contextId,
      status: encodeStatus(e.status, dialect),
      metadata: e.metadata,
    });
    return dialect === "legacy" ? compact({ kind: "status-update", ...body, final: TERMINAL_ON_WIRE(e.status.state) }) : { statusUpdate: body };
  }
  const e = r.artifactUpdate;
  const body = compact({
    taskId: e.taskId,
    contextId: e.contextId,
    artifact: encodeArtifact(e.artifact, dialect),
    append: e.append,
    lastChunk: e.lastChunk,
    metadata: e.metadata,
  });
  return dialect === "legacy" ? compact({ kind: "artifact-update", ...body }) : { artifactUpdate: body };
}

/**
 * 0.3 carried terminality on the event (`final: true`); 1.0 removed the field and
 * expects the client to infer it from the state. Emitting it for a legacy peer
 * keeps that peer's own loop terminating.
 */
function TERMINAL_ON_WIRE(state: string): boolean {
  return (
    state === "TASK_STATE_COMPLETED" ||
    state === "TASK_STATE_FAILED" ||
    state === "TASK_STATE_CANCELED" ||
    state === "TASK_STATE_REJECTED"
  );
}

// ---------------------------------------------------------------------------
// agent card (§4.4, §8)
// ---------------------------------------------------------------------------

/**
 * The card as the requested dialect spells it.
 *
 * 1.0 moved transport declaration into `supportedInterfaces` (§8.3.1). 0.3 had a
 * top-level `url` plus `preferredTransport` and `additionalInterfaces`; a 0.3
 * client reads only those, so a card that offered just `supportedInterfaces`
 * would look like it had no endpoint at all.
 */
export function encodeAgentCard(card: AgentCard, dialect: Dialect): Record<string, unknown> {
  const base = compact({
    name: card.name,
    description: card.description,
    version: card.version,
    capabilities: compact({
      streaming: card.capabilities.streaming,
      pushNotifications: card.capabilities.pushNotifications,
      extendedAgentCard: card.capabilities.extendedAgentCard,
      ...(card.capabilities.extensions?.length ? { extensions: card.capabilities.extensions } : {}),
    }),
    defaultInputModes: card.defaultInputModes,
    defaultOutputModes: card.defaultOutputModes,
    skills: card.skills,
    provider: card.provider,
    iconUrl: card.iconUrl,
    documentationUrl: card.documentationUrl,
    securitySchemes: card.securitySchemes,
    securityRequirements: card.securityRequirements,
    signatures: card.signatures,
  });
  if (dialect === "legacy") {
    const first = card.supportedInterfaces[0];
    return compact({
      ...base,
      // Keep `supportedInterfaces` in the legacy card as well. A 0.3 peer
      // ignores unknown members (§5.7) and reads url/preferredTransport; a 1.0
      // peer that fetches the card *before* it knows which versions exist (which
      // is what discovery is FOR) can then still negotiate from it. Without this
      // the discovery document was version-blind: no header meant 0.3 (§3.6.2),
      // so a 1.0 client saw a card with no interfaces list at all.
      supportedInterfaces: card.supportedInterfaces,
      protocolVersion: first?.protocolVersion ?? "0.3",
      url: first?.url,
      preferredTransport: first?.protocolBinding,
      additionalInterfaces: card.supportedInterfaces
        .slice(1)
        .map((i) => compact({ url: i.url, transport: i.protocolBinding })),
    });
  }
  return { ...base, supportedInterfaces: card.supportedInterfaces };
}

/**
 * The preferred interface to talk to, from either card spelling (§8.3.2).
 *
 * Order matters: `supportedInterfaces` is declared in preference order and the
 * first entry wins. A legacy card's main `url`/`preferredTransport` is the
 * equivalent of "first", so it is tried before `additionalInterfaces`.
 */
export function cardInterfaces(raw: unknown): { url: string; binding: string; version: string; tenant?: string }[] {
  if (!isObj(raw)) return [];
  const out: { url: string; binding: string; version: string; tenant?: string }[] = [];
  if (Array.isArray(raw.supportedInterfaces)) {
    for (const i of raw.supportedInterfaces) {
      if (!isObj(i) || typeof i.url !== "string") continue;
      out.push({
        url: i.url,
        binding: String(i.protocolBinding ?? i.transport ?? "JSONRPC"),
        // A 1.0 card must declare it; if it does not, assume 1.0 rather than
        // silently downgrading the conversation.
        version: normalizeVersion(String(i.protocolVersion ?? "1.0")),
        tenant: typeof i.tenant === "string" ? i.tenant : undefined,
      });
    }
  }
  if (typeof raw.url === "string" && raw.preferredTransport) {
    const legacyVersion = normalizeVersion(String(raw.protocolVersion ?? "0.3"));
    if (!out.some((i) => i.url === raw.url))
      out.push({ url: raw.url, binding: String(raw.preferredTransport), version: legacyVersion, tenant: raw.tenant });
    for (const i of Array.isArray(raw.additionalInterfaces) ? raw.additionalInterfaces : []) {
      if (!isObj(i) || typeof i.url !== "string") continue;
      out.push({ url: i.url, binding: String(i.transport ?? "JSONRPC"), version: legacyVersion });
    }
  }
  return out;
}

/** `"1.0.0"` and `"1"` both mean `"1.0"` — the patch number is not negotiated (§3.6). */
export function normalizeVersion(v: string): string {
  const m = /^(\d+)\.(\d+)/.exec(v.trim().replace(/^v/, ""));
  return m ? `${m[1]}.${m[2]}` : v.trim();
}

/** Which dialect a negotiated version implies. */
export function dialectOf(version: string): Dialect {
  return normalizeVersion(version) === "1.0" ? "1.0" : "legacy";
}

/**
 * A2A 1.0 data model, as plain TypeScript.
 *
 * The normative definition is `spec/a2a.proto` (per spec §1.4), and every field
 * name here is its ProtoJSON spelling — camelCase, because §5.5 requires that
 * for JSON and only the *enum values* keep their proto shouting case. So a
 * state is `"TASK_STATE_COMPLETED"`, not `"completed"`, and a part is
 * `{text: "..."}`, not `{kind: "text", text: "..."}` — 1.0 removed the `kind`
 * discriminator in favour of the member name itself (§A.2.1).
 *
 * The wire vocabulary of both dialects lives in `codec.ts`; this file is only
 * the shape of the data.
 */

/** The protocol version this build speaks. Major.Minor only (§3.6). */
export const PROTOCOL_VERSION = "1.0";
/** The version that predates this one, still accepted for interop. */
export const LEGACY_PROTOCOL_VERSION = "0.3";

/**
 * Which wire dialect a request speaks.
 *
 * `1.0` is the current format. `legacy` is 0.3 — the `kind`-discriminated,
 * lowercase-enum format — kept because a peer that has not upgraded is still a
 * peer, and §A.2 explicitly asks servers to accept both during the overlap.
 */
export type Dialect = "1.0" | "legacy";

// ---------------------------------------------------------------------------
// enums
// ---------------------------------------------------------------------------

export const TASK_STATES = [
  "TASK_STATE_UNSPECIFIED",
  "TASK_STATE_SUBMITTED",
  "TASK_STATE_WORKING",
  "TASK_STATE_COMPLETED",
  "TASK_STATE_FAILED",
  "TASK_STATE_CANCELED",
  "TASK_STATE_REJECTED",
  "TASK_STATE_INPUT_REQUIRED",
  "TASK_STATE_AUTH_REQUIRED",
] as const;
export type TaskState = (typeof TASK_STATES)[number];

/** Nothing more will happen in this task (§3.1.5, §3.1.6). */
export const TERMINAL_STATES: ReadonlySet<string> = new Set<TaskState>([
  "TASK_STATE_COMPLETED",
  "TASK_STATE_FAILED",
  "TASK_STATE_CANCELED",
  "TASK_STATE_REJECTED",
]);

/**
 * Waiting on somebody else: `CancelTask` may not apply, and a server MAY keep an
 * open stream alive across the pause (§6.3). Treated as "stop waiting here" for
 * a headless client, which cannot answer a question nobody will see.
 */
export const INTERRUPTED_STATES: ReadonlySet<string> = new Set<TaskState>([
  "TASK_STATE_INPUT_REQUIRED",
  "TASK_STATE_AUTH_REQUIRED",
]);

export const ROLES = ["ROLE_UNSPECIFIED", "ROLE_USER", "ROLE_AGENT"] as const;
export type Role = (typeof ROLES)[number];

// ---------------------------------------------------------------------------
// parts
// ---------------------------------------------------------------------------

/**
 * A part of a message or artifact. The 1.0 union has no discriminator field:
 * which member is present *is* the type (§A.2.1).
 */
export type Part = TextPart | FilePart | DataPart;

export interface TextPart {
  text: string;
  metadata?: Record<string, unknown>;
}

/** A file by value (`raw`, base64) or by reference (`url`) — one or the other. */
export interface FilePart {
  raw?: string;
  url?: string;
  filename?: string;
  mediaType?: string;
  metadata?: Record<string, unknown>;
}

export interface DataPart {
  data: unknown;
  mediaType?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// core objects
// ---------------------------------------------------------------------------

export interface Message {
  messageId: string;
  role: Role;
  parts: Part[];
  /** groups this message with a conversation (§3.4.1) */
  contextId?: string;
  /** continues or refines an existing task (§3.4.2) */
  taskId?: string;
  /** tasks this message is about (§3.4.3) */
  referenceTaskIds?: string[];
  extensions?: string[];
  metadata?: Record<string, unknown>;
}

export interface Artifact {
  artifactId: string;
  name?: string;
  description?: string;
  parts: Part[];
  extensions?: string[];
  metadata?: Record<string, unknown>;
}

export interface TaskStatus {
  state: TaskState;
  message?: Message;
  /** ISO 8601, UTC, `Z` suffix — §5.6.1 requires it and forbids other offsets */
  timestamp?: string;
}

export interface Task {
  id: string;
  contextId?: string;
  status: TaskStatus;
  /** messages exchanged so far; trimmed by `historyLength` */
  history?: Message[];
  artifacts?: Artifact[];
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// streaming events
// ---------------------------------------------------------------------------

export interface TaskStatusUpdateEvent {
  taskId: string;
  contextId?: string;
  status: TaskStatus;
  metadata?: Record<string, unknown>;
}

export interface TaskArtifactUpdateEvent {
  taskId: string;
  contextId?: string;
  artifact: Artifact;
  /** append to the artifact already sent under this artifactId */
  append?: boolean;
  /** no more chunks for this artifact */
  lastChunk?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * One frame of a stream (§3.2.3). The proto is a `oneof`, so exactly one member
 * is set and — in 1.0 — the member NAME is the discriminator. 0.3 spelled the
 * same thing with `kind: "status-update"` inline.
 */
export type StreamResponse =
  | { task: Task }
  | { message: Message }
  | { statusUpdate: TaskStatusUpdateEvent }
  | { artifactUpdate: TaskArtifactUpdateEvent };

/** `SendMessage` returns exactly one of these (§3.1.1). */
export type SendMessageResponse = { task: Task } | { message: Message };

// ---------------------------------------------------------------------------
// request/response objects
// ---------------------------------------------------------------------------

export interface PushNotificationAuthenticationInfo {
  /** e.g. "Bearer", "Basic" */
  scheme: string;
  credentials?: string;
}

export interface TaskPushNotificationConfig {
  /** assigned by the server on create; echoed on get/list/delete */
  id?: string;
  taskId?: string;
  url: string;
  token?: string;
  authentication?: PushNotificationAuthenticationInfo;
}

export interface SendMessageConfiguration {
  /** media types the client can consume */
  acceptedOutputModes?: string[];
  /** a webhook to attach at creation time (§6.6) */
  taskPushNotificationConfig?: TaskPushNotificationConfig;
  /** history to include in the returned task; 0 omits it (§3.2.4) */
  historyLength?: number;
  /** false/unset = block until terminal or interrupted (§3.2.2) */
  returnImmediately?: boolean;
}

export interface SendMessageRequest {
  message: Message;
  configuration?: SendMessageConfiguration;
  metadata?: Record<string, unknown>;
  /** routing key for multi-tenant deployments; echoed with every request */
  tenant?: string;
}

export interface GetTaskRequest {
  id: string;
  historyLength?: number;
  tenant?: string;
}

export interface ListTasksRequest {
  contextId?: string;
  status?: TaskState;
  pageSize?: number;
  pageToken?: string;
  historyLength?: number;
  /** false omits artifacts entirely from each task (§3.1.4) */
  includeArtifacts?: boolean;
  tenant?: string;
}

export interface ListTasksResponse {
  tasks: Task[];
  totalSize: number;
  pageSize: number;
  /** always present; "" means this was the last page (§3.1.4) */
  nextPageToken: string;
}

export interface CancelTaskRequest {
  id: string;
  tenant?: string;
}

export interface SubscribeToTaskRequest {
  id: string;
  tenant?: string;
}

// ---------------------------------------------------------------------------
// agent card (§4.4, §8)
// ---------------------------------------------------------------------------

export interface AgentInterface {
  url: string;
  /** "JSONRPC" | "GRPC" | "HTTP+JSON" | a custom binding URI (§5.8) */
  protocolBinding: string;
  /** Major.Minor, e.g. "1.0" */
  protocolVersion: string;
  tenant?: string;
}

export interface AgentProvider {
  organization: string;
  url: string;
}

export interface AgentExtension {
  uri: string;
  description?: string;
  /** the client MUST declare support for this extension or be refused (§3.3.4) */
  required?: boolean;
  params?: Record<string, unknown>;
}

export interface AgentCapabilities {
  streaming?: boolean;
  pushNotifications?: boolean;
  extendedAgentCard?: boolean;
  extensions?: AgentExtension[];
}

export interface AgentSkill {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

/** One of the security-scheme shapes from §4.5; the member name is the type. */
export type SecurityScheme =
  | { apiKeySecurityScheme: { name: string; in: string; description?: string } }
  | { httpAuthSecurityScheme: { scheme: string; bearerFormat?: string; description?: string } }
  | { oauth2SecurityScheme: { flows: Record<string, unknown>; oauth2MetadataUrl?: string; description?: string } }
  | { openIdConnectSecurityScheme: { openIdConnectUrl: string; description?: string } }
  | { mutualTlsSecurityScheme: { description?: string } };

/** An OR across entries, AND within one entry's `schemes` (§8.5 sample). */
export interface SecurityRequirement {
  schemes: Record<string, { list?: string[] }>;
}

export interface AgentCardSignature {
  protected: string;
  signature: string;
  header?: Record<string, unknown>;
}

export interface AgentCard {
  name: string;
  description: string;
  /** ordered by preference; the first entry is the preferred one (§8.3.1) */
  supportedInterfaces: AgentInterface[];
  version: string;
  capabilities: AgentCapabilities;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentSkill[];
  provider?: AgentProvider;
  iconUrl?: string;
  documentationUrl?: string;
  securitySchemes?: Record<string, SecurityScheme>;
  securityRequirements?: SecurityRequirement[];
  signatures?: AgentCardSignature[];
}

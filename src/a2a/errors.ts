/**
 * A2A error model (§3.3.2) and its JSON-RPC mapping (§5.4, §9.5).
 *
 * Every A2A error has a fixed numeric code in the `-32001..-32099` range, and
 * the codes are part of the wire contract — a client distinguishes "task not
 * found" from "not cancelable" by number, not by reading the message. So they
 * live here as constants with the spec's own names, and `a2aError()` is the one
 * place a code, a message and optional `data` details are assembled.
 *
 * §3.3.2 also requires that an error carry structured `data` details whose
 * objects each name their type with `@type` (ProtoJSON `Any`). Two helpers cover
 * the shapes the spec actually suggests: `errorInfo` (a reason + metadata) and
 * `badRequest` (per-field validation failures).
 */

/** JSON-RPC codes for the errors A2A defines (§5.4). */
export const A2A_ERROR_CODES = {
  TaskNotFound: -32001,
  TaskNotCancelable: -32002,
  PushNotificationNotSupported: -32003,
  UnsupportedOperation: -32004,
  ContentTypeNotSupported: -32005,
  InvalidAgentResponse: -32006,
  ExtendedAgentCardNotConfigured: -32007,
  ExtensionSupportRequired: -32008,
  VersionNotSupported: -32009,
} as const;

/** The standard JSON-RPC codes the spec also uses (§9.5). */
export const RPC_ERROR_CODES = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

export type A2aErrorName = keyof typeof A2A_ERROR_CODES;

/** §3.3.2's table, in prose, used when a caller does not supply its own message. */
const DEFAULT_MESSAGES: Record<A2aErrorName, string> = {
  TaskNotFound: "Task not found",
  TaskNotCancelable: "Task cannot be canceled",
  PushNotificationNotSupported: "Push notifications are not supported by this agent",
  UnsupportedOperation: "This operation is not supported",
  ContentTypeNotSupported: "The provided media type is not supported",
  InvalidAgentResponse: "The agent response does not conform to the specification",
  ExtendedAgentCardNotConfigured: "No extended agent card is configured",
  ExtensionSupportRequired: "A required extension was not declared by the client",
  VersionNotSupported: "The requested A2A protocol version is not supported",
};

/** The `google.rpc.ErrorInfo` detail object, with the `@type` §3.3.2 requires. */
export interface ErrorInfoDetail {
  "@type": "type.googleapis.com/google.rpc.ErrorInfo";
  reason: string;
  domain: string;
  metadata?: Record<string, string>;
}

/** The `google.rpc.BadRequest` detail object, for validation failures. */
export interface BadRequestDetail {
  "@type": "type.googleapis.com/google.rpc.BadRequest";
  fieldViolations: { field: string; description: string }[];
}

export type ErrorDetail = ErrorInfoDetail | BadRequestDetail;

/**
 * An error that knows its JSON-RPC code, its message and its details.
 *
 * Thrown by both sides: the server throws it to produce a conforming error
 * response, and the client throws it after decoding one, so a caller can branch
 * on `code` (or `a2aName`) in either direction instead of matching text.
 *
 * `a2aName` is set only for the errors §5.4 names. A plain JSON-RPC rejection
 * (`-32602 Invalid params` on bad input) has no A2A name and leaves it unset —
 * the two are different layers, and conflating them would let a caller think
 * "invalid params" meant "unsupported operation".
 */
export class A2aError extends Error {
  readonly a2aName?: A2aErrorName;
  readonly code: number;
  readonly details?: ErrorDetail[];
  /** the HTTP status a REST binding would use (§5.4) */
  readonly httpStatus: number;

  constructor(a2aName: A2aErrorName, message?: string, details?: ErrorDetail[]) {
    super(message ?? DEFAULT_MESSAGES[a2aName]);
    // The A2A error's own name is the class name, so `instanceof` works and a
    // log line reads like the spec's vocabulary.
    this.name = a2aName;
    this.a2aName = a2aName;
    this.code = A2A_ERROR_CODES[a2aName];
    this.details = details;
    this.httpStatus = HTTP_STATUS[a2aName];
  }
}

/** A JSON-RPC-level rejection: a standard code, no A2A name (§9.5). */
export class RpcError extends Error {
  readonly code: number;
  readonly details?: ErrorDetail[];
  readonly httpStatus: number;

  constructor(code: number, message: string, details?: ErrorDetail[], httpStatus = 400) {
    super(message);
    this.name = "RpcError";
    this.code = code;
    this.details = details;
    this.httpStatus = httpStatus;
  }
}

/** §5.4's HTTP column; used by the REST binding and by HTTP-level rejections. */
const HTTP_STATUS: Record<A2aErrorName, number> = {
  TaskNotFound: 404,
  TaskNotCancelable: 400,
  PushNotificationNotSupported: 400,
  UnsupportedOperation: 400,
  ContentTypeNotSupported: 400,
  InvalidAgentResponse: 500,
  ExtendedAgentCardNotConfigured: 400,
  ExtensionSupportRequired: 400,
  VersionNotSupported: 400,
};

/** A protocol version this agent cannot speak (§3.6.2). */
export function versionNotSupported(got: string, supported: string[]): A2aError {
  return new A2aError("VersionNotSupported", `The requested A2A protocol version ${got} is not supported by this agent`, [
    errorInfo("VERSION_NOT_SUPPORTED", { requestedVersion: got, supportedVersions: supported.join(",") }),
  ]);
}

export function taskNotFound(taskId: string): A2aError {
  return new A2aError("TaskNotFound", `Task ${taskId} not found`, [errorInfo("TASK_NOT_FOUND", { taskId })]);
}

export function taskNotCancelable(taskId: string, state: string): A2aError {
  return new A2aError("TaskNotCancelable", `Task ${taskId} is ${state} and cannot be canceled`, [
    errorInfo("TASK_NOT_CANCELABLE", { taskId, state }),
  ]);
}

/** Invalid parameters, with the offending fields named (§3.3.2 validation). */
export function invalidParams(violations: { field: string; description: string }[], message = "Invalid parameters"): RpcError {
  return new RpcError(RPC_ERROR_CODES.InvalidParams, message, [badRequest(violations)]);
}

export function errorInfo(reason: string, metadata?: Record<string, string>): ErrorInfoDetail {
  return {
    "@type": "type.googleapis.com/google.rpc.ErrorInfo",
    reason,
    domain: "a2a-protocol.org",
    ...(metadata ? { metadata } : {}),
  };
}

export function badRequest(fieldViolations: { field: string; description: string }[]): BadRequestDetail {
  return { "@type": "type.googleapis.com/google.rpc.BadRequest", fieldViolations };
}

/**
 * Decode a JSON-RPC `error` object into a typed error (§9.5).
 *
 * The `data` array is normalised to our two known detail shapes and anything
 * else is preserved verbatim, so an unexpected detail from a newer peer is
 * carried through rather than dropped.
 */
export function fromRpcError(err: { code: number; message: string; data?: unknown }): A2aError | RpcError {
  const name = (Object.keys(A2A_ERROR_CODES) as A2aErrorName[]).find((k) => A2A_ERROR_CODES[k] === err.code);
  const details = Array.isArray(err.data) ? (err.data as ErrorDetail[]) : undefined;
  if (name) return new A2aError(name, err.message, details);
  // A standard JSON-RPC code, or one we do not know: keep the number and text
  // rather than pretending it was an A2A error we understand.
  const httpStatus = err.code === RPC_ERROR_CODES.InvalidParams ? 400 : err.code === RPC_ERROR_CODES.MethodNotFound ? 404 : 500;
  return new RpcError(err.code, err.message, details, httpStatus);
}

/** Render an error as the JSON-RPC `error` member (§9.5). */
export function toRpcError(err: unknown): { code: number; message: string; data?: ErrorDetail[] } {
  if (err instanceof A2aError || err instanceof RpcError) {
    return { code: err.code, message: err.message, ...(err.details?.length ? { data: err.details } : {}) };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { code: RPC_ERROR_CODES.InternalError, message };
}

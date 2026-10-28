// The wire, in both dialects.
//
// These are the assertions that keep the protocol honest: a 1.0 payload has no
// `kind` discriminator (§A.2.1), enums are SCREAMING_SNAKE_CASE (§5.5), a
// timestamp is ISO 8601 UTC (§5.6.1), and a legacy peer's shape still decodes.
import { describe, expect, test } from "bun:test";
import {
  cardInterfaces,
  decodeArtifact,
  decodeMessage,
  decodePart,
  decodeState,
  decodeStreamResponse,
  decodeTask,
  dialectOf,
  encodeAgentCard,
  encodeMessage,
  encodePart,
  encodeStreamResponse,
  encodeTask,
  isoNow,
  normalizeVersion,
  partsText,
} from "../src/a2a/codec.ts";
import type { AgentCard, Task } from "../src/a2a/types.ts";
import {
  A2A_ERROR_CODES,
  A2aError,
  RPC_ERROR_CODES,
  fromRpcError,
  invalidParams,
  taskNotFound,
  toRpcError,
  versionNotSupported,
} from "../src/a2a/errors.ts";

describe("enums across dialects", () => {
  test("1.0 keeps SCREAMING_SNAKE_CASE; legacy maps to the 0.3 spelling", () => {
    expect(decodeState("TASK_STATE_COMPLETED")).toBe("TASK_STATE_COMPLETED");
    expect(decodeState("completed")).toBe("TASK_STATE_COMPLETED");
    expect(decodeState("TASK_STATE_INPUT_REQUIRED")).toBe("TASK_STATE_INPUT_REQUIRED");
    // the hyphenated legacy spellings that are easy to get wrong
    expect(decodeState("input-required")).toBe("TASK_STATE_INPUT_REQUIRED");
    expect(decodeState("auth-required")).toBe("TASK_STATE_AUTH_REQUIRED");
    expect(decodeState("unknown")).toBe("TASK_STATE_UNSPECIFIED");
    expect(decodeState(undefined)).toBe("TASK_STATE_UNSPECIFIED");
  });

  test("versions normalize to Major.Minor and pick a dialect (§3.6)", () => {
    expect(normalizeVersion("1.0.0")).toBe("1.0");
    expect(normalizeVersion("v1.0")).toBe("1.0");
    expect(normalizeVersion(" 0.3.0 ")).toBe("0.3");
    expect(dialectOf("1.0.2")).toBe("1.0");
    expect(dialectOf("0.3")).toBe("legacy");
  });

  test("a timestamp is ISO 8601 UTC with Z, milliseconds (§5.6.1)", () => {
    const iso = isoNow(Date.UTC(2026, 0, 2, 3, 4, 5, 678));
    expect(iso).toBe("2026-01-02T03:04:05.678Z");
    expect(iso.endsWith("Z")).toBe(true);
    // no offset other than Z is allowed
    expect(/[+-]\d\d:\d\d$/.test(iso)).toBe(false);
  });
});

describe("parts", () => {
  test("1.0 text part has no kind discriminator", () => {
    expect(encodePart({ text: "hi" }, "1.0")).toEqual({ text: "hi" });
    expect(encodePart({ text: "hi" }, "legacy")).toEqual({ kind: "text", text: "hi" });
  });

  test("a file part flattens in 1.0 and nests under `file` in 0.3", () => {
    const one = encodePart({ raw: "AAAA", filename: "a.png", mediaType: "image/png" }, "1.0");
    expect(one).toEqual({ raw: "AAAA", filename: "a.png", mediaType: "image/png" });
    const old = encodePart({ raw: "AAAA", filename: "a.png", mediaType: "image/png" }, "legacy");
    expect(old).toEqual({ kind: "file", file: { name: "a.png", mimeType: "image/png", fileWithBytes: "AAAA" } });
  });

  test("a file part round-trips from both spellings", () => {
    const fromNew = decodePart({ url: "https://x/y.png", mediaType: "image/png" });
    expect(fromNew).toEqual({ url: "https://x/y.png", mediaType: "image/png" });
    const fromOld = decodePart({ kind: "file", file: { fileWithUri: "https://x/y.png", mimeType: "image/png" } });
    expect(fromOld).toEqual({ url: "https://x/y.png", mediaType: "image/png" });
  });

  test("a data part keeps its payload and media type", () => {
    expect(encodePart({ data: { a: 1 }, mediaType: "application/json" }, "1.0")).toEqual({
      data: { a: 1 },
      mediaType: "application/json",
    });
    expect(decodePart({ kind: "data", data: { a: 1 } })).toEqual({ data: { a: 1 } });
  });

  test("an unknown part is dropped, never guessed at", () => {
    // putting a made-up reading of an unknown part into a prompt is worse than
    // dropping it
    expect(decodePart({ kind: "video", url: "x" })).toBeNull();
    expect(decodePart({ nothing: true })).toBeNull();
    expect(partsText([{ text: "a" }, { kind: "video" }, { text: "b" }])).toBe("a\nb");
  });
});

describe("messages and tasks", () => {
  const msg = { messageId: "m1", role: "ROLE_USER" as const, parts: [{ text: "hello" }], contextId: "c1" };

  test("a 1.0 message carries camelCase fields and no kind", () => {
    expect(encodeMessage(msg, "1.0")).toEqual({
      messageId: "m1",
      role: "ROLE_USER",
      parts: [{ text: "hello" }],
      contextId: "c1",
    });
  });

  test("a legacy message keeps kind:message and the lowercased role", () => {
    expect(encodeMessage(msg, "legacy")).toEqual({
      kind: "message",
      messageId: "m1",
      role: "user",
      parts: [{ kind: "text", text: "hello" }],
      contextId: "c1",
    });
  });

  test("a task round-trips through encode/decode in both dialects", () => {
    const task: Task = {
      id: "t1",
      contextId: "c1",
      status: { state: "TASK_STATE_COMPLETED", timestamp: "2026-01-02T03:04:05.678Z" },
      artifacts: [{ artifactId: "a1", parts: [{ text: "done" }] }],
      history: [msg],
    };
    for (const d of ["1.0", "legacy"] as const) {
      const back = decodeTask(encodeTask(task, d));
      expect(back).toEqual(task);
    }
  });

  test("historyLength 0 omits history entirely, not as an empty array (§3.2.4)", () => {
    const wire = encodeTask({ id: "t1", status: { state: "TASK_STATE_WORKING" } }, "1.0");
    expect("history" in wire).toBe(false);
  });

  test("artifacts decode in both spellings", () => {
    expect(decodeArtifact({ artifactId: "a", parts: [{ text: "x" }] })).toEqual({ artifactId: "a", parts: [{ text: "x" }] });
  });
});

describe("stream responses (§3.2.3, §A.2.1)", () => {
  test("1.0 discriminates by member name, not by a kind field", () => {
    const wire = encodeStreamResponse(
      { statusUpdate: { taskId: "t1", status: { state: "TASK_STATE_WORKING" } } },
      "1.0",
    );
    expect(Object.keys(wire)).toEqual(["statusUpdate"]);
    expect(JSON.stringify(wire)).not.toContain('"kind"');
  });

  test("legacy puts kind inside the event, and keeps `final` for its own loop", () => {
    const wire = encodeStreamResponse(
      { statusUpdate: { taskId: "t1", status: { state: "TASK_STATE_COMPLETED" } } },
      "legacy",
    );
    expect(wire.kind).toBe("status-update");
    expect(wire.taskId).toBe("t1");
    expect(wire.status).toEqual({ state: "completed" });
    expect(wire.final).toBe(true);
  });

  test("both spellings decode to the same internal frame", () => {
    const modern = decodeStreamResponse({ statusUpdate: { taskId: "t1", status: { state: "TASK_STATE_COMPLETED" } } });
    const legacy = decodeStreamResponse({ kind: "status-update", taskId: "t1", status: { state: "completed" } });
    expect(modern).toEqual(legacy);
    expect(modern).toEqual({ statusUpdate: { taskId: "t1", status: { state: "TASK_STATE_COMPLETED" } } });
  });

  test("an artifact-update carries lastChunk and append", () => {
    const wire = encodeStreamResponse(
      { artifactUpdate: { taskId: "t1", artifact: { artifactId: "a", parts: [{ text: "x" }] }, append: true, lastChunk: true } },
      "1.0",
    );
    const back = decodeStreamResponse(wire);
    expect(back).toEqual({
      artifactUpdate: { taskId: "t1", artifact: { artifactId: "a", parts: [{ text: "x" }] }, append: true, lastChunk: true },
    });
  });

  test("an unknown frame type is skipped, not fatal", () => {
    expect(decodeStreamResponse({ somethingNew: {} })).toBeNull();
    expect(decodeStreamResponse({ kind: "future" })).toBeNull();
  });

  test("a task frame in either dialect decodes", () => {
    const modern = decodeStreamResponse({ task: { id: "t1", status: { state: "TASK_STATE_WORKING" } } });
    const legacy = decodeStreamResponse({ kind: "task", id: "t1", status: { state: "working" } });
    expect(modern && "task" in modern ? modern.task.id : null).toBe("t1");
    expect(legacy && "task" in legacy ? legacy.task.id : null).toBe("t1");
  });
});

describe("agent card (§8.3)", () => {
  const card: AgentCard = {
    name: "A",
    description: "d",
    supportedInterfaces: [
      { url: "https://x/a2a/v1", protocolBinding: "JSONRPC", protocolVersion: "1.0" },
      { url: "https://x/a2a/grpc", protocolBinding: "GRPC", protocolVersion: "1.0" },
    ],
    version: "1.2.0",
    capabilities: { streaming: true, pushNotifications: false },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: [{ id: "s", name: "S" }],
  };

  test("1.0 declares transports in supportedInterfaces", () => {
    const wire = encodeAgentCard(card, "1.0");
    expect(wire.supportedInterfaces).toHaveLength(2);
    expect(wire.url).toBeUndefined();
    expect(wire.preferredTransport).toBeUndefined();
  });

  test("a legacy card gets url + preferredTransport, which 0.3 clients read", () => {
    const wire = encodeAgentCard(card, "legacy");
    expect(wire.url).toBe("https://x/a2a/v1");
    expect(wire.preferredTransport).toBe("JSONRPC");
    expect(wire.protocolVersion).toBe("1.0");
    // the rest of the list survives as additionalInterfaces
    expect(wire.additionalInterfaces).toEqual([{ url: "https://x/a2a/grpc", transport: "GRPC" }]);
  });

  test("both card spellings yield the same interface list, in order", () => {
    const modern = cardInterfaces(encodeAgentCard(card, "1.0"));
    const legacy = cardInterfaces(encodeAgentCard(card, "legacy"));
    expect(modern[0].url).toBe("https://x/a2a/v1");
    expect(legacy[0].url).toBe("https://x/a2a/v1");
    expect(legacy[1].url).toBe("https://x/a2a/grpc");
  });

  test("a 0.3 card's missing protocolVersion reads as 0.3, not 1.0", () => {
    const legacyOnly = cardInterfaces({ url: "https://old", preferredTransport: "JSONRPC" });
    expect(legacyOnly[0].version).toBe("0.3");
  });
});

describe("errors (§3.3.2, §5.4, §9.5)", () => {
  test("every A2A error has the code §5.4 assigns it", () => {
    expect(taskNotFound("t9").code).toBe(-32001);
    expect(new A2aError("TaskNotCancelable").code).toBe(-32002);
    expect(new A2aError("PushNotificationNotSupported").code).toBe(-32003);
    expect(new A2aError("UnsupportedOperation").code).toBe(-32004);
    expect(new A2aError("ContentTypeNotSupported").code).toBe(-32005);
    expect(new A2aError("InvalidAgentResponse").code).toBe(-32006);
    expect(new A2aError("ExtendedAgentCardNotConfigured").code).toBe(-32007);
    expect(new A2aError("ExtensionSupportRequired").code).toBe(-32008);
    expect(new A2aError("VersionNotSupported").code).toBe(-32009);
  });

  test("a task-not-found error names its task in a typed detail object", () => {
    const e = taskNotFound("t9");
    expect(e.details?.[0]["@type"]).toBe("type.googleapis.com/google.rpc.ErrorInfo");
    expect((e.details?.[0] as any).metadata.taskId).toBe("t9");
    expect((e.details?.[0] as any).domain).toBe("a2a-protocol.org");
  });

  test("validation failures use -32602 with a BadRequest detail", () => {
    const e = invalidParams([{ field: "message.parts", description: "At least one part is required" }]);
    expect(e.code).toBe(RPC_ERROR_CODES.InvalidParams);
    const wire = toRpcError(e);
    expect(wire.code).toBe(-32602);
    expect((wire.data?.[0] as any).fieldViolations[0].field).toBe("message.parts");
  });

  test("a decoded error keeps its code, message and details", () => {
    const back = fromRpcError({ code: -32001, message: "Task not found", data: [{ "@type": "x", reason: "R" } as any] });
    expect(back.code).toBe(-32001);
    expect(back.message).toBe("Task not found");
    expect(back).toBeInstanceOf(A2aError);
    expect((back as A2aError).a2aName).toBe("TaskNotFound");
  });

  test("an unknown code is preserved rather than relabelled as a known error", () => {
    const back = fromRpcError({ code: -32042, message: "from a newer peer" });
    expect(back.code).toBe(-32042);
    // it must NOT claim to be one of the A2A errors we know
    expect(back instanceof A2aError ? back.a2aName : undefined).toBeUndefined();
  });

  test("version negotiation names both the requested and the supported versions", () => {
    const e = versionNotSupported("0.5", ["1.0", "0.3"]);
    expect(e.code).toBe(-32009);
    expect(e.httpStatus).toBe(400);
    expect((e.details?.[0] as any).metadata.requestedVersion).toBe("0.5");
    expect((e.details?.[0] as any).metadata.supportedVersions).toBe("1.0,0.3");
  });

  test("an unexpected throw becomes InternalError, never a leaked stack", () => {
    const wire = toRpcError(new Error("boom"));
    expect(wire.code).toBe(RPC_ERROR_CODES.InternalError);
    expect(wire.message).toBe("boom");
    expect(JSON.stringify(wire)).not.toContain("at ");
  });
});

describe("messages: role and field normalization", () => {
  test("a 0.3 message decodes to the same internal shape as a 1.0 one", () => {
    const old = decodeMessage({ kind: "message", role: "user", parts: [{ kind: "text", text: "x" }], messageId: "m" });
    const now = decodeMessage({ role: "ROLE_USER", parts: [{ text: "x" }], messageId: "m" });
    expect(old).toEqual(now);
    expect(now?.role).toBe("ROLE_USER");
  });

  test("referenceTaskIds survives a round trip", () => {
    const m = { messageId: "m", role: "ROLE_USER" as const, parts: [{ text: "x" }], referenceTaskIds: ["t1", "t2"] };
    expect(decodeMessage(encodeMessage(m, "1.0"))).toEqual(m);
  });
});

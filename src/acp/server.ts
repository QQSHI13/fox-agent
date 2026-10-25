/**
 * fox as an ACP agent — `fox --acp`, driven by Zed, acpx, or any ACP client.
 *
 * This is a protocol skin over `runTurnCore` and the session store, not a second
 * loop: every handler below delegates to a primitive that already existed for the
 * TUI. `session/new` is `createSession`, `session/fork` is `forkSession`,
 * `session/prompt` is one `runTurnCore` generator piped through
 * `toSessionUpdate`. Anything that looks like turn logic in here is a bug.
 *
 * One deliberate non-implementation:
 *
 * - **fox-agent never calls `session/request_permission`.** fox-agent is a no-prompt harness
 *   by design (see the security model in the README); tools just run. A client
 *   connecting to fox-agent will never be asked to approve anything, which it must know
 *   before pointing fox-agent at code it doesn't trust. The nearest real control
 *   is the `read-only` session mode below, which withholds the mutating tools
 *   instead of asking about each call.
 */
import * as acp from "@agentclientprotocol/sdk/unstable";
import { RequestError } from "@agentclientprotocol/sdk/unstable";
import {
  createSession,
  deleteSession,
  forkSession,
  getSession,
  listSessions,
  pinSession,
  unpinSession,
  type MessageRow,
} from "../store/db.ts";
import { projectView } from "../context/view.ts";
import { acquireLock, releaseLock, lockHolder } from "../store/lock.ts";
import type { Config, McpServerConfig } from "../core/config.ts";
import type { ProviderConfig, ChatFn } from "../providers/types.ts";
import { availableProviders, resolveChat } from "../providers/index.ts";
import { runTurnCore } from "../loop/turn.ts";
import { attachHost, detachHost, abortTurn, turnRunning, releaseSteer, waitQuiescent, adoptTurnController } from "../loop/steer.ts";
import { shutdownTools } from "../tools/index.ts";
import { lookupModel } from "../providers/models.ts";
import { VERSION } from "../core/version.ts";
import { REASONING_EFFORTS, type ReasoningEffort } from "../core/reasoning.ts";
import { getTodos } from "../tools/todo.ts";
import { stopReasonFor, toolKind, toSessionUpdate, planForToolEnd, modeUpdate } from "./updates.ts";

export interface AcpServerOptions {
  config: Config;
  provider: ProviderConfig;
  /** injected in tests; production uses the real provider */
  chat?: ChatFn;
}

const SAFE_ID = /^[A-Za-z0-9_-]+$/;
/** Client-controlled ids must never become paths (locks/../../x). */
function checkId(id: string): void {
  if (!SAFE_ID.test(id)) throw RequestError.invalidParams(undefined, `invalid session id`);
}

/**
 * Session modes, backed by the one tool distinction fox-agent actually has.
 *
 * ACP clients render these as a per-session picker (Zed calls them "modes" and
 * puts them next to the model). `read-only` withholds the tools that mutate the
 * machine — the same set a reviewer would want withheld — rather than prompting
 * per call, which this harness never does.
 */
const MODES = [
  { id: "agent", name: "Agent", description: "Full tool access — read, write, edit, exec." },
  { id: "read-only", name: "Read-only", description: "Inspect only: the mutating tools and the two that could run them anyway are withheld." },
] as const;
/**
 * Tools a `read-only` session may not call.
 *
 * `write`/`edit`/`exec`/`pty` are the obvious ones. `repl` and `task` are here
 * for the same reason and were the leak: a vm context seeded with the real
 * `process` can spawn a child or `import("node:fs")`, and `task` starts another
 * agent with the full registry — either is a one-line way around the mode.
 * `ctx` stays: it edits the window, not the disk.
 */
const READ_ONLY_EXCLUDED = ["write", "edit", "exec", "pty", "repl", "task"];

/**
 * Text content of one ACP prompt request, flattened for fox-agent's single-string turn API.
 *
 * `resource_link` keeps its `@` form (that is how fox-agent's own prompt parser
 * recognises one); an embedded `resource` becomes uri + text.
 */
function promptText(blocks: acp.ContentBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "text") parts.push(b.text);
    else if (b.type === "resource_link") parts.push(`@${b.uri}`);
    else if (b.type === "resource" && "text" in b.resource) parts.push(`${b.resource.uri}:\n${b.resource.text}`);
    // image/audio blocks are not advertised in promptCapabilities, so a
    // conforming client will not send them; silently dropping beats crashing.
  }
  return parts.join("\n").trim();
}

/**
 * Which replayed nodes a loading client gets, per `config.acpHistory`.
 * "last" keeps the final user message and everything after it — the exchange
 * the user came back to — without shipping the whole transcript.
 */
export function selectHistory<T extends { msg: MessageRow; deleted?: boolean }>(
  nodes: T[],
  scope: Config["acpHistory"],
): T[] {
  const visible = nodes.filter((n) => !n.deleted);
  if (scope === "full") return visible;
  if (typeof scope === "number") return visible.slice(-scope);
  const lastUser = visible.map((n, i) => (n.msg.role === "user" ? i : -1)).filter((i) => i >= 0).pop();
  return lastUser === undefined ? visible : visible.slice(lastUser);
}

async function replay(
  sessionId: string,
  scope: Config["acpHistory"],
  notify: (u: acp.SessionUpdate) => Promise<void>,
): Promise<void> {
  for (const node of selectHistory(projectView(sessionId), scope)) {
    const msg: MessageRow = node.msg;
    const text = node.content;
    if (msg.role === "user") await notify({ sessionUpdate: "user_message_chunk", content: { type: "text", text } });
    else if (msg.role === "assistant") {
      if (text) await notify({ sessionUpdate: "agent_message_chunk", content: { type: "text", text } });
      for (const call of parseCalls(msg.tool_calls)) {
        await notify({
          sessionUpdate: "tool_call",
          toolCallId: call.id,
          title: call.name,
          name: call.name,
          kind: toolKind(call.name),
          status: "completed",
          rawInput: call.arguments,
        });
      }
    } else if (msg.role === "think") await notify({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text } });
    else if (msg.role === "tool" && msg.tool_call_id) {
      await notify({
        sessionUpdate: "tool_call_update",
        toolCallId: msg.tool_call_id,
        status: msg.error ? "failed" : "completed",
        content: [{ type: "content", content: { type: "text", text } }],
      });
    }
    // role "system" is fox-agent's own bookkeeping (step limits, provider errors) and
    // has no ACP equivalent that isn't a lie about who said it.
  }
}

function parseCalls(raw: string | null): Array<{ id: string; name: string; arguments: string }> {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * ACP `mcpServers` -> fox-agent's `[mcpServers.*]` table.
 *
 * Only stdio maps: fox-agent's MCP bridge spawns a child and speaks stdio, so an
 * `http`/`sse`/`acp` server has nowhere to go. `initialize` advertises
 * `mcpCapabilities: {http: false, sse: false}`, so a conforming client never
 * sends one; one that does gets a refusal naming the server rather than a
 * session missing the tools it asked for.
 */
function mcpServersFrom(list: acp.McpServer[] | undefined): Record<string, McpServerConfig> {
  const servers: Record<string, McpServerConfig> = {};
  for (const s of list ?? []) {
    // `McpServerStdio` carries no `type` discriminant, so presence of `command`
    // is what distinguishes it from the http/sse/acp variants.
    if (!("command" in s)) {
      throw RequestError.invalidParams(undefined, `mcp server '${s.name}': fox-agent supports stdio MCP servers only, not '${s.type}'`);
    }
    const env: Record<string, string> = {};
    for (const e of s.env ?? []) env[e.name] = e.value;
    servers[s.name] = { command: s.command, args: s.args ?? [], env };
  }
  return servers;
}

/**
 * ACP `systemPrompt` -> text appended to the project instructions.
 *
 * `append` is the only mode advertising `sessionCapabilities.systemPrompt`
 * implies. `override` would have to replace fox-agent's own project
 * instructions, which is a different promise, so it is refused instead of being
 * silently treated as append — the spec requires the error.
 */
function systemPromptText(p: acp.SystemPrompt | null | undefined): string {
  if (!p) return "";
  if (p.mode !== "append") {
    throw RequestError.invalidParams(undefined, `unsupported systemPrompt mode ${JSON.stringify(p.mode)}: this agent appends only`);
  }
  const parts: string[] = [];
  for (const b of p.content ?? []) {
    if (b.type !== "text") throw RequestError.invalidParams(undefined, `unsupported systemPrompt content '${b.type}'`);
    parts.push(b.text);
  }
  return parts.join("\n");
}

/**
 * Build the agent app. Exported separately from `runAcpServer` so tests can pair
 * it to a client in-process — `client().connectWith(buildAgent(...), …)` — with
 * no subprocess and no stdio.
 */
export function buildAgent(opts: AcpServerOptions): acp.AgentApp {
  const { config, provider } = opts;
  const chat = opts.chat ?? resolveChat;

  /** per-session model override, set by `session/set_config_option`; a session
   * without an entry uses the process's configured provider.model. */
  const sessionModels = new Map<string, string>();
  /** per-session reasoning effort (`thought_level` config option). */
  const sessionEffort = new Map<string, ReasoningEffort>();
  /** per-session mode id, defaulting to `agent`. */
  const sessionModes = new Map<string, string>();
  /** per-session system prompt appended to the project instructions. */
  const sessionInstructions = new Map<string, string>();
  /** per-session MCP servers the client passed, merged over the config's. */
  const sessionMcp = new Map<string, Record<string, McpServerConfig>>();
  /** `providers/set` overrides, keyed by provider id. */
  const providerOverrides = new Map<string, { apiType: string; baseUrl: string; headers?: Record<string, string> }>();
  /** `providers/disable` ids: reported as `current: null`, so a client sees it worked. */
  const disabledProviders = new Set<string>();
  /** `logout` clears the in-memory key; a restart re-reads it from the config. */
  let loggedOut = false;
  /** `initialize` records whether the client can render `notice`; the spec forbids
   *  sending one to a client that did not advertise it. */
  let clientNotices = false;

  /**
   * The provider id `providers/*` addresses.
   *
   * `provider.label` is absent for a bare wire format, and both sides of the
   * `providers/set` / `providerFor` pair must agree on the key — the earlier
   * `label ?? provider.provider` lookup could never match an override stored
   * under the id the client sent, so the call reported success and did nothing.
   */
  const providerId = provider.label ?? config.provider;

  const modeOf = (sessionId: string) => sessionModes.get(sessionId) ?? "agent";
  const modesFor = (sessionId: string) => ({ currentModeId: modeOf(sessionId), availableModes: MODES.map((m) => ({ id: m.id, name: m.name, description: m.description })) });

  /** The option set a client renders for one session. */
  function configOptionsFor(sessionId: string) {
    const model = sessionModels.get(sessionId) ?? provider.model;
    const effort = sessionEffort.get(sessionId);
    return [
      {
        id: "model",
        name: "Model",
        description: "The model this session routes its turns to.",
        category: "model",
        type: "select" as const,
        currentValue: model,
        // The configured model plus whatever the endpoint is known to serve
        // would be a network call per initialize; one honest entry is better
        // than a list the server cannot back up.
        options: [{ value: provider.model, name: provider.model }],
      },
      {
        id: "thought_level",
        name: "Reasoning effort",
        description: "How much the model is asked to reason before answering.",
        category: "thought_level",
        type: "select" as const,
        currentValue: effort ?? "default",
        options: [{ value: "default", name: "Provider default" }, ...REASONING_EFFORTS.map((e) => ({ value: e, name: e }))],
      },
    ];
  }

  /** The provider a session's turns use: overrides, then the session's model. */
  function providerFor(sessionId: string): ProviderConfig {
    const model = sessionModels.get(sessionId) ?? provider.model;
    const base: ProviderConfig = { ...provider, model };
    const effort = sessionEffort.get(sessionId);
    if (effort) base.sampling = { ...base.sampling, reasoningEffort: effort };
    // logout drops the key for this process regardless of whether an endpoint
    // override was set — it was inside the override branch, so a session with
    // no override kept prompting with the key it had just logged out of
    if (loggedOut) base.apiKey = "";
    const ov = providerOverrides.get(providerId);
    if (!ov) return base;
    return {
      ...base,
      baseUrl: ov.baseUrl,
      provider: ov.apiType === "openai" ? "openai-compatible" : ov.apiType,
      headers: { ...base.headers, ...ov.headers },
    };
  }

  /** The config a session's turns use: per-session MCP servers merged over the global table. */
  function configFor(sessionId: string): Config {
    const extra = sessionMcp.get(sessionId);
    const instructions = sessionInstructions.get(sessionId);
    if (!extra && !instructions) return config;
    return {
      ...config,
      mcpServers: extra ? { ...config.mcpServers, ...extra } : config.mcpServers,
      projectInstructions: instructions ? `${config.projectInstructions}\n\n${instructions}`.trim() : config.projectInstructions,
    };
  }

  /** Drop the per-session state. `session/delete` and `session/close` both end a
   *  session's life for this process, so both must leave nothing behind. */
  function forget(sessionId: string): void {
    sessionModels.delete(sessionId);
    sessionEffort.delete(sessionId);
    sessionModes.delete(sessionId);
    sessionInstructions.delete(sessionId);
    sessionMcp.delete(sessionId);
    sessionClients.delete(sessionId);
  }

  /**
   * Run one turn and stream it to the client.
   *
   * Which turn runs, and when, is core's decision (src/loop/steer.ts) — this
   * function is the protocol skin: map events to `session/update` notifications
   * and report the stop reason. `session/prompt` and an auto-started steered
   * turn both come through here, so they cannot diverge on pinning, aborting or
   * stop-reason mapping.
   */
  async function* turnEvents(
    sessionId: string,
    text: string,
    signal: AbortSignal,
    client: { notify: (method: string, params: unknown) => Promise<unknown> },
  ): AsyncGenerator<import("../core/events.ts").AgentEvent> {
    const turnProvider = providerFor(sessionId);
    const turnContextWindow = lookupModel(turnProvider.model).contextWindow;
    // Pin the handle for the turn's lifetime, exactly as the TUI does: the
    // client may interleave session/list / session/load / session/fork (each
    // opens other session dbs), and an unpinned handle is the LRU-oldest —
    // the picker eviction that closes it mid-append is the RangeError the
    // pin exists to prevent.
    pinSession(sessionId);
    try {
      for await (const ev of runTurnCore(sessionId, turnProvider, text, signal, {
        maxSteps: config.maxSteps,
        retryLimit: config.retryLimit,
        compactWarnAt: config.compactWarnAt,
        compactCtxOnlyAt: config.compactCtxOnlyAt,
        projectInstructions: configFor(sessionId).projectInstructions,
        config: configFor(sessionId),
        chat,
        // a read-only session withholds the mutating tools instead of asking
        // about each call — see MODES
        excludeTools: modeOf(sessionId) === "read-only" ? READ_ONLY_EXCLUDED : undefined,
      })) {
        const update = ev.type === "done" ? null : toSessionUpdate(ev, { contextWindow: turnContextWindow, notices: clientNotices });
        if (update) await client.notify(acp.methods.client.session.update, { sessionId, update });
        // the checklist is a SECOND update for one event, and only a successful
        // `todo` produces it — read the list here rather than on every token
        if (ev.type === "tool_end" && ev.name === "todo" && ev.ok) {
          const plan = planForToolEnd(ev, getTodos(sessionId));
          if (plan) await client.notify(acp.methods.client.session.update, { sessionId, update: plan });
        }
        yield ev;
      }
    } finally {
      // release the pin the turn held; the next prompt re-pins
      unpinSession(sessionId);
    }
  }

  /** The client attached to a session — kept from the last prompt, because a
   *  steered turn may start with no request in flight to carry a client. */
  const sessionClients = new Map<string, { notify: (method: string, params: unknown) => Promise<unknown> }>();

  /**
   * Attach this ACP client as the session's host: core starts turns for steered
   * text (a background job finishing, typically) and this is how their events
   * reach the editor. Without it, a steer could only be answered by whatever
   * the user typed next — the original bug.
   */
  function attachSteer(sessionId: string, client: { notify: (method: string, params: unknown) => Promise<unknown> }): void {
    sessionClients.set(sessionId, client);
    attachHost(sessionId, {
      provider: () => providerFor(sessionId),
      config: () => configFor(sessionId),
      chat,
      turn: (text, ctl) => turnEvents(sessionId, text, ctl.signal, sessionClients.get(sessionId) ?? client),
    });
  }

  /** Announce the per-session state a client renders as chrome, not as messages. */
  async function announce(sessionId: string, client: { notify: (method: string, params: unknown) => Promise<unknown> }) {
    // No `available_commands_update`: the ACP prompt path feeds the text straight
    // to the turn loop, and slash commands are parsed by the TUI only, so a menu
    // here would send "/new" to the model as prose.
    await client.notify(acp.methods.client.session.update, { sessionId, update: modeUpdate(modeOf(sessionId)) });
  }

  return acp
    .agent({ name: "fox-agent" })
    .onRequest(acp.methods.agent.initialize, async ({ params }) => {
      clientNotices = !!params.clientCapabilities?.session?.notices;
      return {
        protocolVersion: acp.PROTOCOL_VERSION,
        agentInfo: { name: "fox-agent", version: VERSION },
        agentCapabilities: {
          loadSession: true,
          // text and embedded resources only: fox-agent's turn API takes one
          // string, so an image block would have nowhere to go
          promptCapabilities: { embeddedContext: true, image: false, audio: false },
          mcpCapabilities: { http: false, sse: false },
          // each `{}` advertises support; omitted means unsupported. No
          // `additionalDirectories`: no handler reads the field, and advertising
          // it would tell a client its extra roots were accepted.
          sessionCapabilities: { list: {}, delete: {}, fork: {}, resume: {}, close: {}, systemPrompt: {} },
          // `logout` is the only auth op with a meaning here: it drops the API
          // key for this process. There is no login flow — the key comes from the
          // config or the environment.
          auth: { logout: {} },
          providers: {},
        },
        // No `authMethods`: there is no interactive login an editor could drive.
        // Advertising one would make every client offer a button that cannot work.
        authMethods: [],
      };
    })
    .onRequest(acp.methods.agent.authenticate, async ({ params }) => {
      // Nothing to do: fox-agent's credential is the configured API key, and no
      // method it could advertise would change that. Accepted rather than
      // refused so a client that calls it anyway is not left with an error it
      // cannot act on.
      if (!params.methodId) throw RequestError.invalidParams(undefined, "methodId is required");
      return {};
    })
    .onRequest(acp.methods.agent.logout, async () => {
      loggedOut = true;
      return {};
    })
    .onRequest(acp.methods.agent.providers.list, async () => ({
      providers: [
        ...Object.keys(config.providers).map((id) => {
          const p = config.providers[id]!;
          const ov = providerOverrides.get(id);
          return {
            providerId: id,
            supported: [p.format ?? "openai-compatible"],
            // in use by this process right now — the one an editor must show as active
            required: config.provider === id,
            current: disabledProviders.has(id)
              ? null
              : { apiType: ov?.apiType ?? p.format ?? "openai-compatible", baseUrl: ov?.baseUrl ?? p.baseUrl ?? config.baseUrl },
          };
        }),
        // wire formats with no profile behind them, so a client can still show
        // what the process could route to
        ...availableProviders()
          .filter((f) => !config.providers[f])
          .map((f) => ({
            providerId: f,
            supported: [f],
            required: config.provider === f,
            current: disabledProviders.has(f)
              ? null
              : config.provider === f || providerOverrides.has(f)
                ? { apiType: providerOverrides.get(f)?.apiType ?? f, baseUrl: providerOverrides.get(f)?.baseUrl ?? config.baseUrl }
                : null,
          })),
      ],
    }))
    .onRequest(acp.methods.agent.providers.set, async ({ params }) => {
      if (!params.providerId) throw RequestError.invalidParams(undefined, "providerId is required");
      if (!/^https?:\/\//.test(params.baseUrl ?? "")) {
        throw RequestError.invalidParams(undefined, `baseUrl must be an http(s) URL`);
      }
      // An id this process cannot route to would be an override nothing reads.
      if (params.providerId !== providerId && !config.providers[params.providerId] && !availableProviders().includes(params.providerId)) {
        throw RequestError.invalidParams(undefined, `unknown provider ${JSON.stringify(params.providerId)} — see providers/list`);
      }
      providerOverrides.set(params.providerId, { apiType: params.apiType, baseUrl: params.baseUrl.replace(/\/$/, ""), headers: params.headers });
      disabledProviders.delete(params.providerId);
      return {};
    })
    .onRequest(acp.methods.agent.providers.disable, async ({ params }) => {
      if (!params.providerId) throw RequestError.invalidParams(undefined, "providerId is required");
      if (params.providerId === providerId) {
        throw RequestError.invalidParams(undefined, `provider ${JSON.stringify(params.providerId)} is required and cannot be disabled`);
      }
      providerOverrides.delete(params.providerId);
      disabledProviders.add(params.providerId);
      return {};
    })
    .onRequest(acp.methods.agent.session.setConfigOption, async ({ params }) => {
      checkId(params.sessionId);
      if (!getSession(params.sessionId)) throw RequestError.resourceNotFound(params.sessionId);
      if (params.configId === "model") {
        // A select option sends the value id; boolean options send a boolean.
        if (typeof params.value === "boolean") {
          throw RequestError.invalidParams(undefined, "model config expects a value id, not a boolean");
        }
        const model = String(params.value);
        if (!lookupModel(model)) throw RequestError.invalidParams(undefined, `unknown model ${JSON.stringify(model)}`);
        sessionModels.set(params.sessionId, model);
      } else if (params.configId === "thought_level") {
        if (typeof params.value === "boolean") {
          throw RequestError.invalidParams(undefined, "thought_level config expects a value id, not a boolean");
        }
        const v = String(params.value);
        if (v === "default") sessionEffort.delete(params.sessionId);
        else if ((REASONING_EFFORTS as readonly string[]).includes(v)) sessionEffort.set(params.sessionId, v as ReasoningEffort);
        else throw RequestError.invalidParams(undefined, `unknown reasoning effort ${JSON.stringify(v)}`);
      } else {
        throw RequestError.invalidParams(undefined, `unknown config option ${JSON.stringify(params.configId)}`);
      }
      return { configOptions: configOptionsFor(params.sessionId) };
    })
    .onRequest(acp.methods.agent.session.setMode, async ({ params, client }) => {
      checkId(params.sessionId);
      if (!getSession(params.sessionId)) throw RequestError.resourceNotFound(params.sessionId);
      if (!MODES.some((m) => m.id === params.modeId)) {
        throw RequestError.invalidParams(undefined, `unknown mode ${JSON.stringify(params.modeId)}`);
      }
      sessionModes.set(params.sessionId, params.modeId);
      await client.notify(acp.methods.client.session.update, { sessionId: params.sessionId, update: modeUpdate(params.modeId) });
      return {};
    })
    .onRequest(acp.methods.agent.session.new, async ({ params, client }) => {
      const s = createSession(params.cwd, provider.model);
      acquireLock(s.id, "acp");
      const mcp = mcpServersFrom(params.mcpServers);
      if (Object.keys(mcp).length) sessionMcp.set(s.id, mcp);
      if (params.systemPrompt) sessionInstructions.set(s.id, systemPromptText(params.systemPrompt));
      await announce(s.id, client);
      return { sessionId: s.id, modes: modesFor(s.id), configOptions: configOptionsFor(s.id) };
    })
    .onRequest(acp.methods.agent.session.list, async ({ params }) => {
      // `cursor` is an opaque offset into the same ordered list; a client pages
      // by echoing nextCursor back. Absent cursor = first page.
      const limit = 50;
      const offset = params.cursor ? Number(params.cursor) : 0;
      if (!Number.isInteger(offset) || offset < 0) throw RequestError.invalidParams(undefined, "invalid cursor");
      const all = listSessions(0, params.cwd ?? undefined);
      const page = all.slice(offset, offset + limit);
      return {
        sessions: page.map((s) => ({
          sessionId: s.id,
          cwd: s.cwd,
          title: s.title ?? undefined,
          updatedAt: new Date(s.updated_at).toISOString(),
        })),
        nextCursor: offset + limit < all.length ? String(offset + limit) : undefined,
      };
    })
    .onRequest(acp.methods.agent.session.load, async ({ params, client }) => {
      checkId(params.sessionId);
      if (!getSession(params.sessionId)) throw RequestError.resourceNotFound(params.sessionId);
      acquireLock(params.sessionId, "acp");
      const mcp = mcpServersFrom(params.mcpServers);
      if (Object.keys(mcp).length) sessionMcp.set(params.sessionId, mcp);
      if (params.systemPrompt) sessionInstructions.set(params.sessionId, systemPromptText(params.systemPrompt));
      await replay(params.sessionId, config.acpHistory, (update) =>
        client.notify(acp.methods.client.session.update, { sessionId: params.sessionId, update }),
      );
      await announce(params.sessionId, client);
      return { modes: modesFor(params.sessionId), configOptions: configOptionsFor(params.sessionId) };
    })
    .onRequest(acp.methods.agent.session.resume, async ({ params, client }) => {
      checkId(params.sessionId);
      if (!getSession(params.sessionId)) throw RequestError.resourceNotFound(params.sessionId);
      acquireLock(params.sessionId, "acp");
      await announce(params.sessionId, client);
      return { modes: modesFor(params.sessionId), configOptions: configOptionsFor(params.sessionId) };
    })
    .onRequest(acp.methods.agent.session.fork, async ({ params, client }) => {
      checkId(params.sessionId);
      const forked = forkSession(params.sessionId);
      if (!forked) throw RequestError.resourceNotFound(params.sessionId);
      acquireLock(forked.id, "acp");
      const mcp = mcpServersFrom(params.mcpServers);
      if (Object.keys(mcp).length) sessionMcp.set(forked.id, mcp);
      if (params.systemPrompt) sessionInstructions.set(forked.id, systemPromptText(params.systemPrompt));
      await announce(forked.id, client);
      return { sessionId: forked.id, modes: modesFor(forked.id), configOptions: configOptionsFor(forked.id) };
    })
    .onRequest(acp.methods.agent.session.delete, async ({ params }) => {
      checkId(params.sessionId);
      // a turn still running for a deleted session must not keep appending to
      // its DB — same teardown close does, before the row disappears
      abortTurn(params.sessionId, "session deleted");
      releaseSteer(params.sessionId);
      await shutdownTools(params.sessionId);
      releaseLock(params.sessionId);
      if (!deleteSession(params.sessionId)) throw RequestError.resourceNotFound(params.sessionId);
      forget(params.sessionId);
      return {};
    })
    .onRequest(acp.methods.agent.session.close, async ({ params }) => {
      checkId(params.sessionId);
      abortTurn(params.sessionId, "session closed");
      detachHost(params.sessionId);
      releaseSteer(params.sessionId);
      await shutdownTools(params.sessionId);
      releaseLock(params.sessionId);
      forget(params.sessionId);
      return {};
    })
    .onNotification(acp.methods.agent.session.cancel, async ({ params }) => {
      // Notification, not a request: cancel does not reply. The prompt it aborts
      // is what reports `stopReason: "cancelled"`.
      try {
        checkId(params.sessionId);
      } catch {
        return;
      }
      // one abort path for every client: the controller lives in the loop layer
      abortTurn(params.sessionId, "client cancel");
    })
    .onRequest(acp.methods.agent.session.prompt, async ({ params, client, signal }) => {
      checkId(params.sessionId);
      const session = getSession(params.sessionId);
      if (!session) throw RequestError.resourceNotFound(params.sessionId);
      if (turnRunning(params.sessionId)) throw RequestError.invalidParams(undefined, "a prompt is already running for this session");
      // #11: a session another live process holds is theirs to write — a second
      // opener prompting here would interleave appends into one transcript. The
      // TUI degrades to a read-only viewer for the same reason; ACP has no
      // viewer mode, so the honest answer is a refused prompt that says who
      // holds the session.
      const holder = lockHolder(params.sessionId);
      if (holder && holder.pid !== process.pid) {
        throw RequestError.invalidParams(
          undefined,
          `session is open in another fox-agent process (${holder.kind}, pid ${holder.pid}) — close it there first, or fork this session`,
        );
      }
      // `fox --acp` is launched before the missing-key check (see src/cli.ts), so
      // a keyless install reaches here. Say so in the protocol's own terms — an
      // editor renders `auth_required` as an actionable message, whereas the
      // provider's 401 arrives as unexplained turn failure.
      if (!providerFor(params.sessionId).apiKey) {
        throw RequestError.authRequired(undefined, "no API key: set FOX_AGENT_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY");
      }
      const text = promptText(params.prompt);
      // the message is the *second* argument; the first is JSON-RPC `data`, which
      // does not reach a client's error string
      if (!text) throw RequestError.invalidParams(undefined, "prompt has no text content");
      // Attach the client first, so a steer that arrives once this turn is over
      // can start the next one and still reach the editor's stream.
      attachSteer(params.sessionId, client);

      // The prompt's own message is NOT queued: it is what the client asked for,
      // and it must be answered even if a steer is also pending (that one gets
      // its own turn after).
      // One controller for both cancellation sources (the protocol's
      // `session/cancel` and this request's own signal), registered so the
      // shared `abortTurn` reaches it — ACP must not keep a second map of
      // in-flight turns.
      const ctl = new AbortController();
      const onAbort = () => ctl.abort();
      signal.addEventListener("abort", onAbort, { once: true });
      adoptTurnController(params.sessionId, ctl);

      let stop: acp.StopReason = "end_turn";
      let failed: unknown = null;
      try {
        for await (const ev of turnEvents(params.sessionId, text, ctl.signal, client)) {
          if (ev.type === "done") {
            stop = stopReasonFor(ev.reason);
            break;
          }
        }
      } catch (e) {
        failed = e;
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
      // A one-shot surface is not finished while work is still outstanding: a
      // steered message or a live background job will produce more of the
      // answer. Wait for quiescence before replying, so the editor sees one
      // prompt resolve once the session is actually done — the same rule `fox
      // -p` and an A2A `message/send` follow.
      await waitQuiescent(params.sessionId);
      if (failed) throw failed;
      return { stopReason: stop };
    });
}

/**
 * Serve ACP on stdio and resolve when the client disconnects.
 *
 * stdout belongs to the protocol — every diagnostic in this path must go to
 * stderr or it corrupts the stream.
 */
export async function runAcpServer(opts: AcpServerOptions): Promise<void> {
  const stream = acp.ndJsonStream(bunStdout(), Bun.stdin.stream() as ReadableStream<Uint8Array>);
  const conn = buildAgent(opts).connect(stream);
  await conn.closed;
}

/**
 * Bun's `Bun.stdout` is a `FileSink`, not a WHATWG `WritableStream`, so
 * `ndJsonStream` cannot consume it directly. This adapter is the only place that
 * difference is handled on the agent side (`./client.ts` has the child-process
 * equivalent).
 */
function bunStdout(): WritableStream<Uint8Array> {
  const sink = Bun.stdout.writer();
  return new WritableStream<Uint8Array>({
    write(chunk) {
      sink.write(chunk);
      return sink.flush() as unknown as Promise<void>;
    },
    close() {
      sink.end();
    },
  });
}

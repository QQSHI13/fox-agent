# A2A (Agent2Agent)

A2A is how fox-agent reaches — and is reached by — agents that already live
somewhere on the network behind a URL. Where ACP spawns a child process, A2A dials
a peer.

fox-agent implements **A2A 1.0**, the current released specification, and speaks
the **0.3 dialect** on request so an un-upgraded peer is still a peer. Both
directions support both.

## Serving

```bash
fox --a2a              # bind an ephemeral port (printed to stderr)
fox --a2a --port 8787  # bind a specific port

FOX_AGENT_A2A_TOKEN=s3cret fox --a2a   # require a bearer token
```

The server implements every operation the specification defines (§3.1), over the
JSON-RPC binding (§9):

| Operation | JSON-RPC method | Purpose |
|---|---|---|
| Send message | `SendMessage` | One-shot or multi-turn; blocks until terminal by default |
| Send streaming message | `SendStreamingMessage` | SSE: task, then artifact/status updates |
| Get task | `GetTask` | Current state, with `historyLength` truncation |
| List tasks | `ListTasks` | Filter by context/status, cursor-paginated |
| Cancel task | `CancelTask` | `TaskNotCancelableError` when it is too late |
| Subscribe to task | `SubscribeToTask` | Attach to a running task's event stream |
| Create push config | `CreateTaskPushNotificationConfig` | Register a webhook |
| Get push config | `GetTaskPushNotificationConfig` | |
| List push configs | `ListTaskPushNotificationConfigs` | |
| Delete push config | `DeleteTaskPushNotificationConfig` | |
| Get extended card | `GetExtendedAgentCard` | Authenticated richer card |

Discovery is at `/.well-known/agent-card.json` (legacy `/agent.json` and
`/.well-known/agent.json` also answer). The card is cacheable with an `ETag`, per
§8.6.1.

A turn runs through the same `runTurnCore` engine the TUI, headless and ACP paths
use, so behavior — compaction, budget, hooks — is identical across surfaces.
**Every A2A task is a real session in the store**, so the work shows up in
`fox ls` afterwards.

### Version negotiation

The client sends `A2A-Version`. An **empty or absent** value means 0.3 (§3.6.2 is
explicit about that, and it is what keeps a 0.3 client working), `1.0` gets the
current dialect, and anything else is refused with `VersionNotSupportedError`
(`-32009`) naming both the requested and the supported versions.

The two dialects differ in more than a header:

| | 1.0 | 0.3 |
|---|---|---|
| Method name | `SendMessage` | `message/send` |
| Union discriminator | member name (`{statusUpdate}`) | inline `kind: "status-update"` |
| Part | `{text}` / `{raw}` / `{data}` | `{kind:"text",text}` / `{kind:"file",file}` |
| TaskState | `TASK_STATE_COMPLETED` | `completed` |
| Role | `ROLE_AGENT` | `agent` |
| Agent card transports | `supportedInterfaces[]` | `url` + `preferredTransport` |

A 0.3 peer is sent 0.3 bytes, not 1.0 bytes with an old header.

### Binds local-only by default

This endpoint runs tools with full machine access, so it must not face an
untrusted network without an auth layer. It binds `127.0.0.1`, and
`FOX_AGENT_A2A_TOKEN` adds a bearer check (constant-time compared) plus a
`securitySchemes` declaration on the card. There is no OAuth2/mTLS support — put
it behind a reverse proxy that provides one if you need it.

## Reaching a peer

```toml
[agents.researcher]
url = "https://agent.example.com"
headers = { authorization = "Bearer token" }
```

Then `task` with `agent: "researcher"`.

The client is not credulous about the spec:

- **Discovery first.** The card's `supportedInterfaces` is parsed and the first
  interface we can speak is chosen (§8.3.2) — preferring a 1.0 entry over a 0.3
  one even if the card lists 0.3 first, because §3.6.3 warns that a silent
  downgrade loses the features the client was built for. A peer with no card is
  still tried, as 1.0.
- **Streaming first.** `SendStreamingMessage` (SSE) for live progress, falling
  back to `SendMessage` + `GetTask` polling when the peer answers `-32601` or
  `-32004`. `returnImmediately` is requested so polling is the wait rather than a
  hung socket.
- **Downgrade once.** A peer that does not know the PascalCase method is switched
  to the 0.3 dialect for the rest of the connection — method names *and* payload
  shapes — rather than retrying the same wrong spelling forever.
- **Interrupted states end the wait.** `INPUT_REQUIRED` and `AUTH_REQUIRED` are
  reported as a failure carrying the peer's own message: delegation is headless,
  so nobody can answer the peer's question, and parking forever is worse.
- An overall delegation is capped at 30 minutes by default.

## When A2A is the right transport

- The peer is already running, long-lived, and shared (a service, not a spawn),
- The peer is behind an HTTP boundary you control (a gateway, an internal host),
- You want progress streaming across that boundary rather than a child's stdout.

When the peer is just "another fox-agent on this machine", prefer `default` (ACP)
— it is a process you can see, kill and debug.

## Trust

- Headers carry whatever you put in them; the peer sees your prompts.
- Delegation depth is capped at 3 and carried across the boundary so a cycle of
  peers stops.
- Webhook payloads are `StreamResponse` objects (§4.3.3), authenticated with
  whatever `authentication` the config declares.

## What is not implemented

Honest list, so nobody plans around it:

- **Signed agent cards** (§8.4). Cards are served unsigned; `signatures` is
  parsed and passed through if a peer provides it, but nothing is verified.
- **OAuth2 / OIDC / mTLS** (§7). Only a bearer token, or none.
- **gRPC and REST bindings** (§10, §11). JSON-RPC only.
- **Extensions** (§4.6). `A2A-Extensions` is accepted and ignored.

Full normative reference: [A2A 1.0 specification](https://a2a-protocol.org/latest/specification/).

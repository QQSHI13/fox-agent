# Providers and profiles

fox-agent talks to four wire formats and, through a catalog, 200+ named
providers. Credentials live in two places that behave differently — know which
one you are editing.

## The flat slot: one active provider

The top-level keys `provider`, `apiKey`, `baseUrl` and `model` are the **active**
provider — a single slot. A cross-provider `/model` switch **overwrites** it.

```toml
provider = "openai-compatible"
baseUrl = "https://api.deepseek.com/v1"
apiKey = "$DEEPSEEK_API_KEY"
model = "deepseek-chat"
```

This is the right shape for "I use one provider".

## Profiles: many providers side by side

`[providers.<name>]` stores any number of providers, each with its own format,
endpoint, key, headers and model list. Selecting one never touches anyone else's
credentials.

```toml
provider = "openrouter"        # selects the profile below

[providers.openrouter]
format = "openai-compatible"   # | openai-responses | anthropic | google
baseUrl = "https://openrouter.ai/api/v1"
apiKey = "$OPENROUTER_API_KEY"
headers = { "x-title" = "fox-agent" }
defaultModel = "moonshotai/kimi-k2"
```

Select a profile by:

- `provider = "<name>"` in config,
- `/model <name>/<model>` in a session,
- `/login provider=<name>` (headless-friendly).

The flat top-level `baseUrl`/`apiKey` act as the fallback for any field a
profile omits.

### Secret indirection

`apiKey` and `headers` values resolve:

- `"$ENV"` or `"${ENV}"` — read from the environment,
- `"!cmd"` — the command's stdout, cached per process.

Use these instead of pasting secrets into files.

## The catalog and `/login`

`/login` with no arguments is an interactive wizard: provider, key, base URL,
model, and an optional profile name to keep it beside your others. The key is
typed masked. It writes `~/.config/fox-agent/config.toml` and takes effect
without a restart.

Provider choices are:

1. your saved profiles (they carry their own credentials, so those steps are
   skipped),
2. the [models.dev](https://models.dev) catalog — 200+ providers, cached for 24h
   at `$FOX_AGENT_HOME/models.dev.json`, with static fallbacks offline.

Picking e.g. OpenRouter prefills the endpoint, names the env var an empty key
falls back to, and lists that provider's real models with context windows. A
profile lists its own models plus whatever its endpoint advertises.

Headless clients use kv pairs:

```bash
/login provider=<p> key=<k> [baseUrl=<u>] [model=<m>]
```

`<p>` may be a preset id like `deepseek` or a saved profile name. A profile
switch takes `model=` only — its credentials live in its table.

## Switching mid-session

`/model` opens a provider-first picker: each logged-in provider's own `/models`
(cached), plus config-described and catalog models. The switch is saved globally.

Sessions remember the model id they ran with, but **the provider is whatever is
active when you resume** — resuming a session does not restore its provider's
credentials, and on reload the session's stored model is re-synced to the active
config model.

## Describing a model nobody knows

If an endpoint advertises no models and the catalog has nothing, describe it:

```toml
[[providers.openrouter.models]]
id = "moonshotai/kimi-k2"
name = "Kimi K2"
contextWindow = 262144
maxOutput = 16384
reasoning = false
input = ["text", "image"]      # what the model accepts — drives media attachment
costIn = 0.6                   # USD per million tokens, for /cost
costOut = 2.5
sampling = { temperature = 1.0, top_p = 0.95 }
```

## Providers from plugins

A plugin can register a provider with `providers: { "<name>": chatFn }`, selected
by `provider = "<name>"`. Registering a bundled format name
(`openai-compatible`, `openai-responses`, `anthropic`, `google`) is refused — those
belong to the `bundled:providers` plugin. See [Plugins](../plugins/index.md).

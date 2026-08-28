/**
 * A plugin that throws at import time.
 *
 * The behavior this pins is the one a user actually depends on: a broken plugin
 * costs them a warning, not a harness that refuses to start. `loadPlugins` catches
 * this the way `mcpTools` catches an unreachable server.
 */
throw new Error("deliberate import-time failure");

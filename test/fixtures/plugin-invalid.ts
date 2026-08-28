/**
 * A module that loads fine but is not a plugin.
 *
 * Distinct from `plugin-throws.ts`: this one imports cleanly, so nothing but the
 * shape check in `loadPlugins` can catch it. Without that check its `tools` would
 * reach `buildRegistry` and fail deep in the turn loop with a message that never
 * mentions a plugin.
 */
export default {
  // no `name`
  tools: [{ nope: true }],
};

/**
 * A plugin that VALUE-imports `fox-agent/sdk`, the way a real third-party
 * plugin does.
 *
 * This is the case that used to fail only in the shipped binary: a plugin is one
 * file the user dropped somewhere with no `node_modules` beside it, so
 *
 *     import { ok } from "fox-agent/sdk";
 *
 * resolved nothing. In a repo checkout the path sometimes resolved off the
 * repo's own node_modules, so the failure was invisible in development and
 * total after `fox install` — exactly the gap that stopped "add a feature by
 * adding a plugin" from being true for the packaged product.
 *
 * The import must be a value import, not `import type`: type-only imports erase
 * at compile time and prove nothing about resolution.
 */
import type { FoxPlugin } from "../../src/plugins/types.ts";
import { ok } from "fox-agent/sdk";

const plugin: FoxPlugin = {
  name: "sdk-importer",
  tools: [
    {
      def: {
        name: "sdk_ping",
        description: "Built its result with ok() from the SDK.",
        parameters: { type: "object", properties: {} },
      },
      async run() {
        return ok("pong via sdk");
      },
    },
  ],
};

export default plugin;

// fox-agent build: single-binary compile straight from source (no dist intermediates).
//
// --bytecode caches compiled JS bytecode in the binary (measured: TTFF ~2x
// faster, ~6MB less idle PSS); --minify is a small extra win on top.
//
// Two build-time stubs drop dependency code that is unreachable from anything
// fox actually does, without touching package.json — the packages stay
// installed, typechecked and upgradable, they just never enter the binary:
//
//   @ai-sdk/gateway   the `ai` barrel's global-default-provider path; fox always
//                     passes an explicit provider model (see build/stubs/)
//   MCP ajv validator client-side tool `outputSchema` pre-compilation only
//
// Measured on the minified payload: 1557KB -> 1342KB (-215KB, -13.8%).
// `alias` is silently ignored by Bun 1.4.4's Bun.build, so these are resolve
// plugins. Keep them in sync with build/stubs/.
import { resolve } from "node:path";

const root = import.meta.dir;

/** Redirect a module specifier to a stub file at bundle time. */
function stub(id: RegExp, file: string): Bun.BunPlugin {
  const path = resolve(root, file);
  return {
    name: `stub:${file}`,
    setup(build) {
      build.onResolve({ filter: id }, () => ({ path }));
    },
  };
}

const result = await Bun.build({
  entrypoints: [resolve(root, "src/cli.ts")],
  target: "bun",
  minify: true,
  bytecode: true,
  compile: { outfile: resolve(root, "bin/fox") },
  plugins: [
    stub(/^@ai-sdk\/gateway$/, "build/stubs/ai-sdk-gateway.ts"),
    stub(/ajv-provider\.js$/, "build/stubs/mcp-ajv-validator.ts"),
  ],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// foxc build: bundle with the official @opentui/solid bun plugin (babel-preset-solid),
// then compile to a standalone binary.
import { copyFileSync } from "node:fs";
import * as solidMod from "@opentui/solid/bun-plugin";
const solid: any = (solidMod as any).createSolidTransformPlugin;

const bundled = await Bun.build({
  entrypoints: ["./src/cli.ts"],
  outdir: "./dist",
  target: "bun",
  minify: false,
  external: [
    "@opentui/core-darwin-x64",
    "@opentui/core-darwin-arm64",
    "@opentui/core-win32-x64",
    "@opentui/core-win32-arm64",
    "@opentui/core-linux-arm64",
    "@opentui/core-linux-x64-musl",
    "@opentui/core-linux-arm64-musl",
  ],
  plugins: [solid()],
});
if (!bundled.success) {
  console.error(bundled.logs.join("\n"));
  process.exit(1);
}

const compiled = Bun.spawnSync(["bun", "build", "--compile", "./dist/cli.js", "--outfile", "./bin/fox"], {
  stdout: "inherit",
  stderr: "inherit",
});
if (compiled.exitCode === 0) {
  try {
    copyFileSync("./node_modules/@opentui/core-linux-x64/libopentui.so", "./bin/libopentui.so");
    console.log("copied libopentui.so -> bin/");
  } catch (e) {
    console.error("warn: could not copy libopentui.so:", e);
  }
}
process.exit(compiled.exitCode);


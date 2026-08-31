// fox-agent build: single-binary compile straight from source (no dist intermediates).
// Uses process.execPath so it works regardless of how bun is on PATH.
// --bytecode caches compiled JS bytecode in the binary (measured: TTFF ~2x
// faster, ~6MB less idle PSS); --minify is a small extra win on top.
const proc = Bun.spawnSync(
  [process.execPath, "build", "--compile", "--bytecode", "--minify", "./src/cli.ts", "--outfile", "./bin/fox"],
  { stdout: "inherit", stderr: "inherit" },
);
process.exit(proc.exitCode);

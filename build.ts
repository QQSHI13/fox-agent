// fox build: single-binary compile straight from source (no dist intermediates).
// Uses process.execPath so it works regardless of how bun is on PATH.
const proc = Bun.spawnSync(
  [process.execPath, "build", "--compile", "./src/cli.ts", "--outfile", "./bin/fox"],
  { stdout: "inherit", stderr: "inherit" },
);
process.exit(proc.exitCode);

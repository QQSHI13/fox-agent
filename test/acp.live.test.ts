// The acpx acceptance check, as a test.
//
// The assertions live in `scripts/acp-accept.ts`, not here. That check needs a
// *built* `bin/fox` and a real subprocess pair, which makes it a script by
// nature; this wrapper exists so `bun test` runs it when the pieces are present
// instead of leaving it to be remembered by hand.
//
// Doubly gated, and neither gate is incidental:
//   - acpx is an optional global install, so a contributor without it must not
//     see a failure (the test/pty.test.ts:12 pattern).
//   - bin/fox-agent is a build artifact. Gating on it rather than building here keeps
//     `bun test` from silently taking a minute-long detour through the bundler,
//     and keeps this from passing against a stale binary without saying so.
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const FOX = join(ROOT, "bin", "fox");
const SCRIPT = join(ROOT, "scripts", "acp-accept.ts");

const HAS_ACPX = Bun.which("acpx") !== null;
const HAS_BIN = existsSync(FOX);
const CAN_RUN = HAS_ACPX && HAS_BIN;

if (!CAN_RUN) {
  console.log(`acp.live: skipped (${!HAS_ACPX ? "acpx not on PATH" : "bin/fox not built — run `bun run build`"})`);
}

describe.skipIf(!CAN_RUN)("fox --acp against a foreign client", () => {
  test("acpx drives the built binary end to end", async () => {
    const p = Bun.spawn(["bun", SCRIPT], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);

    // the script prints one line per check, so on failure the report is the
    // useful artifact — surface it rather than only the exit code
    if (code !== 0) console.log(out + err);
    expect(code).toBe(0);
    // a script that exited 0 having run *nothing* would also be a pass, so pin
    // that it got to the end with checks behind it
    expect(out).toMatch(/(\d+)\/\1 checks passed/);
  }, 240_000);
});

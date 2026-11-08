/**
 * Adversarial probe: what does guard-entry actually MISS?
 *
 * Not a deliverable — a check on whether slide 4's claims hold up if a
 * classmate pushes back. Each case is run against both builds; a case counts
 * as a hole if the protected decoy is deleted.
 *
 *   bun scripts/guard-probe.ts
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FIXTURE = mkdtempSync(join(tmpdir(), "guard-probe-"));
const PROTECTED = join(FIXTURE, "protected", "hosts");
const SCRATCH = join(FIXTURE, "scratch");
process.env.GUARD_PROTECT = PROTECTED;

const hookPlugin = (await import("../plugins/guard-hook/index.ts")).default;
const { guardTool, refusedBy } = await import("../plugins/guard-entry/index.ts");

const ctx = { sessionId: "probe", cwd: FIXTURE };
const builtinExec = {
  def: { name: "exec" },
  run: async (a: { cmd: string }, c: { cwd: string }) => {
    const p = Bun.spawn(["/bin/sh", "-c", a.cmd], { cwd: c.cwd, stdout: "pipe", stderr: "pipe" });
    const code = await p.exited;
    const out = (await new Response(p.stdout).text()) + (await new Response(p.stderr).text());
    return { ok: code === 0, output: out };
  },
};
const entryExec = guardTool(builtinExec as never) as unknown as typeof builtinExec;

function reset() {
  rmSync(FIXTURE, { recursive: true, force: true });
  mkdirSync(SCRATCH, { recursive: true });
  mkdirSync(join(FIXTURE, "protected"), { recursive: true });
  writeFileSync(PROTECTED, "decoy");
  symlinkSync(PROTECTED, join(FIXTURE, "innocent-looking")); // symlink alias
  symlinkSync(join(FIXTURE, "protected"), join(FIXTURE, "aliasdir"));
  symlinkSync(join(FIXTURE, "protected"), join(FIXTURE, "pro tected")); // dir name WITH a space
  mkdirSync(join(FIXTURE, "sub"), { recursive: true });
  writeFileSync(join(FIXTURE, "sub", "f.txt"), "x");
}

/** Each case: a command + how it reaches the protected file. */
const cases: { name: string; cmd: string; workdir?: string; note: string }[] = [
  { name: "absolute", cmd: `rm -f ${PROTECTED}`, note: "the baseline case from the deck" },
  { name: "quoted whole", cmd: `rm -f '${PROTECTED}'`, note: "quotes around the whole path" },
  { name: "split tokens", cmd: `rm -f ${PROTECTED.replace(/hosts$/, "'ho'sts")}`, note: "deck's second finding" },
  { name: "relative basename", cmd: `rm -f hosts`, workdir: "protected", note: "bare relative name" },
  { name: "dot-slash relative", cmd: `cd protected && rm -f ./hosts`, note: "relative after cd, one token" },
  { name: "dotdot traversal", cmd: `rm -f ../protected/hosts`, workdir: "sub", note: ".. traversal" },
  { name: "symlink alias", cmd: `rm -f innocent-looking`, note: "symlink pointing at the decoy" },
  { name: "symlinked dir", cmd: `rm -f aliasdir/hosts`, note: "symlinked parent directory" },
  { name: "command substitution", cmd: `rm -f "$(echo ${PROTECTED})"`, note: "path only exists at runtime" },
  { name: "variable", cmd: `P=${PROTECTED}; rm -f "$P"`, note: "shell variable" },
  { name: "glob", cmd: `rm -f ${FIXTURE}/protected/host*`, note: "glob wildcard" },
  { name: "path with space", cmd: `rm -f "${FIXTURE}/pro tected/hosts"`, note: "a real path containing a space" },
  { name: "python", cmd: `python3 -c "import os;os.remove('${PROTECTED}')"`, note: "not a shell path token" },
  { name: "cat (read)", cmd: `cat ${PROTECTED}`, note: "policy breadth: is a READ refused?" },
];

async function runOne(cmd: string, tool: typeof builtinExec, useHook: boolean, workdir?: string) {
  // Fresh protected file each time so "deleted" is meaningful.
  writeFileSync(PROTECTED, "decoy");
  try {
    if (useHook) {
      const patch = hookPlugin.hooks!.beforeTool({ sessionId: "p", name: "exec", args: { cmd, workdir } } as never) as
        | { output?: string }
        | void;
      if (patch && typeof patch.output === "string") return { refused: true, deleted: false };
    }
    await tool.run({ cmd, workdir }, ctx);
  } catch {
    return { refused: true, deleted: !existsSync(PROTECTED) };
  }
  return { refused: false, deleted: !existsSync(PROTECTED) };
}

reset();
console.log("\n  guard-entry's own predicate, per case (no execution):");
for (const c of cases) {
  const direct = refusedBy(c.cmd, c.workdir ? `${FIXTURE}/${c.workdir}` : FIXTURE);
  console.log(`  ${c.name.padEnd(22)} ${direct ? "refuses" : "ALLOWS "}  ${c.note}`);
}

console.log("\n  executed: does the decoy survive?");
console.log("  case                   hook      entry     note");
for (const c of cases) {
  const h = await runOne(c.cmd, builtinExec, true, c.workdir);
  const e = await runOne(c.cmd, entryExec, false, c.workdir);
  const f = (r: { refused: boolean; deleted: boolean }) => (r.deleted ? "DELETED" : r.refused ? "refused" : "safe   ");
  console.log(`  ${c.name.padEnd(22)} ${f(h).padEnd(9)} ${f(e).padEnd(9)} ${c.note}`);
}

rmSync(FIXTURE, { recursive: true, force: true });

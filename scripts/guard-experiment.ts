/**
 * Controlled experiment: where must a guard live when control flow moves to code?
 *
 * Two builds, SAME task, same paths, same order. The only variable is where the
 * protected-path check sits:
 *
 *   A  beforeTool hook  — the turn loop's per-call hook (plugins/guard-hook)
 *   B  tool entry       — inside the exec implementation (plugins/guard-entry)
 *
 * And each build is exercised through the two call shapes the harness actually
 * has:
 *
 *   step       a tool call made by a step: the loop runs beforeTool, then calls
 *              the tool. Both builds are consulted.
 *   code-mode  a `repl` eval doing `tools.call("exec", …)`, which invokes the
 *              tool's run directly (src/plugins/bundled/repl.ts:452). Build A's
 *              hook is never consulted.
 *
 * SAFETY: the protected path is a DECOY created inside a temp dir, never
 * /etc/hosts or anything real. The decoy is a regular file; "deleted" means it
 * is gone. Nothing outside the temp fixture is touched.
 *
 *   bun scripts/guard-experiment.ts
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The plugins read this at module load, so it must be set before the import.
const FIXTURE = mkdtempSync(join(tmpdir(), "guard-exp-"));
const PROTECTED = join(FIXTURE, "protected", "hosts");
const SCRATCH = join(FIXTURE, "scratch");
process.env.GUARD_PROTECT = PROTECTED;

const hookPlugin = (await import("../plugins/guard-hook/index.ts")).default;
const entryPlugin = (await import("../plugins/guard-entry/index.ts")).default;

type Ctx = { sessionId: string; cwd: string; signal?: AbortSignal };
type ToolLike = { def: { name: string }; run: (a: any, c: Ctx) => Promise<any> };

/** Reset the fixture: 9 permitted files + 1 protected decoy. */
function reset() {
  rmSync(FIXTURE, { recursive: true, force: true });
  mkdirSync(SCRATCH, { recursive: true });
  mkdirSync(join(FIXTURE, "protected"), { recursive: true });
  for (let i = 1; i <= 9; i++) writeFileSync(join(SCRATCH, `file${i}.txt`), "x");
  writeFileSync(PROTECTED, "decoy — never the real /etc/hosts");
}
const targets = () => [
  ...Array.from({ length: 9 }, (_, i) => join(SCRATCH, `file${i + 1}.txt`)),
  PROTECTED, // the violation
];

const ctx: Ctx = { sessionId: "exp", cwd: FIXTURE };

/** The built-in exec, reduced to what the experiment needs. */
const builtinExec: ToolLike = {
  def: { name: "exec" },
  run: async (a: { cmd: string }, c: Ctx) => {
    const p = Bun.spawn(["/bin/sh", "-c", a.cmd], { cwd: c.cwd, stdout: "pipe", stderr: "pipe" });
    const code = await p.exited;
    const out = (await new Response(p.stdout).text()) + (await new Response(p.stderr).text());
    return { ok: code === 0, output: out };
  },
};

/** Build B wraps the REAL built-in exec, captured at merge time. */
const { guardTool } = await import("../plugins/guard-entry/index.ts");
const entryExec = guardTool(builtinExec as never) as unknown as ToolLike;

/**
 * A step-style call: the turn loop consults `beforeTool` first, then runs the
 * tool. A hook veto (`output`) replaces the run.
 */
async function stepCall(tool: ToolLike, cmd: string, hook: boolean): Promise<{ out: string; ok: boolean; ran: boolean }> {
  if (hook) {
    const patch = hookPlugin.hooks!.beforeTool({ sessionId: "exp", name: "exec", args: { cmd } }) as { output?: string } | void;
    if (patch && typeof patch.output === "string") return { out: patch.output, ok: false, ran: false };
  }
  const r = await tool.run({ cmd }, ctx);
  return { out: String(r?.output ?? r), ok: r?.ok !== false, ran: true };
}

/**
 * A code-mode call: `repl`'s bridge invokes the tool's run directly. No hook.
 * This is the shape the whole experiment turns on.
 */
async function codeModeCall(tool: ToolLike, cmd: string) {
  const r = await tool.run({ cmd }, ctx);
  return { out: String(r?.output ?? r), ok: r?.ok !== false, ran: true };
}

/** Run every target through one build, return the tallies. */
async function runBuild(label: string, tool: ToolLike, hook: boolean, shape: "step" | "code") {
  reset();
  let violations = 0; // protected file deleted
  let legit = 0; // of 9 permitted
  let refusals = 0;
  const call = shape === "step" ? (c: string) => stepCall(tool, c, hook) : (c: string) => codeModeCall(tool, c);
  for (const t of targets()) {
    const r = await call(`rm -f ${t}`);
    if (!r.ok) refusals++;
  }
  // Count by looking at the filesystem, not at what the tools claimed.
  if (!existsSync(PROTECTED)) violations++;
  legit = 9 - readdirSync(SCRATCH).length; // permitted files actually deleted
  return { label, shape, violations, legit, refusals };
}

const rows = [];
// A: hook present, step shape — the hook DOES fire
rows.push(await runBuild("A hook, step call", builtinExec, true, "step"));
// A: hook present, code shape — the hook never fires
rows.push(await runBuild("A hook, code-mode", builtinExec, true, "code"));
// B: entry guard, step shape
rows.push(await runBuild("B entry, step call", entryExec, false, "step"));
// B: entry guard, code shape
rows.push(await runBuild("B entry, code-mode", entryExec, false, "code"));

/**
 * Third variable: does the guard survive a path built from PIECES?
 *
 * `rm -f <dir>/ho''sts` reaches the shell as one path, but the command STRING
 * contains no complete protected path — so a string-matching guard sees nothing
 * while the resolved path is exactly the protected file.
 */
async function runSplit(label: string, tool: ToolLike, hook: boolean) {
  reset();
  const dir = PROTECTED.replace(/\/[^/]*$/, "");
  const base = PROTECTED.split("/").pop()!;
  const split = `${dir}/'${base.slice(0, 2)}'${base.slice(2)}`; // /…/ho'sts' -> /…/hosts
  const cmd = `rm -f ${split}`;
  if (hook) {
    const patch = hookPlugin.hooks!.beforeTool({ sessionId: "exp", name: "exec", args: { cmd } }) as { output?: string } | void;
    if (patch && typeof patch.output === "string") return { label, violations: 0, refusals: 1 };
  }
  await tool.run({ cmd }, ctx);
  return { label, violations: existsSync(PROTECTED) ? 0 : 1, refusals: 0 };
}

const splitRows = [
  await runSplit("A hook, split path", builtinExec, true),
  await runSplit("B entry, split path", entryExec, false),
];

console.log("\n  build                shape   violations  legit/9  refusals");
for (const r of rows) {
  console.log(
    `  ${r.label.padEnd(20)} ${r.shape.padEnd(7)} ${String(r.violations).padStart(10)}  ${String(r.legit).padStart(6)}  ${String(r.refusals).padStart(8)}`,
  );
}

console.log("\n  path assembled from pieces (the command string holds no complete protected path):");
for (const r of splitRows) console.log(`  ${r.label.padEnd(22)} violations ${r.violations}  refusals ${r.refusals}`);

rmSync(FIXTURE, { recursive: true, force: true });

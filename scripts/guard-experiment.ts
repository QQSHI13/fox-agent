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
 *   code-mode  a REAL `repl` eval doing `tools.call("exec", …)` in a loop. Not a
 *              simulation of the bridge: the shipped `replRun` runs the shipped
 *              `exec` from the shipped registry, and the bridge invokes exec's
 *              `run` directly (src/plugins/bundled/repl.ts:451). Build A's hook
 *              is never consulted, because nothing on that path wakes the loop.
 *
 * Both builds use the REAL `defaultRegistry()`. An earlier version hand-rolled a
 * miniature exec, which proved the author's understanding of the bridge rather
 * than the harness's behaviour — and it silently proved nothing at all once the
 * registry started validating arguments, because a fake tool has no schema.
 * Asked "did you run code mode or did you model it?", the answer is now "I ran
 * the shipped repl against the shipped exec".
 *
 * SAFETY: the protected path is a DECOY created inside a temp dir, never
 * /etc/hosts or anything real. The decoy is a regular file; "deleted" means it
 * is gone. Nothing outside the temp fixture is touched.
 *
 *   bun scripts/guard-experiment.ts
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The guard plugins read this at module load, so it must be set before import.
const FIXTURE = mkdtempSync(join(tmpdir(), "guard-exp-"));
const PROTECTED = join(FIXTURE, "protected", "hosts");
const SCRATCH = join(FIXTURE, "scratch");
process.env.GUARD_PROTECT = PROTECTED;

const hookPlugin = (await import("../plugins/guard-hook/index.ts")).default;
const { guardTool } = await import("../plugins/guard-entry/index.ts");
const { defaultRegistry, pluginTools } = await import("../src/tools/index.ts");
const { replRun, cleanupRepl } = await import("../src/plugins/bundled/repl.ts");

type Tool = { def: { name: string; parameters?: unknown; description?: string }; run: (a: any, c: any) => Promise<any> };

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

/**
 * The registry each build runs with.
 *
 * Build B's entry guard goes through the SAME `pluginTools` seam a real plugin
 * takes at registry-build time — so this is not a bespoke wiring, it is the
 * harness's own merge rule, given a registry to read.
 */
function registryFor(build: "A" | "B"): Map<string, Tool> {
  const map = defaultRegistry() as Map<string, Tool>;
  if (build === "A") return map; // hook only: the shipped exec, untouched
  const wrapped = guardTool(map.get("exec") as never); // plugin-entry contract
  map.set("exec", wrapped as unknown as Tool);
  return map;
}

let seq = 0;

/**
 * A step-style call, replicating `turn.ts:786-801`: the loop consults
 * `beforeTool` (build A) before running the tool. Build B needs no hook — its
 * check is inside `run`, so it fires here too, for free.
 */
async function stepCall(tool: Tool, cmd: string) {
  const patch = hookPlugin.hooks!.beforeTool({ sessionId: "exp", name: "exec", args: { cmd } } as never) as
    | { output?: string }
    | void;
  if (patch && typeof patch.output === "string") return { ok: false };
  const r = await tool.run({ cmd }, { sessionId: "exp", cwd: FIXTURE });
  return { ok: r?.ok !== false };
}

/** One real `repl` eval over a list of commands, through the given registry. */
async function codeModeCall(registry: Map<string, Tool>, cmds: string[]) {
  const sessionId = `exp${++seq}`;
  const code = `
    const cmds = ${JSON.stringify(cmds)};
    let refused = 0;
    for (const c of cmds) {
      try { await tools.call("exec", { cmd: c }); }
      catch (e) { refused++; }        // the bridge throws on ok:false
    }
    return refused
  `;
  const r = await replRun({ code }, { sessionId, cwd: FIXTURE, tools: registry } as never);
  const out = String(r && typeof r === "object" ? (r as any).output : r);
  cleanupRepl(sessionId);
  if (r && typeof r === "object" && (r as any).ok === false) {
    throw new Error(`repl eval failed: ${out.slice(0, 300)}`);
  }
  return Number(out.trim()) || 0;
}

/** Run every target through one build, return the tallies. */
async function runBuild(label: string, build: "A" | "B", shape: "step" | "code") {
  reset();
  const registry = registryFor(build);
  const cmds = targets().map((t) => `rm -f ${t}`);
  let refusals = 0;
  if (shape === "step") {
    const exec = registry.get("exec") as Tool;
    for (const c of cmds) if (!(await stepCall(exec, c)).ok) refusals++;
  } else {
    refusals = await codeModeCall(registry, cmds);
  }
  // Count by looking at the filesystem, not at what the tools claimed.
  const violations = existsSync(PROTECTED) ? 0 : 1;
  const legit = 9 - readdirSync(SCRATCH).length;
  return { label, shape, violations, legit, refusals };
}

const rows = [];
rows.push(await runBuild("A hook, step call", "A", "step"));
rows.push(await runBuild("A hook, code-mode", "A", "code"));
rows.push(await runBuild("B entry, step call", "B", "step"));
rows.push(await runBuild("B entry, code-mode", "B", "code"));

/**
 * Third variable: does the guard survive a path built from PIECES?
 *
 * `rm -f <dir>/ho'sts` reaches the shell as one path, but the command STRING
 * holds no complete protected path — so a string-matching guard sees nothing
 * while the resolved path is exactly the protected file.
 *
 * Run through code mode for BOTH builds, so the only difference is the guard.
 */
async function runSplit(label: string, build: "A" | "B") {
  reset();
  const dir = PROTECTED.replace(/\/[^/]*$/, "");
  const base = PROTECTED.split("/").pop()!;
  const split = `${dir}/'${base.slice(0, 2)}'${base.slice(2)}`; // /…/ho'sts -> /…/hosts
  await codeModeCall(registryFor(build), [`rm -f ${split}`]);
  return { label, violations: existsSync(PROTECTED) ? 0 : 1 };
}

const splitRows = [await runSplit("A hook, split path", "A"), await runSplit("B entry, split path", "B")];

console.log("\n  build                shape   violations  legit/9  refusals");
for (const r of rows) {
  console.log(
    `  ${r.label.padEnd(20)} ${r.shape.padEnd(7)} ${String(r.violations).padStart(10)}  ${String(r.legit).padStart(6)}  ${String(r.refusals).padStart(8)}`,
  );
}

console.log("\n  path assembled from pieces (command string holds no complete protected path):");
for (const r of splitRows) console.log(`  ${r.label.padEnd(22)} violations ${r.violations}`);

rmSync(FIXTURE, { recursive: true, force: true });

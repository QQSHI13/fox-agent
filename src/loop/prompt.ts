import { lookupModel } from "../providers/models.ts";
import type { ToolDef } from "../providers/types.ts";
import { renderTodos, getTodos } from "../tools/todo.ts";
import { VERSION } from "../core/version.ts";
import { shellPath } from "../core/shell.ts";
import os from "node:os";

export { VERSION };

/**
 * Names of the tools that are actually callable this step.
 *
 * Every section below is gated on this rather than written as prose, because a
 * prompt that describes a tool the registry doesn't have is worse than saying
 * nothing: a subagent used to be handed the whole "context window management"
 * doctrine while `ctx` was excluded from its registry, so its only possible
 * move was to call a tool that did not exist.
 */
function toolNames(tools: ToolDef[]): Set<string> {
  return new Set(tools.map((t) => t.name));
}

/** Provider-reported context size and the stage it puts the session in. */
export interface RuntimeBudget {
  reported: number;
  limit: number;
  ratio: number;
  stage: "none" | "warn" | "ctxOnly";
  thresholds: { warnAt: number; ctxOnlyAt: number };
}

/**
 * The cache prefix: identity, project instructions, tool roster, doctrine,
 * style — and nothing else.
 *
 * A provider's automatic prefix cache (and our Anthropic cache_control
 * breakpoints) match from byte 0 forward, so a single changed byte in this
 * string re-bills the system block AND every message behind it. That makes
 * step-stability a correctness requirement, not an optimization: the only
 * things allowed in here are those that change when the toolset or the project
 * instructions change. The clock, the todo list, cwd, the model name and the
 * live budget figure used to live here — the last one moves on *every* step —
 * which is why a 1.6k system prompt cost a fresh 1.6k re-read 5,157 times in a
 * row. Those all travel in buildRuntimeHeader() at the message tail instead.
 *
 * Sections are XML-tagged rather than `##` headings. Two reasons, neither of
 * them cosmetic: a tag gives every section an unambiguous start and end, so a
 * later update can replace ONE section without re-emitting the whole prompt
 * (see diffSystemPromptSections' counterpart here — the `section()` helper keeps
 * the tag name next to the content it wraps, so that becomes a mechanical change
 * rather than a re-parse); and a model that cites its own rules can name
 * `<context>` instead of "the paragraph about hiding things", which matters
 * when a doctrine line is what it needs to act on. The preamble stays untagged —
 * it is the identity sentence, not a rule set, and tagging it would only add
 * tokens before the first tag.
 */
import { agentDocsDir, ensureAgentDocs } from "../core/selfdocs.ts";

import type { SkillInfo } from "../skills/load.ts";

/** Wrap one prompt section in a tag of the same name. */
function section(name: string, ...lines: string[]): string {
  return `<${name}>\n${lines.join("\n")}\n</${name}>`;
}

export function buildSystemPrompt(
  opts: {
    tools: ToolDef[];
    projectInstructions?: string;
    skills?: readonly SkillInfo[];
  },
): string {
  const have = toolNames(opts.tools);
  const sections: string[] = [];

  // The open-source clause is not decoration: it is the licence the rest of this
  // prompt assumes. An agent told to explain or change its own behaviour has to
  // know the source and the materialized docs are there to read (see
  // self_documentation below) rather than something it should ask about.
  sections.push(
    `You are running inside fox-agent, a harness for autonomous work — full machine access, no permission prompts. ` +
      `fox-agent is open source: read its source and docs freely to explain or change how it behaves. ` +
      `Act on the user's intent directly, and verify what you change.`,
  );

  if (opts.projectInstructions) sections.push(section("project_instructions", opts.projectInstructions));

  // Routing, never content — same mechanism as self_documentation below, and
  // for the same reason: a skill body read on demand costs nothing per turn,
  // while four of them inlined would ride in the cache prefix of EVERY request.
  // Gated on `read` because a table of paths with no tool to follow it is a
  // dead end; the roster is derived from the live registry, so a reduced
  // subagent that cannot read gets no list to chase.
  if (opts.skills?.length && have.has("read")) {
    sections.push(
      section(
        "skills",
        `Skills available to this session. When a task matches one's description, read its SKILL.md with the read tool FIRST and follow it; do not read them otherwise.`,
        ...opts.skills.map((s) => `- ${s.name}: ${s.description} (${s.path})`),
      ),
    );
  }


  // Names only, no per-tool restatement: every behavioral contract lives in the
  // tool's own description (exec's "working directory never carries over", pty's
  // "KEEPS its working directory", repl's scratchpad + tools.call bridge), which
  // the provider ships verbatim in the API tool block. Restating them here was
  // redundant — and an old formatter that cut each description at its first ". "
  // once silently dropped those clauses, which is why they were hoisted here in
  // the first place. That formatter is gone, so the contracts went back to the
  // tool defs where they belong; the prompt only names what is available.
  const roster = [
    `Schemas and full descriptions ship in the API tool definitions; available now: ${opts.tools.map((t) => t.name).join(", ")}`,
  ];
  sections.push(section("tools", ...roster));

  if (["read", "write", "edit", "glob", "grep", "exec", "lsp"].some((n) => have.has(n))) {
    // Verified, not assumed: every path-taking tool resolves against ctx.cwd
    // (read/write/edit `path`, glob/grep `path`, exec `workdir`, lsp `file`),
    // so a relative path works in all of them — and the absolute one costs
    // tokens restating the cwd that the runtime header already carries.
    // `lsp.file` did NOT do this until this branch: it passed the raw path to
    // the language server, which resolved it against fox-agent's own process
    // cwd instead of the session's, and then reported zero diagnostics with no
    // error. It is listed here because that is what makes the rule true.
    sections.push(
      section(
        "paths",
        `Your cwd is in the runtime header, and every path-taking tool resolves a RELATIVE path against it — read/write/edit \`path\`, glob/grep \`path\`, exec \`workdir\`, lsp \`file\` alike — so prefer src/tools/x.ts over /home/me/proj/src/tools/x.ts. Absolute only for paths genuinely outside the project (a dotfile in $HOME, /etc/hosts).`,
      ),
    );
  }

  if (have.has("write") || have.has("edit")) {
    // Moved here from the two tool descriptions: it is the same doctrine
    // either way, but it is context the model applies ONCE across every write,
    // and in the prompt it can also say what to do with the result instead of
    // repeating "the result reports..." in two schemas that both ship on every
    // request.
    sections.push(
      section(
        "type_checking",
        `\`write\` and \`edit\` report any type errors the change caused in their result. Read those diagnostics and fix them before your next step; do NOT run a type-checker separately just to see them, which is a second full-project pass for information you already have.`,
      ),
    );
  }

  if (have.has("ctx")) {
    sections.push(
      section(
        "context_window",
        `Every message you see carries a stable marker [N]. Old tool output is dead weight — query it, don't re-read it:`,
        `- locate first: {"op":"search","pattern":"error"} returns snippets, never bodies`,
        `- once used, hide: {"op":"delete","ids":[3,5],"summary":"ran build; fixed 2 errors"}`,
        `- rewrite stale nodes: {"op":"replace","id":7,"content":"…"}`,
        `Batch ops into one call. Every node is editable, including this turn's; edits apply from your next step, and storage is permanent, so nothing is lost and /undo reverts any op.`,
        `Delete junk the moment you see it — gibberish, a runaway stack trace, binary noise, a 400-file listing, anything you will never need. Every node left behind is re-read and re-billed on every later step.`,
        `A large result you DID need gets the same treatment: replace it with the answer you took from it, {"op":"replace","id":12,"content":"src/auth.ts:88 renews at 80% of ttl"}, instead of 3000 lines re-read each step. Never re-fetch to re-check — search the node.`,
      ),
    );
  }

  const style = [
    `Short, direct answers — markdown renders in the UI.`,
    ...(have.has("exec") ? [`Verify code changes by running tests/builds via exec.`] : []),
    ...(have.has("task") ? [`Delegate self-contained subtasks to task to protect this context window.`] : []),
  ];
  // `\n`, not " ": the space-joined form rendered as one line, so the heading
  // swallowed its own first sentence — `## Style Short, direct answers — ...` —
  // and the model read a run-on heading instead of a heading plus a rule. Every
  // other section here joins with newlines, so this was the odd one out.
  sections.push(section("style", ...style));

  // pi's self-documentation mechanism: ship docs, route to them, and let the
  // ordinary read tool do the rest. Routing lives in the prompt; the content
  // never does — a doc file read on demand costs nothing per turn.
  ensureAgentDocs();
  sections.push(
    section(
      "self_documentation",
      `fox-agent's own docs are materialized at ${agentDocsDir()}/ — read them when the user asks about fox-agent itself (config, plugins, tools, sessions, themes, protocols) or how to use or extend it. Not otherwise, and do not list the individual files unless asked. Read a file completely, then follow its cross-references.`,
    ),
  );

  // The runtime header rides as a trailing user message, not part of the system
  // prompt — but the model still needs to know what it is and how to treat it.
  sections.push(
    section(
      "runtime_header",
      `A trailing block rides on every user message between a runtime open-tag and close-tag: harness-injected state (working directory, host, model, os, date and time, context use, todos), NOT user speech. Never mention, quote, or restate it unless the user asks about it; answer "what time is it" or "where are we" from its values without citing the header. The clock is rounded to the quarter hour, so quote it as the time of day it is, not as a precise instant.`,
    ),
  );

  return sections.join("\n\n");
}

/**
 * Machine facts, read once per process — none of them can change under a live
 * session, and `os.cpus()` walks the machine's CPU list (sysctl on macOS,
 * /proc/cpuinfo on Linux), which is not worth four syscalls on every step.
 */
let machine: { host: string; os: string; runtime: string } | undefined;
function machineFacts(): { host: string; os: string; runtime: string } {
  if (machine) return machine;
  const versions = process.versions as Record<string, string | undefined>;
  machine = {
    host: os.hostname(),
    // one line rather than four keys: platform/kernel/arch, parallelism (so
    // the agent can decide how much to fan out) and the shell that exec and
    // pty actually run in — all of "what box am I on" in a dozen tokens
    os: `${process.platform} ${os.release()} ${os.arch()} · ${os.cpus().length} cpu · shell=${shellPath()}`,
    runtime: versions.bun ? `bun ${versions.bun}` : `node ${process.version}`,
  };
  return machine;
}

/**
 * Local wall clock at QUARTER-HOUR granularity. The tail is rebuilt every step
 * anyway so the ticking costs nothing extra, and an agent that cannot answer
 * *the* question "what time is it" burns an `exec date` finding out.
 *
 * Quarter-hour, not minute: the stamp is rebuilt every step, so a minute-precision
 * clock changes the bytes of the tail every minute for information nobody
 * needs — an agent plans in quarter hours, and rounding to :00/:15/:30/:45
 * keeps the line stable for a quarter of an hour at a time. Rounding is to the
 * NEAREST quarter hour, so the stamp is never more than 7.5 minutes away from
 * the truth.
 *
 * The offset uses UTC+8 / UTC-5:30 notation rather than a raw +08:00 — it reads
 * as a zone, not as a timestamp, and it cannot be mistaken for part of the date.
 */
function localClock(): { date: string; tz: string } {
  const now = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");

  // round to the nearest :00/:15/:30/:45 — setMinutes(60) rolls into the next
  // hour, and the Date arithmetic rolls the day/month/year with it
  const at = new Date(now.getTime());
  at.setSeconds(0, 0);
  at.setMinutes(Math.round(at.getMinutes() / 15) * 15, 0, 0);


  // the offset is read off the ROUNDED instant, so the zone and the printed
  // clock can never disagree across a DST boundary
  const mins = -at.getTimezoneOffset();
  const abs = Math.abs(mins);
  const offset =
    mins === 0 ? "UTC" : `UTC${mins < 0 ? "-" : "+"}${Math.floor(abs / 60)}${abs % 60 ? `:${p2(abs % 60)}` : ""}`;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || offset;
  return {
    date: `${at.getFullYear()}-${p2(at.getMonth() + 1)}-${p2(at.getDate())} ${p2(at.getHours())}:${p2(at.getMinutes())}`,
    tz: zone === offset ? offset : `${zone} ${offset}`,
  };
}

/**
 * `name` is what the user calls the endpoint — a `[providers.*]` profile or a
 * catalog preset id; `format` is the wire API. Both go to the model: the first
 * says which quota pool and vendor quirks apply, the second says what protocol
 * it is actually speaking (which is what decides caching and tool behaviour).
 */
function providerLine(p?: { name?: string; format?: string }): string {
  const name = p?.name;
  const format = p?.format;
  if (name && format && name !== format) return `${name} (${format})`;
  return name ?? format ?? "unknown";
}

/**
 * The step-varying facts, sent as the LAST message of every request.
 *
 * Position is the whole point. Prefix caches match from the start forward, so
 * volatile content may only live where nothing follows it: the system prompt is
 * followed by the entire conversation (one changed byte there invalidates all
 * of it), while the tail is followed by nothing at all. This block is rebuilt
 * each step and re-appended after the history — it is deliberately NOT
 * persisted, so each request keeps [system … history] byte-identical and only
 * pays for the handful of tokens that actually changed.
 *
 * It rides as a `user` message rather than a second `system` one because the
 * Anthropic adapter hoists every system message into the leading `system`
 * parameter — a trailing system block would land back at position 0 and break
 * exactly the prefix it exists to protect.
 */
export function buildRuntimeHeader(opts: {
  sessionId: string;
  cwd: string;
  model: string;
  provider?: { name?: string; format?: string };
  tools: ToolDef[];
  budget?: RuntimeBudget;
}): string {
  const info = lookupModel(opts.model);
  const have = toolNames(opts.tools);
  const todos = renderTodos(getTodos(opts.sessionId));
  const machine = machineFacts();
  const clock = localClock();

  const lines = [
    `<runtime>`,
    `cwd: ${opts.cwd}`,
    `host: ${machine.host}`,
    `provider: ${providerLine(opts.provider)}`,
    `model: ${opts.model} ctx=${info.contextWindow} out=${info.maxOutput}`,
    `os: ${machine.os}`,
    `runtime: ${machine.runtime}`,
    `tz: ${clock.tz}`,
    `date: ${clock.date}`,
    `ver: v${VERSION}`,
    ...(todos ? [`todos:\n${todos}`] : []),
    `</runtime>`,
  ];

  // gated on ctx exactly like the doctrine above: a figure the agent has no
  // tool to act on is noise, and this one costs real tokens every step
  if (have.has("ctx") && opts.budget && opts.budget.reported > 0) {
    const b = opts.budget;
    const pct = Math.round(b.ratio * 100);
    lines.splice(lines.indexOf(`</runtime>`), 0, `ctx: ${b.reported} (${pct}% of ${b.limit})`);
    // The harness no longer compacts on its own: it says how full the window is
    // and, past a threshold, says what to do about it. Both messages name the
    // actual percentage so the agent can see how far past the line it is rather
    // than guessing from a bare instruction.
    if (b.stage === "ctxOnly") {
      lines.push(
        `<context_alert>`,
        `The window is ${pct}% full — past the ${Math.round(b.thresholds.ctxOnlyAt * 100)}% limit where only ctx stays available. Every other tool is disabled until you bring it down.`,
        `Compact now, in this order:`,
        `1. Hide tool output you have already used: {"op":"delete","ids":[…],"summary":"one line saying what you learned"}.`,
        `2. Replace a large result you still need with its conclusion: {"op":"replace","id":N,"content":"the answer, the path, the error — not the 3000 lines"}.`,
        `3. Keep goals, decisions, exact file paths, commands run and loose ends. Drop raw output and dead ends.`,
        `Storage is permanent and /undo reverts any op, so nothing is lost by hiding it. Do this in one or two ctx calls, then continue the task.`,
        `</context_alert>`,
      );
    } else if (b.stage === "warn") {
      lines.push(
        `<context_alert>`,
        `The window is ${pct}% full; tools are disabled at ${Math.round(b.thresholds.ctxOnlyAt * 100)}%. Start compacting deliberately now, before you are forced to:`,
        `hide tool output you have already used, and replace large results you still need with a short conclusion via ctx. ` +
          `Do it as you go rather than in one panic pass at the limit.`,
        `</context_alert>`,
      );
    }
  }

  return lines.join("\n");
}

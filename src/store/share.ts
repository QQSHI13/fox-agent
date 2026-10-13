/**
 * `/share` — a session as ONE self-contained, offline HTML file.
 *
 * Written for a file people email around, so three things differ from a plain
 * dump:
 *
 * - RENDERED, not raw. Message text goes through the same `renderMarkdown` the
 *   TUI uses, so code fences, tables, task lists, links and syntax colors are
 *   exactly what you saw. A `Seg` carries structured `fg`/`bg`/bold/italic/
 *   strike/href, so this is a direct mapping to spans — no ANSI round-trip
 *   (pi-mono has to convert from ANSI because its renderer emits ANSI; ours
 *   holds the styles directly, which is lossless).
 * - CAPPED. An unbounded file is a liability: a session with a huge tool result
 *   produces a page nobody can open. Per-message and total budgets, and the
 *   truncation is visible rather than silent.
 * - REDACTED. Tool arguments and shell output can carry credentials. The
 *   obvious shapes are masked before they reach the page, and the page says so.
 *
 * Everything is inlined — no fonts, scripts, or images fetched at view time — so
 * the file works from a USB stick with no network. Images ride as the data URIs
 * they already are in the store.
 */
import { writeFileSync } from "node:fs";
import { allMessagesLite, getSession, type MessageRow } from "./db.ts";
import { renderMarkdown } from "../tui/markdown.ts";
import { theme } from "../tui/themes.ts";

/** Per-message cap on rendered body text. A runaway tool result gets cut here. */
const MAX_BODY_CHARS = 40_000;
/** Whole-page cap. Past this the export says so instead of growing without end. */
const MAX_TOTAL_CHARS = 4_000_000;
/** Fixed render width for the page. Matches the exporter's CSS column. */
const WIDTH = 96;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Allow-list link targets. A session's links come from model output, so a
 * `javascript:` href in a shared page would be a real problem; C0 controls are
 * stripped first so nothing can smuggle a newline into a scheme.
 */
function safeUrl(raw: string): string | null {
  const u = raw.replace(/[\x00-\x1f\x7f]/g, "").trim();
  return /^(https?:|mailto:|tel:|ftp:)/i.test(u) ? u : null;
}

/** Mask credential-shaped text. Deliberately blunt — a false positive costs a little context, a false negative leaks. */
function redact(s: string): string {
  return s
    // sk-…, sk_live_…, ghp_…, gho_…, xoxb-…, AKIA…, and long bearer tokens
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, "[redacted-key]")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[redacted-key]")
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "[redacted-token]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[redacted-key]")
    .replace(/\bAIza[0-9A-Za-z_-]{30,}\b/g, "[redacted-key]")
    .replace(/(["']?(?:api[_-]?key|apikey|token|secret|password|passwd|authorization)["']?\s*[:=]\s*)["'][^"']{8,}["']/gi, '$1"[redacted]"')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{16,}\b/g, "Bearer [redacted]");
}

/** One Seg[] row → HTML. A run of identical style is merged into one span. */
function rowHtml(segs: { t: string; fg?: string; bg?: string; bold?: boolean; italic?: boolean; strike?: boolean; href?: string }[]): string {
  let out = "";
  let run: (typeof segs)[number] | null = null;
  let buf = "";
  const flush = () => {
    if (!run || !buf) return;
    const css: string[] = [];
    if (run.fg) css.push(`color:${run.fg}`);
    if (run.bg) css.push(`background:${run.bg}`);
    if (run.bold) css.push("font-weight:600");
    if (run.italic) css.push("font-style:italic");
    if (run.strike) css.push("text-decoration:line-through");
    const attrs = css.length ? ` style="${css.join(";")}"` : "";
    if (run.href) {
      const u = safeUrl(run.href);
      out += u
        ? `<a href="${esc(u)}" rel="noreferrer noopener">${esc(buf)}</a>`
        : `<span${attrs}>${esc(buf)}</span>`;
    } else {
      out += `<span${attrs}>${esc(buf)}</span>`;
    }
  };
  for (const s of segs) {
    if (s.href && !safeUrl(s.href)) {
      // a link we refuse to emit: fall back to plain text, never an anchor
      if (run) { flush(); run = null; buf = ""; }
      const merged = `${buf}${s.t}`;
      const st: string[] = [];
      if (s.fg) st.push(`color:${s.fg}`);
      out += `<span${st.length ? ` style="${st.join(";")}"` : ""}>${esc(merged)}</span>`;
      buf = "";
      run = null;
      continue;
    }
    if (!run || run.fg !== s.fg || run.bg !== s.bg || run.bold !== s.bold || run.italic !== s.italic || run.strike !== s.strike || run.href !== s.href) {
      flush();
      run = { ...s, t: "" };
      buf = "";
    }
    buf += s.t;
  }
  flush();
  return out;
}

const cap = (s: string, n: number): { text: string; cut: boolean } => {
  const t = redact(s);
  return t.length <= n ? { text: t, cut: false } : { text: t.slice(0, n), cut: true };
};

/** A markdown body → styled HTML, using the TUI's own renderer. */
function mdHtml(text: string): { html: string; cut: boolean } {
  const { text: t, cut } = cap(text, MAX_BODY_CHARS);
  const rows = renderMarkdown(t, undefined, WIDTH);
  return { html: rows.map((r) => `<p class="ln">${rowHtml(r) || "&nbsp;"}</p>`).join("\n"), cut };
}

interface ToolCall { id: string; name: string; arguments: string }
interface Piece {
  kind: "msg" | "think" | "tool" | "toolresult";
  role: string;
  seq: number;
  text?: string;
  call?: ToolCall;
  result?: { ok: boolean; output: string };
  media?: { mimeType: string; data: string; filename?: string }[];
}

function decodeCalls(raw: string | null): ToolCall[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * Messages → renderable pieces, pairing each tool_call with its result by id so
 * a call and its output land together. The parent/chain fields exist in the
 * store but the transcript reads as one linear list, which is what a reader of
 * the page expects.
 */
function pieces(rows: MessageRow[]): Piece[] {
  const resultOf = new Map<string, { ok: boolean; output: string }>();
  for (const m of rows) {
    if (m.role === "tool" && m.tool_call_id) {
      resultOf.set(m.tool_call_id, { ok: !m.error, output: m.error ? m.error : m.content });
    }
  }
  const out: Piece[] = [];
  for (const m of rows) {
    const media = m.media ? safeParseMedia(m.media) : undefined;
    if (m.role === "tool") {
      out.push({ kind: "toolresult", role: m.role, seq: m.seq, text: m.content, result: { ok: !m.error, output: m.error ?? m.content }, media });
      continue;
    }
    if (m.role === "think") {
      out.push({ kind: "think", role: m.role, seq: m.seq, text: m.content });
      continue;
    }
    if (m.role === "assistant") {
      for (const c of decodeCalls(m.tool_calls)) {
        out.push({ kind: "tool", role: m.role, seq: m.seq, call: c, result: resultOf.get(c.id) });
      }
    }
    if (m.content) out.push({ kind: "msg", role: m.role, seq: m.seq, text: m.content, media });
  }
  return out;
}

function safeParseMedia(raw: string): { mimeType: string; data: string; filename?: string }[] {
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    // only image data URIs make it into a page; audio/video would bloat it
    return v.filter((m) => typeof m?.mimeType === "string" && m.mimeType.startsWith("image/") && typeof m.data === "string");
  } catch {
    return [];
  }
}


function themeVars(): Record<string, string> {
  const t = theme() as unknown as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(t)) {
    if (typeof v === "string" && v.startsWith("#")) out[k.startsWith("--") ? k : `--${k}`] = v;
  }
  return out;
}

function mediaHtml(m: { mimeType: string; data: string; filename?: string }[]): string {
  return m
    .map((x) => `<img src="data:${esc(x.mimeType)};base64,${esc(x.data)}" alt="${esc(x.filename ?? "image")}" loading="lazy">`)
    .join("\n");
}

export interface ShareResult {
  path: string;
  bytes: number;
  truncated: boolean;
  redacted: boolean;
}

/** Render the session to a standalone HTML file at `outPath`. */
export function shareSession(sessionId: string, outPath: string): ShareResult {
  const s = getSession(sessionId);
  if (!s) throw new Error(`no session ${sessionId}`);
  const rows = allMessagesLite(sessionId);
  if (!rows.length) throw new Error(`session ${sessionId} has no messages`);

  const ps = pieces(rows);
  let total = 0;
  let truncated = false;
  let anyCut = false;

  const body: string[] = [];
  for (const p of ps) {
    if (total >= MAX_TOTAL_CHARS) {
      truncated = true;
      break;
    }
    const seq = `<a class="n" href="#m${p.seq}" id="m${p.seq}">[${p.seq}]</a>`;
    if (p.kind === "msg") {
      const { html, cut } = mdHtml(p.text ?? "");
      anyCut = anyCut || cut;
      total += (p.text ?? "").length;
      const who = p.role === "user" ? "you" : "agent";
      body.push(
        `<section class="m ${esc(p.role)}"><header>${seq}<span class="who">${esc(who)}</span></header>${html}` +
          (p.media?.length ? `\n<div class="media">${mediaHtml(p.media)}</div>` : "") +
          `</section>`,
      );
      continue;
    }
    if (p.kind === "think") {
      const { html, cut } = mdHtml(p.text ?? "");
      anyCut = anyCut || cut;
      total += (p.text ?? "").length;
      body.push(`<section class="m think"><header>${seq}<span class="who">thinking</span></header><details><summary>reasoning</summary>${html}</details></section>`);
      continue;
    }
    if (p.kind === "tool") {
      const args = cap(p.call?.arguments ?? "", MAX_BODY_CHARS);
      anyCut = anyCut || args.cut;
      total += args.text.length;
      const name = esc(p.call?.name ?? "tool");
      const inner = args.text
        ? `<pre class="args">${esc(args.text)}</pre>`
        : "";
      body.push(
        `<section class="m tool"><header>${seq}<span class="who">${name}</span></header>${inner}` +
          `<p class="hint">no output yet</p></section>`,
      );
      continue;
    }
    if (p.kind === "toolresult" && p.result) {
      const { html, cut } = mdHtml(p.result.output);
      anyCut = anyCut || cut;
      total += p.result.output.length;
      const ok = p.result.ok;
      body.push(
        `<section class="m result ${ok ? "ok" : "bad"}"><details${ok ? "" : " open"}><summary>[${p.seq}] · output</summary>${html}` +
          (p.media?.length ? `\n<div class="media">${mediaHtml(p.media)}</div>` : "") +
          `</details></section>`,
      );
      continue;
    }
  }

  const vars = Object.entries(themeVars())
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  const title = s.title?.trim() || `fox session ${s.id}`;
  const when = new Date(s.created_at).toISOString().replace("T", " ").slice(0, 16);

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{${vars};--bg:#14161f;--panel:#1a1d28;--edge:#2a2f3d;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
@media (prefers-color-scheme:light){:root{--bg:#fbfbfd;--panel:#f2f3f7;--edge:#dcdfe8}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}
.wrap{max-width:${WIDTH}ch;margin:0 auto;padding:32px 20px 80px}
header.top{border-bottom:1px solid var(--edge);padding-bottom:14px;margin-bottom:22px}
h1{font-size:19px;margin:0 0 6px}
.meta{color:var(--chrome);font-size:13px}
.note{color:var(--chrome);font-size:12.5px;margin:14px 0 0;padding:9px 11px;border-left:3px solid var(--edge);background:var(--panel)}
section.m{margin:0 0 4px;padding:9px 12px;border-radius:7px;background:var(--panel);border:1px solid var(--edge)}
section.think{opacity:.82}
section.tool{background:transparent}
section.result{margin:0 0 14px 22px}
section.m header{display:flex;gap:9px;align-items:baseline;font-size:12.5px;margin-bottom:5px}
a.n{color:var(--chrome);text-decoration:none;font-family:var(--mono)}
a.n:hover{color:var(--accent)}
.who{font-weight:600;color:var(--user)}
section.tool .who{color:var(--tool)}
section.think .who{color:var(--chrome)}
section.bad .who{color:var(--error)}
section.ok .who{color:var(--ok)}
p.ln{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
p.ln+.ln{margin-top:0}
pre.args{margin:6px 0 0;padding:8px 10px;background:rgba(127,127,127,.09);border-radius:5px;font:12.5px/1.5 var(--mono);white-space:pre-wrap;overflow-wrap:anywhere}
details>summary{cursor:pointer;color:var(--chrome);font-size:12.5px;list-style:none}
details>summary::-webkit-details-marker{display:none}
details>summary::before{content:"▸ ";color:var(--accent)}
details[open]>summary::before{content:"▾ "}
.hint{color:var(--chrome);font-size:12.5px;margin:6px 0 0}
.media{margin-top:9px;display:flex;gap:9px;flex-wrap:wrap}
.media img{max-width:340px;border-radius:5px;border:1px solid var(--edge)}
a{color:var(--info)}
code{font-family:var(--mono);font-size:.93em}
hr{border:0;border-top:1px solid var(--edge);margin:18px 0}
blockquote{margin:7px 0;padding-left:11px;border-left:3px solid var(--edge);color:var(--chrome)}
table{border-collapse:collapse;margin:7px 0}
td,th{border:1px solid var(--edge);padding:3px 7px}
</style></head>
<body><div class="wrap">
<header class="top">
<h1>${esc(title)}</h1>
<div class="meta">${esc(s.model)} · ${esc(when)} · ${ps.length} events · session ${esc(s.id)}</div>
</header>
${anyCut || truncated ? `<p class="note">This export is capped: long content was shortened${truncated ? " and some events were left out" : ""}. Credential-shaped text was masked.</p>` : `<p class="note">Self-contained: styles, images and content are all inline — it works offline. Credential-shaped text has been masked.</p>`}
${body.join("\n")}
</div></body></html>`;

  const bytes = Buffer.byteLength(html, "utf8");
  writeFileSync(outPath, html);
  return { path: outPath, bytes, truncated: anyCut || truncated, redacted: true };
}

/**
 * `/share` — a session as ONE self-contained, offline HTML file.
 *
 * The counterpart to /export, which MOVES a session between your own machines
 * (a db in a zip, for `fox import`). This is for SHOWING one to someone else:
 * open it in any browser, no fox required, no network, nothing uploaded.
 *
 * Renders through the TUI's own `renderMarkdown`, so code fences, tables, task
 * lists, links and Shiki's real syntax colors are exactly what you saw. No ANSI
 * round-trip is needed: a `Seg` already carries fg/bg/bold/italic/strike/href,
 * so mapping to spans is direct and lossless. (pi-mono has to convert from ANSI
 * because its renderer emits ANSI; ours holds the styles already.)
 *
 * Two things differ from a raw dump, both because the file travels:
 * - REDACTED. Tool arguments and prose can carry credentials, so
 *   credential-shaped text is masked before it reaches the page.
 * - WHOLE. Nothing is truncated: a session that silently dropped a long tool
 *   result would misrepresent the work to whoever is reading it.
 *
 * Everything is inlined — no fonts, scripts or images fetched at view time — so
 * it works from a USB stick with the network off. Images ride as the data URIs
 * they already are in the store.
 */
import { writeFileSync } from "node:fs";
import { allMessages, getSession, type MessageRow } from "./db.ts";
import { renderMarkdown } from "../tui/markdown.ts";
import { theme } from "../tui/themes.ts";
import type { Seg } from "../tui/wrap.ts";

/** Render width. Matches the exporter's CSS column so the layout decides once. */
const WIDTH = 96;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Allow-list link targets. A session's links come from model output, so a
 * `javascript:` href in a shared page would be a real problem. C0 controls are
 * stripped first so nothing can smuggle a newline into a scheme.
 */
function safeUrl(raw: string): string | null {
  const u = raw.replace(/[\x00-\x1f\x7f]/g, "").trim();
  return /^(https?:|mailto:|tel:|ftp:)/i.test(u) ? u : null;
}

/**
 * Mask credential-shaped text. Blunt on purpose: a false positive costs a
 * little readability, a false negative leaks a live key into a file someone is
 * about to email. Covers the vendor key prefixes we could name, generic
 * `token=`/`password:`-shaped assignments, and bearer headers.
 */
function redact(s: string): string {
  return s
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, "[redacted-key]")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[redacted-key]")
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "[redacted-token]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[redacted-key]")
    .replace(/\bAIza[0-9A-Za-z_-]{30,}\b/g, "[redacted-key]")
    .replace(/(["']?(?:api[_-]?key|apikey|token|secret|password|passwd|authorization)["']?\s*[:=]\s*)["'][^"']{8,}["']/gi, '$1"[redacted]"')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{16,}\b/g, "Bearer [redacted]");
}

const styleOf = (s: Seg): string => {
  const css: string[] = [];
  if (s.fg) css.push(`color:${s.fg}`);
  if (s.bg) css.push(`background:${s.bg}`);
  if (s.bold) css.push("font-weight:650");
  if (s.italic) css.push("font-style:italic");
  if (s.strike) css.push("text-decoration:line-through");
  return css.length ? ` style="${css.join(";")}"` : "";
};

/** One Seg[] row → HTML, merging consecutive segs that share a style. */
function rowHtml(segs: Seg[]): string {
  let out = "";
  let run: Seg | null = null;
  let buf = "";
  const flush = () => {
    if (!run || !buf) return;
    const u = run.href ? safeUrl(run.href) : null;
    // a link we refuse to emit (bad scheme) degrades to plain text, never an anchor
    if (u) out += `<a href="${esc(u)}" rel="noreferrer noopener">${esc(buf)}</a>`;
    else out += `<span${styleOf(run)}>${esc(buf)}</span>`;
  };
  for (const s of segs) {
    const same =
      run !== null &&
      run.fg === s.fg &&
      run.bg === s.bg &&
      run.bold === s.bold &&
      run.italic === s.italic &&
      run.strike === s.strike &&
      run.href === s.href;
    if (!same) {
      flush();
      run = { ...s };
      buf = "";
    }
    buf += s.t;
  }
  flush();
  return out;
}

/** True when a row is a fenced-code line (the TUI prefixes each with `│ `). */
function isCodeRow(segs: Seg[]): boolean {
  return (segs[0]?.t ?? "").startsWith("│");
}

/** Strip the TUI's terminal gutter so the browser gets clean code. */
function stripGutter(segs: Seg[]): Seg[] {
  const out = segs.map((s) => ({ ...s }));
  const first = out[0];
  if (first && first.t.startsWith("│")) first.t = first.t.slice(1);
  for (const s of out) if (s.t.startsWith(" ")) s.t = s.t.slice(1);
  return out;
}

/**
 * A markdown body → HTML, using the TUI's renderer.
 *
 * The TUI marks fenced code with a `│ ` gutter on every line, which is right in
 * a terminal and noise in a browser, so contiguous code rows are regrouped into
 * one real <pre> block.
 */
function mdHtml(text: string): string {
  const rows = renderMarkdown(redact(text), undefined, WIDTH);
  const out: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!isCodeRow(row)) {
      if (row.some((s) => s.t.trim())) out.push(`<p>${rowHtml(row)}</p>`);
      continue;
    }
    const block: Seg[][] = [];
    while (i < rows.length && isCodeRow(rows[i])) block.push(stripGutter(rows[i++]));
    i--;
    out.push(`<pre class="code">${block.map((b) => rowHtml(b)).join("\n")}</pre>`);
  }
  return out.join("\n");
}

interface ToolCall { id: string; name: string; arguments: string }
interface Media { mimeType: string; data: string; filename?: string }

type Piece =
  | { kind: "msg"; role: string; seq: number; text: string; media?: Media[] }
  | { kind: "think"; seq: number; text: string }
  | { kind: "tool"; seq: number; call: ToolCall; result?: { ok: boolean; output: string; media?: Media[] } }
  | { kind: "result"; seq: number; ok: boolean; output: string; toolCallId: string; media?: Media[] };

function safeParseMedia(raw: string): Media[] {
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    // only image data URIs make it into a page; audio/video would bloat it
    return v.filter((m) => typeof m?.mimeType === "string" && m.mimeType.startsWith("image/") && typeof m.data === "string");
  } catch {
    return [];
  }
}

/**
 * Messages → renderable pieces, pairing each tool_call with its result by id so
 * a call and its output land together. The store's parent/chain fields exist,
 * but a reader of the page expects one linear transcript, which is what this is.
 */
function pieces(rows: MessageRow[]): Piece[] {
  const resultOf = new Map<string, { ok: boolean; output: string; media?: Media[] }>();
  for (const m of rows) {
    if (m.role === "tool" && m.tool_call_id) {
      resultOf.set(m.tool_call_id, {
        ok: !m.error,
        output: m.error ?? m.content,
        media: m.media ? safeParseMedia(m.media) : undefined,
      });
    }
  }
  const out: Piece[] = [];
  for (const m of rows) {
    const media = m.media ? safeParseMedia(m.media) : undefined;
    if (m.role === "tool" && m.tool_call_id) {
      out.push({ kind: "result", seq: m.seq, ok: !m.error, output: m.error ?? m.content, toolCallId: m.tool_call_id, media });
      continue;
    }
    if (m.role === "think") {
      out.push({ kind: "think", seq: m.seq, text: m.content });
      continue;
    }
    if (m.role === "assistant" && m.tool_calls) {
      try {
        const calls = JSON.parse(m.tool_calls);
        if (Array.isArray(calls)) {
          for (const c of calls) {
            out.push({ kind: "tool", seq: m.seq, call: c, result: resultOf.get(c.id) });
          }
        }
      } catch {
        /* unparseable tool_calls: the message text still renders below */
      }
    }
    if (m.content) out.push({ kind: "msg", role: m.role, seq: m.seq, text: m.content, media });
  }
  return out;
}

const mediaHtml = (m: Media[]): string =>
  m.map((x) => `<img src="data:${esc(x.mimeType)};base64,${esc(x.data)}" alt="${esc(x.filename ?? "image")}" loading="lazy">`).join("");

/** Theme → CSS custom properties, so the page matches the active theme. */
function themeVars(): string {
  const t = theme() as unknown as Record<string, unknown>;
  return Object.entries(t)
    .filter(([, v]) => typeof v === "string" && v.startsWith("#"))
    .map(([k, v]) => `${k.startsWith("--") ? k : `--${k}`}:${v}`)
    .join(";");
}

/** Relative luminance of a #rrggbb, for the light/dark decision. */
function lum(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

export interface ShareResult {
  path: string;
  bytes: number;
  messages: number;
  redacted: boolean;
}

/** Render a session to a standalone HTML file at `outPath`. */
export function shareSession(sessionId: string, outPath: string): ShareResult {
  const s = getSession(sessionId);
  if (!s) throw new Error(`no session ${sessionId}`);
  // `allMessages`, not the lite projection: the page shows images (which live in
  // `media`) and must not render a failed tool as a clean one (which needs
  // `error`). The lite select exists to keep transcript REPLAY cheap; a share is
  // one session, one call, and its whole point is fidelity.
  const rows = allMessages(sessionId);
  if (!rows.length) throw new Error(`session ${sessionId} has no messages`);

  const ps = pieces(rows);
  const toolCount = ps.filter((p) => p.kind === "tool").length;
  const imgCount = ps.reduce((n, p) => n + ("media" in p ? (p.media?.length ?? 0) : 0), 0);
  // a tool result already rendered inside its call's <details> is not repeated;
  // only an ORPHAN (a result whose call we never saw) gets its own block
  const shown = new Set<string>();
  for (const p of ps) if (p.kind === "tool" && p.call?.id) shown.add(p.call.id);

  const body: string[] = [];
  for (const p of ps) {
    const anchor = `<a class="n" id="m${p.seq}" href="#m${p.seq}">${p.seq}</a>`;
    if (p.kind === "msg") {
      const who = p.role === "user" ? "You" : "fox";
      body.push(
        `<article class="msg ${p.role}"><header>${anchor}<span class="who">${who}</span></header>` +
          `<div class="body">${mdHtml(p.text)}</div>` +
          (p.media?.length ? `<div class="media">${mediaHtml(p.media)}</div>` : "") +
          `</article>`,
      );
      continue;
    }
    if (p.kind === "think") {
      body.push(
        `<article class="msg think"><header>${anchor}<span class="who">Thinking</span></header>` +
          `<details><summary>reasoning</summary><div class="body">${mdHtml(p.text)}</div></details></article>`,
      );
      continue;
    }
    if (p.kind === "tool") {
      const args = redact(p.call?.arguments ?? "");
      body.push(
        `<article class="msg tool"><header>${anchor}<span class="who">${esc(p.call?.name ?? "tool")}</span></header>` +
          (args ? `<details><summary>input</summary><pre class="code">${esc(args)}</pre></details>` : "") +
          (p.result
            ? `<details class="out"${p.result.ok ? "" : " open"}><summary>output${p.result.ok ? "" : " (failed)"}</summary><div class="body">${mdHtml(p.result.output)}</div></details>` +
              (p.result.media?.length ? `<div class="media">${mediaHtml(p.result.media)}</div>` : "")
            : `<p class="pending">no output</p>`) +
          `</article>`,
      );
      continue;
    }
    if (p.kind === "result") {
      // already shown inside its call's <details class="out">
      if (shown.has(p.toolCallId)) continue;
      body.push(
        `<details class="orphan"${p.ok ? "" : " open"}><summary>${p.seq} · ${p.ok ? "output" : "failed"}</summary>` +
          `<div class="body">${mdHtml(p.output)}</div></details>`,
      );
    }
  }

  const t = theme() as unknown as Record<string, string>;
  const dark = lum(t.inputBg ?? "#000") < 0.5;
  const title = s.title?.trim() || `fox session ${s.id}`;
  const when = new Date(s.created_at).toISOString().replace("T", " ").slice(0, 16);

  const html = `<!doctype html>
<html lang="en" data-theme="${dark ? "dark" : "light"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{${themeVars()};--bg:${dark ? "#14161f" : "#fbfbfd"};--edge:${dark ? "#2a2f3d" : "#dcdfe8"};--panel:${dark ? "#1a1d28" : "#f2f3f7"};--mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;--sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
html[data-theme=dark]{color-scheme:dark}
html[data-theme=light]{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 var(--sans);-webkit-font-smoothing:antialiased}
.wrap{max-width:${WIDTH}ch;margin:0 auto;padding:0 24px 25vh}
header.top{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--edge);padding:26px 0 14px;margin-bottom:30px}
h1{font-size:20px;line-height:1.3;margin:0 0 7px;font-weight:640;letter-spacing:-.01em}
.meta{color:var(--chrome);font-size:13px}
.note{color:var(--chrome);font-size:12.5px;margin:16px 0 0;padding:9px 12px;border-left:2px solid var(--edge);background:var(--panel);border-radius:0 5px 5px 0}
article.msg{margin:0 0 4px;padding:10px 14px;border:1px solid transparent;border-radius:8px}
article.msg:hover{border-color:var(--edge)}
article.msg+article.msg{margin-top:3px}
article.user{background:var(--panel)}
article.msg header{display:flex;gap:10px;align-items:baseline;font-size:12.5px;margin-bottom:6px}
a.n{color:var(--chrome);text-decoration:none;font:12px/1 var(--mono);min-width:2.4em;opacity:.75}
a.n:hover{color:var(--accent);opacity:1}
.who{font-weight:600;letter-spacing:.01em}
article.user .who{color:var(--user)}
article.tool .who{color:var(--tool)}
article.think .who{color:var(--chrome);font-weight:500}
article.tool,article.think{opacity:.9}
.pending{color:var(--chrome);font-size:12.5px;margin:2px 0 0;font-style:italic}
.body>:first-child{margin-top:0}
.body>:last-child{margin-bottom:0}
.body p{margin:0 0 11px}
.body p:last-child{margin-bottom:0}
pre.code{margin:10px 0;padding:12px 14px;background:rgba(127,127,127,.09);border:1px solid var(--edge);border-radius:7px;font:13px/1.55 var(--mono);white-space:pre-wrap;overflow-wrap:anywhere;tab-size:2}
details{margin:8px 0 0}
summary{cursor:pointer;color:var(--chrome);font-size:12.5px;list-style:none;user-select:none}
summary::-webkit-details-marker{display:none}
summary::before{content:"▸";display:inline-block;width:1em;color:var(--accent);transition:transform .12s ease}
details[open]>summary::before{transform:rotate(90deg)}
details.out>summary::after{content:" output";opacity:.7}
details:hover>summary{color:var(--fg)}
.media{margin-top:12px;display:flex;gap:10px;flex-wrap:wrap}
.media img{max-width:360px;border-radius:7px;border:1px solid var(--edge)}
a{color:var(--info)}
code{font:13px var(--mono);background:rgba(127,127,127,.13);padding:1px 4px;border-radius:3px}
pre code{background:none;padding:0}
hr{border:0;border-top:1px solid var(--edge);margin:22px 0}
blockquote{margin:10px 0;padding:2px 0 2px 13px;border-left:2px solid var(--edge);color:var(--chrome)}
table{border-collapse:collapse;margin:12px 0;font-size:14px}
td,th{border:1px solid var(--edge);padding:5px 9px;text-align:left}
th{background:rgba(127,127,127,.07);font-weight:600}
ul,ol{margin:0 0 11px;padding-left:1.5em}
li{margin:2px 0}
.orphan{margin:2px 0 10px 26px;padding:8px 12px;background:var(--panel);border-radius:6px}
</style>
</head>
<body><div class="wrap">
<header class="top">
<h1>${esc(title)}</h1>
<div class="meta">${esc(s.model)} · ${esc(when)} · ${rows.length} messages${toolCount ? ` · ${toolCount} tool call${toolCount === 1 ? "" : "s"}` : ""}${imgCount ? ` · ${imgCount} image${imgCount === 1 ? "" : "s"}` : ""}</div>
</header>
<p class="note">Self-contained — styles, colors and images are all inline, so this file works offline and nothing was uploaded. Credential-shaped text has been masked.</p>
${body.join("\n")}
</div></body></html>`;

  const bytes = Buffer.byteLength(html, "utf8");
  writeFileSync(outPath, html);
  return { path: outPath, bytes, messages: rows.length, redacted: true };
}

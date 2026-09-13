import type { ToolDef } from "../providers/types.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import { fail, ok } from "./types.ts";
import { MAX_READ_BYTES, modelAcceptsMedia } from "./files.ts";
import { VERSION } from "../core/version.ts";

export const fetchDef: ToolDef = {
  name: "fetch",
  description:
    "Fetch a URL and return its content as text. HTML is stripped to readable text; JSON is returned raw. Image/audio/video URLs attach as media when the current model accepts that kind of input (otherwise an error says so). Caps ~20KB of text, 10MB of media.",
  parameters: {
    type: "object",
    properties: { url: { type: "string", description: "http(s) URL" } },
    required: ["url"],
  },
};

const CAP = 20_000;
// Hard cap on what we ever buffer: text keeps a bounded head for truncation,
// media keeps up to MAX_READ_BYTES. Anything larger is refused mid-stream so a
// chunked evil body cannot OOM the process before the cap check.
const MAX_TEXT_BUFFER = CAP * 4;
const MAX_MEDIA_BUFFER = 15_000_000;
const MAX_REDIRECTS = 5;

function privateHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  // Literal IPs: loopback, RFC1918, link-local/metadata, IPv6 loopback/link-local.
  if (/^127\./.test(h)) return true;
  if (h === "::1" || h === "::ffff:127.0.0.1") return true;
  if (/^fe80:/i.test(h) || /^fec0:/i.test(h)) return true;
  const m4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (m4) {
    const [a, b] = [+m4[1], +m4[2]];
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
  }
  return false;
}

/** SSRF gate: only http(s), no loopback/private/metadata unless explicitly allowed. */
function checkUrl(u: URL): string | null {
  if (!/^https?:$/.test(u.protocol)) return "error: only http(s) URLs are supported";
  if (privateHostname(u.hostname) && process.env.FOX_AGENT_ALLOW_PRIVATE_FETCH !== "1") {
    return `error: refusing private/local URL ${u.hostname} (set FOX_AGENT_ALLOW_PRIVATE_FETCH=1 to allow)`;
  }
  return null;
}

/** Read a body stream with a byte cap; returns { bytes, truncated }. */
async function readCapped(body: ReadableStream<Uint8Array> | null, maxBytes: number, signal: AbortSignal): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!body) return { bytes: new Uint8Array(0), truncated: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw new Error("aborted");
      if (done) break;
      if (!value) continue;
      total += value.length;
      if (total > maxBytes) {
        // keep a bounded head for truncation messaging
        const keep = maxBytes - chunks.reduce((a, c) => a + c.length, 0);
        if (keep > 0) chunks.push(value.subarray(0, keep));
        truncated = true;
        try {
          await reader.cancel();
        } catch {}
        break;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return { bytes: out, truncated };
}

/** Block-level tags: an opening one becomes a newline; every tag is dropped. */
const BLOCK_OPEN = new Set([
  "br", "p", "div", "li", "tr", "td", "th", "section", "article", "header", "footer",
  "blockquote", "pre", "ul", "ol", "table", "h1", "h2", "h3", "h4", "h5", "h6",
]);
/** Contents are never text: skipped whole, from open tag to close tag. */
const SKIP_TAGS = new Set(["script", "style", "noscript", "template", "svg", "canvas"]);

function htmlToText(html: string): string {
  // A small state machine instead of regexes over tag structure — regex
  // stripping is the "bad HTML filtering regexp" / "incomplete multi-character
  // sanitization" class. The output is plain text for the model, never
  // re-rendered as HTML, so nothing here has to survive an attacker crafting
  // hostile markup; it just has to read well.
  let out = "";
  let i = 0;
  const n = html.length;
  while (i < n) {
    if (html[i] !== "<") {
      out += html[i];
      i++;
      continue;
    }
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    const m = /^<\s*\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(i, i + 64));
    if (!m) {
      out += "<"; // a stray "<" in text
      i++;
      continue;
    }
    const name = m[1].toLowerCase();
    const gt = html.indexOf(">", i);
    if (gt < 0) break; // unterminated tag: drop the rest
    const isClosing = /<\s*\//.test(html.slice(i, i + 8));
    if (SKIP_TAGS.has(name) && !isClosing) {
      // skip the whole block up to its close tag (or the end)
      const close = html.slice(gt + 1).toLowerCase().indexOf(`</${name}`);
      i = close < 0 ? n : gt + 1 + close;
      continue;
    }
    if (!isClosing && BLOCK_OPEN.has(name)) out += "\n";
    i = gt + 1;
  }
  // decode entities in one pass through a callback — named entities plus
  // numeric (decimal/hex) references, unknown names left untouched (no double
  // unescaping: "&amp;lt;" stays "&lt;")
  const NAMED: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    mdash: "—", ndash: "–", hellip: "…", copy: "©", reg: "®", trade: "™",
  };
  out = out.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, ent: string) => {
    const e = ent.toLowerCase();
    if (e.startsWith("#")) {
      const num = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(num) && num > 0 && num <= 0x10ffff ? String.fromCodePoint(num) : whole;
    }
    return NAMED[e] ?? whole;
  });
  return out
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchRun(args: { url?: string }, ctx: ToolContext): Promise<ToolResult> {
  let url: URL;
  try {
    url = new URL(args.url ?? "");
  } catch {
    return fail("error: fetch needs a valid absolute http(s) URL");
  }
  {
    const blocked = checkUrl(url);
    if (blocked) return fail(blocked);
  }

  try {
    // Manual redirects so every hop is re-validated (a public URL 302 to
    // 169.254.169.254 must not bypass the SSRF gate).
    let res: Response | null = null;
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const r = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(ctx.signal ? [ctx.signal] : [])]),
        headers: { "user-agent": `fox-agent/${VERSION} (+https://github.com/QQSHI13/fox-agent)` },
      });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        const next = new URL(r.headers.get("location")!, current);
        try {
          await r.body?.cancel();
        } catch {}
        const blocked = checkUrl(next);
        if (blocked) return fail(blocked);
        current = next;
        continue;
      }
      res = r;
      break;
    }
    if (!res) return fail(`error: too many redirects for ${url}`);
    url = current;
    if (!res.ok) return fail(`error: HTTP ${res.status} ${res.statusText} for ${url}`);
    const ctype = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const lenHeader = Number(res.headers.get("content-length") ?? "");
    // Binary media: attach for a capable model rather than dumping bytes as text
    const mediaKind = /^(image|audio|video)$/.exec(ctype.split("/")[0] ?? "")?.[0] as "image" | "audio" | "video" | undefined;
    if (mediaKind) {
      if (!modelAcceptsMedia(mediaKind, ctx)) {
        try {
          await res.body?.cancel();
        } catch {}
        return fail(`error: ${url} is ${mediaKind} (${ctype}) and the current model (${ctx.providerCfg?.model ?? "unknown"}) does not accept ${mediaKind} input`);
      }
      if (Number.isFinite(lenHeader) && lenHeader > MAX_READ_BYTES) {
        try {
          await res.body?.cancel();
        } catch {}
        return fail(`error: ${url} is ${(lenHeader / 1e6).toFixed(1)}MB — too large to attach (cap ${MAX_READ_BYTES / 1e6}MB)`);
      }
      const signal = AbortSignal.any([AbortSignal.timeout(20_000), ...(ctx.signal ? [ctx.signal] : [])]);
      const { bytes } = await readCapped(res.body, Math.min(MAX_READ_BYTES + 1, MAX_MEDIA_BUFFER), signal);
      const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (buf.length > MAX_READ_BYTES) return fail(`error: ${url} is ${(buf.length / 1e6).toFixed(1)}MB — too large to attach (cap ${MAX_READ_BYTES / 1e6}MB)`);
      return {
        ok: true,
        output: `${url}: ${ctype}, ${(buf.length / 1024).toFixed(1)} KB — attached as ${mediaKind} content below`,
        media: [{ mimeType: ctype, data: buf.toString("base64"), filename: url.pathname.split("/").pop() || undefined }],
      };
    }
    if (Number.isFinite(lenHeader) && lenHeader > MAX_TEXT_BUFFER) {
      // Still fetch a bounded head rather than refusing outright: the model gets
      // the start of the page with a truncation note.
    }
    const signal = AbortSignal.any([AbortSignal.timeout(20_000), ...(ctx.signal ? [ctx.signal] : [])]);
    const { bytes } = await readCapped(res.body, MAX_TEXT_BUFFER, signal);
    let body = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("utf8");
    if (ctype.includes("html")) body = htmlToText(body);
    return ok(body.length > CAP ? `${body.slice(0, CAP)}\n… (truncated)` : body || "(empty response)");
  } catch (e) {
    return fail(`error: fetch failed: ${(e as Error).message}`);
  }
}

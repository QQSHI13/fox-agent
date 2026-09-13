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
  if (!/^https?:$/.test(url.protocol)) return fail("error: only http(s) URLs are supported");

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(ctx.signal ? [ctx.signal] : [])]),
      headers: { "user-agent": `fox-agent/${VERSION} (+https://github.com/QQSHI13/fox-agent)` },
    });
    if (!res.ok) return fail(`error: HTTP ${res.status} ${res.statusText} for ${url}`);
    const ctype = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    // Binary media: attach for a capable model rather than dumping bytes as text
    const mediaKind = /^(image|audio|video)$/.exec(ctype.split("/")[0] ?? "")?.[0] as "image" | "audio" | "video" | undefined;
    if (mediaKind) {
      if (!modelAcceptsMedia(mediaKind, ctx)) {
        return fail(`error: ${url} is ${mediaKind} (${ctype}) and the current model (${ctx.providerCfg?.model ?? "unknown"}) does not accept ${mediaKind} input`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_READ_BYTES) return fail(`error: ${url} is ${(buf.length / 1e6).toFixed(1)}MB — too large to attach (cap ${MAX_READ_BYTES / 1e6}MB)`);
      return {
        ok: true,
        output: `${url}: ${ctype}, ${(buf.length / 1024).toFixed(1)} KB — attached as ${mediaKind} content below`,
        media: [{ mimeType: ctype, data: buf.toString("base64"), filename: url.pathname.split("/").pop() || undefined }],
      };
    }
    let body = await res.text();
    if (body.length > CAP * 2) body = body.slice(0, CAP * 4);
    if (ctype.includes("html")) body = htmlToText(body);
    return ok(body.length > CAP ? `${body.slice(0, CAP)}\n… (truncated)` : body || "(empty response)");
  } catch (e) {
    return fail(`error: fetch failed: ${(e as Error).message}`);
  }
}

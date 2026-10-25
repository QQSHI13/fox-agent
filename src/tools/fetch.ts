import type { ToolDef } from "../providers/types.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import { fail, ok } from "./types.ts";
import { MAX_READ_BYTES, modelAcceptsMedia } from "./files.ts";
import { VERSION } from "../core/version.ts";
import { lookup } from "node:dns/promises";

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

/** A dotted quad, as four numbers. */
function parseIpv4(h: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return null;
  const parts = m.slice(1, 5).map(Number);
  return parts.every((n) => n <= 255) ? (parts as [number, number, number, number]) : null;
}

/** Loopback / RFC1918 / link-local-metadata / "this network". */
function privateIpv4(a: number, b: number, _c: number, _d: number): boolean {
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/**
 * An IPv6 literal (brackets already stripped) as its 8 groups of 16 bits.
 *
 * A trailing dotted quad is rewritten to the two hextets it encodes first, so
 * `::ffff:127.0.0.1` parses on the same path as `::ffff:7f00:1`. Null for
 * anything that is not a well-formed address — an IPv6 literal we cannot read
 * is not one to connect to.
 */
function ipv6Groups(host: string): number[] | null {
  let h = host;
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const p = v4.slice(1, 5).map(Number);
    if (p.some((n) => n > 255)) return null;
    h = h.slice(0, v4.index) + `${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const halves = h.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...new Array(fill).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  const out = groups.map((g) => parseInt(g, 16));
  return out.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? out : null;
}

/**
 * The IPv6 ranges that reach back inside the machine or the private network.
 *
 * The whole point of expanding to 8 groups is that `fe80:`/`fec0:` prefix tests
 * written against the *text* miss most spellings (`fe80::1`, `fe80:0:0:0:0:0:0:1`,
 * the bracketed form WHATWG URL hands us), and that `::ffff:a00:1` — how the URL
 * parser rewrites `::ffff:10.0.0.1` — carries an RFC1918 address in hex where the
 * IPv4 rules only ever read dotted quads.
 */
function privateIpv6(h: string): boolean {
  const g = ipv6Groups(h);
  if (!g) return true;
  const [g0, g1, _g2, _g3, _g4, g5, g6, g7] = g;
  // `::` (unspecified) and `::1` (loopback)
  if (g.slice(0, 7).every((x) => x === 0) && (g7 === 0 || g7 === 1)) return true;
  // IPv4-mapped ::ffff:0:0/96 and the NAT64 well-known prefix 64:ff9b::/96 both
  // carry a real IPv4 address in their last 32 bits — judge it by the IPv4 rules
  if ((g.slice(0, 5).every((x) => x === 0) && g5 === 0xffff) || (g0 === 0x64 && g1 === 0xff9b && g.slice(2, 6).every((x) => x === 0))) {
    return privateIpv4(g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff);
  }
  if ((g0 & 0xffc0) === 0xfe80) return true; // link-local /10
  if ((g0 & 0xffc0) === 0xfec0) return true; // site-local /10 (deprecated)
  if ((g0 & 0xfe00) === 0xfc00) return true; // unique-local /7
  return false;
}

function privateHostname(host: string): boolean {
  let h = host.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  // `URL.hostname` keeps IPv6 literals BRACKETED ("[::1]"), so every prefix test
  // below would miss them — strip the brackets before reading the address.
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  if (h.includes(":")) return privateIpv6(h);
  const v4 = parseIpv4(h);
  if (v4) return privateIpv4(v4[0], v4[1], v4[2], v4[3]);
  // NOTE: the URL parser canonicalizes the decimal/octal/short IPv4 spellings
  // (`http://2130706433`, `http://127.1`) into dotted quads for us, so a host
  // that reaches this point as text is genuinely not an IP literal.
  return false;
}

/** SSRF gate: only http(s), no loopback/private/metadata unless explicitly allowed. Exported for the offline gate tests in test/security.test.ts. */
export function checkUrl(u: URL): string | null {
  if (!/^https?:$/.test(u.protocol)) return "error: only http(s) URLs are supported";
  if (privateHostname(u.hostname) && process.env.FOX_AGENT_ALLOW_PRIVATE_FETCH !== "1") {
    return `error: refusing private/local URL ${u.hostname} (set FOX_AGENT_ALLOW_PRIVATE_FETCH=1 to allow)`;
  }
  return null;
}

/** One DNS answer for a hostname. Injected in tests so the gate stays offline. */
export type ResolveHost = (hostname: string) => Promise<{ address: string; family: number }[]>;

const resolveHost: ResolveHost = (hostname) => lookup(hostname, { all: true });

/**
 * The half of the SSRF gate a literal check cannot see: where the NAME points.
 *
 * `checkUrl` reads `URL.hostname`, which is authoritative only for IP literals.
 * A perfectly public name — `internal.example.com`, or any attacker-controlled
 * record — can resolve to 127.0.0.1, 10.0.0.0/8 or 169.254.169.254, and fetch
 * would connect to exactly that. So every hop is resolved and every returned
 * address is judged by the same rules the literals get.
 *
 * Deliberately best-effort, not a proof: there is a window between this lookup
 * and fetch's own resolution (classic DNS rebinding), and pinning the address
 * would require replacing fetch's connector and its TLS verification. The gate
 * exists to stop ordinary "public URL, private target" requests — the kind a
 * prompt-injected agent is steered toward — not a determined attacker who
 * controls the resolver.
 *
 * A resolution failure is NOT a refusal: `fetch` will fail on its own and its
 * error is the useful one.
 */
export async function checkResolved(
  u: URL,
  resolve: ResolveHost = resolveHost,
): Promise<string | null> {
  if (process.env.FOX_AGENT_ALLOW_PRIVATE_FETCH === "1") return null;
  const host = u.hostname.toLowerCase();
  // IP literals were already judged by checkUrl; there is nothing to resolve.
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (bare.includes(":") || parseIpv4(bare.replace(/\.$/, ""))) return null;
  let answers: { address: string; family: number }[];
  try {
    answers = await resolve(bare);
  } catch {
    return null;
  }
  const bad = answers.find((a) => privateHostname(a.address));
  if (!bad) return null;
  return `error: refusing ${bare} — it resolves to the private/local address ${bad.address} (set FOX_AGENT_ALLOW_PRIVATE_FETCH=1 to allow)`;
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
    const blocked = checkUrl(url) ?? (await checkResolved(url));
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
        // every hop is re-validated, including where its NAME resolves
        const blocked = checkUrl(next) ?? (await checkResolved(next));
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
    // readCapped bounds the body either way; the Content-Length header is
    // advisory (chunked/gzip responses have none), so no pre-flight refusal.
    const signal = AbortSignal.any([AbortSignal.timeout(20_000), ...(ctx.signal ? [ctx.signal] : [])]);
    const { bytes } = await readCapped(res.body, MAX_TEXT_BUFFER, signal);
    let body = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("utf8");
    if (ctype.includes("html")) body = htmlToText(body);
    return ok(body.length > CAP ? `${body.slice(0, CAP)}\n… (truncated)` : body || "(empty response)");
  } catch (e) {
    return fail(`error: fetch failed: ${(e as Error).message}`);
  }
}

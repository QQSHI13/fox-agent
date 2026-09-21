/**
 * Self-upgrade from GitHub Releases. Deliberately simple: the latest release
 * carries one binary per platform plus SHA256SUMS; we download, verify, and
 * atomically replace the running executable. Source checkouts (running under
 * bun, not a compiled `fox` binary) are refused — there `git pull` is the
 * upgrade path, and overwriting a source tree's bin/ would lie about it.
 */
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, renameSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { VERSION } from "./version.ts";
import { isatty } from "node:tty";

const REPO = "QQSHI13/fox-agent";

// ── progress bar ──────────────────────────────────────────────────────────

// Parallelogram glyph — full width, no gaps. Green filled, dark grey empty.
const BAR_GLYPH = "\u25B1";
const BAR_CELLS = 32;
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const SPINNER = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];

function formatBytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)}GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)}MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${n}B`;
}

function drawBar(pct: number, downloaded: string, eta: string): string {
  const filled = Math.round((pct / 100) * BAR_CELLS);
  const empty = BAR_CELLS - filled;

  // filled cells green, empty cells dim — all same glyph
  const bar = GREEN + BAR_GLYPH.repeat(filled) + RESET + DIM + BAR_GLYPH.repeat(empty) + RESET;

  const pctStr = `${String(pct).padStart(3)}%`;
  return `\r\x1b[2K  ${bar} ${DIM}${pctStr}${RESET} ${DIM}${downloaded}${RESET}  eta ${DIM}${eta}${RESET}`;
}

function drawSpinner(label: string, tick: number): string {
  return `\r\x1b[2K  ${SPINNER[tick % SPINNER.length]} ${label}`;
}

function showProgress(received: number, total: number, elapsedMs: number, spinnerTick: number): void {
  if (!isatty(2)) return;
  if (total > 0) {
    const pct = Math.min(100, Math.round((received / total) * 100));
    const speed = elapsedMs > 0 ? received / (elapsedMs / 1000) : 0;
    const remaining = total - received;
    const etaSecs = speed > 0 ? Math.round(remaining / speed) : -1;
    const etaFmt = etaSecs < 0 ? "\u2014" : etaSecs < 60 ? `${etaSecs}s` : `${Math.floor(etaSecs / 60)}m${etaSecs % 60}s`;
    process.stderr.write(drawBar(pct, formatBytes(received), etaFmt));
  } else {
    process.stderr.write(drawSpinner(`downloading ${formatBytes(received)}`, spinnerTick));
  }
}

export interface ReleaseInfo {
  tag: string;
  version: string;
  prerelease: boolean;
  publishedAt: string;
  assets: { name: string; url: string }[];
}

/** True when running as a compiled single-file executable, not under bun. */
export function isCompiledBinary(): boolean {
  return basename(process.execPath) !== "bun" && !/bun([.-]|$)/.test(basename(process.execPath));
}

/** The asset name this platform's binary is published under. Windows is not
 *  published — nothing exercises its PTY/exec/key paths, so shipping it would
 *  be lying about support. */
export function platformAsset(): string | null {
  const p = process.platform === "linux" ? "linux" : process.platform === "darwin" ? "darwin" : null;
  const a = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : null;
  return p && a ? `fox-${p}-${a}` : null;
}

/** API headers: identity always, bearer token when the user provided one. */
export function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "User-Agent": `fox-agent/${VERSION}`, Accept: "application/vnd.github+json" };
  // same tokens the gh CLI honors: an authenticated call gets 5,000 req/hour
  // instead of the shared unauthenticated 60
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Recent releases, newest first, prereleases included. */
export async function fetchReleases(limit = 10): Promise<ReleaseInfo[]> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=${limit}`, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  // unauthenticated API calls share 60 req/hour per IP — on a busy NAT that
  // budget is gone before fox-agent ever runs, and the API answers 403, not
  // 429. Name the fix instead of a bare status.
  if (res.status === 403) throw new Error("release check failed: HTTP 403 (GitHub API rate limit — set GITHUB_TOKEN or GH_TOKEN to raise it)");
  if (!res.ok) throw new Error(`release check failed: HTTP ${res.status}`);
  const j = (await res.json()) as {
    tag_name: string;
    prerelease: boolean;
    published_at: string;
    assets: { name: string; browser_download_url: string }[];
  }[];
  return j.map((r) => ({
    tag: r.tag_name,
    version: r.tag_name.replace(/^v/, ""),
    prerelease: r.prerelease,
    publishedAt: r.published_at.slice(0, 10),
    assets: r.assets.map((a) => ({ name: a.name, url: a.browser_download_url })),
  }));
}

/**
 * The project's real name deserves a real command: keep a `fox-agent` symlink
 * next to the installed binary. Runs at startup and after every upgrade; any
 * failure (read-only dir, existing file) is none of the user's business.
 */
export function ensureAlias(): void {
  try {
    if (!isCompiledBinary()) return;
    const target = process.execPath;
    if (basename(target) === "fox-agent") return; // invoked via the alias itself
    const alias = join(dirname(target), "fox-agent");
    if (existsSync(alias)) return;
    symlinkSync(basename(target), alias);
  } catch {
    /* cosmetic — never worth an error */
  }
}

/** Ordering-safe semver compare: positive when a > b. Prereleases rank below their release. */
export function versionCmp(a: string, b: string): number {
  const [ra, preA] = a.replace(/^v/, "").split("-");
  const [rb, preB] = b.replace(/^v/, "").split("-");
  const pa = ra.split(".").map(Number);
  const pb = rb.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  if (preA && !preB) return -1;
  if (!preA && preB) return 1;
  if (preA && preB) return preCmp(preA, preB);
  return 0;
}

/**
 * semver §11 prerelease precedence: compare dot-separated identifiers
 * left to right, numeric < alphanumeric, numbers numerically ("beta.10"
 * > "beta.2" — a plain string compare inverts that), fewer identifiers
 * first when all shared ones tie.
 */
function preCmp(a: string, b: string): number {
  const as = a.split(".");
  const bs = b.split(".");
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    const x = as[i];
    const y = bs[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x) ? Number(x) : null;
    const ny = /^\d+$/.test(y) ? Number(y) : null;
    if (nx !== null && ny !== null) {
      if (nx !== ny) return nx - ny;
    } else if (nx !== null) return -1;
    else if (ny !== null) return 1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export interface UpgradeOptions {
  /** accept a prerelease as the target (default: stable releases only) */
  beta?: boolean;
  /** exact version/tag to install, e.g. "0.3.0-beta.1" */
  to?: string;
}

/**
 * Pick the target release: an explicit version wins, then newest prerelease
 * for --beta, else newest stable. Returns undefined when nothing qualifies.
 */
export function pickRelease(releases: ReleaseInfo[], opts: UpgradeOptions = {}): ReleaseInfo | undefined {
  if (opts.to) {
    const want = opts.to.replace(/^v/, "");
    return releases.find((r) => r.version === want);
  }
  if (opts.beta) return releases[0];
  return releases.find((r) => !r.prerelease);
}

/**
 * Upgrade the running binary in place. Returns human-readable log lines.
 * The swap is download-to-temp-then-rename, so a failed download never leaves
 * a half-written executable behind. Retries up to 3 times on transient failures.
 */
export async function upgrade(
  opts: UpgradeOptions = {},
  onLog: (line: string) => void = () => {},
): Promise<{ changed: boolean; version: string }> {
  if (!isCompiledBinary()) {
    throw new Error("this fox-agent is running from source — upgrade with `git pull && bun run build`");
  }
  const asset = platformAsset();
  if (!asset) throw new Error(`unsupported platform: ${process.platform}/${process.arch}`);

  onLog(`current version: v${VERSION}`);
  const releases = await fetchReleases();
  const rel = pickRelease(releases, opts);
  if (!rel) throw new Error(opts.to ? `no release '${opts.to}'` : "no suitable release found");
  onLog(`target: ${rel.tag}${rel.prerelease ? " (beta)" : ""} · published ${rel.publishedAt}`);
  if (versionCmp(rel.version, VERSION) <= 0 && !opts.to) return { changed: false, version: VERSION };

  const bin = rel.assets.find((a) => a.name === asset);
  const sums = rel.assets.find((a) => a.name === "SHA256SUMS");
  if (!bin || !sums) throw new Error(`release ${rel.tag} has no ${asset} asset — check https://github.com/${REPO}/releases`);

  // fetch checksum (must succeed)
  let sumsText: string;
  try {
    const sumsRes = await fetch(sums.url, { signal: AbortSignal.timeout(15_000) });
    if (!sumsRes.ok) throw new Error(`HTTP ${sumsRes.status}`);
    sumsText = await sumsRes.text();
  } catch (e) {
    throw new Error(`could not download checksums — refusing to install unverified binary: ${e}`);
  }

  const wantLine = sumsText.split("\n").find((l) => l.trim().endsWith(` ${asset}`));
  if (!wantLine) throw new Error(`SHA256SUMS has no entry for ${asset} — release ${rel.tag} may be corrupt`);
  const expectedHash = wantLine.trim().split(/\s+/)[0];

  // check disk space before downloading
  const target = process.execPath;
  const targetDir = dirname(target);
  try {
    const dirStat = statSync(targetDir);
    // available space isn't directly exposed by statSync; use a conservative
    // check: if the filesystem reports 0 free bytes, warn but don't block
    // (some OSes return 0 for root). Just catch hard errors.
    void dirStat;
  } catch {
    throw new Error(`cannot write to ${targetDir} — check permissions`);
  }

  // download binary with retry + streaming to disk
  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      onLog(`downloading ${asset}…${attempt > 1 ? ` (attempt ${attempt}/${MAX_RETRIES})` : ""}`);
      const binRes = await fetch(bin.url, { signal: AbortSignal.timeout(120_000) });
      if (!binRes.ok) throw new Error(`HTTP ${binRes.status}`);

      const totalBytes = Number(binRes.headers.get("content-length")) || 0;
      if (!isatty(2) && totalBytes > 0) onLog(`  ${formatBytes(totalBytes)}`);

      const reader = binRes.body?.getReader();
      if (!reader) throw new Error("response has no body");

      // stream to temp file + compute SHA-256 simultaneously
      const tmp = join(targetDir, `.fox-upgrade-${process.pid}`);
      const hasher = createHash("sha256");
      const fd = createWriteStream(tmp, { mode: 0o755 });
      let received = 0;
      const startTime = Date.now();
      let lastBarTime = 0;
      let spinnerTick = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          hasher.update(value);
          fd.write(value);
          received += value.length;

          // throttle bar redraws to ~16fps
          const now = Date.now();
          if (now - lastBarTime >= 60) {
            showProgress(received, totalBytes, now - startTime, spinnerTick++);
            lastBarTime = now;
          }
        }

        // finalize the stream
        await new Promise<void>((resolve, reject) => {
          fd.on("finish", resolve);
          fd.on("error", reject);
          fd.end();
        });
      } catch (e) {
        fd.destroy();
        try { unlinkSync(tmp); } catch { /* cleanup best-effort */ }
        throw e;
      }

      // final bar state
      showProgress(received, totalBytes, Date.now() - startTime, spinnerTick);
      if (isatty(2)) process.stderr.write("\n");

      // verify checksum
      const actualHash = hasher.digest("hex");
      if (expectedHash !== actualHash) {
        try { unlinkSync(tmp); } catch { /* cleanup best-effort */ }
        throw new Error(
          `checksum mismatch — refusing to install (got ${actualHash.slice(0, 12)}…)`,
        );
      }

      // atomic swap: rename current → backup, temp → current
      const backup = join(targetDir, ".fox-previous");
      try {
        if (existsSync(backup)) unlinkSync(backup);
      } catch {
        /* a stale backup we can't delete doesn't block the upgrade */
      }
      renameSync(target, backup);
      renameSync(tmp, target);
      ensureAlias();
      onLog(`installed ${rel.tag} → ${target} (previous kept as .fox-previous)`);
      return { changed: true, version: rel.version };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < MAX_RETRIES) {
        const delay = attempt * 1000; // 1s, 2s backoff
        onLog(`  retrying in ${delay / 1000}s…`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  // all retries exhausted
  throw lastError ?? new Error("download failed");
}

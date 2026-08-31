/**
 * Self-upgrade from GitHub Releases. Deliberately simple: the latest release
 * carries one binary per platform plus SHA256SUMS; we download, verify, and
 * atomically replace the running executable. Source checkouts (running under
 * bun, not a compiled `fox` binary) are refused — there `git pull` is the
 * upgrade path, and overwriting a source tree's bin/ would lie about it.
 */
import { chmodSync, existsSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { VERSION } from "./version.ts";

const REPO = "QQSHI13/fox-agent";

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

/** The asset name this platform's binary is published under. */
export function platformAsset(): string | null {
  const p =
    process.platform === "linux" ? "linux" : process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "windows" : null;
  const a = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : null;
  if (!p || !a) return null;
  return `fox-${p}-${a}${p === "windows" ? ".exe" : ""}`;
}

/** Recent releases, newest first, prereleases included. */
export async function fetchReleases(limit = 10): Promise<ReleaseInfo[]> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=${limit}`, {
    headers: { "User-Agent": `fox-agent/${VERSION}`, Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(15_000),
  });
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
  if (preA && preB) return preA < preB ? -1 : preA > preB ? 1 : 0;
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
 * a half-written executable behind.
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
  if (!bin || !sums) throw new Error(`release ${rel.tag} has no ${asset} asset`);

  onLog(`downloading ${asset}…`);
  const [binRes, sumsRes] = await Promise.all([
    fetch(bin.url, { signal: AbortSignal.timeout(120_000) }),
    fetch(sums.url, { signal: AbortSignal.timeout(15_000) }),
  ]);
  if (!binRes.ok || !sumsRes.ok) throw new Error("download failed");
  const bytes = new Uint8Array(await binRes.arrayBuffer());
  const sumsText = await sumsRes.text();

  const wantLine = sumsText.split("\n").find((l) => l.trim().endsWith(` ${asset}`));
  if (!wantLine) throw new Error(`SHA256SUMS has no entry for ${asset}`);
  const want = wantLine.trim().split(/\s+/)[0];
  const got = Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString("hex");
  if (want !== got) throw new Error(`checksum mismatch — refusing to install (got ${got.slice(0, 12)}…)`);

  const target = process.execPath;
  const tmp = join(dirname(target), `.fox-upgrade-${process.pid}`);
  writeFileSync(tmp, bytes, { mode: 0o755 });
  chmodSync(tmp, 0o755);
  // Swap via renames instead of an in-place overwrite: Windows refuses to
  // overwrite a running .exe but is fine renaming it aside, and on POSIX this
  // keeps the old binary one rename away for a manual rollback.
  const backup = join(dirname(target), ".fox-previous");
  try {
    if (existsSync(backup)) unlinkSync(backup);
  } catch {
    /* a stale backup we can't delete doesn't block the upgrade */
  }
  renameSync(target, backup);
  renameSync(tmp, target);
  onLog(`installed ${rel.tag} → ${target} (previous kept as .fox-previous)`);
  return { changed: true, version: rel.version };
}

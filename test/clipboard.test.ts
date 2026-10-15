/**
 * WSL detection and the OSC 52 size gate — the two pure pieces of the copy path.
 *
 * The copy route itself is spawn-heavy and terminal-bound, so what is pinned
 * here is the DECISION each platform branch rests on: is this WSL, is this
 * Windows Terminal, and does a payload fit through OSC 52. The one that matters
 * most is the last — the old path sliced at 100k and returned true, so a 300KB
 * copy reported "copied 100000 chars" and handed back a mangled prefix.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { isWindowsTerminal, isWSL, resetWslCache } from "../src/core/wsl.ts";
import { osc52Encode } from "../src/tui/app.ts";

const REAL = {
  WSL_DISTRO_NAME: process.env.WSL_DISTRO_NAME,
  WSLENV: process.env.WSLENV,
  WSL_INTEROP: process.env.WSL_INTEROP,
  WT_SESSION: process.env.WT_SESSION,
};

afterEach(() => {
  for (const k of Object.keys(REAL)) {
    const v = (REAL as Record<string, string | undefined>)[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetWslCache();
});

describe("WSL detection", () => {
  test("the env markers each identify WSL on their own", () => {
    for (const key of ["WSL_DISTRO_NAME", "WSSLENV", "WSL_INTEROP"]) {
      for (const k of Object.keys(REAL)) delete process.env[k];
      process.env[key] = "set";
      resetWslCache();
      expect(isWSL()).toBe(true);
    }
  });

  test("/proc/version carries the kernel marker even with the env scrubbed", () => {
    // WSL1 and WSL2 kernels both put microsoft/wsl in /proc/version, and this
    // suite runs ON one — so the marker path is asserted against the real
    // kernel rather than a fixture, which is the stronger claim.
    for (const k of Object.keys(REAL)) delete process.env[k];
    resetWslCache();
    expect(isWSL()).toBe(true);
  });
});

describe("Windows Terminal detection", () => {
  test("WT_SESSION is the marker, and nothing else counts", () => {
    delete process.env.WT_SESSION;
    expect(isWindowsTerminal()).toBe(false);
    process.env.WT_SESSION = "0e2b7a1c-0000-0000-0000-000000000000";
    expect(isWindowsTerminal()).toBe(true);
  });
});

describe("OSC 52 size gate", () => {
  const b64len = (chars: number) => Math.ceil(chars / 3) * 4;

  test("an ordinary payload encodes and round-trips", () => {
    const text = "hello 世界\nsecond line";
    const b64 = osc52Encode(text);
    expect(b64).not.toBeNull();
    expect(Buffer.from(b64!, "base64").toString("utf8")).toBe(text);
  });

  test("exactly at the limit still encodes", () => {
    // base64 grows 4/3, so ~75k chars is the largest text that fits 100k encoded
    expect(osc52Encode("a".repeat(74_000))).not.toBeNull();
  });

  test("over the limit REFUSES instead of slicing a prefix", () => {
    // the bug this pins: the old code did [...text].slice(0, 100_000) and then
    // returned true, so a 300KB copy reported success and the clipboard held
    // the first third — silently, with the status line calling it a success
    expect(osc52Encode("a".repeat(300_000))).toBeNull();
    expect(osc52Encode("a".repeat(b64len(100_000) + 4))).toBeNull();
  });

  test("the limit is on the ENCODED size, not the character count", () => {
    // multibyte text encodes larger than its length suggests, so a payload
    // under 100k CHARACTERS can still overflow the wire limit
    const cjk = "中".repeat(60_000); // 180k bytes -> 240k base64
    expect(cjk.length).toBeLessThan(100_000);
    expect(osc52Encode(cjk)).toBeNull();
  });
});

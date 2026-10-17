/**
 * Clipboard: the platform-shaped copy/paste ladder.
 *
 * Extracted from app.ts — the one copy path for transcript and input alike.
 * The route is platform-shaped rather than one list for every machine, and the
 * ordering is not a preference: each rule exists because the wrong order
 * measurably cost something on a real stack (WSL interop at 2.3–3.8s per copy
 * against a 1.5s kill, a codepage-mangled non-ASCII payload, an OSC 52 write
 * that reports success and copied nothing). The reasoning lives with the code.
 *
 * OSC 52 goes FIRST only where it can be trusted (Windows Terminal under WSL);
 * everywhere else a verifiable helper process wins, because a terminal that
 * ignores OSC 52 does so silently.
 */
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Term } from "./term.ts";
import { isWindowsTerminal, isWSL } from "../core/wsl.ts";

/**
 * OSC 52 read first: a supporting terminal (kitty, WezTerm, …) answers with
 * the clipboard in one in-band round trip — no helper process, and it works
 * over SSH. Terminals decline by staying silent (or by requiring the user to
 * approve the read), so this is bounded by a timeout and the helper probes
 * below remain the fallback. Term writes go through term.write, but the reply
 * arrives on stdin — the caller guarantees this runs while the input reader is
 * active; the response is matched by its unique terminator.
 */
export async function clipRead(term: Term): Promise<string> {
  const osc = await new Promise<string>((resolve) => {
    let buf = "";
    let done = false;
    const finish = (v: string) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    const onData = (chunk: Uint8Array) => {
      buf += new TextDecoder().decode(chunk);
      // reply is ESC ] 52 ; c ; <b64> ST/BEL — accept both terminators
      const m = /\x1b\]52;c;([A-Za-z0-9+/=]*)?(\x07|\x1b\\)/.exec(buf);
      if (m) {
        off();
        try {
          finish(m[1] ? Buffer.from(m[1], "base64").toString("utf8") : "");
        } catch {
          finish("");
        }
      }
    };
    const off = term.onDataRaw(onData);
    term.write("\x1b]52;c;?\x07");
    term.flush();
    setTimeout(() => {
      off();
      finish("");
    }, 300);
  });
  if (osc) return osc.replace(/\r/g, "");

  const cmds = [
    // Windows from WSL: force UTF-8 on the pipe. Without it powershell writes
    // in the console OEM codepage (GBK on a zh-CN machine), and decoding those
    // bytes as UTF-8 mangles every non-ASCII character on the way into fox-agent.
    ["powershell.exe", "-NoProfile", "-Command", "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw"],
    ["wl-paste", "--no-newline"],
    ["xclip", "-selection", "clipboard", "-o"],
    // macOS read side. The WRITE list had pbcopy but the READ list did not, so
    // ctrl+V was a silent no-op on a Mac: Terminal.app does not answer an OSC 52
    // read, iTerm2 gates them behind an explicit permission, and with no pbpaste
    // in the list every fallback failed and clipRead returned "".
    ["pbpaste"],
  ];
  for (const argv of cmds) {
    try {
      const p = Bun.spawn(argv, { stdin: "ignore", stdout: "pipe", stderr: "ignore" });
      const timer = setTimeout(() => {
        try {
          p.kill();
        } catch {}
      }, 1500);
      const out = await new Response(p.stdout).text();
      clearTimeout(timer);
      if ((await p.exited) === 0 && out) return out.replace(/\r/g, "");
    } catch {}
  }
  return "";
}

/**
 * Size ceiling for OSC 52, measured on the ENCODED payload — what actually
 * travels the wire. 100k base64 chars is ~75KB of text, comfortably inside what
 * Windows Terminal, kitty and WezTerm accept.
 */
const MAX_OSC52_LENGTH = 100_000;

/**
 * OSC 52 base64 of `text`, or null when it exceeds the size terminals accept.
 *
 * The limit is on the ENCODED length — that is what travels the wire and what
 * a terminal's buffer is sized against. Silently slicing instead (the old
 * behavior) copied a prefix and reported success, which is the one outcome
 * worse than an outright failure: the user pastes a mangled file with no idea.
 */
export function osc52Encode(text: string): string | null {
  const b64 = Buffer.from(text, "utf8").toString("base64");
  return b64.length > MAX_OSC52_LENGTH ? null : b64;
}

/** OSC 52 copy, in-band: no helper process, works over SSH. */
function emitOsc52(text: string, term: Term): boolean {
  const b64 = osc52Encode(text);
  if (b64 === null) return false;
  try {
    term.write(`\x1b]52;c;${b64}\x07`);
    term.flush();
    return true;
  } catch {
    return false;
  }
}

/**
 * Run one clipboard helper, feeding `input` on stdin.
 *
 * `timeoutMs` is PER HELPER, not a shared budget. The old code armed one 1500ms
 * timer and reached for PowerShell first; under WSL interop that round trip
 * measured 2.3–3.8s, so the first helper was killed on every copy and the cost
 * was paid again on each fallback. Interop gets its own, larger budget; the
 * native X/Wayland writers start in milliseconds and do not.
 *
 * `write()` then `end()` is deliberate, not an oversight: Bun's FileSink `end()`
 * takes no payload (unlike node's), so the bytes must go through `write()` and
 * `end()` is what flushes and closes.
 */
async function runClipHelper(argv: string[], input: string, timeoutMs: number): Promise<boolean> {
  try {
    const p = Bun.spawn(argv, { stdin: "pipe", stdout: "ignore", stderr: "ignore" });
    const timer = setTimeout(() => {
      try {
        p.kill();
      } catch {}
    }, timeoutMs);
    try {
      p.stdin.write(input);
      await p.stdin.end();
      const code = await p.exited;
      return code === 0;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

/**
 * Copy via the Windows clipboard under WSL.
 *
 * The text goes through a TEMP FILE, not stdin: both `clip.exe` and PowerShell
 * decode piped bytes in the console code page (GBK on a zh-CN machine), which
 * mangled every non-ASCII character — "•" arrived as mojibake (measured). A file
 * read with an explicit `[System.Text.Encoding]::UTF8` has no codepage in the
 * path at all, and costs one file write instead of streaming every byte across
 * the interop boundary.
 *
 * `wslpath -w` translates the Linux path; PowerShell then reads it by Windows
 * path, so neither side has to know the other's filesystem.
 */
async function copyViaWindowsInterop(text: string): Promise<boolean> {
  const tmp = join(tmpdir(), `fox-clip-${randomUUID()}.txt`);
  try {
    writeFileSync(tmp, text, { encoding: "utf8", mode: 0o600 });
    const conv = Bun.spawn(["wslpath", "-w", tmp], { stdout: "pipe", stderr: "ignore" });
    const cTimer = setTimeout(() => {
      try {
        conv.kill();
      } catch {}
    }, 1000);
    let winPath: string;
    try {
      winPath = (await new Response(conv.stdout).text()).trim();
    } finally {
      clearTimeout(cTimer);
      await conv.exited;
    }
    if (!winPath) return false;
    // single-quoted and escaped, so a tmpdir containing an apostrophe cannot
    // break out of the PowerShell string literal
    const script = `Set-Clipboard -Value ([System.IO.File]::ReadAllText('${winPath.replaceAll("'", "''")}', [System.Text.Encoding]::UTF8))`;
    return await runClipHelper(["powershell.exe", "-NoProfile", "-Command", script], "", 5000);
  } catch {
    return false;
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* never created */
    }
  }
}

/**
 * Copy to the system clipboard, reporting whether anything actually took it.
 *
 * The route is platform-shaped rather than one list for every machine. The
 * ordering below is not a preference — each rule exists because the wrong order
 * measurably cost something on a real stack:
 *
 *  - WSL + Windows Terminal: OSC 52 FIRST. Windows Terminal answers it natively,
 *    writing the Windows clipboard with no process and no interop round trip.
 *    PowerShell is the fallback for when it does not (a terminal that ignores
 *    OSC 52 does so silently, with no error and no way to tell). The old code
 *    tried PowerShell first and it lost every time — measured 2.3–3.8s per copy
 *    under interop, against a 1500ms kill.
 *  - Everywhere else a helper is still tried before OSC 52, because on a
 *    desktop session OSC 52 cannot be verified: a terminal that ignores it
 *    reports success and copied nothing, which is worse than a visible failure.
 *  - Headless (no DISPLAY, no WAYLAND_DISPLAY, no Termux) or a remote session:
 *    the terminal is the ONLY route, so OSC 52 is attempted without a helper.
 */
export async function clipWrite(text: string, term: Term): Promise<boolean> {
  const env = process.env;

  // Native writers, gated on their own env markers and NOT on WSL. This box has
  // WSLg, so DISPLAY and WAYLAND_DISPLAY are both set and wl-copy/xclip work —
  // and they are verifiable (exit 0 means it landed) where OSC 52 is not. An
  // earlier version of this function gated the whole block on `!wsl` and so
  // skipped them here, paying a 2.3–3.8s interop round trip while an instant
  // writer sat unused; a direct write must precede the in-band escape precisely
  // because a terminal can otherwise race it.
  const helpers: { argv: string[] }[] = [];
  if (env.TERMUX_VERSION) helpers.push({ argv: ["termux-clipboard-set"] });
  if (env.WAYLAND_DISPLAY) helpers.push({ argv: ["wl-copy"] });
  if (env.DISPLAY) {
    helpers.push({ argv: ["xclip", "-selection", "clipboard", "-i"] }, { argv: ["xsel", "--clipboard", "--input"] });
  }
  if (process.platform === "darwin") helpers.push({ argv: ["pbcopy"] });
  for (const h of helpers) {
    if (await runClipHelper(h.argv, text, 1500)) return true;
  }

  // No native writer took it. On WSL the Windows clipboard is the real one, and
  // there are two routes: Windows Terminal answers OSC 52 in-band with no
  // interop at all, and PowerShell is the fallback for a terminal that declines
  // OSC 52 — which it does silently, with no error and no way to tell.
  let osc52Emitted = false;
  if (isWSL(env)) {
    if (isWindowsTerminal(env)) osc52Emitted = emitOsc52(text, term);
    if (osc52Emitted) return true;
    if (await copyViaWindowsInterop(text)) return true;
  }

  // Bare SSH, a container, or a machine with no display: the terminal is the
  // only route left. On a remote session it is also the RIGHT one, since the
  // clipboard that matters belongs to the client. (Over SSH with X forwarding
  // DISPLAY is set, so the xclip probe above wins and correctly writes the
  // forwarded — i.e. the client's — clipboard.)
  return emitOsc52(text, term);
}

#!/usr/bin/env python3
"""Multi-agent harness benchmark.

Measures what `--version` cannot: the cost of actually starting the thing.

Per tool (best effort — anything not installed is recorded as n/a, never
invented):
  - disk: on-disk bytes of the resolved executable (following launcher
    wrappers to the binary they exec)
  - startup: best of 4 `--version` runs (the harness floor, for reference)
  - tui_first_byte: best of 5 PTY launches with no args, time to first output
    byte — the real "time to first char" of an interactive launch
  - tui_first_input: best of 3 PTY launches typing a probe and waiting for it
    to render — time to interactive, not just time to paint

Plus fox-agent only (hermetic, no API key, no network):
  - ttft: headless `fox -p … --json` against the repo's scripted fake
    provider, spawn to first `{"type":"text"}` event
  - rss: peak resident set of that same headless turn (`/usr/bin/time -v`)

Outputs (all under bench/):
  results.json, table.md, snippet.md, bundle.svg, tui-first-char.svg,
  tui-first-input.svg, memory.svg

snippet.md is the top-of-README block: the bench workflow splices it between
<!-- bench:start --> and <!-- bench:end --> markers so the graphs and numbers
at the top of the README refresh with every run.

Usage:
  python3 scripts/bench/bench.py [--quick] [--out bench]
  bun run bench   # build + bench in one step (see package.json)
"""
import json
import os
import pty
import re
import select
import shlex
import shutil
import signal
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FOX = os.path.join(ROOT, "bin", "fox")
FAKE = os.path.join(ROOT, "test", "fixtures", "fake-provider.ts")

# (label, candidate binary names). Rows are labeled by the version the binary
# REPORTS, so a renamed/vendored install cannot silently pose as something else.
# opencode is measured separately below: v1 and v2 ship overlapping binary
# names, and the v2 installer wipes v1's `opencode` — so the bench workflow
# preserves v1 under an explicit `opencode-v1` name (see bench.yml). Labels
# come from the BINARY NAME, not the version: the v2 beta reports 0.0.0-beta-N
# (zero-ver), so major-based labeling miscategorized it as v1 and the v2 row
# silently vanished. The reported version still rides along in the row, so a
# surprise is visible, never silent. `opencode` (bare) falls back to major.
OPENCODE_BINS = (("opencode-v1", "opencode v1"), ("opencode", None), ("opencode2", "opencode v2"))
AGENTS = [
    ("fox-agent", ["bin/fox"]),
    ("claude code", ["claude"]),
    ("codex", ["codex"]),
    ("jcode", ["jcode"]),
    ("pi", ["pi", "pi-coding-agent"]),
    ("gemini cli", ["gemini"]),
    ("copilot cli", ["copilot"]),
    ("crush", ["crush"]),
    ("goose", ["goose"]),
    ("aider", ["aider"]),
    ("amp", ["amp"]),
    ("cursor-agent", ["cursor-agent"]),
    ("qwen code", ["qwen"]),
    ("codebuff", ["codebuff"]),
    ("kilo code", ["kilocode", "kilo"]),
]

VERSION_FALLBACKS = [["--version"], ["-v"], ["version"], ["--help"]]


def which(names):
    for n in names:
        if n == "bin/fox":
            if os.path.isfile(FOX) and os.access(FOX, os.X_OK):
                return FOX
            continue
        p = shutil.which(n)
        if p:
            return p
    return None


def version_of(path):
    # version may go to either stream (node CLIs split both ways)
    for args in VERSION_FALLBACKS:
        dt, out = run_quiet([path] + args, timeout=15)
        line = (out.strip().splitlines() or [""])[0].strip()[:60]
        if line:
            return line
    return "n/a"


def run_quiet(argv, timeout=30, env=None):
    try:
        t0 = time.perf_counter()
        p = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, env=env)
        dt = time.perf_counter() - t0
        out = ((p.stdout or b"") + b"\n" + (p.stderr or b"")).decode("utf-8", "replace")
        return dt, out
    except Exception:
        return None, ""


def best_startup(path, n):
    argv = [path, "--version"]
    if version_of(path) == "n/a":
        argv = [path, "--help"]
    ts = []
    for _ in range(n):
        dt, _ = run_quiet(argv, timeout=15)
        if dt is not None:
            ts.append(dt * 1000)
    return min(ts) if ts else None


def is_binary_file(path):
    try:
        with open(path, "rb") as f:
            return b"\x00" in f.read(8192)
    except OSError:
        return False


def _exec_target_of_script(path):
    """Binary a launcher script hands off to, if any.

    Versioned-install launchers (jcode: a 505-byte sh wrapper that execs
    `$self_dir/jcode-linux-x86_64.bin`) weigh nothing by themselves; the
    binary they hand off to is the honest cost, and weighing the wrapper
    reported jcode as 0.0 MB. Only path-form targets are followed (absolute,
    $var/relative, ./): a bare command (`exec node ...`) is a shared runtime,
    not this tool's cost, and keeps the package-dir behavior. Variables are
    NOT evaluated — only their position (script dir) is used.
    """
    try:
        with open(path, "r", errors="replace") as f:
            lines = [f.readline() for _ in range(40)]
    except OSError:
        return None
    if not lines or not lines[0].startswith("#!"):
        return None
    script_dir = os.path.dirname(os.path.realpath(path))
    for line in lines:
        s = line.strip()
        if not s.startswith("exec "):
            continue
        try:
            toks = shlex.split(s, posix=True)
        except ValueError:
            continue
        for tok in toks[1:]:
            if tok.startswith("-") or tok in ("$@", "$*", "$#", "$$", "$?", "$!", "$-", "$0"):
                continue
            if os.path.isabs(tok):
                cand = tok
            elif "/" in tok or "$" in tok:
                cand = re.sub(r"\$\{?[A-Za-z_][A-Za-z0-9_]*\}?", script_dir, tok)
                if not os.path.isabs(cand):
                    cand = os.path.normpath(os.path.join(script_dir, cand))
            else:
                continue  # bare command: node, env, ... — shared, not followed
            try:
                if os.path.isfile(cand) and is_binary_file(cand):
                    return cand
            except OSError:
                continue
    return None


def du_bytes(path):
    """Disk use of a file or tree in bytes. du -sb when present (it sees
    sparse files and dir overhead); a plain walk otherwise."""
    try:
        p = subprocess.run(["du", "-sb", path], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=60)
        return int(p.stdout.split()[0])
    except Exception:
        total = 0
        try:
            if os.path.isfile(path):
                return os.path.getsize(path)
            for root, _dirs, files in os.walk(path):
                for f in files:
                    try:
                        total += os.path.getsize(os.path.join(root, f))
                    except OSError:
                        pass
        except OSError:
            pass
        return total


def footprint(path):
    """Honest on-disk cost of a CLI as (mb, kind).

    A native executable is its own whole cost ("bin"). A script/shim is not —
    weighing only pi's 5MB cli.js while pretending node and 200MB of
    node_modules are free would make every script CLI look impossibly small
    next to a self-contained binary. So for scripts the cost is the enclosing
    install root: the nearest ancestor with package.json (npm), or with
    pyvenv.cfg (a venv console script — the bench venv holds aider only).
    The exception is a launcher script that execs a real binary by path
    (jcode's wrapper hands off to its sibling .bin): the binary it names is
    weighed as "bin", since that file alone is the whole cost. Bare-command
    execs (`exec node ...`) are never followed — node is shared, not the
    tool's. "entry" is the fallback when no root is found: the file alone,
    flagged.
    """
    real = os.path.realpath(path)
    try:
        if is_binary_file(real):
            return os.path.getsize(real) / 1e6, "bin"
    except OSError:
        return None, "entry"
    # a launcher script is weightless; the binary it execs is the cost
    target = _exec_target_of_script(real)
    if target:
        try:
            return os.path.getsize(target) / 1e6, "bin"
        except OSError:
            pass
    d = os.path.dirname(real)
    for _ in range(5):
        if os.path.isfile(os.path.join(d, "package.json")) or os.path.isfile(os.path.join(d, "pyvenv.cfg")):
            return du_bytes(d) / 1e6, "pkg"
        nd = os.path.dirname(d)
        if nd == d:
            break
        d = nd
    try:
        return os.path.getsize(real) / 1e6, "entry"
    except OSError:
        return None, "entry"


def tui_first_byte(path, probes=5):
    """Time to first output byte of an interactive launch under a PTY.

    No args, real terminal: this is the actual TUI launch cost, not --version
    (several of these tools short-circuit --version before loading their
    bundle). Killed the moment the first byte arrives.
    """
    samples = []
    for _ in range(probes):
        start = time.perf_counter()
        try:
            pid, fd = pty.fork()
        except OSError:
            return None
        if pid == 0:
            # execv inherits os.environ: set TERM in-process, in the child only
            os.environ["TERM"] = "xterm-256color"
            try:
                os.execv(path, [path])
            except Exception:
                os._exit(127)
        first = None
        try:
            while True:
                r, _, _ = select.select([fd], [], [], 10)
                if not r:
                    break
                try:
                    data = os.read(fd, 65536)
                except OSError:
                    break
                if not data:
                    break
                if first is None:
                    first = time.perf_counter() - start
                    break
        finally:
            try:
                os.close(fd)
            except OSError:
                pass
            try:
                os.kill(pid, signal.SIGKILL)
                os.waitpid(pid, 0)
            except (ProcessLookupError, ChildProcessError, OSError):
                pass
        if first is not None:
            samples.append(first * 1000)
    return min(samples) if samples else None


def idle_pss(path, settle=1.5):
    """PSS after launching the TUI and letting it settle (Linux only).

    Same launch as tui_first_byte, but instead of killing on first byte, wait
    out the settle window and read smaps_rollup — idle harness cost, before
    any model traffic (which would dominate everything).
    """
    try:
        pid, fd = pty.fork()
    except OSError:
        return None
    if pid == 0:
        os.environ["TERM"] = "xterm-256color"
        try:
            os.execv(path, [path])
        except Exception:
            os._exit(127)
    time.sleep(settle)
    pss = None
    try:
        with open(f"/proc/{pid}/smaps_rollup") as f:
            for line in f:
                if line.startswith("Pss:"):
                    pss = int(line.split()[1]) / 1024
                    break
    except (FileNotFoundError, ProcessLookupError, ValueError):
        pass
    try:
        os.close(fd)
    except OSError:
        pass
    try:
        os.kill(pid, signal.SIGKILL)
        os.waitpid(pid, 0)
    except (ProcessLookupError, ChildProcessError, OSError):
        pass
    return pss


PROBE_TEXT = "hello bench"

# Tools whose input readiness cannot be read off the screen: {"log": file to
# tail, "marker": regex ending the probe}. The motivating case is a sign-in
# screen that swallows echoed keystrokes while the tool logs its own
# input-ready marker internally — typing is still sent the same way; only the
# completion signal differs (internal ack rather than screen echo), which the
# method strings below say out loud.
INPUT_MARKERS = {
    # "antigravity": {"log": "~/.antigravity/input-ready.log", "marker": r"..."},
}

# Strips terminal control traffic so probe text is matched against what is
# actually RENDERED: OSC (BEL and ST terminated), CSI (incl. the `$p` form
# DECRQM-style replies use), DCS/APC (ST terminated), DEC private modes,
# cursor movement, CR. Without the DCS and `$p` arms, opencode's startup
# queries leak through as text and a stray "p" could fake a match.
ANSI_RE = re.compile(
    rb"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)"  # OSC, BEL or ST terminated
    rb"|\x1bP.*?\x1b\\"  # DCS ... ST
    rb"|\x1b_[^\x1b]*\x1b\\"  # APC ... ST
    rb"|\x1b\[[0-9;?<>=!]*[$\" ]*[a-zA-Z@`]"  # CSI, incl. $p / " p forms
    rb"|\x1b[()][0-9A-Z]"  # charset selection
    rb"|\x1b[=>78M]"  # keypad / save cursor / reverse index
    rb"|\r"
)


def _wait_output(fd, timeout):
    """First output chunk within timeout, or None (app never came alive)."""
    end = time.perf_counter() + timeout
    while time.perf_counter() < end:
        r, _, _ = select.select([fd], [], [], max(0, end - time.perf_counter()))
        if not r:
            return None
        try:
            data = os.read(fd, 65536)
        except OSError:
            return None
        if not data:
            return None
        return data
    return None


def tui_first_input(path, label, probes=3, timeout=30):
    """Time from first typed byte to the probe text appearing on screen.

    Launch under a PTY, wait until the app is alive AND quiet (typing into a
    process still starting up proves nothing), type PROBE_TEXT, then poll
    until it shows up in the newly rendered output — per-chunk, not the whole
    stream, because diffing TUIs repaint their input box forever and a
    whole-stream search would false-positive on any historical occurrence.
    Best of N; None when it never appears (a tool that drops early keystrokes
    or never echoes honestly reports n/a rather than a number). Tools are
    expected to own the terminal in raw mode, like every interactive TUI must
    to read keys at all.
    """
    cfg = INPUT_MARKERS.get(label)
    samples = []
    for _ in range(probes):
        try:
            pid, fd = pty.fork()
        except OSError:
            return None
        if pid == 0:
            os.environ["TERM"] = "xterm-256color"
            try:
                os.execv(path, [path])
            except Exception:
                os._exit(127)
        logf = None
        try:
            if _wait_output(fd, 15) is None:
                continue
            # settle twice: once briefly (an app that painted and went quiet
            # is ready), then a grace window for apps whose first frames keep
            # coming — typing into a TUI that is still painting swallows the
            # probe. The long settle is capped so a chatty spinner cannot
            # stall the probe forever; the retyping round below catches the
            # rest, so worst case is a slower number, not a wrong one.
            quiet_end = time.perf_counter() + 0.75
            init_cap = time.perf_counter() + 8
            while time.perf_counter() < min(quiet_end, init_cap):
                r, _, _ = select.select([fd], [], [], max(0, min(quiet_end, init_cap) - time.perf_counter()))
                if not r:
                    break
                try:
                    if not os.read(fd, 65536):
                        break
                except OSError:
                    break
            # did the app actually go quiet, or is it still painting? A
            # spinner re-painting every frame means keys are not being read
            # yet — wait out the paint (bounded at 6s; a tool that never goes
            # quiet gets its number from the retype round below, honestly late
            # rather than dishonestly never).
            drain_end = time.perf_counter() + 6.0
            while time.perf_counter() < drain_end:
                r, _, _ = select.select([fd], [], [], max(0, drain_end - time.perf_counter()))
                if not r:
                    break
                try:
                    if not os.read(fd, 65536):
                        break
                except OSError:
                    break
            if cfg:
                # marker path: seek past stale lines so only this probe's
                # marker can complete it, then type like everyone else
                try:
                    logf = open(os.path.expanduser(cfg["log"]), "rb")
                    logf.seek(0, os.SEEK_END)
                except OSError:
                    logf = None
            t0 = time.perf_counter()
            try:
                os.write(fd, PROBE_TEXT.encode())
            except OSError:
                continue
            deadline = t0 + timeout
            seen = b""
            hit = None
            # up to two typing rounds against one deadline: a tool still
            # starting up may swallow early keystrokes, and the honest number
            # for that is "how long until MY input appears", not n/a — but a
            # tool that never echoes still times out honestly
            for attempt in (1, 2):
                if attempt == 2:
                    quiet_end = time.perf_counter() + 1.0
                    while time.perf_counter() < min(quiet_end, deadline):
                        r, _, _ = select.select([fd], [], [], max(0, min(quiet_end, deadline) - time.perf_counter()))
                        if not r:
                            break
                        try:
                            if not os.read(fd, 65536):
                                break
                        except OSError:
                            break
                    try:
                        os.write(fd, PROBE_TEXT.encode())
                    except OSError:
                        break
                while time.perf_counter() < deadline:
                    if logf is not None:
                        try:
                            chunk = logf.read()
                        except OSError:
                            break
                        if chunk:
                            seen += chunk
                            if re.search(cfg["marker"], seen.decode("utf-8", "replace")):
                                hit = time.perf_counter() - t0
                                break
                        time.sleep(0.2)
                        continue
                    r, _, _ = select.select([fd], [], [], max(0, deadline - time.perf_counter()))
                    if not r:
                        continue
                    try:
                        data = os.read(fd, 65536)
                    except OSError:
                        break
                    if not data:
                        break
                    # per-chunk match, not whole-stream: a diffing TUI repaints
                    # its input line every frame, so the probe text recurs in
                    # the full stream and a whole-stream search would match
                    # stale repaints rather than the first real echo
                    if PROBE_TEXT.encode() in ANSI_RE.sub(b"", data):
                        hit = time.perf_counter() - t0
                        break
                if hit is not None:
                    break
            if hit is not None:
                samples.append(hit * 1000)
        finally:
            try:
                if logf is not None:
                    logf.close()
            except Exception:
                pass
            try:
                os.close(fd)
            except OSError:
                pass
            try:
                os.kill(pid, signal.SIGKILL)
                os.waitpid(pid, 0)
            except (ProcessLookupError, ChildProcessError, OSError):
                pass
    return min(samples) if samples else None


def start_fake_provider():
    """Run the repo's scripted provider fixture; returns (proc, base_url)."""
    bun = shutil.which("bun")
    if not bun or not os.path.isfile(FAKE):
        return None, None
    env = dict(os.environ, FAKE_SCRIPT="text")
    p = subprocess.Popen(
        [bun, FAKE],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        env=env,
        text=True,
        bufsize=1,
    )
    try:
        line = p.stdout.readline().strip()
    except Exception:
        line = ""
    if not line.startswith("http"):
        p.kill()
        return None, None
    return p, line


def fox_ttft(base_url):
    """Spawn-to-first-text-event of a headless turn against the fake provider."""
    home = tempfile.mkdtemp(prefix="fox-bench-home-")
    work = tempfile.mkdtemp(prefix="fox-bench-work-")
    env = dict(
        os.environ,
        FOX_AGENT_HOME=home,
        FOX_AGENT_BASE_URL=base_url,
        FOX_AGENT_API_KEY="bench-fake-key",
        FOX_AGENT_PROVIDER="openai-compatible",
        FOX_AGENT_MODEL="bench-model",
    )
    argv = [FOX, "-p", "say hi", "--json"]
    t0 = time.perf_counter()
    first = None
    try:
        p = subprocess.Popen(argv, cwd=work, env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1)
        assert p.stdout is not None
        for line in p.stdout:
            if '"type":"text"' in line or '"type": "text"' in line:
                first = (time.perf_counter() - t0) * 1000
                break
            if time.perf_counter() - t0 > 60:
                break
        try:
            p.wait(timeout=60)
        except subprocess.TimeoutExpired:
            p.kill()
    except Exception:
        first = None
    finally:
        shutil.rmtree(home, ignore_errors=True)
        shutil.rmtree(work, ignore_errors=True)
    return first


def fox_headless_rss(base_url):
    """Peak RSS (MB) of a headless turn, via /usr/bin/time -v."""
    timer = "/usr/bin/time"
    if not os.path.isfile(timer):
        return None
    home = tempfile.mkdtemp(prefix="fox-bench-home-")
    work = tempfile.mkdtemp(prefix="fox-bench-work-")
    env = dict(
        os.environ,
        FOX_AGENT_HOME=home,
        FOX_AGENT_BASE_URL=base_url,
        FOX_AGENT_API_KEY="bench-fake-key",
        FOX_AGENT_PROVIDER="openai-compatible",
        FOX_AGENT_MODEL="bench-model",
    )
    try:
        p = subprocess.run(
            [timer, "-v", FOX, "-p", "say hi", "--json"],
            cwd=work,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=120,
            text=True,
        )
        m = re.search(r"Maximum resident set size.*?:\s*(\d+)", p.stderr or "")
        return int(m.group(1)) / 1024 if m else None
    except Exception:
        return None
    finally:
        shutil.rmtree(home, ignore_errors=True)
        shutil.rmtree(work, ignore_errors=True)


# ---- svg ----

INK = "#e6e1d8"
MUT = "#8a8578"
ACC = "#e0803c"
BAR = "#5b7fa6"
BAR_NA = "#3a382f"
BG = "#141310"


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def bars_svg(title, subtitle, rows, unit, fmt, out_path):
    """rows: [(label, value_or_None, is_fox)]. Horizontal bars, sorted best-first."""
    W = 720
    have = sorted([r for r in rows if r[1] is not None], key=lambda r: r[1])
    missing = [r for r in rows if r[1] is None]
    ordered = have + missing
    row_h, top, label_w = 26, 64, 170
    H = top + 26 * len(ordered) + 30
    maxv = max([r[1] for r in have] or [1])
    L = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" font-family="monospace">']
    L.append(f'<rect width="{W}" height="{H}" fill="{BG}"/>')
    L.append(f'<text x="16" y="26" fill="{INK}" font-size="16">{esc(title)}</text>')
    L.append(f'<text x="16" y="46" fill="{MUT}" font-size="11">{esc(subtitle)}</text>')
    for i, (label, v, is_fox) in enumerate(ordered):
        y = top + i * row_h
        L.append(f'<text x="16" y="{y + 15}" fill="{INK if is_fox else MUT}" font-size="12">{esc(label[:24])}</text>')
        bx, bw = label_w, W - label_w - 110
        if v is None:
            L.append(f'<rect x="{bx}" y="{y + 3}" width="{bw}" height="16" fill="{BAR_NA}"/>')
            L.append(f'<text x="{bx + 6}" y="{y + 16}" fill="{MUT}" font-size="11">n/a — not installed</text>')
        else:
            w = max(3, (v / maxv) * bw)
            L.append(f'<rect x="{bx}" y="{y + 3}" width="{w:.0f}" height="16" fill="{ACC if is_fox else BAR}"/>')
            L.append(f'<text x="{bx + w + 8:.0f}" y="{y + 16}" fill="{INK}" font-size="12">{fmt(v)} {unit}</text>')
    L.append("</svg>")
    with open(out_path, "w") as f:
        f.write("\n".join(L) + "\n")


def fmt_ms(v):
    return f"{v:,.0f}" if v >= 100 else f"{v:.1f}"


def measure(label, path, n_start, n_probes, n_input):
    ver = version_of(path)
    disk, kind = footprint(path)
    startup = best_startup(path, n_start)
    ttfb = tui_first_byte(path, n_probes)
    tfin = tui_first_input(path, label, n_input)
    pss = idle_pss(path)
    row = {
        "agent": label,
        "installed": True,
        "bin": path,
        "version": ver,
        "disk_mb": round(disk, 1) if disk is not None else None,
        "disk_kind": kind,
        "startup_ms": round(startup, 1) if startup is not None else None,
        "tui_first_byte_ms": round(ttfb, 1) if ttfb is not None else None,
        "tui_first_input_ms": round(tfin, 1) if tfin is not None else None,
        "idle_pss_mb": round(pss, 1) if pss is not None else None,
    }
    print(f"{label}: {ver} disk={row['disk_mb']}MB({kind}) startup={row['startup_ms']}ms ttfb={row['tui_first_byte_ms']}ms tfin={row['tui_first_input_ms']}ms pss={row['idle_pss_mb']}MB")
    return row


def opencode_label(ver):
    """Label a bare `opencode` binary by the major version it reports."""
    m = re.search(r"(\d+)\.", ver)
    if not m:
        return None
    if m.group(1) == "2":
        return "opencode v2"
    if m.group(1) in ("0", "1"):
        # 0.x/1.x is the v1 line — except a 0.0.0-beta, which is the v2 beta
        return "opencode v2" if "beta" in ver else "opencode v1"
    return None


def main():
    quick = "--quick" in sys.argv
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else os.path.join(ROOT, "bench")
    os.makedirs(out, exist_ok=True)
    n_start = 2 if quick else 4
    n_probes = 2 if quick else 5
    # first-input is slower per probe (full launch + typing + echo wait)
    n_input = 2 if quick else 3

    rows = []
    for label, bins in AGENTS:
        path = which(bins)
        if not path:
            rows.append({"agent": label, "installed": False})
            print(f"{label}: not installed")
            continue
        rows.append(measure(label, path, n_start, n_probes, n_input))

    # opencode v1+v2: fixed names where upstream gives distinct binaries,
    # version fallback for the shared `opencode` name. Duplicate labels
    # collapse to the first binary in OPENCODE_BINS order, so a machine with
    # only v2's `opencode` gets one v2 row, while the workflow (v1 preserved
    # as `opencode-v1`) gets both rows.
    oc_rows: list = []
    seen_oc = set()
    for bin_name, fixed in OPENCODE_BINS:
        path = shutil.which(bin_name)
        if not path:
            continue
        if fixed is not None:
            label = fixed
            ver = version_of(path)
        else:
            ver = version_of(path)
            label = opencode_label(ver)
            if label is None:
                print(f"{bin_name}: unrecognized version {ver!r} — skipped")
                continue
        if label in seen_oc:
            print(f"{bin_name}: {ver} (duplicate {label}, kept first)")
            continue
        seen_oc.add(label)
        oc_rows.append(measure(label, path, n_start, n_probes, n_input))
    for want in ("opencode v1", "opencode v2"):
        if want not in seen_oc:
            oc_rows.append({"agent": want, "installed": False})
            print(f"{want}: not installed")
    at = next((i + 1 for i, r in enumerate(rows) if r["agent"] == "codex"), len(rows))
    rows[at:at] = sorted(oc_rows, key=lambda r: r["agent"])

    fox = next((r for r in rows if r["agent"] == "fox-agent" and r.get("installed")), None)
    fox_extra = {}
    if fox:
        fake, base = start_fake_provider()
        if base:
            try:
                ttft = fox_ttft(base)
                rss = fox_headless_rss(base)
                fox_extra = {
                    "ttft_ms": round(ttft, 1) if ttft is not None else None,
                    "headless_peak_rss_mb": round(rss, 1) if rss is not None else None,
                }
                print(f"fox extra: {fox_extra}")
            finally:
                fake.kill()
        else:
            print("fox extra: fake provider unavailable")
    fox_extra["method"] = "headless `fox -p … --json` vs scripted local provider; RSS via /usr/bin/time -v; TUI bytes via PTY; TUI input = first typed byte to probe text on screen (log marker where echo is suppressed)"

    import platform

    payload = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "machine": f"{platform.system()} {platform.machine()} ({platform.release()})",
        "method": (
            "best of 4 `--version` runs; best of 5 PTY launches (no args) to first output byte; "
            "best of 3 PTY launches typing a probe and waiting for it on screen (log marker "
            "where a tool suppresses echo); "
            "PSS after 1.5s idle from /proc smaps_rollup; bundle = the binary itself, a launcher's "
            "exec target where a wrapper hands off, or the package "
            "dir for script CLIs (entry shims alone would pretend node_modules are free); "
            "fox TTFT = spawn to first text event of `fox -p … --json` vs the repo's scripted local "
            "provider (no key, no network); fox peak RSS of that turn via /usr/bin/time -v. "
            "Missing tools are n/a, never estimated."
        ),
        "rows": rows,
        "fox": fox_extra,
    }
    with open(os.path.join(out, "results.json"), "w") as f:
        json.dump(payload, f, indent=2)

    is_fox = lambda r: r["agent"] == "fox-agent"  # noqa: E731
    bars_svg(
        "bundle size",
        "full install footprint: the binary, or the package dir for script CLIs · lower is better",
        [(r["agent"], r.get("disk_mb"), is_fox(r)) for r in rows],
        "MB",
        lambda v: f"{v:.1f}",
        os.path.join(out, "bundle.svg"),
    )
    bars_svg(
        "time to first char — actual TUI launch",
        "PTY launch with no args to first output byte, best of 5 · lower is better",
        [(r["agent"], r.get("tui_first_byte_ms"), is_fox(r)) for r in rows],
        "ms",
        fmt_ms,
        os.path.join(out, "tui-first-char.svg"),
    )
    bars_svg(
        "time to first input — typed text on screen",
        "PTY launch, type a probe, wait for it to render, best of 3 · lower is better",
        [(r["agent"], r.get("tui_first_input_ms"), is_fox(r)) for r in rows],
        "ms",
        fmt_ms,
        os.path.join(out, "tui-first-input.svg"),
    )
    bars_svg(
        "idle memory — TUI at rest",
        "PSS after 1.5s idle, before any model traffic · lower is better",
        [(r["agent"], r.get("idle_pss_mb"), is_fox(r)) for r in rows],
        "MB",
        lambda v: f"{v:.0f}",
        os.path.join(out, "memory.svg"),
    )

    # markdown table for the README snapshot + job summary
    T = ["| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |", "|---|---|---|---|---|---|---|"]
    for r in rows:
        if not r.get("installed"):
            T.append(f"| {r['agent']} | n/a (not installed) | — | — | — | — | — |")
            continue
        disk = f"{r['disk_mb']:.1f} MB" if r.get("disk_mb") is not None else "—"
        if r.get("disk_kind") == "pkg":
            disk += " (pkg)"
        elif r.get("disk_kind") == "entry":
            disk += " (entry)"
        st = f"{r['startup_ms']:.0f} ms" if r.get("startup_ms") is not None else "—"
        tb = f"**{r['tui_first_byte_ms']:.0f} ms**" if r.get("tui_first_byte_ms") is not None else "—"
        ti = f"**{r['tui_first_input_ms']:.0f} ms**" if r.get("tui_first_input_ms") is not None else "—"
        pss = f"{r['idle_pss_mb']:.0f} MB" if r.get("idle_pss_mb") is not None else "—"
        name = f"**{r['agent']}**" if r["agent"] == "fox-agent" else r["agent"]
        T.append(f"| {name} | {r['version']} | {disk} | {st} | {tb} | {ti} | {pss} |")
    table_md = "\n".join(T) + "\n"
    with open(os.path.join(out, "table.md"), "w") as f:
        f.write(table_md)

    # README snapshot block: the bench workflow splices this between
    # <!-- bench:start --> and <!-- bench:end --> so the top-of-README
    # numbers refresh with every run instead of going stale.
    S = [
        "![bundle size](bench/bundle.svg)",
        "![time to first char](bench/tui-first-char.svg)",
        "![time to first input](bench/tui-first-input.svg)",
        "![idle memory](bench/memory.svg)",
        "",
        table_md.rstrip(),
        "",
    ]
    if fox_extra.get("ttft_ms") is not None:
        rss = fox_extra.get("headless_peak_rss_mb")
        rss_s = f"{rss:.0f} MB" if rss is not None else "n/a on this machine (/usr/bin/time missing)"
        S.append(
            f"fox-agent headless vs scripted local provider: time to first token **{fox_extra['ttft_ms']:.0f} ms**, "
            f"peak RSS **{rss_s}**."
        )
        S.append("")
    S.append(f"_Generated {payload['generated']} on {payload['machine']}. [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_")
    with open(os.path.join(out, "snippet.md"), "w") as f:
        f.write("\n".join(S) + "\n")
    print("wrote", out)


if __name__ == "__main__":
    main()

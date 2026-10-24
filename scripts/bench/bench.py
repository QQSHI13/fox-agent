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
  - tui_first_input: best of 3 PTY launches — time from spawn, once the TUI is
    alive and quiet, to a typed probe rendering on screen (time to interactive
  - tui_input_latency: best of 3 PTY launches — launch, wait until interactive
    (alive and quiet, the same readiness tui_first_input measures), wait 500ms,
    then type the same probe — isolates input-handling latency from startup cost

Plus fox-agent only (hermetic, no API key, no network):
  - ttft: headless `fox -p … --json` against the repo's scripted fake
    provider, spawn to first `{"type":"text"}` event
  - rss: peak resident set of that same headless turn (`/usr/bin/time -v`)

Outputs (all under bench/):
  results.json, table.md, snippet.md, bench.svg (one dashboard image)

snippet.md is the top-of-README block: the bench workflow splices it between
<!-- bench:start --> and <!-- bench:end --> markers so the graphs and numbers
at the top of the README refresh with every run. The default view is one
compact table — a row per metric, fox-agent's absolute score and its rank in
the field — because a 23-row grid of everyone else's numbers is a reference
document, not a headline. The dashboard SVG, the rounded per-agent grid and
the full-precision table all live inside folded <details> blocks.

Usage:
  python3 scripts/bench/bench.py [--quick] [--out bench] [--debug]
  bun run bench   # build + bench in one step (see package.json)

--debug: verbose per-step timing + decision logging to stderr. Same
measurements, just narrated — use it to see why a tool got n/a or where the
wall-clock went.
"""
import json
import os
import re
import select
import shlex
import shutil
import signal
import subprocess
import sys
import tempfile
import termios
import time




DEBUG = "--debug" in sys.argv


def dbg(msg):
    """Debug narration to stderr (--debug only). Timestamped so a slow step is
    attributable at a glance; goes to stderr so stdout stays the clean result."""
    if DEBUG:
        print(f"[bench {time.strftime('%H:%M:%S')}.{int(time.time()*1000)%1000:03d}] {msg}", file=sys.stderr, flush=True)


def step(tool, what, detail=""):
    """Live progress line to stderr: WHERE we are and WHAT is being tested, so a
    long serial run is legible in CI logs (a tool that hangs is visible at a
    glance). Always on — this is status, not debug detail.

    \r keeps it to one updating line on a terminal; CI captures each as a row.
    """
    suffix = f" — {detail}" if detail else ""
    print(f"\r[bench] {tool:<14} {what}{suffix}   ", file=sys.stderr, flush=True)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FOX = os.path.join(ROOT, "bin", "fox")
FAKE = os.path.join(ROOT, "test", "fixtures", "fake-provider.ts")

# (label, candidate binary names). Rows are labeled by the version the binary
# REPORTS, so a renamed/vendored install cannot silently pose as something else.
# opencode v2 is measured separately below (bin `opencode2`, installed from
# @opencode-ai/cli@beta). v1 was dropped: v2 is the current product and the
# v1 row only added a n/a-or-stale line to the table.
OPENCODE_BINS = (("opencode2", "opencode v2"),)
AGENTS = [
    ("fox-agent", ["bin/fox"]),
    ("claude code", ["claude"]),
    ("codex", ["codex"]),
    ("jcode", ["jcode"]),
    ("pi", ["pi", "pi-coding-agent"]),
    ("pi-bolt", ["pi-bolt"]),
    ("gemini cli", ["gemini"]),
    ("copilot cli", ["copilot"]),
    ("crush", ["crush"]),
    ("aider", ["aider"]),
    ("amp", ["amp"]),
    # cursor renamed the primary binary to `agent`; cursor-agent stays as the
    # legacy symlink the installer also ships
    ("cursor-agent", ["cursor-agent", "agent"]),
    ("qwen code", ["qwen"]),
    ("codebuff", ["codebuff"]),
    ("kilo code", ["kilocode", "kilo"]),
    ("droid", ["droid"]),
    ("kimi code", ["kimi"]),
    ("devin", ["devin"]),
    ("cline", ["cline"]),
    ("continue", ["cn"]),
    ("iflow cli", ["iflow"]),
]

VERSION_FALLBACKS = [["--version"], ["-v"], ["version"], ["--help"]]

# Tools whose real binary is fetched on FIRST RUN into a data dir, so the file a
# shim points at is not the cost (the downloader spawns it from child_process,
# which no exec-line walk can see). Label -> paths relative to $HOME. Add a row
# per tool; the lookup is keyed by label so one tool's download cannot be
# reported as another's footprint.
FIRST_RUN_DOWNLOADERS = {
    "codebuff": [os.path.join(".config", "manicode", "codebuff")],
}


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


def best_startup(path, n, ver=None):
    # `ver` lets the caller pass the version it already looked up, so a slow
    # CLI (gemini: ~1s per --version) is not spawned an extra time just to pick
    # argv. Falls back to a local probe when not given.
    if ver is None:
        ver = version_of(path)
    argv = [path, "--version"]
    if ver == "n/a":
        argv = [path, "--help"]
    ts = []
    for _ in range(n):
        dt, _ = run_quiet(argv, timeout=15)
        if dt is not None:
            ts.append(dt * 1000)
    return ts


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


def _looks_like_js_runtime(path):
    """True when `path` is an embedded/shared JavaScript runtime binary (node or
    bun), not the tool's own code. These CLIs bundle a full Node/Bun runtime
    (~90-150MB) that dominates the package dir and makes every tool report the
    same ~140MB regardless of its actual code size (pi's own cli.js is 160 bytes).
    The runtime is identified by name + ELF magic; versioned runtime dirs
    (pi-node, */node_modules/node/*) are caught by the dir prunes in du_bytes.
    """
    base = os.path.basename(path).lower()
    if base not in ("node", "node.exe", "bun", "bun.exe"):
        return False
    try:
        with open(path, "rb") as f:
            return f.read(4) == b"\x7fELF"
    except OSError:
        return False


def _runtime_dirs_under(path):
    """Subdirectories of `path` that hold only an embedded JS runtime (pi's
    pi-node, any node_modules/{node,bun} install). These ship a full Node/Bun
    (~90-150MB) that dominates the package dir; excluding them measures the
    tool's own code, not the interpreter. Returns relative dir names for
    `du --exclude`.
    """
    found = []
    if not os.path.isdir(path):
        return found
    for root, dirs, _files in os.walk(path):
        for d in dirs:
            low = d.lower()
            if low == "pi-node" or (low in ("node", "bun") and os.path.basename(root) == "node_modules"):
                found.append(os.path.relpath(os.path.join(root, d), path))
        # don't recurse into a found runtime dir looking for nested ones
        dirs[:] = [d for d in dirs if os.path.relpath(os.path.join(root, d), path) not in found]
    return found


def du_bytes(path, exclude_runtimes=True):
    """Disk use of a file or tree in bytes. When exclude_runtimes and `path` is a
    dir, any embedded JS runtime (node/bun) is left out so the tool's own code is
    measured, not the ~140MB interpreter it ships. du -sb (with --exclude for the
    runtime dirs) when present; a portable walk that prunes them otherwise.
    """
    if os.path.isfile(path):
        if exclude_runtimes and _looks_like_js_runtime(path):
            return 0
        try:
            return os.path.getsize(path)
        except OSError:
            return 0
    excludes = _runtime_dirs_under(path) if exclude_runtimes else []
    if excludes:
        try:
            p = subprocess.run(
                ["du", "-sb", "--exclude=" + " --exclude=".join(excludes), path],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=60,
            )
            return int(p.stdout.split()[0])
        except Exception:
            pass
    try:
        p = subprocess.run(["du", "-sb", path], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=60)
        return int(p.stdout.split()[0])
    except Exception:
        pass
    skip = set(excludes)
    total = 0
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if os.path.relpath(os.path.join(root, d), path) not in skip]
        for f in files:
            fp = os.path.join(root, f)
            if exclude_runtimes and _looks_like_js_runtime(fp):
                continue
            try:
                total += os.path.getsize(fp)
            except OSError:
                pass
    return total


def _contains_js_runtime(path):
    """True when the dir `path` bundles an embedded node/bun runtime."""
    return bool(_runtime_dirs_under(path))


def _first_run_downloader(agent_label):
    """Data-dir binary a tool downloads on first run, if it has one.

    Keyed by the TOOL, because the lookup used to be unconditional: every tool
    fell into codebuff's `~/.config/manicode/codebuff` and was reported at that
    file's size. Thirteen unrelated vendors came out at exactly 139.954304 MB —
    including aider, which is Python — and none of them had their package dir
    measured at all. The size was real; it just belonged to one tool.

    A downloader is invisible to the exec-line walk (the shim spawns the binary
    from child_process), so it has to be named here. Add a row per tool that
    needs one: label -> path relative to $HOME.
    """
    rels = FIRST_RUN_DOWNLOADERS.get(agent_label)
    if not rels:
        return None
    for rel in rels:
        cand = os.path.join(os.path.expanduser("~"), rel)
        try:
            if os.path.isfile(cand) and is_binary_file(cand):
                return cand
        except OSError:
            pass
    return None


def footprint(path, agent_label=None):
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
    # a first-run downloader spawns its real binary from a data dir via
    # child_process, not an exec line — the walk above cannot see it. Scoped to
    # the tool that owns it: an unconditional lookup reported one file as twelve
    # vendors' footprint. The FRESH-download caveat lives in the workflow
    # comment: CI installs are cold, so this only pays off after the probe
    # launches have warmed it.
    cand = _first_run_downloader(agent_label)
    if cand:
        return os.path.getsize(cand) / 1e6, "bin"
    d = os.path.dirname(real)
    for _ in range(5):
        if os.path.isfile(os.path.join(d, "package.json")) or os.path.isfile(os.path.join(d, "pyvenv.cfg")):
            # a bundled runtime (node/bun) is the interpreter, not the tool's
            # code — excluding it yields the tool's own footprint; the kind
            # says which was measured. Without a runtime, pkg == app.
            has_rt = _contains_js_runtime(d)
            return du_bytes(d, exclude_runtimes=True) / 1e6, ("app" if has_rt else "pkg")
        nd = os.path.dirname(d)
        if nd == d:
            break
        d = nd
    try:
        return os.path.getsize(real) / 1e6, "entry"
    except OSError:
        return None, "entry"


# No whitespace: a tool still in cooked mode has the terminal line discipline
# echo its keys, and that discipline eats spaces — "hello bench" arrived as
# "hellobench" and never matched, so cooked-mode tools (claude, jcode) timed
# out as n/a even though they echoed fine. A bare word survives both modes.
PROBE_TEXT = "hellobench"

# Tools whose input readiness cannot be read off the screen: {"log": file to
# tail, "marker": regex ending the probe}. The motivating case is a sign-in
# screen that swallows echoed keystrokes while the tool logs its own
# input-ready marker internally — typing is still sent the same way; only the
# completion signal differs (internal ack rather than screen echo), which the
# method strings below say out loud.
INPUT_MARKERS = {
    # "antigravity": {"log": "~/.antigravity/input-ready.log", "marker": r"..."},
}


# The probe is matched against tmux's rendered screen (`capture-pane -p -J`),
# not against the raw byte stream. Matching bytes was wrong four separate times
# and each time produced wrong published numbers: a cell-diffing TUI never emits
# the probe as one contiguous run, a wrapped input box splits it across rows,
# multibyte glyphs decoded per-byte shifted the layout, and escape sequences
# arrive split across reads. tmux already keeps the screen model, so asking it
# what is on screen is asking the question the metric actually poses.


# ---------------------------------------------------------------------------
# Interactive measurement runs inside tmux.
#
# Why tmux and not a raw PTY: tmux IS the terminal. It already keeps a screen
# model, applies cursor addressing, handles wrapping, UTF-8 and cell diffs, and
# hands the result back as text via `capture-pane`. The previous version
# re-derived all of that by hand from the byte stream and got it wrong in ways
# that produced WRONG PUBLISHED NUMBERS four separate times (cell-diffing TUIs
# never emitting the probe contiguously, wrapped input boxes splitting it,
# multibyte glyphs decoded per-byte, escape sequences split across reads).
# `capture-pane` is what a user sees, so measuring it is measuring the thing.
#
# The three metrics map onto that directly, which is the whole point:
#
#   first char : the viewbox stops being empty for the first time
#   ttfi       : spawn -> probe text appears in the viewbox
#   latency    : probe typed -> probe text appears in the viewbox
#
# tmux is also what fox-agent's own `pty` tool is built on, so this is the same
# primitive the product uses.
# ---------------------------------------------------------------------------

TMUX_ROWS = 40
TMUX_COLS = 120
_TMUX_SRV = "bench"



def _tmux(*args, timeout=20):
    """Run one tmux command against the bench server. Returns stdout text."""
    try:
        r = subprocess.run(
            ["tmux", "-L", _TMUX_SRV, *args],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return r.stdout
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return ""


def _tmux_ready():
    return bool(shutil.which("tmux"))


def _session_run(path, name=None):
    """Start `path` in a detached tmux session sized like a real terminal.

    Returns the session name, or None when tmux/the binary is unavailable.

    The window size is not cosmetic: a TUI that queries TIOCGWINSZ against a 0x0
    terminal collapses or skips its input box, so the probe has nowhere to land
    (measured on jcode: 928 bytes drawn at 0x0 versus 6229 at 120x40).

    FOX_AGENT_NO_TRUST_CHECK is set because fox-agent asks "Do you trust this
    folder?" on interactive start and waits for a keypress; in a bench temp dir
    that swallows the probe. src/core/trust.ts documents that variable for
    exactly this case ("never prompt in scripts/tests").
    """
    if not _tmux_ready():
        return None
    name = name or f"m{next(_counter)}"
    _tmux("kill-session", "-t", name)  # ignore: usually absent
    _tmux(
        "new-session",
        "-d",
        "-s",
        name,
        "-x",
        str(TMUX_COLS),
        "-y",
        str(TMUX_ROWS),
        "-e",
        "TERM=xterm-256color",
        "-e",
        "FOX_AGENT_NO_TRUST_CHECK=1",
        path,
    )
    return name


class _Counter:
    def __init__(self):
        self.n = 0

    def __next__(self):
        self.n += 1
        return self.n


_counter = _Counter()


def _session_kill(name):
    _tmux("kill-session", "-t", name)


def _pane_text(name):
    """The rendered screen as text.

    -J joins lines the terminal wrapped, so a probe split across a row boundary
    reads as one string again (that was a real failure of the old matcher).
    -S -400 also reads back into scrollback, so a startup banner that pushed the
    input box out of the visible window cannot hide the probe.
    """
    return _tmux("capture-pane", "-p", "-J", "-S", "-400", "-t", name)


def _pane_alive(name):
    return bool(_tmux("display-message", "-p", "-t", name, "#{pane_pid}").strip())


def _pane_pid(name):
    out = _tmux("display-message", "-p", "-t", name, "#{pane_pid}").strip()
    try:
        return int(out)
    except ValueError:
        return None


def _pane_tty(name):
    return _tmux("display-message", "-p", "-t", name, "#{pane_tty}").strip() or None


def _send(name, text):
    """Type literal text into the session (no key-name interpretation)."""
    _tmux("send-keys", "-l", "-t", name, text)


def _wait_viewbox(name, budget_s, t0=None):
    """Time until the viewbox first has content, in ms from t0.

    "First char" as a user experiences it: the screen stops being blank. This is
    more honest than timing the first byte on the wire, which for a TUI is
    cursor bookkeeping (fox writes a bare `\\e[?25l` before compositing).
    """
    start = t0 if t0 is not None else time.perf_counter()
    deadline = start + budget_s
    while time.perf_counter() < deadline:
        if _pane_text(name).strip():
            return (time.perf_counter() - start) * 1000
        if not _pane_alive(name):
            return None
        time.sleep(0.005)
    return None


def _wait_probe(name, probe, budget_s, t0):
    """Time until `probe` reads out of the rendered viewbox, in ms from t0.

    `budget_s` is a DURATION from now, while `t0` is the moment the figure is
    measured from. They must be separate: readiness can legitimately consume most
    of a caller's patience (a cooked CLI never paints, so its readiness wait runs
    to the cap), and an absolute deadline computed from spawn then expired before
    we ever typed — which reported n/a for tools that were working fine.
    """
    deadline = time.perf_counter() + budget_s
    while time.perf_counter() < deadline:
        if probe in _pane_text(name):
            return (time.perf_counter() - t0) * 1000
        if not _pane_alive(name):
            return None
        time.sleep(0.005)
    return None


def _await_ready(name, budget_s, t0=None):
    """Wait until the app owns the terminal and can accept a keystroke.

    Readiness is "the app has taken the tty", which is exactly what the mode
    tells us:

      * ECHO turns OFF  -> the tool is in raw mode and redraws its own screen.
                           Ready. (It may have painted nothing yet; a raw-mode
                           app that hasn't drawn is still ours to type into.)
      * the viewbox has text -> ready regardless of mode.
      * ECHO stays ON    -> a cooked-mode CLI. Ready ONLY at the very end of the
                            budget, because "cooked" early on is far more often
                            a TUI that hasn't booted its UI yet than a tool that
                            is genuinely cooked.

    That last clause is not cosmetic. An earlier version accepted cooked mode as
    ready after a 4s grace; measured, that made kimi and cat report ttfi ≈ 4.05s
    — the grace itself — because we typed into kimi's cooked boot window and the
    KERNEL echoed the probe. The metric was timing line-discipline echo, which
    is the one thing this bench exists to exclude.
    """
    start = t0 if t0 is not None else time.perf_counter()
    # Cap the readiness wait below the probe budget. A cooked CLI never paints,
    # so waiting the full probe budget here would burn it entirely and then give
    # the probe no time at all (measured: cat reported ttfi=20s — the budget
    # itself). 8s comfortably covers the slowest real TUI measured (~2.8s to take
    # the tty, ~5s to first paint) and leaves the rest for the probe.
    deadline = start + min(budget_s, 8.0)
    while time.perf_counter() < deadline:
        if _pane_text(name).strip():
            return True
        if _echo_mode(name) == "render":
            return True
        if not _pane_alive(name):
            return False
        time.sleep(0.02)
    # Timed out: either a genuinely cooked CLI (cat) or a tool that never takes
    # the tty. Typing is still worth trying; the row records kernel-echo so it
    # is excluded from the render ranking.
    return _pane_alive(name)


def _await_settled(name, budget_s=6.0, quiet=3):
    """Wait until the pane text stops changing (the app has finished painting).

    Typing into a still-starting app proves nothing: the keystroke can be
    swallowed before it ever reaches the input loop.
    """
    deadline = time.perf_counter() + budget_s
    last = None
    streak = 0
    while time.perf_counter() < deadline:
        cur = _pane_text(name)
        if cur == last:
            streak += 1
            if streak >= quiet:
                return True
        else:
            last = cur
            streak = 0
        if not _pane_alive(name):
            return False
        time.sleep(0.05)
    return True


def _echo_mode(name):
    """Whether the tool's tty is echoing (cooked) or the app owns the screen.

    Read from the pane's own pty, which is the terminal the tool actually holds.
    A cooked-mode CLI has the line discipline echo each byte before it wakes, so
    its "latency" describes the kernel, not the tool — measured: `cat` in a pty
    times ~0.3ms with no UI at all. Ranking those against a raw-mode TUI that
    must repaint a cell is meaningless, so the classification is recorded and
    ranks are computed within the `render` class only.
    """
    tty = _pane_tty(name)
    if not tty:
        return None
    try:
        fd = os.open(tty, os.O_RDONLY | os.O_NOCTTY | os.O_NONBLOCK)
    except OSError:
        return None
    try:
        lflag = termios.tcgetattr(fd)[3]
    except (termios.error, OSError):
        return None
    finally:
        try:
            os.close(fd)
        except OSError:
            pass
    return "kernel-echo" if lflag & termios.ECHO else "render"


def _classify_mode(name, budget_s=6.0):
    """Watch the tty mode until the tool commits to one.

    Sampling once is wrong: several TUIs boot COOKED and switch to raw when
    their UI takes over (measured: jcode ~2.5s, pi-bolt ~2.5s, kimi ~2.8s). An
    early sample labelled them kernel-echo, so the metric timed the kernel
    echoing rather than the app rendering, and the answer depended on timing.

    ECHO turning off at any point means the app took the terminal -> `render`.
    Staying on for the whole window means a cooked CLI -> `kernel-echo`.
    """
    deadline = time.perf_counter() + budget_s
    last = None
    while time.perf_counter() < deadline:
        cur = _echo_mode(name)
        if cur == "render":
            return "render"
        last = cur
        if not _pane_alive(name):
            break
        time.sleep(0.1)
    return last


def tui_first_byte(path, probes=5):
    """Time from session creation to the first RENDERED character, best of N.

    Replaces "time to first output byte": for a TUI the first byte on the wire is
    cursor bookkeeping (fox emits a bare 6-byte `\\e[?25l` before compositing),
    so it measured the wrong event. The first rendered cell is what a user waits
    for.

    The clock starts BEFORE the tmux session is created, so the figure includes
    tmux's own spawn cost (~30ms, measured). That cost is identical for every
    tool, so the ordering between tools is preserved — but the absolute numbers
    are not comparable to the old raw-PTY ones, which is why the dashboard
    caption says so.
    """
    if not _tmux_ready():
        return None
    samples = []
    for _ in range(probes):
        start = time.perf_counter()
        name = _session_run(path)
        if name is None:
            return None
        try:
            hit = _wait_viewbox(name, 20, t0=start)
            if hit is not None:
                samples.append(hit)
        finally:
            _session_kill(name)
    return samples


def _probe_once(name, probe, budget, t0=None):
    """Type the probe and wait for it to render.

    Returns (ms from t0, signal) or (None, None). `t0` is the moment to time
    from: the keystroke for latency, spawn for ttfi.

    Deliberately does NOT wait for the pane to settle. That wait is startup
    observation, and when it ran inside a latency measurement it charged the
    whole settle window to the keystroke round-trip — an earlier version of this
    had `cat` reading 3007ms instead of ~0.3ms for exactly that reason. Callers
    settle BEFORE they start their clock; here we only type and watch.
    """
    _send(name, probe)
    hit = _wait_probe(name, probe, budget, t0 if t0 is not None else time.perf_counter())
    if hit is None:
        return None, None
    return hit, "drained"


def tui_first_input(path, label, probes=3, timeout=15):
    """Spawn -> probe rendered in the viewbox, best of N. Time to interactive.

    Two rounds when the first probe never lands: an app still finishing startup
    can swallow it, and the honest answer is "how long until my input renders",
    not n/a. An app that never renders it still reports n/a.
    """
    if not _tmux_ready():
        return None, None
    samples = []
    signal_kind = None
    for _ in range(probes):
        # Clock starts BEFORE the session exists — the same origin
        # tui_first_byte uses. Starting it after the session was created made
        # ttfi occasionally read LOWER than first-char for the same tool, which
        # is impossible and means the two figures were not measuring from the
        # same point.
        start = time.perf_counter()
        name = _session_run(path)
        if name is None:
            return None, None
        try:
            if not _await_ready(name, 20, t0=start):
                continue
            for _attempt in (1, 2):
                hit, via = _probe_once(name, PROBE_TEXT, timeout, t0=start)
                if hit is not None:
                    samples.append(hit)
                    break
            # Classify AFTER measuring: the mode watch can take up to 6s on a
            # tool that boots cooked and switches late, and doing it before the
            # probe would sit between spawn and keystroke — inflating ttfi by an
            # amount that has nothing to do with the tool's startup.
            if signal_kind is None:
                signal_kind = _classify_mode(name)
        finally:
            _session_kill(name)
    return samples, signal_kind


def tui_input_latency(path, label, settle_s=0.5, probes=3, timeout=15):
    """Keystroke -> probe rendered, with startup removed. Pure input handling.

    Launch, wait for the viewbox to appear and settle, then time ONLY the
    keystroke round trip. Classification happens before the clock starts: waiting
    for the tty mode to settle is startup observation, not input latency, and
    charging it to the measurement is a bug that once made `cat` read 3007ms
    instead of ~0.3ms.
    """
    if not _tmux_ready():
        return None, None
    samples = []
    signal_kind = None
    for _ in range(probes):
        name = _session_run(path)
        if name is None:
            return None, None
        try:
            if _wait_viewbox(name, 20) is None:
                continue
            if not _await_settled(name):
                continue
            time.sleep(settle_s)
            if signal_kind is None:
                signal_kind = _classify_mode(name)
            t0 = time.perf_counter()
            hit, _via = _probe_once(name, PROBE_TEXT, timeout, t0=t0)
            if hit is not None:
                samples.append(hit)
        finally:
            _session_kill(name)
    return samples, signal_kind


def _pss_of(pid):
    """PSS of one process in MB, or None."""
    try:
        with open(f"/proc/{pid}/smaps_rollup") as f:
            for line in f:
                if line.startswith("Pss:"):
                    return int(line.split()[1]) / 1024
    except (FileNotFoundError, ProcessLookupError, ValueError, PermissionError):
        pass
    return None


def _ppid_of(pid):
    try:
        with open(f"/proc/{pid}/stat", "rb") as f:
            data = f.read()
    except OSError:
        return None
    # comm can contain spaces/parens and is the only parenthesised field
    rparen = data.rfind(b")")
    if rparen < 0:
        return None
    fields = data[rparen + 2 :].split()
    if len(fields) < 2:
        return None
    try:
        return int(fields[1])
    except ValueError:
        return None


def _pss_tree(root_pid):
    """(total PSS in MB, process count) for a pid and all its descendants.

    Summing is the honest accounting for a CLI's footprint: a node-based tool's
    workers hold real, user-visible memory, and charging only the launcher
    understates it by 2-8x (measured: kilo 46->353MB, copilot 47->303).

    This does NOT double-count shared memory — the kernel divides each shared
    page's PSS among the processes mapping it, so a fork with inherited
    copy-on-write memory reads tree/root = 1.05, not 2.0 (verified with a
    synthetic parent/child pair).
    """
    kids = {}
    for entry in os.listdir("/proc"):
        if not entry.isdigit():
            continue
        pid = int(entry)
        ppid = _ppid_of(pid)
        if ppid is not None:
            kids.setdefault(ppid, []).append(pid)
    total = 0.0
    count = 0
    seen = set()
    stack = [root_pid]
    while stack:
        pid = stack.pop()
        if pid in seen:
            continue
        seen.add(pid)
        v = _pss_of(pid)
        if v is not None:
            total += v
            count += 1
        stack.extend(kids.get(pid, ()))
    return (total, count) if count else (None, 0)


def idle_pss(path, settle=1.5, budget_s=8.0, quiet_reads=3):
    """Settled PSS of the tool AND its process tree, in MB (Linux only).

    Two things matter, and each was wrong in an earlier attempt:

    1. THE TREE, not the root: node-based CLIs run the UI in children.
    2. A SETTLED, REPRODUCIBLE instant. A tree at a fixed t=1.5s contains
       whatever startup work is in flight. Convergence alone is not enough
       either — periodic work can hold a stable but INFLATED tree. Measured
       spreads across launches were 41% (opencode), 46% (kimi), 134% (jcode).

    Extra processes only ever ADD, so the resting figure is the FLOOR over a few
    launches: the reading taken when the least startup work was in flight.
    """
    detail = idle_pss_detail(path, settle=settle, budget_s=budget_s, quiet_reads=quiet_reads)
    return detail["tree_mb"] if detail else None


def idle_pss_detail(path, settle=1.5, budget_s=8.0, quiet_reads=3, launches=3):
    """Resting {root_mb, tree_mb, procs, reads} for one tool, or None."""
    best = None
    for _ in range(max(1, launches)):
        one = _one_pss_launch(path, settle=settle, budget_s=budget_s, quiet_reads=quiet_reads)
        if one is None:
            continue
        if best is None or one["tree_mb"] < best["tree_mb"]:
            best = one
    return best


def _one_pss_launch(path, settle, budget_s, quiet_reads):
    """One launch: wait out `settle`, then read the tree until it converges."""
    name = _session_run(path)
    if name is None:
        return None
    try:
        time.sleep(settle)
        deadline = time.perf_counter() + budget_s
        last = None
        stable = 0
        reads = 0
        best = None
        root = _pane_pid(name)
        while time.perf_counter() < deadline:
            tree, nprocs = _pss_tree(root)
            reads += 1
            if tree is None:
                if not _pane_alive(name):
                    break
                time.sleep(0.2)
                continue
            best = (tree, nprocs)
            # converged when the total stops moving; 2MB is allocator jitter
            if last is not None and abs(tree - last) <= 2.0:
                stable += 1
                if stable >= quiet_reads:
                    break
            else:
                stable = 0
            last = tree
            time.sleep(0.25)
        if best is None:
            return None
        return {
            "root_mb": _pss_of(root),
            "tree_mb": best[0],
            "procs": best[1],
            "reads": reads,
        }
    finally:
        _session_kill(name)


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
BG2 = "#1b1916"
GRID = "#2e2b25"


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def dashboard_svg(panels, out_path):
    """panels: [(title, subtitle, rows, unit, fmt)] rendered as one image.

    A 2x2 dashboard replaces four separate SVGs: GitHub renders one image
    with one row height regardless of how the four charts would wrap, and
    the shared header carries the method note that used to live in each
    per-chart subtitle. fox-agent is orange everywhere else; the podium
    rows get medal markers so the top-3 is scannable without reading
    numbers.
    """
    W, GUT, PAD, LANE_LABEL = 1180, 20, 24, 148
    NCOL = 3
    COLW = (W - PAD * 2 - GUT * (NCOL - 1)) // NCOL
    HEADER_H, LANE_H, SUB_H, FOOT_H = 84, 30, 18, 34
    NROW = -(-len(panels) // NCOL)  # ceil division
    n_rows = max(len(p[2]) for p in panels)
    H = HEADER_H + SUB_H + NROW * (LANE_H * n_rows + SUB_H + SUB_H) + FOOT_H
    L = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" font-family="ui-monospace,Menlo,Consolas,monospace">',
        # base + header band
        f'<rect width="{W}" height="{H}" fill="{BG}"/>',
        f'<rect width="{W}" height="{HEADER_H}" fill="{BG2}"/>',
        f'<rect x="0" y="{HEADER_H - 2}" width="{W}" height="2" fill="{ACC}"/>',
        f'<text x="{PAD}" y="36" fill="{INK}" font-size="20" font-weight="bold">fox-agent · harness bench</text>',
        f'<text x="{PAD}" y="58" fill="{MUT}" font-size="12">startup · TUI latency · footprint · idle memory — github actions ubuntu-latest, refreshed on every push</text>',
        f'<text x="{PAD}" y="76" fill="{MUT}" font-size="11">{esc("1st byte = PTY launch, best of 5 · 1st input = spawn→quiet→typed→probe text on screen, best of 3 · latency = ready→500ms→typed→probe text on screen (keystroke only), ranked among render-signal tools only · bundle = binary or pkg dir · PSS at rest")}</text>',
    ]
    for pi_, (title, subtitle, rows, unit, fmt) in enumerate(panels):
        col, row = pi_ % NCOL, pi_ // NCOL
        x0 = PAD + col * (COLW + GUT)
        y0 = HEADER_H + row * (LANE_H * n_rows + SUB_H + SUB_H) + SUB_H
        L.append(f'<text x="{x0}" y="{y0 - 6}" fill="{INK}" font-size="14">{esc(title)}</text>')
        L.append(f'<rect x="{x0}" y="{y0 - 2}" width="{COLW}" height="1" fill="{GRID}"/>')
        have = sorted([r for r in rows if r[1] is not None], key=lambda r: r[1])
        missing = [r for r in rows if r[1] is None]
        maxv = max([r[1] for r in have] or [1])
        bx = x0 + LANE_LABEL
        bw = COLW - LANE_LABEL - 78
        for i, (label, v, is_fox) in enumerate(have + missing):
            y = y0 + i * LANE_H
            medal = {0: "\U0001F947", 1: "\U0001F948", 2: "\U0001F949"}.get(i, "") if v is not None else ""
            label_col = ACC if is_fox else (INK if v is not None and i < 3 else MUT)
            L.append(f'<text x="{x0}" y="{y + 14}" fill="{label_col}" font-size="12">{esc(label[:19]):<19}</text>' if False else
                     f'<text x="{x0}" y="{y + 14}" fill="{label_col}" font-size="12">{esc(label[:19])}</text>')
            if v is None:
                L.append(f'<rect x="{bx}" y="{y + 2}" width="{bw}" height="14" rx="3" fill="{BAR_NA}"/>')
                L.append(f'<text x="{bx + 8}" y="{y + 13}" fill="{MUT}" font-size="10">n/a</text>')
            else:
                w = max(4, (v / maxv) * bw)
                fill = ACC if is_fox else BAR
                L.append(f'<rect x="{bx}" y="{y + 2}" width="{w:.0f}" height="14" rx="3" fill="{fill}"/>')
                vt = f"{fmt(v)} {unit}"
                L.append(f'<text x="{bx + bw + 6}" y="{y + 13}" fill="{INK if is_fox else MUT}" font-size="11">{medal}{esc(vt)}</text>')
        if subtitle:
            L.append(f'<text x="{x0}" y="{y0 + LANE_H * n_rows + 12}" fill="{MUT}" font-size="10">{esc(subtitle)}</text>')
    L.append(f'<text x="{PAD}" y="{H - 12}" fill="{MUT}" font-size="10">lower is better on every lane · medals mark the top 3 · fox-agent in orange · full method + raw numbers in bench/table.md</text>')
    L.append("</svg>")
    with open(out_path, "w") as f:
        f.write("\n".join(L) + "\n")


def fmt_ms(v):
    return f"{v:,.0f}" if v >= 100 else f"{v:.1f}"


def percentile(sorted_samples, p):
    """p-th percentile (0-100) of an ALREADY-SORTED list; None when empty.

    Nearest-rank: the smallest value at or below the p fraction. p50 is the
    median (typical experience), p95 the tail (the slow run a user notices).
    """
    if not sorted_samples:
        return None
    k = max(0, min(len(sorted_samples) - 1, int(round((p / 100) * (len(sorted_samples) - 1)))))
    return sorted_samples[k]


def stat_block(samples):
    """Collapse a list of timings into {min, p50, p95} (best, typical, tail).

    Reporting only best-of-N hid variance: two tools with the same best-of-3
    can feel very different if one is consistent and the other occasionally
    triples. min stays the floor; p50/p95 are what a user actually feels.
    None only when there were no samples at all (probe never landed).
    """
    if not samples:
        return None, None, None
    s = sorted(samples)
    return s[0], percentile(s, 50), percentile(s, 95)


def measure(label, path, n_start, n_probes, n_input):
    step(label, "probing version")
    ver = version_of(path)
    step(label, "measuring on-disk footprint", os.path.basename(path))
    disk, kind = footprint(path, label)
    step(label, f"timing `--version` startup (best of {n_start})")
    startup = best_startup(path, n_start, ver=ver)  # reuse ver: no extra spawn
    step(label, f"timing TUI first byte (best of {n_probes} PTY launches)")
    ttfb = tui_first_byte(path, n_probes)
    step(label, f"timing time-to-interactive (best of {n_input} PTY launches)")
    tfin, fi_signal = tui_first_input(path, label, n_input)
    step(label, f"timing input latency (ready + 500ms settle, best of {n_input})")
    latency, la_signal = tui_input_latency(path, label, probes=n_input)
    step(label, "measuring idle memory (PSS)")
    pss_detail = idle_pss_detail(path)
    pss = pss_detail["tree_mb"] if pss_detail else None
    su_min, su_p50, su_p95 = stat_block(startup)
    fb_min, fb_p50, fb_p95 = stat_block(ttfb)
    fi_min, fi_p50, fi_p95 = stat_block(tfin)
    la_min, la_p50, la_p95 = stat_block(latency)
    row = {
        "agent": label,
        "installed": True,
        "bin": path,
        "version": ver,
        # full precision in the JSON; the md table and SVG round for display
        "disk_mb": disk,
        "disk_kind": kind,
        # legacy single-value fields stay the best (floor) so existing readers
        # keep working; the _min/_p50/_p95 triples carry the full distribution
        "startup_ms": su_min,
        "tui_first_byte_ms": fb_min,
        "tui_first_input_ms": fi_min,
        "tui_input_latency_ms": la_min,
        "startup": {"min": su_min, "p50": su_p50, "p95": su_p95, "n": len(startup)},
        "tui_first_byte": {"min": fb_min, "p50": fb_p50, "p95": fb_p95, "n": len(ttfb)},
        "tui_first_input": {"min": fi_min, "p50": fi_p50, "p95": fi_p95, "n": len(tfin)},
        "tui_input_latency": {"min": la_min, "p50": la_p50, "p95": la_p95, "n": len(latency)},
        # How the number was obtained. "kernel-echo" means the tty line
        # discipline echoed the byte before the app woke, so the figure says
        # nothing about the tool's own rendering; "render" means the app was in
        # raw mode and had to repaint a cell itself; "log-marker" means a tool
        # that swallows echo logged its own ack. Comparing across these is not
        # meaningful, which is why the table groups them instead of ranking
        # every tool in one column.
        "input_signal": la_signal or fi_signal,
        "idle_pss_mb": pss,
        # Breakdown behind idle_pss_mb. tree_mb counts the whole process tree
        # (children included: a node CLI's workers hold real, user-paid memory),
        # root_mb is the launched process alone, procs is how many contributed.
        # tree_mb == root_mb for a single-process native binary. Kept in the
        # JSON because "which of these numbers moved" is the first question
        # asked when a refresh looks wrong.
        "idle_pss_root_mb": pss_detail["root_mb"] if pss_detail else None,
        "idle_pss_procs": pss_detail["procs"] if pss_detail else None,
    }
    def _t(a, b, c):
        return "-" if a is None else f"{a:.0f}/{b:.0f}/{c:.0f}"
    # pss is None when the tool never reported one (no /proc/smaps_rollup, or
    # the process died before the read) — format it like the others, not with a
    # bare :.1f that raised TypeError on the first n/a tool
    print(
        f"{label}: {ver} disk={disk:.1f}MB({kind}) "
        f"startup[min/p50/p95]={_t(su_min, su_p50, su_p95)} "
        f"ttfb={_t(fb_min, fb_p50, fb_p95)} "
        f"tfin={_t(fi_min, fi_p50, fi_p95)} "
        f"latency={_t(la_min, la_p50, la_p95)} pss={'-' if pss is None else f'{pss:.1f}MB'}"
    )
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


def self_test():
    """Regression checks for the footprint logic — no network, no tools needed.

    Written because a single unconditional lookup silently reported ONE tool's
    140MB downloader as thirteen unrelated vendors' footprint (including aider,
    which is Python). The tell was thirteen byte-identical sizes; the check here
    is the direct one: only the owning tool may claim a downloader.
    """
    import tempfile

    fails = []

    def check(name, cond, detail=""):
        if cond:
            print(f"  ok   {name}")
        else:
            print(f"  FAIL {name} {detail}")
            fails.append(name)

    with tempfile.TemporaryDirectory() as tmp:
        home = os.path.join(tmp, "home")
        # a fake first-run download for codebuff only
        manicode = os.path.join(home, ".config", "manicode")
        os.makedirs(manicode)
        dl = os.path.join(manicode, "codebuff")
        with open(dl, "wb") as f:
            f.write(b"\x00" * 4096)

        # two unrelated npm-style shims, each in its own package dir
        shims = {}
        for pkg in ("codex", "aider"):
            d = os.path.join(tmp, "npm", "lib", "node_modules", pkg)
            os.makedirs(os.path.join(d, "bin"))
            with open(os.path.join(d, "package.json"), "w") as f:
                f.write('{"name": "%s"}' % pkg)
            p = os.path.join(d, "bin", pkg)
            with open(p, "w") as f:
                f.write("#!/usr/bin/env node\n")
            os.chmod(p, 0o755)
            shims[pkg] = p

        old_home = os.environ.get("HOME")
        os.environ["HOME"] = home
        try:
            # the bug: these inherited codebuff's size when the lookup was global
            for pkg, p in shims.items():
                mb, kind = footprint(p, pkg)
                check(
                    f"{pkg} does not inherit codebuff's downloader",
                    mb < 1.0 and kind in ("pkg", "app"),
                    f"got {mb:.1f} MB kind={kind}",
                )
            # ...and only the owner claims it
            mb, kind = footprint(shims["codex"], "codebuff")
            check("codebuff claims its downloader", mb > 0 and kind == "bin", f"got {mb:.1f} MB kind={kind}")
            # an unknown label gets no downloader, not someone else's
            mb2, _ = footprint(shims["aider"], "not-a-real-tool")
            check("an unknown label claims nothing", mb2 < 1.0, f"got {mb2:.1f} MB")
        finally:
            if old_home is None:
                os.environ.pop("HOME", None)
            else:
                os.environ["HOME"] = old_home

    if fails:
        print(f"\nself-test FAILED ({len(fails)})")
        return 1

    # --- tmux measurement primitives ------------------------------------
    # These check the metric's wiring, not tmux itself: the properties that
    # produced wrong published numbers when they were absent.
    if _tmux_ready():
        name = _session_run("/bin/sh")
        if name and _pane_alive(name):
            check("tmux: session starts and reports a pane pid", _pane_pid(name) is not None)
            check("tmux: pane tty is readable (echo-mode source)", _pane_tty(name) is not None)
            _sig = _echo_mode(name)
            check("tmux: echo mode classifies", _sig in ("kernel-echo", "render"), str(_sig))
            _session_kill(name)
        else:
            check("tmux: session starts", False, "could not create a session")

        # A probe split across a wrapped row must still be found: -J joins the
        # lines the terminal wrapped, which is what the old byte matcher missed.
        name = _session_run("/bin/sh")
        if name:
            _send(name, "printf 'hello")
            _send(name, "bench\\n'")
            _tmux("send-keys", "-t", name, "Enter")
            time.sleep(0.4)
            check("tmux: wrapped probe is found via capture-pane", PROBE_TEXT in _pane_text(name))
            _session_kill(name)
    else:
        print("  skip tmux checks (tmux not installed)")

    if fails:
        print(f"\nself-test FAILED ({len(fails)})")
        return 1
    print("\nself-test ok")
    return 0


def main():
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    quick = "--quick" in sys.argv
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else os.path.join(ROOT, "bench")
    os.makedirs(out, exist_ok=True)

    n_start = 2 if quick else 4
    n_probes = 2 if quick else 5
    # first-input is slower per probe (full launch + typing + echo wait)
    n_input = 2 if quick else 3

    rows = []
    n_tools = len(AGENTS) + len(OPENCODE_BINS)
    for i, (label, bins) in enumerate(AGENTS):
        path = which(bins)
        step(label, f"[{i+1}/{n_tools}] locating", " ".join(bins))
        if not path:
            rows.append({"agent": label, "installed": False})
            print(f"{label}: not installed", flush=True)
            continue
        rows.append(measure(label, path, n_start, n_probes, n_input))
        print(flush=True)  # end the \r progress line for this tool

    # opencode v2: fixed binary name `opencode2`. (The loop stays generic so a
    # future bare-`opencode` fallback can be re-added as another tuple entry.)
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
    for want in ("opencode v2",):
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
    fox_extra["method"] = "headless `fox -p … --json` vs scripted local provider; RSS via /usr/bin/time -v; TUI bytes via PTY; TUI input = spawn→quiet→typed→echo on screen (log marker where echo is suppressed); input latency = ready (alive+quiet)→500ms→typed→echo, timing the keystroke round-trip only"

    import platform

    payload = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "machine": f"{platform.system()} {platform.machine()} ({platform.release()})",
        "method": (
            "best of 4 `--version` runs; best of 5 PTY launches (no args) to first output byte; "
            "best of 3 PTY launches measuring time-to-interactive since spawn (TUI alive+quiet, then "
            "probe typed → the probe TEXT rendered on screen after ANSI stripping; log marker where a "
            "tool suppresses echo); "
            "best of 3 PTY launches measuring input latency (ready = alive+quiet, then a 500ms "
            "settle, probe typed → probe TEXT rendered; the clock starts at the keystroke, so startup "
            "cost is removed). Both input metrics wait for the probe text itself, never for the first "
            "byte: a TUI emits cursor-control bytes before compositing its frame, and a periodic status "
            "repaint can land after a keystroke, so 'first output' measured neither. Each row carries "
            "input_signal: termios ECHO is read through the PTY master to say whether the tty echoed for "
            "the tool (kernel-echo — no UI required, `cat` times ~0.3ms) or the tool disabled echo and "
            "had to render the cell itself (render). Kernel-echo and render numbers are NOT comparable "
            "and are ranked separately. "
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

    render_outputs(out, rows, fox_extra, payload)
    print("wrote", out)


# One entry per metric lane: (key, column label, unit, formatter). Order is the
# order the README summary lists them in — the headline metric first. The
# optional 5th item restricts the ranking pool to a comparable signal class;
# input latency needs it because kernel-echo tools are not racing the same
# event as a raw-mode TUI (see _echo_mode).
METRICS = [
    ("tui_first_byte_ms", "TUI 1st byte", "ms", lambda v: f"{v:.0f} ms", None),
    ("tui_first_input_ms", "TUI 1st input", "ms", lambda v: f"{v:.0f} ms", None),
    ("tui_input_latency_ms", "input latency", "ms", lambda v: f"{v:.0f} ms", "render"),
    ("disk_mb", "bundle", "MB", lambda v: f"{v:.0f} MB", None),
    ("idle_pss_mb", "idle PSS", "MB", lambda v: f"{v:.0f} MB", None),
    ("startup_ms", "`--version`", "ms", lambda v: f"{v:.0f} ms", None),
]


def rank_of(rows, key, fox_name="fox-agent", only=None):
    """fox's position for one metric plus how many tools the field has.

    Ties count as the same rank (1 + number of strictly better tools), which
    matters for the metrics where several tools report 0 ms. Anything not
    installed or not measured is excluded rather than ranked last — an n/a row
    is not a slow one.

    `only` restricts the field to rows whose `input_signal` matches. Input
    latency needs it: a tool whose tty echoes for it (kernel-echo) is not
    racing the same event as a raw-mode TUI, so ranking them together is
    meaningless — see _echo_mode().
    """
    pool = [r for r in rows if only is None or r.get("input_signal") == only]
    vals = [(r["agent"], r[key]) for r in pool if r.get(key) is not None]
    fox = next((v for a, v in vals if a == fox_name), None)
    if fox is None:
        return None, len(vals)
    return 1 + sum(1 for _, v in vals if v < fox), len(vals)


def render_outputs(out, rows, fox_extra, payload):
    """Write every generated artifact from already-measured rows.

    Split out of main() so the generated artifacts are one pure function of
    the measured rows: results.json is written first, then every rendered
    artifact derives from it — nothing is ever rendered from a number that was
    not just measured.
    """
    # expandable dashboard: 3 columns x 2 rows of metric lanes, one <details>
    # per lane so the README can show the headline graphs and tuck the rest
    # behind a click. Full numbers live in table.md regardless.
    is_fox = lambda r: r["agent"] == "fox-agent"  # noqa: E731
    # Input latency is only comparable between tools that had to RENDER their
    # echo. A cooked-mode tool has the tty line discipline echo the byte before
    # it wakes (measured: `cat` in a PTY times ~0.3ms with no UI whatsoever), so
    # its number describes the kernel, not the tool. Putting both kinds in one
    # ranked column is what made a pile of CLI wrappers look an order of
    # magnitude faster than a hand-tuned TUI. Only "render" rows are charted;
    # the rest stay in the JSON with their signal labelled.
    render_only = [r for r in rows if r.get("input_signal") == "render"]
    excluded = len(rows) - len(render_only)

    dashboard_svg(
        [
            (
                "time to first char — TUI launch",
                "PTY launch, no args, to first output byte · best of 5 · lower is better",
                [(r["agent"], r.get("tui_first_byte_ms"), is_fox(r)) for r in rows],
                "ms",
                fmt_ms,
            ),
            (
                "time to first input (since startup)",
                "spawn → TUI quiet → probe typed → echo on screen · best of 3 · lower is better",
                [(r["agent"], r.get("tui_first_input_ms"), is_fox(r)) for r in rows],
                "ms",
                fmt_ms,
            ),
            (
                "input latency (render only)",
                f"launch, wait ready, 500ms, type probe, time until probe text is on screen · best of 3 · lower is better · {excluded} tool(s) excluded: their tty echoes for them (kernel-echo, not a render)",
                [(r["agent"], r.get("tui_input_latency_ms"), is_fox(r)) for r in render_only],
                "ms",
                fmt_ms,
            ),
            (
                "bundle size",
                "binary, or package dir for script CLIs · lower is better",
                [(r["agent"], r.get("disk_mb"), is_fox(r)) for r in rows],
                "MB",
                lambda v: f"{v:.0f}",
            ),
            (
                "idle memory — TUI at rest",
                "PSS after 1.5s idle, before any model traffic · lower is better",
                [(r["agent"], r.get("idle_pss_mb"), is_fox(r)) for r in rows],
                "MB",
                lambda v: f"{v:.0f}",
            ),
            (
                "`--version` (harness floor)",
                "best of 4 · reference only, several tools short-circuit this before loading their bundle",
                [(r["agent"], r.get("startup_ms"), is_fox(r)) for r in rows],
                "ms",
                fmt_ms,
            ),
        ],
        os.path.join(out, "bench.svg"),
    )

    # markdown table — EVERY collected field at full precision. The README
    # snapshot trims to a headline subset; this is the complete record.
    def cell(v, unit="", nd=1):
        if v is None:
            return "—"
        return f"{v:.{nd}f}{unit}"

    T = [
        "| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency (ms) | signal | idle PSS (MB) |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        if not r.get("installed"):
            T.append(f"| {r['agent']} | n/a (not installed) | — | — | — | — | — | — | — | — | — |")
            continue
        name = f"**{r['agent']}**" if r["agent"] == "fox-agent" else r["agent"]
        T.append(
            f"| {name} | {r['version']} | `{r['bin']}` | {cell(r.get('disk_mb'))} | {r.get('disk_kind','—')} | "
            f"{cell(r.get('startup_ms'))} | {cell(r.get('tui_first_byte_ms'))} | {cell(r.get('tui_first_input_ms'))} | "
            f"{cell(r.get('tui_input_latency_ms'))} | {r.get('input_signal') or '—'} | {cell(r.get('idle_pss_mb'))} |"
        )
    table_md = "\n".join(T) + "\n"
    with open(os.path.join(out, "table.md"), "w") as f:
        f.write(table_md)

    # README snapshot block: the bench workflow splices this between
    # <!-- bench:start --> and <!-- bench:end --> so the top-of-README numbers
    # refresh with every run instead of going stale.
    #
    # Default view = one row per metric: fox-agent's absolute score and its
    # rank in the field. Anything a reader has to do arithmetic on (or scroll
    # sideways through 23 competitor rows to interpret) is behind a fold. The
    # per-agent grid, the dashboard SVG and the full-precision record are all
    # still generated and still one click away.
    HT = [
        "| metric | fox-agent | rank |",
        "|---|---|---|",
    ]
    for key, label, unit, fmt, only in METRICS:
        fox_row = next((r for r in rows if r["agent"] == "fox-agent"), None)
        val = fox_row.get(key) if fox_row else None
        rank, field = rank_of(rows, key, only=only)
        if val is None:
            HT.append(f"| {label} | — | — |")
            continue
        rank_s = f"**#{rank}** of {field}" if rank is not None else f"of {field}"
        HT.append(f"| {label} | **{fmt(val)}** | {rank_s} |")
    summary_md = "\n".join(HT)

    # Rounded per-agent grid, folded: the reference view for "where does tool X
    # land", which nobody needs before they have decided to care.
    GT = [
        "| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency | signal | idle PSS |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        if not r.get("installed"):
            GT.append(f"| {r['agent']} | — | — | — | — | — | — | — |")
            continue
        name = f"**{r['agent']}**" if r["agent"] == "fox-agent" else r["agent"]
        disk = f"{r['disk_mb']:.0f} MB" if r.get("disk_mb") is not None else "—"
        st = f"{r['startup_ms']:.0f} ms" if r.get("startup_ms") is not None else "—"
        tb = f"{r['tui_first_byte_ms']:.0f} ms" if r.get("tui_first_byte_ms") is not None else "—"
        ti = f"{r['tui_first_input_ms']:.0f} ms" if r.get("tui_first_input_ms") is not None else "—"
        la = f"{r['tui_input_latency_ms']:.0f} ms" if r.get("tui_input_latency_ms") is not None else "—"
        # kernel-echo rows are marked so nobody compares them to a render number
        sig = r.get("input_signal") or "—"
        if sig == "kernel-echo":
            sig = "kernel-echo (tty)"
        pss = f"{r['idle_pss_mb']:.0f} MB" if r.get("idle_pss_mb") is not None else "—"
        GT.append(f"| {name} | {disk} | {st} | {tb} | {ti} | {la} | {sig} | {pss} |")
    grid_md = "\n".join(GT)

    S = [
        summary_md,
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
    S += [
        f"<details><summary>every tool, every metric</summary>",
        "",
        "![harness bench dashboard](bench/bench.svg)",
        "",
        grid_md,
        "",
        "</details>",
        "",
        "<details><summary>full precision · all collected fields</summary>",
        "",
        table_md.rstrip(),
        "",
        "</details>",
        "",
    ]
    S.append(
        f"_Generated {payload['generated']} on {payload['machine']}. "
        f"[Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_"
    )
    with open(os.path.join(out, "snippet.md"), "w") as f:
        f.write("\n".join(S) + "\n")


if __name__ == "__main__":
    main()

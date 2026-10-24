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
import fcntl
import os
import pty
import re
import select
import shlex
import shutil
import signal
import struct
import subprocess
import sys
import tempfile
import termios
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from screen import Screen  # noqa: E402  (terminal grid: what is actually on screen)




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
    ("goose", ["goose"]),
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
            pid, fd = _spawn_tui(path)
        except OSError:
            return None
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
    return samples


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
    # comm may contain spaces/parens and is the only parenthesised field
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

    Summing is the honest accounting for a CLI's footprint: a node-based tool
    spawns workers that hold real, user-visible memory, and reporting only the
    launcher understates it by 2-8x (measured: kilo 46->353MB, copilot 47->303).

    Summing PSS does NOT double-count shared memory — the kernel divides each
    shared page's PSS among the processes mapping it, so a fork with inherited
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

    Two things had to be right, and each was wrong in an earlier attempt:

    1. THE TREE, not the root. Node-based CLIs run the real UI in children, so
       root-only under-reported their footprint by 2-8x. Memory a child holds is
       memory the user paid for, so it counts.

    2. A SETTLED, REPRODUCIBLE instant — not a fixed one and not a single
       convergence. A CLI's tree at t=1.5s can include short-lived startup work
       (indexing, version probes, telemetry, MCP boot).

    Why "wait until it stops changing" alone was still not enough: periodic work
    (a poll, a watch, a spinner-driven child) can hold a stable but INFLATED
    tree — the total stops moving while the extra processes are still there. And
    whether a transient child happens to survive the settle window is luck.
    Measured across three launches of the same binaries, that produced spreads of
    41% (opencode), 46% (kimi) and 134% (jcode, procs=[3,1,1]).

    The property that makes this measurable: extra processes only ever ADD. Two
    launches can disagree about whether a transient child existed, but neither
    can invent memory the tool does not hold. So the resting footprint is the
    FLOOR over a few launches — the reading taken when the least startup work
    happened to be in flight. That is stable, and it is the number a user sees
    once the tool has finished booting.
    """
    detail = idle_pss_detail(path, settle=settle, budget_s=budget_s, quiet_reads=quiet_reads)
    return detail["tree_mb"] if detail else None


def idle_pss_detail(path, settle=1.5, budget_s=8.0, quiet_reads=3, launches=3):
    """Resting {root_mb, tree_mb, procs, reads} for one tool, or None.

    Runs up to `launches` fresh processes and keeps the FLOOR of the tree total
    (see idle_pss for why the floor is the honest resting figure). The winning
    launch's root/procs are reported alongside so the JSON explains the number.
    """
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
    try:
        pid, fd = _spawn_tui(path)
    except OSError:
        return None

    try:
        time.sleep(settle)
        deadline = time.perf_counter() + budget_s
        last = None
        stable = 0
        reads = 0
        best = None
        while time.perf_counter() < deadline:
            tree, nprocs = _pss_tree(pid)
            reads += 1
            if tree is None:
                if not _alive(pid):
                    break
                time.sleep(0.2)
                continue
            best = (tree, nprocs)
            # converged when the tree total stops moving. 2MB of jitter is
            # allocator noise, not a change in what the tool holds.
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
        root = _pss_of(pid)
        return {
            "root_mb": root,
            "tree_mb": best[0],
            "procs": best[1],
            "reads": reads,
        }
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


# `ANSI_RE` used to live here: it stripped control traffic so the probe could
# be matched against the remaining bytes. That approach is gone — a cell-diffing
# TUI never emits the probe as one contiguous run, and a wrapped input box
# splits it across rows. `screen.py` parses the stream into a character grid and
# the probe is searched there instead, which is the only thing "did my typing
# appear" ever meant. Kept as a note so the idea is not reintroduced.


def _spawn_tui(path, rows=40, cols=120):
    """Fork a PTY with a REAL window size, and return (pid, fd).

    `pty.fork()` gives the child a 0x0 terminal. Every full-screen TUI queries
    TIOCGWINSZ before drawing, so a 0x0 window makes it collapse or skip its
    input box entirely — measured on jcode: 928 bytes of output at 0x0 versus
    6229 bytes at 40x120. The probe then has nowhere to appear, which is exactly
    the set of tools that reported n/a.

    The trust prompt is the other half: fox-agent (and the trust-gated flow it
    models) asks "Do you trust this folder?" on an interactive start and waits
    for a keypress. In a bench temp dir that swallows the probe, so fox-agent
    itself scored n/a. `shouldSkipTrustCheck` in src/core/trust.ts exists for
    exactly this ("never prompt in scripts/tests"), so the bench opts out.
    """
    pid, fd = pty.fork()
    if pid == 0:
        os.environ["TERM"] = "xterm-256color"
        os.environ.setdefault("FOX_AGENT_NO_TRUST_CHECK", "1")
        try:
            os.execv(path, [path])
        except Exception:
            os._exit(127)
    try:
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    except OSError:
        pass
    return pid, fd


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


def _await_quiet(fd, budget_s):
    """Drain until the TUI goes quiet (ready to read keys) or budget expires.

    Polls in ~120ms slices and stops after a few consecutive slices with nothing
    to read — a quiet app finishes in well under a second instead of blocking for
    the whole budget. A spinner that never goes quiet exhausts the budget and is
    typed into anyway; the retype round in the caller catches swallowed keys, so
    worst case is a slower number, not a wrong one.
    """
    deadline = time.perf_counter() + budget_s
    quiet_streak = 0
    while time.perf_counter() < deadline:
        slice_left = max(0.0, min(0.12, deadline - time.perf_counter()))
        r, _, _ = select.select([fd], [], [], slice_left)
        if not r:
            quiet_streak += 1
            if quiet_streak >= 3:  # ~3 quiet slices ≈ settled
                break
            continue
        quiet_streak = 0
        try:
            if not os.read(fd, 65536):
                break
        except OSError:
            break


def _echo_mode(fd):
    """Whether the terminal's line discipline is echoing for this process.

    This is the one OBJECTIVE way to tell the two kinds of "input latency"
    apart, and the bench conflated them before:

      ECHO on (cooked mode)  the tty driver mirrors each byte back before the
                             app wakes. A CLI with no UI at all measures here —
                             `cat` in a PTY times ~0.1-0.2ms. That number says
                             nothing about the app.
      ECHO off (raw mode)    a full-screen TUI disables echo and must redraw a
                             cell itself. This is real input handling.

    Ranking the two in one column compares "the kernel echoed for me" against
    "the app repainted" — which is why a pile of tools appeared to beat a
    hand-tuned TUI by an order of magnitude. Reading the slave's termios through
    the master is reliable on Linux PTYs.
    """
    try:
        lflag = termios.tcgetattr(fd)[3]
    except (termios.error, OSError):
        return None
    return "kernel-echo" if lflag & termios.ECHO else "render"


def _await_echo(fd, t0, budget, logf, cfg):
    """Type PROBE_TEXT and wait until it is actually VISIBLE, not merely until
    the PTY twitches. Returns (ms from t0, signal) or (None, None).

    `budget` is a DURATION in seconds, not an absolute deadline, and it starts
    at the keystroke. That distinction is load-bearing: readiness (first output
    plus a quiet settle) can legitimately consume most of a caller's patience on
    a slow runner, and an absolute deadline computed from spawn then expired
    before the tool had any chance to draw -- which is what silently turned 15
    working tools into n/a rows.

    The old version returned on the first output chunk after a quiet baseline.
    That is wrong for a TUI for two reasons:

      1. The first chunk after a keystroke is often not the render. fox emits a
         6-byte `\\e[?25l` (cursor hide) BEFORE compositing the frame, so the
         old metric timed cursor bookkeeping. With the paint timer forced to
         200ms the old number still read ~3ms — proof it was not the render.
      2. A periodic status repaint that happens to land after the keystroke was
         accepted as the answer. Measured on fox: 0 of 6 probes contained the
         typed text; all 6 were status ticks.

    So: feed everything since the keystroke into a terminal grid (see
    screen.py) and stop only when the probe text reads out of that grid. That is
    what a person perceives as their input appearing, and it is the same
    expression for both metrics (t0 = spawn for first_input, t0 = keystroke for
    latency).

    Up to two typing rounds: a tool still starting up may swallow early
    keystrokes, and the honest number is "how long until my input renders", not
    n/a. A tool that never renders still times out honestly.
    """
    probe = PROBE_TEXT.encode()
    for attempt in (1, 2):
        if attempt == 2:
            # one flush of late startup output before retyping; its own small
            # budget, never the (possibly already spent) probe budget
            quiet_end = time.perf_counter() + 1.0
            while time.perf_counter() < quiet_end:
                r, _, _ = select.select([fd], [], [], max(0, quiet_end - time.perf_counter()))
                if not r:
                    break
                try:
                    if not os.read(fd, 65536):
                        break
                except OSError:
                    break
        try:
            os.write(fd, probe)
        except OSError:
            return None, None
        # Everything received since the keystroke is parsed into a character
        # grid; the probe counts as landed only when it reads out of the GRID.
        # Matching literal bytes was wrong three ways: a cell-diffing TUI never
        # emits the probe as one contiguous run (jcode redraws with cursor
        # moves), a wrapped input box splits it across rows, and escape traffic
        # can interleave between its characters. The grid resolves all three to
        # their visible result -- which is what a person judges.
        screen = Screen()
        # The wait budget starts when the probe was TYPED, not when the process
        # was spawned: readiness (output + quiet) can legitimately consume most
        # of `budget` on a slow runner, and inheriting a spawn-relative deadline
        # made the loop expire before the tool had a chance to draw anything.
        probe_deadline = time.perf_counter() + budget
        while time.perf_counter() < probe_deadline:
            if logf is not None:
                try:
                    chunk = logf.read()
                except OSError:
                    break
                if chunk:
                    if re.search(cfg["marker"], chunk.decode("utf-8", "replace")):
                        return time.perf_counter() - t0, "log-marker"
                time.sleep(0.2)
                continue
            r, _, _ = select.select([fd], [], [], max(0, probe_deadline - time.perf_counter()))
            if not r:
                continue
            try:
                data = os.read(fd, 65536)
            except OSError:
                break
            if not data:
                # EOF on the PTY master: the child exited (a tool that prints
                # "not a terminal" and quits does this). The result is the same
                # n/a, just reached in ms instead of waiting out the full
                # timeout — this is what devin/cline/continue hit every probe.
                dbg("echo: child closed PTY (exited) — abandoning probe early")
                return None, None
            screen.feed(data)
            if screen.contains(probe):
                return time.perf_counter() - t0, "drained"
    return None, None


def tui_first_input(path, label, probes=3, timeout=15):
    """Time to interactive since startup: launch, wait until the TUI is alive
    AND quiet (typing into a process still starting up proves nothing), type a
    probe, and measure from process spawn to the probe text appearing on screen.

    This is the real "how long until I can use it" figure — from launch, not
    from the first typed byte. Best of N; None when the probe never appears (a
    tool that never echoes honestly reports n/a rather than a number).
    """
    cfg = INPUT_MARKERS.get(label)
    samples = []
    signal_kind = None
    for _ in range(probes):
        try:
            pid, fd = _spawn_tui(path)
        except OSError:
            return None, None
        logf = None
        try:
            start = time.perf_counter()
            if _wait_output(fd, 15) is None:
                continue
            _await_quiet(fd, budget_s=6.0)
            if cfg:
                try:
                    logf = open(os.path.expanduser(cfg["log"]), "rb")
                    logf.seek(0, os.SEEK_END)
                except OSError:
                    logf = None
            # Classify BEFORE typing, but only after the mode stops changing: a
            # TUI that boots cooked and switches to raw would otherwise be
            # labelled kernel-echo and its number would describe the kernel.
            # See _await_stable_mode.
            if signal_kind is None:
                signal_kind = _await_stable_mode(fd)
            hit, via = _await_echo(fd, start, timeout, logf, cfg)
            if hit is not None:
                samples.append(hit * 1000)
                if via == "log-marker":
                    signal_kind = "log-marker"
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
    return samples, signal_kind


def _alive(pid):
    """True if the child is still running (used to distinguish a silent tool
    from a tool that exited during startup)."""
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def _await_stable_mode(fd, budget_s=6.0, need_stable=3):
    """Wait until the line discipline stops changing, then report its mode.

    Sampling ECHO once is not enough. Several TUIs boot in COOKED mode and only
    switch to raw when their UI takes over — measured, same machine, ECHO bit
    sampled at 0.5/1.5/3.0/5.0s:

        jcode    ON  ON  off off
        pi-bolt  ON  ON  off off
        fox      off off off off
        cat      ON  ON  ON  ON

    Reading it early therefore labelled a real TUI `kernel-echo`, measured the
    kernel's own echo instead of the app's render, and produced numbers an order
    of magnitude too fast.

    NOTE: "stable for a few samples" is NOT sufficient, which is why this keeps
    the longer-window check below. kimi stays cooked for ~2.8s before switching,
    so a short stability window reported `kernel-echo` for it and the answer
    still depended on timing.
    """
    return _classify_mode(fd, budget_s=budget_s, need_stable=need_stable)


def _classify_mode(fd, budget_s=6.0, need_stable=3):
    """Decide whether this tool will read raw keys, by watching for the switch.

    The question the metric actually asks is "does the app render my typing, or
    does the kernel echo it for them?" — and the honest way to answer that is to
    watch the transition rather than sample a state:

      * ECHO turns OFF at any point during boot  -> the tool took the terminal
        into raw mode and redraws its own cells: `render`.
      * ECHO stays ON for the whole boot window  -> a cooked-mode CLI that never
        takes raw control (`cat`, a plain REPL): `kernel-echo`.

    Boot windows measured on this machine: jcode ~2.5s, pi-bolt ~2.5s,
    kimi ~2.8s, fox immediate. The window below covers those with margin. The
    stable-mode short-circuit is kept for the common case (a tool that is
    already raw when we look), so the full window is only ever paid by tools
    that genuinely stay cooked.
    """
    deadline = time.perf_counter() + budget_s
    saw_on = False
    last = None
    while time.perf_counter() < deadline:
        # DRAIN while polling. A TUI that keeps painting while we watch will
        # fill the PTY buffer (~64KB) and block on its next write — and a
        # process blocked mid-startup never reaches the code that switches the
        # terminal to raw mode. Then the loop records `kernel-echo` forever
        # because it starved the very transition it was waiting for. Reading is
        # what keeps the tool running.
        r, _, _ = select.select([fd], [], [], 0.1)
        if r:
            try:
                if not os.read(fd, 65536):
                    break
            except OSError:
                break
        cur = _echo_mode(fd)
        if cur == "render":
            return "render"  # took raw mode: the app owns the echo
        if cur == "kernel-echo":
            saw_on = True
        last = cur
    return "kernel-echo" if saw_on else (last or None)


def tui_input_latency(path, label, settle_s=0.5, probes=3, timeout=15):
    """Input latency once the TUI is interactive: launch, wait until it is alive
    AND quiet (the same readiness tui_first_input measures, but WITHOUT typing
    into it), wait `settle_s`, then type a probe and time how fast it renders.

    Why readiness-then-a-beat, rather than a fixed wall-clock settle: a fixed
    settle starts counting at the wrong moment for a slow tool. Two seconds
    after the first byte is not "the app is up" — it is an arbitrary instant
    that may still be mid-startup for a heavy TUI, so the number measured
    input latency on a not-yet-interactive process. Anchoring on the same
    quiet signal tui_first_input uses makes "ready" mean the same thing in both
    figures, and the short settle on top absorbs the last repaint so the
    keystroke lands on a settled screen. Isolates input handling from startup:
    the clock starts at the keystroke, never at spawn.
    """
    cfg = INPUT_MARKERS.get(label)
    samples = []
    signal_kind = None
    for _ in range(probes):
        try:
            pid, fd = _spawn_tui(path)
        except OSError:
            return None, None
        logf = None
        try:
            # A silent cooked-mode CLI (cat, a bare REPL) emits nothing at
            # startup, so requiring output would skip it entirely and report
            # n/a. Alive-but-silent is a valid ready state; only a child that
            # has already exited is unmeasurable. Short first wait: a full-screen
            # TUI paints within it, and a silent CLI then proves itself alive
            # instead of costing the whole 15s budget.
            if _wait_output(fd, 2.0) is None and not _alive(pid):
                continue
            # Ready == alive AND quiet, the same signal tui_first_input waits on.
            # Nothing is typed during readiness, so the probe cannot be swallowed
            # by a still-starting process.
            _await_quiet(fd, budget_s=6.0)
            # ...then one short beat, so the keystroke hits a settled screen
            # rather than the tail of the startup repaint.
            time.sleep(settle_s)
            if cfg:
                try:
                    logf = open(os.path.expanduser(cfg["log"]), "rb")
                    logf.seek(0, os.SEEK_END)
                except OSError:
                    logf = None
            # Classify BEFORE the clock starts. Waiting for the mode to settle is
            # startup observation, not the keystroke round-trip, and running it
            # inside the timed window charged the whole wait to the measurement
            # (`cat` read 3007ms instead of ~0.3ms — half the 6s mode budget).
            if signal_kind is None:
                signal_kind = _await_stable_mode(fd)
            t0 = time.perf_counter()
            hit, via = _await_echo(fd, t0, timeout, logf, cfg)
            if hit is not None:
                samples.append(hit * 1000)
                if via == "log-marker":
                    signal_kind = "log-marker"
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
    return samples, signal_kind


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

    # --- terminal grid (screen.py) --------------------------------------
    # Each of these encodes a defect that produced a WRONG published number, so
    # they are checks on the metric, not on the parser's aesthetics.
    from screen import Screen

    probe = b"hellobench"

    # 1. A cell-diffing TUI draws the probe with cursor moves around it and never
    #    emits it contiguously (jcode). Byte-matching called this "never echoed".
    s = Screen()
    s.feed(b"\x1b[?2026h\x1b[2D\x1b[3B\r\x1b[2C\x1b[3Ahellobench\x1b[?2026l")
    check("grid: probe drawn with cursor moves is found", s.contains(probe))

    # 2. Escape sequences arrive split across PTY reads — fox's first chunk is a
    #    bare 6-byte cursor-hide. Feeding the tail as text painted the sequence
    #    literally and shifted everything after it.
    s = Screen()
    s.feed(b"\x1b[?25l")
    s.feed(b"\x1b[23;1H\x1b[38;2;1;2;3m hellobench")
    check("grid: split escape sequence does not leak as text", s.contains(probe))

    # 3. A CSI cut mid-parameters ("\x1b[3" + "8;2;1m") must not paint its
    #    parameters onto the screen.
    s = Screen()
    s.feed(b"\x1b[3")
    s.feed(b"8;2;192;202;245mok")
    check("grid: mid-split CSI params stay invisible", "38;" not in s.snapshot(200),
          repr(s.snapshot(60)))

    # 4. Multibyte glyphs occupy ONE cell each. Byte-per-cell decoding put 3 junk
    #    cells per box-drawing char and pushed the probe off its real column.
    s = Screen()
    s.feed("▐▛███▜".encode())
    s.feed(b"X")
    check("grid: utf8 glyph is one cell", s.snapshot(60).startswith("▐▛███▜X"),
          repr(s.snapshot(60)))

    # 5. A wrapped input box splits the probe across rows; both halves are still
    #    the same visible text.
    s = Screen(width=8, height=4)
    s.feed(b"hello")
    s.feed(b"bench")
    check("grid: probe spanning a wrap is found", s.contains(probe))

    # 6. SGR interleaved between the probe's characters (cell-level styling).
    s = Screen()
    s.feed(b"hello\x1b[1m\x1b[0mbench")
    check("grid: sgr interleaved inside probe is found", s.contains(probe))

    # 7. Absolute cursor addressing still places text.
    s = Screen()
    s.feed(b"\x1b[5;10HZ")
    check("grid: absolute cursor position honoured", "Z" in s.snapshot(200))

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

#!/usr/bin/env python3
"""Multi-agent harness benchmark: three numbers, measured honestly.

WHAT IT MEASURES
----------------
Per tool installed on the machine:

  first_byte  exec -> first byte the tool writes. Timed from exec, through a
              forkless byte stream, so no polling cadence and no tmux spawn
              cost is inside the number.
  idle_pss    resident memory of the whole process tree at rest (PSS, so shared
              pages are divided rather than double-counted).
  bundle      on-disk footprint: the binary, or a launcher's exec target, or
              the package dir for a script CLI (minus any bundled node/bun
              runtime -- the interpreter is not the tool).

`--version` and the raw distribution (min/p50/p95/n) are still collected and
written to results.json; they are not presented, because --version flatters
tools that short-circuit before loading their bundle.

Plus fox-agent only, hermetic (no key, no network): time-to-first-token and
peak RSS of a headless `fox -p ... --json` turn against the repo's scripted
provider fixture.

WHY ONLY THREE
--------------
Earlier versions also measured time-to-interactive and keystroke latency by
typing a probe into a TUI. Both need the tool to accept a keystroke, so every
tool showing a trust prompt, a login screen or an error modal cannot be
measured at all. In the last full field run that was 14 of 22 tools: an
honest column of mostly n/a. A metric two thirds of the field cannot produce
is not a comparison, so it was removed rather than patched. The three that
remain every CLI answers the same way, with no login and no keystroke, and
each has a user-visible consequence (memory to run several agents in one
container, harness cost, disk in a CI image).

METHOD NOTES THAT TOOK A WRONG NUMBER TO LEARN
----------------------------------------------
  * Bytes come from `tmux pipe-pane` into a FIFO drained by a thread. Polling
    `capture-pane` forks tmux (9.2ms p50, 32.2ms p95 measured), which put an
    undeclared ~22ms floor under every figure and once produced a published
    4.2ms "latency" that was below the cost of a single observation.
  * The tool starts behind a GATE FIFO: the pipe is attached before the gate is
    released, so no early byte is lost and t0 is the exec, not tmux's spawn.
  * A timeout is a failure, never a sample. An earlier version ranked its own
    15s probe timeout as if it were a slow tool (opencode "15203.1ms").
  * p50 is published, with min/p95 in the table. Publishing only `min` hid a
    shipped 101ms-to-1539ms spread on the same row.
  * Rows under 3 samples are reported but not ranked: one lucky launch is not
    a comparison.

Outputs (all under bench/):
  fox.svg       fox-agent's three numbers, one card each (the README hero)
  bench.svg     the full field, one panel per metric
  results.json  every collected number, machine-readable
  table.md      full precision, min/p50/p95
  snippet.md    the block spliced into the README

Usage:
  python3 scripts/bench/bench.py [--quick] [--out DIR] [--only NAME,...] [--debug]
  python3 scripts/bench/bench.py --self-test
  bun run bench          # build + bench in one step (see package.json)

--only requires an explicit --out: a partial field must not overwrite the
committed results, where it would silently render as "1st of 1".
"""
import glob
import json
import math
import os
import re
import select
import shlex
import shutil
import subprocess
import sys
import tempfile
import termios
import threading
import time

DEBUG = "--debug" in sys.argv


def dbg(msg):
    """Debug narration to stderr (--debug only)."""
    if DEBUG:
        print(f"[bench {time.strftime('%H:%M:%S')}.{int(time.time() * 1000) % 1000:03d}] {msg}", file=sys.stderr, flush=True)


def step(tool, what, detail=""):
    """Live progress line to stderr: WHERE we are and WHAT is being measured.

    A plain newline per line, never \\r: the old version reserved a single
    updating line, and any stray print interleaved with it and destroyed the
    line. One row per step also reads correctly in a CI log.
    """
    suffix = f" -- {detail}" if detail else ""
    print(f"[bench] {tool:<14} {what}{suffix}", file=sys.stderr, flush=True)


ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FOX = os.path.join(ROOT, "bin", "fox")
FAKE = os.path.join(ROOT, "test", "fixtures", "fake-provider.ts")

# (label, candidate binary names). Rows are labeled by the version the binary
# REPORTS, so a renamed/vendored install cannot silently pose as something else.
# opencode v2 is measured separately below (bin `opencode2`, from
# @opencode-ai/cli@beta). v1 was dropped: v2 is the current product.
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
# which no exec-line walk can see). Label -> paths relative to $HOME. Keyed by
# label so one tool's download cannot be reported as another's footprint.
FIRST_RUN_DOWNLOADERS = {
    "codebuff": [os.path.join(".config", "manicode", "codebuff")],
}


# ---------------------------------------------------------------------------
# Launch / locate
# ---------------------------------------------------------------------------


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


def run_quiet(argv, timeout=30, env=None):
    try:
        t0 = time.perf_counter()
        p = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, env=env)
        dt = time.perf_counter() - t0
        out = ((p.stdout or b"") + b"\n" + (p.stderr or b"")).decode("utf-8", "replace")
        return dt, out
    except Exception:
        return None, ""


def version_of(path):
    """First non-empty line of a version probe; `n/a` when nothing answers."""
    for args in VERSION_FALLBACKS:
        _dt, out = run_quiet([path] + args, timeout=15)
        line = (out.strip().splitlines() or [""])[0].strip()[:60]
        if line:
            return line
    return "n/a"


def best_startup(path, n, ver=None):
    """Best of N `--version` runs, in ms. The harness floor, for reference."""
    argv = [path, "--version"] if ver != "n/a" else [path, "--help"]
    ts = []
    for _ in range(n):
        dt, _ = run_quiet(argv, timeout=15)
        if dt is not None:
            ts.append(dt * 1000)
    return ts


# ---------------------------------------------------------------------------
# On-disk footprint
# ---------------------------------------------------------------------------


def is_binary_file(path):
    try:
        with open(path, "rb") as f:
            return b"\x00" in f.read(8192)
    except OSError:
        return False


UNKNOWN = "\x00"  # a shell variable whose value cannot be known statically

_ASSIGN_RE = re.compile(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$")
_READ_RE = re.compile(r"\bread\s+(?:-\w+\s+)*([A-Za-z_][A-Za-z0-9_]*)")
_VAR_RE = re.compile(r"\$(?:\{([A-Za-z_][A-Za-z0-9_]*)([^}]*)\}|([A-Za-z_][A-Za-z0-9_]*))")


def _expand(tok, env, depth=0):
    """Substitute $VAR / ${VAR...} from `env`; unresolvable vars become UNKNOWN.

    Only the forms a launcher actually uses are implemented: plain expansion,
    `%/*` (and `%%/*`) as dirname, `#*/` as basename, a literal `%suffix`
    strip, and `:-default`. Anything else degrades to UNKNOWN, which the caller
    turns into a glob -- never into a wrong path.
    """
    if depth > 6:
        return UNKNOWN

    def sub(m):
        name, ops, bare = m.group(1), m.group(2), m.group(3)
        val = env.get(name or bare, UNKNOWN)
        if bare:
            return val
        ops = ops or ""
        if ops.startswith(":-"):
            default = ops[2:]
            return val if val not in (UNKNOWN, "") else _expand(default, env, depth + 1)
        if ops == "%/*" or ops == "%%/*":
            if val == UNKNOWN:
                return UNKNOWN
            head = os.path.dirname(val)
            return head or val
        if ops == "#*/":
            return UNKNOWN if val == UNKNOWN else os.path.basename(val)
        if ops.startswith("%") and len(ops) > 1:
            suf = ops[1:]
            if val == UNKNOWN:
                return UNKNOWN
            return val[: -len(suf)] if suf and val.endswith(suf) else val
        return UNKNOWN

    return _VAR_RE.sub(sub, tok)


def _launcher_target(path):
    """The path a launcher script hands off to, or None.

    Versioned-install launchers weigh nothing by themselves: jcode is a 505-byte
    sh wrapper that execs a sibling `.bin`, and pi's computes its target from a
    version file it reads at runtime (`exec "$pi_release_bin"`). Weighing the
    wrapper reported jcode as 0.0 MB, and pi as 0.0 MB before this existed.

    Rather than model the shell, this tries a small set of CANDIDATE
    interpretations of the exec argument and takes the first that actually
    exists on disk:

      1. literal (no variables) -- absolute or relative to the script dir;
      2. assignments tracked from the script's own `x=...` / `x=${y%/*}` lines;
      3. any unresolved variable replaced by the script dir (jcode's
         `$self_dir/thing.bin` idiom, where self_dir is the script's dir);
      4. any unresolved variable globbed as `*` (pi's versioned release dir);
      5. any unresolved variable removed (a bare sibling);
      6. finally, the basename globbed inside the script dir.

    Candidate order matters: the textual/glob fallbacks only fire when the
    cheaper interpretations do not resolve, so a real install root is never
    overridden by a guess. A bare command (`exec node ...`) is never followed --
    node is a shared runtime, not this tool's cost.
    """
    try:
        with open(path, "r", errors="replace") as f:
            lines = [f.readline() for _ in range(60)]
    except OSError:
        return None
    if not lines or not lines[0].startswith("#!"):
        return None

    script_dir = os.path.dirname(os.path.realpath(path))
    env = {"0": os.path.realpath(path)}
    exec_line = None
    for line in lines:
        s = line.strip()
        m = _ASSIGN_RE.match(s)
        if m and "$(" not in m.group(2) and "`" not in m.group(2):
            env[m.group(1)] = _expand(m.group(2).strip("\"'"), env)
        elif _READ_RE.search(s):
            # value comes from a file we are not going to interpret
            env[_READ_RE.search(s).group(1)] = UNKNOWN
        if s.startswith("exec "):
            exec_line = s

    if exec_line is None:
        return None
    try:
        toks = shlex.split(exec_line, posix=True)
    except ValueError:
        return None

    arg = next((t for t in toks[1:] if t and not t.startswith("-") and t not in ("$@", "$*")), None)
    if not arg:
        return None

    def abs_for(p):
        return p if os.path.isabs(p) else os.path.normpath(os.path.join(script_dir, p))

    candidates = []

    # 1. as written
    if UNKNOWN not in arg and "$" not in arg:
        candidates.append(abs_for(arg))

    # 2. tracked assignments
    tracked = _expand(arg, env)
    if UNKNOWN not in tracked and "$" not in tracked:
        candidates.append(abs_for(tracked))

    # 3/4/5. unresolved variables: try plausible roots for the unknown PREFIX,
    # then glob the KNOWN tail. pi is the case that needs this: its prefix is
    # `pi_agent_dir`, read out of a version file at runtime, but the tail
    # `/install/releases/<ver>/node_modules/.bin/pi` is literal and exists
    # under the wrapper's own grandparent.
    if UNKNOWN in tracked or "$" in tracked:
        raw = _expand(arg, env)
        roots = [script_dir, os.path.dirname(script_dir), os.path.expanduser("~"), "/"]
        if os.path.isabs(raw):
            candidates.append(raw.replace(UNKNOWN, "*"))
        else:
            for root in roots:
                stem = raw.replace(UNKNOWN, "*")
                candidates.append(os.path.join(root, stem))
                # An unknown that occupies a WHOLE component (pi's
                # `pi_agent_dir`) is a directory, not an extra level: strip
                # that leading `*/` so root itself can be the unknown.
                if stem.startswith("*/"):
                    candidates.append(os.path.join(root, stem[2:]))
                else:
                    candidates.append(os.path.join(root, "*", stem))
        # last resort on the prefix: substitute the script dir, then remove it
        candidates.append(abs_for(raw.replace(UNKNOWN, script_dir)))
        candidates.append(abs_for(raw.replace(UNKNOWN, "")))

    # 6. last resort: does a file of that basename sit next to the wrapper?
    base = os.path.basename(arg.replace("\"", "").rstrip("/"))
    if base and UNKNOWN not in base and "$" not in base:
        candidates += sorted(glob.glob(os.path.join(script_dir, base)))
        candidates += sorted(glob.glob(os.path.join(script_dir, "*", base)))

    for cand in candidates:
        if not cand or UNKNOWN in cand or "$" in cand:
            continue
        hits = sorted(glob.glob(cand)) if "*" in cand else [cand]
        for hit in hits:
            try:
                # follow symlinks: pi's release entry is a symlink to cli.js
                real = os.path.realpath(hit)
                if os.path.exists(real):
                    return real
            except OSError:
                continue
    return None


def _looks_like_js_runtime(path):
    """True when `path` is an embedded/shared JavaScript runtime binary (node or
    bun), not the tool's own code. These CLIs bundle a full Node/Bun runtime
    (~90-150MB) that dominates the package dir and makes every tool report the
    same ~140MB regardless of its actual code size (pi's own cli.js is 160
    bytes). Identified by name + ELF magic.
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
    """Subdirectories of `path` holding only an embedded JS runtime.

    pi's pi-node, any node_modules/{node,bun} install. Returns relative dir
    names so `du --exclude` can prune them: the interpreter is not the tool.
    """
    found = []
    if not os.path.isdir(path):
        return found
    for root, dirs, _files in os.walk(path):
        for d in dirs:
            low = d.lower()
            if low == "pi-node" or (low in ("node", "bun") and os.path.basename(root) == "node_modules"):
                found.append(os.path.relpath(os.path.join(root, d), path))
        dirs[:] = [d for d in dirs if os.path.relpath(os.path.join(root, d), path) not in found]
    return found


def du_bytes(path, exclude_runtimes=True):
    """Disk use of a file or tree in bytes, minus any embedded JS runtime."""
    if os.path.isfile(path):
        if exclude_runtimes and _looks_like_js_runtime(path):
            return 0
        try:
            return os.path.getsize(path)
        except OSError:
            return 0
    excludes = _runtime_dirs_under(path) if exclude_runtimes else []
    base = ["du", "-sb"]
    if excludes:
        base.append("--exclude=" + " --exclude=".join(excludes))
    try:
        p = subprocess.run(base + [path], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=60)
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
    return bool(_runtime_dirs_under(path))


def _first_run_downloader(agent_label):
    """Data-dir binary a tool downloads on first run, if it has one.

    Keyed by the TOOL, because the lookup used to be unconditional: every tool
    fell into codebuff's `~/.config/manicode/codebuff` and was reported at that
    file's size. Thirteen unrelated vendors came out at exactly 139.954304 MB
    -- including aider, which is Python -- and none of them had their package
    dir measured at all. The size was real; it just belonged to one tool.

    A downloader is invisible to the exec-line walk (the shim spawns the binary
    from child_process), so it has to be named here.
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

    A native executable is its own whole cost ("bin"). A script/shim is not --
    weighing only pi's 5MB cli.js while pretending node and 200MB of
    node_modules are free would make every script CLI look impossibly small
    next to a self-contained binary. So for scripts the cost is the enclosing
    install root: the nearest ancestor with package.json (npm) or pyvenv.cfg (a
    venv console script). The exception is a launcher that execs a real binary
    by path (jcode's wrapper): that binary is weighed as "bin". Bare-command
    execs (`exec node ...`) are never followed -- node is shared.
    """
    real = os.path.realpath(path)

    # Follow a launcher chain (wrapper -> versioned binary -> package entry),
    # bounded, before weighing anything: a 505-byte sh wrapper is not a tool.
    probe = real
    seen = set()
    for _ in range(4):
        if probe in seen:
            break
        seen.add(probe)
        nxt = _launcher_target(probe)
        if not nxt or nxt == probe:
            break
        probe = nxt

    try:
        if is_binary_file(probe):
            return os.path.getsize(probe) / 1e6, "bin"
    except OSError:
        return None, "entry"

    cand = _first_run_downloader(agent_label)
    if cand:
        return os.path.getsize(cand) / 1e6, "bin"

    d = os.path.dirname(probe)
    for _ in range(6):
        if os.path.isfile(os.path.join(d, "package.json")) or os.path.isfile(os.path.join(d, "pyvenv.cfg")):
            has_rt = _contains_js_runtime(d)
            return du_bytes(d, exclude_runtimes=True) / 1e6, ("app" if has_rt else "pkg")
        nd = os.path.dirname(d)
        if nd == d:
            break
        d = nd
    try:
        return os.path.getsize(probe) / 1e6, "entry"
    except OSError:
        return None, "entry"


# ---------------------------------------------------------------------------
# Memory (Linux /proc)
# ---------------------------------------------------------------------------


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

    Summing is the honest accounting: a node-based tool's workers hold real,
    user-visible memory, and charging only the launcher understates it by 2-8x
    (measured: kilo 46->353MB, copilot 47->303). This does not double-count
    shared memory -- the kernel divides each shared page's PSS among the
    processes mapping it, so a fork with inherited copy-on-write memory reads
    tree/root = 1.05, not 2.0.
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


# ---------------------------------------------------------------------------
# The measurement rig
#
# One detached tmux session per launch, one socket of information out of it:
#
#   bytes  : `pipe-pane` -> FIFO -> drain thread. Forkless, timestamped at the
#            write. This is where every timing number comes from.
#
# There is no screen or tty socket any more. `capture-pane` existed only to
# find and verify a typed probe, and termios existed only to classify whether a
# tool renders its own echo -- both were for the keystroke metrics that were
# removed. Timing now reads the byte stream and nothing else.
#
# The tool starts behind a GATE FIFO: tmux spawns `sh`, which blocks on the
# gate, and only then execs the tool. The pipe is attached before the gate is
# released, so (a) no early byte can be missed and (b) t0 is the exec, not
# tmux's own spawn cost.
# ---------------------------------------------------------------------------

GATE_SCRIPT = 'read _ < "$1" || true; shift; exec "$@"'
TMUX_ROWS = 40
TMUX_COLS = 120

def _tmux(server, *args, timeout=20):
    try:
        r = subprocess.run(["tmux", "-L", server, *args], capture_output=True, text=True, timeout=timeout)
        return r.stdout
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return ""


def tmux_ready():
    return bool(shutil.which("tmux"))


class Launch:
    """One tool launched in a detached tmux session with a forkless byte stream.

    Use as a context manager. All timings are relative to `self.t0`, the moment
    the gate was released (i.e. the exec).
    """

    def __init__(self, argv, server="bench", size=(TMUX_COLS, TMUX_ROWS), extra_env=None):
        self.argv = list(argv)
        self.server = server
        self.size = size
        self.extra_env = extra_env or {}
        self.tmp = tempfile.mkdtemp(prefix="bench-launch-")
        self.fifo = os.path.join(self.tmp, "stream")
        self.gate = os.path.join(self.tmp, "gate")
        self.name = f"b{int(time.time() * 1e6) % 10**9}"
        self.t0 = None
        self.err = None
        self.pid = None
        self.tty_fd = None
        self._chunks = []  # [(perf_counter_ts, bytes)]
        self._lock = threading.Lock()
        self._cond = threading.Condition(self._lock)
        self._stop = threading.Event()
        self._thread = None
        self._fd = None
        self._start()

    # -- setup ------------------------------------------------------------
    def _start(self):
        if not tmux_ready():
            self.err = "tmux not installed"
            return
        _tmux(self.server, "kill-session", "-t", self.name)
        for p in (self.fifo, self.gate):
            os.mkfifo(p)
        # O_RDWR keeps the read end open whether or not a writer exists, so
        # neither we nor `cat` block on open, and there is no EOF when a tool
        # exits for a moment.
        self._fd = os.open(self.fifo, os.O_RDWR | os.O_NONBLOCK)
        os.set_blocking(self._fd, True)
        self._thread = threading.Thread(target=self._drain, daemon=True)
        self._thread.start()

        env_args = ["-e", "TERM=xterm-256color"]
        for k, v in self.extra_env.items():
            env_args += ["-e", f"{k}={v}"]
        out = _tmux(
            self.server,
            "new-session",
            "-d",
            "-s",
            self.name,
            "-x",
            str(self.size[0]),
            "-y",
            str(self.size[1]),
            *env_args,
            "sh",
            "-c",
            GATE_SCRIPT,
            "bench-gate",
            self.gate,
            *self.argv,
        )
        if not self._alive():
            self.err = f"tmux could not start the session ({out.strip()[:80]})"
            return

        # Attach the pipe BEFORE releasing the gate: the program is blocked on
        # the gate read, so nothing has been written yet and no byte can be
        # lost to the attach window.
        _tmux(self.server, "pipe-pane", "-O", "-t", self.name, "cat >> " + shlex.quote(self.fifo))

        self.pid = self._query_pid()
        self.tty = self._query_tty()

        # Release the gate. t0 is taken immediately before the write; the
        # shell's exec follows within microseconds and is identical for every
        # tool, so the ordering between tools is exact.
        try:
            self.t0 = time.perf_counter()
            w = os.open(self.gate, os.O_WRONLY)
            os.write(w, b"go")
            os.close(w)
        except OSError as e:
            self.err = f"gate release failed: {e}"

    def _drain(self):
        while not self._stop.is_set():
            try:
                b = os.read(self._fd, 1 << 20)
            except (OSError, ValueError):
                return
            if not b:
                return
            ts = time.perf_counter()
            with self._cond:
                self._chunks.append((ts, b))
                self._cond.notify_all()

    def _query_pid(self):
        out = _tmux(self.server, "display-message", "-p", "-t", self.name, "#{pane_pid}").strip()
        try:
            return int(out)
        except ValueError:
            return None

    def _query_tty(self):
        return _tmux(self.server, "display-message", "-p", "-t", self.name, "#{pane_tty}").strip() or None

    # -- state ------------------------------------------------------------
    def _alive(self):
        return bool(_tmux(self.server, "display-message", "-p", "-t", self.name, "#{pane_pid}").strip())

    def alive(self):
        """True while the launched process (or the pane) still exists.

        /proc, not tmux: this is checked often and must not fork. The pane can
        outlive the program (the shell wrapper), so both are consulted.
        """
        if self.pid is not None and os.path.isdir(f"/proc/{self.pid}"):
            return True
        return self._alive()

    # -- stream access ----------------------------------------------------
    def mark(self):
        with self._lock:
            return len(self._chunks)

    def since(self, mark):
        with self._lock:
            return list(self._chunks[mark:])

    def wait_for(self, pred, deadline_s, mark=0, alive_check=True):
        """Block until pred(ts, chunk) returns a value, or the deadline passes.

        Predicates get each chunk with its own timestamp, so a caller reports
        the moment the bytes were WRITTEN, not the moment a poll noticed. The
        condition variable means no sleep-and-fork loop: idle cost is zero.
        """
        deadline = time.perf_counter() + deadline_s
        idx = mark
        while True:
            with self._cond:
                pending = self._chunks[idx:]
                idx = len(self._chunks)
            for ts, b in pending:
                hit = pred(ts, b)
                if hit is not None:
                    return hit
            remaining = deadline - time.perf_counter()
            if remaining <= 0:
                return None
            if alive_check and not self.alive():
                # drain whatever landed before the exit, then give up
                with self._cond:
                    tail = self._chunks[idx:]
                for ts, b in tail:
                    hit = pred(ts, b)
                    if hit is not None:
                        return hit
                return None
            with self._cond:
                self._cond.wait(timeout=min(remaining, 0.05))

    def quiet_for(self, window_s):
        """True when no byte arrived in the last `window_s`."""
        with self._lock:
            if not self._chunks:
                return False
            return (time.perf_counter() - self._chunks[-1][0]) >= window_s

    def bytes_since(self, mark):
        return b"".join(b for _ts, b in self.since(mark))

    def ms_since_t0(self, ts):
        return None if self.t0 is None else (ts - self.t0) * 1000

    # -- teardown ---------------------------------------------------------
    def close(self):
        self._stop.set()
        _tmux(self.server, "kill-session", "-t", self.name)
        if self.tty_fd is not None:
            try:
                os.close(self.tty_fd)
            except OSError:
                pass
            self.tty_fd = None
        if self._fd is not None:
            try:
                os.close(self._fd)
            except OSError:
                pass
            self._fd = None
        shutil.rmtree(self.tmp, ignore_errors=True)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
        return False


def measure_launch(path, paint_budget=40.0):
    """One launch -> first byte and settled PSS, or an explicit failure.

    Deliberately small. The interactive metrics (time-to-interactive, keystroke
    latency) were removed: they required typing into a TUI, which means every
    tool that shows a trust prompt, a login screen or an error modal cannot be
    measured at all. In the last full field run that was 14 of 22 tools, and the
    honest result was a column that was mostly n/a. Rather than publish a metric
    that two thirds of the field cannot produce, this bench measures the three
    things every CLI can answer the same way:

        first byte  -- exec to first byte on the wire
        idle PSS    -- resident memory of the whole process tree at rest
        bundle      -- on-disk footprint

    A timeout is a failure, never a number: published as n/a and excluded from
    ranks, because an earlier version ranked its own 15s probe timeout as if it
    were a slow tool.
    """
    rec = {"first_byte_ms": None, "pss_mb": None, "pss_root_mb": None, "procs": None, "failed": []}
    with Launch([path], extra_env={"FOX_AGENT_NO_TRUST_CHECK": "1"}) as L:
        if L.err:
            rec["failed"].append(f"launch: {L.err}")
            return rec

        # exec -> first byte, straight off the byte stream. t0 is the gate
        # release (the exec), so tmux's own spawn cost is not charged here.
        first = L.wait_for(lambda ts, _b: ts, paint_budget)
        if first is None:
            rec["failed"].append(f"no output within {paint_budget:.0f}s")
            return rec
        rec["first_byte_ms"] = L.ms_since_t0(first)

        # Memory at rest. Poll PSS of the tree until it converges, so the
        # reading is not whatever startup work happened to be in flight; the
        # caller takes the floor over launches because extra processes only
        # ever ADD.
        if L.pid is not None:
            deadline = time.perf_counter() + 8.0
            last = None
            best = None
            stable = 0
            while time.perf_counter() < deadline:
                tree, nprocs = _pss_tree(L.pid)
                if tree is None:
                    if not L.alive():
                        break
                    time.sleep(0.2)
                    continue
                best = (tree, nprocs)
                if last is not None and abs(tree - last) <= 2.0:
                    stable += 1
                    if stable >= 3:
                        break
                else:
                    stable = 0
                last = tree
                time.sleep(0.25)
            if best is not None:
                rec["pss_mb"] = best[0]
                rec["pss_root_mb"] = _pss_of(L.pid)
                rec["procs"] = best[1]

    return rec


# ---------------------------------------------------------------------------
# fox-agent headless extras (hermetic: no key, no network)
# ---------------------------------------------------------------------------


def start_fake_provider():
    """Run the repo's scripted provider fixture; returns (proc, base_url)."""
    bun = shutil.which("bun")
    if not bun or not os.path.isfile(FAKE):
        return None, None
    env = dict(os.environ, FAKE_SCRIPT="text")
    p = subprocess.Popen([bun, FAKE], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env, text=True, bufsize=1)
    try:
        line = p.stdout.readline().strip()
    except Exception:
        line = ""
    if not line.startswith("http"):
        p.kill()
        return None, None
    return p, line


def _fox_env(base_url, home):
    """A genuinely hermetic environment for a headless turn.

    FOX_AGENT_HOME alone is NOT enough, and the difference is enormous. It
    redirects the data dir (sessions, catalog cache) but the global CONFIG path
    is `homedir()/.config/fox-agent/config.toml`, which FOX_AGENT_HOME does not
    affect -- `loadConfig` in src/core/config.ts only honours the FOX_CONFIG
    overrides for that.

    Measured on this box, same command, same local provider:

        FOX_AGENT_HOME only ............ 23.23s, 18.66s wall (14.4s user CPU)
        + FOX_AGENT_CONFIG=<empty> .....  0.25s,  0.24s wall

    The 90x difference is the real user config's three [mcpServers.*] entries:
    every headless turn was spawning chrome-devtools, thorium-devtools and
    wincontrol before it saw the prompt. A bench that claims "no key, no
    network" must not be reading the developer's MCP servers, so an empty
    config is written per run and pointed at explicitly.
    """
    cfg = os.path.join(home, "config.toml")
    try:
        os.makedirs(home, exist_ok=True)
        with open(cfg, "w") as f:
            f.write("")
    except OSError:
        pass
    return dict(
        os.environ,
        FOX_AGENT_HOME=home,
        FOX_AGENT_CONFIG=cfg,
        # keep the catalog offline too: a refresh is a 10s fetch that has no
        # business inside a startup measurement
        FOX_AGENT_MODELS_OFFLINE="1",
        FOX_AGENT_BASE_URL=base_url,
        FOX_AGENT_API_KEY="bench-fake-key",
        FOX_AGENT_PROVIDER="openai-compatible",
        FOX_AGENT_MODEL="bench-model",
    )


def fox_ttft(base_url, budget=60.0):
    """Spawn -> first `text` event of one headless turn, in ms, or None.

    Reads with select against a deadline. The predecessor iterated the child's
    stdout with `for line in ...`, which BLOCKS past its own 60s check: the
    in-loop timeout only fired if a line arrived, so a provider that accepted
    the connection and then stalled would hang the whole bench step.
    """
    home = tempfile.mkdtemp(prefix="fox-bench-home-")
    work = tempfile.mkdtemp(prefix="fox-bench-work-")
    t0 = time.perf_counter()
    first = None
    try:
        p = subprocess.Popen(
            [FOX, "-p", "say hi", "--json"],
            cwd=work,
            env=_fox_env(base_url, home),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        assert p.stdout is not None
        fd = p.stdout.fileno()
        buf = b""
        while time.perf_counter() - t0 < budget:
            r, _w, _x = select.select([fd], [], [], max(0.0, budget - (time.perf_counter() - t0)))
            if not r:
                break
            chunk = os.read(fd, 65536)
            if not chunk:
                break
            buf += chunk
            # parse rather than substring-match: `"type":"text_delta"` contains
            # `"type":"text` and a naive match counts it as the first token.
            for line in buf.split(b"\n"):
                line = line.strip()
                if not line.startswith(b"{"):
                    continue
                try:
                    ev = json.loads(line)
                except Exception:
                    continue
                if isinstance(ev, dict) and ev.get("type") == "text":
                    first = (time.perf_counter() - t0) * 1000
                    break
            if first is not None:
                break
        try:
            p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            p.kill()
    except Exception as e:
        dbg(f"fox_ttft failed: {e}")
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
    try:
        p = subprocess.run(
            [timer, "-v", FOX, "-p", "say hi", "--json"],
            cwd=work,
            env=_fox_env(base_url, home),
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


# ---------------------------------------------------------------------------
# Statistics -- p50 is the headline, with the spread beside it
# ---------------------------------------------------------------------------


def percentile(sorted_samples, p):
    """Nearest-rank p-th percentile (0-100) of an ALREADY-SORTED list."""
    if not sorted_samples:
        return None
    k = max(0, min(len(sorted_samples) - 1, int(round((p / 100) * (len(sorted_samples) - 1)))))
    return sorted_samples[k]


def stat_block(samples):
    """Collapse timings into {min, p50, p95, n}.

    p50 is the value the table publishes: the old version published `min`,
    which is the single luckiest launch and hid the spread entirely -- the
    shipped opencode first-byte row was 101ms min against 1539ms p95.
    """
    vals = [v for v in samples if v is not None]
    if not vals:
        return {"min": None, "p50": None, "p95": None, "n": 0}
    s = sorted(vals)
    return {"min": s[0], "p50": percentile(s, 50), "p95": percentile(s, 95), "n": len(s)}


# ---------------------------------------------------------------------------
# Per-tool measurement
# ---------------------------------------------------------------------------

# Fewer than this many successful samples and the row is reported but NOT
# ranked: an n=1 sample ranked against an n=5 row is not a comparison. The
# predecessor shipped cursor-agent and devin that way.
MIN_RANK_N = 3


def measure(label, path, n_start, launches):
    """Measure one tool. Three numbers, plus the raw detail.

    Presented metrics: first byte, idle PSS, bundle. `--version` is still
    measured (it is four spawns and gives the harness floor for context) but is
    carried in results.json only -- the dashboard and the README stay on the
    three that matter.
    """
    step(label, "probing version")
    ver = version_of(path)
    step(label, "weighing on-disk footprint", os.path.basename(path))
    disk, kind = footprint(path, label)
    step(label, f"timing `--version` (best of {n_start})")
    startup = best_startup(path, n_start, ver=ver)

    samples = {"first_byte_ms": [], "pss_mb": []}
    failures = []
    procs = None
    pss_root = None
    for i in range(launches):
        step(label, f"launch {i + 1}/{launches}")
        rec = measure_launch(path)
        for k in samples:
            if rec.get(k) is not None:
                samples[k].append(rec[k])
        failures.extend(rec["failed"])
        if rec["procs"]:
            procs = max(procs or 0, rec["procs"])
        if rec["pss_root_mb"]:
            pss_root = rec["pss_root_mb"] if pss_root is None else min(pss_root, rec["pss_root_mb"])

    row = {
        "agent": label,
        "installed": True,
        "bin": path,
        "version": ver,
        "bundle_mb": disk,
        "bundle_kind": kind,
        "startup": stat_block(startup),
        "first_byte": stat_block(samples["first_byte_ms"]),
        # Floored over launches: extra processes only ever ADD, so the reading
        # taken when the least startup work was in flight is the resting cost.
        "idle_pss_mb": min(samples["pss_mb"]) if samples["pss_mb"] else None,
        "idle_pss_root_mb": pss_root,
        "procs": procs,
        "launches": launches,
        "failures": sorted(set(failures)),
    }

    def f(v, nd=0):
        return "-" if v is None else f"{v:.{nd}f}"

    print(
        f"{label}: {ver}\n"
        f"  bundle={f(disk, 1)}MB({kind}) "
        f"1st_byte={f(row['first_byte']['p50'])} "
        f"pss={f(row['idle_pss_mb'], 1)}MB "
        f"n={row['first_byte']['n']}",
        flush=True,
    )
    for fail in row["failures"]:
        print(f"  ! {fail}", flush=True)
    return row


# ---------------------------------------------------------------------------
# SVG dashboard
# ---------------------------------------------------------------------------

INK = "#e6e1d8"
MUT = "#8a8578"
ACC = "#e0803c"
BAR = "#5b7fa6"
BAR_NA = "#3a382f"
BG = "#141310"
BG2 = "#1b1916"
GRID = "#2e2b25"
TRACK = "#221f1a"


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def fmt_ms(v):
    """Milliseconds at a readable precision: one decimal below 10ms (where the
    fraction is a real difference), whole numbers above it (where it is noise).
    "20.0 ms" in a 40px headline reads as false precision on a p50 of five
    launches; "3.7 ms" does not."""
    if v < 10:
        return f"{v:.1f}"
    return f"{v:,.0f}"


def _clip(text, px_budget, font_px):
    """Truncate `text` to roughly `px_budget` at `font_px`, with an ellipsis.

    SVG has no text wrapping, so a subtitle longer than its column runs into
    the next panel -- which is what the first version of this dashboard did
    ("lower is better" collided with "first printable char on the wire" across
    all three columns). Monospace advance is ~0.6em, so the budget is a
    character count derived from the pixel width rather than a hardcoded
    slice, which silently truncates at the wrong place when the font size
    changes.
    """
    s = str(text)
    if font_px <= 0:
        return s
    max_chars = max(8, int(px_budget / (font_px * 0.6)))
    if len(s) <= max_chars:
        return s
    return s[: max_chars - 1].rstrip() + "\u2026"


def dashboard_svg(panels, out_path, note, footer):
    """Render every metric lane as one image.

    panels: [(title, subtitle, rows, unit, fmt)] where rows is
    [(label, value_or_None, is_fox)].

    Layout rules, each of which fixes a defect visible in the rendered PNG:

      * unmeasured tools are COLLAPSED, not listed. Fifteen `n/a` rows in six
        panels filled two thirds of the canvas with nothing; the count lives in
        the panel subtitle ("7 measured · 15 n/a") and the full n/a list is in
        the table one fold away. The header states the field size, so a reader
        still knows the panel is partial.
      * subtitles are clipped to their column, because SVG does not wrap and
        an overlong subtitle runs straight into the neighbouring panel.
      * the footer is one line with a shortened provenance tail, so it cannot
        collide with the bottom row of panel subtitles.
      * a RANK column, right-aligned, so ordering is legible without comparing
        bar lengths by eye (the old version glued a medal digit to the value,
        where "1 4.9 ms" read as fourteen-point-nine).
      * values are text-anchored to each column's right edge, so they line up
        across rows and panels instead of floating after a variable-width bar.
      * bars are SQRT-scaled, and the footer says so. First-byte ranges span
        ~90x here (106ms to 9281ms); on a linear axis the leader is a 3px
        sliver and the chart conveys nothing. Area is not proportional to value
        on a sqrt axis, so it is declared rather than assumed -- the exact
        numbers are printed beside every bar.
    """
    W, GUT, PAD = 1200, 22, 28
    NCOL = 3
    COLW = (W - PAD * 2 - GUT * (NCOL - 1)) // NCOL
    HEADER_H = 96
    TITLE_H, SUB_H, LANE_H = 30, 22, 25
    RANK_W, LABEL_W, VAL_W = 24, 112, 66
    FOOT_H = 40

    measured_counts = [sum(1 for r in p[2] if r[1] is not None) for p in panels]
    n_rows = max(measured_counts or [1])
    NROW = -(-len(panels) // NCOL)
    PANEL_H = TITLE_H + LANE_H * n_rows + SUB_H
    H = HEADER_H + NROW * PANEL_H + GUT * (NROW - 1) + FOOT_H

    L = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
        f'font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">',
        f'<rect width="{W}" height="{H}" fill="{BG}"/>',
        f'<rect width="{W}" height="{HEADER_H}" fill="{BG2}"/>',
        f'<rect x="0" y="{HEADER_H - 2}" width="{W}" height="2" fill="{ACC}"/>',
        f'<text x="{PAD}" y="38" fill="{INK}" font-size="21" font-weight="bold">'
        f'fox-agent · harness bench</text>',
        f'<text x="{PAD}" y="62" fill="{MUT}" font-size="12">'
        f'startup · idle memory · installed size</text>',
        f'<text x="{PAD}" y="82" fill="{MUT}" font-size="10.5">{esc(_clip(note, W - PAD * 2, 10.5))}</text>',
    ]

    for idx, (title, subtitle, rows, unit, fmt) in enumerate(panels):
        col, row_i = idx % NCOL, idx // NCOL
        x0 = PAD + col * (COLW + GUT)
        y0 = HEADER_H + row_i * (PANEL_H + GUT)

        have = sorted([r for r in rows if r[1] is not None], key=lambda r: r[1])
        n_missing = len(rows) - len(have)
        maxv = max([r[1] for r in have] or [1])

        L.append(
            f'<text x="{x0}" y="{y0 + 16}" fill="{INK}" font-size="13" font-weight="bold">'
            f'{esc(_clip(title, COLW - 108, 13))}</text>'
        )
        L.append(
            f'<text x="{x0 + COLW}" y="{y0 + 16}" text-anchor="end" fill="{MUT}" font-size="9.5">'
            f'{len(have)} measured' + (f' \u00b7 {n_missing} n/a' if n_missing else '') + '</text>'
        )
        L.append(f'<rect x="{x0}" y="{y0 + TITLE_H - 8}" width="{COLW}" height="1" fill="{GRID}"/>')

        bx = x0 + RANK_W + LABEL_W
        bw = COLW - RANK_W - LABEL_W - VAL_W
        vx = x0 + COLW

        if not have:
            L.append(
                f'<text x="{x0}" y="{y0 + TITLE_H + 15}" fill="{BAR_NA}" font-size="10.5">'
                f'no tool in this field was measured</text>'
            )

        for i, (label, v, is_fox) in enumerate(have):
            y = y0 + TITLE_H + i * LANE_H
            mid = y + LANE_H / 2

            L.append(
                f'<text x="{x0 + RANK_W - 8}" y="{mid + 3.5:.1f}" text-anchor="end" '
                f'fill="{ACC if is_fox else MUT}" font-size="10">{i + 1}</text>'
            )
            label_fill = ACC if is_fox else (INK if i < 3 else MUT)
            weight = ' font-weight="bold"' if is_fox else ""
            L.append(
                f'<text x="{x0 + RANK_W}" y="{mid + 3.5:.1f}" fill="{label_fill}" '
                f'font-size="11.5"{weight}>{esc(_clip(label, LABEL_W - 6, 11.5))}</text>'
            )

            # visible track, so a near-zero bar still reads as "small", not absent
            L.append(f'<rect x="{bx}" y="{mid - 6:.1f}" width="{bw}" height="12" rx="2" fill="{TRACK}"/>')
            w = max(3.0, (math.sqrt(v) / math.sqrt(maxv)) * bw)
            L.append(
                f'<rect x="{bx}" y="{mid - 6:.1f}" width="{w:.1f}" height="12" rx="2" '
                f'fill="{ACC if is_fox else BAR}"/>'
            )
            L.append(
                f'<text x="{vx}" y="{mid + 3.5:.1f}" text-anchor="end" '
                f'fill="{INK if is_fox else MUT}" font-size="10.5">{esc(fmt(v))} {unit}</text>'
            )

        L.append(
            f'<text x="{x0}" y="{y0 + TITLE_H + LANE_H * n_rows + 13}" fill="{MUT}" '
            f'font-size="9">{esc(_clip(subtitle, COLW, 9))}</text>'
        )

    # legend + provenance, one line, clipped so it cannot overflow the canvas
    fy = H - FOOT_H + 22
    L.append(f'<rect x="{PAD}" y="{fy - 9}" width="9" height="9" rx="2" fill="{ACC}"/>')
    L.append(f'<text x="{PAD + 15}" y="{fy}" fill="{MUT}" font-size="10">fox-agent</text>')
    L.append(f'<rect x="{PAD + 90}" y="{fy - 9}" width="9" height="9" rx="2" fill="{BAR}"/>')
    L.append(f'<text x="{PAD + 105}" y="{fy}" fill="{MUT}" font-size="10">other tools</text>')
    L.append(
        f'<text x="{PAD + 196}" y="{fy}" fill="{MUT}" font-size="10">'
        f'{esc(_clip(footer, W - PAD * 2 - 196, 10))}</text>'
    )
    L.append("</svg>")

    with open(out_path, "w") as f:
        f.write("\n".join(L) + "\n")


# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

# The three presented metrics, in the order they are shown. Each is something
# every CLI can answer the same way, needs no login and no keystroke, and has a
# user-visible consequence:
#
#   idle memory -- run several agents in one container without swapping
#   first byte  -- how long the harness itself costs before it can do anything
#   bundle      -- disk, and how much a CI image has to carry
#
# Deliberately NOT here: time-to-interactive and keystroke latency. Both require
# typing into a TUI, so a tool showing a trust prompt or a login screen cannot be
# measured at all -- in the last full run that was 14 of 22 tools, i.e. a column
# that was mostly n/a. A metric two thirds of the field cannot produce is not a
# comparison, it is a table of our own methodology.
#
# (key, label, unit, formatter, short label for the scorecard)
METRICS = [
    ("first_byte", "1st byte", "ms", fmt_ms, "startup to first byte"),
    ("idle_pss_mb", "idle memory", "MB", lambda v: f"{v:.0f}", "idle memory (PSS)"),
    ("bundle_mb", "bundle", "MB", lambda v: f"{v:.0f}", "install size"),
]


def metric_value(row, key):
    """The published number for one metric: p50 for timings, the scalar for
    memory and disk.

    p50 rather than min: min is the luckiest single launch and hides the spread
    (the shipped opencode first-byte row was 101ms min / 1539ms p95).
    """
    if key in ("bundle_mb", "idle_pss_mb"):
        return row.get(key)
    blk = row.get(key) or {}
    return blk.get("p50")


def metric_n(row, key):
    blk = row.get(key) or {}
    return blk.get("n", 0) if isinstance(blk, dict) else 0


def rank_of(rows, key, fox_name="fox-agent"):
    """fox's position for one metric plus the field size.

    Ties share a rank (1 + number of strictly better tools). Rows that were not
    measured, or that have fewer than MIN_RANK_N samples, are excluded rather
    than ranked last -- an n/a row is not a slow one, and one lucky launch is
    not a comparison.
    """
    vals = []
    for r in rows:
        if not r.get("installed"):
            continue
        v = metric_value(r, key)
        if v is None:
            continue
        if key not in ("bundle_mb", "idle_pss_mb") and metric_n(r, key) < MIN_RANK_N:
            continue
        vals.append((r["agent"], v))
    fox = next((v for a, v in vals if a == fox_name), None)
    if fox is None:
        return None, len(vals)
    return 1 + sum(1 for _a, v in vals if v < fox), len(vals)


def scorecard_svg(rows, out_path, generated, machine):
    """The README hero: fox-agent's three numbers, one card each.

    An SVG rather than a markdown table because this is the block a reader
    actually looks at, and three numbers set large read in a second, while a
    table of them reads in five. The rank is stated as "#2 of 20" beside each
    value so the number has a field to be good in -- a bare "45 MB" is not a
    claim, "45 MB, #2 of 20" is.

    Deliberately not a bar chart: with three values from three different units
    there is nothing to compare within a single axis, so bars would be
    decoration. Size is used for emphasis instead.
    """
    fox = next((r for r in rows if r["agent"] == "fox-agent" and r.get("installed")), None)
    W, PAD = 1200, 34
    CARD_H, HEAD_H, FOOT_H = 132, 96, 44
    N = len(METRICS)
    GAP = 20
    CARD_W = (W - PAD * 2 - GAP * (N - 1)) // N
    H = HEAD_H + CARD_H + FOOT_H

    L = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
        f'font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">',
        f'<rect width="{W}" height="{H}" fill="{BG}"/>',
        f'<rect width="{W}" height="{HEAD_H}" fill="{BG2}"/>',
        f'<rect x="0" y="{HEAD_H - 2}" width="{W}" height="2" fill="{ACC}"/>',
        f'<text x="{PAD}" y="42" fill="{INK}" font-size="24" font-weight="bold">fox-agent</text>',
    ]
    if fox:
        L.append(
            f'<text x="{PAD + 150}" y="42" fill="{MUT}" font-size="14">v{esc(fox["version"])}</text>'
        )
    L.append(
        f'<text x="{PAD}" y="70" fill="{MUT}" font-size="12.5">'
        f'the harness cost, measured against {len([r for r in rows if r.get("installed")])} '
        f'coding CLIs · lower is better on all three</text>'
    )
    L.append(f'<text x="{W - PAD}" y="70" text-anchor="end" fill="{MUT}" font-size="11">'
             f'{esc(_clip(machine, 380, 11))}</text>')

    for i, (key, label, unit, fmt, short) in enumerate(METRICS):
        x0 = PAD + i * (CARD_W + GAP)
        y0 = HEAD_H + 16
        rank, field = rank_of(rows, key)
        val = metric_value(fox, key) if fox else None

        L.append(f'<rect x="{x0}" y="{y0}" width="{CARD_W}" height="{CARD_H}" rx="5" fill="{BG2}"/>')
        L.append(f'<rect x="{x0}" y="{y0}" width="3" height="{CARD_H}" rx="1.5" fill="{ACC}"/>')
        L.append(f'<text x="{x0 + 22}" y="{y0 + 30}" fill="{MUT}" font-size="12">{esc(short)}</text>')

        if val is None:
            L.append(f'<text x="{x0 + 22}" y="{y0 + 78}" fill="{BAR_NA}" font-size="34">n/a</text>')
            L.append(f'<text x="{x0 + 22}" y="{y0 + 106}" fill="{MUT}" font-size="11">'
                     f'not measured this run</text>')
            continue

        vs = fmt(val)
        # The number is the point, so it gets the size. The unit sits beside it
        # at text size rather than inside the big string, so "45 MB" does not
        # read as one large blob.
        L.append(f'<text x="{x0 + 22}" y="{y0 + 82}" fill="{INK}" font-size="40" '
                 f'font-weight="bold">{esc(vs)}</text>')
        num_w = len(vs) * 40 * 0.6
        L.append(f'<text x="{x0 + 22 + num_w + 6:.0f}" y="{y0 + 82}" fill="{MUT}" '
                 f'font-size="15">{esc(unit)}</text>')
        if rank is not None:
            L.append(f'<text x="{x0 + 22}" y="{y0 + 110}" fill="{ACC}" font-size="12">'
                     f'#{rank} of {field}</text>')

    fy = H - FOOT_H + 26
    L.append(f'<text x="{PAD}" y="{fy}" fill="{MUT}" font-size="10.5">'
             f'p50 of successful launches · full field in bench/bench.svg · raw data in '
             f'bench/results.json · generated {esc(generated)}</text>')
    L.append("</svg>")

    with open(out_path, "w") as f:
        f.write("\n".join(L) + "\n")


def render_outputs(out, rows, fox_extra, payload):
    """Write every generated artifact from already-measured rows."""
    is_fox = lambda r: r["agent"] == "fox-agent"  # noqa: E731

    def panel_rows(key):
        return [(r["agent"], metric_value(r, key), is_fox(r)) for r in rows]

    # Hero: fox-agent alone, one card per metric.
    scorecard_svg(rows, os.path.join(out, "fox.svg"), payload["generated"], payload["machine"])

    # Full field: one panel per metric.
    dashboard_svg(
        [
            ("1st byte", "exec to first byte on the wire", panel_rows("first_byte"), "ms", fmt_ms),
            ("idle memory", "PSS of the whole process tree at rest", panel_rows("idle_pss_mb"), "MB", lambda v: f"{v:.0f}"),
            ("bundle", "binary, or package dir for script CLIs", panel_rows("bundle_mb"), "MB", lambda v: f"{v:.0f}"),
        ],
        os.path.join(out, "bench.svg"),
        "p50 of successful launches · durations from a forkless pipe-pane stream, timed from exec "
        "(no polling floor, no tmux spawn cost)",
        f"lower is better · sqrt-scaled bars (values printed) · n/a collapsed, full list in table · "
        f"{payload.get('cpu_count', '?')} cpu, load {payload.get('load_avg', ['?'])[0]}",
    )

    def cell(v, nd=1):
        return "—" if v is None else f"{v:.{nd}f}"

    # Full-precision record. This is the machine-readable companion to
    # results.json: every field, including the min/p95 spread the dashboard
    # cannot show.
    T = [
        "| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind "
        "| `--version` min/p50/p95 (ms) | n |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        if not r.get("installed"):
            T.append(f"| {r['agent']} | n/a (not installed) | — | — | — | — | — | — |")
            continue
        name = f"**{r['agent']}**" if r["agent"] == "fox-agent" else r["agent"]

        def trip(key):
            blk = r.get(key) or {}
            if not isinstance(blk, dict) or blk.get("p50") is None:
                return "—"
            return f"{cell(blk['min'])}/{cell(blk['p50'])}/{cell(blk['p95'])}"

        T.append(
            f"| {name} | {r['version']} | {trip('first_byte')} | {cell(r.get('idle_pss_mb'))} "
            f"| {cell(r.get('bundle_mb'))} | {r.get('bundle_kind', '—')} | {trip('startup')} "
            f"| {r.get('launches', 0)} |"
        )
    table_md = "\n".join(T) + "\n"
    with open(os.path.join(out, "table.md"), "w") as f:
        f.write(table_md)

    failures = sorted({(r["agent"], f) for r in rows if r.get("installed") for f in r.get("failures", [])})

    # README block: the scorecard is the whole visible section. Everything else
    # is one fold away, because a reader who wants the field will click and a
    # reader who wants to know whether fox is fast is already done.
    S = [
        "![fox-agent bench](bench/fox.svg)",
        "",
    ]
    if fox_extra.get("ttft_ms") is not None:
        rss = fox_extra.get("headless_peak_rss_mb")
        rss_s = f"{rss:.0f} MB" if rss is not None else "n/a (/usr/bin/time missing)"
        S += [
            f"fox-agent headless vs scripted local provider: time to first token "
            f"**{fox_extra['ttft_ms']:.0f} ms**, peak RSS **{rss_s}**.",
            "",
        ]
    S += [
        "<details><summary>the full field · every tool, every metric</summary>",
        "",
        "![harness bench dashboard](bench/bench.svg)",
        "",
        "</details>",
        "",
        "<details><summary>full precision · min/p50/p95 per metric</summary>",
        "",
        table_md.rstrip(),
        "",
        "</details>",
        "",
    ]
    if failures:
        # A failure is published, not swallowed: an earlier version ranked its
        # own probe timeout as if it were a slow tool.
        S += ["<details><summary>what could not be measured</summary>", ""]
        S += [f"- **{agent}**: {why}" for agent, why in failures]
        S += ["", "</details>", ""]
    S.append(
        f"_Generated {payload['generated']} on {payload['machine']}"
        + (
            f", load {payload['load_avg'][0]} on {payload['cpu_count']} cpu"
            if payload.get("load_avg") and payload["load_avg"][0] is not None
            else ""
        )
        + ". [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_"
    )
    with open(os.path.join(out, "snippet.md"), "w") as f:
        f.write("\n".join(S) + "\n")


# ---------------------------------------------------------------------------
# Self-test -- the wiring, not the tools
# ---------------------------------------------------------------------------


def self_test():
    """Regression checks for the measurement rig. No network, no competitor
    tools needed; uses /bin/sh and the filesystem.

    Each check exists because a specific published number was wrong:

      * footprint scoped per tool -- an unconditional lookup once reported ONE
        tool's 140MB downloader as thirteen unrelated vendors' footprint
        (including aider, which is Python); the tell was thirteen byte-identical
        sizes.
      * capture is not the clock -- one `capture-pane` fork costs ~9-17ms, and
        the predecessor's published 4.2ms latency was below that floor.
      * a probe split across chunks is still found -- cell-diffing TUIs never
        emit a contiguous run.
      * the probe is really on screen -- a stream match alone is not evidence.
      * a timeout is a failure, not a sample -- the predecessor ranked its 15s
        probe timeout as opencode's "1537ms" of extra latency.
      * gate release starts the clock -- early bytes must not be lost and
        tmux's own spawn cost must not be charged to the tool.
    """
    fails = []

    def check(name, cond, detail=""):
        if cond:
            print(f"  ok   {name}")
        else:
            print(f"  FAIL {name} {detail}")
            fails.append(name)

    # -- footprint scoping ------------------------------------------------
    with tempfile.TemporaryDirectory() as tmp:
        home = os.path.join(tmp, "home")
        manicode = os.path.join(home, ".config", "manicode")
        os.makedirs(manicode)
        dl = os.path.join(manicode, "codebuff")
        with open(dl, "wb") as f:
            f.write(b"\x00" * 4096)

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
            for pkg, p in shims.items():
                mb, kind = footprint(p, pkg)
                check(
                    f"{pkg} does not inherit codebuff's downloader",
                    mb is not None and mb < 1.0 and kind in ("pkg", "app"),
                    f"got {mb} kind={kind}",
                )
            mb, kind = footprint(shims["codex"], "codebuff")
            check("codebuff claims its own downloader", mb is not None and mb > 0 and kind == "bin", f"{mb} {kind}")
            mb2, _ = footprint(shims["aider"], "not-a-real-tool")
            check("an unknown label claims nothing", mb2 is not None and mb2 < 1.0, f"got {mb2}")
        finally:
            if old_home is None:
                os.environ.pop("HOME", None)
            else:
                os.environ["HOME"] = old_home

        # -- launcher resolution ------------------------------------------
        # Three real launcher shapes, each of which reported 0.0 MB once:
        # jcode (execs a literal sibling .bin), pi (computes its target from a
        # version file at runtime), and `exec node ...` (a shared runtime that
        # must NOT be followed).
        lroot = os.path.join(tmp, "launchers")
        os.makedirs(lroot)

        # (a) literal sibling binary -- jcode's shape
        with open(os.path.join(lroot, "payload.bin"), "wb") as f:
            f.write(b"\x7fELF" + b"\x00" * 2048)
        a = os.path.join(lroot, "literal")
        with open(a, "w") as f:
            f.write("#!/bin/sh\nself_dir=${0%/*}\nexec \"$self_dir/payload.bin\" \"$@\"\n")
        check("launcher: literal ${0%/*}/payload.bin is followed", _launcher_target(a) == os.path.realpath(os.path.join(lroot, "payload.bin")))

        # (b) target read from a version file -- pi's shape. The prefix is
        # statically UNKNOWABLE, so the answer must come from globbing the
        # literal tail, not from a guess.
        rel = os.path.join(lroot, "install", "releases", "9.9.9", "node_modules", ".bin")
        os.makedirs(rel)
        with open(os.path.join(rel, "tool"), "wb") as f:
            f.write(b"\x7fELF" + b"\x00" * 1024)
        with open(os.path.join(lroot, "install", "current-version"), "w") as f:
            f.write("9.9.9\n")
        b = os.path.join(lroot, "bin", "versioned")
        os.makedirs(os.path.dirname(b))
        with open(b, "w") as f:
            f.write(
                "#!/bin/sh\n"
                'd=$(dirname "$0")\n'
                'if ! IFS= read -r ver < "$d/../install/current-version"; then exit 1; fi\n'
                'rel="$d/../install/releases/$ver/node_modules/.bin/tool"\n'
                'exec "$rel" "$@"\n'
            )
        got_b = _launcher_target(b)
        check(
            "launcher: runtime-computed target resolves by globbing the known tail",
            got_b is not None and got_b.endswith(os.path.join("releases", "9.9.9", "node_modules", ".bin", "tool")),
            str(got_b),
        )

        # (c) `exec node ...` is a shared runtime, never the tool's cost
        c = os.path.join(lroot, "nodewrap")
        with open(c, "w") as f:
            f.write("#!/usr/bin/env node\nexec node /usr/lib/thing.js \"$@\"\n")
        check("launcher: bare `exec node` is not followed", _launcher_target(c) is None)

        # (d) a non-script is not a launcher
        check("launcher: an ELF is not treated as a script", _launcher_target(os.path.join(lroot, "payload.bin")) is None)

    # -- statistics -------------------------------------------------------
    blk = stat_block([10, 20, 30, 40, 1000])
    check("p50 is the headline, not min", blk["p50"] == 30 and blk["min"] == 10, str(blk))
    check("p95 exposes the tail", blk["p95"] == 1000, str(blk))
    check("empty samples are n=0, not a zero", stat_block([]) ["n"] == 0 and stat_block([])["p50"] is None)
    blk2 = stat_block([5, None, 7])
    check("None samples are dropped, not counted as 0", blk2["n"] == 2 and blk2["min"] == 5, str(blk2))

    # -- exactly three presented metrics ---------------------------------
    # The interactive metrics were removed on purpose: they required a keystroke,
    # so 14 of 22 tools came back n/a. If one is ever re-added it must come with
    # a way to measure tools that never accept input, so this is asserted rather
    # than left to memory.
    check(
        "exactly three presented metrics, none of them interactive",
        [m[0] for m in METRICS] == ["first_byte", "idle_pss_mb", "bundle_mb"],
        str([m[0] for m in METRICS]),
    )
    # metric_value must read timings from the stat block and the other two off
    # the row directly -- reading idle_pss_mb as a dict silently yields None and
    # the memory column empties out without an error.
    probe_row = {
        "first_byte": {"min": 8.0, "p50": 9.0, "p95": 10.0, "n": 5},
        "idle_pss_mb": 45.0,
        "bundle_mb": 117.0,
    }
    check(
        "metric_value: p50 for timings, the scalar for memory and disk",
        metric_value(probe_row, "first_byte") == 9.0
        and metric_value(probe_row, "idle_pss_mb") == 45.0
        and metric_value(probe_row, "bundle_mb") == 117.0,
    )


    # -- ranking excludes thin and unmeasured rows -----------------------
    def row(name, key, p50, n=5, installed=True):
        return {"agent": name, "installed": installed, key: {"min": p50, "p50": p50, "p95": p50, "n": n}}

    rows = [row("fox-agent", "first_byte", 50), row("fast", "first_byte", 10), row("slow", "first_byte", 90), row("thin", "first_byte", 1, n=1)]
    rank, field = rank_of(rows, "first_byte")
    check("rank ignores n<3 samples (a lucky launch is not a comparison)", rank == 2 and field == 3, f"{rank} of {field}")
    rows2 = [row("fox-agent", "first_byte", 50), {"agent": "gone", "installed": False}]
    r2, f2 = rank_of(rows2, "first_byte")
    check("rank ignores n/a rows instead of ranking them last", r2 == 1 and f2 == 1, f"{r2} of {f2}")

    # -- the hermetic environment is actually hermetic -------------------
    # FOX_AGENT_HOME does NOT redirect the global config path (loadConfig
    # reads homedir()/.config/fox-agent/config.toml unless told otherwise), so
    # "no key, no network" TTFT was really spawning the developer's MCP
    # servers: measured 23.2s versus 0.25s for the same command.
    with tempfile.TemporaryDirectory() as tmp:
        env = _fox_env("http://127.0.0.1:1/v1", tmp)
        check("env: FOX_AGENT_CONFIG is set (FOX_AGENT_HOME alone is not enough)", bool(env.get("FOX_AGENT_CONFIG")))
        check("env: the config it points at exists and is empty", os.path.isfile(env["FOX_AGENT_CONFIG"]) and open(env["FOX_AGENT_CONFIG"]).read() == "")
        check("env: the catalog refresh is disabled", env.get("FOX_AGENT_MODELS_OFFLINE") == "1")
        check("env: a fake key is used, never a real one", env.get("FOX_AGENT_API_KEY") == "bench-fake-key")

    # -- the rig itself ---------------------------------------------------
    # Only what the bench still relies on: a forkless stream, a t0 at exec, and
    # PSS of a process tree. The probe/termios checks went with the interactive
    # metrics they existed for.
    if tmux_ready():
        with Launch(["/bin/sh", "-c", "printf 'A'; sleep 5"]) as L:
            if L.err:
                check("launch: session starts", False, L.err)
            else:
                check("launch: gate release yields a t0", L.t0 is not None)
                check("launch: pane pid is readable (PSS source)", L.pid is not None)
                first = L.wait_for(lambda ts, _b: ts, 5.0)
                check("stream: first byte arrives through pipe-pane", first is not None)
                if first is not None:
                    dt = L.ms_since_t0(first)
                    check("stream: first byte is timed from exec, not tmux spawn",
                          dt is not None and dt < 2000, f"{dt}ms")
                check("stream: no byte written before the gate is lost",
                      b"A" in L.bytes_since(0), repr(L.bytes_since(0)[:20]))

        # The clock is a timestamp, not a poll cadence. A write delayed by 0.4s
        # must be reported near 0.4s; polling capture-pane reported ~22ms steps
        # and a fork floor, which is how a 4.2ms "latency" got published.
        with Launch(["/bin/sh", "-c", "sleep 0.4; printf 'X'; sleep 5"]) as L:
            if not L.err:
                hit = L.wait_for(lambda ts, b: ts if b"X" in b else None, 5.0)
                if hit is None:
                    check("stream: delayed write is timed at the write", False, "no hit")
                else:
                    dt = L.ms_since_t0(hit)
                    check("stream: delayed write is timed at the write, +/-50ms",
                          350 < dt < 550, f"{dt:.1f}ms")

        # PSS must count the whole tree, not just the launcher: a node CLI's
        # workers hold real memory, and charging only the root understated
        # reported footprints by 2-8x.
        with Launch(["/bin/sh", "-c", "sleep 3 & sleep 5"]) as L:
            if not L.err and L.pid is not None:
                tree, nprocs = None, 0
                for _ in range(40):
                    tree, nprocs = _pss_tree(L.pid)
                    if tree is not None and nprocs and nprocs >= 2:
                        break
                    time.sleep(0.1)
                check("memory: PSS tree sees child processes", bool(nprocs and nprocs >= 2), f"procs={nprocs}")

    if fails:
        print(f"\nself-test FAILED ({len(fails)}): {', '.join(fails)}")
        return 1
    print("\nself-test ok")
    return 0


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


USAGE = """usage: bench.py [--quick] [--out DIR] [--only NAME,...] [--debug]
                [--self-test] [--help]

  --quick           2 launches per tool instead of 5 (smoke tests)
  --out DIR         output directory (default: <repo>/bench)
  --only NAME,...   measure only these tools, by label (requires --out)
  --debug           verbose narration to stderr
  --self-test       verify the measurement rig itself, then exit
  --help            this text
"""


# Options that consume the next argv entry. Kept in one place because the
# validation and the parsing below must agree: the first version of this
# whitelist listed only valueless flags, so `--out bench` (which every CI run
# and `bun run bench` passes) was rejected as "unknown option --out".
VALUED_FLAGS = ("--out", "--only")


def parse_args(argv):
    """Strict argv parse -> dict. Raises SystemExit(2) on anything unexpected.

    Written by hand rather than with argparse because argparse accepts
    abbreviations, and a mistyped `--on` silently becoming `--only` would
    change which tools are measured. Strict here means a CI typo fails loudly
    in two seconds instead of after a 40-minute run.
    """
    opts = {"quick": False, "debug": False, "self_test": False, "out": None, "only": None}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in ("--help", "-h"):
            print(USAGE, end="")
            raise SystemExit(0)
        if a == "--quick":
            opts["quick"] = True
        elif a == "--debug":
            opts["debug"] = True
        elif a == "--self-test":
            opts["self_test"] = True
        elif a in VALUED_FLAGS:
            # A following flag is not a value: `--out --help` must print usage,
            # not create a directory called "--help" (which is exactly what the
            # first version did, and it then measured the whole field).
            if i + 1 >= len(argv) or argv[i + 1].startswith("-"):
                print(f"bench: {a} needs a value\n\n{USAGE}", file=sys.stderr)
                raise SystemExit(2)
            key = a[2:]
            opts[key] = argv[i + 1]
            i += 1
        elif a.startswith("-"):
            print(f"bench: unknown option {a}\n\n{USAGE}", file=sys.stderr)
            raise SystemExit(2)
        else:
            print(f"bench: unexpected argument {a}\n\n{USAGE}", file=sys.stderr)
            raise SystemExit(2)
        i += 1
    return opts


def method_docs():
    """The method/caveat block written to results.json.

    A function rather than a literal inside main() so there is exactly one
    copy of this text: it is the contract for what the numbers mean, and a
    stale duplicate is how the docs drifted from the metrics before.
    """
    return {
        "metrics": (
            "Three presented metrics, all answerable without a login and without a keystroke: "
            "first_byte = exec to the first byte the tool writes; idle_pss_mb = resident memory of "
            "the whole process tree at rest; bundle_mb = on-disk footprint. "
            "--version and the full min/p50/p95/n distribution are collected into results.json but "
            "not presented, because --version flatters tools that short-circuit before loading their "
            "bundle."
        ),
        "why_only_three": (
            "Time-to-interactive and keystroke latency were removed, not tuned. Both require typing "
            "into a TUI, so a tool that shows a trust prompt, a login screen or an error modal cannot "
            "be measured at all: in the last full field run that was 14 of 22 tools, i.e. a column "
            "that was mostly n/a. A metric two thirds of the field cannot produce is not a "
            "comparison, so the metric was dropped rather than the caveat being published."
        ),
        "timings": (
            "Every duration comes from a forkless byte stream: the tool is launched in a detached "
            "tmux session behind a gate FIFO, `pipe-pane` is attached before the gate is released, "
            "and bytes are timestamped as they are read. t0 is the gate release (the exec), so "
            "tmux's own spawn cost is not charged to the tool and no early byte can be missed. "
            "An earlier version polled `tmux capture-pane`, which forks tmux: measured 9.2ms p50 / "
            "32.2ms p95 per sample, an undeclared ~22ms floor under every number it published (it "
            "reported a 4.2ms input latency -- below the cost of one observation)."
        ),
        "statistics": (
            "p50 of successful launches is published, with min and p95 in the table. Publishing only "
            "`min` hid the spread: a shipped opencode first-byte row was 101ms min against 1539ms "
            f"p95. Rows with fewer than {MIN_RANK_N} successful samples are reported but not ranked, "
            "because one lucky launch is not a comparison."
        ),
        "timeouts": (
            "A timeout is recorded as a failure and excluded from the statistics, never published as "
            "a duration. An earlier version's 15s probe timeout appeared in the table as measurement "
            "(opencode 15203.1ms, amp 15053.7ms, kilo 16476.3ms) and was RANKED."
        ),
        "bundle": (
            "the binary itself; a launcher's exec target where a wrapper hands off by path (including "
            "wrappers that compute that target at runtime from a version file, resolved by globbing "
            "the literal tail); or the package dir for script CLIs, minus any bundled node/bun "
            "runtime -- weighing a 2KB shim would pretend node_modules are free, and counting the "
            "interpreter would make every JS tool report the same ~140MB."
        ),
        "memory": (
            "PSS of the whole process tree (children included: a node CLI's workers hold real "
            "memory), so shared pages are divided rather than double-counted. Read after the tree "
            "converges, floored over launches because extra processes only ever ADD."
        ),
        "load": (
            "load_avg and cpu_count are recorded because they change the numbers: the same tool "
            "measured 2.9s and 10.3s for first byte on this box 40 minutes apart, at load 4.1 versus "
            "idle on 4 cores."
        ),
        "missing": "A tool that is not installed is an n/a row and is excluded from rank counts, never estimated.",
    }



def main():
    opts = parse_args(sys.argv[1:])
    if opts["self_test"]:
        sys.exit(self_test())
    quick = opts["quick"]
    # A partial field must not silently replace the committed full one. This
    # actually happened during development: `--only fox-agent` wrote a 1-row
    # results.json over the 22-row file in bench/, and nothing failed -- the
    # table just quietly became "fox-agent is 1st of 1" for every metric.
    if opts["only"] and not opts["out"]:
        print(
            "bench: --only requires an explicit --out DIR\n"
            "       (writing a partial field over bench/ would replace the committed results "
            "with a 1-row table that still renders as if it were the whole story)",
            file=sys.stderr,
        )
        sys.exit(2)
    out = opts["out"] or os.path.join(ROOT, "bench")
    only = None
    if opts["only"]:
        only = {s.strip().lower() for s in opts["only"].split(",") if s.strip()}
    os.makedirs(out, exist_ok=True)

    n_start = 2 if quick else 4
    launches = 2 if quick else 5

    if not tmux_ready():
        print("bench: tmux is required (first-byte timing runs each tool in a pty)", file=sys.stderr)
        sys.exit(2)

    field = [(lb, bins) for lb, bins in AGENTS if only is None or lb in only]
    rows = []
    for i, (label, bins) in enumerate(field):
        path = which(bins)
        step(label, f"[{i + 1}/{len(field)}] locating", " ".join(bins))
        if not path:
            rows.append({"agent": label, "installed": False})
            print(f"{label}: not installed", flush=True)
            continue
        rows.append(measure(label, path, n_start, launches))
        print(flush=True)

    # opencode v2 lives under a fixed binary name (`opencode2`); measured in
    # the same pass so it is not a second, differently-configured run.
    seen_oc = set()
    for bin_name, fixed in OPENCODE_BINS:
        if fixed and only is not None and fixed.lower() not in only and bin_name not in only:
            continue
        path = shutil.which(bin_name)
        if not path:
            if fixed:
                rows.append({"agent": fixed, "installed": False})
                print(f"{fixed}: not installed", flush=True)
            continue
        ver = version_of(path)
        label = fixed or ver
        if label in seen_oc:
            print(f"{bin_name}: {ver} (duplicate {label}, kept first)")
            continue
        seen_oc.add(label)
        rows.append(measure(label, path, n_start, launches))
        print(flush=True)

    fox_row = next((r for r in rows if r["agent"] == "fox-agent" and r.get("installed")), None)
    fox_extra = {}
    if fox_row:
        fake, base = start_fake_provider()
        if base:
            try:
                # Sampled, not taken once. Measured on an idle 4-core box, a
                # single headless turn ranged 16.4s to 36.2s -- a 2x spread
                # that is fox's own CPU-bound startup, not the provider (the
                # fake is local and answers instantly, and `user` CPU is ~10s
                # per run). One sample would have published whichever end of
                # that spread the run happened to catch.
                ttfts = []
                for i in range(n_start):
                    step("fox-agent", f"headless TTFT vs scripted provider {i + 1}/{n_start}")
                    v = fox_ttft(base)
                    if v is not None:
                        ttfts.append(v)
                step("fox-agent", "headless peak RSS")
                rss = fox_headless_rss(base)
                ttft_block = stat_block(ttfts)
                fox_extra = {
                    "ttft_ms": round(ttft_block["p50"], 1) if ttft_block["p50"] is not None else None,
                    "ttft": {k: (round(v, 1) if isinstance(v, float) else v) for k, v in ttft_block.items()},
                    "headless_peak_rss_mb": round(rss, 1) if rss is not None else None,
                }
                print(f"fox extra: {fox_extra}", flush=True)
            finally:
                fake.kill()
        else:
            print("fox extra: fake provider unavailable", flush=True)
    fox_extra["method"] = (
        "headless `fox -p ... --json` against the repo's scripted local provider (no key, no network); "
        "TTFT = spawn to the first parsed {\"type\":\"text\"} event; peak RSS via /usr/bin/time -v"
    )

    import platform

    # Recorded because it changes the numbers: on a contended box the same
    # tool measured 2.9s and 10.3s for first byte in two runs 40 minutes
    # apart (load average 4.1 on 4 cores versus idle). Without this a reader
    # cannot tell a slow tool from a busy machine.
    try:
        load1, load5, load15 = os.getloadavg()
    except (OSError, AttributeError):
        load1 = load5 = load15 = None


    payload = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "machine": f"{platform.system()} {platform.machine()} ({platform.release()})",
        "cpu_count": os.cpu_count(),
        "load_avg": [round(v, 2) if v is not None else None for v in (load1, load5, load15)],
        "method": method_docs(),
        "rows": rows,
        "fox": fox_extra,
    }
    with open(os.path.join(out, "results.json"), "w") as f:
        json.dump(payload, f, indent=2)

    render_outputs(out, rows, fox_extra, payload)
    print("wrote", out, flush=True)


if __name__ == "__main__":
    main()

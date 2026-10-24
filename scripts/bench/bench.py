#!/usr/bin/env python3
"""Multi-agent harness benchmark.

Measures what `--version` cannot: the cost of actually starting the thing and
of typing into it.

WHY THIS FILE WAS REWRITTEN
---------------------------
The previous version derived every interactive number by polling
`tmux capture-pane`, once per sample of a 5ms-sleep loop. A single
`capture-pane` forks tmux, which measured 9.2ms at p50 and 32.2ms at p95 on a
4-core box -- so the poll cadence was ~22ms, not 5ms, and every published
figure carried a floor and a jitter it never declared. The tell was a
published fox input latency of 4.2ms: BELOW the cost of one observation, a
number that cannot exist. Worse, the 15s probe timeout and the 8s readiness
cap leaked into the table as data (opencode 15203.1ms, amp 15053.7ms, kilo
16476.3ms, continue 8008.5ms are all timeouts wearing a measurement's
clothes), and only `min` was published, which hid the shipped opencode
first-byte spread of 101ms (min) to 1539ms (p95).

This version takes the measurement out of the polling loop:

  * Bytes come from `tmux pipe-pane` into a FIFO, drained by a thread. No
    fork per sample, no cadence floor, timestamps on the actual write.
  * The tool is launched behind a GATE FIFO, so the clock starts at exec
    rather than at tmux spawn -- tmux's own ~30ms is no longer charged to
    the tool, and early bytes cannot be missed because the pipe is attached
    before the program is released.
  * One launch yields every timing metric (old: 14 launches per tool).
  * Timeouts are counted as failures and never enter the statistics.
  * p50 is the headline, with min/p95/n beside it; rows with fewer than 3
    successful samples are reported but not ranked.

Per tool (best effort -- anything not installed is n/a, never invented):
  - bundle:   on-disk bytes of the resolved executable (following launcher
              wrappers to the binary they exec; a script CLI is weighed as
              its package dir, minus any bundled node/bun runtime)
  - startup:  best of N `--version` runs -- the harness floor, for reference
  - first_byte: exec -> first byte the tool writes (the literal name)
  - first_paint: exec -> first printable glyph (what a user waits for)
  - ttfi:     exec -> probe rendered, where the probe is typed as soon as the
              tool owns the tty and has gone quiet (time to interactive)
  - key_latency: keystroke -> probe rendered, with startup removed (pure
              input handling, ranked among render-signal tools only)
  - idle_pss: settled resident set of the whole process tree

Plus fox-agent only (hermetic, no API key, no network):
  - ttft: headless `fox -p ... --json` against the repo's scripted fake
    provider, spawn to first `{"type":"text"}` event
  - rss:  peak resident set of that same headless turn (`/usr/bin/time -v`)

Outputs (all under bench/):
  results.json, table.md, snippet.md, bench.svg (one dashboard image)

Usage:
  python3 scripts/bench/bench.py [--quick] [--out bench] [--only NAME,...]
  python3 scripts/bench/bench.py --self-test
  bun run bench          # build + bench in one step (see package.json)

--debug: verbose per-step timing + decision logging to stderr.
--only:  restrict the field to the named tools (smoke tests on a dev box).
"""
import glob
import json
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
# One detached tmux session per launch, three sockets of information out of it:
#
#   bytes  : `pipe-pane` -> FIFO -> drain thread. Forkless, timestamped at the
#            write. This is where every timing number comes from.
#   screen : `capture-pane`, used TWICE per launch (to choose a probe the
#            screen does not already contain, and to verify it landed). It is
#            a fork, so it is never in a loop.
#   tty    : the pane's pty, opened once; termios reads are then free and say
#            whether the tool took the terminal (ECHO off -> it renders).
#
# The tool starts behind a GATE FIFO: tmux spawns `sh`, which blocks on the
# gate, and only then execs the tool. The pipe is attached before the gate is
# released, so (a) no early byte can be missed and (b) t0 is the exec, not
# tmux's own spawn cost.
# ---------------------------------------------------------------------------

GATE_SCRIPT = 'read _ < "$1" || true; shift; exec "$@"'
TMUX_ROWS = 40
TMUX_COLS = 120

# Probe alphabet. Letters, because every TUI inserts a letter into its input
# box; no control chars and no keys that commonly act as global shortcuts
# (q/Esc/Enter/Tab), so the probe is a keystroke and not a command.
PROBE_ALPHABET = "zwxjkvby"


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

    def termios_flags(self):
        """lflag of the pane's pty, or None. Opened once, then free."""
        if not hasattr(self, "tty") or not self.tty:
            return None
        if self.tty_fd is None:
            try:
                self.tty_fd = os.open(self.tty, os.O_RDONLY | os.O_NOCTTY | os.O_NONBLOCK)
            except OSError:
                return None
        try:
            return termios.tcgetattr(self.tty_fd)[3]
        except (termios.error, OSError):
            return None

    def echo_mode(self):
        """'render' when the app disabled ECHO (it paints its own screen),
        'kernel-echo' when the line discipline still echoes for it, None when
        unreadable.

        A cooked-mode CLI has the kernel echo each byte before the app wakes,
        so its "latency" describes the kernel, not the tool -- measured: `cat`
        in a pty times ~0.3ms with no UI at all. Ranking those against a
        raw-mode TUI that must repaint a cell is meaningless, so the class is
        recorded and latency is ranked within `render` only.
        """
        lflag = self.termios_flags()
        if lflag is None:
            return None
        return "kernel-echo" if lflag & termios.ECHO else "render"

    def screen(self):
        """The rendered screen as text, or '' when the pane is gone.

        -J rejoins lines the terminal wrapped (a probe split across a row
        boundary reads as one string again); -S -400 also reads scrollback, so
        a startup banner that pushed the input box out of the visible window
        cannot hide the probe. Note that the scrollback region is reported as
        blank lines, so a caller must look for CONTENT, not for a non-empty
        string.
        """
        return _tmux(self.server, "capture-pane", "-p", "-J", "-S", "-400", "-t", self.name)

    def rendered_text(self, limit=4000):
        """Non-whitespace screen content, or ''. Used to decide whether a TUI
        has actually painted something the eye can see."""
        return "".join(self.screen()[:limit]).strip()

    def send(self, text):
        _tmux(self.server, "send-keys", "-l", "-t", self.name, text)

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


class FirstGlyph:
    """Stateful scanner: the first printable byte written OUTSIDE an escape
    sequence.

    A stateless "is there a byte in 32..126" test is wrong, and wrong in a way
    that silently collapses two metrics into one: every TUI's boot sequence
    starts with `\\e[?1049h` (alternate screen) and `\\e[?25l` (hide cursor),
    whose parameters and final bytes (`[`, `?`, `1`, `0`, `4`, `9`, `h`, `l`)
    are all printable. Tested naively, "first paint" and "first byte" return the
    same timestamp for every tool -- which is what this bench did on its first
    run, and is exactly the kind of plausible-but-meaningless number the
    rewrite is meant to eliminate.

    State is carried across chunks because an escape sequence routinely spans
    reads (`\\e[` in one chunk, `?25l` in the next).
    """

    GROUND, ESC, CSI, OSC, OSC_ESC, STR = range(6)

    def __init__(self):
        self.state = self.GROUND

    def __call__(self, ts, chunk):
        for b in chunk:
            if self.state == self.GROUND:
                if b == 0x1B:  # ESC
                    self.state = self.ESC
                elif b == 0x7F:  # DEL is control, not a glyph
                    continue
                elif b == 0x20:  # a SPACE is not a visible glyph
                    continue
                elif b > 0x20:
                    # Includes >=0x80: UTF-8 continuation bytes are glyph
                    # content, and a multi-byte glyph's first byte is enough
                    # to say "something was rendered".
                    return ts
            elif self.state == self.ESC:
                if b == 0x5B:  # '['
                    self.state = self.CSI
                elif b == 0x5D:  # ']'
                    self.state = self.OSC
                elif b in (0x50, 0x58, 0x5E, 0x5F):  # DCS, SOS, PM, APC
                    self.state = self.STR
                else:
                    # two-byte escape (e.g. ESC 7, ESC =, ESC M)
                    self.state = self.GROUND
            elif self.state == self.CSI:
                # parameters/intermediates are 0x20-0x3F, final byte 0x40-0x7E
                if 0x40 <= b <= 0x7E:
                    self.state = self.GROUND
            elif self.state == self.OSC:
                if b == 0x07:  # BEL terminates an OSC title
                    self.state = self.GROUND
                elif b == 0x1B:
                    self.state = self.OSC_ESC
            elif self.state == self.OSC_ESC:
                # ESC \ (ST) ends it; anything else means the ESC started a
                # new sequence inside the OSC text
                self.state = self.GROUND if b == 0x5C else self.ESC
            elif self.state == self.STR:
                if b == 0x1B:
                    self.state = self.OSC_ESC
                elif b == 0x07:
                    self.state = self.GROUND
        return None


def _probe_matcher(probe):
    """Match `probe` across chunk boundaries; return the completing timestamp.

    CT-framed TUIs repaint per cell, so a two-character probe can arrive as two
    chunks. Matching the joined bytes after the keystroke is what makes this
    correct for cell-diffing renderers -- matching single chunks was the bug
    that produced wrong published numbers in the byte-scanning predecessor.
    """
    needle = probe.encode()
    acc = bytearray()

    def pred(ts, chunk):
        acc.extend(chunk)
        if acc.find(needle) >= 0:
            return ts
        # keep only a tail that could still be a prefix of the needle
        if len(acc) > len(needle) * 4:
            del acc[: len(acc) - len(needle) * 2]
        return None

    return pred


def _pick_probe(screen_text):
    """Two letters not already on screen, so a later match is meaningful."""
    out = []
    for c in PROBE_ALPHABET:
        if c not in screen_text:
            out.append(c)
        if len(out) == 2:
            return "".join(out)
    # screen is dense in probe letters; fall back to a pair that is at least
    # not a single character (still verifiable on screen afterwards)
    return PROBE_ALPHABET[:2]


def measure_launch(path, ready_budget=20.0, ttfi_budget=15.0, settle_budget=8.0, latency_budget=8.0):
    """One launch -> every interactive metric, or explicit failures.

    Returns a dict of samples. Nothing that timed out is ever a number: a
    timeout lands in `failed`, because the predecessor published its 15s probe
    timeout as a measurement (opencode 15203.1ms) and ranked it.
    """
    rec = {
        "first_byte_ms": None,
        "first_paint_ms": None,
        "ready_ms": None,
        "ttfi_ms": None,
        "key_latency_ms": None,
        "signal": None,
        "pss_mb": None,
        "pss_root_mb": None,
        "procs": None,
        "failed": [],
    }
    with Launch([path], extra_env={"FOX_AGENT_NO_TRUST_CHECK": "1"}) as L:
        if L.err:
            rec["failed"].append(f"launch: {L.err}")
            return rec

        # 1. exec -> first byte. The literal name, from the byte stream.
        first = L.wait_for(lambda ts, _b: ts, 40.0)
        if first is None:
            rec["failed"].append("no output within 40s")
            return rec
        rec["first_byte_ms"] = L.ms_since_t0(first)

        # 2. exec -> first printable glyph outside an escape sequence. What a
        # user actually waits for: the first BYTE is usually only ANSI
        # bookkeeping (fox writes `\e[?1049h\e[?25l` before compositing), and
        # a naive printable-byte test counts the parameters inside that escape
        # -- collapsing this metric into first_byte for every tool.
        paint = L.wait_for(FirstGlyph(), 40.0, mark=0)
        if paint is not None:
            rec["first_paint_ms"] = L.ms_since_t0(paint)

        # 3. readiness: the app owns the tty (ECHO off), has actually PUT
        # SOMETHING ON SCREEN, and has stopped writing. Readiness is not a
        # metric -- it is only when we are allowed to type -- but getting it
        # wrong silently destroys the input metrics below.
        #
        # Both halves matter. opencode switches to raw mode ~1.5s in and then
        # goes quiet with a frame of nothing but spaces, so an
        # echo-mode-only gate typed into a still-booting app: the keystroke was
        # swallowed and the row read as "never interactive" (the predecessor
        # published the resulting 15s timeout as 15203.1ms of latency). A
        # printable-byte test is not enough either -- a space IS a printable
        # glyph -- so readiness requires NON-WHITESPACE content.
        #
        # capture-pane is a fork, so it is polled coarsely (>=150ms apart). The
        # expensive mistake the old bench made was forking per SAMPLE inside a
        # timing loop; a bounded poll during a startup gate is fine, because
        # nothing here is being timed.
        ready_deadline = time.perf_counter() + ready_budget
        ready = False
        last_screen_check = 0.0
        while time.perf_counter() < ready_deadline:
            if L.echo_mode() == "render" and L.quiet_for(0.15):
                now = time.perf_counter()
                if now - last_screen_check >= 0.15:
                    last_screen_check = now
                    if L.rendered_text():
                        ready = True
                        break
            if not L.alive():
                break
            time.sleep(0.02)
        rec["ready_ms"] = L.ms_since_t0(time.perf_counter())

        pre = L.screen()
        probe = _pick_probe(pre)
        if ready:
            # 4. time to interactive: type now, clock from exec.
            mark = L.mark()
            L.send(probe)
            hit = L.wait_for(_probe_matcher(probe), ttfi_budget, mark=mark)
            if hit is not None:
                rec["ttfi_ms"] = L.ms_since_t0(hit)
            else:
                rec["failed"].append(f"ttfi: probe {probe!r} did not render")
            # the probe is only a measurement if it is really on screen
            if rec["ttfi_ms"] is not None and probe not in L.screen():
                rec["ttfi_ms"] = None
                rec["failed"].append("ttfi: probe not on screen (stream false positive)")
        else:
            rec["failed"].append("ttfi: never became interactive")

        # 5. settle, then measure pure keystroke handling. The settle wait is
        # startup observation and must NOT be inside the latency clock: an
        # earlier version charged it and read `cat` at 3007ms instead of
        # ~0.3ms.
        settled = False
        settle_deadline = time.perf_counter() + settle_budget
        while time.perf_counter() < settle_deadline:
            if L.quiet_for(0.4):
                settled = True
                break
            if not L.alive():
                break
            time.sleep(0.01)

        # 6. memory at rest, before the latency probe perturbs anything.
        if L.pid is not None:
            _pss_start = time.perf_counter()
            while True:
                tree, nprocs = _pss_tree(L.pid)
                if tree is not None or time.perf_counter() - _pss_start > 2.0:
                    break
                time.sleep(0.1)
            if tree is not None:
                rec["pss_mb"] = tree
                rec["pss_root_mb"] = _pss_of(L.pid)
                rec["procs"] = nprocs

        rec["signal"] = L.echo_mode()

        if settled and L.alive():
            pre2 = L.screen()
            probe2 = _pick_probe(pre2 + probe)
            mark2 = L.mark()
            t_key = time.perf_counter()
            L.send(probe2)
            hit2 = L.wait_for(_probe_matcher(probe2), latency_budget, mark=mark2)
            if hit2 is not None:
                on_screen = probe2 in L.screen()
                if on_screen:
                    rec["key_latency_ms"] = (hit2 - t_key) * 1000
                else:
                    rec["failed"].append("latency: probe not on screen (stream false positive)")
            else:
                rec["failed"].append(f"latency: probe {probe2!r} did not render")
        elif not settled:
            rec["failed"].append("latency: never settled")

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
    step(label, "probing version")
    ver = version_of(path)
    step(label, "weighing on-disk footprint", os.path.basename(path))
    disk, kind = footprint(path, label)
    step(label, f"timing `--version` startup (best of {n_start})")
    startup = best_startup(path, n_start, ver=ver)

    samples = {k: [] for k in ("first_byte_ms", "first_paint_ms", "ttfi_ms", "key_latency_ms", "pss_mb")}
    failures = []
    signals = []
    procs = None
    pss_root = None
    for i in range(launches):
        step(label, f"interactive launch {i + 1}/{launches}")
        rec = measure_launch(path)
        for k in samples:
            if rec.get(k) is not None:
                samples[k].append(rec[k])
        failures.extend(rec["failed"])
        if rec["signal"]:
            signals.append(rec["signal"])
        if rec["procs"]:
            procs = max(procs or 0, rec["procs"])
        if rec["pss_root_mb"]:
            pss_root = rec["pss_root_mb"] if pss_root is None else min(pss_root, rec["pss_root_mb"])

    # The signal of record: if ANY launch had the tool rendering its own echo,
    # it is a render-mode tool (a boot-time sample in cooked mode is a TUI that
    # had not taken the tty yet, which is why sampling once was wrong).
    signal = "render" if "render" in signals else (signals[0] if signals else None)

    row = {
        "agent": label,
        "installed": True,
        "bin": path,
        "version": ver,
        "bundle_mb": disk,
        "bundle_kind": kind,
        "startup": stat_block(startup),
        "first_byte": stat_block(samples["first_byte_ms"]),
        "first_paint": stat_block(samples["first_paint_ms"]),
        "ttfi": stat_block(samples["ttfi_ms"]),
        "key_latency": stat_block(samples["key_latency_ms"]),
        "input_signal": signal,
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

    pss = f(row["idle_pss_mb"], 1) + "MB" if row["idle_pss_mb"] is not None else "-"
    print(
        f"{label}: {ver}\n"
        f"  bundle={f(disk, 1)}MB({kind}) "
        f"startup={f(row['startup']['p50'])} "
        f"1st_byte={f(row['first_byte']['p50'])} "
        f"1st_paint={f(row['first_paint']['p50'])} "
        f"ttfi={f(row['ttfi']['p50'])} "
        f"latency={f(row['key_latency']['p50'])} "
        f"pss={pss} signal={signal or '-'} n={row['first_byte']['n']}",
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

MEDALS = {0: "1", 1: "2", 2: "3"}


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def fmt_ms(v):
    return f"{v:,.0f}" if v >= 100 else f"{v:.1f}"


def dashboard_svg(panels, out_path, note):
    """panels: [(title, subtitle, rows, unit, fmt)] as one 3x2 image.

    One image rather than six files: GitHub renders a single row height
    regardless of how separate charts would wrap, and the shared header is the
    only place the method note can live once without repeating it per chart.
    fox-agent is orange everywhere; medals mark the top three.
    """
    W, GUT, PAD, LANE_LABEL = 1180, 20, 24, 148
    NCOL = 3
    COLW = (W - PAD * 2 - GUT * (NCOL - 1)) // NCOL
    HEADER_H, LANE_H, SUB_H, FOOT_H = 84, 30, 18, 34
    NROW = -(-len(panels) // NCOL)
    n_rows = max(len(p[2]) for p in panels)
    H = HEADER_H + SUB_H + NROW * (LANE_H * n_rows + SUB_H + SUB_H) + FOOT_H
    L = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" font-family="ui-monospace,Menlo,Consolas,monospace">',
        f'<rect width="{W}" height="{H}" fill="{BG}"/>',
        f'<rect width="{W}" height="{HEADER_H}" fill="{BG2}"/>',
        f'<rect x="0" y="{HEADER_H - 2}" width="{W}" height="2" fill="{ACC}"/>',
        f'<text x="{PAD}" y="36" fill="{INK}" font-size="20" font-weight="bold">fox-agent · harness bench</text>',
        f'<text x="{PAD}" y="58" fill="{MUT}" font-size="12">startup · TUI latency · footprint · idle memory — github actions ubuntu-latest, refreshed weekly</text>',
        f'<text x="{PAD}" y="76" fill="{MUT}" font-size="11">{esc(note)}</text>',
    ]
    for pi_, (title, subtitle, rows, unit, fmt) in enumerate(panels):
        col, row_i = pi_ % NCOL, pi_ // NCOL
        x0 = PAD + col * (COLW + GUT)
        y0 = HEADER_H + row_i * (LANE_H * n_rows + SUB_H + SUB_H) + SUB_H
        L.append(f'<text x="{x0}" y="{y0 - 6}" fill="{INK}" font-size="14">{esc(title)}</text>')
        L.append(f'<rect x="{x0}" y="{y0 - 2}" width="{COLW}" height="1" fill="{GRID}"/>')
        have = sorted([r for r in rows if r[1] is not None], key=lambda r: r[1])
        missing = [r for r in rows if r[1] is None]
        maxv = max([r[1] for r in have] or [1])
        bx = x0 + LANE_LABEL
        bw = COLW - LANE_LABEL - 78
        for i, (label, v, is_fox) in enumerate(have + missing):
            y = y0 + i * LANE_H
            ranked = v is not None
            medal = MEDALS.get(i, "") if ranked else ""
            label_col = ACC if is_fox else (INK if ranked and i < 3 else MUT)
            L.append(f'<text x="{x0}" y="{y + 14}" fill="{label_col}" font-size="12">{esc(label[:19])}</text>')
            if v is None:
                L.append(f'<rect x="{bx}" y="{y + 2}" width="{bw}" height="14" rx="3" fill="{BAR_NA}"/>')
                L.append(f'<text x="{bx + 8}" y="{y + 13}" fill="{MUT}" font-size="10">n/a</text>')
            else:
                w = max(4, (v / maxv) * bw)
                fill = ACC if is_fox else BAR
                L.append(f'<rect x="{bx}" y="{y + 2}" width="{w:.0f}" height="14" rx="3" fill="{fill}"/>')
                vt = f"{fmt(v)} {unit}"
                L.append(
                    f'<text x="{bx + bw + 6}" y="{y + 13}" fill="{INK if is_fox else MUT}" font-size="11">'
                    f"{medal}{esc(vt)}</text>"
                )
        if subtitle:
            L.append(f'<text x="{x0}" y="{y0 + LANE_H * n_rows + 12}" fill="{MUT}" font-size="10">{esc(subtitle)}</text>')
    L.append(
        f'<text x="{PAD}" y="{H - 12}" fill="{MUT}" font-size="10">'
        "lower is better on every lane · numbers are p50 of successful launches · n/a = not installed or never measured · "
        "full method + per-launch spread in bench/table.md</text>"
    )
    L.append("</svg>")
    with open(out_path, "w") as f:
        f.write("\n".join(L) + "\n")


# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

# One entry per lane: (key, column label, unit, formatter). Order is the order
# the README summary lists them in -- the headline metric first. The optional
# 5th item restricts the ranking pool; latency needs it because kernel-echo
# tools are not racing the same event as a raw-mode TUI (see echo_mode).
METRICS = [
    ("first_byte", "TUI 1st byte", "ms", fmt_ms, None),
    ("first_paint", "TUI 1st paint", "ms", fmt_ms, None),
    ("ttfi", "TUI 1st input", "ms", fmt_ms, None),
    ("key_latency", "input latency", "ms", fmt_ms, "render"),
    ("bundle_mb", "bundle", "MB", lambda v: f"{v:.0f}", None),
    ("idle_pss_mb", "idle PSS", "MB", lambda v: f"{v:.0f}", None),
    ("startup", "`--version`", "ms", fmt_ms, None),
]


def metric_value(row, key):
    """The published number for one lane: p50, or None.

    p50 rather than min: min is the luckiest single launch and hides the
    spread (the shipped opencode first-byte row was 101ms min / 1539ms p95).
    """
    if key in ("bundle_mb", "idle_pss_mb"):
        return row.get(key)
    blk = row.get(key) or {}
    return blk.get("p50")


def metric_n(row, key):
    blk = row.get(key) or {}
    return blk.get("n", 0) if isinstance(blk, dict) else 0


def rank_of(rows, key, fox_name="fox-agent", only=None):
    """fox's position for one metric plus the field size.

    Ties share a rank (1 + number of strictly better tools). Rows that were not
    measured, or that have fewer than MIN_RANK_N samples, are excluded rather
    than ranked last -- an n/a row is not a slow one, and one lucky launch is
    not a comparison.
    """
    pool = [r for r in rows if r.get("installed") and (only is None or r.get("input_signal") == only)]
    vals = []
    for r in pool:
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


def render_outputs(out, rows, fox_extra, payload):
    """Write every generated artifact from already-measured rows."""
    is_fox = lambda r: r["agent"] == "fox-agent"  # noqa: E731

    def panel_rows(only=None, key=None):
        src = [r for r in rows if not only or r.get("input_signal") == only]
        return [(r["agent"], metric_value(r, key), is_fox(r)) for r in src]

    render_only = [r for r in rows if r.get("input_signal") == "render"]
    excluded = sum(1 for r in rows if r.get("installed") and r.get("input_signal") != "render")
    p50_note = "p50 of successful launches"

    dashboard_svg(
        [
            (
                "1st byte — exec to first byte",
                f"literal stream position · {p50_note} · lower is better",
                panel_rows(key="first_byte"),
                "ms",
                fmt_ms,
            ),
            (
                "1st paint — exec to first glyph",
                f"first printable char on the wire · {p50_note} · lower is better",
                panel_rows(key="first_paint"),
                "ms",
                fmt_ms,
            ),
            (
                "1st input — spawn to interactive",
                f"typed once the app owns the tty · {p50_note} · lower is better",
                panel_rows(key="ttfi"),
                "ms",
                fmt_ms,
            ),
            (
                "input latency (render only)",
                f"keystroke to glyph, startup removed · {excluded} tool(s) excluded (kernel-echo)",
                panel_rows(only="render", key="key_latency"),
                "ms",
                fmt_ms,
            ),
            (
                "bundle size",
                "binary, or package dir for script CLIs · lower is better",
                panel_rows(key="bundle_mb"),
                "MB",
                lambda v: f"{v:.0f}",
            ),
            (
                "idle memory",
                "PSS of the whole process tree at rest · lower is better",
                panel_rows(key="idle_pss_mb"),
                "MB",
                lambda v: f"{v:.0f}",
            ),
        ],
        os.path.join(out, "bench.svg"),
        "numbers are p50 with min/p95 in the table · durations from a forkless pipe-pane stream (no polling floor)",
    )

    def cell(v, nd=1, unit=""):
        return "—" if v is None else f"{v:.{nd}f}{unit}"

    # full-precision record: every field, including the spread that the old
    # single-value table could not show
    T = [
        "| agent | version | bundle (MB) | kind | `--version` min/p50/p95 | 1st byte min/p50/p95 | 1st paint min/p50/p95 "
        "| 1st input min/p50/p95 | latency min/p50/p95 | signal | idle PSS (MB) | n |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        if not r.get("installed"):
            T.append(f"| {r['agent']} | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |")
            continue
        name = f"**{r['agent']}**" if r["agent"] == "fox-agent" else r["agent"]

        def trip(key):
            """min/p50/p95 for one metric, or an em dash when it was never
            measured. The spread IS the record: the predecessor published a
            single best-of-N value and so could not show that a tool's good
            launch and its typical launch differed by 15x."""
            blk = r.get(key) or {}
            if not isinstance(blk, dict) or blk.get("p50") is None:
                return "—"
            return f"{cell(blk['min'])}/{cell(blk['p50'])}/{cell(blk['p95'])}"

        T.append(
            f"| {name} | {r['version']} | {cell(r.get('bundle_mb'))} | {r.get('bundle_kind', '—')} | "
            f"{trip('startup')} | {trip('first_byte')} | {trip('first_paint')} | {trip('ttfi')} | "
            f"{trip('key_latency')} | {r.get('input_signal') or '—'} | {cell(r.get('idle_pss_mb'))} | "
            f"{r.get('launches', 0)} |"
        )
    table_md = "\n".join(T) + "\n"
    with open(os.path.join(out, "table.md"), "w") as f:
        f.write(table_md)

    # README snapshot: one row per metric (fox's score + rank), everything else
    # folded. A 22-row grid of competitors is a reference document, not a
    # headline -- but it is still generated and still one click away.
    fox_row = next((r for r in rows if r["agent"] == "fox-agent" and r.get("installed")), None)
    HT = ["| metric | fox-agent | rank |", "|---|---|---|"]
    for key, label, _unit, fmt, only in METRICS:
        val = metric_value(fox_row, key) if fox_row else None
        rank, field = rank_of(rows, key, only=only)
        if val is None:
            HT.append(f"| {label} | — | — |")
            continue
        rank_s = f"**#{rank}** of {field}" if rank is not None else f"— of {field}"
        HT.append(f"| {label} | **{fmt(val)}** | {rank_s} |")
    summary_md = "\n".join(HT)

    # rounded per-agent grid, folded
    GT = [
        "| agent | bundle | 1st byte | 1st paint | 1st input | input latency | signal | idle PSS |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        if not r.get("installed"):
            GT.append(f"| {r['agent']} | — | — | — | — | — | — | — |")
            continue
        name = f"**{r['agent']}**" if r["agent"] == "fox-agent" else r["agent"]

        def p50(key, unit="", nd=0):
            v = metric_value(r, key)
            return "—" if v is None else f"{v:.{nd}f} {unit}".strip()

        sig = r.get("input_signal") or "—"
        if sig == "kernel-echo":
            sig = "kernel-echo (tty)"
        GT.append(
            f"| {name} | {p50('bundle_mb', 'MB')} | {p50('first_byte', 'ms')} | {p50('first_paint', 'ms')} | "
            f"{p50('ttfi', 'ms')} | {p50('key_latency', 'ms')} | {sig} | {p50('idle_pss_mb', 'MB')} |"
        )
    grid_md = "\n".join(GT)

    failures = sorted({(r["agent"], f) for r in rows if r.get("installed") for f in r.get("failures", [])})

    S = [summary_md, ""]
    if fox_extra.get("ttft_ms") is not None:
        rss = fox_extra.get("headless_peak_rss_mb")
        rss_s = f"{rss:.0f} MB" if rss is not None else "n/a (/usr/bin/time missing)"
        S.append(
            f"fox-agent headless vs scripted local provider: time to first token "
            f"**{fox_extra['ttft_ms']:.0f} ms**, peak RSS **{rss_s}**."
        )
        S.append("")
    S += [
        "<details><summary>every tool, every metric</summary>",
        "",
        "![harness bench dashboard](bench/bench.svg)",
        "",
        grid_md,
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
        # A failure is published, not swallowed: the predecessor ranked its own
        # timeouts as measurements (opencode 15203.1ms was the 15s probe
        # timeout), which made a hang indistinguishable from a slow tool.
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

    # -- probe matching across chunk boundaries ---------------------------
    m = _probe_matcher("zw")
    check("probe split across chunks is still matched", m(1.0, b"...z") is None and m(2.0, b"w...") == 2.0)
    check("probe matched in one chunk", _probe_matcher("ab")(3.0, b"xxabxx") == 3.0)
    check("no match returns None", _probe_matcher("zz")(1.0, b"nothing") is None)

    # -- probe choice avoids text already on screen ----------------------
    probe = _pick_probe("hello zworld")
    check("probe avoids letters already on screen", "z" not in probe and len(probe) == 2, repr(probe))

    # -- first glyph is not measured inside an escape sequence -----------
    # Every TUI boots with `\e[?1049h\e[?25l`; those bytes are printable, so a
    # naive 32..126 test returns the SAME timestamp as first_byte for every
    # tool. That is what this bench did on its first run.
    g = FirstGlyph()
    boot = [
        b"\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l\x1b[?2004h",
        b"\x1b]7;file:///tmp/x\x07",
        b"\x1b]0;title\x07",
        b"\x1b[1;1H\x1b[K",
    ]
    hits = [g(i, c) for i, c in enumerate(boot)]
    check("no glyph is reported inside boot escape sequences", all(h is None for h in hits), str(hits))
    check("first real glyph is reported at its own timestamp", g(9.0, b"\x1b[3;2Hfox") == 9.0)
    g2 = FirstGlyph()
    check(
        "an escape sequence split across chunks is not mistaken for a glyph",
        g2(1.0, b"\x1b[") is None and g2(2.0, b"?25l") is None and g2(3.0, b"hi") == 3.0,
    )
    g3 = FirstGlyph()
    check("a UTF-8 glyph counts as painted", g3(1.0, "\u4f60".encode()) == 1.0)

    # -- ranking excludes thin and unmeasured rows -----------------------
    def row(name, key, p50, n=5, installed=True):
        return {"agent": name, "installed": installed, key: {"min": p50, "p50": p50, "p95": p50, "n": n}}

    rows = [row("fox-agent", "ttfi", 50), row("fast", "ttfi", 10), row("slow", "ttfi", 90), row("thin", "ttfi", 1, n=1)]
    rank, field = rank_of(rows, "ttfi")
    check("rank ignores n<3 samples (a lucky launch is not a comparison)", rank == 2 and field == 3, f"{rank} of {field}")
    rows2 = [row("fox-agent", "ttfi", 50), {"agent": "gone", "installed": False}]
    r2, f2 = rank_of(rows2, "ttfi")
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
    if tmux_ready():
        with Launch(["/bin/sh", "-c", "printf 'A'; sleep 5"]) as L:
            if L.err:
                check("launch: session starts", False, L.err)
            else:
                check("launch: gate release yields a t0", L.t0 is not None)
                check("launch: pane pid is readable", L.pid is not None)
                check("launch: pane tty is readable", getattr(L, "tty", None) is not None)
                # first byte must arrive, and must be timed from exec
                first = L.wait_for(lambda ts, _b: ts, 5.0)
                check("stream: first byte arrives through pipe-pane", first is not None)
                if first is not None:
                    dt = L.ms_since_t0(first)
                    check("stream: first byte is timed from exec, not tmux spawn", dt is not None and dt < 2000, f"{dt}ms")
                full = L.bytes_since(0)
                check("stream: no byte written before the gate is lost", b"A" in full, repr(full[:20]))
                check("screen: capture-pane returns rendered text", "A" in L.screen(), repr(L.screen()[:40]))
                # a probe typed into a shell echo is visible on screen: the
                # verification step depends on it
                L.send("probezz")
                time.sleep(0.3)
                check("screen: typed text is readable back", "probezz" in L.screen())
                _sig = L.echo_mode()
                check("termios: echo mode classifies", _sig in ("kernel-echo", "render"), str(_sig))

        # a render-mode app must classify as render after it takes the tty
        with Launch(["/bin/sh", "-c", "stty -echo 2>/dev/null; printf 'ready'; sleep 5"]) as L:
            if not L.err:
                got = None
                for _ in range(200):
                    got = L.echo_mode()
                    if got == "render":
                        break
                    time.sleep(0.01)
                check("termios: ECHO off classifies as render", got == "render", str(got))

        # the clock is not a poll cadence: a deliberately delayed write must be
        # reported at its own timestamp, not rounded up to a 22ms poll
        with Launch(["/bin/sh", "-c", "sleep 0.4; printf 'X'; sleep 5"]) as L:
            if not L.err:
                hit = L.wait_for(lambda ts, b: ts if b"X" in b else None, 5.0)
                if hit is not None:
                    dt = L.ms_since_t0(hit)
                    check("stream: delayed write is timed at the write, +/-50ms", 350 < dt < 550, f"{dt:.1f}ms")
                else:
                    check("stream: delayed write is timed at the write", False, "no hit")
    else:
        print("  skip rig checks (tmux not installed)")

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
  --only NAME,...   measure only these tools, by label
  --debug           verbose narration to stderr
  --self-test       verify the measurement rig itself, then exit
  --help            this text
"""


def main():
    # Checked first, and deliberately NOT by falling through: an unrecognised
    # flag must not start a 20-minute measurement run, which is what happened
    # before this existed (`bench.py --help` measured the whole field).
    if "--help" in sys.argv or "-h" in sys.argv:
        print(USAGE, end="")
        sys.exit(0)
    unknown = [a for a in sys.argv[1:] if a.startswith("-") and a not in ("--quick", "--debug", "--self-test")]
    if "--out" in sys.argv and sys.argv.index("--out") + 1 >= len(sys.argv):
        print("bench: --out needs a directory", file=sys.stderr)
        sys.exit(2)
    if "--only" in sys.argv and sys.argv.index("--only") + 1 >= len(sys.argv):
        print("bench: --only needs a comma-separated list", file=sys.stderr)
        sys.exit(2)
    if unknown:
        print(f"bench: unknown option(s) {', '.join(unknown)}\n\n{USAGE}", file=sys.stderr)
        sys.exit(2)
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    quick = "--quick" in sys.argv
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else os.path.join(ROOT, "bench")
    only = None
    if "--only" in sys.argv:
        only = {s.strip().lower() for s in sys.argv[sys.argv.index("--only") + 1].split(",") if s.strip()}
    os.makedirs(out, exist_ok=True)

    n_start = 2 if quick else 4
    launches = 2 if quick else 5

    if not tmux_ready():
        print("bench: tmux is required for the interactive metrics", file=sys.stderr)
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
        "method": {
            "timings": (
                "Every duration comes from a forkless byte stream: the tool is launched in a detached "
                "tmux session behind a gate FIFO, `pipe-pane` is attached before the gate is released, "
                "and bytes are timestamped as they are read. t0 is the gate release (the exec), so "
                "tmux's own spawn cost is not charged to the tool and no early byte can be missed. "
                "The predecessor polled `tmux capture-pane`, which forks tmux: measured 9.2ms p50 / "
                "32.2ms p95 per sample, a ~22ms poll cadence and a floor under every number it published "
                "(it reported 4.2ms input latency -- below the cost of one observation)."
            ),
            "metrics": (
                "first_byte = exec to first byte on the wire; first_paint = exec to first printable "
                "glyph (a TUI's first byte is often only cursor bookkeeping, e.g. fox's `\\e[?25l`); "
                "ttfi = exec to probe rendered, where the probe is typed as soon as the app owns the "
                "tty (termios ECHO off) and has stopped writing; key_latency = keystroke to probe "
                "rendered after a settle, with startup removed and the settle wait explicitly outside "
                "the clock."
            ),
            "statistics": (
                "p50 of successful launches is published, with min and p95 beside it. The predecessor "
                "published min, which hid the spread: the shipped opencode first-byte row was 101ms min "
                "against 1539ms p95. Rows with fewer than "
                f"{MIN_RANK_N} successful samples are reported but not ranked."
            ),
            "timeouts": (
                "A timeout is recorded as a failure and excluded from the statistics, never published as "
                "a duration. The predecessor's 15s probe timeout appeared in the table as measurement "
                "(opencode 15203.1ms, amp 15053.7ms, kilo 16476.3ms) and was RANKED."
            ),
            "probe": (
                "Two letters not already present on the captured screen are typed; the match is made "
                "against joined bytes since the keystroke (so a cell-diffing TUI that emits the probe in "
                "pieces is still counted) AND verified against the rendered screen afterwards, so a "
                "stream false positive cannot become a number."
            ),
            "signal": (
                "termios ECHO is read from the pane's own pty. 'kernel-echo' means the line discipline "
                "echoed the byte before the app woke (measured: `cat` in a pty times ~0.3ms with no UI), "
                "so it describes the kernel; 'render' means the app disabled echo and repainted a cell "
                "itself. Latency is ranked within 'render' only."
            ),
            "bundle": (
                "the binary itself; a launcher's exec target where a wrapper hands off by path; or the "
                "package dir for script CLIs, minus any bundled node/bun runtime (weighing a 2KB shim "
                "would pretend node_modules are free; counting the interpreter would make every "
                "JS tool report the same ~140MB)."
            ),
            "memory": (
                "PSS of the whole process tree (children included: a node CLI's workers hold real "
                "memory), floored over launches because extra processes only ever add, read after the "
                "app settles and before the latency probe perturbs it."
            ),
            "missing": "A tool that is not installed is an n/a row and is excluded from rank counts, never estimated.",
        },
        "rows": rows,
        "fox": fox_extra,
    }
    with open(os.path.join(out, "results.json"), "w") as f:
        json.dump(payload, f, indent=2)

    render_outputs(out, rows, fox_extra, payload)
    print("wrote", out, flush=True)


if __name__ == "__main__":
    main()

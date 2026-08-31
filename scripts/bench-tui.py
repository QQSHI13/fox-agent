#!/usr/bin/env python3
"""Time-to-first-frame and PSS for a TUI binary, jcode-readme style:
launch under a PTY, time until first bytes, then read PSS after settle."""
import os, pty, sys, time, select, signal, subprocess

def bench(cmd, settle=1.5, probes=10):
    ttff = []
    for _ in range(probes):
        start = time.perf_counter()
        pid, fd = pty.fork()
        if pid == 0:
            os.environ["TERM"] = "xterm-256color"
            os.execv(cmd[0], cmd)
        first = None
        while True:
            r, _, _ = select.select([fd], [], [], 5)
            if not r:
                break
            try:
                data = os.read(fd, 65536)
            except OSError:
                break
            if data and first is None:
                first = time.perf_counter() - start
                break
        os.close(fd)
        try:
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)
        except (ProcessLookupError, ChildProcessError):
            pass
        if first is not None:
            ttff.append(first * 1000)
    # memory probe: one launch, settle, read PSS
    pid, fd = pty.fork()
    if pid == 0:
        os.environ["TERM"] = "xterm-256color"
        os.execv(cmd[0], cmd)
    time.sleep(settle)
    pss_kb = None
    try:
        with open(f"/proc/{pid}/smaps_rollup") as f:
            for line in f:
                if line.startswith("Pss:"):
                    pss_kb = int(line.split()[1])
                    break
    except FileNotFoundError:
        pass
    os.close(fd)
    try:
        os.kill(pid, signal.SIGKILL)
        os.waitpid(pid, 0)
    except (ProcessLookupError, ChildProcessError):
        pass
    ttff.sort()
    return ttff, (pss_kb / 1024 if pss_kb is not None else None)

for name, cmd in [("fox", ["./bin/fox"]), ("jcode", ["/home/qq/.local/bin/jcode"])]:
    ttff, pss = bench(cmd)
    if ttff:
        print(f"{name}: TTFF median {ttff[len(ttff)//2]:.1f} ms  range {ttff[0]:.1f}-{ttff[-1]:.1f} ms  n={len(ttff)}")
    else:
        print(f"{name}: no first frame captured")
    print(f"{name}: PSS after 1.5s idle: {pss:.1f} MB" if pss else f"{name}: PSS unavailable")

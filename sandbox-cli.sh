#!/usr/bin/env bash
# Disposable sandbox for testing a coding CLI (goose) without pulling containers.
#
# Why bubblewrap: it shares the host kernel (so "a kernel and bash" is real, not
# emulated), needs no daemon and no image, and works unprivileged. Docker is
# unusable here — Docker Hub is not reachable, so no image can be pulled.
#
# Disposability: home and /tmp are tmpfs — everything the tool installs or
# writes vanishes on exit, and the host filesystem is READ-ONLY so a runaway
# installer cannot damage it.
#
#   ./sandbox-cli.sh                 # interactive bash you control (disposable)
#   SANDBOX_PERSIST=~/goose-box ./sandbox-cli.sh    # same, but installs persist
#   ./sandbox-cli.sh install-goose   # one-shot install, no shell
#   ./sandbox-cli.sh test-goose      # install + run goose under tmux, dump pane
#
# Run it in YOUR terminal: bash needs a real tty for job control, so a shell
# started from a non-interactive tool has no ctrl+c/job control inside.
set -euo pipefail

# /home must be writable for the installer; tmpfs + a real homedir inside it.
# Shared network so the installer and the model API both work; everything else
# is unshared (pid/ipc/uts/cgroup) so the tool cannot see or signal host
# processes — which is also what keeps its PSS measurement honest.
run_box() {
  bwrap \
    --unshare-pid --unshare-ipc --unshare-uts --unshare-cgroup \
    --share-net \
    --ro-bind / / \
    --dev /dev --proc /proc \
    --tmpfs /tmp --tmpfs /run \
    --tmpfs /home \
    --setenv HOME /home/user \
    --setenv TERM "${TERM:-xterm-256color}" \
    --chdir /tmp \
    -- /bin/bash -c 'mkdir -p /home/user && cd /home/user && exec "$@"' -- "$@"
}

install_goose() {
  run_box bash -lc '
    set -e
    echo "== sandbox: $(grep PRETTY /etc/os-release | cut -d= -f2-) kernel $(uname -r)"
    export PATH="$HOME/.local/bin:$PATH"
    curl -fsSL https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh \
      | CONFIGURE=false bash
    echo "== installed: $($HOME/.local/bin/goose --version 2>&1 | head -1)"
  '
}

case "${1:-shell}" in
  shell)
    # SANDBOX_PERSIST=~/sandbox keeps the home dir across runs (install goose
    # once, test it many times). Unset = fully disposable, everything vanishes.
    HOME_ARG=(--tmpfs /home)
    if [ -n "${SANDBOX_PERSIST:-}" ]; then
      mkdir -p "$SANDBOX_PERSIST"
      HOME_ARG=(--bind "$SANDBOX_PERSIST" /home)
      echo "persistent home: $SANDBOX_PERSIST"
    else
      echo "disposable home (set SANDBOX_PERSIST=~/foo to keep installs)"
    fi
    exec bwrap \
      --unshare-pid --unshare-ipc --unshare-uts --unshare-cgroup \
      --share-net --ro-bind / / --dev /dev --proc /proc \
      --tmpfs /tmp --tmpfs /run "${HOME_ARG[@]}" \
      --setenv HOME /home/user --setenv TERM "${TERM:-xterm-256color}" \
      --setenv PATH "/home/user/.local/bin:/usr/local/bin:/usr/bin:/bin" \
      -- /bin/bash -c 'mkdir -p /home/user && cd /home/user && exec bash -i'
    ;;
  install-goose)
    install_goose
    ;;
  test-goose)
    # Install, then run goose in its own tmux session so the rendered screen can
    # be inspected — the same primitive the bench now uses.
    run_box bash -lc '
      set -e
      export PATH="$HOME/.local/bin:$PATH"
      curl -fsSL https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh \
        | CONFIGURE=false bash >/dev/null 2>&1
      tmux kill-server 2>/dev/null || true
      tmux new-session -d -s g -x 120 -y 40 "$HOME/.local/bin/goose"
      sleep 4
      echo "===== captured pane ====="
      tmux capture-pane -p -t g | tail -20
      echo "===== pane pid + pss ====="
      P=$(tmux display-message -p -t g "#{pane_pid}")
      echo "pane_pid=$P"
      grep -m1 Pss: /proc/$P/smaps_rollup 2>/dev/null || echo "no smaps for $P"
      pgrep -af goose | head -5 || true
      tmux kill-server 2>/dev/null || true
    '
    ;;
  *)
    echo "usage: $0 [shell|install-goose|test-goose]" >&2
    exit 2
    ;;
esac

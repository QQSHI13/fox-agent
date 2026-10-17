#!/usr/bin/env bash
# Can any SYSTEM-BUN path match the compiled bytecode binary (19ms)?
# Candidates: the 1.46MB bundle, the same bundle with --smol, and source.
# Same --version path for all, so the delta is startup only.
set -u
cd "$(dirname "$0")"
N=${1:-12}
timeout 200 bun build --target=bun --minify ./src/cli.ts --outfile /tmp/bfast.js >/dev/null 2>&1

bench() { # $1=label, rest=cmd
  local label="$1"; shift
  "$@" >/dev/null 2>&1 || true
  local times=()
  for _ in $(seq 1 "$N"); do
    local s e
    s=$(date +%s%N); "$@" >/dev/null 2>&1; e=$(date +%s%N)
    times+=( $(( (e - s) / 1000 )) )
  done
  printf '%s\n' "${times[@]}" | sort -n | awk -v l="$label" -v n="$N" '
    { v[NR]=$1 } END {
      med = (n%2) ? v[(n+1)/2] : (v[n/2]+v[n/2+1])/2
      printf "%-28s min=%7.2fms  med=%7.2fms  p95=%7.2fms\n", l, v[1]/1000, med/1000, v[n]/1000
    }'
}

echo "bundle size: $(stat -c%s /tmp/bfast.js) bytes"
echo "load $(cut -d' ' -f1 /proc/loadavg)   n=$N"
echo
bench "compiled --bytecode"        ./bin/fox --version
bench "bun bundle"                 bun /tmp/bfast.js --version
bench "bun --smol bundle"          bun --smol /tmp/bfast.js --version
bench "bun run source"             bun ./src/cli.ts --version
bench "bun --smol source"          bun --smol ./src/cli.ts --version

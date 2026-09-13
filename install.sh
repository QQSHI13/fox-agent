#!/usr/bin/env bash
set -euo pipefail

# fox-agent installer
# Downloads the latest release binary for the current platform.
#
# Usage:
#   curl -fsSL https://github.com/QQSHI13/fox-agent/raw/main/install.sh | bash
#   curl -fsSL ... | bash -s -- --to /custom/path
#   curl -fsSL ... | bash -s -- --version 0.3.0
#   curl -fsSL ... | bash -s -- --beta

REPO="QQSHI13/fox-agent"
BINARY_NAME="fox"
INSTALL_DIR="${INSTALL_DIR:-${XDG_BIN_HOME:-${HOME}/.local/bin}}"

# --- colors & symbols ---

setup_colors() {
  R=$'\033[0m'
  B=$'\033[1m'
  D=$'\033[2m'
  G=$'\033[32m'
  C=$'\033[36m'
  Y=$'\033[33m'
  RED=$'\033[31m'
  DIMRED=$'\033[2;31m'
  CHECK="${G}✓${R}"
  CROSS="${RED}✗${R}"
  ARROW="${C}▸${R}"
  BULLET="${D}·${R}"
}

setup_colors

# --- argument parsing ---

VERSION=""
BETA=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version|-v)
      VERSION="$2"
      shift 2
      ;;
    --beta|--pre)
      BETA=true
      shift
      ;;
    --to)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: install.sh [--version VERSION] [--beta] [--to DIR]"
      echo ""
      echo "Options:"
      echo "  --version, -v VERSION   Install a specific version (e.g. 0.3.0)"
      echo "  --beta, --pre           Install the latest prerelease/beta"
      echo "  --to DIR                Install to a custom directory (default: ~/.local/bin)"
      echo ""
      echo "Environment:"
      echo "  INSTALL_DIR             Same as --to"
      exit 0
      ;;
    *)
      echo "${CROSS} Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# --- detect platform ---

detect_os() {
  case "$(uname -s)" in
    Linux*)  echo "linux" ;;
    Darwin*) echo "darwin" ;;
    *)       echo "unsupported"; exit 1 ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64)  echo "x64" ;;
    aarch64|arm64) echo "arm64" ;;
    *)             echo "unsupported"; exit 1 ;;
  esac
}

OS="$(detect_os)"
ARCH="$(detect_arch)"
TARGET="bun-${OS}-${ARCH}"

case "$TARGET" in
  bun-linux-x64)    ASSET="fox-linux-x64" ;;
  bun-linux-arm64)  ASSET="fox-linux-arm64" ;;
  bun-darwin-x64)   ASSET="fox-darwin-x64" ;;
  bun-darwin-arm64) ASSET="fox-darwin-arm64" ;;
  *) echo "${CROSS} unsupported platform: ${OS}/${ARCH}" >&2; exit 1 ;;
esac

# --- resolve version ---

resolve_version() {
  local url="https://api.github.com/repos/${REPO}/releases"
  if [[ "$BETA" == true ]]; then
    curl -fsSL "$url" 2>/dev/null | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1
  else
    curl -fsSL "${url}/latest" 2>/dev/null | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1
  fi
}

if [[ -z "$VERSION" ]]; then
  VERSION="$(resolve_version)"
  if [[ -z "$VERSION" ]]; then
    echo "${CROSS} could not determine latest version" >&2
    echo "  check https://github.com/${REPO}/releases" >&2
    exit 1
  fi
fi

VERSION="${VERSION#v}"

# --- progress bar engine ---

BAR_GLYPH=$'\u25B1'
BAR_CELLS=32

# Spinner frames
SPINNER=(⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏)

draw_bar() {
  local pct="$1"       # integer 0-100
  local downloaded="$2" # bytes string
  local eta="$3"        # seconds string or "—"

  local filled=$(( pct * BAR_CELLS / 100 ))
  local empty=$(( BAR_CELLS - filled ))

  local bar="${G}"
  local i
  for (( i=0; i<filled; i++ )); do bar="${bar}${BAR_GLYPH}"; done
  bar="${bar}${D}"
  for (( i=0; i<empty; i++ )); do bar="${bar}${BAR_GLYPH}"; done
  bar="${bar}${R}"

  local pct_str
  pct_str=$(printf "%3d%%" "$pct")

  printf "\r\033[2K  %s %s%s%s %s%s%s  eta %s%s%s" \
    "$bar" \
    "$D" "$pct_str" "$R" \
    "$D" "$downloaded" "$R" \
    "$D" "$eta" "$R" >&2
}

spinner_tick=0
draw_spinner() {
  local label="$1"
  printf "\r\033[2K  %s %s" "${SPINNER[$spinner_tick]}" "$label" >&2
  spinner_tick=$(( (spinner_tick + 1) % ${#SPINNER[@]} ))
}

format_bytes() {
  local bytes="$1"
  if (( bytes >= 1073741824 )); then
    local whole=$(( bytes / 1073741824 ))
    local frac=$(( (bytes % 1073741824) * 10 / 1073741824 ))
    printf "%d.%dGB" "$whole" "$frac"
  elif (( bytes >= 1048576 )); then
    local whole=$(( bytes / 1048576 ))
    local frac=$(( (bytes % 1048576) * 10 / 1048576 ))
    printf "%d.%dMB" "$whole" "$frac"
  elif (( bytes >= 1024 )); then
    printf "%dKB" $(( bytes / 1024 ))
  else
    printf "%dB" "$bytes"
  fi
}

format_eta() {
  local secs="$1"
  if (( secs < 0 || secs > 86400 )); then
    echo "—"
  elif (( secs < 60 )); then
    printf "%ds" "$secs"
  else
    printf "%dm%ds" $(( secs / 60 )) $(( secs % 60 ))
  fi
}

# --- download with progress ---

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/v${VERSION}/${ASSET}"
CHECKSUM_URL="https://github.com/${REPO}/releases/download/v${VERSION}/SHA256SUMS"

TMP_DIR="$(mktemp -d)"

# track background PIDs for cleanup on early exit
BG_PIDS=()
cleanup() {
  for pid in "${BG_PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

# print header immediately — no waiting
echo ""
printf "  %sfox-agent%s %sv%s %s%s/%s%s\n" "$B" "$R" "$D" "$VERSION" "$C" "$OS" "$ARCH" "$R"
echo ""

# --- fetch checksum (parallel, must succeed) ---

curl -fsSL -o "${TMP_DIR}/SHA256SUMS" "${CHECKSUM_URL}" 2>/dev/null &
CK_PID=$!
BG_PIDS+=("$CK_PID")

# --- download binary with retry ---

MAX_RETRIES=3
DL_OK=false
for ATTEMPT in 1 2 3; do
  # fetch Content-Length in background (don't block startup)
  TOTAL_BYTES_FILE="${TMP_DIR}/.total_bytes"
  curl -sI -L "${DOWNLOAD_URL}" 2>/dev/null | grep -i 'content-length' | tail -1 | tr -d '\r' | awk '{print $2}' > "$TOTAL_BYTES_FILE" &
  CL_PID=$!
  BG_PIDS+=("$CL_PID")

  # start download
  curl -fsSL -o "${TMP_DIR}/${ASSET}" "${DOWNLOAD_URL}" 2>/dev/null &
  DL_PID=$!
  BG_PIDS+=("$DL_PID")

  # wait for Content-Length (with timeout so we don't block forever)
  TOTAL_BYTES=0
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    if ! kill -0 "$CL_PID" 2>/dev/null; then
      TOTAL_BYTES="$(cat "$TOTAL_BYTES_FILE" 2>/dev/null || echo 0)"
      break
    fi
    sleep 0.05
  done
  [[ -z "$TOTAL_BYTES" || "$TOTAL_BYTES" == "0" ]] && TOTAL_BYTES=0

  # animate progress bar while download runs
  START_TIME=$(date +%s 2>/dev/null || echo 0)
  PREV_SIZE=0
  PREV_TIME=$START_TIME
  SPEED=0

  while kill -0 "$DL_PID" 2>/dev/null; do
    CURRENT_SIZE=$(stat -c%s "${TMP_DIR}/${ASSET}" 2>/dev/null || stat -f%z "${TMP_DIR}/${ASSET}" 2>/dev/null || echo 0)
    NOW=$(date +%s 2>/dev/null || echo 0)

    # re-read TOTAL_BYTES in case Content-Length arrived late
    if (( TOTAL_BYTES == 0 )); then
      TOTAL_BYTES="$(cat "$TOTAL_BYTES_FILE" 2>/dev/null || echo 0)"
      [[ -z "$TOTAL_BYTES" || "$TOTAL_BYTES" == "0" ]] && TOTAL_BYTES=0
    fi

    # calculate percentage
    if (( TOTAL_BYTES > 0 )); then
      PCT=$(( CURRENT_SIZE * 100 / TOTAL_BYTES ))
      (( PCT > 100 )) && PCT=100
    else
      PCT=0
    fi

    # calculate speed (smoothed over 1 second)
    TIME_DIFF=$(( NOW - PREV_TIME ))
    if (( TIME_DIFF >= 1 )); then
      BYTE_DIFF=$(( CURRENT_SIZE - PREV_SIZE ))
      SPEED=$(( BYTE_DIFF / TIME_DIFF ))
      PREV_SIZE=$CURRENT_SIZE
      PREV_TIME=$NOW
    fi
    SPEED_FMT=$(format_bytes "$SPEED" 2>/dev/null || echo "0B")

    # calculate ETA
    if (( TOTAL_BYTES > 0 && SPEED > 0 )); then
      REMAINING=$(( TOTAL_BYTES - CURRENT_SIZE ))
      ETA_SECS=$(( REMAINING / SPEED ))
    else
      ETA_SECS=-1
    fi

    DOWNLOADED_FMT=$(format_bytes "$CURRENT_SIZE")
    ETA_FMT=$(format_eta "$ETA_SECS")

    if (( TOTAL_BYTES > 0 )); then
      draw_bar "$PCT" "$DOWNLOADED_FMT" "$ETA_FMT"
    else
      draw_spinner "downloading ${DOWNLOADED_FMT}"
    fi

  sleep 0.08
done

  wait "$DL_PID" 2>/dev/null
  DL_EXIT=$?

  FINAL_SIZE=$(stat -c%s "${TMP_DIR}/${ASSET}" 2>/dev/null || stat -f%z "${TMP_DIR}/${ASSET}" 2>/dev/null || echo 0)
  FINAL_FMT=$(format_bytes "$FINAL_SIZE")

  if (( DL_EXIT != 0 )); then
    printf "\r\033[2K"
    if (( ATTEMPT < MAX_RETRIES )); then
      echo "  ${Y}! download failed, retrying (${ATTEMPT}/${MAX_RETRIES})${R}"
      rm -f "${TMP_DIR}/${ASSET}"
      sleep 1
      continue
    fi
    echo "  ${CROSS} download failed after ${MAX_RETRIES} attempts"
    echo "    URL: ${DOWNLOAD_URL}" >&2
    echo "    check your network connection or try again later" >&2
    exit 1
  fi

  # validate the file isn't an HTML error page (GitHub returns 404 as HTML)
  if (( FINAL_SIZE < 1024 )); then
    printf "\r\033[2K"
    if (( ATTEMPT < MAX_RETRIES )); then
      echo "  ${Y}! download too small, retrying (${ATTEMPT}/${MAX_RETRIES})${R}"
      rm -f "${TMP_DIR}/${ASSET}"
      sleep 1
      continue
    fi
    echo "  ${CROSS} downloaded file is too small (${FINAL_FMT}) — likely an error page"
    exit 1
  fi
  if head -c 16 "${TMP_DIR}/${ASSET}" 2>/dev/null | grep -qi '<!DOCTYPE\|<html'; then
    printf "\r\033[2K"
    if (( ATTEMPT < MAX_RETRIES )); then
      echo "  ${Y}! received HTML instead of binary, retrying (${ATTEMPT}/${MAX_RETRIES})${R}"
      rm -f "${TMP_DIR}/${ASSET}"
      sleep 1
      continue
    fi
    echo "  ${CROSS} server returned HTML instead of a binary — version ${VERSION} may not exist"
    echo "    check https://github.com/${REPO}/releases" >&2
    exit 1
  fi

  DL_OK=true
  break
done

if [[ "$DL_OK" != true ]]; then
  echo "  ${CROSS} download failed" >&2
  exit 1
fi

if (( TOTAL_BYTES > 0 )); then
  draw_bar 100 "$FINAL_FMT" "0s"
else
  printf "\r\033[2K  ${G}✓${R} downloaded ${FINAL_FMT}"
fi
echo ""

# --- verify checksum (mandatory) ---

printf "  ${ARROW} verifying checksum"
wait "$CK_PID" 2>/dev/null
CK_EXIT=$?

if (( CK_EXIT != 0 )) || [[ ! -s "${TMP_DIR}/SHA256SUMS" ]]; then
  printf "\r\033[2K  ${CROSS} could not download checksums — refusing to install unverified binary\n"
  echo "    URL: ${CHECKSUM_URL}" >&2
  echo "    this is a safety measure; try again or install from source" >&2
  exit 1
fi

EXPECTED="$(grep "${ASSET}" "${TMP_DIR}/SHA256SUMS" 2>/dev/null | awk '{print $1}')"
if [[ -z "$EXPECTED" ]]; then
  printf "\r\033[2K  ${CROSS} SHA256SUMS has no entry for ${ASSET} — release may be corrupt\n"
  echo "    check https://github.com/${REPO}/releases" >&2
  exit 1
fi

ACTUAL="$(sha256sum "${TMP_DIR}/${ASSET}" 2>/dev/null | awk '{print $1}')"
if [[ "$EXPECTED" != "$ACTUAL" ]]; then
  printf "\r\033[2K  ${CROSS} checksum mismatch — refusing to install\n"
  echo "    expected: ${EXPECTED}" >&2
  echo "    actual:   ${ACTUAL}" >&2
  echo "    the download may be corrupted or tampered with" >&2
  echo "    try again or report at https://github.com/${REPO}/issues" >&2
  exit 1
fi
printf "\r\033[2K  ${ARROW} verifying checksum ${CHECK}\n"

# --- install ---

chmod +x "${TMP_DIR}/${ASSET}"

if [[ ! -d "$INSTALL_DIR" ]]; then
  mkdir -p "$INSTALL_DIR" 2>/dev/null || {
    echo "${CROSS} cannot create ${INSTALL_DIR}" >&2
    echo "  try: mkdir -p ${INSTALL_DIR}" >&2
    exit 1
  }
fi

EXISTING="${INSTALL_DIR}/${BINARY_NAME}"
if [[ -f "$EXISTING" ]]; then
  printf "  ${ARROW} backing up existing binary"
  cp "$EXISTING" "${EXISTING}.fox-previous"
  printf "\r\033[2K  ${ARROW} backing up existing binary ${CHECK}\n"
fi

cp "${TMP_DIR}/${ASSET}" "${INSTALL_DIR}/${BINARY_NAME}"
chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

if [[ ! -e "${INSTALL_DIR}/fox-agent" ]]; then
  ln -sf "${BINARY_NAME}" "${INSTALL_DIR}/fox-agent" 2>/dev/null || true
fi

# --- done ---

echo ""
printf "  ${G}${B}installed${R} ${INSTALL_DIR}/${BINARY_NAME} ${D}v${VERSION}${R}\n"
echo ""

if [[ ":${PATH}:" != *":${INSTALL_DIR}:"* ]]; then
  echo "  ${Y}! ${INSTALL_DIR} is not in your PATH${R}"
  echo ""
  case "${SHELL:-}" in
    */zsh)  RC="~/.zshrc" ;;
    */bash) RC="~/.bashrc" ;;
    *)      RC="your shell rc file" ;;
  esac
  echo "  add this to ${RC}:"
  echo ""
  echo "    ${D}export PATH=\"${INSTALL_DIR}:\$PATH\"${R}"
  echo ""
fi

echo "  ${BULLET} run ${B}fox${R} to get started"
echo "  ${BULLET} run ${B}fox --help${R} for usage"
echo ""

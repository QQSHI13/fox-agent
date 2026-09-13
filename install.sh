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

# --- colors ---

if [[ -t 1 ]] && [[ -n "${TERM:-}" && "${TERM:-}" != "dumb" ]]; then
  R='\033[0m'      # reset
  B='\033[1m'      # bold
  D='\033[2m'      # dim
  G='\033[32m'     # green
  C='\033[36m'     # cyan
  Y='\033[33m'     # yellow
  R3='\033[31m'    # red
  CHECK="${G}✓${R}"
  CROSS="${R3}✗${R}"
  ARROW="${C}▸${R}"
  BULLET="${D}·${R}"
else
  R='' B='' D='' G='' C='' Y='' R3=''
  CHECK="[ok]"
  CROSS="[!!]"
  ARROW=">"
  BULLET="-"
fi

# --- argument parsing ---

VERSION=""
BETA=false
TO=""

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
      echo "  --to DIR                Install to a custom directory"
      echo "                          (default: ~/.local/bin)"
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

# --- download ---

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/v${VERSION}/${ASSET}"
CHECKSUM_URL="https://github.com/${REPO}/releases/download/v${VERSION}/SHA256SUMS"

echo ""
echo "  ${B}fox-agent${R} ${C}v${VERSION}${R} ${D}(${OS}/${ARCH})${R}"
echo ""

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo -n "  ${ARROW} downloading ${ASSET}... "
curl -fsSL --progress-bar -o "${TMP_DIR}/${ASSET}" "${DOWNLOAD_URL}" &
DL_PID=$!

# fetch checksum in parallel
curl -fsSL -o "${TMP_DIR}/SHA256SUMS" "${CHECKSUM_URL}" 2>/dev/null &
CK_PID=$!

wait $DL_PID || { echo ""; echo "${CROSS} download failed" >&2; exit 1; }
echo "${CHECK}"

# --- verify checksum ---

echo -n "  ${ARROW} verifying checksum... "
wait $CK_PID 2>/dev/null || true

EXPECTED="$(grep "${ASSET}" "${TMP_DIR}/SHA256SUMS" 2>/dev/null | awk '{print $1}')"
if [[ -z "$EXPECTED" ]]; then
  echo "${Y}skipped (no checksum in manifest)${R}"
else
  ACTUAL="$(sha256sum "${TMP_DIR}/${ASSET}" | awk '{print $1}')"
  if [[ "$EXPECTED" != "$ACTUAL" ]]; then
    echo "${CROSS}"
    echo "    expected: ${EXPECTED}" >&2
    echo "    actual:   ${ACTUAL}" >&2
    exit 1
  fi
  echo "${CHECK}"
fi

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
  echo -n "  ${ARROW} backing up existing binary... "
  cp "$EXISTING" "${EXISTING}.fox-previous"
  echo "${CHECK}"
fi

cp "${TMP_DIR}/${ASSET}" "${INSTALL_DIR}/${BINARY_NAME}"
chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

# create fox-agent symlink
if [[ ! -e "${INSTALL_DIR}/fox-agent" ]]; then
  ln -sf "${BINARY_NAME}" "${INSTALL_DIR}/fox-agent" 2>/dev/null || true
fi

# --- done ---

echo ""
echo "  ${G}${B}installed ${INSTALL_DIR}/${BINARY_NAME} v${VERSION}${R}"
echo ""

# check if in PATH
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
echo "  ${Bullet} run ${B}fox --help${R} for usage"
echo ""

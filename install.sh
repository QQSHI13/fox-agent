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
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

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
      echo "  --to DIR                Install to a custom directory (default: /usr/local/bin)"
      echo ""
      echo "Environment:"
      echo "  INSTALL_DIR             Same as --to (default: /usr/local/bin)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# --- detect platform ---

detect_os() {
  local os
  os="$(uname -s)"
  case "$os" in
    Linux*)  echo "linux" ;;
    Darwin*) echo "darwin" ;;
    *)
      echo "error: unsupported OS: $os" >&2
      exit 1
      ;;
  esac
}

detect_arch() {
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64)   echo "x64" ;;
    aarch64|arm64)   echo "arm64" ;;
    *)
      echo "error: unsupported architecture: $arch" >&2
      exit 1
      ;;
  esac
}

OS="$(detect_os)"
ARCH="$(detect_arch)"
TARGET="bun-${OS}-${ARCH}"

# --- resolve version ---

if [[ -z "$VERSION" ]]; then
  if [[ "$BETA" == true ]]; then
    # Get latest prerelease tag
    VERSION="$(gh api "repos/${REPO}/releases" --jq '[.[] | select(.prerelease)] | .[0].tag_name' 2>/dev/null || true)"
    if [[ -z "$VERSION" || "$VERSION" == "null" ]]; then
      # Fallback: use curl against GitHub API
      VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases" 2>/dev/null | python3 -c "
import sys, json
releases = json.load(sys.stdin)
for r in releases:
    if r.get('prerelease'):
        print(r['tag_name'])
        break
" 2>/dev/null || true)"
    fi
  else
    # Get latest stable release
    VERSION="$(gh api "repos/${REPO}/releases/latest" --jq '.tag_name' 2>/dev/null || true)"
    if [[ -z "$VERSION" || "$VERSION" == "null" ]]; then
      VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null | python3 -c "
import sys, json
print(json.load(sys.stdin)['tag_name'])
" 2>/dev/null || true)"
    fi
  fi

  if [[ -z "$VERSION" || "$VERSION" == "null" ]]; then
    echo "error: could not determine latest version" >&2
    echo "  Check https://github.com/${REPO}/releases" >&2
    exit 1
  fi
fi

# Strip leading v
VERSION="${VERSION#v}"

# Map target to binary name
case "$TARGET" in
  bun-linux-x64)    ASSET="fox-linux-x64" ;;
  bun-linux-arm64)  ASSET="fox-linux-arm64" ;;
  bun-darwin-x64)   ASSET="fox-darwin-x64" ;;
  bun-darwin-arm64) ASSET="fox-darwin-arm64" ;;
esac

# --- download ---

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/v${VERSION}/${ASSET}"
CHECKSUM_URL="https://github.com/${REPO}/releases/download/v${VERSION}/SHA256SUMS"

echo "fox-agent v${VERSION} (${OS}/${ARCH})"
echo "  downloading ${ASSET}..."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

curl -fsSL -o "${TMP_DIR}/${ASSET}" "${DOWNLOAD_URL}"

# --- verify checksum ---

echo "  verifying checksum..."
curl -fsSL -o "${TMP_DIR}/SHA256SUMS" "${CHECKSUM_URL}"

EXPECTED="$(grep "${ASSET}" "${TMP_DIR}/SHA256SUMS" | awk '{print $1}')"
if [[ -z "$EXPECTED" ]]; then
  echo "warning: could not find checksum for ${ASSET} in SHA256SUMS, skipping verification" >&2
else
  ACTUAL="$(sha256sum "${TMP_DIR}/${ASSET}" | awk '{print $1}')"
  if [[ "$EXPECTED" != "$ACTUAL" ]]; then
    echo "error: checksum mismatch" >&2
    echo "  expected: ${EXPECTED}" >&2
    echo "  actual:   ${ACTUAL}" >&2
    exit 1
  fi
  echo "  checksum OK"
fi

# --- install ---

chmod +x "${TMP_DIR}/${ASSET}"

# Create install dir if needed
mkdir -p "$INSTALL_DIR" 2>/dev/null || {
  echo "error: cannot write to ${INSTALL_DIR}" >&2
  echo "  Try with sudo or --to a writable path" >&2
  exit 1
}

# Back up existing binary
EXISTING="${INSTALL_DIR}/${BINARY_NAME}"
if [[ -f "$EXISTING" ]]; then
  echo "  backing up existing binary to ${EXISTING}.backup"
  cp "$EXISTING" "${EXISTING}.backup"
fi

cp "${TMP_DIR}/${ASSET}" "${INSTALL_DIR}/${BINARY_NAME}"
chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

echo ""
echo "installed ${INSTALL_DIR}/${BINARY_NAME} v${VERSION}"
echo ""
echo "run 'fox' to get started"
echo "run 'fox --help' for usage"

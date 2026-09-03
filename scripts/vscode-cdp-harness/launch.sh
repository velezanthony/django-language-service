#!/usr/bin/env bash
# Launch VS Code as an Extension Development Host with a CDP debugging port.
# Run from the repo root. Launch this detached (persistent background task);
# a bare `&` gets SIGHUP'd when the shell wrapper exits.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${CDP_PORT:-9222}"
WORKSPACE="${1:-$ROOT/src/test-django-project}"

# Newest binary the integration tests downloaded, whatever its version — a
# hardcoded version pin broke on every @vscode/test-electron upgrade.
if [[ -z "${VSCODE_BIN:-}" ]]; then
  VSCODE_BIN="$(find "$ROOT/.vscode-test" -maxdepth 2 -name code -type f -perm -u+x 2>/dev/null | sort | tail -1)"
fi
BIN="${VSCODE_BIN:-}"

if [[ -z "$BIN" || ! -x "$BIN" ]]; then
  echo "VS Code binary not found under $ROOT/.vscode-test" >&2
  echo "Set VSCODE_BIN, or run the integration tests once to populate .vscode-test/." >&2
  exit 1
fi

exec env DISPLAY="${DISPLAY:-:0}" "$BIN" \
  --extensionDevelopmentPath="$ROOT" \
  "$WORKSPACE" \
  --remote-debugging-port="$PORT" \
  --user-data-dir="$ROOT/.vscode-test/shot-user-data" \
  --new-window --disable-workspace-trust --skip-release-notes \
  --no-sandbox --disable-gpu --disable-dev-shm-usage

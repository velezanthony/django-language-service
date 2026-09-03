#!/usr/bin/env bash
# extract-inventory.sh — Extract raw capability data from the old django-language-service repo.
#
# Usage: scripts/extract-inventory.sh <OLD_REPO_PATH>
# OLD_REPO_PATH: path to the source repo whose capabilities you want to inventory (required)
#
# Output: stdout — Markdown-formatted raw sections (one per domain), entries sorted.
# Exit:   0 on success, 1 if OLD_REPO_PATH does not exist or package.json is missing.
# Deps:   jq, rg (ripgrep)
#
# Notes:
#   - Every emitted data line goes through sort -u — output is deterministic and diff-clean.
#   - No timestamps, no line numbers in sortable columns, no session-specific metadata.
#   - Re-running this script against an unchanged repo produces identical stdout.
#   - registerCommand calls in this repo use a commandId('suffix') helper (not string literals).
#     The helper expands to 'django-language-service.<suffix>'. Pattern targets that helper.

set -euo pipefail

# Homebrew bin on PATH for non-interactive shells (jq, rg, sd may live here)
export PATH="/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:$PATH"

OLD_REPO="${1:?Usage: extract-inventory.sh <OLD_REPO_PATH> — path to the source repo is required}"
PKG="$OLD_REPO/package.json"
SRC="$OLD_REPO/src"

# ── Dependency check ──────────────────────────────────────────────────────────
# Resolve rg binary (may be shell function in interactive sessions or bare binary)
RG_BIN=""
for candidate in \
    "$(command -v rg 2>/dev/null || true)" \
    "/usr/share/antigravity/resources/app/node_modules/@vscode/ripgrep/bin/rg" \
    "/snap/code/current/usr/share/code/resources/app/node_modules/@vscode/ripgrep/bin/rg"; do
  if [[ -n "$candidate" && -x "$candidate" ]]; then
    RG_BIN="$candidate"
    break
  fi
done
if [[ -z "$RG_BIN" ]]; then
  echo "ERROR: ripgrep (rg) not found. Install it: brew install ripgrep" >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq not found. Install it: brew install jq" >&2
  exit 1
fi

# ── Guard ─────────────────────────────────────────────────────────────────────
if [[ ! -d "$OLD_REPO" ]]; then
  echo "ERROR: OLD_REPO not found: $OLD_REPO" >&2
  exit 1
fi
if [[ ! -f "$PKG" ]]; then
  echo "ERROR: package.json not found at $PKG" >&2
  exit 1
fi

# Helper: strip OLD_REPO prefix from file:line paths for portability
strip_prefix() {
  # Replace leading OLD_REPO/ with empty string using parameter expansion
  while IFS= read -r line; do
    echo "${line#"$OLD_REPO/"}"
  done
}

# ── Section helpers ───────────────────────────────────────────────────────────

section_languages() {
  echo "## RAW: Languages & Grammars"
  echo ""
  echo "### languages (id TAB alias)"
  jq -r '.contributes.languages[]
    | [.id, (.aliases[0] // "—")]
    | @tsv' "$PKG" | sort -u
  echo ""
  echo "### grammars (language TAB scopeName TAB path)"
  jq -r '.contributes.grammars[]
    | [(.language // "injection"), .scopeName, .path]
    | @tsv' "$PKG" | sort -u
  echo ""
}

section_commands_declared() {
  echo "## RAW: Commands (declared in package.json)"
  echo ""
  echo "### contributes.commands (command TAB title)"
  jq -r '.contributes.commands[]
    | [.command, .title]
    | @tsv' "$PKG" | sort -u
  echo ""
}

section_commands_runtime() {
  echo "## RAW: Commands (runtime — registerCommand via commandId helper)"
  echo ""
  echo "### registerCommand calls (fully-qualified command id)"
  # registerCommand calls use commandId('suffix') helper → expands to django-language-service.suffix
  "$RG_BIN" --no-filename --no-line-number \
    "commandId\('([^']+)'\)" \
    "$SRC/" \
    --only-matching \
    --replace 'django-language-service.$1' \
    2>/dev/null | sort -u || true
  echo ""
}

section_providers() {
  echo "## RAW: Language Providers (vscode.languages.register*Provider)"
  echo ""
  echo "### register*Provider calls (file:line:match — OLD_REPO prefix stripped)"
  "$RG_BIN" --with-filename --line-number \
    'vscode\.languages\.register\w+Provider' \
    "$SRC/" \
    --only-matching \
    2>/dev/null \
    | strip_prefix \
    | sort -u || true
  echo ""
}

section_webviews() {
  echo "## RAW: Webviews (vscode.window.register* + createWebviewPanel)"
  echo ""
  echo "### registerWebviewViewProvider calls (file:line:match)"
  "$RG_BIN" --with-filename --line-number \
    'vscode\.window\.registerWebviewViewProvider\(' \
    "$SRC/" \
    --only-matching \
    2>/dev/null \
    | strip_prefix \
    | sort -u || true
  echo ""
  echo "### viewType IDs (string literal passed to registerWebviewViewProvider)"
  "$RG_BIN" --no-filename --no-line-number \
    "registerWebviewViewProvider\('([^']+)'" \
    "$SRC/" \
    --only-matching \
    --replace '$1' \
    2>/dev/null | sort -u || true
  echo ""
  echo "### createWebviewPanel calls (file:line:match)"
  "$RG_BIN" --with-filename --line-number \
    'vscode\.window\.createWebviewPanel\(' \
    "$SRC/" \
    --only-matching \
    2>/dev/null \
    | strip_prefix \
    | sort -u || true
  echo ""
  echo "### registerFileDecorationProvider calls (file:line:match)"
  "$RG_BIN" --with-filename --line-number \
    'vscode\.window\.registerFileDecorationProvider\(' \
    "$SRC/" \
    --only-matching \
    2>/dev/null \
    | strip_prefix \
    | sort -u || true
  echo ""
}

section_config() {
  echo "## RAW: Configuration keys"
  echo ""
  echo "### contributes.configuration.properties (key TAB type TAB default)"
  jq -r '.contributes.configuration.properties
    | to_entries[]
    | [.key, (.value.type // "—"), (.value.default | tostring)]
    | @tsv' "$PKG" | sort -u
  echo ""
}

section_snippets() {
  echo "## RAW: Snippets"
  echo ""
  echo "### contributes.snippets (language TAB path)"
  jq -r '.contributes.snippets[]
    | [.language, .path]
    | @tsv' "$PKG" | sort -u
  echo ""
}

section_diagnostics() {
  echo "## RAW: Diagnostic Collections (createDiagnosticCollection)"
  echo ""
  echo "### createDiagnosticCollection (file:line TAB collection-name)"
  "$RG_BIN" --with-filename --line-number \
    "vscode\.languages\.createDiagnosticCollection\('([^']+)'\)" \
    "$SRC/" \
    --only-matching \
    --replace '$1' \
    2>/dev/null \
    | strip_prefix \
    | sort -u || true
  echo ""
}

crosscheck() {
  echo "## RAW: Cross-Check — declared vs runtime commands"
  echo ""
  echo "### Declared commands (from package.json contributes.commands)"
  jq -r '.contributes.commands[].command' "$PKG" | sort -u
  echo ""
  echo "### Runtime commands (from commandId helper calls in src/)"
  "$RG_BIN" --no-filename --no-line-number \
    "commandId\('([^']+)'\)" \
    "$SRC/" \
    --only-matching \
    --replace 'django-language-service.$1' \
    2>/dev/null | sort -u || true
  echo ""
  echo "### Diff: in declared but NOT in runtime (left-only)"
  comm -23 \
    <(jq -r '.contributes.commands[].command' "$PKG" | sort -u) \
    <("$RG_BIN" --no-filename --no-line-number \
        "commandId\('([^']+)'\)" \
        "$SRC/" \
        --only-matching \
        --replace 'django-language-service.$1' \
        2>/dev/null | sort -u) || true
  echo ""
  echo "### Diff: in runtime but NOT in declared (right-only)"
  comm -13 \
    <(jq -r '.contributes.commands[].command' "$PKG" | sort -u) \
    <("$RG_BIN" --no-filename --no-line-number \
        "commandId\('([^']+)'\)" \
        "$SRC/" \
        --only-matching \
        --replace 'django-language-service.$1' \
        2>/dev/null | sort -u) || true
  echo ""
}

# ── Main ──────────────────────────────────────────────────────────────────────

section_languages
section_commands_declared
section_commands_runtime
section_providers
section_webviews
section_config
section_snippets
section_diagnostics
crosscheck

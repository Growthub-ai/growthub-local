#!/usr/bin/env bash
# find-contracts.sh — Steps 2 & 4 of the oss-investigative-architecture skill.
#
# Read-only contract + extension-point discovery: contract/interface/schema
# files, adapter/provider/registry/plugin patterns, env selectors, and
# validation layers. Never writes, never touches the network.
#
# Usage:
#   bash find-contracts.sh [TARGET_REPO]   # default: $TARGET_REPO, then cwd
set -euo pipefail

ROOT="${1:-${TARGET_REPO:-$(pwd)}}"
ROOT="$(cd -- "$ROOT" && pwd -P)"

PRUNE=( -name node_modules -o -name .git -o -name dist -o -name build -o -name .next -o -name .vite -o -name coverage -o -name .pnpm-store )
GREP_EXCLUDES=( --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build --exclude-dir=.next --exclude-dir=.vite --exclude-dir=coverage --exclude-dir=.pnpm-store )
SRC_GLOBS=( --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.py' --include='*.go' --include='*.rs' )

section() { printf '\n== %s ==\n' "$1"; }

echo "contract + extension-point scan: $ROOT"

section "contract / schema / manifest files (by name)"
find "$ROOT" \( "${PRUNE[@]}" \) -prune -o -type f \
  \( -iname 'contract*' -o -iname '*schema*' -o -iname '*manifest*' -o -iname 'types.ts' -o -iname 'interfaces.ts' -o -iname '*.proto' -o -iname 'openapi*' \) \
  -print | sort | sed "s|^$ROOT/||" | head -60

section "exported interfaces / type contracts"
grep -rn "${GREP_EXCLUDES[@]}" "${SRC_GLOBS[@]}" -E 'export (interface|type|abstract class) [A-Z]' "$ROOT" 2>/dev/null \
  | sed "s|^$ROOT/||" | head -60

section "adapter / provider / backend patterns"
grep -rln "${GREP_EXCLUDES[@]}" "${SRC_GLOBS[@]}" -iE '(adapter|provider|backend|transport|driver)' "$ROOT" 2>/dev/null \
  | sed "s|^$ROOT/||" | head -60

section "registry / plugin / extension registration"
grep -rn "${GREP_EXCLUDES[@]}" "${SRC_GLOBS[@]}" -iE '(register[A-Z(]|registry|plugin|extension ?point)' "$ROOT" 2>/dev/null \
  | sed "s|^$ROOT/||" | head -40

section "env selectors / runtime gates"
grep -rn "${GREP_EXCLUDES[@]}" "${SRC_GLOBS[@]}" -E '(process\.env\.[A-Z_]+|os\.environ|getenv\()' "$ROOT" 2>/dev/null \
  | sed "s|^$ROOT/||" | head -40

section "validation layers"
grep -rln "${GREP_EXCLUDES[@]}" "${SRC_GLOBS[@]}" -iE '(validate|zod|ajv|pydantic|joi\.|yup\.)' "$ROOT" 2>/dev/null \
  | sed "s|^$ROOT/||" | head -40

section "event / trace conventions"
grep -rln "${GREP_EXCLUDES[@]}" "${SRC_GLOBS[@]}" -iE '(emit\(|EventEmitter|event[ _-]?schema|trace\.jsonl|\.ndjson)' "$ROOT" 2>/dev/null \
  | sed "s|^$ROOT/||" | head -40

echo
echo "done — the contracts surfaced above define the real extension path. Do not bypass them."

#!/usr/bin/env bash
# map-surfaces.sh — Step 1 of the oss-investigative-architecture skill.
#
# Read-only surface map of a target repository: top-level layout, package /
# monorepo boundaries, runtime + CLI entry points, docs inventory, and CI
# workflows. Never writes, never touches the network.
#
# Usage:
#   bash map-surfaces.sh [TARGET_REPO]   # default: $TARGET_REPO, then cwd
set -euo pipefail

ROOT="${1:-${TARGET_REPO:-$(pwd)}}"
ROOT="$(cd -- "$ROOT" && pwd -P)"

PRUNE=( -name node_modules -o -name .git -o -name dist -o -name build -o -name .next -o -name .vite -o -name coverage -o -name .pnpm-store )

section() { printf '\n== %s ==\n' "$1"; }

echo "surface map: $ROOT"

section "top-level layout"
find "$ROOT" -mindepth 1 -maxdepth 1 \( -name .git -o -name node_modules \) -prune -o -print | sort | sed "s|^$ROOT/||"

section "package boundaries (manifests)"
find "$ROOT" \( "${PRUNE[@]}" \) -prune -o -maxdepth 4 -type f \
  \( -name package.json -o -name pyproject.toml -o -name Cargo.toml -o -name go.mod -o -name pom.xml -o -name build.gradle -o -name Gemfile \) \
  -print | sort | sed "s|^$ROOT/||"

section "monorepo / workspace config"
find "$ROOT" \( "${PRUNE[@]}" \) -prune -o -maxdepth 2 -type f \
  \( -name pnpm-workspace.yaml -o -name lerna.json -o -name turbo.json -o -name nx.json -o -name rush.json \) \
  -print | sort | sed "s|^$ROOT/||"
if [ -f "$ROOT/package.json" ] && grep -q '"workspaces"' "$ROOT/package.json"; then
  echo "package.json declares workspaces:"
  grep -A 10 '"workspaces"' "$ROOT/package.json" | head -12
fi

section "declared entry points (bin / main / exports in package manifests)"
find "$ROOT" \( "${PRUNE[@]}" \) -prune -o -maxdepth 4 -type f -name package.json -print | sort | while read -r pkg; do
  rel="${pkg#"$ROOT"/}"
  hits="$(grep -E '"(bin|main|module|exports|types)"\s*:' "$pkg" | head -8 || true)"
  if [ -n "$hits" ]; then
    echo "$rel:"
    echo "$hits" | sed 's/^/  /'
  fi
done

section "likely runtime / CLI entry files"
find "$ROOT" \( "${PRUNE[@]}" \) -prune -o -maxdepth 5 -type f \
  \( -name 'index.ts' -o -name 'index.js' -o -name 'main.ts' -o -name 'main.py' -o -name 'main.go' -o -name 'cli.ts' -o -name 'cli.py' -o -name 'app.ts' -o -name 'server.ts' \) \
  -print | sort | sed "s|^$ROOT/||" | head -40

section "docs inventory"
find "$ROOT" \( "${PRUNE[@]}" \) -prune -o -maxdepth 3 -type f \
  \( -iname '*.md' -o -iname '*.mdx' -o -iname '*.rst' \) \
  -print | sort | sed "s|^$ROOT/||" | head -80

section "agent / contributor contracts"
find "$ROOT" \( "${PRUNE[@]}" \) -prune -o -maxdepth 2 -type f \
  \( -name AGENTS.md -o -name CLAUDE.md -o -name CONTRIBUTING.md -o -name .cursorrules -o -name CODEOWNERS \) \
  -print | sort | sed "s|^$ROOT/||"

section "CI workflows"
find "$ROOT/.github/workflows" -maxdepth 1 -type f \( -name '*.yml' -o -name '*.yaml' \) 2>/dev/null | sort | sed "s|^$ROOT/||" || echo "(none found under .github/workflows)"

echo
echo "done — read the surfaced files before making architectural claims."

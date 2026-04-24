#!/usr/bin/env bash
set -euo pipefail

SKILL_SRC="$(cd "$(dirname "$0")/.." && pwd)/SKILL.md"
DEST_DIR="$HOME/.claude/skills/growthub-creative-video-pipeline"

mkdir -p "$DEST_DIR"
cp "$SKILL_SRC" "$DEST_DIR/SKILL.md"
echo "Skill installed to $DEST_DIR/SKILL.md"
echo "Reload Claude Code (or open a new session) to activate."

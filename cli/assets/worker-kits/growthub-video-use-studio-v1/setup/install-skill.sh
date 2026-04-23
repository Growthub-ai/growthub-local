#!/usr/bin/env bash
set -euo pipefail

# Register the video-use fork as a Claude Code skill per the upstream README contract.
# Canonical: VIDEO_USE_HOME. Legacy alias: VIDEO_USE_FORK_PATH.
LOCAL_PATH="${VIDEO_USE_HOME:-${VIDEO_USE_FORK_PATH:-$HOME/video-use}}"
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
LINK_PATH="${SKILLS_DIR}/video-use"

if [ ! -d "${LOCAL_PATH}" ]; then
  echo "video-use fork not found at ${LOCAL_PATH}. Run setup/clone-fork.sh first." >&2
  exit 1
fi

mkdir -p "${SKILLS_DIR}"

if [ -L "${LINK_PATH}" ] || [ -e "${LINK_PATH}" ]; then
  echo "Skill entry already present at ${LINK_PATH}. Leaving as-is." >&2
  exit 0
fi

ln -s "${LOCAL_PATH}" "${LINK_PATH}"
echo "Linked ${LOCAL_PATH} -> ${LINK_PATH}"

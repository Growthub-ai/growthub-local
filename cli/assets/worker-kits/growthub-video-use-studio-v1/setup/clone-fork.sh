#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${VIDEO_USE_REPO_URL:-https://github.com/browser-use/video-use}"
# Canonical: VIDEO_USE_HOME. Legacy alias: VIDEO_USE_FORK_PATH.
LOCAL_PATH="${VIDEO_USE_HOME:-${VIDEO_USE_FORK_PATH:-$HOME/video-use}}"

if [ -d "${LOCAL_PATH}/.git" ]; then
  git -C "${LOCAL_PATH}" fetch origin
  git -C "${LOCAL_PATH}" pull --ff-only
else
  git clone "${REPO_URL}" "${LOCAL_PATH}"
fi

# Install the upstream package in editable mode so the CLI + skill resolve correctly.
if command -v pip3 >/dev/null 2>&1; then
  (cd "${LOCAL_PATH}" && pip3 install -e .)
fi

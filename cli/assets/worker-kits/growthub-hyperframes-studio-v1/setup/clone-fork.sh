#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${HYPERFRAMES_REPO_URL:-https://github.com/heygen-com/hyperframes}"
LOCAL_PATH="${HYPERFRAMES_LOCAL_PATH:-./.hyperframes}"

if [ -d "${LOCAL_PATH}/.git" ]; then
  git -C "${LOCAL_PATH}" fetch origin
  git -C "${LOCAL_PATH}" pull --ff-only
else
  git clone "${REPO_URL}" "${LOCAL_PATH}"
fi

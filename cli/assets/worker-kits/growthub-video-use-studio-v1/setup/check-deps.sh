#!/usr/bin/env bash
set -euo pipefail

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing dependency: $1" >&2
    exit 1
  }
}

optional_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Optional dependency not found: $1 (only needed for downloading online sources)" >&2
  fi
}

need_cmd python3
need_cmd pip3
need_cmd git
need_cmd ffmpeg
optional_cmd yt-dlp

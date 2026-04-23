#!/usr/bin/env bash
# extract-muse-frames.sh — deterministic muse-video frame extraction.
#
# Use: bash helpers/extract-muse-frames.sh <path-to-video.mp4> [--interval <seconds>]
#
# Replaces the inline ffprobe+ffmpeg block in skills.md Step 2b. Writes
# /tmp/muse_frames/frame_%ds.jpg and prints the first 3 frame paths so an
# agent can immediately read them via its file-read tool.
#
# Interval defaults to 3s for videos >=30s, 2s for videos <30s (matches the
# runbook guidance for TikTok-format short muses).

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: bash helpers/extract-muse-frames.sh <path-to-video> [--interval N]" >&2
  exit 2
fi

VIDEO="$1"
shift

if [[ ! -f "${VIDEO}" ]]; then
  echo "Video not found: ${VIDEO}" >&2
  exit 1
fi

INTERVAL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --interval)
      INTERVAL="$2"
      shift 2
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

for bin in ffprobe ffmpeg python3; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "Missing required binary on PATH: $bin" >&2
    exit 1
  fi
done

DURATION="$(ffprobe -v quiet -print_format json -show_format -show_streams "${VIDEO}" \
  | python3 -c 'import sys, json
d = json.load(sys.stdin)
for s in d.get("streams", []):
    if s.get("codec_type") == "video":
        print(s.get("duration", 0))
        break
')"
DURATION_INT="$(python3 -c "print(int(float('${DURATION:-0}')))")"

if [[ -z "${INTERVAL}" ]]; then
  if [[ "${DURATION_INT}" -lt 30 ]]; then
    INTERVAL=2
  else
    INTERVAL=3
  fi
fi

OUT_DIR="/tmp/muse_frames"
mkdir -p "${OUT_DIR}"
# Clear prior run so downstream `ls` stays deterministic.
rm -f "${OUT_DIR}"/frame_*.jpg

echo "video:    ${VIDEO}"
echo "duration: ${DURATION_INT}s"
echo "interval: ${INTERVAL}s"
echo "out:      ${OUT_DIR}"

ffmpeg -loglevel error -y -i "${VIDEO}" -vf "fps=1/${INTERVAL}" "${OUT_DIR}/frame_%ds.jpg"

echo ""
echo "First frames (read these with your file-read tool):"
ls "${OUT_DIR}"/frame_*.jpg | sort | head -3

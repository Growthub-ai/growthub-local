#!/usr/bin/env bash
set -euo pipefail

DEST="${VIDEO_USE_HOME:-$HOME/video-use}"

if [ -d "$DEST/.git" ]; then
  echo "video-use fork already cloned at $DEST"
  exit 0
fi

echo "Clone the video-use fork into $DEST, then re-run this script or set VIDEO_USE_HOME."
echo ""
echo "  git clone <your-video-use-fork-url> $DEST"
echo ""
echo "After cloning, install dependencies:"
echo "  cd $DEST && npm install"
echo ""
echo "Then set VIDEO_USE_HOME=$DEST in your .env.local"

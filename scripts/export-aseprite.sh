#!/usr/bin/env bash
# Export real art from Aseprite sources into the game's asset folder.
#
# Convention for character files (art/characters/<slot>/<name>.aseprite):
#   - canvas 32×64, one frame per animation frame
#   - tags named <anim>_<dir>: idle_down, idle_up, idle_left, walk_down, walk_up, walk_left
#   - tag order in the timeline MUST follow docs/spec.md (anim-major: idle_down, idle_up, idle_left, walk_down…)
#   - colors: only key ramps + fixed colors from art/palette/master.gpl
# Output: one sheet per file, one row per tag, padded to 6 columns (192×384).
#
# Requires the Aseprite CLI (`aseprite` on PATH, or set ASEPRITE=/path/to/aseprite).
# NOTE: written against Aseprite's documented CLI; verify on first real export.
set -euo pipefail
ASEPRITE="${ASEPRITE:-aseprite}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/art/characters"
OUT="$ROOT/client/public/assets/characters"

command -v "$ASEPRITE" >/dev/null || { echo "Aseprite CLI not found (set ASEPRITE=...)"; exit 1; }

shopt -s nullglob globstar
for file in "$SRC"/**/*.aseprite; do
  rel="${file#$SRC/}"
  dest="$OUT/${rel%.aseprite}.png"
  mkdir -p "$(dirname "$dest")"
  "$ASEPRITE" -b "$file" \
    --sheet "$dest" \
    --sheet-type rows \
    --sheet-columns 6 \
    --split-tags \
    --ignore-empty false \
    --data /dev/null
  echo "exported $rel"
done

cp "$ROOT/art/characters/items.json" "$OUT/items.json"
pnpm -s assets:validate

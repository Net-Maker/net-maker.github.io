#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v HandBrakeCLI >/dev/null 2>&1; then
  echo "HandBrakeCLI not found. Install it first: sudo apt install handbrake-cli"
  exit 1
fi

if [[ $# -gt 0 ]]; then
  TARGET_DIRS=("$@")
else
  TARGET_DIRS=("static/videos/animal" "static/videos/cloth")
fi

echo "Target directories:"
printf '  - %s\n' "${TARGET_DIRS[@]}"

compress_one() {
  local input="$1"
  local tmp="${input%.mp4}.hb.mp4"

  echo "Compressing: $input"
  HandBrakeCLI \
    -i "$input" \
    -o "$tmp" \
    --encoder x264 \
    --quality 24 \
    --rate 10 \
    --cfr \
    --optimize >/dev/null

  local old_size new_size
  old_size=$(stat -c%s "$input")
  new_size=$(stat -c%s "$tmp")

  if [[ "$new_size" -lt "$old_size" ]]; then
    mv "$tmp" "$input"
    echo "  -> replaced (${old_size} -> ${new_size} bytes)"
  else
    rm -f "$tmp"
    echo "  -> skipped (compressed file not smaller)"
  fi
}

while IFS= read -r -d '' file; do
  compress_one "$file"
done < <(find "${TARGET_DIRS[@]}" -type f -name "*.mp4" -print0)

echo "Done."


#!/usr/bin/env bash
# Download face-api.js models (từ vladmandic/face-api weights/)
set -euo pipefail

DIR="public/models"
BASE="https://raw.githubusercontent.com/vladmandic/face-api/master/model"

mkdir -p "$DIR"

FILES=(
  "tiny_face_detector_model-weights_manifest.json"
  "tiny_face_detector_model.bin"
  "face_landmark_68_model-weights_manifest.json"
  "face_landmark_68_model.bin"
  "face_recognition_model-weights_manifest.json"
  "face_recognition_model.bin"
  "face_recognition_model.bin-shard1"
)

for f in "${FILES[@]}"; do
  out="$DIR/$f"
  if [[ -f "$out" ]]; then
    echo "✓ $f (đã có)"
    continue
  fi
  echo "↓ $f"
  curl -fSL "$BASE/$f" -o "$out" || {
    # shard1 không phải model nào cũng có — bỏ qua nếu 404
    echo "  (bỏ qua $f)"
    rm -f "$out"
  }
done

echo "Xong! Models ở $DIR/"

#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

rm -f fluid-glass*.zip

glib-compile-schemas schemas/

gnome-extensions pack \
  --force \
  --extra-source=shaders \
  --extra-source=icons \
  --extra-source=glass \
  --extra-source=topbar \
  --extra-source=dock \
  --extra-source=presets \
  --extra-source=distroColors.js \
  --extra-source=glassEngine.js \
  --extra-source=guard.js \
  --extra-source=THIRD_PARTY_NOTICES.md \
  .

echo "Packaged: fluid-glass@pardhu0547s.github.io.shell-extension.zip"

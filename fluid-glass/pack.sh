#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
#
# Package Fluid-Glass using gnome-extensions pack with explicit --extra-source
# directories (no .gresource compilation required).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Clean up any leftover compiled schemas or zip
rm -f fluid-glass*.zip

# Ensure schemas are freshly compiled
glib-compile-schemas schemas/

gnome-extensions pack \
  --force \
  --extra-source=shaders \
  --extra-source=icons \
  --extra-source=glass \
  --extra-source=topbar \
  --extra-source=dock \
  --extra-source=presets \
  --extra-source=glassEngine.js \
  --extra-source=THIRD_PARTY_NOTICES.md \
  .

echo "Packaged: fluid-glass@pardhu0547s.github.io.shell-extension.zip"

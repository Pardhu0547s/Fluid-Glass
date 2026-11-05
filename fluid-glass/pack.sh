#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
#
# Package Fluid-Glass using gnome-extensions pack with explicit --extra-source
# directories (no .gresource compilation required).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

gnome-extensions pack \
  --force \
  --extra-source=assets \
  --extra-source=shaders \
  --extra-source=icons \
  --extra-source=glass \
  --extra-source=topbar \
  --extra-source=dock \
  --extra-source=presets \
  --extra-source=glassEffect.js \
  --extra-source=glassEngine.js \
  .

echo "Packaged: fluid-glass@fedora.shell-extension.zip"

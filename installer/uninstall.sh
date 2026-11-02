#!/usr/bin/env bash
# =============================================================================
# Fluid Glass 2.0: Complete Theme Uninstaller
# Restores original configuration and safely cleans up installed files
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
THEMES_DIR="${HOME}/.themes"
MANIFEST="${THEMES_DIR}/.fluid_glass_manifest.json"

echo "====================================================================="
echo "  Uninstalling Fluid Glass 2.0..."
echo "====================================================================="

# 1. Restore GTK and GSettings
"${SCRIPT_DIR}/restore.sh"

# 2. Remove Theme Directories
for c in Dark Light; do
  for name in Fluid-Glass Liquid-Tahoe; do
    t="${THEMES_DIR}/${name}-${c}"
    if [[ -d "${t}" ]]; then
      echo "[UNINSTALL] Removing ${t}..."
      rm -rf "${t}"
    fi
  done
done

# 3. Clean up extension if installed by Fluid Glass
EXT_DIR="${HOME}/.local/share/gnome-shell/extensions/liquid-glass@thinkingcoding1231.gmail.com"
if gnome-extensions list 2>/dev/null | grep -q "liquid-glass@thinkingcoding1231.gmail.com"; then
  echo "[UNINSTALL] Disabling extension..."
  gnome-extensions disable "liquid-glass@thinkingcoding1231.gmail.com" 2>/dev/null || true
fi
if [[ -d "${EXT_DIR}" ]]; then
  echo "[UNINSTALL] Removing extension files at ${EXT_DIR}..."
  rm -rf "${EXT_DIR}"
fi

# 4. Remove manifest
rm -f "${MANIFEST}"

echo "[OK] Fluid Glass 2.0 completely uninstalled."

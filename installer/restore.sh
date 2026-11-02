#!/usr/bin/env bash
# =============================================================================
# Fluid Glass 2.0: Configuration Restore Subsystem
# Restores user's original desktop & GTK configurations
# =============================================================================
set -euo pipefail

GTK4_DIR="${HOME}/.config/gtk-4.0"
ORIG_CSS="${GTK4_DIR}/gtk.css.fluid-glass-orig"
GSETTINGS_BACKUP="${GTK4_DIR}/gsettings_backup.env"

# 1. Restore GSettings
if [[ -f "${GSETTINGS_BACKUP}" ]]; then
  # shellcheck disable=SC1090
  source "${GSETTINGS_BACKUP}"
  echo "[RESTORE] Restoring original desktop themes..."
  gsettings set org.gnome.desktop.interface gtk-theme "${ORIG_GTK_THEME//\'/}" 2>/dev/null || true
  gsettings set org.gnome.shell.extensions.user-theme name "${ORIG_SHELL_THEME//\'/}" 2>/dev/null || true
  gsettings set org.gnome.desktop.interface color-scheme "${ORIG_COLOR_SCHEME//\'/}" 2>/dev/null || true
  rm -f "${GSETTINGS_BACKUP}"
else
  # Default fallbacks
  gsettings set org.gnome.desktop.interface gtk-theme 'Adwaita' 2>/dev/null || true
  gsettings reset org.gnome.shell.extensions.user-theme name 2>/dev/null || true
fi

# 2. Restore GTK4
if [[ -f "${ORIG_CSS}" ]]; then
  echo "[RESTORE] Restoring original GTK4 configuration..."
  mv -f "${ORIG_CSS}" "${GTK4_DIR}/gtk.css"
  rm -f "${GTK4_DIR}/gtk-dark.css" "${GTK4_DIR}/gtk-light.css"
  rm -rf "${GTK4_DIR}/assets" "${GTK4_DIR}/windows-assets"
else
  echo "[RESTORE] Cleaning Fluid Glass GTK4 files..."
  rm -f "${GTK4_DIR}/gtk.css" "${GTK4_DIR}/gtk-dark.css" "${GTK4_DIR}/gtk-light.css"
  rm -rf "${GTK4_DIR}/assets" "${GTK4_DIR}/windows-assets"
fi

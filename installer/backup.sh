#!/usr/bin/env bash
# =============================================================================
# Fluid Glass 2.0: Configuration Backup Subsystem
# Preserves user's original desktop & GTK configurations without overwriting
# =============================================================================
set -euo pipefail

GTK4_DIR="${HOME}/.config/gtk-4.0"
ORIG_CSS="${GTK4_DIR}/gtk.css.fluid-glass-orig"
GSETTINGS_BACKUP="${GTK4_DIR}/gsettings_backup.env"

mkdir -p "${GTK4_DIR}"

# 1. Back up GTK4 config if not already backed up
if [[ -f "${GTK4_DIR}/gtk.css" && ! -f "${ORIG_CSS}" ]]; then
  if ! grep -q "Fluid-Glass" "${GTK4_DIR}/gtk.css" 2>/dev/null; then
    cp "${GTK4_DIR}/gtk.css" "${ORIG_CSS}"
    echo "[BACKUP] Saved original GTK4 stylesheet to $(basename "${ORIG_CSS}")"
  fi
fi

# 2. Back up GSettings theme state if not already saved
if [[ ! -f "${GSETTINGS_BACKUP}" ]]; then
  current_gtk="$(gsettings get org.gnome.desktop.interface gtk-theme 2>/dev/null || echo "'Adwaita'")"
  current_shell="$(gsettings get org.gnome.shell.extensions.user-theme name 2>/dev/null || echo "''")"
  current_scheme="$(gsettings get org.gnome.desktop.interface color-scheme 2>/dev/null || echo "'default'")"

  # Don't save Fluid-Glass as the original backup
  if [[ "${current_gtk}" =~ "Fluid-Glass" ]]; then current_gtk="'Adwaita'"; fi
  if [[ "${current_shell}" =~ "Fluid-Glass" ]]; then current_shell="''"; fi

  cat > "${GSETTINGS_BACKUP}" <<EOF
ORIG_GTK_THEME=${current_gtk}
ORIG_SHELL_THEME=${current_shell}
ORIG_COLOR_SCHEME=${current_scheme}
EOF
  echo "[BACKUP] Saved original desktop theme preferences"
fi

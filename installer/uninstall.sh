#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
UUID="fluid-glass@fluidglass.dev"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
STATE_DIR="$STATE_HOME/fluid-glass"
EXT_DIR="$DATA_HOME/gnome-shell/extensions/$UUID"
THEMES_DIR="$HOME/.themes"

if [[ ! -f "$STATE_DIR/install-state" ]]; then
    echo "No Fluid Glass installation state found; nothing will be removed."
    exit 0
fi

# shellcheck disable=SC1090
source "$STATE_DIR/install-state"

if [[ "${extension_installed:-0}" == 1 ]]; then
    if command -v gnome-extensions >/dev/null 2>&1; then
        gnome-extensions disable "$UUID" >/dev/null 2>&1 || true
    fi
    if [[ -f "$EXT_DIR/.fluid-glass-owned" ]]; then
        rm -rf -- "$EXT_DIR"
    else
        echo "Extension directory ownership marker missing; leaving $EXT_DIR untouched." >&2
    fi
fi

# Remove only marked theme directories and restore any original directory backed
# up by this installer. A directory without our marker is treated as user data.
IFS=':' read -r -a theme_names <<< "${installed_themes:-${gtk_theme:-}}"
for theme_name in "${theme_names[@]}"; do
    [[ -n "$theme_name" ]] || continue
    theme_path="$THEMES_DIR/$theme_name"
    if [[ -f "$theme_path/.fluid-glass-owned" ]]; then
        rm -rf -- "$theme_path"
    fi
    previous="$STATE_DIR/backups/${backup_id:-unknown}/$theme_name.previous"
    if [[ -d "$previous" && ! -e "$theme_path" ]]; then
        cp -a "$previous" "$theme_path"
    fi
done

if [[ -f "$STATE_DIR/gtk-theme.before" ]] && command -v gsettings >/dev/null 2>&1; then
    previous_theme="$(<"$STATE_DIR/gtk-theme.before")"
    if [[ -n "$previous_theme" ]] && gsettings writable org.gnome.desktop.interface gtk-theme >/dev/null 2>&1; then
        gsettings set org.gnome.desktop.interface gtk-theme "$previous_theme" || \
            echo "Could not restore previous GTK theme setting automatically." >&2
    fi
fi

rm -f -- "$STATE_DIR/install-state"
rm -f -- "$STATE_DIR/gtk-theme.before"
echo "Fluid Glass components installed by this installer have been removed."
echo "Backups remain at: $STATE_DIR (remove manually after checking them)."

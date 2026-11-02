#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(<"$ROOT/VERSION")"
UUID="fluid-glass@fluidglass.dev"
VARIANT="dark"
WITH_EXTENSION=1
EXT_ONLY=0
DRY_RUN=0

usage() {
    cat <<'HELP'
Fluid Glass 2.0 installer

Usage: ./install.sh [options]
  --variant dark|light   Select GTK3 variant (default: dark)
  --gtk-only             Install GTK3/GTK4 theme only; skip Shell extension
  --extension-only       Install Shell extension only
  --dry-run              Print planned changes without modifying the system
  -h, --help             Show this help

This alpha targets Fedora Workstation 44 / GNOME Shell 50.
All files are installed per-user; root privileges are not used.
HELP
}

while (($#)); do
    case "$1" in
        --variant)
            (($# >= 2)) || { echo "--variant requires dark or light" >&2; exit 2; }
            VARIANT="$2"; shift 2 ;;
        --gtk-only) WITH_EXTENSION=0; shift ;;
        --extension-only) EXT_ONLY=1; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
    esac
done

[[ "$VARIANT" == dark || "$VARIANT" == light ]] || { echo "Invalid variant: $VARIANT" >&2; exit 2; }

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
THEMES_DIR="$HOME/.themes"
STATE_DIR="$STATE_HOME/fluid-glass"
BACKUP_ROOT="$STATE_DIR/backups"
EXT_DIR="$DATA_HOME/gnome-shell/extensions/$UUID"
DIST="$ROOT/dist/fluid-glass-$VERSION"
THEME_NAME="Fluid-Glass-$([[ "$VARIANT" == dark ]] && echo Dark || echo Light)"

if [[ ! -d "$DIST" ]]; then "$ROOT/build.sh"; fi

shell_version=""
if (( WITH_EXTENSION )); then
    if (( DRY_RUN )); then
        shell_version="$(gnome-shell --version 2>/dev/null | grep -oE '[0-9]+' | head -n1 || true)"
        [[ -n "$shell_version" ]] || shell_version="not detected in this environment"
    else
        command -v gnome-extensions >/dev/null 2>&1 || {
            echo "gnome-extensions was not found. Install GNOME Shell utilities or use --gtk-only." >&2; exit 1;
        }
        command -v glib-compile-schemas >/dev/null 2>&1 || {
            echo "glib-compile-schemas was not found. Install Fedora's GLib tools, or use --gtk-only." >&2; exit 1;
        }
        shell_version="$(gnome-shell --version 2>/dev/null | grep -oE '[0-9]+' | head -n1 || true)"
        [[ "$shell_version" == "50" ]] || {
            echo "Fluid Glass 2.0 alpha currently supports GNOME Shell 50 only (detected: ${shell_version:-unknown})." >&2
            echo "Use --gtk-only for the GTK3 theme, or wait for a tested compatibility build." >&2
            exit 1
        }
    fi
    if [[ -e "$EXT_DIR" && ! -f "$EXT_DIR/.fluid-glass-owned" ]]; then
        if (( DRY_RUN )); then
            echo "Dry run: installation would refuse to overwrite the unowned extension at: $EXT_DIR" >&2
        else
            echo "Refusing to overwrite an existing extension at: $EXT_DIR" >&2
            echo "The directory is not owned by Fluid Glass; leaving it untouched." >&2
        fi
        exit 1
    fi
fi

if (( DRY_RUN )); then
    if (( EXT_ONLY == 0 )); then
        echo "Would install GTK3/GTK4 theme: $DIST/themes/$THEME_NAME -> $THEMES_DIR/$THEME_NAME"
    fi
    (( WITH_EXTENSION )) && echo "Would install GNOME Shell extension: $EXT_DIR (GNOME $shell_version)"
    echo "Would save reversible state under: $STATE_DIR"
    exit 0
fi

mkdir -p "$STATE_DIR" "$THEMES_DIR"

# Read the prior manifest so repeated installs and variant switches remain reversible.
prior_themes=""
prior_extension=0
prior_active_theme=""
backup_id=""
if [[ -f "$STATE_DIR/install-state" ]]; then
    # shellcheck disable=SC1090
    source "$STATE_DIR/install-state"
    prior_themes="${installed_themes:-${gtk_theme:-}}"
    prior_extension="${extension_installed:-0}"
    prior_active_theme="${gtk_theme:-}"
    backup_id="${backup_id:-}"
fi
if [[ -z "$backup_id" ]]; then
    backup_id="$(date +%Y%m%d%H%M%S)-$$"
fi
BACKUP_DIR="$BACKUP_ROOT/$backup_id"
mkdir -p "$BACKUP_DIR"

installed_themes="$prior_themes"
active_theme="$prior_active_theme"

# Save the original GTK theme once, before the first change.
if (( EXT_ONLY == 0 )) && [[ ! -f "$STATE_DIR/gtk-theme.before" ]] && command -v gsettings >/dev/null 2>&1; then
    if gsettings writable org.gnome.desktop.interface gtk-theme >/dev/null 2>&1; then
        gsettings get org.gnome.desktop.interface gtk-theme | sed "s/^'//; s/'$//" > "$STATE_DIR/gtk-theme.before"
    fi
fi

# Record intended ownership before touching destinations. On an interrupted install,
# uninstall still uses marker files and therefore never deletes an unowned directory.
if (( EXT_ONLY == 0 )); then
    case ":$installed_themes:" in
        *":$THEME_NAME:"*) ;;
        *) installed_themes="${installed_themes:+$installed_themes:}$THEME_NAME" ;;
    esac
    active_theme="$THEME_NAME"
fi
extension_installed="$prior_extension"
if (( WITH_EXTENSION )); then extension_installed=1; fi
state_tmp="$STATE_DIR/install-state.tmp.$$"
cat > "$state_tmp" <<STATE
version=$VERSION
backup_id=$backup_id
variant=$VARIANT
gtk_theme=$active_theme
installed_themes=$installed_themes
extension_installed=$extension_installed
STATE
mv -f -- "$state_tmp" "$STATE_DIR/install-state"

if (( EXT_ONLY == 0 )); then
    source_theme="$DIST/themes/$THEME_NAME"
    target_theme="$THEMES_DIR/$THEME_NAME"
    # Preserve an existing user theme once. Repeated Fluid Glass updates do not
    # overwrite the original backup.
    if [[ -d "$target_theme" && ! -f "$target_theme/.fluid-glass-owned" && ! -d "$BACKUP_DIR/$THEME_NAME.previous" ]]; then
        cp -a "$target_theme" "$BACKUP_DIR/$THEME_NAME.previous"
    fi
    stage="$THEMES_DIR/.${THEME_NAME}.staging.$$"
    rm -rf -- "$stage"
    cp -a "$source_theme" "$stage"
    touch "$stage/.fluid-glass-owned"
    rm -rf -- "$target_theme"
    mv -- "$stage" "$target_theme"

    # Remove the old active variant only if it was installed by this project.
    if [[ -n "$prior_active_theme" && "$prior_active_theme" != "$THEME_NAME" ]]; then
        old_theme_path="$THEMES_DIR/$prior_active_theme"
        if [[ -f "$old_theme_path/.fluid-glass-owned" ]]; then
            rm -rf -- "$old_theme_path"
        fi
    fi

    if command -v gsettings >/dev/null 2>&1 && gsettings writable org.gnome.desktop.interface gtk-theme >/dev/null 2>&1; then
        gsettings set org.gnome.desktop.interface gtk-theme "$THEME_NAME"
    else
        echo "Warning: GTK theme installed, but GSettings could not select it automatically." >&2
    fi
fi

if (( WITH_EXTENSION )); then
    mkdir -p "$(dirname -- "$EXT_DIR")"
    stage="$(dirname -- "$EXT_DIR")/.${UUID}.staging.$$"
    rm -rf -- "$stage"
    cp -a "$DIST/extension/." "$stage/"
    # GNOME Shell resolves extension-local GSettings schemas from the compiled
    # schema file. Compile at install time so source archives stay reproducible.
    glib-compile-schemas --strict "$stage/schemas"
    touch "$stage/.fluid-glass-owned"
    rm -rf -- "$EXT_DIR"
    mv -- "$stage" "$EXT_DIR"
    if ! gnome-extensions enable "$UUID" >/dev/null 2>&1; then
        echo "Note: Extension files installed and schemas compiled. GNOME Shell will detect the extension after logout/login."
    fi
fi

echo "Fluid Glass $VERSION installed for this user."
(( EXT_ONLY == 0 )) && echo "GTK3/GTK4 variant: $VARIANT"
(( WITH_EXTENSION )) && echo "GNOME Shell extension: enabled (a logout/login may be needed if Shell does not reload it)."
echo "To remove safely: ./uninstall.sh"

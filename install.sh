#!/usr/bin/env bash
#
# Fluid Glass for Linux installer
#
# Usage: ./install.sh [OPTIONS]
#   -c, --color   dark|light              Variant applied to GTK4/libadwaita apps
#   -s, --style   clear|normal|frosted    Glass strength (default: normal)
#   -d, --dest    DIR                     Install themes here (default: ~/.themes)
#       --laptop                          Compact laptop sizing
#       --rebuild                         Rebuild from source even if ./dist exists
#       --no-libadwaita                   Do not touch ~/.config/gtk-4.0
#       --no-apply                        Install only; do not change GNOME settings
#   -e, --with-extension                  Enable the optional Liquid Glass extension
#                                         (must already be installed; see README)
#   -r, --remove, --uninstall             Remove the theme and restore your gtk-4.0 files
#   -h, --help
#
# Nothing in this script writes into the repository, and it never downloads
# anything. Prebuilt themes are used when ./dist exists (release tarballs);
# otherwise, or for non-default options, the themes are compiled with sassc.
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAME="Fluid-Glass"
DEST="${HOME}/.themes"
COLOR=""
STYLE="normal"
HD="true"
REBUILD="false"
LIBADWAITA="true"
APPLY="true"
WITH_EXT="false"
REMOVE="false"

GTK4_CONF="${HOME}/.config/gtk-4.0"
BACKUP_DIR="${GTK4_CONF}/.fluid-glass-backup"
EXT_UUID="liquid-glass@thinkingcoding1231.gmail.com"
EXT_URL="https://github.com/ryohsuke1231/liquid-glass"
GTK4_ITEMS=(gtk.css gtk-dark.css gtk-light.css assets windows-assets)

usage() { sed -n '3,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }
info() { printf '==> %s\n' "$*"; }
warn() { printf 'Warning: %s\n' "$*" >&2; }
die()  { printf 'Error: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--color)
      v="${2:-}"; v="${v,,}"
      [[ "$v" == dark || "$v" == light ]] || die "--color must be dark or light"
      COLOR="$v"; shift 2 ;;
    -s|--style)
      v="${2:-}"; v="${v,,}"
      [[ "$v" == clear || "$v" == normal || "$v" == frosted ]] || die "--style must be clear, normal or frosted"
      STYLE="$v"; shift 2 ;;
    -d|--dest)
      [[ -n "${2:-}" ]] || die "--dest needs a directory"
      DEST="${2/#\~/$HOME}"; shift 2 ;;
    --laptop)          HD="false"; shift ;;
    --mac27|--hd)      HD="true"; shift ;;
    -l|--libadwaita)   LIBADWAITA="true"; shift ;;
    --rebuild)         REBUILD="true"; shift ;;
    --no-libadwaita)   LIBADWAITA="false"; shift ;;
    --no-apply)        APPLY="false"; shift ;;
    -e|--with-extension) WITH_EXT="true"; shift ;;
    -r|--remove|--uninstall) REMOVE="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) warn "Unknown option '$1'"; usage; exit 1 ;;
  esac
done

have_schema_key() { gsettings get "$1" "$2" >/dev/null 2>&1; }

# ---------------------------------------------------------------------------
# GTK4 / libadwaita backup + restore (one backup, taken once, never overwritten)
# ---------------------------------------------------------------------------
backup_gtk4() {
  [[ -d "${BACKUP_DIR}" ]] && return 0          # keep the user's ORIGINAL files
  mkdir -p "${BACKUP_DIR}"
  local item
  for item in "${GTK4_ITEMS[@]}"; do
    if [[ -e "${GTK4_CONF}/${item}" || -L "${GTK4_CONF}/${item}" ]]; then
      cp -a "${GTK4_CONF}/${item}" "${BACKUP_DIR}/${item}"
    fi
  done
}

restore_gtk4() {
  local item
  if [[ -d "${BACKUP_DIR}" ]]; then
    for item in "${GTK4_ITEMS[@]}"; do
      rm -rf "${GTK4_CONF:?}/${item}"
      if [[ -e "${BACKUP_DIR}/${item}" || -L "${BACKUP_DIR}/${item}" ]]; then
        cp -a "${BACKUP_DIR}/${item}" "${GTK4_CONF}/${item}"
      fi
    done
    rm -rf "${BACKUP_DIR}"
    info "Restored your original ~/.config/gtk-4.0 files"
    return 0
  fi
  # Installed by an older version of this script: it left timestamped backups.
  # The OLDEST one is the user's original, so prefer it.
  local legacy
  legacy="$(ls -tr "${GTK4_CONF}"/gtk.css.backup.* 2>/dev/null | head -n1 || true)"
  if [[ -n "${legacy}" ]]; then
    rm -rf "${GTK4_CONF:?}/gtk.css" "${GTK4_CONF:?}/gtk-dark.css" "${GTK4_CONF:?}/gtk-light.css" \
           "${GTK4_CONF:?}/assets" "${GTK4_CONF:?}/windows-assets"
    cp -a "${legacy}" "${GTK4_CONF}/gtk.css"
    info "Restored ${legacy##*/}"
  else
    # No record of what was there before, so we cannot tell our files from the
    # user's own. Leave them alone rather than risk deleting someone's config.
    warn "No backup found; ~/.config/gtk-4.0 was left untouched."
    warn "If Fluid Glass styled your GTK4 apps, delete gtk.css, gtk-dark.css, gtk-light.css, assets and windows-assets there by hand."
  fi
}

# ---------------------------------------------------------------------------
# Uninstall
# ---------------------------------------------------------------------------
if [[ "${REMOVE}" == "true" ]]; then
  info "Removing Fluid Glass from ${DEST}"
  # Names used by earlier releases are removed too.
  for n in "${NAME}" Liquid-Tahoe; do
    rm -rf "${DEST:?}/${n}-Dark" "${DEST:?}/${n}-Light"
  done
  restore_gtk4

  if [[ "${APPLY}" == "true" ]]; then
    gtk_now="$(gsettings get org.gnome.desktop.interface gtk-theme 2>/dev/null || true)"
    [[ "${gtk_now}" == *"${NAME}"* || "${gtk_now}" == *Liquid-Tahoe* ]] \
      && gsettings reset org.gnome.desktop.interface gtk-theme
    shell_now="$(gsettings get org.gnome.shell.extensions.user-theme name 2>/dev/null || true)"
    [[ "${shell_now}" == *"${NAME}"* || "${shell_now}" == *Liquid-Tahoe* ]] \
      && gsettings reset org.gnome.shell.extensions.user-theme name
  fi
  info "Done. The optional Liquid Glass extension was left untouched; remove it with the Extensions app."
  exit 0
fi

# ---------------------------------------------------------------------------
# Locate or build the themes
# ---------------------------------------------------------------------------
SRC_DIST="${REPO_DIR}/dist"
need_build="false"
[[ "${REBUILD}" == "true" || "${STYLE}" != "normal" || "${HD}" != "true" ]] && need_build="true"
[[ -d "${SRC_DIST}/${NAME}-Dark" && -d "${SRC_DIST}/${NAME}-Light" ]] || need_build="true"

if [[ "${need_build}" == "true" ]]; then
  command -v sassc >/dev/null || die "sassc is required to build the theme (apt/dnf/pacman/zypper install sassc), or use a release tarball that ships prebuilt themes."
  SRC_DIST="$(mktemp -d)"
  trap 'rm -rf "${SRC_DIST}"' EXIT
  build_args=(-c all -s "${STYLE}" -o "${SRC_DIST}")
  [[ "${HD}" == "false" ]] && build_args+=(--laptop)
  info "Building themes (style: ${STYLE})"
  "${REPO_DIR}/build.sh" "${build_args[@]}" >/dev/null
fi

# ---------------------------------------------------------------------------
# Install
# ---------------------------------------------------------------------------
info "Installing to ${DEST}"
mkdir -p "${DEST}"
for c in Dark Light; do
  rm -rf "${DEST:?}/${NAME}-${c}"
  cp -r "${SRC_DIST}/${NAME}-${c}" "${DEST}/"
done

THEME_NAME="${NAME}-${COLOR:+${COLOR^}}"
if [[ -z "${COLOR}" ]]; then
  # No explicit color: follow the current system color scheme, default to Dark.
  scheme="$(gsettings get org.gnome.desktop.interface color-scheme 2>/dev/null || true)"
  [[ "${scheme}" == *prefer-light* || "${scheme}" == *default* ]] && THEME_NAME="${NAME}-Light" || THEME_NAME="${NAME}-Dark"
fi

if [[ "${LIBADWAITA}" == "true" ]]; then
  info "Applying to GTK4/libadwaita apps (${THEME_NAME})"
  mkdir -p "${GTK4_CONF}"
  backup_gtk4
  for item in "${GTK4_ITEMS[@]}"; do rm -rf "${GTK4_CONF:?}/${item}"; done   # removes symlinks, never their targets
  cp -r  "${DEST}/${THEME_NAME}/gtk-4.0/assets"          "${GTK4_CONF}/assets"
  cp -r  "${DEST}/${THEME_NAME}/gtk-4.0/windows-assets"  "${GTK4_CONF}/windows-assets"
  cp     "${DEST}/${THEME_NAME}/gtk-4.0/gtk.css"         "${GTK4_CONF}/gtk.css"
  cp     "${DEST}/${THEME_NAME}/gtk-4.0/gtk-dark.css"    "${GTK4_CONF}/gtk-dark.css"
  cp     "${DEST}/${THEME_NAME}/gtk-4.0/gtk-light.css"   "${GTK4_CONF}/gtk-light.css"
fi

# ---------------------------------------------------------------------------
# Optional Liquid Glass extension (never bundled, never downloaded)
# ---------------------------------------------------------------------------
if [[ "${WITH_EXT}" == "true" ]]; then
  if command -v gnome-extensions >/dev/null && gnome-extensions list 2>/dev/null | grep -qx "${EXT_UUID}"; then
    gnome-extensions enable "${EXT_UUID}" && info "Enabled the Liquid Glass extension"
  else
    warn "The Liquid Glass extension is not installed. Install it from ${EXT_URL}"
    warn "then run: gnome-extensions enable ${EXT_UUID}   (log out and in first on Wayland)"
  fi
fi

# ---------------------------------------------------------------------------
# Fluid Glass Unified Extension & Customizer App
# ---------------------------------------------------------------------------
if [[ -d "${REPO_DIR}/fluid-glass" ]]; then
  info "Installing Fluid Glass Extension (fluid-glass@fedora)"
  EXT_DEST="${HOME}/.local/share/gnome-shell/extensions/fluid-glass@fedora"
  mkdir -p "${HOME}/.local/share/gnome-shell/extensions"
  rm -rf "${EXT_DEST}"
  cp -a "${REPO_DIR}/fluid-glass" "${EXT_DEST}"
  if command -v glib-compile-schemas >/dev/null; then
    glib-compile-schemas "${EXT_DEST}/schemas/" || true
    mkdir -p "${HOME}/.local/share/glib-2.0/schemas/"
    cp "${EXT_DEST}/schemas/"*.xml "${HOME}/.local/share/glib-2.0/schemas/" 2>/dev/null || true
    glib-compile-schemas "${HOME}/.local/share/glib-2.0/schemas/" || true
  fi
fi

if [[ -d "${REPO_DIR}/fluid-glass-app" ]]; then
  info "Installing Fluid Glass Settings Customizer App"
  mkdir -p "${HOME}/.local/bin" "${HOME}/.local/share/applications" "${HOME}/.local/share/icons/hicolor/scalable/apps"
  cp -f "${REPO_DIR}/fluid-glass-app/main.py" "${HOME}/.local/bin/fluid-glass-settings"
  chmod +x "${HOME}/.local/bin/fluid-glass-settings"
  cp -f "${REPO_DIR}/fluid-glass-app/fluid-glass-settings.desktop" "${HOME}/.local/share/applications/"
  cp -f "${REPO_DIR}/fluid-glass-app/fluid-glass.svg" "${HOME}/.local/share/icons/hicolor/scalable/apps/"
  command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -f -t "${HOME}/.local/share/icons/hicolor/" 2>/dev/null || true
  command -v update-desktop-database >/dev/null && update-desktop-database "${HOME}/.local/share/applications/" 2>/dev/null || true
fi

info "Done. Launch the customizer anytime by running 'fluid-glass-settings' or opening Fluid Glass from your app launcher."

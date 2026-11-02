#!/usr/bin/env bash
# =============================================================================
# Fluid Glass 2.0: Atomic Manifest-Driven Installer
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
EXT_SRC="${ROOT_DIR}/extension/liquid-glass@thinkingcoding1231.gmail.com"

DEST="${HOME}/.themes"
COLOR="Dark"
STYLE="normal"
HD="true"
LIBADWAITA="true"
WITH_EXT="false"
FORCE_BUILD="false"

# Styling colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err()     { echo -e "${RED}[ERR]${NC} $1"; }

usage() {
  cat <<EOF
Fluid Glass 2.0 Installer

Usage: ./install.sh [OPTIONS]
  -c, --color, --variant [dark|light]  Color variant (default: dark)
  -s, --style, --mode [clear|normal|frosted] Glass style (default: normal)
  -d, --dest DIR                       Install directory (default: ~/.themes)
  -b, --build                          Rebuild themes from SCSS source with sassc
  -l, --libadwaita                     Configure GTK4 ~/.config/gtk-4.0 (default: true)
      --no-libadwaita                  Do not configure GTK4
      --mac27, --hd                    macOS 27" Desktop proportions (default)
      --laptop                         Compact laptop sizing
  -e, --with-extension                 Install and enable Liquid Glass extension
  -r, --remove, --uninstall            Uninstall Fluid-Glass and restore backups
  -h, --help                           Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--color|--variant)
      [[ $# -ge 2 ]] || { log_err "Option '$1' requires an argument (dark|light)"; exit 1; }
      case "${2,,}" in
        dark)  COLOR="Dark" ;;
        light) COLOR="Light" ;;
        *) log_err "Unknown variant '$2'. Use 'dark' or 'light'."; exit 1 ;;
      esac; shift 2 ;;
    -s|--style|--mode)
      [[ $# -ge 2 ]] || { log_err "Option '$1' requires an argument (clear|normal|frosted)"; exit 1; }
      case "${2,,}" in
        clear|normal|frosted) STYLE="${2,,}" ;;
        *) log_err "Unknown style '$2'. Use 'clear', 'normal', or 'frosted'."; exit 1 ;;
      esac; shift 2 ;;
    -d|--dest)
      [[ $# -ge 2 ]] || { log_err "Option '$1' requires a directory argument"; exit 1; }
      DEST="$2"; shift 2 ;;
    -b|--build) FORCE_BUILD="true"; shift ;;
    -l|--libadwaita) LIBADWAITA="true"; shift ;;
    --no-libadwaita) LIBADWAITA="false"; shift ;;
    --mac27|--hd) HD="true"; shift ;;
    --laptop)     HD="false"; shift ;;
    -e|--with-extension) WITH_EXT="true"; shift ;;
    -r|--remove|--uninstall) "${SCRIPT_DIR}/uninstall.sh"; exit 0 ;;
    -h|--help) usage; exit 0 ;;
    *) log_err "Unknown option '$1'"; usage; exit 1 ;;
  esac
done

THEME_NAME="Fluid-Glass-${COLOR}"

echo -e "\n${BOLD}Fluid Glass 2.0 Theme Installer${NC}"
echo -e "Variant: ${COLOR} | Style: ${STYLE} | Proportions: $(if [[ "$HD" == "true" ]]; then echo "Desktop (27\")"; else echo "Laptop"; fi)\n"

# 1. Back up existing user configurations safely
"${SCRIPT_DIR}/backup.sh"

# 2. Check if build is required
TARGET_DIST="${DIST_DIR}/Fluid-Glass-${COLOR}"
if [[ "${FORCE_BUILD}" == "true" || ! -d "${TARGET_DIST}" ]]; then
  if ! command -v sassc &>/dev/null; then
    log_err "sassc is required to build from SCSS source."
    echo "  Fedora:        sudo dnf install sassc"
    echo "  Ubuntu/Debian: sudo apt install sassc"
    echo "  Arch Linux:    sudo pacman -S sassc"
    exit 1
  fi
  hd_flag="--hd"
  [[ "${HD}" == "false" ]] && hd_flag="--laptop"
  log_info "Building theme assets from SCSS..."
  "${ROOT_DIR}/scripts/build.sh" -c all -s "${STYLE}" "${hd_flag}" -o "${DIST_DIR}"
else
  log_info "Using precompiled theme assets from ./dist"
fi

# 3. Stage atomic installation
mkdir -p "${DEST}"
STAGE_DIR="$(mktemp -d "${DEST}/.stage_XXXXXX")"
trap 'rm -rf "${STAGE_DIR}"' EXIT

for c in Dark Light; do
  T_SRC="${DIST_DIR}/Fluid-Glass-${c}"
  T_DST="${DEST}/Fluid-Glass-${c}"

  if [[ ! -d "${T_SRC}" ]]; then
    log_err "Missing build artifact: ${T_SRC}"
    exit 1
  fi

  # Copy to staging
  cp -r "${T_SRC}" "${STAGE_DIR}/Fluid-Glass-${c}"
  rm -rf "${T_DST}"
  mv "${STAGE_DIR}/Fluid-Glass-${c}" "${T_DST}"
  log_success "Installed Fluid-Glass-${c} to ${DEST}"
done

# 4. Configure GTK4 / Libadwaita
if [[ "${LIBADWAITA}" == "true" ]]; then
  GTK4_CONF="${HOME}/.config/gtk-4.0"
  mkdir -p "${GTK4_CONF}"
  T_ADW="${DEST}/${THEME_NAME}/gtk-4.0"

  cp -f "${T_ADW}/gtk.css"        "${GTK4_CONF}/gtk.css"
  cp -f "${T_ADW}/gtk-dark.css"   "${GTK4_CONF}/gtk-dark.css"
  cp -f "${T_ADW}/gtk-light.css"  "${GTK4_CONF}/gtk-light.css"
  rm -rf "${GTK4_CONF}/assets" "${GTK4_CONF}/windows-assets"
  cp -r "${T_ADW}/assets"         "${GTK4_CONF}/"
  cp -r "${T_ADW}/windows-assets" "${GTK4_CONF}/"
  log_success "Configured GTK4/libadwaita in ${GTK4_CONF}"
fi

# 5. Extension Installation
if [[ "${WITH_EXT}" == "true" ]]; then
  EXT_DEST="${HOME}/.local/share/gnome-shell/extensions/liquid-glass@thinkingcoding1231.gmail.com"
  if [[ -d "${EXT_SRC}" ]]; then
    log_info "Installing Liquid Glass GNOME extension..."
    mkdir -p "$(dirname "${EXT_DEST}")"
    rm -rf "${EXT_DEST}"
    cp -r "${EXT_SRC}" "${EXT_DEST}"

    if command -v glib-compile-schemas &>/dev/null && [[ -d "${EXT_DEST}/schemas" ]]; then
      glib-compile-schemas "${EXT_DEST}/schemas"
    fi

    log_success "Extension installed to ${EXT_DEST}"
    gnome-extensions enable "liquid-glass@thinkingcoding1231.gmail.com" 2>/dev/null || true
  fi
fi

# 6. Apply desktop preferences via GSettings
USER_THEME_UUID="user-theme@gnome-shell-extensions.gcampax.github.com"
if gnome-extensions list 2>/dev/null | grep -q "${USER_THEME_UUID}"; then
  gnome-extensions enable "${USER_THEME_UUID}" 2>/dev/null || true
fi

gsettings set org.gnome.shell.extensions.user-theme name "${THEME_NAME}" 2>/dev/null || true
gsettings set org.gnome.desktop.interface gtk-theme "${THEME_NAME}" 2>/dev/null || true

if [[ "${COLOR}" == "Dark" ]]; then
  gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark' 2>/dev/null || true
else
  gsettings set org.gnome.desktop.interface color-scheme 'prefer-light' 2>/dev/null || true
fi

# Lock stable menu dimensions in extension
LG_SCHEMA="org.gnome.shell.extensions.liquid-glass@thinkingcoding1231.gmail.com"
LG_SCHEMADIR="${HOME}/.local/share/gnome-shell/extensions/liquid-glass@thinkingcoding1231.gmail.com/schemas"
if [[ -d "${LG_SCHEMADIR}" ]]; then
  gsettings --schemadir "${LG_SCHEMADIR}" set "${LG_SCHEMA}" enable-quick-settings-animation false 2>/dev/null || true
fi

# 7. Write Installation Manifest
MANIFEST="${DEST}/.fluid_glass_manifest.json"
cat > "${MANIFEST}" <<EOF
{
  "theme_name": "${THEME_NAME}",
  "version": "2.0.0-alpha.1",
  "installed_variant": "${COLOR}",
  "style": "${STYLE}",
  "installed_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "installed_paths": [
    "${DEST}/Fluid-Glass-Dark",
    "${DEST}/Fluid-Glass-Light"
  ]
}
EOF

log_success "Desktop settings updated to ${THEME_NAME}"

echo ""
echo -e "${GREEN}═════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  🎉  Fluid Glass 2.0 installed and applied successfully!${NC}"
echo -e "${GREEN}═════════════════════════════════════════════════════════════════════${NC}"
echo -e "  • GNOME Shell Theme : ${BOLD}${THEME_NAME}${NC}"
echo -e "  • GTK Theme         : ${BOLD}${THEME_NAME}${NC}"
echo -e "  • Manifest          : ${MANIFEST}"
echo -e ""
echo -e "  To uninstall anytime: ${BOLD}./install.sh --uninstall${NC}"
echo ""

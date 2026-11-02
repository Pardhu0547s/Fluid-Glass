#!/usr/bin/env bash
#
# Fluid Glass for Linux Install Script
#
# Installs the Fluid Glass GNOME Shell & GTK themes, with full macOS
# measurements and Fluid Glass shader-inspired material aesthetics.
#
# Usage: ./install.sh [OPTIONS]
#   -c, --color [dark|light]        Theme color variant (default: dark)
#   -s, --style [clear|normal|frosted] Glass strength (default: normal)
#   -d, --dest DIR                  Destination directory (default: ~/.themes)
#   -l, --libadwaita                Install GTK4 theme for libadwaita apps (default: enabled)
#       --no-libadwaita             Do not configure ~/.config/gtk-4.0
#       --mac27, --hd               macOS 27" Desktop proportions (default)
#       --laptop                    Install compact laptop sizing
#   -e, --with-extension            Install and enable the Liquid Glass GNOME extension
#   -r, --remove                    Uninstall Fluid-Glass themes
#   -h, --help                      Show this help message
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="${REPO_DIR}/dist"
EXT_DIR="${REPO_DIR}/extension/liquid-glass@thinkingcoding1231.gmail.com"

DEST="${HOME}/.themes"
COLOR="Dark"
STYLE="normal"
HD="true"
LIBADWAITA="true"
WITH_EXT="false"
REMOVE="false"

# Colors
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

usage() { sed -n '3,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--color)
      case "${2,,}" in
        dark)  COLOR="Dark" ;;
        light) COLOR="Light" ;;
        *) log_err "Unknown color '$2'. Use 'dark' or 'light'."; exit 1 ;;
      esac; shift 2 ;;
    -s|--style)
      case "${2,,}" in
        clear|normal|frosted) STYLE="$2" ;;
        *) log_err "Unknown style '$2'. Use 'clear', 'normal', or 'frosted'."; exit 1 ;;
      esac; shift 2 ;;
    -d|--dest) DEST="$2"; shift 2 ;;
    -l|--libadwaita) LIBADWAITA="true"; shift ;;
    --no-libadwaita) LIBADWAITA="false"; shift ;;
    --mac27|--hd) HD="true"; shift ;;
    --laptop)     HD="false"; shift ;;
    -e|--with-extension) WITH_EXT="true"; shift ;;
    -r|--remove) REMOVE="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) log_err "Unknown option '$1'"; usage; exit 1 ;;
  esac
done

THEME_NAME="Fluid-Glass-${COLOR}"

# =============================================================================
# Uninstall Logic
# =============================================================================
if [[ "${REMOVE}" == "true" ]]; then
  echo -e "\n${BOLD}Uninstalling Fluid-Glass...${NC}\n"

  # Reset gsettings if currently set to Fluid-Glass or Liquid-Tahoe
  current_gtk="$(gsettings get org.gnome.desktop.interface gtk-theme 2>/dev/null || echo '')"
  current_shell="$(gsettings get org.gnome.shell.extensions.user-theme name 2>/dev/null || echo '')"

  if [[ "${current_gtk}" =~ "Fluid-Glass" || "${current_gtk}" =~ "Liquid-Tahoe" ]]; then
    log_info "Resetting GTK theme to 'Adwaita'..."
    gsettings set org.gnome.desktop.interface gtk-theme 'Adwaita'
  fi
  if [[ "${current_shell}" =~ "Fluid-Glass" || "${current_shell}" =~ "Liquid-Tahoe" ]]; then
    log_info "Resetting Shell user-theme..."
    gsettings reset org.gnome.shell.extensions.user-theme name 2>/dev/null || true
  fi

  # Remove installed themes
  for c in Dark Light; do
    for name in Fluid-Glass Liquid-Tahoe; do
      t="${DEST}/${name}-${c}"
      if [[ -d "${t}" ]]; then
        log_info "Removing ${t}..."
        rm -rf "${t}"
      fi
    done
  done

  # Restore ~/.config/gtk-4.0
  GTK4_USER="${HOME}/.config/gtk-4.0"
  if [[ -f "${GTK4_USER}/gtk.css" ]]; then
    latest_backup="$(ls -td "${GTK4_USER}"/gtk.css.backup.* 2>/dev/null | head -1 || true)"
    if [[ -n "${latest_backup}" ]]; then
      log_info "Restoring GTK4 config from ${latest_backup}..."
      mv "${latest_backup}" "${GTK4_USER}/gtk.css"
    else
      log_info "Removing GTK4 theme overrides..."
      rm -f "${GTK4_USER}/gtk.css" "${GTK4_USER}/gtk-dark.css" "${GTK4_USER}/gtk-light.css"
      rm -rf "${GTK4_USER}/assets" "${GTK4_USER}/windows-assets"
    fi
  fi

  # Disable extension if installed
  if gnome-extensions list 2>/dev/null | grep -q "liquid-glass@thinkingcoding1231.gmail.com"; then
    log_info "Disabling liquid-glass extension..."
    gnome-extensions disable "liquid-glass@thinkingcoding1231.gmail.com" 2>/dev/null || true
  fi

  log_success "Fluid-Glass has been uninstalled."
  exit 0
fi

# =============================================================================
# Build Check
# =============================================================================
echo -e "\n${BOLD}Fluid Glass for Linux Theme Installer${NC}"
echo -e "Variant: ${COLOR} | Style: ${STYLE} | Destination: ${DEST}\n"

# Recompile theme assets with requested style and proportion setting
hd_flag="--hd"
[[ "${HD}" == "false" ]] && hd_flag="--laptop"
log_info "Building theme assets (style '${STYLE}', proportions: ${hd_flag})..."
"${REPO_DIR}/build.sh" -c all -s "${STYLE}" "${hd_flag}" -o "${DIST_DIR}"

# =============================================================================
# Install Themes to ~/.themes
# =============================================================================
mkdir -p "${DEST}"

for c in Dark Light; do
  T_SRC="${DIST_DIR}/Fluid-Glass-${c}"
  T_DST="${DEST}/Fluid-Glass-${c}"

  if [[ ! -d "${T_SRC}" ]]; then
    log_err "Missing build artifact: ${T_SRC}"
    exit 1
  fi

  if [[ -d "${T_DST}" ]]; then
    log_info "Updating existing theme at ${T_DST}..."
    rm -rf "${T_DST}"
  else
    log_info "Installing ${T_DST}..."
  fi

  cp -r "${T_SRC}" "${T_DST}"
  log_success "Installed Fluid-Glass-${c}"
done

# =============================================================================
# Configure GTK4 / Libadwaita
# =============================================================================
if [[ "${LIBADWAITA}" == "true" ]]; then
  GTK4_CONF="${HOME}/.config/gtk-4.0"
  mkdir -p "${GTK4_CONF}"

  # Backup existing gtk.css if not already backed up
  if [[ -f "${GTK4_CONF}/gtk.css" && ! -L "${GTK4_CONF}/gtk.css" ]]; then
    backup_file="${GTK4_CONF}/gtk.css.backup.$(date +%Y%m%d_%H%M%S)"
    log_info "Backing up existing gtk-4.0/gtk.css to $(basename "${backup_file}")"
    cp "${GTK4_CONF}/gtk.css" "${backup_file}"
  fi

  T_ADW="${DEST}/${THEME_NAME}/gtk-4.0"
  cp -f "${T_ADW}/gtk.css"        "${GTK4_CONF}/gtk.css"
  cp -f "${T_ADW}/gtk-dark.css"   "${GTK4_CONF}/gtk-dark.css"
  cp -f "${T_ADW}/gtk-light.css"  "${GTK4_CONF}/gtk-light.css"
  rm -rf "${GTK4_CONF}/assets" "${GTK4_CONF}/windows-assets"
  cp -r "${T_ADW}/assets"         "${GTK4_CONF}/"
  cp -r "${T_ADW}/windows-assets" "${GTK4_CONF}/"
  log_success "Configured GTK4/libadwaita in ${GTK4_CONF}"
fi

# =============================================================================
# Optional Liquid Glass Extension
# =============================================================================
if [[ "${WITH_EXT}" == "true" ]]; then
  EXT_DEST="${HOME}/.local/share/gnome-shell/extensions/liquid-glass@thinkingcoding1231.gmail.com"
  if [[ -d "${EXT_DIR}" ]]; then
    log_info "Installing Liquid Glass GNOME Shell extension..."
    mkdir -p "$(dirname "${EXT_DEST}")"
    rm -rf "${EXT_DEST}"
    cp -r "${EXT_DIR}" "${EXT_DEST}"

    # Compile schemas
    if command -v glib-compile-schemas &>/dev/null && [[ -d "${EXT_DEST}/schemas" ]]; then
      glib-compile-schemas "${EXT_DEST}/schemas"
    fi

    log_success "Liquid Glass extension installed to ${EXT_DEST}"
    log_info "Enabling extension..."
    gnome-extensions enable "liquid-glass@thinkingcoding1231.gmail.com" 2>/dev/null || {
      log_warn "Extension will activate upon next shell restart or log in."
    }
  else
    log_warn "Extension source not found at ${EXT_DIR}. Skipping extension install."
  fi
fi

# =============================================================================
# Apply Themes via GSettings
# =============================================================================
log_info "Applying GNOME desktop theme settings..."

# Enable user-theme extension if available
USER_THEME_UUID="user-theme@gnome-shell-extensions.gcampax.github.com"
if gnome-extensions list 2>/dev/null | grep -q "${USER_THEME_UUID}"; then
  gnome-extensions enable "${USER_THEME_UUID}" 2>/dev/null || true
fi

# Set Shell Theme
gsettings set org.gnome.shell.extensions.user-theme name "${THEME_NAME}" 2>/dev/null || {
  log_warn "Could not set user-theme name automatically. Check 'User Themes' extension."
}

# Set GTK Theme
gsettings set org.gnome.desktop.interface gtk-theme "${THEME_NAME}" 2>/dev/null || true

# Set Color Scheme
if [[ "${COLOR}" == "Dark" ]]; then
  gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark' 2>/dev/null || true
else
  gsettings set org.gnome.desktop.interface color-scheme 'prefer-light' 2>/dev/null || true
fi

log_success "Desktop settings updated to ${THEME_NAME}"

echo ""
echo -e "${GREEN}═════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  🎉  Fluid Glass for Linux installed and applied successfully!${NC}"
echo -e "${GREEN}═════════════════════════════════════════════════════════════════════${NC}"
echo -e "  • GNOME Shell Theme : ${BOLD}${THEME_NAME}${NC}"
echo -e "  • GTK Theme         : ${BOLD}${THEME_NAME}${NC}"
echo -e "  • Geometry          : macOS 27\" Desktop Proportions"
echo -e "  • Material          : Fluid Glass shader-inspired rim light & tints"
echo -e ""
echo -e "  To uninstall anytime: ${BOLD}./install.sh -r${NC}"
echo ""

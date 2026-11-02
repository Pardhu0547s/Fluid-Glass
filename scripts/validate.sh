#!/usr/bin/env bash
# =============================================================================
# Fluid Glass 2.0 Validation Script
# Verifies build artifacts, SCSS tokens, St CSS engine compliance, and manifests
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'
PASS=0
FAIL=0

check() {
  local desc="$1"; shift
  if "$@"; then
    echo -e "${GREEN}[PASS]${NC} ${desc}"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}[FAIL]${NC} ${desc}"
    FAIL=$((FAIL + 1))
  fi
}

echo "====================================================================="
echo "  Running Fluid Glass 2.0 Pre-flight Checks..."
echo "====================================================================="

# 1. Check executables
check "Root build.sh is executable" test -x "${ROOT_DIR}/build.sh"
check "Root install.sh is executable" test -x "${ROOT_DIR}/install.sh"
check "scripts/build.sh is executable" test -x "${ROOT_DIR}/scripts/build.sh"
check "installer/install.sh is executable" test -x "${ROOT_DIR}/installer/install.sh"
check "installer/uninstall.sh is executable" test -x "${ROOT_DIR}/installer/uninstall.sh"
check "installer/backup.sh is executable" test -x "${ROOT_DIR}/installer/backup.sh"
check "installer/restore.sh is executable" test -x "${ROOT_DIR}/installer/restore.sh"

# 2. Check tokens existence
check "Core tokens index exists" test -f "${ROOT_DIR}/src/core/index.scss"
check "Color tokens exist" test -f "${ROOT_DIR}/src/core/tokens/_colors.scss"
check "Opacity tokens exist" test -f "${ROOT_DIR}/src/core/tokens/_opacity.scss"
check "Geometry tokens exist" test -f "${ROOT_DIR}/src/core/tokens/_geometry.scss"
check "Elevation tokens exist" test -f "${ROOT_DIR}/src/core/tokens/_elevation.scss"

# 3. Check distribution artifacts
check "Dark theme output exists" test -d "${DIST_DIR}/Fluid-Glass-Dark"
check "Light theme output exists" test -d "${DIST_DIR}/Fluid-Glass-Light"
check "Build manifest exists" test -f "${DIST_DIR}/manifest.json"

# 4. Check St CSS engine compliance (single-shadow only, no comma-separated box-shadows)
check_st_shadows() {
  local errors=0
  for v in Dark Light; do
    css="${DIST_DIR}/Fluid-Glass-${v}/gnome-shell/gnome-shell.css"
    if [[ -f "${css}" ]]; then
      # Strip functional notations: rgba(...), rgb(...), st-lighten(...), st-darken(...), st-transparentize(...)
      if grep -n "box-shadow:" "${css}" | sed -E 's/(rgba|rgb|st-[a-z-]+)\([^)]*\)//g' | grep -q ","; then
        echo "Error: Multi-shadow syntax found in ${css}"
        errors=$((errors + 1))
      fi
    fi
  done
  return ${errors}
}
check "St CSS single-shadow compliance" check_st_shadows

# 5. Check manifest valid JSON
if command -v python3 &>/dev/null; then
  check "Manifest JSON validity" python3 -m json.tool "${DIST_DIR}/manifest.json" >/dev/null
fi

echo "====================================================================="
echo -e "Results: ${GREEN}${PASS} Passed${NC}, ${RED}${FAIL} Failed${NC}"
echo "====================================================================="
[[ ${FAIL} -eq 0 ]] || exit 1

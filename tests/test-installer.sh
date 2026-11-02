#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/home/.themes/Fluid-Glass-Dark"
printf 'pre-existing theme data\n' > "$TMP/home/.themes/Fluid-Glass-Dark/custom.css"

cat > "$TMP/bin/gnome-shell" <<'MOCK'
#!/usr/bin/env bash
echo 'GNOME Shell 50.0'
MOCK
cat > "$TMP/bin/gnome-extensions" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK
cat > "$TMP/bin/glib-compile-schemas" <<'MOCK'
#!/usr/bin/env bash
[[ "${1:-}" == --strict ]] && shift
: > "$1/gschemas.compiled"
MOCK
cat > "$TMP/bin/gsettings" <<'MOCK'
#!/usr/bin/env bash
case "$1" in
  writable) echo true ;;
  get)
    if [[ -f "$FG_TEST_GSETTINGS" ]]; then cat "$FG_TEST_GSETTINGS"; else echo "'Adwaita'"; fi
    ;;
  set) printf "'%s'\n" "$4" > "$FG_TEST_GSETTINGS" ;;
  *) exit 0 ;;
esac
MOCK
chmod +x "$TMP/bin/"*
export HOME="$TMP/home"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_STATE_HOME="$HOME/.local/state"
export FG_TEST_GSETTINGS="$TMP/gtk-theme"
export PATH="$TMP/bin:$PATH"

cd "$ROOT"
./install.sh --variant dark >/dev/null
[[ -f "$HOME/.themes/Fluid-Glass-Dark/gtk-3.0/gtk.css" ]]
[[ -f "$HOME/.themes/Fluid-Glass-Dark/gtk-4.0/gtk.css" ]]
[[ -f "$XDG_DATA_HOME/gnome-shell/extensions/fluid-glass@fluidglass.dev/schemas/gschemas.compiled" ]]
./install.sh --variant light >/dev/null
[[ -f "$HOME/.themes/Fluid-Glass-Light/gtk-3.0/gtk.css" ]]
[[ -f "$HOME/.themes/Fluid-Glass-Light/gtk-4.0/gtk.css" ]]
[[ ! -d "$HOME/.themes/Fluid-Glass-Dark" ]]
./uninstall.sh >/dev/null
[[ -f "$HOME/.themes/Fluid-Glass-Dark/custom.css" ]]
[[ ! -d "$HOME/.themes/Fluid-Glass-Light" ]]
[[ ! -d "$XDG_DATA_HOME/gnome-shell/extensions/fluid-glass@fluidglass.dev" ]]
[[ "$(<"$FG_TEST_GSETTINGS")" == "'Adwaita'" ]]
# An existing extension not marked as Fluid Glass must never be overwritten.
mkdir -p "$XDG_DATA_HOME/gnome-shell/extensions/fluid-glass@fluidglass.dev"
printf 'keep user extension data\n' > "$XDG_DATA_HOME/gnome-shell/extensions/fluid-glass@fluidglass.dev/user-file.txt"
if ./install.sh --extension-only --dry-run >"$TMP/collision-dry-run.log" 2>&1; then
    echo 'Expected dry-run to flag an unowned extension directory.' >&2
    exit 1
fi
if ./install.sh --extension-only >"$TMP/collision.log" 2>&1; then
    echo 'Expected installer to refuse an unowned extension directory.' >&2
    exit 1
fi
[[ "$(<"$XDG_DATA_HOME/gnome-shell/extensions/fluid-glass@fluidglass.dev/user-file.txt")" == 'keep user extension data' ]]

echo 'Installer mock test passed: theme install, variant switch, schema compile, restoration and unowned-extension protection.'

#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

python3 "$ROOT/scripts/generate-tokens.py"

for script in "$ROOT/build.sh" "$ROOT/install.sh" "$ROOT/uninstall.sh" \
              "$ROOT/scripts/build.sh" "$ROOT/installer/install.sh" "$ROOT/installer/uninstall.sh" "$ROOT/tests/test-installer.sh"; do
    bash -n "$script"
done

python3 "$ROOT/tests/test-css-syntax.py"
python3 "$ROOT/tests/test-quick-settings.py"

python3 - "$ROOT" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
metadata = json.loads((root / 'src/gnome-shell/metadata.json').read_text())
assert metadata['uuid'] == 'fluid-glass@fluidglass.dev'
assert metadata['shell-version'] == ['50']
for path in [
    root / 'src/gnome-shell/extension.js',
    root / 'docs/design-reference/quick-settings-reference.png',
    root / 'src/gnome-shell/stylesheet.css',
    root / 'src/gtk3/dark/gtk-3.0/gtk.css',
    root / 'src/gtk3/light/gtk-3.0/gtk.css',
    root / 'src/gtk4/dark/gtk-4.0/gtk.css',
    root / 'src/gtk4/light/gtk-4.0/gtk.css',
    root / 'src/gnome-shell/prefs.js',
    root / 'src/gnome-shell/schemas/org.gnome.shell.extensions.fluid-glass.gschema.xml',
    root / 'src/engine/shaders/glass.frag',
    root / 'src/design/tokens.json',
]:
    assert path.is_file() and path.stat().st_size > 100, path
tokens = json.loads((root / 'src/design/tokens.json').read_text())
assert set(tokens) == {'dark', 'light'}
assert set(tokens['dark']) == set(tokens['light'])

# Ensure all @color references in source stylesheets exist in their generated token files.
import re
for variant in ('dark', 'light'):
    for platform, version in (('gtk3', '3.0'), ('gtk4', '4.0')):
        base = root / f'src/{platform}/{variant}/gtk-{version}'
        defined = set(re.findall(r'@define-color\s+([a-zA-Z0-9_-]+)', (base / 'tokens.css').read_text()))
        css = (base / 'gtk.css').read_text()
        refs = set(re.findall(r'(?<![\w-])@([a-zA-Z_][a-zA-Z0-9_-]*)', css)) - {'import'}
        assert refs <= defined, f'{platform}/{variant}: undefined tokens {sorted(refs-defined)}'
shell_tokens = set(re.findall(r'@define-color\s+([a-zA-Z0-9_-]+)', (root/'src/gnome-shell/tokens.css').read_text()))
shell_css = (root/'src/gnome-shell/stylesheet.css').read_text()
shell_refs = set(re.findall(r'(?<![\w-])@([a-zA-Z_][a-zA-Z0-9_-]*)', shell_css)) - {'import'}
assert shell_refs <= shell_tokens, f'GNOME Shell: undefined tokens {sorted(shell_refs-shell_tokens)}'
print('Static file, design-token, CSS token-reference, and metadata checks passed.')
PY

if command -v node >/dev/null 2>&1; then
    node --input-type=module --check < "$ROOT/src/gnome-shell/extension.js"
    node --input-type=module --check < "$ROOT/src/gnome-shell/prefs.js"
    echo 'GNOME extension and preferences JavaScript syntax checks passed with Node.'
elif command -v gjs >/dev/null 2>&1; then
    echo 'NOTE: node is not installed; skipping JS syntax check.'
else
    echo 'NOTE: neither gjs nor node is installed; JavaScript syntax check skipped.'
fi
if command -v glslangValidator >/dev/null 2>&1; then
    glslangValidator -S frag "$ROOT/src/engine/shaders/glass.frag"
else
    echo 'NOTE: glslangValidator is not installed here; GLSL compiler check skipped.'
fi

python3 - "$ROOT/src/gnome-shell/schemas/org.gnome.shell.extensions.fluid-glass.gschema.xml" <<'PYSCHEMA'
import sys, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
schema = root.find('schema')
assert schema is not None and schema.get('id') == 'org.gnome.shell.extensions.fluid-glass'
keys = {key.get('name'): key.get('type') for key in schema.findall('key')}
assert keys == {'blur-enabled': 'b', 'panel-blur': 'b', 'quick-settings-blur': 'b', 'calendar-blur': 'b', 'popup-blur': 'b', 'screenshot-button': 'b', 'blur-radius': 'i', 'brightness': 'd'}
by_name = {key.get('name'): key for key in schema.findall('key')}
assert by_name['brightness'].find('range').attrib == {'min': '0.5', 'max': '1.0'}
assert by_name['popup-blur'].findtext('default') == 'false'
assert by_name['quick-settings-blur'].findtext('default') == 'true'
assert by_name['calendar-blur'].findtext('default') == 'false'
assert by_name['screenshot-button'].findtext('default') == 'true'
assert by_name['blur-radius'].find('range').attrib == {'min': '4', 'max': '32'}
print('GSettings schema XML is well-formed and has the expected keys and ranges.')
PYSCHEMA
if command -v node >/dev/null 2>&1; then
    node --check "$ROOT/tests/test-extension-lifecycle.mjs"
    node "$ROOT/tests/test-extension-lifecycle.mjs"
else
    echo 'NOTE: Node is unavailable; mocked Shell extension lifecycle test skipped.'
fi
echo 'Shell script syntax checks passed.'

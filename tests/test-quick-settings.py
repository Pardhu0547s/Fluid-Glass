from pathlib import Path

root = Path(__file__).resolve().parents[1]
css = (root / 'src/gnome-shell/stylesheet.css').read_text()
extension = (root / 'src/gnome-shell/extension.js').read_text()
prefs = (root / 'src/gnome-shell/prefs.js').read_text()
reference = root / 'docs/design-reference/quick-settings-reference.png'

required_css = [
    '.quick-settings-grid',
    '.quick-toggle-arrow-button',
    '.quick-slider',
    '.quick-settings-system-item',
    '.quick-toggle-menu',
]
for selector in required_css:
    assert selector in css, f'Missing Quick Settings selector: {selector}'

required_runtime = [
    'QuickSettings.QuickSettingsItem',
    'Main.screenshotUI',
    "get_boolean('quick-settings-blur')",
    "get_boolean('calendar-blur')",
]
for expression in required_runtime:
    assert expression in extension, f'Missing Quick Settings behavior: {expression}'

for key in ('quick-settings-blur', 'calendar-blur', 'screenshot-button'):
    assert key in prefs, f'Missing preferences row: {key}'

# Alpha 5 regression checks: avoid the previous near-opaque material and narrow clipped pills.
import json
tokens = json.loads((root / 'src/design/tokens.json').read_text())
assert '0.40' in tokens['dark']['popover_surface'], 'Dark popup must remain translucent'
assert '0.40' in tokens['light']['popover_surface'], 'Light popup must remain translucent'
assert 'rgba(58, 62, 72, 0.85)' not in css, 'Opaque charcoal tile fill regressed'
assert 'min-width: 96px !important' not in css, 'Fixed 96px tile sizing regressed'
assert 'margin-left: 36px !important' not in css, 'Margin-based grid sizing regressed'
assert '12.5em' in css, 'Responsive wide tile sizing is missing'
assert 'Alpha 5' in css, 'Alpha 5 material layer is missing'
assert reference.is_file() and reference.stat().st_size > 100_000, 'Supplied design reference missing or incomplete'
print('Quick Settings implementation check passed: native controls, glass selectors, preferences and reference image.')

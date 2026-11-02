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

assert reference.is_file() and reference.stat().st_size > 100_000, 'Supplied design reference missing or incomplete'
print('Quick Settings implementation check passed: native controls, glass selectors, preferences and reference image.')

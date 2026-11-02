#!/usr/bin/env python3
"""Generate GTK3, GTK4 and GNOME Shell colors from one JSON palette."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'src/design/tokens.json').read_text(encoding='utf-8'))
required=set(data['dark']) if set(data)=={'dark','light'} else set()
if not required or set(data['light']) != required:
    raise SystemExit("dark and light token keys must match")
for variant in ('dark','light'):
    lines=['/* Generated from src/design/tokens.json; do not edit. */']
    for key in sorted(required):
        value=data[variant][key]
        if not isinstance(value,str) or not value.strip(): raise SystemExit(f'Invalid {variant}.{key}')
        lines.append(f'@define-color {key} {value};')
    css='\n'.join(lines)+'\n'
    (ROOT/f'src/gtk3/{variant}/gtk-3.0/tokens.css').write_text(css)
    (ROOT/f'src/gtk4/{variant}/gtk-4.0/tokens.css').write_text(css)
shell=['/* Generated from src/design/tokens.json; do not edit. */']
for variant in ('dark','light'):
    for key in sorted(required): shell.append(f'@define-color fluid_glass_{variant}_{key} {data[variant][key]};')
(ROOT/'src/gnome-shell/tokens.css').write_text('\n'.join(shell)+'\n')
print('Generated GTK3, GTK4 and GNOME Shell tokens.')

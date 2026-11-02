#!/usr/bin/env python3
"""Best-effort CSS syntax validation; uses tinycss2 when installed."""
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
FILES = sorted(ROOT.glob('src/gtk3/*/gtk-3.0/*.css')) + sorted(ROOT.glob('src/gtk4/*/gtk-4.0/*.css')) + [ROOT/'src/gnome-shell/stylesheet.css', ROOT/'src/gnome-shell/tokens.css']

try:
    import tinycss2
except ImportError:
    tinycss2 = None

errors = []
for path in FILES:
    text = path.read_text(encoding='utf-8')
    if tinycss2:
        nodes = tinycss2.parse_stylesheet(text, skip_whitespace=True, skip_comments=True)
        for node in nodes:
            if node.type == 'error':
                errors.append(f'{path.relative_to(ROOT)}:{node.source_line}:{node.source_column}: {node.message}')
    else:
        # Minimal lexical fallback: balanced braces and parentheses after stripping comments/strings.
        import re
        lexical = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
        lexical = re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', '""', lexical)
        for opening, closing in (('{', '}'), ('(', ')')):
            depth = 0
            for char in lexical:
                if char == opening:
                    depth += 1
                elif char == closing:
                    depth -= 1
                if depth < 0:
                    errors.append(f'{path.relative_to(ROOT)}: unexpected {closing}')
                    break
            if depth != 0:
                errors.append(f'{path.relative_to(ROOT)}: unbalanced {opening}{closing}')

if errors:
    print('\n'.join(errors), file=sys.stderr)
    raise SystemExit(1)
mode = 'tinycss2 parse' if tinycss2 else 'balanced-delimiter fallback'
print(f'CSS syntax check passed ({mode}) for {len(FILES)} stylesheets.')

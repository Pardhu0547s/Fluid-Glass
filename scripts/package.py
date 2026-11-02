#!/usr/bin/env python3
"""Validate and archive a built GNOME Shell extension."""
import json, pathlib, sys, zipfile
root=pathlib.Path(sys.argv[1]); ext=root/'extension'
meta=json.loads((ext/'metadata.json').read_text())
assert meta['uuid']=='fluid-glass@fluidglass.dev' and meta['shell-version']==['50']
for rel in ('extension.js','prefs.js','stylesheet.css','tokens.css','schemas/org.gnome.shell.extensions.fluid-glass.gschema.xml'):
    assert (ext/rel).is_file(), rel
for name in ('Fluid-Glass-Dark','Fluid-Glass-Light'):
    assert (root/'themes'/name/'gtk-3.0/gtk.css').is_file()
    assert (root/'themes'/name/'gtk-4.0/gtk.css').is_file()
    assert (root/'themes'/name/'gnome-shell/gnome-shell.css').is_file()
archive=root/'fluid-glass@fluidglass.dev.shell-extension.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(ext.rglob('*')):
        if p.is_file(): z.write(p,p.relative_to(ext).as_posix())
with zipfile.ZipFile(archive) as z:
    names=z.namelist()
    assert {'metadata.json','extension.js','prefs.js','schemas/org.gnome.shell.extensions.fluid-glass.gschema.xml'} <= set(names)
print(f'Validated extension archive: {archive}')

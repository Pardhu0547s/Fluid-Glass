# GTK4 styling

Fluid Glass ships original `gtk-4.0/gtk.css` styles in its dark and light theme variants. GTK4 applications that honor the selected GTK theme may use these styles when the selected GTK theme is `Fluid-Glass-Dark` or `Fluid-Glass-Light`.

**Libadwaita limitation:** Libadwaita applications intentionally control much of their own appearance and do not provide a supported global third-party theme switch. These styles do not promise to restyle every Libadwaita application. Fluid Glass never overwrites `~/.config/gtk-4.0/gtk.css` or injects CSS into apps.

The same `src/design/tokens.json` palette generates GTK3, GTK4 and GNOME Shell colors. GTK4 uses GTK's `@define-color` syntax for broad compatibility; browser-only features such as `backdrop-filter` are not used.

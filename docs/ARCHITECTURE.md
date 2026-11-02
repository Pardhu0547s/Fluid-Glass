# Architecture — Fluid Glass 2.0

## Ownership

Fluid Glass owns its palette, GTK3/GTK4 CSS, Shell stylesheet, extension, preferences schema, build scripts and user-level installer. GNOME Shell, Mutter, GTK, GJS and Libadwaita remain platform components; they are not forked or vendored.

## Token pipeline

`src/design/tokens.json` is the single editable color source. `scripts/generate-tokens.py` emits GTK3/GTK4 `@define-color` files and namespaced Shell definitions. Stylesheets consume generated tokens.

## Runtime layers

1. GTK3 theme: original widget styles; no compositor capture.
2. GTK4 theme: original GTK4 styles for applications that honor the GTK theme. Libadwaita apps may retain Adwaita styling.
3. GNOME Shell extension: styles panel, Quick Settings, calendar, notifications, OSD and overview. Native `Shell.BlurEffect` attaches to the top panel and Quick Settings by default; calendar popup blur is separately opt-in. The Quick Settings grid and native controls are restyled without replacing network, Bluetooth, audio, display or power services. The blur radius follows the Shell stage scale factor.
4. Preferences: local GSettings schema controls blur enablement, targets, radius and brightness.
5. Installer: per-user marker-based install with theme selection backup/restore.

## Rendering constraints

Native GNOME blur samples pixels behind a Shell actor. It is distinct from the standalone GLSL prototype, which requires a compositor-provided backdrop texture, mapping, alpha contract, scaling and frame-time tests. The shader is not loaded into GNOME Shell. The Shell extension uses native backdrop blur plus layered tint/rim styling; optical refraction is a separate renderer milestone.

## Platform constraints

- Initial target: Fedora Workstation 44 / GNOME Shell 50.
- Metadata declares GNOME 50 only until other Shell majors are tested.
- GTK CSS and Shell actor internals can change across releases; runtime validation is mandatory.
- Fluid Glass never overwrites `~/.config/gtk-4.0/gtk.css`.

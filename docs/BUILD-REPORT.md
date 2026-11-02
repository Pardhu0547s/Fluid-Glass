# Build report — Fluid Glass 2.0 Alpha 4

## Included
- Token-driven GTK3/GTK4 dark/light styles.
- GNOME Shell tokens and CSS for panel, quick settings, calendar, notifications, OSD and overview.
- Extension preferences backed by a compiled GSettings schema.
- Scale-aware native `Shell.BlurEffect` on the panel and opt-in popup actors when available.
- Explicit dark/light Shell surface styling for panel, popups, Quick Settings, calendar, notifications, OSD and overview.
- Native Quick Settings two-column glass capsules, arrow segments, glass slider tracks and circular action controls.
- Native screenshot action with guarded `Main.screenshotUI.open()` invocation.
- Independently configurable Quick Settings and calendar blur; Quick Settings blur defaults on.
- Supplied Quick Settings visual reference included under `docs/design-reference/`.
- Expanded GTK3/GTK4 widget styling and type-safe extension preferences.
- User-local installer/package.

- Added Node-based lifecycle mocks for effect setup, popup replacement cleanup, screenshot action click/cleanup and extension disable.
- Added installer regression coverage for refusing to overwrite unowned extensions, including dry-run detection.

## Not claimed
- Live optical refraction/dispersion in GNOME Shell; GLSL remains a standalone prototype.
- Universal restyling of Libadwaita applications.
- Runtime-tested GNOME Shell 50 behavior in this container.

## Required next validation
Run static validation/build, then complete `docs/TESTING.md` on Fedora Workstation 44 / GNOME 50. This container does not include GJS, GNOME Shell or `glib-compile-schemas`, so schema compilation and live Shell tests remain Fedora-side checks.

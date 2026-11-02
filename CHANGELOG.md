# Changelog

## 2.0.0-alpha.3 — 2026-11-02

- Expanded GTK3 and GTK4 styles across headerbars, toolbars, buttons, inputs, lists, menus, tabs, switches, scales, progress indicators, scrollbars, tooltips and focus states.
- Reworked GNOME Shell surfaces with explicit dark/light variants for panel, popups, Quick Settings, calendar, notifications, OSD and overview.
- Added scale-factor-aware Shell blur radius and safe popup actor cleanup when actors are refreshed.
- Added Shell API feature detection and a tint-only fallback when backdrop blur is unavailable.
- Replaced the incompatible integer-to-double GSettings slider binding with explicit typed setting updates.
- Capped blur brightness at 1.0 and made popup blur opt-in by default to control GPU cost.
- Made dry-run detect unowned extension directories before installation and expanded installer collision regression coverage.

## 2.0.0-alpha.2 — Phase 2–4 foundation

- Replaced scattered palette values with one `src/design/tokens.json` source.
- Generated token stylesheets for GTK3, GTK4 and GNOME Shell.
- Added original GTK4 dark and light theme CSS alongside GTK3.
- Added GNOME Shell styling for Quick Settings, calendar, notifications, OSD and overview surfaces.
- Expanded the independent GNOME Shell extension to attach native backdrop blur to the top panel and Quick Settings/calendar popup actors when available.
- Added extension preferences backed by a GSettings schema for blur enablement, blur targets, radius and brightness.
- Moved GSettings schema compilation into the per-user installer.
- Added a mocked install/upgrade/uninstall test that checks GTK3/GTK4 installation, extension schema compilation, variant switching and restoration of an existing theme.

### Known limitations

- The extension and preferences have only received JavaScript syntax checks here; a live Fedora 44/GNOME 50 session is still required.
- GTK4 theming does not force Libadwaita applications to use third-party styles.
- The GLSL refraction shader remains a prototype and is not integrated with Mutter/GNOME Shell.

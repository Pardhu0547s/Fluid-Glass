# Changelog

## Unreleased — Alpha 4.1 visual correction

- Reduced dark and light Quick Settings surface opacity so the native backdrop blur is visible rather than hidden behind near-opaque fills.
- Restored translucent dark/light glass surface tokens, brighter blue active states and stronger refractive-style edge highlights.
- Explicitly set active Quick Toggle label/icon contrast to white.
- Documented that Shell follows GNOME's system color-scheme preference; selecting a GTK installer variant alone does not force Shell Light/Dark mode.


## 2.0.0-alpha.4 — 2026-11-02

- Restyled GNOME's native Quick Settings surface as a rounded, two-column glass control center inspired by the supplied design reference.
- Reworked native Quick Toggles into wide glass capsules with distinct active, inactive, hover, focus and submenu-arrow states.
- Styled the volume and brightness Quick Sliders as full-width glass tracks with bright handles and active tracks.
- Restyled GNOME's built-in system action buttons as circular glass controls while preserving Settings, Lock and Power behavior.
- Added an optional native screenshot shortcut to the existing Quick Settings action row; it opens GNOME's screenshot UI when exposed by the Shell build.
- Enabled Quick Settings backdrop blur by default and separated it from optional calendar blur.
- Added preferences for Quick Settings blur, calendar blur and the screenshot shortcut.
- Included the supplied Quick Settings visual reference in `docs/design-reference/`.
- Expanded lifecycle tests for screenshot action insertion/removal, screenshot activation and independently configurable popup blur.

### Validation notes

- Static CSS/token checks, JavaScript syntax checks, GSettings XML checks and mocked extension lifecycle tests pass in the build environment.
- A live Fedora 44 / GNOME 50 Shell session and real compositor/GPU performance test are still required.
- The screenshot shortcut uses a guarded GNOME Shell internal entry point; when unavailable, the extension logs a fallback message and leaves the native Print-key shortcut intact.
- GTK4 theming does not force Libadwaita applications to use third-party styles.
- The GLSL refraction shader remains a prototype and is not integrated with Mutter/GNOME Shell.

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

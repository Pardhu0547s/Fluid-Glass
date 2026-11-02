# Fluid Glass 2.0 — Phase 2–4 implementation

## Phase 2: token-driven GTK3/GTK4 styles

- `src/design/tokens.json` is the single source for semantic colors.
- `scripts/generate-tokens.py` emits GTK3, GTK4 and GNOME Shell color definitions.
- GTK3 and GTK4 each ship independent dark and light stylesheets.
- GTK styles cover window surfaces, decorations, headerbars, toolbars, buttons, entries, spin buttons, text views, lists, sidebars, menus, popovers, notebook tabs (GTK3), switches, scales, progress bars, level bars, scrollbars, selection, tooltips and focus states.
- GTK4 apps may ignore custom theme CSS; Libadwaita remains app-controlled and is not force-patched.

## Phase 3: GNOME Shell glass interface

- `src/gnome-shell/stylesheet.css` styles the panel, popup menus, Quick Settings, calendar, notifications, OSD and overview/dash surfaces.
- Every major surface is explicitly scoped for dark and light mode using generated tokens.
- The extension applies variant classes to Shell UI actors based on `org.gnome.desktop.interface` color scheme.

## Phase 4: independent Shell extension and live blur

- The project owns its GNOME Shell extension, GSettings schema, preferences page and styles.
- It uses `Shell.BlurEffect` in background mode when the Shell API exposes it.
- Blur radius scales with the Shell stage scale factor.
- Top panel and Quick Settings blur are enabled by default; calendar blur remains independently opt-in.
- Alpha 4 restyles GNOME native Quick Toggles, Quick Sliders and system action controls as a two-column glass Control Center; it adds a guarded native screenshot action.
- Actor style classes and named effects are removed during refresh/disable to avoid stale Shell styling.
- Unsupported blur APIs fall back to the token-driven translucent CSS material.

## Optical rendering boundary

The live Shell blur samples pixels behind a Shell actor. It is not the same as optical refraction or chromatic dispersion. `src/engine/shaders/glass.frag` remains a standalone shader prototype. It is not injected into Mutter or GNOME Shell because a safe, supported backdrop-texture path and real-session performance validation are still required.

## Compatibility

The initial declared target remains Fedora Workstation 44 / GNOME Shell 50. Do not add other Shell majors until they are tested in real sessions.

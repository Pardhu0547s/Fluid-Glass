# Fluid Glass 2.0

**An independent, Fedora-first glass interface for GNOME.**

Status: **2.0.0-alpha.4**. This release adds a dedicated Quick Settings Control Center treatment based on the supplied visual reference, makes Quick Settings backdrop blur independently configurable, and adds a native GNOME screenshot shortcut to the system action row.

## Design goals

- Independent source tree and original styles; no MacTahoe or third-party Liquid Glass extension runtime dependency.
- Fedora Workstation 44 / GNOME Shell 50 as the first supported target.
- `src/design/tokens.json` generates GTK3, GTK4 and Shell color definitions.
- GNOME Shell styling for panel, Quick Settings, calendar, notifications, OSD and overview.
- Native Shell backdrop blur, configurable radius/brightness and CSS fallbacks.
- Reversible per-user installation; no `sudo` and no overwrite of `~/.config/gtk-4.0/gtk.css`.

## Alpha 4 status

| Area | Alpha 4 status |
|---|---|
| GTK3 dark/light | Token-driven widget styles; visual QA pending |
| GTK4 dark/light | Token-driven GTK4 styles; app support varies |
| Shared tokens | Generated from one JSON source |
| GNOME panel | Native backdrop blur + adaptive tint |
| Quick Settings | Two-column native grid restyled as wide glass capsules |
| Quick Settings sliders | Glass track and illuminated active slider styling |
| Quick Settings actions | Native screenshot shortcut; GNOME settings/lock/power actions retained |
| Quick Settings blur | Enabled by default; independently configurable |
| Calendar blur | Separate opt-in setting |
| Network/Bluetooth/power/night-light/DND | Uses GNOME's existing functional controls; no duplicate fake toggles |
| Notifications/OSD/overview | CSS surface styling; visual QA pending |
| Optical refraction/dispersion | GLSL prototype only; not integrated with GNOME |
| Fedora 44/GNOME 50 runtime QA | Pending on a real session |

## Design reference

The supplied Quick Settings concept is retained at [`docs/design-reference/quick-settings-reference.png`](docs/design-reference/quick-settings-reference.png). The implementation intentionally styles GNOME's native Quick Settings grid and controls rather than replacing system services with decorative buttons.

## Requirements

- Fedora Workstation 44 / GNOME Shell 50 for the complete Shell experience.
- `bash`, `python3`, `glib2` (`glib-compile-schemas`), `gsettings`, `gnome-shell` and `gnome-extensions`.
- GTK3 and GTK4 applications that honor the selected GTK theme. Libadwaita applications may keep their own styling.

## Build and install

```bash
./scripts/validate.sh
./build.sh
./install.sh --variant dark
```

Use `./install.sh --variant light` for light mode, `--gtk-only` to skip the Shell extension, or `--extension-only` for the extension alone. Quick Settings blur is enabled by default to match the supplied design; calendar blur remains opt-in because background blur can be expensive. The screenshot shortcut can be disabled in extension preferences. The installer compiles the extension GSettings schema on Fedora before activation. Open settings with:

```bash
gnome-extensions prefs fluid-glass@fluidglass.dev
```

Uninstall and restore the previous GTK theme selection with `./uninstall.sh`. All files are installed per-user; do not use `sudo`.

## Important GTK4 limitation

GTK4 theme CSS applies only to apps that honor the selected GTK theme. Libadwaita applications may retain Adwaita styling. Fluid Glass does not inject CSS into applications or overwrite the user's GTK4 config.

## Rendering truth

The extension uses GNOME Shell's native `Shell.BlurEffect` in background mode for supported Shell actors. GTK stylesheets do not sample the compositor or provide real window backdrop refraction. The standalone GLSL shader is a renderer prototype, not a live GNOME effect; it must not be described as integrated until the compositor texture path and performance are validated.

See [architecture](docs/ARCHITECTURE.md), [roadmap](docs/ROADMAP.md), [testing](docs/TESTING.md), [Quick Settings implementation](docs/QUICK-SETTINGS-DESIGN.md), [GTK4 notes](src/gtk4/README.md) and [build report](docs/BUILD-REPORT.md).

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

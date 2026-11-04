# Fluid Glass for Linux

A translucent "glass" GTK3 / GTK4 (libadwaita) and GNOME Shell theme. It pairs
macOS-style proportions (modeled on a 27" desktop at 2560×1440 logical pixels, 8 px grid)
with a glass material layer: translucent tints, a bright top rim highlight,
a faint perimeter edge, and soft ambient shadows.

> **How the glass works.** A stylesheet can only make surfaces translucent; it
> cannot blur what is behind them. For real blur and refraction, install the
> optional [Liquid Glass extension](https://github.com/ryohsuke1231/liquid-glass).
> Without it, the theme still works but panels are simply see-through, so the
> **Normal** or **Frosted** styles are the better choice.

## Requirements

| Needed for | Package |
|---|---|
| Shell theme | GNOME Shell 46–48 (newer versions work with small visual glitches), the **User Themes** extension |
| Building from source | `sassc` |
| Real blur (optional) | [Liquid Glass extension](https://github.com/ryohsuke1231/liquid-glass), installed separately |

## Install

```bash
git clone https://github.com/Pardhu0547s/Fluid-Glass.git
cd Fluid-Glass
./install.sh            # builds with sassc, installs to ~/.themes, applies the theme
```

Release tarballs ship prebuilt themes, so `sassc` is not needed there.

```
./install.sh [OPTIONS]
  -c, --color   dark|light              Variant for GTK4/libadwaita apps (default: follows system)
  -s, --style   clear|normal|frosted    Glass strength (default: normal)
  -d, --dest    DIR                     Install directory (default: ~/.themes)
      --laptop                          Compact laptop sizing
      --rebuild                         Rebuild even if ./dist exists
      --no-libadwaita                   Leave ~/.config/gtk-4.0 alone
      --no-apply                        Install only; do not change GNOME settings
  -e, --with-extension                  Enable the Liquid Glass extension if it is installed
  -r, --remove                          Uninstall and restore your original GTK4 files
```

What the installer does and does not do:

- It never writes into the repository and never downloads anything.
- Before touching `~/.config/gtk-4.0`, it saves your original files once to
  `~/.config/gtk-4.0/.fluid-glass-backup`. `--remove` restores exactly those.
- It does not change the color scheme unless you pass `--color`.
- It does not install or configure the Liquid Glass extension; `-e` only enables it.

## Build

```bash
./build.sh -c all -s normal            # output goes to ./dist (git-ignored)
./build.sh --shell-version 47          # target a specific GNOME Shell
./build.sh --stock -o /tmp/stock       # stock MacTahoe geometry, no glass (for diffing)
```

## Key dimensions

| Element | Size |
|---|---|
| Top bar | 32 px high, 16 px side margins |
| Header bar | 52 px high |
| Quick Settings / Control Center | 370 px wide, 20 px corner radius |
| Sidebar | 240 px wide (200 px with `--laptop`) |
| Window inner radius | 12 px |

## Project layout

```
build.sh  install.sh  COPYING  THIRD_PARTY_NOTICES.md
src/assets/             icons and window-button assets
src/main/               SCSS entry templates
src/sass/glass/         Fluid Glass material layer (_material, _shell, _gtk3, _gtk4)
src/sass/gtk, gnome-shell   MacTahoe-derived widget styles
```

## Known limitations

- The shell overlay relies heavily on `!important`, so a future GNOME release may need adjustments.
- Shell widget styles stop at GNOME 48; 49+ is untested.
- Style variants beyond Light/Dark (such as macOS-style Clear and Tinted) are not implemented yet.

## License

GPL-3.0-or-later, see `COPYING`. This project is derived from MacTahoe and
WhiteSur; their notices are in `THIRD_PARTY_NOTICES.md`.

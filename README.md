# Fluid Glass for Linux - GTK & GNOME Shell Theme

A modern fluid glass theme for Linux combining the **exact sizes and proportions of macOS 27" desktop** with **Fluid Glass shader-inspired material aesthetics** (translucent glass tints, 90° top specular rim lighting, ambient occlusion edge shadows, and soft diffused lighting).

---

## 🌟 Highlights

- **macOS 27" Desktop Measurements & Proportions**: Calibrated to match the exact proportions of macOS on a 27-inch 5K / Retina desktop display (2560×1440pt logical viewport, Apple 8pt spatial grid):
  - **Menu Bar (Top Panel)**: 32px height (desktop non-notch standard), 16px horizontal margins, 18px Apple icon.
  - **Unified Toolbar (Headerbar)**: 52px height, 12px traffic light controls with 8px dot pitch, 16px left inset.
  - **Control Center (Quick Settings)**: 370px container width (calibrated so toggles and sliders fit without truncation), 28px corner radius, 14px padding, 44px toggle capsules, 40px slider capsules, 40px circular system discs.
  - **Sidebar Proportions**: 240px width (~1:4.5 window ratio), 32px row height, 8px selection pill radius.
  - **Window Geometry**: 12px window inner radius / 26px mutter frame shadow, 8px button corner radius.
- **Fluid Glass Architecture (CSS Lenses + GLSL Shader)**:
  - **Theme Layer**: Borderless optical lens styling with soft inner rim highlights (`inset 0 0 4px rgba(...)`) and 100% transparent container shells.
  - **Shader Layer**: Real-time background refraction, chromatic dispersion, specular highlights, and ambient occlusion powered by the [Liquid Glass](https://github.com/ryohsuke1231/liquid-glass) GNOME extension.
- **Full GNOME Shell & App Coverage**:
  - Top Panel & Panel Menus
  - Quick Settings grid, quick toggles, and volume/brightness sliders
  - Calendar, DateMenu, and event cards
  - Notification banners & OSD popups
  - Dash to Dock & App Grid
  - GTK3 & GTK4 / Libadwaita window headerbars, sidebars, boxed lists, buttons, and switches

---

## 📋 Requirements

1. **GNOME Shell 46, 47, or 48+**
2. **User Themes extension** (`user-theme@gnome-shell-extensions.gcampax.github.com`): required by GNOME Shell to apply custom shell themes.
3. **Liquid Glass extension** (recommended for true optical glass): provides real-time GLSL shader blur and refraction behind panels. You can install it with `./install.sh -e` or from [extensions.gnome.org](https://extensions.gnome.org/extension/6966/liquid-glass/).

---

## 🚀 Quick Install

Precompiled themes are shipped ready-to-install in `./dist/` — **no compiler or dependencies required** for standard installation:

```bash
git clone https://github.com/Pardhu0547s/Fluid-Glass.git
cd Fluid-Glass
./install.sh
```

### Installation Options

```bash
./install.sh [OPTIONS]

  -c, --color [dark|light]            Color variant (default: dark)
  -s, --style [clear|normal|frosted]  Glass opacity level (default: normal)
  -b, --build                         Rebuild themes from SCSS source with sassc
      --mac27, --hd                   macOS 27" Desktop proportions (default)
      --laptop                        Compact laptop sizing
  -l, --libadwaita                    Configure GTK4 ~/.config/gtk-4.0 (default: enabled)
  -e, --with-extension                Install and enable Liquid Glass GNOME extension
  -d, --dest DIR                      Install directory (default: ~/.themes)
  -r, --remove, --uninstall           Uninstall Fluid-Glass and restore original configuration
  -h, --help                          Show help
```

### Examples

- **Install Light Glass variant**:
  ```bash
  ./install.sh -c light
  ```

- **Install with Frosted Glass look**:
  ```bash
  ./install.sh -s frosted
  ```

- **Install and enable the Liquid Glass extension for real GLSL refraction**:
  ```bash
  ./install.sh -e
  ```

- **Uninstall and restore system defaults**:
  ```bash
  ./install.sh -r
  ```

---

## 🛠️ Building from Source

To compile the themes from SCSS using `sassc`:

```bash
./build.sh -c all -s normal
```

The compiled themes will be placed into `./dist/`:
- `dist/Fluid-Glass-Dark/`
- `dist/Fluid-Glass-Light/`

To verify geometry against stock MacTahoe:
```bash
./build.sh --stock -o /tmp/lt-stock
```

---

## 📂 Project Architecture

```
Fluid-Glass/
├── build.sh               # SCSS build script with variant and option generation
├── install.sh             # Installation and activation script
├── COPYING                # GNU GPL-v3 License
├── extension/             # Vendored Liquid Glass extension for --with-extension
│   └── liquid-glass@thinkingcoding1231.gmail.com/
├── dist/                  # Precompiled ready-to-install themes
│   ├── Fluid-Glass-Dark/
│   └── Fluid-Glass-Light/
├── src/
│   ├── assets/            # Shell icons, title buttons, activity icons
│   ├── main/              # SCSS main entry templates
│   └── sass/
│       ├── glass/         # Fluid Glass Material Layer
│       │   ├── _material.scss  # Glass tokens, rim lighting, AO mixins
│       │   ├── _shell.scss     # GNOME Shell glass overrides
│       │   ├── _gtk3.scss      # GTK3 glass overrides
│       │   └── _gtk4.scss      # GTK4 & Libadwaita glass overrides
│       ├── gnome-shell/   # Shell widgets & layouts
│       └── gtk/           # GTK widgets & drawing
```

---

## 📜 Credits & License

- Based on **MacTahoe GTK Theme** by [vinceliuice](https://github.com/vinceliuice/MacTahoe-gtk-theme) (GPL-3.0).
- Glass aesthetics and shader parameters from **Liquid Glass** by [ryohsuke1231](https://github.com/ryohsuke1231/liquid-glass) (MIT).
- Distributed under the **GNU General Public License v3.0**.

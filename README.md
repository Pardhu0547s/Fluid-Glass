# Liquid-Tahoe GTK & GNOME Shell Theme

A hybrid theme combining the **exact sizes and measurements of MacTahoe** with the **Liquid Glass shader-inspired material aesthetics** (translucent glass tints, 90° top specular rim lighting, ambient occlusion edge shadows, and soft diffused lighting).

---

## 🌟 Highlights

- **macOS 27" Desktop Measurements & Proportions**: Calibrated to match the exact proportions of macOS on a 27-inch 5K / Retina desktop display (2560×1440pt logical viewport, Apple 8pt spatial grid):
  - **Menu Bar (Top Panel)**: 32px height (desktop non-notch standard), 16px horizontal margins, 18px Apple icon.
  - **Unified Toolbar (Headerbar)**: 52px height, 12px traffic light controls with 8px dot pitch, 16px left inset.
  - **Control Center (Quick Settings)**: 320px container width (1:8 screen width ratio), 20px corner radius, 16px padding, 44px toggle capsules, 28px sliders, 40px circular discs.
  - **Sidebar Proportions**: 240px width (~1:4.5 window ratio), 32px row height, 8px selection pill radius.
  - **Window Geometry**: 12px window inner radius / 26px mutter frame shadow, 8px button corner radius.
- **Liquid Glass Shader Material**: Features derived directly from the [ryohsuke1231/liquid-glass](https://github.com/ryohsuke1231/liquid-glass) extension:
  - 90° top specular rim highlight (`border-top: 1px solid rgba(255, 255, 255, 0.55 - 0.70)`)
  - Continuous perimeter edge illumination (`1px solid rgba(255, 255, 255, 0.18)`)
  - 100% transparent container backing allowing the GPU Cogl/GLSL shader blur to shine through smoothly at 144Hz
  - Frosted translucent capsules and pills (`rgba(255, 255, 255, 0.16)`) and luminous blue active state (`rgba(42, 130, 228, 0.40)`)
- **Full GNOME Shell & App Coverage**:
  - Top Panel & Panel Menus
  - Quick Settings grid, quick toggles, and volume/brightness sliders
  - Calendar, DateMenu, and event cards
  - Notification banners & OSD popups
  - Dash to Dock & App Grid
  - GTK3 & GTK4 / Libadwaita window headerbars, sidebars, boxed lists, buttons, and switches

---

## 🚀 Quick Install

To install and activate **Liquid-Tahoe-Dark** with macOS 27" Desktop Proportions:

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
      --mac27, --hd                   macOS 27" Desktop proportions (default)
      --laptop                        Compact laptop sizing
  -l, --libadwaita                    Configure GTK4 ~/.config/gtk-4.0 (default: enabled)
  -e, --with-extension                Install and enable Liquid Glass GNOME extension
  -d, --dest DIR                      Install directory (default: ~/.themes)
  -r, --remove                        Uninstall Liquid-Tahoe and restore defaults
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
- `dist/Liquid-Tahoe-Dark/`
- `dist/Liquid-Tahoe-Light/`

To verify geometry against stock MacTahoe:
```bash
./build.sh --stock -o /tmp/lt-stock
```

---

## 📂 Project Architecture

```
Liquid-Tahoe/
├── build.sh               # SCSS build script with variant and option generation
├── install.sh             # Installation and activation script
├── COPYING                # GNU GPL-v3 License
├── extension/             # Vendored Liquid Glass extension for --with-extension
│   └── liquid-glass@thinkingcoding1231.gmail.com/
├── dist/                  # Precompiled ready-to-install themes
│   ├── Liquid-Tahoe-Dark/
│   └── Liquid-Tahoe-Light/
└── src/
    ├── assets/            # Shell icons, title buttons, activity icons
    ├── main/              # SCSS main entry templates
    └── sass/
        ├── glass/         # Liquid Glass Material Layer
        │   ├── _material.scss  # Glass tokens, rim lighting, AO mixins
        │   ├── _shell.scss     # GNOME Shell glass overrides
        │   ├── _gtk3.scss      # GTK3 glass overrides
        │   └── _gtk4.scss      # GTK4 & Libadwaita glass overrides
        ├── gnome-shell/   # Vendored MacTahoe shell widgets & layouts
        └── gtk/           # Vendored MacTahoe GTK widgets & drawing
```

---

## 📜 Credits & License

- Based on **MacTahoe GTK Theme** by [vinceliuice](https://github.com/vinceliuice/MacTahoe-gtk-theme) (GPL-3.0).
- Glass aesthetics and shader parameters from **Liquid Glass** by [ryohsuke1231](https://github.com/ryohsuke1231/liquid-glass) (MIT).
- Distributed under the **GNU General Public License v3.0**.

# Fluid Glass for Linux 

A unified **macOS Tahoe Fluid Glass** suite for GNOME:
1. **Fluid Glass Unified Extension (`fluid-glass@pardhu0547s.github.io`)**: Combines a macOS Top Bar & floating Tahoe Control Center, real-time GLSL Liquid Glass Shaders (refraction & blur), and an animated magnification Dock.
2. **Fluid Glass Settings App**: A standalone native GTK4 & Libadwaita desktop application to customize glass effects, presets, accent colors, dock animations, and layout on the fly.
3. **Fluid Glass GTK & Shell Theme**: Translucent glass styling with specular highlights, rim reflections, and soft ambient shadows.

---

## ✨ Features

- **Floating Tahoe Control Center**:
  - Direct floating glass modules with **zero opaque outer card** over your wallpaper.
  - Authentic 6-row Tahoe layout: Wi-Fi (wide capsule), Now Playing (large 2×2 tile), Bluetooth & AirDrop (1×1 compact discs), Focus Mode (wide capsule), Stage Manager & Screen Mirroring (1×1 compact discs), Display & Sound sliders, and 4 circular action quick toggles (Dark Mode, Night Light, Screenshot, Airplane Mode).
  - Luminous glass styling (`rgba(255, 255, 255, 0.22)`) with a 1.5px specular rim (`rgba(255, 255, 255, 0.45)`), drop shadow, inset top highlight, and electric blue (`#007aff`) active states.
- **GLSL Liquid Glass Shader Engine**:
  - Multi-pass Kawase blur and physical light refraction.
  - Real-time dock glass backdrop with dynamic wallpaper adaptation.
- **Fluid Animated Dock**:
  - Smooth hover magnification and window dodging.
  - Transparent base allowing the liquid glass shader to refract the desktop background.
- **Native Extension Preferences (GTK4 + Libadwaita)**:
  - Accessible directly via the Extensions app, Extension Manager, or `gnome-extensions prefs fluid-glass@pardhu0547s.github.io`.
  - Switch presets in one click: **Tahoe Crystal (Recommended)**, **Deep Frosted Glass**, **Midnight Obsidian**, and **Electric Neon**.
  - Custom accent color picker, real-time glass shader sliders, and component toggles.

---

## 🚀 Quick Install

```bash
git clone https://github.com/Pardhu0547s/Fluid-Glass.git
cd Fluid-Glass
./install.sh
```

The installer will:
1. Install the **Fluid Glass** extension to `~/.local/share/gnome-shell/extensions/fluid-glass@pardhu0547s.github.io`.
2. Compile and install all GSettings schemas.
3. Install and configure the GTK4 / Libadwaita themes.

---

## 🎛 Opening Extension Settings

Open settings from the GNOME **Extensions** or **Extension Manager** app, or run:
```bash
gnome-extensions prefs fluid-glass@pardhu0547s.github.io
```

---

## 📦 Requirements

- **Desktop**: GNOME Shell 45–51 (Wayland or X11, Fedora / Ubuntu / Arch / openSUSE)
- **App Stack**: Python 3 with `PyGObject`, `GTK4`, and `Libadwaita` (preinstalled on standard GNOME desktops)

---

## 📄 License

The combined work is licensed under **GNU General Public License v3.0 or later (GPL-3.0-or-later)**. See [`COPYING`](file:///home/pavan/WorkSpace/Glass%20Theme/COPYING) and [`THIRD_PARTY_NOTICES.md`](file:///home/pavan/WorkSpace/Glass%20Theme/THIRD_PARTY_NOTICES.md) for full licensing details and third-party attribution.

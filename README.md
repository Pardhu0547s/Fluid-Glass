# Fluid Glass for Linux 

A unified **macOS Tahoe Fluid Glass** suite for GNOME:
1. **Fluid Glass Unified Extension (`fluid-glass@fedora`)**: Combines a macOS Top Bar & floating Tahoe Control Center, real-time GLSL Liquid Glass Shaders (refraction & blur), and an animated magnification Dock.
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
- **Native Customizer Application (`fluid-glass-settings`)**:
  - GTK4 + Libadwaita preferences window with an app launcher in your application grid.
  - Switch presets in one click: **Tahoe Crystal (Recommended)**, **Deep Frosted Glass**, **Midnight Obsidian**, and **Electric Neon**.
  - Accent color picker, slider adjustments, and live component toggles.

---

## 🚀 Quick Install

```bash
git clone https://github.com/Pardhu0547s/Fluid-Glass.git
cd Fluid-Glass
./install.sh
```

The installer will:
1. Install the **Fluid Glass** extension to `~/.local/share/gnome-shell/extensions/fluid-glass@fedora`.
2. Compile and install all GSettings schemas.
3. Install the **Fluid Glass Settings** desktop app (`fluid-glass-settings`), icon, and `.desktop` launcher.
4. Install and configure the GTK4 / Libadwaita themes.

---

## 🎛 Launching the Customizer App

Open the app from your application grid:
- Search for **"Fluid Glass"** in your launcher.
- Or run in terminal:
  ```bash
  fluid-glass-settings
  ```

---

## 📦 Requirements

- **Desktop**: GNOME Shell 45–51 (Wayland or X11, Fedora / Ubuntu / Arch / openSUSE)
- **App Stack**: Python 3 with `PyGObject`, `GTK4`, and `Libadwaita` (preinstalled on standard GNOME desktops)

---

## 📄 License

GPL-3.0-or-later. See `COPYING` for details.

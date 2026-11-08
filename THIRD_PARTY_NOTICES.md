# Third-Party Notices & Attribution

Fluid Glass for Linux is a unified suite combining native macOS Tahoe UI aesthetics, real-time GLSL liquid glass shaders, top bar & control center, and an animated magnification dock.

The unified, combined work is distributed under the terms of the **GNU General Public License v3.0 or later (GPL-3.0-or-later)** (see `COPYING`). It contains derivative and bundled work from the upstream open-source projects detailed below.

---

## 1. Liquid Glass
- **Upstream Author**: Ryohsuke (`ryohsuke1231`)
- **Source**: https://github.com/ryohsuke1231/liquid-glass
- **License**: GNU General Public License v2.0 or later (GPL-2.0-or-later)
- **Bundled components**: Real-time GPU refraction and dual-kawase blur shader engine, backdrop glass actor pipeline, and window/dock glass management (`fluid-glass/glass/`, `fluid-glass/shaders/`).

---

## 2. Dash to Dock Animated (Dash2Dock Lite)
- **Upstream Author**: icedman
- **Source**: https://github.com/icedman/dash2dock-lite
- **License**: GNU General Public License v2.0 or later (GPL-2.0-or-later)
- **Bundled components**: Fluid animated magnification dock, autohide & window dodge controller, and dash layout management (`fluid-glass/dock/`).

---

## 3. Lintel
- **Upstream Author**: Aryan K (`aryan_k`) and contributors
- **Source**: https://github.com/aryan-k/lintel
- **License**: GNU General Public License v3.0 or later (GPL-3.0-or-later)
- **Bundled components**: macOS menu bar layout, Apple system logo menu, active application name indicator, and modular floating Tahoe Control Center & Notification Center (`fluid-glass/topbar/`).

---

## 4. MacTahoe GTK Theme
- **Upstream Author**: vinceliuice
- **Source**: https://github.com/vinceliuice/MacTahoe-gtk-theme
- **License**: GNU General Public License v3.0 (GPL-3.0)
- **Components**: SCSS styling under `src/sass/gtk`, `src/sass/gnome-shell`, `src/main` and icon/asset sets under `src/assets`.

---

## 5. WhiteSur GTK Theme
- **Upstream Authors**: vinceliuice and WhiteSur Developers
- **Source**: https://github.com/vinceliuice/WhiteSur-gtk-theme
- **License**: MIT License

```text
Copyright (c) 2021 WhiteSur Developers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## License Compatibility & Combination

Individual files throughout the codebase preserve their original upstream copyright notices and SPDX license identifiers (`GPL-2.0-or-later`, `GPL-3.0-or-later`, `MIT`). Because the GPL-2.0-or-later license explicitly permits distribution under any later version published by the Free Software Foundation, all bundled components are fully compatible with GPLv3. The combined work is distributed under GPL-3.0-or-later.

# Fluid Glass 2.0 roadmap

## Alpha 1 — independent foundation
- [x] Independent project skeleton and design language
- [x] GTK3 dark/light themes
- [x] GNOME Shell 50 extension with native panel backdrop blur
- [x] Reversible per-user installer foundation

## Alpha 2 — token-driven GTK + Shell surfaces
- [x] Single JSON palette generating GTK3, GTK4 and Shell tokens
- [x] Original GTK3 and GTK4 dark/light stylesheets
- [x] GNOME Shell styles for Quick Settings, calendar, notifications, OSD and overview
- [x] Native blur attached to panel and popup actor entry points
- [x] Extension preferences for enablement, radius and brightness
- [ ] Fedora 44/GNOME 50 runtime and visual QA
- [ ] GTK3/GTK4 app-by-app QA and Libadwaita policy validation

## Alpha 3 — visual and lifecycle polish
- [x] Expanded GTK3/GTK4 widget coverage using generated semantic tokens
- [x] Explicit dark/light GNOME Shell styles for all principal glass surfaces
- [x] Scale-factor-aware Shell backdrop blur
- [x] Safe popup actor class/effect cleanup during refresh and disable
- [x] Type-safe preferences controls and bounded brightness values
- [x] Mocked lifecycle tests and installer regression tests
- [ ] Real Fedora GNOME 50 visual/performance QA

## Beta 1 — optical renderer
- [x] Standalone GLSL prototype for rounded lens, refraction, restrained dispersion and rim light
- [ ] OpenGL test harness with a known backdrop texture
- [ ] Validate alpha, coordinate mapping, HiDPI scaling and clipping
- [ ] Integrate only through a supported GNOME/Mutter rendering path
- [ ] Benchmark integrated and discrete GPUs

## Beta 2 — polish and performance
- [ ] Monitor scaling and multiple-monitor tests
- [ ] Reduced-effects/accessibility preferences
- [ ] Low-performance preset and blur budget
- [ ] Suspend/resume, lock/unlock, Shell restart and disable tests

## Release candidate
- [ ] GNOME Shell 50 Fedora test matrix
- [ ] Keyboard navigation, focus and contrast review
- [ ] GTK3/GTK4 matrix and Libadwaita caveats
- [ ] Reproducible release package, screenshots and checksums


## Alpha 4 — Quick Settings Control Center (implementation complete; runtime QA pending)

- [x] Restyle GNOME native two-column Quick Settings grid with glass capsules.
- [x] Restyle volume and brightness sliders.
- [x] Add guarded native screenshot action.
- [x] Separate Quick Settings and calendar blur preferences.
- [ ] Validate visual layout on Fedora 44 / GNOME 50 at 100%, 150% and 200% scale.
- [ ] Verify each native toggle on a laptop and desktop hardware profile.
- [ ] Benchmark popup blur GPU/frame-time impact.

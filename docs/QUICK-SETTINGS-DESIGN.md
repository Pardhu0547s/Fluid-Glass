# Control Center design — Alpha 5

## Visual target

Fluid Glass uses the current macOS Control Center as a close visual reference: a compact floating popover, translucent tinted material, rounded modules, a utility/action row, full-width Sound and Display sliders, two-column connection/focus controls, and bright blue selected states.

This is an independent GNOME implementation. It does not copy Apple artwork, proprietary icons, or source code. GNOME's own symbolic icons and native settings objects remain in use.

## Layout and material

- A single rounded, floating glass panel with a low-opacity tint so the live backdrop blur remains visible.
- A two-column module grid with room for full labels and subtitles; no fixed 96-pixel tile widths or artificial 36-pixel margins.
- Menu toggles have a unified rounded rectangle with a separate trailing submenu affordance.
- Volume and brightness stay full-width sliders with rounded tracks and bright handles.
- Battery, Settings, Lock, Power and Screenshot actions use circular or capsule surfaces.
- Inactive tiles are translucent; selected tiles use electric blue with white text/icons.
- Dark and light variants share the same geometry and active-state behavior.
- Respect reduced-motion and keyboard focus conventions provided by GNOME.

## GNOME control mapping

| macOS concept | Fluid Glass / GNOME implementation |
|---|---|
| Wi-Fi | GNOME NetworkManager Quick Toggle and submenu |
| Bluetooth | GNOME Bluetooth Quick Toggle and device submenu |
| AirDrop | No 1:1 native GNOME equivalent; do not fake it |
| Focus | GNOME Do Not Disturb and notification controls |
| Display | Native brightness slider; Night Light where supported |
| Sound | Native output volume slider and device routing |
| Now Playing | Use GNOME/MPRIS media integration where available; not claimed as a built-in equivalent |
| Screen Mirroring | GNOME casting/screen sharing where supported; behavior differs by hardware and session |
| Stage Manager | GNOME overview and workspaces remain native; not a 1:1 feature |
| Battery | GNOME's battery indicator when the device exposes battery status |
| Lock / Power | Native GNOME system actions |

No fake tiles or local booleans are used to pretend to control system services. A control appears only when GNOME or the hardware provides that capability.

## Blur policy

- Top panel blur: enabled by default.
- Quick Settings blur: enabled by default.
- Calendar blur: independently configurable and off by default.
- The surface fill is intentionally low-opacity (dark 0.40, light 0.40) so the native Shell backdrop blur is visible.
- If frame pacing degrades, lower the blur radius before increasing opacity.

## Verification checklist

1. Test dark and light appearance at 100%, 150% and 200% scaling.
2. Confirm the popup width fits GNOME Shell and labels are not clipped.
3. Test Wi-Fi, Bluetooth, Airplane Mode, Focus/Do Not Disturb, Night Light and power mode against actual system state.
4. Test sound and brightness slider behavior.
5. Check that the popup background visibly samples a moving wallpaper/window backdrop.
6. Test keyboard focus, high contrast and reduced motion.
7. Benchmark GPU/frame time with blur enabled and disabled.
8. Verify menus, calendar and notifications remain readable over bright and dark wallpapers.

## References

- Apple Support: [Quickly change settings with Control Centre on Mac](https://support.apple.com/en-au/guide/mac-help/mchlc9d0e1f2/27/mac/27)
- GNOME JavaScript Guide: [Quick Settings](https://gjs.guide/extensions/topics/quick-settings.html)

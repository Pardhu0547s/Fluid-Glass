# Quick Settings Control Center — Alpha 4

## Design source

The design reference is [`design-reference/quick-settings-reference.png`](design-reference/quick-settings-reference.png), supplied for Fluid Glass 2.0.

## Implementation strategy

Fluid Glass styles GNOME's native Quick Settings UI instead of replacing it. GNOME's Quick Settings menu already uses a homogeneous reflowing grid and provides native `QuickToggle`, `QuickMenuToggle`, `QuickSlider` and action item classes. The style layer gives those components the reference's two-column capsule layout, rounded glass surface, illuminated checked state, separate arrow segment and glass sliders.

This means the default GNOME system controls continue to own their behavior:

- Wi-Fi and wired networking use NetworkManager integration.
- Bluetooth uses GNOME's Bluetooth integration.
- Night Light, Dark Style, Airplane Mode, power mode and Do Not Disturb retain their Shell-provided behavior when the relevant service or hardware exists.
- Settings, Lock and Power remain GNOME's native system actions.
- Fluid Glass adds a Screenshot action to the native system action row. It calls `Main.screenshotUI.open()` only after checking that the Shell exposes that method. If not, the action is omitted and GNOME's built-in Print shortcut continues to work.

No network, Bluetooth, power or display controls are simulated by local preference booleans.

## Blur policy

- Top panel blur: enabled by default.
- Quick Settings blur: enabled by default, since this is the primary glass surface in the reference.
- Calendar popup blur: disabled by default and independently configurable.
- Global blur can be disabled. When the compositor blur API is missing, the extension retains the translucent CSS material as a fallback.

Backdrop blur is more expensive than a static translucent fill. On integrated GPUs or high-DPI displays, reduce the blur radius or disable Quick Settings blur if frame pacing degrades.

## Current behavior versus planned work

Implemented in Alpha 4:

- two-column native Quick Settings grid styling;
- elongated toggles and separate arrow affordances;
- distinct checked, unchecked, hover and keyboard-focus states;
- rounded volume and brightness tracks;
- circular system action buttons;
- native screenshot shortcut;
- separate Quick Settings and calendar blur preferences.

Not yet implemented:

- custom battery percentage UI beyond GNOME's own battery/system item;
- arbitrary custom quick tiles not represented by GNOME's native controls;
- live optical refraction or chromatic dispersion;
- per-control user-configurable ordering.

The reference image is a visual direction, not a promise that unsupported hardware controls (for example, keyboard backlight or hotspot) will appear on every machine.

## API references

- GNOME JavaScript Guide, Quick Settings: https://gjs.guide/extensions/topics/quick-settings.html
- GNOME Help, Quick Settings behavior: https://help.gnome.org/gnome-help/quick-settings.html


## Visual troubleshooting

The extension follows GNOME's color-scheme setting. The GTK installer variant alone does not force Shell appearance:
- Light material: set **Settings → Appearance → Style → Light**, or run `gsettings set org.gnome.desktop.interface color-scheme 'prefer-light'`.
- Dark material: set **Settings → Appearance → Style → Dark**, or run `gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'`.

The glass surface uses low-alpha fills (dark: 0.42, light: 0.32) so the native Shell backdrop blur remains visible. If the panel still appears opaque, verify that Quick Settings blur is enabled in extension preferences and that the GNOME Shell extension is enabled; then log out and back in to reload Shell safely.

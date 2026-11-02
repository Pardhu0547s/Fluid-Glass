# Testing checklist — Alpha 3

## Static and mock checks

```bash
./scripts/validate.sh
./build.sh
./install.sh --dry-run
./tests/test-installer.sh
node tests/test-extension-lifecycle.mjs
```

The extension lifecycle mock verifies scale-aware blur setup, default popup-blur opt-out, popup actor replacement cleanup, and effect/class removal during disable. It does not replace a live GJS/GNOME Shell test.

## Fedora 44 / GNOME 50 runtime

1. Use a disposable account or VM snapshot; record existing `gtk-theme` and `color-scheme` values.
2. Install dark mode and verify panel blur/tint.
3. Open Quick Settings and calendar; inspect blur, boundaries and clipped labels.
4. Inspect notifications and OSD over changing bright/dark backdrops.
5. Open `gnome-extensions prefs fluid-glass@fluidglass.dev`; change blur targets, radius and brightness.
6. Change GNOME Appearance between dark/light and verify tint follows.
7. Disable/re-enable extension; ensure classes/effects are removed/restored.
8. Test scaling, multiple monitors, lock/unlock and Shell restart.
9. Compare GPU/frame pacing with blur on/off.
10. Uninstall; verify prior theme and pre-existing theme directory are restored.

Test GTK3, GTK4 and Libadwaita applications separately. Libadwaita may retain Adwaita styling. The installer must not alter `~/.config/gtk-4.0/gtk.css`.

Static parsing is not runtime testing. Check errors using `journalctl --user -b | grep -i 'fluid glass'`.

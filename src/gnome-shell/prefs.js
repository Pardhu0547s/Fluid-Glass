/* Fluid Glass preferences — GNOME Shell 50. */
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class FluidGlassPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({
            title: 'Appearance',
            icon_name: 'applications-graphics-symbolic',
        });
        const group = new Adw.PreferencesGroup({
            title: 'Glass surfaces',
            description: 'Backdrop blur samples pixels behind a surface and can increase GPU work.',
        });

        for (const [key, title, subtitle] of [
            ['blur-enabled', 'Enable backdrop blur', 'Turn live background blur on or off.'],
            ['panel-blur', 'Top panel blur', 'Blur the narrow GNOME top panel surface.'],
            ['quick-settings-blur', 'Quick Settings glass blur', 'Apply live backdrop blur to the main control center.'],
            ['calendar-blur', 'Calendar popup blur', 'Optional: blur the calendar and notification popup surface.'],
            ['screenshot-button', 'Screenshot shortcut', 'Show a native GNOME screenshot shortcut in Quick Settings.'],
        ]) {
            const row = new Adw.SwitchRow({ title, subtitle });
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            group.add(row);
        }

        const radiusRow = new Adw.ActionRow({
            title: 'Blur radius',
            subtitle: 'Recommended: 12–20. The value scales with display scale factor.',
        });
        const radius = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            digits: 0,
            draw_value: true,
            hexpand: true,
            width_request: 190,
        });
        radius.set_range(4, 32);
        radius.set_increments(1, 4);
        radius.set_value(settings.get_int('blur-radius'));
        radius.connect('value-changed', () => {
            const value = Math.round(radius.get_value());
            if (settings.get_int('blur-radius') !== value)
                settings.set_int('blur-radius', value);
        });
        const radiusSignal = settings.connect('changed::blur-radius', () => {
            radius.set_value(settings.get_int('blur-radius'));
        });
        radiusRow.add_suffix(radius);
        radiusRow.set_activatable_widget(radius);
        group.add(radiusRow);

        const brightnessRow = new Adw.ActionRow({
            title: 'Blur brightness',
            subtitle: 'Adjust the brightness of the blurred backdrop.',
        });
        const brightness = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            digits: 2,
            draw_value: true,
            hexpand: true,
            width_request: 190,
        });
        brightness.set_range(0.5, 1.0);
        brightness.set_increments(0.02, 0.1);
        brightness.set_value(settings.get_double('brightness'));
        brightness.connect('value-changed', () => {
            const value = Math.max(0.5, Math.min(1.0, brightness.get_value()));
            if (Math.abs(settings.get_double('brightness') - value) > 0.0001)
                settings.set_double('brightness', value);
        });
        const brightnessSignal = settings.connect('changed::brightness', () => {
            brightness.set_value(settings.get_double('brightness'));
        });
        brightnessRow.add_suffix(brightness);
        brightnessRow.set_activatable_widget(brightness);
        group.add(brightnessRow);

        page.add(group);
        window.add(page);
        window.connect('close-request', () => {
            settings.disconnect(radiusSignal);
            settings.disconnect(brightnessSignal);
            return false;
        });
    }
}

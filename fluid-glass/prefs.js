import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export default class FluidGlassPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.fluid-glass');

        const page = new Adw.PreferencesPage({
            title: _('Fluid Glass'),
            icon_name: 'preferences-desktop-theme-symbolic',
        });
        window.add(page);

        // Standalone Customizer App Launch Banner
        const launchGroup = new Adw.PreferencesGroup({
            title: _('Fluid Glass Customizer App'),
            description: _('Use the standalone native application for complete visual controls, presets, and real-time live preview.'),
        });
        page.add(launchGroup);

        const launchRow = new Adw.ActionRow({
            title: _('Open Fluid Glass Customizer'),
            subtitle: _('Launch the dedicated settings application'),
        });
        const launchBtn = new Gtk.Button({
            label: _('Launch App'),
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });
        launchBtn.connect('clicked', () => {
            try {
                GLib.spawn_command_line_async('fluid-glass-settings');
            } catch (err) {
                console.error('[FluidGlass] Failed to launch customizer:', err);
            }
        });
        launchRow.add_suffix(launchBtn);
        launchGroup.add(launchRow);

        // Core Subsystems
        const subGroup = new Adw.PreferencesGroup({
            title: _('Core Subsystems'),
        });
        page.add(subGroup);

        const dockRow = new Adw.SwitchRow({
            title: _('Fluid Animated Dock'),
            subtitle: _('Show macOS-style magnification dock with liquid glass backdrop'),
        });
        settings.bind('enable-dock', dockRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        subGroup.add(dockRow);

        const glassRow = new Adw.SwitchRow({
            title: _('GLSL Liquid Glass Shaders'),
            subtitle: _('Real-time refraction, specular rims, and fluid distortion'),
        });
        settings.bind('enable-glass-shaders', glassRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        subGroup.add(glassRow);

        const topbarRow = new Adw.SwitchRow({
            title: _('Top Bar & Tahoe Control Center'),
            subtitle: _('macOS menu bar layout and floating fluid glass Control Center'),
        });
        settings.bind('enable-topbar', topbarRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        subGroup.add(topbarRow);
    }
}

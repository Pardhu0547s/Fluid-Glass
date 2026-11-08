// SPDX-License-Identifier: GPL-2.0-or-later
//
// prefs.js — Native GTK4 & Libadwaita Preferences for Fluid Glass Extension Suite
//

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const EXTENSION_UUID = 'fluid-glass@pardhu0547s.github.io';

const SCHEMA_MASTER = 'org.gnome.shell.extensions.fluid-glass';
const SCHEMA_TOPBAR = 'org.gnome.shell.extensions.fluid-glass.topbar';
const SCHEMA_GLASS = 'org.gnome.shell.extensions.fluid-glass.glass';
const SCHEMA_DOCK = 'org.gnome.shell.extensions.fluid-glass.dock';

const LEGACY_LINTEL = 'org.gnome.shell.extensions.lintel';
const LEGACY_GLASS = 'org.gnome.shell.extensions.liquid-glass@thinkingcoding1231.gmail.com';
const LEGACY_DOCK = 'org.gnome.shell.extensions.dash2dock-lite';

export default class FluidGlassPreferences extends ExtensionPreferences {
    _tryGetSettings(schemaId) {
        try {
            return this.getSettings(schemaId);
        } catch (_e) {
            try {
                const schemaDir = this.dir.get_child('schemas');
                const source = Gio.SettingsSchemaSource.new_from_directory(
                    schemaDir.get_path(),
                    Gio.SettingsSchemaSource.get_default(),
                    false
                );
                const schema = source.lookup(schemaId, true);
                if (schema)
                    return new Gio.Settings({ settings_schema: schema });
            } catch (_err) {}
        }
        return null;
    }

    _safeGetSettings(schemaId, legacyId = null) {
        let s = this._tryGetSettings(schemaId);
        if (!s && legacyId)
            s = this._tryGetSettings(legacyId);
        return s;
    }

    fillPreferencesWindow(window) {
        window.set_default_size(780, 680);

        const display = Gdk.Display.get_default();
        if (display) {
            try {
                const iconTheme = Gtk.IconTheme.get_for_display(display);
                const iconsPath = this.dir.get_child('icons').get_path();
                iconTheme.add_search_path(iconsPath);
            } catch (_e) {}
        }

        this.sMaster = this._safeGetSettings(SCHEMA_MASTER);
        this.sLintel = this._safeGetSettings(SCHEMA_TOPBAR, LEGACY_LINTEL);
        this.sGlass = this._safeGetSettings(SCHEMA_GLASS, LEGACY_GLASS);
        this.sDock = this._safeGetSettings(SCHEMA_DOCK, LEGACY_DOCK);

        this._buildPresetsPage(window);
        this._buildGlassPage(window);
        this._buildControlCenterPage(window);
        this._buildDockPage(window);
        this._buildTopBarPage(window);
        this._buildAboutPage(window);
    }

    // ── 1. Presets & Overview ──────────────────────────────────────────────
    _buildPresetsPage(window) {
        const page = new Adw.PreferencesPage({
            title: _('Overview & Presets'),
            icon_name: 'fluid-glass-symbolic',
        });
        window.add(page);

        // Core Subsystems Toggles
        if (this.sMaster) {
            const groupSub = new Adw.PreferencesGroup({
                title: _('Active Subsystems'),
                description: _('Toggle components managed by the unified Fluid Glass Suite'),
            });
            page.add(groupSub);

            const dockRow = new Adw.SwitchRow({
                title: _('Fluid Animated Dock'),
                subtitle: _('Magnification dock with real-time liquid glass refraction backdrop'),
            });
            this.sMaster.bind('enable-dock', dockRow, 'active', Gio.SettingsBindFlags.DEFAULT);
            groupSub.add(dockRow);

            const glassRow = new Adw.SwitchRow({
                title: _('GLSL Liquid Glass Shaders'),
                subtitle: _('Real-time GPU refraction, specular rim highlights, and dual-kawase blur'),
            });
            this.sMaster.bind('enable-glass-shaders', glassRow, 'active', Gio.SettingsBindFlags.DEFAULT);
            groupSub.add(glassRow);

            const topbarRow = new Adw.SwitchRow({
                title: _('Top Bar & Menu Bar'),
                subtitle: _('macOS menu bar layout with system logo, active app title & right-aligned clock'),
            });
            this.sMaster.bind('enable-topbar', topbarRow, 'active', Gio.SettingsBindFlags.DEFAULT);
            groupSub.add(topbarRow);

            const ccRow = new Adw.SwitchRow({
                title: _('Tahoe Control Center'),
                subtitle: _('6-row modular floating liquid glass capsules sitting directly over wallpaper'),
            });
            this.sMaster.bind('enable-control-center', ccRow, 'active', Gio.SettingsBindFlags.DEFAULT);
            groupSub.add(ccRow);
        }

        // Theme Presets
        const groupPresets = new Adw.PreferencesGroup({
            title: _('Theme Presets'),
            description: _('One-click appearance presets aligning all glass surfaces'),
        });
        page.add(groupPresets);

        const presets = [
            {
                id: 'tahoe-crystal',
                title: _('Tahoe Crystal (Recommended)'),
                desc: _('Authentic macOS Tahoe liquid glass with 12% white luminance, specular rims & electric blue active states'),
            },
            {
                id: 'deep-frosted',
                title: _('Deep Frosted Glass'),
                desc: _('Heavier translucent matte blur with rich diffusion for bright or busy wallpapers'),
            },
            {
                id: 'midnight-glass',
                title: _('Midnight Obsidian'),
                desc: _('Dark stealth tinted glass with luminous edges and vibrant blue accents'),
            },
            {
                id: 'electric-neon',
                title: _('Electric Neon'),
                desc: _('High-contrast specular highlights with energetic vibrant cyan refraction'),
            },
        ];

        for (const preset of presets) {
            const row = new Adw.ActionRow({
                title: preset.title,
                subtitle: preset.desc,
            });
            const btn = new Gtk.Button({
                label: _('Apply'),
                valign: Gtk.Align.CENTER,
            });
            btn.connect('clicked', () => this._applyPreset(preset.id));
            row.add_suffix(btn);
            groupPresets.add(row);
        }

        // Accent Colors
        const groupAccent = new Adw.PreferencesGroup({
            title: _('Active Accent Color'),
            description: _('Applied to active toggle capsules (Wi-Fi, Bluetooth) and interactive highlights'),
        });
        page.add(groupAccent);

        const rowAcc = new Adw.ActionRow({
            title: _('Accent Preset'),
            subtitle: _('Select a signature tint color for toggles and buttons'),
        });
        groupAccent.add(rowAcc);

        const boxColors = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            valign: Gtk.Align.CENTER,
        });

        const colors = [
            ['Electric Blue', '#007aff'],
            ['Tahoe Purple', '#af52de'],
            ['Emerald Green', '#34c759'],
            ['Sunset Orange', '#ff9500'],
            ['Crimson Red', '#ff3b30'],
            ['Graphite', '#545458'],
        ];

        for (const [name, hex] of colors) {
            const btn = new Gtk.Button({
                label: name,
            });
            btn.connect('clicked', () => this._setAccentColor(hex));
            boxColors.append(btn);
        }
        rowAcc.add_suffix(boxColors);

        // Maintenance Actions
        const groupActions = new Adw.PreferencesGroup({
            title: _('Maintenance'),
        });
        page.add(groupActions);

        const reloadRow = new Adw.ActionRow({
            title: _('Reload Extension'),
            subtitle: _('Restart the Fluid Glass extension to apply low-level compositor changes'),
        });
        const reloadBtn = new Gtk.Button({
            label: _('Reload Now'),
            valign: Gtk.Align.CENTER,
        });
        reloadBtn.connect('clicked', () => {
            try {
                GLib.spawn_command_line_async(`gnome-extensions disable ${EXTENSION_UUID} && sleep 1 && gnome-extensions enable ${EXTENSION_UUID}`);
            } catch (err) {
                console.error('[FluidGlass] Failed to reload:', err);
            }
        });
        reloadRow.add_suffix(reloadBtn);
        groupActions.add(reloadRow);
    }

    // ── 2. Glass & Shaders ─────────────────────────────────────────────────
    _buildGlassPage(window) {
        const page = new Adw.PreferencesPage({
            title: _('Glass & Shaders'),
            icon_name: 'applications-graphics-symbolic',
        });
        window.add(page);

        const groupShaders = new Adw.PreferencesGroup({
            title: _('Liquid Glass Shader Parameters'),
            description: _('Fine-tune real-time GLSL backdrop blur, refraction and specular lighting'),
        });
        page.add(groupShaders);

        if (this.sGlass) {
            // Blur Radius
            const blurRow = new Adw.ActionRow({
                title: _('Liquid Blur Radius'),
                subtitle: _('Multi-pass Dual Kawase blur spread in pixels'),
            });
            const blurScale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 4, 32, 2);
            blurScale.set_hexpand(true);
            blurScale.set_valign(Gtk.Align.CENTER);
            blurScale.set_value(this.sGlass.get_int('dock-blur-radius') || 10);
            blurScale.connect('value-changed', s => {
                const val = Math.round(s.get_value());
                this.sGlass.set_int('dock-blur-radius', val);
                this.sGlass.set_int('panel-menu-blur-radius', val);
                this.sGlass.set_int('menu-blur-radius', val);
            });
            blurRow.add_suffix(blurScale);
            groupShaders.add(blurRow);

            // Tint Strength
            const tintRow = new Adw.ActionRow({
                title: _('Glass Tint Strength'),
                subtitle: _('Whiteness luminance and body reflection intensity (0.05–0.40)'),
            });
            const tintScale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0.04, 0.35, 0.02);
            tintScale.set_hexpand(true);
            tintScale.set_valign(Gtk.Align.CENTER);
            tintScale.set_value(this.sGlass.get_double('dock-tint-strength') || 0.12);
            tintScale.connect('value-changed', s => {
                const val = Number(s.get_value().toFixed(2));
                this.sGlass.set_double('dock-tint-strength', val);
                this.sGlass.set_double('panel-menu-tint-strength', val);
                this.sGlass.set_double('menu-tint-strength', val);
            });
            tintRow.add_suffix(tintScale);
            groupShaders.add(tintRow);

            // Saturation Boost
            const satRow = new Adw.ActionRow({
                title: _('Backdrop Saturation Boost'),
                subtitle: _('Vibrancy multiplier for colors refracting through the glass'),
            });
            const satScale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 1.0, 2.0, 0.1);
            satScale.set_hexpand(true);
            satScale.set_valign(Gtk.Align.CENTER);
            satScale.set_value(this.sGlass.get_double('dock-saturation') || 1.5);
            satScale.connect('value-changed', s => {
                const val = Number(s.get_value().toFixed(1));
                this.sGlass.set_double('dock-saturation', val);
                this.sGlass.set_double('panel-menu-saturation', val);
                this.sGlass.set_double('menu-saturation', val);
            });
            satRow.add_suffix(satScale);
            groupShaders.add(satRow);

            // Corner Radius
            const cornerRow = new Adw.ActionRow({
                title: _('Glass Corner Radius'),
                subtitle: _('Curvature for dock and menu surface perimeters (px)'),
            });
            const cornerScale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 14, 36, 2);
            cornerScale.set_hexpand(true);
            cornerScale.set_valign(Gtk.Align.CENTER);
            cornerScale.set_value(this.sGlass.get_double('dock-corner-radius') || 26.0);
            cornerScale.connect('value-changed', s => {
                const val = Math.round(s.get_value());
                this.sGlass.set_double('dock-corner-radius', val);
                this.sGlass.set_double('panel-menu-corner-radius', val);
                this.sGlass.set_double('menu-corner-radius', val);
            });
            cornerRow.add_suffix(cornerScale);
            groupShaders.add(cornerRow);
        }

        // Active Surfaces
        const groupTargets = new Adw.PreferencesGroup({
            title: _('Active Glass Surfaces'),
            description: _('Select which desktop elements receive the real GLSL liquid glass effect'),
        });
        page.add(groupTargets);

        if (this.sGlass) {
            const targets = [
                ['Dock', 'enable-dock-glass', _('Apply glass backdrop to the animated dock')],
                ['Panel Menus', 'enable-extra-menu-glass', _('Apply glass to Wi-Fi, battery, audio and indicator popups')],
                ['Calendar & Date', 'enable-menu-glass', _('Apply glass backdrop to calendar popup')],
                ['Desktop Context Menu', 'enable-desktop-menu-glass', _('Apply glass to desktop right-click menu')],
                ['Notifications', 'enable-notification-glass', _('Apply glass to incoming banners and alert bubbles')],
                ['Volume / Brightness OSD', 'enable-osd-glass', _('Apply glass to on-screen volume & display overlays')],
                ['Application Windows', 'enable-application-glass', _('Apply glass behind supported translucent app windows')],
            ];

            for (const [title, key, desc] of targets) {
                if (this.sGlass.list_keys().includes(key)) {
                    const row = new Adw.SwitchRow({
                        title: _(title),
                        subtitle: desc,
                    });
                    this.sGlass.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
                    groupTargets.add(row);
                }
            }
        }
    }

    // ── 3. Control Center ──────────────────────────────────────────────────
    _buildControlCenterPage(window) {
        const page = new Adw.PreferencesPage({
            title: _('Control Center'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        const groupCC = new Adw.PreferencesGroup({
            title: _('Tahoe Control Center Layout'),
            description: _('Configure floating liquid glass modules and behavior'),
        });
        page.add(groupCC);

        if (this.sLintel) {
            const modeRow = new Adw.ComboRow({
                title: _('Control Center Mode'),
                subtitle: _('macOS Tahoe custom modular capsules vs standard GNOME Quick Settings'),
            });
            const model = Gtk.StringList.new([
                _('Custom Tahoe (Recommended)'),
                _('Native GNOME Quick Settings'),
            ]);
            modeRow.set_model(model);
            const currentMode = this.sLintel.get_string('control-center-mode');
            modeRow.set_selected(currentMode === 'custom' ? 0 : 1);
            modeRow.connect('notify::selected', () => {
                this.sLintel.set_string('control-center-mode', modeRow.get_selected() === 0 ? 'custom' : 'native');
            });
            groupCC.add(modeRow);
        }

        const groupModules = new Adw.PreferencesGroup({
            title: _('Module Arrangement'),
            description: _('6-row layout with real-time responsive grid positioning'),
        });
        page.add(groupModules);

        const modules = [
            [_('Row 1: Wi-Fi Capsule (Wide)'), _('Left-half capsule with wireless status & network label')],
            [_('Row 1 & 2: Now Playing Media (Large)'), _('Right-half square tile with album artwork & transport controls')],
            [_('Row 2: Bluetooth & AirDrop Discs'), _('Compact circular 1×1 quick toggle action discs')],
            [_('Row 3: Focus Mode Capsule (Wide)'), _('Left-half capsule with Do Not Disturb & notification gating')],
            [_('Row 3: Stage Manager & Mirroring'), _('Right-half multitasking action discs')],
            [_('Row 4 & 5: Display & Sound Sliders'), _('Full-width capsules with luminous tracks and level knobs')],
            [_('Row 6: Action Controls Discs'), _('Four compact buttons for Dark Mode, Night Light, Screenshot, Airplane')],
            [_('Bottom: Edit Controls Button'), _('Customizer button allowing live drag/drop and hide/show of capsules')],
        ];

        for (const [title, desc] of modules) {
            const row = new Adw.ActionRow({
                title,
                subtitle: desc,
            });
            const icon = new Gtk.Image({
                icon_name: 'emblem-ok-symbolic',
                valign: Gtk.Align.CENTER,
            });
            row.add_suffix(icon);
            groupModules.add(row);
        }
    }

    // ── 4. Fluid Dock ──────────────────────────────────────────────────────
    _buildDockPage(window) {
        const page = new Adw.PreferencesPage({
            title: _('Fluid Dock'),
            icon_name: 'user-desktop-symbolic',
        });
        window.add(page);

        const groupDock = new Adw.PreferencesGroup({
            title: _('Dock Geometry & Animation'),
            description: _('macOS-style magnification and autohide behavior'),
        });
        page.add(groupDock);

        if (this.sDock) {
            // Magnification
            const magRow = new Adw.ActionRow({
                title: _('Hover Magnification'),
                subtitle: _('Smooth fluid magnification zoom when hovering app icons'),
            });
            const magScale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0.0, 0.60, 0.05);
            magScale.set_hexpand(true);
            magScale.set_valign(Gtk.Align.CENTER);
            magScale.set_value(this.sDock.get_double('animation-magnify') || 0.35);
            magScale.connect('value-changed', s => {
                this.sDock.set_double('animation-magnify', Number(s.get_value().toFixed(2)));
            });
            magRow.add_suffix(magScale);
            groupDock.add(magRow);

            // Autohide
            const hideRow = new Adw.SwitchRow({
                title: _('Autohide Dock'),
                subtitle: _('Automatically slide the dock away when not in use'),
            });
            this.sDock.bind('autohide-dash', hideRow, 'active', Gio.SettingsBindFlags.DEFAULT);
            groupDock.add(hideRow);

            // Window Dodge
            const dodgeRow = new Adw.SwitchRow({
                title: _('Intelligent Window Dodge'),
                subtitle: _('Only autohide when an active application window overlaps the dock'),
            });
            this.sDock.bind('autohide-dodge', dodgeRow, 'active', Gio.SettingsBindFlags.DEFAULT);
            groupDock.add(dodgeRow);

            // Transparent Base
            const transRow = new Adw.ActionRow({
                title: _('Transparent Dock Base'),
                subtitle: _('Clears the CSS background so the GLSL liquid glass shader refracts cleanly'),
            });
            const transBtn = new Gtk.Button({
                label: _('Set Transparent'),
                valign: Gtk.Align.CENTER,
            });
            transBtn.connect('clicked', () => {
                this.sDock.set_value('background-color', new GLib.Variant('(dddd)', [0.0, 0.0, 0.0, 0.0]));
            });
            transRow.add_suffix(transBtn);
            groupDock.add(transRow);
        }
    }

    // ── 5. Top Bar ─────────────────────────────────────────────────────────
    _buildTopBarPage(window) {
        const page = new Adw.PreferencesPage({
            title: _('Top Bar'),
            icon_name: 'open-menu-symbolic',
        });
        window.add(page);

        const groupBar = new Adw.PreferencesGroup({
            title: _('Menu Bar Elements'),
            description: _('macOS layout structure for the GNOME top panel'),
        });
        page.add(groupBar);

        if (this.sLintel) {
            const sysRow = new Adw.SwitchRow({
                title: _('Apple / System Logo Menu'),
                subtitle: _('Show the distributor/Apple logo menu on the far left'),
            });
            this.sLintel.bind('show-system-menu', sysRow, 'active', Gio.SettingsBindFlags.DEFAULT);
            groupBar.add(sysRow);

            const appRow = new Adw.SwitchRow({
                title: _('Active Application Name'),
                subtitle: _('Display the focused app title in bold next to the system menu'),
            });
            this.sLintel.bind('show-active-app', appRow, 'active', Gio.SettingsBindFlags.DEFAULT);
            groupBar.add(appRow);

            const clockRightRow = new Adw.SwitchRow({
                title: _('Clock on Far Right'),
                subtitle: _('Position date and time on the right edge (macOS layout)'),
            });
            this.sLintel.bind('clock-on-right', clockRightRow, 'active', Gio.SettingsBindFlags.DEFAULT);
            groupBar.add(clockRightRow);

            const ncRow = new Adw.SwitchRow({
                title: _('Tahoe Notification Center on Clock Click'),
                subtitle: _('Slide in macOS widgets and notifications when clicking the clock'),
            });
            this.sLintel.bind('notification-center-enabled', ncRow, 'active', Gio.SettingsBindFlags.DEFAULT);
            groupBar.add(ncRow);

            const weekRow = new Adw.SwitchRow({
                title: _('Show Weekday in Clock'),
                subtitle: _('Include weekday abbreviation (e.g. Thu) in the menu bar clock'),
            });
            this.sLintel.bind('clock-show-weekday', weekRow, 'active', Gio.SettingsBindFlags.DEFAULT);
            groupBar.add(weekRow);

            const secRow = new Adw.SwitchRow({
                title: _('Show Seconds in Clock'),
                subtitle: _('Display seconds in clock time'),
            });
            this.sLintel.bind('clock-show-seconds', secRow, 'active', Gio.SettingsBindFlags.DEFAULT);
            groupBar.add(secRow);

            const fullRow = new Adw.SwitchRow({
                title: _('Fullscreen Reveal'),
                subtitle: _('Automatically reveal menu bar when pushing cursor against top screen edge'),
            });
            this.sLintel.bind('fullscreen-reveal', fullRow, 'active', Gio.SettingsBindFlags.DEFAULT);
            groupBar.add(fullRow);
        }
    }

    // ── 6. About ───────────────────────────────────────────────────────────
    _buildAboutPage(window) {
        const page = new Adw.PreferencesPage({
            title: _('About'),
            icon_name: 'help-about-symbolic',
        });
        window.add(page);

        const groupHero = new Adw.PreferencesGroup();
        page.add(groupHero);

        const heroBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 24,
            margin_bottom: 24,
            halign: Gtk.Align.CENTER,
        });

        const icon = new Gtk.Image({
            icon_name: 'fluid-glass-symbolic',
            pixel_size: 72,
        });
        heroBox.append(icon);

        const title = new Gtk.Label({
            label: 'Fluid Glass Suite',
            css_classes: ['title-1'],
        });
        const subtitle = new Gtk.Label({
            label: 'Unified macOS Tahoe Experience for GNOME Shell',
            css_classes: ['subtitle'],
        });
        const version = new Gtk.Label({
            label: 'Version 1.0.0',
            css_classes: ['caption'],
        });
        heroBox.append(title);
        heroBox.append(subtitle);
        heroBox.append(version);

        groupHero.add(heroBox);

        const groupInfo = new Adw.PreferencesGroup({
            title: _('Environment & System'),
        });
        page.add(groupInfo);

        const session = GLib.getenv('XDG_SESSION_TYPE') || 'wayland';
        groupInfo.add(new Adw.ActionRow({
            title: _('Windowing System'),
            subtitle: session.charAt(0).toUpperCase() + session.slice(1),
        }));

        groupInfo.add(new Adw.ActionRow({
            title: _('Extension UUID'),
            subtitle: EXTENSION_UUID,
        }));

        groupInfo.add(new Adw.ActionRow({
            title: _('License'),
            subtitle: 'GNU General Public License v3 or later (GPL-3.0-or-later)',
        }));
    }

    // ── Preset Handlers ────────────────────────────────────────────────────
    _applyPreset(presetId) {
        if (presetId === 'tahoe-crystal') {
            if (this.sGlass) {
                this.sGlass.set_int('dock-blur-radius', 10);
                this.sGlass.set_int('panel-menu-blur-radius', 10);
                this.sGlass.set_int('menu-blur-radius', 10);
                this.sGlass.set_double('dock-tint-strength', 0.12);
                this.sGlass.set_double('panel-menu-tint-strength', 0.12);
                this.sGlass.set_double('menu-tint-strength', 0.12);
                this.sGlass.set_double('dock-saturation', 1.5);
                this.sGlass.set_double('dock-brightness', 1.0);
            }
            if (this.sLintel)
                this.sLintel.set_string('control-center-mode', 'custom');
            this._setAccentColor('#007aff');
        } else if (presetId === 'deep-frosted') {
            if (this.sGlass) {
                this.sGlass.set_int('dock-blur-radius', 20);
                this.sGlass.set_int('panel-menu-blur-radius', 20);
                this.sGlass.set_int('menu-blur-radius', 20);
                this.sGlass.set_double('dock-tint-strength', 0.28);
                this.sGlass.set_double('panel-menu-tint-strength', 0.28);
                this.sGlass.set_double('menu-tint-strength', 0.28);
            }
            this._setAccentColor('#007aff');
        } else if (presetId === 'midnight-glass') {
            if (this.sGlass) {
                this.sGlass.set_int('dock-blur-radius', 12);
                this.sGlass.set_int('panel-menu-blur-radius', 12);
                this.sGlass.set_int('menu-blur-radius', 12);
                this.sGlass.set_double('dock-tint-strength', 0.08);
                this.sGlass.set_double('panel-menu-tint-strength', 0.08);
                this.sGlass.set_double('menu-tint-strength', 0.08);
                this.sGlass.set_double('dock-brightness', 0.85);
            }
            this._setAccentColor('#007aff');
        } else if (presetId === 'electric-neon') {
            if (this.sGlass) {
                this.sGlass.set_int('dock-blur-radius', 10);
                this.sGlass.set_int('panel-menu-blur-radius', 10);
                this.sGlass.set_int('menu-blur-radius', 10);
                this.sGlass.set_double('dock-tint-strength', 0.18);
                this.sGlass.set_double('panel-menu-tint-strength', 0.18);
                this.sGlass.set_double('menu-tint-strength', 0.18);
                this.sGlass.set_double('dock-saturation', 1.8);
            }
            this._setAccentColor('#00c6ff');
        }

        if (this.sMaster)
            this.sMaster.set_string('glass-preset', presetId);
    }

    _setAccentColor(hexCode) {
        if (this.sMaster)
            this.sMaster.set_string('accent-color', hexCode);
    }
}

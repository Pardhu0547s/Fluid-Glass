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
import {resolveAccentColor} from './distroColors.js';

const EXTENSION_UUID = 'fluid-glass@pardhu0547s.github.io';

const SCHEMA_MASTER = 'org.gnome.shell.extensions.fluid-glass';
const SCHEMA_TOPBAR = 'org.gnome.shell.extensions.fluid-glass.topbar';
const SCHEMA_GLASS = 'org.gnome.shell.extensions.fluid-glass.glass';
const SCHEMA_DOCK = 'org.gnome.shell.extensions.fluid-glass.dock';

const LEGACY_LINTEL = 'org.gnome.shell.extensions.lintel';
const LEGACY_GLASS = 'org.gnome.shell.extensions.liquid-glass@thinkingcoding1231.gmail.com';
const LEGACY_DOCK = 'org.gnome.shell.extensions.dash2dock-lite';

const ACCENT_COLORS = [
    ['Auto (Distro Default)', 'auto'],
    ['Blue', '#007aff'],
    ['Purple', '#af52de'],
    ['Green', '#34c759'],
    ['Orange', '#ff9500'],
    ['Red', '#ff3b30'],
    ['Graphite', '#545458'],
];

const DISTRO_ICONS_SYMBOLIC = [
    { id: 'fedora-logo-symbolic', name: 'Fedora' },
    { id: 'arch-logo-symbolic', name: 'Arch Linux' },
    { id: 'debian-logo-symbolic', name: 'Debian' },
    { id: 'ubuntu-logo-symbolic', name: 'Ubuntu' },
    { id: 'pop-os-logo-symbolic', name: 'Pop!_OS' },
    { id: 'manjaro-logo-symbolic', name: 'Manjaro' },
    { id: 'opensuse-logo-symbolic', name: 'openSUSE' },
    { id: 'tux-logo-symbolic', name: 'Linux Tux' },
    { id: 'nixos-logo-symbolic', name: 'NixOS' },
    { id: 'cachyos-logo-symbolic', name: 'CachyOS' },
    { id: 'endeavouros_logo-symbolic', name: 'EndeavourOS' },
    { id: 'redhat-logo-symbolic', name: 'Red Hat' },
    { id: 'centos-logo-symbolic', name: 'CentOS' },
    { id: 'rockylinux-logo-symbolic', name: 'Rocky Linux' },
    { id: 'almalinux-logo-symbolic', name: 'AlmaLinux' },
    { id: 'kali-linux-logo-symbolic', name: 'Kali Linux' },
    { id: 'gentoo-logo-symbolic', name: 'Gentoo' },
    { id: 'void-logo-symbolic', name: 'Void Linux' },
    { id: 'zorin-logo-symbolic', name: 'Zorin OS' },
    { id: 'nobara-logo-symbolic', name: 'Nobara' },
    { id: 'steam-deck-logo-symbolic', name: 'Steam Deck' },
    { id: 'ublue-logo-symbolic', name: 'Universal Blue' },
    { id: 'solus-logo-symbolic', name: 'Solus' },
    { id: 'raspbian-logo-symbolic', name: 'Raspberry Pi' },
    { id: 'pureos-logo-symbolic', name: 'PureOS' },
    { id: 'budgie-logo-symbolic', name: 'Budgie' },
    { id: 'garuda-logo-symbolic', name: 'Garuda' },
    { id: 'asahilinux-logo-symbolic', name: 'Asahi Linux' },
    { id: 'mx-logo-symbolic', name: 'MX Linux' },
    { id: 'freebsd-logo-symbolic', name: 'FreeBSD' },
    { id: 'voyager-logo-symbolic', name: 'Voyager' },
    { id: 'shastraos-logo-symbolic', name: 'Shastra OS' },
];

const DISTRO_ICONS_COLOURED = [
    { id: 'fedora-logo', name: 'Fedora' },
    { id: 'arch-logo', name: 'Arch Linux' },
    { id: 'debian-logo', name: 'Debian' },
    { id: 'ubuntu-logo', name: 'Ubuntu' },
    { id: 'pop-os-logo', name: 'Pop!_OS' },
    { id: 'manjaro-logo', name: 'Manjaro' },
    { id: 'opensuse-logo', name: 'openSUSE' },
    { id: 'tux-logo', name: 'Linux Tux' },
    { id: 'nixos-logo', name: 'NixOS' },
    { id: 'cachyos-logo', name: 'CachyOS' },
    { id: 'endeavouros_logo', name: 'EndeavourOS' },
    { id: 'redhat-logo', name: 'Red Hat' },
    { id: 'centos-logo', name: 'CentOS' },
    { id: 'rockylinux-logo', name: 'Rocky Linux' },
    { id: 'almalinux-logo', name: 'AlmaLinux' },
    { id: 'kali-linux-logo', name: 'Kali Linux' },
    { id: 'gentoo-logo', name: 'Gentoo' },
    { id: 'void-logo', name: 'Void Linux' },
    { id: 'zorin-logo', name: 'Zorin OS' },
    { id: 'bazzite-logo', name: 'Bazzite' },
    { id: 'steam-deck-logo', name: 'Steam Deck' },
    { id: 'steam-deck-le-logo', name: 'Steam Deck LE' },
    { id: 'ublue-logo', name: 'Universal Blue' },
    { id: 'solus-logo', name: 'Solus' },
    { id: 'gnome-logo', name: 'GNOME' },
    { id: 'clear-linux-logo', name: 'Clear Linux' },
    { id: 'vanilla-logo', name: 'Vanilla OS' },
    { id: 'freebsd-logo', name: 'FreeBSD' },
    { id: 'openbsd-logo', name: 'OpenBSD' },
    { id: 'netbsd-logo', name: 'NetBSD' },
    { id: 'asahilinux-logo', name: 'Asahi Linux' },
    { id: 'shastraos-logo', name: 'Shastra OS' },
];

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
        window.set_default_size(720, 780);
        window.set_search_enabled(true);

        const display = Gdk.Display.get_default();
        if (display) {
            try {
                const iconTheme = Gtk.IconTheme.get_for_display(display);
                const iconsPath = this.dir.get_child('icons').get_path();
                iconTheme.add_search_path(iconsPath);
                const distrosPath = this.dir.get_child('icons').get_child('distros').get_path();
                iconTheme.add_search_path(distrosPath);
            } catch (_e) {}
            this._installCss(display);
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

    // ── Helpers ────────────────────────────────────────────────────────────
    _installCss(display) {
        const css = `
            .fg-swatch {
                min-width: 24px;
                min-height: 24px;
                padding: 0;
                margin: 0;
                border-radius: 999px;
                border: none;
                box-shadow: inset 0 0 0 1px alpha(black, 0.15);
            }
            .fg-swatch:checked {
                outline: 2px solid @window_fg_color;
                outline-offset: 2px;
            }
            .fg-swatch-0 {
                background: linear-gradient(135deg, #007aff 0%, #ff9500 50%, #34c759 100%);
            }
            ${ACCENT_COLORS.slice(1).map((c, i) => `.fg-swatch-${i + 1} { background: ${c[1]}; }`).join('\n')}
            .fg-scale { min-width: 200px; }
            .fg-hero-title { font-size: 22pt; font-weight: 800; }
        `;
        try {
            const provider = new Gtk.CssProvider();
            if (provider.load_from_string)
                provider.load_from_string(css);
            else
                provider.load_from_data(css, -1);
            Gtk.StyleContext.add_provider_for_display(
                display, provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        } catch (_e) {}
    }

    _hasKey(settings, key) {
        try {
            return !!settings && settings.settings_schema.has_key(key);
        } catch (_e) {
            return false;
        }
    }

    _switchRow(group, settings, key, title, subtitle) {
        if (!this._hasKey(settings, key))
            return null;
        const row = new Adw.SwitchRow({title, subtitle});
        settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
        return row;
    }

    /**
     * A row with a fixed-width slider and a live value readout, so long
     * titles never get squeezed and the window never grows sideways.
     */
    _scaleRow(group, {title, subtitle, min, max, step, digits, value, onChange}) {
        const row = new Adw.ActionRow({title, subtitle});
        const scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, min, max, step);
        scale.set_draw_value(true);
        scale.set_value_pos(Gtk.PositionType.LEFT);
        scale.set_digits(digits);
        scale.set_valign(Gtk.Align.CENTER);
        scale.set_hexpand(false);
        scale.add_css_class('fg-scale');
        scale.set_value(value);
        scale.connect('value-changed', s => onChange(s.get_value()));
        row.add_suffix(scale);
        group.add(row);
        return row;
    }

    // ── 1. Presets & Overview ──────────────────────────────────────────────
    _buildPresetsPage(window) {
        const page = new Adw.PreferencesPage({
            name: 'general',
            title: _('General'),
            icon_name: 'fluid-glass-symbolic',
        });
        window.add(page);

        // Core Subsystems Toggles
        if (this.sMaster) {
            const groupSub = new Adw.PreferencesGroup({
                title: _('Components'),
                description: _('Choose which parts of Fluid Glass are active'),
            });
            page.add(groupSub);

            this._switchRow(groupSub, this.sMaster, 'enable-dock',
                _('Dock'), _('Magnifying dock with a liquid glass backdrop'));
            this._switchRow(groupSub, this.sMaster, 'enable-glass-shaders',
                _('Liquid Glass Shaders'), _('Real-time blur, refraction and specular rims'));
            this._switchRow(groupSub, this.sMaster, 'enable-topbar',
                _('Menu Bar'), _('macOS-style top bar with logo, app name and clock'));
            this._switchRow(groupSub, this.sMaster, 'enable-control-center',
                _('Control Center'), _('Tahoe-style floating glass modules'));
        }

        // Theme Presets — a radio list that shows which preset is active.
        const groupPresets = new Adw.PreferencesGroup({
            title: _('Theme Preset'),
            description: _('Sets blur, tint and accent on every glass surface at once'),
        });
        page.add(groupPresets);

        const presets = [
            ['tahoe-crystal', _('Tahoe Crystal'), _('Recommended · light frosted glass')],
            ['deep-frosted', _('Deep Frosted'), _('Heavier blur for bright or busy wallpapers')],
            ['midnight-glass', _('Midnight Obsidian'), _('Darker tint with luminous edges')],
            ['electric-neon', _('Electric Neon'), _('Vivid saturation with a cyan accent')],
        ];
        const currentPreset = this.sMaster?.get_string('glass-preset') ?? '';
        let firstCheck = null;
        for (const [id, title, subtitle] of presets) {
            const check = new Gtk.CheckButton({valign: Gtk.Align.CENTER});
            if (firstCheck)
                check.set_group(firstCheck);
            else
                firstCheck = check;
            check.set_active(id === currentPreset);
            check.connect('toggled', b => {
                if (b.get_active())
                    this._applyPreset(id);
            });
            const row = new Adw.ActionRow({title, subtitle, activatable_widget: check});
            row.add_prefix(check);
            groupPresets.add(row);
        }

        // Accent colour — compact round swatches instead of text buttons.
        const groupAccent = new Adw.PreferencesGroup({title: _('Accent')});
        page.add(groupAccent);

        const rowAcc = new Adw.ActionRow({
            title: _('Accent Color'),
            subtitle: _('Used for active toggles and highlights'),
        });
        groupAccent.add(rowAcc);

        const boxColors = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
            valign: Gtk.Align.CENTER,
            margin_start: 6,
        });
        const currentAccent = (this.sMaster?.get_string('accent-color') ?? 'auto').toLowerCase();
        let firstSwatch = null;
        ACCENT_COLORS.forEach(([name, hex], i) => {
            const btn = new Gtk.ToggleButton({
                tooltip_text: _(name),
                valign: Gtk.Align.CENTER,
                css_classes: ['fg-swatch', `fg-swatch-${i}`],
            });
            if (firstSwatch)
                btn.set_group(firstSwatch);
            else
                firstSwatch = btn;
            const isMatch = (hex === currentAccent) || (hex === 'auto' && (currentAccent === 'auto' || currentAccent === '' || currentAccent === 'system'));
            btn.set_active(isMatch);
            btn.connect('toggled', b => {
                if (b.get_active())
                    this._setAccentColor(hex);
            });
            boxColors.append(btn);
        });
        rowAcc.add_suffix(boxColors);

        const updateAccentSubtitle = () => {
            const val = (this.sMaster?.get_string('accent-color') ?? 'auto').toLowerCase();
            if (val === 'auto' || val === '' || val === 'system') {
                const resolved = resolveAccentColor(this.sMaster, this.sLintel);
                rowAcc.set_subtitle(_('System / Distro default (Auto: %s — Blue for Fedora, Orange for Ubuntu, Green for Manjaro)').format(resolved));
            } else {
                rowAcc.set_subtitle(_('Custom accent color: %s').format(val));
            }
        };
        updateAccentSubtitle();
        if (this.sMaster)
            this.sMaster.connect('changed::accent-color', updateAccentSubtitle);
        if (this.sLintel)
            this.sLintel.connect('changed::system-menu-icon', updateAccentSubtitle);

        // Maintenance Actions
        const groupActions = new Adw.PreferencesGroup({title: _('Maintenance')});
        page.add(groupActions);

        const reloadRow = new Adw.ActionRow({
            title: _('Reload Extension'),
            subtitle: _('Apply low-level compositor changes'),
        });
        const reloadBtn = new Gtk.Button({
            label: _('Reload'),
            valign: Gtk.Align.CENTER,
        });
        reloadBtn.connect('clicked', () => {
            try {
                GLib.spawn_command_line_async(
                    `sh -c "gnome-extensions disable ${EXTENSION_UUID}; sleep 1; gnome-extensions enable ${EXTENSION_UUID}"`);
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
            name: 'glass',
            title: _('Glass'),
            icon_name: 'image-adjust-shadows-symbolic',
        });
        window.add(page);

        if (this.sGlass) {
            const groupShaders = new Adw.PreferencesGroup({
                title: _('Material'),
                description: _('Applied to the dock, menus and Control Center'),
            });
            page.add(groupShaders);

            const setAll = (suffix, fn) => {
                for (const prefix of ['dock', 'panel-menu', 'menu', 'quick-settings', 'top-bar', 'notification', 'osd']) {
                    const key = `${prefix}-${suffix}`;
                    if (this._hasKey(this.sGlass, key))
                        fn(key);
                }
            };

            this._scaleRow(groupShaders, {
                title: _('Blur Radius'),
                subtitle: _('Backdrop blur strength (px)'),
                min: 4, max: 32, step: 1, digits: 0,
                value: this.sGlass.get_int('dock-blur-radius') || 10,
                onChange: v => setAll('blur-radius', k => this.sGlass.set_int(k, Math.round(v))),
            });
            this._scaleRow(groupShaders, {
                title: _('Tint Strength'),
                subtitle: _('Amount of white frost in the glass'),
                min: 0.04, max: 0.35, step: 0.01, digits: 2,
                value: this.sGlass.get_double('dock-tint-strength') || 0.12,
                onChange: v => setAll('tint-strength', k => this.sGlass.set_double(k, Number(v.toFixed(2)))),
            });
            this._scaleRow(groupShaders, {
                title: _('Saturation'),
                subtitle: _('Vibrancy of colors seen through the glass'),
                min: 1.0, max: 2.0, step: 0.05, digits: 2,
                value: this.sGlass.get_double('dock-saturation') || 1.5,
                onChange: v => setAll('saturation', k => this.sGlass.set_double(k, Number(v.toFixed(2)))),
            });
            this._scaleRow(groupShaders, {
                title: _('Corner Radius'),
                subtitle: _('Roundness of glass surfaces (px)'),
                min: 14, max: 36, step: 1, digits: 0,
                value: this.sGlass.get_double('dock-corner-radius') || 26.0,
                onChange: v => setAll('corner-radius', k => this.sGlass.set_double(k, Math.round(v))),
            });

            const groupTargets = new Adw.PreferencesGroup({
                title: _('Surfaces'),
                description: _('Where the liquid glass effect is drawn'),
            });
            page.add(groupTargets);

            const targets = [
                ['enable-dock-glass', _('Dock'), null],
                ['enable-extra-menu-glass', _('Panel Menus'), _('Wi-Fi, Bluetooth, Battery and other indicators')],
                ['enable-menu-glass', _('Calendar'), null],
                ['enable-desktop-menu-glass', _('Desktop Context Menu'), null],
                ['enable-notification-glass', _('Notifications'), null],
                ['enable-osd-glass', _('Volume & Brightness OSD'), null],
                ['enable-application-glass', _('Application Windows'), _('Supported translucent apps only')],
            ];
            for (const [key, title, subtitle] of targets)
                this._switchRow(groupTargets, this.sGlass, key, title, subtitle);
        }

        if (this.sLintel) {
            const groupMenu = new Adw.PreferencesGroup({
                title: _('Top Bar Quick Adjust'),
                description: _('Quick access menu in the top bar to adjust glass settings live'),
            });
            page.add(groupMenu);

            this._switchRow(groupMenu, this.sLintel, 'show-fluid-glass-menu',
                _('Show in Top Bar'),
                _('Add a Fluid Glass status icon to the top bar with live sliders and presets'));
        }
    }

    // ── 3. Control Center ──────────────────────────────────────────────────
    _buildControlCenterPage(window) {
        const page = new Adw.PreferencesPage({
            name: 'cc',
            title: _('Control Center'),
            icon_name: 'control-center-symbolic',
        });
        window.add(page);

        if (!this.sLintel)
            return;

        const groupCC = new Adw.PreferencesGroup({title: _('Control Center')});
        page.add(groupCC);

        const modeRow = new Adw.ComboRow({
            title: _('Style'),
            subtitle: _('Tahoe modules or the standard GNOME Quick Settings'),
            model: Gtk.StringList.new([_('Tahoe'), _('GNOME')]),
        });
        modeRow.set_selected(this.sLintel.get_string('control-center-mode') === 'custom' ? 0 : 1);
        modeRow.connect('notify::selected', () => {
            this.sLintel.set_string('control-center-mode', modeRow.get_selected() === 0 ? 'custom' : 'native');
        });
        groupCC.add(modeRow);

        const backGlassRow = this._switchRow(groupCC, this.sLintel, 'control-center-back-glass',
            _('Background Glass Card'),
            _('Wrap all modules in one frosted card instead of floating them'));
        const syncSensitive = () => {
            if (backGlassRow)
                backGlassRow.set_sensitive(modeRow.get_selected() === 0);
        };
        modeRow.connect('notify::selected', syncSensitive);
        syncSensitive();

        const groupHint = new Adw.PreferencesGroup({
            title: _('Layout'),
        });
        page.add(groupHint);
        const hintRow = new Adw.ActionRow({
            title: _('Rearrange Modules'),
            subtitle: _('Open the Control Center and click “Edit Controls” to add, remove, resize or reorder modules'),
        });
        hintRow.add_prefix(new Gtk.Image({icon_name: 'view-grid-symbolic', valign: Gtk.Align.CENTER}));
        groupHint.add(hintRow);
    }

    // ── 4. Fluid Dock ──────────────────────────────────────────────────────
    _buildDockPage(window) {
        const page = new Adw.PreferencesPage({
            name: 'dock',
            title: _('Dock'),
            icon_name: 'dock-bottom-symbolic',
        });
        window.add(page);

        if (!this.sDock)
            return;

        const groupDock = new Adw.PreferencesGroup({title: _('Behavior')});
        page.add(groupDock);

        this._scaleRow(groupDock, {
            title: _('Magnification'),
            subtitle: _('Zoom applied to icons under the pointer'),
            min: 0.0, max: 0.60, step: 0.05, digits: 2,
            value: this.sDock.get_double('animation-magnify'),
            onChange: v => this.sDock.set_double('animation-magnify', Number(v.toFixed(2))),
        });
        const hideRow = this._switchRow(groupDock, this.sDock, 'autohide-dash',
            _('Auto-hide'), _('Slide the dock away when not in use'));
        const dodgeRow = this._switchRow(groupDock, this.sDock, 'autohide-dodge',
            _('Hide Only When Overlapped'), _('Hide only when a window covers the dock'));
        if (hideRow && dodgeRow)
            hideRow.bind_property('active', dodgeRow, 'sensitive', 2 /* SYNC_CREATE */);

        const groupLook = new Adw.PreferencesGroup({title: _('Appearance')});
        page.add(groupLook);
        const transRow = new Adw.ActionRow({
            title: _('Transparent Background'),
            subtitle: _('Remove the solid dock fill so only the glass shows'),
        });
        const transBtn = new Gtk.Button({
            label: _('Apply'),
            valign: Gtk.Align.CENTER,
        });
        transBtn.connect('clicked', () => {
            this.sDock.set_value('background-color', new GLib.Variant('(dddd)', [0.0, 0.0, 0.0, 0.0]));
        });
        transRow.add_suffix(transBtn);
        groupLook.add(transRow);
    }

    // ── 5. Top Bar ─────────────────────────────────────────────────────────
    _buildTopBarPage(window) {
        const page = new Adw.PreferencesPage({
            name: 'menubar',
            title: _('Menu Bar'),
            icon_name: 'open-menu-symbolic',
        });
        window.add(page);

        if (!this.sLintel)
            return;

        const groupBar = new Adw.PreferencesGroup({title: _('Layout')});
        page.add(groupBar);
        this._switchRow(groupBar, this.sLintel, 'show-system-menu',
            _('System Logo Menu'), _('Logo menu on the far left'));
        this._switchRow(groupBar, this.sLintel, 'show-active-app',
            _('Active App Name'), _('Focused app title next to the logo'));
        this._switchRow(groupBar, this.sLintel, 'notification-center-enabled',
            _('Notification Center'), _('Open widgets and notifications from the clock'));
        this._switchRow(groupBar, this.sLintel, 'fullscreen-reveal',
            _('Reveal in Fullscreen'), _('Show the bar when the pointer hits the top edge'));

        this._buildLogoIconPicker(page);

        const groupClock = new Adw.PreferencesGroup({title: _('Clock')});
        page.add(groupClock);
        this._switchRow(groupClock, this.sLintel, 'clock-on-right',
            _('Clock on Right'), null);
        this._switchRow(groupClock, this.sLintel, 'clock-show-weekday',
            _('Show Weekday'), null);
        this._switchRow(groupClock, this.sLintel, 'clock-show-seconds',
            _('Show Seconds'), null);
    }

    _formatLogoSubtitle(val) {
        if (!val)
            return _('System Default (Auto-detected)');
        const sym = DISTRO_ICONS_SYMBOLIC.find(d => d.id === val);
        if (sym)
            return `${sym.name} (Symbolic)`;
        const col = DISTRO_ICONS_COLOURED.find(d => d.id === val);
        if (col)
            return `${col.name} (Coloured)`;
        return val;
    }

    _updateLogoPreview(img, val) {
        if (!val) {
            img.set_from_icon_name('start-here-symbolic');
        } else if (val.startsWith('/') || val.startsWith('~') || val.startsWith('file:')) {
            const path = val.startsWith('~')
                ? GLib.build_filenamev([GLib.get_home_dir(), val.slice(1)])
                : (val.startsWith('file://') ? val.slice(7) : val);
            const file = Gio.File.new_for_path(path);
            img.set_from_gicon(Gio.FileIcon.new(file));
        } else {
            const cleanName = val.endsWith('.svg') ? val.slice(0, -4) : val;
            const iconsDir = this.dir.get_child('icons');
            const distrosDir = iconsDir.get_child('distros');
            let distroFile = iconsDir.get_child(`${cleanName}.svg`);
            if (!distroFile.query_exists(null))
                distroFile = distrosDir.get_child(`${cleanName}.svg`);
            if (!distroFile.query_exists(null))
                distroFile = iconsDir.get_child(`${cleanName}-logo-symbolic.svg`);
            if (!distroFile.query_exists(null))
                distroFile = distrosDir.get_child(`${cleanName}-logo-symbolic.svg`);
            if (!distroFile.query_exists(null))
                distroFile = iconsDir.get_child(`${cleanName}-logo.svg`);
            if (!distroFile.query_exists(null))
                distroFile = distrosDir.get_child(`${cleanName}-logo.svg`);

            if (distroFile.query_exists(null)) {
                img.set_from_gicon(Gio.FileIcon.new(distroFile));
            } else {
                img.set_from_icon_name(val);
            }
        }
    }

    _buildLogoIconPicker(page) {
        if (!this.sLintel)
            return;

        const groupLogo = new Adw.PreferencesGroup({
            title: _('System Menu Logo'),
            description: _('Select an icon from popular Linux distributions or use your system default'),
        });
        page.add(groupLogo);

        const currentVal = this.sLintel.get_string('system-menu-icon');
        const previewRow = new Adw.ActionRow({
            title: _('Current Logo'),
            subtitle: this._formatLogoSubtitle(currentVal),
        });
        groupLogo.add(previewRow);

        const previewImg = new Gtk.Image({
            pixel_size: 32,
        });
        this._updateLogoPreview(previewImg, currentVal);
        previewRow.add_prefix(previewImg);

        const resetBtn = new Gtk.Button({
            label: _('Reset to Default'),
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        resetBtn.connect('clicked', () => {
            this.sLintel.set_string('system-menu-icon', '');
        });
        previewRow.add_suffix(resetBtn);

        const allDistroButtons = new Map();

        const updateActiveDistro = (activeId) => {
            for (const [id, b] of allDistroButtons) {
                if (id === activeId)
                    b.add_css_class('suggested-action');
                else
                    b.remove_css_class('suggested-action');
            }
        };

        // 1. Symbolic Icons Expander
        const expanderSymbolic = new Adw.ExpanderRow({
            title: _('Symbolic Distribution Icons'),
            subtitle: _('Monochrome icons that adapt to top bar text styling'),
        });
        groupLogo.add(expanderSymbolic);

        const symFlow = new Gtk.FlowBox({
            row_spacing: 8,
            column_spacing: 8,
            max_children_per_line: 8,
            selection_mode: Gtk.SelectionMode.NONE,
            margin_top: 10,
            margin_bottom: 10,
            margin_start: 10,
            margin_end: 10,
            valign: Gtk.Align.START,
            halign: Gtk.Align.CENTER,
        });
        DISTRO_ICONS_SYMBOLIC.forEach(distro => {
            const btn = new Gtk.Button({
                tooltip_text: distro.name,
                css_classes: ['flat'],
            });
            let file = this.dir.get_child('icons').get_child(`${distro.id}.svg`);
            if (!file.query_exists(null))
                file = this.dir.get_child('icons').get_child('distros').get_child(`${distro.id}.svg`);
            const img = new Gtk.Image({
                pixel_size: 28,
            });
            if (file.query_exists(null))
                img.set_from_gicon(Gio.FileIcon.new(file));
            else
                img.set_from_icon_name(distro.id);

            btn.set_child(img);
            if (distro.id === currentVal)
                btn.add_css_class('suggested-action');

            btn.connect('clicked', () => {
                this.sLintel.set_string('system-menu-icon', distro.id);
            });
            allDistroButtons.set(distro.id, btn);
            symFlow.append(btn);
        });
        const symPrefRow = new Adw.PreferencesRow();
        symPrefRow.set_child(symFlow);
        expanderSymbolic.add_row(symPrefRow);

        // 2. Coloured Icons Expander
        const expanderColoured = new Adw.ExpanderRow({
            title: _('Coloured Distribution Icons'),
            subtitle: _('Full-colour original distribution artwork'),
        });
        groupLogo.add(expanderColoured);

        const colFlow = new Gtk.FlowBox({
            row_spacing: 8,
            column_spacing: 8,
            max_children_per_line: 8,
            selection_mode: Gtk.SelectionMode.NONE,
            margin_top: 10,
            margin_bottom: 10,
            margin_start: 10,
            margin_end: 10,
            valign: Gtk.Align.START,
            halign: Gtk.Align.CENTER,
        });
        DISTRO_ICONS_COLOURED.forEach(distro => {
            const btn = new Gtk.Button({
                tooltip_text: distro.name,
                css_classes: ['flat'],
            });
            let file = this.dir.get_child('icons').get_child(`${distro.id}.svg`);
            if (!file.query_exists(null))
                file = this.dir.get_child('icons').get_child('distros').get_child(`${distro.id}.svg`);
            const img = new Gtk.Image({
                pixel_size: 28,
            });
            if (file.query_exists(null))
                img.set_from_gicon(Gio.FileIcon.new(file));
            else
                img.set_from_icon_name(distro.id);

            btn.set_child(img);
            if (distro.id === currentVal)
                btn.add_css_class('suggested-action');

            btn.connect('clicked', () => {
                this.sLintel.set_string('system-menu-icon', distro.id);
            });
            allDistroButtons.set(distro.id, btn);
            colFlow.append(btn);
        });
        const colPrefRow = new Adw.PreferencesRow();
        colPrefRow.set_child(colFlow);
        expanderColoured.add_row(colPrefRow);

        // 3. Custom icon or emoji entry
        const customEntry = new Adw.EntryRow({
            title: _('Custom Icon, Emoji, or File Path'),
            text: currentVal,
        });
        customEntry.connect('apply', () => {
            this.sLintel.set_string('system-menu-icon', customEntry.get_text().trim());
        });
        customEntry.connect('entry-activated', () => {
            this.sLintel.set_string('system-menu-icon', customEntry.get_text().trim());
        });
        groupLogo.add(customEntry);

        this.sLintel.connect('changed::system-menu-icon', () => {
            const val = this.sLintel.get_string('system-menu-icon');
            previewRow.set_subtitle(this._formatLogoSubtitle(val));
            this._updateLogoPreview(previewImg, val);
            updateActiveDistro(val);
            if (customEntry.get_text() !== val)
                customEntry.set_text(val);
        });
    }

    // ── 6. About ───────────────────────────────────────────────────────────
    _buildAboutPage(window) {
        const page = new Adw.PreferencesPage({
            name: 'about',
            title: _('About'),
            icon_name: 'help-about-symbolic',
        });
        window.add(page);

        const groupHero = new Adw.PreferencesGroup();
        page.add(groupHero);

        const heroBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 18,
            margin_bottom: 18,
            halign: Gtk.Align.CENTER,
        });
        const iconFile = this.dir.get_child('icons').get_child('fluid-glass-symbolic.svg');
        const heroImg = iconFile.query_exists(null)
            ? Gtk.Image.new_from_file(iconFile.get_path())
            : new Gtk.Image({icon_name: 'fluid-glass-symbolic'});
        heroImg.set_pixel_size(96);
        heroImg.set_margin_bottom(6);
        heroBox.append(heroImg);
        heroBox.append(new Gtk.Label({
            label: 'Fluid Glass',
            css_classes: ['fg-hero-title'],
        }));
        heroBox.append(new Gtk.Label({
            label: _('macOS Tahoe Liquid Glass for GNOME Shell'),
            css_classes: ['dim-label'],
        }));
        const version = this.metadata?.['version-name'] ?? this.metadata?.version ?? '1.0.0';
        heroBox.append(new Gtk.Label({
            label: _('Version %s').format(version),
            css_classes: ['caption', 'dim-label'],
        }));
        groupHero.add(heroBox);

        const groupInfo = new Adw.PreferencesGroup({title: _('System')});
        page.add(groupInfo);

        const session = GLib.getenv('XDG_SESSION_TYPE') || 'wayland';
        const infoRows = [
            [_('Session'), session.charAt(0).toUpperCase() + session.slice(1)],
            [_('Extension ID'), EXTENSION_UUID],
            [_('License'), 'GPL-3.0-or-later'],
        ];
        for (const [title, subtitle] of infoRows) {
            groupInfo.add(new Adw.ActionRow({
                title,
                subtitle,
                subtitle_selectable: true,
                css_classes: ['property'],
            }));
        }
    }

    // ── Preset Handlers ────────────────────────────────────────────────────
    _applyPreset(presetId) {
        const setGlass = (suffix, val, isInt = false) => {
            if (!this.sGlass)
                return;
            for (const prefix of ['dock', 'panel-menu', 'menu', 'quick-settings', 'top-bar', 'notification', 'osd']) {
                const key = `${prefix}-${suffix}`;
                if (this._hasKey(this.sGlass, key)) {
                    if (isInt)
                        this.sGlass.set_int(key, val);
                    else
                        this.sGlass.set_double(key, val);
                }
            }
        };

        const curAcc = (this.sMaster?.get_string('accent-color') ?? 'auto').toLowerCase();
        const keepAuto = curAcc === 'auto' || curAcc === '' || curAcc === 'system';

        if (presetId === 'tahoe-crystal') {
            setGlass('blur-radius', 10, true);
            setGlass('tint-strength', 0.12);
            setGlass('saturation', 1.5);
            setGlass('brightness', 1.0);
            if (this.sLintel)
                this.sLintel.set_string('control-center-mode', 'custom');
            if (!keepAuto)
                this._setAccentColor('#007aff');
        } else if (presetId === 'deep-frosted') {
            setGlass('blur-radius', 20, true);
            setGlass('tint-strength', 0.28);
            setGlass('saturation', 1.4);
            setGlass('brightness', 1.0);
            if (!keepAuto)
                this._setAccentColor('#007aff');
        } else if (presetId === 'midnight-glass') {
            setGlass('blur-radius', 12, true);
            setGlass('tint-strength', 0.08);
            setGlass('saturation', 1.3);
            setGlass('brightness', 0.85);
            if (!keepAuto)
                this._setAccentColor('#007aff');
        } else if (presetId === 'electric-neon') {
            setGlass('blur-radius', 10, true);
            setGlass('tint-strength', 0.18);
            setGlass('saturation', 1.8);
            setGlass('brightness', 1.05);
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

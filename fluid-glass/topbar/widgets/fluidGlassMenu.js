// SPDX-License-Identifier: GPL-2.0-or-later
//
// LintelFluidGlassMenu — Tahoe-style menu-bar status item for live Fluid Glass adjustment.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';

import {_} from '../i18n.js';
import {styleStatusMenu} from './statusMenu.js';

const PRESETS = [
    {
        id: 'tahoe-crystal',
        title: _('Tahoe Crystal'),
        blur: 10,
        tint: 0.12,
        sat: 1.5,
        bright: 1.0,
        accent: '#007aff',
    },
    {
        id: 'deep-frosted',
        title: _('Deep Frosted'),
        blur: 20,
        tint: 0.28,
        sat: 1.5,
        bright: 1.0,
        accent: '#007aff',
    },
    {
        id: 'midnight-glass',
        title: _('Midnight Obsidian'),
        blur: 12,
        tint: 0.08,
        sat: 1.5,
        bright: 0.85,
        accent: '#007aff',
    },
    {
        id: 'electric-neon',
        title: _('Electric Neon'),
        blur: 10,
        tint: 0.18,
        sat: 1.8,
        bright: 1.0,
        accent: '#00c6ff',
    },
];

class SliderItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    _init(title, min, max, initialValue, formatFn, onValueChanged) {
        super._init({
            activate: false,
            hover: false,
            can_focus: false,
            style_class: 'lintel-fg-slider-item',
        });

        this._min = min;
        this._max = max;
        this._formatFn = formatFn;
        this._onValueChanged = onValueChanged;
        this._updating = false;

        const box = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });

        const header = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            x_expand: true,
            style_class: 'lintel-fg-slider-header',
        });

        const label = new St.Label({
            text: title,
            x_expand: true,
            style_class: 'lintel-fg-slider-title',
        });
        this._valLabel = new St.Label({
            text: formatFn(initialValue),
            style_class: 'lintel-fg-slider-val',
        });
        header.add_child(label);
        header.add_child(this._valLabel);
        box.add_child(header);

        const norm = (initialValue - min) / (max - min);
        this._slider = new Slider.Slider(Math.max(0, Math.min(1, norm)));
        this._slider.add_style_class_name('lintel-fg-track');
        this._slider.x_expand = true;
        this._slider.x_align = Clutter.ActorAlign.FILL;

        this._slider.connect('notify::value', () => {
            if (this._updating)
                return;
            const currentVal = this._min + this._slider.value * (this._max - this._min);
            this._valLabel.text = this._formatFn(currentVal);
            this._onValueChanged(currentVal);
        });

        box.add_child(this._slider);
        this.add_child(box);
    }

    setValue(val) {
        this._updating = true;
        const norm = (val - this._min) / (this._max - this._min);
        this._slider.value = Math.max(0, Math.min(1, norm));
        this._valLabel.text = this._formatFn(val);
        this._updating = false;
    }
}

export const LintelFluidGlassMenu = GObject.registerClass({
    GTypeName: 'FluidGlass_LintelFluidGlassMenu',
}, class LintelFluidGlassMenu extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, _('Fluid Glass'), false);
        this.add_style_class_name('lintel-status-button');
        this._extension = extension;
        this._disposed = false;
        this._settingsIds = [];

        try {
            this._glassSettings = extension?.getGlassSettings?.() ?? null;
        } catch (_e) {
            this._glassSettings = null;
        }

        try {
            this._masterSettings = extension?.getSettings?.('org.gnome.shell.extensions.fluid-glass') ?? null;
        } catch (_e) {
            this._masterSettings = null;
        }

        // Panel Icon
        const iconFile = Gio.File.new_for_path(GLib.build_filenamev([
            extension.path, 'icons', 'fluid-glass-symbolic.svg',
        ]));
        this._panelIcon = new St.Icon({
            style_class: 'system-status-icon',
            gicon: new Gio.FileIcon({file: iconFile}),
        });
        this.add_child(this._panelIcon);

        styleStatusMenu(this.menu, 'lintel-fluid-glass-menu-content');
        this._buildMenu();
        this._bindSettings();
    }

    _buildMenu() {
        // 1. Master Toggle
        const isEnabled = this._masterSettings?.get_boolean('enable-glass-shaders') ?? true;
        this._toggle = new PopupMenu.PopupSwitchMenuItem(_('Liquid Glass'), isEnabled);
        this._toggle.add_style_class_name('lintel-status-toggle');
        this._toggle.connect('toggled', (_item, state) => {
            if (this._masterSettings)
                this._masterSettings.set_boolean('enable-glass-shaders', state);
        });
        this.menu.addMenuItem(this._toggle);

        // 2. Material Sliders
        const matHeader = new PopupMenu.PopupMenuItem(_('Material Adjustments'), {
            reactive: false,
            can_focus: false,
        });
        matHeader.add_style_class_name('lintel-status-section-title');
        this.menu.addMenuItem(matHeader);

        const currentBlur = this._glassSettings?.get_int('dock-blur-radius') || 10;
        this._blurSlider = new SliderItem(
            _('Blur Radius'),
            4, 32,
            currentBlur,
            v => `${Math.round(v)}px`,
            v => {
                const val = Math.round(v);
                this._setGlassInt('blur-radius', val);
            }
        );
        this.menu.addMenuItem(this._blurSlider);

        const currentTint = this._glassSettings?.get_double('dock-tint-strength') || 0.12;
        this._tintSlider = new SliderItem(
            _('Tint Strength'),
            0.04, 0.35,
            currentTint,
            v => `${Math.round(v * 100)}%`,
            v => {
                const val = Number(v.toFixed(2));
                this._setGlassDouble('tint-strength', val);
            }
        );
        this.menu.addMenuItem(this._tintSlider);

        const currentSat = this._glassSettings?.get_double('dock-saturation') || 1.5;
        this._satSlider = new SliderItem(
            _('Saturation'),
            1.0, 2.0,
            currentSat,
            v => `${v.toFixed(2)}×`,
            v => {
                const val = Number(v.toFixed(2));
                this._setGlassDouble('saturation', val);
            }
        );
        this.menu.addMenuItem(this._satSlider);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 3. Presets
        const presetHeader = new PopupMenu.PopupMenuItem(_('Presets'), {
            reactive: false,
            can_focus: false,
        });
        presetHeader.add_style_class_name('lintel-status-section-title');
        this.menu.addMenuItem(presetHeader);

        this._presetItems = new Map();
        const activePreset = this._masterSettings?.get_string('glass-preset') ?? 'tahoe-crystal';

        for (const preset of PRESETS) {
            const item = new PopupMenu.PopupMenuItem(preset.title);
            item.setOrnament(preset.id === activePreset
                ? PopupMenu.Ornament.CHECK
                : PopupMenu.Ornament.NONE);
            item.connect('activate', () => {
                this._applyPreset(preset);
            });
            this._presetItems.set(preset.id, item);
            this.menu.addMenuItem(item);
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 4. Preferences Link
        const prefsItem = new PopupMenu.PopupMenuItem(_('Fluid Glass Settings…'));
        prefsItem.connect('activate', () => {
            this.menu.close();
            if (typeof this._extension?.openPreferences === 'function') {
                this._extension.openPreferences();
            } else {
                try {
                    GLib.spawn_command_line_async('gnome-extensions prefs fluid-glass@pardhu0547s.github.io');
                } catch (e) {
                    logError(e, 'lintel: openPreferences');
                }
            }
        });
        this.menu.addMenuItem(prefsItem);
    }

    _setGlassInt(suffix, val) {
        if (!this._glassSettings)
            return;
        for (const prefix of ['dock', 'panel-menu', 'menu']) {
            const k = `${prefix}-${suffix}`;
            if (this._glassSettings.settings_schema.has_key(k))
                this._glassSettings.set_int(k, val);
        }
    }

    _setGlassDouble(suffix, val) {
        if (!this._glassSettings)
            return;
        for (const prefix of ['dock', 'panel-menu', 'menu']) {
            const k = `${prefix}-${suffix}`;
            if (this._glassSettings.settings_schema.has_key(k))
                this._glassSettings.set_double(k, val);
        }
    }

    _applyPreset(preset) {
        this._setGlassInt('blur-radius', preset.blur);
        this._setGlassDouble('tint-strength', preset.tint);
        this._setGlassDouble('saturation', preset.sat);
        this._setGlassDouble('brightness', preset.bright);
        if (this._masterSettings) {
            this._masterSettings.set_string('glass-preset', preset.id);
            this._masterSettings.set_string('accent-color', preset.accent);
        }
        this._syncPresets(preset.id);
    }

    _syncPresets(activeId) {
        for (const [id, item] of this._presetItems) {
            item.setOrnament(id === activeId
                ? PopupMenu.Ornament.CHECK
                : PopupMenu.Ornament.NONE);
        }
    }

    _bindSettings() {
        if (this._masterSettings) {
            this._settingsIds.push(
                this._masterSettings.connect('changed::enable-glass-shaders', () => {
                    const en = this._masterSettings.get_boolean('enable-glass-shaders');
                    this._toggle.setToggleState(en);
                }),
                this._masterSettings.connect('changed::glass-preset', () => {
                    const preset = this._masterSettings.get_string('glass-preset');
                    this._syncPresets(preset);
                })
            );
        }

        if (this._glassSettings) {
            this._settingsIds.push(
                this._glassSettings.connect('changed::dock-blur-radius', () => {
                    this._blurSlider.setValue(this._glassSettings.get_int('dock-blur-radius'));
                }),
                this._glassSettings.connect('changed::dock-tint-strength', () => {
                    this._tintSlider.setValue(this._glassSettings.get_double('dock-tint-strength'));
                }),
                this._glassSettings.connect('changed::dock-saturation', () => {
                    this._satSlider.setValue(this._glassSettings.get_double('dock-saturation'));
                })
            );
        }
    }

    destroy() {
        this._disposed = true;
        for (const id of this._settingsIds) {
            try { this._masterSettings?.disconnect(id); } catch (_e) {}
            try { this._glassSettings?.disconnect(id); } catch (_e) {}
        }
        this._settingsIds = [];
        this._presetItems.clear();
        this._glassSettings = null;
        this._masterSettings = null;
        this._extension = null;
        super.destroy();
    }
});

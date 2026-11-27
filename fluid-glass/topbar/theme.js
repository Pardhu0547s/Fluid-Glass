import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {sanitizeFontFamily, sanitizeFontWeight} from './cssValues.js';
import {resolveAccentColor} from '../distroColors.js';
import {
    captureLuminanceStrip,
    decideUseDarkText,
    isHighContrast,
    subscribeContrastEvents,
} from '../glass/contrastSampler.js';

const FILE_NAME = 'fluid-glass-dynamic.css';
const OVERVIEW_CLASS = 'fluid-glass-overview-transparent';

const clamp01 = v => Math.max(0, Math.min(1, v));

export class ThemeManager {
    constructor(extension) {
        this._extension = extension;
        this._enabled = false;
        this._settings = null;
        this._settingsId = 0;
        this._glassSettings = null;
        this._glassSettingsId = 0;
        this._masterSettings = null;
        this._masterSettingsId = 0;
        this._desktop = null;
        this._desktopId = 0;
        this._desktopAccentId = 0;
        this._background = null;
        this._backgroundId = 0;
        this._fullscreenId = 0;
        this._monitorsId = 0;
        this._contrastId = 0;
        this._contrastSerial = 0;
        this._autoTextIsDark = null;
        this._unsubscribeContrast = null;
        this._themeContext = null;
        this._themeChangedId = 0;
        this._overviewShowingId = 0;
        this._overviewHidingId = 0;
        this._file = null;
        this._loaded = false;
        this._applying = false;
        this._lastCss = null;
    }

    enable() {
        if (this._enabled)
            return;
        this._enabled = true;

        try {
            this._settings = this._extension?.getSettings?.() ?? null;
        } catch (_e) {
            this._settings = null;
        }
        if (this._settings) {
            this._settingsId = this._settings.connect('changed', () => {
                this._rebuild();
                this.requestContrastUpdate();
            });
        }

        try {
            this._glassSettings = this._extension?.getGlassSettings?.() ?? null;
        } catch (_e) {
            this._glassSettings = null;
        }
        if (this._glassSettings?.settings_schema?.has_key('top-bar-enable-adaptive-text-color')) {
            this._glassSettingsId = this._glassSettings.connect(
                'changed::top-bar-enable-adaptive-text-color', () => {
                    this._autoTextIsDark = null;
                    this._rebuild();
                    this.requestContrastUpdate(80);
                });
        }

        try {
            this._masterSettings = this._extension?.getMasterSettings?.() ?? null;
        } catch (_e) {
            this._masterSettings = null;
        }
        if (this._masterSettings) {
            this._masterSettingsId = this._masterSettings.connect(
                'changed::accent-color', () => this._rebuild());
        }

        this._desktop = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._desktopId = this._desktop.connect(
            'changed::color-scheme', () => {
                this._autoTextIsDark = null;
                this._rebuild();
                this.requestContrastUpdate(80);
            });
        this._desktopAccentId = this._desktop.connect(
            'changed::accent-color', () => {
                this._rebuild();
            });
        this._desktopGtkThemeId = this._desktop.connect(
            'changed::gtk-theme', () => {
                this._rebuild();
            });

        this._background = new Gio.Settings({
            schema_id: 'org.gnome.desktop.background',
        });
        this._backgroundId = this._background.connect(
            'changed', () => this.requestContrastUpdate(600));

        this._fullscreenId = global.display.connect(
            'in-fullscreen-changed', () => this.requestContrastUpdate(200));
        this._monitorsId = Main.layoutManager.connect(
            'monitors-changed', () => this.requestContrastUpdate(200));

        this._unsubscribeContrast = subscribeContrastEvents((reason) => {
            if (reason === 'theme')
                this._autoTextIsDark = null;
            this.requestContrastUpdate(reason === 'theme' ? 60 : 180);
        });

        this._themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._themeChangedId = this._themeContext.connect('changed', () => {
            if (!this._applying)
                this._reload();
        });

        this._overviewShowingId = Main.overview.connect('showing', () => {
            this._setOverview(true);
            this.requestContrastUpdate(300);
        });
        this._overviewHidingId = Main.overview.connect('hiding', () => {
            this._setOverview(false);
            this.requestContrastUpdate(300);
        });

        const dir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'lintel']);
        GLib.mkdir_with_parents(dir, 0o755);
        this._file = Gio.File.new_for_path(GLib.build_filenamev([dir, FILE_NAME]));

        this._rebuild();
        this._setOverview(Main.overview.visible);
        this.requestContrastUpdate(250);
    }

    _rebuild() {
        const css = this._generate();
        if (css === this._lastCss && this._loaded)
            return;
        try {
            const bytes = new TextEncoder().encode(css);
            this._file.replace_contents(
                bytes, null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (e) {
            logError(e, 'fluid-glass: writing dynamic stylesheet');
            return;
        }
        this._lastCss = css;
        this._reload();
    }

    _reload() {
        const theme = this._themeContext?.get_theme();
        if (!theme || !this._file)
            return;
        this._applying = true;
        try {
            if (this._loaded)
                theme.unload_stylesheet(this._file);
            theme.load_stylesheet(this._file);
            this._loaded = true;
        } catch (e) {
            logError(e, 'fluid-glass: loading dynamic stylesheet');
        } finally {
            this._applying = false;
        }
    }

    requestContrastUpdate(delay = 180) {
        if (!this._enabled)
            return;
        this._contrastSerial++;
        if (this._contrastId) {
            GLib.Source.remove(this._contrastId);
            this._contrastId = 0;
        }
        if (!this._usesAdaptiveContrast())
            return;

        this._contrastId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, Math.max(0, delay), () => {
                this._contrastId = 0;
                this._sampleContrast().catch(e =>
                    logError(e, 'fluid-glass: sampling panel contrast'));
                return GLib.SOURCE_REMOVE;
            });
    }

    _settingString(key, fallback) {
        try {
            return this._settings ? this._settings.get_string(key) : fallback;
        } catch (_e) {
            return fallback;
        }
    }

    _panelIsTransparentNow() {
        if (this._settingString('appearance', 'tahoe-transparent') ===
            'tahoe-transparent')
            return true;
        if (!Main.overview.visible)
            return false;
        return this._settingString('overview-mode', 'transparent') !== 'keep';
    }

    _usesAdaptiveContrast() {
        try {
            if (this._glassSettings?.settings_schema?.has_key('top-bar-enable-adaptive-text-color') &&
                !this._glassSettings.get_boolean('top-bar-enable-adaptive-text-color'))
                return false;
        } catch (_e) {
        }
        return this._settingString('text-mode', 'auto') === 'auto' &&
            this._panelIsTransparentNow();
    }

    async _sampleContrast() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!this._enabled || !monitor || !this._usesAdaptiveContrast())
            return;

        const serial = ++this._contrastSerial;
        const rect = {
            x: monitor.x,
            y: Math.round(monitor.y + 1),
            width: Math.max(1, monitor.width),
            height: 2,
        };
        const luminance = await captureLuminanceStrip(rect, 32);
        if (!this._enabled || serial !== this._contrastSerial || luminance === null)
            return;

        const preferDarkText = !this._isDark();
        const darkText = decideUseDarkText(luminance, preferDarkText, this._autoTextIsDark);

        if (darkText === this._autoTextIsDark)
            return;
        this._autoTextIsDark = darkText;
        this._rebuild();
    }

    _generate() {
        const s = this._settings;
        const gi = (k, d) => {
            try { return s ? s.get_int(k) : d; } catch (_e) { return d; }
        };
        const gd = (k, d) => {
            try { return s ? s.get_double(k) : d; } catch (_e) { return d; }
        };
        const gs = (k, d) => {
            try { return s ? s.get_string(k) : d; } catch (_e) { return d; }
        };
        const gb = (k, d) => {
            try { return s ? s.get_boolean(k) : d; } catch (_e) { return d; }
        };

        const appearance = gs('appearance', 'tahoe-transparent');
        const textMode = gs('text-mode', 'auto');
        const isDark = this._isDark();
        const hc = isHighContrast();
        const lightFg = hc ? '255, 255, 255' : '245, 245, 247';
        const darkFg = hc ? '0, 0, 0' : '29, 29, 31';

        let useDarkFg = !isDark;
        if (textMode === 'light')
            useDarkFg = false;
        else if (textMode === 'dark')
            useDarkFg = true;
        else if (this._usesAdaptiveContrast() && this._autoTextIsDark !== null)
            useDarkFg = this._autoTextIsDark;
        const fg = useDarkFg ? darkFg : lightFg;

        const lines = [];
        const panel = [];

        if (appearance === 'tahoe-transparent')
            panel.push('background-color: transparent;');
        else if (appearance === 'translucent') {
            panel.push(`background-color: ${isDark ? 'rgba(22, 28, 38, 0.45)' : 'rgba(255, 255, 255, 0.48)'};`);
            panel.push(`border-bottom: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.70)'};`);
            panel.push(`box-shadow: 0 4px 16px ${isDark ? 'rgba(0, 0, 0, 0.28)' : 'rgba(20, 45, 80, 0.10)'};`);
        } else if (appearance === 'solid')
            panel.push(`background-color: ${isDark ? '#000000' : '#FAFAFB'};`);

        panel.push(`color: rgb(${fg}) !important;`);

        const h = gi('panel-height', 24);
        if (h > 0)
            panel.push(`height: ${h}px !important;`);

        const fam = sanitizeFontFamily(gs('font-family', ''));
        panel.push(`font-family: "${fam || 'Cantarell'}";`);
        const fs = gd('font-size-pt', 10.5);
        if (fs > 0)
            panel.push(`font-size: ${fs}pt;`);
        const fw = sanitizeFontWeight(gs('font-weight', 'normal'));
        if (fw)
            panel.push(`font-weight: ${fw};`);

        lines.push(`#panel.fluid-glass { ${panel.join(' ')} }`);

        const buttonText = [`color: rgb(${fg}) !important;`];
        if (fs > 0)
            buttonText.push(`font-size: ${fs}pt;`);
        if (fw)
            buttonText.push(`font-weight: ${fw};`);
        lines.push(`#panel.fluid-glass .panel-button { ${buttonText.join(' ')} }`);
        lines.push('#panel.fluid-glass .panel-button .fluid-glass-active-app ' +
            `{ font-weight: 600; color: rgb(${fg}) !important; }`);
        lines.push(`#panel.fluid-glass .system-status-icon, #panel.fluid-glass StIcon { color: rgb(${fg}) !important; }`);
        lines.push(`#panel.fluid-glass .clock-display-box .clock { color: rgb(${fg}) !important; }`);
        lines.push(`#panel.fluid-glass .fluid-glass-battery-percentage { color: rgb(${fg}) !important; }`);
        lines.push(`.fluid-glass-control-center-icon { color: rgb(${fg}) !important; }`);

        const shadow = !useDarkFg
            ? '0 1px 2px rgba(0, 0, 0, 0.34)'
            : 'none';
        lines.push(`#panel.fluid-glass { text-shadow: ${shadow}; }`);
        lines.push(`#panel.fluid-glass StIcon { icon-shadow: ${shadow}; }`);

        lines.push(`#panel.fluid-glass.${OVERVIEW_CLASS} { background-color: transparent; }`);

        const pad = gi('h-padding', 10);
        const spacing = gi('item-spacing', 0);
        const radius = Math.max(0, gi('corner-radius', 99));
        const ms = Math.max(0, gi('transition-ms', 120));

        const base = [
            'background-color: transparent;',
            `border-radius: ${radius}px;`,
            `transition-duration: ${ms}ms;`,
        ];
        if (pad >= 0) {
            const minimumPad = Math.min(pad, 5);
            base.push(`-natural-hpadding: ${pad}px; ` +
                `-minimum-hpadding: ${minimumPad}px;`);
        }
        if (spacing >= 0)
            base.push(`margin-left: ${spacing}px; margin-right: ${spacing}px;`);
        lines.push(`#panel.fluid-glass .panel-button { ${base.join(' ')} }`);

        const hov = clamp01(gd('hover-opacity', 0.12));
        const act = clamp01(gd('active-opacity', 0.20));
        lines.push(`#panel.fluid-glass .panel-button:hover { background-color: rgba(${fg}, ${hov}); }`);
        if (gb('show-menu-background', true)) {
            lines.push(`#panel.fluid-glass .panel-button:active, #panel.fluid-glass .panel-button:checked, #panel.fluid-glass .panel-button:focus { background-color: rgba(${fg}, ${act}); }`);
            lines.push(`#panel.fluid-glass .panel-button:checked:hover, #panel.fluid-glass .panel-button:active:hover { background-color: rgba(${fg}, ${clamp01(act + 0.04)}); }`);
        } else {
            lines.push('#panel.fluid-glass .panel-button:active, #panel.fluid-glass .panel-button:checked { background-color: transparent; }');
        }

        const accent = resolveAccentColor(this._masterSettings, this._settings);
        const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(accent);
        const [r, g, b] = match
            ? [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)]
            : [0, 122, 255];

        lines.push(`
.fluid-glass-cc-tile-icon:checked,
.fluid-glass-cc-tile:checked .fluid-glass-cc-tile-icon,
.fluid-glass-cc-tile.fluid-glass-cc-tile-compact:checked .fluid-glass-cc-tile-icon,
.fluid-glass-cc-tile-compact .fluid-glass-cc-tile-icon:checked,
.fluid-glass-cc-light .fluid-glass-cc-tile-icon:checked,
.fluid-glass-cc-light .fluid-glass-cc-tile:checked .fluid-glass-cc-tile-icon,
.fluid-glass-cc-light .fluid-glass-cc-tile.fluid-glass-cc-tile-compact:checked .fluid-glass-cc-tile-icon,
.fluid-glass-cc-light .fluid-glass-cc-tile-compact .fluid-glass-cc-tile-icon:checked {
    color: ${accent} !important;
}

.fluid-glass-ui-popup-content .quick-toggle:checked,
.fluid-glass-ui-popup-content .quick-toggle-has-menu .quick-toggle:checked,
.fluid-glass-ui-popup-content .quick-toggle-menu-button:checked {
    background-color: rgba(${r}, ${g}, ${b}, 0.78) !important;
}

.fluid-glass-ui-popup-content .quick-toggle:checked:hover,
.fluid-glass-ui-popup-content .quick-toggle:checked:focus,
.fluid-glass-ui-popup-content .quick-toggle-has-menu .quick-toggle:checked:hover,
.fluid-glass-ui-popup-content .quick-toggle-has-menu .quick-toggle:checked:focus,
.fluid-glass-ui-popup-content .quick-toggle-menu-button:checked:hover,
.fluid-glass-ui-popup-content .quick-toggle-menu-button:checked:focus {
    background-color: rgba(${r}, ${g}, ${b}, 0.90) !important;
}

.modal-dialog.fluid-glass-modal-dialog .modal-dialog-button-box .modal-dialog-linked-button.default,
.modal-dialog.fluid-glass-modal-dialog .modal-dialog-button-box .modal-dialog-button.default,
.modal-dialog.fluid-glass-modal-dialog .modal-dialog-linked-button.default,
.modal-dialog.fluid-glass-modal-dialog .modal-dialog-button.default {
    background-color: rgba(${r}, ${g}, ${b}, 0.72) !important;
}

.modal-dialog.fluid-glass-modal-dialog .modal-dialog-button-box .modal-dialog-linked-button.default:hover,
.modal-dialog.fluid-glass-modal-dialog .modal-dialog-button-box .modal-dialog-button.default:hover,
.modal-dialog.fluid-glass-modal-dialog .modal-dialog-button-box .modal-dialog-linked-button.default:focus,
.modal-dialog.fluid-glass-modal-dialog .modal-dialog-button-box .modal-dialog-button.default:focus,
.modal-dialog.fluid-glass-modal-dialog .modal-dialog-button-box .modal-dialog-linked-button.default:focus:hover,
.modal-dialog.fluid-glass-modal-dialog .modal-dialog-button-box .modal-dialog-button.default:focus:hover,
.modal-dialog.fluid-glass-modal-dialog .modal-dialog-linked-button.default:hover,
.modal-dialog.fluid-glass-modal-dialog .modal-dialog-button.default:hover,
.modal-dialog.fluid-glass-modal-dialog .modal-dialog-linked-button.default:focus,
.modal-dialog.fluid-glass-modal-dialog .modal-dialog-button.default:focus {
    background-color: rgba(${r}, ${g}, ${b}, 0.86) !important;
}

.fluid-glass-fg-track,
.fluid-glass-system-menu-content.fluid-glass-light .fluid-glass-fg-track {
    -barlevel-active-background-color: ${accent} !important;
}

.toggle-switch:checked {
    background-color: ${accent} !important;
}

.fluid-glass-cc-slot-shield:checked,
.fluid-glass-cc-slot-shield:focus {
    border-color: ${accent} !important;
}

.fluid-glass-nc-widget-size-control,
.fluid-glass-nc-ring-cpu,
.fluid-glass-nc-light .fluid-glass-nc-ring-cpu {
    -fluid-glass-ring-fill: ${accent} !important;
}

.fluid-glass-nc-widget-size-control {
    background-color: ${accent} !important;
}

.fluid-glass-nc-bar-chart,
.fluid-glass-nc-dark .fluid-glass-nc-bar-chart,
.fluid-glass-nc-light .fluid-glass-nc-bar-chart {
    -fluid-glass-bar-fill: rgba(${r}, ${g}, ${b}, 0.55) !important;
    -fluid-glass-bar-highlight: ${accent} !important;
}

.fluid-glass-nc-sparkline,
.fluid-glass-nc-dark .fluid-glass-nc-sparkline,
.fluid-glass-nc-light .fluid-glass-nc-sparkline {
    -fluid-glass-spark-primary: ${accent} !important;
}

.fluid-glass-status-menu-content .popup-menu-item:checked,
.fluid-glass-extra-status-menu-content .popup-menu-item:checked,
.fluid-glass-system-menu-content .popup-menu-item:checked,
.fluid-glass-system-menu-content.fluid-glass-dark .popup-menu-item:checked,
.fluid-glass-system-menu-content.fluid-glass-light .popup-menu-item:checked {
    color: ${accent} !important;
}

.popup-menu-ornament:checked,
.popup-menu-item:checked .popup-menu-ornament {
    color: ${accent} !important;
}

.popup-menu-content.fluid-glass-menu-root .calendar-today,
.popup-menu-content.fluid-glass-menu-root .calendar-today:hover,
.popup-menu-content.fluid-glass-menu-root .calendar-today:active,
.popup-menu-content.fluid-glass-menu-root .calendar-today:checked,
.popup-menu-content.fluid-glass-menu-root .calendar-today:selected,
.popup-menu-content.fluid-glass-menu-root .calendar-today:focus,
.fluid-glass-menu-root .calendar-today,
.fluid-glass-menu-root .calendar-today:hover,
.fluid-glass-menu-root .calendar-today:active,
.fluid-glass-menu-root .calendar-today:checked,
.fluid-glass-menu-root .calendar-today:selected,
.fluid-glass-menu-root .calendar-today:focus {
    background-color: ${accent} !important;
}
`);

        return lines.join('\n');
    }

    _isDark() {
        if (Main.sessionMode?.isGreeter || Main.sessionMode?.isLocked)
            return true;
        try {
            return this._desktop.get_string('color-scheme') === 'prefer-dark';
        } catch (_e) {
            return false;
        }
    }

    _setOverview(showing) {
        const panel = Main.panel;
        if (!panel)
            return;
        let mode = 'transparent';
        try {
            mode = this._settings ? this._settings.get_string('overview-mode') : 'transparent';
        } catch (_e) {
            mode = 'transparent';
        }
        const transparent = showing && mode !== 'keep';
        if (transparent)
            panel.add_style_class_name(OVERVIEW_CLASS);
        else
            panel.remove_style_class_name(OVERVIEW_CLASS);
    }

    destroy() {
        this._enabled = false;
        this._contrastSerial++;

        if (this._unsubscribeContrast) {
            this._unsubscribeContrast();
            this._unsubscribeContrast = null;
        }
        if (this._contrastId) {
            GLib.Source.remove(this._contrastId);
            this._contrastId = 0;
        }

        if (this._settingsId) {
            this._settings.disconnect(this._settingsId);
            this._settingsId = 0;
        }
        if (this._glassSettingsId && this._glassSettings) {
            this._glassSettings.disconnect(this._glassSettingsId);
            this._glassSettingsId = 0;
        }
        if (this._masterSettingsId && this._masterSettings) {
            this._masterSettings.disconnect(this._masterSettingsId);
            this._masterSettingsId = 0;
        }
        if (this._desktopId && this._desktop) {
            this._desktop.disconnect(this._desktopId);
            this._desktopId = 0;
        }
        if (this._desktopAccentId && this._desktop) {
            this._desktop.disconnect(this._desktopAccentId);
            this._desktopAccentId = 0;
        }
        if (this._desktopGtkThemeId && this._desktop) {
            this._desktop.disconnect(this._desktopGtkThemeId);
            this._desktopGtkThemeId = 0;
        }
        if (this._backgroundId && this._background) {
            this._background.disconnect(this._backgroundId);
            this._backgroundId = 0;
        }
        if (this._fullscreenId) {
            global.display.disconnect(this._fullscreenId);
            this._fullscreenId = 0;
        }
        if (this._monitorsId) {
            Main.layoutManager.disconnect(this._monitorsId);
            this._monitorsId = 0;
        }
        if (this._themeChangedId && this._themeContext) {
            this._themeContext.disconnect(this._themeChangedId);
            this._themeChangedId = 0;
        }
        if (this._overviewShowingId) {
            Main.overview.disconnect(this._overviewShowingId);
            this._overviewShowingId = 0;
        }
        if (this._overviewHidingId) {
            Main.overview.disconnect(this._overviewHidingId);
            this._overviewHidingId = 0;
        }

        Main.panel?.remove_style_class_name(OVERVIEW_CLASS);

        const theme = this._themeContext?.get_theme();
        if (this._loaded && theme && this._file) {
            this._applying = true;
            try {
                theme.unload_stylesheet(this._file);
            } catch (_e) {
            } finally {
                this._applying = false;
            }
        }
        this._loaded = false;
        this._lastCss = null;

        try {
            this._file?.delete(null);
        } catch (_e) {
        }

        this._themeContext = null;
        this._desktop = null;
        this._background = null;
        this._settings = null;
        this._glassSettings = null;
        this._masterSettings = null;
        this._file = null;
        this._extension = null;
    }
}

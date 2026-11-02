/* Fluid Glass 2.0 — independent GNOME Shell glass integration. */
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';

const EFFECT_NAME = 'fluid-glass-backdrop-blur';
const ROOT_CLASS = 'fluid-glass-root';
const PANEL_CLASS = 'fluid-glass-panel';
const POPUP_CLASS = 'fluid-glass-popup';
const DARK_CLASS = 'fluid-glass-dark';
const LIGHT_CLASS = 'fluid-glass-light';

export default class FluidGlassExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._interfaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        this._effectActors = [];
        this._styledActors = [];
        this._stylesheetLoaded = false;
        this._blurWarningShown = false;

        try {
            this.loadStylesheet();
            this._stylesheetLoaded = true;
        } catch (error) {
            logError(error, '[Fluid Glass] Could not load Shell stylesheet');
        }

        Main.uiGroup?.add_style_class_name(ROOT_CLASS);
        Main.panel?.add_style_class_name(PANEL_CLASS);

        this._schemeSignal = this._interfaceSettings.connect(
            'changed::color-scheme', () => this._applyColorScheme());
        this._themeSignal = this._interfaceSettings.connect(
            'changed::gtk-theme', () => this._applyColorScheme());
        this._settingsSignal = this._settings.connect(
            'changed', () => this._refreshEffects());
        this._themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._scaleSignal = this._themeContext.connect(
            'notify::scale-factor', () => this._refreshEffects());

        this._applyColorScheme();
        this._refreshEffects();
    }

    _isDark() {
        const scheme = this._interfaceSettings.get_string('color-scheme');
        if (scheme === 'prefer-dark') return true;
        if (scheme === 'prefer-light') return false;
        return this._interfaceSettings.get_string('gtk-theme').toLowerCase().includes('dark');
    }

    _applyColorScheme() {
        const variantClass = this._isDark() ? DARK_CLASS : LIGHT_CLASS;
        const actors = [Main.uiGroup, Main.panel, ...this._styledActors].filter(Boolean);
        for (const actor of actors) {
            actor.remove_style_class_name(DARK_CLASS);
            actor.remove_style_class_name(LIGHT_CLASS);
            actor.add_style_class_name(variantClass);
        }
    }

    _popupActors() {
        const status = Main.panel?.statusArea;
        const candidates = [
            status?.quickSettings?.menu?.actor,
            status?.dateMenu?.menu?.actor,
        ];
        return [...new Set(candidates.filter(actor => actor &&
            typeof actor.add_style_class_name === 'function'))];
    }

    _clearStyledActors() {
        for (const actor of this._styledActors) {
            try {
                actor.remove_style_class_name(POPUP_CLASS);
                actor.remove_style_class_name(DARK_CLASS);
                actor.remove_style_class_name(LIGHT_CLASS);
            } catch (error) {
                logError(error, '[Fluid Glass] Could not clean a stale popup actor');
            }
        }
        this._styledActors = [];
    }

    _removeEffects() {
        for (const actor of this._effectActors) {
            try {
                actor.remove_effect_by_name(EFFECT_NAME);
            } catch (error) {
                logError(error, '[Fluid Glass] Could not remove backdrop blur effect');
            }
        }
        this._effectActors = [];
    }

    _backdropBlurMode() {
        if (!Shell.BlurEffect || !Shell.BlurMode ||
            Shell.BlurMode.BACKGROUND === undefined)
            return undefined;
        return Shell.BlurMode.BACKGROUND;
    }

    _createBackdropEffect(actor, label) {
        const mode = this._backdropBlurMode();
        if (!actor || mode === undefined || typeof actor.add_effect_with_name !== 'function')
            return false;

        try {
            actor.remove_effect_by_name(EFFECT_NAME);
            const scale = this._themeContext?.scale_factor ?? 1;
            const radius = Math.round(this._settings.get_int('blur-radius') * scale);
            const effect = new Shell.BlurEffect({
                radius,
                brightness: this._settings.get_double('brightness'),
                mode,
            });
            actor.add_effect_with_name(EFFECT_NAME, effect);
            this._effectActors.push(actor);
            return true;
        } catch (error) {
            logError(error, `[Fluid Glass] ${label} blur unavailable; CSS tint fallback remains active`);
            return false;
        }
    }

    _refreshEffects() {
        this._removeEffects();
        this._clearStyledActors();
        this._styledActors = this._popupActors();
        for (const actor of this._styledActors)
            actor.add_style_class_name(POPUP_CLASS);
        this._applyColorScheme();

        if (!this._settings.get_boolean('blur-enabled'))
            return;

        if (this._backdropBlurMode() === undefined) {
            if (!this._blurWarningShown) {
                log('[Fluid Glass] Background blur API unavailable; translucent tint fallback is active.');
                this._blurWarningShown = true;
            }
            return;
        }

        if (this._settings.get_boolean('panel-blur'))
            this._createBackdropEffect(Main.panel, 'Top panel');

        if (this._settings.get_boolean('popup-blur')) {
            for (const actor of this._styledActors)
                this._createBackdropEffect(actor, 'Popup');
        }
    }

    disable() {
        if (this._settings && this._settingsSignal)
            this._settings.disconnect(this._settingsSignal);
        if (this._interfaceSettings && this._schemeSignal)
            this._interfaceSettings.disconnect(this._schemeSignal);
        if (this._interfaceSettings && this._themeSignal)
            this._interfaceSettings.disconnect(this._themeSignal);
        if (this._themeContext && this._scaleSignal)
            this._themeContext.disconnect(this._scaleSignal);

        this._removeEffects();
        this._clearStyledActors();
        Main.panel?.remove_style_class_name(PANEL_CLASS);
        Main.panel?.remove_style_class_name(DARK_CLASS);
        Main.panel?.remove_style_class_name(LIGHT_CLASS);
        Main.uiGroup?.remove_style_class_name(ROOT_CLASS);
        Main.uiGroup?.remove_style_class_name(DARK_CLASS);
        Main.uiGroup?.remove_style_class_name(LIGHT_CLASS);

        if (this._stylesheetLoaded)
            this.unloadStylesheet();

        this._settings = null;
        this._interfaceSettings = null;
        this._themeContext = null;
        this._effectActors = [];
        this._styledActors = [];
        this._stylesheetLoaded = false;
    }
}

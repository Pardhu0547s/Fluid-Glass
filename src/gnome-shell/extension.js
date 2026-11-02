/* Fluid Glass 2.0 — independent GNOME Shell glass integration. */
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';

const EFFECT_NAME = 'fluid-glass-backdrop-blur';
const ROOT_CLASS = 'fluid-glass-root';
const PANEL_CLASS = 'fluid-glass-panel';
const POPUP_CLASS = 'fluid-glass-popup';
const QUICK_SETTINGS_CLASS = 'fluid-glass-quick-settings';
const DARK_CLASS = 'fluid-glass-dark';
const LIGHT_CLASS = 'fluid-glass-light';

export default class FluidGlassExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._interfaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        this._effectActors = [];
        this._styledActors = [];
        this._quickSettingsActor = null;
        this._calendarActor = null;
        this._screenshotButton = null;
        this._quickActions = null;
        this._stylesheetLoaded = false;
        this._blurWarningShown = false;

        if (typeof this.loadStylesheet === 'function') {
            try {
                this.loadStylesheet();
                this._stylesheetLoaded = true;
            } catch (error) {
                logError(error, '[Fluid Glass] Could not load Shell stylesheet');
            }
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

        this._installScreenshotAction();
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

    _getPopupActors() {
        const status = Main.panel?.statusArea;
        const quick = status?.quickSettings?.menu?.actor ?? null;
        const calendar = status?.dateMenu?.menu?.actor ?? null;
        return { quick, calendar };
    }

    _popupActors() {
        const { quick, calendar } = this._getPopupActors();
        return [...new Set([quick, calendar].filter(actor => actor &&
            typeof actor.add_style_class_name === 'function'))];
    }

    _clearStyledActors() {
        for (const actor of this._styledActors) {
            try {
                actor.remove_style_class_name(POPUP_CLASS);
                actor.remove_style_class_name(QUICK_SETTINGS_CLASS);
                actor.remove_style_class_name(DARK_CLASS);
                actor.remove_style_class_name(LIGHT_CLASS);
            } catch (error) {
                logError(error, '[Fluid Glass] Could not clean a stale popup actor');
            }
        }
        this._styledActors = [];
        this._quickSettingsActor = null;
        this._calendarActor = null;
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
            const brightness = Math.max(0.5, Math.min(1.0, this._settings.get_double('brightness')));
            const effect = new Shell.BlurEffect({ radius, brightness, mode });
            actor.add_effect_with_name(EFFECT_NAME, effect);
            this._effectActors.push(actor);
            return true;
        } catch (error) {
            logError(error, `[Fluid Glass] ${label} blur unavailable; CSS tint fallback remains active`);
            return false;
        }
    }

    _installScreenshotAction() {
        if (this._screenshotButton || !this._settings.get_boolean('screenshot-button'))
            return;

        const quickSettings = Main.panel?.statusArea?.quickSettings;
        const actionBox = quickSettings?._system?._indicator?.child ?? quickSettings?._system?.child;
        if (!actionBox || typeof actionBox.insert_child_at_index !== 'function' ||
            !QuickSettings.QuickSettingsItem) {
            log('[Fluid Glass] Screenshot action button unavailable on this Shell build; native screenshot shortcuts remain available.');
            return;
        }

        try {
            this._quickActions = actionBox;
            this._screenshotButton = new QuickSettings.QuickSettingsItem({
                style_class: 'icon-button fluid-glass-screenshot-action',
                can_focus: true,
                icon_name: 'camera-photo-symbolic',
                accessible_name: 'Take a screenshot',
            });
            this._screenshotButton.connect('clicked', () => {
                const screenshotUI = Main.screenshotUI;
                if (screenshotUI && typeof screenshotUI.open === 'function')
                    screenshotUI.open();
                else
                    log('[Fluid Glass] The GNOME screenshot overlay is not exposed by this Shell build.');
            });
            actionBox.insert_child_at_index(this._screenshotButton, 0);
        } catch (error) {
            this._screenshotButton = null;
            this._quickActions = null;
            logError(error, '[Fluid Glass] Could not add the screenshot action button');
        }
    }

    _removeScreenshotAction() {
        if (!this._screenshotButton)
            return;
        try {
            this._screenshotButton.destroy();
        } catch (error) {
            logError(error, '[Fluid Glass] Could not remove screenshot action button');
        }
        this._screenshotButton = null;
        this._quickActions = null;
    }

    _refreshEffects() {
        if (this._settings.get_boolean('screenshot-button'))
            this._installScreenshotAction();
        else
            this._removeScreenshotAction();

        this._removeEffects();
        this._clearStyledActors();
        const { quick, calendar } = this._getPopupActors();
        this._quickSettingsActor = quick;
        this._calendarActor = calendar;
        this._styledActors = this._popupActors();

        for (const actor of this._styledActors)
            actor.add_style_class_name(POPUP_CLASS);
        if (quick) quick.add_style_class_name(QUICK_SETTINGS_CLASS);
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

        // The Quick Settings popup is the primary glass surface. Calendar blur
        // remains separately opt-in because backdrop blur can be GPU intensive.
        if (quick && (this._settings.get_boolean('quick-settings-blur') ||
            this._settings.get_boolean('popup-blur')))
            this._createBackdropEffect(quick, 'Quick Settings');

        if (calendar && (this._settings.get_boolean('calendar-blur') ||
            this._settings.get_boolean('popup-blur')))
            this._createBackdropEffect(calendar, 'Calendar');
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
        this._removeScreenshotAction();
        Main.panel?.remove_style_class_name(PANEL_CLASS);
        Main.panel?.remove_style_class_name(DARK_CLASS);
        Main.panel?.remove_style_class_name(LIGHT_CLASS);
        Main.uiGroup?.remove_style_class_name(ROOT_CLASS);
        Main.uiGroup?.remove_style_class_name(DARK_CLASS);
        Main.uiGroup?.remove_style_class_name(LIGHT_CLASS);

        if (this._stylesheetLoaded && typeof this.unloadStylesheet === 'function')
            this.unloadStylesheet();

        this._settings = null;
        this._interfaceSettings = null;
        this._themeContext = null;
        this._effectActors = [];
        this._styledActors = [];
        this._quickSettingsActor = null;
        this._calendarActor = null;
        this._stylesheetLoaded = false;
    }
}

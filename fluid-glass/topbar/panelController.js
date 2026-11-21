import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {PanelAdapter} from './compat/panelAdapter.js';
import {PanelSnapshot} from './panelState.js';
import {NotificationAlignment} from './notificationAlignment.js';
import {ExternalIndicators} from './externalIndicators.js';
import {FluidGlassSystemMenu} from './widgets/systemMenu.js';
import {ActiveApp} from './widgets/activeApp.js';
import {ControlCenter} from './widgets/controlCenter.js';
import {FluidGlassMenu} from './widgets/fluidGlassMenu.js';
import {FluidGlassWiredMenu} from './widgets/wiredMenu.js';
import {FluidGlassWifiMenu} from './widgets/wifiMenu.js';
import {FluidGlassBluetoothMenu} from './widgets/bluetoothMenu.js';
import {FluidGlassBatteryMenu} from './widgets/batteryMenu.js';
import {FluidGlassClock} from './widgets/clock.js';
import {FluidGlassNotificationCenter} from './widgets/notificationCenter.js';
import {ThemeManager} from './theme.js';
import {FullscreenReveal} from './fullscreenReveal.js';
import {TopBarManager, ExtraTopBarManager} from './topBarGlass.js';
import {shutdownSystemStats} from './services/systemStats.js';
import {shutdownWeather} from './services/weather.js';

const PANEL_STYLE_CLASS = 'fluid-glass';
const SYSTEM_MENU_ROLE = 'fluid-glass-system-menu';
const ACTIVE_APP_ROLE = 'fluid-glass-active-app';
const WIFI_ROLE = 'fluid-glass-wifi';
const WIRED_ROLE = 'fluid-glass-wired';
const BLUETOOTH_ROLE = 'fluid-glass-bluetooth';
const BATTERY_ROLE = 'fluid-glass-battery';
const FLUID_GLASS_ROLE = 'fluid-glass-fluid-glass';
const CONTROL_CENTER_ROLE = 'fluid-glass-control-center';
const CLOCK_STYLE_CLASS = 'fluid-glass-clock-button';

const STRUCTURAL_KEYS = new Set([
    'hide-activities',
    'clock-on-right',
    'show-system-menu',
    'system-menu-icon',
    'show-active-app',
    'empty-app-label',
    'control-center-mode',
    'notification-center-enabled',
    'show-fluid-glass-menu',
]);

export class PanelController {
    constructor(extension) {
        this._extension = extension;
        this._snapshot = null;
        this._notifications = new NotificationAlignment();
        this._externalIndicators = new ExternalIndicators();
        this._clock = new FluidGlassClock(extension);
        this._theme = new ThemeManager(extension);
        this._fullscreenReveal = new FullscreenReveal(
            extension,
            () => this._theme.requestContrastUpdate(0),
            () => this._notificationCenter?.isOpen ?? false);
        this._notificationCenter = null;
        this._systemMenu = null;
        this._activeApp = null;
        this._fluidGlassMenu = null;
        this._wiredMenu = null;
        this._wifiMenu = null;
        this._bluetoothMenu = null;
        this._batteryMenu = null;
        this._controlCenter = null;
        this._settings = null;
        this._settingsChangedId = 0;
        this._clockHome = null;
        this._sessionModeId = 0;
        this._monitorsId = 0;
        this._reapplyId = 0;
        this._topBarGlass = null;
        this._extraTopBarGlass = null;
        this._enabled = false;
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
            this._settingsChangedId = this._settings.connect(
                'changed', (_s, key) => this._onSettingsChanged(key));
        }

        this.captureOriginalState();

        this.applyFluidGlassLayout();

        this._sessionModeId = Main.sessionMode.connect(
            'updated', () => this._queueReapply());
        this._monitorsId = Main.layoutManager.connect(
            'monitors-changed', () => this._queueReapply());
    }

    captureOriginalState() {
        this._snapshot = PanelSnapshot.capture();
        this._notifications.capture();

        const container = PanelAdapter.containerOf(PanelAdapter.dateMenu);
        const parent = container?.get_parent() ?? null;
        this._clockHome = container && parent
            ? {container, parent, index: parent.get_children().indexOf(container)}
            : null;
    }

    applyFluidGlassLayout() {
        if (!this._enabled)
            return;

        const panel = PanelAdapter.actor;
        if (panel && !panel.has_style_class_name(PANEL_STYLE_CLASS))
            panel.add_style_class_name(PANEL_STYLE_CLASS);

        this._addSystemMenu();
        this._addActiveApp();
        this._ensureLeftOrder();
        this._applyActivitiesVisibility();
        this._addControlCenter();
        this._addStatusMenus();
        this._applyQuickSettingsVisibility();
        this._applyClockPosition();
        this._positionRightControls();

        this._clock.enable();

        this._addNotificationCenter();

        this._theme.enable();

        this._fullscreenReveal.enable();

        if (this._settingBool('clock-on-right', false))
            this._notifications.apply();
        else
            this._notifications.restore();

        if (!this._topBarGlass && this._extension?.getGlassSettings) {
            try {
                const glassSettings = this._extension.getGlassSettings();
                if (glassSettings) {
                    const path = this._extension.path;
                    const logger = this._extension.getLogger?.() ?? console;
                    this._topBarGlass = new TopBarManager(path, glassSettings, logger);
                    this._topBarGlass.setup();
                    this._extraTopBarGlass = new ExtraTopBarManager(path, glassSettings, logger);
                    this._extraTopBarGlass.setup();
                }
            } catch (glassErr) {
                console.error('[FluidGlass] Topbar glass setup error:', glassErr);
            }
        }
    }

    restoreOriginalState() {
        this._topBarGlass?.cleanup();
        this._topBarGlass = null;
        this._extraTopBarGlass?.cleanup();
        this._extraTopBarGlass = null;

        const panel = PanelAdapter.actor;
        if (panel)
            panel.remove_style_class_name(PANEL_STYLE_CLASS);
        PanelAdapter.dateMenu?.remove_style_class_name(CLOCK_STYLE_CLASS);

        this._removeNotificationCenter();
        this._fullscreenReveal.destroy();
        this._theme.destroy();
        this._clock.destroy();

        this._removeStatusMenus();
        this._removeControlCenter();
        this._removeActiveApp();
        this._removeSystemMenu();
        this._externalIndicators.release();

        this._notifications.restore();
        this._snapshot?.restore();
    }

    _applyActivitiesVisibility() {
        const container = PanelAdapter.containerOf(PanelAdapter.activities);
        if (!container)
            return;
        const hide = this._settingBool('hide-activities', true);
        if (hide && container.visible)
            container.hide();
        else if (!hide && !container.visible)
            container.show();
    }

    _applyClockPosition() {
        const dateMenu = PanelAdapter.dateMenu;
        if (this._settingBool('clock-on-right', false)) {
            dateMenu?.add_style_class_name(CLOCK_STYLE_CLASS);
            this._moveClockRight();
            this._notifications.apply();
        } else {
            dateMenu?.remove_style_class_name(CLOCK_STYLE_CLASS);
            this._moveClockHome();
            this._notifications.restore();
        }
    }

    _moveClockRight() {
        const container = PanelAdapter.containerOf(PanelAdapter.dateMenu);
        const rightBox = PanelAdapter.rightBox;
        if (!container || !rightBox)
            return;

        const parent = container.get_parent();
        const lastIndex = rightBox.get_n_children() - 1;
        const alreadyLast =
            parent === rightBox &&
            rightBox.get_child_at_index(lastIndex) === container;
        if (alreadyLast)
            return;

        parent?.remove_child(container);
        rightBox.insert_child_at_index(container, rightBox.get_n_children());
    }

    _moveClockHome() {
        const home = this._clockHome;
        const container = PanelAdapter.containerOf(PanelAdapter.dateMenu);
        if (!home || !home.parent || !container)
            return;
        if (container.get_parent() === home.parent)
            return;
        container.get_parent()?.remove_child(container);
        const idx = Math.min(home.index, home.parent.get_n_children());
        home.parent.insert_child_at_index(container, idx);
    }

    _addSystemMenu() {
        if (!this._settingBool('show-system-menu', true))
            return;
        if (!this._systemMenu) {
            const menu = new FluidGlassSystemMenu(this._extension);
            PanelAdapter.addToStatusArea(SYSTEM_MENU_ROLE, menu, 0, 'left');
            this._systemMenu = menu;
        }
        this._systemMenu.syncSessionMode();
        const container = PanelAdapter.containerOf(this._systemMenu);
        if (container)
            container.show();
    }

    _addActiveApp() {
        if (!this._settingBool('show-active-app', true))
            return;
        if (!this._activeApp) {
            const widget = new ActiveApp(this._extension);
            PanelAdapter.addToStatusArea(ACTIVE_APP_ROLE, widget, 1, 'left');
            this._activeApp = widget;
        }
        const container = PanelAdapter.containerOf(this._activeApp);
        const isLockedOrGreeter = !!(Main.sessionMode.isLocked || Main.sessionMode.isGreeter);
        if (container) {
            if (isLockedOrGreeter)
                container.hide();
            else
                container.show();
        }
    }

    _ensureLeftOrder() {
        const left = PanelAdapter.leftBox;
        if (!left)
            return;
        let idx = 0;
        for (const widget of [this._systemMenu, this._activeApp]) {
            const container = PanelAdapter.containerOf(widget);
            if (!container || container.get_parent() !== left)
                continue;
            if (left.get_child_at_index(idx) !== container)
                left.set_child_at_index(container, Math.min(idx, left.get_n_children() - 1));
            idx++;
        }
    }

    _removeSystemMenu() {
        if (!this._systemMenu)
            return;
        this._systemMenu.destroy();
        this._systemMenu = null;
    }

    _removeActiveApp() {
        if (!this._activeApp)
            return;
        this._activeApp.destroy();
        this._activeApp = null;
    }

    _addControlCenter() {
        if (this._controlCenter)
            return;
        if (!this._customControlCenterActive())
            return;
        try {
            const cc = new ControlCenter(this._extension);
            const right = PanelAdapter.rightBox;
            const pos = right ? right.get_n_children() : 0;
            PanelAdapter.addToStatusArea(CONTROL_CENTER_ROLE, cc, pos, 'right');
            this._controlCenter = cc;
        } catch (e) {
            logError(e, 'fluid-glass: _addControlCenter');
        }
    }

    _addStatusMenus() {
        if (!this._customControlCenterActive())
            return;

        const right = PanelAdapter.rightBox;
        let pos = right ? right.get_n_children() : 0;
        const showFluidGlass = this._settingBool('show-fluid-glass-menu', false);
        if (showFluidGlass && !this._fluidGlassMenu) {
            const menu = new FluidGlassMenu(this._extension);
            PanelAdapter.addToStatusArea(FLUID_GLASS_ROLE, menu, pos++, 'right');
            this._fluidGlassMenu = menu;
        } else if (!showFluidGlass && this._fluidGlassMenu) {
            this._fluidGlassMenu.destroy();
            this._fluidGlassMenu = null;
        }
        if (!this._wiredMenu) {
            const menu = new FluidGlassWiredMenu();
            PanelAdapter.addToStatusArea(WIRED_ROLE, menu, pos++, 'right');
            this._wiredMenu = menu;
        }
        if (!this._wifiMenu) {
            const menu = new FluidGlassWifiMenu();
            PanelAdapter.addToStatusArea(WIFI_ROLE, menu, pos++, 'right');
            this._wifiMenu = menu;
        }
        if (!this._bluetoothMenu) {
            const menu = new FluidGlassBluetoothMenu();
            PanelAdapter.addToStatusArea(BLUETOOTH_ROLE, menu, pos++, 'right');
            this._bluetoothMenu = menu;
        }
        if (!this._batteryMenu) {
            const menu = new FluidGlassBatteryMenu();
            PanelAdapter.addToStatusArea(BATTERY_ROLE, menu, pos++, 'right');
            this._batteryMenu = menu;
        }
    }

    _positionRightControls() {
        const right = PanelAdapter.rightBox;
        if (!right)
            return;

        const clock = PanelAdapter.containerOf(PanelAdapter.dateMenu);
        const controls = [
            this._fluidGlassMenu,
            this._wiredMenu,
            this._wifiMenu,
            this._bluetoothMenu,
            this._batteryMenu,
            this._controlCenter,
        ].filter(Boolean).map(widget => PanelAdapter.containerOf(widget))
            .filter(container => container?.get_parent() === right);
        if (!controls.length)
            return;

        for (const container of controls)
            right.remove_child(container);

        let idx = right.get_n_children();
        if (clock && clock.get_parent() === right)
            idx = right.get_children().indexOf(clock);
        for (const container of controls)
            right.insert_child_at_index(container, idx++);
    }

    _removeStatusMenus() {
        this._fluidGlassMenu?.destroy();
        this._fluidGlassMenu = null;
        this._wiredMenu?.destroy();
        this._wifiMenu?.destroy();
        this._bluetoothMenu?.destroy();
        this._batteryMenu?.destroy();
        this._wiredMenu = null;
        this._wifiMenu = null;
        this._bluetoothMenu = null;
        this._batteryMenu = null;
    }

    _removeControlCenter() {
        if (!this._controlCenter)
            return;
        this._controlCenter.destroy();
        this._controlCenter = null;
    }

    _applyQuickSettingsVisibility() {
        if (this._customControlCenterActive())
            this._externalIndicators.apply();
        else
            this._externalIndicators.release();
    }

    _customControlCenterActive() {
        return this._settingString(
            'control-center-mode', 'custom') === 'custom';
    }

    _addNotificationCenter() {
        if (!this._settingBool('notification-center-enabled', false))
            return;
        if (this._notificationCenter) {
            this._notificationCenter.reapply();
            return;
        }

        const center = new FluidGlassNotificationCenter(this._extension);
        try {
            center.enable();
            this._notificationCenter = center;
        } catch (e) {
            try {
                center.destroy();
            } catch (cleanupError) {
                logError(cleanupError, 'fluid-glass: clean up Notification Center');
            }
            logError(e, 'fluid-glass: enable Notification Center');
        }
    }

    _removeNotificationCenter() {
        this._notificationCenter?.destroy();
        this._notificationCenter = null;
    }

    _settingBool(key, fallback) {
        try {
            const settings = this._settings ?? this._extension?.getSettings?.();
            return settings ? settings.get_boolean(key) : fallback;
        } catch (_e) {
            return fallback;
        }
    }

    _settingString(key, fallback) {
        try {
            const settings = this._settings ?? this._extension?.getSettings?.();
            return settings ? settings.get_string(key) : fallback;
        } catch (_e) {
            return fallback;
        }
    }

    _onSettingsChanged(key) {
        if (!this._enabled || !STRUCTURAL_KEYS.has(key))
            return;
        this._reapplyStructure();
    }

    _reapplyStructure() {
        this._removeNotificationCenter();
        this._removeStatusMenus();
        this._removeControlCenter();
        this._removeActiveApp();
        this._removeSystemMenu();

        this._addSystemMenu();
        this._addActiveApp();
        this._ensureLeftOrder();
        this._applyActivitiesVisibility();
        this._addControlCenter();
        this._addStatusMenus();
        this._applyQuickSettingsVisibility();
        this._applyClockPosition();
        this._positionRightControls();
        this._addNotificationCenter();
    }

    handleSessionMode() {
        if (!this._enabled)
            return;
        if (!PanelAdapter.leftBox)
            return;
        this.applyFluidGlassLayout();
    }

    _queueReapply() {
        if (this._reapplyId)
            return;

        this._reapplyId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._reapplyId = 0;
            this.handleSessionMode();
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        this._enabled = false;

        if (this._sessionModeId) {
            Main.sessionMode.disconnect(this._sessionModeId);
            this._sessionModeId = 0;
        }

        if (this._monitorsId) {
            Main.layoutManager.disconnect(this._monitorsId);
            this._monitorsId = 0;
        }

        if (this._reapplyId) {
            GLib.Source.remove(this._reapplyId);
            this._reapplyId = 0;
        }

        if (this._settingsChangedId && this._settings) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        this._settings = null;

        this.restoreOriginalState();
        shutdownWeather();
        shutdownSystemStats();

        this._externalIndicators.destroy();
        this._notifications.destroy();
        this._snapshot?.destroy();
        this._snapshot = null;
        this._clockHome = null;
        this._notificationCenter = null;
        this._fullscreenReveal = null;
        this._extension = null;
    }
}

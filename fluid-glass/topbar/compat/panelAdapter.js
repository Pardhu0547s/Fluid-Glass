import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const Roles = Object.freeze({
    ACTIVITIES: 'activities',
    DATE_MENU: 'dateMenu',
    QUICK_SETTINGS: 'quickSettings',
    KEYBOARD: 'keyboard',
    A11Y: 'a11y',
    DWELL_CLICK: 'dwellClick',
    SCREEN_RECORDING: 'screenRecording',
    SCREEN_SHARING: 'screenSharing',
});

const NATIVE_QS_INDICATOR_FIELDS = Object.freeze([
    '_remoteAccess', '_camera', '_volumeInput', '_location',
    '_brightness', '_thunderbolt', '_nightLight', '_network', '_darkMode',
    '_doNotDisturb', '_backlight', '_bluetooth', '_rfkill', '_autoRotate',
    '_volumeOutput', '_unsafeMode', '_powerProfiles', '_system',
    '_backgroundApps',
]);

export const PanelAdapter = {
    get panel() {
        return Main.panel;
    },

    get actor() {
        return Main.panel;
    },

    get panelBox() {
        return Main.layoutManager?.panelBox ?? null;
    },

    get leftBox() {
        return Main.panel?._leftBox ?? null;
    },

    get centerBox() {
        return Main.panel?._centerBox ?? null;
    },

    get rightBox() {
        return Main.panel?._rightBox ?? null;
    },

    get boxes() {
        return [this.leftBox, this.centerBox, this.rightBox].filter(b => b != null);
    },

    get statusArea() {
        return Main.panel?.statusArea ?? {};
    },

    getIndicator(role) {
        return this.statusArea?.[role] ?? null;
    },

    get dateMenu() {
        return this.getIndicator(Roles.DATE_MENU);
    },

    get dateMenuClickGesture() {
        return this.dateMenu?._clickGesture ?? null;
    },

    get activities() {
        return this.getIndicator(Roles.ACTIVITIES);
    },

    get quickSettings() {
        return this.getIndicator(Roles.QUICK_SETTINGS);
    },

    containerOf(indicator) {
        return indicator?.container ?? indicator ?? null;
    },

    get quickSettingsIndicatorBox() {
        return this.quickSettings?._indicators ?? null;
    },

    nativeQuickSettingsIndicators() {
        const natives = new Set();
        const qs = this.quickSettings;
        if (!qs)
            return natives;
        for (const field of NATIVE_QS_INDICATOR_FIELDS) {
            const indicator = qs[field];
            if (indicator)
                natives.add(indicator);
        }
        return natives;
    },

    isNativeQuickSettingsIndicator(actor) {
        return this.nativeQuickSettingsIndicators().has(actor);
    },

    closeNativeDateMenu() {
        try {
            this.dateMenu?.menu?.close({animate: false});
            this.dateMenu?.menu?.actor?.hide();
        } catch (_e) {
        }
    },

    get messageTrayBannerBlocked() {
        const value = Main.messageTray?._bannerBlocked;
        return typeof value === 'boolean' ? value : null;
    },

    closeActiveMenu() {
        try {
            Main.panel?.menuManager?.activeMenu?.close();
        } catch (_e) {
        }
    },

    overrideCalendarHandlers(toggle, close) {
        const panel = this.panel;
        if (!panel)
            return null;

        const originalToggle = panel.toggleCalendar;
        const originalClose = panel.closeCalendar;
        const replacementToggle = () => toggle();
        const replacementClose = () => close();
        panel.toggleCalendar = replacementToggle;
        panel.closeCalendar = replacementClose;

        let restored = false;
        return {
            restore() {
                if (restored)
                    return;
                restored = true;
                if (panel.toggleCalendar === replacementToggle)
                    panel.toggleCalendar = originalToggle;
                if (panel.closeCalendar === replacementClose)
                    panel.closeCalendar = originalClose;
            },
        };
    },

    externalQuickSettingsIndicators() {
        const box = this.quickSettingsIndicatorBox;
        if (!box)
            return [];
        const natives = this.nativeQuickSettingsIndicators();
        return box.get_children().filter(child => !natives.has(child));
    },

    get quickSettingsGrid() {
        return this.quickSettings?.menu?._grid ?? null;
    },

    nativeQuickSettingsItems() {
        const items = new Set();
        for (const indicator of this.nativeQuickSettingsIndicators()) {
            for (const item of indicator.quickSettingsItems ?? [])
                items.add(item);
        }
        return items;
    },

    externalQuickSettingsItems() {
        const grid = this.quickSettingsGrid;
        if (!grid)
            return [];
        const natives = this.nativeQuickSettingsItems();
        return grid.get_children().filter(
            child => child instanceof St.Widget && !natives.has(child));
    },

    resyncIndicatorVisibility(indicator) {
        if (!indicator)
            return;
        try {
            if (typeof indicator._syncIndicatorsVisible === 'function')
                indicator._syncIndicatorsVisible();
            else
                indicator.visible = indicator.get_children().some(c => c.visible);
        } catch (_e) {
        }
    },

    addToStatusArea(role, indicator, position = 0, box = 'left') {
        return Main.panel.addToStatusArea(role, indicator, position, box);
    },
};

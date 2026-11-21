import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

let ifaceSettings = null;
export function getIface() {
    if (!ifaceSettings) {
        try {
            ifaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        } catch (_e) {
            ifaceSettings = null;
        }
    }
    return ifaceSettings;
}

export function syncMenuTheme(actor) {
    if (!actor)
        return;
    const iface = getIface();
    const forceDark = !!(Main.sessionMode?.isGreeter || Main.sessionMode?.isLocked);
    const isDark = forceDark || (iface ? iface.get_string('color-scheme') === 'prefer-dark' : false);
    actor.remove_style_class_name(isDark ? 'fluid-glass-light' : 'fluid-glass-dark');
    actor.add_style_class_name(isDark ? 'fluid-glass-dark' : 'fluid-glass-light');
}

export function styleStatusMenu(menu, contentClass = '') {
    const clearStyle = 'background: transparent !important; background-color: transparent !important; background-image: none !important; border: none !important; box-shadow: none !important; -boxpointer-gap: 4px;';
    menu.actor.add_style_class_name('fluid-glass-system-menu');
    menu.actor.add_style_class_name('fluid-glass-status-menu');
    menu.actor.add_style_class_name('fluid-glass-transparent');
    menu.actor.set_style(clearStyle);
    menu.box.add_style_class_name('fluid-glass-system-menu-content');
    menu.box.add_style_class_name('fluid-glass-status-menu-content');
    menu.box.add_style_class_name('fluid-glass-transparent');
    menu.box.set_style(clearStyle);
    if (contentClass)
        menu.box.add_style_class_name(contentClass);

    const syncAll = () => {
        syncMenuTheme(menu.box);
        syncMenuTheme(menu.actor);
    };

    syncAll();

    const iface = getIface();
    let ifaceId = 0;
    if (iface) {
        ifaceId = iface.connect('changed::color-scheme', () => syncAll());
        menu.connect('destroy', () => {
            if (ifaceId) {
                iface.disconnect(ifaceId);
                ifaceId = 0;
            }
        });
    }

    menu.connect('open-state-changed', (_m, open) => {
        if (open) {
            menu.actor.set_style(clearStyle);
            menu.box.set_style(clearStyle);
            syncAll();
        }
    });
}

export function bindStatusToggle(toggleItem, getEnabled, setEnabled, onSettled) {
    let pendingState = null;
    let pendingTimerId = 0;
    let settleTimerId = 0;
    let syncing = false;

    const clearPending = () => {
        if (pendingTimerId) {
            GLib.Source.remove(pendingTimerId);
            pendingTimerId = 0;
        }
        pendingState = null;
    };

    const clearSettle = () => {
        if (settleTimerId) {
            GLib.Source.remove(settleTimerId);
            settleTimerId = 0;
        }
    };

    const scheduleSettle = () => {
        clearSettle();
        settleTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 140, () => {
            settleTimerId = 0;
            const sw = toggleItem?._switch;
            const align = sw?._handleAlignConstraint;
            if (sw && align) {
                const target = sw.state ? 1.0 : 0.0;
                if (Math.abs(align.factor - target) > 0.01) {
                    sw._handle?.remove_all_transitions?.();
                    align.factor = target;
                    sw._handle?.queue_relayout?.();
                    sw.queue_relayout?.();
                }
            }
            return GLib.SOURCE_REMOVE;
        });
    };

    toggleItem.connect('toggled', (_item, state) => {
        if (syncing)
            return;
        clearPending();
        pendingState = Boolean(state);
        pendingTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
            pendingTimerId = 0;
            pendingState = null;
            onSettled?.();
            return GLib.SOURCE_REMOVE;
        });
        scheduleSettle();
        setEnabled(state);
    });

    return {
        sync() {
            const actual = Boolean(getEnabled());
            if (pendingState !== null) {
                if (actual === pendingState)
                    clearPending();
                else
                    return;
            }
            syncing = true;
            try {
                toggleItem.setToggleState(actual);
            } finally {
                syncing = false;
            }
            scheduleSettle();
        },
        destroy() {
            clearPending();
            clearSettle();
        },
    };
}


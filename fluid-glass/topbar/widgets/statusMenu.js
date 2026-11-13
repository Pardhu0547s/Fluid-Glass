// SPDX-License-Identifier: GPL-2.0-or-later
//
// Shared presentation for the independent Tahoe-style status menus.  These
// menus deliberately reuse the compact system-menu metrics, while keeping a
// separate class for status-specific rows and widths.

// No backdrop blur here: PopupMenu sits on a BoxPointer, which sets
// OffscreenRedirect.ALWAYS, so a BACKGROUND-mode Shell.BlurEffect has nothing
// behind it in that framebuffer to sample. This file used to attach one; it
// never did anything. See docs/DESIGN_QA.md, Pass 8.

import Gio from 'gi://Gio';

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
    const isDark = iface ? iface.get_string('color-scheme') === 'prefer-dark' : false;
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


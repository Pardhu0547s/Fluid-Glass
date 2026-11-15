// SPDX-License-Identifier: GPL-2.0-or-later
//
// DialogManager — attaches real GLSL Liquid Glass to system ModalDialogs
// (Log Out, Restart, Power Off, Polkit auth, etc.) and GDM / lock-screen
// user-list & password-entry pills.

import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as DateMenu from 'resource:///org/gnome/shell/ui/dateMenu.js';
import {attachGlass, attachMultiRegionGlass} from './glassEffect.js';
import {isActorValid} from './actors.js';

function findByStyleClass(root, className, out = []) {
    if (!root || !isActorValid(root))
        return out;
    if (root.has_style_class_name?.(className))
        out.push(root);
    const children = root.get_children?.() ?? [];
    for (const child of children)
        findByStyleClass(child, className, out);
    return out;
}

export class DialogManager {
    constructor(extensionPath, settings, logger) {
        this._extensionPath = extensionPath;
        this._settings = settings;
        this._logger = logger;
        this._handles = new Map();
        this._uiPopups = new Map();
        this._shieldDialogs = new Map();
        this._watchedContainers = new Map();
        this._taggedActors = new Set();
        this._pendingIdles = new Set();
        this._groupSignals = [];
        this._settingsSignals = [];
    }

    setup() {
        const modalGroup = Main.layoutManager.modalDialogGroup;
        if (modalGroup) {
            this._groupSignals.push([
                modalGroup,
                modalGroup.connect('child-added', (_g, child) => this._attachModalDialog(child)),
            ]);
            for (const child of modalGroup.get_children())
                this._attachModalDialog(child);
        }

        const shieldGroup = Main.layoutManager.screenShieldGroup;
        if (shieldGroup) {
            console.log(`[FluidGlass] DialogManager.setup: watching screenShieldGroup (${shieldGroup.get_n_children?.() ?? 0} children)`);
            this._groupSignals.push([
                shieldGroup,
                shieldGroup.connect('child-added', (_g, child) => this._watchShieldTree(child)),
            ]);
            for (const child of shieldGroup.get_children())
                this._watchShieldTree(child);
        }

        const uiGroup = Main.layoutManager.uiGroup;
        if (uiGroup) {
            this._groupSignals.push([
                uiGroup,
                uiGroup.connect('child-added', (_g, child) => this._watchUiGroupChild(child)),
            ]);
            for (const child of uiGroup.get_children())
                this._watchUiGroupChild(child);
        }

        if (this._settings) {
            const keys = [
                'panel-menu-blur-radius',
                'panel-menu-tint-color',
                'panel-menu-tint-strength',
                'panel-menu-brightness',
                'panel-menu-contrast',
                'panel-menu-saturation',
                'panel-menu-corner-radius',
            ];
            for (const key of keys) {
                this._settingsSignals.push(
                    this._settings.connect(`changed::${key}`, () => this._syncThemeSettings())
                );
            }
        }
    }

    _syncThemeSettings() {
        const corner = this._settings ? this._settings.get_double('panel-menu-corner-radius') : 26.0;
        const themeOpts = this._glassOptions(corner);
        const updatePayload = {
            blurRadius: themeOpts.blurRadius,
            tintColor: themeOpts.tintColor,
            tintStrength: themeOpts.tintStrength,
            brightness: themeOpts.brightness,
            contrast: themeOpts.contrast,
            saturation: themeOpts.saturation,
            cornerRadius: themeOpts.cornerRadius,
        };
        for (const entry of this._handles.values())
            entry.handle?.update?.(updatePayload);
        for (const [menu, entry] of this._uiPopups) {
            let clampedCorner = updatePayload.cornerRadius;
            const box = menu?.box;
            if (box && isActorValid(box) && box.mapped) {
                const [w, h] = box.get_transformed_size();
                if (w >= 1 && h >= 1)
                    clampedCorner = Math.min(updatePayload.cornerRadius, w * 0.5, h * 0.5);
            }
            entry.handle?.update?.({...updatePayload, cornerRadius: clampedCorner});
        }
        for (const entry of this._shieldDialogs.values())
            entry.handle?.update?.(updatePayload);
    }

    _glassOptions(cornerRadius = 26.0) {
        const s = this._settings;
        return {
            extensionPath: this._extensionPath,
            settings: s,
            logger: this._logger,
            owner: 'dialogManager',
            outline: 'panel-menu',
            cornerRadius,
            blurRadius: s ? s.get_int('panel-menu-blur-radius') : 4,
            tintColor: s ? s.get_string('panel-menu-tint-color') : '#ffffff',
            tintStrength: s ? s.get_double('panel-menu-tint-strength') : 0.04,
            brightness: s ? s.get_double('panel-menu-brightness') : 1.0,
            contrast: s ? s.get_double('panel-menu-contrast') : 1.0,
            saturation: s ? s.get_double('panel-menu-saturation') : 1.0,
        };
    }

    _attachModalDialog(modalActor) {
        if (!modalActor || !isActorValid(modalActor))
            return;
        const dialog = modalActor._dialog ?? findByStyleClass(modalActor, 'modal-dialog')[0];
        if (!dialog || this._handles.has(dialog))
            return;

        dialog.add_style_class_name?.('fluid-glass-modal-dialog');
        const opts = this._glassOptions(
            this._settings ? this._settings.get_double('panel-menu-corner-radius') : 26.0);
        opts.onSync = handle => {
            if (handle.glass && isActorValid(modalActor))
                handle.glass.opacity = modalActor.opacity;
        };

        const handle = attachGlass(dialog, opts);
        const destroyId = dialog.connect('destroy', () => this._detachActor(dialog));
        this._handles.set(dialog, {handle, destroyId, styleClass: 'fluid-glass-modal-dialog'});
    }

    _isOwnedPopupMenu(menu) {
        if (!menu || !menu.actor || !menu.box)
            return true;

        const statusArea = Main.panel?.statusArea;
        if (menu === statusArea?.dateMenu?.menu ||
            menu === statusArea?.quickSettings?.menu ||
            menu.sourceActor instanceof DateMenu.DateMenuButton)
            return true;

        if (statusArea) {
            for (const btn of Object.values(statusArea)) {
                if (!btn)
                    continue;
                if (btn.menu === menu || btn.arcMenu === menu || btn.arcMenuContextMenu === menu)
                    return true;
            }
        }

        if (menu.sourceActor && Main.panel?.contains?.(menu.sourceActor))
            return true;

        const actor = menu.actor;
        const box = menu.box;
        return Boolean(
            actor.has_style_class_name?.('fluid-glass-cc-menu') ||
            actor.has_style_class_name?.('fluid-glass-system-menu') ||
            actor.has_style_class_name?.('fluid-glass-status-menu') ||
            actor.has_style_class_name?.('fluid-glass-transparent') ||
            box.has_style_class_name?.('fluid-glass-cc-popup') ||
            box.has_style_class_name?.('fluid-glass-menu-root') ||
            box.has_style_class_name?.('fluid-glass-system-menu-content') ||
            box.has_style_class_name?.('fluid-glass-status-menu-content') ||
            box.has_style_class_name?.('fluid-glass-extra-status-menu-content') ||
            box.has_style_class_name?.('fluid-glass-ui-popup-content')
        );
    }

    _watchUiGroupChild(child) {
        if (!child || !isActorValid(child))
            return;
        const menu = child._delegate;
        if (!(menu instanceof PopupMenu.PopupMenu) || this._uiPopups.has(menu))
            return;

        const idleId = GLib.idle_add(GLib.PRIORITY_LOW, () => {
            this._pendingIdles.delete(idleId);
            if (!isActorValid(child) || !isActorValid(menu.actor) || !isActorValid(menu.box))
                return GLib.SOURCE_REMOVE;
            if (child.get_parent() !== Main.layoutManager.uiGroup)
                return GLib.SOURCE_REMOVE;
            if (!this._uiPopups.has(menu) && !this._isOwnedPopupMenu(menu))
                this._attachUiPopup(menu);
            return GLib.SOURCE_REMOVE;
        });
        this._pendingIdles.add(idleId);
    }

    _attachUiPopup(menu) {
        if (!menu || this._uiPopups.has(menu) || !menu.actor || !menu.box)
            return;
        if (!isActorValid(menu.actor) || !isActorValid(menu.box))
            return;

        const styledActors = [];
        const addClasses = (actor, classes) => {
            if (!actor || !isActorValid(actor))
                return;
            const existing = styledActors.find(item => item[0] === actor);
            const list = existing ? existing[1] : [];
            for (const cls of classes) {
                if (!actor.has_style_class_name?.(cls)) {
                    actor.add_style_class_name?.(cls);
                    if (!list.includes(cls))
                        list.push(cls);
                }
            }
            if (!existing && list.length > 0)
                styledActors.push([actor, list]);
        };

        addClasses(menu.actor, ['fluid-glass-transparent', 'fluid-glass-ui-popup']);
        if (menu._boxPointer)
            addClasses(menu._boxPointer, ['fluid-glass-transparent', 'fluid-glass-ui-popup']);
        addClasses(menu.box, ['fluid-glass-transparent', 'fluid-glass-ui-popup-content']);

        const corner = this._settings ? this._settings.get_double('panel-menu-corner-radius') : 26.0;
        const opts = this._glassOptions(corner);
        opts.owner = 'uiPopupGlass';
        opts.onSync = syncHandle => {
            const box = menu.box;
            const root = menu.actor;
            if (!syncHandle?.glass || !isActorValid(box) || !isActorValid(root))
                return;

            const prefR = this._settings ? this._settings.get_double('panel-menu-corner-radius') : 26.0;
            const [w, h] = box.get_transformed_size();
            if (w >= 1 && h >= 1)
                syncHandle.glass.setCornerRadius?.(Math.min(prefR, w * 0.5, h * 0.5));

            const parent = syncHandle.glass.get_parent?.();
            if (parent && root.get_parent?.() === parent) {
                const children = parent.get_children();
                const gIdx = children.indexOf(syncHandle.glass);
                const rIdx = children.indexOf(root);
                if (gIdx !== -1 && rIdx !== -1 && gIdx !== rIdx - 1)
                    parent.set_child_below_sibling(syncHandle.glass, root);
            }
        };

        // Do not pass opts.menu so QuickSettingsMenu opacity fade completes cleanly.
        const handle = attachGlass(menu.box, opts);
        const destroyIds = [
            [menu.actor, menu.actor.connect('destroy', () => this._detachUiPopup(menu))],
            [menu.box, menu.box.connect('destroy', () => this._detachUiPopup(menu))],
        ];
        this._uiPopups.set(menu, {handle, destroyIds, styledActors});
    }

    _detachUiPopup(menu) {
        const entry = this._uiPopups.get(menu);
        if (!entry)
            return;
        this._uiPopups.delete(menu);
        for (const [actor, id] of entry.destroyIds) {
            if (actor && isActorValid(actor))
                try { actor.disconnect(id); } catch (_e) {}
        }
        for (const [actor, classes] of entry.styledActors) {
            if (actor && isActorValid(actor)) {
                for (const cls of classes)
                    try { actor.remove_style_class_name?.(cls); } catch (_e) {}
            }
        }
        entry.handle?.destroy();
    }

    _isUnlockNotificationCard(actor) {
        if (!actor.has_style_class_name?.('unlock-dialog-notification-source') &&
            !actor.has_style_class_name?.('message') &&
            !actor.has_style_class_name?.('media-message'))
            return false;
        for (let p = actor.get_parent?.(); p; p = p.get_parent?.()) {
            if (p.has_style_class_name?.('unlock-dialog-notifications-container') ||
                p.name === 'unlockDialogNotifications')
                return true;
        }
        return false;
    }

    _isLoginPill(actor) {
        return actor.has_style_class_name?.('login-dialog-user-list-item') ||
            actor.has_style_class_name?.('login-dialog-prompt-entry') ||
            actor.has_style_class_name?.('login-dialog-not-listed-button') ||
            actor.has_style_class_name?.('login-dialog-auth-list-item') ||
            actor.has_style_class_name?.('switch-user-button') ||
            actor.has_style_class_name?.('a11y-button') ||
            actor.has_style_class_name?.('login-dialog-auth-menu-button') ||
            actor.has_style_class_name?.('cancel-button') ||
            this._isUnlockNotificationCard(actor);
    }

    _isShieldDialog(actor) {
        return actor.has_style_class_name?.('login-dialog') ||
            actor.has_style_class_name?.('unlock-dialog');
    }

    _watchShieldTree(root) {
        if (!root || !isActorValid(root))
            return;

        if (this._isShieldDialog(root))
            this._scheduleShieldDialog(root);

        if (this._isLoginPill(root))
            this._tagShieldPill(root);

        // Watch containers inside the login/unlock dialog so dynamically shown
        // user items or password entries get tagged when created.
        this._watchSubtree(root);
    }

    _watchSubtree(actor) {
        if (!actor || !isActorValid(actor) || this._watchedContainers.has(actor))
            return;
        const id = actor.connect('child-added', (_a, child) => {
            this._watchShieldTree(child);
        });
        const destroyId = actor.connect('destroy', () => {
            this._watchedContainers.delete(actor);
        });
        this._watchedContainers.set(actor, [id, destroyId]);
        for (const child of actor.get_children?.() ?? [])
            this._watchShieldTree(child);
    }

    _tagShieldPill(actor) {
        if (!actor || !isActorValid(actor))
            return;
        actor.add_style_class_name?.('fluid-glass-login-glass');
        this._taggedActors.add(actor);

        for (let cur = actor.get_parent?.(); cur; cur = cur.get_parent?.()) {
            if (this._isShieldDialog(cur)) {
                this._scheduleShieldDialog(cur);
                break;
            }
        }
    }

    _scheduleShieldDialog(dialog) {
        if (!dialog || !isActorValid(dialog) ||
            this._shieldDialogs.has(dialog) || dialog._fgShieldIdleScheduled)
            return;

        dialog._fgShieldIdleScheduled = true;
        const idleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._pendingIdles.delete(idleId);
            if (isActorValid(dialog)) {
                dialog._fgShieldIdleScheduled = false;
                this._attachShieldDialog(dialog);
            }
            return GLib.SOURCE_REMOVE;
        });
        this._pendingIdles.add(idleId);
    }

    _collectTaggedTargets(root, out = []) {
        if (!root || !isActorValid(root) || !root.visible || !root.mapped)
            return out;
        if (root.has_style_class_name?.('fluid-glass-login-glass')) {
            out.push(root);
            return out;
        }
        for (const child of root.get_children?.() ?? [])
            this._collectTaggedTargets(child, out);
        return out;
    }

    _attachShieldDialog(dialog) {
        if (!dialog || !isActorValid(dialog) || this._shieldDialogs.has(dialog))
            return;

        const isUnlock = Boolean(dialog._backgroundGroup) ||
            Boolean(dialog.has_style_class_name?.('unlock-dialog'));
        const containerActor = dialog;
        if (!containerActor || !isActorValid(containerActor))
            return;

        const corner = this._settings ? this._settings.get_double('panel-menu-corner-radius') : 26.0;
        const opts = this._glassOptions(corner);
        opts.owner = isUnlock ? 'unlockDialogGlass' : 'loginDialogGlass';
        opts.getCornerRadius = (item, uw, uh) => {
            const prefR = this._settings ? this._settings.get_double('panel-menu-corner-radius') : 26.0;
            if (item.has_style_class_name?.('login-dialog-user-list-item') ||
                item.has_style_class_name?.('login-dialog-auth-list-item') ||
                item.has_style_class_name?.('login-dialog-not-listed-button'))
                return Math.min(prefR, 18.0, uw * 0.5, uh * 0.5);
            if (item.has_style_class_name?.('a11y-button') ||
                item.has_style_class_name?.('login-dialog-auth-menu-button') ||
                item.has_style_class_name?.('cancel-button') ||
                item.has_style_class_name?.('switch-user-button'))
                return Math.min(uw, uh) * 0.5;
            if (item.has_style_class_name?.('login-dialog-prompt-entry') ||
                item.has_style_class_name?.('unlock-dialog-notification-source') ||
                item.has_style_class_name?.('message') ||
                item.has_style_class_name?.('media-message'))
                return Math.min(prefR, 22.0, uw * 0.5, uh * 0.5);
            return Math.min(prefR, uw * 0.5, uh * 0.5);
        };

        let loggedOnce = false;
        opts.onSync = syncHandle => {
            if (loggedOnce)
                return;
            loggedOnce = true;
            const logTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 800, () => {
                this._pendingIdles.delete(logTimerId);
                const entry = this._shieldDialogs.get(dialog);
                if (!entry || !syncHandle?.glass || !isActorValid(syncHandle.glass))
                    return GLib.SOURCE_REMOVE;
                try {
                    const parentActor = syncHandle.glass.get_parent?.();
                    const parentName = parentActor?.name ?? parentActor?.constructor?.name ?? 'unknown';
                    const targets = this._collectTaggedTargets(dialog)
                        .map(t => t.style_class ?? 'pill')
                        .join(', ');
                    const desc = syncHandle.glass.describe?.();
                    console.log(
                        `[FluidGlass] DialogManager: ${opts.owner} parent=${parentName} ` +
                        `visible=${syncHandle.glass.visible} opacity=${syncHandle.glass.opacity} ` +
                        `targets=[${targets}] desc=${JSON.stringify(desc)}`
                    );
                } catch (_e) {
                    // Best-effort diagnostics only.
                }
                return GLib.SOURCE_REMOVE;
            });
            this._pendingIdles.add(logTimerId);
        };

        const handle = attachMultiRegionGlass(
            containerActor,
            () => this._collectTaggedTargets(dialog),
            opts
        );

        const glassParent = handle.glass?.get_parent?.();
        console.log(
            `[FluidGlass] DialogManager: attached ${opts.owner} ` +
            `(glassParent=${glassParent?.name ?? glassParent?.constructor?.name ?? 'unknown'}, ` +
            `mapped=${containerActor.mapped})`
        );

        const destroyIds = [
            [dialog, dialog.connect('destroy', () => this._detachShieldDialog(dialog))],
        ];
        if (containerActor !== dialog) {
            destroyIds.push([
                containerActor,
                containerActor.connect('destroy', () => this._detachShieldDialog(dialog)),
            ]);
        }
        this._shieldDialogs.set(dialog, {handle, destroyIds});
    }

    _detachShieldDialog(dialog) {
        const entry = this._shieldDialogs.get(dialog);
        if (!entry)
            return;
        this._shieldDialogs.delete(dialog);
        for (const [actor, id] of entry.destroyIds) {
            if (actor && isActorValid(actor))
                try { actor.disconnect(id); } catch (_e) {}
        }
        entry.handle?.destroy();
    }

    _detachActor(actor) {
        const entry = this._handles.get(actor);
        if (!entry)
            return;
        this._handles.delete(actor);
        if (entry.destroyId && isActorValid(actor)) {
            try { actor.disconnect(entry.destroyId); } catch (_e) {}
        }
        if (entry.styleClass && isActorValid(actor)) {
            try { actor.remove_style_class_name?.(entry.styleClass); } catch (_e) {}
        }
        entry.handle?.destroy();
    }

    cleanup() {
        for (const sourceId of this._pendingIdles)
            try { GLib.Source.remove(sourceId); } catch (_e) {}
        this._pendingIdles.clear();

        if (this._settings) {
            for (const id of this._settingsSignals) {
                try { this._settings.disconnect(id); } catch (_e) {}
            }
        }
        this._settingsSignals = [];

        for (const [source, id] of this._groupSignals) {
            if (source && id) {
                try { source.disconnect(id); } catch (_e) {}
            }
        }
        this._groupSignals = [];

        for (const [actor, ids] of this._watchedContainers) {
            if (isActorValid(actor)) {
                for (const id of ids) {
                    try { actor.disconnect(id); } catch (_e) {}
                }
            }
        }
        this._watchedContainers.clear();

        for (const actor of this._taggedActors) {
            if (isActorValid(actor))
                try { actor.remove_style_class_name?.('fluid-glass-login-glass'); } catch (_e) {}
        }
        this._taggedActors.clear();

        for (const menu of [...this._uiPopups.keys()])
            this._detachUiPopup(menu);

        for (const dialog of [...this._shieldDialogs.keys()])
            this._detachShieldDialog(dialog);

        for (const actor of [...this._handles.keys()])
            this._detachActor(actor);
    }
}

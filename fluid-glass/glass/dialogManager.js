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
import {AdaptiveClassContrast} from './contrastSampler.js';
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
        this._uiSurfaces = new Map();
        this._shieldDialogs = new Map();
        this._watchedContainers = new Map();
        this._taggedActors = new Set();
        this._scheduledModals = new WeakSet();
        this._pendingIdles = new Set();
        this._groupSignals = [];
        this._settingsSignals = [];
    }

    setup() {
        const modalGroup = Main.layoutManager.modalDialogGroup;
        if (modalGroup) {
            this._groupSignals.push([
                modalGroup,
                modalGroup.connect('child-added', (_g, child) => this._scheduleModalDialog(child)),
            ]);
            for (const child of modalGroup.get_children())
                this._scheduleModalDialog(child);
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

    _updateClampedEntries(entries, getActor, updatePayload) {
        for (const [key, entry] of entries) {
            let clampedCorner = updatePayload.cornerRadius;
            const actor = getActor(key, entry);
            if (actor && isActorValid(actor) && actor.mapped) {
                const [w, h] = actor.get_transformed_size();
                if (w >= 1 && h >= 1)
                    clampedCorner = Math.min(updatePayload.cornerRadius, w * 0.5, h * 0.5);
            }
            entry.handle?.update?.({...updatePayload, cornerRadius: clampedCorner});
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
        this._updateClampedEntries(this._handles, actor => actor, updatePayload);
        this._updateClampedEntries(this._uiPopups, menu => menu?.box, updatePayload);
        this._updateClampedEntries(this._uiSurfaces, actor => actor, updatePayload);
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

    _makeRestackOptions(sizeActor, stackRoot, owner = 'dialogManager') {
        const corner = this._settings ? this._settings.get_double('panel-menu-corner-radius') : 26.0;
        const opts = this._glassOptions(corner);
        opts.owner = owner;
        opts.onSync = syncHandle => {
            if (!syncHandle?.glass || !isActorValid(sizeActor) || !isActorValid(stackRoot))
                return;

            const prefR = this._settings ? this._settings.get_double('panel-menu-corner-radius') : 26.0;
            const [w, h] = sizeActor.get_transformed_size();
            if (w >= 1 && h >= 1)
                syncHandle.glass.setCornerRadius?.(Math.min(prefR, w * 0.5, h * 0.5));

            const parent = syncHandle.glass.get_parent?.();
            if (parent && stackRoot.get_parent?.() === parent) {
                const children = parent.get_children();
                const gIdx = children.indexOf(syncHandle.glass);
                const rIdx = children.indexOf(stackRoot);
                if (gIdx !== -1 && rIdx !== -1 && gIdx !== rIdx - 1)
                    parent.set_child_below_sibling(syncHandle.glass, stackRoot);
            }
        };
        return opts;
    }

    _scheduleIdle(fn) {
        const idleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._pendingIdles.delete(idleId);
            fn();
            return GLib.SOURCE_REMOVE;
        });
        this._pendingIdles.add(idleId);
    }

    _scheduleModalDialog(modalActor) {
        if (!modalActor || !isActorValid(modalActor) || this._scheduledModals.has(modalActor))
            return;
        if (this._attachModalDialog(modalActor))
            return;

        // ModalDialog._init adds itself to modalDialogGroup before building dialogLayout/_lightbox.
        this._scheduledModals.add(modalActor);
        this._scheduleIdle(() => {
            this._scheduledModals.delete(modalActor);
            if (!isActorValid(modalActor))
                return;
            if (modalActor.get_parent?.() !== Main.layoutManager.modalDialogGroup)
                return;
            this._attachModalDialog(modalActor);
        });
    }

    _attachModalDialog(modalActor) {
        if (!modalActor || !isActorValid(modalActor))
            return false;
        const dialog = modalActor.dialogLayout?._dialog ??
            modalActor._dialog ??
            (modalActor.has_style_class_name?.('modal-dialog')
                ? modalActor
                : findByStyleClass(modalActor, 'modal-dialog')[0]);
        if (!dialog || !isActorValid(dialog))
            return false;
        if (this._handles.has(dialog))
            return true;

        dialog.add_style_class_name?.('fluid-glass-modal-dialog');

        // Disable GNOME Shell's heavy black radial lightbox shade so the liquid glass modal
        // stays clear and bright over desktop windows while keeping reactive event blocking.
        const lightbox = modalActor._lightbox;
        let radial = null;
        let prevRadialEnabled = null;
        let lightboxAddedClass = null;
        if (lightbox && isActorValid(lightbox)) {
            radial = lightbox.get_effect?.('radial') ?? null;
            if (radial) {
                prevRadialEnabled = radial.enabled;
                radial.enabled = false;
            }
            if (!lightbox.has_style_class_name?.('fluid-glass-transparent')) {
                lightbox.add_style_class_name?.('fluid-glass-transparent');
                lightboxAddedClass = 'fluid-glass-transparent';
            }
        }

        const opts = this._makeRestackOptions(dialog, modalActor, 'dialogManager');
        const handle = attachGlass(dialog, opts);
        const adaptiveClasses = ['fluid-glass-modal-light', 'fluid-glass-modal-dark'];
        const adaptive = this._createAdaptiveContrast(
            'modalDialog',
            dialog,
            handle,
            adaptiveClasses[0],
            adaptiveClasses[1]
        );
        const destroyIds = [
            [dialog, dialog.connect('destroy', () => this._detachActor(dialog))],
            [dialog, dialog.connect('notify::mapped', () => {
                if (dialog.mapped)
                    adaptive.start(true);
                else
                    adaptive.stop(false);
            })],
        ];
        if (dialog.mapped)
            adaptive.start(true);
        if (modalActor !== dialog) {
            destroyIds.push([
                modalActor,
                modalActor.connect('destroy', () => this._detachActor(dialog)),
            ]);
        }
        this._handles.set(dialog, {
            handle,
            adaptive,
            adaptiveClasses,
            destroyIds,
            styleClass: 'fluid-glass-modal-dialog',
            lightbox,
            radial,
            prevRadialEnabled,
            lightboxAddedClass,
        });
        console.log(`[FluidGlass] DialogManager: attached modal dialog (${dialog.style_class ?? ''})`);
        return true;
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

    _addTempClasses(styledActors, actor, classes) {
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
    }

    _watchUiGroupChild(child) {
        if (!child || !isActorValid(child))
            return;
        const menu = child._delegate;
        if (menu instanceof PopupMenu.PopupMenu) {
            if (this._uiPopups.has(menu))
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
            return;
        }

        const uiGroup = Main.layoutManager.uiGroup;
        if (child.has_style_class_name?.('switcher-popup') && !this._watchedContainers.has(child)) {
            const scanLists = () => {
                if (!isActorValid(child) || child.get_parent?.() !== uiGroup)
                    return;
                for (const list of findByStyleClass(child, 'switcher-list'))
                    this._attachUiSurface(list, child);
            };
            const ids = [
                child.connect('child-added', scanLists),
                child.connect('destroy', () => this._watchedContainers.delete(child)),
            ];
            this._watchedContainers.set(child, ids);
            this._scheduleIdle(scanLists);
            return;
        }

        // WorkspaceSwitcherPopup and ResizePopup construct child boxes after Main.uiGroup.add_child(this).
        this._scheduleIdle(() => {
            if (!isActorValid(child) || child.get_parent?.() !== uiGroup)
                return;
            for (const cls of ['workspace-switcher', 'resize-popup']) {
                for (const target of findByStyleClass(child, cls))
                    this._attachUiSurface(target, child);
            }
        });
    }

    _createAdaptiveContrast(label, targetActor, handle, lightClass, darkClass, fallbackIsDark = () => true) {
        return new AdaptiveClassContrast({
            label,
            logger: this._logger,
            perElement: false,
            intervalMs: 280,
            lightClass,
            darkClass,
            getTargets: () => (targetActor && isActorValid(targetActor) ? [targetActor] : []),
            getGlasses: () => (handle.glass && isActorValid(handle.glass) ? [handle.glass] : []),
            getEnabled: () => {
                try {
                    return this._settings?.get_boolean('menu-enable-adaptive-text-color') ?? true;
                } catch (_e) {
                    return true;
                }
            },
            getPreference: () => {
                try {
                    return this._settings?.get_string('menu-adaptive-text-preference') ?? 'auto';
                } catch (_e) {
                    return 'auto';
                }
            },
            fallbackIsDark,
        });
    }

    _attachUiPopup(menu) {
        if (!menu || this._uiPopups.has(menu) || !menu.actor || !menu.box)
            return;
        if (!isActorValid(menu.actor) || !isActorValid(menu.box))
            return;

        const styledActors = [];
        this._addTempClasses(styledActors, menu.actor, ['fluid-glass-transparent', 'fluid-glass-ui-popup']);
        if (menu._boxPointer)
            this._addTempClasses(styledActors, menu._boxPointer, ['fluid-glass-transparent', 'fluid-glass-ui-popup']);
        this._addTempClasses(styledActors, menu.box, ['fluid-glass-transparent', 'fluid-glass-ui-popup-content']);

        // Do not pass opts.menu so QuickSettingsMenu opacity fade completes cleanly.
        const opts = this._makeRestackOptions(menu.box, menu.actor, 'uiPopupGlass');
        const handle = attachGlass(menu.box, opts);
        const adaptiveClasses = ['fluid-glass-ui-popup-light', 'fluid-glass-ui-popup-dark'];
        const adaptive = this._createAdaptiveContrast(
            'uiPopup',
            menu.box,
            handle,
            adaptiveClasses[0],
            adaptiveClasses[1]
        );
        const openId = menu.connect?.('open-state-changed', (_m, isOpen) => {
            if (isOpen)
                adaptive.start(true);
            else
                adaptive.stop(false);
        });
        if (menu.isOpen || (menu.actor.visible && menu.actor.mapped))
            adaptive.start(true);
        const destroyIds = [
            [menu.actor, menu.actor.connect('destroy', () => this._detachStyledEntry(this._uiPopups, menu))],
            [menu.box, menu.box.connect('destroy', () => this._detachStyledEntry(this._uiPopups, menu))],
        ];
        if (openId)
            destroyIds.push([menu, openId]);
        this._uiPopups.set(menu, {handle, adaptive, adaptiveClasses, destroyIds, styledActors});
    }

    _attachUiSurface(surfaceActor, rootActor) {
        if (!surfaceActor || !rootActor || this._uiSurfaces.has(surfaceActor))
            return;
        if (!isActorValid(surfaceActor) || !isActorValid(rootActor))
            return;
        if (surfaceActor.has_style_class_name?.('fluid-glass-transparent'))
            return;

        const styledActors = [];
        this._addTempClasses(styledActors, surfaceActor, ['fluid-glass-transparent', 'fluid-glass-ui-surface']);
        const opts = this._makeRestackOptions(surfaceActor, rootActor, 'uiSurfaceGlass');
        const handle = attachGlass(surfaceActor, opts);
        const adaptiveClasses = ['fluid-glass-ui-surface-light', 'fluid-glass-ui-surface-dark'];
        const adaptive = this._createAdaptiveContrast(
            'uiSurface',
            surfaceActor,
            handle,
            adaptiveClasses[0],
            adaptiveClasses[1]
        );
        const destroyIds = [
            [surfaceActor, surfaceActor.connect('destroy', () => this._detachStyledEntry(this._uiSurfaces, surfaceActor))],
            [surfaceActor, surfaceActor.connect('notify::mapped', () => {
                if (surfaceActor.mapped)
                    adaptive.start(true);
                else
                    adaptive.stop(false);
            })],
        ];
        if (surfaceActor.mapped)
            adaptive.start(true);
        if (rootActor !== surfaceActor) {
            destroyIds.push([
                rootActor,
                rootActor.connect('destroy', () => this._detachStyledEntry(this._uiSurfaces, surfaceActor)),
            ]);
        }
        this._uiSurfaces.set(surfaceActor, {handle, adaptive, adaptiveClasses, destroyIds, styledActors});
    }

    _detachStyledEntry(map, key) {
        const entry = map.get(key);
        if (!entry)
            return;
        map.delete(key);
        for (const [actor, id] of entry.destroyIds) {
            if (actor && isActorValid(actor))
                try { actor.disconnect(id); } catch (_e) {}
        }
        for (const [actor, classes] of entry.styledActors) {
            if (actor && isActorValid(actor)) {
                for (const cls of classes)
                    try { actor.remove_style_class_name?.(cls); } catch (_e) {}
                for (const cls of (entry.adaptiveClasses ?? []))
                    try { actor.remove_style_class_name?.(cls); } catch (_e) {}
            }
        }
        entry.adaptive?.destroy();
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
        if (entry.destroyIds) {
            for (const [target, id] of entry.destroyIds) {
                if (target && isActorValid(target)) {
                    try { target.disconnect(id); } catch (_e) {}
                }
            }
        }
        if (entry.radial && entry.prevRadialEnabled !== null) {
            try { entry.radial.enabled = entry.prevRadialEnabled; } catch (_e) {}
        }
        if (entry.lightboxAddedClass && entry.lightbox && isActorValid(entry.lightbox)) {
            try { entry.lightbox.remove_style_class_name?.(entry.lightboxAddedClass); } catch (_e) {}
        }
        if (entry.styleClass && isActorValid(actor)) {
            try { actor.remove_style_class_name?.(entry.styleClass); } catch (_e) {}
        }
        for (const cls of (entry.adaptiveClasses ?? [])) {
            if (isActorValid(actor))
                try { actor.remove_style_class_name?.(cls); } catch (_e) {}
        }
        entry.adaptive?.destroy();
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
            this._detachStyledEntry(this._uiPopups, menu);

        for (const surface of [...this._uiSurfaces.keys()])
            this._detachStyledEntry(this._uiSurfaces, surface);

        for (const dialog of [...this._shieldDialogs.keys()])
            this._detachShieldDialog(dialog);

        for (const actor of [...this._handles.keys()])
            this._detachActor(actor);
    }
}

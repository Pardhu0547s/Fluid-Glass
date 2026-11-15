// SPDX-License-Identifier: GPL-2.0-or-later
//
// DialogManager — attaches real GLSL Liquid Glass to system ModalDialogs
// (Log Out, Restart, Power Off, Polkit auth, etc.) and GDM / lock-screen
// user-list & password-entry pills.

import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
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

    _isLoginPill(actor) {
        return actor.has_style_class_name?.('login-dialog-user-list-item') ||
            actor.has_style_class_name?.('login-dialog-prompt-entry') ||
            actor.has_style_class_name?.('login-dialog-not-listed-button');
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
        if (root.has_style_class_name?.('fluid-glass-login-glass'))
            out.push(root);
        for (const child of root.get_children?.() ?? [])
            this._collectTaggedTargets(child, out);
        return out;
    }

    _attachShieldDialog(dialog) {
        if (!dialog || !isActorValid(dialog) || this._shieldDialogs.has(dialog))
            return;

        const isUnlock = Boolean(dialog._backgroundGroup) ||
            Boolean(dialog.has_style_class_name?.('unlock-dialog'));
        const containerActor = isUnlock ? (dialog._promptBox ?? dialog) : dialog;
        if (!containerActor || !isActorValid(containerActor))
            return;

        const corner = this._settings ? this._settings.get_double('panel-menu-corner-radius') : 26.0;
        const opts = this._glassOptions(corner);
        opts.owner = isUnlock ? 'unlockDialogGlass' : 'loginDialogGlass';
        opts.getCornerRadius = (item, uw, uh) => {
            const prefR = this._settings ? this._settings.get_double('panel-menu-corner-radius') : 26.0;
            if (item.has_style_class_name?.('login-dialog-user-list-item'))
                return Math.min(prefR, 18.0, uw * 0.5, uh * 0.5);
            if (item.has_style_class_name?.('login-dialog-not-listed-button'))
                return Math.min(prefR, 18.0, uw * 0.5, uh * 0.5);
            if (item.has_style_class_name?.('login-dialog-prompt-entry'))
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

        for (const dialog of [...this._shieldDialogs.keys()])
            this._detachShieldDialog(dialog);

        for (const actor of [...this._handles.keys()])
            this._detachActor(actor);
    }
}

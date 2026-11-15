// SPDX-License-Identifier: GPL-2.0-or-later
//
// DialogManager — attaches real GLSL Liquid Glass to system ModalDialogs
// (Log Out, Restart, Power Off, Polkit auth, etc.) and GDM / lock-screen
// user-list & password-entry pills.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {attachGlass} from './glassEffect.js';
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
        this._watchedContainers = new Map();
        this._groupSignals = [];
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
            this._groupSignals.push([
                shieldGroup,
                shieldGroup.connect('child-added', (_g, child) => this._watchShieldTree(child)),
            ]);
            for (const child of shieldGroup.get_children())
                this._watchShieldTree(child);
        }
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

    _watchShieldTree(root) {
        if (!root || !isActorValid(root))
            return;

        for (const item of findByStyleClass(root, 'login-dialog-user-list-item'))
            this._attachLoginPill(item, 18.0);
        for (const entry of findByStyleClass(root, 'login-dialog-prompt-entry'))
            this._attachLoginPill(entry, 22.0);
        for (const btn of findByStyleClass(root, 'login-dialog-not-listed-button'))
            this._attachLoginPill(btn, 18.0);

        // Watch containers inside the login/unlock dialog so dynamically shown
        // user items or password entries get glass when created.
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
            this._watchSubtree(child);
    }

    _attachLoginPill(actor, cornerRadius) {
        if (!actor || !isActorValid(actor) || this._handles.has(actor))
            return;
        actor.add_style_class_name?.('fluid-glass-login-glass');
        const opts = this._glassOptions(cornerRadius);
        opts.blurRadius = Math.max(opts.blurRadius ?? 4, 10);
        opts.tintStrength = Math.max(opts.tintStrength ?? 0.04, 0.08);
        const handle = attachGlass(actor, opts);
        const destroyId = actor.connect('destroy', () => this._detachActor(actor));
        this._handles.set(actor, {handle, destroyId, styleClass: 'fluid-glass-login-glass'});
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

        for (const actor of [...this._handles.keys()])
            this._detachActor(actor);
    }
}

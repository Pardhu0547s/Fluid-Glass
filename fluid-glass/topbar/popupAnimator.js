// SPDX-License-Identifier: GPL-2.0-or-later
//
// PopupAnimator — applies the sleek slide-and-fade popup animation (matching
// Notification Center) to all top bar menus.
//
// Animation curve:
//   Open:  translation_y: -18 -> 0, opacity: 0 -> 255, 180ms EASE_OUT_QUAD
//   Close: translation_y: 0 -> -14, opacity: 255 -> 0, 140ms EASE_IN_QUAD

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export const OPEN_DURATION_MS = 180;
export const CLOSE_DURATION_MS = 140;
export const OPEN_OFFSET_Y = -18;
export const CLOSE_OFFSET_Y = -14;

export class PopupAnimator {
    constructor() {
        this._hookedMenus = new Map();
        this._hookedMenuManager = null;
        this._origAddMenu = null;
    }

    /**
     * Hook Main.panel.menuManager so all registered and newly added panel menus
     * automatically receive the smooth slide-and-fade animation.
     */
    hookPanelMenuManager() {
        const menuManager = Main.panel?.menuManager;
        if (!menuManager || this._hookedMenuManager)
            return;

        this._hookedMenuManager = menuManager;
        const origAddMenu = menuManager.addMenu.bind(menuManager);
        this._origAddMenu = origAddMenu;

        const self = this;
        menuManager.addMenu = function (menu, position) {
            origAddMenu(menu, position);
            if (menu)
                self.attach(menu);
        };

        if (Array.isArray(menuManager._menus)) {
            for (const menu of menuManager._menus) {
                if (menu)
                    this.attach(menu);
            }
        }
    }

    /**
     * Attach Notification Center-style popup animation to a PopupMenu or PanelMenu.Button.
     * @param {PopupMenu.PopupMenu|object} target
     */
    attach(target) {
        let menu = target;
        if (target?.menu instanceof PopupMenu.PopupMenuBase)
            menu = target.menu;

        if (!menu || !menu.actor || this._hookedMenus.has(menu))
            return;

        // Skip submenus (they expand inline inside their parent menu)
        if (menu instanceof PopupMenu.PopupSubMenu)
            return;

        const boxPointer = menu._boxPointer ?? (menu.actor instanceof St.Widget ? menu.actor : null);

        if (boxPointer && typeof boxPointer.open === 'function' && typeof boxPointer.close === 'function') {
            this._attachBoxPointer(menu, boxPointer);
        } else {
            this._attachMenuFallback(menu);
        }
    }

    _shouldAnimate(animate) {
        if (!St.Settings.get().enable_animations)
            return false;
        if (animate === false || animate === 0)
            return false;
        if (typeof animate === 'object' && animate !== null && animate.animate === false)
            return false;
        return true;
    }

    _attachBoxPointer(menu, boxPointer) {
        const origBoxOpen = boxPointer.open.bind(boxPointer);
        const origBoxClose = boxPointer.close.bind(boxPointer);
        const origMenuOpen = menu.open ? menu.open.bind(menu) : null;
        const origMenuClose = menu.close ? menu.close.bind(menu) : null;
        const origMenuToggle = menu.toggle ? menu.toggle.bind(menu) : null;

        const state = {
            type: 'boxPointer',
            target: boxPointer,
            menu,
            origBoxOpen,
            origBoxClose,
            origMenuOpen,
            origMenuClose,
            origMenuToggle,
            isClosing: false,
            destroyId: 0,
        };

        const self = this;

        // Ensure actor starts at 0 opacity and OPEN_OFFSET_Y BEFORE show() is called
        if (origMenuOpen) {
            menu.open = function (params) {
                if (self._shouldAnimate(params) && !state.isClosing) {
                    boxPointer.opacity = 0;
                    boxPointer.translation_y = OPEN_OFFSET_Y;
                    boxPointer.scale_x = 1;
                    boxPointer.scale_y = 1;
                }
                return origMenuOpen(params);
            };
        }

        boxPointer.open = function (animate, onComplete) {
            boxPointer.remove_all_transitions();
            if (boxPointer._muteKeys)
                boxPointer._muteKeys.enabled = false;
            if (boxPointer._muteInput)
                boxPointer._muteInput.enabled = false;

            boxPointer.scale_x = 1;
            boxPointer.scale_y = 1;
            boxPointer.translation_x = 0;

            if (!self._shouldAnimate(animate)) {
                boxPointer.translation_y = 0;
                boxPointer.opacity = 255;
                boxPointer.show();
                if (onComplete)
                    onComplete();
                return;
            }

            // Fresh open starts at initial offset
            if (!state.isClosing) {
                boxPointer.opacity = 0;
                boxPointer.translation_y = OPEN_OFFSET_Y;
            }
            state.isClosing = false;

            boxPointer.show();

            boxPointer.ease({
                opacity: 255,
                translation_y: 0,
                scale_x: 1,
                scale_y: 1,
                duration: OPEN_DURATION_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    if (boxPointer._muteInput)
                        boxPointer._muteInput.enabled = false;
                    if (onComplete)
                        onComplete();
                },
            });
        };

        boxPointer.close = function (animate, onComplete) {
            if (!boxPointer.visible)
                return;

            if (!self._shouldAnimate(animate)) {
                state.isClosing = false;
                boxPointer.remove_all_transitions();
                boxPointer.hide();
                boxPointer.opacity = 0;
                boxPointer.translation_y = 0;
                boxPointer.scale_x = 1;
                boxPointer.scale_y = 1;
                if (boxPointer._muteInput)
                    boxPointer._muteInput.enabled = false;
                if (boxPointer._muteKeys)
                    boxPointer._muteKeys.enabled = false;
                if (onComplete)
                    onComplete();
                return;
            }

            state.isClosing = true;
            if (boxPointer._muteInput)
                boxPointer._muteInput.enabled = true;
            if (boxPointer._muteKeys)
                boxPointer._muteKeys.enabled = true;

            boxPointer.remove_all_transitions();
            boxPointer.ease({
                opacity: 0,
                translation_y: CLOSE_OFFSET_Y,
                scale_x: 1,
                scale_y: 1,
                duration: CLOSE_DURATION_MS,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => {
                    if (state.isClosing) {
                        state.isClosing = false;
                        boxPointer.hide();
                        boxPointer.opacity = 0;
                        boxPointer.translation_y = 0;
                        boxPointer.scale_x = 1;
                        boxPointer.scale_y = 1;
                        if (boxPointer._muteInput)
                            boxPointer._muteInput.enabled = false;
                        if (boxPointer._muteKeys)
                            boxPointer._muteKeys.enabled = false;
                        if (onComplete)
                            onComplete();
                    }
                },
            });
        };

        if (origMenuToggle) {
            menu.toggle = function (params) {
                if (state.isClosing) {
                    menu.open(params);
                    return;
                }
                if (menu.isOpen)
                    menu.close(params);
                else
                    menu.open(params);
            };
        }

        state.destroyId = menu.connect('destroy', () => {
            this.detach(menu);
        });

        this._hookedMenus.set(menu, state);
    }

    _attachMenuFallback(menu) {
        const actor = menu.actor;
        const origOpen = menu.open.bind(menu);
        const origClose = menu.close.bind(menu);

        const state = {
            type: 'menu',
            target: menu,
            origOpen,
            origClose,
            destroyId: 0,
        };

        const noAnimParam = ('_getPopupAnimationFromParams' in menu) ? {animate: false} : false;
        const self = this;

        menu.open = function (params) {
            actor.remove_all_transitions();
            actor.reactive = true;

            if (!self._shouldAnimate(params)) {
                actor.translation_y = 0;
                actor.opacity = 255;
                origOpen(noAnimParam);
                return;
            }

            actor.opacity = 0;
            actor.translation_y = OPEN_OFFSET_Y;
            origOpen(noAnimParam);

            actor.ease({
                opacity: 255,
                translation_y: 0,
                duration: OPEN_DURATION_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        };

        menu.close = function (params) {
            if (!menu.isOpen)
                return;

            if (!self._shouldAnimate(params) || !actor.visible) {
                actor.remove_all_transitions();
                actor.translation_y = 0;
                actor.opacity = 255;
                origClose(noAnimParam);
                return;
            }

            actor.reactive = false;
            actor.remove_all_transitions();
            actor.ease({
                opacity: 0,
                translation_y: CLOSE_OFFSET_Y,
                duration: CLOSE_DURATION_MS,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => {
                    actor.translation_y = 0;
                    actor.opacity = 255;
                    actor.reactive = true;
                    origClose(noAnimParam);
                },
            });
        };

        state.destroyId = menu.connect('destroy', () => {
            this.detach(menu);
        });

        this._hookedMenus.set(menu, state);
    }

    detach(menu) {
        const state = this._hookedMenus.get(menu);
        if (!state)
            return;

        if (state.destroyId) {
            try {
                menu.disconnect(state.destroyId);
            } catch (_e) {}
            state.destroyId = 0;
        }

        if (state.type === 'boxPointer') {
            const bp = state.target;
            bp.remove_all_transitions();
            bp.translation_y = 0;
            bp.translation_x = 0;
            bp.scale_x = 1;
            bp.scale_y = 1;
            bp.opacity = 255;
            if (bp._muteInput)
                bp._muteInput.enabled = false;
            if (bp._muteKeys)
                bp._muteKeys.enabled = false;
            bp.open = state.origBoxOpen;
            bp.close = state.origBoxClose;

            if (state.origMenuOpen)
                state.menu.open = state.origMenuOpen;
            if (state.origMenuClose)
                state.menu.close = state.origMenuClose;
            if (state.origMenuToggle)
                state.menu.toggle = state.origMenuToggle;
        } else {
            const m = state.target;
            if (m.actor) {
                m.actor.remove_all_transitions();
                m.actor.translation_y = 0;
                m.actor.opacity = 255;
                m.actor.reactive = true;
            }
            m.open = state.origOpen;
            m.close = state.origClose;
        }

        this._hookedMenus.delete(menu);
    }

    destroy() {
        if (this._hookedMenuManager && this._origAddMenu) {
            this._hookedMenuManager.addMenu = this._origAddMenu;
            this._hookedMenuManager = null;
            this._origAddMenu = null;
        }

        for (const menu of [...this._hookedMenus.keys()]) {
            this.detach(menu);
        }
        this._hookedMenus.clear();
    }
}

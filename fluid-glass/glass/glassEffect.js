// SPDX-License-Identifier: GPL-2.0-or-later
//
// glassEffect.js — Unified, plug-and-play Liquid Glass API for Fluid Glass.
//
// Provides a clean, single import to apply real GLSL backdrop glass shaders
// (blur, refraction, specular edge lighting, corner radius, tint) to ANY
// Clutter / St actor or collection of actors without boilerplate.
//
// Usage:
//   import { attachGlass, attachMultiRegionGlass } from './glassEffect.js';
//
//   // Single actor:
//   const handle = attachGlass(myWidget, { cornerRadius: 22, blurRadius: 24 });
//
//   // Multi-region (e.g. multiple floating pills with NO outer background sheet):
//   const multiHandle = attachMultiRegionGlass(menuActor, () => [tile1, tile2, slider1]);
//

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';

import { BackdropGlass } from './rendering/backdropGlass.js';
import { hexToColorArray, startSyncLoop, stopStageLoop } from './animation.js';
import {
    ensureGlassAllocated,
    placeScreenGlass,
    GLASS_SHADOW_MAX_RADIUS,
} from './actors.js';

const SHADER_PADDING = 20;

let _defaultExtensionPath = null;
let _defaultSettings = null;
let _defaultLogger = null;

/**
 * Configure shared resources once during extension initialization.
 */
export function initGlassResources(extensionPath, settings, logger) {
    _defaultExtensionPath = extensionPath;
    _defaultSettings = settings;
    _defaultLogger = logger;
}

export function getDefaultExtensionPath() {
    if (_defaultExtensionPath)
        return _defaultExtensionPath;
    const ext = Main.extensionManager?.lookup('fluid-glass@pardhu0547s.github.io') ||
                Main.extensionManager?.lookup('fluid-glass@fedora');
    if (ext?.path)
        return ext.path;
    return GLib.build_filenamev([GLib.get_user_data_dir(), 'gnome-shell', 'extensions', 'fluid-glass@pardhu0547s.github.io']);
}

export function getDefaultSettings() {
    if (_defaultSettings)
        return _defaultSettings;
    try {
        _defaultSettings = new Gio.Settings({
            schema_id: 'org.gnome.shell.extensions.fluid-glass.glass',
        });
    } catch (_e) {
        try {
            _defaultSettings = new Gio.Settings({
                schema_id: 'org.gnome.shell.extensions.liquid-glass@thinkingcoding1231.gmail.com',
            });
        } catch (_err) {
            _defaultSettings = null;
        }
    }
    return _defaultSettings;
}

/**
 * Handle controlling a live glass instance.
 */
export class GlassHandle {
    constructor(glass, targetActor, options, syncFn) {
        this.glass = glass;
        this.targetActor = targetActor;
        this.options = { ...options };
        this._syncFn = syncFn;
        this._frameSyncId = 0;
        this._frameSignalId = 0;
        this._signals = [];
        this._destroyed = false;
        this._active = false;
    }

    get _frameSlot() {
        return { get: () => this._frameSyncId, set: id => { this._frameSyncId = id; } };
    }

    get _frameSignalSlot() {
        return { get: () => this._frameSignalId, set: id => { this._frameSignalId = id; } };
    }

    start() {
        if (this._active || this._destroyed)
            return;
        this._active = true;

        const updateVisibility = () => {
            if (!this.targetActor?.mapped) {
                this.stopLoop();
                if (this.glass)
                    this.glass.hide();
            } else {
                if (this.glass)
                    this.glass.show();
                this.startLoop();
            }
        };

        if (this.targetActor) {
            this._signals.push(
                this.targetActor.connect('notify::mapped', updateVisibility),
                this.targetActor.connect('destroy', () => this.destroy())
            );
        }

        if (this.options.menu) {
            this._signals.push(
                this.options.menu.connect('open-state-changed', (_m, isOpen) => {
                    if (isOpen) {
                        if (this.glass)
                            this.glass.show();
                        this.startLoop();
                    } else {
                        this.stopLoop();
                        if (this.glass)
                            this.glass.hide();
                    }
                })
            );
        }

        updateVisibility();
    }

    startLoop() {
        if (this._frameSignalId !== 0 || !this.glass || this._destroyed)
            return;

        startSyncLoop(this._frameSignalSlot, this._frameSlot, {
            alive: () => !this._destroyed && !!this.glass && (!this.targetActor || this.targetActor.mapped),
            honourFreeze: true,
            errorTag: 'GlassHandle',
            step: () => {
                if (!this.glass || this._destroyed)
                    return;
                ensureGlassAllocated(this.glass);
                this._syncFn(this);
            },
        });
    }

    stopLoop() {
        stopStageLoop(this._frameSignalSlot, this._frameSlot);
    }

    update(newOptions = {}) {
        if (this._destroyed || !this.glass)
            return;
        this.options = { ...this.options, ...newOptions };
        applyGlassParameters(this.glass, this.options);
        if (this._syncFn)
            this._syncFn(this);
    }

    hide() {
        this.stopLoop();
        this.glass?.hide();
    }

    show() {
        this.glass?.show();
        this.startLoop();
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._active = false;

        this.stopLoop();

        for (const id of this._signals) {
            if (this.targetActor && id) {
                try {
                    this.targetActor.disconnect(id);
                } catch (_e) {}
            }
        }
        this._signals = [];

        if (this.glass) {
            try {
                this.glass.cleanup();
                const parent = this.glass.get_parent();
                if (parent)
                    parent.remove_child(this.glass);
                this.glass.destroy();
            } catch (_e) {}
            this.glass = null;
        }
    }
}

/**
 * Configure shader properties on a BackdropGlass actor.
 */
function applyGlassParameters(glass, options) {
    const cornerRadius = options.cornerRadius ?? 22.0;
    const blurRadius = options.blurRadius ?? 10;
    const tintColor = options.tintColor ?? '#ffffff';
    const tintStrength = options.tintStrength ?? 0.12;
    const brightness = options.brightness ?? 1.0;
    const contrast = options.contrast ?? 1.0;
    const saturation = options.saturation ?? 1.5;
    const padding = options.padding ?? SHADER_PADDING;

    glass.setPadding(padding);
    glass.setCornerRadius(cornerRadius);
    glass.setBlurRadius(blurRadius);
    glass.setTintColor(...hexToColorArray(tintColor));
    glass.setTintStrength(tintStrength);
    glass.setBrightness(brightness);
    glass.setContrast(contrast);
    glass.setSaturation(saturation);
}

/**
 * Parent glass actor safely into uiGroup below the widget's root window.
 */
function parentGlassActor(glass, targetActor) {
    let root = targetActor;
    while (root.get_parent() && root.get_parent() !== Main.layoutManager.uiGroup) {
        root = root.get_parent();
    }

    if (root.get_parent() === Main.layoutManager.uiGroup) {
        Main.layoutManager.uiGroup.insert_child_below(glass, root);
    } else {
        Main.layoutManager.uiGroup.add_child(glass);
    }
}

/**
 * Attach real GLSL liquid glass to a single actor.
 *
 * @param {Clutter.Actor} targetActor - The actor to attach glass to.
 * @param {Object} [options] - Glass configuration.
 * @returns {GlassHandle}
 */
export function attachGlass(targetActor, options = {}) {
    const extensionPath = options.extensionPath ?? getDefaultExtensionPath();
    const settings = options.settings ?? getDefaultSettings();
    const logger = options.logger ?? _defaultLogger;

    const glass = new BackdropGlass({
        extensionPath,
        settings,
        logger,
        owner: options.owner ?? 'glassEffect',
        outline: options.outline ?? 'panel-menu',
    });

    applyGlassParameters(glass, options);
    parentGlassActor(glass, targetActor);
    glass.hide();

    const syncFn = handle => {
        const actor = handle.targetActor;
        if (!actor || !actor.mapped) {
            handle.glass?.hide();
            return;
        }

        const [x, y] = actor.get_transformed_position();
        const [w, h] = actor.get_transformed_size();
        if (Number.isNaN(x) || Number.isNaN(y) || !(w >= 1) || !(h >= 1))
            return;

        const monitor = Main.layoutManager.findMonitorForActor(actor) ?? Main.layoutManager.primaryMonitor;
        const monitorX = monitor?.x ?? 0;
        const monitorY = monitor?.y ?? 0;
        const screenW = Math.max(1, monitor?.width ?? 1);
        const screenH = Math.max(1, monitor?.height ?? 1);

        const pad = options.padding ?? SHADER_PADDING;
        const expand = options.expand ?? 0;
        const bgW = w + expand * 2 + pad * 2;
        const bgH = h + expand * 2 + pad * 2;
        const bgX = x - expand - pad;
        const bgY = y - expand - pad;
        const localBgX = bgX - monitorX;
        const localBgY = bgY - monitorY;

        placeScreenGlass(handle.glass, monitorX, monitorY, screenW, screenH, {
            x: localBgX,
            y: localBgY,
            w: bgW,
            h: bgH,
        });
        handle.glass.setShadowMaxRadius(GLASS_SHADOW_MAX_RADIUS);
        handle.glass.setResolution(screenW, screenH);
        handle.glass.setGlassGeometry(localBgX, localBgY, bgW, bgH);
        handle.glass.syncSources();
        if (handle.glass && actor)
            handle.glass.opacity = actor.opacity;
        if (!handle.glass.visible)
            handle.glass.show();
    };

    const handle = new GlassHandle(glass, targetActor, options, syncFn);
    handle.start();
    return handle;
}

/**
 * Attach a single BackdropGlass instance running in Multi-Region mode.
 * Each child item gets real liquid glass refraction & specular highlights,
 * while the background between them remains 100% transparent desktop.
 *
 * @param {Clutter.Actor} containerActor - The overarching container / menu actor.
 * @param {Function|Array<Clutter.Actor>} getItems - Returns array of item actors.
 * @param {Object} [options] - Glass configuration.
 * @returns {GlassHandle}
 */
export function attachMultiRegionGlass(containerActor, getItems, options = {}) {
    const extensionPath = options.extensionPath ?? getDefaultExtensionPath();
    const settings = options.settings ?? getDefaultSettings();
    const logger = options.logger ?? _defaultLogger;

    const glass = new BackdropGlass({
        extensionPath,
        settings,
        logger,
        owner: options.owner ?? 'multiRegionGlass',
        outline: options.outline ?? 'panel-menu',
    });

    applyGlassParameters(glass, options);
    glass.setMultiRegionMode(true);
    parentGlassActor(glass, containerActor);
    glass.hide();

    const getActors = typeof getItems === 'function' ? getItems : () => (getItems ?? []);

    const syncFn = handle => {
        if (!containerActor || !containerActor.mapped) {
            handle.glass?.hide();
            return;
        }

        const items = getActors().filter(a => a && a.mapped);
        if (items.length === 0) {
            handle.glass?.hide();
            return;
        }

        const monitor = Main.layoutManager.findMonitorForActor(containerActor) ?? Main.layoutManager.primaryMonitor;
        const monitorX = monitor?.x ?? 0;
        const monitorY = monitor?.y ?? 0;
        const screenW = Math.max(1, monitor?.width ?? 1);
        const screenH = Math.max(1, monitor?.height ?? 1);

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        const regions = [];
        const pad = options.padding ?? SHADER_PADDING;
        const expand = options.expand ?? 0;

        const lastGoodSizes = handle._lastGoodSizes ?? (handle._lastGoodSizes = new WeakMap());

        for (const item of items) {
            const [ix, iy] = item.get_transformed_position();
            let [iw, ih] = item.get_transformed_size();
            const parent = item.get_parent?.();
            const isSlider = parent?.has_style_class_name?.('lintel-cc-sliders');
            if (isSlider) {
                const [pw] = parent.get_transformed_size();
                if (pw > iw)
                    iw = pw;
                const prev = lastGoodSizes.get(item);
                if (prev && iw < prev.w * 0.6 && prev.w >= 120) {
                    iw = prev.w;
                } else if (iw >= 40) {
                    lastGoodSizes.set(item, { w: iw, h: ih });
                }
            }
            if (Number.isNaN(ix) || Number.isNaN(iy) || !(iw >= 1) || !(ih >= 1))
                continue;

            const rx = (ix - monitorX) - expand - pad;
            const ry = (iy - monitorY) - expand - pad;
            const rw = iw + (expand * 2) + (pad * 2);
            const rh = ih + (expand * 2) + (pad * 2);

            regions.push({
                x: rx,
                y: ry,
                w: rw,
                h: rh,
                tintR: 1.0,
                tintG: 1.0,
                tintB: 1.0,
                baseStrength: 0.0,
            });

            minX = Math.min(minX, rx);
            minY = Math.min(minY, ry);
            maxX = Math.max(maxX, rx + rw);
            maxY = Math.max(maxY, ry + rh);
        }

        if (regions.length === 0 || !Number.isFinite(minX)) {
            handle.glass?.hide();
            return;
        }

        const unionW = maxX - minX;
        const unionH = maxY - minY;
        const unionX = minX;
        const unionY = minY;

        handle.glass.setGlassRegions(regions);
        placeScreenGlass(handle.glass, monitorX, monitorY, screenW, screenH, {
            x: unionX,
            y: unionY,
            w: unionW,
            h: unionH,
        });
        handle.glass.setShadowMaxRadius(GLASS_SHADOW_MAX_RADIUS);
        handle.glass.setResolution(screenW, screenH);
        handle.glass.setGlassGeometry(unionX, unionY, unionW, unionH);
        handle.glass.syncSources();
        if (handle.glass && containerActor)
            handle.glass.opacity = containerActor.opacity;
        if (!handle.glass.visible)
            handle.glass.show();
    };

    const handle = new GlassHandle(glass, containerActor, options, syncFn);
    handle.start();
    return handle;
}

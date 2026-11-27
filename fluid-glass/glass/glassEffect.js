import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';

import { BackdropGlass } from './rendering/backdropGlass.js';
import { hexToColorArray, startSyncLoop, stopStageLoop } from './animation.js';
import {
    ensureGlassAllocated,
    getAllocatedSize,
    isActorValid,
    placeScreenGlass,
    GLASS_SHADOW_MAX_RADIUS,
} from './actors.js';

export const SHADER_PADDING = 20;

let _defaultExtensionPath = null;
let _defaultSettings = null;
let _defaultLogger = null;

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
                [this.targetActor, this.targetActor.connect('notify::mapped', updateVisibility)],
                [this.targetActor, this.targetActor.connect('destroy', () => this.destroy())]
            );
        }

        if (this.options.menu) {
            this._signals.push(
                [this.options.menu, this.options.menu.connect('open-state-changed', (_m, isOpen) => {
                    if (isOpen) {
                        if (this.glass)
                            this.glass.show();
                        this.startLoop();
                    } else {
                        this.stopLoop();
                        if (this.glass)
                            this.glass.hide();
                    }
                })]
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
        this.glass.queue_redraw();
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

        for (const [source, id] of this._signals) {
            if (source && id) {
                try {
                    source.disconnect(id);
                } catch (_e) {}
            }
        }
        this._signals = [];

        if (this.glass) {
            try {
                if (isActorValid(this.glass)) {
                    this.glass.cleanup();
                    const parent = this.glass.get_parent();
                    if (parent)
                        parent.remove_child(this.glass);
                    this.glass.destroy();
                }
            } catch (_e) {}
            this.glass = null;
        }
    }
}

function applyGlassParameters(glass, options) {
    const cornerRadius = options.cornerRadius ?? 22.0;
    const blurRadius = options.blurRadius ?? 10;
    const tintColor = options.tintColor ?? '#ffffff';
    const tintStrength = options.tintStrength ?? 0.12;
    const brightness = options.brightness ?? 1.0;
    const contrast = options.contrast ?? 1.0;
    const saturation = options.saturation ?? 1.0;
    const padding = options.padding ?? SHADER_PADDING;

    glass.setPadding(padding);
    glass.setCornerRadius(cornerRadius);
    glass.setBlurRadius(blurRadius);
    glass.setTintColor(...hexToColorArray(tintColor));
    glass.setTintStrength(tintStrength);
    glass.setBrightness(brightness);
    glass.setContrast(contrast);
    glass.setSaturation(saturation);

    if (options.outlineWidth > 0) {
        const [or, og, ob] = hexToColorArray(options.outlineColor ?? '#ffffff');
        glass.setOutline?.(options.outlineWidth, or, og, ob);
    }
    if (options.tooltipPointerSide !== undefined) {
        glass.setTooltipPointer?.(
            options.tooltipPointerSide,
            options.tooltipPointerSize ?? 8.0,
            options.tooltipPointerOffset ?? 0.0
        );
    }
}

function getEffectiveOpacity(actor, stopParent = null) {
    let opacity = actor?.opacity ?? 255;
    for (let cur = actor?.get_parent?.(); cur && cur !== stopParent; cur = cur.get_parent?.()) {
        if (cur.opacity < 255)
            opacity = Math.round((opacity * cur.opacity) / 255);
        if (opacity <= 0)
            return 0;
    }
    return opacity;
}

function parentGlassActor(glass, targetActor) {
    let container = Main.layoutManager.uiGroup;
    if (Main.layoutManager.modalDialogGroup?.contains?.(targetActor)) {
        container = Main.layoutManager.modalDialogGroup;
    } else if (Main.screenShield?._dialog?._backgroundGroup &&
               Main.screenShield._dialog.contains?.(targetActor)) {
        container = Main.screenShield._dialog;
    } else if (Main.screenShield?._lockDialogGroup?.contains?.(targetActor)) {
        container = Main.screenShield._lockDialogGroup;
    } else if (Main.layoutManager.screenShieldGroup?.contains?.(targetActor)) {
        container = Main.layoutManager.screenShieldGroup;
    }

    if (targetActor === container) {
        if (container === Main.screenShield?._dialog && container._backgroundGroup) {
            container.insert_child_above(glass, container._backgroundGroup);
        } else {
            container.insert_child_at_index(glass, 0);
        }
        return;
    }

    let root = targetActor;
    while (root.get_parent() && root.get_parent() !== container) {
        root = root.get_parent();
    }

    if (root.get_parent() === container) {
        container.insert_child_below(glass, root);
    } else {
        container.add_child(glass);
    }
}

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

    glass.set_size(1, 1);
    glass.set_pivot_point(0, 0);
    applyGlassParameters(glass, options);
    parentGlassActor(glass, targetActor);
    glass.hide();

    let lastX = NaN, lastY = NaN, lastW = NaN, lastH = NaN;
    let lastMonX = NaN, lastMonY = NaN, lastScreenW = NaN, lastScreenH = NaN;
    let lastPad = NaN, lastExpand = NaN, lastOpacity = -1;
    let cachedMonitor = null;

    const resetCache = () => {
        lastX = lastY = lastW = lastH = NaN;
        lastMonX = lastMonY = lastScreenW = lastScreenH = NaN;
        lastPad = lastExpand = NaN;
        lastOpacity = -1;
        cachedMonitor = null;
    };

    const syncFn = handle => {
        const actor = handle.targetActor;
        if (!actor || !actor.mapped) {
            if (handle.glass?.visible) {
                handle.glass.hide();
                resetCache();
            }
            return;
        }

        const effOpacity = getEffectiveOpacity(actor, handle.glass?.get_parent?.() ?? null);
        if (effOpacity <= 0) {
            if (handle.glass?.visible) {
                handle.glass.hide();
                resetCache();
            }
            return;
        }

        const [x, y] = actor.get_transformed_position();
        const [w, h] = actor.get_transformed_size();
        if (Number.isNaN(x) || Number.isNaN(y) || !(w >= 1) || !(h >= 1))
            return;

        const pad = handle.options.padding ?? SHADER_PADDING;
        const expand = handle.options.expand ?? 0;
        const rectChanged = x !== lastX || y !== lastY || w !== lastW || h !== lastH ||
            pad !== lastPad || expand !== lastExpand;

        let monitor = cachedMonitor;
        if (!monitor || rectChanged || !Main.layoutManager.monitors.includes(monitor)) {
            monitor = Main.layoutManager.findMonitorForActor(actor) ?? Main.layoutManager.primaryMonitor;
            cachedMonitor = monitor;
        }
        const monitorX = monitor?.x ?? 0;
        const monitorY = monitor?.y ?? 0;
        const screenW = Math.max(1, monitor?.width ?? 1);
        const screenH = Math.max(1, monitor?.height ?? 1);

        const moved = rectChanged || monitorX !== lastMonX || monitorY !== lastMonY ||
            screenW !== lastScreenW || screenH !== lastScreenH;

        if (moved) {
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
            lastX = x;
            lastY = y;
            lastW = w;
            lastH = h;
            lastMonX = monitorX;
            lastMonY = monitorY;
            lastScreenW = screenW;
            lastScreenH = screenH;
            lastPad = pad;
            lastExpand = expand;
        }
        handle.glass.syncSources(moved);
        if (effOpacity !== lastOpacity) {
            handle.glass.opacity = effOpacity;
            lastOpacity = effOpacity;
        }
        if (!handle.glass.visible)
            handle.glass.show();
        handle.options.onSync?.(handle, moved);
    };

    const handle = new GlassHandle(glass, targetActor, options, syncFn);
    handle.start();
    return handle;
}

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

    glass.set_size(1, 1);
    glass.set_pivot_point(0, 0);
    applyGlassParameters(glass, options);
    glass.setMultiRegionMode(true);
    parentGlassActor(glass, containerActor);
    glass.hide();

    const getActors = typeof getItems === 'function' ? getItems : () => (getItems ?? []);

    let lastUnionX = NaN, lastUnionY = NaN, lastUnionW = NaN, lastUnionH = NaN;
    let lastMonX = NaN, lastMonY = NaN, lastScreenW = NaN, lastScreenH = NaN;
    let lastMaxOpacity = -1;
    let cachedMonitor = null;

    const resetCache = () => {
        lastUnionX = lastUnionY = lastUnionW = lastUnionH = NaN;
        lastMonX = lastMonY = lastScreenW = lastScreenH = NaN;
        lastMaxOpacity = -1;
        cachedMonitor = null;
    };

    const syncFn = handle => {
        if (!containerActor || !containerActor.mapped) {
            if (handle.glass?.visible) {
                handle.glass.hide();
                resetCache();
            }
            return;
        }

        const rawItems = getActors();
        let mappedCount = 0;
        for (let i = 0; i < rawItems.length; i++) {
            if (rawItems[i]?.mapped)
                mappedCount++;
        }
        if (mappedCount === 0) {
            if (handle.glass?.visible) {
                handle.glass.hide();
                resetCache();
            }
            return;
        }

        let monitor = cachedMonitor;
        if (!monitor || !Main.layoutManager.monitors.includes(monitor)) {
            monitor = Main.layoutManager.findMonitorForActor(containerActor) ?? Main.layoutManager.primaryMonitor;
            cachedMonitor = monitor;
        }
        const monitorX = monitor?.x ?? 0;
        const monitorY = monitor?.y ?? 0;
        const screenW = Math.max(1, monitor?.width ?? 1);
        const screenH = Math.max(1, monitor?.height ?? 1);

        let baseScaleX = 1.0;
        let baseScaleY = 1.0;
        for (let a = containerActor; a && a !== global.stage; a = a.get_parent?.()) {
            const [ax, ay] = a.get_scale?.() ?? [1.0, 1.0];
            if (Number.isFinite(ax) && ax > 0)
                baseScaleX *= ax;
            if (Number.isFinite(ay) && ay > 0)
                baseScaleY *= ay;
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        const regions = [];
        const pad = handle.options.padding ?? SHADER_PADDING;
        const expand = 0;
        const stopParent = handle.glass?.get_parent?.() ?? null;
        let maxOpacity = 0;

        const lastGoodSizes = handle._lastGoodSizes ?? (handle._lastGoodSizes = new WeakMap());

        for (let idx = 0; idx < rawItems.length; idx++) {
            const item = rawItems[idx];
            if (!item || !item.mapped)
                continue;
            const effOpacity = getEffectiveOpacity(item, stopParent);
            if (effOpacity <= 0)
                continue;
            if (effOpacity > maxOpacity)
                maxOpacity = effOpacity;

            const [ix, iy] = item.get_transformed_position();
            const [uw, uh] = getAllocatedSize(item);
            let scaleX = 1.0;
            let scaleY = 1.0;
            let hitContainer = false;
            for (let a = item; a && a !== global.stage; a = a.get_parent?.()) {
                if (a === containerActor) {
                    hitContainer = true;
                    break;
                }
                const [ax, ay] = a.get_scale?.() ?? [1.0, 1.0];
                if (Number.isFinite(ax) && ax > 0)
                    scaleX *= ax;
                if (Number.isFinite(ay) && ay > 0)
                    scaleY *= ay;
            }
            if (hitContainer) {
                scaleX *= baseScaleX;
                scaleY *= baseScaleY;
            }
            let iw = uw * scaleX;
            let ih = uh * scaleY;
            const parent = item.get_parent?.();
            const isSlider = item.has_style_class_name?.('fluid-glass-cc-slider') ||
                parent?.has_style_class_name?.('fluid-glass-cc-sliders');
            if (isSlider) {
                const [puw] = parent ? getAllocatedSize(parent) : [0];
                const pw = puw * scaleX;
                if (iw < 40 && pw >= 40)
                    iw = pw;
                else if (pw >= 40 && iw > pw)
                    iw = pw;
                const prev = lastGoodSizes.get(item);
                if (iw < 40 && prev && prev.w >= 40) {
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

            const isActiveCompact = Boolean(
                item.has_style_class_name?.('fluid-glass-cc-tile-compact') && item.checked
            );

            const scale = Math.min(scaleX, scaleY);
            const customR = handle.options.getCornerRadius?.(item, uw, uh);
            let baseR;
            if (Number.isFinite(customR) && customR > 0) {
                baseR = customR;
            } else {
                const halfMinUnscaled = Math.min(uw, uh) * 0.5;
                if (item.has_style_class_name?.('fluid-glass-cc-media') || halfMinUnscaled > 45.0)
                    baseR = Math.min(handle.options.cornerRadius ?? 26.0, 26.0);
                else if (isSlider || (uw * 0.5) > 105.0)
                    baseR = Math.min(halfMinUnscaled, 22.0);
                else
                    baseR = halfMinUnscaled;
            }

            regions.push({
                x: rx,
                y: ry,
                w: rw,
                h: rh,
                tintR: 1.0,
                tintG: 1.0,
                tintB: 1.0,
                baseStrength: isActiveCompact ? 0.92 : 0.0,
                cornerRadius: baseR * scale,
            });

            if (rx < minX) minX = rx;
            if (ry < minY) minY = ry;
            if (rx + rw > maxX) maxX = rx + rw;
            if (ry + rh > maxY) maxY = ry + rh;
        }

        if (regions.length === 0 || maxOpacity <= 0 || !Number.isFinite(minX)) {
            if (handle.glass?.visible) {
                handle.glass.hide();
                resetCache();
            }
            return;
        }

        const unionW = maxX - minX;
        const unionH = maxY - minY;
        const unionX = minX;
        const unionY = minY;

        handle.glass.setGlassRegions(regions);
        const moved = unionX !== lastUnionX || unionY !== lastUnionY ||
            unionW !== lastUnionW || unionH !== lastUnionH ||
            monitorX !== lastMonX || monitorY !== lastMonY ||
            screenW !== lastScreenW || screenH !== lastScreenH;
        if (moved) {
            placeScreenGlass(handle.glass, monitorX, monitorY, screenW, screenH, {
                x: unionX,
                y: unionY,
                w: unionW,
                h: unionH,
            });
            handle.glass.setShadowMaxRadius(GLASS_SHADOW_MAX_RADIUS);
            handle.glass.setResolution(screenW, screenH);
            handle.glass.setGlassGeometry(unionX, unionY, unionW, unionH);
            lastUnionX = unionX;
            lastUnionY = unionY;
            lastUnionW = unionW;
            lastUnionH = unionH;
            lastMonX = monitorX;
            lastMonY = monitorY;
            lastScreenW = screenW;
            lastScreenH = screenH;
        }
        handle.glass.syncSources(moved);
        if (maxOpacity !== lastMaxOpacity) {
            handle.glass.opacity = maxOpacity;
            lastMaxOpacity = maxOpacity;
        }
        if (!handle.glass.visible)
            handle.glass.show();
        handle.options.onSync?.(handle, moved);
    };

    const handle = new GlassHandle(glass, containerActor, options, syncFn);
    handle.start();
    return handle;
}
